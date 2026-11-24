/* ============================================================
   暮幕 · 内容校验器（离线工具，不参与游戏运行，零依赖）
   用法：node tools/lint.js <文件...> | --builtin [--json] [--strict]
   规则码见 docs/mumu-lint-rules.md
   ============================================================ */
import {
  SCENES, TIMES, CAMS, POSES, ACTS, VIEWS, MODELS,
  matchModel, parseScriptText,
} from '../scripts/parser.js';
import { loadBuiltinScripts } from '../scripts/builtin.js';
// Task 4 会补上：import { readFileSync, existsSync } from 'node:fs';
//                import { fileURLToPath } from 'node:url';
//                import path from 'node:path';

/**
 * 词表匹配：与 scripts/parser.js 的 matchKey 保持同一「认识 / 不认识」口径。
 * 1) 精确别名命中（比较串一律转小写）；
 * 2) 最长的、**作为前缀**包含在文本里的别名；
 * 3) 都没有 → null（未知）。
 *
 * 为什么第 2 步要求「前缀」而不是「任意子串」：
 * - 解析器用的是任意子串，于是【镜头：超特写】里的「特写」会被悄悄命中，
 *   镜头从「中景」被改成「特写」，作者毫不知情 —— 这类「静默改写」正是
 *   本工具要报出来的东西（见设计文档 §1.1），所以工具侧必须判为未知。
 * - 前缀口径同样能保证「火夜」不会被「夜」抢先（最长优先），
 *   并且每个表里的 label / alias 都能被认出来（alias 至少是自身的前缀）。
 * 注意：像「夜晚的教室」这种带修饰语的写法是认得出的（因为它以「夜晚」开头）；
 * 认不出的是「别名没出现在开头」的写法（如「教室的夜晚」）或「完全不含别名」的写法。
 * 本项目的 DSL 里词表值都是单个词，内置语料不受影响。
 */
export function matchTable(table, text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const entries = Object.entries(table);
  // 先精确命中
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      if (a.toLowerCase() === t) return key;
    }
  }
  // 再取最长的前缀别名，避免「火夜」被「夜」抢先识别成夜晚
  let best = null;
  let bestLen = 0;
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      const al = a.toLowerCase();
      if (al.length > bestLen && t.startsWith(al)) { best = key; bestLen = al.length; }
    }
  }
  return best;
}

/**
 * 词表匹配（解析器口径）：这个文本解析器实际会当成什么。
 * 复刻 scripts/parser.js 的 matchKey 语义：1) 精确别名命中；2) 最长的、作为子串包含在文本里的别名；3) 都没有 → null。
 * 与 matchTable（作者口径：精确 → 最长前缀）配套：matchTable 决定「要不要报」，
 * resolveTable 决定「报的时候该怎么说」，两处口径都锁在测试里。
 */
export function resolveTable(table, text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return { key: null, mode: 'none' };
  const entries = Object.entries(table);
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      if (a.toLowerCase() === t) return { key, mode: 'exact' };
    }
  }
  let best = null;
  let bestLen = 0;
  for (const [key, def] of entries) {
    for (const a of def.aliases || []) {
      const al = a.toLowerCase();
      if (al.length > bestLen && t.includes(al)) { best = key; bestLen = al.length; }
    }
  }
  if (best) return { key: best, mode: 'fuzzy' };
  return { key: null, mode: 'none' };
}

/** 故事行：只有这几类行在解析器里会产生节点；meta / charRow / label 不产生节点 */
export const STORY_KINDS = new Set(['dir', 'choice', 'jump', 'say']);

const DIR_TAGS = new Set([
  '场景', '分镜', '镜头', '姿态', '情绪', '动作', '视角', '机位',
  '出场', '登场', '清场', '空场', '无人', '结束', '完',
]);

/**
 * 必须带值的标签：解析器只匹配「【key：value】」这种形式，
 * 写成「【key】」时整行会退化成旁白（实测解析器产出 {"t":"say","who":"","text":"【场景】"}）。
 */
const DIR_TAGS_NEED_VALUE = new Set([
  '场景', '分镜', '镜头', '姿态', '情绪', '动作', '视角', '机位', '出场', '登场',
]);

