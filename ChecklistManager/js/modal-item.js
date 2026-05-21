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
    const resources = project ? (project.resources || []) : [];

    _steps.forEach((step, idx) => {
        container.appendChild(_buildStepCard(step, idx, stepTags, resources));
    });
}

function _buildStepCard(step, idx, stepTags, resources) {
    const card = document.createElement('div');
    card.className = 'im-step-card';
    card.dataset.idx = idx;

    const selectedStepTagIds = new Set(step.tags || []);
    const stepCosts = step.resourceCosts || {};

    // Tag checkboxes.
    const tagChecks = stepTags.length > 0
        ? stepTags.map(t => `
            <label class="im-tag-check im-tag-check-sm">
                <input type="checkbox" value="${escHtml(t.id)}"
                       data-step-idx="${idx}" data-field="steptag"
                       ${selectedStepTagIds.has(t.id) ? 'checked' : ''}>
                <span class="im-tag-chip im-tag-chip-sm">${escHtml(t.emoji)} ${escHtml(t.name)}</span>
            </label>`).join('')
        : '<span class="im-empty-hint">No step tags defined.</span>';

    // Resource cost inputs.
    const resourceInputs = resources.length > 0
        ? resources.map(res => `
            <div class="im-step-resource-row">
                <label class="im-step-resource-label"
                       for="imStepRes_${idx}_${escHtml(res.id)}">
                    ${escHtml(res.emoji)} ${escHtml(res.name)}
                </label>
                <input type="number"
                       id="imStepRes_${idx}_${escHtml(res.id)}"
                       class="im-step-resource-input"
                       value="${stepCosts[res.id] ?? 0}"
                       min="0"
                       data-step-idx="${idx}"
                       data-field="rescost"
                       data-res-id="${escHtml(res.id)}"
                       aria-label="${escHtml(res.name)} cost">
                <span class="im-resource-cap">/ ${res.capacity}</span>
            </div>`).join('')
        : '';

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
                  placeholder="Description / ingredients / notes (optional)"
                  aria-label="Step description"
                  data-step-idx="${idx}" data-field="description"
                  rows="3">${escHtml(step.description || '')}</textarea>
        <div class="im-step-meta">
            <div class="im-step-tags-section">
                <div class="im-step-section-label">Tags</div>
                <div class="im-step-tags">${tagChecks}</div>
            </div>
            ${resources.length > 0 ? `
            <div class="im-step-resources-section">
                <div class="im-step-section-label">Resource costs</div>
                ${resourceInputs}
            </div>` : ''}
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

    card.querySelectorAll('[data-field="steptag"]').forEach(cb => {
        cb.addEventListener('change', () => {
            _steps[idx].tags = _getCheckedIdsFromGroup(
                card.querySelectorAll('[data-field="steptag"]')
            );
        });
    });

    card.querySelectorAll('[data-field="rescost"]').forEach(input => {
        input.addEventListener('input', () => {
            const resId = input.dataset.resId;
            const val = Math.max(0, parseInt(input.value) || 0);
            if (!_steps[idx].resourceCosts) _steps[idx].resourceCosts = {};
            _steps[idx].resourceCosts[resId] = val;
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
        resourceCosts: {},
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
        resourceCosts: s.resourceCosts
            ? Object.fromEntries(
                Object.entries(s.resourceCosts)
                    .map(([k, v]) => [k, Math.max(0, parseInt(v) || 0)])
            )
            : {},
    };
}
