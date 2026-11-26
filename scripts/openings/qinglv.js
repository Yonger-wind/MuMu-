/* 《青绿长卷·千里未归》第一章开场动画：薄荷亮底下，青绿群山由等高流线织成、
   山脊洒金、白色云涡盘绕山腰、山脚一江碧水，数处光辉点燃后缓慢蔓延成画，完成后浮现剧名。
   源自 demo（单文件 HTML，青绿长卷·千里未归 · 开场动画），
   仅换成 scripts/openings/shell.js 的驱动契约，一笔画逻辑原样保留。
   管线：Canvas2D 粒子笔触 → WebGL2 浮点拖尾累积 → 辉光 → ACES。 */

const TAU = Math.PI * 2;
const W = 1.6, H = 1;

/* 画面合成/氛围参数：开场动画专用，不提供调节面板。
   shell 的 OPENING.params 只认 speed/density，其余（mist/gold/bloom/exposure）
   作为本模块级常量原样保留，供 paintUnder / step / Film 读取（数值照 demo，未改）。 */
const params = { speed: 3.00, density: 2000, mist: 0.35, gold: 1.00, bloom: 2.00, exposure: 1.35 };

/* ---------- 山体：近→远排列，_own 取第一座山脊高于该点的山 ---------- */
/* peaks: [峰心x, 峰高, 峰宽]；ridge(x) = base - Σ 高斯峰 */
const RANGES = [
  { base: 0.80, peaks: [[0.15, 0.56, 0.130], [0.00, 0.34, 0.080], [0.30, 0.26, 0.060]], near: true },   // 左前景大山
  { base: 0.84, peaks: [[0.99, 0.47, 0.150], [0.87, 0.24, 0.070]], near: true },   // 右前景坡岭
  { base: 0.80, peaks: [[0.78, 0.70, 0.130], [0.40, 0.48, 0.110], [0.58, 0.30, 0.070]], near: false }, // 中景主峰
  { base: 0.60, peaks: [[0.28, 0.30, 0.090], [0.52, 0.34, 0.080], [0.88, 0.28, 0.090]], near: false }, // 远山淡金
];
function ridgeOf(r, x) {
  let y = r.base;
  for (const [px, h, w] of r.peaks) { const t = (x - px) / w; y -= h * Math.exp(-t * t); }
  return y;
}
function ridgeDOf(r, x) {
  let d = 0;
  for (const [px, h, w] of r.peaks) { const t = (x - px) / w; d += h * Math.exp(-t * t) * 2 * t / w; }
  return d;
}
function ownerOf(x, y) {
  for (let i = 0; i < RANGES.length; i++) if (y >= ridgeAt(i, x) - 0.004) return i;
  return -1;
}
/* 山脊查表：每帧数万次求值走线性插值，避免重复高斯 */
const RN = 384;
let ridgeTab = [], ridgeDTab = [];
function buildRidgeTabs() {
  ridgeTab = RANGES.map(r => { const a = new Float32Array(RN + 1); for (let i = 0; i <= RN; i++) a[i] = ridgeOf(r, i / RN * W); return a; });
  ridgeDTab = RANGES.map(r => { const a = new Float32Array(RN + 1); for (let i = 0; i <= RN; i++) a[i] = ridgeDOf(r, i / RN * W); return a; });
}
function ridgeAt(oi, x) {
  const t = Math.min(RN - 1e-6, Math.max(0, x / W * RN)); const i = t | 0, f = t - i;
  const a = ridgeTab[oi]; return a[i] + (a[i + 1] - a[i]) * f;
}
function ridgeDAt(oi, x) {
  const t = Math.min(RN - 1e-6, Math.max(0, x / W * RN)); const i = t | 0, f = t - i;
  const a = ridgeDTab[oi]; return a[i] + (a[i + 1] - a[i]) * f;
}
/* 查表只依赖 RANGES/W，内容恒定；demo 在每次 setup 重建，这里在模块装载时建一次即可 */
buildRidgeTabs();

