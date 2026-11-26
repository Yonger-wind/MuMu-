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

function makeHarness(script, extra = {}) {
  const log = { choices: null, cb: null };
  const ui = {
    setText: () => {}, setName: () => {}, setTitle: () => {},
    showHint: () => {}, flash: () => {},
    setChoices: (list, cb) => { log.choices = list; log.cb = cb; },
  };
  const engine = createEngine({
    renderer: { set: () => {} }, ui, onEnd: () => {}, endOptions: () => [],
    onProgress: extra.onProgress,
  });
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

test('连续 rewind 可以逐级退回更早的选项', () => {
  const twoChoice = {
    ...SCRIPT,
    nodes: [
      { t: 'scene', scene: 'classroom', time: 'dusk', cam: 'mid' },
      { t: 'say', who: '甲', text: '第一句' },
      { t: 'choice', options: [{ text: '甲选', to: 'A' }] },
      { t: 'say', who: '甲', text: '甲分支' },
      { t: 'choice', options: [{ text: '乙选', to: 'B' }] },
      { t: 'say', who: '甲', text: '乙分支' },
      { t: 'end', ending: 'b' },
      { t: 'say', who: '甲', text: '甲分支的另一种走向' },
      { t: 'end', ending: 'a' },
    ],
    labels: { A: 3, B: 5 },
  };
  const h = makeHarness(twoChoice);
  h.engine.start(twoChoice);
  h.engine.advance();
  h.engine.advance();          // 第一个选项
  h.log.cb(0);                 // 选“甲选”
  h.engine.advance();          // 打完“甲分支”
  h.engine.advance();          // 第二个选项
  assert.deepEqual(h.log.choices, ['乙选']);
  assert.equal(h.engine.state.checkpoints.length, 2);

  assert.equal(h.engine.rewind(), true);
  assert.deepEqual(h.log.choices, ['甲选']);        // 退回上一个选项
  assert.equal(h.engine.state.checkpoints.length, 0);

  assert.equal(h.engine.rewind(), false);          // 已是最早的选项
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

test('onProgress 在台词读完时给出可恢复快照', () => {
  const snaps = [];
  const h = makeHarness(SCRIPT, { onProgress: (s) => snaps.push(s) });
  h.engine.start(SCRIPT);
  h.engine.setFlag('kept', true);
  h.engine.advance();                       // 补完第一句打字
  const snap = snaps[snaps.length - 1];
  assert.equal(snap.idx, 1);
  assert.equal(SCRIPT.nodes[snap.idx].text, '第一句');
  assert.equal(snap.state.flags.kept, true);
});

test('选项出现时 onProgress 的落点就是选项本身', () => {
  const snaps = [];
  const h = makeHarness(SCRIPT, { onProgress: (s) => snaps.push(s) });
  h.engine.start(SCRIPT);
  h.engine.advance();
  h.engine.advance();                       // 走到选项
  const snap = snaps[snaps.length - 1];
  assert.equal(SCRIPT.nodes[snap.idx].t, 'choice');
  assert.equal(snap.state.checkpoints.length, 1);
});

test('从选项处的快照恢复不会重复登记检查点', () => {
  const snaps = [];
  const h = makeHarness(SCRIPT, { onProgress: (s) => snaps.push(s) });
  h.engine.start(SCRIPT);
  h.engine.advance();
  h.engine.advance();
  const snap = snaps[snaps.length - 1];
  const h2 = makeHarness(SCRIPT);
  h2.engine.start(SCRIPT, snap);
  assert.deepEqual(h2.log.choices, ['往左', '往右']);
  assert.equal(h2.engine.state.checkpoints.length, 1);
});

test('走到结尾时 onProgress 也会通知（供上层清除自动存档）', () => {
  const snaps = [];
  const h = makeHarness(SCRIPT, { onProgress: (s) => snaps.push(s) });
  h.engine.start(SCRIPT);
  h.engine.advance();
  h.engine.advance();
  h.log.cb(0);                              // 往左
  h.engine.advance();                       // 打完“左边的话”
  h.engine.advance();                       // 走到结束
  assert.equal(h.engine.ended, true);
  const snap = snaps[snaps.length - 1];
  assert.equal(SCRIPT.nodes[snap.idx].t, 'end');
});

/* ---------------- 终幕摘要（P2-4） ---------------- */

function makeSummaryHarness() {
  const seen = [];
  const ui = {
    setText: () => {}, setName: () => {}, setTitle: () => {},
    showHint: () => {}, flash: () => {}, setChoices: (list, cb) => { ui.cb = cb; ui.list = list; },
    cb: null, list: null,
  };
  const engine = createEngine({
    renderer: { set: () => {} }, ui, onEnd: () => {},
    endOptions: (sc, summary) => { seen.push({ sc, summary }); return []; },
  });
  return { engine, ui, seen };
}

test('走到结尾时把这一幕、选择、最后一句交给 endOptions', () => {
  const h = makeSummaryHarness();
  h.engine.start(SCRIPT);
  h.engine.advance();          // 打完第一句
  h.engine.advance();          // 选项
  h.ui.cb(1);                  // 往右
  h.engine.advance();          // 打完“右边的话”
  h.engine.advance();          // 结束
  const { summary } = h.seen[h.seen.length - 1];
  assert.equal(summary.scene, 'classroom');
  assert.equal(summary.time, 'dusk');
  assert.deepEqual(summary.choices, ['往右']);
  assert.deepEqual(summary.line, { who: '甲', text: '右边的话' });
  assert.equal(summary.ending, 'right');
});

test('画外音的最后一句带上括号说明，choices 只读副本不暴露内部数组', () => {
  const voiceScript = {
    id: 'voice_test', title: '画外', cover: { scene: 'classroom', time: 'night' },
    characters: [], labels: {},
    nodes: [
      { t: 'say', who: '白石葵', text: '夏天结束了。', voice: '录音' },
      { t: 'end', ending: 'quiet' },
    ],
  };
  const h = makeSummaryHarness();
  h.engine.start(voiceScript);
  h.engine.advance();
  h.engine.advance();
  const { summary } = h.seen[h.seen.length - 1];
  assert.deepEqual(summary.line, { who: '白石葵（录音）', text: '夏天结束了。' });
  assert.deepEqual(h.engine.lastLine, summary.line);
  const list = h.engine.choices;
  list.push('外部改动');
  assert.deepEqual(h.engine.choices, []);
});

test('重新开始一程时清空上一程的选择与最后一句', () => {
  const h = makeSummaryHarness();
  h.engine.start(SCRIPT);
  h.engine.advance();
  h.engine.advance();
  h.ui.cb(0);
  assert.deepEqual(h.engine.choices, ['往左']);
  h.engine.start(SCRIPT);
  assert.deepEqual(h.engine.choices, []);
  // 重开后自动演出第一句，lastLine 应该回到这一程的开头而不是残留上一程
  assert.deepEqual(h.engine.lastLine, { who: '甲', text: '第一句' });
});

test('从结束页回退时清除结算卡', () => {
  let clears = 0;
  const ui = {
    setText: () => {}, setName: () => {}, setTitle: () => {},
    showHint: () => {}, flash: () => {},
    setChoices: (list, cb) => { ui.cb = cb; },
    clearFinale: () => { clears += 1; },
  };
  const engine = createEngine({
    renderer: { set: () => {} }, ui, onEnd: () => {}, endOptions: () => [],
  });
  engine.start(SCRIPT);
  engine.advance();
  engine.advance();
  ui.cb(0);
  engine.advance();
  engine.advance();
  assert.equal(engine.ended, true);
  const before = clears;
  assert.equal(engine.rewind(), true);
  assert.ok(clears > before);
});

/* ---------------- 回退一句（back） ---------------- */

function makeBackHarness(script = SCRIPT) {
  const ui = {
    text: '', name: '', backEnabled: null, choices: null, cb: null, finaleCleared: 0,
    setText: (t) => { ui.text = t; }, setName: (n) => { ui.name = n; }, setTitle: () => {},
    showHint: () => {}, flash: () => {},
    setChoices: (list, cb) => { ui.choices = list; ui.cb = cb; },
    setBackEnabled: (v) => { ui.backEnabled = v; },
    clearFinale: () => { ui.finaleCleared += 1; },
  };
  const engine = createEngine({
    renderer: { set: () => {} }, ui, onEnd: () => {}, endOptions: () => [],
  });
  return { engine, ui };
}

test('停在第一句时不能回退', () => {
  const h = makeBackHarness();
  h.engine.start(SCRIPT);
  h.engine.advance();                 // 补完第一句打字
  assert.equal(h.engine.canBack(), false);
  assert.equal(h.ui.backEnabled, false);
  assert.equal(h.engine.back(), false);
});

test('回退一句：一次退一屏，可以一直退到开头', () => {
  const script = {
    ...SCRIPT,
    nodes: [
      { t: 'say', who: '甲', text: '第一句' },
      { t: 'say', who: '甲', text: '第二句' },
      { t: 'say', who: '甲', text: '第三句' },
      { t: 'end', ending: 'done' },
    ],
    labels: {},
  };
  const h = makeBackHarness(script);
  h.engine.start(script);
  h.engine.advance();                 // 第一句打完
  h.engine.advance();                 // 第二句
  h.engine.advance();                 // 第二句打完
  h.engine.advance();                 // 第三句
  h.engine.advance();                 // 第三句打完
  assert.equal(h.ui.text, '第三句');
  assert.equal(h.ui.backEnabled, true);

  assert.equal(h.engine.back(), true);   // 退到第二句
  assert.equal(h.ui.text, '第二句');
  assert.equal(h.ui.name, '甲');
  assert.equal(h.ui.backEnabled, true);

  assert.equal(h.engine.back(), true);   // 退到第一句
  assert.equal(h.ui.text, '第一句');
  assert.equal(h.ui.backEnabled, false);

  assert.equal(h.engine.back(), false);  // 已经到头
  assert.equal(h.ui.text, '第一句');
});

test('停在选项上回退到最近一句，并把选项收起', () => {
  const h = makeBackHarness();
  h.engine.start(SCRIPT);
  h.engine.advance();                 // 第一句打完
  h.engine.advance();                 // 选项
  assert.deepEqual(h.ui.choices, ['往左', '往右']);
  assert.equal(h.engine.back(), true);
  assert.equal(h.ui.text, '第一句');
  assert.deepEqual(h.ui.choices, []);
  // 恢复后向前仍是同一个选项，不会跳过
  h.engine.advance();
  assert.deepEqual(h.ui.choices, ['往左', '往右']);
});

test('停在结束页回退到末尾一句，结算卡收起、可以继续读', () => {
  const h = makeBackHarness();
  h.engine.start(SCRIPT);
  h.engine.advance();
  h.engine.advance();
  h.ui.cb(0);                         // 往左
  h.engine.advance();                 // 左边的话打完
  h.engine.advance();                 // 结束页
  assert.equal(h.engine.ended, true);
  const cleared = h.ui.finaleCleared;
  assert.equal(h.engine.back(), true);
  assert.ok(h.ui.finaleCleared > cleared);
  assert.equal(h.engine.ended, false);
  assert.equal(h.ui.text, '左边的话');
  // 继续点击还能走回结束页
  h.engine.advance();
  assert.equal(h.engine.ended, true);
});

test('回退后重新前进会丢弃被退掉的“未来”', () => {
  const script = {
    ...SCRIPT,
    nodes: [
      { t: 'say', who: '甲', text: '第一句' },
      { t: 'say', who: '甲', text: '第二句' },
      { t: 'say', who: '甲', text: '第三句' },
      { t: 'end', ending: 'done' },
    ],
    labels: {},
  };
  const h = makeBackHarness(script);
  h.engine.start(script);
  h.engine.advance();
  h.engine.advance();                 // 第二句
  h.engine.advance();                 // 第二句打完
  h.engine.advance();                 // 第三句
  h.engine.advance();                 // 第三句打完
  h.engine.back();                    // 回到第二句
  h.engine.back();                    // 回到第一句
  h.engine.advance();                 // 重新走：开始演第二句
  h.engine.advance();                 // 第二句打完
  assert.equal(h.ui.text, '第二句');
  // 此时再退，只能退到第一句；第三句已被丢弃，不会再出现
  assert.equal(h.engine.back(), true);
  assert.equal(h.ui.text, '第一句');
  assert.equal(h.engine.back(), false);
});

test('重新开始一程时清空逐句历史', () => {
  const h = makeBackHarness();
  h.engine.start(SCRIPT);
  h.engine.advance();
  h.engine.advance();
  h.engine.advance();
  h.engine.start(SCRIPT);
  h.engine.advance();
  assert.equal(h.engine.canBack(), false);
  assert.equal(h.ui.backEnabled, false);
});

/* ---------- 特写道具文本的恢复（读档 / 回退） ---------- */

const PROP_SCRIPT = {
  id: 'prop_test', title: '道具测试',
  cover: { scene: 'classroom', time: 'dusk' },
  characters: [{ name: '甲', sex: '男', hair: '短', cloth: '白', model: 'teen-boy' }],
  nodes: [
    { t: 'scene', scene: 'classroom', time: 'dusk', cam: 'mid' },
    { t: 'say', who: '甲', text: '手里的旧磁带' },
    { t: 'cam', cam: 'detail' },
    { t: 'say', who: '甲', text: '贴纸已经发黄', voice: '回忆' },
    { t: 'choice', options: [{ text: '追问', to: 'A' }, { text: '沉默', to: 'A' }] },
    { t: 'say', who: '甲', text: 'A 线台词' },
    { t: 'scene', scene: 'playground', time: 'night', cam: 'detail' },
    { t: 'choice', options: [{ text: '继续', to: 'C' }] },
    { t: 'say', who: '甲', text: 'C 线台词' },
    { t: 'end', ending: 'done' },
  ],
  labels: { A: 5, C: 8 },
};

function makePropHarness() {
  const sets = [];
  const ui = {
    text: '', name: '', list: null, cb: null,
    setText(t) { this.text = t; }, setName(n) { this.name = n; }, setTitle() {},
    showHint() {}, flash() {}, clearFinale() {},
    setChoices(list, cb) { this.list = list; this.cb = cb; },
  };
  const engine = createEngine({
    renderer: { set: (s) => sets.push(s) },
    ui, onEnd: () => {}, endOptions: () => [],
  });
  return { engine, sets, ui, last: () => sets[sets.length - 1] };
}

/** 一直点到停在选项 / 台词上（多按几次无害：打字机与等待各自吞掉） */
function tap(h, times) {
  for (let i = 0; i < times; i++) h.engine.advance();
}

test('读档停在选项上：特写道具文本随快照一起回来', () => {
  const a = makePropHarness();
  a.engine.start(PROP_SCRIPT);
  tap(a, 2);                       // 第一句 → 特写里的画外音
  tap(a, 2);                       // → 停在选项
  const snap = a.engine.snapshot();
  assert.deepEqual(a.ui.list, ['追问', '沉默']);

  const b = makePropHarness();
  b.engine.start(PROP_SCRIPT, snap);
  assert.equal(b.last().cam, 'detail');
  // 画外音不改写道具，所以这里仍是上一句实台词
  assert.equal(b.last().propText, '手里的旧磁带');
});

test('读档停在画外音特写上：道具取本场景最近一句实台词', () => {
  const a = makePropHarness();
  a.engine.start(PROP_SCRIPT);
  tap(a, 2);                       // 停在画外音那句
  const snap = a.engine.snapshot();
  const b = makePropHarness();
  b.engine.start(PROP_SCRIPT, snap);
  assert.equal(b.last().propText, '手里的旧磁带');
});

test('换场景后还没有台词：不把上一场景的道具带进新特写', () => {
  const a = makePropHarness();
  a.engine.start(PROP_SCRIPT);
  tap(a, 2);
  tap(a, 2);
  a.ui.cb(0);                      // 选「追问」→ A 线台词
  tap(a, 2);                       // → 新场景（夜晚操场特写）停在第二个选项
  const snap = a.engine.snapshot();
  assert.equal(snap.sceneState.scene, 'playground');
  const b = makePropHarness();
  b.engine.start(PROP_SCRIPT, snap);
  assert.equal(b.last().cam, 'detail');
  assert.equal(b.last().propText, '');
});

test('回退到特写上的选项时保留道具文本', () => {
  const a = makePropHarness();
  a.engine.start(PROP_SCRIPT);
  tap(a, 2);
  tap(a, 2);                       // 停在第一个选项（特写）
  a.ui.cb(0);
  tap(a, 2);
  assert.equal(a.engine.rewind(), true);
  assert.equal(a.last().propText, '手里的旧磁带');
});
