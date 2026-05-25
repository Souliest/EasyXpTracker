// TrophySummary/js/modal.js
// All three modals for PTSD. No dependency on render.js or main.js internals.
//
// Modals:
//   openSettingsModal(profile, callbacks) — PS username setup + hidden games link
//   openHiddenGamesModal(profile, callbacks) — lists hiddenOnPs games with Remove
//   openMissingGamePrompt(queue, callbacks) — one-at-a-time queue after global refresh

import {escHtml} from '../../common/utils.js';
import {openModal as trapOpen, closeModal as trapClose} from '../../common/utils.js';

// ── Settings modal ────────────────────────────────────────────────────────────
//
// Contains:
//   - PS Username display + change field
//   - Hidden Games section (only if profile has hiddenOnPs games)
//
// callbacks:
//   onUsernameChange(newUsername) — called when username is saved/changed
//   onHiddenGamesChange(updatedProfile) — called after removing hidden games

export function openSettingsModal(profile, callbacks) {
    const existing = profile?.psUsername || '';
    const hiddenGames = (profile?.games || []).filter(g => g.hiddenOnPs);
    const hasHidden = hiddenGames.length > 0;

    const overlay = document.getElementById('ptsd-settings-modal');
    if (!overlay) return;

    const body = overlay.querySelector('.ptsd-modal-body');
    body.innerHTML = `
        <div class="form-group">
            <label for="ptsd-username-input">PlayStation Username</label>
            <div class="ptsd-username-row">
                <input type="text" id="ptsd-username-input"
                    value="${escHtml(existing)}"
                    placeholder="Enter your PS username"
                    autocomplete="off" spellcheck="false"
                    maxlength="16">
            </div>
            <div class="ptsd-settings-error" id="ptsd-settings-error" style="display:none"></div>
        </div>

        <div class="modal-actions">
            <button class="btn btn-ghost" id="ptsd-settings-cancel">Cancel</button>
            <button class="btn btn-primary" id="ptsd-settings-save">Save</button>
        </div>

        ${hasHidden ? `
        <div class="settings-section">
            <div class="settings-section-label">Hidden Games</div>
            <div class="settings-row">
                <div class="settings-desc">
                    <div class="settings-desc-title">${hiddenGames.length} game${hiddenGames.length !== 1 ? 's' : ''} hidden on PlayStation</div>
                    <div class="settings-desc-sub">Games you chose to keep when they went missing from PS data.</div>
                </div>
                <button class="btn btn-ghost" id="ptsd-manage-hidden">Manage</button>
            </div>
        </div>
        ` : ''}
    `;

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    trapOpen(overlay, document.activeElement);

    const input = document.getElementById('ptsd-username-input');
    input.focus();
    input.select();

    const saveBtn = document.getElementById('ptsd-settings-save');
    const cancelBtn = document.getElementById('ptsd-settings-cancel');
    const manageBtn = document.getElementById('ptsd-manage-hidden');
    const errorEl = document.getElementById('ptsd-settings-error');

    const doSave = () => {
        const val = input.value.trim();
        if (!val) {
            errorEl.textContent = 'Please enter a PlayStation username.';
            errorEl.style.display = '';
            return;
        }
        _closeSettingsModal();
        callbacks.onUsernameChange(val);
    };

    saveBtn.addEventListener('click', doSave);
    cancelBtn.addEventListener('click', _closeSettingsModal);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doSave();
    });

    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            _closeSettingsModal();
            openHiddenGamesModal(profile, callbacks);
        });
    }
}

function _closeSettingsModal() {
    const overlay = document.getElementById('ptsd-settings-modal');
    if (overlay) {
        overlay.classList.remove('open');
        trapClose(overlay);
    }
    document.body.style.overflow = '';
}

// ── Hidden games modal ────────────────────────────────────────────────────────
//
// Lists all games with hiddenOnPs:true, each with a [Remove] button.
// Removing deletes the game from the profile blob entirely — no confirm needed.
//
// callbacks:
//   onHiddenGamesChange(updatedProfile) — called after any removal

