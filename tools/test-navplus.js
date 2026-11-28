// Tests für die reine Logik in www/navplus.js. Aufruf: node tools/test-navplus.js
const assert = require('assert');
const Nav = require('../www/nav.js'); global.Nav = Nav;
const P = require('../www/navplus.js');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

// GPX → Route: Rechteck-Strecke mit 3 Ecken
const pts = []; const lat0 = 51.5, lon0 = 7.1, k = 0.00001;
for (let i = 0; i <= 100; i++) pts.push({ lat: lat0, lon: lon0 + i * 0.0001 });          // ~700 m nach Osten
for (let i = 1; i <= 100; i++) pts.push({ lat: lat0 - i * 0.00007, lon: lon0 + 0.01 });   // ~780 m nach Süden (rechts)
for (let i = 1; i <= 100; i++) pts.push({ lat: lat0 - 0.007, lon: lon0 + 0.01 + i * 0.0001 }); // wieder Osten (links)
const gpx = P.gpxWrite('Test & <Strecke>', pts, false);
const g = P.gpxParse(gpx); ok(g.pts.length === pts.length, 'GPX Punkte'); ok(g.name === 'Test &amp; &lt;Strecke&gt;' || g.name.startsWith('Test'), 'GPX Name');
const r = P.routeFromPoints(g.pts, 'T');
const kinds = r.rt.steps.map((s) => s.kind);
ok(kinds[0] === 'depart' && kinds[kinds.length - 1] === 'arrive', 'depart/arrive');
ok(kinds.includes('right') && kinds.includes('left'), 'Abbiegungen erkannt: ' + kinds.join(','));
ok(kinds.length === 4, 'genau 2 Abbiegungen: ' + kinds.join(','));
ok(r.rt.len > 1900 && r.rt.len < 2400, 'Länge ' + r.rt.len);
// Guide läuft darauf
const gd = new Nav.Guide(r.rt); let st = gd.update(pts[0].lat, pts[0].lon, 5, { first: 500, speed: 10 });
ok(st && st.kind === 'right' && st.dNext > 500, 'Guide: erste Abbiegung rechts in ' + Math.round(st.dNext) + ' m');
st = gd.update(pts[90].lat, pts[90].lon, 5, { first: 500, speed: 10 }); ok(st.dNext < 120, 'Guide: nahe Abbiegung');
st = gd.update(pts[pts.length - 1].lat, pts[pts.length - 1].lon, 5, {}); ok(st.arrived, 'Guide: angekommen');

// GPX mit Route und Attributen in anderer Reihenfolge
const g2 = P.gpxParse('<gpx><rte><name>X</name><rtept lon="7.1" lat="51.5"/><rtept lat=\'51.6\' lon=\'7.2\'/></rte><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>');
ok(g2.pts.length === 2 && g2.pts[0].lat === 51.5 && g2.name === 'X', 'rtept bevorzugt, Attribut-Reihenfolge');
assert.throws(() => P.gpxParse('<gpx></gpx>')); n++;

// Zwischenstopp: Zusammensetzen
const mk = (a, b) => { const p = []; for (let i = 0; i <= 20; i++) p.push({ lat: a.lat + (b.lat - a.lat) * i / 20, lon: a.lon + (b.lon - a.lon) * i / 20 }); return P.routeFromPoints(p, '').rt; };
const A1 = { lat: 51.5, lon: 7.1 }, B1 = { lat: 51.5, lon: 7.12 }, C1 = { lat: 51.52, lon: 7.12 };
const m = P.mergeRoutes(mk(A1, B1), mk(B1, C1), { name: 'Tanke' });
ok(m.steps.some((s) => s.via && s.say === 'Zwischenstopp Tanke'), 'Via-Schritt'); ok(m.steps[m.steps.length - 1].kind === 'arrive', 'Ende arrive');
ok(Math.abs(m.len - (mk(A1, B1).len + mk(B1, C1).len)) < 30, 'Länge summiert'); ok(m.steps.every((s, i, a) => i === 0 || s.at >= a[i - 1].at), 'Schritte aufsteigend');

// Fahrspuren
ok(JSON.stringify(P.parseLanes('left|through|through;right')) === '[["L"],["S"],["S","R"]]', 'parseLanes');
ok(P.parseLanes('through') === null && P.parseLanes(null) === null, 'zu wenige Spuren');
ok(JSON.stringify(P.validLanes(P.parseLanes('left|through|through;right'), 'right')) === '[false,false,true]', 'rechts → rechte Spur');
ok(JSON.stringify(P.validLanes(P.parseLanes('left|through|through;right'), 'straight')) === '[false,true,true]', 'geradeaus');
ok(P.validLanes(P.parseLanes('through|through'), 'straight') === null, 'alle gültig → keine Aussage');
ok(P.validLanes(P.parseLanes('left|right'), 'roundabout') === null, 'Kreisverkehr ohne Spuren');
const way = (tags, g) => ({ tags, geometry: g.map(([lat, lon]) => ({ lat, lon })) });
const w1 = way({ highway: 'primary', 'turn:lanes:forward': 'left|through|right', 'turn:lanes:backward': 'through|through' }, [[51.5, 7.1], [51.5, 7.101]]); // Richtung Osten
const q = { lat: 51.5, lon: 7.1005 };
ok(P.lanesFromWays([w1], q, 90).length === 3, 'forward bei Fahrt nach Osten');
ok(P.lanesFromWays([w1], q, 270) === null || P.lanesFromWays([w1], q, 270).length === 2 && P.lanesFromWays([w1], q, 270).flat().every((x) => x === 'S'), 'backward bei Fahrt nach Westen');
ok(P.lanesFromWays([w1], { lat: 51.51, lon: 7.1 }, 90) === null, 'zu weit weg');
const w2 = way({ highway: 'primary', oneway: 'yes', 'turn:lanes': 'left|right' }, [[51.5, 7.1], [51.5, 7.101]]); ok(P.lanesFromWays([w2], q, 90).length === 2, 'Einbahn turn:lanes');

// Wetter und Höhe
ok(P.wxWarn(0, 0.5, 61, 10).includes('Glättegefahr'), 'Glätte'); ok(P.wxWarn(15, 3, 63, 10).includes('starker Regen'), 'starker Regen'); ok(P.wxWarn(15, 0, 1, 80).includes('Sturmböen'), 'Sturm'); ok(P.wxWarn(15, 0, 1, 10).length === 0, 'ruhig'); ok(P.wxWarn(20, 0, 96, 10).includes('Gewitter'), 'Gewitter');
ok(P.WX(0) === 'klar' && P.WX(63) === 'Regen' && P.WX(95) === 'Gewitter', 'Wettertext');
const es = P.elevStats([100, 100, 110, 130, 120, 100, 100, 101], 250); ok(es.up === 30 && es.down === 30 && es.max === 130 && es.min === 100, 'Auf/Ab: ' + JSON.stringify(es)); ok(es.gmax > 5, 'max Steigung ' + es.gmax);
const w3 = way({ highway: 'primary', 'turn:lanes:forward': 'left|through|right' }, [[51.5, 7.1], [51.5, 7.103]]); // 300 m lange Strecke, Q mitten drauf
ok(P.lanesFromWays([w3], { lat: 51.5, lon: 7.1015 }, 90).length === 3, 'Abstand zur Strecke statt zur Mitte');
console.log(n + ' Prüfungen bestanden');
