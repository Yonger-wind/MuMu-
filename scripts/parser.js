/* ============================================================
   暮幕 · 剧本解析器
   支持：.txt / .md（暮幕剧本格式）、.json、.docx、.zip（取包内第一个可用文档）
   全部在浏览器内完成，无第三方依赖
   ============================================================ */

export const LIMITS = {
  minChars: 200,
  maxChars: 30000,
  maxFileBytes: 5 * 1024 * 1024,
};

export const SCENES = {
  company:   { label: '公司',   aliases: ['公司', '办公室', '写字楼', 'company', 'office'] },
  classroom: { label: '教室',   aliases: ['教室', '学校', '课堂', '教学楼', 'classroom', 'school'] },
  playground:{ label: '操场',   aliases: ['操场', '球场', '跑道', 'playground', 'field'] },
  palace:    { label: '宫苑',   aliases: ['宫苑', '皇城', '皇宫', '宫殿', '宫门', '画院', 'palace'] },
  pavilion:  { label: '丹青阁', aliases: ['丹青阁', '画阁', '画室', '藏书阁', '内室', '密室', '阁楼', 'pavilion'] },
  ancient:   { label: '古建筑', aliases: ['古建筑', '古建', '庭院', '宫', '寺', '神社', '古塔', '长廊', 'ancient', 'temple', 'shrine'] },
  salon:     { label: '沙龙',   aliases: ['沙龙', '铸造厂', '展厅', '预展', '画廊', 'salon', 'gallery'] },
  study:     { label: '书房',   aliases: ['书房', '办公室', 'study'] },
  street:    { label: '巴黎街', aliases: ['街道', '街角', '报亭', '塞纳河', '河岸', '巴黎街', 'street'] },
  estate:    { label: '庄园',   aliases: ['庄园', '普罗旺斯庄园', '酒庄', '庭院', 'estate', 'manor'] },
  drawingroom:{ label: '起居室', aliases: ['起居室', '客厅', '会客厅', '门厅', 'drawingroom', 'parlor'] },
  basement:  { label: '地下室', aliases: ['地下室', '酒窖', '地窖', '档案库', 'basement', 'cellar'] },
  villa:     { label: '悬崖别墅', aliases: ['别墅', '海岬', '悬崖别墅', '尼斯别墅', 'villa'] },
  vault:     { label: '画库',   aliases: ['画库', '恒温画库', '收藏库', '金库', 'vault'] },
  studio:    { label: '修复室', aliases: ['修复室', '工作间', '顶楼修复室', 'studio'] },
  terrace:   { label: '露台',   aliases: ['露台', '石砌露台', '阳台', 'terrace'] },
  campus:    { label: '校园',   aliases: ['校园', '林荫道', '文科楼', '老文科楼', '走廊', '校道', 'campus'] },
  pianoroom: { label: '旧琴房', aliases: ['琴房', '旧琴房', '老琴房', '排练室', '排练房', 'pianoroom'] },
  musicroom: { label: '音乐社', aliases: ['音乐社', '活动室', '社团活动室', '音乐社活动室', 'musicroom'] },
  belltower: { label: '钟楼',   aliases: ['钟楼', '古钟楼', '旧钟楼', '后山钟楼', 'belltower'] },
  theateryard:{ label: '剧院前庭', aliases: ['剧院前庭', '剧院侧院', '剧院庭院', '老剧院外', '剧院外', 'theateryard'] },
  theater:   { label: '老剧院', aliases: ['剧院', '老剧院', '剧场', '剧院主厅', 'theater'] },
  office:    { label: '写字楼', aliases: ['办公区', '会议室', '事务所', '高层办公区', '写字楼二十八层', 'office'] },
  bar:       { label: '清吧',   aliases: ['清吧', '酒吧', '居酒屋', '酒馆', 'bar'] },
  city:      { label: '陆家嘴', aliases: ['陆家嘴', '外滩', '江畔', '金融区', '城市', 'city'] },
  lawn:      { label: '草坪',   aliases: ['草坪', '草地', '草地音乐会', '草坪舞台', '舞台', 'lawn'] },
  track:     { label: '田径场', aliases: ['田径场', '塑胶跑道', '夜间操场', '大学操场', '夜跑操场', 'track'] },
};
export const TIMES = {
  dusk:  { label: '黄昏', aliases: ['黄昏', '傍晚', '夕阳', 'dusk', 'sunset'] },
  day:   { label: '白天', aliases: ['白天', '清晨', '正午', '午后', 'day', 'morning'] },
  night: { label: '夜晚', aliases: ['夜晚', '夜', '深夜', 'night'] },
  fire:  { label: '火夜', aliases: ['火夜', '火光', '战火', '劫火', 'fire'] },
};
export const CAMS = {
  wide:  { label: '远景', aliases: ['远景', '全景', 'wide'] },
  mid:   { label: '中景', aliases: ['中景', 'mid'] },
  close: { label: '近景', aliases: ['近景', 'close'] },
  detail:{ label: '特写', aliases: ['特写', '插入', 'detail', 'insert'] },
};

