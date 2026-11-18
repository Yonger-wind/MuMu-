/* ============================================================
   暮幕 · 剧情舞台渲染器
   四个可复用场景 + 通用模块化人物 + 三种镜头
   全部程序化绘制，印象派笔触 + 像素点缀
   ============================================================ */
import { drawSilhouette, drawHandDetail, pickProp, bodySpec } from './silhouette.js';

const PALETTES = {
  dusk:  { skyTop: '#3a2350', skyMid: '#8c4a68', skyLow: '#f0a05e', ground: '#2c1d3e', glow: '#ffcf94', accent: '#ff9d57', warm: true },
  day:   { skyTop: '#7fb2d9', skyMid: '#b8d4e6', skyLow: '#ffe7c2', ground: '#3d4b3a', glow: '#fff3d6', accent: '#ffd27a', warm: true },
  night: { skyTop: '#111433', skyMid: '#2a2350', skyLow: '#5a3f6e', ground: '#161228', glow: '#cfd8ff', accent: '#9fb4ff', warm: false },
};

// 各时段的主光源位置（世界坐标比例），剪影的边缘光朝它偏移
const LIGHT_POS = {
  dusk:  { x: 0.72, y: 0.40 },
  day:   { x: 0.70, y: 0.20 },
  night: { x: 0.32, y: 0.26 },
};

const rand = (a, b) => a + Math.random() * (b - a);

