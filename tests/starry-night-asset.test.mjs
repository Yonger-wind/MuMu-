import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { getCard } from '../scripts/gallery-data.js';

const ROOT = new URL('../', import.meta.url);
const ASSET_REL = 'assets/images/starry-night.png';
const ASSET_URL = new URL(ASSET_REL, ROOT);
const EXPECTED_SHA256 =
  '39b380f803fc9eaed7ae4a5f15073ac041184a35688288d0c79da268ca0d94fa';

const CONSUMERS = [
  'scripts/scene.js',
  'scripts/selector.js',
  'scripts/modals.js',
  'scripts/gallery-data.js',
  'holo-card/index.html',
  'script-select/index.html',
];

test('星月夜剧情资产使用指定的 1495×1183 PNG 原图', () => {
  assert.ok(existsSync(ASSET_URL), `缺少高清星月夜资产：${ASSET_REL}`);

  const bytes = readFileSync(ASSET_URL);
  assert.equal(
    bytes.subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
    '星月夜资产必须是 PNG'
  );
  assert.equal(bytes.readUInt32BE(16), 1495);
  assert.equal(bytes.readUInt32BE(20), 1183);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), EXPECTED_SHA256);
});

test('星月夜的场景、封面、道具与图鉴入口都加载同一 PNG 资产', () => {
  assert.equal(getCard('seven-starry-night').image, `./${ASSET_REL}`);

  for (const rel of CONSUMERS) {
    const src = readFileSync(new URL(rel, ROOT), 'utf8');
    assert.doesNotMatch(src, /starry-night\.jpg/, `${rel} 仍在引用旧 JPG`);
    assert.match(src, /starry-night\.png/, `${rel} 未引用高清 PNG`);
  }
});
