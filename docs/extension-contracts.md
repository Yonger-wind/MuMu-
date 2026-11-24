# 暮幕 · 扩展点契约（P0-4）

- 状态：已生效（2026-11-24）
- 适用范围：给本仓库写卡牌检视、界面模块、素材的第三方创作者与其他 Agent
- 权威来源：设计见 `docs/superpowers/specs/2026-11-24-mumu-extension-contracts-design.md`；
  本文所有函数名、参数、错误文案、令牌名、槽位名都与 `scripts/cards/registry.js`、
  `scripts/cards/loader.js`、`scripts/ui/slots.js`、`styles/tokens.css`、`styles/extensions.css`、
  `index.html`、`assets/cards/manifest.json` 的当前实现逐字对应。改动代码时请同步改本文。

暮幕提供三份**可被外部代码消费的契约**。它们的设计前提只有一条：
**接入方只新增文件、改数据清单、挂到命名槽，不需要改任何核心模块。**

| 契约 | 核心文件 | 你什么时候用它 | 你要做的事 |
| --- | --- | --- | --- |
| 卡牌特殊检视 | `scripts/cards/registry.js`、`scripts/cards/loader.js`、`assets/cards/manifest.json` | 某张卡需要专属的检视画面（而非通用卡面） | 新增 `scripts/cards/<cardKey>.js`（具名导出 `inspect`）+ 清单里加一条 |
| UI 命名挂载点 | `scripts/ui/slots.js`、`index.html` 的 `data-slot` | 要往首页 / 舞台 / 弹层 / 悬浮层加自己的界面 | 新增一个模块文件，调 `mountTo('<槽名>', node)` |
| 设计令牌 | `styles/tokens.css`、`styles/extensions.css` | 你的 UI 需要颜色、字体、间距、圆角、层级 | 只用 `--mumu-*` 令牌，样式写进 `.mumu-*` 命名空间 |

三份契约都不引入依赖、不需要构建步骤。全部是原生 ES Modules + CSS 自定义属性。

---

## 1. 卡牌检视注册表：`scripts/cards/registry.js`

纯逻辑模块：不碰 DOM、零依赖。它只负责「按 `cardKey` 存一个检视函数 / 取回 / 列举」，
**从不调用**登记进来的函数。

### 1.1 全部导出

```js
import {
  CARD_KEY_RE,               // RegExp：cardKey 的合法形状
  validateCardKey,           // (key) => key；不合法抛中文 Error
  createInspectionRegistry,  // () => { register, get, has, list }（独立实例，测试与插件隔离用）
  cardInspections,           // 全站默认注册表实例
  registerCardInspection,    // (cardKey, inspect) => inspect（写默认实例）
  getCardInspection,         // (cardKey) => inspect | null（读默认实例）
  listCardInspections,       // () => string[]（默认实例，注册顺序）
} from './scripts/cards/registry.js';
```

（本文的 `import` 路径以站点根为基准，适合写在 `index.html` 的内联 module 里；写进
`scripts/cards/xxx.js` 这类文件时按自身位置改写，例如 `./registry.js`、`../ui/slots.js`。）

工厂实例的方法：

| 方法 | 入参 | 返回 | 说明 |
| --- | --- | --- | --- |
| `register(cardKey, inspect)` | `cardKey: string`，`inspect: Function` | 原 `inspect` 函数 | 失败即抛错，成功前不做任何写入 |
| `get(cardKey)` | `string` | `inspect` 或 `null` | 未注册返回 `null`，**不是** `undefined` |
| `has(cardKey)` | `string` | `boolean` | — |
| `list()` | — | `string[]` 副本 | 保持注册顺序；改返回的数组不影响注册表 |

### 1.2 `cardKey` 规则

`CARD_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/`

- 首字符必须是小写字母或数字；其余只允许小写字母、数字、`.`、`_`、`-`；
- 总长 1–64 字符；
- 必须与文件名 `<cardKey>.js` / `<cardKey>.png` 一一对应，所以不允许大写、空格、中文。

`validateCardKey(key)` 合法时**原样返回** `key`（便于链式使用），不合法抛错。

### 1.3 错误语义（中文，开发者可见）

