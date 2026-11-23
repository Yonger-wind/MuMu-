import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, cloneState, setFlag, getFlag, setVar, getVar,
  pushCheckpoint, popCheckpoint, deserializeState, upgradeSave,
  SAVE_VERSION, MAX_CHECKPOINTS,
} from '../scripts/state.js';

const cp = (idx) => ({
  idx, label: `L${idx}`, choices: ['追问'],
  cast: ['甲'], sceneState: { scene: 'classroom', time: 'dusk', cam: 'mid' },
  actState: { poses: { 甲: 'sad' }, actions: {}, view: 'normal' },
  flags: {}, vars: {},
});

test('createState 给出空状态', () => {
  const s = createState();
  assert.deepEqual(s.flags, {});
  assert.deepEqual(s.vars, {});
  assert.equal(s.endingId, '');
  assert.deepEqual(s.checkpoints, []);
});

test('getFlag 对未设置的键返回 false', () => {
  const s = createState();
  assert.equal(getFlag(s, 'missing'), false);
  setFlag(s, 'kept', true);
  assert.equal(getFlag(s, 'kept'), true);
  setFlag(s, 'kept', false);
  assert.equal(getFlag(s, 'kept'), false);
});

test('getVar 对缺失的键返回 fallback', () => {
  const s = createState();
  assert.equal(getVar(s, 'score'), 0);
  assert.equal(getVar(s, 'score', 7), 7);
  setVar(s, 'score', 3);
  assert.equal(getVar(s, 'score'), 3);
});

test('pushCheckpoint 超过上限时丢弃最旧的', () => {
  const s = createState();
  for (let i = 0; i < MAX_CHECKPOINTS + 3; i++) pushCheckpoint(s, cp(i));
  assert.equal(s.checkpoints.length, MAX_CHECKPOINTS);
  assert.equal(s.checkpoints[0].idx, 3);
  assert.equal(s.checkpoints[MAX_CHECKPOINTS - 1].idx, MAX_CHECKPOINTS + 2);
});

test('popCheckpoint 取出并移除最后一个检查点', () => {
  const s = createState();
  pushCheckpoint(s, cp(7));
  const got = popCheckpoint(s);
  assert.equal(got.idx, 7);
  assert.equal(s.checkpoints.length, 0);
  assert.equal(popCheckpoint(s), null);
});

test('cloneState 是深拷贝', () => {
  const s = createState();
  setFlag(s, 'a', true);
  pushCheckpoint(s, cp(1));
  const c = cloneState(s);
  setFlag(c, 'a', false);
  c.checkpoints[0].actState.poses.甲 = 'happy';
  assert.equal(getFlag(s, 'a'), true);
  assert.equal(s.checkpoints[0].actState.poses.甲, 'sad');
});

test('deserializeState 缺失字段一律补默认值', () => {
  const s = deserializeState(undefined);
  assert.deepEqual(s.flags, {});
  assert.deepEqual(s.vars, {});
  assert.equal(s.endingId, '');
  assert.deepEqual(s.checkpoints, []);
  const s2 = deserializeState({ flags: { a: true }, vars: { n: 2 } });
  assert.equal(getFlag(s2, 'a'), true);
  assert.equal(getVar(s2, 'n'), 2);
});

test('upgradeSave 给 v1 旧存档补齐 version 与 state', () => {
  const old = { id: 'save_1', scriptId: 'cicada_01', idx: 12, choices: ['追问'], progress: 30 };
  const up = upgradeSave(old);
  assert.equal(up.version, SAVE_VERSION);
  assert.deepEqual(up.state.flags, {});
  assert.deepEqual(up.state.checkpoints, []);
  assert.equal(up.id, 'save_1');
  assert.equal(up.idx, 12);
  assert.deepEqual(up.choices, ['追问']);
});
