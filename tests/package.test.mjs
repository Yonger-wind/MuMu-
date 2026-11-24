import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_FORMAT, FORMAT_VERSION, SCHEMA_VERSION,
  MAX_PACKAGE_BYTES, MAX_ASSET_BYTES, MIGRATIONS, pkgFail,
  makeManifest, migrateManifest, validateManifest,
  exportPackage, dataUrlToBytes, bytesToDataUrl, checkPackageSize,
  importPackage, buildCoverDataUrl,
} from '../scripts/package.js';
import { readZipEntries, writeZip } from '../scripts/zip.js';
import { parseScriptText, countChars, readFileToScript, LIMITS } from '../scripts/parser.js';
import { loadBuiltinScripts } from '../scripts/builtin.js';

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

/* ---------- 导出（Task 4） ---------- */

const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

const SAMPLE = `标题：测试剧
简介：一段用于测试的短剧。
角色：
阿蓝 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 远景】
放学的教室里只剩下窗外的蝉鸣。

【场景：教室 | 黄昏 | 中景】
阿蓝：今天也卡带了。
【结束】`;

const LONG_LINE = '放学的教室里只剩下窗外的蝉鸣，磁带在书包里轻轻响着，谁也没有先开口。'.repeat(5);

const DSL_LONG = `标题：测试剧
简介：一段用于测试的短剧。
角色：
阿蓝 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 远景】
${LONG_LINE}

【场景：教室 | 黄昏 | 中景】
阿蓝：今天也卡带了。
【结束】`;

const JSON_SRC = JSON.stringify({
  title: 'JSON 剧',
  summary: '一份以 JSON 写成的剧本。',
  characters: [{ name: '阿蓝', gender: 'f', hair: 'long', cloth: '白', model: '少女（2）' }],
  nodes: [
    { scene: '教室', time: '黄昏', cam: '远景' },
    { say: LONG_LINE },
    { say: '今天也卡带了。', who: '阿蓝' },
    { end: true },
  ],
}, null, 2);

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

/* ---------- 裁定 R-a：单章导出只允许一个作品 ---------- */

test('单章导出传入多个作品时报 userFacing 错误', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  await assert.rejects(
    () => exportPackage({
      kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
      series: null, license: null, coverImage: null,
      works: [
        { id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc },
        { id: 'w2', title: '测试剧', tag: '', chapterNo: 2, source: SAMPLE, script: sc },
      ],
    }),
    (e) => e.userFacing === true && e.message.includes('单章导出'),
  );
});

test('导出没有作品时报 userFacing 错误', async () => {
  await assert.rejects(
    () => exportPackage({
      kind: 'series', id: 's1', title: '曲目', summary: '', author: '',
      series: null, license: null, coverImage: null, works: [],
    }),
    (e) => e.userFacing === true && e.message.includes('没有可导出的作品'),
  );
});

/* ---------- 裁定 R-b：JSON 源不保留原文 ---------- */

test('导入 DSL 文本时保留原文', async () => {
  const script = await readFileToScript(new File([DSL_LONG], 'test.txt'));
  assert.equal(script.source, DSL_LONG);
});

test('导入 JSON 剧本时不保留 JSON 原文', async () => {
  const script = await readFileToScript(new File([JSON_SRC], 'test.json'));
  assert.notEqual(script.source, JSON_SRC);
  assert.equal(script.source, null);
});

test('JSON 源剧本导出后包内 script.txt 仍可被解析', async () => {
  const script = await readFileToScript(new File([JSON_SRC], 'test.json'));
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: 'JSON 剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: 'JSON 剧', tag: '', chapterNo: 1, source: script.source, script }],
  });
  const entries = await readZipEntries(ab(bytes));
  const text = new TextDecoder().decode(entries.get('script.txt'));
  assert.ok(!text.trim().startsWith('{'), '导出的 script.txt 不应是 JSON 原文');
  const back = parseScriptText(text, 'test.txt');
  assert.ok(back.nodes.some((n) => n.t === 'say'));
});

/* ---------- 裁定 R-c：封面扩展名按实际 MIME ---------- */

test('封面为 webp 时文件名与 type 一致', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const webp = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
  const coverImage = bytesToDataUrl(webp, 'image/webp');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const entries = await readZipEntries(ab(bytes));
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.equal(manifest.assets.length, 1);
  assert.equal(manifest.assets[0].type, 'image/webp');
  assert.equal(manifest.assets[0].file, 'assets/cover.webp');
  assert.ok(entries.has('assets/cover.webp'));
});

