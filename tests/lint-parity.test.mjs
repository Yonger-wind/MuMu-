/* ============================================================
   差分用例：校验器的控制流模型 vs scripts/parser.js 的节点模型
   ------------------------------------------------------------
   为什么要有这份用例：
   校验器的「不可达」是行级规则算出来的，而解析器是先把内容编译成节点、
   再由引擎按节点跑；两套模型一旦漂移，就会对合法剧本报 error 级假 E106。
   内置 15 章语料抓不到这种漂移（它们写得太规矩），所以这里用确定性伪随机
   生成一大批短剧本，逐份对比：

     解析器判定可达的节点，校验器不得报 E106 说它不可达。

   只锁「假报」这一个方向（反向不要求：校验器漏报不算违约）。
   生成器被设计成**不会产出解析器无法解析的脚本**，所以这里不用 try/catch 跳过
   —— 一旦解析失败，用例直接红，避免跳过逻辑把问题掩盖掉。
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScriptText } from '../scripts/parser.js';
import { lintText } from '../tools/lint.js';

/** 确定性伪随机（mulberry32）：固定种子，不用 Math.random() */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];

/** 场景 / 镜头 / 姿态 / 动作 / 视角都只用解析器一定认识的值，保证脚本一定能解析 */
const SCENES = [
  '【场景：教室 | 黄昏 | 远景】',
  '【场景：操场 | 夜晚 | 中景】',
  '【场景：书房 | 白天 | 近景】',
];
const CAMS = ['【镜头：特写】', '【镜头：近景】', '【镜头：中景】'];
const POSES = ['【姿态：甲|难过】', '【姿态：乙|开心】', '【姿态：*|自然】'];
const EMOTIONS = ['【情绪：平静】', '【情绪：害羞】'];
const ACTIONS = ['【动作：甲|坐下】', '【动作：乙|转身】'];
const VIEWS = ['【视角：过肩】', '【机位：背影】'];
const ENTERS = ['【出场：甲|乙】', '【出场：甲】'];

/**
 * 生成一份随机剧本。
 * 返回 { source, lines, nodeLines, choiceLines, kinds }：
 * - lines        原始行数组（下标 0 = 第 1 行）
 * - nodeLines    会（或会参与）产生节点的行号，与解析器的 nodes 一一对应
 *                —— 选项行特殊：解析器把整组选项压成**一个** choice 节点
 * - choiceLines  选项行行号（用于把 choice 节点还原到它的选项行）
 * - kinds        这份脚本里出现过的行类型（用于断言语料覆盖）
 */
function generate(rnd, index) {
  const lines = [];
  const nodeLines = [];
  const choiceLines = [];
  const kinds = new Set();
  const labels = [];

  const push = (text, kind) => {
    lines.push(text);
    const no = lines.length;
    if (kind === 'choice') choiceLines.push(no);
    if (kind && kind !== 'label' && kind !== 'none' && kind !== 'charRow' && kind !== 'meta') {
      nodeLines.push(no);
    }
    if (kind) kinds.add(kind);
    return no;
  };
  const pushLabel = (name) => {
    push(`[${name}]`, 'label');
    labels.push(name);
  };

  // 头部：元信息 + 角色表（都不产生节点），偶尔插一行简介和空行
  push(`标题：随机剧本 ${index}`, 'meta');
  push('角色：', 'none');
  push('甲 | 男 | 短发 | 白 | 少年', 'charRow');
  push('乙 | 女 | 长发 | 白 | 少女', 'charRow');
  if (rnd() < 0.4) push(`简介：第 ${index} 号随机剧本。`, 'meta');
  push('', 'none');

  // 第一个节点必须是场景：解析器在「首节点不是场景」时会补一个开场场景，
  // 那会让节点与行号错位，也就测不出漂移了。
  push(pick(rnd, SCENES), 'scene');
  push('甲：开场的一句台词。', 'say');

  const steps = 6 + Math.floor(rnd() * 10);
  for (let s = 0; s < steps; s++) {
    const r = rnd();
    if (r < 0.22) {
      push(`${pick(rnd, ['甲', '乙'])}：第 ${lines.length + 1} 行的一句台词。`, 'say');
    } else if (r < 0.32) {
      push(`窗外有风，第 ${lines.length + 1} 行。`, 'narration');
    } else if (r < 0.40) {
      push(pick(rnd, POSES), 'pose');
    } else if (r < 0.46) {
      push(pick(rnd, EMOTIONS), 'emotion');
    } else if (r < 0.52) {
      push(pick(rnd, ACTIONS), 'action');
    } else if (r < 0.58) {
      push(pick(rnd, VIEWS), 'view');
    } else if (r < 0.63) {
      push(pick(rnd, CAMS), 'cam');
    } else if (r < 0.67) {
      push(pick(rnd, SCENES), 'scene');
    } else if (r < 0.71) {
      push(pick(rnd, ENTERS), 'enter');
    } else if (r < 0.75) {
      push('【清场】', 'clear');
    } else if (r < 0.80) {
      push('【结束】', 'end');
    } else if (r < 0.87) {
      pushLabel(`L${index}_${s}`);
    } else {
      // 跳转 / 选项组：落点只挑已经声明过的标签，保证解析器一定认
      if (!labels.length) pushLabel(`L${index}_${s}`);
      const target = pick(rnd, labels);
      if (r < 0.94) {
        push(`-> ${target}`, 'jump');
      } else {
        const n = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) {
          push(`> 第 ${lines.length + 1} 行的选项 -> ${pick(rnd, labels)}`, 'choice');
        }
      }
    }
    if (rnd() < 0.15) push('', 'none');
  }

  // 结尾固定【结束】：解析器在末节点不是 end 时会自己补一个 end 节点，
  // 那会多出一个没有源行的节点，破坏「节点 ↔ 源行」的对应。
  push('【结束】', 'end');

  return { source: lines.join('\n'), lines, nodeLines, choiceLines, kinds };
}

