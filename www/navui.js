/* Navi-Oberfläche: Suche, Banner, Kartenansicht, Ansagen. Nutzt Nav (nav.js). */
(function (root) {
  'use strict';
  const Nav = root.Nav;
  let A = null; // Schnittstelle zur App: R, S, toast, speak, fetch, roads, heading
  const N = { dest: null, route: null, guide: null, st: null, busy: false, lastRe: 0, open: false, searching: false };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eta = (s) => { const d = new Date(Date.now() + s * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  function build() {
    const mini = document.createElement('div'); mini.id = 'navmini'; mini.hidden = true;
    mini.innerHTML = '<b id="nmArrow">⬆</b><div><div id="nmDist">–</div><div id="nmStreet"></div></div><small id="nmEta"></small>';
    mini.onclick = () => show();
    document.body.appendChild(mini);
    const scr = document.createElement('div'); scr.id = 'navscreen'; scr.hidden = true;
    scr.innerHTML = `
      <div id="nsTop"><b id="nsArrow">⬆</b><div class="nsT"><div id="nsDist">–</div><div id="nsStreet"></div></div><button id="nsClose" aria-label="Schließen">✕</button></div>
      <div id="nsSearch"><div id="nsHead"><button id="nsBack">← Zurück zum Tacho</button></div><input id="nsQ" type="search" placeholder="Ziel eingeben: Straße, Ort, Name" autocomplete="off" autocapitalize="words" enterkeyhint="search"><button id="nsGo" class="act pri">Ziel suchen</button><div id="nsOpt"></div><div id="nsRes"></div></div>
      <canvas id="nsMap"></canvas>
      <div id="nsLive"><div><b id="lvSpeed">0</b><small id="lvUnit">km/h</small></div><div><b id="lvLimit">–</b><small>Limit</small></div><div><b id="lvAlt">–</b><small id="lvAltN">Höhe</small></div><div><b id="lvDir">–</b><small>Richtung</small></div></div>
      <div id="nsBot"><div><b id="nsRem">–</b><small>Rest</small></div><div><b id="nsEta">–</b><small>Ankunft</small></div><div><b id="nsDur">–</b><small>Dauer</small></div><button id="nsTacho" class="act">Tacho</button><button id="nsStop" class="act">Beenden</button></div>`;
    document.body.appendChild(scr);
    $('nsClose').onclick = hide; $('nsBack').onclick = hide; $('nsTacho').onclick = hide;
    window.addEventListener('popstate', () => { if (N.open) { N.open = false; $('navscreen').hidden = true; layout(); } }); $('nsStop').onclick = () => stop(true);
    $('nsGo').onclick = () => search($('nsQ').value);
    $('nsQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') search($('nsQ').value); });
    $('nsOpt').addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k, v = b.dataset.v, o = opts();
      if (k === 'scenic') setOpt({ scenic: o.scenic.includes(v) ? o.scenic.filter((x) => x !== v) : o.scenic.concat(v) }); else setOpt({ [k]: v });
    });
    renderOpts();
    $('nsRes').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) start(N.results[+b.dataset.i]); });
    window.addEventListener('resize', () => { if (N.open) draw(); });
  }

  const OPT = {
    veh: [['auto', 'Auto'], ['motorrad', 'Motorrad']],
    curves: [['egal', 'Kurven egal'], ['wenig', 'Wenig Kurven'], ['mittel', 'Mittlere Kurven'], ['viele', 'Viele Kurven']],
    type: [['normal', 'Ausgewogen'], ['schnell', 'Schnellste'], ['kurz', 'Kürzeste'], ['sparsam', 'Sparsam'], ['lang', 'Längste'], ['gemuetlich', 'Gemütlich']],
    scenic: [['wald', 'Wald'], ['felder', 'Felder und Wiesen'], ['wasser', 'Wasser'], ['heide', 'Heide']]
  };
  const LBL = { veh: 'Fahrzeug', curves: 'Kurven (Motorrad)', type: 'Streckenart', scenic: 'Landschaft, bei mir mit Aussicht' };
  const opts = () => Object.assign({ veh: 'auto', curves: 'egal', type: 'normal', scenic: [] }, A.S.navOpt || {});
  function setOpt(patch) { A.S.navOpt = Object.assign(opts(), patch); renderOpts(); A.save && A.save(true); }
  function renderOpts() {
    const o = opts(), el = $('nsOpt'); if (!el) return;
    el.innerHTML = Object.keys(OPT).filter((k) => !(k === 'curves' && o.veh !== 'motorrad')).map((k) => `<div class="nsG"><small>${LBL[k]}</small><div class="nsC">${OPT[k].map(([v, t]) => {
      const on = k === 'scenic' ? o.scenic.includes(v) : o[k] === v; return `<button class="nsChip${on ? ' on' : ''}" data-k="${k}" data-v="${v}">${t}</button>`; }).join('')}</div></div>`).join('');
  }
  function layout() {
    const on = !!N.route;
    $('nsLive').hidden = !on; $('nsSearch').hidden = on; $('nsMap').hidden = !on; $('nsBot').hidden = !on; $('nsTop').hidden = !on;
    $('navmini').hidden = !on || N.open;
  }
  function show() { if (!N.open) { try { history.pushState({ navi: 1 }, ''); } catch (e) { /* egal */ } } N.open = true; $('navscreen').hidden = false; layout(); if (N.route) draw(); else setTimeout(() => $('nsQ').focus(), 50); }
  function hide() { if (N.open && history.state && history.state.navi) { history.back(); return; } N.open = false; $('navscreen').hidden = true; layout(); }

  async function search(q) {
    q = String(q || '').trim(); if (!q) return;
    $('nsRes').innerHTML = '<div class="nsMsg">Suche …</div>'; N.searching = true;
    try {
      const near = A.R.lat != null ? { lat: A.R.lat, lon: A.R.lon } : (A.S.lp || null);
      const list = await Nav.geocode(q, near, A.fetch);
      N.results = list;
      $('nsRes').innerHTML = list.length ? list.map((r, i) => `<button class="nsHit" data-i="${i}"><b>${esc(r.name.split(',')[0])}</b><small>${esc(r.name.split(',').slice(1).join(',').trim())}${near ? ' · ' + Nav.fmtDist(Nav.hav(near.lat, near.lon, r.lat, r.lon)) : ''}</small></button>`).join('') : '<div class="nsMsg">Nichts gefunden.</div>';
      N.searching = false; return list;
    } catch (e) { N.searching = false; $('nsRes').innerHTML = '<div class="nsMsg">Suche nicht erreichbar: ' + esc((e && e.message) || e) + '</div>'; return []; }
  }

  async function start(dest) {
    if (!dest) return;
    if (A.R.lat == null && !A.S.lp) { A.toast('Noch kein Standort. Bitte kurz warten.', 4000); return 'Noch kein Standort.'; }
    if (N.busy) return 'Ich rechne schon.';
    N.busy = true; A.toast('Route wird berechnet …', 8000);
    try {
      const from = A.R.lat != null ? { lat: A.R.lat, lon: A.R.lon, heading: A.heading() } : { lat: A.S.lp.lat, lon: A.S.lp.lon };
      const res = await Nav.plan(from, dest, opts(), A.fetch, (t) => A.toast(t, 8000));
      const rt = res.rt; N.info = res.info; N.desc = Nav.describe(res);
      N.dest = dest; N.route = rt; N.guide = new Nav.Guide(rt); N.st = null; N.lastRe = Date.now();
      N.busy = false; layout(); hide(); A.onRoute && A.onRoute(true);
      const msg = 'Route nach ' + String(dest.name || 'Ziel').split(',')[0] + ': ' + Nav.fmtDist(rt.len).replace(' km', ' Kilometer').replace(' m', ' Meter') + ', etwa ' + Nav.fmtTime(rt.dur).replace(' min', ' Minuten').replace(' h', ' Stunden') + '.' + (N.desc ? ' Die Strecke ist ' + N.desc + '.' : '') + (res.info && res.info.noScenic ? ' Landschaftsdaten waren nicht erreichbar.' : '');
      A.toast(msg, 8000); speak(msg + ' ' + (rt.steps[0] ? rt.steps[0].say : ''));
      tick(); return msg;
    } catch (e) { N.busy = false; const m = (e && e.message) || String(e); A.toast(m, 6000); return m; }
  }

  async function go(q) {
    const list = await search(q);
    if (list && list.length) { show(); return start(list[0]); }
    show(); return 'Ich finde „' + q + '“ nicht.';
  }

  function stop(say) {
    const was = !!N.route; N.route = null; N.guide = null; N.st = null; N.dest = null;
    layout(); A.onRoute && A.onRoute(false);
    if (was && say) { speak('Navigation beendet.'); A.toast('Navigation beendet.'); }
    return was ? 'Navigation beendet.' : 'Es läuft keine Navigation.';
  }

  function speak(t) { if (A.S.navVoice !== false) A.speak(t); }

  async function reroute() {
    if (N.busy || !N.dest || Date.now() - N.lastRe < 12000) return;
    N.busy = true; N.lastRe = Date.now();
    try {
      const res = await Nav.plan({ lat: A.R.lat, lon: A.R.lon, heading: A.heading() }, N.dest, opts(), A.fetch);
      const rt = res.rt; N.route = rt; N.guide = new Nav.Guide(rt); speak('Route neu berechnet.');
    } catch (e) { A.toast('Neu berechnen nicht möglich: ' + ((e && e.message) || e), 4000); }
    N.busy = false;
  }

  function tick() {
    if (!N.guide || A.R.lat == null) return;
    const s = N.guide.update(A.R.lat, A.R.lon, A.R.acc); N.st = s; if (!s) return;
    if (s.say.length) speak(s.say.join('. '));
    if (s.arrived) { speak('Sie haben Ihr Ziel erreicht.'); A.toast('Ziel erreicht.', 5000); stop(false); return; }
    if (s.off) reroute();
    live();
    $('nmArrow').textContent = s.arrow; $('nmDist').textContent = Nav.fmtDist(s.dNext); $('nmStreet').textContent = s.street || s.text; $('nmEta').textContent = eta(s.remainT);
    if (N.open) {
      $('nsArrow').textContent = s.arrow; $('nsDist').textContent = Nav.fmtDist(s.dNext); $('nsStreet').textContent = s.street || s.text;
      $('nsRem').textContent = Nav.fmtDist(s.remain); $('nsEta').textContent = eta(s.remainT); $('nsDur').textContent = Nav.fmtTime(s.remainT);
      draw();
    }
  }
  function live() {
    if (!N.open || !A.live) return;
    const v = A.live();
    $('lvSpeed').textContent = v.speed; $('lvUnit').textContent = v.unit; $('lvLimit').textContent = v.limit;
    $('lvAlt').textContent = v.alt; $('lvAltN').textContent = v.altName; $('lvDir').textContent = v.dir;
  }
  function onFix() { tick(); live(); }

  function repeat() {
    if (!N.st) return 'Keine Navigation aktiv.';
    const s = N.st.step; const m = 'In ' + Nav.distSay(N.st.dNext) + ' ' + (s.say.charAt(0).toLowerCase() + s.say.slice(1));
    speak(m); return m;
  }
  function info() {
    if (!N.st) return 'Keine Navigation aktiv.';
    return 'Noch ' + Nav.fmtDist(N.st.remain).replace(' km', ' Kilometer').replace(' m', ' Meter') + ', Ankunft um ' + eta(N.st.remainT) + ' Uhr.';
  }

  // Karte: Blick in Fahrtrichtung, Straßen grau, Route blau
  function draw() {
    const cv = $('nsMap'); if (!cv || cv.hidden || !N.route) return;
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.max(50, r.width), H = Math.max(50, r.height);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const lat = A.R.lat, lon = A.R.lon; if (lat == null) return;
    const hd = A.heading(), rot = hd == null ? 0 : -hd * Math.PI / 180;
    const speed = A.R.speed || 0, span = Math.max(220, Math.min(900, speed * 9));
    const sc = Math.min(W, H) / 2 / span * 1.15, cx = W / 2, cy = H * 0.68, c = Math.cos(lat * Math.PI / 180);
    const P = (la, lo) => { const x = (lo - lon) * 111320 * c, y = (la - lat) * 111320; const rx = x * Math.cos(rot) - y * Math.sin(rot), ry = x * Math.sin(rot) + y * Math.cos(rot); return [cx + rx * sc, cy - ry * sc]; };
    const near = (la, lo) => Math.abs(la - lat) < 0.012 && Math.abs(lo - lon) < 0.02;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#3a4252'; g.lineWidth = 3;
    for (const rd of (A.roads() || [])) {
      if (!rd.geom.some((p) => near(p.lat, p.lon))) continue;
      g.beginPath(); rd.geom.forEach((p, i) => { const [x, y] = P(p.lat, p.lon); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    }
    const rt = N.route, i0 = Math.max(0, (N.guide ? N.guide.idx : 0) - 1);
    const line = (from, to, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); let st = false; for (let i = from; i < to; i++) { const p = rt.shape[i]; if (!near(p.lat, p.lon) && !st) continue; const [x, y] = P(p.lat, p.lon); if (!st) { g.moveTo(x, y); st = true; } else g.lineTo(x, y); } g.stroke(); };
    line(0, i0 + 1, '#55607a', 6); line(i0, rt.shape.length, '#2f8bff', 9); line(i0, rt.shape.length, '#7cc0ff', 3);
    const d = rt.shape[rt.shape.length - 1], [dx, dy] = P(d.lat, d.lon);
    if (dx > -20 && dx < W + 20 && dy > -20 && dy < H + 20) { g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(dx, dy, 9, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(dx, dy, 3.5, 0, 7); g.fill(); }
    // Fahrzeug
    g.save(); g.translate(cx, cy); if (hd == null) g.rotate(0); g.fillStyle = '#16d17a'; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -17); g.lineTo(12, 13); g.lineTo(0, 7); g.lineTo(-12, 13); g.closePath(); g.fill(); g.stroke(); g.restore();
  }

  function vals() {
    const s = N.st;
    if (!N.route || !s) return { navdist: '–', navturn: '', navstreet: '', navremain: '–', navdur: '–', naveta: '–', navactive: false };
    return { navdist: Nav.fmtDist(s.dNext), navturn: s.arrow, navstreet: s.street || s.text || '', navremain: Nav.fmtDist(s.remain), navdur: Nav.fmtTime(s.remainT), naveta: eta(s.remainT), navactive: true };
  }

  function init(api) { A = api; build(); layout(); }
  root.NavUI = { setOpt, opts, init, show, hide, go, start, stop, onFix, repeat, info, vals, search, active: () => !!N.route, isOpen: () => N.open };
})(window);
