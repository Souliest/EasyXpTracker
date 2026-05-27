// TrophySummary/js/psn.js
// Cloudflare Worker calls — the only code in PTSD that touches external APIs.
// Pure leaf module — no imports from other PTSD modules.

export const WORKER_URL = 'https://bgt-psn-proxy.souliest.workers.dev';

// ── /profile ──────────────────────────────────────────────────────────────────
// Fetches the full profile payload for a PS username.
// Returns: { psUsername, avatarUrl, trophyLevel, levelProgress, tierEarned,
//            tierTotal, games: [...] }
// Throws on network error or non-ok response.
// If the worker returns { error: 'rate_limited', retryAfter }, throws an object
// with { rateLimited: true, retryAfter } so main.js can store the countdown.

export async function workerFetchProfile(psUsername) {
    const url = new URL(`${WORKER_URL}/profile`);
    url.searchParams.set('username', psUsername);

    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({error: 'Invalid response'}));

    if (!res.ok) {
        if (data.error === 'rate_limited') {
            const err = new Error('Rate limited');
            err.rateLimited = true;
            err.retryAfter = data.retryAfter || 3600;
            throw err;
        }
        throw new Error(data.error || `Worker /profile failed: ${res.status}`);
    }

    return data;
}

// ── /summary ──────────────────────────────────────────────────────────────────
// Fetches per-game group breakdown.
// Pass full=true on first expand (needs names + tierTotal).
// Returns: { npCommId, platform, lastUpdatedDateTime, pct, tierEarned,
//            tierTotal (null if full=false), groups: [...] }

export async function workerFetchSummary(psUsername, npCommId, platform, full = false) {
    const url = new URL(`${WORKER_URL}/summary`);
    url.searchParams.set('username', psUsername);
    url.searchParams.set('npCommId', npCommId);
    url.searchParams.set('platform', platform);
    if (full) url.searchParams.set('full', 'true');

    const res = await fetch(url.toString());
    const data = await res.json().catch(() => ({error: 'Invalid response'}));

    if (!res.ok) {
        if (data.error === 'rate_limited') {
            const err = new Error('Rate limited');
            err.rateLimited = true;
            err.retryAfter = data.retryAfter || 300;
            throw err;
        }
        throw new Error(data.error || `Worker /summary failed: ${res.status}`);
    }

    return data;
}
