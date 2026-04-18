# BasicGamingTools — Storage Architecture

Applies to LevelGoalTracker, ThingCounter, and TrophyHunter.
XpTracker uses synchronous localStorage-only storage and is not covered here.

---

## Overview

All three hybrid tools use the same two-tier local storage model backed by Supabase.

- **localStorage** is the primary read source — always available, even offline.
- **Supabase** is the persistence layer — syncs across devices when the user is signed in.
- **`common/migrations.js`** owns the schema version, LRU helpers, tool config, and all migration transforms.

---

## Local Storage Shape (v2)

Each tool stores a single JSON object under its versioned key:

```js
{
    version:  2,
        index
:
    [{id, name, last_modified, ...displayMeta}],
        blobs
:
    {
        [id]
    :
        fullGameObject
    }
,
    lruOrder: [id, id, ...],
}
```

| Field      | Description                                                                                                                  |
|------------|------------------------------------------------------------------------------------------------------------------------------|
| `version`  | Schema version — used by the migration runner.                                                                               |
| `index`    | Always-complete list of all the user's games. Contains only the fields needed to build the selector dropdown. Never evicted. |
| `blobs`    | LRU blob cache — full game objects for up to 5 recently accessed games. Not all index entries have a corresponding blob.     |
| `lruOrder` | Array of IDs, most-recently-accessed first. Updated by every `cacheGet` and `cacheSet`.                                      |

**Index fields per tool:**

| Tool             | Index fields                              |
|------------------|-------------------------------------------|
| LevelGoalTracker | `id`, `name`, `last_modified`             |
| ThingCounter     | `id`, `name`, `last_modified`             |
| TrophyHunter     | `id`, `name`, `last_modified`, `platform` |

TrophyHunter includes `platform` because the selector renders `[name] [platform]`.

**Storage keys:**

| Tool             | Key                         | Legacy key (deleted on migration) |
|------------------|-----------------------------|-----------------------------------|
| LevelGoalTracker | `bgt:level-goal-tracker:v2` | `bgt:level-goal-tracker:data`     |
| ThingCounter     | `bgt:thing-counter:v2`      | `bgt:thing-counter:data`          |
| TrophyHunter     | `bgt:trophy-hunter:v2`      | `bgt:trophy-hunter:data`          |

---

## loadData() Return Shape

`loadData()` returns `{ index, blobs }` — not a flat `{ games }` array.

- Callers use `index` to build the selector dropdown.
- Callers use `blobs[selectedGameId]` to read the active game's full data.
- Not every index entry has a blob. Callers must not assume blob presence.

---

## Schema Versioning and Migrations

### How it works

`runMigrations(toolConfig)` is called at the top of every `loadData()` and `loadGame()` — silently,
automatically, before anything else reads stored data. It is a fast no-op when `stored.version === CURRENT_VERSION`.

When the stored version is behind:

1. The runner executes each migration transform in sequence, chaining from the stored version to `CURRENT_VERSION`.
2. It writes the migrated object (with the new version stamp) back to localStorage.
3. Migration functions are **never deleted** — a client on any old version always catches up correctly.

### Schema history

| Version | Change                                                                                              |
|---------|-----------------------------------------------------------------------------------------------------|
| 1       | Original shape: `{ games: [...] }` with full blobs for all games. Stored under legacy keys.         |
| 2       | Two-tier shape: `{ version, index, blobs, lruOrder }`. Blob cache capped at 5. Legacy keys deleted. |

### v1 → v2 transform

