// TrophyHunter/js/modal.js
// Search modal, game settings modal (rename/reset/delete/refresh), and confirm-delete flow.
// All modals use addEventListener — no inline onclick in generated HTML.

// ═══════════════════════════════════════════════
// Modal — search, game settings, confirm
// ═══════════════════════════════════════════════

import {
    searchCatalog,
    workerSearch,
    workerFetchTrophies,
    saveCatalogEntry,
    createGameEntry,
    loadCatalogEntry
} from './storage.js';
import {getUser} from '../../common/auth.js';

// ── State ──
let _searchResults = []; // tracks current search state for reset on close

// ═══════════════════════════════════════════════
// Search / Add Game modal
// ═══════════════════════════════════════════════

export function openAddGameModal(personalGames, onGameAdded, onSelectExisting) {
    const overlay = document.getElementById('searchModal');
    if (!overlay) return;

    _resetSearchModal();
    overlay.classList.add('open');

    document.getElementById('searchInput').focus();

    // Clone buttons to remove any previously attached listeners before re-wiring.
    // Without this, each modal open stacks another listener and search fires multiple times.
    const oldBtn = document.getElementById('searchSubmitBtn');
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.replaceWith(newBtn);

    const oldInput = document.getElementById('searchInput');
    const newInput = oldInput.cloneNode(true);
    oldInput.replaceWith(newInput);

    // Re-focus after clone
    newInput.focus();

    const doSearch = () => _runSearch(personalGames, onGameAdded, onSelectExisting, false);

    newBtn.addEventListener('click', doSearch);
    newInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSearch();
    });
}

export function closeSearchModal() {
    const overlay = document.getElementById('searchModal');
    if (overlay) overlay.classList.remove('open');
    _searchResults = [];
}

function _resetSearchModal() {
    // These elements may have been re-cloned by openAddGameModal — query fresh each time
    const input = document.getElementById('searchInput');
    const resultsEl = document.getElementById('searchResults');
    const statusEl = document.getElementById('searchStatus');
    if (input) input.value = '';
    if (resultsEl) resultsEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '';
    _searchResults = [];
}

async function _runSearch(personalGames, onGameAdded, onSelectExisting, forcePSN) {
    const query = document.getElementById('searchInput').value.trim();
    if (query.length < 2) {
        _setSearchStatus('Enter at least 2 characters.', false);
        return;
    }

    const resultsEl = document.getElementById('searchResults');
    const user = getUser();

    _setSearchStatus('Searching catalog…', false);
    resultsEl.innerHTML = '';

    // ── Step 1: Search local catalog ──
    let catalogResults = [];
    if (!forcePSN) {
        try {
            catalogResults = await searchCatalog(query);
        } catch {
            // Catalog search failed — proceed to PSN
        }
    }

    // ── Step 2: If no catalog results, auto-search PSN ──
    let psnResults = [];
    if (catalogResults.length === 0 || forcePSN) {
        _setSearchStatus('Searching PlayStation Network…', false);
        try {
            psnResults = await workerSearch(query, user ? user.id : null);
        } catch (err) {
            _setSearchStatus(`PSN search failed: ${err.message}`, true);
            return;
        }
    }

    _setSearchStatus('', false);
    _renderSearchResults(
        catalogResults, psnResults, personalGames,
        onGameAdded, onSelectExisting, query
    );
}

