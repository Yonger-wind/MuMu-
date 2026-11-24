import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptText } from '../scripts/parser.js';

const scriptText = (endLine) => `标题：测试
简介：一个用于测试的小剧本
角色：
甲 | 男 | 短 | 白 | 少年

【场景：教室 | 黄昏 | 中景】
甲：这是第一句。
${endLine}
`;

test('【结束】仍然产出 ending 为空的结束节点', () => {
  const sc = parseScriptText(scriptText('【结束】'), 'test.txt');
  const end = sc.nodes[sc.nodes.length - 1];
  assert.equal(end.t, 'end');
  assert.equal(end.ending, '');
});

test('【结束：happy】产出带结局标识的结束节点', () => {
  const sc = parseScriptText(scriptText('【结束：happy】'), 'test.txt');
  const end = sc.nodes[sc.nodes.length - 1];
  assert.equal(end.t, 'end');
  assert.equal(end.ending, 'happy');
});

test('【完：bad_end】同样可用', () => {
  const sc = parseScriptText(scriptText('【完：bad_end】'), 'test.txt');
  const end = sc.nodes[sc.nodes.length - 1];
  assert.equal(end.ending, 'bad_end');
});

/* ============================================================
   画外音与特写道具的判定顺序（回归）
   ============================================================ */

const voiceScript = (line) => `标题：测试
简介：一个用于测试的小剧本
角色：
甲 | 女 | 长发 | 白 | 少女（2）
乙 | 男 | 短 | 白 | 少年

【场景：教室 | 黄昏 | 中景】
${line}
`;

test('画外音：括号内多段语气前缀也能识别为画外音', () => {
  const sc = parseScriptText(voiceScript('甲（声音微微有些颤抖，随后又化作释然的笑意，画外音）：这一句不该让立绘上台。'), 't.txt');
  const say = sc.nodes.find((n) => n.t === 'say');
  assert.equal(say.who, '甲');
  assert.equal(say.voice, '画外音');
  assert.equal(say.pose, undefined);
  assert.equal(say.text, '这一句不该让立绘上台。');
});

test('画外音：单段语气前缀同样识别为画外音', () => {
  const sc = parseScriptText(voiceScript('甲（温柔的声音，画外音）：你好。'), 't.txt');
  const say = sc.nodes.find((n) => n.t === 'say');
  assert.equal(say.voice, '画外音');
  assert.equal(say.pose, undefined);
});

test('画外音：判定优先于情绪模糊匹配（含「笑」字的描写不再变成开心姿态）', () => {
  const sc = parseScriptText(voiceScript('乙（轻轻笑了笑，画外音）：你好。'), 't.txt');
  const say = sc.nodes.find((n) => n.t === 'say');
  assert.equal(say.voice, '画外音');
  assert.equal(say.pose, undefined);
});

test('普通情绪括号仍然解析为姿态，不受画外音判定影响', () => {
  const sc = parseScriptText(voiceScript('甲（开心）：今天真好。'), 't.txt');
  const say = sc.nodes.find((n) => n.t === 'say');
  assert.equal(say.pose, 'happy');
  assert.equal(say.voice, undefined);
});
