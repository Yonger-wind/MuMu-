# P2-4 终幕结算卡 · 设计

日期：2026-11-24
状态：已确认（roadmap §4 P2-4，比赛版降级为「只做最后一幕结算」）

## 1. 问题与目标

走到一章结尾时，现在只有一句「—— 故事暂时落幕 ——」和几个按钮。玩家记不住这一程去了哪里、说过哪句话、做过什么选择，也没有可以直接截图分享的东西。

目标：在**最后一章**（曲目终章，或独立/自制剧本的唯一一章）结束页，直接显示一张结算卡：

- 这一幕：时间 + 场景（例：`黄昏 · 教室`）
- 一句台词：本程最后一句台词/旁白
- 你的选择：本程所有选项，按先后用 `→` 连接
- 获得卡牌：本次结算发出的角色卡（名称 + 星数），没有则不显示该行

非终章（还有下一章）**不显示**结算卡，保持原来的「继续下一章」节奏。结算卡与结局 ID 无关：同一条 end 分支、不同选择也能正常出卡。

## 2. 范围

做：

- `scripts/finale.js`：纯函数 `buildFinale(script, summary, { hasNext, cards })`，输入引擎摘要，输出可渲染数据；无 DOM。
- `scripts/engine.js`：记录 `lastLine`（最后一句 say，含画外音/旁白），`endOptions(script, summary)` 追加第二个参数；新增只读 getter `choices`。
- `index.html`：在 `#dlg-text` 与 `#dlg-choices` 之间加 `#dlg-finale` 容器（默认 `hidden`）。
- `scripts/main.js`：`endOptions` 里计算是否终章，调用 `buildFinale`，渲染到 `#dlg-finale`；`play()` / `leaveStage()` 清理。
- `styles/extensions.css`：`.mumu-finale*` 样式（桌面 + 390×844 移动端）。
- 测试：`tests/finale.test.mjs`（纯函数）、`tests/engine-state.test.mjs`（摘要与 getter）。

不做：

- 不改剧情、不改章节数量、不新增结局 ID。
- 不改图鉴发放规则与存储键。
- 不做分享图导出/截图生成（浏览器自带截图即可）。
- 不动 `scene.js` / `portraits.js` / `parser.js` 的解析行为。

## 3. 行为定义

### 3.1 是否显示

`hasNext = nextChapterOf(script) != null`。`hasNext === true` → 返回 null，不显示。
其余情况都显示：终章、单章自制剧本、导出的单章包。

### 3.2 数据来源

引擎在 `end` 节点调用 `endOptions(script, summary)`：

```js
{
  scene: 'classroom', time: 'dusk', cam: 'mid',
  choices: ['追问', '把歌听完'],
  line: { who: '白石葵', text: '……' } | null,
  ending: 'left' | ''
}
```

- `lastLine` 在每次 `say` 时更新；`voice` 行的 who 为 `${who}（${voice}）`；旁白 who 为空串。
- `start()` 重置 `lastLine = null`；换场景不清空（要的是全章最后一句）。
- 旧调用方（测试/第三方）只传一个参数时行为不变。

### 3.3 文案规则

- 这一幕：`TIMES[time].label · SCENES[scene].label`；缺表时退回 `故事尽头`。
- 一句台词：优先 `line.text`；有 who 时显示「who：text」，旁白直接显示 text。没有台词则整行隐藏。
- 你的选择：`choices.join(' → ')`；没有选择时显示「没有分歧，一路读到结尾」。
- 获得卡牌：`cards` 非空时逐个显示 `名字 · N★`；为空则整行隐藏。
- 标题：有 `seriesTitle` 时用曲名做主标题、`第 N 章` 做副标题；单章作品直接用剧本标题，不显示副标题。

### 3.4 渲染与样式

- `#dlg-finale` 是对话框内的卡片，不遮挡立绘；位于落幕文案下方、按钮上方。
- 近黑半透明底 + 暖橙细边 + 大字重标题，保持暮幕现有色调；不用亮色贴纸感。
- 窄屏（≤560px）行标签缩到 52px、字号降到 12px；卡片最大高度 `min(38vh, 300px)`，超出内部滚动。
- 进入舞台/离开舞台/开新章时清空并隐藏。

## 4. 边界与兼容

- 自动存档：结算卡只在内存渲染，不写入快照；刷新后从存档回到 end 前一句，再次走到 end 会重新生成。
- 图鉴发放仍在 `endOptions` 内先执行；`cards` 只取本轮 `grant.cards`，`alreadyGranted` 时不重复显示。
- 旧存档/旧剧本无 `ending` 字段：`ending` 为空串，不影响结算卡。
- 控制台不得报错；不新增 404。

## 5. 验收

1. 《蝉鸣止于逢魔时》第四章、各曲目终章走到结尾：出现结算卡，四个字段按实际内容显示；没有「继续下一章」。
2. 第一至三章结尾：**不出现**结算卡，仍有「继续下一章」。
3. 一条含画外音结尾的终章（如第四章读信）最后一句正确显示为画外音。
4. 桌面 1280×800 与移动 390×844 截图：卡片不溢出、不遮挡按钮，字号可读。
5. `node --test tests/*.test.mjs` 全绿；`node tools/lint.js --builtin` 无错误。
6. 控制台无错误、无 404。
