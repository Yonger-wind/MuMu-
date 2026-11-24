# 暮幕 MuMU · 作品包 `.mumu` 格式与导入导出链路设计

- 版本：v1.0
- 日期：2026-11-23
- 状态：待评审（评审通过后进入实施计划）
- 对应计划表条目：P0-2「作品包 `.mumu` 与 manifest」
- 上游依赖：P0-1 状态层与存档 v2（已完成，`mumu.saves.v2`）
- 下游受益：P1-2 预览与修正、P1-4 发布导出、P6-4 生态基础

---

## 1. 目标与非目标

### 目标

1. 定义一个**自描述、可校验、可迁移**的作品包格式 `.mumu`，让一部作品（单章或整本曲目）能被完整带走。
2. 包内保留**原始剧本文本**与**元数据**，导入后播放结果与导出前逐句一致。
3. 导出 / 导入全部在浏览器内完成，不依赖服务端、不引入第三方依赖、不加构建步骤。
4. 包格式带 `formatVersion`（容器）与 `schemaVersion`（内容）两版号，具备**可执行的迁移链**，为后续生态演进留出路径。

### 非目标（P0-2 不做）

- 静态站点包导出、分享卡：属 P1-4。
- 数字签名 / 哈希校验 / 加密：留待 P6-4 生态阶段，当前只做结构校验与体积限额。
- 服务端导入、AI 辅助改写：不做。
- 作品包的加密分发、DRM：不做。
- 修改既有剧本解析语义、既有 UI 布局：不做（红线）。

---

## 2. 容器格式

### 2.1 选择

容器采用**标准 ZIP**（扩展名 `.mumu`，MIME `application/zip`）。

理由：系统解压器、文件管理器、网盘与浏览器都能直接打开排查；不引入自定义二进制格式，便于第三方工具消费；Node 24 与现代浏览器都内置 `CompressionStream('deflate-raw')`，写 ZIP 不需要第三方库。

### 2.2 单章包布局

```
example.mumu
├── manifest.json        必需
├── script.txt           必需，原始剧本文本（暮幕 DSL）
├── assets/cover.jpg     可选，封面图
├── README.md            可选，说明与玩法
└── LICENSE.txt          可选，许可证全文
```

### 2.3 整本（曲目）包布局

```
example-series.mumu
├── manifest.json          必需
├── chapters/01.txt        必需，第 1 章原文
├── chapters/02.txt        必需，第 2 章原文
├── chapters/03.txt        可选，各章原文（按 chapterNo 排序命名）
├── assets/cover.jpg       可选，曲目封面
├── README.md              可选
└── LICENSE.txt            可选
```

两种布局共用同一套 manifest 结构：**单章包 = `works` 长度为 1 的包**。这样导入端只需一套解析逻辑。

### 2.4 ZIP 实现约束

- 压缩方法：优先 `deflate-raw`（method 8）；运行环境不支持 `CompressionStream` 时降级为 `stored`（method 0）。读取端同时支持两种方法。
- 必须写正确的 CRC-32；否则部分解压工具会判定包损坏。
- 条目名统一使用 `/` 分隔、UTF-8 文件名标志位（general purpose flag bit 11）置 1，中文文件名不乱码。
- 单个条目与整包体积限额见 §7。

---

## 3. manifest 结构（schemaVersion 2）

### 3.1 当前版本字段

