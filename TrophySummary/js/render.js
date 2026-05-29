// TrophySummary/js/render.js
// All HTML builders for the main view.
// Receives data as parameters — no loadData calls, no module-level state.
//
// Step 3 (corrected): renderProfileCard — overallPct removed, levelProgress % inline.
// Step 4: renderFilterBar — collapsible toggle row + floating panel.
// Step 5: renderGameList stub.

import {escHtml} from '../../common/utils.js';
import {isRateLimited} from './storage.js';

// ── SVG trophy icons — reused verbatim from TrophyHunter ──────────────────────

const TROPHY_SVG_PATH = 'M3 1H13V8C13 11.5 10.8 14.2 8 15.1L7.5 17H6V19H10V17H8.5L8 15.1C5.2 14.2 3 11.5 3 8ZM3 2H1V5C1 6.4 1.9 7.5 3 7.9ZM13 2H15V5C15 6.4 14.1 7.5 13 7.9Z';
const PLATINUM_CUP_PATH = 'M3 1H13V8C13 11.5 10.8 14.2 8 15.1L7.5 17H6V19H10V17H8.5L8 15.1C5.2 14.2 3 11.5 3 8ZM3 2H1V5C1 6.4 1.9 7.5 3 7.9ZM13 2H15V5C15 6.4 14.1 7.5 13 7.9Z';
const PLATINUM_STAR_PATH = 'M8 2.5L8.7 4.7H11L9.2 5.9L9.8 8.1L8 6.9L6.2 8.1L6.8 5.9L5 4.7H7.3Z';

const TIER_COLORS = {
    platinum: '#d4c5f9',
    gold: '#e8b84b',
    silver: '#b0b8c1',
    bronze: '#c4713a',
};

// ── Filter registry ───────────────────────────────────────────────────────────
// Each entry owns its own test lambda. _passesFilter drives everything from here.
// singleSelect: true means cycling one active pill in the group clears siblings.

function _withinDays(game, days) {
    if (!game.lastTrophyEarned) return false;
    return (Date.now() - new Date(game.lastTrophyEarned).getTime()) <= days * 86400000;
}

export const FILTER_REGISTRY = {
    // Visibility
    noTrophies:    { label: 'No Trophies', test: g => g.pct === 0 },
    platinums:     { label: 'Platinums',   test: g => (g.tierEarned?.platinum || 0) > 0 },
    completed:     { label: 'Completed',   test: g => g.pct === 100 },
    hasDlc:        { label: 'Has DLC',     test: g => g.hasTrophyGroups },

    // Platforms
    ps5:           { label: 'PS5',  test: g => g.platform === 'PS5' },
    ps4:           { label: 'PS4',  test: g => g.platform === 'PS4' },
    ps3:           { label: 'PS3',  test: g => g.platform === 'PS3' },
    vita:          { label: 'Vita', test: g => g.platform === 'Vita' },

    // Completion — single-select group
    pct25:  { label: '25%+',  group: 'completion', singleSelect: true, test: g => g.pct >= 25 },
    pct50:  { label: '50%+',  group: 'completion', singleSelect: true, test: g => g.pct >= 50 },
    pct75:  { label: '75%+',  group: 'completion', singleSelect: true, test: g => g.pct >= 75 },
    pct90:  { label: '90%+',  group: 'completion', singleSelect: true, test: g => g.pct >= 90 },
    pct100: { label: '100%',  group: 'completion', singleSelect: true, test: g => g.pct === 100 },

    // Recency — single-select group
    today:    { label: 'Today',    group: 'recency', singleSelect: true, test: g => _withinDays(g, 1) },
    month:    { label: 'Month',    group: 'recency', singleSelect: true, test: g => _withinDays(g, 30) },
    months3:  { label: '3 Months', group: 'recency', singleSelect: true, test: g => _withinDays(g, 90) },
    year:     { label: 'Year',     group: 'recency', singleSelect: true, test: g => _withinDays(g, 365) },
};

