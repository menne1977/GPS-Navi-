/* Streckenaufzeichnung: speichert die gefahrene Linie und macht daraus ein Bild (PNG)
   mit Kilometer, Zeit, Geschwindigkeit und Steigung. Nur lokal im Gerät. */
(function (root) {
  'use strict';
  const KEY = 'tachoTrack', MAXP = 30000;
  let st = { on: false, pts: [], start: 0 };
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x && Array.isArray(x.pts)) st = x; } catch (_) { /* neu */ }
  let dirty = 0;
  function persist(force) { if (!force && ++dirty < 15) return; dirty = 0; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) { /* voll */ } }
  const hav = (a, b, c, d) => { const R = 6371000, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r, h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

  // Punkt: [lat, lon, Höhe, km/h, Zeit ms]
  function add(lat, lon, alt, v, t, acc) {
    if (!st.on || lat == null || (acc != null && acc > 40)) return;
    const l = st.pts[st.pts.length - 1];
    if (l) { const dt = t - l[4], d = hav(l[0], l[1], lat, lon); if (d < 12 && dt < 8000) return; if (d < 3) return; }
    if (!st.start) st.start = t;
    st.pts.push([+lat.toFixed(6), +lon.toFixed(6), alt == null ? null : Math.round(alt * 10) / 10, Math.round(v || 0), t]);
    if (st.pts.length > MAXP) st.pts.splice(0, st.pts.length - MAXP);
    persist();
  }
  const start = () => { st.on = true; if (!st.pts.length) st.start = 0; persist(true); };
  const stop = () => { st.on = false; persist(true); };
  const clear = () => { st = { on: st.on, pts: [], start: 0 }; persist(true); };

  // Auswertung
  function stats() {
    const p = st.pts; if (p.length < 2) return null;
    let dist = 0, mov = 0, vmax = 0, up = 0, down = 0, gmax = -99, gmin = 99;
    // Höhe glätten (gleitender Mittelwert über 5 Punkte)
    const al = p.map((q, i) => { let s = 0, n = 0; for (let k = Math.max(0, i - 2); k <= Math.min(p.length - 1, i + 2); k++) if (p[k][2] != null) { s += p[k][2]; n++; } return n ? s / n : null; });
    let ref = al.find((a) => a != null), cum = [0];
    for (let i = 1; i < p.length; i++) {
      const d = hav(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]), dt = p[i][4] - p[i - 1][4];
      dist += d; cum.push(dist);
      if (p[i][3] >= 3 && dt < 120000) mov += dt;
      if (p[i][3] > vmax && p[i][3] < 330) vmax = p[i][3];
      if (al[i] != null && ref != null && Math.abs(al[i] - ref) >= 3) { if (al[i] > ref) up += al[i] - ref; else down += ref - al[i]; ref = al[i]; }
    }
    // Steigung über ≥ 60 m Abstand
    let j = 0;
    for (let i = 1; i < p.length; i++) {
      if (al[i] == null) continue;
      while (j < i - 1 && cum[i] - cum[j + 1] >= 60) j++;
      if (al[j] != null && cum[i] - cum[j] >= 60) { const g = (al[i] - al[j]) / (cum[i] - cum[j]) * 100; if (Math.abs(g) < 35) { if (g > gmax) gmax = g; if (g < gmin) gmin = g; } }
    }
    const alts = al.filter((a) => a != null);
    return { dist: dist / 1000, total: p[p.length - 1][4] - p[0][4], mov, vmax, vavg: mov > 0 ? dist / 1000 / (mov / 3600000) : 0, up, down, gmax: gmax === -99 ? null : gmax, gmin: gmin === 99 ? null : gmin, amin: alts.length ? Math.min(...alts) : null, amax: alts.length ? Math.max(...alts) : null, al, cum, n: p.length };
  }
  const fmtT = (ms) => { const m = Math.round(ms / 60000), h = Math.floor(m / 60); return h ? h + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min'; };
  const f1 = (n) => n.toFixed(1).replace('.', ',');
  const spdCol = (v) => v < 50 ? '#38bdf8' : v < 100 ? '#3ddc97' : v < 130 ? '#ffd23c' : v < 180 ? '#ff9f1a' : '#ff3b30';

  // Bild zeichnen (1080 x 1500)
  function image() {
    const s = stats(); if (!s) return null;
    const W = 1080, H = 1500, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), p = st.pts;
    g.fillStyle = '#05080e'; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#12203a'); gr.addColorStop(1, '#05080e'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const dt = new Date(p[0][4]);
    g.fillStyle = '#fff'; g.font = '800 54px sans-serif'; g.textAlign = 'left'; g.fillText('Meine Strecke', 50, 90);
    g.fillStyle = '#8fa4be'; g.font = '600 32px sans-serif';
    g.fillText(dt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr', 50, 138);
    // Karte (Linie, nach Tempo gefärbt)
    const mx = 50, my = 170, mw = W - 100, mh = 640;
    g.fillStyle = '#0a1220'; g.beginPath(); g.roundRect(mx, my, mw, mh, 28); g.fill(); g.strokeStyle = '#27406a'; g.lineWidth = 2; g.stroke();
    let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
    for (const q of p) { la0 = Math.min(la0, q[0]); la1 = Math.max(la1, q[0]); lo0 = Math.min(lo0, q[1]); lo1 = Math.max(lo1, q[1]); }
    const k = Math.cos((la0 + la1) / 2 * Math.PI / 180), wx = Math.max(1e-5, (lo1 - lo0) * k), wy = Math.max(1e-5, la1 - la0), pad = 50;
    const sc = Math.min((mw - 2 * pad) / wx, (mh - 2 * pad) / wy), ox = mx + (mw - wx * sc) / 2, oy = my + (mh - wy * sc) / 2;
    const X = (lo) => ox + (lo - lo0) * k * sc, Y = (la) => oy + (la1 - la) * sc;
    g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 9;
    for (let i = 1; i < p.length; i++) {
      if (p[i][4] - p[i - 1][4] > 600000) continue; // Pause nicht verbinden
      g.strokeStyle = spdCol((p[i][3] + p[i - 1][3]) / 2); g.beginPath(); g.moveTo(X(p[i - 1][1]), Y(p[i - 1][0])); g.lineTo(X(p[i][1]), Y(p[i][0])); g.stroke();
    }
    const dot = (q, col, t) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(X(q[1]), Y(q[0]), 17, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(X(q[1]), Y(q[0]), 12, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '800 26px sans-serif'; g.textAlign = 'center'; g.fillText(t, X(q[1]), Y(q[0]) - 28); };
    dot(p[0], '#3ddc97', 'Start'); dot(p[p.length - 1], '#ff3b30', 'Ziel');
    // Tempo-Legende
    g.textAlign = 'left'; g.font = '600 24px sans-serif';
    [['unter 50', 0], ['50–100', 70], ['100–130', 110], ['130–180', 150], ['über 180', 200]].forEach(([t, v], i) => { const x = mx + 24 + i * 150; g.fillStyle = spdCol(v); g.fillRect(x, my + mh - 40, 26, 10); g.fillStyle = '#8fa4be'; g.fillText(t, x + 34, my + mh - 29); });
    // Kennzahlen
    const box = (x, y, w, h, title, val, unit, col) => {
      g.fillStyle = '#0c1626'; g.beginPath(); g.roundRect(x, y, w, h, 22); g.fill(); g.strokeStyle = '#27406a'; g.lineWidth = 2; g.stroke();
      g.textAlign = 'center'; g.fillStyle = '#8fa4be'; g.font = '700 28px sans-serif'; g.fillText(title, x + w / 2, y + 42);
      g.fillStyle = col; let fs = 64; g.font = '800 ' + fs + 'px sans-serif'; while (g.measureText(val).width > w - (unit ? 110 : 40) && fs > 30) { fs -= 2; g.font = '800 ' + fs + 'px sans-serif'; } const tw = g.measureText(val).width; g.fillText(val, x + w / 2 - (unit ? 4 : 0), y + 112);
      if (unit) { g.font = '700 28px sans-serif'; g.fillStyle = '#8fa4be'; g.fillText(unit, x + w / 2 + tw / 2 + 28, y + 112); }
    };
    const bw = (W - 100 - 40) / 3, y1 = 840, y2 = 980, bh = 124;
    box(50, y1, bw, bh, 'STRECKE', f1(s.dist), 'km', '#3ddc97');
    box(50 + bw + 20, y1, bw, bh, 'FAHRZEIT', fmtT(s.mov || s.total), '', '#ffd23f');
    box(50 + 2 * (bw + 20), y1, bw, bh, 'GESAMTZEIT', fmtT(s.total), '', '#ffffff');
    box(50, y2, bw, bh, 'Ø TEMPO', String(Math.round(s.vavg)), 'km/h', '#38bdf8');
    box(50 + bw + 20, y2, bw, bh, 'HÖCHSTTEMPO', String(Math.round(s.vmax)), 'km/h', '#ff9f1a');
    box(50 + 2 * (bw + 20), y2, bw, bh, 'MAX. STEIGUNG', s.gmax == null ? '–' : f1(s.gmax), s.gmax == null ? '' : '%', '#ffd23f');
    box(50, 1120, bw, bh, 'AUFWÄRTS', Math.round(s.up) + '', 'm', '#3ddc97');
    box(50 + bw + 20, 1120, bw, bh, 'ABWÄRTS', Math.round(s.down) + '', 'm', '#ff6b6b');
    box(50 + 2 * (bw + 20), 1120, bw, bh, 'HÖHE', s.amin == null ? '–' : Math.round(s.amin) + '–' + Math.round(s.amax), s.amin == null ? '' : 'm', '#ffffff');
    // Profil unten: Höhe (Fläche) und Tempo (Linie) über der Strecke
    const px = 50, py = 1275, pw = W - 100, ph = 180;
    g.fillStyle = '#0a1220'; g.beginPath(); g.roundRect(px, py, pw, ph, 22); g.fill(); g.strokeStyle = '#27406a'; g.stroke();
    const tot = s.cum[s.cum.length - 1] || 1, ix = (i) => px + 20 + (pw - 40) * s.cum[i] / tot;
    if (s.amin != null && s.amax > s.amin) {
      g.beginPath(); let first = true;
      s.al.forEach((a, i) => { if (a == null) return; const y = py + ph - 24 - (ph - 52) * (a - s.amin) / (s.amax - s.amin); if (first) { g.moveTo(ix(i), py + ph - 12); g.lineTo(ix(i), y); first = false; } else g.lineTo(ix(i), y); });
      g.lineTo(px + pw - 20, py + ph - 12); g.closePath(); g.fillStyle = 'rgba(61,220,151,.28)'; g.fill();
    }
    const vm = Math.max(60, s.vmax); g.beginPath(); p.forEach((q, i) => { const y = py + ph - 16 - (ph - 40) * q[3] / vm; if (i) g.lineTo(ix(i), y); else g.moveTo(ix(i), y); });
    g.strokeStyle = '#ffd23c'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#8fa4be'; g.font = '600 22px sans-serif'; g.textAlign = 'left'; g.fillText('Höhe (grün) und Tempo (gelb) über die Strecke', px + 20, py + 28);
    return c;
  }
  function png() { const c = image(); return c ? c.toDataURL('image/png') : null; }
  root.Track = { add, start, stop, clear, stats, png, image, get on() { return st.on; }, get count() { return st.pts.length; }, fmtT, f1, flush: () => persist(true) };
})(typeof window !== 'undefined' ? window : globalThis);