test('封面 MIME 无法识别时跳过封面并给出警告', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const coverImage = bytesToDataUrl(new Uint8Array([1, 2, 3]), 'image/gif');
  const { bytes, warnings } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const entries = await readZipEntries(ab(bytes));
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.equal(manifest.assets.length, 0);
  assert.ok(warnings.some((w) => w.includes('封面图片格式无法识别')));
  assert.ok(![...entries.keys()].some((k) => k.startsWith('assets/')));
});

/* ---------- 裁定 R-d：封面超限跳过并警告，不中断导出 ---------- */

test('封面超过 4MB 时导出仍成功并给出警告', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const big = new Uint8Array(MAX_ASSET_BYTES + 1);
  const coverImage = bytesToDataUrl(big, 'image/png');
  const { bytes, warnings } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const entries = await readZipEntries(ab(bytes));
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.equal(manifest.assets.length, 0);
  assert.ok(warnings.some((w) => w.includes('超过 4MB')));
  assert.ok(entries.has('manifest.json'));
  assert.ok(entries.has('script.txt'));
});

test('导出的 warnings 始终是数组', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const res = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  assert.ok(Array.isArray(res.warnings));
  assert.equal(res.warnings.length, 0);
});

/* ---------- 裁定：内置剧本保留原文 ---------- */

test('内置剧本保留 DSL 原文且可再次解析', () => {
  const list = loadBuiltinScripts();
  assert.ok(list.length >= 15);
  for (const sc of list) {
    assert.equal(typeof sc.source, 'string');
    assert.ok(sc.source.startsWith('标题：'));
    const back = parseScriptText(sc.source, 'x.txt');
    assert.ok(back.nodes.some((n) => n.t === 'say'));
  }
});

/* ---------- 修补轮 R1 · F1：章节序号按 chapterNo 而非数组下标 ---------- */

test('整本导出：章节文件序号按 chapterNo 升序，与传入顺序无关', async () => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const { bytes } = await exportPackage({
    kind: 'series', id: 's1', title: '曲目', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [
      { id: 'c4', title: '曲目', tag: '第四章', chapterNo: 4, source: '第四章内容', script: sc },
      { id: 'c2', title: '曲目', tag: '第二章', chapterNo: 2, source: '第二章内容', script: sc },
      { id: 'c3', title: '曲目', tag: '第三章', chapterNo: 3, source: '第三章内容', script: sc },
      { id: 'c1', title: '曲目', tag: '第一章', chapterNo: 1, source: '第一章内容', script: sc },
    ],
  });
  const entries = await readZipEntries(ab(bytes));
  const dec = new TextDecoder();
  const manifest = JSON.parse(dec.decode(entries.get('manifest.json')));
  assert.deepEqual(manifest.works.map((w) => w.chapterNo), [1, 2, 3, 4]);
  assert.deepEqual(manifest.works.map((w) => w.file), [
    'chapters/01.txt', 'chapters/02.txt', 'chapters/03.txt', 'chapters/04.txt',
  ]);
  assert.equal(dec.decode(entries.get('chapters/01.txt')), '第一章内容');
  assert.equal(dec.decode(entries.get('chapters/02.txt')), '第二章内容');
  assert.equal(dec.decode(entries.get('chapters/03.txt')), '第三章内容');
  assert.equal(dec.decode(entries.get('chapters/04.txt')), '第四章内容');
});

test('整本导出：章节号相同时保持传入顺序', async () => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const { bytes } = await exportPackage({
    kind: 'series', id: 's1', title: '曲目', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [
      { id: 'a', title: '曲目', tag: '甲', chapterNo: 2, source: '甲内容', script: sc },
      { id: 'b', title: '曲目', tag: '乙', chapterNo: 2, source: '乙内容', script: sc },
      { id: 'c', title: '曲目', tag: '丙', chapterNo: 1, source: '丙内容', script: sc },
    ],
  });
  const entries = await readZipEntries(ab(bytes));
  const dec = new TextDecoder();
  assert.equal(dec.decode(entries.get('chapters/01.txt')), '丙内容');
  assert.equal(dec.decode(entries.get('chapters/02.txt')), '甲内容');
  assert.equal(dec.decode(entries.get('chapters/03.txt')), '乙内容');
});

