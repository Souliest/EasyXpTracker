# TrophyHunter — Technical Reference

TrophyHunter-specific architecture. For the shared storage model see `docs/storage.md`.
For general conventions see `docs/architecture.md`.

---

## Module Structure

| Module              | Contents                                                                                                                             |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `main.js`           | State (`_personalData`, `_selectedGameBlob`, `_catalogEntry`), selector, debounced sync, Realtime, game management, globals, init    |
| `storage.js`        | Hybrid personal state storage; catalog cache; lookup and catalog search; 4-step search flow; `createGameEntry`; `mergeCatalogUpdate` |
| `psn.js`            | Cloudflare Worker calls (`workerResolve`, `workerContribute`, `workerFetchTrophies`) and URL constants. Pure leaf — no imports.      |
| `stats.js`          | `computeStats`, `computeGroupStats` — pure functions, no DOM dependency                                                              |
| `render.js`         | All HTML builders and targeted DOM update functions. Re-exports `computeStats` and `computeGroupStats` for backward compatibility.   |
| `modal-search.js`   | Search / Add Game modal — 4-step search UI, contribute prompt, result rows                                                           |
| `modal-settings.js` | Game Settings modal — rename, reset, refresh from PSN, remove                                                                        |
| `modal.js`          | Barrel — re-exports from both modal files                                                                                            |

---

## Cloudflare Worker

`bgt-psn-proxy` acts as both a PSN API proxy and the exclusive writer to the two shared Supabase tables.
It holds the PSN NPSSO session token and a Supabase secret key (`SUPABASE_BGT_SECRET_KEY`) as environment secrets.

**Routes:**

| Route         | Method | Description                                                        |
|---------------|--------|--------------------------------------------------------------------|
| `/resolve`    | GET    | CUSA/PPSA title IDs → NPWR communication IDs via surrogate account |
| `/trophies`   | GET    | NPWR ID → full trophy list (groups + individual trophies)          |
| `/contribute` | POST   | PSN username → full title list (for lookup table enrichment)       |

**Key rule:** the browser client never writes to the shared tables. The worker is the sole trust boundary — only data
sourced directly from PlayStation can enter the shared catalog. The browser reads from shared tables and writes only to
its own personal game state table (`bgt_trophy_hunter_games`).

`/trophies` delegates to a `FetchCoordinator` Durable Object for PSN token caching and concurrent request coalescing.
Rate limiting uses a KV namespace. `DEV_MODE` is a Cloudflare environment variable (not hardcoded) — toggle from the
dashboard without a redeploy.

---

## Supabase Tables

| Table                       | Scope  | Contents                                              |
|-----------------------------|--------|-------------------------------------------------------|
| `bgt_trophy_hunter_games`   | User   | Personal game state — earned/pinned trophies per user |
| `bgt_trophy_hunter_catalog` | Shared | Full trophy lists, keyed by NPWR ID                   |
| `bgt_trophy_hunter_lookup`  | Shared | Title name → NPWR ID mappings (no user data)          |

- Personal games table: `auth.uid() = user_id` RLS (full CRUD).
- Shared tables: public read, no client write policies. All writes go through the Worker using
  `SUPABASE_BGT_SECRET_KEY`, which bypasses RLS.
- `SUPABASE_BGT_SECRET_KEY` is named per-project to allow independent revocation.

---

## Catalog Cache

Trophy list blobs are large (~200 trophies with names and descriptions) and read-only.
A local LRU cache (max 3 entries) under `bgt:trophy-hunter:catalog-cache` avoids re-fetching
from Supabase on every game switch.

- Cache hit: returns the cached entry immediately; triggers a background refresh from Supabase.
- Cache miss: fetches the full blob from `bgt_trophy_hunter_catalog` and stores in the cache.
- Evicted entries are re-fetched on next access — never lost, Supabase is the source of truth.

The catalog cache is separate from the personal game state LRU cache described in `docs/storage.md`.
Personal game state for all games is always stored in full in the v2 blob cache (up to 5 entries).

---

## 4-Step Search Flow

`runSearch()` in `storage.js` runs a cascade, falling back only when the previous step yields nothing.
Queries are normalised before matching: `™`, `®`, `©`, `:`, `-`, quotes, and punctuation are stripped.

