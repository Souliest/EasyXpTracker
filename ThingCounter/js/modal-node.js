// ThingCounter/js/modal-node.js
// Add/edit branch modal, add/edit counter modal, swatch popover, and parent selector helper.
// No dependency on the game modal or confirm-delete flow (those live in modal-game.js).

import {saveData, STORAGE_KEY} from './storage.js';
import {cacheSet, TOOL_CONFIG} from '../../common/migrations.js';
import {SWATCHES, DEFAULT_COLOR, swatchByColor} from './swatches.js';
import {
    findNode, findParent, getAllBranches, isAncestor,
    insertNode, removeNode, newId,
} from './nodes.js';
import {openModal as trapOpen, closeModal as trapClose} from '../../common/utils.js';

const CFG = TOOL_CONFIG.thingCounter;

// ── Local storage read ─────────────────────────────────────────────────────

function _localLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
            {version: 2, index: [], blobs: {}, lruOrder: []};
    } catch {
        return {version: 2, index: [], blobs: {}, lruOrder: []};
    }
}

// ── Swatch popover ─────────────────────────────────────────────────────────

let currentSwatchColor = DEFAULT_COLOR;

export function buildSwatchPopover(popoverId, selectedColor, onSelect) {
    const popover = document.getElementById(popoverId);
    popover.innerHTML = '';
    SWATCHES.forEach(sw => {
        const dot = document.createElement('div');
        dot.className = 'swatch' + (sw.color === selectedColor ? ' selected' : '');
        dot.style.background = sw.color;
        dot.title = sw.name;
        dot.onclick = e => {
            e.stopPropagation();
            onSelect(sw.color);
            popover.classList.remove('open');
        };
        popover.appendChild(dot);
    });
}

export function toggleSwatchPopover(event) {
    event.stopPropagation();
    const popover = document.getElementById('acSwatchPopover');
    if (popover.classList.contains('open')) {
        popover.classList.remove('open');
    } else {
        buildSwatchPopover('acSwatchPopover', currentSwatchColor, color => {
            currentSwatchColor = color;
            updateColorField(color);
        });
        popover.classList.add('open');
    }
}

export function updateColorField(color) {
    const sw = swatchByColor(color);
    document.getElementById('acColorDot').style.background = sw.color;
    document.getElementById('acColorName').textContent = sw.name;
    currentSwatchColor = color;
}

document.addEventListener('click', () => {
    const popover = document.getElementById('acSwatchPopover');
    if (popover) popover.classList.remove('open');
});

// ── Parent selector helper ─────────────────────────────────────────────────

export function populateParentSelect(selectId, selectedGameId, excludeId, selectedParentId) {
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    const sel = document.getElementById(selectId);
    sel.innerHTML = '<option value="">(Root level)</option>';
    if (!game) return;
    getAllBranches(game.nodes || []).forEach(b => {
        if (excludeId && (b.id === excludeId || isAncestor(game.nodes, excludeId, b.id))) return;
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = '\u00a0\u00a0'.repeat(b.depth) + b.name;
        if (b.id === selectedParentId) opt.selected = true;
        sel.appendChild(opt);
    });
}

// ── Add / Edit Branch modal ────────────────────────────────────────────────

let editingBranchId = null;

