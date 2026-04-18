// ThingCounter/js/storage.js
// Hybrid storage — localStorage for immediate reads, Supabase for persistence across devices.
//
// LOCAL STORAGE SHAPE (v2)
// ─────────────────────────────────────────────────────────────────────────────
// Stored under STORAGE_KEY ('bgt:thing-counter:v2'):
// {
//   version:  2,
//   index:    [ { id, name, last_modified } ],   // always complete — drives the selector
//   blobs:    { [id]: fullGameObject },           // LRU cache, max 5 entries
//   lruOrder: [ id, ... ],                        // most-recently-accessed first
// }
//
// loadData() returns { index, blobs }. Callers use index for the selector and
// retrieve specific game blobs from blobs[id].
//
// The legacy key ('bgt:thing-counter:data') is deleted by the v1→v2 migration
// in common/migrations.js, which runs automatically on first load.

import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';
import {
    runMigrations, cacheGet, cacheSet, cacheDelete, updateIndex,
    TOOL_CONFIG, CURRENT_VERSION,
} from '../../common/migrations.js';

// ── Storage key and tool config ───────────────────────────────────────────────

export const STORAGE_KEY = TOOL_CONFIG.thingCounter.storageKey;
export const STORAGE_SELECTED = 'bgt:thing-counter:selected-game';
export const STORAGE_QC_VAL = 'bgt:thing-counter:quick-counter-val';
export const STORAGE_QC_STEP = 'bgt:thing-counter:quick-counter-step';
export const STORAGE_QC_COLOR = 'bgt:thing-counter:quick-counter-color';

const CFG = TOOL_CONFIG.thingCounter;
const TABLE = 'bgt_thing_counter_games';

// ── Realtime ──────────────────────────────────────────────────────────────────

export const REALTIME_ENABLED = true;

let _realtimeChannel = null;

export function subscribeToGameChanges(userId, onRemoteUpdate) {
    if (!REALTIME_ENABLED) return;
    unsubscribeFromGameChanges();

    _realtimeChannel = supabase
        .channel('tc-games-' + userId)
        .on(
            'postgres_changes',
            {event: 'UPDATE', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}`},
            payload => onRemoteUpdate(payload.new),
        )
        .subscribe();
}

export function unsubscribeFromGameChanges() {
    if (_realtimeChannel) {
        supabase.removeChannel(_realtimeChannel);
        _realtimeChannel = null;
    }
}

// ── Local helpers ─────────────────────────────────────────────────────────────

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

// ── loadData ──────────────────────────────────────────────────────────────────
// Returns { index, blobs }.
//
// index — always the complete list of the user's games (id + display fields).
//         Built from localStorage immediately; merged with the remote game list
//         so that games added on other devices appear in the selector.
//
// blobs — the LRU blob cache (up to 5 full game objects). Callers must not
//         assume a blob exists for every index entry.
//
// Remote sync: fetches id + name + updated_at for all remote games, identifies
// index entries that are missing or stale, and fetches their full blobs in one
// batched query. Stale local blobs are replaced; missing games are added to both
// the index and the blob cache.

export async function loadData() {
    runMigrations(CFG);

    const stored = _localLoad();
    const user = getUser();

    if (!user) return {index: stored.index, blobs: stored.blobs};

    try {
        const {data: rows, error} = await supabase
            .from(TABLE)
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
                .from(TABLE)
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
// Returns { game, collision }.
//
// Checks the local blob cache first. On a cache miss, fetches the full blob
// from Supabase and warms the cache. Collision detection compares
// last_modified (local index) against updated_at (Supabase).

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
                .from(TABLE)
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
            .from(TABLE)
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
        await supabase.from(TABLE).upsert({
            id: game.id,
            user_id: user.id,
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
        await supabase.from(TABLE).delete().eq('id', gameId).eq('user_id', user.id);
    } catch {
        // Network unavailable — local delete already succeeded.
    }
}