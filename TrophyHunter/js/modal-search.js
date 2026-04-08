// TrophyHunter/js/modal-search.js
// Search / Add Game modal — 4-step search flow, contribute prompt, result rows.
// No dependency on the game settings modal.

// ═══════════════════════════════════════════════
// Modal — search / add game
// ═══════════════════════════════════════════════

import {
    runSearch,
    runContribute,
    workerResolve,
    workerFetchTrophies,
    saveLookupEntries,
    normaliseTitle,
    ORBIS_SEARCH_URL,
    PROSPERO_SEARCH_URL,
} from './psn.js';
import {saveCatalogEntry, loadCatalogEntry, createGameEntry} from './storage.js';
import {getUser} from '../../common/auth.js';

// ── State ──
let _currentQuery = '';   // preserved so contribute can retry the same query

// ═══════════════════════════════════════════════
// Search / Add Game modal
// ═══════════════════════════════════════════════

export function openAddGameModal(personalGames, onGameAdded, onSelectExisting) {
    const overlay = document.getElementById('searchModal');
    if (!overlay) return;

    _resetSearchModal();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('searchInput').focus();

    // Clone buttons to remove any previously attached listeners before re-wiring.
    const oldBtn = document.getElementById('searchSubmitBtn');
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.replaceWith(newBtn);

    const oldInput = document.getElementById('searchInput');
    const newInput = oldInput.cloneNode(true);
    oldInput.replaceWith(newInput);
    newInput.focus();

    const doSearch = () => _runSearch(personalGames, onGameAdded, onSelectExisting);
    newBtn.addEventListener('click', doSearch);
    newInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSearch();
    });
}

export function closeSearchModal() {
    const overlay = document.getElementById('searchModal');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    _currentQuery = '';
}

function _resetSearchModal() {
    const input = document.getElementById('searchInput');
    const resultsEl = document.getElementById('searchResults');
    const statusEl = document.getElementById('searchStatus');
    if (input) input.value = '';
    if (resultsEl) resultsEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '';
    _currentQuery = '';
}

// ─────────────────────────────────────────────
// Main search runner — drives steps 1–3 via runSearch()
// ─────────────────────────────────────────────

async function _runSearch(personalGames, onGameAdded, onSelectExisting) {
    const query = document.getElementById('searchInput').value.trim();
    if (query.length < 2) {
        _setSearchStatus('Enter at least 2 characters.', false);
        return;
    }

    _currentQuery = query;
    const user = getUser();
    const userId = user ? user.id : null;

    _setSearchStatus('Searching…', false);
    document.getElementById('searchResults').innerHTML = '';

    let searchResult;
    try {
        searchResult = await runSearch(query, userId);
    } catch (err) {
        _setSearchStatus(`Search failed: ${err.message}`, true);
        return;
    }

    _setSearchStatus('', false);

    if (searchResult.needsUsername) {
        // Steps 1–3 all failed — switch to contribute UI
        _showContributePrompt(personalGames, onGameAdded, onSelectExisting);
        return;
    }

    _renderSearchResults(
        searchResult.results,
        searchResult.source,
        personalGames,
        onGameAdded,
        onSelectExisting,
    );
}

// ─────────────────────────────────────────────
// Contribute UI — replaces results area when steps 1–3 fail
// ─────────────────────────────────────────────

