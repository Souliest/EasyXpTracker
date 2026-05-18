// ChecklistManager/js/storage.js
// Hybrid storage — localStorage for immediate reads, Supabase for persistence across devices.
// Follows the same pattern as ThingCounter/js/storage.js.
//
// LOCAL STORAGE SHAPE (v2)
// ─────────────────────────────────────────────────────────────────────────────
// Stored under STORAGE_KEY ('bgt:clm:v2'):
// {
//   version:  2,
//   index:    [ { id, name, last_modified } ],   // always complete — drives the selector
//   blobs:    { [id]: fullProjectObject },        // LRU cache, max 5 entries
//   lruOrder: [ id, ... ],                        // most-recently-accessed first
// }

import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';
import {
    runMigrations, cacheGet, cacheSet, cacheDelete, updateIndex,
    TOOL_CONFIG, localLoad,
} from '../../common/migrations.js';
import {createRealtimeSubscription} from '../../common/realtime.js';

// ── Storage keys and tool config ──────────────────────────────────────────────

export const STORAGE_KEY = TOOL_CONFIG.checklistManager.storageKey;
export const STORAGE_SELECTED = 'bgt:clm:selected-project';

const CFG = TOOL_CONFIG.checklistManager;
const TABLE = 'bgt_clm_projects';

// ── Realtime ──────────────────────────────────────────────────────────────────

const _rt = createRealtimeSubscription('clm-projects', TABLE);
export const subscribeToProjectChanges = _rt.subscribe;
export const unsubscribeFromProjectChanges = _rt.unsubscribe;

// ── Local helpers ─────────────────────────────────────────────────────────────

const _localLoad = () => localLoad(STORAGE_KEY);

export function localSave(stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

// ── loadData ──────────────────────────────────────────────────────────────────
// Returns { index, blobs }.
// Merges remote index on load so projects added on other devices appear in the
// selector. Full blobs fetched only for missing or stale entries.

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
                    const project = {...row.data, last_modified: row.updated_at};
                    if (missingIds.includes(row.id) || stored.blobs[row.id]) {
                        cacheSet(stored, project, CFG);
                    } else {
                        updateIndex(stored, project, CFG);
                    }
                }
                localSave(stored);
            }
        }

        // Remove local projects deleted on another device while offline.
        const remoteIds = new Set(rows.map(r => r.id));
        const deletedIds = stored.index
            .filter(e => !remoteIds.has(e.id))
            .map(e => e.id);
        if (deletedIds.length > 0) {
            for (const id of deletedIds) cacheDelete(stored, id);
            localSave(stored);
        }
    } catch {
        // Network unavailable — return local silently.
    }

    return {index: stored.index, blobs: stored.blobs};
}

// ── loadProject ───────────────────────────────────────────────────────────────
// Returns { project, collision }.
// Cache hit: compare timestamps, return collision object if diverged > 5s.
// Cache miss: fetch full blob from Supabase and warm the cache.

export async function loadProject(projectId) {
    runMigrations(CFG);

    const stored = _localLoad();
    const user = getUser();

    // ── Cache hit ──
    const cached = cacheGet(stored, projectId);
    if (cached) {
        localSave(stored);

        if (!user) return {project: cached, collision: null};

        try {
            const {data: row, error} = await supabase
                .from(TABLE)
                .select('data, updated_at')
                .eq('id', projectId)
                .eq('user_id', user.id)
                .single();

            if (error || !row) return {project: cached, collision: null};

            const localTime = cached.last_modified ? new Date(cached.last_modified) : null;
            const remoteTime = row.updated_at ? new Date(row.updated_at) : null;

            if (!localTime) {
                await _saveProject(cached);
                return {project: cached, collision: null};
            }

            if (Math.abs(localTime - remoteTime) <= 5000) {
                return {project: cached, collision: null};
            }

            return {
                project: cached,
                collision: {
                    localTime: localTime.toISOString(),
                    remoteTime: remoteTime.toISOString(),
                    remoteData: row.data,
                },
            };
        } catch {
            return {project: cached, collision: null};
        }
    }

    // ── Cache miss — fetch full blob ──
    if (!user) return {project: null, collision: null};

    try {
        const {data: row, error} = await supabase
            .from(TABLE)
            .select('data, updated_at')
            .eq('id', projectId)
            .eq('user_id', user.id)
            .single();

        if (error || !row || !row.data) return {project: null, collision: null};

        const project = {...row.data, last_modified: row.updated_at};
        cacheSet(stored, project, CFG);
        localSave(stored);

        return {project, collision: null};
    } catch {
        return {project: null, collision: null};
    }
}

// ── saveData ──────────────────────────────────────────────────────────────────

export async function saveData(stored, changedProjectId) {
    localSave(stored);
    const user = getUser();
    if (!user) return;

    try {
        if (changedProjectId) {
            const project = stored.blobs[changedProjectId];
            if (project) await _saveProject(project);
        } else {
            for (const project of Object.values(stored.blobs)) {
                await _saveProject(project);
            }
        }
    } catch {
        // Network unavailable — localStorage write already succeeded.
    }
}

// ── _saveProject (internal) ───────────────────────────────────────────────────

async function _saveProject(project) {
    const user = getUser();
    if (!user) return;

    const now = new Date().toISOString();
    project.last_modified = now;

    try {
        await supabase.from(TABLE).upsert({
            id: project.id,
            user_id: user.id,
            name: project.name,
            data: project,
            updated_at: now,
        }, {onConflict: 'id'});
    } catch {
        // Network unavailable — swallow silently.
    }

    const stored = _localLoad();
    if (stored.blobs[project.id]) {
        cacheSet(stored, project, CFG);
    } else {
        updateIndex(stored, project, CFG);
    }
    localSave(stored);
}

// ── resolveCollision ──────────────────────────────────────────────────────────

export async function resolveCollision(projectId, winner, remoteData) {
    const stored = _localLoad();

    if (winner === 'remote' && remoteData) {
        cacheSet(stored, remoteData, CFG);
        localSave(stored);
    } else if (winner === 'local') {
        const project = stored.blobs[projectId];
        if (project) await _saveProject(project);
    }
}

// ── deleteProject ─────────────────────────────────────────────────────────────

export async function deleteProject(projectId) {
    const stored = _localLoad();
    cacheDelete(stored, projectId);
    localSave(stored);

    const user = getUser();
    if (!user) return;

    try {
        await supabase.from(TABLE).delete()
            .eq('id', projectId)
            .eq('user_id', user.id);
    } catch {
        // Network unavailable — local delete already succeeded.
    }
}
