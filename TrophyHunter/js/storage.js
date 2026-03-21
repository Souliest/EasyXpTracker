// TrophyHunter/js/storage.js
// Hybrid storage — localStorage for immediate reads, Supabase for persistence.
// Catalog data (PSN trophy lists) uses a separate shared table and a local LRU cache.
// Personal game state uses the same per-user pattern as LevelGoalTracker and ThingCounter.

import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';

// ── Storage key constants ──
// Never use these strings inline elsewhere — always import the constant.

export const STORAGE_KEY = 'bgt:trophy-hunter:data';
export const STORAGE_SELECTED = 'bgt:trophy-hunter:selected-game';
export const STORAGE_CATALOG_CACHE = 'bgt:trophy-hunter:catalog-cache';

// ── Catalog cache size ──
const CATALOG_CACHE_SIZE = 3;

// ── Supabase table names ──
const TABLE_GAMES = 'bgt_trophy_hunter_games';
const TABLE_CATALOG = 'bgt_trophy_hunter_catalog';
const TABLE_LOOKUP = 'bgt_trophy_hunter_lookup';

// ── Cloudflare Worker URL ──
export const WORKER_URL = 'https://bgt-psn-proxy.souliest.workers.dev';

// ── Patch site search URLs ──
const ORBIS_SEARCH_URL = 'https://orbispatches.com/api/internal/search';
const PROSPERO_SEARCH_URL = 'https://prosperopatches.com/api/internal/search';

// ═══════════════════════════════════════════════
// Title normalisation
// Applied before saving to Supabase and before searching.
// Converts to Title Case and normalises apostrophe variants to straight quote.
// ═══════════════════════════════════════════════

const LOWERCASE_WORDS = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
    'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'is',
]);

