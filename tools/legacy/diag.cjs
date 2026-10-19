const realExit = process.exit;
process.exit = () => {};
require('../verify.cjs');
process.exit = realExit;
const T = globalThis.__T;
const R = n => Math.round(n * 10) / 10;

function report(mode) {
  T.setMode(mode, null, false);
  const d = T.deco;
  console.log('===== mode=' + mode + ' =====');
  if (d.bands) {
    d.bands.forEach(b => {
      console.log('band ' + b.g.main + '  x=' + R(b.x) + ' y=' + R(b.y) +
        ' w=' + R(b.w) + ' h=' + R(b.h) + ' cols=' + b.cols + ' rows=' + b.rows + ' n=' + b.list.length);
      const out = b.list.filter(p => p.tx < b.x || p.tx > b.x + b.w || p.ty < b.y || p.ty > b.y + b.h);
      if (out.length) console.log('   OUTSIDE: ' + out.map(p => p.id + '(' + R(p.tx) + ',' + R(p.ty) + ')').join(' '));
    });
  }
  // pairwise overlap among visible nodes (use target positions tx/ty)
  const vis = T.nodes.filter(n => n.show);
  let worst = null, cnt = 0;
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i], b = vis[j];
    const dx = a.tx - b.tx, dy = a.ty - b.ty, dist = Math.hypot(dx, dy);
    const need = a.r + b.r;
    if (dist < need - 0.01) {
      cnt++;
      const ov = need - dist;
      if (!worst || ov > worst.ov) worst = { a: a.id, b: b.id, ov: R(ov), dist: R(dist), need: R(need) };
    }
  }
  console.log('visible=' + vis.length + ' overlappingPairs=' + cnt + (worst ? '  worst=' + JSON.stringify(worst) : ''));
  T.fitView();
  console.log('view.k=' + R(T.view.k));
}

report('gen');
report('zone');
