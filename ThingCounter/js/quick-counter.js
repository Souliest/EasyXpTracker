// ThingCounter/js/quick-counter.js
// Quick Counter modal — a game-agnostic scratchpad counter with no setup required.
// State persists across refresh/blur; wiped on ✕ close or game select.

// ═══════════════════════════════════════════════
// Quick Counter
// ═══════════════════════════════════════════════

import {STORAGE_QC_VAL, STORAGE_QC_STEP, STORAGE_QC_COLOR} from './storage.js';
import {SWATCHES} from './swatches.js';

function qcRandomColor() {
    return SWATCHES[Math.floor(Math.random() * SWATCHES.length)].color;
}

export function qcLoad() {
    let color = localStorage.getItem(STORAGE_QC_COLOR);
    if (!color) {
        color = qcRandomColor();
        localStorage.setItem(STORAGE_QC_COLOR, color);
    }
    return {
        val: parseFloat(localStorage.getItem(STORAGE_QC_VAL)) || 0,
        step: parseFloat(localStorage.getItem(STORAGE_QC_STEP)) || 1,
        color,
    };
}

export function qcSave(val, step, color) {
    localStorage.setItem(STORAGE_QC_VAL, val);
    localStorage.setItem(STORAGE_QC_STEP, step);
    localStorage.setItem(STORAGE_QC_COLOR, color);
}

export function qcReset() {
    localStorage.removeItem(STORAGE_QC_VAL);
    localStorage.removeItem(STORAGE_QC_STEP);
    localStorage.removeItem(STORAGE_QC_COLOR);
}

export function openQuickCounter() {
    const {val, step, color} = qcLoad();
    document.getElementById('qcTitle').style.color = color;
    document.getElementById('qcTitle').style.textShadow = `0 0 16px ${color}80`;
    updateQcDisplay(val, step, color);
    document.getElementById('quickCounterModal').classList.add('open');
}

export function updateQcDisplay(val, step, color) {
    const display = document.getElementById('qcValueDisplay');
    display.textContent = val;
    display.style.color = color;
    display.style.textShadow = `0 0 20px ${color}80`;

    document.getElementById('qcStepDisplay').textContent = step;
    document.getElementById('qcStepInput').value = step;
    document.getElementById('qcValueInput').value = val;

    document.getElementById('qcMinus1').textContent = '−1';
    document.getElementById('qcPlus1').textContent = '+1';
    document.getElementById('qcMinusStep').textContent = `−${step}`;
    document.getElementById('qcPlusStep').textContent = `+${step}`;

    const atFloor = val <= 0;
    ['qcMinus1', 'qcMinusStep'].forEach(id => {
        const btn = document.getElementById(id);
        btn.style.opacity = atFloor ? '0.35' : '';
        btn.disabled = atFloor;
    });

    ['qcPlus1', 'qcPlusStep'].forEach(id => {
        const btn = document.getElementById(id);
        btn.style.color = color;
        btn.style.borderColor = color;
    });
}

export function qcStep(direction, useOne) {
    const {val, step, color} = qcLoad();
    const amt = useOne ? 1 : step;
    const newVal = Math.max(0, val + direction * amt);
    qcSave(newVal, step, color);
    updateQcDisplay(newVal, step, color);
}

export function activateQcValueInput() {
    document.getElementById('qcValueDisplay').classList.add('editing');
    const input = document.getElementById('qcValueInput');
    input.focus();
    input.select();
}

export function onQcValueInput() {
    const raw = parseFloat(document.getElementById('qcValueInput').value);
    if (isNaN(raw)) return;
    const val = Math.max(0, raw);
    const {step, color} = qcLoad();
    qcSave(val, step, color);
    updateQcDisplay(val, step, color);
}

export function onQcValueBlur() {
    document.getElementById('qcValueDisplay').classList.remove('editing');
}

export function activateQcStepInput() {
    document.getElementById('qcStepDisplay').classList.add('editing');
    const input = document.getElementById('qcStepInput');
    input.focus();
    input.select();
}

export function onQcStepInput() {
    const raw = parseFloat(document.getElementById('qcStepInput').value);
    if (isNaN(raw) || raw < 1) return;
    const {val, color} = qcLoad();
    qcSave(val, raw, color);
    updateQcDisplay(val, raw, color);
}

export function onQcStepBlur() {
    document.getElementById('qcStepDisplay').classList.remove('editing');
}

export function qcResetValue() {
    const {step, color} = qcLoad();
    qcSave(0, step, color);
    updateQcDisplay(0, step, color);
}

export function closeQuickCounter() {
    qcReset();
    document.getElementById('quickCounterModal').classList.remove('open');
}