/* ============================================================
   暮幕 · 环形剧目轮播（Canvas 无关，纯 DOM / CSS 3D）
   取自工作区 script-select 的 cover-flow 引擎，收敛为游戏内可复用模块：
   - 弧面全景：卡片向观察者微鼓，两侧按景深压暗；
   - 拖拽 / 滚轮 / 方向键 / Home / End；进入时轻微上浮；
   - 只保留 dom 舞台，不带调试参数面板；
   - destroy() 可完整回收 RAF、监听与观察器。
   ============================================================ */

const PRESETS = {
  panorama: { axis: 'y', tilt: 0, perspective: 0, curve: 1, spread: 1, inward: true, billboard: false, backfaces: false, window: 0 },
  cylinder: { axis: 'y', tilt: -5, perspective: 2500, curve: 1, spread: 1, inward: false, billboard: false, backfaces: true, window: 0 },
};
const INTRO_LENGTH = { assemble: 1500, rise: 1400, spin: 1800, none: 0 };
const TILES = 6, OVERLAP = 2.5, DRAG_THRESHOLD = 5;
const SPRING = 118, SETTLE_SPEED = 9, CAPTION_SPACE = 0, TO_RAD = Math.PI / 180;
const RUBBER = 0.32;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const easeOut = (t) => 1 - Math.pow(1 - t, 4);
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const rotateX = (p, d) => { const r = d * TO_RAD, c = Math.cos(r), s = Math.sin(r); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
const rotateY = (p, d) => { const r = d * TO_RAD, c = Math.cos(r), s = Math.sin(r); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };

export function createCarousel(mount, items, settings, hooks = {}) {
  const count = items.length;
  const st = {
    angle: 0, velocity: 0, target: null, dir: -1, press: null, drag: false, hover: false,
    pointer: { inside: false, x: 0, y: 0 }, yaw: 0, pitch: 0, intro: null, introDone: false,
    holdUntil: 0, stepAt: 0, suppressClick: false, wheelTimer: 0, fit: 1, shift: 0, drop: 0, last: 0,
    paused: false, destroyed: false,
  };
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let active = -1;
  let raf = 0, visible = true;
  const cardEls = [];

  /* ---- 几何 ---- */
  function geom() {
    const shape = PRESETS[settings.preset] ? settings.preset : 'panorama';
    const layout = PRESETS[shape];
    const cardW = Math.max(40, settings.cardWidth);
    const cardH = cardW / clamp(settings.aspect, 0.2, 5);
    const along = layout.axis === 'x' ? cardH : cardW;
    const curve = layout.billboard ? 0 : clamp(settings.curve, 0, 1);
    const ring = settings.mode === 'ring';
    const step = ring ? 360 / count : clamp(settings.arcStep, 8, 120);
    const srad = step * TO_RAD;
    const pitch = (along + settings.gap) * layout.spread;
    const chord = pitch / (2 * Math.sin(srad / 2));
    const arcLen = pitch / srad;
    const radius = Math.max(chord + (arcLen - chord) * curve, along * 0.6);
    return {
      shape, layout, axis: layout.axis, ring, cardW, cardH, along, curve, step, radius,
      tilt: settings.tilt ?? layout.tilt,
      perspective: layout.inward ? radius * clamp(settings.panZoom, 1, 8) : settings.perspective,
      lo: ring ? -Infinity : -(count - 1) * step,
      hi: ring ? Infinity : 0,
    };
  }

  function rubber(g, a) {
    if (g.ring) return a;
    if (a > g.hi) return g.hi + (a - g.hi) * RUBBER;
    if (a < g.lo) return g.lo + (a - g.lo) * RUBBER;
    return a;
  }

  const focusOf = (g, off) => clamp(1 - off / (g.step * 1.6), 0, 1);

  function apparentMag(g, world) {
    if (!g.layout.inward) return 1;
    const facing = Math.cos(world * TO_RAD);
    const d = g.perspective - (g.radius - 1) + g.radius * facing;
    return (g.perspective / d) * Math.pow(Math.max(0.02, facing), 0.5) * (1 + 0.06 * focusOf(g, Math.abs(world)));
  }

  function tileList(g) {
    const total = g.curve > 0.001 ? TILES : 1;
    const length = g.along / total;
    const bend = g.curve > 0.001 ? g.radius / g.curve : 0;
    const list = Array.from({ length: total }, (_, index) => {
      const start = index * length - (index > 0 ? OVERLAP / 2 : 0);
      const end = (index + 1) * length + (index < total - 1 ? OVERLAP / 2 : 0);
      const center = (start + end) / 2 - g.along / 2;
      const alpha = bend ? center / bend : 0;
      const shift = bend ? bend * Math.sin(alpha) : center;
      const sink = bend ? bend * (1 - Math.cos(alpha)) : 0;
      const depth = g.layout.inward ? sink : -sink;
      const turn = ((g.layout.inward ? -alpha : alpha) * 180) / Math.PI;
      const move = g.axis === 'x'
        ? `translate3d(0px, ${shift}px, ${depth}px) rotateX(${-turn}deg)`
        : `translate3d(${shift}px, 0px, ${depth}px) rotateY(${turn}deg)`;
      return { index, total, start, end, size: end - start, move, sink };
    });
    list.bulge = list.reduce((m, t) => Math.max(m, t.sink), 0);
    return list;
  }

  /* ---- DOM ---- */
  const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
  const root = div('mumu-cc');
  mount.append(root);
  const view = div('mumu-cc__view'), stage = div('mumu-cc__stage');
  const camera = div('mumu-cc__camera'), ring = div('mumu-cc__ring');
  const live = div('mumu-cc__live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  stage.append(camera);
  camera.append(ring);
  view.append(stage);
  root.append(view, live);
  root.setAttribute('role', 'region');
  root.setAttribute('aria-roledescription', 'carousel');
  root.setAttribute('aria-label', '剧本选择');
  root.tabIndex = 0;

  function box(node, b) {
    node.style.left = b.left + 'px';
    node.style.top = b.top + 'px';
    node.style.width = b.width + 'px';
    node.style.height = b.height + 'px';
  }

  function build(g) {
    const tiles = tileList(g);
    ring.textContent = '';
    cardEls.length = 0;
    items.forEach((item, index) => {
      const card = div('mumu-cc__card');
      card.dataset.mumuCcIndex = String(index);
      card.setAttribute('role', 'group');
      card.setAttribute('aria-roledescription', 'slide');
      card.setAttribute('aria-label', `${item.title}，第 ${index + 1} 部，共 ${count} 部`);

      const faces = g.layout.backfaces ? [false, true] : [false];
      for (const back of faces) {
        for (const tile of tiles) {
          const strip = back ? tile.total - 1 - tile.index : tile.index;
          const first = strip === 0, last = strip === tile.total - 1;
          const r = 'var(--mumu-cc-radius)';
          const frameRadius = g.axis === 'x'
            ? `${first ? r : 0} ${first ? r : 0} ${last ? r : 0} ${last ? r : 0}`
            : `${first ? r : 0} ${last ? r : 0} ${last ? r : 0} ${first ? r : 0}`;
          const offset = back ? g.along - tile.end : tile.start;
          const t = div('mumu-cc__tile');
          box(t, g.axis === 'x'
            ? { left: -g.cardW / 2, top: -tile.size / 2, width: g.cardW, height: tile.size }
            : { left: -tile.size / 2, top: -g.cardH / 2, width: tile.size, height: g.cardH });
          t.style.transform = tile.move + (back ? (g.axis === 'x' ? ' rotateX(180deg)' : ' rotateY(180deg)') : '');
          t.setAttribute('aria-hidden', 'true');

          const frame = div('mumu-cc__frame');
          frame.style.height = (g.axis === 'x' ? tile.size : g.cardH) + 'px';
          frame.style.borderRadius = frameRadius;

          const img = document.createElement('img');
          img.className = 'mumu-cc__photo';
          img.alt = '';
          img.draggable = false;
          img.decoding = 'async';
          img.src = item.src;
          if (item.fallback) {
            img.addEventListener('error', () => { img.src = item.fallback; }, { once: true });
          }
          box(img, g.axis === 'x'
            ? { left: 0, top: -offset, width: g.cardW, height: g.cardH }
            : { left: -offset, top: 0, width: g.cardW, height: g.cardH });

          frame.append(img);
          if (back) frame.append(div('mumu-cc__inner'));
          frame.append(div('mumu-cc__shade'));
          t.append(frame);
          card.append(t);
        }
      }

      const face = div('mumu-cc__face');
      box(face, { left: -g.cardW / 2, top: -g.cardH / 2, width: g.cardW, height: g.cardH });
      face.style.transform = `translateZ(${(g.layout.inward ? tiles.bulge + 2 : 1).toFixed(2)}px)`;
      const label = div('mumu-cc__label');
      const lt = document.createElement('span');
      lt.className = 'mumu-cc__label-t';
      lt.textContent = item.title;
      const ls = document.createElement('span');
      ls.className = 'mumu-cc__label-s';
      ls.textContent = item.badge;
      label.append(lt, ls);
      face.append(label);
      card.append(face);

      ring.append(card);
      cardEls.push(card);
    });
  }

  /* ---- 测量：把弧缩放进容器 ---- */
  function measure() {
    const g = geom();
    const rect = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return g;
    const room = settings.captions ? CAPTION_SPACE : 0;
    const width = rect.width * 0.94;
    const height = (rect.height - room) * 0.92;
    const P = g.perspective;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    if (g.layout.inward) {
      let kNear = 1;
      for (let i = 0; i < count; i++) {
        const w = i * g.step;
        if (w > 86) break;
        kNear = Math.max(kNear, apparentMag(g, w));
      }
      // 桌面按约 1.9 个卡位留边；窄屏收紧到 1.3，让正中的封面更大一些。
      const spanXIn = (g.cardW + settings.gap) * (rect.width < 720 ? 1.3 : 1.9);
      minX = -spanXIn / 2;
      maxX = spanXIn / 2;
      minY = -g.cardH * kNear / 2;
      maxY = g.cardH * kNear / 2;
    } else {
      const corners = [[-g.cardW / 2, -g.cardH / 2], [g.cardW / 2, -g.cardH / 2], [-g.cardW / 2, g.cardH / 2], [g.cardW / 2, g.cardH / 2]];
      const limit = g.ring ? (g.layout.window ? g.layout.window * g.step : 180) : (count - 1) * g.step;
      for (let a = -limit; a <= limit; a += Math.max(limit / 24, 0.001)) {
        for (const [cx, cy] of corners) {
          let p;
          if (g.axis === 'x') p = rotateY(rotateX([cx, cy, g.radius], -a), g.tilt);
          else if (g.layout.billboard) { const c = rotateY([0, 0, g.radius], a); p = rotateX([c[0] + cx, cy, c[2]], g.tilt); }
          else p = rotateX(rotateY([cx, cy, g.radius], a), g.tilt);
          p = [p[0], p[1], p[2] - g.radius];
          if (p[2] >= P * 0.95) continue;
          const k = P / (P - p[2]);
          minX = Math.min(minX, p[0] * k);
          maxX = Math.max(maxX, p[0] * k);
          minY = Math.min(minY, p[1] * k);
          maxY = Math.max(maxY, p[1] * k);
        }
      }
    }
    const spanX = Math.max(maxX - minX, 1), spanY = Math.max(maxY - minY, 1);
    st.fit = Math.min(1, width / spanX, height / spanY);
    st.shift = -((minY + maxY) / 2) * st.fit - room / 2;
    st.drop = g.axis === 'x' ? (rect.width / st.fit) * 0.55 + g.cardW : (rect.height / st.fit) * 0.55 + g.cardH;
    stage.style.perspective = P + 'px';
    stage.style.transform = `translate3d(0, ${st.shift}px, 0) scale(${st.fit})`;
    return g;
  }

  /* ---- 入场 ---- */
  function introCard(elapsed, landing, g) {
    if (!st.intro) return { radius: 1, lift: 0 };
    const type = st.intro.type;
    const reach = Math.abs(wrap(landing + st.angle));
    if (type === 'assemble') {
      const p = easeOut(clamp((elapsed - (reach / 180) * 420) / 1080, 0, 1));
      return { radius: 1 + 0.6 * (1 - p), lift: 0 };
    }
    if (type === 'rise') {
      const p = easeOutQuint(clamp((elapsed - (reach / 180) * 480) / 900, 0, 1));
      return { radius: 1, lift: (1 - p) * st.drop };
    }
    if (type === 'spin') {
      const p = easeOut(clamp(elapsed / INTRO_LENGTH.spin, 0, 1));
      return { radius: 1 + 0.28 * (1 - p), lift: 0 };
    }
    return { radius: 1, lift: 0 };
  }

  const nearest = (g, angle) => clamp(Math.round(angle / g.step) * g.step, g.lo, g.hi);

  function advance(g, dt, now) {
    if (!st.introDone) {
      if (!st.intro) {
        if (reduced || settings.intro === 'none') st.introDone = true;
        else st.intro = { type: settings.intro, start: now };
      }
      if (st.intro && now - st.intro.start >= INTRO_LENGTH[st.intro.type]) {
        st.intro = null;
        st.introDone = true;
      }
    }
    const autoplay = reduced ? 'off' : settings.autoplay;
    const paused = st.paused || (settings.pauseOnHover && st.hover) || st.drag || now < st.holdUntil;
    const cruise = autoplay === 'drift' && !paused && !st.intro ? settings.speed * st.dir : 0;
    if (!g.ring && st.introDone && !st.intro) {
      if (st.angle <= g.lo + 0.5 && st.dir < 0) st.dir = 1;
      else if (st.angle >= g.hi - 0.5 && st.dir > 0) st.dir = -1;
    }
    let busy = Boolean(st.intro) || st.drag;

    if (st.drag || st.intro) {
      st.velocity = st.drag ? st.velocity : 0;
    } else if (st.target !== null) {
      let remaining = dt;
      const damping = 2 * Math.sqrt(SPRING);
      while (remaining > 0) {
        const h = Math.min(remaining, 1 / 240);
        const accel = SPRING * (st.target - st.angle) - damping * st.velocity;
        st.velocity += accel * h;
        st.angle += st.velocity * h;
        remaining -= h;
      }
      if (Math.abs(st.target - st.angle) < 0.004 && Math.abs(st.velocity) < 0.03) {
        st.angle = st.target;
        st.velocity = 0;
        st.target = null;
      }
      busy = true;
    } else {
      const tau = 0.18 + clamp(settings.momentum, 0, 1) * 1.5;
      st.velocity += (cruise - st.velocity) * (1 - Math.exp(-dt / tau));
      st.angle += st.velocity * dt;
      if (!g.ring && (st.angle > g.hi || st.angle < g.lo)) {
        st.velocity *= 0.55;
        st.target = nearest(g, st.angle);
        st.dir = -Math.sign(st.angle - (g.lo + g.hi) / 2) || st.dir;
      } else if (cruise === 0 && settings.snap && Math.abs(st.velocity) < SETTLE_SPEED) {
        st.target = nearest(g, st.angle);
      }
      busy = busy || cruise !== 0 || Math.abs(st.velocity) > 0.01 || st.target !== null;
    }

    if (autoplay === 'step' && !paused && !st.intro && st.introDone) {
      if (!st.stepAt) st.stepAt = now + Math.max(0.5, settings.interval) * 1000;
      if (now >= st.stepAt) {
        const base = st.target ?? nearest(g, st.angle);
        const next = base + g.step * st.dir;
        if (g.ring) st.target = next;
        else if (next < g.lo || next > g.hi) { st.dir *= -1; st.target = nearest(g, base + g.step * st.dir); }
        else st.target = next;
        st.stepAt = now + Math.max(0.5, settings.interval) * 1000;
      }
      busy = true;
    } else {
      st.stepAt = 0;
    }
    if (now < st.holdUntil) busy = true;

    const ease = 1 - Math.exp(-dt / 0.35);
    const par = reduced ? 0 : clamp(settings.parallax, 0, 1);
    const aimYaw = st.pointer.inside ? st.pointer.x * par * 9 : 0;
    const aimPitch = st.pointer.inside ? -st.pointer.y * par * 6 : 0;
    st.yaw += (aimYaw - st.yaw) * ease;
    st.pitch += (aimPitch - st.pitch) * ease;
    if (Math.abs(aimYaw - st.yaw) > 0.01 || Math.abs(aimPitch - st.pitch) > 0.01) busy = true;
    return busy;
  }

  function render(g, now) {
    const elapsed = st.intro ? now - st.intro.start : 0;
    const swell = 1 + (reduced ? 0 : clamp(settings.stretch, 0, 1)) * 0.12 * Math.min(1, Math.abs(st.velocity) / 420);
    let spinOffset = 0;
    if (st.intro && st.intro.type === 'spin') spinOffset = -300 * st.dir * (1 - easeOut(clamp(elapsed / INTRO_LENGTH.spin, 0, 1)));
    else if (st.intro && st.intro.type === 'assemble') spinOffset = -32 * st.dir * (1 - easeOut(clamp(elapsed / INTRO_LENGTH.assemble, 0, 1)));
    const angle = st.angle + spinOffset;
    const R = g.radius * swell;

    if (g.axis === 'x') {
      camera.style.transform = `translate3d(0, 0, ${-R}px) rotateY(${g.tilt + st.yaw}deg) rotateX(${st.pitch}deg)`;
      ring.style.transform = `rotateX(${-angle}deg)`;
    } else if (g.layout.inward) {
      camera.style.transform = `translate3d(0, 0, ${g.radius - 1}px) rotateX(${g.tilt + st.pitch}deg) rotateY(${st.yaw}deg)`;
      ring.style.transform = `rotateY(${angle}deg)`;
    } else {
      camera.style.transform = `translate3d(0, 0, ${-R}px) rotateX(${g.tilt + st.pitch}deg) rotateY(${st.yaw}deg)`;
      ring.style.transform = `rotateY(${angle}deg)`;
    }

    for (let index = 0; index < count; index++) {
      const card = cardEls[index];
      if (!card) continue;
      const base = index * g.step;
      const world = g.ring ? wrap(base + angle) : base + angle;
      const off = Math.abs(world);
      const focus = focusOf(g, off);
      const mod = introCard(elapsed, base, g);
      const r = R * mod.radius;
      let transform;
      if (g.axis === 'x') transform = `rotateX(${-base}deg) translateZ(${r}px)`;
      else if (g.layout.inward) transform = `rotateY(${base}deg) translateZ(${-r}px)`;
      else {
        transform = `rotateY(${base}deg) translateZ(${r}px)`;
        if (g.layout.billboard) transform += ` rotateY(${-(base + angle)}deg)`;
      }
      if (mod.lift) transform += g.axis === 'x' ? ` translateX(${mod.lift}px)` : ` translateY(${mod.lift}px)`;
      if (g.layout.inward) transform += ` scale(${apparentMag(g, world).toFixed(4)})`;
      card.style.transform = transform;

      if (g.layout.inward) card.style.visibility = off > 86 ? 'hidden' : '';
      const fade = clamp(settings.depthFade, 0, 1) * Math.pow(clamp(off / 55, 0, 1), 1.15);
      card.style.setProperty('--mumu-cc-depth', fade.toFixed(3));
      card.style.setProperty('--mumu-cc-focus', focus.toFixed(3));
    }

    const raw = -st.angle / g.step;
    // 环形布局要按圈取模，否则转过一整圈后字幕与点击会一直停在最后一张
    const index = g.ring
      ? ((Math.round(raw) % count) + count) % count
      : clamp(Math.round(raw), 0, count - 1);
    if (index !== active) {
      active = index;
      if (hooks.onActive) hooks.onActive(index);
    }
    live.textContent = `${items[active] ? items[active].title : ''}，第 ${active + 1} 部，共 ${count} 部`;
  }

  function frame() {
    raf = 0;
    if (st.destroyed) return;
    const now = performance.now();
    const g = geom();
    const dt = st.last ? Math.min((now - st.last) / 1000, 0.05) : 1 / 60;
    st.last = now;
    const busy = advance(g, dt, now);
    render(g, now);
    if (busy && visible && !document.hidden) raf = requestAnimationFrame(frame);
    else st.last = 0;
  }
  function wake() {
    if (st.destroyed) return;
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  /* ---- 交互 ---- */
  function applyDirection() {
    const g = geom();
    st.dir = g.ring
      ? (settings.direction === 'right' ? 1 : -1) * (g.layout.inward ? -1 : 1)
      : -1;
  }

  function focusIndex(index) {
    const g = geom();
    let target = -clamp(index, 0, count - 1) * g.step;
    // 环形里同一张卡每 360° 出现一次：取离当前角度最近的那一圈，避免整圈空转
    if (g.ring) target += Math.round((st.angle - target) / 360) * 360;
    st.target = g.ring ? target : clamp(target, g.lo, g.hi);
    st.holdUntil = performance.now() + 2800;
    wake();
  }
  function stepBy(delta) {
    const g = geom();
    const base = st.target ?? nearest(g, st.angle);
    st.target = clamp(base - delta * g.step, g.lo, g.hi);
    st.holdUntil = performance.now() + 2800;
    wake();
  }
  function updatePointer(e) {
    const rect = root.getBoundingClientRect();
    st.pointer.x = clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    st.pointer.y = clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
  }

  root.addEventListener('pointerdown', (e) => {
    st.suppressClick = false;
    if (!settings.draggable || e.button !== 0) return;
    st.press = {
      id: e.pointerId, x: e.clientX, y: e.clientY, angle: st.angle,
      moved: false, origin: 0, samples: [{ time: performance.now(), angle: st.angle }],
    };
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { st.pointer.inside = true; updatePointer(e); }
    const press = st.press;
    if (!press || press.id !== e.pointerId) { wake(); return; }
    const g = geom();
    const delta = g.axis === 'x' ? e.clientY - press.y : e.clientX - press.x;
    const cross = g.axis === 'x' ? e.clientX - press.x : e.clientY - press.y;
    if (!press.moved) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      if (Math.abs(cross) > Math.abs(delta) * 1.2 && e.pointerType !== 'mouse') { st.press = null; return; }
      press.moved = true;
      press.origin = delta;
      st.drag = true;
      st.target = null;
      st.velocity = 0;
      root.dataset.dragging = '';
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    }
    const perPixel = 180 / (Math.PI * g.radius * st.fit);
    st.angle = rubber(g, press.angle + (delta - press.origin) * perPixel * (g.layout.inward ? -1 : 1));
    const now = performance.now();
    press.samples.push({ time: now, angle: st.angle });
    while (press.samples.length > 2 && now - press.samples[0].time > 110) press.samples.shift();
    wake();
  });
  function release(e) {
    const press = st.press;
    if (!press || press.id !== e.pointerId) return;
    st.press = null;
    if (!press.moved) return;
    st.drag = false;
    delete root.dataset.dragging;
    st.suppressClick = true;
    setTimeout(() => { st.suppressClick = false; }, 0);
    const g = geom();
    const first = press.samples[0], last = press.samples[press.samples.length - 1];
    const span = (last.time - first.time) / 1000;
    const velocity = span > 0.008 ? clamp((last.angle - first.angle) / span, -1400, 1400) : 0;
    st.velocity = velocity;
    if (Math.abs(velocity) > 60) st.dir = Math.sign(velocity);
    const coasting = settings.autoplay === 'drift' && !(settings.pauseOnHover && st.hover && e.pointerType === 'mouse');
    if (settings.snap && !coasting) {
      const tau = 0.18 + clamp(settings.momentum, 0, 1) * 1.5;
      st.target = nearest(g, st.angle + velocity * tau * 0.55);
    }
    wake();
  }
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; st.hover = true; wake(); });
  root.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') { st.hover = false; st.pointer.inside = false; }
    wake();
  });
  root.addEventListener('click', (e) => {
    if (st.suppressClick) { st.suppressClick = false; return; }
    const card = e.target.closest && e.target.closest('[data-mumu-cc-index]');
    if (!card) return;
    if (hooks.onPick) hooks.onPick(Number(card.dataset.mumuCcIndex), { source: 'click' });
  });
  root.addEventListener('wheel', (e) => {
    if (!settings.draggable) return;
    const delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;
    e.preventDefault();
    const g = geom();
    const perPixel = 180 / (Math.PI * g.radius * st.fit) * (g.layout.inward ? -1 : 1);
    st.target = null;
    st.angle = rubber(g, st.angle + delta * perPixel);
    st.velocity = clamp(delta * perPixel * 18, -1400, 1400);
    clearTimeout(st.wheelTimer);
    st.wheelTimer = setTimeout(() => {
      if (settings.snap) st.target = nearest(g, st.angle + st.velocity * 0.12);
      wake();
    }, 140);
    wake();
  }, { passive: false });
  root.addEventListener('keydown', (e) => {
    const g = geom();
    const forward = g.axis === 'x' ? 'ArrowDown' : 'ArrowRight';
    const backward = g.axis === 'x' ? 'ArrowUp' : 'ArrowLeft';
    if (e.key === forward) stepBy(1);
    else if (e.key === backward) stepBy(-1);
    else if (e.key === 'Home') focusIndex(0);
    else if (e.key === 'End') focusIndex(count - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      if (hooks.onPick) hooks.onPick(active, { source: 'key' });
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
  });

  function onVisibility() {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      st.last = 0;
    } else wake();
  }
  document.addEventListener('visibilitychange', onVisibility);

  let ro = null, io = null;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(() => { measure(); wake(); });
    ro.observe(root);
  }
  if (window.IntersectionObserver) {
    io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
        st.last = 0;
      }
    });
    io.observe(root);
  }

  /* ---- 启动 / 更新 ---- */
  function relayout(rebuild) {
    applyDirection();
    const g = geom();
    root.dataset.axis = g.axis;
    root.dataset.shape = g.shape;
    if (settings.draggable) root.dataset.draggable = '';
    else delete root.dataset.draggable;
    root.style.setProperty('--mumu-cc-radius', Math.max(0, settings.cornerRadius) + 'px');
    root.style.setProperty('--mumu-cc-fade', settings.fadeColor);
    root.style.setProperty('--mumu-cc-inner', (1 - clamp(settings.innerShade, 0, 1)).toFixed(3));
    root.dataset.tone = settings.tone;
    if (rebuild) build(g);
    const snapTarget = settings.snap ? nearest(g, st.angle) : null;
    if (!g.ring && (st.angle > g.hi || st.angle < g.lo)) {
      st.angle = clamp(st.angle, g.lo, g.hi);
      st.target = snapTarget;
    }
    measure();
    wake();
  }
  const replay = () => { st.introDone = false; st.intro = null; wake(); };
  const setReady = () => { root.dataset.ready = ''; };
  function snapTo(index) {
    const g = geom();
    st.introDone = true;
    st.intro = null;
    st.target = null;
    st.velocity = 0;
    st.angle = clamp(-clamp(index, 0, count - 1) * g.step, g.lo, g.hi);
    render(g, performance.now());
  }
  function setPaused(value) {
    st.paused = !!value;
    if (!st.paused) {
      st.holdUntil = performance.now() + 1200;
      wake();
    }
  }
  function destroy() {
    st.destroyed = true;
    cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('visibilitychange', onVisibility);
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    clearTimeout(st.wheelTimer);
    root.remove();
  }

  // 允许调用方指定默认停靠的卡片（环形按逆时针增量取角度，靠前的卡在右侧）
  const startAt = clamp(Math.round(Number(settings.startIndex) || 0), 0, Math.max(0, count - 1));
  if (startAt > 0) st.angle = -startAt * geom().step;
  relayout(true);
  render(geom(), performance.now());

  return {
    relayout, replay, setReady, snapTo, focusIndex, stepBy, wake, setPaused, destroy,
    state: st, geom,
    get active() { return active; },
    get count() { return count; },
  };
}
