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
│   ├── supabase.js         # Supabase client (URL + publishable key injected at deploy time)
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

**`openModal(overlayEl, triggerEl?)`** — lightweight focus trap for modal dialogs. Sets `inert` on every
direct child of `<body>` except the overlay, then moves focus to the first focusable element inside the
modal. Stores `triggerEl` so focus returns to it on close.

**`closeModal(overlayEl)`** — releases the focus trap set by `openModal`: removes `inert` from all
previously-inerted siblings and restores focus to the stored trigger element (if still in the document).

Usage pattern (same in all tools):

```js
import { openModal as trapOpen, closeModal as trapClose } from '../../common/utils.js';

function openMyModal() {
    const overlay = document.getElementById('myOverlay');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

function closeMyModal() {
    const overlay = document.getElementById('myOverlay');
    overlay.classList.remove('open');
    trapClose(overlay);
}
```

The auth overlay (`#authOverlay`) and collision overlay (`#collisionOverlay`) are intentionally excluded
from the inert sweep — they manage their own focus and stack on top of tool modals.

---

## Collision Modal

`showCollisionModal` lives in `common/collision.js`, re-exported from `common/auth-ui.js`.

```js
showCollisionModal(gameId, gameName, collision, resolveCollision, onResolved)
```

`resolveCollision` is passed in (not imported by `auth-ui.js`) so the dependency graph stays clean.

`validateRemoteData(data)` is also exported from `common/collision.js`. It validates the shape of a
remote payload before it is passed to `resolveCollision` — rejects non-objects, prototype pollution
keys (`__proto__`, `constructor`), and payloads missing required `id`/`name` fields. Returns `null`
on failure, which callers treat as "keep local". Used internally by `showCollisionModal` and available
for direct use by tools if needed.

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

**Selector-bar height normalisation** — `common/header.css` includes a shared rule that locks
`.selector-bar select` and `.selector-bar .btn` to `height: 35px; box-sizing: border-box`. This
keeps the dropdown, glyph-only buttons (✎), and text buttons visually aligned across browsers.
Tool stylesheets must not override this height for selector-bar children.

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
- Numeric form fields must be parsed with `_parseInt`/`_parseFloat` helpers (see LevelGoalTracker
  `modal.js`) rather than raw `parseInt`/`parseFloat` — raw parsers return `NaN` for blank strings,
  which `JSON.stringify` silently converts to `null` and corrupts calculated fields.

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

## Security

### Supabase publishable key

`common/supabase.js` contains placeholder strings (`__SUPABASE_URL__`, `__SUPABASE_KEY__`) rather than
hardcoded credentials. The real values are injected at deploy time by the GitHub Actions workflow
(`.github/workflows/deploy.yml`) via repository secrets.

The key is a Supabase publishable key (format `sb_publishable_...`) — these are intentionally
browser-visible and designed to be public-facing. RLS policies on all Supabase tables are the
authoritative access control boundary; the key alone grants nothing beyond what RLS permits.

To rotate the key: create a new publishable key in the Supabase dashboard (Project Settings → API
Keys), update the `SUPABASE_KEY` repository secret (repo Settings → Secrets and variables → Actions),
then trigger a redeploy. Rotation does not invalidate user sessions when using the new `sb_publishable_`
key format.

### CI / deploy pipeline

`.github/workflows/deploy.yml` runs on every push to `main` and on manual `workflow_dispatch`. It:

1. Checks out `main`.
2. Substitutes `__SUPABASE_URL__` and `__SUPABASE_KEY__` in `common/supabase.js` using `sed`.
3. Fails loudly (`exit 1`) if either secret is missing or if placeholders remain after substitution.
4. Pushes the substituted files to the `gh-pages` branch via `peaceiris/actions-gh-pages`.

GitHub Pages is configured to deploy from the `gh-pages` branch. The `main` branch never contains
live credentials. The `gh-pages` branch is managed entirely by the Action — do not push to it directly.

### URL sanitisation

External URLs (e.g. game icon URLs from the PSN catalog) must be validated before assignment to DOM
properties. `TrophyHunter/js/modal-search.js` exports `_safeIconUrl(url)` which allows only `http:`
and `https:` protocols, blocking `javascript:` and `data:` vectors before `img.src` assignment.
Apply the same pattern wherever external URLs are used as DOM property values.

### Realtime channel names

Supabase Realtime channel names in `LevelGoalTracker/js/storage.js` and `ThingCounter/js/storage.js`
follow the pattern `tool-games-{userId}`. These names are scoped to this Supabase project and are not
visible to other projects or users. The userId suffix is a convenience to avoid cross-user event
delivery within the same project; RLS on each table is the authoritative access control boundary.
Predictable channel names are not a security concern under this model.

