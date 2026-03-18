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
  initTheme(optionalCallback); // pass a redraw function if the tool has canvas charts
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

| Module                | Contents                                                                                                                             |
|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `storage.js`          | Storage key constants, `loadData()`, `saveData()`, and (for LGT/TC) `loadGame()`, `saveGame()`, `resolveCollision()`, `deleteGame()` |
| `render.js`           | All render / DOM-update functions — receive data as parameters, no internal `loadData()` calls                                       |
| `main.js`             | Module-level state, event wiring, `window.*` globals, init IIFE                                                                      |
| Tool-specific modules | Pure helpers (dates, stats, nodes), modal logic, focus modals, etc.                                                                  |

`storage.js` for LGT and ThingCounter is an **async hybrid**: reads from `localStorage` immediately, merges from
Supabase when the user is signed in, and writes to both stores on every save. XpTracker's `storage.js` remains
synchronous and localStorage-only — it is session-scoped by design.

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

## Hybrid Storage Pattern (LGT and ThingCounter)

Each tool that syncs to Supabase stores one row per game in its table:

| Table                          | Tool             |
|--------------------------------|------------------|
| `bgt_level_goal_tracker_games` | LevelGoalTracker |
| `bgt_thing_counter_games`      | ThingCounter     |

Schema per table: `id uuid pk`, `user_id uuid → auth.users`, `name text`, `data jsonb`, `updated_at timestamptz`.
RLS policies restrict all operations to `auth.uid() = user_id`.

**Read path:** `loadData()` reads localStorage first (immediate), then fetches the game list from Supabase and
merges any games that exist remotely but not locally. Full game blobs are only fetched for games missing locally.

**Write path:** `saveData(data)` writes to localStorage immediately, then upserts each game to Supabase. Individual
game saves go through `saveGame(game)`, which also stamps `game.last_modified`.

**Collision detection:** triggered on game select via `loadGame(gameId)`. Compares `game.last_modified` (local)
against `updated_at` (Supabase). If they differ by more than 5 seconds, a modal presents both timestamps and lets
the user pick Local or Cloud. The loser is updated accordingly.

---

## common/tools.js

Exports a `TOOLS` array. Each entry:

```js
{
    name: 'Display Name', path
:
    './ToolFolder/', description
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
- `setInterval(tickRenderMain, 60000)` — ticks every minute to keep daily targets current past midnight.
  `tickRenderMain` reads localStorage directly (no Supabase call) and only pushes to Supabase if the snapshot
  actually rolled. Supabase is pulled from only once: on game select.
- `renderSelector()` returns the data it loaded so callers can pass it directly to `renderMain(data)` without
  a second `loadData()` call
- `dates.js` is a pure-function leaf imported by `snapshot.js`, `stats.js`, `render.js`, and `modal.js`

### ThingCounter (`/ThingCounter/`)

**Modules:** `storage.js`, `swatches.js`, `nodes.js`, `render.js`, `focus.js`, `modal.js`, `main.js`

- Hierarchical counter tracker: counters in an arbitrary-depth tree of branches, grouped by game
- **Hybrid storage:** `loadData()` reads localStorage, merges from Supabase (`bgt_thing_counter_games`)
- **Collision detection** runs on game select via `loadGame(gameId)`; resolved via modal in `main.js`
- `renderSelector()` returns the data it loaded so callers (`afterGameSaved`, `afterGameDeleted`) can pass it
  directly to `doRenderMain(data)` without a second `loadData()` call
- **Two UI bars:** selector bar and tree action bar (visible only when a game is selected)
- **Counter types:** `open` (unbounded, value ≥ 0) and `bounded` (min/max/initial, fill bar shown)
- **Decrement counters** (`decrement: true`): dominant button is `−`
- **Edit mode** (global toggle): reveals node controls and ghost add buttons
- **Single-node edit mode**: double-click or long-press any node, without entering global edit mode
- **Focus modal**: tap counter name → large value display, ±1, editable step, ±step, ↺ reset, fill bar
- **Quick Counter**: game-agnostic scratchpad. State persists across refresh/blur; wiped on ✕ close or game select
- `focus.js` holds both the focus modal and Quick Counter; exposes `setFocusGameId(id)` and `syncFocusIfOpen(nodeId)`
- `nodes.js` and `swatches.js` are pure-function leaves with no DOM or localStorage dependencies
- The `callbacks` object pattern is used throughout `render.js` to avoid circular imports

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
- **Collision detection on game select, not on load** — checking per game on select is precise and non-intrusive.
  Checking the whole tool on load would be coarser and harder to reason about.
- **`tickRenderMain` reads localStorage only** — the database can't change itself between sessions. The interval
  exists solely to roll the midnight snapshot; it should not make network calls for that purpose.
- **`renderSelector()` returns data** — avoids the anti-pattern of calling `loadData()` twice in sequence
  (once inside `renderSelector`, once again in the callback) after every save or delete
- **`crypto.randomUUID()` for game IDs** — UUIDs serve as the primary key in both localStorage and Supabase,
  so they must be globally unique. The old `'game_' + Date.now()` pattern is not collision-safe across devices.
- **`auth-ui.js` loaded as a module import, not a script tag** — keeps HTML clean, leverages ES module caching
  so `auth.js` and `supabase.js` are fetched once regardless of how many modules import them
- **`import.meta.url` for CSS path in `auth-ui.js`** — the module always knows its own URL, so the CSS path
  resolves correctly whether the page is the root `index.html` or a tool subdirectory
- **Separate Add and Edit modals per node type** — cleaner UX; avoids type-change complexity when editing
- **Callbacks pattern over direct imports in `render.js`** — keeps the dependency graph a strict tree, with
  `main.js` at the root
- **`setFocusGameId` instead of threading `selectedGameId` everywhere** — the focus modal needs the current game
  id for many operations; a single setter on game change is cleaner than adding it to every function signature