```jsonc
{
  "format": "mumu-package",       // 固定值；不是它就不是暮幕作品包
  "formatVersion": 1,             // 容器格式版本（ZIP 布局规则）
  "schemaVersion": 2,             // 内容 schema 版本
  "kind": "series",               // "work" = 单章；"series" = 整本曲目
  "id": "cicada",                 // 包 id（kind=work 时为作品 id；kind=series 时为曲目 id）
  "title": "蝉鸣止于逢魔时",
  "summary": "简介文本",
  "author": "作者名",
  "series": { "id": "cicada", "title": "蝉鸣止于逢魔时" },  // kind=work 时表示所属曲目；kind=series 时为 null
  "license": {
    "type": "署名-非商业",         // 自由文本，如 "CC BY-NC 4.0"
    "holder": "作者名",
    "allowRemix": true            // 是否允许改编
  },
  "engine": { "minVersion": 1 },  // 运行该包所需的暮幕能力版本
  "works": [                      // 至少 1 条
    {
      "id": "builtin_cicada_01",  // 作品 id（导入后作为本地 id）
      "title": "蝉鸣止于逢魔时",   // 作品标题
      "tag": "第一章 · 蝉鸣",      // 章节标签（曲目卡上的短标题）
      "chapterNo": 1,             // 章序；接受可转成整数的数字字符串（如 "2" → 2）
      "file": "chapters/01.txt",  // 相对包内的文本路径
      "format": "text",           // "text"（暮幕 DSL）；预留 "json"
      "chars": 4821               // 正文字数（不含空白）
    }
  ],
  "assets": [                     // 可为空数组
    {
      "id": "cover",
      "role": "cover",             // 目前仅 "cover"
      "file": "assets/cover.jpg",
      "type": "image/jpeg",
      "bytes": 48213
    }
  ],
  "createdAt": "2026-11-23T08:00:00.000Z",
  "generator": "暮幕 MuMU"
}
```

### 3.2 字段约束

- `format` 必须等于 `mumu-package`，否则报「这不是暮幕作品包」。
- `formatVersion` 大于当前支持值（1）→ 报「包格式版本 v2 高于当前暮幕支持的 v1」。
- `schemaVersion` 大于当前支持值（2）→ 报「包内容版本 v3 高于当前暮幕支持的 v2，请升级暮幕后再打开」。
- `works` 必须非空；每条 `file` 必须在 ZIP 中存在，否则报「作品包缺少第 N 章的剧本文件」。
- `works[].chapterNo` **接受可转成整数的数字字符串**（`'2'` → `2`）；缺失或非法值
  （`undefined` / `'oops'` / `0` / 负数）回退为按顺序补位（下标 + 1）。导出侧同样用
  `Number()` 归一，两端语义一致。**包内章序应连续且唯一**（1、2、3……），否则导入后
  会按实际顺序重排。
- `license.type` / `holder` 缺失时按「未指定」「未署名」处理，不阻断导入。
- 未知字段**忽略但不报错**，保证向前兼容。

### 3.3 v1（草案）→ v2 迁移

v1 是本设计确定前的草案形态，保留为可迁移的历史版本，用于验证迁移链真实可用：

```jsonc
{
  "format": "mumu-package", "formatVersion": 1, "schemaVersion": 1,
  "id": "x", "title": "x",
  "chapters": [ { "id": "c1", "title": "c1", "file": "script.txt" } ],   // 无 works 包装
  "assets": { "cover": "assets/cover.jpg" }                              // 对象映射而非数组
}
```

迁移函数 `migrateV1toV2(manifest)`：

- `chapters` → `works`，逐条补 `tag`（取 `title`）、`chapterNo`（缺失或非法时按数组下标 +1；
  可转成整数的数字字符串按数值取）、`format:'text'`、`chars:0`。
- `assets` 对象映射 → `assets` 数组，逐条补 `id`/`role:'cover'`/`type`（按扩展名推断）/`bytes:0`。
- 补 `kind`（`works.length > 1 ? 'series' : 'work'`）、`series:null`、`summary:''`、`author:''`、默认 `license`、`engine:{minVersion:1}`。
- 迁移后 `schemaVersion` 置 2。

迁移表：

```js
export const MIGRATIONS = {
  1: migrateV1toV2,
};
```

导入流程固定为：`读取 manifest → 校验 format/formatVersion → 循环 MIGRATIONS 直到 schemaVersion 收敛 → 校验 works → 解析文本`。

---

## 4. 导出链路

### 4.1 入口

| 位置 | 按钮 | 导出物 |
|---|---|---|
| 剧本库 · 曲目卡 | 「导出整本」 | `kind: 'series'`，`works[]` 为该曲目全部章节 |
| 剧本库 · 独立剧本卡（导入的作品） | 「导出 .mumu」 | `kind: 'work'`，`works[]` 长度为 1 |
| 章节列表 · 每一行 | 「导出」 | 该章单章包 `kind: 'work'` |

导出按钮为 `mini-btn`，点击时 `stopPropagation`，不触发卡片进入播放。

### 4.2 导出步骤