1. **`searchCatalog()`** — queries `bgt_trophy_hunter_catalog` by name. Found → instant add.
2. **`searchLookupTable()`** — queries `bgt_trophy_hunter_lookup` by name. Found → NPWR is known → call `/trophies`.
3. **Patch sites + `/resolve`** — queries OrbisPatches (PS4) and ProsperoPatches (PS5) for CUSA/PPSA IDs, then calls
   `/resolve` to get the NPWR. Worker writes new mappings to the lookup table before returning.
4. **`/contribute`** — the modal asks for a PSN username. Calls `/contribute`; the worker writes all new title→NPWR
   mappings to the lookup table before returning. Username is never stored.

Every step that discovers a new NPWR mapping causes the worker to save it to `bgt_trophy_hunter_lookup`,
growing the catalog passively from normal search activity.

Title names are normalised to Title Case (`normaliseTitle()`) before saving and before `ilike` search queries.
`stripSearchNoise()` is applied to the query only — stored titles remain canonical.

**Module placement:** `runSearch` and `runContribute` live in `storage.js` (where they have natural access to
`searchCatalog`, `searchLookupTable`, and `normaliseTitle`). `psn.js` holds the three worker calls and URL constants
only. `modal-search.js` imports worker calls from `psn.js` and search flow functions from `storage.js` — no circular
dependency.

---

## modal-search.js

Receives `personalIndex` (the index array from `{ index, blobs }`) rather than a flat games array.
The only call that needed the games array was the "already in your list" check, which now uses
`personalIndex.some(e => e.npCommId === result.npCommId)`. Index entries include `npCommId`.

---

## Render Patterns

### Single-group auto-flatten

If a game has only one trophy group (no DLC), `renderMain` forces `effectiveViewState.ungrouped = true`
and hides the ungroup toggle. The group header would duplicate the game header, so it is suppressed.

### Group platinum indicator

`computeGroupStats` scans each group's trophies for `type === 'platinum'`. If found, the group header
renders the platinum trophy icon (colored if earned, dimmed if not) instead of the standard checkmark.
Platinum icon rendered at `size + 3` relative to peer tier icons (e.g. 19px vs 16px in the game header).

### Per-tier earned/total chips

`renderTierChips` renders `[icon][earned]/[total]` for gold, silver, and bronze. Earned count at full
font-size and opacity; separator and total at `0.6rem` / `0.65` opacity — same tier color, reduced weight.
Platinum shows icon only (always exactly one). All icons use `display: block`; parent chip uses
`align-items: flex-end` so every icon bottom-aligns regardless of height difference.

### Completed group tint

When `groupStats.isComplete` is true, `renderGroupHeader` adds `th-group-complete` to the header.
CSS applies a fully opaque green-tinted background (`#182324` dark / `#f2f8f0` light) — pre-composited
hex values rather than `rgba()` to prevent content bleed-through under sticky positioning.

### Sticky group headers

`.th-group-header` uses `position: sticky; top: 6px; z-index: 10`. The 6px offset gives breathing room
from the viewport edge. The explicit opaque background prevents bleed-through. `z-index: 10` keeps headers
above trophy rows but below modals (`z-index: 100+`). No JS required.

### Dimmed rows interactive

Trophies in the dimmed (unwanted) section of a filtered list are de-emphasised via opacity but fully
interactive. Toggling a dimmed trophy triggers a full `_doRenderMain()` so it moves to its correct section.

### Section dividers

`filterTrophies` injects `{_divider: true, _label: '...'}` sentinels between wanted and unwanted sections
when both are non-empty. The renderer checks for `_divider` and calls `renderSectionDivider(label)` instead
of `renderTrophyRow`. Pinned trophies float within the wanted section only — not across the divider.

### Filter-aware toggle re-render

When `viewState.filter !== 'all'`, `_toggleEarned` triggers a full `_doRenderMain()` so the trophy moves
to its correct section immediately and sort order updates. When filter is `'all'`, the cheaper targeted
updates (`refreshTrophyRow`, `updateGroupHeader`, `updateGameHeader`) are used instead.

### Percentage flooring

Both `computeStats` and `computeGroupStats` use `Math.floor` (not `Math.round`) — matches PSN convention.
A game missing one bronze never shows 100%.

### Selector bar height normalisation

`.selector-bar select` and `.selector-bar .btn` both receive `height: 35px; box-sizing: border-box`.
This locks all elements to the same height regardless of glyph rendering differences (e.g. ✎ vs text).

