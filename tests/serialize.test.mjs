import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptText } from '../scripts/parser.js';
import { serializeScript } from '../scripts/serialize.js';
import { loadBuiltinScripts } from '../scripts/builtin.js';

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

/* ============================================================
   台词含 `|` —— 角色行判定不能把台词当成角色定义行
   ============================================================ */

const PIPE_SAMPLE = `标题：含竖线
简介：台词里带竖线。
角色：
阿蓝 | 女 | 长发 | 白 | 少女（2）
小青 | 男 | 短发 | 蓝 | 少年

【场景：教室 | 黄昏 | 中景】
阿蓝：这个 | 那个
小青：也带一根 | 竖线
【结束】`;

test('台词含 `|` 时不会被当成角色定义行', () => {
  const sc = parseScriptText(PIPE_SAMPLE, 'pipe.txt');
  const says = sc.nodes.filter((n) => n.t === 'say');
  assert.deepEqual(says.map((n) => [n.who, n.text]), [
    ['阿蓝', '这个 | 那个'],
    ['小青', '也带一根 | 竖线'],
  ]);
  assert.deepEqual(sc.characters.map((c) => c.name), ['阿蓝', '小青']);
});

test('角色块之后的第一句台词即使含 `|` 也能正确解析', () => {
  const text = `标题：T
简介：s
角色：
阿蓝 | 女 | 长发 | 白 | 少女（2）
阿蓝：这个 | 那个
【结束】`;
  const sc = parseScriptText(text, 't.txt');
  const says = sc.nodes.filter((n) => n.t === 'say');
  assert.deepEqual(says.map((n) => [n.who, n.text]), [['阿蓝', '这个 | 那个']]);
  assert.deepEqual(sc.characters.map((c) => c.name), ['阿蓝']);
});

test('台词含 `|` 的剧本可以无损往返', () => {
  const sc = parseScriptText(PIPE_SAMPLE, 'pipe.txt');
  const again = parseScriptText(serializeScript(sc), 'pipe.txt');
  const said = (s) => s.nodes.filter((n) => n.t === 'say').map((n) => `${n.who}：${n.text}`);
  assert.deepEqual(said(again), said(sc));
  assert.deepEqual(again.characters.map((c) => c.name), sc.characters.map((c) => c.name));
});

/* ============================================================
   全部节点类型的往返
   ============================================================ */

const FULL_SAMPLE = `标题：全类型
简介：覆盖全部节点类型。
角色：
阿蓝 | 女 | 长发 | 白 | 少女（2）
小青 | 男 | 短发 | 蓝 | 少年

【场景：教室 | 黄昏 | 远景】
【镜头：中景】
阿蓝：开场白。
【姿态：阿蓝|难过】
【动作：小青|坐下】
【视角：过肩】
【出场：阿蓝|小青】
阿蓝（开心）：带情绪的台词。
【清场】
【场景：操场 | 夜晚 | 远景】
> 追问 -> ask
> 忽略 -> skip

[ask]
阿蓝：我来追问。
-> finish

[skip]
小青：那就跳过。
-> finish

[finish]
【结束：good】`;

test('全部节点类型的往返一致', () => {
  const sc = parseScriptText(FULL_SAMPLE, 'full.txt');
  const again = parseScriptText(serializeScript(sc), 'full.txt');
  // 显式锁定 11 种节点类型齐备：将来 parser 丢掉某种类型时本用例会失败，而不是静默通过
  const TYPES = ['scene', 'cam', 'say', 'pose', 'action', 'view', 'enter', 'clear', 'choice', 'jump', 'end'];
  assert.deepEqual([...new Set(sc.nodes.map((n) => n.t))].sort(), [...TYPES].sort());
  assert.deepEqual(again.nodes.map((n) => n.t), sc.nodes.map((n) => n.t));
  assert.deepEqual(again.nodes, sc.nodes);
  assert.deepEqual(again.labels, sc.labels);
});

test('角色行的性别 / 衣色 / 模型往返不丢', () => {
  const sc = parseScriptText(FULL_SAMPLE, 'full.txt');
  const again = parseScriptText(serializeScript(sc), 'full.txt');
  const pick = (s) => s.characters.map((c) => ({
    name: c.name, gender: c.gender, hair: c.hairHint, cloth: c.clothColor, model: c.model,
  }));
  assert.deepEqual(pick(again), pick(sc));
  assert.deepEqual(pick(again), [
    { name: '阿蓝', gender: 'f', hair: 'long', cloth: '#f1ece4', model: 'teen-girl-2' },
    { name: '小青', gender: 'm', hair: 'short', cloth: '#4a7fd0', model: 'teen-boy' },
  ]);
});

test('角色行输出不带尾部空列', () => {
  const text = `标题：T
简介：s
角色：
甲 | 男 | 短 | 白 | 少年
乙：你好`;
  const sc = parseScriptText(text, 't.txt');
  const out = serializeScript(sc);
  const rows = out.split('\n').filter((l) => l.includes('|') && !l.startsWith('【'));
  assert.deepEqual(rows, ['甲 | 男 | 短发 | #f1ece4 | 少年', '乙 |']);
  const again = parseScriptText(out, 't.txt');
  assert.deepEqual(again.characters.map((c) => c.name), ['甲', '乙']);
  assert.deepEqual(
    again.nodes.filter((n) => n.t === 'say').map((n) => [n.who, n.text]),
    [['乙', '你好']],
  );
});

test('未知节点类型导出时给出中文提示并带 userFacing', () => {
  const sc = parseScriptText(SAMPLE, 'test.txt');
  sc.nodes.push({ t: 'mystery' });
  assert.throws(
    () => serializeScript(sc),
    (e) => e.userFacing === true && /未知/.test(e.message) && /mystery/.test(e.message),
  );
});

/* ============================================================
   内置剧本不受影响
   ============================================================ */

test('内置剧本解析结果正常且没有幽灵角色', () => {
  const list = loadBuiltinScripts();
  assert.equal(list.length, 15);
  for (const sc of list) {
    assert.equal(sc.nodes[0].t, 'scene', sc.id);
    assert.ok(sc.nodes.some((n) => n.t === 'say'), sc.id);
    for (const c of sc.characters) {
      assert.ok(!c.name.includes('：') && !c.name.includes(':'), `${sc.id} 出现幽灵角色：${c.name}`);
    }
  }
});

test('内置剧本往返无损', () => {
  for (const sc of loadBuiltinScripts()) {
    const again = parseScriptText(serializeScript(sc), `${sc.id}.txt`);
    assert.deepEqual(again.nodes.map((n) => n.t), sc.nodes.map((n) => n.t), sc.id);
    assert.deepEqual(again.labels, sc.labels, sc.id);
    const said = (s) => s.nodes
      .filter((n) => n.t === 'say')
      .map((n) => [n.who, n.text, n.pose || '', n.voice || '', n.note || '']);
    assert.deepEqual(said(again), said(sc), sc.id);
    assert.deepEqual(
      again.characters.map((c) => [c.name, c.gender, c.clothColor, c.model]),
      sc.characters.map((c) => [c.name, c.gender, c.clothColor, c.model]),
      sc.id,
    );
  }
});
