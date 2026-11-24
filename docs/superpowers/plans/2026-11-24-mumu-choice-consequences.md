# 选择有后果（P2-2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让选项写入布尔旗标，让后续台词与舞台指示按旗标条件播放，并让旗标随「继续下一章」带入同曲目下一章；内置《蝉鸣止于逢魔时》第一、二章作为可见后果的演示。

**Architecture:** 在现有文本 DSL 上增加两种记号——选项末尾 `@flag` 写入旗标、行首 `?? flag | 内容` 条件播放。解析器把注解编译成 `option.set`、把条件行编译成 `node.cond`；引擎在循环顶部按旗标跳过节点、在选择回调里写旗标、在 `start()` 增加 `carry` 参数；序列化把新字段还原成同一套 DSL；lint 复用解析器的正则常量报 E109/E110。不新增依赖、不改渲染器、不改 UI 布局、不改内置剧本的结局结构。

**Tech Stack:** 原生 ES Modules、Node 内置测试运行器（`node --test`）、零依赖离线 lint（`tools/lint.js`）、Canvas 2D 渲染器（只消费既有 `scene/time/cam/view/cast/propText` 通道）。

**Spec:** `docs/superpowers/specs/2026-11-24-mumu-choice-consequences-design.md`

## Global Constraints

- 零依赖、零构建步骤；不得新增根 `package.json`、不得引入第三方库。
- 不整体重构 UI 与页面布局；不修改 `scripts/scene.js` / `scripts/portraits.js` 的渲染逻辑。
- 不改变内置剧本的结局结构，不新增多结局；P2-1 已砍。
- 旧文本（无 `@` / `??`）解析结果不得出现 `cond` / `set` 字段；旧存档（缺 `flags`）必须可读。
- 旗标只做布尔：`getFlag(key)` 为真 / 为假；不提供取消语法、值比较、AND/OR。
- 条件只能用在台词/旁白与这些舞台指示上：场景/分镜、镜头、姿态/情绪、动作、视角/机位、出场/登场、清场/空场/无人；不得用于标题/简介/作者、角色表、标签、跳转、选项、结束。
- 用户可见错误一律中文、带原始行号、`e.userFacing = true`。
- 测试命令只能在仓库根执行：`node --test tests/*.test.mjs`；lint 回归：`node tools/lint.js --builtin` 必须输出「通过：内置 15 章 未发现问题。」。
- 现有 311 个测试必须保持全绿；新增测试后总数只增不减。
- 不修改、不 stage、不删除四个未跟踪目录：`demo/`、`holo-card/`、`outputs/`、`script-select/`。
- 不做 git push；只在任务内本地提交。

---

## 文件结构

| 文件 | 职责 | 本计划中的变更 |
| --- | --- | --- |
| `scripts/parser.js` | 文本 DSL → 剧本对象 | 导出 `FLAG_KEY_RE` / `COND_RE` / `splitOptionFlags`；条件前缀与选项注解编译成 `cond` / `set` |
| `scripts/serialize.js` | 剧本对象 → DSL 文本 | 还原 `?? key | ` 前缀与 ` @a,b` 后缀 |
| `scripts/engine.js` | 剧本 → 可玩状态 | 条件跳过、选择写旗标、`start(sc, snapshot, carry)` |
| `scripts/main.js` | 装配与章节衔接 | `play(script, snapshot, carry)`；「继续下一章」携带旗标 |
| `tools/lint.js` | 离线校验器 | 条件前缀剥离、E109 / E110 |
| `docs/mumu-lint-rules.md` | 校验规则文档 | E109 / E110 码表 |
| `scripts/builtin.js` | 内置剧本 | 第一章后果段、第二章跨章段 |
| `scripts/modals.js` | 导入弹窗 | 格式说明补一行（不布局） |
| `README.md` / `AGENTS.md` / `docs/mumu-package-spec.md` | 作者文档 | 新语法、文件表、自检项 |
| `tests/parser-choice-flags.test.mjs` | 新测试 | 注解 / 条件 / 报错 / 旧文本 |
| `tests/engine-choice-flags.test.mjs` | 新测试 | 写旗标 / 跳过 / 回退 / carry |
| `tests/builtin-choice-flags.test.mjs` | 新测试 | 内置第一/二章旗标与跨章条件结构 |
| `tests/serialize-choice-flags.test.mjs` | 新测试 | 往返与旧脚本不变 |
| `tests/lint-choice-flags.test.mjs` | 新测试 | 合法零 issue / E109 / E110 / 内置零 issue |

---

### Task 1: 解析器与序列化的新语法

**Files:**
- Modify: `scripts/parser.js`（常量与 `compileText`）
- Modify: `scripts/serialize.js`（`serializeScript`）
- Test: `tests/parser-choice-flags.test.mjs`
- Test: `tests/serialize-choice-flags.test.mjs`

**Interfaces:**
- Consumes: 现有 `parseScriptText` 的 `{ meta, characters, nodes, labels }` 结构与 `fail(msg)`。
- Produces:
  - `export const FLAG_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/`
  - `export const COND_RE = /^\?\?\s*(!?)\s*([^\s|]+)\s*\|([\s\S]*)$/`
  - `export function splitOptionFlags(text) → { text: string, set: string[], bad: string }`
  - 选项对象：`{ text, to, set?: string[] }`
  - 节点对象：`{ ...原有字段, cond?: { key: string, neg: boolean } }`

- [ ] **Step 1: 写解析器失败测试**

创建 `tests/parser-choice-flags.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptText } from '../scripts/parser.js';

const wrap = (body) => `标题：旗标测试
简介：测试选项旗标与条件行。
角色：
甲 | 男 | 短发 | 白 | 少年
乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
${body}
`;

const script = (body) => parseScriptText(wrap(body), 'flags.txt');

/* ---------------- 选项旗标注解 ---------------- */

test('选项末尾的 @ 注解写入 set，并从文字里剥掉', () => {
  const sc = script(`甲：开场。
