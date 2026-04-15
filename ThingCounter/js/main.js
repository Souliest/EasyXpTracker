// ThingCounter/js/main.js
// Entry point: holds all module-level state, wires tree interactions, exposes globals for inline HTML handlers, and runs init.

// ═══════════════════════════════════════════════
// Main — state, tree interactions, globals, init
// ═══════════════════════════════════════════════

import {
    loadData, saveData, localSave, loadGame, resolveCollision, deleteGame,
    STORAGE_KEY, STORAGE_SELECTED,
    subscribeToGameChanges, unsubscribeFromGameChanges,
} from './storage.js';
import {findNode, clampValue, initialValue} from './nodes.js';
import {
    renderMain,
    refreshCounterCard,
    updateSortBtn,
    updateGameActionButtons,
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
import {initAuth, showCollisionModal} from '../../common/auth-ui.js';
import {attachLongPress} from '../../common/utils.js';
import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';

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
// Realtime: handle an incoming remote update
// Called by the Supabase Realtime subscription whenever another device saves a game.
// ═══════════════════════════════════════════════

function _onRemoteUpdate(row) {
    if (!row || !row.data) return;

    const remoteGame = {...row.data, last_modified: row.updated_at};
    const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"games":[]}');

    const localGame = local.games.find(g => g.id === remoteGame.id);

    // Skip if remote isn't strictly newer than what we already have locally.
    if (localGame) {
        const localTime = localGame.last_modified ? new Date(localGame.last_modified) : null;
        const remoteTime = remoteGame.last_modified ? new Date(remoteGame.last_modified) : null;
        if (localTime && remoteTime && remoteTime <= localTime) return;
    }

    // Apply remote data to localStorage.
    const idx = local.games.findIndex(g => g.id === remoteGame.id);
    if (idx !== -1) {
        local.games[idx] = remoteGame;
    } else {
        // Game added on another device — add it and rebuild the selector.
        local.games.push(remoteGame);
        localSave(local);
        _rebuildSelector(local);
        return;
    }
    localSave(local);

    // Re-render if the updated game is the one currently on screen.
    if (remoteGame.id === selectedGameId) {
        doRenderMain(local);
    }
}

// Rebuild just the selector dropdown from already-loaded data, preserving selection.
function _rebuildSelector(data) {
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
    const hasGame = !!selectedGameId && !!data.games.find(g => g.id === selectedGameId);
    updateGameActionButtons(hasGame);
}

// ═══════════════════════════════════════════════
// Game selector
// ═══════════════════════════════════════════════

// Returns the loaded data so callers can reuse it without a second loadData() call.
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
    const hasGame = !!selectedGameId && !!data.games.find(g => g.id === selectedGameId);
    updateGameActionButtons(hasGame);
    return data;
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

    const data = await loadData();
    const hasGame = !!selectedGameId && !!data.games.find(g => g.id === selectedGameId);
    updateGameActionButtons(hasGame);

    const game = data.games.find(g => g.id === selectedGameId) || null;
    updateSortBtn(game);

    if (!selectedGameId) {
        doRenderMain(data);
        return;
    }

    // Check for collision before rendering
    const {game: loadedGame, collision} = await loadGame(selectedGameId);
    if (collision) {
        showCollisionModal(selectedGameId, loadedGame.name, collision, resolveCollision, async () => {
            const fresh = await loadData();
            doRenderMain(fresh);
        });
    } else {
        doRenderMain(data);
    }
}

function restoreSelectedGame(data) {
    const saved = localStorage.getItem(STORAGE_SELECTED);
    if (saved && data.games.find(g => g.id === saved)) return saved;
    return null;
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
    await saveData(data, selectedGameId);

    refreshCounterCard(nodeId, node, nodeEditActive, callbacks);
    await syncFocusIfOpen(nodeId);
}

async function resetNodeValue(nodeId) {
    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    node.value = initialValue(node);
    await saveData(data, selectedGameId);
    refreshCounterCard(nodeId, node, nodeEditActive, callbacks);
    await syncFocusIfOpen(nodeId);
}

async function resetNodeStep(nodeId) {
    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    node.step = 1;
    await saveData(data, selectedGameId);
    refreshCounterCard(nodeId, node, nodeEditActive, callbacks);
    await syncFocusIfOpen(nodeId);
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
    await saveData(data, selectedGameId);
    updateSortBtn(game);
    doRenderMain(data);
}

// ═══════════════════════════════════════════════
// Render orchestration
// data is always passed in to avoid a redundant loadData call
// ═══════════════════════════════════════════════

function doRenderMain(data) {
    renderMain(selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks, data);
}

// ── After-save / after-delete callbacks ──

async function afterGameSaved(savedId) {
    selectedGameId = savedId;
    setFocusGameId(savedId);
    localStorage.setItem(STORAGE_SELECTED, savedId);
    const data = await renderSelector();
    document.getElementById('gameSelect').value = savedId;
    doRenderMain(data);
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
    const data = await renderSelector();
    doRenderMain(data);
}

async function afterNodeSaved() {
    const data = await loadData();
    doRenderMain(data);
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

    // Wire Realtime subscribe/unsubscribe to auth state changes.
    supabase.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            subscribeToGameChanges(session.user.id, _onRemoteUpdate);
        } else {
            unsubscribeFromGameChanges();
        }
    });

    const data = await loadData();
    selectedGameId = restoreSelectedGame(data);
    setFocusGameId(selectedGameId);
    await renderSelector();
    doRenderMain(data);

    // Subscribe immediately if already signed in.
    const user = getUser();
    if (user) subscribeToGameChanges(user.id, _onRemoteUpdate);
})();