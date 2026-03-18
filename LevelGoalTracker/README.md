# Level Goal Tracker

A lightweight, browser-based tool for tracking progress from a current level to a defined goal level.

This project is fully client-side and requires no installation, backend, or external dependencies. Data is stored
locally in the browser and can optionally sync across devices when signed in.

---

## Overview

Level Goal Tracker allows you to:

- Set a current level and a target level with a deadline
- Track daily required pace and whether you're ahead or behind
- Define checkpoints with optional rewards
- Persist data locally and optionally sync across devices

The application is designed to be simple, fast, and easy to modify.

---

## Features

- Clean and responsive interface
- Daily target calculation with automatic midnight rollover
- Baseline vs. revised pace tracking
- Checkpoint progress with optional reward tracking
- Backdate support for goals already in progress
- Local storage persistence (works offline)
- Optional cross-device sync via Supabase when signed in
- Collision detection: if local and cloud data differ, a prompt lets you choose which to keep
- No page reloads required
- No frameworks or build tools

---

## Project Structure

```
LevelGoalTracker/
│
├── index.html
├── styles.css
├── js/
│   ├── main.js       # Entry point: state, selector, renderMain, globals, init
│   ├── storage.js    # Hybrid storage: localStorage keys, loadData, saveData, loadGame, saveGame, resolveCollision, deleteGame
│   ├── dates.js      # Pure date helpers: todayStr, daysBetween, formatDate, etc.
│   ├── snapshot.js   # Daily snapshot rollover and target calculation
│   ├── stats.js      # Pure computed stats: pace, progress, track status
│   ├── render.js     # HTML section builders for the main view
│   └── modal.js      # Add/edit/delete game modal and confirm-delete flow
└── README.md
```

---

## Usage

1. Open `index.html` in a browser
2. Click **+ Add** to create a game entry
3. Enter a name, current level, goal level, and deadline
4. Add at least one checkpoint level
5. Click **Update** each day to log your current level

Data is saved automatically in your browser using localStorage. Sign in via the 👤 button in the header to sync
data across devices.

---

## Storage

Game data is stored locally in `localStorage` under `bgt:level-goal-tracker:data`. When signed in, each game is
also persisted as an individual row in Supabase (`bgt_level_goal_tracker_games`). Writes go to both stores;
reads come from localStorage immediately and merge from Supabase on tool load.

---

## Customization

You can modify:

- Layout in `index.html`
- Styling in `styles.css`
- Logic and calculations in the `js/` modules

No build process is required.

---

## Hosting

This project can be hosted on any static hosting platform, including:

- GitHub Pages
- Other static hosting providers

It can also be run locally without any setup.

---

## License

Free to use and modify.