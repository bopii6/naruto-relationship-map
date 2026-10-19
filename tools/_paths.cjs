/*
 * 所有校验 / 截图脚本共用的路径。
 * 这些脚本以前把源码路径写死成 E:/短视频生成/火影忍者-人物关系图谱.html，
 * 项目抽出来之后改成相对路径：以本文件所在目录的上一级为准。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT  = path.resolve(__dirname, '..');            // 项目根
const SRC   = path.join(ROOT, 'index.html');            // 唯一源文件
const OUT   = path.join(ROOT, 'docs');                  // 截图输出
const BUILD = path.join(os.tmpdir(), 'narutomap-build'); // 中间产物（临时，随时可删）

const CHROME =
  process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

function ensure() {
  fs.mkdirSync(BUILD, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
}

/** Windows 本地路径 → file:/// URL */
function fileUrl(p) {
  return 'file:///' + path.resolve(p).replace(/\\/g, '/');
}

/** 读源文件 */
function readSrc() {
  return fs.readFileSync(SRC, 'utf8');
}

module.exports = { ROOT, SRC, OUT, BUILD, CHROME, ensure, fileUrl, readSrc };
