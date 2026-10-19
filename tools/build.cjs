/*
 * 构建脚本：src/template.html + data/*.cjs + assets/avatars.json → index.html
 *
 * 改数据：直接编辑 data/ 下的文件（或 assets/avatars.json），然后跑本脚本。
 * 改界面/逻辑：编辑 src/template.html，然后跑本脚本。
 * index.html 是产物，不要直接改它。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const TPL = path.join(ROOT, 'src', 'template.html');
const OUT = path.join(ROOT, 'index.html');

const BLOCKS = [
  { name: 'QUOTES',  file: path.join(ROOT, 'data', 'quotes.cjs') },
  { name: 'NODES',   file: path.join(ROOT, 'data', 'nodes.cjs') },
  { name: 'EPITHET', file: path.join(ROOT, 'data', 'epithet.cjs') },
  { name: 'EVENTS',  file: path.join(ROOT, 'data', 'events.cjs') },
  { name: 'LINKS',   file: path.join(ROOT, 'data', 'links.cjs') },
  { name: 'JUTSU',   file: path.join(ROOT, 'data', 'jutsu.cjs') },
];

let html = fs.readFileSync(TPL, 'utf8');

/* 头像：assets/avatars.json 原样注入 */
const avatars = fs.readFileSync(path.join(ROOT, 'assets', 'avatars.json'), 'utf8').trim();
JSON.parse(avatars); // 语法自检
html = html.replace('/*__DATA:AVATARS__*/', 'const AVATARS = ' + avatars + ';');

/* 其余数据块：data/*.cjs 的 module.exports 字面量原样注入 */
for (const b of BLOCKS) {
  const text = fs.readFileSync(b.file, 'utf8');
  const m = text.match(/module\.exports = ([\s\S]*);\s*$/);
  if (!m) throw new Error(b.file + ': 没找到 module.exports = ...;');
  require(b.file); // 语法自检：能被 require 就能被注入
  html = html.replace('/*__DATA:' + b.name + '__*/', 'const ' + b.name + ' = ' + m[1] + ';');
}

const left = html.match(/__DATA:\w+__/);
if (left) throw new Error('模板里还有未替换的标记: ' + left[0]);

fs.writeFileSync(OUT, html);
console.log('built index.html (' + (html.length / 1024).toFixed(0) + ' KB)');
