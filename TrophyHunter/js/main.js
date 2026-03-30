// TrophyHunter/js/main.js
// Entry point: holds all module-level state, drives selector and main view,
// exposes window globals for inline HTML handlers, runs init IIFE.

// ═══════════════════════════════════════════════
// Main — state, selector, interactions, globals, init
// ═══════════════════════════════════════════════

import {
    loadData, saveData, loadGame, resolveCollision, deleteGame,
    loadCatalogEntry, mergeCatalogUpdate,
    STORAGE_SELECTED, localSave,
    subscribeToGameChanges, unsubscribeFromGameChanges, REALTIME_ENABLED,
} from './storage.js';
import {
    renderMain, updateGameHeader, updateGroupHeader,
    refreshTrophyRow, updateSelectorButtons,
    computeStats, computeGroupStats,
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

// ── Debounce handle for Supabase sync ──
let _syncTimer = null;

// ═══════════════════════════════════════════════
// Debounced sync
// UI writes to localStorage immediately and re-renders.
// Supabase sync fires 2s after the last change — batches rapid toggles.
// ═══════════════════════════════════════════════

function _scheduleSync() {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => {
        _syncTimer = null;
        if (getUser()) saveData(_personalData);  // fire-and-forget
    }, 2000);
}

// ═══════════════════════════════════════════════
// Realtime incoming update handler
// Called by storage.js when a newer remote version of a game arrives.
// Skipped if a local debounce timer is running — local changes take priority.
//
// viewState (filter, sort, ungrouped, collapsedGroups) is intentionally
// excluded from the merge. trophyState syncs live across devices; viewState
// is local-only at runtime. Each device keeps its own display preferences
// during a session. viewState is still written to Supabase on every save
// so it is restored on initial load — it just never overwrites the current
// session's display preferences when a Realtime event arrives.
// ═══════════════════════════════════════════════

function _onRemoteUpdate(remoteGame, remoteUpdatedAt) {
    // If we have unsaved local changes in flight, ignore the remote update.
    // Our pending write will reach Supabase shortly and supersede it.
    if (_syncTimer !== null) return;

    const localGame = _personalData.games.find(g => g.id === remoteGame.id);

    // If the game isn't in our local list at all, add it.
    if (!localGame) {
        _personalData.games.push({...remoteGame, last_modified: remoteUpdatedAt});
        localSave(_personalData);
        _rebuildSelector();
        return;
    }

    // Compare timestamps — only apply if the remote is strictly newer.
    const localTime = localGame.last_modified ? new Date(localGame.last_modified) : new Date(0);
    const remoteTime = new Date(remoteUpdatedAt);
    if (remoteTime <= localTime) return;

    // Apply the remote state — preserving the local viewState so display
    // preferences (filter, sort, ungrouped, collapsedGroups) are not
    // overwritten mid-session by another device's choices.
    const idx = _personalData.games.findIndex(g => g.id === remoteGame.id);
    _personalData.games[idx] = {
        ...remoteGame,
        last_modified: remoteUpdatedAt,
        viewState: localGame.viewState,  // keep this device's display preferences
    };
    localSave(_personalData);

    // Re-render only if this game is currently selected.
    if (selectedGameId === remoteGame.id) {
        _doRenderMain();
    }
}

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

    _rebuildSelector();
    return data;
}

