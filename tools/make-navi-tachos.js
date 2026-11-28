// Erzeugt die vier festen Tacho-Designs mit Navi in www/vorlagen/. Aufruf: node tools/make-navi-tachos.js
// Rund, Eckig, Digital und Balken (ohne runde Instrumente). Alle haben Antippen-Kacheln (cyc) und das Navi-Element.
const fs = require('fs'), path = require('path');
const D = require('../www/design.js');
let n = 0;
const el = (t, o) => Object.assign({ id: 'e' + (n++), t, x: 0, y: 0, rot: 0, op: 1, show: 'always' }, JSON.parse(JSON.stringify(D.DEFAULTS[t])), o);
const out = (d) => {
  const v = D.validate(d, []);
  fs.writeFileSync(path.join(__dirname, '..', 'www', 'vorlagen', v.name.replace(/\s+/g, '-') + '.tacho.json'), JSON.stringify(v));
  console.log('geschrieben:', v.name, v.els.length, 'Elemente');
};
const C = (s, l, u) => ({ s, l, u: u || '' });
// Wertegruppen, die man per Antippen durchschaltet
const G = {
  hoehe: [C('alt', 'Höhe', ' m'), C('altnn', 'Höhe NN', ' m'), C('grade', 'Steigung', ' %')],
  km: [C('day', 'Tages-km', ' km'), C('trip', 'Trip-km', ' km'), C('total', 'Gesamt-km', ' km')],
  zeit: [C('clock', 'Uhrzeit'), C('time', 'Fahrzeit'), C('date', 'Datum')],
  wetter: [C('temp', 'Temperatur', ' °'), C('wind', 'Wind'), C('wx', 'Wetter')],
  rest: [C('navremain', 'Reststrecke'), C('naveta', 'Ankunft'), C('navdur', 'Restzeit')],
  tempo: [C('speed', 'Tempo'), C('max', 'Höchsttempo'), C('avg', 'Durchschnitt'), C('limit', 'Tempolimit')]
};
let tid = 0;
// Kachel: Rahmen + Titel + Wert (tippbar) + Beschriftung, die mit dem Wert wechselt
function tile(d, o) {
  const id = 't' + (tid++), g = G[o.g], first = g[0];
  if (o.box !== false) d.els.push(el('rect', { x: o.x, y: o.y, w: o.w, h: o.h, color: o.fill, radius: o.radius, border: o.border || 0.3, borderColor: o.line }));
  d.els.push(el('value', { id, x: o.x + 0.5, y: o.y + o.h * 0.14, w: o.w - 1, h: o.h * 0.56, src: first.s, unit: first.u, dec: first.s === 'grade' || first.s === 'alt' ? 0 : undefined, size: o.vs, color: o.color, font: o.font || 'condensed', weight: 800, align: o.align || 'c', cyc: g }));
  d.els.push(el('text', { x: o.x + 0.5, y: o.y + o.h * 0.74, w: o.w - 1, h: o.h * 0.2, text: first.l, size: o.ls || 2.6, color: o.lc || o.color, weight: 700, align: o.align || 'c', lab: id }));
}
const navi = (o) => el('navi', Object.assign({ lay: 'hoch', size: 10, color: '#ffd23f', style: 'klassisch', box: false }, o));

