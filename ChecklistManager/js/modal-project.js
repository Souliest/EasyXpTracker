// ChecklistManager/js/modal-project.js
// Create/edit project modal — manages project name, resources, item tags, step tags.
// Delete project lives in the danger zone at the bottom of the same modal.

import {saveData, deleteProject, STORAGE_KEY} from './storage.js';
import {cacheSet, cacheDelete, TOOL_CONFIG, localLoad} from '../../common/migrations.js';
import {openModal as trapOpen, closeModal as trapClose} from '../../common/utils.js';
import {escHtml} from '../../common/utils.js';

const CFG = TOOL_CONFIG.checklistManager;

// ── Local storage read ────────────────────────────────────────────────────────

const _localLoad = () => localLoad(STORAGE_KEY);

// ── Inline error helpers ──────────────────────────────────────────────────────

function _showError(msg) {
    const el = document.getElementById('pmError');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}

function _clearError() {
    const el = document.getElementById('pmError');
    if (el) {
        el.textContent = '';
        el.style.display = 'none';
    }
}

// ── Module state ──────────────────────────────────────────────────────────────

let _editingProjectId = null;

// In-modal working copies — arrays of { id, name, emoji, capacity? }
// Built fresh on open; written to the project blob on save.
let _resources = [];
let _itemTags = [];
let _stepTags = [];

// ── Open ──────────────────────────────────────────────────────────────────────

export function openAddProjectModal() {
    _editingProjectId = null;
    _resources = [];
    _itemTags = [];
    _stepTags = [];

    _clearError();
    document.getElementById('projectModalTitle').textContent = 'New Project';
    document.getElementById('pmName').value = '';
    document.getElementById('pmDanger').style.display = 'none';
    _hideDeleteConfirm();
    _renderLists();

    const overlay = document.getElementById('projectModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function openEditProjectModal(projectId) {
    if (!projectId) return;
    const stored = _localLoad();
    const project = stored.blobs[projectId];
    if (!project) return;

    _editingProjectId = projectId;

    // Deep-copy working lists so edits don't mutate the blob until Save.
    _resources = (project.resources || []).map(r => ({...r}));
    _itemTags = (project.itemTags || []).map(t => ({...t}));
    _stepTags = (project.stepTags || []).map(t => ({...t}));

    _clearError();
    document.getElementById('projectModalTitle').textContent = 'Project Settings';
    document.getElementById('pmName').value = project.name || '';
    document.getElementById('pmDanger').style.display = '';
    _hideDeleteConfirm();
    _renderLists();

    const overlay = document.getElementById('projectModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

// ── Close ─────────────────────────────────────────────────────────────────────

export function closeProjectModal() {
    _editingProjectId = null;
    _resources = [];
    _itemTags = [];
    _stepTags = [];
    _hideDeleteConfirm();
    const overlay = document.getElementById('projectModal');
    overlay.classList.remove('open');
    trapClose(overlay);
}

// ── Save ──────────────────────────────────────────────────────────────────────

export async function saveProjectModal(onSaved) {
    const name = document.getElementById('pmName').value.trim();
    if (!name) {
        _showError('Please enter a project name.');
        return;
    }

    const stored = _localLoad();
    let savedId;

    if (_editingProjectId) {
        const project = stored.blobs[_editingProjectId];
        if (!project) {
            _showError('Project not found — please close and try again.');
            return;
        }

        // Propagate resource/tag deletions into existing items.
        _reconcileDeletedResources(project);
        _reconcileDeletedTags(project);

        project.name = name;
        project.resources = _resources.map(_cleanResource);
        project.itemTags = _itemTags.map(_cleanTag);
        project.stepTags = _stepTags.map(_cleanTag);

        cacheSet(stored, project, CFG);
        savedId = _editingProjectId;
    } else {
        const project = _newProject(name);
        cacheSet(stored, project, CFG);
        savedId = project.id;
    }

    await saveData(stored, savedId);
    closeProjectModal();
    onSaved(savedId);
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function promptDeleteProject() {
    document.getElementById('pmDeleteBtn').style.opacity = '0.4';
    document.getElementById('pmDeleteConfirm').style.display = '';
}

export function cancelDeleteProject() {
    _hideDeleteConfirm();
}

export async function confirmDeleteProject(onDeleted) {
    if (!_editingProjectId) return;
    const id = _editingProjectId;
    closeProjectModal();
    await deleteProject(id);
    onDeleted(id);
}

function _hideDeleteConfirm() {
    const btn = document.getElementById('pmDeleteBtn');
    const confirm = document.getElementById('pmDeleteConfirm');
    if (btn) btn.style.opacity = '';
    if (confirm) confirm.style.display = 'none';
}

// ── List rendering ────────────────────────────────────────────────────────────

function _renderLists() {
    _renderResourceList();
    _renderTagList('pmItemTagList', _itemTags, 'item-tag');
    _renderTagList('pmStepTagList', _stepTags, 'step-tag');
}

function _renderResourceList() {
    const container = document.getElementById('pmResourceList');
    container.innerHTML = '';

    _resources.forEach((res, idx) => {
        const row = document.createElement('div');
        row.className = 'def-row';
        row.innerHTML = `
            <input type="text" class="emoji-input" value="${escHtml(res.emoji)}"
                   aria-label="Resource emoji" maxlength="2"
                   data-field="emoji" data-idx="${idx}">
            <input type="text" value="${escHtml(res.name)}"
                   aria-label="Resource name" placeholder="Name"
                   data-field="name" data-idx="${idx}">
            <input type="number" class="capacity-input" value="${res.capacity}"
                   aria-label="Capacity" min="1"
                   data-field="capacity" data-idx="${idx}">
            <span class="def-row-label">cap</span>
            <button class="def-row-remove" aria-label="Remove resource"
                    data-action="remove-resource" data-idx="${idx}">✕</button>
        `;
        container.appendChild(row);
    });

    // Wire inputs — update working copy on change.
    container.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            const idx = parseInt(input.dataset.idx);
            const field = input.dataset.field;
            if (field === 'capacity') {
                _resources[idx].capacity = Math.max(1, parseInt(input.value) || 1);
            } else {
                _resources[idx][field] = input.value;
            }
        });
    });

    container.querySelectorAll('[data-action="remove-resource"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            _resources.splice(idx, 1);
            _renderResourceList();
        });
    });
}

