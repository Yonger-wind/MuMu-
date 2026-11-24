# 暮幕 P0-5 · 性能基线与首屏懒加载（设计说明）

**日期**：2026-11-24
**范围**：性能基线采集 + 首屏懒加载（立绘空闲分批、场景大图按需）。`scene.js` 按场景拆分本轮不做（roadmap 标注可延后，另行立项）。
**约束**：零依赖、无构建步骤；不改 `parser.js / engine.js / prop.js / package.js`；画面与交互零变化；旧存档仍可读。

---

## 1. 现状事实

| 项 | 现状 |
|---|---|
| `scripts/scene.js` | 17,031 行，模块初始化时立即给 4 张大图赋 `src`（合集约 3.9M） |
| `scripts/portraits.js` | `main.js` 启动即 `preloadPortraits()`，28 张立绘（2.4M）全部请求，并逐张做渐隐 canvas 复制 |
| 首屏其余资源 | CSS 3 个、JS 模块约 20 个（含 `builtin.js` 1,918 行）、字体外链 |
| 兜底渲染 | 场景大图与立绘均有 ready 标志，未加载时按程序化画面绘制，已有既有降级路径 |

即：首屏无条件加载 **约 6.3M 图片**，其中首屏根本用不到。

## 2. 采集口径（可复现）

新增开发工具 `tools/perf-baseline.cjs`（零依赖，复用 `tools/cdp-shoot.cjs` 的 headless Edge + Node 内置 WebSocket 方案）。

- 环境：headless Edge，1440×900，DPR 1；本地 `node serve.js`（`PORT=5199`，无 gzip、无缓存头）；`Network.setCacheDisabled(true)` 冷加载；每项跑 3 次取中位数。
- **首屏可交互**：导航开始 → 页面 `load` 完成、`document.fonts.ready` 就绪、连续两帧 rAF 绘制完成时的 `performance.now()`。
- **首屏体积**：`performance.getEntriesByType('resource')` 的 `transferSize`（退回 `encodedBodySize`）按类型汇总；同时统计首屏图片请求数。
- **FPS**：首页夕阳动画采样 3 秒；`--stage` 时再点「开始体验 → 首张曲目卡 → 第一章」进入舞台后采样 3 秒，输出平均 FPS / P95 帧时长 / >20ms 帧数。
- **健康检查**：控制台 error/warning、HTTP ≥400 响应逐条记录。
- 输出：JSON（`--out=`）+ 终端摘要表；基线数字写进 `docs/perf-baseline.md`。

## 3. 懒加载设计

### 3.1 立绘：首页空闲后分批

- `portraits.js` 新增 `schedulePortraitPreload()`：等 `window load` 之后，在 `requestIdleCallback`（无则 `setTimeout`）里按 **每批 4 张** 逐批加载，批间再等空闲，超时参数 1200ms（首批）/ 300ms（后续）。
- 新增纯函数 `planPortraitBatches(keys, size)` 供单测；`loadPortrait(key)` 带 `images.has(key)` 幂等保护。
- `main.js` 启动调用由 `preloadPortraits()` 改为 `schedulePortraitPreload()`；`preloadPortraits()` 保留导出（显式全量加载场景，如测试/调试）。
- 绘制侧 `drawPortrait` 对未就绪立绘已 `return`，无需改动。

### 3.2 场景大图：首次交互后按需

- `createSceneRenderer` 内部移除 4 处模块初始化的 `src` 赋值；新增 `preloadImages()`（幂等，`sceneImagesRequested` 标志），内部一次性发起 4 张图请求；渲染器返回对象暴露该方法。
- `main.js` 在两个入口调用：`showScreen('stage')`（任何方式进舞台）与 `showLibrary()`（点「开始体验」先打开剧本库，提前起跑）。
- 渲染侧已有 `starryReady / cityDayReady / cityNightReady / scoreReady` 与 `starry.width` 守卫，未就绪时维持现有降级画面；就绪后既有 `layers = null` 失效缓存逻辑不变。

## 4. 测试策略

- 新增 `tests/perf-loading.test.mjs`：
  - `planPortraitBatches` 分批正确（含空数组 / 非整除）。
  - 静态断言：`main.js` 使用 `schedulePortraitPreload()` 且无启动期 `preloadPortraits();`；`preloadImages()` 在 `showScreen` 与 `showLibrary` 两处被调用；`scene.js` 的 4 个 `.src =` 全部位于 `preloadSceneImages` 函数体内、且渲染器返回对象暴露 `preloadImages`；`portraits.js` 使用 `requestIdleCallback`。
- 回归：`node --test tests/*.test.mjs` 全绿；`node tools/lint.js --builtin` 通过；15 章既有播放路径不受影响（每部曲至少实跑一章 + 截图）。浏览器侧验证：首屏图片请求数由 32 降为 0（场景图 4 + 立绘 28），控制台无错误/404。

## 5. 验收

- `docs/perf-baseline.md` 含「基线 → 懒加载后」同环境对比数字（首屏可交互、首屏字节、图片请求数、FPS）。
- 首页 / 剧本库 / 章节列表 / 舞台截图对比无视觉回归；场景大图与立绘在正常浏览节奏下不出现缺图。
- 零依赖、无构建步骤；不新增根 `package.json`。

## 6. 不做

- `scene.js` 拆分 / 动态 import（roadmap 允许延后；另立批次）。
- `builtin.js`、`prop.js` 的懒加载；字体本地化；gzip/缓存头（部署侧由 Qoder Sites 负责）。
