// ThingCounter/js/modal.js
// Add/edit branch modal, add/edit counter modal, game modal (add/edit/settings/delete), swatch popover, and confirm-delete flow.

// ═══════════════════════════════════════════════
// Modal — branch, counter, game, and confirm-delete
// ═══════════════════════════════════════════════

import {loadData, saveData} from './storage.js';
import {SWATCHES, DEFAULT_COLOR, swatchByColor} from './swatches.js';
import {
    findNode, findParent, getAllBranches, isAncestor,
    insertNode, removeNode, initialValue, newId,
    clampValue, countDescendants
} from './nodes.js';

// ═══════════════════════════════════════════════
// Swatch popover
// ═══════════════════════════════════════════════

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

// Close swatch popover on outside click
document.addEventListener('click', () => {
    const popover = document.getElementById('acSwatchPopover');
    if (popover) popover.classList.remove('open');
});

// ═══════════════════════════════════════════════
// Parent selector helper
// ═══════════════════════════════════════════════

export function populateParentSelect(selectId, selectedGameId, excludeId, selectedParentId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
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

// ═══════════════════════════════════════════════
// Add / Edit Branch modal
// ═══════════════════════════════════════════════

let editingBranchId = null;

export function openAddBranchModal(parentId, selectedGameId) {
    editingBranchId = null;
    document.getElementById('addBranchTitle').textContent = 'Add Branch';
    document.getElementById('addBranchSaveBtn').textContent = 'Add';
    document.getElementById('abName').value = '';
    populateParentSelect('abParent', selectedGameId, null, parentId);
    document.getElementById('addBranchModal').classList.add('open');
}

export function openEditBranchModal(nodeId, selectedGameId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    editingBranchId = nodeId;
    document.getElementById('addBranchTitle').textContent = 'Edit Branch';
    document.getElementById('addBranchSaveBtn').textContent = 'Save';
    document.getElementById('abName').value = node.name;
    const parentNode = findParent(game.nodes, nodeId);
    populateParentSelect('abParent', selectedGameId, nodeId, parentNode ? parentNode.id : null);
    document.getElementById('addBranchModal').classList.add('open');
}

export function closeAddBranchModal() {
    editingBranchId = null;
    document.getElementById('addBranchModal').classList.remove('open');
}

export function saveAddBranch(selectedGameId, onSaved) {
    const name = document.getElementById('abName').value.trim() || 'New Branch';
    const newParentId = document.getElementById('abParent').value || null;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
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

    saveData(data);
    closeAddBranchModal();
    onSaved();
}

// ═══════════════════════════════════════════════
// Add / Edit Counter modal
// ═══════════════════════════════════════════════

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
    document.getElementById('addCounterModal').classList.add('open');
}

export function openEditCounterModal(nodeId, selectedGameId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
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
    document.getElementById('addCounterModal').classList.add('open');
}

export function closeAddCounterModal() {
    editingCounterId = null;
    document.getElementById('acSwatchPopover').classList.remove('open');
    document.getElementById('addCounterModal').classList.remove('open');
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

export function saveAddCounter(selectedGameId, onSaved) {
    const name = document.getElementById('acName').value.trim() || 'New Counter';
    const newParentId = document.getElementById('acParent').value || null;
    const isBounded = document.querySelector('input[name="acCounterType"]:checked')?.value === 'bounded';
    const isDecrement = document.getElementById('acDecrement').checked;
    const step = Math.max(1, parseFloat(document.getElementById('acStep').value) || 1);
    const color = currentSwatchColor;

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
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
            id: newId(),
            name,
            type: 'counter',
            counterType: isBounded ? 'bounded' : 'open',
            value: rawValue,
            step,
            color,
            decrement: isDecrement,
        };
        if (isBounded) {
            node.min = rawMin;
            node.max = rawMax;
            node.initial = rawInitial;
        }
        insertNode(game, node, newParentId);
    }

    saveData(data);
    closeAddCounterModal();
    onSaved();
}

// ═══════════════════════════════════════════════
// Add / Edit / Delete Game modal
// ═══════════════════════════════════════════════

