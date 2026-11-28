import test from 'node:test';
import assert from 'node:assert/strict';
import { VORTEX } from '../scripts/openings/vortex.js';

function paintRecorder() {
  const arcs = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(_target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key === 'arc') return (...args) => arcs.push(args);
      return () => {};
    },
    set() { return true; },
  });
  const api = {
    scale: 800,
    under: { width: 1280, height: 800 },
    baseCtx: ctx,
    inkCtx: { drawImage() {} },
    cellCache: new Map(),
    rnd: () => 0.5,
  };
  return { api, arcs };
}

test('漩涡新版在完整铺满后显示标题，并沿用演示的分辨率上限', () => {
  assert.equal(VORTEX.introEnd, 8.6);
  assert.equal(VORTEX.titleAt, 8.6);
  assert.equal(VORTEX.scaleCap, 800);
  assert.match(VORTEX.ariaLabel, /金色新月/);
});

test('漩涡新版使用五处生长光点，第六槽保持禁用以兼容固定着色器', () => {
  const hooks = VORTEX.create({});
  assert.equal(hooks.seeds.length, 6);
  assert.equal(hooks.seeds.filter((s) => s.maxR > 0).length, 5);
  assert.equal(hooks.seeds[0].x, 0.60);
  assert.equal(hooks.seeds[1].x, 1.28);
  assert.equal(hooks.seeds[1].y, 0.22);
});

test('漩涡新版底涂用三层同心圆挖出右上金色 C 形弯月', () => {
  const { api, arcs } = paintRecorder();
  VORTEX.create(api).paintUnder(api);
  const moonArcs = arcs.slice(0, 3);
  assert.equal(moonArcs.length, 3);
  assert.deepEqual(moonArcs[0].slice(0, 3), [1024, 176, 44.88]);
  assert.deepEqual(moonArcs[1].slice(0, 3), [1024, 176, 44]);
  assert.deepEqual(moonArcs[2].slice(0, 3), [1037.2, 174.24, 40.48]);
});
