import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS } from '../scripts/parser.js';
import { matchTable, resolveTable, scanText, lintText, lintBuiltin } from '../tools/lint.js';

const TABLES = { SCENES, TIMES, CAMS, POSES, ACTS, VIEWS };

test('matchTable 认得每个表里的全部 label 与 alias', () => {
  for (const [name, table] of Object.entries(TABLES)) {
    for (const def of Object.values(table)) {
      const words = [def.label, ...(def.aliases || [])];
      for (const w of words) {
        assert.equal(matchTable(table, w), matchTable(table, w), `${name} ${w} 应可识别`);
        assert.notEqual(matchTable(table, w), null, `${name} ${w} 不应判为未知`);
      }
    }
  }
});

test('matchTable 对陌生词返回 null', () => {
  assert.equal(matchTable(SCENES, '未识别的场景'), null);
  assert.equal(matchTable(CAMS, '超特写'), null);
  assert.equal(matchTable(POSES, '崩溃'), null);
});

test('matchTable 复刻解析器的最长子串口径：火夜 不能被 夜 抢先', () => {
  assert.equal(matchTable(TIMES, '火夜'), 'fire');
  assert.equal(matchTable(TIMES, '夜晚'), 'night');
  assert.equal(matchTable(TIMES, '夜晚的教室'), 'night');   // 前缀口径：带修饰语也认得
});

test('resolveTable 复刻解析器口径：能说出解析器实际会当成什么', () => {
  assert.deepEqual(resolveTable(TIMES, '火夜'), { key: 'fire', mode: 'exact' });
  assert.deepEqual(resolveTable(CAMS, '超特写'), { key: 'detail', mode: 'fuzzy' });
  assert.deepEqual(resolveTable(SCENES, '未识别的场景'), { key: null, mode: 'none' });
});

test('scanText 逐行分类并保留行号', () => {
  const src = [
    '标题：样例',
    '简介：一句话',
    '角色：',
    '阿蓝 | 男 | 短发 | 白 | 少年',
    '',
    '【场景：教室 | 黄昏 | 远景】',
    '[支线]',
    '> 追问 -> 追问分支',
    '-> 追问分支',
    '阿蓝：你好。',
  ].join('\n');
  const s = scanText(src);
  assert.equal(s.meta.title, '样例');
  assert.equal(s.meta.summary, '一句话');
  assert.equal(s.chars.size, 1);
  assert.equal(s.chars.get('阿蓝').cols.length, 5);
  assert.equal(s.labels.length, 1);
  assert.equal(s.labels[0].name, '支线');
  assert.deepEqual(s.lines.map((l) => l.kind), [
    'meta', 'meta', 'charRow', 'dir', 'label', 'choice', 'jump', 'say',
  ]);
  assert.equal(s.lines[0].line, 1);
  assert.equal(s.lines[7].line, 10);
  assert.equal(s.sawScene, true);
});

test('scanText 把标签指向其后第一个内容行', () => {
  const s = scanText('[A]\n甲：说话\n[B]\n乙：说话');
  assert.equal(s.labels[0].targetLine, 2);
  assert.equal(s.labels[1].targetLine, 4);
});

test('scanText 的标签落点只认故事行，不会指向角色行', () => {
  const s = scanText('标题：x\n角色：\n阿蓝 | 男 | 短发 | 白 | 少年\n\n[A]\n甲：说话');
  assert.equal(s.labels[0].targetLine, 6);
  // 标签之后只有 meta 行（不产生节点）时没有落点
  const s2 = scanText('[A]\n标题：x');
  assert.equal(s2.labels[0].targetLine, null);
});

// Task 1 的占位断言（issues 恒为空）已随 Task 2 的规则接入失效：
// 这份样本缺显式【结束】，按 W108 会有一条 warning，但不应有 error。
test('lintText 接入 12 条文本级规则后：本样本没有 error', () => {
  const r = lintText('标题：x\n角色：\n阿蓝 | 男 | 短发 | 白 | 少年\n\n【场景：教室 | 黄昏 | 远景】\n阿蓝：你好。', 'x.txt');
  assert.deepEqual(r.issues.filter((i) => i.severity === 'error'), []);
  assert.equal(r.summary.errors, 0);
});

test('scanText 跳过注释行', () => {
  const s = scanText('标题：x\n// 这是注释\n<!-- 这也是注释 -->\n甲：说话');
  assert.equal(s.lines.filter((l) => l.kind === 'say').length, 1);
});

