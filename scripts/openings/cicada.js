/* 《蝉鸣止于逢魔时》第一章开场动画：黄昏海面——橙金涡卷天空围绕半升落日，
   深青海面泛起金色倒影，笔触缓慢生长成画后浮现剧名。
   源自单文件 demo（蝉鸣止于逢魔时 · 开场动画），仅换成 scripts/openings/shell.js
   的驱动契约；粒子参数、流场公式、配色、Film shader 全部原样保留。
   管线：Canvas2D 粒子笔触 → WebGL2 浮点拖尾累积 → 辉光（bloom=0 时跳过）→ ACES。 */

const TAU = Math.PI * 2;
const W = 1.6, H = 1;
const HOR = 0.55;                          // 海平线
const SUN = { x: 0.60, y: 0.50, r: 0.10 }; // 半升落日

/* demo 原有固定参数：speed / density 由外壳从 OPENING.params 读取；
   bloom / exposure 是 Film 合成器专用，保留在这份模块级常量里（本 demo bloom=0，
   render() 里 `if (params.bloom > 0.001)` 的分支会直接跳过辉光，原样保留）。 */
const params = { speed: 3.00, density: 20500, bloom: 0.00, exposure: 0.80 };

/* ---------- 天空涡卷 ---------- */
const VORT = [
  { x: 0.17, y: 0.28, r: 0.075, s: 0.16, warm: true },
  { x: 0.335, y: 0.205, r: 0.055, s: -0.14, warm: true },
  { x: 0.02, y: 0.26, r: 0.050, s: 0.12, warm: true },
  { x: 0.86, y: 0.18, r: 0.042, s: -0.10, warm: true },
  { x: SUN.x, y: SUN.y, r: SUN.r, s: -0.20, warm: true },
];
/* ---------- 流线带：天空细浪 / 海面涌浪 ---------- */
const SKY_BANDS = [
  { y0: 0.045, A: 0.012, k: 5.0, p: 0.4 },
  { y0: 0.085, A: 0.014, k: 4.4, p: 1.7 },
  { y0: 0.125, A: 0.016, k: 6.1, p: 2.9 },
  { y0: 0.165, A: 0.014, k: 5.6, p: 0.9 },
  { y0: 0.205, A: 0.017, k: 4.2, p: 2.2 },
  { y0: 0.245, A: 0.015, k: 6.6, p: 1.1 },
  { y0: 0.285, A: 0.016, k: 5.1, p: 3.4 },
  { y0: 0.325, A: 0.014, k: 4.7, p: 0.6 },
  { y0: 0.365, A: 0.015, k: 6.3, p: 2.5 },
  { y0: 0.405, A: 0.013, k: 5.4, p: 1.4 },
  { y0: 0.445, A: 0.012, k: 6.9, p: 3.0 },
  { y0: 0.485, A: 0.010, k: 5.8, p: 0.2 },
  { y0: 0.520, A: 0.008, k: 6.4, p: 1.9 },
];
const SEA_BANDS = [
  { y0: 0.585, A: 0.014, k: 6.5, p: 0.3 },
  { y0: 0.630, A: 0.017, k: 5.4, p: 1.4 },
  { y0: 0.675, A: 0.020, k: 6.9, p: 2.6 },
  { y0: 0.720, A: 0.022, k: 5.9, p: 0.8 },
  { y0: 0.765, A: 0.024, k: 6.4, p: 2.0 },
  { y0: 0.810, A: 0.025, k: 5.2, p: 1.1 },
  { y0: 0.855, A: 0.026, k: 6.7, p: 3.2 },
  { y0: 0.900, A: 0.027, k: 5.6, p: 0.5 },
  { y0: 0.945, A: 0.027, k: 6.2, p: 2.3 },
  { y0: 0.990, A: 0.026, k: 5.0, p: 1.6 },
];
const bandY = (b, x) => b.y0 + b.A * Math.sin(b.k * x + b.p) + 0.006 * Math.sin(b.k * 2.3 * x + b.p * 1.7);
const bandD = (b, x) => b.A * b.k * Math.cos(b.k * x + b.p) + 0.006 * b.k * 2.3 * Math.cos(b.k * 2.3 * x + b.p * 1.7);
const reflW = y => 0.035 + 0.30 * Math.max(0, y - HOR);   // 金色倒影随深度展宽

