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
    const label = refreshing ? 'Refreshing…' : '⥀';
    return `<button class="ptsd-refresh-btn${disabled ? ' ptsd-refresh-btn--disabled' : ''}"
        id="ptsd-refresh-btn"
        aria-label="Refresh profile"
        ${disabled ? 'aria-disabled="true"' : ''}
    >${label}</button>`;
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
    const games = profile.games || [];
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

    // Completion floor
    if (vs.minCompletion && vs.minCompletion !== 'any') {
        labels.push(vs.minCompletion === '100' ? '100%' : `>${vs.minCompletion}%`);
    }

    // Recency
    const recencyLabels = {year: 'This year', '3months': '3 months', month: 'Last month'};
    if (vs.recency && vs.recency !== 'all') labels.push(recencyLabels[vs.recency] || vs.recency);

    // Platforms turned OFF
    const presentPlatforms = new Set(games.map(g => g.platform.toLowerCase()));
    const platformFilter = vs.platformFilter || {};
    for (const p of ['ps3', 'ps4', 'ps5', 'vita']) {
        if (presentPlatforms.has(p) && platformFilter[p] === false) {
            labels.push(`No ${p === 'vita' ? 'Vita' : p.toUpperCase()}`);
        }
    }

    // Visibility toggles turned OFF
    if (vs.showNoTrophies === false && games.some(g => g.pct === 0)) labels.push('No 0%');
    if (vs.showPlatinum === false && games.some(g => (g.tierEarned?.platinum || 0) > 0)) labels.push('No Plat');
    if (vs.showPct100 === false && games.some(g => g.pct === 100 && !g.tierEarned?.platinum)) labels.push('No 100%');

    return labels;
}

// ── renderFilterBar ───────────────────────────────────────────────────────────
// Toggle row (normal flow) + floating panel (absolute, shown/hidden via class).
// The wrapper is position:relative so the panel anchors to it.
// filtersOpen is session-only state passed in from main.js.

export function renderFilterBar(profile, filtersOpen = false) {
    const vs = profile.viewState || {};
    const games = profile.games || [];
    const activeLabels = getActiveFilterSummary(profile);

    const summaryHtml = activeLabels.length > 0
        ? activeLabels.map(l => `<span class="ptsd-filter-summary-pill">${escHtml(l)}</span>`).join('')
        : '';

    const arrow = filtersOpen ? '▼' : '▶';

    // ── Sort dropdown ──
    const sortOptions = [
        {value: 'recent', label: 'Recent activity'},
        {value: 'pct_asc', label: 'Completion % ↑'},
        {value: 'pct_desc', label: 'Completion % ↓'},
        {value: 'alpha', label: 'A–Z'},
        {value: 'platform', label: 'Platform'},
        {value: 'platinum', label: 'Platinum first'},
    ];
    const currentSort = vs.sort || 'recent';
    const sortHtml = sortOptions.map(o =>
        `<option value="${o.value}"${currentSort === o.value ? ' selected' : ''}>${o.label}</option>`
    ).join('');

    // ── Completion floor pills ──
    const floorOptions = [
        {value: 'any', label: 'Any'},
        {value: '25', label: '>25%'},
        {value: '50', label: '>50%'},
        {value: '75', label: '>75%'},
        {value: '90', label: '>90%'},
        {value: '100', label: '100%'},
    ];
    const floorHtml = floorOptions.map(o => {
        const active = (vs.minCompletion || 'any') === o.value;
        return `<button class="ptsd-pill${active ? ' ptsd-pill--active' : ''}" data-min-completion="${o.value}">${o.label}</button>`;
    }).join('');

    // ── Recency pills ──
    const recencyOptions = [
        {value: 'all', label: 'All time'},
        {value: 'year', label: 'This year'},
        {value: '3months', label: 'Last 3 months'},
        {value: 'month', label: 'Last month'},
    ];
    const recencyHtml = recencyOptions.map(o => {
        const active = (vs.recency || 'all') === o.value;
        return `<button class="ptsd-pill${active ? ' ptsd-pill--active' : ''}" data-recency="${o.value}">${o.label}</button>`;
    }).join('');

    // ── Platform chips — data-driven ──
    const platforms = ['ps3', 'ps4', 'ps5', 'vita'];
    const presentPlatforms = new Set(games.map(g => g.platform.toLowerCase()));
    const platformFilter = vs.platformFilter || {};

    const platformHtml = platforms
        .filter(p => presentPlatforms.has(p))
        .map(p => {
            const on = platformFilter[p] !== false;
            const label = p === 'vita' ? 'Vita' : p.toUpperCase();
            return `<button class="ptsd-pill ptsd-pill--platform${on ? ' ptsd-pill--active' : ''}"
                data-platform="${p}">${label}</button>`;
        }).join('');

    // ── Visibility toggles — data-driven ──
    const hasNoTrophies = games.some(g => g.pct === 0);
    const hasPlatinum = games.some(g => (g.tierEarned?.platinum || 0) > 0);
    const hasPct100 = games.some(g => g.pct === 100 && !(g.tierEarned?.platinum));

    const visHtml = [
        hasNoTrophies ? `<button class="ptsd-pill${vs.showNoTrophies !== false ? ' ptsd-pill--active' : ''}"
            id="ptsd-toggle-no-trophies">No Trophies</button>` : '',
        hasPlatinum ? `<button class="ptsd-pill${vs.showPlatinum !== false ? ' ptsd-pill--active' : ''}"
            id="ptsd-toggle-platinum">Platinums</button>` : '',
        hasPct100 ? `<button class="ptsd-pill${vs.showPct100 !== false ? ' ptsd-pill--active' : ''}"
            id="ptsd-toggle-pct100">100%</button>` : '',
    ].join('');

    const hasToggles = platformHtml || visHtml;

    return `<div class="ptsd-filter-wrapper" id="ptsd-filter-wrapper">
        <button class="ptsd-filter-toggle" id="ptsd-filter-toggle" aria-expanded="${filtersOpen}">
            <span class="ptsd-filter-arrow">${arrow}</span>
            <span class="ptsd-filter-toggle-label">Filters</span>
            ${summaryHtml}
        </button>

        <div class="ptsd-filter-panel${filtersOpen ? ' ptsd-filter-panel--open' : ''}" id="ptsd-filter-panel">
            <div class="ptsd-filter-row--sort">
                <select class="ptsd-sort-select" id="ptsd-sort-select" aria-label="Sort games">
                    ${sortHtml}
                </select>
            </div>

            <div class="ptsd-filter-section">
                <span class="ptsd-filter-label">Completion</span>
                <div class="ptsd-pill-row">${floorHtml}</div>
            </div>

            <div class="ptsd-filter-section">
                <span class="ptsd-filter-label">Activity</span>
                <div class="ptsd-pill-row">${recencyHtml}</div>
            </div>

            ${hasToggles ? `<div class="ptsd-filter-section">
                <span class="ptsd-filter-label">Show</span>
                <div class="ptsd-pill-row">
                    ${platformHtml}
                    ${visHtml}
                </div>
            </div>` : ''}
        </div>
    </div>`;
}

// ── renderGameList (Step 5 stub) ──────────────────────────────────────────────

export function renderGameList(profile) {
    const count = (profile.games || []).length;
    if (count === 0) {
        return `<div class="ptsd-empty-games empty-state">
            <div class="big">🎮</div>
            No games found in your PlayStation library.
        </div>`;
    }
    return `<div class="ptsd-game-list" id="ptsd-game-list">
        <div class="empty-state" style="padding:24px">
            ${count} game${count !== 1 ? 's' : ''} in library — game cards coming in Step 5.
        </div>
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