test('整本导出：chapterNo 缺失或非法时按传入顺序处理，文件名不含 NaN', async () => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const { bytes } = await exportPackage({
    kind: 'series', id: 's1', title: '曲目', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [
      { id: 'a', title: '曲目', tag: '甲', chapterNo: undefined, source: '甲内容', script: sc },
      { id: 'b', title: '曲目', tag: '乙', chapterNo: 'x', source: '乙内容', script: sc },
      { id: 'c', title: '曲目', tag: '丙', chapterNo: 3, source: '丙内容', script: sc },
    ],
  });
  const entries = await readZipEntries(ab(bytes));
  const dec = new TextDecoder();
  const manifest = JSON.parse(dec.decode(entries.get('manifest.json')));
  assert.ok([...entries.keys()].every((k) => !k.includes('NaN')));
  assert.deepEqual(manifest.works.map((w) => w.file), [
    'chapters/01.txt', 'chapters/02.txt', 'chapters/03.txt',
  ]);
  manifest.works.forEach((w) => assert.equal(typeof w.chapterNo, 'number'));
  assert.equal(dec.decode(entries.get('chapters/01.txt')), '甲内容');
  assert.equal(dec.decode(entries.get('chapters/02.txt')), '乙内容');
  assert.equal(dec.decode(entries.get('chapters/03.txt')), '丙内容');
});

/* ---------- 修补轮 R1 · F2：整包 32MB 上限 ---------- */

test('checkPackageSize 对超限字节给出中文 userFacing 错误', () => {
  assert.throws(
    () => checkPackageSize(new Uint8Array(MAX_PACKAGE_BYTES + 1)),
    (e) => e.userFacing === true && e.message.includes('32MB'),
  );
  assert.doesNotThrow(() => checkPackageSize(new Uint8Array(8)));
});

test('导出结果超过 32MB 时导出失败并给出中文 userFacing 错误', async () => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const oversized = new Uint8Array(MAX_PACKAGE_BYTES + 1);
  await assert.rejects(
    () => exportPackage({
      kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
      series: null, license: null, coverImage: null,
      zipWriter: async () => oversized,
      works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
    }),
    (e) => e.userFacing === true && e.message.includes('32MB'),
  );
});

test('正常导出的包不超过 32MB', async () => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  assert.ok(bytes.length <= MAX_PACKAGE_BYTES);
});

/* ---------- 修补轮 R1 · F3：文件名边界 ---------- */

