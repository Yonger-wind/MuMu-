/* ============================================================
   暮幕 · 图鉴全息卡
   从 holo-card 的卡片本体移植：弹簧倾斜、彩虹箔、覆膜、高光、
   入场扫光、手机陀螺仪。

   两条路径：
   - 内置角色 / 典藏卡：不传 fx，参数全部写死（彩虹 1 / 覆膜 0.65 /
     高光 1 / 倾斜 40° / 视差 0 / 圆角 0 / 画幅 4:5（角色卡 4:5.4）/ 斜纹 /
     只画实际星数），任何用户调节都碰不到它们。
   - 图鉴「自定义卡片」页：传 fx（面板那 12 项），只有这张卡跟着变。
   ============================================================ */

import { MAX_STARS, normalizeFx } from './custom-cards-data.js';

const REDUCED = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

const GRAIN = 'url("data:image/svg+xml,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='500' height='500'><filter id='g' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0.55 0 0 0 -0.24 0.55 0 0 0 -0.24 0.55 0 0 0 -0.24 0 0 0 0 1'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>"
) + '")';

/* 斜纹：明暗相间的 45° 细条，让彩虹只从条纹里透出来 */
const STRIPES = 'repeating-linear-gradient(-45deg, #000 0 5px, rgba(0,0,0,.25) 5px 9px, #000 9px 16px)';

const THEME = {
  '--pc-frame': 'rgba(38, 35, 46, 0.66)',
  '--pc-frame-edge': 'rgba(255, 255, 255, 0.08)',
  '--pc-frame-highlight': 'rgba(255, 255, 255, 0.07)',
  '--pc-frame-shadow': '0 22px 44px -20px rgba(0, 0, 0, 0.8), 0 6px 16px -8px rgba(0, 0, 0, 0.5)',
  '--pc-tile': 'linear-gradient(180deg, #3a3644 0%, #27242f 100%)',
  '--pc-tile-edge': 'rgba(255, 255, 255, 0.07)',
  '--pc-tile-highlight': 'rgba(255, 255, 255, 0.12)',
  '--pc-tile-shadow': '0 4px 10px -4px rgba(0, 0, 0, 0.7)',
  '--pc-ink': '#f4f4f5',
  '--pc-muted': 'rgba(244, 244, 245, 0.6)',
  '--pc-hover': 'brightness(1.12)',
  '--pc-press': 'brightness(0.8)',
  '--pc-shade': 'rgba(0, 0, 0, 0.4)',
  '--pc-blend': 'color-dodge',
  '--pc-holo-filter': 'hue-rotate(0deg)',
  '--pc-sheen': 'rgba(255, 255, 255, 0.16)',
};

/* 面板「主题 = 亮色」时换掉的一整套卡框色（只给自定义卡用） */
const THEME_LIGHT = {
  '--pc-frame': 'rgba(240, 240, 243, 0.8)',
  '--pc-frame-edge': 'rgba(24, 24, 27, 0.07)',
  '--pc-frame-highlight': 'rgba(255, 255, 255, 0.95)',
  '--pc-frame-shadow': '0 22px 44px -22px rgba(24, 24, 27, 0.3), 0 6px 16px -10px rgba(24, 24, 27, 0.16)',
  '--pc-tile': 'linear-gradient(180deg, #ffffff 0%, #f6f6f8 100%)',
  '--pc-tile-edge': 'rgba(24, 24, 27, 0.08)',
  '--pc-tile-highlight': 'rgba(255, 255, 255, 1)',
  '--pc-tile-shadow': '0 4px 10px -5px rgba(24, 24, 27, 0.25)',
  '--pc-ink': '#27272a',
  '--pc-muted': 'rgba(39, 39, 42, 0.6)',
  '--pc-hover': 'brightness(0.97)',
  '--pc-press': 'brightness(0.92)',
  '--pc-shade': 'rgba(24, 24, 27, 0.14)',
};

