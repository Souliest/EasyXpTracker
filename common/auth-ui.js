// common/auth-ui.js
// Auth UI — injects the login/register/reset overlay and wires the 👤 header button.
// Call initAuth() from main.js init, after initHeader() has run.
//
// showCollisionModal has moved to common/collision.js but is re-exported here
// so existing tool imports (import { initAuth, showCollisionModal } from '../../common/auth-ui.js')
// continue to work without changes.

import {
    initAuthSession,
    onAuthStateChange,
    getUser,
    isLoggedIn,
    signUp,
    signIn,
    signOut,
    resetPassword,
} from './auth.js';
import {escHtml} from './utils.js';

export {showCollisionModal} from './collision.js';

// ── localStorage key ──

const NUDGE_KEY = 'bgt:auth:nudge-seen';

// ── Auth overlay modes ──

const MODE_LOGIN = 'login';
const MODE_REGISTER = 'register';
const MODE_RESET = 'reset';

let _currentMode = MODE_LOGIN;

// ── Init — called from main.js ──

export async function initAuth() {
    _injectOverlay();
    _injectStyles();
    await initAuthSession();
    _updateIndicator();
    _maybeShowNudge();

    onAuthStateChange((event, session) => {
        _updateIndicator();
        if (event === 'SIGNED_IN') {
            closeAuthOverlay();
        }
    });

    // Close popover on outside click
    document.addEventListener('click', e => {
        const popover = document.getElementById('authPopover');
        const btn = document.getElementById('authBtn');
        if (popover && !popover.contains(e.target) && e.target !== btn) {
            popover.classList.remove('open');
        }
    });
}

// ── Indicator update ──

function _updateIndicator() {
    const btn = document.getElementById('authBtn');
    if (!btn) return;
    const user = getUser();
    if (user) {
        btn.classList.add('authed');
        btn.title = user.email;
    } else {
        btn.classList.remove('authed');
        btn.title = 'Sign in to sync your data across devices';
    }
}

// ── Nudge tooltip ──

function _maybeShowNudge() {
    if (isLoggedIn()) return;
    if (localStorage.getItem(NUDGE_KEY)) return;
    const btn = document.getElementById('authBtn');
    if (!btn) return;
    btn.classList.add('nudge');
    const dismiss = () => {
        btn.classList.remove('nudge');
        localStorage.setItem(NUDGE_KEY, '1');
        btn.removeEventListener('click', dismiss);
        document.removeEventListener('click', dismiss);
    };
    setTimeout(() => {
        btn.addEventListener('click', dismiss);
        document.addEventListener('click', dismiss);
    }, 0);
}

// ── Popover toggle ──

export function toggleAuthPopover(event) {
    event.stopPropagation();
    const popover = document.getElementById('authPopover');
    if (!popover) return;
    if (popover.classList.contains('open')) {
        popover.classList.remove('open');
        return;
    }
    _positionPopover();
    _renderPopover();
    popover.classList.add('open');
}

function _positionPopover() {
    const btn = document.getElementById('authBtn');
    const popover = document.getElementById('authPopover');
    if (!btn || !popover) return;
    const rect = btn.getBoundingClientRect();
    popover.style.top = (rect.bottom + 8) + 'px';
    popover.style.right = (window.innerWidth - rect.right) + 'px';
}

function _renderPopover() {
    const popover = document.getElementById('authPopover');
    if (!popover) return;
    const user = getUser();

    if (user) {
        popover.innerHTML = `
            <div class="auth-popover-email">${escHtml(user.email)}</div>
            <button class="auth-popover-btn" id="authSignOutBtn">Sign out</button>
            <div class="auth-popover-privacy">
                <a href="#" id="authPrivacyLink">Privacy notice</a>
            </div>
        `;
        document.getElementById('authSignOutBtn').addEventListener('click', async e => {
            e.stopPropagation();
            await signOut();
            popover.classList.remove('open');
        });
        document.getElementById('authPrivacyLink').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            _showPrivacyNotice();
        });
    } else {
        popover.innerHTML = `
            <button class="auth-popover-btn auth-popover-btn-primary" id="authOpenLoginBtn">Sign in</button>
            <button class="auth-popover-btn" id="authOpenRegisterBtn">Create account</button>
            <div class="auth-popover-privacy">
                <a href="#" id="authPrivacyLink">Privacy notice</a>
            </div>
        `;
        document.getElementById('authOpenLoginBtn').addEventListener('click', e => {
            e.stopPropagation();
            popover.classList.remove('open');
            openAuthOverlay(MODE_LOGIN);
        });
        document.getElementById('authOpenRegisterBtn').addEventListener('click', e => {
            e.stopPropagation();
            popover.classList.remove('open');
            openAuthOverlay(MODE_REGISTER);
        });
        document.getElementById('authPrivacyLink').addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            _showPrivacyNotice();
        });
    }
}

// ── Privacy notice ──

