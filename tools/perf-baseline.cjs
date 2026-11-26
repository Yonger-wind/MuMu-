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
const runsArg = (argv.find((a) => a.startsWith('--runs=')) || '--runs=3').split('=')[1];
const runs = /^\d+$/.test(runsArg) ? Number(runsArg) : NaN;
if (!Number.isInteger(runs) || runs < 1) {
  console.error('--runs 需要 ≥ 1 的整数（例如 --runs=3）');
  process.exit(1);
}
const withStage = argv.includes('--stage');
const outFile = (argv.find((a) => a.startsWith('--out=')) || '').split('=')[1] || '';

const expectedPath = (() => {
  try { return new URL(url).pathname || '/'; } catch { return '/'; }
})();

const PORT_BUSY = `${PORT} 端口被其他调试实例占用，请关闭后重试`;
const LOAD_FAILED = '页面未正常加载（检查 serve.js 端口）';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const kb = (n) => Math.round(n / 1024);

/* 端口归属预检：9334 上若已有监听者（残留 Edge / 他人调试实例），直接失败，
   不 attach、不导航，避免污染别人的标签页。 */
async function assertPortFree() {
  let res = null;
  try {
    res = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(800) });
  } catch (e) {
    return; // 连接被拒 / 超时：端口空闲
  }
  if (res) throw new Error(PORT_BUSY);
}

async function endpoint() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        if (!/^about:blank/.test(page.url || '')) throw new Error(PORT_BUSY);
        return page;
      }
    } catch (e) {
      if (e && e.message === PORT_BUSY) throw e;
      /* not up yet */
    }
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
    const waiters = new Map(); // method -> [{ res, timer }]

    const waitFor = (method, timeoutMs = 20000) => new Promise((res, rej) => {
      const timer = setTimeout(() => {
        const list = waiters.get(method) || [];
        const i = list.findIndex((w) => w.timer === timer);
        if (i >= 0) list.splice(i, 1);
        rej(new Error('等待 ' + method + ' 超时'));
      }, timeoutMs);
      if (!waiters.has(method)) waiters.set(method, []);
      waiters.get(method).push({ res, timer });
    });

    ws.onopen = () => resolve({
      events,
      waitFor,
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const n = ++id;
          const timer = setTimeout(() => {
            pending.delete(n);
            rej(new Error('CDP 命令超时：' + method));
          }, 15000);
          pending.set(n, {
            res: (v) => { clearTimeout(timer); res(v); },
            rej: (e) => { clearTimeout(timer); rej(e); },
          });
          ws.send(JSON.stringify({ id: n, method, params }));
        });
      },
      close: () => ws.close(),
    });
    ws.onerror = () => reject(new Error('CDP WebSocket 连接失败'));
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg.id) {
        const list = waiters.get(msg.method);
        if (list && list.length) {
          const w = list.shift();
          clearTimeout(w.timer);
          w.res(msg.params);
        }
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

/* 每个新文档都会执行：load 之后等字体就绪 + 连续两帧 rAF，把时刻写进 window.__readyAt。
   量的是文档自己的时间轴，不含 CDP 轮询/往返开销。__navToken 用于确认探针与 load 事件
   属于同一份文档。 */
const READY_HOOK = `(() => {
  try {
    window.__navToken = Math.random().toString(36).slice(2);
    window.__readyAt = 0;
    const mark = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__readyAt = performance.now();
    }));
    window.addEventListener('load', () => {
      try {
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(mark).catch(mark);
        else mark();
      } catch (e) { mark(); }
    }, { once: true });
  } catch (e) {}
})();`;

async function assertLoaded(c) {
  const st = await evalValue(c, `({
    protocol: location.protocol,
    pathname: location.pathname,
    hasStart: !!document.getElementById('btn-start'),
    token: window.__navToken || '',
  })`);
  if (!st || st.protocol !== 'http:' || st.pathname !== expectedPath || !st.hasStart) {
    throw new Error(LOAD_FAILED + '（' + ((st && st.protocol) || '?') + ' ' + ((st && st.pathname) || '?') + '）');
  }
  return st.token || '';
}

const PROBE = `(async () => {
  for (let i = 0; i < 30; i++) {
    if (window.__readyAt) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource').map((e) => {
    let base = e.name;
    try { const u = new URL(e.name); base = u.pathname.split('/').pop() || u.pathname; } catch (err) {}
    return { name: base, type: e.initiatorType, bytes: e.transferSize || e.encodedBodySize || 0 };
  });
  return {
    ready: window.__readyAt || performance.now(),
    token: window.__navToken || '',
    ttfb: nav.responseStart || 0,
    dcl: nav.domContentLoadedEventEnd || 0,
    load: nav.loadEventEnd || 0,
    resources: res,
  };
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

/** 轮询等一个条件成立（选择层的入场动画是异步落位的，固定 sleep 会时快时慢）。 */
async function waitUntil(c, expr, timeout = 6000, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evalValue(c, expr)) return true;
    await sleep(step);
  }
  return false;
}

/**
 * 进舞台：优先走当前的环形剧目选择（真实剧本 ≤10 部），
 * 卡片多于 10 部时应用层会回退成旧的「选择剧本」陈列弹窗，两条路都支持。
 * 第一章会先播开场动画，这里按 Esc 立刻跳过——舞台帧率要和没有开场动画的
 * 上一版基线同口径，否则测的是 WebGL 开场而不是场景渲染。
 */
async function enterStage(c) {
  await evalValue(c, `document.getElementById('btn-start').click(); true`);
  await sleep(600);
  const goExpr = `(() => {
    const go = document.querySelector('[data-select-go]');
    if (!go || go.hidden || go.classList.contains('is-shift')) return false;
    go.click(); return true;
  })()`;
  if (await waitUntil(c, goExpr)) {
    const chapExpr = `(() => {
      const el = document.querySelector('.mumu-scripts__chap-main');
      if (!el) return false; el.click(); return true;
    })()`;
    if (!await waitUntil(c, chapExpr)) throw new Error('未找到章节条目');
    await sleep(500);
    await evalValue(c, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); true`);
    await sleep(900);
    return;
  }
  const hasSeries = await evalValue(c, `(() => { const el = document.querySelector('.series-card[data-series]'); if (!el) return false; el.click(); return true; })()`);
  if (!hasSeries) throw new Error('未找到曲目卡');
  await sleep(400);
  const hasChapter = await evalValue(c, `(() => { const el = document.querySelector('.chapter-item[data-id]'); if (!el) return false; el.click(); return true; })()`);
  if (!hasChapter) throw new Error('未找到章节条目');
  await sleep(900);
}

