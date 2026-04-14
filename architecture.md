# BasicGamingTools — Architecture Reference

This document captures the conventions, patterns, and decisions used across all tools.
Paste it at the start of a new session to orient quickly.

---

## Repository Structure

```
BasicGamingTools/
├── index.html                  # Root tool index — dynamically built from tools.js
├── architecture.md             # This file
├── UserGuide.md
├── common/
│   ├── tools.js                # TOOLS array — the single source of truth for the index
│   ├── theme.js                # initTheme(), toggleTheme() — shared across all tools
│   ├── theme.css               # CSS variables, dark/light themes
│   ├── header.js               # initHeader(title) — injects shared header into every tool
│   ├── header.css              # .tool-header styles
│   ├── supabase.js             # Supabase client (URL + publishable key) — imported by auth.js
│   ├── auth.js                 # Session management, getUser(), signUp/In/Out/reset
│   ├── auth-ui.js              # 👤 popover, login/register/reset overlay, CSS injection
│   ├── auth.css                # Styles for auth overlay, popover, collision modal, header button
│   ├── collision.js            # showCollisionModal — shared across all hybrid-storage tools
│   └── utils.js                # Shared utilities: escHtml(), attachLongPress()
└── ToolName/
    ├── index.html
    ├── styles.css
    └── js/
        ├── main.js             # Entry point — state, event wiring, globals, init IIFE
        ├── storage.js          # loadData, saveData, and storage key constants
        └── [other modules]     # render, modal, stats, etc. — tool-specific
```

---

## Adding a New Tool

1. Create a `ToolName/` folder with `index.html`, `styles.css`, and a `js/` directory
2. Add one entry to `common/tools.js` — the root index updates automatically
3. Follow the script load order and storage key conventions below

---

## Script Load Order (every tool page)

```html

<script src="../common/theme.js"></script>
<script src="../common/header.js"></script>
<script>
  initHeader('Tool Title');
  initTheme(optionalCallback);
</script>
<script type="module" src="js/main.js"></script>
```

`initHeader` must be called before `initTheme` so the theme toggle button exists in the DOM when `initTheme` looks for
it. The `common/` scripts are non-module globals and load synchronously before `main.js`.

Because `type="module"` scripts are deferred by spec, any functions they expose must be assigned to `window` explicitly.
Functions called by inline HTML handlers (e.g. `onclick="selectGame(this.value)"`) are assigned in `main.js` via
`window.funcName = funcName`.

`auth-ui.js` is **not** loaded via a separate `<script>` tag. Instead, `main.js` imports `initAuth` from
`../../common/auth-ui.js` and calls it at the top of the init IIFE:

```js
import {initAuth} from '../../common/auth-ui.js';

(async function init() {
    await initAuth();
    const data = await loadData();
    // ...
})();
```

`auth-ui.js` injects the auth overlay and popover into the DOM, loads `auth.css` via `import.meta.url`, and wires
the 👤 button. It must be awaited before `loadData()` so that `getUser()` returns the restored session.

---

## Module Structure (per tool)

Each tool's logic lives in `js/` as ES modules. The split follows these responsibilities:

| Module                | Contents                                                                                                                                |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `storage.js`          | Storage key constants, `loadData()`, `saveData()`, and (for LGT/TC/TH) `loadGame()`, `saveGame()`, `resolveCollision()`, `deleteGame()` |
| `render.js`           | All render / DOM-update functions — receive data as parameters, no internal `loadData()` calls                                          |
| `main.js`             | Module-level state, event wiring, `window.*` globals, init IIFE                                                                         |
| Tool-specific modules | Pure helpers (dates, stats, nodes), modal logic, focus modals, etc.                                                                     |

`storage.js` for LGT, ThingCounter, and TrophyHunter is an **async hybrid**: reads from `localStorage` immediately,
merges from Supabase when the user is signed in, and writes to both stores on every save. XpTracker's `storage.js`
remains synchronous and localStorage-only — it is session-scoped by design.

---

## Auth Module Chain

```
common/supabase.js   ← imports Supabase JS client from CDN (ESM)
    ↑
common/auth.js       ← imports supabase; manages session, exposes getUser() etc.
    ↑
common/auth-ui.js    ← imports auth.js; injects overlay/popover, calls initAuthSession()
                       also exports showCollisionModal() — used by tools with hybrid storage
    ↑
tool/js/main.js      ← imports initAuth and showCollisionModal from auth-ui.js
                       also imports storage.js
tool/js/storage.js   ← imports getUser from auth.js (cached module, no extra fetch)
```

The browser fetches `supabase.js` and `auth.js` once per page load regardless of how many modules import them —
ES module imports are cached by URL.

---

## common/utils.js

Shared utility functions used across multiple tools. Import from `../../common/utils.js`.

**`escHtml(str)`** — Escapes a string for safe insertion into HTML. Use wherever user-supplied or external data is
rendered via `innerHTML`. Previously duplicated in each tool's `main.js` and `render.js`; now the single source.

**`attachLongPress(el, callback)`** — Fires `callback` after a 500ms hold. Cancels if the pointer moves more than
10px (scroll tolerance) or leaves the element. Used for single-node edit activation (ThingCounter) and trophy
pinning (TrophyHunter). Previously duplicated in ThingCounter `render.js` and TrophyHunter `render.js`.

---

## Collision Modal (showCollisionModal)

`showCollisionModal` lives in `common/collision.js` and is re-exported from `common/auth-ui.js` for backward
compatibility. Tool `main.js` files may import it from either path; the canonical source is `collision.js`. Its styles
live in `auth.css` alongside the rest of the auth UI.

**Signature:**

```js
showCollisionModal(gameId, gameName, collision, resolveCollision, onResolved)
```

