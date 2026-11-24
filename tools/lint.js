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
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
      // 只有「场景/分镜」且带值、并且解析器真的认领这一行，才算真正的场景指示：
      // 【场景】（缺值）解析器不认，会退化成旁白，不能用来抑制 W107。
      if ((key === '场景' || key === '分镜') && value && parserDirBranch(t)) sawScene = true;
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
  // 注意：这只是行级的粗略落点，供文本级规则参考；
  // 控制流判定（可达性 / 回跳 / 回指）一律用 buildGraph 复刻的**节点下标**，
  // 因为解析器延迟 push 选项组，标签的真实落点常常不等于「后第一个故事行」。
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
      // 兜底：扫描器认得的写法，解析器未必认得（例如冒号前多了一个空格）。
      // 解析器不认领的行会整行变成旁白，作者看不到任何提示 —— 这正是 E101 要拦的。
      if (!parserDirBranch(rec.text)) {
        issues.push(issue('error', 'E101', rec.line,
          `舞台指示「${rec.text}」的写法解析器不认，它会被当成旁白。`,
          '请检查冒号前是否多了空格（解析器不容许），以及全角 / 半角标点。'));
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
      // 「->」后面没有落点：解析器的跳转正则匹配不上，整行按旁白处理（不是跳转，也没有落点可查）
      if (!rec.value) {
        issues.push(issue('error', 'E105', rec.line,
          '跳转行缺少落点，这一行会被当成旁白，跳转不会发生。',
          '正确写法：-> 目标标签'));
        continue;
      }
      if (!labels.has(rec.value)) {
        issues.push(issue('error', 'E103', rec.line,
          `跳转指向了不存在的标签「${rec.value}」。`,
          `请检查 [${rec.value}] 是否已定义。`));
      }
      continue;
    }

    if (rec.kind === 'say') {
      // 与解析器的两种台词形态对齐：「名字（情绪）：内容」与「名字：内容」
      // 冒号后必须有内容（解析器的 /^…[:：]\s*(.+)$/），「小葵：」整行按旁白处理。
      const dm = rec.text.match(/^([^\s:：【】\[\]>]{1,8})[（(]([^)）]{1,40})[)）][:：]\s*(.+)$/);
      const dm2 = dm ? null : rec.text.match(/^([^\s:：【】\[\]>]{1,8})[:：]\s*(.+)$/);
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
 * 舞台指示落到解析器的哪个分支。
 *
 * 这里**复刻** scripts/parser.js 的 if 链与正则（解析器本身零改动，只读引用）：
 * 顺序、正则都必须与解析器一致，否则「这一行解析器会当成什么」就会算错。
 * - flush：该分支会不会调用 flushChoices()，即把待定选项组压成一个节点。
 *   姿态 / 情绪 / 动作 / 视角 / 机位**不 flush** —— 所以它们排在那组选项**之前**入队。
 * - 返回 null：解析器没有分支认领这一行（缺值、写法不对、未知标签）→ 整行退化成旁白。
 */
const PARSER_DIR_BRANCHES = [
  { type: 'scene',  flush: true,  re: /^【\s*(?:场景|分镜)[:：]\s*(.+?)\s*】$/ },
  { type: 'cam',    flush: true,  re: /^【\s*镜头[:：]\s*(.+?)\s*】$/ },
  { type: 'pose',   flush: false, re: /^【\s*(?:姿态|情绪)[:：]\s*(.+?)\s*】$/ },
  { type: 'action', flush: false, re: /^【\s*动作[:：]\s*(.+?)\s*】$/ },
  { type: 'view',   flush: false, re: /^【\s*(?:视角|机位)[:：]\s*(.+?)\s*】$/ },
  { type: 'enter',  flush: true,  re: /^【\s*(?:出场|登场)[:：]\s*(.+?)\s*】$/ },
  { type: 'clear',  flush: true,  re: /^【\s*(?:清场|空场|无人)\s*】$/ },
  { type: 'end',    flush: true,  re: /^【\s*(?:结束|完)\s*(?:[:：]\s*(.+?)\s*)?】$/ },
];

function parserDirBranch(text) {
  for (const b of PARSER_DIR_BRANCHES) {
    if (b.re.test(text)) return b;
  }
  return null;
}

