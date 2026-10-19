const fs = require('fs');
const os = require('os');

const cfg = fs.readFileSync(os.homedir() + '/.wrangler/config/default.toml', 'utf8');
const tok = (cfg.match(/oauth_token\s*=\s*"([^"]+)"/) || [])[1];
const acc = '25a5412b3b51b03386b6945004ba381b';
if (!tok) { console.log('no token'); process.exit(1); }

async function api(path, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch('https://api.cloudflare.com/client/v4' + path, {
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }
      });
      const j = await r.json();
      return j;
    } catch (e) {
      if (i === tries) return { __err: e.message };
      await new Promise(res => setTimeout(res, 1500 * i));
    }
  }
}

(async () => {
  const p = await api('/accounts/' + acc + '/pages/projects');
  if (p.__err) console.log('projects ERR: ' + p.__err);
  else if (!p.success) console.log('projects FAIL: ' + JSON.stringify(p.errors));
  else {
    console.log('=== Pages projects ===');
    for (const x of p.result) console.log('  ' + x.name.padEnd(26) + ' -> ' + (x.subdomain || '?'));
  }

  const z = await api('/zones?per_page=50');
  if (z.__err) console.log('zones ERR: ' + z.__err);
  else if (!z.success) console.log('zones FAIL: ' + JSON.stringify(z.errors));
  else {
    console.log('=== Zones (domains) ===');
    if (!z.result.length) console.log('  (none)');
    for (const x of z.result) console.log('  ' + x.name + '  [' + x.status + ']');
  }
})();
