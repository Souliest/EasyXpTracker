// TrophyHunter/js/main.js
// Entry point: holds all module-level state, drives selector and main view,
// exposes window globals for inline HTML handlers, runs init IIFE.
//
// Storage shape change (v2):
//   _personalData — now holds { index, blobs } instead of { games }.
//                   index is always complete and drives the selector.
//                   blobs is the LRU blob cache (up to 5 entries).
//   _selectedGameBlob — holds the full game object for the currently-selected
//                        game. Populated by loadGame() on every game select and
//                        kept in sync on every write. All functions that
//                        previously did _personalData.games.find(...) now read
//                        _selectedGameBlob directly.

import {
    loadData, saveData, loadGame, resolveCollision, deleteGame,
    loadCatalogEntry, mergeCatalogUpdate,
    STORAGE_KEY, STORAGE_SELECTED, localSave,
    subscribeToGameChanges, unsubscribeFromGameChanges, REALTIME_ENABLED,
} from './storage.js';
import {
    TOOL_CONFIG, cacheSet,
} from '../../common/migrations.js';
import {
    renderMain, updateGameHeader, updateGroupHeader,
    refreshTrophyRow, refreshTrophyList, updateSelectorButtons,
} from './render.js';
import {computeStats, computeGroupStats} from './stats.js';
import {
    openAddGameModal, closeSearchModal,
    openGameSettingsModal, closeGameSettingsModal,
} from './modal.js';
import {initAuth, showCollisionModal} from '../../common/auth-ui.js';
import {getUser} from '../../common/auth.js';
import {supabase} from '../../common/supabase.js';

const CFG = TOOL_CONFIG.trophyHunter;

// ── Module-level state ────────────────────────────────────────────────────────

let selectedGameId = null;
let _personalData = {index: [], blobs: {}};   // { index, blobs } — drives selector
let _selectedGameBlob = null;                       // full game object for the selected game
let _catalogEntry = null;

// ── Debounce handle for Supabase sync ────────────────────────────────────────

let _syncTimer = null;

// ── Local storage read ────────────────────────────────────────────────────────

function _localLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
            {version: 2, index: [], blobs: {}, lruOrder: []};
    } catch {
        return {version: 2, index: [], blobs: {}, lruOrder: []};
    }
}

// ── Debounced sync ────────────────────────────────────────────────────────────
// UI writes to localStorage immediately and re-renders.
// Supabase sync fires 2s after the last change — batches rapid toggles.

function _scheduleSync() {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
        _syncTimer = null;
        if (getUser()) {
            const stored = _localLoad();
            saveData(stored, selectedGameId);  // fire-and-forget
        }
    }, 2000);
}

// ── Realtime incoming update handler ─────────────────────────────────────────
// Skipped if a local debounce timer is running — local changes take priority.
// Updates for games not in the blob cache update the index only; no blob fetch.

function _onRemoteUpdate(remoteGame, remoteUpdatedAt) {
    if (_syncTimer !== null) return;

    const stored = _localLoad();
    const indexEntry = stored.index.find(e => e.id === remoteGame.id);

    if (!indexEntry) {
        // New game from another device.
        const game = {...remoteGame, last_modified: remoteUpdatedAt};
        cacheSet(stored, game, CFG);
        localSave(stored);
        _personalData = {index: stored.index, blobs: stored.blobs};
        _rebuildSelector();
        return;
    }

    const localTime = indexEntry.last_modified ? new Date(indexEntry.last_modified) : new Date(0);
    const remoteTime = new Date(remoteUpdatedAt);
    if (remoteTime <= localTime) return;

    if (stored.blobs[remoteGame.id]) {
        // Preserve viewState from the local session.
        const localBlob = stored.blobs[remoteGame.id];
        const mergedGame = {
            ...remoteGame,
            last_modified: remoteUpdatedAt,
            viewState: localBlob.viewState,
        };
        cacheSet(stored, mergedGame, CFG);

        // Keep _selectedGameBlob in sync if this is the active game.
        if (selectedGameId === remoteGame.id) {
            _selectedGameBlob = mergedGame;
        }
    } else {
        // Not cached — update index only.
        const idx = stored.index.findIndex(e => e.id === remoteGame.id);
        if (idx !== -1) {
            stored.index[idx] = {
                id: remoteGame.id,
                name: remoteGame.name,
                last_modified: remoteUpdatedAt,
                platform: remoteGame.platform,
            };
        }
    }

    localSave(stored);
    _personalData = {index: stored.index, blobs: stored.blobs};

    if (selectedGameId === remoteGame.id) {
        _doRenderMain();
    }
}

