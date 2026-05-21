// ChecklistManager/js/render.js
// All HTML builders and targeted DOM update functions.
// Receives data as parameters — no loadData() calls inside this module.
//
// Layer 1: selector visibility, empty state.
// Layer 2: filter bar, resource tally, item panels, step rows, completion.
// Layer 3: pinned section, briefing modal, focus mode.

import {escHtml} from '../../common/utils.js';

// ── Selector bar helpers ──────────────────────────────────────────────────────

export function updateProjectActionButtons(hasProject) {
    const editBtn = document.getElementById('editProjectBtn');
    const addItemRow = document.getElementById('addItemRow');
    if (editBtn) editBtn.style.display = hasProject ? '' : 'none';
    if (addItemRow) addItemRow.style.display = hasProject ? '' : 'none';
}

export function rebuildSelector(index, selectedProjectId) {
    const sel = document.getElementById('projectSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">— select a project —</option>';
    index.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name;
        if (e.id === selectedProjectId) opt.selected = true;
        sel.appendChild(opt);
    });
    updateProjectActionButtons(
        !!selectedProjectId && !!index.find(e => e.id === selectedProjectId)
    );
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderMain(selectedProjectId, stored, callbacks) {
    const content = document.getElementById('mainContent');
    if (!content) return;

    if (!selectedProjectId) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="big">✅</div>
                ${stored.index.length === 0
            ? 'No projects yet.<br>Hit <strong>+ Project</strong> to get started.'
            : 'Select a project above.'}
            </div>
        `;
        return;
    }

    const project = stored.blobs[selectedProjectId];
    if (!project) {
        content.innerHTML = '';
        return;
    }

    const session = project.session || {};
    const items = project.items || [];

    // Apply filters.
    const activeItemTags = session.activeItemTags || [];
    const activeStepTags = session.activeStepTags || [];
    const visibleItems = _filterItems(items, activeItemTags, activeStepTags);

    content.innerHTML = '';

    // Filter bar.
    content.appendChild(_renderFilterBar(project, session, callbacks));

    // Resource tally.
    const tallyEl = _renderResourceTally(project, session);
    if (tallyEl) content.appendChild(tallyEl);

    // Active filter pills.
    if (activeItemTags.length > 0 || activeStepTags.length > 0) {
        content.appendChild(_renderActivePills(project, session, callbacks));
    }

    // Empty state — no items defined yet.
    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `
            <div class="big">📋</div>
            No items yet.<br>
            Hit <strong>+ Item</strong> to add your first checklist item.
        `;
        content.appendChild(empty);
        return;
    }

    const pinnedOnly = session.pinnedOnly || false;
    const sortedItems = _sortItems(items, project.sortMode || 'manual');
    const pinnedItems = sortedItems.filter(i => i.pinned);

    // ── Pinned section ──
    if (pinnedItems.length > 0) {
        content.appendChild(
            _renderItemSection(
                pinnedItems, '📌 Pinned', true,
                activeItemTags, activeStepTags,
                project, session, callbacks
            )
        );
    }

    // ── All Items section (hidden in focus mode) ──
    if (!pinnedOnly) {
        content.appendChild(
            _renderItemSection(
                sortedItems, '── All Items ──', false,
                activeItemTags, activeStepTags,
                project, session, callbacks
            )
        );
    }
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function _renderFilterBar(project, session, callbacks) {
    const wrap = document.createElement('div');
    wrap.className = 'clm-filter-wrap';

    const itemTags = project.itemTags || [];
    const stepTags = project.stepTags || [];
    const sortMode = project.sortMode || 'manual';
    const editMode = session.editMode || false;
    const pinnedOnly = session.pinnedOnly || false;

    // ── Row 1: Filters ──
    const filtersRow = document.createElement('div');
    filtersRow.className = 'clm-filter-bar';

    const filtersLabel = document.createElement('span');
    filtersLabel.className = 'clm-bar-label';
    filtersLabel.textContent = 'Filters:';

    const itemTagSel = document.createElement('select');
    itemTagSel.className = 'clm-filter-select';
    itemTagSel.setAttribute('aria-label', 'Filter by item tag');
    itemTagSel.innerHTML = `<option value="">Item ▾</option>` +
        itemTags.map(t =>
            `<option value="${escHtml(t.id)}">${escHtml(t.emoji)} ${escHtml(t.name)}</option>`
        ).join('');
    itemTagSel.addEventListener('change', () => {
        if (itemTagSel.value) callbacks.onAddItemTagFilter(itemTagSel.value);
        itemTagSel.value = '';
    });

    const stepTagSel = document.createElement('select');
    stepTagSel.className = 'clm-filter-select';
    stepTagSel.setAttribute('aria-label', 'Filter by step tag');
    stepTagSel.innerHTML = `<option value="">Step ▾</option>` +
        stepTags.map(t =>
            `<option value="${escHtml(t.id)}">${escHtml(t.emoji)} ${escHtml(t.name)}</option>`
        ).join('');
    stepTagSel.addEventListener('change', () => {
        if (stepTagSel.value) callbacks.onAddStepTagFilter(stepTagSel.value);
        stepTagSel.value = '';
    });

    filtersRow.appendChild(filtersLabel);
    filtersRow.appendChild(itemTagSel);
    filtersRow.appendChild(stepTagSel);

    // ── Row 2: View ──
    const viewRow = document.createElement('div');
    viewRow.className = 'clm-view-bar';

    const viewLabel = document.createElement('span');
    viewLabel.className = 'clm-bar-label';
    viewLabel.textContent = 'View:';

    const pinnedBtn = document.createElement('button');
    pinnedBtn.className = 'btn btn-ghost clm-pinned-btn' + (pinnedOnly ? ' active' : '');
    pinnedBtn.textContent = '📌';
    pinnedBtn.title = pinnedOnly ? 'Show all items' : 'Pinned only';
    pinnedBtn.addEventListener('click', () => callbacks.onTogglePinnedOnly());

    const sortBtn = document.createElement('button');
    sortBtn.className = 'btn btn-ghost clm-sort-btn' + (sortMode !== 'manual' ? ' active' : '');
    sortBtn.textContent = sortMode === 'name-asc' ? 'A↑' : sortMode === 'name-desc' ? 'A↓' : '≡';
    sortBtn.title = sortMode === 'name-asc' ? 'Sorted A→Z' :
        sortMode === 'name-desc' ? 'Sorted Z→A' : 'Manual order';
    sortBtn.addEventListener('click', () => callbacks.onCycleSortMode());

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-ghost clm-reset-btn';
    resetBtn.textContent = '↺ Reset';
    resetBtn.title = 'Reset all steps';
    resetBtn.addEventListener('click', () => callbacks.onResetAll());

    viewRow.appendChild(viewLabel);
    viewRow.appendChild(pinnedBtn);

    if (sortMode === 'manual') {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-ghost clm-edit-mode-btn' + (editMode ? ' active' : '');
        editBtn.textContent = '✏️';
        editBtn.title = editMode ? 'Exit reorder mode' : 'Reorder items';
        editBtn.addEventListener('click', () => callbacks.onToggleEditMode());
        viewRow.appendChild(editBtn);
    }

    viewRow.appendChild(sortBtn);
    viewRow.appendChild(resetBtn);

    wrap.appendChild(filtersRow);
    wrap.appendChild(viewRow);
    return wrap;
}

// ── Item section (Pinned / All Items) ────────────────────────────────────────

function _renderItemSection(
    sectionItems, label, isPinned,
    activeItemTags, activeStepTags,
    project, session, callbacks
) {
    const wrap = document.createElement('div');
    wrap.className = 'clm-section' + (isPinned ? ' clm-section-pinned' : '');

    // Section header with label and reset button.
    const header = document.createElement('div');
    header.className = 'clm-section-header';
    header.innerHTML = `
        <span class="clm-section-label">${escHtml(label)}</span>
        <button class="btn btn-ghost clm-section-reset"
                aria-label="${isPinned ? 'Reset pinned items' : 'Reset all items'}">↺</button>
    `;
    header.querySelector('.clm-section-reset').addEventListener('click', () => {
        isPinned
            ? callbacks.onResetPinned()
            : callbacks.onResetAll();
    });
    wrap.appendChild(header);

    const listEl = document.createElement('div');
    listEl.className = 'clm-item-list';

    let rendered = 0;
    sectionItems.forEach(item => {
        const visibleSteps = _visibleStepsForItem(item, activeStepTags);
        if (activeStepTags.length > 0 && visibleSteps.length === 0) return;
        if (activeItemTags.length > 0 &&
            !(item.tags || []).some(t => activeItemTags.includes(t))) return;

        listEl.appendChild(
            _renderItemPanel(item, visibleSteps, project, session, callbacks)
        );
        rendered++;
    });

    // If all items were filtered out, show a hint.
    if (rendered === 0) {
        const hint = document.createElement('div');
        hint.className = 'clm-section-empty';
        hint.textContent = 'No items match the active filters.';
        listEl.appendChild(hint);
    }

    wrap.appendChild(listEl);
    return wrap;
}

// ── Active filter pills ───────────────────────────────────────────────────────

function _renderActivePills(project, session, callbacks) {
    const row = document.createElement('div');
    row.className = 'clm-active-pills';

    const mode = session.pillDisplayMode || 'emoji';
    const activeItemTags = session.activeItemTags || [];
    const activeStepTags = session.activeStepTags || [];

    const makePill = (tag, onRemove) => {
        const pill = document.createElement('span');
        pill.className = 'clm-pill';
        pill.innerHTML = mode === 'emoji'
            ? `${escHtml(tag.emoji)} <button class="clm-pill-remove" aria-label="Remove filter">×</button>`
            : `${escHtml(tag.name)} <button class="clm-pill-remove" aria-label="Remove filter">×</button>`;
        pill.querySelector('.clm-pill-remove').addEventListener('click', e => {
            e.stopPropagation();
            onRemove(tag.id);
        });
        return pill;
    };

    (project.itemTags || [])
        .filter(t => activeItemTags.includes(t.id))
        .forEach(t => row.appendChild(makePill(t, id => callbacks.onRemoveItemTagFilter(id))));

    (project.stepTags || [])
        .filter(t => activeStepTags.includes(t.id))
        .forEach(t => row.appendChild(makePill(t, id => callbacks.onRemoveStepTagFilter(id))));

    // Toggle pill display mode.
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-ghost clm-pill-mode-btn';
    toggleBtn.textContent = mode === 'emoji' ? 'Aa' : '😀';
    toggleBtn.title = mode === 'emoji' ? 'Show tag names' : 'Show tag emoji';
    toggleBtn.addEventListener('click', () => callbacks.onTogglePillMode());
    row.appendChild(toggleBtn);

    return row;
}

// ── Resource tally ────────────────────────────────────────────────────────────

function _renderResourceTally(project, session) {
    const resources = project.resources || [];
    if (resources.length === 0) return null;

    // Tally counts pinned items only — reflects current service commitment.
    const pinnedItems = (project.items || []).filter(i => i.pinned);
    if (pinnedItems.length === 0) return null;

    const stepState = session.stepState || {};

    const tally = document.createElement('div');
    tally.className = 'clm-tally';

    const tallyLabel = document.createElement('div');
    tallyLabel.className = 'clm-tally-heading';
    tallyLabel.textContent = 'Inventory (pinned)';
    tally.appendChild(tallyLabel);

    resources.forEach(res => {
        // Sum: for each pinned item, for each step, resourceCost × current executions.
        const used = pinnedItems.reduce((itemSum, item) => {
            return itemSum + (item.steps || []).reduce((stepSum, step) => {
                const cost = (step.resourceCosts || {})[res.id] || 0;
                const current = (stepState[step.id] || {current: 0}).current;
                return stepSum + cost * current;
            }, 0);
        }, 0);

        const over = used > res.capacity;

        const row = document.createElement('div');
        row.className = 'clm-tally-row' + (over ? ' clm-tally-over' : '');
        row.innerHTML = `
            <span class="clm-tally-label">${escHtml(res.emoji)} ${escHtml(res.name)}</span>
            <span class="clm-tally-count">${used}/${res.capacity}</span>
            <div class="clm-tally-bar-wrap">
                <div class="clm-tally-bar-fill"
                     style="width:${Math.min(100, res.capacity > 0
            ? (used / res.capacity) * 100 : 0)}%;
                            background:${over ? 'var(--accent2)' : 'var(--accent)'}">
                </div>
            </div>
        `;
        tally.appendChild(row);
    });

    return tally;
}

// ── Item panel ────────────────────────────────────────────────────────────────

function _renderItemPanel(item, visibleSteps, project, session, callbacks) {
    const stepState = session.stepState || {};
    const editMode = session.editMode || false;
    const expandedItems = session.expandedItems || new Set();
    const isExpanded = expandedItems.has(item.id);
    const isComplete = _isItemComplete(item, visibleSteps, stepState);

    const panel = document.createElement('div');
    panel.className = 'clm-item-panel' + (isComplete ? ' clm-item-complete' : '');
    panel.dataset.itemId = item.id;

    // Item tag chips (emoji only in header).
    const tagChips = (item.tags || [])
        .map(tid => {
            const tag = (project.itemTags || []).find(t => t.id === tid);
            return tag
                ? `<span class="clm-item-tag-chip" title="${escHtml(tag.name)}">${escHtml(tag.emoji)}</span>`
                : '';
        }).join('');

    panel.innerHTML = `
        <div class="clm-item-header">
            <button class="clm-item-expand-btn" data-action="toggle-expand"
                    aria-label="${isExpanded ? 'Collapse' : 'Expand'} item"
                    aria-expanded="${isExpanded}">${isExpanded ? '▼' : '▶'}</button>
            ${editMode ? `
                <div class="clm-item-order-btns">
                    <button class="clm-item-order-btn" data-action="item-move-up"
                            aria-label="Move item up">▲</button>
                    <button class="clm-item-order-btn" data-action="item-move-down"
                            aria-label="Move item down">▼</button>
                </div>` : ''}
            <span class="clm-item-complete-indicator">${isComplete ? '✔' : ''}</span>
            <span class="clm-item-name clm-item-name-link"
                  role="button" tabindex="0"
                  aria-label="Open briefing for ${escHtml(item.name)}"
                  data-action="open-briefing">${escHtml(item.name)}</span>
            <div class="clm-item-header-right">
                ${tagChips}
                ${item.pinned ? '<span class="clm-pin-indicator">📌</span>' : ''}
                <button class="clm-item-edit-btn" data-action="edit-item"
                        aria-label="Edit item">✎</button>
                <button class="clm-item-reset-btn" data-action="reset-item"
                        aria-label="Reset item">↺</button>
            </div>
        </div>
        <div class="clm-step-list${isExpanded ? '' : ' clm-step-list-collapsed'}"></div>
    `;

    // Wire item header buttons.
    panel.querySelector('[data-action="toggle-expand"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onToggleExpanded(item.id);
    });

    panel.querySelector('[data-action="edit-item"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onEditItem(item.id);
    });

    panel.querySelector('[data-action="reset-item"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onResetItem(item.id);
    });

    if (editMode) {
        panel.querySelector('[data-action="item-move-up"]').addEventListener('click', e => {
            e.stopPropagation();
            callbacks.onMoveItem(item.id, -1);
        });
        panel.querySelector('[data-action="item-move-down"]').addEventListener('click', e => {
            e.stopPropagation();
            callbacks.onMoveItem(item.id, 1);
        });
    }

    // Long-press to pin.
    callbacks.onAttachLongPress(panel, () => callbacks.onTogglePinned(item.id));

    // Tap item name to open briefing.
    panel.querySelector('[data-action="open-briefing"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onOpenBriefing(item.id);
    });

    // Render steps.
    const stepList = panel.querySelector('.clm-step-list');
    visibleSteps.forEach(step => {
        stepList.appendChild(_renderStepRow(step, item, stepState, project, callbacks));
    });

    return panel;
}

// ── Step row ──────────────────────────────────────────────────────────────────

function _renderStepRow(step, item, stepState, project, callbacks) {
    const state = stepState[step.id] || {current: 0};
    const current = state.current;
    const isDone = current >= 1;

    // Resource cost badges for this step.
    const resources = project.resources || [];
    const stepCosts = step.resourceCosts || {};
    const resourceBadges = resources
        .filter(res => (stepCosts[res.id] || 0) > 0)
        .map(res =>
            `<span class="clm-step-resource-badge">
                ${escHtml(res.emoji)} ×${stepCosts[res.id]}
            </span>`
        ).join('');

    // Step tag chips.
    const tagChips = (step.tags || [])
        .map(tid => {
            const tag = (project.stepTags || []).find(t => t.id === tid);
            return tag
                ? `<span class="clm-step-tag-chip">${escHtml(tag.emoji)} ${escHtml(tag.name)}</span>`
                : '';
        }).join('');

    const row = document.createElement('div');
    row.className = 'clm-step-row' + (isDone ? ' clm-step-done' : '');
    row.dataset.stepId = step.id;

    row.innerHTML = `
        <div class="clm-step-left">
            <button class="clm-step-add-btn${isDone ? ' clm-step-add-btn-done' : ''}"
                    data-action="step-add"
                    aria-label="Execute step${current > 0 ? ' again' : ''}"
                    aria-pressed="${isDone}">
                ${isDone ? '✔' : '+'}
            </button>
            ${current > 1
        ? `<span class="clm-step-batch-count"
                         aria-live="polite" aria-atomic="true">×${current}</span>`
        : ''}
        </div>
        <div class="clm-step-body">
            <div class="clm-step-title-row">
                <span class="clm-step-title">${escHtml(step.title)}</span>
                <div class="clm-step-right">
                    ${resourceBadges}
                    <div class="clm-step-tags">${tagChips}</div>
                </div>
            </div>
            ${step.description ? `
                <div class="clm-step-desc-toggle" data-action="toggle-desc"
                     aria-expanded="false">▶ details</div>
                <div class="clm-step-desc" style="display:none">${escHtml(step.description)}</div>
            ` : ''}
        </div>
    `;

    // + button — first tap marks done, subsequent taps add batches.
    row.querySelector('[data-action="step-add"]').addEventListener('click', () => {
        callbacks.onStepCount(step.id, item.id, 1);
    });

    // Description toggle.
    const descToggle = row.querySelector('[data-action="toggle-desc"]');
    if (descToggle) {
        descToggle.addEventListener('click', () => {
            const desc = row.querySelector('.clm-step-desc');
            if (!desc) return;
            const open = desc.style.display !== 'none';
            desc.style.display = open ? 'none' : '';
            descToggle.textContent = open ? '▶ details' : '▼ details';
            descToggle.setAttribute('aria-expanded', String(!open));
        });
    }

    return row;
}

// ── Briefing modal ────────────────────────────────────────────────────────────

export function renderBriefingModal(item, project, session) {
    const modal = document.getElementById('briefingModal');
    const titleEl = document.getElementById('briefingTitle');
    const bodyEl = document.getElementById('briefingBody');
    if (!modal || !titleEl || !bodyEl) return;

    titleEl.textContent = item.name;

    const showAll = session.briefingShowAll || false;
    const activeStepTags = session.activeStepTags || [];
    const hasFilter = activeStepTags.length > 0;

    // Update toggle button state.
    const allBtn = document.getElementById('briefingToggleAll');
    const filteredBtn = document.getElementById('briefingToggleFiltered');
    if (allBtn) allBtn.classList.toggle('active', showAll);
    if (filteredBtn) filteredBtn.classList.toggle('active', !showAll);

    // Dim toggle when no filter active — both views identical.
    const toggleWrap = document.getElementById('briefingToggleWrap');
    if (toggleWrap) toggleWrap.style.opacity = hasFilter ? '1' : '0.35';

    const steps = item.steps || [];
    const visibleSteps = (!showAll && hasFilter)
        ? steps.filter(s => (s.tags || []).some(tid => activeStepTags.includes(tid)))
        : steps;

    bodyEl.innerHTML = '';

    if (visibleSteps.length === 0) {
        bodyEl.innerHTML = '<div class="briefing-empty">No steps to show.</div>';
        return;
    }

    visibleSteps.forEach(step => {
        const row = document.createElement('div');
        row.className = 'briefing-step';

        const stepTags = (step.tags || [])
            .map(tid => {
                const tag = (project.stepTags || []).find(t => t.id === tid);
                return tag
                    ? `<span class="clm-step-tag-chip">${escHtml(tag.emoji)} ${escHtml(tag.name)}</span>`
                    : '';
            }).join('');

        row.innerHTML = `
            <div class="briefing-step-title">
                ${escHtml(step.title)}
                <div class="clm-step-tags">${stepTags}</div>
            </div>
            ${step.description
            ? `<div class="briefing-step-desc">${escHtml(step.description)}</div>`
            : ''}
        `;
        bodyEl.appendChild(row);
    });
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function _visibleStepsForItem(item, activeStepTags) {
    const steps = item.steps || [];
    if (activeStepTags.length === 0) return steps;
    return steps.filter(s =>
        (s.tags || []).some(tid => activeStepTags.includes(tid))
    );
}

function _filterItems(items, activeItemTags, activeStepTags) {
    return items.filter(item => {
        if (activeItemTags.length > 0 &&
            !(item.tags || []).some(t => activeItemTags.includes(t))) return false;
        if (activeStepTags.length > 0 &&
            _visibleStepsForItem(item, activeStepTags).length === 0) return false;
        return true;
    });
}

function _isItemComplete(item, visibleSteps, stepState) {
    if (visibleSteps.length === 0) return false;
    return visibleSteps.every(step => {
        const state = stepState[step.id] || {current: 0};
        return state.current >= 1;
    });
}

// ── Sort helper ───────────────────────────────────────────────────────────────

function _sortItems(items, sortMode) {
    const copy = [...items];
    if (sortMode === 'name-asc') return copy.sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === 'name-desc') return copy.sort((a, b) => b.name.localeCompare(a.name));
    // Manual — sort by sortOrder field.
    return copy.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}