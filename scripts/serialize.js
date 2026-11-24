/* ============================================================
   暮幕 · 剧本序列化（解析结果 → DSL 文本）
   用途：早期导入、没保留原文的本地剧本也能导出成作品包
   ============================================================ */

import { SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS } from './parser.js';

const GENDER = { f: '女', m: '男' };
const HAIR = { long: '长发', short: '短发' };

function fail(msg) { const e = new Error(msg); e.userFacing = true; return e; }

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
      const cells = [
        c.name || '',
        GENDER[c.gender] || '',
        HAIR[c.hairHint] || '',
        c.clothColor || '',
        model,
      ];
      // 去掉尾部空列，导出文本更干净；只去尾部，避免打乱「性别/发型/衣色/模型」的位置对应。
      // 只剩名字时保留「名字 |」的分隔形式：解析器靠 | 认出角色行，写成「名字」会被当成台词/旁白。
      while (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
      if (cells.length === 1) cells.push('');
      lines.push(cells.join(' | ').replace(/\s+$/, ''));
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
    /** 带条件的节点输出 ?? 前缀；标签行不加。 */
    const emit = (text) => lines.push(
      n.cond ? `?? ${n.cond.neg ? '!' : ''}${n.cond.key} | ${text}` : text,
    );
    switch (n.t) {
      case 'scene':
        emit(`【场景：${sceneLabel(n.scene)} | ${labelOf(TIMES, n.time, '黄昏')} | ${labelOf(CAMS, n.cam, '中景')}】`);
        break;
      case 'cam':
        emit(`【镜头：${labelOf(CAMS, n.cam, '中景')}】`);
        break;
      case 'pose':
        emit(`【姿态：${n.who ? `${n.who}|` : ''}${labelOf(POSES, n.pose, '自然')}】`);
        break;
      case 'action':
        emit(`【动作：${n.who ? `${n.who}|` : ''}${labelOf(ACTS, n.action, '站立')}】`);
        break;
      case 'view':
        emit(`【视角：${labelOf(VIEWS, n.view, '常规')}】`);
        break;
      case 'enter':
        emit(`【出场：${(n.names || []).join('|')}】`);
        break;
      case 'clear':
        emit('【清场】');
        break;
      case 'say': {
        const who = n.who || '旁白';
        if (n.pose) emit(`${who}（${labelOf(POSES, n.pose, '自然')}）：${n.text}`);
        else if (n.voice) emit(`${who}（${n.voice}）：${n.text}`);
        else if (n.note) emit(`${who}（${n.note}）：${n.text}`);
        else emit(`${who}：${n.text}`);
        break;
      }
      case 'choice':
        for (const o of n.options || []) {
          const flags = Array.isArray(o.set) && o.set.length ? ` @${o.set.join(',')}` : '';
          emit(`> ${o.text}${flags} -> ${o.to}`);
        }
        break;
      case 'jump':
        emit(`-> ${n.to}`);
        break;
      case 'end':
        emit(n.ending ? `【结束：${n.ending}】` : '【结束】');
        break;
      default:
        // 将来解析器若新增节点类型，这里必须报错而不是静默丢弃
        throw fail(`未知的节点类型“${n && n.t}”，无法导出为剧本文本。`);
    }
  });

  // 尾部标签（指向最后一个节点之后的位置）也要补上
  for (const name of labelsAt.get(nodes.length) || []) lines.push(`[${name}]`);

  return lines.join('\n');
}