function _trophyIcon(tier, size = 16) {
    const color = TIER_COLORS[tier] || TIER_COLORS.bronze;
    if (tier === 'platinum') {
        return `<svg class="ptsd-trophy-icon ptsd-trophy-icon-platinum" width="${size}" height="${size}" viewBox="0 0 16 20" aria-hidden="true">
            <path d="${PLATINUM_CUP_PATH}" fill="${color}"/>
            <path d="${PLATINUM_STAR_PATH}" fill="#1a1a2e"/>
        </svg>`;
    }
    return `<svg class="ptsd-trophy-icon" width="${size}" height="${size}" viewBox="0 0 16 20" aria-hidden="true" fill="${color}">
        <path d="${TROPHY_SVG_PATH}"/>
    </svg>`;
}

// ── Delta computation ─────────────────────────────────────────────────────────

export function computeDeltas(tierEarned, tierEarnedAtLastGlobalRefresh) {
    if (!tierEarnedAtLastGlobalRefresh) return {};
    const d = {};
    for (const tier of ['platinum', 'gold', 'silver', 'bronze']) {
        const delta = (tierEarned[tier] || 0) - (tierEarnedAtLastGlobalRefresh[tier] || 0);
        if (delta > 0) d[tier] = delta;
    }
    return d;
}

// ── Stale marker logic ────────────────────────────────────────────────────────

export function isProfileStale(profileBlob) {
    if (!profileBlob || !profileBlob.lastFullRefresh) return false;
    return profileBlob.games.some(g =>
        g.lastLocalRefresh && g.lastLocalRefresh > profileBlob.lastFullRefresh
    );
}

// ── Timestamp formatting ──────────────────────────────────────────────────────

