# 暮幕 P0-1 状态层与存档 v2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给暮幕引入可持久化的状态层（旗标、数值、结局标识、检查点），存档升级为 `mumu.saves.v2`，并保证 `mumu.saves.v1` 旧存档与旧剧本完全兼容。

**Architecture:** 新增一个纯逻辑模块 `scripts/state.js`（无 DOM 依赖，可在 Node 中直接单测）承载状态模型；`scripts/engine.js` 持有状态并在选项处自动打检查点，提供 `rewind()` 回退；`scripts/storage.js` 改为写 `mumu.saves.v2`，读取时把 v1 旧档迁移并补齐默认字段；`scripts/parser.js` 增量支持 `【结束：结局标识】` 让结局标识字段真正可用。

**Tech Stack:** 原生 ES Modules、Node 24 内置测试运行器 `node --test`（零第三方依赖、无构建步骤）。

**Spec:** `docs/superpowers/specs/2026-11-23-mumu-local-creation-platform-roadmap.md`（P0-1 行）

## Global Constraints

- 不引入任何第三方依赖；不新增构建步骤；不新增 `package.json`；不改动 `serve.js` 与 `tools/*.js`（它们是 CommonJS）。
- 不破坏：剧本解析、人物识别、对话播放、剧情分支、存档、角色外观稳定性、分镜系统。
- 旧存档（`mumu.saves.v1`，缺少 `state` 等新字段）必须仍可读取，新字段一律给默认值。
- 旧剧本（无舞台指示、5 列角色行）必须照常播放。
- 人物只来自立绘素材；不恢复旧剪影/卡通人物系统；不按姓名推断外观。
- 视觉调整必须截图对比验收；本计划不改画面，改动应完全无视觉差异。
- 每个任务结束时提交一次，提交信息带阶段编号：`feat(P0-1): ...`。
- 测试命令统一为仓库根目录执行 `node --test`（自动发现 `tests/*.test.mjs`）；单文件可用 `node --test tests/<file>.test.mjs`。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `scripts/state.js` | 状态模型纯逻辑：旗标、数值、结局标识、检查点、存档升级 | 新建 |
| `scripts/engine.js` | 持有状态、选项处打检查点、`rewind()` 回退、快照含状态 | 修改 |
| `scripts/parser.js` | 增量支持 `【结束：结局标识】` | 修改 |
| `scripts/storage.js` | 写 `mumu.saves.v2`、读 v1 迁移、配额错误上报 | 修改 |
| `scripts/main.js` | 存档失败提示、调试入口暴露状态 | 修改 |
| `tests/state.test.mjs` | 状态模型单测 | 新建 |
| `tests/parser-ending.test.mjs` | 结束标识解析单测 | 新建 |
| `tests/engine-state.test.mjs` | 引擎状态、检查点、回退单测 | 新建 |
| `tests/storage.test.mjs` | 存档 v2 与 v1 迁移单测 | 新建 |
| `AGENTS.md` / `README.md` | 存储键、状态层、存档兼容说明 | 修改 |

模块依赖方向：`engine.js → state.js`，`storage.js → state.js`，`main.js → engine.js / storage.js`。`state.js` 不依赖任何其它模块。

---

### Task 1: 状态模型 `scripts/state.js`

