// TrophyHunter/js/render.js
// All HTML section builders and DOM update functions for the main view.
// Receives data and callbacks as parameters — no loadData calls, no module-level state.

// ═══════════════════════════════════════════════
// Render — section builders and DOM orchestration
// ═══════════════════════════════════════════════

import {escHtml, attachLongPress} from '../../common/utils.js';

export {computeStats, computeGroupStats} from './stats.js';

const TIERS = {
    platinum: {label: 'Platinum', color: '#d4c5f9', order: 0},
    gold: {label: 'Gold', color: '#e8b84b', order: 1},
    silver: {label: 'Silver', color: '#b0b8c1', order: 2},
    bronze: {label: 'Bronze', color: '#c4713a', order: 3},
};

// ── Trophy SVG paths ──
const TROPHY_SVG_PATH = 'M3 1H13V8C13 11.5 10.8 14.2 8 15.1L7.5 17H6V19H10V17H8.5L8 15.1C5.2 14.2 3 11.5 3 8ZM3 2H1V5C1 6.4 1.9 7.5 3 7.9ZM13 2H15V5C15 6.4 14.1 7.5 13 7.9Z';
const PLATINUM_CUP_PATH = 'M3 1H13V8C13 11.5 10.8 14.2 8 15.1L7.5 17H6V19H10V17H8.5L8 15.1C5.2 14.2 3 11.5 3 8ZM3 2H1V5C1 6.4 1.9 7.5 3 7.9ZM13 2H15V5C15 6.4 14.1 7.5 13 7.9Z';
const PLATINUM_STAR_PATH = 'M8 2.5L8.7 4.7H11L9.2 5.9L9.8 8.1L8 6.9L6.2 8.1L6.8 5.9L5 4.7H7.3Z';

function trophyIcon(tier, earned, size = 16) {
    const cfg = TIERS[tier] || TIERS.bronze;
    const color = cfg.color;
    const opacity = earned ? '1' : '0.25';

    if (tier === 'platinum') {
        return `<svg class="trophy-icon trophy-icon-platinum" width="${size}" height="${size}" viewBox="0 0 16 20"
            aria-hidden="true" opacity="${opacity}">
            <path d="${PLATINUM_CUP_PATH}" fill="${color}"/>
            <path d="${PLATINUM_STAR_PATH}" fill="#1a1a2e"/>
        </svg>`;
    }

    return `<svg class="trophy-icon" width="${size}" height="${size}" viewBox="0 0 16 20"
        aria-hidden="true" fill="${color}" opacity="${opacity}">
        <path d="${TROPHY_SVG_PATH}"/>
    </svg>`;
}

// ── Tier chips row ──

function renderTierChips(tierEarned, tierTotal, size, hasPlatinum, platinumEarned, leadingIndicator = '') {
    const platSize = size + 3;
    const platChip = hasPlatinum
        ? `<span class="tier-chip tier-chip-plat">${trophyIcon('platinum', platinumEarned, platSize)}</span>`
        : '';
    const rest = ['gold', 'silver', 'bronze'].map(tier => {
        const e = tierEarned[tier] || 0;
        const t = tierTotal[tier] || 0;
        const color = TIERS[tier].color;
        return `<span class="tier-chip">
            ${trophyIcon(tier, true, size)}
            <span class="tier-chip-count" style="color:${color}">${e}</span><span class="tier-chip-total" style="color:${color}">/${t}</span>
        </span>`;
    }).join('');
    return `<span class="th-chips-group">${leadingIndicator}${platChip}${rest}</span>`;
}

// ── Progress bar ──

function renderProgressBar(pct) {
    return `<div class="th-progress-track">
        <div class="th-progress-fill" style="width:${pct}%"></div>
    </div>`;
}

// ─────────────────────────────────────────────
// updateSelectorButtons
// ─────────────────────────────────────────────

export function updateSelectorButtons(hasGame) {
    const settingsBtn = document.getElementById('gameSettingsBtn');
    if (settingsBtn) settingsBtn.style.display = hasGame ? '' : 'none';
}

// ─────────────────────────────────────────────
// renderMain
// ─────────────────────────────────────────────

