// Applique le thème mémorisé avant le premier rendu (évite le flash). Script classique, synchrone, local.
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('argus-theme') || '{}');
    var t = s.theme || 'auto';
    if (t === 'auto') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'amethyste' : 'nacre';
    var d = document.documentElement;
    d.dataset.theme = t;
    d.dataset.motion = s.motion || 'full';
    d.dataset.density = s.density || 'comfort';
    if (s.sidebar === false) d.dataset.sidebar = 'collapsed';
  } catch (e) { /* premier lancement */ }
  window.__argusT0 = performance.now();
})();