const exportName = async (title) => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const { filename } = await exportPackage({
    kind: 'work', id: 'w1', title, summary: '', author: '',
    series: null, license: null, coverImage: null,
    // 作品标题也留空，确保 manifest.title 就是传入的 title
    works: [{ id: 'w1', title: '', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  return filename;
};

test('导出文件名：标题为空或全空格时用默认名', async () => {
  assert.equal(await exportName(''), '未命名作品.mumu');
  assert.equal(await exportName('   '), '未命名作品.mumu');
});

test('导出文件名：避开 Windows 保留名', async () => {
  assert.equal(await exportName('CON'), '_CON.mumu');
  assert.equal(await exportName('con'), '_con.mumu');
  assert.equal(await exportName('NUL'), '_NUL.mumu');
  assert.equal(await exportName('COM1'), '_COM1.mumu');
  assert.equal(await exportName('LPT9'), '_LPT9.mumu');
  assert.equal(await exportName('CON.txt'), '_CON.txt.mumu');
});

test('导出文件名：非法字符被替换，结尾的点与空格被去掉', async () => {
  assert.equal(await exportName('a/b:c*d?e"f<g>h|i'), 'a_b_c_d_e_f_g_h_i.mumu');
  assert.equal(await exportName('结尾有点.'), '结尾有点.mumu');
  assert.equal(await exportName('结尾有空格  '), '结尾有空格.mumu');
});

/* ---------- 修补轮 R1 · F5：manifest 透传与包内自洽 ---------- */

test('导出时 summary / author / series 原样透传到 manifest', async () => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const series = { id: 's1', title: '曲目' };
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '这是一段简介。', author: '作者甲',
    series, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const entries = await readZipEntries(ab(bytes));
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.equal(manifest.summary, '这是一段简介。');
  assert.equal(manifest.author, '作者甲');
  assert.deepEqual(manifest.series, series);
});

test('导出时 manifest.works 里每个 file 都真实存在于包内', async () => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const { bytes } = await exportPackage({
    kind: 'series', id: 's1', title: '曲目', summary: '简介', author: '作者',
    series: { id: 's1', title: '曲目' }, license: null, coverImage: null,
    works: [
      { id: 'c2', title: '曲目', tag: '第二章', chapterNo: 2, source: SAMPLE, script: sc },
      { id: 'c1', title: '曲目', tag: '第一章', chapterNo: 1, source: SAMPLE, script: sc },
    ],
  });
  const entries = await readZipEntries(ab(bytes));
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.ok(manifest.works.length > 0);
  for (const w of manifest.works) {
    assert.ok(entries.has(w.file), `包内缺少 ${w.file}`);
  }
});

/* ============================================================
   导入链路（Task 5）
   ============================================================ */

/** 造一个只含 manifest.json 的包（用于缺章节文件等分支） */
const packWithManifest = async (manifest, extra = []) => writeZip([
  { name: 'manifest.json', data: JSON.stringify(manifest) },
  ...extra,
]);

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

test('导入结果带齐本地作品记录的全部字段', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '简介', author: '作者',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '我的剧本', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const res = await importPackage(ab(bytes), { existing: [] });
  const w = res.works[0];
  for (const key of [
    'id', 'title', 'summary', 'author', 'characters', 'nodes', 'labels', 'cover',
    'tag', 'chapterNo', 'series', 'seriesTitle', 'source', 'coverImage', 'manifest', 'builtin',
  ]) {
    assert.ok(key in w, `导入结果缺少字段 ${key}`);
  }
  assert.equal(w.tag, '我的剧本');
  assert.equal(w.series, null);
  assert.equal(w.builtin, false);
  assert.equal(w.manifest.kind, 'work');
  assert.equal(w.manifest.packageId, 'w1');
  assert.equal(w.manifest.packageTitle, '测试剧');
  assert.ok(Array.isArray(w.characters) && w.characters.length === 1);
  assert.ok(w.labels && typeof w.labels === 'object');
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
  const bytes = await packWithManifest(manifest);
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
  const bytes = await packWithManifest(manifest, [
    { name: 'script.txt', data: '【场景：不存在的地方 | 黄昏 | 中景】\n阿蓝：你好\n【结束】' },
  ]);
  await assert.rejects(
    () => importPackage(ab(bytes), { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('第 1 章'),
  );
});

/* ---------- 裁定 R-a：迁移不得无条件重算 kind ---------- */

test('R-a：缺 schemaVersion 且显式 kind=series 的单作品包迁移后仍是 series', () => {
  const m = migrateManifest({
    format: 'mumu-package', formatVersion: 1, kind: 'series',
    id: 's1', title: '曲目',
    works: [{ id: 's1_01', title: '曲目', file: 'chapters/01.txt' }],
  });
  assert.equal(m.kind, 'series');
  assert.equal(m.works.length, 1);
});

test('R-a：缺 schemaVersion 且未写 kind 时仍按作品数推导', () => {
  const m = migrateManifest({
    format: 'mumu-package', formatVersion: 1, id: 'x', title: 'X',
    works: [
      { id: 'a', title: 'A', file: 'chapters/01.txt' },
      { id: 'b', title: 'B', file: 'chapters/02.txt' },
    ],
  });
  assert.equal(m.kind, 'series');
});

test('R-a：显式 kind=series 的包导入后仍按曲目分组', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, kind: 'series',
    id: 's1', title: '曲目',
    works: [{ id: 's1_01', title: '曲目', file: 'chapters/01.txt' }],
    assets: [],
  };
  const bytes = await packWithManifest(manifest, [
    { name: 'chapters/01.txt', data: SAMPLE },
  ]);
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.kind, 'series');
  assert.equal(res.seriesId, 's1');
  assert.equal(res.works[0].series, 's1');
});

/* ---------- 裁定 R-b：迁移路径不兜 file ---------- */

test('R-b：v1 迁移后缺 file 的章节由校验拦下', () => {
  const v1 = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 1,
    id: 'x', title: 'X',
    chapters: [{ id: 'c1', title: '第一章' }],
  };
  const m = migrateManifest(v1);
  assert.equal(m.works[0].file, '');
  assert.throws(
    () => validateManifest(v1),
    (e) => e.userFacing === true && e.message.includes('作品包缺少第 1 章的剧本文件'),
  );
});

