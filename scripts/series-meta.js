/* ============================================================
   暮幕 · 曲目关键词 / 对白身份 / 免责声明
   图鉴里已经维护了每位内置角色的身份，这里只做一张按曲目隔离的索引：
   - 关键词用于剧本选择页的卡片角标与字幕；
   - 身份用于对白名称下方的小字；自定义剧本没有曲目归属时不会套用内置身份。
   ============================================================ */

import { SERIES } from './gallery-data.js';

/** 四部内置曲目的关键词（选择页展示）。 */
export const SERIES_KEYWORDS = Object.freeze({
  cicada: '青春校园',
  qinglv: '古风',
  vortex: '悬疑',
  moonlight: '言情',
});

export function keywordOf(seriesKey) {
  return SERIES_KEYWORDS[seriesKey] || '';
}

/** 录音里的两个孩子只显示名字，不在名称下补身份。 */
const HIDDEN_IDENTITY = new Set(['小悠真', '小葵']);

const IDENTITY_BY_SERIES = new Map(
  SERIES.map((s) => [s.key, new Map(s.characters.map((c) => [c.name, c.identity]))])
);

/** 去掉“（录音）”“（画外）”等后缀，留下真正的角色名。 */
function speakerName(label) {
  return String(label || '').trim().replace(/[（(][^）)]*[）)]\s*$/, '').trim();
}

/**
 * 对白名称 → 身份小字。
 * 只有内置曲目（seriesKey 为 cicada / qinglv / vortex / moonlight）
 * 且角色名能在这部曲目里找到时才返回；导入剧本不会误套内置身份。
 */
export function identityOfSpeaker(label, seriesKey) {
  if (!seriesKey) return '';
  const map = IDENTITY_BY_SERIES.get(seriesKey);
  if (!map) return '';
  const name = speakerName(label);
  if (!name || HIDDEN_IDENTITY.has(name)) return '';
  return map.get(name) || '';
}

/** 选择剧本页角落的免责声明。 */
export const AI_DISCLAIMER = '剧本由AI生成，如有雷同，纯属巧合';

/** 角色图鉴页底部的免责声明。 */
export const GALLERY_DISCLAIMER = '剧本角色形象由AI生成，如有雷同，纯属巧合';