/* 流场：横向沿最近流带切线起伏，天空叠加涡卷与落日旋涡，海面以下涡卷减弱 */
function field(x, y) {
  const sea = y >= HOR;
  const bands = sea ? SEA_BANDS : SKY_BANDS;
  let vx = sea ? 0.13 + 0.03 * Math.sin(y * 23 + x * 5) : 0.10 + 0.02 * Math.sin(y * 17 + x * 3);
  let vy = 0;
  // 沿最近流带的切线方向走，形成起伏的横向流线
  let best = 1e9, bw = 0, bd = 0;
  for (const b of bands) {
    const d = y - bandY(b, x);
    const w = Math.exp(-((d / 0.035) ** 2));
    if (w > bw) { bw = w; bd = bandD(b, x); }
    if (Math.abs(d) < best) best = Math.abs(d);
  }
  vy += bw * bd * vx * 0.9;
  // 天空涡卷 + 落日旋涡
  let gmax = 0, rx = 0, ry = 0;
  for (const v of VORT) {
    const dx = x - v.x, dy = (y - v.y) / 0.85;
    const r2 = dx * dx + dy * dy;
    const cut = v.r * 3.4;
    if (r2 > cut * cut) continue;
    const g = Math.exp(-r2 / (2 * v.r * v.r));
    if (g > gmax) gmax = g;
    const a = v.s * g / Math.sqrt(r2 + 0.0012);
    const sink = 0.16 * g;
    rx += -dy * a - dx * sink;
    ry += dx * a * 0.85 - dy * sink * 0.85;
  }
  const damp = sea ? 0.35 : 1;   // 海面以下涡卷减弱
  vx = vx * (1 - 0.7 * gmax * damp) + rx * damp;
  vy = vy * (1 - 0.7 * gmax * damp) + ry * damp;
  return [vx, vy];
}

/* 笔触权重：流带脊线最亮，天空涡卷有笔触感，落日同心环，海面倒影列 */
function emphasis(x, y) {
  const sea = y >= HOR;
  let s = sea ? 0.05 : 0.06;
  for (const b of (sea ? SEA_BANDS : SKY_BANDS)) {
    const d = y - bandY(b, x);
    s = Math.max(s, (sea ? 1.0 : 0.95) * Math.exp(-((d / (sea ? 0.011 : 0.010)) ** 2)));
  }
  if (!sea) {
    for (const v of VORT) {
      const r = Math.hypot(x - v.x, (y - v.y) / 0.85) / v.r;
      if (r > 3.6) continue;
      const ang = Math.atan2((y - v.y) / 0.85, x - v.x);
      const brush = 0.78 + 0.22 * Math.sin(ang * 2 + Math.log(r + 0.15) * 2.4 + v.x * 4);
      s = Math.max(s, Math.exp(-(((r - 1.05) / 0.68) ** 2)) * brush * 0.9);
    }
    // 落日同心光环（仅海平线以上）
    const d = Math.hypot(x - SUN.x, (y - SUN.y) / 0.9) / SUN.r;
    for (const rr of [0.45, 0.7, 0.95, 1.25, 1.6]) {
      s = Math.max(s, 1.0 * Math.exp(-(((d - rr) / 0.07) ** 2)));
    }
  } else {
    // 倒影列：浪尖上的金色更亮
    const g = Math.exp(-(((x - SUN.x) / reflW(y)) ** 2));
    s = Math.max(s, 0.5 * g);
  }
  return Math.min(1, s);
}

/* ---------- 配色：天空暖橙 / 海面深青 / 倒影金 / 日核米白 ---------- */
const SKY = ['#3b3247', '#7a3a22', '#a85426', '#cf752c', '#e8963c', '#f6bb5e', '#ffdf9a'];
const SEA = ['#0b2434', '#123c50', '#1a566b', '#237b8c', '#39a3ad', '#63c9c9', '#a8e6da'];
const GOLD = ['#8a6a2c', '#b3873a', '#d9a94a', '#f2c766', '#ffe08c', '#fff0b8', '#fff6d8'];
const SUNC = ['#e8b45c', '#f2c766', '#ffdf9a', '#ffedb0'];
const FEATHER = 0.10;

