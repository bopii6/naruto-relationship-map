/*
 * 忍术排行校验：数据完整性 / 排序 / 覆盖率 / 排行面板渲染。
 *   node tools/jucheck.cjs
 * 打印 === JUTSU CHECKS PASSED === 才算没问题。
 */
const fs = require('fs');
const { SRC } = require('./_paths.cjs');

const html = fs.readFileSync(SRC, 'utf8');
let script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const tail = '})();';
const idx = script.lastIndexOf(tail);
script = script.slice(0, idx) +
  '\nglobalThis.__T = { nodes, byId, JUTSU, JTYPE, JTYPE_ORDER, juTypeOn, renderJutsu, openJutsu, closeJutsu, jutsuHtml, get juBody(){return juBody;}, get juInput(){return juInput;} };\n' +
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
    if (k === 'createRadialGradient' || k === 'createLinearGradient')
      return () => ({ addColorStop: noop });
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
  'jutsuOverlay', 'juBody', 'juInput', 'juCount', 'juChips', 'juClose', 'btnJutsu',
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
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failed = true; };

try { new Function(script)(); }
catch (e) { failed = true; console.log('RUNTIME ERROR during init:', e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); }

if (!failed) {
  const T = globalThis.__T;
  console.log('init OK   jutsu=' + T.JUTSU.length);

  // ---- 1. data integrity ----
  const nodeIds = new Set(T.nodes.map(n => n.id));
  const seen = new Set();
  let bad = 0;
  T.JUTSU.forEach((j, i) => {
    if (!j.id || !j.name || !j.note || !j.type || !(j.power > 0 && j.power <= 10) || !Array.isArray(j.who) || !j.who.length) {
      bad++; console.log('  missing field:', j.id || '#' + i);
    }
    if (seen.has(j.id)) { bad++; console.log('  dup id:', j.id); }
    seen.add(j.id);
    if (!T.JTYPE[j.type]) { bad++; console.log('  bad type:', j.id, j.type); }
    for (const w of j.who) if (!nodeIds.has(w)) { bad++; console.log('  unknown who:', j.id, '->', w); }
    if (j.people.length !== j.who.length) { bad++; console.log('  people mismatch:', j.id); }
    if (j.rank !== i + 1) { bad++; console.log('  bad rank:', j.id, j.rank, 'at', i); }
  });
  ok(bad === 0, 'data integrity (fields/type/who/rank/people)');

  // ---- 2. sorted by power desc ----
  let unsorted = 0;
  for (let i = 1; i < T.JUTSU.length; i++)
    if (T.JUTSU[i].power > T.JUTSU[i - 1].power) { unsorted++; console.log('  out of order:', T.JUTSU[i].id); }
  ok(unsorted === 0, 'sorted by power desc');

  // ---- 3. coverage: everyone but sarada has >= 1 jutsu ----
  const covered = new Set();
  T.JUTSU.forEach(j => j.who.forEach(w => covered.add(w)));
  const none = T.nodes.filter(n => !covered.has(n.id)).map(n => n.id);
  ok(none.length === 1 && none[0] === 'sarada', 'coverage: only sarada has no signature jutsu (got: ' + none.join(',') + ')');

  // ---- 4. render: full list, search, type solo, pick ----
  T.renderJutsu();
  const rows = s => (s.match(/class="ju-row/g) || []).length;
  ok(rows(T.juBody.innerHTML) === T.JUTSU.length, 'renderJutsu shows all ' + T.JUTSU.length + ' rows');

  T.juInput.value = '鸣人';
  T.renderJutsu();
  const expectNaruto = T.JUTSU.filter(j =>
    j.name.includes('鸣人') || j.note.includes('鸣人') ||
    j.people.some(n => n.name.includes('鸣人') || n.short.includes('鸣人') || (n.ep || '').includes('鸣人'))
  ).length;
  ok(rows(T.juBody.innerHTML) === expectNaruto, 'search「鸣人」hits ' + expectNaruto + ' rows (got ' + rows(T.juBody.innerHTML) + ')');
  T.juInput.value = '';

  T.JTYPE_ORDER.forEach(k => { T.juTypeOn[k] = k === 'dojutsu'; });
  T.renderJutsu();
  const expectDo = T.JUTSU.filter(j => j.type === 'dojutsu').length;
  ok(rows(T.juBody.innerHTML) === expectDo, 'type solo「瞳术」hits ' + expectDo + ' rows');
  T.JTYPE_ORDER.forEach(k => { T.juTypeOn[k] = true; });

  T.openJutsu('mugen');
  ok(T.juBody.innerHTML.indexOf('ju-row pick') >= 0 || T.juBody.innerHTML.indexOf('ju-top3 pick') >= 0 || T.juBody.innerHTML.indexOf(' pick') >= 0,
    'openJutsu(pick) highlights the row');
  T.closeJutsu();

  // ---- 5. detail panel section ----
  const h = T.jutsuHtml('naruto');
  ok(h.indexOf('d-jurow') >= 0 && h.indexOf('招牌忍术') >= 0, 'jutsuHtml(naruto) renders rows');
  ok(T.jutsuHtml('sarada') === '', 'jutsuHtml(sarada) is empty');
}

console.log(failed ? '\n=== JUTSU CHECKS FAILED ===' : '\n=== JUTSU CHECKS PASSED ===');
process.exit(failed ? 1 : 0);
