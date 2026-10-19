# 一张网 — 90 秒动态讲解片

《火影忍者 · 人物关系图谱》的第一支短片。不是剪辑原作动画，而是把图谱本身做成运动图形：

- **1920×1080 / 30fps / 90 秒 / H.264 + AAC**
- 37 位角色、60 条关系、6 类关系、7 种情感驱动力、25 个名场面
- 无旁白；**120 BPM 太鼓 + 低音 ostinato + 弦乐**，有推进感但不抢字幕
- 头像与数据全部来自 `../index.html`，不另养一份

成片：`video/out/一张网-火影人物关系图谱-90s.mp4`（另有一份英文名副本 `naruto-one-web-90s.mp4`）

网页版：`../assets/video/one-web-90s-web.mp4`（720p / 约 5.7MB，点播才加载）

## 六个段落

| 时间 | 段落 | 内容 |
| --- | --- | --- |
| 0:00–0:08 | 冷开场 | “你记住的是忍术。其实它讲的是关系。” |
| 0:08–0:24 | 一张网 | 37 个头像落位，60 条关系逐条生长 |
| 0:24–0:42 | 结构 | 血缘 / 师徒 / 队友 / 羁绊 / 宿敌 / 操控，逐类点亮 |
| 0:42–1:02 | 一个人 | 镜头推近鸣人，12 个人围成一圈，四段关系各配一句台词 |
| 1:02–1:18 | 情感 | 线宽＝情感浓度；聚光鼬 / 带土 / 长门 |
| 1:18–1:30 | 年表 | 25 个菱形事件扫过年表，落版 |

## 目录

```
video/
├── build-data.cjs       从 ../index.html 抽出数据 → data.json
├── story.template.html  确定性 90 秒动画舞台（Canvas 2D）
├── build-page.cjs       把 data.json 内联进模板 → story.html
├── audio.cjs            120 BPM 太鼓 / 低音 / 弦乐 → out/audio.wav
├── render.cjs           Chrome + CDP 逐帧渲染 → ffmpeg 编码
├── make-web.cjs         1080p 成片 → assets/video 720p 网页版
├── shot.cjs             本地站点截图小工具
├── out/
│   ├── audio.wav
│   ├── poster.jpg
│   └── 一张网-火影人物关系图谱-90s.mp4
├── frames/              中间产物（约 1.8GB，可删；重编时再跑 --frames）
└── stills/              调试用关键帧
```

## 重新生成

在项目根目录：

```bash
node video/build-data.cjs
node video/build-page.cjs
node video/audio.cjs
node video/render.cjs --all
node video/make-web.cjs   # 生成 assets/video 里的 720p 网页版
```

也可以拆成两步（推荐，编码失败时不用重渲）：

```bash
node video/render.cjs --frames   # 2700 帧 → video/frames/
node video/render.cjs --encode   # 帧 + audio.wav → MP4
```

只想看某几帧：

```bash
node video/render.cjs --stills 2,20,45,66,84,88
```

## 网页里的影片

`index.html` 里有三个入口，都打开同一个影片弹窗：

- 顶栏 `▶ 90s`（窄屏隐藏，换成右上角 `90s 影片` 悬浮按钮）
- 左侧「一张网 · 90 秒动态讲解」卡片
- 未选中角色时，右侧空面板里的「看 90 秒影片」

直接访问 `index.html#film` 也会自动打开。网页用 720p、`preload="none"` 和海报帧，点播放才开始下载；弹窗里另有 720p 下载链接。

## 三个实现上的选择

1. **不用截屏，直接导出 canvas。** `Page.captureScreenshot` 在 1080p 下会偶发卡死，而且会把上一帧的合成层带进来（画面上表现为“重影”）。现在每帧调用 `canvas.toDataURL('image/jpeg', 0.95)`，拿到的是纯 canvas 像素，稳定且快（约 100–150ms/帧）。
2. **先落盘再编码。** 早期版本把 MJPEG 直接 pipe 给 ffmpeg，场景变复杂时会在第 270 帧左右卡死；现在帧先写到 `video/frames/`，再单独编码，失败可续，也方便检查单帧。
3. **编码优先走 Intel QSV。** `h264_qsv` 在这台机器上约 1× 实时（90 秒片约 80 秒编码）；QSV 不可用时自动回退到 `libx264 -preset veryfast -crf 18`。JPEG 是全范围，编码前统一转到 TV range，避免播放器发灰。

整条片子是时间的纯函数：`render(t)` 不依赖上一帧状态，所以任意一帧都能单独重渲；改时间轴不用重跑前面的帧。`t` 只来自帧号，不来自 `Date.now()`。

## 版权

- 角色头像取自 [AniList](https://anilist.co)，版权归原作者及集英社所有
- 本片是个人学习与展示用的同人项目，不包含原作动画片段，请勿商用
- 《火影忍者》为岸本齐史 / 集英社的版权作品，与官方无关
