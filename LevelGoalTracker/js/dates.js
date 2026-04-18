// LevelGoalTracker/js/dates.js
// Pure date helpers: today's string, local date parsing, day arithmetic, and formatting.

// ═══════════════════════════════════════════════
// Dates — pure helpers, no DOM, no localStorage
// ═══════════════════════════════════════════════

export function todayStr() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Parse date strings at noon local time to avoid UTC midnight crossing into
// the wrong calendar day in negative-offset timezones.
export function parseLocalDate(dateStr) {
    return new Date(dateStr + 'T12:00:00');
}

export function daysBetween(dateStrA, dateStrB) {
    return Math.round(
        (parseLocalDate(dateStrB) - parseLocalDate(dateStrA)) / 86400000
    );
}

export function formatDate(dateStr) {
    return parseLocalDate(dateStr).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
    });
}

// Produce a deadline date string using local calendar arithmetic,
// avoiding the toISOString() UTC shift for negative-offset timezones.
export function localDatePlusDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}