/**
 * 控制流建图（**节点级**，逐条对齐 scripts/parser.js 的入队顺序）。
 *
 * 解析器不是「一行一个节点」：选项行只往 pendingChoices 里塞，
 * 只有遇到 flush 点（场景 / 镜头 / 出场 / 清场 / 结束 / 标签 / 跳转 / 台词 / 旁白）
 * 才把整组选项压成**一个** choice 节点；而姿态 / 情绪 / 动作 / 视角 / 机位
 * 既不 flush、也不等选项组，它们**立即**入队，所以排在那组选项**之前**。
 * 行号相邻 ≠ 节点相邻，这正是旧实现会误报 E106 的原因。
 *
 * 节点序列建好后，可达性与标签落点全部按**节点下标**推导：
 * - 标签落点 = 解析器的 labels[name] = nodes.length（此刻已入队的节点数，
 *   即「下一个将要入队的节点的下标」）。解析器 finalize() 补开场场景时会把
 *   所有标签下标统一 +1，那是整体平移：本工具在建图时既不补开场场景、也不对
 *   标签做任何平移，标签与后继全都用同一套下标，相对关系自然一致。
 * - 后继：普通节点 → 下一个节点；跳转节点 → 目标节点；选项组 → 各选项落点；
 *   【结束】/【完】 → 无后继。
 *
 * 报告口径：issue 的 line 一律是**原始文本行号**，不是节点下标。
 */
function buildGraph(scan) {
  const nodes = [];              // 与解析器 nodes 一一对应
  const labelIndex = new Map();  // 标签名 -> 节点下标（解析器 labels[name] = nodes.length）
  let pending = null;            // 待定选项组（解析器 pendingChoices）

  // flush 点：把待定选项组压成**一个** choice 节点入队
  const flush = () => {
    if (pending && pending.options.length) {
      nodes.push({
        type: 'choice',
        line: pending.options[0].line,                    // 组内第一行（报告用）
        lines: pending.options.map((o) => o.line),        // 组内所有行（区间文案用）
        options: pending.options,
      });
    }
    pending = null;
  };

  for (const rec of scan.lines) {
    // meta / charRow：解析器直接 continue —— 既不入队也不 flush
    if (rec.kind === 'meta' || rec.kind === 'charRow') continue;

    // 标签：先 flush 掉待定选项组，再记「此刻已入队的节点数」
    if (rec.kind === 'label') {
      flush();
      labelIndex.set(rec.name, nodes.length);
      continue;
    }

    // 选项行：只挂进待定选项组，不入队
    if (rec.kind === 'choice' && rec.value !== null) {
      if (!pending) pending = { options: [] };
      pending.options.push({ text: rec.name, to: rec.value, line: rec.line });
      continue;
    }

    // 跳转行：flush + jump 节点（没有落点的「->」解析器按旁白处理，落到下面的旁白分支）
    if (rec.kind === 'jump' && rec.value) {
      flush();
      nodes.push({ type: 'jump', line: rec.line, to: rec.value });
      continue;
    }

    // 舞台指示：认得出来的分支决定 flush 与节点类型
    if (rec.kind === 'dir') {
      const br = parserDirBranch(rec.text);
      if (br) {
        if (br.flush) flush();
        nodes.push({ type: br.type, line: rec.line });
        continue;
      }
      // 认不出来的写法（缺值 / 带值 / 未知标签）：整行退化成旁白
    }

    // 其余（台词 / 旁白 / 缺落点的选项行 / 缺落点的跳转行 / 认不出的指示写法）
    // 解析器一律按旁白处理：flush 掉待定选项组，再压一个 say 节点。
    flush();
    nodes.push({ type: 'say', line: rec.line });
  }
  flush();

  // 标签 -> 节点下标；标签后面没有任何节点时是悬空标签（跳过去就到此为止）
  const target = (name) => {
    if (!labelIndex.has(name)) return -1;
    const i = labelIndex.get(name);
    return i < nodes.length ? i : -1;
  };

  // 后继：按节点下标相邻推导
  const succ = nodes.map((n, i) => {
    if (n.type === 'end') return [];
    if (n.type === 'jump') {
      const t = target(n.to);
      return t < 0 ? [] : [t];
    }
    if (n.type === 'choice') {
      const out = [];
      for (const o of n.options) {
        const t = target(o.to);
        if (t >= 0) out.push(t);
      }
      return out;
    }
    return i + 1 < nodes.length ? [i + 1] : [];
  });

  // 可达性：从第一个节点出发（引擎就是从 nodes[0] 开始跑的）
  const reachable = new Array(nodes.length).fill(false);
  if (nodes.length) {
    const stack = [0];
    while (stack.length) {
      const i = stack.pop();
      if (reachable[i]) continue;
      reachable[i] = true;
      for (const nx of succ[i]) stack.push(nx);
    }
  }

  return {
    nodes,
    labelIndex,
    succ,
    reachable,
    hasSay: nodes.some((n) => n.type === 'say'),
  };
}

