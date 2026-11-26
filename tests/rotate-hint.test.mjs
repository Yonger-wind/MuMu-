import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPrompt, isPhone, isPortrait, PHONE_SHORT_EDGE } from '../scripts/rotate-hint.js';

test('shouldPrompt：手机竖屏才提示', () => {
  assert.equal(shouldPrompt(390, 844), true, 'iPhone 竖屏');
  assert.equal(shouldPrompt(844, 390), false, '同一台手机横屏不提示');
  assert.equal(shouldPrompt(430, 932), true, '更大的手机竖屏也提示');
});

test('shouldPrompt：桌面窄窗口与方屏不打扰', () => {
  assert.equal(shouldPrompt(700, 1200), false, '短边超过手机阈值（平板 / 桌面窄窗）');
  assert.equal(shouldPrompt(600, 600), false, '正方形不算竖屏');
  assert.equal(shouldPrompt(1440, 900), false, '桌面横屏');
});

test('isPhone：阈值取短边，边界含等号', () => {
  assert.equal(isPhone(PHONE_SHORT_EDGE, 1200), true);
  assert.equal(isPhone(PHONE_SHORT_EDGE + 1, 1200), false);
  assert.equal(isPhone(1024, 768), false, '平板横屏短边 768');
});

test('isPortrait：优先用 orientation 媒体特性，没有才比宽高', () => {
  assert.equal(isPortrait({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(isPortrait({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(isPortrait({ innerWidth: 390, innerHeight: 844 }), true);
  assert.equal(isPortrait({ innerWidth: 844, innerHeight: 390 }), false);
  assert.equal(isPortrait({}), false, '完全没有尺寸信息时不乱提示');
});
