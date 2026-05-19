// ChecklistManager/js/render.js
// All HTML builders and targeted DOM update functions.
// Receives data as parameters — no loadData() calls inside this module.
//
// Layer 1: selector visibility, empty state.
// Layer 2: filter bar, resource tally, item panels, step rows, completion.
// Layer 3: pinned section, briefing modal.

import {escHtml} from '../../common/utils.js';

// ── Selector bar helpers ──────────────────────────────────────────────────────

export function updateProjectActionButtons(hasProject) {
    const editBtn = document.getElementById('editProjectBtn');
    const addItemBtn = document.getElementById('addItemBtn');
    if (editBtn) editBtn.style.display = hasProject ? '' : 'none';
    if (addItemBtn) addItemBtn.style.display = hasProject ? '' : 'none';
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
    const tallyEl = _renderResourceTally(project);
    if (tallyEl) content.appendChild(tallyEl);

    // Active filter pills.
    if (activeItemTags.length > 0 || activeStepTags.length > 0) {
        content.appendChild(_renderActivePills(project, session, callbacks));
    }

    // Item list.
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

    const listEl = document.createElement('div');
    listEl.className = 'clm-item-list';

    const sortedItems = _sortItems(items, project.sortMode || 'manual');

    sortedItems.forEach(item => {
        const visibleSteps = _visibleStepsForItem(item, activeStepTags);
        // Hide items with no matching steps when a step filter is active.
        if (activeStepTags.length > 0 && visibleSteps.length === 0) return;
        // Hide items not matching item tag filter.
        if (activeItemTags.length > 0 &&
            !(item.tags || []).some(t => activeItemTags.includes(t))) return;

        listEl.appendChild(
            _renderItemPanel(item, visibleSteps, project, session, callbacks)
        );
    });

    content.appendChild(listEl);
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function _renderFilterBar(project, session, callbacks) {
    const bar = document.createElement('div');
    bar.className = 'clm-filter-bar';

    const itemTags = project.itemTags || [];
    const stepTags = project.stepTags || [];
    const activeItemTags = session.activeItemTags || [];
    const activeStepTags = session.activeStepTags || [];
    const sortMode = project.sortMode || 'manual';
    const editMode = session.editMode || false;

    // Item tag dropdown.
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

    // Step tag dropdown.
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

    // Sort cycle button.
    const sortBtn = document.createElement('button');
    sortBtn.className = 'btn btn-ghost clm-sort-btn' +
        (sortMode !== 'manual' ? ' active' : '');
    sortBtn.textContent = sortMode === 'name-asc' ? 'A↑' :
        sortMode === 'name-desc' ? 'A↓' : '≡';
    sortBtn.title = sortMode === 'name-asc' ? 'Sorted A→Z' :
        sortMode === 'name-desc' ? 'Sorted Z→A' : 'Manual order';
    sortBtn.addEventListener('click', () => callbacks.onCycleSortMode());

    // Edit mode toggle (manual sort only).
    let editBtn = null;
    if (sortMode === 'manual') {
        editBtn = document.createElement('button');
        editBtn.className = 'btn btn-ghost clm-edit-mode-btn' +
            (editMode ? ' active' : '');
        editBtn.textContent = '✏️';
        editBtn.title = editMode ? 'Exit reorder mode' : 'Reorder items';
        editBtn.addEventListener('click', () => callbacks.onToggleEditMode());
    }

    // Reset all button.
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-ghost clm-reset-btn';
    resetBtn.textContent = '↺';
    resetBtn.title = 'Reset all steps';
    resetBtn.addEventListener('click', () => callbacks.onResetAll());

    bar.appendChild(itemTagSel);
    bar.appendChild(stepTagSel);
    if (editBtn) bar.appendChild(editBtn);
    bar.appendChild(sortBtn);
    bar.appendChild(resetBtn);

    return bar;
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

function _renderResourceTally(project) {
    const resources = project.resources || [];
    if (resources.length === 0) return null;

    const items = project.items || [];

    const tally = document.createElement('div');
    tally.className = 'clm-tally';

    resources.forEach(res => {
        const used = items.reduce((sum, item) => {
            return sum + ((item.resourceCosts || {})[res.id] || 0);
        }, 0);
        const over = used > res.capacity;

        const row = document.createElement('div');
        row.className = 'clm-tally-row' + (over ? ' clm-tally-over' : '');
        row.innerHTML = `
            <span class="clm-tally-label">${escHtml(res.emoji)} ${escHtml(res.name)}</span>
            <span class="clm-tally-count">${used}/${res.capacity}</span>
            <div class="clm-tally-bar-wrap">
                <div class="clm-tally-bar-fill"
                     style="width:${Math.min(100, res.capacity > 0 ? (used / res.capacity) * 100 : 0)}%;
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
            ${editMode ? `
                <div class="clm-item-order-btns">
                    <button class="clm-item-order-btn" data-action="item-move-up"
                            aria-label="Move item up">▲</button>
                    <button class="clm-item-order-btn" data-action="item-move-down"
                            aria-label="Move item down">▼</button>
                </div>` : ''}
            <span class="clm-item-complete-indicator">${isComplete ? '✔' : ''}</span>
            <span class="clm-item-name">${escHtml(item.name)}</span>
            <div class="clm-item-header-right">
                ${tagChips}
                ${item.pinned ? '<span class="clm-pin-indicator">📌</span>' : ''}
                <button class="clm-item-edit-btn" data-action="edit-item"
                        aria-label="Edit item">✎</button>
                <button class="clm-item-reset-btn" data-action="reset-item"
                        aria-label="Reset item">↺</button>
            </div>
        </div>
        <div class="clm-step-list"></div>
    `;

    // Wire item header buttons.
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
    const target = step.counterTarget || 1;
    const isBinary = target === 1;
    const isDone = isBinary ? state.current >= 1 : state.current >= target;

    const row = document.createElement('div');
    row.className = 'clm-step-row' + (isDone ? ' clm-step-done' : '');
    row.dataset.stepId = step.id;

    // Step tag chips.
    const tagChips = (step.tags || [])
        .map(tid => {
            const tag = (project.stepTags || []).find(t => t.id === tid);
            return tag
                ? `<span class="clm-step-tag-chip">${escHtml(tag.emoji)} ${escHtml(tag.name)}</span>`
                : '';
        }).join('');

    if (isBinary) {
        row.innerHTML = `
            <button class="clm-step-check${isDone ? ' clm-step-check-done' : ''}"
                    data-action="toggle-step" aria-label="Toggle step"
                    aria-pressed="${isDone}">
                ${isDone ? '✔' : ''}
            </button>
            <div class="clm-step-body">
                <div class="clm-step-title-row">
                    <span class="clm-step-title">${escHtml(step.title)}</span>
                    <div class="clm-step-tags">${tagChips}</div>
                </div>
                ${step.description ? `
                    <div class="clm-step-desc-toggle" data-action="toggle-desc"
                         aria-expanded="false">▶ details</div>
                    <div class="clm-step-desc" style="display:none">${escHtml(step.description)}</div>
                ` : ''}
            </div>
        `;

        row.querySelector('[data-action="toggle-step"]').addEventListener('click', () => {
            callbacks.onToggleStep(step.id, item.id);
        });
    } else {
        row.innerHTML = `
            <div class="clm-step-counter">
                <button class="clm-step-counter-btn" data-action="step-dec"
                        aria-label="Decrease">−</button>
                <span class="clm-step-counter-val" aria-live="polite"
                      aria-atomic="true">${state.current}/${target}</span>
                <button class="clm-step-counter-btn clm-step-counter-btn-inc"
                        data-action="step-inc" aria-label="Increase">+</button>
            </div>
            <div class="clm-step-body">
                <div class="clm-step-title-row">
                    <span class="clm-step-title">${escHtml(step.title)}</span>
                    <div class="clm-step-tags">${tagChips}</div>
                </div>
                ${step.description ? `
                    <div class="clm-step-desc-toggle" data-action="toggle-desc"
                         aria-expanded="false">▶ details</div>
                    <div class="clm-step-desc" style="display:none">${escHtml(step.description)}</div>
                ` : ''}
            </div>
        `;

        row.querySelector('[data-action="step-dec"]').addEventListener('click', () => {
            callbacks.onStepCount(step.id, item.id, -1);
        });
        row.querySelector('[data-action="step-inc"]').addEventListener('click', () => {
            callbacks.onStepCount(step.id, item.id, 1);
        });
    }

    // Description toggle (binary and counted).
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
        const target = step.counterTarget || 1;
        return state.current >= target;
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