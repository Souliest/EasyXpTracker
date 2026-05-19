// ChecklistManager/js/main.js
// Entry point: module-level state, selector, event wiring, window globals, init IIFE.

import {
    loadData, loadProject, saveData, localSave,
    deleteProject, resolveCollision,
    STORAGE_KEY, STORAGE_SELECTED,
    subscribeToProjectChanges, unsubscribeFromProjectChanges,
} from './storage.js';
import {
    TOOL_CONFIG, cacheSet, cacheDelete, localLoad,
} from '../../common/migrations.js';
import {
    renderMain, rebuildSelector, updateProjectActionButtons,
    renderBriefingModal,
} from './render.js';
import {
    openAddProjectModal, openEditProjectModal, closeProjectModal,
    saveProjectModal, promptDeleteProject, cancelDeleteProject,
    confirmDeleteProject, addResourceRow, addItemTagRow, addStepTagRow,
    openAddItemModal, openEditItemModal, closeItemModal, saveItemModal,
    addStepRow,
} from './modal.js';
import {initAuth, showCollisionModal} from '../../common/auth-ui.js';
import {attachLongPress} from '../../common/utils.js';
import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';

const CFG = TOOL_CONFIG.checklistManager;

// ── Module-level state ────────────────────────────────────────────────────────

let selectedProjectId = null;
let _editMode = false;   // UI-only reorder mode; not persisted to Supabase
let _syncTimer = null;    // debounced Supabase write timer
let _briefingItemId = null;    // item currently shown in briefing modal

// ── Local storage read ────────────────────────────────────────────────────────

const _localLoad = () => localLoad(STORAGE_KEY);

// ── Debounced Supabase sync ───────────────────────────────────────────────────
// Session state (step ticks, counter increments) writes to localStorage
// immediately and schedules a Supabase sync 2 seconds later — same pattern
// as TrophyHunter.

function _scheduleSync(projectId) {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(async () => {
        _syncTimer = null;
        const stored = _localLoad();
        await saveData(stored, projectId);
    }, 2000);
}

// ── Realtime: handle incoming remote update ───────────────────────────────────

function _onRemoteUpdate(payload) {
    // ── DELETE ──
    if (payload.type === 'delete') {
        const id = payload.row && payload.row.id;
        if (!id) return;

        const stored = _localLoad();
        if (!stored.index.find(e => e.id === id)) return;

        cacheDelete(stored, id);
        localSave(stored);

        if (selectedProjectId === id) {
            selectedProjectId = null;
            localStorage.removeItem(STORAGE_SELECTED);
            updateProjectActionButtons(false);
        }

        rebuildSelector(stored.index, selectedProjectId);
        _doRenderMain(_localLoad());
        return;
    }

    // ── UPDATE ──
    const row = payload.row;
    if (!row || !row.data) return;

    const remoteProject = {...row.data, last_modified: row.updated_at};
    const stored = _localLoad();
    const indexEntry = stored.index.find(e => e.id === remoteProject.id);

    // Skip if remote isn't strictly newer.
    if (indexEntry) {
        const localTime = indexEntry.last_modified ? new Date(indexEntry.last_modified) : null;
        const remoteTime = remoteProject.last_modified ? new Date(remoteProject.last_modified) : null;
        if (localTime && remoteTime && remoteTime <= localTime) return;
    }

    if (!indexEntry) {
        // New project from another device.
        cacheSet(stored, remoteProject, CFG);
        localSave(stored);
        rebuildSelector(stored.index, selectedProjectId);
        return;
    }

    if (stored.blobs[remoteProject.id]) {
        cacheSet(stored, remoteProject, CFG);
    } else {
        const idx = stored.index.findIndex(e => e.id === remoteProject.id);
        if (idx !== -1) stored.index[idx] = {
            id: remoteProject.id,
            name: remoteProject.name,
            last_modified: remoteProject.last_modified,
        };
    }
    localSave(stored);

    if (remoteProject.id === selectedProjectId) {
        _doRenderMain(_localLoad());
    }
}

