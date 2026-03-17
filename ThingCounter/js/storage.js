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

// ── Local helpers ──

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

// ── loadData ──
// Returns { games: [...] } from localStorage immediately.
// If online, fetches the game list (id, name, updated_at) from Supabase and
// merges any games that exist remotely but not locally.

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

        let changed = false;
        for (const row of rows) {
            const exists = local.games.find(g => g.id === row.id);
            if (!exists) {
                const {data: full} = await supabase
                    .from(TABLE)
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

// ── loadGame ──
// Loads a single game's full data. Checks for collision between local and remote.
// Returns { game, collision } where collision is null or { localTime, remoteTime, remoteData }.

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