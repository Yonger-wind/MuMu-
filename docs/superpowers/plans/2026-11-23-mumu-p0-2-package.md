# 暮幕 P0-2 · 作品包 `.mumu` 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让一部暮幕作品（单章或整本曲目）能被导出成 `.mumu` 作品包、在另一台浏览器原样导入播放，并具备可执行的 schema 迁移链。

**Architecture:** 新增三个零依赖模块：`scripts/zip.js`（ZIP 读写，CRC-32 + deflate-raw）、`scripts/package.js`（manifest 构造 / 校验 / 迁移 / 导出 / 导入）、`scripts/serialize.js`（解析结果 nodes → DSL 文本的序列化兜底）。既有 `scripts/parser.js` 的 ZIP 读取代码迁到 `zip.js` 并保持行为不变；`scripts/builtin.js` 与 `readFileToScript` 额外保留剧本原文 `source`，让导出永远可用。UI 只在 `modals.js` / `main.js` 上做增量接线，不改页面布局。

**Tech Stack:** 原生 ES Modules + Canvas/浏览器 API；ZIP 用内置 `CompressionStream('deflate-raw')` / `DecompressionStream('deflate-raw')`；单测用 Node 内置 `node:test`（零依赖，无 package.json）。

**Spec:** `docs/superpowers/specs/2026-11-23-mumu-package-format-design.md`（本计划逐条对应该 spec 的 §1–§10）

## Global Constraints

以下约束来自 spec 与 `AGENTS.md`，每个任务都隐含遵守：

- 不引入第三方依赖、不加构建步骤、**不得新增根 `package.json`**（`serve.js` 与 `tools/png-alpha.js` 是 CommonJS）。
- 不整体重构 UI 与页面布局；只在既有元素上做增量接线。
- 既有十五章内置剧本播放、存档（`mumu.saves.v2`，旧 `mumu.saves.v1` 可读）、文本剧本导入、分镜与人物外观**零回归**。
- 解析器 / 引擎向后兼容：旧剧本（无舞台指示、4 列角色行）照常播放。
- 人物只来自 `assets/models/*.cut.png`，不按姓名推断外观；不新增勾边。
- 所有面向用户的错误文案用中文，且必须给出**可读原因**；失败**不写入任何数据**。
- 容器格式：ZIP（`.mumu`），条目名用 `/` 分隔，UTF-8 文件名标志位（flag bit 11）置 1。
- `formatVersion` 当前为 `1`；`schemaVersion` 当前为 `2`；版本过高必须拒绝并提示升级。
- 限额：整包 ≤ 32MB；单个资源 ≤ 4MB；封面入库 ≤ 640px JPEG。
- 单测命令：仓库根目录 `node --test`（自动发现 `tests/*.test.mjs`）；单文件用 `node --test tests/<file>.test.mjs`。**不要用 `node --test tests/`**（会失败）。
- 提交信息带阶段编号，如 `feat(P0-2): ...`；提交前跑一次 `node --test` 确认全绿。

---

### Task 1: ZIP 读写模块 `scripts/zip.js`

**Files:**
- Create: `scripts/zip.js`
- Modify: `scripts/parser.js`（删除本地 ZIP 实现，改为从 `zip.js` 导入；行为不变）
- Test: `tests/zip.test.mjs`

**Interfaces:**
- Consumes: 无（纯底层模块）。
- Produces:
  - `export function zipFail(msg: string): Error` —— 构造带 `userFacing = true` 的错误。
  - `export function crc32(bytes: Uint8Array): number` —— 标准 CRC-32（多项式 `0xedb88320`）。
  - `export async function unzipEntries(buf: ArrayBuffer): Promise<{entries: Array, dv: DataView, u8: Uint8Array}>` —— 从 `parser.js` 原样迁出。
  - `export async function extractEntry(z, e): Promise<Uint8Array>` —— 从 `parser.js` 原样迁出。
  - `export async function readZipEntries(buf: ArrayBuffer): Promise<Map<string, Uint8Array>>` —— 全部条目 → Map。
  - `export async function writeZip(files: Array<{name: string, data: Uint8Array | string}>): Promise<Uint8Array>` —— 写出 ZIP 字节。

- [x] **Step 1: 写失败测试 `tests/zip.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeZip, readZipEntries, crc32 } from '../scripts/zip.js';

const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

test('crc32 与标准向量一致', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('写入再读回：文本条目内容一致', async () => {
  const bytes = await writeZip([
    { name: 'manifest.json', data: '{"a":1}' },
    { name: 'chapters/01.txt', data: '第一章' },
  ]);
  const entries = await readZipEntries(ab(bytes));
  assert.equal(new TextDecoder().decode(entries.get('manifest.json')), '{"a":1}');
  assert.equal(new TextDecoder().decode(entries.get('chapters/01.txt')), '第一章');
});

test('中文条目名可读回', async () => {
  const bytes = await writeZip([{ name: '章节/第一章.txt', data: 'x' }]);
  const entries = await readZipEntries(ab(bytes));
  assert.ok(entries.has('章节/第一章.txt'));
});

test('二进制条目读回字节一致', async () => {
  const raw = new Uint8Array([0, 1, 2, 250, 251, 255]);
  const bytes = await writeZip([{ name: 'assets/cover.jpg', data: raw }]);
  const entries = await readZipEntries(ab(bytes));
  assert.deepEqual(Array.from(entries.get('assets/cover.jpg')), Array.from(raw));
});

test('非 ZIP 数据报错且带 userFacing 标记', async () => {
  await assert.rejects(
    () => readZipEntries(new Uint8Array([1, 2, 3, 4, 5]).buffer),
    (e) => e.userFacing === true,
  );
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --test tests/zip.test.mjs`
Expected: FAIL —— `Cannot find module '../scripts/zip.js'`。

- [x] **Step 3: 实现 `scripts/zip.js`**

```javascript
/* ============================================================
   暮幕 · 最小 ZIP 读写（零依赖）
   读：中央目录 + stored / deflate-raw；写：local header + central directory + EOCD
   依赖浏览器与 Node 内置的 CompressionStream / DecompressionStream
   ============================================================ */

export function zipFail(msg) {
  const e = new Error(msg);
  e.userFacing = true;
  return e;
}

/* ---------- CRC-32 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- 读 ---------- */
export async function unzipEntries(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw zipFail('无法识别该压缩包，请确认它是标准 .zip 文件。');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  const dec = new TextDecoder('utf-8');
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flag = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, csize, localOff, flag });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return { entries, dv, u8 };
}

export async function extractEntry({ dv, u8 }, e) {
  const p = e.localOff;
  const nameLen = dv.getUint16(p + 26, true);
  const extraLen = dv.getUint16(p + 28, true);
  const start = p + 30 + nameLen + extraLen;
  const data = u8.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  if (e.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw zipFail('当前浏览器不支持解压 zip，请升级到较新的浏览器，或直接导入 .txt 文件。');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw zipFail('压缩包使用了不支持的压缩方式。');
}

/** 读出全部条目：Map<条目名, 字节> */
export async function readZipEntries(buf) {
  const z = await unzipEntries(buf);
  const out = new Map();
  for (const e of z.entries) {
    if (e.name.endsWith('/')) continue;
    out.set(e.name, await extractEntry(z, e));
  }
  return out;
}

/* ---------- 写 ---------- */
function dosStamp(d = new Date()) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) {
    return null;
  }
}

/**
 * 写出 ZIP 字节。
 * files: [{ name, data }]，data 可以是 Uint8Array 或字符串。
 * 压缩优先 deflate-raw；压不小则退回 stored。
 */
export async function writeZip(files) {
  const enc = new TextEncoder();
  const { time, date } = dosStamp();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(raw);
    let method = 0;
    let body = raw;
    const packed = await deflateRaw(raw);
    if (packed && packed.length < raw.length) { method = 8; body = packed; }

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);       // UTF-8 文件名
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    parts.push(local, body);
    central.push(cd);
    offset += local.length + body.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, eocd];
  const total = all.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of all) { out.set(part, p); p += part.length; }
  return out;
}
```

- [x] **Step 4: 让 `scripts/parser.js` 改用 `zip.js`（行为不变）**

在 `scripts/parser.js` 顶部 import 区加：

```javascript
import { unzipEntries, extractEntry } from './zip.js';
```

删除 `parser.js` 里 `unzipEntries` 与 `extractEntry` 两个函数的**定义**（保留 `readFromZip` 与 `docxToText` 调用它们的用法不变）。`readFromZip` 里对压缩包类型的报错文案保持原样。

> 注意：`parser.js` 的 `fail()` 产生的错误带 `userFacing`，`zip.js` 的 `zipFail()` 同样带 `userFacing`，导入弹窗的错误显示逻辑（`e.userFacing ? e.message : ...`）不受影响。

- [x] **Step 5: 运行测试确认通过**

Run: `node --test tests/zip.test.mjs`
Expected: PASS —— 5 个用例全绿。

Run: `node --test`
Expected: PASS —— 原有 23 个用例仍然全绿（解析器行为未变）。

- [x] **Step 6: 提交**

```bash
git add scripts/zip.js scripts/parser.js tests/zip.test.mjs
git commit -m "feat(P0-2): 抽出零依赖 ZIP 读写模块（CRC-32 + deflate-raw），解析器改用共享实现"
```

---

### Task 2: manifest 构造 / 校验 / 迁移 `scripts/package.js`（第一部分）

