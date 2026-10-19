/*
 * 用无头 Chrome + CDP 逐帧渲染 story.html。
 *
 *   node video/render.cjs --stills 3,20,50,70,82,88
 *   node video/render.cjs --frames      只渲染帧到 video/frames/
 *   node video/render.cjs --encode      只把帧编码成 MP4
 *   node video/render.cjs --all         渲染 + 编码
 *
 * 说明：不再把 JPEG 直接 pipe 给 ffmpeg。1080p 的 MJPEG 管道在某些机器上会
 * 在场景变复杂时卡死；先落盘、再编码更稳，也方便单独重编。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIR = __dirname;
const STORY = path.join(DIR, 'story.html');
const OUTDIR = path.join(DIR, 'out');
const STILLS = path.join(DIR, 'stills');
const FRAMES = path.join(DIR, 'frames');
const AUDIO = path.join(OUTDIR, 'audio.wav');
const VIDEO = path.join(OUTDIR, 'naruto-one-web-90s.mp4');
const FPS = 30;
const DUR = 90;
const TOTAL = FPS * DUR;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const fileUrl = p => 'file:///' + path.resolve(p).replace(/\\/g, '/');

function parseArgs() {
  const a = process.argv.slice(2);
  if (a.includes('--all')) return { mode: 'all' };
  if (a.includes('--frames')) return { mode: 'frames' };
  if (a.includes('--encode')) return { mode: 'encode' };
  const i = a.indexOf('--stills');
  if (i >= 0 && a[i + 1]) return { mode: 'stills', times: a[i + 1].split(',').map(Number) };
  return { mode: 'stills', times: [2, 10, 20, 30, 40, 50, 58, 66, 72, 80, 84, 88] };
}

async function waitForJson(url, tries = 150) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch (e) { }
    await sleep(100);
  }
  throw new Error('timeout waiting for ' + url);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        if (msg.method === 'Runtime.exceptionThrown') {
          console.error('PAGE EXCEPTION:', JSON.stringify(msg.params.exceptionDetails).slice(0, 800));
        }
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
          console.error('PAGE ERROR:', msg.params.args.map(a => a.value).join(' '));
        }
      }
    });
  }
  send(method, params = {}, timeout = 60000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, timeout);
      this.pending.set(id, {
        resolve: v => { clearTimeout(timer); resolve(v); },
        reject: e => { clearTimeout(timer); reject(e); }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function launch() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.mkdirSync(STILLS, { recursive: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const port = 19400 + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'naruto-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--force-device-scale-factor=1',
    '--window-size=1920,1080',
    '--remote-allow-origins=*',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: 'ignore' });

  const list = await waitForJson(`http://127.0.0.1:${port}/json/list`);
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false
  });
  await cdp.send('Page.navigate', { url: fileUrl(STORY) });
  console.log('navigated');

  let ready = false;
  for (let i = 0; i < 120; i++) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: '({ ready: window.__ready === true, err: window.__err || null, state: document.readyState })',
      returnByValue: true
    }, 10000);
    const v = r.result && r.result.value;
    if (i % 10 === 0) console.log('wait', i, JSON.stringify(v));
    if (v && v.err) console.error('PAGE SCRIPT ERROR:', v.err);
    if (v && v.ready === true) { ready = true; break; }
    await sleep(100);
  }
  if (!ready) throw new Error('story page never became ready');
  console.log('page ready');
  return { chrome, ws, cdp, profile };
}

async function grab(cdp, mime, quality) {
  const q = mime === 'image/jpeg' ? ',' + quality : '';
  const expr = `document.getElementById('stage').toDataURL(${JSON.stringify(mime)}${q})`;
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
  const s = r.result && r.result.value;
  if (!s || typeof s !== 'string' || s.indexOf(',') < 0) throw new Error('canvas export failed');
  return Buffer.from(s.slice(s.indexOf(',') + 1), 'base64');
}

function assertJpeg(buf, label) {
  const ok = buf.length > 4 &&
    buf[0] === 0xFF && buf[1] === 0xD8 &&
    buf[buf.length - 2] === 0xFF && buf[buf.length - 1] === 0xD9;
  if (!ok) {
    throw new Error('bad JPEG at ' + label + ': bytes=' + buf.length +
      ' head=' + buf.slice(0, 4).toString('hex') +
      ' tail=' + buf.slice(-4).toString('hex'));
  }
}

async function renderStill(cdp, t) {
  const t0 = Date.now();
  console.log('render start', t);
  await cdp.send('Runtime.evaluate', { expression: `window.__renderFrame(${t})`, returnByValue: true });
  console.log('render done', t, (Date.now() - t0) + 'ms');
  const buf = await grab(cdp, 'image/jpeg', 0.92);
  assertJpeg(buf, 'still ' + t);
  console.log('grab done', t, (Date.now() - t0) + 'ms');
  const f = path.join(STILLS, `t_${String(t).padStart(5, '0')}.jpg`);
  fs.writeFileSync(f, buf);
  console.log('still', f, (Date.now() - t0) + 'ms', (buf.length / 1024).toFixed(0) + 'KB');
}

async function renderFrames(cdp) {
  fs.mkdirSync(FRAMES, { recursive: true });
  const t0 = Date.now();
  let totalBytes = 0;
  for (let i = 0; i < TOTAL; i++) {
    const t = i / FPS;
    await cdp.send('Runtime.evaluate', { expression: `window.__renderFrame(${t})`, returnByValue: true });
    const buf = await grab(cdp, 'image/jpeg', 0.95);
    try {
      assertJpeg(buf, 'frame ' + i);
    } catch (e) {
      console.error(e.message);
      throw e;
    }
    totalBytes += buf.length;
    fs.writeFileSync(path.join(FRAMES, `f_${String(i).padStart(5, '0')}.jpg`), buf);
    if (i % 150 === 0) {
      const el = (Date.now() - t0) / 1000;
      const fps = (i + 1) / Math.max(el, 0.001);
      const eta = (TOTAL - i - 1) / Math.max(fps, 0.001);
      console.log(`frame ${i + 1}/${TOTAL}  ${fps.toFixed(1)} fps  eta ${Math.round(eta)}s  ${(totalBytes / 1048576).toFixed(0)}MB`);
    }
  }
  console.log('frames done in', Math.round((Date.now() - t0) / 1000) + 's',
    (totalBytes / 1048576).toFixed(0) + 'MB');
}

function encode() {
  if (!fs.existsSync(AUDIO)) throw new Error('audio.wav missing; run node video/audio.cjs first');
  if (!fs.existsSync(path.join(FRAMES, 'f_00000.jpg')) ||
      !fs.existsSync(path.join(FRAMES, `f_${String(TOTAL - 1).padStart(5, '0')}.jpg`))) {
    throw new Error('frames missing; run node video/render.cjs --frames first');
  }
  const t0 = Date.now();

  const common = [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES, 'f_%05d.jpg'),
    '-i', AUDIO,
    '-vf', 'scale=in_range=full:out_range=tv,format=nv12',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart',
    '-metadata', 'title=一张网 · 火影忍者人物关系图谱',
    '-metadata', 'artist=naruto-relationship-map',
    '-metadata', 'comment=A 90-second data film built from the relationship graph.',
    '-metadata:s:v:0', 'language=zho',
    '-metadata:s:a:0', 'language=zho',
    VIDEO
  ];

  const qsv = spawnSync('ffmpeg', [
    ...common.slice(0, 7),
    '-c:v', 'h264_qsv', '-preset', 'fast', '-global_quality', '20', '-look_ahead', '0',
    '-profile:v', 'high', '-level', '4.1', '-color_range', 'tv',
    ...common.slice(7)
  ], { stdio: 'inherit' });

  if (qsv.status === 0) {
    const mb = (fs.statSync(VIDEO).size / 1048576).toFixed(1);
    console.log('wrote', VIDEO, mb + ' MB', '(qsv) in', Math.round((Date.now() - t0) / 1000) + 's');
    return;
  }

  console.warn('h264_qsv failed, falling back to libx264 veryfast');
  const x264 = spawnSync('ffmpeg', [
    ...common.slice(0, 7),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-tune', 'animation',
    '-profile:v', 'high', '-level', '4.1', '-color_range', 'tv',
    ...common.slice(7)
  ], { stdio: 'inherit' });
  if (x264.status !== 0) throw new Error('ffmpeg encode failed');
  const mb = (fs.statSync(VIDEO).size / 1048576).toFixed(1);
  console.log('wrote', VIDEO, mb + ' MB', '(x264) in', Math.round((Date.now() - t0) / 1000) + 's');
}

(async function main() {
  const args = parseArgs();

  if (args.mode === 'encode') {
    encode();
    return;
  }

  const { chrome, ws, cdp, profile } = await launch();
  try {
    if (args.mode === 'stills') {
      for (const t of args.times) await renderStill(cdp, t);
    } else {
      await renderFrames(cdp);
    }
  } finally {
    try { ws.close(); } catch (e) { }
    try { chrome.kill(); } catch (e) { }
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  }

  if (args.mode === 'all') encode();
})().catch(e => { console.error(e); process.exit(1); });
