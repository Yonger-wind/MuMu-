# P0-4 扩展点契约 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付三份第三方可消费的扩展契约——卡牌特殊检视注册表、UI 命名挂载点与设计令牌、用户素材目录约定——并以纯逻辑测试锁住，页面视觉零变化。

**Architecture:** 全部新增文件、零依赖零构建。`scripts/cards/` 分「纯注册表（registry.js）」与「数据清单加载器（loader.js）」；`scripts/ui/slots.js` 只做 `[data-slot]` 查找与挂载；`styles/tokens.css` 是带兜底的 `--mumu-*` 语义层，`styles/extensions.css` 只含 `.mumu-*` 命名空间规则；`index.html` 只加三个属性、一个空层与两个 `<link>`。

**Tech Stack:** 原生 ES Modules（浏览器 + Node 24）、CSS 自定义属性、Node 内置测试运行器 `node --test`。

**Spec:** `docs/superpowers/specs/2026-11-24-mumu-extension-contracts-design.md`

## Global Constraints

- 不引入第三方依赖、不加根 `package.json`、不加构建步骤；部署口径仍是 Qoder Sites 纯静态托管。
- 不改 `scripts/parser.js`、`engine.js`、`scene.js`、`prop.js`、`portraits.js`、`package.js`、`main.js`、`styles/main.css`。
- `scripts/cards/loader.js` 不得被 `main.js` 或任何运行时模块导入（没有图鉴容器时不加载）。
- 用户可见报错一律中文；开发者契约错误（非法 cardKey、重复注册、缺 `inspect`、未知槽名）也要中文。
- 页面视觉零变化：不改既有类规则，不迁移 main.css 的 `:root`。
- 测试只在仓库根跑 `node --test`（单文件用 `node --test tests/xxx.test.mjs`）；`node --test tests/` 是坏的，不要用。
- 每个任务结束提交，提交信息带阶段编号：`feat(P0-4): …` / `docs(P0-4): …`。

---

### Task 1: 卡牌检视注册表

**Files:**
- Create: `scripts/cards/registry.js`
- Test: `tests/cards.test.mjs`

**Interfaces:**
- Produces:
  - `export const CARD_KEY_RE` — `/^[a-z0-9][a-z0-9._-]{0,63}$/`
  - `export function validateCardKey(key)` → `key`，不合法抛中文 Error
  - `export function createInspectionRegistry()` → `{ register(cardKey, inspect), get(cardKey), has(cardKey), list() }`
  - `export const cardInspections`（默认实例）
  - `export function registerCardInspection(cardKey, inspect)` / `getCardInspection(cardKey)` / `listCardInspections()`

- [ ] **Step 1: 写失败测试**

创建 `tests/cards.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_KEY_RE,
  validateCardKey,
  createInspectionRegistry,
  cardInspections,
  registerCardInspection,
  getCardInspection,
  listCardInspections,
} from '../scripts/cards/registry.js';

/* ---------------- cardKey 校验 ---------------- */

test('cardKey：合法写法通过与 CARD_KEY_RE 一致', () => {
  for (const key of ['example', 'card-1', 'a_b.c', 'x'.repeat(64)]) {
    assert.equal(validateCardKey(key), key);
    assert.ok(CARD_KEY_RE.test(key), key);
  }
});

test('cardKey：非法写法一律中文报错', () => {
  for (const bad of ['', 'A', 'Example', '有卡', 'a b', 'a/b', 'x'.repeat(65), 123, null]) {
    assert.throws(() => validateCardKey(bad), /不合法/, String(bad));
  }
});

/* ---------------- 注册表 ---------------- */

test('注册表：注册后可取回，list 保持注册顺序', () => {
  const reg = createInspectionRegistry();
  const a = () => {};
  const b = () => {};
  assert.equal(reg.has('a'), false);
  assert.equal(reg.get('a'), null);
  reg.register('a', a);
  reg.register('b', b);
  assert.equal(reg.get('a'), a);
  assert.equal(reg.get('b'), b);
  assert.equal(reg.has('b'), true);
  assert.deepEqual(reg.list(), ['a', 'b']);
});

test('注册表：重复注册抛错且不覆盖已有实现', () => {
  const reg = createInspectionRegistry();
  const first = () => 'first';
  const second = () => 'second';
  reg.register('dup', first);
  assert.throws(() => reg.register('dup', second), /重复注册/);
  assert.equal(reg.get('dup'), first);
});

test('注册表：非函数与非法 id 被拒绝', () => {
  const reg = createInspectionRegistry();
  assert.throws(() => reg.register('ok', 'nope'), /必须是一个函数/);
  assert.throws(() => reg.register('BAD', () => {}), /不合法/);
});

test('注册表：工厂实例互相隔离', () => {
  const r1 = createInspectionRegistry();
  const r2 = createInspectionRegistry();
  r1.register('only-1', () => {});
  assert.equal(r1.has('only-1'), true);
  assert.equal(r2.has('only-1'), false);
});

test('注册表：默认实例与便捷函数共用一份', () => {
  const fn = () => {};
  assert.equal(registerCardInspection('default-instance', fn), fn);
  assert.equal(getCardInspection('default-instance'), fn);
  assert.ok(listCardInspections().includes('default-instance'));
  assert.equal(cardInspections.get('default-instance'), fn);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/cards.test.mjs`
