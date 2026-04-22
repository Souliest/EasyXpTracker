// ThingCounter/js/focus.js
// Focus modal (per-counter large-target view) — open, close, display, input handlers.

import {saveData, STORAGE_KEY} from './storage.js';
import {cacheSet, TOOL_CONFIG} from '../../common/migrations.js';
import {DEFAULT_COLOR} from './swatches.js';
import {findNode, clampValue, initialValue, fillPercent} from './nodes.js';
import {openModal as trapOpen, closeModal as trapClose} from '../../common/utils.js';

const CFG = TOOL_CONFIG.thingCounter;

// ── Local storage read ─────────────────────────────────────────────────────

function _localLoad() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ||
            {version: 2, index: [], blobs: {}, lruOrder: []};
    } catch {
        return {version: 2, index: [], blobs: {}, lruOrder: []};
    }
}

// ── Focus modal state ──────────────────────────────────────────────────────

let focusNodeId = null;
let _selectedGameId = null;

export function setFocusGameId(id) {
    _selectedGameId = id;
}

export function getFocusNodeId() {
    return focusNodeId;
}

// ── Focus modal ────────────────────────────────────────────────────────────

export function openFocusModal(nodeId, selectedGameId) {
    const stored = _localLoad();
    const game = stored.blobs[selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    focusNodeId = nodeId;
    _selectedGameId = selectedGameId;
    document.getElementById('focusName').textContent = node.name;
    _updateFocusDisplay(stored);
    const overlay = document.getElementById('focusModal');
    overlay.classList.add('open');
    trapOpen(overlay, document.activeElement);
}

// Public — called after external value changes that don't go through this module.
export function updateFocusDisplay() {
    _updateFocusDisplay(_localLoad());
}

function _updateFocusDisplay(stored) {
    const game = stored.blobs[_selectedGameId];
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
    const overlay = document.getElementById('focusModal');
    overlay.classList.remove('open');
    trapClose(overlay);
}

export function activateFocusValueInput() {
    document.getElementById('focusValueDisplay').classList.add('editing');
    const input = document.getElementById('focusValueInput');
    input.focus();
    input.select();
}

export async function onFocusValueInput(onRefreshCard) {
    const val = parseInt(document.getElementById('focusValueInput').value);
    if (isNaN(val)) return;

    const stored = _localLoad();
    const game = stored.blobs[_selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;

    node.value = clampValue(node, val);
    cacheSet(stored, game, CFG);
    await saveData(stored, _selectedGameId);
    _updateFocusDisplay(stored);
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

export async function onFocusStepInput() {
    const val = parseFloat(document.getElementById('focusStepInput').value);
    if (isNaN(val) || val < 1) return;

    const stored = _localLoad();
    const game = stored.blobs[_selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;

    node.step = val;
    cacheSet(stored, game, CFG);
    await saveData(stored, _selectedGameId);
    _updateFocusDisplay(stored);
}

export function onFocusStepBlur() {
    document.getElementById('focusStepDisplay').classList.remove('editing');
}

export async function focusStep(direction, useOne, onRefreshCard) {
    const stored = _localLoad();
    const game = stored.blobs[_selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;

    const stepAmt = useOne ? 1 : (node.step || 1);
    node.value = clampValue(node, node.value + direction * stepAmt);
    cacheSet(stored, game, CFG);
    await saveData(stored, _selectedGameId);
    _updateFocusDisplay(stored);
    onRefreshCard(focusNodeId, node);
}

export async function focusResetValue(onRefreshCard) {
    const stored = _localLoad();
    const game = stored.blobs[_selectedGameId];
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;

    node.value = initialValue(node);
    cacheSet(stored, game, CFG);
    await saveData(stored, _selectedGameId);
    _updateFocusDisplay(stored);
    onRefreshCard(focusNodeId, node);
}

// Sync focus display if the given node is currently open — called after external value changes.
export function syncFocusIfOpen(nodeId) {
    if (focusNodeId === nodeId) _updateFocusDisplay(_localLoad());
}