# 暮幕 P0-4 扩展点契约 · 设计

- 版本：v1.0
- 日期：2026-11-24
- 状态：范围已经用户拍板（接入深度＝契约+占位自测；令牌＝新增语义层、main.css 不动；素材约定＝仓库目录+.mumu 包内规范）
- 上游：`docs/superpowers/specs/2026-11-23-mumu-local-creation-platform-roadmap.md` §4 P0-4、§9 接入契约
- 口径：零依赖、零构建；不改 `scripts/parser.js` / `scripts/engine.js` / `scripts/scene.js` / `scripts/prop.js` / `scripts/portraits.js` 的既有行为；页面视觉零变化

---

## 1. 目标与非目标

### 1.1 目标

P0-4 只交付**三份可被第三方代码消费的契约**，并用纯逻辑测试锁住：

1. **卡牌特殊检视注册表**（`scripts/cards/`）：新增一张卡的检视实现 = 新增一个模块文件 + 在数据清单里加一条，不改核心代码。
2. **UI 挂载点与设计令牌**：`styles/tokens.css` 语义令牌层 + 命名挂载点（`data-slot`）+ 挂载 API（`scripts/ui/slots.js`），第三方 UI 以「新增文件 + 挂到命名槽」接入。
3. **用户素材目录约定**：仓库内目录与 `.mumu` 包内 `assets[]` 的 role / 路径规则写进文档，导入行为不变。

### 1.2 非目标（明确不做）

- 不实现图鉴容器、抽取、卡面查看器 UI（P4-3 / P4-4 / P4-5 的范围）。
- 不把 `holo-card/`、`script-select/` 两个原型接进主页面（P4-5 / P6-3 再接入）。
- 不改 `main.css` 现有变量与样式；不迁移 `:root`。
- 不改 `.mumu` 导入导出逻辑；新增 role 只写文档、不在导入端落地存储。
- 不实现用户上传素材的运行时加载器（P1-3 的封面 / P5-4 的图片立绘再做）。
- 不接 CI、不引入构建步骤、不加任何第三方依赖。

### 1.3 完成定义（对应路线图 P0-4 一行）

- 第三方代码接入时**只需新增文件 + 改数据清单 / 挂到命名槽**，不需要改核心模块；
- 契约有可执行的测试（注册、清单校验、挂载、令牌完整性）；
- 页面视觉零变化（首页 / 舞台 / 弹窗截图对比）；
- 接口文档落盘（`docs/extension-contracts.md`），P0-6 写创作手册时直接引用。

---

## 2. 卡牌特殊检视注册表

### 2.1 模块边界

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `scripts/cards/registry.js` | 纯逻辑：注册 / 查询 / 列举检视实现；id 与函数校验 | 无（不碰 DOM） |
| `scripts/cards/loader.js` | 数据清单解析、动态 `import()` 并注册 | `registry.js` |
| `assets/cards/manifest.json` | 卡牌清单（P0-4 提交**空清单** `{"version":1,"cards":[]}`） | — |

`loader.js` **不被 `main.js` 导入**——没有图鉴容器时清单不加载，运行时零开销、零副作用。

### 2.2 注册表 API（`scripts/cards/registry.js`）

```js
export const CARD_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function validateCardKey(key);      // 不合法 → 抛中文 Error，返回 key

export function createInspectionRegistry(); // → { register, get, has, list }
// register(cardKey, inspect) → inspect；重复 key / 非函数 → 抛中文 Error
// get(cardKey) → inspect | null；has(cardKey) → boolean；list() → string[]（注册顺序）

export const cardInspections;              // 运行时的默认实例
export function registerCardInspection(cardKey, inspect);
export function getCardInspection(cardKey);
export function listCardInspections();
```

- **id 规则**：小写字母 / 数字开头，允许 `.` `_` `-`，最长 64 字符。与文件名 `<cardKey>.js` / `<cardKey>.png` 一一对应。
- **重复注册直接抛错**（不做「后写覆盖」）：同名卡两份实现意味着复制粘贴没改名，静默覆盖会把问题藏起来。错误文案为开发者可见的中文。
- **工厂 + 默认实例**：测试用 `createInspectionRegistry()` 拿干净实例；运行时用默认实例与便捷函数，两者同一套校验。

