// ═══════════════════════════════════════════════
// Storage
// ═══════════════════════════════════════════════

const STORAGE_KEY      = 'bgt:thing-counter:data';
const STORAGE_SELECTED = 'bgt:thing-counter:selected-game';

function loadData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { games: [] }; }
    catch { return { games: [] }; }
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ═══════════════════════════════════════════════
// Color palette (Google-Calendar-style names)
// ═══════════════════════════════════════════════

const SWATCHES = [
    { color: '#00e5ff', name: 'Cyan'       },
    { color: '#ff6b35', name: 'Tangerine'  },
    { color: '#7fff6b', name: 'Sage'       },
    { color: '#ff4488', name: 'Flamingo'   },
    { color: '#aa44ff', name: 'Grape'      },
    { color: '#ffcc00', name: 'Banana'     },
    { color: '#ff4444', name: 'Tomato'     },
    { color: '#44aaff', name: 'Peacock'    },
    { color: '#00ffaa', name: 'Mint'       },
    { color: '#ff8800', name: 'Pumpkin'    },
    { color: '#66ffff', name: 'Mist'       },
    { color: '#ff66aa', name: 'Blush'      },
    { color: '#88ff44', name: 'Lime'       },
    { color: '#4466ff', name: 'Blueberry'  },
    { color: '#ffaa44', name: 'Peach'      },
    { color: '#00ccaa', name: 'Teal'       },
    { color: '#cc44ff', name: 'Lavender'   },
    { color: '#ff4400', name: 'Basil'      },
    { color: '#aaccff', name: 'Steel'      },
    { color: '#cccccc', name: 'Graphite'   },
];

const DEFAULT_COLOR = '#00e5ff';

function swatchByColor(color) {
    return SWATCHES.find(s => s.color === color) || SWATCHES[0];
}

// ═══════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════

let selectedGameId  = null;
let editMode        = false;
let nodeEditActive  = null; // id of single node in local edit mode

// ═══════════════════════════════════════════════
// Game selector
// ═══════════════════════════════════════════════

function updateGameActionButtons(data) {
    const hasGame = !!selectedGameId && !!data.games.find(g => g.id === selectedGameId);
    document.getElementById('editGameBtn').style.display   = hasGame ? '' : 'none';
    document.getElementById('treeActionBar').style.display = hasGame ? '' : 'none';
}

function renderSelector() {
    const data = loadData();
    const sel  = document.getElementById('gameSelect');
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
    if (selectedGameId) localStorage.setItem(STORAGE_SELECTED, selectedGameId);
    else localStorage.removeItem(STORAGE_SELECTED);
    updateGameActionButtons(loadData());
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
    const btn     = document.getElementById('editModeBtn');
    const content = document.getElementById('mainContent');
    btn.classList.toggle('active', editMode);
    content.classList.toggle('edit-mode', editMode);
    // Update banner
    const banner = content.querySelector('.edit-mode-banner');
    if (banner) banner.classList.toggle('visible', editMode);
    // Refresh edit overlays on all counter cards
    content.querySelectorAll('.counter-card').forEach(card => card.classList.remove('node-edit-active'));
    content.querySelectorAll('.branch-row').forEach(row => row.classList.remove('node-edit-active'));
}

function activateNodeEdit(nodeId) {
    // Toggle single-node edit mode (long-press / dblclick)
    if (editMode) return; // already in global edit mode
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
        if (nodes[i].id === id) { nodes.splice(i, 1); return true; }
        if (nodes[i].children && removeNode(nodes[i].children, id)) return true;
    }
    return false;
}