/* ---------- 江面：蜿蜒顶线 + 平行流带 ---------- */
const riverTop = x => 0.735 + 0.050 * Math.sin(2.0 * x + 0.7) + 0.015 * Math.sin(4.7 * x + 2);
const riverTopD = x => 0.100 * Math.cos(2.0 * x + 0.7) + 0.0705 * Math.cos(4.7 * x + 2);
const RIVER_BANDS = [
  { off: 0.030, A: 0.010, k: 5.2, p: 0.4 },
  { off: 0.065, A: 0.013, k: 6.1, p: 1.6 },
  { off: 0.100, A: 0.016, k: 5.5, p: 2.7 },
  { off: 0.140, A: 0.018, k: 6.6, p: 0.9 },
  { off: 0.180, A: 0.020, k: 5.8, p: 2.1 },
  { off: 0.220, A: 0.021, k: 6.3, p: 3.3 },
  { off: 0.260, A: 0.022, k: 5.1, p: 1.2 },
];
const rbandY = (b, x) => riverTop(x) + b.off + b.A * Math.sin(b.k * x + b.p);
const rbandD = (b, x) => riverTopD(x) + b.A * b.k * Math.cos(b.k * x + b.p);
/* ---------- 云涡：白色螺旋 ---------- */
const SWIRL = [
  { x: 0.720, y: 0.475, r: 0.055, s: 0.15 },
  { x: 0.845, y: 0.455, r: 0.040, s: -0.13 },
  { x: 0.175, y: 0.645, r: 0.050, s: 0.14 },
  { x: 0.115, y: 0.715, r: 0.038, s: -0.12 },
  { x: 0.630, y: 0.575, r: 0.030, s: 0.11 },
  { x: 0.800, y: 0.745, r: 0.034, s: -0.11 },
  { x: 0.420, y: 0.440, r: 0.026, s: 0.10 },
];
/* ---------- 云雾带 ---------- */
const MIST_BANDS = [
  { y0: 0.585, A: 0.020, k: 3.1, p: 0.5, w: 0.026 },
  { y0: 0.690, A: 0.025, k: 2.3, p: 1.8, w: 0.030 },
];
function mistAt(x, y) {
  let m = 0;
  for (const b of MIST_BANDS) {
    const d = y - (b.y0 + b.A * Math.sin(b.k * x + b.p));
    m = Math.max(m, Math.exp(-((d / b.w) ** 2)) * (0.45 + 0.55 * Math.sin(x * 5.3 + b.p * 2)));
  }
  for (const v of SWIRL) {
    if (Math.abs(x - v.x) > v.r * 2.6 || Math.abs(y - v.y) > v.r * 2.4) continue;
    const r = Math.hypot(x - v.x, (y - v.y) / 0.9) / v.r;
    if (r > 2.6) continue;
    m = Math.max(m, Math.exp(-(((r - 1.0) / 0.62) ** 2)) * 0.95);
  }
  return Math.min(1, m * params.mist);
}

/* 流场：江面顺流带切线、天空极缓横风、山体沿等高线（山脊切线），再叠加云涡旋卷 */
function fieldAt(x, y, rt, own) {
  let vx, vy = 0;
  if (y > rt) {                                   // 江流：顺流带切线
    vx = 0.16 + 0.03 * Math.sin(y * 21 + x * 4);
    let bw = 0, bd = 0;
    for (const b of RIVER_BANDS) {
      const w = Math.exp(-(((y - rbandY(b, x)) / 0.035) ** 2));
      if (w > bw) { bw = w; bd = rbandD(b, x); }
    }
    vy = bw * bd * vx * 0.9;
  } else if (own < 0) {                           // 天空：极缓横风
    vx = 0.045 + 0.012 * Math.sin(y * 13 + x * 3);
    vy = 0.006 * Math.sin(x * 7 + y * 5);
  } else {                                        // 山体：沿等高线（山脊切线）
    vx = 0.085 + 0.02 * Math.sin(y * 15 + own * 2.1);
    vy = ridgeDAt(own, x) * vx * 0.92 + 0.008 * Math.sin(x * 26 + y * 9 + own);
    // 接近下一座山的遮挡边界时改顺边界切线，避免两族流线对冲堆积成亮缝
    const nr = ownerOf(x, y + 0.08);
    if (nr >= 0 && nr !== own) {
      const db = ridgeAt(nr, x) - y;
      if (db < 0.06) {
        const w = 1 - db / 0.06;
        vy = vy * (1 - w) + (ridgeDAt(nr, x) * vx * 0.92) * w;
      }
    }
  }
  // 云涡旋卷
  let gmax = 0, rx = 0, ry = 0;
  for (const v of SWIRL) {
    const dx = x - v.x, dy = (y - v.y) / 0.9;
    const r2 = dx * dx + dy * dy;
    const cut = v.r * 3.2;
    if (r2 > cut * cut) continue;
    const g = Math.exp(-r2 / (2 * v.r * v.r));
    if (g > gmax) gmax = g;
    const a = v.s * g / Math.sqrt(r2 + 0.0012);
    const sink = 0.06 * g;
    rx += -dy * a - dx * sink;
    ry += dx * a * 0.9 - dy * sink * 0.9;
  }
  vx = vx * (1 - 0.6 * gmax) + rx;
  vy = vy * (1 - 0.6 * gmax) + ry;
  return [vx, vy];
}
function field(x, y) {
  const rt = riverTop(x);
  return fieldAt(x, y, rt, y > rt ? -1 : ownerOf(x, y));
}

