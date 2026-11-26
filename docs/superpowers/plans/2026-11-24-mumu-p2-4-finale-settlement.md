# P2-4 终幕结算卡 · 实施计划

> **For agentic workers:** 本计划按任务顺序执行；每个任务结束跑对应测试。规模小，按 bounded 流程在本会话内实现，不拆子代理。

**Goal:** 终章结束时在对话框内显示「这一幕 / 一句台词 / 你的选择 / 获得卡牌」结算卡。

**Architecture:** 引擎把结束现场摘要作为第二参数交给 `endOptions`；纯函数 `buildFinale` 把摘要转成展示数据；`main.js` 判断是否终章后渲染到 `#dlg-finale`；样式只进 `styles/extensions.css`。

**Tech Stack:** 原生 ES Modules、Node 内置测试运行器、现有 Canvas/DOM 渲染。

**Spec:** `docs/superpowers/specs/2026-11-24-mumu-p2-4-finale-settlement-design.md`

## Global Constraints

- 零依赖、零构建；不新增第三方包。
- 不改 `scripts/scene.js`、`scripts/portraits.js`、`scripts/parser.js` 的解析逻辑。
- 用户可见文案全部中文；不出现英文报错。
- `index.html` 样式表仍只有 main → tokens → extensions 三条。
- 新 CSS 选择器一律 `.mumu-` 前缀。
- 旧剧本、旧存档（`mumu.saves.v1`）必须照常播放。
- 不执行 git commit / push（用户未要求）。

---

### Task 1: 结算数据纯函数

**Files:**
- Create: `scripts/finale.js`
- Test: `tests/finale.test.mjs`

**Interfaces:**
- Produces: `buildFinale(script, summary, { hasNext = false, cards = [] } = {})` → `null | { title, subtitle, where, line, choices, cards }`
  - `line`: `null | { who, text }`
  - `choices`: `string[]`（可能为空数组）
  - `cards`: `{ key, name, stars }[]`

- [x] Step 1: 写失败测试：终章返回完整字段、非终章返回 null、无台词/无选择/无卡牌的退化、未知场景回退。
- [x] Step 2: 运行 `node --test tests/finale.test.mjs`，确认失败（模块不存在）。
- [x] Step 3: 实现 `finale.js`（只读 `SCENES` / `TIMES` 标签）。
- [x] Step 4: 再跑测试，全绿。

### Task 2: 引擎摘要

**Files:**
- Modify: `scripts/engine.js`
- Test: `tests/engine-state.test.mjs`

**Interfaces:**
- `endOptions(script, summary)`；summary 见 spec §3.2。
- 新增只读 `get choices()`、`get lastLine()`。

- [x] Step 1: 加测试：走到 end 时 `endOptions` 收到 scene/time/choices/line/ending；画外音 who 带括号；start 后 lastLine 为空。
- [x] Step 2: 跑测试确认失败。
- [x] Step 3: 实现 `lastLine` 记录、summary 组装、getter；`say` 的 voice/普通/旁白三条路径都更新。
- [x] Step 4: 跑测试全绿（含原有 382 条）。

### Task 3: 页面渲染与样式

**Files:**
- Modify: `index.html`（`#dlg-finale`）
- Modify: `scripts/main.js`（`endOptions` / `renderFinale` / `play` / `leaveStage`）
- Modify: `styles/extensions.css`

- [x] Step 1: `index.html` 插入 `<div class="mumu-finale" id="dlg-finale" hidden></div>`。
- [x] Step 2: `main.js` 在 `endOptions` 内：先发卡，再算 `next`，`buildFinale(sc, summary, { hasNext: !!next, cards: grant.cards })`，非空则渲染。
- [x] Step 3: `renderFinale` 用 DOM API 创建节点（不拼 HTML），`play()` 与 `leaveStage()` 清理。
- [x] Step 4: `extensions.css` 增加 `.mumu-finale*`，含移动端与最大高度滚动。
- [x] Step 5: `node tools/lint.js --builtin`、`node --test tests/*.test.mjs`。

### Task 4: 真实浏览器验收

- [x] Step 1: `PORT=5199 node serve.js`，CDP 截图桌面 1280×800 终章结算卡。
- [x] Step 2: 390×844 移动端截图。
- [x] Step 3: 第一至三章结尾确认无结算卡、仍有「继续下一章」；控制台无错误、无 404。
- [x] Step 4: 把验证结论写回 README / AGENTS 自检项（只在需要时）。
