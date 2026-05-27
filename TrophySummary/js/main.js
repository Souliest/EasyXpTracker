// TrophySummary/js/main.js
// Entry point: holds all module-level state, drives refresh logic and re-render,
// exposes window globals for inline HTML handlers, runs init IIFE.
//
// State: a single _profile blob (or null). No game selector, no index.
// All interaction handlers read/write _profile directly, then call saveData + re-render.

import {
    loadData,
    saveData,
    isRateLimited,
    getRateLimitRemaining,
    setRateLimit,
} from './storage.js';
import {workerFetchProfile} from './psn.js';
import {renderProfileCard, renderFilterBar, renderGameList, renderEmptyState} from './render.js';
import {openSettingsModal, openMissingGamePrompt} from './modal.js';
import {initAuth} from '../../common/auth-ui.js';
import {getUser} from '../../common/auth.js';
import {supabase} from '../../common/supabase.js';
import {subscribeToProfileChanges, unsubscribeFromProfileChanges, REALTIME_ENABLED} from './storage.js';

// ── Module-level state ────────────────────────────────────────────────────────

let _profile = null;       // full profile blob or null
let _refreshing = false;   // global refresh in progress
let _filtersOpen = false;  // session-only — not persisted

// ── Helpers ───────────────────────────────────────────────────────────────────

function _doRender() {
    const content = document.getElementById('mainContent');
    if (!content) return;

    if (!_profile || !_profile.psUsername) {
        content.innerHTML = renderEmptyState();
        return;
    }

    content.innerHTML = [
        renderProfileCard(_profile, _refreshing),
        renderFilterBar(_profile, _filtersOpen),
        renderGameList(_profile),
    ].join('');

    _wireProfileCard();
    _wireFilterBar();
    _wireGameCards();
}

// ── Profile card wiring ───────────────────────────────────────────────────────

function _wireProfileCard() {
    const refreshBtn = document.getElementById('ptsd-refresh-btn');
    const settingsBtn = document.getElementById('ptsd-settings-btn');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => _handleGlobalRefreshClick());
    }
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => _openSettings());
    }
}

function _handleGlobalRefreshClick() {
    if (_refreshing) return;

    const limited = isRateLimited('global');
    if (limited) {
        _showRateLimitFeedback();
        return;
    }

    _startGlobalRefresh();
}

// Shows "Refresh available in Xm" inline for 3 seconds when the button is
// tapped while rate-limited. Replaces the stale marker label during the 3s
// window, then restores it.
function _showRateLimitFeedback() {
    const staleEl = document.getElementById('ptsd-stale-label');
    if (!staleEl) return;

    const secs = getRateLimitRemaining('global');
    const mins = Math.ceil(secs / 60);
    const original = staleEl.textContent;
    const wasHidden = staleEl.style.display === 'none';

    staleEl.textContent = `Refresh available in ${mins}m`;
    staleEl.style.display = '';
    staleEl.classList.add('ptsd-rate-limit-msg');

    setTimeout(() => {
        staleEl.textContent = original;
        staleEl.classList.remove('ptsd-rate-limit-msg');
        if (wasHidden) staleEl.style.display = 'none';
    }, 3000);
}

// ── Filter bar wiring ─────────────────────────────────────────────────────────