// ── Project selector ──────────────────────────────────────────────────────────

async function selectProject(id) {
    selectedProjectId = id || null;

    if (selectedProjectId) {
        localStorage.setItem(STORAGE_SELECTED, selectedProjectId);
    } else {
        localStorage.removeItem(STORAGE_SELECTED);
    }

    const stored = _localLoad();
    updateProjectActionButtons(
        !!selectedProjectId && !!stored.index.find(e => e.id === selectedProjectId)
    );

    if (!selectedProjectId) {
        _doRenderMain(stored);
        return;
    }

    const {project, collision} = await loadProject(selectedProjectId);
    if (collision) {
        showCollisionModal(
            selectedProjectId,
            project.name,
            collision,
            resolveCollision,
            async () => _doRenderMain(_localLoad()),
        );
    } else {
        _doRenderMain(_localLoad());
    }
}

function _restoreSelectedProject(index) {
    const saved = localStorage.getItem(STORAGE_SELECTED);
    if (saved && index.find(e => e.id === saved)) return saved;
    return null;
}

// ── Render orchestration ──────────────────────────────────────────────────────

function _doRenderMain(stored) {
    // If the briefing is open, keep it in sync with the current session
    // (e.g. active step filters changed while briefing was open).
    if (_briefingItemId && selectedProjectId) {
        const project = stored.blobs[selectedProjectId];
        if (project) {
            const item = (project.items || []).find(i => i.id === _briefingItemId);
            if (item) renderBriefingModal(item, project, project.session || {});
        }
    }

    // Inject _editMode as a session overlay — UI-only, never written to storage.
    const overlaid = !selectedProjectId ? stored : {
        ...stored,
        blobs: {
            ...stored.blobs,
            [selectedProjectId]: stored.blobs[selectedProjectId]
                ? {
                    ...stored.blobs[selectedProjectId],
                    session: {
                        ...(stored.blobs[selectedProjectId].session || {}),
                        editMode: _editMode,
                    },
                }
                : stored.blobs[selectedProjectId],
        },
    };
    renderMain(selectedProjectId, overlaid, _callbacks);
}

// ── Callbacks ────────────────────────────────────────────────────────────────

const _callbacks = {
    // Step interactions
    onToggleStep: (stepId, itemId) => _toggleStep(stepId, itemId),
    onStepCount: (stepId, itemId, dir) => _stepCount(stepId, itemId, dir),

    // Item interactions
    onEditItem: itemId => openEditItemModal(itemId, selectedProjectId),
    onResetItem: itemId => _resetItem(itemId),
    onTogglePinned: itemId => _togglePinned(itemId),
    onMoveItem: (itemId, dir) => _moveItem(itemId, dir),
    onAttachLongPress: (el, cb) => attachLongPress(el, cb),

    // Filter interactions
    onAddItemTagFilter: tagId => _addFilter('item', tagId),
    onRemoveItemTagFilter: tagId => _removeFilter('item', tagId),
    onAddStepTagFilter: tagId => _addFilter('step', tagId),
    onRemoveStepTagFilter: tagId => _removeFilter('step', tagId),
    onTogglePillMode: () => _togglePillMode(),

    // Sort / edit mode
    onCycleSortMode: () => _cycleSortMode(),
    onToggleEditMode: () => _toggleEditMode(),
    onTogglePinnedOnly: () => _togglePinnedOnly(),

    // Resets
    onResetAll: () => _promptResetAll(),
    onResetPinned: () => _promptResetPinned(),

    // Briefing
    onOpenBriefing: itemId => _openBriefing(itemId),
};

// ── Step interaction handlers ─────────────────────────────────────────────────

function _toggleStep(stepId, itemId) {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const item = (project.items || []).find(i => i.id === itemId);
    if (!item) return;
    const step = (item.steps || []).find(s => s.id === stepId);
    if (!step) return;

    const session = project.session || {};
    const stepState = session.stepState || {};
    const current = (stepState[stepId] || {current: 0}).current;

    stepState[stepId] = {current: current >= 1 ? 0 : 1};
    session.stepState = stepState;
    project.session = session;

    cacheSet(stored, project, CFG);
    localSave(stored);
    _scheduleSync(selectedProjectId);
    _doRenderMain(_localLoad());
}

