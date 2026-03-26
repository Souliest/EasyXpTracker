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
│   └── auth.css                # Styles for auth overlay, popover, collision modal, header button
└── ToolName/
    ├── index.html
    ├── styles.css
    └── js/
        ├── main.js             # Entry point — state, event wiring, globals, init
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
    ↑
tool/js/main.js      ← imports initAuth from auth-ui.js; also imports storage.js
tool/js/storage.js   ← imports getUser from auth.js (cached module, no extra fetch)
```

The browser fetches `supabase.js` and `auth.js` once per page load regardless of how many modules import them —
ES module imports are cached by URL.

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

The shared tables have public read and anonymous insert access (RLS enabled, no update/delete policies). The
personal games table is restricted to `auth.uid() = user_id`.

**Read path:** `loadData()` reads localStorage first (immediate), then fetches the game list from Supabase and
merges any games that exist remotely but not locally. Full game blobs are only fetched for games missing locally.

**Write path (LGT and ThingCounter):** `saveData(data)` writes to localStorage immediately, then upserts each game
to Supabase. Individual game saves go through `saveGame(game)`, which also stamps `game.last_modified`.

**Write path (TrophyHunter — debounced):** Trophy interactions write to localStorage immediately via `localSave()`
and re-render the UI without waiting for Supabase. A 2-second debounce timer (`_scheduleSync` in `main.js`)
fires a background Supabase write after the last interaction, batching rapid trophy toggles into a single write.
The timer is flushed synchronously on game switch and on opening the add-game modal to prevent stale data.

**Collision detection:** triggered on game select via `loadGame(gameId)`. Compares `game.last_modified` (local)
against `updated_at` (Supabase). If they differ by more than 5 seconds, a modal presents both timestamps and lets
the user pick Local or Cloud. The loser is updated accordingly.

---

## TrophyHunter — Cloudflare Worker

TrophyHunter is the only tool that requires external infrastructure beyond Supabase. A Cloudflare Worker
(`bgt-psn-proxy`) acts as a PSN API proxy, holding the NPSSO session token as an environment secret.

The worker exposes three routes:

| Route         | Method | Description                                                      |
|---------------|--------|------------------------------------------------------------------|
| `/resolve`    | GET    | CUSA/PPSA title IDs → NPWR communication IDs (surrogate account) |
| `/trophies`   | GET    | NPWR ID → full trophy list (groups + individual trophies)        |
| `/contribute` | POST   | PSN username → full title list (for lookup table enrichment)     |

**Key architectural rule:** the worker never touches Supabase. It is a pure PSN proxy. All Supabase reads and
writes are performed by `storage.js` in the browser. The worker returns data; `storage.js` decides what to save
and where.

The `/trophies` route delegates to a `FetchCoordinator` Durable Object for PSN token caching and concurrent
request coalescing. Rate limiting uses a KV namespace.

---

## TrophyHunter — 4-Step Search Flow

When a user searches for a game, `storage.js` runs a four-step cascade, falling back only when the previous step
yields nothing. Before any search, the query is normalised: `™`, `®`, `©`, `:`, `-`, quotes, and other punctuation
are stripped using Unicode escapes (`\uXXXX`) to avoid ambiguous character class duplication, and whitespace is
collapsed. This allows `Batman Arkham Knight` to match `Batman™: Arkham Knight`.

1. **`searchCatalog()`** — queries `bgt_trophy_hunter_catalog` by name. If found, data is already cached → instant add.
2. **`searchLookupTable()`** — queries `bgt_trophy_hunter_lookup` by name. If found, NPWR is known → call `/trophies`.
3. **Patch sites + `/resolve`** — queries OrbisPatches (PS4) and ProsperoPatches (PS5) for CUSA/PPSA IDs, then
   calls `/resolve` to get the NPWR. Saves new mappings to the lookup table passively.
4. **`/contribute`** — the modal asks for a PSN username. Calls `/contribute`, saves all new title→NPWR mappings
   to the lookup table, then retries step 2. The username itself is never stored.

Every step that discovers a new NPWR mapping saves it to `bgt_trophy_hunter_lookup`, so the catalog grows
passively from normal search activity with no user tracking.

Title names are normalised to Title Case (with apostrophe normalisation via Unicode escapes) before being saved to
Supabase and before being used in `ilike` search queries, ensuring consistent matching regardless of how PSN
returns the name.

---

## TrophyHunter — Render Patterns

**Single-group auto-flatten:** if a game has only one trophy group (no DLC), `renderMain` forces
`viewState.ungrouped = true` via `effectiveViewState` and hides the ungroup toggle. The group header would
only duplicate the game header, so it is suppressed entirely.

**Group platinum indicator:** `computeGroupStats` scans each group's trophies for a `type === 'platinum'` entry.
If found, the group header renders the platinum trophy SVG (colored if earned, dimmed if not) instead of the
standard checkmark. All other groups keep checkmarks.

**Platinum SVG icon:** rendered as two SVG paths — the cup shape and a small star emblem punched over the cup face
using a solid dark fill (`#1a1a2e`). This is visually distinct from gold/silver/bronze at any size without
requiring extra vertical space. The `viewBox` is `0 0 16 20` for all tiers.

