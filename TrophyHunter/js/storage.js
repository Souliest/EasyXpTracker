// TrophyHunter/js/storage.js
// Hybrid storage — localStorage for immediate reads, Supabase for persistence.
//
// LOCAL STORAGE SHAPE (v2)
// ─────────────────────────────────────────────────────────────────────────────
// Personal game state stored under STORAGE_KEY ('bgt:trophy-hunter:v2'):
// {
//   version:  2,
//   index:    [ { id, name, last_modified, platform } ],  // always complete — drives selector
//   blobs:    { [id]: fullGameObject },                   // LRU cache, max 5 entries
//   lruOrder: [ id, ... ],                                // most-recently-accessed first
// }
//
// loadData() returns { index, blobs }. Callers use index for the selector;
// blobs[id] gives the full game object for the selected game.
//
// Catalog data (PSN trophy lists) uses a separate shared table and a local LRU
// cache — this is unchanged from v1.
//
// The legacy key ('bgt:trophy-hunter:data') is deleted by the v1→v2 migration
// in common/migrations.js, which runs automatically on first load.

import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';
import {
    runMigrations, cacheGet, cacheSet, cacheDelete, updateIndex,
    TOOL_CONFIG, CURRENT_VERSION,
} from '../../common/migrations.js';
import {workerResolve, workerContribute, ORBIS_SEARCH_URL, PROSPERO_SEARCH_URL} from './psn.js';

// ── Storage key constants ─────────────────────────────────────────────────────

export const STORAGE_KEY = TOOL_CONFIG.trophyHunter.storageKey;
export const STORAGE_SELECTED = 'bgt:trophy-hunter:selected-game';
export const STORAGE_CATALOG_CACHE = 'bgt:trophy-hunter:catalog-cache';

const CATALOG_CACHE_SIZE = 3;

const CFG = TOOL_CONFIG.trophyHunter;
const TABLE_GAMES = 'bgt_trophy_hunter_games';
const TABLE_CATALOG = 'bgt_trophy_hunter_catalog';
const TABLE_LOOKUP = 'bgt_trophy_hunter_lookup';

export {WORKER_URL, workerFetchTrophies} from './psn.js';

// ── Realtime ──────────────────────────────────────────────────────────────────

export const REALTIME_ENABLED = true;

let _realtimeChannel = null;

export function subscribeToGameChanges(userId, onRemoteUpdate) {
    if (!REALTIME_ENABLED) return;
    if (!userId) return;

    unsubscribeFromGameChanges();

    _realtimeChannel = supabase
        .channel('trophy-hunter-games')
        .on(
            'postgres_changes',
            {event: 'UPDATE', schema: 'public', table: TABLE_GAMES, filter: `user_id=eq.${userId}`},
            payload => {
                const remoteGame = payload.new?.data;
                const remoteUpdatedAt = payload.new?.updated_at;
                if (!remoteGame || !remoteUpdatedAt) return;
                onRemoteUpdate(remoteGame, remoteUpdatedAt);
            }
        )
        .subscribe();
}

export function unsubscribeFromGameChanges() {
    if (_realtimeChannel) {
        supabase.removeChannel(_realtimeChannel);
        _realtimeChannel = null;
    }
}

// ── Title normalisation ───────────────────────────────────────────────────────

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
    return tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return token;
        if (i === 0 || i === lastWordIdx || !LOWERCASE_WORDS.has(token)) {
            return token.charAt(0).toUpperCase() + token.slice(1);
        }
        return token;
    }).join('');
}

// ── Local helpers — personal state ────────────────────────────────────────────

function _localLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
            {version: CURRENT_VERSION, index: [], blobs: {}, lruOrder: []};
    } catch {
        return {version: CURRENT_VERSION, index: [], blobs: {}, lruOrder: []};
    }
}

export function localSave(stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

// ── Local helpers — catalog cache (LRU, max 3 entries) ───────────────────────
// Unchanged from v1.

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
    return catalogCacheLoad().find(c => c.npCommId === npCommId) || null;
}

function catalogCacheSet(npCommId, entry) {
    let cache = catalogCacheLoad().filter(c => c.npCommId !== npCommId);
    cache.unshift({npCommId, cachedAt: new Date().toISOString(), entry});
    if (cache.length > CATALOG_CACHE_SIZE) cache = cache.slice(0, CATALOG_CACHE_SIZE);
    catalogCacheSave(cache);
}