Expected: FAIL —— `Cannot find module '../scripts/cards/registry.js'`

- [ ] **Step 3: 实现注册表**

创建 `scripts/cards/registry.js`：

```js
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/cards.test.mjs`
Expected: PASS —— 7 tests, 0 fail

- [ ] **Step 5: 提交**

```bash
git add scripts/cards/registry.js tests/cards.test.mjs
git commit -m "feat(P0-4): 卡牌检视注册表（纯逻辑 + 中文校验）"
```

---

### Task 2: 卡牌清单解析与加载器

**Files:**
- Create: `scripts/cards/loader.js`
- Create: `assets/cards/manifest.json`
- Test: `tests/cards.test.mjs`（追加）

**Interfaces:**
- Consumes: `validateCardKey`、`cardInspections`（Task 1）
- Produces:
  - `export function parseCardManifest(input)` → `entries[]`；`entries[i] = { key, module, title?, image? }`
  - `export async function applyCardManifest(manifest, { loadModule?, registry? } = {})` → `string[]`（已注册 key）
  - `export async function loadCardManifest(url?, opts?)`（P0-4 不接入任何页面）

- [ ] **Step 1: 写失败测试（追加到 `tests/cards.test.mjs` 顶部导入与文件末尾）**

在 `tests/cards.test.mjs` 的 import 区补两行：

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCardManifest, applyCardManifest } from '../scripts/cards/loader.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
```

在文件末尾追加：

```js
/* ---------------- 清单解析 ---------------- */

test('清单：空清单合法', () => {
  assert.deepEqual(parseCardManifest({ version: 1, cards: [] }), []);
});

test('清单：合法条目保留 title / image 并去掉路径首尾空白', () => {
  const entries = parseCardManifest({
    version: 1,
    cards: [{ key: 'k1', module: ' scripts/cards/k1.js ', title: '卡一', image: 'assets/cards/k1.png' }],
  });
  assert.deepEqual(entries, [{
    key: 'k1',
    module: 'scripts/cards/k1.js',
    title: '卡一',
    image: 'assets/cards/k1.png',
  }]);
});

test('清单：版本 / cards / 条目结构错误均中文报错', () => {
  assert.throws(() => parseCardManifest(null), /清单必须是一个对象/);
  assert.throws(() => parseCardManifest([]), /清单必须是一个对象/);
  assert.throws(() => parseCardManifest({ version: 2, cards: [] }), /不支持的清单版本/);
  assert.throws(() => parseCardManifest({ version: 1 }), /cards 必须是数组/);
  assert.throws(() => parseCardManifest({ version: 1, cards: ['x'] }), /第 1 张卡不是对象/);
  assert.throws(
    () => parseCardManifest({ version: 1, cards: [{ key: 'BAD', module: 'a.js' }] }),
    /第 1 张卡的 key 不合法/
  );
  assert.throws(() => parseCardManifest({ version: 1, cards: [{ key: 'ok' }] }), /module 必须/);
  assert.throws(() => parseCardManifest({ version: 1, cards: [{ key: 'ok', module: 'a.ts' }] }), /module 必须/);
});

test('清单：重复 key 报错并指出第几张', () => {
  assert.throws(
    () => parseCardManifest({
      version: 1,
      cards: [{ key: 'k', module: 'a.js' }, { key: 'k', module: 'b.js' }],
    }),
    /第 2 张卡的 key「k」与前面的条目重复/
  );
});

