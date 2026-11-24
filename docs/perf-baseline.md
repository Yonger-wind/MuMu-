# 首屏性能基线（P0-5）

**采集方式**：`PORT=5199 node serve.js` + `node tools/perf-baseline.cjs --runs=3 --stage`
**环境**：headless Edge（本机），1440×900，DPR 1，`Network.setCacheDisabled(true)` 冷加载；本地服务器无 gzip、无缓存头。每项 3 次取中位数。
**指标口径**：首屏可交互 = 导航开始 → `load` 完成 + 字体就绪 + 连续两帧 rAF，由 `Page.addScriptToEvaluateOnNewDocument` 注入的脚本在页面内用 `performance.now()` 写入 `window.__readyAt`（不含 CDP 轮询与往返开销）；体积 = `transferSize` 按类型汇总；请求数 = 子资源 + 1（HTML 文档本身）；FPS = 首页夕阳 / 舞台采样 3 秒。

| 指标 | 基线（P0-5 改动前） | 懒加载后 | 变化 |
|---|---|---|---|
| 首屏可交互（ms） | 383 | — | — |
| load（ms） | 328 | — | — |
| 首屏请求数 | 53 | — | — |
| 首屏图片请求数 | 32 | — | — |
| 首屏总字节（KB） | 5806 | — | — |
| JS 字节（KB） | 1256 | — | — |
| 图片字节（KB） | 4529 | — | — |
| 首页 FPS | 47.1 | — | — |
| 舞台 FPS | 58.0 | — | — |

**补充数字**：DCL 140 ms · TTFB 7 ms · CSS 21 KB · 首页 P95 帧间隔 33.4 ms（>20 ms 共 39 帧，3 次中位数）· 舞台 P95 帧间隔 16.8 ms（>20 ms 共 6 帧）。
**已知噪音**：唯一控制台/网络异常是 `http 404 /favicon.ico`（浏览器自动请求，`serve.js` 无此文件，与 P0-5 无关，每轮 1 条，报错按 `run N:` 标注轮次）；该请求也计入「首屏请求数」与 `ico 0 KB` 分类。headless Edge + `--disable-gpu` 下的 FPS 只作同机前后对比用。

**如何复跑**：`PORT=5199 node serve.js &`，然后 `node tools/perf-baseline.cjs --runs=3 --stage --out=.tmp-perf/after.json`。数字随机器与 Edge 版本变化，对比只认同一台机器同一会话内的前后差值；采集器会先校验 9334 端口归属（占用即报错退出）、校验导航后页面为 `http:` 且含 `#btn-start`，任一轮异常都不会产出「看似正常」的 0 值。
