/* ============================================================
   暮幕 · 滑行药丸（glide pill）
   首页右上角与剧情舞台右上角两排功能按钮的悬停编排。机制照搬容易，这里按本项目重写：
   - 药丸的左缘与右缘是两条互不相干的弹簧。往右走时右缘硬、左缘软，
     于是药丸先被"拽长"再收回来；bounce 决定收回时抖几下。
   - 深浅两套文字叠在一起，深色那层用 clip-path 裁成药丸形状，
     白药丸滑过之处字号不动、笔画当场换色——不是淡入淡切换字。
   - 按下整体压扁（另一条弹簧），键盘 :focus-visible 给药丸加描边，
     prefers-reduced-motion 下全部直接落位。
   - 进场：轨道从贴着屏幕角那一侧展开，条目错峰淡入，
     药丸等轨道铺好（420ms）后才弹进停靠位。
   约定：nav 里已有的按钮原样接管，不改 id / title / 事件，
   只在它们外面套一层 .mumu-glide__track 并补上药丸与墨层。
   ============================================================ */

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const BASE_K = 520;            // 边缘弹簧基准刚度
const PRESS_K = 700;           // 按下压扁弹簧刚度
const PRESS_C = 30;            // 按下压扁阻尼
const SUBSTEP = 1 / 240;       // 物理细分步长
const LEAD_GAIN = 0.9;         // 前端刚度增益（stretch=1 时）
const TRAIL_LOSS = 0.5;        // 后端刚度衰减（stretch=1 时）
const SQUASH_GAIN = 0.3;       // 拉长后的高度衰减系数
const SQUASH_MAX = 0.14;       // 高度衰减上限
const HOLD_MS = 420;           // 进场时等待轨道展开完

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 指数趋近（定时间常数），用于淡入淡出这类不该回弹的量。 */
export const approach = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

/**
 * 行进方向决定两条缘各自的刚度：前端硬（先撞到位）、后端软（拖尾）→ 药丸被拉长。
 * @returns {{left:number, right:number}}
 */
export function edgeStiffness(direction, stretch, base = BASE_K) {
  const s = clamp(stretch, 0, 1);
  const lead = base * (1 + LEAD_GAIN * s);
  const trail = base * (1 - TRAIL_LOSS * s);
  if (direction < 0) return { left: lead, right: trail };
  if (direction > 0) return { left: trail, right: lead };
  return { left: base, right: base };
}

/**
 * 阻尼弹簧单步（半隐式欧拉）：v 先受弹性力与阻尼力更新，再用新 v 推进位置。
 * @param {number} damping 速度衰减系数（不是阻尼比；阻尼比请换算成 2·ζ·√k）
 * @returns {{pos:number, vel:number}}
 */
export function springStep(pos, vel, target, k, damping, h) {
  const nextVel = vel + (-k * (pos - target) - damping * vel) * h;
  return { pos: pos + nextVel * h, vel: nextVel };
}

/** 横向被拉长时按比例压一点高度，最多压 14%，让药丸像橡皮而不是像面条。 */
export function stretchSquash(width, targetWidth) {
  if (!(targetWidth > 0)) return 1;
  return 1 - clamp((width / targetWidth - 1) * SQUASH_GAIN, 0, SQUASH_MAX);
}

/** 欠阻尼阻尼比 → 阻尼系数：ζ = 1 − 0.55·bounce，bounce=0 时临界阻尼不回弹。 */
export const dampingOf = (k, bounce) => 2 * (1 - 0.55 * clamp(bounce, 0, 1)) * Math.sqrt(k);

/** 克隆条目时不带走的属性：id 必须唯一，交互语义与接管标记不该出现在装饰层上。 */
const STRIP_ATTRS = ['id', 'title', 'aria-pressed', 'aria-expanded', 'aria-current', 'data-mg-item'];

function twinOf(button) {
  const twin = button.cloneNode(true);
  [twin, ...twin.querySelectorAll('*')].forEach((node) => {
    STRIP_ATTRS.forEach((name) => node.removeAttribute && node.removeAttribute(name));
  });
  twin.setAttribute('data-mg-twin', '');
  twin.setAttribute('tabindex', '-1');
  return twin;
}