**Files:**
- Create: `scripts/package.js`
- Create: `tests/package.test.mjs`
- Test: `tests/package.test.mjs`

**Interfaces:**
- Consumes: `scripts/parser.js` 的 `parseScriptText` / `countChars`（本任务暂不调用，留给 Task 4/5）。
- Produces:
  - `export const PACKAGE_FORMAT = 'mumu-package'`
  - `export const FORMAT_VERSION = 1`
  - `export const SCHEMA_VERSION = 2`
  - `export const MAX_PACKAGE_BYTES = 32 * 1024 * 1024`
  - `export const MAX_ASSET_BYTES = 4 * 1024 * 1024`
  - `export const MIGRATIONS = { 1: migrateV1toV2 }`
  - `export function pkgFail(msg): Error` —— 产出带 `userFacing = true` 的中文错误。
  - `export function makeManifest(opts): object`
  - `export function migrateManifest(manifest): object` —— 循环应用 `MIGRATIONS` 直到 `schemaVersion` 收敛；不认识的版本号原样返回（由 `validateManifest` 拒绝）；缺少 `schemaVersion` 时按 v1 处理。
  - `export function validateManifest(manifest): object` —— 校验并回填缺省字段；失败抛 `userFacing` 错误。

- [x] **Step 1: 写失败测试 `tests/package.test.mjs`（本任务部分）**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_FORMAT, FORMAT_VERSION, SCHEMA_VERSION,
  MAX_PACKAGE_BYTES, MAX_ASSET_BYTES, MIGRATIONS, pkgFail,
  makeManifest, migrateManifest, validateManifest,
} from '../scripts/package.js';

test('常量与 spec 一致', () => {
  assert.equal(PACKAGE_FORMAT, 'mumu-package');
  assert.equal(FORMAT_VERSION, 1);
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(MAX_PACKAGE_BYTES, 32 * 1024 * 1024);
  assert.equal(MAX_ASSET_BYTES, 4 * 1024 * 1024);
});

test('pkgFail 产出带 userFacing 的错误', () => {
  const e = pkgFail('出错了。');
  assert.ok(e instanceof Error);
  assert.equal(e.userFacing, true);
  assert.equal(e.message, '出错了。');
});

test('MIGRATIONS 含 v1 迁移器', () => {
  assert.ok(Object.prototype.hasOwnProperty.call(MIGRATIONS, 1));
  assert.equal(typeof MIGRATIONS[1], 'function');
});

test('makeManifest 产出完整字段', () => {
  const m = makeManifest({
    kind: 'work', id: 'w1', title: '测试剧', summary: '简介', author: '作者',
    series: null, license: null, assets: [], works: [{ id: 'w1', title: '测试剧', tag: '第一章', chapterNo: 1, chars: 12 }],
  });
  assert.equal(m.format, PACKAGE_FORMAT);
  assert.equal(m.formatVersion, FORMAT_VERSION);
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.equal(m.kind, 'work');
  assert.equal(m.works.length, 1);
  assert.equal(m.works[0].file, 'script.txt');
  assert.deepEqual(m.license, { type: '未指定', holder: '未署名', allowRemix: true });
  assert.equal(m.engine.minVersion, 1);
  assert.ok(typeof m.createdAt === 'string' && m.createdAt.length > 10);
});

test('校验通过并回填缺省字段', () => {
  const m = validateManifest({
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2,
    id: 'x', title: 'X', works: [{ id: 'a', title: 'A', file: 'script.txt' }],
  });
  assert.equal(m.series, null);
  assert.equal(m.summary, '');
  assert.deepEqual(m.license, { type: '未指定', holder: '未署名', allowRemix: true });
  assert.equal(m.assets.length, 0);
});

test('format 不符时报错', () => {
  assert.throws(
    () => validateManifest({ format: 'other', formatVersion: 1, schemaVersion: 2, works: [{ id: 'a', title: 'A', file: 'script.txt' }] }),
    (e) => e.userFacing === true && e.message.includes('不是暮幕作品包'),
  );
});

test('formatVersion 过高时报错', () => {
  assert.throws(
    () => validateManifest({ format: 'mumu-package', formatVersion: 9, schemaVersion: 2, works: [{ id: 'a', title: 'A', file: 'script.txt' }] }),
    (e) => e.userFacing === true && e.message.includes('包格式版本'),
  );
});

test('schemaVersion 过高时报错', () => {
  assert.throws(
    () => validateManifest({ format: 'mumu-package', formatVersion: 1, schemaVersion: 9, works: [{ id: 'a', title: 'A', file: 'script.txt' }] }),
    (e) => e.userFacing === true && e.message.includes('包内容版本'),
  );
});

test('works 为空时报错', () => {
  assert.throws(
    () => validateManifest({ format: 'mumu-package', formatVersion: 1, schemaVersion: 2, works: [] }),
    (e) => e.userFacing === true && e.message.includes('没有作品'),
  );
});

test('v1 manifest 迁移到 v2 后形状正确', () => {
  const v1 = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 1,
    id: 'x', title: 'X',
    chapters: [{ id: 'c1', title: '第一章', file: 'script.txt' }],
    assets: { cover: 'assets/cover.jpg' },
  };
  const m = migrateManifest(v1);
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.equal(m.kind, 'work');
  assert.equal(m.works.length, 1);
  assert.equal(m.works[0].id, 'c1');
  assert.equal(m.works[0].format, 'text');
  assert.equal(m.works[0].chapterNo, 1);
  assert.equal(m.assets.length, 1);
  assert.equal(m.assets[0].id, 'cover');
  assert.equal(m.assets[0].role, 'cover');
  assert.equal(m.assets[0].file, 'assets/cover.jpg');
});

/* ---------- F1：license 逐字段兜底 ---------- */

test('license 缺 type 时按「未指定」兜底', () => {
  const m = validateManifest({
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2,
    works: [{ id: 'a', title: 'A', file: 'script.txt' }],
    license: { holder: '张三' },
  });
  assert.equal(m.license.type, '未指定');
  assert.equal(m.license.holder, '张三');
  assert.equal(m.license.allowRemix, true);
});

test('license 缺 holder 时按「未署名」兜底', () => {
  const m = validateManifest({
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2,
    works: [{ id: 'a', title: 'A', file: 'script.txt' }],
    license: { type: 'CC BY-NC 4.0' },
  });
  assert.equal(m.license.type, 'CC BY-NC 4.0');
  assert.equal(m.license.holder, '未署名');
  assert.equal(m.license.allowRemix, true);
});

test('license 字段为 undefined 时同样兜底', () => {
  const m = validateManifest({
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2,
    works: [{ id: 'a', title: 'A', file: 'script.txt' }],
    license: { type: undefined, holder: undefined },
  });
  assert.equal(m.license.type, '未指定');
  assert.equal(m.license.holder, '未署名');
});

test('makeManifest 的 license 同样逐字段兜底', () => {
  const m = makeManifest({ kind: 'work', id: 'w', title: 'T', license: { type: '署名-非商业' } });
  assert.equal(m.license.type, '署名-非商业');
  assert.equal(m.license.holder, '未署名');
});

/* ---------- F2：v1 迁移按扩展名推断 assets[].type ---------- */

test('v1 迁移按扩展名推断 assets type', () => {
  const v1 = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 1,
    id: 'x', title: 'X',
    chapters: [{ id: 'c1', title: '第一章', file: 'script.txt' }],
    assets: { cover: 'assets/cover.png', banner: 'assets/banner.webp', note: 'assets/note.txt' },
  };
  const m = migrateManifest(v1);
  assert.equal(m.assets.length, 3);
  assert.equal(m.assets[0].type, 'image/png');
  assert.equal(m.assets[1].type, 'image/webp');
  assert.equal(m.assets[2].type, '');
});

test('v1 迁移的 jpg 封面推断为 image/jpeg', () => {
  const v1 = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 1,
    chapters: [{ id: 'c1', title: '第一章', file: 'script.txt' }],
    assets: { cover: 'assets/cover.JPG' },
  };
  const m = migrateManifest(v1);
  assert.equal(m.assets[0].type, 'image/jpeg');
});

/* ---------- F3：版本字段类型校验 ---------- */

test('formatVersion 非数字时报错', () => {
  assert.throws(
    () => validateManifest({ format: 'mumu-package', formatVersion: '9', schemaVersion: 2, works: [{ id: 'a', title: 'A', file: 'script.txt' }] }),
    (e) => e.userFacing === true && e.message.includes('包格式版本'),
  );
});

test('formatVersion 非正整数时报错', () => {
  assert.throws(
    () => validateManifest({ format: 'mumu-package', formatVersion: 1.5, schemaVersion: 2, works: [{ id: 'a', title: 'A', file: 'script.txt' }] }),
    (e) => e.userFacing === true && e.message.includes('包格式版本'),
  );
});

test('schemaVersion 非数字时报错', () => {
  assert.throws(
    () => validateManifest({ format: 'mumu-package', formatVersion: 1, schemaVersion: '1', works: [{ id: 'a', title: 'A', file: 'script.txt' }] }),
    (e) => e.userFacing === true && e.message.includes('包内容版本'),
  );
});

test('缺少 schemaVersion 的 v1 形状包仍会被迁移', () => {
  const m = validateManifest({
    format: 'mumu-package', formatVersion: 1, id: 'x', title: 'X',
    chapters: [{ id: 'c1', title: '第一章', file: 'script.txt' }],
  });
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.equal(m.works.length, 1);
  assert.equal(m.works[0].id, 'c1');
  assert.equal(m.works[0].chapterNo, 1);
});

