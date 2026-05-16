// TrophyHunter/js/modal-search.js
// Search / Add Game modal — 4-step search flow, contribute prompt, result rows.
// No dependency on the game settings modal.
//
// Search flow:
//   Step 1: searchCatalog + searchLookupTable in parallel. Catalog results first
//           (checkmark), lookup results after (download arrow), ranked, top 10.
//           If empty → auto-proceed to step 2. If results → show + "Search
//           PlayStation" button.
//   Step 2: Orbis/Prospero → /resolve. Results deduped against step 1 seen set.
//           If empty → auto-proceed to step 3. If results → show + "Search
//           deeper" button + "← Back to step 1" link.
//   Step 3: Username prompt. Contribute harvests library, enriches lookup.
//           Re-runs searchLookupTable, deduped against steps 1+2 seen set.
//           "← Back to step 2" link (or step 1 if step 2 had nothing).
//           Username input stays, can resubmit with different username.
//
// Navigation: going back re-runs the query fresh. Seen set trims to match
// the step you're returning to.

import {
    workerResolve,
    workerFetchTrophies,
    ORBIS_SEARCH_URL,
    PROSPERO_SEARCH_URL,
} from './psn.js';
import {
    saveCatalogEntry,
    loadCatalogEntry,
    createGameEntry,
    normaliseTitle,
    searchCatalog,
    searchLookupTable,
} from './storage.js';
import {getUser} from '../../common/auth.js';
import {escHtml, openModal as trapOpen, closeModal as trapClose} from '../../common/utils.js';

// ── State ──────────────────────────────────────────────────────────────────

let _currentQuery = '';
let _step1SeenIds = new Set();  // npCommIds from step 1
let _step2SeenIds = new Set();  // npCommIds from steps 1+2

// ── Icon URL sanitisation ──────────────────────────────────────────────────

function _safeIconUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url;
    } catch {
    }
    return null;
}

// ── Search / Add Game modal ────────────────────────────────────────────────

export function openAddGameModal(personalIndex, onGameAdded, onSelectExisting) {
    const overlay = document.getElementById('searchModal');
    if (!overlay) return;

    _resetSearchModal();
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    trapOpen(overlay, document.activeElement);

    const oldBtn = document.getElementById('searchSubmitBtn');
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.replaceWith(newBtn);

    const oldInput = document.getElementById('searchInput');
    const newInput = oldInput.cloneNode(true);
    oldInput.replaceWith(newInput);
    newInput.focus();

    const doSearch = () => _runStep1(personalIndex, onGameAdded, onSelectExisting);
    newBtn.addEventListener('click', doSearch);
    newInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSearch();
    });
}

export function closeSearchModal() {
    const overlay = document.getElementById('searchModal');
    if (overlay) {
        overlay.classList.remove('open');
        trapClose(overlay);
    }
    document.body.style.overflow = '';
    _currentQuery = '';
    _step1SeenIds = new Set();
    _step2SeenIds = new Set();
}

function _resetSearchModal() {
    const input = document.getElementById('searchInput');
    const resultsEl = document.getElementById('searchResults');
    const statusEl = document.getElementById('searchStatus');
    if (input) input.value = '';
    if (resultsEl) resultsEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '';
    _currentQuery = '';
    _step1SeenIds = new Set();
    _step2SeenIds = new Set();
}

// ── Step 1: catalog + lookup in parallel ──────────────────────────────────

