// ---- Theme toggle ----
// Each page calls initTheme() after initHeader().
// Pass an optional callback (e.g. to redraw canvas charts) as onToggle.

let _themeOnToggle = null;

function initTheme(onToggle) {
  _themeOnToggle = onToggle || null;
  const btn = document.querySelector('.theme-toggle');
  if (btn) btn.textContent = document.body.classList.contains('light') ? '🌕' : '🌙';
}

function toggleTheme() {
  document.body.classList.toggle('light');
  const btn = document.querySelector('.theme-toggle');
  if (btn) btn.textContent = document.body.classList.contains('light') ? '🌕' : '🌙';
  if (_themeOnToggle) _themeOnToggle();
}