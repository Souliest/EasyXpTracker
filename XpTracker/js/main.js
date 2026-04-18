// XpTracker/js/main.js
// Entry point: holds gains/startTime state, wires events, exposes globals for inline HTML handlers, and runs init.

// ═══════════════════════════════════════════════
// Main — state, event wiring, init
// ═══════════════════════════════════════════════

import {loadData, saveData} from './storage.js';
import {updateAll} from './render.js';
import {redrawCharts} from './charts.js';
import {initAuth} from '../../common/auth-ui.js';

// ── Module-level state ──
let gains = [];
let startTime = null;

// ── Expose redrawCharts globally so initTheme(redrawCharts) in index.html works
//    (initTheme is a non-module global loaded before this script)
window.redrawCharts = () => redrawCharts(gains, startTime);

// ── Add XP ──
export function addXP() {
    const input = document.getElementById('xpInput');
    const val = parseInt(input.value.replace(/[^0-9]/g, ''));
    if (!val || val <= 0) {
        input.focus();
        return;
    }
    if (!startTime) startTime = Date.now();
    gains.push({xp: val, ts: Date.now()});
    input.value = '';
    input.focus();
    saveData({gains, startTime});
    updateAll(gains, startTime);
}

// ── Reset ──
export function resetAll() {
    if (gains.length === 0) return;
    document.getElementById('confirmOverlay').classList.add('active');
}

export function confirmReset() {
    document.getElementById('confirmOverlay').classList.remove('active');
    gains = [];
    startTime = null;
    saveData({gains, startTime});
    updateAll(gains, startTime);
}

export function cancelReset() {
    document.getElementById('confirmOverlay').classList.remove('active');
}

// ── Event wiring ──
document.getElementById('xpInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addXP();
});

// Expose functions called by inline handlers in index.html
window.addXP = addXP;
window.resetAll = resetAll;
window.confirmReset = confirmReset;
window.cancelReset = cancelReset;

// Resize redraws
window.addEventListener('resize', () => redrawCharts(gains, startTime));

// ── Init ──
(async function init() {
    await initAuth();
    const saved = loadData();
    gains = saved.gains;
    startTime = saved.startTime;
    updateAll(gains, startTime);
})();