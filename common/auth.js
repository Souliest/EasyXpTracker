// common/auth.js
// Auth — session management, sign up, sign in, sign out, password reset.
// All Supabase Auth calls live here. Other modules call getUser() to check auth state.

import {supabase} from './supabase.js';

// ── Session state ──

let _session = null;
let _onAuthChange = null;

// ── Init — call once at startup, before any storage operations ──

export async function initAuthSession() {
    const {data} = await supabase.auth.getSession();
    _session = data.session;

    supabase.auth.onAuthStateChange((event, session) => {
        _session = session;
        if (_onAuthChange) _onAuthChange(event, session);
    });
}

// ── Register a callback for auth state changes ──
// Used by auth-ui.js to update the 👤 indicator on login/logout.

export function onAuthStateChange(cb) {
    _onAuthChange = cb;
}

// ── Accessors ──

export function getSession() {
    return _session;
}

export function getUser() {
    return _session ? _session.user : null;
}

export function isLoggedIn() {
    return !!_session;
}

// ── Auth operations ──

export async function signUp(email, password) {
    const {data, error} = await supabase.auth.signUp({email, password});
    if (error) throw error;
    return data;
}

export async function signIn(email, password) {
    const {data, error} = await supabase.auth.signInWithPassword({email, password});
    if (error) throw error;
    return data;
}

export async function signOut() {
    const {error} = await supabase.auth.signOut();
    if (error) throw error;
}

export async function resetPassword(email) {
    const {error} = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://souliest.github.io',
    });
    if (error) throw error;
}