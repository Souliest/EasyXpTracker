// TrophyHunter/js/modal-settings.js
// Game Settings modal — rename, reset progress, refresh from PSN, remove game.
// No dependency on the search modal or its state.

// ═══════════════════════════════════════════════
// Modal — game settings
// ═══════════════════════════════════════════════

import {workerFetchTrophies} from './psn.js';
import {saveCatalogEntry} from './storage.js';
import {getUser} from '../../common/auth.js';

export async function openGameSettingsModal(game, callbacks) {
    const overlay = document.getElementById('gameSettingsModal');
    if (!overlay) return;

    document.getElementById('settingsGameName').value = game.name;
    document.getElementById('settingsRefreshMsg').textContent = '';
    _resetSettingsDangerZone();

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('settingsGameName').focus();

    // Wire rename save
    const saveBtn = document.getElementById('settingsSaveBtn');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.replaceWith(newSaveBtn);
    newSaveBtn.addEventListener('click', () => {
        const newName = document.getElementById('settingsGameName').value.trim();
        if (!newName) return;
        closeGameSettingsModal();
        callbacks.onRename(newName);
    });

    // Wire refresh from PSN
    const refreshBtn = document.getElementById('settingsRefreshBtn');
    const newRefreshBtn = refreshBtn.cloneNode(true);
    refreshBtn.replaceWith(newRefreshBtn);
    newRefreshBtn.addEventListener('click', () => _handleRefresh(game, callbacks));

    // Wire reset
    const resetBtn = document.getElementById('settingsResetBtn');
    const newResetBtn = resetBtn.cloneNode(true);
    resetBtn.replaceWith(newResetBtn);
    newResetBtn.addEventListener('click', () => {
        document.getElementById('settingsResetConfirm').style.display = '';
        document.getElementById('settingsResetBtn').style.opacity = '0.4';
    });

    const resetYes = document.getElementById('settingsResetConfirmYes');
    const newResetYes = resetYes.cloneNode(true);
    resetYes.replaceWith(newResetYes);
    newResetYes.addEventListener('click', () => {
        closeGameSettingsModal();
        callbacks.onReset();
    });

    const resetNo = document.getElementById('settingsResetConfirmNo');
    const newResetNo = resetNo.cloneNode(true);
    resetNo.replaceWith(newResetNo);
    newResetNo.addEventListener('click', () => _resetSettingsDangerZone());

    const removeBtn = document.getElementById('settingsRemoveBtn');
    const newRemoveBtn = removeBtn.cloneNode(true);
    removeBtn.replaceWith(newRemoveBtn);
    newRemoveBtn.addEventListener('click', () => {
        document.getElementById('settingsRemoveConfirm').style.display = '';
        document.getElementById('settingsRemoveBtn').style.opacity = '0.4';
    });

    const removeYes = document.getElementById('settingsRemoveConfirmYes');
    const newRemoveYes = removeYes.cloneNode(true);
    removeYes.replaceWith(newRemoveYes);
    newRemoveYes.addEventListener('click', () => {
        closeGameSettingsModal();
        callbacks.onRemove();
    });

    const removeNo = document.getElementById('settingsRemoveConfirmNo');
    const newRemoveNo = removeNo.cloneNode(true);
    removeNo.replaceWith(newRemoveNo);
    newRemoveNo.addEventListener('click', () => _resetSettingsDangerZone());
}

export function closeGameSettingsModal() {
    const overlay = document.getElementById('gameSettingsModal');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
}

function _resetSettingsDangerZone() {
    const resetConfirm = document.getElementById('settingsResetConfirm');
    const removeConfirm = document.getElementById('settingsRemoveConfirm');
    const resetBtn = document.getElementById('settingsResetBtn');
    const removeBtn = document.getElementById('settingsRemoveBtn');

    if (resetConfirm) resetConfirm.style.display = 'none';
    if (removeConfirm) removeConfirm.style.display = 'none';
    if (resetBtn) resetBtn.style.opacity = '';
    if (removeBtn) removeBtn.style.opacity = '';
}

async function _handleRefresh(game, callbacks) {
    const user = getUser();
    const msgEl = document.getElementById('settingsRefreshMsg');
    const btn = document.getElementById('settingsRefreshBtn');

    msgEl.textContent = 'Fetching from PSN…';
    msgEl.className = 'settings-refresh-msg';
    btn.disabled = true;

    try {
        const freshEntry = await workerFetchTrophies(
            game.npCommId,
            game.platform,
            user ? user.id : null
        );

        const entry = {
            npCommId: game.npCommId,
            name: freshEntry.name || game.name,
            platform: freshEntry.platform || game.platform,
            iconUrl: freshEntry.iconUrl || null,
            groups: freshEntry.groups || [],
        };

        saveCatalogEntry(entry);
        const result = callbacks.onRefresh(entry);

        if (result.addedCount === 0 && result.orphanedCount === 0) {
            msgEl.textContent = 'Already up to date.';
        } else {
            const parts = [];
            if (result.addedCount > 0) parts.push(`${result.addedCount} new trophy${result.addedCount !== 1 ? 'ies' : ''} added`);
            if (result.orphanedCount > 0) parts.push(`${result.orphanedCount} orphaned`);
            msgEl.textContent = parts.join(', ') + '.';
        }
        msgEl.className = 'settings-refresh-msg success';
    } catch (err) {
        msgEl.textContent = `Refresh failed: ${err.message}`;
        msgEl.className = 'settings-refresh-msg error';
    } finally {
        btn.disabled = false;
    }
}