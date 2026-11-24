// Fond « Nuit d'Argus » : canvas 2D unique, 60–90 particules, liaisons < 110 px, légère attraction vers la souris (les cent yeux d'Argus).
// Pause si onglet caché, mouvement réduit, batterie faible ou mode Focus.
let state = null;

export function setParticles(canvas, on) {
  if (!on) { stop(); canvas.classList.remove('on'); return; }
  if (state) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const s = { canvas, ctx, raf: 0, pts: [], mouse: { x: -1e4, y: -1e4 }, lowBattery: false };
  state = s;
  const resize = () => {
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(60, Math.min(90, Math.round((innerWidth * innerHeight) / 18000)));
    s.pts = Array.from({ length: n }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, r: 1 + Math.random(), a: 0.2 + Math.random() * 0.5 }));
  };
  const onMove = (e) => { s.mouse.x = e.clientX; s.mouse.y = e.clientY; };
  const onVis = () => { if (document.hidden) cancelAnimationFrame(s.raf); else loop(); };
  s.cleanup = () => { removeEventListener('resize', resize); removeEventListener('pointermove', onMove); document.removeEventListener('visibilitychange', onVis); };
  addEventListener('resize', resize);
  addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('visibilitychange', onVis);
  navigator.getBattery?.().then((b) => { const chk = () => { s.lowBattery = !b.charging && b.level < 0.2; if (s.lowBattery) cancelAnimationFrame(s.raf); }; chk(); b.addEventListener('levelchange', chk); }).catch(() => {});
  resize();
  canvas.classList.add('on');
  function loop() {
    if (state !== s || s.lowBattery) return;
    const { pts, mouse } = s;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pts) {
      const dx = mouse.x - p.x; const dy = mouse.y - p.y; const d2 = dx * dx + dy * dy;
      if (d2 < 40000) { p.vx += dx * 0.000006; p.vy += dy * 0.000006; }
      p.vx *= 0.995; p.vy *= 0.995;
      p.x += p.vx + (Math.random() - 0.5) * 0.04; p.y += p.vy + (Math.random() - 0.5) * 0.04;
      if (p.x < -10) p.x = innerWidth + 10; if (p.x > innerWidth + 10) p.x = -10;
      if (p.y < -10) p.y = innerHeight + 10; if (p.y > innerHeight + 10) p.y = -10;
    }
    ctx.lineWidth = 0.6;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x; const dy = pts[i].y - pts[j].y; const d2 = dx * dx + dy * dy;
        if (d2 < 12100) { ctx.strokeStyle = `rgba(185,162,255,${(1 - Math.sqrt(d2) / 110) * 0.22})`; ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke(); }
      }
    }
    for (const p of pts) { ctx.fillStyle = `rgba(210,190,255,${p.a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    s.raf = requestAnimationFrame(loop);
  }
  loop();
}

function stop() {
  if (!state) return;
  cancelAnimationFrame(state.raf);
  state.cleanup();
  state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  state = null;
}
