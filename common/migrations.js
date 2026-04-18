// common/migrations.js
// Silent, automatic, permanent schema migrations for all hybrid-storage tools.
//
// HOW IT WORKS
// ─────────────────────────────────────────────────────────────────────────────
// Each tool calls runMigrations(toolConfig) at the very top of loadData(),
// before anything else reads localStorage. runMigrations reads the stored
// version stamp, runs every migration function from that version up to
// CURRENT_VERSION in sequence, writes the result back, and returns.
//
// Migration functions are pure transforms: (stored) → stored. They chain
// automatically, so a user who skips intermediate versions catches up in one
// load. Migration code is NEVER deleted — a user on v1 who loads v3 runs
// v1→v2 then v2→v3 in sequence.
//
// ADDING A NEW MIGRATION
// ─────────────────────────────────────────────────────────────────────────────
// 1. Increment CURRENT_VERSION.
// 2. Add a new case to the switch in runMigrations:
//
//      case 2: stored = migrateV2toV3_toolName(stored, toolConfig); break;
//
// 3. Write the pure transform function below the existing ones.
// 4. Update architecture.md with the new version and what changed.
//
// STORED SHAPE (v2, all hybrid tools)
// ─────────────────────────────────────────────────────────────────────────────
// {
//   version: 2,
//   index:   [ { id, name, last_modified, ...displayMeta } ],  // always complete
//   blobs:   { [id]: fullGameObject },                         // LRU, max 5
//   lruOrder: [ id, id, ... ],                                 // most-recent first
// }
//
// v1 shape was { games: [ fullGameObject, ... ] } with no version stamp,
// stored under a per-tool legacy key (see LEGACY_KEYS below).

export const CURRENT_VERSION = 2;

// ── Tool configs ─────────────────────────────────────────────────────────────
// Each tool passes one of these into runMigrations.

export const TOOL_CONFIG = {
    levelGoalTracker: {
        legacyKey: 'bgt:level-goal-tracker:data',
        storageKey: 'bgt:level-goal-tracker:v2',
        // Fields kept in the index (everything else lives in the blob only).
        indexFields: ['id', 'name', 'last_modified'],
    },
    thingCounter: {
        legacyKey: 'bgt:thing-counter:data',
        storageKey: 'bgt:thing-counter:v2',
        indexFields: ['id', 'name', 'last_modified'],
    },
    trophyHunter: {
        legacyKey: 'bgt:trophy-hunter:data',
        storageKey: 'bgt:trophy-hunter:v2',
        // platform is needed to render the selector label "[name] [platform]"
        indexFields: ['id', 'name', 'last_modified', 'platform'],
    },
};

export const BLOB_CACHE_SIZE = 5;

// ── Migration runner ──────────────────────────────────────────────────────────

export function runMigrations(toolConfig) {
    const raw = localStorage.getItem(toolConfig.storageKey);
    let stored = null;

    if (raw) {
        try {
            stored = JSON.parse(raw);
        } catch {
            stored = null;
        }
    }

    // Determine starting version.
    // A stored object with no version field is post-migration debris — treat as
    // current so we don't accidentally re-run migrations on a partially-written store.
    const startVersion = stored ? (stored.version ?? CURRENT_VERSION) : 0;

    if (startVersion === CURRENT_VERSION && stored) return; // nothing to do

    // Version 0 means nothing is stored yet under the new key at all.
    // Initialise to the empty v2 shape and let the v1 migration populate it
    // from the legacy key (if one exists).
    if (startVersion === 0) {
        stored = {version: 0, index: [], blobs: {}, lruOrder: []};
    }

    let version = startVersion;
    while (version < CURRENT_VERSION) {
        switch (version) {
            case 0:
            case 1:
                stored = _migrateToV2(stored, toolConfig);
                version = 2;
                break;
            // case 2: stored = _migrateToV3(stored, toolConfig); version = 3; break;
            default:
                // Unknown version — bail out to avoid data corruption.
                console.warn(`[migrations] Unknown schema version ${version} for ${toolConfig.storageKey}. Skipping.`);
                return;
        }
    }

    stored.version = CURRENT_VERSION;
    localStorage.setItem(toolConfig.storageKey, JSON.stringify(stored));
}

