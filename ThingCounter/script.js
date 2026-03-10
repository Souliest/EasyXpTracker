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
// Swatches
// ═══════════════════════════════════════════════

const SWATCHES = [
    '#00e5ff', // cyan (accent)
    '#ff6b35', // orange (accent2)
    '#7fff6b', // green (accent3)
    '#ff4488', // hot pink
    '#aa44ff', // purple
    '#ffcc00', // yellow
    '#ff4444', // red
    '#44aaff', // sky blue
    '#00ffaa', // mint
    '#ff8800', // amber
    '#66ffff', // pale cyan
    '#ff66aa', // rose
    '#88ff44', // lime
    '#4466ff', // indigo
    '#ffaa44', // peach
    '#00ccaa', // teal
    '#cc44ff', // violet
    '#ff4400', // deep orange
    '#aaccff', // periwinkle
    '#cccccc', // silver
];

const DEFAULT_COLOR = '#00e5ff';

// ═══════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════

let selectedGameId = null;
let editMode = false;

// ═══════════════════════════════════════════════
// Game selector
// ═══════════════════════════════════════════════

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
}

function selectGame(id) {
    selectedGameId = id || null;
    if (selectedGameId) localStorage.setItem(STORAGE_SELECTED, selectedGameId);
    else localStorage.removeItem(STORAGE_SELECTED);
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
    const btn = document.getElementById('editModeBtn');
    const banner = document.querySelector('.edit-mode-banner');
    const content = document.getElementById('mainContent');
    if (editMode) {
        btn.classList.add('active');
        banner && banner.classList.add('visible');
        content.classList.add('edit-mode');
    } else {
        btn.classList.remove('active');
        banner && banner.classList.remove('visible');
        content.classList.remove('edit-mode');
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
    // Returns true if ancestorId is an ancestor of targetId
    function check(node) {
        if (!node.children) return false;
        for (const c of node.children) {
            if (c.id === targetId) return true;
            if (check(c)) return true;
        }
        return false;
    }
    const ancestor = findNode(nodes, ancestorId);
    return ancestor ? check(ancestor) : false;
}

// ═══════════════════════════════════════════════
// Render: main
// ═══════════════════════════════════════════════

// Track collapsed state outside data so it doesn't persist
const collapsedBranches = new Set();

function renderMain() {
    const content = document.getElementById('mainContent');

    // Ensure edit mode banner exists
    let banner = content.querySelector('.edit-mode-banner');

    if (!selectedGameId) {
        const data = loadData();
        content.innerHTML = data.games.length === 0
            ? `<div class="empty-state"><div class="big">🎮</div>No games yet.<br>Hit <strong>+ Game</strong> to get started.</div>`
            : `<div class="empty-state">Select a game above.</div>`;
        if (editMode) content.classList.add('edit-mode');
        return;
    }

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) { content.innerHTML = ''; return; }

    content.innerHTML = `
        <div class="edit-mode-banner${editMode ? ' visible' : ''}">✏️ Edit Mode — tap + to add nodes, ✎ to edit, 🗑 to delete</div>
        <div class="tree-root" id="treeRoot"></div>
    `;
    if (editMode) content.classList.add('edit-mode');
    else content.classList.remove('edit-mode');

    const treeRoot = document.getElementById('treeRoot');
    renderNodes(game.nodes || [], treeRoot, null);

    // Add root-level add button
    const addRootBtn = document.createElement('button');
    addRootBtn.className = 'add-root-btn';
    addRootBtn.textContent = '+ Add to root';
    addRootBtn.onclick = () => openAddNodeModal(null);
    treeRoot.appendChild(addRootBtn);
}

function renderNodes(nodes, container, parentId) {
    nodes.forEach(node => {
        const el = renderNode(node, parentId);
        container.appendChild(el);
    });
}