| Parameter          | Description                                                                                                                                            |
|--------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `gameId`           | The ID of the game with conflicting data                                                                                                               |
| `gameName`         | Display name shown in the modal                                                                                                                        |
| `collision`        | Object from `loadGame()`: `{ localTime, remoteTime, remoteData }`                                                                                      |
| `resolveCollision` | The tool's own `resolveCollision` function from its `storage.js` — passed as a parameter so `auth-ui.js` does not import tool-specific storage modules |
| `onResolved`       | Callback fired after the user picks a side; caller re-loads and re-renders                                                                             |

**Usage pattern in `main.js`:**

```js
import {initAuth, showCollisionModal} from '../../common/auth-ui.js';
import {loadGame, resolveCollision} from './storage.js';

const {game, collision} = await loadGame(id);
if (collision) {
    showCollisionModal(id, game.name, collision, resolveCollision, () => renderMain());
}
```

`resolveCollision` is passed in rather than imported directly by `auth-ui.js`. This keeps the dependency graph
clean: `auth-ui.js` has no knowledge of any tool's storage module.

---

## Hybrid Storage Pattern (LGT, ThingCounter, and TrophyHunter)

LGT and ThingCounter store one row per game in their respective tables:

| Table                          | Tool             |
|--------------------------------|------------------|
| `bgt_level_goal_tracker_games` | LevelGoalTracker |
| `bgt_thing_counter_games`      | ThingCounter     |

Schema per table: `id uuid pk`, `user_id uuid → auth.users`, `name text`, `data jsonb`, `updated_at timestamptz`.
RLS policies restrict all operations to `auth.uid() = user_id`.

TrophyHunter uses three Supabase tables:

| Table                       | Scope  | Contents                                              |
|-----------------------------|--------|-------------------------------------------------------|
| `bgt_trophy_hunter_games`   | User   | Personal game state — earned/pinned trophies per user |
| `bgt_trophy_hunter_catalog` | Shared | Full trophy lists, keyed by NPWR ID                   |
| `bgt_trophy_hunter_lookup`  | Shared | Title name → NPWR ID mappings (no user data)          |

The personal games table is restricted to `auth.uid() = user_id` (full CRUD). The two shared tables have public
read access only — no client INSERT or UPDATE policies exist. All writes to the shared tables are performed
exclusively by the Cloudflare Worker using a dedicated Supabase secret key (`SUPABASE_BGT_SECRET_KEY`), which
bypasses RLS entirely. The browser client never writes to the shared tables.

**Read path:** `loadData()` reads localStorage first (immediate), then fetches the lightweight game list
(`id, name, updated_at`) from Supabase to identify any games missing locally. If any are missing, their full
`data` blobs are fetched in a **single batched query** using `.in('id', missingIds)` rather than one round trip
per game. This keeps first-sync cost at two queries total regardless of library size.

**Write path (LGT and ThingCounter):** `saveData(data)` writes to localStorage immediately, then upserts each game
to Supabase. Individual game saves go through `saveGame(game)`, which also stamps `game.last_modified`.

**Write path (TrophyHunter — debounced):** Trophy interactions write to localStorage immediately via `localSave()`
and re-render the UI without waiting for Supabase. A 2-second debounce timer (`_scheduleSync` in `main.js`)
fires a background Supabase write after the last interaction, batching rapid trophy toggles into a single write.
`_syncTimer` is explicitly set to `null` after firing so the Realtime handler can distinguish "no pending
changes" from "timer running". Timer is flushed on game switch and on opening the add-game modal to prevent
stale data.

**Collision detection:** triggered on game select via `loadGame(gameId)`. Compares `game.last_modified` (local)
against `updated_at` (Supabase). If they differ by more than 5 seconds, `showCollisionModal` (from `auth-ui.js`)
presents both timestamps and lets the user pick Local or Cloud. The loser is updated accordingly.

---

## TrophyHunter — Realtime Sync

TrophyHunter supports live cross-device sync via Supabase Realtime when `REALTIME_ENABLED = true` in `storage.js`.

**Setup requirement:** the `bgt_trophy_hunter_games` table must have Update events enabled under
**Database → Publications → supabase_realtime** in the Supabase dashboard. This is a one-time configuration.
Only Update events are needed — Insert, Delete, and Truncate are not used.

**Subscribe/unsubscribe:** `subscribeToGameChanges(userId, onRemoteUpdate)` in `storage.js` opens a
`postgres_changes` channel filtered to `UPDATE` events on `bgt_trophy_hunter_games` for the signed-in user.
`unsubscribeFromGameChanges()` tears it down. Both are called from `main.js` — on init if signed in, and on
auth state changes (sign-in → subscribe, sign-out → unsubscribe). `main.js` imports `supabase` directly from
`../../common/supabase.js` to wire the `onAuthStateChange` listener.

**Incoming update handling (`_onRemoteUpdate` in `main.js`):**

1. If `_syncTimer !== null` (local changes pending), ignore — local state takes priority.
2. Compare `remoteUpdatedAt` against `localGame.last_modified`. Skip if remote is not strictly newer.
3. Apply `trophyState` from the remote game; preserve the local `viewState` unchanged.
4. Write merged state to localStorage via `localSave()`.
5. If the affected game is currently selected, call `_doRenderMain()` to reflect the change.
6. If the game isn't in the local list at all (added on another device), add it and rebuild the selector.

**trophyState vs viewState split:** `trophyState` (earned/pinned) syncs live — it is the shared source of truth
for progress across devices. `viewState` (filter, sort, ungrouped, collapsedGroups) is intentionally preserved
from the local session on every Realtime merge. Each device maintains its own display preferences during play.
`viewState` is still written to Supabase on every save so it is available for initial load on a new device —
it just never overwrites the current session's preferences when a live update arrives.

