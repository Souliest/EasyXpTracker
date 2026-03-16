// ═══════════════════════════════════════════════
// Storage
// ═══════════════════════════════════════════════

const STORAGE_KEY = 'bgt:thing-counter:data';
const STORAGE_SELECTED = 'bgt:thing-counter:selected-game';
const STORAGE_QC_VAL = 'bgt:thing-counter:quick-counter-val';
const STORAGE_QC_STEP = 'bgt:thing-counter:quick-counter-step';
const STORAGE_QC_COLOR = 'bgt:thing-counter:quick-counter-color';

function loadData() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {games: []};
    } catch {
        return {games: []};
    }
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ═══════════════════════════════════════════════
// Color palette
// ═══════════════════════════════════════════════

const SWATCHES = [
    {color: '#FF4D57', name: 'Cherry'},
    {color: '#FF6F61', name: 'Coral'},
    {color: '#FF8C42', name: 'Tangerine'},
    {color: '#FFA62B', name: 'Mango'},
    {color: '#FFC857', name: 'Honey'},
    {color: '#E6FF4F', name: 'Lemon'},
    {color: '#7ED957', name: 'Limeade'},
    {color: '#4FD08B', name: 'Cactus'},
    {color: '#42E6A4', name: 'Mint'},
    {color: '#00A8A8', name: 'Lagoon'},
    {color: '#27D3C2', name: 'Turquoise'},
    {color: '#2ED9FF', name: 'Aqua'},
    {color: '#4FC3F7', name: 'Glacier'},
    {color: '#2F6BFF', name: 'Cobalt'},
    {color: '#3B82C4', name: 'Denim'},
    {color: '#6C8CFF', name: 'Periwinkle'},
    {color: '#5A5CFF', name: 'Indigo'},
    {color: '#7A4DFF', name: 'Plum'},
    {color: '#D65CFF', name: 'Orchid'},
    {color: '#FF4F81', name: 'Rose'},
];

const DEFAULT_COLOR = '#2ED9FF';

function swatchByColor(color) {
    return SWATCHES.find(s => s.color === color) || SWATCHES[0];
}

// ═══════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════

let selectedGameId = null;
let editMode = false;
let nodeEditActive = null;

// ═══════════════════════════════════════════════
// Sort order
// ═══════════════════════════════════════════════

function currentSortOrder() {
    if (!selectedGameId) return null;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    return game ? (game.sortOrder || null) : null;
}

function cycleSortOrder() {
    if (!selectedGameId) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const next = {null: 'asc', asc: 'desc', desc: null};
    game.sortOrder = next[game.sortOrder || 'null'] || null;
    saveData(data);
    updateSortBtn();
    renderMain();
}

function updateSortBtn() {
    const btn = document.getElementById('sortBtn');
    if (!btn) return;
    const order = currentSortOrder();
    if (order === 'asc') {
        btn.textContent = 'A↑';
        btn.classList.add('active');
        btn.title = 'Sorted A→Z (click for Z→A)';
    } else if (order === 'desc') {
        btn.textContent = 'A↓';
        btn.classList.add('active');
        btn.title = 'Sorted Z→A (click to unsort)';
    } else {
        btn.textContent = 'A↑';
        btn.classList.remove('active');
        btn.title = 'Sort order: off (click for A→Z)';
    }
}

// ═══════════════════════════════════════════════
// Game selector
// ═══════════════════════════════════════════════

function updateGameActionButtons(data) {
    const hasGame = !!selectedGameId && !!data.games.find(g => g.id === selectedGameId);
    document.getElementById('editGameBtn').style.display = hasGame ? '' : 'none';
    document.getElementById('treeActionBar').style.display = hasGame ? '' : 'none';
}

function renderSelector() {
    const data = loadData();
    const sel = document.getElementById('gameSelect');
    sel.innerHTML = '<option value="">— select a game —</option>';
    data.games.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        sel.appendChild(opt);
    });
    if (selectedGameId && data.games.find(g => g.id === selectedGameId)) {
        sel.value = selectedGameId;
    }
    updateGameActionButtons(data);
}

function selectGame(id) {
    selectedGameId = id || null;
    nodeEditActive = null;
    if (selectedGameId) {
        localStorage.setItem(STORAGE_SELECTED, selectedGameId);
        qcReset();
        document.getElementById('quickCounterModal').classList.remove('open');
    } else {
        localStorage.removeItem(STORAGE_SELECTED);
    }
    updateGameActionButtons(loadData());
    updateSortBtn();
    renderMain();
}

function restoreSelectedGame(data) {
    const saved = localStorage.getItem(STORAGE_SELECTED);
    if (saved && data.games.find(g => g.id === saved)) return saved;
    return null;
}