/* 身体语言 / 动作 / 视角：作者可选的舞台指示（剪影系统消费） */
export const POSES = {
  neutral:   { label: '自然', aliases: ['自然', '平静', '默认', 'neutral'] },
  happy:     { label: '开心', aliases: ['开心', '高兴', '喜悦', '笑', 'happy'] },
  sad:       { label: '难过', aliases: ['难过', '悲伤', '低落', '哀', 'sad'] },
  angry:     { label: '生气', aliases: ['生气', '愤怒', '恼', 'angry'] },
  surprised: { label: '惊讶', aliases: ['惊讶', '吃惊', '震惊', 'surprised'] },
  shy:       { label: '害羞', aliases: ['害羞', '羞涩', '腼腆', 'shy'] },
  thinking:  { label: '思考', aliases: ['思考', '沉思', '思索', 'thinking'] },
};
export const ACTS = {
  stand:  { label: '站立', aliases: ['站立', '站着', 'stand'] },
  walk:   { label: '行走', aliases: ['行走', '走路', '走动', '入场', 'walk'] },
  sit:    { label: '坐下', aliases: ['坐下', '坐着', 'sit'] },
  turn:   { label: '转身', aliases: ['转身', '转过', 'turn'] },
  bow:    { label: '低头', aliases: ['低头', '俯身', '鞠躬', 'bow'] },
  lookUp: { label: '抬头', aliases: ['抬头', '仰望', 'lookup'] },
};
export const VIEWS = {
  normal: { label: '常规', aliases: ['常规', '正常', '正面', 'normal'] },
  over:   { label: '过肩', aliases: ['过肩', 'over'] },
  back:   { label: '背影', aliases: ['背影', '背面', 'back'] },
};

