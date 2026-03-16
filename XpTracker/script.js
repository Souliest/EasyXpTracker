// ---- Data ----
let gains = [];
let startTime = null;

const STORAGE_GAINS = 'bgt:xp-tracker:gains';
const STORAGE_START = 'bgt:xp-tracker:start';

function saveData() {
    try {
        localStorage.setItem(STORAGE_GAINS, JSON.stringify(gains));
        localStorage.setItem(STORAGE_START, startTime ? String(startTime) : '');
    } catch (e) {
    }
}

function loadData() {
    try {
        const g = localStorage.getItem(STORAGE_GAINS);
        const s = localStorage.getItem(STORAGE_START);
        if (g) gains = JSON.parse(g);
        if (s) startTime = parseInt(s) || null;
    } catch (e) {
    }
}

loadData();

// FIX #31: keep Reset button disabled when there's nothing to reset.
function syncResetBtn() {
    const btn = document.getElementById('resetBtn');
    if (btn) btn.disabled = gains.length === 0;
}

function addXP() {
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
    saveData();
    updateAll();
}

document.getElementById('xpInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addXP();
});

function resetAll() {
    if (gains.length === 0) return;
    document.getElementById('confirmOverlay').classList.add('active');
}

function confirmReset() {
    document.getElementById('confirmOverlay').classList.remove('active');
    gains = [];
    startTime = null;
    saveData();
    updateAll();
}

function cancelReset() {
    document.getElementById('confirmOverlay').classList.remove('active');
}

// ---- Helpers ----
function fmt(n) {
    if (n === null || isNaN(n)) return '—';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.round(n).toString();
}