// ═══════════════════════════════════════════════
// Edit mode
// ═══════════════════════════════════════════════

function toggleEditMode() {
    editMode = !editMode;
    nodeEditActive = null;
    const btn = document.getElementById('editModeBtn');
    const content = document.getElementById('mainContent');
    btn.classList.toggle('active', editMode);
    content.classList.toggle('edit-mode', editMode);
    const banner = content.querySelector('.edit-mode-banner');
    if (banner) banner.classList.toggle('visible', editMode);
    content.querySelectorAll('.counter-card').forEach(card => card.classList.remove('node-edit-active'));
    content.querySelectorAll('.branch-row').forEach(row => row.classList.remove('node-edit-active'));
}

function activateNodeEdit(nodeId) {
    if (editMode) return;
    const content = document.getElementById('mainContent');
    if (nodeEditActive === nodeId) {
        nodeEditActive = null;
        content.querySelectorAll('.counter-card, .branch-row').forEach(el => el.classList.remove('node-edit-active'));
    } else {
        nodeEditActive = nodeId;
        content.querySelectorAll('.counter-card, .branch-row').forEach(el => el.classList.remove('node-edit-active'));
        const el = content.querySelector(`.tree-node[data-id="${nodeId}"] > .counter-card`) ||
            content.querySelector(`.tree-node[data-id="${nodeId}"] > .branch-row`);
        if (el) el.classList.add('node-edit-active');
    }
}

// ═══════════════════════════════════════════════
// Node helpers
// ═══════════════════════════════════════════════

function findNode(nodes, id) {
    for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children) {
            const found = findNode(n.children, id);
            if (found) return found;
        }
    }
    return null;
}

function findParent(nodes, id, parent = null) {
    for (const n of nodes) {
        if (n.id === id) return parent;
        if (n.children) {
            const found = findParent(n.children, id, n);
            if (found !== undefined) return found;
        }
    }
    return undefined;
}

function removeNode(nodes, id) {
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) {
            nodes.splice(i, 1);
            return true;
        }
        if (nodes[i].children && removeNode(nodes[i].children, id)) return true;
    }
    return false;
}

function getAllBranches(nodes, result = [], depth = 0) {
    for (const n of nodes) {
        if (n.type === 'branch') {
            result.push({id: n.id, name: n.name, depth});
            if (n.children) getAllBranches(n.children, result, depth + 1);
        }
    }
    return result;
}

function countDescendants(node) {
    if (!node.children || node.children.length === 0) return 0;
    return node.children.reduce((s, c) => s + 1 + countDescendants(c), 0);
}

function isAncestor(nodes, ancestorId, targetId) {
    const ancestor = findNode(nodes, ancestorId);
    if (!ancestor) return false;

    function check(node) {
        if (!node.children) return false;
        for (const c of node.children) {
            if (c.id === targetId || check(c)) return true;
        }
        return false;
    }

    return check(ancestor);
}

function clampValue(node, val) {
    const min = node.counterType === 'bounded' ? (node.min ?? 0) : 0;
    const max = node.counterType === 'bounded' ? (node.max ?? Infinity) : Infinity;
    return Math.max(min, Math.min(max, val));
}

function initialValue(node) {
    if (node.initial !== undefined && node.initial !== null) return node.initial;
    if (node.counterType === 'bounded') {
        return node.decrement ? (node.max ?? 0) : (node.min ?? 0);
    }
    return 0;
}

function fillPercent(node) {
    if (node.counterType !== 'bounded') return 0;
    const min = node.min ?? 0;
    const max = node.max ?? 0;
    const range = max - min;
    if (range <= 0) return 0;
    return Math.min(100, Math.max(0, ((node.value - min) / range) * 100));
}

// ═══════════════════════════════════════════════
// Render: main
// ═══════════════════════════════════════════════

const collapsedBranches = new Set();