/* 亮底卡面的彩虹要改成压暗叠加，否则整片发白 */
const FOIL_BLEND = {
  dark: { '--pc-blend': 'color-dodge', '--pc-holo-filter': 'hue-rotate(0deg)', '--pc-sheen': 'rgba(255, 255, 255, 0.16)' },
  light: { '--pc-blend': 'multiply', '--pc-holo-filter': 'invert(1) hue-rotate(180deg)', '--pc-sheen': 'rgba(255, 255, 255, 0)' },
};

/* 箔层花纹：作为 mask-image，决定彩虹从哪些地方透出来 */
const MASKS = {
  none: 'linear-gradient(#000, #000)',
  stripes: STRIPES,
  grating: 'repeating-linear-gradient(90deg, #000 0 2px, rgba(0,0,0,.18) 2px 6px)',
  hex: 'repeating-linear-gradient(60deg, #000 0 3px, rgba(0,0,0,.3) 3px 8px), repeating-linear-gradient(-60deg, #000 0 3px, rgba(0,0,0,.3) 3px 8px)',
  dots: 'url("data:image/svg+xml,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'>"
    + [[8, 9], [30, 4], [50, 14], [18, 26], [40, 32], [6, 44], [28, 48], [52, 52], [46, 20], [22, 12]]
      .map((p) => `<circle cx='${p[0]}' cy='${p[1]}' r='3.2' fill='#000'/>`).join('')
    + '</svg>') + '")',
};
const MASK_SIZE = { none: '100% 100%', stripes: 'auto', grating: 'auto', hex: 'auto', dots: '60px 60px' };
const STAR_PATH = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="st-fill" d="' + STAR_PATH + '"/><path class="st-line" d="' + STAR_PATH + '"/></svg>';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

/** 卡片所有颜色 / 效果参数都在这里，页面只传卡牌数据。 */
function applyVars(root, card, { dimmed, compact, fx }) {
  const st = root.style;
  const set = (k, v) => st.setProperty(k, String(v));
  for (const [k, v] of Object.entries(THEME)) set(k, v);

  set('--pc-radius', '0px');
  // 角色卡改为更立式的画幅，让半身剪影不用被裁切也能占满卡面
  set('--pc-aspect', card.kind === 'character' ? '4 / 5.4' : '4 / 5');
  set('--pc-backdrop', 'transparent');
  set('--pc-holo', dimmed ? 0 : 1);
  set('--pc-foil', dimmed ? 0 : 0.65);
  set('--pc-glare', dimmed ? 0 : 1);
  set('--pc-parallax', '0px');
  set('--pc-grain', GRAIN);
  set('--pc-pattern', STRIPES);
  set('--pc-pattern-size', 'auto');
  set('--pc-holo-gain', 1.25);
  set('--pc-holo-detail', dimmed ? 0 : 1);
  set('--pc-actual', '0');
  set('--pc-photo-pos', card.photoPos || 'center bottom');
  set('--pc-scrim', 1);
  set('--pc-art', card.art || 'linear-gradient(160deg, #3a3644, #27242f)');
  set('--pc-glow', card.glow || 'rgba(255,255,255,.22)');
  set('--pc-star', compact ? '11px' : '16px');
  set('--pc-star-gap', compact ? '2px' : '6px');
  set('--pc-star-pad', '0');
  set('--pc-star-plate', 'transparent');
  set('--pc-star-fill', 'rgba(255, 238, 200, .96)');
  set('--pc-star-edge', 'rgba(255, 255, 255, .3)');
  set('--pc-star-edge-on', 'rgba(255, 250, 232, .98)');
  set('--pc-star-ghost', 'rgba(255, 255, 255, .05)');
  set('--pc-active', '0');
  set('--pc-tilt', '0');
  set('--pc-reach', '0');
  set('--pc-rotate-x', '0deg');
  set('--pc-rotate-y', '0deg');
  set('--pc-shift-x', '0px');
  set('--pc-shift-y', '0px');
  set('--pc-light-x', '50%');
  set('--pc-light-y', '50%');
  set('--pc-pointer-x', '50%');
  set('--pc-pointer-y', '50%');
  set('--pc-band-x', '50%');
  set('--pc-band-y', '50%');

  if (fx) applyFxVars(root, card, fx, { dimmed, compact });
}

