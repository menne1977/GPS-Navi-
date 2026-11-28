/* Navi-Zusätze: Spurassistent, Kreuzungsansicht, Tankstelle/Rastplatz/Parkplatz auf der Route, Zwischenstopps,
   GPX-Import und -Export, Gefahrene Strecke erneut fahren, Höhenprofil, Wetter auf der Route, Pausen-Erinnerung.
   Hängt sich über NavPlus.init(H) an navui.js. Reine Logik steht oben und läuft auch in Node (Tests). */
(function (root) {
  'use strict';
  const Nav = root.Nav || (typeof require !== 'undefined' ? require('./nav.js') : null);
  const RAD = Math.PI / 180;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hav = (a, b, c, d) => Nav.hav(a, b, c, d);
  const bearing = (a, b) => { const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD), x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD); return (Math.atan2(y, x) / RAD + 360) % 360; };
  const angDiff = (a, b) => ((b - a + 540) % 360) - 180;

  // ================= GPX =================
  function gpxParse(text) {
    const pts = [], re = /<(rtept|trkpt)\b([^>]*)>/g;
    const get = (attrs, k) => { const m = attrs.match(new RegExp('\\b' + k + '\\s*=\\s*"([^"]*)"')) || attrs.match(new RegExp('\\b' + k + "\\s*=\\s*'([^']*)'")); return m ? parseFloat(m[1]) : NaN; };
    const rte = [], trk = []; let m;
    while ((m = re.exec(text))) { const p = { lat: get(m[2], 'lat'), lon: get(m[2], 'lon') }; if (isFinite(p.lat) && isFinite(p.lon)) (m[1] === 'rtept' ? rte : trk).push(p); }
    const use = rte.length >= 2 ? rte : trk; use.forEach((p) => pts.push(p));
    if (pts.length < 2) throw new Error('Keine Strecke in der Datei gefunden');
    const nm = text.match(/<name>\s*(?:<!\[CDATA\[)?([^<\]]*)/);
    return { pts, name: nm ? nm[1].trim() : '' };
  }
  const TXT = { right: 'rechts abbiegen', slight_right: 'leicht rechts halten', sharp_right: 'scharf rechts abbiegen', left: 'links abbiegen', slight_left: 'leicht links halten', sharp_left: 'scharf links abbiegen', uturn: 'wenden' };
  // Streckenpunkte → Route mit selbst erkannten Abbiegungen (ohne Straßennamen)
  function routeFromPoints(pts, name) {
    const shape = [];
    pts.forEach((p) => { const l = shape[shape.length - 1]; if (!l || hav(l.lat, l.lon, p.lat, p.lon) >= 6) shape.push({ lat: p.lat, lon: p.lon }); });
    const last = pts[pts.length - 1]; if (shape.length < 2 || (shape[shape.length - 1].lat !== last.lat || shape[shape.length - 1].lon !== last.lon)) shape.push({ lat: last.lat, lon: last.lon });
    if (shape.length < 2) throw new Error('Strecke zu kurz');
    const cum = [0]; for (let i = 1; i < shape.length; i++) cum.push(cum[i - 1] + hav(shape[i - 1].lat, shape[i - 1].lon, shape[i].lat, shape[i].lon));
    const total = cum[cum.length - 1], W = 30;
    const back = (i) => { let j = i; while (j > 0 && cum[i] - cum[j] < W) j--; return j; }, fwd = (i) => { let j = i; while (j < shape.length - 1 && cum[j] - cum[i] < W) j++; return j; };
    const cand = [];
    for (let i = 1; i < shape.length - 1; i++) {
      const a = back(i), b = fwd(i); if (a === i || b === i) continue;
      const d = angDiff(bearing(shape[a], shape[i]), bearing(shape[i], shape[b])); if (Math.abs(d) >= 35) cand.push({ i, d });
    }
    const turns = [];
    cand.forEach((c) => { const l = turns[turns.length - 1]; if (l && cum[c.i] - cum[l.i] < 45) { if (Math.abs(c.d) > Math.abs(l.d)) turns[turns.length - 1] = c; } else turns.push(c); });
    const kindOf = (d) => { const a = Math.abs(d); if (a >= 160) return 'uturn'; const s = d > 0 ? 'right' : 'left'; return a < 60 ? 'slight_' + s : a < 120 ? s : 'sharp_' + s; };
    const mk = (i, kind, text, say) => ({ i, kind, text, say, street: '', len: 0, t: 0, raw: 0, exit: 0 });
    const steps = [mk(0, 'depart', 'Losfahren', 'Los geht’s. Folgen Sie der Strecke.')];
    turns.forEach((t) => { const k = kindOf(t.d), tx = TXT[k]; steps.push(mk(t.i, k, tx.charAt(0).toUpperCase() + tx.slice(1), tx.charAt(0).toUpperCase() + tx.slice(1))); });
    steps.push(mk(shape.length - 1, 'arrive', 'Ziel erreicht', 'Sie haben Ihr Ziel erreicht.'));
    steps.forEach((s, k) => { const nx = steps[k + 1]; s.len = nx ? cum[nx.i] - cum[s.i] : 0; s.t = s.len / 13.9; });
    const rt = Nav.finish(shape, steps, total, total / 13.9);
    rt.curv = Nav.curviness ? Nav.curviness(rt) : null; rt.flags = {}; rt.gpx = true;
    return { rt, dest: { name: name || 'Ende der Strecke', lat: last.lat, lon: last.lon }, start: shape[0] };
  }
  const xmlEsc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // pts: [{lat,lon,ele?,t?}]
  function gpxWrite(name, pts, asRoute) {
    const thin = pts.length > 4000 ? pts.filter((p, i) => i % Math.ceil(pts.length / 4000) === 0 || i === pts.length - 1) : pts;
    const tag = asRoute ? 'rtept' : 'trkpt';
    const body = thin.map((p) => `<${tag} lat="${(+p.lat).toFixed(6)}" lon="${(+p.lon).toFixed(6)}">${p.ele != null ? `<ele>${(+p.ele).toFixed(1)}</ele>` : ''}${p.t ? `<time>${new Date(p.t).toISOString()}</time>` : ''}</${tag}>`).join('');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Tacho Navi" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>' + xmlEsc(name) + '</name></metadata>'
      + (asRoute ? `<rte><name>${xmlEsc(name)}</name>${body}</rte>` : `<trk><name>${xmlEsc(name)}</name><trkseg>${body}</trkseg></trk>`) + '</gpx>';
  }

  // ================= Zwischenstopps: Teilrouten zusammensetzen =================
  function mergeRoutes(r1, r2, via) {
    const off = r1.shape.length - 1, steps = [];
    r1.steps.forEach((s, k) => {
      if (k === r1.steps.length - 1 && s.kind === 'arrive') steps.push({ i: off, kind: 'straight', text: 'Zwischenstopp ' + via.name, say: 'Zwischenstopp ' + via.name, street: via.name, len: 0, t: 0, raw: 0, exit: 0, via: true });
      else steps.push(Object.assign({}, s));
    });
    r2.steps.forEach((s) => { if (s.kind === 'depart') return; steps.push(Object.assign({}, s, { i: s.i + off })); });
    const shape = r1.shape.concat(r2.shape.slice(1));
    const rt = Nav.finish(shape, steps, (r1.len || 0) + (r2.len || 0), (r1.dur || 0) + (r2.dur || 0));
    const f1 = r1.flags || {}, f2 = r2.flags || {}; rt.flags = { toll: !!(f1.toll || f2.toll), ferry: !!(f1.ferry || f2.ferry), highway: !!(f1.highway || f2.highway) };
    try { rt.curv = Nav.curviness(rt); } catch (_) { /* egal */ }
    return rt;
  }

  // ================= Fahrspuren =================
  const IND = { through: 'S', none: 'S', '': 'S', left: 'L', slight_left: 'l', sharp_left: 'L', right: 'R', slight_right: 'r', sharp_right: 'R', reverse: 'U', merge_to_left: 'm', merge_to_right: 'm' };
  function parseLanes(val) {
    if (!val) return null;
    const lanes = String(val).split('|').map((x) => x.split(';').map((i) => IND[i.trim()] || 'S').filter((v, k, a) => a.indexOf(v) === k));
    return lanes.length >= 2 ? lanes : null;
  }
  // Welche Spuren passen zur Abbiegung? kind: Schritt-Art
  function validLanes(lanes, kind) {
    const want = { left: ['L', 'l'], sharp_left: ['L', 'l'], slight_left: ['l', 'L', 'S'], right: ['R', 'r'], sharp_right: ['R', 'r'], slight_right: ['r', 'R', 'S'], straight: ['S'], uturn: ['U', 'L'] }[kind];
    if (!want) return null;
    const ok = lanes.map((l) => l.some((i) => want.includes(i)));
    return ok.some(Boolean) && !ok.every(Boolean) ? ok : null; // alle gültig = keine Aussage
  }
  const LANE_ICON = { S: '⬆', L: '⬅', l: '↖', R: '➡', r: '↗', U: '↩', m: '⬆' };
  // Abstand Punkt–Strecke in Metern
  function segDist(q, A0, B0) {
    const c = Math.cos(q.lat * RAD), ax = (A0.lon - q.lon) * 111320 * c, ay = (A0.lat - q.lat) * 111320, bx = (B0.lon - q.lon) * 111320 * c, by = (B0.lat - q.lat) * 111320;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(ax + dx * t, ay + dy * t);
  }
  function lanesFromWays(ways, q, travelBearing) {
    // q: Punkt kurz vor der Abbiegung; ways: [{tags, geometry:[{lat,lon}]}]
    let best = null;
    ways.forEach((w) => {
      const g = w.geometry || []; if (g.length < 2) return;
      for (let k = 0; k < g.length - 1; k++) {
        const d = segDist(q, g[k], g[k + 1]);
        if (!best || d < best.d) best = { d, w, br: bearing(g[k], g[k + 1]) };
      }
    });
    if (!best || best.d > 45) return null;
    const t = best.w.tags || {}, fwd = Math.abs(angDiff(travelBearing, best.br)) < 90, oneway = /^(yes|1|true)$/.test(t.oneway || '');
    const v = fwd ? (t['turn:lanes:forward'] || (oneway || !t['turn:lanes:backward'] ? t['turn:lanes'] : null)) : (t['turn:lanes:backward'] || null);
    return parseLanes(v);
  }

  // ================= Wetter =================
  const WX = (c) => c === 0 ? 'klar' : c <= 3 ? 'wolkig' : c <= 48 ? 'Nebel' : c <= 55 ? 'Nieselregen' : c <= 57 ? 'gefrierender Nieselregen' : c <= 65 ? 'Regen' : c <= 67 ? 'gefrierender Regen' : c <= 77 ? 'Schnee' : c <= 82 ? 'Regenschauer' : c <= 86 ? 'Schneeschauer' : 'Gewitter';
  function wxWarn(temp, prec, code, gust) {
    const w = [];
    if (code >= 95) w.push('Gewitter');
    if (code === 56 || code === 57 || code === 66 || code === 67 || (temp != null && temp <= 1 && prec > 0.1)) w.push('Glättegefahr');
    else if (code >= 71 && code <= 77 || code === 85 || code === 86) w.push('Schnee');
    if (prec >= 2 && code < 95) w.push('starker Regen'); else if (prec >= 0.3 && code < 95 && !w.includes('Glättegefahr') && !w.includes('Schnee')) w.push('Regen');
    if (gust >= 70) w.push('Sturmböen');
    return w;
  }
  // Höhenwerte auswerten: m[] in gleichen Abständen. Liefert Auf/Ab (Schwelle 3 m) und maximale Steigung über ≥ 200 m
  function elevStats(el, spacing) {
    if (!el || el.length < 2) return null;
    let up = 0, down = 0, ref = el[0], mx = -99, mn = 99;
    for (let i = 1; i < el.length; i++) if (Math.abs(el[i] - ref) >= 3) { if (el[i] > ref) up += el[i] - ref; else down += ref - el[i]; ref = el[i]; }
    const k = Math.max(1, Math.ceil(200 / Math.max(1, spacing)));
    for (let i = k; i < el.length; i++) { const g = (el[i] - el[i - k]) / (k * spacing) * 100; if (Math.abs(g) < 35) { if (g > mx) mx = g; if (g < mn) mn = g; } }
    return { up, down, min: Math.min(...el), max: Math.max(...el), gmax: mx === -99 ? null : mx, gmin: mn === 99 ? null : mn };
  }
  const pure = { gpxParse, routeFromPoints, gpxWrite, mergeRoutes, parseLanes, validLanes, lanesFromWays, wxWarn, WX, elevStats };

  if (typeof window === 'undefined') { if (typeof module !== 'undefined') module.exports = pure; return; }

  // ================= Oberfläche (nur im Browser) =================
  let H = null, A = null, N = null;
  const $ = (id) => document.getElementById(id);
  const X = () => (H.X ? H.X() : {});
  const fmtKm = (m) => (m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m');
  const toast = (t, ms) => A.toast(t, ms || 4000);
  const need = () => { if (!N.route) { toast('Erst eine Route starten.', 3000); return false; } return true; };
  const progress = () => (N.st ? Math.max(0, N.route.len - N.st.remain) : 0);

  // ----- Fenster (Blatt) -----
  function sheet(title, html) {
    let s = $('npSheet');
    if (!s) { s = document.createElement('div'); s.id = 'npSheet'; s.innerHTML = '<div class="npsBox"><div class="npsHead"><b id="npsT"></b><button id="npsX" aria-label="Schließen">✕</button></div><div id="npsB"></div></div>'; document.body.appendChild(s); s.addEventListener('click', (e) => { if (e.target === s || e.target.id === 'npsX') s.hidden = true; }); }
    $('npsT').textContent = title; $('npsB').innerHTML = html; s.hidden = false; return s;
  }
  const closeSheet = () => { const s = $('npSheet'); if (s) s.hidden = true; };

  // ----- GPX laden und fahren -----
  async function startRoute(r, label) {
    const here = H.here();
    if (here && hav(here.lat, here.lon, r.start.lat, r.start.lon) > 1500 && confirm('Du bist ' + fmtKm(hav(here.lat, here.lon, r.start.lat, r.start.lon)) + ' vom Start entfernt. Zuerst zum Startpunkt navigieren? (Danach die Strecke noch einmal laden.)')) { H.start({ name: 'Start der Strecke', lat: r.start.lat, lon: r.start.lon }); return 'Navigation zum Startpunkt.'; }
    N.keepRoute = true; N.via = null;
    H.commit(r.dest, r.rt, { gpx: true }, Object.assign({}, H.opts(), { gpx: true }), true);
    N.keepRoute = true;
    const m = (label || 'Strecke') + ': ' + fmtKm(r.rt.len) + ', ' + (r.rt.steps.length - 2) + ' Abbiegungen. Ich führe dich entlang der Strecke.';
    toast(m, 7000); return m;
  }
  async function importGpx() {
    if (!window.Creator || !Creator.pickFile) { toast('Dateiauswahl nicht verfügbar', 4000); return; }
    const f = await Creator.pickFile('.gpx,application/gpx+xml,application/xml,text/xml'); if (!f) return;
    try { const g = gpxParse(await f.text()); await startRoute(routeFromPoints(g.pts, g.name), g.name || f.name); } catch (e) { toast('GPX: ' + ((e && e.message) || e), 6000); }
  }
  async function driveTrack() {
    if (!window.Track || Track.count < 2) { toast('Keine aufgezeichnete Strecke. Unter Einstellungen → Streckenaufzeichnung starten.', 6000); return; }
    try { await startRoute(routeFromPoints(Track.points(), 'Meine Strecke'), 'Meine Strecke'); } catch (e) { toast((e && e.message) || String(e), 5000); }
  }
  async function sendFile(name, text) {
    const file = name + '.gpx';
    try { const f = new File([text], file, { type: 'application/gpx+xml' }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return 'Geteilt.'; } } catch (e) { if (e && e.name === 'AbortError') return 'Abgebrochen.'; }
    try { if (A.saveGpx) { const r = await A.saveGpx(name, text); toast('GPX gespeichert: ' + (r && r.path || 'Dokumente/Tacho-Strecken'), 6000); return 'Gespeichert.'; } } catch (e) { /* weiter */ }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/gpx+xml' })); a.download = file; document.body.appendChild(a); a.click(); a.remove(); toast('GPX heruntergeladen', 4000); return 'Heruntergeladen.';
  }
  const stamp = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };
  function shareRoute() {
    if (!need()) return;
    const nm = String((N.dest && N.dest.name) || 'Route').split(',')[0];
    const link = N.dest ? ' Ziel: https://maps.google.com/?q=' + N.dest.lat.toFixed(5) + ',' + N.dest.lon.toFixed(5) : '';
    sendFile('Route-' + nm.replace(/[^\wäöüÄÖÜß-]+/g, '_') + '-' + stamp(), gpxWrite('Route nach ' + nm, N.route.shape, true)); void link;
  }
  function shareTrack() {
    if (!window.Track || Track.count < 2) { toast('Keine aufgezeichnete Strecke.', 4000); return; }
    sendFile('Strecke-' + stamp(), gpxWrite('Meine Strecke', Track.points()));
  }

  // ----- Tankstelle, Rastplatz, Parkplatz entlang der Route -----
  const POI = {
    fuel: { n: 'Tankstellen', ico: '⛽', q: '["amenity"="fuel"]', def: 'Tankstelle' },
    rest: { n: 'Rastplätze', ico: '🛋', q: '["highway"~"^(rest_area|services)$"]', def: 'Rastplatz' },
    park: { n: 'Parkplätze', ico: '🅿', q: '["amenity"="parking"]["access"!~"private|customers|permit"]["parking"!~"street_side|lane"]', def: 'Parkplatz' }
  };
  async function poiAlong(kind) {
    if (!need()) return;
    const cfg = POI[kind], rt = N.route, from = progress(), to = Math.min(rt.len, from + 60000), pts = [];
    let next = from;
    for (let i = 0; i < rt.shape.length; i++) if (rt.cum[i] >= next && rt.cum[i] <= to) { pts.push(rt.shape[i]); next = rt.cum[i] + 1200; }
    if (!pts.length) pts.push(rt.shape[rt.shape.length - 1]);
    sheet(cfg.ico + ' ' + cfg.n + ' auf der Route', '<div class="npsMsg">Suche …</div>');
    try {
      const out = [], seen = new Set();
      for (let i = 0; i < pts.length; i += 45) {
        const ll = pts.slice(i, i + 46).map((p) => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(',');
        const j = await Nav.overpass(`[out:json][timeout:25];(node(around:350,${ll})${cfg.q};way(around:350,${ll})${cfg.q};);out center tags 80;`, A.fetch);
        for (const e of j.elements || []) {
          const lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon; if (lat == null || seen.has(e.type + e.id)) continue; seen.add(e.type + e.id);
          const p = Nav.proj(rt, lat, lon); if (p.d > 700 || p.at < from) continue;
          const t = e.tags || {}; out.push({ lat, lon, ahead: p.at - from, off: p.d, name: t.name || t.brand || t.operator || cfg.def, extra: [t.brand && t.brand !== t.name ? t.brand : '', t.opening_hours && t.opening_hours.length < 24 ? t.opening_hours : '', t.fee === 'yes' ? 'kostenpflichtig' : t.fee === 'no' ? 'kostenlos' : ''].filter(Boolean).join(' · ') });
        }
      }
      out.sort((a, b) => a.ahead - b.ahead); const list = out.slice(0, 12); N.poiList = list;
      if (!list.length) { sheet(cfg.ico + ' ' + cfg.n, '<div class="npsMsg">In den nächsten 60 km habe ich keine gefunden (Daten: OpenStreetMap).</div>'); return 'Keine gefunden.'; }
      sheet(cfg.ico + ' ' + cfg.n + ' auf der Route', list.map((x, k) => `<button class="npsRow" data-poi="${k}"><b>${esc(x.name)}</b><small>in ${fmtKm(x.ahead)} · Umweg ca. ${fmtKm(Math.round(x.off * 2))}${x.extra ? ' · ' + esc(x.extra) : ''}</small><em>Zwischenstopp</em></button>`).join(''));
      const f = list[0]; return cfg.def + ' in ' + fmtKm(f.ahead) + ': ' + f.name + '.';
    } catch (e) { sheet(cfg.n, '<div class="npsMsg">Suche nicht möglich: ' + esc((e && e.message) || e) + '</div>'); return 'Suche nicht möglich.'; }
  }

  // ----- Zwischenstopps -----
  async function buildVia() {
    const from = H.fromHere(); if (!from) { toast('Noch kein Standort.', 3000); return; }
    if (N.busy) return; N.busy = true; toast('Route mit Zwischenstopp wird berechnet …', 8000);
    try {
      const o = Object.assign({}, N.ropts || H.opts(), { pick: 0 }), via = N.via || [], stops = via.concat([N.dest]);
      let rt = null, a = from;
      for (let k = 0; k < stops.length; k++) {
        const res = await Nav.plan(a, stops[k], o, A.fetch), r = res.rt;
        rt = rt ? mergeRoutes(rt, r, stops[k - 1]) : r; a = stops[k];
      }
      N.busy = false; H.commit(N.dest, rt, { via: true }, N.ropts || o, true);
      const m = 'Route mit ' + via.length + (via.length === 1 ? ' Zwischenstopp' : ' Zwischenstopps') + ': ' + fmtKm(rt.len) + ', etwa ' + Nav.fmtTime(rt.dur) + '.'; toast(m, 6000); return m;
    } catch (e) { N.busy = false; toast('Zwischenstopp nicht möglich: ' + ((e && e.message) || e), 6000); }
  }
  async function addStop(pl) {
    if (!N.route || !N.dest) { toast('Erst ein Ziel wählen, dann Zwischenstopp hinzufügen.', 5000); N.pickVia = false; return; }
    N.pickVia = false; closeSheet();
    const v = { name: String(pl.name || 'Stopp').split(',')[0], lat: pl.lat, lon: pl.lon };
    const via = (N.via || []).concat([v]); via.sort((p, q) => Nav.proj(N.route, p.lat, p.lon).at - Nav.proj(N.route, q.lat, q.lon).at);
    N.via = via; return buildVia();
  }
  function replanVia() {
    const along = N.st ? N.st.along : 0;
    N.via = (N.via || []).filter((v) => Nav.proj(N.route, v.lat, v.lon).at > along - 30);
    return buildVia();
  }
  function askVia() {
    if (!need()) return; N.pickVia = true; N.srch = true; H.layout(); setTimeout(() => { const q = $('nsQ'); if (q) q.focus(); }, 50);
    toast('Suche den Zwischenstopp und tippe ihn an.', 5000);
  }

  // ----- Höhenprofil -----
  async function profile() {
    if (!need()) return;
    const rt = N.route, n = 90, lats = [], lons = [];
    for (let i = 0; i < n; i++) { const d = rt.len * i / (n - 1); let k = 0; while (k < rt.cum.length - 1 && rt.cum[k] < d) k++; lats.push(rt.shape[k].lat.toFixed(5)); lons.push(rt.shape[k].lon.toFixed(5)); }
    sheet('⛰ Höhenprofil', '<div class="npsMsg">Lade Höhendaten …</div>');
    try {
      const r = await A.fetch('https://api.open-meteo.com/v1/elevation?latitude=' + lats.join(',') + '&longitude=' + lons.join(','), {});
      if (!r.ok) throw new Error('Höhendienst HTTP ' + r.status);
      const el = (await r.json()).elevation; if (!el || el.length < 2) throw new Error('Keine Höhendaten');
      const st = elevStats(el, rt.len / (n - 1)), at = progress();
      sheet('⛰ Höhenprofil', '<canvas id="npsCv" width="640" height="260"></canvas><div class="npsGrid">'
        + [['Aufwärts', Math.round(st.up) + ' m'], ['Abwärts', Math.round(st.down) + ' m'], ['Höchster Punkt', Math.round(st.max) + ' m'], ['Tiefster Punkt', Math.round(st.min) + ' m'], ['Max. Steigung', st.gmax == null ? '–' : st.gmax.toFixed(1).replace('.', ',') + ' %'], ['Max. Gefälle', st.gmin == null ? '–' : st.gmin.toFixed(1).replace('.', ',') + ' %']].map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('') + '</div><div class="npsMsg">Höhen: Open-Meteo (Geländemodell, auf einige Meter genau).</div>');
      const c = $('npsCv'), g = c.getContext('2d'), W = c.width, Hh = c.height, pd = 26, span = Math.max(1, st.max - st.min);
      g.fillStyle = '#0a1220'; g.fillRect(0, 0, W, Hh);
      const X0 = (i) => pd + (W - 2 * pd) * i / (n - 1), Y0 = (v) => Hh - pd - (Hh - 2 * pd) * (v - st.min) / span;
      g.beginPath(); g.moveTo(X0(0), Hh - pd); el.forEach((v, i) => g.lineTo(X0(i), Y0(v))); g.lineTo(X0(n - 1), Hh - pd); g.closePath();
      const gr = g.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, 'rgba(61,220,151,.75)'); gr.addColorStop(1, 'rgba(61,220,151,.1)'); g.fillStyle = gr; g.fill();
      g.beginPath(); el.forEach((v, i) => (i ? g.lineTo(X0(i), Y0(v)) : g.moveTo(X0(i), Y0(v)))); g.strokeStyle = '#3ddc97'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#8fa4be'; g.font = '600 20px sans-serif'; g.fillText(Math.round(st.max) + ' m', 8, 22); g.fillText(Math.round(st.min) + ' m', 8, Hh - 6); g.textAlign = 'right'; g.fillText(fmtKm(rt.len), W - 8, Hh - 6);
      if (at > 0) { const x = pd + (W - 2 * pd) * at / rt.len; g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 8); g.lineTo(x, Hh - pd); g.stroke(); }
      return 'Aufwärts ' + Math.round(st.up) + ' Meter, abwärts ' + Math.round(st.down) + ' Meter, höchster Punkt ' + Math.round(st.max) + ' Meter.';
    } catch (e) { sheet('⛰ Höhenprofil', '<div class="npsMsg">Nicht möglich: ' + esc((e && e.message) || e) + '</div>'); return 'Höhenprofil nicht möglich.'; }
  }

  // ----- Wetter auf der Route -----
  async function wxCheck(rt, silent) {
    const st = N.st, remain = st ? st.remain : rt.len, remT = st ? st.remainT : rt.dur, from = rt.len - remain, fr = [0, 0.25, 0.5, 0.75, 1], lat = [], lon = [], pos = [];
    fr.forEach((f) => { const d = from + remain * f; let k = 0; while (k < rt.cum.length - 1 && rt.cum[k] < d) k++; lat.push(rt.shape[k].lat.toFixed(3)); lon.push(rt.shape[k].lon.toFixed(3)); pos.push(remain * f); });
    const r = await A.fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat.join(',') + '&longitude=' + lon.join(',') + '&hourly=temperature_2m,precipitation,weather_code,wind_gusts_10m&forecast_days=2&timezone=auto&wind_speed_unit=kmh', {});
    if (!r.ok) throw new Error('Wetterdienst HTTP ' + r.status);
    const j = await r.json(), arr = Array.isArray(j) ? j : [j], out = [];
    arr.forEach((o, k) => {
      const h = o.hourly; if (!h || !h.time) return;
      const t = new Date(Date.now() + remT * fr[k] * 1000 + (o.utc_offset_seconds || 0) * 1000).toISOString().slice(0, 13) + ':00';
      let i = h.time.indexOf(t); if (i < 0) i = Math.min(h.time.length - 1, Math.max(0, h.time.findIndex((x) => x >= t)));
      const temp = h.temperature_2m[i], pr = h.precipitation[i] || 0, code = h.weather_code[i], gust = h.wind_gusts_10m[i] || 0;
      out.push({ at: pos[k], temp, pr, code, gust, warn: wxWarn(temp, pr, code, gust) });
    });
    return out;
  }
  async function weather() {
    if (!need()) return;
    sheet('🌦 Wetter auf der Route', '<div class="npsMsg">Lade Wetter …</div>');
    try {
      const o = await wxCheck(N.route, false);
      const rows = o.map((x, k) => `<div class="npsRowS${x.warn.length ? ' warn' : ''}"><b>${k === 0 ? 'Jetzt, hier' : 'in ' + fmtKm(x.at)}</b><span>${Math.round(x.temp)} °C · ${WX(x.code)}${x.pr >= 0.1 ? ' · ' + x.pr.toFixed(1).replace('.', ',') + ' mm' : ''}${x.gust >= 40 ? ' · Böen ' + Math.round(x.gust) + ' km/h' : ''}</span>${x.warn.length ? '<em>⚠ ' + x.warn.join(', ') + '</em>' : ''}</div>`).join('');
      sheet('🌦 Wetter auf der Route', rows + '<div class="npsMsg">Vorhersage für die jeweilige Ankunftszeit am Punkt. Quelle: Open-Meteo.</div>');
      const w = [...new Set(o.flatMap((x) => x.warn))];
      return w.length ? 'Auf der Route: ' + w.join(', ') + '.' : 'Auf der Route ist kein auffälliges Wetter zu erwarten.';
    } catch (e) { sheet('🌦 Wetter', '<div class="npsMsg">Nicht möglich: ' + esc((e && e.message) || e) + '</div>'); return 'Wetter nicht möglich.'; }
  }
  // Beim Routenstart still prüfen, nur bei Warnungen melden
  function afterRoute(rt) {
    for (const k in LC) delete LC[k];
    if (!rt || A.S.online === false || X().wx === 'aus') return;
    wxCheck(rt, true).then((o) => {
      if (N.route !== rt) return; const w = [...new Set(o.flatMap((x) => x.warn))]; if (!w.length) return;
      const m = 'Wetter auf der Route: ' + w.join(', ') + '. Details im Menü unter Wetter auf der Route.'; toast(m, 8000); H.speak(m);
    }).catch(() => { /* egal */ });
  }

  const LC = {}; // Fahrspur-Cache je Abbiegung
  // ----- Pausen-Erinnerung -----
  const P = { drive: 0, still: 0, last: 0, warned: 0 };
  function onPos(vKmh, t) {
    const lim = parseInt(X().brk, 10); const dt = P.last ? Math.min(t - P.last, 60000) : 0; P.last = t;
    if (vKmh >= 5) { P.drive += dt; P.still = 0; } else { P.still += dt; if (P.still > 10 * 60000) { P.drive = 0; P.warned = 0; } }
    if (!(lim > 0)) return;
    if (P.drive >= lim * 60000 && (!P.warned || P.drive - P.warned >= 30 * 60000)) {
      P.warned = P.drive; const h = Math.floor(P.drive / 3600000), m = Math.round(P.drive % 3600000 / 60000);
      const msg = 'Du fährst seit ' + [h ? h + (h === 1 ? ' Stunde' : ' Stunden') : '', m ? m + ' Minuten' : ''].filter(Boolean).join(' ') + '. Zeit für eine Pause. Sage „Rastplatz auf der Route“, wenn du einen suchen willst.';
      toast(msg, 9000); H.speak(msg);
    }
  }

  // ----- Spurassistent und Kreuzungsansicht -----
  let panel = null;
  function ensurePanel() {
    if (panel) return panel; const scr = $('navscreen'); if (!scr) return null;
    panel = document.createElement('div'); panel.id = 'npLane'; panel.hidden = true; panel.innerHTML = '<canvas id="npJct" width="132" height="132"></canvas><div id="npLanes"></div>'; scr.appendChild(panel); return panel;
  }
  async function fetchLanes(step, rt) {
    const P0 = rt.shape[Math.min(step.i, rt.shape.length - 1)];
    let k = step.i; while (k > 0 && rt.cum[step.i] - rt.cum[k] < 25) k--;
    const Q = rt.shape[k];
    const j = await Nav.overpass(`[out:json][timeout:15];way(around:40,${P0.lat.toFixed(6)},${P0.lon.toFixed(6)})["highway"][~"^turn:lanes"~"."];out tags geom 8;`, A.fetch);
    const travel = k < step.i ? bearing(Q, P0) : bearing(rt.shape[Math.max(0, step.i - 1)], P0);
    return lanesFromWays(j.elements || [], Q, travel);
  }
  function drawJunction(s, rt) {
    const cv = $('npJct'); if (!cv) return; const g = cv.getContext('2d'), W = cv.width, st = s.step;
    g.clearRect(0, 0, W, W); g.fillStyle = 'rgba(11,22,38,.92)'; g.beginPath(); g.roundRect(0, 0, W, W, 18); g.fill();
    const c = rt.shape[Math.min(st.i, rt.shape.length - 1)]; let a = st.i; while (a > 0 && rt.cum[st.i] - rt.cum[a] < 70) a--; let b = st.i; while (b < rt.shape.length - 1 && rt.cum[b] - rt.cum[st.i] < 70) b++;
    const inB = bearing(rt.shape[a], c) * RAD, sc = 0.78, cx = W / 2, cy = W * 0.62, cosL = Math.cos(c.lat * RAD);
    const T = (p) => { const dx = (p.lon - c.lon) * 111320 * cosL, dy = (p.lat - c.lat) * 111320, rx = dx * Math.cos(inB) - dy * Math.sin(inB), ry = dx * Math.sin(inB) + dy * Math.cos(inB); return [cx + rx * sc, cy - ry * sc]; };
    g.lineCap = 'round'; g.lineJoin = 'round';
    const line = (i0, i1, col, w) => { g.beginPath(); for (let i = i0; i <= i1; i++) { const [x, y] = T(rt.shape[i]); if (i === i0) g.moveTo(x, y); else g.lineTo(x, y); } g.strokeStyle = col; g.lineWidth = w; g.stroke(); };
    line(a, st.i, '#5b6b86', 9); line(st.i, b, '#7cc0ff', 9);
    const [ex, ey] = T(rt.shape[b]), [px, py] = T(rt.shape[Math.max(st.i, b - 1)]), an = Math.atan2(ey - py, ex - px);
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(ex + Math.cos(an) * 12, ey + Math.sin(an) * 12); g.lineTo(ex + Math.cos(an + 2.5) * 14, ey + Math.sin(an + 2.5) * 14); g.lineTo(ex + Math.cos(an - 2.5) * 14, ey + Math.sin(an - 2.5) * 14); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
  }
  const TURNK = ['left', 'right', 'slight_left', 'slight_right', 'sharp_left', 'sharp_right', 'straight', 'uturn'];
  function onTick(s) {
    if (!N.route || !s || !s.step || !ensurePanel()) return;
    const st = s.step, near = s.dNext <= 450 && s.dNext > 5 && st.kind !== 'arrive' && st.kind !== 'depart' && st.kind !== 'roundabout';
    if (!near || N.srch) { panel.hidden = true; return; }
    const key = Math.round(st.at), jct = s.dNext <= 280;
    let lanes = LC[key];
    if (lanes === undefined && !st.via) { LC[key] = null; if (TURNK.includes(st.kind) && A.S.online !== false && X().lane !== 'aus') fetchLanes(st, N.route).then((l) => { LC[key] = l; }).catch(() => { /* egal */ }); }
    lanes = LC[key];
    const ok = lanes ? validLanes(lanes, st.kind) : null, box = $('npLanes');
    box.innerHTML = lanes && X().lane !== 'aus' ? lanes.map((l, k) => `<i class="${ok ? (ok[k] ? 'on' : '') : 'on'}">${l.map((x) => LANE_ICON[x] || '⬆').join('')}</i>`).join('') : '';
    const showJ = jct && X().jct !== 'aus', showL = !!box.innerHTML;
    $('npJct').style.display = showJ ? '' : 'none'; if (showJ) drawJunction(s, N.route);
    panel.hidden = !(showJ || showL);
  }

  // ----- Menü und Sprache -----
  function menuHTML(row) {
    return '<div class="mnSec">Unterwegs</div>'
      + row('np-fuel', '⛽', 'Tankstelle auf der Route', 'in den nächsten 60 km') + row('np-rest', '🛋', 'Rastplatz auf der Route', 'Pause machen') + row('np-park', '🅿', 'Parkplatz auf der Route', 'mit Gebühr-Hinweis')
      + row('np-via', '➕', 'Zwischenstopp hinzufügen', N.via && N.via.length ? N.via.length + ' eingeplant' : 'Ort suchen, Route wird angepasst')
      + row('np-prof', '⛰', 'Höhenprofil', 'Steigung und Gefälle der Route') + row('np-wx', '🌦', 'Wetter auf der Route', 'Regen, Glätte, Sturm')
      + '<div class="mnSec">Strecken</div>'
      + row('np-gin', '📥', 'GPX-Strecke laden', 'aus Komoot und anderen Apps') + row('np-gout', '📤', 'Route als GPX teilen', 'Datei an andere Apps') + row('np-tgo', '🔁', 'Gefahrene Strecke erneut fahren', 'aus der Aufzeichnung') + row('np-tout', '📤', 'Gefahrene Strecke als GPX', 'Aufzeichnung exportieren');
  }
  function run(m) {
    switch (m) {
      case 'np-fuel': return poiAlong('fuel'); case 'np-rest': return poiAlong('rest'); case 'np-park': return poiAlong('park');
      case 'np-via': return askVia(); case 'np-prof': return profile(); case 'np-wx': return weather();
      case 'np-gin': return importGpx(); case 'np-gout': return shareRoute(); case 'np-tgo': return driveTrack(); case 'np-tout': return shareTrack();
      default: return null;
    }
  }
  const onMenu = (m) => { if (!/^np-/.test(m)) return false; run(m); return true; };
  function voice(what) {
    const map = { fuel: 'np-fuel', rest: 'np-rest', park: 'np-park', via: 'np-via', prof: 'np-prof', wx: 'np-wx', gpx: 'np-gin', gout: 'np-gout', tgo: 'np-tgo' };
    if (/^talk-/.test(what)) { root.NavUI.setX({ talk: what.slice(5) }); return Promise.resolve(what === 'talk-kurz' ? 'Ich sage nur noch Abbiegungen und Warnungen an.' : 'Alle Ansagen sind wieder an.'); }
    if (/^brk-/.test(what)) { const v = what.slice(4); root.NavUI.setX({ brk: v }); return Promise.resolve(v === 'aus' ? 'Pausen-Erinnerung aus.' : 'Ich erinnere dich nach ' + (+v / 60).toString().replace('.', ',') + ' Stunden an eine Pause.'); }
    if (what === 'break') { P.drive = 0; P.warned = 0; return Promise.resolve('Pausenzähler zurückgesetzt.'); }
    const r = run(map[what]); return Promise.resolve(r).then((x) => (typeof x === 'string' ? x : 'Okay.'));
  }

  function init(h) {
    H = h; A = h.A; N = h.N;
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-poi]'); if (!b || !N.poiList) return; const p = N.poiList[+b.dataset.poi]; if (p) addStop(p);
    });
    const pl = $('nsPlaces');
    if (pl && !$('npBtns')) {
      const d = document.createElement('div'); d.id = 'npBtns'; d.innerHTML = '<button class="act" data-npb="gin">📥 GPX-Strecke laden</button><button class="act" data-npb="tgo">🔁 Gefahrene Strecke erneut fahren</button>';
      pl.parentNode.insertBefore(d, pl); d.addEventListener('click', (e) => { const b = e.target.closest('[data-npb]'); if (!b) return; if (b.dataset.npb === 'gin') importGpx(); else driveTrack(); });
    }
  }
  root.NavPlus = Object.assign({ init, menuHTML, onMenu, voice, onPos, onTick, afterRoute, addStop, replanVia, importGpx, startRoute }, pure);
})(typeof window !== 'undefined' ? window : globalThis);
