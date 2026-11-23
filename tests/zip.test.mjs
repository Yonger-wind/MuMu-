import test from 'node:test';
import assert from 'node:assert/strict';
import { writeZip, readZipEntries, unzipEntries, crc32 } from '../scripts/zip.js';
import { readFileToScript, countChars } from '../scripts/parser.js';

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

test('大文本压缩后读回一致（走 deflate 压缩路径）', async () => {
  const text = '暮幕作品包正文。'.repeat(200);
  const bytes = await writeZip([{ name: 'chapters/long.txt', data: text }]);
  const z = await unzipEntries(ab(bytes));
  assert.equal(z.entries[0].method, 8);           // 大文本必然走 deflate
  const entries = await readZipEntries(ab(bytes));
  assert.equal(new TextDecoder().decode(entries.get('chapters/long.txt')), text);
});

test('极短文本退回 stored（method 0）且内容一致', async () => {
  const bytes = await writeZip([{ name: 'chapters/tiny.txt', data: 'x' }]);
  const z = await unzipEntries(ab(bytes));
  assert.equal(z.entries[0].method, 0);           // 压缩后反而更大 → stored
  const entries = await readZipEntries(ab(bytes));
  assert.equal(new TextDecoder().decode(entries.get('chapters/tiny.txt')), 'x');
});

test('写出的 local header 里 CRC-32 与原文一致', async () => {
  const raw = '暮幕作品包正文。'.repeat(50);
  const bytes = await writeZip([{ name: 'chapters/crc.txt', data: raw }]);
  const z = await unzipEntries(ab(bytes));
  const dv = new DataView(ab(bytes));
  const off = z.entries[0].localOff;
  assert.equal(dv.getUint32(off + 14, true), crc32(new TextEncoder().encode(raw)));
});

test('stored 条目的 local header 里 CRC-32 与原文一致', async () => {
  const raw = 'x';
  const bytes = await writeZip([{ name: 'chapters/tiny.txt', data: raw }]);
  const z = await unzipEntries(ab(bytes));
  const dv = new DataView(ab(bytes));
  const off = z.entries[0].localOff;
  assert.equal(dv.getUint32(off + 14, true), crc32(new TextEncoder().encode(raw)));
});

test('浏览器不支持 deflate-raw 时给出中文提示且带 userFacing', async () => {
  const text = '暮幕作品包正文。'.repeat(200);
  const bytes = await writeZip([{ name: 'chapters/long.txt', data: text }]);
  const buf = ab(bytes);
  const original = globalThis.DecompressionStream;
  globalThis.DecompressionStream = class {
    constructor() { throw new TypeError('unsupported compression format: deflate-raw'); }
  };
  try {
    await assert.rejects(
      () => readZipEntries(buf),
      (e) => {
        assert.equal(e.message, '当前浏览器不支持解压 zip，请升级到较新的浏览器，或直接导入 .txt 文件。');
        assert.equal(e.userFacing, true);
        return true;
      },
    );
  } finally {
    globalThis.DecompressionStream = original;
  }
});

test('中央目录被截断时给出中文提示且带 userFacing', async () => {
  const buf = new Uint8Array(22);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x06054b50, true);   // EOCD
  dv.setUint16(8, 1, true);
  dv.setUint16(10, 1, true);
  dv.setUint32(12, 46, true);
  dv.setUint32(16, 9999, true);       // 中央目录偏移越界
  await assert.rejects(
    () => readZipEntries(buf.buffer),
    (e) => {
      assert.equal(e.message, '压缩包结构已损坏，请重新导出后再试。');
      assert.equal(e.userFacing, true);
      return true;
    },
  );
});

/* ---------------- 导入 .zip 剧本流程（parser 集成回归） ---------------- */

const SAMPLE_SCRIPT = [
  '标题：暮幕 ZIP 导入回归样例',
  '简介：用于验证 .zip 剧本导入链路的样例正文。',
  '角色：',
  '夏目悠真 | 男 | 短发 | 藏青 | 少年',
  '小葵 | 女 | 双马尾 | 橙 | 少女',
  '【场景：教室 | 黄昏 | 远景】',
  '旁白：放学后的教室只剩风穿过走廊的声音，课桌上落了一层薄薄的灰。',
  '夏目悠真：这卷磁带我找了很久，原来一直躺在讲台下面。',
  '小葵：你确定要在放学后一个人听它吗？',
  '夏目悠真：我已经不是一个人了。',
  '【场景：操场 | 夜晚 | 远景】',
  '旁白：天色彻底沉下来以后，操场上只剩下虫鸣和远处的车声。',
  '夏目悠真：录音的最后一句话，是留给我一个人的。',
  '小葵：那我们就把它听完吧。',
].join('\n');

test('导入 .zip 剧本：解析出标题、字数与角色', async () => {
  assert.ok(countChars(SAMPLE_SCRIPT) >= 200, '样例正文需达到 200 字下限');
  const bytes = await writeZip([{ name: '剧本.txt', data: SAMPLE_SCRIPT }]);
  const file = new File([bytes], '剧本.zip', { type: 'application/zip' });
  const script = await readFileToScript(file);
  assert.equal(script.title, '暮幕 ZIP 导入回归样例');
  assert.equal(script.chars, countChars(SAMPLE_SCRIPT));
  assert.ok(script.characters.some((c) => c.name === '夏目悠真'));
  assert.ok(script.characters.some((c) => c.name === '小葵'));
});

test('导入 .zip 剧本：非压缩包内容报中文提示且带 userFacing', async () => {
  const file = new File([new TextEncoder().encode('这根本不是一个压缩包，只是一段普通文字。')], '剧本.zip');
  await assert.rejects(
    () => readFileToScript(file),
    (e) => {
      assert.equal(e.message, '无法识别该压缩包，请确认它是标准 .zip 文件。');
      assert.equal(e.userFacing, true);
      return true;
    },
  );
});