> 追问她 @asked_tape -> A
> 换个话题 -> B

[A]
甲：A。
-> END

[B]
甲：B。
-> END

[END]
【结束】`);
  const choice = sc.nodes.find((n) => n.t === 'choice');
  assert.deepEqual(choice.options, [
    { text: '追问她', to: 'A', set: ['asked_tape'] },
    { text: '换个话题', to: 'B' },
  ]);
});

test('一个选项可写多个旗标，重复键只留一个', () => {
  const sc = script(`甲：开场。
> 同时发生 @a,b,a -> A

[A]
甲：A。
【结束】`);
  const opt = sc.nodes.find((n) => n.t === 'choice').options[0];
  assert.equal(opt.text, '同时发生');
  assert.deepEqual(opt.set, ['a', 'b']);
});

test('中文正文后不带空格的 @ 也能识别为注解', () => {
  const sc = script(`甲：开场。
> 追问她@asked_tape -> A

[A]
甲：A。
【结束】`);
  const opt = sc.nodes.find((n) => n.t === 'choice').options[0];
  assert.equal(opt.text, '追问她');
  assert.deepEqual(opt.set, ['asked_tape']);
});

test('不像注解的 @（邮箱、正文中间的 @）按普通文字保留', () => {
  const sc = script(`甲：开场。
> 发邮件到 a@b.com 询问 -> A
> 邮箱 a@b -> B

[A]
甲：A。
-> END

[B]
甲：B。
-> END

[END]
【结束】`);
  const opts = sc.nodes.find((n) => n.t === 'choice').options;
  assert.deepEqual(opts.map((o) => o.text), ['发邮件到 a@b.com 询问', '邮箱 a@b']);
  assert.equal(opts[0].set, undefined);
  assert.equal(opts[1].set, undefined);
});

test('选项旗标键名非法时报中文错误', () => {
  assert.throws(() => script(`甲：开场。
> 追问 @asked-ta... -> A
【结束】`), (e) => e.userFacing === true && /第 9 行/.test(e.message) && /不合法/.test(e.message));
});

test('末尾只有 @ 时报中文错误', () => {
  assert.throws(() => script(`甲：开场。
> 追问 @ -> A
【结束】`), (e) => e.userFacing === true && /第 9 行/.test(e.message) && /没有旗标名/.test(e.message));
});

/* ---------------- 条件行 ---------------- */

test('条件台词编译成 cond，正文不受影响', () => {
  const sc = script(`甲：开场。
?? asked | 乙（轻声）：你问了。
?? !asked | 乙：你没问。
【结束】`);
  const says = sc.nodes.filter((n) => n.t === 'say');
  assert.deepEqual(says.map((n) => n.text), ['开场。', '你问了。', '你没问。']);
  assert.deepEqual(says[1].cond, { key: 'asked', neg: false });
  assert.deepEqual(says[2].cond, { key: 'asked', neg: true });
});

test('条件场景只按第一个 | 切分，内层 | 属于场景标签', () => {
  const sc = script(`甲：开场。
?? asked | 【场景：操场 | 黄昏 | 远景】
【结束】`);
  const scene = sc.nodes.find((n) => n.t === 'scene' && n.cond);
  assert.deepEqual(scene.cond, { key: 'asked', neg: false });
  assert.equal(scene.scene, 'playground');
  assert.equal(scene.time, 'dusk');
  assert.equal(scene.cam, 'wide');
});

test('条件可用的舞台指示都挂上 cond', () => {
  const sc = script(`甲：开场。
?? asked | 【镜头：特写】
?? asked | 【姿态：甲|难过】
?? asked | 【动作：乙|坐下】
?? asked | 【视角：过肩】
?? asked | 【出场：乙】
?? asked | 【清场】
?? asked | 【场景：教室 | 夜晚 | 近景】
【结束】`);
  const dirs = sc.nodes.filter((n) => n.cond);
  assert.deepEqual(dirs.map((n) => n.t), ['cam', 'pose', 'action', 'view', 'enter', 'clear', 'scene']);
});

const forbidden = [
  ['选项', '?? asked | > 选项 -> L'],
  ['跳转', '?? asked | -> L'],
  ['标签', '?? asked | [L]'],
  ['结束', '?? asked | 【结束】'],
  ['标题', '?? asked | 标题：另一个'],
];

for (const [name, line] of forbidden) {
  test(`条件不能用在${name}上`, () => {
    assert.throws(() => script(`甲：开场。
${line}
【结束】`), (e) => e.userFacing === true && /第 9 行/.test(e.message) && /条件行不能用在/.test(e.message));
  });
}

test('条件不能写在角色表里', () => {
  const text = `标题：T
简介：s
角色：
甲 | 男 | 短发 | 白 | 少年
?? asked | 乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
甲：开场。
【结束】`;
  assert.throws(() => parseScriptText(text, 't.txt'), (e) => e.userFacing === true && /条件行不能用在角色表/.test(e.message));
});

test('条件行语法错误都报中文并带行号', () => {
  const bads = [
    '?? asked',
    '?? 1bad | 甲：x',
    '?? asked |',
    '?? a | ?? b | 甲：x',
  ];
  for (const line of bads) {
    assert.throws(() => script(`甲：开场。
${line}
【结束】`), (e) => e.userFacing === true && /第 9 行/.test(e.message), `应拒绝：${line}`);
  }
});

/* ---------------- 旧文本兼容 ---------------- */

test('没有新语法的旧文本不出现 cond / set 字段', () => {
  const sc = script(`甲：开场。
> 追问 -> A

[A]
甲：A。
【结束】`);
  assert.ok(sc.nodes.every((n) => !('cond' in n)));
  const opt = sc.nodes.find((n) => n.t === 'choice').options[0];
  assert.equal('set' in opt, false);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/parser-choice-flags.test.mjs`
Expected: FAIL —— `splitOptionFlags` / 条件行尚未实现，选项 `set` 为 `undefined`。

- [ ] **Step 3: 实现解析器**