/* 笔触权重：江面浪尖亮线 / 云涡环带 / 山体等高条纹 + 山脊金线 */
function emphasisAt(x, y, rt, own, m) {
  if (y > rt) {                                   // 江面浪尖亮线
    let s = 0.10;
    for (const b of RIVER_BANDS) {
      const d = y - rbandY(b, x);
      s = Math.max(s, Math.exp(-((d / 0.009) ** 2)));
    }
    return Math.min(1, s);
  }
  if (m > 0.62) {                                 // 云涡环带笔触
    let s = 0.30 * m;
    for (const v of SWIRL) {
      if (Math.abs(x - v.x) > v.r * 3.2 || Math.abs(y - v.y) > v.r * 2.9) continue;
      const r = Math.hypot(x - v.x, (y - v.y) / 0.9) / v.r;
      if (r > 3.2) continue;
      const ang = Math.atan2((y - v.y) / 0.9, x - v.x);
      const brush = 0.78 + 0.22 * Math.sin(ang * 2 + Math.log(r + 0.15) * 2.4 + v.x * 4);
      s = Math.max(s, Math.exp(-(((r - 1.05) / 0.66) ** 2)) * brush * 0.95);
    }
    return Math.min(1, s);
  }
  if (own < 0) return 0.06;                       // 天空几乎留白
  const d = y - ridgeAt(own, x);
  // 等高条纹：随山脊起伏的平行亮线
  const phase = d / 0.015 + 0.12 * Math.sin(x * 9 + own * 1.7);
  const stripe = 0.5 + 0.5 * Math.cos(TAU * phase);
  let s = 0.22 + 0.78 * stripe * stripe;
  s = Math.max(s, Math.exp(-((d / 0.020) ** 2)));  // 山脊金线
  if (own === 3) s *= 0.70;                        // 远山淡化
  return Math.min(1, s);
}
function emphasis(x, y) {
  const rt = riverTop(x);
  const own = y > rt ? -1 : ownerOf(x, y);
  return emphasisAt(x, y, rt, own, y > rt ? 0 : mistAt(x, y));
}

/* ---------- 配色：薄荷天 / 远山淡金 / 中景翠 / 前景深青 / 江碧 / 云白 / 脊金 ---------- */
const PALS = [
  ['#a8d8c0', '#bfe6d2', '#d2f0e0', '#e4f7ea', '#f2fbf4', '#ffffff', '#fdf6da'], // 0 天空
  ['#c9c39a', '#d8d3ac', '#e6e2c0', '#f0eccd', '#f7f3dc', '#fbf8e8', '#fffdf2'], // 1 远山
  ['#123f36', '#1a5a4a', '#237a62', '#2f9c7d', '#45b98f', '#6fd3a8', '#a5e8c4'], // 2 中景翠
  ['#175f52', '#23806c', '#33a184', '#4fbf9c', '#7fd8b8', '#b2ecd4', '#eafff5'], // 3 江流
  ['#cfe8dc', '#ddf2e6', '#e9f8ee', '#f4fcf6', '#fbfefb', '#ffffff', '#fdf8e4'], // 4 云雾
  ['#b98f3e', '#d3b061', '#e6cb8b', '#f2e0ac', '#f9edc8', '#fdf6e0', '#fffdf2'], // 5 山脊金
  ['#082a26', '#0d3b34', '#145448', '#1d7261', '#2a9078', '#3fb08c', '#7fd0ae'], // 6 前景深青
];
const FEATHER = 0.10;
const toneAt = (info, tone) => Math.min(6, Math.max(0, tone + info.shift));
function colorOf(info, tone) { return PALS[info.kind][toneAt(info, tone)]; }

