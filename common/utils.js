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

// ── Modal focus management ──
// trapFocus / releaseFocus implement a lightweight focus trap for modal dialogs.
//
// openModal(overlayEl, triggerEl?)
//   - Sets inert on all siblings of <body>'s direct children that are not the
//     overlay, preventing Tab from reaching background content.
//   - Moves focus to the first focusable element inside overlayEl.
//   - Stores triggerEl so focus can be restored on close.
//
// closeModal(overlayEl)
//   - Removes inert from all previously inerted siblings.
//   - Returns focus to the stored trigger element (if still in the document).
//
// Usage:
//   openModal(document.getElementById('myOverlay'), document.activeElement);
//   closeModal(document.getElementById('myOverlay'));

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

// Map from overlay element → { inertedElements, triggerEl }
const _modalStack = new Map();

export function openModal(overlayEl, triggerEl) {
    if (!overlayEl) return;

    // Inert every top-level body child except the overlay itself (and the
    // shared auth/collision overlays which manage their own focus).
    const inerted = [];
    for (const child of document.body.children) {
        if (child === overlayEl) continue;
        if (child.id === 'authOverlay' || child.id === 'collisionOverlay') continue;
        if (!child.inert) {
            child.inert = true;
            inerted.push(child);
        }
    }

    _modalStack.set(overlayEl, {inerted, triggerEl: triggerEl || null});

    // Move focus to the first focusable element inside the modal.
    requestAnimationFrame(() => {
        const first = overlayEl.querySelector(FOCUSABLE);
        if (first) first.focus();
    });
}

export function closeModal(overlayEl) {
    if (!overlayEl) return;
    const entry = _modalStack.get(overlayEl);
    if (!entry) return;

    for (const el of entry.inerted) {
        el.inert = false;
    }
    _modalStack.delete(overlayEl);

    if (entry.triggerEl && document.contains(entry.triggerEl)) {
        entry.triggerEl.focus();
    }
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