/**
 * 4 条控制流规则：E106 不可达、E107 回跳、E108 选项回指、W106 死标签。
 *
 * 判定一律基于 buildGraph 复刻出来的**节点序列**（不是行相邻），
 * 报告的 line 一律是原始文本行号。
 *
 * E106（不可达）只在「控制流图完整」时判定：
 * 只要有跳转 / 选项指向不存在的标签，解析器就会拒绝整个剧本，文件根本加载不了，
 * 这时说「某段玩家永远走不到」是误导 —— 那种剧本该看的是 E103。
 *
 * 关于「断链就整份文件放弃不可达判定」：**这是本工具自己的判断，不是解析器的语义**
 * （解析器只管拒绝加载，不谈可达性）。代价：一处笔误 = 该文件失去不可达检测。
 * 规则文档里怎么表述留给 Task 5。
 */
function applyFlowRules(scan) {
  const issues = [];
  const g = buildGraph(scan);
  const refs = new Set();
  let brokenRef = false;
  for (const rec of scan.lines) {
    if (rec.kind === 'jump' && rec.value) {
      refs.add(rec.value);
      if (!g.labelIndex.has(rec.value)) brokenRef = true;
    }
    if (rec.kind === 'choice' && rec.value) {
      refs.add(rec.value);
      if (!g.labelIndex.has(rec.value)) brokenRef = true;
    }
  }

  // E106 不可达内容：按**节点**切成连续段，每段一条 issue
  // （两处互不相邻的死分支要分成两条报，不能合并成一个大区间）
  if (!brokenRef) {
    const runs = [];
    let cur = null;
    for (let i = 0; i < g.nodes.length; i++) {
      if (g.reachable[i]) { cur = null; continue; }
      if (!cur) { cur = { lines: [] }; runs.push(cur); }
      const n = g.nodes[i];
      for (const l of (n.lines || [n.line])) cur.lines.push(l);
    }
    for (const run of runs) {
      // 节点顺序 ≠ 源行序：选项组延迟 push，姿态 / 动作 / 视角类指示会插到它前面。
      // 列举与 it.line 都按**源行号**升序，否则文案会出现「第 13、12、14 行」这种倒序。
      const ls = run.lines.slice().sort((a, b) => a - b);
      const first = ls[0];
      // 行号区间只覆盖真正不可达的行：中间夹着标签行 / meta 行时不并成一个区间
      let contiguous = true;
      for (let i = 1; i < ls.length; i++) {
        if (ls[i] !== ls[i - 1] + 1) { contiguous = false; break; }
      }
      const scope = ls.length === 1
        ? `第 ${first} 行`
        : (contiguous ? `第 ${ls[0]}–${ls[ls.length - 1]} 行` : `第 ${ls.join('、')} 行`);
      issues.push(issue('error', 'E106', first,
        `${scope}这一段玩家永远走不到。`,
        '检查附近的跳转：某个 -> 之后的内容不再顺序执行。'));
    }
  }

  // E107 回跳 / E108 选项回指（都按节点下标比较：下标即执行顺序）
  for (let i = 0; i < g.nodes.length; i++) {
    const n = g.nodes[i];
    if (n.type === 'jump') {
      const t = g.labelIndex.get(n.to);
      if (t !== undefined && t < g.nodes.length && t <= i) {
        const back = g.nodes[t];
        issues.push(issue('error', 'E107', n.line,
          `第 ${n.line} 行跳回第 ${back.line} 行的标签「${n.to}」，会往回跳，容易形成死循环。`,
          '请改成跳向更靠后的标签。'));
      }
      continue;
    }
    if (n.type === 'choice') {
      for (const o of n.options) {
        const t = g.labelIndex.get(o.to);
        if (t !== undefined && t < g.nodes.length && t <= i) {
          const back = g.nodes[t];
          issues.push(issue('error', 'E108', o.line,
            `第 ${o.line} 行的选项指向第 ${back.line} 行的标签「${o.to}」，落点不在选项之后，点下去会原地打转。`,
            '请改成跳向更靠后的标签。'));
        }
      }
      continue;
    }
  }

  // W106 死标签（同名标签可能重复定义，只按第一次定义的行报一次）
  const seenDead = new Set();
  for (const lab of scan.labels) {
    if (refs.has(lab.name) || seenDead.has(lab.name)) continue;
    seenDead.add(lab.name);
    issues.push(issue('warning', 'W106', lab.line,
      `标签「${lab.name}」从未被引用。`,
      '如果这是废弃的分支，请把标签和它下面的内容一起删掉。'));
  }
  // brokenRef / hasSay 交给解析器交叉验证用（去重依据是我们自己算出的事实）
  return { issues, brokenRef, hasSay: g.hasSay };
}

