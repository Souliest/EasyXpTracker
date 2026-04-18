// XpTracker/js/storage.js
// Persists and retrieves XP gains and session start time via localStorage.

// ═══════════════════════════════════════════════
// Storage
// Thin synchronous wrapper — written so async can be dropped in later
// (e.g. Supabase) without touching other files.
// ═══════════════════════════════════════════════

export const STORAGE_GAINS = 'bgt:xp-tracker:gains';
export const STORAGE_START = 'bgt:xp-tracker:start';

export function loadData() {
    try {
        const g = localStorage.getItem(STORAGE_GAINS);
        const s = localStorage.getItem(STORAGE_START);
        return {
            gains: g ? JSON.parse(g) : [],
            startTime: s ? (parseInt(s) || null) : null,
        };
    } catch {
        return {gains: [], startTime: null};
    }
}

export function saveData({gains, startTime}) {
    try {
        localStorage.setItem(STORAGE_GAINS, JSON.stringify(gains));
        localStorage.setItem(STORAGE_START, startTime ? String(startTime) : '');
    } catch {
        // storage unavailable — fail silently
    }
}