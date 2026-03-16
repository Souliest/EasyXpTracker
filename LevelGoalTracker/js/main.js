// LevelGoalTracker/js/main.js
// Entry point: holds selectedGameId state, drives the selector and main view, exposes globals for inline HTML handlers, and runs init.

// ═══════════════════════════════════════════════
// Main — state, selector, renderMain, updateLevel, init
// ═══════════════════════════════════════════════

import {loadData, saveData, STORAGE_SELECTED} from './storage.js';
import {maybeRollSnapshot} from './snapshot.js';
import {computeStats} from './stats.js';
import {
    renderBanners,
    renderOverviewPanel,
    renderDailyProgressPanel,
    renderNextCheckpointPanel,
    renderCheckpointsPanel,
    renderActions,
    wireActions,
} from './render.js';
import {
    openAddModal,
    openEditModal,
    closeModal,
    saveGame,
    addTierRow,
    toggleBackdate,
    openConfirmDelete,
    closeConfirm,
    confirmDelete,
} from './modal.js';

// ── Module-level state ──
let selectedGameId = null;

// ── Selector persistence ──

function persistSelectedGame(id) {
    if (id) localStorage.setItem(STORAGE_SELECTED, id);
    else localStorage.removeItem(STORAGE_SELECTED);
}

function restoreSelectedGame(data) {
    const saved = localStorage.getItem(STORAGE_SELECTED);
    if (saved && data.games.find(g => g.id === saved)) return saved;
    return null;
}

// ── Selector render ──

function renderSelector() {
    const data = loadData();
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
}

// ── Select game ──

function selectGame(id) {
    selectedGameId = id;
    persistSelectedGame(id);
    renderMain();
}

// ── Update level ──

function updateLevel() {
    const input = document.getElementById('levelInput');
    const newLevel = parseInt(input.value);
    if (isNaN(newLevel)) return;

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    const finalLevel = game.tiers[game.tiers.length - 1].level;
    const clamped = Math.max(game.startLevel, Math.min(finalLevel, newLevel));

    if (clamped !== newLevel) input.value = clamped;

    game.snapshot.currentLevel = clamped;
    saveData(data);
    renderMain();
}

// ── Main render ──

function renderMain() {
    const content = document.getElementById('mainContent');
    if (!selectedGameId) {
        const data = loadData();
        content.innerHTML = data.games.length === 0
            ? `<div class="empty-state"><div class="big">🎮</div>No games yet.<br>Hit <strong>+ Add</strong> to track your first goal.</div>`
            : `<div class="empty-state">Select a game above.</div>`;
        return;
    }

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) {
        content.innerHTML = '';
        return;
    }

    if (maybeRollSnapshot(game)) saveData(data);

    const s = computeStats(game);

    content.innerHTML = [
        renderBanners(game, s),
        renderOverviewPanel(game, s),
        renderDailyProgressPanel(s),
        renderNextCheckpointPanel(s),
        renderCheckpointsPanel(game, s),
        renderActions(game.id),
    ].join('');

    const updateBtn = document.getElementById('updateLevelBtn');
    if (updateBtn) updateBtn.addEventListener('click', updateLevel);

    wireActions(
        game.id,
        id => openEditModal(id, afterSave),
        id => openConfirmDelete(id),
    );
}

// ── Callbacks for modal save / delete ──

function afterSave(savedId) {
    selectedGameId = savedId;
    persistSelectedGame(savedId);
    renderSelector();
    document.getElementById('gameSelect').value = savedId;
    renderMain();
}

function afterDelete(deletedId) {
    if (selectedGameId === deletedId) {
        selectedGameId = null;
        persistSelectedGame(null);
    }
    renderSelector();
    renderMain();
}

// ── Expose globals called by index.html inline handlers ──

window.selectGame = selectGame;
window.openAddModal = openAddModal;
window.saveGame = () => saveGame(afterSave);
window.addTierRow = addTierRow;
window.toggleBackdate = toggleBackdate;
window.closeModal = closeModal;
window.closeConfirm = closeConfirm;
window.confirmDelete = () => confirmDelete(afterDelete);

// openEditModal called only via wireActions (not inline), so no window export needed.
// openConfirmDelete called only via wireActions too.

// ── Init ──

(function init() {
    const data = loadData();
    selectedGameId = restoreSelectedGame(data);
    renderSelector();
    renderMain();
    // Store interval handle (FIX #14 from original)
    const _renderInterval = setInterval(renderMain, 60000);
})();