### 2.3 检视函数契约

```js
// 约定签名（由将来的卡面查看器 P4-5 调用，P0-4 只登记不调用）
// (host: HTMLElement, context: { cardKey: string, card: object }) => cleanup?: Function
```

- 注册表只保存函数引用，**从不自动调用**；挂载、卸载、异常兜底都由调用方（P4-5）负责。
- 返回清理函数是可选项；调用方在卸载时若拿到函数必须调用一次。
- P0-4 的测试只验证「登记 / 取回 / 重复拒绝」，不验证渲染。

### 2.4 卡牌清单与加载器（`scripts/cards/loader.js`）

清单结构（`assets/cards/manifest.json`）：

```json
{
  "version": 1,
  "cards": [
    { "key": "example", "title": "示例卡", "image": "assets/cards/example.png", "module": "scripts/cards/example.js" }
  ]
}
```

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `version` | 是 | 必须为 `1`；其他值 → 中文报错 |
| `cards` | 是 | 数组，可为空 |
| `cards[].key` | 是 | 通过 `validateCardKey`；清单内不可重复 |
| `cards[].module` | 是 | 非空字符串，必须以 `.js` 结尾 |
| `cards[].title` | 否 | 字符串；给图鉴展示用 |
| `cards[].image` | 否 | 字符串；包内 / 站点内相对路径，给卡面图用 |

API：

```js
export function parseCardManifest(input);   // → 校验后的 entries[]；任何问题抛中文 Error（带第 N 张卡的定位）
export async function applyCardManifest(manifest, { loadModule, registry = cardInspections });
// 逐条 await loadModule(entry.module)（默认 (p) => import(p)），取模块的具名导出 inspect 并注册；
// 模块缺少 inspect → 中文 Error；返回已注册的 key 数组
export async function loadCardManifest(url = './assets/cards/manifest.json', opts);
// fetch + JSON.parse + applyCardManifest；P0-4 不接到任何页面
```

- **只认具名导出 `inspect`**，不认 default 包装，避免两种写法并存。
- `loadModule` 可注入：测试用假模块，不落盘临时 js 文件。
- 加载顺序 = 清单顺序；中途失败即抛错，已注册的条目保留（文档写明，调用方可重试前自行清理）。

---

## 3. UI 挂载点与设计令牌

### 3.1 命名挂载点

| 槽名 | 页面位置 | 用途 |
| --- | --- | --- |
| `home` | `#home` | 首页（品牌角、按钮组之外的自定义模块） |
| `stage` | `#stage` | 剧情舞台（HUD、夜间提示等） |
| `modal` | `#modal-root` | 弹层内容区 |
| `overlay` | `#ui-layer`（**新增空层**） | 全屏悬浮层（卡面查看器、抽卡动画等） |

不设 `toast` 槽：`#toast` 的文本由 `main.js` 的轻提示队列整体覆写，往里挂子元素会被下一条提示清掉，属于陷阱而非契约。

`index.html` 的改动只有三类，均为零视觉：给 `#home` / `#stage` / `#modal-root` 各加一个 `data-slot="…"` 属性；在 `#modal-root` 前加一个空的 `<div id="ui-layer" class="mumu-ui-layer" data-slot="overlay"></div>`；`<head>` 里在 main.css 之后追加 `tokens.css` 与 `extensions.css` 两个 `<link>`。

### 3.2 挂载 API（`scripts/ui/slots.js`）

```js
export const SLOT_NAMES;                    // Object.freeze(['home','stage','modal','overlay'])
export function findSlot(name, root = document);  // → Element | null；未知槽名抛中文 Error
export function mountTo(name, node, { root } = {});
// → { node, remove() }；找不到槽位 → 中文 Error（提示应带哪个 data-slot）
```

- `findSlot` 用 `root.querySelector('[data-slot="<name>"]')`，不依赖 id，便于将来换结构。
- `mountTo` 只做 `appendChild`，不注入样式、不绑定事件；返回的 `remove()` 幂等（已移除不报错）。
- 未知槽名一律抛错（拼错槽名应当立刻暴露，而不是静默挂不上）。