**Trophy weights:** `computeStats` and `computeGroupStats` both calculate a `weightedEarned` / `weightedTotal`
alongside raw counts, using Sony's official point values (Bronze 15, Silver 30, Gold 90, Platinum 0). The progress
bar and percentage use weighted values. The fraction always uses raw counts including platinum. Platinum is
excluded from weighted progress following Sony's own convention.

**Stats layout — portrait:** two rows below the title row. Row 1: tier chips left-aligned, fraction right-aligned.
Row 2: progress bar (max-width capped) left-aligned, percentage right-aligned. Applies to both the game header
and each group header (group stats always appear below the group name line).

**Stats layout — landscape (≥480px):** single right-aligned row: chips, then a 24px gap to fraction, then a 24px
gap to bar, then percentage. Both game header and group header use this layout.

**Tier chip order:** always Platinum → Gold → Silver → Bronze. Platinum chip is included in the chips group when
`hasPlatinum` is true (game header), or rendered as the `leadingIndicator` passed into `renderTierChips` (group
header, where the completion indicator doubles as the platinum chip to avoid duplication).

**Section dividers:** when a filter (Earned / Unearned) is active, `filterTrophies` always injects a leading
sentinel `{_divider: true, _label}` at the start of the primary section, and a second sentinel before the
secondary section if non-empty. The divider label is color-coded: green (`var(--accent3)`) for Earned, red
(`#ff4444`) for Unearned. Dividers appear in both flat list and per-group rendering.

**Group divider reconstruction:** `renderGroup` handles three cases explicitly — no filter (pin whole list),
one section only (leading divider + trophies), two sections (leading divider + wanted + secondary divider +
unwanted). Pinning is applied within the primary section only, preserving divider positions.

**Collapse state persistence:** `viewState.collapsedGroups` is an array of group IDs stored inside the game's
personal data in localStorage (and synced to Supabase via the debounce). `renderGroup` reads it to set the
initial `collapsed` class and toggle character. `_toggleGroup` in `main.js` performs a targeted DOM update
(no full re-render) and writes the updated array to localStorage immediately.

**Filter-aware toggle re-render:** when `viewState.filter !== 'all'`, `_toggleEarned` triggers a full
`_doRenderMain()` instead of a targeted row swap, so the trophy moves to its correct section immediately.
When filter is `'all'`, the cheaper targeted updates (`refreshTrophyRow`, `updateGroupHeader`,
`updateGameHeader`) are used.

**Game icon display:** `object-fit: contain` (not `cover`) so the full icon is visible at correct aspect ratio,
letterboxed against the panel background. Title allows up to 2 lines (`-webkit-line-clamp: 2`) before truncating
with ellipsis.

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
- Header contains: back link, centered `<h1>`, a `<div class="header-actions">` with the 👤 auth button and
  theme toggle.
- The 👤 button (`#authBtn`) is present in the injected HTML but inert until `initAuth()` wires it.
- Called identically in every tool — there are no per-tool variations.

---

## localStorage Keys

All keys follow the pattern `bgt:tool-name:descriptor`. Namespace prefix `bgt` prevents collisions with other
projects sharing the same origin (`souliest.github.io`).

