import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_FORMAT, FORMAT_VERSION, SCHEMA_VERSION,
  MAX_PACKAGE_BYTES, MAX_ASSET_BYTES, MIGRATIONS, pkgFail,
  makeManifest, migrateManifest, validateManifest,
  exportPackage, dataUrlToBytes, bytesToDataUrl,
} from '../scripts/package.js';
import { readZipEntries } from '../scripts/zip.js';
import { parseScriptText, countChars, readFileToScript } from '../scripts/parser.js';
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
