/* ============================================================
   《漩涡与深蓝：星月夜的回响》第一章开场动画
   ------------------------------------------------------------
   画面：梵高《星月夜》式的深蓝星空 —— 冷蓝笔触绕着金色星体与月亮旋成涡卷，
   下方一道起伏的光带与远山，笔触从六处光辉向外生长成画。
   源自 demo/vortex-opening.html，只换成 scripts/openings/shell.js 的驱动契约，
   画面逻辑（流场、配色、粒子、WebGL2 拖尾/辉光/ACES）原样保留。
   外壳负责：标题「点击任意处开始剧本」提示、跳过按钮、生长时间轴、
   30fps 累加器、帧率降级、点击/键盘、淡出销毁。
   标题时刻仍是 7.2s（比铺满早 1.4s），与已验收的行为一致。
   ============================================================ */

const TAU = Math.PI * 2;
const W = 1.6;
const FEATHER = 0.10;
// Film 的合成参数（原 demo params 里的 bloom / exposure，与外壳的 speed / density 分开）
const COMPOSITE = { bloom: 1.80, exposure: 2.00 };

const SEEDS = [
  { x: 0.60, y: 0.40, t0: 0.15, dur: 6.4, maxR: 1.05, warm: false },
  { x: 1.28, y: 0.22, t0: 0.85, dur: 5.9, maxR: 0.95, warm: true },
  { x: 1.47, y: 0.115, t0: 1.50, dur: 5.5, maxR: 0.90, warm: true },
  { x: 0.79, y: 0.50, t0: 2.10, dur: 5.6, maxR: 0.95, warm: false },
  { x: 0.18, y: 0.16, t0: 2.65, dur: 5.2, maxR: 0.90, warm: true },
  { x: 0.32, y: 0.73, t0: 3.20, dur: 5.2, maxR: 0.95, warm: true },
];

/* ---------- 流场：涡旋 + 横向风 + 起伏光带 ---------- */
const VORT = [
  { x: 0.60, y: 0.40, r: 0.150, s: -0.34, warm: false },  // 主涡旋
  { x: 0.79, y: 0.50, r: 0.092, s: -0.22, warm: false },  // 副涡旋
  { x: 1.28, y: 0.22, r: 0.100, s: -0.26, warm: true },   // 大星
  { x: 1.47, y: 0.115, r: 0.075, s: 0.18, warm: true },   // 月
  { x: 0.18, y: 0.16, r: 0.052, s: 0.15, warm: true },
  { x: 0.42, y: 0.10, r: 0.038, s: -0.12, warm: true },
  { x: 0.95, y: 0.12, r: 0.042, s: 0.13, warm: true },
  { x: 1.12, y: 0.43, r: 0.050, s: -0.14, warm: true },
  { x: 0.30, y: 0.31, r: 0.046, s: 0.12, warm: false },
  { x: 1.42, y: 0.40, r: 0.040, s: 0.10, warm: true },
  { x: 0.10, y: 0.44, r: 0.050, s: -0.12, warm: false },
];
const waveY = (x) => 0.72 + 0.05 * Math.sin(5.5 * x - 0.8) + 0.012 * Math.sin(13 * x);
const lowY = (x) => 0.855 + 0.032 * Math.sin(4.6 * x + 1.1) + 0.011 * Math.sin(11 * x - 0.6);
const deepY = (x) => 0.955 + 0.022 * Math.sin(5.8 * x - 1.3);

