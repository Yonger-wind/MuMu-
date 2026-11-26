/* ============================================================
   暮幕 · 角色图鉴数据
   四张典藏卡置顶；二十七位内置剧本角色按曲目分组。
   人物图只使用仓库里既有的立绘 / 原图，不额外生成素材。
   ============================================================ */

/** 典藏卡：星月夜与 Aeolian 七星，两位共创者六星；开局即解锁。 */
export const SEVEN_CARDS = Object.freeze([
  Object.freeze({
    key: 'seven-starry-night',
    kind: 'seven',
    name: '星月夜',
    identity: '1889·布面油画',
    image: './assets/images/starry-night.jpg',
    stars: 7,
    photoPos: 'center',
    art: 'linear-gradient(160deg, #1b2c4a 0%, #2f4666 52%, #12182a 100%)',
  }),
  Object.freeze({
    key: 'seven-monochrome',
    kind: 'seven',
    name: 'Aeolian',
    identity: '创作者',
    image: './assets/images/gallery/monochrome-boy.jpg',
    stars: 7,
    photoPos: 'center top',
    art: 'linear-gradient(160deg, #e9e7e2 0%, #a9a6a1 48%, #3a3838 100%)',
  }),
  Object.freeze({
    key: 'seven-crimson',
    kind: 'seven',
    name: 'ᥫᩣo.O',
    identity: '共创者',
    image: './assets/images/gallery/crimson-eyes.jpg',
    stars: 6,
    photoPos: 'center',
    art: 'linear-gradient(160deg, #ffd9d6 0%, #d97a86 48%, #5e2a3e 100%)',
  }),
  Object.freeze({
    key: 'seven-azure',
    kind: 'seven',
    name: '彼岸洛luo',
    identity: '共创者',
    image: './assets/images/gallery/blue-hair-girl.jpg',
    stars: 6,
    photoPos: 'center',
    art: 'linear-gradient(160deg, #dbe9ff 0%, #7fa8e8 48%, #33456e 100%)',
  }),
]);