function renderNode(node, parentId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';
    wrapper.dataset.id = node.id;

    if (node.type === 'branch') {
        wrapper.appendChild(renderBranch(node));
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-node-children' + (collapsedBranches.has(node.id) ? ' collapsed' : '');
        childContainer.id = 'children-' + node.id;
        if (node.children && node.children.length > 0) {
            renderNodes(node.children, childContainer, node.id);
        }
        // Add-child button (only visible in edit mode via CSS)
        const addChildBtn = document.createElement('button');
        addChildBtn.className = 'add-root-btn';
        addChildBtn.textContent = '+ Add child';
        addChildBtn.onclick = () => openAddNodeModal(node.id);
        childContainer.appendChild(addChildBtn);
        wrapper.appendChild(childContainer);
    } else {
        wrapper.appendChild(renderCounter(node));
    }

    return wrapper;
}

function renderBranch(node) {
    const row = document.createElement('div');
    row.className = 'branch-row';

    const isCollapsed = collapsedBranches.has(node.id);
    const hasChildren = node.children && node.children.length > 0;

    row.innerHTML = `
        <button class="branch-toggle" onclick="toggleBranch('${node.id}')" title="${isCollapsed ? 'Expand' : 'Collapse'}">${isCollapsed ? '▶' : '▼'}</button>
        <span class="branch-name">${escHtml(node.name)}</span>
        <div class="node-edit-controls">
            <button class="node-btn add-child" onclick="openAddNodeModal('${node.id}')">+</button>
            <button class="node-btn" onclick="openEditNodeModal('${node.id}')">✎</button>
            <button class="node-btn danger" onclick="openConfirmDeleteNode('${node.id}')">🗑</button>
        </div>
    `;
    return row;
}

function renderCounter(node) {
    const card = document.createElement('div');
    card.className = 'counter-card';

    const isBounded = node.counterType === 'bounded' && node.max > 0;
    const pct = isBounded ? Math.min(100, Math.max(0, (node.value / node.max) * 100)) : 0;
    const color = node.color || DEFAULT_COLOR;
    const valueDisplay = isBounded ? `${node.value} / ${node.max}` : `${node.value}`;

    card.innerHTML = `
        <div class="counter-inner">
            <span class="counter-name" onclick="openFocusModal('${node.id}')">${escHtml(node.name)}</span>
            <span class="counter-value-display" style="color:${color}">${valueDisplay}</span>
            <div class="counter-btns">
                <button class="c-btn minus" onclick="counterStep('${node.id}', -1)">−</button>
                <button class="c-btn plus" style="color:${color};border-color:${color}" onclick="counterStep('${node.id}', 1)">+</button>
            </div>
        </div>
        ${isBounded ? `<div class="counter-fill-bar-wrap"><div class="counter-fill-bar" style="width:${pct}%;background:${color}"></div></div>` : ''}
        <div class="counter-edit-overlay">
            <button class="node-btn" onclick="openEditNodeModal('${node.id}')">✎ Edit</button>
            <button class="node-btn danger" onclick="openConfirmDeleteNode('${node.id}')">🗑 Delete</button>
        </div>
    `;
    return card;
}

// ═══════════════════════════════════════════════
// Tree interactions
// ═══════════════════════════════════════════════

function toggleBranch(id) {
    if (collapsedBranches.has(id)) collapsedBranches.delete(id);
    else collapsedBranches.add(id);

    const childContainer = document.getElementById('children-' + id);
    if (childContainer) childContainer.classList.toggle('collapsed', collapsedBranches.has(id));

    // Update toggle icon
    const wrapper = document.querySelector(`.tree-node[data-id="${id}"]`);
    if (wrapper) {
        const btn = wrapper.querySelector('.branch-toggle');
        if (btn) btn.textContent = collapsedBranches.has(id) ? '▶' : '▼';
    }
}