1. **取原文**：优先用 `script.source`（导入时保留的原始文本 / 内置剧本的源文本）；缺失时用 §6 的序列化兜底重建 DSL 文本。
2. **建 manifest**：填齐 §3.1 字段；`kind` 由入口决定；`works[].chars` 用 `countChars(text)`。
3. **建文件表**：
   - `manifest.json`（`JSON.stringify(manifest, null, 2)`）
   - 单章：`script.txt`；整本：`chapters/01.txt`、`chapters/02.txt`……
   - `assets/cover.<ext>`：由 `script.coverImage`（data URL）解码为字节；无封面则不写。扩展名与 `assets[].type` 的实际 MIME 一致（`image/jpeg` → `.jpg`，`image/png` → `.png`）。
   - `README.md`：模板化生成（标题、简介、章节列表、许可证、暮幕版本与格式说明）。
   - `LICENSE.txt`：`license.type` 的纯文本（无许可证则省略）。
4. **打包**：`scripts/zip.js` 的 `writeZip(files) → Blob`。
5. **下载**：`<a download>` + `URL.createObjectURL`，文件名 `<标题>.mumu`（文件名非法字符替换为 `_`）。

导出是**只读操作**，不修改任何本地数据。

### 4.3 内置剧本的导出

内置十五章需保留原文：`scripts/builtin.js` 在 `loadBuiltinScripts()` 里为每个剧本补 `sc.source = s.text`（`SOURCES` 数组里已有原始 DSL 文本）。导出内置曲目得到的是**含内置原文的包**，作者信息取内置 manifest。

---

## 5. 导入链路

### 5.1 入口

剧本库弹窗的「导入」→ `openImport` 的拖放区 / 文件选择。`accept` 扩展为 `.txt,.md,.json,.docx,.zip,.mumu`。

按扩展名分流：`.mumu` → 作品包导入；其余 → 既有 `readFileToScript` 文本导入（行为不变）。

### 5.2 导入步骤

1. 读 `ArrayBuffer`，校验体积 ≤ 32MB。
2. 解压 ZIP，取全部条目为 `Map<name, bytes>`。
3. 读取 `manifest.json`，UTF-8 解码 + `JSON.parse`；失败 → 「作品包清单无法解析，可能已损坏」。
4. 校验与迁移（§3.2 / §3.3）。
5. 逐条解析 `works[]`：
   - 用 `parseScriptText(text, title)` 解析（沿用既有解析器，旧格式与标签全部照旧生效）。
   - 解析失败 → 「第 N 章《标题》解析失败：<解析器原始提示>」，整包不落库（原子性：要么全进，要么全不进）。
6. 组装本地作品记录（§5.4）。
7. 封面：`assets` 中 `role==='cover'` 的条目 → 字节 → data URL；写库前缩到 ≤640px 的 JPEG（见 §7）。
8. 写库：逐条 `addCustomScript`（同 id 覆盖更新）。
9. 刷新剧本库弹窗并 toast 结果。

### 5.3 id 冲突处理

| 情况 | 处理 | 用户提示 |
|---|---|---|
| 作品 id 与本地**已导入**作品相同 | 视为**更新**，覆盖同 id 记录 | 「已更新《标题》」 |
| 作品 id 与内置作品相同（`builtin_*`） | 加 `user:` 前缀作为新 id | 「已另存为《标题》」 |
| 整本包（`kind=series`）的 series id 与本地曲目 id 冲突（含内置曲目） | 系列 id 加前缀 `user:`（如 `user:cicada`），整本作为**新曲目卡**出现；已是 `user:` 前缀的 id 视为同一曲目并更新 | 「与已有曲目同名，已另存为《xxx（导入）》」 |
| 单章包（`kind=work`） | **始终**作为独立卡片，不进入任何曲目；包内 `series` 字段只作为来源信息存进 `manifest` 快照 | 无 |

导入的作品**绝不覆盖内置剧本**：内置 id 一律为 `builtin_*`。若包内作品 id 与内置 id 相同，一律加 `user:` 前缀作为新 id 落库；只有当 id 与**本地已导入**的作品相同时，才视为更新并覆盖。

### 5.4 本地作品记录结构

