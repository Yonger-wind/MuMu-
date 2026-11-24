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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCardManifest, applyCardManifest } from '../scripts/cards/loader.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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

/* ---------------- 加固用例（Task 1 审阅提出） ---------------- */

test('清单/注册表：非函数输入谱系一律拒绝', () => {
  for (const bad of [undefined, null, 0, {}]) {
    const reg = createInspectionRegistry();
    assert.throws(() => reg.register('x', bad), /必须是一个函数/, String(bad));
  }
});

test('注册表：register 返回原函数，失败注册不污染', () => {
  const reg = createInspectionRegistry();
  const a = () => {};
  assert.equal(reg.register('a', a), a);
  assert.throws(() => reg.register('a', () => {}), /重复注册/);
  assert.equal(reg.has('a'), true);
  assert.equal(reg.get('a'), a);
  const before = reg.list();
  assert.throws(() => reg.register('BAD', () => {}), /不合法/);
  assert.equal(reg.has('BAD'), false);
  assert.deepEqual(reg.list(), before);
});

test('注册表：list() 返回副本', () => {
  const reg = createInspectionRegistry();
  reg.register('a', () => {});
  const l = reg.list();
  l.push('x');
  assert.deepEqual(reg.list(), ['a']);
});

test('cardKey：CARD_KEY_RE 反向与首字符边界', () => {
  for (const bad of ['A', '.a', '-a', '_a']) {
    assert.equal(CARD_KEY_RE.test(bad), false, bad);
  }
  assert.equal(CARD_KEY_RE.test('0abc'), true);
});

test('注册表：从不调用检视函数', () => {
  const reg = createInspectionRegistry();
  const boom = () => { throw new Error('不应被调用'); };
  assert.doesNotThrow(() => reg.register('boom', boom));
  assert.doesNotThrow(() => reg.get('boom'));
  assert.doesNotThrow(() => reg.has('boom'));
  assert.doesNotThrow(() => reg.list());
});
