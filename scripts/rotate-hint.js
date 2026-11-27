/* ============================================================
   暮幕 · 横屏引导
   舞台是横向分镜（人物站在对话框左右两侧），手机竖屏会把立绘与
   文字一起挤掉。这里只在「竖屏 + 手机尺寸」时盖一层提示，
   面板上先给「全屏并锁定横屏」（安卓 Chrome 系能真锁），再给
   「仍以竖屏继续」，同一标签页内不再重复打扰。
   纯判定拆成 shouldPrompt / isPhone / rotateInner，便于单测（不碰 DOM）。
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

/**
 * 面板内容。canFullscreen 为真时才给出「全屏并锁定横屏」这颗主按钮
 * （iPhone / 微信 iOS 没有全屏 API，给了就是颗骗人的按钮）。
 * 失败文案走 .mumu-rotate__note 就地显示：面板是 z120，提示条会被它盖住。
 */
export function rotateInner(canFullscreen) {
  return [
    '  <div class="mumu-rotate__phone" aria-hidden="true"><i></i></div>',
    '  <p class="mumu-rotate__title">请横屏体验</p>',
    '  <p class="mumu-rotate__sub">舞台是横向分镜，横屏才站得下人物与对白。</p>',
    canFullscreen ? '  <button type="button" class="mumu-rotate__fs">全屏并锁定横屏</button>' : '',
    '  <button type="button" class="mumu-rotate__skip">仍以竖屏继续</button>',
    '  <p class="mumu-rotate__note" hidden></p>',
  ].filter(Boolean).join('\n');
}

export function createRotateHint({ win = window, doc = document, fullscreen = null, onNotice = () => {} } = {}) {
  const mem = store(() => win.sessionStorage);
  const canFs = !!(fullscreen && fullscreen.available && typeof fullscreen.enter === 'function');
  let el = null;
  let btn = null;
  let fsBtn = null;
  let noteEl = null;

  function setNote(text) {
    if (!noteEl) return;
    noteEl.textContent = text || '';
    noteEl.hidden = !text;
  }

  function ensure() {
    if (el || !doc.body) return el;
    el = doc.createElement('div');
    el.className = 'mumu-rotate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', '建议横屏体验');
    el.hidden = true;
    el.innerHTML = '<div class="mumu-rotate__inner">\n' + rotateInner(canFs) + '\n</div>';
    btn = el.querySelector('.mumu-rotate__skip');
    fsBtn = el.querySelector('.mumu-rotate__fs');
    noteEl = el.querySelector('.mumu-rotate__note');
    btn.addEventListener('click', () => {
      if (mem) mem.write();
      setNote('');
      hide();
    });
    if (fsBtn) {
      fsBtn.addEventListener('click', () => {
        setNote('');
        fsBtn.disabled = true;
        Promise.resolve(fullscreen.enter({ quiet: true })).then((res) => {
          fsBtn.disabled = false;
          if (res && res.entered) {
            // 面板撤掉，后续那句话才有地方显示（提示条在面板底下）
            if (mem) mem.write();
            hide();
            if (!res.locked) {
              onNotice('已进入全屏 · 这个浏览器不会自动转横屏，请把手机横过来');
            }
            return;
          }
          setNote('这个浏览器不允许网页全屏 · 可在浏览器菜单里选「全屏」，或点下面「仍以竖屏继续」');
        }, () => {
          fsBtn.disabled = false;
          setNote('全屏没有成功，请再试一次，或点下面「仍以竖屏继续」');
        });
      });
    }
    doc.body.appendChild(el);
    return el;
  }

  function show() {
    if (!ensure()) return;
    if (el.hidden) {
      el.hidden = false;
      // 键盘/读屏进来先落在主按钮上（能全屏时是全屏，否则还是「仍以竖屏继续」）
      const first = (fsBtn && !fsBtn.hidden) ? fsBtn : btn;
      if (first) first.focus({ preventScroll: true });
    }
  }

  function hide() {
    if (el) el.hidden = true;
    setNote('');
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