**Files:**
- Create: `scripts/state.js`
- Test: `tests/state.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `SAVE_VERSION`（number，当前为 `2`）
  - `MAX_CHECKPOINTS`（number，当前为 `12`）
  - `createState(): { flags: object, vars: object, endingId: string, checkpoints: array }`
  - `cloneState(state): state`（深拷贝）
  - `cloneCheckpoint(cp): cp`（深拷贝）
  - `setFlag(state, key, value = true): state`
  - `getFlag(state, key): boolean`（未设置返回 `false`）
  - `setVar(state, key, value): state`
  - `getVar(state, key, fallback = 0): any`（未设置返回 `fallback`）
  - `pushCheckpoint(state, cp, max = MAX_CHECKPOINTS): state`（超出上限丢弃最旧）
  - `popCheckpoint(state): cp | null`
  - `deserializeState(raw): state`（缺失字段补默认值）
  - `upgradeSave(raw): save`（补 `version` 与 `state`）

- [ ] **Step 1: 写失败测试 `tests/state.test.mjs`**

```javascript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/state.test.mjs`
Expected: FAIL，错误为 `Cannot find module .../scripts/state.js`

- [ ] **Step 3: 实现 `scripts/state.js`**

```javascript
/* ============================================================
   暮幕 · 状态层
   纯逻辑，无 DOM 依赖：旗标、数值、结局标识、检查点。
   存档写入 mumu.saves.v2；mumu.saves.v1 的旧档由 upgradeSave 兼容。
   ============================================================ */

export const SAVE_VERSION = 2;
export const MAX_CHECKPOINTS = 12;

export function createState() {
  return { flags: {}, vars: {}, endingId: '', checkpoints: [] };
}

export function cloneCheckpoint(cp) {
  return {
    idx: cp.idx | 0,
    label: cp.label || '',
    choices: [...(cp.choices || [])],
    cast: [...(cp.cast || [])],
    sceneState: { ...(cp.sceneState || {}) },
    actState: {
      poses: { ...(cp.actState?.poses || {}) },
      actions: { ...(cp.actState?.actions || {}) },
      view: cp.actState?.view || 'normal',
    },
    flags: { ...(cp.flags || {}) },
    vars: { ...(cp.vars || {}) },
  };
}

export function cloneState(state) {
  return {
    flags: { ...(state?.flags || {}) },
    vars: { ...(state?.vars || {}) },
    endingId: state?.endingId || '',
    checkpoints: (state?.checkpoints || []).map(cloneCheckpoint),
  };
}

export function setFlag(state, key, value = true) {
  if (!key) return state;
  state.flags[key] = value;
  return state;
}

export function getFlag(state, key) {
  return !!(state?.flags && state.flags[key]);
}

export function setVar(state, key, value) {
  if (!key) return state;
  state.vars[key] = value;
  return state;
}

export function getVar(state, key, fallback = 0) {
  const v = state?.vars ? state.vars[key] : undefined;
  return v === undefined ? fallback : v;
}

export function pushCheckpoint(state, cp, max = MAX_CHECKPOINTS) {
  const list = state.checkpoints || (state.checkpoints = []);
  list.push(cloneCheckpoint(cp));
  while (list.length > max) list.shift();
  return state;
}

export function popCheckpoint(state) {
  const list = state.checkpoints || [];
  return list.length ? list.pop() : null;
}

export function deserializeState(raw) {
  const s = createState();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.flags && typeof raw.flags === 'object') s.flags = { ...raw.flags };
  if (raw.vars && typeof raw.vars === 'object') s.vars = { ...raw.vars };
  s.endingId = typeof raw.endingId === 'string' ? raw.endingId : '';
  if (Array.isArray(raw.checkpoints)) s.checkpoints = raw.checkpoints.map(cloneCheckpoint);
  return s;
}

