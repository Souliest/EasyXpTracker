// LevelGoalTracker/js/modal.js
// Add/edit/delete game modal: open, close, save, tier row management, backdate toggle, and confirm-delete flow.

import {loadData, saveData, STORAGE_KEY} from './storage.js';
import {cacheSet, TOOL_CONFIG} from '../../common/migrations.js';
import {todayStr, daysBetween, localDatePlusDays} from './dates.js';
import {calcDailyTarget} from './snapshot.js';

const CFG = TOOL_CONFIG.levelGoalTracker;

// ── Local storage read ─────────────────────────────────────────────────────

function _localLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
            {version: 2, index: [], blobs: {}, lruOrder: []};
    } catch {
        return {version: 2, index: [], blobs: {}, lruOrder: []};
    }
}

// ── Numeric helpers ────────────────────────────────────────────────────────
// SEC: parseInt / parseFloat return NaN for blank strings and non-numeric
// input. These helpers centralise the guard so callers can't accidentally
// store NaN in the data model, which would silently corrupt pace calculations.

function _parseInt(value, fallback = 0) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function _parseFloat(value, fallback = 0) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

// ── State ──────────────────────────────────────────────────────────────────

let editingGameId = null;

// ── Tier rows ──────────────────────────────────────────────────────────────

export function addTierRow(level = '', reward = '') {
    const rows = document.getElementById('tierRows');
    const div = document.createElement('div');
    div.className = 'tier-row';
    div.innerHTML = `
        <input type="number" class="tier-level"  placeholder="Level" value="${level}" min="1">
        <input type="number" class="tier-reward" placeholder="0.0"   step="0.1" value="${reward}">
        <button class="tier-remove" onclick="this.parentElement.remove()">✕</button>
    `;
    rows.appendChild(div);
}

// ── Backdate helpers ───────────────────────────────────────────────────────

export function toggleBackdate() {
    const checked = document.getElementById('fBackdate').checked;
    document.getElementById('backdateFields').classList.toggle('visible', checked);
    if (!checked) {
        document.getElementById('fTotalDays').value = '';
        document.getElementById('fStartLevel').value = '0';
    }
}

function resetBackdateFields() {
    document.getElementById('fBackdate').checked = false;
    document.getElementById('backdateFields').classList.remove('visible');
    document.getElementById('fTotalDays').value = '';
    document.getElementById('fStartLevel').value = '0';
}

// ── Open / close ───────────────────────────────────────────────────────────

export function openAddModal() {
    editingGameId = null;
    document.getElementById('modalTitle').textContent = 'Add Game';
    document.getElementById('fName').value = '';
    document.getElementById('fCurrentLevel').value = '0';
    document.getElementById('fDays').value = '';
    resetBackdateFields();
    document.getElementById('tierRows').innerHTML = '';
    addTierRow();
    document.getElementById('gameModal').classList.add('open');
}

export function openEditModal(id, onSaved) {
    const stored = _localLoad();
    const game = stored.blobs[id];
    if (!game) return;

    editingGameId = id;
    document.getElementById('modalTitle').textContent = 'Edit Game';
    document.getElementById('fName').value = game.name;
    document.getElementById('fCurrentLevel').value = game.snapshot.currentLevel;

    const daysLeft = Math.max(0, daysBetween(todayStr(), game.deadlineDate));
    document.getElementById('fDays').value = daysLeft;

    const daysElapsed = Math.max(0, daysBetween(game.createdDate, todayStr()));
    const totalDays = daysElapsed + daysLeft;
    const wasBackdated = !!game.backdated;

    if (wasBackdated) {
        document.getElementById('fBackdate').checked = true;
        document.getElementById('backdateFields').classList.add('visible');
        document.getElementById('fTotalDays').value = totalDays;
        document.getElementById('fStartLevel').value = game.startLevel;
    } else {
        resetBackdateFields();
    }

    const rows = document.getElementById('tierRows');
    rows.innerHTML = '';
    game.tiers.forEach(t => addTierRow(t.level, t.reward));

    document.getElementById('gameModal').classList.add('open');
}

export function closeModal() {
    document.getElementById('gameModal').classList.remove('open');
}

