/* ============================================================
   暮幕 · 全屏 + 锁定横屏
   手机浏览器的地址栏会吃掉一大截视口，竖屏时横向分镜更是站不下人。
   标准做法只有一条路：先进全屏，再调 screen.orientation.lock('landscape')
   ——Chrome 系（安卓 Chrome / Edge / 部分国产壳）在非全屏时一定拒绝 lock，
   所以顺序不能反。iPhone Safari 与微信 iOS 两个 API 都没有（既不能
   全屏也不能锁方向），因此所有能力都走特性检测，缺就退回文案引导，
   绝不放一个点了没反应的按钮。
   纯判定（pick* / supports* / shouldShowButton / enterNotice / exitNotice）
   与控制器分开，单测只喂假对象，不碰真 DOM。
   ============================================================ */

import { isPhone } from './rotate-hint.js';

export const REQUEST_NAMES = ['requestFullscreen', 'webkitRequestFullscreen', 'msRequestFullscreen'];
export const EXIT_NAMES = ['exitFullscreen', 'webkitExitFullscreen', 'msExitFullscreen'];
export const CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'];

function pick(names, obj) {
  if (!obj) return null;
  for (const name of names) if (typeof obj[name] === 'function') return name;
  return null;
}

/** 元素上可用的全屏方法名（没有则 null）。 */
export function pickRequest(doc) {
  return pick(REQUEST_NAMES, doc && doc.documentElement);
}

/** document 上可用的退出方法名。 */
export function pickExit(doc) {
  return pick(EXIT_NAMES, doc);
}

/** 请求与退出都得在才算能全屏：iOS Safari 只有半套，点了什么也不会发生。 */
export function supportsFullscreen(doc) {
  return !!(pickRequest(doc) && pickExit(doc));
}

/** 方向锁定：iPhone 上 orientation 存在但没有 lock。 */
export function supportsOrientationLock(screen) {
  const o = screen && screen.orientation;
  return !!(o && typeof o.lock === 'function');
}

/** 当前占着全屏的元素（认带前缀的属性）。 */
export function currentFullscreenElement(doc) {
  if (!doc) return null;
  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
}

/**
 * 是不是手机/平板这类触摸设备。
 * 尺寸阈值在横屏真机上会漏（实测横屏 CSS 视口约 1400×524，短边 524 > 500），
 * 所以首选 pointer:coarse，拿不到媒体特性时才退回短边判断。
 */
export function isMobileViewport(win = window) {
  const w0 = win || {};
  const w = w0.innerWidth || 0;
  const h = w0.innerHeight || 0;
  // 尺寸全 unknown 时不能当成手机，否则桌面调试会莫名多出按钮
  const small = w > 0 && h > 0 && isPhone(w, h);
  const mm = w0.matchMedia && w0.matchMedia('(pointer: coarse)');
  if (mm && typeof mm.matches === 'boolean') return mm.matches || small;
  return small;
}

/**
 * 顶上那颗 ⛶ 只在横屏手机露出来：
 * - 竖屏时「请横屏体验」面板已经有全屏主按钮，顶栏在 390 宽只剩 24px 余量；
 * - 桌面有 F11，多一个按钮只是噪声（AGENTS.md 要求桌面外观不变）。
 */
export function shouldShowButton({ supported, mobile, w, h }) {
  return !!supported && !!mobile && w > h;
}

export function enterNotice({ entered, locked, phone }) {
  if (entered && locked) return null;
  if (entered) return phone ? '已进入全屏 · 这个浏览器不会自动转横屏，请把手机横过来' : null;
  return phone
    ? '全屏没有被允许，请在浏览器菜单里选「全屏」再试'
    : '全屏请求被浏览器拒绝了';
}

export function exitNotice({ locked }) {
  return locked ? '已退出全屏，横屏锁定已解除。' : null;
}