function field(x, y) {
  let vx = 0.10 + 0.02 * Math.sin(y * 13 + x * 2.5);
  let vy = 0.02 * Math.sin(x * 8 + y * 4);
  let gmax = 0, rx = 0, ry = 0;
  for (const v of VORT) {
    const dx = x - v.x + 0.01 * Math.sin(y * 12 + x * 2);
    const dy = (y - v.y) / 0.85;
    const r2 = dx * dx + dy * dy;
    const cut = v.r * 3.4;
    if (r2 > cut * cut) continue;          // 远场高斯已可忽略，跳过 exp/sqrt
    const g = Math.exp(-r2 / (2 * v.r * v.r));
    if (g > gmax) gmax = g;
    const a = v.s * g / Math.sqrt(r2 + 0.0012);
    const sink = (v.warm ? 0.12 : 0.22) * g;
    rx += -dy * a - dx * sink;
    ry += dx * a * 0.85 - dy * sink * 0.85;
  }
  const band = Math.exp(-(((y - waveY(x)) / 0.06) ** 2));
  vx = vx * (1 - 0.8 * gmax) + rx + 0.15 * band;
  vy = vy * (1 - 0.8 * gmax) + ry + 0.15 * band * (0.275 * Math.cos(5.5 * x - 0.8) + 0.156 * Math.cos(13 * x));
  const bA = Math.exp(-(((y - lowY(x)) / 0.045) ** 2));
  const bB = Math.exp(-(((y - deepY(x)) / 0.055) ** 2));
  vx += 0.10 * bA + 0.08 * bB;
  vy += 0.10 * bA * (0.147 * Math.cos(4.6 * x + 1.1) + 0.121 * Math.cos(11 * x - 0.6))
      + 0.08 * bB * 0.128 * Math.cos(5.8 * x - 1.3);
  return [vx, vy];
}

/* 亮度权重：涡旋环 / 光带 / 天空横带，决定笔触透明度 */
function emphasis(x, y) {
  let s = 0.05;
  for (const v of VORT) {
    const r = Math.hypot(x - v.x, (y - v.y) / 0.85) / v.r;
    if (r > 3.6) continue;                 // 环权重已可忽略
    const ang = Math.atan2((y - v.y) / 0.85, x - v.x);
    const brush = 0.78 + 0.22 * Math.sin(ang * 2 + Math.log(r + 0.15) * 2.4 + v.x * 4);
    const ring = Math.exp(-(((r - 1.05) / 0.68) ** 2));
    s = Math.max(s, ring * brush * (v.warm ? 0.95 : 0.9));
  }
  s = Math.max(s, 0.85 * Math.exp(-(((y - waveY(x)) / 0.036) ** 2)));
  s = Math.max(s, 0.48 * Math.exp(-(((y - (0.40 + 0.15 * Math.sin(x * 4 - 0.6))) / 0.06) ** 2)));
  s = Math.max(s, 0.44 * Math.exp(-(((x - 0.43) / 0.38) ** 4)) * Math.exp(-(((y - (0.21 + 0.065 * Math.sin(x * 7 - 0.6))) / 0.048) ** 2)));
  s = Math.max(s, 0.43 * Math.exp(-(((x - 1.41) / 0.30) ** 4)) * Math.exp(-(((y - (0.51 + 0.045 * Math.sin(x * 10))) / 0.065) ** 2)));
  s = Math.max(s, 0.56 * Math.exp(-(((y - lowY(x)) / 0.035) ** 2)));
  s = Math.max(s, 0.38 * Math.exp(-(((y - deepY(x)) / 0.042) ** 2)));
  return Math.min(1, s);
}

const COLD = ['#123049', '#1f5069', '#35799a', '#5aa3b8', '#8cc6cd', '#bcdad2', '#e2e8c9'];
const GOLD = ['#4a4a26', '#837c34', '#b3a53e', '#d2bc4e', '#ebd067', '#ffe296', '#ffefb0'];