function counterStep(nodeId, direction) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    const step = node.step || 1;
    let newVal = node.value + direction * step;
    if (node.counterType === 'bounded' && node.max > 0) {
        newVal = Math.max(0, Math.min(node.max, newVal));
    } else {
        newVal = Math.max(0, newVal);
    }
    node.value = newVal;
    saveData(data);

    // Re-render just the counter card
    const wrapper = document.querySelector(`.tree-node[data-id="${nodeId}"]`);
    if (wrapper) {
        const newCard = renderCounter(node);
        wrapper.replaceChild(newCard, wrapper.firstChild);
    }

    // If focus modal is open for this node, update it
    if (focusNodeId === nodeId) updateFocusDisplay();
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

    const isBounded = node.counterType === 'bounded' && node.max > 0;
    const fillWrap = document.getElementById('focusFillWrap');
    const fillBar = document.getElementById('focusFillBar');
    if (isBounded) {
        fillWrap.classList.add('visible');
        fillBar.style.background = node.color || DEFAULT_COLOR;
        updateFocusFillBar(node);
    } else {
        fillWrap.classList.remove('visible');
    }

    document.getElementById('focusModal').classList.add('open');
}

function updateFocusDisplay() {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, focusNodeId);
    if (!node) return;

    const isBounded = node.counterType === 'bounded' && node.max > 0;
    const display = document.getElementById('focusValueDisplay');
    const input = document.getElementById('focusValueInput');
    const stepDisplay = document.getElementById('focusStepDisplay');
    const stepInput = document.getElementById('focusStepInput');
    const minusStepBtn = document.getElementById('focusMinusStep');
    const plusStepBtn = document.getElementById('focusPlusStep');

    const color = node.color || DEFAULT_COLOR;
    display.textContent = isBounded ? `${node.value} / ${node.max}` : `${node.value}`;
    display.style.color = color;
    display.style.textShadow = `0 0 20px ${color}80`;
    input.value = node.value;

    const step = node.step || 1;
    stepDisplay.textContent = step;
    stepInput.value = step;
    minusStepBtn.textContent = `−${step}`;
    plusStepBtn.textContent = `+${step}`;
    plusStepBtn.style.color = color;
    plusStepBtn.style.borderColor = color;

    if (isBounded) updateFocusFillBar(node);
}

function updateFocusFillBar(node) {
    const pct = Math.min(100, Math.max(0, (node.value / node.max) * 100));
    document.getElementById('focusFillBar').style.width = pct + '%';
    document.getElementById('focusFillBar').style.background = node.color || DEFAULT_COLOR;
}

function activateFocusValueInput() {
    const input = document.getElementById('focusValueInput');
    const display = document.getElementById('focusValueDisplay');
    display.classList.add('editing');
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
    let newVal = val;
    if (node.counterType === 'bounded' && node.max > 0) newVal = Math.max(0, Math.min(node.max, newVal));
    else newVal = Math.max(0, newVal);
    node.value = newVal;
    saveData(data);
    updateFocusDisplay();
    refreshCounterCard(focusNodeId, node);
}

function onFocusValueBlur() {
    document.getElementById('focusValueDisplay').classList.remove('editing');
}

function activateFocusStepInput() {
    const input = document.getElementById('focusStepInput');
    const display = document.getElementById('focusStepDisplay');
    display.classList.add('editing');
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
    let newVal = node.value + direction * stepAmt;
    if (node.counterType === 'bounded' && node.max > 0) newVal = Math.max(0, Math.min(node.max, newVal));
    else newVal = Math.max(0, newVal);
    node.value = newVal;
    saveData(data);
    updateFocusDisplay();
    refreshCounterCard(focusNodeId, node);
}

function refreshCounterCard(nodeId, node) {
    const wrapper = document.querySelector(`.tree-node[data-id="${nodeId}"]`);
    if (wrapper) {
        const newCard = renderCounter(node);
        wrapper.replaceChild(newCard, wrapper.firstChild);
    }
}

function closeFocusModal() {
    focusNodeId = null;
    document.getElementById('focusModal').classList.remove('open');
}

// ═══════════════════════════════════════════════
// Edit node modal
// ═══════════════════════════════════════════════

let editingNodeId = null;
let selectedSwatchColor = DEFAULT_COLOR;

function buildSwatchGrid(selectedColor) {
    const grid = document.getElementById('swatchGrid');
    grid.innerHTML = '';
    SWATCHES.forEach(color => {
        const sw = document.createElement('div');
        sw.className = 'swatch' + (color === selectedColor ? ' selected' : '');
        sw.style.background = color;
        sw.title = color;
        sw.onclick = () => selectSwatch(color);
        grid.appendChild(sw);
    });
    selectedSwatchColor = selectedColor;
}

