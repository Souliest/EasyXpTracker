// TrophyHunter/js/psn.js
// Cloudflare Worker calls — the only code in the project that touches external APIs.
// URL constants and the three worker functions live here so modal-search.js and
// modal-settings.js import from psn.js rather than reaching into storage.js for
// non-storage concerns.
//
// runSearch and runContribute are NOT here — they need searchCatalog,
// searchLookupTable, saveLookupEntries, and normaliseTitle from storage.js, which
// would create a circular dependency (psn.js → storage.js → psn.js). Those
// functions live in storage.js where they have natural access to the catalog and
// lookup helpers. modal-search.js imports them from storage.js directly.

// ═══════════════════════════════════════════════
// PSN — worker calls
// ═══════════════════════════════════════════════

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