| 情形 | 错误文案 |
| --- | --- |
| `cardKey` 不合法（非字符串 / 大写 / 空格 / 中文 / 空串 / 超过 64 字符） | `卡牌 id「x」不合法：只允许小写字母、数字、点、下划线与连字符，以字母或数字开头，最长 64 字符。` |
| `inspect` 不是函数 | `卡牌「x」的检视实现必须是一个函数。` |
| 同一 `cardKey` 第二次注册 | `卡牌「x」的检视实现重复注册：同一张卡只能注册一次。` |

**重复注册直接抛错，不做「后写覆盖」**。同名卡出现两份实现，通常意味着复制粘贴没改名；
静默覆盖会把问题藏到运行时。抛错能立刻定位。第二次注册失败后，注册表里保留的仍是第一次的函数。

### 1.4 判空语义

- `get(cardKey)` / `getCardInspection(cardKey)` 在未注册时返回 **`null`**。
- 下游判空请用 `=== null` 或真值判断（`if (!fn)`），不要写 `=== undefined`。
- `register` 返回的是你传进去的原函数，成功与否用「有没有抛错」判断，不要看返回值真假。

### 1.5 注册表从不调用检视函数

注册表只保存引用。谁来调用、什么时候调用、抛错了怎么办，全部由调用方负责
（P0-4 只登记，将来的卡面查看器 P4-5 才调用）。因此在注册表侧不存在「检视函数渲染失败」
这类问题——只有调用方需要 `try/catch`。

---

## 2. 检视函数契约

```js
// 完整类型（带 context 对象）
// (host: HTMLElement, context: { cardKey: string, card: object }) => cleanup?: Function
// 调用方实际以解构形式传入，两种写法等价：
// (host, { cardKey, card }) => cleanup?
```

- `host`：调用方提供的宿主容器，你的实现往里画东西；
- `context.cardKey`：这张卡的 key（与清单、注册表一致）；
- `context.card`：`parseCardManifest` 归一后的清单条目 `{ key, module, title?, image? }`
  （`title` / `image` 可能不存在，取值请用 `card.title || cardKey` 这类兜底）；
- 返回值：可选的清理函数。调用方在卸载时必须调用一次；你也可以不返回。

调用方（P4-5）负责挂载、卸载与异常兜底。检视实现本身不要假设自己会被调用几次，
写成一个「拿到 host 就能独立渲染、返回清理函数就能安全拆掉」的纯渲染函数最稳。

---

## 3. 卡牌清单：`assets/cards/manifest.json`

### 3.1 结构

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
| `version` | 是 | 只接受数字 `1`；其他值一律报错 |
| `cards` | 是 | 数组，可以为空（当前仓库就是空清单） |
| `cards[].key` | 是 | 通过 `validateCardKey`；同一清单内不可重复 |
| `cards[].module` | 是 | 非空相对路径，且必须以 `.js` 结尾 |
| `cards[].title` | 否 | 字符串，仅接受字符串；给图鉴展示用 |
| `cards[].image` | 否 | 字符串，仅接受字符串；卡面图相对路径 |

### 3.2 字段归一（读入时发生的处理）

`parseCardManifest` 返回的条目是**归一后**的对象，与清单原文可能不同：

- `title` / `image`：只有字符串才收；读入时 `trim()`；trim 后为空串就**整个字段丢弃**
  （不会留下 `title: ''`）。其余类型（数字、`null`、对象）当作没写。
- `module`：`trim()` 后必须非空且以 `.js` 结尾，否则报错；不会补全前缀，按相对路径原样保存。
  **现状说明**：当前只校验非空且以 `.js` 结尾，**不拒绝**绝对 URL 与 `../` 回溯——加载器会照写解析，
  请自行保持清单为仓库内相对路径。
- `key`：原样保存（已通过 `validateCardKey`）。
- 归一后的条目只有四个可能的键：`key`、`module`、以及可选的 `title`、`image`。
- 返回顺序 = 清单顺序；重复 `key` 报错并指出是第几张。

### 3.3 清单校验文案（逐字）

所有清单问题都由 `parseCardManifest` 抛出，统一前缀 `卡牌清单无效：`，共 7 条：

