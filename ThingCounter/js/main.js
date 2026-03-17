// ThingCounter/js/main.js
// Entry point: holds all module-level state, wires tree interactions, exposes globals for inline HTML handlers, and runs init.

// ═══════════════════════════════════════════════
// Main — state, tree interactions, globals, init
// ═══════════════════════════════════════════════

import {loadData, saveData, loadGame, resolveCollision, deleteGame, STORAGE_SELECTED} from './storage.js';
import {findNode, clampValue, initialValue} from './nodes.js';
import {
    renderMain,
    refreshCounterCard,
    updateSortBtn,
    updateGameActionButtons,
    currentSortOrder,
} from './render.js';
import {
    openFocusModal,
    closeFocusModal,
    syncFocusIfOpen,
    updateFocusDisplay,
    activateFocusValueInput,
    onFocusValueInput,
    onFocusValueBlur,
    activateFocusStepInput,
    onFocusStepInput,
    onFocusStepBlur,
    focusStep,
    focusResetValue,
    openQuickCounter,
    closeQuickCounter,
    qcStep,
    activateQcValueInput,
    onQcValueInput,
    onQcValueBlur,
    activateQcStepInput,
    onQcStepInput,
    onQcStepBlur,
    qcResetValue,
    qcReset,
    setFocusGameId,
} from './focus.js';
import {
    toggleSwatchPopover,
    onCounterTypeChange,
    onDecrementChange,
    openAddBranchModal,
    openEditBranchModal,
    closeAddBranchModal,
    saveAddBranch,
    openAddCounterModal,
    openEditCounterModal,
    closeAddCounterModal,
    saveAddCounter,
    openAddGameModal,
    openGameSettingsModal,
    closeGameModal,
    saveGame,
    promptResetCounters,
    cancelResetCounters,
    confirmResetCounters,
    openConfirmDeleteNode,
    openConfirmDeleteGame,
    closeConfirm,
    confirmDelete,
} from './modal.js';
import {initAuth} from '../../common/auth-ui.js';

// ═══════════════════════════════════════════════
// Module-level state
// ═══════════════════════════════════════════════

let selectedGameId = null;
let editMode = false;
let nodeEditActive = null;
const collapsedBranches = new Set();

// ═══════════════════════════════════════════════
// Callbacks object passed into render functions
// ═══════════════════════════════════════════════

const callbacks = {
    onOpenQuickCounter: () => openQuickCounter(),
    onOpenAddCounter: parentId => openAddCounterModal(parentId, selectedGameId),
    onOpenAddBranch: parentId => openAddBranchModal(parentId, selectedGameId),
    onCounterStep: (id, dir) => counterStep(id, dir),
    onResetNodeValue: id => resetNodeValue(id),
    onResetNodeStep: id => resetNodeStep(id),
    onOpenEditCounter: id => openEditCounterModal(id, selectedGameId),
    onOpenConfirmDeleteNode: id => openConfirmDeleteNode(id, selectedGameId),
    onOpenEditBranch: id => openEditBranchModal(id, selectedGameId),
    onToggleBranch: id => toggleBranch(id),
    onActivateNodeEdit: id => activateNodeEdit(id),
    onOpenFocusModal: id => openFocusModal(id, selectedGameId),
    onAttachLongPress: (el, cb) => attachLongPress(el, cb),
};

// ═══════════════════════════════════════════════
// Game selector
// ═══════════════════════════════════════════════

async function renderSelector() {
    const data = await loadData();
    const sel = document.getElementById('gameSelect');
    sel.innerHTML = '<option value="">— select a game —</option>';
    data.games.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        sel.appendChild(opt);
    });
    if (selectedGameId && data.games.find(g => g.id === selectedGameId)) {
        sel.value = selectedGameId;
    }
    updateGameActionButtons(selectedGameId);
}

async function selectGame(id) {
    selectedGameId = id || null;
    nodeEditActive = null;
    setFocusGameId(selectedGameId);

    if (selectedGameId) {
        localStorage.setItem(STORAGE_SELECTED, selectedGameId);
        qcReset();
        document.getElementById('quickCounterModal').classList.remove('open');
    } else {
        localStorage.removeItem(STORAGE_SELECTED);
    }

    updateGameActionButtons(selectedGameId);
    updateSortBtn(selectedGameId);

    if (!selectedGameId) {
        doRenderMain();
        return;
    }

    // Check for collision before rendering
    const {game, collision} = await loadGame(selectedGameId);
    if (collision) {
        showCollisionModal(selectedGameId, game.name, collision, () => doRenderMain());
    } else {
        doRenderMain();
    }
}

