# P0-3 内容校验器（tools/lint.js）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给暮幕剧本 DSL 做一个零依赖的文本级静态校验器，让写坏的剧本在导入前被拦下，每条问题都带行号、原因与修法提示；对内置 15 章零 error 零 warning。

**Architecture:** 单文件 `tools/lint.js`，内含两个阶段：① 自建文本扫描器（逐行分类，带行号）② 控制流建图 + 16 条规则。另以只读方式调用 `parseScriptText()` 交叉验证，把解析器抛出的致命错误兜底成 issue。`scripts/parser.js` 零改动。

**Tech Stack:** Node 24 内置测试运行器（`node --test`）、ESM、零第三方依赖、无构建步骤、不加根 `package.json`。

**Spec:** `docs/superpowers/specs/2026-11-23-mumu-content-linter-design.md`（v1.1，权威；本计划是它的论证与拆解）

## Global Constraints

- 零依赖、不加构建步骤、**不加根 `package.json`**。
- **`scripts/parser.js` 零改动**：只允许 `import` 调用，不允许修改其任何一行。`scripts/` 目录不得 `import` `tools/lint.js`。
- 工具是离线工具，不参与线上运行：不被 `index.html` / `scripts/` 引用。
- 不破坏：剧本解析、人物识别、对话播放、剧情分支、存档、角色外观稳定性（`scriptId:cid`）、分镜系统、作品包导入导出。
- 用户可见文案一律中文；每条 issue 至少含 `code`、`severity`、`line`、`message`，尽量附 `hint`。
- 16 条规则码固定为：`E101` 未知舞台指示标签、`E102` 未知场景、`E103` 落点不存在、`E104` 标签重复、`E105` 选项缺落点、`E106` 不可达节点、`E107` 回跳、`E108` 选项回指；`W101` 未知时间/镜头/姿态/动作/视角、`W102` 未知模型、`W103` 说话人未声明、`W104` 出场人物未声明、`W105` 角色表列数≠5、`W106` 死标签、`W107` 无场景指示、`W108` 无显式结束。另有兜底码 `E100`（解析器拒绝该剧本）。
- 完成定义：`node tools/lint.js --builtin` 对内置 15 章零 issue；写坏样本能报出行号与原因；`node --test` 全绿。
- 测试只在仓库根目录跑 `node --test`（**不要**用 `node --test tests/`，本仓库该写法是坏的）。

---

### Task 1: 词表匹配器与文本扫描器

**Files:**
- Create: `tools/lint.js`
- Create: `tests/lint.test.mjs`
- Create: `tests/fixtures/lint/clean.txt`

**Interfaces:**
- Consumes: `scripts/parser.js` 导出的 `SCENES` `TIMES` `CAMS` `POSES` `ACTS` `VIEWS` `MODELS` `matchModel`；`scripts/builtin.js` 导出的 `loadBuiltinScripts()`。
- Produces（本任务交付、后续任务依赖的导出）：
  - `export function matchTable(table, text): string | null` —— 工具侧的词表匹配器（复刻解析器 `matchKey` 语义）。
  - `export function resolveTable(table, text): { key: string | null, mode: 'exact' | 'prefix' | 'fuzzy' | 'none' }` —— 解析器实际会怎么理解这个值：
    `exact` = 精确别名命中；`prefix` = 命中「作为前缀的别名」（作者写的是规范取值）；`fuzzy` = 只命中「作为子串的别名」（解析器会静默改写成别的值）；
    `none` = 解析器认不出来（回落到默认值 / 场景名直接抛错）。
  - `export function scanText(text): ScanResult` —— 文本扫描器。
  - `export function lintText(text, fileName): LintResult` —— 本任务先返回 `{ issues: [], summary: { errors: 0, warnings: 0 } }`，Task 2/3 填充规则。
  - `export function lintScript(script, source, fileName): LintResult`
  - `export function lintBuiltin(): LintResult`
  - `ScanResult` 形状：`{ lines: LineRec[], chars: Map<string, CharRec>, labels: LabelRec[], meta: { title, summary, author }, sawScene: boolean, sawEnd: boolean }`
  - `LineRec` 形状：`{ line: number, kind: string, text: string, name?: string, value?: string, parts?: string[] }`
  - `LineRec.kind` 取值集合：`'meta' | 'charRow' | 'label' | 'dir' | 'choice' | 'jump' | 'say'`
  - `CharRec` 形状：`{ name: string, cols: string[], model: string, line: number }`
  - `LabelRec` 形状：`{ name: string, line: number, targetLine: number | null }`（`targetLine` = 标签之后第一个内容行的行号；其后无内容则为 `null`）
  - `LintResult` 形状：`{ issues: Issue[], summary: { errors: number, warnings: number } }`
  - `Issue` 形状：`{ severity: 'error' | 'warning', code: string, line: number, message: string, hint?: string, file?: string }`

- [ ] **Step 1: 写失败测试（词表匹配器）**

在 `tests/lint.test.mjs` 写入：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS } from '../scripts/parser.js';
import { matchTable, resolveTable, scanText, lintText } from '../tools/lint.js';

const TABLES = { SCENES, TIMES, CAMS, POSES, ACTS, VIEWS };

test('matchTable 认得每个表里的全部 label 与 alias', () => {
  for (const [name, table] of Object.entries(TABLES)) {
    for (const def of Object.values(table)) {
      const words = [def.label, ...(def.aliases || [])];
      for (const w of words) {
        assert.equal(matchTable(table, w), matchTable(table, w), `${name} ${w} 应可识别`);
        assert.notEqual(matchTable(table, w), null, `${name} ${w} 不应判为未知`);
      }
    }
  }
});

test('matchTable 对陌生词返回 null', () => {
  assert.equal(matchTable(SCENES, '未识别的场景'), null);
  assert.equal(matchTable(CAMS, '超特写'), null);
  assert.equal(matchTable(POSES, '崩溃'), null);
});

test('matchTable 用作者口径：规范取值认得，带修饰语也认得，奇奇怪怪的写法不认', () => {
  assert.equal(matchTable(TIMES, '火夜'), 'fire');
  assert.equal(matchTable(TIMES, '夜晚'), 'night');
  assert.equal(matchTable(TIMES, '夜晚的教室'), 'night');
  assert.equal(matchTable(CAMS, '超特写'), null);
});

test('resolveTable 复刻解析器口径：能说出解析器实际会当成什么', () => {
  assert.deepEqual(resolveTable(TIMES, '火夜'), { key: 'fire', mode: 'exact' });
  assert.deepEqual(resolveTable(CAMS, '超特写'), { key: 'detail', mode: 'fuzzy' });
  assert.deepEqual(resolveTable(SCENES, '未识别的场景'), { key: null, mode: 'none' });
});

