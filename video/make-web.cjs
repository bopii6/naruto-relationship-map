/*
 * 从 1080p 成片生成网页用的 720p 版本和海报。
 * 输出到 ../assets/video/，随站点一起部署。
 *
 *   node video/make-web.cjs
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const src = path.join(__dirname, 'out', 'naruto-one-web-90s.mp4');
const poster = path.join(__dirname, 'out', 'poster.jpg');
const outDir = path.join(root, 'assets', 'video');
const out = path.join(outDir, 'one-web-90s-web.mp4');
const outPoster = path.join(outDir, 'one-web-poster.jpg');

if (!fs.existsSync(src)) throw new Error('missing ' + src + ' — run video/render.cjs --all first');
fs.mkdirSync(outDir, { recursive: true });

const ff = spawnSync('ffmpeg', [
  '-y', '-i', src,
  '-vf', 'scale=1280:720:flags=lanczos',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
  '-profile:v', 'high', '-level', '3.1', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k',
  '-movflags', '+faststart',
  '-metadata', 'title=一张网 · 火影忍者人物关系图谱',
  '-metadata', 'artist=naruto-relationship-map',
  out
], { stdio: 'inherit' });
if (ff.status !== 0) throw new Error('ffmpeg video failed');

const fp = spawnSync('ffmpeg', [
  '-y', '-i', poster,
  '-vf', 'scale=1280:720:flags=lanczos',
  '-q:v', '3',
  outPoster
], { stdio: 'inherit' });
if (fp.status !== 0) throw new Error('ffmpeg poster failed');

const mb = (fs.statSync(out).size / 1048576).toFixed(1);
console.log('wrote', out, mb + ' MB');
console.log('wrote', outPoster);
