/* ============================================================
   暮幕 · 人物立绘
   半身剪影（无五官、侧脸、透明底），作为唯一的人物模型。
   渲染时只做：左右站位 / 镜像 / 呼吸 / 暖色边缘光 / 底部渐隐。
   ============================================================ */

export const PORTRAITS = {
  'painter':          { label: '画师少年', src: './assets/models/painter.cut.png' },
  'colorist':         { label: '调色少女', src: './assets/models/colorist.cut.png' },
  'pageboy':          { label: '小厮男童', src: './assets/models/pageboy.cut.png' },
  'maidgirl':         { label: '侍女女童', src: './assets/models/maidgirl.cut.png' },
  'official':         { label: '官袍长者', src: './assets/models/official.cut.png' },
  'dowager':          { label: '凤袍太后', src: './assets/models/dowager.cut.png' },
  'teen-girl-2':      { label: '少女（2）', src: './assets/models/teen-girl-2.cut.png' },
  'teen-girl':        { label: '少女',     src: './assets/models/teen-girl.cut.png' },
  'teen-boy':         { label: '少年',     src: './assets/models/teen-boy.cut.png' },
  'girl-child':       { label: '女儿童',   src: './assets/models/girl-child.cut.png' },
  'boy-child':        { label: '男儿童',   src: './assets/models/boy-child.cut.png' },
  'middle-age-woman': { label: '中年女人', src: './assets/models/middle-age-woman.cut.png' },
  'middle-age-man':   { label: '中年男人', src: './assets/models/middle-age-man.cut.png' },
  'lucas':            { label: '卢卡斯·范·登·伯格', src: './assets/models/lucas.cut.png' },
  'claire':           { label: '克莱尔·温莎', src: './assets/models/claire.cut.png' },
  'marguerite':       { label: '玛格丽特·德拉图尔', src: './assets/models/marguerite.cut.png' },
  'henri':            { label: '亨利·莫罗', src: './assets/models/henri.cut.png' },
  'julian':           { label: '朱利安·勒克莱尔', src: './assets/models/julian.cut.png' },
  'sofia':            { label: '索菲娅·科瓦列夫斯卡娅', src: './assets/models/sofia.cut.png' },
  'etienne':          { label: '艾蒂安·巴尔贝', src: './assets/models/etienne.cut.png' },
  'elena':            { label: '埃莱娜·罗西', src: './assets/models/elena.cut.png' },
  'linshen':          { label: '林深', src: './assets/models/linshen.cut.png' },
  'suwan':            { label: '苏晚', src: './assets/models/suwan.cut.png' },
  'guyan':            { label: '顾言', src: './assets/models/guyan.cut.png' },
  'xiaqing':          { label: '夏晴', src: './assets/models/xiaqing.cut.png' },
  'chenmo':           { label: '陈默', src: './assets/models/chenmo.cut.png' },
  'zhoumubai':        { label: '周慕白', src: './assets/models/zhoumubai.cut.png' },
  'yezhiqiu':         { label: '叶知秋', src: './assets/models/yezhiqiu.cut.png' },
};

const images = new Map();
// 加载失败的键：按需兜底会每帧重试，记下尝试次数与时间，做有限次自动重试
const failedKeys = new Map();
const MAX_AUTO_RETRY = 2;     // 失败后再自动重试 2 次（间隔 ≥5s），之后交给显式 preloadPortraits()
const RETRY_DELAY_MS = 5000;

function makeFaded(key, img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  // 底部 28% 渐隐，半身立绘不会在胸口出现生硬的裁切线
  const top = c.height * 0.72;
  g.globalCompositeOperation = 'destination-in';
  // 注意：destination-in 的源必须覆盖整张画布，
  // 否则未覆盖的上半部分会被当成透明源整块擦掉（立绘只剩肩膀）。
  const fade = g.createLinearGradient(0, 0, 0, c.height);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(top / c.height, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, c.width, c.height);
  const entry = images.get(key);
  if (entry) { entry.faded = c; entry.ready = true; }
}

const PORTRAIT_IDLE_BATCH = 4;

/** 把 keys 按 size 切成批次（纯函数，供单测）；size 非法时退回 1，避免步长为 0 死循环。 */
export function planPortraitBatches(keys, size = PORTRAIT_IDLE_BATCH) {
  const step = Math.max(1, size | 0);
  const out = [];
  for (let i = 0; i < keys.length; i += step) out.push(keys.slice(i, i + step));
  return out;
}