// 1) Rund: Nadel-Tacho in der Mitte, Navi links, vier Kacheln rechts untereinander
(() => {
  const d = D.blank('Tacho Rund Navi'); d.aspect = 2.1; d.bg.color = '#05080e';
  d.bg.grad = 'radial-gradient(circle at 50% 50%,#12203a 0%,#08101e 60%,#04070c 100%)';
  const gh = 90, gw = gh / d.aspect, gx = 50 - gw / 2 - 2, gy = 5;
  d.els.push(
    el('rect', { x: 1.5, y: 4, w: 27, h: 92, color: '#0c1626', radius: 8, border: 0.35, borderColor: '#27406a' }),
    el('text', { x: 3, y: 5.5, w: 12, h: 5, text: 'NAVI', size: 3, color: '#6cb6ff', weight: 800, align: 'l' }),
    navi({ x: 2, y: 11, w: 26, h: 50, size: 10, lay: 'hoch' }),
    el('value', { id: 'rn', x: 2.5, y: 64, w: 25, h: 20, src: 'navremain', size: 7, color: '#ffd23f', font: 'condensed', weight: 800, cyc: G.rest }),
    el('text', { x: 2.5, y: 85, w: 25, h: 8, text: 'Reststrecke', size: 2.8, color: '#ffd23f', weight: 700, lab: 'rn' }),
    el('rect', { x: gx - 1, y: gy - 1, w: gw + 2, h: gh + 2, color: '#0a121f', radius: 50, border: 0.6, borderColor: '#27406a' }),
    el('arc', { keep: true, x: gx, y: gy, w: gw, h: gh, src: 'kmh', min: 0, max: 240, a0: -135, a1: 135, thick: 5, color: '#3ddc97', grad: '#38bdf8,#3cff9a,#ffd23c,#ef4444', bg: '#141c2b' }),
    el('dial', { keep: true, x: gx + 2.2, y: gy + 4.4, w: gw - 4.4, h: gh - 8.8, min: 0, max: 240, step: 40, minor: 3, a0: -135, a1: 135, color: '#cfd8e6', size: 2.9, red: 200 }),
    el('needle', { keep: true, x: gx, y: gy, w: gw, h: gh, src: 'kmh', min: 0, max: 240, a0: -135, a1: 135, len: 80, width: 1.3, color: '#ff4030', hub: true }),
    el('value', { x: gx + gw * 0.25, y: gy + gh * 0.55, w: gw * 0.5, h: 14, src: 'speed', size: 11, weight: 900, font: 'condensed', stc: true }),
    el('text', { x: gx + gw * 0.3, y: gy + gh * 0.69, w: gw * 0.4, h: 4, text: 'km/h', size: 2.6, color: '#8fa4be', weight: 700 }),
    el('sign', { x: 50 - 2 - 3.2, y: gy + gh * 0.78, w: 6.4, h: 13 }),
    el('road', { x: gx + gw * 0.12, y: gy + gh * 0.92, w: gw * 0.76, h: 5, size: 2.6, color: '#e8eef6', align: 'c' })
  );
  const tx = 74.5, tw = 24, th = 21.875;
  ['hoehe', 'km', 'zeit', 'wetter'].forEach((g, i) => tile(d, { g, x: tx, y: 4 + i * (th + 1.5), w: tw, h: th, fill: '#0c1626', line: '#27406a', radius: 8, color: '#ffd23f', vs: 8.5 }));
  out(d);
})();

// 2) Eckig: Navi als Band oben, großes Tempo links, vier eckige Kacheln rechts
(() => {
  const d = D.blank('Tacho Eckig Navi'); d.aspect = 2.1; d.bg.color = '#07090d';
  d.els.push(
    el('rect', { x: 1.2, y: 3, w: 97.6, h: 30, color: '#0e1a2c', radius: 0.6, border: 0.5, borderColor: '#2f8bff' }),
    navi({ x: 2, y: 4.5, w: 60, h: 27, size: 9, lay: 'quer', color: '#ffffff' }),
    el('value', { id: 'er', x: 63, y: 7, w: 35, h: 16, src: 'navremain', size: 8, color: '#ffd23f', font: 'condensed', weight: 800, cyc: G.rest }),
    el('text', { x: 63, y: 24, w: 35, h: 6, text: 'Reststrecke', size: 2.8, color: '#ffd23f', weight: 700, lab: 'er' }),
    el('rect', { x: 1.2, y: 35, w: 53, h: 62, color: '#0b1220', radius: 0.6, border: 0.5, borderColor: '#3ddc97' }),
    el('text', { x: 2.5, y: 36.5, w: 20, h: 5, text: 'TEMPO', size: 2.8, color: '#8fa4be', weight: 800, align: 'l' }),
    el('value', { id: 'ev', x: 2.5, y: 40, w: 50, h: 36, src: 'speed', size: 33, color: '#ffffff', font: 'condensed', weight: 900, stc: true, cyc: G.tempo }),
    el('text', { x: 2.5, y: 77, w: 50, h: 5, text: 'km/h', size: 2.8, color: '#8fa4be', weight: 700, lab: 'ev' }),
    el('bar', { x: 3, y: 84, w: 50, h: 5, src: 'speed', min: 0, max: 240, color: '#3ddc97', grad: '#3ddc97,#ffd23f,#ff9f1a,#ff3b30', bg: '#17233a', radius: 0, segs: 24, stc: false, limitMark: true }),
    el('sign', { x: 3, y: 90, w: 4.4, h: 7 }),
    el('road', { x: 8.5, y: 90, w: 44, h: 7, size: 3, color: '#e8eef6', align: 'l' })
  );
  const pos = [[56, 35], [78, 35], [56, 66], [78, 66]], gs = ['hoehe', 'km', 'zeit', 'wetter'], cl = ['#ffd23f', '#3ddc97', '#ffffff', '#ff9f1a'];
  pos.forEach(([x, y], i) => tile(d, { g: gs[i], x, y, w: 21.4, h: 31, fill: '#0b1220', line: cl[i], radius: 0.6, border: 0.5, color: cl[i], vs: 7.5 }));
  out(d);
})();

