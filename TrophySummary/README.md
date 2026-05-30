# PlayStation Trophy Summary Display

A read-only summary of your PlayStation trophy profile. Links to a single PS username and shows your trophy level,
lifetime tier counts, and completion status across your entire game library — with per-game refresh, delta tracking, and
cross-device sync.

No individual trophy detail. No manual ticking. Just the numbers.

---

## Getting Started

1. Open **PlayStation Trophy Summary Display** from the main tools page.
2. The Settings modal opens automatically on first use.
3. Enter your PlayStation username and press **Save**.
4. The tool fetches your full profile from PlayStation. This may take a few seconds for large libraries.

Once set up, the profile card and game list load automatically on every visit.

---

## The Profile Card

The profile card is sticky — it stays visible as you scroll through your game list.

```
[avatar]  Souliest                              [✎]  [⟳]
          Lv. 427
          [level progress bar]  43%
  🏆 47(+1)  🥇 312(+3)  🥈 891  🥉 2041(+12)
  Updated 4m ago   stale data
```

| Element      | Description                                                                     |
|--------------|---------------------------------------------------------------------------------|
| Level        | Sony-calculated trophy level (0–999).                                           |
| Level bar    | Progress toward the next level (0–100%).                                        |
| Tier counts  | Lifetime platinum, gold, silver, and bronze trophies.                           |
| Delta `(+N)` | Trophies earned since the last global refresh. Clears on next global refresh.   |
| Timestamp    | When the profile was last globally refreshed.                                   |
| Stale marker | Appears when any game has been locally refreshed since the last global refresh. |

### Refresh button `⟳`

Fetches fresh data from PlayStation for your entire library. Rate-limited to once per hour. When rate-limited, the
button grays out and tapping it shows how long until the next refresh is available.

If the profile has stale data and a refresh is available, both the timestamp and stale label turn red.

### Settings button `✎`

Opens the Settings modal where you can change your linked PS username or manage hidden games.

---

## The Game List

Each game in your library appears as a card below the profile.

```
[▶]  [📌]  [thumb]  LEGO Batman: Legacy          [PS5]  [⟳]
            🏆 0    🥇 0    🥈 0    🥉 15               21%
            [███████░░░░░░░░░░░░░░░░░░░░░░░░░░]
```

**Delta row** — appears below the tier chips if any trophies have been earned since the last global refresh:

```
            🏆 0    🥇 0    🥈 0    🥉 15               21%
                                    +3
```

### Per-game refresh `⟳`

Each card has its own refresh button. This calls the per-game endpoint and updates tier counts and completion percentage
for that game only — faster than a full global refresh and not subject to the hourly rate limit (5-minute cooldown per
game). The game's delta is cleared on a local refresh; the profile card delta is unaffected.

### Pinning

Long-press any game card to pin it. Pinned games float above the sorted list. A pinned game that doesn't match the
active filters renders at reduced opacity with a `📌 pinned` label rather than disappearing.

### Trophy group expansion `▶`

Games with DLC or multiple trophy groups show an expand arrow. Tap it to load the group breakdown:

```
Base Game        🥇 1   🥈 3   🥉 8   [████████░░]   62%
Variety Pack 1        🥇 1        🥉 4   [████░░░░░░]   40%
```

Group data is fetched once and cached. Subsequent expands use the cached data with no worker call. Expanded state is
session-only — it resets on page reload or global refresh.

---

## Filters and Sorting

The filter bar is collapsed by default. Tap **▶ Filters** to open it.

### Sort options

| Option          | Order                                           |
|-----------------|-------------------------------------------------|
| Recent activity | Last trophy earned, newest first (default)      |
| Completion % ↑  | Lowest completion first                         |
| Completion % ↓  | Highest completion first                        |
| A–Z             | Alphabetical                                    |
| Platform        | PS5 → PS4 → PS3 → Vita, then by recent activity |
| Platinum first  | Platinumed games first, then by completion %    |

### Filter pills

Filters use a three-state cycle: **neutral** (gray, no filter) → **include** (green, must match) → **exclude** (red,
must not match).

All active filters apply with AND logic — a game must satisfy every include condition and violate no exclude condition
to appear.

**Visibility filters:** No Trophies, Platinums, Completed, Has DLC

**Platform filters:** PS5, PS4, PS3, Vita — only platforms present in your library appear.

**Completion filters:** 25%+, 50%+, 75%+, 90%+, 100% — single-select; activating one clears the others.

**Activity filters:** Today, Month, 3 Months, Year — single-select; based on last trophy earned date.

The toggle row shows active filters as summary pills and a game count (`72 / 304` when filtered, `304 games` when not).
A red `✕ Clear` pill appears inline when any filter is active.

---

## Settings

### Changing your PS username

Open Settings via the `✎` button. Enter the new username and press **Save**. The modal stays open while the new username
is validated against PlayStation — it only closes on a successful fetch. If the worker is rate-limited or PlayStation is
unreachable, an inline error shows with the reason and the modal remains open for retry.

### Hidden games

Games that disappear from your PlayStation profile (because you hid them on PlayStation) trigger a one-at-a-time prompt
after each global refresh:

- **Keep** — marks the game as `hiddenOnPs: true`. It stays in your local list, survives future global refreshes
  silently, and is excluded from game count totals.
- **Remove** — deletes the game from your local list entirely.

Both actions have a "Do this for all remaining (N)" checkbox to batch the decision across the rest of the queue.

Games marked as hidden can be reviewed and removed from Settings → **Manage** under the Hidden Games section.

---

## Cross-device Sync

When signed in, the profile syncs across devices automatically. The sync model uses Supabase as the data store and
Realtime as a notification channel — Realtime carries only a lightweight ping (timestamp), not the full profile blob.
The receiving device fetches the full profile from Supabase directly when it detects a newer version.

Your display preferences (sort order, active filters) are local to each device and are never overwritten by incoming
sync events.

---

## Rate Limits

Rate limits are enforced server-side by the Cloudflare Worker proxy and tracked locally for UI feedback.

| Endpoint                      | Limit                    |
|-------------------------------|--------------------------|
| Global refresh (`/profile`)   | 1 per hour per username  |
| Per-game refresh (`/summary`) | 1 per 5 minutes per game |

Rate limits only consume a slot on a successful PlayStation response — failed calls don't count against the limit.

---

## Data and Privacy

- Your PS username is stored locally and in your Supabase account (if signed in). It is used only to fetch your trophy
  data.
- Trophy data is private to your account — no other user can read it.
- No individual trophy names, descriptions, or earned states are fetched or stored. Only counts and completion
  percentages.
- The tool never writes to PlayStation or modifies your trophy data in any way.

---

## Technical Notes

- Completion percentages use `Math.floor`, matching PlayStation's convention. A game with one trophy unearned never
  shows 100%.
- `levelProgress` is the only percentage shown on the profile card. There is no "overall completion" percentage — it
  doesn't exist in the PlayStation API.
- Trophy group names come from PlayStation's definition endpoint. The `default` group may be named after the game
  title (e.g. `"Puzzling Places"`) rather than `"Base Game"` — this is correct PlayStation data, not an error.
- Profile-level tier counts are computed by summing `earnedTrophies` across all game entries. The PlayStation `profile2`
  API endpoint does not return lifetime tier counts directly.