export function createSceneRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let layers = null;
  let state = { scene: 'classroom', time: 'dusk', cam: 'mid', cast: [], speaker: '', focus: '', poses: {}, actions: {}, view: 'normal', propText: '' };
  let time = 0, rafId = null, running = false;
  let camera = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tz: 1 };
  let motes = [];
  let onFrame = null;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layers = null;
    motes = Array.from({ length: 40 }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: rand(0.5, 1.8),
      vx: rand(-0.12, 0.12), vy: rand(-0.2, -0.04), a: rand(0.1, 0.4), ph: Math.random() * 6.28,
    }));
  }

  /* ---------- 场景底图（预渲染一层） ---------- */
  function buildLayers() {
    layers = document.createElement('canvas');
    layers.width = canvas.width;
    layers.height = canvas.height;
    const b = layers.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    const p = PALETTES[state.time] || PALETTES.dusk;
    const horizon = H * 0.62;

    const g = b.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(0.55, p.skyMid);
    g.addColorStop(1, p.skyLow);
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);

    // 天空厚涂
    for (let i = 0; i < 500; i++) {
      const y = Math.random() * horizon;
      const t = y / horizon;
      b.strokeStyle = `rgba(255,${180 + t * 60 | 0},${140 + t * 80 | 0},${rand(0.03, 0.12)})`;
      b.lineWidth = rand(4, 12);
      b.lineCap = 'round';
      const x = Math.random() * W, len = rand(14, 46);
      b.beginPath(); b.moveTo(x, y); b.lineTo(x + len, y + rand(-6, 6)); b.stroke();
    }

    const drawer = { company: drawCompany, classroom: drawClassroom, playground: drawPlayground, ancient: drawAncient }[state.scene] || drawClassroom;
    drawer(b, p, horizon);

    // 地面
    const gg = b.createLinearGradient(0, horizon, 0, H);
    gg.addColorStop(0, p.ground);
    gg.addColorStop(1, shade(p.ground, -30));
    b.fillStyle = gg;
    b.fillRect(0, horizon, W, H - horizon);

    drawer.ground && drawer.ground(b, p, horizon);

    // 光晕
    const sunX = W * 0.7, sunY = horizon * 0.8;
    const gl = b.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(W, H) * 0.6);
    gl.addColorStop(0, hexA(p.glow, 0.4));
    gl.addColorStop(0.3, hexA(p.accent, 0.14));
    gl.addColorStop(1, hexA(p.accent, 0));
    b.globalCompositeOperation = 'lighter';
    b.fillStyle = gl;
    b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'source-over';
  }

  /* ---------- 场景：公司 ---------- */
  function drawCompany(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    // 远景城市窗格
    const bx = W * 0.55, bw = W * 0.5, by = horizon * 0.35;
    b.fillStyle = shade(p2.skyMid, -38);
    b.fillRect(bx, by, bw, horizon - by);
    for (let i = 0; i < 90; i++) {
      const wx = bx + 14 + Math.random() * (bw - 28);
      const wy = by + 14 + Math.random() * (horizon - by - 28);
      b.fillStyle = Math.random() < 0.4 ? hexA(p2.glow, rand(0.3, 0.8)) : shade(p2.skyMid, -50);
      b.fillRect(wx, wy, rand(4, 9), rand(5, 10));
    }
    b.strokeStyle = shade(p2.skyMid, -55);
    b.lineWidth = 6;
    b.strokeRect(bx, by, bw, horizon - by);
    b.beginPath(); b.moveTo(bx + bw / 2, by); b.lineTo(bx + bw / 2, horizon); b.stroke();
    // 室内：长桌与吊灯
    b.fillStyle = shade(p2.ground, 18);
    b.fillRect(0, horizon - 6, W, 6);
    b.fillStyle = shade(p2.ground, 8);
    b.beginPath();
    b.moveTo(W * 0.08, H); b.lineTo(W * 0.14, horizon + 8);
    b.lineTo(W * 0.86, horizon + 8); b.lineTo(W * 0.92, H);
    b.closePath(); b.fill();
    for (let i = 0; i < 3; i++) {
      const lx = W * (0.28 + i * 0.22);
      b.strokeStyle = hexA(p2.glow, 0.25); b.lineWidth = 1.5;
      b.beginPath(); b.moveTo(lx, 0); b.lineTo(lx, H * 0.16); b.stroke();
      const lg = b.createRadialGradient(lx, H * 0.17, 0, lx, H * 0.17, 70);
      lg.addColorStop(0, hexA(p2.glow, 0.75)); lg.addColorStop(1, hexA(p2.glow, 0));
      b.fillStyle = lg; b.beginPath(); b.arc(lx, H * 0.17, 70, 0, 6.3); b.fill();
    }
  }

  /* ---------- 场景：教室 ---------- */
  function drawClassroom(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    // 后墙与窗
    b.fillStyle = shade(p2.skyMid, -18);
    b.fillRect(0, H * 0.28, W, horizon - H * 0.28);
    // 黑板
    b.fillStyle = shade(p2.ground, 10);
    b.fillRect(W * 0.06, H * 0.3, W * 0.36, H * 0.2);
    b.strokeStyle = hexA(p2.glow, 0.5); b.lineWidth = 4;
    b.strokeRect(W * 0.06, H * 0.3, W * 0.36, H * 0.2);
    // 窗框
    const wx = W * 0.55, wy = H * 0.2, ww = W * 0.38, wh = H * 0.32;
    const skyG = b.createLinearGradient(0, wy, 0, wy + wh);
    skyG.addColorStop(0, p2.skyMid); skyG.addColorStop(1, p2.skyLow);
    b.fillStyle = skyG; b.fillRect(wx, wy, ww, wh);
    b.strokeStyle = shade(p2.ground, 30); b.lineWidth = 10;
    b.strokeRect(wx, wy, ww, wh);
    b.lineWidth = 6;
    b.beginPath(); b.moveTo(wx + ww / 2, wy); b.lineTo(wx + ww / 2, wy + wh);
    b.moveTo(wx, wy + wh / 2); b.lineTo(wx + ww, wy + wh / 2); b.stroke();
    // 窗光斜照
    b.save(); b.globalCompositeOperation = 'lighter';
    b.fillStyle = hexA(p2.glow, 0.12);
    b.beginPath(); b.moveTo(wx, wy + wh); b.lineTo(wx + ww, wy + wh * 0.4);
    b.lineTo(wx + ww * 1.5, H); b.lineTo(wx + ww * 0.4, H); b.closePath(); b.fill();
    b.restore();
    // 课桌
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 3; i++) {
        const dx = W * (0.16 + i * 0.26) + row * 30, dy = horizon + row * H * 0.13;
        const dw = 130 * (1 + row * 0.5), dh = 26 * (1 + row * 0.4);
        b.fillStyle = shade(p2.ground, 22 + row * 8);
        b.fillRect(dx - dw / 2, dy, dw, dh);
        b.fillStyle = shade(p2.ground, 6);
        b.fillRect(dx - dw / 2 + 10, dy + dh, 10, H * 0.12);
        b.fillRect(dx + dw / 2 - 20, dy + dh, 10, H * 0.12);
      }
    }
  }

  /* ---------- 场景：操场 ---------- */
  function drawPlayground(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    // 远处教学楼
    b.fillStyle = shade(p2.skyMid, -45);
    b.fillRect(0, horizon * 0.55, W * 0.42, horizon - horizon * 0.55);
    for (let i = 0; i < 40; i++) {
      const wy = horizon * 0.58 + Math.random() * (horizon * 0.4);
      b.fillStyle = Math.random() < 0.35 ? hexA(p2.glow, rand(0.3, 0.7)) : shade(p2.skyMid, -58);
      b.fillRect(30 + Math.random() * (W * 0.4 - 60), wy, 10, 12);
    }
    // 看台
    b.fillStyle = shade(p2.ground, 16);
    for (let i = 0; i < 4; i++) {
      b.fillRect(W * 0.55, horizon - 14 - i * 14, W * 0.45, 12);
    }
    // 跑道
    b.strokeStyle = hexA(p2.glow, 0.28);
    b.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      b.beginPath();
      b.moveTo(-W * 0.1, H * (0.95 - i * 0.06));
      b.quadraticCurveTo(W * 0.5, H * (0.7 - i * 0.06), W * 1.1, H * (0.9 - i * 0.05));
      b.stroke();
    }
    // 球门
    b.strokeStyle = hexA(p2.glow, 0.35); b.lineWidth = 5;
    b.strokeRect(W * 0.72, horizon - H * 0.05, W * 0.16, H * 0.08);
  }

  /* ---------- 场景：古建筑 ---------- */
  function drawAncient(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    // 远山层
    for (let l = 0; l < 2; l++) {
      b.beginPath(); b.moveTo(0, horizon);
      for (let i = 0; i <= 40; i++) {
        const x = (i / 40) * W;
        b.lineTo(x, horizon - Math.abs(Math.sin(i * 0.2 + l)) * horizon * (0.1 - l * 0.04));
      }
      b.lineTo(W, horizon); b.closePath();
      b.fillStyle = hexA(shade(p2.skyMid, -50), 0.7 - l * 0.2); b.fill();
    }
    // 长廊与檐角
    b.fillStyle = shade(p2.ground, 14);
    b.fillRect(0, horizon - H * 0.16, W, H * 0.16);
    b.strokeStyle = shade(p2.ground, 34); b.lineWidth = 8;
    for (let i = 0; i < 7; i++) {
      const cx = W * (0.05 + i * 0.15);
      b.beginPath(); b.moveTo(cx, horizon - H * 0.16); b.lineTo(cx, H * 0.98); b.stroke();
    }
    // 屋顶飞檐
    b.fillStyle = shade(p2.ground, 30);
    b.beginPath();
    b.moveTo(-W * 0.05, horizon - H * 0.16);
    b.quadraticCurveTo(W * 0.5, horizon - H * 0.3, W * 1.05, horizon - H * 0.16);
    b.lineTo(W * 1.05, horizon - H * 0.19);
    b.quadraticCurveTo(W * 0.5, horizon - H * 0.34, -W * 0.05, horizon - H * 0.19);
    b.closePath(); b.fill();
    // 灯笼
    for (let i = 0; i < 3; i++) {
      const lx = W * (0.18 + i * 0.3), ly = horizon - H * 0.1;
      b.strokeStyle = hexA(p2.glow, 0.3); b.lineWidth = 1.4;
      b.beginPath(); b.moveTo(lx, H * 0.02); b.lineTo(lx, ly - 16); b.stroke();
      const lg = b.createRadialGradient(lx, ly, 0, lx, ly, 26);
      lg.addColorStop(0, hexA(p2.accent, 0.9)); lg.addColorStop(1, hexA(p2.accent, 0));
      b.fillStyle = lg; b.beginPath(); b.arc(lx, ly, 26, 0, 6.3); b.fill();
      b.fillStyle = hexA('#ff9a6a', 0.9); b.beginPath(); b.ellipse(lx, ly, 11, 15, 0, 0, 6.3); b.fill();
    }
  }

  /* ---------- 镜头换算 ---------- */
  function camTarget(cam) {
    // 远景：全景；中景：略推；近景 / 特写：继续推近
    // 缩放不得小于 1，否则会露出画布边缘
    if (cam === 'wide') return { zoom: 1, tx: 0, ty: 0 };
    if (cam === 'close') return { zoom: 1.16, tx: W * 0.02, ty: H * 0.05 };
    if (cam === 'detail') return { zoom: 1.22, tx: 0, ty: H * 0.08 };
    return { zoom: 1.06, tx: 0, ty: -H * 0.02 };
  }

  function applyCam() {
    ctx.translate(W / 2, H / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-W / 2 + camera.x, -H / 2 + camera.y);
  }

  /* ---------- 绘制一帧 ---------- */
  function draw(dt) {
    if (!layers) buildLayers();
    time += dt;
    const t = camTarget(state.cam);
    camera.x += (t.tx - camera.x) * Math.min(1, dt * 2.4);
    camera.y += (t.ty - camera.y) * Math.min(1, dt * 2.4);
    camera.zoom += (t.zoom - camera.zoom) * Math.min(1, dt * 2.6);

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    applyCam();

    // 底图
    ctx.drawImage(layers, 0, 0, W, H);

    // 动态光晕
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const p = PALETTES[state.time] || PALETTES.dusk;
    const sunX = W * 0.7, sunY = H * 0.3 + Math.sin(time * 0.5) * 4;
    const rg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(W, H) * 0.4);
    rg.addColorStop(0, hexA(p.glow, 0.18 + Math.sin(time * 0.7) * 0.03));
    rg.addColorStop(1, hexA(p.glow, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 浮尘
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      m.x += m.vx; m.y += m.vy;
      if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
      if (m.x < -10) m.x = W + 10; if (m.x > W + 10) m.x = -10;
      const tw = 0.5 + Math.sin(time * 1.5 + m.ph) * 0.5;
      ctx.fillStyle = `rgba(255,224,180,${m.a * tw})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.3); ctx.fill();
    }
    ctx.restore();

    // 人物（极简氛围剪影）
    const cast = state.cast.slice(0, 3);
    const horizon = H * 0.62;
    const baseH = Math.min(W, H) * (cast.length >= 3 ? 0.305 : cast.length === 2 ? 0.325 : 0.34);
    // 脚底位置：换算到镜头空间，保证缩放后脚仍在对话框上沿之上
    const dlgEl = document.getElementById('dialogue');
    const dlgTop = dlgEl && dlgEl.offsetParent !== null ? dlgEl.getBoundingClientRect().top : H;
    const screenFoot = dlgTop - H * 0.045;
    const toCamY = (sy) => (sy - H / 2) / camera.zoom + H / 2 - camera.y;
    const toCamX = (sx) => (sx - W / 2) / camera.zoom + W / 2 - camera.x;
    const lp = LIGHT_POS[state.time] || LIGHT_POS.dusk;
    const light = { x: W * lp.x, y: H * lp.y };
    const cam = state.cam;
    const view = state.view || 'normal';
    const poses = state.poses || {};
    const actions = state.actions || {};
    const specOf = (ch) => ch.spec || (ch.spec = bodySpec('local:' + (ch.cid || 'c'), {}));

    // 景别取景：以“对话框上沿露出身体的哪一部分”决定人物尺度与脚位
    // 远景＝全身；中景＝腰以上；近景＝头肩；特写＝手部叙事局部
    let frameH = baseH;
    let footScreen = Math.min(horizon + H * 0.17, screenFoot);
    if (cam === 'mid') { frameH = baseH * 1.55; footScreen = screenFoot + frameH * 0.575 * camera.zoom; }
    if (cam === 'close') { frameH = baseH * 2.3; footScreen = screenFoot + frameH * 0.80 * camera.zoom; }
    const footY = toCamY(footScreen);
    const nameY = toCamY(Math.min(horizon + H * 0.17, screenFoot)) + Math.max(14, H * 0.025);

    if (cam === 'detail') {
      // 特写：手 + 叙事道具（道具关键词取自当前台词）
      drawHandDetail(ctx, {
        x: toCamX(W * 0.52), y: toCamY(H * 0.40), size: Math.min(W, H) * 0.52,
        palette: p, time, prop: pickProp(state.propText || ''), light,
      });
    } else if (view === 'over' && cast.length >= 2) {
      // 过肩镜头：前景背影局部 + 背景角色中景
      const fg = cast.find((c) => c.name !== state.speaker) || cast[cast.length - 1];
      const bg = cast.find((c) => c !== fg) || cast[0];
      drawSilhouette(ctx, specOf(bg), {
        x: toCamX(W * 0.62), footY: toCamY(screenFoot + baseH * 1.55 * 0.575 * camera.zoom),
        height: baseH * 1.55, time, speaking: bg.name === state.speaker,
        palette: p, light, depth: 0.22, yaw: 0.5,
        pose: poses[bg.name] || 'neutral', action: actions[bg.name] || 'stand',
      });
      drawSilhouette(ctx, specOf(fg), {
        x: toCamX(W * 0.18), footY: toCamY(H * 1.7), height: H * 1.35, time,
        palette: p, light, depth: 0, yaw: Math.PI,
        pose: poses[fg.name] || 'neutral', action: 'stand',
      });
    } else {
      const positions = cast.length === 1
        ? [W * 0.42]
        : cast.length === 2 ? [W * 0.34, W * 0.6] : [W * 0.28, W * 0.48, W * 0.68];
      // 近景只保留说话者（头肩），其余景别全员同框
      let shown = cast;
      let posOf = (i) => positions[cast.indexOf(shown[i])];
      if (cam === 'close') {
        const sp = cast.find((c) => c.name === state.speaker) || cast[0];
        shown = sp ? [sp] : [];
        posOf = () => W * 0.5;
      }
      shown.forEach((ch, i) => {
        const speaking = ch.name === state.speaker;
        const height = frameH * (speaking ? 1.02 : 0.985);
        const flip = cast.length > 1 && cast[cast.length - 1] === ch ? -1 : 1;
        const yaw = view === 'back' ? Math.PI : (cast.length > 1 ? 0.34 : 0.06);
        drawSilhouette(ctx, specOf(ch), {
          x: toCamX(posOf(i)),
          footY,
          height,
          time,
          speaking,
          palette: p,
          light,
          depth: cam === 'wide' ? 0.1 : 0,
          pose: poses[ch.name] || 'neutral',
          action: actions[ch.name] || 'stand',
          flip,
          yaw,
        });
        // 名牌（仅全身 / 半身景别）
        if (cam === 'wide' || cam === 'mid') {
          ctx.save();
          ctx.font = `600 ${Math.max(12, W * 0.011)}px "Noto Serif SC", serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = speaking ? 'rgba(255,228,190,0.95)' : 'rgba(255,244,230,0.55)';
          ctx.fillText(ch.name, toCamX(posOf(i)), nameY);
          ctx.restore();
        }
      });
    }

    ctx.restore();

    // 胶片颗粒
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = hexA(p.accent, 0.03);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (onFrame) onFrame();
  }

  let last = 0;
  function loop(ts) {
    if (!running) return;
    const now = ts || performance.now();
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    draw(dt);
    rafId = requestAnimationFrame(loop);
  }

  function set(next) {
    const prevScene = state.scene, prevTime = state.time;
    Object.assign(state, next);
    if (state.scene !== prevScene || state.time !== prevTime) layers = null;
  }
  function start() { if (running) return; running = true; last = performance.now(); rafId = requestAnimationFrame(loop); }
  function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  window.addEventListener('resize', resize);
  resize();
  return { set, start, stop, resize, onChange: (fn) => (onFrame = fn) };
}

/* ---------- 色彩工具 ---------- */
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function shade(hex, amt) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, v + amt)));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