test('R-b：包内没有该章节文件时错误文案带上文件名', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧', works: [{ id: 'w1', title: '测试剧', file: 'chapters/01.txt' }], assets: [],
  };
  const bytes = await packWithManifest(manifest);
  await assert.rejects(
    () => importPackage(ab(bytes), { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('缺少第 1 章') && e.message.includes('chapters/01.txt'),
  );
});

/* ---------- 裁定 R-c：数组形态 assets 也要推断 type ---------- */

test('R-c：数组形态 assets 迁移后按扩展名推断 type', () => {
  const v1 = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 1,
    id: 'x', title: 'X',
    works: [{ id: 'w1', title: 'W1', file: 'script.txt' }],
    assets: [{ id: 'cover', role: 'cover', file: 'assets/cover.png' }],
  };
  const m = migrateManifest(v1);
  assert.equal(m.assets.length, 1);
  assert.equal(m.assets[0].type, 'image/png');
  assert.equal(m.assets[0].role, 'cover');
  assert.equal(m.assets[0].id, 'cover');
});

/* ---------- 裁定 R-d：chapterNo 必须是整数 ---------- */

test('R-d：manifest 里 chapterNo 为字符串时导入结果是 number', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'series',
    id: 's1', title: '曲目',
    works: [
      { id: 's1_01', title: '曲目', file: 'chapters/01.txt', chapterNo: '1' },
      { id: 's1_02', title: '曲目', file: 'chapters/02.txt', chapterNo: '2' },
    ],
    assets: [],
  };
  const bytes = await packWithManifest(manifest, [
    { name: 'chapters/01.txt', data: SAMPLE },
    { name: 'chapters/02.txt', data: SAMPLE },
  ]);
  const res = await importPackage(ab(bytes), { existing: [] });
  res.works.forEach((w) => assert.equal(typeof w.chapterNo, 'number'));
  res.works.forEach((w) => assert.ok(Number.isInteger(w.chapterNo)));
});

/* ---------- 裁定 R-e / R-f：错误文案与封面兜底 ---------- */

test('R-f：无 DOM 时封面回退为原图 data URL', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const url = await buildCoverDataUrl(png, 'image/png');
  assert.ok(url && url.startsWith('data:image/png;base64,'));
});

test('R-f：无 DOM 时超过 2MB 的封面被跳过', async () => {
  const big = new Uint8Array(2 * 1024 * 1024 + 1);
  const url = await buildCoverDataUrl(big, 'image/png');
  assert.equal(url, null);
});

test('导入带封面的包时 coverImage 是 data URL', async () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage: bytesToDataUrl(png, 'image/png'),
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.ok(res.works[0].coverImage.startsWith('data:image/png;base64,'));
});

test('导入超过 4MB 的封面时跳过封面并给出警告', async () => {
  // 导出侧本来就会跳过 4MB 以上的封面，所以这里手工造一个超限的包来验证导入侧的兜底
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧',
    works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }],
    assets: [{ id: 'cover', role: 'cover', file: 'assets/cover.png', type: 'image/png', bytes: MAX_ASSET_BYTES + 1 }],
  };
  const bytes = await packWithManifest(manifest, [
    { name: 'script.txt', data: SAMPLE },
    { name: 'assets/cover.png', data: new Uint8Array(MAX_ASSET_BYTES + 1) },
  ]);
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.works[0].coverImage, null);
  assert.ok(Array.isArray(res.warnings) && res.warnings.some((x) => x.includes('封面图片超过 4MB')));
});

/* ---------- 裁定 R-g：JSON 源 → 导入 → 导出 → 再导入 ---------- */

test('R-g 闭环：JSON 源导出导入后 nodes 等价，再导出再导入仍等价', async () => {
  const script = await readFileToScript(new File([JSON_SRC], 'test.json'));
  const first = await exportPackage({
    kind: 'work', id: 'w1', title: 'JSON 剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: 'JSON 剧', tag: '', chapterNo: 1, source: script.source, script }],
  });
  const imported = await importPackage(ab(first.bytes), { existing: [] });
  assert.equal(imported.works.length, 1);
  const w = imported.works[0];
  assert.deepEqual(w.nodes.map((n) => n.t), script.nodes.map((n) => n.t));

  const second = await exportPackage({
    kind: 'work', id: 'w1', title: 'JSON 剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{
      id: w.id, title: w.title, tag: w.tag, chapterNo: w.chapterNo, source: w.source,
      script: {
        title: w.title, summary: w.summary, author: w.author,
        characters: w.characters, nodes: w.nodes, labels: w.labels,
      },
    }],
  });
  const again = await importPackage(ab(second.bytes), { existing: [] });
  const w2 = again.works[0];
  assert.deepEqual(w2.nodes.map((n) => n.t), w.nodes.map((n) => n.t));
  assert.deepEqual(
    w2.nodes.map((n) => (n.t === 'say' ? n.text : '')),
    w.nodes.map((n) => (n.t === 'say' ? n.text : '')),
  );
});

