/* Dev-only: headless Edge + CDP driver for visual checks.
   Usage: node tools/cdp-shoot.cjs steps.json
   steps: [{ "navigate": url }, { "eval": "js", "label": "x", "wait": 300, "shot": "name.jpg" }, ...]
   Screenshots are written to .tmp-shots/ (git-ignored).
   Requires Node >= 22 (global WebSocket + fetch) and Edge installed. */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const OUT = path.join(process.cwd(), '.tmp-shots');
const PROFILE = path.join(process.cwd(), '.tmp-edge');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
          const type = msg.params.type;
          if (type === 'error' || type === 'warning') {
            events.push(type + ': ' + msg.params.args.map((a) => a.value || a.description || a.type).join(' '));
          }
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          events.push('exception: ' + (msg.params.exceptionDetails.text || '') + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
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

async function main() {
  const stepsFile = process.argv[2];
  if (!stepsFile) throw new Error('需要 steps JSON 文件');
  const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  fs.rmSync(PROFILE, { recursive: true, force: true });

  const child = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1440,900',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    const target = await endpoint();
    const c = await client(target.webSocketDebuggerUrl);
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });

    for (const step of steps) {
      if (step.viewport) {
        await c.send('Emulation.setDeviceMetricsOverride', {
          width: step.viewport.width, height: step.viewport.height,
          deviceScaleFactor: 1, mobile: !!step.viewport.mobile,
        });
        await sleep(300);
      }
      if (step.navigate) {
        await c.send('Page.navigate', { url: step.navigate });
        await sleep(step.wait || 1200);
      }
      if (step.eval) {
        const r = await c.send('Runtime.evaluate', {
          expression: step.eval, awaitPromise: true, returnByValue: true,
          // gesture:true 让这次求值带真实用户激活——全屏 / 锁定横屏 / 音频解锁
          // 都只在有激活时才允许，不带就会一律 SecurityError，验不了成功路径。
          userGesture: !!step.gesture,
        });
        if (r.exceptionDetails) {
          console.error('EVAL ERROR:', r.exceptionDetails.text, r.exceptionDetails.exception && r.exceptionDetails.exception.description);
        } else {
          console.log('EVAL', step.label || '', String(JSON.stringify(r.result && r.result.value)).slice(0, 700));
        }
        await sleep(step.wait || 150);
      }
      if (step.shot) {
        const s = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
        fs.writeFileSync(path.join(OUT, step.shot), Buffer.from(s.data, 'base64'));
        console.log('SHOT', step.shot);
      }
    }
    console.log('CONSOLE', JSON.stringify(c.events));
    c.close();
  } finally {
    child.kill();
    await sleep(400);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