test('scanText 逐行分类并保留行号', () => {
  const src = [
    '标题：样例',
    '简介：一句话',
    '角色：',
    '阿蓝 | 男 | 短发 | 白 | 少年',
    '',
    '【场景：教室 | 黄昏 | 远景】',
    '[支线]',
    '> 追问 -> 追问分支',
    '-> 追问分支',
    '阿蓝：你好。',
  ].join('\n');
  const s = scanText(src);
  assert.equal(s.meta.title, '样例');
  assert.equal(s.meta.summary, '一句话');
  assert.equal(s.chars.size, 1);
  assert.equal(s.chars.get('阿蓝').cols.length, 5);
  assert.equal(s.labels.length, 1);
  assert.equal(s.labels[0].name, '支线');
  assert.deepEqual(s.lines.map((l) => l.kind), [
    'meta', 'meta', 'charRow', 'dir', 'label', 'choice', 'jump', 'say',
  ]);
  assert.equal(s.lines[0].line, 1);
  assert.equal(s.lines[7].line, 10);
  assert.equal(s.sawScene, true);
});

test('scanText 把标签指向其后第一个内容行', () => {
  const s = scanText('[A]\n甲：说话\n[B]\n乙：说话');
  assert.equal(s.labels[0].targetLine, 2);
  assert.equal(s.labels[1].targetLine, 4);
});

test('lintText 目前返回空 issue 列表（占位，Task 2 填充）', () => {
  const r = lintText('标题：x\n角色：\n阿蓝 | 男 | 短发 | 白 | 少年\n\n【场景：教室 | 黄昏 | 远景】\n阿蓝：你好。', 'x.txt');
  assert.deepEqual(r.issues, []);
  assert.equal(r.summary.errors, 0);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/lint.test.mjs`
Expected: FAIL —— `Cannot find module '../tools/lint.js'`（ERR_MODULE_NOT_FOUND）。

- [ ] **Step 3: 实现词表匹配器**

在 `tools/lint.js` 顶部写入：

```js
/* ============================================================
   暮幕 · 内容校验器（离线工具，不参与游戏运行，零依赖）
   用法：node tools/lint.js <文件...> | --builtin [--json] [--strict]
   规则码见 docs/mumu-lint-rules.md
   ============================================================ */
import {
  SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS,
  matchModel, parseScriptText,
} from '../scripts/parser.js';
import { loadBuiltinScripts } from '../scripts/builtin.js';
// Task 4 会补上：import { readFileSync, existsSync } from 'node:fs';
//                import { fileURLToPath } from 'node:url';
//                import path from 'node:path';

/**
 * 词表匹配（作者口径）：这个值是不是一个「规范的词表取值」。
 * 1) 精确别名命中；2) 最长的、作为前缀包含在文本里的别名；3) 都没有 → null（未识别）。
 * 与解析器的差别见 resolveTable 的注释。
 */
export function matchTable(table, text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const entries = Object.entries(table);
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      if (a.toLowerCase() === t) return key;
    }
  }
  let best = null;
  let bestLen = 0;
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      const al = a.toLowerCase();
      if (al.length > bestLen && t.startsWith(al)) { best = key; bestLen = al.length; }
    }
  }
  return best;
}

/**
 * 解析器口径：scripts/parser.js 的 matchKey 会怎么理解这个值。
 * exact = 精确别名；fuzzy = 只命中子串（解析器会静默改写成别的值）；none = 认不出来。
 * 用来在告警文案里说清「解析器实际上会当成什么」，避免把话说错。
 */
export function resolveTable(table, text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return { key: null, mode: 'none' };
  const entries = Object.entries(table);
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      if (a.toLowerCase() === t) return { key, mode: 'exact' };
    }
  }
  let best = null;
  let bestLen = 0;
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      const al = a.toLowerCase();
      if (al.length > bestLen && t.includes(al)) { best = key; bestLen = al.length; }
    }
  }
  return best ? { key: best, mode: 'fuzzy' } : { key: null, mode: 'none' };
}
```

- [ ] **Step 4: 实现文本扫描器**

紧接着写入：

```js
/** 故事行：解析器会为这些行生成节点；meta / charRow / label 不是节点 */
export const STORY_KINDS = new Set(['dir', 'choice', 'jump', 'say']);

const DIR_TAGS = new Set([
  '场景', '分镜', '镜头', '姿态', '情绪', '动作', '视角', '机位',
  '出场', '登场', '清场', '空场', '无人', '结束', '完',
]);

/** 舞台指示的 key（【xxx：…】里的 xxx）；未知 key 由规则 E101 报出 */
export function dirKey(text) {
  const m = String(text).match(/^【\s*([^:：]+)[:：]/);
  return m ? m[1].trim() : null;
}

/** 舞台指示的值（【场景：教室 | 黄昏】里的「教室 | 黄昏」），无值形式返回 '' */
export function dirValue(text) {
  const m = String(text).match(/^【\s*[^:：]+[:：]\s*([^】]*)\s*】\s*$/);
  return m ? m[1].trim() : '';
}

/**
 * 逐行扫描：把剧本文本拆成带行号的行记录，并抽出角色表、标签、元信息。
 * 分类口径与 scripts/parser.js 对齐：
 * - meta：标题/简介/作者行
 * - charRow：角色块内、含 |、且第一个 | 之前不含冒号的行
 * - label：[xxx]
 * - dir：【…】
 * - choice：> 开头
 * - jump：-> 开头
 * - say：其余非空行
 */