### 3.3 设计令牌（`styles/tokens.css`）

只新增 `--mumu-*` 语义层，**每个颜色 / 字体令牌都带 `var(--现有变量, 字面量兜底)`**，main.css 名称变了也不会静默失效：

```css
:root {
  /* 颜色 */
  --mumu-color-ink: var(--ink, #2a1f33);
  --mumu-color-cream: var(--cream, #fff4e6);
  --mumu-color-amber: var(--amber, #ff9d57);
  --mumu-color-rose: var(--rose, #ff7a8a);
  --mumu-color-plum: var(--plum, #6b4a8f);
  --mumu-color-dusk: var(--dusk, #3a2a56);
  --mumu-color-night: var(--night, #1b1430);
  --mumu-color-glass: var(--glass, rgba(255,244,230,0.10));
  --mumu-color-glass-border: var(--glass-brd, rgba(255,244,230,0.28));
  --mumu-color-text-soft: var(--soft, rgba(255,244,230,0.72));
  /* 字体 */
  --mumu-font-serif: var(--serif, "Noto Serif SC", "Songti SC", "STSong", Georgia, serif);
  --mumu-font-sans: var(--sans, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif);
  /* 间距 / 圆角 */
  --mumu-space-xs: 4px;  --mumu-space-sm: 8px;  --mumu-space-md: 16px;
  --mumu-space-lg: 24px; --mumu-space-xl: 40px;
  --mumu-radius-sm: 8px; --mumu-radius-md: 12px; --mumu-radius-lg: 16px; --mumu-radius-pill: 999px;
  /* 层级：对齐 main.css 现有档位（modal-mask 60 / boot 90 / toast 100） */
  --mumu-z-modal: 60; --mumu-z-overlay: 70; --mumu-z-boot: 90; --mumu-z-toast: 100;
}
```

### 3.4 悬浮层样式（`styles/extensions.css`）

```css
.mumu-ui-layer {
  position: fixed; inset: 0;
  z-index: var(--mumu-z-overlay, 70);
  pointer-events: none;
}
.mumu-ui-layer > * { pointer-events: auto; }
```

空层零像素、不拦截点击；子元素默认恢复可交互。`extensions.css` 只允许新增 `.mumu-*` 命名空间下的规则，不得覆盖 main.css 既有类。

---

## 4. 用户素材目录约定

### 4.1 仓库内目录

| 资源 | 位置 | 约定 |
| --- | --- | --- |
| 彩色人物图鉴卡 | `assets/cards/<cardKey>.png` | 透明底；`cardKey` 与检视注册表、清单一致 |
| 卡牌清单 | `assets/cards/manifest.json` | §2.4 结构 |
| 卡牌检视实现 | `scripts/cards/<cardKey>.js` | 具名导出 `inspect` |
| 夜幕模型图 | `assets/images/night/<name>.png` | 缺失时由 P4-2 显示占位符 |
| 歌单 / 乐谱等既有素材 | `assets/images/`、`assets/models/` | 保持现状，不迁移 |

### 4.2 `.mumu` 包内 assets

补进 `docs/mumu-package-spec.md` §4.3：

- 新增**保留 role**：`cover`（既有）、`card`（卡面，路径建议 `assets/cards/<cardKey>.png`）、`night`（夜幕模型，路径建议 `assets/night/<name>.png`）。
- role 仍为自由字符串，不改变校验强度；未知 role 照常保留在 manifest 中。
- **现状说明**：导入时只有 `role === 'cover'`（或 `id === 'cover'`）的条目会转成 data URL；`card` / `night` 只随清单声明、暂不落地存储，落地读取留给 P4 的图鉴与夜幕功能。P0-4 不改 `package.js`。

---

## 5. 文件清单

**新增**

- `scripts/cards/registry.js`
- `scripts/cards/loader.js`
- `assets/cards/manifest.json`（空清单）
- `scripts/ui/slots.js`
- `styles/tokens.css`
- `styles/extensions.css`
- `docs/extension-contracts.md`（接口文档：注册表、清单、槽位、令牌、素材目录，含一个可抄的检视模块示例）
- `tests/cards.test.mjs`（注册表 + 清单解析 + 加载器）
- `tests/ui-slots.test.mjs`（槽位解析 / 挂载 / 令牌与 index.html 契约）

