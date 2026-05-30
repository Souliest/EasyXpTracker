# BasicGamingTools — User Guide

A collection of lightweight, browser-based utilities for tracking progress and counting things while gaming.
Everything runs locally in your browser — no internet connection is required, and all tools work fully offline.

An optional account system lets you sync data across devices. Your data is stored in Supabase only when you choose
to sign in. See [Account & Sync](#account--sync) below.

---

## Tools at a Glance

| Tool                   | What it does                                                                                                                     |
|------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| **Checklist Manager**  | Manage resettable checklists with resource tracking, tag-based filtering, and pinned-item focus mode.                            |
| **Level Goal Tracker** | Set a target level with a deadline. Tracks daily required XP and shows whether you're ahead or behind pace.                      || **Thing Counter**      | Track anything countable, organised into a tree of named groups by game. Supports bounded and open-ended counters, decrement mode, and configurable step sizes. |
| **Trophy Hunter**      | Track PlayStation trophy progress across your games. Search for any PS3, PS4, PS5, or PS Vita title and mark trophies as earned. |
| **XP Tracker**         | Log XP gains and track your rate over a session. Includes charts with moving averages and rate estimates.                        |

---

## XP Tracker

XP Tracker is a session-based tool for logging experience point gains and monitoring your rate over time. It's designed
for grinding sessions where you want to know how fast you're earning XP and see your performance at a glance.

### Getting Started

1. Open XP Tracker from the main tools page.
2. Enter an XP value in the input field.
3. Press **Enter** or click **Log** to record the gain.
4. Keep logging gains as you play. The charts and stats update after each entry.

### The Charts

**Gains chart** — A bar chart showing each individual XP gain in order. Two moving average lines are overlaid — one over
5 entries and one over 10 — to smooth out variance and show your underlying trend.

**Cumulative chart** — A line chart showing total XP accumulated over time during the session. The slope of the line
shows your overall rate — steeper means faster.

### Stats Panel

| Stat       | Description                                                  |
|------------|--------------------------------------------------------------|
| Total XP   | Sum of all logged gains in this session.                     |
| Entries    | Number of individual gains logged.                           |
| Average    | Mean XP per entry.                                           |
| Rate / min | Your XP gain rate per minute, based on session elapsed time. |
| Rate / 15m | Projected XP over 15 minutes at your current rate.           |
| Rate / hr  | Projected XP per hour at your current rate.                  |

### Entry Log

A scrollable timestamped list of every gain logged in the session, newest first.

### Resetting a Session

**Reset** clears all entries and restarts the session timer. Use this at the start of a new grinding session to get
clean stats.

> **Tip:** Rate estimates are most accurate after you've logged several entries over a few minutes. Early in a session
> the numbers will be volatile.

---

## Checklist Manager

Checklist Manager is a tool for running structured, repeatable procedures. You define the structure once —
items, steps, tags, resources — and the session state (which steps are done, how many executions) resets
between runs without touching the definitions.

### Setting Up a Project

1. Open Checklist Manager from the main tools page.
2. Click **+ Project** to create a project.
3. In the project settings modal, add any resources your checklist tracks (name, emoji, total slots).
4. Add item tags (used to filter whole items) and step tags (used to filter steps within items).
5. Click **Save**.

### Adding Items and Steps

1. With a project selected, click **+ Item**.
2. Give the item a name and assign any item tags.
3. Add steps using **+ Step**. For each step:
    - Enter a title and optional description (ingredients, notes, instructions, anything useful).
    - Assign step tags.
    - Enter resource costs if this step consumes any resources.
4. Click **Save**.

Steps are ordered — they render in the order you define them. Use the ▲▼ arrows in the step editor
to reorder.

### Running a Session

- Tap the **+** button on a step to mark it done.
- Tap **+** again on a completed step to log another execution (e.g. a second batch). A **×N** count
  appears below the button when N > 1. Additional executions multiply the step's resource cost.
- Completed steps dim. An item shows **✔** when all currently visible steps are done.
- Tap an item's name to open the **Briefing** — a read-only summary of all step details, useful for
  reviewing a procedure before starting.

### Filters

```
Filters: [Item ▾]  [Step ▾]
View:    [📌] [✏️] [≡]  [↺ Reset]
```

| Control | What it does                                                                              |
|---------|-------------------------------------------------------------------------------------------|
| Item ▾  | Filter by item tag — only items carrying the selected tag are shown.                      |
| Step ▾  | Filter by step tag — only matching steps are shown; items with no matches are hidden.     |
| 📌      | Focus mode — hides All Items, shows only Pinned items. Pinned items expand automatically. |
| ✏️      | Reorder mode (manual sort only) — shows ▲▼ arrows on each item.                           |
| ≡       | Cycle sort order: manual → A→Z → Z→A → manual.                                            |
| ↺ Reset | Reset all step state. Tap once to arm, tap again within 4 seconds to confirm.             |

Multiple filters can be active at once. Active filters appear as dismissible pills below the filter bar.
Tap the **Aa / 😀** toggle on the pills row to switch between tag name and emoji display.

### Pinning

Long-press any item to pin or unpin it. Pinned items appear in a **📌 Pinned** section at the top
and remain visible in All Items as well.

The Pinned section has its own **↺ Pinned** reset that affects only pinned items.

Tap **📌** in the View bar to enter focus mode — the All Items section disappears, leaving only your
pinned items expanded and ready to work through.

### Resource Tracking

The **Inventory** tally appears below the filter bar whenever at least one item is pinned. It shows
committed resource slots across all pinned items:

```
Inventory (pinned)
🔧 Slots    3 / 8   [████░░░░░░]
📦 Bays     5 / 5   [██████████]  ← orange when over capacity
```

Each step tap commits that step's resource cost. Tapping again (second execution) commits the cost
again. The tally updates live.

Over-capacity resources turn orange — a planning signal, not a hard block.

### Briefing Modal

Tap any item's name to open the briefing. Toggle between:

- **All Steps** — complete reference view regardless of active filters
- **Filtered** — only steps matching the current step-tag filter

The toggle preference is global and remembered across opens.

### Resetting

| Scope        | How                                                    | Confirm required |
|--------------|--------------------------------------------------------|------------------|
| Single step  | ↺ button on the item (resets all of that item's steps) | No               |
| Pinned items | ↺ Pinned in the Pinned section header                  | Yes (2 taps)     |
| All items    | ↺ Reset in the View bar, or ↺ All in All Items         | Yes (2 taps)     |

Resetting clears step execution counts. Item definitions, pins, and active filters are untouched.

---

## Level Goal Tracker

Level Goal Tracker helps you work toward a target level by a deadline. You set where you are, where you want to be, and
when — and the tool calculates how much XP you need each day and tracks whether you're on pace.

It supports multiple games, each with their own level goal and progress history.

### Setting Up a Game

1. Open Level Goal Tracker from the main tools page.
2. Click **+ Add** to create a new entry.
3. Give the game a name.
4. Enter your current level and target level.
5. Set a deadline date.
6. Add at least one checkpoint level.
7. Click **Save**. The tool will calculate your daily XP requirement.

### Daily Targets

| Field          | Description                                                          |
|----------------|----------------------------------------------------------------------|
| Current level  | Where you are now.                                                   |
| Target level   | Where you want to reach.                                             |
| Deadline       | The date you've set as your goal.                                    |
| Days remaining | Calendar days left until the deadline.                               |
| Daily target   | Level you need to reach today to stay on pace.                       |
| Pace           | Whether you're ahead of, behind, or on track with your daily target. |

### Logging Daily Progress

Enter your current level in the **Update** field and click **Update**. The tool stores a snapshot for the day and
recalculates your pace status.

At midnight, the daily target rolls over automatically — the tool refreshes itself every minute so this happens
without a page reload.

### Multiple Games

Use the dropdown at the top to switch between games. Each game tracks its own goal, deadline, and daily history
independently. The **✏️ Edit** and **🗑 Delete** buttons at the bottom of the game view let you modify or remove
the current game.

> **Tip:** The daily target recalculates every day based on remaining levels and remaining days. A big day lowers your
> required pace. A missed day raises it.

---

## Thing Counter

Thing Counter tracks arbitrary counters — kills, collectibles, resources, quest objectives, charges, or anything else
you want to count while playing. Counters live in a tree of named branches, grouped by game.

### Setting Up

1. Click **+ Game** to create a game.
2. Use **+ Branch** in the toolbar to create named groups (e.g. "Bosses", "Collectibles", "Resources").
3. Use **+ Counter** to add counters inside branches or at the top level.

### Counter Types

**Open-ended** — No ceiling. The value starts at 0 and increases (or decreases to 0) without limit. Use this for
anything without a known maximum, like a kill count.

**Bounded** — Has a minimum, maximum, and initial value. A fill bar shows how full the counter is relative to its range.
Use this for anything with a known cap — health pools, item inventory limits, progress meters.

| Field         | Description                                           |
|---------------|-------------------------------------------------------|
| Minimum       | The floor — value cannot go below this.               |
| Maximum       | The ceiling — value cannot go above this.             |
| Initial value | The value the counter resets to when you use ↺ Reset. |

### Decrement Mode

Tick **Decrement** when setting up a counter to flip the dominant button to **−**. Use this for counters that count
down — lives remaining, charges left, uses available. The fill bar drains as the value decreases.

### Step Size

Step size controls how much **+** and **−** move the value per tap. Default is 1. Set it higher for anything that
changes in chunks — for example, a resource node that always gives 5 at a time. When step is not 1, the buttons show the
step value (e.g. −5, +5). You can also adjust the step live in the Focus Modal.

### Using Counters

- **Tap + or −** to increment or decrement by the step size.
- **Tap the counter's name** to open the Focus Modal — a large-target view with bigger buttons, an editable value, and
  an editable step size. Good for active tracking.
- **Double-tap or long-press** any counter or branch to show its edit controls without turning on global Edit Mode.

### Edit Mode

Toggle **✏️** in the toolbar to enter Edit Mode. All nodes show their controls:

| Control         | What it does                                                          |
|-----------------|-----------------------------------------------------------------------|
| + (on a branch) | Add a child branch inside this branch.                                |
| ✎               | Edit the name, type, settings, or parent of this node.                |
| ×1              | Reset the step size back to 1 (counters only).                        |
| ↺               | Reset the value to its initial value (counters only).                 |
| 🗑              | Delete the node. Deleting a branch also deletes everything inside it. |

### Organising Counters

Branches can be nested inside other branches to any depth. You can change a counter's parent in the Edit Counter modal
at any time. Tap a branch row to collapse or expand it.

### Sort Order

The **A↑** button on the right of the toolbar cycles through three sort states:

| State      | Button           | Behaviour                                                                      |
|------------|------------------|--------------------------------------------------------------------------------|
| Off        | A↑ (muted)       | Insertion order — counters and branches appear in the order they were created. |
| Ascending  | A↑ (highlighted) | Alphabetical A→Z at every level of the tree.                                   |
| Descending | A↓ (highlighted) | Alphabetical Z→A at every level of the tree.                                   |

Each game remembers its own sort preference.

### Game Settings

The **✎** button next to the game dropdown opens Game Settings. From there you can rename the game, **Reset all counters
** (returns every counter to its initial value without deleting structure), or delete the game entirely.

> **Tip:** Bounded + Decrement is the combination for anything that counts down from a known max — charges, uses, lives,
> ammo. Set Max to the starting amount, Min to 0, and tick Decrement.

### Quick Counter

When no game is selected, a **⚡ Quick Counter** button appears below the prompt. It opens a scratchpad counter — no
setup, no game required.

The Quick Counter has the same controls as the Focus Modal: editable value, ±1 buttons, an editable step size, ±step
buttons, and a reset to zero. It gets a random color each time it's opened fresh, which carries through the session.

**State persistence:**

| Action                                          | Effect on Quick Counter                                                           |
|-------------------------------------------------|-----------------------------------------------------------------------------------|
| Page refresh or blur (e.g. alt-tab, phone call) | State preserved — value, step, and color all restored on reopen.                  |
| Closing with ✕                                  | State wiped. Next open starts fresh with a new random color.                      |
| Selecting a game                                | State wiped and modal closed. Intentional navigation ends the scratchpad session. |

---

## Trophy Hunter

Trophy Hunter lets you track PlayStation trophy progress across your game library. It works for PS3, PS4, PS5, and
PS Vita titles. No PlayStation account is required to use it — trophy data is fetched through a proxy and cached
in a shared catalog.

### Adding a Game

1. Open Trophy Hunter from the main tools page.
2. Click **+ Add Game**.
3. Type the game's title in the search box and click **Search**.
4. Select your game from the results. If the trophy data is already cached, it's added instantly. Otherwise the
   tool downloads the trophy list from PlayStation — this takes a few seconds.

The search is forgiving — special characters like `™` and `:` are ignored, so `Batman Arkham Knight` will find
`Batman™: Arkham Knight`.

### Search Results

Results show the game's title, platform badge, and a status indicator:

| Indicator | Meaning                                            |
|-----------|----------------------------------------------------|
| ✓         | Data is already cached — instant add.              |
| ⬇         | Will download trophy data from PlayStation on add. |
| 🔖        | Already in your list — clicking selects it.        |

### Game Not Found

If a game isn't in the catalog, the search will work through a series of fallbacks automatically. If all else fails,
the search panel switches to a **Look Up** prompt:

1. Enter a PSN username — yours, if you've played the game, or any player known to have played it.
   [PSNProfiles.com](https://psnprofiles.com) is a good resource for finding prolific players for any title.
2. Click **Look Up**. The tool fetches that player's title list, finds the game, and shows it as a result.

**What is stored:** only the game title and its PlayStation trophy ID. The username you entered is never saved.
Tap **What is this?** in the prompt for a full explanation.

### Tracking Trophies

Once a game is added, its full trophy list appears. Games with DLC show trophies grouped by section; games with
only a base game show a flat list directly.

- **Click the checkbox** on any trophy row to mark it earned. Click again to unmark. Changes are instant — the UI
  updates immediately without waiting for the cloud.
- **Long-press** a trophy to pin it. Pinned trophies float to the top of their group, making it easy to focus on
  what you're working toward. Earning a pinned trophy unpins it automatically.

### The Game Header

At the top of the trophy list, the game header shows:

- The platinum trophy icon (colored when earned, dimmed when not) — slightly larger than the gold/silver/bronze icons
- Gold / Silver / Bronze chips showing **earned/total** — e.g. `3/12`. The earned count is bold and full-size; the
  `/total` is smaller and slightly faded, providing context without competing for attention
- Earned / total fraction (platinum is included in the count)
- Progress bar and percentage — floored to match PSN convention (99% until the very last trophy is earned)

### Toolbar

| Control | What it does                                                                          |
|---------|---------------------------------------------------------------------------------------|
| Filter  | Show All, Earned only, or Unearned only trophies.                                     |
| Sort    | PSN order (default), A–Z alphabetical, or Grade (platinum first).                     |
| Ungroup | Flatten all trophies into a single list. Hidden for games with only one trophy group. |

When a filter is active, the list shows a labeled section divider between the matching trophies and the rest. The
rest are dimmed and pushed to the bottom — but remain fully interactive. You can earn or unlearn trophies in the
dimmed section without switching filters.

### Group Headers

Each DLC group has its own collapsible header showing tier counts with earned/total, fraction, and progress bar.
The group containing the platinum trophy shows a platinum icon instead of the standard checkmark. Tap a group
header to collapse or expand it.

When every trophy in a group is earned, the group header shows a subtle green tint to make completion visible at
a glance. The tint is fully opaque so it doesn't bleed through when the header is sticky.

Group headers are **sticky** — as you scroll through a group's trophies, the group header locks to the top of
the viewport so you always know which group you're in. It parks 6px from the top edge for breathing room, and
releases when the next group begins.

### Game Settings

The **✎** button next to the game dropdown opens Game Settings. From there you can:

| Action           | Effect                                                                                                                     |
|------------------|----------------------------------------------------------------------------------------------------------------------------|
| Rename           | Changes the display name without affecting trophy data.                                                                    |
| Refresh from PSN | Re-fetches the trophy list. New trophies are added unearned; removed trophies are flagged as orphaned rather than deleted. |
| Reset progress   | Clears all earned and pinned states. Trophy list is kept.                                                                  |
| Remove game      | Permanently removes the game from your list.                                                                               |

### Orphaned Trophies

If a game's trophy list changes on PlayStation, trophies that no longer exist in the PSN data are marked as
orphaned rather than silently deleted. They appear with a dashed border and a warning label, and are excluded from
progress calculations. You can clear them by doing a fresh Refresh from PSN.

### Real-time Cross-device Sync

When signed in, Trophy Hunter syncs trophy state in real time across your devices. If you earn a trophy on your
phone, it appears on your tablet within seconds — no reload required.

**What syncs live:** trophy earned and pinned states only. The progress counts, progress bar, and percentage
update automatically on all devices.

**What stays local:** your display preferences — filter (All/Earned/Unearned), sort order, ungrouped mode, and
collapsed groups — are personal to each device's session. You can have different views on different devices
simultaneously. Your last-used display preferences are still saved to the cloud and restored when you open the
tool on a new device; they just don't interrupt another device mid-session.

If real-time sync ever needs to be turned off, set `REALTIME_ENABLED = false` in `storage.js`. The tool falls
back to its previous sync behaviour with no other changes required.

---

## PlayStation Trophy Summary Display

PlayStation Trophy Summary Display (PTSD) shows your PlayStation trophy profile at a glance — your trophy level,
lifetime tier counts, and completion status across your entire game library. It fetches data automatically; there's
nothing to tick or enter manually.

No PlayStation account credentials are required. The tool fetches data through a proxy using your public PlayStation
username.

### Getting Started

1. Open **PlayStation Trophy Summary Display** from the main tools page.
2. The Settings modal opens automatically. Enter your PlayStation username and press **Save**.
3. The tool validates the username and fetches your full library from PlayStation. This may take a few seconds for large
   libraries.

### The Profile Card

The profile card is sticky — it stays pinned to the top of the screen as you scroll through your games.

It shows your trophy level, a progress bar toward the next level, and your lifetime platinum, gold, silver, and bronze
counts. If you've earned trophies since the last full refresh, green `(+N)` deltas appear next to the affected tiers.

The **⟳** button triggers a full refresh of your entire profile and game list. This is rate-limited to once per hour.
When the button is grayed out, tapping it shows how long until the next refresh is available. If any game has been
individually refreshed since the last full refresh, a **stale data** marker appears — the profile card counts may not
reflect your most recent activity across all games.

The **✎** button opens Settings, where you can change your linked PlayStation username or manage hidden games.

### Game Cards

Each game in your library has a card showing its thumbnail, platform, tier counts, completion percentage, and a progress
bar. A per-game **⟳** button lets you refresh just that game without triggering a full library refresh — useful when
you've been playing a specific title and want current numbers. Per-game refreshes have a 5-minute cooldown.

Games with DLC or multiple trophy groups show a **▶** expand arrow. Tap it to load the group-level breakdown. Group data
is fetched once and cached for the session.

Long-press any game card to **pin** it. Pinned games float above the sorted list and stay visible even when filters
would otherwise hide them (shown at reduced opacity with a pin label).

### Filters and Sorting

Tap **▶ Filters** to open the filter panel. You can sort by recent activity, completion percentage, alphabetical order,
platform, or platinum status.

Filter pills use a three-state cycle — tap once to include (green), tap again to exclude (red), tap a third time to
clear. All active filters apply together: a game must match every include condition and violate no exclude condition to
appear.

Platform and visibility filters only show options that exist in your library. Completion and activity filters are
single-select — activating one clears the others in the group.

The toggle row shows a count of visible games (`72 / 304` when filtered, `304 games` when not) and a red `✕ Clear` pill
when any filter is active.

### Hidden Games

If a game disappears from your PlayStation data — typically because you hid it on PlayStation — the tool prompts you
after the next global refresh. For each missing game you can:

- **Keep** — the game stays in your local list, flagged as hidden. It survives future global refreshes silently and is
  excluded from the game count.
- **Remove** — the game is deleted from your local list entirely.

A "Do this for all remaining (N)" checkbox applies your choice to the rest of the queue at once. Hidden games can be
reviewed and removed at any time from Settings → **Manage** under Hidden Games.

### Changing Your Username

Open Settings and enter the new username. The modal stays open while the tool validates it against PlayStation — it only
closes once the fetch succeeds. If the worker is rate-limited or PlayStation is unreachable, an inline error explains
why and the modal stays open for retry. Nothing is saved until the fetch succeeds.

### Cross-device Sync

When signed in, your trophy profile syncs across devices automatically. Changes on one device appear on others within
seconds. Your display preferences (sort order, active filters) are local to each device and are never overwritten by
sync events.

---

## Common Features

### Fullscreen Mode

Every tool has a fullscreen toggle button in the header, between the account button and the theme toggle. Tap it
to expand the tool to fill the entire screen, hiding the browser's address bar and navigation chrome. Tap it again
to exit. The icon changes to reflect the current state — four outward corners when not in fullscreen, four inward
corners when in fullscreen.

The button is only shown on browsers that support the Fullscreen API. It works on Firefox for Android, Chrome for
Android, and desktop browsers. On iOS (Safari or Firefox), the button is hidden — iOS does not support
programmatic fullscreen.

### Dark and Light Mode

Every tool has a theme toggle button (🌙 / 🌕) in the top-right corner of the header. Your preference is saved and
applies across all tools.

### Account & Sync

The 👤 button in the header opens the account menu. You can create an account, sign in, or sign out from there.

**Without an account:** everything works as before — data is saved locally in your browser and never leaves your device.

**With an account:** Checklist Manager, Level Goal Tracker, Thing Counter, and Trophy Hunter sync your
data to Supabase.

**Sign in nudge:** the first time you visit any tool without being signed in, a tooltip on the 👤 button reminds you
that sync is available. It appears once and does not come back after you dismiss it.

**Privacy:** tap **Privacy notice** in the account menu for full details on what is and isn't stored. The short
version: your email is for account recovery only, your game data is private to you, and the shared game catalog
stores only anonymous title metadata — no usernames, no trophy progress from other players, nothing personal.

#### Conflict Resolution

If you've used the same game on two different devices while offline, the data may have diverged. When you select a game
and both a local version and a cloud version exist with different timestamps, a prompt appears showing both timestamps
and lets you choose which copy to keep. The other copy is updated to match.

### Data Storage

Data is saved automatically. The local copy lives in your browser's `localStorage` and persists between sessions.

When signed in, Level Goal Tracker, Thing Counter, and Trophy Hunter also store data in Supabase. If you clear your
browser's localStorage, your data can be restored from the cloud the next time you open the tool while signed in.

**Clearing browser site data while not signed in will erase your data permanently.** If you are not signed in and
want to back up your data, you can copy the relevant keys from your browser's developer tools (F12 → Application →
Local Storage).

### localStorage Keys Reference

| Key                                     | Tool               | Contents                                        |
|-----------------------------------------|--------------------|-------------------------------------------------|
| `bgt:theme`                             | Global             | Dark or light theme preference.                 |
| `bgt:auth:nudge-seen`                   | Global             | Set to `1` once the sign-in nudge is dismissed. |
| `bgt:xp-tracker:gains`                  | XP Tracker         | Array of logged XP gains with timestamps.       |
| `bgt:xp-tracker:start`                  | XP Tracker         | Session start timestamp.                        |
| `bgt:clm:v2`                            | Checklist Manager  | `{ version, index, blobs, lruOrder }`           |
| `bgt:clm:selected-project`              | Checklist Manager  | Last selected project UUID.                     |
| `bgt:level-goal-tracker:data`           | Level Goal Tracker | All games, goals, and daily history.            |
| `bgt:level-goal-tracker:selected-game`  | Level Goal Tracker | Last selected game ID.                          |
| `bgt:thing-counter:data`                | Thing Counter      | All games and their counter trees.              |
| `bgt:thing-counter:selected-game`       | Thing Counter      | Last selected game ID.                          |
| `bgt:thing-counter:quick-counter-val`   | Thing Counter      | Quick Counter current value.                    |
| `bgt:thing-counter:quick-counter-step`  | Thing Counter      | Quick Counter step size.                        |
| `bgt:thing-counter:quick-counter-color` | Thing Counter      | Quick Counter accent color.                     |
| `bgt:trophy-hunter:data`                | Trophy Hunter      | Personal game list and trophy states.           |
| `bgt:trophy-hunter:selected-game`       | Trophy Hunter      | Last selected game ID.                          |
| `bgt:trophy-hunter:catalog-cache`       | Trophy Hunter      | Local cache of recently viewed trophy lists.    |
