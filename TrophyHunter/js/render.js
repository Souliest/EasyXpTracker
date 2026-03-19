// TrophyHunter/js/render.js
// All HTML section builders and DOM update functions for the main view.
// Receives data and callbacks as parameters — no loadData calls, no module-level state.

// ═══════════════════════════════════════════════
// Render — section builders and DOM orchestration
// ═══════════════════════════════════════════════

// ── Tier config ──

const TIERS = {
    platinum: {label: 'Platinum', color: '#d4c5f9', order: 0},
    gold: {label: 'Gold', color: '#e8b84b', order: 1},
    silver: {label: 'Silver', color: '#b0b8c1', order: 2},
    bronze: {label: 'Bronze', color: '#c4713a', order: 3},
};

// SVG trophy path — used for tier badges.
// A simple trophy silhouette, sized to ~16x16.
const TROPHY_SVG_PATH = 'M12 2H4v6c0 2.2 1.4 4 3.3 4.7L7 14H6v2h4v-2H9l-.3-1.3C10.6 12 12 10.2 12 8V2zM2 4H0v2c0 1.1.7 2 1.7 2.4V4H2zm12 0h1.7v4.4C16.7 8 17 7.1 17 6V4h-1.3-1.7z';

function trophyIcon(tier, earned, size = 16) {
    const cfg = TIERS[tier] || TIERS.bronze;
    const color = earned ? cfg.color : 'var(--muted)';
    return `<svg class="trophy-icon" width="${size}" height="${size}" viewBox="0 0 16 16"
        aria-hidden="true" fill="${color}">
        <path d="${TROPHY_SVG_PATH}"/>
    </svg>`;
}

// ── Stat computation ──

export function computeStats(groups, trophyState) {
    let total = 0, earned = 0;
    let tierTotal = {platinum: 0, gold: 0, silver: 0, bronze: 0};
    let tierEarned = {platinum: 0, gold: 0, silver: 0, bronze: 0};
    let hasPlatinum = false;
    let platinumEarned = false;

    for (const group of groups) {
        for (const trophy of group.trophies) {
            const state = trophyState[String(trophy.trophyId)] || {};
            if (state.orphaned) continue;

            const type = trophy.type || 'bronze';
            if (type === 'platinum') {
                hasPlatinum = true;
                platinumEarned = !!state.earned;
                // Platinum not counted in progress bar
                continue;
            }

            total++;
            tierTotal[type] = (tierTotal[type] || 0) + 1;
            if (state.earned) {
                earned++;
                tierEarned[type] = (tierEarned[type] || 0) + 1;
            }
        }
    }

    const pct = total > 0 ? Math.round((earned / total) * 100) : 0;

    return {
        total, earned, pct,
        tierTotal, tierEarned,
        hasPlatinum, platinumEarned,
    };
}

export function computeGroupStats(group, trophyState) {
    let total = 0, earned = 0;
    let tierTotal = {gold: 0, silver: 0, bronze: 0};
    let tierEarned = {gold: 0, silver: 0, bronze: 0};
    let isComplete = false;
    let hasNonPlatinum = false;

    for (const trophy of group.trophies) {
        const state = trophyState[String(trophy.trophyId)] || {};
        if (state.orphaned) continue;
        const type = trophy.type || 'bronze';
        if (type === 'platinum') continue;  // platinum not in group progress

        hasNonPlatinum = true;
        total++;
        tierTotal[type] = (tierTotal[type] || 0) + 1;
        if (state.earned) {
            earned++;
            tierEarned[type] = (tierEarned[type] || 0) + 1;
        }
    }

    const pct = total > 0 ? Math.round((earned / total) * 100) : 0;
    isComplete = hasNonPlatinum && earned === total;

    return {total, earned, pct, tierTotal, tierEarned, isComplete};
}

// ── Tier chips row (Gold / Silver / Bronze counts) ──