test('scanText 认得无冒号的舞台指示', () => {
  const s = scanText('标题：x\n【结束】');
  const dir = s.lines.find((l) => l.kind === 'dir');
  assert.equal(dir.name, '结束');
  assert.equal(dir.value, '');
  assert.equal(s.sawEnd, true);
});

test('scanText 不拆舞台指示的值', () => {
  const s = scanText('标题：x\n【场景：教室 | 黄昏 | 远景】');
  const dir = s.lines.find((l) => l.kind === 'dir');
  assert.equal(dir.value, '教室 | 黄昏 | 远景');
  assert.equal(s.sawScene, true);
});

/* ============================================================
   Task 2：12 条文本级规则
   ============================================================ */

const lint = (src, name = 'x.txt') => lintText(src, name);

test('E101 未知舞台指示标签', () => {
  const r = lint('标题：x\n【场景：教室 | 黄昏 | 远景】\n【特写：手】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'E101');
  assert.ok(it, '应报 E101');
  assert.equal(it.severity, 'error');
  assert.equal(it.line, 3);
});

test('E102 未知场景', () => {
  const r = lint('标题：x\n\n【场景：未识别的场景 | 黄昏 | 远景】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'E102');
  assert.ok(it);
  assert.equal(it.line, 3);
});

test('E103 落点不存在（跳转与选项各一条）', () => {
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】\n-> 不存在的标签\n> 选项 -> 也不存在\n阿蓝：你好。');
  const its = r.issues.filter((i) => i.code === 'E103');
  assert.equal(its.length, 2);
  assert.deepEqual(its.map((i) => i.line).sort((a, b) => a - b), [4, 5]);
});

test('E104 标签重复定义', () => {
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】\n[甲]\n[甲]');
  const it = r.issues.find((i) => i.code === 'E104');
  assert.ok(it);
  assert.equal(it.line, 5);
  assert.match(it.message, /4/);
});

test('E105 选项行缺少落点', () => {
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】\n> 只有选项没有落点');
  const it = r.issues.find((i) => i.code === 'E105');
  assert.ok(it);
  assert.equal(it.line, 4);
});

test('W101 未知时间/镜头/姿态/动作/视角各一条', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 凌晨 | 远景】',
    '【镜头：超特写】', '【姿态：崩溃】', '【动作：飞翔】', '【视角：俯瞰】',
    '阿蓝：你好。',
  ].join('\n'));
  const codes = r.issues.filter((i) => i.severity === 'warning').map((i) => i.code);
  assert.equal(codes.filter((c) => c === 'W101').length, 5);
});

