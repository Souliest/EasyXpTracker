// LevelGoalTracker/js/main.js
// Entry point: holds selectedGameId state, drives the selector and main view, exposes globals for inline HTML handlers, and runs init.

// ═══════════════════════════════════════════════════════════════
// Main — state, selector, renderMain, updateLevel, init
// ═══════════════════════════════════════════════════════════════

import {
    loadData,
    saveData,
    localSave,
    loadGame,
    resolveCollision,
    deleteGame,
    STORAGE_KEY,
    STORAGE_SELECTED,
    subscribeToGameChanges,
    unsubscribeFromGameChanges
} from './storage.js';
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
import {initAuth, showCollisionModal} from '../../common/auth-ui.js';
import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';

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
    return data;
}

// ── Select game ──

async function selectGame(id) {
    selectedGameId = id;
    persistSelectedGame(id);

    if (!id) {
        renderMain();
        return;
    }

    // Check for collision before rendering — only on select, never on interval
    const {game, collision} = await loadGame(id);
    if (collision) {
        showCollisionModal(id, game.name, collision, resolveCollision, () => renderMain());
    } else {
        renderMain();
    }
}

// ── Update level ──

async function updateLevel() {
    const input = document.getElementById('levelInput');
    const newLevel = parseInt(input.value);
    if (isNaN(newLevel)) return;

    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    const finalLevel = game.tiers[game.tiers.length - 1].level;
    const clamped = Math.max(game.startLevel, Math.min(finalLevel, newLevel));

    if (clamped !== newLevel) input.value = clamped;

    game.snapshot.currentLevel = clamped;
    await saveData(data, selectedGameId);
    renderMain();
}

// ── Main render ──
// Accepts optional pre-loaded data to avoid a redundant loadData() call.

async function renderMain(preloaded) {
    const content = document.getElementById('mainContent');
    if (!selectedGameId) {
        const data = preloaded || await loadData();
        content.innerHTML = data.games.length === 0
            ? `<div class="empty-state"><div class="big">🎮</div>No games yet.<br>Hit <strong>+ Add</strong> to track your first goal.</div>`
            : `<div class="empty-state">Select a game above.</div>`;
        return;
    }

    const data = preloaded || await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) {
        content.innerHTML = '';
        return;
    }

    const snapshotRolled = maybeRollSnapshot(game);
    if (snapshotRolled) await saveData(data, selectedGameId);

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

// ── Interval tick: update display from local data only, push if snapshot rolled ──

async function tickRenderMain() {
    if (!selectedGameId) {
        renderMain();
        return;
    }
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"games":[]}');
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    const snapshotRolled = maybeRollSnapshot(game);
    if (snapshotRolled) {
        await saveData(data, selectedGameId);
    }

    renderMain(data);
}

// ── Realtime: handle an incoming remote update ──
// Called by the Supabase Realtime subscription whenever another device saves a game.

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
        renderMain(local);
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
}

// ── Callbacks for modal save / delete ──

async function afterSave(savedId) {
    selectedGameId = savedId;
    persistSelectedGame(savedId);
    const data = await renderSelector();
    document.getElementById('gameSelect').value = savedId;
    renderMain(data);
}

async function afterDelete(deletedId) {
    await deleteGame(deletedId);
    if (selectedGameId === deletedId) {
        selectedGameId = null;
        persistSelectedGame(null);
    }
    const data = await renderSelector();
    renderMain(data);
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

// ── Init ──

(async function init() {
    await initAuth();

    // Wire Realtime subscribe/unsubscribe to auth state changes.
    supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            subscribeToGameChanges(session.user.id, _onRemoteUpdate);
        } else {
            unsubscribeFromGameChanges();
        }
    });

    const data = await loadData();
    selectedGameId = restoreSelectedGame(data);
    await renderSelector();
    renderMain(data);

    // Subscribe immediately if already signed in.
    const user = getUser();
    if (user) subscribeToGameChanges(user.id, _onRemoteUpdate);

    // Tick every minute to keep daily targets current past midnight.
    setInterval(tickRenderMain, 60000);
})();