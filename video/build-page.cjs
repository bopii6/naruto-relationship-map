/*
 * 把 data.json 内联进 story.template.html，生成可直接给无头 Chrome 打开的 story.html。
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const data = fs.readFileSync(path.join(dir, 'data.json'), 'utf8');
const tpl = fs.readFileSync(path.join(dir, 'story.template.html'), 'utf8');
const out = tpl.replace('/*__DATA__*/', 'const DATA = ' + data + ';');
if (out === tpl) throw new Error('placeholder not found');
fs.writeFileSync(path.join(dir, 'story.html'), out);
console.log('wrote story.html', (Buffer.byteLength(out) / 1024).toFixed(0), 'KB');