### renderMain signature (v2)

```js
renderMain(selectedGameId, personalData, selectedGameBlob, catalogEntry, callbacks)
```

- `personalData` — `{ index, blobs }` — used only for the empty-state message (`index.length`).
- `selectedGameBlob` — the full game object for the selected game. All game data comes from here.
- `catalogEntry` — PSN trophy list. `null` if not yet loaded.

Previously `renderMain` received `personalData` with a `.games` array and called `.find()` to get the
active game. The blob is now a standalone parameter.

---

## Decisions & Rationale

- **`psn.js` as a pure leaf** — `modal-search.js` and `modal-settings.js` both need worker functions. Importing them
  from `storage.js` was a layering smell — modal code reaching into the storage layer for non-storage functions.
  `psn.js` gives the three worker functions a clean home with no imports.
- **`runSearch` and `runContribute` in `storage.js`** — these functions call `searchCatalog`, `searchLookupTable`, and
  `normaliseTitle`, which are naturally part of the storage layer. Moving them to `psn.js` would create a circular
  dependency (`psn.js` ← `storage.js` ← `psn.js`).
- **`stats.js` as a pure module** — `computeStats` and `computeGroupStats` have no DOM dependency. Both `main.js` and
  `render.js` imported them from `render.js`, which is the wrong layer. `render.js` re-exports them for backward
  compatibility.
- **`modal-search.js` + `modal-settings.js`** — the search modal has its own internal state (`_currentQuery`), a 4-step
  UI flow, a contribute prompt, and result rendering. The settings modal is a completely independent form. Splitting
  eliminates the largest file and makes each modal findable by name. `modal.js` retained as a barrel.
- **Catalog cache size = 3** — trophy list blobs are large and read-only; a different tradeoff from the personal state
  blob cache (5). Three covers a reasonable recent-games working set without excessive localStorage usage.
- **Worker-only writes to shared tables** — the browser client has read-only access to `bgt_trophy_hunter_catalog` and
  `bgt_trophy_hunter_lookup`. This ensures only data sourced directly from PlayStation can enter the shared catalog,
  eliminating the risk of client-side catalog poisoning.
- **`saveLookupEntries()` removed** — previously a no-op wrapper kept for call-site compatibility. Once all call sites
  were updated, deleted entirely. Worker handles all lookup writes server-side.
- **`DEV_MODE` as a Cloudflare environment variable** — previously hardcoded, requiring a redeploy to toggle. A
  Cloudflare variable (`env.DEV_MODE === 'true'`) allows toggling from the dashboard with immediate effect.
- **Orphaned trophy detection** — trophies removed from PSN are flagged (`orphaned: true`) rather than silently deleted
  on Refresh. They appear with a dashed border and warning label, excluded from progress calculations. A fresh Refresh
  clears them.
- **`normaliseTitle()` on both save and search** — ensures `ilike` matches work regardless of PSN capitalisation.
  `stripSearchNoise()` is applied to queries only — stored titles remain canonical so the data isn't corrupted.
- **Section divider as sentinel object** — injecting `{_divider: true}` into the filtered array keeps rendering logic in
  one place without needing separate before/after arrays or post-processing passes.
- **Sticky group headers: CSS-only** — `position: sticky` requires no JS. The page header is normal flow (not fixed), so
  `top: 6px` parks the group header just below the viewport edge with no offset calculation needed.
- **Completed group tint: opaque computed colours** — `rgba()` backgrounds bleed through under sticky positioning.
  Pre-composited hex values (`#182324` dark / `#f2f8f0` light) provide the same visual result without transparency
  artefacts.
- **`_selectedGameBlob` in main.js** — all interaction handlers previously did
  `_personalData.games.find(g => g.id === selectedGameId)` on every call. With `_personalData` now index-only, a
  dedicated module-level variable holds the full active game. Set by `loadGame()` on select; kept in sync by every write
  handler via `cacheSet`.
- **`_afterSelectExisting` uses index** — finds the game by `npCommId` in `_personalData.index` (always complete) rather
  than blobs (which may not contain the game). Index is the correct layer for existence checks; blobs are a cache.
- **`openAddGameModal` receives `personalIndex`** — the only thing the search modal needed from the games list was the "
  already in your list" check by `npCommId`. The index (always complete, always available) is sufficient. The modal
  never needs full game blobs.