export function normaliseTitle(str) {
    if (!str) return '';

    // Normalise apostrophe variants (curly, backtick, prime) to straight quote
    const s = str.replace(/[''`′]/g, "'").trim();

    return s
        .toLowerCase()
        .split(/(\s+)/)                    // split on whitespace, preserving runs
        .map((token, i) => {
            // Preserve whitespace tokens unchanged
            if (/^\s+$/.test(token)) return token;
            // Always capitalise first and last real word; skip articles etc in between
            if (i === 0 || LOWERCASE_WORDS.has(token) === false) {
                return token.charAt(0).toUpperCase() + token.slice(1);
            }
            return token;
        })
        .join('');
}

// ═══════════════════════════════════════════════
// Local helpers — personal state
// ═══════════════════════════════════════════════

function localLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {games: []};
    } catch {
        return {games: []};
    }
}

function localSave(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ═══════════════════════════════════════════════
// Local helpers — catalog cache (LRU, max 3 entries)
// ═══════════════════════════════════════════════

function catalogCacheLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_CATALOG_CACHE)) || [];
    } catch {
        return [];
    }
}

function catalogCacheSave(cache) {
    localStorage.setItem(STORAGE_CATALOG_CACHE, JSON.stringify(cache));
}

function catalogCacheGet(npCommId) {
    const cache = catalogCacheLoad();
    return cache.find(c => c.npCommId === npCommId) || null;
}

function catalogCacheSet(npCommId, entry) {
    let cache = catalogCacheLoad();
    cache = cache.filter(c => c.npCommId !== npCommId);
    cache.unshift({npCommId, cachedAt: new Date().toISOString(), entry});
    if (cache.length > CATALOG_CACHE_SIZE) cache = cache.slice(0, CATALOG_CACHE_SIZE);
    catalogCacheSave(cache);
}

// ═══════════════════════════════════════════════
// Personal data — loadData / saveData
// ═══════════════════════════════════════════════

export async function loadData() {
    const local = localLoad();
    const user = getUser();
    if (!user) return local;

    try {
        const {data: rows, error} = await supabase
            .from(TABLE_GAMES)
            .select('id, name, updated_at')
            .eq('user_id', user.id);

        if (error || !rows) return local;

        let changed = false;
        for (const row of rows) {
            const exists = local.games.find(g => g.id === row.id);
            if (!exists) {
                const {data: full} = await supabase
                    .from(TABLE_GAMES)
                    .select('data')
                    .eq('id', row.id)
                    .single();
                if (full && full.data) {
                    local.games.push({...full.data, last_modified: row.updated_at});
                    changed = true;
                }
            }
        }

        if (changed) localSave(local);
    } catch {
        // Network unavailable — return local silently
    }

    return local;
}

export async function saveData(data) {
    localSave(data);
    const user = getUser();
    if (!user) return;

    try {
        for (const game of data.games) {
            await saveGame(game);
        }
    } catch {
        // Network unavailable — localStorage write already succeeded
    }
}

// ═══════════════════════════════════════════════
// Personal data — loadGame / saveGame
// ═══════════════════════════════════════════════

export async function loadGame(gameId) {
    const local = localLoad();
    const localGame = local.games.find(g => g.id === gameId) || null;
    const user = getUser();

    if (!user || !localGame) return {game: localGame, collision: null};

    try {
        const {data: row, error} = await supabase
            .from(TABLE_GAMES)
            .select('data, updated_at')
            .eq('id', gameId)
            .eq('user_id', user.id)
            .single();

        if (error || !row) return {game: localGame, collision: null};

        const localTime = localGame.last_modified ? new Date(localGame.last_modified) : null;
        const remoteTime = row.updated_at ? new Date(row.updated_at) : null;

        if (!localTime) {
            await saveGame(localGame);
            return {game: localGame, collision: null};
        }

        const diffMs = Math.abs(localTime - remoteTime);
        if (diffMs <= 5000) return {game: localGame, collision: null};

        return {
            game: localGame,
            collision: {
                localTime: localTime.toISOString(),
                remoteTime: remoteTime.toISOString(),
                remoteData: row.data,
            },
        };
    } catch {
        return {game: localGame, collision: null};
    }
}

export async function saveGame(game) {
    const user = getUser();
    if (!user) return;

    const now = new Date().toISOString();
    game.last_modified = now;

    try {
        await supabase.from(TABLE_GAMES).upsert({
            id: game.id,
            user_id: user.id,
            np_comm_id: game.npCommId,
            name: game.name,
            data: game,
            updated_at: now,
        }, {onConflict: 'id'});
    } catch {
        // Network unavailable — swallow silently
    }

    const local = localLoad();
    const idx = local.games.findIndex(g => g.id === game.id);
    if (idx !== -1) {
        local.games[idx] = game;
        localSave(local);
    }
}

export async function resolveCollision(gameId, winner, remoteData) {
    const local = localLoad();
    const idx = local.games.findIndex(g => g.id === gameId);

    if (winner === 'remote' && remoteData) {
        if (idx !== -1) local.games[idx] = remoteData;
        else local.games.push(remoteData);
        localSave(local);
    } else if (winner === 'local' && idx !== -1) {
        await saveGame(local.games[idx]);
    }
}

export async function deleteGame(gameId) {
    const local = localLoad();
    local.games = local.games.filter(g => g.id !== gameId);
    localSave(local);

    const user = getUser();
    if (!user) return;

    try {
        await supabase
            .from(TABLE_GAMES)
            .delete()
            .eq('id', gameId)
            .eq('user_id', user.id);
    } catch {
        // Network unavailable — local delete already succeeded
    }
}

// ═══════════════════════════════════════════════
// Catalog — loadCatalogEntry / saveCatalogEntry
// ═══════════════════════════════════════════════

export async function loadCatalogEntry(npCommId) {
    const cached = catalogCacheGet(npCommId);
    if (cached) {
        _refreshCatalogCacheInBackground(npCommId);
        return cached.entry;
    }

    try {
        const {data, error} = await supabase
            .from(TABLE_CATALOG)
            .select('*')
            .eq('np_comm_id', npCommId)
            .single();

        if (error || !data) return null;

        const entry = _rowToEntry(data);
        catalogCacheSet(npCommId, entry);
        return entry;
    } catch {
        return null;
    }
}

export async function saveCatalogEntry(entry) {
    catalogCacheSet(entry.npCommId, entry);

    const user = getUser();
    if (!user) return;

    try {
        await supabase.from(TABLE_CATALOG).upsert({
            np_comm_id: entry.npCommId,
            name: normaliseTitle(entry.name),
            platform: entry.platform,
            icon_url: entry.iconUrl || null,
            groups: entry.groups,
            fetched_at: new Date().toISOString(),
        }, {onConflict: 'np_comm_id'});
    } catch {
        // Network unavailable — local cache write already succeeded
    }
}

// Searches the full trophy catalog by name.
// Returns array of { npCommId, name, platform, iconUrl }.

export async function searchCatalog(query) {
    if (!query || query.trim().length < 2) return [];

    try {
        const {data, error} = await supabase
            .from(TABLE_CATALOG)
            .select('np_comm_id, name, platform, icon_url')
            .ilike('name', `%${normaliseTitle(query.trim())}%`)
            .limit(10);

        if (error || !data) return [];

        return data.map(row => ({
            npCommId: row.np_comm_id,
            name: row.name,
            platform: row.platform,
            iconUrl: row.icon_url || null,
        }));
    } catch {
        return [];
    }
}

// ═══════════════════════════════════════════════
// Lookup table — searchLookupTable / saveLookupEntries
// ═══════════════════════════════════════════════

// Step 2 of the search flow: search bgt_trophy_hunter_lookup by name.
// Returns array of { npCommId, npServiceName, titleName, platform }.

export async function searchLookupTable(query) {
    if (!query || query.trim().length < 2) return [];

    try {
        const {data, error} = await supabase
            .from(TABLE_LOOKUP)
            .select('np_comm_id, title_name, platform, np_service_name')
            .ilike('title_name', `%${normaliseTitle(query.trim())}%`)
            .limit(10);

        if (error || !data) return [];

        return data.map(row => ({
            npCommId: row.np_comm_id,
            titleName: row.title_name,
            platform: row.platform,
            npServiceName: row.np_service_name,
        }));
    } catch {
        return [];
    }
}

// Upserts an array of { npCommId, npServiceName, titleName, platform } mappings
// into the lookup table. Called after /resolve or /contribute returns new mappings.
// ON CONFLICT DO NOTHING — never overwrites existing entries.

export async function saveLookupEntries(mappings) {
    if (!mappings || mappings.length === 0) return;

    const rows = mappings
        .filter(m => m.npCommId && m.titleName)
        .map(m => ({
            np_comm_id: m.npCommId,
            title_name: normaliseTitle(m.titleName),
            platform: m.platform || '',
            np_service_name: m.npServiceName || 'trophy',
        }));

    if (rows.length === 0) return;

    try {
        await supabase
            .from(TABLE_LOOKUP)
            .upsert(rows, {onConflict: 'np_comm_id', ignoreDuplicates: true});
    } catch {
        // Network unavailable — not fatal, lookup table fills up passively
    }
}

// ═══════════════════════════════════════════════
// 4-step search flow
// ═══════════════════════════════════════════════
//
// Step 1 — searchCatalog()         full trophy data already cached → return immediately
// Step 2 — searchLookupTable()     NPWR known → call /trophies → save to catalog
// Step 3 — patch sites + /resolve  CUSA/PPSA → NPWR → save to lookup → call /trophies
// Step 4 — /contribute             username → full library → save to lookup → retry step 2
//
// Returns { results, needsUsername }
//   results       — array of { npCommId, name, platform, iconUrl } ready for the modal
//   needsUsername — true when steps 1–3 all failed; modal should show username input

export async function runSearch(query, userId) {
    const trimmed = query.trim();

    // ── Step 1: full catalog ──────────────────────────────────────────────
    const catalogResults = await searchCatalog(trimmed);
    if (catalogResults.length > 0) {
        return {results: catalogResults, needsUsername: false, source: 'catalog'};
    }

    // ── Step 2: lookup table → /trophies ─────────────────────────────────
    const lookupResults = await searchLookupTable(trimmed);
    if (lookupResults.length > 0) {
        // Resolve each NPWR to a search result shape.
        // The lookup table has the name and platform — enough for the modal.
        const results = lookupResults.map(r => ({
            npCommId: r.npCommId,
            name: r.titleName,
            platform: _platformFromService(r.platform, r.npServiceName),
            iconUrl: null,  // not stored in lookup table; fetched on add
        }));
        return {results, needsUsername: false, source: 'lookup'};
    }

    // ── Step 3: patch sites → /resolve ───────────────────────────────────
    const titleIds = await _searchPatchSites(trimmed);
    if (titleIds.length > 0) {
        try {
            const {mappings} = await workerResolve(titleIds, userId);
            if (mappings && mappings.length > 0) {
                // Save new mappings to lookup table passively
                await saveLookupEntries(mappings);

                // Deduplicate by npCommId — multiple regional CUSAs map to same NPWR
                const seen = new Set();
                const results = [];
                for (const m of mappings) {
                    if (seen.has(m.npCommId)) continue;
                    seen.add(m.npCommId);
                    results.push({
                        npCommId: m.npCommId,
                        name: normaliseTitle(m.titleName) || normaliseTitle(trimmed),
                        platform: _platformFromTitleId(m.npTitleId, m.npServiceName),
                        iconUrl: null,
                    });
                }
                return {results, needsUsername: false, source: 'resolve'};
            }
        } catch {
            // /resolve failed — fall through to step 4
        }
    }

    // ── Step 4: need a username ───────────────────────────────────────────
    return {results: [], needsUsername: true, source: null};
}

// Runs /contribute for a given username, saves new mappings, then retries
// the lookup table search. Returns { results } for the modal.

export async function runContribute(query, username, userId) {
    const trimmed = query.trim();

    let contribution;
    try {
        contribution = await workerContribute(username, userId);
    } catch (err) {
        throw new Error(`Could not fetch ${username}'s library: ${err.message}`);
    }

    // Save all new mappings to lookup table
    if (contribution.mappings && contribution.mappings.length > 0) {
        await saveLookupEntries(contribution.mappings);
    }

    // Retry lookup table search now that it's been enriched
    const lookupResults = await searchLookupTable(trimmed);
    if (lookupResults.length > 0) {
        return lookupResults.map(r => ({
            npCommId: r.npCommId,
            name: r.titleName,
            platform: _platformFromService(r.platform, r.npServiceName),
            iconUrl: null,
        }));
    }

    return [];
}

// ═══════════════════════════════════════════════
// Worker calls
// ═══════════════════════════════════════════════

// Calls /resolve with up to 25 CUSA/PPSA IDs.
// Returns { mappings: [{ npTitleId, npCommId, npServiceName, titleName, platform }] }

export async function workerResolve(titleIds, userId) {
    const url = new URL(`${WORKER_URL}/resolve`);
    url.searchParams.set('ids', titleIds.join(','));

    const headers = {};
    if (userId) headers['X-User-Id'] = userId;

    const res = await fetch(url.toString(), {headers});
    if (!res.ok) {
        const err = await res.json().catch(() => ({error: 'Unknown error'}));
        throw new Error(err.error || `Worker resolve failed: ${res.status}`);
    }
    return res.json();
}

// Calls /contribute with a PSN username.
// Returns { username, accountId, mappings: [{ npCommId, npServiceName, titleName, platform }] }

export async function workerContribute(username, userId) {
    const url = new URL(`${WORKER_URL}/contribute`);
    url.searchParams.set('username', username);

    const headers = {};
    if (userId) headers['X-User-Id'] = userId;

    const res = await fetch(url.toString(), {method: 'POST', headers});
    if (!res.ok) {
        const err = await res.json().catch(() => ({error: 'Unknown error'}));
        throw new Error(err.error || `Worker contribute failed: ${res.status}`);
    }
    return res.json();
}

// Calls /trophies for a given NPWR + platform.
// Returns the full catalog entry object.

export async function workerFetchTrophies(npCommId, platform, userId) {
    const url = new URL(`${WORKER_URL}/trophies`);
    url.searchParams.set('id', npCommId);
    url.searchParams.set('platform', platform);

    const headers = {};
    if (userId) headers['X-User-Id'] = userId;

    const res = await fetch(url.toString(), {headers});
    if (!res.ok) {
        const err = await res.json().catch(() => ({error: 'Unknown error'}));
        throw new Error(err.error || `Worker trophy fetch failed: ${res.status}`);
    }
    return res.json();
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

function _rowToEntry(row) {
    return {
        npCommId: row.np_comm_id,
        name: row.name,
        platform: row.platform,
        iconUrl: row.icon_url || null,
        groups: row.groups,
        fetchedAt: row.fetched_at,
    };
}

function _refreshCatalogCacheInBackground(npCommId) {
    supabase
        .from(TABLE_CATALOG)
        .select('*')
        .eq('np_comm_id', npCommId)
        .single()
        .then(({data, error}) => {
            if (!error && data) catalogCacheSet(npCommId, _rowToEntry(data));
        })
        .catch(() => {
        });
}

// Searches OrbisPatches (PS4) and ProsperoPatches (PS5) for a query.
// Returns array of title IDs with _00 suffix ready for /resolve.

async function _searchPatchSites(query) {
    const encoded = encodeURIComponent(query);
    const titleIds = new Set();

    const fetches = [
        fetch(`${ORBIS_SEARCH_URL}?term=${encoded}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
        fetch(`${PROSPERO_SEARCH_URL}?term=${encoded}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
    ];

    const [ps4, ps5] = await Promise.all(fetches);

    for (const result of (ps4?.results || [])) {
        if (result.titleid) titleIds.add(`${result.titleid}_00`);
    }
    for (const result of (ps5?.results || [])) {
        if (result.titleid) titleIds.add(`${result.titleid}_00`);
    }

    return [...titleIds];
}

// Derives a display platform string from the npServiceName.
// Used when trophyTitlePlatform is absent (e.g. from /resolve responses).

function _platformFromService(platform, npServiceName) {
    if (platform) return platform;
    return npServiceName === 'trophy2' ? 'PS5' : 'PS4';
}

// Derives platform from a CUSA/PPSA title ID prefix.
// PPSA → PS5, CUSA → PS4. Falls back to npServiceName.

function _platformFromTitleId(npTitleId, npServiceName) {
    if (npTitleId && npTitleId.startsWith('PPSA')) return 'PS5';
    if (npTitleId && npTitleId.startsWith('CUSA')) return 'PS4';
    return _platformFromService('', npServiceName);
}

// ═══════════════════════════════════════════════
// Initial game state factory
// ═══════════════════════════════════════════════

export function createGameEntry(catalogEntry) {
    const trophyState = {};
    for (const group of catalogEntry.groups) {
        for (const trophy of group.trophies) {
            trophyState[String(trophy.trophyId)] = {earned: false, pinned: false};
        }
    }

    return {
        id: crypto.randomUUID(),
        npCommId: catalogEntry.npCommId,
        name: catalogEntry.name,
        platform: catalogEntry.platform,
        trophyState,
        viewState: {
            sort: 'psn',
            filter: 'all',
            ungrouped: false,
        },
        last_modified: null,
    };
}

// ═══════════════════════════════════════════════
// Merge catalog update into personal state
// ═══════════════════════════════════════════════

export function mergeCatalogUpdate(game, newCatalogEntry) {
    const existingState = game.trophyState || {};
    const newTrophyState = {};
    let addedCount = 0;

    const newIds = new Set();
    for (const group of newCatalogEntry.groups) {
        for (const trophy of group.trophies) {
            const id = String(trophy.trophyId);
            newIds.add(id);
            if (existingState[id]) {
                newTrophyState[id] = existingState[id];
            } else {
                newTrophyState[id] = {earned: false, pinned: false};
                addedCount++;
            }
        }
    }

    let orphanedCount = 0;
    for (const id of Object.keys(existingState)) {
        if (!newIds.has(id)) {
            newTrophyState[id] = {...existingState[id], orphaned: true};
            orphanedCount++;
        }
    }

    const updatedGame = {...game, trophyState: newTrophyState};
    return {updatedGame, addedCount, orphanedCount};
}