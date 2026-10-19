const fs = require('fs');
const cp = require('child_process');
const { SRC, BUILD, fileUrl, CHROME } = require('../_paths.cjs');
const TMP = BUILD;

const html = fs.readFileSync(SRC, 'utf8');

function build(mode, focusId, lens) {
  let s = html;
  s = s.replace("let mode = 'zone';", "let mode = '" + mode + "';");
  s = s.replace("let focusId = null;", "let focusId = " + (focusId ? "'" + focusId + "'" : 'null') + ";");
  if (lens === 'emotion') {
    s = s.replace('let emotionLens = false;', 'let emotionLens = true;');
    /* mirror what the lens button does, without triggering a layout tween */
    s = s.replace('paintDrives();', 'paintDrives();\n' +
      'try{\n' +
      '  document.body.classList.add("lens-emo");\n' +
      '  document.querySelectorAll("#lensTabs button").forEach(function(x){\n' +
      '    x.setAttribute("aria-selected", String(x.dataset.lens === "emotion")); });\n' +
      '  var ds = document.getElementById("driveSection"); if (ds) ds.style.display = "";\n' +
      '}catch(e){}');
  }
  const file = TMP + '/preset_' + mode + (lens ? '_' + lens : '') + '.html';
  fs.writeFileSync(file, s);
  return fileUrl(file);
}

const jobs = [
  ['gen', build('gen', null, null)],
  ['focus', build('focus', 'naruto', null)],
  ['genemo', build('gen', null, 'emotion')],
  ['zoneemo', build('zone', null, 'emotion')]
];

const ud = TMP + '/cprof-preset';
for (const [name, url] of jobs) {
  const out = TMP + '/p_' + name + '.png';
  try { fs.unlinkSync(out); } catch (e) {}
  cp.execFileSync(CHROME, ['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars',
    '--user-data-dir=' + ud, '--virtual-time-budget=4000', '--screenshot=' + out,
    '--window-size=1680,1000', url], { stdio: ['ignore','pipe','ignore'], maxBuffer: 1<<30 });
  console.log(name + ' -> ' + (fs.existsSync(out) ? fs.statSync(out).size : 'MISSING'));
}