function _renderSearchResults(catalogResults, psnResults, personalGames, onGameAdded, onSelectExisting, query) {
    const resultsEl = document.getElementById('searchResults');

    if (catalogResults.length === 0 && psnResults.length === 0) {
        resultsEl.innerHTML = `<div class="search-empty">No results found for "${_escHtml(query)}".</div>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    // ── Catalog results ──
    if (catalogResults.length > 0) {
        const heading = document.createElement('div');
        heading.className = 'search-section-heading';
        heading.textContent = 'In catalog';
        fragment.appendChild(heading);

        for (const result of catalogResults) {
            const inList = personalGames.some(g => g.npCommId === result.npCommId);
            fragment.appendChild(
                _buildResultRow(result, inList ? 'in-list' : 'cached', onGameAdded, onSelectExisting)
            );
        }

        // Option to search PSN anyway
        const psnBtn = document.createElement('button');
        psnBtn.className = 'btn btn-ghost search-psn-anyway';
        psnBtn.textContent = 'Search PlayStation Network instead';
        psnBtn.addEventListener('click', () => {
            _runSearch(personalGames, onGameAdded, onSelectExisting, true);
        });
        fragment.appendChild(psnBtn);
    }

    // ── PSN results ──
    if (psnResults.length > 0) {
        const heading = document.createElement('div');
        heading.className = 'search-section-heading';
        heading.textContent = 'From PlayStation Network';
        fragment.appendChild(heading);

        for (const result of psnResults) {
            const inList = personalGames.some(g => g.npCommId === result.npCommId);
            const inCatalog = catalogResults.some(c => c.npCommId === result.npCommId);
            if (inCatalog) continue;  // already shown above
            fragment.appendChild(
                _buildResultRow(result, inList ? 'in-list' : 'fetch', onGameAdded, onSelectExisting)
            );
        }
    }

    resultsEl.innerHTML = '';
    resultsEl.appendChild(fragment);
}

function _buildResultRow(result, status, onGameAdded, onSelectExisting) {
    // status: 'cached' | 'fetch' | 'in-list'
    const row = document.createElement('div');
    row.className = 'search-result-row';

    const icon = document.createElement('div');
    icon.className = 'search-result-icon';
    if (result.iconUrl) {
        const img = document.createElement('img');
        img.src = result.iconUrl;
        img.alt = '';
        img.className = 'search-result-img';
        img.addEventListener('error', () => {
            img.style.display = 'none';
        });
        icon.appendChild(img);
    } else {
        icon.textContent = '🎮';
    }

    const info = document.createElement('div');
    info.className = 'search-result-info';

    const name = document.createElement('div');
    name.className = 'search-result-name';
    name.textContent = result.name;

    const platform = document.createElement('span');
    platform.className = `search-result-platform platform-${(result.platform || 'ps4').toLowerCase()}`;
    platform.textContent = result.platform || 'PS4';

    info.appendChild(name);
    info.appendChild(platform);

    // Status indicator
    const indicator = document.createElement('div');
    indicator.className = 'search-result-indicator';

    if (status === 'in-list') {
        indicator.innerHTML = '<span class="ind-in-list" title="Already in your list">🔖</span>';
        row.classList.add('result-in-list');
        row.addEventListener('click', () => {
            closeSearchModal();
            onSelectExisting(result.npCommId);
        });
    } else if (status === 'cached') {
        indicator.innerHTML = '<span class="ind-cached" title="Instant add — data already cached">✓</span>';
        row.addEventListener('click', () => _addFromCatalog(result, onGameAdded));
    } else {
        // 'fetch' — needs PSN download
        indicator.innerHTML = '<span class="ind-fetch" title="Will download trophy data from PSN">⬇</span>';
        row.addEventListener('click', () => _addFromPSN(result, onGameAdded));
    }

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(indicator);

    return row;
}

async function _addFromCatalog(result, onGameAdded) {
    // Catalog entry already exists — create personal game entry directly
    _setSearchStatus('Adding game…', false);

    try {
        const catalogEntry = await loadCatalogEntry(result.npCommId);
        if (!catalogEntry) {
            _setSearchStatus('Could not load catalog entry. Try again.', true);
            return;
        }
        const game = createGameEntry(catalogEntry);
        closeSearchModal();
        onGameAdded(game, catalogEntry);
    } catch (err) {
        _setSearchStatus(`Failed to add game: ${err.message}`, true);
    }
}

async function _addFromPSN(result, onGameAdded) {
    const user = getUser();

    // Show feedback immediately — PSN fetch can take 2-3 seconds
    _setSearchStatus('Downloading trophy data from PSN…', false);

    // Disable all result rows immediately on click, before the async work begins
    document.querySelectorAll('.search-result-row').forEach(r => {
        r.style.pointerEvents = 'none';
        r.style.opacity = '0.5';
    });

    try {
        const catalogEntry = await workerFetchTrophies(
            result.npCommId,
            result.platform || 'PS4',
            user ? user.id : null
        );

        // Normalize entry shape
        const entry = {
            npCommId: result.npCommId,
            name: catalogEntry.name || result.name,
            platform: catalogEntry.platform || result.platform,
            iconUrl: catalogEntry.iconUrl || result.iconUrl || null,
            groups: catalogEntry.groups || [],
        };

        await saveCatalogEntry(entry);
        const game = createGameEntry(entry);
        closeSearchModal();
        onGameAdded(game, entry);
    } catch (err) {
        _setSearchStatus(`PSN fetch failed: ${err.message}`, true);
        document.querySelectorAll('.search-result-row').forEach(r => {
            r.style.pointerEvents = '';
            r.style.opacity = '';
        });
    }
}

function _setSearchStatus(msg, isError) {
    const el = document.getElementById('searchStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'search-status error' : 'search-status';
}

// ═══════════════════════════════════════════════
// Game Settings modal
// ═══════════════════════════════════════════════

export async function openGameSettingsModal(game, callbacks) {
    const overlay = document.getElementById('gameSettingsModal');
    if (!overlay) return;

    document.getElementById('settingsGameName').value = game.name;
    document.getElementById('settingsRefreshMsg').textContent = '';
    _resetSettingsDangerZone();

    overlay.classList.add('open');
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

    // Wire reset confirm buttons — clone to clear any previously attached listeners
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

    // Wire remove confirm buttons — clone to clear any previously attached listeners
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

        await saveCatalogEntry(entry);
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

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────

function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}