**Kill switch:** setting `REALTIME_ENABLED = false` in `storage.js` bypasses the subscription entirely.
`subscribeToGameChanges` and `unsubscribeFromGameChanges` are no-ops when the flag is false. No other code
changes are needed — the tool falls back to the existing debounced sync behaviour automatically.

---

## TrophyHunter — Cloudflare Worker

TrophyHunter is the only tool that requires external infrastructure beyond Supabase. A Cloudflare Worker
(`bgt-psn-proxy`) acts as both a PSN API proxy and the exclusive writer to the shared Supabase tables. It holds
the PSN NPSSO session token and a Supabase secret key as environment secrets.

The worker exposes three routes:

| Route         | Method | Description                                                      |
|---------------|--------|------------------------------------------------------------------|
| `/resolve`    | GET    | CUSA/PPSA title IDs → NPWR communication IDs (surrogate account) |
| `/trophies`   | GET    | NPWR ID → full trophy list (groups + individual trophies)        |
| `/contribute` | POST   | PSN username → full title list (for lookup table enrichment)     |

**Worker responsibilities:**

- Proxies all PSN API calls using the NPSSO secret
- After each successful PSN fetch, writes the result to the appropriate shared Supabase table using
  `SUPABASE_BGT_SECRET_KEY` before returning the response to the browser
- `/trophies` writes to `bgt_trophy_hunter_catalog`
- `/resolve` and `/contribute` write to `bgt_trophy_hunter_lookup`

**Key architectural rule:** the browser client never writes to the shared tables. The worker is the sole trust
boundary for shared data — only data sourced directly from PlayStation can enter the shared catalog. The browser
reads from the shared tables and writes only to its own personal game state (`bgt_trophy_hunter_games`).

The `/trophies` route delegates to a `FetchCoordinator` Durable Object for PSN token caching and concurrent
request coalescing. Rate limiting uses a KV namespace. `DEV_MODE` is set via a Cloudflare environment variable
(not hardcoded) so it can be toggled from the dashboard without a redeploy.

---

## TrophyHunter — 4-Step Search Flow

When a user searches for a game, `storage.js` runs a four-step cascade, falling back only when the previous step
yields nothing. Before any search, the query is normalised: `™`, `®`, `©`, `:`, `-`, quotes, and other punctuation
are stripped, and whitespace is collapsed. This allows `Batman Arkham Knight` to match `Batman™: Arkham Knight`.

1. **`searchCatalog()`** — queries `bgt_trophy_hunter_catalog` by name. If found, data is already cached → instant add.
2. **`searchLookupTable()`** — queries `bgt_trophy_hunter_lookup` by name. If found, NPWR is known → call `/trophies`.
3. **Patch sites + `/resolve`** — queries OrbisPatches (PS4) and ProsperoPatches (PS5) for CUSA/PPSA IDs, then
   calls `/resolve` to get the NPWR. The worker writes new mappings to the lookup table before returning; the
   browser re-queries the lookup table to confirm.
4. **`/contribute`** — the modal asks for a PSN username. Calls `/contribute`; the worker writes all new title→NPWR
   mappings to the lookup table before returning. The browser re-queries the lookup table to find the game.
   The username itself is never stored.

Every step that discovers a new NPWR mapping causes the worker to save it to `bgt_trophy_hunter_lookup`, so the
catalog grows passively from normal search activity with no user tracking and no client-side DB writes.

Title names are normalised to Title Case (with apostrophe normalisation) before being saved to Supabase and before
being used in `ilike` search queries, ensuring consistent matching regardless of how PSN returns the name.

---

## TrophyHunter — Render Patterns

**Single-group auto-flatten:** if a game has only one trophy group (no DLC), `renderMain` forces
`viewState.ungrouped = true` via `effectiveViewState` and hides the ungroup toggle. The group header would
only duplicate the game header, so it is suppressed entirely.

**Group platinum indicator:** `computeGroupStats` scans each group's trophies for a `type === 'platinum'` entry.
If found, the group header renders the platinum trophy icon (colored if earned, dimmed if not) instead of the
standard checkmark. All other groups keep checkmarks.

**Platinum icon sizing:** the platinum icon is rendered at `size + 3` relative to peer tier icons in the same
chip row (e.g. 19px vs 16px in the game header). All icons use `display: block` and their parent chip uses
`align-items: flex-end` so every icon bottom-aligns on the same floor regardless of height difference.

**Per-tier earned/total chips:** `renderTierChips` renders `[icon] [earned]/[total]` for gold, silver, and
bronze. The earned count uses the full chip font-size (`0.75rem`) at full opacity. The separator and total use
`0.6rem` at `0.65` opacity — same tier color, reduced weight. Platinum shows icon only (always exactly one).

**Completed group tint:** when `groupStats.isComplete` is true (all trophies in the group earned, including
platinum if present), `renderGroupHeader` adds the class `th-group-complete` to the header element. The CSS
applies a fully opaque green-tinted background (`#182324` dark / `#f2f8f0` light) — computed by compositing the
rgba tint over the `--panel` base colour. Opaque backgrounds are required because the header is sticky; a
semi-transparent background causes trophy rows to bleed through.

**Sticky group headers:** `.th-group-header` uses `position: sticky; top: 6px; z-index: 10`. The 6px offset
gives visual breathing room from the viewport edge. The explicit opaque background prevents content bleed-through.
`z-index: 10` keeps headers above trophy rows but below modals (`z-index: 100+`). No JS required.

**Dimmed rows interactive:** trophies in the dimmed (unwanted) section of a filtered list are visually
de-emphasised via opacity but their earn buttons are fully clickable. Toggling a dimmed trophy triggers a full
`_doRenderMain()` so it moves to its correct section immediately.