| 触发情形 | 完整文案 |
| --- | --- |
| 入参不是普通对象（`null` / 数组 / 标量） | `卡牌清单无效：清单必须是一个对象。` |
| `version` 不是数字 `1` | `卡牌清单无效：不支持的清单版本「<v>」；当前只支持 1。` |
| `cards` 不是数组（含缺失） | `卡牌清单无效：cards 必须是数组。` |
| 第 N 项不是对象（`null` / 数组 / 标量） | `卡牌清单无效：第 N 张卡不是对象。` |
| `key` 未通过 `validateCardKey` | `卡牌清单无效：第 N 张卡的 key 不合法：<原因>`（`<原因>` 即 §1.3 的中文报错正文） |
| `module` 缺失 / `trim()` 后为空 / 不以 `.js` 结尾 | `卡牌清单无效：第 N 张卡（<key>）的 module 必须是以 .js 结尾的非空路径。` |
| `key` 与前面某条重复 | `卡牌清单无效：第 N 张卡的 key「<key>」与前面的条目重复。` |

`N` 从 1 开始（「第 1 张卡」）。条目级问题在第 N 项被检查到时立刻抛出，
因此一张卡可能同时有多个问题，但一次只报最靠前的那条。同一张卡内的检查顺序是：
是否对象 → `key` 合法性 → `key` 是否重复 → `module` 合法性 → 归一 `title` / `image`。

### 3.4 路径怎么解析

`module` 由加载器解析，`image` 只是字符串路径、约定用同一套规则（消费方按站点根取用）：

- 浏览器：相对 `document.baseURI`（即页面地址，正常部署就是站点根）；
- 无 `document` 的环境（Node / 测试 / worker）：回落到仓库根，实现是
  `new URL('../../', import.meta.url)`（`loader.js` 在 `scripts/cards/` 下，两级回根）。

所以清单里写 `scripts/cards/example.js`、`assets/cards/example.png` 这种「从站点根算起」的路径，
不要写 `./example.js` 这种相对 `loader.js` 的路径，也不要写绝对 URL。

### 3.5 可抄的示例模块

```js
// scripts/cards/example.js —— 一张卡的检视实现（示例，不参与运行时）
export function inspect(host, { cardKey, card }) {
  host.textContent = `检视：${card.title || cardKey}`;
  return () => { host.textContent = ''; };
}
```

对应清单条目：

```json
{ "key": "example", "title": "示例卡", "image": "assets/cards/example.png", "module": "scripts/cards/example.js" }
```

要点：

- **只认具名导出 `inspect`**，不认 `export default`，避免两种写法并存；
- 模块路径与 `cardKey` 不要求同名，但按 `<cardKey>.js` 命名最省心；
- 检视模块内部再 `import` 别的文件时，路径按**自身文件位置**解析：
  `scripts/cards/example.js` 引用 `scripts/modals.js` 要写 `../modals.js`；
- 检视模块不要 `import` `loader.js` 去反向触发加载（清单加载由调用方统一负责）。

### 3.6 仓库清单现状：空清单

`assets/cards/manifest.json` 当前就是：

```json
{
  "version": 1,
  "cards": []
}
```

加第一张卡时要做两件事，并注意一个测试：

1. 新增 `scripts/cards/<cardKey>.js`（具名导出 `inspect`）与 `assets/cards/<cardKey>.png`；
2. 往 `cards[]` 追加条目；
3. `tests/cards.test.mjs` 里有一条「仓库内的卡牌清单：可解析且当前为空」，
   它断言 `parseCardManifest(...)` 的结果是 `[]`。加卡后请把它改成**按结构断言**
   （例如「能解析、每条都有 `key` / `module`、`key` 不重复、`module` 以 `.js` 结尾」），
   而不是删掉了事——这条测试锁的是「清单永远可解析」这个契约。

---

## 4. 加载器：`scripts/cards/loader.js`

### 4.1 导出

```js
import {
  parseCardManifest,   // (input) => entries[]；任何问题抛中文 Error
  applyCardManifest,   // (manifest, opts?) => Promise<string[]>
  loadCardManifest,    // (url?, opts?) => Promise<string[]>
} from './scripts/cards/loader.js';
```

`opts` 支持两个键，都是给测试 / 宿主注入用的：

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `loadModule` | `(path: string) => Promise<module>` | 按站点根 `new URL(path, siteBase())` 后动态 `import()` | 测试注入假模块，不落盘临时 js 文件 |
| `registry` | 带 `register(key, fn)` 的对象 | 全局 `cardInspections` | 注入独立实例可做到插件间互不污染 |

### 4.2 注入语义：按「键是否存在」判定

`applyCardManifest` 用 `Object.prototype.hasOwnProperty` 判断你是否注入了 `loadModule` / `registry`：

