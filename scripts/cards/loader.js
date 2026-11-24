/* ============================================================
   暮幕 · 卡牌清单解析与加载（P0-4 扩展点契约）
   新增一张卡 = 新增 <cardKey>.js（具名导出 inspect）+ 在
   assets/cards/manifest.json 里加一条，不改核心代码。
   本模块不被 main.js 导入：没有图鉴容器时不加载、零开销。
   ============================================================ */
import { validateCardKey, cardInspections } from './registry.js';

const fail = (msg) => { throw new Error(`卡牌清单无效：${msg}`); };

/**
 * 清单 / 模块路径的解析基址。
 * 浏览器里用 document.baseURI；无 document 环境（Node / 测试 / worker）
 * 回落到站点根：本文件位于 scripts/cards/，两级回根。
 */
function siteBase() {
  if (globalThis.document && globalThis.document.baseURI) return globalThis.document.baseURI;
  return new URL('../../', import.meta.url).href;
}

/** 校验并归一清单；任何问题抛中文 Error（带第 N 张卡定位）。 */
export function parseCardManifest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('清单必须是一个对象。');
  }
  if (input.version !== 1) {
    fail(`不支持的清单版本「${String(input.version)}」；当前只支持 1。`);
  }
  if (!Array.isArray(input.cards)) fail('cards 必须是数组。');

  const seen = new Set();
  return input.cards.map((card, i) => {
    const at = `第 ${i + 1} 张卡`;
    if (!card || typeof card !== 'object' || Array.isArray(card)) fail(`${at}不是对象。`);
    let key;
    try {
      key = validateCardKey(card.key);
    } catch (e) {
      fail(`${at}的 key 不合法：${e.message}`);
    }
    if (seen.has(key)) fail(`${at}的 key「${key}」与前面的条目重复。`);
    seen.add(key);
    const module = typeof card.module === 'string' ? card.module.trim() : '';
    if (!module || !module.endsWith('.js')) {
      fail(`${at}（${key}）的 module 必须是以 .js 结尾的非空路径。`);
    }
    const entry = { key, module };
    const title = typeof card.title === 'string' ? card.title.trim() : '';
    if (title) entry.title = title;
    const image = typeof card.image === 'string' ? card.image.trim() : '';
    if (image) entry.image = image;
    return entry;
  });
}

/** 逐条加载模块并注册。loadModule 可注入（测试用假模块，不落盘）。 */
export async function applyCardManifest(manifest, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const entries = parseCardManifest(manifest);
  // 键存在即视为注入：{ loadModule: 0 } / { registry: null } 必须报错，不得静默回落。
  const hasOpt = (name) => Object.prototype.hasOwnProperty.call(o, name);
  // 默认实现保持惰性：只有真的没注入时才需要解析基址。
  const loadModule = hasOpt('loadModule')
    ? o.loadModule
    : (path) => import(new URL(path, siteBase()).href);
  const registry = hasOpt('registry') ? o.registry : cardInspections;
  if (typeof loadModule !== 'function') {
    throw new Error('applyCardManifest 需要 loadModule 函数。');
  }
  if (!registry || typeof registry.register !== 'function') {
    throw new Error('applyCardManifest 需要一个带 register 函数的注册表。');
  }
  const loaded = [];
  for (const entry of entries) {
    let mod;
    try {
      mod = await loadModule(entry.module);
    } catch (e) {
      const detail = e && e.message ? e.message : String(e);
      throw new Error(`卡牌「${entry.key}」的模块 ${entry.module} 加载失败：${detail}`);
    }
    const inspect = mod && mod.inspect;
    if (typeof inspect !== 'function') {
      throw new Error(`卡牌「${entry.key}」的模块 ${entry.module} 没有导出 inspect 函数。`);
    }
    registry.register(entry.key, inspect);
    loaded.push(entry.key);
  }
  return loaded;
}

/** 从 URL 读取清单并注册（P0-4 不接到任何页面）。 */
export async function loadCardManifest(url = './assets/cards/manifest.json', opts = {}) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch (e) {
    throw new Error(`读取卡牌清单失败：${url}。`);
  }
  if (!res || !res.ok) {
    throw new Error(`读取卡牌清单失败：${url}（HTTP ${res ? res.status : '未知'}）。`);
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`卡牌清单无法解析为 JSON：${url}。`);
  }
  return applyCardManifest(data, opts);
}
