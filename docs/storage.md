# BasicGamingTools — Storage Architecture

Applies to LevelGoalTracker, ThingCounter, TrophyHunter, and TrophySummary (PTSD).
TrophySummary uses a simplified variant of the hybrid model — documented in its own section below.
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
| ChecklistManager | `bgt:clm:v2`                | `bgt:clm:data`                    |
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
| `bgt_clm_projects`             | ChecklistManager |
| `bgt_level_goal_tracker_games` | LevelGoalTracker |
| `bgt_thing_counter_games`      | ThingCounter     |
| `bgt_trophy_hunter_games`      | TrophyHunter     |
| `bgt_trophy_summary_profiles`  | TrophySummary    |

Schema per table (multi-game tools): `id uuid pk`, `user_id uuid → auth.users`, `name text`, `data jsonb`,
`updated_at timestamptz`. RLS restricts all operations to `auth.uid() = user_id`.

TrophySummary uses a different schema: `user_id uuid pk → auth.users`, `ps_username text`, `data jsonb`,
`updated_at timestamptz`. One row per BGT user account (not per game). RLS restricts all operations to
`auth.uid() = user_id`.

**Realtime publication:** all three tables are in the `supabase_realtime` publication with both UPDATE
and DELETE events enabled. A single shared publication is the correct pattern — channel-level filtering
(`filter: user_id=eq.${userId}`) scopes events to the right subscriber at runtime.

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
6. **Stale-delete cleanup:** compare the local index against the remote ID set. Any local entry absent
   from the server was deleted on another device while this one was offline. Remove it via `cacheDelete`
   and `localSave`. Realtime handles live deletes; this block catches up devices that missed events.
7. `localSave` and return `{ index, blobs }`.

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

**Setup:** each tool's personal games table must have both UPDATE and DELETE events enabled under
**Database → Publications → supabase_realtime** in the Supabase dashboard. A single shared publication
covering all three tables is the correct configuration.

**Kill switch:** set `REALTIME_ENABLED = false` in a tool's `storage.js`. `subscribeToGameChanges`
and `unsubscribeFromGameChanges` become no-ops. The tool falls back to load-on-select sync with
no other code changes needed.

**Subscribe/unsubscribe lifecycle (all tools):**

- Subscribe immediately after `loadData()` if already signed in.
- Subscribe on `SIGNED_IN` auth state change.
- Unsubscribe on `SIGNED_OUT` auth state change.

### Incoming update handler (_onRemoteUpdate)

The `realtime.js` factory delivers `{ type: 'update', row }` or `{ type: 'delete', row }`.
All three tools handle both types.

**DELETE handling (all tools):**

1. Extract `id` from `payload.row`. Return early if the game isn't in the local index.
2. `cacheDelete` + `localSave` — removes both the blob and the index entry.
3. If the deleted game was currently selected: clear `selectedGameId` and any tool-specific
   selected state (focus game ID, action button visibility, localStorage selected key).
4. Rebuild the selector. Re-render (LGT: only if `!selectedGameId`; TC: unconditionally via `doRenderMain`).

**UPDATE handling (LevelGoalTracker and ThingCounter):**

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
- TrophyHunter wraps the factory callback in `storage.js` to unpack `payload.row.data` / `payload.row.updated_at`
  and enforce the `REALTIME_ENABLED` guard, adapting the generic factory payload to TrophyHunter's `onUpdate` signature.

### Non-cached game updates

Remote Realtime events for games not in the blob cache update the index entry only (keeping the
selector timestamp correct) and discard the blob. The user sees the fresh data the next time they
select that game, which is identical to pre-Realtime behaviour. No data loss, no corruption.
This applies to UPDATE events only — DELETE events are always fully processed regardless of cache state.

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

## TrophySummary (PTSD) Storage Model

PTSD is a single-profile-per-user tool and uses a simplified variant of the hybrid storage model. There is no index, no
LRU blob cache, and no per-game rows.

### Local storage shape

```js
// Key: 'bgt:trophy-summary:v2'
{
    version: 2,
    profile: { /* full profile blob */ } | null
}
```

The profile blob is the entire tool state — username, avatar, level, tier counts, game list, view state. It is read and
written as a unit.

Rate limits are stored separately:

```js
// Key: 'bgt:trophy-summary:rate-limits'
{
    'global': 1234567890123,  // Date.now() + retryAfterSeconds * 1000
    'NPWR12345_00': 1234567890123, // per-game scope
}
```

### `_savedAt` field

`saveData` stamps `_savedAt: now` onto the profile before writing to localStorage. This field is stripped before
upserting to Supabase. `loadData` uses `profile._savedAt` (not `lastFullRefresh`) to compare against Supabase
`updated_at` when deciding whether to fetch the remote blob — it reflects when the profile was last saved locally, not
when the user last triggered a refresh.

### Read path

On every `loadData()` call:

1. Read localStorage immediately. Return if no user is signed in.
2. Fetch only `updated_at` from Supabase (`SELECT updated_at WHERE user_id = ?`).
3. Compare against `profile._savedAt`. If remote is newer (or no local profile exists), fetch the full blob from the
   `data` column.
