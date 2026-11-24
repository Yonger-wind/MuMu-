/* 暮幕 · 剧本库分组逻辑（曲目卡的简介 / 章节顺序） */
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupScripts } from '../scripts/modals.js';

const chapter = (id, series, seriesTitle, chapterNo, summary) => ({
  id, series, seriesTitle, chapterNo, summary,
  title: seriesTitle, tag: `第${chapterNo}章`, builtin: false,
});

test('曲目卡简介取第一章的，不受列表顺序影响', () => {
  // 导入是倒序写入的（addCustomScript 用 unshift），库里拿到的往往是最后一章在前
  const scripts = [
    chapter('s1_04', 's1', '曲目甲', 4, '第四章简介'),
    chapter('s1_03', 's1', '曲目甲', 3, '第三章简介'),
    chapter('s1_02', 's1', '曲目甲', 2, '第二章简介'),
    chapter('s1_01', 's1', '曲目甲', 1, '第一章简介'),
  ];
  const g = groupScripts(scripts).find((e) => e.kind === 'series');
  assert.equal(g.brief, '第一章简介');
  assert.deepEqual(g.chapters.map((c) => c.chapterNo), [1, 2, 3, 4]);
});

test('内置曲目与导入曲目同名时，两张卡的简介一致', () => {
  const scripts = [
    chapter('s1_02', 's1', '曲目甲', 2, '第二章简介'),
    chapter('s1_01', 's1', '曲目甲', 1, '第一章简介'),
    chapter('user:s1_02', 'user:s1', '曲目甲（导入）', 2, '第二章简介'),
    chapter('user:s1_01', 'user:s1', '曲目甲（导入）', 1, '第一章简介'),
  ];
  const groups = groupScripts(scripts).filter((e) => e.kind === 'series');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].brief, '第一章简介');
  assert.equal(groups[1].brief, '第一章简介');
});

test('单章作品不分组，各自成卡', () => {
  const entries = groupScripts([{ id: 'w1', title: '独幕剧', summary: '一句话', builtin: false }]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'single');
  assert.equal(entries[0].script.id, 'w1');
});
