import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptText } from '../scripts/parser.js';
import { serializeScript } from '../scripts/serialize.js';

const SAMPLE = `标题：旗标往返
简介：条件行与选项旗标。
角色：
甲 | 男 | 短发 | 白 | 少年
乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
甲：开场。
> 追问 @asked_tape,kept_quiet -> A
> 沉默 -> B

[A]
?? asked_tape | 乙（轻声）：你问了。
?? !asked_tape | 乙：你没问。
?? picked | 【视角：过肩】
?? picked | 【镜头：特写】
-> END

[B]
甲：好。
-> END

[END]
【结束】`;

test('带 cond / set 的脚本往返不丢字段', () => {
  const sc = parseScriptText(SAMPLE, 'flags.txt');
  const again = parseScriptText(serializeScript(sc), 'flags.txt');
  assert.deepEqual(again.nodes, sc.nodes);
  assert.deepEqual(again.labels, sc.labels);
});

test('序列化输出保留注解与条件前缀', () => {
  const out = serializeScript(parseScriptText(SAMPLE, 'flags.txt'));
  assert.ok(out.includes('> 追问 @asked_tape,kept_quiet -> A'));
  assert.ok(out.includes('?? asked_tape | 乙（轻声）：你问了。'));
  assert.ok(out.includes('?? !asked_tape | 乙：你没问。'));
  assert.ok(out.includes('?? picked | 【视角：过肩】'));
});

test('没有新字段的旧脚本导出不变', () => {
  const text = `标题：旧剧本
简介：没有旗标。
角色：
甲 | 男 | 短发 | 白 | 少年

【场景：教室 | 黄昏 | 中景】
甲：你好。
【结束】`;
  const out = serializeScript(parseScriptText(text, 'old.txt'));
  assert.equal(out.includes('??'), false);
  assert.equal(/ @/.test(out), false);
  assert.deepEqual(parseScriptText(out, 'old.txt').nodes, parseScriptText(text, 'old.txt').nodes);
});
