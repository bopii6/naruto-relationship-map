/*
 * 从 index.html 抽出图谱数据，生成 video/data.json。
 * 数据仍以 index.html 为唯一事实来源，视频页面不另养一份。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'index.html');
const OUT = path.join(__dirname, 'data.json');

const src = fs.readFileSync(SRC, 'utf8');

/* ── 头像：const AVATARS = {...}; ─────────────────────────────────── */
const avStart = src.indexOf('const AVATARS = ');
if (avStart < 0) throw new Error('AVATARS not found');
const avOpen = src.indexOf('{', avStart);
const avEnd = src.indexOf('};\n', avOpen);
if (avEnd < 0) throw new Error('AVATARS end not found');
const AVATARS = JSON.parse(src.slice(avOpen, avEnd + 1));

/* ── 数据块：从 const FACTIONS 到「2. 图模型」之前 ───────────────── */
const start = src.indexOf('const FACTIONS = {');
const marker = '   2. 图模型';
const markerAt = src.indexOf(marker, start);
if (start < 0 || markerAt < 0) throw new Error('data block not found');
const blockEnd = src.lastIndexOf('/*', markerAt);
const block = src.slice(start, blockEnd);

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(
  block +
    `
globalThis.__DATA = {
  FACTIONS, REL, REL_ORDER, DRIVES, DRIVE_ORDER, DRIVE_INFO, EMO,
  QTHEMES, QTHEME, QUOTES, NODES, EPITHET, EVENTS, EVSHORT, LINKS, GENS, CRESTS
};`,
  sandbox,
  { filename: 'index.html#data' }
);

const D = sandbox.__DATA;
const nodes = D.NODES.map(n => ({ ...n, ep: D.EPITHET[n.id] || '' }));
const links = D.LINKS.map(([a, b, type, label], i) => {
  const key = [a, b].sort().join('|');
  const emo = D.EMO[key] || D.EMO[a + '|' + b] || null;
  return { i, a, b, type, label, emo: emo ? emo.emo : '', heat: emo ? emo.heat : 50 };
});

const byType = {};
for (const l of links) byType[l.type] = (byType[l.type] || 0) + 1;
const byFaction = {};
for (const n of nodes) byFaction[n.f] = (byFaction[n.f] || 0) + 1;
const byDrive = {};
for (const n of nodes) {
  const d = (D.DRIVE_INFO[n.id] || {}).d || 'protect';
  byDrive[d] = (byDrive[d] || 0) + 1;
}

const data = {
  meta: {
    title: '火影忍者 · 人物关系图谱',
    generatedAt: new Date().toISOString(),
    counts: {
      nodes: nodes.length,
      links: links.length,
      quotes: Object.values(D.QUOTES).reduce((s, a) => s + a.length, 0),
      events: D.EVENTS.length,
      byType,
      byFaction,
      byDrive
    }
  },
  FACTIONS: D.FACTIONS,
  REL: D.REL,
  REL_ORDER: D.REL_ORDER,
  DRIVES: D.DRIVES,
  DRIVE_ORDER: D.DRIVE_ORDER,
  DRIVE_INFO: D.DRIVE_INFO,
  QTHEMES: D.QTHEMES,
  QUOTES: D.QUOTES,
  NODES: nodes,
  EPITHET: D.EPITHET,
  EVENTS: D.EVENTS,
  EVSHORT: D.EVSHORT,
  LINKS: links,
  GENS: D.GENS,
  CRESTS: D.CRESTS,
  AVATARS
};

fs.writeFileSync(OUT, JSON.stringify(data));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('wrote', OUT, kb + ' KB');
console.log('counts:', JSON.stringify(data.meta.counts));