/** 曲目 → 角色。stars：男女主 5，其余 4；页面只画实际星数，不补空星。 */
export const SERIES = Object.freeze([
  Object.freeze({
    key: 'cicada',
    title: '蝉鸣止于逢魔时',
    short: '蝉鸣',
    chapters: 4,
    art: 'linear-gradient(165deg, #f3d2a2 0%, #d98a6a 46%, #5c3350 100%)',
    glow: 'rgba(255, 198, 138, 0.55)',
    characters: Object.freeze([
      Object.freeze({ key: 'cicada-yuma', name: '夏目悠真', identity: '高三学生 · 旧磁带的主人', model: 'teen-boy', stars: 5 }),
      Object.freeze({ key: 'cicada-aoi', name: '白石葵', identity: '转学生 · 记着那首歌的人', model: 'teen-girl-2', stars: 5 }),
      Object.freeze({ key: 'cicada-young-yuma', name: '小悠真', identity: '录音里的男孩', model: 'boy-child', stars: 4 }),
      Object.freeze({ key: 'cicada-young-aoi', name: '小葵', identity: '录音里的女孩', model: 'girl-child', stars: 4 }),
      Object.freeze({ key: 'cicada-shuichi', name: '夏目修一', identity: '悠真的父亲 · 事务所职员', model: 'middle-age-man', stars: 4 }),
      Object.freeze({ key: 'cicada-masami', name: '白石雅美', identity: '白石葵的母亲', model: 'middle-age-woman', stars: 4 }),
    ]),
  }),
  Object.freeze({
    key: 'qinglv',
    title: '青绿长卷·千里未归',
    short: '青绿',
    chapters: 4,
    art: 'linear-gradient(165deg, #f2e7c9 0%, #b9c6a2 46%, #566a58 100%)',
    glow: 'rgba(238, 226, 170, 0.55)',
    characters: Object.freeze([
      Object.freeze({ key: 'qinglv-shenyan', name: '沈砚', identity: '翰林图画院 · 天才画师', model: 'painter', stars: 5 }),
      Object.freeze({ key: 'qinglv-adai', name: '阿黛', identity: '盲眼调色少女', model: 'colorist', stars: 5 }),
      Object.freeze({ key: 'qinglv-xiaodouzi', name: '小豆子', identity: '丹青阁小厮', model: 'pageboy', stars: 4 }),
      Object.freeze({ key: 'qinglv-xiaotao', name: '小桃', identity: '阿黛的侍女', model: 'maidgirl', stars: 4 }),
      Object.freeze({ key: 'qinglv-guhuaiyuan', name: '顾怀远', identity: '奉旨督画的官员', model: 'official', stars: 4 }),
      Object.freeze({ key: 'qinglv-taihou', name: '太后', identity: '大胤当朝太后', model: 'dowager', stars: 4 }),
    ]),
  }),
  Object.freeze({
    key: 'vortex',
    title: '漩涡与深蓝：星月夜的回响',
    short: '漩涡',
    chapters: 3,
    art: 'linear-gradient(165deg, #c9dce9 0%, #708fa6 46%, #22344a 100%)',
    glow: 'rgba(150, 196, 230, 0.55)',
    characters: Object.freeze([
      Object.freeze({ key: 'vortex-lucas', name: '卢卡斯', identity: '荷兰修复师 · 梵高颜料专家', model: 'lucas', stars: 5 }),
      Object.freeze({ key: 'vortex-claire', name: '克莱尔', identity: '英国艺术调查员', model: 'claire', stars: 5 }),
      Object.freeze({ key: 'vortex-marguerite', name: '玛格丽特', identity: '普罗旺斯庄园主', model: 'marguerite', stars: 4 }),
      Object.freeze({ key: 'vortex-henri', name: '亨利', identity: '收藏家 · 画商', model: 'henri', stars: 4 }),
      Object.freeze({ key: 'vortex-julian', name: '朱利安', identity: '巴黎重案组探员', model: 'julian', stars: 4 }),
      Object.freeze({ key: 'vortex-sofia', name: '索菲娅', identity: '东欧收藏家', model: 'sofia', stars: 4 }),
      Object.freeze({ key: 'vortex-etienne', name: '艾蒂安', identity: '黑客 · 情报贩子', model: 'etienne', stars: 4 }),
      Object.freeze({ key: 'vortex-elena', name: '埃莱娜', identity: '圣雷米档案管理员', model: 'elena', stars: 4 }),
    ]),
  }),
  Object.freeze({
    key: 'moonlight',
    title: '月光下的未完奏鸣',
    short: '月光',
    chapters: 4,
    art: 'linear-gradient(165deg, #f6e3c8 0%, #d7a080 46%, #6a4052 100%)',
    glow: 'rgba(255, 214, 170, 0.55)',
    characters: Object.freeze([
      Object.freeze({ key: 'moonlight-linshen', name: '林深', identity: '建筑系学生 · 钢琴', model: 'linshen', stars: 5 }),
      Object.freeze({ key: 'moonlight-suwan', name: '苏晚', identity: '艺术学院 · 小提琴', model: 'suwan', stars: 5 }),
      Object.freeze({ key: 'moonlight-guyan', name: '顾言', identity: '投资方代表', model: 'guyan', stars: 4 }),
      Object.freeze({ key: 'moonlight-xiaqing', name: '夏晴', identity: '服装设计系 · 苏晚室友', model: 'xiaqing', stars: 4 }),
      Object.freeze({ key: 'moonlight-chenmo', name: '陈默', identity: '音乐社社长', model: 'chenmo', stars: 4 }),
      Object.freeze({ key: 'moonlight-zhoumubai', name: '周慕白', identity: '音乐社学长', model: 'zhoumubai', stars: 4 }),
      Object.freeze({ key: 'moonlight-yezhiqiu', name: '叶知秋', identity: '项目负责人 · 林深同事', model: 'yezhiqiu', stars: 4 }),
    ]),
  }),
]);

/** 全部角色卡（不含七星），按曲目顺序摊平。 */
export const CHARACTER_CARDS = Object.freeze(
  SERIES.flatMap((s) => s.characters.map((c) => Object.freeze({
    ...c,
    kind: 'character',
    series: s.key,
    seriesTitle: s.title,
    image: `./assets/models/${c.model}.cut.png`,
    art: s.art,
    glow: s.glow,
    photoPos: 'center bottom',
  })))
);

export const ALL_CARDS = Object.freeze([...SEVEN_CARDS, ...CHARACTER_CARDS]);

const CARD_BY_KEY = new Map(ALL_CARDS.map((c) => [c.key, c]));
const SERIES_BY_KEY = new Map(SERIES.map((s) => [s.key, s]));

export function getCard(key) {
  return CARD_BY_KEY.get(key) || null;
}

export function getSeries(key) {
  return SERIES_BY_KEY.get(key) || null;
}

export function isSevenCard(cardOrKey) {
  if (!cardOrKey) return false;
  const card = typeof cardOrKey === 'string' ? getCard(cardOrKey) : cardOrKey;
  return !!card && card.kind === 'seven';
}

export function unlockedCount(unlocked = {}) {
  return SEVEN_CARDS.length + CHARACTER_CARDS.reduce((n, c) => n + (unlocked[c.key] ? 1 : 0), 0);
}

export function totalCount() {
  return ALL_CARDS.length;
}
