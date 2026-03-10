# BasicGamingTools — Architecture Reference

This document captures the conventions, patterns, and decisions used across all tools.
Paste it at the start of a new session to orient quickly.

---

## Repository Structure

```
BasicGamingTools/
├── index.html                  # Root tool index — dynamically built from tools.js
├── ARCHITECTURE.md             # This file
├── common/
│   ├── tools.js                # TOOLS array — the single source of truth for the index
│   ├── theme.js                # initTheme(), toggleTheme() — shared across all tools
│   ├── theme.css               # CSS variables, dark/light themes
│   ├── header.js               # initHeader(title) — injects shared header into every tool
│   └── header.css              # .tool-header styles
└── ToolName/
    ├── index.html
    ├── styles.css
    └── script.js
```

---

## Adding a New Tool

1. Create a `ToolName/` folder with `index.html`, `styles.css`, `script.js`
2. Add one entry to `common/tools.js` — the root index updates automatically
3. Follow the script load order and storage key conventions below

---

## Script Load Order (every tool page)

```html
<script src="../common/theme.js"></script>
<script src="../common/header.js"></script>
<script>
  initHeader('Tool Title');
  initTheme(optionalCallback); <!-- pass a redraw function if the tool has canvas charts -->
</script>
<script src="script.js"></script>
```

`initHeader` must be called before `initTheme` so the theme toggle button exists in the DOM when `initTheme` looks for it.

---

## common/tools.js

Exports a `TOOLS` array. Each entry:

```js
{ name: 'Display Name', path: './ToolFolder/', description: 'One line description.' }
```

The root `index.html` maps over this array to render the tool cards. No edits to `index.html` needed when adding tools.

---

## common/theme.js

- `initTheme(onToggle?)` — reads `bgt:theme` from localStorage, applies `.light` class to `<body>` if set, syncs the toggle button icon. `onToggle` is an optional callback (e.g. to redraw canvas charts after a theme switch).
- `toggleTheme()` — flips `.light` on `<body>`, writes to `bgt:theme`, calls `onToggle` if set.
- Default theme is **dark**. Light mode adds the `.light` class.

---

## common/header.js

- `initHeader(title)` — injects a `<header class="tool-header">` as the first child of `<body>`.
- Header contains: back link (← on mobile, ← Tools on ≥400px), centered `<h1>`, theme toggle button.
- Called identically in every tool — there are no per-tool variations.

---

## localStorage Keys

All keys follow the pattern `bgt:tool-name:descriptor`. Namespace prefix `bgt` prevents collisions with other projects sharing the same origin (`souliest.github.io`).

| Key | Tool | Contents |
|---|---|---|
| `bgt:theme` | global | `'light'` or `'dark'` (absent = dark) |
| `bgt:xp-tracker:gains` | XpTracker | JSON array of `{ xp, ts }` objects |
| `bgt:xp-tracker:start` | XpTracker | Session start timestamp as string |
| `bgt:level-goal-tracker:data` | LevelGoalTracker | JSON `{ games: [...] }` |
| `bgt:level-goal-tracker:selected-game` | LevelGoalTracker | Selected game id string |

**Rules:**
- Never clobber an existing new-format key when migrating or defaulting
- Always use named constants for keys in `script.js` (e.g. `const STORAGE_KEY = 'bgt:...'`) — no inline string literals

---

## CSS Conventions

Theme variables are defined in `common/theme.css` and available everywhere.

Key variables:
```css
--bg          /* page background */
--surface     /* card / panel background */
--border      /* borders and grid lines */
--text        /* primary text */
--muted       /* secondary / label text */
--accent      /* primary accent (cyan: #00e5ff) */
```

- Dark mode is the default (no class on `<body>`)
- Light mode applies when `<body>` has the `.light` class
- Font: `Share Tech Mono, monospace` throughout
- Tool pages use a max-width centered column layout

---

## Per-Tool Notes

### XpTracker (`/XpTracker/`)
- Tracks XP gains in a session with timestamps
- Canvas-based charts: `gainChart` (bar + moving averages), `timeChart` (cumulative XP over time)
- `initTheme(redrawCharts)` — charts must be redrawn on theme toggle to pick up new CSS variable values
- `window.addEventListener('resize', redrawCharts)` for responsive canvas sizing
- Session resets wipe both storage keys

### LevelGoalTracker (`/LevelGoalTracker/`)
- Tracks levelling progress toward a deadline across multiple games
- Daily snapshot rolls over at midnight: `maybeRollSnapshot(game)` checks `snapshot.date` vs today
- `initTheme()` called with no callback — no canvas
- `setInterval(renderMain, 60000)` — auto-refreshes every minute so daily targets stay current
- Game data is a single JSON blob under `bgt:level-goal-tracker:data`; selected game id is stored separately

---

## Decisions & Rationale

- **One `tools.js` registry** — keeps the index DRY; adding a tool is one line
- **`bgt:` prefix** — `souliest.github.io` is a shared origin; prefixing avoids stomping on other projects' keys
- **Dark-first theming** — `.light` class is additive; absence of the class = dark, which is the default
- **`initHeader` before `initTheme`** — theme toggle button must exist in DOM before `initTheme` queries for it
- **No inline localStorage string literals** — all keys are constants so they're easy to find and change