/* ============================================================
   暮幕 · 终幕结算
   把引擎交出的结束现场摘要，整理成对话框里可以一眼读完的
   「这一幕 / 一句台词 / 你的选择 / 获得卡牌」。
   纯函数，不碰 DOM，便于 node --test 直接覆盖。
   ============================================================ */

import { SCENES, TIMES } from './parser.js';

function labelOf(table, key) {
  const entry = key ? table[key] : null;
  return entry && typeof entry.label === 'string' ? entry.label : '';
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {object} script 当前剧本
 * @param {{scene?:string,time?:string,choices?:string[],line?:{who?:string,text?:string}|null,ending?:string}} summary
 * @param {{hasNext?:boolean,cards?:Array<{key?:string,name?:string,stars?:number}>}} options
 * @returns {null | {title:string, subtitle:string, where:string, line:{who:string,text:string}|null, choices:string[], cards:Array<{key:string,name:string,stars:number}>}}
 */
export function buildFinale(script, summary, { hasNext = false, cards = [] } = {}) {
  if (!script || !summary || hasNext) return null;

  const time = labelOf(TIMES, summary.time);
  const scene = labelOf(SCENES, summary.scene);
  const where = [time, scene].filter(Boolean).join(' · ') || '故事尽头';

  const text = summary.line ? cleanText(summary.line.text) : '';
  const line = text ? { who: cleanText(summary.line.who), text } : null;

  const choices = Array.isArray(summary.choices)
    ? summary.choices.map(cleanText).filter(Boolean)
    : [];

  const list = (Array.isArray(cards) ? cards : [])
    .filter((card) => card && cleanText(card.name))
    .map((card) => ({
      key: cleanText(card.key),
      name: cleanText(card.name),
      stars: Number.isFinite(card.stars) && card.stars > 0 ? Math.floor(card.stars) : 0,
    }));

  const chapterNo = Number(script.chapterNo);
  const chapter = Number.isInteger(chapterNo) && chapterNo > 0 ? `第 ${chapterNo} 章` : '';
  const seriesTitle = cleanText(script.seriesTitle);

  return {
    // 有曲名时用曲名做主标题，章号做副标题；单章作品直接用标题
    title: seriesTitle || cleanText(script.title) || '幕落',
    subtitle: seriesTitle ? chapter : '',
    where,
    line,
    choices,
    cards: list,
  };
}
