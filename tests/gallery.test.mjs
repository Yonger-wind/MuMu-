import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEVEN_CARDS,
  SERIES,
  CHARACTER_CARDS,
  ALL_CARDS,
  getCard,
  getSeries,
  isSevenCard,
  unlockedCount,
  totalCount,
} from '../scripts/gallery-data.js';
import {
  createGalleryState,
  normalizeGalleryState,
  isCardUnlocked,
  chapterRewardCount,
  planChapterRewards,
  loadGallery,
  saveGallery,
  grantChapterCards,
  GALLERY_KEY,
  GALLERY_VERSION,
} from '../scripts/gallery-store.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

function scriptOf(series, chapterNo) {
  return {
    id: `builtin_${series}_${String(chapterNo).padStart(2, '0')}`,
    builtin: true,
    series,
    chapterNo,
  };
}

/* ---------------- 数据 ---------------- */

test('图鉴：四张典藏卡置顶，星月夜与 Aeolian 七星，两位共创者六星', () => {
  assert.equal(SEVEN_CARDS.length, 4);
  assert.deepEqual(
    SEVEN_CARDS.map((c) => [c.name, c.identity, c.stars]),
    [
      ['星月夜', '1889·布面油画', 7],
      ['Aeolian', '创作者', 7],
      ['ᥫᩣo.O', '共创者', 6],
      ['彼岸洛luo', '共创者', 6],
    ]
  );
  for (const old of ['黑白少年', '绯色之瞳', '蓝发少女']) {
    assert.equal(
      ALL_CARDS.some((c) => c.name === old || c.identity === old),
      false,
      `旧名称「${old}」不应再出现在图鉴数据里`
    );
  }
});

test('图鉴：四条曲目、27 位角色、31 张卡，键名唯一', () => {
  assert.equal(SERIES.length, 4);
  assert.equal(CHARACTER_CARDS.length, 27);
  assert.equal(ALL_CARDS.length, 31);
  assert.equal(totalCount(), 31);
  assert.equal(new Set(ALL_CARDS.map((c) => c.key)).size, 31);
  for (const card of CHARACTER_CARDS) {
    assert.ok(card.image.endsWith('.cut.png'), card.key);
    assert.ok(card.identity && card.identity.length <= 30, card.key);
    assert.ok(card.name, card.key);
  }
});

test('图鉴：每条曲目一男一女两位五星主角，其余四星', () => {
  for (const series of SERIES) {
    const leads = series.characters.filter((c) => c.stars === 5);
    assert.equal(leads.length, 2, `${series.key} 应有男女两位主角`);
    assert.ok(series.characters.filter((c) => c.stars !== 5).every((c) => c.stars === 4));
  }
  assert.deepEqual(
    SERIES.map((s) => s.characters.filter((c) => c.stars === 5).map((c) => c.name)),
    [['夏目悠真', '白石葵'], ['沈砚', '阿黛'], ['卢卡斯', '克莱尔'], ['林深', '苏晚']]
  );
});

test('图鉴：曲目章节数与内置剧本一致', () => {
  assert.deepEqual(
    SERIES.map((s) => [s.key, s.chapters]),
    [['cicada', 4], ['qinglv', 4], ['vortex', 3], ['moonlight', 4]]
  );
});

test('图鉴：按 key 取卡与七星判定', () => {
  assert.equal(getCard('seven-starry-night').name, '星月夜');
  assert.equal(getCard('cicada-yuma').series, 'cicada');
  assert.equal(getCard('missing'), null);
  assert.equal(isSevenCard('seven-azure'), true);
  assert.equal(isSevenCard('cicada-aoi'), false);
  assert.equal(getSeries('vortex').characters.length, 8);
});

test('图鉴：解锁计数把七星算作开局已得', () => {
  assert.equal(unlockedCount({}), 4);
  assert.equal(unlockedCount({ 'cicada-yuma': true }), 5);
});

/* ---------------- 存档规范化 ---------------- */

test('存档：坏数据回落为空图鉴', () => {
  for (const raw of [null, [], 'x', 3, { unlocked: [] }, { granted: [] }]) {
    assert.deepEqual(normalizeGalleryState(raw), createGalleryState());
  }
});

test('存档：只保留认识的卡与合法的章节键', () => {
  const state = normalizeGalleryState({
    version: 99,
    unlocked: {
      'cicada-yuma': true,
      'seven-starry-night': true, // 七星不写进存档
      unknown: true,
      'cicada-aoi': false,
    },
    granted: { builtin_cicada_01: true, bad: false, '': true },
  });
  assert.deepEqual(state, {
    version: GALLERY_VERSION,
    unlocked: { 'cicada-yuma': true },
    granted: { builtin_cicada_01: true },
  });
});

test('存档：七星始终解锁，角色卡按存档', () => {
  const state = createGalleryState();
  assert.equal(isCardUnlocked('seven-crimson', state), true);
  assert.equal(isCardUnlocked('cicada-aoi', state), false);
  state.unlocked['cicada-aoi'] = true;
  assert.equal(isCardUnlocked('cicada-aoi', state), true);
  assert.equal(isCardUnlocked('missing', state), false);
});