function _wireFilterBar() {
    if (!_profile) return;

    // Toggle open/close
    const toggleBtn = document.getElementById('ptsd-filter-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', e => {
            e.stopPropagation();
            _filtersOpen = !_filtersOpen;
            const panel = document.getElementById('ptsd-filter-panel');
            const arrow = toggleBtn.querySelector('.ptsd-filter-arrow');
            if (panel) panel.classList.toggle('ptsd-filter-panel--open', _filtersOpen);
            if (arrow) arrow.textContent = _filtersOpen ? '▼' : '▶';
            toggleBtn.setAttribute('aria-expanded', String(_filtersOpen));
        });
    }

    // Stop clicks inside the panel from bubbling to the document close handler
    const panel = document.getElementById('ptsd-filter-panel');
    if (panel) {
        panel.addEventListener('click', e => e.stopPropagation());
    }

    // Outside click closes the panel
    const _outsideClick = () => {
        if (!_filtersOpen) return;
        _filtersOpen = false;
        const p = document.getElementById('ptsd-filter-panel');
        const t = document.getElementById('ptsd-filter-toggle');
        const a = t && t.querySelector('.ptsd-filter-arrow');
        if (p) p.classList.remove('ptsd-filter-panel--open');
        if (a) a.textContent = '▶';
        if (t) t.setAttribute('aria-expanded', 'false');
    };
    document.addEventListener('click', _outsideClick);

    // Sort dropdown
    const sortSel = document.getElementById('ptsd-sort-select');
    if (sortSel) {
        sortSel.addEventListener('change', () => _updateViewState({sort: sortSel.value}));
    }

    // Completion floor pills
    document.querySelectorAll('[data-min-completion]').forEach(btn => {
        btn.addEventListener('click', () => {
            _updateViewState({minCompletion: btn.dataset.minCompletion});
        });
    });

    // Recency pills
    document.querySelectorAll('[data-recency]').forEach(btn => {
        btn.addEventListener('click', () => {
            _updateViewState({recency: btn.dataset.recency});
        });
    });

    // Platform toggles
    document.querySelectorAll('[data-platform]').forEach(btn => {
        btn.addEventListener('click', () => {
            const plat = btn.dataset.platform;
            const current = _profile.viewState.platformFilter || {};
            const games = _profile.games || [];
            const present = ['ps3', 'ps4', 'ps5', 'vita']
                .filter(p => games.some(g => g.platform.toLowerCase() === p));
            const currentlyOn = present.filter(p => current[p] !== false);

            // If this is the last active platform, reset all to on
            if (currentlyOn.length === 1 && currentlyOn[0] === plat) {
                const reset = {};
                present.forEach(p => reset[p] = true);
                _updateViewState({platformFilter: reset});
            } else {
                _updateViewState({
                    platformFilter: {...current, [plat]: !current[plat]},
                });
            }
        });
    });

    // Visibility toggles
    const noTrophiesBtn = document.getElementById('ptsd-toggle-no-trophies');
    if (noTrophiesBtn) {
        noTrophiesBtn.addEventListener('click', () => {
            _updateViewState({showNoTrophies: !_profile.viewState.showNoTrophies});
        });
    }

    const platinumBtn = document.getElementById('ptsd-toggle-platinum');
    if (platinumBtn) {
        platinumBtn.addEventListener('click', () => {
            _updateViewState({showPlatinum: !_profile.viewState.showPlatinum});
        });
    }

    const pct100Btn = document.getElementById('ptsd-toggle-pct100');
    if (pct100Btn) {
        pct100Btn.addEventListener('click', () => {
            _updateViewState({showPct100: !_profile.viewState.showPct100});
        });
    }
}

function _updateViewState(patch) {
    if (!_profile) return;
    _profile = {
        ..._profile,
        viewState: {..._profile.viewState, ...patch},
    };
    saveData(_profile);  // fire-and-forget
    _doRender();
}

// ── Game card wiring (stub — wired fully in Steps 5–7) ───────────────────────

function _wireGameCards() {
    // Placeholder — game card interactions wired in Step 5.
}

// ── Global refresh ─────────────────────────────────────────────────────────────

async function _startGlobalRefresh() {
    if (!_profile || !_profile.psUsername) return;
    if (_refreshing) return;

    _refreshing = true;
    _doRender();   // re-render to show loading state on the button

    try {
        const result = await workerFetchProfile(_profile.psUsername);
        await _applyGlobalRefresh(result);
    } catch (err) {
        if (err.rateLimited) {
            setRateLimit('global', err.retryAfter);
        }
        // Refresh failed — re-render to restore normal state.
    } finally {
        _refreshing = false;
        _doRender();
    }
}

// Merges the worker's /profile response into the current blob.
// Runs the missing game prompt, then saves and re-renders.
async function _applyGlobalRefresh(result) {
    const now = new Date().toISOString();
    const existing = _profile || {};

    // Build a map of existing games keyed by npCommId for O(1) lookup.
    const existingByCommId = {};
    for (const g of (existing.games || [])) {
        existingByCommId[g.npCommId] = g;
    }

    const returnedCommIds = new Set(result.games.map(g => g.npCommId));

    // 1. Process each game returned by the worker.
    const mergedGames = result.games.map(remoteGame => {
        const prev = existingByCommId[remoteGame.npCommId];

        if (prev) {
            // Existing game — merge, preserve client-only fields.
            return {
                ...prev,
                name: remoteGame.name,
                platform: remoteGame.platform,
                thumbnailUrl: remoteGame.thumbnailUrl,
                hasTrophyGroups: remoteGame.hasTrophyGroups,
                lastTrophyEarned: remoteGame.lastTrophyEarned,
                pct: remoteGame.pct,
                tierEarned: remoteGame.tierEarned,
                tierTotal: remoteGame.tierTotal,
                // Preserved: pinned, hiddenOnPs, groups (cached group data survives), id
                lastLocalRefresh: null,  // global refresh supersedes per-game
            };
        } else {
            // New game — create fresh blob.
            return {
                id: crypto.randomUUID(),
                npCommId: remoteGame.npCommId,
                name: remoteGame.name,
                platform: remoteGame.platform,
                thumbnailUrl: remoteGame.thumbnailUrl,
                hasTrophyGroups: remoteGame.hasTrophyGroups,
                lastTrophyEarned: remoteGame.lastTrophyEarned,
                pinned: false,
                hiddenOnPs: false,
                tierEarned: remoteGame.tierEarned,
                tierTotal: remoteGame.tierTotal,
                tierEarnedAtLastGlobalRefresh: {...remoteGame.tierEarned},
                pct: remoteGame.pct,
                lastLocalRefresh: null,
                groups: null,
                last_modified: now,
            };
        }
    });

    // 2. Collect missing games (in blob but absent from PS response).
    const missingQueue = [];
    for (const prev of (existing.games || [])) {
        if (returnedCommIds.has(prev.npCommId)) continue;
        if (prev.hiddenOnPs) {
            mergedGames.push(prev);
        } else {
            missingQueue.push(prev);
        }
    }

    // 3. Run the missing game prompt if needed (mutates mergedGames in-place).
    if (missingQueue.length > 0) {
        await _runMissingGamePrompt(missingQueue, mergedGames);
    }

    // 4. Freeze tierEarnedAtLastGlobalRefresh on every game.
    for (const g of mergedGames) {
        g.tierEarnedAtLastGlobalRefresh = {...g.tierEarned};
    }

    // 5. Build the updated profile blob.
    _profile = {
        ...(existing.viewState ? existing : {}),
        psUsername: result.psUsername,
        avatarUrl: result.avatarUrl,
        trophyLevel: result.trophyLevel,
        levelProgress: result.levelProgress,
        tierEarned: result.tierEarned,
        tierTotal: result.tierTotal,
        tierEarnedAtLastGlobalRefresh: {...result.tierEarned},
        lastFullRefresh: now,
        viewState: existing.viewState || _defaultViewState(),
        games: mergedGames,
    };

    // 6. Save.
    await saveData(_profile);
}

