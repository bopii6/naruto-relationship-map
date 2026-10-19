const fs = require('fs');
const { SRC } = require('./_paths.cjs');

const htmlPath = SRC;
const html = fs.readFileSync(htmlPath, 'utf8');
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const tail = '})();';
const idx = script.lastIndexOf(tail);
script = script.slice(0, idx) +
  '\nglobalThis.__T = { nodes, links, EVENTS, evById, EVSHORT, ERAS, placeAll, layoutFocus, layoutZone, layoutGen, setMode, byId, get deco(){return deco;}, get mode(){return mode;}, get evLayer(){return evLayer;}, set evLayer(v){evLayer=v;}, render, fitView, view, get evtPick(){return evtPick;}, selectEvent, FACTIONS, W:function(){return W;}, H:function(){return H;} };\n' +
  script.slice(idx);

function makeEl(id) {
  return {
    id, style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 100, height: 40, top: 0, left: 0 }; },
    focus() {}, blur() {}, scrollIntoView() {}, closest() { return null; },
    setPointerCapture() {}, releasePointerCapture() {},
    width: 0, height: 0, getContext() { return ctxStub; }
  };
}
const noop = () => {};
const ctxStub = new Proxy({}, {
  get(_t, k) {
    if (k === 'measureText') return () => ({ width: 12 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop: noop });
    if (typeof k === 'symbol') return undefined;
    return noop;
  },
  set() { return true; }
});
const els = {};
const ids = ['stage', 'tabs', 'navToggle', 'search', 'suggest', 'factionList', 'typeList',
  'btnFit', 'btnBig', 'btnLabels', 'btnEvLayer', 'btnEvents', 'leftPanel', 'detail', 'hintBar', 'tip',
  'quoteOverlay', 'qovBody', 'qovInput', 'qovThemes', 'qovCount', 'qovClose', 'qovRand',
  'eventOverlay', 'evBody', 'evInput', 'evCount', 'evClose',
  'btnQuotes', 'lensTabs', 'driveSection', 'driveList'];
ids.forEach(i => els[i] = makeEl(i));
globalThis.document = {
  getElementById: id => els[id] || makeEl(id),
  createElement: () => makeEl('new'),
  querySelectorAll: () => [], addEventListener: noop, activeElement: null
};
globalThis.window = { innerWidth: 1600, innerHeight: 900, devicePixelRatio: 2, addEventListener: noop };
globalThis.Image = class {
  constructor() { this.naturalWidth = 160; this.naturalHeight = 160; this.complete = true; }
  set src(v) { this._src = v; if (this.onload) setTimeout(() => this.onload(), 0); }
  get src() { return this._src; }
};
globalThis.requestAnimationFrame = () => 1;

let failed = false;
try { new Function(script)(); }
catch (e) { failed = true; console.log('RUNTIME ERROR during init:', e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); }

