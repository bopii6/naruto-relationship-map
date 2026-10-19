const fs = require('fs');
const path = require('path');
const { SRC, BUILD, ensure } = require('./_paths.cjs');

const htmlPath = SRC;
const html = fs.readFileSync(htmlPath, 'utf8');
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// expose internals for testing
const tail = '})();';
const idx = script.lastIndexOf(tail);
if (idx < 0) throw new Error('tail not found');
script = script.slice(0, idx) +
  '\nglobalThis.__T = { nodes, links, placeAll, layoutZone, layoutGen, layoutFocus, setMode, byId, factionOn, typeOn, driveOn, DRIVES, DRIVE_ORDER, set emotionLens(v){emotionLens=v;}, get emotionLens(){return emotionLens;}, get deco(){return deco;}, get mode(){return mode;}, render, fitView, view, paintDrives, QUOTES, QTHEMES, ALLQ, renderQuotes, openQuotes, closeQuotes, get qovBody(){return qovBody;}, get qovInput(){return qovInput;} };\n' +
  script.slice(idx);

// ---------- DOM stubs ----------
function makeEl(id) {
  const el = {
    id, style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', value: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { width: 100, height: 40, top: 0, left: 0 }; },
    focus() {}, blur() {}, scrollIntoView() {}, closest() { return null; },
    setPointerCapture() {}, releasePointerCapture() {},
    width: 0, height: 0,
    getContext() { return ctxStub; }
  };
  return el;
}

const noop = () => {};
const ctxStub = new Proxy({}, {
  get(_t, k) {
    if (k === 'measureText') return () => ({ width: 12 });
    if (k === 'createRadialGradient' || k === 'createLinearGradient')
      return () => ({ addColorStop: noop });
    if (typeof k === 'symbol') return undefined;
    return noop;
  },
  set() { return true; }
});

const els = {};
const ids = ['stage', 'tabs', 'navToggle', 'search', 'suggest', 'factionList', 'typeList',
             'btnFit', 'btnBig', 'btnLabels', 'leftPanel', 'detail', 'hintBar', 'tip',
             'quoteOverlay', 'qovBody', 'qovInput', 'qovThemes', 'qovCount', 'qovClose', 'qovRand',
             'btnQuotes', 'lensTabs', 'driveSection', 'driveList'];
ids.forEach(i => els[i] = makeEl(i));

globalThis.document = {
  getElementById: id => els[id] || makeEl(id),
  createElement: () => makeEl('new'),
  querySelectorAll: () => [],
  addEventListener: noop,
  activeElement: null
};
globalThis.window = {
  innerWidth: 1600, innerHeight: 900, devicePixelRatio: 2,
  addEventListener: noop
};
globalThis.Image = class {
  constructor() { this.naturalWidth = 160; this.naturalHeight = 160; this.complete = true; }
  set src(v) { this._src = v; if (this.onload) setTimeout(() => this.onload(), 0); }
  get src() { return this._src; }
};
let rafCb = null;
globalThis.requestAnimationFrame = cb => { rafCb = cb; return 1; };

// ---------- run ----------
let failed = false;
try {
  new Function(script)();
} catch (e) {
  failed = true;
  console.log('RUNTIME ERROR during init:', e.message);
  console.log(e.stack.split('\n').slice(0, 6).join('\n'));
}

