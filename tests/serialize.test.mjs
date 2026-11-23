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