async function _runStep1(personalIndex, onGameAdded, onSelectExisting) {
    const query = document.getElementById('searchInput').value.trim();
    if (query.length < 2) {
        _setSearchStatus('Enter at least 2 characters.', false);
        return;
    }

    _currentQuery = query;
    _step1SeenIds = new Set();
    _step2SeenIds = new Set();

    _setSearchStatus('Searching…', false);
    document.getElementById('searchResults').innerHTML = '';

    const user = getUser();
    const userId = user ? user.id : null;

    try {
        const [catalogResults, lookupResults] = await Promise.all([
            searchCatalog(query),
            searchLookupTable(query),
        ]);

        // Dedupe lookup results against catalog results
        const catalogIds = new Set(catalogResults.map(r => r.npCommId));
        const dedupedLookup = lookupResults.filter(r => !catalogIds.has(r.npCommId));

        // Build unified result list: catalog first, lookup after
        const unified = [
            ...catalogResults.map(r => ({...r, _source: 'catalog'})),
            ...dedupedLookup.map(r => ({
                npCommId: r.npCommId,
                name: r.titleName,
                platform: r.platform ? r.platform : (r.npServiceName === 'trophy2' ? 'PS5' : 'PS4'),
                iconUrl: null,
                _source: 'lookup',
            })),
        ].slice(0, 10);

        // Store seen IDs for later deduplication
        unified.forEach(r => _step1SeenIds.add(r.npCommId));
        _step2SeenIds = new Set(_step1SeenIds);

        _setSearchStatus('', false);

        if (unified.length === 0) {
            // Auto-proceed to step 2
            _runStep2(personalIndex, onGameAdded, onSelectExisting);
            return;
        }

        _renderStep1Results(unified, personalIndex, onGameAdded, onSelectExisting);
    } catch (err) {
        _setSearchStatus(`Search failed: ${err.message}`, true);
    }
}

function _renderStep1Results(results, personalIndex, onGameAdded, onSelectExisting) {
    const resultsEl = document.getElementById('searchResults');
    const fragment = document.createDocumentFragment();

    const heading = document.createElement('div');
    heading.className = 'search-section-heading';
    heading.textContent = 'In catalog';
    fragment.appendChild(heading);

    for (const result of results) {
        const inList = personalIndex.some(e => e.npCommId === result.npCommId);
        const status = inList ? 'in-list' : result._source === 'catalog' ? 'cached' : 'fetch';
        fragment.appendChild(_buildResultRow(result, status, onGameAdded, onSelectExisting));
    }

    const deeperBtn = document.createElement('button');
    deeperBtn.className = 'btn btn-ghost search-psn-anyway';
    deeperBtn.textContent = 'Search PlayStation';
    deeperBtn.addEventListener('click', () => _runStep2(personalIndex, onGameAdded, onSelectExisting));
    fragment.appendChild(deeperBtn);

    resultsEl.innerHTML = '';
    resultsEl.appendChild(fragment);
}

// ── Step 2: Orbis/Prospero ─────────────────────────────────────────────────