function selectSwatch(color) {
    selectedSwatchColor = color;
    document.querySelectorAll('.swatch').forEach(sw => {
        sw.classList.toggle('selected', sw.style.background === color || sw.title === color);
    });
}

function populateParentSelect(excludeId, selectedParentId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    const sel = document.getElementById('enParent');
    sel.innerHTML = '<option value="">(Root level)</option>';

    const branches = getAllBranches(game.nodes || []);
    branches.forEach(b => {
        // Can't parent to self or to own descendants
        if (excludeId && (b.id === excludeId || isAncestor(game.nodes, excludeId, b.id))) return;
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = '  '.repeat(b.depth) + b.name;
        if (b.id === selectedParentId) opt.selected = true;
        sel.appendChild(opt);
    });
}

function onEditNodeTypeChange() {
    const nodeType = document.querySelector('input[name="enNodeType"]:checked')?.value;
    document.getElementById('enCounterFields').style.display = nodeType === 'counter' ? '' : 'none';
}

function onEditCounterTypeChange() {
    const counterType = document.querySelector('input[name="enCounterType"]:checked')?.value;
    document.getElementById('enMaxGroup').style.display = counterType === 'bounded' ? '' : 'none';
}

function openAddNodeModal(parentId) {
    editingNodeId = null;
    document.getElementById('editNodeTitle').textContent = 'Add Node';
    document.getElementById('enName').value = '';
    document.querySelector('input[name="enNodeType"][value="counter"]').checked = true;
    document.querySelector('input[name="enCounterType"][value="open"]').checked = true;
    document.getElementById('enValue').value = '0';
    document.getElementById('enMax').value = '';
    document.getElementById('enStep').value = '1';
    document.getElementById('enCounterFields').style.display = '';
    document.getElementById('enMaxGroup').style.display = 'none';
    buildSwatchGrid(DEFAULT_COLOR);
    populateParentSelect(null, parentId);
    document.getElementById('editNodeModal').classList.add('open');
}

function openEditNodeModal(nodeId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    editingNodeId = nodeId;
    document.getElementById('editNodeTitle').textContent = 'Edit Node';
    document.getElementById('enName').value = node.name;

    const nodeTypeRadio = document.querySelector(`input[name="enNodeType"][value="${node.type}"]`);
    if (nodeTypeRadio) nodeTypeRadio.checked = true;
    document.getElementById('enCounterFields').style.display = node.type === 'counter' ? '' : 'none';

    if (node.type === 'counter') {
        const cTypeRadio = document.querySelector(`input[name="enCounterType"][value="${node.counterType || 'open'}"]`);
        if (cTypeRadio) cTypeRadio.checked = true;
        document.getElementById('enMaxGroup').style.display = node.counterType === 'bounded' ? '' : 'none';
        document.getElementById('enValue').value = node.value || 0;
        document.getElementById('enMax').value = node.max || '';
        document.getElementById('enStep').value = node.step || 1;
        buildSwatchGrid(node.color || DEFAULT_COLOR);
    }

    // Find current parent
    const parentNode = findParent(game.nodes, nodeId);
    const parentId = parentNode ? parentNode.id : null;
    populateParentSelect(nodeId, parentId);

    document.getElementById('editNodeModal').classList.add('open');
}

function closeEditNodeModal() {
    editingNodeId = null;
    document.getElementById('editNodeModal').classList.remove('open');
}

