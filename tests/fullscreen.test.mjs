import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickRequest, pickExit, supportsFullscreen, supportsOrientationLock,
  currentFullscreenElement, shouldShowButton, isMobileViewport, enterNotice, exitNotice,
  createFullscreenController,
} from '../scripts/fullscreen.js';
import { rotateInner } from '../scripts/rotate-hint.js';

/* ---------------- 假浏览器：一条 log 记下调用顺序 ---------------- */

function fakeEnv({
  request = true, exit = true, prefixed = false,
  lock = 'ok', hasLock = true, w = 390, h = 844,
} = {}) {
  const log = [];
  const el = {};
  if (request !== false) {
    el.requestFullscreen = (opts) => {
      log.push({ op: 'request', opts });
      return request === 'reject' ? Promise.reject(new Error('blocked')) : Promise.resolve();
    };
    el.webkitRequestFullscreen = (opts) => { log.push({ op: 'webkit-request', opts }); return Promise.resolve(); };
  }
  if (prefixed) delete el.requestFullscreen;
  const doc = {
    documentElement: el,
    fullscreenElement: null,
    webkitFullscreenElement: null,
    listeners: {},
    addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
    removeEventListener(name, fn) {
      const arr = this.listeners[name] || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    emit(name) { return Promise.all((this.listeners[name] || []).map((fn) => fn())); },
  };
  if (exit) doc.exitFullscreen = () => { log.push({ op: 'exit' }); doc.fullscreenElement = null; return Promise.resolve(); };
  if (prefixed && exit) { delete doc.exitFullscreen; doc.webkitExitFullscreen = () => { log.push({ op: 'webkit-exit' }); return Promise.resolve(); }; }
  const orientation = {};
  if (hasLock) {
    orientation.lock = (type) => {
      log.push({ op: 'lock', type });
      if (lock === 'reject') return Promise.reject(new Error('not allowed'));
      doc.fullscreenElement = el;
      return Promise.resolve();
    };
    orientation.unlock = () => { log.push({ op: 'unlock' }); };
  }
  const win = {
    screen: { orientation },
    innerWidth: w,
    innerHeight: h,
    addEventListener() {},
    removeEventListener() {},
  };
  const ops = () => log.map((x) => x.op);
  return { doc, win, log, ops };
}

/* ---------------- 纯判定 ---------------- */

test('pickRequest / pickExit：标准名优先，退回带前缀名', () => {
  assert.equal(pickRequest(fakeEnv().doc), 'requestFullscreen');
  assert.equal(pickRequest(fakeEnv({ prefixed: true }).doc), 'webkitRequestFullscreen');
  assert.equal(pickExit(fakeEnv().doc), 'exitFullscreen');
  assert.equal(pickExit(fakeEnv({ prefixed: true }).doc), 'webkitExitFullscreen');
  assert.equal(pickExit(fakeEnv({ exit: false }).doc), null);
});

test('supportsFullscreen：请求与退出都得在才算可用', () => {
  assert.equal(supportsFullscreen(fakeEnv().doc), true);
  assert.equal(supportsFullscreen(fakeEnv({ request: false }).doc), false);
  assert.equal(supportsFullscreen(fakeEnv({ exit: false }).doc), false, 'iOS Safari 就是没有退出全屏');
  assert.equal(supportsFullscreen(null), false);
});

test('supportsOrientationLock：必须有 orientation.lock 函数', () => {
  assert.equal(supportsOrientationLock(fakeEnv().win.screen), true);
  assert.equal(supportsOrientationLock(fakeEnv({ hasLock: false }).win.screen), false, 'iPhone 上 lock 根本不存在');
  assert.equal(supportsOrientationLock({}), false);
  assert.equal(supportsOrientationLock(undefined), false);
});

test('currentFullscreenElement：认带前缀的属性', () => {
  const env = fakeEnv();
  assert.equal(currentFullscreenElement(env.doc), null);
  assert.equal(currentFullscreenElement({ webkitFullscreenElement: 'x' }), 'x');
  assert.equal(currentFullscreenElement(null), null);
});

test('shouldShowButton：横屏手机才露顶上那颗，竖屏交给「请横屏体验」面板', () => {
  assert.equal(shouldShowButton({ supported: true, mobile: true, w: 844, h: 390 }), true, '横屏手机：地址栏压画面，要给退出入口');
  assert.equal(shouldShowButton({ supported: true, mobile: true, w: 1400, h: 524 }), true, '真机横屏实测视口');
  assert.equal(shouldShowButton({ supported: true, mobile: true, w: 390, h: 844 }), false, '竖屏顶栏只有 24px 余量，塞不下第五颗');
  assert.equal(shouldShowButton({ supported: true, mobile: false, w: 1440, h: 900 }), false, '桌面不展示');
  assert.equal(shouldShowButton({ supported: true, mobile: false, w: 1000, h: 500 }), false, '窄桌面窗口也不算手机');
  assert.equal(shouldShowButton({ supported: false, mobile: true, w: 844, h: 390 }), false, 'iOS 没有全屏 API 就别给死按钮');
});

test('isMobileViewport：先看指针是不是触摸，再退回尺寸阈值', () => {
  assert.equal(isMobileViewport({ matchMedia: () => ({ matches: true }), innerWidth: 1400, innerHeight: 524 }), true, '真机横屏短边 524，尺寸阈值会漏');
  assert.equal(isMobileViewport({ matchMedia: () => ({ matches: false }), innerWidth: 1440, innerHeight: 900 }), false);
  assert.equal(isMobileViewport({ matchMedia: () => ({ matches: false }), innerWidth: 390, innerHeight: 844 }), true, '拿不到触摸信号时按尺寸兜底');
  assert.equal(isMobileViewport({ innerWidth: 390, innerHeight: 844 }), true, '没有 matchMedia 也要能判');
  assert.equal(isMobileViewport({ innerWidth: 1440, innerHeight: 900 }), false);
  assert.equal(isMobileViewport({}), false, '什么信息都没有就别乱认手机');
});

test('enterNotice：按「进没进成 / 锁没锁上」给不同中文，全成时不啰嗦', () => {
  assert.equal(enterNotice({ entered: true, locked: true, phone: true }), null);
  assert.equal(
    enterNotice({ entered: true, locked: false, phone: true }),
    '已进入全屏 · 这个浏览器不会自动转横屏，请把手机横过来'
  );
  assert.equal(enterNotice({ entered: true, locked: false, phone: false }), null, '桌面全屏不需要提横屏');
  assert.equal(
    enterNotice({ entered: false, locked: false, phone: true }),
    '全屏没有被允许，请在浏览器菜单里选「全屏」再试'
  );
  assert.match(enterNotice({ entered: false, locked: false, phone: false }), /全屏/);
});

test('exitNotice：只有解除过横屏锁定才说明一句', () => {
  assert.equal(exitNotice({ locked: true }), '已退出全屏，横屏锁定已解除。');
  assert.equal(exitNotice({ locked: false }), null);
});

/* ---------------- 控制器 ---------------- */

test('enter：先进全屏，再锁横屏（顺序不能反，Chrome 非全屏会拒绝 lock）', async () => {
  const env = fakeEnv();
  const c = createFullscreenController({ doc: env.doc, win: env.win });
  const res = await c.enter();
  assert.deepEqual(env.ops(), ['request', 'lock']);
  assert.equal(env.log[1].type, 'landscape');
  assert.deepEqual(res, { entered: true, locked: true });
  assert.equal(c.active, true);
  assert.equal(c.locked, true);
});

test('enter：带 navigationUI hide，手机地址栏也让开', async () => {
  const env = fakeEnv({ hasLock: false });
  const c = createFullscreenController({ doc: env.doc, win: env.win });
  await c.enter();
  assert.deepEqual(env.log[0].opts, { navigationUI: 'hide' });
});

test('enter：只有带前缀 API 的浏览器也走得通', async () => {
  const env = fakeEnv({ prefixed: true });
  const c = createFullscreenController({ doc: env.doc, win: env.win });
  const res = await c.enter();
  assert.deepEqual(env.ops(), ['webkit-request', 'lock']);
  assert.equal(res.locked, true);
});

test('enter：lock 被拒就是「全屏成功、没锁上」，给出手动转屏提示', async () => {
  const env = fakeEnv({ lock: 'reject' });
  const notices = [];
  const c = createFullscreenController({ doc: env.doc, win: env.win, onNotice: (m) => notices.push(m) });
  const res = await c.enter();
  assert.deepEqual(res, { entered: true, locked: false });
  assert.equal(c.locked, false, '锁不上就不能对外说已锁定');
  assert.equal(c.active, true);
  assert.deepEqual(notices, ['已进入全屏 · 这个浏览器不会自动转横屏，请把手机横过来']);
});

test('enter：全屏被拒就不再尝试锁屏', async () => {
  const env = fakeEnv({ request: 'reject' });
  const notices = [];
  const c = createFullscreenController({ doc: env.doc, win: env.win, onNotice: (m) => notices.push(m) });
  const res = await c.enter();
  assert.equal(res.entered, false);
  assert.equal(res.locked, false);
  assert.equal(c.active, false);
  assert.deepEqual(env.ops(), ['request'], '没进全屏就 lock 一定会被拒，别白试');
  assert.deepEqual(notices, ['全屏没有被允许，请在浏览器菜单里选「全屏」再试']);
});

test('enter：没有 orientation.lock 的浏览器不去调用锁屏，也不算失败', async () => {
  const env = fakeEnv({ hasLock: false });
  const c = createFullscreenController({ doc: env.doc, win: env.win });
  const res = await c.enter();
  assert.deepEqual(res, { entered: true, locked: false });
  assert.deepEqual(env.ops(), ['request']);
});

test('enter：已在全屏时不重复请求', async () => {
  const env = fakeEnv();
  const c = createFullscreenController({ doc: env.doc, win: env.win });
  await c.enter();
  const second = await c.enter();
  assert.deepEqual(second, { entered: true, locked: true, already: true });
  assert.equal(env.ops().filter((x) => x === 'request').length, 1);
});

test('exit：先解横屏锁定再退全屏，顺序反了会带着锁定退回竖屏', async () => {
  const env = fakeEnv();
  const c = createFullscreenController({ doc: env.doc, win: env.win });
  await c.enter();
  await c.exit();
  assert.deepEqual(env.ops(), ['request', 'lock', 'unlock', 'exit']);
  assert.equal(c.active, false);
  assert.equal(c.locked, false);
});

test('toggle：没全屏就进，已全屏就退', async () => {
  const env = fakeEnv();
  const c = createFullscreenController({ doc: env.doc, win: env.win });
  const a = await c.toggle();
  assert.equal(a.entered, true);
  const b = await c.toggle();
  assert.equal(b.active, false);
});

test('系统退出全屏（安卓返回键 / Esc）也要同步状态并说明一句', async () => {
  const env = fakeEnv();
  const notices = [];
  const states = [];
  const c = createFullscreenController({
    doc: env.doc, win: env.win,
    onNotice: (m) => notices.push(m), onState: () => states.push(c.active),
  });
  await c.enter();
  env.doc.fullscreenElement = null;
  await env.doc.emit('fullscreenchange');
  assert.equal(c.active, false);
  assert.equal(c.locked, false);
  assert.deepEqual(notices, ['已退出全屏，横屏锁定已解除。']);
  assert.deepEqual(states, [true, false]);
});

test('浏览器不支持全屏时 available 为假，enter 直接给出可执行的中文提示', async () => {
  const env = fakeEnv({ request: false });
  const notices = [];
  const c = createFullscreenController({ doc: env.doc, win: env.win, onNotice: (m) => notices.push(m) });
  assert.equal(c.available, false);
  const res = await c.enter();
  assert.equal(res.entered, false);
  assert.equal(res.reason, 'unsupported');
  assert.deepEqual(env.ops(), []);
  assert.equal(notices.length, 1);
});

/* ---------------- 横屏引导面板的按钮 ---------------- */

test('rotateInner：能全屏时才给出「全屏并锁定横屏」主按钮', () => {
  const withFs = rotateInner(true);
  assert.match(withFs, /mumu-rotate__fs/);
  assert.match(withFs, /全屏并锁定横屏/);
  assert.match(withFs, /mumu-rotate__skip/, '仍以竖屏继续仍在');
  assert.match(withFs, /mumu-rotate__note/, '失败要写在面板里，不能藏在提示条底下');
  const withoutFs = rotateInner(false);
  assert.doesNotMatch(withoutFs, /mumu-rotate__fs/);
  assert.match(withoutFs, /mumu-rotate__skip/);
});