/**
 * 给一个按钮组装上滑行药丸。
 * @param {HTMLElement} nav 容器（内含若干 itemSelector 按钮）
 * @param {{itemSelector?:string, restIndex?:number|null, bounce?:number,
 *          stretch?:number, intro?:boolean}} [options]
 *        itemSelector：默认首页的 .glass-btn；舞台那排传
 *          '.stage-btn:not([data-mg-twin])'（:not 是让本函数可重入）
 *        restIndex：鼠标离开后药丸停靠的下标；null = 淡出（动作按钮没有"当前页"，默认淡出）
 *        intro：playIntro() 是否播轨道揭开动画；false 则只做一次落位
 * @returns {{playIntro:Function, refresh:Function, destroy:Function, buttons:HTMLElement[]}}
 */
export function createGlideNav(nav, options = {}) {
  const noop = () => {};
  const cfg = { itemSelector: '.glass-btn:not([data-mg-twin])', restIndex: null, bounce: 0.22, stretch: 0.64, intro: true, ...options };
  const buttons = nav ? Array.from(nav.querySelectorAll(cfg.itemSelector)) : [];
  if (!buttons.length) return { playIntro: noop, refresh: noop, destroy: noop, buttons: [] };

  const reduce = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------- 搭结构 ---------------- */
  nav.classList.add('mumu-glide');
  const track = document.createElement('div');
  track.className = 'mumu-glide__track';
  nav.insertBefore(track, buttons[0]);
  buttons.forEach((b) => track.appendChild(b));

  const pill = document.createElement('span');
  pill.className = 'mumu-glide__pill';
  pill.setAttribute('aria-hidden', 'true');

  const ink = document.createElement('div');
  ink.className = 'mumu-glide__ink';
  ink.setAttribute('aria-hidden', 'true');
  const twins = buttons.map((b) => {
    const cell = document.createElement('span');
    cell.className = 'mumu-glide__ink-item';
    cell.appendChild(twinOf(b));
    ink.appendChild(cell);
    return cell;
  });

  track.append(pill, ink);
  // 样式接管点：CSS 只认 data-mg-item，不认具体按钮类名，所以 .glass-btn 与
  // .stage-btn 两套皮共用同一套规则。墨层克隆体身上不带这个标记（见 STRIP_ATTRS）。
  buttons.forEach((b) => b.setAttribute('data-mg-item', ''));

  /* ---------------- 物理状态 ---------------- */
  const st = {
    x0: 0, x1: 0, v0: 0, v1: 0,
    alpha: 0,          // 药丸淡入淡出
    pop: 1,            // 突然出现时先缩一下再弹回
    press: 1, pressVel: 0,
    hover: -1, focus: false, pressing: false,
    settling: false,   // 正在收尾（不让 alpha 抖动重新触发落位）
    holding: false,    // 进场等待期
  };
  const rects = [];
  let trackW = 0;
  let trackH = 0;
  let raf = 0;
  let last = 0;
  let holdTimer = 0;
  let introRunning = false;
  let killed = false;

  const restIndex = () => {
    const i = cfg.restIndex;
    return typeof i === 'number' && rects[i] ? i : -1;
  };
  const targetIndex = () => (st.hover >= 0 ? st.hover : restIndex());

  function measure() {
    // 用量测盒而不是 offsetLeft/offsetWidth：后者是取整的，墨字会跟亮字错开半像素。
    // 前提是测量时条目身上没有 transform，所以进场动画期间由 introRunning 挡住重测。
    const base = track.getBoundingClientRect();
    trackW = base.width;
    trackH = base.height;
    buttons.forEach((b, i) => {
      const r = b.getBoundingClientRect();
      const rect = { left: r.left - base.left, width: r.width };
      rects[i] = rect;
      twins[i].style.left = `${rect.left}px`;
      twins[i].style.width = `${rect.width}px`;
    });
  }

  function sync() {
    const lit = st.hover;
    buttons.forEach((b, i) => b.toggleAttribute('data-lit', i === lit));
    nav.toggleAttribute('data-mg-focus', st.focus && lit >= 0);
  }

  function render() {
    const width = Math.max(0, st.x1 - st.x0);
    const scale = st.press * st.pop;
    const target = rects[targetIndex()];
    const squash = target ? stretchSquash(width, target.width) : 1;
    pill.style.width = `${width}px`;
    pill.style.transform = `translate3d(${st.x0}px, 0, 0) scale(${scale}, ${scale * squash})`;
    pill.style.opacity = `${st.alpha}`;
    ink.style.opacity = `${st.alpha}`;

    const half = (width * scale) / 2;
    const center = (st.x0 + st.x1) / 2;
    const insetY = (trackH * (1 - scale * squash)) / 2;
    const radius = Math.max(0, (trackH * scale * squash) / 2);
    ink.style.clipPath =
      `inset(${insetY}px ${trackW - center - half}px ${insetY}px ${center - half}px round ${radius}px)`;
  }

  function tick(now) {
    raf = 0;
    if (killed) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const easy = reduce();
    const target = targetIndex() >= 0 && !st.holding ? rects[targetIndex()] : null;
    let busy = false;

    if (target) {
      const t0 = target.left;
      const t1 = target.left + target.width;
      if (st.alpha < 0.02 && !st.settling) {
        // 首次出现（或从完全淡出后重启）不该从上一个位置飞过来，就地长出来。
        st.x0 = t0; st.x1 = t1; st.v0 = 0; st.v1 = 0; st.pop = 0.9;
      }
      if (easy) {
        st.x0 = t0; st.x1 = t1; st.v0 = 0; st.v1 = 0;
      } else {
        const dir = Math.sign((t0 + t1) / 2 - (st.x0 + st.x1) / 2);
        const k = edgeStiffness(dir, cfg.stretch);
        const c0 = dampingOf(k.left, cfg.bounce);
        const c1 = dampingOf(k.right, cfg.bounce);
        const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
        const h = dt / steps;
        for (let i = 0; i < steps; i += 1) {
          const a = springStep(st.x0, st.v0, t0, k.left, c0, h);
          st.x0 = a.pos; st.v0 = a.vel;
          const b = springStep(st.x1, st.v1, t1, k.right, c1, h);
          st.x1 = b.pos; st.v1 = b.vel;
        }
      }
      st.alpha = easy ? 1 : approach(st.alpha, 1, 0.06, dt);
      busy =
        Math.abs(st.x0 - t0) > 0.05 || Math.abs(st.x1 - t1) > 0.05 ||
        Math.abs(st.v0) > 0.5 || Math.abs(st.v1) > 0.5 || st.alpha < 0.999;
      if (!busy) st.settling = false;
    } else {
      st.alpha = easy ? 0 : approach(st.alpha, 0, 0.07, dt);
      if (st.alpha > 0.002) busy = true;
      else st.alpha = 0;
    }

    st.pop = easy ? 1 : approach(st.pop, 1, 0.09, dt);
    if (Math.abs(1 - st.pop) > 0.001) busy = true;

    const pressTarget = st.pressing ? 0.95 : 1;
    if (easy) {
      st.press = pressTarget;
      st.pressVel = 0;
    } else {
      const p = springStep(st.press, st.pressVel, pressTarget, PRESS_K, PRESS_C, dt);
      st.press = p.pos;
      st.pressVel = p.vel;
    }
    if (Math.abs(st.press - pressTarget) > 0.0005 || Math.abs(st.pressVel) > 0.01) busy = true;

    render();
    if (busy) wake();
  }

  function wake() {
    if (killed || raf) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  }

  /* ---------------- 交互 ---------------- */
  const enter = (index) => (event) => {
    if (event && event.pointerType === 'touch') return; // 触屏不做悬停态
    st.hover = index;
    st.focus = false;
    sync();
    wake();
  };
  const leave = () => {
    if (st.focus) return;
    if (st.hover < 0) return;
    st.hover = -1;
    sync();
    wake();
  };
  const focusIn = (index) => (event) => {
    const el = event && event.target;
    const visible = !!el && el.matches && el.matches(':focus-visible');
    st.focus = visible;
    if (visible) st.hover = index;
    sync();
    wake();
  };
  const focusOut = () => {
    if (!st.focus) return;
    st.focus = false;
    st.hover = -1;
    sync();
    wake();
  };
  const pressDown = (event) => {
    if (event && event.button > 0) return;
    st.pressing = true;
    wake();
  };
  const pressUp = () => {
    if (!st.pressing) return;
    st.pressing = false;
    wake();
  };

  const bound = buttons.map((b, i) => ({
    b,
    enter: enter(i),
    focus: focusIn(i),
  }));
  bound.forEach(({ b, enter: onEnter, focus: onFocus }) => {
    b.addEventListener('pointerenter', onEnter);
    b.addEventListener('pointerdown', pressDown);
    b.addEventListener('focus', onFocus);
    b.addEventListener('blur', focusOut);
  });
  track.addEventListener('pointerleave', leave);
  window.addEventListener('pointerup', pressUp);
  window.addEventListener('pointercancel', pressUp);

  /* ---------------- 尺寸与内容变了要重新量 ---------------- */
  let resizeTimer = 0;
  function relayout() {
    if (introRunning || killed) return; // 进场动画给条目加了 translateX，那会儿量到的位置是偏的
    measure();
    render();
    wake();
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : null;
  if (observer) {
    observer.observe(track);
    buttons.forEach((b) => observer.observe(b));
  } else {
    window.addEventListener('resize', onWindowResize);
  }
  function onWindowResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(relayout, 80);
  }

  // 图标文字会被别处改掉（♪ ↔ ✕），墨层得跟着换，否则颜色翻转的位置会偏。
  let mutating = false;
  const mutator = typeof MutationObserver === 'function'
    ? new MutationObserver(() => {
        if (mutating) return;
        mutating = true;
        buttons.forEach((b, i) => {
          if (b.textContent !== twins[i].textContent) twins[i].replaceChildren(twinOf(b));
        });
        mutating = false;
        relayout();
      })
    : null;
  if (mutator) mutator.observe(track, { childList: true, subtree: true, characterData: true });

  /* ---------------- 进场 ---------------- */
  function playIntro() {
    measure();
    render();
    if (!cfg.intro || reduce()) return;
    window.clearTimeout(holdTimer);
    st.holding = true;
    introRunning = true;
    st.alpha = 0;
    st.x0 = 0;
    st.x1 = 0;
    st.v0 = 0;
    st.v1 = 0;
    const w = track.offsetWidth;
    const h = track.offsetHeight;
    // 这一组贴着屏幕右上角，所以从右侧揭开、右边的条目先亮，像从角上抽出来。
    const running = [];
    running.push(track.animate(
      [
        { clipPath: `inset(0 0 0 ${Math.max(0, w - h)}px round ${h / 2}px)` },
        { clipPath: `inset(0 0 0 0 round ${h / 2}px)` },
      ],
      { duration: 760, delay: 90, easing: EASE_OUT, fill: 'backwards' }
    ));
    const n = buttons.length;
    buttons.forEach((b, i) => {
      running.push(b.animate(
        [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: 560, delay: 200 + (n - 1 - i) * 50, easing: EASE_OUT, fill: 'backwards' }
      ));
    });
    holdTimer = window.setTimeout(() => {
      st.holding = false;
      if (targetIndex() >= 0) {
        st.alpha = 1;
        st.settling = true;
      }
      wake();
    }, HOLD_MS);
    Promise.all(running.map((a) => a && a.finished)).then(() => {
      introRunning = false;
      relayout();
    }).catch(() => { introRunning = false; });
    wake();
  }

  /* ---------------- 收尾 ---------------- */
  function destroy() {
    killed = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(holdTimer);
    window.clearTimeout(resizeTimer);
    window.removeEventListener('pointerup', pressUp);
    window.removeEventListener('pointercancel', pressUp);
    window.removeEventListener('resize', onWindowResize);
    bound.forEach(({ b, enter: onEnter, focus: onFocus }) => {
      b.removeEventListener('pointerenter', onEnter);
      b.removeEventListener('pointerdown', pressDown);
      b.removeEventListener('focus', onFocus);
      b.removeEventListener('blur', focusOut);
    });
    track.removeEventListener('pointerleave', leave);
    if (observer) observer.disconnect();
    if (mutator) mutator.disconnect();
    introRunning = false;
    if (nav.getAnimations) nav.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    pill.remove();
    ink.remove();
    buttons.forEach((b) => {
      b.removeAttribute('data-mg-item');
      b.removeAttribute('data-lit');
      nav.appendChild(b);
    });
    track.remove();
    nav.classList.remove('mumu-glide');
  }

  measure();
  sync();
  render();
  wake();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(relayout).catch(() => {});
  }

  return { playIntro, refresh: () => { measure(); sync(); render(); wake(); }, destroy, buttons };
}
