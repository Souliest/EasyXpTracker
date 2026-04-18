// LevelGoalTracker/js/main.js
// Entry point: holds selectedGameId state, drives the selector and main view,
// exposes globals for inline HTML handlers, and runs init.
//
// Storage shape change (v2): loadData() now returns { index, blobs } instead of
// { games }. `index` is always complete and drives the selector. `blobs` is the
// LRU blob cache (up to 5 full game objects). The selected game's full data is
// always loaded via loadGame() before render, so it is guaranteed to be in the
// cache when renderMain() runs.

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
    unsubscribeFromGameChanges,
} from './storage.js';
import {TOOL_CONFIG, cacheSet} from '../../common/migrations.js';
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

const CFG = TOOL_CONFIG.levelGoalTracker;

// ── Module-level state ────────────────────────────────────────────────────────

let selectedGameId = null;

// ── Selector persistence ──────────────────────────────────────────────────────

function persistSelectedGame(id) {
    if (id) localStorage.setItem(STORAGE_SELECTED, id);
    else localStorage.removeItem(STORAGE_SELECTED);
}

function restoreSelectedGame(index) {
    const saved = localStorage.getItem(STORAGE_SELECTED);
    if (saved && index.find(e => e.id === saved)) return saved;
    return null;
}

// ── Selector render ───────────────────────────────────────────────────────────
// Returns { index, blobs } so callers can reuse it without a second loadData().

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
}

// ── Select game ───────────────────────────────────────────────────────────────

async function selectGame(id) {
    selectedGameId = id;
    persistSelectedGame(id);

    if (!id) {
        renderMain();
        return;
    }

    const {game, collision} = await loadGame(id);
    if (collision) {
        showCollisionModal(id, game.name, collision, resolveCollision, () => renderMain());
    } else {
        renderMain();
    }
}

// ── Update level ──────────────────────────────────────────────────────────────

async function updateLevel() {
    const input = document.getElementById('levelInput');
    const newLevel = parseInt(input.value);
    if (isNaN(newLevel)) return;

    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;

    const finalLevel = game.tiers[game.tiers.length - 1].level;
    const clamped = Math.max(game.startLevel, Math.min(finalLevel, newLevel));

    if (clamped !== newLevel) input.value = clamped;

    game.snapshot.currentLevel = clamped;
    cacheSet(stored, game, CFG);
    await saveData(stored, selectedGameId);
    renderMain();
}

// ── Main render ───────────────────────────────────────────────────────────────
// Reads the selected game's blob directly from localStorage (always cache-warm
// after loadGame/selectGame). Accepts an optional pre-loaded stored object to
// avoid a redundant _localLoad() call.

function _localLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
            {version: 2, index: [], blobs: {}, lruOrder: []};
    } catch {
        return {version: 2, index: [], blobs: {}, lruOrder: []};
    }
}

async function renderMain(preloadedStored) {
    const content = document.getElementById('mainContent');
    const stored = preloadedStored || _localLoad();

    if (!selectedGameId) {
        content.innerHTML = stored.index.length === 0
            ? `<div class="empty-state"><div class="big">🎮</div>No games yet.<br>Hit <strong>+ Add</strong> to track your first goal.</div>`
            : `<div class="empty-state">Select a game above.</div>`;
        return;
    }

    const game = stored.blobs[selectedGameId];
    if (!game) {
        content.innerHTML = '';
        return;
    }

    const snapshotRolled = maybeRollSnapshot(game);
    if (snapshotRolled) {
        cacheSet(stored, game, CFG);
        await saveData(stored, selectedGameId);
    }

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
        id => openEditModal(id),
        id => openConfirmDelete(id),
    );
}

// ── Interval tick ─────────────────────────────────────────────────────────────
// Reads from localStorage only; pushes if snapshot rolled.

async function tickRenderMain() {
    if (!selectedGameId) {
        renderMain();
        return;
    }
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;

    const snapshotRolled = maybeRollSnapshot(game);
    if (snapshotRolled) {
        cacheSet(stored, game, CFG);
        await saveData(stored, selectedGameId);
    }

    renderMain(stored);
}

// ── Realtime: handle an incoming remote update ────────────────────────────────
// Remote updates for games not in the blob cache are dropped — the index is
// updated so the selector stays correct, but no blob fetch is triggered.
// The game will be fetched fresh from Supabase when the user selects it.

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

    // Update blob cache if the game is currently cached.
    if (stored.blobs[remoteGame.id]) {
        cacheSet(stored, remoteGame, CFG);
    } else {
        // Not cached — update index only.
        const idx = stored.index.findIndex(e => e.id === remoteGame.id);
        if (idx !== -1) stored.index[idx] = {
            id: remoteGame.id,
            name: remoteGame.name,
            last_modified: remoteGame.last_modified
        };
    }
    localSave(stored);

    if (remoteGame.id === selectedGameId) {
        renderMain(stored);
    }
}

// ── Callbacks for modal save / delete ────────────────────────────────────────

async function afterSave(savedId) {
    selectedGameId = savedId;
    persistSelectedGame(savedId);
    document.getElementById('gameSelect').value = savedId;
    renderMain();
}

async function afterDelete(deletedId) {
    await deleteGame(deletedId);
    if (selectedGameId === deletedId) {
        selectedGameId = null;
        persistSelectedGame(null);
    }
    renderMain();
}

// ── Expose globals called by index.html inline handlers ──────────────────────

window.selectGame = selectGame;
window.openAddModal = openAddModal;
window.saveGame = () => saveGame(afterSave);
window.addTierRow = addTierRow;
window.toggleBackdate = toggleBackdate;
window.closeModal = closeModal;
window.closeConfirm = closeConfirm;
window.confirmDelete = () => confirmDelete(afterDelete);

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
    await initAuth();

    supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) subscribeToGameChanges(session.user.id, _onRemoteUpdate);
        else unsubscribeFromGameChanges();
    });

    const data = await loadData();
    selectedGameId = restoreSelectedGame(data.index);
    _rebuildSelector(data.index);
    renderMain();

    const user = getUser();
    if (user) subscribeToGameChanges(user.id, _onRemoteUpdate);

    setInterval(tickRenderMain, 60000);
})();