const extOf = (name) => {
  const clean = String(name).split('?')[0].split('#')[0];
  const base = clean.split('/').pop() || clean;
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : 'other';
};

function summarizeRun(r) {
  const by = {};
  let imageCount = 0;
  for (const e of r.resources) {
    const ext = extOf(e.name);
    const cat = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) ? 'image' : ext;
    by[cat] = (by[cat] || 0) + e.bytes;
    if (cat === 'image') imageCount++;
  }
  return {
    ready: r.ready, ttfb: r.ttfb, dcl: r.dcl, load: r.load,
    bytes: by, total: r.resources.reduce((a, e) => a + e.bytes, 0),
    requests: r.resources.length + 1, imageCount, // +1 = HTML 文档本身
    fpsHome: r.fpsHome, fpsStage: r.fpsStage || null,
    issues: r.issues,
  };
}

async function cleanProfile(strict) {
  for (let attempt = 0; attempt < (strict ? 2 : 1); attempt++) {
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 0 });
      return;
    } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EBUSY')) {
        if (attempt === 0 && strict) { await sleep(300); continue; }
        return; // 目录被 Edge 短暂占用，留给下次启动清理
      }
      if (strict) console.warn('清理临时用户目录失败：' + ((e && (e.code || e.message)) || e));
      return;
    }
  }
}

async function main() {
  await assertPortFree();
  await cleanProfile(false); // 上次运行的残留，EPERM/EBUSY 忽略

  let child;
  const spawned = new Promise((resolve, reject) => {
    child = spawn(EDGE, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1440,900',
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
      '--no-first-run', '--no-default-browser-check', 'about:blank',
    ], { stdio: 'ignore' });
    child.once('spawn', resolve);
    child.once('error', () => reject(new Error('无法启动 Edge（检查安装路径）')));
  });

  const results = [];
  try {
    await spawned;
    const target = await endpoint();
    const c = await client(target.webSocketDebuggerUrl);
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    await c.send('Network.enable');

    // 端口归属复核：attach 到 about:blank 之外的目标就说明不是我们的实例
    const href = await evalValue(c, 'String(location.href)');
    if (href !== 'about:blank') throw new Error(PORT_BUSY);

    await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    // 每次导航前生效：新文档一启动就装好 ready 钩子
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: READY_HOOK });

    for (let i = 0; i < runs; i++) {
      c.events.length = 0;
      await c.send('Network.clearBrowserCache');
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });

      const loadP = c.waitFor('Page.loadEventFired', 20000);
      loadP.catch(() => {}); // navigate 失败时由下面的断言报错，避免未处理拒绝
      const nav = await c.send('Page.navigate', { url });
      if (nav && nav.errorText) throw new Error(LOAD_FAILED + '（' + nav.errorText + '）');
      await loadP;

      const loadToken = await assertLoaded(c);
      const probe = await evalValue(c, PROBE);
      if (loadToken && probe.token !== loadToken) {
        throw new Error('采样期间文档被替换，本轮数据作废（可重跑）');
      }

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
    if (child && !child.killed) child.kill();
    await sleep(400);
    await cleanProfile(true);
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
    issues: results.flatMap((r, i) => r.issues.map((s) => `run ${i + 1}: ${s}`)),
    raw: results,
  };

  console.log('');
  console.log(`URL ${url} · ${runs} 次中位数 · ${summary.edge} · 冷缓存`);
  console.log(`首屏可交互  ${Math.round(summary.ready)} ms（load ${Math.round(summary.load)} ms · DCL ${Math.round(summary.dcl)} ms · TTFB ${Math.round(summary.ttfb)} ms）`);
  console.log(`首屏请求数 ${summary.requests} 个（含 HTML 文档）· 共 ${kb(summary.total)} KB · 其中图片 ${summary.imageCount} 个`);
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

main().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
