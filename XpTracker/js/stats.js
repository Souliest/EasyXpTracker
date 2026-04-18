// XpTracker/js/stats.js
// Pure calculation helpers: number formatting and moving average.

// ═══════════════════════════════════════════════
// Stats — pure functions, no DOM, no localStorage
// ═══════════════════════════════════════════════

export function fmt(n) {
    if (n === null || isNaN(n)) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.round(n).toString();
}

export function movingAvg(arr, n) {
    return arr.map((_, i) => {
        const slice = arr.slice(Math.max(0, i - n + 1), i + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
}