test('存档：读写使用独立键 mumu.gallery.v1', () => {
  const storage = fakeStorage();
  const state = createGalleryState();
  state.unlocked['cicada-yuma'] = true;
  assert.equal(saveGallery(state, storage), true);
  assert.ok(storage.map.has(GALLERY_KEY));
  assert.equal(JSON.parse(storage.map.get(GALLERY_KEY)).unlocked['cicada-yuma'], true);
  assert.deepEqual(loadGallery(storage), state);
});

test('存档：读坏 JSON / 写异常都不抛错', () => {
  const storage = fakeStorage({ [GALLERY_KEY]: '{oops' });
  assert.deepEqual(loadGallery(storage), createGalleryState());
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(loadGallery(broken), createGalleryState());
  assert.equal(saveGallery(createGalleryState(), broken), false);
});

/* ---------------- 章节奖励 ---------------- */

test('奖励：按剩余角色 / 剩余章节均分，末章补齐', () => {
  const table = SERIES.map((series) => {
    let state = createGalleryState();
    const counts = [];
    for (let no = 1; no <= series.chapters; no += 1) {
      counts.push(chapterRewardCount(series.key, no, state.unlocked));
      state = planChapterRewards(state, scriptOf(series.key, no), { random: () => 0.42 }).state;
    }
    return counts;
  });
  assert.deepEqual(table, [[2, 2, 1, 1], [2, 2, 1, 1], [3, 3, 2], [2, 2, 2, 1]]);
});

test('奖励：非法章节 / 未知曲目返回 0', () => {
  assert.equal(chapterRewardCount('cicada', 0, {}), 0);
  assert.equal(chapterRewardCount('cicada', 5, {}), 0);
  assert.equal(chapterRewardCount('nope', 1, {}), 0);
  assert.equal(chapterRewardCount('cicada', '1', {}), 2);
});

test('奖励：每条曲目按章走完刚好送齐，不会多发', () => {
  for (const series of SERIES) {
    let state = createGalleryState();
    const seen = new Set();
    for (let no = 1; no <= series.chapters; no += 1) {
      const plan = planChapterRewards(state, scriptOf(series.key, no), { random: () => 0.37 });
      state = plan.state;
      for (const card of plan.cards) {
        assert.equal(seen.has(card.key), false, `${card.key} 被重复发放`);
        seen.add(card.key);
      }
    }
    assert.equal(seen.size, series.characters.length, `${series.key} 未送齐`);
    assert.ok(series.characters.every((c) => state.unlocked[c.key]), series.key);
  }
});

test('奖励：同一章重玩不重复发', () => {
  const script = scriptOf('cicada', 1);
  const first = planChapterRewards(createGalleryState(), script, { random: () => 0.1 });
  assert.equal(first.cards.length, 2);
  const again = planChapterRewards(first.state, script, { random: () => 0.1 });
  assert.equal(again.cards.length, 0);
  assert.equal(again.alreadyGranted, true);
  assert.deepEqual(again.state, first.state);
});

test('奖励：末章一次补齐剩余角色', () => {
  const script = scriptOf('vortex', 3);
  const plan = planChapterRewards(createGalleryState(), script, { random: () => 0.5 });
  assert.equal(plan.cards.length, 8);
});

test('奖励：只给内置剧本发卡', () => {
  const custom = { id: 'user:1', series: 'cicada', chapterNo: 1, builtin: false };
  const plan = planChapterRewards(createGalleryState(), custom, { random: () => 0.5 });
  assert.equal(plan.cards.length, 0);
  assert.equal(plan.grantedNow, false);
  assert.equal(plan.state.granted['user:1'], undefined);
});

test('奖励：随机只影响选谁，不影响数量与合法性', () => {
  const first = planChapterRewards(createGalleryState(), scriptOf('moonlight', 1), { random: () => 0.3 });
  const script = scriptOf('moonlight', 2);
  const a = planChapterRewards(first.state, script, { random: () => 0 });
  const b = planChapterRewards(first.state, script, { random: () => 0.999 });
  assert.equal(a.cards.length, 2);
  assert.equal(b.cards.length, 2);
  assert.equal(new Set(a.cards.map((c) => c.key)).size, 2);
  assert.equal(new Set(b.cards.map((c) => c.key)).size, 2);
});

test('奖励：写回存档，失败时仍返回本轮新卡并提示', () => {
  const storage = fakeStorage();
  const ok = grantChapterCards(scriptOf('qinglv', 1), { storage, random: () => 0.2 });
  assert.equal(ok.cards.length, 2);
  assert.equal(ok.persisted, true);
  assert.equal(ok.error, null);
  assert.deepEqual(loadGallery(storage), ok.state);

  const broken = fakeStorage();
  broken.setItem = () => { throw new Error('full'); };
  const fail = grantChapterCards(scriptOf('qinglv', 2), { storage: broken, random: () => 0.2 });
  assert.equal(fail.cards.length, 2);
  assert.equal(fail.persisted, false);
  assert.match(fail.error, /存储空间不足/);
});
