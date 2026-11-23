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
