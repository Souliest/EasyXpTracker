// ChecklistManager/js/render.js
// All HTML builders and targeted DOM update functions.
// Receives data as parameters — no loadData() calls inside this module.
//
// Layer 1: selector visibility, empty state.
// Layer 2: item list, step rows, resource tally, filter bar.
// Layer 3: pinned section, briefing modal.

import {escHtml} from '../../common/utils.js';

// ── Selector bar helpers ──────────────────────────────────────────────────────

export function updateProjectActionButtons(hasProject) {
    const editBtn = document.getElementById('editProjectBtn');
    if (editBtn) editBtn.style.display = hasProject ? '' : 'none';
}

export function rebuildSelector(index, selectedProjectId) {
    const sel = document.getElementById('projectSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">— select a project —</option>';
    index.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name;
        if (e.id === selectedProjectId) opt.selected = true;
        sel.appendChild(opt);
    });
    updateProjectActionButtons(
        !!selectedProjectId && !!index.find(e => e.id === selectedProjectId)
    );
}

// ── Main render ───────────────────────────────────────────────────────────────
// stored   — full v2 stored object { version, index, blobs, lruOrder }
// callbacks — wired in main.js; unused in Layer 1 but accepted for forward compat

export function renderMain(selectedProjectId, stored, _callbacks) {
    const content = document.getElementById('mainContent');
    if (!content) return;

    if (!selectedProjectId) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="big">✅</div>
                ${stored.index.length === 0
            ? 'No projects yet.<br>Hit <strong>+ Project</strong> to get started.'
            : 'Select a project above.'}
            </div>
        `;
        return;
    }

    const project = stored.blobs[selectedProjectId];
    if (!project) {
        content.innerHTML = '';
        return;
    }

    const hasItems = Array.isArray(project.items) && project.items.length > 0;

    if (!hasItems) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="big">📋</div>
                No items yet.<br>
                Hit <strong>+ Item</strong> to add your first checklist item.
            </div>
        `;
        return;
    }

    // Layer 2 will replace this placeholder with the full item list.
    content.innerHTML = `
        <div class="empty-state">
            <div class="big">🚧</div>
            ${escHtml(project.name)} — ${project.items.length} item(s).<br>
            Full render coming in Layer 2.
        </div>
    `;
}