function _formatRelativeTime(isoString) {
    if (!isoString) return null;
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

// ── Tier chips with optional deltas ──────────────────────────────────────────

function _renderTierChipsWithDeltas(tierEarned, deltas) {
    const tiers = ['platinum', 'gold', 'silver', 'bronze'];
    return tiers.map(tier => {
        const count = tierEarned[tier] || 0;
        const delta = deltas[tier];
        const color = TIER_COLORS[tier];
        const deltaHtml = delta
            ? `<span class="ptsd-delta" aria-label="+${delta} since last refresh">+${delta}</span>`
            : '';
        return `<span class="ptsd-tier-chip">
            ${_trophyIcon(tier, 16)}
            <span class="ptsd-tier-count" style="color:${color}">${count}</span>${deltaHtml}
        </span>`;
    }).join('');
}

// ── Refresh button ────────────────────────────────────────────────────────────

function _renderRefreshButton(refreshing, rateLimited) {
    const disabled = refreshing || rateLimited;
    return `<button class="ptsd-refresh-btn${disabled ? ' ptsd-refresh-btn--disabled' : ''}${refreshing ? ' ptsd-refresh-btn--spinning' : ''}"
        id="ptsd-refresh-btn"
        aria-label="${refreshing ? 'Refreshing' : 'Refresh profile'}"
        ${disabled ? 'aria-disabled="true"' : ''}
    >⟳</button>`;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function _renderAvatar(avatarUrl) {
    if (avatarUrl) {
        try {
            const parsed = new URL(avatarUrl);
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                return `<img class="ptsd-avatar th-game-icon" src="${escHtml(avatarUrl)}"
                    alt="" aria-hidden="true" id="ptsd-avatar-img">`;
            }
        } catch { /* fall through to glyph */
        }
    }
    return `<span class="ptsd-avatar ptsd-avatar--glyph" aria-hidden="true">🎮</span>`;
}

// ── Level progress bar row: [bar]  43% ────────────────────────────────────────

function _renderLevelBar(progress) {
    const pct = Math.max(0, Math.min(100, progress || 0));
    return `<div class="ptsd-level-bar-row">
        <div class="ptsd-level-bar th-progress-track" role="progressbar"
            aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
            aria-label="Level progress ${pct}%">
            <div class="th-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="ptsd-level-pct">${pct}%</span>
    </div>`;
}

// ── renderProfileCard ─────────────────────────────────────────────────────────

export function renderProfileCard(profile, refreshing = false) {
    const rateLimited = isRateLimited('global');
    const stale = isProfileStale(profile);
    const deltas = computeDeltas(
        profile.tierEarned,
        profile.tierEarnedAtLastGlobalRefresh
    );

    const timestamp = _formatRelativeTime(profile.lastFullRefresh);
    const refreshAvailable = !rateLimited && !refreshing;
    const staleAndAvailable = stale && refreshAvailable;
    const tsColorStyle = staleAndAvailable ? ' style="color:#ff4444"' : '';

    const staleLabel = stale
        ? `<span class="ptsd-stale-label${staleAndAvailable ? ' ptsd-stale-label--urgent' : ''}"
              id="ptsd-stale-label">stale data</span>`
        : `<span class="ptsd-stale-label" id="ptsd-stale-label" style="display:none"></span>`;

    return `<div class="ptsd-profile-card panel" id="ptsd-profile-card">
        <div class="ptsd-card-top">
            ${_renderAvatar(profile.avatarUrl)}
            <div class="ptsd-card-identity">
                <span class="ptsd-username">${escHtml(profile.psUsername)}</span>
                <span class="ptsd-level">Lv. ${profile.trophyLevel || 0}</span>
            </div>
            <div class="ptsd-card-actions">
                <button class="ptsd-settings-btn" id="ptsd-settings-btn"
                    aria-label="Settings" title="Settings">✎</button>
                ${_renderRefreshButton(refreshing, rateLimited)}
            </div>
        </div>

        ${_renderLevelBar(profile.levelProgress)}

        <div class="ptsd-card-chips-row">
            ${_renderTierChipsWithDeltas(profile.tierEarned, deltas)}
        </div>

        <div class="ptsd-card-footer">
            ${timestamp
        ? `<span class="ptsd-timestamp${staleAndAvailable ? ' ptsd-timestamp--urgent' : ''}"${tsColorStyle}
                      id="ptsd-timestamp">Updated ${escHtml(timestamp)}</span>`
        : `<span class="ptsd-timestamp ptsd-timestamp--never" id="ptsd-timestamp">Never refreshed</span>`
    }
            ${staleLabel}
        </div>
    </div>`;
}

// ── Active filter summary ─────────────────────────────────────────────────────
// Returns an array of short label strings for non-default filter values.
// Used in the toggle row to show what's active without opening the panel.

export function getActiveFilterSummary(profile) {
    const vs = profile.viewState || {};
    const filterState = vs.filterState || {};
    const labels = [];

    // Sort — only show if non-default
    const sortLabels = {
        pct_asc: 'Completion ↑',
        pct_desc: 'Completion ↓',
        alpha: 'A–Z',
        platform: 'Platform',
        platinum: 'Platinum first',
    };
    if (vs.sort && vs.sort !== 'recent') labels.push(sortLabels[vs.sort] || vs.sort);

    // Active filters — include gets plain label, exclude gets 'not·label'
    for (const [key, state] of Object.entries(filterState)) {
        if (!state) continue;
        const def = FILTER_REGISTRY[key];
        if (!def) continue;
        labels.push(state === 'exclude' ? `not·${def.label}` : def.label);
    }

    return labels;
}

// ── renderFilterBar ───────────────────────────────────────────────────────────
// Toggle row (normal flow) + floating panel (absolute, shown/hidden via class).
// The wrapper is position:relative so the panel anchors to it.
// filtersOpen is session-only state passed in from main.js.

export function renderFilterBar(profile, filtersOpen = false) {
    const vs = profile.viewState || {};
    const games = profile.games || [];
    const filterState = vs.filterState || {};
    const activeLabels = getActiveFilterSummary(profile);
    const hasActiveFilters = Object.values(filterState).some(v => v !== null);

    // ── Game count readout ──
    const total = games.filter(g => !g.hiddenOnPs).length;
    const visible = games.filter(g => !g.hiddenOnPs && _passesFilter(g, filterState)).length;
    const countHtml = hasActiveFilters
        ? `<span class="ptsd-filter-count ptsd-filter-count--filtered">${visible} / ${total}</span>`
        : `<span class="ptsd-filter-count">${total} games</span>`;

    const clearHtml = hasActiveFilters
        ? `<button class="ptsd-filter-clear" id="ptsd-filter-clear">Clear</button>`
        : '';

    const summaryHtml = activeLabels.length > 0
        ? activeLabels.map(l => `<span class="ptsd-filter-summary-pill">${escHtml(l)}</span>`).join('')
        : '';

    const arrow = filtersOpen ? '▼' : '▶';

    // ── Sort dropdown ──
    const sortOptions = [
        {value: 'recent',   label: 'Recent activity'},
        {value: 'pct_asc',  label: 'Completion % ↑'},
        {value: 'pct_desc', label: 'Completion % ↓'},
        {value: 'alpha',    label: 'A–Z'},
        {value: 'platform', label: 'Platform'},
        {value: 'platinum', label: 'Platinum first'},
    ];
    const currentSort = vs.sort || 'recent';
    const sortHtml = sortOptions.map(o =>
        `<option value="${o.value}"${currentSort === o.value ? ' selected' : ''}>${o.label}</option>`
    ).join('');

    // ── Pill helper ──
    function _pill(key, extraClass = '') {
        const def = FILTER_REGISTRY[key];
        if (!def) return '';
        const state = filterState[key] || null;
        const stateClass = state === 'include' ? ' ptsd-pill--include'
            : state === 'exclude' ? ' ptsd-pill--exclude'
                : '';
        return `<button class="ptsd-pill${stateClass}${extraClass ? ' ' + extraClass : ''}"
            data-filter="${key}">${escHtml(def.label)}</button>`;
    }

    // ── Platform section — data-driven ──
    const presentPlatforms = new Set(games.map(g => g.platform.toLowerCase()));
    const platformHtml = ['ps5', 'ps4', 'ps3', 'vita']
        .filter(p => presentPlatforms.has(p))
        .map(p => _pill(p, 'ptsd-pill--platform'))
        .join('');

    // ── Visibility section — data-driven ──
    const visKeys = [
        games.some(g => g.pct === 0)                              ? 'noTrophies' : null,
        games.some(g => (g.tierEarned?.platinum || 0) > 0)        ? 'platinums'  : null,
        games.some(g => g.pct === 100)                             ? 'completed'  : null,
        games.some(g => g.hasTrophyGroups)                         ? 'hasDlc'     : null,
    ].filter(Boolean);
    const visHtml = visKeys.map(k => _pill(k)).join('');

    // ── Completion section ──
    const completionHtml = ['pct25', 'pct50', 'pct75', 'pct90', 'pct100']
        .map(k => _pill(k)).join('');

    // ── Recency section ──
    const recencyHtml = ['today', 'month', 'months3', 'year']
        .map(k => _pill(k)).join('');

    return `<div class="ptsd-filter-wrapper" id="ptsd-filter-wrapper">
        <button class="ptsd-filter-toggle" id="ptsd-filter-toggle" aria-expanded="${filtersOpen}">
            <span class="ptsd-filter-arrow">${arrow}</span>
            <span class="ptsd-filter-toggle-label">Filters</span>
            ${hasActiveFilters ? `<span class="ptsd-pill ptsd-pill--clear" data-action="clear-filters">✕ Clear</span>` : ''}
            ${summaryHtml}
            ${countHtml}
        </button>

        <div class="ptsd-filter-panel${filtersOpen ? ' ptsd-filter-panel--open' : ''}" id="ptsd-filter-panel">
            <div class="ptsd-filter-row--sort">
                <select class="ptsd-sort-select" id="ptsd-sort-select" aria-label="Sort games">
                    ${sortHtml}
                </select>
            </div>

            ${visHtml ? `<div class="ptsd-filter-section">
                <span class="ptsd-filter-label">Visibility</span>
                <div class="ptsd-pill-row">${visHtml}</div>
            </div>` : ''}

            <div class="ptsd-filter-section">
                <span class="ptsd-filter-label">Platforms</span>
                <div class="ptsd-pill-row">${platformHtml}</div>
            </div>

            <div class="ptsd-filter-section">
                <span class="ptsd-filter-label">Completion</span>
                <div class="ptsd-pill-row">${completionHtml}</div>
            </div>

            <div class="ptsd-filter-section">
                <span class="ptsd-filter-label">Activity</span>
                <div class="ptsd-pill-row">${recencyHtml}</div>
            </div>
            
            ${clearHtml}
        </div>
    </div>`;
}

// ── Filtering and sorting ─────────────────────────────────────────────────────

function _passesFilter(game, filterState) {
    for (const [key, state] of Object.entries(filterState)) {
        if (!state) continue;
        const def = FILTER_REGISTRY[key];
        if (!def) continue;
        const matches = def.test(game);
        if (state === 'include' && !matches) return false;
        if (state === 'exclude' && matches) return false;
    }
    return true;
}

function _sortGames(games, sort) {
    const sorted = [...games];
    switch (sort) {
        case 'pct_asc':
            sorted.sort((a, b) => a.pct - b.pct);
            break;
        case 'pct_desc':
            sorted.sort((a, b) => b.pct - a.pct);
            break;
        case 'alpha':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'platform': {
            const order = {PS5: 0, PS4: 1, PS3: 2, Vita: 3};
            sorted.sort((a, b) => {
                const po = (order[a.platform] ?? 99) - (order[b.platform] ?? 99);
                if (po !== 0) return po;
                return _cmpRecent(a, b);
            });
            break;
        }
        case 'platinum':
            sorted.sort((a, b) => {
                const ap = (a.tierEarned?.platinum || 0) > 0 ? 0 : 1;
                const bp = (b.tierEarned?.platinum || 0) > 0 ? 0 : 1;
                if (ap !== bp) return ap - bp;
                return b.pct - a.pct;
            });
            break;
        case 'recent':
        default:
            sorted.sort(_cmpRecent);
            break;
    }
    return sorted;
}

function _cmpRecent(a, b) {
    if (!a.lastTrophyEarned && !b.lastTrophyEarned) return 0;
    if (!a.lastTrophyEarned) return 1;
    if (!b.lastTrophyEarned) return -1;
    return new Date(b.lastTrophyEarned) - new Date(a.lastTrophyEarned);
}

// ── Game card thumbnail ───────────────────────────────────────────────────────

function _renderThumb(thumbnailUrl) {
    if (thumbnailUrl) {
        try {
            const parsed = new URL(thumbnailUrl);
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
                return `<img class="th-game-icon" src="${escHtml(thumbnailUrl)}" alt="" aria-hidden="true">`;
            }
        } catch { /* fall through */ }
    }
    return `<span class="th-game-icon ptsd-thumb--glyph" aria-hidden="true">🎮</span>`;
}