function renderMain() {
    const content = document.getElementById('mainContent');
    updateSortBtn();

    if (!selectedGameId) {
        const data = loadData();
        const msg = data.games.length === 0
            ? `<div class="big">🎮</div>No games yet.<br>Hit <strong>+ Game</strong> to get started.`
            : `Select a game above.`;
        content.innerHTML = `
            <div class="empty-state">${msg}</div>
            <div class="qc-entry">
                <button class="qc-entry-btn" onclick="openQuickCounter()">⚡ Quick Counter</button>
            </div>
        `;
        content.classList.remove('edit-mode');
        return;
    }

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) {
        content.innerHTML = '';
        return;
    }

    // FIX #26: show a helpful empty state when a game has no nodes yet.
    const hasNodes = game.nodes && game.nodes.length > 0;

    content.innerHTML = `
        <div class="edit-mode-banner${editMode ? ' visible' : ''}">✏️ Edit Mode</div>
        ${!hasNodes ? `
        <div class="empty-state empty-state-game">
            <div class="big">📋</div>
            No counters yet.<br>
            Tap <strong>✏️</strong> to enter edit mode,<br>
            then use <strong>+ Branch</strong> or <strong>+ Counter</strong> to get started.
        </div>` : ''}
        <div class="tree-root" id="treeRoot"></div>
    `;
    content.classList.toggle('edit-mode', editMode);

    const treeRoot = document.getElementById('treeRoot');
    if (hasNodes) renderNodes(game.nodes, treeRoot);

    const ghost = document.createElement('button');
    ghost.className = 'add-ghost-btn';
    ghost.textContent = '+ Add counter to root';
    ghost.onclick = () => openAddCounterModal(null);
    treeRoot.appendChild(ghost);
}

function renderNodes(nodes, container) {
    const order = currentSortOrder();
    const sorted = order
        ? [...nodes].sort((a, b) => order === 'asc'
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name))
        : nodes;
    sorted.forEach(node => container.appendChild(renderNode(node)));
}

function renderNode(node) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';
    wrapper.dataset.id = node.id;

    if (node.type === 'branch') {
        wrapper.appendChild(renderBranch(node));
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-node-children' + (collapsedBranches.has(node.id) ? ' collapsed' : '');
        childContainer.id = 'children-' + node.id;
        if (node.children && node.children.length > 0) renderNodes(node.children, childContainer);
        const ghost = document.createElement('button');
        ghost.className = 'add-ghost-btn';
        ghost.textContent = '+ Add counter here';
        ghost.onclick = () => openAddCounterModal(node.id);
        childContainer.appendChild(ghost);
        wrapper.appendChild(childContainer);
    } else {
        wrapper.appendChild(renderCounter(node));
    }

    return wrapper;
}

function renderBranch(node) {
    const row = document.createElement('div');
    row.className = 'branch-row' + (nodeEditActive === node.id ? ' node-edit-active' : '');
    const isCollapsed = collapsedBranches.has(node.id);

    row.innerHTML = `
        <span class="branch-toggle">${isCollapsed ? '▶' : '▼'}</span>
        <span class="branch-name">${escHtml(node.name)}</span>
        <div class="node-edit-controls">
            <button class="node-btn blue"  data-action="add">+</button>
            <button class="node-btn"       data-action="edit">✎</button>
            <button class="node-btn red"   data-action="delete">🗑</button>
        </div>
    `;

    row.querySelector('[data-action="add"]').addEventListener('click', e => {
        e.stopPropagation();
        openAddBranchModal(node.id);
    });
    row.querySelector('[data-action="edit"]').addEventListener('click', e => {
        e.stopPropagation();
        openEditBranchModal(node.id);
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', e => {
        e.stopPropagation();
        openConfirmDeleteNode(node.id);
    });

    row.addEventListener('click', () => toggleBranch(node.id));
    row.addEventListener('dblclick', e => {
        e.preventDefault();
        activateNodeEdit(node.id);
    });
    attachLongPress(row, () => activateNodeEdit(node.id));

    return row;
}

