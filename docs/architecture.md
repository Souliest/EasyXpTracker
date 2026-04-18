# BasicGamingTools — Architecture Reference

Developer orientation document. For storage internals see `docs/storage.md`.
For TrophyHunter-specific infrastructure see `docs/trophy-hunter.md`.

---

## Repository Structure

```
BasicGamingTools/
├── index.html
├── README.md
├── docs/
│   ├── architecture.md     # This file — conventions and shared patterns
│   ├── storage.md          # Hybrid storage model, migrations, LRU, Realtime
│   └── trophy-hunter.md    # TrophyHunter Worker, PSN search, render patterns
├── common/
│   ├── tools.js            # TOOLS array — single source of truth for the index
│   ├── migrations.js       # Versioned migrations, LRU helpers, TOOL_CONFIG
│   ├── theme.js            # initTheme(), toggleTheme()
│   ├── theme.css
│   ├── header.js           # initHeader(title)
│   ├── header.css
│   ├── supabase.js         # Supabase client
│   ├── auth.js             # Session management, getUser()
│   ├── auth-ui.js          # 👤 popover, login/register/reset overlay, CSS injection
│   ├── auth.css
│   ├── collision.js        # showCollisionModal — shared across hybrid-storage tools
│   └── utils.js            # escHtml(), attachLongPress()
└── ToolName/
    ├── index.html
    ├── styles.css
    └── js/
        ├── main.js         # Entry point — state, event wiring, globals, init IIFE
        ├── storage.js      # loadData, saveData, and storage key constants
        └── [other modules]
```

---

## Adding a New Tool

1. Create a `ToolName/` folder with `index.html`, `styles.css`, and a `js/` directory.
2. Add one entry to `common/tools.js` — the root index updates automatically.
3. Add a `TOOL_CONFIG` entry in `common/migrations.js` with the tool's storage key and index fields.
4. Follow the script load order and storage key conventions below.

---

## Script Load Order

```html

<script src="../common/theme.js"></script>
<script src="../common/header.js"></script>
<script>
  initHeader('Tool Title');
  initTheme(optionalCallback);
</script>
<script type="module" src="js/main.js"></script>
```

`initHeader` before `initTheme` — the theme toggle button must exist before `initTheme` looks for it.
`type="module"` scripts are deferred by spec; functions called from inline HTML handlers must be assigned
to `window` in `main.js`.

`auth-ui.js` is imported by `main.js`, not loaded as a separate `<script>`:

```js
import {initAuth} from '../../common/auth-ui.js';

(async function init() {
    await initAuth();   // must be awaited before loadData()
    const data = await loadData();
    // ...
})();
```

---

## Module Structure

| Module                | Contents                                                                                                                                   |
|-----------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `storage.js`          | Storage key constants, `loadData()`, `saveData()`, and (for hybrid tools) `loadGame()`, `saveGame()`, `resolveCollision()`, `deleteGame()` |
| `render.js`           | All render / DOM-update functions — receive data as parameters, no internal `loadData()` calls                                             |
| `main.js`             | Module-level state, event wiring, `window.*` globals, init IIFE                                                                            |
| Tool-specific modules | Pure helpers (dates, stats, nodes), modal logic, focus modals, etc.                                                                        |

---

## Auth Module Chain

```
common/supabase.js   ← Supabase JS client from CDN
    ↑
common/auth.js       ← manages session, exposes getUser()
    ↑
common/auth-ui.js    ← injects overlay/popover; re-exports showCollisionModal
    ↑
tool/js/main.js      ← imports initAuth and showCollisionModal
tool/js/storage.js   ← imports getUser (cached module)
```

---

## common/migrations.js

Single home for:

- `CURRENT_VERSION` — bump when adding a migration.
- `TOOL_CONFIG` — per-tool storage key, legacy key, and index field list.
- `runMigrations(toolConfig)` — called at the top of every `loadData()` and `loadGame()`. No-op when already current.
- LRU cache helpers: `cacheGet`, `cacheSet`, `cacheDelete`, `updateIndex`.
- Migration transform functions — never deleted.

See `docs/storage.md` for the full storage model and migration guide.

---

## common/utils.js

**`escHtml(str)`** — escapes user-supplied or external strings for safe `innerHTML` insertion.

**`attachLongPress(el, callback)`** — fires `callback` after a 500ms hold. Cancels on >10px pointer movement.
Used for single-node edit in ThingCounter and trophy pinning in TrophyHunter.

---

## Collision Modal

`showCollisionModal` lives in `common/collision.js`, re-exported from `common/auth-ui.js`.

```js
showCollisionModal(gameId, gameName, collision, resolveCollision, onResolved)
```

`resolveCollision` is passed in (not imported by `auth-ui.js`) so the dependency graph stays clean.

---

## common/tools.js

Exports a `TOOLS` array. Each entry:

```js
{
    name: 'Display Name', path
:
    './ToolFolder/', description
:
    'One line.'
}
```

Root `index.html` maps over this array. Keep entries alphabetical.

---

## common/theme.js