/**
 * 解析器交叉验证：把 parseScriptText 抛出的致命错误兜底成 E100。
 * E100 是「兜底」——扫描器已经报过的、更精确的问题不再重复报一遍。
 *
 * 去重依据是**我们自己算出的事实**（flow.brokenRef / flow.hasSay），
 * 不是解析器的错误文案 —— 解析器一改文案，去重不能跟着失效。
 */
function applyParserCheck(text, fileName, issues, flow) {
  try {
    parseScriptText(text, fileName);
    return;
  } catch (e) {
    const msg = String((e && e.message) || e);
    const m = msg.match(/第\s*(\d+)\s*行/);
    if (m) {
      // 带行号的错误来自解析阶段（例如未识别的场景）
      const line = Number(m[1]);
      // 该行已经有更具体的 error 报告时不重复报
      if (issues.some((i) => i.line === line && i.severity === 'error')) return;
      issues.push(issue('error', 'E100', line,
        `解析器拒绝了这个剧本：${msg}`,
        '按提示修正后重新校验。'));
      return;
    }
    // 不带行号的错误只可能来自解析器的收尾阶段：
    // 「没有读取到任何台词或旁白」或「跳转指向了不存在的标签」。
    // 后者由我们自己算出的 brokenRef 判定（有跳转/选项指向不存在的标签），
    // 而 finalize 里「没有台词」的检查排在前面 —— 所以只有 brokenRef 且确实有台词时，
    // 解析器才一定是死在落点缺失上；E103 已经带行号报过一次，不重复报。
    if (flow && flow.brokenRef && flow.hasSay) return;
    issues.push(issue('error', 'E100', 1,
      `解析器拒绝了这个剧本：${msg}`,
      '按提示修正后重新校验。'));
  }
}

/**
 * 校验一段剧本文本。
 * 返回：{ issues, summary: { errors, warnings }, scan }；scan 供后续规则复用，避免重复扫描。
 */
export function lintText(text, fileName = '') {
  const scan = scanText(text);
  const flow = applyFlowRules(scan);
  const issues = applyTextRules(scan).concat(flow.issues);
  applyParserCheck(text, fileName, issues, flow);
  // 报告一律按原文行号升序：两条规则链混在一起时顺序不可预测，
  // 读者（以及 --json 的消费者）都不该看到「第 6 行」排在「第 5 行」前面。
  issues.sort((a, b) => a.line - b.line);
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
  const scripts = loadBuiltinScripts();
  // 《月光下的未完奏鸣》第 2–4 章标题相同：同名的章在 issue 的 file 上补章号，
  // 否则文本模式会把它们的 issue 挤进同一个标题分组。
  const titleCount = new Map();
  for (const s of scripts) titleCount.set(s.title, (titleCount.get(s.title) || 0) + 1);
  const issues = [];
  // files 与 issues[].file 用同一个 label：--json 的 files 必须能和 issue 的 file 对上。
  const files = [];
  for (const s of scripts) {
    const label = titleCount.get(s.title) > 1 ? `${s.title}（第 ${s.chapterNo} 章）` : s.title;
    files.push(label);
    const r = lintText(s.source || '', s.title || '');
    for (const it of r.issues) issues.push({ ...it, file: label });
  }
  return {
    issues,
    files,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
  };
}

/* ---------------- CLI ---------------- */

const USAGE = '用法：node tools/lint.js <文件...> | --builtin [--json] [--strict]';

/**
 * 文本输出：按校验目标分组，逐条列出「第 X 行  E101 原因」与提示。
 * scope 是汇总括号与人话里用的作用域（「内置 15 章」「2 个文件」「内置 15 章 + 1 个文件」）。
 * 多目标时干净的文件也要列出来，否则「混着校验」看不出那份到底有没有被检查。
 */
