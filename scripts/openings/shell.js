/* ============================================================
   曲目开场动画外壳（四部曲目共用）
   ------------------------------------------------------------
   只负责"外壳"部分：挂载 / 标题与提示 / 跳过按钮 / 生长时间轴 /
   30fps 累加器 / 帧率降级 / 点击与键盘 / 淡出销毁 / WebGL 上下文释放。
   画面本身由传入的 OPENING 描述（见 scripts/openings/*.js）。

   用法：
     import { openSeriesOpening } from './shell.js';
     openSeriesOpening(CICADA, {
       onDone: () => play(script),          // 点标题后立刻开演（动画层还盖在上面）
       onStageReady: () => stagePainted(),  // 舞台画出第一帧后才淡出撤层
     });

   OPENING = {
     key:        'cicada'，用于 .mumu-opening--<key> 主题类与调试钩子
     title:      大标题文本
     subtitle:   可选，大标题里换行/弱化的后半句
     ariaLabel:  画布的 aria-label（描述画面，供读屏）
     params:     { speed, density }   外壳只用这两个（降级按 density 缩放）
     scaleCap:   渲染分辨率上限（默认 800）
     introEnd:   生长总时长（秒，默认 8.6）
     titleAt:    大标题浮现时刻（秒，默认 introEnd - 2.4）
     seed:       画面随机种子（各曲目沿用 demo 原值，保证与 demo 逐像素同形）
     create(api):  每次打开新建一份动画状态（api 见下，闭包可直接引用），返回 hooks：
       hooks = {
         seeds:        [{ x, y, t0, dur, maxR, warm }]，生长用的六处光辉
         makeFilm(canvas)  可选：返回 WebGL2 合成器；不支持 WebGL2 时抛错即可
                            合成器需实现 resize(w,h) / setBase(canvas) /
                            advance(inkCanvas, dt, growth) / render() / gl
         paintUnder(api)   静态底涂：画进 api.under（用 api.baseCtx / api.scale / api.rnd()）
         spawn(initial)    生成一个粒子（api 由闭包持有）
         step(api, dt)     一帧：往 api.ink 上画笔触与光效，不要碰 present
         updateGrowth(api, t) 按时间写每个 seed 的 r / rOut / rOut2
         refreshGrowth(api)    Canvas2D 回退用的生长遮罩（无 WebGL2 时才被调用）
         present(api)     可选：默认 gpu.render()，否则把 ink 画到屏幕
       }
   }

   api = { canvas, ctx2d, under, baseCtx, ink, inkCtx, maskC, maskCtx,
           baseIntro, bIntroCtx, gpu, scale, particles, buckets, cellCache,
           growth, introT, phase, quality, rnd() }
   ============================================================ */

const W = 1.6, H = 1;
const Q_FACTOR = [1, 0.65, 0.45];
const BASE_SEED = 18890601;
// 生长时间轴启动前先「空跑」的帧数：只画进离屏 ink，不上屏。
const PRIME_FRAMES = 3;
// 撤层节奏：淡出至少让人看完（LEAVE_MS），但最多扣住这么久（HOLD_MS）。
const LEAVE_MS = 420;
const HOLD_MS = 1500;

