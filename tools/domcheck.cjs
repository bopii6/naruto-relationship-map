/*
 * 用 Chrome --dump-dom 抽查「真实渲染后的 DOM」：
 *   node tools/domcheck.cjs
 * 主要验证：聚焦某个人时，右侧详情面板里确实渲染出了「经历过的名场面」清单，
 * 且条目数与该人物真正参与的名场面数一致。
 * 注意：dump 出来的文本里也包含 <script> 源码，所以计数要减去源码里的那一份。
 */
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const { SRC, BUILD, CHROME, ensure, fileUrl } = require('./_paths.cjs');

ensure();
const html = fs.readFileSync(SRC, 'utf8');

// 造一个「聚焦鸣人」的副本（首屏即目标视图，避免补间中间帧）
let s = html
  .replace("let mode = 'zone';", "let mode = 'focus';")
  .replace("let focusId = null;", "let focusId = 'naruto';");
const file = path.join(BUILD, 'dom_strip.html');
fs.writeFileSync(file, s);

const dom = cp.execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
  '--user-data-dir=' + path.join(BUILD, 'cprof-dom'), '--virtual-time-budget=6000', '--dump-dom',
  fileUrl(file)], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
fs.writeFileSync(path.join(BUILD, 'dom.html'), dom);

const count = re => (dom.match(re) || []).length;

const m = dom.match(/<aside class="hud hud-right" id="detail">([\s\S]*?)<\/aside>/);
if (!m) {
  console.log('!! detail panel not found');
  console.log('=== DOM CHECK FAILED ===');
  process.exit(1);
}
const panel = m[1];

const sectionTitle = (panel.match(/经历过的名场面 · (\d+)/) || [])[1];
const rows = (panel.match(/data-ev="([A-Za-z0-9]+)"/g) || []).length;

console.log('dom bytes      = ' + dom.length);
console.log('panel bytes    = ' + panel.length);
console.log('名场面清单标题  = 经历过的名场面 · ' + sectionTitle);
console.log('清单条目数      = ' + rows);
console.log('d-evlist(面板)  = ' + (panel.match(/class="d-evlist"/g) || []).length);

const ok = Number(sectionTitle) === 11 && rows === 11;
console.log(ok ? '=== DOM CHECK PASSED ===' : '=== DOM CHECK FAILED ===');
process.exit(ok ? 0 : 1);
