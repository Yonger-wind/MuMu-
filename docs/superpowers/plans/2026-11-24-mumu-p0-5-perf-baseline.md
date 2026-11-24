# 暮幕 P0-5 · 性能基线与首屏懒加载 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可复现的首屏性能基线（时间 / 体积 / FPS），并把首屏 6.3M 图片预加载改为按需（立绘空闲分批、场景大图首次交互后加载），画面零变化。

**Architecture:** 新增零依赖 `tools/perf-baseline.cjs`（headless Edge + Node 内置 WebSocket，复用 `tools/cdp-shoot.cjs` 的 CDP 模式）采集导航时序、资源字节与 FPS；运行时仅改加载时机：`portraits.js` 增加空闲分批调度，`scene.js` 去掉模块初始化的大图请求、暴露幂等 `preloadImages()`，`main.js` 在进舞台/打开剧本库时调用。

**Tech Stack:** 原生 ES Modules、Canvas 2D、Node ≥22（内置 `WebSocket` / `fetch`）、Node 内置测试运行器。零依赖、无构建。

**Spec:** `docs/superpowers/specs/2026-11-24-mumu-perf-baseline-design.md`

## Global Constraints

- 零依赖、无构建步骤、不加根 `package.json`；不整体重构 UI。
- 不改 `scripts/parser.js`、`engine.js`、`prop.js`、`package.js`；不破坏解析/人物/播放/分支/存档/分镜。
- 用户可见报错必须中文；旧存档 `mumu.saves.v1` 仍可读。
- 测试只在仓库根执行：`node --test tests/*.test.mjs`（不要裸跑 `node --test`，会被未跟踪的 `outputs/cdp-test.mjs` 干扰）。
- 其他会话的未跟踪目录 `demo/`、`holo-card/`、`outputs/`、`script-select/` 一律不碰；端口 5173 可能被其占用，本项目验证统一用 `PORT=5199`。
- 视觉验收：不卡通、不贴纸、融入环境光、情绪可读、不遮挡对话框；加载时机变化不得导致正常浏览节奏下缺图。

---

### Task 1: 性能基线采集器（不改运行时）

**Files:**
- Create: `tools/perf-baseline.cjs`
- Create: `docs/perf-baseline.md`

**Interfaces:**
- Produces: `node tools/perf-baseline.cjs [url] [--runs=N] [--stage] [--out=path]`；默认 `http://localhost:5199/`、3 次、不跑舞台；输出中位数摘要 + 可选 JSON。

- [ ] **Step 1: 写采集器**

创建 `tools/perf-baseline.cjs`：

