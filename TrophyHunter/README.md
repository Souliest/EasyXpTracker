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

- Clean and responsive interface
- Full trophy list for any PlayStation game (PS3, PS4, PS5, PS Vita)
- Trophy progress header with platinum indicator, tier counts, fraction, and progress bar
- Platinum counted in total, fraction, and progress bar — distinct SVG icon, slightly larger than peer tier icons
- Per-tier earned/total counts (e.g. `3/12`) in the chips row — earned count is primary, total is secondary at
  reduced size and opacity
- Per-group progress tracking for base game and DLC expansions
- Group containing the platinum trophy shows a platinum icon instead of a checkmark
- Completed groups (all trophies earned) show a subtle green background tint on the group header
- Single-group games auto-flatten — the ungroup toggle is hidden when there is no DLC
- Hierarchy line on grouped lists, consistent with Thing Counter
- Sticky group headers — the group name and stats pin to the top of the viewport while scrolling through
  a group's trophies, with 6px of breathing room from the viewport edge
- Filter by All / Earned / Unearned — with a labeled section divider between sections when both are present;
  trophies in the dimmed section remain fully interactive
- Sort by PSN order, alphabetical, or grade; re-sorts immediately on trophy toggle when a filter is active
- Flat list mode to ungroup DLC
- Long-press any trophy to pin it (pinned trophies float to the top of their group)
- Instant UI response — trophy state writes to localStorage immediately; Supabase syncs in the background after a
  2-second debounce, batching rapid toggles into a single write
- Real-time cross-device sync — when signed in and `REALTIME_ENABLED = true` in `storage.js`, trophy state
  changes propagate silently across devices; display preferences (filter, sort, view options) are intentionally
  excluded from live sync so each device keeps its own session state
- Orphaned trophy detection — trophies removed from PSN are flagged rather than silently deleted
- Game settings: rename, reset progress, refresh from PSN, remove game
- Collision detection: if local and cloud data differ, a prompt lets you choose which to keep
- Percentage uses `Math.floor` matching PSN convention — never rounds up to 100% while any trophy is unearned
- Fullscreen toggle in the header (Firefox Android, Chrome Android, desktop) — hidden on iOS where the API is
  unavailable
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
│   ├── main.js           # Entry point: state, selector, interactions, debounced sync, Realtime, globals, init
│   ├── storage.js        # Hybrid storage: localStorage, Supabase, Realtime subscription, catalog, lookup
│   ├── psn.js            # Cloudflare Worker calls and 4-step search flow
│   ├── stats.js          # Pure stat computation: computeStats, computeGroupStats
│   ├── render.js         # All HTML section builders and DOM update functions for the main view
│   ├── modal.js          # Barrel: re-exports from modal-search.js and modal-settings.js
│   ├── modal-search.js   # Search modal, contribute prompt, result rows, 4-step search UI
│   └── modal-settings.js # Game settings modal: rename, reset, refresh from PSN, remove
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

Personal game state (which trophies you've earned and pinned) is stored locally in `localStorage` under
`bgt:trophy-hunter:data`. When signed in, each game's state is also persisted as an individual row in Supabase
(`bgt_trophy_hunter_games`). Writes go to localStorage immediately on every interaction; Supabase is updated
in the background after a 2-second debounce, batching rapid trophy toggles into a single write.

Trophy data (the actual trophy lists) is stored in a shared Supabase catalog (`bgt_trophy_hunter_catalog`) and
cached locally in an LRU cache (max 3 entries) under `bgt:trophy-hunter:catalog-cache`. This table is shared
across all users — fetching a game's trophies once makes them available to everyone.

A third shared table (`bgt_trophy_hunter_lookup`) maps game titles to their PlayStation NPWR IDs. It is populated
passively during searches and never stores user data.

---

## Real-time Sync

When signed in, Trophy Hunter can sync trophy state in real time across multiple devices using Supabase Realtime.

**To enable:** `REALTIME_ENABLED` in `storage.js` must be `true` (the default), and the `bgt_trophy_hunter_games`
table must have Update events enabled under **Database → Publications → supabase_realtime** in the Supabase
dashboard.

**To disable:** set `REALTIME_ENABLED = false` in `storage.js`. The tool falls back to the previous sync
behaviour — state is pulled on page load and on game select, and pushed after each debounced write.

**What syncs and what doesn't:** only `trophyState` (earned/pinned) is applied when a live update arrives.
`viewState` (filter, sort, ungrouped, collapsedGroups) is intentionally preserved from the local session —
each device keeps its own display preferences while playing. `viewState` is still written to Supabase on every
save, so your last-used settings are restored when you load the tool on a new device; they just don't overwrite
the current session's preferences mid-play.

**Conflict handling:** if a remote update arrives while a local debounce timer is running (i.e. you are actively
tapping trophies), the remote update is ignored. Your in-progress local changes take priority and will reach
Supabase within 2 seconds, superseding the remote state.

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
- Real-time sync on/off via `REALTIME_ENABLED` in `storage.js`

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