在既有解析结果（`title / summary / author / characters / nodes / labels / cover`）上追加：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 本地唯一 id |
| `tag` | string | 章节短标签（曲目卡 chip 用） |
| `chapterNo` | number | 章序 |
| `series` / `seriesTitle` | string / null | 所属曲目；无则为空 |
| `source` | string | 原始剧本文本（导出与二次编辑的依据） |
| `coverImage` | string | 封面 data URL（≤640px JPEG），可为空 |
| `manifest` | object | 精简后的包元数据快照（`schemaVersion / kind / license / engine / works 摘要`） |
| `builtin` | false | 与内置剧本区分 |

写入仍走既有 `mumu.scripts.v1` 存储键（不新增键，减少回归面）。

### 5.5 错误清单（全部中文、对用户可读）

以下文案与 `scripts/package.js`、`scripts/zip.js`、`scripts/serialize.js` 中实际抛出的
`userFacing` 错误逐条对应（`N` 为章序下标 + 1，`X` 为实际版本号）。

**导入期硬错误**（抛出后整包不落库）：

| 情况 | 文案 |
|---|---|
| 包体积超限 | 「作品包超过 32MB，无法导入。」 |
| 读到的不是有效缓冲区 | 「作品包数据无效，无法导入。」 |
| 非 ZIP / 结构损坏 | 「这个文件不是有效的暮幕作品包（ZIP 结构无法读取）。」（ZIP 层的原始文案在此路径被统一收敛） |
| 解压后总体积超限 | 「作品包解压后的内容超过 64MB，请缩减内容后再导入。」 |
| 缺 manifest | 「作品包缺少 manifest.json。」 |
| manifest 不是合法 JSON | 「作品包清单无法解析，可能已损坏。」 |
| format 不符 | 「这不是暮幕作品包。」 |
| formatVersion 不是正整数 | 「包格式版本 vX 不是有效的版本号，请检查作品包是否损坏。」 |
| formatVersion 过高 | 「包格式版本 vX 高于当前暮幕支持的 v1，请升级暮幕。」 |
| schemaVersion 不是正整数 | 「包内容版本 vX 不是有效的版本号，请检查作品包是否损坏。」 |
| schemaVersion 过高 | 「包内容版本 vX 高于当前暮幕支持的 v2，请升级暮幕后再打开。」 |
| works 为空 | 「作品包里没有作品。」 |
| 章节未声明 file | 「作品包缺少第 N 章的剧本文件。」 |
| 章节文件不在包内 | 「作品包缺少第 N 章的剧本文件（xxx.txt）。」 |
| 单章文本超限 | 「第 N 章的剧本文件超过 5MB，请拆分后再导入。」 |
| 单章解析失败 | 「第 N 章《标题》解析失败：<解析器原始提示>」 |

**导出期硬错误**（弹出提示，不写任何本地数据）：

| 情况 | 文案 |
|---|---|
| 没有可导出的作品 | 「没有可导出的作品。」 |
| 单章导出传了多个作品 | 「单章导出只支持一个作品，请改为导出整本。」 |
| 作品既无原文也无法重建文本 | 「《xxx》没有可导出的文本内容。」 |
| 打包后超限 | 「作品包超过 32MB，请缩减内容后再导出。」 |
| 重建文本时遇到未知节点类型 | 「未知的节点类型“xxx”，无法导出为剧本文本。」 |

**ZIP 层文案**（只在 `.zip` 剧本导入路径上直接可见；作品包导入路径收敛为上表第 3 行）：

| 情况 | 文案 |
|---|---|
| 找不到 EOCD | 「无法识别该压缩包，请确认它是标准 .zip 文件。」 |
| 结构损坏 | 「压缩包结构已损坏，请重新导出后再试。」 |
| 环境不支持 deflate-raw | 「当前浏览器不支持解压 zip，请升级到较新的浏览器，或直接导入 .txt 文件。」 |
| 内容损坏 | 「压缩包内容已损坏，请重新导出后再试。」 |
| 不支持的压缩方式 | 「压缩包使用了不支持的压缩方式。」 |

**警告（warnings，不等于失败）**：`exportPackage()` 与 `importPackage()` 都返回
`warnings: string[]`，UI 以 toast 逐条提示，不静默吞掉。