test('W102 未知模型名', () => {
  const r = lint('标题：x\n角色：\n阿蓝 | 男 | 短发 | 白 | 不存在的模型\n\n【场景：教室 | 黄昏 | 远景】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'W102');
  assert.ok(it);
  assert.equal(it.line, 3);
});

test('W103 说话人未在角色表声明', () => {
  const r = lint('标题：x\n角色：\n阿蓝 | 男 | 短发 | 白 | 少年\n\n【场景：教室 | 黄昏 | 远景】\n小葵：你好。');
  const it = r.issues.find((i) => i.code === 'W103');
  assert.ok(it);
  assert.equal(it.line, 6);
});

test('W104 出场人物未声明', () => {
  const r = lint('标题：x\n角色：\n阿蓝 | 男 | 短发 | 白 | 少年\n\n【场景：教室 | 黄昏 | 远景】\n【出场：阿蓝|小葵】');
  const it = r.issues.find((i) => i.code === 'W104');
  assert.ok(it);
  assert.equal(it.line, 6);
});

test('W105 角色表列数不等于 5', () => {
  const r = lint('标题：x\n角色：\n阿蓝 | 男 | 少年\n\n【场景：教室 | 黄昏 | 远景】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'W105');
  assert.ok(it);
  assert.equal(it.line, 3);
});

test('W107 全文没有场景指示', () => {
  const r = lint('标题：x\n\n阿蓝：你好。');
  assert.ok(r.issues.find((i) => i.code === 'W107'));
});

test('W108 结尾没有显式【结束】', () => {
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】\n阿蓝：你好。');
  const it = r.issues.find((i) => i.code === 'W108');
  assert.ok(it);
});

test('干净样本零 issue', () => {
  const src = readFileSync(new URL('./fixtures/lint/clean.txt', import.meta.url), 'utf8');
  const r = lint(src, 'clean.txt');
  assert.deepEqual(r.issues.map((i) => `${i.code}@${i.line}:${i.message}`), []);
});

test('坏文本样本：产生精确的 5 条 issue（E101@9、W105@6、W101@12、E105@13、E103@14）', () => {
  const src = readFileSync(new URL('./fixtures/lint/bad-text-level.txt', import.meta.url), 'utf8');
  const r = lint(src, 'bad-text-level.txt');
  const got = r.issues.map((i) => `${i.code}@${i.line}`).sort();
  assert.deepEqual(got, ['E101@9', 'E103@14', 'E105@13', 'W101@12', 'W105@6']);
});

/* ============================================================
   修复轮 R=1：词表派生、角色行取当前行、E101 缺值、W103 守卫
   ============================================================ */

test('W101 文案按解析器真实行为分两种口径', () => {
  // 模糊命中：解析器会把它当成「特写」
  const r1 = lint('标题：x\n【镜头：超特写】');
  const it1 = r1.issues.find((i) => i.code === 'W101');
  assert.ok(it1, '未知镜头应报 W101');
  assert.match(it1.message, /当成「特写」/);
  // 完全认不出：解析器会回落到默认镜头 / 时段
  const r2 = lint('标题：x\n【场景：教室 | 凌晨 | 远景】');
  const it2 = r2.issues.find((i) => i.code === 'W101');
  assert.ok(it2, '未知时段应报 W101');
  assert.match(it2.message, /回落到「黄昏」/);
});

test('E102 只在完全认不出场景时报，模糊命中降级为 W101', () => {
  const r = lint('标题：x\n【场景：的教室 | 黄昏 | 远景】');
  assert.equal(r.issues.filter((i) => i.code === 'E102').length, 0);
  assert.ok(r.issues.find((i) => i.code === 'W101'), '模糊命中应降级为 W101');
});

test('可用值清单一律从词表派生：提示里只有词表真有的值', () => {
  // 解析器的 POSES 里没有「疲惫」，有「害羞 / 思考」——清单必须跟着词表走
  const r = lint('标题：x\n【姿态：疲惫】');
  const it = r.issues.find((i) => i.code === 'W101');
  assert.ok(it, '「疲惫」不在词表里，应报 W101');
  assert.match(it.hint, /害羞/);
  assert.match(it.hint, /思考/);
  assert.doesNotMatch(it.hint, /疲惫/);
});

test('E102 的可用场景清单来自词表（包含全部场景 label）', () => {
  const r = lint('标题：x\n【场景：不存在的地方 | 黄昏 | 远景】');
  const it = r.issues.find((i) => i.code === 'E102');
  assert.ok(it);
  for (const def of Object.values(SCENES)) {
    assert.ok(it.message.includes(def.label), `可用场景清单应包含「${def.label}」`);
  }
});

test('E101 已知标签缺必需值：报 E101 并说明会被当成旁白', () => {
  const r = lint('标题：x\n【场景】');
  const it = r.issues.find((i) => i.code === 'E101');
  assert.ok(it, '缺值的【场景】应报 E101');
  assert.equal(it.severity, 'error');
  assert.equal(it.line, 2);
  assert.match(it.message, /缺少值/);
  assert.match(it.message, /旁白/);
  assert.ok(it.hint, '应给出改法提示');
});

test('缺值【场景】不再抑制 W107；同份样本补上有效场景后 W107 消失', () => {
  const only = lint('标题：x\n【场景】');
  assert.ok(only.issues.find((i) => i.code === 'W107'), '缺值【场景】不算场景指示，应报 W107');
  const both = lint('标题：x\n【场景】\n【场景：教室 | 黄昏 | 远景】');
  assert.equal(both.issues.filter((i) => i.code === 'W107').length, 0, '有有效场景时不该报 W107');
  assert.equal(both.issues.filter((i) => i.code === 'E101').length, 1, '缺值那一行仍应报 E101');
});

test('【姿态：*】/【动作：*】是「全场」写法，不报 W101', () => {
  const r = lint([
    '标题：x', '角色：', '阿蓝 | 男 | 短发 | 白 | 少年', '',
    '【场景：教室 | 黄昏 | 远景】', '【姿态：*】', '【动作：*】', '【姿态：阿蓝|*】',
  ].join('\n'));
  assert.equal(r.issues.filter((i) => i.code === 'W101').length, 0);
});

test('纯旁白的长括号行不报 W103（复刻解析器守卫）', () => {
  const r = lint([
    '标题：x', '角色：', '阿蓝 | 男 | 短发 | 白 | 少年', '',
    '【场景：教室 | 黄昏 | 远景】', '他（看着天色，眉头微蹙）：说了一句。',
  ].join('\n'));
  assert.equal(r.issues.filter((i) => i.code === 'W103').length, 0, '长括号 + 未声明名字 = 纯旁白');
  // 括号内容 ≤ 6 字时解析器确实当台词，仍要报 W103
  const r2 = lint([
    '标题：x', '角色：', '阿蓝 | 男 | 短发 | 白 | 少年', '',
    '【场景：教室 | 黄昏 | 远景】', '小葵（轻声）：你好。',
  ].join('\n'));
  assert.ok(r2.issues.find((i) => i.code === 'W103'), '短括号的未声明说话人应报 W103');
});

test('重名角色行按当前行原文判定列数与模型', () => {
  const cols = lint([
    '标题：x', '角色：',
    '阿蓝 | 男 | 短发 | 白 | 少年',
    '阿蓝 | 女 | 长发',
    '', '【场景：教室 | 黄昏 | 远景】', '阿蓝：你好。',
  ].join('\n'));
  assert.deepEqual(cols.issues.filter((i) => i.code === 'W105').map((i) => i.line), [4],
    '只有 3 列的第 4 行报 W105，第 3 行不报');
  const model = lint([
    '标题：x', '角色：',
    '阿蓝 | 男 | 短发 | 白 | 不存在的模型',
    '阿蓝 | 男 | 短发 | 白 | 少年',
    '', '【场景：教室 | 黄昏 | 远景】', '阿蓝：你好。',
  ].join('\n'));
  assert.deepEqual(model.issues.filter((i) => i.code === 'W102').map((i) => i.line), [3],
    '第 3 行的坏模型要报 W102，不被后写的同名行覆盖');
});

/* ============================================================
   修复轮 R=2：E101 语义边界、无值标签带值、全角分支补值判定
   ============================================================ */

test('E101：值只有空白时说「回落到默认」，不说「当成旁白」', () => {
  // 解析器对【镜头： 】产出 cam 节点（cam:"mid"），不是旁白，文案不能骗人
  const r = lint('标题：x\n【镜头： 】');
  const it = r.issues.find((i) => i.code === 'E101');
  assert.ok(it, '只有空白的值也应报 E101');
  assert.equal(it.severity, 'error');
  assert.equal(it.line, 2);
  assert.match(it.message, /回落/);
  assert.match(it.message, /中景/, '镜头应回落到中景');
  assert.doesNotMatch(it.message, /当成旁白/);
});

test('E101：值完全为空时仍说「会被当成旁白」', () => {
  const r = lint('标题：x\n【场景】');
  const it = r.issues.find((i) => i.code === 'E101');
  assert.ok(it);
  assert.match(it.message, /当成旁白/);
  assert.doesNotMatch(it.message, /回落/);
});

test('E101：只有空白的值按标签说清各自的解析器行为', () => {
  const cases = [
    ['【姿态： 】', /回落.*自然/],
    ['【动作： 】', /回落.*站立/],
    ['【视角： 】', /回落.*常规/],
    ['【出场： 】', /不会生效/],
  ];
  for (const [line, re] of cases) {
    const r = lint(`标题：x\n${line}`);
    const it = r.issues.find((i) => i.code === 'E101');
    assert.ok(it, `${line} 应报 E101`);
    assert.equal(it.line, 2);
    assert.match(it.message, re, `${line} 的文案应说清解析器的真实行为`);
    assert.doesNotMatch(it.message, /当成旁白/);
  }
});

test('E101：无值标签带值（清场/空场/无人）要报错', () => {
  for (const tag of ['清场', '空场', '无人']) {
    const r = lint(`标题：x\n【${tag}：xxx】`);
    const it = r.issues.find((i) => i.code === 'E101');
    assert.ok(it, `【${tag}：xxx】应报 E101`);
    assert.equal(it.severity, 'error');
    assert.equal(it.line, 2);
    assert.match(it.message, /旁白/, '带值后整行会退化成旁白');
  }
});

test('E101：结束 / 完 允许带值（结局名），不报 E101', () => {
  for (const tag of ['结束', '完']) {
    const r = lint(`标题：x\n【${tag}：xxx】`);
    assert.equal(r.issues.filter((i) => i.code === 'E101').length, 0, `【${tag}：xxx】不应报 E101`);
  }
});

test('W101：全角｜分支仍要判定值本身（阿蓝｜疲惫）', () => {
  const r = lint('标题：x\n【姿态：阿蓝｜疲惫】');
  const its = r.issues.filter((i) => i.code === 'W101');
  assert.equal(its.length, 1);
  assert.equal(its[0].line, 2);
  assert.match(its[0].message, /｜/, '要提到用了全角分隔符');
  assert.match(its[0].message, /疲惫/, '要提到作者真正想写的那个值');
  assert.match(its[0].message, /未识别/, '要说明该值未识别');
});

test('W101：全角｜但值本身合法时只报分隔符问题', () => {
  const r = lint('标题：x\n【姿态：阿蓝｜难过】');
  const its = r.issues.filter((i) => i.code === 'W101');
  assert.equal(its.length, 1);
  assert.match(its[0].message, /｜/);
  assert.doesNotMatch(its[0].message, /未识别/);
});

/* ============================================================
   Task 3：4 条控制流规则与解析器交叉验证
   ============================================================ */

test('E106 不可达节点', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一', '-> 主线', '[主线]', '乙：二', '【结束】',
    '丙：这段永远走不到',
  ].join('\n'));
  const it = r.issues.find((i) => i.code === 'E106');
  assert.ok(it, '应报 E106');
  assert.equal(it.line, 9);
});

