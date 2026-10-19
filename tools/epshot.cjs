/*
 * 生成 docs/ 里的「四字评」截图。
 *   node tools/epshot.cjs
 * 中间 HTML 副本写在 %TEMP%/narutomap-build，截图写到 docs/。
 */
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const { SRC, OUT, BUILD, CHROME, ensure, fileUrl } = require('./_paths.cjs');

ensure();
const html = fs.readFileSync(SRC, 'utf8');

function build(tag, mode, focusId, clickQuotes) {
  let s = html;
  s = s.replace("let mode = 'zone';", "let mode = '" + mode + "';");
  s = s.replace("let focusId = null;", "let focusId = " + (focusId ? "'" + focusId + "'" : 'null') + ";");
  if (clickQuotes) {
    s = s.replace('</body>',
      '<script>setTimeout(function(){ document.getElementById("btnQuotes").click(); }, 400);<\/script></body>');
  }
  const file = path.join(BUILD, 'ep_' + tag + '.html');
  fs.writeFileSync(file, s);
  return fileUrl(file);
}

const jobs = [
  ['detail', build('detail', 'focus', 'guy', false)],
  ['quotes', build('quotes', 'zone', null, true)]
];

const ud = path.join(BUILD, 'cprof-ep');
for (const [name, url] of jobs) {
  const out = path.join(OUT, 'ep_' + name + '.png');
  try { fs.unlinkSync(out); } catch (e) {}
  cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + ud, '--virtual-time-budget=6000', '--screenshot=' + out,
    '--window-size=1680,1000', url], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 30 });
  console.log(name + ' -> ' + (fs.existsSync(out) ? fs.statSync(out).size + ' bytes' : 'MISSING'));
}
