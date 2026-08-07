// Blocking, non-module script loaded before any stylesheet so the correct
// theme's CSS variables are already in place for the first paint — no
// module script (deferred by default) can guarantee that, and an inline
// <script> is blocked by this app's CSP (script-src 'self', no
// 'unsafe-inline'), hence a separate same-origin file instead.
(function () {
  try {
    var stored = localStorage.getItem('admin-theme');
    var theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    // Storage/matchMedia unavailable (privacy mode, old browser) — the
    // stylesheet's own :root defaults already cover this as dark.
  }
})();
