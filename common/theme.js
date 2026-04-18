// ---- Theme toggle ----
// Persists preference to localStorage under 'bgt:theme'.
// Call initTheme() on every page after initHeader().
// Pass an optional callback (e.g. to redraw canvas charts) as onToggle.

const THEME_KEY = 'bgt:theme';

let _themeOnToggle = null;

function initTheme(onToggle) {
  _themeOnToggle = onToggle || null;

  // Restore saved preference
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') {
    document.body.classList.add('light');
  } else {
    document.body.classList.remove('light');
  }

  const btn = document.querySelector('.theme-toggle');
  if (btn) btn.textContent = document.body.classList.contains('light') ? '🌕' : '🌙';
}

function toggleTheme() {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  const btn = document.querySelector('.theme-toggle');
  if (btn) btn.textContent = isLight ? '🌕' : '🌙';
  if (_themeOnToggle) _themeOnToggle();
}