function _showPrivacyNotice() {
    const popover = document.getElementById('authPopover');
    if (popover) popover.classList.remove('open');
    const overlay = document.getElementById('authOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    _renderPrivacy();
}

function _renderPrivacy() {
    document.getElementById('authModalTitle').textContent = 'Privacy Notice';
    const body = document.getElementById('authModalBody');
    body.innerHTML = `
        <div class="auth-privacy-section">
            <div class="auth-privacy-heading">Your account</div>
            <p class="auth-privacy-text">
                Your email address is used only to identify your account and enable
                password recovery. It is never shared with or sold to any third party.
            </p>
        </div>
        <div class="auth-privacy-section">
            <div class="auth-privacy-heading">Your personal data</div>
            <p class="auth-privacy-text">
                Your game list and trophy progress are stored in your account so you
                can sync across devices. This data is private to you — no one else
                can read it. You can delete your data at any time by removing games
                from your list.
            </p>
        </div>
        <div class="auth-privacy-section">
            <div class="auth-privacy-heading">The shared game catalog</div>
            <p class="auth-privacy-text">
                Trophy Hunter maintains a shared catalog of PlayStation games and their
                trophy lists. When you search for a game that isn't in the catalog yet,
                you may be asked to provide a PSN username — yours or anyone else's who
                has played the game.
            </p>
            <p class="auth-privacy-text">
                That username is used in a one-time lookup against PlayStation's servers
                to find the game. <strong>The username itself is never stored.</strong>
                Only the game title and its PlayStation trophy ID are saved — anonymous,
                non-personal catalog data that benefits all users.
            </p>
        </div>
        <div class="auth-privacy-section">
            <div class="auth-privacy-heading">What is never collected</div>
            <p class="auth-privacy-text">
                No browsing behaviour, no analytics, no advertising identifiers,
                no trophy progress from other players, no PSN account details beyond
                the single lookup described above.
            </p>
        </div>
        <div class="auth-actions">
            <button class="btn btn-primary" id="authPrivacyCloseBtn">Close</button>
        </div>
    `;
    document.getElementById('authPrivacyCloseBtn').addEventListener('click', closeAuthOverlay);
}

// ── Auth overlay open/close ──

export function openAuthOverlay(mode = MODE_LOGIN) {
    _currentMode = mode;
    const overlay = document.getElementById('authOverlay');
    if (!overlay) return;
    overlay.classList.add('open');
    _renderMode();
}

export function closeAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.remove('open');
    _clearError();
}

function _renderMode() {
    const titles = {
        [MODE_LOGIN]: 'Sign In',
        [MODE_REGISTER]: 'Create Account',
        [MODE_RESET]: 'Reset Password',
    };
    document.getElementById('authModalTitle').textContent = titles[_currentMode];
    const body = document.getElementById('authModalBody');

    if (_currentMode === MODE_LOGIN) {
        body.innerHTML = `
            <div class="auth-form-group">
                <label for="authEmail">Email</label>
                <input type="email" id="authEmail" placeholder="you@example.com" autocomplete="email">
            </div>
            <div class="auth-form-group">
                <label for="authPassword">Password</label>
                <input type="password" id="authPassword" placeholder="••••••••" autocomplete="current-password">
            </div>
            <div class="auth-error" id="authError"></div>
            <div class="auth-actions">
                <button class="btn btn-ghost" id="authCancelBtn">Cancel</button>
                <button class="btn btn-primary" id="authSubmitBtn">Sign In</button>
            </div>
            <div class="auth-switch">
                <span>No account?</span>
                <a href="#" id="authSwitchRegister">Create one</a>
                <span>·</span>
                <a href="#" id="authSwitchReset">Forgot password?</a>
            </div>
        `;
        document.getElementById('authSubmitBtn').addEventListener('click', _handleLogin);
        document.getElementById('authPassword').addEventListener('keydown', e => {
            if (e.key === 'Enter') _handleLogin();
        });
        document.getElementById('authCancelBtn').addEventListener('click', closeAuthOverlay);
        document.getElementById('authSwitchRegister').addEventListener('click', e => {
            e.preventDefault();
            openAuthOverlay(MODE_REGISTER);
        });
        document.getElementById('authSwitchReset').addEventListener('click', e => {
            e.preventDefault();
            openAuthOverlay(MODE_RESET);
        });

    } else if (_currentMode === MODE_REGISTER) {
        body.innerHTML = `
            <div class="auth-form-group">
                <label for="authEmail">Email</label>
                <input type="email" id="authEmail" placeholder="you@example.com" autocomplete="email">
            </div>
            <div class="auth-form-group">
                <label for="authPassword">Password</label>
                <input type="password" id="authPassword" placeholder="••••••••" autocomplete="new-password">
            </div>
            <div class="auth-form-group">
                <label for="authPasswordConfirm">Confirm Password</label>
                <input type="password" id="authPasswordConfirm" placeholder="••••••••" autocomplete="new-password">
            </div>
            <div class="auth-error" id="authError"></div>
            <div class="auth-actions">
                <button class="btn btn-ghost" id="authCancelBtn">Cancel</button>
                <button class="btn btn-primary" id="authSubmitBtn">Create Account</button>
            </div>
            <div class="auth-switch">
                <span>Have an account?</span>
                <a href="#" id="authSwitchLogin">Sign in</a>
            </div>
        `;
        document.getElementById('authSubmitBtn').addEventListener('click', _handleRegister);
        document.getElementById('authPasswordConfirm').addEventListener('keydown', e => {
            if (e.key === 'Enter') _handleRegister();
        });
        document.getElementById('authCancelBtn').addEventListener('click', closeAuthOverlay);
        document.getElementById('authSwitchLogin').addEventListener('click', e => {
            e.preventDefault();
            openAuthOverlay(MODE_LOGIN);
        });

    } else if (_currentMode === MODE_RESET) {
        body.innerHTML = `
            <p class="auth-reset-info">Enter your email and we'll send you a reset link.</p>
            <div class="auth-form-group">
                <label for="authEmail">Email</label>
                <input type="email" id="authEmail" placeholder="you@example.com" autocomplete="email">
            </div>
            <div class="auth-error" id="authError"></div>
            <div class="auth-actions">
                <button class="btn btn-ghost" id="authCancelBtn">Cancel</button>
                <button class="btn btn-primary" id="authSubmitBtn">Send Reset Link</button>
            </div>
            <div class="auth-switch">
                <a href="#" id="authSwitchLogin">Back to sign in</a>
            </div>
        `;
        document.getElementById('authSubmitBtn').addEventListener('click', _handleReset);
        document.getElementById('authEmail').addEventListener('keydown', e => {
            if (e.key === 'Enter') _handleReset();
        });
        document.getElementById('authCancelBtn').addEventListener('click', closeAuthOverlay);
        document.getElementById('authSwitchLogin').addEventListener('click', e => {
            e.preventDefault();
            openAuthOverlay(MODE_LOGIN);
        });
    }

    setTimeout(() => {
        const el = document.getElementById('authEmail');
        if (el) el.focus();
    }, 50);
}