/* 自定义卡：把面板那 12 项落到同一套 --pc-* 变量上。
   内置卡永远不走这里，所以卡面参数与改动前逐字一致。 */
function applyFxVars(root, card, rawFx, { dimmed, compact }) {
  const f = normalizeFx(rawFx);
  const st = root.style;
  const set = (k, v) => st.setProperty(k, String(v));
  const palette = f.theme === 'light' ? 'light' : 'dark';

  if (palette === 'light') {
    for (const [k, v] of Object.entries(THEME_LIGHT)) set(k, v);
  }
  for (const [k, v] of Object.entries(FOIL_BLEND[palette])) set(k, v);

  const hasMask = f.pattern !== 'none';
  // 覆膜强度：面板显式设了就用，没设（「自动」）则按图片是否透明底
  const foil = f.foil == null ? (card.alpha ? 0.08 : 0.3) : f.foil;

  set('--pc-radius', `${f.radius}px`);
  set('--pc-aspect', f.aspect);
  set('--pc-holo', dimmed ? 0 : f.holo);
  set('--pc-foil', dimmed ? 0 : foil);
  set('--pc-glare', dimmed ? 0 : f.glare);
  set('--pc-parallax', `${f.parallax}px`);
  set('--pc-pattern', MASKS[f.pattern] || MASKS.none);
  set('--pc-pattern-size', MASK_SIZE[f.pattern] || 'auto');
  set('--pc-holo-gain', hasMask ? 1.25 : 0.75);
  set('--pc-holo-detail', dimmed || !hasMask || palette !== 'dark' ? 0 : 1);
  set('--pc-scrim', card.name || card.identity || card.title ? 1 : 0);
  set('--pc-star', compact ? '11px' : '16px');

  if (palette === 'light') {
    // 卡面永远是图片或深色展示底（亮色只换卡框与彩虹叠加），
    // 所以星点保持奶白，只把「未点亮」的描边压深，浅色图上才不会糊成一片。
    set('--pc-star-edge', 'rgba(24, 24, 27, 0.38)');
    set('--pc-star-ghost', 'rgba(24, 24, 27, 0.16)');
  }
}

/* ==========================================================================
   弹簧引擎（照 ProfileCard.jsx 的思路）
   ========================================================================== */
