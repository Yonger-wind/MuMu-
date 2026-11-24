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
