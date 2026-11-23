/* ============================================================
   暮幕 · 剧本序列化（解析结果 → DSL 文本）
   用途：早期导入、没保留原文的本地剧本也能导出成作品包
   ============================================================ */

import { SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS } from './parser.js';

const GENDER = { f: '女', m: '男' };
const HAIR = { long: '长发', short: '短发' };

function labelOf(table, key, fallback = '') {
  if (!key) return fallback;
  return table[key] ? table[key].label : fallback;
}

function sceneLabel(key) {
  return labelOf(SCENES, key, key || '教室');
}

/** 把一个解析结果还原成可再次解析的 DSL 文本 */
export function serializeScript(script) {
  const lines = [];
  if (script.title) lines.push(`标题：${script.title}`);
  if (script.summary) lines.push(`简介：${script.summary}`);
  if (script.author) lines.push(`作者：${script.author}`);

  const chars = script.characters || [];
  if (chars.length) {
    lines.push('角色：');
    for (const c of chars) {
      const model = c.model && MODELS[c.model] ? MODELS[c.model].label : '';
      const parts = [
        c.name || '',
        GENDER[c.gender] || '',
        HAIR[c.hairHint] || '',
        c.clothColor || '',
        model,
      ];
      lines.push(parts.join(' | '));
    }
  }

  // 标签下标 = 节点下标，按下标归组
  const labelsAt = new Map();
  for (const [name, idx] of Object.entries(script.labels || {})) {
    if (!labelsAt.has(idx)) labelsAt.set(idx, []);
    labelsAt.get(idx).push(name);
  }

  const nodes = script.nodes || [];
  nodes.forEach((n, i) => {
    for (const name of labelsAt.get(i) || []) lines.push(`[${name}]`);
    switch (n.t) {
      case 'scene':
        lines.push(`【场景：${sceneLabel(n.scene)} | ${labelOf(TIMES, n.time, '黄昏')} | ${labelOf(CAMS, n.cam, '中景')}】`);
        break;
      case 'cam':
        lines.push(`【镜头：${labelOf(CAMS, n.cam, '中景')}】`);
        break;
      case 'pose':
        lines.push(`【姿态：${n.who ? `${n.who}|` : ''}${labelOf(POSES, n.pose, '自然')}】`);
        break;
      case 'action':
        lines.push(`【动作：${n.who ? `${n.who}|` : ''}${labelOf(ACTS, n.action, '站立')}】`);
        break;
      case 'view':
        lines.push(`【视角：${labelOf(VIEWS, n.view, '常规')}】`);
        break;
      case 'enter':
        lines.push(`【出场：${(n.names || []).join('|')}】`);
        break;
      case 'clear':
        lines.push('【清场】');
        break;
      case 'say': {
        const who = n.who || '旁白';
        if (n.pose) lines.push(`${who}（${labelOf(POSES, n.pose, '自然')}）：${n.text}`);
        else if (n.voice) lines.push(`${who}（${n.voice}）：${n.text}`);
        else if (n.note) lines.push(`${who}（${n.note}）：${n.text}`);
        else lines.push(`${who}：${n.text}`);
        break;
      }
      case 'choice':
        for (const o of n.options || []) lines.push(`> ${o.text} -> ${o.to}`);
        break;
      case 'jump':
        lines.push(`-> ${n.to}`);
        break;
      case 'end':
        lines.push(n.ending ? `【结束：${n.ending}】` : '【结束】');
        break;
      default:
        break;
    }
  });

  // 尾部标签（指向最后一个节点之后的位置）也要补上
  for (const name of labelsAt.get(nodes.length) || []) lines.push(`[${name}]`);

  return lines.join('\n');
}
