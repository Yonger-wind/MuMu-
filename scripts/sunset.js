/* ============================================================
   暮幕 · 印象派黄昏场景渲染器
   —— 预渲染的天空底 + 逐帧的太阳/云/海面碎金/飞鸟/浮尘
   ============================================================ */

export function createSunset(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let base = null;          // 预渲染静态底
  let clouds = [];
  let motes = [];
  let birds = [];
  let time = 0;
  let rafId = null;
  let parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  let intro = 0;            // 入场暮色渐亮 0→1
  let running = false;
  let reduce = false;

  const rand = (a, b) => a + Math.random() * (b - a);
  // 宽屏时太阳在右中偏左文字留白处；窄屏时右移，避免压住标题文字
  const sunFrac = () => (W > 900 ? 0.64 : 0.78);

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildBase();
    buildClouds();
    buildMotes();
    buildBirds();
  }

  /* ---------------- 静态底：天空笔触 + 远山 + 古塔 ---------------- */
  function buildBase() {
    base = document.createElement('canvas');
    base.width = canvas.width;
    base.height = canvas.height;
    const b = base.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);

    const horizon = H * 0.6;

    // 天空竖向渐变（暮紫 → 玫瑰 → 琥珀）
    const g = b.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0.00, '#2a1c46');
    g.addColorStop(0.28, '#4c2d5e');
    g.addColorStop(0.52, '#8e4567');
    g.addColorStop(0.74, '#d3705f');
    g.addColorStop(0.90, '#f5a25e');
    g.addColorStop(1.00, '#ffcf94');
    b.fillStyle = g;
    b.fillRect(0, 0, W, horizon + 2);

    // 印象派天空笔触：短促的斜向厚涂
    const palette = [
      ['rgba(255,214,160,0.20)', 1.0],
      ['rgba(255,145,120,0.22)', 1.2],
      ['rgba(200,110,150,0.20)', 1.1],
      ['rgba(140,90,170,0.18)', 1.3],
      ['rgba(255,190,140,0.16)', 0.9],
    ];
    const strokes = Math.min(1400, Math.floor((W * horizon) / 260));
    for (let i = 0; i < strokes; i++) {
      const t = Math.pow(Math.random(), 0.7);       // 靠近地平线更密
      const y = horizon * (0.06 + t * 0.94);
      const x = Math.random() * W;
      const len = rand(10, 44) * (0.6 + t * 0.8);
      const ang = rand(-0.5, -0.15);
      const pick = palette[(Math.random() * palette.length) | 0];
      b.save();
      b.translate(x, y);
      b.rotate(ang);
      b.strokeStyle = pick[0];
      b.lineWidth = rand(4, 12) * pick[1];
      b.lineCap = 'round';
      b.beginPath();
      b.moveTo(-len / 2, 0);
      b.quadraticCurveTo(0, rand(-4, 4), len / 2, 0);
      b.stroke();
      b.restore();
    }

    // 太阳晕光（静态的一半，动态层再叠亮部）
    const sunX = W * sunFrac(), sunY = horizon * 0.92;
    const glow = b.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(W, H) * 0.55);
    glow.addColorStop(0, 'rgba(255,226,170,0.55)');
    glow.addColorStop(0.18, 'rgba(255,170,110,0.30)');
    glow.addColorStop(0.5, 'rgba(255,120,100,0.10)');
    glow.addColorStop(1, 'rgba(255,120,100,0)');
    b.fillStyle = glow;
    b.fillRect(0, 0, W, horizon);

    // 远山（两层，越远越淡）
    drawHills(b, horizon, 0.055, 'rgba(90,60,110,0.55)', 0.0);
    drawHills(b, horizon, 0.035, 'rgba(60,38,82,0.75)', 0.35);

    // 古塔 + 水面倒影：落日右侧的远景塔，与左侧标题互相平衡，不压文字
    const tx = W * (W > 900 ? 0.8 : 0.88);
    const ts = Math.min(W * 0.046, H * 0.07);
    const ty = horizon * 0.99;
    // 先堆一座小丘，让塔真正落地
    b.fillStyle = 'rgba(66,42,92,0.6)';
    b.beginPath();
    b.ellipse(tx, ty + ts * 0.1, ts * 1.5, ts * 0.34, 0, 0, Math.PI * 2);
    b.fill();
    b.save();
    b.translate(tx, ty);
    drawPagoda(b, ts, 'rgba(46,28,66,0.78)');
    b.restore();

    // 海面底色
    const wg = b.createLinearGradient(0, horizon, 0, H);
    wg.addColorStop(0, '#b5726b');
    wg.addColorStop(0.25, '#7c4d70');
    wg.addColorStop(1, '#241a3d');
    b.fillStyle = wg;
    b.fillRect(0, horizon, W, H - horizon);

    // 海面横向笔触（远处细密，近处宽大）
    const seaStrokes = Math.min(900, Math.floor((W * (H - horizon)) / 420));
    for (let i = 0; i < seaStrokes; i++) {
      const t = Math.pow(Math.random(), 0.8);
      const y = horizon + (H - horizon) * t;
      const x = Math.random() * W;
      const len = rand(14, 60) * (0.4 + t * 1.6);
      const bright = Math.random() < 0.3;
      b.strokeStyle = bright
        ? `rgba(255,190,140,${rand(0.10, 0.30)})`
        : `rgba(120,80,140,${rand(0.08, 0.22)})`;
      b.lineWidth = rand(2, 6) * (0.5 + t);
      b.lineCap = 'round';
      b.beginPath();
      b.moveTo(x - len / 2, y);
      b.lineTo(x + len / 2, y + rand(-1.5, 1.5));
      b.stroke();
    }

    // 塔在水面的倒影（画在海面底色之上）
    drawTowerReflection(b, tx, horizon + ts * 0.22, ts, H);

    // 岸线暗带
    b.fillStyle = 'rgba(30,18,48,0.35)';
    b.fillRect(0, horizon - 2, W, 3);
  }

  function drawHills(b, horizon, amp, color, phase) {
    b.beginPath();
    b.moveTo(0, horizon);
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const y = horizon - Math.abs(Math.sin(i * 0.19 + phase)) * horizon * amp
                     - Math.sin(i * 0.07 + phase * 3) * horizon * amp * 0.6;
      b.lineTo(x, y);
    }
    b.lineTo(W, horizon);
    b.closePath();
    b.fillStyle = color;
    b.fill();
  }

  function drawPagoda(b, s, color) {
    // 多层楼阁式古塔：收分塔身 + 反宇飞檐 + 平座栏杆 + 相轮塔刹
    const tiers = 5;
    const bodyH = s * 0.5;
    const tierStep = s * 0.72;
    const topY = -(tiers - 1) * tierStep;
    const bw = (i) => s * (0.42 - i * 0.035);   // 半塔宽，向上收分
    const ew = (i) => s * (0.66 - i * 0.055);   // 半檐宽

    // 背后暖光，让剪影从暮色里透出来
    const halo = b.createRadialGradient(0, topY * 0.45, 0, 0, topY * 0.45, s * 3.2);
    halo.addColorStop(0, 'rgba(255,214,160,0.20)');
    halo.addColorStop(0.45, 'rgba(255,170,120,0.08)');
    halo.addColorStop(1, 'rgba(255,170,120,0)');
    b.fillStyle = halo;
    b.beginPath();
    b.arc(0, topY * 0.45, s * 3.2, 0, Math.PI * 2);
    b.fill();

    b.fillStyle = color;
    b.strokeStyle = color;
    b.lineJoin = 'round';
    b.lineCap = 'round';

    // 台基与踏步
    b.fillRect(-s * 0.78, -s * 0.07, s * 1.56, s * 0.11);
    b.fillRect(-s * 0.66, -s * 0.17, s * 1.32, s * 0.12);
    for (let i = 0; i < 3; i++) {
      b.fillRect(-s * (0.26 - i * 0.05), -s * (0.06 + i * 0.05), s * (0.52 - i * 0.1), s * 0.05);
    }

    for (let i = 0; i < tiers; i++) {
      const yb = -i * tierStep;
      const yt = yb - bodyH;
      const w = bw(i), e = ew(i);

      // 塔身（略带收分）
      b.beginPath();
      b.moveTo(-w, yb); b.lineTo(-w * 0.88, yt);
      b.lineTo(w * 0.88, yt); b.lineTo(w, yb);
      b.closePath(); b.fill();

      // 门窗：透出暮光
      if (i < tiers - 1) {
        const gx = w * 0.5;
        [-gx, 0, gx].forEach((ox, k) => {
          const ww = s * (k === 1 ? 0.085 : 0.05);
          const wh = s * (k === 1 ? 0.17 : 0.12);
          const yy = k === 1 ? yt + bodyH * 0.3 : yt + bodyH * 0.42;
          b.fillStyle = 'rgba(255,206,146,0.55)';
          b.fillRect(ox - ww / 2, yy, ww, wh);
          b.beginPath();
          b.arc(ox, yy, ww / 2, Math.PI, 0);
          b.fill();
          b.fillStyle = color;
        });
      }

      // 平座栏杆（二层起）
      if (i >= 1) {
        b.save();
        b.strokeStyle = color;
        b.lineWidth = Math.max(0.6, s * 0.018);
        b.beginPath();
        b.moveTo(-e * 0.62, yb - s * 0.02);
        b.lineTo(e * 0.62, yb - s * 0.02);
        b.stroke();
        for (let k = -3; k <= 3; k++) {
          const px = (k / 3) * e * 0.58;
          b.beginPath();
          b.moveTo(px, yb - s * 0.02);
          b.lineTo(px, yb - s * 0.13);
          b.stroke();
        }
        b.restore();
      }

      // 檐口曲线：凹曲 + 反宇（翼角起翘）
      const drop = s * 0.2;
      const tip = s * 0.13;
      b.beginPath();
      b.moveTo(-e, yt - tip);
      b.quadraticCurveTo(-e * 0.42, yt + drop * 0.28, 0, yt + drop * 0.08);
      b.quadraticCurveTo(e * 0.42, yt + drop * 0.28, e, yt - tip);
      b.quadraticCurveTo(e * 0.46, yt + drop * 1.0, 0, yt + drop * 0.72);
      b.quadraticCurveTo(-e * 0.46, yt + drop * 1.0, -e, yt - tip);
      b.closePath();
      b.fill();

      // 脊线高光
      b.save();
      b.strokeStyle = 'rgba(255,214,166,0.22)';
      b.lineWidth = Math.max(0.6, s * 0.018);
      b.beginPath();
      b.moveTo(-e, yt - tip);
      b.quadraticCurveTo(-e * 0.46, yt + drop * 0.3, 0, yt + drop * 0.1);
      b.quadraticCurveTo(e * 0.46, yt + drop * 0.3, e, yt - tip);
      b.stroke();
      b.restore();

      // 翼角悬铃
      [-e, e].forEach((cx) => {
        const cy = yt - tip;
        b.beginPath();
        b.moveTo(cx, cy);
        b.lineTo(cx + Math.sign(cx) * s * 0.02, cy + s * 0.09);
        b.stroke();
        b.beginPath();
        b.arc(cx + Math.sign(cx) * s * 0.02, cy + s * 0.12, s * 0.028, 0, Math.PI * 2);
        b.fill();
      });
    }

    // 塔顶平台与塔刹（相轮 + 宝珠 + 仰月）
    const capY = topY - bodyH - s * 0.2;
    b.fillRect(-bw(tiers - 1) * 1.3, capY, bw(tiers - 1) * 2.6, s * 0.06);
    const spireH = s * 0.66;
    b.beginPath();
    b.moveTo(0, capY - spireH);
    b.lineTo(s * 0.045, capY);
    b.lineTo(-s * 0.045, capY);
    b.closePath();
    b.fill();
    for (let k = 0; k < 4; k++) {
      const ry = capY - spireH * (0.2 + k * 0.18);
      const rw = s * (0.11 - k * 0.018);
      b.fillRect(-rw / 2, ry, rw, Math.max(0.8, s * 0.026));
    }
    const by = capY - spireH - s * 0.05;
    b.beginPath();
    b.arc(0, by, s * 0.05, 0, Math.PI * 2);
    b.fill();
    b.fillStyle = 'rgba(255,222,170,0.75)';
    b.beginPath();
    b.arc(0, by - s * 0.13, s * 0.045, Math.PI * 0.15, Math.PI * 0.85, true);
    b.fill();
  }

  /* ---------------- 塔在水中的倒影 ---------------- */
  function drawTowerReflection(b, tx, horizon, s, Hh) {
    const depth = Math.min(Hh - horizon, s * 2.6);
    if (depth < 24) return;
    b.save();
    b.translate(tx, horizon);
    b.scale(1, -1);
    b.globalAlpha = 0.17;
    b.lineCap = 'round';
    const tiers = 5, bodyH = s * 0.5, tierStep = s * 0.72;
    const ew = (i) => s * (0.66 - i * 0.055);
    for (let i = 0; i < tiers; i++) {
      const yy = -i * tierStep;
      const e = ew(i);
      const segs = 5;
      for (let k = 0; k < segs; k++) {
        const t = k / segs;
        const y = yy - t * (bodyH + s * 0.24);
        if (y < 0) continue;
        const wob = Math.sin(y * 0.16 + i) * s * 0.05;
        const len = e * (2 - t * 0.6) * (0.5 + Math.random() * 0.5);
        b.strokeStyle = 'rgba(255,206,150,0.7)';
        b.lineWidth = s * 0.06;
        b.beginPath();
        b.moveTo(-len / 2 + wob, y);
        b.lineTo(len / 2 + wob, y);
        b.stroke();
      }
    }
    b.restore();
  }

  /* ---------------- 云 ---------------- */
  function buildClouds() {
    clouds = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      clouds.push({
        x: Math.random() * W,
        y: rand(H * 0.12, H * 0.5),
        scale: rand(0.6, 1.5),
        speed: rand(3, 10) * (Math.random() < 0.5 ? 1 : -1) * 0.2,
        alpha: rand(0.10, 0.26),
        warm: Math.random(),
        blobs: Array.from({ length: 5 }, () => ({
          dx: rand(-70, 70), dy: rand(-16, 16), r: rand(26, 62),
        })),
      });
    }
  }

  /* ---------------- 浮尘 / 飞鸟 ---------------- */
  function buildMotes() {
    motes = [];
    const n = reduce ? 24 : 60;
    for (let i = 0; i < n; i++) {
      motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(0.6, 2.2),
        vx: rand(-0.15, 0.15),
        vy: rand(-0.25, -0.05),
        a: rand(0.15, 0.5),
        ph: Math.random() * Math.PI * 2,
      });
    }
  }

  function buildBirds() {
    birds = [];
  }

  function spawnBird() {
    if (birds.length > 6) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    birds.push({
      x: dir > 0 ? -40 : W + 40,
      y: rand(H * 0.12, H * 0.4),
      vx: dir * rand(0.25, 0.6),
      s: rand(5, 11),
      ph: Math.random() * Math.PI * 2,
    });
  }

  /* ---------------- 每帧绘制 ---------------- */
  function draw(dt) {
    if (!base) return;
    time += dt;

    // 视差缓动
    parallax.x += (parallax.tx - parallax.x) * 0.04;
    parallax.y += (parallax.ty - parallax.y) * 0.04;

    const horizon = H * 0.6;
    ctx.clearRect(0, 0, W, H);

    // 静态底（带轻微视差）
    ctx.save();
    ctx.translate(-parallax.x * 14, -parallax.y * 8);
    ctx.drawImage(base, 0, 0, W, H);
    ctx.restore();

    // 入场：暮色缓缓变亮
    intro = Math.min(1, intro + dt * 0.22);
    const easeIntro = 1 - Math.pow(1 - intro, 3);

    // 太阳（缓慢下沉 + 呼吸）
    const sunX = W * sunFrac() - parallax.x * 18;
    const sunY = horizon * 0.92 - parallax.y * 10 + Math.sin(time * 0.4) * 3;
    const sunR = Math.max(34, Math.min(W, H) * 0.062);
    const pulse = 1 + Math.sin(time * 0.8) * 0.03;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 6 * pulse);
    sg.addColorStop(0, `rgba(255,238,205,${0.95 * easeIntro})`);
    sg.addColorStop(0.06, `rgba(255,214,150,${0.85 * easeIntro})`);
    sg.addColorStop(0.18, `rgba(255,166,110,${0.4 * easeIntro})`);
    sg.addColorStop(0.45, `rgba(255,120,110,${0.12 * easeIntro})`);
    sg.addColorStop(1, 'rgba(255,120,110,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);

    // 日轮：普通混合，保持暖金色而不是被加成纯白
    ctx.globalCompositeOperation = 'source-over';
    const dg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * pulse);
    dg.addColorStop(0, `rgba(255,244,214,${easeIntro})`);
    dg.addColorStop(0.65, `rgba(255,214,150,${easeIntro})`);
    dg.addColorStop(1, `rgba(255,170,110,${easeIntro})`);
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 云（缓慢漂移）
    ctx.save();
    ctx.translate(-parallax.x * 24, -parallax.y * 12);
    for (const c of clouds) {
      c.x += c.speed * dt * 60 * 0.5;
      if (c.x < -220) c.x = W + 220;
      if (c.x > W + 220) c.x = -220;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const baseCol = c.warm > 0.5 ? [255, 200, 170] : [230, 170, 200];
      for (const bl of c.blobs) {
        const r = bl.r * c.scale;
        const cg = ctx.createRadialGradient(
          c.x + bl.dx * c.scale, c.y + bl.dy * c.scale, 0,
          c.x + bl.dx * c.scale, c.y + bl.dy * c.scale, r
        );
        cg.addColorStop(0, `rgba(${baseCol[0]},${baseCol[1]},${baseCol[2]},${c.alpha * easeIntro})`);
        cg.addColorStop(1, `rgba(${baseCol[0]},${baseCol[1]},${baseCol[2]},0)`);
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(c.x + bl.dx * c.scale, c.y + bl.dy * c.scale, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();

    // 海面碎金（太阳倒影 + 波光）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const reflX = sunX;
    const rows = 26;
    for (let i = 0; i < rows; i++) {
      const t = i / rows;
      const y = horizon + 4 + t * (H - horizon) * 0.92;
      const spread = 12 + t * W * 0.12;
      const wob = Math.sin(time * 1.4 + i * 0.8) * (2 + t * 10);
      const alpha = (0.06 + Math.random() * 0.12) * (1 - t * 0.4) * easeIntro;
      const len = (10 + t * 70) * (0.6 + Math.abs(Math.sin(time + i)) * 0.6);
      ctx.strokeStyle = `rgba(255,205,150,${alpha})`;
      ctx.lineWidth = 1.2 + t * 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(reflX - spread + wob, y);
      ctx.lineTo(reflX + spread + wob, y + Math.sin(time * 2 + i) * 2);
      ctx.stroke();
      // 额外的横向波光
      if (i % 3 === 0) {
        const ox = rand(-W * 0.3, W * 0.3);
        ctx.strokeStyle = `rgba(255,190,160,${alpha * 0.6})`;
        ctx.beginPath();
        ctx.moveTo(reflX + ox - len, y);
        ctx.lineTo(reflX + ox + len, y);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 飞鸟
    if (Math.random() < dt * 0.35 && easeIntro > 0.8) spawnBird();
    ctx.save();
    ctx.strokeStyle = 'rgba(40,24,56,0.65)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = birds.length - 1; i >= 0; i--) {
      const bd = birds[i];
      bd.x += bd.vx * dt * 60;
      const flap = Math.sin(time * 6 + bd.ph) * bd.s * 0.5;
      const yy = bd.y + Math.sin(time * 1.2 + bd.ph) * 6;
      ctx.beginPath();
      ctx.moveTo(bd.x - bd.s, yy + flap * 0.4);
      ctx.quadraticCurveTo(bd.x - bd.s * 0.3, yy - flap, bd.x, yy);
      ctx.quadraticCurveTo(bd.x + bd.s * 0.3, yy - flap, bd.x + bd.s, yy + flap * 0.4);
      ctx.stroke();
      if (bd.x < -80 || bd.x > W + 80) birds.splice(i, 1);
    }
    ctx.restore();

    // 浮尘
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      m.x += m.vx; m.y += m.vy;
      if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
      if (m.x < -10) m.x = W + 10;
      if (m.x > W + 10) m.x = -10;
      const tw = 0.5 + Math.sin(time * 1.6 + m.ph) * 0.5;
      ctx.fillStyle = `rgba(255,224,180,${m.a * tw * easeIntro})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 入场黑幕渐隐
    if (easeIntro < 1) {
      const veil = ctx.createLinearGradient(0, 0, 0, H);
      const a = (1 - easeIntro) * 0.55;
      veil.addColorStop(0, `rgba(16,10,30,${a})`);
      veil.addColorStop(1, `rgba(16,10,30,${a * 0.6})`);
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, W, H);
    }
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

  function onPointer(e) {
    const nx = (e.clientX / window.innerWidth - 0.5) * 2;
    const ny = (e.clientY / window.innerHeight - 0.5) * 2;
    parallax.tx = nx;
    parallax.ty = ny;
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointer, { passive: true });

  resize();
  start();

  return { start, stop, resize };
}