```js
/* Dev-only: 首屏性能基线采集器（零依赖）。
   Usage: node tools/perf-baseline.cjs [url] [--runs=3] [--stage] [--out=file.json]
   先启动：PORT=5199 node serve.js
   需要 Node >= 22（内置 WebSocket + fetch）与本机 Edge。 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const PROFILE = path.join(process.cwd(), '.tmp-perf-edge');

const argv = process.argv.slice(2);
const url = argv.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:5199/';
const runs = Number((argv.find((a) => a.startsWith('--runs=')) || '--runs=3').split('=')[1]) || 3;
const withStage = argv.includes('--stage');
const outFile = (argv.find((a) => a.startsWith('--out=')) || '').split('=')[1] || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const kb = (n) => Math.round(n / 1024);

async function endpoint() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Edge CDP 未就绪');
}

function client(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.onopen = () => resolve({
      events,
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const n = ++id;
          pending.set(n, { res, rej });
          ws.send(JSON.stringify({ id: n, method, params }));
        });
      },
      close: () => ws.close(),
    });
    ws.onerror = () => reject(new Error('WS 错误'));
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg.id) {
        if (msg.method === 'Runtime.consoleAPICalled') {
          const t = msg.params.type;
          if (t === 'error' || t === 'warning') {
            events.push(t + ': ' + msg.params.args.map((a) => a.value || a.description || a.type).join(' '));
          }
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          events.push('exception: ' + (msg.params.exceptionDetails.text || ''));
        }
        if (msg.method === 'Network.responseReceived') {
          const r = msg.params.response;
          if (r.status >= 400) events.push('http ' + r.status + ' ' + r.url);
        }
        if (msg.method === 'Network.loadingFailed') {
          events.push('netfail: ' + (msg.params.errorText || ''));
        }
        return;
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    };
  });
}

async function evalValue(c, expression) {
  const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('页面脚本异常：' + (r.exceptionDetails.text || ''));
  return r.result && r.result.value;
}

async function waitForLoad(c) {
  for (let i = 0; i < 80; i++) {
    const st = await evalValue(c, `({ ready: document.readyState, end: (performance.getEntriesByType('navigation')[0] || {}).loadEventEnd || 0 })`);
    if (st.ready === 'complete' && st.end > 0) return;
    await sleep(250);
  }
  throw new Error('页面加载超时');
}

const PROBE = `(async () => {
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource').map((e) => ({
    name: e.name.split('/').pop() || e.name,
    type: e.initiatorType,
    bytes: e.transferSize || e.encodedBodySize || 0,
  }));
  return { ready: performance.now(), ttfb: nav.responseStart || 0, dcl: nav.domContentLoadedEventEnd || 0, load: nav.loadEventEnd || 0, resources: res };
})()`;

const fpsExpr = (ms) => `(async () => {
  const d = []; let last = performance.now(); const end = last + ${ms};
  await new Promise((resolve) => {
    function tick(now) { d.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve(); }
    requestAnimationFrame(tick);
  });
  const v = d.slice(1).sort((a, b) => a - b);
  const avg = v.reduce((a, b) => a + b, 0) / (v.length || 1);
  return { frames: v.length, avgFps: 1000 / (avg || 1), p95ms: v[Math.floor(v.length * 0.95)] || 0, over20: v.filter((x) => x > 20).length };
})()`;

async function enterStage(c) {
  await evalValue(c, `document.getElementById('btn-start').click(); true`);
  await sleep(600);
  const hasSeries = await evalValue(c, `(() => { const el = document.querySelector('.series-card[data-series]'); if (!el) return false; el.click(); return true; })()`);
  if (!hasSeries) throw new Error('未找到曲目卡');
  await sleep(400);
  const hasChapter = await evalValue(c, `(() => { const el = document.querySelector('.chapter-item[data-id]'); if (!el) return false; el.click(); return true; })()`);
  if (!hasChapter) throw new Error('未找到章节条目');
  await sleep(900);
}

function summarizeRun(r) {
  const by = {};
  let imageCount = 0;
  for (const e of r.resources) {
    const ext = (e.name.split('.').pop() || 'other').toLowerCase();
    const cat = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) ? 'image' : ext;
    by[cat] = (by[cat] || 0) + e.bytes;
    if (cat === 'image') imageCount++;
  }
  return {
    ready: r.ready, ttfb: r.ttfb, dcl: r.dcl, load: r.load,
    bytes: by, total: r.resources.reduce((a, e) => a + e.bytes, 0),
    requests: r.resources.length, imageCount,
    fpsHome: r.fpsHome, fpsStage: r.fpsStage || null,
    issues: r.issues,
  };
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1440,900',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });

  const results = [];
  try {
    const target = await endpoint();
    const c = await client(target.webSocketDebuggerUrl);
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    await c.send('Network.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    for (let i = 0; i < runs; i++) {
      c.events.length = 0;
      await c.send('Network.clearBrowserCache');
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      await c.send('Page.navigate', { url });
      await waitForLoad(c);
      const probe = await evalValue(c, PROBE);
      const fpsHome = await evalValue(c, fpsExpr(3000));
      let fpsStage = null;
      if (withStage) {
        await enterStage(c);
        fpsStage = await evalValue(c, fpsExpr(3000));
      }
      results.push(summarizeRun({ ...probe, fpsHome, fpsStage, issues: [...c.events] }));
      console.log(`run ${i + 1}/${runs}: ready ${Math.round(probe.ready)}ms · total ${kb(results[i].total)}KB · images ${results[i].imageCount}`);
    }
    c.close();
  } finally {
    child.kill();
    await sleep(400);
  }

  const pick = (fn) => median(results.map(fn));
  const cats = {};
  for (const r of results) for (const [k, v] of Object.entries(r.bytes)) cats[k] = cats[k] || [];
  for (const r of results) for (const k of Object.keys(cats)) cats[k].push(r.bytes[k] || 0);
  const summary = {
    url, runs, edge: 'headless 1440x900',
    ready: pick((r) => r.ready), ttfb: pick((r) => r.ttfb),
    dcl: pick((r) => r.dcl), load: pick((r) => r.load),
    total: pick((r) => r.total), requests: pick((r) => r.requests),
    imageCount: pick((r) => r.imageCount),
    bytes: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, median(v)])),
    fpsHome: { avgFps: median(results.map((r) => r.fpsHome.avgFps)), p95ms: median(results.map((r) => r.fpsHome.p95ms)), over20: median(results.map((r) => r.fpsHome.over20)) },
    fpsStage: withStage ? { avgFps: median(results.map((r) => r.fpsStage.avgFps)), p95ms: median(results.map((r) => r.fpsStage.p95ms)), over20: median(results.map((r) => r.fpsStage.over20)) } : null,
    issues: results.flatMap((r) => r.issues),
    raw: results,
  };

  console.log('');
  console.log(`URL ${url} · ${runs} 次中位数 · ${summary.edge} · 冷缓存`);
  console.log(`首屏可交互  ${Math.round(summary.ready)} ms（load ${Math.round(summary.load)} ms · DCL ${Math.round(summary.dcl)} ms · TTFB ${Math.round(summary.ttfb)} ms）`);
  console.log(`请求 ${summary.requests} 个 · 共 ${kb(summary.total)} KB · 其中图片 ${summary.imageCount} 个`);
  console.log('分类 ' + Object.entries(summary.bytes).map(([k, v]) => `${k} ${kb(v)}KB`).join(' · '));
  console.log(`首页 FPS ${summary.fpsHome.avgFps.toFixed(1)} · P95 ${summary.fpsHome.p95ms.toFixed(1)}ms · >20ms ${summary.fpsHome.over20} 帧`);
  if (summary.fpsStage) console.log(`舞台 FPS ${summary.fpsStage.avgFps.toFixed(1)} · P95 ${summary.fpsStage.p95ms.toFixed(1)}ms · >20ms ${summary.fpsStage.over20} 帧`);
  console.log(`控制台/网络异常 ${summary.issues.length} 条${summary.issues.length ? '：\n' + summary.issues.join('\n') : ''}`);

  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
    console.log('JSON 已写入 ' + outFile);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 启动服务器并采基线**

```bash
PORT=5199 node serve.js &
sleep 1
node tools/perf-baseline.cjs --runs=3 --stage --out=.tmp-perf/before.json
```

Expected：终端打印 run 1..3 摘要；首屏图片请求数约 32（4 张场景图 + 28 张立绘）；异常列表为空或仅字体警告。若 5199 被占用换 5198 并同步 URL 参数。

- [ ] **Step 3: 写基线文档（先只填基线列）**

创建 `docs/perf-baseline.md`：

```markdown
# 首屏性能基线（P0-5）

