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
  ancient:   { label: '古建筑', aliases: ['古建筑', '古建', '庭院', '宫', '寺', '古塔', '长廊', 'ancient', 'temple'] },
};
export const TIMES = {
  dusk:  { label: '黄昏', aliases: ['黄昏', '傍晚', '夕阳', 'dusk', 'sunset'] },
  day:   { label: '白天', aliases: ['白天', '清晨', '正午', '午后', 'day', 'morning'] },
  night: { label: '夜晚', aliases: ['夜晚', '夜', '深夜', 'night'] },
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

function matchKey(table, text, fallback) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return fallback;
  for (const [key, def] of Object.entries(table)) {
    if (def.aliases.some((a) => t.includes(a.toLowerCase()))) return key;
  }
  return fallback;
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
function makeChar(name, gender, hair, cloth) {
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
  let charIdx = 0;
  let pendingChoices = null;
  let inCharBlock = false;

  const flushChoices = () => {
    if (pendingChoices && pendingChoices.options.length) nodes.push(pendingChoices);
    pendingChoices = null;
  };

  const ensureChar = (name) => {
    if (!characters.has(name)) {
      characters.set(name, makeChar(name, '', '', '', charIdx++));
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

    // 角色定义：名字 | 性别 | 发型 | 衣色
    if (inCharBlock && line.includes('|') && !line.startsWith('【')) {
      const parts = line.split('|').map((s) => s.trim());
      if (parts[0]) characters.set(parts[0], makeChar(parts[0], parts[1], parts[2], parts[3], charIdx++));
      continue;
    }
    if (inCharBlock && !line.includes('|')) inCharBlock = false;

    // 场景切换：【场景：教室 | 黄昏】 / 【场景：教室｜黄昏｜特写】
    if ((m = line.match(/^【\s*(?:场景|分镜)[:：]\s*(.+?)\s*】$/))) {
      flushChoices();
      const parts = m[1].split(/[|｜,，\s]+/).filter(Boolean);
      const scene = matchKey(SCENES, parts[0], null);
      if (!scene) throw fail(`第 ${i + 1} 行：未识别的场景“${parts[0]}”。可用场景：公司 / 教室 / 操场 / 古建筑。`);
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
    // 结束
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
    // 行内情绪：名字（开心）：内容 —— 只影响这一句的身体语言
    if ((m = line.match(/^([^\s:：【】\[\]>]{1,8})[（(]([^)）]{1,6})[)）][:：]\s*(.+)$/))) {
      const poseKey = matchKey(POSES, m[2], null);
      if (poseKey) {
        flushChoices();
        if (m[1] === '旁白') nodes.push({ t: 'say', who: '', text: m[3].trim() });
        else { ensureChar(m[1]); nodes.push({ t: 'say', who: m[1], text: m[3].trim(), pose: poseKey }); }
        continue;
      }
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
  const characters = (obj.characters || []).map((c, i) => makeChar(c.name, c.gender, c.hair, c.cloth || c.color, i));
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
      characters.push(makeChar(n.who, '', '', '', characters.length));
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
export const FORMAT_EXAMPLE = `标题：雨后的操场
简介：一次迟到的告别，发生在放学后的操场。
角色：
林夏 | 女 | 长发 | 红
陈默 | 男 | 短发 | 蓝

【场景：操场 | 黄昏 | 远景】
【动作：陈默|行走】
旁白：放学后的操场空了，只剩风吹过跑道。
【动作：陈默|站立】
【镜头：中景】
林夏：你还是来了。
陈默：我答应过你的。
林夏（难过）：明天的火车，我已经买好票了。
【视角：背影】
旁白：远处的广播忽然响起放学的铃声，又很快静了下去。
【视角：常规】
> 递给她一瓶水 -> water
> 沉默地站在一旁 -> silent

[water]
【镜头：特写】
陈默：习惯了。从你第一次忘带水杯开始。
【镜头：中景】
林夏（开心）：谢谢……你总是这么细心。
-> ending

[silent]
【姿态：陈默|难过】
林夏：你还是什么都不说。
-> ending

[ending]
【场景：操场 | 夜晚 | 远景】
旁白：夕阳沉下去，故事也停在了这一刻。
【结束】`;