function saveEditNode() {
    const name = document.getElementById('enName').value.trim();
    if (!name) { alert('Please enter a name.'); return; }

    const nodeType = document.querySelector('input[name="enNodeType"]:checked')?.value || 'counter';
    const newParentId = document.getElementById('enParent').value || null;

    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;

    if (editingNodeId) {
        // Edit existing
        const node = findNode(game.nodes, editingNodeId);
        if (!node) return;

        node.name = name;
        node.type = nodeType;

        if (nodeType === 'counter') {
            const counterType = document.querySelector('input[name="enCounterType"]:checked')?.value || 'open';
            node.counterType = counterType;
            node.value = parseInt(document.getElementById('enValue').value) || 0;
            node.step = parseInt(document.getElementById('enStep').value) || 1;
            node.color = selectedSwatchColor;
            if (counterType === 'bounded') {
                node.max = parseInt(document.getElementById('enMax').value) || 0;
                node.value = Math.min(node.value, node.max);
            } else {
                node.max = 0;
            }
            // If changing to branch, drop counter fields
        } else {
            // Branch: ensure children array exists
            if (!node.children) node.children = [];
            delete node.counterType;
            delete node.value;
            delete node.max;
            delete node.step;
            delete node.color;
        }

        // Handle re-parenting
        const currentParent = findParent(game.nodes, editingNodeId);
        const currentParentId = currentParent ? currentParent.id : null;

        if (newParentId !== currentParentId) {
            removeNode(game.nodes, editingNodeId);
            if (newParentId) {
                const newParent = findNode(game.nodes, newParentId);
                if (newParent) {
                    if (!newParent.children) newParent.children = [];
                    newParent.children.push(node);
                }
            } else {
                game.nodes.push(node);
            }
        }
    } else {
        // New node
        const newNode = {
            id: 'node_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
            name,
            type: nodeType,
        };

        if (nodeType === 'counter') {
            const counterType = document.querySelector('input[name="enCounterType"]:checked')?.value || 'open';
            newNode.counterType = counterType;
            newNode.value = parseInt(document.getElementById('enValue').value) || 0;
            newNode.step = parseInt(document.getElementById('enStep').value) || 1;
            newNode.color = selectedSwatchColor;
            if (counterType === 'bounded') {
                newNode.max = parseInt(document.getElementById('enMax').value) || 0;
                newNode.value = Math.min(newNode.value, newNode.max);
            } else {
                newNode.max = 0;
            }
        } else {
            newNode.children = [];
        }

        if (newParentId) {
            const parent = findNode(game.nodes, newParentId);
            if (parent) {
                if (!parent.children) parent.children = [];
                parent.children.push(newNode);
            }
        } else {
            if (!game.nodes) game.nodes = [];
            game.nodes.push(newNode);
        }
    }

    saveData(data);
    closeEditNodeModal();
    renderMain();
}

// ═══════════════════════════════════════════════
// Add / Edit game
// ═══════════════════════════════════════════════

let editingGameId = null;

function openAddGameModal() {
    editingGameId = null;
    document.getElementById('addGameTitle').textContent = 'Add Game';
    document.getElementById('agName').value = '';
    document.getElementById('addGameModal').classList.add('open');
}

function closeAddGameModal() {
    document.getElementById('addGameModal').classList.remove('open');
}

function saveGame() {
    const name = document.getElementById('agName').value.trim();
    if (!name) { alert('Please enter a game title.'); return; }

    const data = loadData();
    if (editingGameId) {
        const game = data.games.find(g => g.id === editingGameId);
        if (game) game.name = name;
    } else {
        const game = {
            id: 'game_' + Date.now(),
            name,
            nodes: [],
        };
        data.games.push(game);
        selectedGameId = game.id;
        localStorage.setItem(STORAGE_SELECTED, selectedGameId);
    }
    saveData(data);
    closeAddGameModal();
    renderSelector();
    if (selectedGameId) {
        const sel = document.getElementById('gameSelect');
        sel.value = selectedGameId;
    }
    renderMain();
}

// ═══════════════════════════════════════════════
// Delete
// ═══════════════════════════════════════════════

let pendingDeleteId = null;
let pendingDeleteType = null; // 'node' | 'game'

function openConfirmDeleteNode(nodeId) {
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    if (!game) return;
    const node = findNode(game.nodes, nodeId);
    if (!node) return;

    pendingDeleteId = nodeId;
    pendingDeleteType = 'node';
    document.getElementById('confirmNodeName').textContent = node.name;
    const desc = node.type === 'branch'
        ? `This will also delete ${countDescendants(node)} child node(s).`
        : 'This cannot be undone.';
    document.getElementById('confirmNodeExtra').textContent = desc;
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
    }

    saveData(data);
    closeConfirm();
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