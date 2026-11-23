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