function restoreSelectedGame(data) {
    const saved = localStorage.getItem(STORAGE_SELECTED);
    if (saved && data.games.find(g => g.id === saved)) return saved;
    return null;
}

// ── Collision modal ──

function showCollisionModal(gameId, gameName, collision, onResolved) {
    let overlay = document.getElementById('collisionOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'collisionOverlay';
        overlay.className = 'collision-overlay';
        document.body.appendChild(overlay);
    }

    const fmtTime = iso => {
        if (!iso) return '—';
        return new Date(iso).toLocaleString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    overlay.innerHTML = `
        <div class="collision-box">
            <div class="collision-title">⚠ Data Conflict</div>
            <div class="collision-game-name">${_escHtml(gameName)}</div>
            <div class="collision-timestamps">
                <div class="collision-ts-row">
                    <span class="collision-ts-label">Local</span>
                    <span class="collision-ts-value">${fmtTime(collision.localTime)}</span>
                </div>
                <div class="collision-ts-row">
                    <span class="collision-ts-label">Cloud</span>
                    <span class="collision-ts-value">${fmtTime(collision.remoteTime)}</span>
                </div>
            </div>
            <div class="collision-actions">
                <button class="btn btn-ghost" id="collisionUseLocal">Use Local</button>
                <button class="btn btn-primary" id="collisionUseRemote">Use Cloud</button>
            </div>
        </div>
    `;
    overlay.classList.add('open');

    document.getElementById('collisionUseLocal').addEventListener('click', async () => {
        overlay.classList.remove('open');
        await resolveCollision(gameId, 'local', null);
        onResolved();
    });

    document.getElementById('collisionUseRemote').addEventListener('click', async () => {
        overlay.classList.remove('open');
        await resolveCollision(gameId, 'remote', collision.remoteData);
        onResolved();
    });
}

function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════
// Edit mode
// ═══════════════════════════════════════════════

function toggleEditMode() {
    editMode = !editMode;
    nodeEditActive = null;
    const btn = document.getElementById('editModeBtn');
    const content = document.getElementById('mainContent');
    btn.classList.toggle('active', editMode);
    content.classList.toggle('edit-mode', editMode);
    const banner = content.querySelector('.edit-mode-banner');
    if (banner) banner.classList.toggle('visible', editMode);
    content.querySelectorAll('.counter-card').forEach(card => card.classList.remove('node-edit-active'));
    content.querySelectorAll('.branch-row').forEach(row => row.classList.remove('node-edit-active'));
}

function activateNodeEdit(nodeId) {
    if (editMode) return;
    const content = document.getElementById('mainContent');
    if (nodeEditActive === nodeId) {
        nodeEditActive = null;
        content.querySelectorAll('.counter-card, .branch-row').forEach(el => el.classList.remove('node-edit-active'));
    } else {
        nodeEditActive = nodeId;
        content.querySelectorAll('.counter-card, .branch-row').forEach(el => el.classList.remove('node-edit-active'));
        const el = content.querySelector(`.tree-node[data-id="${nodeId}"] > .counter-card`) ||
            content.querySelector(`.tree-node[data-id="${nodeId}"] > .branch-row`);
        if (el) el.classList.add('node-edit-active');
    }
}

// ═══════════════════════════════════════════════
// Tree interactions
// ═══════════════════════════════════════════════

function toggleBranch(id) {
    if (collapsedBranches.has(id)) collapsedBranches.delete(id);
    else collapsedBranches.add(id);

    const childContainer = document.getElementById('children-' + id);
    if (childContainer) childContainer.classList.toggle('collapsed', collapsedBranches.has(id));

    const wrapper = document.querySelector(`.tree-node[data-id="${id}"]`);
    if (wrapper) {
        const toggle = wrapper.querySelector('.branch-toggle');
        if (toggle) toggle.textContent = collapsedBranches.has(id) ? '▶' : '▼';
    }
}

async function counterStep(nodeId, direction) {
    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    const step = node.step || 1;
    node.value = clampValue(node, node.value + direction * step);
    await saveData(data);

    refreshCounterCard(nodeId, node, nodeEditActive, callbacks);
    syncFocusIfOpen(nodeId);
}

async function resetNodeValue(nodeId) {
    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    node.value = initialValue(node);
    await saveData(data);
    refreshCounterCard(nodeId, node, nodeEditActive, callbacks);
    syncFocusIfOpen(nodeId);
}

async function resetNodeStep(nodeId) {
    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    node.step = 1;
    await saveData(data);
    refreshCounterCard(nodeId, node, nodeEditActive, callbacks);
    syncFocusIfOpen(nodeId);
}

// ═══════════════════════════════════════════════
// Long-press helper
// ═══════════════════════════════════════════════

function attachLongPress(el, callback) {
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
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > THRESHOLD || dy > THRESHOLD) {
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

// ═══════════════════════════════════════════════
// Sort order
// ═══════════════════════════════════════════════

async function cycleSortOrder() {
    if (!selectedGameId) return;
    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const next = {null: 'asc', asc: 'desc', desc: null};
    game.sortOrder = next[game.sortOrder || 'null'] || null;
    await saveData(data);
    updateSortBtn(selectedGameId);
    doRenderMain();
}

// ═══════════════════════════════════════════════
// Render orchestration
// ═══════════════════════════════════════════════

function doRenderMain() {
    renderMain(selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks);
}

// ── After-save / after-delete callbacks ──

async function afterGameSaved(savedId) {
    selectedGameId = savedId;
    setFocusGameId(savedId);
    localStorage.setItem(STORAGE_SELECTED, savedId);
    await renderSelector();
    document.getElementById('gameSelect').value = savedId;
    doRenderMain();
}

async function afterGameDeleted(deletedId, deletedType) {
    if (deletedType === 'game') {
        await deleteGame(deletedId);
        if (selectedGameId === deletedId) {
            selectedGameId = null;
            setFocusGameId(null);
            localStorage.removeItem(STORAGE_SELECTED);
        }
    }
    await renderSelector();
    doRenderMain();
}

function afterNodeSaved() {
    doRenderMain();
}

// ═══════════════════════════════════════════════
// Expose globals for inline HTML handlers
// ═══════════════════════════════════════════════

window.selectGame = selectGame;
window.openAddGameModal = openAddGameModal;
window.openGameSettingsModal = () => openGameSettingsModal(selectedGameId);
window.saveGame = () => saveGame(selectedGameId, afterGameSaved);
window.closeGameModal = closeGameModal;
window.toggleEditMode = toggleEditMode;
window.cycleSortOrder = cycleSortOrder;

window.openAddBranchModal = parentId => openAddBranchModal(parentId, selectedGameId);
window.openAddCounterModal = parentId => openAddCounterModal(parentId, selectedGameId);
window.closeAddBranchModal = closeAddBranchModal;
window.closeAddCounterModal = closeAddCounterModal;
window.saveAddBranch = () => saveAddBranch(selectedGameId, afterNodeSaved);
window.saveAddCounter = () => saveAddCounter(selectedGameId, afterNodeSaved);

window.toggleSwatchPopover = toggleSwatchPopover;
window.onCounterTypeChange = onCounterTypeChange;
window.onDecrementChange = onDecrementChange;

window.promptResetCounters = promptResetCounters;
window.cancelResetCounters = cancelResetCounters;
window.confirmResetCounters = () => confirmResetCounters(selectedGameId, afterNodeSaved);
window.openConfirmDeleteGame = () => openConfirmDeleteGame(selectedGameId, closeGameModal);
window.closeConfirm = closeConfirm;
window.confirmDelete = () => confirmDelete(selectedGameId, afterGameDeleted);

window.closeFocusModal = closeFocusModal;
window.activateFocusValueInput = activateFocusValueInput;
window.onFocusValueInput = () => onFocusValueInput((id, node) => refreshCounterCard(id, node, nodeEditActive, callbacks));
window.onFocusValueBlur = onFocusValueBlur;
window.activateFocusStepInput = activateFocusStepInput;
window.onFocusStepInput = onFocusStepInput;
window.onFocusStepBlur = onFocusStepBlur;
window.focusStep = (dir, useOne) => focusStep(dir, useOne, (id, node) => refreshCounterCard(id, node, nodeEditActive, callbacks));
window.focusResetValue = () => focusResetValue((id, node) => refreshCounterCard(id, node, nodeEditActive, callbacks));

window.openQuickCounter = openQuickCounter;
window.closeQuickCounter = closeQuickCounter;
window.qcStep = qcStep;
window.activateQcValueInput = activateQcValueInput;
window.onQcValueInput = onQcValueInput;
window.onQcValueBlur = onQcValueBlur;
window.activateQcStepInput = activateQcStepInput;
window.onQcStepInput = onQcStepInput;
window.onQcStepBlur = onQcStepBlur;
window.qcResetValue = qcResetValue;

// ═══════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════

(async function init() {
    await initAuth();
    const data = await loadData();
    selectedGameId = restoreSelectedGame(data);
    setFocusGameId(selectedGameId);
    await renderSelector();
    doRenderMain();
})();