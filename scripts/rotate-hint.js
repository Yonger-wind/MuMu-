/* ============================================================
   暮幕 · 横屏引导
   舞台是横向分镜（人物站在对话框左右两侧），手机竖屏会把立绘与
   文字一起挤掉。这里只在「竖屏 + 手机尺寸」时盖一层提示，
   用户可以选「仍以竖屏继续」，同一标签页内不再重复打扰。
   纯判定拆成 shouldPrompt / isPhone，便于单测（不碰 DOM）。
   ============================================================ */

export const DISMISS_KEY = 'mumu.rotate.dismiss';
/** 短边不超过这个像素才当成手机：桌面的窄窗口不该被提示拦住。 */
export const PHONE_SHORT_EDGE = 500;

export function isPhone(w, h) {
  return Math.min(w, h) <= PHONE_SHORT_EDGE;
}

export function shouldPrompt(w, h) {
  return w <= h && isPhone(w, h);
}

/** 当前是否竖屏：优先用 orientation 媒体特性，退回用宽高比较。 */
export function isPortrait(win = window) {
  const mm = win.matchMedia && win.matchMedia('(orientation: portrait)');
  if (mm) return !!mm.matches;
  const vw = win.innerWidth || 0;
  const vh = win.innerHeight || 0;
  return vh > vw;
}

function store(get) {
  try {
    const s = get();
    if (!s) return null;
    return {
      read: () => s.getItem(DISMISS_KEY),
      write: () => s.setItem(DISMISS_KEY, '1'),
      clear: () => s.removeItem(DISMISS_KEY),
    };
  } catch (e) {
    return null; // 隐私模式下 sessionStorage 会抛：当作「不记忆」，提示照常
  }
}

export function createRotateHint({ win = window, doc = document } = {}) {
  const mem = store(() => win.sessionStorage);
  let el = null;
  let btn = null;

  function ensure() {
    if (el || !doc.body) return el;
    el = doc.createElement('div');
    el.className = 'mumu-rotate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '建议横屏体验');
    el.hidden = true;
    el.innerHTML = [
      '<div class="mumu-rotate__inner">',
      '  <div class="mumu-rotate__phone" aria-hidden="true"><i></i></div>',
      '  <p class="mumu-rotate__title">请横屏体验</p>',
      '  <p class="mumu-rotate__sub">舞台是横向分镜，横屏才站得下人物与对白。</p>',
      '  <button type="button" class="mumu-rotate__skip">仍以竖屏继续</button>',
      '</div>',
    ].join('');
    btn = el.querySelector('.mumu-rotate__skip');
    btn.addEventListener('click', () => {
      if (mem) mem.write();
      hide();
    });
    doc.body.appendChild(el);
    return el;
  }

  function show() {
    if (!ensure()) return;
    if (el.hidden) {
      el.hidden = false;
      if (btn) btn.focus({ preventScroll: true });
    }
  }

  function hide() {
    if (el) el.hidden = true;
  }

  function refresh() {
    const portrait = isPortrait(win);
    if (!portrait) {
      // 转成横屏就是回到了设计意图：清掉「不提醒」的记忆，
      // 下次再竖屏时还能问一次
      if (mem) mem.clear();
      hide();
      return;
    }
    if (!isPhone(win.innerWidth || 0, win.innerHeight || 0)) { hide(); return; }
    if (mem && mem.read()) { hide(); return; }
    show();
  }

  const mm = win.matchMedia && win.matchMedia('(orientation: portrait)');
  const onMm = () => refresh();
  if (mm) {
    if (typeof mm.addEventListener === 'function') mm.addEventListener('change', onMm);
    else if (typeof mm.addListener === 'function') mm.addListener(onMm);
  }
  win.addEventListener('resize', refresh);
  win.addEventListener('orientationchange', refresh);
  refresh();

  return {
    refresh,
    get shown() { return !!el && !el.hidden; },
    dispose() {
      win.removeEventListener('resize', refresh);
      win.removeEventListener('orientationchange', refresh);
      if (mm && typeof mm.removeEventListener === 'function') mm.removeEventListener('change', onMm);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      el = null;
      btn = null;
    },
  };
}
