// common/collision.js
// Collision modal — shown when local and cloud data have diverged on game select.
// Used by all three hybrid-storage tools (LevelGoalTracker, ThingCounter, TrophyHunter).
// Styles live in auth.css alongside the rest of the auth UI.

import {escHtml} from './utils.js';

// ── remoteData shape validation ────────────────────────────────────────────
// SEC: Supabase Realtime delivers remoteData straight from the network.
// A crafted payload could supply malformed fields that corrupt the local
// blob cache when passed to cacheSet. Validate the minimum required shape
// before the caller hands it to resolveCollision.
//
// Rules:
//   - Must be a plain object (not null, array, or primitive).
//   - Must have a string id and a string name (required by every tool).
//   - Must not carry __proto__ or constructor keys (prototype pollution guard).
//
// Tools can rely on this function returning null for anything that fails,
// which resolveCollision treats as "keep local" automatically.

export function validateRemoteData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

    // Prototype pollution guard.
    if (Object.prototype.hasOwnProperty.call(data, '__proto__')) return null;
    if (Object.prototype.hasOwnProperty.call(data, 'constructor')) return null;

    // Minimum required fields present on every tool's game blob.
    if (typeof data.id !== 'string' || !data.id) return null;
    if (typeof data.name !== 'string' || !data.name) return null;

    return data;
}

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

        // SEC: Validate the remote payload before handing it to resolveCollision.
        // If validation fails (malformed Realtime payload), fall back to keeping
        // local data silently — never corrupt the local store with invalid data.
        const safeRemoteData = validateRemoteData(collision.remoteData);
        if (!safeRemoteData) {
            console.warn('[collision] Remote data failed validation — keeping local copy.');
            await resolveCollision(gameId, 'local', null);
        } else {
            await resolveCollision(gameId, 'remote', safeRemoteData);
        }

        onResolved();
    });
}