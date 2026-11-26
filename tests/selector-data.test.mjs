import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERIES_ORDER, MAX_ANIMATED, SOON_SLOTS,
  normalizeEntries, buildSoonEntries, buildSelection,
} from '../scripts/selector-data.js';
import { SERIES_KEYWORDS, keywordOf, identityOfSpeaker, AI_DISCLAIMER } from '../scripts/series-meta.js';

const chapter = (series, no, extra = {}) => ({
  id: `${series}-${no}`,
  series,
  seriesTitle: `曲目-${series}`,
  chapterNo: no,
  title: `第${no}章`,
  tag: `第${no}章 · 标题`,
  summary: `第 ${no} 章的简介`,
  builtin: true,
  cover: { scene: 'classroom', time: 'dusk', cam: 'mid' },
  nodes: [],
  ...extra,
});

const single = (id, extra = {}) => ({
  id,
  title: `单本 ${id}`,
  summary: `单本 ${id} 的简介`,
  builtin: false,
  cover: { scene: 'street', time: 'night', cam: 'mid' },
  nodes: [],
  ...extra,
});

const builtinFour = () => [
  chapter('cicada', 2),
  chapter('cicada', 1),
  chapter('qinglv', 1),
  chapter('vortex', 1),
  chapter('moonlight', 1),
];

test('keywords：四部内置曲目各有关键词，未知曲目为空', () => {
  assert.deepEqual(SERIES_ORDER, ['cicada', 'qinglv', 'vortex', 'moonlight']);
  assert.equal(keywordOf('cicada'), '青春校园');
  assert.equal(keywordOf('qinglv'), '古风');
  assert.equal(keywordOf('vortex'), '悬疑');
  assert.equal(keywordOf('moonlight'), '言情');
  assert.equal(keywordOf('user:cicada'), '');
  assert.equal(keywordOf(''), '');
  assert.equal(Object.keys(SERIES_KEYWORDS).length, 4);
});

test('normalizeEntries：内置曲目按固定顺序排在最前，章节按章序排列', () => {
  const entries = normalizeEntries(builtinFour());
  assert.deepEqual(entries.map((e) => e.key), ['cicada', 'qinglv', 'vortex', 'moonlight']);
  assert.deepEqual(entries[0].chapters.map((c) => c.chapterNo), [1, 2]);
  assert.equal(entries[0].meta, '曲目 · 全 2 章');
  assert.equal(entries[0].badge, '合订本 · 全 2 章');
  assert.equal(entries[0].keyword, '青春校园');
  assert.equal(entries[0].custom, false);
  assert.equal(entries[0].builtin, true);
});

test('normalizeEntries：单本剧本为单章条目，关键词留空', () => {
  const entries = normalizeEntries([single('mine')]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'single');
  assert.equal(entries[0].count, 1);
  assert.equal(entries[0].meta, '单本 · 1 章');
  assert.equal(entries[0].badge, '导入剧本');
  assert.equal(entries[0].custom, true);
  assert.equal(entries[0].keyword, '');
});

test('normalizeEntries：封面只接受 base64 data URL，其余回落到空', () => {
  const png = 'data:image/png;base64,AAAA';
  const entries = normalizeEntries([
    single('a', { coverImage: png }),
    single('b', { coverImage: 'javascript:alert(1)' }),
  ]);
  assert.equal(entries[0].coverImage, png);
  assert.equal(entries[1].coverImage, '');
});

test('敬请期待：固定 7 个空位，不参与真实条目计数', () => {
  const soon = buildSoonEntries();
  assert.equal(soon.length, SOON_SLOTS);
  assert.ok(soon.every((e) => e.kind === 'soon' && e.title === '敬请期待' && e.count === 0));
  assert.equal(soon[0].key, 'soon-1');
  assert.equal(buildSoonEntries(0).length, 0);
  assert.equal(buildSoonEntries('bad').length, 0);
});

test('阈值：真实条目 <= 10 用动画，> 10 回落到原陈列', () => {
  const ten = [...builtinFour(), ...Array.from({ length: 6 }, (_, i) => single(`s${i}`))];
  const selectionTen = buildSelection(ten);
  assert.equal(selectionTen.realCount, 10);
  assert.equal(selectionTen.useCarousel, true);
  assert.equal(selectionTen.entries.length, 10 + SOON_SLOTS);
  assert.equal(MAX_ANIMATED, 10);

  const eleven = [...ten, single('s6')];
  const selectionEleven = buildSelection(eleven);
  assert.equal(selectionEleven.realCount, 11);
  assert.equal(selectionEleven.useCarousel, false);
  assert.equal(selectionEleven.entries.length, 11 + SOON_SLOTS);
});

test('匿名提示：原文固定不变', () => {
  assert.equal(AI_DISCLAIMER, '剧本由AI生成，如有雷同，纯属巧合');
});

test('身份小字：按曲目 + 去声明的姓名查找', () => {
  assert.equal(identityOfSpeaker('林深', 'moonlight'), '建筑系学生 · 钢琴');
  assert.equal(identityOfSpeaker('苏晚（录音）', 'moonlight'), '艺术学院 · 小提琴');
  assert.equal(identityOfSpeaker('沈砚', 'qinglv'), '翰林图画院 · 天才画师');
  assert.equal(identityOfSpeaker('白石葵（录音）', 'cicada'), '转学生 · 记着那首歌的人');
});

test('身份小字：蝉鸣的小男孩小女孩不加身份', () => {
  assert.equal(identityOfSpeaker('小悠真', 'cicada'), '');
  assert.equal(identityOfSpeaker('小葵', 'cicada'), '');
  assert.equal(identityOfSpeaker('小葵（录音）', 'cicada'), '');
});

test('身份小字：不跨曲目借身份，未知人物与旁白留空', () => {
  assert.equal(identityOfSpeaker('林深', 'cicada'), '');
  assert.equal(identityOfSpeaker('沈砚', 'moonlight'), '');
  assert.equal(identityOfSpeaker('无名路人', 'cicada'), '');
  assert.equal(identityOfSpeaker('', 'cicada'), '');
  assert.equal(identityOfSpeaker('小悠真', ''), '');
});