function _stepCount(stepId, itemId, dir) {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const item = (project.items || []).find(i => i.id === itemId);
    if (!item) return;
    const step = (item.steps || []).find(s => s.id === stepId);
    if (!step) return;

    const target = step.counterTarget || 1;
    const session = project.session || {};
    const stepState = session.stepState || {};
    const current = (stepState[stepId] || {current: 0}).current;
    const next = Math.max(0, Math.min(target, current + dir));

    stepState[stepId] = {current: next};
    session.stepState = stepState;
    project.session = session;

    cacheSet(stored, project, CFG);
    localSave(stored);
    _scheduleSync(selectedProjectId);
    _doRenderMain(_localLoad());
}

// ── Item interaction handlers ─────────────────────────────────────────────────

function _resetItem(itemId) {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const item = (project.items || []).find(i => i.id === itemId);
    if (!item) return;

    const stepState = project.session.stepState || {};
    (item.steps || []).forEach(s => {
        stepState[s.id] = {current: 0};
    });
    project.session.stepState = stepState;

    cacheSet(stored, project, CFG);
    localSave(stored);
    _scheduleSync(selectedProjectId);
    _doRenderMain(_localLoad());
}

async function _togglePinned(itemId) {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const item = (project.items || []).find(i => i.id === itemId);
    if (!item) return;

    item.pinned = !item.pinned;
    cacheSet(stored, project, CFG);
    await saveData(stored, selectedProjectId);
    _doRenderMain(_localLoad());
}