**Section dividers:** when a filter (Earned / Unearned) is active, `filterTrophies` injects a sentinel object
`{_divider: true, _label: '...'}` between the wanted and unwanted sections. The renderer checks for `_divider`
and calls `renderSectionDivider(label)` instead of `renderTrophyRow`. The divider is only injected when both
sections are non-empty. Pinned trophies float within the wanted section only, not across the divider.

**Filter-aware toggle re-render:** when `viewState.filter !== 'all'`, `_toggleEarned` triggers a full
`_doRenderMain()` instead of a targeted row swap, so the trophy moves to its correct section immediately.
When filter is `'all'`, the cheaper targeted updates (`refreshTrophyRow`, `updateGroupHeader`,
`updateGameHeader`) are used.

**Percentage flooring:** both `computeStats` and `computeGroupStats` use `Math.floor` (not `Math.round`) for
the weighted percentage, matching PSN convention — a game missing one bronze never shows 100%.

**Selector bar height normalisation:** `.selector-bar select` and `.selector-bar .btn` both receive
`height: 35px; box-sizing: border-box`. This locks all elements in the selector bar to the same height
regardless of glyph rendering differences between the ✎ character and standard text.

---

## common/tools.js

Exports a `TOOLS` array. Each entry:

```js
{
    name: 'Display Name',
        path
:
    './ToolFolder/',
        description
:
    'One line description.'
}
```

The root `index.html` maps over this array to render the tool cards. No edits to `index.html` needed when adding
tools. Keep entries in alphabetical order by name.

---

## common/theme.js

- `initTheme(onToggle?)` — reads `bgt:theme` from localStorage, applies `.light` class to `<body>` if set, syncs
  the toggle button icon. `onToggle` is an optional callback (e.g. to redraw canvas charts after a theme switch).
- `toggleTheme()` — flips `.light` on `<body>`, writes to `bgt:theme`, calls `onToggle` if set.
- Default theme is **dark**. Light mode adds the `.light` class.

---

## common/header.js

- `initHeader(title)` — injects a `<header class="tool-header">` as the first child of `<body>`.
- Header contains: back link, centered `<h1>`, a `<div class="header-actions">` with the 👤 auth button,
  fullscreen toggle, and theme toggle.
- The 👤 button (`#authBtn`) is present in the injected HTML but inert until `initAuth()` wires it.
- The fullscreen button (`#fullscreenBtn`) is injected with `style="display:none"` and revealed only when
  `document.fullscreenEnabled` is true. It is hidden on iOS Safari and Firefox iOS where the API is unavailable.
- `toggleFullscreen()` is a global function defined in `header.js` — calls `requestFullscreen()` on
  `document.documentElement` to enter, `exitFullscreen()` to leave.
- A `fullscreenchange` event listener on `document` keeps the button icon in sync when the user exits fullscreen
  via a browser gesture (back swipe, Escape key) rather than the button. A `_fullscreenListenerAttached` guard
  prevents duplicate listeners.
- SVG icons: enter = four outward corner brackets, exit = four inward corner brackets. Both drawn on a 10×10
  viewBox using `<polyline>` strokes for crispness at small sizes. Size controlled via `.fullscreen-icon` in CSS
  (`width: 1em; height: 1em`) so it matches the emoji optical weight of neighbouring buttons.
- Called identically in every tool — there are no per-tool variations.

---

## localStorage Keys

All keys follow the pattern `bgt:tool-name:descriptor`. Namespace prefix `bgt` prevents collisions with other
projects sharing the same origin (`souliest.github.io`).

| Key                                     | Tool             | Contents                                  |
|-----------------------------------------|------------------|-------------------------------------------|
| `bgt:theme`                             | global           | `'light'` or `'dark'` (absent = dark)     |
| `bgt:auth:nudge-seen`                   | global           | `'1'` once the sign-in nudge is dismissed |
| `bgt:xp-tracker:gains`                  | XpTracker        | JSON array of `{ xp, ts }` objects        |
| `bgt:xp-tracker:start`                  | XpTracker        | Session start timestamp as string         |
| `bgt:level-goal-tracker:data`           | LevelGoalTracker | JSON `{ games: [...] }`                   |
| `bgt:level-goal-tracker:selected-game`  | LevelGoalTracker | Selected game id string (UUID)            |
| `bgt:thing-counter:data`                | ThingCounter     | JSON `{ games: [...] }`                   |
| `bgt:thing-counter:selected-game`       | ThingCounter     | Selected game id string (UUID)            |
| `bgt:thing-counter:quick-counter-val`   | ThingCounter     | Quick Counter current value               |
| `bgt:thing-counter:quick-counter-step`  | ThingCounter     | Quick Counter step size                   |
| `bgt:thing-counter:quick-counter-color` | ThingCounter     | Quick Counter accent color (hex string)   |
| `bgt:trophy-hunter:data`                | TrophyHunter     | JSON `{ games: [...] }` — personal state  |
| `bgt:trophy-hunter:selected-game`       | TrophyHunter     | Selected game id string (UUID)            |
| `bgt:trophy-hunter:catalog-cache`       | TrophyHunter     | LRU cache of up to 3 full trophy lists    |

**Rules:**

- Never clobber an existing key when migrating or defaulting
- Always use named constants for keys in `storage.js` (e.g. `export const STORAGE_KEY = 'bgt:...'`) — no inline
  string literals anywhere else in the codebase

---

## CSS Conventions

Theme variables are defined in `common/theme.css` and available everywhere.

Key variables:

```css
--bg /* page background */
--panel /* card / panel background */
--border /* borders and grid lines */
--text /* primary text */
--muted /* secondary / label text */
--accent /* primary accent (cyan: #00e5ff) */
--accent2 /* secondary accent (orange: #ff6b35) */
--accent3 /* tertiary accent (green: #7fff6b) */
--input-bg /* form input background */
--stat-bg /* stat/label row background */
--glow

/* box-shadow glow using accent color */
```