/* 内置立绘模型：对应 assets/models 下的半身剪影 */
export const MODELS = {
  'painter':            { label: '画师少年', aliases: ['画师少年', '画师', '青衫画师', 'painter'] },
  'colorist':           { label: '调色少女', aliases: ['调色少女', '研色少女', '盲眼少女', 'colorist'] },
  'pageboy':            { label: '小厮男童', aliases: ['小厮男童', '小厮', '侍童', 'pageboy'] },
  'maidgirl':           { label: '侍女女童', aliases: ['侍女女童', '侍女', '丫鬟', 'maidgirl'] },
  'official':           { label: '官袍长者', aliases: ['官袍长者', '官袍', '朝臣', 'official'] },
  'dowager':            { label: '凤袍太后', aliases: ['凤袍太后', '凤袍', '太后', 'dowager'] },
  'teen-girl-2':        { label: '少女（2）', aliases: ['少女（2）', '少女(2)', '少女2', 'teen-girl-2'] },
  'teen-girl':          { label: '少女',     aliases: ['少女', '女高中生', '女学生', '女孩', 'teen-girl'] },
  'teen-boy':           { label: '少年',     aliases: ['少年', '男高中生', '男学生', '男孩', 'teen-boy'] },
  'girl-child':         { label: '女儿童',   aliases: ['女儿童', '小女孩', '女童', '幼女', 'girl-child'] },
  'boy-child':          { label: '男儿童',   aliases: ['男儿童', '小男孩', '男童', '幼童', 'boy-child'] },
  'middle-age-woman':   { label: '中年女人', aliases: ['中年女人', '中年女性', '母亲', '妈妈', '阿姨', 'middle-age-woman'] },
  'middle-age-man':     { label: '中年男人', aliases: ['中年男人', '中年男性', '父亲', '爸爸', '叔叔', 'middle-age-man'] },
  'lucas':     { label: '卢卡斯·范·登·伯格', aliases: ['卢卡斯·范·登·伯格', '卢卡斯', 'lucas'] },
  'claire':    { label: '克莱尔·温莎', aliases: ['克莱尔·温莎', '克莱尔', 'claire'] },
  'marguerite':{ label: '玛格丽特·德拉图尔', aliases: ['玛格丽特·德拉图尔', '玛格丽特', 'marguerite'] },
  'henri':     { label: '亨利·莫罗', aliases: ['亨利·莫罗', '亨利', 'henri'] },
  'julian':    { label: '朱利安·勒克莱尔', aliases: ['朱利安·勒克莱尔', '朱利安', 'julian'] },
  'sofia':     { label: '索菲娅·科瓦列夫斯卡娅', aliases: ['索菲娅·科瓦列夫斯卡娅', '索菲娅', 'sofia'] },
  'etienne':   { label: '艾蒂安·巴尔贝', aliases: ['艾蒂安·巴尔贝', '艾蒂安', 'etienne'] },
  'elena':     { label: '埃莱娜·罗西', aliases: ['埃莱娜·罗西', '埃莱娜', 'elena'] },
  'linshen':   { label: '林深', aliases: ['林深', 'linshen'] },
  'suwan':     { label: '苏晚', aliases: ['苏晚', 'suwan'] },
  'guyan':     { label: '顾言', aliases: ['顾言', 'guyan'] },
  'xiaqing':   { label: '夏晴', aliases: ['夏晴', 'xiaqing'] },
  'chenmo':    { label: '陈默', aliases: ['陈默', 'chenmo'] },
  'zhoumubai': { label: '周慕白', aliases: ['周慕白', '慕白', 'zhoumubai'] },
  'yezhiqiu':  { label: '叶知秋', aliases: ['叶知秋', '知秋', 'yezhiqiu'] },
};
const MODEL_ORDER = ['middle-age-woman', 'middle-age-man', 'girl-child', 'boy-child', 'teen-girl-2', 'teen-girl', 'teen-boy',
  'painter', 'colorist', 'pageboy', 'maidgirl', 'official', 'dowager',
  'lucas', 'claire', 'marguerite', 'henri', 'julian', 'sofia', 'etienne', 'elena',
  'linshen', 'suwan', 'guyan', 'xiaqing', 'chenmo', 'zhoumubai', 'yezhiqiu'];
export function matchModel(word) {
  const t = String(word || '').trim().toLowerCase();
  if (!t) return '';
  for (const key of MODEL_ORDER) {
    if (MODELS[key].aliases.some((a) => a.toLowerCase() === t)) return key;
  }
  for (const key of MODEL_ORDER) {
    if (MODELS[key].aliases.some((a) => t.includes(a.toLowerCase()))) return key;
  }
  return '';
}

function matchKey(table, text, fallback) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return fallback;
  const entries = Object.entries(table);
  // 先精确命中，再取最长别名，避免「火夜」被「夜」抢先识别成夜晚
  for (const [key, def] of entries) {
    if (def.aliases.some((a) => t === a.toLowerCase())) return key;
  }
  let best = null;
  let bestLen = 0;
  for (const [key, def] of entries) {
    for (const a of def.aliases) {
      const al = a.toLowerCase();
      if (al.length > bestLen && t.includes(al)) { best = key; bestLen = al.length; }
    }
  }
  return best || fallback;
}

/** 舞台指示可带目标角色：【姿态：林夏|难过】；缺省或 * 表示全场 */
function splitDir(v) {
  const parts = String(v).split('|').map((s) => s.trim());
  if (parts.length >= 2 && parts[0] && parts[0] !== '*') return { who: parts[0], val: parts[1] };
  return { who: null, val: parts[parts.length - 1] || '' };
}

/* ---------- 人物外观：发长 + 衣色 ---------- */
const COLOR_WORDS = {
  红: '#d9534f', 赤: '#d9534f', 橙: '#f0883e', 黄: '#f0c04a', 绿: '#5fae7a',
  青: '#4fb0b8', 蓝: '#4a7fd0', 紫: '#8a63c4', 粉: '#ee8fb0', 白: '#f1ece4',
  黑: '#2c2a38', 灰: '#8d8a99', 棕: '#8a5a3c', 米: '#e6d3b3',
};
function pickColor(word) {
  const w = (word || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(w)) return w;
  for (const [k, v] of Object.entries(COLOR_WORDS)) if (w.includes(k)) return v;
  return null;
}