- `initTheme(onToggle?)` — reads `bgt:theme`, applies `.light` to `<body>`, syncs toggle icon.
- `toggleTheme()` — flips `.light`, writes to `bgt:theme`, calls `onToggle` if set.
- Default is dark. Light mode adds `.light`.

---

## common/header.js

- `initHeader(title)` — injects `<header class="tool-header">` as first child of `<body>`.
- Header contains: back link, centered `<h1>`, `<div class="header-actions">` with 👤, fullscreen, and theme toggle.
- Fullscreen button hidden when `!document.fullscreenEnabled` (iOS Safari/Firefox iOS).
- `fullscreenchange` listener keeps icon in sync with browser-gesture exits.
- SVG fullscreen icons: four outward corners (enter), four inward (exit). Drawn on 10×10 viewBox with `<polyline>`.

---

## CSS Conventions

Key variables from `common/theme.css`:

```css
--bg /* page background */
--panel /* card / panel background */
--border /* borders */
--text /* primary text */
--muted /* secondary text */
--accent /* cyan #00e5ff */
--accent2 /* orange #ff6b35 */
--accent3 /* green #7fff6b */
--input-bg
--stat-bg
--glow
```

- Dark mode is default (no class). Light mode: `.light` on `<body>`.
- Fonts: `Orbitron` (headings/values), `Share Tech Mono` (body/UI).
- Max-width centered column layout (`640px` typical).

---

## HTML Conventions

- All `<label>` elements must have a matching `for="inputId"`.
- Hidden/overlay inputs use `aria-label`.
- No inline `onclick` in JavaScript-generated HTML — use `addEventListener` + `data-action` attributes.

---

## JavaScript Conventions

- Avoid optional chaining (`?.`) on DOM element properties such as `classList`. Use explicit null checks.
- Pass loaded data as a parameter rather than calling `loadData()` independently in multiple functions.
- Game IDs: `crypto.randomUUID()`.
- Node IDs: `'node_' + Date.now() + '_' + Math.floor(Math.random() * 99999)`.
- `escHtml` and `attachLongPress` from `common/utils.js` — never redefine locally.

---

## Event Handling Pattern for Dynamic Nodes

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

Toggle handlers must call `event.stopPropagation()` to prevent the document-level close listener from
immediately closing the popover on the same click that opened it.

```js
function togglePopover(event) {
    event.stopPropagation();
    document.getElementById('myPopover').classList.toggle('open');
}

document.addEventListener('click', () => {
    document.getElementById('myPopover')?.classList.remove('open');
});
```

---

## Module Dependency Pattern

Render functions do not import from modal or focus modules, and vice versa. `main.js` owns state
and passes callbacks downward:

```js
const callbacks = {
    onCounterStep: (id, dir) => counterStep(id, dir),
    onOpenFocusModal: id => openFocusModal(id, selectedGameId),
    onAttachLongPress: (el, cb) => attachLongPress(el, cb),
};
renderMain(selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks, stored);
```

Modal save/delete callbacks flow upward through `main.js`:

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

### XpTracker

- Session-local by design — `storage.js` is synchronous and localStorage-only.
- Canvas charts: `gainChart` (bar + moving averages), `timeChart` (cumulative XP).
- `initTheme` receives a redraw callback for chart re-rendering on theme switch.
- `window.addEventListener('resize', redrawCharts)` for responsive canvas sizing.

### LevelGoalTracker

- Hybrid storage — see `docs/storage.md`.
- `dates.js` is a pure-function leaf imported by `snapshot.js`, `stats.js`, `render.js`, `modal.js`.
- `maybeRollSnapshot(game)` checks `snapshot.date` vs today; rolls at midnight.
- `setInterval(tickRenderMain, 60000)` keeps daily targets current past midnight.
- `modal.js` reads game data from the blob cache (`stored.blobs[id]`) for edit and the index for confirm-delete (name
  available even if blob is evicted).

### ThingCounter

- Hybrid storage — see `docs/storage.md`.
- Counter types: `open` (unbounded) and `bounded` (min/max/initial, fill bar shown).
- Edit mode (global toggle): reveals node controls and ghost add buttons.
- Focus modal (`focus.js`): large value display, ±1, editable step. Reads/writes directly from the blob cache — no
  `loadData()` call.
- Quick Counter (`quick-counter.js`): game-agnostic scratchpad. State persists across refresh/blur; wiped on ✕ or game
  select. Re-exported from `focus.js` for backward-compatible imports.
- `modal-node.js` and `modal-game.js` both read from `stored.blobs[selectedGameId]` directly — no `loadData()` call.
- `modal.js` is a barrel re-exporting from both node and game modals.
- `nodes.js` and `swatches.js` are pure-function leaves.
- The `callbacks` object pattern avoids circular imports between `render.js` and interaction handlers.

### TrophyHunter

See `docs/trophy-hunter.md` for Worker, PSN search flow, catalog cache, and render patterns.