test('缺少 schemaVersion 的 v2 形状包保留 works', () => {
  const m = validateManifest({
    format: 'mumu-package', formatVersion: 1, id: 'x', title: 'X',
    works: [{ id: 'w1', title: 'W1', file: 'script.txt' }],
  });
  assert.equal(m.schemaVersion, SCHEMA_VERSION);
  assert.equal(m.works.length, 1);
  assert.equal(m.works[0].id, 'w1');
  assert.equal(m.works[0].chapterNo, 1);
});

test('缺少 formatVersion 时按当前支持版本处理', () => {
  const m = validateManifest({
    format: 'mumu-package', schemaVersion: 2,
    works: [{ id: 'a', title: 'A', file: 'script.txt' }],
  });
  assert.equal(m.formatVersion, FORMAT_VERSION);
});

/* ---------- F4：makeManifest 默认值 ---------- */

test('makeManifest 缺 chapterNo 与 id 时按下标兜底', () => {
  const m = makeManifest({
    kind: 'series', id: 's', title: '曲目',
    works: [{ title: '第一章' }, { title: '第二章' }],
  });
  assert.equal(m.works[0].chapterNo, 1);
  assert.equal(m.works[1].chapterNo, 2);
  assert.equal(m.works[0].id, 'chapter_1');
  assert.equal(m.works[1].id, 'chapter_2');
  assert.equal(m.works[1].file, 'chapters/02.txt');
});

test('makeManifest 显式传入的 chapterNo 保留', () => {
  const m = makeManifest({ kind: 'work', id: 'w', title: 'T', works: [{ id: 'x', title: 'T', chapterNo: 3 }] });
  assert.equal(m.works[0].chapterNo, 3);
  assert.equal(m.works[0].id, 'x');
});

/* ---------- F5：已实现但缺测试的错误分支 ---------- */

test('清单不是对象时报错', () => {
  assert.throws(
    () => validateManifest(null),
    (e) => e.userFacing === true && e.message.includes('无法解析'),
  );
  assert.throws(
    () => validateManifest('not a manifest'),
    (e) => e.userFacing === true && e.message.includes('无法解析'),
  );
});

