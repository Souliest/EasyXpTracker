// ChecklistManager/js/modal-item.js
// Create/edit checklist item modal.
// Handles: item name, item tags, resource costs, steps (title, description,
// step tags, counter target). Step reordering via ▲▼ arrows.

import {saveData, STORAGE_KEY} from './storage.js';
import {cacheSet, TOOL_CONFIG, localLoad} from '../../common/migrations.js';
import {openModal as trapOpen, closeModal as trapClose} from '../../common/utils.js';
import {escHtml} from '../../common/utils.js';

const CFG = TOOL_CONFIG.checklistManager;

// ── Local storage read ────────────────────────────────────────────────────────

const _localLoad = () => localLoad(STORAGE_KEY);

// ── Inline error helpers ──────────────────────────────────────────────────────

function _showError(msg) {
    const el = document.getElementById('imError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}

function _clearError() {
    const el = document.getElementById('imError');
    if (el) {
        el.textContent = '';
        el.style.display = 'none';
    }
}

// ── Module state ──────────────────────────────────────────────────────────────

let _editingItemId = null;
let _editingProjectId = null;

// Working copy of steps — array of step objects.
// Built fresh on open; written to the item on save.
let _steps = [];

// ── Open ──────────────────────────────────────────────────────────────────────

export function openAddItemModal(projectId) {
    if (!projectId) return;
    const stored = _localLoad();
    const project = stored.blobs[projectId];
    if (!project) return;

    _editingItemId = null;
    _editingProjectId = projectId;
    _steps = [];

    _clearError();
    _renderModal(project, null);

    const overlay = document.getElementById('itemModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function openEditItemModal(itemId, projectId) {
    if (!itemId || !projectId) return;
    const stored = _localLoad();
    const project = stored.blobs[projectId];
    if (!project) return;
    const item = (project.items || []).find(i => i.id === itemId);
    if (!item) return;

    _editingItemId = itemId;
    _editingProjectId = projectId;
    // Deep-copy steps so edits don't mutate the blob until Save.
    _steps = (item.steps || []).map(s => ({...s, tags: [...(s.tags || [])]}));

    _clearError();
    _renderModal(project, item);

    const overlay = document.getElementById('itemModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

// ── Close ─────────────────────────────────────────────────────────────────────

export function closeItemModal() {
    _editingItemId = null;
    _editingProjectId = null;
    _steps = [];
    const overlay = document.getElementById('itemModal');
    overlay.classList.remove('open');
    trapClose(overlay);
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveItemModal(onSaved) {
    const name = (document.getElementById('imName').value || '').trim();
    if (!name) {
        _showError('Please enter an item name.');
        return;
    }

    const stored = _localLoad();
    const project = stored.blobs[_editingProjectId];
    if (!project) {
        _showError('Project not found — please close and try again.');
        return;
    }

    // Collect item tags.
    const selectedItemTags = _getCheckedIds('imItemTagsGroup');

    // Collect resource costs.
    const resourceCosts = {};
    for (const res of (project.resources || [])) {
        const input = document.getElementById(`imRes_${res.id}`);
        if (!input) continue;
        const val = input.type === 'checkbox'
            ? (input.checked ? 1 : 0)
            : Math.max(0, parseInt(input.value) || 0);
        resourceCosts[res.id] = val;
    }

    // Clean steps from working copy.
    const cleanedSteps = _steps.map(s => _cleanStep(s));

    if (_editingItemId) {
        // Edit existing item.
        const item = (project.items || []).find(i => i.id === _editingItemId);
        if (!item) {
            _showError('Item not found — please close and try again.');
            return;
        }
        item.name = name;
        item.tags = selectedItemTags;
        item.resourceCosts = resourceCosts;

        // Reconcile step state: remove stepState entries for deleted steps,
        // keep existing state for steps that remain (matched by id).
        const keepStepIds = new Set(cleanedSteps.map(s => s.id));
        const stepState = project.session.stepState || {};
        for (const sid of Object.keys(stepState)) {
            if (!keepStepIds.has(sid)) delete stepState[sid];
        }
        item.steps = cleanedSteps;
    } else {
        // New item — assign sortOrder as last in list.
        const items = project.items || [];
        const newItem = {
            id: crypto.randomUUID(),
            name,
            pinned: false,
            tags: selectedItemTags,
            resourceCosts,
            steps: cleanedSteps,
            sortOrder: items.length,
        };
        items.push(newItem);
        project.items = items;
    }

    cacheSet(stored, project, CFG);
    await saveData(stored, _editingProjectId);
    closeItemModal();
    onSaved();
}

// ── Modal render ──────────────────────────────────────────────────────────────
// Builds the entire modal body from scratch each open.

function _renderModal(project, item) {
    const title = document.getElementById('imTitle');
    if (title) title.textContent = item ? 'Edit Item' : 'New Item';

    const nameInput = document.getElementById('imName');
    if (nameInput) nameInput.value = item ? item.name : '';

    _renderItemTags(project, item);
    _renderResourceCosts(project, item);
    _renderStepList();
}

function _renderItemTags(project, item) {
    const group = document.getElementById('imItemTagsGroup');
    if (!group) return;
    group.innerHTML = '';

    const selectedIds = new Set(item ? (item.tags || []) : []);
    const tags = project.itemTags || [];

    if (tags.length === 0) {
        group.innerHTML = '<div class="im-empty-hint">No item tags defined for this project.</div>';
        return;
    }

    tags.forEach(tag => {
        const label = document.createElement('label');
        label.className = 'im-tag-check';
        label.innerHTML = `
            <input type="checkbox" value="${escHtml(tag.id)}"
                   ${selectedIds.has(tag.id) ? 'checked' : ''}>
            <span class="im-tag-chip">${escHtml(tag.emoji)} ${escHtml(tag.name)}</span>
        `;
        group.appendChild(label);
    });
}

function _renderResourceCosts(project, item) {
    const group = document.getElementById('imResourceCostsGroup');
    if (!group) return;
    group.innerHTML = '';

    const resources = project.resources || [];
    if (resources.length === 0) {
        group.innerHTML = '<div class="im-empty-hint">No resources defined for this project.</div>';
        return;
    }

    const existingCosts = item ? (item.resourceCosts || {}) : {};

    resources.forEach(res => {
        const isBinary = res.capacity === 1;
        const savedVal = existingCosts[res.id] ?? 0;
        const row = document.createElement('div');
        row.className = 'im-resource-row';

        if (isBinary) {
            row.innerHTML = `
                <label class="im-resource-label" for="imRes_${escHtml(res.id)}">
                    ${escHtml(res.emoji)} ${escHtml(res.name)}
                </label>
                <input type="checkbox" id="imRes_${escHtml(res.id)}"
                       ${savedVal ? 'checked' : ''}>
            `;
        } else {
            row.innerHTML = `
                <label class="im-resource-label" for="imRes_${escHtml(res.id)}">
                    ${escHtml(res.emoji)} ${escHtml(res.name)}
                </label>
                <input type="number" id="imRes_${escHtml(res.id)}"
                       value="${savedVal}" min="0" max="${res.capacity}"
                       class="im-resource-input">
                <span class="im-resource-cap">/ ${res.capacity}</span>
            `;
        }
        group.appendChild(row);
    });
}

// ── Step list ─────────────────────────────────────────────────────────────────

function _renderStepList() {
    const container = document.getElementById('imStepList');
    if (!container) return;
    container.innerHTML = '';

    if (_steps.length === 0) {
        container.innerHTML = '<div class="im-empty-hint">No steps yet.</div>';
        return;
    }

    const stored = _localLoad();
    const project = stored.blobs[_editingProjectId];
    const stepTags = project ? (project.stepTags || []) : [];

    _steps.forEach((step, idx) => {
        container.appendChild(_buildStepCard(step, idx, stepTags));
    });
}

function _buildStepCard(step, idx, stepTags) {
    const card = document.createElement('div');
    card.className = 'im-step-card';
    card.dataset.idx = idx;

    const selectedStepTagIds = new Set(step.tags || []);
    const counterTarget = step.counterTarget || 1;

    const tagChecks = stepTags.length > 0
        ? stepTags.map(t => `
            <label class="im-tag-check im-tag-check-sm">
                <input type="checkbox" value="${escHtml(t.id)}"
                       data-step-idx="${idx}" data-field="steptag"
                       ${selectedStepTagIds.has(t.id) ? 'checked' : ''}>
                <span class="im-tag-chip im-tag-chip-sm">${escHtml(t.emoji)} ${escHtml(t.name)}</span>
            </label>`).join('')
        : '<span class="im-empty-hint">No step tags defined.</span>';

    card.innerHTML = `
        <div class="im-step-header">
            <div class="im-step-order-btns">
                <button class="im-step-order-btn" data-action="move-up"
                        data-idx="${idx}" aria-label="Move step up"
                        ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button class="im-step-order-btn" data-action="move-down"
                        data-idx="${idx}" aria-label="Move step down"
                        ${idx === _steps.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
            <input type="text" class="im-step-title"
                   value="${escHtml(step.title || '')}"
                   placeholder="Step title" aria-label="Step title"
                   data-step-idx="${idx}" data-field="title">
            <button class="im-step-remove" data-action="remove-step"
                    data-idx="${idx}" aria-label="Remove step">✕</button>
        </div>
        <textarea class="im-step-desc"
                  placeholder="Description (optional)"
                  aria-label="Step description"
                  data-step-idx="${idx}" data-field="description"
                  rows="2">${escHtml(step.description || '')}</textarea>
        <div class="im-step-meta">
            <div class="im-step-tags">${tagChecks}</div>
            <div class="im-step-counter-row">
                <label class="im-step-counter-label"
                       for="imStepCounter_${idx}">Count target</label>
                <input type="number" id="imStepCounter_${idx}"
                       class="im-step-counter-input"
                       value="${counterTarget}" min="1"
                       data-step-idx="${idx}" data-field="counterTarget"
                       aria-label="Counter target">
                <span class="im-step-counter-hint" id="imStepCounterHint_${idx}">${
        counterTarget > 1 ? `×${counterTarget} needed` : 'binary (1 = tick)'
    }</span>
            </div>
        </div>
    `;

    card.querySelector('[data-action="remove-step"]').addEventListener('click', () => {
        _steps.splice(idx, 1);
        _renderStepList();
    });

    card.querySelector('[data-action="move-up"]').addEventListener('click', () => {
        if (idx === 0) return;
        [_steps[idx - 1], _steps[idx]] = [_steps[idx], _steps[idx - 1]];
        _renderStepList();
    });

    card.querySelector('[data-action="move-down"]').addEventListener('click', () => {
        if (idx === _steps.length - 1) return;
        [_steps[idx], _steps[idx + 1]] = [_steps[idx + 1], _steps[idx]];
        _renderStepList();
    });

    card.querySelector('[data-field="title"]').addEventListener('input', e => {
        _steps[idx].title = e.target.value;
    });

    card.querySelector('[data-field="description"]').addEventListener('input', e => {
        _steps[idx].description = e.target.value;
    });

    card.querySelector('[data-field="counterTarget"]').addEventListener('input', e => {
        const val = Math.max(1, parseInt(e.target.value) || 1);
        _steps[idx].counterTarget = val;
        const hint = document.getElementById(`imStepCounterHint_${idx}`);
        if (hint) hint.textContent = val > 1 ? `×${val} needed` : 'binary (1 = tick)';
    });

    card.querySelectorAll('[data-field="steptag"]').forEach(cb => {
        cb.addEventListener('change', () => {
            _steps[idx].tags = _getCheckedIdsFromGroup(
                card.querySelectorAll('[data-field="steptag"]')
            );
        });
    });

    return card;
}

export function addStepRow() {
    _steps.push({
        id: crypto.randomUUID(),
        title: '',
        description: '',
        tags: [],
        counterTarget: 1,
    });
    _renderStepList();
    const cards = document.querySelectorAll('.im-step-card');
    if (cards.length > 0) {
        const last = cards[cards.length - 1];
        const input = last.querySelector('.im-step-title');
        if (input) input.focus();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _getCheckedIds(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return [];
    return Array.from(group.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value);
}

function _getCheckedIdsFromGroup(nodeList) {
    return Array.from(nodeList)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
}

function _cleanStep(s) {
    return {
        id: s.id,
        title: (s.title || '').trim(),
        description: (s.description || '').trim(),
        tags: Array.isArray(s.tags) ? [...s.tags] : [],
        counterTarget: Math.max(1, parseInt(s.counterTarget) || 1),
    };
}
