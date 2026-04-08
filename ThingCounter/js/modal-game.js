// ThingCounter/js/modal-game.js
// Add/edit/settings/delete game modal and confirm-delete flow.
// Fully independent of the branch and counter modals in modal-node.js.

// ═══════════════════════════════════════════════
// Modal — game and confirm-delete
// ═══════════════════════════════════════════════

import {loadData, saveData} from './storage.js';
import {findNode, removeNode, initialValue, countDescendants} from './nodes.js';

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

export async function openGameSettingsModal(selectedGameId) {
    if (!selectedGameId) return;
    const data = await loadData();
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

export async function saveGame(selectedGameId, onSaved) {
    const name = document.getElementById('gmName').value.trim();
    if (!name) {
        alert('Please enter a game title.');
        return;
    }
    const data = await loadData();
    let savedId;
    if (editingGameId) {
        const game = data.games.find(g => g.id === editingGameId);
        if (game) game.name = name;
        savedId = editingGameId;
    } else {
        const game = {id: crypto.randomUUID(), name, nodes: []};
        data.games.push(game);
        savedId = game.id;
    }
    await saveData(data);
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

export async function confirmResetCounters(selectedGameId, onDone) {
    if (!selectedGameId) return;
    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    function resetNodes(nodes) {
        for (const n of nodes) {
            if (n.type === 'counter') n.value = initialValue(n);
            if (n.children) resetNodes(n.children);
        }
    }

    resetNodes(game.nodes || []);
    await saveData(data);
    closeGameModal();
    onDone();
}

// ═══════════════════════════════════════════════
// Confirm Delete
// ═══════════════════════════════════════════════

let pendingDeleteId = null;
let pendingDeleteType = null;

export async function openConfirmDeleteNode(nodeId, selectedGameId) {
    const data = await loadData();
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

export async function openConfirmDeleteGame(selectedGameId, onClose) {
    if (!selectedGameId) return;
    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    onClose();
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

export async function confirmDelete(selectedGameId, onDeleted) {
    if (!pendingDeleteId) return;
    const data = await loadData();
    if (pendingDeleteType === 'node') {
        const game = data.games.find(g => g.id === selectedGameId);
        if (game) removeNode(game.nodes, pendingDeleteId);
        await saveData(data);
    }
    const deletedId = pendingDeleteId;
    const deletedType = pendingDeleteType;
    closeConfirm();
    onDeleted(deletedId, deletedType);
}