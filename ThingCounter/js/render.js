// ThingCounter/js/render.js
// Renders the game tree, counter cards, branch rows, and selector/action bar visibility.
// Imports callbacks from main.js at call time via parameters to avoid circular dependencies.

// ═══════════════════════════════════════════════
// Render — tree, cards, and UI state
// ═══════════════════════════════════════════════

import {loadData} from './storage.js';
import {DEFAULT_COLOR} from './swatches.js';
import {fillPercent, escHtml} from './nodes.js';

// ── Sort order (reads from game data, no state here) ──

export function currentSortOrder(selectedGameId) {
    if (!selectedGameId) return null;
    const data = loadData();
    const game = data.games.find(g => g.id === selectedGameId);
    return game ? (game.sortOrder || null) : null;
}

export function updateSortBtn(selectedGameId) {
    const btn = document.getElementById('sortBtn');
    if (!btn) return;
    const order = currentSortOrder(selectedGameId);
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

export function updateGameActionButtons(selectedGameId) {
    const data = loadData();
    const hasGame = !!selectedGameId && !!data.games.find(g => g.id === selectedGameId);
    document.getElementById('editGameBtn').style.display = hasGame ? '' : 'none';
    document.getElementById('treeActionBar').style.display = hasGame ? '' : 'none';
}

// ── Main render ──
// callbacks: { onOpenQuickCounter, onOpenAddCounter, onOpenAddBranch, onCounterStep,
//              onResetNodeValue, onResetNodeStep, onOpenEditCounter, onOpenConfirmDeleteNode,
//              onOpenEditBranch, onToggleBranch, onActivateNodeEdit, onOpenFocusModal,
//              onAttachLongPress }

export function renderMain(selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks) {
    const content = document.getElementById('mainContent');
    updateSortBtn(selectedGameId);

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
    if (hasNodes) renderNodes(game.nodes, treeRoot, selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks);

    const ghost = document.createElement('button');
    ghost.className = 'add-ghost-btn';
    ghost.textContent = '+ Add counter to root';
    ghost.onclick = () => callbacks.onOpenAddCounter(null);
    treeRoot.appendChild(ghost);
}

function renderNodes(nodes, container, selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks) {
    const order = currentSortOrder(selectedGameId);
    const sorted = order
        ? [...nodes].sort((a, b) => order === 'asc'
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name))
        : nodes;
    sorted.forEach(node => container.appendChild(
        renderNode(node, selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks)
    ));
}

function renderNode(node, selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';
    wrapper.dataset.id = node.id;

    if (node.type === 'branch') {
        wrapper.appendChild(renderBranch(node, editMode, nodeEditActive, collapsedBranches, callbacks));
        const childContainer = document.createElement('div');
        childContainer.className = 'tree-node-children' + (collapsedBranches.has(node.id) ? ' collapsed' : '');
        childContainer.id = 'children-' + node.id;
        if (node.children && node.children.length > 0) {
            renderNodes(node.children, childContainer, selectedGameId, editMode, nodeEditActive, collapsedBranches, callbacks);
        }
        const ghost = document.createElement('button');
        ghost.className = 'add-ghost-btn';
        ghost.textContent = '+ Add counter here';
        ghost.onclick = () => callbacks.onOpenAddCounter(node.id);
        childContainer.appendChild(ghost);
        wrapper.appendChild(childContainer);
    } else {
        wrapper.appendChild(renderCounter(node, editMode, nodeEditActive, callbacks));
    }

    return wrapper;
}

export function renderBranch(node, editMode, nodeEditActive, collapsedBranches, callbacks) {
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
        callbacks.onOpenAddBranch(node.id);
    });
    row.querySelector('[data-action="edit"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onOpenEditBranch(node.id);
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onOpenConfirmDeleteNode(node.id);
    });

    row.addEventListener('click', () => callbacks.onToggleBranch(node.id));
    row.addEventListener('dblclick', e => {
        e.preventDefault();
        callbacks.onActivateNodeEdit(node.id);
    });
    callbacks.onAttachLongPress(row, () => callbacks.onActivateNodeEdit(node.id));

    return row;
}

export function renderCounter(node, editMode, nodeEditActive, callbacks) {
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
            callbacks.onCounterStep(node.id, parseInt(btn.dataset.step));
        });
    });

    card.querySelector('[data-action="edit"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onOpenEditCounter(node.id);
    });
    card.querySelector('[data-action="resetstep"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onResetNodeStep(node.id);
    });
    card.querySelector('[data-action="resetval"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onResetNodeValue(node.id);
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onOpenConfirmDeleteNode(node.id);
    });

    card.querySelector('.counter-name').addEventListener('click', e => {
        e.stopPropagation();
        callbacks.onOpenFocusModal(node.id);
    });

    card.addEventListener('dblclick', e => {
        if (e.target.closest('.node-btn') || e.target.closest('.c-btn')) return;
        e.preventDefault();
        callbacks.onActivateNodeEdit(node.id);
    });
    callbacks.onAttachLongPress(card, () => callbacks.onActivateNodeEdit(node.id));

    return card;
}

// ── Targeted card refresh (avoids full re-render on counter step) ──

export function refreshCounterCard(nodeId, node, nodeEditActive, callbacks) {
    const wrapper = document.querySelector(`.tree-node[data-id="${nodeId}"]`);
    if (!wrapper) return;
    const oldCard = wrapper.querySelector('.counter-card');
    if (!oldCard) return;
    const newCard = renderCounter(node, false, nodeEditActive, callbacks);
    if (nodeEditActive === nodeId) newCard.classList.add('node-edit-active');
    wrapper.replaceChild(newCard, oldCard);
}