**采集方式**：`PORT=5199 node serve.js` + `node tools/perf-baseline.cjs --runs=3 --stage`
**环境**：headless Edge（本机），1440×900，DPR 1，`Network.setCacheDisabled(true)` 冷加载；本地服务器无 gzip、无缓存头。每项 3 次取中位数。
**指标口径**：首屏可交互 = 导航开始 → `load` 完成 + 字体就绪 + 连续两帧 rAF；体积 = `transferSize` 按类型汇总；FPS = 首页夕阳 / 舞台采样 3 秒。

| 指标 | 基线（P0-5 改动前） | 懒加载后 | 变化 |
|---|---|---|---|
| 首屏可交互（ms） | <before.json ready> | — | — |
| load（ms） | <before.json load> | — | — |
| 首屏请求数 | <requests> | — | — |
| 首屏图片请求数 | <imageCount> | — | — |
| 首屏总字节（KB） | <total> | — | — |
| JS 字节（KB） | <bytes.js> | — | — |
| 图片字节（KB） | <bytes.image> | — | — |
| 首页 FPS | <fpsHome.avgFps> | — | — |
| 舞台 FPS | <fpsStage.avgFps> | — | — |

**如何复跑**：`PORT=5199 node serve.js &`，然后 `node tools/perf-baseline.cjs --runs=3 --stage --out=.tmp-perf/after.json`。数字随机器与 Edge 版本变化，对比只认同一台机器同一会话内的前后差值。
```

把 `.tmp-perf/before.json` 的实际数字填进「基线」列（不要目测）。

- [ ] **Step 4: 跑测试与提交**

Run: `node --test tests/*.test.mjs`
Expected: PASS，302 tests，0 fail（本任务不新增测试）。

```bash
git add tools/perf-baseline.cjs docs/perf-baseline.md
git commit -m "perf(P0-5): 首屏性能基线采集器与基线数字"
```

---

### Task 2: 立绘改为首页空闲后分批预加载

**Files:**
- Modify: `scripts/portraits.js`（`preloadPortraits` 附近，约 60–78 行）
- Modify: `scripts/main.js:9`（import）与 `scripts/main.js:22`（启动调用）
- Test: `tests/perf-loading.test.mjs`

**Interfaces:**
- Produces: `planPortraitBatches(keys, size = 4) => string[][]`；`schedulePortraitPreload() => void`（`window load` 后按批空闲加载，幂等）。
- Consumes: 既有 `PORTRAITS`、`images`、`makeFaded`。

- [ ] **Step 1: 写失败测试**

创建 `tests/perf-loading.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planPortraitBatches } from '../scripts/portraits.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('planPortraitBatches：每批 4 张，末批可不足', () => {
  assert.deepEqual(planPortraitBatches(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']), [
    ['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h'], ['i'],
  ]);
  assert.deepEqual(planPortraitBatches([], 4), []);
  assert.deepEqual(planPortraitBatches(['x'], 4), [['x']]);
});

test('main.js：启动期改为空闲分批预加载立绘', () => {
  const src = read('scripts/main.js');
  assert.match(src, /schedulePortraitPreload\(\)/);
  assert.doesNotMatch(src, /^preloadPortraits\(\);$/m);
});

test('portraits.js：空闲调度使用 requestIdleCallback，且保留全量导出', () => {
  const src = read('scripts/portraits.js');
  assert.match(src, /requestIdleCallback/);
  assert.match(src, /export function schedulePortraitPreload/);
  assert.match(src, /export function preloadPortraits/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/perf-loading.test.mjs`
Expected: FAIL（`planPortraitBatches` 未导出）。

- [ ] **Step 3: 改 `portraits.js`**

把现有 `preloadPortraits` 替换为：

```js
const PORTRAIT_IDLE_BATCH = 4;

/** 把 keys 按 size 切成批次（纯函数，供单测）。 */
export function planPortraitBatches(keys, size = PORTRAIT_IDLE_BATCH) {
  const out = [];
  for (let i = 0; i < keys.length; i += size) out.push(keys.slice(i, i + size));
  return out;
}