/**
 * 只能不带值的标签：解析器只认「【清场】」这种形式，
 * 写成「【清场：xxx】」时整行会退化成旁白（静默失败，正是本工具要抓的那类）。
 * 注意：结束 / 完 允许带值（那是结局名），不在此列。
 */
const DIR_TAGS_NO_VALUE = new Set(['清场', '空场', '无人']);

/**
 * 「值只有空白」时解析器会回落到哪个默认值。
 * 与 scripts/parser.js 里各分支的 fallback 参数一一对应：
 * 镜头 → mid（中景）、姿态 → neutral（自然）、动作 → stand（站立）、视角 → normal（常规）。
 */
const DIR_TAG_DEFAULT = {
  镜头: { noun: '镜头', fallback: '中景' },
  姿态: { noun: '姿态', fallback: '自然' },
  情绪: { noun: '姿态', fallback: '自然' },
  动作: { noun: '动作', fallback: '站立' },
  视角: { noun: '视角', fallback: '常规' },
  机位: { noun: '视角', fallback: '常规' },
};

/**
 * 舞台指示的 key（【xxx：…】里的 xxx）；未知 key 由规则 E101 报出。
 * 无值形式（【结束】/【完】/【清场】）也要认得出 key，
 * 否则每一条【结束】都会被当成未知标签误报。
 */
export function dirKey(text) {
  const m = String(text).match(/^【\s*([^:：】]+?)\s*(?:[:：][^】]*)?】\s*$/);
  return m ? m[1].trim() : null;
}

/** 舞台指示的值（【场景：教室 | 黄昏】里的「教室 | 黄昏」），无值形式返回 '' */
export function dirValue(text) {
  const m = String(text).match(/^【\s*[^:：]+[:：]\s*([^】]*)\s*】\s*$/);
  return m ? m[1].trim() : '';
}

/**
 * 舞台指示的原始值（未 trim）：【镜头： 】得到「 」，【镜头：】与【镜头】都得到 ''。
 * 用来区分两种「没有值」：
 * - 完全缺值（【场景】/【场景：】）：解析器匹配不到任何分支 → 整行退化成旁白；
 * - 只有空白（【镜头： 】）：解析器能匹配到分支，但值取空 → 产出节点并回落到默认值。
 */
export function dirRaw(text) {
  const m = String(text).match(/^【\s*[^:：]+[:：]([^】]*)】\s*$/);
  return m ? m[1] : '';
}

/** 原始值的三态：none（完全缺值）/ blank（只有空白）/ text（有实际内容） */
function dirValueKind(raw) {
  if (!raw) return 'none';
  if (!raw.trim()) return 'blank';
  return 'text';
}

/**
 * 取「作者真正想写的那个值」：先按半角 | 切开取末段，
 * 末段里若还夹着全角 ｜，再取 ｜ 之后的最后一段。
 * 例：【姿态：阿蓝｜疲惫】→ 半角切分得「阿蓝｜疲惫」→ 再按全角切分得「疲惫」。
 */
function intentValue(value) {
  const half = String(value).split('|').map((s) => s.trim()).filter(Boolean);
  let seg = half.length ? half[half.length - 1] : '';
  if (seg.includes('｜')) {
    const fw = seg.split('｜').map((s) => s.trim()).filter(Boolean);
    if (fw.length) seg = fw[fw.length - 1];
  }
  return seg;
}

/**
 * 解析器实际会把这个值当成什么（文案口径，见 resolveTable）。
 * 模糊命中 → 说出被命中的词条；完全认不出 → 说出会回落的默认值。
 */
function whatFor(table, val, fallback) {
  const r = resolveTable(table, val);
  return r.mode === 'fuzzy'
    ? `解析器会把它当成「${table[r.key].label}」`
    : `解析器会回落到「${fallback}」`;
}

/**
 * 「值只有空白」时的 E101 文案：解析器仍会产出节点，但值取空 → 回落到默认值。
 * 三类口径都按 scripts/parser.js 的真实行为写：
 * - 镜头 / 姿态 / 动作 / 视角：产出节点并回落到对应默认值；
 * - 场景 / 分镜：解析器读不出场景名，会直接抛「未识别的场景」，整个剧本都加载不了；
 * - 出场 / 登场：出场名单为空，谁也不会上场，这一行等于没写。
 */
