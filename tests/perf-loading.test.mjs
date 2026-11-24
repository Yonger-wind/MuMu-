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

test('planPortraitBatches：size 非法时退回 1，不死循环', () => {
  assert.deepEqual(planPortraitBatches(['a', 'b', 'c'], 0), [['a'], ['b'], ['c']]);
  assert.deepEqual(planPortraitBatches(['a', 'b'], -5), [['a'], ['b']]);
  assert.deepEqual(planPortraitBatches(['a', 'b'], 2.9), [['a', 'b']]);
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

test('portraits.js：portraitImage 命中缺失时按需 loadPortrait 并返回 null', () => {
  const src = read('scripts/portraits.js');
  const body = src.match(/export function portraitImage\(key\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(body, '未找到 portraitImage 函数');
  assert.match(body[1], /loadPortrait\(k\)|loadPortrait\(key\)/, '未命中时应触发按需加载');
  assert.match(body[1], /return null/);
});

test('portraits.js：加载失败会移除缓存条目，供显式预加载重试', () => {
  const src = read('scripts/portraits.js');
  const body = src.match(/img\.onerror\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\};/);
  assert.ok(body, '未找到 onerror 处理');
  assert.match(body[1], /images\.delete\(key\)/);
});

test('portraits.js：失败键有限自动重试，显式 preloadPortraits 清空失败表', () => {
  const src = read('scripts/portraits.js');
  assert.match(src, /failedKeys\.set\(key,\s*\{/, 'onerror 应记录次数与时间');
  assert.match(src, /MAX_AUTO_RETRY/, '应有自动重试上限');
  assert.match(src, /RETRY_DELAY_MS/, '应有重试间隔');
  assert.match(src, /prev\.count > MAX_AUTO_RETRY/, '超过上限后不再自动重试（上限按失败次数计：首次 + 2 次重试）');
  const preload = src.match(/export function preloadPortraits\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(preload, '未找到 preloadPortraits');
  assert.match(preload[1], /failedKeys\.clear\(\)/);
});

test('main.js：进舞台与打开剧本库都会请求场景大图', () => {
  const src = read('scripts/main.js');
  const hits = src.match(/sceneRenderer\.preloadImages\(\)/g) || [];
  assert.ok(hits.length >= 2, `preloadImages 调用次数应 ≥2，实际 ${hits.length}`);
});

test('scene.js：四张场景大图只在 preloadImages 内赋 src，并经渲染器暴露', () => {
  const src = read('scripts/scene.js');
  const start = src.indexOf('function preloadSceneImages');
  assert.ok(start > 0, '缺少 preloadSceneImages');
  const end = src.indexOf('function resize(', start);
  assert.ok(end > start, 'preloadSceneImages 应在 resize 之前');
  const body = src.slice(start, end);
  for (const name of ['starry.src', 'cityDay.src', 'cityNight.src', 'scoreSheet.src']) {
    assert.ok(body.includes(name), `${name} 应移入 preloadSceneImages`);
  }
  assert.doesNotMatch(src.slice(0, start), /(starry|cityDay|cityNight|scoreSheet)\.src\s*=/);
  assert.match(src, /preloadImages:\s*preloadSceneImages/);
});