/**
 * 只记录“作者明确写下的”外观线索。
 * 没写就留空，由 CharacterManager 自动、稳定地分配；
 * 不根据姓名/性别推断长相，也不默认交替性别。
 */
function makeChar(name, gender, hair, cloth, model) {
  const gRaw = (gender || '').trim().toLowerCase();
  const genderTag = /^(女|女生|女性|female|f|girl)$/.test(gRaw) ? 'f'
    : /^(男|男生|男性|male|m|boy)$/.test(gRaw) ? 'm'
    : '';
  const hRaw = (hair || '').trim();
  const hairHint = /long|长/i.test(hRaw) ? 'long' : /short|短/i.test(hRaw) ? 'short' : '';
  const clothColor = pickColor(cloth);
  return {
    name,
    gender: genderTag,
    hairHint,
    clothColor,
    model: matchModel(model),
    // 兼容旧存档/旧剧本里的字段；仅作为“已明确写下”的线索
    hair: hairHint,
    cloth: clothColor || '',
  };
}

/* ============================================================
   主入口：把原始文本编译为统一的“剧本对象”
   ============================================================ */
export function parseScriptText(raw, fileName = '') {
  const text = raw.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const trimmed = text.trim();

  if (trimmed.startsWith('{')) {
    return compileJSON(trimmed, fileName);
  }
  return compileText(text, fileName);
}

export function countChars(text) {
  return text.replace(/\s+/g, '').length;
}

function fail(msg) { const e = new Error(msg); e.userFacing = true; return e; }