test('works 条目缺 file 时报错', () => {
  assert.throws(
    () => validateManifest({ format: 'mumu-package', formatVersion: 1, schemaVersion: 2, works: [{ id: 'a', title: 'A' }] }),
    (e) => e.userFacing === true && e.message.includes('作品包缺少第 1 章的剧本文件'),
  );
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --test tests/package.test.mjs`
Expected: FAIL —— `Cannot find module '../scripts/package.js'`。

- [x] **Step 3: 实现 `scripts/package.js`（本任务部分）**

```javascript
/* ============================================================
   暮幕 · 作品包（.mumu）
   包 = ZIP 容器：manifest.json + 剧本文本 + 可选资源
   本模块不依赖 DOM（封面缩放除外，失败时降级），可在 Node 单测中运行
   ============================================================ */

export const PACKAGE_FORMAT = 'mumu-package';
export const FORMAT_VERSION = 1;
export const SCHEMA_VERSION = 2;
export const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

export function pkgFail(msg) {
  const e = new Error(msg);
  e.userFacing = true;
  return e;
}

/* ---------- manifest 构造 ---------- */
const DEFAULT_LICENSE = { type: '未指定', holder: '未署名', allowRemix: true };

/** 逐字段合并许可证：type / holder 缺失时分别按「未指定」「未署名」兜底（spec §3.2） */
function mergeLicense(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = { ...DEFAULT_LICENSE, ...src };
  if (typeof out.type !== 'string' || !out.type) out.type = DEFAULT_LICENSE.type;
  if (typeof out.holder !== 'string' || !out.holder) out.holder = DEFAULT_LICENSE.holder;
  if (typeof out.allowRemix !== 'boolean') out.allowRemix = DEFAULT_LICENSE.allowRemix;
  return out;
}

/** 按扩展名推断资源 MIME（spec §3.3）；无法识别时返回空串 */
function inferAssetType(file) {
  const name = String(file || '');
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return '';
}

export function makeManifest(opts) {
  const kind = opts.kind === 'series' ? 'series' : 'work';
  const works = (opts.works || []).map((w, i) => ({
    id: w.id || `chapter_${i + 1}`,
    title: w.title || '',
    tag: w.tag || '',
    chapterNo: Number.isInteger(w.chapterNo) ? w.chapterNo : i + 1,
    file: w.file || (kind === 'series' ? `chapters/${String(i + 1).padStart(2, '0')}.txt` : 'script.txt'),
    format: 'text',
    chars: w.chars || 0,
  }));
  return {
    format: PACKAGE_FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    kind,
    id: opts.id || '',
    title: opts.title || '',
    summary: opts.summary || '',
    author: opts.author || '',
    series: opts.series || null,
    license: mergeLicense(opts.license),
    engine: { minVersion: 1 },
    works,
    assets: opts.assets || [],
    createdAt: opts.createdAt || new Date().toISOString(),
    generator: '暮幕 MuMU',
  };
}

/* ---------- schema 迁移 ---------- */
/** 规范化单条 works（迁移与回填共用）：缺省 id / tag / chapterNo / format / chars */
function normalizeWork(w, i) {
  const src = w && typeof w === 'object' ? w : {};
  const chapterNo = Number.isInteger(src.chapterNo) && src.chapterNo > 0 ? src.chapterNo : i + 1;
  return {
    id: src.id || `chapter_${i + 1}`,
    title: src.title || '',
    tag: src.tag || src.title || '',
    chapterNo,
    file: src.file || 'script.txt',
    format: src.format || 'text',
    chars: typeof src.chars === 'number' ? src.chars : 0,
  };
}

function migrateV1toV2(m) {
  // 无 chapters 但已有 works（v2 形状漏写 schemaVersion）时保留并规范化 works
  const hasChapters = Array.isArray(m.chapters) && m.chapters.length > 0;
  const works = hasChapters
    ? m.chapters.map(normalizeWork)
    : (Array.isArray(m.works) ? m.works.map(normalizeWork) : []);
  const assets = [];
  if (Array.isArray(m.assets)) {
    assets.push(...m.assets);
  } else {
    const src = m.assets && typeof m.assets === 'object' ? m.assets : {};
    for (const [key, file] of Object.entries(src)) {
      assets.push({
        id: key,
        role: key === 'cover' ? 'cover' : key,
        file,
        type: inferAssetType(file),
        bytes: 0,
      });
    }
  }
  return {
    ...m,
    schemaVersion: SCHEMA_VERSION,
    kind: works.length > 1 ? 'series' : 'work',
    summary: m.summary || '',
    author: m.author || '',
    series: m.series || null,
    license: mergeLicense(m.license),
    engine: m.engine || { minVersion: 1 },
    works,
    assets,
  };
}

export const MIGRATIONS = {
  1: migrateV1toV2,
};

/** 循环迁移直到 schemaVersion 收敛；未知版本号原样返回（交给 validateManifest 拒绝）
 *  缺少 schemaVersion 时按 v1 处理，便于迁移老形状的包 */
export function migrateManifest(manifest) {
  let m = manifest;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
  let guard = 0;
  while (guard < 10) {
    const sv = m.schemaVersion === undefined || m.schemaVersion === null ? 1 : m.schemaVersion;
    if (typeof sv !== 'number' || !Number.isInteger(sv) || sv >= SCHEMA_VERSION) break;
    const fn = MIGRATIONS[sv];
    if (!fn) break;
    m = fn(m);
    guard += 1;
  }
  return m;
}

/* ---------- 校验 ---------- */
export function validateManifest(input) {
  const m = migrateManifest(input);
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw pkgFail('作品包清单无法解析，可能已损坏。');
  if (m.format !== PACKAGE_FORMAT) throw pkgFail('这不是暮幕作品包。');
  if (m.formatVersion === undefined || m.formatVersion === null) {
    m.formatVersion = FORMAT_VERSION;
  } else {
    if (!Number.isInteger(m.formatVersion) || m.formatVersion <= 0) {
      throw pkgFail(`包格式版本 v${m.formatVersion} 不是有效的版本号，请检查作品包是否损坏。`);
    }
    if (m.formatVersion > FORMAT_VERSION) {
      throw pkgFail(`包格式版本 v${m.formatVersion} 高于当前暮幕支持的 v${FORMAT_VERSION}，请升级暮幕。`);
    }
  }
  if (m.schemaVersion !== undefined && m.schemaVersion !== null) {
    if (!Number.isInteger(m.schemaVersion) || m.schemaVersion <= 0) {
      throw pkgFail(`包内容版本 v${m.schemaVersion} 不是有效的版本号，请检查作品包是否损坏。`);
    }
    if (m.schemaVersion > SCHEMA_VERSION) {
      throw pkgFail(`包内容版本 v${m.schemaVersion} 高于当前暮幕支持的 v${SCHEMA_VERSION}，请升级暮幕后再打开。`);
    }
  }
  if (!Array.isArray(m.works) || !m.works.length) throw pkgFail('作品包里没有作品。');
  m.works.forEach((w, i) => {
    if (!w || !w.file) throw pkgFail(`作品包缺少第 ${i + 1} 章的剧本文件。`);
    if (!w.id) w.id = `chapter_${i + 1}`;
    if (!w.title) w.title = w.id;
    if (!w.tag) w.tag = w.title;
    if (typeof w.chapterNo !== 'number') w.chapterNo = i + 1;
    if (!w.format) w.format = 'text';
    if (typeof w.chars !== 'number') w.chars = 0;
  });
  if (!Array.isArray(m.assets)) m.assets = [];
  m.license = mergeLicense(m.license);
  if (!m.engine) m.engine = { minVersion: 1 };
  if (m.series === undefined) m.series = null;
  if (!m.summary) m.summary = '';
  if (!m.author) m.author = '';
  if (!m.kind) m.kind = m.works.length > 1 ? 'series' : 'work';
  return m;
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `node --test tests/package.test.mjs`
Expected: PASS —— 26 个用例全绿。

- [x] **Step 5: 提交**

```bash
git add scripts/package.js tests/package.test.mjs
git commit -m "feat(P0-2): 作品包 manifest 构造、校验与 v1→v2 schema 迁移"
```

---

### Task 3: 序列化兜底 `scripts/serialize.js` + 解析器标签下标修复

**Files:**
- Create: `scripts/serialize.js`
- Modify: `scripts/parser.js`（`finalize()` 内补场景节点时同步后移标签下标）
- Test: `tests/serialize.test.mjs`

**Interfaces:**
- Consumes: `scripts/parser.js` 导出的 `SCENES / TIMES / CAMS / POSES / ACTS / VIEWS / MODELS`。
- Produces: `export function serializeScript(script): string` —— 把解析结果还原成暮幕 DSL 文本。

- [x] **Step 1: 写失败测试 `tests/serialize.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptText } from '../scripts/parser.js';
import { serializeScript } from '../scripts/serialize.js';

const SAMPLE = `标题：测试剧
简介：一段用于测试的短剧。
角色：
阿蓝 | 女 | 长发 | 白 | 少女（2）
小青 | 男 | 短发 | 白 | 少年

【场景：教室 | 黄昏 | 远景】
放学的教室里只剩下窗外的蝉鸣。

【场景：教室 | 黄昏 | 中景】
阿蓝：今天也卡带了。
小青（开心）：那我们一起修。

[ask]
> 追问磁带 -> ask2
> 假装没注意 -> ignore

[ask2]
阿蓝：磁带里有我们小时候的声音。
【结束：good】

[ignore]
小青：那就明天再说吧。
【结束：plain】`;

test('往返后节点序列与标签一致', () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const again = parseScriptText(serializeScript(sc), 'test.txt');
  assert.equal(again.nodes.length, sc.nodes.length);
  assert.deepEqual(again.nodes.map((n) => n.t), sc.nodes.map((n) => n.t));
  assert.deepEqual(again.labels, sc.labels);
  assert.deepEqual(again.characters.map((c) => c.name), sc.characters.map((c) => c.name));
});

test('台词文本往返不变', () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const again = parseScriptText(serializeScript(sc), 'test.txt');
  const texts = (s) => s.nodes.filter((n) => n.t === 'say').map((n) => n.text);
  assert.deepEqual(texts(again), texts(sc));
});

test('画外音与情绪往返保留', () => {
  const text = `标题：T
简介：s
阿蓝（录音）：我听见了。
小青（难过）：对不起。
【结束】`;
  const sc = parseScriptText(text, 't.txt');
  const again = parseScriptText(serializeScript(sc), 't.txt');
  const v = again.nodes.find((n) => n.voice);
  assert.ok(v, '应保留画外音节点');
  assert.equal(v.voice, '录音');
  assert.equal(v.who, '阿蓝');
  const p = again.nodes.find((n) => n.pose);
  assert.ok(p, '应保留情绪节点');
  assert.equal(p.pose, 'sad');
});

test('剧本以台词开头时标签指向正确的台词', () => {
  const text = `标题：T
简介：s
阿蓝：你好

[here]
阿蓝：再见
【结束】`;
  const sc = parseScriptText(text, 't.txt');
  const idx = sc.labels.here;
  assert.equal(sc.nodes[idx].text, '再见');
});

test('往返后标签仍指向正确的台词（以台词开头的剧本）', () => {
  const text = `标题：T
简介：s
阿蓝：你好

[here]
阿蓝：再见
【结束】`;
  const sc = parseScriptText(text, 't.txt');
  const again = parseScriptText(serializeScript(sc), 't.txt');
  assert.equal(again.nodes[again.labels.here].text, '再见');
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --test tests/serialize.test.mjs`
Expected: FAIL —— `Cannot find module '../scripts/serialize.js'`（且「剧本以台词开头时标签指向正确的台词」在修复前也会失败）。

- [x] **Step 3: 实现 `scripts/serialize.js`**

```javascript
/* ============================================================
   暮幕 · 剧本序列化（解析结果 → DSL 文本）
   用途：早期导入、没保留原文的本地剧本也能导出成作品包
   ============================================================ */

import { SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS } from './parser.js';

const GENDER = { f: '女', m: '男' };
const HAIR = { long: '长发', short: '短发' };

function labelOf(table, key, fallback = '') {
  if (!key) return fallback;
  return table[key] ? table[key].label : fallback;
}

function sceneLabel(key) {
  return labelOf(SCENES, key, key || '教室');
}

/** 把一个解析结果还原成可再次解析的 DSL 文本 */
export function serializeScript(script) {
  const lines = [];
  if (script.title) lines.push(`标题：${script.title}`);
  if (script.summary) lines.push(`简介：${script.summary}`);
  if (script.author) lines.push(`作者：${script.author}`);

  const chars = script.characters || [];
  if (chars.length) {
    lines.push('角色：');
    for (const c of chars) {
      const model = c.model && MODELS[c.model] ? MODELS[c.model].label : '';
      const parts = [
        c.name || '',
        GENDER[c.gender] || '',
        HAIR[c.hairHint] || '',
        c.clothColor || '',
        model,
      ];
      lines.push(parts.join(' | '));
    }
  }

  // 标签下标 = 节点下标，按下标归组
  const labelsAt = new Map();
  for (const [name, idx] of Object.entries(script.labels || {})) {
    if (!labelsAt.has(idx)) labelsAt.set(idx, []);
    labelsAt.get(idx).push(name);
  }

  const nodes = script.nodes || [];
  nodes.forEach((n, i) => {
    for (const name of labelsAt.get(i) || []) lines.push(`[${name}]`);
    switch (n.t) {
      case 'scene':
        lines.push(`【场景：${sceneLabel(n.scene)} | ${labelOf(TIMES, n.time, '黄昏')} | ${labelOf(CAMS, n.cam, '中景')}】`);
        break;
      case 'cam':
        lines.push(`【镜头：${labelOf(CAMS, n.cam, '中景')}】`);
        break;
      case 'pose':
        lines.push(`【姿态：${n.who ? `${n.who}|` : ''}${labelOf(POSES, n.pose, '自然')}】`);
        break;
      case 'action':
        lines.push(`【动作：${n.who ? `${n.who}|` : ''}${labelOf(ACTS, n.action, '站立')}】`);
        break;
      case 'view':
        lines.push(`【视角：${labelOf(VIEWS, n.view, '常规')}】`);
        break;
      case 'enter':
        lines.push(`【出场：${(n.names || []).join('|')}】`);
        break;
      case 'clear':
        lines.push('【清场】');
        break;
      case 'say': {
        const who = n.who || '旁白';
        if (n.pose) lines.push(`${who}（${labelOf(POSES, n.pose, '自然')}）：${n.text}`);
        else if (n.voice) lines.push(`${who}（${n.voice}）：${n.text}`);
        else if (n.note) lines.push(`${who}（${n.note}）：${n.text}`);
        else lines.push(`${who}：${n.text}`);
        break;
      }
      case 'choice':
        for (const o of n.options || []) lines.push(`> ${o.text} -> ${o.to}`);
        break;
      case 'jump':
        lines.push(`-> ${n.to}`);
        break;
      case 'end':
        lines.push(n.ending ? `【结束：${n.ending}】` : '【结束】');
        break;
      default:
        break;
    }
  });

  // 尾部标签（指向最后一个节点之后的位置）也要补上
  for (const name of labelsAt.get(nodes.length) || []) lines.push(`[${name}]`);

  return lines.join('\n');
}
```

- [x] **Step 4: 修复 `scripts/parser.js` 的标签下标错位**

在 `scripts/parser.js` 的 `finalize()` 中，把

```javascript
  } else if (nodes[0].t !== 'scene') {
    nodes.unshift({ t: 'scene', scene: nodes.find((n) => n.t === 'scene').scene, time: 'dusk', cam: 'mid' });
  }
```

改为

```javascript
  } else if (nodes[0].t !== 'scene') {
    nodes.unshift({ t: 'scene', scene: nodes.find((n) => n.t === 'scene').scene, time: 'dusk', cam: 'mid' });
    // 前面补了场景节点，所有标签下标整体后移一位，否则标签会指错台词
    for (const k of Object.keys(labels)) labels[k] += 1;
  }
```

- [x] **Step 5: 运行测试确认通过**

Run: `node --test tests/serialize.test.mjs`
Expected: PASS —— 5 个用例全绿。

Run: `node --test`
Expected: PASS —— 原有 23 个 + Task 1/2 新增用例全绿（解析器行为对既有剧本不变：内置剧本首节点即场景，不会触发 unshift 分支）。

- [x] **Step 6: 提交**

```bash
git add scripts/serialize.js scripts/parser.js tests/serialize.test.mjs
git commit -m "feat(P0-2): 新增 nodes→DSL 序列化兜底，并修正补场景时标签下标错位"
```

---

### Task 4: 导出（单章 / 整本）+ 保留剧本原文

**Files:**
- Modify: `scripts/package.js`（追加导出相关函数）
- Modify: `scripts/parser.js`（`readFileToScript` 保留 `script.source`）
- Modify: `scripts/builtin.js`（`loadBuiltinScripts()` 保留 `sc.source`）
- Test: `tests/package.test.mjs`（追加导出用例）

**Interfaces:**
- Consumes: `scripts/zip.js` 的 `writeZip`；`scripts/parser.js` 的 `parseScriptText` / `countChars`；`scripts/serialize.js` 的 `serializeScript`。
- Produces:
  - `export function dataUrlToBytes(dataUrl): { bytes: Uint8Array, mime: string } | null`
  - `export function bytesToDataUrl(bytes: Uint8Array, mime: string): string`
  - `export async function exportPackage(opts): Promise<{ bytes: Uint8Array, filename: string }>`
    - `opts = { kind: 'work' | 'series', id, title, summary, author, series: {id,title}|null, license: object|null, works: Array<{ id, title, tag, chapterNo, source: string|null, script: object }>, coverImage: string|null }`
  - `export function downloadPackage(bytes: Uint8Array, filename: string): void` —— 浏览器端触发下载。

- [x] **Step 1: 追加失败测试到 `tests/package.test.mjs`**

在文件顶部 import 里补上 `parseScriptText` / `countChars` / `exportPackage` / `dataUrlToBytes` / `bytesToDataUrl`，并追加用例：

```javascript
const SAMPLE = `标题：测试剧
简介：一段用于测试的短剧。
角色：
阿蓝 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 远景】
放学的教室里只剩下窗外的蝉鸣。

【场景：教室 | 黄昏 | 中景】
阿蓝：今天也卡带了。
【结束】`;

test('单章导出：manifest 与条目齐全', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const { bytes, filename } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '简介', author: '作者',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '我的剧本', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  assert.equal(filename, '测试剧.mumu');
  const entries = await readZipEntries(ab(bytes));
  assert.ok(entries.has('manifest.json'));
  assert.ok(entries.has('script.txt'));
  assert.ok(entries.has('README.md'));
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.equal(manifest.kind, 'work');
  assert.equal(manifest.works.length, 1);
  assert.equal(manifest.works[0].file, 'script.txt');
  assert.equal(manifest.works[0].chars, countChars(SAMPLE));
});

test('整本导出：chapters/NN.txt 与 works 顺序', async () => {
  const a = parseScriptText(SAMPLE, 'a.txt');
  const b = parseScriptText(SAMPLE, 'b.txt');
  const { bytes } = await exportPackage({
    kind: 'series', id: 's1', title: '曲目', summary: '简介', author: '',
    series: null, license: { type: 'CC BY-NC 4.0', holder: '作者', allowRemix: true }, coverImage: null,
    works: [
      { id: 's1_01', title: '曲目', tag: '第一章', chapterNo: 1, source: SAMPLE, script: a },
      { id: 's1_02', title: '曲目', tag: '第二章', chapterNo: 2, source: SAMPLE, script: b },
    ],
  });
  const entries = await readZipEntries(ab(bytes));
  assert.ok(entries.has('chapters/01.txt'));
  assert.ok(entries.has('chapters/02.txt'));
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.equal(manifest.kind, 'series');
  assert.equal(manifest.works.length, 2);
  assert.equal(manifest.works[1].file, 'chapters/02.txt');
  assert.equal(manifest.license.type, 'CC BY-NC 4.0');
  assert.ok(entries.has('LICENSE.txt'));
});

test('没有原文时用序列化兜底', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: null, script: sc }],
  });
  const entries = await readZipEntries(ab(bytes));
  const text = new TextDecoder().decode(entries.get('script.txt'));
  assert.ok(text.includes('标题：测试剧'));
  assert.ok(text.includes('阿蓝：今天也卡带了。'));
});

test('封面写入 assets 并记录在 manifest', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const coverImage = bytesToDataUrl(png, 'image/png');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const entries = await readZipEntries(ab(bytes));
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].role, 'cover');
  assert.ok(entries.has(manifest.assets[0].file));
  assert.deepEqual(Array.from(entries.get(manifest.assets[0].file)), Array.from(png));
});

test('dataUrlToBytes 与 bytesToDataUrl 互逆', () => {
  const png = new Uint8Array([1, 2, 3, 250]);
  const url = bytesToDataUrl(png, 'image/png');
  const back = dataUrlToBytes(url);
  assert.equal(back.mime, 'image/png');
  assert.deepEqual(Array.from(back.bytes), Array.from(png));
  assert.equal(dataUrlToBytes('not-a-data-url'), null);
});
```

同时在文件顶部补上两个 import：

```javascript
import { readZipEntries } from '../scripts/zip.js';
import { parseScriptText, countChars } from '../scripts/parser.js';
```

并把 `exportPackage` / `dataUrlToBytes` / `bytesToDataUrl` 加进已有的 `from '../scripts/package.js'` 导入列表；再在文件顶部加一个工具函数：

```javascript
const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
```

- [x] **Step 2: 运行测试确认失败**

Run: `node --test tests/package.test.mjs`
Expected: FAIL —— `exportPackage` / `dataUrlToBytes` / `bytesToDataUrl` 尚未导出（`SyntaxError: The requested module does not provide an export named ...`）。

- [x] **Step 3: 在 `scripts/package.js` 追加导出实现**

```javascript
import { parseScriptText, countChars } from './parser.js';
import { writeZip, readZipEntries } from './zip.js';
import { serializeScript } from './serialize.js';
```

（把这条 import 放到文件顶部；Task 2 的实现没有依赖 `parser.js`，现在补上。）

追加到文件末尾：

```javascript
/* ---------- data URL 与字节 ---------- */
export function bytesToDataUrl(bytes, mime) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

export function dataUrlToBytes(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  try {
    if (m[2]) {
      const bin = atob(m[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mime };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime };
  } catch (e) {
    return null;
  }
}

/* ---------- 导出 ---------- */
function safeFileName(name) {
  return String(name || '未命名作品').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '未命名作品';
}

function workText(work) {
  if (typeof work.source === 'string' && work.source.trim()) return work.source;
  if (work.script) return serializeScript(work.script);
  throw pkgFail('《' + (work.title || work.id || '未命名作品') + '》没有可导出的文本内容。');
}

/**
 * 导出作品包。
 * kind: 'work'（单章）| 'series'（整本）
 * works: [{ id, title, tag, chapterNo, source, script }]
 */
export async function exportPackage(opts) {
  const kind = opts.kind === 'series' ? 'series' : 'work';
  const works = opts.works || [];
  if (!works.length) throw pkgFail('没有可导出的作品。');

  const entries = works.map((w, i) => ({
    id: w.id,
    title: w.title || '',
    tag: w.tag || '',
    chapterNo: w.chapterNo || i + 1,
    file: kind === 'series' ? `chapters/${String(i + 1).padStart(2, '0')}.txt` : 'script.txt',
    chars: countChars(workText(w)),
  }));

  const assets = [];
  const files = [];
  const cover = dataUrlToBytes(opts.coverImage);
  if (cover && cover.bytes.length <= MAX_ASSET_BYTES) {
    const ext = cover.mime === 'image/png' ? 'png' : 'jpg';
    assets.push({
      id: 'cover', role: 'cover', file: `assets/cover.${ext}`,
      type: cover.mime, bytes: cover.bytes.length,
    });
    files.push({ name: `assets/cover.${ext}`, data: cover.bytes });
  }

  const manifest = makeManifest({
    kind,
    id: opts.id || (kind === 'series' ? entries[0].id : entries[0].id),
    title: opts.title || entries[0].title,
    summary: opts.summary || '',
    author: opts.author || '',
    series: opts.series || null,
    license: opts.license || null,
    works: entries,
    assets,
  });

  files.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  works.forEach((w, i) => {
    files.push({ name: entries[i].file, data: workText(w) });
  });

  const chapterList = works.map((w, i) => `${i + 1}. ${entries[i].tag || entries[i].title}`).join('\n');
  files.push({
    name: 'README.md',
    data: [
      `# ${manifest.title}`,
      '',
      manifest.summary || '',
      '',
      '## 章节',
      chapterList,
      '',
      '## 说明',
      '这是一个暮幕（MuMU）作品包，导入暮幕后可直接播放。',
      '剧本文本格式见暮幕「导入」弹窗中的格式说明。',
      '',
      `许可证：${manifest.license.type}${manifest.license.holder ? '（' + manifest.license.holder + '）' : ''}`,
      `生成工具：${manifest.generator} · 包格式 v${manifest.formatVersion} · 内容版本 v${manifest.schemaVersion}`,
    ].join('\n'),
  });
  if (manifest.license && manifest.license.type && manifest.license.type !== '未指定') {
    files.push({
      name: 'LICENSE.txt',
      data: [
        manifest.license.type,
        manifest.license.holder ? `权利人：${manifest.license.holder}` : '',
        manifest.license.allowRemix ? '允许改编（改编需保留来源署名）' : '不允许改编',
      ].filter(Boolean).join('\n'),
    });
  }

  const bytes = await writeZip(files);
  return { bytes, filename: `${safeFileName(manifest.title)}.mumu` };
}