- Dark mode is the default (no class on `<body>`)
- Light mode applies when `<body>` has the `.light` class
- Fonts: `Orbitron` for headings/values, `Share Tech Mono` for body/UI
- Tool pages use a max-width centered column layout (`max-width: 640px` typical)

---

## HTML Conventions

- All `<label>` elements must have a matching `for="inputId"` attribute pointing to the associated input's `id`.
- Hidden/overlay inputs replaced by custom display elements should use `aria-label` instead of a visible `<label>`.
- Do not use inline `onclick` attributes in JavaScript-generated HTML. Always use `addEventListener` after setting
  `innerHTML`, or use `data-action` / `data-*` attributes and delegate from a parent listener.

---

## JavaScript Conventions

- Avoid optional chaining (`?.`) on DOM element properties such as `classList`. Use an explicit null check instead.
- When multiple functions need the same loaded data, pass it as a parameter rather than calling `loadData()`
  independently in each — avoids duplicate network calls and unnecessary re-parses.
- Game IDs are generated with `crypto.randomUUID()` — used as the primary key in both localStorage and Supabase.
- Node IDs within a counter tree are generated as `'node_' + Date.now() + '_' + Math.floor(Math.random() * 99999)`.
- Shared utility functions (`escHtml`, `attachLongPress`) live in `common/utils.js` and are imported from there.
  Do not redefine them locally in tool modules.

---

## Event Handling Pattern for Dynamically Rendered Nodes

When rendering tree nodes or cards via `innerHTML`, wire all interactions with `addEventListener` rather than inline
`onclick`. Use `data-action` attributes to identify button intent:

```js
el.innerHTML = `
    <button data-action="edit">✎</button>
    <button data-action="delete">🗑</button>
`;
el.querySelector('[data-action="edit"]').addEventListener('click', e => {
    e.stopPropagation();
    openEditModal(node.id);
});
```

---

## Popover / Floating UI Pattern

When a click on an element should toggle a popover open, and a `document` click listener is used to close it on
outside clicks, the toggle handler **must call `event.stopPropagation()`** to prevent the document listener from
immediately closing the popover on the same click that opened it.

```js
function togglePopover(event) {
    event.stopPropagation();   // ← essential
    const pop = document.getElementById('myPopover');
    pop.classList.toggle('open');
}

document.addEventListener('click', () => {
    const pop = document.getElementById('myPopover');
    if (pop) pop.classList.remove('open');
});
```

---

## Module Dependency Pattern

To avoid circular imports between modules, render functions do not import from modal or focus modules, and vice
versa. Instead, `main.js` owns all state and passes callbacks downward at call time.

**ThingCounter example** — `render.js` receives a `callbacks` object rather than importing interaction handlers
directly:

```js
const callbacks = {
    onCounterStep: (id, dir) => counterStep(id, dir),
    onOpenFocusModal: id => openFocusModal(id, selectedGameId),
    onAttachLongPress: (el, cb) => attachLongPress(el, cb),  // attachLongPress from common/utils.js
    // ...
};
renderMain(selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks, data);
```

**Modal save/delete callbacks** — modal and focus modules never call `renderMain()` directly. They accept an
`onSaved` / `onDeleted` callback from `main.js`, which owns the re-render:

```js
// modal.js
export async function saveGame(selectedGameId, onSaved) {
    // ... save logic ...
    onSaved(savedId);
}

// main.js
window.saveGame = () => saveGame(selectedGameId, afterGameSaved);
```

---

## Per-Tool Notes

### XpTracker (`/XpTracker/`)

**Modules:** `storage.js`, `stats.js`, `charts.js`, `render.js`, `main.js`

- Tracks XP gains in a session with timestamps
- Canvas-based charts: `gainChart` (bar + moving averages), `timeChart` (cumulative XP over time)
- **Session-local by design** — `storage.js` is synchronous and localStorage-only; no Supabase integration
- `initTheme` receives a wrapper callback: `() => { if (window.redrawCharts) window.redrawCharts(); }`
- `window.addEventListener('resize', redrawCharts)` for responsive canvas sizing
- Session resets wipe both storage keys

### LevelGoalTracker (`/LevelGoalTracker/`)

**Modules:** `storage.js`, `dates.js`, `snapshot.js`, `stats.js`, `render.js`, `modal.js`, `main.js`

- Tracks levelling progress toward a deadline across multiple games
- **Hybrid storage:** `loadData()` reads localStorage, merges from Supabase (`bgt_level_goal_tracker_games`)
- **Collision detection** runs on game select via `loadGame(gameId)`; resolved via `showCollisionModal` from
  `auth-ui.js`
- Daily snapshot rolls over at midnight: `maybeRollSnapshot(game)` checks `snapshot.date` vs today
- `setInterval(tickRenderMain, 60000)` — ticks every minute to keep daily targets current past midnight
- `renderSelector()` returns the data it loaded so callers can pass it directly without a second `loadData()` call
- `dates.js` is a pure-function leaf imported by `snapshot.js`, `stats.js`, `render.js`, and `modal.js`

### ThingCounter (`/ThingCounter/`)

**Modules:** `storage.js`, `swatches.js`, `nodes.js`, `render.js`, `focus.js`, `quick-counter.js`, `modal-node.js`,
`modal-game.js`, `modal.js` (barrel), `main.js`

- Hierarchical counter tracker: counters in an arbitrary-depth tree of branches, grouped by game
- **Hybrid storage:** `loadData()` reads localStorage, merges from Supabase (`bgt_thing_counter_games`)
- **Collision detection** runs on game select via `loadGame(gameId)`; resolved via `showCollisionModal` from
  `auth-ui.js`