/* ---------------- 文本格式 ---------------- */
function compileText(text, fileName) {
  const lines = text.split('\n');
  const meta = { title: '', summary: '', author: '' };
  const characters = new Map();
  const nodes = [];
  const labels = {};
  let pendingChoices = null;
  let inCharBlock = false;

  const flushChoices = () => {
    if (pendingChoices && pendingChoices.options.length) nodes.push(pendingChoices);
    pendingChoices = null;
  };

  const ensureChar = (name) => {
    if (!characters.has(name)) {
      characters.set(name, makeChar(name));
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^(\/\/|<!--)/.test(line)) continue;

    // 元信息
    let m;
    if ((m = line.match(/^(?:#\s*)?标题[:：]\s*(.+)$/))) { meta.title = m[1].trim(); inCharBlock = false; continue; }
    if ((m = line.match(/^(?:#\s*)?简介[:：]\s*(.+)$/))) { meta.summary = m[1].trim(); inCharBlock = false; continue; }
    if ((m = line.match(/^(?:#\s*)?作者[:：]\s*(.+)$/))) { meta.author = m[1].trim(); inCharBlock = false; continue; }
    if (/^(?:#\s*)?角色[:：]?\s*$/.test(line)) { inCharBlock = true; continue; }

    // 角色定义：名字 | 性别 | 发型 | 衣色 | 模型（第五列可省略）
    if (inCharBlock && line.includes('|') && !line.startsWith('【')) {
      const parts = line.split('|').map((s) => s.trim());
      if (parts[0]) characters.set(parts[0], makeChar(parts[0], parts[1], parts[2], parts[3], parts[4]));
      continue;
    }
    if (inCharBlock && !line.includes('|')) inCharBlock = false;

    // 场景切换：【场景：教室 | 黄昏】 / 【场景：教室｜黄昏｜特写】
    if ((m = line.match(/^【\s*(?:场景|分镜)[:：]\s*(.+?)\s*】$/))) {
      flushChoices();
      const parts = m[1].split(/[|｜,，\s]+/).filter(Boolean);
      const scene = matchKey(SCENES, parts[0], null);
      if (!scene) {
        const names = Object.values(SCENES).map((s) => s.label).join(' / ');
        throw fail(`第 ${i + 1} 行：未识别的场景“${parts[0]}”。可用场景：${names}。`);
      }
      const time = matchKey(TIMES, parts[1], 'dusk');
      const cam = matchKey(CAMS, parts[2], 'mid');
      nodes.push({ t: 'scene', scene, time, cam });
      continue;
    }
    // 单独指定镜头：【镜头：特写】
    if ((m = line.match(/^【\s*镜头[:：]\s*(.+?)\s*】$/))) {
      flushChoices();
      nodes.push({ t: 'cam', cam: matchKey(CAMS, m[1], 'mid') });
      continue;
    }
    // 舞台指示：【姿态：难过】 / 【姿态：林夏|难过】 / 【动作：坐下】 / 【视角：过肩】
    if ((m = line.match(/^【\s*(?:姿态|情绪)[:：]\s*(.+?)\s*】$/))) {
      const d = splitDir(m[1]);
      nodes.push({ t: 'pose', who: d.who, pose: matchKey(POSES, d.val, 'neutral') });
      continue;
    }
    if ((m = line.match(/^【\s*动作[:：]\s*(.+?)\s*】$/))) {
      const d = splitDir(m[1]);
      nodes.push({ t: 'action', who: d.who, action: matchKey(ACTS, d.val, 'stand') });
      continue;
    }
    if ((m = line.match(/^【\s*(?:视角|机位)[:：]\s*(.+?)\s*】$/))) {
      nodes.push({ t: 'view', view: matchKey(VIEWS, m[1], 'normal') });
      continue;
    }
    // 出场：【出场：小悠真|小葵】让指定角色先站上舞台（不发言），
    // 用于“人物先入画、随后旁白描述”的镜头；只接受角色表里已声明的名字。
    if ((m = line.match(/^【\s*(?:出场|登场)[:：]\s*(.+?)\s*】$/))) {
      flushChoices();
      const names = m[1].split(/[|｜、,，]/).map((s) => s.trim()).filter(Boolean);
      nodes.push({ t: 'enter', names });
      continue;
    }
    // 结束 / 清场
    if (/^【\s*(?:清场|空场|无人)\s*】$/.test(line)) { flushChoices(); nodes.push({ t: 'clear' }); continue; }
    if (/^【\s*(结束|完)\s*】$/.test(line)) { flushChoices(); nodes.push({ t: 'end' }); continue; }
    // 标签 [xxx]
    if ((m = line.match(/^\[([^\]]+)\]$/))) {
      flushChoices();
      labels[m[1].trim()] = nodes.length;
      continue;
    }
    // 跳转 -> xxx
    if ((m = line.match(/^->\s*(.+)$/))) {
      flushChoices();
      nodes.push({ t: 'jump', to: m[1].trim() });
      continue;
    }
    // 选项 > 文本 -> 标签
    if ((m = line.match(/^>\s*(.+?)\s*->\s*(.+)$/))) {
      if (!pendingChoices) pendingChoices = { t: 'choice', options: [] };
      pendingChoices.options.push({ text: m[1].trim(), to: m[2].trim() });
      continue;
    }

    // 台词 名字：内容（名字不超过 8 个字，避免把普通句子里的冒号误判）
    // 行内情绪 / 括号描述：名字（开心）：内容 —— 只影响这一句的身体语言
    // 括号内允许较长描写（如“看着天色，眉头微蹙”），但仅当名字已声明时才生效，
    // 避免把普通叙述误判成台词；未声明名字仍沿用 6 字以内的旧规则。
    if ((m = line.match(/^([^\s:：【】\[\]>]{1,8})[（(]([^)）]{1,40})[)）][:：]\s*(.+)$/))
      && (m[1] === '旁白' || characters.has(m[1]) || m[2].trim().length <= 6)) {
      const poseKey = matchKey(POSES, m[2], null);
      if (poseKey) {
        flushChoices();
        if (m[1] === '旁白') nodes.push({ t: 'say', who: '', text: m[3].trim() });
        else { ensureChar(m[1]); nodes.push({ t: 'say', who: m[1], text: m[3].trim(), pose: poseKey }); }
        continue;
      }
      // 画外音：名字（录音）/（画外）/（电话）…… 只显示名字，不让人物出场
      // 允许括号里带语气前缀，如（温柔的声音，画外音）——只取末尾的画外音类型显示
      const voiceTag = m[2].trim().match(/^(?:[^，,、]*[，,、]\s*)?(录音中|录音|画外音|画外|电话|广播|回忆|心声)$/);
      if (voiceTag) {
        flushChoices();
        const who = m[1] === '旁白' ? '' : m[1];
        if (who) ensureChar(who);
        nodes.push({ t: 'say', who, text: m[3].trim(), voice: voiceTag[1] });
        continue;
      }
      // 其他括号（轻声 / 无奈 / 迟疑……）只当作语气备注，不生成假角色
      flushChoices();
      {
        const who = m[1] === '旁白' ? '' : m[1];
        if (who) ensureChar(who);
        nodes.push({ t: 'say', who, text: m[3].trim(), note: m[2].trim() });
      }
      continue;
    }
    if ((m = line.match(/^([^\s:：【】\[\]>]{1,8})[:：]\s*(.+)$/))) {
      flushChoices();
      const name = m[1];
      if (name === '旁白') {
        nodes.push({ t: 'say', who: '', text: m[2].trim() });
      } else {
        ensureChar(name);
        nodes.push({ t: 'say', who: name, text: m[2].trim() });
      }
      continue;
    }

    // 其他：旁白
    flushChoices();
    nodes.push({ t: 'say', who: '', text: line });
  }
  flushChoices();

  return finalize({ meta, characters: [...characters.values()], nodes, labels }, fileName);
}

/* ---------------- JSON 格式 ---------------- */
function compileJSON(str, fileName) {
  let obj;
  try { obj = JSON.parse(str); } catch (e) { throw fail('JSON 格式有误：' + e.message); }
  const meta = { title: obj.title || '', summary: obj.summary || '', author: obj.author || '' };
  const characters = (obj.characters || []).map((c) => makeChar(c.name, c.gender, c.hair, c.cloth || c.color, c.model));
  const nodes = [];
  const labels = {};
  for (const n of obj.nodes || []) {
    if (n.label) labels[n.label] = nodes.length;
    if (n.scene) {
      const scene = matchKey(SCENES, n.scene, null);
      if (!scene) throw fail(`JSON 中出现未识别的场景“${n.scene}”。`);
      nodes.push({ t: 'scene', scene, time: matchKey(TIMES, n.time, 'dusk'), cam: matchKey(CAMS, n.cam, 'mid') });
    }
    if (n.say !== undefined) nodes.push({ t: 'say', who: n.who || '', text: String(n.say) });
    if (n.choices) nodes.push({ t: 'choice', options: n.choices.map((c) => ({ text: c.text, to: c.to })) });
    if (n.jump) nodes.push({ t: 'jump', to: n.jump });
    if (n.end) nodes.push({ t: 'end' });
  }
  for (const n of nodes) {
    if (n.t === 'say' && n.who && !characters.find((c) => c.name === n.who)) {
      characters.push(makeChar(n.who));
    }
  }
  return finalize({ meta, characters, nodes, labels }, fileName);
}

/* ---------------- 校验与收尾 ---------------- */
function finalize({ meta, characters, nodes, labels }, fileName) {
  if (!nodes.some((n) => n.t === 'say')) throw fail('没有读取到任何台词或旁白，请对照格式说明检查剧本。');
  if (!nodes.some((n) => n.t === 'scene')) {
    nodes.unshift({ t: 'scene', scene: 'classroom', time: 'dusk', cam: 'mid' });
  } else if (nodes[0].t !== 'scene') {
    nodes.unshift({ t: 'scene', scene: nodes.find((n) => n.t === 'scene').scene, time: 'dusk', cam: 'mid' });
  }
  for (const n of nodes) {
    const targets = n.t === 'jump' ? [n.to] : n.t === 'choice' ? n.options.map((o) => o.to) : [];
    for (const to of targets) {
      if (!(to in labels)) throw fail(`跳转指向了不存在的标签“${to}”，请检查 [${to}] 是否已定义。`);
    }
  }
  if (nodes[nodes.length - 1].t !== 'end') nodes.push({ t: 'end' });

  const title = meta.title || fileName.replace(/\.[^.]+$/, '') || '未命名剧本';
  const firstSay = nodes.find((n) => n.t === 'say');
  const firstScene = nodes.find((n) => n.t === 'scene');
  return {
    title,
    summary: meta.summary || (firstSay ? firstSay.text.slice(0, 40) + '…' : ''),
    author: meta.author,
    characters,
    nodes,
    labels,
    cover: firstScene ? { scene: firstScene.scene, time: firstScene.time } : { scene: 'classroom', time: 'dusk' },
  };
}

/* ============================================================
   文件读取：txt / md / json / docx / zip
   ============================================================ */
export async function readFileToScript(file) {
  if (file.size > LIMITS.maxFileBytes) throw fail('文件过大（上限 5MB）。');
  const name = file.name || '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  let text = '';

  if (ext === 'zip') {
    text = await readFromZip(await file.arrayBuffer());
  } else if (ext === 'docx') {
    text = await docxToText(await file.arrayBuffer());
  } else if (['txt', 'md', 'json', 'text', 'markdown'].includes(ext)) {
    text = await file.text();
  } else {
    throw fail('暂不支持该文件类型。请使用 .txt / .md / .json / .docx，或将它们打包为 .zip。');
  }

  const n = countChars(text);
  if (n < LIMITS.minChars) throw fail(`剧本只有 ${n} 字，少于下限 ${LIMITS.minChars} 字。`);
  if (n > LIMITS.maxChars) throw fail(`剧本有 ${n} 字，超过上限 ${LIMITS.maxChars} 字，请精简后再导入。`);

  const script = parseScriptText(text, name);
  script.chars = n;
  return script;
}

/* ---------------- 最小 ZIP 读取器（central directory + deflate-raw） ---------------- */
async function unzipEntries(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // 找 End Of Central Directory
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw fail('无法识别该压缩包，请确认它是标准 .zip 文件。');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  const dec = new TextDecoder('utf-8');
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flag = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, csize, localOff, flag });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return { entries, dv, u8 };
}

async function extractEntry({ dv, u8 }, e) {
  const p = e.localOff;
  const nameLen = dv.getUint16(p + 26, true);
  const extraLen = dv.getUint16(p + 28, true);
  const start = p + 30 + nameLen + extraLen;
  const data = u8.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  if (e.method === 8) {
    if (typeof DecompressionStream === 'undefined') throw fail('当前浏览器不支持解压 zip，请升级到较新的浏览器，或直接导入 .txt 文件。');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw fail('压缩包使用了不支持的压缩方式。');
}

async function readFromZip(buf) {
  const z = await unzipEntries(buf);
  const usable = z.entries
    .filter((e) => !e.name.endsWith('/') && !/(^|\/)(__MACOSX|\.)/.test(e.name))
    .filter((e) => /\.(txt|md|json|docx)$/i.test(e.name));
  if (!usable.length) throw fail('压缩包内没有找到 .txt / .md / .json / .docx 剧本文档。');
  const e = usable[0];
  const bytes = await extractEntry(z, e);
  if (/\.docx$/i.test(e.name)) return docxToText(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return new TextDecoder('utf-8').decode(bytes);
}

async function docxToText(buf) {
  const z = await unzipEntries(buf);
  const doc = z.entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw fail('这个 .docx 文件似乎已损坏。');
  const xml = new TextDecoder('utf-8').decode(await extractEntry(z, doc));
  const paras = xml.split(/<\/w:p>/).map((p) => {
    const pieces = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
    return pieces.join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  });
  return paras.join('\n');
}

/* ---------------- 站内展示用的格式说明与示例 ---------------- */
export const FORMAT_EXAMPLE = `标题：蝉鸣止于逢魔时（示例）
简介：放学后的教室，一段没来得及听完的录音。
角色：
夏目悠真 | 男 | 短发 | 藏青 | 少年
小葵 | 女 | 双马尾 | 橙 | 少女
小悠真 | 男 | 短发 | 灰 | 男儿童

【场景：教室 | 黄昏 | 远景】
夕阳把课桌的影子拉得很长，风从半开的窗户钻进来，翻动没人收拾的练习册。
蝉声在窗外连成一片，像谁把夏天按下了循环播放。

【场景：教室 | 黄昏 | 中景】
夏目悠真：……谁把录音带落在这儿了？
小葵：悠真哥，你终于来了！
小葵（录音）：如果明天还能见面，我想把这首歌听完。

【镜头：特写】
夏目悠真：磁带上贴着一张便签，字迹被汗水晕开了一点。

【镜头：中景】
> 追问小葵录音的事 -> ask
> 假装没注意，把磁带放进口袋 -> keep

[ask]
小葵（难过）：那不是我录的……
-> ending

[keep]
【清场】
【场景：操场 | 夜晚 | 远景】
操场的灯一盏一盏亮起来，蝉鸣却忽然停了。
-> ending

[ending]
【结束】`;
