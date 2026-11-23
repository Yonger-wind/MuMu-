/* ============================================================
   暮幕 · 角色管理
   - 为每个角色分配稳定 cid
   - 立绘模型只认剧本第五列明确写下的“模型”
   - 没有写模型时，按明写的性别回落到少年 / 少女，绝不根据姓名推断
   ============================================================ */
import { matchModel, MODELS } from './parser.js';

const FALLBACK = { f: 'teen-girl', m: 'teen-boy' };

export function createCharacterManager() {
  function modelOf(ch) {
    const raw = String(ch.model || '').trim();
    if (raw && MODELS[raw]) return raw;
    const matched = matchModel(raw);
    if (matched) return matched;
    return FALLBACK[ch.gender] || 'teen-girl';
  }

  function decorateScript(script) {
    if (!script || !Array.isArray(script.characters)) return script;
    script.characters.forEach((ch, i) => {
      if (!ch.cid) ch.cid = 'c' + (i + 1);
      ch.slot = i;
      ch.model = modelOf(ch);
    });
    return script;
  }

  function decorateAll(list) {
    list.forEach(decorateScript);
    return list;
  }

  return { decorateScript, decorateAll };
}
