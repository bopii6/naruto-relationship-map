const fs = require('fs');
const os = require('os');

const ACC = '25a5412b3b51b03386b6945004ba381b';
const tok = (fs.readFileSync(os.homedir() + '/.wrangler/config/default.toml', 'utf8')
  .match(/oauth_token\s*=\s*"([^"]+)"/) || [])[1];

const CANDIDATES = [
  'naruto', 'konoha', 'ninja', 'shinobi', 'hokage', 'chakra',
  'rasengan', 'akatsuki', 'kyuubi', 'huoying', 'renzhe', 'mingren',
  'narutomap', 'kagemap', 'ninjamap', 'konohamap',
  'hyzz', 'hyz', 'nrt', 'hy-renzhe', 'naruto-hy', 'shinobi-map',
  'woshihuoying', 'naruto-map', 'huoying-map'
];

const made = [];
const skipped = [];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function api(method, path, body, tries = 4) {
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch('https://api.cloudflare.com/client/v4' + path, {
        method,
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      return await r.json();
    } catch (e) {
      if (i === tries) return { __net: e.message };
      await sleep(900 * i);
    }
  }
}

(async () => {
  let chosen = null;
  for (const name of CANDIDATES) {
    if (chosen) break;
    const j = await api('POST', '/accounts/' + ACC + '/pages/projects',
      { name, production_branch: 'main' });

    if (j.__net) { console.log('NETERR  ' + name + '  ' + j.__net); continue; }
    if (!j.success) {
      const e = (j.errors || [])[0] || {};
      console.log('reject  ' + name.padEnd(16) + '  code=' + e.code + '  ' + (e.message || '').slice(0, 70));
      continue;
    }

    const sub = j.result.subdomain || '';
    made.push(name);
    if (sub === name + '.pages.dev') {
      chosen = name;
      console.log('CLEAN   ' + name.padEnd(16) + '  ->  https://' + sub + '/');
    } else {
      console.log('taken   ' + name.padEnd(16) + '  ->  ' + sub + '   (deleting)');
      const d = await api('DELETE', '/accounts/' + ACC + '/pages/projects/' + name);
      skipped.push(name + (d.success ? '' : '  [DELETE FAILED]'));
    }
  }

  console.log('');
  console.log('CHOSEN = ' + (chosen || '(none)'));
  console.log('created-kept = ' + made.filter(n => n === chosen).join(',') || '(none)');
  console.log('deleted      = ' + (skipped.join(', ') || '(none)'));
})();
