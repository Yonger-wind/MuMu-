import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptText } from '../scripts/parser.js';

const wrap = (body) => `标题：旗标测试
简介：测试选项旗标与条件行。
角色：
甲 | 男 | 短发 | 白 | 少年
乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
${body}
`;

const script = (body) => parseScriptText(wrap(body), 'flags.txt');

/* ---------------- 选项旗标注解 ---------------- */

test('选项末尾的 @ 注解写入 set，并从文字里剥掉', () => {
  const sc = script(`甲：开场。
> 追问她 @asked_tape -> A
> 换个话题 -> B

[A]
甲：A。
-> END

[B]
甲：B。
-> END

[END]
【结束】`);
  const choice = sc.nodes.find((n) => n.t === 'choice');
  assert.deepEqual(choice.options, [
    { text: '追问她', to: 'A', set: ['asked_tape'] },
    { text: '换个话题', to: 'B' },
  ]);
});

test('一个选项可写多个旗标，重复键只留一个', () => {
  const sc = script(`甲：开场。
> 同时发生 @a,b,a -> A

[A]
甲：A。
【结束】`);
  const opt = sc.nodes.find((n) => n.t === 'choice').options[0];
  assert.equal(opt.text, '同时发生');
  assert.deepEqual(opt.set, ['a', 'b']);
});

test('中文正文后不带空格的 @ 也能识别为注解', () => {
  const sc = script(`甲：开场。
> 追问她@asked_tape -> A

[A]
甲：A。
【结束】`);
  const opt = sc.nodes.find((n) => n.t === 'choice').options[0];
  assert.equal(opt.text, '追问她');
  assert.deepEqual(opt.set, ['asked_tape']);
});

test('不像注解的 @（邮箱、正文中间的 @）按普通文字保留', () => {
  const sc = script(`甲：开场。
> 发邮件到 a@b.com 询问 -> A
> 邮箱 a@b -> B

[A]
甲：A。
-> END

[B]
甲：B。
-> END

[END]
【结束】`);
  const opts = sc.nodes.find((n) => n.t === 'choice').options;
  assert.deepEqual(opts.map((o) => o.text), ['发邮件到 a@b.com 询问', '邮箱 a@b']);
  assert.equal(opts[0].set, undefined);
  assert.equal(opts[1].set, undefined);
});

test('选项旗标键名非法时报中文错误', () => {
  assert.throws(() => script(`甲：开场。
> 追问 @asked-ta... -> A
【结束】`), (e) => e.userFacing === true && /第 9 行/.test(e.message) && /不合法/.test(e.message));
});

test('末尾只有 @ 时报中文错误', () => {
  assert.throws(() => script(`甲：开场。
> 追问 @ -> A
【结束】`), (e) => e.userFacing === true && /第 9 行/.test(e.message) && /没有旗标名/.test(e.message));
});

/* ---------------- 条件行 ---------------- */

test('条件台词编译成 cond，正文不受影响', () => {
  const sc = script(`甲：开场。
?? asked | 乙（轻声）：你问了。
?? !asked | 乙：你没问。
【结束】`);
  const says = sc.nodes.filter((n) => n.t === 'say');
  assert.deepEqual(says.map((n) => n.text), ['开场。', '你问了。', '你没问。']);
  assert.deepEqual(says[1].cond, { key: 'asked', neg: false });
  assert.deepEqual(says[2].cond, { key: 'asked', neg: true });
});

test('条件场景只按第一个 | 切分，内层 | 属于场景标签', () => {
  const sc = script(`甲：开场。
?? asked | 【场景：操场 | 黄昏 | 远景】
【结束】`);
  const scene = sc.nodes.find((n) => n.t === 'scene' && n.cond);
  assert.deepEqual(scene.cond, { key: 'asked', neg: false });
  assert.equal(scene.scene, 'playground');
  assert.equal(scene.time, 'dusk');
  assert.equal(scene.cam, 'wide');
});

test('条件可用的舞台指示都挂上 cond', () => {
  const sc = script(`甲：开场。
?? asked | 【镜头：特写】
?? asked | 【姿态：甲|难过】
?? asked | 【动作：乙|坐下】
?? asked | 【视角：过肩】
?? asked | 【出场：乙】
?? asked | 【清场】
?? asked | 【场景：教室 | 夜晚 | 近景】
【结束】`);
  const dirs = sc.nodes.filter((n) => n.cond);
  assert.deepEqual(dirs.map((n) => n.t), ['cam', 'pose', 'action', 'view', 'enter', 'clear', 'scene']);
});

const forbidden = [
  ['选项', '?? asked | > 选项 -> L'],
  ['跳转', '?? asked | -> L'],
  ['标签', '?? asked | [L]'],
  ['结束', '?? asked | 【结束】'],
  ['标题', '?? asked | 标题：另一个'],
];

for (const [name, line] of forbidden) {
  test(`条件不能用在${name}上`, () => {
    assert.throws(() => script(`甲：开场。
${line}
【结束】`), (e) => e.userFacing === true && /第 9 行/.test(e.message) && /条件行不能用在/.test(e.message));
  });
}

test('条件不能写在角色表里', () => {
  const text = `标题：T
简介：s
角色：
甲 | 男 | 短发 | 白 | 少年
?? asked | 乙 | 女 | 长发 | 白 | 少女（2）

【场景：教室 | 黄昏 | 中景】
甲：开场。
【结束】`;
  assert.throws(() => parseScriptText(text, 't.txt'), (e) => e.userFacing === true && /条件行不能用在角色表/.test(e.message));
});

test('条件行语法错误都报中文并带行号', () => {
  const bads = [
    '?? asked',
    '?? 1bad | 甲：x',
    '?? asked |',
    '?? a | ?? b | 甲：x',
  ];
  for (const line of bads) {
    assert.throws(() => script(`甲：开场。
${line}
【结束】`), (e) => e.userFacing === true && /第 9 行/.test(e.message), `应拒绝：${line}`);
  }
});

/* ---------------- 旧文本兼容 ---------------- */

test('没有新语法的旧文本不出现 cond / set 字段', () => {
  const sc = script(`甲：开场。
> 追问 -> A

[A]
甲：A。
【结束】`);
  assert.ok(sc.nodes.every((n) => !('cond' in n)));
  const opt = sc.nodes.find((n) => n.t === 'choice').options[0];
  assert.equal('set' in opt, false);
});
