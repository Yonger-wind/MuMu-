import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS } from '../scripts/parser.js';
import { matchTable, resolveTable, scanText, lintText } from '../tools/lint.js';

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

const scanOf = (src) => scanText(src);
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

test('坏文本样本：各条文本级规则都能落到对应行号', () => {
  const src = readFileSync(new URL('./fixtures/lint/bad-text-level.txt', import.meta.url), 'utf8');
  const r = lint(src, 'bad-text-level.txt');
  const at = (code) => r.issues.filter((i) => i.code === code).map((i) => i.line);
  assert.ok(at('E101').includes(9), 'E101 应落在第 9 行的未知标签上');
  assert.ok(at('W105').includes(6), 'W105 应落在第 6 行的角色表行上');
  assert.ok(at('E105').includes(13), 'E105 应落在第 13 行的缺落点选项上');
  assert.ok(at('E103').includes(14), 'E103 应落在第 14 行的跳转上');
});