**修改**

- `index.html`：4 个 `data-slot` 属性 + `#ui-layer` 空层 + 2 个 `<link>`（零视觉）
- `docs/mumu-package-spec.md`：§4.3 增补保留 role 与路径约定（不改代码）
- `README.md`：目录结构补 `scripts/cards/`、`scripts/ui/`，加一行指向接口文档

**不动**：`scripts/parser.js`、`engine.js`、`scene.js`、`prop.js`、`portraits.js`、`package.js`、`main.js`、`main.css` 及全部既有测试。

---

## 6. 测试策略

全部用 Node 内置测试运行器（仓库根 `node --test`），零依赖：

| 测试点 | 断言 |
| --- | --- |
| id 校验 | 合法样例通过；大写 / 空格 / 中文 / 空串 / 65 字符 → 中文报错 |
| 注册 / 查询 / 列举 | 注册后可取回，`list()` 保持注册顺序；未注册返回 `null` |
| 重复注册 | 同一 key 第二次注册抛错，且不覆盖第一次的函数 |
| 工厂隔离 | 两个 `createInspectionRegistry()` 互不影响 |
| 清单解析 | 空清单合法；version≠1、cards 非数组、缺 key/module、module 不以 `.js` 结尾、重复 key → 均中文报错且带序号 |
| 加载器 | 注入假 `loadModule`：正常注册并返回 key 数组；模块缺 `inspect` → 报错；注册顺序 = 清单顺序 |
| 仓库清单 | 真实 `assets/cards/manifest.json` 能被 `parseCardManifest` 解析且 `cards` 为空 |
| 槽位 | `SLOT_NAMES` 冻结且为 4 个；未知槽名抛错；`findSlot` 在假 root 上按 `[data-slot]` 命中 |
| 挂载 | 假 host 上 `appendChild` + `remove()` 幂等；找不到槽位抛错 |
| index.html 契约 | 四个 `data-slot` 全部存在；`tokens.css` 与 `extensions.css` 都有 `<link>` 且在 main.css 之后 |
| 令牌完整性 | `tokens.css` 中每个 `--mumu-color-*` / `--mumu-font-*` 都带 `var(` 与兜底；`--mumu-z-*` 数值与 main.css 现有档位一致 |
| 视觉零变化 | `node serve.js` 下首页 / 选择剧本弹窗 / 章节列表 / 舞台对话框截图比对（改造前后像素无明显差异） |

---

## 7. 风险与对策

| 风险 | 对策 |
| --- | --- |
| `#ui-layer` 空层影响点击或层叠 | `pointer-events:none` + `z-index:70`（低于 boot 90 / toast 100）；截图与手动点击验证 |
| 新 `<link>` 改变样式加载顺序 | tokens.css 只新增变量、extensions.css 只含 `.mumu-*` 规则，不覆盖既有类；截图验证 |
| 令牌与 main.css 变量漂移 | 令牌全部带字面量兜底 + 测试校验兜底存在 |
| 清单加载器被误接入主流程 | `main.js` 不导入 `loader.js`；测试断言 `scripts/*.js`（除 cards/ 自身）无 `cards/loader` 引用 |
| 第三方模块抛错拖垮页面 | 契约写明调用方负责 try/catch；`applyCardManifest` 失败即抛、不做半吞 |
| 未来 P4-5 需要更多上下文 | 检视函数第二参数为开放对象 `context`，P4-5 可扩展字段，不影响注册表 API |

---

## 8. 与既有约束的关系

- AGENTS.md「不引入第三方依赖、不加构建步骤、不整体重构 UI」：本设计只新增文件与两个 `<link>`、四个属性、一个空 `div`。
- AGENTS.md「不得破坏剧本解析 / 人物 / 播放 / 分支 / 存档 / 分镜」：核心模块零改动，既有 254 条测试全量跑。
- 路线图 §9 接入契约：本设计把「夜幕模型位置、图鉴卡位置、检视代码位置、UI 令牌 + 挂载点」四行落成可执行契约。
- 部署口径：纯静态文件，Qoder Sites 直接托管，无新增部署要求。