/** 浏览器端触发下载 */
export function downloadPackage(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [x] **Step 4: 让剧本保留原文**

`scripts/parser.js` 的 `readFileToScript()` 末尾改为：

```javascript
  const script = parseScriptText(text, name);
  script.chars = n;
  script.source = text;   // 保留原文，供作品包导出使用
  return script;
```

`scripts/builtin.js` 的 `loadBuiltinScripts()` 循环内，在 `sc.chapterNo = s.chapterNo;` 之后加一行：

```javascript
      sc.source = s.text;   // 保留原文，供作品包导出使用
```

- [x] **Step 5: 运行测试确认通过**

Run: `node --test tests/package.test.mjs`
Expected: PASS —— 13 个用例全绿。

Run: `node --test`
Expected: PASS —— 全量用例通过。

- [x] **Step 6: 提交**

```bash
git add scripts/package.js scripts/parser.js scripts/builtin.js tests/package.test.mjs
git commit -m "feat(P0-2): 支持单章与整本作品包导出，导入与内置剧本保留原文"
```

---

### Task 5: 导入链路

**Files:**
- Modify: `scripts/package.js`（追加导入相关函数）
- Test: `tests/package.test.mjs`（追加导入用例）

**Interfaces:**
- Consumes: `scripts/zip.js` 的 `readZipEntries`；`scripts/parser.js` 的 `parseScriptText`；Task 4 的 `dataUrlToBytes` / `bytesToDataUrl`。
- Produces:
  - `export async function buildCoverDataUrl(bytes: Uint8Array, mime: string): Promise<string | null>` —— 缩到 ≤640px 的 JPEG data URL；无 DOM 时返回 null。
  - `export async function importPackage(buffer: ArrayBuffer, opts?: { existing?: Array }): Promise<{ manifest, kind, title, seriesId, seriesTitle, works: Array }>`
    - 返回的每个 work：`{ id, title, summary, author, characters, nodes, labels, cover, tag, chapterNo, series, seriesTitle, source, coverImage, manifest, builtin: false }`
    - **纯函数**：不写 localStorage，存储由调用方（`main.js`）负责。

- [x] **Step 1: 追加失败测试到 `tests/package.test.mjs`**

追加 import：`importPackage` / `buildCoverDataUrl`。追加用例：

```javascript
test('导出后导入：逐节点等价且保留原文', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '简介', author: '作者',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '我的剧本', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.kind, 'work');
  assert.equal(res.works.length, 1);
  const w = res.works[0];
  assert.equal(w.id, 'w1');
  assert.equal(w.title, '测试剧');
  assert.equal(w.source, SAMPLE);
  assert.equal(w.nodes.length, sc.nodes.length);
  assert.deepEqual(w.nodes.map((n) => n.t), sc.nodes.map((n) => n.t));
  assert.equal(w.builtin, false);
});

test('整本导入：作品按章序排列并带 series 信息', async () => {
  const a = parseScriptText(SAMPLE, 'a.txt');
  const b = parseScriptText(SAMPLE, 'b.txt');
  const { bytes } = await exportPackage({
    kind: 'series', id: 's1', title: '曲目', summary: '简介', author: '',
    series: null, license: null, coverImage: null,
    works: [
      { id: 's1_01', title: '曲目', tag: '第一章', chapterNo: 1, source: SAMPLE, script: a },
      { id: 's1_02', title: '曲目', tag: '第二章', chapterNo: 2, source: SAMPLE, script: b },
    ],
  });
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.kind, 'series');
  assert.equal(res.seriesId, 's1');
  assert.equal(res.works.length, 2);
  assert.equal(res.works[0].chapterNo, 1);
  assert.equal(res.works[1].chapterNo, 2);
  assert.equal(res.works[0].series, 's1');
  assert.equal(res.works[0].seriesTitle, '曲目');
});

test('整本导入且 series 与本地冲突时加 user: 前缀', async () => {
  const a = parseScriptText(SAMPLE, 'a.txt');
  const { bytes } = await exportPackage({
    kind: 'series', id: 'cicada', title: '蝉鸣止于逢魔时', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'cicada_01', title: '蝉鸣止于逢魔时', tag: '第一章', chapterNo: 1, source: SAMPLE, script: a }],
  });
  const res = await importPackage(ab(bytes), { existing: [{ id: 'builtin_cicada_01', series: 'cicada', builtin: true }] });
  assert.equal(res.seriesId, 'user:cicada');
  assert.equal(res.works[0].series, 'user:cicada');
});

test('作品 id 与本地已导入作品相同时视为更新（id 不变）', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const res = await importPackage(ab(bytes), { existing: [{ id: 'w1', builtin: false }] });
  assert.equal(res.works[0].id, 'w1');
});

test('作品 id 与内置作品冲突时加 user: 前缀', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'builtin_cicada_01', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'builtin_cicada_01', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const res = await importPackage(ab(bytes), { existing: [{ id: 'builtin_cicada_01', builtin: true }] });
  assert.equal(res.works[0].id, 'user:builtin_cicada_01');
});

test('缺少章节文件时报错并给出中文原因', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧', works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }], assets: [],
  };
  const bytes = await writeZip([{ name: 'manifest.json', data: JSON.stringify(manifest) }]);
  await assert.rejects(
    () => importPackage(ab(bytes), { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('缺少第 1 章'),
  );
});

test('缺少 manifest.json 时报错', async () => {
  const bytes = await writeZip([{ name: 'script.txt', data: 'x' }]);
  await assert.rejects(
    () => importPackage(ab(bytes), { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('manifest.json'),
  );
});

test('剧本语法错误时报错并指出章序', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧', works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }], assets: [],
  };
  const bytes = await writeZip([
    { name: 'manifest.json', data: JSON.stringify(manifest) },
    { name: 'script.txt', data: '【场景：不存在的地方 | 黄昏 | 中景】\n阿蓝：你好\n【结束】' },
  ]);
  await assert.rejects(
    () => importPackage(ab(bytes), { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('第 1 章'),
  );
});
```

（`writeZip` 需要加进 `from '../scripts/zip.js'` 的 import 列表。）

- [x] **Step 2: 运行测试确认失败**

Run: `node --test tests/package.test.mjs`
Expected: FAIL —— `importPackage` 尚未导出。

- [x] **Step 3: 在 `scripts/package.js` 追加导入实现**

追加到文件末尾：

```javascript
/* ---------- 导入 ---------- */

/** 把封面缩到 ≤640px 的 JPEG data URL；没有 DOM 时返回 null */
export async function buildCoverDataUrl(bytes, mime) {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch (e) {
    return null;
  }
}

function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

/**
 * 导入作品包（纯函数，不写存储）。
 * existing：本地已有作品（用于判断 id / series 冲突）。
 * 返回 { manifest, kind, title, seriesId, seriesTitle, works }
 */
export async function importPackage(buffer, opts = {}) {
  const existing = opts.existing || [];
  if (buffer.byteLength > MAX_PACKAGE_BYTES) {
    throw pkgFail('作品包超过 32MB，无法导入。');
  }

  let entries;
  try {
    entries = await readZipEntries(buffer);
  } catch (e) {
    throw pkgFail('这个文件不是有效的暮幕作品包（ZIP 结构无法读取）。');
  }

  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) throw pkgFail('作品包缺少 manifest.json。');
  let rawManifest;
  try {
    rawManifest = JSON.parse(new TextDecoder('utf-8').decode(manifestBytes));
  } catch (e) {
    throw pkgFail('作品包清单无法解析，可能已损坏。');
  }

  const manifest = validateManifest(rawManifest);

  const takenIds = new Set(existing.map((s) => s.id));
  const builtinIds = new Set(existing.filter((s) => s.builtin).map((s) => s.id));
  const takenSeries = new Set(existing.map((s) => s.series).filter(Boolean));

  // series id 冲突：加 user: 前缀（已是 user: 前缀则视为更新同一曲目）
  let seriesId = null;
  let seriesTitle = '';
  if (manifest.kind === 'series') {
    seriesId = (manifest.series && manifest.series.id) || manifest.id || '';
    seriesTitle = (manifest.series && manifest.series.title) || manifest.title || '';
    if (seriesId && takenSeries.has(seriesId) && !seriesId.startsWith('user:')) {
      let next = `user:${seriesId}`;
      let i = 2;
      while (takenSeries.has(next)) { next = `user:${seriesId}_${i}`; i += 1; }
      seriesId = next;
    }
  }

  const works = [];
  for (let i = 0; i < manifest.works.length; i++) {
    const w = manifest.works[i];
    const bytes = entries.get(w.file);
    if (!bytes) throw pkgFail(`作品包缺少第 ${i + 1} 章的剧本文件（${w.file}）。`);
    const text = new TextDecoder('utf-8').decode(bytes);
    let script;
    try {
      script = parseScriptText(text, w.title || w.id);
    } catch (e) {
      throw pkgFail(`第 ${i + 1} 章《${w.title || w.id}》解析失败：${e.message}`);
    }

    let id = w.id;
    if (builtinIds.has(id) || id.startsWith('builtin_')) {
      id = uniqueId(`user:${id}`, takenIds);
    } else if (!takenIds.has(id)) {
      id = uniqueId(id, takenIds);
    }
    takenIds.add(id);

    // 封面
    let coverImage = null;
    const coverAsset = manifest.assets.find((a) => a.role === 'cover');
    if (coverAsset) {
      const coverBytes = entries.get(coverAsset.file);
      if (coverBytes && coverBytes.length <= MAX_ASSET_BYTES) {
        coverImage = await buildCoverDataUrl(coverBytes, coverAsset.type || 'image/jpeg');
      }
    }

    works.push({
      id,
      title: script.title || w.title || id,
      summary: script.summary || manifest.summary || '',
      author: script.author || manifest.author || '',
      characters: script.characters,
      nodes: script.nodes,
      labels: script.labels,
      cover: script.cover,
      tag: w.tag || w.title || '',
      chapterNo: manifest.kind === 'series' ? (w.chapterNo || i + 1) : (w.chapterNo || 0),
      series: manifest.kind === 'series' ? seriesId : null,
      seriesTitle: manifest.kind === 'series' ? seriesTitle : '',
      source: text,
      coverImage,
      manifest: {
        format: manifest.format,
        formatVersion: manifest.formatVersion,
        schemaVersion: manifest.schemaVersion,
        kind: manifest.kind,
        license: manifest.license,
        engine: manifest.engine,
        packageId: manifest.id,
        packageTitle: manifest.title,
      },
      builtin: false,
    });
  }

  return {
    manifest,
    kind: manifest.kind,
    title: manifest.title || (works[0] && works[0].title) || '未命名作品',
    seriesId,
    seriesTitle,
    works,
  };
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `node --test tests/package.test.mjs`
Expected: PASS —— 21 个用例全绿。

Run: `node --test`
Expected: PASS —— 全量用例通过。

- [x] **Step 5: 提交**

```bash
git add scripts/package.js tests/package.test.mjs
git commit -m "feat(P0-2): 作品包导入链路（校验、迁移、解析、封面、id 冲突处理）"
```

---

### Task 6: UI 接线（导出按钮 / `.mumu` 导入 / 封面显示）

**Files:**
- Modify: `scripts/modals.js`
- Modify: `scripts/main.js`
- Modify: `styles/main.css`
- Test: 无单测（本任务用浏览器回归验证）

**Interfaces:**
- Consumes: `scripts/package.js` 的 `exportPackage` / `downloadPackage` / `importPackage`；`scripts/storage.js` 的 `addCustomScript` / `loadCustomScripts`。
- Produces（对调用方的新回调参数）：
  - `openLibrary({ scripts, onPlay, onDelete, onExport })` —— `onExport({ kind: 'work', script })` 或 `onExport({ kind: 'series', scripts })`。
  - `openChapters(group, onPlay, onBack, onExport)` —— `onExport({ kind: 'work', script })`。
  - `openImport({ onImported, onPackage })` —— `onPackage(file)` 负责导入 `.mumu`；抛错时由弹窗显示中文原因。

- [x] **Step 1: `scripts/modals.js` —— 卡片与章节行加导出按钮**

先在 `scripts/modals.js` 里 `THUMB` 常量之后加一个安全的封面样式helper（只接受 base64 图片 data URL，避免把任意字符串塞进 style 属性）：

```javascript
const SAFE_IMG = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
/** 有封面就用封面图铺满缩略图，否则回落到渐变底 */
function coverStyle(s) {
  const url = String(s.coverImage || '');
  if (SAFE_IMG.test(url)) {
    return `background-image:url('${url}');background-size:cover;background-position:center`;
  }
  return `background:${THUMB[s.cover.scene] || THUMB.classroom}`;
}
```

把 `singleCard` 改成：

```javascript
function singleCard(s) {
  return `
    <div class="script-card" data-id="${esc(s.id)}" tabindex="0">
      ${s.builtin ? '' : '<span class="badge-custom">已导入</span>'}
      <div class="script-thumb" style="${coverStyle(s)}"></div>
      <div class="script-body">
        <div class="script-name">${esc(s.title)}</div>
        <span class="script-tag">${esc(s.tag || SCENES[s.cover.scene]?.label || '剧本')}</span>
        <div class="script-brief">${esc(s.summary)}</div>
        ${s.builtin ? '' : `<div class="script-actions">
          <button class="mini-btn" data-export="${esc(s.id)}">导出 .mumu</button>
          <button class="mini-btn danger" data-del="${esc(s.id)}">移除</button>
        </div>`}
      </div>
    </div>`;
}
```

把 `seriesCard` 里 `.script-body` 的结尾改成（新增一行 `.script-actions`）：

```javascript
        <div class="chapter-chips">${chips}</div>
        <div class="script-actions">
          <button class="mini-btn" data-export-series="${esc(g.key)}">导出整本</button>
        </div>
      </div>
```

把 `openChapters` 改成（每行加一个导出按钮；用 `.chapter-row` 包一层，避免 button 嵌套）：

```javascript
export function openChapters(group, onPlay, onBack, onExport) {
  const rows = group.chapters.map((c) => `
    <div class="chapter-row">
      <button class="chapter-item" data-id="${esc(c.id)}">
        <span class="chapter-no">${String(c.chapterNo || 0).padStart(2, '0')}</span>
        <span class="chapter-main">
          <span class="chapter-name">${esc(c.tag || c.title)}</span>
          <span class="chapter-brief">${esc(c.summary)}</span>
        </span>
        <span class="chapter-go">进入 ▸</span>
      </button>
      <button class="mini-btn chapter-export" data-export="${esc(c.id)}">导出</button>
    </div>`).join('');
  const m = openModal(`《${group.title}》`, `
    <div class="chapter-head">
      <button class="mini-btn" data-back>← 返回曲目</button>
      <span class="chapter-count">共 ${group.chapters.length} 章 · 选择一章开始</span>
    </div>
    <div class="chapter-list">${rows}</div>`, true);
  m.querySelector('[data-back]').addEventListener('click', () => { closeModal(); if (onBack) onBack(); });
  m.querySelectorAll('.chapter-item').forEach((el) => {
    el.addEventListener('click', () => {
      const sc = group.chapters.find((x) => x.id === el.dataset.id);
      if (!sc) return;
      closeModal();
      onPlay(sc);
    });
  });
  m.querySelectorAll('[data-export]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const sc = group.chapters.find((x) => x.id === el.dataset.export);
      if (sc && onExport) onExport({ kind: 'work', script: sc });
    });
  });
}
```

把 `openLibrary` 改成（新增 `onExport` 参数、导出按钮的点击处理，并把 `onExport` 传给 `openChapters`）：

```javascript
export function openLibrary({ scripts, onPlay, onDelete, onExport }) {
  const entries = groupScripts(scripts);
  const cards = entries.map((e) => (e.kind === 'series' ? seriesCard(e) : singleCard(e.script))).join('');
  const m = openModal('选择剧本', `<div class="script-grid">${cards}</div>`, true);

  // 曲目卡：先选曲目，再选章节
  m.querySelectorAll('.series-card').forEach((el) => {
    const group = entries.find((e) => e.kind === 'series' && e.key === el.dataset.series);
    if (!group) return;
    const go = () => openChapters(group, onPlay, () => openLibrary({ scripts, onPlay, onDelete, onExport }), onExport);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-export-series]')) return;   // 导出按钮不进入章节列表
      go();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) go(); });
  });

  // 独立剧本（含导入）：直接开始
  m.querySelectorAll('.script-card[data-id]').forEach((el) => {
    const go = () => { const sc = scripts.find((x) => x.id === el.dataset.id); closeModal(); onPlay(sc); };
    el.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      const exp = e.target.closest('[data-export]');
      if (del) { e.stopPropagation(); onDelete(del.dataset.del); return; }
      if (exp) {
        e.stopPropagation();
        const sc = scripts.find((x) => x.id === exp.dataset.export);
        if (sc && onExport) onExport({ kind: 'work', script: sc });
        return;
      }
      go();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) go(); });
  });

  // 曲目卡上的「导出整本」
  m.querySelectorAll('[data-export-series]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = entries.find((x) => x.kind === 'series' && x.key === el.dataset.exportSeries);
      if (group && onExport) onExport({ kind: 'series', scripts: group.chapters });
    });
  });
}
```

- [x] **Step 2: `scripts/modals.js` —— 导入弹窗支持 `.mumu`**

把 `openImport` 的函数签名与提示文案改成：

```javascript
export function openImport({ onImported, onPackage }) {
  const body = `
    <div class="drop-zone" id="dz">
      <span class="di">✦</span>
      <div class="dt">拖入剧本文件，或点击选择</div>
      <div class="dh">支持 .txt / .md / .json / .docx / .zip，或暮幕作品包 .mumu<br/>
        字数 ${LIMITS.minChars}–${LIMITS.maxChars.toLocaleString()} 字 · 文件不超过 5MB</div>
      <input id="file-in" type="file" accept=".txt,.md,.json,.docx,.zip,.mumu" hidden />
    </div>
    ...
```

把 `handle` 改成：

```javascript
  const handle = async (file) => {
    if (!file) return;
    const name = file.name || '';
    const ext = (name.split('.').pop() || '').toLowerCase();
    msg.style.color = 'rgba(255,244,230,0.7)';
    msg.textContent = '正在解析…';
    try {
      if (ext === 'mumu') {
        if (!onPackage) throw new Error('当前入口不支持作品包导入。');
        await onPackage(file);
        closeModal();
      } else {
        const sc = await readFileToScript(file);
        onImported(sc);
        closeModal();
      }
    } catch (e) {
      msg.style.color = '#ff9a8a';
      msg.textContent = e.userFacing ? e.message : '解析失败：' + (e.message || '未知错误');
    }
  };
```

- [x] **Step 3: `scripts/main.js` —— 接线导出与作品包导入**

在 import 区加：

```javascript
import { exportPackage, downloadPackage, importPackage } from './package.js';
```

在 `showLibrary()` 改成：

```javascript
async function handleExport({ kind, script, scripts }) {
  try {
    const works = kind === 'series' ? scripts : [script];
    if (!works.length) { toast('没有可导出的作品'); return; }
    const isSeries = kind === 'series';
    const { bytes, filename } = await exportPackage({
      kind,
      id: isSeries ? (works[0].series || works[0].id) : works[0].id,
      title: isSeries ? (works[0].seriesTitle || works[0].title) : works[0].title,
      summary: works[0].summary || '',
      author: works[0].author || '',
      series: isSeries ? null : (script.series ? { id: script.series, title: script.seriesTitle || script.title } : null),
      license: null,
      coverImage: works[0].coverImage || null,
      works: works.map((w) => ({
        id: w.id, title: w.title, tag: w.tag || '', chapterNo: w.chapterNo || 0,
        source: w.source || null, script: w,
      })),
    });
    downloadPackage(bytes, filename);
    toast(`已导出《${filename}》`);
  } catch (e) {
    toast(e.userFacing ? e.message : '导出失败：' + (e.message || '未知错误'));
  }
}

function showLibrary() {
  openLibrary({
    scripts: allScripts(),
    onPlay: (sc) => play(sc),
    onDelete: (id) => {
      removeCustomScript(id);
      toast('已移除该剧本');
      showLibrary();
    },
    onExport: handleExport,
  });
}
```

把 `showImport()` 改成：

```javascript
function showImport() {
  openImport({
    onImported: (sc) => {
      sc.id = makeId('custom');
      sc.tag = '我的剧本';
      sc.builtin = false;
      addCustomScript(sc);
      toast(`已导入《${sc.title}》，现已列入“选择剧本”`);
      setTimeout(showLibrary, 500);
    },
    onPackage: async (file) => {
      const buf = await file.arrayBuffer();
      const res = await importPackage(buf, { existing: [...builtins, ...loadCustomScripts()] });
      if (!res.works.length) throw new Error('作品包里没有作品。');
      for (const w of res.works) addCustomScript(w);
      toast(`已导入《${res.title}》，共 ${res.works.length} 章`);
      setTimeout(showLibrary, 500);
    },
  });
}
```

- [x] **Step 4: `styles/main.css` —— 章节行排版**

在 `.chapter-item` 规则之前追加：

```css
.chapter-row { display:flex; align-items:center; gap:8px; }
.chapter-row .chapter-item { flex:1; min-width:0; }
.chapter-export { flex:0 0 auto; }
```

> 封面图的铺满效果由 Task 6 Step 1 的 `coverStyle()` 内联完成（内联 `background-image` 会覆盖样式表里的 `background` 简写，所以不要在 CSS 里写 `.script-thumb { background-size: cover }` 来实现它）。

- [x] **Step 5: 浏览器回归（`node serve.js` + 浏览器）**

Run: `node serve.js`（后台启动），打开 `http://localhost:5173`。

逐项确认：

1. 首页 → 「开始体验」→ 出现四张内置曲目卡（蝉鸣 / 青绿 / 月光 / 漩涡），布局与改动前一致（截图对比）。
2. 点「蝉鸣止于逢魔时」→ 章节列表出现，每行右侧有「导出」按钮；点「导出」→ 浏览器下载 `蝉鸣止于逢魔时.mumu`（文件名取章节标题或包标题）。
3. 返回曲目卡 → 点「导出整本」→ 下载 `蝉鸣止于逢魔时.mumu`（整本）。
4. 用文件选择器把刚下载的 `.mumu` 重新导入 → 作品库出现新的曲目卡（内置同名时 id 为 `user:` 前缀的独立卡片）→ 点进去能选章节 → 播放第一章到第一个选项 → 正常。
5. 导入一个把 `manifest.json` 删掉的坏包 → 弹窗红字「作品包缺少 manifest.json。」，作品库无新增。
6. 浏览器控制台无错误、无 404。

- [x] **Step 6: 提交**

```bash
git add scripts/modals.js scripts/main.js styles/main.css
git commit -m "feat(P0-2): 剧本库接入作品包导出按钮与 .mumu 导入，封面图显示"
```

---

### Task 7: 文档同步与全量回归

**Files:**
- Create: `docs/mumu-package-spec.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Test: `node --test` 全量 + 浏览器全量回归

**Interfaces:**
- Consumes: 无新代码接口。
- Produces: 面向作者的《暮幕作品包说明书》；`README.md` 与 `AGENTS.md` 的目录结构、速查表、自检清单同步。

- [x] **Step 1: 写 `docs/mumu-package-spec.md`**

内容包含：作品包是什么、ZIP 内部结构（单章 / 整本两种布局）、manifest 字段表、schema 版本与迁移规则、如何写一个能被暮幕导入的剧本（DSL 速查）、许可证字段含义与二创规则、导出的文件命名与体积限额、常见报错与处理。字段表必须与 `scripts/package.js` 的 `makeManifest` 完全一致。

- [x] **Step 2: 更新 `README.md`**

在目录结构里补三行：

```
  zip.js            最小 ZIP 读写（CRC-32 + deflate-raw），供作品包与 .zip 剧本导入共用
  package.js        作品包 .mumu：manifest 构造/校验/迁移、单章与整本导出、导入链路
  serialize.js      剧本序列化（解析结果 → DSL 文本），导出兜底
```

在「剧本格式速查」之后新增一节「作品包 .mumu」，说明：内置曲目卡有「导出整本」，章节行与独立卡有「导出」，导入支持 `.mumu`，包内结构为 `manifest.json + 剧本文本 + 可选封面`。

- [x] **Step 3: 更新 `AGENTS.md`**

在「修改速查表」新增一行：

```
| 作品包导入导出（.mumu） | scripts/package.js（manifest 校验/迁移、导出、导入）、scripts/zip.js（ZIP 读写）、scripts/serialize.js（nodes→DSL 兜底） |
```

在「交付前自检清单」新增一条：

```
- [x] 导出内置曲目为 .mumu → 再导入 → 可正常播放；坏包导入有中文报错且不污染作品库。
```

- [x] **Step 4: 全量单测**

Run: `node --test`
Expected: PASS —— 全部用例通过（原有 23 个 + 本计划新增用例）。

- [x] **Step 5: 全量浏览器回归**

Run: `node serve.js`（后台），`http://localhost:5173`。逐条确认：

- 入口：首页 → 开始体验 → 四张曲目卡 → 章节列表 → 开演。
- 四部曲共十五章：至少各跑一遍关键路径，选项、道具特写、火夜/雨夜光影、继续下一章按钮、末章不出现「继续下一章」。
- 存档：保存 → 刷新 → 读档续演位置正确；旧档（`mumu.saves.v1`）可读。
- 导入：文本剧本导入仍可用；`.mumu` 导入可用；坏包有中文报错。
- 弹窗：剧本库 / 存档 / 导入 / 玩法。
- 控制台无错误、无 404。

- [x] **Step 6: 提交**

```bash
git add README.md AGENTS.md docs/mumu-package-spec.md
git commit -m "docs(P0-2): 作品包说明书、README 与 AGENTS 速查表同步"
```

- [x] **Step 7: 回填计划表完成定义**

编辑 `docs/superpowers/specs/2026-11-23-mumu-local-creation-platform-roadmap.md` 的 P0-2 行，把「导出的包可在另一台浏览器导入并原样播放；schema 版本可迁移」勾选为已完成，并把状态改为「已完成」，追加一行变更记录：

```
| v1.1 | 2026-11-23 | P0-2 完成：作品包 .mumu 落地（ZIP 容器 + manifest schema v2 + v1→v2 迁移 + 单章/整本导出导入） |
```

```bash
git add docs/superpowers/specs/2026-11-23-mumu-local-creation-platform-roadmap.md
git commit -m "docs(P0-2): 回填计划表完成定义与变更记录"
```

---

## 验收清单（全部任务完成后逐条核对）

- [x] `node --test` 全绿，且用例数 ≥ 44（原 23 + 新增）。
- [x] 单章包与整本包都能导出（浏览器下载 `.mumu`）并能导入播放。
- [x] 导入的包播放结果与导出前逐节点一致。
- [x] v1 manifest 迁移到 v2 有可执行实现与单测。
- [x] 坏包（缺 manifest / 缺章节 / 语法错 / 非 ZIP）都有中文报错，且不写入任何数据。
- [x] 与内置曲目同名时导入为新卡片，不覆盖内置剧本。
- [x] 既有十五章、存档、旧档兼容、文本导入、弹窗全部无回归，控制台无错误。

## 风险与预案

| 风险 | 预案 |
|---|---|
| ZIP 写出后系统解压器判定损坏 | Step 1 的 crc32 向量测试 + 浏览器导出后用系统解压工具验一次；必要时退回 stored 模式 |
| 封面 data URL 让 localStorage 爆容量 | 封面入库前缩到 ≤640px JPEG；单个作品封面上限约 60KB |
| `finalize()` 补场景导致标签错位，影响既有剧本 | 内置剧本首节点即场景，不触发该分支；Task 3 的单测覆盖该分支 |
| 导入整本后作品库容量 | 十五章整本约 1MB 量级，仍在 localStorage 常见 5MB 限额内；超限时 `addCustomScript` 返回失败 → 提示用户先删除部分剧本 |
| 旧导入剧本没有原文 | Task 3 的序列化兜底保证仍可导出；仅当 `script` 缺失时才报错 |
