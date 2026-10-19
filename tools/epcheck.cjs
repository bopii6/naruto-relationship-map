const fs = require('fs');
const path = require('path');
const { SRC, BUILD, ensure } = require('./_paths.cjs');
const file = SRC;
const src = fs.readFileSync(file, 'utf8');

ensure();
const tmp = BUILD;

/* 抽出最大的 <script> 块做语法检查 */
const blocks = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = blocks.sort((a, b) => b.length - a.length)[0];
fs.writeFileSync(path.join(tmp, '_chk.js'), main, 'utf8');
console.log('script blocks=' + blocks.length + '  main=' + main.length + ' bytes');

/* 校验四字评 */
const ep = {};
const epBlock = main.match(/const EPITHET\s*=\s*\{([\s\S]*?)\n\};/);
if (!epBlock) { console.log('!! EPITHET block not found'); process.exit(1); }
for (const m of epBlock[1].matchAll(/(\w+)\s*:\s*'([^']*)'/g)) ep[m[1]] = m[2];

const ids = [...main.matchAll(/\{\s*id:'([a-z]+)',\s*name:'[^']*',\s*short:'/g)].map(m => m[1]);
const uniqIds = [...new Set(ids)];

let bad = 0, dup = 0;
const seen = new Map();
for (const id of uniqIds) {
  const v = ep[id];
  if (!v) { console.log('missing epithet: ' + id); bad++; continue; }
  if ([...v].length !== 4) { console.log('not 4 chars: ' + id + ' = ' + v + ' (' + [...v].length + ')'); bad++; }
  if (seen.has(v)) { console.log('duplicate: ' + v + ' -> ' + seen.get(v) + ' & ' + id); dup++; }
  seen.set(v, id);
}
const extra = Object.keys(ep).filter(k => !uniqIds.includes(k));
console.log('nodes=' + uniqIds.length + '  epithets=' + Object.keys(ep).length +
  '  bad=' + bad + '  dup=' + dup + '  extraKeys=' + extra.length + (extra.length ? ' [' + extra.join(',') + ']' : ''));

/* 检查注入点是否都在 */
const marks = ['p.ep ?', 'class="d-ep"', 'class="t-ep"', 'who-txt', "EPITHET[n.id]"];
for (const m of marks) console.log((main.includes(m) ? 'ok   ' : 'MISS ') + m);

console.log(bad === 0 && dup === 0 && extra.length === 0 ? '=== EPITHET CHECKS PASSED ===' : '=== EPITHET CHECKS FAILED ===');