function formatText(result, files, scope) {
  const lines = [];
  const s = result.summary;
  if (!result.issues.length) {
    lines.push(`通过：${scope} 未发现问题。`);
    return lines.join('\n');
  }
  const byFile = new Map();
  // files 是被校验的**用户目标**；内置章节的分组只从 issue 自带的 file（章节标题）生成，
  // 合成标签「内置 15 章」不得参与分组（否则内置真有错时会多出一行「（未发现问题）」）。
  for (const f of files) byFile.set(f, []);
  for (const it of result.issues) {
    const key = it.file || '(未命名)';
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(it);
  }
  for (const [file, list] of byFile) {
    if (!list.length) {
      lines.push(`${file}（未发现问题）`);
      continue;
    }
    lines.push(file);
    for (const it of list) {
      lines.push(`  第 ${it.line} 行  ${it.code} ${it.message}`);
      if (it.hint) lines.push(`      提示：${it.hint}`);
    }
  }
  lines.push(`共 ${s.errors} 个错误，${s.warnings} 个警告（${scope}）。`);
  return lines.join('\n');
}

/** JSON 输出：{ ok, files, issues, summary }，stdout 必须是纯 JSON；ok 与退出码同义。 */
function formatJson(result, files, ok) {
  return JSON.stringify({
    ok,
    files,
    issues: result.issues,
    summary: result.summary,
  }, null, 2);
}

/**
 * CLI 入口。返回退出码：0 通过 / 1 有 error（--strict 下 warning 也算）/ 2 用法错误。
 * argv 为 process.argv（含 node 与脚本路径）。
 */
export function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const strict = args.includes('--strict');
  const wantBuiltin = args.includes('--builtin');
  const targets = args.filter((a) => !a.startsWith('--'));
  const unknown = args.filter((a) => a.startsWith('--') && !['--json', '--strict', '--builtin'].includes(a));
  if (unknown.length) {
    console.error(`未知参数：${unknown.join(' ')}\n${USAGE}`);
    return 2;
  }
  if (!wantBuiltin && !targets.length) {
    console.error(USAGE);
    return 2;
  }

  // 先把目标文件读进来并做格式分流：JSON 剧本是节点格式，行级扫描会把
  // 整份 JSON 拆成满屏假 issue，所以直接拒绝，而不是给出误导性报告。
  const sources = [];
  for (const f of targets) {
    if (!existsSync(f)) {
      console.error(`文件不存在：${f}`);
      return 2;
    }
    let text;
    try {
      const st = statSync(f);
      if (!st.isFile()) throw Object.assign(new Error('目录'), { code: 'EISDIR' });
      text = readFileSync(f, 'utf8');
    } catch (err) {
      // 目录 / EACCES / EPERM 等都要落到中文提示 + 退出码 2，不能抛英文堆栈。
      // EISDIR 直接写「目录」，避免把 node 的错误码当成用户可见文案。
      const reason = err && err.code === 'EISDIR'
        ? '目录'
        : (err && err.code ? err.code : '读取失败');
      console.error(`不是可校验的剧本文件：${f}（${reason}）`);
      return 2;
    }
    if (/\.json$/i.test(f) || text.trim().startsWith('{')) {
      console.error(`JSON 格式剧本暂不支持内容校验，请改用 .txt / .md：${f}`);
      return 2;
    }
    sources.push({ file: f, text });
  }

  const issues = [];
  const files = [];
  let builtinChapters = 0;
  if (wantBuiltin) {
    const r = lintBuiltin();
    issues.push(...r.issues);
    files.push(...r.files);
    builtinChapters = r.files.length;
  }
  for (const { file, text } of sources) {
    const r = lintText(text, file);
    issues.push(...r.issues.map((i) => ({ ...i, file })));
    files.push(file);
  }

  const result = {
    issues,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
  };
  const scope = [
    wantBuiltin ? `内置 ${builtinChapters} 章` : null,
    targets.length ? `${targets.length} 个文件` : null,
  ].filter(Boolean).join(' + ');
  const failed = result.summary.errors > 0 || (strict && result.summary.warnings > 0);
  // 诊断一律走 stderr；stdout 只留最终结果（--json 时必须是纯 JSON）。
  console.log(json
    ? formatJson(result, files, !failed)
    : formatText(result, targets, scope));
  return failed ? 1 : 0;
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
// 用 exitCode 而不是 process.exit()：Windows 管道下大输出可能被截断。
if (isMain) process.exitCode = main(process.argv);