function _renderTagList(containerId, list, kind) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    list.forEach((tag, idx) => {
        const row = document.createElement('div');
        row.className = 'def-row';
        row.innerHTML = `
            <input type="text" class="emoji-input" value="${escHtml(tag.emoji)}"
                   aria-label="Tag emoji" maxlength="2"
                   data-field="emoji" data-idx="${idx}" data-kind="${kind}">
            <input type="text" value="${escHtml(tag.name)}"
                   aria-label="Tag name" placeholder="Name"
                   data-field="name" data-idx="${idx}" data-kind="${kind}">
            <button class="def-row-remove" aria-label="Remove tag"
                    data-action="remove-tag" data-idx="${idx}" data-kind="${kind}">✕</button>
        `;
        container.appendChild(row);
    });

    container.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            const idx = parseInt(input.dataset.idx);
            const field = input.dataset.field;
            const arr = input.dataset.kind === 'item-tag' ? _itemTags : _stepTags;
            arr[idx][field] = input.value;
        });
    });

    container.querySelectorAll('[data-action="remove-tag"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            const arr = btn.dataset.kind === 'item-tag' ? _itemTags : _stepTags;
            arr.splice(idx, 1);
            _renderTagList(containerId, arr, kind);
        });
    });
}

// ── Add row handlers (called from main.js window globals) ─────────────────────

export function addResourceRow() {
    _resources.push({id: crypto.randomUUID(), name: '', emoji: '', capacity: 1});
    _renderResourceList();
    // Focus the name field of the new row.
    const rows = document.querySelectorAll('#pmResourceList .def-row');
    if (rows.length > 0) {
        const last = rows[rows.length - 1];
        const nameInput = last.querySelectorAll('input[type="text"]')[1];
        if (nameInput) nameInput.focus();
    }
}

export function addItemTagRow() {
    _itemTags.push({id: crypto.randomUUID(), name: '', emoji: ''});
    _renderTagList('pmItemTagList', _itemTags, 'item-tag');
    _focusLastTagName('pmItemTagList');
}

export function addStepTagRow() {
    _stepTags.push({id: crypto.randomUUID(), name: '', emoji: ''});
    _renderTagList('pmStepTagList', _stepTags, 'step-tag');
    _focusLastTagName('pmStepTagList');
}

function _focusLastTagName(containerId) {
    const rows = document.querySelectorAll(`#${containerId} .def-row`);
    if (rows.length === 0) return;
    const last = rows[rows.length - 1];
    const nameInput = last.querySelectorAll('input[type="text"]')[1];
    if (nameInput) nameInput.focus();
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function _newProject(name) {
    return {
        id: crypto.randomUUID(),
        name,
        resources: [],
        itemTags: [],
        stepTags: [],
        items: [],
        sortMode: 'manual',
        session: {
            createdAt: new Date().toISOString(),
            stepState: {},
            pinnedOnly: false,
            activeItemTags: [],
            activeStepTags: [],
            briefingShowAll: false,
            pillDisplayMode: 'emoji',
        },
        last_modified: null,
    };
}

function _cleanResource(r) {
    return {
        id: r.id,
        name: r.name.trim(),
        emoji: r.emoji.trim(),
        capacity: Math.max(1, parseInt(r.capacity) || 1),
    };
}

function _cleanTag(t) {
    return {
        id: t.id,
        name: t.name.trim(),
        emoji: t.emoji.trim(),
    };
}

// ── Reconcile deletions ───────────────────────────────────────────────────────
// When a resource or tag is removed in the modal, clean up references in items
// and steps so no orphaned IDs remain in the data.

function _reconcileDeletedResources(project) {
    const keepIds = new Set(_resources.map(r => r.id));
    for (const item of (project.items || [])) {
        if (!item.resourceCosts) continue;
        for (const rid of Object.keys(item.resourceCosts)) {
            if (!keepIds.has(rid)) delete item.resourceCosts[rid];
        }
    }
}

function _reconcileDeletedTags(project) {
    const keepItemTagIds = new Set(_itemTags.map(t => t.id));
    const keepStepTagIds = new Set(_stepTags.map(t => t.id));

    for (const item of (project.items || [])) {
        // Remove deleted item tags from items.
        if (Array.isArray(item.tags)) {
            item.tags = item.tags.filter(id => keepItemTagIds.has(id));
        }
        // Remove deleted step tags from steps.
        for (const step of (item.steps || [])) {
            if (Array.isArray(step.tags)) {
                step.tags = step.tags.filter(id => keepStepTagIds.has(id));
            }
        }
    }
}
