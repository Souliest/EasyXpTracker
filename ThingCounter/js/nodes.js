// ThingCounter/js/nodes.js
// Pure tree helpers: node lookup, insertion, removal, value clamping, and HTML escaping. No DOM, no localStorage.

// ═══════════════════════════════════════════════
// Nodes — pure tree utilities
// ═══════════════════════════════════════════════

export function findNode(nodes, id) {
    for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children) {
            const found = findNode(n.children, id);
            if (found) return found;
        }
    }
    return null;
}

export function findParent(nodes, id, parent = null) {
    for (const n of nodes) {
        if (n.id === id) return parent;
        if (n.children) {
            const found = findParent(n.children, id, n);
            if (found !== undefined) return found;
        }
    }
    return undefined;
}

export function removeNode(nodes, id) {
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) {
            nodes.splice(i, 1);
            return true;
        }
        if (nodes[i].children && removeNode(nodes[i].children, id)) return true;
    }
    return false;
}

export function getAllBranches(nodes, result = [], depth = 0) {
    for (const n of nodes) {
        if (n.type === 'branch') {
            result.push({id: n.id, name: n.name, depth});
            if (n.children) getAllBranches(n.children, result, depth + 1);
        }
    }
    return result;
}

export function countDescendants(node) {
    if (!node.children || node.children.length === 0) return 0;
    return node.children.reduce((s, c) => s + 1 + countDescendants(c), 0);
}

export function isAncestor(nodes, ancestorId, targetId) {
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

export function insertNode(game, node, parentId) {
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

export function clampValue(node, val) {
    const min = node.counterType === 'bounded' ? (node.min ?? 0) : 0;
    const max = node.counterType === 'bounded' ? (node.max ?? Infinity) : Infinity;
    return Math.max(min, Math.min(max, val));
}

export function initialValue(node) {
    if (node.initial !== undefined && node.initial !== null) return node.initial;
    if (node.counterType === 'bounded') {
        return node.decrement ? (node.max ?? 0) : (node.min ?? 0);
    }
    return 0;
}

export function fillPercent(node) {
    if (node.counterType !== 'bounded') return 0;
    const min = node.min ?? 0;
    const max = node.max ?? 0;
    const range = max - min;
    if (range <= 0) return 0;
    return Math.min(100, Math.max(0, ((node.value - min) / range) * 100));
}

export function newId() {
    return 'node_' + Date.now() + '_' + Math.floor(Math.random() * 99999);
}

export function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}