test('E107 回跳（跳到更早的标签）', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '[起点]', '甲：一', '-> 起点', '【结束】',
  ].join('\n'));
  const it = r.issues.find((i) => i.code === 'E107');
  assert.ok(it);
  assert.equal(it.line, 6);
});

test('E108 选项回指（落点在选项之前）', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '[起点]', '甲：一', '> 回头 -> 起点', '【结束】',
  ].join('\n'));
  const it = r.issues.find((i) => i.code === 'E108');
  assert.ok(it);
  assert.equal(it.line, 6);
});

test('W106 死标签（从未被引用）', () => {
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '[没人去]', '甲：一', '【结束】',
  ].join('\n'));
  const it = r.issues.find((i) => i.code === 'W106');
  assert.ok(it);
  assert.equal(it.line, 4);
});

test('E100 解析器交叉验证兜底（扫描器未覆盖的硬错误）', () => {
  // 没有任何台词或旁白：解析器会拒绝，扫描器本身不会报
  const r = lint('标题：x\n\n【场景：教室 | 黄昏 | 远景】');
  const it = r.issues.find((i) => i.code === 'E100');
  assert.ok(it, '应报 E100');
  assert.equal(it.severity, 'error');
});

test('坏控制流样本：产生精确的 4 条 issue（E108@10、W106@11、E106@12、E107@13）', () => {
  const src = readFileSync(new URL('./fixtures/lint/bad-control-flow.txt', import.meta.url), 'utf8');
  const r = lint(src, 'bad-control-flow.txt');
  const got = r.issues.map((i) => `${i.code}@${i.line}`).sort();
  assert.deepEqual(got, ['E106@12', 'E107@13', 'E108@10', 'W106@11']);
});