if (!failed) {
  const T = globalThis.__T;
  console.log('init OK   events=' + T.EVENTS.length);

  // ---- 1. data integrity ----
  let bad = 0, unknown = [], noField = [], dup = 0;
  const seen = new Set();
  const nodeIds = new Set(T.nodes.map(n => n.id));
  for (const e of T.EVENTS) {
    if (!e.id || !e.name || !e.what || !e.changed || !e.era || !e.vol || !e.s) { noField.push(e.id); bad++; }
    if (seen.has(e.id)) { dup++; bad++; }
    seen.add(e.id);
    for (const w of e.who) if (!nodeIds.has(w)) { unknown.push(e.id + '->' + w); bad++; }
    if (e.people.length !== e.who.length) { bad++; console.log('  people mismatch:', e.id); }
    if (T.ERAS.indexOf(e.era) < 0) { bad++; console.log('  bad era:', e.id, e.era); }
    if (!(e.no >= 1)) { bad++; console.log('  bad no:', e.id); }
  }
  console.log('events=' + T.EVENTS.length, 'bad=' + bad, 'dup=' + dup,
    'unknownWho=' + unknown.length, 'missingFields=' + noField.length);
  if (unknown.length) console.log('  unknown:', unknown.join(', '));
  if (noField.length) console.log('  missing:', noField.join(', '));
  if (bad) failed = true;

  // ---- 2. every event has at least 2 participants; no event with a single person ----
  const thin = T.EVENTS.filter(e => e.who.length < 2);
  console.log('eventsWith<2People=' + thin.length + (thin.length ? '  ' + thin.map(e => e.id).join(',') : ''));
  if (thin.length) failed = true;

  // ---- 3. short labels are unique-ish and not too long ----
  const longS = T.EVENTS.filter(e => [...e.s].length > 4);
  const dupS = {};
  T.EVENTS.forEach(e => dupS[e.s] = (dupS[e.s] || 0) + 1);
  const dupShort = Object.keys(dupS).filter(k => dupS[k] > 1);
  console.log('shortLabels>4chars=' + longS.length, ' duplicateShort=' + dupShort.length + (dupShort.length ? '  ' + dupShort.join(',') : ''));
  if (longS.length) console.log('  long:', longS.map(e => e.id + ':' + e.s).join(', '));
  if (longS.length || dupShort.length) failed = true;

  // ---- 4. era coverage: every era non-empty ----
  const emptyEra = T.ERAS.filter(er => !T.EVENTS.some(e => e.era === er));
  console.log('emptyEras=' + emptyEra.length + (emptyEra.length ? '  ' + emptyEra.join(',') : ''));

  // ---- 5. participant coverage: every node appears in >= 0 events (report the isolated ones) ----
  const inEv = new Set();
  T.EVENTS.forEach(e => e.who.forEach(w => inEv.add(w)));
  const none = T.nodes.filter(n => !inEv.has(n.id));
  console.log('charactersWithoutEvents=' + none.length + (none.length ? '  ' + none.map(n => n.short).join(',') : ''));

  // ---- 6. focus layout with events: bounds contain the strip; no overlap ----
  const focused = T.nodes.slice().sort((a, b) => b.w - a.w)[0];
  const cand = T.nodes.filter(n => T.EVENTS.filter(e => e.who.indexOf(n.id) >= 0).length >= 5);
  console.log('charactersWith>=5Events=' + cand.length);

  let badFocus = 0;
  for (const c of T.nodes) {
    T.setMode('focus', c.id, true);
    const d = T.deco;
    if (!d.bounds) { badFocus++; continue; }
    const evs = d.events || [];
    for (const e of evs) {
      if (!Number.isFinite(e.ex) || !Number.isFinite(e.ey)) { badFocus++; console.log('  NaN evt pos', c.id, e.id); continue; }
      const m = 26;
      if (e.ex - m < d.bounds.minX || e.ex + m > d.bounds.maxX ||
          e.ey - m < d.bounds.minY || e.ey + m > d.bounds.maxY) { badFocus++; console.log('  strip outside bounds', c.id, e.id); }
    }
    // strip must sit below the ring
    if (evs.length && d.stripY <= d.R) { badFocus++; console.log('  strip above ring', c.id); }
    // neighbours must not collide with the strip
    const vis = T.nodes.filter(n => n.show);
    for (const p of vis) {
      for (const e of evs) {
        const dist = Math.hypot(p.tx - e.ex, p.ty - e.ey);
        if (dist < 58) { badFocus++; console.log('  strip/avatar clash', c.id, p.short, e.id, dist.toFixed(0)); }
      }
    }
  }
  console.log('focusLayoutProblems=' + badFocus);
  if (badFocus) failed = true;

  // ---- 7. evLayer off => no events in focus ----
  T.evLayer = false;
  T.setMode('focus', focused.id, true);
  const offN = (T.deco.events || []).length;
  T.evLayer = true;
  T.setMode('focus', focused.id, true);
  const onN = (T.deco.events || []).length;
  console.log('evLayerOff.events=' + offN, ' evLayerOn.events=' + onN);
  if (offN !== 0 || onN === 0) failed = true;
  T.evLayer = true;

  // ---- 8. zoom impact: focus zoom with / without the strip ----
  T.setMode('focus', focused.id, true);
  T.fitView();
  const kOn = T.view.k;
  T.evLayer = false; T.setMode('focus', focused.id, true); T.fitView();
  const kOff = T.view.k;
  T.evLayer = true;
  const faceOn = focused.r * 2 * kOn;
  console.log('focus(' + focused.short + ') zoom on=' + kOn.toFixed(3) + ' off=' + kOff.toFixed(3) +
    '  faceOn=' + faceOn.toFixed(1) + 'px');
  if (faceOn < 44) { console.log('  ! face too small'); failed = true; }

  // ---- 9. injection points present ----
  const marks = [
    'id="btnEvents"', 'id="btnEvLayer"', 'id="eventOverlay"', 'id="evBody"',
    'function renderEventCard', 'function eventsHtml', 'function selectEvent',
    'function renderEvents', 'function openEvents', 'class="d-evrow"', 'const EVENTS = ['
  ];
  const missing = marks.filter(m => html.indexOf(m) < 0);
  console.log('injectionPoints missing=' + missing.length + (missing.length ? '  ' + missing.join(',') : ''));
  if (missing.length) failed = true;

  // ---- 10. selectEvent / clear ----
  T.selectEvent(T.EVENTS[0].id);
  console.log('selectEvent ->', T.evtPick === T.EVENTS[0].id ? 'ok' : 'FAIL');
  if (T.evtPick !== T.EVENTS[0].id) failed = true;
}

console.log(failed ? '\n=== EVENT CHECKS FAILED ===' : '\n=== EVENT CHECKS PASSED ===');
process.exit(failed ? 1 : 0);
