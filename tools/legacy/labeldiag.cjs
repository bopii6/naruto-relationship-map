const fs = require('fs');
const cp = require('child_process');

const { SRC, BUILD, fileUrl, CHROME } = require('../_paths.cjs');
const TMP = BUILD;

const html = fs.readFileSync(SRC, 'utf8');

const hook = `
<scr` + `ipt>
(function(){
  /* headless throttles rAF; drive it with timers so the layout tween settles */
  var raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function(cb){
    return setTimeout(function(){ cb(performance.now()); }, 16);
  };
  var rec = [], frame = 0;
  window.__labels = rec;
  var proto = CanvasRenderingContext2D.prototype;
  var origCR = proto.clearRect;
  proto.clearRect = function(){ frame++; return origCR.apply(this, arguments); };
  var orig = proto.fillText;
  proto.fillText = function(t, x, y){
    try {
      var m = this.getTransform();
      rec.push({ f:frame, t:String(t), sx:m.a*x + m.e, sy:m.d*y + m.f,
                 w:this.measureText(String(t)).width, font:this.font,
                 ta:this.textAlign, tb:this.textBaseline });
    } catch(e){}
    return orig.apply(this, arguments);
  };
  window.__dump = function(tag){
    var pre = document.createElement('pre');
    pre.id = 'labelDump';
    pre.textContent = JSON.stringify({ tag:tag, frames:frame, labels:rec });
    document.body.appendChild(pre);
  };
})();
</scr` + `ipt>
`;

let s = html.replace('<scr' + 'ipt>', hook + '<scr' + 'ipt>');

const action = `
<scr` + `ipt>
setTimeout(function(){
  var h = (location.hash || '').replace('#','');
  var b = document.querySelector('#tabs button[data-mode=' + (h || 'gen') + ']');
  if (b) b.click();
  setTimeout(function(){ window.__dump(h || 'gen'); }, 2500);
}, 700);
</scr` + `ipt>
`;
s = s.replace('</body>', action + '\n</body>');
fs.writeFileSync(TMP + '/probe2.html', s);

const url = fileUrl(TMP + '/probe2.html');
const ud = TMP + '/cprof-lab2';

function unesc(x){ return x.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }

for (const m of (process.argv.slice(2).length ? process.argv.slice(2) : ['gen','zone'])) {
  const args = ['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars',
    '--user-data-dir='+ud,'--virtual-time-budget=8000','--dump-dom',
    '--window-size=1680,1000', url+'#'+m];
  const out = cp.execFileSync(CHROME, args, { maxBuffer: 1<<30, stdio:['ignore','pipe','ignore'] }).toString('utf8');
  const i = out.indexOf('<pre id="labelDump">');
  const j = out.indexOf('</pre>', i);
  if (i < 0) { console.log(m + ': NO DUMP'); continue; }
  const data = JSON.parse(unesc(out.slice(i + 20, j)));

  const last = data.frames;
  const L = data.labels.filter(l => l.f === last && l.tb === 'top' && l.ta === 'center')
    .map(l => ({ t:l.t, sx:l.sx, sy:l.sy, w:l.w,
                 hh: parseFloat((l.font.match(/(\d+(?:\.\d+)?)px/)||[0,12])[1]) * 1.2, font:l.font }));

  console.log('===== ' + m + ' =====  frames=' + data.frames + '  lastFrameLabels=' + L.length);
  const fonts = {}; L.forEach(l => fonts[l.font] = (fonts[l.font]||0)+1);
  console.log('  fonts: ' + JSON.stringify(fonts));
  const bad = [];
  for (let a=0;a<L.length;a++) for (let b=a+1;b<L.length;b++){
    const A=L[a],B=L[b];
    if (Math.abs(A.sy-B.sy) > Math.max(A.hh,B.hh)*0.6) continue;
    const ov = (A.w+B.w)/2 - Math.abs(A.sx-B.sx);
    if (ov > 0.5) bad.push({a:A.t,b:B.t,ov:Math.round(ov),d:Math.round(Math.abs(A.sx-B.sx)),wa:Math.round(A.w),wb:Math.round(B.w)});
  }
  console.log('  label collisions = ' + bad.length);
  bad.sort((p,q)=>q.ov-p.ov).slice(0,16).forEach(x =>
    console.log('   ' + x.a + ' ⨯ ' + x.b + '  overlap=' + x.ov + 'px  dist=' + x.d + 'px  w=' + x.wa + '/' + x.wb));
  const xs = [...new Set(L.map(l=>Math.round(l.sx)))].sort((p,q)=>p-q);
  console.log('  distinct label screen-x count=' + xs.length);
}