function movingAvg(arr, n) {
    return arr.map((_, i) => {
        const slice = arr.slice(Math.max(0, i - n + 1), i + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
}

// ---- Update all ----
function updateAll() {
    syncResetBtn();
    updateStats();
    updateChips();
    updateAvgStats();
    updateEntryLog();
    updateTimeStats();
    redrawCharts();
}

function redrawCharts() {
    drawGainChart();
    drawTimeChart();
}

function updateStats() {
    const total = gains.reduce((s, g) => s + g.xp, 0);
    const count = gains.length;
    document.getElementById('statTotal').textContent = count ? fmt(total) : '—';
    document.getElementById('statCount').textContent = count;
    document.getElementById('statAvg').textContent = count ? fmt(total / count) : '—';
}

function updateChips() {
    const area = document.getElementById('chipArea');
    area.innerHTML = '';
    gains.slice(-10).forEach(g => {
        const chip = document.createElement('div');
        chip.className = 'entry-chip';
        chip.textContent = '+' + fmt(g.xp);
        area.appendChild(chip);
    });
}

function updateAvgStats() {
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

function updateTimeStats() {
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

function fmtTime(ts) {
    const d = new Date(ts);
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map(n => String(n).padStart(2, '0')).join(':');
}

function updateEntryLog() {
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

// ---- Canvas drawing ----
function getCanvas(id) {
    const canvas = document.getElementById(id);
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = Math.round(w * 0.5);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return {ctx, w, h};
}

function getCSSVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function drawAxes(ctx, w, h, pad, minY, maxY, labels) {
    ctx.strokeStyle = getCSSVar('--border');
    ctx.lineWidth = 1;
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
        const y = pad.top + (h - pad.top - pad.bottom) * (i / steps);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        const val = maxY - (maxY - minY) * (i / steps);
        ctx.fillStyle = getCSSVar('--muted');
        ctx.font = '9px Share Tech Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(fmt(val), pad.left - 3, y + 3);
    }
    if (labels && labels.length) {
        const chartW = w - pad.left - pad.right;
        const slotCount = labels._slotCount || labels.length;
        ctx.fillStyle = getCSSVar('--muted');
        ctx.font = '9px Share Tech Mono, monospace';
        ctx.textAlign = 'center';
        labels.forEach((lbl, i) => {
            ctx.fillText(lbl, pad.left + (i + 0.5) * (chartW / slotCount), h - pad.bottom + 12);
        });
    }
}

function drawGainChart() {
    const {ctx, w, h} = getCanvas('gainChart');
    ctx.clearRect(0, 0, w, h);
    if (gains.length === 0) {
        ctx.fillStyle = getCSSVar('--muted');
        ctx.font = '11px Share Tech Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet — enter your first XP gain!', w / 2, h / 2);
        return;
    }
    const allXP = gains.map(g => g.xp);
    const fullTotalAvg = allXP.map((_, i) => allXP.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1));
    const fullSmooth5 = movingAvg(allXP, 5);
    const fullSmooth10 = movingAvg(allXP, 10);
    const WINDOW = 10;
    const startIdx = Math.max(0, allXP.length - WINDOW);
    const xpVals = allXP.slice(startIdx);
    const totalAvg = fullTotalAvg.slice(startIdx);
    const smooth5 = fullSmooth5.slice(startIdx);
    const smooth10 = fullSmooth10.slice(startIdx);
    const maxY = Math.max(...[...xpVals, ...totalAvg, ...smooth5, ...smooth10]) * 1.15;
    const pad = {top: 8, bottom: 20, left: 36, right: 8};
    const labels = xpVals.map((_, i) => '#' + (startIdx + i + 1));
    labels._slotCount = WINDOW;
    drawAxes(ctx, w, h, pad, 0, maxY, labels);
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const slotW = chartW / WINDOW;
    const barW = Math.max(4, slotW * 0.6);
    const range = maxY || 1;
    xpVals.forEach((v, i) => {
        const x = pad.left + (i + 0.5) * slotW - barW / 2;
        const bh = chartH * (v / range);
        ctx.fillStyle = 'rgba(0,229,255,0.18)';
        ctx.strokeStyle = 'rgba(0,229,255,0.6)';
        ctx.lineWidth = 1;
        ctx.fillRect(x, pad.top + chartH - bh, barW, bh);
        ctx.strokeRect(x, pad.top + chartH - bh, barW, bh);
    });

    function drawAligned(data, color, dash = []) {
        if (data.length < 1) return;
        ctx.setLineDash(dash);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = pad.left + (i + 0.5) * slotW;
            const y = pad.top + chartH * (1 - (v / range));
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawAligned(totalAvg, '#ff6b35');
    drawAligned(smooth5, '#7fff6b');
    drawAligned(smooth10, '#ffcc00');
}

function drawTimeChart() {
    const {ctx, w, h} = getCanvas('timeChart');
    ctx.clearRect(0, 0, w, h);
    if (gains.length === 0) {
        ctx.fillStyle = getCSSVar('--muted');
        ctx.font = '11px Share Tech Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No data yet.', w / 2, h / 2);
        return;
    }
    let cumulative = 0;
    const points = gains.map(g => {
        cumulative += g.xp;
        return {min: (g.ts - startTime) / 60000, cum: cumulative};
    });
    const series = [{min: 0, cum: 0}, ...points];
    const lastMin = points[points.length - 1].min;
    const maxMin = Math.max(lastMin * 1.15, 0.1);
    const maxY = cumulative * 1.12;
    const pad = {top: 8, bottom: 20, left: 40, right: 8};
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const range = maxY || 1;

    ctx.strokeStyle = getCSSVar('--border');
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH * (i / 4);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = getCSSVar('--muted');
        ctx.font = '9px Share Tech Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(fmt(maxY * (1 - i / 4)), pad.left - 3, y + 3);
    }
    for (let i = 0; i <= 4; i++) {
        const t = (maxMin / 4) * i;
        const x = pad.left + (t / maxMin) * chartW;
        const lbl = i === 0 ? '0' : (t < 1 ? t.toFixed(1) + 'm' : Math.round(t) + 'm');
        ctx.fillStyle = getCSSVar('--muted');
        ctx.font = '9px Share Tech Mono, monospace';
        ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
        ctx.fillText(lbl, x, h - pad.bottom + 12);
    }

    ctx.beginPath();
    series.forEach((pt, i) => {
        const x = pad.left + (pt.min / maxMin) * chartW;
        const y = pad.top + chartH * (1 - pt.cum / range);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.left + (series[series.length - 1].min / maxMin) * chartW, pad.top + chartH);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,229,255,0.07)';
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    series.forEach((pt, i) => {
        const x = pad.left + (pt.min / maxMin) * chartW;
        const y = pad.top + chartH * (1 - pt.cum / range);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#00e5ff';
    series.slice(1).forEach(pt => {
        ctx.beginPath();
        ctx.arc(
            pad.left + (pt.min / maxMin) * chartW,
            pad.top + chartH * (1 - pt.cum / range),
            3, 0, Math.PI * 2
        );
        ctx.fill();
    });
}

updateAll();
window.addEventListener('resize', redrawCharts);