/** v1 旧存档没有 version / state，这里补齐；已有 state 的则规范化。 */
export function upgradeSave(raw) {
  const save = { ...(raw || {}) };
  save.version = SAVE_VERSION;
  save.state = deserializeState(save.state);
  return save;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/state.test.mjs`
Expected: PASS，8 个用例全绿

- [ ] **Step 5: 提交**

```bash
git add scripts/state.js tests/state.test.mjs
git commit -m "feat(P0-1): 新增状态层模块，覆盖旗标、数值、结局标识与检查点"
```

---

### Task 2: 解析器支持结局标识 `【结束：xxx】`

**Files:**
- Modify: `scripts/parser.js`（结束节点正则所在行，约第 295 行）
- Test: `tests/parser-ending.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces: 结束节点新增可选字段 `ending: string`；`【结束】` 与 `【完】` 仍然产出 `ending: ''`，行为不变。

- [ ] **Step 1: 写失败测试 `tests/parser-ending.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptText } from '../scripts/parser.js';

const scriptText = (endLine) => `标题：测试
简介：一个用于测试的小剧本
角色：
甲 | 男 | 短 | 白 | 少年

【场景：教室 | 黄昏 | 中景】
甲：这是第一句。
${endLine}
`;

test('【结束】仍然产出 ending 为空的结束节点', () => {
  const sc = parseScriptText(scriptText('【结束】'), 'test.txt');
  const end = sc.nodes[sc.nodes.length - 1];
  assert.equal(end.t, 'end');
  assert.equal(end.ending, '');
});

test('【结束：happy】产出带结局标识的结束节点', () => {
  const sc = parseScriptText(scriptText('【结束：happy】'), 'test.txt');
  const end = sc.nodes[sc.nodes.length - 1];
  assert.equal(end.t, 'end');
  assert.equal(end.ending, 'happy');
});

test('【完：bad_end】同样可用', () => {
  const sc = parseScriptText(scriptText('【完：bad_end】'), 'test.txt');
  const end = sc.nodes[sc.nodes.length - 1];
  assert.equal(end.ending, 'bad_end');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/parser-ending.test.mjs`
Expected: FAIL，`end.ending` 为 `undefined`（`assert.equal(undefined, '')` 不成立）

- [ ] **Step 3: 修改 `scripts/parser.js`**

把原来的这一行：

```javascript
    if (/^【\s*(结束|完)\s*】$/.test(line)) { flushChoices(); nodes.push({ t: 'end' }); continue; }
```

替换为：

```javascript
    if ((m = line.match(/^【\s*(?:结束|完)\s*(?:[:：]\s*(.+?)\s*)?】$/))) {
      flushChoices();
      nodes.push({ t: 'end', ending: (m[1] || '').trim() });
      continue;
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/parser-ending.test.mjs`
Expected: PASS，3 个用例全绿

- [ ] **Step 5: 回归内置剧本解析**

Run: `node -e "import('./scripts/builtin.js').then(m=>{const s=m.loadBuiltinScripts();console.log(s.length,'章；结束节点：',s.flatMap(x=>x.nodes.filter(n=>n.t==='end')).length)})"`

Expected: 输出 `15 章；结束节点： 16`，与改动前一致（脚本用 `node -e` 跑一次即可，不写进仓库）

- [ ] **Step 6: 提交**

```bash
git add scripts/parser.js tests/parser-ending.test.mjs
git commit -m "feat(P0-1): 结束节点支持可选结局标识，旧写法行为不变"
```

---

### Task 3: 引擎接入状态层、检查点与回退

**Files:**
- Modify: `scripts/engine.js`
- Test: `tests/engine-state.test.mjs`

**Interfaces:**
- Consumes: `scripts/state.js` 的 `createState / cloneState / deserializeState / pushCheckpoint / popCheckpoint`
- Produces（引擎对外 API 新增）：
  - `engine.state`（getter，返回当前状态对象，调试与快照用）
  - `engine.setFlag(key, value = true)`
  - `engine.getFlag(key): boolean`
  - `engine.setVar(key, value)`
  - `engine.getVar(key, fallback = 0)`
  - `engine.rewind(): boolean`（有检查点时回退并返回 true，否则 false）
  - `engine.snapshot()` 的返回值新增 `state` 字段（结构同 `createState()`）

- [ ] **Step 1: 写失败测试 `tests/engine-state.test.mjs`**

```javascript
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/engine-state.test.mjs`
Expected: FAIL，报错为 `engine.state is not a function` / `engine.rewind is not a function` / `engine.setFlag is not a function`

- [ ] **Step 3: 修改 `scripts/engine.js`**

3.1 文件顶部加导入：

```javascript
import { createState, cloneState, deserializeState, pushCheckpoint, popCheckpoint } from './state.js';
```

3.2 在 `let ended = false;` 之后加状态变量：

```javascript
  let state = createState();        // 旗标 / 数值 / 结局标识 / 检查点
```

3.3 在 `function start(sc, snapshot = null)` 中，把 `actState = { poses: {}, actions: {}, view: 'normal' };` 之后补一行：

```javascript
    state = snapshot && snapshot.state ? deserializeState(snapshot.state) : createState();
```

3.4 在 `if (n.t === 'choice') {` 分支内，`ui.setName('');` 之前插入检查点：

说明：走到 `choice` 分支时 `idx` 仍指向选项节点本身（`say` 分支已先自增过），
所以检查点里的 `idx` 就是选项节点下标，`rewind()` 回到它即可重新出选项。

```javascript
      if (n.t === 'choice') {
        // 选项出现前先留一个检查点：玩家可以退回这里重选
        pushCheckpoint(state, {
          idx, label: n.label || '',
          choices: [...choices],
          cast: [...cast],
          sceneState: { ...sceneState },
          actState: { poses: { ...actState.poses }, actions: { ...actState.actions }, view: actState.view },
          flags: { ...state.flags },
          vars: { ...state.vars },
        });
        ui.setName('');
```

3.5 在 `if (n.t === 'end') {` 分支内，`ended = true;` 之后插入：

```javascript
        if (n.ending) state.endingId = n.ending;
```

3.6 在 `function snapshot()` 的返回对象里，`progress:` 之后新增一行：

```javascript
      state: cloneState(state),
```

3.7 在 `return { start, advance, snapshot, ... }` 之前新增对外方法。

引擎内部的 `state` 变量名与 `scripts/state.js` 导出的 `setFlag / getFlag / setVar / getVar` 同名会造成遮蔽，
所以这里**不 import 这四个函数**，改为直接操作 `state`：

```javascript
  function setFlag(key, value = true) {
    if (key) state.flags[key] = value;
    return state;
  }
  function getFlag(key) { return !!(state.flags && state.flags[key]); }
  function setVar(key, value) {
    if (key) state.vars[key] = value;
    return state;
  }
  function getVar(key, fallback = 0) {
    const v = state.vars ? state.vars[key] : undefined;
    return v === undefined ? fallback : v;
  }

  /** 退回上一个选项：位置、站位、旗标、数值一起回滚。 */
  function rewind() {
    const cp = popCheckpoint(state);
    if (!cp) return false;
    idx = cp.idx;
    cast = [...cp.cast];
    sceneState = { ...cp.sceneState };
    actState = {
      poses: { ...(cp.actState.poses || {}) },
      actions: { ...(cp.actState.actions || {}) },
      view: cp.actState.view || 'normal',
    };
    state.flags = { ...cp.flags };
    state.vars = { ...cp.vars };
    state.endingId = '';
    lastSpeaker = '';
    lastProp = '';
    ended = false;
    syncRenderer();
    run();
    return true;
  }
```

3.8 把最后的 return 改成：

```javascript
  return {
    start, advance, snapshot, rewind, setFlag, getFlag, setVar, getVar,
    get script() { return script; },
    get ended() { return ended; },
    get state() { return state; },
  };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/engine-state.test.mjs`
Expected: PASS，6 个用例全绿

- [ ] **Step 5: 全量测试确认没有破坏其它模块**

Run: `node --test`
Expected: 全部用例通过（state 8 + parser 3 + engine 6 = 17）

- [ ] **Step 6: 提交**

```bash
git add scripts/engine.js tests/engine-state.test.mjs
git commit -m "feat(P0-1): 引擎接入状态层，选项自动打检查点并支持回退"
```

---

### Task 4: 存档 v2 与 v1 兼容迁移

**Files:**
- Modify: `scripts/storage.js`
- Test: `tests/storage.test.mjs`

**Interfaces:**
- Consumes: `scripts/state.js` 的 `upgradeSave`、`SAVE_VERSION`
- Produces（对外 API 变化）：
  - `loadSaves(): save[]`——优先读 `mumu.saves.v2`；没有 v2 时读 `mumu.saves.v1` 并迁移补齐，写回 v2（v1 键保留不动）
  - `upsertSave(save): { ok: boolean, error: string | null, list: save[] }`——返回结构由原来的 `save[]` 改为结果对象
  - `removeSave(id): save[]`——操作 v2 列表
  - `saveAll(saves)`——写入 `mumu.saves.v2`（原来是 `mumu.saves.v1`）

- [ ] **Step 1: 写失败测试 `tests/storage.test.mjs`**

说明：Node 里没有浏览器 `localStorage`，`scripts/storage.js` 的 `read/write` 是在函数体内引用全局 `localStorage`，
所以测试用 `globalThis.localStorage = stub` 覆盖即可（已实测 Node 24 可行）。

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    __map: map,
  };
}