4. Write the remote blob to localStorage and return it.
   This is a simplified version of the multi-game read path — one lightweight query, one conditional full fetch.

### Write path

`saveData(profile)`:

1. Stamps `_savedAt: now` on the profile.
2. Writes to localStorage immediately.
3. Upserts to Supabase — strips `_savedAt`, sets `updated_at: now`.
   There is no debounce. PTSD writes are infrequent (global refresh, per-game refresh, pin toggle, filter change) and
   the blob is written as a unit.

### Realtime sync — ping model

PTSD uses the **ping model** rather than carrying the full blob through Realtime.

**Why:** The profile blob grows proportionally with library size. At the median it is around 200KB; for the largest
libraries it is estimated at 2–3MB. Supabase Realtime has a 1MB payload limit per broadcast message. Carrying the full
blob would work for most users but silently fail for the top end of the user base.

**How it works:**

Device A saves (global refresh, per-game refresh, etc.) → Supabase upsert writes the full blob to the `data` column and
sets `updated_at`. Realtime broadcasts the row UPDATE to subscribers, but the receiving device only reads `updated_at`
from the payload — it does not read `data` from it.

Device B receives the Realtime event → compares the remote `updated_at` against its local `profile._savedAt`. If remote
is newer, Device B fetches the full blob from Supabase directly via a normal `SELECT data WHERE user_id = ?`. This is
the same fetch that `loadData` already performs on page open.

**Implementation:**

`subscribeToProfileChanges` in `storage.js` receives the raw Realtime payload. It extracts `row.updated_at` and passes
`{ updatedAt }` to `_onRemoteUpdate` in `main.js` — not the full row data.

`_onRemoteUpdate` in `main.js` compares `remoteUpdatedAt` against `_profile._savedAt`. If remote is newer, it calls
`loadData()` to fetch the full blob, then re-renders.

**Payload size through Realtime:** approximately 100 bytes regardless of library size.

**Tradeoff:** one extra round trip per sync event (Realtime ping → Supabase fetch). For a read-only summary tool where
sync is a convenience rather than a core feature, this is acceptable.

**Local viewState preservation:** `_onRemoteUpdate` preserves the local `viewState` (sort, filterState) over the
incoming remote profile, same as TrophyHunter's approach. Each device keeps its own display preferences during a
session.

### Realtime subscription setup

`createRealtimeSubscription('ptsd-profile', TABLE)` from `common/realtime.js` — same factory as the other tools. The
`subscribeToProfileChanges` wrapper enforces the `REALTIME_ENABLED` guard and filters out DELETE events (a deleted row
means the user signed out on another device — no action needed on the receiving device).

Subscribe/unsubscribe lifecycle: same as the other hybrid tools — subscribe after `loadData()` if signed in, subscribe
on `SIGNED_IN`, unsubscribe on `SIGNED_OUT`.

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
- **Stale-delete cleanup in loadData()** — Realtime handles live deletes, but a device that was offline when a deletion
  occurred would never receive the event. Comparing the local index against the remote ID set on every `loadData()` call
  catches these missed events cheaply — the lightweight query that already runs for the selector provides the remote ID
  set at no extra cost.
- **DELETE always processed regardless of cache state** — unlike UPDATE events (which skip blob fetch for non-cached
  games), a DELETE must always remove the index entry. Leaving a deleted game in the index would make it appear in the
  selector permanently on that device.
- **Single `supabase_realtime` publication for all tables** — a publication is transport-level plumbing;
  channel filtering (`user_id=eq.${userId}`) is what scopes events to the right subscriber. One publication
  is the standard Supabase configuration. Separate publications would only be needed for different replication
  settings per table, which is not the case here.
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
- **PTSD: no index or LRU cache** — PTSD is single-profile-per-user. The index exists to populate a game selector; the
  LRU cache exists to avoid fetching blobs for games the user isn't currently viewing. Neither concept applies when
  there is only one blob and no selector.
- **PTSD: full blob written as a unit** — unlike the multi-game tools which can upsert a single changed game row, PTSD's
  entire state is one blob. This simplifies the write path at the cost of writing more data per save. Given the write
  frequency (infrequent, user-triggered), this is the right tradeoff.
- **PTSD: Realtime ping model** — see the TrophySummary section above. The core reason is payload size. The ping model
  also has a secondary benefit: it unifies the sync path with `loadData`, meaning the same fetch logic handles both
  initial load and live updates, with no separate merge code needed for incoming Realtime data.
- **PTSD: `_savedAt` not `lastFullRefresh` for remote comparison** — `lastFullRefresh` records when the user last
  triggered a global PlayStation fetch. `_savedAt` records when the profile was last written to localStorage, which may
  be more recent (a pin toggle, a filter change, a per-game refresh all update `_savedAt` without changing
  `lastFullRefresh`). Using `_savedAt` for the Supabase comparison ensures that any local change, however small,
  correctly blocks an older remote version from overwriting it.