test('解析器交叉验证不与已有的行级报告重复（E103 已报就不再来一条 E100）', () => {
  // 这份样本的跳转指向不存在的标签：解析器会抛「跳转指向了不存在的标签」，
  // 但 E103 已经带行号报过一次，不应该再冒出一条没有行号的 E100。
  const src = readFileSync(new URL('./fixtures/lint/bad-text-level.txt', import.meta.url), 'utf8');
  const r = lint(src, 'bad-text-level.txt');
  assert.equal(r.issues.filter((i) => i.code === 'E100').length, 0);
  // 前提也要锁住：这份样本必须真的报出 E103，否则「不重复」是空断言
  assert.deepEqual(r.issues.filter((i) => i.code === 'E103').map((i) => i.line), [14]);
});

/* ============================================================
   修复轮 R=1：控制流规则必须与解析器的真实语义一致
   ============================================================ */

test('没有落点的选项行按旁白处理，不参与选项组（与解析器一致）', () => {
  // 解析器只把「> 文本 -> 目标」认成选项；「> 只有选项没有落点」整行按旁白处理，
  // 所以它后面的一行仍然走得到，不该报 E106。
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一', '> 只有选项没有落点', '乙：二', '【结束】',
  ].join('\n'));
  assert.equal(r.issues.filter((i) => i.code === 'E106').length, 0);
});

test('断链（落点标签不存在）时不做不可达判定', () => {
  // 解析器会直接拒绝这个剧本，文件根本加载不了，
  // 这时说「某段玩家永远走不到」是误导：E103 才是真正该看的那条。
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一', '-> 不存在的标签', '乙：二', '【结束】',
  ].join('\n'));
  assert.ok(r.issues.find((i) => i.code === 'E103'), '应报 E103');
  assert.equal(r.issues.filter((i) => i.code === 'E106').length, 0);
});

