/* ============================================================
   暮幕 · UI 命名挂载点（P0-4 扩展点契约）
   第三方 UI 以「新增文件 + 挂到命名槽」接入，不改核心模块。
   槽位在 index.html 用 data-slot="…" 声明；本模块只做查找与挂载。
   ============================================================ */

/** 可用槽位。新增槽位必须同时改这里与 index.html，并由测试锁住。 */
export const SLOT_NAMES = Object.freeze(['home', 'stage', 'modal', 'overlay']);

function ensureName(name) {
  if (!SLOT_NAMES.includes(name)) {
    throw new Error(
      `未知的挂载点「${String(name)}」；可用：${SLOT_NAMES.join(' / ')}。`
    );
  }
  return name;
}

/** 查找槽位元素；未知槽名抛错，页面上没有该槽返回 null。 */
export function findSlot(name, root = globalThis.document) {
  ensureName(name);
  if (!root || typeof root.querySelector !== 'function') return null;
  return root.querySelector(`[data-slot="${name}"]`);
}

/** 把节点挂到命名槽；找不到槽位抛错。返回 { node, remove() }，remove 幂等。 */
export function mountTo(name, node, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const host = findSlot(name, o.root);
  if (!host) {
    throw new Error(`页面上找不到挂载点「${name}」，请确认 index.html 里带有 data-slot="${name}"。`);
  }
  host.appendChild(node);
  return {
    node,
    remove() {
      if (node.parentNode === host) host.removeChild(node);
    },
  };
}