if (!failed) {
  const T = globalThis.__T;
  console.log('init OK');
  console.log('nodes:', T.nodes.length, ' links:', T.links.length);

  const withAv = T.nodes.filter(n => n.av).length;
  const imgOK = T.nodes.filter(n => n.imgOK).length;
  console.log('nodes with avatar:', withAv, ' | image loaded:', imgOK);

  // ---- emotion layer ----
  const D = T.DRIVES;
  const counts = {};
  T.DRIVE_ORDER.forEach(k => counts[k] = 0);
  T.nodes.forEach(n => { if (counts[n.drive] != null) counts[n.drive]++; else counts[n.drive] = 'BAD'; });
  const badDrive = T.nodes.filter(n => !D[n.drive]);
  const badHeat = T.nodes.filter(n => !(n.heat >= 0 && n.heat <= 100));
  const noEmo = T.links.filter(l => !l.emo);
  const heats = T.links.map(l => l.heat);
  console.log('drive counts:', JSON.stringify(counts));
  console.log('badDrive=' + badDrive.length, 'badHeat=' + badHeat.length,
              'linksWithoutEmo=' + noEmo.length,
              'emoHeat range=' + Math.min(...heats) + '-' + Math.max(...heats));
  if (noEmo.length) noEmo.forEach(l => console.log('   NO EMO:', l.s, '->', l.t, '(' + l.type + ')'));
  if (badDrive.length || badHeat.length || noEmo.length) failed = true;
  const top3 = T.links.slice().sort((a, b) => b.heat - a.heat).slice(0, 3)
    .map(l => `${l.a.short}×${l.b.short}(${l.heat})`).join('  ');
  console.log('hottest:', top3);

  const modes = ['zone', 'gen'];
  for (const m of modes) {
    T.setMode(m, null, true);
    const vis = T.nodes.filter(n => n.show);
    const bad = vis.filter(n => !Number.isFinite(n.tx) || !Number.isFinite(n.ty));
    // overlap check (worst case radius)
    let overlaps = 0, minGap = Infinity;
    for (let i = 0; i < vis.length; i++)
      for (let j = i + 1; j < vis.length; j++) {
        const d = Math.hypot(vis[i].tx - vis[j].tx, vis[i].ty - vis[j].ty);
        minGap = Math.min(minGap, d);
        if (d < 76) overlaps++;
      }
    const k = T.view.k;
    const onScreen = 76 * k; // node diameter in screen px
    console.log(`${m}: visible=${vis.length} nonfinite=${bad.length} overlaps=${overlaps} minGap=${minGap.toFixed(0)} zoom=${k.toFixed(2)} facePx=${onScreen.toFixed(0)}`);
    if (bad.length) failed = true;
  }

  // focus mode on highest-degree node
  const deg0 = n => n.adj.length;
  const top = T.nodes.slice().sort((a, b) => deg0(b) - deg0(a))[0];
  const targets = [top.id, 'sarada', 'kankuro', 'hiruzen', 'sakura', 'lee'];
  for (const id of targets) {
    T.setMode('focus', id, true);
    const vis = T.nodes.filter(n => n.show);
    const bad = vis.filter(n => !Number.isFinite(n.tx) || !Number.isFinite(n.ty));
    let overlaps = 0, minGap = Infinity;
    for (let i = 0; i < vis.length; i++)
      for (let j = i + 1; j < vis.length; j++) {
        const d = Math.hypot(vis[i].tx - vis[j].tx, vis[i].ty - vis[j].ty);
        minGap = Math.min(minGap, d);
        if (d < vis[i].r + vis[j].r) overlaps++;
      }
    const nm = T.byId.get(id).name;
    console.log(`focus(${nm}): shown=${vis.length} nonfinite=${bad.length} overlaps=${overlaps} minGap=${(minGap === Infinity ? 0 : minGap).toFixed(0)} zoom=${T.view.k.toFixed(2)} facePx=${(76 * T.view.k).toFixed(0)} arcs=${T.deco.arcs ? T.deco.arcs.length : 0}`);
    if (bad.length || overlaps) failed = true;
  }

  // big avatar mode sanity
  T.setMode('zone', null, true);
  for (const m of ['zone', 'gen']) {
    T.setMode(m, null, true);
    const r = 38 * 1.22 * T.view.k;
    console.log(`${m} bigAvatars: radiusPx=${r.toFixed(0)}`);
  }

  // exercise render a few frames
  for (let i = 0; i < 3; i++) {
    for (const n of T.nodes) { n.x = n.tx; n.y = n.ty; }
    try { T.render(); } catch (e) { console.log('render ERROR:', e.message); failed = true; }
  }
  console.log('render OK');

  // ---- emotion lens render ----
  T.emotionLens = true;
  T.DRIVE_ORDER.forEach(k => { T.driveOn[k] = false; });
  T.driveOn.revenge = true;
  let lensErr = null;
  try {
    for (let i = 0; i < 3; i++) {
      T.nodes.forEach(n => { n.x = n.tx; n.y = n.ty; });
      T.render();
    }
    // detail panel for a revenge character
    T.setMode('focus', 'sasuke', true);
    T.nodes.forEach(n => { n.x = n.tx; n.y = n.ty; });
    T.render();
  } catch (e) { lensErr = e; failed = true; }
  console.log('emotion lens (revenge only) render:', lensErr ? 'ERROR ' + lensErr.message : 'OK');
  T.DRIVE_ORDER.forEach(k => { T.driveOn[k] = true; });
  T.emotionLens = false;

  // ---- quotes ----
  const QQ = T.QUOTES, QT = T.QTHEMES;
  const themeIds = QT.map(t => t.id);
  const themeSet = new Set(themeIds);
  let qTotal = 0, qBadTheme = 0, qEmpty = 0, qNoScene = 0, qNoDesc = 0, qDup = 0, qBadChar = 0;
  const seen = new Set(), perChar = {};
  for (const n of T.nodes) {
    const list = QQ[n.id];
    if (!list || !list.length) { qBadChar++; console.log('  NO QUOTES:', n.name); continue; }
    perChar[n.id] = list.length;
    qTotal += list.length;
    for (const q of list) {
      if (!themeSet.has(q.t)) { qBadTheme++; console.log('  BAD THEME:', n.name, q.t); }
      if (!q.q || !q.q.trim()) { qEmpty++; console.log('  EMPTY QUOTE:', n.name); }
      if (!q.s || !q.s.trim()) { qNoScene++; console.log('  NO SCENE:', n.name, q.q); }
      if (!q.d || !q.d.trim()) { qNoDesc++; console.log('  NO DESC:', n.name, q.q); }
      const key = n.id + '|' + q.q;
      if (seen.has(key)) { qDup++; console.log('  DUP:', n.name, q.q); }
      seen.add(key);
    }
  }
  const unknown = Object.keys(QQ).filter(k => !T.byId.has(k));
  const themeCount = {};
  themeIds.forEach(t => themeCount[t] = 0);
  T.nodes.forEach(n => (QQ[n.id] || []).forEach(q => { themeCount[q.t] = (themeCount[q.t] || 0) + 1; }));
  console.log('quotes: total=' + qTotal + ' charCoverage=' + Object.keys(perChar).length + '/' + T.nodes.length +
              ' themes=' + themeIds.length + ' badTheme=' + qBadTheme + ' empty=' + qEmpty +
              ' noScene=' + qNoScene + ' noDesc=' + qNoDesc + ' dup=' + qDup + ' unknownIds=' + unknown.length);
  console.log('theme distribution:', JSON.stringify(themeCount));
  const fewest = Object.entries(perChar).sort((a, b) => a[1] - b[1]).slice(0, 5)
    .map(([k, v]) => T.byId.get(k).short + ':' + v).join('  ');
  console.log('fewest quotes:', fewest);
  if (unknown.length) console.log('  UNKNOWN IDS:', unknown.join(', '));
  if (qBadTheme || qBadChar || qEmpty || qNoScene || qDup || unknown.length) failed = true;

  // ---- quote overlay render ----
  try {
    T.openQuotes();
    const h1 = T.qovBody.innerHTML.length;
    T.qovInput.value = '鸣人';
    T.renderQuotes();
    const h2 = T.qovBody.innerHTML.length;
    T.qovInput.value = 'zzz-无结果';
    T.renderQuotes();
    const h3 = T.qovBody.innerHTML.length;
    T.qovInput.value = '';
    T.qovPick = null; T.renderQuotes();
    const h4 = T.qovBody.innerHTML.length;
    T.closeQuotes();
    console.log('quote overlay render: all=' + h1 + ' filter(鸣人)=' + h2 + ' empty=' + h3 + ' restore=' + h4 +
                ' | ALLQ=' + T.ALLQ.length);
  } catch (e) { console.log('overlay ERROR:', e.message); failed = true; }

  // detail panel with quotes
  try {
    T.setMode('focus', 'itachi', true);
    console.log('detail panel (itachi) quote cards:', T.QUOTES.itachi.length);
  } catch (e) { console.log('detail ERROR:', e.message); failed = true; }
}

console.log(failed ? '=== FAIL ===' : '=== ALL CHECKS PASSED ===');
process.exit(failed ? 1 : 0);