- 只要传了这个键（哪怕值是 `null`、`0`、`false`），就**按你给的值使用**，不回落默认实现；
- 值不合法时直接抛中文错：`applyCardManifest 需要 loadModule 函数。` /
  `applyCardManifest 需要一个带 register 函数的注册表。`；
- 想用默认实现就别写这个键，而不是写成 `undefined` 或 `null`。

这样设计是为了让「注入写错」立刻暴露，而不是悄悄跑真实 `import()` / 写全局注册表。

### 4.3 执行顺序与失败行为

1. **先整体校验清单**（`parseCardManifest`）：这一步纯计算，清单有任何问题都不会产生副作用，
   一个模块也不会被加载；
2. 再校验注入的两个函数；
3. 按清单顺序逐条 `await loadModule(entry.module)` → 取 `mod.inspect` → `registry.register(...)`；
4. 返回已注册的 `key` 数组（顺序 = 清单顺序）。

失败语义：

- 模块加载失败（`import` 抛错 / 注入的 `loadModule` 抛错）→
  `卡牌「x」的模块 <path> 加载失败：<原始信息>`；
- 模块没有导出 `inspect` 函数 → `卡牌「x」的模块 <path> 没有导出 inspect 函数。`；
- **中途失败不回滚**：失败前已经注册成功的条目会留在注册表里。调用方要重试，
  请先自行清理（`registry` 目前没有 `unregister`，自建实例最干净）。

### 4.4 `loadCardManifest(url = './assets/cards/manifest.json', opts)`

`fetch(url, { cache: 'no-cache' })` → `res.json()` → `applyCardManifest(data, opts)`。
三条失败分支都是中文报错：

| 分支 | 文案 |
| --- | --- |
| 网络失败（`fetch` reject，如断网、跨域被拒） | `读取卡牌清单失败：<url>。` |
| 非 2xx | `读取卡牌清单失败：<url>（HTTP 404）。` |
| 返回体不是合法 JSON | `卡牌清单无法解析为 JSON：<url>。` |

### 4.5 它默认不被任何页面加载

`main.js` 与 `index.html` 都不引用 `cards/loader*`：**没有图鉴容器时清单不加载，运行时零开销**。
`tests/ui-slots.test.mjs` 有一条测试锁住这件事（除 `scripts/cards/` 自身，以及白名单
`ALLOWED_LOADER_CONSUMERS = ['gallery.js', 'ui/gallery.js']` 这两个尚未存在的图鉴容器约定路径外，
任何模块引用 `cards/loader` 都会失败）。当 P4 真的做出图鉴容器时，由那个容器模块调用
`loadCardManifest('./assets/cards/manifest.json')`，而不是在 `main.js` 里全局加载；
同时要把它的路径登记进上面那个白名单，否则测试会拦下它。

---

## 5. UI 命名挂载点：`scripts/ui/slots.js`

槽位在 `index.html` 里用 `data-slot="…"` 声明。挂载 API 只做查找 + `appendChild`，
**不注入样式、不绑定事件、不改层级**。

### 5.1 槽位表

| 槽名 | 宿主 | 适合放什么 | 安全性 / 使用注意 |
| --- | --- | --- | --- |
| `home` | `#home`（`<main class="screen home">`） | 首页的自定义模块（品牌角、按钮组之外） | 只在首页可见：`.screen[aria-hidden="true"]` 会把整块 `opacity/visibility` 隐藏，切到舞台时你的界面自动不可见、也收不到点击。首页没有全局点击推进，但夕阳画布与 hero/按钮组在同一层，新节点请自行定位并控制 `z-index`，不要遮住「开始体验」。 |
| `stage` | `#stage`（`<section class="screen stage">`） | 舞台 HUD、夜间提示、章节浮标 | **点击会被舞台推进逻辑接收**：`main.js` 对 `#stage` 的 `click` 直接调 `engine.advance()`。挂进来的第三方 UI 必须在自身的 `click` / 指针事件上 `stopPropagation()`（选项按钮内部就是这么做的），否则点一下界面就翻一页台词。另外 `.stage-top` 与 `.dialogue` 是 `z-index:10`，你的节点默认会被它们压住。 |
| `modal` | `#modal-root` | 需要与弹窗共存的界面 | **会被随时清空**：`openModal` / `closeModal` 都整体覆写 `#modal-root` 的 `innerHTML`，挂进来的内容在下次开关弹窗时消失——你的模块必须能接受被清空，并在需要时重新挂载（`mountTo` 再挂一次即可，`remove()` 幂等）。**`#modal-root` 只要还有任何一个子节点，键盘空格/回车推进就会被禁用**（`main.js` 检查 `children.length`）；挂一个不可见的空节点会让主角「敲键盘没反应」。 |
| `overlay` | `#ui-layer`（`<div class="mumu-ui-layer" data-slot="overlay">`，空层，位于 `#modal-root` 之前） | **第三方 UI 的默认落点**：卡面查看器、抽卡动画、全屏特效 | 层级 70：在弹窗遮罩（60）之上、开机遮罩（90）与 toast（100）之下。因此 overlay 会**盖住弹窗并吞掉弹窗点击**（空层本身 `pointer-events:none`，但挂进去的子元素被 `.mumu-ui-layer > *` 恢复成 `pointer-events:auto`）。需要与弹窗并存且允许点弹窗的 UI，请自行给容器设 `pointer-events:none` 并在具体可交互元素上恢复，或改挂 `modal`。开机遮罩期间（首屏点按之前）overlay 被遮住；toast 永远在最上层。 |