| 情况 | 文案 |
|---|---|
| 导出时封面格式无法识别 | 「封面图片格式无法识别，已跳过封面。」 |
| 导出 / 导入时封面超过 4MB | 「封面图片超过 4MB，已跳过封面。」 |
| 导入时包内没有封面文件 | 「作品包内没有封面文件，已跳过封面。」 |
| 导入时封面处理失败 | 「封面图片处理失败，已跳过封面。」 |
| 导入时封面条目无法识别 | 「作品包内的封面条目无法识别，已跳过封面。」 |

有 warning **不等于导入失败**：作品照样入库，只是封面没带上。

导入失败**不写入任何数据**，错误以红色文案显示在导入弹窗内（沿用现有 `#import-msg`）；
导出错误与警告通过页面底部提示条显示，提示是**队列**，逐条出现，不会互相覆盖。

---

## 6. 剧本序列化兜底（nodes → DSL 文本）

历史导入的自定义剧本（在本功能之前导入）没有保留 `source`，因此需要一条从解析结果重建原文的路径。

新增 `scripts/serialize.js`，导出 `serializeScript(script) → string`：

- 反查映射：`SCENES / TIMES / CAMS / POSES / ACTS / VIEWS / MODELS` 的 key → `label`（中文），还原为作者看得懂的写法。
- 角色块：`角色：` + 每行 `名字 | 性别 | 发型 | 衣色 | 模型`；性别 `f→女`、`m→男`；发型 `long→长发`、`short→短发`；衣色用十六进制原样写出（解析器接受 `#rrggbb`）；模型用 `MODELS[key].label`。
- 节点映射：
  | 节点 | 输出 |
  |---|---|
  | `scene` | `【场景：X | Y | Z】` |
  | `cam` | `【镜头：X】` |
  | `pose` | `【姿态：who\|X】`（无 who 时省略竖线） |
  | `action` | `【动作：who\|X】` |
  | `view` | `【视角：X】` |
  | `enter` | `【出场：a\|b】` |
  | `clear` | `【清场】` |
  | `say`（带 pose） | `who（表情）：text` |
  | `say`（带 voice） | `who（录音）：text` |
  | `say`（带 note） | `who（语气备注）：text` |
  | `say`（旁白） | `旁白：text` |
  | `choice` | 每选项一行 `> 文本 -> 标签` |
  | `jump` | `-> 标签` |
  | `end` | `【结束：ending】` / `【结束】` |
- 标签：`labels` 的 value 是**节点下标**，序列化时在下标对应节点之前输出 `[标签]` 行；同名标签只输出一次。
- 已知限制：`note`（语气备注）内容若恰好是情绪别名（如「开心」）会被解析成 pose 节点；这是解析器既有语义，序列化器不额外规避，文档中注明。

单测覆盖往返：`parseScriptText(serializeScript(sc))` 的节点序列与原脚本等价（类型、文本、选项、跳转目标一致）。

---

## 7. 体积与存储限额

| 项 | 限额 | 超限处理 |
|---|---|---|
| 整包体积 | 32MB | 拒绝导入并报错 |
| 单个资源 | 4MB | 跳过该资源，提示「封面图片超过 4MB，已跳过封面。」 |
| 封面入库尺寸 | ≤640px 的 JPEG（quality 0.82） | 通过 `createImageBitmap` + canvas 缩放；缩放失败时回退为原图 data URL（若 ≤2MB），否则跳过 |
| 作品文本 | 沿用 `LIMITS.maxChars` 30000 字上限 | 解析器既有校验 |

封面缩放实现依赖浏览器 `createImageBitmap` 与 canvas；Node 单测只验证数据流与限额分支，不跑图像编解码。

---

## 8. 代码结构

### 8.1 新增文件

| 文件 | 职责 |
|---|---|
| `scripts/zip.js` | ZIP 读写：`unzipEntries` / `extractEntry`（从 `parser.js` 迁出并导出）、`readZipEntries(buf)`、`writeZip(files) → Blob`、CRC-32 |
| `scripts/package.js` | manifest 构造 / 校验 / 迁移、`exportWorkPackage` / `exportSeriesPackage` / `importPackage`、封面 data URL 处理 |
| `scripts/serialize.js` | `serializeScript(script) → DSL 文本` |
| `tests/zip.test.mjs` | ZIP 往返、stored/deflate 两种方法、CRC 正确性、坏包报错 |
| `tests/package.test.mjs` | manifest 校验、v1→v2 迁移、单章/整本导出、导入往返、id 冲突改名、错误文案 |
| `tests/serialize.test.mjs` | 序列化往返等价、标签位置正确 |
| `docs/mumu-package-spec.md` | 面向作者的创作手册章节（包结构、如何写、许可证、兼容性） |

