// common/utils.js
// Shared utility functions used across multiple tools.

// ── HTML escaping ──
// Escapes a string for safe insertion into HTML.
// Used wherever user-supplied or external data is rendered via innerHTML.

export function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Long-press detection ──
// Fires callback after 500ms hold. Cancels if the pointer moves more than
// THRESHOLD pixels (scroll tolerance) or leaves the element.
// Used for single-node edit activation (ThingCounter) and trophy pinning (TrophyHunter).

export function attachLongPress(el, callback) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    const THRESHOLD = 10;

    el.addEventListener('pointerdown', e => {
        startX = e.clientX;
        startY = e.clientY;
        timer = setTimeout(() => {
            timer = null;
            callback();
        }, 500);
    });

    el.addEventListener('pointermove', e => {
        if (!timer) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > THRESHOLD || dy > THRESHOLD) {
            clearTimeout(timer);
            timer = null;
        }
    });

    el.addEventListener('pointerup', () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    });

    el.addEventListener('pointerleave', () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    });
}