/* ---------- WebGL2 合成器（原样保留，bloom/exposure 读上方模块常量） ---------- */
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
        vec3 c = texture(uSrc, vUv).rgb;
        float l = max(c.r, max(c.g, c.b));
        o = vec4(c * smoothstep(.85, 1.2, l), 1.);
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
        vec3 base = texture(uScene, vUv).rgb;
        vec3 c = aces((base + texture(uGlow, vUv).rgb * uBloom * .75) * uExposure);
        float vig = 1. - .14 * pow(length((vUv - .5) * vec2(1.1, 1.)), 1.5);
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

/* ---------- 生长光点：六处光辉点燃后蔓延成画（前 3 处暖金、后 3 处青白） ---------- */
const SEEDS = [
  { x: 0.78, y: 0.16, t0: 0.15, dur: 6.4, maxR: 1.05, warm: true },
  { x: 0.15, y: 0.30, t0: 0.90, dur: 5.9, maxR: 0.95, warm: true },
  { x: 0.40, y: 0.36, t0: 1.60, dur: 5.5, maxR: 0.90, warm: true },
  { x: 0.55, y: 0.86, t0: 2.20, dur: 5.6, maxR: 0.95, warm: false },
  { x: 0.17, y: 0.66, t0: 2.80, dur: 5.2, maxR: 0.90, warm: false },
  { x: 0.72, y: 0.48, t0: 3.30, dur: 5.2, maxR: 0.90, warm: false },
];
const easeGrow = u => u;