test('标签夹在两条选项之间时是两个选项组（解析器遇到标签会 flush 掉选项组）', () => {
  // 实测 scripts/parser.js：这段文本被解析成两个独立的 choice 节点，
  // [中间] 指向第二个选项组；第一个选项组的后继是它自己的落点，不会顺序走到第二个选项组，
  // 所以第二个选项组是走不到的（E106），而不是被当成同一个组。
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '> 甲 -> 甲支线', '[中间]', '> 乙 -> 乙支线',
    '[甲支线]', '甲：一', '[乙支线]', '乙：二', '【结束】',
  ].join('\n'));
  assert.equal(r.issues.filter((i) => i.code === 'E108').length, 0, '第二个选项的落点在它之后，不该报 E108');
  assert.deepEqual(r.issues.filter((i) => i.code === 'E106').map((i) => i.line), [6],
    '第二个选项组走不到，报在第 6 行');
});

/* ============================================================
   修复轮 R=2（阻塞 B1）：控制流模型改为按**节点下标**推导
   解析器的 pendingChoices 是延迟 push 的：姿态 / 情绪 / 动作 / 视角 / 机位
   既不 flush 也不排队，它们排在那组选项**之前**入队。
   行号相邻 ≠ 节点相邻，旧实现因此会对合法剧本假报 E106。
   ============================================================ */

const exact = (r) => r.issues.map((i) => `${i.code}@${i.line}`).sort();

test('B1 用例 A：选项组后紧跟【姿态：…】不报 E106（姿态排在选项组之前入队）', () => {
  const r = lint([
    '标题：x', '角色：',
    '甲 | 男 | 短发 | 白 | 少年',
    '乙 | 女 | 长发 | 白 | 少女',
    '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一',
    '> 选项一 -> 支线',
    '【姿态：甲|难过】',
    '[支线]',
    '乙：两',
    '【结束】',
  ].join('\n'));
  // 解析器产出 scene / say / pose / choice / say / end，[支线] 落在最后的 say 上：
  // 整条链都走得到，一条 issue 都不该有（尤其不能有 E106 / E107 / E108 / W106）
  assert.deepEqual(exact(r), []);
});

test('B1 用例 B：两条选项之间夹【动作：…】仍是同一个选项组，两条分支都可达', () => {
  const r = lint([
    '标题：x', '角色：',
    '甲 | 男 | 短发 | 白 | 少年',
    '乙 | 女 | 长发 | 白 | 少女',
    '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一',
    '> 选项一 -> 支线',
    '【动作：甲|坐下】',
    '> 选项二 -> 支线2',
    '[支线]',
    '乙：两',
    '-> 汇合',
    '[支线2]',
    '甲：三',
    '[汇合]',
    '乙：四',
    '【结束】',
  ].join('\n'));
  // 解析器把它们压成**一个** choice 节点；若被拆成两个组，第二个组和它的落点都会假报不可达
  assert.deepEqual(exact(r), []);
});

test('B1 用例 C：标签后跟选项再跟【姿态：…】时，标签落在姿态节点上', () => {
  const r = lint([
    '标题：x', '角色：',
    '甲 | 男 | 短发 | 白 | 少年',
    '乙 | 女 | 长发 | 白 | 少女',
    '', '【场景：教室 | 黄昏 | 远景】',
    '[L]',
    '> A -> X',
    '【姿态：甲|难过】',
    '[X]',
    '乙：二',
    '【结束】',
  ].join('\n'));
  // 解析器里 labels = {L:1, X:3}：[L] 落在**姿态节点**上，而不是后面的选项行；
  // [L] 没人引用 → 只有一条 W106，不该有 E106。
  assert.deepEqual(exact(r), ['W106@7']);
});

test('反例仍然要报：不含五类不 flush 指示的真不可达', () => {
  const r = lint([
    '标题：x', '角色：',
    '甲 | 男 | 短发 | 白 | 少年',
    '乙 | 女 | 长发 | 白 | 少女',
    '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一',
    '-> 主线',
    '[主线]',
    '乙：二',
    '【结束】',
    '甲：这段永远走不到',
  ].join('\n'));
  assert.deepEqual(exact(r), ['E106@12']);
});