export function attachEngine(root, {
  tiltStrength = 40,
  parallax = 0,
  enableTilt = true,
  enableMobileTilt = true,
  mobileTiltSensitivity = 5,
  intro = true,
  idleDrift = false,
} = {}) {
  const size = { width: root.offsetWidth || 340, height: root.offsetHeight || 425 };
  const shape = { tilt: tiltStrength, parallax };
  const x = { p: 0, v: 0, target: 0 };
  const y = { p: 0, v: 0, target: 0 };
  const light = { p: 0, target: 0 };
  let raf = 0;
  let last = 0;
  let slowUntil = 0;
  let touchId = null;
  let hovering = false;
  let gyroUntil = 0;

  const write = () => {
    const angle = enableTilt && !REDUCED ? shape.tilt : 0;
    const depth = enableTilt && !REDUCED ? shape.parallax : 0;
    const tilt = Math.min(1, Math.hypot(x.p, y.p));
    const st = root.style;
    st.setProperty('--pc-light-x', ((x.p + 1) * 0.5 * size.width).toFixed(1) + 'px');
    st.setProperty('--pc-light-y', ((y.p + 1) * 0.5 * size.height).toFixed(1) + 'px');
    st.setProperty('--pc-pointer-x', ((x.p + 1) * 50).toFixed(2) + '%');
    st.setProperty('--pc-pointer-y', ((y.p + 1) * 50).toFixed(2) + '%');
    st.setProperty('--pc-band-x', (50 + x.p * 15).toFixed(2) + '%');
    st.setProperty('--pc-band-y', (50 + y.p * 15).toFixed(2) + '%');
    st.setProperty('--pc-rotate-x', (y.p * angle).toFixed(3) + 'deg');
    st.setProperty('--pc-rotate-y', (-x.p * angle).toFixed(3) + 'deg');
    st.setProperty('--pc-shift-x', depth ? (x.p * depth).toFixed(2) + 'px' : '0px');
    st.setProperty('--pc-shift-y', depth ? (y.p * depth).toFixed(2) + 'px' : '0px');
    st.setProperty('--pc-reach', tilt.toFixed(4));
    st.setProperty('--pc-tilt', (tilt * light.p).toFixed(4));
    st.setProperty('--pc-active', light.p.toFixed(4));
  };

  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    // 详情检视：无人操作时让虚拟光源缓慢绕卡面游走，
    // 复刻参考视频里持续流动的彩虹箔；鼠标 / 陀螺仪接管时立刻让位。
    const idle = idleDrift && !REDUCED && !hovering && now > gyroUntil;
    if (idle) {
      x.target = 0.22 * Math.sin(now * 0.00052);
      y.target = 0.16 * Math.cos(now * 0.00039);
      light.target = 0.94;
    }
    const slow = now < slowUntil;
    const stiffness = slow ? 24 : 120;
    const damping = slow ? 9 : 16;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      [x, y].forEach((axis) => {
        axis.v += (stiffness * (axis.target - axis.p) - damping * axis.v) * h;
        axis.p += axis.v * h;
      });
    }
    const tau = light.target > light.p ? 0.18 : slow ? 0.9 : 0.45;
    light.p += (light.target - light.p) * (1 - Math.exp(-dt / tau));
    write();
    const moving =
      idle
      || Math.abs(x.target - x.p) > 0.0005 || Math.abs(y.target - y.p) > 0.0005
      || Math.abs(x.v) > 0.0005 || Math.abs(y.v) > 0.0005
      || Math.abs(light.target - light.p) > 0.002;
    if (moving) raf = requestAnimationFrame(frame);
    else {
      x.p = x.target; y.p = y.target; light.p = light.target;
      write(); raf = 0;
    }
  };

  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const aim = (nx, ny, on) => {
    x.target = clamp(nx, -1, 1);
    y.target = clamp(ny, -1, 1);
    light.target = on === false ? 0 : 1;
    slowUntil = 0;
    wake();
  };

  const aimAt = (ev) => {
    const r = root.getBoundingClientRect();
    if (!r.width || !r.height) return;
    aim(((ev.clientX - r.left) / r.width) * 2 - 1, ((ev.clientY - r.top) / r.height) * 2 - 1);
  };
  const release = () => aim(0, 0, false);

  const onEnter = (e) => { if (e.pointerType === 'mouse') { hovering = true; aimAt(e); } };
  const onMove = (e) => { if (e.pointerType === 'mouse' || e.pointerId === touchId) { hovering = true; aimAt(e); } };
  const onLeave = (e) => { if (e.pointerType === 'mouse') { hovering = false; release(); } };
  const onDown = (e) => { if (e.pointerType === 'mouse') return; hovering = true; touchId = e.pointerId; aimAt(e); };
  const onUp = (e) => { if (e.pointerId !== touchId) return; hovering = false; touchId = null; release(); };

  root.addEventListener('pointerenter', onEnter);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerup', onUp);
  root.addEventListener('pointercancel', onUp);

  let ro = null;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => {
      size.width = root.offsetWidth || size.width;
      size.height = root.offsetHeight || size.height;
      write();
    });
    ro.observe(root);
  }

  if (intro && !REDUCED) {
    x.p = 0.62; y.p = -0.55; light.p = 1;
    slowUntil = performance.now() + 1400;
    write(); wake();
  } else {
    write();
    if (idleDrift && !REDUCED) wake();
  }

  let listening = false;
  const onOrientation = (e) => {
    if (e.beta == null || e.gamma == null) return;
    gyroUntil = performance.now() + 1800;
    aim((e.gamma * mobileTiltSensitivity) / 150, ((e.beta - 20) * mobileTiltSensitivity) / 150);
  };
  const listen = () => {
    if (listening) return;
    listening = true;
    window.addEventListener('deviceorientation', onOrientation);
  };
  const onClick = () => {
    if (!enableMobileTilt) return;
    const M = window.DeviceOrientationEvent;
    if (M && typeof M.requestPermission === 'function') {
      M.requestPermission().then((s) => { if (s === 'granted') listen(); }).catch(() => {});
    } else {
      listen();
    }
  };
  root.addEventListener('click', onClick);

  return {
    write,
    aim,
    // 面板拖动「倾斜角度 / 视差」时热更新，不必重建卡片
    setShape({ tilt, parallax } = {}) {
      if (tilt != null && Number.isFinite(tilt)) shape.tilt = clamp(tilt, 0, 60);
      if (parallax != null && Number.isFinite(parallax)) shape.parallax = clamp(parallax, 0, 40);
      write();
    },
    replay() {
      x.p = 0.62; y.p = -0.55; light.p = 1;
      slowUntil = performance.now() + 1400; write(); wake();
    },
    destroy() {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('click', onClick);
      window.removeEventListener('deviceorientation', onOrientation);
    },
  };
}

