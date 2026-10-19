/*
 * 生成 docs/ 里的「忍术 · 排行」截图。
 *   node tools/jushot.cjs
 * 中间 HTML 副本写在 %TEMP%/narutomap-build，截图写到 docs/。
 */
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const { SRC, OUT, BUILD, CHROME, ensure, fileUrl } = require('./_paths.cjs');

ensure();
const html = fs.readFileSync(SRC, 'utf8');

function build(tag, mode, focusId, opts) {
  opts = opts || {};
  let s = html;
  s = s.replace("let mode = 'zone';", "let mode = '" + mode + "';");
  s = s.replace("let focusId = null;", "let focusId = " + (focusId ? "'" + focusId + "'" : 'null') + ";");
  let inj = '';
  if (opts.clickJutsu) inj += 'setTimeout(function(){ document.getElementById("btnJutsu").click(); }, 300);';
  if (opts.jtype) inj += 'setTimeout(function(){ document.querySelector(\'[data-jtype="' + opts.jtype + '"]\').click(); }, 600);';
  if (opts.search) inj += 'setTimeout(function(){ var i=document.getElementById("juInput"); i.value="' + opts.search + '"; i.dispatchEvent(new Event("input")); }, 600);';
  if (opts.scrollDetail) inj += 'setTimeout(function(){ var d=document.getElementById("detail"); d.scrollTop=d.scrollHeight; }, 800);';
  if (inj) s = s.replace('</body>', '<script>' + inj + '<\/script></body>');
  const file = path.join(BUILD, 'ju_' + tag + '.html');
  fs.writeFileSync(file, s);
  return fileUrl(file);
}

const jobs = [
  ['panel',   build('panel', 'zone', null, { clickJutsu: true })],
  ['dojutsu', build('dojutsu', 'zone', null, { clickJutsu: true, jtype: 'dojutsu' })],
  ['search',  build('search', 'zone', null, { clickJutsu: true, search: '宇智波' })],
  ['detail',  build('detail', 'focus', 'itachi', { scrollDetail: true })]
];

const ud = path.join(BUILD, 'cprof-ju');
for (const [name, url] of jobs) {
  const out = path.join(OUT, 'ju_' + name + '.png');
  try { fs.unlinkSync(out); } catch (e) {}
  cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + ud, '--virtual-time-budget=7000', '--screenshot=' + out,
    '--window-size=1720,1020', url], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 30 });
  console.log(name + ' -> ' + (fs.existsSync(out) ? fs.statSync(out).size + ' bytes' : 'MISSING'));
}