function blankValueMessage(key, text) {
  const d = DIR_TAG_DEFAULT[key];
  if (d) {
    return `舞台指示「${text}」的值为空（只有空白），解析器会回落到默认${d.noun}「${d.fallback}」。`;
  }
  if (key === '场景' || key === '分镜') {
    return `舞台指示「${text}」的值为空（只有空白），解析器读不出场景名，会报「未识别的场景」并中断整个剧本的加载。`;
  }
  return `舞台指示「${text}」的值为空（只有空白），解析器不会让任何人出场，这一行不会生效。`;
}

/**
 * 逐行扫描：把剧本文本拆成带行号的行记录，并抽出角色表、标签、元信息。
 * 分类口径与 scripts/parser.js 对齐：
 * - meta：标题/简介/作者行
 * - charRow：角色块内、含 |、且第一个 | 之前不含冒号的行
 * - label：[xxx]
 * - dir：【…】
 * - choice：> 开头
 * - jump：-> 开头
 * - say：其余非空行
 * 注释行（// 与 <!-- 开头）跟解析器一样直接忽略，不算内容。
 */
export function scanText(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const srcLines = raw.split('\n');
  const lines = [];
  const chars = new Map();
  const labels = [];
  const meta = { title: '', summary: '', author: '' };
  let inCharBlock = false;
  let sawScene = false;
  let sawEnd = false;

  for (let i = 0; i < srcLines.length; i++) {
    const line = i + 1;
    const t = srcLines[i].trim();
    if (!t) continue;
    if (/^(\/\/|<!--)/.test(t)) continue;

    let m;
    if ((m = t.match(/^(?:#\s*)?标题[:：]\s*(.+)$/))) { meta.title = m[1].trim(); inCharBlock = false; lines.push({ line, kind: 'meta', text: t }); continue; }
    if ((m = t.match(/^(?:#\s*)?简介[:：]\s*(.+)$/))) { meta.summary = m[1].trim(); inCharBlock = false; lines.push({ line, kind: 'meta', text: t }); continue; }
    if ((m = t.match(/^(?:#\s*)?作者[:：]\s*(.+)$/))) { meta.author = m[1].trim(); inCharBlock = false; lines.push({ line, kind: 'meta', text: t }); continue; }
    if (/^(?:#\s*)?角色[:：]?\s*$/.test(t)) { inCharBlock = true; continue; }

    if (inCharBlock && t.includes('|') && !t.startsWith('【') && !t.split('|')[0].includes('：') && !t.split('|')[0].includes(':')) {
      const cols = t.split('|').map((x) => x.trim());
      if (cols[0]) chars.set(cols[0], { name: cols[0], cols, model: cols[4] || '', line });
      lines.push({ line, kind: 'charRow', text: t, name: cols[0] });
      continue;
    }
    if (inCharBlock) inCharBlock = false;

    if ((m = t.match(/^\[([^\]]+)\]$/))) {
      labels.push({ name: m[1].trim(), line, targetLine: null });
      lines.push({ line, kind: 'label', text: t, name: m[1].trim() });
      continue;
    }
    if (/^【.*】$/.test(t)) {
      const key = dirKey(t);
      const value = dirValue(t);
      const raw = dirRaw(t);
      // 只有「场景/分镜」且带值才算真正的场景指示：
      // 【场景】（缺值）解析器不认，会退化成旁白，不能用来抑制 W107。
      if ((key === '场景' || key === '分镜') && value) sawScene = true;
      if (key === '结束' || key === '完') sawEnd = true;
      lines.push({
        line, kind: 'dir', text: t, name: key, value, raw,
        parts: value ? value.split(/[|｜,，\s]+/).filter(Boolean) : [],
      });
      continue;
    }
    if (t.startsWith('>')) {
      const cm = t.match(/^>\s*(.+?)\s*->\s*(.+)$/);
      lines.push({ line, kind: 'choice', text: t, name: cm ? cm[1].trim() : null, value: cm ? cm[2].trim() : null });
      continue;
    }
    if (t.startsWith('->')) {
      const jm = t.match(/^->\s*(.+)$/);
      lines.push({ line, kind: 'jump', text: t, value: jm ? jm[1].trim() : null });
      continue;
    }
    lines.push({ line, kind: 'say', text: t });
  }

  // 标签 → 其后第一个故事行（标签行本身不产生内容）
  for (const lab of labels) {
    const next = lines.find((l) => STORY_KINDS.has(l.kind) && l.line > lab.line);
    lab.targetLine = next ? next.line : null;
  }
  return { lines, chars, labels, meta, sawScene, sawEnd };
}

/**
 * 一条 issue：severity ∈ error|warning，code 见规则码表，line 为原始文本行号。
 * hint 只在有可操作建议时给出。
 */
function issue(severity, code, line, message, hint) {
  return hint ? { severity, code, line, message, hint } : { severity, code, line, message };
}

/**
 * 可用值清单一律从词表派生（scripts/parser.js 是唯一事实来源）。
 * 手写清单会跟解析器脱节：例如 POSE_LIST 曾写「疲惫」，而解析器的 POSES 里
 * 只有「害羞 / 思考」——作者照着提示写【姿态：疲惫】，工具自己就报 W101。
 */
const listOf = (table) => Object.values(table).map((v) => v.label).join(' / ');
const SCENE_LIST = listOf(SCENES);
const TIME_LIST = listOf(TIMES);
const CAM_LIST = listOf(CAMS);
const POSE_LIST = listOf(POSES);
const ACT_LIST = listOf(ACTS);
const VIEW_LIST = listOf(VIEWS);

/**
 * 12 条文本级规则：E101-E105、W101-W105、W107、W108。
 *
 * 判定口径：
 * - 「要不要报」用 matchTable（作者口径：精确别名 → 最长前缀）；
 * - 「报的时候怎么说」用 resolveTable（解析器口径：精确别名 → 最长子串），
 *   于是能明确告诉作者「解析器会把它当成什么」或「会回落到哪个默认值」。
 */
function applyTextRules(scan) {
  const issues = [];
  const labels = new Map();
  for (const lab of scan.labels) {
    if (labels.has(lab.name)) {
      issues.push(issue('error', 'E104', lab.line,
        `标签「${lab.name}」重复定义，前一次在第 ${labels.get(lab.name)} 行；后一次会覆盖前一次。`,
        '请删掉多余的一处，或把两处改成不同的标签名。'));
    } else {
      labels.set(lab.name, lab.line);
    }
  }

  for (const rec of scan.lines) {
    if (rec.kind === 'dir') {
      const key = rec.name;
      if (!DIR_TAGS.has(key)) {
        issues.push(issue('error', 'E101', rec.line,
          `未知舞台指示标签「${key}」。本项目只认：场景/分镜、镜头、姿态/情绪、动作、视角/机位、出场/登场、清场/空场/无人、结束/完。`,
          '把标签名改成上面列出的写法，否则这一行会被当成旁白。'));
        continue;
      }
      const value = rec.value || '';
      const vkind = dirValueKind(rec.raw);
      // 已知标签但缺必需值：分两种口径，文案必须说清解析器的真实行为
      if (DIR_TAGS_NEED_VALUE.has(key) && vkind === 'none') {
        // 完全缺值（【场景】/【场景：】）：解析器匹配不到任何分支 → 整行退化成旁白
        issues.push(issue('error', 'E101', rec.line,
          `舞台指示「${rec.text}」缺少值，解析器不认识这一行，它会被当成旁白。`,
          `这一类标签必须带值（例如【${key}：…】）；补上值之后这一行才会作为舞台指示生效。`));
        continue;
      }
      if (DIR_TAGS_NEED_VALUE.has(key) && vkind === 'blank') {
        // 只有空白（【镜头： 】）：解析器仍会产出节点，但值取空 → 回落到默认值
        issues.push(issue('error', 'E101', rec.line,
          blankValueMessage(key, rec.text),
          `这一类标签必须带值（例如【${key}：…】）；补上值之后这一行才会按预期生效。`));
        continue;
      }
      // 只能不带值的标签带了值（【清场：xxx】）：整行退化成旁白，静默失败
      if (DIR_TAGS_NO_VALUE.has(key) && vkind !== 'none') {
        issues.push(issue('error', 'E101', rec.line,
          `舞台指示「${rec.text}」不该带值：${key}只有不带值的写法才有效，写成【${key}：xxx】会被当成旁白。`,
          `请把这一行改成【${key}】（不要冒号，也不要值）。`));
        continue;
      }
      // 词表类判定：matchTable 认不出的才报；文案用 resolveTable 说清「解析器实际会当成什么」
      const vocab = (table, val, kind, available, fallback) => {
        if (!val || matchTable(table, val)) return;
        issues.push(issue('warning', 'W101', rec.line,
          `未识别的${kind}「${val}」：${whatFor(table, val, fallback)}。`,
          `可用${kind}：${available}。`));
      };
      if (key === '场景' || key === '分镜') {
        const parts = value.split(/[|｜,，\s]+/).filter(Boolean);
        if (parts[0]) {
          if (!matchTable(SCENES, parts[0]) && resolveTable(SCENES, parts[0]).mode === 'none') {
            issues.push(issue('error', 'E102', rec.line,
              `未识别的场景「${parts[0]}」。可用场景：${SCENE_LIST}。`,
              '请改成上面列出的场景名；否则解析器会直接拒绝这个剧本。'));
          } else {
            vocab(SCENES, parts[0], '场景', SCENE_LIST, '教室');
          }
        }
        if (parts[1]) vocab(TIMES, parts[1], '时段', TIME_LIST, '黄昏');
        if (parts[2]) vocab(CAMS, parts[2], '镜头', CAM_LIST, '中景');
      }
      if (key === '镜头') vocab(CAMS, value, '镜头', CAM_LIST, '中景');
      // 姿态 / 动作：解析器的 splitDir 只按半角 | 切分，全角 ｜ 会把目标角色丢掉
      if (key === '姿态' || key === '情绪' || key === '动作') {
        const isPose = key !== '动作';
        const table = isPose ? POSES : ACTS;
        const kind = isPose ? '姿态' : '动作';
        const available = isPose ? POSE_LIST : ACT_LIST;
        const fallback = isPose ? '自然' : '站立';
        if (value.includes('｜')) {
          // 全角 ｜：解析器的 splitDir 只按半角 | 切分，目标角色会丢掉。
          // 但值本身仍然要判定 —— 分隔符写错不该掩盖「姿态拼错了」这件事。
          const val = intentValue(value);
          const unknown = !!val && val !== '*' && !matchTable(table, val);
          const message = unknown
            ? `舞台指示「${rec.text}」里用了全角「｜」，解析器只认半角「|」，作用对象会变成全场；`
              + `而且${kind}「${val}」未识别，${whatFor(table, value, fallback)}。`
            : `舞台指示「${rec.text}」里用了全角「｜」，解析器只认半角「|」，作用对象会变成全场。`;
          issues.push(issue('warning', 'W101', rec.line, message,
            `请把全角「｜」改成半角「|」（例如【${key}：角色|${fallback === '自然' ? '难过' : '坐下'}】）；可用${kind}：${available}。`));
        } else {
          const parts = value.split('|').map((x) => x.trim()).filter(Boolean);
          const val = parts.length > 1 ? parts[1] : parts[0];
          // * 是项目文档化的「全场」写法，解析器专门判过，不做词表判定
          if (val && val !== '*') vocab(table, val, kind, available, fallback);
        }
      }
      if (key === '视角' || key === '机位') vocab(VIEWS, value, '视角', VIEW_LIST, '常规');
      if (key === '出场' || key === '登场') {
        for (const n of value.split(/[|｜、,，]/).map((x) => x.trim()).filter(Boolean)) {
          if (!scan.chars.has(n)) {
            issues.push(issue('warning', 'W104', rec.line,
              `「【${key}：${n}】」里的「${n}」未在角色表中声明，该出场指令不会生效。`,
              '请在「角色：」块里补上这一行，或改对名字。'));
          }
        }
      }
      continue;
    }

    if (rec.kind === 'charRow') {
      // 取当前行原文切列：scan.chars 是「同名后写覆盖」，查它会把重名角色的先写行判错
      const cols = rec.text.split('|').map((x) => x.trim());
      if (cols.length !== 5) {
        issues.push(issue('warning', 'W105', rec.line,
          `角色行有 ${cols.length} 列，规范是 5 列（名字 | 性别 | 发型 | 衣色 | 模型）。`,
          '补齐或删掉多余的分隔符；第 5 列（模型）留空表示交给系统分配。'));
      }
      if (cols[4] && !matchModel(cols[4])) {
        issues.push(issue('warning', 'W102', rec.line,
          `未识别的模型「${cols[4]}」，会按性别回落外观。`,
          '请填 assets/models 里已有的模型名（如 少年 / 少女（2）/ 画师少年）。'));
      }
      continue;
    }

    if (rec.kind === 'choice') {
      if (rec.value === null) {
        issues.push(issue('error', 'E105', rec.line,
          '选项行缺少落点，这一行会被当成旁白，选项凭空消失。',
          '正确写法：> 追问磁带 -> 追问分支'));
        continue;
      }
      if (!labels.has(rec.value)) {
        issues.push(issue('error', 'E103', rec.line,
          `选项指向了不存在的标签「${rec.value}」。`,
          `请检查 [${rec.value}] 是否已定义。`));
      }
      continue;
    }

    if (rec.kind === 'jump') {
      if (!labels.has(rec.value)) {
        issues.push(issue('error', 'E103', rec.line,
          `跳转指向了不存在的标签「${rec.value}」。`,
          `请检查 [${rec.value}] 是否已定义。`));
      }
      continue;
    }

    if (rec.kind === 'say') {
      // 与解析器的两种台词形态对齐：「名字（情绪）：内容」与「名字：内容」
      const dm = rec.text.match(/^([^\s:：【】\[\]>]{1,8})[（(]([^)）]{1,40})[)）][:：]/);
      const dm2 = dm ? null : rec.text.match(/^([^\s:：【】\[\]>]{1,8})[:：]/);
      const who = dm ? dm[1].trim() : (dm2 ? dm2[1].trim() : null);
      if (who && who !== '旁白' && !scan.chars.has(who)) {
        // 括号形态复刻解析器的守卫：只有「名字是旁白 / 名字已声明 / 括号内容 ≤ 6 字」
        // 之一成立时，解析器才把这行当台词；三者都不成立时整行按旁白处理，
        // 例如「他（看着天色，眉头微蹙）：说了一句。」是纯旁白，不该报说话人未声明。
        const isDialogue = !dm || dm[2].trim().length <= 6;
        if (isDialogue) {
          issues.push(issue('warning', 'W103', rec.line,
            `说话人「${who}」未在角色表中声明。`,
            '若这是错别字请改正；若确实要临时出场，也建议在角色表里补上。'));
        }
      }
      continue;
    }
  }

  if (!scan.sawScene) {
    issues.push(issue('warning', 'W107', 1,
      '全文没有任何场景指示，开场会被强行补成「教室 · 黄昏 · 中景」。',
      '请在开头加一行【场景：教室 | 黄昏 | 远景】。'));
  }
  if (!scan.sawEnd) {
    issues.push(issue('warning', 'W108', scan.lines.length ? scan.lines[scan.lines.length - 1].line : 1,
      '结尾没有显式的【结束】，引擎会自动补一个收尾。',
      '建议在末尾写一行【结束】。'));
  }
  return issues;
}

/**
 * 校验一段剧本文本。
 * 返回：{ issues, summary: { errors, warnings }, scan }；scan 供后续规则复用，避免重复扫描。
 */
export function lintText(text, fileName = '') {
  const scan = scanText(text);
  const issues = applyTextRules(scan);
  return {
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
    scan,
  };
}

/**
 * 校验一个剧本对象。
 * 有原文（文本剧本）走文本扫描；JSON 剧本本期不校验（无行号），返回空结果。
 */
export function lintScript(script, source, fileName = '') {
  if (source) return lintText(source, fileName || (script && script.title) || '');
  return { issues: [], summary: { errors: 0, warnings: 0 } };
}

/** 校验全部内置剧本（15 章），作为回归基线。 */
export function lintBuiltin() {
  const issues = [];
  for (const s of loadBuiltinScripts()) {
    const r = lintText(s.source || '', s.title || '');
    for (const it of r.issues) issues.push({ ...it, file: s.title });
  }
  return {
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
  };
}
