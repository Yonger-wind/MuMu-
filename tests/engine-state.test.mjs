import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../scripts/engine.js';

const SCRIPT = {
  id: 'unit_test', title: '单元测试',
  cover: { scene: 'classroom', time: 'dusk' },
  characters: [{ name: '甲', sex: '男', hair: '短', cloth: '白', model: 'teen-boy' }],
  nodes: [
    { t: 'scene', scene: 'classroom', time: 'dusk', cam: 'mid' },
    { t: 'say', who: '甲', text: '第一句' },
    { t: 'choice', options: [{ text: '往左', to: 'L' }, { text: '往右', to: 'R' }] },
    { t: 'say', who: '甲', text: '左边的话' },
    { t: 'end', ending: 'left' },
    { t: 'say', who: '甲', text: '右边的话' },
    { t: 'end', ending: 'right' },
  ],
  labels: { L: 3, R: 5 },
};

function makeHarness(script) {
  const log = { choices: null, cb: null };
  const ui = {
    setText: () => {}, setName: () => {}, setTitle: () => {},
    showHint: () => {}, flash: () => {},
    setChoices: (list, cb) => { log.choices = list; log.cb = cb; },
  };
  const engine = createEngine({ renderer: { set: () => {} }, ui, onEnd: () => {}, endOptions: () => [] });
  return { engine, log };
}

function playToChoice(h) {
  h.engine.start(SCRIPT);
  h.engine.advance();   // 打完第一句
  h.engine.advance();   // 走到选项
}

test('到达选项时自动留下检查点', () => {
  const h = makeHarness(SCRIPT);
  playToChoice(h);
  assert.deepEqual(h.log.choices, ['往左', '往右']);
  assert.equal(h.engine.state.checkpoints.length, 1);
  assert.equal(h.engine.state.checkpoints[0].idx, 2);
});

test('选择后进入对应分支并记录结局标识', () => {
  const h = makeHarness(SCRIPT);
  playToChoice(h);
  h.log.cb(1);            // 选“往右”
  h.engine.advance();     // 打完“右边的话”
  h.engine.advance();     // 走到结束
  assert.equal(h.engine.state.endingId, 'right');
  assert.equal(h.engine.snapshot().state.endingId, 'right');
});

test('rewind 回到上一个选项并回滚之后的旗标', () => {
  const h = makeHarness(SCRIPT);
  playToChoice(h);
  h.engine.setFlag('kept', true);
  h.log.cb(0);            // 选“往左”
  h.engine.advance();
  h.engine.advance();
  assert.equal(h.engine.state.endingId, 'left');
  assert.equal(h.engine.rewind(), true);
  assert.deepEqual(h.log.choices, ['往左', '往右']);
  assert.equal(h.engine.getFlag('kept'), false);
  assert.equal(h.engine.state.endingId, '');
});

test('没有检查点时 rewind 返回 false', () => {
  const h = makeHarness(SCRIPT);
  h.engine.start(SCRIPT);
  assert.equal(h.engine.rewind(), false);
});

test('start 带快照时一并恢复状态', () => {
  const h = makeHarness(SCRIPT);
  playToChoice(h);
  h.engine.setFlag('kept', true);
  const snap = h.engine.snapshot();
  const h2 = makeHarness(SCRIPT);
  h2.engine.start(SCRIPT, snap);
  assert.equal(h2.engine.getFlag('kept'), true);
});

test('旧快照缺少 state 时使用默认值', () => {
  const h = makeHarness(SCRIPT);
  h.engine.start(SCRIPT, { idx: 0, cast: [], sceneState: { scene: 'classroom', time: 'dusk', cam: 'mid' }, choices: [] });
  assert.deepEqual(h.engine.state.flags, {});
  assert.equal(h.engine.state.endingId, '');
  assert.deepEqual(h.engine.state.checkpoints, []);
});
