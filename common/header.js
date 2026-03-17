// common/header.js
// Shared Tool Header — call initHeader('Tool Title') once per page, before initTheme().
// Injects a <header> as the first child of <body> with:
//   - responsive ← / ← Tools back link
//   - centered page title
//   - 👤 auth indicator (wired by auth-ui.js initAuth())
//   - dark/light theme toggle (wired to toggleTheme() from theme.js)

function initHeader(title) {
    const header = document.createElement('header');
    header.className = 'tool-header';
    header.innerHTML = `
    <a class="back-link" href="../">
      <span class="back-arrow">←</span><span class="back-label"> Tools</span>
    </a>
    <h1 class="tool-title">${title}</h1>
    <div class="header-actions">
      <button class="auth-btn" id="authBtn" title="Account">👤</button>
      <button class="theme-toggle" onclick="toggleTheme()" title="Toggle light/dark">🌙</button>
    </div>
  `;
    document.body.insertBefore(header, document.body.firstChild);
}