export function openAddBranchModal(parentId, selectedGameId) {
    editingBranchId = null;
    document.getElementById('addBranchTitle').textContent = 'Add Branch';
    document.getElementById('addBranchSaveBtn').textContent = 'Add';
    document.getElementById('abName').value = '';
    populateParentSelect('abParent', selectedGameId, null, parentId);
    const overlay = document.getElementById('addBranchModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function openEditBranchModal(nodeId, selectedGameId) {
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    editingBranchId = nodeId;
    document.getElementById('addBranchTitle').textContent = 'Edit Branch';
    document.getElementById('addBranchSaveBtn').textContent = 'Save';
    document.getElementById('abName').value = node.name;
    const parentNode = findParent(game.nodes, nodeId);
    populateParentSelect('abParent', selectedGameId, nodeId, parentNode ? parentNode.id : null);
    const overlay = document.getElementById('addBranchModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function closeAddBranchModal() {
    editingBranchId = null;
    const overlay = document.getElementById('addBranchModal');
    overlay.classList.remove('open');
    trapClose(overlay);
}

export async function saveAddBranch(selectedGameId, onSaved) {
    const name = document.getElementById('abName').value.trim() || 'New Branch';
    const newParentId = document.getElementById('abParent').value || null;
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;

    if (editingBranchId) {
        const node = findNode(game.nodes, editingBranchId);
        if (!node) return;
        node.name = name;
        const currentParent = findParent(game.nodes, editingBranchId);
        const currentParentId = currentParent ? currentParent.id : null;
        if (newParentId !== currentParentId) {
            removeNode(game.nodes, editingBranchId);
            insertNode(game, node, newParentId);
        }
    } else {
        const node = {id: newId(), name, type: 'branch', children: []};
        insertNode(game, node, newParentId);
    }

    cacheSet(stored, game, CFG);
    await saveData(stored, selectedGameId);
    closeAddBranchModal();
    onSaved();
}

// ── Add / Edit Counter modal ───────────────────────────────────────────────

let editingCounterId = null;

export function openAddCounterModal(parentId, selectedGameId) {
    editingCounterId = null;
    document.getElementById('addCounterTitle').textContent = 'Add Counter';
    document.getElementById('addCounterSaveBtn').textContent = 'Add';
    document.getElementById('acName').value = '';
    document.querySelector('input[name="acCounterType"][value="open"]').checked = true;
    document.getElementById('acBoundedFields').style.display = 'none';
    document.getElementById('acMin').value = '0';
    document.getElementById('acMax').value = '';
    document.getElementById('acInitial').value = '';
    document.getElementById('acValue').value = '0';
    document.getElementById('acStep').value = '1';
    document.getElementById('acDecrement').checked = false;
    onDecrementChange();
    updateColorField(DEFAULT_COLOR);
    populateParentSelect('acParent', selectedGameId, null, parentId);
    const overlay = document.getElementById('addCounterModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function openEditCounterModal(nodeId, selectedGameId) {
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    editingCounterId = nodeId;
    document.getElementById('addCounterTitle').textContent = 'Edit Counter';
    document.getElementById('addCounterSaveBtn').textContent = 'Save';
    document.getElementById('acName').value = node.name;

    const isBounded = node.counterType === 'bounded';
    document.querySelector(`input[name="acCounterType"][value="${isBounded ? 'bounded' : 'open'}"]`).checked = true;
    document.getElementById('acBoundedFields').style.display = isBounded ? '' : 'none';
    document.getElementById('acMin').value = node.min ?? 0;
    document.getElementById('acMax').value = node.max ?? '';
    document.getElementById('acInitial').value = node.initial ?? '';
    document.getElementById('acValue').value = node.value ?? 0;
    document.getElementById('acStep').value = node.step ?? 1;
    document.getElementById('acDecrement').checked = !!node.decrement;
    onDecrementChange();
    updateColorField(node.color || DEFAULT_COLOR);

    const parentNode = findParent(game.nodes, nodeId);
    populateParentSelect('acParent', selectedGameId, null, parentNode ? parentNode.id : null);
    const overlay = document.getElementById('addCounterModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function closeAddCounterModal() {
    editingCounterId = null;
    document.getElementById('acSwatchPopover').classList.remove('open');
    const overlay = document.getElementById('addCounterModal');
    overlay.classList.remove('open');
    trapClose(overlay);
}

export function onCounterTypeChange() {
    const bounded = document.querySelector('input[name="acCounterType"]:checked')?.value === 'bounded';
    document.getElementById('acBoundedFields').style.display = bounded ? '' : 'none';
}

export function onDecrementChange() {
    const decrement = document.getElementById('acDecrement').checked;
    document.getElementById('acMinLabel').textContent = decrement ? 'Minimum Value (floor)' : 'Minimum Value';
    document.getElementById('acMaxLabel').textContent = decrement ? 'Maximum Value (start)' : 'Maximum Value (ceiling)';
}

export async function saveAddCounter(selectedGameId, onSaved) {
    const name = document.getElementById('acName').value.trim() || 'New Counter';
    const newParentId = document.getElementById('acParent').value || null;
    const isBounded = document.querySelector('input[name="acCounterType"]:checked')?.value === 'bounded';
    const isDecrement = document.getElementById('acDecrement').checked;
    const step = Math.max(1, parseFloat(document.getElementById('acStep').value) || 1);
    const color = currentSwatchColor;

    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;

    let rawValue = parseInt(document.getElementById('acValue').value) || 0;
    let rawMin = parseInt(document.getElementById('acMin').value) ?? 0;
    let rawMax = parseInt(document.getElementById('acMax').value) || null;
    let rawInitial = parseInt(document.getElementById('acInitial').value);
    if (isNaN(rawInitial)) rawInitial = isDecrement ? (rawMax ?? 0) : rawMin;

    if (isBounded && rawMax !== null) rawValue = Math.max(rawMin, Math.min(rawMax, rawValue));

    if (editingCounterId) {
        const node = findNode(game.nodes, editingCounterId);
        if (!node) return;
        node.name = name;
        node.counterType = isBounded ? 'bounded' : 'open';
        node.value = rawValue;
        node.step = step;
        node.color = color;
        node.decrement = isDecrement;
        if (isBounded) {
            node.min = rawMin;
            node.max = rawMax;
            node.initial = rawInitial;
        } else {
            delete node.min;
            delete node.max;
            delete node.initial;
        }
        const currentParent = findParent(game.nodes, editingCounterId);
        const currentParentId = currentParent ? currentParent.id : null;
        if (newParentId !== currentParentId) {
            removeNode(game.nodes, editingCounterId);
            insertNode(game, node, newParentId);
        }
    } else {
        const node = {
            id: newId(), name, type: 'counter',
            counterType: isBounded ? 'bounded' : 'open',
            value: rawValue, step, color,
            decrement: isDecrement,
        };
        if (isBounded) {
            node.min = rawMin;
            node.max = rawMax;
            node.initial = rawInitial;
        }
        insertNode(game, node, newParentId);
    }

    cacheSet(stored, game, CFG);
    await saveData(stored, selectedGameId);
    closeAddCounterModal();
    onSaved();
}