/* ---------- WebGL2 电影感合成器（拖尾 / 辉光 / ACES） ---------- */
class Film {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl2');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    const VS = `#version 300 es
      layout(location=0) in vec2 aPos; out vec2 vUv;
      void main(){ vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;
    const HEAD = `#version 300 es
      precision highp float; in vec2 vUv; out vec4 o;`;
    const FS_ACC = HEAD + `
      uniform sampler2D uInk, uBase, uPrev; uniform float uDecay;
      uniform float uGrow; uniform vec4 uSeeds[6];   // xy=中心 zw=(r, rOut)
      vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
      void main(){
        vec2 uv = vec2(vUv.x, 1. - vUv.y);
        vec4 ink = texture(uInk, uv);
        vec3 base = lin(texture(uBase, uv).rgb);
        if (uGrow > .5) {          // 生长遮罩在 GPU 解析计算，免去每帧上传整张底图
          vec2 p = vec2(uv.x * 1.6, uv.y);
          float g = 0.;
          for (int i = 0; i < 6; i++) {
            vec4 s = uSeeds[i];
            if (s.w <= 0.) continue;
            g = max(g, clamp((s.w - length(p - s.xy)) / 0.10, 0., 1.));
          }
          base *= g;
        }
        vec3 prev = texture(uPrev, vUv).rgb;
        o = vec4(prev * (1. - uDecay) + base * uDecay + lin(ink.rgb) * ink.a * .5, 1.);
      }`;
    const FS_EXT = HEAD + `
      uniform sampler2D uSrc;
      void main(){
        vec3 c = texture(uSrc, vUv).rgb * 2.;
        float l = max(c.r, max(c.g, c.b));
        o = vec4(c * smoothstep(.15, .7, l), 1.);
      }`;
    const FS_BLUR = HEAD + `
      uniform sampler2D uSrc; uniform vec2 uTexel, uDir;
      void main(){
        vec2 d = uTexel * uDir;
        vec3 c = texture(uSrc, vUv).rgb * .227027;
        c += (texture(uSrc, vUv + d * 1.384615).rgb + texture(uSrc, vUv - d * 1.384615).rgb) * .316216;
        c += (texture(uSrc, vUv + d * 3.230769).rgb + texture(uSrc, vUv - d * 3.230769).rgb) * .070270;
        o = vec4(c, 1.);
      }`;
    const FS_COMP = HEAD + `
      uniform sampler2D uScene, uGlow; uniform float uBloom, uExposure;
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
      void main(){
        vec3 base = texture(uScene, vUv).rgb * 2.;
        vec3 c = aces((base + texture(uGlow, vUv).rgb * uBloom * .75) * uExposure);
        float vig = 1. - .18 * pow(length((vUv - .5) * vec2(1.1, 1.)), 1.5);
        c = pow(c * vig, vec3(1. / 2.2));
        float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5;
        o = vec4(clamp(c + grain * .003, 0., 1.), 1.);
      }`;
    this.pAcc = this.prog(VS, FS_ACC);
    this.pExt = this.prog(VS, FS_EXT);
    this.pBlur = this.prog(VS, FS_BLUR);
    this.pComp = this.prog(VS, FS_COMP);
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ink = this.tex(); this.base = this.tex();
    this.hist = []; this.bloomT = []; this.idx = 0;
  }
  prog(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s); gl.deleteShader(s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); u[info.name.replace('[0]', '')] = u[info.name]; }
    return { p, u };
  }
  tex() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  target(w, h) {
    const gl = this.gl, t = this.tex();
    gl.texImage2D(gl.TEXTURE_2D, 0, this.hdr ? gl.RGBA16F : gl.RGBA, w, h, 0, gl.RGBA, this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('bad fbo');
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { t, f };
  }
  resize(w, h) {
    const gl = this.gl;
    for (const x of [...this.hist, ...this.bloomT]) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); }
    this.w = w; this.h = h;
    this.bw = Math.max(1, w >> 2); this.bh = Math.max(1, h >> 2);
    this.hist = [this.target(w, h), this.target(w, h)];
    this.bloomT = [this.target(this.bw, this.bh), this.target(this.bw, this.bh)];
    this.idx = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bind(t, unit) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
  draw(prog, fbo, w, h) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }
  setBase(src) { this.bind(this.base, 0); this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, src); }
  advance(inkCanvas, dt, seeds) {
    const gl = this.gl, next = 1 - this.idx;
    this.bind(this.ink, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, inkCanvas);
    this.draw(this.pAcc, this.hist[next].f, this.w, this.h);
    this.bind(this.ink, 0); this.bind(this.base, 1); this.bind(this.hist[this.idx].t, 2);
    gl.uniform1i(this.pAcc.u.uInk, 0); gl.uniform1i(this.pAcc.u.uBase, 1); gl.uniform1i(this.pAcc.u.uPrev, 2);
    gl.uniform1f(this.pAcc.u.uDecay, Math.min(0.3, 0.03 * dt));
    gl.uniform1f(this.pAcc.u.uGrow, seeds ? 1 : 0);
    if (seeds) {
      const arr = new Float32Array(24);
      for (let i = 0; i < 6; i++) { const s = seeds[i]; arr[i * 4] = s.x; arr[i * 4 + 1] = s.y; arr[i * 4 + 2] = s.r; arr[i * 4 + 3] = s.rOut; }
      gl.uniform4fv(this.pAcc.u.uSeeds, arr);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.idx = next;
    gl.activeTexture(gl.TEXTURE0);
  }
  render() {
    const gl = this.gl;
    this.draw(this.pExt, this.bloomT[0].f, this.bw, this.bh);
    this.bind(this.hist[this.idx].t, 0); gl.uniform1i(this.pExt.u.uSrc, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    for (let i = 0; i < 4; i++) {
      const dst = (i + 1) % 2;
      this.draw(this.pBlur, this.bloomT[dst].f, this.bw, this.bh);
      this.bind(this.bloomT[i % 2].t, 0);
      gl.uniform1i(this.pBlur.u.uSrc, 0);
      gl.uniform2f(this.pBlur.u.uTexel, 1 / this.bw, 1 / this.bh);
      gl.uniform2f(this.pBlur.u.uDir, i % 2 === 0 ? 1.2 : 0, i % 2 === 1 ? 1.2 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    this.draw(this.pComp, null, this.w, this.h);
    this.bind(this.hist[this.idx].t, 0); this.bind(this.bloomT[0].t, 1);
    gl.uniform1i(this.pComp.u.uScene, 0); gl.uniform1i(this.pComp.u.uGlow, 1);
    gl.uniform1f(this.pComp.u.uBloom, COMPOSITE.bloom);
    gl.uniform1f(this.pComp.u.uExposure, COMPOSITE.exposure);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  }
}

/* ---------- 定义 ---------- */
export const VORTEX = {
  key: 'vortex',
  title: '漩涡与深蓝：',
  subtitle: '星月夜的回响',
  ariaLabel: '梵高星月夜风格的流动星空，蓝青笔触围绕金色星体缓慢旋转。',
  params: { speed: 2.00, density: 6000 },
  // 分辨率上限 1150（约 210 万像素/帧）：全屏高 dpr 下不再推至 410 万像素，CSS 放大由辉光/颗粒掩盖
  scaleCap: 1150,
  introEnd: 8.6,
  // 标题比画面铺满早 1.4s 出现，留出「点击任意处开始剧本」的提示时间
  titleAt: 7.2,
  seed: 18890601,

  create(api) {
    // 每次打开一份新的生长状态（r / rOut / rOut2 由 updateGrowth 写）
    const seeds = SEEDS.map((s) => ({ ...s }));

    /* ---------- 单元格缓存：暖度 / 强调 / 生长遮罩 / 流场 ---------- */
    function cellInfo(x, y) {
      const key = ((x * 80) | 0) * 128 + ((y * 80) | 0);
      let c = api.cellCache.get(key);
      if (c) return c;
      let warmth = 0;
      for (const v of VORT) if (v.warm) {
        const dx = x - v.x, dy = y - v.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > v.r * v.r * 9) continue;
        warmth = Math.max(warmth, Math.exp(-d2 / (1.55 * v.r * v.r)));
      }
      if (Math.abs(y - waveY(x)) < 0.027) warmth = Math.max(warmth, 0.77);
      const goldLow = y > 0.80 && Math.abs(y - lowY(x)) < 0.006 && Math.sin(x * 9 + 0.8) > 0.25;
      let g = 1;
      if (api.growth) {
        g = 0;
        for (const s of api.growth) {
          if (s.rOut2 <= 0) continue;
          const dx = x - s.x, dy = y - s.y, d2 = dx * dx + dy * dy;
          if (d2 >= s.rOut2) continue;
          const d = Math.sqrt(d2);
          const v = d <= s.r ? 1 : (s.rOut - d) / FEATHER;
          if (v > g) g = v;
          if (g >= 1) break;
        }
      }
      const f = field(x, y);
      c = { em: emphasis(x, y), warmth, goldLow, g, fx: f[0], fy: f[1] };
      api.cellCache.set(key, c);
      return c;
    }
    function colorOf(info, tone) {
      if (info.goldLow) return GOLD[Math.min(4, tone)];
      return (info.warmth > 0.32 ? GOLD : COLD)[tone];
    }
    function colorAt(x, y, tone) { return colorOf(cellInfo(x, y), tone); }

    /* ---------- 底涂：静态短笔触 + 暖色星核 ---------- */
    function paintUnder(_api) {
      const scale = api.scale;
      const w = api.under.width, h = api.under.height;
      const ctx = api.baseCtx;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#081019'); grad.addColorStop(0.62, '#0c161f'); grad.addColorStop(1, '#070f17');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.lineCap = 'round';
      for (let i = 0; i < 26000; i++) {
        let x = api.rnd() * W, y = api.rnd();
        if (i % 4 === 1) { x = 0.06 + api.rnd() * 1.06; y = 0.015 + api.rnd() * 0.38; }
        if (i % 4 === 2) { x = api.rnd() * W; y = 0.79 + api.rnd() * 0.22; }
        if (i % 3 === 0) {
          const v = VORT[Math.floor(api.rnd() * VORT.length)], a = api.rnd() * TAU, r = v.r * (0.4 + api.rnd() * 1.5);
          x = v.x + Math.cos(a) * r; y = v.y + Math.sin(a) * r * 0.85;
        }
        const tone = Math.min(6, Math.floor(api.rnd() * 7));
        ctx.strokeStyle = colorAt(x, y, tone);
        ctx.globalAlpha = (0.09 + api.rnd() * 0.46) * emphasis(x, y);
        ctx.lineWidth = (0.4 + api.rnd() ** 2 * 1.9) * scale / 800;
        ctx.beginPath(); ctx.moveTo(x * scale, y * scale);
        const steps = 5 + Math.floor(api.rnd() * 30);
        for (let j = 0; j < steps; j++) { const d = field(x, y); x += d[0] * 0.012; y += d[1] * 0.012; ctx.lineTo(x * scale, y * scale); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const v of VORT) if (v.warm) {
        const g = ctx.createRadialGradient(v.x * scale, v.y * scale, 0, v.x * scale, v.y * scale, v.r * scale);
        g.addColorStop(0, '#e2d18a7d'); g.addColorStop(0.12, '#b5a14c30'); g.addColorStop(1, '#b5a14c00');
        ctx.fillStyle = g;
        ctx.fillRect((v.x - v.r) * scale, (v.y - v.r) * scale, v.r * 2 * scale, v.r * 2 * scale);
      }
      api.inkCtx.drawImage(api.under, 0, 0);
    }

    /* ---------- 粒子笔触 ---------- */
    function spawn(initial) {
      let x = api.rnd() * 1.7 - 0.05, y = api.rnd() * 1.08 - 0.04;
      const area = api.rnd();
      if (area < 0.28) { x = 0.06 + api.rnd() * 1.06; y = 0.015 + api.rnd() * 0.38; }
      else if (area < 0.50) { x = api.rnd() * W; y = 0.79 + api.rnd() * 0.22; }
      return { x, y, age: initial ? Math.floor(api.rnd() * 180) : 0, life: 120 + Math.floor(api.rnd() * 220), tone: Math.min(6, Math.floor(api.rnd() ** 1.35 * 7)), width: 0.3 + api.rnd() ** 2 * 1.0, phase: api.rnd() * TAU };
    }

    function step(_api, dt) {
      const scale = api.scale;
      const inkCtx = api.inkCtx;
      if (api.gpu) {
        inkCtx.clearRect(0, 0, api.ink.width, api.ink.height);
      } else {
        inkCtx.globalAlpha = Math.min(0.9, 0.028 * dt);
        inkCtx.drawImage(api.growth ? api.baseIntro : api.under, 0, 0);
        inkCtx.globalAlpha = 1;
      }
      api.cellCache.clear();
      api.buckets.clear();
      const particles = api.particles;
      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        p.age += dt;
        if (p.age > p.life || p.x < -0.12 || p.x > 1.72 || p.y < -0.12 || p.y > 1.12) p = particles[i] = spawn(false);
        const info = cellInfo(p.x, p.y);
        const nx = p.x + info.fx * 0.018 * dt, ny = p.y + info.fy * 0.018 * dt;
        const alpha = (0.28 + 0.4 * Math.sin(p.phase + p.age * 0.025) ** 2) * info.em * info.g;
        if (alpha > 0.02) {
          const ci = (info.goldLow || info.warmth > 0.32 ? 7 : 0) + (info.goldLow ? Math.min(4, p.tone) : p.tone);
          const aq = Math.min(7, Math.round(alpha * 7));
          const wq = Math.min(3, Math.round(p.width * 2.5));
          const key = ci * 32 + aq * 4 + wq;
          let b = api.buckets.get(key);
          if (!b) {
            b = { style: colorOf(info, p.tone), alpha: aq / 7, width: (wq / 2.5) * scale / 800, pts: [] };
            api.buckets.set(key, b);
          }
          b.pts.push(p.x * scale, p.y * scale, nx * scale, ny * scale);
        }
        p.x = nx; p.y = ny;
      }
      inkCtx.lineCap = 'round';
      for (const b of api.buckets.values()) {
        inkCtx.strokeStyle = b.style;
        inkCtx.globalAlpha = b.alpha;
        inkCtx.lineWidth = Math.max(0.3, b.width);
        inkCtx.beginPath();
        const pts = b.pts;
        for (let j = 0; j < pts.length; j += 4) {
          inkCtx.moveTo(pts[j], pts[j + 1]);
          inkCtx.lineTo(pts[j + 2], pts[j + 3]);
        }
        inkCtx.stroke();
      }
      inkCtx.globalAlpha = 1;
      if (api.growth) {
        for (const s of api.growth) {
          if (s.rOut2 <= 0) continue;
          // 点燃火花：亮起后随该处生长完成而熄灭，避免累积成静止光球
          const u = Math.min(1, Math.max(0, (api.introT - s.t0) / s.dur));
          const fade = Math.min(1, Math.max(0, (api.introT - s.t0) / 0.5)) * Math.pow(1 - u, 1.6);
          if (fade <= 0.01) continue;
          const r = (s.warm ? 0.09 : 0.085) * scale;
          const col = s.warm ? '255,240,179' : '190,230,238';
          const a0 = s.warm ? 0.035 : 0.02;
          const g = inkCtx.createRadialGradient(s.x * scale, s.y * scale, 0, s.x * scale, s.y * scale, r);
          g.addColorStop(0, `rgba(${col},${a0 * fade})`);
          g.addColorStop(0.4, `rgba(${col},${a0 * 0.45 * fade})`);
          g.addColorStop(1, `rgba(${col},0)`);
          inkCtx.fillStyle = g;
          inkCtx.fillRect(s.x * scale - r, s.y * scale - r, r * 2, r * 2);
        }
      } else {
        for (const v of VORT) if (v.warm) {
          const r = v.r * 0.95 * scale;
          const g = inkCtx.createRadialGradient(v.x * scale, v.y * scale, 0, v.x * scale, v.y * scale, r);
          g.addColorStop(0, 'rgba(255,240,179,0.055)');
          g.addColorStop(0.35, 'rgba(226,209,138,0.028)');
          g.addColorStop(1, 'rgba(226,209,138,0)');
          inkCtx.fillStyle = g;
          inkCtx.fillRect(v.x * scale - r, v.y * scale - r, r * 2, r * 2);
        }
      }
    }

    /* ---------- 开场：光辉生长 ---------- */
    function updateGrowth(_api, t) {
      for (const s of api.growth || []) {
        const u = Math.min(1, Math.max(0, (t - s.t0) / s.dur));
        s.r = u <= 0 ? 0 : s.maxR * u;
        s.rOut = s.r + FEATHER;
        s.rOut2 = s.rOut * s.rOut;
      }
    }
    function refreshGrowth(_api) {
      const scale = api.scale;
      const w = api.under.width, h = api.under.height;
      api.maskCtx.clearRect(0, 0, w, h);
      api.maskCtx.globalCompositeOperation = 'lighter';
      for (const s of api.growth) {
        if (s.rOut2 <= 0) continue;
        const R = s.rOut * scale;
        const g = api.maskCtx.createRadialGradient(s.x * scale, s.y * scale, 0, s.x * scale, s.y * scale, R);
        const inner = Math.max(0, Math.min(1, s.r / s.rOut));
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(inner, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        api.maskCtx.fillStyle = g;
        api.maskCtx.fillRect(s.x * scale - R, s.y * scale - R, R * 2, R * 2);
      }
      api.maskCtx.globalCompositeOperation = 'source-over';
      api.bIntroCtx.clearRect(0, 0, w, h);
      api.bIntroCtx.drawImage(api.under, 0, 0);
      api.bIntroCtx.globalCompositeOperation = 'destination-in';
      api.bIntroCtx.drawImage(api.maskC, 0, 0);
      api.bIntroCtx.globalCompositeOperation = 'source-over';
    }

    return {
      seeds: SEEDS.map((s) => ({ ...s })),
      makeFilm(canvas) { return new Film(canvas); },
      paintUnder,
      spawn,
      step,
      updateGrowth,
      refreshGrowth,
    };
  },
};