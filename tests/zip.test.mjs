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

test('大文本压缩后读回一致（走 deflate 压缩路径）', async () => {
  const text = '暮幕作品包正文。'.repeat(200);
  const bytes = await writeZip([{ name: 'chapters/long.txt', data: text }]);
  const entries = await readZipEntries(ab(bytes));
  assert.equal(new TextDecoder().decode(entries.get('chapters/long.txt')), text);
});