async function _moveItem(itemId, dir) {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const items = [...(project.items || [])].sort((a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );
    const idx = items.findIndex(i => i.id === itemId);
    if (idx === -1) return;

    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    // Swap sortOrder values.
    const tmpOrder = items[idx].sortOrder ?? idx;
    items[idx].sortOrder = items[swapIdx].sortOrder ?? swapIdx;
    items[swapIdx].sortOrder = tmpOrder;

    project.items = items;
    cacheSet(stored, project, CFG);
    await saveData(stored, selectedProjectId);
    _doRenderMain(_localLoad());
}

// ── Filter handlers ───────────────────────────────────────────────────────────

function _addFilter(type, tagId) {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const key = type === 'item' ? 'activeItemTags' : 'activeStepTags';
    const arr = project.session[key] || [];
    if (!arr.includes(tagId)) {
        project.session[key] = [...arr, tagId];
        cacheSet(stored, project, CFG);
        localSave(stored);
    }
    _doRenderMain(_localLoad());
}

function _removeFilter(type, tagId) {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const key = type === 'item' ? 'activeItemTags' : 'activeStepTags';
    project.session[key] = (project.session[key] || []).filter(id => id !== tagId);
    cacheSet(stored, project, CFG);
    localSave(stored);
    _doRenderMain(_localLoad());
}

function _togglePillMode() {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    project.session.pillDisplayMode =
        project.session.pillDisplayMode === 'emoji' ? 'name' : 'emoji';
    cacheSet(stored, project, CFG);
    localSave(stored);
    _doRenderMain(_localLoad());
}

// ── Sort / edit mode handlers ─────────────────────────────────────────────────

async function _cycleSortMode() {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const current = project.sortMode || 'manual';
    const next = current === 'manual' ? 'name-asc' :
        current === 'name-asc' ? 'name-desc' : 'manual';
    project.sortMode = next;

    // Applying a named sort rewrites sortOrder values so there is only ever
    // one order. Manual leaves sortOrder as-is.
    if (next === 'name-asc' || next === 'name-desc') {
        const sorted = [...(project.items || [])].sort((a, b) =>
            next === 'name-asc'
                ? a.name.localeCompare(b.name)
                : b.name.localeCompare(a.name)
        );
        sorted.forEach((item, idx) => {
            item.sortOrder = idx;
        });
        project.items = sorted;
    }

    cacheSet(stored, project, CFG);
    await saveData(stored, selectedProjectId);
    _doRenderMain(_localLoad());
}

function _toggleEditMode() {
    _editMode = !_editMode;
    _doRenderMain(_localLoad());
}

async function _togglePinnedOnly() {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    project.session.pinnedOnly = !project.session.pinnedOnly;
    cacheSet(stored, project, CFG);
    localSave(stored);
    _doRenderMain(_localLoad());
}

// ── Reset handlers ────────────────────────────────────────────────────────────

let _resetAllPending = false;

function _promptResetAll() {
    if (_resetAllPending) {
        _resetAllPending = false;
        _executeResetAll();
        return;
    }
    _resetAllPending = true;
    // Auto-cancel after 4 seconds if not confirmed.
    setTimeout(() => {
        _resetAllPending = false;
        _doRenderMain(_localLoad());
    }, 4000);
    _doRenderMain(_localLoad());
}

async function _executeResetAll() {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    project.session.stepState = {};
    cacheSet(stored, project, CFG);
    await saveData(stored, selectedProjectId);
    _doRenderMain(_localLoad());
}

let _resetPinnedPending = false;

function _promptResetPinned() {
    if (_resetPinnedPending) {
        _resetPinnedPending = false;
        _executeResetPinned();
        return;
    }
    _resetPinnedPending = true;
    setTimeout(() => {
        _resetPinnedPending = false;
        _doRenderMain(_localLoad());
    }, 4000);
    _doRenderMain(_localLoad());
}

async function _executeResetPinned() {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const stepState = project.session.stepState || {};
    (project.items || [])
        .filter(i => i.pinned)
        .forEach(item => {
            (item.steps || []).forEach(s => {
                stepState[s.id] = {current: 0};
            });
        });
    project.session.stepState = stepState;
    cacheSet(stored, project, CFG);
    await saveData(stored, selectedProjectId);
    _doRenderMain(_localLoad());
}

// ── Briefing modal ────────────────────────────────────────────────────────────

function _openBriefing(itemId) {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    const item = (project.items || []).find(i => i.id === itemId);
    if (!item) return;

    _briefingItemId = itemId;
    renderBriefingModal(item, project, project.session || {});

    const overlay = document.getElementById('briefingModal');
    if (overlay) overlay.classList.add('open');
}

function _closeBriefing() {
    _briefingItemId = null;
    const overlay = document.getElementById('briefingModal');
    if (overlay) overlay.classList.remove('open');
}

async function _toggleBriefingShowAll(showAll) {
    const stored = _localLoad();
    const project = stored.blobs[selectedProjectId];
    if (!project) return;

    project.session.briefingShowAll = showAll;
    cacheSet(stored, project, CFG);
    localSave(stored);

    // Re-render briefing with new toggle state.
    if (_briefingItemId) {
        const item = (project.items || []).find(i => i.id === _briefingItemId);
        if (item) renderBriefingModal(item, project, project.session);
    }
}

// ── After-save / after-delete callbacks ──────────────────────────────────────

async function _afterProjectSaved(savedId) {
    selectedProjectId = savedId;
    localStorage.setItem(STORAGE_SELECTED, savedId);
    rebuildSelector(_localLoad().index, selectedProjectId);
    _doRenderMain(_localLoad());
}

async function _afterProjectDeleted(deletedId) {
    if (selectedProjectId === deletedId) {
        selectedProjectId = null;
        localStorage.removeItem(STORAGE_SELECTED);
    }
    const data = await loadData();
    rebuildSelector(data.index, selectedProjectId);
    _doRenderMain(_localLoad());
}

// ── Window globals — wired to inline HTML handlers and modal buttons ──────────

window.selectProject = e => selectProject(e.target ? e.target.value : e);
window.openAddProjectModal = () => openAddProjectModal();
window.openEditProjectModal = () => openEditProjectModal(selectedProjectId);
window.closeProjectModal = () => closeProjectModal();
window.saveProjectModal = () => saveProjectModal(_afterProjectSaved);
window.promptDeleteProject = () => promptDeleteProject();
window.cancelDeleteProject = () => cancelDeleteProject();
window.confirmDeleteProject = () => confirmDeleteProject(_afterProjectDeleted);
window.addResourceRow = () => addResourceRow();
window.addItemTagRow = () => addItemTagRow();
window.addStepTagRow = () => addStepTagRow();
window.addStepRow = () => addStepRow();
window.togglePinnedOnly = () => _togglePinnedOnly();
window.closeBriefingModal = () => _closeBriefing();
window.briefingShowAll = () => _toggleBriefingShowAll(true);
window.briefingShowFiltered = () => _toggleBriefingShowAll(false);

window.openAddItemModal = () => openAddItemModal(selectedProjectId);
window.closeItemModal = () => closeItemModal();
window.saveItemModal = () => saveItemModal(() => _doRenderMain(_localLoad()));
window.addStepRow = () => addStepRow();

// ── Wire modal button clicks ──────────────────────────────────────────────────
// Buttons inside modals use addEventListener rather than inline onclick,
// consistent with the no-inline-onclick-in-generated-HTML convention.
// Static modal buttons in index.html are wired here after DOMContentLoaded.

function _wireModalButtons() {
    const wire = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    };

    wire('projectSelect', e => selectProject(e.target.value));
    wire('addProjectBtn', () => openAddProjectModal());
    wire('editProjectBtn', () => openEditProjectModal(selectedProjectId));
    wire('pmCancelBtn', () => closeProjectModal());
    wire('pmSaveBtn', () => saveProjectModal(_afterProjectSaved));
    wire('pmAddResourceBtn', () => addResourceRow());
    wire('pmAddItemTagBtn', () => addItemTagRow());
    wire('pmAddStepTagBtn', () => addStepTagRow());
    wire('pmDeleteBtn', () => promptDeleteProject());
    wire('pmDeleteCancelBtn', () => cancelDeleteProject());
    wire('pmDeleteConfirmBtn', () => confirmDeleteProject(_afterProjectDeleted));

    wire('addItemBtn', () => openAddItemModal(selectedProjectId));
    wire('imCancelBtn', () => closeItemModal());
    wire('imSaveBtn', () => saveItemModal(() => _doRenderMain(_localLoad())));
    wire('imAddStepBtn', () => addStepRow());

    // Backdrop tap closes item modal.
    const itemOverlay = document.getElementById('itemModal');
    if (itemOverlay) {
        itemOverlay.addEventListener('click', e => {
            if (e.target === itemOverlay) closeItemModal();
        });
    }

    // 📌 focus mode toggle — wired via window global from filter bar button,
    // but also support a dedicated button if present in HTML.
    wire('pinnedOnlyBtn', () => _togglePinnedOnly());

    // Briefing modal close and toggle.
    wire('briefingCloseBtn', () => _closeBriefing());
    wire('briefingToggleAll', () => _toggleBriefingShowAll(true));
    wire('briefingToggleFiltered', () => _toggleBriefingShowAll(false));

    // Backdrop tap closes briefing.
    const briefingOverlay = document.getElementById('briefingModal');
    if (briefingOverlay) {
        briefingOverlay.addEventListener('click', e => {
            if (e.target === briefingOverlay) _closeBriefing();
        });
    }

    // Backdrop tap closes project modal.
    const overlay = document.getElementById('projectModal');
    if (overlay) {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeProjectModal();
        });
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
    await initAuth();

    supabase.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            subscribeToProjectChanges(session.user.id, _onRemoteUpdate);
        } else {
            unsubscribeFromProjectChanges();
        }
    });

    const data = await loadData();
    selectedProjectId = _restoreSelectedProject(data.index);
    rebuildSelector(data.index, selectedProjectId);

    if (selectedProjectId) {
        await loadProject(selectedProjectId);
    }

    _wireModalButtons();
    _doRenderMain(_localLoad());

    const user = getUser();
    if (user) subscribeToProjectChanges(user.id, _onRemoteUpdate);
})();