### 8.2 修改文件

| 文件 | 改动 |
|---|---|
| `scripts/parser.js` | ZIP 相关函数改为从 `scripts/zip.js` 导入（行为不变）；`readFileToScript` 保留 `script.source = text` |
| `scripts/builtin.js` | `loadBuiltinScripts()` 为每个剧本补 `sc.source = s.text` |
| `scripts/modals.js` | 曲目卡 / 单章卡 / 章节行加导出按钮；`openImport` 支持 `.mumu`；封面用 `coverImage` 作背景 |
| `scripts/main.js` | 接线导出回调（`exportWorkPackage` / `exportSeriesPackage`）、导入分流与 toast |
| `styles/main.css` | 封面图背景、导出按钮在卡片内的排版 |
| `README.md` | 目录结构新增三个模块与两个测试文件；新增「作品包」小节 |
| `AGENTS.md` | 速查表新增「作品包导入导出」行；自检清单新增导入 `.mumu` 一条 |

### 8.3 依赖与边界

- `scripts/package.js` 依赖 `scripts/zip.js`、`scripts/parser.js`（`parseScriptText` / `countChars`）、`scripts/storage.js`（`addCustomScript`）。
- `scripts/package.js` **不依赖** `scripts/modals.js` / `scripts/main.js` / DOM（除封面缩放所需的浏览器 API，且带降级），因此可在 Node 单测中运行。
- `scripts/modals.js` 只调用 `package.js` 暴露的纯函数，不直接碰 ZIP。

---

## 9. 测试策略

### 9.1 单元测试（`node --test`，零依赖）

1. `zip.test.mjs`：空包、单文件往返、中文文件名往返、deflate 与 stored 两种方法都能读回、CRC 校验、截断包报错。
2. `package.test.mjs`：
   - manifest 校验：缺字段 / format 不符 / 版本过高 / works 为空 / 缺章节文件，各对应既定文案；
   - 迁移：v1 manifest 经迁移后 `schemaVersion===2` 且 `works`/`assets` 形状正确；
   - 导出：单章包与整本包各生成一次，条目名与 manifest 一致；
   - 导入往返：导出 → 解包 → 导入 → 解析结果与原剧本逐节点等价；
   - 冲突：与内置曲目同名时 series id 变为 `user:` 前缀；同 id 再导入为更新而非重复。
3. `serialize.test.mjs`：往返等价、标签位置、角色块格式、voice / pose / note 三种括号形态。

### 9.2 浏览器回归（`node serve.js` + 浏览器）

1. 入口链路不变：首页 → 开始体验 → 选择剧本 → 四张内置曲目卡 + 章节列表。
2. 剧本库曲目卡点「导出整本」→ 浏览器下载 `.mumu`；用文件选择器导入该包 → 出现为新的曲目卡 → 点开章节可正常播放 → 走完一条分支。
3. 单章导出 → 导入 → 独立卡片 → 可播放。
4. 导入一个故意写坏的包（缺 manifest / 章节文件缺失 / 剧本语法错误）→ 弹窗内出现对应中文错误，且作品库无新增项。
5. 控制台无错误、无 404。

### 9.3 验收定义（对应计划表 P0-2 完成定义）

- [ ] 导出的包可在另一台浏览器导入并原样播放（逐节点等价）。
- [ ] schema 版本可迁移（v1 → v2 有可执行迁移并有单测）。
- [ ] 单章与整本两种粒度都能导出与导入。
- [ ] 导入失败有可读中文原因，且不污染本地作品库。
- [ ] 既有十五章播放、存档、导入文本剧本行为无回归。

---

## 10. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-11-23 | 首版：确定 ZIP 容器、单章 + 整本双粒度、manifest schema v2、v1→v2 迁移链、导入导出流程、序列化兜底与验收口径 |
| v1.1 | 2026-11-23 | 明确导入分组规则：`kind=work` 恒为独立卡片，`kind=series` 才成曲目卡；补充内置 id 冲突一律加 `user:` 前缀 |
