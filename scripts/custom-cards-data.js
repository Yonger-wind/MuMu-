/* ============================================================
   暮幕 · 自定义卡片纯逻辑
   ------------------------------------------------------------
   图鉴「自定义卡片」页的数据层：面板 12 项参数与卡片条目的
   夹紧 / 校验 / 序列化 / 配额回退。不碰 DOM，方便 node --test 覆盖。

   两条硬约束在本文件把关：
   1) 自定义卡星级永不超过 5 星（MAX_STARS，面板与读档都夹紧）；
   2) 面板参数只作用于自定义卡，内置角色卡参数在 gallery-card.js 里写死。
   ============================================================ */

export const CUSTOM_CARDS_KEY = 'mumu.customcards.v1';
export const CUSTOM_FX_KEY = 'mumu.customcards.fx.v1';

/** 自定义卡最多 5 星（内置卡不受此限，见 gallery-data.js）。 */
export const MAX_STARS = 5;
/** 最多 12 张，防止 localStorage 被 dataURL 撑爆。 */
export const MAX_CARDS = 12;
/** 上传图最长边压到 1000px，够卡面用又留出存储余量。 */
export const MAX_IMAGE_EDGE = 1000;
export const MAX_NAME = 24;
export const MAX_TITLE = 60;

/** 面板「画幅 / 箔层花纹 / 主题」三组的可选值，与截图一一对应。 */
export const ASPECTS = Object.freeze(['4 / 5', '3 / 4', '2 / 3', '1 / 1', '16 / 9']);
export const PATTERNS = Object.freeze(['none', 'stripes', 'grating', 'dots', 'hex']);
export const THEMES = Object.freeze(['dark', 'light']);

const DEFAULT_FX = {
  theme: 'dark',
  holo: 1,
  glare: 1,
  foil: null,          // null = 按图片是否透明底自动决定（面板显示「自动」）
  tilt: 40,
  parallax: 0,
  radius: 0,
  aspect: '4 / 5',
  pattern: 'stripes',
  stars: 5,
  rating: 4,
  showStars: true,
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round2 = (v) => Math.round(v * 100) / 100;

/* 数值项：坏值一律回默认，其余夹进区间 */
function num(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(round2(n), min, max) : fallback;
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  const id = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
  return id;
}

function randomId() {
  return 'cc-' + Math.random().toString(36).slice(2, 8);
}

function cleanText(value, max) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}

/** 星级：非数字给 0，其余夹进 0~5。 */
export function clampStar(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? clamp(n, 0, MAX_STARS) : 0;
}

export function defaultFx() {
  return { ...DEFAULT_FX };
}

/** 面板参数：只认截图里那 12 项，多余字段一律丢弃。 */
export function normalizeFx(raw) {
  const d = defaultFx();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;

  const slots = Math.round(Number(raw.stars));
  const stars = Number.isFinite(slots) ? clamp(slots, 1, MAX_STARS) : d.stars;
  const foil = typeof raw.foil === 'number' && Number.isFinite(raw.foil) ? clamp(round2(raw.foil), 0, 1) : null;

  return {
    theme: THEMES.includes(raw.theme) ? raw.theme : d.theme,
    holo: num(raw.holo, 0, 1, d.holo),
    glare: num(raw.glare, 0, 1.5, d.glare),
    foil,
    tilt: num(raw.tilt, 0, 40, d.tilt),
    parallax: num(raw.parallax, 0, 30, d.parallax),
    radius: num(raw.radius, 0, 32, d.radius),
    aspect: ASPECTS.includes(raw.aspect) ? raw.aspect : d.aspect,
    pattern: PATTERNS.includes(raw.pattern) ? raw.pattern : d.pattern,
    stars,
    rating: Math.min(raw.rating === undefined ? d.rating : clampStar(raw.rating), stars),
    showStars: raw.showStars === undefined ? d.showStars : !!raw.showStars,
  };
}

/** 只放行 data:image/* 与站内相对路径，杜绝 javascript: / 外链注入。 */
export function isSafeImageSrc(value) {
  if (typeof value !== 'string') return false;
  const src = value.trim();
  if (!src) return false;
  if (src.startsWith('data:image/')) return true;
  if (src.startsWith('./') && !src.includes('..') && !src.includes(':')) return true;
  return false;
}

