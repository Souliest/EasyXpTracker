// XpTracker/js/charts.js
// Canvas-based chart drawing: XP-per-gain bar chart with moving averages, and cumulative XP over time.

// ═══════════════════════════════════════════════
// Charts — canvas drawing
// ═══════════════════════════════════════════════

import {fmt, movingAvg} from './stats.js';

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

export function drawGainChart(gains) {
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

export function drawTimeChart(gains, startTime) {
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

export function redrawCharts(gains, startTime) {
    drawGainChart(gains);
    drawTimeChart(gains, startTime);
}