test('不可达区间的行号范围只覆盖真正不可达的行（不写标签行）', () => {
  const r = lint([
    '标题：x', '角色：',
    '甲 | 男 | 短发 | 白 | 少年',
    '乙 | 女 | 长发 | 白 | 少女',
    '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一',
    '-> 主线',
    '[主线]',
    '乙：二',
    '【结束】',
    '[死活分支]',
    '甲：三',
    '[夹在中间的标签]',
    '乙：四',
  ].join('\n'));
  assert.deepEqual(exact(r), ['E106@13', 'W106@12', 'W106@14']);
  const e106 = r.issues.find((i) => i.code === 'E106');
  // 第 13、15 行之间夹着第 14 行的标签，区间不能写成「13–15」
  assert.match(e106.message, /第 13、15 行/);
});

/* ============================================================
   Task 3 修复轮 2：E106 行号按源序输出、文件末尾的待定选项组
   ============================================================ */

const numbersIn = (s) => (String(s).match(/\d+/g) || []).map(Number);

test('E106 的行号按源行序升序列举，it.line 取最早的死行', () => {
  const r = lint([
    '标题：x', '角色：',
    '甲 | 男 | 短发 | 白 | 少年',
    '乙 | 女 | 长发 | 白 | 少女',
    '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一', '-> 主线', '[主线]', '乙：二', '【结束】',
    '> 选项一 -> 之后',
    '【姿态：甲|难过】',
    '甲：三',
    '[之后]',
    '甲：四',
  ].join('\n'));
  // 解析器把【姿态】立即入队、把选项组延迟到最后 flush，
  // 于是死分支的**节点顺序**是 姿态(13) → 选项组(12) → 台词(14) → 台词(16)：
  // 行号先 13 后 12，与源行序相错。it.line 必须取最早死行 12。
  assert.deepEqual(exact(r), ['E106@12']);
  const e = r.issues.find((i) => i.code === 'E106');
  const ns = numbersIn(e.message);
  assert.deepEqual(ns, [12, 13, 14, 16], '文案里的行号应是升序');
  assert.deepEqual(ns, [...ns].sort((a, b) => a - b), '文案里的行号必须是升序');
});

test('文件末尾的待定选项组：收尾 flush 后仍是真实节点，照常报 E108', () => {
  // scripts/parser.js 在解析循环结束后还有一次 flushChoices()（第 385 行），
  // 所以「选项组落在文件末尾、后面没有任何行」时它仍是一个 choice 节点；
  // 这里的选项回指组之前的标签，必须照常报 E108。
  const r = lint([
    '标题：x', '', '【场景：教室 | 黄昏 | 远景】',
    '[起点]', '旁白：一', '> 回头 -> 起点',
  ].join('\n'));
  assert.deepEqual(exact(r), ['E108@6', 'W108@6']);
});

test('没有落点的「->」行按旁白处理，不报「不存在的标签 null」', () => {
  const r = lint([
    '标题：x', '角色：',
    '甲 | 男 | 短发 | 白 | 少年',
    '', '【场景：教室 | 黄昏 | 远景】',
    '甲：一',
    '->',
    '甲：二',
    '【结束】',
  ].join('\n'));
  // 解析器的跳转正则要求「-> 目标」：光一个 -> 会退化成旁白，后面的台词照常往下走
  assert.deepEqual(exact(r), ['E105@7']);
  assert.doesNotMatch(r.issues[0].message, /null/);
});

/* ============================================================
   Task 4：CLI 入口（子进程真跑 node tools/lint.js）
   ============================================================ */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const runCli = (args) => spawnSync(process.execPath, ['tools/lint.js', ...args], {
  cwd: ROOT, encoding: 'utf8',
});

test('CLI 对干净样本退出码 0', () => {
  const r = runCli(['tests/fixtures/lint/clean.txt']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /通过|没有错误/);
});

test('CLI 对写坏样本退出码 1 并打印行号', () => {
  const r = runCli(['tests/fixtures/lint/bad-text-level.txt']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /第 \d+ 行/);
  assert.match(r.stdout, /E10\d/);
});

test('CLI --json 输出可解析的 JSON', () => {
  const r = runCli(['tests/fixtures/lint/bad-text-level.txt', '--json']);
  assert.equal(r.status, 1);
  const data = JSON.parse(r.stdout);
  assert.equal(data.ok, false);
  assert.ok(data.issues.length > 0);
  assert.ok(data.issues.every((i) => i.code && i.severity && typeof i.line === 'number'));
  assert.ok(data.summary.errors > 0);
});

test('CLI --builtin 对内置 15 章零 issue', () => {
  const r = runCli(['--builtin', '--json']);
  assert.equal(r.status, 0);
  const data = JSON.parse(r.stdout);
  assert.deepEqual(data.issues, []);
});