/** 单张卡：slots 来自面板的「星星颗数」，评级不会超过它。 */
export function normalizeCard(raw, slots = MAX_STARS) {
  const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const total = clamp(Math.round(Number(slots)) || MAX_STARS, 1, MAX_STARS);
  return {
    id: cleanId(d.id) || randomId(),
    name: cleanText(d.name, MAX_NAME),
    title: cleanText(d.title, MAX_TITLE),
    image: isSafeImageSrc(d.image) ? String(d.image).trim() : '',
    alpha: typeof d.alpha === 'boolean' ? d.alpha : null,
    rating: Math.min(clampStar(d.rating), total),
  };
}

/** 卡列表：坏条目丢弃、id 补齐去重、总量截到 12 张。 */
export function normalizeCards(raw, slots = MAX_STARS) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (out.length >= MAX_CARDS) break;
    const card = normalizeCard(item, slots);
    if (seen.has(card.id)) card.id = nextId(out);
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

/** 第一个没被占用的 cc-N 编号。 */
export function nextId(cards) {
  const used = new Set((cards || []).map((c) => c && c.id));
  for (let n = 1; n < 100000; n += 1) {
    if (!used.has('cc-' + n)) return 'cc-' + n;
  }
  return randomId();
}

/** 新卡用面板的批量星级起卡。 */
export function newCard(id, fx) {
  const f = normalizeFx(fx);
  return { id, name: '新卡片', title: '', image: '', alpha: null, rating: Math.min(f.rating, f.stars) };
}

export function stripImages(cards) {
  return (cards || []).map((c) => ({ ...c, image: '' }));
}

/** 写卡：全量 → 撑爆配额退化成只存文字 → 再失败就清掉旧档。 */
export function writeCards(cards, storage = defaultStorage()) {
  if (!storage || typeof storage.setItem !== 'function') return 'failed';
  const list = normalizeCards(cards, MAX_STARS);
  try {
    storage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(list));
    return 'ok';
  } catch (e) { /* 图片太大，退一步 */ }
  try {
    storage.setItem(CUSTOM_CARDS_KEY, JSON.stringify(stripImages(list)));
    return 'stripped';
  } catch (e) { /* 连文字都存不下 */ }
  try { if (typeof storage.removeItem === 'function') storage.removeItem(CUSTOM_CARDS_KEY); } catch (e) { /* 忽略 */ }
  return 'failed';
}

export function readCards(storage = defaultStorage(), slots = MAX_STARS) {
  if (!storage || typeof storage.getItem !== 'function') return [];
  let raw = null;
  try { raw = storage.getItem(CUSTOM_CARDS_KEY); } catch (e) { return []; }
  if (!raw) return [];
  try { return normalizeCards(JSON.parse(raw), slots); } catch (e) { return []; }
}

export function writeFx(fx, storage = defaultStorage()) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(CUSTOM_FX_KEY, JSON.stringify(normalizeFx(fx)));
    return true;
  } catch (e) { return false; }
}

export function readFx(storage = defaultStorage()) {
  if (!storage || typeof storage.getItem !== 'function') return defaultFx();
  let raw = null;
  try { raw = storage.getItem(CUSTOM_FX_KEY); } catch (e) { return defaultFx(); }
  if (!raw) return defaultFx();
  try { return normalizeFx(JSON.parse(raw)); } catch (e) { return defaultFx(); }
}

/** 上传图缩放：最长边不超过 max，异常尺寸退化为 1×1。 */
export function downscaleSize(width, height, max = MAX_IMAGE_EDGE) {
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { w: 1, h: 1 };
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** 透明底留 PNG（保住剪影边缘），其余走 JPEG 省存储。 */
export function imageTypeForAlpha(alpha) {
  return alpha === true ? 'image/png' : 'image/jpeg';
}

/** 全屏检视翻页：首尾循环；只有一张或数量异常时原地不动。 */
export function stepIndex(index, delta, count) {
  const n = Math.round(Number(count));
  if (!Number.isFinite(n) || n <= 1) return 0;
  const from = Math.round(Number(index));
  const base = Number.isFinite(from) ? ((from % n) + n) % n : 0;
  const step = Math.round(Number(delta)) || 0;
  return ((base + step) % n + n) % n;
}