export function openHiddenGamesModal(profile, callbacks) {
    const overlay = document.getElementById('ptsd-hidden-modal');
    if (!overlay) return;

    const body = overlay.querySelector('.ptsd-modal-body');

    const renderList = (currentProfile) => {
        const hidden = (currentProfile.games || []).filter(g => g.hiddenOnPs);

        if (hidden.length === 0) {
            body.innerHTML = `
                <div class="ptsd-hidden-empty">No hidden games.</div>
                <div class="modal-actions">
                    <button class="btn btn-primary" id="ptsd-hidden-close">Close</button>
                </div>
            `;
            document.getElementById('ptsd-hidden-close')
                .addEventListener('click', _closeHiddenModal);
            return;
        }

        body.innerHTML = `
            <div class="ptsd-hidden-list" id="ptsd-hidden-list">
                ${hidden.map(g => `
                    <div class="ptsd-hidden-row" data-id="${escHtml(g.id)}">
                        ${g.thumbnailUrl
            ? `<img class="ptsd-hidden-thumb th-game-icon" src="${escHtml(g.thumbnailUrl)}" alt="" aria-hidden="true">`
            : `<span class="ptsd-hidden-thumb ptsd-hidden-thumb--glyph" aria-hidden="true">🎮</span>`
        }
                        <span class="ptsd-hidden-name">${escHtml(g.name)}</span>
                        <span class="ptsd-platform-badge th-platform-badge">${escHtml(g.platform)}</span>
                        <button class="btn btn-ghost ptsd-hidden-remove" data-id="${escHtml(g.id)}"
                            aria-label="Remove ${escHtml(g.name)}">Remove</button>
                    </div>
                `).join('')}
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" id="ptsd-hidden-close">Close</button>
            </div>
        `;

        document.getElementById('ptsd-hidden-close')
            .addEventListener('click', _closeHiddenModal);

        document.querySelectorAll('.ptsd-hidden-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const updatedProfile = {
                    ...currentProfile,
                    games: (currentProfile.games || []).filter(g => g.id !== id),
                };
                callbacks.onHiddenGamesChange(updatedProfile);
                // Re-render the list in-place.
                renderList(updatedProfile);
            });
        });
    };

    renderList(profile);

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    trapOpen(overlay, document.activeElement);
}

function _closeHiddenModal() {
    const overlay = document.getElementById('ptsd-hidden-modal');
    if (overlay) {
        overlay.classList.remove('open');
        trapClose(overlay);
    }
    document.body.style.overflow = '';
}

// ── Missing game prompt ───────────────────────────────────────────────────────
//
// Fires after a global refresh, before re-rendering, for each game in the
// blob that is absent from the PS response and not already flagged hiddenOnPs.
// Presents one game at a time with a "Do this for all remaining" checkbox.
// Keep is the default (safer).
//
// callbacks:
//   onKeep(game, doAll)   — user chose Keep; doAll=true if checkbox was checked
//   onRemove(game, doAll) — user chose Remove; doAll=true if checkbox was checked
//   onDone()              — all decisions made (queue exhausted or doAll used)

export function openMissingGamePrompt(queue, callbacks) {
    let remaining = [...queue];

    const overlay = document.getElementById('ptsd-missing-modal');
    if (!overlay) {
        // No modal element in DOM — treat all as Keep silently.
        for (const g of queue) callbacks.onKeep(g, false);
        callbacks.onDone();
        return;
    }

    const body = overlay.querySelector('.ptsd-modal-body');

    const showNext = () => {
        if (remaining.length === 0) {
            _closeMissingModal();
            callbacks.onDone();
            return;
        }

        const game = remaining[0];
        const restCount = remaining.length - 1;

        body.innerHTML = `
            <div class="ptsd-missing-game-name">${escHtml(game.name)}</div>
            <p class="ptsd-missing-message">
                <strong>${escHtml(game.name)}</strong> is no longer in your PlayStation data.
                This may mean you've hidden it on PlayStation.
            </p>

            ${restCount > 0 ? `
            <label class="ptsd-missing-do-all">
                <input type="checkbox" id="ptsd-missing-do-all">
                Do this for all remaining (${restCount})
            </label>
            ` : ''}

            <div class="modal-actions ptsd-missing-actions">
                <button class="btn btn-primary" id="ptsd-missing-keep">Keep</button>
                <button class="btn btn-ghost" id="ptsd-missing-remove">Remove</button>
            </div>
        `;

        const doAllCheckbox = document.getElementById('ptsd-missing-do-all');
        const keepBtn = document.getElementById('ptsd-missing-keep');
        const removeBtn = document.getElementById('ptsd-missing-remove');

        keepBtn.addEventListener('click', () => {
            const doAll = !!(doAllCheckbox && doAllCheckbox.checked);
            callbacks.onKeep(game, doAll);
            if (doAll) {
                // Apply Keep to all remaining (including current).
                for (const g of remaining) callbacks.onKeep(g, false);
                _closeMissingModal();
                callbacks.onDone();
            } else {
                remaining = remaining.slice(1);
                showNext();
            }
        });

        removeBtn.addEventListener('click', () => {
            const doAll = !!(doAllCheckbox && doAllCheckbox.checked);
            callbacks.onRemove(game, doAll);
            if (doAll) {
                // Apply Remove to all remaining.
                for (const g of remaining.slice(1)) callbacks.onRemove(g, false);
                _closeMissingModal();
                callbacks.onDone();
            } else {
                remaining = remaining.slice(1);
                showNext();
            }
        });
    };

    // Update the "Do this for all remaining (N)" count as user works through queue.
    // This is handled by re-rendering the body on each step via showNext().

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    trapOpen(overlay, document.activeElement);

    showNext();
}

function _closeMissingModal() {
    const overlay = document.getElementById('ptsd-missing-modal');
    if (overlay) {
        overlay.classList.remove('open');
        trapClose(overlay);
    }
    document.body.style.overflow = '';
}
