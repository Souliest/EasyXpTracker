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

// ── Cloudflare Worker URL ──
// Replace YOUR_ACCOUNT with your Cloudflare account subdomain.
// Find it in the Cloudflare dashboard after deploying the Worker.
export const WORKER_URL = 'https://bgt-psn-proxy.souliest.workers.dev';

// Guard: catch the placeholder before it silently fails at fetch time.
function _assertWorkerUrl() {
    if (WORKER_URL.includes('YOUR_ACCOUNT')) {
        throw new Error(
            'WORKER_URL is not configured. ' +
            'Edit TrophyHunter/js/storage.js and replace YOUR_ACCOUNT ' +
            'with your Cloudflare account subdomain.'
        );
    }
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
    // Remove existing entry for this id if present
    cache = cache.filter(c => c.npCommId !== npCommId);
    // Prepend new entry
    cache.unshift({npCommId, cachedAt: new Date().toISOString(), entry});
    // Trim to max size
    if (cache.length > CATALOG_CACHE_SIZE) {
        cache = cache.slice(0, CATALOG_CACHE_SIZE);
    }
    catalogCacheSave(cache);
}

// ═══════════════════════════════════════════════
// Personal data — loadData / saveData
// ═══════════════════════════════════════════════

// Returns { games: [...] } from localStorage immediately.
// If signed in, merges any games that exist remotely but not locally.

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

// Loads a single game with collision detection.
// Returns { game, collision } — collision is null or { localTime, remoteTime, remoteData }.

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
        const THRESHOLD_MS = 5000;

        if (diffMs <= THRESHOLD_MS) {
            return {game: localGame, collision: null};
        }

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

    // Persist the updated last_modified locally
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

// Loads a catalog entry. Checks local LRU cache first, then Supabase.
// Returns the entry or null if unavailable.

export async function loadCatalogEntry(npCommId) {
    // 1. Check local cache first (works offline)
    const cached = catalogCacheGet(npCommId);
    if (cached) {
        // Warm the cache position to most-recent even on local hit
        // (entry already exists — the find + unshift happens in catalogCacheSet)
        // Try to refresh from Supabase in the background if online
        _refreshCatalogCacheInBackground(npCommId);
        return cached.entry;
    }

    // 2. Try Supabase
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

// Upserts a catalog entry to Supabase and updates local cache.
// Called after a successful Worker trophy fetch.

export async function saveCatalogEntry(entry) {
    // Always update local cache immediately
    catalogCacheSet(entry.npCommId, entry);

    const user = getUser();
    if (!user) return;  // anonymous users can read catalog but not write

    try {
        await supabase.from(TABLE_CATALOG).upsert({
            np_comm_id: entry.npCommId,
            name: entry.name,
            platform: entry.platform,
            icon_url: entry.iconUrl || null,
            groups: entry.groups,
            fetched_at: new Date().toISOString(),
        }, {onConflict: 'np_comm_id'});
    } catch {
        // Network unavailable — local cache write already succeeded
    }
}

// Searches the catalog by name (contains match).
// Returns array of { npCommId, name, platform, iconUrl }.

export async function searchCatalog(query) {
    if (!query || query.trim().length < 2) return [];

    try {
        const {data, error} = await supabase
            .from(TABLE_CATALOG)
            .select('np_comm_id, name, platform, icon_url')
            .ilike('name', `%${query.trim()}%`)
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
// PSN Worker calls
// ═══════════════════════════════════════════════

// Calls the Worker search endpoint.
// Returns array of { npCommId, name, platform, iconUrl }.

export async function workerSearch(query, userId) {
    _assertWorkerUrl();
    const url = new URL(`${WORKER_URL}/search`);
    url.searchParams.set('q', query);

    const headers = {'Content-Type': 'application/json'};
    if (userId) headers['X-User-Id'] = userId;

    const res = await fetch(url.toString(), {headers});
    if (!res.ok) {
        const err = await res.json().catch(() => ({error: 'Unknown error'}));
        throw new Error(err.error || `Worker search failed: ${res.status}`);
    }

    return res.json();
}

// Calls the Worker trophies endpoint.
// Returns the full catalog entry object.

export async function workerFetchTrophies(npCommId, platform, userId) {
    _assertWorkerUrl();
    const url = new URL(`${WORKER_URL}/trophies`);
    url.searchParams.set('id', npCommId);
    url.searchParams.set('platform', platform);

    const headers = {'Content-Type': 'application/json'};
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

// Background refresh — updates catalog cache from Supabase without blocking render.
function _refreshCatalogCacheInBackground(npCommId) {
    supabase
        .from(TABLE_CATALOG)
        .select('*')
        .eq('np_comm_id', npCommId)
        .single()
        .then(({data, error}) => {
            if (!error && data) {
                catalogCacheSet(npCommId, _rowToEntry(data));
            }
        })
        .catch(() => {
            // Silently ignore — cache already served the entry
        });
}

// ═══════════════════════════════════════════════
// Initial game state factory
// ═══════════════════════════════════════════════

// Creates a fresh personal game entry from a catalog entry.
// All trophies start unearned and unpinned.

export function createGameEntry(catalogEntry) {
    const trophyState = {};
    for (const group of catalogEntry.groups) {
        for (const trophy of group.trophies) {
            trophyState[String(trophy.trophyId)] = {
                earned: false,
                pinned: false,
            };
        }
    }

    return {
        id: crypto.randomUUID(),
        npCommId: catalogEntry.npCommId,
        name: catalogEntry.name,
        platform: catalogEntry.platform,
        trophyState,
        viewState: {
            sort: 'psn',    // 'psn' | 'alpha' | 'grade'
            filter: 'all',    // 'all' | 'earned' | 'unearned'
            ungrouped: false,
        },
        last_modified: null,
    };
}

// ═══════════════════════════════════════════════
// Merge catalog update into personal state
// ═══════════════════════════════════════════════

// Called after a "Refresh from PSN" — merges new trophy data into existing personal state.
// New trophies: added as unearned/unpinned.
// Missing trophies (removed from PSN): flagged as orphaned.
// Returns { updatedGame, addedCount, orphanedCount }.

export function mergeCatalogUpdate(game, newCatalogEntry) {
    const existingState = game.trophyState || {};
    const newTrophyState = {};
    let addedCount = 0;

    // Build set of all trophy IDs in new catalog
    const newIds = new Set();
    for (const group of newCatalogEntry.groups) {
        for (const trophy of group.trophies) {
            const id = String(trophy.trophyId);
            newIds.add(id);
            if (existingState[id]) {
                // Preserve existing earned/pinned state
                newTrophyState[id] = existingState[id];
            } else {
                // New trophy — add as unearned/unpinned
                newTrophyState[id] = {earned: false, pinned: false};
                addedCount++;
            }
        }
    }

    // Check for orphaned trophies (in personal state but not in new catalog)
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