/* ---------------- 加载器 ---------------- */

test('加载器：按清单顺序注册并返回 key 数组', async () => {
  const reg = createInspectionRegistry();
  const a = () => {};
  const b = () => {};
  const mods = { 'a.js': { inspect: a }, 'b.js': { inspect: b } };
  const loaded = await applyCardManifest(
    { version: 1, cards: [{ key: 'a', module: 'a.js' }, { key: 'b', module: 'b.js' }] },
    { loadModule: async (p) => mods[p], registry: reg }
  );
  assert.deepEqual(loaded, ['a', 'b']);
  assert.equal(reg.get('a'), a);
  assert.equal(reg.get('b'), b);
});

test('加载器：模块缺少 inspect 时报错并带上卡牌 id', async () => {
  await assert.rejects(
    applyCardManifest(
      { version: 1, cards: [{ key: 'nope', module: 'nope.js' }] },
      { loadModule: async () => ({}), registry: createInspectionRegistry() }
    ),
    /卡牌「nope」的模块 nope\.js 没有导出 inspect 函数/
  );
});

test('加载器：清单错误在加载任何模块之前就抛出', async () => {
  let called = 0;
  await assert.rejects(
    applyCardManifest(
      { version: 9, cards: [] },
      { loadModule: async () => { called += 1; return {}; }, registry: createInspectionRegistry() }
    ),
    /不支持的清单版本/
  );
  assert.equal(called, 0);
});

test('加载器：失败前已注册的条目保留', async () => {
  const reg = createInspectionRegistry();
  const a = () => {};
  await assert.rejects(
    applyCardManifest(
      { version: 1, cards: [{ key: 'a', module: 'a.js' }, { key: 'b', module: 'b.js' }] },
      { loadModule: async (p) => (p === 'a.js' ? { inspect: a } : {}), registry: reg }
    ),
    /没有导出 inspect/
  );
  assert.equal(reg.get('a'), a);
});

