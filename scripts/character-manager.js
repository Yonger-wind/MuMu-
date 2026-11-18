/* ============================================================
   暮幕 · 角色管理
   - 为每个角色分配稳定 cid（在剧本 characters 数组中的位置）
   - 剪影体型只由 scriptId + cid 与剧本明确写出的线索决定
   - 不使用姓名，不推断性别 / 年龄 / 身份
   ============================================================ */
import { bodySpec } from './silhouette.js';

export function createCharacterManager() {
  /** 只采纳作者明确写下的线索：发型长短、性别（仅用于排除裙装） */
  function hintsOf(ch) {
    const hairRaw = ch.hairHint || ch.hair || '';
    const hairHint = /long|长/i.test(hairRaw) ? 'long' : /short|短/i.test(hairRaw) ? 'short' : null;
    return {
      hairHint,
      genderHint: ch.gender === 'm' ? 'm' : '',
    };
  }

  /**
   * 重新装饰一部剧本：补 cid、生成稳定剪影体型
   * 直接写入 character 对象，剧情中的 cast 引用会同步更新
   */
  function decorateScript(script) {
    if (!script || !Array.isArray(script.characters)) return script;
    const sid = script.id || 'local';
    script.characters.forEach((ch, i) => {
      if (!ch.cid) ch.cid = 'c' + (i + 1);
      ch.spec = bodySpec(`${sid}:${ch.cid}`, hintsOf(ch));
    });
    return script;
  }

  function decorateAll(list) {
    list.forEach(decorateScript);
    return list;
  }

  return { decorateScript, decorateAll };
}
