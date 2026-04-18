// ThingCounter/js/modal.js
// Barrel file — re-exports from modal-node.js and modal-game.js.
// All imports of this module in main.js continue to work without change.

export {
    buildSwatchPopover,
    toggleSwatchPopover,
    updateColorField,
    populateParentSelect,
    openAddBranchModal,
    openEditBranchModal,
    closeAddBranchModal,
    saveAddBranch,
    openAddCounterModal,
    openEditCounterModal,
    closeAddCounterModal,
    onCounterTypeChange,
    onDecrementChange,
    saveAddCounter,
} from './modal-node.js';

export {
    openAddGameModal,
    openGameSettingsModal,
    closeGameModal,
    saveGame,
    promptResetCounters,
    cancelResetCounters,
    confirmResetCounters,
    openConfirmDeleteNode,
    openConfirmDeleteGame,
    closeConfirm,
    confirmDelete,
} from './modal-game.js';