function getAllBranches(nodes, result = [], depth = 0) {
    for (const n of nodes) {
        if (n.type === 'branch') {
            result.push({ id: n.id, name: n.name, depth });
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
    const min   = node.min ?? 0;
    const max   = node.max ?? 0;
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

    if (!selectedGameId) {
        const data = loadData();
        content.innerHTML = data.games.length === 0
            ? `<div class="empty-state"><div class="big">🎮</div>No games yet.<br>Hit <strong>+ Game</strong> to get started.</div>`
            : `<div class="empty-state">Select a game above.</div>`;
        content.classList.remove('edit-mode');
        return;
    }

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) { content.innerHTML = ''; return; }

    content.innerHTML = `
        <div class="edit-mode-banner${editMode ? ' visible' : ''}">✏️ Edit Mode</div>
        <div class="tree-root" id="treeRoot"></div>
    `;
    content.classList.toggle('edit-mode', editMode);

    const treeRoot = document.getElementById('treeRoot');
    renderNodes(game.nodes || [], treeRoot);

    // Root-level ghost add button
    const ghost = document.createElement('button');
    ghost.className = 'add-ghost-btn';
    ghost.textContent = '+ Add counter to root';
    ghost.onclick = () => openAddCounterModal(null);
    treeRoot.appendChild(ghost);
}

function renderNodes(nodes, container) {
    nodes.forEach(node => container.appendChild(renderNode(node)));
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
        e.stopPropagation(); openAddBranchModal(node.id);
    });
    row.querySelector('[data-action="edit"]').addEventListener('click', e => {
        e.stopPropagation(); openEditBranchModal(node.id);
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', e => {
        e.stopPropagation(); openConfirmDeleteNode(node.id);
    });

    // Click anywhere on row = toggle collapse
    row.addEventListener('click', () => toggleBranch(node.id));
    // Double-click = activate node edit
    row.addEventListener('dblclick', e => { e.preventDefault(); activateNodeEdit(node.id); });
    // Long-press for mobile
    attachLongPress(row, () => activateNodeEdit(node.id));

    return row;
}