export function renderMain(selectedGameId, personalData, catalogEntry, callbacks) {
    const content = document.getElementById('mainContent');

    if (!selectedGameId) {
        content.innerHTML = personalData.games.length === 0
            ? `<div class="empty-state">
                <div class="big">🏆</div>
                No games yet.<br>Hit <strong>+ Add Game</strong> to start tracking.
               </div>`
            : `<div class="empty-state">Select a game above.</div>`;
        return;
    }

    const game = personalData.games.find(g => g.id === selectedGameId);
    if (!game) {
        content.innerHTML = '';
        return;
    }

    if (!catalogEntry) {
        content.innerHTML = `<div class="empty-state">
            <div class="big">📡</div>
            Trophy data unavailable.<br>
            Connect to the internet to load trophies for this game.
        </div>`;
        return;
    }

    const stats = computeStats(catalogEntry.groups, game.trophyState);

    const isSingleGroup = catalogEntry.groups.length === 1;
    const effectiveViewState = isSingleGroup
        ? {...game.viewState, ungrouped: true}
        : game.viewState;

    content.innerHTML = [
        renderGameHeader(game, catalogEntry, stats),
        renderToolbar(effectiveViewState, callbacks, isSingleGroup),
        renderTrophyList(game, catalogEntry, stats, callbacks, effectiveViewState),
    ].join('');

    const gameIcon = content.querySelector('[data-icon="gameHeader"]');
    if (gameIcon) gameIcon.addEventListener('error', () => {
        gameIcon.style.display = 'none';
    });

    _wireToolbar(game, callbacks, isSingleGroup);
    _wireTrophyRows(game, catalogEntry, callbacks);
    _wireLongPress(game, catalogEntry, callbacks);
}

// ─────────────────────────────────────────────
// renderGameHeader
// ─────────────────────────────────────────────

