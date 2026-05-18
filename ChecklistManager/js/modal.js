// ChecklistManager/js/modal.js
// Barrel file — re-exports from modal-project.js and modal-item.js.
// No logic lives here. Add business logic to the appropriate modal file.

export {
    openAddProjectModal,
    openEditProjectModal,
    closeProjectModal,
    saveProjectModal,
    promptDeleteProject,
    cancelDeleteProject,
    confirmDeleteProject,
    addResourceRow,
    addItemTagRow,
    addStepTagRow,
} from './modal-project.js';

export {
    openAddItemModal,
    openEditItemModal,
    closeItemModal,
    saveItemModal,
} from './modal-item.js';
