const fs = require('fs');
const os = require('os');

function tok(p) {
  try {
    return (fs.readFileSync(p, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/) || [])[1];
  } catch (e) { return null; }
}

const t1 = tok(os.homedir() + '/.wrangler/config/default.toml');
const t2 = tok(process.env.APPDATA + '/xdg.config/.wrangler/config/default.toml');

(async () => {
  for (const [tag, t] of [['primary', t1], ['xdg', t2]]) {
    if (!t) { console.log(tag + ': none'); continue; }
    for (const p of ['/user', '/zones?per_page=20']) {
      try {
        const r = await fetch('https://api.cloudflare.com/client/v4' + p, {
          headers: { Authorization: 'Bearer ' + t }
        });
        const j = await r.json();
        console.log(tag + ' ' + p + '  status=' + r.status + '  success=' + j.success +
          '  err=' + JSON.stringify(j.errors || []).slice(0, 140));
        if (j.success && p === '/zones') j.result.forEach(z => console.log('    zone: ' + z.name + ' [' + z.status + ']'));
      } catch (e) { console.log(tag + ' ' + p + '  NETERR ' + e.message); }
    }
  }
})();