export function renderGameHeader(game, catalogEntry, stats) {
    return `<div class="th-game-header panel" id="gameHeader">
        <div class="th-game-title-row">
            ${catalogEntry.iconUrl
        ? `<img class="th-game-icon" src="${escHtml(catalogEntry.iconUrl)}"
                        alt="" aria-hidden="true" data-icon="gameHeader">`
        : ''}
            <div class="th-game-title">${escHtml(game.name)}</div>
            <span class="th-platform-badge">${escHtml(game.platform)}</span>
        </div>
        <div class="th-header-stats">
            <div class="th-stats-chips-row">
                ${renderTierChips(stats.tierEarned, stats.tierTotal, 16, stats.hasPlatinum, stats.platinumEarned)}
                <span class="th-stat-fraction">${stats.earned}/${stats.total}</span>
            </div>
            <div class="th-stats-bar-row">
                ${renderProgressBar(stats.pct)}
                <span class="th-stat-pct">${stats.pct}%</span>
            </div>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────
// renderToolbar
// ─────────────────────────────────────────────

export function renderToolbar(viewState, callbacks, isSingleGroup = false) {
    const filters = ['all', 'earned', 'unearned'];
    const sorts = [
        {value: 'psn', label: 'PSN'},
        {value: 'alpha', label: 'A–Z'},
        {value: 'grade', label: 'Grade'},
    ];

    const filterOptions = filters.map(f =>
        `<option value="${f}" ${viewState.filter === f ? 'selected' : ''}>
            ${f.charAt(0).toUpperCase() + f.slice(1)}
        </option>`
    ).join('');

    const sortOptions = sorts.map(s =>
        `<option value="${s.value}" ${viewState.sort === s.value ? 'selected' : ''}>
            ${s.label}
        </option>`
    ).join('');

    const ungroupActive = viewState.ungrouped ? ' active' : '';

    const ungroupBtn = isSingleGroup ? '' : `
        <button class="btn btn-ghost th-ungroup-btn${ungroupActive}"
            id="ungroupBtn" title="Ungroup DLC">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <rect x="1" y="2" width="14" height="3" rx="1"/>
                <rect x="1" y="7" width="14" height="3" rx="1"/>
                <rect x="1" y="12" width="14" height="3" rx="1"/>
            </svg>
        </button>`;

    return `<div class="th-toolbar">
        <select id="filterSelect" aria-label="Filter trophies">
            ${filterOptions}
        </select>
        <select id="sortSelect" aria-label="Sort trophies">
            ${sortOptions}
        </select>
        ${ungroupBtn}
    </div>`;
}

// ─────────────────────────────────────────────
// renderTrophyList
// ─────────────────────────────────────────────

function renderTrophyList(game, catalogEntry, stats, callbacks, effectiveViewState) {
    if (effectiveViewState.ungrouped) {
        return renderFlatList(game, catalogEntry, callbacks, effectiveViewState);
    }
    return renderGroupedList(game, catalogEntry, callbacks, effectiveViewState);
}

function renderGroupedList(game, catalogEntry, callbacks, viewState) {
    return catalogEntry.groups.map(group => {
        const groupStats = computeGroupStats(group, game.trophyState);
        return renderGroup(group, game, groupStats, callbacks, viewState);
    }).join('');
}

function renderFlatList(game, catalogEntry, callbacks, viewState) {
    const allTrophies = catalogEntry.groups.flatMap(g => g.trophies);
    const sorted = sortTrophies(allTrophies, viewState.sort);
    const filtered = filterTrophies(sorted, game.trophyState, viewState.filter);

    const nonDividers = filtered.filter(t => !t._divider);
    if (nonDividers.length === 0 && viewState.filter !== 'all') {
        return renderEmptyFilter(viewState.filter);
    }

    return `<div class="th-flat-list">
        ${filtered.map(t => t._divider
        ? renderSectionDivider(t._label)
        : renderTrophyRow(t, game.trophyState)
    ).join('')}
    </div>`;
}

// ─────────────────────────────────────────────
// renderGroup
// ─────────────────────────────────────────────

export function renderGroup(group, game, groupStats, callbacks, viewState) {
    const vs = viewState || game.viewState;
    const sorted = sortTrophies(group.trophies, vs.sort);
    const filtered = filterTrophies(sorted, game.trophyState, vs.filter);

    const primaryDividerIdx = filtered.findIndex(t => t._divider);
    const secondaryDividerIdx = primaryDividerIdx >= 0
        ? filtered.findIndex((t, i) => t._divider && i > primaryDividerIdx)
        : -1;

    let ordered;

    if (vs.filter === 'all') {
        const pinned = filtered.filter(t => game.trophyState[String(t.trophyId)]?.pinned);
        const unpinned = filtered.filter(t => !game.trophyState[String(t.trophyId)]?.pinned);
        ordered = [...pinned, ...unpinned];
    } else if (secondaryDividerIdx >= 0) {
        const leadingDivider = filtered[primaryDividerIdx];
        const wanted = filtered.slice(primaryDividerIdx + 1, secondaryDividerIdx);
        const secondaryDivider = filtered[secondaryDividerIdx];
        const unwanted = filtered.slice(secondaryDividerIdx + 1);
        const pinnedW = wanted.filter(t => game.trophyState[String(t.trophyId)]?.pinned);
        const restW = wanted.filter(t => !game.trophyState[String(t.trophyId)]?.pinned);
        ordered = [leadingDivider, ...pinnedW, ...restW, secondaryDivider, ...unwanted];
    } else if (primaryDividerIdx >= 0) {
        const leadingDivider = filtered[primaryDividerIdx];
        const trophies = filtered.filter(t => !t._divider);
        const pinned = trophies.filter(t => game.trophyState[String(t.trophyId)]?.pinned);
        const unpinned = trophies.filter(t => !game.trophyState[String(t.trophyId)]?.pinned);
        ordered = [leadingDivider, ...pinned, ...unpinned];
    } else {
        ordered = filtered;
    }

    const nonDividers = ordered.filter(t => !t._divider);
    const isEmpty = nonDividers.length === 0 && vs.filter !== 'all';

    const collapsedGroups = vs.collapsedGroups || [];
    const isCollapsed = collapsedGroups.includes(group.groupId);
    const toggleChar = isCollapsed ? '▶' : '▼';

    return `<div class="th-group" data-group-id="${escHtml(group.groupId)}">
        ${renderGroupHeader(group, groupStats, toggleChar)}
        <div class="th-group-children${isCollapsed ? ' collapsed' : ''}" id="group-body-${escHtml(group.groupId)}">
            ${isEmpty
        ? `<div class="th-empty-filter">No ${vs.filter} trophies in this group.</div>`
        : ordered.map(t => t._divider
            ? renderSectionDivider(t._label)
            : renderTrophyRow(t, game.trophyState)
        ).join('')
    }
        </div>
    </div>`;
}

// ─────────────────────────────────────────────
// renderGroupHeader
// ─────────────────────────────────────────────

export function renderGroupHeader(group, groupStats, toggleChar = '▼') {
    const completionIndicator = groupStats.hasPlatinum
        ? trophyIcon('platinum', groupStats.platinumEarned, 14)
        : `<span class="${groupStats.isComplete ? 'th-group-check complete' : 'th-group-check'}"
                title="${groupStats.isComplete ? 'Complete' : 'Incomplete'}">✓</span>`;

    const completeClass = groupStats.isComplete ? ' th-group-complete' : '';

    return `<div class="th-group-header${completeClass}" data-group-id="${escHtml(group.groupId)}">
        <div class="th-group-header-top">
            <span class="th-group-toggle" aria-hidden="true">${toggleChar}</span>
            <span class="th-group-name">${escHtml(group.name)}</span>
        </div>
        <div class="th-group-header-stats">
            <div class="th-stats-chips-row">
                ${renderTierChips(groupStats.tierEarned, groupStats.tierTotal, 13, false, false, completionIndicator)}
                <span class="th-stat-fraction">${groupStats.earned}/${groupStats.total}</span>
            </div>
            <div class="th-stats-bar-row">
                ${renderProgressBar(groupStats.pct)}
                <span class="th-stat-pct">${groupStats.pct}%</span>
            </div>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────
// renderTrophyRow
// ─────────────────────────────────────────────

export function renderTrophyRow(trophy, trophyState) {
    const id = String(trophy.trophyId);
    const state = trophyState[id] || {};
    const earned = !!state.earned;
    const pinned = !!state.pinned;
    const orphaned = !!state.orphaned;
    const dimmed = !!trophy._dimmed;

    const cfg = TIERS[trophy.type] || TIERS.bronze;
    const tierColor = cfg.color;

    const rowClass = [
        'th-trophy-row',
        earned ? 'th-trophy-earned' : '',
        pinned ? 'th-trophy-pinned' : '',
        orphaned ? 'th-trophy-orphaned' : '',
        dimmed ? 'th-trophy-dimmed' : '',
    ].filter(Boolean).join(' ');

    return `<div class="${rowClass}" data-trophy-id="${id}">
        <button class="th-earn-btn ${earned ? 'earned' : ''}"
            aria-label="${earned ? 'Mark unearned' : 'Mark earned'}"
            data-action="earn" data-id="${id}">
            ${earned ? '✓' : ''}
        </button>
        <div class="th-trophy-body">
            <div class="th-trophy-name-row">
                <span class="th-trophy-name">${escHtml(trophy.name)}</span>
                <span class="th-tier-badge">
                    ${trophyIcon(trophy.type, earned, 14)}
                    <span class="th-tier-label" style="color:${tierColor}">${cfg.label.toUpperCase()}</span>
                </span>
            </div>
            <div class="th-trophy-detail">${escHtml(trophy.detail || '')}</div>
            ${orphaned ? `<div class="th-orphaned-label">⚠ No longer in PSN data</div>` : ''}
        </div>
        ${pinned ? `<span class="th-pin-indicator" aria-label="Pinned">📌</span>` : ''}
    </div>`;
}

// ─────────────────────────────────────────────
// Targeted updates
// ─────────────────────────────────────────────

export function refreshTrophyRow(trophyId, trophy, trophyState, callbacks) {
    const el = document.querySelector(`.th-trophy-row[data-trophy-id="${trophyId}"]`);
    if (!el) return;

    const newHtml = renderTrophyRow(trophy, trophyState);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    const newEl = tmp.firstElementChild;

    const earnBtn = newEl.querySelector('[data-action="earn"]');
    if (earnBtn) {
        earnBtn.addEventListener('click', e => {
            e.stopPropagation();
            callbacks.onToggleEarned(trophyId);
        });
    }

    el.replaceWith(newEl);
}

export function updateGroupHeader(groupId, group, groupStats, collapsedGroups, onToggleGroup) {
    const header = document.querySelector(`.th-group-header[data-group-id="${groupId}"]`);
    if (!header) return;

    const isCollapsed = (collapsedGroups || []).includes(groupId);
    const tmp = document.createElement('div');
    tmp.innerHTML = renderGroupHeader(group, groupStats, isCollapsed ? '▶' : '▼');
    const newHeader = tmp.firstElementChild;

    newHeader.addEventListener('click', () => {
        if (onToggleGroup) onToggleGroup(groupId);
    });

    header.replaceWith(newHeader);
}

export function updateGameHeader(game, catalogEntry, stats) {
    const header = document.getElementById('gameHeader');
    if (!header) return;

    const tmp = document.createElement('div');
    tmp.innerHTML = renderGameHeader(game, catalogEntry, stats);
    header.replaceWith(tmp.firstElementChild);
}

// ─────────────────────────────────────────────
// Sort / filter helpers
// ─────────────────────────────────────────────

export function sortTrophies(trophies, sort) {
    const arr = [...trophies];
    if (sort === 'alpha') {
        arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sort === 'grade') {
        arr.sort((a, b) => {
            const ao = TIERS[a.type]?.order ?? 3;
            const bo = TIERS[b.type]?.order ?? 3;
            return ao - bo;
        });
    } else {
        arr.sort((a, b) => (a.trophyNum ?? a.trophyId) - (b.trophyNum ?? b.trophyId));
    }
    return arr;
}

export function filterTrophies(trophies, trophyState, filter) {
    if (filter === 'all') return trophies;

    const wantEarned = filter === 'earned';

    const wanted = trophies.filter(t => {
        const s = trophyState[String(t.trophyId)] || {};
        return wantEarned ? !!s.earned : !s.earned;
    });
    const unwanted = trophies.filter(t => {
        const s = trophyState[String(t.trophyId)] || {};
        return wantEarned ? !s.earned : !!s.earned;
    });

    const dimmed = unwanted.map(t => ({...t, _dimmed: true}));

    const primaryLabel = wantEarned ? 'Earned' : 'Unearned';
    const secondaryLabel = wantEarned ? 'Unearned' : 'Earned';

    const result = [];

    if (wanted.length > 0) {
        result.push({_divider: true, _label: primaryLabel});
        result.push(...wanted);
    }

    if (dimmed.length > 0) {
        result.push({_divider: true, _label: secondaryLabel});
        result.push(...dimmed);
    }

    return result;
}

// ─────────────────────────────────────────────
// Event wiring
// ─────────────────────────────────────────────

function _wireToolbar(game, callbacks, isSingleGroup) {
    const filterSel = document.getElementById('filterSelect');
    const sortSel = document.getElementById('sortSelect');
    const ungroupBtn = document.getElementById('ungroupBtn');

    if (filterSel) {
        filterSel.addEventListener('change', () => {
            callbacks.onViewStateChange({...game.viewState, filter: filterSel.value});
        });
    }
    if (sortSel) {
        sortSel.addEventListener('change', () => {
            callbacks.onViewStateChange({...game.viewState, sort: sortSel.value});
        });
    }
    if (ungroupBtn && !isSingleGroup) {
        ungroupBtn.addEventListener('click', () => {
            callbacks.onViewStateChange({
                ...game.viewState,
                ungrouped: !game.viewState.ungrouped,
            });
        });
    }

    document.querySelectorAll('.th-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const groupId = header.dataset.groupId;
            callbacks.onToggleGroup(groupId);
        });
    });
}

function _wireTrophyRows(game, catalogEntry, callbacks) {
    document.querySelectorAll('[data-action="earn"]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            callbacks.onToggleEarned(btn.dataset.id);
        });
    });
}

function _wireLongPress(game, catalogEntry, callbacks) {
    document.querySelectorAll('.th-trophy-row').forEach(row => {
        const trophyId = row.dataset.trophyId;
        attachLongPress(row, () => callbacks.onTogglePinned(trophyId));
    });
}

// ─────────────────────────────────────────────
// Section divider
// ─────────────────────────────────────────────

function renderSectionDivider(label) {
    const color = label === 'Earned' ? 'var(--accent3)' : '#ff4444';
    return `<div class="th-section-divider" style="border-color:${color}" aria-hidden="true">
        <span class="th-section-divider-label" style="color:${color}">${escHtml(label)}</span>
    </div>`;
}

function renderEmptyFilter(filter) {
    return `<div class="th-empty-filter">No ${filter} trophies.</div>`;
}