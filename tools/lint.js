/* ============================================================
   暮幕 · 内容校验器（离线工具，不参与游戏运行，零依赖）
   用法：node tools/lint.js <文件...> | --builtin [--json] [--strict]
   规则码见 docs/mumu-lint-rules.md
   ============================================================ */
import {
  SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS,
  matchModel, parseScriptText,
} from '../scripts/parser.js';
import { loadBuiltinScripts } from '../scripts/builtin.js';
// Task 4 会补上：import { readFileSync, existsSync } from 'node:fs';
//                import { fileURLToPath } from 'node:url';
//                import path from 'node:path';

/**
 * 词表匹配：与 scripts/parser.js 的 matchKey 保持同一「认识 / 不认识」口径。
 * 1) 精确别名命中（比较串一律转小写）；
 * 2) 最长的、**作为前缀**包含在文本里的别名；
 * 3) 都没有 → null（未知）。
 *
 * 为什么第 2 步要求「前缀」而不是「任意子串」：
 * - 解析器用的是任意子串，于是【镜头：超特写】里的「特写」会被悄悄命中，
 *   镜头从「中景」被改成「特写」，作者毫不知情 —— 这类「静默改写」正是
 *   本工具要报出来的东西（见设计文档 §1.1），所以工具侧必须判为未知。
 * - 前缀口径同样能保证「火夜」不会被「夜」抢先（最长优先），
 *   并且每个表里的 label / alias 都能被认出来（alias 至少是自身的前缀）。
 * 代价：像「夜晚的教室」这种带修饰语的写法会被判为未知；
 * 本项目的 DSL 里词表值都是单个词，内置语料不受影响。
 */
export function matchTable(table, text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const entries = Object.entries(table);
  // 先精确命中
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      if (a.toLowerCase() === t) return key;
    }
  }
  // 再取最长的前缀别名，避免「火夜」被「夜」抢先识别成夜晚
  let best = null;
  let bestLen = 0;
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      const al = a.toLowerCase();
      if (al.length > bestLen && t.startsWith(al)) { best = key; bestLen = al.length; }
    }
  }
  return best;
}

const DIR_TAGS = new Set([
  '场景', '分镜', '镜头', '姿态', '情绪', '动作', '视角', '机位',
  '出场', '登场', '清场', '空场', '无人', '结束', '完',
]);

/**
 * 舞台指示的 key（【xxx：…】里的 xxx）；未知 key 由规则 E101 报出。
 * 无值形式（【结束】/【完】/【清场】）也要认得出 key，
 * 否则每一条【结束】都会被当成未知标签误报。
 */
export function dirKey(text) {
  const m = String(text).match(/^【\s*([^:：】]+?)\s*(?:[:：][^】]*)?】\s*$/);
  return m ? m[1].trim() : null;
}

/** 舞台指示的值（【场景：教室 | 黄昏】里的「教室 | 黄昏」），无值形式返回 '' */
export function dirValue(text) {
  const m = String(text).match(/^【\s*[^:：]+[:：]\s*([^】]*)\s*】\s*$/);
  return m ? m[1].trim() : '';
}

/**
 * 逐行扫描：把剧本文本拆成带行号的行记录，并抽出角色表、标签、元信息。
 * 分类口径与 scripts/parser.js 对齐：
 * - meta：标题/简介/作者行
 * - charRow：角色块内、含 |、且第一个 | 之前不含冒号的行
 * - label：[xxx]
 * - dir：【…】
 * - choice：> 开头
 * - jump：-> 开头
 * - say：其余非空行
 * 注释行（// 与 <!-- 开头）跟解析器一样直接忽略，不算内容。
 */