// ── loadData ──────────────────────────────────────────────────────────────────
// Returns { index, blobs }.
//
// index — always the complete list of the user's games (id, name, platform,
//         last_modified). Drives the selector dropdown.
//
// blobs — the LRU blob cache (up to 5 full game objects).
//
// Remote sync: same pattern as LGT/ThingCounter — lightweight list first,
// then batched blob fetch for missing/stale games.

export async function loadData() {
    runMigrations(CFG);

    const stored = _localLoad();
    const user = getUser();

    if (!user) return {index: stored.index, blobs: stored.blobs};

    try {
        const {data: rows, error} = await supabase
            .from(TABLE_GAMES)
            .select('id, name, updated_at')
            .eq('user_id', user.id);

        if (error || !rows) return {index: stored.index, blobs: stored.blobs};

        const missingIds = [];
        const staleIds = [];

        for (const row of rows) {
            const local = stored.index.find(e => e.id === row.id);
            if (!local) {
                missingIds.push(row.id);
            } else {
                const localTime = local.last_modified ? new Date(local.last_modified) : null;
                const remoteTime = row.updated_at ? new Date(row.updated_at) : null;
                if (!localTime || (remoteTime && remoteTime > localTime)) {
                    staleIds.push(row.id);
                }
            }
        }

        const idsToFetch = [...missingIds, ...staleIds];

        if (idsToFetch.length > 0) {
            const {data: fullRows} = await supabase
                .from(TABLE_GAMES)
                .select('id, data, updated_at')
                .in('id', idsToFetch)
                .eq('user_id', user.id);

            if (fullRows) {
                for (const row of fullRows) {
                    if (!row.data) continue;
                    const game = {...row.data, last_modified: row.updated_at};
                    if (missingIds.includes(row.id) || stored.blobs[row.id]) {
                        cacheSet(stored, game, CFG);
                    } else {
                        updateIndex(stored, game, CFG);
                    }
                }
                localSave(stored);
            }
        }
    } catch {
        // Network unavailable — return local silently.
    }

    return {index: stored.index, blobs: stored.blobs};
}

// ── loadGame ──────────────────────────────────────────────────────────────────

export async function loadGame(gameId) {
    runMigrations(CFG);

    const stored = _localLoad();
    const user = getUser();

    // ── Cache hit ──
    const cached = cacheGet(stored, gameId);
    if (cached) {
        localSave(stored);

        if (!user) return {game: cached, collision: null};

        try {
            const {data: row, error} = await supabase
                .from(TABLE_GAMES)
                .select('data, updated_at')
                .eq('id', gameId)
                .eq('user_id', user.id)
                .single();

            if (error || !row) return {game: cached, collision: null};

            const localTime = cached.last_modified ? new Date(cached.last_modified) : null;
            const remoteTime = row.updated_at ? new Date(row.updated_at) : null;

            if (!localTime) {
                await saveGame(cached);
                return {game: cached, collision: null};
            }

            if (Math.abs(localTime - remoteTime) <= 5000) {
                return {game: cached, collision: null};
            }

            return {
                game: cached,
                collision: {
                    localTime: localTime.toISOString(),
                    remoteTime: remoteTime.toISOString(),
                    remoteData: row.data,
                },
            };
        } catch {
            return {game: cached, collision: null};
        }
    }

    // ── Cache miss — fetch full blob from Supabase ──
    if (!user) return {game: null, collision: null};

    try {
        const {data: row, error} = await supabase
            .from(TABLE_GAMES)
            .select('data, updated_at')
            .eq('id', gameId)
            .eq('user_id', user.id)
            .single();

        if (error || !row || !row.data) return {game: null, collision: null};

        const game = {...row.data, last_modified: row.updated_at};
        cacheSet(stored, game, CFG);
        localSave(stored);

        return {game, collision: null};
    } catch {
        return {game: null, collision: null};
    }
}

// ── saveData ──────────────────────────────────────────────────────────────────

export async function saveData(stored, changedGameId) {
    localSave(stored);
    const user = getUser();
    if (!user) return;

    try {
        if (changedGameId) {
            const game = stored.blobs[changedGameId];
            if (game) await saveGame(game);
        } else {
            for (const game of Object.values(stored.blobs)) {
                await saveGame(game);
            }
        }
    } catch {
        // Network unavailable — localStorage write already succeeded.
    }
}

