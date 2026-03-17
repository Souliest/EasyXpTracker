// LevelGoalTracker/js/main.js
// Entry point: holds selectedGameId state, drives the selector and main view, exposes globals for inline HTML handlers, and runs init.

// ═══════════════════════════════════════════════
// Main — state, selector, renderMain, updateLevel, init
// ═══════════════════════════════════════════════

import {loadData, saveData, loadGame, resolveCollision, deleteGame, STORAGE_SELECTED} from './storage.js';
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
import {initAuth} from '../../common/auth-ui.js';

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
}

// ── Select game ──

async function selectGame(id) {
    selectedGameId = id;
    persistSelectedGame(id);

    if (!id) {
        renderMain();
        return;
    }

    // Check for collision before rendering
    const {game, collision} = await loadGame(id);
    if (collision) {
        showCollisionModal(id, game.name, collision, () => renderMain());
    } else {
        renderMain();
    }
}

// ── Collision modal ──

function showCollisionModal(gameId, gameName, collision, onResolved) {
    // Inject collision overlay if not present
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
    await saveData(data);
    renderMain();
}

// ── Main render ──

async function renderMain() {
    const content = document.getElementById('mainContent');
    if (!selectedGameId) {
        const data = await loadData();
        content.innerHTML = data.games.length === 0
            ? `<div class="empty-state"><div class="big">🎮</div>No games yet.<br>Hit <strong>+ Add</strong> to track your first goal.</div>`
            : `<div class="empty-state">Select a game above.</div>`;
        return;
    }

    const data = await loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) {
        content.innerHTML = '';
        return;
    }

    if (maybeRollSnapshot(game)) await saveData(data);

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

async function afterSave(savedId) {
    selectedGameId = savedId;
    persistSelectedGame(savedId);
    await renderSelector();
    document.getElementById('gameSelect').value = savedId;
    renderMain();
}

async function afterDelete(deletedId) {
    await deleteGame(deletedId);
    if (selectedGameId === deletedId) {
        selectedGameId = null;
        persistSelectedGame(null);
    }
    await renderSelector();
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

// ── Init ──

(async function init() {
    await initAuth();
    const data = await loadData();
    selectedGameId = restoreSelectedGame(data);
    await renderSelector();
    renderMain();
    // Auto-refresh every minute so daily targets stay current
    setInterval(renderMain, 60000);
})();