async function _runStep2(personalIndex, onGameAdded, onSelectExisting) {
    _setSearchStatus('Searching PlayStation…', false);
    document.getElementById('searchResults').innerHTML = '';

    const user = getUser();
    const userId = user ? user.id : null;
    const encoded = encodeURIComponent(_currentQuery);
    const titleIds = new Set();

    try {
        const [ps4, ps5] = await Promise.all([
            fetch(`${ORBIS_SEARCH_URL}?term=${encoded}`).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`${PROSPERO_SEARCH_URL}?term=${encoded}`).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        for (const r of (ps4?.results || [])) {
            if (r.titleid) titleIds.add(`${r.titleid}_00`);
        }
        for (const r of (ps5?.results || [])) {
            if (r.titleid) titleIds.add(`${r.titleid}_00`);
        }
    } catch {
    }

    if (titleIds.size === 0) {
        // Auto-proceed to step 3
        _runStep3(personalIndex, onGameAdded, onSelectExisting);
        return;
    }

    try {
        const {mappings} = await workerResolve([...titleIds], userId);
        if (mappings && mappings.length > 0) {
            const seen = new Set();
            const results = [];
            for (const m of mappings) {
                if (seen.has(m.npCommId)) continue;
                if (_step1SeenIds.has(m.npCommId)) continue;  // dedupe against step 1
                seen.add(m.npCommId);
                results.push({
                    npCommId: m.npCommId,
                    name: normaliseTitle(m.titleName) || normaliseTitle(_currentQuery),
                    platform: m.npTitleId?.startsWith('PPSA') ? 'PS5' : 'PS4',
                    iconUrl: null,
                });
            }

            results.forEach(r => _step2SeenIds.add(r.npCommId));

            _setSearchStatus('', false);

            if (results.length === 0) {
                // All results were dupes of step 1 — auto-proceed to step 3
                _runStep3(personalIndex, onGameAdded, onSelectExisting);
                return;
            }

            _renderStep2Results(results, personalIndex, onGameAdded, onSelectExisting);
            return;
        }
    } catch {
    }

    // Auto-proceed to step 3
    _runStep3(personalIndex, onGameAdded, onSelectExisting);
}

function _renderStep2Results(results, personalIndex, onGameAdded, onSelectExisting) {
    const resultsEl = document.getElementById('searchResults');
    const fragment = document.createDocumentFragment();

    const heading = document.createElement('div');
    heading.className = 'search-section-heading';
    heading.textContent = 'From PlayStation';
    fragment.appendChild(heading);

    for (const result of results) {
        const inList = personalIndex.some(e => e.npCommId === result.npCommId);
        const status = inList ? 'in-list' : 'fetch';
        fragment.appendChild(_buildResultRow(result, status, onGameAdded, onSelectExisting));
    }

    const deeperBtn = document.createElement('button');
    deeperBtn.className = 'btn btn-ghost search-psn-anyway';
    deeperBtn.textContent = 'Search deeper';
    deeperBtn.addEventListener('click', () => _runStep3(personalIndex, onGameAdded, onSelectExisting));
    fragment.appendChild(deeperBtn);

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-ghost search-back-btn';
    backBtn.textContent = '← Back to catalog results';
    backBtn.addEventListener('click', () => _runStep1(personalIndex, onGameAdded, onSelectExisting));
    fragment.appendChild(backBtn);

    resultsEl.innerHTML = '';
    resultsEl.appendChild(fragment);
}

// ── Step 3: contribute / username prompt ───────────────────────────────────

function _runStep3(personalIndex, onGameAdded, onSelectExisting) {
    _setSearchStatus('', false);
    _showContributePrompt(personalIndex, onGameAdded, onSelectExisting);
}

function _showContributePrompt(personalIndex, onGameAdded, onSelectExisting) {
    const resultsEl = document.getElementById('searchResults');

    resultsEl.innerHTML = `
        <div class="contribute-prompt">
            <div class="contribute-message">
                <strong>${escHtml(_currentQuery)}</strong> isn't in our catalog yet.
                A PlayStation username from someone who has played this game can help us find it.
            </div>
            <div class="contribute-input-row">
                <input type="text" id="contributeInput"
                    placeholder="PlayStation username"
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
                        <p>Yours, if you've played the game. Or any player known to have
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

    toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!expanded));
        infoBody.hidden = expanded;
        arrow.textContent = expanded ? '▶' : '▼';
    });

    const doContribute = () => _submitContribute(personalIndex, onGameAdded, onSelectExisting);
    btn.addEventListener('click', doContribute);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doContribute();
    });

    // Back button — goes to step 2 if it had results, otherwise step 1
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-ghost search-back-btn';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => {
        if (_step2SeenIds.size > _step1SeenIds.size) {
            // Step 2 had results — go back to step 2
            _step2SeenIds = new Set(_step1SeenIds);
            _runStep2(personalIndex, onGameAdded, onSelectExisting);
        } else {
            // Step 2 had nothing — go back to step 1
            _runStep1(personalIndex, onGameAdded, onSelectExisting);
        }
    });
    document.getElementById('searchResults').appendChild(backBtn);
}

async function _submitContribute(personalIndex, onGameAdded, onSelectExisting) {
    const username = (document.getElementById('contributeInput')?.value || '').trim();
    if (!username) return;

    const user = getUser();
    const userId = user ? user.id : null;

    _setContributeStatus('Fetching library…', false);
    document.getElementById('contributeSubmitBtn').disabled = true;

    try {
        await workerContribute(username, userId);
    } catch (err) {
        _setContributeStatus(`Could not fetch ${escHtml(username)}'s library: ${err.message}`, true);
        document.getElementById('contributeSubmitBtn').disabled = false;
        return;
    }

    // Re-run lookup, deduped against everything seen so far
    let lookupResults;
    try {
        const raw = await searchLookupTable(_currentQuery);
        lookupResults = raw.filter(r => !_step2SeenIds.has(r.npCommId));
    } catch {
        lookupResults = [];
    }

    document.getElementById('contributeSubmitBtn').disabled = false;

    if (lookupResults.length === 0) {
        _setContributeStatus(
            `${escHtml(username)} hasn't played "${escHtml(_currentQuery)}" either. Try a different username.`,
            true
        );
        return;
    }

    const results = lookupResults.map(r => ({
        npCommId: r.npCommId,
        name: r.titleName,
        platform: r.platform ? r.platform : (r.npServiceName === 'trophy2' ? 'PS5' : 'PS4'),
        iconUrl: null,
    }));

    _setSearchStatus('', false);
    _renderStep3Results(results, personalIndex, onGameAdded, onSelectExisting);
}

