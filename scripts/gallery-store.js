/* ============================================================
   暮幕 · 角色图鉴存档
   独立键 mumu.gallery.v1：记录已解锁卡牌与已发放过奖励的章节。
   纯函数集中在这里，便于 node --test 直接覆盖。
   ============================================================ */

import { getCard, getSeries, isSevenCard } from './gallery-data.js';

export const GALLERY_VERSION = 1;
export const GALLERY_KEY = 'mumu.gallery.v1';

export function createGalleryState() {
  return { version: GALLERY_VERSION, unlocked: {}, granted: {} };
}

/** 只保留当前版本认识的卡牌 / 章节键，坏数据不污染图鉴。 */
export function normalizeGalleryState(raw) {
  const state = createGalleryState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;

  const unlocked = raw.unlocked;
  if (unlocked && typeof unlocked === 'object' && !Array.isArray(unlocked)) {
    for (const key of Object.keys(unlocked)) {
      if (unlocked[key] === true && getCard(key) && !isSevenCard(key)) state.unlocked[key] = true;
    }
  }

  const granted = raw.granted;
  if (granted && typeof granted === 'object' && !Array.isArray(granted)) {
    for (const key of Object.keys(granted)) {
      if (granted[key] === true && key.length > 0 && key.length <= 120) state.granted[key] = true;
    }
  }
  return state;
}

function defaultStorage() {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}

export function loadGallery(storage = defaultStorage()) {
  if (!storage || typeof storage.getItem !== 'function') return createGalleryState();
  try {
    const raw = storage.getItem(GALLERY_KEY);
    return raw ? normalizeGalleryState(JSON.parse(raw)) : createGalleryState();
  } catch (e) {
    return createGalleryState();
  }
}

export function saveGallery(state, storage = defaultStorage()) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(GALLERY_KEY, JSON.stringify(normalizeGalleryState(state)));
    return true;
  } catch (e) {
    return false;
  }
}

/** 七星卡永久解锁；角色卡看存档。 */
export function isCardUnlocked(cardOrKey, state) {
  const card = typeof cardOrKey === 'string' ? getCard(cardOrKey) : cardOrKey;
  if (!card) return false;
  if (card.kind === 'seven') return true;
  return !!(state && state.unlocked && state.unlocked[card.key]);
}

/**
 * 本章应发几张：按「剩余角色 / 剩余章节」向上取整，
 * 最后一章把剩下的全部发完，保证整条曲目刚好送齐。
 */
export function chapterRewardCount(seriesKey, chapterNo, unlocked = {}) {
  const series = getSeries(seriesKey);
  if (!series) return 0;
  const no = Number.isInteger(chapterNo) ? chapterNo : Number(chapterNo);
  if (!Number.isInteger(no) || no < 1 || no > series.chapters) return 0;

  const remaining = series.characters.filter((c) => !unlocked[c.key]).length;
  if (!remaining) return 0;
  if (no === series.chapters) return remaining;
  const chaptersLeft = series.chapters - no + 1;
  return Math.min(remaining, Math.ceil(remaining / chaptersLeft));
}

/** 洗牌只用于「随机送」，注入 random 便于测试。 */
function shuffled(list, random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const r = Number(random());
    const j = Math.floor((Number.isFinite(r) ? Math.min(0.999999, Math.max(0, r)) : 0) * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

/**
 * 纯计算：给这一章结算奖励，不写 localStorage。
 * @returns {{state, cards, alreadyGranted, grantedNow}}
 */
export function planChapterRewards(state, script, { random = Math.random } = {}) {
  const base = normalizeGalleryState(state);
  const next = { version: GALLERY_VERSION, unlocked: { ...base.unlocked }, granted: { ...base.granted } };
  const empty = { state: next, cards: [], alreadyGranted: false, grantedNow: false };

  if (!script || script.builtin !== true || !script.series) return empty;
  const series = getSeries(script.series);
  if (!series) return empty;

  const chapterNo = Number(script.chapterNo);
  if (!Number.isInteger(chapterNo) || chapterNo < 1 || chapterNo > series.chapters) return empty;

  const grantKey = script.id || `${series.key}-${chapterNo}`;
  if (next.granted[grantKey]) return { ...empty, alreadyGranted: true };

  const count = chapterRewardCount(series.key, chapterNo, next.unlocked);
  const remaining = series.characters.filter((c) => !next.unlocked[c.key]);
  const cards = count > 0 ? shuffled(remaining, random).slice(0, count) : [];

  for (const card of cards) next.unlocked[card.key] = true;
  next.granted[grantKey] = true;

  return { state: next, cards, alreadyGranted: false, grantedNow: true };
}

/**
 * 读存档 → 结算 → 写回。写失败时仍返回本轮新卡，但 persisted=false。
 * @returns {{cards, state, alreadyGranted, grantedNow, persisted, error}}
 */
export function grantChapterCards(script, { storage = defaultStorage(), random = Math.random } = {}) {
  const before = loadGallery(storage);
  const plan = planChapterRewards(before, script, { random });
  if (!plan.grantedNow) {
    return { ...plan, persisted: true, error: null };
  }
  const persisted = saveGallery(plan.state, storage);
  return {
    ...plan,
    persisted,
    error: persisted ? null : '浏览器存储空间不足，本次获得的角色卡可能无法保留。',
  };
}