function _showContributePrompt(personalGames, onGameAdded, onSelectExisting) {
    const resultsEl = document.getElementById('searchResults');

    resultsEl.innerHTML = `
        <div class="contribute-prompt">
            <div class="contribute-message">
                <strong>${_escHtml(_currentQuery)}</strong> isn't in our catalog yet.
                A PSN username from someone who has played this game can help us find it.
            </div>
            <div class="contribute-input-row">
                <input type="text" id="contributeInput"
                    placeholder="PSN username"
                    autocomplete="off" spellcheck="false"
                    maxlength="16">
                <button class="btn btn-primary" id="contributeSubmitBtn">Look Up</button>
            </div>
            <div class="contribute-status" id="contributeStatus"></div>
            <div class="contribute-info">
                <button class="contribute-info-toggle" id="contributeInfoToggle"
                    aria-expanded="false" aria-controls="contributeInfoBody">
                    <span class="contribute-info-arrow" aria-hidden="true">▶</span>
                    What is this?
                </button>
                <div class="contribute-info-body" id="contributeInfoBody" hidden>
                    <div class="contribute-info-section">
                        <div class="contribute-info-heading">Why are we asking?</div>
                        <p>PlayStation's trophy catalog isn't publicly searchable by game name.
                        To find a game's trophy list, we need to look it up through a player
                        who has already played it. Once found, the data is cached for everyone.</p>
                    </div>
                    <div class="contribute-info-section">
                        <div class="contribute-info-heading">Whose username do I enter?</div>
                        <p>Yours, if you've played the game. Or any PSN player known to have
                        played it — <a href="https://psnprofiles.com" target="_blank"
                        rel="noopener noreferrer">PSNProfiles.com</a> is a good place to
                        find prolific players for any title.</p>
                    </div>
                    <div class="contribute-info-section">
                        <div class="contribute-info-heading">What is stored?</div>
                        <p>Only the game title and its PlayStation ID (<em>NPWR…</em>).
                        No usernames, no trophy progress, no account details — nothing
                        personal is ever saved. The lookup is anonymous and one-way.</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    const input = document.getElementById('contributeInput');
    const btn = document.getElementById('contributeSubmitBtn');
    const toggle = document.getElementById('contributeInfoToggle');
    const infoBody = document.getElementById('contributeInfoBody');
    const arrow = toggle.querySelector('.contribute-info-arrow');

    input.focus();

    // Accordion toggle
    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        infoBody.hidden = expanded;
        arrow.textContent = expanded ? '▶' : '▼';
    });

    const doContribute = () => _runContribute(personalGames, onGameAdded, onSelectExisting);
    btn.addEventListener('click', doContribute);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doContribute();
    });
}

async function _runContribute(personalGames, onGameAdded, onSelectExisting) {
    const username = (document.getElementById('contributeInput')?.value || '').trim();
    if (!username) return;

    const user = getUser();
    const userId = user ? user.id : null;

    _setContributeStatus('Fetching library…', false);
    document.getElementById('contributeSubmitBtn').disabled = true;

    let results;
    try {
        results = await runContribute(_currentQuery, username, userId);
    } catch (err) {
        _setContributeStatus(err.message, true);
        document.getElementById('contributeSubmitBtn').disabled = false;
        return;
    }

    if (results.length === 0) {
        _setContributeStatus(
            `${_escHtml(username)} hasn't played "${_escHtml(_currentQuery)}" either. Try a different username.`,
            true
        );
        document.getElementById('contributeSubmitBtn').disabled = false;
        return;
    }

    // We have results — switch to the normal results view
    _setSearchStatus('', false);
    _renderSearchResults(results, 'contribute', personalGames, onGameAdded, onSelectExisting);
}