1. Reads the legacy key (`bgt:tool-name:data`).
2. Builds the index from all games.
3. Seeds the blob cache with the 5 most-recently-modified games (most-recently-modified first, so the first select after
   migration doesn't need a Supabase round-trip for active games).
4. Deletes the legacy key — no dead keys.

### Adding a future migration

1. Increment `CURRENT_VERSION` in `common/migrations.js`.
2. Add a new `case` to the `switch` in `runMigrations`.
3. Write the pure transform function below the existing ones.
4. Update this document with the new version and what changed.

---

## LRU Cache Helpers

All cache operations go through helpers exported from `common/migrations.js`.
These operate on the stored object in-place.

| Function                         | Description                                                        |
|----------------------------------|--------------------------------------------------------------------|
| `cacheGet(stored, id)`           | Read blob; promote to front of `lruOrder`. Returns `null` on miss. |
| `cacheSet(stored, game, cfg)`    | Write blob; evict LRU entry if cache is full; update index entry.  |
| `cacheDelete(stored, id)`        | Remove blob and index entry. Used by `deleteGame`.                 |
| `updateIndex(stored, game, cfg)` | Update index entry without touching the blob cache.                |

Blob cache size: **5** for all three hybrid tools. TrophyHunter's catalog cache (separate) stays at 3 because trophy
list blobs are large and read-only.

---

## Supabase Tables

One row per game in each tool's personal games table. Schema unchanged from v1.

| Table                          | Tool             |
|--------------------------------|------------------|
| `bgt_level_goal_tracker_games` | LevelGoalTracker |
| `bgt_thing_counter_games`      | ThingCounter     |
| `bgt_trophy_hunter_games`      | TrophyHunter     |

Schema per table: `id uuid pk`, `user_id uuid → auth.users`, `name text`, `data jsonb`, `updated_at timestamptz`.
RLS restricts all operations to `auth.uid() = user_id`.

---

## Read Path — Selector (loadData)

On every `loadData()` call:

1. Read from localStorage immediately (`_localLoad()`). Return if no user is signed in.
2. Lightweight `SELECT id, name, updated_at` to get the full remote game list.
3. Classify each remote row:
    - **Missing** — not in the local index at all (e.g. added on another device).
    - **Stale** — in the local index but remote `updated_at` is strictly newer than local `last_modified`.
4. Fetch full blobs for all missing + stale IDs in a single batched `SELECT ... WHERE id IN (...)`.
5. For each fetched blob:
    - If **missing** or **already in the blob cache**: call `cacheSet` — update both tiers.
    - If **stale but not cached**: call `updateIndex` — update the index only, leave blob cache untouched. This
      preserves LRU shape: a game evicted from the cache stays evicted until the user selects it.
6. `localSave` and return `{ index, blobs }`.

On a fresh device this downloads everything. In the steady state (all games local and up to date) it downloads nothing —
the two queries return and find nothing to fetch.

---

## Read Path — Game Select (loadGame)

`loadGame(gameId)` is called on every game select before rendering.

**Cache hit:**

1. `cacheGet` promotes the entry in LRU order and `localSave`.
2. Fetches only `data, updated_at` for that game from Supabase.
3. Collision detection: if `|localTime - remoteTime| > 5000ms`, returns a collision object.
4. Otherwise returns `{ game, collision: null }`.

**Cache miss:**

1. Fetches the full blob from Supabase.
2. `cacheSet` (possibly evicting the LRU game — its index entry is preserved).
3. `localSave` and return `{ game, collision: null }`.

After `loadGame` returns, the selected game is always cache-warm. `renderMain` reads directly
from `_localLoad()` with no additional Supabase round-trip.

---

## Write Path (saveData / saveGame)

`saveData(stored, changedGameId)`:

1. `localSave(stored)` — synchronous, immediate.
2. If signed in: upsert only `changedGameId` to Supabase via `saveGame`.

`saveGame(game)`:

1. Stamps `game.last_modified = now`.
2. Upserts the row to Supabase.
3. Re-reads localStorage and calls `cacheSet` (or `updateIndex` if evicted) to persist the timestamp stamp locally.

Always pass `changedGameId` — the fallback that upserts all blobs should not occur in normal usage.

---

## Write Path — TrophyHunter (Debounced)

Trophy interactions write to localStorage immediately via `localSave` and re-render the UI without
waiting for Supabase. `_scheduleSync()` in `main.js` fires a background Supabase write 2 seconds after
the last interaction, batching rapid toggles into a single write.

- `_syncTimer` is set to `null` after firing so the Realtime handler can distinguish "no pending changes" from "timer
  running".
- Timer is flushed on game switch and on opening the add-game modal.
- `_scheduleSync` always passes `selectedGameId` — only the currently-viewed game changes during play.

---

## Collision Detection

Triggered on game select via `loadGame(gameId)`. Compares `game.last_modified` (local cache)
against `updated_at` (Supabase). If they differ by more than 5 seconds, `showCollisionModal`
(from `auth-ui.js`) presents both timestamps and lets the user pick Local or Cloud.

```js
showCollisionModal(gameId, gameName, collision, resolveCollision, onResolved)
```

`resolveCollision` is passed as a parameter (not imported by `auth-ui.js`) — keeps the dependency
graph clean.

---

## Realtime Sync

All three tools support live cross-device sync via Supabase Realtime.

**Setup:** each tool's personal games table must have Update events enabled under
**Database → Publications → supabase_realtime** in the Supabase dashboard.

**Kill switch:** set `REALTIME_ENABLED = false` in a tool's `storage.js`. `subscribeToGameChanges`
and `unsubscribeFromGameChanges` become no-ops. The tool falls back to load-on-select sync with
no other code changes needed.

**Subscribe/unsubscribe lifecycle (all tools):**

- Subscribe immediately after `loadData()` if already signed in.
- Subscribe on `SIGNED_IN` auth state change.
- Unsubscribe on `SIGNED_OUT` auth state change.

### Incoming update handler (_onRemoteUpdate)

**LevelGoalTracker and ThingCounter:**

1. Skip if the remote game data is missing.
2. Compare `remoteGame.last_modified` against the local index entry's `last_modified`. Skip if remote is not strictly
   newer.
3. If the game is not in the local index at all (added on another device): `cacheSet` it, rebuild the selector.
4. If the game is in the blob cache: `cacheSet` with the remote data.
5. If the game is in the index but not the blob cache: update the index entry only — no blob fetch.
6. If the affected game is currently selected: re-render.

**TrophyHunter additionally:**

- Skip the entire update if `_syncTimer !== null` — local changes are in progress and take priority.
- When applying a remote update to a cached blob: preserve the local `viewState` (filter, sort, ungrouped,
  collapsedGroups). Each device keeps its own display preferences during a session. `viewState` is still written to
  Supabase and restored on initial load on a new device — it just never overwrites the current session mid-play.

### Non-cached game updates

Remote Realtime events for games not in the blob cache update the index entry only (keeping the
selector timestamp correct) and discard the blob. The user sees the fresh data the next time they
select that game, which is identical to pre-Realtime behaviour. No data loss, no corruption.

---

## TrophyHunter: _personalData and _selectedGameBlob

TrophyHunter's `main.js` holds two module-level variables:

**`_personalData`** — `{ index, blobs }` as returned by `loadData()`. Used only for the selector.

**`_selectedGameBlob`** — the full game object for the currently-selected game. Set by `loadGame()`
on every game select. All interaction handlers (`_toggleEarned`, `_togglePinned`, `_updateViewState`,
`_toggleGroup`, `_renameGame`, `_resetGame`, `_refreshGame`) read and write `_selectedGameBlob`
directly, then call `cacheSet` to sync the change back into the stored object.

LGT and ThingCounter don't need a `_selectedGameBlob` — they call `_localLoad()` in each handler
and read `stored.blobs[selectedGameId]` directly. Equally cheap (synchronous localStorage read),
and simpler since those tools don't hold module-level game data.

---

## Decisions & Rationale

- **Two-tier local storage** — the original design stored every game's full blob indefinitely. The per-game Supabase row
  model exists so the client stays lean. The v2 shape makes this explicit: the index drives the selector; the blob cache
  covers the realistic active working set. Games outside the cache are fetched on demand — identical latency to the
  first select on a new device.
- **Blob cache size = 5** — three is too tight for a user switching between a handful of active games; ten exceeds a
  realistic active working set. Five covers common patterns without localStorage bloat.
- **Stale-but-not-cached: index update only** — when `loadData()` finds a stale remote game not in the blob cache, it
  updates only the index. The game was evicted for a reason and stays evicted until selected. Fetching it proactively
  would undermine the cache and could evict a game the user is actively using.
- **Realtime: drop non-cached game blobs** — a Realtime UPDATE for a non-cached game updates the index only. The user
  sees fresh data on next select — identical to pre-Realtime behaviour. No data loss.
- **`common/migrations.js` as the single migration home** — all three tools share the runner, helpers, and version
  constant. One place to write, one place to read.
- **Migrations run on every `loadData()` call** — `runMigrations` is a fast no-op when current. Calling on every load (
  not just init) ensures correct behaviour even if a module is loaded in an unexpected context.
- **Migration functions never deleted** — a client on any old version chains through all intermediate transforms.
  Deleting old functions breaks this guarantee.
- **Per-game rows in Supabase** — each game is its own row with a `name` column, so the selector dropdown can be
  populated with a lightweight `SELECT id, name, updated_at` query. Full blobs are only fetched when missing, stale, or
  selected.
- **Batch fetch for missing/stale games** — a single `.in('id', idsToFetch)` query caps first-sync cost at two queries
  regardless of library size.
- **Collision detection on game select, not on load** — checking per game on select is precise and non-intrusive.
- **TrophyHunter debounced sync instead of await-on-every-toggle** — trophy interactions are frequent and rapid;
  awaiting Supabase on each creates noticeable lag. localStorage is the source of truth. The debounce batches toggles,
  reduces write volume, and keeps the UI instant.
- **TrophyHunter Realtime: trophyState-only merge** — `viewState` is excluded from Realtime merges so each device keeps
  its display preferences during a session. `viewState` is still written to Supabase and restored on initial load — it
  just doesn't interrupt another device mid-play.
- **TrophyHunter Realtime: local-changes-win policy** — if `_syncTimer !== null`, incoming remote updates are silently
  dropped. Local changes reach Supabase within 2 seconds and supersede the remote state naturally.
- **Realtime kill switch flag in storage.js** — `REALTIME_ENABLED` lets any tool's Realtime be disabled with a one-line
  change if connection limits or other issues arise.
- **`saveData` always receives `changedGameId`** — the fallback that upserts all blobs should not occur in normal usage.
  All call sites pass the ID of the game they just modified.
- **`_selectedGameBlob` in TrophyHunter** — previously all interaction handlers did
  `_personalData.games.find(g => g.id === selectedGameId)`. With `_personalData` now index-only, `_selectedGameBlob`
  holds the full active game. LGT and ThingCounter read `stored.blobs[selectedGameId]` directly from a synchronous
  `_localLoad()` — equally cheap, simpler since those tools don't cache game data at the module level.
- **`_afterSelectExisting` uses index not blobs** — finds the game by `npCommId` in `_personalData.index` (always
  complete) rather than blobs (may not contain the game). Index is the correct layer for existence checks.