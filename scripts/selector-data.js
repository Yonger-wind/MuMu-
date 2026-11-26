/* ============================================================
   暮幕 · 剧本选择数据
   把“作品 / 曲目”整理成动画选择页的条目：
   - 四部内置曲目排在最前，用户导入的作品排在后面；
   - 动画页末尾补 7 张“敬请期待”占位卡；
   - 真实条目超过 10 部时退回原来的陈列（占位卡不参与计数）。
   本文件不碰 DOM / Canvas，可直接在 Node 里单测。
   ============================================================ */

import { groupScripts } from './modals.js';
import { keywordOf } from './series-meta.js';

export const SERIES_ORDER = Object.freeze(['cicada', 'qinglv', 'vortex', 'moonlight']);
/** 真实条目（内置曲目 + 导入作品）超过这个数，就隐藏动画、改用原陈列。 */
export const MAX_ANIMATED = 10;
/** 动画页尾部补几张空白剧本。 */
export const SOON_SLOTS = 7;

const SAFE_IMG = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function safeCover(url) {
  const s = String(url || '');
  return SAFE_IMG.test(s) ? s : '';
}

function seriesRank(entry) {
  if (entry.kind !== 'series') return 60;
  const at = SERIES_ORDER.indexOf(entry.key);
  return at >= 0 ? at : 50;
}

/** 把 groupScripts 的结果统一成“一部剧 = 若干章”的形状。 */
export function normalizeEntries(scripts) {
  const grouped = groupScripts(Array.isArray(scripts) ? scripts : []);
  const ordered = grouped
    .map((entry, i) => ({ entry, i, rank: seriesRank(entry) }))
    .sort((a, b) => (a.rank - b.rank) || (a.i - b.i))
    .map((x) => x.entry);

  return ordered.map((entry) => {
    const series = entry.kind === 'series';
    const chapters = series ? entry.chapters : [entry.script].filter(Boolean);
    const first = chapters[0] || {};
    const custom = chapters.some((c) => c.builtin !== true);
    const count = chapters.length;
    return {
      key: entry.key,
      kind: entry.kind,
      title: entry.title || first.seriesTitle || first.title || '未命名剧本',
      brief: entry.brief || first.summary || '',
      keyword: series ? keywordOf(entry.key) : '',
      chapters,
      count,
      custom,
      builtin: !custom,
      cover: first.cover || null,
      coverImage: safeCover(first.coverImage),
      meta: series ? `曲目 · 全 ${count} 章` : '单本 · 1 章',
      badge: series
        ? (custom ? `导入曲目 · 全 ${count} 章` : `合订本 · 全 ${count} 章`)
        : (custom ? '导入剧本' : '内置单本'),
    };
  });
}

/** 7 张“敬请期待”：标题、文案固定，封面色调由选择页按序号生成。 */
export function buildSoonEntries(count = SOON_SLOTS) {
  const n = Math.max(0, Number(count) || 0);
  return Array.from({ length: n }, (_, i) => ({
    key: `soon-${i + 1}`,
    kind: 'soon',
    title: '敬请期待',
    brief: '下一部剧目正在暮色里筹备，不久之后与你在同一片黄昏相见。',
    keyword: '',
    chapters: [],
    count: 0,
    custom: false,
    builtin: false,
    soon: true,
    cover: null,
    coverImage: '',
    meta: '下一部剧目 · 筹备中',
    badge: '筹备中',
  }));
}

/**
 * 选择页的完整数据。
 * useCarousel=false 时调用方应改用原来的 openLibrary 陈列（且不渲染占位卡）。
 */
export function buildSelection(scripts, { soon = SOON_SLOTS } = {}) {
  const real = normalizeEntries(scripts);
  return {
    real,
    entries: [...real, ...buildSoonEntries(soon)],
    realCount: real.length,
    useCarousel: real.length <= MAX_ANIMATED,
  };
}