test('CLI 用法错误退出码 2', () => {
  const r = runCli(['--不存在的参数']);
  assert.equal(r.status, 2);
});

test('CLI --strict 把 warning 也算失败', () => {
  // 只有 warning、没有 error 的样本：默认通过，--strict 才失败
  const plain = runCli(['tests/fixtures/lint/warn-only.txt']);
  assert.equal(plain.status, 0, '默认模式：warning 不挡');
  assert.match(plain.stdout, /警告/);
  const strict = runCli(['tests/fixtures/lint/warn-only.txt', '--strict']);
  assert.equal(strict.status, 1, '--strict 模式：warning 也挡');
  // 干净样本在 --strict 下仍然通过
  const clean = runCli(['tests/fixtures/lint/clean.txt', '--strict']);
  assert.equal(clean.status, 0);
});

test('CLI 对 .json 剧本给出中文提示并退出码 2（不走进行级扫描）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mumu-lint-'));
  const file = join(dir, 'nodes.json');
  writeFileSync(file, '{"title":"x","nodes":[{"t":"say","text":"hi"}]}', 'utf8');
  try {
    const r = runCli([file]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /JSON/);
    assert.match(r.stderr, /不支持|改用/);
    assert.equal(r.stdout.trim(), '', '不支持的文件不应往 stdout 打印半截结果');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI 文件不存在时中文提示并退出码 2', () => {
  const r = runCli(['tests/fixtures/lint/没有这个文件.txt']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /文件不存在/);
  assert.equal(r.stdout.trim(), '');
});

test('CLI 对目录路径给出中文提示并退出码 2（不抛英文堆栈）', () => {
  const r = runCli(['tests/fixtures/lint']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /不是可校验的剧本文件|无法读取/);
  assert.doesNotMatch(r.stderr, /EISDIR|Error:/);
  assert.equal(r.stdout.trim(), '');
});

test('CLI --json --strict 下 ok 与退出码一致', () => {
  const r = runCli(['tests/fixtures/lint/warn-only.txt', '--json', '--strict']);
  assert.equal(r.status, 1);
  const data = JSON.parse(r.stdout);
  assert.equal(data.ok, false, '--strict 失败时 ok 不能还是 true');
  assert.equal(data.summary.errors, 0);
  assert.ok(data.summary.warnings > 0);
});

test('CLI 多文件：混合干净与写坏样本时两边都列且计数按文件数', () => {
  const r = runCli(['tests/fixtures/lint/clean.txt', 'tests/fixtures/lint/bad-text-level.txt']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /clean\.txt/);
  assert.match(r.stdout, /bad-text-level\.txt/);
  assert.match(r.stdout, /（2 个文件）/);
});

test('CLI --builtin 与文件混用：作用域如实列出', () => {
  const r = runCli(['--builtin', 'tests/fixtures/lint/clean.txt', '--json']);
  assert.equal(r.status, 0);
  const data = JSON.parse(r.stdout);
  assert.deepEqual(data.issues, []);
  assert.ok(data.files.some((f) => /内置/.test(f)));
  assert.ok(data.files.some((f) => /clean\.txt/.test(f)));
});

test('CLI 对 .txt 里塞 JSON 的样本同样拒绝（内容嗅探分支）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mumu-lint-'));
  const file = join(dir, 'fake.txt');
  writeFileSync(file, '{"title":"x","nodes":[]}', 'utf8');
  try {
    const r = runCli([file]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /JSON/);
    assert.equal(r.stdout.trim(), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI 文本模式通过行按「、」连接作用域（--builtin 文案可读）', () => {
  const r = runCli(['--builtin']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /通过：内置 \d+ 章 未发现问题。/);
});

// ---- 回归哨兵：内置语料必须零 issue，且离线工具不得渗进运行时 ----

test('内置 15 章零 issue', () => {
  const r = lintBuiltin();
  assert.deepEqual(r.issues.map((i) => `${i.code} ${i.file} ${i.line}: ${i.message}`), []);
  assert.equal(r.summary.errors, 0);
  assert.equal(r.summary.warnings, 0);
});

test('scripts/ 不得引用 tools/lint.js（离线工具不进运行时）', () => {
  const dir = new URL('../scripts/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.equal(src.includes('tools/lint'), false, `scripts/${f} 不应引用 tools/lint.js`);
  }
});

test('index.html 不应引用 tools/lint.js', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html.includes('tools/lint'), false);
});