export const QINGLV = {
  key: 'qinglv',
  title: '青绿长卷·千里未归',
  ariaLabel: '青绿长卷·千里未归开场：薄荷天空下青绿群山由等高流线织成，山脊洒金，云涡盘绕山腰，山脚一江碧水，笔触缓慢生长成画后浮现剧名。',
  params: { speed: 3.00, density: 2000 },
  scaleCap: 800,
  introEnd: 8.6,
  // 大标题比画面铺满（8.6s）早 2.4s 浮现，留出处置「点击任意处开始剧本」的时间
  titleAt: 6.2,
  seed: 12060413,
  create(api) {
    /* ---- 云团 sprite（软云贴图，模块装载不能建 canvas，随一次开场创建） ---- */
    const puffSprite = document.createElement('canvas');
    puffSprite.width = puffSprite.height = 128;
    {
      const pc = puffSprite.getContext('2d');
      const g = pc.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(250,254,250,0.95)');
      g.addColorStop(0.45, 'rgba(244,252,246,0.55)');
      g.addColorStop(1, 'rgba(244,252,246,0)');
      pc.fillStyle = g; pc.fillRect(0, 0, 128, 128);
    }

    /* ---- 云团与闪点状态：每次 setup（paintUnder）重建，rnd 消费顺序与 demo 一致 ---- */
    let PUFFS = [];
    let sparkles = [];
    let simT = 0;

    /* 单元格信息（区域类别/权重/色阶偏移/生长门控/流向），按 80 格网格缓存 */
    function cellInfo(x, y) {
      const key = ((x * 80) | 0) * 128 + ((y * 80) | 0);
      let c = api.cellCache.get(key);
      if (c) return c;
      const growth = api.growth;
      const rt = riverTop(x);
      let kind, shift = 0, em, f;
      if (y > rt) {
        kind = 3; em = emphasisAt(x, y, rt, -1, 0); f = fieldAt(x, y, rt, -1);
      } else {
        const own = ownerOf(x, y);
        const m = mistAt(x, y);
        if (m > 0.62) {
          kind = 4; em = emphasisAt(x, y, rt, own, m); f = fieldAt(x, y, rt, own);
        } else if (own < 0) {
          kind = 0; em = 0.06; f = fieldAt(x, y, rt, -1);
        } else {
          const d = y - ridgeAt(own, x);
          const cr = Math.exp(-((d / 0.018) ** 2));
          const stripe = 0.5 + 0.5 * Math.cos(TAU * (d / 0.015 + 0.12 * Math.sin(x * 9 + own * 1.7)));
          if (cr > 0.45) kind = 5;
          else {
            kind = own === 3 ? 1 : (RANGES[own].near ? 6 : 2);
            shift = Math.round(cr * 2) + (stripe > 0.55 ? 3 : 0) - (d > 0.30 ? 1 : 0);
          }
          em = emphasisAt(x, y, rt, own, m); f = fieldAt(x, y, rt, own);
        }
      }
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
      c = { em, kind, shift, g, fx: f[0], fy: f[1] };
      api.cellCache.set(key, c);
      return c;
    }
    function colorAt(x, y, tone) { return colorOf(cellInfo(x, y), tone); }

    /* 飘云团位置：八组云线 + 每个云涡外缘两团（用 api.rnd，随底涂一起重建） */
    function buildPuffs() {
      PUFFS = [];
      const CL = [[0.10, 0.66], [0.30, 0.60], [0.52, 0.66], [0.70, 0.60], [0.90, 0.66], [0.16, 0.72], [0.60, 0.72], [0.86, 0.74]];
      for (const [cx, cy] of CL) {
        for (let i = 0; i < 4; i++) {
          PUFFS.push({ x: cx + (api.rnd() - 0.5) * 0.10, y: cy + (api.rnd() - 0.5) * 0.04, s: 0.05 + api.rnd() * 0.045, a: 0.5 + api.rnd() * 0.35, sp: 0.5 + api.rnd() });
        }
      }
      for (const v of SWIRL) {
        for (let i = 0; i < 2; i++) {
          const a = api.rnd() * TAU, r = v.r * (1.3 + api.rnd() * 0.9);
          PUFFS.push({ x: v.x + Math.cos(a) * r, y: v.y + Math.sin(a) * r * 0.9, s: 0.035 + api.rnd() * 0.05, a: 0.3 + api.rnd() * 0.35, sp: 0.4 + api.rnd() });
        }
      }
    }

    /* 闪点：山脊洒金 + 天空星点 + 江面碎光（用 api.rnd，底涂完成后重建） */
    function buildSparkles() {
      sparkles = [];
      for (let i = 0; i < 64; i++) {
        sparkles.push({ x: api.rnd() * W, y: api.rnd() * 0.46, s: 0.5 + api.rnd() * 1.0, ph: api.rnd() * TAU, c: api.rnd() < 0.55 ? '#fff6d8' : '#ffffff', gold: api.rnd() < 0.55 });
      }
      for (let oi = 0; oi < RANGES.length; oi++) {
        const r = RANGES[oi];
        for (let i = 0; i < 140; i++) {
          const x = api.rnd() * W;
          const y = ridgeOf(r, x) + (api.rnd() - 0.35) * 0.02;
          if (ownerOf(x, y + 0.006) !== oi) continue;
          sparkles.push({ x, y, s: 0.7 + api.rnd() * 1.3, ph: api.rnd() * TAU, c: '#f7e8c0', gold: true });
        }
      }
      for (let i = 0; i < 90; i++) {
        const x = api.rnd() * W;
        const y = riverTop(x) + 0.02 + api.rnd() * (1 - riverTop(x) - 0.04);
        sparkles.push({ x, y, s: 0.4 + api.rnd() * 0.8, ph: api.rnd() * TAU, c: '#eafff5', gold: false });
      }
    }

    /* ---------- 底涂：薄荷天空 + 四层山体 + 等高线织物 + 江面 + 静态流线 + 山脊金线 + 静态云团 ---------- */
    function paintUnder() {
      const scale = api.scale;
      const baseCtx = api.baseCtx;
      const w = api.under.width, h = api.under.height;
      buildPuffs();
      const gSky = baseCtx.createLinearGradient(0, 0, 0, 0.66 * scale);
      gSky.addColorStop(0, '#b7e0c8'); gSky.addColorStop(0.55, '#cfeadb'); gSky.addColorStop(1, '#e4f4e6');
      baseCtx.fillStyle = gSky; baseCtx.fillRect(0, 0, w, h);
      // 山体自远而近铺底
      const order = [3, 2, 1, 0];
      for (const oi of order) {
        const r = RANGES[oi];
        baseCtx.beginPath();
        baseCtx.moveTo(0, h);
        for (let x = 0; x <= W + 0.001; x += 0.01) baseCtx.lineTo(x * scale, ridgeOf(r, x) * scale);
        baseCtx.lineTo(w, h); baseCtx.closePath();
        const g = baseCtx.createLinearGradient(0, (r.base - 0.6) * scale, 0, r.base * scale);
        if (oi === 3) { g.addColorStop(0, '#efe9cb'); g.addColorStop(1, '#cfe4cd'); }
        else if (oi === 2) { g.addColorStop(0, '#45b98f'); g.addColorStop(0.5, '#1d7261'); g.addColorStop(1, '#0d3b34'); }
        else { g.addColorStop(0, '#2a9078'); g.addColorStop(0.45, '#145448'); g.addColorStop(1, '#082a26'); }
        baseCtx.fillStyle = g; baseCtx.fill();
      }
      // 等高线织物：自远而近，沿山脊偏移的平行明暗线
      baseCtx.lineCap = 'round';
      for (const oi of order) {
        const r = RANGES[oi];
        const pal = oi === 3 ? PALS[1] : (r.near ? PALS[6] : PALS[2]);
        let k = 0;
        for (let c = 0.012; c < 0.62; c += 0.013, k++) {
          const crest = c < 0.024;
          let ti = crest ? 4 + (k % 2) : (k % 3 === 0 ? 5 : (k % 3 === 1 ? 3 : 1));
          ti = Math.max(0, ti - Math.floor(c / 0.34));
          if (oi === 3) ti = Math.min(6, ti + 1);
          baseCtx.strokeStyle = crest ? PALS[5][ti] : pal[ti];
          baseCtx.globalAlpha = 0.30 + api.rnd() * 0.30;
          baseCtx.lineWidth = (0.5 + api.rnd() * 0.7) * scale / 800;
          baseCtx.beginPath();
          let pen = false;
          for (let x = 0; x <= W + 0.001; x += 0.01) {
            const y = ridgeOf(r, x) + c + 0.0025 * Math.sin(x * 40 + k * 1.3);
            if (y > riverTop(x) - 0.004 || y > r.base + 0.06) { pen = false; continue; }
            if (!pen) { baseCtx.moveTo(x * scale, y * scale); pen = true; }
            else baseCtx.lineTo(x * scale, y * scale);
          }
          baseCtx.stroke();
        }
      }
      baseCtx.globalAlpha = 1;
      // 江面铺底
      baseCtx.beginPath();
      baseCtx.moveTo(0, h);
      for (let x = 0; x <= W + 0.001; x += 0.01) baseCtx.lineTo(x * scale, riverTop(x) * scale);
      baseCtx.lineTo(w, h); baseCtx.closePath();
      const gR = baseCtx.createLinearGradient(0, 0.72 * scale, 0, h);
      gR.addColorStop(0, '#2a9078'); gR.addColorStop(0.5, '#175f52'); gR.addColorStop(1, '#0e453c');
      baseCtx.fillStyle = gR; baseCtx.fill();
      // 静态流线笔触
      baseCtx.lineCap = 'round';
      for (let i = 0; i < 26000; i++) {
        let x = api.rnd() * W, y = api.rnd();
        const m = i % 5;
        if (m === 0 || m === 1 || m === 2) { x = api.rnd() * W; y = 0.10 + api.rnd() * 0.66; }
        else if (m === 3) { x = api.rnd() * W; y = riverTop(x) + 0.01 + api.rnd() * (1 - riverTop(x) - 0.02); }
        else { const v = SWIRL[Math.floor(api.rnd() * SWIRL.length)], a = api.rnd() * TAU, r = v.r * (0.4 + api.rnd() * 1.5);
          x = v.x + Math.cos(a) * r; y = v.y + Math.sin(a) * r * 0.9; }
        const tone = Math.min(6, Math.floor(api.rnd() * 7));
        baseCtx.strokeStyle = colorAt(x, y, tone);
        baseCtx.globalAlpha = (0.09 + api.rnd() * 0.46) * emphasis(x, y);
        baseCtx.lineWidth = (0.4 + api.rnd() ** 2 * 1.9) * scale / 800;
        baseCtx.beginPath(); baseCtx.moveTo(x * scale, y * scale);
        const steps = 5 + Math.floor(api.rnd() * 30);
        for (let j = 0; j < steps; j++) { const d = field(x, y); x += d[0] * 0.012; y += d[1] * 0.012; baseCtx.lineTo(x * scale, y * scale); }
        baseCtx.stroke();
      }
      baseCtx.globalAlpha = 1;
      // 山脊金线（虚线细描）
      baseCtx.setLineDash([2 * scale / 800, 3 * scale / 800]);
      for (let oi = 0; oi < RANGES.length; oi++) {
        const r = RANGES[oi];
        baseCtx.strokeStyle = oi === 3 ? 'rgba(240,228,170,0.35)' : 'rgba(242,224,172,0.5)';
        baseCtx.lineWidth = 1 * scale / 800;
        baseCtx.beginPath();
        for (let x = 0; x <= W + 0.001; x += 0.01) {
          const y = ridgeOf(r, x);
          if (ownerOf(x, y + 0.006) !== oi) { baseCtx.moveTo(x * scale, y * scale); continue; }
          baseCtx.lineTo(x * scale, y * scale);
        }
        baseCtx.stroke();
      }
      baseCtx.setLineDash([]);
      // 静态云团
      for (const p of PUFFS) {
        const s = p.s * scale;
        baseCtx.globalAlpha = p.a * 0.45 * params.mist;
        baseCtx.drawImage(puffSprite, p.x * scale - s, p.y * scale - s * 0.62, s * 2, s * 1.24);
      }
      baseCtx.globalAlpha = 1;
      api.inkCtx.drawImage(api.under, 0, 0);
      buildSparkles();
    }

    /* ---------- 粒子笔触：多数落在山体与江面 ---------- */
    function spawn(initial) {
      let x = api.rnd() * 1.7 - 0.05, y = api.rnd() * 1.08 - 0.04;
      const area = api.rnd();
      if (area < 0.62) {
        x = api.rnd() * W;
        const oi = [0, 0, 1, 2, 2, 2, 3][Math.floor(api.rnd() * 7)];
        const top = ridgeOf(RANGES[oi], x);
        const bot = Math.min(RANGES[oi].base, riverTop(x)) - 0.01;
        y = top + api.rnd() * Math.max(0.02, bot - top);
      }
      else if (area < 0.86) { x = api.rnd() * W; y = riverTop(x) + 0.01 + api.rnd() * (1 - riverTop(x) - 0.02); }
      return { x, y, age: initial ? Math.floor(api.rnd() * 180) : 0, life: 120 + Math.floor(api.rnd() * 220), tone: Math.min(6, Math.floor(api.rnd() ** 1.35 * 7)), width: 0.3 + api.rnd() ** 2 * 1.0, phase: api.rnd() * TAU };
    }

    /* ---------- 一帧：流线笔触（按色/透明度/宽度分桶）+ 飘云 + 闪点 + 生长光晕 ---------- */
    function step(_api, dt) {
      const scale = api.scale;
      const inkCtx = api.inkCtx;
      const particles = api.particles;
      const growth = api.growth;
      simT += dt / 30;
      if (api.gpu) {
        inkCtx.clearRect(0, 0, api.ink.width, api.ink.height);
      } else {
        inkCtx.globalAlpha = Math.min(0.9, 0.028 * dt);
        inkCtx.drawImage(growth ? api.baseIntro : api.under, 0, 0);
        inkCtx.globalAlpha = 1;
      }
      api.cellCache.clear();
      api.buckets.clear();
      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        p.age += dt;
        if (p.age > p.life || p.x < -0.12 || p.x > 1.72 || p.y < -0.12 || p.y > 1.12) p = particles[i] = spawn(false);
        const info = cellInfo(p.x, p.y);
        const nx = p.x + info.fx * 0.018 * dt, ny = p.y + info.fy * 0.018 * dt;
        const alpha = (0.28 + 0.4 * Math.sin(p.phase + p.age * 0.025) ** 2) * info.em * info.g;
        if (alpha > 0.02) {
          const ti = toneAt(info, p.tone);
          const ci = info.kind * 7 + ti;
          const aq = Math.min(7, Math.round(alpha * 7));
          const wq = Math.min(3, Math.round(p.width * 2.5));
          const key = ci * 32 + aq * 4 + wq;
          let b = api.buckets.get(key);
          if (!b) {
            b = { style: PALS[info.kind][ti], alpha: aq / 7, width: (wq / 2.5) * scale / 800, pts: [] };
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
      // 飘云：缓慢横移的软云团
      if (params.mist > 0.02) {
        for (const p of PUFFS) {
          const x = ((p.x + simT * 0.006 * p.sp) % (W + 0.3)) - 0.15;
          const s = p.s * scale;
          inkCtx.globalAlpha = 0.05 * p.a * params.mist;
          inkCtx.drawImage(puffSprite, x * scale - s, p.y * scale - s * 0.62, s * 2, s * 1.24);
        }
        inkCtx.globalAlpha = 1;
      }
      // 闪点（随生长门控显现，微微闪烁）
      for (const sp of sparkles) {
        const g = growth ? cellInfo(sp.x, sp.y).g : 1;
        if (g <= 0.02) continue;
        const gm = sp.gold ? params.gold : 1;
        if (gm <= 0.02) continue;
        const tw = (0.25 + 0.55 * Math.sin(simT * 2 + sp.ph) ** 2) * gm;
        inkCtx.globalAlpha = tw * g;
        inkCtx.fillStyle = sp.c;
        const s = sp.s * scale / 800;
        inkCtx.fillRect(sp.x * scale - s / 2, sp.y * scale - s / 2, s, s);
      }
      inkCtx.globalAlpha = 1;
      if (growth) {
        const introT = api.introT;
        for (const s of growth) {
          if (s.rOut2 <= 0) continue;
          const u = Math.min(1, Math.max(0, (introT - s.t0) / s.dur));
          const fade = Math.min(1, Math.max(0, (introT - s.t0) / 0.5)) * Math.pow(1 - u, 1.6);
          if (fade <= 0.01) continue;
          const r = (s.warm ? 0.09 : 0.085) * scale;
          const col = s.warm ? '247,232,192' : '190,240,220';
          const a0 = s.warm ? 0.035 : 0.025;
          const g = inkCtx.createRadialGradient(s.x * scale, s.y * scale, 0, s.x * scale, s.y * scale, r);
          g.addColorStop(0, `rgba(${col},${a0 * fade})`);
          g.addColorStop(0.4, `rgba(${col},${a0 * 0.45 * fade})`);
          g.addColorStop(1, `rgba(${col},0)`);
          inkCtx.fillStyle = g;
          inkCtx.fillRect(s.x * scale - r, s.y * scale - r, r * 2, r * 2);
        }
      }
    }

    const seeds = SEEDS.map((s) => ({ ...s }));

    /* ---------- 生长时间轴：写每个光点的 r / rOut / rOut2（introT 由外壳负责） ---------- */
    function updateGrowth(_api, t) {
      for (const s of seeds) {
        const u = Math.min(1, Math.max(0, (t - s.t0) / s.dur));
        s.r = u <= 0 ? 0 : s.maxR * easeGrow(u);
        s.rOut = s.r + FEATHER;
        s.rOut2 = s.rOut * s.rOut;
      }
    }
    /* Canvas2D 回退：把底涂裁进生长遮罩里（无 WebGL2 时每帧调用） */
    function refreshGrowth() {
      const scale = api.scale;
      const maskCtx = api.maskCtx;
      const bIntroCtx = api.bIntroCtx;
      const growth = api.growth;
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

    return {
      seeds,
      makeFilm(canvas) { return new Film(canvas); },
      paintUnder,
      spawn,
      step,
      updateGrowth,
      refreshGrowth,
    };
  },
};
