import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planPortraitBatches } from '../scripts/portraits.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('planPortraitBatches：每批 4 张，末批可不足', () => {
  assert.deepEqual(planPortraitBatches(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']), [
    ['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h'], ['i'],
  ]);
  assert.deepEqual(planPortraitBatches([], 4), []);
  assert.deepEqual(planPortraitBatches(['x'], 4), [['x']]);
});

test('main.js：启动期改为空闲分批预加载立绘', () => {
  const src = read('scripts/main.js');
  assert.match(src, /schedulePortraitPreload\(\)/);
  assert.doesNotMatch(src, /^preloadPortraits\(\);$/m);
});

test('portraits.js：空闲调度使用 requestIdleCallback，且保留全量导出', () => {
  const src = read('scripts/portraits.js');
  assert.match(src, /requestIdleCallback/);
  assert.match(src, /export function schedulePortraitPreload/);
  assert.match(src, /export function preloadPortraits/);
});
