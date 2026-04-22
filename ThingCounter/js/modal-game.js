// ThingCounter/js/modal-game.js
// Add/edit/settings/delete game modal and confirm-delete flow.
// Fully independent of the branch and counter modals in modal-node.js.

import {saveData, STORAGE_KEY} from './storage.js';
import {cacheSet, TOOL_CONFIG} from '../../common/migrations.js';
import {findNode, removeNode, initialValue, countDescendants} from './nodes.js';
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

// ── Add / Edit / Delete Game modal ────────────────────────────────────────

let editingGameId = null;

export function openAddGameModal() {
    editingGameId = null;
    document.getElementById('gameModalTitle').textContent = 'Add Game';
    document.getElementById('gmName').value = '';
    document.getElementById('gameSettingsDanger').style.display = 'none';
    cancelResetCounters();
    const overlay = document.getElementById('gameModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function openGameSettingsModal(selectedGameId) {
    if (!selectedGameId) return;
    const stored = _localLoad();
    // Name is always available in the index even if the blob is evicted.
    const entry = stored.index.find(e => e.id === selectedGameId);
    if (!entry) return;
    editingGameId = selectedGameId;
    document.getElementById('gameModalTitle').textContent = 'Game Settings';
    document.getElementById('gmName').value = entry.name;
    document.getElementById('gameSettingsDanger').style.display = '';
    cancelResetCounters();
    const overlay = document.getElementById('gameModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function closeGameModal() {
    cancelResetCounters();
    const overlay = document.getElementById('gameModal');
    overlay.classList.remove('open');
    trapClose(overlay);
}

export async function saveGame(selectedGameId, onSaved) {
    const name = document.getElementById('gmName').value.trim();
    if (!name) {
        alert('Please enter a game title.');
        return;
    }

    const stored = _localLoad();
    let savedId;

    if (editingGameId) {
        const game = stored.blobs[editingGameId];
        if (game) {
            game.name = name;
            cacheSet(stored, game, CFG);
        } else {
            // Blob evicted — update index name only and skip blob write.
            const idx = stored.index.findIndex(e => e.id === editingGameId);
            if (idx !== -1) stored.index[idx].name = name;
        }
        savedId = editingGameId;
    } else {
        const game = {id: crypto.randomUUID(), name, nodes: []};
        cacheSet(stored, game, CFG);
        savedId = game.id;
    }

    await saveData(stored, savedId);
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
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;

    function resetNodes(nodes) {
        for (const n of nodes) {
            if (n.type === 'counter') n.value = initialValue(n);
            if (n.children) resetNodes(n.children);
        }
    }

    resetNodes(game.nodes || []);
    cacheSet(stored, game, CFG);
    await saveData(stored, selectedGameId);
    closeGameModal();
    onDone();
}

// ── Confirm Delete ─────────────────────────────────────────────────────────

let pendingDeleteId = null;
let pendingDeleteType = null;

export function openConfirmDeleteNode(nodeId, selectedGameId) {
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    pendingDeleteId = nodeId;
    pendingDeleteType = 'node';
    document.getElementById('confirmNodeName').textContent = node.name;
    document.getElementById('confirmNodeExtra').textContent = node.type === 'branch'
        ? `This will also delete ${countDescendants(node)} child node(s).`
        : 'This cannot be undone.';
    const overlay = document.getElementById('confirmOverlay');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function openConfirmDeleteGame(selectedGameId, onClose) {
    if (!selectedGameId) return;
    const stored = _localLoad();
    const entry = stored.index.find(e => e.id === selectedGameId);
    if (!entry) return;
    onClose();
    pendingDeleteId = selectedGameId;
    pendingDeleteType = 'game';
    document.getElementById('confirmNodeName').textContent = entry.name;
    document.getElementById('confirmNodeExtra').textContent = 'All counters and nodes will be permanently deleted.';
    const overlay = document.getElementById('confirmOverlay');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

export function closeConfirm() {
    pendingDeleteId = null;
    pendingDeleteType = null;
    const overlay = document.getElementById('confirmOverlay');
    overlay.classList.remove('open');
    trapClose(overlay);
}

export async function confirmDelete(selectedGameId, onDeleted) {
    if (!pendingDeleteId) return;
    const stored = _localLoad();

    if (pendingDeleteType === 'node') {
        const game = stored.blobs[selectedGameId];
        if (game) {
            removeNode(game.nodes, pendingDeleteId);
            cacheSet(stored, game, CFG);
            await saveData(stored, selectedGameId);
        }
    }

    const deletedId = pendingDeleteId;
    const deletedType = pendingDeleteType;
    closeConfirm();
    onDeleted(deletedId, deletedType);
}