class OpeningLayer {
  constructor(definition, { onDone, onStageReady } = {}) {
    this.def = definition;
    this.baseSeed = definition.seed || BASE_SEED;
    this.onDone = typeof onDone === 'function' ? onDone : () => {};
    // 撤层信号：剧情侧的「舞台已经画出画面」Promise 工厂。有它就先开演、后撤层。
    this.onStageReady = typeof onStageReady === 'function' ? onStageReady : null;
    this.scaleCap = definition.scaleCap || 800;
    this.introEnd = definition.introEnd || 8.6;
    this.titleAt = definition.titleAt || this.introEnd - 2.4;
    this.params = Object.assign({ speed: 3, density: 2000 }, definition.params || {});

    this.root = null; this.canvas = null; this.capEl = null; this.skipEl = null;
    this.gpu = null; this.ctx2d = null;
    this.under = null; this.baseCtx = null;
    this.ink = null; this.inkCtx = null;
    this.maskC = null; this.maskCtx = null;
    this.baseIntro = null; this.bIntroCtx = null;

    this.seed = this.baseSeed;
    this.scale = 800;
    this.cellCache = new Map();
    this.particles = [];
    this.buckets = new Map();
    this.growth = null;
    this.introT = 0;
    this.introStart = 0;
    this.phase = 'boot';
    this.ready = false;
    this.finished = false;
    this.last = 0; this.acc = 0;
    this.fps = 0; this.fpsCount = 0; this.fpsAt = 0;
    this.quality = 0; this.govAt = 0;
    this.warmLeft = 0;
    this.setupEpoch = 0;
    this.holdUntil = 0;      // 空跑预热期间，生长时间轴先不走
    this.painted = false;    // 是否已经往屏幕上画过第一帧
    this.released = false;   // 开场层是否已经撤掉
    this.lastW = 0; this.lastH = 0;
    this.raf = 0; this.leaveTimer = 0; this.resizeTimer = 0; this.ro = null;
    this.holdTimer = 0; this.hardTimer = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.api = {
      canvas: null, ctx2d: null,
      under: null, baseCtx: null, ink: null, inkCtx: null,
      maskC: null, maskCtx: null, baseIntro: null, bIntroCtx: null,
      gpu: null, scale: 800,
      particles: this.particles, buckets: this.buckets, cellCache: this.cellCache,
      growth: null, introT: 0, phase: 'boot', quality: 0,
      rnd: () => this.rnd(),
    };

    this.hooks = definition.create(this.api);
    if (!Array.isArray(this.hooks.seeds) || this.hooks.seeds.length !== 6) {
      throw new Error('开场动画需要 6 个生长光点 seeds');
    }

    this.loop = this.loop.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onKey = this.onKey.bind(this);
  }

  /* ---------- 挂载 ---------- */
  open() {
    const self = this;
    // 临时诊断：设 window.__openPerf = [] 后重进开场，可拿到各阶段耗时
    const T = (typeof window !== 'undefined' && window.__openPerf) ? window.__openPerf : null;
    this.mountAt = performance.now();
    if (T) { T.t0 = this.mountAt; T.push(['mount', 0]); }
    const def = this.def;
    const root = document.createElement('div');
    // is-cold：setup 里那几帧重活跑完之前先别上屏，避免把长任务当成动画的开头
    root.className = 'mumu-opening mumu-opening--' + def.key + ' is-cold';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '《' + def.title + '》开场动画');
    const subtitle = def.subtitle ? '<span class="mumu-opening__sub">' + esc(def.subtitle) + '</span>' : '';
    root.innerHTML = `
      <canvas class="mumu-opening__sky" role="img" aria-label="${esc(def.ariaLabel || '')}"></canvas>
      <button type="button" class="mumu-opening__skip" data-opening-skip>跳过动画</button>
      <div class="mumu-opening__cap" data-opening-cap>
        <h1 class="mumu-opening__title">${esc(def.title)}${subtitle}</h1>
        <p class="mumu-opening__hint">点击任意处开始剧本</p>
      </div>`;
    (document.getElementById('ui-layer') || document.body).appendChild(root);
    this.root = root;
    this.canvas = root.querySelector('.mumu-opening__sky');
    this.capEl = root.querySelector('[data-opening-cap]');
    this.skipEl = root.querySelector('[data-opening-skip]');

    this.under = document.createElement('canvas'); this.baseCtx = this.under.getContext('2d', { alpha: false });
    this.ink = document.createElement('canvas');
    this.maskC = document.createElement('canvas'); this.maskCtx = this.maskC.getContext('2d');
    this.baseIntro = document.createElement('canvas'); this.bIntroCtx = this.baseIntro.getContext('2d', { alpha: false });
    this.syncApi();

    if (typeof this.hooks.makeFilm === 'function') {
      try {
        this.gpu = this.hooks.makeFilm(this.canvas);
        this.inkCtx = this.ink.getContext('2d', { alpha: true });
      } catch (err) {
        // WebGL2 不可用：换一张干净的画布走 Canvas2D 回退
        // （同一张 canvas 拿过 webgl 上下文后就不能再拿 2d 上下文）
        const clone = this.canvas.cloneNode();
        this.canvas.replaceWith(clone);
        this.canvas = clone;
        this.ctx2d = clone.getContext('2d', { alpha: false });
        this.inkCtx = this.ink.getContext('2d', { alpha: false });
        this.gpu = null;
      }
    } else {
      this.ctx2d = this.canvas.getContext('2d', { alpha: false });
      this.inkCtx = this.ink.getContext('2d', { alpha: false });
    }
    if (T) T.push(['film', Math.round(performance.now() - T.t0)]);
    this.syncApi();