### Cloudflare Worker — X-User-Id header

The `X-User-Id` header sent by `TrophyHunter/js/psn.js` to the Cloudflare Worker is used for
attribution and logging only. It is never used for authorization or access control decisions on the
worker side. Spoofing it has no security consequence.

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
- `modal.js` reads game data from the blob cache (`stored.blobs[id]`) for edit and the index for
  confirm-delete (name available even if blob is evicted).
- `modal.js` uses `_parseInt`/`_parseFloat` helpers for all numeric form fields to prevent `NaN`
  from entering the data store via blank inputs.
- `modal.js` uses `_showError(msg)` / `_clearError()` for inline validation feedback — no `alert()`
  calls. The error `<div id="gameModalError">` sits below `.modal-actions` in the modal HTML and
  is styled by `.modal-error` in `styles.css`.
- On edit, `snapshot.initialDailyLevel` is preserved unless the snapshot date has not yet rolled to
  today (stale day) or the user lowered their level below the recorded start-of-day value. This
  prevents an edit mid-day from wiping intra-day progress in the Daily Progress panel.
- `stats.js` emits `trackStatus === 'deadline'` (icon ⏰) when `daysLeft === 0` and the goal is not
  yet reached. This avoids the misleading 🔴 "behind" state that arose because `requiredPace` is
  `Infinity` on deadline day, making the pace-threshold comparison always fail.
- `modal.js` calls `trapOpen`/`trapClose` from `common/utils.js` on every modal open/close to manage
  focus trapping and focus restoration.

### ThingCounter

- Hybrid storage — see `docs/storage.md`.
- Counter types: `open` (unbounded) and `bounded` (min/max/initial, fill bar shown).
- Edit mode (global toggle): reveals node controls and ghost add buttons.
- Focus modal (`focus.js`): large value display, ±1, editable step. Reads/writes directly from the
  blob cache — no `loadData()` call. The `.focus-value-display` element carries `aria-live="polite"`
  and `aria-atomic="true"` so screen readers announce value changes.
- Quick Counter (`quick-counter.js`): game-agnostic scratchpad. State persists across refresh/blur;
  wiped on ✕ or game select. Re-exported from `focus.js` for backward-compatible imports. The
  `.focus-value-display` in the Quick Counter modal also carries `aria-live`/`aria-atomic`.
- `modal-node.js`, `modal-game.js`, `focus.js`, and `quick-counter.js` all call `trapOpen`/`trapClose`
  from `common/utils.js` on every modal open/close for focus trapping and restoration.
- `modal.js` is a barrel re-exporting from both node and game modals.
- `nodes.js` and `swatches.js` are pure-function leaves.
- The `callbacks` object pattern avoids circular imports between `render.js` and interaction handlers.
- `game.sortOrder` stores `'asc'`, `'desc'`, or `null` (no sort). `cycleSortOrder` uses an explicit
  ternary on `game.sortOrder ?? null` — never a string-keyed lookup object — to avoid silent failure
  if a stale stored value were ever the literal string `'null'`.

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
- **`showCollisionModal` in `common/collision.js`** — shared across all three hybrid tools; styles in
  `auth.css`. Re-exported from `auth-ui.js` for backward compatibility.
- **`validateRemoteData` in `common/collision.js`** — remote Realtime payloads are untrusted network
  data. Validating shape before `cacheSet` prevents a crafted payload from corrupting the local blob
  store. Exported so tools can call it independently if needed.
- **`_safeIconUrl` in `modal-search.js`** — `img.src` assignment is safe from HTML injection but a
  `javascript:` URL still executes in some browsers. Protocol allowlisting (`http:`/`https:` only)
  closes the vector without affecting legitimate PSN icon URLs, which are always HTTPS.
- **`_parseInt`/`_parseFloat` in `modal.js` (LevelGoalTracker)** — `parseInt("")` returns `NaN`;
  `JSON.stringify(NaN)` produces `null`; `null` silently breaks pace calculations. Centralised helpers
  make the guard impossible to forget and easy to audit.
- **`snapshot.initialDailyLevel` preserved on edit (LevelGoalTracker)** — the edit path previously
  reset `initialDailyLevel` to the current level unconditionally, erasing any progress made earlier
  that day. It is now only reset when the snapshot date hasn't rolled to today yet, or when the user
  explicitly lowers their level below the recorded day-start value.