let editingGameId = null;

export function openAddGameModal() {
    editingGameId = null;
    document.getElementById('gameModalTitle').textContent = 'Add Game';
    document.getElementById('gmName').value = '';
    document.getElementById('gameSettingsDanger').style.display = 'none';
    cancelResetCounters();
    document.getElementById('gameModal').classList.add('open');
}

export function openGameSettingsModal(selectedGameId) {
    if (!selectedGameId) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    editingGameId = selectedGameId;
    document.getElementById('gameModalTitle').textContent = 'Game Settings';
    document.getElementById('gmName').value = game.name;
    document.getElementById('gameSettingsDanger').style.display = '';
    cancelResetCounters();
    document.getElementById('gameModal').classList.add('open');
}

export function closeGameModal() {
    cancelResetCounters();
    document.getElementById('gameModal').classList.remove('open');
}

export function saveGame(selectedGameId, onSaved) {
    const name = document.getElementById('gmName').value.trim();
    if (!name) {
        alert('Please enter a game title.');
        return;
    }
    const data = loadData();
    let savedId;
    if (editingGameId) {
        const game = data.games.find(g => g.id === editingGameId);
        if (game) game.name = name;
        savedId = editingGameId;
    } else {
        const game = {id: 'game_' + Date.now(), name, nodes: []};
        data.games.push(game);
        savedId = game.id;
    }
    saveData(data);
    closeGameModal();
    onSaved(savedId);
}

export function promptResetCounters() {
    document.getElementById('resetConfirmRow').style.opacity = '0.4';
    document.getElementById('resetConfirm').style.display = '';
}

export function cancelResetCounters() {
    const row = document.getElementById('resetConfirmRow');
    const confirm = document.getElementById('resetConfirm');
    if (row) row.style.opacity = '';
    if (confirm) confirm.style.display = 'none';
}

export function confirmResetCounters(selectedGameId, onDone) {
    if (!selectedGameId) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    function resetNodes(nodes) {
        for (const n of nodes) {
            if (n.type === 'counter') n.value = initialValue(n);
            if (n.children) resetNodes(n.children);
        }
    }

    resetNodes(game.nodes || []);
    saveData(data);
    closeGameModal();
    onDone();
}

// ═══════════════════════════════════════════════
// Confirm Delete
// ═══════════════════════════════════════════════

let pendingDeleteId = null;
let pendingDeleteType = null;

export function openConfirmDeleteNode(nodeId, selectedGameId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    pendingDeleteId = nodeId;
    pendingDeleteType = 'node';
    document.getElementById('confirmNodeName').textContent = node.name;
    document.getElementById('confirmNodeExtra').textContent = node.type === 'branch'
        ? `This will also delete ${countDescendants(node)} child node(s).`
        : 'This cannot be undone.';
    document.getElementById('confirmOverlay').classList.add('open');
}

export function openConfirmDeleteGame(selectedGameId, onClose) {
    if (!selectedGameId) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    onClose(); // close game modal first
    pendingDeleteId = selectedGameId;
    pendingDeleteType = 'game';
    document.getElementById('confirmNodeName').textContent = game.name;
    document.getElementById('confirmNodeExtra').textContent = 'All counters and nodes will be permanently deleted.';
    document.getElementById('confirmOverlay').classList.add('open');
}

export function closeConfirm() {
    pendingDeleteId = null;
    pendingDeleteType = null;
    document.getElementById('confirmOverlay').classList.remove('open');
}

export function confirmDelete(selectedGameId, onDeleted) {
    if (!pendingDeleteId) return;
    const data = loadData();
    if (pendingDeleteType === 'node') {
        const game = data.games.find(g => g.id === selectedGameId);
        if (game) removeNode(game.nodes, pendingDeleteId);
    } else if (pendingDeleteType === 'game') {
        data.games = data.games.filter(g => g.id !== pendingDeleteId);
    }
    saveData(data);
    const deletedId = pendingDeleteId;
    const deletedType = pendingDeleteType;
    closeConfirm();
    onDeleted(deletedId, deletedType);
}