// ── Form handlers ──

async function _handleLogin() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) {
        _showError('Please fill in all fields.');
        return;
    }
    _setSubmitting(true);
    try {
        await signIn(email, password);
    } catch (err) {
        _showError(_friendlyError(err.message));
    } finally {
        _setSubmitting(false);
    }
}

async function _handleRegister() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const confirm = document.getElementById('authPasswordConfirm').value;
    if (!email || !password || !confirm) {
        _showError('Please fill in all fields.');
        return;
    }
    if (password !== confirm) {
        _showError('Passwords do not match.');
        return;
    }
    if (password.length < 6) {
        _showError('Password must be at least 6 characters.');
        return;
    }
    _setSubmitting(true);
    try {
        await signUp(email, password);
    } catch (err) {
        _showError(_friendlyError(err.message));
    } finally {
        _setSubmitting(false);
    }
}

async function _handleReset() {
    const email = document.getElementById('authEmail').value.trim();
    if (!email) {
        _showError('Please enter your email.');
        return;
    }
    _setSubmitting(true);
    try {
        await resetPassword(email);
        _showError('Reset link sent — check your inbox.', true);
    } catch (err) {
        _showError(_friendlyError(err.message));
    } finally {
        _setSubmitting(false);
    }
}

// ── UI helpers ──

function _showError(msg, isSuccess = false) {
    const el = document.getElementById('authError');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('auth-success', isSuccess);
    el.style.display = 'block';
}

function _clearError() {
    const el = document.getElementById('authError');
    if (el) {
        el.textContent = '';
        el.style.display = 'none';
    }
}

function _setSubmitting(on) {
    const btn = document.getElementById('authSubmitBtn');
    if (btn) btn.disabled = on;
}

function _friendlyError(msg) {
    if (!msg) return 'Something went wrong. Please try again.';
    if (msg.includes('Invalid login credentials')) return 'Incorrect email or password.';
    if (msg.includes('User already registered')) return 'An account with this email already exists.';
    if (msg.includes('Password should be')) return 'Password must be at least 6 characters.';
    return msg;
}

// ── DOM injection ──

function _injectOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
        <div class="auth-modal">
            <div class="auth-modal-header">
                <h2 class="auth-modal-title" id="authModalTitle"></h2>
                <button class="auth-modal-close" id="authCloseBtn">✕</button>
            </div>
            <div class="auth-modal-body" id="authModalBody"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const popover = document.createElement('div');
    popover.id = 'authPopover';
    popover.className = 'auth-popover';
    document.body.appendChild(popover);

    document.getElementById('authCloseBtn').addEventListener('click', closeAuthOverlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeAuthOverlay();
    });

    // Wire 👤 button via event delegation
    document.addEventListener('click', e => {
        if (e.target.id === 'authBtn' || e.target.closest('#authBtn')) {
            toggleAuthPopover(e);
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeAuthOverlay();
            const pop = document.getElementById('authPopover');
            if (pop) pop.classList.remove('open');
        }
    });
}

function _injectStyles() {
    // Derive auth.css path from this module's own URL — works regardless of
    // which tool subdirectory is loading it.
    const moduleUrl = new URL(import.meta.url);
    const cssUrl = new URL('auth.css', moduleUrl).href;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
}