/* ---------- WebGL2 合成器（原样保留，含 bloom=0 时跳过辉光的分支） ---------- */
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
      uniform float uGrow; uniform vec4 uSeeds[6];
      vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
      void main(){
        vec2 uv = vec2(vUv.x, 1. - vUv.y);
        vec4 ink = texture(uInk, uv);
        vec3 base = lin(texture(uBase, uv).rgb);
        if (uGrow > .5) {
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
        float vig = 1. - .16 * pow(length((vUv - .5) * vec2(1.1, 1.)), 1.5);
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
    if (params.bloom > 0.001) {
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
    }
    this.draw(this.pComp, null, this.w, this.h);
    this.bind(this.hist[this.idx].t, 0); this.bind(this.bloomT[0].t, 1);
    gl.uniform1i(this.pComp.u.uScene, 0); gl.uniform1i(this.pComp.u.uGlow, 1);
    gl.uniform1f(this.pComp.u.uBloom, params.bloom);
    gl.uniform1f(this.pComp.u.uExposure, params.exposure);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  }
}

/* ---------- 生长光点：落日核心先亮，天空/海面依次点燃（外壳要求 6 个） ---------- */
const SEEDS = [
  { x: SUN.x, y: SUN.y, t0: 0.15, dur: 6.4, maxR: 1.05, warm: true },
  { x: 0.17, y: 0.28, t0: 0.90, dur: 5.9, maxR: 0.95, warm: true },
  { x: 0.335, y: 0.205, t0: 1.60, dur: 5.5, maxR: 0.90, warm: true },
  { x: 0.20, y: 0.75, t0: 2.20, dur: 5.6, maxR: 0.95, warm: false },
  { x: 0.82, y: 0.80, t0: 2.80, dur: 5.2, maxR: 0.90, warm: false },
  { x: 0.86, y: 0.22, t0: 3.30, dur: 5.2, maxR: 0.90, warm: true },
];
const easeGrow = u => u;

