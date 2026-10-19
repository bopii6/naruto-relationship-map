/*
 * 生成 docs/ 里的「名场面」截图。
 *   node tools/evshot.cjs
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
  if (opts.evtPick) s = s.replace('let evtPick = null, hoverEvt = null;', "let evtPick = '" + opts.evtPick + "', hoverEvt = null;");
  if (opts.labelsOff) s = s.replace('let labelsOn = true;', 'let labelsOn = false;');
  let inj = '';
  if (opts.clickEvents) inj += 'setTimeout(function(){ document.getElementById("btnEvents").click(); }, 300);';
  if (opts.scrollDetail) inj += 'setTimeout(function(){ var d=document.getElementById("detail"); d.scrollTop=d.scrollHeight; }, 800);';
  if (inj) s = s.replace('</body>', '<script>' + inj + '<\/script></body>');
  const file = path.join(BUILD, 'ev_' + tag + '.html');
  fs.writeFileSync(file, s);
  return fileUrl(file);
}

const jobs = [
  ['strip',    build('strip', 'focus', 'naruto', {})],
  ['strip2',   build('strip2', 'focus', 'sakura', {})],
  ['card',     build('card', 'focus', 'naruto', { evtPick: 'painAttack' })],
  ['panel',    build('panel', 'focus', 'neji', { scrollDetail: true })],
  ['timeline', build('timeline', 'zone', null, { clickEvents: true })]
];

const ud = path.join(BUILD, 'cprof-ev');
for (const [name, url] of jobs) {
  const out = path.join(OUT, 'ev_' + name + '.png');
  try { fs.unlinkSync(out); } catch (e) {}
  cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + ud, '--virtual-time-budget=7000', '--screenshot=' + out,
    '--window-size=1720,1020', url], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 30 });
  console.log(name + ' -> ' + (fs.existsSync(out) ? fs.statSync(out).size + ' bytes' : 'MISSING'));
}