// ── renderGameCard ────────────────────────────────────────────────────────────
//
// Two-line layout when any delta > 0, one-line when clean:
//
//   [pin?] [thumb] [name ···················] [PS5] [⟳]
//          P1(+1)  G3(+1)  S5  B11(+2)              100%
//              +1      +1          +2                     ← delta row, only if any > 0
//          [████████████████████████████████████]
//
// pinnedFiltered — pinned game that doesn't pass the active filters.
//   Rendered at reduced opacity with a "📌 pinned" label instead of normal chips.

export function renderGameCard(game, pinnedFiltered = false, expandedIds = new Set(), refreshingGames = new Set()) {
    const rateLimited = isRateLimited(game.npCommId);
    const refreshing = refreshingGames.has(game.npCommId);
    const deltas = computeDeltas(game.tierEarned, game.tierEarnedAtLastGlobalRefresh);
    const hasDeltas = Object.keys(deltas).length > 0;
    const pct = game.pct ?? 0;

    // ── Top row ──
    const pinHtml = game.pinned
        ? `<span class="ptsd-card-pin" aria-label="Pinned">📌</span>`
        : '';

    const expandSlot = `<div class="ptsd-card-expand-slot">${
        game.hasTrophyGroups
            ? `<button class="ptsd-card-expand-btn" data-npcommid="${escHtml(game.npCommId)}"
                   aria-label="${expandedIds.has(game.id) ? 'Collapse' : 'Expand'} trophy groups"
                   aria-expanded="${expandedIds.has(game.id)}">${expandedIds.has(game.id) ? '▼' : '▶'}</button>`
            : ''
    }</div>`;

    const refreshDisabled = rateLimited || refreshing;
    const refreshHtml = `<button
        class="ptsd-card-refresh-btn${refreshDisabled ? ' ptsd-card-refresh-btn--disabled' : ''}${refreshing ? ' ptsd-card-refresh-btn--spinning' : ''}"
        data-npcommid="${escHtml(game.npCommId)}"
        data-action="refresh-game"
        aria-label="${refreshing ? 'Refreshing' : 'Refresh ' + escHtml(game.name)}"
        ${refreshDisabled ? 'aria-disabled="true"' : ''}
    >⟳</button>`;

    const topRow = `<div class="ptsd-card-top-row">
        ${expandSlot}
        ${pinHtml}
        ${_renderThumb(game.thumbnailUrl)}
        <span class="ptsd-card-name">${escHtml(game.name)}</span>
        <span class="th-platform-badge">${escHtml(game.platform)}</span>
        ${refreshHtml}
    </div>`;

    // ── Pinned-but-filtered: simplified body ──
    if (pinnedFiltered) {
        return `<div class="ptsd-game-card ptsd-game-card--pinned-filtered"
            data-id="${escHtml(game.id)}" data-npcommid="${escHtml(game.npCommId)}">
            ${topRow}
            <span class="ptsd-card-pinned-label">📌 pinned</span>
        </div>`;
    }

    // ── Tier chips row ──
    const tiers = ['platinum', 'gold', 'silver', 'bronze'];
    const chipsHtml = tiers.map(tier => {
        const count = game.tierEarned?.[tier] || 0;
        const delta = deltas[tier];
        const color = TIER_COLORS[tier];
        const deltaHtml = delta
            ? `<span class="ptsd-delta">+${delta}</span>`
            : '';
        return `<span class="ptsd-tier-chip">
            ${_trophyIcon(tier, 15)}
            <span class="ptsd-tier-count" style="color:${color}">${count}</span>${deltaHtml}
        </span>`;
    }).join('');

    const chipsRow = `<div class="ptsd-card-chips-row">
        ${chipsHtml}
        <span class="ptsd-card-pct">${pct}%</span>
    </div>`;

    // ── Delta row — only if any delta > 0 ──
    // Monospace columns aligned under tier chips. Empty cells hold width.
    let deltaRow = '';
    if (hasDeltas) {
        const cells = tiers.map(tier => {
            const delta = deltas[tier];
            return delta
                ? `<span class="ptsd-card-delta-cell">+${delta}</span>`
                : `<span class="ptsd-card-delta-cell ptsd-card-delta-cell--empty">+0</span>`;
        }).join('');
        deltaRow = `<div class="ptsd-card-delta-row" aria-label="Trophies since last refresh">
            ${cells}
        </div>`;
    }

    // ── Progress bar ──
    const progressRow = `<div class="ptsd-card-progress-row">
        <div class="th-progress-track" role="progressbar"
            aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
            aria-label="${escHtml(game.name)} ${pct}% complete">
            <div class="th-progress-fill" style="width:${pct}%"></div>
        </div>
    </div>`;

    const expanded = expandedIds.has(game.id);
    const groupsHtml = expanded ? _renderGroupSection(game) : '';

    return `<div class="ptsd-game-card${expanded ? ' ptsd-game-card--expanded' : ''}"
        data-id="${escHtml(game.id)}" data-npcommid="${escHtml(game.npCommId)}">
        ${topRow}
        ${chipsRow}
        ${deltaRow}
        ${progressRow}
        ${groupsHtml}
    </div>`;
}