function renderCounter(node) {
    const card = document.createElement('div');
    card.className = 'counter-card' + (nodeEditActive === node.id ? ' node-edit-active' : '');

    const isBounded = node.counterType === 'bounded';
    const isDecrement = !!node.decrement;
    const color = node.color || DEFAULT_COLOR;
    const step = node.step || 1;
    const pct = fillPercent(node);
    const valueLabel = isBounded ? `${node.value} / ${node.max ?? '?'}` : `${node.value}`;
    const stepLabel = step !== 1 ? step : '';

    const plusLabel = stepLabel ? `+${step}` : '+';
    const minusLabel = stepLabel ? `−${step}` : '−';
    const plusClass = 'c-btn ' + (isDecrement ? 'subdued' : 'dominant');
    const minusClass = 'c-btn ' + (isDecrement ? 'dominant' : 'subdued');
    const plusStyle = isDecrement ? '' : `color:${color};border-color:${color}`;
    const minusStyle = isDecrement ? `color:${color};border-color:${color}` : '';

    card.innerHTML = `
        <div class="counter-inner">
            <span class="counter-name">${escHtml(node.name)}</span>
            <span class="counter-value-display" style="color:${color}">${valueLabel}</span>
            <div class="counter-btns">
                <button class="${minusClass}" style="${minusStyle}" data-step="-1">${minusLabel}</button>
                <button class="${plusClass}"  style="${plusStyle}"  data-step="1">${plusLabel}</button>
            </div>
            <div class="counter-edit-controls node-edit-controls">
                <button class="node-btn"     data-action="edit">✎</button>
                <button class="node-btn"     data-action="resetstep" title="Reset step to 1">×1</button>
                <button class="node-btn red" data-action="resetval"  title="Reset value to initial">↺</button>
                <button class="node-btn red" data-action="delete">🗑</button>
            </div>
        </div>
        ${isBounded ? `<div class="counter-fill-bar-wrap"><div class="counter-fill-bar" style="width:${pct}%;background:${color}"></div></div>` : ''}
    `;

    card.querySelectorAll('[data-step]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            counterStep(node.id, parseInt(btn.dataset.step));
        });
    });

    card.querySelector('[data-action="edit"]').addEventListener('click', e => {
        e.stopPropagation();
        openEditCounterModal(node.id);
    });
    card.querySelector('[data-action="resetstep"]').addEventListener('click', e => {
        e.stopPropagation();
        resetNodeStep(node.id);
    });
    card.querySelector('[data-action="resetval"]').addEventListener('click', e => {
        e.stopPropagation();
        resetNodeValue(node.id);
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', e => {
        e.stopPropagation();
        openConfirmDeleteNode(node.id);
    });

    card.querySelector('.counter-name').addEventListener('click', e => {
        e.stopPropagation();
        openFocusModal(node.id);
    });

    card.addEventListener('dblclick', e => {
        if (e.target.closest('.node-btn') || e.target.closest('.c-btn')) return;
        e.preventDefault();
        activateNodeEdit(node.id);
    });
    attachLongPress(card, () => activateNodeEdit(node.id));

    return card;
}

// ═══════════════════════════════════════════════
// Long-press helper
// ═══════════════════════════════════════════════