/**
 * 构建一张卡。
 * @param {object} card 图鉴数据；自定义卡形如 { id, name, title, image, alpha, rating }
 * @param {{interactive?:boolean, intro?:boolean, compact?:boolean, dimmed?:boolean,
 *          idleDrift?:boolean, fx?:object|null, onRate?:function}} opts
 *   interactive=true 才挂弹簧引擎 / 扫光 / 陀螺仪（详情检视）。
 *   idleDrift=true 时无人操作也会缓慢游走光源，用于详情页的持续全息展示。
 *   fx = 面板那 12 项参数；不传时卡面参数与旧版逐字一致（内置卡走这条）。
 *   onRate(id, n) 自定义卡点小星星改这一张的星级（再点最亮那颗退一颗）。
 * @returns {{el:HTMLElement, engine:object|null, refs:object}}
 */
export function buildHoloCard(card, {
  interactive = false,
  intro = false,
  compact = false,
  dimmed = false,
  idleDrift = false,
  fx = null,
  onRate = null,
} = {}) {
  const isCustom = !!fx;
  const f = isCustom ? normalizeFx(fx) : null;
  const root = el('div', 'mumu-holo-card'
    + (compact ? ' mumu-holo-card--mini' : '')
    + (isCustom ? ' mumu-holo-card--custom' : ''));
  applyVars(root, card, { dimmed, compact, fx });
  if (card.kind === 'character') root.classList.add('mumu-holo-card--char');
  // 透明底图整幅放进卡面，不裁边（用户剪影素材）
  if (isCustom && card.alpha) root.classList.add('mumu-holo-card--alpha');
  const showStars = isCustom ? f.showStars : !!card.stars;
  if (showStars) root.classList.add('mumu-holo-card--stars');

  const body = el('div', 'mumu-holo-card__body');
  const tile = el('div', 'mumu-holo-card__tile');

  tile.appendChild(el('span', 'mumu-holo-card__art'));
  tile.appendChild(el('span', 'mumu-holo-card__sheen'));

  const holo = el('span', 'mumu-holo-card__holo');
  holo.appendChild(el('span', 'mumu-holo-card__holo-glow'));
  holo.appendChild(el('span', 'mumu-holo-card__holo-shift'));
  tile.appendChild(holo);

  const img = el('img', 'mumu-holo-card__photo');
  img.alt = card.name || '';
  img.draggable = false;
  img.loading = compact ? 'lazy' : 'eager';
  img.decoding = 'async';
  img.style.objectPosition = card.photoPos || 'center bottom';
  if (card.kind === 'character') img.classList.add('mumu-holo-card__photo--model');
  const fallback = el('span', 'mumu-holo-card__fallback', (card.name || (isCustom ? '卡' : '?')).slice(0, 1));
  if (isCustom && !card.image) {
    // 没有图就别发请求，直接占位（避免 404 与控制台噪音）
    img.classList.add('is-missing');
    fallback.classList.add('is-on');
  } else {
    img.src = card.image;
    img.addEventListener('error', () => { img.classList.add('is-missing'); fallback.classList.add('is-on'); });
  }
  tile.appendChild(fallback);
  tile.appendChild(img);

  tile.appendChild(el('span', 'mumu-holo-card__foil'));
  tile.appendChild(el('span', 'mumu-holo-card__scrim'));

  const info = el('div', 'mumu-holo-card__info');
  const nameEl = el('h3', 'mumu-holo-card__name');
  const titleEl = el('p', 'mumu-holo-card__title');
  nameEl.textContent = card.name || '';
  titleEl.textContent = card.identity || card.title || '';
  info.appendChild(nameEl);
  info.appendChild(titleEl);
  tile.appendChild(info);

  const starsEl = el('div', 'mumu-holo-card__stars');

  // 自定义卡的星槽：槽位数来自面板「星星颗数」（上限 MAX_STARS），
  // 实心数是该卡自己的星级；点最亮那颗退一颗。
  const renderCustomStars = (g) => {
    const slots = Math.max(1, Math.min(MAX_STARS, g.stars));
    const cur = clamp(Math.round(Number(card.rating) || 0), 0, slots);
    starsEl.style.display = g.showStars ? '' : 'none';
    starsEl.setAttribute('role', 'radiogroup');
    starsEl.setAttribute('aria-label', `星级 ${cur} / ${slots}`);
    starsEl.replaceChildren();
    for (let i = 0; i < slots; i += 1) {
      const n = i + 1;
      const star = el('button', 'mumu-holo-card__star' + (n <= cur ? ' is-on' : ''), STAR_SVG);
      star.type = 'button';
      star.dataset.n = String(n);
      star.setAttribute('role', 'radio');
      star.setAttribute('aria-checked', n <= cur ? 'true' : 'false');
      star.setAttribute('aria-label', `评 ${n} 星`);
      star.tabIndex = i === clamp(cur, 0, slots - 1) ? 0 : -1;
      if (onRate) {
        star.addEventListener('click', (e) => {
          e.stopPropagation();
          onRate(card.id, n === cur ? n - 1 : n);
        });
      }
      starsEl.appendChild(star);
    }
  };

  if (isCustom) {
    renderCustomStars(f);
  } else {
    const count = Math.max(0, Math.min(7, Math.round(Number(card.stars) || 0)));
    starsEl.setAttribute('role', 'img');
    starsEl.setAttribute('aria-label', `${count} 星`);
    for (let i = 0; i < count; i += 1) {
      const star = el('span', 'mumu-holo-card__star is-on', STAR_SVG);
      star.setAttribute('aria-hidden', 'true');
      starsEl.appendChild(star);
    }
  }
  tile.appendChild(starsEl);
  tile.appendChild(el('span', 'mumu-holo-card__tile-rim'));

  body.appendChild(tile);
  body.appendChild(el('span', 'mumu-holo-card__glare'));
  body.appendChild(el('span', 'mumu-holo-card__shade'));
  body.appendChild(el('span', 'mumu-holo-card__rim'));
  root.appendChild(body);

  if (dimmed) root.setAttribute('aria-disabled', 'true');

  const engine = interactive
    ? attachEngine(root, {
      tiltStrength: f ? f.tilt : 40,
      parallax: f ? f.parallax : 0,
      enableTilt: true,
      enableMobileTilt: true,
      mobileTiltSensitivity: 5,
      intro,
      idleDrift,
    })
    : null;

  return {
    el: root,
    engine,
    refs: {
      root, body, tile, img, fallback, info, nameEl, titleEl, starsEl,
      /**
       * 面板改参数时就地刷新这一张卡（内置卡拿不到 fx，永远不走这里）。
       * 图片增删 / 换图会改 DOM 结构，由页面重建视图，不在此处理。
       */
      setFx(nextFx) {
        if (!isCustom) return;
        const g = normalizeFx(nextFx);
        applyVars(root, card, { dimmed, compact, fx: g });
        root.classList.toggle('mumu-holo-card--stars', g.showStars);
        root.classList.toggle('mumu-holo-card--alpha', !!card.alpha);
        renderCustomStars(g);
      },
    },
  };
}