/**
 * 解析器节点下标 -> 源行号（数组，choice 节点对应它的全部选项行）。
 *
 * 依据：非选项的节点行与解析器的非 choice 节点**一一对应且同序**；
 * choice 节点按源行顺序依次吃掉它 options.length 条选项行。
 * 两端都会断言，生成器和解析器任何一方漂移都会当场红。
 */
function mapNodeLines(script, gen) {
  const choiceSet = new Set(gen.choiceLines);
  const plain = gen.nodeLines.filter((l) => !choiceSet.has(l));
  const map = new Array(script.nodes.length);
  let p = 0;
  let c = 0;
  for (let i = 0; i < script.nodes.length; i++) {
    const n = script.nodes[i];
    if (n.t === 'choice') {
      const ls = gen.choiceLines.slice(c, c + n.options.length);
      assert.equal(ls.length, n.options.length,
        '生成器登记的选项行数少于解析器压出来的选项数');
      for (const l of ls) {
        assert.ok(String(gen.lines[l - 1]).startsWith('>'),
          `第 ${l} 行应该是选项行，实际是「${gen.lines[l - 1]}」`);
      }
      c += n.options.length;
      map[i] = ls;
    } else {
      const l = plain[p];
      assert.ok(l !== undefined,
        `解析器多产出了一个节点（第 ${i} 个是 ${n.t}），生成器没有对应的节点行`);
      p += 1;
      map[i] = [l];
    }
  }
  assert.equal(p, plain.length, '生成器登记的节点行数多于解析器产出的节点数');
  assert.equal(c, gen.choiceLines.length, '选项行总数与解析器压出来的选项总数不一致');
  return map;
}

/** 与 scripts/engine.js 的 run() 同一口径：从节点 0 出发，遇到 end 停 */
function reachableNodeIndexes(script) {
  const seen = new Set();
  const stack = [0];
  while (stack.length) {
    const i = stack.pop();
    if (!Number.isInteger(i) || i < 0 || i >= script.nodes.length || seen.has(i)) continue;
    seen.add(i);
    const n = script.nodes[i];
    if (n.t === 'end') continue;
    if (n.t === 'jump') {
      stack.push(script.labels[n.to]);
      continue;
    }
    if (n.t === 'choice') {
      for (const o of n.options) stack.push(script.labels[o.to]);
      continue;
    }
    stack.push(i + 1);
  }
  return seen;
}

const REQUIRED_KINDS = [
  'say', 'narration', 'pose', 'emotion', 'action', 'view', 'cam',
  'scene', 'enter', 'clear', 'label', 'jump', 'choice', 'end',
];

test('差分：解析器判定可达的节点，校验器不得报 E106（假报方向）', () => {
  const COUNT = 2475;
  const gen = rng(0x5EED2026);
  const seenKinds = new Set();
  let e106 = 0;
  let reachableNodes = 0;

  for (let i = 0; i < COUNT; i++) {
    const g = generate(gen, i);
    for (const k of g.kinds) seenKinds.add(k);

    // 生成器不应产出解析不了的脚本：解析失败直接红，不跳过
    let script;
    try {
      script = parseScriptText(g.source, `gen-${i}.txt`);
    } catch (e) {
      assert.fail(`第 ${i} 份随机剧本解析失败（生成器不应产出这种脚本）：${e.message}\n${g.source}`);
    }

    const map = mapNodeLines(script, g);
    const reach = reachableNodeIndexes(script);
    reachableNodes += reach.size;
    const reachableLines = new Set();
    for (const idx of reach) {
      for (const line of map[idx]) reachableLines.add(line);
    }

    const r = lintText(g.source, `gen-${i}.txt`);
    const falsePositives = r.issues
      .filter((it) => it.code === 'E106' && reachableLines.has(it.line));
    assert.deepEqual(falsePositives.map((it) => `${it.code}@${it.line}`), [],
      `第 ${i} 份随机剧本：校验器把解析器可达的节点报成了不可达\n${g.source}`);
    e106 += r.issues.filter((it) => it.code === 'E106').length;
  }

  // 语料覆盖：上面那些行类型必须真的都生成过，否则这条差分用例是空转
  assert.deepEqual(REQUIRED_KINDS.filter((k) => !seenKinds.has(k)), [],
    '随机语料没有覆盖这些行类型');
  // 差分不是空转：语料里必须真的产出过可达节点，也必须真的报出过 E106
  assert.ok(reachableNodes > 0, '随机语料里没有任何可达节点');
  assert.ok(e106 > 0, '随机语料里一次 E106 都没报——差分用例没真正验证到不可达判定');
});