function renderTierChips(tierEarned, tierTotal, size = 14) {
    return ['gold', 'silver', 'bronze'].map(tier => {
        const e = tierEarned[tier] || 0;
        const t = tierTotal[tier] || 0;
        const color = t > 0 ? TIERS[tier].color : 'var(--muted)';
        return `<span class="tier-chip">
            ${trophyIcon(tier, t > 0, size)}
            <span class="tier-chip-count" style="color:${color}">${e}</span>
        </span>`;
    }).join('');
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
// selectedGameId  — currently selected game id or null
// personalData    — full { games: [...] } object
// catalogEntry    — catalog entry for selected game, or null
// callbacks       — interaction handlers from main.js

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

    content.innerHTML = [
        renderGameHeader(game, catalogEntry, stats),
        renderToolbar(game.viewState, callbacks),
        renderTrophyList(game, catalogEntry, stats, callbacks),
    ].join('');

    // Wire game icon error handler — avoids inline onerror attribute (architecture rule)
    const gameIcon = content.querySelector('[data-icon="gameHeader"]');
    if (gameIcon) gameIcon.addEventListener('error', () => {
        gameIcon.style.display = 'none';
    });

    _wireToolbar(game, callbacks);
    _wireTrophyRows(game, catalogEntry, callbacks);
    _wireLongPress(game, catalogEntry, callbacks);
}

// ─────────────────────────────────────────────
// renderGameHeader — top-level summary panel
// ─────────────────────────────────────────────

