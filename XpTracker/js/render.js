// XpTracker/js/render.js
// DOM update functions: stats panels, entry chips, entry log, time estimates, and the full updateAll sweep.

// ═══════════════════════════════════════════════
// Render — DOM updates (receive data as params, no internal loadData)
// ═══════════════════════════════════════════════

import {fmt, movingAvg} from './stats.js';
import {redrawCharts} from './charts.js';

export function syncResetBtn(gains) {
    const btn = document.getElementById('resetBtn');
    if (btn) btn.disabled = gains.length === 0;
}

export function updateStats(gains) {
    const total = gains.reduce((s, g) => s + g.xp, 0);
    const count = gains.length;
    document.getElementById('statTotal').textContent = count ? fmt(total) : '—';
    document.getElementById('statCount').textContent = count;
    document.getElementById('statAvg').textContent = count ? fmt(total / count) : '—';
}

export function updateChips(gains) {
    const area = document.getElementById('chipArea');
    area.innerHTML = '';
    gains.slice(-10).forEach(g => {
        const chip = document.createElement('div');
        chip.className = 'entry-chip';
        chip.textContent = '+' + fmt(g.xp);
        area.appendChild(chip);
    });
}

export function updateAvgStats(gains) {
    const allXP = gains.map(g => g.xp);
    const n = allXP.length;
    if (n === 0) {
        ['avgTotal', 'avgSmooth5', 'avgSmooth10'].forEach(id =>
            document.getElementById(id).textContent = '—'
        );
        return;
    }
    document.getElementById('avgTotal').textContent = fmt(allXP.reduce((a, b) => a + b, 0) / n);
    document.getElementById('avgSmooth5').textContent = fmt(movingAvg(allXP, 5)[n - 1]);
    document.getElementById('avgSmooth10').textContent = fmt(movingAvg(allXP, 10)[n - 1]);
}

function fmtTime(ts) {
    const d = new Date(ts);
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map(n => String(n).padStart(2, '0')).join(':');
}

export function updateEntryLog(gains) {
    const log = document.getElementById('entryLog');
    if (gains.length === 0) {
        log.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:0.65rem;">No entries yet.</div>';
        return;
    }
    const n = gains.length;
    log.innerHTML = [...gains].reverse().map((g, ri) => {
        const globalIdx = n - ri;
        const posFromEnd = ri;
        const inSmooth5 = posFromEnd < 5;
        const inSmooth10 = posFromEnd >= 5 && posFromEnd < 10;
        let dots = '';
        if (inSmooth5) dots = '<div class="log-dot" style="background:#7fff6b"></div>';
        else if (inSmooth10) dots = '<div class="log-dot" style="background:#ffcc00"></div>';
        return `<div class="log-entry">
      <span class="log-index">#${globalIdx}</span>
      <span class="log-time">${fmtTime(g.ts)}</span>
      <span class="log-xp">+${g.xp.toLocaleString()}</span>
      <span class="log-dots">${dots}</span>
    </div>`;
    }).join('');
}

export function updateTimeStats(gains, startTime) {
    if (gains.length === 0) {
        ['tMin', 't15', 'tHour'].forEach(id =>
            document.getElementById(id).textContent = '—'
        );
        return;
    }
    const now = Date.now();
    const elapsed = (now - startTime) / 60000;
    const total = gains.reduce((s, g) => s + g.xp, 0);

    function isReal(w) {
        return elapsed >= w;
    }

    function rateForWindow(w) {
        if (isReal(w)) {
            const cutoff = now - w * 60000;
            return gains.filter(g => g.ts >= cutoff).reduce((s, g) => s + g.xp, 0) / w;
        }
        return elapsed > 0 ? total / elapsed : 0;
    }

    function fmtRate(w, r) {
        return (isReal(w) ? '' : '~') + fmt(r * w);
    }

    document.getElementById('tMin').textContent = fmtRate(1, rateForWindow(1));
    document.getElementById('t15').textContent = fmtRate(15, rateForWindow(15));
    document.getElementById('tHour').textContent = fmtRate(60, rateForWindow(60));
}

export function updateAll(gains, startTime) {
    syncResetBtn(gains);
    updateStats(gains);
    updateChips(gains);
    updateAvgStats(gains);
    updateEntryLog(gains);
    updateTimeStats(gains, startTime);
    redrawCharts(gains, startTime);
}