function loadPortrait(key) {
  if (images.has(key)) return;               // 显式全量预加载与空闲分批可能并存，避免重复请求
  const img = new Image();
  img.decoding = 'async';
  const entry = { img, faded: null, ready: false };
  images.set(key, entry);
  img.onload = () => makeFaded(key, img);
  img.onerror = () => console.error('立绘加载失败', PORTRAITS[key].src);
  img.src = PORTRAITS[key].src;
}

/** 显式全量预加载（调试 / 测试用；正常启动走 schedulePortraitPreload）。 */
export function preloadPortraits() {
  for (const key of Object.keys(PORTRAITS)) loadPortrait(key);
}

function atIdle(fn, timeout) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout });
  else setTimeout(fn, 60);
}

/** 首页首帧之后再分批预加载立绘：不阻塞首屏可交互。 */
export function schedulePortraitPreload() {
  const batches = planPortraitBatches(Object.keys(PORTRAITS));
  const start = () => {
    let i = 0;
    const next = () => {
      const batch = batches[i++];
      if (!batch) return;
      for (const key of batch) loadPortrait(key);
      atIdle(next, 300);
    };
    atIdle(next, 1200);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
```

- [ ] **Step 4: 改 `main.js`**

- 第 9 行 import 改为：
  `import { schedulePortraitPreload } from './portraits.js';`
- 第 22 行 `preloadPortraits();` 改为：
  `schedulePortraitPreload();`

- [ ] **Step 5: 跑测试**

Run: `node --test tests/*.test.mjs`
Expected: PASS，305 tests（302 + 3），0 fail。

- [ ] **Step 6: 浏览器验证加载时机**

```bash
PORT=5199 node serve.js &
sleep 1
node tools/perf-baseline.cjs --runs=1 --out=.tmp-perf/t2.json
```

Expected：首屏图片请求数从约 32 降到 4（只剩 scene.js 尚未改的 4 张场景图）；无异常；首页 FPS 不低于基线太多。

再用现成的 `tools/cdp-shoot.cjs` 验证空闲加载真的完成（3.8 秒后应已分批加载完全部 28 张）：

```bash
cat > .tmp-portraits.json <<'EOF'
[
  { "navigate": "http://localhost:5199/", "wait": 3800 },
  { "eval": "performance.getEntriesByType('resource').filter(e=>e.name.includes('assets/models')).length", "label": "portraits-loaded" },
  { "eval": "performance.getEntriesByType('resource').filter(e=>/assets\\/images/.test(e.name)).length", "label": "scene-images-loaded" }
]
EOF
node tools/cdp-shoot.cjs .tmp-portraits.json
```

Expected：`portraits-loaded` = 28，`scene-images-loaded` = 4（场景图尚未懒加载，本任务不动）。

- [ ] **Step 7: 提交**

```bash
git add scripts/portraits.js scripts/main.js tests/perf-loading.test.mjs
git commit -m "perf(P0-5): 立绘改为首页空闲后分批预加载"
```

---

### Task 3: 场景大图改为首次交互后加载

**Files:**
- Modify: `scripts/scene.js`（渲染器闭包内 41–58 行与返回对象 16127 行）
- Modify: `scripts/main.js`（`showScreen` 约 60–67 行、`showLibrary` 约 212 行）
- Test: `tests/perf-loading.test.mjs`（追加两条静态断言）

**Interfaces:**
- Produces: `sceneRenderer.preloadImages()`（幂等；一次发起 4 张场景图请求）。
- Consumes: Task 2 的 `main.js` 已导入 `schedulePortraitPreload`。

- [ ] **Step 1: 追加失败测试**

在 `tests/perf-loading.test.mjs` 末尾追加：

```js
test('main.js：进舞台与打开剧本库都会请求场景大图', () => {
  const src = read('scripts/main.js');
  const hits = src.match(/sceneRenderer\.preloadImages\(\)/g) || [];
  assert.ok(hits.length >= 2, `preloadImages 调用次数应 ≥2，实际 ${hits.length}`);
});

test('scene.js：四张场景大图只在 preloadImages 内赋 src，并经渲染器暴露', () => {
  const src = read('scripts/scene.js');
  const start = src.indexOf('function preloadSceneImages');
  assert.ok(start > 0, '缺少 preloadSceneImages');
  const end = src.indexOf('function resize(', start);
  assert.ok(end > start, 'preloadSceneImages 应在 resize 之前');
  const body = src.slice(start, end);
  for (const name of ['starry.src', 'cityDay.src', 'cityNight.src', 'scoreSheet.src']) {
    assert.ok(body.includes(name), `${name} 应移入 preloadSceneImages`);
  }
  assert.doesNotMatch(src.slice(0, start), /(starry|cityDay|cityNight|scoreSheet)\.src\s*=/);
  assert.match(src, /preloadImages:\s*preloadSceneImages/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/perf-loading.test.mjs`
Expected: FAIL（`preloadImages` 尚不存在）。

- [ ] **Step 3: 改 `scene.js`**

删除 4 处初始化赋值（`starry.src = ...`、`cityDay.src = ...`、`cityNight.src = ...`、`scoreSheet.src = ...`），保留 `const starry = new Image();` 等声明与 `onload` 处理，并在第 58 行后加入：

```js
  // 场景大图按需加载：首屏不请求，进入舞台 / 打开剧本库时由 main.js 触发一次
  let sceneImagesRequested = false;
  function preloadSceneImages() {
    if (sceneImagesRequested) return;
    sceneImagesRequested = true;
    starry.src = './assets/images/starry-night.jpg';
    cityDay.src = './assets/images/lujiazui-day.png';
    cityNight.src = './assets/images/lujiazui-night.png';
    scoreSheet.src = './assets/images/pathetique-score.png';
  }
```

渲染器返回对象改为：

```js
  return { set, start, stop, resize, preloadImages: preloadSceneImages, onChange: (fn) => (onFrame = fn), get state() { return state; } };
```

- [ ] **Step 4: 改 `main.js`**

`showScreen` 中 `if (name === 'stage') { sceneRenderer.start(); sunset.stop(); }` 改为：

```js
  if (name === 'stage') { sceneRenderer.preloadImages(); sceneRenderer.start(); sunset.stop(); }
```

`showLibrary()` 开头（`openLibrary({` 之前）加一行：

```js
  sceneRenderer.preloadImages();
```

- [ ] **Step 5: 跑测试与 lint**

Run: `node --test tests/*.test.mjs`
Expected: PASS，307 tests（305 + 2），0 fail。
Run: `node tools/lint.js --builtin`
Expected: `通过：内置 15 章 未发现问题。`

- [ ] **Step 6: 浏览器验证（场景图按需 + 不缺图）**

```bash
PORT=5199 node serve.js &
sleep 1
node tools/perf-baseline.cjs --runs=1 --stage --out=.tmp-perf/t3.json
```

Expected：首屏（首页）图片请求数为 0；进入舞台后 4 张场景图被请求；无 HTTP≥400、无异常。用 `cdp-shoot` 复核：

```bash
cat > .tmp-stage.json <<'EOF'
[
  { "navigate": "http://localhost:5199/", "wait": 1500 },
  { "eval": "performance.getEntriesByType('resource').filter(e=>/assets\\/images/.test(e.name)).length", "label": "first-screen-scene-images" },
  { "eval": "document.getElementById('btn-start').click()", "wait": 600 },
  { "eval": "document.querySelector('.series-card[data-series]').click()", "wait": 400 },
  { "eval": "document.querySelector('.chapter-item[data-id]').click()", "wait": 2500 },
  { "eval": "performance.getEntriesByType('resource').filter(e=>/starry-night|lujiazui|pathetique/.test(e.name)).map(e=>e.name.split('/').pop())", "label": "stage-images" },
  { "shot": "stage-after-lazy.jpg" }
]
EOF
node tools/cdp-shoot.cjs .tmp-stage.json
```

Expected：`first-screen-scene-images` = 0；`stage-images` 含 4 个文件名（starry-night.jpg / lujiazui-day.png / lujiazui-night.png / pathetique-score.png）。

再进入用到原图的章节截图确认不破图：

```bash
cat > .tmp-starry.json <<'EOF'
[
  { "navigate": "http://localhost:5199/", "wait": 1200 },
  { "eval": "document.getElementById('btn-start').click()", "wait": 600 },
  { "eval": "document.querySelector('.series-card[data-series=\"vortex\"]').click()", "wait": 400 },
  { "eval": "document.querySelector('.chapter-item[data-id]').click()", "wait": 2500 },
  { "shot": "vortex-ch1-salon.jpg" }
]
EOF
node tools/cdp-shoot.cjs .tmp-starry.json
```

查看 `.tmp-shots/vortex-ch1-salon.jpg`：沙龙展墙《星月夜》正常显示、无空白/碎图。若第一章开场还没有沙龙墙面，可用 `browser-use` 点击推进几屏后再截图。

- [ ] **Step 7: 提交**

```bash
git add scripts/scene.js scripts/main.js tests/perf-loading.test.mjs
git commit -m "perf(P0-5): 场景大图改为首次交互后按需加载"
```

---

### Task 4: 复测、文档与回归

**Files:**
- Modify: `docs/perf-baseline.md`（补「懒加载后」列与结论）
- Modify: `README.md`（目录结构加 `tools/perf-baseline.cjs`、文档入口加性能基线）
- Modify: `AGENTS.md`（「如何运行与验证」加一行性能复跑命令）
- Modify: `docs/superpowers/specs/2026-11-23-mumu-local-creation-platform-roadmap.md`（P0-5 状态与交付说明）

- [ ] **Step 1: 复测**

```bash
PORT=5199 node serve.js &
sleep 1
node tools/perf-baseline.cjs --runs=3 --stage --out=.tmp-perf/after.json
```

Expected：首屏图片请求数 0；首屏总字节显著下降；首屏可交互不劣于基线（允许 ±5% 波动）；舞台 FPS 与基线相当（±10%）；异常 0 条。

- [ ] **Step 2: 填文档**

`docs/perf-baseline.md`：把 `after.json` 数字填进「懒加载后」列，计算变化；补 2–4 行结论（首屏少了多少 KB / 多少请求、可交互变化、FPS 是否稳定、复跑注意事项）。`README.md` 的 `tools/` 列表加：

```
tools/perf-baseline.cjs 首屏性能基线采集（headless Edge + CDP，零依赖）
```

`AGENTS.md` 的「如何运行与验证」加：

```
- 性能基线：`PORT=5199 node serve.js` 后 `node tools/perf-baseline.cjs --runs=3 --stage`；
  数字口径见 `docs/perf-baseline.md`（同机同版本 Edge 前后对比才有意义）。
```

roadmap 表中 P0-5 行改为「已完成」，并备注「基线 + 立绘/场景图懒加载；scene.js 拆分延后」。

- [ ] **Step 3: 全量回归**

Run: `node --test tests/*.test.mjs`
Expected: PASS，307 tests，0 fail。
Run: `node tools/lint.js --builtin`
Expected: `通过：内置 15 章 未发现问题。`

浏览器手动/脚本回归（`PORT=5199`）：
- 首页 → 选择剧本（四张曲目卡）→ 章节列表 →《蝉鸣》第一章开演，走到第一个选项并继续两屏；
- 《漩涡》第一章（沙龙《星月夜》显示正常）与《月光》第三章（陆家嘴白天显示正常）；
- 保存进度 → 刷新 → 读档 → 舞台恢复且场景图正常；
- 控制台无错误、无 404；首页 / 剧本库 / 舞台截图与改动前对比无布局变化（夕阳动画帧不要求逐像素一致）。

- [ ] **Step 4: 提交**

```bash
git add docs/perf-baseline.md README.md AGENTS.md docs/superpowers/specs/2026-11-23-mumu-local-creation-platform-roadmap.md
git commit -m "docs(P0-5): 性能前后对比、复跑入口与 roadmap 回填"
```

---

## Self-Review

- **Spec coverage**：采集口径（§2→T1）；立绘空闲分批（§3.1→T2）；场景图按需（§3.2→T3）；测试策略（§4→T2/T3 测试 + T4 回归）；验收（§5→T4 文档与对比）；不做项（§6）无任务。
- **Placeholder scan**：无 TBD / TODO；代码为字面内容；文档中的 `<before.json ...>` 是填数指令且有明确来源。
- **Type consistency**：`planPortraitBatches(keys, size=4)`、`schedulePortraitPreload()`、`preloadPortraits()`、`sceneRenderer.preloadImages()`、`preloadSceneImages()` 贯穿 spec / 计划 / 测试；测试计数 302 → 305 → 307。
