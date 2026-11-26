/* 《月光下的未完奏鸣》第一章开场动画：深蓝夜幕上，金色与冰蓝五线谱带蜿蜒盘成漩涡，
   金粉星屑与精致音符漂浮其间，数处光辉点燃后笔触缓慢生长成画，完成后浮现大标题。
   源自单文件 demo《月光下的未完奏鸣 · 开场动画》，仅换成 scripts/openings/shell.js 的
   驱动契约（外壳负责挂载/主循环/生长状态机/标题/交互），画面逻辑与常量数值原样保留。 */

const TAU = Math.PI * 2;
const W = 1.6, H = 1;

/* demo 原有固定参数：外壳只读取 OPENING.params 的 speed / density；
   glitter / notes / bloom / exposure 只服务于 Film 合成器与绘制代码，
   按契约保留为模块级常量（Film 内部按 demo 原样引用 params.xxx），数值照抄。 */
const params = { speed: 3.00, density: 2000, glitter: 1.00, notes: 1.00, bloom: 0.00, exposure: 1.50 };

/* ---------- 谱带：六条蜿蜒中心线（金 / 冰蓝交替），平行五线 ---------- */
const RIBBONS = [
  { base: 0.10, A1: 0.070, k1: 3.8, p1: 0.4, A2: 0.020, k2: 8.2, p2: 1.7, fam: 1 },
  { base: 0.26, A1: 0.095, k1: 4.2, p1: 2.2, A2: 0.026, k2: 7.4, p2: 0.6, fam: 0 },
  { base: 0.42, A1: 0.105, k1: 3.5, p1: 4.0, A2: 0.030, k2: 8.8, p2: 2.9, fam: 1 },
  { base: 0.58, A1: 0.090, k1: 4.5, p1: 1.1, A2: 0.024, k2: 7.9, p2: 4.2, fam: 0 },
  { base: 0.74, A1: 0.078, k1: 3.9, p1: 3.3, A2: 0.022, k2: 8.5, p2: 1.2, fam: 1 },
  { base: 0.90, A1: 0.065, k1: 4.3, p1: 5.1, A2: 0.018, k2: 7.6, p2: 3.6, fam: 0 },
];
const LINE_OFF = [-0.020, -0.010, 0, 0.010, 0.020];
function ribOf(r, x) { return r.base + r.A1 * Math.sin(r.k1 * x + r.p1) + r.A2 * Math.sin(r.k2 * x + r.p2); }
function ribDOf(r, x) { return r.A1 * r.k1 * Math.cos(r.k1 * x + r.p1) + r.A2 * r.k2 * Math.cos(r.k2 * x + r.p2); }
/* 中心线查表：每帧数万次求值走线性插值（纯由 RIBBONS 决定，内容恒定，可安全放模块作用域） */
const RN = 384;
let ribTab = [], ribDTab = [];
function buildRibTabs() {
  ribTab = RIBBONS.map(r => { const a = new Float32Array(RN + 1); for (let i = 0; i <= RN; i++) a[i] = ribOf(r, i / RN * W); return a; });
  ribDTab = RIBBONS.map(r => { const a = new Float32Array(RN + 1); for (let i = 0; i <= RN; i++) a[i] = ribDOf(r, i / RN * W); return a; });
}
function ribAt(oi, x) {
  const t = Math.min(RN - 1e-6, Math.max(0, x / W * RN)); const i = t | 0, f = t - i;
  const a = ribTab[oi]; return a[i] + (a[i + 1] - a[i]) * f;
}
function ribDAt(oi, x) {
  const t = Math.min(RN - 1e-6, Math.max(0, x / W * RN)); const i = t | 0, f = t - i;
  const a = ribDTab[oi]; return a[i] + (a[i + 1] - a[i]) * f;
}
function ownOf(x, y) {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < RIBBONS.length; i++) {
    const d = Math.abs(y - ribAt(i, x));
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
/* ---------- 乐涡：谱带盘绕成的螺旋 ---------- */
const SPIRALS = [
  { x: 0.400, y: 0.350, r: 0.150, s: 0.34, fam: 0 },
  { x: 0.845, y: 0.100, r: 0.105, s: -0.30, fam: 1 },
  { x: 0.115, y: 0.100, r: 0.085, s: 0.28, fam: 0 },
  { x: 0.100, y: 0.550, r: 0.060, s: -0.22, fam: 1 },
];
function spiralAt(x, y) {
  for (const v of SPIRALS) {
    if (Math.abs(x - v.x) > v.r * 2.2 || Math.abs(y - v.y) > v.r * 2.0) continue;
    const rr = Math.hypot(x - v.x, (y - v.y) / 0.9) / v.r;
    if (rr < 1.7) return { v, rr };
  }
  return null;
}

/* 流场：沿谱带切线行进 + 乐涡旋卷吸入 */
function fieldAt(x, y, own) {
  let vx = 0.10 + 0.02 * Math.sin(y * 17 + own * 2.1);
  // 相邻两谱带切线按距离加权，避免归属边界处流线对冲堆亮缝
  const c1 = ribAt(own, x), d1 = Math.abs(y - c1);
  let si = -1, sd = 1e9;
  for (let i = 0; i < RIBBONS.length; i++) {
    if (i === own) continue;
    const d = Math.abs(y - ribAt(i, x));
    if (d < sd) { sd = d; si = i; }
  }
  const w = d1 / (d1 + sd + 1e-6);
  const tang = ribDAt(own, x) * (1 - w) + ribDAt(si, x) * w;
  let vy = tang * vx * 0.95 + 0.006 * Math.sin(x * 24 + y * 8 + own);
  // 乐涡旋卷 + 向心吸入
  let gmax = 0, rx = 0, ry = 0;
  for (const v of SPIRALS) {
    const dx = x - v.x, dy = (y - v.y) / 0.9;
    const r2 = dx * dx + dy * dy;
    const cut = v.r * 2.0;
    if (r2 > cut * cut) continue;
    const g = Math.exp(-r2 / (2 * v.r * v.r));
    if (g > gmax) gmax = g;
    const a = v.s * g / Math.sqrt(r2 + 0.0008);
    const sink = 0.008 * g;
    rx += -dy * a - dx * sink;
    ry += dx * a * 0.9 - dy * sink * 0.9;
  }
  vx = vx * (1 - 0.80 * gmax) + rx;
  vy = vy * (1 - 0.80 * gmax) + ry;
  return [vx, vy];
}
function field(x, y) { return fieldAt(x, y, ownOf(x, y)); }

/* 笔触权重：涡环带最亮（涡心留暗），谱带内按五线条纹起伏，带外几乎留白 */
function emphasisAt(x, y, own, sp) {
  if (sp) {                                       // 涡环带笔触（涡心留暗）
    const ang = Math.atan2((y - sp.v.y) / 0.9, x - sp.v.x);
    const brush = 0.78 + 0.22 * Math.sin(ang * 2 + Math.log(sp.rr + 0.15) * 2.4 + sp.v.x * 4);
    return Math.min(1, Math.exp(-(((sp.rr - 0.95) / 0.30) ** 2)) * brush * 0.9 + (sp.rr < 0.4 ? 0.10 : 0.05));
  }
  const d = y - ribAt(own, x);
  if (Math.abs(d) > 0.034) return 0.05;           // 谱带之外几乎留白
  const stripe = Math.max(0, Math.cos(TAU * d / 0.010));
  return Math.min(1, 0.10 + 0.90 * stripe * stripe * stripe);
}
function emphasis(x, y) {
  const sp = spiralAt(x, y);
  return emphasisAt(x, y, ownOf(x, y), sp);
}

/* ---------- 配色：金线 / 冰线 / 金粉 / 冰粉 ---------- */
const PALS = [
  ['#8a6a2a', '#b98f3e', '#d9b45b', '#e8c877', '#f2d896', '#f8e8b8', '#fdf6dc'], // 0 金谱线
  ['#5d87a6', '#7fa8c4', '#9fc4dc', '#bcd8e8', '#d4e8f2', '#e8f4fa', '#ffffff'], // 1 冰谱线
  ['#c9a24a', '#d9b45b', '#e8c877', '#f2d896', '#f8e8b8', '#fdf2cc', '#fffdf2'], // 2 金粉
  ['#9fc4dc', '#bcd8e8', '#d4e8f2', '#e8f4fa', '#f4fafd', '#ffffff', '#fff8e0'], // 3 冰粉
];
const FEATHER = 0.10;
const toneAt = (info, tone) => Math.min(6, Math.max(0, tone + info.shift));
function colorOf(info, tone) { return PALS[info.kind][toneAt(info, tone)]; }

/* ---------- WebGL2 合成器（demo 原样保留） ----------
   本曲目特有：FS_ACC 比其他曲目多一个 uGlitter uniform——金粉层 dust 以
   `lin(du.rgb) * du.a * uGlitter` 叠加进底涂，是"金粉星屑"画面的核心，勿改。 */
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
      uniform sampler2D uInk, uBase, uDust, uPrev; uniform float uDecay, uGlitter;
      uniform float uGrow; uniform vec4 uSeeds[6];
      vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
      void main(){
        vec2 uv = vec2(vUv.x, 1. - vUv.y);
        vec4 ink = texture(uInk, uv);
        vec4 du = texture(uDust, uv);
        vec3 base = lin(texture(uBase, uv).rgb) + lin(du.rgb) * du.a * uGlitter;
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
        vec3 c = texture(uSrc, vUv).rgb * 1.25;
        float l = max(c.r, max(c.g, c.b));
        o = vec4(c * smoothstep(.55, .95, l), 1.);
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
        vec3 base = texture(uScene, vUv).rgb * 1.2;
        vec3 c = aces((base + texture(uGlow, vUv).rgb * uBloom * .7) * uExposure);
        float vig = 1. - .16 * pow(length((vUv - .5) * vec2(1.1, 1.)), 1.5);
        c = pow(c * vig, vec3(1. / 2.2));
        float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5;
        o = vec4(clamp(c + grain * .0035, 0., 1.), 1.);
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
    this.ink = this.tex(); this.base = this.tex(); this.dust = this.tex();
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
  setBase(src, dustSrc) {
    this.bind(this.base, 0); this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, src);
    this.bind(this.dust, 0); this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, dustSrc);
  }
  advance(inkCanvas, dt, seeds) {
    const gl = this.gl, next = 1 - this.idx;
    this.bind(this.ink, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, inkCanvas);
    this.draw(this.pAcc, this.hist[next].f, this.w, this.h);
    this.bind(this.ink, 0); this.bind(this.base, 1); this.bind(this.hist[this.idx].t, 2); this.bind(this.dust, 3);
    gl.uniform1i(this.pAcc.u.uInk, 0); gl.uniform1i(this.pAcc.u.uBase, 1); gl.uniform1i(this.pAcc.u.uPrev, 2); gl.uniform1i(this.pAcc.u.uDust, 3);
    gl.uniform1f(this.pAcc.u.uGlitter, params.glitter);
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

/* ---------- 精致音符：矢量路径 + 剪影内金粉 + 外晕（常量部分原样保留） ---------- */
const GLYPH_BOX = {
  treble: { w: 0.80, h: 2.10 }, bass: { w: 1.00, h: 1.25 },
  eighth: { w: 0.80, h: 1.65 }, quarter: { w: 0.60, h: 1.65 },
  beam: { w: 1.10, h: 1.65 }, sixteenth: { w: 1.10, h: 1.85 },
  sharp: { w: 0.70, h: 1.35 }, flat: { w: 0.55, h: 1.50 },
};
const GLYPH_COL = {
  0: { base: '#e8c877', light: '#f8e8b8', deep: '#b98f3e', white: '#fffdf2', halo: 'rgba(232,200,119,0.35)' },
  1: { base: '#cfe4f0', light: '#ffffff', deep: '#7fa8c4', white: '#f4fafd', halo: 'rgba(159,196,220,0.32)' },
};
function glyphPath(ctx, type) {
  ctx.beginPath();
  if (type === 'treble') {
    ctx.moveTo(0.03, 0.62);
    ctx.bezierCurveTo(0.03, 0.10, 0.03, -0.35, 0.03, -0.66);
    ctx.bezierCurveTo(0.03, -0.92, 0.22, -1.00, 0.28, -0.82);
    ctx.bezierCurveTo(0.34, -0.62, 0.10, -0.36, -0.10, -0.16);
    ctx.bezierCurveTo(-0.32, 0.06, -0.34, 0.36, -0.10, 0.48);
    ctx.bezierCurveTo(0.10, 0.58, 0.26, 0.46, 0.24, 0.28);
    ctx.bezierCurveTo(0.22, 0.12, 0.04, 0.06, -0.06, 0.16);
    ctx.moveTo(0.03, 0.62);
    ctx.bezierCurveTo(0.03, 0.80, -0.02, 0.92, -0.14, 0.94);
    ctx.bezierCurveTo(-0.26, 0.96, -0.30, 0.84, -0.22, 0.78);
  } else if (type === 'bass') {
    ctx.moveTo(-0.30, -0.40);
    ctx.bezierCurveTo(0.05, -0.52, 0.36, -0.30, 0.36, 0.02);
    ctx.bezierCurveTo(0.36, 0.34, 0.08, 0.54, -0.24, 0.62);
    ctx.bezierCurveTo(0.02, 0.44, 0.14, 0.26, 0.14, 0.04);
    ctx.bezierCurveTo(0.14, -0.16, 0.00, -0.30, -0.30, -0.40);
    ctx.closePath();
  } else if (type === 'eighth' || type === 'quarter') {
    ctx.moveTo(0.13, 0.55); ctx.lineTo(0.13, -0.75);
  } else if (type === 'beam' || type === 'sixteenth') {
    ctx.moveTo(-0.15, 0.55); ctx.lineTo(-0.15, -0.62);
    ctx.moveTo(0.55, 0.43); ctx.lineTo(0.55, -0.74);
  } else if (type === 'sharp') {
    ctx.moveTo(-0.12, -0.62); ctx.lineTo(-0.12, 0.62);
    ctx.moveTo(0.14, -0.68); ctx.lineTo(0.14, 0.56);
  } else if (type === 'flat') {
    ctx.moveTo(-0.10, -0.72); ctx.lineTo(-0.10, 0.52);
  }
}
function glyphFill(ctx, type) {
  ctx.beginPath();
  if (type === 'treble') { ctx.arc(-0.17, 0.86, 0.075, 0, TAU); }
  else if (type === 'bass') { ctx.arc(-0.18, -0.28, 0.17, 0, TAU); ctx.moveTo(0.59, -0.18); ctx.arc(0.52, -0.18, 0.07, 0, TAU); ctx.moveTo(0.59, 0.10); ctx.arc(0.52, 0.10, 0.07, 0, TAU); }
  else if (type === 'eighth' || type === 'quarter') { ctx.ellipse(-0.12, 0.62, 0.26, 0.19, -0.35, 0, TAU); }
  else if (type === 'beam' || type === 'sixteenth') {
    ctx.ellipse(-0.35, 0.62, 0.24, 0.18, -0.35, 0, TAU);
    ctx.moveTo(0.59, 0.50); ctx.ellipse(0.35, 0.50, 0.24, 0.18, -0.35, 0, TAU);
  }
  else if (type === 'flat') {
    ctx.moveTo(-0.10, 0.10);
    ctx.bezierCurveTo(0.16, -0.02, 0.30, 0.14, 0.18, 0.32);
    ctx.bezierCurveTo(0.08, 0.46, -0.02, 0.50, -0.10, 0.52);
    ctx.closePath();
  }
  ctx.fill();
  // 符尾 / 符杠 / 升号斜杠：实心多边形
  ctx.beginPath();
  if (type === 'eighth') {
    ctx.moveTo(0.13, -0.75);
    ctx.bezierCurveTo(0.42, -0.52, 0.46, -0.24, 0.30, 0.02);
    ctx.bezierCurveTo(0.36, -0.26, 0.30, -0.44, 0.13, -0.56);
    ctx.closePath();
  } else if (type === 'beam' || type === 'sixteenth') {
    ctx.moveTo(-0.19, -0.62); ctx.lineTo(0.59, -0.74); ctx.lineTo(0.59, -0.56); ctx.lineTo(-0.19, -0.44); ctx.closePath();
    if (type === 'sixteenth') { ctx.moveTo(-0.19, -0.34); ctx.lineTo(0.59, -0.46); ctx.lineTo(0.59, -0.28); ctx.lineTo(-0.19, -0.16); ctx.closePath(); }
  } else if (type === 'sharp') {
    ctx.moveTo(-0.30, -0.10); ctx.lineTo(0.32, -0.26); ctx.lineTo(0.32, -0.10); ctx.lineTo(-0.30, 0.06); ctx.closePath();
    ctx.moveTo(-0.30, 0.24); ctx.lineTo(0.32, 0.08); ctx.lineTo(0.32, 0.24); ctx.lineTo(-0.30, 0.40); ctx.closePath();
  }
  ctx.fill();
}
const GLYPH_DEF = [
  ['treble', 0.405, 0.345, 0.300, -0.06, 0], ['treble', 0.065, 0.400, 0.160, 0.10, 1],
  ['treble', 0.935, 0.160, 0.220, 0.05, 0], ['bass', 0.655, 0.475, 0.160, -0.08, 0],
  ['bass', 0.805, 0.115, 0.100, 0.12, 0], ['eighth', 0.265, 0.075, 0.100, 0.15, 0],
  ['eighth', 0.545, 0.100, 0.090, -0.12, 1], ['eighth', 0.745, 0.130, 0.090, 0.10, 0],
  ['eighth', 0.475, 0.200, 0.080, -0.18, 0], ['eighth', 0.585, 0.235, 0.085, 0.14, 1],
  ['eighth', 0.155, 0.600, 0.110, -0.10, 0], ['eighth', 0.225, 0.585, 0.090, 0.16, 0],
  ['eighth', 0.875, 0.375, 0.090, -0.14, 1], ['eighth', 0.965, 0.700, 0.110, 0.08, 0],
  ['eighth', 0.505, 0.795, 0.090, -0.12, 0], ['eighth', 0.355, 0.925, 0.100, 0.10, 1],
  ['eighth', 0.775, 0.915, 0.100, -0.08, 0], ['beam', 0.135, 0.360, 0.130, -0.10, 0],
  ['beam', 0.475, 0.085, 0.120, 0.06, 1], ['beam', 0.665, 0.185, 0.130, -0.05, 0],
  ['beam', 0.525, 0.665, 0.140, 0.04, 0], ['beam', 0.315, 0.700, 0.110, -0.06, 1],
  ['sixteenth', 0.600, 0.350, 0.100, 0.12, 0], ['sixteenth', 0.075, 0.860, 0.100, -0.10, 1],
  ['quarter', 0.145, 0.845, 0.090, 0.06, 0], ['quarter', 0.695, 0.350, 0.080, -0.10, 1],
  ['sharp', 0.105, 0.060, 0.100, 0.05, 0], ['flat', 0.178, 0.175, 0.100, -0.06, 0],
];

/* ---------- 生长光点：六处光辉依次点燃（demo 原有 SEEDS，数值照抄） ---------- */
const SEEDS = [
  { x: 0.400, y: 0.350, t0: 0.15, dur: 6.4, maxR: 1.05, warm: true },
  { x: 0.845, y: 0.100, t0: 0.90, dur: 5.9, maxR: 0.95, warm: true },
  { x: 0.115, y: 0.100, t0: 1.60, dur: 5.5, maxR: 0.90, warm: false },
  { x: 0.550, y: 0.800, t0: 2.20, dur: 5.6, maxR: 0.95, warm: true },
  { x: 0.100, y: 0.550, t0: 2.80, dur: 5.2, maxR: 0.90, warm: false },
  { x: 0.750, y: 0.550, t0: 3.30, dur: 5.2, maxR: 0.90, warm: false },
];
const easeGrow = u => u;

export const MOONLIGHT = {
  key: 'moonlight',
  title: '月光下的未完奏鸣',
  ariaLabel: '月光下的未完奏鸣开场：深蓝夜幕上金色与冰蓝五线谱带蜿蜒盘成漩涡，金粉星屑与精致音符漂浮其间，笔触缓慢生长成画后浮现剧名。',
  params: { speed: 3.00, density: 2000 },
  scaleCap: 800,
  introEnd: 8.6,
  // 大标题比画面铺满（8.6s）早 2.4s 浮现，留出处置「点击任意处开始剧本」的时间
  titleAt: 6.2,
  seed: 20261126,
  create(api) {
    /* 金粉层画布：demo 独有的第三张离屏画布（不属于外壳 api），
       由本模块自建自管，尺寸在 paintUnder 里跟随 api.under。 */
    const dustC = document.createElement('canvas');
    const dustCtx = dustC.getContext('2d');

    /* 每次打开一份新状态：音符精灵、闪点、模拟时钟都挂在 create 闭包里，
       避免第二次打开串上一轮的状态。 */
    const seeds = SEEDS.map((s) => ({ ...s }));
    let GLYPHS = [];
    let sparkles = [];
    let simT = 0;

    /* 单元格信息查表（0.0125 步长）：色系 / 色阶偏移 / 权重 / 流场 / 生长门控 */
    function cellInfo(x, y) {
      const key = ((x * 80) | 0) * 128 + ((y * 80) | 0);
      let c = api.cellCache.get(key);
      if (c) return c;
      const sp = spiralAt(x, y);
      const own = ownOf(x, y);
      let kind, shift = 0;
      if (sp) {
        kind = sp.v.fam === 0 ? 2 : 3;
        shift = (sp.rr > 0.5 && sp.rr < 1.2) ? 1 : -1;
      } else {
        const d = y - ribAt(own, x);
        const stripe = Math.max(0, Math.cos(TAU * d / 0.010));
        const fam = RIBBONS[own].fam;
        if (stripe > 0.35) { kind = fam; shift = Math.round(stripe * 2) - (Math.abs(d) > 0.026 ? 1 : 0); }
        else { kind = fam === 0 ? 2 : 3; shift = -1; }
      }
      const em = emphasisAt(x, y, own, sp);
      const f = fieldAt(x, y, own);
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
      c = { em, kind, shift, g, fx: f[0], fy: f[1] };
      api.cellCache.set(key, c);
      return c;
    }
    function colorAt(x, y, tone) { return colorOf(cellInfo(x, y), tone); }

    /* 音符精灵：矢量谱号/符头撒金粉颗粒（撒粉用 api.rnd，跟随外壳种子序列） */
    function makeGlyph(type, u, fam) {
      const box = GLYPH_BOX[type], col = GLYPH_COL[fam];
      const pad = 0.45;
      const cw = Math.ceil((box.w + pad) * u), ch = Math.ceil((box.h + pad) * u);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d');
      g.translate(cw / 2, ch / 2); g.scale(u, u);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.shadowColor = col.halo; g.shadowBlur = u * 0.10;
      g.strokeStyle = col.base; g.fillStyle = col.base;
      g.lineWidth = type === 'treble' ? 0.085 : (type === 'sharp' || type === 'flat' ? 0.06 : 0.07);
      if (type === 'bass') { glyphFill(g, type); }
      else { glyphPath(g, type); g.stroke(); glyphFill(g, type); }
      g.shadowBlur = 0;
      // 剪影内撒粉：亮 / 深 / 白颗粒叠出金粉质感
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      const n = Math.floor(box.w * box.h * 520);
      for (let i = 0; i < n; i++) {
        const x = api.rnd() * cw, y = api.rnd() * ch;
        const t = api.rnd();
        g.fillStyle = t < 0.42 ? col.light : (t < 0.72 ? col.deep : (t < 0.9 ? col.white : col.base));
        g.globalAlpha = 0.25 + api.rnd() * 0.65;
        const s = (0.012 + api.rnd() * 0.026) * u;
        g.fillRect(x, y, s, s);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      return { c, w: cw, h: ch };
    }
    function buildGlyphs() {
      GLYPHS = GLYPH_DEF.map(([type, x, y, size, rot, fam]) => {
        const u = size * api.scale / GLYPH_BOX[type].h;
        const spr = makeGlyph(type, u, fam);
        return { type, x, y, rot, fam, ph: api.rnd() * TAU, sw: spr.w, sh: spr.h, c: spr.c };
      });
    }

    /* 闪点：谱线洒金 + 涡心碎光 + 夜幕星点 */
    function buildSparkles() {
      sparkles = [];
      for (let i = 0; i < 90; i++) {
        sparkles.push({ x: api.rnd() * W, y: api.rnd(), s: 0.4 + api.rnd() * 0.9, ph: api.rnd() * TAU, c: api.rnd() < 0.5 ? '#fff6d8' : '#ffffff', gold: api.rnd() < 0.5 });
      }
      for (let oi = 0; oi < RIBBONS.length; oi++) {
        const r = RIBBONS[oi];
        for (let i = 0; i < 44; i++) {
          const x = api.rnd() * W;
          const y = ribOf(r, x) + LINE_OFF[Math.floor(api.rnd() * 5)] + (api.rnd() - 0.5) * 0.004;
          sparkles.push({ x, y, s: 0.5 + api.rnd() * 1.2, ph: api.rnd() * TAU, c: r.fam === 0 ? '#f8e8b8' : '#eaf4fa', gold: r.fam === 0 });
        }
      }
      for (const v of SPIRALS) {
        for (let i = 0; i < 40; i++) {
          const a = api.rnd() * TAU, rr = v.r * (0.35 + Math.pow(api.rnd(), 0.8) * 0.9);
          sparkles.push({ x: v.x + Math.cos(a) * rr, y: v.y + Math.sin(a) * rr * 0.9, s: 0.5 + api.rnd() * 1.2, ph: api.rnd() * TAU, c: v.fam === 0 ? '#f8e8b8' : '#eaf4fa', gold: v.fam === 0 });
        }
      }
    }

    /* WebGL2 合成器：外壳约定 setBase 只传底涂 under，本曲目的金粉层 dustC
       在这里补成第二个实参（demo 里 setup/endIntro 都是 setBase(under, dustC)）。 */
    function makeFilm(canvas) {
      const film = new Film(canvas);
      const setBase = film.setBase.bind(film);
      film.setBase = (src) => setBase(src, dustC);
      return film;
    }

    /* ---------- 底涂：深蓝夜幕 + 谱带五线 + 乐涡螺旋 + 金粉星屑 ----------
       外壳每次建场/缩放都会调这里；demo setup 里的
       buildRibTabs → paintUnder → buildGlyphs → buildSparkles 顺序原样保持。 */
    function paintUnder() {
      buildRibTabs();
      const scale = api.scale;
      const baseCtx = api.baseCtx;
      const inkCtx = api.inkCtx;
      const w = api.under.width, h = api.under.height;
      if (dustC.width !== w || dustC.height !== h) { dustC.width = w; dustC.height = h; }
      dustCtx.clearRect(0, 0, w, h);
      const gBg = baseCtx.createLinearGradient(0, 0, 0, h);
      gBg.addColorStop(0, '#0b1526'); gBg.addColorStop(0.5, '#0a1020'); gBg.addColorStop(1, '#0d1a2e');
      baseCtx.fillStyle = gBg; baseCtx.fillRect(0, 0, w, h);
      const gC = baseCtx.createRadialGradient(0.45 * w, 0.42 * h, 0, 0.45 * w, 0.42 * h, 0.75 * w);
      gC.addColorStop(0, 'rgba(38,58,92,0.35)'); gC.addColorStop(1, 'rgba(38,58,92,0)');
      baseCtx.fillStyle = gC; baseCtx.fillRect(0, 0, w, h);
      baseCtx.lineCap = 'round';
      // 谱带：宽柔光体 + 五条平行谱线 + 沿线金粉
      for (let oi = 0; oi < RIBBONS.length; oi++) {
        const r = RIBBONS[oi];
        const pal = PALS[r.fam];
        baseCtx.strokeStyle = pal[2];
        baseCtx.globalAlpha = 0.06;
        baseCtx.lineWidth = 0.030 * scale;
        baseCtx.beginPath();
        for (let x = 0; x <= W + 0.001; x += 0.01) { const y = ribOf(r, x); x === 0 ? baseCtx.moveTo(x * scale, y * scale) : baseCtx.lineTo(x * scale, y * scale); }
        baseCtx.stroke();
        for (let li = 0; li < LINE_OFF.length; li++) {
          const off = LINE_OFF[li];
          baseCtx.strokeStyle = pal[li === 2 ? 5 : (li % 2 === 0 ? 3 : 4)];
          baseCtx.globalAlpha = 0.34 + api.rnd() * 0.26;
          baseCtx.lineWidth = (0.5 + api.rnd() * 0.5) * scale / 800;
          baseCtx.beginPath();
          for (let x = 0; x <= W + 0.001; x += 0.008) {
            const y = ribOf(r, x) + off + 0.0016 * Math.sin(x * 34 + li * 1.7 + oi);
            x === 0 ? baseCtx.moveTo(x * scale, y * scale) : baseCtx.lineTo(x * scale, y * scale);
          }
          baseCtx.stroke();
          // 沿线洒粉（独立金粉层，随金粉强度增减）
          const dust = PALS[r.fam === 0 ? 2 : 3];
          for (let x = 0; x <= W; x += 0.0035) {
            if (api.rnd() < 0.30) continue;
            const y = ribOf(r, x) + off + (api.rnd() - 0.5) * 0.004;
            dustCtx.fillStyle = dust[3 + Math.floor(api.rnd() * 4)];
            dustCtx.globalAlpha = Math.min(1, (0.20 + api.rnd() * 0.55) * 1.25);
            const s = (0.3 + api.rnd() * 1.0) * scale / 800;
            dustCtx.fillRect(x * scale - s / 2, y * scale - s / 2, s, s);
          }
        }
      }
      baseCtx.globalAlpha = 1;
      // 乐涡：三圈平行螺旋臂 + 涡心密粉
      for (const v of SPIRALS) {
        const pal = PALS[v.fam];
        const turns = 2.3, thMax = turns * TAU;
        for (let arm = 0; arm < 3; arm++) {
          const aoff = (arm - 1) * 0.010;
          baseCtx.strokeStyle = pal[arm === 1 ? 5 : 3];
          baseCtx.globalAlpha = 0.34 + api.rnd() * 0.24;
          baseCtx.lineWidth = (0.5 + api.rnd() * 0.5) * scale / 800;
          baseCtx.beginPath();
          let pen = false;
          for (let th = 0.5; th <= thMax; th += 0.05) {
            const rr = v.r * Math.pow(1 - th / thMax, 1.2) + 0.004 + aoff;
            const x = v.x + Math.cos(th + v.x * 5) * rr;
            const y = v.y + Math.sin(th + v.x * 5) * rr * 0.9;
            if (x < -0.05 || x > W + 0.05 || y < -0.05 || y > 1.05) { pen = false; continue; }
            if (!pen) { baseCtx.moveTo(x * scale, y * scale); pen = true; } else baseCtx.lineTo(x * scale, y * scale);
          }
          baseCtx.stroke();
        }
        const dust = PALS[v.fam === 0 ? 2 : 3];
        for (let i = 0; i < 700; i++) {
          const th = api.rnd() * thMax;
          const rr = v.r * Math.pow(1 - th / thMax, 1.2) + 0.004 + (api.rnd() - 0.5) * 0.014;
          const x = v.x + Math.cos(th + v.x * 5) * rr, y = v.y + Math.sin(th + v.x * 5) * rr * 0.9;
          dustCtx.fillStyle = dust[2 + Math.floor(api.rnd() * 5)];
          dustCtx.globalAlpha = Math.min(1, (0.12 + api.rnd() * 0.35) * 1.25);
          const s = (0.3 + api.rnd() * 1.0) * scale / 800;
          dustCtx.fillRect(x * scale - s / 2, y * scale - s / 2, s, s);
        }
      }
      baseCtx.globalAlpha = 1;
      // 夜幕星点
      for (let i = 0; i < 150; i++) {
        const x = api.rnd() * W, y = api.rnd();
        baseCtx.fillStyle = api.rnd() < 0.5 ? '#fff6d8' : '#dfe9f2';
        baseCtx.globalAlpha = 0.12 + api.rnd() * 0.4;
        const s = (0.3 + api.rnd() * 0.9) * scale / 800;
        baseCtx.fillRect(x * scale - s / 2, y * scale - s / 2, s, s);
      }
      baseCtx.globalAlpha = 1;
      // 满幅细碎金粉 / 冰屑（独立金粉层）
      for (let i = 0; i < 2600; i++) {
        const x = api.rnd() * W, y = api.rnd();
        dustCtx.fillStyle = api.rnd() < 0.55 ? PALS[2][3 + Math.floor(api.rnd() * 4)] : PALS[3][2 + Math.floor(api.rnd() * 4)];
        dustCtx.globalAlpha = Math.min(1, (0.08 + api.rnd() * 0.26) * 1.25);
        const s = (0.25 + api.rnd() * 0.8) * scale / 800;
        dustCtx.fillRect(x * scale - s / 2, y * scale - s / 2, s, s);
      }
      dustCtx.globalAlpha = 1;
      // 静态流线笔触
      for (let i = 0; i < 24000; i++) {
        let x, y;
        const m = api.rnd();
        if (m < 0.70) {
          x = api.rnd() * W;
          const oi = Math.floor(api.rnd() * RIBBONS.length);
          y = ribOf(RIBBONS[oi], x) + LINE_OFF[Math.floor(api.rnd() * 5)] + (api.rnd() - 0.5) * 0.004;
        } else if (m < 0.88) {
          const v = SPIRALS[Math.floor(api.rnd() * SPIRALS.length)], a = api.rnd() * TAU, rr = v.r * (0.55 + api.rnd() * 0.85);
          x = v.x + Math.cos(a) * rr; y = v.y + Math.sin(a) * rr * 0.9;
        } else { x = api.rnd() * W; y = api.rnd(); }
        const tone = Math.min(6, Math.floor(api.rnd() * 7));
        baseCtx.strokeStyle = colorAt(x, y, tone);
        baseCtx.globalAlpha = (0.08 + api.rnd() * 0.34) * emphasis(x, y);
        baseCtx.lineWidth = (0.4 + api.rnd() ** 2 * 1.9) * scale / 800;
        baseCtx.beginPath(); baseCtx.moveTo(x * scale, y * scale);
        const steps = 5 + Math.floor(api.rnd() * 30);
        for (let j = 0; j < steps; j++) { const d = field(x, y); x += d[0] * 0.012; y += d[1] * 0.012; baseCtx.lineTo(x * scale, y * scale); }
        baseCtx.stroke();
      }
      baseCtx.globalAlpha = 1;
      inkCtx.drawImage(api.under, 0, 0);
      inkCtx.globalAlpha = params.glitter;
      inkCtx.drawImage(dustC, 0, 0);
      inkCtx.globalAlpha = 1;
      // demo 在 setup 里紧随底涂重建音符与闪点（依赖 api.rnd 序列与 api.scale），顺序保持不变
      buildGlyphs();
      buildSparkles();
    }

    /* ---------- 粒子笔触：一颗粒子 = 一段沿流场的短线 ---------- */
    function spawn(initial) {
      let x = api.rnd() * 1.7 - 0.05, y = api.rnd() * 1.08 - 0.04;
      const m = api.rnd();
      if (m < 0.70) {
        x = api.rnd() * W;
        const oi = Math.floor(api.rnd() * RIBBONS.length);
        y = ribOf(RIBBONS[oi], x) + LINE_OFF[Math.floor(api.rnd() * 5)] + (api.rnd() - 0.5) * 0.005;
      } else if (m < 0.88) {
        const v = SPIRALS[Math.floor(api.rnd() * SPIRALS.length)], a = api.rnd() * TAU, rr = v.r * (0.55 + api.rnd() * 0.85);
        x = v.x + Math.cos(a) * rr; y = v.y + Math.sin(a) * rr * 0.9;
      }
      return { x, y, age: initial ? Math.floor(api.rnd() * 180) : 0, life: 120 + Math.floor(api.rnd() * 220), tone: Math.min(6, Math.floor(api.rnd() ** 1.35 * 7)), width: 0.3 + api.rnd() ** 2 * 1.0, phase: api.rnd() * TAU };
    }

    /* ---------- 一帧绘制：往 api.ink 上画粒子笔触、音符、闪点与生长光晕 ----------
       外壳负责每帧的 refreshGrowth（无 GPU 时）、gpu.advance 与 present，这里不做。 */
    function step(_api, dt) {
      const scale = api.scale;
      const ink = api.ink, inkCtx = api.inkCtx;
      const growth = api.growth, gpu = api.gpu;
      const particles = api.particles, buckets = api.buckets;
      simT += dt / 30;
      if (gpu) {
        inkCtx.clearRect(0, 0, ink.width, ink.height);
      } else {
        inkCtx.globalAlpha = Math.min(0.9, 0.028 * dt);
        inkCtx.drawImage(growth ? api.baseIntro : api.under, 0, 0);
        if (!growth) { inkCtx.globalAlpha = Math.min(0.9, 0.028 * dt) * params.glitter; inkCtx.drawImage(dustC, 0, 0); }
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
          const ti = toneAt(info, p.tone);
          const ci = info.kind * 7 + ti;
          const aq = Math.min(7, Math.round(alpha * 7));
          const wq = Math.min(3, Math.round(p.width * 2.5));
          const key = ci * 32 + aq * 4 + wq;
          let b = buckets.get(key);
          if (!b) {
            b = { style: PALS[info.kind][ti], alpha: aq / 7, width: (wq / 2.5) * scale / 800, pts: [] };
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
      // 音符：低alpha逐帧累积（拖尾平衡亮度），微浮微转微闪
      const N = GLYPHS.length;
      for (let i = 0; i < N; i++) {
        const glyph = GLYPHS[i];
        const fade = Math.min(1, Math.max(0, params.notes * N - i));
        if (fade <= 0.02) continue;
        const gate = growth ? cellInfo(glyph.x, glyph.y).g : 1;
        if (gate <= 0.02) continue;
        const shim = 0.8 + 0.2 * Math.sin(simT * 1.3 + glyph.ph);
        inkCtx.globalAlpha = 0.045 * fade * shim * gate;
        inkCtx.save();
        inkCtx.translate(glyph.x * scale, (glyph.y + 0.004 * Math.sin(simT * 0.6 + glyph.ph)) * scale);
        inkCtx.rotate(glyph.rot + 0.03 * Math.sin(simT * 0.4 + glyph.ph));
        inkCtx.drawImage(glyph.c, -glyph.sw / 2, -glyph.sh / 2, glyph.sw, glyph.sh);
        inkCtx.restore();
      }
      inkCtx.globalAlpha = 1;
      // 闪点（随生长门控显现，微微闪烁）
      for (const sp of sparkles) {
        const g = growth ? cellInfo(sp.x, sp.y).g : 1;
        if (g <= 0.02) continue;
        const gm = sp.gold ? params.glitter : 1;
        if (gm <= 0.02) continue;
        const tw = (0.25 + 0.55 * Math.sin(simT * 2 + sp.ph) ** 2) * gm;
        inkCtx.globalAlpha = tw * g;
        inkCtx.fillStyle = sp.c;
        const s = sp.s * scale / 800;
        inkCtx.fillRect(sp.x * scale - s / 2, sp.y * scale - s / 2, s, s);
      }
      inkCtx.globalAlpha = 1;
      if (growth) {
        for (const s of growth) {
          if (s.rOut2 <= 0) continue;
          const u = Math.min(1, Math.max(0, (api.introT - s.t0) / s.dur));
          const fade = Math.min(1, Math.max(0, (api.introT - s.t0) / 0.5)) * Math.pow(1 - u, 1.6);
          if (fade <= 0.01) continue;
          const r = (s.warm ? 0.09 : 0.085) * scale;
          const col = s.warm ? '248,232,184' : '214,236,248';
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

    /* ---------- 生长开场：按时间写每个光点的半径（introT 由外壳推进） ---------- */
    function updateGrowth(_api, t) {
      for (const s of seeds) {
        const u = Math.min(1, Math.max(0, (t - s.t0) / s.dur));
        s.r = u <= 0 ? 0 : s.maxR * easeGrow(u);
        s.rOut = s.r + FEATHER;
        s.rOut2 = s.rOut * s.rOut;
      }
    }

    /* ---------- Canvas2D 回退：把底涂 + 金粉裁进生长遮罩 ---------- */
    function refreshGrowth() {
      const scale = api.scale;
      const maskCtx = api.maskCtx, bIntroCtx = api.bIntroCtx;
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
      bIntroCtx.globalAlpha = params.glitter;
      bIntroCtx.drawImage(dustC, 0, 0);
      bIntroCtx.globalAlpha = 1;
      bIntroCtx.globalCompositeOperation = 'destination-in';
      bIntroCtx.drawImage(api.maskC, 0, 0);
      bIntroCtx.globalCompositeOperation = 'source-over';
    }

    return {
      seeds,
      makeFilm,
      paintUnder,
      spawn,
      step,
      updateGrowth,
      refreshGrowth,
    };
  },
};