    root.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKey, true);
    // ResizeObserver 在 observe 当下就会回调一次，直接重建等于把整场动画建两遍
    // （实测开头那 900ms 的卡顿有一多半来自这第二遍）。只在尺寸真的变了时才重排。
    this.lastW = innerWidth;
    this.lastH = innerHeight;
    this.ro = new ResizeObserver((entries) => {
      const box = entries && entries[0] && entries[0].contentRect;
      const w = box ? box.width : innerWidth;
      const h = box ? box.height : innerHeight;
      if (Math.abs(w - this.lastW) <= 8 && Math.abs(h - this.lastH) <= 8) return;
      this.lastW = w; this.lastH = h;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        if (this.finished || !this.root) return;
        this.setup(this.phase === 'intro' && !this.ready);
      }, 200);
    });
    this.ro.observe(root);

    this.setup(!this.reduced);
    this.raf = requestAnimationFrame(this.loop);

    // 自动化验证钩子（随开场一起销毁）
    window.__mumuOpening = {
      get key() { return self.def.key; },
      get phase() { return self.phase; },
      get ready() { return self.ready; },
      get titleShown() { return self.ready; },
      get renderer() { return self.gpu ? 'webgl2' : 'canvas2d'; },
      get fps() { return Math.round(self.fps); },
      get quality() { return self.quality; },
      get strokes() { return self.particles.length; },
      get introT() { return Math.round(self.introT * 10) / 10; },
      skip: () => self.finish(),
    };
  }

  syncApi() {
    const api = this.api;
    api.canvas = this.canvas; api.ctx2d = this.ctx2d;
    api.under = this.under; api.baseCtx = this.baseCtx;
    api.ink = this.ink; api.inkCtx = this.inkCtx;
    api.maskC = this.maskC; api.maskCtx = this.maskCtx;
    api.baseIntro = this.baseIntro; api.bIntroCtx = this.bIntroCtx;
    api.gpu = this.gpu; api.scale = this.scale;
    api.particles = this.particles; api.buckets = this.buckets; api.cellCache = this.cellCache;
    api.growth = this.growth; api.introT = this.introT; api.phase = this.phase; api.quality = this.quality;
  }
  pushApi() {
    const api = this.api;
    api.scale = this.scale; api.growth = this.growth; api.introT = this.introT;
    api.phase = this.phase; api.quality = this.quality; api.particles = this.particles;
  }

  /* ---------- 确定性随机 ---------- */
  rnd() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  /* ---------- 建场 / 预热 ----------
     分帧建场：底涂与首几帧各要几百毫秒（实测《星月夜》paintUnder 约 670ms），
     全压在一次同步调用里 = 点完章节整页僵住一秒。这里先只做便宜的画布尺寸，
     下一帧把幕布（主题底色）亮出来，重活再拆成三段、段间各让出一帧，
     观众看到的是「幕启 → 生长」而不是一段死机。 */
  setup(replayIntro) {
    const epoch = ++this.setupEpoch;
    const alive = () => epoch === this.setupEpoch && !this.finished && !!this.root;
    const T = (typeof window !== 'undefined' && window.__openPerf) ? window.__openPerf : null;
    if (T) T.t0 = performance.now();
    const mk = (k) => { if (T) T.push([k, Math.round(performance.now() - T.t0)]); };
    const later = (name, fn) => requestAnimationFrame(() => {
      if (!alive()) return;
      try { fn(); mk(name); } catch (e) {
        // 建场没跑完也不能把观众关在幕布后面：放行标题与点击，宁可没动画也别卡住剧情
        this.phase = 'live';
        this.showReady();
      }
    });

    // 同步段只挑便宜的活做，保证下一帧就能把幕布画出来
    const coverW = Math.max(innerWidth, innerHeight * W);
    this.scale = Math.min(this.scaleCap, Math.max(600, coverW * Math.min(devicePixelRatio || 1, 2) / W));
    const pw = Math.round(this.scale * W), ph = Math.round(this.scale * H);
    for (const c of [this.canvas, this.under, this.ink, this.maskC, this.baseIntro]) { c.width = pw; c.height = ph; }
    if (this.gpu) this.gpu.resize(pw, ph);
    this.seed = this.baseSeed;
    this.pushApi();
    mk('size');

    later('curtain', () => { if (this.root) this.root.classList.remove('is-cold'); });
    // 最贵的一段：印象派底涂（只画进离屏 under，此时幕布仍是纯色）
    later('paintUnder', () => { this.hooks.paintUnder(this.api); });
    later('spawn', () => {
      if (this.gpu) this.gpu.setBase(this.under);
      this.particles = Array.from({ length: Math.round(this.params.density * Q_FACTOR[this.quality]) }, () => this.hooks.spawn(true));
      this.api.particles = this.particles;
      this.warmLeft = 48;
    });
    later('go', () => {
      if (replayIntro && !this.reduced) {
        this.beginIntro(performance.now());
        // 空跑几帧再上屏：空间网格、缓存与首帧纹理都在离屏备好，
        // 观众看到的第一帧就是稳定帧率的普通帧（否则开头两三帧全是长任务）。
        for (let i = 0; i < PRIME_FRAMES; i++) this.frameStep(1, false);
        this.holdUntil = performance.now() + 160;   // 时间轴稍等 is-painted 的淡入
        return;
      }
      this.growth = null;
      this.phase = 'warm';
      this.pushApi();
      const warm = () => {
        if (!alive()) return;
        for (let i = 0; i < 4 && this.warmLeft > 0; i++, this.warmLeft--) this.frameStep(1, false);
        this.present();
        if (this.warmLeft > 0) requestAnimationFrame(warm);
        else { this.phase = 'live'; this.last = 0; this.showReady(); }
      };
      warm();
    });
  }

  beginIntro(now) {
    this.phase = 'intro'; this.introStart = now; this.introT = 0;
    this.growth = this.hooks.seeds;
    this.pushApi();
    this.hooks.updateGrowth(this.api, 0);
  }
  endIntro() {
    this.growth = null;
    if (this.gpu) this.gpu.setBase(this.under);
    this.phase = 'live';
    this.last = 0;
    this.pushApi();
    this.showReady();             // 画面完整后，裸露标题缓缓浮现
  }

  /* ---------- 一帧绘制 ---------- */
  frameStep(dt, show) {
    this.pushApi();
    if (this.growth && !this.gpu && this.hooks.refreshGrowth) this.hooks.refreshGrowth(this.api);
    this.hooks.step(this.api, dt);
    if (this.gpu) this.gpu.advance(this.ink, dt, this.growth);
    if (show) this.present();
  }
  present() {
    if (this.hooks.present) this.hooks.present(this.api);
    else if (this.gpu) this.gpu.render();
    else this.ctx2d.drawImage(this.ink, 0, 0);
    // 第一次真的往屏幕上画东西：让画面从幕布底色后面淡入
    if (!this.painted && this.root) { this.painted = true; this.root.classList.add('is-painted'); }
  }

  /* ---------- 主循环 ---------- */
  loop(now) {
    if (this.finished) return;
    this.raf = requestAnimationFrame(this.loop);
    this.fpsCount++;
    if (now - this.fpsAt >= 1000) { this.fps = this.fpsCount * 1000 / (now - this.fpsAt); this.fpsCount = 0; this.fpsAt = now; }
    if (this.phase === 'intro') {
      // 预热空跑的那一小段：画面已在离屏备好，但时间轴先别走，
      // 否则生长的前两秒会整段被长任务吃掉（看起来就是开头一卡一卡）。
      if (this.holdUntil && now < this.holdUntil) { this.last = now; return; }
      this.holdUntil = 0;
      const t = (now - this.introStart) / 1000;
      this.introT = t;
      this.hooks.updateGrowth(this.api, t);
      if (t >= this.titleAt) this.showReady();
      if (!this.last) this.last = now;
      this.acc += Math.min(80, now - this.last); this.last = now;
      if (this.acc >= 1000 / 30) {
        const dt = Math.min(2, this.acc / (1000 / 30));
        this.acc = 0;
        this.frameStep(dt, true);
      }
      if (t >= this.introEnd) this.endIntro();
      // 生长阶段也带降级：低配机上「开头卡」主要是笔触太多而不是冷启动。
      // 只在开播 1.2 秒后按帧率降一级（intro 期间降两级会让画面明显变空）。
      if (now - this.govAt > 1200) {
        this.govAt = now;
        if (this.introT > 1.2 && this.fps > 0 && this.fps < 45 && this.quality < 1) {
          this.quality++; this.applyDensity();
        }
      }
      return;
    }
    if (document.hidden || this.phase === 'warm' || this.phase === 'boot') { this.last = now; return; }
    if (!this.last) this.last = now;
    this.acc += Math.min(80, now - this.last); this.last = now;
    if (this.acc >= 1000 / 30) {
      const dt = Math.min(2, this.acc / (1000 / 30)) * this.params.speed;
      this.acc = 0;
      this.frameStep(dt, true);
    }
    // 自动降级兜底：帧率不足时逐级减少笔触（只降不升）
    if (this.phase === 'live' && now - this.govAt > 2500) {
      this.govAt = now;
      if (this.fps > 0 && this.fps < 48 && this.quality < 2) { this.quality++; this.applyDensity(); }
    }
  }

  applyDensity() {
    const target = Math.round(this.params.density * Q_FACTOR[this.quality]);
    while (this.particles.length < target) this.particles.push(this.hooks.spawn(true));
    this.particles.length = target;
    this.api.particles = this.particles;
    this.pushApi();
  }

  /* ---------- 标题 / 交互 ---------- */
  showReady() {
    if (this.ready) return;
    this.ready = true;
    this.root.classList.add('is-ready');
    this.capEl.classList.add('is-show');
  }
  onClick(e) {
    if (this.finished) return;
    if (e.target.closest('[data-opening-skip]')) {
      e.preventDefault();
      e.stopPropagation();
      this.finish();
      return;
    }
    if (!this.ready) return;      // 标题出来之前，点击不打断画面生长
    e.preventDefault();
    this.finish();
  }
  onKey(e) {
    if (this.finished) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      this.finish();
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && this.ready) {
      e.preventDefault(); e.stopPropagation();
      this.finish();
    }
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    if (this.root) this.root.classList.add('is-leaving');
    const done = this.onDone;
    // 先让剧情接管舞台（开场层仍盖在最上面），等舞台真的画出画面再撤层。
    // 原来这里先 dispose() 再 done()，而 done() 才 showScreen('stage') + 装载
    // scene.js（约 950KB），中间那段空窗就会露出首页几帧。
    if (done) done();
    this.retire();
  }

  /** 撤层：淡出至少要看完整，并且等到舞台画出第一帧（超时兜底后强制撤）。 */
  retire() {
    const floor = this.reduced ? 0 : LEAVE_MS;
    const startedAt = performance.now();
    const release = () => {
      if (this.released) return;
      this.released = true;
      clearTimeout(this.holdTimer);
      clearTimeout(this.hardTimer);
      this.holdTimer = 0; this.hardTimer = 0;
      if (this.root) this.dispose();
    };
    // 信号比淡出先到也要等淡出走完，否则 is-leaving 的过渡被腰斩
    const afterFloor = () => {
      const left = Math.max(0, floor - (performance.now() - startedAt));
      if (left === 0) release();
      else this.holdTimer = setTimeout(release, left);
    };
    let pending = null;
    if (this.onStageReady) {
      try { pending = this.onStageReady(); } catch (e) { pending = null; }
    }
    if (pending && typeof pending.then === 'function') pending.then(afterFloor, afterFloor);
    else afterFloor();
    // 等不到信号（舞台模块装载失败、promise 卡住）也必须撤层
    this.hardTimer = setTimeout(release, HOLD_MS);
  }

  dispose() {
    if (!this.root) return;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.leaveTimer);
    clearTimeout(this.resizeTimer);
    clearTimeout(this.holdTimer);
    clearTimeout(this.hardTimer);
    if (this.ro) { try { this.ro.disconnect(); } catch (e) { /* 忽略 */ } this.ro = null; }
    document.removeEventListener('keydown', this.onKey, true);
    this.root.removeEventListener('click', this.onClick);
    this.root.remove();
    this.root = null;
    if (window.__mumuOpening) { try { delete window.__mumuOpening; } catch (e) { window.__mumuOpening = undefined; } }
    if (this.gpu && this.gpu.gl) {
      try {
        const lose = this.gpu.gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch (e) { /* 忽略 */ }
    }
    this.gpu = null;
    this.particles = [];
    this.cellCache.clear();
    this.buckets.clear();
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let current = null;

/**
 * 打开某部曲目的开场动画。
 * onDone       剧情接管舞台（点标题后 / 跳过时调用，动画层此时仍然盖着）
 * onStageReady 可选，返回「舞台已画出画面」的 Promise；动画层等它兑现后才淡出销毁，
 *              这样切屏与装载 scene.js 的空窗不会透出首页。
 */
export function openSeriesOpening(definition, { onDone, onStageReady } = {}) {
  if (current) return current;
  const layer = new OpeningLayer(definition, { onDone, onStageReady });
  current = layer;
  layer.open();
  const dispose = layer.dispose.bind(layer);
  layer.dispose = () => { if (current === layer) current = null; dispose(); };
  return layer;
}

export function isOpeningOpen() { return !!current; }
export function currentOpeningKey() { return current ? current.def.key : null; }