function attachLongPress(el, callback) {
    let timer = null;
    let cancelled = false;

    el.addEventListener('pointerdown', e => {
        cancelled = false;
        timer = setTimeout(() => {
            timer = null;
            if (!cancelled) callback();
        }, 500);
    });

    // FIX #18 (pass 2 prep): cancel on meaningful movement to avoid
    // triggering during scroll gestures on mobile.
    el.addEventListener('pointermove', e => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
            cancelled = true;
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

// ═══════════════════════════════════════════════
// Tree interactions
// ═══════════════════════════════════════════════

function toggleBranch(id) {
    if (collapsedBranches.has(id)) collapsedBranches.delete(id);
    else collapsedBranches.add(id);

    const childContainer = document.getElementById('children-' + id);
    if (childContainer) childContainer.classList.toggle('collapsed', collapsedBranches.has(id));

    const wrapper = document.querySelector(`.tree-node[data-id="${id}"]`);
    if (wrapper) {
        const toggle = wrapper.querySelector('.branch-toggle');
        if (toggle) toggle.textContent = collapsedBranches.has(id) ? '▶' : '▼';
    }
}

function counterStep(nodeId, direction) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    const step = node.step || 1;
    node.value = clampValue(node, node.value + direction * step);
    saveData(data);

    refreshCounterCard(nodeId, node);
    if (focusNodeId === nodeId) updateFocusDisplay();
}

function resetNodeValue(nodeId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    node.value = initialValue(node);
    saveData(data);
    refreshCounterCard(nodeId, node);
    if (focusNodeId === nodeId) updateFocusDisplay();
}

function resetNodeStep(nodeId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    node.step = 1;
    saveData(data);
    refreshCounterCard(nodeId, node);
    if (focusNodeId === nodeId) updateFocusDisplay();
}

function refreshCounterCard(nodeId, node) {
    const wrapper = document.querySelector(`.tree-node[data-id="${nodeId}"]`);
    if (!wrapper) return;
    const oldCard = wrapper.querySelector('.counter-card');
    if (!oldCard) return;
    const newCard = renderCounter(node);
    if (nodeEditActive === nodeId) newCard.classList.add('node-edit-active');
    wrapper.replaceChild(newCard, oldCard);
}

// ═══════════════════════════════════════════════
// Focus modal
// ═══════════════════════════════════════════════

let focusNodeId = null;

function openFocusModal(nodeId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    focusNodeId = nodeId;
    document.getElementById('focusName').textContent = node.name;
    updateFocusDisplay();
    document.getElementById('focusModal').classList.add('open');
}

function updateFocusDisplay() {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
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

function activateFocusValueInput() {
    document.getElementById('focusValueDisplay').classList.add('editing');
    const input = document.getElementById('focusValueInput');
    input.focus();
    input.select();
}

function onFocusValueInput() {
    const val = parseInt(document.getElementById('focusValueInput').value);
    if (isNaN(val)) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;
    node.value = clampValue(node, val);
    saveData(data);
    updateFocusDisplay();
    refreshCounterCard(focusNodeId, node);
}

function onFocusValueBlur() {
    document.getElementById('focusValueDisplay').classList.remove('editing');
}

function activateFocusStepInput() {
    document.getElementById('focusStepDisplay').classList.add('editing');
    const input = document.getElementById('focusStepInput');
    input.focus();
    input.select();
}

// FIX #21: use parseFloat consistently for step — was parseInt in saveAddCounter,
// causing a step of e.g. 1.5 set in the focus modal to be truncated to 1 on next edit-save.
function onFocusStepInput() {
    const val = parseFloat(document.getElementById('focusStepInput').value);
    if (isNaN(val) || val < 1) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;
    node.step = val;
    saveData(data);
    updateFocusDisplay();
}

function onFocusStepBlur() {
    document.getElementById('focusStepDisplay').classList.remove('editing');
}

function focusStep(direction, useOne) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;
    const stepAmt = useOne ? 1 : (node.step || 1);
    node.value = clampValue(node, node.value + direction * stepAmt);
    saveData(data);
    updateFocusDisplay();
    refreshCounterCard(focusNodeId, node);
}

function focusResetValue() {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;
    node.value = initialValue(node);
    saveData(data);
    updateFocusDisplay();
    refreshCounterCard(focusNodeId, node);
}

function closeFocusModal() {
    focusNodeId = null;
    document.getElementById('focusModal').classList.remove('open');
}

// ═══════════════════════════════════════════════
// Swatch popover
// ═══════════════════════════════════════════════

let currentSwatchColor = DEFAULT_COLOR;

function buildSwatchPopover(popoverId, selectedColor, onSelect) {
    const popover = document.getElementById(popoverId);
    popover.innerHTML = '';
    SWATCHES.forEach(sw => {
        const dot = document.createElement('div');
        dot.className = 'swatch' + (sw.color === selectedColor ? ' selected' : '');
        dot.style.background = sw.color;
        dot.title = sw.name;
        dot.onclick = (e) => {
            e.stopPropagation();
            onSelect(sw.color);
            popover.classList.remove('open');
        };
        popover.appendChild(dot);
    });
}

function toggleSwatchPopover(event) {
    event.stopPropagation();
    const popover = document.getElementById('acSwatchPopover');
    if (popover.classList.contains('open')) {
        popover.classList.remove('open');
    } else {
        buildSwatchPopover('acSwatchPopover', currentSwatchColor, color => {
            currentSwatchColor = color;
            updateColorField(color);
        });
        popover.classList.add('open');
    }
}

function updateColorField(color) {
    const sw = swatchByColor(color);
    document.getElementById('acColorDot').style.background = sw.color;
    document.getElementById('acColorName').textContent = sw.name;
    currentSwatchColor = color;
}

document.addEventListener('click', () => {
    const popover = document.getElementById('acSwatchPopover');
    if (popover) popover.classList.remove('open');
});

// ═══════════════════════════════════════════════
// Parent selector helper
// ═══════════════════════════════════════════════

function populateParentSelect(selectId, excludeId, selectedParentId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    const sel = document.getElementById(selectId);
    sel.innerHTML = '<option value="">(Root level)</option>';
    if (!game) return;
    getAllBranches(game.nodes || []).forEach(b => {
        if (excludeId && (b.id === excludeId || isAncestor(game.nodes, excludeId, b.id))) return;
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = '\u00a0\u00a0'.repeat(b.depth) + b.name;
        if (b.id === selectedParentId) opt.selected = true;
        sel.appendChild(opt);
    });
}

// ═══════════════════════════════════════════════
// Add / Edit Branch modal
// ═══════════════════════════════════════════════

let editingBranchId = null;

function openAddBranchModal(parentId) {
    editingBranchId = null;
    document.getElementById('addBranchTitle').textContent = 'Add Branch';
    document.getElementById('addBranchSaveBtn').textContent = 'Add';
    document.getElementById('abName').value = '';
    populateParentSelect('abParent', null, parentId);
    document.getElementById('addBranchModal').classList.add('open');
}

function openEditBranchModal(nodeId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    editingBranchId = nodeId;
    document.getElementById('addBranchTitle').textContent = 'Edit Branch';
    document.getElementById('addBranchSaveBtn').textContent = 'Save';
    document.getElementById('abName').value = node.name;
    const parentNode = findParent(game.nodes, nodeId);
    populateParentSelect('abParent', nodeId, parentNode ? parentNode.id : null);
    document.getElementById('addBranchModal').classList.add('open');
}

function closeAddBranchModal() {
    editingBranchId = null;
    document.getElementById('addBranchModal').classList.remove('open');
}

function saveAddBranch() {
    const name = document.getElementById('abName').value.trim() || 'New Branch';
    const newParentId = document.getElementById('abParent').value || null;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    if (editingBranchId) {
        const node = findNode(game.nodes, editingBranchId);
        if (!node) return;
        node.name = name;
        const currentParent = findParent(game.nodes, editingBranchId);
        const currentParentId = currentParent ? currentParent.id : null;
        if (newParentId !== currentParentId) {
            removeNode(game.nodes, editingBranchId);
            insertNode(game, node, newParentId);
        }
    } else {
        const node = {id: newId(), name, type: 'branch', children: []};
        insertNode(game, node, newParentId);
    }

    saveData(data);
    closeAddBranchModal();
    renderMain();
}

// ═══════════════════════════════════════════════
// Add / Edit Counter modal
// ═══════════════════════════════════════════════

let editingCounterId = null;

function openAddCounterModal(parentId) {
    editingCounterId = null;
    document.getElementById('addCounterTitle').textContent = 'Add Counter';
    document.getElementById('addCounterSaveBtn').textContent = 'Add';
    document.getElementById('acName').value = '';
    document.querySelector('input[name="acCounterType"][value="open"]').checked = true;
    document.getElementById('acBoundedFields').style.display = 'none';
    document.getElementById('acMin').value = '0';
    document.getElementById('acMax').value = '';
    document.getElementById('acInitial').value = '';
    document.getElementById('acValue').value = '0';
    document.getElementById('acStep').value = '1';
    document.getElementById('acDecrement').checked = false;
    onDecrementChange();
    updateColorField(DEFAULT_COLOR);
    populateParentSelect('acParent', null, parentId);
    document.getElementById('addCounterModal').classList.add('open');
}

function openEditCounterModal(nodeId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    editingCounterId = nodeId;
    document.getElementById('addCounterTitle').textContent = 'Edit Counter';
    document.getElementById('addCounterSaveBtn').textContent = 'Save';
    document.getElementById('acName').value = node.name;

    const isBounded = node.counterType === 'bounded';
    document.querySelector(`input[name="acCounterType"][value="${isBounded ? 'bounded' : 'open'}"]`).checked = true;
    document.getElementById('acBoundedFields').style.display = isBounded ? '' : 'none';
    document.getElementById('acMin').value = node.min ?? 0;
    document.getElementById('acMax').value = node.max ?? '';
    document.getElementById('acInitial').value = node.initial ?? '';
    document.getElementById('acValue').value = node.value ?? 0;
    // FIX #21: preserve float step value in the edit modal
    document.getElementById('acStep').value = node.step ?? 1;
    document.getElementById('acDecrement').checked = !!node.decrement;
    onDecrementChange();
    updateColorField(node.color || DEFAULT_COLOR);

    const parentNode = findParent(game.nodes, nodeId);
    populateParentSelect('acParent', null, parentNode ? parentNode.id : null);
    document.getElementById('addCounterModal').classList.add('open');
}

function closeAddCounterModal() {
    editingCounterId = null;
    document.getElementById('acSwatchPopover').classList.remove('open');
    document.getElementById('addCounterModal').classList.remove('open');
}

function onCounterTypeChange() {
    const bounded = document.querySelector('input[name="acCounterType"]:checked')?.value === 'bounded';
    document.getElementById('acBoundedFields').style.display = bounded ? '' : 'none';
}

function onDecrementChange() {
    const decrement = document.getElementById('acDecrement').checked;
    document.getElementById('acMinLabel').textContent = decrement ? 'Minimum Value (floor)' : 'Minimum Value';
    document.getElementById('acMaxLabel').textContent = decrement ? 'Maximum Value (start)' : 'Maximum Value (ceiling)';
}

function saveAddCounter() {
    const name = document.getElementById('acName').value.trim() || 'New Counter';
    const newParentId = document.getElementById('acParent').value || null;
    const isBounded = document.querySelector('input[name="acCounterType"]:checked')?.value === 'bounded';
    const isDecrement = document.getElementById('acDecrement').checked;
    // FIX #21: use parseFloat so fractional steps are preserved on save
    const step = Math.max(1, parseFloat(document.getElementById('acStep').value) || 1);
    const color = currentSwatchColor;

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    let rawValue = parseInt(document.getElementById('acValue').value) || 0;
    let rawMin = parseInt(document.getElementById('acMin').value) ?? 0;
    let rawMax = parseInt(document.getElementById('acMax').value) || null;
    let rawInitial = parseInt(document.getElementById('acInitial').value);
    if (isNaN(rawInitial)) rawInitial = isDecrement ? (rawMax ?? 0) : rawMin;

    if (isBounded && rawMax !== null) rawValue = Math.max(rawMin, Math.min(rawMax, rawValue));

    if (editingCounterId) {
        const node = findNode(game.nodes, editingCounterId);
        if (!node) return;
        node.name = name;
        node.counterType = isBounded ? 'bounded' : 'open';
        node.value = rawValue;
        node.step = step;
        node.color = color;
        node.decrement = isDecrement;
        if (isBounded) {
            node.min = rawMin;
            node.max = rawMax;
            node.initial = rawInitial;
        } else {
            delete node.min;
            delete node.max;
            delete node.initial;
        }

        const currentParent = findParent(game.nodes, editingCounterId);
        const currentParentId = currentParent ? currentParent.id : null;
        if (newParentId !== currentParentId) {
            removeNode(game.nodes, editingCounterId);
            insertNode(game, node, newParentId);
        }
    } else {
        const node = {
            id: newId(),
            name,
            type: 'counter',
            counterType: isBounded ? 'bounded' : 'open',
            value: rawValue,
            step,
            color,
            decrement: isDecrement,
        };
        if (isBounded) {
            node.min = rawMin;
            node.max = rawMax;
            node.initial = rawInitial;
        }
        insertNode(game, node, newParentId);
    }

    saveData(data);
    closeAddCounterModal();
    renderMain();
}

// ═══════════════════════════════════════════════
// Insert node helper
// ═══════════════════════════════════════════════

function insertNode(game, node, parentId) {
    if (parentId) {
        const parent = findNode(game.nodes, parentId);
        if (parent) {
            if (!parent.children) parent.children = [];
            parent.children.push(node);
            return;
        }
    }
    if (!game.nodes) game.nodes = [];
    game.nodes.push(node);
}

function newId() {
    return 'node_' + Date.now() + '_' + Math.floor(Math.random() * 99999);
}

// ═══════════════════════════════════════════════
// Add / Edit / Delete Game
// ═══════════════════════════════════════════════

let editingGameId = null;

function openAddGameModal() {
    editingGameId = null;
    document.getElementById('gameModalTitle').textContent = 'Add Game';
    document.getElementById('gmName').value = '';
    document.getElementById('gameSettingsDanger').style.display = 'none';
    cancelResetCounters();
    document.getElementById('gameModal').classList.add('open');
}

function openGameSettingsModal() {
    if (!selectedGameId) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    editingGameId = selectedGameId;
    document.getElementById('gameModalTitle').textContent = 'Game Settings';
    document.getElementById('gmName').value = game.name;
    document.getElementById('gameSettingsDanger').style.display = '';
    cancelResetCounters();
    document.getElementById('gameModal').classList.add('open');
}

function closeGameModal() {
    cancelResetCounters();
    document.getElementById('gameModal').classList.remove('open');
}

function saveGame() {
    const name = document.getElementById('gmName').value.trim();
    if (!name) {
        alert('Please enter a game title.');
        return;
    }
    const data = loadData();
    if (editingGameId) {
        const game = data.games.find(g => g.id === editingGameId);
        if (game) game.name = name;
    } else {
        const game = {id: 'game_' + Date.now(), name, nodes: []};
        data.games.push(game);
        selectedGameId = game.id;
        localStorage.setItem(STORAGE_SELECTED, selectedGameId);
    }
    saveData(data);
    closeGameModal();
    renderSelector();
    if (selectedGameId) document.getElementById('gameSelect').value = selectedGameId;
    renderMain();
}

function promptResetCounters() {
    document.getElementById('resetConfirmRow').style.opacity = '0.4';
    document.getElementById('resetConfirm').style.display = '';
}

function cancelResetCounters() {
    const row = document.getElementById('resetConfirmRow');
    const confirm = document.getElementById('resetConfirm');
    if (row) row.style.opacity = '';
    if (confirm) confirm.style.display = 'none';
}

function confirmResetCounters() {
    if (!selectedGameId) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    function resetNodes(nodes) {
        for (const n of nodes) {
            if (n.type === 'counter') n.value = initialValue(n);
            if (n.children) resetNodes(n.children);
        }
    }

    resetNodes(game.nodes || []);
    saveData(data);
    closeGameModal();
    renderMain();
}

// ═══════════════════════════════════════════════
// Delete
// ═══════════════════════════════════════════════

let pendingDeleteId = null;
let pendingDeleteType = null;

function openConfirmDeleteNode(nodeId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    pendingDeleteId = nodeId;
    pendingDeleteType = 'node';
    document.getElementById('confirmNodeName').textContent = node.name;
    document.getElementById('confirmNodeExtra').textContent = node.type === 'branch'
        ? `This will also delete ${countDescendants(node)} child node(s).`
        : 'This cannot be undone.';
    document.getElementById('confirmOverlay').classList.add('open');
}

function openConfirmDeleteGame() {
    if (!selectedGameId) return;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    closeGameModal();
    pendingDeleteId = selectedGameId;
    pendingDeleteType = 'game';
    document.getElementById('confirmNodeName').textContent = game.name;
    document.getElementById('confirmNodeExtra').textContent = 'All counters and nodes will be permanently deleted.';
    document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() {
    pendingDeleteId = null;
    pendingDeleteType = null;
    document.getElementById('confirmOverlay').classList.remove('open');
}

function confirmDelete() {
    if (!pendingDeleteId) return;
    const data = loadData();
    if (pendingDeleteType === 'node') {
        const game = data.games.find(g => g.id === selectedGameId);
        if (game) removeNode(game.nodes, pendingDeleteId);
    } else if (pendingDeleteType === 'game') {
        data.games = data.games.filter(g => g.id !== pendingDeleteId);
        if (selectedGameId === pendingDeleteId) {
            selectedGameId = null;
            localStorage.removeItem(STORAGE_SELECTED);
        }
    }
    saveData(data);
    closeConfirm();
    renderSelector();
    renderMain();
}

// ═══════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════
// Quick Counter
// ═══════════════════════════════════════════════

// FIX (QC color bug): generate the random color once and persist it immediately,
// so all subsequent qcLoad() calls in the same session return the same color.
// Previously the fallback called qcRandomColor() inline without saving, meaning
// every qcLoad() call could generate a new color, desynchronising the title
// and button accent colors.
function qcLoad() {
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

function qcSave(val, step, color) {
    localStorage.setItem(STORAGE_QC_VAL, val);
    localStorage.setItem(STORAGE_QC_STEP, step);
    localStorage.setItem(STORAGE_QC_COLOR, color);
}

function qcReset() {
    localStorage.removeItem(STORAGE_QC_VAL);
    localStorage.removeItem(STORAGE_QC_STEP);
    localStorage.removeItem(STORAGE_QC_COLOR);
}

function qcRandomColor() {
    return SWATCHES[Math.floor(Math.random() * SWATCHES.length)].color;
}

function openQuickCounter() {
    const {val, step, color} = qcLoad();
    document.getElementById('qcTitle').style.color = color;
    document.getElementById('qcTitle').style.textShadow = `0 0 16px ${color}80`;
    updateQcDisplay(val, step, color);
    document.getElementById('quickCounterModal').classList.add('open');
}

function updateQcDisplay(val, step, color) {
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

    // FIX #22: apply muted style to minus buttons when value is already at floor (0),
    // giving the user clear feedback that the counter cannot go lower.
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

function qcStep(direction, useOne) {
    const {val, step, color} = qcLoad();
    const amt = useOne ? 1 : step;
    const newVal = Math.max(0, val + direction * amt);
    qcSave(newVal, step, color);
    updateQcDisplay(newVal, step, color);
}

function activateQcValueInput() {
    document.getElementById('qcValueDisplay').classList.add('editing');
    const input = document.getElementById('qcValueInput');
    input.focus();
    input.select();
}

function onQcValueInput() {
    const raw = parseFloat(document.getElementById('qcValueInput').value);
    if (isNaN(raw)) return;
    const val = Math.max(0, raw);
    const {step, color} = qcLoad();
    qcSave(val, step, color);
    updateQcDisplay(val, step, color);
}

function onQcValueBlur() {
    document.getElementById('qcValueDisplay').classList.remove('editing');
}

function activateQcStepInput() {
    document.getElementById('qcStepDisplay').classList.add('editing');
    const input = document.getElementById('qcStepInput');
    input.focus();
    input.select();
}

function onQcStepInput() {
    const raw = parseFloat(document.getElementById('qcStepInput').value);
    if (isNaN(raw) || raw < 1) return;
    const {val, color} = qcLoad();
    qcSave(val, raw, color);
    updateQcDisplay(val, raw, color);
}

function onQcStepBlur() {
    document.getElementById('qcStepDisplay').classList.remove('editing');
}

function qcResetValue() {
    const {step, color} = qcLoad();
    qcSave(0, step, color);
    updateQcDisplay(0, step, color);
}

function closeQuickCounter() {
    qcReset();
    document.getElementById('quickCounterModal').classList.remove('open');
}

// ═══════════════════════════════════════════════
// Init
// FIX #1: removed duplicate initTheme() call — called once in index.html.
// ═══════════════════════════════════════════════

const _initData = loadData();
selectedGameId = restoreSelectedGame(_initData);
renderSelector();
renderMain();