在 `scripts/parser.js` 的 `fail()` 之后、`isCharRow` 之前加入：

```js
/* ---------- 选择有后果：选项旗标与条件行 ---------- */
/** 旗标键名：字母开头，可含数字与下划线，最长 32 个字符 */
export const FLAG_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
/** 条件行：`?? key | 内容` / `?? !key | 内容`（只按第一个 | 切分） */
export const COND_RE = /^\?\?\s*(!?)\s*([^\s|]+)\s*\|([\s\S]*)$/;

/**
 * 把选项文字末尾的 `@a,b` 注解拆出来（纯函数，lint 复用同一口径）。
 * 返回 { text, set, bad }：bad 是第一个非法键名（没有则 ''，`'@'` 表示注解为空）。
 *
 * 判定注解的边界：
 * - `@` 前必须是行首或非「字母/数字/点/下划线/连字符/@」的字符，
 *   所以 `a@b`（邮箱形态）与「发邮件到 a@b.com 询问」不会被当成注解；
 * - 中文正文后不带空格的 `追问她@asked` 仍算注解；
 * - 整段只有 `@a`（没有正文）时按普通文字处理，旧剧本零变化。
 */
export function splitOptionFlags(text) {
  const raw = String(text == null ? '' : text);
  if (/(^|[^A-Za-z0-9._@-])@$/.test(raw)) {
    return { text: raw.replace(/\s*@$/, '').trim(), set: [], bad: '@' };
  }
  const m = raw.match(/(^|[^A-Za-z0-9._@-])@(\S+)$/);
  if (!m) return { text: raw.trim(), set: [], bad: '' };
  const at = raw.length - m[2].length - 1;
  const head = raw.slice(0, at).trim();
  if (!head) return { text: raw.trim(), set: [], bad: '' };
  const keys = m[2].split(',').map((s) => s.trim()).filter(Boolean);
  if (!keys.length) return { text: head, set: [], bad: '@' };
  const bad = keys.find((k) => !FLAG_KEY_RE.test(k)) || '';
  return { text: head, set: [...new Set(keys)], bad };
}

/** 拆条件行前缀；写法不对直接抛中文错误（带行号）。 */
function takeCondPrefix(line, lineNo) {
  const m = String(line).match(COND_RE);
  if (!m) {
    throw fail(`第 ${lineNo} 行：条件行写法不对，应为「?? 旗标 | 内容」或「?? !旗标 | 内容」。`);
  }
  const key = m[2].trim();
  if (!FLAG_KEY_RE.test(key)) {
    throw fail(`第 ${lineNo} 行：旗标名「${key}」不合法，只能用字母开头、字母/数字/下划线，最长 32 个字符。`);
  }
  const body = m[3].trim();
  if (!body) throw fail(`第 ${lineNo} 行：条件行的「|」后面没有内容。`);
  if (body.startsWith('??')) throw fail(`第 ${lineNo} 行：条件行不能再套一层条件行。`);
  return { cond: { key, neg: m[1] === '!' }, body };
}

/** 条件用在不允许的行上：中文报错并列出允许范围。 */
function condForbidden(lineNo, where) {
  return fail(`第 ${lineNo} 行：条件行不能用在${where}上。允许条件的是台词/旁白与这些舞台指示：场景/分镜、镜头、姿态/情绪、动作、视角/机位、出场/登场、清场/空场/无人。`);
}
```

在 `compileText()` 里做四处改动。

(a) `let pendingChoices = null;` 之后加：

```js
  let pendingCond = null;
```

并在 `flushChoices` 定义之后加：

```js
  /** 入队节点；当前行带条件时把 cond 挂到节点上。 */
  const emit = (node) => {
    if (pendingCond) node.cond = pendingCond;
    nodes.push(node);
    return node;
  };
```

(b) 循环开头，把 `const line = lines[i].trim();` 改为：

```js
    let line = lines[i].trim();
    if (!line) continue;
    if (/^(\/\/|<!--)/.test(line)) continue;

    pendingCond = null;
    if (line.startsWith('??')) {
      // 条件行不能出现在角色表里：作者的意图是“角色行”，不是台词
      if (inCharBlock) throw condForbidden(i + 1, '角色表');
      const parsed = takeCondPrefix(line, i + 1);
      pendingCond = parsed.cond;
      line = parsed.body;
    }
```

（删掉原来的 `if (!line) continue;` 与注释判断两行，避免重复。）

(c) 给不允许条件的行加守卫：

- 三个元信息分支（标题 / 简介 / 作者）在赋值前各加：
  ```js
      if (pendingCond) throw condForbidden(i + 1, '标题、简介或作者行');
  ```
- `角色：` 分支开头加：
  ```js
      if (pendingCond) throw condForbidden(i + 1, '角色表');
  ```
- `isCharRow` 分支开头加：
  ```js
      if (pendingCond) throw condForbidden(i + 1, '角色表');
  ```
- 标签分支开头加：
  ```js
      if (pendingCond) throw condForbidden(i + 1, '标签行');
  ```
- 跳转分支开头加：
  ```js
      if (pendingCond) throw condForbidden(i + 1, '跳转行');
  ```
- 结束分支开头加：
  ```js
      if (pendingCond) throw condForbidden(i + 1, '结束行');
  ```
- 选项分支开头加：
  ```js
      if (pendingCond) throw condForbidden(i + 1, '选项行');
  ```

(d) 允许条件的行一律改用 `emit`，并把选项改成带注解的写法：

```js
    if ((m = line.match(/^【\s*(?:场景|分镜)[:：]\s*(.+?)\s*】$/))) {
      flushChoices();
      const parts = m[1].split(/[|｜,，\s]+/).filter(Boolean);
      const scene = matchKey(SCENES, parts[0], null);
      if (!scene) {
        const names = Object.values(SCENES).map((s) => s.label).join(' / ');
        throw fail(`第 ${i + 1} 行：未识别的场景“${parts[0]}”。可用场景：${names}。`);
      }
      const time = matchKey(TIMES, parts[1], 'dusk');
      const cam = matchKey(CAMS, parts[2], 'mid');
      emit({ t: 'scene', scene, time, cam });
      continue;
    }
```

