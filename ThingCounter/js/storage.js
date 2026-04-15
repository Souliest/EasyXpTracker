// ThingCounter/js/storage.js
// Hybrid storage — localStorage for immediate reads, Supabase for persistence across devices.
// loadData / saveData / deleteGame are async. All other modules await them.

import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';

// ── localStorage keys ──

export const STORAGE_KEY = 'bgt:thing-counter:data';
export const STORAGE_SELECTED = 'bgt:thing-counter:selected-game';
export const STORAGE_QC_VAL = 'bgt:thing-counter:quick-counter-val';
export const STORAGE_QC_STEP = 'bgt:thing-counter:quick-counter-step';
export const STORAGE_QC_COLOR = 'bgt:thing-counter:quick-counter-color';

const TABLE = 'bgt_thing_counter_games';

// ── Realtime ──
// Set to false to fall back to load-on-select sync only.

export const REALTIME_ENABLED = true;

let _realtimeChannel = null;

// Subscribe to UPDATE events for the signed-in user's games.
// onRemoteUpdate(row) is called with the raw Supabase postgres_changes payload.new.
export function subscribeToGameChanges(userId, onRemoteUpdate) {
    if (!REALTIME_ENABLED) return;
    unsubscribeFromGameChanges();

    _realtimeChannel = supabase
        .channel('tc-games-' + userId)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: TABLE,
                filter: `user_id=eq.${userId}`,
            },
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

// ── Local helpers ──

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

// ── loadData ──
// Returns { games: [...] } from localStorage immediately.
// If online, fetches the full remote game list and:
//   - Adds any games that exist remotely but not locally.
//   - Updates any local games where the remote version is strictly newer
//     (remote updated_at > local last_modified).
// This ensures all devices converge to the freshest data on every load.

export async function loadData() {
    const local = localLoad();
    const user = getUser();
    if (!user) return local;

    try {
        const {data: rows, error} = await supabase
            .from(TABLE)
            .select('id, name, updated_at')
            .eq('user_id', user.id);

        if (error || !rows) return local;

        const missingIds = [];
        const staleIds = [];

        for (const row of rows) {
            const localGame = local.games.find(g => g.id === row.id);
            if (!localGame) {
                missingIds.push(row.id);
            } else {
                // No local timestamp → treat as stale so last_modified gets stamped.
                const localTime = localGame.last_modified ? new Date(localGame.last_modified) : null;
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
                    const remoteGame = {...row.data, last_modified: row.updated_at};
                    const idx = local.games.findIndex(g => g.id === row.id);
                    if (idx !== -1) {
                        local.games[idx] = remoteGame;
                    } else {
                        local.games.push(remoteGame);
                    }
                }
                localSave(local);
            }
        }
    } catch {
        // Network unavailable — return local silently
    }

    return local;
}

// ── loadGame ──

export async function loadGame(gameId) {
    const local = localLoad();
    const localGame = local.games.find(g => g.id === gameId) || null;
    const user = getUser();

    if (!user || !localGame) return {game: localGame, collision: null};

    try {
        const {data: row, error} = await supabase
            .from(TABLE)
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

// ── saveData ──
// Writes the full games array to localStorage.
// Pass changedGameId to upsert only that one game to Supabase (fast path).
// All call sites in ThingCounter know which game changed and pass its ID.

export async function saveData(data, changedGameId) {
    localSave(data);
    const user = getUser();
    if (!user) return;

    try {
        if (changedGameId) {
            const game = data.games.find(g => g.id === changedGameId);
            if (game) await saveGame(game);
        } else {
            // Fallback: upsert all (should not be reached in normal usage).
            for (const game of data.games) {
                await saveGame(game);
            }
        }
    } catch {
        // Network unavailable — localStorage write already succeeded
    }
}

// ── saveGame ──

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
        // Network unavailable — swallow silently
    }

    const local = localLoad();
    const idx = local.games.findIndex(g => g.id === game.id);
    if (idx !== -1) {
        local.games[idx] = game;
        localSave(local);
    }
}

// ── resolveCollision ──

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

// ── deleteGame ──

export async function deleteGame(gameId) {
    const local = localLoad();
    local.games = local.games.filter(g => g.id !== gameId);
    localSave(local);

    const user = getUser();
    if (!user) return;

    try {
        await supabase.from(TABLE).delete().eq('id', gameId).eq('user_id', user.id);
    } catch {
        // Network unavailable — local delete already succeeded
    }
}