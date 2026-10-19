# tools — 校验与截图

这些脚本以前散在 `%TEMP%` 里、并且把源码路径写死成 `E:/短视频生成/火影忍者-人物关系图谱.html`。
抽成独立项目后统一改成**相对路径**，路径规则集中在 `_paths.cjs`。

```
tools/
  _paths.cjs        路径与 Chrome 位置（唯一的路径来源）
  build.cjs         拼装：src/template.html + data/*.cjs + assets/avatars.json → index.html
  verify.cjs        89 项总校验：布局 / 重叠 / 头像 / 情感层 / 金句 / 四字评 / 渲染
  evcheck.cjs       名场面：25 条数据完整性 + 聚焦布局不撞车 + 开关生效
  epcheck.cjs       四字评：37 条 / 长度 4 / 无重复 + 注入点 + JS 语法
  jucheck.cjs       忍术排行：41 条数据完整性 + 排序 + 覆盖率 + 面板渲染
  domcheck.cjs      真实渲染后的 DOM 抽查（详情面板里真的长出「经历过的名场面」）
  epshot.cjs        生成 docs/ep_*.png
  evshot.cjs        生成 docs/ev_*.png
  jushot.cjs        生成 docs/ju_*.png
  crest-sheet.html  五枚阵营族徽的对照页（浏览器直接打开）
  legacy/           早期调布局用的一次性诊断，留档不复用（含抽数据的 extract-data.cjs）
  cloudflare/       短域名试建 / 账号探测 / 清理
```

## 源码在哪改

`index.html` 是**构建产物**，不要直接改它：

- 改界面 / 逻辑 → `src/template.html`
- 改角色 / 关系 / 名言 / 名场面 / 四字评 / 忍术 → `data/*.cjs`
- 改头像 → `assets/avatars.json`

改完跑 `node tools/build.cjs` 重新生成 `index.html`，再跑下面的校验。
模板里 `/*__DATA:XXX__*/` 是数据注入点，build.cjs 按标记替换。

## 用法

在**项目根目录**下跑：

```bash
node tools/build.cjs      # 先构建，再校验
node tools/verify.cjs     # 期望输出 === ALL CHECKS PASSED ===
node tools/evcheck.cjs    # 期望输出 === EVENT CHECKS PASSED ===
node tools/epcheck.cjs    # 期望输出 === EPITHET CHECKS PASSED ===
node tools/jucheck.cjs    # 期望输出 === JUTSU CHECKS PASSED ===
node tools/domcheck.cjs   # 期望输出 === DOM CHECK PASSED ===
```

截图（需要一个无头 Chrome，路径见 `_paths.cjs`，可用环境变量 `CHROME_PATH` 覆盖）：

```bash
node tools/epshot.cjs     # → docs/ep_detail.png / docs/ep_quotes.png
node tools/evshot.cjs     # → docs/ev_strip.png / ev_strip2 / ev_card / ev_panel / ev_timeline
node tools/jushot.cjs     # → docs/ju_panel.png / ju_dojutsu / ju_search / ju_detail
```

中间产物（改写过的 HTML 副本）写在 `%TEMP%/narutomap-build/`，随手可删。

## 为什么校验脚本要跑在 Node 里

`index.html` 的主 `<script>` 整体包在 `(function(){ 'use strict'; … })();` 里，
内部符号都不是全局的。校验脚本的做法是：把这段 script 抽出来，在最后插一行
`globalThis.__T = { … }` 把内部符号挂出来，再用 DOM 桩件跑一遍。

所以校验脚本里那个 `const tail = '})();'` 的注入点**不能删**——改了主脚本末尾结构的话，这里也要跟着改。

## 已知的坑（写脚本时踩过的）

- 无头 Chrome 下 `requestAnimationFrame` 会被节流，只跑约 3 帧。直接切视图截图会拍到补间中间帧，**看起来是乱的但其实不是 bug**。对策：改写副本的初始 `mode` / `focusId`，让首屏即目标视图。
- `2>$null` 重定向会让 Chrome 无头截图**不产出文件**；要用 `2>&1 | Out-Null`。
- 原生命令往 stderr 写字会让 PowerShell 报 `NativeCommandError` 且 `$LASTEXITCODE=1`，是假失败（`git push`、`chrome` 都中招），要靠实际状态判断。
- 本机到 `*.pages.dev` 的 443 出口被阻断（DNS 正常、TCP 超时），所以没法用 `curl` 自检线上。