- **`trackStatus === 'deadline'` for `daysLeft === 0` (LevelGoalTracker)** — when the deadline day
  arrives, `requiredPace` is `Infinity`, which made `delta >= -requiredPace * 0.2` always false,
  so every unfinished game showed 🔴 "behind". A dedicated status (⏰) is emitted before the
  pace comparison and renders a distinct "Deadline reached" message.
- **`cycleSortOrder` uses explicit ternary, not a string-keyed object (ThingCounter)** — the previous
  `{null: 'asc', asc: 'desc', desc: null}[game.sortOrder || 'null']` lookup worked in practice but
  would silently misbehave if `sortOrder` were ever stored as the string `'null'`. An explicit
  `game.sortOrder ?? null` ternary is unambiguous and easier to follow.
- **Supabase key injected at deploy time** — the publishable key is browser-visible by design, but
  keeping it out of source history means forks don't get working credentials, rotation requires no
  code change, and secret scanning tools won't flag the repo.
- **`peaceiris/actions-gh-pages` pushes to `gh-pages` branch** — the workflow does not use the
  official `actions/deploy-pages` action, so GitHub Pages must be configured to deploy from the
  `gh-pages` branch (not "GitHub Actions" source mode). The `gh-pages` branch is managed entirely
  by the Action; do not push to it directly.
- **`escHtml` and `attachLongPress` in `common/utils.js`** — previously duplicated across tools;
  one source is easier to audit and ensures fixes propagate everywhere.
- **`renderSelector()` returns data** — avoids calling `loadData()` twice after every save or delete.
- **`tickRenderMain` reads localStorage only** — the interval exists solely to roll the midnight
  snapshot; no Supabase call needed.
- **Fullscreen via `document.documentElement.requestFullscreen()`** — fullscreens the entire page so
  header, toolbar, and content scale together.
- **Fullscreen button hidden when `!document.fullscreenEnabled`** — iOS Safari/Firefox iOS don't
  support the API; hiding is cleaner than a broken control.
- **`fullscreenchange` listener in `header.js`** — keeps icon in sync when the user exits via browser
  gesture; wired once at `initHeader` time.
- **Fullscreen SVG icons with `<polyline>` strokes** — Unicode fullscreen glyphs render
  inconsistently across Android fonts; inline SVG guarantees identical appearance everywhere.
- **`docs/` folder for architecture docs** — keeps root clean; READMEs stay adjacent to their tools
  (user-facing), architecture docs live together (developer-facing).
- **Split into `architecture.md`, `storage.md`, `trophy-hunter.md`** — storage is a large
  self-contained topic shared across three tools; TrophyHunter has substantial infrastructure
  (Worker, PSN, render quirks) that would crowd the shared conventions doc.
- **`openModal`/`closeModal` focus-trap in `common/utils.js`** — `inert` on background content is
  the correct accessible approach (prevents Tab, pointer, and assistive-technology interaction with
  background elements simultaneously). A CSS-only approach cannot trap AT focus. The auth and
  collision overlays are excluded from the sweep because they stack on top and manage their own
  focus independently.
- **Selector-bar height rule in `common/header.css`** — ThingCounter and TrophyHunter both have a
  glyph-only ✎ button in the selector bar that renders shorter than a text button at the same
  padding. Putting the `height: 35px; box-sizing: border-box` rule in `header.css` means all three
  tools that load `header.css` get the fix automatically; LevelGoalTracker benefits too even though
  it has no ✎ button.
- **Inline modal errors in LevelGoalTracker** — `alert()` is disruptive (blocks the page, cannot
  be styled) and moves focus away from the form. Inline errors in a `role="alert"` div inside the
  modal keep context, are announced by screen readers, and match the design system used by the auth
  modal. The error is cleared on every modal open so stale messages never carry over.
- **`aria-live="polite"` + `aria-atomic="true"` on `.focus-value-display` (ThingCounter)** — the
  display element is styled text updated by JS; without a live region, screen readers never announce
  the new value when the ±1/±step buttons are tapped. `polite` avoids interrupting in-progress
  announcements; `atomic` ensures the full value (e.g. "42 / 100") is read rather than just the
  changed characters.
- **`refreshTrophyList` + `#th-trophy-list` wrapper (TrophyHunter)** — when a filter is active and
  a trophy is toggled, the previous code called `_doRenderMain()` which destroyed and recreated the
  toolbar `<select>` elements, causing a visible flash. The fix wraps the trophy list in a stable
  `<div id="th-trophy-list">` and exports `refreshTrophyList` to replace only that portion. The
  game header and toolbar are left untouched, so no flash occurs. The group-header click listeners
  are re-wired inside the container after each list refresh.