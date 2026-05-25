// TrophySummary/js/render.js
// All HTML builders for the main view.
// Receives data as parameters — no loadData calls, no module-level state.
//
// Step 3: renderProfileCard is fully implemented.
//         renderFilterBar and renderGameList are stubs (Steps 4 and 5).

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
// Renders: [icon][count][(+N)] for each tier.
// Delta rendered in --accent3, slightly smaller, immediately after count.

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

// ── Avatar ─────────────────────────────────────────────────────────────────────

function _renderAvatar(avatarUrl) {
    if (avatarUrl) {
        // Validate protocol before use (same pattern as TrophyHunter _safeIconUrl).
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

// ── Level progress bar ────────────────────────────────────────────────────────

function _renderLevelBar(progress) {
    const pct = Math.max(0, Math.min(100, progress || 0));
    return `<div class="ptsd-level-bar th-progress-track" role="progressbar"
        aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
        aria-label="Level progress ${pct}%">
        <div class="th-progress-fill" style="width:${pct}%"></div>
    </div>`;
}

// ── renderProfileCard ─────────────────────────────────────────────────────────
// Sticky card at the top of the page.
// Stale marker visual states per handoff:
//   clean + rate-limited:  timestamp muted, button grayed, no stale label
//   stale + rate-limited:  stale label in --muted, button grayed
//   stale + available:     stale label AND timestamp in red (#ff4444), button active
//   clean + available:     timestamp normal, button active, no stale label

export function renderProfileCard(profile, refreshing = false) {
    const rateLimited = isRateLimited('global');
    const stale = isProfileStale(profile);
    const deltas = computeDeltas(
        profile.tierEarned,
        profile.tierEarnedAtLastGlobalRefresh
    );

    const timestamp = _formatRelativeTime(profile.lastFullRefresh);

    // Determine visual states.
    const refreshAvailable = !rateLimited && !refreshing;
    const staleAndAvailable = stale && refreshAvailable;

    // Timestamp color: red only when stale AND available.
    const tsColorStyle = staleAndAvailable ? ' style="color:#ff4444"' : '';

    // Stale label: shown when stale; color is red when available, muted otherwise.
    const staleLabel = stale
        ? `<span class="ptsd-stale-label${staleAndAvailable ? ' ptsd-stale-label--urgent' : ''}"
              id="ptsd-stale-label">stale data</span>`
        : `<span class="ptsd-stale-label" id="ptsd-stale-label" style="display:none"></span>`;

    const overallPct = profile.overallPct || 0;

    return `<div class="ptsd-profile-card panel" id="ptsd-profile-card">
        <div class="ptsd-card-row ptsd-card-top">
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

        <div class="ptsd-card-row ptsd-card-stats">
            <div class="ptsd-tier-chips-row">
                ${_renderTierChipsWithDeltas(profile.tierEarned, deltas)}
            </div>
            <span class="ptsd-overall-pct th-stat-pct">${overallPct}%</span>
        </div>

        <div class="ptsd-card-row ptsd-card-footer">
            <div class="ptsd-footer-left">
                ${timestamp
        ? `<span class="ptsd-timestamp${staleAndAvailable ? ' ptsd-timestamp--urgent' : ''}"${tsColorStyle}
                          id="ptsd-timestamp">Updated ${escHtml(timestamp)}</span>`
        : `<span class="ptsd-timestamp ptsd-timestamp--never" id="ptsd-timestamp">Never refreshed</span>`
    }
                ${staleLabel}
            </div>
        </div>
    </div>`;
}

// ── renderFilterBar (Step 4 stub) ─────────────────────────────────────────────

export function renderFilterBar(profile) {
    // Fully implemented in Step 4.
    return `<div class="ptsd-filter-bar" id="ptsd-filter-bar">
        <!-- Filter/sort controls — Step 4 -->
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
    // Fully implemented in Step 5.
    return `<div class="ptsd-game-list" id="ptsd-game-list">
        <div class="empty-state" style="padding:24px">
            ${count} game${count !== 1 ? 's' : ''} in library — game cards coming in Step 5.
        </div>
    </div>`;
}

// ── renderEmptyState ──────────────────────────────────────────────────────────
// Shown before a PS username is linked.

export function renderEmptyState() {
    return `<div class="empty-state">
        <div class="big">🏆</div>
        Link your PlayStation username to get started.<br>
        Tap <strong>✎ Settings</strong> in the header to set up.
    </div>`;
}