其余分支只把 `nodes.push(` 换成 `emit(`：`cam`、`pose`、`action`、`view`、`enter`、`clear`、以及 `say` 的四个入队点（画外音、情绪旁白、情绪角色、语气备注）和 `say` 的普通对白/旁白两处、最后的旁白兜底。

选项分支替换为：

```js
    // 选项 > 文本 @flag_a,flag_b -> 标签
    if ((m = line.match(/^>\s*(.+?)\s*->\s*(.+)$/))) {
      const split = splitOptionFlags(m[1]);
      if (split.bad) {
        throw fail(split.bad === '@'
          ? `第 ${i + 1} 行：选项末尾的「@」后面没有旗标名。`
          : `第 ${i + 1} 行：选项旗标「${split.bad}」不合法，只能用字母开头、字母/数字/下划线，最长 32 个字符。`);
      }
      if (!pendingChoices) pendingChoices = { t: 'choice', options: [] };
      const opt = { text: split.text, to: m[2].trim() };
      if (split.set.length) opt.set = split.set;
      pendingChoices.options.push(opt);
      continue;
    }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/parser-choice-flags.test.mjs`
Expected: PASS（全部用例）。

- [ ] **Step 5: 写序列化失败测试**

创建 `tests/serialize-choice-flags.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptText } from '../scripts/parser.js';
import { serializeScript } from '../scripts/serialize.js';

const SAMPLE = `标题：旗标往返
简介：条件行与选项旗标。
角色：
甲 | 男 | 短发 | 白 | 少年
乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
甲：开场。
> 追问 @asked_tape,kept_quiet -> A
> 沉默 -> B

[A]
?? asked_tape | 乙（轻声）：你问了。
?? !asked_tape | 乙：你没问。
?? picked | 【视角：过肩】
?? picked | 【镜头：特写】
-> END

[B]
甲：好。
-> END

[END]
【结束】`;

test('带 cond / set 的脚本往返不丢字段', () => {
  const sc = parseScriptText(SAMPLE, 'flags.txt');
  const again = parseScriptText(serializeScript(sc), 'flags.txt');
  assert.deepEqual(again.nodes, sc.nodes);
  assert.deepEqual(again.labels, sc.labels);
});

test('序列化输出保留注解与条件前缀', () => {
  const out = serializeScript(parseScriptText(SAMPLE, 'flags.txt'));
  assert.ok(out.includes('> 追问 @asked_tape,kept_quiet -> A'));
  assert.ok(out.includes('?? asked_tape | 乙（轻声）：你问了。'));
  assert.ok(out.includes('?? !asked_tape | 乙：你没问。'));
  assert.ok(out.includes('?? picked | 【视角：过肩】'));
});

test('没有新字段的旧脚本导出不变', () => {
  const text = `标题：旧剧本
简介：没有旗标。
角色：
甲 | 男 | 短发 | 白 | 少年