| Key                                     | Tool             | Contents                                                    |
|-----------------------------------------|------------------|-------------------------------------------------------------|
| `bgt:theme`                             | global           | `'light'` or `'dark'` (absent = dark)                       |
| `bgt:auth:nudge-seen`                   | global           | `'1'` once the sign-in nudge is dismissed                   |
| `bgt:xp-tracker:gains`                  | XpTracker        | JSON array of `{ xp, ts }` objects                          |
| `bgt:xp-tracker:start`                  | XpTracker        | Session start timestamp as string                           |
| `bgt:level-goal-tracker:data`           | LevelGoalTracker | JSON `{ games: [...] }`                                     |
| `bgt:level-goal-tracker:selected-game`  | LevelGoalTracker | Selected game id string (UUID)                              |
| `bgt:thing-counter:data`                | ThingCounter     | JSON `{ games: [...] }`                                     |
| `bgt:thing-counter:selected-game`       | ThingCounter     | Selected game id string (UUID)                              |
| `bgt:thing-counter:quick-counter-val`   | ThingCounter     | Quick Counter current value                                 |
| `bgt:thing-counter:quick-counter-step`  | ThingCounter     | Quick Counter step size                                     |
| `bgt:thing-counter:quick-counter-color` | ThingCounter     | Quick Counter accent color (hex string)                     |
| `bgt:trophy-hunter:data`                | TrophyHunter     | JSON `{ games: [...] }` — personal state including collapse |
| `bgt:trophy-hunter:selected-game`       | TrophyHunter     | Selected game id string (UUID)                              |
| `bgt:trophy-hunter:catalog-cache`       | TrophyHunter     | LRU cache of up to 3 full trophy lists                      |

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
- Regex character classes containing Unicode characters (curly quotes, special dashes, etc.) must use `\uXXXX`
  escape sequences rather than literal UTF-8 characters to avoid duplicate-character linter warnings and
  parser ambiguity.

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
- **Collision detection** runs on game select via `loadGame(gameId)`; resolved via modal in `main.js`
- Daily snapshot rolls over at midnight: `maybeRollSnapshot(game)` checks `snapshot.date` vs today
- `setInterval(tickRenderMain, 60000)` — ticks every minute to keep daily targets current past midnight
- `renderSelector()` returns the data it loaded so callers can pass it directly without a second `loadData()` call
- `dates.js` is a pure-function leaf imported by `snapshot.js`, `stats.js`, `render.js`, and `modal.js`

### ThingCounter (`/ThingCounter/`)

**Modules:** `storage.js`, `swatches.js`, `nodes.js`, `render.js`, `focus.js`, `modal.js`, `main.js`

- Hierarchical counter tracker: counters in an arbitrary-depth tree of branches, grouped by game
- **Hybrid storage:** `loadData()` reads localStorage, merges from Supabase (`bgt_thing_counter_games`)
- **Collision detection** runs on game select via `loadGame(gameId)`; resolved via modal in `main.js`
- **Counter types:** `open` (unbounded) and `bounded` (min/max/initial, fill bar shown)
- **Edit mode** (global toggle): reveals node controls and ghost add buttons
- **Focus modal**: tap counter name → large value display, ±1, editable step, ±step, ↺ reset, fill bar
- **Quick Counter**: game-agnostic scratchpad. State persists across refresh/blur; wiped on ✕ close or game select
- `nodes.js` and `swatches.js` are pure-function leaves with no DOM or localStorage dependencies
- The `callbacks` object pattern is used throughout `render.js` to avoid circular imports

### TrophyHunter (`/TrophyHunter/`)

**Modules:** `storage.js`, `render.js`, `modal.js`, `main.js`

- Tracks PlayStation trophy progress across multiple games
- **Hybrid storage:** `loadData()` reads localStorage, merges from Supabase (`bgt_trophy_hunter_games`)
- **Debounced sync:** trophy interactions write to localStorage immediately via `localSave()` and re-render
  without waiting for Supabase. `_scheduleSync()` in `main.js` debounces the Supabase write to 2 seconds
  after the last interaction. Timer is flushed on game switch and add-game modal open.
- **Shared catalog:** `bgt_trophy_hunter_catalog` stores full trophy lists shared across all users
- **Shared lookup table:** `bgt_trophy_hunter_lookup` maps title names to NPWR IDs; populated passively
- **Collision detection** runs on game select via `loadGame(gameId)`; resolved via modal in `main.js`
- **4-step search flow** in `runSearch()`: catalog → lookup → patch sites + `/resolve` → `/contribute`
- **Search normalisation:** `stripSearchNoise()` strips `™®©`, colons, dashes, and quotes using `\uXXXX`
  Unicode escapes before `ilike` matching. `normaliseTitle()` also uses Unicode escapes for apostrophe
  variants. Both functions avoid literal UTF-8 in regex character classes.
- **Cloudflare Worker** (`bgt-psn-proxy`) proxies all PSN API calls; never touches Supabase
- **Single-group auto-flatten:** games with one group force `ungrouped: true`; ungroup toggle hidden
- **Group platinum indicator:** detected by scanning group trophies for `type === 'platinum'`; renders
  platinum SVG icon (cup + star emblem) instead of checkmark for that group
