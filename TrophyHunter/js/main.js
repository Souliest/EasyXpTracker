// TrophyHunter/js/main.js
// Entry point: holds all module-level state, drives selector and main view,
// exposes window globals for inline HTML handlers, runs init IIFE.

// ═══════════════════════════════════════════════
// Main — state, selector, interactions, globals, init
// ═══════════════════════════════════════════════

import {
    loadData, saveData, loadGame, resolveCollision, deleteGame,
    loadCatalogEntry, saveCatalogEntry, mergeCatalogUpdate,
    STORAGE_SELECTED,
} from './storage.js';
import {
    renderMain, updateGameHeader, updateGroupHeader,
    refreshTrophyRow, updateSelectorButtons,
    computeStats, computeGroupStats, sortTrophies,
} from './render.js';
import {
    openAddGameModal, closeSearchModal,
    openGameSettingsModal, closeGameSettingsModal,
} from './modal.js';
import {initAuth} from '../../common/auth-ui.js';
import {getUser} from '../../common/auth.js';

// ── Module-level state ──

let selectedGameId = null;
let _personalData = {games: []};
let _catalogEntry = null;

// ═══════════════════════════════════════════════
// Selector
// ═══════════════════════════════════════════════

function persistSelectedGame(id) {
    if (id) localStorage.setItem(STORAGE_SELECTED, id);
    else localStorage.removeItem(STORAGE_SELECTED);
}

function restoreSelectedGame(data) {
    const saved = localStorage.getItem(STORAGE_SELECTED);
    if (saved && data.games.find(g => g.id === saved)) return saved;
    return null;
}

async function renderSelector() {
    const data = await loadData();
    _personalData = data;

    const sel = document.getElementById('gameSelect');
    sel.innerHTML = '<option value="">— select a game —</option>';
    data.games.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = `${g.name} [${g.platform}]`;
        sel.appendChild(opt);
    });

    if (selectedGameId && data.games.find(g => g.id === selectedGameId)) {
        sel.value = selectedGameId;
    }

    const hasGame = !!selectedGameId && !!data.games.find(g => g.id === selectedGameId);
    updateSelectorButtons(hasGame);

    return data;
}

async function selectGame(id) {
    selectedGameId = id || null;
    persistSelectedGame(selectedGameId);
    _catalogEntry = null;

    const hasGame = !!selectedGameId &&
        !!_personalData.games.find(g => g.id === selectedGameId);
    updateSelectorButtons(hasGame);

    if (!selectedGameId) {
        _doRenderMain();
        return;
    }

    // Collision detection — same pattern as LGT and ThingCounter
    const {game, collision} = await loadGame(selectedGameId);
    if (collision) {
        _showCollisionModal(selectedGameId, game.name, collision, async () => {
            const fresh = await loadData();
            _personalData = fresh;
            await _loadCatalogAndRender();
        });
        return;
    }

    await _loadCatalogAndRender();
}

async function _loadCatalogAndRender() {
    if (!selectedGameId) {
        _doRenderMain();
        return;
    }

    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) {
        _doRenderMain();
        return;
    }

    // Show loading state while catalog fetch is in progress
    document.getElementById('mainContent').innerHTML =
        `<div class="empty-state"><div class="big">⏳</div>Loading trophy data…</div>`;

    _catalogEntry = await loadCatalogEntry(game.npCommId);
    _doRenderMain();
}

function _doRenderMain() {
    renderMain(selectedGameId, _personalData, _catalogEntry, _callbacks());
}

// ═══════════════════════════════════════════════
// Callbacks object passed into render and modal functions
// ═══════════════════════════════════════════════

function _callbacks() {
    return {
        onToggleEarned: id => _toggleEarned(id),
        onTogglePinned: id => _togglePinned(id),
        onViewStateChange: vs => _updateViewState(vs),
    };
}

// ═══════════════════════════════════════════════
// Trophy interactions
// ═══════════════════════════════════════════════

async function _toggleEarned(trophyId) {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game || !_catalogEntry) return;

    const state = game.trophyState[trophyId] || {earned: false, pinned: false};
    const newEarned = !state.earned;

    game.trophyState[trophyId] = {
        ...state,
        earned: newEarned,
        // Auto-unpin when earned
        pinned: newEarned ? false : state.pinned,
    };

    await saveData(_personalData);

    // Find the trophy object from catalog for targeted re-render
    const trophy = _findTrophyInCatalog(trophyId);
    if (trophy) {
        refreshTrophyRow(trophyId, trophy, game.trophyState, _callbacks());
    }

    // Update group header
    const group = _findGroupForTrophy(trophyId);
    if (group) {
        const groupStats = computeGroupStats(group, game.trophyState);
        updateGroupHeader(group.groupId, group, groupStats);
    }

    // Update top-level game header
    const stats = computeStats(_catalogEntry.groups, game.trophyState);
    updateGameHeader(game, _catalogEntry, stats);
}