- **Counter types:** `open` (unbounded) and `bounded` (min/max/initial, fill bar shown)
- **Edit mode** (global toggle): reveals node controls and ghost add buttons
- **Focus modal** (`focus.js`): tap counter name → large value display, ±1, editable step, ±step, ↺ reset, fill bar
- **Quick Counter** (`quick-counter.js`): game-agnostic scratchpad. State persists across refresh/blur; wiped on ✕ close
  or game select. `focus.js` re-exports all Quick Counter functions so `main.js` imports remain unchanged.
- **Node modals** (`modal-node.js`): swatch popover, parent selector, add/edit branch, add/edit counter — all share
  `populateParentSelect` and the `currentSwatchColor` module state
- **Game modal** (`modal-game.js`): add/edit game, game settings, reset counters, confirm-delete — fully independent
  from node modals
- **`modal.js`** is a barrel re-exporting from both `modal-node.js` and `modal-game.js`; `main.js` import list is
  unchanged
- `nodes.js` and `swatches.js` are pure-function leaves with no DOM or localStorage dependencies
- The `callbacks` object pattern is used throughout `render.js` to avoid circular imports; `attachLongPress`
  from `common/utils.js` is passed in via `callbacks.onAttachLongPress`

### TrophyHunter (`/TrophyHunter/`)

**Modules:** `storage.js`, `psn.js`, `stats.js`, `render.js`, `modal-search.js`, `modal-settings.js`, `modal.js` (
barrel), `main.js`

- Tracks PlayStation trophy progress across multiple games
- **Hybrid storage:** `loadData()` reads localStorage, merges from Supabase (`bgt_trophy_hunter_games`)
- **Debounced sync:** trophy interactions write to localStorage immediately via `localSave()` and re-render
  without waiting for Supabase. `_scheduleSync()` in `main.js` debounces the Supabase write to 2 seconds
  after the last interaction. `_syncTimer` is set to `null` after firing so the Realtime handler can
  distinguish "no pending changes" from "timer running". Timer is flushed on game switch and add-game modal open.
- **Realtime sync:** `REALTIME_ENABLED` flag in `storage.js` gates live cross-device sync. When true,
  `subscribeToGameChanges(userId, onRemoteUpdate)` opens a `postgres_changes` channel for UPDATE events on
  `bgt_trophy_hunter_games`. Incoming updates merge only `trophyState` — `viewState` is always preserved from
  the local session so each device keeps its own display preferences (filter, sort, ungrouped, collapsedGroups)
  during play. `viewState` is still persisted to Supabase on every write for initial load on new devices.
  Kill switch: set `REALTIME_ENABLED = false` to revert to debounce-only sync with no other code changes.
- **Shared catalog write path:** the browser client never writes to `bgt_trophy_hunter_catalog` or
  `bgt_trophy_hunter_lookup`. All writes to those tables go through the Cloudflare Worker using
  `SUPABASE_BGT_SECRET_KEY`, which bypasses RLS. The browser has read-only access to both shared tables.
  `saveCatalogEntry()` in `storage.js` writes to the local LRU cache only. `saveLookupEntries()` has been
  removed — the worker handles lookup writes server-side before returning each response.
- **Collision detection** runs on game select via `loadGame(gameId)`; resolved via `showCollisionModal` from
  `auth-ui.js`
- **PSN module** (`psn.js`): Cloudflare Worker calls (`workerResolve`, `workerContribute`, `workerFetchTrophies`) and
  URL constants only. These are the only functions that touch external APIs. `psn.js` has no imports — it is a pure leaf
  module. `runSearch` and `runContribute` live in `storage.js` (where they have natural access to `searchCatalog`,
  `searchLookupTable`, and `normaliseTitle`) to avoid a circular dependency. `storage.js` imports the worker calls
  from `psn.js`; `modal-search.js` imports worker calls from `psn.js` and search flow functions from `storage.js`.
- **Stats module** (`stats.js`): `computeStats` and `computeGroupStats` — pure functions with no DOM dependency.
  `render.js` re-exports them for backward compatibility; `main.js` imports directly from `stats.js`. Consistent with
  the `stats.js` pattern in LevelGoalTracker and XpTracker.
- **Search modal** (`modal-search.js`): 4-step search flow UI, contribute prompt, result rows, all internal state (
  `_currentQuery`). Uses `escHtml` from `common/utils.js`.
- **Settings modal** (`modal-settings.js`): rename, reset progress, refresh from PSN, remove game — no dependency on
  search modal
- **`modal.js`** is a barrel re-exporting from both `modal-search.js` and `modal-settings.js`; `main.js` import list is
  unchanged
- **4-step search flow** in `runSearch()` (in `storage.js`): catalog → lookup → patch sites + `/resolve` → `/contribute`
- **Search normalisation:** `stripSearchNoise()` strips `™®©`, colons, dashes, and quotes from the query
  before `ilike` matching, so `Batman Arkham Knight` matches `Batman™: Arkham Knight`
- **Cloudflare Worker** (`bgt-psn-proxy`) proxies all PSN API calls and writes results to the shared Supabase
  tables using a dedicated secret key. `DEV_MODE` is controlled via a Cloudflare environment variable.
- `main.js` imports `supabase` directly from `../../common/supabase.js` to wire `onAuthStateChange` for
  Realtime subscription management
- **Single-group auto-flatten:** games with one group force `ungrouped: true`; ungroup toggle hidden
- **Group platinum indicator:** detected by scanning group trophies for `type === 'platinum'`; renders
  platinum icon instead of checkmark for that group; platinum icon rendered at `size + 3` for visual distinction
