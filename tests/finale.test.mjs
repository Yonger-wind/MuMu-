import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinale } from '../scripts/finale.js';

const SCRIPT = {
  title: '第四章 · 终章·夏末的告别',
  seriesTitle: '蝉鸣止于逢魔时',
  chapterNo: 4,
};

const SUMMARY = {
  scene: 'classroom',
  time: 'dusk',
  cam: 'mid',
  choices: ['追问', '把歌听完'],
  line: { who: '白石葵', text: '这一次，换我记住你。' },
  ending: 'left',
};

test('终章返回完整的结算字段', () => {
  const out = buildFinale(SCRIPT, SUMMARY, {
    cards: [{ key: 'cicada-yuma', name: '夏目悠真', stars: 5 }],
  });
  assert.equal(out.title, '蝉鸣止于逢魔时');
  assert.equal(out.subtitle, '第 4 章');
  assert.equal(out.where, '黄昏 · 教室');
  assert.deepEqual(out.line, SUMMARY.line);
  assert.deepEqual(out.choices, ['追问', '把歌听完']);
  assert.deepEqual(out.cards, [{ key: 'cicada-yuma', name: '夏目悠真', stars: 5 }]);
});

test('还有下一章时不返回结算卡', () => {
  assert.equal(buildFinale(SCRIPT, SUMMARY, { hasNext: true }), null);
});

test('缺少场景 / 台词 / 选择 / 卡牌时安全退化', () => {
  const out = buildFinale({ title: '独立剧本' }, { scene: 'unknown', time: '', choices: [], line: null });
  assert.equal(out.title, '独立剧本');
  assert.equal(out.where, '故事尽头');
  assert.equal(out.subtitle, '');
  assert.equal(out.line, null);
  assert.deepEqual(out.choices, []);
  assert.deepEqual(out.cards, []);
});

test('画外音与旁白原样保留说话人', () => {
  const voice = buildFinale(SCRIPT, { line: { who: '白石葵（录音）', text: '夏天结束了。' } });
  assert.deepEqual(voice.line, { who: '白石葵（录音）', text: '夏天结束了。' });
  const narration = buildFinale(SCRIPT, { line: { who: '', text: '窗外下起了雨。' } });
  assert.deepEqual(narration.line, { who: '', text: '窗外下起了雨。' });
});

test('空白台词不生成「一句台词」行', () => {
  const out = buildFinale(SCRIPT, { line: { who: '甲', text: '   ' } });
  assert.equal(out.line, null);
});

test('缺少剧本或摘要时返回 null', () => {
  assert.equal(buildFinale(null, SUMMARY), null);
  assert.equal(buildFinale(SCRIPT, null), null);
});
