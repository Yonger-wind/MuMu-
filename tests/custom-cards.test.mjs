import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_CARDS_KEY, CUSTOM_FX_KEY, MAX_STARS, MAX_CARDS, MAX_IMAGE_EDGE,
  ASPECTS, PATTERNS, THEMES,
  clampStar, defaultFx, normalizeFx, normalizeCard, normalizeCards,
  nextId, newCard, stripImages, writeCards, readCards, writeFx, readFx,
  downscaleSize, imageTypeForAlpha, isSafeImageSrc, stepIndex,
} from '../scripts/custom-cards-data.js';

const DATA_PNG = 'data:image/png;base64,iVBORw0KGgo=';

function fakeStorage(limitBytes = Infinity) {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > limitBytes) throw new Error('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}

test('常量：星级与容量上限写死', () => {
  assert.equal(MAX_STARS, 5);
  assert.equal(MAX_CARDS, 12);
  assert.equal(MAX_IMAGE_EDGE, 1000);
  assert.equal(CUSTOM_CARDS_KEY, 'mumu.customcards.v1');
  assert.equal(CUSTOM_FX_KEY, 'mumu.customcards.fx.v1');
  assert.deepEqual(ASPECTS, ['4 / 5', '3 / 4', '2 / 3', '1 / 1', '16 / 9']);
  assert.deepEqual(PATTERNS, ['none', 'stripes', 'grating', 'dots', 'hex']);
  assert.deepEqual(THEMES, ['dark', 'light']);
});

test('clampStar 把任何星级压进 0~5', () => {
  assert.equal(clampStar(7), 5);
  assert.equal(clampStar(5), 5);
  assert.equal(clampStar(0), 0);
  assert.equal(clampStar(-3), 0);
  assert.equal(clampStar('4'), 4);
  assert.equal(clampStar('3.6'), 4);
  assert.equal(clampStar('abc'), 0);
  assert.equal(clampStar(null), 0);
  assert.equal(clampStar(undefined), 0);
  assert.equal(clampStar(Number.NaN), 0);
});

test('defaultFx 与面板截图的默认值一致', () => {
  const fx = defaultFx();
  assert.equal(fx.theme, 'dark');
  assert.equal(fx.holo, 1);
  assert.equal(fx.glare, 1);
  assert.equal(fx.foil, null);          // 覆膜默认「自动」
  assert.equal(fx.tilt, 40);
  assert.equal(fx.parallax, 0);
  assert.equal(fx.radius, 0);
  assert.equal(fx.aspect, '4 / 5');
  assert.equal(fx.pattern, 'stripes');
  assert.equal(fx.stars, 5);
  assert.equal(fx.rating, 4);
  assert.equal(fx.showStars, true);
});

test('normalizeFx 对空对象给出默认值，不改写入参', () => {
  const raw = { holo: 0.5 };
  const fx = normalizeFx(raw);
  assert.equal(raw.holo, 0.5);
  assert.equal(fx.holo, 0.5);
  assert.deepEqual(normalizeFx(null), defaultFx());
  assert.deepEqual(normalizeFx('坏数据'), defaultFx());
});

test('normalizeFx 逐项夹紧数值', () => {
  const fx = normalizeFx({ holo: 9, glare: 9, foil: 2, tilt: 99, parallax: -5, radius: 999 });
  assert.equal(fx.holo, 1);
  assert.equal(fx.glare, 1.5);
  assert.equal(fx.foil, 1);
  assert.equal(fx.tilt, 40);
  assert.equal(fx.parallax, 0);
  assert.equal(fx.radius, 32);
  assert.equal(normalizeFx({ holo: 'x' }).holo, 1);
  assert.equal(normalizeFx({ tilt: 'x' }).tilt, 40);
});

test('normalizeFx 只认面板里的枚举值', () => {
  assert.equal(normalizeFx({ theme: 'light' }).theme, 'light');
  assert.equal(normalizeFx({ theme: '粉色' }).theme, 'dark');
  assert.equal(normalizeFx({ aspect: '16 / 9' }).aspect, '16 / 9');
  assert.equal(normalizeFx({ aspect: '21 / 9' }).aspect, '4 / 5');
  assert.equal(normalizeFx({ pattern: 'dots' }).pattern, 'dots');
  assert.equal(normalizeFx({ pattern: 'javascript:alert(1)' }).pattern, 'stripes');
});

test('normalizeFx 把星星颗数限制在 1~5，批量星级不超过颗数', () => {
  assert.equal(normalizeFx({ stars: 7 }).stars, 5);
  assert.equal(normalizeFx({ stars: 0 }).stars, 1);
  assert.equal(normalizeFx({ stars: -4 }).stars, 1);
  assert.equal(normalizeFx({ stars: 3, rating: 9 }).rating, 3);
  assert.equal(normalizeFx({ stars: 5, rating: 4 }).rating, 4);
});

test('normalizeFx 的覆膜：null 保持自动，数字夹紧，坏值回到自动', () => {
  assert.equal(normalizeFx({ foil: null }).foil, null);
  assert.equal(normalizeFx({}).foil, null);
  assert.equal(normalizeFx({ foil: 0.35 }).foil, 0.35);
  assert.equal(normalizeFx({ foil: 'abc' }).foil, null);
  assert.equal(normalizeFx({ foil: true }).foil, null);
});

test('isSafeImageSrc 只放行 data:image 与站内相对路径', () => {
  assert.equal(isSafeImageSrc(DATA_PNG), true);
  assert.equal(isSafeImageSrc('./assets/models/x.cut.png'), true);
  assert.equal(isSafeImageSrc(''), false);
  assert.equal(isSafeImageSrc('https://evil.example/a.png'), false);
  assert.equal(isSafeImageSrc('javascript:alert(1)'), false);
  assert.equal(isSafeImageSrc('data:text/html,<script>'), false);
  assert.equal(isSafeImageSrc(null), false);
});

test('normalizeCard 清洗图片、名字、身份与透明底标记', () => {
  const c = normalizeCard({ name: '  小暮\u0007  ', title: 'a'.repeat(200), image: DATA_PNG }, 5);
  assert.equal(c.name, '小暮');
  assert.equal(c.title.length, 60);
  assert.equal(c.image, DATA_PNG);
  assert.equal(normalizeCard({ alpha: true }, 5).alpha, true);
  assert.equal(normalizeCard({ alpha: false }, 5).alpha, false);
  assert.equal(normalizeCard({ alpha: 'yes' }, 5).alpha, null);
  assert.equal(normalizeCard(null, 5).id.startsWith('cc-'), true);
});

test('normalizeCard 的评级不超过传入的星星颗数', () => {
  assert.equal(normalizeCard({ rating: 9 }, 5).rating, 5);
  assert.equal(normalizeCard({ rating: 4 }, 3).rating, 3);
  assert.equal(normalizeCard({ rating: 7 }, MAX_STARS).rating, MAX_STARS);
  assert.equal(normalizeCard({ rating: 'abc' }, 5).rating, 0);
});

test('normalizeCards 丢掉坏条目、补齐 id、去重、截到 12 张', () => {
  assert.deepEqual(normalizeCards(null, 5), []);
  assert.deepEqual(normalizeCards('x', 5), []);
  const src = [{ id: 'cc-1' }, { id: 'cc-1' }, ...Array.from({ length: 14 }, (_, i) => ({ id: `cc-${i + 2}` }))];
  const out = normalizeCards(src, 5);
  assert.equal(out.length, MAX_CARDS);
  assert.equal(new Set(out.map((c) => c.id)).size, MAX_CARDS);
});

test('nextId 给出没被占用的编号', () => {
  assert.equal(nextId([]), 'cc-1');
  assert.equal(nextId([{ id: 'cc-1' }, { id: 'cc-3' }]), 'cc-2');
  assert.equal(nextId([{ id: 'cc-1' }, { id: '别的' }]), 'cc-2');
});

test('newCard 用面板的批量星级起卡，且不带图片', () => {
  const fx = normalizeFx({ stars: 4, rating: 3 });
  const c = newCard('cc-7', fx);
  assert.deepEqual(c, { id: 'cc-7', name: '新卡片', title: '', image: '', alpha: null, rating: 3 });
  assert.equal(newCard('cc-8', normalizeFx({ stars: 5, rating: 9 })).rating, 5);
});

test('stripImages 只清图片，别的字段不动', () => {
  const cards = [{ id: 'cc-1', name: '甲', title: '乙', image: DATA_PNG, alpha: true, rating: 4 }];
  const out = stripImages(cards);
  assert.equal(out[0].image, '');
  assert.equal(out[0].name, '甲');
  assert.equal(out[0].rating, 4);
  assert.equal(cards[0].image, DATA_PNG);
});

test('writeCards：装得下就存全量，撑爆配额退化成只存文字', () => {
  const cards = [{ id: 'cc-1', name: '甲', image: DATA_PNG.repeat(40), alpha: null, rating: 4 }];
  const roomy = fakeStorage();
  assert.equal(writeCards(cards, roomy), 'ok');
  assert.equal(JSON.parse(roomy.map.get(CUSTOM_CARDS_KEY))[0].image.length > 0, true);

  const tight = fakeStorage(200);
  assert.equal(writeCards(cards, tight), 'stripped');
  assert.equal(JSON.parse(tight.map.get(CUSTOM_CARDS_KEY))[0].image, '');

  const tiny = fakeStorage(1);
  assert.equal(writeCards(cards, tiny), 'failed');
  assert.equal(tiny.map.has(CUSTOM_CARDS_KEY), false);

  const none = null;
  assert.equal(writeCards(cards, none), 'failed');
});

test('readCards：没有存档给空数组，坏 JSON 与超 5 星都被修好', () => {
  const empty = fakeStorage();
  assert.deepEqual(readCards(empty, 5), []);
  const broken = fakeStorage();
  broken.map.set(CUSTOM_CARDS_KEY, '{坏掉的 json');
  assert.deepEqual(readCards(broken, 5), []);
  const wild = fakeStorage();
  wild.map.set(CUSTOM_CARDS_KEY, JSON.stringify([{ id: 'cc-1', rating: 7, stars: 7, image: 'https://evil/a.png' }]));
  const [only] = readCards(wild, 5);
  assert.equal(only.rating, 5);
  assert.equal(only.image, '');
});

test('writeFx / readFx 记住面板参数，坏数据回默认', () => {
  const st = fakeStorage();
  assert.equal(writeFx({ tilt: 12 }, st), true);
  assert.equal(readFx(st).tilt, 12);
  assert.deepEqual(readFx(fakeStorage()), defaultFx());
  const broken = fakeStorage();
  broken.map.set(CUSTOM_FX_KEY, '[');
  assert.deepEqual(readFx(broken), defaultFx());
  assert.equal(writeFx({ tilt: 1 }, fakeStorage(1)), false);
});

test('downscaleSize 最长边压到 1000，小图不动', () => {
  assert.deepEqual(downscaleSize(4000, 3000, 1000), { w: 1000, h: 750 });
  assert.deepEqual(downscaleSize(3000, 4000, 1000), { w: 750, h: 1000 });
  assert.deepEqual(downscaleSize(600, 800, 1000), { w: 600, h: 800 });
  assert.deepEqual(downscaleSize(0, 0, 1000), { w: 1, h: 1 });
  assert.deepEqual(downscaleSize(Number.NaN, 10, 1000), { w: 1, h: 1 });
});

test('imageTypeForAlpha：透明底留 PNG，其余走 JPEG', () => {
  assert.equal(imageTypeForAlpha(true), 'image/png');
  assert.equal(imageTypeForAlpha(false), 'image/jpeg');
  assert.equal(imageTypeForAlpha(null), 'image/jpeg');
});

test('stepIndex：全屏检视翻页首尾循环', () => {
  assert.equal(stepIndex(0, -1, 3), 2, '第一张往前退到最后一张');
  assert.equal(stepIndex(2, 1, 3), 0, '最后一张往后回到第一张');
  assert.equal(stepIndex(1, 1, 3), 2);
  assert.equal(stepIndex(1, -1, 3), 0);
  assert.equal(stepIndex(0, 1, 1), 0, '只有一张时原地不动');
  assert.equal(stepIndex(0, 1, 0), 0, '没有卡也不报错');
  assert.equal(stepIndex(9, 1, 3), 1, '越界下标先折回范围再走');
  assert.equal(stepIndex(-2, 1, 3), 2, '负下标先折回范围（-2 → 1）再往前走');
  assert.equal(stepIndex(1, 0, 3), 1, '步长为 0 不动');
  assert.equal(stepIndex(1, 1, Number.NaN), 0, '数量异常退化为 0');
});