async function _togglePinned(trophyId) {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) return;

    const state = game.trophyState[trophyId] || {earned: false, pinned: false};

    // Can't pin earned trophies
    if (state.earned) return;

    game.trophyState[trophyId] = {
        ...state,
        pinned: !state.pinned,
    };

    await saveData(_personalData);

    // Pinning changes sort order — need full group re-render
    _doRenderMain();
}

async function _updateViewState(newViewState) {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) return;

    game.viewState = newViewState;
    await saveData(_personalData);
    _doRenderMain();
}

// ═══════════════════════════════════════════════
// Game management — add / rename / reset / remove / refresh
// ═══════════════════════════════════════════════

function _openAddGame() {
    openAddGameModal(
        _personalData.games,
        _afterGameAdded,
        _afterSelectExisting,
    );
}

async function _afterGameAdded(game, catalogEntry) {
    _personalData.games.push(game);
    await saveData(_personalData);

    selectedGameId = game.id;
    persistSelectedGame(game.id);
    _catalogEntry = catalogEntry;

    await renderSelector();
    document.getElementById('gameSelect').value = game.id;
    updateSelectorButtons(true);
    _doRenderMain();
}

function _afterSelectExisting(npCommId) {
    const game = _personalData.games.find(g => g.npCommId === npCommId);
    if (game) {
        selectedGameId = game.id;
        persistSelectedGame(game.id);
        document.getElementById('gameSelect').value = game.id;
        selectGame(game.id);
    }
}

function _openGameSettings() {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) return;

    openGameSettingsModal(game, {
        onRename: name => _renameGame(name),
        onReset: () => _resetGame(),
        onRemove: () => _removeGame(),
        onRefresh: entry => _refreshGame(entry),
    });
}

async function _renameGame(newName) {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) return;

    game.name = newName;
    await saveData(_personalData);
    await renderSelector();
    document.getElementById('gameSelect').value = selectedGameId;
    _doRenderMain();
}

async function _resetGame() {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) return;

    for (const key of Object.keys(game.trophyState)) {
        game.trophyState[key] = {earned: false, pinned: false};
    }

    await saveData(_personalData);
    _doRenderMain();
}

async function _removeGame() {
    if (!selectedGameId) return;

    await deleteGame(selectedGameId);
    _personalData.games = _personalData.games.filter(g => g.id !== selectedGameId);

    selectedGameId = null;
    _catalogEntry = null;
    persistSelectedGame(null);

    await renderSelector();
    updateSelectorButtons(false);
    _doRenderMain();
}

function _refreshGame(newCatalogEntry) {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) return {addedCount: 0, orphanedCount: 0};

    const {updatedGame, addedCount, orphanedCount} = mergeCatalogUpdate(game, newCatalogEntry);

    // Update in place
    const idx = _personalData.games.findIndex(g => g.id === selectedGameId);
    if (idx !== -1) _personalData.games[idx] = updatedGame;

    _catalogEntry = newCatalogEntry;

    saveData(_personalData);  // fire and forget — modal stays open for message
    _doRenderMain();

    return {addedCount, orphanedCount};
}

// ═══════════════════════════════════════════════
// Collision modal — same pattern as LGT and ThingCounter
// ═══════════════════════════════════════════════

function _showCollisionModal(gameId, gameName, collision, onResolved) {
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
        const fresh = await loadData();
        _personalData = fresh;
        onResolved();
    });
}

// ═══════════════════════════════════════════════
// Catalog lookup helpers
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
// Expose globals for inline HTML handlers
// ═══════════════════════════════════════════════

window.selectGame = id => selectGame(id);
window.openAddGameModal = () => _openAddGame();
window.closeSearchModal = closeSearchModal;
window.openGameSettings = () => _openGameSettings();
window.closeGameSettings = closeGameSettingsModal;

// Escape key dismissal
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeSearchModal();
    closeGameSettingsModal();
});

// Backdrop tap dismissal
document.getElementById('searchModal').addEventListener('click', function (e) {
    if (e.target === this) closeSearchModal();
});
document.getElementById('gameSettingsModal').addEventListener('click', function (e) {
    if (e.target === this) closeGameSettingsModal();
});

// ═══════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════

function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════

(async function init() {
    await initAuth();
    const data = await loadData();
    _personalData = data;

    selectedGameId = restoreSelectedGame(data);
    await renderSelector();

    if (selectedGameId) {
        await _loadCatalogAndRender();
    } else {
        _doRenderMain();
    }
})();