// ── Save ───────────────────────────────────────────────────────────────────

export async function saveGame(onSaved) {
    const name = document.getElementById('fName').value.trim();

    // SEC: Use _parseInt/_parseFloat throughout to prevent NaN propagating into
    // the data store. parseInt("") === NaN, which JSON.stringify silently turns
    // into null and breaks all downstream pace calculations.
    const currentLevel = _parseInt(document.getElementById('fCurrentLevel').value, 0);
    const days = _parseInt(document.getElementById('fDays').value, 0);
    const isBackdated = document.getElementById('fBackdate').checked;
    const totalDays = isBackdated ? _parseInt(document.getElementById('fTotalDays').value, 0) : null;
    const startLevel = isBackdated
        ? _parseInt(document.getElementById('fStartLevel').value, 0)
        : currentLevel;

    if (!name) {
        alert('Please enter a game title.');
        return;
    }
    if (days < 1) {
        alert('Please enter a valid number of days remaining.');
        return;
    }
    if (isBackdated && (totalDays === null || totalDays <= days)) {
        alert('Total days must be greater than days remaining.');
        return;
    }

    const tierRows = document.querySelectorAll('.tier-row');
    const tiers = [];
    for (const row of tierRows) {
        const lvl = _parseInt(row.querySelector('.tier-level').value, NaN);
        const rew = _parseFloat(row.querySelector('.tier-reward').value, 0);
        if (Number.isFinite(lvl) && lvl > 0) tiers.push({level: lvl, reward: rew});
    }
    if (tiers.length === 0) {
        alert('Please add at least one checkpoint.');
        return;
    }
    tiers.sort((a, b) => a.level - b.level);

    const stored = _localLoad();
    const deadlineDate = localDatePlusDays(days);
    let savedId;

    if (editingGameId) {
        const game = stored.blobs[editingGameId];
        if (!game) return;
        game.name = name;
        game.tiers = tiers;
        game.deadlineDate = deadlineDate;
        game.backdated = isBackdated;
        game.snapshot.currentLevel = currentLevel;
        // Preserve initialDailyLevel so intra-day progress isn't erased on edit.
        // Only reset it if the snapshot date differs from today (i.e. a fresh day
        // hasn't been rolled yet) or if the user lowered their level below the
        // recorded start-of-day value (data correction).
        if (game.snapshot.date !== todayStr() || currentLevel < game.snapshot.initialDailyLevel) {
            game.snapshot.initialDailyLevel = currentLevel;
        }
        game.snapshot.date = todayStr();
        game.snapshot.dailyTarget = calcDailyTarget(game);
        cacheSet(stored, game, CFG);
        savedId = editingGameId;
    } else {
        const daysAlreadyElapsed = isBackdated ? (totalDays - days) : 0;
        const createdDate = (() => {
            const d = new Date();
            d.setDate(d.getDate() - daysAlreadyElapsed);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        })();

        const game = {
            id: crypto.randomUUID(),
            name,
            startLevel,
            createdDate,
            deadlineDate,
            backdated: isBackdated || false,
            tiers,
            snapshot: {
                date: todayStr(),
                initialDailyLevel: currentLevel,
                currentLevel,
                dailyTarget: 0,
            },
        };
        game.snapshot.dailyTarget = calcDailyTarget(game);
        cacheSet(stored, game, CFG);
        savedId = game.id;
    }

    await saveData(stored, savedId);
    closeModal();
    onSaved(savedId);
}

// ── Confirm delete ─────────────────────────────────────────────────────────

let pendingDeleteId = null;

export function openConfirmDelete(id) {
    const stored = _localLoad();
    // Name may be in index even if blob is evicted.
    const entry = stored.index.find(e => e.id === id);
    if (!entry) return;
    pendingDeleteId = id;
    document.getElementById('confirmGameName').textContent = entry.name;
    document.getElementById('confirmOverlay').classList.add('open');
}

export function closeConfirm() {
    pendingDeleteId = null;
    document.getElementById('confirmOverlay').classList.remove('open');
}

export function confirmDelete(onDeleted) {
    if (!pendingDeleteId) return;
    const deletedId = pendingDeleteId;
    closeConfirm();
    onDeleted(deletedId);
}