/**
 * 全屏开关。
 * @param {{doc?:Document, win?:Window, onNotice?:(msg:string)=>void, onState?:()=>void}} [options]
 */
export function createFullscreenController({
  doc = document, win = window, onNotice = () => {}, onState = () => {},
} = {}) {
  let locked = false;      // 我们成功锁过横屏（退出全屏时要说一句）
  let active = false;      // 当前是否在全屏里
  let hush = false;        // 自己按退出触发的 fullscreenchange，不再重复提示

  const phoneNow = () => isMobileViewport(win);
  const notify = (msg) => { if (msg) onNotice(msg); };

  function sync() {
    const now = !!currentFullscreenElement(doc);
    if (!now && locked) {
      if (!hush) notify(exitNotice({ locked: true }));
      locked = false;
    }
    hush = false;
    active = now;
    onState();
  }

  const onChange = () => { sync(); };

  /**
   * 进全屏并尝试锁横屏。
   * @param {{quiet?:boolean}} [options] quiet：把话留给调用方说（横屏引导面板自己就地提示）
   * @returns {Promise<{entered:boolean, locked:boolean, already?:boolean, reason?:string}>}
   */
  async function enter(options = {}) {
    const quiet = !!options.quiet;
    if (!supportsFullscreen(doc)) {
      if (!quiet) notify(enterNotice({ entered: false, locked: false, phone: phoneNow() }));
      return { entered: false, locked: false, reason: 'unsupported' };
    }
    if (active || currentFullscreenElement(doc)) {
      active = true;
      return { entered: true, locked, already: true };
    }
    const el = doc.documentElement;
    try {
      await el[pickRequest(doc)].call(el, { navigationUI: 'hide' });
    } catch (e) {
      active = false;
      if (!quiet) notify(enterNotice({ entered: false, locked: false, phone: phoneNow() }));
      onState();
      return { entered: false, locked: false, reason: 'refused' };
    }
    // 请求成功就认全屏：各家 fullscreenElement 的更新时机不一致
    active = true;
    if (supportsOrientationLock(win.screen)) {
      try {
        await win.screen.orientation.lock('landscape');
        locked = true;
      } catch (e) {
        locked = false; // 微信安卓、部分旧内核会拒：全屏仍生效，剩下靠手动转屏
      }
    }
    if (!quiet) notify(enterNotice({ entered: true, locked, phone: phoneNow() }));
    onState();
    return { entered: true, locked };
  }

  async function exit() {
    hush = true;
    if (locked && win.screen && win.screen.orientation && typeof win.screen.orientation.unlock === 'function') {
      try { win.screen.orientation.unlock(); } catch (e) { /* 解不开也会随全屏退出失效 */ }
      locked = false;
    }
    const fn = pickExit(doc);
    if (fn) {
      try { await doc[fn](); } catch (e) { hush = false; }
    }
    active = !!currentFullscreenElement(doc);
    onState();
    return { active, entered: true, locked: false };
  }

  function toggle() {
    return active || currentFullscreenElement(doc) ? exit() : enter();
  }

  CHANGE_EVENTS.forEach((name) => {
    if (doc && typeof doc.addEventListener === 'function') doc.addEventListener(name, onChange);
  });

  return {
    get available() { return supportsFullscreen(doc); },
    get canLock() { return supportsOrientationLock(win.screen); },
    get active() { return active; },
    get locked() { return locked; },
    /** 顶栏那颗按钮此刻该不该出现（横屏手机 + 浏览器支持全屏）。 */
    get shouldShow() {
      return shouldShowButton({
        supported: supportsFullscreen(doc),
        mobile: isMobileViewport(win),
        w: win.innerWidth || 0,
        h: win.innerHeight || 0,
      });
    },
    enter,
    exit,
    toggle,
    dispose() {
      CHANGE_EVENTS.forEach((name) => {
        if (doc && typeof doc.removeEventListener === 'function') doc.removeEventListener(name, onChange);
      });
    },
  };
}
