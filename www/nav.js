/* Navi: Ziel suchen, Route berechnen, Abbiegehinweise. Ohne Schlüssel, nur freie Dienste:
   Suche: Nominatim (OpenStreetMap). Route: Valhalla (OSM Deutschland), ersatzweise OSRM. */
(function (root) {
  'use strict';
  const RAD = Math.PI / 180;
  const hav = (a, b, c, d) => {
    const dLat = (c - a) * RAD, dLon = (d - b) * RAD;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * RAD) * Math.cos(c * RAD) * Math.sin(dLon / 2) ** 2;
    return 12742000 * Math.asin(Math.min(1, Math.sqrt(x)));
  };
  const ARROW = { depart: '⬆', straight: '⬆', slight_right: '↗', right: '➡', sharp_right: '↘', uturn: '⮌', sharp_left: '↙', left: '⬅', slight_left: '↖', roundabout: '⟳', arrive: '⚑', ramp: '↗', merge: '⬆' };
  const VAL = { 1: 'depart', 2: 'depart', 3: 'depart', 4: 'arrive', 5: 'arrive', 6: 'arrive', 7: 'straight', 8: 'straight', 9: 'slight_right', 10: 'right', 11: 'sharp_right', 12: 'uturn', 13: 'uturn', 14: 'sharp_left', 15: 'left', 16: 'slight_left', 17: 'straight', 18: 'slight_right', 19: 'slight_left', 20: 'slight_right', 21: 'slight_left', 22: 'straight', 23: 'slight_right', 24: 'slight_left', 25: 'straight', 26: 'roundabout', 27: 'roundabout', 37: 'straight', 38: 'straight' };

  function decode6(str, prec) {
    const f = Math.pow(10, prec || 6); let i = 0, lat = 0, lon = 0; const out = [];
    while (i < str.length) {
      for (let k = 0; k < 2; k++) {
        let sh = 0, r = 0, b;
        do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5; } while (b >= 32);
        const d = (r & 1) ? ~(r >> 1) : (r >> 1);
        if (k === 0) lat += d; else lon += d;
      }
      out.push({ lat: lat / f, lon: lon / f });
    }
    return out;
  }

  const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function finish(shape, steps, len, dur) {
    const cum = [0];
    for (let i = 1; i < shape.length; i++) cum.push(cum[i - 1] + hav(shape[i - 1].lat, shape[i - 1].lon, shape[i].lat, shape[i].lon));
    steps.forEach((s) => { s.at = cum[Math.min(s.i, cum.length - 1)] || 0; });
    const geo = cum[cum.length - 1];
    return { shape, cum, len: geo, dur: dur && len ? dur * (geo / len) : (dur || 0), steps };
  }

  // ---- Suche ----
  async function geocode(q, near, fetchFn) {
    let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=de&q=' + encodeURIComponent(q);
    if (near && near.lat != null) {
      const d = 1.2; url += `&viewbox=${near.lon - d},${near.lat + d},${near.lon + d},${near.lat - d}`;
    }
    const r = await fetchFn(url, { headers: { 'Accept-Language': 'de' } });
    if (!r.ok) throw new Error('Suche HTTP ' + r.status);
    const j = await r.json();
    const list = (j || []).map((x) => ({ name: clean(x.display_name).split(',').slice(0, 3).join(','), lat: +x.lat, lon: +x.lon, kind: x.type }));
    if (near && near.lat != null) list.sort((a, b) => hav(near.lat, near.lon, a.lat, a.lon) - hav(near.lat, near.lon, b.lat, b.lon));
    return list;
  }

  // ---- Route: Valhalla (mehrere Varianten mit Profil, Kurven, Streckenart) ----
  function parseTrip(t) {
    const shape = []; const steps = [];
    t.legs.forEach((leg) => {
      const off = shape.length ? shape.length - 1 : 0;
      const pts = decode6(leg.shape, 6);
      (shape.length ? pts.slice(1) : pts).forEach((p) => shape.push(p));
      (leg.maneuvers || []).forEach((m) => steps.push({
        i: off + (m.begin_shape_index || 0), kind: VAL[m.type] || 'straight',
        text: clean(m.instruction), say: clean(m.verbal_pre_transition_instruction || m.instruction),
        street: clean((m.street_names || [])[0]), len: (m.length || 0) * 1000, t: m.time || 0
      }));
    });
    return finish(shape, steps, t.summary.length * 1000, t.summary.time);
  }
  // co: Profilwahl und Optionen, alt: Anzahl Alternativen. Liefert alle Routen (Haupt- und Alternativrouten).
  async function valhalla(a, b, fetchFn, co) {
    co = co || {};
    const costing = co.costing || 'auto';
    const req = { locations: [{ lat: a.lat, lon: a.lon, type: 'break' }, { lat: b.lat, lon: b.lon, type: 'break' }], costing, directions_options: { language: 'de-DE', units: 'kilometers' } };
    if (co.opt) { req.costing_options = {}; req.costing_options[costing] = co.opt; }
    if (co.alt) req.alternates = co.alt;
    if (a.heading != null) req.locations[0].heading = Math.round(a.heading);
    const r = await fetchFn('https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify(req)), {});
    if (!r.ok) throw new Error('Valhalla HTTP ' + r.status);
    const j = await r.json();
    const trips = [j.trip].concat((j.alternates || []).map((x) => x.trip)).filter((t) => t && t.legs && t.legs.length);
    if (!trips.length) throw new Error('Keine Route');
    return trips.map(parseTrip);
  }
  async function viaValhalla(a, b, fetchFn) { return (await valhalla(a, b, fetchFn, {}))[0]; }

  // ---- Route: OSRM (Ersatz, Text selbst gebaut) ----
  const OS_MOD = { 'sharp right': 'sharp_right', right: 'right', 'slight right': 'slight_right', straight: 'straight', 'slight left': 'slight_left', left: 'left', 'sharp left': 'sharp_left', uturn: 'uturn' };
  const MOD_TXT = { sharp_right: 'scharf rechts abbiegen', right: 'rechts abbiegen', slight_right: 'leicht rechts halten', straight: 'geradeaus weiterfahren', slight_left: 'leicht links halten', left: 'links abbiegen', sharp_left: 'scharf links abbiegen', uturn: 'wenden' };
  async function viaOsrm(a, b, fetchFn) {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson&steps=true`;
    const r = await fetchFn(url, {});
    if (!r.ok) throw new Error('OSRM HTTP ' + r.status);
    const j = await r.json();
    const rt = j.routes && j.routes[0]; if (!rt) throw new Error('Keine Route');
    const shape = rt.geometry.coordinates.map((c) => ({ lat: c[1], lon: c[0] }));
    const cum = [0]; for (let k = 1; k < shape.length; k++) cum.push(cum[k - 1] + hav(shape[k - 1].lat, shape[k - 1].lon, shape[k].lat, shape[k].lon));
    const nearestIdx = (loc) => { let bi = 0, bd = 1e12; for (let k = 0; k < shape.length; k++) { const d = hav(loc[1], loc[0], shape[k].lat, shape[k].lon); if (d < bd) { bd = d; bi = k; } } return bi; };
    const steps = [];
    (rt.legs || []).forEach((leg) => (leg.steps || []).forEach((s) => {
      const m = s.maneuver || {}; const mod = OS_MOD[m.modifier] || 'straight'; const street = clean(s.name);
      let kind = mod, txt;
      if (m.type === 'depart') { kind = 'depart'; txt = 'Losfahren' + (street ? ' auf ' + street : ''); }
      else if (m.type === 'arrive') { kind = 'arrive'; txt = 'Sie haben Ihr Ziel erreicht'; }
      else if (m.type === 'roundabout' || m.type === 'rotary') { kind = 'roundabout'; txt = 'Im Kreisverkehr ' + (m.exit ? 'die ' + m.exit + '. Ausfahrt nehmen' : 'ausfahren'); }
      else { txt = (MOD_TXT[mod] || 'weiterfahren') + (street ? ' auf ' + street : ''); txt = txt.charAt(0).toUpperCase() + txt.slice(1); }
      steps.push({ i: nearestIdx(m.location || [shape[0].lon, shape[0].lat]), kind, text: txt, say: txt, street, len: s.distance || 0, t: s.duration || 0 });
    }));
    return finish(shape, steps, rt.distance, rt.duration);
  }

  async function route(a, b, fetchFn) {
    try { return await viaValhalla(a, b, fetchFn); }
    catch (e1) {
      try { return await viaOsrm(a, b, fetchFn); }
      catch (e2) { throw new Error('Route nicht berechenbar (' + String((e1 && e1.message) || e1).slice(0, 40) + ')'); }
    }
  }

  // ---- Kurvigkeit: Richtungswechsel pro Kilometer (Punkte alle ca. 60 m) ----
  function curviness(rt) {
    const pts = []; let acc = 0;
    for (let i = 0; i < rt.shape.length; i++) { if (!pts.length || rt.cum[i] - acc >= 60) { pts.push(rt.shape[i]); acc = rt.cum[i]; } }
    let sum = 0, bends = 0, run = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const h1 = Math.atan2((pts[i].lon - pts[i - 1].lon) * Math.cos(pts[i].lat * RAD), pts[i].lat - pts[i - 1].lat) / RAD;
      const h2 = Math.atan2((pts[i + 1].lon - pts[i].lon) * Math.cos(pts[i].lat * RAD), pts[i + 1].lat - pts[i].lat) / RAD;
      let d = Math.abs(((h2 - h1 + 540) % 360) - 180);
      if (d > 100) d = 0; // Abbiegen an Kreuzungen zählt nicht als Kurve
      if (d >= 4) { sum += d; run += d; } else { if (run >= 25) bends++; run = 0; }
    }
    const km = Math.max(0.5, rt.len / 1000);
    return { degPerKm: sum / km, bendsPerKm: bends / km };
  }

  const LAND = {
    wald: { label: 'Wald', test: (t) => t.natural === 'wood' || t.landuse === 'forest' },
    felder: { label: 'Felder und Wiesen', test: (t) => /^(farmland|meadow|orchard|vineyard|grass)$/.test(t.landuse || '') || t.natural === 'grassland' },
    wasser: { label: 'Wasser', test: (t) => /^(water|wetland)$/.test(t.natural || '') || /^(river|stream|canal)$/.test(t.waterway || '') },
    heide: { label: 'Heide', test: (t) => /^(heath|scrub)$/.test(t.natural || '') }
  };
  const OVS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  async function overpass(q, fetchFn) {
    return new Promise((resolve, reject) => {
      let fails = 0, done = false;
      const go = (k) => {
        if (done || k >= OVS.length) return;
        const to = setTimeout(() => { fails++; if (fails >= OVS.length && !done) reject(new Error('Landschaftsdaten nicht erreichbar')); }, 14000);
        Promise.resolve(fetchFn(OVS[k], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }))
          .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then((j) => { clearTimeout(to); if (!done) { done = true; resolve(j); } })
          .catch(() => { clearTimeout(to); fails++; if (fails >= OVS.length && !done) reject(new Error('Landschaftsdaten nicht erreichbar')); else go(k + 1); });
        if (k + 1 < OVS.length) setTimeout(() => { if (!done) go(k + 1); }, 2500);
      };
      go(0);
    });
  }
  // Anteil der Strecke mit gewünschter Landschaft (Stichproben alle ~500 m, höchstens 70)
  async function scenic(rt, kinds, fetchFn) {
    const step = Math.max(500, rt.len / 70), samples = []; let next = 0;
    for (let i = 0; i < rt.shape.length; i++) if (rt.cum[i] >= next) { samples.push(rt.shape[i]); next += step; }
    if (samples.length < 2) return { frac: 0, per: {} };
    const pts = samples.map((p) => p.lat.toFixed(5) + ',' + p.lon.toFixed(5)).join(',');
    const q = `[out:json][timeout:25];(nwr(around:150,${pts})["natural"~"^(wood|scrub|heath|grassland|water|wetland)$"];nwr(around:150,${pts})["landuse"~"^(forest|meadow|farmland|orchard|vineyard|grass)$"];nwr(around:150,${pts})["waterway"~"^(river|stream|canal)$"];);out tags bb 2500;`;
    const j = await overpass(q, fetchFn), pad = 0.0012;
    const els = (j.elements || []).map((e) => ({ t: e.tags || {}, b: e.bounds || (e.lat != null ? { minlat: e.lat, maxlat: e.lat, minlon: e.lon, maxlon: e.lon } : null) })).filter((e) => e.b);
    const per = {}; let hit = 0;
    kinds.forEach((k) => { per[k] = 0; });
    samples.forEach((p) => {
      let any = false;
      kinds.forEach((k) => {
        const f = LAND[k]; if (!f) return;
        if (els.some((e) => f.test(e.t) && p.lat >= e.b.minlat - pad && p.lat <= e.b.maxlat + pad && p.lon >= e.b.minlon - pad && p.lon <= e.b.maxlon + pad)) { per[k]++; any = true; }
      });
      if (any) hit++;
    });
    Object.keys(per).forEach((k) => { per[k] = per[k] / samples.length; });
    return { frac: hit / samples.length, per };
  }

  /* Routenplaner mit Wahl.
     o.veh: 'auto' | 'motorrad'; o.curves: 'egal' | 'wenig' | 'mittel' | 'viele';
     o.type: 'normal' | 'schnell' | 'kurz' | 'sparsam' | 'lang' | 'gemuetlich'; o.scenic: ['wald','felder','wasser','heide'] */
  async function plan(a, b, o, fetchFn, progress) {
    o = Object.assign({ veh: 'auto', curves: 'egal', type: 'normal', scenic: [] }, o || {});
    const moto = o.veh === 'motorrad', costing = moto ? 'motorcycle' : 'auto';
    const variants = [{ costing, opt: {} }];
    const wantCurvy = o.curves !== 'egal' || o.scenic.length || o.type === 'gemuetlich' || o.type === 'lang';
    if (o.type === 'kurz' || o.type === 'sparsam') variants.push({ costing, opt: { shortest: true } });
    if (o.type === 'sparsam') variants.push({ costing, opt: { use_highways: 0.2 } });
    if (wantCurvy || o.type === 'schnell' || o.type === 'normal') variants.push({ costing, opt: { use_highways: 0 } }, { costing, opt: { use_highways: 0.5 } });
    if (wantCurvy && moto) variants.push({ costing, opt: { use_highways: 0, use_trails: 0.6 } });
    if (wantCurvy && !moto) variants.push({ costing, opt: { use_highways: 0, use_distance: 0.7 } });
    const alt = wantCurvy ? 2 : (o.type === 'schnell' || o.type === 'normal' ? 1 : 0);
    if (progress) progress('Varianten rechnen …');
    const all = [];
    let err = null;
    await Promise.all(variants.map((v) => valhalla(a, b, fetchFn, { costing: v.costing, opt: v.opt, alt }).then((rs) => rs.forEach((r) => all.push(r))).catch((e) => { err = e; })));
    if (!all.length) { const base = await route(a, b, fetchFn); return { rt: base, info: { note: 'Nur Standardroute möglich', cands: 1 } }; }
    // doppelte Routen entfernen (gleiche Länge, gleiche Mitte)
    const cands = [];
    all.forEach((r) => { if (!cands.some((c) => Math.abs(c.len - r.len) < 40 && Math.abs(c.dur - r.dur) < 20)) cands.push(r); });
    cands.forEach((c) => { c.curv = curviness(c); });
    const minDur = Math.min(...cands.map((c) => c.dur || 1e9)), minLen = Math.min(...cands.map((c) => c.len));
    const maxExtra = { schnell: 0.15, normal: 0.25, kurz: 0.6, sparsam: 0.5, lang: 1.4, gemuetlich: 0.9 }[o.type] || 0.3;
    const curveExtra = { wenig: 0.2, mittel: 0.5, viele: 0.9, egal: 0 }[o.curves] || 0;
    const limit = 1 + Math.max(maxExtra, curveExtra);
    let pool = cands.filter((c) => (c.dur || minDur) <= minDur * limit + 60);
    if (!pool.length) pool = cands.slice(0, 1);
    const cs = pool.map((c) => c.curv.degPerKm), cmin = Math.min(...cs), cmax = Math.max(...cs), cr = Math.max(1e-6, cmax - cmin);
    // Landschaft nur für die aussichtsreichsten Kandidaten abfragen (schont die Server)
    const kinds = (o.scenic || []).filter((k) => LAND[k]);
    if (kinds.length && pool.length) {
      if (progress) progress('Landschaft prüfen …');
      const top = pool.slice().sort((x, y) => Math.abs((x.dur || 0) - minDur) - Math.abs((y.dur || 0) - minDur)).slice(0, 4);
      await Promise.all(top.map((c) => scenic(c, kinds, fetchFn).then((sc) => { c.scenic = sc; }).catch(() => { c.scenic = null; })));
    }
    const score = (c) => {
      const cn = (c.curv.degPerKm - cmin) / cr, ex = ((c.dur || minDur) / minDur) - 1;
      let v = 0;
      if (o.curves === 'viele') v += 3 * cn; else if (o.curves === 'wenig') v += 3 * (1 - cn); else if (o.curves === 'mittel') v += 3 * (1 - Math.abs(cn - 0.5) * 2);
      if (o.type === 'kurz') v += 4 * (1 - (c.len - minLen) / Math.max(1, minLen)) ; // kürzer = besser
      else if (o.type === 'sparsam') v += 3 * (1 - (c.len - minLen) / Math.max(1, minLen)) - 1.5 * c.curv.degPerKm / Math.max(1, cmax);
      else if (o.type === 'lang') v += 3 * ((c.len - minLen) / Math.max(1, minLen));
      else if (o.type === 'gemuetlich') v += 1.0 * cn - 0.6 * ex;
      else if (o.type === 'schnell') v -= 4 * ex;
      else v -= 1.0 * ex;
      if (kinds.length) v += 4 * ((c.scenic && c.scenic.frac) || 0);
      if (o.type !== 'lang') v -= 0.6 * ex;
      return v;
    };
    pool.forEach((c) => { c.score = score(c); });
    pool.sort((x, y) => y.score - x.score);
    if (typeof process !== "undefined" && process.env.NAVDBG) console.log(pool.map((c) => [Math.round(c.len), Math.round(c.dur), Math.round(c.curv.degPerKm), c.score.toFixed(2)].join("/")).join("  "));
    const rt = pool[0];
    const info = { cands: cands.length, curv: rt.curv, scenic: rt.scenic || null, minDur, extra: minDur ? (rt.dur / minDur - 1) : 0 };
    if (!kinds.length || !rt.scenic) info.noScenic = kinds.length > 0;
    return { rt, info };
  }

  const curveWord = (c) => (c.degPerKm < 25 ? 'gerade' : c.degPerKm < 60 ? 'leicht kurvig' : c.degPerKm < 110 ? 'kurvig' : 'sehr kurvig');
  function describe(res) {
    const i = res.info; if (!i || !i.curv) return '';
    let t = curveWord(i.curv);
    if (i.scenic) { const parts = Object.keys(i.scenic.per).filter((k) => i.scenic.per[k] > 0.05).map((k) => Math.round(i.scenic.per[k] * 100) + ' % ' + LAND[k].label); if (parts.length) t += ', ' + parts.join(', '); }
    return t;
  }

  // ---- Führung: Position auf der Route, nächster Schritt, Ansagen ----
  class Guide {
    constructor(rt) { this.rt = rt; this.idx = 0; this.off = 0; this.said = {}; this.arrived = false; this.state = null; }
    // Abstand von p zum Streckenstück k, plus Anteil t (0..1) und Meter entlang der Route
    seg(lat, lon, k) {
      const A = this.rt.shape[k], B = this.rt.shape[k + 1], c = Math.cos(lat * RAD);
      const ax = (A.lon - lon) * 111320 * c, ay = (A.lat - lat) * 111320, bx = (B.lon - lon) * 111320 * c, by = (B.lat - lat) * 111320;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t, py = ay + dy * t;
      return { d: Math.sqrt(px * px + py * py), along: this.rt.cum[k] + t * (this.rt.cum[k + 1] - this.rt.cum[k]) };
    }
    update(lat, lon, acc) {
      const n = this.rt.shape.length - 1; if (n < 1) return null;
      let best = null;
      const scan = (a, b) => { for (let k = a; k < b; k++) { const s = this.seg(lat, lon, k); if (!best || s.d < best.d) best = { d: s.d, along: s.along, k }; } };
      scan(Math.max(0, this.idx - 3), Math.min(n, this.idx + 80));
      if (!best || best.d > 60) scan(0, n);
      const limit = Math.max(35, (acc || 10) * 2);
      if (best.d > limit) this.off++; else { this.off = 0; this.idx = best.k; }
      const along = best.along, remain = Math.max(0, this.rt.len - along);
      let ni = this.rt.steps.findIndex((s) => s.at > along - 12);
      if (ni < 0) ni = this.rt.steps.length - 1;
      while (ni < this.rt.steps.length - 1 && this.rt.steps[ni].kind === 'depart') ni++;
      const step = this.rt.steps[ni], dNext = Math.max(0, step.at - along);
      const rate = this.rt.dur && this.rt.len ? this.rt.dur / this.rt.len : 0.07;
      this.arrived = remain < 25;
      const say = [];
      if (!this.arrived && this.off === 0) {
        const key = (z) => ni + ':' + z;
        if (step.kind !== 'arrive' && step.kind !== 'depart') {
          if (dNext < 800 && dNext > 500 && step.len > 1000 && !this.said[key(800)]) { this.said[key(800)] = 1; say.push('In ' + Guide.dist(800) + ' ' + lowerFirst(step.say)); }
          if (dNext < 280 && dNext > 90 && !this.said[key(250)]) { this.said[key(250)] = 1; say.push('In ' + Guide.dist(250) + ' ' + lowerFirst(step.say)); }
        }
        if (step.kind !== 'depart' && dNext < 70 && !this.said[key(0)]) { this.said[key(0)] = 1; say.push(step.say); }
      }
      this.state = {
        off: this.off >= 3, along, remain, remainT: remain * rate, step, dNext, kind: step.kind, arrow: ARROW[step.kind] || '⬆',
        street: step.street, text: step.text, arrived: this.arrived, say, pos: { lat, lon }, dev: best.d
      };
      return this.state;
    }
    static dist(m) { return m >= 950 ? (Math.round(m / 100) / 10).toString().replace('.', ',') + ' Kilometern' : (Math.round(m / 10) * 10) + ' Metern'; }
  }

  const fmtDist = (m) => (m == null ? '–' : m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m');
  const fmtTime = (s) => { const m = Math.round(s / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min'; };

  const api = { geocode, route, plan, describe, curviness, scenic, LAND, Guide, decode6, hav, ARROW, fmtDist, fmtTime, distSay: Guide.dist };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Nav = api;
})(typeof window !== 'undefined' ? window : globalThis);