test('v1 旧存档读取时迁移到 v2 并补齐状态', async () => {
  const store = makeStorage({
    'mumu.saves.v1': JSON.stringify([{ id: 'save_old', scriptId: 'cicada_01', idx: 5, progress: 20 }]),
  });
  globalThis.localStorage = store;
  const { loadSaves } = await import('../scripts/storage.js');
  const saves = loadSaves();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, 'save_old');
  assert.equal(saves[0].version, 2);
  assert.deepEqual(saves[0].state.flags, {});
  assert.equal(saves[0].state.endingId, '');
  const v2 = JSON.parse(store.getItem('mumu.saves.v2'));
  assert.equal(v2.length, 1);
  assert.equal(v2[0].id, 'save_old');
});

test('upsertSave 写入 v2 键并返回成功', async () => {
  globalThis.localStorage = makeStorage();
  const { upsertSave } = await import('../scripts/storage.js');
  const res = upsertSave({ id: 'save_1', scriptId: 'cicada_01', idx: 3, state: { flags: { a: true } } });
  assert.equal(res.ok, true);
  assert.equal(res.error, null);
  const v2 = JSON.parse(globalThis.localStorage.getItem('mumu.saves.v2'));
  assert.equal(v2.length, 1);
  assert.equal(v2[0].state.flags.a, true);
});