/* ---------- 导入端限额与坏包 ---------- */

test('导入端 32MB 上限：超限包给出中文 userFacing 错误', async () => {
  const oversized = new Uint8Array(MAX_PACKAGE_BYTES + 1);
  await assert.rejects(
    () => importPackage(oversized, { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('32MB'),
  );
});

test('不是 ZIP 的数据导入时报中文 userFacing 错误', async () => {
  const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  await assert.rejects(
    () => importPackage(ab(junk), { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('不是有效的暮幕作品包'),
  );
});

test('manifest.json 不是合法 JSON 时报中文 userFacing 错误', async () => {
  const bytes = await writeZip([{ name: 'manifest.json', data: '{ 不是 json' }]);
  await assert.rejects(
    () => importPackage(ab(bytes), { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('无法解析'),
  );
});

test('importPackage 是纯函数：不触碰 localStorage', async () => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  let touched = false;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { touched = true; throw new Error('importPackage 不应触碰 localStorage'); },
  });
  try {
    const res = await importPackage(ab(bytes), { existing: [] });
    assert.equal(res.works.length, 1);
    assert.equal(touched, false);
  } finally {
    delete globalThis.localStorage;
  }
});

test('单章包导入后不进入任何曲目（series 为空）', async () => {
  const sc = parseScriptText(SAMPLE, 'x.txt');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '测试剧', summary: '', author: '',
    series: { id: 'cicada', title: '蝉鸣止于逢魔时' }, license: null, coverImage: null,
    works: [{ id: 'w1', title: '测试剧', tag: '', chapterNo: 1, source: SAMPLE, script: sc }],
  });
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.kind, 'work');
  assert.equal(res.seriesId, null);
  assert.equal(res.works[0].series, null);
  assert.equal(res.works[0].seriesTitle, '');
  // 包内 series 字段只作为来源信息存进 manifest 快照
  assert.deepEqual(res.works[0].manifest.series, { id: 'cicada', title: '蝉鸣止于逢魔时' });
});

/* ============================================================
   修补轮 fix-r1：B1 曲目/章节 id 同步改名
   ============================================================ */

test('B1：同一曲目二次导入时曲目 id 与章节 id 都不变', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'series',
    id: 's1', title: '曲目',
    works: [
      { id: 's1_01', title: '曲目', file: 'chapters/01.txt' },
      { id: 's1_02', title: '曲目', file: 'chapters/02.txt' },
    ],
    assets: [],
  };
  const bytes = await packWithManifest(manifest, [
    { name: 'chapters/01.txt', data: SAMPLE },
    { name: 'chapters/02.txt', data: SAMPLE },
  ]);
  const res = await importPackage(ab(bytes), {
    existing: [{ id: 's1_01', series: 's1' }, { id: 's1_02', series: 's1' }],
  });
  assert.equal(res.seriesId, 's1');
  assert.deepEqual(res.works.map((w) => w.id), ['s1_01', 's1_02']);
  assert.deepEqual(res.works.map((w) => w.series), ['s1', 's1']);
});

test('B1：曲目 id 撞名且章节 id 撞名时曲目与章节都改名，本地作品不被覆盖', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'series',
    id: 's1', title: '曲目',
    works: [{ id: 's1_01', title: '曲目', file: 'chapters/01.txt' }],
    assets: [],
  };
  const bytes = await packWithManifest(manifest, [
    { name: 'chapters/01.txt', data: SAMPLE },
  ]);
  const res = await importPackage(ab(bytes), { existing: [{ id: 's1_01', series: 'other' }] });
  assert.equal(res.seriesId, 'user:s1');
  assert.notEqual(res.works[0].id, 's1_01');
  assert.ok(res.works[0].id.startsWith('user:'), `章节 id 应带 user: 前缀，实际 ${res.works[0].id}`);
  assert.equal(res.works[0].series, 'user:s1');
});