function _setContributeStatus(msg, isError) {
    const el = document.getElementById('contributeStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'contribute-status error' : 'contribute-status';
}

// ─────────────────────────────────────────────
// Results renderer — shared by all sources
// ─────────────────────────────────────────────

function _renderSearchResults(results, source, personalGames, onGameAdded, onSelectExisting) {
    const resultsEl = document.getElementById('searchResults');

    if (results.length === 0) {
        resultsEl.innerHTML = `<div class="search-empty">No results found for "${_escHtml(_currentQuery)}".</div>`;
        return;
    }

    const sourceLabel = {
        catalog: 'In catalog',
        lookup: 'From PlayStation catalog',
        resolve: 'From PlayStation catalog',
        contribute: 'From PlayStation catalog',
    }[source] || 'Results';

    const fragment = document.createDocumentFragment();

    const heading = document.createElement('div');
    heading.className = 'search-section-heading';
    heading.textContent = sourceLabel;
    fragment.appendChild(heading);

    for (const result of results) {
        const inList = personalGames.some(g => g.npCommId === result.npCommId);

        // Catalog source: data is already cached → instant add
        // All other sources: need a /trophies fetch on add
        const status = inList
            ? 'in-list'
            : source === 'catalog' ? 'cached' : 'fetch';

        fragment.appendChild(
            _buildResultRow(result, status, onGameAdded, onSelectExisting)
        );
    }

    // For catalog results, offer a PSN search override
    if (source === 'catalog') {
        const psnBtn = document.createElement('button');
        psnBtn.className = 'btn btn-ghost search-psn-anyway';
        psnBtn.textContent = 'Search PlayStation Network instead';
        psnBtn.addEventListener('click', () => {
            _forceStepThree(personalGames, onGameAdded, onSelectExisting);
        });
        fragment.appendChild(psnBtn);
    }

    resultsEl.innerHTML = '';
    resultsEl.appendChild(fragment);
}

// Force-bypasses the catalog and lookup table, going straight to patch sites + /resolve.
// Used by the "Search PlayStation Network instead" button.

async function _forceStepThree(personalGames, onGameAdded, onSelectExisting) {
    const user = getUser();
    const userId = user ? user.id : null;

    _setSearchStatus('Searching PlayStation Network…', false);
    document.getElementById('searchResults').innerHTML = '';

    const query = _currentQuery;
    const encoded = encodeURIComponent(query);
    const titleIds = new Set();

    try {
        const [ps4, ps5] = await Promise.all([
            fetch(`${ORBIS_SEARCH_URL}?term=${encoded}`)
                .then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`${PROSPERO_SEARCH_URL}?term=${encoded}`)
                .then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        for (const r of (ps4?.results || [])) {
            if (r.titleid) titleIds.add(`${r.titleid}_00`);
        }
        for (const r of (ps5?.results || [])) {
            if (r.titleid) titleIds.add(`${r.titleid}_00`);
        }
    } catch {
        // fall through to empty
    }

    if (titleIds.size === 0) {
        _setSearchStatus('', false);
        _showContributePrompt(personalGames, onGameAdded, onSelectExisting);
        return;
    }

    try {
        const {mappings} = await workerResolve([...titleIds], userId);
        if (mappings && mappings.length > 0) {
            await saveLookupEntries(mappings);
            const seen = new Set();
            const results = [];
            for (const m of mappings) {
                if (seen.has(m.npCommId)) continue;
                seen.add(m.npCommId);
                results.push({
                    npCommId: m.npCommId,
                    name: normaliseTitle(m.titleName) || normaliseTitle(query),
                    platform: m.npTitleId?.startsWith('PPSA') ? 'PS5' : 'PS4',
                    iconUrl: null,
                });
            }
            _setSearchStatus('', false);
            _renderSearchResults(results, 'resolve', personalGames, onGameAdded, onSelectExisting);
            return;
        }
    } catch {
        // fall through
    }

    _setSearchStatus('', false);
    _showContributePrompt(personalGames, onGameAdded, onSelectExisting);
}

// ─────────────────────────────────────────────
// Result row builder
// ─────────────────────────────────────────────

function _buildResultRow(result, status, onGameAdded, onSelectExisting) {
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
        indicator.innerHTML = '<span class="ind-fetch" title="Will download trophy data from PSN">⬇</span>';
        row.addEventListener('click', () => _addFromPSN(result, onGameAdded));
    }

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(indicator);

    return row;
}

// ─────────────────────────────────────────────
// Add from catalog (instant — data already cached in Supabase)
// ─────────────────────────────────────────────

async function _addFromCatalog(result, onGameAdded) {
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

// ─────────────────────────────────────────────
// Add from PSN (needs /trophies fetch)
// ─────────────────────────────────────────────

async function _addFromPSN(result, onGameAdded) {
    const user = getUser();
    const userId = user ? user.id : null;

    _setSearchStatus('Downloading trophy data from PSN…', false);

    document.querySelectorAll('.search-result-row').forEach(r => {
        r.style.pointerEvents = 'none';
        r.style.opacity = '0.5';
    });

    try {
        const catalogEntry = await workerFetchTrophies(
            result.npCommId,
            result.platform || 'PS4',
            userId
        );

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

// ─────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────

function _setSearchStatus(msg, isError) {
    const el = document.getElementById('searchStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'search-status error' : 'search-status';
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