test('存储写入失败时返回明确错误而不是静默丢失', async () => {
  const store = makeStorage();
  store.setItem = () => { throw new Error('QuotaExceededError'); };
  globalThis.localStorage = store;
  const { upsertSave } = await import('../scripts/storage.js');
  const res = upsertSave({ id: 'save_2', scriptId: 'cicada_01', idx: 1 });
  assert.equal(res.ok, false);
  assert.ok(res.error && res.error.length > 0);
});

test('removeSave 从 v2 中删除存档', async () => {
  globalThis.localStorage = makeStorage({
    'mumu.saves.v2': JSON.stringify([{ id: 'save_a', scriptId: 'cicada_01', idx: 1 }, { id: 'save_b', scriptId: 'cicada_02', idx: 2 }]),
  });
  const { removeSave, loadSaves } = await import('../scripts/storage.js');
  removeSave('save_a');
  const saves = loadSaves();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, 'save_b');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/storage.test.mjs`
Expected: FAIL——`loadSaves()` 读的是 `mumu.saves.v1`，v2 键为空；`upsertSave` 返回数组而不是 `{ ok, error, list }`

- [ ] **Step 3: 修改 `scripts/storage.js`**

把顶部键名与导入改成：

```javascript
import { upgradeSave } from './state.js';

const K_SCRIPTS = 'mumu.scripts.v1';
const K_SAVES_V1 = 'mumu.saves.v1';   // 旧键，只读迁移用
const K_SAVES_V2 = 'mumu.saves.v2';   // 新键
```

把存档相关函数整体替换为：

```javascript
export function loadSaves() {
  const v2 = read(K_SAVES_V2, null);
  if (Array.isArray(v2)) return v2.map(upgradeSave);
  // 旧版本存档：读取即迁移，补齐 version / state
  const v1 = read(K_SAVES_V1, []);
  if (!Array.isArray(v1) || !v1.length) return [];
  const migrated = v1.map(upgradeSave);
  saveAll(migrated);
  return migrated;
}

export function saveAll(saves) { return write(K_SAVES_V2, saves); }

export function upsertSave(save) {
  const list = loadSaves().filter((s) => s.id !== save.id);
  list.unshift(upgradeSave(save));
  const trimmed = list.slice(0, 40);       // 上限 40 条
  const ok = saveAll(trimmed);
  return {
    ok,
    error: ok ? null : '浏览器存储空间不足，进度没有保存成功。',
    list: trimmed,
  };
}

export function removeSave(id) {
  const list = loadSaves().filter((s) => s.id !== id);
  saveAll(list);
  return list;
}
```

`getLatestSaveFor` 保持不变（它调用 `loadSaves()`，自动获得迁移后的存档）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/storage.test.mjs`
Expected: PASS，4 个用例全绿

- [ ] **Step 5: 全量测试**

Run: `node --test`
Expected: 21 个用例全绿

- [ ] **Step 6: 提交**

```bash
git add scripts/storage.js tests/storage.test.mjs
git commit -m "feat(P0-1): 存档升级为 mumu.saves.v2，旧 v1 存档自动迁移且写入失败有提示"
```

---

### Task 5: 主控接线与文档同步

**Files:**
- Modify: `scripts/main.js`
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `upsertSave()` 返回 `{ ok, error }`（Task 4）、`engine.state`（Task 3）
- Produces: 无新对外 API；仅行为与文档变化。

- [ ] **Step 1: 修改 `scripts/main.js` 的存档按钮处理**

把：

```javascript
$('stage-save').addEventListener('click', () => {
  const snap = engine.snapshot();
  if (!snap) return;
  upsertSave({ ...snap, id: makeId('save'), time: Date.now() });
  toast('进度已保存');
});
```

改为：

```javascript
$('stage-save').addEventListener('click', () => {
  const snap = engine.snapshot();
  if (!snap) return;
  const res = upsertSave({ ...snap, id: makeId('save'), time: Date.now() });
  if (res.ok) toast('进度已保存');
  else toast(res.error || '进度保存失败');
});
```

- [ ] **Step 2: 暴露状态便于调试**

把：

```javascript
window.__mumu = { engine, audio, sunset, castManager, sceneRenderer };
```

改为：

```javascript
window.__mumu = { engine, audio, sunset, castManager, sceneRenderer, get state() { return engine.state; } };
```

- [ ] **Step 3: 更新 `AGENTS.md`**

- 在“修改速查表”表格中，把“存储键与读写 | `scripts/storage.js`（`mumu.scripts.v1`、`mumu.saves.v1`）”一行改为：

```markdown
| 存储键与读写 | `scripts/storage.js`（`mumu.scripts.v1`、`mumu.saves.v2`；旧 `mumu.saves.v1` 只读迁移） |
| 状态层（旗标/数值/结局标识/检查点） | `scripts/state.js`（纯逻辑单测在 `tests/state.test.mjs`） |
```

- 在“3. 硬性约束”中，把存档兼容那一条改为：

```markdown
- 存档兼容：`mumu.saves.v2` 为当前写入键；`mumu.saves.v1` 的旧存档（缺少 `state`、`actState` 等新字段）必须仍可读取，新字段一律给默认值。
```

- 在“2. 如何运行与验证”中追加一行：

```markdown
- 单元测试：仓库根目录执行 `node --test`（Node 内置测试运行器，零依赖）；用例在 `tests/*.test.mjs`。
```

- [ ] **Step 4: 更新 `README.md`**

在“存档”相关说明处补充一句：

```markdown
存档写入 `mumu.saves.v2`，旧版本 `mumu.saves.v1` 的存档会在读取时自动迁移补齐；存档同时携带故事状态（旗标、数值、结局标识、检查点），因此读档可以回到原位继续。
```

- [ ] **Step 5: 浏览器回归**

Run: `node serve.js`（另开终端保持运行）

逐项确认：

1. 首页 → “开始体验” → 曲目卡四张 → 章节列表 → 开演，《蝉鸣》第一章第一句正常打字。
2. 点击“保存进度”，提示“进度已保存”。
3. 刷新页面 → 首页 → “选择存档” → 读档，位置与台词正确。
4. 旧档兼容：浏览器控制台执行
   ```javascript
   localStorage.setItem('mumu.saves.v1', JSON.stringify([{ id: 'legacy', scriptId: 'cicada_01', idx: 20, choices: ['追问'], progress: 25, preview: '旧存档' }]));
   localStorage.removeItem('mumu.saves.v2');
   ```
   刷新后“选择存档”应能看到该条目并能读取。
5. 走到第一个选项，确认选项可点、选择后正常推进。
6. 控制台无报错、无 404。

- [ ] **Step 6: 提交**

```bash
git add scripts/main.js AGENTS.md README.md
git commit -m "feat(P0-1): 主控接入存档结果提示，补充状态层与存档键文档"
```

---

## 完成定义（P0-1）

- [x] `node --test` 全绿（23 个用例）。
- [x] 四部曲 15 章全部照常播放，选项与分支行为不变，画面零差异。
- [x] `mumu.saves.v2` 为写入键，`mumu.saves.v1` 旧档可读并自动迁移。
- [x] 存档携带状态（旗标、数值、结局标识、检查点）；读档位置正确。
- [x] `【结束：xxx】` 可用，`【结束】` 行为不变。
- [x] `AGENTS.md`、`README.md` 已同步；提交信息带 `P0-1` 编号。

## 实施记录（v1.1 追加，浏览器回归后修正）

1. **回退语义修正**：初版实现里 `rewind()` 弹出当前检查点并回到它，而 `run()` 走到选项时会再登记一次
   检查点，导致反复回退永远停在同一个选项（浏览器实测发现）。
   终版语义：站在选项上时退到**再前一个**选项；已经走过选项时退回**最后一个**选项重新选；
   目标检查点回退后不再重复登记（`skipCheckpoint` 标志），从而可以逐级往前退。
   单元测试新增用例「连续 rewind 可以逐级退回更早的选项」。
2. **旧存档时间字段**：v1 旧存档没有 `time`，存档列表原本显示 `NaN-NaN-NaN NaN:NaN`。
   `fmtTime()` 现在对无效时间戳返回「时间未知」，并补了对应单测。
3. **测试总数**：22 → 23（新增 rewind 逐级回退、时间兜底两个用例）。
4. **浏览器回归结果**（headless Edge，http://localhost:5173）：
   - 首页 → 开始体验 → 四张曲目卡 → 蝉鸣四章列表 → 开演，正常。
   - 第一个选项自动留下检查点；`rewind()` 从第二个选项退回第一个选项，旗标一并回滚，
     再次回退返回 `false`（已是最早选项）。
   - 保存进度 → 写入 `mumu.saves.v2`（含 `state` 与 `version: 2`），提示「进度已保存」。
   - 刷新 → 选择存档 → 读取：位置、已做选择、检查点数量均正确恢复。
   - 注入 v1 旧存档并删除 v2 后刷新：旧档出现在存档列表、可读取，且已自动迁移写入 v2。
   - 章节结束页出现「继续下一章 / 换一个剧本 / 重新开始 / 返回首页」，
     点「继续下一章」直接接演第二章。
   - 控制台无报错。

## 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-11-23 | 首版：P0-1 拆为 5 个任务 |
| v1.1 | 2026-11-23 | 浏览器回归后修正回退语义、补旧档时间兜底与两个用例，共 23 个用例 |