function renderCounter(node) {
    const card = document.createElement('div');
    card.className = 'counter-card' + (nodeEditActive === node.id ? ' node-edit-active' : '');

    const isBounded  = node.counterType === 'bounded';
    const isDecrement = !!node.decrement;
    const color      = node.color || DEFAULT_COLOR;
    const step       = node.step || 1;
    const pct        = fillPercent(node);
    const valueLabel = isBounded ? `${node.value} / ${node.max ?? '?'}` : `${node.value}`;
    const stepLabel  = step !== 1 ? step : '';

    // Dominant button logic
    const plusLabel  = stepLabel ? `+${step}` : '+';
    const minusLabel = stepLabel ? `−${step}` : '−';
    const plusClass  = 'c-btn ' + (isDecrement ? 'subdued' : 'dominant');
    const minusClass = 'c-btn ' + (isDecrement ? 'dominant' : 'subdued');
    const plusStyle  = isDecrement ? '' : `color:${color};border-color:${color}`;
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

    // Step buttons
    card.querySelectorAll('[data-step]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            counterStep(node.id, parseInt(btn.dataset.step));
        });
    });

    // Edit controls
    card.querySelector('[data-action="edit"]').addEventListener('click',      e => { e.stopPropagation(); openEditCounterModal(node.id); });
    card.querySelector('[data-action="resetstep"]').addEventListener('click', e => { e.stopPropagation(); resetNodeStep(node.id); });
    card.querySelector('[data-action="resetval"]').addEventListener('click',  e => { e.stopPropagation(); resetNodeValue(node.id); });
    card.querySelector('[data-action="delete"]').addEventListener('click',    e => { e.stopPropagation(); openConfirmDeleteNode(node.id); });

    // Click name → focus modal
    card.querySelector('.counter-name').addEventListener('click', e => {
        e.stopPropagation();
        openFocusModal(node.id);
    });

    // Double-click card → single-node edit
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
    el.addEventListener('pointerdown', () => {
        timer = setTimeout(() => { timer = null; callback(); }, 500);
    });
    el.addEventListener('pointerup',    () => { if (timer) { clearTimeout(timer); timer = null; } });
    el.addEventListener('pointerleave', () => { if (timer) { clearTimeout(timer); timer = null; } });
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

    const isBounded   = node.counterType === 'bounded';
    const isDecrement = !!node.decrement;
    const color       = node.color || DEFAULT_COLOR;
    const step        = node.step || 1;

    // Value display
    const display = document.getElementById('focusValueDisplay');
    display.textContent = isBounded ? `${node.value} / ${node.max ?? '?'}` : `${node.value}`;
    display.style.color = color;
    display.style.textShadow = `0 0 20px ${color}80`;
    document.getElementById('focusValueInput').value = node.value;

    // Step display
    document.getElementById('focusStepDisplay').textContent = step;
    document.getElementById('focusStepInput').value = step;

    // Button labels and dominance
    const minus1     = document.getElementById('focusMinus1');
    const plus1      = document.getElementById('focusPlus1');
    const minusStep  = document.getElementById('focusMinusStep');
    const plusStep   = document.getElementById('focusPlusStep');
    const btnRow1    = document.getElementById('focusBtnRow1');
    const btnRow2    = document.getElementById('focusBtnRow2');

    minus1.textContent    = '−1';
    plus1.textContent     = '+1';
    minusStep.textContent = `−${step}`;
    plusStep.textContent  = `+${step}`;

    // Swap dominance for decrement
    [btnRow1, btnRow2].forEach(row => row.classList.toggle('decrement', isDecrement));
    [minus1, minusStep].forEach(btn => {
        btn.classList.toggle('dominant', isDecrement);
        btn.style.color       = isDecrement ? color : '';
        btn.style.borderColor = isDecrement ? color : '';
    });
    [plus1, plusStep].forEach(btn => {
        btn.classList.toggle('subdued', isDecrement);
        btn.style.color       = isDecrement ? '' : color;
        btn.style.borderColor = isDecrement ? '' : color;
    });

    // Fill bar
    const fillWrap = document.getElementById('focusFillWrap');
    const fillBar  = document.getElementById('focusFillBar');
    if (isBounded) {
        fillWrap.classList.add('visible');
        fillBar.style.width      = fillPercent(node) + '%';
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

function onFocusStepInput() {
    const val = parseInt(document.getElementById('focusStepInput').value);
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

function toggleSwatchPopover() {
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
    document.getElementById('acColorName').textContent     = sw.name;
    currentSwatchColor = color;
}

// Close popover when clicking outside
document.addEventListener('click', () => {
    const popover = document.getElementById('acSwatchPopover');
    if (popover) popover.classList.remove('open');
});

// ═══════════════════════════════════════════════
// Parent selector helper
// ═══════════════════════════════════════════════

function populateParentSelect(selectId, excludeId, selectedParentId) {
    const data   = loadData();
    const game   = data.games.find(g => g.id === selectedGameId);
    const sel    = document.getElementById(selectId);
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
    document.getElementById('addBranchTitle').textContent    = 'Add Branch';
    document.getElementById('addBranchSaveBtn').textContent  = 'Add';
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
    document.getElementById('addBranchTitle').textContent    = 'Edit Branch';
    document.getElementById('addBranchSaveBtn').textContent  = 'Save';
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
        // Re-parent if needed
        const currentParent   = findParent(game.nodes, editingBranchId);
        const currentParentId = currentParent ? currentParent.id : null;
        if (newParentId !== currentParentId) {
            removeNode(game.nodes, editingBranchId);
            insertNode(game, node, newParentId);
        }
    } else {
        const node = {
            id: newId(),
            name,
            type: 'branch',
            children: [],
        };
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
    document.getElementById('addCounterTitle').textContent   = 'Add Counter';
    document.getElementById('addCounterSaveBtn').textContent = 'Add';
    document.getElementById('acName').value = '';
    document.querySelector('input[name="acCounterType"][value="open"]').checked = true;
    document.getElementById('acBoundedFields').style.display = 'none';
    document.getElementById('acMin').value     = '0';
    document.getElementById('acMax').value     = '';
    document.getElementById('acInitial').value = '';
    document.getElementById('acValue').value   = '0';
    document.getElementById('acStep').value    = '1';
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
    document.getElementById('addCounterTitle').textContent   = 'Edit Counter';
    document.getElementById('addCounterSaveBtn').textContent = 'Save';
    document.getElementById('acName').value = node.name;

    const isBounded = node.counterType === 'bounded';
    document.querySelector(`input[name="acCounterType"][value="${isBounded ? 'bounded' : 'open'}"]`).checked = true;
    document.getElementById('acBoundedFields').style.display = isBounded ? '' : 'none';
    document.getElementById('acMin').value     = node.min     ?? 0;
    document.getElementById('acMax').value     = node.max     ?? '';
    document.getElementById('acInitial').value = node.initial ?? '';
    document.getElementById('acValue').value   = node.value   ?? 0;
    document.getElementById('acStep').value    = node.step    ?? 1;
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
    const name        = document.getElementById('acName').value.trim() || 'New Counter';
    const newParentId = document.getElementById('acParent').value || null;
    const isBounded   = document.querySelector('input[name="acCounterType"]:checked')?.value === 'bounded';
    const isDecrement = document.getElementById('acDecrement').checked;
    const step        = Math.max(1, parseInt(document.getElementById('acStep').value) || 1);
    const color       = currentSwatchColor;

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    let rawValue   = parseInt(document.getElementById('acValue').value)   || 0;
    let rawMin     = parseInt(document.getElementById('acMin').value)     ?? 0;
    let rawMax     = parseInt(document.getElementById('acMax').value)     || null;
    let rawInitial = parseInt(document.getElementById('acInitial').value);
    if (isNaN(rawInitial)) rawInitial = isDecrement ? (rawMax ?? 0) : rawMin;

    if (isBounded && rawMax !== null) rawValue = Math.max(rawMin, Math.min(rawMax, rawValue));

    if (editingCounterId) {
        const node = findNode(game.nodes, editingCounterId);
        if (!node) return;
        node.name        = name;
        node.counterType = isBounded ? 'bounded' : 'open';
        node.value       = rawValue;
        node.step        = step;
        node.color       = color;
        node.decrement   = isDecrement;
        if (isBounded) { node.min = rawMin; node.max = rawMax; node.initial = rawInitial; }
        else           { delete node.min; delete node.max; delete node.initial; }

        // Re-parent if needed
        const currentParent   = findParent(game.nodes, editingCounterId);
        const currentParentId = currentParent ? currentParent.id : null;
        if (newParentId !== currentParentId) {
            removeNode(game.nodes, editingCounterId);
            insertNode(game, node, newParentId);
        }
    } else {
        const node = {
            id:          newId(),
            name,
            type:        'counter',
            counterType: isBounded ? 'bounded' : 'open',
            value:       rawValue,
            step,
            color,
            decrement:   isDecrement,
        };
        if (isBounded) { node.min = rawMin; node.max = rawMax; node.initial = rawInitial; }
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
    if (!name) { alert('Please enter a game title.'); return; }
    const data = loadData();
    if (editingGameId) {
        const game = data.games.find(g => g.id === editingGameId);
        if (game) game.name = name;
    } else {
        const game = { id: 'game_' + Date.now(), name, nodes: [] };
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
    const row     = document.getElementById('resetConfirmRow');
    const confirm = document.getElementById('resetConfirm');
    if (row)     row.style.opacity = '';
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

let pendingDeleteId   = null;
let pendingDeleteType = null;

function openConfirmDeleteNode(nodeId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;
    pendingDeleteId   = nodeId;
    pendingDeleteType = 'node';
    document.getElementById('confirmNodeName').textContent  = node.name;
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
    // Close game settings modal first, then show confirm
    closeGameModal();
    pendingDeleteId   = selectedGameId;
    pendingDeleteType = 'game';
    document.getElementById('confirmNodeName').textContent  = game.name;
    document.getElementById('confirmNodeExtra').textContent = 'All counters and nodes will be permanently deleted.';
    document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() {
    pendingDeleteId   = null;
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
// Init
// ═══════════════════════════════════════════════

const _initData = loadData();
selectedGameId = restoreSelectedGame(_initData);
renderSelector();
renderMain();