【场景：教室 | 黄昏 | 中景】
甲：你好。
【结束】`;
  const out = serializeScript(parseScriptText(text, 'old.txt'));
  assert.equal(out.includes('??'), false);
  assert.equal(/ @/.test(out), false);
  assert.deepEqual(parseScriptText(out, 'old.txt').nodes, parseScriptText(text, 'old.txt').nodes);
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `node --test tests/serialize-choice-flags.test.mjs`
Expected: FAIL —— 输出里没有 `@` / `??`。

- [ ] **Step 7: 实现序列化**

在 `scripts/serialize.js` 的 `nodes.forEach((n, i) => {` 内、`for (const name of labelsAt.get(i) || []) lines.push(...)` 之后加入：

```js
    /** 带条件的节点输出 ?? 前缀；标签行不加。 */
    const emit = (text) => lines.push(
      n.cond ? `?? ${n.cond.neg ? '!' : ''}${n.cond.key} | ${text}` : text,
    );
```

把 `switch (n.t)` 内所有 `lines.push(...)` 改成 `emit(...)`（`scene` / `cam` / `pose` / `action` / `view` / `enter` / `clear` / `say` / `jump` / `end`）。选项分支改为：

```js
      case 'choice':
        for (const o of n.options || []) {
          const flags = Array.isArray(o.set) && o.set.length ? ` @${o.set.join(',')}` : '';
          emit(`> ${o.text}${flags} -> ${o.to}`);
        }
        break;
```

- [ ] **Step 8: 跑新测试与全量测试**

Run: `node --test tests/serialize-choice-flags.test.mjs`
Expected: PASS。

Run: `node --test tests/*.test.mjs`
Expected: 全绿（旧测试不被新字段影响）。

- [ ] **Step 9: 提交**

```bash
git add scripts/parser.js scripts/serialize.js tests/parser-choice-flags.test.mjs tests/serialize-choice-flags.test.mjs
git commit -m "feat(P2-2): 解析与序列化选项旗标、条件行"
```

---

### Task 2: 引擎条件跳过、选择写旗标与跨章携带

**Files:**
- Modify: `scripts/engine.js`
- Modify: `scripts/main.js`
- Test: `tests/engine-choice-flags.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `node.cond = { key, neg }`、`option.set = string[]`；现有 `state.flags`、`pushCheckpoint`、`checkpoint.flags`。
- Produces:
  - `createEngine(...).start(script, snapshot = null, carry = null)`
  - `scripts/main.js` 的 `play(script, snapshot = null, carry = null)`
  - 「继续下一章」调用 `play(next, null, { ...engine.state.flags })`

- [ ] **Step 1: 写引擎失败测试**

创建 `tests/engine-choice-flags.test.mjs`：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/engine-choice-flags.test.mjs`
Expected: FAIL —— 选项不写旗标、条件节点不跳过、`start` 不接受 carry。

- [ ] **Step 3: 实现引擎**

在 `scripts/engine.js` 的 `run()` 之前加：

```js
  /** 条件行是否成立：只读布尔旗标；缺字段按“未发生”处理。 */
  function condOk(cond) {
    if (!cond || !cond.key) return true;
    const on = !!(state.flags && state.flags[cond.key]);
    return cond.neg ? !on : on;
  }

  /** 选中选项时把注解里的旗标全部置真。 */
  function applyOptionFlags(opt) {
    if (!opt || !Array.isArray(opt.set)) return;
    for (const key of opt.set) {
      if (key) state.flags[key] = true;
    }
  }
```

在 `run()` 的 `while (idx < script.nodes.length) {` 之后、`const n = script.nodes[idx];` 之后加：

```js
      if (n.cond && !condOk(n.cond)) { idx++; continue; }
```

把选择回调改为：

```js
        ui.setChoices(n.options.map((o) => o.text), (i) => {
          choices.push(n.options[i].text);
          // 检查点已在选项 UI 出现前入栈，因此 rewind 会连旗标一起回滚
          applyOptionFlags(n.options[i]);
          ui.setChoices([]);
          idx = script.labels[n.options[i].to];
          run();
        });
```

`start` 的签名与状态初始化改为：

```js
  function start(sc, snapshot = null, carry = null) {
    script = sc;
    ended = false;
    choices = [];
    cast = [];
    idx = 0;
    actState = { poses: {}, actions: {}, view: 'normal' };
    state = snapshot && snapshot.state ? deserializeState(snapshot.state) : createState();
    // 跨章只带旗标：有快照时旗标以快照为准，carry 不参与
    if (!snapshot && carry && typeof carry === 'object') state.flags = { ...carry };
    skipCheckpoint = false;
    // ...以下保持原样
```

- [ ] **Step 4: 修改 main.js 的章节衔接**

`scripts/main.js`：

```js
function play(script, snapshot = null, carry = null) {
  showScreen('stage');
  engine.start(script, snapshot, carry);
}
```

`endOptions` 里的「继续下一章」改为：

```js
    if (next) options.push({ label: '继续下一章', run: () => play(next, null, { ...engine.state.flags }) });
```

（其余 `play(...)` 调用保持两参 / 一参不变，默认 `carry = null`。）

- [ ] **Step 5: 跑测试**

Run: `node --test tests/engine-choice-flags.test.mjs`
Expected: PASS（全部行为用例）。

Run: `node --test tests/*.test.mjs`
Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add scripts/engine.js scripts/main.js tests/engine-choice-flags.test.mjs
git commit -m "feat(P2-2): 引擎条件跳过、选择写旗标、跨章携带"
```

---

### Task 3: 校验器 E109 / E110 与规则文档

**Files:**
- Modify: `tools/lint.js`（`scanText`、`applyTextRules`）
- Modify: `docs/mumu-lint-rules.md`
- Test: `tests/lint-choice-flags.test.mjs`

**Interfaces:**
- Consumes: Task 1 导出的 `FLAG_KEY_RE`、`COND_RE`、`splitOptionFlags`。
- Produces:
  - scan 行记录新增 `cond`、`flagError` 字段；条件语法错误行记为 `kind: 'condError'` 并带 `error`
  - 新规则码 `E109`（条件行）与 `E110`（选项旗标）

- [ ] **Step 1: 写 lint 失败测试**

创建 `tests/lint-choice-flags.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintText, lintBuiltin } from '../tools/lint.js';

const base = (body) => `标题：校验用例
简介：条件行与选项旗标。
角色：
甲 | 男 | 短发 | 白 | 少年
乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
${body}
【结束】`;

const codes = (text) => lintText(text).issues.map((i) => i.code);

test('合法的条件行与选项旗标零 issue', () => {
  const text = base(`甲：开场。
> 追问 @asked_tape -> A
> 沉默 -> B

[A]
?? asked_tape | 乙（轻声）：你问吧。
?? asked_tape | 【视角：过肩】
?? !asked_tape | 【镜头：近景】
?? asked_tape | 【场景：操场 | 黄昏 | 远景】
-> END

[B]
甲：好。
-> END

[END]`);
  assert.deepEqual(lintText(text).issues, []);
});

test('条件行写法错误报 E109', () => {
  const text = base(`甲：开场。
?? asked`);
  const r = lintText(text);
  assert.equal(r.issues.some((i) => i.code === 'E109' && i.line === 9), true);
});

test('条件行旗标名非法报 E109', () => {
  const text = base(`甲：开场。
?? 1bad | 甲：x`);
  assert.equal(codes(text).includes('E109'), true);
});

test('条件行用在选项 / 标签 / 跳转 / 结束 / 标题上报 E109', () => {
  const cases = [
    '?? asked | > 选项 -> L',
    '?? asked | [L]',
    '?? asked | -> L',
    '?? asked | 【结束】',
    '?? asked | 标题：另一个',
  ];
  for (const line of cases) {
    const text = base(`甲：开场。
${line}`);
    assert.equal(codes(text).includes('E109'), true, `应报 E109：${line}`);
  }
});

test('条件行用在角色表里报 E109', () => {
  const text = `标题：T
简介：s
角色：
甲 | 男 | 短发 | 白 | 少年
?? asked | 乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
甲：开场。
【结束】`;
  assert.equal(codes(text).includes('E109'), true);
});

test('选项旗标键名非法报 E110', () => {
  const text = base(`甲：开场。
> 追问 @asked-tape -> A`);
  assert.equal(codes(text).includes('E110'), true);
});

test('末尾只有 @ 报 E110', () => {
  const text = base(`甲：开场。
> 追问 @ -> A`);
  assert.equal(codes(text).includes('E110'), true);
});

test('内置 15 章零 issue（第二章引用第一章旗标不误报）', () => {
  const r = lintBuiltin();
  assert.deepEqual(r.issues, []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/lint-choice-flags.test.mjs`
Expected: FAIL —— E109 / E110 尚不存在；合法条件行会被当成旁白或未知内容。

- [ ] **Step 3: 实现 scanText**

文件顶部 `import` 改为：

```js
import {
  SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS,
  matchModel, parseScriptText, FLAG_KEY_RE, COND_RE, splitOptionFlags,
} from '../scripts/parser.js';
```

在 `scanText` 的 `for` 循环里、注释判断之后、元信息之前加入条件前缀剥离：

```js
    let cond = null;
    if (t.startsWith('??')) {
      if (inCharBlock) {
        lines.push({ line, kind: 'condError', text: t, error: '条件行不能用在角色表上。' });
        continue;
      }
      const cm = t.match(COND_RE);
      if (!cm) {
        lines.push({ line, kind: 'condError', text: t, error: '条件行写法不对，应为「?? 旗标 | 内容」或「?? !旗标 | 内容」。' });
        continue;
      }
      if (!FLAG_KEY_RE.test(cm[2])) {
        lines.push({ line, kind: 'condError', text: t, error: `旗标名「${cm[2]}」不合法，只能用字母开头、字母/数字/下划线，最长 32 个字符。` });
        continue;
      }
      const body = cm[3].trim();
      if (!body) {
        lines.push({ line, kind: 'condError', text: t, error: '条件行的「|」后面没有内容。' });
        continue;
      }
      if (body.startsWith('??')) {
        lines.push({ line, kind: 'condError', text: t, error: '条件行不能再套一层条件行。' });
        continue;
      }
      cond = { key: cm[2], neg: cm[1] === '!' };
      t = body;
    }
```

（把原来的 `const t = srcLines[i].trim();` 改为 `let t = ...`。）

`cond` 要挂到行记录上：meta 三处、charRow、label、dir、jump、say 的 `lines.push({ line, ... })` 字面量里都加 `cond`；`text` 保持 `t`（此时已是去掉 `??` 前缀后的正文）。choice 分支改为：

```js
    if (t.startsWith('>')) {
      const cm = t.match(/^>\s*(.+?)\s*->\s*(.+)$/);
      const rawText = cm ? cm[1].trim() : null;
      const split = rawText ? splitOptionFlags(rawText) : { text: rawText, set: [], bad: '' };
      lines.push({
        line, kind: 'choice', text: t, cond,
        name: split.text,
        value: cm ? cm[2].trim() : null,
        flags: split.set,
        flagError: split.bad,
      });
      continue;
    }
```

- [ ] **Step 4: 实现 applyTextRules**

在 `applyTextRules` 的 `for (const rec of scan.lines) {` **之前**定义：

```js
  const COND_HINT = '允许条件的是台词/旁白与这些舞台指示：场景/分镜、镜头、姿态/情绪、动作、视角/机位、出场/登场、清场/空场/无人。';
```

循环体最前面加：

```js
    if (rec.kind === 'condError') {
      issues.push(issue('error', 'E109', rec.line, rec.error, COND_HINT));
      continue;
    }
    if (rec.cond) {
      const okDir = rec.kind === 'dir' && rec.name !== '结束' && rec.name !== '完';
      if (rec.kind !== 'say' && !okDir) {
        const where = rec.kind === 'dir' ? '结束行' : ({
          meta: '标题、简介或作者行', charRow: '角色表', label: '标签行', choice: '选项行', jump: '跳转行',
        }[rec.kind] || '这一行');
        issues.push(issue('error', 'E109', rec.line, `条件行不能用在${where}上。`, COND_HINT));
      }
    }
```

`rec.kind === 'choice'` 分支里、`E105` 判断之前加：

```js
      if (rec.flagError) {
        issues.push(issue('error', 'E110', rec.line,
          rec.flagError === '@'
            ? '选项末尾的「@」后面没有旗标名。'
            : `选项旗标「${rec.flagError}」不合法，只能用字母开头、字母/数字/下划线，最长 32 个字符。`,
          '正确写法：> 选项文字 @flag_a,flag_b -> 标签（@ 前可留空格）'));
      }
```

把 `applyTextRules` 上方的注释「12 条文本级规则：E101-E105、W101-W105、W107、W108」改为「14 条文本级规则：E101-E105、E109、E110、W101-W105、W107、W108」。

- [ ] **Step 5: 更新规则文档**

在 `docs/mumu-lint-rules.md` 的码表末尾（`E100` 行之前或之后）追加：

```markdown
| `E109` | error | `条件行写法不对，应为「?? 旗标 \| 内容」或「?? !旗标 \| 内容」。` | 少了 `\|`、旗标名写错位置 | `允许条件的是台词/旁白与这些舞台指示：场景/分镜、镜头、姿态/情绪、动作、视角/机位、出场/登场、清场/空场/无人。` |
| `E109` | error | `旗标名「${key}」不合法，只能用字母开头、字母/数字/下划线，最长 32 个字符。` | `?? 1bad \| …` / `?? asked-tape \| …` | 同上 |
| `E109` | error | `条件行的「\|」后面没有内容。` | `?? asked \|` 后面空白 | 同上 |
| `E109` | error | `条件行不能再套一层条件行。` | `?? a \| ?? b \| 台词` | 同上 |
| `E109` | error | `条件行不能用在${where}上。` | 条件写在选项 / 跳转 / 标签 / 结束 / 标题 / 角色表上 | 同上 |
| `E110` | error | `选项旗标「${bad}」不合法，只能用字母开头、字母/数字/下划线，最长 32 个字符。` | `> 选项 @asked-tape -> A` | `正确写法：> 选项文字 @flag_a,flag_b -> 标签（@ 前可留空格）` |
| `E110` | error | `选项末尾的「@」后面没有旗标名。` | `> 选项 @ -> A` | 同上 |
```

并在「五条口径」之后补一条「条件行与选项旗标」小节（短段落即可）：

```markdown
条件行（`?? flag | 内容`）只影响播放，不改变控制流；不要指望它做条件跳转。
选项旗标（`> 文本 @flag -> 标签`）在选中时置真；`@` 前的空白可省略，但邮箱形态的 `a@b` 不会被当成注解。
校验器不检查「旗标从未被写入」：跨章引用（第二章读第一章的 `asked_tape`）在单章文本里看起来就是未写入。
```

- [ ] **Step 6: 跑 lint 测试与内置基线**

Run: `node --test tests/lint-choice-flags.test.mjs`
Expected: PASS。

Run: `node tools/lint.js --builtin`
Expected: `通过：内置 15 章 未发现问题。`（Task 4 写入内置语料后仍须如此。）

Run: `node --test tests/*.test.mjs`
Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add tools/lint.js docs/mumu-lint-rules.md tests/lint-choice-flags.test.mjs
git commit -m "feat(P2-2): 校验器支持条件行与选项旗标（E109/E110）"
```

---

### Task 4: 内置演示、作者文档与浏览器回归

**Files:**
- Modify: `scripts/builtin.js`（第一章 `[dash]` 之后；第二章两处）
- Modify: `README.md`、`AGENTS.md`、`docs/mumu-package-spec.md`、`scripts/modals.js`
- Create: `tests/builtin-choice-flags.test.mjs`（锁住内置第一/二章的旗标与跨章条件）

**Interfaces:**
- Consumes: Task 1-3 的全部语法与引擎行为。
- Produces: 可演示的两条可见后果路径（追问 / 安静）与跨章回响。

- [ ] **Step 1: 写入第一章后果段**

在 `scripts/builtin.js` 第一章的 `[dash]` 段末尾 `白石葵（听到那个久违的称呼……）：……嗯！` 与 `【场景：操场 | 夜晚 | 远景】` 之间插入：

```text
?? asked_tape | 【视角：过肩】
?? asked_tape | 白石葵（轻声）：刚才你那样追问的时候，我差点就藏不住了。
?? kept_quiet | 【镜头：近景】
?? kept_quiet | 白石葵（轻声）：……谢谢你，没有追问。
?? asked_why | 夏目悠真：等磁带修好，我会把想说的话，都好好告诉她。
?? chose_song | 夏目悠真：这首歌，我们一定会听完。
?? picked_papers | 【镜头：特写】
?? picked_papers | 夏目悠真：转学申请表都捡齐了，一张也没落下。
?? picked_papers | 【镜头：中景】
?? grabbed_run | 【镜头：特写】
?? grabbed_run | 夏目悠真：随身听的磁带盒，可不能再甩出去了。
?? grabbed_run | 【镜头：中景】
?? asked_tape | 【场景：操场 | 黄昏 | 远景】
?? asked_tape | 【出场：夏目悠真|白石葵】
?? asked_tape | 白石葵（小声）：刚才在教室里，你那样追问我的时候……
?? asked_tape | 夏目悠真：嗯，我记着。等修好了，再慢慢说。
```

要点：不删除、不改写原 `[ask] [ignore] [fix] [why] [song] [offer] [papers] [run] [dash]` 任何一行与箭头；固定的 `【场景：操场 | 夜晚 | 远景】` 与 `【结束】` 仍在最后。

- [ ] **Step 2: 写入第二章跨章回响**

(a) 在 `夏目悠真停下脚步，转身看着她，手里紧紧攥着那台银灰色的随身听。` 与 `白石葵（气喘吁吁）：夏目同学……稍微休息一下吧。……` 之间插入：

```text
?? asked_tape | 白石葵（轻轻喘着气，避开他的视线）：刚才在教室里，你那样追问我的时候，我差点以为你已经想起来了。
?? kept_quiet | 白石葵（轻轻喘着气，悄悄看了他一眼）：刚才在教室里……谢谢你没有追问。
?? asked_why | 夏目悠真：等修好磁带，再好好跟大家道个别吧。
?? chose_song | 夏目悠真：那首歌，我们一定会听完。
?? picked_papers | 夏目悠真（摸了摸口袋）：文件都收好了，一样没落下。
?? grabbed_run | 夏目悠真：刚才跑得太急，差点把磁带甩出去。
```

(b) 在 `夏目悠真（看着天色，眉头微蹙）：现在已经是黄昏末期了，天黑得很快。我们只有一次选择的机会。` 与两行选项之间插入：

```text
?? asked_tape | 【视角：过肩】
?? kept_quiet | 【镜头：近景】
```

第二章其余内容、`[bus]` / `[hill]` 两条路线与结局均不改。

- [ ] **Step 3: 新增内置结构用例并跑测试**

新建 `tests/builtin-choice-flags.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBuiltinScripts } from '../scripts/builtin.js';

const KEYS = ['asked_tape', 'kept_quiet', 'asked_why', 'chose_song', 'picked_papers', 'grabbed_run'];

test('内置第一章三个选项都带旗标，第二章读取第一章的旗标', () => {
  const scripts = loadBuiltinScripts();
  const ch1 = scripts.find((s) => s.id === 'builtin_cicada_01');
  const ch2 = scripts.find((s) => s.id === 'builtin_cicada_02');
  assert.ok(ch1 && ch2, '内置第一、二章应存在');
  const sets = ch1.nodes.filter((n) => n.t === 'choice').flatMap((n) => n.options)
    .map((o) => (o.set || []).join(','));
  assert.deepEqual(sets, KEYS);
  const ch1Cond = new Set(ch1.nodes.filter((n) => n.cond).map((n) => n.cond.key));
  const ch2Cond = new Set(ch2.nodes.filter((n) => n.cond).map((n) => n.cond.key));
  for (const key of KEYS) {
    assert.ok(ch1Cond.has(key), `第一章缺少 ${key} 的条件节点`);
    assert.ok(ch2Cond.has(key), `第二章缺少 ${key} 的跨章条件节点`);
  }
});
```

Run: `node --test tests/builtin-choice-flags.test.mjs`
Expected: PASS。

Run: `node tools/lint.js --builtin`
Expected: `通过：内置 15 章 未发现问题。`

- [ ] **Step 4: 更新作者文档**

(a) `README.md` 的「剧本格式速查」代码块，在 `> 选项 -> 标签` 行后加：

```text
> 选项文字 @flag_a,flag_b -> 标签    选项可写入布尔旗标（@ 前可留空格；多个用逗号）
?? flag | 台词或舞台指示            条件行：旗标为真才播放；?? !flag | … 表示未发生才播放
```

(b) `README.md` 第 158 行「括号情绪允许较长描写……」段之后加一段：

```text
选择可以留下后果：选项末尾写 `@asked_tape`，选中即把旗标置真；后续行首写
`?? asked_tape | …` 才播放，写 `?? !asked_tape | …` 则在未发生时播放。条件只允许用在
台词/旁白与场景、镜头、姿态/动作、视角、出场、清场这些舞台指示上，不能用在选项、跳转、
标签、角色表与【结束】上。「继续下一章」会把本章旗标带进同曲目的下一章；直接从章节列表
进入或「重新开始」不会继承。
```

(c) `docs/mumu-package-spec.md` §6.1 写法速查表，在 `> 选项文字 -> 标签` 行后加：

```markdown
| `> 选项文字 @flag -> 标签` | 选项可写入布尔旗标；`@` 前可留空格，多个用逗号分隔 |
| `?? flag \| 台词 / 舞台指示` | 条件行：旗标为真才播放；`?? !flag \| …` 表示未发生才播放 |
```

(d) `scripts/modals.js` 的导入说明 `<ul>` 里，在选项那一行后加：

```html
        <li><b>&gt; 选项文字 @flag -&gt; 标签</b> 可写入旗标；<b>?? flag | 台词</b> 或 <b>?? !flag | 【镜头：特写】</b> 条件播放</li>
```

(e) `AGENTS.md` 的「修改速查表」加一行：

```markdown
| 选项旗标 / 条件行语法 | `scripts/parser.js`（`FLAG_KEY_RE` / `COND_RE` / `splitOptionFlags`）、`scripts/engine.js`（`condOk` / `applyOptionFlags`）、`scripts/serialize.js`、`tools/lint.js`（E109/E110） |
```

并在「交付前自检清单」补三项：

```markdown
- [ ] 第一章选「追问」：结尾前出现白石葵回响、过肩构图与黄昏操场插曲，再进夜晚结尾；
      选「假装没注意」：出现另一句回响与近景构图，无黄昏插曲；第三条选项分别出现纸张 / 磁带特写。
- [ ] 第一章选「追问」→「继续下一章」：第二章开场出现对应的跨章台词与过肩构图；选「假装没注意」则出现另一句与近景。
- [ ] 走到第二个选项前保存 → 刷新 → 读档 → 选另一个分支：先前旗标随检查点/快照回滚或恢复，条件台词正确切换。
```

- [ ] **Step 5: 浏览器回归**

在仓库根启动服务（不要占用 5173）：

```bash
PORT=5199 node serve.js
```

用 browser-use 依次验证（截图存到 `.superpowers/sdd/2026-11-24-mumu-choice-consequences/shots/`，该目录被 git 忽略）：

1. 打开 `http://localhost:5199`，点遮罩解锁，点「开始体验」→《蝉鸣止于逢魔时》→ 第一章。
2. 一路推进到第三个选项，选「追问她」；记录 `window.__mumu.engine.state.flags` 含 `asked_tape`；继续推进，确认依次看到：
   `刚才你那样追问的时候，我差点就藏不住了。` → 黄昏操场两句 → 夜晚操场结尾。截图。
3. 从章节列表重开第一章，选「假装没注意」；确认看到 `……谢谢你，没有追问。`、近景构图、**没有**黄昏操场插曲，直接夜晚结尾。截图。
4. 重开第一章，选「先帮她捡文件」/「抓起就跑」，确认特写分别出现纸张 / 磁带。
5. 走「追问」路径到结束，点「继续下一章」；确认第二章开场出现追问对应的跨章台词与过肩构图。截图。
6. 走「安静」路径到结束，点「继续下一章」；确认第二章出现 `谢谢你没有追问` 与近景构图。
7. 在第二个选项前点「保存」→ 刷新页面 → 读取存档 → 选另一个分支：确认条件台词切换、旗标随存档恢复。
8. 打开控制台：无 error、无 404。

- [ ] **Step 6: 全量回归**

Run: `node --test tests/*.test.mjs`
Expected: 全绿。

Run: `node tools/lint.js --builtin`
Expected: `通过：内置 15 章 未发现问题。`

- [ ] **Step 7: 提交**

```bash
git add scripts/builtin.js scripts/modals.js tests/builtin-choice-flags.test.mjs README.md AGENTS.md docs/mumu-package-spec.md
git commit -m "feat(P2-2): 内置第一/二章选择后果与作者文档"
```

---

## 自检

- **Spec 覆盖**：§3 语法 → Task 1；§4 解析器 → Task 1；§5 引擎与状态 → Task 2；§6 跨章携带 → Task 2（`main.js`）；§7 画面通道 → Task 4 演示；§8 演示内容 → Task 4；§9 lint → Task 3；§10 序列化 → Task 1；§11 兼容 → Task 1/2 测试；§12 测试与验收 → 四个任务的测试 + Task 4 浏览器回归；§14 文件 → 与文件结构表一致。
- **占位符扫描**：无 TBD / TODO / “类似 Task N”；所有代码与文案均为最终值。
- **类型一致性**：`cond = { key, neg }` 在 parser / engine / lint / serialize 四处同名；`option.set` 在 parser / engine / serialize / builtin 断言中一致；`FLAG_KEY_RE` / `COND_RE` / `splitOptionFlags` 由 parser 导出、lint 引用。
- **已知执行顺序**：内置语料与结构用例都在 Task 4 落地；Task 2 的引擎用例只用内联剧本，四个任务各自结束时测试都应全绿，最终全量测试必须全绿。
- **裁决**：`@` 注解的边界采用「前一字符不是字母/数字/点/下划线/连字符/@」判定，避免邮箱误判，同时允许中文正文无缝书写；此判定写入 `splitOptionFlags` 注释并由测试锁定。
