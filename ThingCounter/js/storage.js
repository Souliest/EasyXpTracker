// ThingCounter/js/storage.js
// Persists and retrieves the full games array and Quick Counter state via localStorage.

// ═══════════════════════════════════════════════
// Storage
// Thin synchronous wrapper — written so async can be dropped in later
// (e.g. Supabase) without touching other files.
// ═══════════════════════════════════════════════

export const STORAGE_KEY = 'bgt:thing-counter:data';
export const STORAGE_SELECTED = 'bgt:thing-counter:selected-game';
export const STORAGE_QC_VAL = 'bgt:thing-counter:quick-counter-val';
export const STORAGE_QC_STEP = 'bgt:thing-counter:quick-counter-step';
export const STORAGE_QC_COLOR = 'bgt:thing-counter:quick-counter-color';

export function loadData() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {games: []};
    } catch {
        return {games: []};
    }
}

export function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}