// 3) Digital: schwarz mit Leuchtziffern, Segment-Balken, Navi rechts
(() => {
  const d = D.blank('Tacho Digital Navi'); d.aspect = 2.1; d.bg.color = '#000000';
  const am = '#ffb000', gr = '#3cff7a';
  d.els.push(
    el('text', { x: 2, y: 3, w: 20, h: 5, text: 'KM/H', size: 3, color: am, weight: 800, align: 'l' }),
    el('value', { id: 'dv', x: 1, y: 6, w: 58, h: 46, src: 'speed', size: 42, color: am, font: 'digital', weight: 700, pad: 3, stc: false, cyc: G.tempo }),
    el('bar', { x: 2, y: 55, w: 56, h: 7, src: 'speed', min: 0, max: 240, color: gr, grad: '#3cff7a,#ffb000,#ff2b1c', bg: '#101410', radius: 0, segs: 40, stc: false, limitMark: true }),
    el('sign', { x: 2, y: 65, w: 6, h: 14 }),
    el('road', { x: 9.5, y: 65, w: 49, h: 7, size: 3.4, color: am, font: 'digital', align: 'l' }),
    el('next', { x: 9.5, y: 72, w: 30, h: 8, size: 2.8 }),
    el('rect', { x: 61, y: 3, w: 38, h: 58, color: '#050805', radius: 0.5, border: 0.4, borderColor: gr }),
    navi({ x: 62, y: 5, w: 36, h: 54, size: 9, lay: 'hoch', color: gr }),
    el('value', { id: 'dr', x: 61, y: 63, w: 38, h: 15, src: 'navremain', size: 8, color: gr, font: 'digital', weight: 700, cyc: G.rest }),
    el('text', { x: 61, y: 78, w: 38, h: 5, text: 'Reststrecke', size: 2.6, color: gr, weight: 700, lab: 'dr' })
  );
  ['hoehe', 'km', 'zeit'].forEach((g, i) => tile(d, { g, x: 1 + i * 33.4, y: 82, w: 32, h: 17, box: false, color: am, lc: '#c88400', vs: 8, ls: 2.4, font: 'digital' }));
  out(d);
})();

// 4) Balken: ohne runde Instrumente, mehrere gerade Balken (Tempo, Gas-Gefühl über Beschleunigung, Steigung)
(() => {
  const d = D.blank('Tacho Balken Navi'); d.aspect = 2.1; d.bg.color = '#06080d';
  d.bg.grad = 'linear-gradient(180deg,#0d1424 0%,#06080d 70%)';
  d.els.push(
    el('bar', { x: 2, y: 3, w: 96, h: 8, src: 'speed', min: 0, max: 240, color: '#3ddc97', grad: '#22d3ee,#3ddc97,#ffd23f,#ff9f1a,#ff3b30', bg: '#142033', radius: 50, segs: 48, stc: false, limitMark: true }),
    el('value', { id: 'bv', x: 2, y: 13, w: 40, h: 40, src: 'speed', size: 36, color: '#ffffff', font: 'condensed', weight: 900, stc: true, cyc: G.tempo }),
    el('text', { x: 2, y: 49, w: 40, h: 5, text: 'Tempo', size: 2.8, color: '#8fa4be', weight: 700, lab: 'bv' }),
    el('sign', { x: 4, y: 60, w: 6.5, h: 15 }),
    el('road', { x: 12, y: 60, w: 30, h: 8, size: 3.2, color: '#e8eef6', align: 'l' }),
    el('next', { x: 12, y: 68, w: 30, h: 8, size: 2.8 }),
    el('rect', { x: 44, y: 13, w: 54, h: 45, color: '#0e1a2c', radius: 3, border: 0.4, borderColor: '#2f8bff' }),
    navi({ x: 45, y: 14, w: 52, h: 43, size: 7, lay: 'quer', color: '#ffffff' }),
    el('bar', { x: 2, y: 76, w: 44, h: 4, src: 'g', min: 0, max: 1.5, color: '#ef4444', grad: '#38bdf8,#3cff9a,#ffd23c,#ef4444', bg: '#142033', radius: 50, segs: 0, stc: false, limitMark: false }),
    el('text', { x: 2, y: 81, w: 44, h: 5, text: 'G-Kraft', size: 2.4, color: '#8fa4be', weight: 700, align: 'l' }),
    el('bar', { x: 2, y: 87, w: 44, h: 4, src: 'grade', min: -15, max: 15, color: '#ffd23f', bg: '#142033', radius: 50, segs: 0, stc: false, limitMark: false }),
    el('text', { x: 2, y: 92, w: 44, h: 5, text: 'Steigung', size: 2.2, color: '#8fa4be', weight: 700, align: 'l' })
  );
  ['hoehe', 'km', 'zeit'].forEach((g, i) => tile(d, { g, x: 48 + i * 17.7, y: 62, w: 16.8, h: 34, fill: '#0c1626', line: '#2b4a70', radius: 3, color: ['#ffd23f', '#3ddc97', '#ffffff'][i], vs: 8.2, ls: 2.4 }));
  out(d);
})();