test('仓库内的卡牌清单：可解析且当前为空', () => {
  const raw = JSON.parse(readFileSync(`${ROOT}assets/cards/manifest.json`, 'utf8'));
  assert.equal(raw.version, 1);
  assert.deepEqual(parseCardManifest(raw), []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/cards.test.mjs`
Expected: FAIL —— `Cannot find module '../scripts/cards/loader.js'`

- [ ] **Step 3: 实现加载器与空清单**

创建 `assets/cards/manifest.json`：

```json
{
  "version": 1,
  "cards": []
}
```

创建 `scripts/cards/loader.js`：

```js
/* ============================================================
   暮幕 · 卡牌清单解析与加载（P0-4 扩展点契约）
   新增一张卡 = 新增 <cardKey>.js（具名导出 inspect）+ 在
   assets/cards/manifest.json 里加一条，不改核心代码。
   本模块不被 main.js 导入：没有图鉴容器时不加载、零开销。
   ============================================================ */
import { validateCardKey, cardInspections } from './registry.js';

const fail = (msg) => { throw new Error(`卡牌清单无效：${msg}`); };

/** 清单 / 模块路径按站点根解析（浏览器里相对 document.baseURI）。 */
function siteBase() {
  return (globalThis.document && globalThis.document.baseURI) || import.meta.url;
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
    if (typeof card.title === 'string') entry.title = card.title;
    if (typeof card.image === 'string') entry.image = card.image;
    return entry;
  });
}

/** 逐条加载模块并注册。loadModule 可注入（测试用假模块，不落盘）。 */
export async function applyCardManifest(manifest, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const entries = parseCardManifest(manifest);
  const base = siteBase();
  const loadModule = o.loadModule || ((path) => import(new URL(path, base).href));
  const registry = o.registry || cardInspections;
  if (typeof loadModule !== 'function') {
    throw new Error('applyCardManifest 需要 loadModule 函数。');
  }
  const loaded = [];
  for (const entry of entries) {
    const mod = await loadModule(entry.module);
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/cards.test.mjs`
Expected: PASS —— 16 tests, 0 fail

- [ ] **Step 5: 提交**

```bash
git add scripts/cards/loader.js assets/cards/manifest.json tests/cards.test.mjs
git commit -m "feat(P0-4): 卡牌清单解析与动态加载（数据驱动注册）"
```

---

### Task 3: UI 命名挂载点

**Files:**
- Create: `scripts/ui/slots.js`
- Modify: `index.html`（给 `#home` / `#stage` / `#modal-root` 加 `data-slot`）
- Test: `tests/ui-slots.test.mjs`

**Interfaces:**
- Produces:
  - `export const SLOT_NAMES` — 冻结数组 `['home','stage','modal','overlay']`
  - `export function findSlot(name, root = globalThis.document)` → `Element | null`；未知槽名抛中文 Error
  - `export function mountTo(name, node, { root } = {})` → `{ node, remove() }`；找不到槽位抛中文 Error

- [ ] **Step 1: 写失败测试**

创建 `tests/ui-slots.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_NAMES, findSlot, mountTo } from '../scripts/ui/slots.js';

function fakeHost() {
  return {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      return node;
    },
    removeChild(node) {
      const i = this.children.indexOf(node);
      if (i >= 0) this.children.splice(i, 1);
      node.parentNode = null;
      return node;
    },
  };
}

function fakeRoot(map) {
  return {
    querySelector(selector) {
      const m = /^\[data-slot="(.+)"\]$/.exec(selector);
      return m && map[m[1]] ? map[m[1]] : null;
    },
  };
}

test('槽位：名单冻结且为四个命名槽', () => {
  assert.ok(Object.isFrozen(SLOT_NAMES));
  assert.deepEqual(SLOT_NAMES, ['home', 'stage', 'modal', 'overlay']);
});

test('槽位：未知槽名抛中文错误并列出可用槽', () => {
  assert.throws(() => findSlot('toast'), /未知的挂载点「toast」.*home \/ stage \/ modal \/ overlay/);
});

test('槽位：findSlot 按 data-slot 命中，未命中返回 null', () => {
  const host = fakeHost();
  const root = fakeRoot({ modal: host });
  assert.equal(findSlot('modal', root), host);
  assert.equal(findSlot('stage', root), null);
});

test('挂载：appendChild 后可幂等移除', () => {
  const host = fakeHost();
  const root = fakeRoot({ overlay: host });
  const node = { parentNode: null };
  const handle = mountTo('overlay', node, { root });
  assert.equal(handle.node, node);
  assert.deepEqual(host.children, [node]);
  handle.remove();
  assert.deepEqual(host.children, []);
  handle.remove(); // 第二次不报错
  assert.deepEqual(host.children, []);
});

test('挂载：找不到槽位抛中文错误并提示 data-slot 写法', () => {
  const root = fakeRoot({});
  assert.throws(() => mountTo('stage', {}, { root }), /找不到挂载点「stage」.*data-slot="stage"/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/ui-slots.test.mjs`
Expected: FAIL —— `Cannot find module '../scripts/ui/slots.js'`

- [ ] **Step 3: 实现挂载 API 并给 index.html 加槽位属性**

创建 `scripts/ui/slots.js`：

```js
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
```

修改 `index.html`（只加属性，不动结构与样式）：

- `<main id="home" class="screen home" aria-hidden="false">` → 末尾加 `data-slot="home"`
- `<section id="stage" class="screen stage" aria-hidden="true">` → 末尾加 `data-slot="stage"`
- `<div id="modal-root"></div>` → 改成 `<div id="modal-root" data-slot="modal"></div>`

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/ui-slots.test.mjs`
Expected: PASS —— 5 tests, 0 fail

- [ ] **Step 5: 提交**

```bash
git add scripts/ui/slots.js index.html tests/ui-slots.test.mjs
git commit -m "feat(P0-4): UI 命名挂载点（data-slot + mountTo）"
```

---

### Task 4: 设计令牌、悬浮层与 index.html 接线

**Files:**
- Create: `styles/tokens.css`
- Create: `styles/extensions.css`
- Modify: `index.html`（head 两个 `<link>` + `#ui-layer` 空层）
- Test: `tests/ui-slots.test.mjs`（追加契约测试）

**Interfaces:**
- Produces: `--mumu-color-*`（10 个）、`--mumu-font-*`（2 个）、`--mumu-space-*`（5 个）、`--mumu-radius-*`（4 个）、`--mumu-z-*`（4 个）；`.mumu-ui-layer` 承载 `data-slot="overlay"`。

- [ ] **Step 1: 写失败测试（追加到 `tests/ui-slots.test.mjs`）**

在文件顶部补：

```js
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
```

在文件末尾追加：

```js
/* ---------------- index.html / 令牌 / 悬浮层契约 ---------------- */

test('index.html：四个 data-slot 与两个样式链接齐全，链接在 main.css 之后', () => {
  const html = readFileSync(`${ROOT}index.html`, 'utf8');
  for (const name of ['home', 'stage', 'modal', 'overlay']) {
    assert.ok(html.includes(`data-slot="${name}"`), `缺少 data-slot="${name}"`);
  }
  const main = html.indexOf('styles/main.css');
  const tokens = html.indexOf('styles/tokens.css');
  const ext = html.indexOf('styles/extensions.css');
  assert.ok(main >= 0, '缺少 main.css');
  assert.ok(tokens > main, 'tokens.css 应在 main.css 之后');
  assert.ok(ext > tokens, 'extensions.css 应在 tokens.css 之后');
});

test('令牌：颜色 / 字体令牌都带 var() 与字面量兜底', () => {
  const css = readFileSync(`${ROOT}styles/tokens.css`, 'utf8');
  const lines = css.split('\n').filter((l) => /--mumu-(color|font)-[\w-]+\s*:/.test(l));
  assert.ok(lines.length >= 12, `令牌数量异常：${lines.length}`);
  for (const line of lines) {
    assert.match(line, /var\([^)]*,[^)]*\)/, `缺少兜底：${line.trim()}`);
  }
});

test('令牌：层级档位与 main.css 现有实现一致', () => {
  const tokens = readFileSync(`${ROOT}styles/tokens.css`, 'utf8');
  const main = readFileSync(`${ROOT}styles/main.css`, 'utf8');
  assert.match(tokens, /--mumu-z-modal:\s*60\s*;/);
  assert.match(tokens, /--mumu-z-overlay:\s*70\s*;/);
  assert.match(tokens, /--mumu-z-boot:\s*90\s*;/);
  assert.match(tokens, /--mumu-z-toast:\s*100\s*;/);
  assert.match(main, /\.modal-mask\s*\{[^}]*z-index:\s*60\s*;/);
  assert.match(main, /\.boot-veil\s*\{[^}]*z-index:\s*90\s*;/);
  assert.match(main, /\.toast\s*\{[^}]*z-index:\s*100\s*;/);
});

test('悬浮层：空层不拦截点击，子元素默认恢复可交互', () => {
  const css = readFileSync(`${ROOT}styles/extensions.css`, 'utf8');
  assert.match(css, /\.mumu-ui-layer\s*\{[^}]*pointer-events:\s*none\s*;/);
  assert.match(css, /\.mumu-ui-layer\s*>\s*\*\s*\{[^}]*pointer-events:\s*auto\s*;/);
});

test('扩展样式：只出现在 .mumu-* 命名空间', () => {
  const css = readFileSync(`${ROOT}styles/extensions.css`, 'utf8');
  const selectors = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((chunk) => chunk.split('{')[0].trim())
    .filter(Boolean);
  for (const selector of selectors) {
    for (const one of selector.split(',')) {
      assert.match(one.trim(), /^\.mumu-/, `越界选择器：${one.trim()}`);
    }
  }
});

test('运行时隔离：除 cards/ 自身外没有模块引用 cards/loader', () => {
  const files = readdirSync(`${ROOT}scripts`, { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.js'))
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => !f.startsWith('cards/'));
  const offenders = files.filter((f) => readFileSync(`${ROOT}scripts/${f}`, 'utf8').includes('cards/loader'));
  assert.deepEqual(offenders, []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/ui-slots.test.mjs`
Expected: FAIL —— `ENOENT: ... styles/tokens.css`

- [ ] **Step 3: 实现令牌、扩展样式与接线**

创建 `styles/tokens.css`：

```css
/* ============================================================
   暮幕 · 设计令牌（P0-4 扩展点契约）
   语义层：第三方 UI 只依赖 --mumu-*，不直接依赖 main.css 的变量名。
   每个颜色 / 字体令牌都带字面量兜底：main.css 改名时不会静默失效。
   只新增变量，不覆盖任何既有规则。
   ============================================================ */

:root {
  /* 颜色（映射 main.css 现有色板，带兜底） */
  --mumu-color-ink: var(--ink, #2a1f33);
  --mumu-color-cream: var(--cream, #fff4e6);
  --mumu-color-amber: var(--amber, #ff9d57);
  --mumu-color-rose: var(--rose, #ff7a8a);
  --mumu-color-plum: var(--plum, #6b4a8f);
  --mumu-color-dusk: var(--dusk, #3a2a56);
  --mumu-color-night: var(--night, #1b1430);
  --mumu-color-glass: var(--glass, rgba(255, 244, 230, 0.10));
  --mumu-color-glass-border: var(--glass-brd, rgba(255, 244, 230, 0.28));
  --mumu-color-text-soft: var(--soft, rgba(255, 244, 230, 0.72));

  /* 字体 */
  --mumu-font-serif: var(--serif, "Noto Serif SC", "Songti SC", "STSong", Georgia, serif);
  --mumu-font-sans: var(--sans, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif);

  /* 间距 */
  --mumu-space-xs: 4px;
  --mumu-space-sm: 8px;
  --mumu-space-md: 16px;
  --mumu-space-lg: 24px;
  --mumu-space-xl: 40px;

  /* 圆角 */
  --mumu-radius-sm: 8px;
  --mumu-radius-md: 12px;
  --mumu-radius-lg: 16px;
  --mumu-radius-pill: 999px;

  /* 层级：对齐 main.css 现有档位（modal-mask 60 / boot 90 / toast 100） */
  --mumu-z-modal: 60;
  --mumu-z-overlay: 70;
  --mumu-z-boot: 90;
  --mumu-z-toast: 100;
}
```

创建 `styles/extensions.css`：

```css
/* ============================================================
   暮幕 · 扩展样式（P0-4 扩展点契约）
   只允许 .mumu-* 命名空间的规则；不得覆盖 main.css 既有类。
   ============================================================ */

/* 全屏悬浮层：data-slot="overlay" 的宿主。
   空层零像素、不拦截点击；子元素默认恢复可交互。 */
.mumu-ui-layer {
  position: fixed;
  inset: 0;
  z-index: var(--mumu-z-overlay, 70);
  pointer-events: none;
}

.mumu-ui-layer > * {
  pointer-events: auto;
}
```

修改 `index.html`：

1. 在 `<link rel="stylesheet" href="./styles/main.css" />` 之后追加：

```html
  <link rel="stylesheet" href="./styles/tokens.css" />
  <link rel="stylesheet" href="./styles/extensions.css" />
```

2. 在 `<div id="modal-root" data-slot="modal"></div>` 之前插入空层：

```html
  <div id="ui-layer" class="mumu-ui-layer" data-slot="overlay"></div>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/ui-slots.test.mjs`
Expected: PASS —— 11 tests, 0 fail

再跑全量确认没有碰坏别处：
Run: `node --test`
Expected: PASS —— 281 tests（254 基线 + 16 cards + 11 slots），0 fail

- [ ] **Step 5: 提交**

```bash
git add styles/tokens.css styles/extensions.css index.html tests/ui-slots.test.mjs
git commit -m "feat(P0-4): 设计令牌语义层与悬浮挂载层（零视觉变化）"
```

---

### Task 5: 接口文档、素材约定与收尾验证

**Files:**
- Create: `docs/extension-contracts.md`
- Modify: `docs/mumu-package-spec.md`（§4.3 增补保留 role）
- Modify: `README.md`（目录结构 + 文档入口）

**Interfaces:**
- 文档必须与 Task 1–4 的实际 API 逐字一致（函数名、错误文案要点、清单字段、槽位名单、令牌名单）。

- [ ] **Step 1: 写接口文档**

创建 `docs/extension-contracts.md`，内容必须覆盖：

1. 三条契约的定位与「新增文件 + 注册即可接入」的步骤。
2. `scripts/cards/registry.js` 全部导出与错误语义（id 规则、重复注册抛错、注册表不调用检视函数）。
3. 检视函数契约：`(host, { cardKey, card }) => cleanup?`。
4. 清单结构（`version` / `cards[].key|module|title|image`）与一个可抄的示例模块：

```js
// scripts/cards/example.js —— 一张卡的检视实现（示例，不参与运行时）
export function inspect(host, { cardKey, card }) {
  host.textContent = `检视：${card.title || cardKey}`;
  return () => { host.textContent = ''; };
}
```

   对应清单条目：

```json
{ "key": "example", "title": "示例卡", "image": "assets/cards/example.png", "module": "scripts/cards/example.js" }
```

5. 槽位表（`home` / `stage` / `modal` / `overlay`）与挂载示例：

```js
import { mountTo } from './scripts/ui/slots.js';

const panel = document.createElement('div');
const handle = mountTo('overlay', panel);
// 卸载时：handle.remove();
```

6. 令牌表（颜色 / 字体 / 间距 / 圆角 / 层级）与「只依赖 `--mumu-*`」的规则。
7. 素材目录表（仓库侧）与 `.mumu` 包内保留 role（`cover` / `card` / `night`），并写明：导入时只有封面会转 data URL，`card` / `night` 目前只随清单声明、不落地存储。
8. 回归要求：新增文件后跑 `node --test`，不破坏 15 章播放。

- [ ] **Step 2: 补包规范**

在 `docs/mumu-package-spec.md` 的 §4.3 表格之后追加：

```markdown
**保留 role（P0-4 扩展点契约）**：`cover`（既有）、`card`（卡面，建议路径 `assets/cards/<cardKey>.png`）、
`night`（夜幕模型，建议路径 `assets/night/<name>.png`）。role 仍是自由字符串，校验强度不变；
导入时只有 `cover` 会转成 data URL，`card` / `night` 只随清单声明、暂不落地存储，读取留给 P4 的图鉴与夜幕功能。
```

- [ ] **Step 3: 更新 README**

在 `## 目录结构` 代码块内：

- `styles/main.css` 之后加：

```
styles/tokens.css   设计令牌语义层（--mumu-*，带兜底；第三方 UI 只依赖这里）
styles/extensions.css 扩展样式（只含 .mumu-* 命名空间；悬浮层挂载宿主）
```

- `assets/images/` 段后加：

```
assets/cards/       卡牌清单 manifest.json 与卡面图（<cardKey>.png）
```

- `scripts/` 列表末尾加：

```
  cards/            卡牌特殊检视注册表（registry.js）与清单加载器（loader.js）
  ui/               UI 命名挂载点（slots.js：data-slot = home/stage/modal/overlay）
```

- 在 `## 内容校验` 段之后新增一段：

```markdown
## 扩展接口

第三方卡牌检视、UI 模块与素材的接入契约见 `docs/extension-contracts.md`：
卡牌 = 新增 `scripts/cards/<cardKey>.js` + 在 `assets/cards/manifest.json` 注册；
UI = 新增模块 + `mountTo('<slot>', node)`；视觉只使用 `styles/tokens.css` 的 `--mumu-*` 令牌。
```

- [ ] **Step 4: 收尾验证**

Run: `node --test`
Expected: PASS —— 281 tests, 0 fail

Run: `node tools/lint.js --builtin`
Expected: `通过：内置 15 章 未发现问题。`，exit 0

Run（后台启动后逐个取状态码）：

```bash
node serve.js &
sleep 1
node -e "const u=['/','/styles/tokens.css','/styles/extensions.css','/scripts/cards/registry.js','/scripts/cards/loader.js','/scripts/ui/slots.js','/assets/cards/manifest.json'];Promise.all(u.map(async p=>{const r=await fetch('http://localhost:5173'+p);console.log(r.status,p)})).then(()=>process.exit(0))"
```

Expected: 七行全部 `200`。

视觉零变化由控制端截图比对（首页 / 选择剧本弹窗 / 章节列表 / 舞台）——实现者只需确认 `node serve.js` 正常启动且控制台无 404。

- [ ] **Step 5: 提交**

```bash
git add docs/extension-contracts.md docs/mumu-package-spec.md README.md
git commit -m "docs(P0-4): 扩展点接口文档、素材约定与 README 接线"
```

---

## Self-Review

- **Spec coverage**：注册表（§2.2→T1）、检视契约（§2.3→T1 注释 + T5 文档）、清单/加载器（§2.4→T2）、槽位（§3.1→T3）、挂载 API（§3.2→T3）、令牌（§3.3→T4）、悬浮层（§3.4→T4）、素材约定（§4→T5）、测试策略（§6→T1–T4 测试 + T5 回归）。`#ui-layer` 在 T3 用 `data-slot`、T4 补元素与样式，顺序无冲突。
- **Placeholder scan**：无 TBD / TODO；全部代码为字面内容。
- **Type consistency**：`SLOT_NAMES` 四槽（无 toast）贯穿 spec / T3 / T4 测试；`parseCardManifest` 返回 `{ key, module, title?, image? }`；`applyCardManifest` 返回 `string[]`；测试计数 T1=7、T2 累计 16、T3=5、T4 累计 11、全量 281。