function _defaultViewState() {
    return {
        sort: 'recent',
        minCompletion: 'any',
        recency: 'all',
        showNoTrophies: true,
        showPlatinum: true,
        showPct100: true,
        platformFilter: {},
    };
}

// ── Missing game prompt ───────────────────────────────────────────────────────

async function _runMissingGamePrompt(queue, mergedGames) {
    return new Promise(resolve => {
        openMissingGamePrompt(queue, {
            onKeep: (game, doAll) => {
                const targets = doAll ? queue : [game];
                for (const g of targets) {
                    mergedGames.push({...g, hiddenOnPs: true});
                }
                if (doAll) resolve();
            },
            onRemove: (game, doAll) => {
                if (doAll) resolve();
            },
            onDone: resolve,
        });
    });
}

// ── Settings ──────────────────────────────────────────────────────────────────

function _openSettings() {
    openSettingsModal(_profile, {
        onUsernameChange: async (newUsername) => {
            if (!_profile) {
                _profile = {
                    psUsername: newUsername,
                    viewState: _defaultViewState(),
                    games: [],
                };
            } else {
                _profile = {..._profile, psUsername: newUsername};
            }
            await saveData(_profile);
            _doRender();
            _startGlobalRefresh();
        },
        onHiddenGamesChange: async (updatedProfile) => {
            _profile = updatedProfile;
            await saveData(_profile);
            _doRender();
        },
    });
}

// ── First-run setup ───────────────────────────────────────────────────────────

function _promptFirstRun() {
    openSettingsModal(null, {
        onUsernameChange: async (newUsername) => {
            _profile = {
                psUsername: newUsername,
                avatarUrl: null,
                trophyLevel: 0,
                levelProgress: 0,
                tierEarned: {platinum: 0, gold: 0, silver: 0, bronze: 0},
                tierTotal: {platinum: 0, gold: 0, silver: 0, bronze: 0},
                tierEarnedAtLastGlobalRefresh: {platinum: 0, gold: 0, silver: 0, bronze: 0},
                lastFullRefresh: null,
                viewState: _defaultViewState(),
                games: [],
            };
            await saveData(_profile);
            _doRender();
            _startGlobalRefresh();
        },
        onHiddenGamesChange: async () => {
        },
    });
}

// ── Realtime incoming update handler ─────────────────────────────────────────

function _onRemoteUpdate(payload) {
    if (_refreshing) return;

    const {data: remoteProfile, updatedAt: remoteUpdatedAt} = payload;
    if (!remoteProfile) return;

    const localTime = _profile?._savedAt ? new Date(_profile._savedAt) : null;
    const remoteTime = remoteUpdatedAt ? new Date(remoteUpdatedAt) : null;

    if (localTime && remoteTime && remoteTime <= localTime) return;

    const localViewState = _profile?.viewState;
    _profile = {
        ...remoteProfile,
        viewState: localViewState || remoteProfile.viewState || _defaultViewState(),
    };

    _doRender();
}

// ── Expose globals for inline HTML handlers ───────────────────────────────────

window.openPTSDSettings = () => _openSettings();

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
    await initAuth();

    _profile = await loadData();

    if (!_profile || !_profile.psUsername) {
        _promptFirstRun();
        return;
    }

    _doRender();

    const user = getUser();
    if (REALTIME_ENABLED && user) {
        subscribeToProfileChanges(user.id, _onRemoteUpdate);
    }

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && REALTIME_ENABLED) {
            subscribeToProfileChanges(session.user.id, _onRemoteUpdate);
        } else if (event === 'SIGNED_OUT') {
            unsubscribeFromProfileChanges();
        }
    });
})();