function _renderStep3Results(results, personalIndex, onGameAdded, onSelectExisting) {
    const resultsEl = document.getElementById('searchResults');
    const fragment = document.createDocumentFragment();

    const heading = document.createElement('div');
    heading.className = 'search-section-heading';
    heading.textContent = 'From PlayStation';
    fragment.appendChild(heading);

    for (const result of results) {
        const inList = personalIndex.some(e => e.npCommId === result.npCommId);
        const status = inList ? 'in-list' : 'fetch';
        fragment.appendChild(_buildResultRow(result, status, onGameAdded, onSelectExisting));
    }

    // Try again with different username
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-ghost search-psn-anyway';
    retryBtn.textContent = 'Try a different username';
    retryBtn.addEventListener('click', () => _runStep3(personalIndex, onGameAdded, onSelectExisting));
    fragment.appendChild(retryBtn);

    // Back buttons
    if (_step2SeenIds.size > _step1SeenIds.size) {
        const backStep2Btn = document.createElement('button');
        backStep2Btn.className = 'btn btn-ghost search-back-btn';
        backStep2Btn.textContent = '← Back to PlayStation results';
        backStep2Btn.addEventListener('click', () => {
            _step2SeenIds = new Set(_step1SeenIds);
            _runStep2(personalIndex, onGameAdded, onSelectExisting);
        });
        fragment.appendChild(backStep2Btn);
    }

    if (_step1SeenIds.size > 0) {
        const backStep1Btn = document.createElement('button');
        backStep1Btn.className = 'btn btn-ghost search-back-btn';
        backStep1Btn.textContent = '← Back to catalog results';
        backStep1Btn.addEventListener('click', () => _runStep1(personalIndex, onGameAdded, onSelectExisting));
        fragment.appendChild(backStep1Btn);
    }

    resultsEl.innerHTML = '';
    resultsEl.appendChild(fragment);
}

// ── Result row builder ─────────────────────────────────────────────────────

function _buildResultRow(result, status, onGameAdded, onSelectExisting) {
    const row = document.createElement('div');
    row.className = 'search-result-row';

    const icon = document.createElement('div');
    icon.className = 'search-result-icon';

    const safeIconUrl = _safeIconUrl(result.iconUrl);
    if (safeIconUrl) {
        const img = document.createElement('img');
        img.src = safeIconUrl;
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
        indicator.innerHTML = '<span class="ind-fetch" title="Will download trophy data from PlayStation">⬇</span>';
        row.addEventListener('click', () => _addFromPlayStation(result, onGameAdded));
    }

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(indicator);
    return row;
}

// ── Add from catalog ───────────────────────────────────────────────────────

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

// ── Add from PlayStation ───────────────────────────────────────────────────

async function _addFromPlayStation(result, onGameAdded) {
    const user = getUser();
    const userId = user ? user.id : null;

    _setSearchStatus('Downloading trophy data from PlayStation…', false);
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

        saveCatalogEntry(entry);
        const game = createGameEntry(entry);
        closeSearchModal();
        onGameAdded(game, entry);
    } catch (err) {
        _setSearchStatus(`Failed to download trophy data: ${err.message}`, true);
        document.querySelectorAll('.search-result-row').forEach(r => {
            r.style.pointerEvents = '';
            r.style.opacity = '';
        });
    }
}

// ── Status helpers ─────────────────────────────────────────────────────────

function _setSearchStatus(msg, isError) {
    const el = document.getElementById('searchStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'search-status error' : 'search-status';
}

function _setContributeStatus(msg, isError) {
    const el = document.getElementById('contributeStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? 'contribute-status error' : 'contribute-status';
}