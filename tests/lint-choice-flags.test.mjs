import test from 'node:test';
import assert from 'node:assert/strict';
import { lintText, lintBuiltin } from '../tools/lint.js';

const base = (body) => `标题：校验用例
简介：条件行与选项旗标。
角色：
甲 | 男 | 短发 | 白 | 少年
乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
${body}
【结束】`;

const codes = (text) => lintText(text).issues.map((i) => i.code);

test('合法的条件行与选项旗标零 issue', () => {
  const text = base(`甲：开场。
> 追问 @asked_tape -> A
> 沉默 -> B

[A]
?? asked_tape | 乙（轻声）：你问吧。
?? asked_tape | 【视角：过肩】
?? !asked_tape | 【镜头：近景】
?? asked_tape | 【场景：操场 | 黄昏 | 远景】
-> END

[B]
甲：好。
-> END

[END]`);
  assert.deepEqual(lintText(text).issues, []);
});

test('条件行写法错误报 E109', () => {
  const text = base(`甲：开场。
?? asked`);
  const r = lintText(text);
  assert.equal(r.issues.some((i) => i.code === 'E109' && i.line === 9), true);
});

test('条件行旗标名非法报 E109', () => {
  const text = base(`甲：开场。
?? 1bad | 甲：x`);
  assert.equal(codes(text).includes('E109'), true);
});

test('条件行用在选项 / 标签 / 跳转 / 结束 / 标题上报 E109', () => {
  const cases = [
    '?? asked | > 选项 -> L',
    '?? asked | [L]',
    '?? asked | -> L',
    '?? asked | 【结束】',
    '?? asked | 标题：另一个',
  ];
  for (const line of cases) {
    const text = base(`甲：开场。
${line}`);
    assert.equal(codes(text).includes('E109'), true, `应报 E109：${line}`);
  }
});

test('条件行用在角色表里报 E109', () => {
  const text = `标题：T
简介：s
角色：
甲 | 男 | 短发 | 白 | 少年
?? asked | 乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
甲：开场。
【结束】`;
  assert.equal(codes(text).includes('E109'), true);
});

test('选项旗标键名非法报 E110', () => {
  const text = base(`甲：开场。
> 追问 @asked-tape -> A`);
  assert.equal(codes(text).includes('E110'), true);
});

test('末尾只有 @ 报 E110', () => {
  const text = base(`甲：开场。
> 追问 @ -> A`);
  assert.equal(codes(text).includes('E110'), true);
});

test('内置 15 章零 issue（第二章引用第一章旗标不误报）', () => {
  const r = lintBuiltin();
  assert.deepEqual(r.issues, []);
});
