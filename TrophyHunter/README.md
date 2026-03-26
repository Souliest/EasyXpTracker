# Trophy Hunter

A lightweight, browser-based tool for tracking PlayStation trophy progress across your games.

This project is fully client-side and requires no installation, backend, or external dependencies. Data is stored
locally in the browser and can optionally sync across devices when signed in.

---

## Overview

Trophy Hunter allows you to:

- Search for PlayStation games by title and add them to your tracking list
- Browse the full trophy list for any game, grouped by base game and DLC
- Mark individual trophies as earned
- Pin unearned trophies to keep them at the top of the list
- Filter and sort trophies by status, name, or grade
- Refresh a game's trophy data from PlayStation at any time

The application is designed to be fast and practical — no PlayStation account required, no login to Sony.

---

## Features

- Clean and responsive interface optimised for portrait mobile
- Full trophy list for any PlayStation game (PS3, PS4, PS5, PS Vita)
- Trophy progress header with tier counts (Platinum → Gold → Silver → Bronze), fraction, and weighted progress bar
- Progress bar and percentage use Sony's official trophy point weights (Bronze 15 / Silver 30 / Gold 90);
  platinum is excluded from weighted progress following Sony convention
- Fraction (earned/total) always uses raw counts including platinum
- Platinum trophy rendered as a distinct SVG icon with a star emblem; colored when earned, dimmed when not
- Per-group progress tracking for base game and DLC expansions
- Group containing the platinum trophy shows a platinum icon instead of a checkmark
- Single-group games auto-flatten — the ungroup toggle is hidden when there is no DLC
- Hierarchy line on grouped lists
- Filter by All / Earned / Unearned — labeled section headers appear at the top of each section
  (green Earned header, red Unearned header), both in flat list and per-group
- Sort by PSN order, alphabetical, or grade; re-sorts immediately on trophy toggle when a filter is active
- Flat list mode to ungroup DLC
- Long-press any trophy to pin it (pinned trophies float to the top of their group)
- Group collapse/expand state persisted across reloads, refreshes, and filter changes
- Instant UI response — trophy state writes to localStorage immediately; Supabase syncs in the background
  after a 2-second debounce, batching rapid toggles into a single write
- Orphaned trophy detection — trophies removed from PSN are flagged rather than silently deleted
- Game settings: rename, reset progress, refresh from PSN, remove game
- Collision detection: if local and cloud data differ, a prompt lets you choose which to keep
- Scroll locked under modals
- Local storage persistence (works offline)
- Optional cross-device sync via Supabase when signed in
- No frameworks or build tools

---

## Project Structure

```
TrophyHunter/
│
├── index.html
├── styles.css
├── js/
│   ├── main.js       # Entry point: state, selector, interactions, debounced sync, globals, init
│   ├── storage.js    # Hybrid storage: localStorage, Supabase, worker calls, 4-step search flow
│   ├── render.js     # All HTML section builders and DOM update functions for the main view
│   └── modal.js      # Search modal, contribute prompt, game settings modal
└── README.md
```

---

## Usage

1. Open `index.html` in a browser
2. Click **+ Add Game** to search for a PlayStation game
3. Select a result to download its trophy list from PlayStation
4. Mark trophies as earned by clicking the checkbox on each row
5. Long-press a trophy to pin it for quick reference
6. Use the filter and sort controls in the toolbar to focus on what matters

Data is saved automatically in your browser using localStorage. Sign in via the 👤 button in the header to sync
data across devices.

---

## Search Flow

Trophy Hunter uses a four-step cascade to find games, falling back to the next step only when the previous one
yields nothing. Search queries are normalised before matching — special characters like `™`, `:`, and `-` are
stripped so that e.g. `Batman Arkham Knight` matches `Batman™: Arkham Knight`.

1. **Catalog** — searches the shared Supabase trophy catalog. Instant add if found.
2. **Lookup table** — searches a shared NPWR mapping table. Fetches trophies from PlayStation if found.
3. **Patch sites** — queries OrbisPatches (PS4) and ProsperoPatches (PS5) for CUSA/PPSA IDs, then resolves them
   to NPWR IDs via a PlayStation surrogate account lookup.
4. **Contribute** — if all else fails, the modal asks for a PSN username from someone who has played the game.
   Their title list is fetched, the game's NPWR ID is saved to the shared lookup table for future searches, and
   the search retries automatically. The username itself is never stored.

Every step that discovers a new title→NPWR mapping saves it passively to the shared lookup table, so the catalog
grows over time without any manual curation.

---

## Storage

Personal game state (which trophies you've earned and pinned, plus group collapse state) is stored locally in
`localStorage` under `bgt:trophy-hunter:data`. When signed in, each game's state is also persisted as an
individual row in Supabase (`bgt_trophy_hunter_games`). Writes go to localStorage immediately on every
interaction; Supabase is updated in the background after a 2-second debounce, batching rapid trophy toggles
into a single write.

Trophy data (the actual trophy lists) is stored in a shared Supabase catalog (`bgt_trophy_hunter_catalog`) and
cached locally in an LRU cache (max 3 entries) under `bgt:trophy-hunter:catalog-cache`. This table is shared
across all users — fetching a game's trophies once makes them available to everyone.

A third shared table (`bgt_trophy_hunter_lookup`) maps game titles to their PlayStation NPWR IDs. It is populated
passively during searches and never stores user data.

---

## Infrastructure

Trophy Hunter relies on a Cloudflare Worker (`bgt-psn-proxy`) as a PlayStation API proxy. The worker holds the
PSN session token as an environment secret and exposes three routes:

| Route         | Method | Description                                                      |
|---------------|--------|------------------------------------------------------------------|
| `/resolve`    | GET    | Resolves CUSA/PPSA title IDs to NPWR communication IDs           |
| `/trophies`   | GET    | Fetches the full trophy list for a given NPWR ID                 |
| `/contribute` | POST   | Fetches a PSN user's full title list for lookup table enrichment |

The worker never connects to Supabase. All Supabase reads and writes are handled by `storage.js` in the browser.

---

## Customization

You can modify:

- Layout in `index.html`
- Styling in `styles.css`
- Logic and search behavior in the `js/` modules

No build process is required.

---

## Hosting

This project can be hosted on any static hosting platform, including:

- GitHub Pages
- Other static hosting providers

It can also be run locally without any setup. The Cloudflare Worker must be deployed separately.

---

## License

Free to use and modify.