- **Per-tier earned/total:** `renderTierChips` shows `[icon][earned]/[total]`; earned at full size/opacity,
  total at `0.6rem` / `0.65` opacity; platinum chip shows icon only
- **Completed group tint:** `th-group-complete` class added to group header when `isComplete` is true;
  fully opaque computed background colours used (`#182324` dark / `#f2f8f0` light) to prevent bleed-through
  under sticky positioning
- **Sticky group headers:** `position: sticky; top: 6px; z-index: 10` on `.th-group-header`; opaque
  background required; updates via targeted `updateGroupHeader`; collapse toggle still works while stuck
- **Dimmed rows interactive:** earn buttons on dimmed (filtered-out) trophy rows are fully clickable;
  toggling a dimmed trophy triggers full re-render so it moves to its correct section immediately
- **Section dividers:** `filterTrophies` injects a `{_divider, _label}` sentinel between wanted/unwanted
  sections when both are non-empty; renderer calls `renderSectionDivider(label)` for these
- **Filter-aware toggle:** when filter is active, `_toggleEarned` triggers full re-render so sort order
  updates immediately; when filter is `'all'`, cheaper targeted DOM updates are used
- **Percentage flooring:** `Math.floor` used in both `computeStats` and `computeGroupStats` — matches PSN
  convention, never rounds up to 100% while any trophy remains unearned
- **Selector bar height:** `height: 35px; box-sizing: border-box` on `.selector-bar select` and
  `.selector-bar .btn` normalises all three elements to identical height regardless of glyph rendering
- **`normaliseTitle()`** converts PSN title names to Title Case before saving or searching
- `modal-search.js` and `modal-settings.js` set `document.body.style.overflow = 'hidden'` on modal open, restores on
  close

---

## Decisions & Rationale

- **One `tools.js` registry** — keeps the index DRY; adding a tool is one line
- **`bgt:` prefix** — `souliest.github.io` is a shared origin; prefixing avoids stomping on other projects' keys
- **Dark-first theming** — `.light` class is additive; absence = dark (the default)
- **`initHeader` before `initTheme`** — theme toggle button must exist in DOM before `initTheme` queries for it
- **`initAuth()` awaited before `loadData()`** — ensures `getUser()` returns the restored session before any
  Supabase storage call is made
- **No inline localStorage string literals** — all keys are constants in `storage.js`
- **No inline `onclick` in generated HTML** — use `addEventListener` + `data-action` attributes
- **`stopPropagation` on popover toggles** — prevents document-level close listeners from firing on the same click
- **Hybrid storage: local-first** — localStorage gives immediate reads and offline capability; Supabase is
  secondary. If Supabase is unreachable, the app still works and syncs when connectivity returns.
- **Per-game rows in Supabase** — each game is its own row (with a `name` column) so the selector dropdown can
  be populated with a lightweight `SELECT id, name` query. Full `data` blobs are only fetched on game select
  or for games missing locally on first sync.
- **Batch fetch for missing games** — `loadData()` identifies all games missing locally, then fetches their
  full blobs in a single `.in('id', missingIds)` query. This caps first-sync cost at two queries regardless
  of library size, replacing the previous pattern of one sequential query per missing game.
- **Collision detection on game select, not on load** — checking per game on select is precise and non-intrusive
- **`showCollisionModal` in `auth-ui.js`, not tool `main.js`** — the collision UI is shared across all three
  hybrid-storage tools and its styles already live in `auth.css`. Centralising it eliminates the only verbatim
  code duplication across tool `main.js` files. `resolveCollision` is passed as a parameter rather than
  imported by `auth-ui.js` directly, keeping the dependency graph clean: `auth-ui.js` has no knowledge of any
  tool's storage module.
- **`escHtml` and `attachLongPress` in `common/utils.js`** — both were previously duplicated across tool
  modules. A single source in `common/` is easier to audit for correctness and ensures any future fix
  propagates everywhere automatically.
- **`tickRenderMain` reads localStorage only** — the interval exists solely to roll the midnight snapshot
- **`renderSelector()` returns data** — avoids calling `loadData()` twice in sequence after every save or delete
- **`crypto.randomUUID()` for game IDs** — UUIDs are collision-safe across devices; `Date.now()` is not
- **`auth-ui.js` loaded as a module import** — keeps HTML clean; leverages ES module caching
- **`import.meta.url` for CSS path in `auth-ui.js`** — resolves correctly from any tool subdirectory
- **Callbacks pattern over direct imports in `render.js`** — keeps the dependency graph a strict tree
- **TrophyHunter debounced sync instead of await-on-every-toggle** — trophy interactions are frequent and
  rapid; awaiting Supabase on each toggle creates noticeable lag. localStorage is the source of truth and is
  always written first. The debounce batches rapid toggles, reduces write volume, and keeps the UI instant.
  The timer is flushed on navigation to prevent stale cloud data.
- **TrophyHunter Realtime: trophyState-only merge** — `viewState` is excluded from Realtime merges so each
  device keeps its own display preferences (filter, sort, view options) during a session. `viewState` is still
  written to Supabase and read on initial load — it just never interrupts another device mid-play.
- **TrophyHunter Realtime: local-changes-win policy** — if `_syncTimer !== null`, incoming remote updates are
  silently dropped. This prevents a remote event from overwriting in-progress local changes. The local write
  reaches Supabase within 2 seconds and supersedes the remote state naturally.
- **TrophyHunter Realtime: kill switch flag** — `REALTIME_ENABLED` in `storage.js` lets the feature be
  disabled with a one-line change if connection limits or other issues arise. No architectural changes needed.
- **TrophyHunter Realtime: Publications not Replication** — Supabase Realtime is enabled per-table under
  Database → Publications → supabase_realtime (Update events only). Replication is a separate paid feature
  for database mirroring and is not used.