function loadPortrait(key) {
  // 显式全量预加载与空闲分批可能并存；失败键按次数与间隔做有限自动重试，避免每帧发请求
  if (images.has(key)) return;
  const prev = failedKeys.get(key);
  if (prev && (prev.count >= MAX_AUTO_RETRY || Date.now() - prev.at < RETRY_DELAY_MS)) return;
  const img = new Image();
  img.decoding = 'async';
  const entry = { img, faded: null, ready: false };
  images.set(key, entry);
  img.onload = () => makeFaded(key, img);
  img.onerror = () => {
    console.error('立绘加载失败', PORTRAITS[key].src);
    // 失败条目移出缓存并记入失败表：短暂故障 5 秒后自动再试，连续失败则等显式 preloadPortraits()
    images.delete(key);
    const f = failedKeys.get(key);
    failedKeys.set(key, { count: (f ? f.count : 0) + 1, at: Date.now() });
  };
  img.src = PORTRAITS[key].src;
}

/** 显式全量预加载（调试 / 测试用；正常启动走 schedulePortraitPreload）。 */
export function preloadPortraits() {
  failedKeys.clear();
  for (const key of Object.keys(PORTRAITS)) loadPortrait(key);
}

function atIdle(fn, timeout) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout });
  else setTimeout(fn, 60);
}

/** 首页首帧之后再分批预加载立绘：不阻塞首屏可交互（幂等）。 */
export function schedulePortraitPreload() {
  if (schedulePortraitPreload.started) return;
  schedulePortraitPreload.started = true;
  const batches = planPortraitBatches(Object.keys(PORTRAITS));
  const start = () => {
    let i = 0;
    const next = () => {
      const batch = batches[i++];
      if (!batch) return;
      for (const key of batch) loadPortrait(key);
      atIdle(next, 300);
    };
    atIdle(next, 1200);
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

export function portraitOf(key) {
  return PORTRAITS[key] ? key : 'teen-girl';
}

export function portraitImage(key) {
  const k = portraitOf(key);
  const entry = images.get(k);
  if (entry) return entry;
  // 按需兜底：空闲分批在后台标签页可能被节流，首次绘制的人像就地补一次加载，
  // 本帧仍返回 null（不画半个立绘），下一帧起正常走 drawPortrait。
  loadPortrait(k);
  return null;
}

function hexA(hex, a) {
  const h = String(hex || '#ffcf94').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * 画一张半身立绘。
 * x: 水平中心；bottom: 画面下沿；height: 立绘高度；
 * facing: 1 朝右，-1 朝左
 */
export function drawPortrait(ctx, key, o = {}) {
  const {
    x, bottom, height, facing = 1, alpha = 1, time = 0, phase = 0,
    glow = '#ffcf94', depth = 0, speaking = false,
  } = o;
  const entry = portraitImage(key);
  if (!entry || !entry.ready) return;
  const src = entry.faded || entry.img;
  if (!src) return;

  const ratio = src.width / src.height;
  const w = height * ratio;
  const bob = Math.sin(time * 0.75 + phase) * height * 0.004;
  const sway = Math.sin(time * 0.42 + phase * 1.7) * height * 0.0022;
  const scale = speaking ? 1.012 : 1;
  const h = height * scale;
  const top = bottom - h + bob;

  // 1) 身后的空气光：让剪影从暮色里透出来
  ctx.save();
  ctx.translate(x + sway, top);
  ctx.scale(facing, 1);
  const halo = ctx.createRadialGradient(0, h * 0.42, h * 0.04, 0, h * 0.42, h * 0.8);
  halo.addColorStop(0, hexA(glow, 0.1 * (1 - depth)));
  halo.addColorStop(1, hexA(glow, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(-w * 1.1, -h * 0.5, w * 2.2, h * 1.7);
  ctx.restore();

  // 2) 立绘本体 + 暖色边缘光（阴影沿光的方向勾边）
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + sway, top);
  ctx.scale(facing, 1);
  ctx.shadowColor = hexA(glow, 0.5);
  ctx.shadowBlur = Math.max(6, h * 0.026);
  ctx.shadowOffsetX = facing * h * 0.006;
  ctx.shadowOffsetY = -h * 0.004;
  ctx.drawImage(src, -w / 2, 0, w, h);
  ctx.restore();

  // 3) 一层极轻的加法微光，只提亮内部的浅色线条
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.14 * (1 - depth * 0.6);
  ctx.translate(x + sway + facing * h * 0.003, top);
  ctx.scale(facing, 1);
  ctx.drawImage(src, -w / 2, 0, w, h);
  ctx.restore();
}