export function scanText(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const srcLines = raw.split('\n');
  const lines = [];
  const chars = new Map();
  const labels = [];
  const meta = { title: '', summary: '', author: '' };
  let inCharBlock = false;
  let sawScene = false;
  let sawEnd = false;

  for (let i = 0; i < srcLines.length; i++) {
    const line = i + 1;
    const t = srcLines[i].trim();
    if (!t) continue;

    let m;
    if ((m = t.match(/^(?:#\s*)?标题[:：]\s*(.+)$/))) { meta.title = m[1].trim(); inCharBlock = false; lines.push({ line, kind: 'meta', text: t }); continue; }
    if ((m = t.match(/^(?:#\s*)?简介[:：]\s*(.+)$/))) { meta.summary = m[1].trim(); inCharBlock = false; lines.push({ line, kind: 'meta', text: t }); continue; }
    if ((m = t.match(/^(?:#\s*)?作者[:：]\s*(.+)$/))) { meta.author = m[1].trim(); inCharBlock = false; lines.push({ line, kind: 'meta', text: t }); continue; }
    if (/^(?:#\s*)?角色[:：]?\s*$/.test(t)) { inCharBlock = true; continue; }

    if (inCharBlock && t.includes('|') && !t.startsWith('【') && !t.split('|')[0].includes('：') && !t.split('|')[0].includes(':')) {
      const cols = t.split('|').map((x) => x.trim());
      if (cols[0]) chars.set(cols[0], { name: cols[0], cols, model: cols[4] || '', line });
      lines.push({ line, kind: 'charRow', text: t });
      continue;
    }
    if (inCharBlock) inCharBlock = false;

    if ((m = t.match(/^\[([^\]]+)\]$/))) {
      labels.push({ name: m[1].trim(), line, targetLine: null });
      lines.push({ line, kind: 'label', text: t, name: m[1].trim() });
      continue;
    }
    if (/^【.*】$/.test(t)) {
      const key = dirKey(t);
      if (key === '场景' || key === '分镜') sawScene = true;
      if (key === '结束' || key === '完') sawEnd = true;
      lines.push({ line, kind: 'dir', text: t, name: key, value: dirValue(t) });
      continue;
    }
    if (t.startsWith('>')) {
      const cm = t.match(/^>\s*(.+?)\s*->\s*(.+)$/);
      lines.push({ line, kind: 'choice', text: t, name: cm ? cm[1].trim() : null, value: cm ? cm[2].trim() : null });
      continue;
    }
    if (t.startsWith('->')) {
      const jm = t.match(/^->\s*(.+)$/);
      lines.push({ line, kind: 'jump', text: t, value: jm ? jm[1].trim() : null });
      continue;
    }
    lines.push({ line, kind: 'say', text: t });
  }

  // 标签 → 其后第一个「故事行」（标签行本身不产生内容；meta/charRow 行也不是故事节点）
  for (const lab of labels) {
    const next = lines.find((l) => STORY_KINDS.has(l.kind) && l.line > lab.line);
    lab.targetLine = next ? next.line : null;
  }
  return { lines, chars, labels, meta, sawScene, sawEnd };
}
```

- [ ] **Step 5: 实现占位 lintText / lintScript / lintBuiltin**

```js
export function lintText(text, fileName = '') {
  const scan = scanText(text);
  return { issues: [], summary: { errors: 0, warnings: 0 }, scan };
}

export function lintScript(script, source, fileName = '') {
  // 有原文（文本剧本）走文本扫描；JSON 剧本本期不校验（无行号），返回空结果
  if (source) return lintText(source, fileName || (script && script.title) || '');
  return { issues: [], summary: { errors: 0, warnings: 0 } };
}

export function lintBuiltin() {
  const issues = [];
  for (const s of loadBuiltinScripts()) {
    const r = lintText(s.source || '', s.title || '');
    for (const it of r.issues) issues.push({ ...it, file: s.title });
  }
  return { issues, summary: { errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length } };
}
```

- [ ] **Step 6: 写干净样本**

`tests/fixtures/lint/clean.txt`：

```
标题：干净样本
简介：一个没有问题的剧本。

角色：
阿蓝 | 男 | 短发 | 白 | 少年
小葵 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 远景】
八月末的暮色落在空教室的课桌上。

阿蓝：今天也没人。

> 追问磁带 -> 追问分支
> 假装没注意 -> 忽略分支

[追问分支]
阿蓝：好吧。

【结束】
```

- [ ] **Step 7: 运行测试确认通过**

Run: `node --test tests/lint.test.mjs`
Expected: PASS，7 个用例全绿。

- [ ] **Step 8: 提交**

```bash
git add tools/lint.js tests/lint.test.mjs tests/fixtures/lint/clean.txt
git commit -m "feat(lint): 词表匹配器与文本扫描器骨架"
```

---

### Task 2: 12 条文本级规则

> **修订（2026-11-24，Task 2 任务审阅后）** —— 下列裁决已落到 `tools/lint.js`，实现与本节代码块不一致时以裁决为准：
> 1. 可用值清单**一律从词表派生**（`Object.values(POSES).map(v => v.label)`），不许手写：手写清单曾把「疲惫」写进 `POSES` 提示，而解析器里根本没有这个词，会让工具自相矛盾。
> 2. 角色行的列数与模型判定**取当前这一行的原文**（`rec.text.split('|')`），不许从 `scan.chars` 取：`scan.chars` 是「同名后写覆盖」，重名角色会让先写的那一行漏报。
> 3. `E101` 的语义从「未知标签名」扩到「**解析器不认识的舞台指示行**」：已知标签但缺必需值（`【场景】`/`【镜头】`/`【姿态】`/`【动作】`/`【视角】`/`【出场】`）同样退化成旁白，按 E101 报。
> 4. `scan.sawScene` 只有在「key 是 场景/分镜 **且值非空**」时才置真，否则 `【场景】` 会误抑制 W107。
> 5. `【姿态：*】`/`【动作：*】` 是项目文档化的「全场」写法，不报 W101。
> 6. `W103` 的判定要复刻解析器守卫：名字已声明 / `旁白` / 括号内容 ≤ 6 字，三者之一成立即不报（否则纯旁白如「他（看着天色，眉头微蹙）：说了一句。」会被误报）。
> 7. 姿态/动作的值里若出现全角 `｜`，解析器不会当分隔符（只认半角 `|`），作用对象会变成全场 → 按 W101 提示。
> 8. 简报里 E101/E104 用例的样本串与断言差一行（断言编码的是「报在出错行」），以断言为准；Task 3 的 E106/E107/E108/W106 断言行号已复核无误。

**Files:**
- Modify: `tools/lint.js`
- Modify: `tests/lint.test.mjs`
- Create: `tests/fixtures/lint/bad-text-level.txt`

**Interfaces:**
- Consumes: Task 1 的 `scanText` / `matchTable` / `lintText`。
- Produces: `lintText()` 返回真实 issue；每条 issue 的 `code` 取自 Global Constraints 的码表。

- [ ] **Step 1: 写失败测试（每条文本级规则一个用例）**

在 `tests/lint.test.mjs` 追加：

```js
const scanOf = (src) => scanText(src);
const lint = (src, name = 'x.txt') => lintText(src, name);

test('E101 未知舞台指示标签', () => {
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】\n【特写：手】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'E101');
  assert.ok(it, '应报 E101');
  assert.equal(it.severity, 'error');
  assert.equal(it.line, 3);
});

test('E102 未知场景', () => {
  const r = lint('标题：x\n\n【场景：未识别的场景 | 黄昏 | 远景】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'E102');
  assert.ok(it);
  assert.equal(it.line, 3);
});

test('E103 落点不存在（跳转与选项各一条）', () => {
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】\n-> 不存在的标签\n> 选项 -> 也不存在\n阿蓝：你好。');
  const its = r.issues.filter((i) => i.code === 'E103');
  assert.equal(its.length, 2);
  assert.deepEqual(its.map((i) => i.line).sort((a, b) => a - b), [4, 5]);
});

test('E104 标签重复定义', () => {
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】\n[甲]\n阿蓝：一\n[甲]\n阿蓝：二');
  const it = r.issues.find((i) => i.code === 'E104');
  assert.ok(it);
  assert.equal(it.line, 5);
  assert.match(it.message, /4/);
});

test('E105 选项行缺少落点', () => {
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】\n> 只有选项没有落点');
  const it = r.issues.find((i) => i.code === 'E105');
  assert.ok(it);
  assert.equal(it.line, 4);
});

test('W101 未知时间/镜头/姿态/动作/视角各一条', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 凌晨 | 远景】',
    '【镜头：超特写】', '【姿态：崩溃】', '【动作：飞翔】', '【视角：俯瞰】',
    '阿蓝：你好。',
  ].join('\n'));
  const codes = r.issues.filter((i) => i.severity === 'warning').map((i) => i.code);
  assert.equal(codes.filter((c) => c === 'W101').length, 5);
});

test('W102 未知模型名', () => {
  const r = lint('标题：x\n角色：\n阿蓝 | 男 | 短发 | 白 | 不存在的模型\n\n【场景：教室 | 黄昏 | 远景】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'W102');
  assert.ok(it);
  assert.equal(it.line, 3);
});

test('W103 说话人未在角色表声明', () => {
  const r = lint('标题：x\n角色：\n阿蓝 | 男 | 短发 | 白 | 少年\n\n【场景：教室 | 黄昏 | 远景】\n小葵：你好。');
  const it = r.issues.find((i) => i.code === 'W103');
  assert.ok(it);
  assert.equal(it.line, 6);
});

test('W104 出场人物未声明', () => {
  const r = lint('标题：x\n角色：\n阿蓝 | 男 | 短发 | 白 | 少年\n\n【场景：教室 | 黄昏 | 远景】\n【出场：阿蓝|小葵】');
  const it = r.issues.find((i) => i.code === 'W104');
  assert.ok(it);
  assert.equal(it.line, 6);
});

test('W105 角色表列数不等于 5', () => {
  const r = lint('标题：x\n角色：\n阿蓝 | 男 | 少年\n\n【场景：教室 | 黄昏 | 远景】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'W105');
  assert.ok(it);
  assert.equal(it.line, 3);
});

test('W107 全文没有场景指示', () => {
  const r = lint('标题：x\n\n阿蓝：你好。');
  assert.ok(r.issues.find((i) => i.code === 'W107'));
});

test('W108 结尾没有显式【结束】', () => {
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'W108');
  assert.ok(it);
});

test('干净样本零 issue', () => {
  const src = readFileSync(new URL('./fixtures/lint/clean.txt', import.meta.url), 'utf8');
  const r = lint(src, 'clean.txt');
  assert.deepEqual(r.issues.map((i) => `${i.code}@${i.line}:${i.message}`), []);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/lint.test.mjs`
Expected: FAIL —— 多数用例因「应报 E101」等断言失败（`it` 为 `undefined`）。

- [ ] **Step 3: 实现 12 条文本级规则**

在 `tools/lint.js` 中新增规则实现（把下面的 `applyTextRules` 接到 `lintText` 里）：

```js
const SCENE_LIST = Object.values(SCENES).map((s) => s.label).join(' / ');

function issue(severity, code, line, message, hint) {
  return hint ? { severity, code, line, message, hint } : { severity, code, line, message };
}

/** 12 条文本级规则：E101-E105、W101-W105、W107、W108 */
function applyTextRules(scan) {
  const issues = [];
  const labels = new Map();
  for (const lab of scan.labels) {
    if (labels.has(lab.name)) {
      issues.push(issue('error', 'E104', lab.line,
        `标签「${lab.name}」重复定义，前一次在第 ${labels.get(lab.name)} 行；后一次会覆盖前一次。`,
        '请删掉多余的一处，或把两处改成不同的标签名。'));
    } else {
      labels.set(lab.name, lab.line);
    }
  }

  for (const rec of scan.lines) {
    if (rec.kind === 'dir') {
      const key = rec.name;
      if (!DIR_TAGS.has(key)) {
        issues.push(issue('error', 'E101', rec.line,
          `未知舞台指示标签「${key}」。本项目只认：场景/分镜、镜头、姿态/情绪、动作、视角/机位、出场/登场、清场/空场/无人、结束/完。`,
          '把标签名改成上面列出的写法，否则这一行会被当成旁白。'));
        continue;
      }
      const value = rec.value || '';
      // 词表类判定：matchTable 认不出的才报；文案用 resolveTable 说清「解析器实际会当成什么」
      const vocab = (table, val, kind, available, fallback) => {
        if (!val || matchTable(table, val)) return;
        const r = resolveTable(table, val);
        const what = r.mode === 'fuzzy'
          ? `解析器会把它当成「${table[r.key].label}」`
          : `解析器会回落到「${fallback}」`;
        issues.push(issue('warning', 'W101', rec.line,
          `未识别的${kind}「${val}」：${what}。`,
          `可用${kind}：${available}。`));
      };
      if (key === '场景' || key === '分镜') {
        const parts = value.split(/[|｜,，\s]+/).filter(Boolean);
        if (parts[0]) {
          if (!matchTable(SCENES, parts[0]) && resolveTable(SCENES, parts[0]).mode === 'none') {
            issues.push(issue('error', 'E102', rec.line,
              `未识别的场景「${parts[0]}」。可用场景：${SCENE_LIST}。`,
              '请改成上面列出的场景名；否则解析器会直接拒绝这个剧本。'));
          } else {
            vocab(SCENES, parts[0], '场景', SCENE_LIST, '教室');
          }
        }
        if (parts[1]) vocab(TIMES, parts[1], '时段', '黄昏 / 白天 / 夜晚 / 火夜', '黄昏');
        if (parts[2]) vocab(CAMS, parts[2], '镜头', '远景 / 中景 / 近景 / 特写', '中景');
      }
      if (key === '镜头') vocab(CAMS, value, '镜头', '远景 / 中景 / 近景 / 特写', '中景');
      if (key === '姿态' || key === '情绪') {
        const parts = value.split(/[|｜]/).map((x) => x.trim()).filter(Boolean);
        const pose = parts.length > 1 ? parts[1] : parts[0];
        vocab(POSES, pose, '姿态', '自然 / 开心 / 难过 / 生气 / 惊讶 / 疲惫 / 沉思', '自然');
      }
      if (key === '动作') vocab(ACTS, value, '动作', '站立 / 行走 / 坐下 / 转身 / 低头 / 抬头', '站立');
      if (key === '视角' || key === '机位') vocab(VIEWS, value, '视角', '常规 / 过肩 / 背影', '常规');
      if (key === '出场' || key === '登场') {
        for (const n of value.split(/[|｜、,，]/).map((x) => x.trim()).filter(Boolean)) {
          if (!scan.chars.has(n)) {
            issues.push(issue('warning', 'W104', rec.line,
              `「【出场：${n}】」里的「${n}」未在角色表中声明，该出场指令不会生效。`,
              '请在「角色：」块里补上这一行，或改对名字。'));
          }
        }
      }
      continue;
    }

    if (rec.kind === 'charRow') {
      const rec2 = scan.chars.get(rec.text.split('|')[0].trim());
      const cols = rec2 ? rec2.cols : rec.text.split('|').map((x) => x.trim());
      if (cols.length !== 5) {
        issues.push(issue('warning', 'W105', rec.line,
          `角色行有 ${cols.length} 列，规范是 5 列（名字 | 性别 | 发型 | 衣色 | 模型）。`,
          '补齐或删掉多余的分隔符；第 5 列（模型）留空表示交给系统分配。'));
      }
      if (cols[4] && !matchModel(cols[4])) {
        issues.push(issue('warning', 'W102', rec.line,
          `未识别的模型「${cols[4]}」，会按性别回落外观。`,
          '请填 assets/models 里已有的模型名（如 少年 / 少女（2）/ 画师少年）。'));
      }
      continue;
    }

    if (rec.kind === 'choice') {
      if (rec.value === null) {
        issues.push(issue('error', 'E105', rec.line,
          '选项行缺少落点，这一行会被当成旁白，选项凭空消失。',
          '正确写法：> 追问磁带 -> 追问分支'));
        continue;
      }
      if (!labels.has(rec.value)) {
        issues.push(issue('error', 'E103', rec.line,
          `选项指向了不存在的标签「${rec.value}」。`,
          `请检查 [${rec.value}] 是否已定义。`));
      }
      continue;
    }

    if (rec.kind === 'jump') {
      if (!labels.has(rec.value)) {
        issues.push(issue('error', 'E103', rec.line,
          `跳转指向了不存在的标签「${rec.value}」。`,
          `请检查 [${rec.value}] 是否已定义。`));
      }
      continue;
    }

    if (rec.kind === 'say') {
      const dm = rec.text.match(/^([^\s:：【】\[\]>]{1,8})[（(][^）)]{1,40}[)）][:：]/);
      const dm2 = dm ? null : rec.text.match(/^([^\s:：【】\[\]>]{1,8})[:：]/);
      const who = dm ? dm[1].trim() : (dm2 ? dm2[1].trim() : null);
      if (who && who !== '旁白' && !scan.chars.has(who)) {
        issues.push(issue('warning', 'W103', rec.line,
          `说话人「${who}」未在角色表中声明。`,
          '若这是错别字请改正；若确实要临时出场，也建议在角色表里补上。'));
      }
      continue;
    }
  }

  if (!scan.sawScene) {
    issues.push(issue('warning', 'W107', 1,
      '全文没有任何场景指示，开场会被强行补成「教室 · 黄昏 · 中景」。',
      '请在开头加一行【场景：教室 | 黄昏 | 远景】。'));
  }
  if (!scan.sawEnd) {
    issues.push(issue('warning', 'W108', scan.lines.length ? scan.lines[scan.lines.length - 1].line : 1,
      '结尾没有显式的【结束】，引擎会自动补一个收尾。',
      '建议在末尾写一行【结束】。'));
  }
  return issues;
}
```

把 `lintText` 改成：

```js
export function lintText(text, fileName = '') {
  const scan = scanText(text);
  const issues = applyTextRules(scan);
  return {
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
    scan,
  };
}
```

- [ ] **Step 4: 写样本文件**

`tests/fixtures/lint/bad-text-level.txt`：

```
标题：写坏的样本
简介：故意写坏，用来测行号。

角色：
阿蓝 | 男 | 短发 | 白 | 少年
小葵 | 女 | 长发

【场景：教室 | 黄昏 | 远景】
【特写：手】
阿蓝：今天也没人。
【出场：阿蓝|小葵】
【镜头：超特写】
> 只有选项没有落点
-> 不存在的标签
【结束】
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test tests/lint.test.mjs`
Expected: PASS，Task 1 的 7 个 + 本任务 12 个用例全绿。

- [ ] **Step 6: 提交**

```bash
git add tools/lint.js tests/lint.test.mjs tests/fixtures/lint/bad-text-level.txt
git commit -m "feat(lint): 12 条文本级规则"
```

---

### Task 3: 4 条控制流规则与解析器交叉验证

> **修订（2026-11-24，Task 3 两轮审阅后）** —— 下列裁决已落到 `tools/lint.js`，本节代码块里「按内容行序号相邻分组」的建图写法**已作废**，以实现为准：
> 1. **选项组按解析器的 `flushChoices()` 调用点分组，不按行相邻**：`【姿态/情绪】【动作】【视角/机位】` 五类指示**不断开**选项组，且会**先于**待定选项组入队；`【场景】【镜头】【出场】【清场】【结束】【标签】【跳转】【台词】【旁白】` 会 flush（先压待定选项组，再压当前行）。
> 2. **选项组节点是延迟 push 的**：节点序列 = 解析器的 `nodes` 入队顺序；可达性与标签落点都按**节点下标**推导，不按源行相邻。标签落点 = 标签行处「已入队节点数」（解析器 `finalize` 补场景节点的统一平移不改变相对关系）。
> 3. **E106 的行号一律按源行号升序**：节点序 ≠ 源行序，`it.line` 必须是区间内最小的源行号。
> 4. **断链（落点标签不存在）时整个文件不判 E106**：解析器会拒绝该剧本，此时说「走不到」是误导；这是本工具的判断而非解析器语义（Task 5 文档要写明取舍）。
> 5. **`E100` 的去重依据是校验器自己算出的「断链」事实**，不依赖解析器错误文案的字样（文案一改去重就静默失效）。
> 6. **单独一个 `->` 行**（无落点）解析器按旁白处理：不报 E103「null」，改复用 `E105`（文案扩为「跳转行缺少落点」）；Task 5 需把 E105 定义从「选项缺落点」扩写为「控制流行缺少落点」。
> 7. **必须有一条 parity 差分用例**（固定种子、覆盖五类不 flush 指示、只断言「解析器可达 → 校验器不得说不可达」）：内置 15 章基线天然抓不到这类漂移。
> 8. **文件末尾的待定选项组**必须有用例覆盖（解析器在循环结束后会收尾 flush）。

**Files:**
- Modify: `tools/lint.js`
- Modify: `tests/lint.test.mjs`
- Create: `tests/fixtures/lint/bad-control-flow.txt`
- Create: `tests/lint-parity.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `scanText`；Task 2 的 `issue()` 与规则函数。
- Produces: `lintText()` 的 issue 集合追加 `E106` `E107` `E108` `W106`，并在解析器抛错时追加 `E100`。

- [ ] **Step 1: 写失败测试**

在 `tests/lint.test.mjs` 追加：

```js
test('E106 不可达节点', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一', '-> 主线', '[主线]', '乙：二', '【结束】',
    '丙：这段永远走不到',
  ].join('\n'));
  const it = r.issues.find((i) => i.code === 'E106');
  assert.ok(it, '应报 E106');
  assert.equal(it.line, 9);
});

test('E107 回跳（跳到更早的标签）', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '[起点]', '甲：一', '-> 起点', '【结束】',
  ].join('\n'));
  const it = r.issues.find((i) => i.code === 'E107');
  assert.ok(it);
  assert.equal(it.line, 6);
});

test('E108 选项回指（落点在选项之前）', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '[起点]', '甲：一', '> 回头 -> 起点', '【结束】',
  ].join('\n'));
  const it = r.issues.find((i) => i.code === 'E108');
  assert.ok(it);
  assert.equal(it.line, 6);
});

test('W106 死标签（从未被引用）', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '[没人去]', '甲：一', '【结束】',
  ].join('\n'));
  const it = r.issues.find((i) => i.code === 'W106');
  assert.ok(it);
  assert.equal(it.line, 4);
});

test('E100 解析器交叉验证兜底（扫描器未覆盖的硬错误）', () => {
  // 没有任何台词或旁白：解析器会拒绝，扫描器本身不会报
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】');
  const it = r.issues.find((i) => i.code === 'E100');
  assert.ok(it, '应报 E100');
  assert.equal(it.severity, 'error');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/lint.test.mjs`
Expected: FAIL —— E106/E107/E108/W106/E100 断言失败。

- [ ] **Step 3: 实现控制流建图与 4 条规则**

在 `tools/lint.js` 中新增：

```js
/**
 * 控制流建图（行级，语义对齐 scripts/parser.js）：
 * - 标签 target = 其后第一个内容行
 * - 跳转行 -> 只走目标，不回落下一行
 * - 连续选项行合并成一个选项组；选项组只走各选项落点
 * - 普通内容行 -> 下一行内容行
 * - 【结束】/【完】 无后继
 */
function buildGraph(scan) {
  // 只有「故事行」才是节点：meta / charRow / label 在解析器里不产生节点
  const content = scan.lines.filter((l) => STORY_KINDS.has(l.kind));
  const labels = new Map(scan.labels.map((l) => [l.name, l]));
  const succ = new Map();          // line -> number[]（后继行号）
  const groups = [];               // 选项组
  for (let i = 0; i < content.length; i++) {
    const rec = content[i];
    const next = content[i + 1];
    if (rec.kind === 'jump') {
      const lab = labels.get(rec.value);
      succ.set(rec.line, lab && lab.targetLine ? [lab.targetLine] : []);
      continue;
    }
    if (rec.kind === 'choice') {
      succ.set(rec.line, []);   // 选项组的后继稍后按组统一覆盖
      continue;
    }
    if (rec.kind === 'dir' && (rec.name === '结束' || rec.name === '完')) {
      succ.set(rec.line, []);
      continue;
    }
    succ.set(rec.line, next ? [next.line] : []);
  }

  // 选项组：在「内容行序列」里连续的 choice 行合并为一个节点
  // 注意：解析器先 skip 空行再判断，所以空行分隔的两条选项属于同一个选项组，
  // 必须按内容行序号相邻来判断，不能按行号连续（内置剧本里有 19 处空行分隔的选项组）。
  const groupOf = new Map();
  for (let i = 0; i < content.length; i++) {
    const rec = content[i];
    if (rec.kind !== 'choice') continue;
    let g = groups[groups.length - 1];
    if (!g || g.lastIndex !== i - 1) {
      g = { lines: [], firstLine: rec.line, lastLine: rec.line, lastIndex: i };
      groups.push(g);
    }
    g.lines.push(rec);
    g.lastLine = rec.line;
    g.lastIndex = i;
    groupOf.set(rec.line, g);
  }
  // 选项组的后继 = 各选项落点
  for (const g of groups) {
    const targets = [];
    for (const rec of g.lines) {
      const lab = labels.get(rec.value);
      if (lab && lab.targetLine) targets.push(lab.targetLine);
    }
    for (const rec of g.lines) succ.set(rec.line, targets);
  }

  const start = content.length ? content[0].line : null;
  const reachable = new Set();
  if (start !== null) {
    const stack = [start];
    while (stack.length) {
      const line = stack.pop();
      if (reachable.has(line)) continue;
      reachable.add(line);
      for (const nx of (succ.get(line) || [])) stack.push(nx);
    }
  }
  // 选项组是「一个节点」：组内任一行可达 → 整组可达（解析器把整组压成一个 choice 节点）
  for (const g of groups) {
    if (g.lines.some((rec) => reachable.has(rec.line))) {
      for (const rec of g.lines) reachable.add(rec.line);
    }
  }
  return { content, labels, succ, groups, groupOf, reachable, start };
}

/** 4 条控制流规则：E106 不可达、E107 回跳、E108 选项回指、W106 死标签 */
function applyFlowRules(scan) {
  const issues = [];
  const g = buildGraph(scan);
  const refs = new Set();
  for (const rec of g.content) {
    if (rec.kind === 'jump' && rec.value) refs.add(rec.value);
    if (rec.kind === 'choice' && rec.value) refs.add(rec.value);
  }

  // E106 不可达内容：按「连续内容行」切成一段段，每段一条 issue
  // （两处互不相邻的死分支要分成两条报，不能合并成一个大区间）
  const runs = [];
  let cur = null;
  for (const rec of g.content) {
    if (g.reachable.has(rec.line)) { cur = null; continue; }
    if (!cur) { cur = { first: rec.line, last: rec.line }; runs.push(cur); }
    else cur.last = rec.line;
  }
  for (const run of runs) {
    issues.push(issue('error', 'E106', run.first,
      run.first === run.last
        ? `第 ${run.first} 行这一段玩家永远走不到。`
        : `第 ${run.first}–${run.last} 行这一段玩家永远走不到。`,
      '检查附近的跳转：某个 -> 之后的内容不再顺序执行。'));
  }

  // E107 回跳 / E108 选项回指
  for (const rec of g.content) {
    if (rec.kind === 'jump') {
      const lab = g.labels.get(rec.value);
      if (lab && lab.targetLine && lab.targetLine <= rec.line) {
        issues.push(issue('error', 'E107', rec.line,
          `第 ${rec.line} 行跳回第 ${lab.targetLine} 行的标签「${rec.value}」，会形成死循环。`,
          '请改成跳向更靠后的标签。'));
      }
      continue;
    }
    if (rec.kind === 'choice') {
      const lab = g.labels.get(rec.value);
      const grp = g.groupOf.get(rec.line);
      if (lab && lab.targetLine && grp && lab.targetLine <= grp.firstLine) {
        issues.push(issue('error', 'E108', rec.line,
          `第 ${rec.line} 行的选项指向第 ${lab.targetLine} 行的标签「${rec.value}」，在它之前，点下去会原地打转。`,
          '请改成跳向更靠后的标签。'));
      }
      continue;
    }
  }

  // W106 死标签
  for (const lab of scan.labels) {
    if (!refs.has(lab.name)) {
      issues.push(issue('warning', 'W106', lab.line,
        `标签「${lab.name}」从未被引用。`,
        '如果这是废弃的分支，请把标签和它下面的内容一起删掉。'));
    }
  }
  return issues;
}

/** 解析器交叉验证：把 parseScriptText 抛出的致命错误兜底成 E100 */
function applyParserCheck(text, fileName, issues) {
  try {
    parseScriptText(text, fileName);
    return;
  } catch (e) {
    const msg = String((e && e.message) || e);
    const m = msg.match(/第\s*(\d+)\s*行/);
    if (m) {
      const line = Number(m[1]);
      // 该行已经有更具体的 error 报告时不重复报
      if (issues.some((i) => i.line === line && i.severity === 'error')) return;
      issues.push(issue('error', 'E100', line,
        `解析器拒绝了这个剧本：${msg}`,
        '按提示修正后重新校验。'));
      return;
    }
    // 解析器的错误没有行号（如「没有读取到任何台词或旁白」），一律记在第 1 行
    issues.push(issue('error', 'E100', 1,
      `解析器拒绝了这个剧本：${msg}`,
      '按提示修正后重新校验。'));
  }
}
```

把 `lintText` 改成：

```js
export function lintText(text, fileName = '') {
  const scan = scanText(text);
  const issues = applyTextRules(scan).concat(applyFlowRules(scan));
  applyParserCheck(text, fileName, issues);
  return {
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
    scan,
  };
}
```

- [ ] **Step 4: 写样本文件**

`tests/fixtures/lint/bad-control-flow.txt`：

```
标题：控制流写坏的样本
简介：故意制造不可达、回跳、回指与死标签。

角色：
阿蓝 | 男 | 短发 | 白 | 少年

【场景：教室 | 黄昏 | 远景】
[起点]
阿蓝：先说一句。
> 回头 -> 起点
[没人去的分支]
阿蓝：这段没人能走到。
-> 起点
【结束】
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test tests/lint.test.mjs`
Expected: PASS，Task 1/2/3 全部用例通过。

- [ ] **Step 6: 提交**

```bash
git add tools/lint.js tests/lint.test.mjs tests/fixtures/lint/bad-control-flow.txt
git commit -m "feat(lint): 控制流规则与解析器交叉验证"
```

---

### Task 4: CLI 入口

> **修订（2026-11-24，Task 3 审阅后）** —— 下列裁决优先于本节代码块：
> 1. **JSON 源必须显式分流**：本节代码块对每个目标文件直接调 `lintText`，但 `.json` 剧本在解析器里是节点格式（`parseScriptText` 用 `trimmed.startsWith('{')` 分流），行级扫描会把整份 JSON 拆成满屏假 `say`/E101。CLI 遇到 JSON 输入（扩展名 `.json` 或首字符 `{`）应给出中文提示并**退出码 2**，不调 `lintText`。
> 2. **`--strict` 的用例必须真的能区分 strict 与默认**：本节 `--strict` 用例拿 `bad-control-flow.txt`（3 error + 1 warning）做样本，无论 strict 与否都是退出码 1，证明不了 strict 生效。要另加一个**只有 warning、没有 error** 的样本，断言「默认退出码 0 / `--strict` 退出码 1」。
> 3. `--json` 的 stdout 必须是**纯 JSON**（诊断信息一律走 stderr）。

**Files:**
- Modify: `tools/lint.js`
- Modify: `tests/lint.test.mjs`
- Create: `tests/fixtures/lint/warn-only.txt`

**Interfaces:**
- Consumes: Task 1–3 的 `lintText` / `lintBuiltin`。
- Produces: CLI 行为 —— `node tools/lint.js <文件...>`、`--builtin`、`--json`、`--strict`；退出码 0/1/2。

- [ ] **Step 1: 写失败测试（子进程调用 CLI）**

在 `tests/lint.test.mjs` 追加：

```js
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const runCli = (args) => spawnSync(process.execPath, ['tools/lint.js', ...args], {
  cwd: ROOT, encoding: 'utf8',
});

test('CLI 对干净样本退出码 0', () => {
  const r = runCli(['tests/fixtures/lint/clean.txt']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /通过|没有错误/);
});

test('CLI 对写坏样本退出码 1 并打印行号', () => {
  const r = runCli(['tests/fixtures/lint/bad-text-level.txt']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /第 \d+ 行/);
  assert.match(r.stdout, /E10\d/);
});

test('CLI --json 输出可解析的 JSON', () => {
  const r = runCli(['tests/fixtures/lint/bad-text-level.txt', '--json']);
  assert.equal(r.status, 1);
  const data = JSON.parse(r.stdout);
  assert.equal(data.ok, false);
  assert.ok(data.issues.length > 0);
  assert.ok(data.issues.every((i) => i.code && i.severity && typeof i.line === 'number'));
  assert.ok(data.summary.errors > 0);
});

test('CLI --builtin 对内置 15 章零 issue', () => {
  const r = runCli(['--builtin', '--json']);
  assert.equal(r.status, 0);
  const data = JSON.parse(r.stdout);
  assert.deepEqual(data.issues, []);
});

test('CLI 用法错误退出码 2', () => {
  const r = runCli(['--不存在的参数']);
  assert.equal(r.status, 2);
});

test('CLI --strict 把 warning 也算失败', () => {
  const r = runCli(['tests/fixtures/lint/clean.txt', '--strict']);
  assert.equal(r.status, 0);
  const r2 = runCli(['tests/fixtures/lint/bad-control-flow.txt', '--strict']);
  assert.equal(r2.status, 1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/lint.test.mjs`
Expected: FAIL —— CLI 尚不存在，退出码与输出不匹配。

- [ ] **Step 3: 实现 CLI**

在 `tools/lint.js` 末尾写入：

```js
/* ---------------- CLI ---------------- */

function formatText(result, files) {
  const lines = [];
  const byFile = new Map();
  for (const it of result.issues) {
    const key = it.file || '(未命名)';
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(it);
  }
  for (const [file, list] of byFile) {
    lines.push(file);
    for (const it of list) {
      lines.push(`  第 ${it.line} 行  ${it.code} ${it.message}`);
      if (it.hint) lines.push(`      提示：${it.hint}`);
    }
  }
  const s = result.summary;
  if (!result.issues.length) {
    lines.push(`通过：${files} 未发现问题。`);
  } else {
    lines.push(`共 ${s.errors} 个错误，${s.warnings} 个警告（${files}）。`);
  }
  return lines.join('\n');
}

function formatJson(result, files) {
  return JSON.stringify({
    ok: result.summary.errors === 0,
    files,
    issues: result.issues,
    summary: result.summary,
  }, null, 2);
}

export function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const strict = args.includes('--strict');
  const targets = args.filter((a) => !a.startsWith('--'));
  const unknown = args.filter((a) => a.startsWith('--') && !['--json', '--strict', '--builtin'].includes(a));
  if (unknown.length) {
    console.error(`未知参数：${unknown.join(' ')}\n用法：node tools/lint.js <文件...> | --builtin [--json] [--strict]`);
    return 2;
  }
  const wantBuiltin = args.includes('--builtin');
  if (!wantBuiltin && !targets.length) {
    console.error('用法：node tools/lint.js <文件...> | --builtin [--json] [--strict]');
    return 2;
  }

  const issues = [];
  const files = [];
  if (wantBuiltin) {
    const r = lintBuiltin();
    issues.push(...r.issues);
    files.push(`内置 ${loadBuiltinScripts().length} 章`);
  }
  for (const f of targets) {
    if (!existsSync(f)) {
      console.error(`文件不存在：${f}`);
      return 2;
    }
    const r = lintText(readFileSync(f, 'utf8'), f);
    issues.push(...r.issues.map((i) => ({ ...i, file: f })));
    files.push(f);
  }

  const result = {
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
  };
  console.log(json ? formatJson(result, files) : formatText(result, files));
  const failed = result.summary.errors > 0 || (strict && result.summary.warnings > 0);
  return failed ? 1 : 0;
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(main(process.argv));
```

并在文件顶部补上 `import { readFileSync, existsSync } from 'node:fs';`、`import { fileURLToPath } from 'node:url';` 与 `import path from 'node:path';`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/lint.test.mjs`
Expected: PASS，全部用例通过。

- [ ] **Step 5: 手动跑一遍 CLI 确认输出可读**

```bash
node tools/lint.js --builtin
node tools/lint.js tests/fixtures/lint/bad-text-level.txt
node tools/lint.js tests/fixtures/lint/clean.txt; echo "exit=$?"
```

Expected: 第一条输出「通过：内置 15 章 未发现问题。」；第二条列出带行号的问题；第三条 `exit=0`。

- [ ] **Step 6: 提交**

```bash
git add tools/lint.js tests/lint.test.mjs
git commit -m "feat(lint): CLI 入口、JSON 输出与退出码"
```

---

### Task 5: 内置回归、运行时零影响断言与文档

**Files:**
- Modify: `tests/lint.test.mjs`
- Modify: `README.md`
- Create: `docs/mumu-lint-rules.md`

**Interfaces:**
- Consumes: Task 1–4 的全部导出。
- Produces: 面向作者的规则码表文档与 README 使用说明。

- [ ] **Step 1: 写失败测试**

在 `tests/lint.test.mjs` 追加：

```js
import { readdirSync } from 'node:fs';

test('内置 15 章零 issue', () => {
  const r = lintBuiltin();
  assert.deepEqual(r.issues.map((i) => `${i.code} ${i.file} ${i.line}: ${i.message}`), []);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.warnings, 0);
});

test('scripts/ 不得引用 tools/lint.js（离线工具不进运行时）', () => {
  const dir = new URL('../scripts/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.equal(src.includes('tools/lint'), false, `scripts/${f} 不应引用 tools/lint.js`);
  }
});

test('index.html 不应引用 tools/lint.js', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html.includes('tools/lint'), false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/lint.test.mjs`
Expected: 三条断言全部通过（若「内置 15 章零 issue」失败，说明规则在真实语料上误报 —— 修规则而不是放宽断言）。

- [ ] **Step 3: 修到全绿**

Run: `node --test`
Expected: 全仓库测试通过，且 `node tools/lint.js --builtin` 输出「通过」。

- [ ] **Step 4: 写规则码表文档**

创建 `docs/mumu-lint-rules.md`，内容为一张表，列出全部 16 个规则码 + `E100` 兜底码：码、级别、含义、典型症状、怎么改。文案直接取自工具里的 `message` / `hint`，保持一致。文档开头写清楚用法：

```bash
node tools/lint.js 剧本.txt        # 校验单个文件
node tools/lint.js --builtin      # 校验内置 15 章
node tools/lint.js --builtin --json   # 机器可读输出
node tools/lint.js 剧本.txt --strict  # 把警告也算失败
```

并注明退出码 0 / 1 / 2 的含义。

- [ ] **Step 5: README 加「内容校验」小节**

在 `README.md` 的「运行」小节之后插入：

```markdown
## 内容校验

剧本写完可以用零依赖的校验器自检（不参与游戏运行）：

```bash
node tools/lint.js 剧本.txt        # 校验单个 .txt / .md 剧本
node tools/lint.js --builtin      # 校验内置 15 章
node tools/lint.js --json         # 机器可读输出
```

每条问题都带**行号 + 规则码 + 原因 + 修法提示**；退出码 0 = 通过，1 = 有错误，2 = 用法错误。
规则码表见 [docs/mumu-lint-rules.md](docs/mumu-lint-rules.md)。
```

- [ ] **Step 6: 全量验证**

```bash
node --test
node tools/lint.js --builtin
node tools/lint.js tests/fixtures/lint/bad-text-level.txt; echo "exit=$?"
```

Expected: `node --test` 全绿；`--builtin` 输出「通过」；坏样本退出码 1。

- [ ] **Step 7: 提交**

```bash
git add tests/lint.test.mjs README.md docs/mumu-lint-rules.md
git commit -m "docs(lint): 规则码表、内置回归与运行时零影响断言"
```

---

## 附：任务依赖关系

| 任务 | 依赖 | 交付物 |
| --- | --- | --- |
| Task 1 扫描器与匹配器 | — | `matchTable` / `scanText` / `lintText` 骨架 |
| Task 2 文本级规则 | Task 1 | 12 条文本级规则 + 12 个用例 |
| Task 3 控制流规则 | Task 1、2 | 4 条控制流规则 + E100 兜底 |
| Task 4 CLI | Task 1–3 | CLI、JSON 输出、退出码 |
| Task 5 回归与文档 | Task 1–4 | 内置零 issue 断言、规则码表、README |