// ── _renderGroupSection ───────────────────────────────────────────────────────
// Renders the group rows beneath an expanded card, or a loading placeholder
// if groups haven't been fetched yet.

function _renderGroupSection(game) {
    if (game.groups === null) {
        return `<div class="ptsd-group-loading">Loading…</div>`;
    }

    if (game.groups.length === 0) {
        return '';
    }

    return `<div class="ptsd-group-list">
        ${game.groups.map(g => renderGroupRow(g)).join('')}
    </div>`;
}

// ── renderGroupRow ────────────────────────────────────────────────────────────
//
// Desktop (one line):
//   [Group Name]  P1  G3  S5  B11  [████████████]  100%
//
// Mobile ≤560px (two lines):
//   [Group Name]
//   P1  G3  S5  B11  [████████████]  100%
//
// Four tier cells always rendered at fixed width — empty if that tier doesn't
// exist in this group, dimmed if it exists but none earned.
// Non-sticky, non-clickable. No delta row — current state only.

export function renderGroupRow(group) {
    const pct = group.pct ?? 0;
    const tiers = ['platinum', 'gold', 'silver', 'bronze'];

    // Fixed-width cells for all four tiers — empty cell holds space on desktop
    // for column alignment. On mobile, empty cells are hidden via CSS.
    const chipsHtml = tiers.map(tier => {
        const earned = group.tierEarned?.[tier] || 0;
        const total  = group.tierTotal?.[tier]  || 0;
        const color  = TIER_COLORS[tier];

        if (total === 0) {
            return `<span class="ptsd-group-tier-cell ptsd-group-tier-cell--empty"></span>`;
        }

        const unearned = earned === 0;
        return `<span class="ptsd-group-tier-cell${unearned ? ' ptsd-group-tier-cell--unearned' : ''}">
            ${_trophyIcon(tier, 13)}
            <span class="ptsd-group-tier-count" style="color:${unearned ? '' : color}">${earned}</span>
        </span>`;
    }).join('');

    const name = group.name || group.groupId;

    return `<div class="ptsd-group-row">
        <span class="ptsd-group-name">${escHtml(name)}</span>
        <div class="ptsd-group-chips">${chipsHtml}</div>
        <div class="ptsd-group-track th-progress-track" role="progressbar"
            aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
            aria-label="${escHtml(name)} ${pct}% complete">
            <div class="th-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="ptsd-group-pct">${pct}%</span>
    </div>`;
}

