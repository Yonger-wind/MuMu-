import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../scripts/engine.js';

const SCRIPT = {
  id: 'flags_unit', title: '旗标单元测试',
  cover: { scene: 'classroom', time: 'dusk' },
  characters: [
    { name: '甲', model: 'teen-boy' },
    { name: '乙', model: 'teen-girl' },
  ],
  nodes: [
    { t: 'scene', scene: 'classroom', time: 'dusk', cam: 'mid' },
    { t: 'say', who: '甲', text: '开场。' },
    { t: 'choice', options: [
      { text: '追问', to: 'ASK', set: ['asked'] },
      { text: '沉默', to: 'QUIET' },
    ] },
    { t: 'say', who: '乙', text: '追问后的回响。', cond: { key: 'asked', neg: false } },
    { t: 'say', who: '乙', text: '沉默后的回响。', cond: { key: 'asked', neg: true } },
    { t: 'view', view: 'over', cond: { key: 'asked', neg: false } },
    { t: 'end', ending: 'finish' },
    { t: 'say', who: '甲', text: '安静的分支。' },
    { t: 'end', ending: 'quiet' },
  ],
  labels: { ASK: 3, QUIET: 7 },
};

function makeHarness() {
  const log = { choices: null, cb: null, texts: [], renders: [] };
  const ui = {
    setText: (t) => log.texts.push(t),
    setName: () => {}, setTitle: () => {},
    showHint: () => {}, flash: () => {},
    setChoices: (list, cb) => { log.choices = list; log.cb = cb; },
  };
  const renderer = { set: (s) => log.renders.push(JSON.parse(JSON.stringify(s))) };
  const engine = createEngine({ renderer, ui, onEnd: () => {}, endOptions: () => [] });
  return { engine, log };
}

function toChoice(h) {
  h.engine.start(SCRIPT);
  h.engine.advance();   // 打完开场
  h.engine.advance();   // 到选项
}

test('选中带 set 的选项写入旗标', () => {
  const h = makeHarness();
  toChoice(h);
  h.log.cb(0);
  assert.equal(h.engine.getFlag('asked'), true);
  assert.equal(h.engine.state.flags.asked, true);
});

test('条件为真的台词播放，条件为假的台词跳过', () => {
  const h = makeHarness();
  toChoice(h);
  h.log.cb(0);
  h.engine.advance();                       // 打完“追问后的回响”
  assert.equal(h.log.texts.at(-1), '追问后的回响。');
  h.engine.advance();                       // 跳过错位台词 → view → 结束
  assert.equal(h.engine.ended, true);
  assert.equal(h.engine.state.endingId, 'finish');
  assert.equal(h.log.renders.at(-1).view, 'over');
});

test('未选中的分支按否定条件播放', () => {
  const h = makeHarness();
  toChoice(h);
  h.log.cb(1);                              // 沉默
  h.engine.advance();
  assert.equal(h.log.texts.at(-1), '安静的分支。');
  assert.equal(h.engine.getFlag('asked'), false);
  assert.equal(h.engine.ended, false);
});

test('rewind 回到选项时回滚选择写入的旗标', () => {
  const h = makeHarness();
  toChoice(h);
  h.log.cb(0);
  h.engine.advance();                       // 先读完这一句，停掉打字机
  assert.equal(h.engine.getFlag('asked'), true);
  assert.equal(h.engine.rewind(), true);
  assert.equal(h.engine.getFlag('asked'), false);
  assert.deepEqual(h.log.choices, ['追问', '沉默']);
});

test('start 的 carry 带入旗标', () => {
  const h = makeHarness();
  h.engine.start(SCRIPT, null, { asked: true });
  assert.equal(h.engine.getFlag('asked'), true);
});

test('有快照时以快照的旗标为准，carry 被忽略', () => {
  const snap = {
    idx: 0, cast: [], choices: [],
    sceneState: SCRIPT.cover,
    state: { flags: { asked: false }, vars: {}, endingId: '', checkpoints: [] },
  };
  const h = makeHarness();
  h.engine.start(SCRIPT, snap, { asked: true });
  assert.equal(h.engine.getFlag('asked'), false);
});

test('旧快照缺少 flags 时条件按“未发生”处理', () => {
  const snap = { idx: 0, cast: [], choices: [], sceneState: SCRIPT.cover };
  const h = makeHarness();
  h.engine.start(SCRIPT, snap);
  assert.deepEqual(h.engine.state.flags, {});
});