export function renderGameHeader(game, catalogEntry, stats) {
    const platIndicator = stats.hasPlatinum
        ? `${trophyIcon('platinum', stats.platinumEarned, 22)}`
        : `<span class="th-plat-check ${stats.pct === 100 ? 'earned' : ''}">✓</span>`;

    return `<div class="th-game-header panel" id="gameHeader">
        <div class="th-game-title-row">
            ${catalogEntry.iconUrl
        ? `<img class="th-game-icon" src="${_escHtml(catalogEntry.iconUrl)}"
                    alt="" aria-hidden="true" data-icon="gameHeader">`
        : ''}
            <div class="th-game-title">${_escHtml(game.name)}</div>
            <span class="th-platform-badge">${_escHtml(game.platform)}</span>
        </div>
        <div class="th-header-stats">
            <span class="th-plat-indicator">${platIndicator}</span>
            ${renderTierChips(stats.tierEarned, stats.tierTotal, 16)}
            <span class="th-stat-fraction">${stats.earned}/${stats.total}</span>
            ${renderProgressBar(stats.pct)}
            <span class="th-stat-pct">${stats.pct}%</span>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────
// renderToolbar — filter / sort / ungroup
// ─────────────────────────────────────────────

export function renderToolbar(viewState, callbacks) {
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

    return `<div class="th-toolbar">
        <select id="filterSelect" aria-label="Filter trophies">
            ${filterOptions}
        </select>
        <select id="sortSelect" aria-label="Sort trophies">
            ${sortOptions}
        </select>
        <button class="btn btn-ghost th-ungroup-btn${ungroupActive}"
            id="ungroupBtn" title="Ungroup DLC">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <rect x="1" y="2" width="14" height="3" rx="1"/>
                <rect x="1" y="7" width="14" height="3" rx="1"/>
                <rect x="1" y="12" width="14" height="3" rx="1"/>
            </svg>
        </button>
    </div>`;
}

// ─────────────────────────────────────────────
// renderTrophyList — groups or flat list
// ─────────────────────────────────────────────

function renderTrophyList(game, catalogEntry, stats, callbacks) {
    if (game.viewState.ungrouped) {
        return renderFlatList(game, catalogEntry, callbacks);
    }
    return renderGroupedList(game, catalogEntry, callbacks);
}

function renderGroupedList(game, catalogEntry, callbacks) {
    return catalogEntry.groups.map(group => {
        const groupStats = computeGroupStats(group, game.trophyState);
        return renderGroup(group, game, groupStats, callbacks);
    }).join('');
}

function renderFlatList(game, catalogEntry, callbacks) {
    // Merge all trophies from all groups into one flat array
    const allTrophies = catalogEntry.groups.flatMap(g => g.trophies);
    const sorted = sortTrophies(allTrophies, game.viewState.sort);
    const filtered = filterTrophies(sorted, game.trophyState, game.viewState.filter);

    if (filtered.length === 0 && game.viewState.filter !== 'all') {
        return renderEmptyFilter(game.viewState.filter);
    }

    return `<div class="th-flat-list">
        ${filtered.map(t => renderTrophyRow(t, game.trophyState, callbacks)).join('')}
    </div>`;
}

// ─────────────────────────────────────────────
// renderGroup — one DLC section
// ─────────────────────────────────────────────

export function renderGroup(group, game, groupStats, callbacks) {
    const sorted = sortTrophies(group.trophies, game.viewState.sort);
    const filtered = filterTrophies(sorted, game.trophyState, game.viewState.filter);

    // Pinned trophies float to top (within filtered set, unearned only)
    const pinned = filtered.filter(t => game.trophyState[String(t.trophyId)]?.pinned);
    const unpinned = filtered.filter(t => !game.trophyState[String(t.trophyId)]?.pinned);
    const ordered = [...pinned, ...unpinned];

    const isEmpty = ordered.length === 0 && game.viewState.filter !== 'all';

    return `<div class="th-group" data-group-id="${_escHtml(group.groupId)}">
        ${renderGroupHeader(group, groupStats)}
        <div class="th-group-body" id="group-body-${_escHtml(group.groupId)}">
            ${isEmpty
        ? `<div class="th-empty-filter">No ${game.viewState.filter} trophies in this group.</div>`
        : ordered.map(t => renderTrophyRow(t, game.trophyState, callbacks)).join('')
    }
        </div>
    </div>`;
}

// ─────────────────────────────────────────────
// renderGroupHeader — branch-node style
// ─────────────────────────────────────────────

export function renderGroupHeader(group, groupStats) {
    const checkClass = groupStats.isComplete ? 'th-group-check complete' : 'th-group-check';

    return `<div class="th-group-header" data-group-id="${_escHtml(group.groupId)}">
        <div class="th-group-header-top">
            <span class="th-group-toggle" aria-hidden="true">▼</span>
            <span class="th-group-name">${_escHtml(group.name)}</span>
        </div>
        <div class="th-group-header-stats">
            <span class="${checkClass}" title="${groupStats.isComplete ? 'Complete' : 'Incomplete'}">✓</span>
            ${renderTierChips(groupStats.tierEarned, groupStats.tierTotal, 14)}
            <span class="th-stat-fraction">${groupStats.earned}/${groupStats.total}</span>
            ${renderProgressBar(groupStats.pct)}
            <span class="th-stat-pct">${groupStats.pct}%</span>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────
// renderTrophyRow — leaf node
// ─────────────────────────────────────────────

export function renderTrophyRow(trophy, trophyState, callbacks) {
    const id = String(trophy.trophyId);
    const state = trophyState[id] || {};
    const earned = !!state.earned;
    const pinned = !!state.pinned;
    const orphaned = !!state.orphaned;
    const dimmed = !!trophy._dimmed; // set by filterTrophies supersort

    const cfg = TIERS[trophy.type] || TIERS.bronze;
    const tierColor = earned ? cfg.color : 'var(--muted)';

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
                <span class="th-trophy-name">${_escHtml(trophy.name)}</span>
                <span class="th-tier-badge" style="color:${tierColor}">
                    ${trophyIcon(trophy.type, earned, 14)}
                    <span class="th-tier-label">${cfg.label.toUpperCase()}</span>
                </span>
            </div>
            <div class="th-trophy-detail">${_escHtml(trophy.detail || '')}</div>
            ${orphaned ? `<div class="th-orphaned-label">⚠ No longer in PSN data</div>` : ''}
        </div>
        ${pinned ? `<span class="th-pin-indicator" aria-label="Pinned">📌</span>` : ''}
    </div>`;
}

// ─────────────────────────────────────────────
// Targeted updates (avoid full re-render on earn/pin)
// ─────────────────────────────────────────────

export function refreshTrophyRow(trophyId, trophy, trophyState, callbacks) {
    const el = document.querySelector(`.th-trophy-row[data-trophy-id="${trophyId}"]`);
    if (!el) return;

    const newHtml = renderTrophyRow(trophy, trophyState, callbacks);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    const newEl = tmp.firstElementChild;

    // Re-wire the earn button on the new element
    const earnBtn = newEl.querySelector('[data-action="earn"]');
    if (earnBtn) {
        earnBtn.addEventListener('click', e => {
            e.stopPropagation();
            callbacks.onToggleEarned(trophyId);
        });
    }

    el.replaceWith(newEl);
}

export function updateGroupHeader(groupId, group, groupStats) {
    const header = document.querySelector(`.th-group-header[data-group-id="${groupId}"]`);
    if (!header) return;

    const tmp = document.createElement('div');
    tmp.innerHTML = renderGroupHeader(group, groupStats);
    const newHeader = tmp.firstElementChild;

    // Preserve collapsed state
    const body = document.getElementById(`group-body-${groupId}`);
    const isCollapsed = body && body.classList.contains('collapsed');
    const toggle = newHeader.querySelector('.th-group-toggle');
    if (toggle) toggle.textContent = isCollapsed ? '▶' : '▼';

    // Re-wire toggle click
    newHeader.addEventListener('click', () => {
        if (body) body.classList.toggle('collapsed');
        const t = newHeader.querySelector('.th-group-toggle');
        if (t) t.textContent = body && body.classList.contains('collapsed') ? '▶' : '▼';
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
        // 'psn' — canonical order by trophyNum. Explicit sort guards against
        // any upstream reordering; trophyNum is the PSN-assigned sequence index.
        arr.sort((a, b) => (a.trophyNum ?? a.trophyId) - (b.trophyNum ?? b.trophyId));
    }
    return arr;
}

export function filterTrophies(trophies, trophyState, filter) {
    if (filter === 'all') return trophies;

    const wantEarned = filter === 'earned';

    // "supersort" — wanted trophies first, unwanted dimmed at bottom
    const wanted = trophies.filter(t => {
        const s = trophyState[String(t.trophyId)] || {};
        return wantEarned ? !!s.earned : !s.earned;
    });
    const unwanted = trophies.filter(t => {
        const s = trophyState[String(t.trophyId)] || {};
        return wantEarned ? !s.earned : !!s.earned;
    });

    // Return all trophies — wanted first, unwanted appended with a dim class
    // The dim class is applied in renderTrophyRow based on filter context
    return [...wanted, ...unwanted.map(t => ({...t, _dimmed: true}))];
}

// ─────────────────────────────────────────────
// Event wiring — called after renderMain sets innerHTML
// ─────────────────────────────────────────────

function _wireToolbar(game, callbacks) {
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
    if (ungroupBtn) {
        ungroupBtn.addEventListener('click', () => {
            callbacks.onViewStateChange({
                ...game.viewState,
                ungrouped: !game.viewState.ungrouped,
            });
        });
    }

    // Wire group header toggles
    document.querySelectorAll('.th-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const groupId = header.dataset.groupId;
            const body = document.getElementById(`group-body-${groupId}`);
            if (!body) return;
            body.classList.toggle('collapsed');
            const toggle = header.querySelector('.th-group-toggle');
            if (toggle) toggle.textContent = body.classList.contains('collapsed') ? '▶' : '▼';
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
        _attachLongPress(row, () => callbacks.onTogglePinned(trophyId));
    });
}

// ─────────────────────────────────────────────
// Long-press helper (same pattern as ThingCounter)
// ─────────────────────────────────────────────

function _attachLongPress(el, callback) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    const THRESHOLD = 10;

    el.addEventListener('pointerdown', e => {
        startX = e.clientX;
        startY = e.clientY;
        timer = setTimeout(() => {
            timer = null;
            callback();
        }, 500);
    });

    el.addEventListener('pointermove', e => {
        if (!timer) return;
        if (Math.abs(e.clientX - startX) > THRESHOLD ||
            Math.abs(e.clientY - startY) > THRESHOLD) {
            clearTimeout(timer);
            timer = null;
        }
    });

    el.addEventListener('pointerup', () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    });
    el.addEventListener('pointerleave', () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    });
}

// ─────────────────────────────────────────────
// Empty state helpers
// ─────────────────────────────────────────────

function renderEmptyFilter(filter) {
    return `<div class="th-empty-filter">No ${filter} trophies.</div>`;
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}