// _rebuildSelector — rebuilds the dropdown from current _personalData without
// hitting Supabase. Used by the Realtime handler to update the selector when
// a new game arrives from another device.
function _rebuildSelector() {
    const sel = document.getElementById('gameSelect');
    sel.innerHTML = '<option value="">— select a game —</option>';
    _personalData.games.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = `${g.name} [${g.platform}]`;
        sel.appendChild(opt);
    });

    if (selectedGameId && _personalData.games.find(g => g.id === selectedGameId)) {
        sel.value = selectedGameId;
    }

    const hasGame = !!selectedGameId && !!_personalData.games.find(g => g.id === selectedGameId);
    updateSelectorButtons(hasGame);
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

    // Flush any pending sync before switching games
    clearTimeout(_syncTimer);
    _syncTimer = null;
    if (getUser()) await saveData(_personalData);

    // Collision detection
    const {game, collision} = await loadGame(selectedGameId);
    if (collision) {
        _showCollisionModal(selectedGameId, game.name, collision, async () => {
            _personalData = await loadData();
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

    document.getElementById('mainContent').innerHTML =
        `<div class="empty-state"><div class="big">⏳</div>Loading trophy data…</div>`;

    _catalogEntry = await loadCatalogEntry(game.npCommId);
    _doRenderMain();
}

function _doRenderMain() {
    renderMain(selectedGameId, _personalData, _catalogEntry, _callbacks());
}

// ═══════════════════════════════════════════════
// Callbacks
// ═══════════════════════════════════════════════

function _callbacks() {
    return {
        onToggleEarned: id => _toggleEarned(id),
        onTogglePinned: id => _togglePinned(id),
        onViewStateChange: vs => _updateViewState(vs),
        onToggleGroup: id => _toggleGroup(id),
    };
}

// ═══════════════════════════════════════════════
// Trophy interactions
// ═══════════════════════════════════════════════

function _toggleEarned(trophyId) {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game || !_catalogEntry) return;

    const state = game.trophyState[trophyId] || {earned: false, pinned: false};
    const newEarned = !state.earned;

    game.trophyState[trophyId] = {
        ...state,
        earned: newEarned,
        pinned: newEarned ? false : state.pinned,  // auto-unpin when earned
    };

    // Stamp and write to localStorage immediately — synchronous, no await
    game.last_modified = new Date().toISOString();
    localSave(_personalData);

    if (game.viewState.filter !== 'all') {
        // Filter active — full re-render so sort order updates immediately
        _doRenderMain();
    } else {
        // No filter — targeted updates are sufficient and faster
        const trophy = _findTrophyInCatalog(trophyId);
        if (trophy) refreshTrophyRow(trophyId, trophy, game.trophyState, _callbacks());

        const group = _findGroupForTrophy(trophyId);
        if (group) {
            const collapsed = game.viewState.collapsedGroups || [];
            updateGroupHeader(group.groupId, group, computeGroupStats(group, game.trophyState), collapsed, id => _toggleGroup(id));
        }

        updateGameHeader(game, _catalogEntry, computeStats(_catalogEntry.groups, game.trophyState));
    }

    _scheduleSync();
}

function _togglePinned(trophyId) {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) return;

    const state = game.trophyState[trophyId] || {earned: false, pinned: false};
    if (state.earned) return;  // can't pin earned trophies

    game.trophyState[trophyId] = {...state, pinned: !state.pinned};

    game.last_modified = new Date().toISOString();
    localSave(_personalData);

    _doRenderMain();
    _scheduleSync();
}

function _updateViewState(newViewState) {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) return;

    game.viewState = newViewState;
    game.last_modified = new Date().toISOString();
    localSave(_personalData);

    _doRenderMain();
    _scheduleSync();
}

function _toggleGroup(groupId) {
    const game = _personalData.games.find(g => g.id === selectedGameId);
    if (!game) return;

    const collapsed = game.viewState.collapsedGroups || [];
    const idx = collapsed.indexOf(groupId);
    if (idx === -1) {
        game.viewState.collapsedGroups = [...collapsed, groupId];
    } else {
        game.viewState.collapsedGroups = collapsed.filter(id => id !== groupId);
    }

    game.last_modified = new Date().toISOString();
    localSave(_personalData);
    _scheduleSync();

    // Targeted DOM update — no full re-render needed for collapse toggle
    const body = document.getElementById(`group-body-${groupId}`);
    const header = document.querySelector(`.th-group-header[data-group-id="${groupId}"]`);
    const toggle = header && header.querySelector('.th-group-toggle');

    if (body) body.classList.toggle('collapsed', game.viewState.collapsedGroups.includes(groupId));
    if (toggle) toggle.textContent = game.viewState.collapsedGroups.includes(groupId) ? '▶' : '▼';
}

// ═══════════════════════════════════════════════
// Game management — add / rename / reset / remove / refresh
// ═══════════════════════════════════════════════

function _openAddGame() {
    clearTimeout(_syncTimer);
    _syncTimer = null;
    if (getUser()) saveData(_personalData);

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

    clearTimeout(_syncTimer);
    _syncTimer = null;
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

    const idx = _personalData.games.findIndex(g => g.id === selectedGameId);
    if (idx !== -1) _personalData.games[idx] = updatedGame;

    _catalogEntry = newCatalogEntry;

    saveData(_personalData);  // fire and forget — modal stays open for message
    _doRenderMain();

    return {addedCount, orphanedCount};
}

// ═══════════════════════════════════════════════
// Collision modal
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
        _personalData = await loadData();
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

    // Wire Realtime subscription if enabled and user is signed in.
    const user = getUser();
    if (REALTIME_ENABLED && user) {
        subscribeToGameChanges(user.id, _onRemoteUpdate);
    }

    // Re-wire subscription on auth state changes.
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && REALTIME_ENABLED) {
            subscribeToGameChanges(session.user.id, _onRemoteUpdate);
        } else if (event === 'SIGNED_OUT') {
            unsubscribeFromGameChanges();
        }
    });
})();