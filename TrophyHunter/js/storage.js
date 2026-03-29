// TrophyHunter/js/storage.js
// Hybrid storage — localStorage for immediate reads, Supabase for persistence.
// Catalog data (PSN trophy lists) uses a separate shared table and a local LRU cache.
// Personal game state uses the same per-user pattern as LevelGoalTracker and ThingCounter.

import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';

// ── Storage key constants ──
export const STORAGE_KEY = 'bgt:trophy-hunter:data';
export const STORAGE_SELECTED = 'bgt:trophy-hunter:selected-game';
export const STORAGE_CATALOG_CACHE = 'bgt:trophy-hunter:catalog-cache';

const CATALOG_CACHE_SIZE = 3;

const TABLE_GAMES = 'bgt_trophy_hunter_games';
const TABLE_CATALOG = 'bgt_trophy_hunter_catalog';
const TABLE_LOOKUP = 'bgt_trophy_hunter_lookup';

export const WORKER_URL = 'https://bgt-psn-proxy.souliest.workers.dev';
export const ORBIS_SEARCH_URL = 'https://orbispatches.com/api/internal/search';
export const PROSPERO_SEARCH_URL = 'https://prosperopatches.com/api/internal/search';

// ═══════════════════════════════════════════════
// Realtime sync flag
// Set to true to enable live cross-device sync via Supabase Realtime.
// Set to false to revert to the previous behaviour (sync on load/game-select only).
// Requires the bgt_trophy_hunter_games table to have Update events enabled
// under Database → Publications → supabase_realtime in the Supabase dashboard.
// ═══════════════════════════════════════════════

export const REALTIME_ENABLED = true;

// ── Realtime channel handle ──
let _realtimeChannel = null;

// ═══════════════════════════════════════════════
// Realtime subscription
// ═══════════════════════════════════════════════

// subscribeToGameChanges — opens a Realtime channel for the signed-in user.
// onRemoteUpdate(gameData) is called when a newer remote version of a game
// arrives from another device. The caller is responsible for deciding whether
// to apply the update (e.g. skip if a local debounce timer is running).

export function subscribeToGameChanges(userId, onRemoteUpdate) {
    if (!REALTIME_ENABLED) return;
    if (!userId) return;

    // Tear down any existing channel before opening a new one.
    unsubscribeFromGameChanges();

    _realtimeChannel = supabase
        .channel('trophy-hunter-games')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: TABLE_GAMES,
                filter: `user_id=eq.${userId}`,
            },
            payload => {
                const remoteGame = payload.new?.data;
                const remoteUpdatedAt = payload.new?.updated_at;
                if (!remoteGame || !remoteUpdatedAt) return;
                onRemoteUpdate(remoteGame, remoteUpdatedAt);
            }
        )
        .subscribe();
}

// unsubscribeFromGameChanges — tears down the Realtime channel cleanly.
// Call on sign-out or when the component unmounts.

export function unsubscribeFromGameChanges() {
    if (_realtimeChannel) {
        supabase.removeChannel(_realtimeChannel);
        _realtimeChannel = null;
    }
}

// ═══════════════════════════════════════════════
// Title normalisation
// ═══════════════════════════════════════════════

const LOWERCASE_WORDS = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
    'at', 'by', 'in', 'of', 'on', 'to', 'up', 'as', 'is',
]);

export function stripSearchNoise(str) {
    if (!str) return '';
    return str
        .replace(/[\u2122\u00AE\u00A9]/g, '')
        .replace(/[:\-\u2013\u2014]/g, ' ')
        .replace(/[\u2018\u2019\u201C\u201D"']/g, '')
        .replace(/[!?.]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normaliseTitle(str) {
    if (!str) return '';
    const s = str.replace(/[\u2018\u2019`\u2032]/g, "'").trim();
    const tokens = s.toLowerCase().split(/(\s+)/);
    let lastWordIdx = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (!/^\s+$/.test(tokens[i])) {
            lastWordIdx = i;
            break;
        }
    }
    return tokens
        .map((token, i) => {
            if (/^\s+$/.test(token)) return token;
            if (i === 0 || i === lastWordIdx || !LOWERCASE_WORDS.has(token)) {
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

export function localSave(data) {
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

export async function searchCatalog(query) {
    if (!query || query.trim().length < 2) return [];

    try {
        const {data, error} = await supabase
            .from(TABLE_CATALOG)
            .select('np_comm_id, name, platform, icon_url')
            .ilike('name', `%${stripSearchNoise(normaliseTitle(query.trim()))}%`)
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

export async function searchLookupTable(query) {
    if (!query || query.trim().length < 2) return [];

    try {
        const {data, error} = await supabase
            .from(TABLE_LOOKUP)
            .select('np_comm_id, title_name, platform, np_service_name')
            .ilike('title_name', `%${stripSearchNoise(normaliseTitle(query.trim()))}%`)
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
            .insert(rows, {onConflict: 'np_comm_id', ignoreDuplicates: true});
    } catch {
        // Network unavailable — not fatal
    }
}

// ═══════════════════════════════════════════════
// 4-step search flow
// ═══════════════════════════════════════════════

export async function runSearch(query, userId) {
    const trimmed = query.trim();

    const catalogResults = await searchCatalog(trimmed);
    if (catalogResults.length > 0) {
        return {results: catalogResults, needsUsername: false, source: 'catalog'};
    }

    const lookupResults = await searchLookupTable(trimmed);
    if (lookupResults.length > 0) {
        const results = lookupResults.map(r => ({
            npCommId: r.npCommId,
            name: r.titleName,
            platform: _platformFromService(r.platform, r.npServiceName),
            iconUrl: null,
        }));
        return {results, needsUsername: false, source: 'lookup'};
    }

    const titleIds = await _searchPatchSites(trimmed);
    if (titleIds.length > 0) {
        try {
            const {mappings} = await workerResolve(titleIds, userId);
            if (mappings && mappings.length > 0) {
                await saveLookupEntries(mappings);
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
            // fall through to step 4
        }
    }

    return {results: [], needsUsername: true, source: null};
}

export async function runContribute(query, username, userId) {
    const trimmed = query.trim();

    let contribution;
    try {
        contribution = await workerContribute(username, userId);
    } catch (err) {
        throw new Error(`Could not fetch ${username}'s library: ${err.message}`);
    }

    if (contribution.mappings && contribution.mappings.length > 0) {
        await saveLookupEntries(contribution.mappings);
    }

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

async function _searchPatchSites(query) {
    const encoded = encodeURIComponent(query);
    const titleIds = new Set();

    const [ps4, ps5] = await Promise.all([
        fetch(`${ORBIS_SEARCH_URL}?term=${encoded}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
        fetch(`${PROSPERO_SEARCH_URL}?term=${encoded}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
    ]);

    for (const result of (ps4?.results || [])) {
        if (result.titleid) titleIds.add(`${result.titleid}_00`);
    }
    for (const result of (ps5?.results || [])) {
        if (result.titleid) titleIds.add(`${result.titleid}_00`);
    }

    return [...titleIds];
}

function _platformFromService(platform, npServiceName) {
    if (platform) return platform;
    return npServiceName === 'trophy2' ? 'PS5' : 'PS4';
}

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
            collapsedGroups: [],
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