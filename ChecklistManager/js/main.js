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
} from './render.js';
import {
    openAddProjectModal, openEditProjectModal, closeProjectModal,
    saveProjectModal, promptDeleteProject, cancelDeleteProject,
    confirmDeleteProject, addResourceRow, addItemTagRow, addStepTagRow,
    openAddItemModal, openEditItemModal, closeItemModal, saveItemModal,
} from './modal.js';
import {initAuth, showCollisionModal} from '../../common/auth-ui.js';
import {supabase} from '../../common/supabase.js';
import {getUser} from '../../common/auth.js';

const CFG = TOOL_CONFIG.checklistManager;

// ── Module-level state ────────────────────────────────────────────────────────

let selectedProjectId = null;

// ── Local storage read ────────────────────────────────────────────────────────

const _localLoad = () => localLoad(STORAGE_KEY);

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
    renderMain(selectedProjectId, stored, _callbacks);
}

// ── Callbacks (Layer 1: stubs for forward compat) ─────────────────────────────

const _callbacks = {
    // Layer 2 will populate these.
};

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

// Layer 2 item globals — stubs wired now so HTML can reference them safely.
window.openAddItemModal = () => openAddItemModal(selectedProjectId);
window.closeItemModal = () => closeItemModal();
window.saveItemModal = () => saveItemModal(() => _doRenderMain(_localLoad()));

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
