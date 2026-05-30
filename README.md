# BasicGamingTools

BasicGamingTools is a collection of lightweight, browser-based utilities designed to support structured progression
systems, stat tracking, and simple game-adjacent tooling.

Each tool is standalone and fully client-side. An optional account system allows data to sync across devices via
Supabase, but all tools work offline without an account.

---

## Philosophy

The goal of this repository is to provide:

- Simple, focused tools
- Clear logic and maintainable structure
- No unnecessary dependencies
- Fast, accessible browser-based usage

These projects prioritize clarity and practicality over complexity.

---

## Tools Included

### ChecklistManager

Manage resettable checklists with independent item and step filtering, resource tracking across
pinned items, and session state that resets without touching the underlying structure.

### XpTracker

Track experience points and monitor progression toward defined XP goals. Session-based and localStorage-only by design
— no sync needed for a single grinding session.

### LevelGoalTracker

Track progress from a current level to a target level with real-time updates, daily pace calculations, and optional
cross-device sync.

### PlayStation Trophy Summary Display

View your PlayStation trophy profile — level, lifetime tier counts, and completion status across your entire game
library. Links to a single PS username and auto-fetches on load. Supports per-game refresh, delta tracking since
the last full refresh, trophy group expansion, and optional cross-device sync.

### ThingCounter

Track arbitrary counters — kills, collectibles, resources, or anything else — organised into a named tree structure
grouped by game. Supports bounded and open-ended counters, decrement mode, configurable step sizes, and per-counter
colors. Supports optional cross-device sync.

### Trophy Hunter

Track PlayStation trophy progress across your games. Search for any PS3, PS4, PS5, or PS Vita title and mark
trophies as earned. Supports optional cross-device sync.

---

## Technical Overview

All tools in this repository:

- Run entirely in the browser
- Use vanilla HTML, CSS, and JavaScript (ES modules)
- Require no build tools or frameworks

**Storage:** XpTracker uses localStorage exclusively. All other tools use a hybrid model: localStorage for
immediate reads (works offline), with optional Supabase sync for cross-device persistence when the user is
signed in.

**Auth:** A shared account system (`common/auth-ui.js`) provides sign-up, sign-in, and password reset via a 👤
button in every tool header. Accounts are optional — all tools remain fully functional without one.

---

## Usage

You can:

- Open any tool locally by loading its `index.html` file in a browser
- Host individual tools via GitHub Pages
- Deploy them to any static hosting provider

No configuration is required for offline use. For cross-device sync, a Supabase project and account are needed —
see `docs/architecture.md` for setup details.

---

## Project Structure

```
BasicGamingTools/
│
├── index.html
├── README.md
├── UserGuide.md
├── docs/
│   ├── architecture.md     # Conventions, module structure, shared patterns
│   ├── storage.md          # Hybrid storage model, migrations, LRU, Realtime
│   └── trophy-hunter.md    # TrophyHunter Worker, PlayStation search, render patterns
│
├── common/
│   ├── tools.js        # Tool registry — source of truth for the root index
│   ├── migrations.js   # Versioned migrations, LRU helpers, TOOL_CONFIG
│   ├── realtime.js     # Supabase Realtime subscription factory
│   ├── theme.js        # initTheme(), toggleTheme()
│   ├── theme.css       # CSS variables, dark/light themes, shared primitives (.th-*)
│   ├── header.js       # initHeader(title) — injects shared header
│   ├── header.css      # .tool-header styles
│   ├── supabase.js     # Supabase client (URL + publishable key injected at deploy time)
│   ├── auth.js         # Session management, getUser()
│   ├── auth-ui.js      # 👤 popover, login/register/reset overlay, CSS injection
│   ├── auth.css        # Styles for auth overlay, popover, and header button
│   ├── collision.js    # showCollisionModal — shared across hybrid-storage tools
│   └── utils.js        # escHtml(), attachLongPress(), openModal(), closeModal()
│
├── XpTracker/
│   ├── index.html
│   ├── styles.css
│   ├── js/
│   │   ├── main.js
│   │   ├── storage.js
│   │   ├── stats.js
│   │   ├── charts.js
│   │   └── render.js
│   └── README.md
│
├── ChecklistManager/
│   ├── index.html
│   ├── styles.css
│   ├── js/
│   │   ├── main.js
│   │   ├── storage.js
│   │   ├── render.js
│   │   ├── modal-project.js
│   │   ├── modal-item.js
│   │   └── modal.js
│   └── README.md
│
├── LevelGoalTracker/
│   ├── index.html
│   ├── styles.css
│   ├── js/
│   │   ├── main.js
│   │   ├── storage.js
│   │   ├── dates.js
│   │   ├── snapshot.js
│   │   ├── stats.js
│   │   ├── render.js
│   │   └── modal.js
│   └── README.md
│
├── TrophySummary/
│   ├── index.html
│   ├── styles.css
│   ├── README.md
│   └── js/
│       ├── main.js
│       ├── storage.js
│       ├── psn.js
│       ├── render.js
│       └── modal.js
│
├── ThingCounter/
│   ├── index.html
│   ├── styles.css
│   ├── js/
│   │   ├── main.js
│   │   ├── storage.js
│   │   ├── swatches.js
│   │   ├── nodes.js
│   │   ├── render.js
│   │   ├── focus.js
│   │   ├── quick-counter.js
│   │   ├── modal.js
│   │   ├── modal-node.js
│   │   └── modal-game.js
│   └── README.md
│
└── TrophyHunter/
    ├── index.html
    ├── styles.css
    ├── js/
    │   ├── main.js
    │   ├── storage.js
    │   ├── psn.js
    │   ├── stats.js
    │   ├── render.js
    │   ├── modal.js
    │   ├── modal-search.js
    │   └── modal-settings.js
    └── README.md
```

---

## Future Expansion

Additional focused tools may be added over time following the same design principles.

---

## License

Free to use and modify.
