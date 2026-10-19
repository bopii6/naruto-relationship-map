/*
 * 一次性脚本：把 index.html 里的数据块抽到 data/*.cjs，
 * 并生成 src/template.html（数据块位置换成 __DATA 标记）。
 * 跑完后 index.html 应由 tools/build.cjs 重新生成，且与抽离前逐字节一致。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'index.html');

const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');

/* 找到从 startIdx 行开始的 const 声明块的结束行（含分号），带字符串/注释感知的括号配平 */
function findBlockEnd(startIdx) {
  let depth = 0, started = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;
    while (j < line.length) {
      const c = line[j];
      if (c === '/' && line[j + 1] === '/') break;
      if (c === '/' && line[j + 1] === '*') { j += 2; while (j < line.length && !(line[j] === '*' && line[j + 1] === '/')) j++; j += 2; continue; }
      if (c === "'" || c === '"') {
        j++;
        while (j < line.length && line[j] !== c) { if (line[j] === '\\') j++; j++; }
        j++; continue;
      }
      if (c === '{' || c === '[') { depth++; started = true; }
      else if (c === '}' || c === ']') { depth--; }
      else if (c === ';' && started && depth === 0) return i;
      j++;
    }
    if (started && depth === 0 && i > startIdx) return i; // 保险：换行后收尾
  }
  throw new Error('block end not found from line ' + (startIdx + 1));
}

const BLOCKS = [
  { name: 'AVATARS', file: null },        // 单独处理：与 assets/avatars.json 比对
  { name: 'QUOTES',  file: 'quotes.cjs' },
  { name: 'NODES',   file: 'nodes.cjs' },
  { name: 'EPITHET', file: 'epithet.cjs' },
  { name: 'EVENTS',  file: 'events.cjs' },
  { name: 'LINKS',   file: 'links.cjs' },
];

const dataDir = path.join(ROOT, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const ranges = [];
for (const b of BLOCKS) {
  const startIdx = lines.findIndex(l => l.startsWith('const ' + b.name + ' ='));
  if (startIdx < 0) throw new Error('not found: ' + b.name);
  const endIdx = findBlockEnd(startIdx);
  console.log(b.name + ': lines ' + (startIdx + 1) + '-' + (endIdx + 1));
  ranges.push({ ...b, startIdx, endIdx });

  if (b.name === 'AVATARS') {
    // 校验内嵌 JSON 与 assets/avatars.json 一致
    const inline = lines[startIdx].replace(/^const AVATARS = /, '').replace(/;\s*$/, '');
    const disk = fs.readFileSync(path.join(ROOT, 'assets', 'avatars.json'), 'utf8').trim();
    const same = JSON.stringify(JSON.parse(inline)) === JSON.stringify(JSON.parse(disk));
    console.log('  avatars.json match: ' + same);
    if (!same) throw new Error('avatars mismatch — abort, keep inline copy instead');
    continue;
  }

  const text = lines.slice(startIdx, endIdx + 1).join('\n');
  const body = text.replace(/^const \w+ = /, '').replace(/;\s*$/, '');
  const header = '/* 数据文件：由 tools/build.cjs 注入回 index.html。直接改这里，然后跑 node tools/build.cjs */\nmodule.exports = ';
  fs.writeFileSync(path.join(dataDir, b.file), header + body + ';\n');
}

/* 生成模板：从后往前替换，避免行号漂移 */
const tpl = lines.slice();
for (const r of ranges.slice().reverse()) {
  const before = r.startIdx > 0 ? tpl[r.startIdx - 1] : '';
  tpl.splice(r.startIdx, r.endIdx - r.startIdx + 1,
    '/*__DATA:' + r.name + '__*/');
}
const srcDir = path.join(ROOT, 'src');
fs.mkdirSync(srcDir, { recursive: true });
fs.writeFileSync(path.join(srcDir, 'template.html'), tpl.join('\n'));
console.log('template written: src/template.html (' + tpl.length + ' lines)');
