# Thing Counter

A lightweight, browser-based tool for tracking arbitrary counters during gaming sessions, organised into a named tree
structure grouped by game.

This project is fully client-side and requires no installation, backend, or external dependencies. Data is stored
locally in the browser and can optionally sync across devices when signed in.

---

## Overview

Thing Counter allows you to:

- Create counters for anything you want to track — kills, collectibles, resources, quest items, charges, or any other
  numeric value
- Organise counters into named branches, nested to any depth
- Group counter sets by game
- Persist all data locally in the browser with optional cross-device sync

The application is designed to be flexible, fast, and easy to modify.

---

## Features

- Hierarchical counter tree with arbitrary nesting
- Bounded counters (with min, max, and initial value) and open-ended counters
- Decrement mode for counters that count down rather than up
- Configurable step size per counter
- Fill bar for bounded counters showing progress between min and max
- 20-color palette for per-counter color assignment
- Focus modal for large-target interaction with a single counter
- Quick Counter — a game-agnostic scratchpad counter available without selecting a game
- Edit mode for managing tree structure
- Single-node edit via double-tap or long-press
- Alphabetical sort order per game (A↑ / A↓ / off, persisted)
- Game settings: rename, reset all counters, delete
- Clean and responsive interface
- Local storage persistence (works offline)
- Optional cross-device sync via Supabase when signed in
- Collision detection: if local and cloud data differ on game select, a prompt lets you choose which to keep
- No frameworks or build tools

---

## Project Structure

```
ThingCounter/
│
├── index.html
├── styles.css
├── js/
│   ├── main.js          # Entry point: state, tree interactions, globals, init
│   ├── storage.js       # Hybrid storage: localStorage keys, loadData, saveData, loadGame, saveGame, resolveCollision, deleteGame
│   ├── swatches.js      # Color palette data and lookup helper
│   ├── nodes.js         # Pure tree helpers: find, insert, remove, clamp, etc.
│   ├── render.js        # Tree, counter card, and branch row rendering
│   ├── focus.js         # Focus modal (per-counter large-target view); re-exports Quick Counter
│   ├── quick-counter.js # Quick Counter modal — game-agnostic scratchpad counter
│   ├── modal.js         # Barrel: re-exports from modal-node.js and modal-game.js
│   ├── modal-node.js    # Swatch popover, parent selector, add/edit branch, add/edit counter
│   └── modal-game.js    # Add/edit game, game settings, reset counters, confirm-delete
└── README.md
```

---

## Usage

1. Open `index.html` in a browser
2. Create a game with `+ Game`
3. Add branches and counters using the tree action bar
4. Tap a counter's `+` or `−` to update its value
5. Tap a counter's name to open the focus modal for detailed interaction
6. Use **⚡ Quick Counter** from the no-game screen for a fast, game-agnostic scratchpad counter

Data is saved automatically in your browser using localStorage. Sign in via the 👤 button in the header to sync
data across devices.

---

## Storage

Game data is stored locally in `localStorage` under `bgt:thing-counter:data`. When signed in, each game is also
persisted as an individual row in Supabase (`bgt_thing_counter_games`). Writes go to both stores; reads come from
localStorage immediately and merge from Supabase on tool load.

---

## Customization

You can modify:

- Layout in `index.html`
- Styling in `styles.css`
- Logic and counter behavior in the `js/` modules

No build process is required.

---

## Hosting

This project can be hosted on any static hosting platform, including:

- GitHub Pages
- Other static hosting providers

It can also be run locally without any setup.

---

## Credits

This project was built with assistance from Claude for development support and refinement.

---

## License

Free to use and modify.