**选择建议**：默认挂 `overlay`；只有当你的界面**必须和弹窗一起出现、一起消失**时才挂 `modal`；
只在某一屏出现的 HUD 挂 `home` / `stage`。

### 5.2 API 细节

```js
import { SLOT_NAMES, findSlot, mountTo } from './scripts/ui/slots.js';
```

| 导出 | 签名 | 行为 |
| --- | --- | --- |
| `SLOT_NAMES` | `Object.freeze(['home', 'stage', 'modal', 'overlay'])` | 已冻结，共四个槽；改名单要同时改 `index.html` 与测试 |
| `findSlot` | `(name, root = globalThis.document) => Element \| null` | 用 `root.querySelector('[data-slot="<name>"]')` 查找，不依赖 id（便于将来换结构）。未知槽名抛错；页面上没有该槽返回 `null` |
| `mountTo` | `(name, node, opts = {}) => { node, remove() }` | `appendChild` 到槽位；`remove()` 幂等（已移除再调不报错） |

`mountTo` 的校验顺序（决定了你看到哪条报错）：

1. **未知槽名** → `未知的挂载点「x」；可用：home / stage / modal / overlay。`
2. **找不到槽位** → `页面上找不到挂载点「x」，请确认 index.html 里带有 data-slot="x"；可用：home / stage / modal / overlay。`
3. **节点非法** → `挂载内容必须是 DOM 节点。`
4. **宿主不可挂载** → `挂载点「x」不可挂载。`

`root` 用来换查找根：`{ root }` 省略时用 `globalThis.document`；传 `{ root: null }` 表示
**显式没有根**（等价于「页面上不存在该槽」），`findSlot` 会返回 `null`，`mountTo` 报第 2 条错。
测试用假 root 时请提供 `querySelector`，否则 `findSlot` 收敛为 `null`。

第 3 条只拦 `null` / `undefined` 与非对象；更细的节点类型校验交给宿主的 `appendChild`
（传入普通对象会由浏览器抛出 `TypeError`，不是这里的文案）。

### 5.3 挂载示例

写在 `index.html` 的内联 module 里（路径相对站点根）：

```js
import { mountTo } from './scripts/ui/slots.js';

const panel = document.createElement('div');
const handle = mountTo('overlay', panel);
// 卸载时：handle.remove();
```

写在 `scripts/ui/` 下的模块文件里（路径相对当前文件）：

```js
import { mountTo } from './slots.js';

const panel = document.createElement('div');
panel.className = 'mumu-my-panel';   // 样式请写进 .mumu-* 命名空间
panel.textContent = '我的界面';
mountTo('overlay', panel);
```

`mountTo` 不负责不重复挂载：调用两次会挂两个节点。需要「只挂一次」请在模块里自己记状态，
或先 `remove()` 再挂。

### 5.4 新 UI 模块如何被加载（没有自动发现）

**当前没有任何自动发现机制**：放进 `scripts/ui/` 的文件不会被自动执行，也没有目录扫描或约定式入口。
新增模块必须由**页面或某个已被加载的模块显式 `import`**，两种写法任选其一：

