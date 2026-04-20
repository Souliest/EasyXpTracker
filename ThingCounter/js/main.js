// ThingCounter/js/main.js
// Entry point: holds all module-level state, wires tree interactions,
// exposes globals for inline HTML handlers, and runs init.
//
// Storage shape change (v2): loadData() now returns { index, blobs } instead of
// { games }. `index` drives the selector; `blobs` is the LRU blob cache.
// All functions that previously did data.games.find(...) now read from the
// stored object via _localLoad() or from blobs passed in directly.

import {
    loadData, saveData, localSave, loadGame, resolveCollision, deleteGame,
    STORAGE_KEY, STORAGE_SELECTED,
    subscribeToGameChanges, unsubscribeFromGameChanges,
} from './storage.js';
import {
    TOOL_CONFIG, cacheSet,
} from '../../common/migrations.js';
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
    activateFocusValueInput,
    onFocusValueInput,
    onFocusValueBlur,
    activateFocusStepInput,
    onFocusStepInput,
    onFocusStepBlur,
    focusStep,
    focusResetValue,
    setFocusGameId,
} from './focus.js';
import {
    qcReset,
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
} from './quick-counter.js';
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

const CFG = TOOL_CONFIG.thingCounter;

// ── Module-level state ────────────────────────────────────────────────────────

let selectedGameId = null;
let editMode = false;
let nodeEditActive = null;
const collapsedBranches = new Set();

// ── Callbacks object passed into render functions ─────────────────────────────

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

// ── Local storage read ────────────────────────────────────────────────────────

function _localLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
            {version: 2, index: [], blobs: {}, lruOrder: []};
    } catch {
        return {version: 2, index: [], blobs: {}, lruOrder: []};
    }
}

// ── Realtime: handle an incoming remote update ────────────────────────────────
// Remote updates for games not in the blob cache update the index only — no
// blob fetch is triggered. The game will be loaded fresh when the user selects it.

function _onRemoteUpdate(row) {
    if (!row || !row.data) return;

    const remoteGame = {...row.data, last_modified: row.updated_at};
    const stored = _localLoad();

    const indexEntry = stored.index.find(e => e.id === remoteGame.id);

    // Skip if remote isn't strictly newer.
    if (indexEntry) {
        const localTime = indexEntry.last_modified ? new Date(indexEntry.last_modified) : null;
        const remoteTime = remoteGame.last_modified ? new Date(remoteGame.last_modified) : null;
        if (localTime && remoteTime && remoteTime <= localTime) return;
    }

    if (!indexEntry) {
        // New game from another device — add to index and rebuild selector.
        cacheSet(stored, remoteGame, CFG);
        localSave(stored);
        _rebuildSelector(stored.index);
        return;
    }

    if (stored.blobs[remoteGame.id]) {
        cacheSet(stored, remoteGame, CFG);
    } else {
        const idx = stored.index.findIndex(e => e.id === remoteGame.id);
        if (idx !== -1) stored.index[idx] = {
            id: remoteGame.id,
            name: remoteGame.name,
            last_modified: remoteGame.last_modified
        };
    }
    localSave(stored);

    if (remoteGame.id === selectedGameId) {
        doRenderMain(stored);
    }
}

// ── Game selector ─────────────────────────────────────────────────────────────

async function renderSelector() {
    const data = await loadData();
    _rebuildSelector(data.index);
    return data;
}

function _rebuildSelector(index) {
    const sel = document.getElementById('gameSelect');
    sel.innerHTML = '<option value="">— select a game —</option>';
    index.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name;
        sel.appendChild(opt);
    });
    if (selectedGameId && index.find(e => e.id === selectedGameId)) {
        sel.value = selectedGameId;
    }
    const hasGame = !!selectedGameId && !!index.find(e => e.id === selectedGameId);
    updateGameActionButtons(hasGame);
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

    const stored = _localLoad();
    const hasGame = !!selectedGameId && !!stored.index.find(e => e.id === selectedGameId);
    updateGameActionButtons(hasGame);

    const game = stored.blobs[selectedGameId] || null;
    updateSortBtn(game);

    if (!selectedGameId) {
        doRenderMain(stored);
        return;
    }

    const {game: loadedGame, collision} = await loadGame(selectedGameId);
    if (collision) {
        showCollisionModal(selectedGameId, loadedGame.name, collision, resolveCollision, async () => {
            const fresh = _localLoad();
            doRenderMain(fresh);
        });
    } else {
        doRenderMain(_localLoad());
    }
}

function restoreSelectedGame(index) {
    const saved = localStorage.getItem(STORAGE_SELECTED);
    if (saved && index.find(e => e.id === saved)) return saved;
    return null;
}

// ── Edit mode ─────────────────────────────────────────────────────────────────

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

// ── Tree interactions ─────────────────────────────────────────────────────────

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
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    const step = node.step || 1;
    node.value = clampValue(node, node.value + direction * step);
    cacheSet(stored, game, CFG);
    await saveData(stored, selectedGameId);

    refreshCounterCard(nodeId, node, nodeEditActive, callbacks);
    await syncFocusIfOpen(nodeId);
}

async function resetNodeValue(nodeId) {
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    node.value = initialValue(node);
    cacheSet(stored, game, CFG);
    await saveData(stored, selectedGameId);
    refreshCounterCard(nodeId, node, nodeEditActive, callbacks);
    await syncFocusIfOpen(nodeId);
}

async function resetNodeStep(nodeId) {
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    node.step = 1;
    cacheSet(stored, game, CFG);
    await saveData(stored, selectedGameId);
    refreshCounterCard(nodeId, node, nodeEditActive, callbacks);
    await syncFocusIfOpen(nodeId);
}

// ── Sort order ────────────────────────────────────────────────────────────────

async function cycleSortOrder() {
    if (!selectedGameId) return;
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;
    const order = game.sortOrder ?? null;
    game.sortOrder = order === null ? 'asc' : order === 'asc' ? 'desc' : null;
    cacheSet(stored, game, CFG);
    await saveData(stored, selectedGameId);
    updateSortBtn(game);
    doRenderMain(stored);
}

// ── Render orchestration ──────────────────────────────────────────────────────
// stored is always passed in to avoid a redundant _localLoad() call.

function doRenderMain(stored) {
    renderMain(selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks, stored);
}

// ── After-save / after-delete callbacks ──────────────────────────────────────

async function afterGameSaved(savedId) {
    selectedGameId = savedId;
    setFocusGameId(savedId);
    localStorage.setItem(STORAGE_SELECTED, savedId);
    document.getElementById('gameSelect').value = savedId;
    doRenderMain(_localLoad());
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
    doRenderMain(_localLoad());
}

async function afterNodeSaved() {
    doRenderMain(_localLoad());
}

// ── Expose globals for inline HTML handlers ───────────────────────────────────

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

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
    await initAuth();

    supabase.auth.onAuthStateChange((event, session) => {
        if (session && session.user) subscribeToGameChanges(session.user.id, _onRemoteUpdate);
        else unsubscribeFromGameChanges();
    });

    const data = await loadData();
    selectedGameId = restoreSelectedGame(data.index);
    setFocusGameId(selectedGameId);
    _rebuildSelector(data.index);
    doRenderMain(_localLoad());

    const user = getUser();
    if (user) subscribeToGameChanges(user.id, _onRemoteUpdate);
})();