// ── Selector ──────────────────────────────────────────────────────────────────

function persistSelectedGame(id) {
    if (id) localStorage.setItem(STORAGE_SELECTED, id);
    else localStorage.removeItem(STORAGE_SELECTED);
}

function restoreSelectedGame(index) {
    const saved = localStorage.getItem(STORAGE_SELECTED);
    if (saved && index.find(e => e.id === saved)) return saved;
    return null;
}

function _rebuildSelector() {
    const sel = document.getElementById('gameSelect');
    sel.innerHTML = '<option value="">— select a game —</option>';
    _personalData.index.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.name} [${e.platform || ''}]`.trim();
        sel.appendChild(opt);
    });

    if (selectedGameId && _personalData.index.find(e => e.id === selectedGameId)) {
        sel.value = selectedGameId;
    }

    const hasGame = !!selectedGameId && !!_personalData.index.find(e => e.id === selectedGameId);
    updateSelectorButtons(hasGame);
}

async function selectGame(id) {
    selectedGameId = id || null;
    _selectedGameBlob = null;
    _catalogEntry = null;
    persistSelectedGame(selectedGameId);

    const hasGame = !!selectedGameId && !!_personalData.index.find(e => e.id === selectedGameId);
    updateSelectorButtons(hasGame);

    if (!selectedGameId) {
        _doRenderMain();
        return;
    }

    // Flush any pending sync before switching games.
    clearTimeout(_syncTimer);
    _syncTimer = null;
    if (getUser()) {
        const stored = _localLoad();
        await saveData(stored, selectedGameId);
    }

    // loadGame warms the blob cache and returns the full game object.
    const {game, collision} = await loadGame(selectedGameId);
    _selectedGameBlob = game;

    if (collision) {
        showCollisionModal(selectedGameId, game.name, collision, resolveCollision, async () => {
            _personalData = await loadData();
            _selectedGameBlob = _personalData.blobs[selectedGameId] || null;
            await _loadCatalogAndRender();
        });
        return;
    }

    await _loadCatalogAndRender();
}

async function _loadCatalogAndRender() {
    if (!selectedGameId || !_selectedGameBlob) {
        _doRenderMain();
        return;
    }

    document.getElementById('mainContent').innerHTML =
        `<div class="empty-state"><div class="big">⏳</div>Loading trophy data…</div>`;

    _catalogEntry = await loadCatalogEntry(_selectedGameBlob.npCommId);
    _doRenderMain();
}

function _doRenderMain() {
    renderMain(selectedGameId, _personalData, _selectedGameBlob, _catalogEntry, _callbacks());
}

// ── Callbacks ─────────────────────────────────────────────────────────────────

function _callbacks() {
    return {
        onToggleEarned: id => _toggleEarned(id),
        onTogglePinned: id => _togglePinned(id),
        onViewStateChange: vs => _updateViewState(vs),
        onToggleGroup: id => _toggleGroup(id),
    };
}

// ── Trophy interactions ───────────────────────────────────────────────────────

function _toggleEarned(trophyId) {
    if (!_selectedGameBlob || !_catalogEntry) return;

    const state = _selectedGameBlob.trophyState[trophyId] || {earned: false, pinned: false};
    const newEarned = !state.earned;

    _selectedGameBlob.trophyState[trophyId] = {
        ...state,
        earned: newEarned,
        pinned: newEarned ? false : state.pinned,
    };
    _selectedGameBlob.last_modified = new Date().toISOString();

    const stored = _localLoad();
    cacheSet(stored, _selectedGameBlob, CFG);
    localSave(stored);
    _personalData = {index: stored.index, blobs: stored.blobs};

    if (_selectedGameBlob.viewState.filter !== 'all') {
        // Update only the list — leave the game header and toolbar untouched
        // to avoid the flash caused by destroying and recreating the <select> elements.
        refreshTrophyList(_selectedGameBlob, _catalogEntry, _callbacks());

        const group = _findGroupForTrophy(trophyId);
        if (group) {
            const collapsed = _selectedGameBlob.viewState.collapsedGroups || [];
            updateGroupHeader(
                group.groupId, group,
                computeGroupStats(group, _selectedGameBlob.trophyState),
                collapsed, id => _toggleGroup(id),
            );
        }

        updateGameHeader(
            _selectedGameBlob,
            _catalogEntry,
            computeStats(_catalogEntry.groups, _selectedGameBlob.trophyState),
        );
    } else {
        const trophy = _findTrophyInCatalog(trophyId);
        if (trophy) refreshTrophyRow(trophyId, trophy, _selectedGameBlob.trophyState, _callbacks());

        const group = _findGroupForTrophy(trophyId);
        if (group) {
            const collapsed = _selectedGameBlob.viewState.collapsedGroups || [];
            updateGroupHeader(
                group.groupId, group,
                computeGroupStats(group, _selectedGameBlob.trophyState),
                collapsed, id => _toggleGroup(id),
            );
        }

        updateGameHeader(
            _selectedGameBlob,
            _catalogEntry,
            computeStats(_catalogEntry.groups, _selectedGameBlob.trophyState),
        );
    }

    _scheduleSync();
}

function _togglePinned(trophyId) {
    if (!_selectedGameBlob) return;

    const state = _selectedGameBlob.trophyState[trophyId] || {earned: false, pinned: false};
    if (state.earned) return;

    _selectedGameBlob.trophyState[trophyId] = {...state, pinned: !state.pinned};
    _selectedGameBlob.last_modified = new Date().toISOString();

    const stored = _localLoad();
    cacheSet(stored, _selectedGameBlob, CFG);
    localSave(stored);
    _personalData = {index: stored.index, blobs: stored.blobs};

    _doRenderMain();
    _scheduleSync();
}

function _updateViewState(newViewState) {
    if (!_selectedGameBlob) return;

    _selectedGameBlob.viewState = newViewState;
    _selectedGameBlob.last_modified = new Date().toISOString();

    const stored = _localLoad();
    cacheSet(stored, _selectedGameBlob, CFG);
    localSave(stored);
    _personalData = {index: stored.index, blobs: stored.blobs};

    _doRenderMain();
    _scheduleSync();
}

function _toggleGroup(groupId) {
    if (!_selectedGameBlob) return;

    const collapsed = _selectedGameBlob.viewState.collapsedGroups || [];
    const idx = collapsed.indexOf(groupId);
    _selectedGameBlob.viewState.collapsedGroups = idx === -1
        ? [...collapsed, groupId]
        : collapsed.filter(id => id !== groupId);

    _selectedGameBlob.last_modified = new Date().toISOString();

    const stored = _localLoad();
    cacheSet(stored, _selectedGameBlob, CFG);
    localSave(stored);
    _personalData = {index: stored.index, blobs: stored.blobs};

    _scheduleSync();

    const body = document.getElementById(`group-body-${groupId}`);
    const header = document.querySelector(`.th-group-header[data-group-id="${groupId}"]`);
    const toggle = header && header.querySelector('.th-group-toggle');

    if (body) body.classList.toggle('collapsed', _selectedGameBlob.viewState.collapsedGroups.includes(groupId));
    if (toggle) toggle.textContent = _selectedGameBlob.viewState.collapsedGroups.includes(groupId) ? '▶' : '▼';
}

// ── Game management ───────────────────────────────────────────────────────────

function _openAddGame() {
    clearTimeout(_syncTimer);
    _syncTimer = null;
    if (getUser()) {
        const stored = _localLoad();
        saveData(stored, selectedGameId);
    }
    openAddGameModal(_personalData.index, _afterGameAdded, _afterSelectExisting);
}

async function _afterGameAdded(game, catalogEntry) {
    const stored = _localLoad();
    cacheSet(stored, game, CFG);
    localSave(stored);

    await saveData(stored, game.id);

    selectedGameId = game.id;
    _selectedGameBlob = game;
    _catalogEntry = catalogEntry;
    _personalData = {index: stored.index, blobs: stored.blobs};

    persistSelectedGame(game.id);
    _rebuildSelector();
    document.getElementById('gameSelect').value = game.id;
    updateSelectorButtons(true);
    _doRenderMain();
}

function _afterSelectExisting(npCommId) {
    const entry = _personalData.index.find(e => e.npCommId === npCommId);
    if (!entry) return;
    selectedGameId = entry.id;
    persistSelectedGame(entry.id);
    document.getElementById('gameSelect').value = entry.id;
    selectGame(entry.id);
}

function _openGameSettings() {
    if (!_selectedGameBlob) return;
    openGameSettingsModal(_selectedGameBlob, {
        onRename: name => _renameGame(name),
        onReset: () => _resetGame(),
        onRemove: () => _removeGame(),
        onRefresh: entry => _refreshGame(entry),
    });
}

async function _renameGame(newName) {
    if (!_selectedGameBlob) return;

    _selectedGameBlob.name = newName;
    _selectedGameBlob.last_modified = new Date().toISOString();

    const stored = _localLoad();
    cacheSet(stored, _selectedGameBlob, CFG);
    localSave(stored);
    _personalData = {index: stored.index, blobs: stored.blobs};

    await saveData(stored, selectedGameId);
    _rebuildSelector();
    document.getElementById('gameSelect').value = selectedGameId;
    _doRenderMain();
}

async function _resetGame() {
    if (!_selectedGameBlob) return;

    for (const key of Object.keys(_selectedGameBlob.trophyState)) {
        _selectedGameBlob.trophyState[key] = {earned: false, pinned: false};
    }
    _selectedGameBlob.last_modified = new Date().toISOString();

    const stored = _localLoad();
    cacheSet(stored, _selectedGameBlob, CFG);
    localSave(stored);
    _personalData = {index: stored.index, blobs: stored.blobs};

    await saveData(stored, selectedGameId);
    _doRenderMain();
}

async function _removeGame() {
    if (!selectedGameId) return;

    clearTimeout(_syncTimer);
    _syncTimer = null;

    await deleteGame(selectedGameId);

    const stored = _localLoad();
    _personalData = {index: stored.index, blobs: stored.blobs};
    selectedGameId = null;
    _selectedGameBlob = null;
    _catalogEntry = null;
    persistSelectedGame(null);

    _rebuildSelector();
    updateSelectorButtons(false);
    _doRenderMain();
}

function _refreshGame(newCatalogEntry) {
    if (!_selectedGameBlob) return {addedCount: 0, orphanedCount: 0};

    const {updatedGame, addedCount, orphanedCount} = mergeCatalogUpdate(_selectedGameBlob, newCatalogEntry);

    _selectedGameBlob = updatedGame;
    _catalogEntry = newCatalogEntry;

    const stored = _localLoad();
    cacheSet(stored, _selectedGameBlob, CFG);
    localSave(stored);
    _personalData = {index: stored.index, blobs: stored.blobs};

    saveData(stored, selectedGameId);
    _doRenderMain();

    return {addedCount, orphanedCount};
}

// ── Catalog lookup helpers ────────────────────────────────────────────────────

function _findTrophyInCatalog(trophyId) {
    if (!_catalogEntry) return null;
    for (const group of _catalogEntry.groups) {
        const t = group.trophies.find(t => String(t.trophyId) === String(trophyId));
        if (t) return t;
    }
    return null;
}

function _findGroupForTrophy(trophyId) {
    if (!_catalogEntry) return null;
    return _catalogEntry.groups.find(g =>
        g.trophies.some(t => String(t.trophyId) === String(trophyId))
    ) || null;
}

// ── Expose globals for inline HTML handlers ───────────────────────────────────

window.selectGame = id => selectGame(id);
window.openAddGameModal = () => _openAddGame();
window.closeSearchModal = closeSearchModal;
window.openGameSettings = () => _openGameSettings();
window.closeGameSettings = closeGameSettingsModal;

document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeSearchModal();
    closeGameSettingsModal();
});

document.getElementById('searchModal').addEventListener('click', function (e) {
    if (e.target === this) closeSearchModal();
});
document.getElementById('gameSettingsModal').addEventListener('click', function (e) {
    if (e.target === this) closeGameSettingsModal();
});

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
    await initAuth();

    const data = await loadData();
    _personalData = data;

    selectedGameId = restoreSelectedGame(data.index);
    _rebuildSelector();

    if (selectedGameId) {
        // Warm the blob cache for the previously-selected game.
        const {game} = await loadGame(selectedGameId);
        _selectedGameBlob = game;
        await _loadCatalogAndRender();
    } else {
        _doRenderMain();
    }

    const user = getUser();
    if (REALTIME_ENABLED && user) {
        subscribeToGameChanges(user.id, _onRemoteUpdate);
    }

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && REALTIME_ENABLED) {
            subscribeToGameChanges(session.user.id, _onRemoteUpdate);
        } else if (event === 'SIGNED_OUT') {
            unsubscribeFromGameChanges();
        }
    });
})();