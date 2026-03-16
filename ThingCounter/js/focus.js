// ThingCounter/js/focus.js
// Focus modal (per-counter large-target view) and Quick Counter modal — open, close, display, input handlers.

// ═══════════════════════════════════════════════
// Focus — focus modal and Quick Counter
// ═══════════════════════════════════════════════

import {loadData, saveData, STORAGE_QC_VAL, STORAGE_QC_STEP, STORAGE_QC_COLOR} from './storage.js';
import {SWATCHES, DEFAULT_COLOR} from './swatches.js';
import {findNode, clampValue, initialValue, fillPercent} from './nodes.js';

// ── Focus modal state ──

let focusNodeId = null;
let _selectedGameId = null;  // set via setFocusGameId() from main.js

export function setFocusGameId(id) {
    _selectedGameId = id;
}

export function getFocusNodeId() {
    return focusNodeId;
}

// ── Focus modal ──

export function openFocusModal(nodeId, selectedGameId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    focusNodeId = nodeId;
    _selectedGameId = selectedGameId;
    document.getElementById('focusName').textContent = node.name;
    updateFocusDisplay();
    document.getElementById('focusModal').classList.add('open');
}

export function updateFocusDisplay() {
    const data = loadData();
    const game = data.games.find(g => g.id === _selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;

    const isBounded = node.counterType === 'bounded';
    const isDecrement = !!node.decrement;
    const color = node.color || DEFAULT_COLOR;
    const step = node.step || 1;

    const display = document.getElementById('focusValueDisplay');
    display.textContent = isBounded ? `${node.value} / ${node.max ?? '?'}` : `${node.value}`;
    display.style.color = color;
    display.style.textShadow = `0 0 20px ${color}80`;
    document.getElementById('focusValueInput').value = node.value;

    document.getElementById('focusStepDisplay').textContent = step;
    document.getElementById('focusStepInput').value = step;

    const minus1 = document.getElementById('focusMinus1');
    const plus1 = document.getElementById('focusPlus1');
    const minusStep = document.getElementById('focusMinusStep');
    const plusStep = document.getElementById('focusPlusStep');
    const btnRow1 = document.getElementById('focusBtnRow1');
    const btnRow2 = document.getElementById('focusBtnRow2');

    minus1.textContent = '−1';
    plus1.textContent = '+1';
    minusStep.textContent = `−${step}`;
    plusStep.textContent = `+${step}`;

    [btnRow1, btnRow2].forEach(row => row.classList.toggle('decrement', isDecrement));
    [minus1, minusStep].forEach(btn => {
        btn.classList.toggle('dominant', isDecrement);
        btn.style.color = isDecrement ? color : '';
        btn.style.borderColor = isDecrement ? color : '';
    });
    [plus1, plusStep].forEach(btn => {
        btn.classList.toggle('subdued', isDecrement);
        btn.style.color = isDecrement ? '' : color;
        btn.style.borderColor = isDecrement ? '' : color;
    });

    const fillWrap = document.getElementById('focusFillWrap');
    const fillBar = document.getElementById('focusFillBar');
    if (isBounded) {
        fillWrap.classList.add('visible');
        fillBar.style.width = fillPercent(node) + '%';
        fillBar.style.background = color;
    } else {
        fillWrap.classList.remove('visible');
    }
}

export function closeFocusModal() {
    focusNodeId = null;
    document.getElementById('focusModal').classList.remove('open');
}

export function activateFocusValueInput() {
    document.getElementById('focusValueDisplay').classList.add('editing');
    const input = document.getElementById('focusValueInput');
    input.focus();
    input.select();
}

export function onFocusValueInput(onRefreshCard) {
    const val = parseInt(document.getElementById('focusValueInput').value);
    if (isNaN(val)) return;
    const data = loadData();
    const game = data.games.find(g => g.id === _selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;
    node.value = clampValue(node, val);
    saveData(data);
    updateFocusDisplay();
    onRefreshCard(focusNodeId, node);
}

export function onFocusValueBlur() {
    document.getElementById('focusValueDisplay').classList.remove('editing');
}

export function activateFocusStepInput() {
    document.getElementById('focusStepDisplay').classList.add('editing');
    const input = document.getElementById('focusStepInput');
    input.focus();
    input.select();
}

export function onFocusStepInput() {
    const val = parseFloat(document.getElementById('focusStepInput').value);
    if (isNaN(val) || val < 1) return;
    const data = loadData();
    const game = data.games.find(g => g.id === _selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;
    node.step = val;
    saveData(data);
    updateFocusDisplay();
}

export function onFocusStepBlur() {
    document.getElementById('focusStepDisplay').classList.remove('editing');
}

export function focusStep(direction, useOne, onRefreshCard) {
    const data = loadData();
    const game = data.games.find(g => g.id === _selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;
    const stepAmt = useOne ? 1 : (node.step || 1);
    node.value = clampValue(node, node.value + direction * stepAmt);
    saveData(data);
    updateFocusDisplay();
    onRefreshCard(focusNodeId, node);
}

export function focusResetValue(onRefreshCard) {
    const data = loadData();
    const game = data.games.find(g => g.id === _selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;
    node.value = initialValue(node);
    saveData(data);
    updateFocusDisplay();
    onRefreshCard(focusNodeId, node);
}

// Sync focus display if the given node is currently open — called after external value changes.
export function syncFocusIfOpen(nodeId) {
    if (focusNodeId === nodeId) updateFocusDisplay();
}

// ── Quick Counter ──

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

function qcRandomColor() {
    return SWATCHES[Math.floor(Math.random() * SWATCHES.length)].color;
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