test('B1：本地只有同前缀的无关作品时曲目 id 不应被加 user: 前缀', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'series',
    id: 's1', title: '曲目',
    works: [{ id: 'zz_01', title: '曲目', file: 'chapters/01.txt' }],
    assets: [],
  };
  const bytes = await packWithManifest(manifest, [
    { name: 'chapters/01.txt', data: SAMPLE },
  ]);
  const res = await importPackage(ab(bytes), { existing: [{ id: 's1_extra', series: 'other' }] });
  assert.equal(res.seriesId, 's1');
  assert.equal(res.works[0].id, 'zz_01');
});

test('B1：单章作品的 id 与别的曲目下的本地作品撞名时改名', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧',
    works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }],
    assets: [],
  };
  const bytes = await packWithManifest(manifest, [{ name: 'script.txt', data: SAMPLE }]);
  const res = await importPackage(ab(bytes), { existing: [{ id: 'w1', series: 'other' }] });
  assert.equal(res.works[0].id, 'user:w1');
});

/* ============================================================
   修补轮 fix-r1：B2 chapterNo 归一（接受数字字符串）
   ============================================================ */

test('B2：validateManifest 把数字字符串 chapterNo 归一成 number', () => {
  const m = validateManifest({
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2,
    works: [{ id: 'a', title: 'A', file: 'script.txt', chapterNo: '2' }],
  });
  assert.equal(m.works[0].chapterNo, 2);
  assert.equal(typeof m.works[0].chapterNo, 'number');
});

test('B2：chapterNo 为数字字符串时按数值归一，非法值退回下标 +1', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'series',
    id: 's1', title: '曲目',
    works: [
      { id: 's1_01', title: '曲目', file: 'chapters/01.txt', chapterNo: '2' },
      { id: 's1_02', title: '曲目', file: 'chapters/02.txt', chapterNo: 'oops' },
      { id: 's1_03', title: '曲目', file: 'chapters/03.txt' },
    ],
    assets: [],
  };
  const bytes = await packWithManifest(manifest, [
    { name: 'chapters/01.txt', data: SAMPLE },
    { name: 'chapters/02.txt', data: SAMPLE },
    { name: 'chapters/03.txt', data: SAMPLE },
  ]);
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.works[0].chapterNo, 2);
  assert.equal(res.works[1].chapterNo, 2);
  assert.equal(res.works[2].chapterNo, 3);
  res.works.forEach((w) => {
    assert.equal(typeof w.chapterNo, 'number');
    assert.ok(Number.isInteger(w.chapterNo));
  });
});

/* ============================================================
   修补轮 fix-r1：B3 解压后总量上限（zip bomb 防护）
   ============================================================ */

/** 包内条目解压后总字节上限（与 scripts/package.js 保持一致） */
const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;

test('B3：单章剧本超过 5MB 时报中文 userFacing 错误', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧',
    works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }],
    assets: [],
  };
  const big = new Uint8Array(LIMITS.maxFileBytes + 1).fill(65);
  const bytes = await packWithManifest(manifest, [{ name: 'script.txt', data: big }]);
  await assert.rejects(
    () => importPackage(ab(bytes), { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('5MB'),
  );
});

test('B3：包内条目解压总量超过 64MB 时报中文 userFacing 错误', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧',
    works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }],
    assets: [],
  };
  const chunk = new Uint8Array(5 * 1024 * 1024).fill(65);
  const files = [{ name: 'script.txt', data: SAMPLE }];
  const count = Math.ceil((MAX_UNPACKED_BYTES + 1) / chunk.length);
  for (let i = 0; i < count; i++) files.push({ name: `assets/pad${i}.bin`, data: chunk });
  const bytes = await packWithManifest(manifest, files);
  await assert.rejects(
    () => importPackage(ab(bytes), { existing: [] }),
    (e) => e.userFacing === true && e.message.includes('64MB'),
  );
});

/* ============================================================
   修补轮 fix-r1：B4 封面识别（role 或 id）
   ============================================================ */

test('B4：assets 条目只有 id=cover、没有 role 时也能识别封面', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧',
    works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }],
    assets: [{ id: 'cover', file: 'assets/cover.png', type: 'image/png' }],
  };
  const bytes = await packWithManifest(manifest, [
    { name: 'script.txt', data: SAMPLE },
    { name: 'assets/cover.png', data: png },
  ]);
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.ok(res.works[0].coverImage, '封面应被识别');
  assert.ok(res.works[0].coverImage.startsWith('data:image/png;base64,'));
});

