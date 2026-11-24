/* ============================================================
   暮幕 · 卡牌特殊检视注册表（P0-4 扩展点契约）
   纯逻辑、零依赖、不碰 DOM：第三方卡牌检视实现按 cardKey 登记，
   由将来的卡面查看器（P4-5）取回并调用。注册表本身从不调用检视函数。
   ============================================================ */

/** cardKey 规则：小写字母 / 数字开头，允许 . _ -，最长 64 字符。
 *  与文件名 <cardKey>.js / <cardKey>.png 一一对应，所以收紧到小写与安全字符。 */
export const CARD_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** 校验 cardKey；不合法抛中文 Error（开发者可见）。 */
export function validateCardKey(key) {
  if (typeof key !== 'string' || !CARD_KEY_RE.test(key)) {
    throw new Error(
      `卡牌 id「${String(key)}」不合法：只允许小写字母、数字、点、下划线与连字符，`
      + '以字母或数字开头，最长 64 字符。'
    );
  }
  return key;
}

/** 创建一个独立的注册表实例（测试用；运行时用下方的默认实例）。 */
export function createInspectionRegistry() {
  const inspectors = new Map();
  return {
    register(cardKey, inspect) {
      validateCardKey(cardKey);
      if (typeof inspect !== 'function') {
        throw new Error(`卡牌「${cardKey}」的检视实现必须是一个函数。`);
      }
      if (inspectors.has(cardKey)) {
        throw new Error(`卡牌「${cardKey}」的检视实现重复注册：同一张卡只能注册一次。`);
      }
      inspectors.set(cardKey, inspect);
      return inspect;
    },
    get(cardKey) {
      return inspectors.get(cardKey) || null;
    },
    has(cardKey) {
      return inspectors.has(cardKey);
    },
    list() {
      return [...inspectors.keys()];
    },
  };
}

/** 运行时的默认注册表：全站共用一份。 */
export const cardInspections = createInspectionRegistry();

export function registerCardInspection(cardKey, inspect) {
  return cardInspections.register(cardKey, inspect);
}

export function getCardInspection(cardKey) {
  return cardInspections.get(cardKey);
}

export function listCardInspections() {
  return cardInspections.list();
}
