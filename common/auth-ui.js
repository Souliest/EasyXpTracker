// common/auth-ui.js
// Auth UI — injects the login/register/reset overlay and wires the 👤 header button.
// Call initAuth() from main.js init, after initHeader() has run.

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
    // Dismiss on any interaction
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
    _renderPopover();
    popover.classList.add('open');
}

function _renderPopover() {
    const popover = document.getElementById('authPopover');
    if (!popover) return;
    const user = getUser();

    if (user) {
        popover.innerHTML = `
            <div class="auth-popover-email">${_escHtml(user.email)}</div>
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
        <p class="auth-privacy-text">
            Your email address is stored solely for account recovery purposes
            and is never shared with or sold to any third party.
        </p>
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

    // Focus the email field
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
        // closeAuthOverlay called by onAuthStateChange handler
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
        // Auto-signed in because email confirmation is disabled
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

function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── DOM injection ──

function _injectOverlay() {
    // Auth overlay
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

    // Auth popover (attached to header 👤 button)
    const popover = document.createElement('div');
    popover.id = 'authPopover';
    popover.className = 'auth-popover';
    document.body.appendChild(popover);

    // Wire close button and backdrop
    document.getElementById('authCloseBtn').addEventListener('click', closeAuthOverlay);
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeAuthOverlay();
    });

    // Wire 👤 button (injected by header.js)
    // Use event delegation — button may not exist yet at this exact moment
    document.addEventListener('click', e => {
        if (e.target.id === 'authBtn' || e.target.closest('#authBtn')) {
            toggleAuthPopover(e);
        }
    });

    // Escape key
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeAuthOverlay();
            const popover = document.getElementById('authPopover');
            if (popover) popover.classList.remove('open');
        }
    });
}

function _injectStyles() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = _resolveAuthCssPath();
    document.head.appendChild(link);
}

function _resolveAuthCssPath() {
    // Works from both root (index.html) and tool subdirectories
    const scripts = document.querySelectorAll('script[type="module"]');
    for (const s of scripts) {
        if (s.src && s.src.includes('/js/main.js')) {
            return '../common/auth.css';
        }
    }
    return 'common/auth.css';
}