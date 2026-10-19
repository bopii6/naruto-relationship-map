const fs = require('fs');
const os = require('os');

const ACC = '25a5412b3b51b03386b6945004ba381b';
const tok = (fs.readFileSync(os.homedir() + '/.wrangler/config/default.toml', 'utf8')
  .match(/oauth_token\s*=\s*"([^"]+)"/) || [])[1];

async function call(method, path) {
  const r = await fetch('https://api.cloudflare.com/client/v4' + path, {
    method, headers: { Authorization: 'Bearer ' + tok }
  });
  return { status: r.status, body: await r.json() };
}

(async () => {
  for (const name of ['kage', 'naruto-relationship-map']) {
    const d = await call('DELETE', '/accounts/' + ACC + '/pages/projects/' + name);
    console.log('delete ' + name.padEnd(24) + ' status=' + d.status + ' success=' + d.body.success +
      (d.body.success ? '' : '  ' + JSON.stringify(d.body.errors || []).slice(0, 120)));
  }

  const l = await call('GET', '/accounts/' + ACC + '/pages/projects');
  if (l.body.success) {
    console.log('');
    console.log('remaining projects:');
    l.body.result.forEach(p => console.log('  ' + p.name.padEnd(24) + ' -> ' + p.subdomain));
  } else {
    console.log('list failed: ' + JSON.stringify(l.body.errors));
  }
})();