// ── renderGameList ────────────────────────────────────────────────────────────

export function renderGameList(profile, expandedIds = new Set(), refreshingGames = new Set()) {
    const vs = profile.viewState || {};
    const filterState = vs.filterState || {};
    const allGames = profile.games || [];

    if (allGames.length === 0) {
        return `<div class="ptsd-empty-games empty-state">
            <div class="big">🎮</div>
            No games found in your PlayStation library.
        </div>`;
    }

    const sort = vs.sort || 'recent';

    // Pinned games always float above, bypassing all filters.
    const pinned = allGames.filter(g => g.pinned);
    const unpinned = allGames.filter(g => !g.pinned);

    const pinnedPassing  = pinned.filter(g =>  _passesFilter(g, filterState));
    const pinnedFiltered = pinned.filter(g => !_passesFilter(g, filterState));
    const visible        = unpinned.filter(g => _passesFilter(g, filterState));

    const cards = [
        ..._sortGames(pinnedPassing,  sort).map(g => renderGameCard(g, false, expandedIds, refreshingGames)),
        ..._sortGames(pinnedFiltered, sort).map(g => renderGameCard(g, true,  expandedIds, refreshingGames)),
        ..._sortGames(visible,        sort).map(g => renderGameCard(g, false, expandedIds, refreshingGames)),
    ];

    return `<div class="ptsd-game-list" id="ptsd-game-list">
        ${cards.join('')}
    </div>`;
}

// ── renderEmptyState ──────────────────────────────────────────────────────────

export function renderEmptyState() {
    return `<div class="empty-state">
        <div class="big">🏆</div>
        Link your PlayStation username to get started.<br>
        Tap <strong>✎ Settings</strong> in the header to set up.
    </div>`;
}