// ── saveGame ──────────────────────────────────────────────────────────────────

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
        // Network unavailable — swallow silently.
    }

    const stored = _localLoad();
    if (stored.blobs[game.id]) {
        cacheSet(stored, game, CFG);
    } else {
        updateIndex(stored, game, CFG);
    }
    localSave(stored);
}

// ── resolveCollision ──────────────────────────────────────────────────────────

export async function resolveCollision(gameId, winner, remoteData) {
    const stored = _localLoad();

    if (winner === 'remote' && remoteData) {
        cacheSet(stored, remoteData, CFG);
        localSave(stored);
    } else if (winner === 'local') {
        const game = stored.blobs[gameId];
        if (game) await saveGame(game);
    }
}

// ── deleteGame ────────────────────────────────────────────────────────────────

export async function deleteGame(gameId) {
    const stored = _localLoad();
    cacheDelete(stored, gameId);
    localSave(stored);

    const user = getUser();
    if (!user) return;

    try {
        await supabase.from(TABLE_GAMES).delete().eq('id', gameId).eq('user_id', user.id);
    } catch {
        // Network unavailable — local delete already succeeded.
    }
}

// ── Catalog — loadCatalogEntry / saveCatalogEntry ─────────────────────────────
// Unchanged from v1.

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
    supabase.from(TABLE_CATALOG).select('*').eq('np_comm_id', npCommId).single()
        .then(({data, error}) => {
            if (!error && data) catalogCacheSet(npCommId, _rowToEntry(data));
        })
        .catch(() => {
        });
}

export async function loadCatalogEntry(npCommId) {
    const cached = catalogCacheGet(npCommId);
    if (cached) {
        _refreshCatalogCacheInBackground(npCommId);
        return cached.entry;
    }
    try {
        const {data, error} = await supabase.from(TABLE_CATALOG).select('*').eq('np_comm_id', npCommId).single();
        if (error || !data) return null;
        const entry = _rowToEntry(data);
        catalogCacheSet(npCommId, entry);
        return entry;
    } catch {
        return null;
    }
}

export function saveCatalogEntry(entry) {
    catalogCacheSet(entry.npCommId, entry);
}

// ── Lookup table ──────────────────────────────────────────────────────────────

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

// ── Catalog search ────────────────────────────────────────────────────────────

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

// ── 4-step search flow ────────────────────────────────────────────────────────

export async function runSearch(query, userId) {
    const trimmed = query.trim();

    const catalogResults = await searchCatalog(trimmed);
    if (catalogResults.length > 0) return {results: catalogResults, needsUsername: false, source: 'catalog'};

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
        } catch { /* fall through to step 4 */
        }
    }

    return {results: [], needsUsername: true, source: null};
}

export async function runContribute(query, username, userId) {
    const trimmed = query.trim();
    try {
        await workerContribute(username, userId);
    } catch (err) {
        throw new Error(`Could not fetch ${username}'s library: ${err.message}`);
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

// ── Private helpers ───────────────────────────────────────────────────────────

async function _searchPatchSites(query) {
    const encoded = encodeURIComponent(query);
    const titleIds = new Set();
    const [ps4, ps5] = await Promise.all([
        fetch(`${ORBIS_SEARCH_URL}?term=${encoded}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${PROSPERO_SEARCH_URL}?term=${encoded}`).then(r => r.ok ? r.json() : null).catch(() => null),
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

// ── Initial game state factory ────────────────────────────────────────────────

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
        viewState: {sort: 'psn', filter: 'all', ungrouped: false, collapsedGroups: []},
        last_modified: null,
    };
}

// ── Merge catalog update ──────────────────────────────────────────────────────

export function mergeCatalogUpdate(game, newCatalogEntry) {
    const existingState = game.trophyState || {};
    const newTrophyState = {};
    let addedCount = 0;
    const newIds = new Set();

    for (const group of newCatalogEntry.groups) {
        for (const trophy of group.trophies) {
            const id = String(trophy.trophyId);
            newIds.add(id);
            newTrophyState[id] = existingState[id] || {earned: false, pinned: false};
            if (!existingState[id]) addedCount++;
        }
    }

    let orphanedCount = 0;
    for (const id of Object.keys(existingState)) {
        if (!newIds.has(id)) {
            newTrophyState[id] = {...existingState[id], orphaned: true};
            orphanedCount++;
        }
    }

    return {updatedGame: {...game, trophyState: newTrophyState}, addedCount, orphanedCount};
}