1. **在 `index.html` 的 module 脚本（或其入口模块）里加一行 import**，让该文件在加载时自行 `mountTo`：

   ```js
   // index.html 的 module 脚本 / 入口模块里
   import './scripts/ui/<name>.js';   // 该文件在 mount 时自己调用 mountTo
   ```

   `index.html` 当前只有一个 module 入口 `<script type="module" src="./scripts/main.js">`，
   所以这一行通常写在 `main.js` 的 import 区，或加在 `index.html` 的内联 module 里（路径按站点根写）。

2. **由一个已被加载的模块 import 它**（例如你的 `scripts/ui/panel.js` 里 `import './gallery-panel.js';`），
   路径按**引用方自身位置**解析。

两条约束：

- 模块的顶层副作用就是「建节点 + `mountTo`」，不要依赖别处调用它的 `init()`——没人会调；
- 只允许挂 §5.1 表格里的四个槽名，挂 `stage` 记得 `stopPropagation()`，挂 `modal` 要接受被清空。

**P4-5 首次接入图鉴时的约定**：图鉴容器模块（约定路径 `scripts/ui/gallery.js` 或 `scripts/gallery.js`）
应成为 `scripts/cards/loader.js` 的**第一个运行时消费者**——由它自己调
`loadCardManifest('./assets/cards/manifest.json')`，而不是在 `main.js` 里全局加载；
同时把该模块路径登记进 `tests/ui-slots.test.mjs` 的 `ALLOWED_LOADER_CONSUMERS`，
否则「除 cards/ 外无人引用 loader」那条护栏会失败。

---

## 6. 设计令牌：`styles/tokens.css`

### 6.1 规则

1. **只依赖 `--mumu-*`**，不要直接用 `main.css` 的内部变量（`--ink` / `--cream` / `--glass-brd` …）；
2. 每个颜色 / 字体令牌都写成 `var(--内部变量, 字面量兜底)`：`main.css` 改了内部变量名时，
   你的界面会退回兜底色，而不会静默变成透明或黑块；
3. 间距 / 圆角 / 层级是纯字面量，直接取值即可；
4. 令牌只新增变量，不覆盖任何既有规则；`main.css` 不需要你的配合。

### 6.2 令牌清单（与 `styles/tokens.css` 一一对应）

颜色（10 个）：

| 令牌 | 定义 |
| --- | --- |
| `--mumu-color-ink` | `var(--ink, #2a1f33)` |
| `--mumu-color-cream` | `var(--cream, #fff4e6)` |
| `--mumu-color-amber` | `var(--amber, #ff9d57)` |
| `--mumu-color-rose` | `var(--rose, #ff7a8a)` |
| `--mumu-color-plum` | `var(--plum, #6b4a8f)` |
| `--mumu-color-dusk` | `var(--dusk, #3a2a56)` |
| `--mumu-color-night` | `var(--night, #1b1430)` |
| `--mumu-color-glass` | `var(--glass, rgba(255, 244, 230, 0.10))` |
| `--mumu-color-glass-border` | `var(--glass-brd, rgba(255, 244, 230, 0.28))` |
| `--mumu-color-text-soft` | `var(--soft, rgba(255, 244, 230, 0.72))` |

字体（2 个）：

| 令牌 | 定义 |
| --- | --- |
| `--mumu-font-serif` | `var(--serif, "Noto Serif SC", "Songti SC", "STSong", Georgia, serif)` |
| `--mumu-font-sans` | `var(--sans, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif)` |

间距（5 个）：

| 令牌 | 值 |
| --- | --- |
| `--mumu-space-xs` | `4px` |
| `--mumu-space-sm` | `8px` |
| `--mumu-space-md` | `16px` |
| `--mumu-space-lg` | `24px` |
| `--mumu-space-xl` | `40px` |

圆角（4 个）：

| 令牌 | 值 |
| --- | --- |
| `--mumu-radius-sm` | `8px` |
| `--mumu-radius-md` | `12px` |
| `--mumu-radius-lg` | `16px` |
| `--mumu-radius-pill` | `999px` |

层级（4 个，无单位数字，直接给 `z-index`）：

| 令牌 | 值 | 对应宿主 |
| --- | --- | --- |
| `--mumu-z-modal` | 60 | `.modal-mask`（弹窗遮罩） |
| `--mumu-z-overlay` | 70 | `.mumu-ui-layer`（`overlay` 槽） |
| `--mumu-z-boot` | 90 | `.boot-veil`（开机遮罩） |
| `--mumu-z-toast` | 100 | `.toast`（轻提示） |

