// TrophyHunter/js/psn.js
// PSN API proxy calls and the 4-step search flow.
// Worker functions are the only code in the project that touches external APIs;
// keeping them here means modal-search.js imports from psn.js rather than reaching
// into storage.js for non-storage concerns (the layering smell that motivated this split).

// ═══════════════════════════════════════════════
// PSN — worker calls and search flow
// ═══════════════════════════════════════════════

import {
    searchCatalog,
    searchLookupTable,
    saveLookupEntries,
    normaliseTitle,
} from './storage.js';

// ── Cloudflare Worker URL ──
export const WORKER_URL = 'https://bgt-psn-proxy.souliest.workers.dev';

// ── Patch-site search URLs (step 3 of the search cascade) ──
export const ORBIS_SEARCH_URL = 'https://orbispatches.com/api/internal/search';
export const PROSPERO_SEARCH_URL = 'https://prosperopatches.com/api/internal/search';

// ═══════════════════════════════════════════════
// Worker calls
// ═══════════════════════════════════════════════

export async function workerResolve(titleIds, userId) {
    const url = new URL(`${WORKER_URL}/resolve`);
    url.searchParams.set('ids', titleIds.join(','));
    const headers = {};
    if (userId) headers['X-User-Id'] = userId;
    const res = await fetch(url.toString(), {headers});
    if (!res.ok) {
        const err = await res.json().catch(() => ({error: 'Unknown error'}));
        throw new Error(err.error || `Worker resolve failed: ${res.status}`);
    }
    return res.json();
}

export async function workerContribute(username, userId) {
    const url = new URL(`${WORKER_URL}/contribute`);
    url.searchParams.set('username', username);
    const headers = {};
    if (userId) headers['X-User-Id'] = userId;
    const res = await fetch(url.toString(), {method: 'POST', headers});
    if (!res.ok) {
        const err = await res.json().catch(() => ({error: 'Unknown error'}));
        throw new Error(err.error || `Worker contribute failed: ${res.status}`);
    }
    return res.json();
}

export async function workerFetchTrophies(npCommId, platform, userId) {
    const url = new URL(`${WORKER_URL}/trophies`);
    url.searchParams.set('id', npCommId);
    url.searchParams.set('platform', platform);
    const headers = {};
    if (userId) headers['X-User-Id'] = userId;
    const res = await fetch(url.toString(), {headers});
    if (!res.ok) {
        const err = await res.json().catch(() => ({error: 'Unknown error'}));
        throw new Error(err.error || `Worker trophy fetch failed: ${res.status}`);
    }
    return res.json();
}

// ═══════════════════════════════════════════════
// 4-step search flow
// ═══════════════════════════════════════════════

export async function runSearch(query, userId) {
    const trimmed = query.trim();

    const catalogResults = await searchCatalog(trimmed);
    if (catalogResults.length > 0) {
        return {results: catalogResults, needsUsername: false, source: 'catalog'};
    }

    const lookupResults = await searchLookupTable(trimmed);
    if (lookupResults.length > 0) {
        const results = lookupResults.map(r => ({
            npCommId: r.npCommId,
            name: r.titleName,
            platform: _platformFromService(r.platform, r.npServiceName),
            iconUrl: null,
        }));
        return {results, needsUsername: false, source: 'lookup'};
    }

    const titleIds = await _searchPatchSites(trimmed);
    if (titleIds.length > 0) {
        try {
            const {mappings} = await workerResolve(titleIds, userId);
            if (mappings && mappings.length > 0) {
                await saveLookupEntries(mappings);
                const seen = new Set();
                const results = [];
                for (const m of mappings) {
                    if (seen.has(m.npCommId)) continue;
                    seen.add(m.npCommId);
                    results.push({
                        npCommId: m.npCommId,
                        name: normaliseTitle(m.titleName) || normaliseTitle(trimmed),
                        platform: _platformFromTitleId(m.npTitleId, m.npServiceName),
                        iconUrl: null,
                    });
                }
                return {results, needsUsername: false, source: 'resolve'};
            }
        } catch {
            // fall through to step 4
        }
    }

    return {results: [], needsUsername: true, source: null};
}

export async function runContribute(query, username, userId) {
    const trimmed = query.trim();

    let contribution;
    try {
        contribution = await workerContribute(username, userId);
    } catch (err) {
        throw new Error(`Could not fetch ${username}'s library: ${err.message}`);
    }

    if (contribution.mappings && contribution.mappings.length > 0) {
        await saveLookupEntries(contribution.mappings);
    }

    const lookupResults = await searchLookupTable(trimmed);
    if (lookupResults.length > 0) {
        return lookupResults.map(r => ({
            npCommId: r.npCommId,
            name: r.titleName,
            platform: _platformFromService(r.platform, r.npServiceName),
            iconUrl: null,
        }));
    }

    return [];
}

// ═══════════════════════════════════════════════
// Private helpers
// ═══════════════════════════════════════════════

async function _searchPatchSites(query) {
    const encoded = encodeURIComponent(query);
    const titleIds = new Set();

    const [ps4, ps5] = await Promise.all([
        fetch(`${ORBIS_SEARCH_URL}?term=${encoded}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
        fetch(`${PROSPERO_SEARCH_URL}?term=${encoded}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
    ]);

    for (const result of (ps4?.results || [])) {
        if (result.titleid) titleIds.add(`${result.titleid}_00`);
    }
    for (const result of (ps5?.results || [])) {
        if (result.titleid) titleIds.add(`${result.titleid}_00`);
    }

    return [...titleIds];
}

function _platformFromService(platform, npServiceName) {
    if (platform) return platform;
    return npServiceName === 'trophy2' ? 'PS5' : 'PS4';
}

function _platformFromTitleId(npTitleId, npServiceName) {
    if (npTitleId && npTitleId.startsWith('PPSA')) return 'PS5';
    if (npTitleId && npTitleId.startsWith('CUSA')) return 'PS4';
    return _platformFromService('', npServiceName);
}