test('B4：封面条目无法处理时记一条警告而不是静默跳过', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧',
    works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }],
    assets: [{ id: 'cover', role: 'cover' }],
  };
  const bytes = await packWithManifest(manifest, [{ name: 'script.txt', data: SAMPLE }]);
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.works[0].coverImage, null);
  assert.ok(res.warnings.some((w) => w.includes('封面')), '应有封面相关警告');
});

/* ============================================================
   修补轮 fix-r1：B5 包级 summary 优先
   ============================================================ */

test('B5：本章自带简介时优先于包级 summary', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧', summary: '包级简介',
    works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }],
    assets: [],
  };
  const bytes = await packWithManifest(manifest, [{ name: 'script.txt', data: SAMPLE }]);
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.works[0].summary, '一段用于测试的短剧。');
});

test('B5：包级没有 summary 时回落到剧本内的简介', async () => {
  const manifest = {
    format: 'mumu-package', formatVersion: 1, schemaVersion: 2, kind: 'work',
    id: 'w1', title: '测试剧',
    works: [{ id: 'w1', title: '测试剧', file: 'script.txt' }],
    assets: [],
  };
  const bytes = await packWithManifest(manifest, [{ name: 'script.txt', data: SAMPLE }]);
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.works[0].summary, '一段用于测试的短剧。');
});

test('C1：单章文本超过字数上限时导入被拒绝，且报中文 userFacing 错误', async () => {
  const longText = `${SAMPLE}\n\n${'放学的教室里只剩下窗外的蝉鸣，磁带在书包里轻轻响着。'.repeat(2000)}`;
  assert.ok(countChars(longText) > LIMITS.maxChars);
  // 直接造包（绕过导出侧的同口径上限），验证导入侧确实会拦
  const bytes = await packWithManifest({
    format: PACKAGE_FORMAT, formatVersion: FORMAT_VERSION, schemaVersion: SCHEMA_VERSION,
    kind: 'work', id: 'w1', title: '超长剧',
    works: [{ id: 'w1', title: '超长剧', tag: '第一章', chapterNo: 1, file: 'script.txt', format: 'text', chars: countChars(longText) }],
    assets: [],
  }, [{ name: 'script.txt', data: longText }]);
  await assert.rejects(
    () => importPackage(ab(bytes), { existing: [] }),
    (e) => {
      assert.equal(e.userFacing, true);
      assert.match(e.message, new RegExp(`超过上限 ${LIMITS.maxChars} 字`));
      return true;
    },
  );
});

test('C2：导出超过字数上限的章节被拒绝，报中文 userFacing 错误', async () => {
  const longText = `${SAMPLE}\n\n${'放学的教室里只剩下窗外的蝉鸣，磁带在书包里轻轻响着。'.repeat(2000)}`;
  const sc = parseScriptText(longText, 'long.txt');
  await assert.rejects(
    () => exportPackage({
      kind: 'work', id: 'w1', title: '超长剧', summary: '', author: '',
      series: null, license: null, coverImage: null,
      works: [{ id: 'w1', title: '超长剧', tag: '第一章', chapterNo: 1, source: longText, script: sc }],
    }),
    (e) => {
      assert.equal(e.userFacing, true);
      assert.match(e.message, /超过上限 \d+ 字/);
      assert.match(e.message, /请精简后再导出/);
      return true;
    },
  );
});

test('C3：字数正好等于上限时可导出（边界不误伤）', async () => {
  // 造一段字数正好等于 LIMITS.maxChars 的文本
  const base = '蝉鸣止于逢魔时，教室里只剩下窗外的蝉鸣。';
  const n = Math.ceil(LIMITS.maxChars / countChars(base));
  let text = base.repeat(n);
  const over = countChars(text) - LIMITS.maxChars;
  if (over > 0) text = text.slice(0, text.length - over);
  assert.equal(countChars(text), LIMITS.maxChars);
  const sc = parseScriptText(text, 'edge.txt');
  const { bytes } = await exportPackage({
    kind: 'work', id: 'w1', title: '边界剧', summary: '', author: '',
    series: null, license: null, coverImage: null,
    works: [{ id: 'w1', title: '边界剧', tag: '第一章', chapterNo: 1, source: text, script: sc }],
  });
  const res = await importPackage(ab(bytes), { existing: [] });
  assert.equal(res.works.length, 1);
});
