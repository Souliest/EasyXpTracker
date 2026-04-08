// common/collision.js
// Collision modal — shown when local and cloud data have diverged on game select.
// Used by all three hybrid-storage tools (LevelGoalTracker, ThingCounter, TrophyHunter).
// Styles live in auth.css alongside the rest of the auth UI.

import {escHtml} from './utils.js';

// ── showCollisionModal ──
// Signature: showCollisionModal(gameId, gameName, collision, resolveCollision, onResolved)
//
// gameId           — ID of the game with conflicting data
// gameName         — display name shown in the modal
// collision        — object from loadGame(): { localTime, remoteTime, remoteData }
// resolveCollision — the tool's own resolveCollision from its storage.js
// onResolved       — callback fired after the user picks a side; caller re-loads and re-renders

export function showCollisionModal(gameId, gameName, collision, resolveCollision, onResolved) {
    let overlay = document.getElementById('collisionOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'collisionOverlay';
        overlay.className = 'collision-overlay';
        document.body.appendChild(overlay);
    }

    const fmtTime = iso => {
        if (!iso) return '—';
        return new Date(iso).toLocaleString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    overlay.innerHTML = `
        <div class="collision-box">
            <div class="collision-title">⚠ Data Conflict</div>
            <div class="collision-game-name">${escHtml(gameName)}</div>
            <div class="collision-timestamps">
                <div class="collision-ts-row">
                    <span class="collision-ts-label">Local</span>
                    <span class="collision-ts-value">${fmtTime(collision.localTime)}</span>
                </div>
                <div class="collision-ts-row">
                    <span class="collision-ts-label">Cloud</span>
                    <span class="collision-ts-value">${fmtTime(collision.remoteTime)}</span>
                </div>
            </div>
            <div class="collision-actions">
                <button class="btn btn-ghost" id="collisionUseLocal">Use Local</button>
                <button class="btn btn-primary" id="collisionUseRemote">Use Cloud</button>
            </div>
        </div>
    `;
    overlay.classList.add('open');

    document.getElementById('collisionUseLocal').addEventListener('click', async () => {
        overlay.classList.remove('open');
        await resolveCollision(gameId, 'local', null);
        onResolved();
    });

    document.getElementById('collisionUseRemote').addEventListener('click', async () => {
        overlay.classList.remove('open');
        await resolveCollision(gameId, 'remote', collision.remoteData);
        onResolved();
    });
}