// ── v1 → v2 ──────────────────────────────────────────────────────────────────
// v1 shape: { games: [ fullGameObject, ... ] } under the legacy key.
//   OR: version 0 meaning the new key is empty and we should check the legacy key.
// v2 shape: { version, index, blobs, lruOrder } under the new key.
//
// After migrating, the legacy key is deleted.

function _migrateToV2(stored, toolConfig) {
    // Try to read legacy data. If there is none, start empty.
    let games = [];
    const legacyRaw = localStorage.getItem(toolConfig.legacyKey);
    if (legacyRaw) {
        try {
            const legacy = JSON.parse(legacyRaw);
            if (Array.isArray(legacy.games)) games = legacy.games;
        } catch { /* corrupted — start empty */
        }
    }

    // Build index (lightweight entries) and seed the blob cache with up to
    // BLOB_CACHE_SIZE games, most-recently-modified first. We want the cache
    // pre-warm so the first game-select after migration doesn't require a
    // Supabase round-trip for recently active games.
    const sorted = [...games].sort((a, b) => {
        const ta = a.last_modified ? new Date(a.last_modified) : new Date(0);
        const tb = b.last_modified ? new Date(b.last_modified) : new Date(0);
        return tb - ta; // newest first
    });

    const index = games.map(g => _toIndexEntry(g, toolConfig));
    const blobs = {};
    const lruOrder = [];

    for (const g of sorted.slice(0, BLOB_CACHE_SIZE)) {
        blobs[g.id] = g;
        lruOrder.push(g.id);
    }

    // Delete the legacy key — no dead keys.
    localStorage.removeItem(toolConfig.legacyKey);

    return {version: 2, index, blobs, lruOrder};
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toIndexEntry(game, toolConfig) {
    const entry = {};
    for (const field of toolConfig.indexFields) {
        if (game[field] !== undefined) entry[field] = game[field];
    }
    return entry;
}

// ── LRU cache helpers — used by storage.js files ─────────────────────────────
// These operate on the stored v2 object in-place and return it.

// Read a blob from the cache. Returns the game object or null.
// Promotes the entry to the front of lruOrder.
export function cacheGet(stored, id) {
    const blob = stored.blobs[id];
    if (!blob) return null;
    _lruTouch(stored, id);
    return blob;
}

// Write a blob into the cache. Evicts the LRU entry if the cache is full.
export function cacheSet(stored, game, toolConfig) {
    const id = game.id;
    const isNew = !stored.blobs[id];

    stored.blobs[id] = game;

    if (isNew) {
        stored.lruOrder.unshift(id);
        // Evict if over the limit.
        while (stored.lruOrder.length > BLOB_CACHE_SIZE) {
            const evictId = stored.lruOrder.pop();
            delete stored.blobs[evictId];
            // Index entry is intentionally preserved.
        }
    } else {
        _lruTouch(stored, id);
    }

    // Keep the index entry current.
    _updateIndex(stored, game, toolConfig);
}

// Remove a game entirely (index + blob).
export function cacheDelete(stored, id) {
    delete stored.blobs[id];
    stored.lruOrder = stored.lruOrder.filter(i => i !== id);
    stored.index = stored.index.filter(e => e.id !== id);
}

// Update (or insert) an index entry without touching the blob cache.
export function updateIndex(stored, game, toolConfig) {
    _updateIndex(stored, game, toolConfig);
}

// ── Private ───────────────────────────────────────────────────────────────────

function _lruTouch(stored, id) {
    stored.lruOrder = [id, ...stored.lruOrder.filter(i => i !== id)];
}

function _updateIndex(stored, game, toolConfig) {
    const entry = _toIndexEntry(game, toolConfig);
    const idx = stored.index.findIndex(e => e.id === game.id);
    if (idx !== -1) {
        stored.index[idx] = entry;
    } else {
        stored.index.push(entry);
    }
}