关系固定为 `modal < overlay < boot < toast`，测试会断言这个顺序。

用法：

```css
.mumu-my-panel {
  font-family: var(--mumu-font-serif);
  color: var(--mumu-color-cream, #fff4e6);   /* 二次兜底可选，推荐写上 */
  background: var(--mumu-color-glass);
  border: 1px solid var(--mumu-color-glass-border);
  border-radius: var(--mumu-radius-lg);
  padding: var(--mumu-space-md) var(--mumu-space-lg);
  z-index: var(--mumu-z-overlay, 70);
}
```

### 6.3 样式加载顺序与契约锁

`index.html` 的样式链接**恰为三条，顺序固定**：

```
main.css → tokens.css → extensions.css
```

`tests/ui-slots.test.mjs` 有一条断言「样式链接恰为 main.css / tokens.css / extensions.css」。
这是**刻意的契约锁**：将来新增任何全局样式表，必须同步更新该测试与本节，否则测试会失败。
不要绕过它。

`styles/extensions.css` 只允许 `.mumu-*` 命名空间下的规则，不得覆盖 `main.css` 的既有类
（另有一条测试逐条校验选择器）。校验会先剥掉注释；`@media` / `@supports` 这类 at-rule 的花括号内部
按同一规则继续校验，`@keyframes` 里的 `from` / `to` / `0%` 是帧标签、不算选择器，整块跳过。

---

## 7. 素材目录约定

### 7.1 仓库内

| 资源 | 位置 | 约定 |
| --- | --- | --- |
| 卡牌清单 | `assets/cards/manifest.json` | 结构见 §3；当前是空清单 |
| 卡面图 | `assets/cards/<cardKey>.png` | 透明底 PNG；`cardKey` 与清单、检视注册表一致 |
| 检视实现 | `scripts/cards/<cardKey>.js` | 具名导出 `inspect` |
| 夜幕模型 | `assets/night/<name>.png` | 预留目录，供 P4 的夜幕功能使用；缺失时应由调用方显示占位符 |
| 既有素材 | `assets/images/`、`assets/models/` | 保持现状，不迁移、不改名 |

### 7.2 `.mumu` 包内的 `assets[].role`

| role | 含义 | 建议包内路径 |
| --- | --- | --- |
| `cover` | 作品封面（既有） | `assets/cover.<png\|jpg\|webp>` |
| `card` | 图鉴卡面 | `assets/cards/<cardKey>.png` |
| `night` | 夜幕模型 | `assets/night/<name>.png` |

`role` 仍是**自由字符串**，校验强度不变：写未知 role 不会报错，会随清单原样保留。

### 7.3 当前落地程度（重要）

- 导入端**只有封面会转成 data URL** 落进本地作品库（按 `role === 'cover'` 或 `id === 'cover'`
  找到那一条）；
- `card` / `night` **只随清单声明，暂不落地存储**，导入后不会出现在作品库里被读取；
- 读取逻辑留给 P4 的图鉴与夜幕功能。P0-4 没有改 `package.js`。

所以现在导出 / 导入包含 `card` / `night` 的包是**安全但无消费方**的：数据不会丢，
只是暂时没人读。做图鉴 / 夜幕时再在导入端补「转 data URL + 入库」那一步。

字段表与限额见 `docs/mumu-package-spec.md` §4.3。

---

## 8. 回归要求

新增任何上述文件后，在仓库根跑：

```bash
node --test tests/*.test.mjs   # 分支全量用例；当前基线 302 个全通过
node tools/lint.js --builtin   # 期望：通过：内置 15 章 未发现问题。
```

要守住的三条：

1. **15 章内置剧本照常播放**：`lint.js --builtin` 必须 exit 0；
2. **卡牌 / 槽位 / 令牌契约的既有测试照常通过**（`tests/cards.test.mjs`、`tests/ui-slots.test.mjs`）；
3. **页面视觉零变化**：新增槽位与样式表是「无可见像素（透明全屏盒）」的改动；若你的 UI 挂上来之后首页 / 舞台 /
   弹窗出现错位，先检查是否用了非 `--mumu-*` 的变量、是否遮住对话框、是否在 `stage` 槽里忘了
   `stopPropagation()`。

本地跑起来：`node serve.js` → `http://localhost:5173`（必须走 HTTP，`serve.js` 不发缓存头，
改完代码请强制刷新）。