- **Platinum SVG:** two-path render — cup in tier color (`#d4c5f9`), star emblem in `#1a1a2e`. Same
  `viewBox="0 0 16 20"` as gold/silver/bronze, no extra height needed.
- **Trophy weights:** Sony official values — Bronze 15, Silver 30, Gold 90, Platinum 0. Progress bar and
  percentage use weighted totals; fraction uses raw counts including platinum.
- **Tier chip order:** always P → G → S → B. For game header, platinum chip is part of `renderTierChips`
  when `hasPlatinum` is true. For group headers, the completion indicator (checkmark or platinum icon) is
  passed as `leadingIndicator` to `renderTierChips` to avoid rendering two platinum icons.
- **Stats layout:** portrait = two rows (chips + fraction / bar + percentage); landscape ≥480px = single
  right-aligned row with 24px gaps between sections. Group stats always below the group name line.
- **Section dividers:** `filterTrophies` always injects a leading `{_divider, _label}` sentinel for the
  primary section, plus a secondary sentinel if both sections are non-empty. Dividers are color-coded:
  green for Earned (`var(--accent3)`), red for Unearned (`#ff4444`). Appear in both flat and grouped mode.
- **Group divider reconstruction:** `renderGroup` explicitly handles three cases: no filter, one section
  (leading divider only), two sections (leading + secondary divider). Pinning applied within primary section.
- **Collapse state persistence:** `viewState.collapsedGroups` (array of group IDs) lives inside each game's
  personal data object in localStorage. Written immediately on toggle via `localSave()`; synced to Supabase
  via the 2-second debounce. `_toggleGroup` in `main.js` does a targeted DOM update — no full re-render.
- **Filter-aware toggle:** when filter is active, `_toggleEarned` triggers full re-render so sort order
  updates immediately; when filter is `'all'`, cheaper targeted DOM updates are used
- **Game icon:** `object-fit: contain` to show full icon at correct aspect ratio. Title: `-webkit-line-clamp: 2`
  before ellipsis.
- **`normaliseTitle()`** converts PSN title names to Title Case before saving or searching
- `modal.js` sets `document.body.style.overflow = 'hidden'` on modal open, restores on close

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
  be populated with a lightweight `SELECT id, name` query. Full `data` blobs are only fetched on game select.
- **Collision detection on game select, not on load** — checking per game on select is precise and non-intrusive
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
- **TrophyHunter worker is a pure PSN proxy** — keeping Supabase out of the worker consolidates all
  orchestration logic in `storage.js`, avoids a second set of credentials in Cloudflare, and keeps the
  worker simple and stateless (except for the Durable Object token cache).
- **TrophyHunter shared tables have no user data** — `bgt_trophy_hunter_catalog` and
  `bgt_trophy_hunter_lookup` are anonymous game catalog data. Open read/insert access is intentional and safe.
- **`normaliseTitle()` on both save and search** — ensures `ilike` matches work regardless of PSN capitalisation
- **`stripSearchNoise()` on query only** — stored titles remain canonical; stripping is applied at query time
  so searches are forgiving without corrupting the stored data
- **Unicode escapes in regex** — literal UTF-8 curly quotes and special dashes in character classes are
  flagged as duplicates by linters because the parser may not distinguish them from their ASCII counterparts.
  `\uXXXX` is unambiguous and avoids the warning.
- **Section divider as sentinel object** — injecting `{_divider: true}` into the filtered array keeps the
  rendering logic in one place without needing separate before/after arrays or post-processing passes
- **Leading divider always injected** — having a header for every active section (not just as a separator
  between two sections) means the user always knows which section they're looking at, especially in groups
  where only one section may be non-empty
- **Collapse state in `viewState.collapsedGroups`** — storing group IDs as an array inside the game's
  `viewState` object means collapse state travels with the game data: it syncs to Supabase, survives
  page reloads, and persists across filter and sort changes without any extra storage key
- **`_toggleGroup` targeted DOM update** — collapse toggling doesn't change any trophy data or stats;
  a full re-render would be wasteful. The toggle only flips a CSS class and updates the chevron character,
  both of which are cheap targeted DOM operations
- **Platinum excluded from weighted progress** — follows Sony's own convention: earning all gold/silver/bronze
  trophies is what drives the bar; the platinum is the reward for completing everything else, not a step
  along the way. The fraction still counts it so the player sees an accurate trophy total.
- **Trophy weight ratios (15/30/90)** — Sony's official point values. The 1:2:6 ratio reflects the real
  relative difficulty of bronze/silver/gold on PSN. Using official values means the weighted percentage
  matches what players are already familiar with from their PSN profile.