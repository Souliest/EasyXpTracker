# BasicGamingTools — User Guide

A collection of lightweight, browser-based utilities for tracking progress and counting things while gaming. Everything
runs locally in your browser — no accounts, no internet connection required after the first load, and no data ever
leaves your device.

---

## Tools at a Glance

| Tool                   | What it does                                                                                                                                                    |
|------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **XP Tracker**         | Log XP gains and track your rate over a session. Includes charts with moving averages and rate estimates.                                                       |
| **Level Goal Tracker** | Set a target level with a deadline. Tracks daily required XP and shows whether you're ahead or behind pace.                                                     |
| **Thing Counter**      | Track anything countable, organised into a tree of named groups by game. Supports bounded and open-ended counters, decrement mode, and configurable step sizes. |

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
2. Click **+ Game** to create a new entry.
3. Give the game a name.
4. Enter your current level and target level.
5. Set a deadline date.
6. Click **Save**. The tool will calculate your daily XP requirement.

### Daily Targets

| Field          | Description                                                          |
|----------------|----------------------------------------------------------------------|
| Current level  | Where you are now.                                                   |
| Target level   | Where you want to reach.                                             |
| Deadline       | The date you've set as your goal.                                    |
| Days remaining | Calendar days left until the deadline.                               |
| XP required    | Total XP still needed to reach the target.                           |
| Daily target   | XP you need to earn per day to stay on pace.                         |
| Today's XP     | XP you've logged today.                                              |
| Pace           | Whether you're ahead of, behind, or on track with your daily target. |

### Logging Daily Progress

Each day, enter the XP you earned and click **Log Today**. The tool stores a snapshot of that day and updates your pace
status.

At midnight, the daily counter resets automatically. Your history is preserved.

### Multiple Games

Use the dropdown at the top to switch between games. Each game tracks its own goal, deadline, and daily history
independently. Click **✎** next to the dropdown to rename or delete a game.

> **Tip:** The daily target recalculates every day based on remaining XP and remaining days. A big day lowers your
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

Branches can be nested inside other branches to any depth. Organise by zone, act, character, session — whatever makes
sense. You can change a counter's parent in the Edit Counter modal at any time. Tap a branch row to collapse or expand
it.

### Game Settings

The **✎** button next to the game dropdown opens Game Settings. From there you can rename the game, **Reset all counters
** (returns every counter to its initial value without deleting structure), or delete the game entirely.

> **Tip:** Bounded + Decrement is the combination for anything that counts down from a known max — charges, uses, lives,
> ammo. Set Max to the starting amount, Min to 0, and tick Decrement.

---

## Common Features

### Dark and Light Mode

Every tool has a theme toggle button (🌙 / ☀️) in the top-right corner of the header. Your preference is saved and
applies across all tools.

### Data Storage

All data is saved automatically in your browser's local storage. Nothing is uploaded to a server. Your data stays on
your device and persists between sessions.

**Clearing your browser's local storage or site data will erase all saved data.** If you want to back up your data, you
can copy the relevant keys from your browser's developer tools (F12 → Application → Local Storage).

### localStorage Keys Reference

| Key                                    | Tool               | Contents                                  |
|----------------------------------------|--------------------|-------------------------------------------|
| `bgt:theme`                            | Global             | Dark or light theme preference.           |
| `bgt:xp-tracker:gains`                 | XP Tracker         | Array of logged XP gains with timestamps. |
| `bgt:xp-tracker:start`                 | XP Tracker         | Session start timestamp.                  |
| `bgt:level-goal-tracker:data`          | Level Goal Tracker | All games, goals, and daily history.      |
| `bgt:level-goal-tracker:selected-game` | Level Goal Tracker | Last selected game.                       |
| `bgt:thing-counter:data`               | Thing Counter      | All games and their counter trees.        |
| `bgt:thing-counter:selected-game`      | Thing Counter      | Last selected game.                       |