export function scanText(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const srcLines = raw.split('\n');
  const lines = [];
  const chars = new Map();
  const labels = [];
  const meta = { title: '', summary: '', author: '' };
  let inCharBlock = false;
  let sawScene = false;
  let sawEnd = false;

  for (let i = 0; i < srcLines.length; i++) {
    const line = i + 1;
    const t = srcLines[i].trim();
    if (!t) continue;
    if (/^(\/\/|<!--)/.test(t)) continue;

    let m;
    if ((m = t.match(/^(?:#\s*)?标题[:：]\s*(.+)$/))) { meta.title = m[1].trim(); inCharBlock = false; lines.push({ line, kind: 'meta', text: t }); continue; }
    if ((m = t.match(/^(?:#\s*)?简介[:：]\s*(.+)$/))) { meta.summary = m[1].trim(); inCharBlock = false; lines.push({ line, kind: 'meta', text: t }); continue; }
    if ((m = t.match(/^(?:#\s*)?作者[:：]\s*(.+)$/))) { meta.author = m[1].trim(); inCharBlock = false; lines.push({ line, kind: 'meta', text: t }); continue; }
    if (/^(?:#\s*)?角色[:：]?\s*$/.test(t)) { inCharBlock = true; continue; }

    if (inCharBlock && t.includes('|') && !t.startsWith('【') && !t.split('|')[0].includes('：') && !t.split('|')[0].includes(':')) {
      const cols = t.split('|').map((x) => x.trim());
      if (cols[0]) chars.set(cols[0], { name: cols[0], cols, model: cols[4] || '', line });
      lines.push({ line, kind: 'charRow', text: t, name: cols[0] });
      continue;
    }
    if (inCharBlock) inCharBlock = false;

    if ((m = t.match(/^\[([^\]]+)\]$/))) {
      labels.push({ name: m[1].trim(), line, targetLine: null });
      lines.push({ line, kind: 'label', text: t, name: m[1].trim() });
      continue;
    }
    if (/^【.*】$/.test(t)) {
      const key = dirKey(t);
      if (key === '场景' || key === '分镜') sawScene = true;
      if (key === '结束' || key === '完') sawEnd = true;
      const value = dirValue(t);
      lines.push({
        line, kind: 'dir', text: t, name: key, value,
        parts: value ? value.split(/[|｜,，\s]+/).filter(Boolean) : [],
      });
      continue;
    }
    if (t.startsWith('>')) {
      const cm = t.match(/^>\s*(.+?)\s*->\s*(.+)$/);
      lines.push({ line, kind: 'choice', text: t, name: cm ? cm[1].trim() : null, value: cm ? cm[2].trim() : null });
      continue;
    }
    if (t.startsWith('->')) {
      const jm = t.match(/^->\s*(.+)$/);
      lines.push({ line, kind: 'jump', text: t, value: jm ? jm[1].trim() : null });
      continue;
    }
    lines.push({ line, kind: 'say', text: t });
  }

  // 标签 → 其后第一个内容行（标签行本身不产生内容）
  for (const lab of labels) {
    const next = lines.find((l) => l.kind !== 'label' && l.line > lab.line);
    lab.targetLine = next ? next.line : null;
  }
  return { lines, chars, labels, meta, sawScene, sawEnd };
}

/**
 * 校验一段剧本文本。
 * Task 1 只交付扫描器骨架：issue 列表暂时为空，规则由 Task 2 / Task 3 填。
 * 返回的 scan 供后续规则复用，避免重复扫描。
 */
export function lintText(text, fileName = '') {
  const scan = scanText(text);
  return { issues: [], summary: { errors: 0, warnings: 0 }, scan };
}

/**
 * 校验一个剧本对象。
 * 有原文（文本剧本）走文本扫描；JSON 剧本本期不校验（无行号），返回空结果。
 */
export function lintScript(script, source, fileName = '') {
  if (source) return lintText(source, fileName || (script && script.title) || '');
  return { issues: [], summary: { errors: 0, warnings: 0 } };
}

/** 校验全部内置剧本（15 章），作为回归基线。 */
export function lintBuiltin() {
  const issues = [];
  for (const s of loadBuiltinScripts()) {
    const r = lintText(s.source || '', s.title || '');
    for (const it of r.issues) issues.push({ ...it, file: s.title });
  }
  return {
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
  };
}
