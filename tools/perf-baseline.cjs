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
