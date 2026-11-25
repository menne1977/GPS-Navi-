/* Navi-Oberfläche: Suche, Orte (Zuhause, Arbeit, Favoriten, Parkplatz), Karte mit Zoom und Farben, Ansagen. Nutzt Nav (nav.js). */
(function (root) {
  'use strict';
  const Nav = root.Nav;
  let A = null; // Schnittstelle zur App: R, S, toast, speak, fetch, roads, heading, live, save
  const N = { dest: null, route: null, guide: null, st: null, busy: false, lastRe: 0, open: false, results: [], ropts: null, zoomAuto: true, zoomHalf: 400 };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eta = (s) => { const d = new Date(Date.now() + s * 1000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const hhmm = () => eta(0);
  const meters = (m) => Nav.fmtDist(m).replace(' km', ' Kilometer').replace(' m', ' Meter');

  // ---------- Orte ----------
  const P = () => { const S = A.S; if (!S.places) S.places = { home: null, work: null, park: null, favs: [] }; if (!S.places.favs) S.places.favs = []; return S.places; };
  const persist = () => { if (A.save) A.save(true); };
  const here = () => (A.R.lat != null ? { lat: A.R.lat, lon: A.R.lon } : (A.S.lp ? { lat: A.S.lp.lat, lon: A.S.lp.lon } : null));
  function setPlace(kind, pl) {
    const p = P();
    if (kind === 'fav') { p.favs = p.favs.filter((f) => f.name !== pl.name).concat({ name: pl.name, lat: pl.lat, lon: pl.lon }).slice(-30); }
    else p[kind] = { name: pl.name, lat: pl.lat, lon: pl.lon, t: pl.t };
    persist(); renderPlaces();
  }
  async function nameHere(pos) {
    try {
      const to = new Promise((_, rej) => setTimeout(() => rej(new Error('zeit')), 4000));
      const r = await Promise.race([A.fetch(`https://photon.komoot.io/reverse?lang=de&lon=${pos.lon}&lat=${pos.lat}`, {}), to]);
      const j = await r.json(); const pr = ((j.features || [])[0] || {}).properties || {};
      const st = pr.street ? pr.street + (pr.housenumber ? ' ' + pr.housenumber : '') : (pr.name || '');
      return [st, pr.city || pr.town || pr.village || ''].filter(Boolean).join(', ');
    } catch (e) { return ''; }
  }
  async function saveHere(kind, label) {
    const pos = here(); if (!pos) { A.toast('Noch kein Standort.', 3000); return 'Noch kein Standort.'; }
    let name = label || (await nameHere(pos));
    if (kind === 'park') name = 'Parkplatz ' + hhmm() + (name ? ', ' + name : '');
    else if (!name) name = (kind === 'home' ? 'Zuhause' : kind === 'work' ? 'Arbeit' : 'Favorit ' + (P().favs.length + 1));
    setPlace(kind, { name, lat: pos.lat, lon: pos.lon, t: Date.now() });
    const msg = { home: 'Zuhause gespeichert.', work: 'Arbeit gespeichert.', park: 'Parkplatz gespeichert. Ich führe dich später zurück.', fav: 'Favorit gespeichert.' }[kind];
    A.toast(msg, 4000); speak(msg); return msg;
  }
  // Name aus der Sprache zu einem gespeicherten Ort
  function resolve(q) {
    q = String(q || '').toLowerCase().trim(); const p = P();
    if (/^(hause|haus|zuhause|zu hause|meinem haus|meiner wohnung|wohnung)$/.test(q)) return p.home ? { place: p.home } : { missing: 'Zuhause ist noch nicht gespeichert. Sage „Speichere diesen Ort als Zuhause“.' };
    if (/^(arbeit|der arbeit|meiner arbeit|büro|dem büro|arbeitsplatz)$/.test(q)) return p.work ? { place: p.work } : { missing: 'Arbeit ist noch nicht gespeichert. Sage „Speichere diesen Ort als Arbeit“.' };
    if (/(^|\b)(auto|parkplatz|geparkt|fahrzeug)\b/.test(q)) return p.park ? { place: p.park, ov: { veh: 'fuss' } } : { missing: 'Ich habe noch keinen Parkplatz. Sage „Hier geparkt“.' };
    const f = p.favs.find((x) => { const n = x.name.toLowerCase(); return n === q || n.includes(q) || (q.length > 3 && q.includes(n.split(',')[0])); });
    return f ? { place: f } : null;
  }

  // ---------- Karte: Farben ----------
  const THEMES = {
    nacht: { n: 'Nacht', bg: '#0a1220', road: '#3a4252', route: '#2f8bff', core: '#7cc0ff', done: '#55607a', car: '#16d17a', pin: '#ff3b30' },
    tag: { n: 'Tag', bg: '#eef2f6', road: '#b6c0cd', route: '#1a6bff', core: '#8fb8ff', done: '#a0aab8', car: '#0a9d5a', pin: '#e02b20' },
    kontrast: { n: 'Kontrast', bg: '#000000', road: '#707070', route: '#ffd400', core: '#fff3a0', done: '#555555', car: '#00ff88', pin: '#ff4d4d' },
    natur: { n: 'Natur', bg: '#0d1f14', road: '#3f5f48', route: '#ffb703', core: '#ffe29a', done: '#4c6a52', car: '#9cff4d', pin: '#ff6b5a' },
    grau: { n: 'Grau', bg: '#1c1c1c', road: '#4d4d4d', route: '#e6e6e6', core: '#ffffff', done: '#6e6e6e', car: '#16d17a', pin: '#ff5a4d' }
  };
  const theme = () => THEMES[A.S.navMap] || THEMES.nacht;
  function setTheme(k) { if (THEMES[k]) { A.S.navMap = k; persist(); renderOpts(); draw(); } }

  // ---------- Auswahl (Fahrzeug, Kurven, Strecke, Landschaft) ----------
  const OPT = {
    veh: [['auto', 'Auto'], ['motorrad', 'Motorrad'], ['fuss', 'Zu Fuß']],
    curves: [['egal', 'Kurven egal'], ['wenig', 'Wenig Kurven'], ['mittel', 'Mittlere Kurven'], ['viele', 'Viele Kurven']],
    type: [['normal', 'Ausgewogen'], ['schnell', 'Schnellste'], ['kurz', 'Kürzeste'], ['sparsam', 'Sparsam'], ['lang', 'Längste'], ['gemuetlich', 'Gemütlich']],
    scenic: [['wald', 'Wald'], ['felder', 'Felder und Wiesen'], ['wasser', 'Wasser'], ['heide', 'Heide']],
    avoid: [['autobahn', 'Autobahn'], ['maut', 'Mautstraßen'], ['faehre', 'Fähren'], ['stadt', 'Innenstadt umfahren']]
  };
  const LBL = { veh: 'Fahrzeug', curves: 'Kurven (Motorrad)', type: 'Streckenart', scenic: 'Landschaft, bei mir mit Aussicht', avoid: 'Vermeiden' };
  const opts = () => Object.assign({ veh: 'auto', curves: 'egal', type: 'normal', scenic: [], avoid: [] }, A.S.navOpt || {});
  function setOpt(patch) { A.S.navOpt = Object.assign(opts(), patch); renderOpts(); persist(); }
  function renderOpts() {
    const o = opts(), el = $('nsOpt'); if (!el) return;
    const groups = Object.keys(OPT).filter((k) => o.veh === 'fuss' ? k === 'veh' : !(k === 'curves' && o.veh !== 'motorrad')).map((k) => `<div class="nsG"><small>${LBL[k]}</small><div class="nsC">${OPT[k].map(([v, t]) => {
      const on = (k === 'scenic' || k === 'avoid') ? (o[k] || []).includes(v) : o[k] === v; return `<button class="nsChip${on ? ' on' : ''}" data-k="${k}" data-v="${v}">${t}</button>`; }).join('')}</div></div>`);
    groups.push(`<div class="nsG"><small>Kartenfarbe</small><div class="nsC">${Object.keys(THEMES).map((k) => `<button class="nsChip${(A.S.navMap || 'nacht') === k ? ' on' : ''}" data-theme="${k}">${THEMES[k].n}</button>`).join('')}</div></div>`);
    el.innerHTML = groups.join('');
  }
  function renderPlaces() {
    const el = $('nsPlaces'); if (!el) return; const p = P();
    const q = (k, ico, lab) => p[k]
      ? `<span class="nsPl"><button class="nsPb" data-go="${k}">${ico} ${lab}</button><button class="nsX" data-clr="${k}" aria-label="${lab} löschen">✕</button></span>`
      : `<span class="nsPl"><button class="nsPb off" data-go="${k}">${ico} ${lab} setzen</button></span>`;
    el.innerHTML = `<div class="nsC">${q('home', '🏠', 'Zuhause')}${q('work', '💼', 'Arbeit')}${p.park ? `<span class="nsPl"><button class="nsPb" data-go="park">🅿 Zum Auto (zu Fuß)</button><button class="nsX" data-clr="park" aria-label="Parkplatz löschen">✕</button></span>` : ''}</div>
      <div class="nsC" style="margin-top:8px"><button class="nsChip" data-here="home">🏠 Hier ist Zuhause</button><button class="nsChip" data-here="work">💼 Hier ist Arbeit</button><button class="nsChip" data-here="park">🅿 Hier geparkt</button><button class="nsChip" data-here="fav">★ Hier als Favorit</button></div>
      ${p.favs.length ? `<div class="nsG"><small>Favoriten</small>${p.favs.map((f, i) => `<span class="nsPl"><button class="nsPb" data-fav="${i}">★ ${esc(f.name.split(',')[0])}</button><button class="nsX" data-delfav="${i}" aria-label="Favorit löschen">✕</button></span>`).join('')}</div>` : ''}`;
  }

  // ---------- Aufbau ----------
  function build() {
    const mini = document.createElement('div'); mini.id = 'navmini'; mini.hidden = true;
    mini.innerHTML = '<b id="nmArrow">⬆</b><div class="nmT"><div id="nmDist">–</div><div id="nmStreet"></div><div id="nmThen"></div></div><div class="nmR"><b id="nmRem">–</b><small id="nmEta"></small><small id="nmDir"></small></div>';
    mini.onclick = () => show();
    document.body.appendChild(mini);
    const scr = document.createElement('div'); scr.id = 'navscreen'; scr.hidden = true;
    scr.innerHTML = `
      <div id="nsTop"><b id="nsArrow">⬆</b><div class="nsT"><div id="nsDist">–</div><div id="nsStreet"></div><div id="nsThen"></div></div><button id="nsClose" aria-label="Zurück zum Tacho">✕</button></div>
      <div id="nsSearch"><div id="nsHead"><button id="nsBack">← Zurück zum Tacho</button></div><input id="nsQ" type="search" placeholder="Ziel eingeben: Straße, Ort, Name" autocomplete="off" autocapitalize="words" enterkeyhint="search"><button id="nsGo" class="act pri">Ziel suchen</button><div id="nsRes"></div><div id="nsPlaces"></div><div id="nsOpt"></div></div>
      <div id="nsMapW"><canvas id="nsMap"></canvas><div id="nsZoom"><button data-z="in" aria-label="Näher">＋</button><button data-z="out" aria-label="Weiter weg">－</button><button data-z="auto" id="nsZa">A</button><button data-z="col" aria-label="Kartenfarbe">🎨</button><button data-z="walk" aria-label="Zu Fuß weiter">🚶</button><button data-z="park" aria-label="Hier geparkt">🅿</button></div></div>
      <div id="nsLive"><div><b id="lvSpeed">0</b><small id="lvUnit">km/h</small></div><div><b id="lvLimit">–</b><small>Limit</small></div><div><b id="lvAlt">–</b><small id="lvAltN">Höhe</small></div><div><b id="lvDir">–</b><small>Richtung</small></div></div>
      <div id="nsBot"><div><b id="nsRem">–</b><small>Rest</small></div><div><b id="nsEta">–</b><small>Ankunft</small></div><div><b id="nsDur">–</b><small>Dauer</small></div><button id="nsTacho" class="act">Tacho</button><button id="nsStop" class="act">Beenden</button></div>`;
    document.body.appendChild(scr);
    $('nsClose').onclick = hide; $('nsBack').onclick = hide; $('nsTacho').onclick = hide; $('nsStop').onclick = () => stop(true);
    $('nsGo').onclick = () => search($('nsQ').value);
    $('nsQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') search($('nsQ').value); });
    window.addEventListener('popstate', () => { if (N.open) { N.open = false; $('navscreen').hidden = true; layout(); } });
    $('nsRes').addEventListener('click', (e) => {
      const s = e.target.closest('[data-save]'); const h = e.target.closest('[data-i]');
      if (s) { const r = N.results[+s.dataset.ri]; if (r) { setPlace(s.dataset.save, r); A.toast({ home: 'Als Zuhause gespeichert.', work: 'Als Arbeit gespeichert.', fav: 'Als Favorit gespeichert.' }[s.dataset.save], 3000); } return; }
      if (h) start(N.results[+h.dataset.i]);
    });
    $('nsPlaces').addEventListener('click', (e) => {
      const p = P(), b = e.target.closest('button'); if (!b) return;
      if (b.dataset.go) { const k = b.dataset.go; if (p[k]) start(p[k], k === 'park' ? { veh: 'fuss' } : null); else A.toast('Suche eine Adresse und tippe dort auf ' + (k === 'home' ? '🏠' : '💼') + ', oder nutze „Hier ist …“.', 5000); }
      else if (b.dataset.clr) { p[b.dataset.clr] = null; persist(); renderPlaces(); }
      else if (b.dataset.here) saveHere(b.dataset.here);
      else if (b.dataset.fav) start(p.favs[+b.dataset.fav]);
      else if (b.dataset.delfav) { p.favs.splice(+b.dataset.delfav, 1); persist(); renderPlaces(); }
    });
    $('nsOpt').addEventListener('click', (e) => {
      const t = e.target.closest('button[data-theme]'); if (t) { setTheme(t.dataset.theme); return; }
      const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k, v = b.dataset.v, o = opts();
      if (k === 'scenic' || k === 'avoid') setOpt({ [k]: o[k].includes(v) ? o[k].filter((x) => x !== v) : o[k].concat(v) }); else setOpt({ [k]: v });
    });
    $('nsZoom').addEventListener('click', (e) => {
      const b = e.target.closest('[data-z]'); if (!b) return; const z = b.dataset.z;
      if (z === 'in') zoom(0.55); else if (z === 'out') zoom(1.8); else if (z === 'auto') { N.zoomAuto = true; draw(); }
      else if (z === 'col') { const ks = Object.keys(THEMES); setTheme(ks[(ks.indexOf(A.S.navMap || 'nacht') + 1) % ks.length]); A.toast('Karte: ' + theme().n, 1500); }
      else if (z === 'walk') walkOn(); else if (z === 'park') saveHere('park');
    });
    pinch($('nsMap'));
    window.addEventListener('resize', () => { if (N.open) draw(); });
    renderOpts(); renderPlaces();
  }

  function zoom(f) { if (N.zoomAuto) N.zoomHalf = lastSpan; N.zoomAuto = false; N.zoomHalf = Math.max(40, Math.min(9000, N.zoomHalf * f)); draw(); }
  function pinch(cv) {
    const pts = new Map(); let d0 = 0, z0 = 0;
    cv.style.touchAction = 'none';
    const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
    cv.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { d0 = dist(); z0 = N.zoomAuto ? lastSpan : N.zoomHalf; N.zoomAuto = false; } });
    cv.addEventListener('pointermove', (e) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2 && d0 > 10) { N.zoomHalf = Math.max(40, Math.min(9000, z0 * d0 / Math.max(10, dist()))); draw(); } });
    const up = (e) => { pts.delete(e.pointerId); d0 = 0; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 0.8 : 1.25); }, { passive: false });
  }

  function layout() {
    const on = !!N.route;
    $('nsLive').hidden = !on; $('nsSearch').hidden = on; $('nsMapW').hidden = !on; $('nsBot').hidden = !on; $('nsTop').hidden = !on;
    $('navmini').hidden = !on || N.open;
  }
  function show() { if (!N.open) { try { history.pushState({ navi: 1 }, ''); } catch (e) { /* egal */ } } N.open = true; $('navscreen').hidden = false; renderPlaces(); renderOpts(); layout(); if (N.route) draw(); else setTimeout(() => $('nsQ').focus(), 50); }
  function hide() { if (N.open && history.state && history.state.navi) { history.back(); return; } N.open = false; $('navscreen').hidden = true; layout(); }

  // ---------- Suche und Start ----------
  async function search(q) {
    q = String(q || '').trim(); if (!q) return [];
    $('nsRes').innerHTML = '<div class="nsMsg">Suche …</div>';
    try {
      const near = here();
      const list = await Nav.geocode(q, near, A.fetch);
      N.results = list;
      $('nsRes').innerHTML = list.length ? list.map((r, i) => `<div class="nsHit"><button class="nsHitB" data-i="${i}"><b>${esc(r.name.split(',')[0])}</b><small>${esc(r.name.split(',').slice(1).join(',').trim())}${near ? ' · ' + Nav.fmtDist(Nav.hav(near.lat, near.lon, r.lat, r.lon)) : ''}</small></button><span class="nsSv"><button data-save="home" data-ri="${i}" aria-label="Als Zuhause">🏠</button><button data-save="work" data-ri="${i}" aria-label="Als Arbeit">💼</button><button data-save="fav" data-ri="${i}" aria-label="Als Favorit">★</button></span></div>`).join('') : '<div class="nsMsg">Nichts gefunden.</div>';
      return list;
    } catch (e) { $('nsRes').innerHTML = '<div class="nsMsg">' + esc((e && e.message) || e) + '</div>'; return []; }
  }

  async function start(dest, ov) {
    if (!dest) return;
    const from0 = here();
    if (!from0) { A.toast('Noch kein Standort. Bitte kurz warten.', 4000); return 'Noch kein Standort.'; }
    if (N.busy) return 'Ich rechne schon.';
    N.busy = true; A.toast('Route wird berechnet …', 8000);
    try {
      const o = Object.assign(opts(), ov || {});
      const from = A.R.lat != null ? { lat: A.R.lat, lon: A.R.lon, heading: A.heading() } : from0;
      const res = await Nav.plan(from, dest, o, A.fetch, (t) => A.toast(t, 8000));
      const rt = res.rt; N.info = res.info; N.desc = res.info && res.info.walk ? 'ein Fußweg' : Nav.describe(res);
      N.dest = dest; N.route = rt; N.ropts = o; N.guide = new Nav.Guide(rt); N.st = null; N.lastRe = Date.now(); N.zoomAuto = true;
      N.busy = false; layout(); hide(); A.onRoute && A.onRoute(true);
      const msg = (o.veh === 'fuss' ? 'Fußweg zu ' : 'Route nach ') + String(dest.name || 'Ziel').split(',')[0] + ': ' + meters(rt.len) + ', etwa ' + Nav.fmtTime(rt.dur).replace(' min', ' Minuten').replace(' h', ' Stunden') + '.' + (N.desc && !res.info.walk ? ' Die Strecke ist ' + N.desc + '.' : '') + (res.info && res.info.noScenic ? ' Landschaftsdaten waren nicht erreichbar.' : '');
      A.toast(msg, 8000); speak(msg + ' ' + (rt.steps[0] ? rt.steps[0].say : ''));
      tick(); return msg;
    } catch (e) { N.busy = false; const m = (e && e.message) || String(e); A.toast(m, 6000); return m; }
  }

  async function go(q) {
    const r = resolve(q);
    if (r && r.missing) { A.toast(r.missing, 5000); speak(r.missing); return r.missing; }
    if (r && r.place) return start(r.place, r.ov);
    const list = await search(q);
    if (list && list.length) return start(list[0]);
    show(); return 'Ich finde „' + q + '“ nicht.';
  }

  function stop(say) {
    const was = !!N.route; N.route = null; N.guide = null; N.st = null; N.dest = null;
    layout(); A.onRoute && A.onRoute(false);
    if (was && say) { speak('Navigation beendet.'); A.toast('Navigation beendet.'); }
    return was ? 'Navigation beendet.' : 'Es läuft keine Navigation.';
  }
  function speak(t) { if (A.S.navVoice !== false) A.speak(t); }

  // Zu Fuß weiter: gleiches Ziel, jetzt als Fußweg
  async function walkOn() {
    if (!N.dest) { setOpt({ veh: 'fuss' }); const m = 'Zu Fuß eingestellt. Wähle ein Ziel.'; A.toast(m, 3000); return m; }
    N.ropts = Object.assign({}, N.ropts || opts(), { veh: 'fuss' }); N.lastRe = 0; N.busy = false;
    A.toast('Fußweg wird berechnet …', 5000);
    try {
      const res = await Nav.plan({ lat: A.R.lat, lon: A.R.lon, heading: null }, N.dest, N.ropts, A.fetch);
      N.route = res.rt; N.guide = new Nav.Guide(res.rt); N.st = null; N.zoomAuto = true;
      const m = 'Zu Fuß weiter, noch ' + meters(res.rt.len) + '.'; speak(m); A.toast(m, 4000); tick(); return m;
    } catch (e) { const m = (e && e.message) || String(e); A.toast(m, 5000); return m; }
  }

  async function reroute() {
    if (N.busy || !N.dest || Date.now() - N.lastRe < 12000) return;
    N.busy = true; N.lastRe = Date.now();
    try {
      const res = await Nav.plan({ lat: A.R.lat, lon: A.R.lon, heading: A.heading() }, N.dest, N.ropts || opts(), A.fetch);
      N.route = res.rt; N.guide = new Nav.Guide(res.rt); speak('Route neu berechnet.');
    } catch (e) { A.toast('Neu berechnen nicht möglich: ' + ((e && e.message) || e), 4000); }
    N.busy = false;
  }

  function tick() {
    if (!N.guide || A.R.lat == null) return;
    const s = N.guide.update(A.R.lat, A.R.lon, A.R.acc); N.st = s; if (!s) return;
    if (s.say.length) speak(s.say.join('. '));
    if (s.arrived) { speak('Sie haben Ihr Ziel erreicht.'); A.toast('Ziel erreicht.', 5000); stop(false); return; }
    if (s.off) reroute();
    const then = s.then ? 'danach ' + s.then.arrow + ' in ' + Nav.fmtDist(s.then.d) : '';
    const lv = A.live ? A.live() : null;
    $('nmArrow').textContent = s.arrow; $('nmDist').textContent = Nav.fmtDist(s.dNext); $('nmStreet').textContent = s.street || s.text; $('nmThen').textContent = then;
    $('nmRem').textContent = Nav.fmtDist(s.remain); $('nmEta').textContent = 'an ' + eta(s.remainT); $('nmDir').textContent = lv ? lv.dir : '';
    if (N.open) {
      $('nsArrow').textContent = s.arrow; $('nsDist').textContent = Nav.fmtDist(s.dNext); $('nsStreet').textContent = s.street || s.text; $('nsThen').textContent = then;
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
    return 'Noch ' + meters(N.st.remain) + ', Ankunft um ' + eta(N.st.remainT) + ' Uhr.';
  }

  // ---------- Karte zeichnen ----------
  let lastSpan = 400;
  function draw() {
    const cv = $('nsMap'); if (!cv || $('nsMapW').hidden || !N.route) return;
    const th = theme();
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.max(50, r.width), H = Math.max(50, r.height);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = th.bg; g.fillRect(0, 0, W, H);
    const lat = A.R.lat, lon = A.R.lon; if (lat == null) return;
    const walk = N.ropts && N.ropts.veh === 'fuss';
    const hd = A.heading(), rot = hd == null ? 0 : -hd * Math.PI / 180;
    const speed = A.R.speed || 0, span = N.zoomAuto ? (walk ? Math.max(120, Math.min(350, speed * 9)) : Math.max(220, Math.min(900, speed * 9))) : N.zoomHalf;
    lastSpan = span; $('nsZa').classList.toggle('on', N.zoomAuto);
    const sc = Math.min(W, H) / 2 / span * 1.15, cx = W / 2, cy = H * 0.68, c = Math.cos(lat * Math.PI / 180);
    const P2 = (la, lo) => { const x = (lo - lon) * 111320 * c, y = (la - lat) * 111320; const rx = x * Math.cos(rot) - y * Math.sin(rot), ry = x * Math.sin(rot) + y * Math.cos(rot); return [cx + rx * sc, cy - ry * sc]; };
    const reach = span * 3.2 / 111320, near = (la, lo) => Math.abs(la - lat) < reach && Math.abs(lo - lon) < reach / c;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = th.road; g.lineWidth = Math.max(1.5, Math.min(5, 3 * (400 / span) ** 0.3));
    for (const rd of (A.roads() || [])) {
      if (!rd.geom.some((p) => near(p.lat, p.lon))) continue;
      g.beginPath(); rd.geom.forEach((p, i) => { const [x, y] = P2(p.lat, p.lon); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    }
    const rt = N.route, i0 = Math.max(0, (N.guide ? N.guide.idx : 0) - 1);
    const line = (from, to, col, w, dash) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); let st = false; for (let i = from; i < to; i++) { const p = rt.shape[i]; if (!near(p.lat, p.lon) && !st) continue; const [x, y] = P2(p.lat, p.lon); if (!st) { g.moveTo(x, y); st = true; } else g.lineTo(x, y); } g.stroke(); g.setLineDash([]); };
    line(0, i0 + 1, th.done, 6); line(i0, rt.shape.length, th.route, 9, walk ? [1, 14] : null); line(i0, rt.shape.length, th.core, walk ? 4 : 3, walk ? [1, 14] : null);
    const pin = (la, lo, col, txt) => { const [x, y] = P2(la, lo); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) return; g.fillStyle = col; g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y + 1); };
    const pl = P(); if (pl.park) pin(pl.park.lat, pl.park.lon, '#2f8bff', 'P'); if (pl.home) pin(pl.home.lat, pl.home.lon, '#16a34a', 'H'); if (pl.work) pin(pl.work.lat, pl.work.lon, '#9333ea', 'A');
    const d = rt.shape[rt.shape.length - 1]; pin(d.lat, d.lon, th.pin, '⚑');
    // Fahrzeug oder Fußgänger
    g.save(); g.translate(cx, cy); g.fillStyle = th.car; g.strokeStyle = '#fff'; g.lineWidth = 2.5;
    if (walk) { g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -22); g.lineTo(7, -11); g.lineTo(-7, -11); g.closePath(); g.fill(); g.stroke(); }
    else { g.beginPath(); g.moveTo(0, -17); g.lineTo(12, 13); g.lineTo(0, 7); g.lineTo(-12, 13); g.closePath(); g.fill(); g.stroke(); }
    g.restore();
    // Maßstab
    const bar = [50, 100, 200, 500, 1000, 2000, 5000].find((m) => m * sc > 60) || 5000; g.fillStyle = th.core; g.fillRect(12, H - 18, bar * sc, 3); g.font = '12px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(bar >= 1000 ? bar / 1000 + ' km' : bar + ' m', 12, H - 24);
  }

  function vals() {
    const s = N.st;
    if (!N.route || !s) return { navdist: '–', navturn: '', navstreet: '', navremain: '–', navdur: '–', naveta: '–', navactive: false };
    return { navdist: Nav.fmtDist(s.dNext), navturn: s.arrow, navstreet: s.street || s.text || '', navremain: Nav.fmtDist(s.remain), navdur: Nav.fmtTime(s.remainT), naveta: eta(s.remainT), navactive: true };
  }

  function init(api) { A = api; build(); layout(); }
  root.NavUI = { setAvoid: (id, on) => { const o = opts(); const l = on ? (o.avoid.includes(id) ? o.avoid : o.avoid.concat(id)) : o.avoid.filter((x) => x !== id); setOpt({ avoid: l }); return l; }, zoomIn: () => zoom(0.55), zoomOut: () => zoom(1.8), zoomAuto: () => { N.zoomAuto = true; draw(); }, setOpt, opts, setTheme, init, show, hide, go, start, stop, onFix, repeat, info, vals, search, saveHere, walkOn, resolve, places: P, active: () => !!N.route, isOpen: () => N.open };
})(window);