- Hybrid storage with debounced Supabase sync — see `docs/storage.md`.
- `_personalData` in `main.js` holds `{ index, blobs }` — drives the selector only.
- `_selectedGameBlob` holds the full game object for the currently-selected game.
- `modal-search.js` receives `personalIndex` (the index array) for the "already in list" check.
- `modal.js` is a barrel re-exporting from `modal-search.js` and `modal-settings.js`.
- `psn.js` is a pure leaf — worker calls and URL constants only, no imports.
- `stats.js` pure functions; re-exported from `render.js` for backward compatibility.

---

## localStorage Keys

| Key                                     | Tool             | Contents                                  |
|-----------------------------------------|------------------|-------------------------------------------|
| `bgt:theme`                             | global           | `'light'` or `'dark'` (absent = dark)     |
| `bgt:auth:nudge-seen`                   | global           | `'1'` once the sign-in nudge is dismissed |
| `bgt:xp-tracker:gains`                  | XpTracker        | JSON array of `{ xp, ts }` objects        |
| `bgt:xp-tracker:start`                  | XpTracker        | Session start timestamp                   |
| `bgt:level-goal-tracker:v2`             | LevelGoalTracker | `{ version, index, blobs, lruOrder }`     |
| `bgt:level-goal-tracker:selected-game`  | LevelGoalTracker | Selected game UUID                        |
| `bgt:thing-counter:v2`                  | ThingCounter     | `{ version, index, blobs, lruOrder }`     |
| `bgt:thing-counter:selected-game`       | ThingCounter     | Selected game UUID                        |
| `bgt:thing-counter:quick-counter-val`   | ThingCounter     | Quick Counter current value               |
| `bgt:thing-counter:quick-counter-step`  | ThingCounter     | Quick Counter step size                   |
| `bgt:thing-counter:quick-counter-color` | ThingCounter     | Quick Counter accent color (hex string)   |
| `bgt:trophy-hunter:v2`                  | TrophyHunter     | `{ version, index, blobs, lruOrder }`     |
| `bgt:trophy-hunter:selected-game`       | TrophyHunter     | Selected game UUID                        |
| `bgt:trophy-hunter:catalog-cache`       | TrophyHunter     | LRU cache of up to 3 trophy list blobs    |

**Rules:** use named constants in `storage.js`, never inline string literals elsewhere.

---

## Decisions & Rationale

- **One `tools.js` registry** — adding a tool is one line; index stays DRY.
- **`bgt:` prefix** — `souliest.github.io` is a shared origin; prefix avoids key collisions.
- **Dark-first theming** — `.light` is additive; absence = dark.
- **`initHeader` before `initTheme`** — theme toggle must exist before `initTheme` queries for it.
- **`initAuth()` awaited before `loadData()`** — ensures `getUser()` returns the restored session.
- **No inline localStorage string literals** — all keys are named constants in `storage.js`.
- **No inline `onclick` in generated HTML** — `addEventListener` + `data-action`.
- **`stopPropagation` on popover toggles** — prevents document-level close on the opening click.
- **Callbacks pattern over direct imports in `render.js`** — keeps the dependency graph a strict tree.
- **`crypto.randomUUID()` for game IDs** — collision-safe across devices; `Date.now()` is not.
- **`auth-ui.js` loaded as a module import** — clean HTML; ES module caching means one fetch.
- **`import.meta.url` for CSS path in `auth-ui.js`** — resolves correctly from any tool subdirectory.
- **`showCollisionModal` in `common/collision.js`** — shared across all three hybrid tools; styles in `auth.css`.
  Re-exported from `auth-ui.js` for backward compatibility.
- **`escHtml` and `attachLongPress` in `common/utils.js`** — previously duplicated across tools; one source is easier to
  audit and ensures fixes propagate everywhere.
- **`renderSelector()` returns data** — avoids calling `loadData()` twice after every save or delete.
- **`tickRenderMain` reads localStorage only** — the interval exists solely to roll the midnight snapshot; no Supabase
  call needed.
- **Fullscreen via `document.documentElement.requestFullscreen()`** — fullscreens the entire page so header, toolbar,
  and content scale together.
- **Fullscreen button hidden when `!document.fullscreenEnabled`** — iOS Safari/Firefox iOS don't support the API; hiding
  is cleaner than a broken control.
- **`fullscreenchange` listener in `header.js`** — keeps icon in sync when the user exits via browser gesture; wired
  once at `initHeader` time.
- **Fullscreen SVG icons with `<polyline>` strokes** — Unicode fullscreen glyphs render inconsistently across Android
  fonts; inline SVG guarantees identical appearance everywhere.
- **`docs/` folder for architecture docs** — keeps root clean; READMEs stay adjacent to their tools (user-facing),
  architecture docs live together (developer-facing).
- **Split into `architecture.md`, `storage.md`, `trophy-hunter.md`** — storage is a large self-contained topic shared
  across three tools; TrophyHunter has substantial infrastructure (Worker, PSN, render quirks) that would crowd the
  shared conventions doc. LGT and ThingCounter don't have enough unique architecture beyond what's in their READMEs.