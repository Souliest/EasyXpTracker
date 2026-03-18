# BasicGamingTools — User Guide

A collection of lightweight, browser-based utilities for tracking progress and counting things while gaming.
Everything runs locally in your browser — no internet connection is required, and all tools work fully offline.

An optional account system lets you sync data across devices. Your data is stored in Supabase only when you choose
to sign in. See [Account & Sync](#account--sync) below.

---

## Tools at a Glance

| Tool                   | What it does                                                                                                                                                    |
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Level Goal Tracker** | Set a target level with a deadline. Tracks daily required XP and shows whether you're ahead or behind pace.                                                     |
| **Thing Counter**      | Track anything countable, organised into a tree of named groups by game. Supports bounded and open-ended counters, decrement mode, and configurable step sizes. |
| **XP Tracker**         | Log XP gains and track your rate over a session. Includes charts with moving averages and rate estimates.                                                       |

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

## Common Features

### Dark and Light Mode

Every tool has a theme toggle button (🌙 / 🌕) in the top-right corner of the header. Your preference is saved and
applies across all tools.

### Account & Sync

The 👤 button in the header opens the account menu. You can create an account, sign in, or sign out from there.

**Without an account:** everything works as before — data is saved locally in your browser and never leaves your device.

**With an account:** Level Goal Tracker and Thing Counter sync your games to Supabase. Data is pushed on every save and
pulled on tool load, so your games are available on any device you sign in from. XP Tracker is session-based by design
and does not sync.

**Sign in nudge:** the first time you visit any tool without being signed in, a tooltip on the 👤 button reminds you
that sync is available. It appears once and does not come back after you dismiss it.

**Privacy:** your email address is stored solely for account recovery purposes and is never shared with or sold to any
third party.

#### Conflict Resolution

If you've used the same game on two different devices while offline, the data may have diverged. When you select a game
and both a local version and a cloud version exist with different timestamps, a prompt appears showing both timestamps
and lets you choose which copy to keep. The other copy is updated to match.

### Data Storage

Data is saved automatically. The local copy lives in your browser's `localStorage` and persists between sessions.

When signed in, Level Goal Tracker and Thing Counter also store data in Supabase. If you clear your browser's
localStorage, your data can be restored from the cloud the next time you open the tool while signed in.

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
| `bgt:level-goal-tracker:data`           | Level Goal Tracker | All games, goals, and daily history.            |
| `bgt:level-goal-tracker:selected-game`  | Level Goal Tracker | Last selected game ID.                          |
| `bgt:thing-counter:data`                | Thing Counter      | All games and their counter trees.              |
| `bgt:thing-counter:selected-game`       | Thing Counter      | Last selected game ID.                          |
| `bgt:thing-counter:quick-counter-val`   | Thing Counter      | Quick Counter current value.                    |
| `bgt:thing-counter:quick-counter-step`  | Thing Counter      | Quick Counter step size.                        |
| `bgt:thing-counter:quick-counter-color` | Thing Counter      | Quick Counter accent color.                     |