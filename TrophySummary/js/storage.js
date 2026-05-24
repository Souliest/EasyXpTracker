// TrophySummary/js/storage.js
// Hybrid storage — localStorage for immediate reads, Supabase for persistence.
//
// LOCAL STORAGE SHAPE (v2)
// ─────────────────────────────────────────────────────────────────────────────
// Profile data stored under STORAGE_KEY ('bgt:trophy-summary:v2'):
// {
//   version: 2,
//   profile: { /* full profile blob */ } | null
// }
//
// Unlike the other hybrid tools, PTSD is a single-profile-per-user tool.
// There is no index, no LRU blob cache, no per-game rows. The entire profile
// is one blob in one Supabase row, keyed by user_id.
//
// runMigrations is called for version-stamp consistency with the other tools,
// but there is no migration to run — PTSD starts at version 2.

import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';
import {runMigrations, TOOL_CONFIG} from '../../common/migrations.js';
import {createRealtimeSubscription} from '../../common/realtime.js';

// ── Storage key constants ─────────────────────────────────────────────────────

export const STORAGE_KEY = TOOL_CONFIG.trophySummary.storageKey;

const CFG = TOOL_CONFIG.trophySummary;
const TABLE = 'bgt_trophy_summary_profiles';

// ── Realtime ──────────────────────────────────────────────────────────────────

export const REALTIME_ENABLED = true;

const _rt = createRealtimeSubscription('ptsd-profile', TABLE);

export function subscribeToProfileChanges(userId, onRemoteUpdate) {
    if (!REALTIME_ENABLED || !userId) return;
    _rt.subscribe(userId, payload => {
        if (payload.type === 'delete') return; // single-row tool — delete means signed out
        const row = payload.row;
        if (!row || !row.data) return;
        onRemoteUpdate({data: row.data, updatedAt: row.updated_at});
    });
}

export function unsubscribeFromProfileChanges() {
    _rt.unsubscribe();
}

// ── Local helpers ─────────────────────────────────────────────────────────────

export function localLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY))
            || {version: 2, profile: null};
    } catch {
        return {version: 2, profile: null};
    }
}

export function localSave(stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

// ── Rate limit helpers ────────────────────────────────────────────────────────
// Rate limits are enforced server-side by the worker. These helpers track the
// retryAfter timestamp locally so the UI can show countdowns without a worker
// call.
//
// Two rate limit scopes:
//   global  — keyed by 'global' — 1 call per hour per username (/profile)
//   game    — keyed by npCommId  — 1 call per 5 minutes per game (/summary)

const RATE_LIMIT_KEY = 'bgt:trophy-summary:rate-limits';

function _loadRateLimits() {
    try {
        return JSON.parse(localStorage.getItem(RATE_LIMIT_KEY)) || {};
    } catch {
        return {};
    }
}

function _saveRateLimits(limits) {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(limits));
}

export function setRateLimit(scope, retryAfterSeconds) {
    const limits = _loadRateLimits();
    limits[scope] = Date.now() + retryAfterSeconds * 1000;
    _saveRateLimits(limits);
}

export function getRateLimitRemaining(scope) {
    const limits = _loadRateLimits();
    const until = limits[scope];
    if (!until) return 0;
    const remaining = Math.ceil((until - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
}

export function isRateLimited(scope) {
    return getRateLimitRemaining(scope) > 0;
}

export function clearRateLimit(scope) {
    const limits = _loadRateLimits();
    delete limits[scope];
    _saveRateLimits(limits);
}

// ── loadData ──────────────────────────────────────────────────────────────────
// Returns the full profile blob, or null if no profile is stored yet.
//
// On load:
//   1. Read localStorage immediately.
//   2. If signed in, fetch updated_at from Supabase.
//   3. If remote is newer, fetch the full blob and update localStorage.
//   4. Return the profile blob (or null).

export async function loadData() {
    runMigrations(CFG);

    const stored = localLoad();
    const user = getUser();

    if (!user) return stored.profile;

    try {
        const {data: row, error} = await supabase
            .from(TABLE)
            .select('updated_at')
            .eq('user_id', user.id)
            .single();

        if (error || !row) return stored.profile;

        const localTime = stored.profile?._savedAt
            ? new Date(stored.profile._savedAt)
            : null;
        const remoteTime = row.updated_at ? new Date(row.updated_at) : null;

        if (!localTime || (remoteTime && remoteTime > localTime)) {
            const {data: fullRow, error: fullError} = await supabase
                .from(TABLE)
                .select('data, updated_at')
                .eq('user_id', user.id)
                .single();

            if (!fullError && fullRow && fullRow.data) {
                stored.profile = fullRow.data;
                localSave(stored);
            }
        }
    } catch {
        // Network unavailable — return local silently.
    }

    return stored.profile;
}

// ── saveData ──────────────────────────────────────────────────────────────────
// Writes the profile blob to localStorage immediately, then upserts to Supabase.

export async function saveData(profile) {
    const now = new Date().toISOString();
    const localProfile = { ...profile, _savedAt: now };

    const stored = localLoad();
    stored.profile = localProfile;
    localSave(stored);

    const user = getUser();
    if (!user) return;

    try {
        const { _savedAt, ...remoteProfile } = localProfile;
        await supabase.from(TABLE).upsert({
            user_id: user.id,
            ps_username: profile.psUsername,
            data: remoteProfile,
            updated_at: now,
        }, {onConflict: 'user_id'});
    } catch {
        // Network unavailable — localStorage write already succeeded.
    }
}

// ── getPSUsername ────────────────────────────────────────────────────────────
// Returns the stored PS username from the local profile blob, or null.
// Used by the modal and main.js to determine whether first-run setup is needed.

export function getPSUsername() {
    const stored = localLoad();
    return stored.profile?.psUsername || null;
}

// ── savePSUsername ───────────────────────────────────────────────────────────
// Stores the PS username into the profile blob (creating a minimal profile
// shell if none exists yet) and upserts to Supabase.
// Called from the settings modal on first run and on username change.

export async function savePSUsername(psUsername) {
    const stored = localLoad();
    const existing = stored.profile || {};
    const profile = {
        ...existing,
        psUsername: psUsername,
    };
    await saveData(profile);
}