export const CICADA = {
  key: 'cicada',
  title: '蝉鸣止于逢魔时',
  ariaLabel: '蝉鸣止于逢魔时开场：橙金涡卷天空围绕半升落日，深青海面泛起金色倒影，笔触缓慢生长成画后浮现剧名。',
  params: { speed: 3.00, density: 20500 },
  scaleCap: 800,
  introEnd: 8.6,
  // 大标题比画面铺满（8.6s）早 2.4s 浮现，留出处置「点击任意处开始剧本」的时间
  titleAt: 6.2,
  seed: 18890601,
  create(api) {
    // 每次打开一份新状态；外壳会在 beginIntro 时把这份数组挂到 api.growth
    const seeds = SEEDS.map((s) => ({ ...s }));
    let sparkles = [];   // 闪点：落日同心环 + 海面倒影碎金
    let simT = 0;        // 闪点闪烁用的累计时间（demo 原样：simT += dt / 30）

    /* 网格缓存：同一小格内共用 权重/色系/生长门控/流场（demo 原样，状态现读 api） */
    function cellInfo(x, y) {
      const growth = api.growth;
      const key = ((x * 80) | 0) * 128 + ((y * 80) | 0);
      let c = api.cellCache.get(key);
      if (c) return c;
      const sea = y >= HOR;
      const em = emphasis(x, y);
      const dSun = Math.hypot(x - SUN.x, (y - SUN.y) / 0.9);
      const sun = sea ? 0 : Math.exp(-((dSun / (SUN.r * 0.55)) ** 2));
      let gold = 0;
      if (sea) {
        gold = Math.exp(-(((x - SUN.x) / reflW(y)) ** 2)) * (0.35 + 0.65 * em);
      }
      const kind = sun > 0.45 ? 3 : (gold > 0.38 ? 2 : (sea ? 1 : 0));
      let g = 1;
      if (growth) {
        g = 0;
        for (const s of growth) {
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
      c = { em, kind, g, fx: f[0], fy: f[1] };
      api.cellCache.set(key, c);
      return c;
    }
    function colorOf(info, tone) {
      if (info.kind === 3) return SUNC[tone % 4];
      if (info.kind === 2) return GOLD[Math.min(5, tone)];
      return (info.kind === 0 ? SKY : SEA)[tone];
    }
    function colorAt(x, y, tone) { return colorOf(cellInfo(x, y), tone); }

    /* ---------- 底涂：天空/海面渐变 + 静态流线 + 落日半 disc + 同心虚线环 ---------- */
    function paintUnder() {
      const rnd = () => api.rnd();
      const scale = api.scale;
      const baseCtx = api.baseCtx;
      const w = api.under.width, h = api.under.height, hy = HOR * scale;
      const gSky = baseCtx.createLinearGradient(0, 0, 0, hy);
      gSky.addColorStop(0, '#2b2836'); gSky.addColorStop(0.4, '#5a2c1c');
      gSky.addColorStop(0.75, '#8a4423'); gSky.addColorStop(1, '#b8642a');
      baseCtx.fillStyle = gSky; baseCtx.fillRect(0, 0, w, hy);
      const gSea = baseCtx.createLinearGradient(0, hy, 0, h);
      gSea.addColorStop(0, '#0a2130'); gSea.addColorStop(1, '#061824');
      baseCtx.fillStyle = gSea; baseCtx.fillRect(0, hy, w, h - hy);
      baseCtx.lineCap = 'round';
      for (let i = 0; i < 26000; i++) {
        let x = rnd() * W, y = rnd();
        const m = i % 5;
        if (m === 0 || m === 1) { x = rnd() * W; y = 0.02 + rnd() * (HOR - 0.04); }
        else if (m === 2 || m === 3) { x = rnd() * W; y = HOR + 0.02 + rnd() * (1 - HOR - 0.03); }
        else { const v = VORT[Math.floor(rnd() * VORT.length)], a = rnd() * TAU, r = v.r * (0.4 + rnd() * 1.5);
          x = v.x + Math.cos(a) * r; y = v.y + Math.sin(a) * r * 0.85; }
        const tone = Math.min(6, Math.floor(rnd() * 7));
        baseCtx.strokeStyle = colorAt(x, y, tone);
        baseCtx.globalAlpha = (0.09 + rnd() * 0.46) * emphasis(x, y);
        baseCtx.lineWidth = (0.4 + rnd() ** 2 * 1.9) * scale / 800;
        baseCtx.beginPath(); baseCtx.moveTo(x * scale, y * scale);
        const steps = 5 + Math.floor(rnd() * 30);
        for (let j = 0; j < steps; j++) { const d = field(x, y); x += d[0] * 0.012; y += d[1] * 0.012; baseCtx.lineTo(x * scale, y * scale); }
        baseCtx.stroke();
      }
      baseCtx.globalAlpha = 1;
      // 落日半 disc（海平线以上）
      baseCtx.save();
      baseCtx.beginPath(); baseCtx.rect(0, 0, w, hy); baseCtx.clip();
      const gSun = baseCtx.createRadialGradient(SUN.x * scale, SUN.y * scale, 0, SUN.x * scale, SUN.y * scale, SUN.r * 1.15 * scale);
      gSun.addColorStop(0, '#ffe9ac99'); gSun.addColorStop(0.45, '#f7c46955'); gSun.addColorStop(1, '#f7c46900');
      baseCtx.fillStyle = gSun;
      baseCtx.fillRect((SUN.x - SUN.r * 1.2) * scale, (SUN.y - SUN.r * 1.2) * scale, SUN.r * 2.4 * scale, SUN.r * 2.4 * scale);
      // 同心虚线光环
      baseCtx.setLineDash([2 * scale / 800, 3 * scale / 800]);
      for (const rr of [0.5, 0.75, 1.0, 1.3, 1.6]) {
        baseCtx.strokeStyle = 'rgba(255,224,140,0.22)';
        baseCtx.lineWidth = 1 * scale / 800;
        baseCtx.beginPath();
        baseCtx.arc(SUN.x * scale, SUN.y * scale, rr * SUN.r * scale, 0, TAU);
        baseCtx.stroke();
      }
      baseCtx.setLineDash([]);
      baseCtx.restore();
      // 海平线
      baseCtx.fillStyle = '#2a2430';
      baseCtx.fillRect(0, hy - 1 * scale / 800, w, 2 * scale / 800);
      api.inkCtx.drawImage(api.under, 0, 0);
      // demo 在 setup() 里 paintUnder() 之后紧接 buildSparkles()；
      // 外壳只回调 paintUnder，这里放在末尾以保持完全相同的 rnd 消耗顺序
      buildSparkles();
    }

    /* 闪点：落日同心环 + 海面倒影碎金（demo 的 buildSparkles，随底涂一起重建） */
    function buildSparkles() {
      const rnd = () => api.rnd();
      sparkles = [];
      for (const rr of [0.5, 0.75, 1.0, 1.3, 1.6]) {
        const n = 34;
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU;
          const x = SUN.x + Math.cos(a) * rr * SUN.r;
          const y = SUN.y + Math.sin(a) * rr * SUN.r * 0.9;
          if (y >= HOR - 0.005) continue;
          sparkles.push({ x, y, s: 0.6 + rnd() * 0.9, ph: rnd() * TAU, c: '#ffe9ac' });
        }
      }
      for (let i = 0; i < 240; i++) {
        const y = HOR + 0.02 + rnd() * (1 - HOR - 0.04);
        const x = SUN.x + (rnd() - 0.5) * 2 * reflW(y) * 0.95;
        if (x < 0 || x > W) continue;
        sparkles.push({ x, y, s: 0.5 + rnd() * 0.9, ph: rnd() * TAU, c: rnd() < 0.8 ? '#f2c766' : '#bff0e4' });
      }
    }

    /* ---------- 粒子笔触 ---------- */
    function spawn(initial) {
      const rnd = () => api.rnd();
      let x = rnd() * 1.7 - 0.05, y = rnd() * 1.08 - 0.04;
      const area = rnd();
      if (area < 0.42) { x = rnd() * W; y = 0.02 + rnd() * (HOR - 0.04); }
      else if (area < 0.80) { x = rnd() * W; y = HOR + 0.02 + rnd() * (1 - HOR - 0.03); }
      return { x, y, age: initial ? Math.floor(rnd() * 180) : 0, life: 120 + Math.floor(rnd() * 220), tone: Math.min(6, Math.floor(rnd() ** 1.35 * 7)), width: 0.3 + rnd() ** 2 * 1.0, phase: rnd() * TAU };
    }

    /* 一帧：把粒子笔触按 颜色×透明度×宽度 分桶批量画到 ink 层，再叠闪点与生长光晕。
       （demo 原 step(dt, show)；refreshGrowth / gpu.advance / present 由外壳负责，已删） */
    function stepBody(dt) {
      const scale = api.scale;
      const inkCtx = api.inkCtx;
      const particles = api.particles;
      const buckets = api.buckets;
      const growth = api.growth;
      const gpu = api.gpu;
      const introT = api.introT;
      simT += dt / 30;
      if (gpu) {
        inkCtx.clearRect(0, 0, api.ink.width, api.ink.height);
      } else {
        inkCtx.globalAlpha = Math.min(0.9, 0.028 * dt);
        inkCtx.drawImage(growth ? api.baseIntro : api.under, 0, 0);
        inkCtx.globalAlpha = 1;
      }
      api.cellCache.clear();
      buckets.clear();
      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        p.age += dt;
        if (p.age > p.life || p.x < -0.12 || p.x > 1.72 || p.y < -0.12 || p.y > 1.12) p = particles[i] = spawn(false);
        const info = cellInfo(p.x, p.y);
        const nx = p.x + info.fx * 0.018 * dt, ny = p.y + info.fy * 0.018 * dt;
        const alpha = (0.28 + 0.4 * Math.sin(p.phase + p.age * 0.025) ** 2) * info.em * info.g;
        if (alpha > 0.02) {
          const ci = info.kind * 7 + (info.kind === 3 ? p.tone % 4 : p.tone);
          const aq = Math.min(7, Math.round(alpha * 7));
          const wq = Math.min(3, Math.round(p.width * 2.5));
          const key = ci * 32 + aq * 4 + wq;
          let b = buckets.get(key);
          if (!b) {
            b = { style: colorOf(info, p.tone), alpha: aq / 7, width: (wq / 2.5) * scale / 800, pts: [] };
            buckets.set(key, b);
          }
          b.pts.push(p.x * scale, p.y * scale, nx * scale, ny * scale);
        }
        p.x = nx; p.y = ny;
      }
      inkCtx.lineCap = 'round';
      for (const b of buckets.values()) {
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
      // 闪点（随生长门控显现，微微闪烁）
      for (const sp of sparkles) {
        const g = growth ? cellInfo(sp.x, sp.y).g : 1;
        if (g <= 0.02) continue;
        const tw = 0.25 + 0.55 * Math.sin(simT * 2 + sp.ph) ** 2;
        inkCtx.globalAlpha = tw * g;
        inkCtx.fillStyle = sp.c;
        const s = sp.s * scale / 800;
        inkCtx.fillRect(sp.x * scale - s / 2, sp.y * scale - s / 2, s, s);
      }
      inkCtx.globalAlpha = 1;
      if (growth) {
        // 生长中的六处光辉：暖环（天空/落日）或冷环（海面）缓缓晕开、随生长衰减
        for (const s of growth) {
          if (s.rOut2 <= 0) continue;
          const u = Math.min(1, Math.max(0, (introT - s.t0) / s.dur));
          const fade = Math.min(1, Math.max(0, (introT - s.t0) / 0.5)) * Math.pow(1 - u, 1.6);
          if (fade <= 0.01) continue;
          const r = (s.warm ? 0.09 : 0.085) * scale;
          const col = s.warm ? '255,224,140' : '150,220,220';
          const a0 = s.warm ? 0.035 : 0.02;
          const g = inkCtx.createRadialGradient(s.x * scale, s.y * scale, 0, s.x * scale, s.y * scale, r);
          g.addColorStop(0, `rgba(${col},${a0 * fade})`);
          g.addColorStop(0.4, `rgba(${col},${a0 * 0.45 * fade})`);
          g.addColorStop(1, `rgba(${col},0)`);
          inkCtx.fillStyle = g;
          inkCtx.fillRect(s.x * scale - r, s.y * scale - r, r * 2, r * 2);
        }
      } else {
        // 铺满后：只剩落日的常驻暖光晕
        const r = SUN.r * 0.95 * scale;
        const g = inkCtx.createRadialGradient(SUN.x * scale, SUN.y * scale, 0, SUN.x * scale, SUN.y * scale, r);
        g.addColorStop(0, 'rgba(255,240,179,0.03)');
        g.addColorStop(0.35, 'rgba(247,196,105,0.016)');
        g.addColorStop(1, 'rgba(247,196,105,0)');
        inkCtx.fillStyle = g;
        inkCtx.fillRect(SUN.x * scale - r, SUN.y * scale - r, r * 2, r * 2);
      }
    }

    /* ---------- 生长开场 ---------- */
    function updateGrowthBody(t) {
      for (const s of seeds) {
        const u = Math.min(1, Math.max(0, (t - s.t0) / s.dur));
        s.r = u <= 0 ? 0 : s.maxR * easeGrow(u);
        s.rOut = s.r + FEATHER;
        s.rOut2 = s.rOut * s.rOut;
      }
    }
    /* Canvas2D 回退：把底涂按生长光晕裁进 baseIntro（无 WebGL2 时外壳才调用） */
    function refreshGrowthBody() {
      const growth = api.growth;
      const scale = api.scale;
      const maskCtx = api.maskCtx;
      const bIntroCtx = api.bIntroCtx;
      const w = api.under.width, h = api.under.height;
      maskCtx.clearRect(0, 0, w, h);
      maskCtx.globalCompositeOperation = 'lighter';
      for (const s of growth) {
        if (s.rOut2 <= 0) continue;
        const R = s.rOut * scale;
        const g = maskCtx.createRadialGradient(s.x * scale, s.y * scale, 0, s.x * scale, s.y * scale, R);
        const inner = Math.max(0, Math.min(1, s.r / s.rOut));
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(inner, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        maskCtx.fillStyle = g;
        maskCtx.fillRect(s.x * scale - R, s.y * scale - R, R * 2, R * 2);
      }
      maskCtx.globalCompositeOperation = 'source-over';
      bIntroCtx.clearRect(0, 0, w, h);
      bIntroCtx.drawImage(api.under, 0, 0);
      bIntroCtx.globalCompositeOperation = 'destination-in';
      bIntroCtx.drawImage(api.maskC, 0, 0);
      bIntroCtx.globalCompositeOperation = 'source-over';
    }

    // 外壳按 hooks.step(api, dt) / hooks.updateGrowth(api, t) 传参调用；
    // 运行时状态一律现读闭包里的 api，第一个实参忽略即可
    return {
      seeds,
      makeFilm(canvas) { return new Film(canvas); },
      paintUnder() { paintUnder(); },
      spawn(initial) { return spawn(initial); },
      step(_api, dt) { stepBody(dt); },
      updateGrowth(_api, t) { updateGrowthBody(t); },
      refreshGrowth() { refreshGrowthBody(); },
    };
  },
};