- **TrophyHunter shared tables: worker-only writes** — the browser client has read-only access to
  `bgt_trophy_hunter_catalog` and `bgt_trophy_hunter_lookup`. All writes go through the Cloudflare Worker
  using `SUPABASE_BGT_SECRET_KEY`, which bypasses RLS. This ensures only data sourced directly from PlayStation
  can enter the shared catalog, eliminating the risk of client-side catalog poisoning. The worker writes before
  returning each response, so by the time the browser re-queries the lookup table the rows are already present.
- **`saveLookupEntries()` removed** — previously a no-op wrapper kept for call-site compatibility during the
  migration. Once all call sites were updated, the function was deleted entirely. Worker handles all lookup
  writes server-side.
- **`DEV_MODE` as a Cloudflare environment variable** — previously hardcoded in the worker source, requiring a
  redeploy to toggle. Moving it to a Cloudflare variable (`env.DEV_MODE === 'true'`) allows toggling from the
  dashboard with immediate effect. The value is non-sensitive so it lives in `wrangler.toml` vars rather than
  as a secret.
- **`SUPABASE_BGT_SECRET_KEY` named per-project** — a dedicated secret key for BGT rather than the default
  secret key allows independent revocation without affecting other projects on the same Supabase instance. Each
  revocation event is also individually auditable in the Supabase audit log.
- **`showCollisionModal` moved to `common/collision.js`** — the collision UI has nothing to do with authentication; it
  is shared game-data infrastructure used by all three hybrid-storage tools. `auth-ui.js` re-exports it so existing tool
  imports are unbroken. The styles remain in `auth.css` since they share the same overlay and button patterns as the
  rest of the auth UI.
- **ThingCounter `modal-node.js` + `modal-game.js`** — the game modal (add/edit/settings/danger zone/confirm-delete) has
  no shared state or code with the branch and counter modals. Splitting makes each file's scope clear and reduces the
  size of the heaviest file in the project. `modal.js` is retained as a barrel so `main.js` imports are unchanged.
- **ThingCounter `quick-counter.js`** — the Quick Counter and the focus modal share almost no code (different DOM IDs,
  different state, different storage keys). Extracting it to its own file makes each concern findable by name.
  `focus.js` re-exports all Quick Counter symbols for backward compatibility.
- **TrophyHunter `stats.js`** — `computeStats` and `computeGroupStats` are pure functions with no DOM dependency. Both
  `main.js` and `render.js` imported them from `render.js`, which is the wrong layer; pure data functions should not
  live in a DOM-manipulation module. Consistent with the `stats.js` pattern used in LevelGoalTracker and XpTracker.
  `render.js` re-exports them for any callers that still import from there.
- **TrophyHunter `modal-search.js` + `modal-settings.js`** — the search modal has its own internal state (
  `_currentQuery`), a 4-step UI flow, a contribute prompt, and result rendering. The settings modal is a completely
  independent form with no shared state. Splitting eliminates the largest file in the project and makes each modal
  findable by name. `modal.js` is retained as a barrel.
- **TrophyHunter `psn.js`** — `modal-search.js` and `modal-settings.js` both needed worker functions, but importing them
  from `storage.js` was a layering smell: modal code was reaching into the storage layer to get non-storage functions.
  `psn.js` gives the three worker functions and URL constants a clean home. `psn.js` has no imports — it is a pure leaf
  module. `runSearch` and `runContribute` remain in `storage.js` because they call catalog/lookup helpers that live
  there; moving them to `psn.js` would create a circular dependency. `storage.js` imports the worker calls it needs
  from `psn.js`; `modal-search.js` imports worker calls from `psn.js` and search flow functions from `storage.js`.
- **TrophyHunter shared tables have no client write access** — `bgt_trophy_hunter_catalog` and
  `bgt_trophy_hunter_lookup` have public read and no client write policies. Open read access is intentional and
  safe — the data is anonymous game catalog metadata. Writes are gated at the worker level.
- **`normaliseTitle()` on both save and search** — ensures `ilike` matches work regardless of PSN capitalisation
- **`stripSearchNoise()` on query only** — stored titles remain canonical; stripping is applied at query time
  so searches are forgiving without corrupting the stored data
- **Section divider as sentinel object** — injecting `{_divider: true}` into the filtered array keeps the
  rendering logic in one place (`renderGroup`, `renderFlatList`) without needing separate before/after arrays
  or post-processing passes
- **Sticky group headers: CSS-only** — `position: sticky` requires no JS; the page header is normal flow
  (not fixed), so `top: 6px` parks the header just below the viewport edge with no offset calculation needed
- **Completed group tint: opaque computed colours** — `rgba()` backgrounds bleed through under sticky
  positioning; pre-composited hex values (`#182324`, `#f2f8f0`) provide the same visual result without
  transparency artefacts
- **Selector bar height normalisation via explicit `height`** — padding-based height matching fails because
  different glyphs (✎ vs text) have different line heights; an explicit `height: 35px` on all flex children
  of `.selector-bar` is the only reliable fix
- **Fullscreen via `document.documentElement.requestFullscreen()`** — fullscreens the entire page rather than
  a specific element, so the header, toolbar, and all content scale together naturally
- **Fullscreen button hidden when `!document.fullscreenEnabled`** — iOS Safari and Firefox iOS do not support
  the API; hiding the button entirely is cleaner than showing a broken control
- **`fullscreenchange` listener in `header.js`** — keeps the icon in sync when the user exits fullscreen via
  a browser gesture rather than the button; wired once at `initHeader` time, shared across all tools
- **Fullscreen SVG icons drawn with `<polyline>` strokes** — Unicode fullscreen glyphs have inconsistent
  rendering across Android fonts; inline SVG guarantees identical appearance on all platforms