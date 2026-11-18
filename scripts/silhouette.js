/* ============================================================
   暮幕 · 极简氛围剪影人物系统（Minimalist Atmospheric Silhouette）
   分层管理：体型规格 / 骨骼姿态 / 轮廓路径 / 光影融合 / 动作动画
   轻量 2D（Path2D + 渐变），无第三方依赖
   ------------------------------------------------------------
   设计原则：
   - 人物以深色剪影为主体，不画五官，不强调发型与服装细节
   - 自然人体比例（约 7.2 头身），轮廓全部由曲线构成，拒绝僵硬几何形
   - 角色之间只靠身高、体态、站姿与轮廓差异区分，不赋予具体外貌
   - 依据背景光源添加边缘光与落地阴影，让人物“站进”场景而非贴在背景上
   ============================================================ */

/* ---------- 色彩 / 随机工具 ---------- */
function rgb(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t, alpha = 1) {
  const A = rgb(a), B = rgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))));
  return alpha >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}
export function hexA(hex, a) { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

function hash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 路径工具（统一顺时针绕向，保证并集填充无空洞） ---------- */
const K = 0.5523;
function shoelace(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}
function ensureCW(pts) { return shoelace(pts) > 0 ? pts : pts.slice().reverse(); }

/** 平滑闭合曲线：穿过各边中点、以顶点为控制点，得到自然柔和的轮廓 */
function smoothClosed(P, pts) {
  const q = ensureCW(pts);
  const n = q.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(q[n - 1], q[0]);
  P.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const cur = q[i], nxt = q[(i + 1) % n], m = mid(cur, nxt);
    P.quadraticCurveTo(cur[0], cur[1], m[0], m[1]);
  }
  P.closePath();
}

function ell(P, cx, cy, rx, ry, rot = 0) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const T = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
  const seg = [
    [rx, 0, rx * K, -ry, rx, -ry * K],
    [0, ry, rx, ry * K, rx * K, ry],
    [-rx, 0, -rx * K, ry, -rx, ry * K],
    [0, -ry, -rx, -ry * K, -rx * K, -ry],
  ];
  const [sx, sy] = T(0, -ry);
  P.moveTo(sx, sy);
  for (const [ex, ey, a, b, d, e] of seg) {
    const [X, Y] = T(ex, ey), [A, B] = T(a, b), [C, D] = T(d, e);
    P.bezierCurveTo(A, B, C, D, X, Y);
  }
  P.closePath();
}

/** 锥形胶囊：肢体、脖颈、发束的基本构件 */
function capsule(P, a, b, ra, rb) {
  const th = Math.atan2(b.y - a.y, b.x - a.x);
  let perp = th + Math.PI / 2;
  const px0 = Math.cos(perp), py0 = Math.sin(perp);
  const q = [
    [a.x + px0 * ra, a.y + py0 * ra],
    [b.x + px0 * rb, b.y + py0 * rb],
    [b.x - px0 * rb, b.y - py0 * rb],
    [a.x - px0 * ra, a.y - py0 * ra],
  ];
  if (shoelace(q) < 0) perp += Math.PI;
  const px = Math.cos(perp), py = Math.sin(perp);
  P.moveTo(a.x + px * ra, a.y + py * ra);
  P.lineTo(b.x + px * rb, b.y + py * rb);
  P.arc(b.x, b.y, rb, perp, perp + Math.PI, false);
  P.lineTo(a.x - px * ra, a.y - py * ra);
  P.arc(a.x, a.y, ra, perp + Math.PI, perp + Math.PI * 2, false);
  P.closePath();
}

/* ============================================================
   一、体型规格：自然人体比例（身高 = 1，脚底 y = 0，y 轴向上）
   ============================================================ */
const HEAD = { top: 1.0, chin: 0.861, center: 0.9305, rx: 0.056, ry: 0.0695 };
const BODY = { neck: 0.842, shoulder: 0.806, chest: 0.735, waist: 0.652, hip: 0.575, knee: 0.29, ankle: 0.03 };

export const BUILDS = {
  slim:     { sh: 0.086, hip: 0.070, waist: 0.054, limb: 0.86 },
  standard: { sh: 0.096, hip: 0.078, waist: 0.060, limb: 1.0 },
  broad:    { sh: 0.110, hip: 0.086, waist: 0.068, limb: 1.14 },
};
export const HAIR_IDS = ['crop', 'short', 'bob', 'long', 'bun', 'ponytail', 'wave'];
export const GARMENT_IDS = ['trousers', 'coat', 'shorts', 'robe', 'dress'];

/* ============================================================
   二、姿态：情绪由身体语言表达（剪影没有五官）
   armL/armR = { out 上臂外展, bend 肘弯, fwd 前摆 }（弧度）
   ============================================================ */
export const POSES = {
  neutral:   { label: '自然', lean: 0,     pitch: 0,     tilt: 0,    drop: 0,     shrink: 0,
               armL: { out: 0.15, bend: 0.16, fwd: 0.04 }, armR: { out: 0.15, bend: 0.16, fwd: 0.04 } },
  happy:     { label: '开心', lean: 0.022, pitch: -0.06, tilt: -0.04, drop: -0.012, shrink: 0, lift: 0.008,
               armL: { out: 0.24, bend: 0.55, fwd: 0.20 }, armR: { out: 0.24, bend: 0.55, fwd: 0.20 } },
  sad:       { label: '难过', lean: 0.055, pitch: 0.17,  tilt: 0.03,  drop: 0.036, shrink: 0.012,
               armL: { out: 0.08, bend: 0.26, fwd: 0.16 }, armR: { out: 0.08, bend: 0.26, fwd: 0.16 } },
  angry:     { label: '生气', lean: 0.048, pitch: 0.04,  tilt: 0.012, drop: -0.016, shrink: 0,
               armL: { out: 0.36, bend: 1.0, fwd: 0.10 }, armR: { out: 0.36, bend: 1.0, fwd: 0.10 } },
  surprised: { label: '惊讶', lean: -0.05, pitch: -0.10, tilt: 0,     drop: -0.03, shrink: -0.006,
               armL: { out: 0.44, bend: 0.8, fwd: -0.06 }, armR: { out: 0.44, bend: 0.8, fwd: -0.06 } },
  shy:       { label: '害羞', lean: 0.035, pitch: 0.10,  tilt: 0.07,  drop: 0.02,  shrink: 0.02,
               armL: { out: 0.09, bend: 1.15, fwd: 0.36 }, armR: { out: 0.09, bend: 1.15, fwd: 0.36 } },
  thinking:  { label: '思考', lean: 0.012, pitch: 0.05,  tilt: 0.10,  drop: 0.006, shrink: 0, chin: 'R',
               armL: { out: 0.16, bend: 1.25, fwd: 0.34 }, armR: { out: 0.10, bend: 2.15, fwd: 0.42 } },
};

/* ============================================================
   三、动作：幅度克制，避免夸张与机械化
   ============================================================ */
export const ACTIONS = {
  stand:  { label: '站立' },
  walk:   { label: '行走' },
  sit:    { label: '坐下' },
  turn:   { label: '转身' },
  bow:    { label: '低头' },
  lookUp: { label: '抬头' },
};

/* ============================================================
   四、角色体型规格：只由稳定 seed 决定，不读取姓名、不猜身份
   hints 仅接受剧本中“明确写下”的线索（长发/短发、性别标注）
   ============================================================ */
export function bodySpec(seedKey, hints = {}) {
  const r = rng(hash(seedKey || 'mumu'));
  const builds = ['slim', 'standard', 'broad'];
  const build = builds[Math.floor(r() * builds.length)];
  const hairPool = hints.hairHint === 'long' ? ['long', 'bun', 'ponytail', 'wave']
    : hints.hairHint === 'short' ? ['short', 'crop', 'bob']
      : ['short', 'crop', 'bob', 'long', 'bun', 'ponytail'];
  let garmentPool = ['trousers', 'trousers', 'coat', 'shorts', 'robe', 'dress'];
  if (hints.genderHint === 'm') garmentPool = garmentPool.filter((g) => g !== 'dress');
  return {
    build,
    hair: hairPool[Math.floor(r() * hairPool.length)],
    garment: garmentPool[Math.floor(r() * garmentPool.length)],
    height: 0.95 + r() * 0.11,      // 身高差异
    legRatio: 0.97 + r() * 0.07,    // 腿身比差异
    stance: (r() - 0.5) * 0.18,     // 重心偏移（站姿差异）
    yawBase: (r() - 0.5) * 0.36,    // 默认朝向微偏
    swayPh: r() * 6.283,            // 呼吸/晃动相位
  };
}

/* ============================================================
   五、骨骼：把 体型 + 姿态 + 动作 + 时间 合成 3D 关节，再正交投影
   ============================================================ */
const add = (p, q) => ({ x: p.x + q.x, y: p.y + q.y, z: (p.z || 0) + (q.z || 0) });
const mul = (p, k) => ({ x: p.x * k, y: p.y * k, z: (p.z || 0) * k });
function dir(side, out, fwd) {
  return { x: side * Math.sin(out) * Math.cos(fwd), y: -Math.cos(out) * Math.cos(fwd), z: Math.sin(fwd) };
}

function buildJoints(spec, pose, action, anim) {
  const B = BUILDS[spec.build] || BUILDS.standard;
  const t = anim.t, ph = spec.swayPh;
  const lr = spec.legRatio;
  let hipY = BODY.hip * lr;
  const upY = (v) => hipY + (v - BODY.hip) * (1 - (lr - 1) * 0.9);
  let kneeY = hipY * 0.505, ankleY = hipY * 0.055;

  /* --- 动作对骨架的整体修正 --- */
  let legSwing = 0, legSwing2 = 0, kneeBend = 0, kneeBend2 = 0, bob = 0, armSwing = 0;
  let sitting = false;
  if (action === 'sit') { sitting = true; hipY = 0.335; kneeY = 0.305; ankleY = 0.03; }
  if (action === 'walk') {
    const p = t * 2.1 + ph;
    legSwing = Math.sin(p) * 0.42; legSwing2 = -legSwing;
    kneeBend = Math.max(0, -Math.cos(p)) * 0.85; kneeBend2 = Math.max(0, Math.cos(p)) * 0.85;
    armSwing = Math.sin(p) * 0.34;
    bob = Math.abs(Math.cos(p)) * 0.010;
  }

  /* --- 呼吸 / 晃动 / 说话（克制） --- */
  const breath = Math.sin(t * 1.05 + ph) * 0.0035;
  const sway = Math.sin(t * 0.46 + ph) * 0.0055 + spec.stance * 0.35;
  const talk = anim.speaking ? Math.sin(t * 6.2 + ph) * 0.0035 : 0;

  const p = pose;
  const lean = p.lean + Math.sin(t * 0.31 + ph) * 0.006 + (action === 'bow' ? 0.09 : 0) + (action === 'lookUp' ? -0.05 : 0);
  const pitch = p.pitch + (action === 'bow' ? 0.42 : 0) + (action === 'lookUp' ? -0.4 : 0);
  const drop = p.drop + (action === 'sit' ? 0.012 : 0);
  const shrink = 1 - (p.shrink || 0);

  /* --- 关键关节（3D 局部坐标） --- */
  const leanAt = (y) => lean * Math.max(0, Math.min(1.15, (y - hipY) / Math.max(0.2, 1 - hipY)));
  const shY = upY(BODY.shoulder) - drop + breath + bob;
  const neckY = upY(BODY.neck) - drop * 0.8 + breath + bob;
  const headY = upY(HEAD.center) - drop * 0.55 + breath * 1.2 + bob + talk;
  const shZ = leanAt(shY) + drop * 0.7;
  const headZ = leanAt(headY) + pitch * 0.055;
  const hipX = sway;

  const J = {
    hipC: { x: hipX, y: hipY, z: 0 },
    neck: { x: hipX * 0.5, y: neckY, z: leanAt(neckY) },
    head: { x: hipX * 0.4 + Math.sin(p.tilt) * 0.01, y: headY, z: headZ },
    shL: { x: hipX * 0.7 - B.sh, y: shY, z: shZ },
    shR: { x: hipX * 0.7 + B.sh, y: shY, z: shZ },
    chest: { x: hipX * 0.6, y: upY(BODY.chest) - drop * 0.9 + breath, z: leanAt(upY(BODY.chest)) },
    waist: { x: hipX * 0.8, y: upY(BODY.waist), z: leanAt(upY(BODY.waist)) * 0.6 },
  };

  /* --- 手臂 --- */
  const armLen = 0.205 * (0.94 + B.limb * 0.06);
  const mkArm = (side, pa, swing) => {
    const sh = side < 0 ? J.shL : J.shR;
    const fwd = pa.fwd + swing;
    const d1 = dir(side, pa.out, fwd);
    const elbow = add(sh, mul(d1, armLen));
    const d2 = dir(side, Math.max(-0.25, pa.out * 0.55 - 0.06), fwd + pa.bend);
    const wrist = add(elbow, mul(d2, armLen * 0.92));
    if (p.chin === (side < 0 ? 'L' : 'R')) {
      // 手托下巴：前臂折向面部
      wrist.x = J.head.x + side * 0.028; wrist.y = headY - 0.075; wrist.z = headZ + 0.045;
      elbow.x = sh.x + side * 0.012; elbow.y = sh.y - armLen * 0.92; elbow.z = sh.z + 0.055;
    }
    return { sh, elbow, wrist, hand: add(wrist, mul(d2, 0.035)) };
  };
  J.armL = mkArm(-1, p.armL, -armSwing);
  J.armR = mkArm(1, p.armR, armSwing);

  /* --- 腿 --- */
  const mkLeg = (side, swing, bend) => {
    const hip = { x: hipX + side * B.hip * 0.58, y: hipY - 0.012, z: 0 };
    if (sitting) {
      const knee = { x: hip.x + side * 0.10, y: kneeY, z: 0.245 };
      const ankle = { x: knee.x + side * 0.02, y: ankleY, z: 0.262 };
      return { hip, knee, ankle, toe: add(ankle, { x: 0, y: -0.012, z: 0.075 }) };
    }
    const L1 = (hipY - kneeY) * 1.02, L2 = (kneeY - ankleY) * 1.03;
    const d1 = { x: side * 0.05 + Math.sin(swing) * 0.16, y: -Math.cos(swing), z: Math.sin(swing) * 0.55 };
    const knee = add(hip, mul(d1, L1));
    const s2 = swing * 0.35 - bend * 0.5;
    const d2 = { x: side * 0.02 + Math.sin(s2) * 0.1, y: -Math.cos(s2), z: Math.sin(swing) * 0.25 + Math.sin(bend) * 0.3 };
    const ankle = add(knee, mul(d2, L2));
    ankle.y = Math.max(0.012, ankle.y);
    const toe = add(ankle, { x: side * 0.008, y: -ankle.y + 0.012, z: 0.075 + Math.sin(swing) * 0.03 });
    return { hip, knee, ankle, toe };
  };
  J.legL = mkLeg(-1, legSwing2, kneeBend2);
  J.legR = mkLeg(1, legSwing, kneeBend);

  J.meta = { B, hipY, shY, headY, shrink, sitting, breath, tilt: p.tilt || 0 };
  return J;
}

function projector(x, footY, H, yaw, flip) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (p) => {
    const px = (p.x * c + (p.z || 0) * s) * flip;
    return { x: x + px * H, y: footY - p.y * H };
  };
}

/* ============================================================
   六、轮廓：头 / 发 / 躯干 / 四肢 / 服装，全部并入一个 Path2D
   ============================================================ */
function buildPath(S, J, spec, yaw, H, tiltS = 0) {
  const P = new Path2D();
  const B = J.meta.B;
  const limb = B.limb;
  const tl = 0.9 + limb * 0.1;
  const face = Math.cos(yaw);                 // 1 正面 → 0 侧面 → -1 背面
  const profile = Math.abs(Math.sin(yaw));

  /* --- 头（含下颌与颈的自然过渡） --- */
  const h = S(J.head);
  const headRx = HEAD.rx * (0.90 + 0.10 * Math.abs(face)) * H;
  const headRy = HEAD.ry * H;
  ell(P, h.x, h.y, headRx, headRy, tiltS);
  // 侧面时的鼻梁轮廓（只是轮廓起伏，不是五官）
  if (profile > 0.7) {
    const sgn = Math.sin(yaw) > 0 ? 1 : -1;
    ell(P, h.x + sgn * headRx * 0.9, h.y + headRy * 0.16, headRx * 0.24, headRy * 0.22, sgn * 0.3);
  }
  // 颈
  capsule(P, S({ x: J.head.x * 0.7, y: J.head.y - HEAD.ry - 0.004, z: J.head.z * 0.85 }), S(J.neck), 0.022 * H * tl, 0.028 * H * tl);

  /* --- 躯干：“笼式”胶囊并集（前柱/背柱/侧柱/肩肋/腰肋/髋肋）
         正面与侧面都能保持完整、自然的体积 --- */
  const shY = J.meta.shY, hipY = J.meta.hipY, waistY = J.waist.y;
  const dF = 0.034, dB = -0.040;
  const lz = (y) => J.chest.z * Math.max(0, Math.min(1.2, (y - hipY) / Math.max(0.2, shY - hipY)));
  // 前后柱：躯干厚度（侧面视角的体积来源）
  capsule(P, S({ x: 0, y: shY + 0.006, z: dB + lz(shY) }), S({ x: 0, y: hipY + 0.012, z: dB * 0.7 }), 0.042 * H * tl, 0.050 * H * tl);
  capsule(P, S({ x: 0, y: shY + 0.002, z: dF + lz(shY) }), S({ x: 0, y: hipY + 0.004, z: dF * 0.8 }), 0.040 * H * tl, 0.045 * H * tl);
  // 斜肩：颈侧 → 肩点，避免“方肩”
  capsule(P, S({ x: -0.018, y: shY + 0.014, z: 0 }), S({ x: -B.sh * 0.77, y: shY + 0.002, z: 0 }), 0.032 * H * tl, 0.031 * H * tl);
  capsule(P, S({ x: 0.018, y: shY + 0.014, z: 0 }), S({ x: B.sh * 0.77, y: shY + 0.002, z: 0 }), 0.032 * H * tl, 0.031 * H * tl);
  // 侧轮廓：肩 → 腰（收）→ 髋（放），形成自然腰线
  capsule(P, S({ x: -B.sh * 0.78, y: shY + 0.006, z: -0.004 }), S({ x: -B.waist * 0.86, y: waistY, z: -0.004 }), 0.030 * H * tl, 0.023 * H * tl);
  capsule(P, S({ x: B.sh * 0.78, y: shY + 0.006, z: -0.004 }), S({ x: B.waist * 0.86, y: waistY, z: -0.004 }), 0.030 * H * tl, 0.023 * H * tl);
  capsule(P, S({ x: -B.waist * 0.86, y: waistY, z: -0.004 }), S({ x: -B.hip * 0.84, y: hipY - 0.004, z: -0.004 }), 0.023 * H * tl, 0.040 * H * tl);
  capsule(P, S({ x: B.waist * 0.86, y: waistY, z: -0.004 }), S({ x: B.hip * 0.84, y: hipY - 0.004, z: -0.004 }), 0.023 * H * tl, 0.040 * H * tl);
  // 髋肋与腰肋
  capsule(P, S({ x: -B.hip * 0.6, y: hipY, z: 0 }), S({ x: B.hip * 0.6, y: hipY, z: 0 }), 0.042 * H * tl, 0.042 * H * tl);
  capsule(P, S({ x: 0, y: waistY, z: dB * 0.8 }), S({ x: 0, y: waistY, z: dF * 0.85 }), 0.040 * H * tl, 0.040 * H * tl);

  /* --- 手臂与手 --- */
  for (const arm of [J.armL, J.armR]) {
    const a = S(arm.sh), e = S(arm.elbow), w = S(arm.wrist), hd = S(arm.hand);
    capsule(P, a, e, 0.028 * H * limb, 0.023 * H * limb);
    capsule(P, e, w, 0.023 * H * limb, 0.018 * H * limb);
    ell(P, hd.x, hd.y, 0.017 * H * limb, 0.026 * H * limb, Math.atan2(hd.y - w.y, hd.x - w.x) + Math.PI / 2);
  }

  /* --- 腿与脚 --- */
  for (const leg of [J.legL, J.legR]) {
    const hp = S(leg.hip), kn = S(leg.knee), an = S(leg.ankle), to = S(leg.toe);
    capsule(P, hp, kn, 0.056 * H * limb, 0.040 * H * limb);
    capsule(P, kn, an, 0.038 * H * limb, 0.024 * H * limb);
    capsule(P, an, to, 0.021 * H * limb, 0.016 * H * limb);
  }

  /* --- 发型：只保留轮廓差异 --- */
  drawHair(P, S, J, spec, h, headRx, headRy, face, H);

  /* --- 服装：只保留剪影差异 --- */
  drawGarment(P, S, J, spec, H, limb);

  return P;
}

function drawHair(P, S, J, spec, h, rx, ry, face, H) {
  const crown = { x: h.x, y: h.y - ry * 0.12 };
  const backSide = face < 0 ? -1 : 1;      // 背面时发量覆盖后颈
  switch (spec.hair) {
    case 'crop':
      ell(P, crown.x, crown.y - ry * 0.18, rx * 1.06, ry * 0.86);
      break;
    case 'short': {
      ell(P, crown.x, crown.y - ry * 0.1, rx * 1.12, ry * 0.95);
      ell(P, crown.x - rx * 0.8, crown.y + ry * 0.38, rx * 0.40, ry * 0.55, -0.3);
      ell(P, crown.x + rx * 0.8, crown.y + ry * 0.38, rx * 0.40, ry * 0.55, 0.3);
      break;
    }
    case 'bob': {
      ell(P, crown.x, crown.y - ry * 0.06, rx * 1.16, ry * 1.02);
      smoothClosed(P, [
        [crown.x - rx * 1.1, crown.y - ry * 0.2], [crown.x - rx * 1.28, crown.y + ry * 0.9],
        [crown.x - rx * 0.95, crown.y + ry * 1.5], [crown.x - rx * 0.5, crown.y + ry * 1.0],
        [crown.x - rx * 0.55, crown.y + ry * 0.1],
      ]);
      smoothClosed(P, [
        [crown.x + rx * 1.1, crown.y - ry * 0.2], [crown.x + rx * 1.28, crown.y + ry * 0.9],
        [crown.x + rx * 0.95, crown.y + ry * 1.5], [crown.x + rx * 0.5, crown.y + ry * 1.0],
        [crown.x + rx * 0.55, crown.y + ry * 0.1],
      ]);
      break;
    }
    case 'long':
    case 'wave': {
      const wavy = spec.hair === 'wave';
      ell(P, crown.x, crown.y - ry * 0.08, rx * 1.14, ry);
      for (const s of [-1, 1]) {
        const x0 = crown.x + s * rx * 1.05;
        const pts = [
          [x0, crown.y - ry * 0.3],
          [x0 + s * rx * 0.42, crown.y + ry * 1.1 + (wavy ? ry * 0.15 : 0)],
          [x0 + s * rx * (wavy ? 0.18 : 0.34), crown.y + ry * 2.4],
          [x0 + s * rx * (wavy ? 0.5 : 0.2), crown.y + ry * 3.5],
          [x0 - s * rx * 0.25, crown.y + ry * 3.3],
          [x0 - s * rx * 0.1, crown.y + ry * 1.4],
          [x0 - s * rx * 0.35, crown.y + ry * 0.2],
        ];
        smoothClosed(P, pts);
      }
      // 后脑发量
      ell(P, crown.x - backSide * rx * 0.2, crown.y + ry * 0.5, rx * 1.05, ry * 1.35);
      break;
    }
    case 'bun': {
      ell(P, crown.x, crown.y - ry * 0.1, rx * 1.1, ry * 0.95);
      ell(P, crown.x - backSide * rx * 0.22, crown.y - ry * 0.82, rx * 0.5, ry * 0.44);
      break;
    }
    case 'ponytail': {
      ell(P, crown.x, crown.y - ry * 0.1, rx * 1.1, ry * 0.95);
      smoothClosed(P, [
        [crown.x - backSide * rx * 0.7, crown.y - ry * 0.5],
        [crown.x - backSide * rx * 1.5, crown.y + ry * 0.8],
        [crown.x - backSide * rx * 1.25, crown.y + ry * 2.6],
        [crown.x - backSide * rx * 0.8, crown.y + ry * 3.2],
        [crown.x - backSide * rx * 0.55, crown.y + ry * 2.2],
        [crown.x - backSide * rx * 0.75, crown.y + ry * 0.9],
        [crown.x - backSide * rx * 0.35, crown.y - ry * 0.1],
      ]);
      break;
    }
    default:
      ell(P, crown.x, crown.y - ry * 0.14, rx * 1.08, ry * 0.9);
  }
}

function drawGarment(P, S, J, spec, H, limb) {
  const B = J.meta.B;
  const hipY = J.meta.hipY;
  const wL = S(add(J.waist, { x: -B.waist * 1.02, y: 0.01, z: 0 }));
  const wR = S(add(J.waist, { x: B.waist * 1.02, y: 0.01, z: 0 }));
  const shL = S(add(J.shL, { x: -0.016, y: 0.012, z: 0 }));
  const shR = S(add(J.shR, { x: 0.016, y: 0.012, z: 0 }));
  const kneeY = S({ x: 0, y: hipY * 0.505, z: 0 }).y;
  switch (spec.garment) {
    case 'dress': {
      const hemY = kneeY + H * 0.02;
      const hw = B.hip * 2.05 * H;
      const cx = (wL.x + wR.x) / 2;
      smoothClosed(P, [
        [wL.x, wL.y], [shL.x, shL.y + H * 0.02], [shR.x, shR.y + H * 0.02], [wR.x, wR.y],
        [cx + hw * 0.5, hemY - H * 0.02], [cx + hw * 0.34, hemY], [cx, hemY - H * 0.012],
        [cx - hw * 0.34, hemY], [cx - hw * 0.5, hemY - H * 0.02],
      ]);
      break;
    }
    case 'coat': {
      const hemY = kneeY - H * 0.06;
      const hw = B.hip * 1.5 * H;
      const cx = (wL.x + wR.x) / 2;
      smoothClosed(P, [
        [shL.x - H * 0.006, shL.y], [wL.x - H * 0.008, wL.y],
        [cx - hw * 0.52, hemY - H * 0.03], [cx - hw * 0.46, hemY],
        [cx - hw * 0.1, hemY - H * 0.015], [cx + hw * 0.1, hemY - H * 0.015],
        [cx + hw * 0.46, hemY], [cx + hw * 0.52, hemY - H * 0.03],
        [wR.x + H * 0.008, wR.y], [shR.x + H * 0.006, shR.y],
        [(shL.x + shR.x) / 2, shL.y + H * 0.03],
      ]);
      break;
    }
    case 'robe': {
      const ankleY = S({ x: 0, y: hipY * 0.06, z: 0 }).y;
      const hw = B.hip * 1.85 * H;
      const cx = (wL.x + wR.x) / 2;
      smoothClosed(P, [
        [shL.x, shL.y + H * 0.01], [wL.x - H * 0.006, wL.y],
        [cx - hw * 0.5, ankleY - H * 0.05], [cx - hw * 0.42, ankleY],
        [cx, ankleY - H * 0.012], [cx + hw * 0.42, ankleY], [cx + hw * 0.5, ankleY - H * 0.05],
        [wR.x + H * 0.006, wR.y], [shR.x, shR.y + H * 0.01],
      ]);
      break;
    }
    case 'shorts': {
      for (const leg of [J.legL, J.legR]) {
        const hp = S(leg.hip);
        const mid = S({ x: leg.hip.x + (leg.knee.x - leg.hip.x) * 0.42, y: leg.hip.y + (leg.knee.y - leg.hip.y) * 0.42, z: leg.hip.z });
        capsule(P, hp, mid, 0.056 * H * limb, 0.052 * H * limb);
      }
      break;
    }
    default:
      break; // trousers：腿部轮廓本身即是长裤
  }
}

/* ============================================================
   七、光影：落地阴影 / 边缘光 / 主体渐变 / 空气透视
   ============================================================ */
export function rimColor(palette) {
  if (!palette) return '#ffc890';
  return palette.warm === false ? mix(palette.glow, '#9fb4ff', 0.65) : mix(palette.glow, palette.accent, 0.45);
}
export function bodyColors(palette, depth = 0) {
  const p = palette || { skyTop: '#3a2350', skyMid: '#8c4a68', skyLow: '#f0a05e', ground: '#2c1d3e' };
  let dark = mix(p.ground, '#0b0916', 0.55);
  let base = mix(dark, p.skyTop, 0.20);
  let lit = mix(base, p.skyMid, 0.26);
  if (depth > 0) {
    const k = Math.min(0.42, depth * 0.42);
    dark = mix(dark, p.skyMid, k); base = mix(base, p.skyMid, k); lit = mix(lit, p.skyMid, k);
  }
  return { dark, base, lit };
}

function halo(ctx, P, color, lx, ly, off, blur, alpha) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.translate(lx * off, ly * off);
  if ('filter' in ctx) ctx.filter = `blur(${blur}px)`;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill(P);
  ctx.restore();
}

function groundShadow(ctx, x, footY, H, lx, depth) {
  const rx = H * 0.165, ry = Math.max(3, H * 0.030);
  const a = 0.40 * (1 - depth * 0.55);
  ctx.save();
  ctx.translate(x - lx * H * 0.05, footY + H * 0.006);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(7,5,15,${a})`);
  g.addColorStop(0.55, `rgba(7,5,15,${a * 0.5})`);
  g.addColorStop(1, 'rgba(7,5,15,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.2832); ctx.fill();
  ctx.restore();
}

/** 坐下时的坐具（台阶/矮凳），避免人物悬空 */
function seatBlock(ctx, x, footY, H, palette, depth) {
  const w = H * 0.34, h = H * 0.345;
  const y = footY - H * 0.335;
  const c = bodyColors(palette, Math.min(1, depth + 0.15));
  ctx.save();
  ctx.fillStyle = c.dark;
  ctx.beginPath();
  const r = H * 0.02;
  ctx.moveTo(x - w / 2 + r, y);
  ctx.arcTo(x + w / 2, y, x + w / 2, y + h, r);
  ctx.arcTo(x + w / 2, y + h, x - w / 2, y + h, r);
  ctx.arcTo(x - w / 2, y + h, x - w / 2, y, r);
  ctx.arcTo(x - w / 2, y, x + w / 2, y, r);
  ctx.fill();
  ctx.restore();
}

/* ============================================================
   主绘制入口
   opts: { x, footY, height, time, palette, light:{x,y}, depth, flip,
           yaw, pose, action, speaking }
   ============================================================ */
export function drawSilhouette(ctx, spec, o = {}) {
  const H = (o.height || 300) * (spec.height || 1);
  const x = o.x || 0, footY = o.footY || 0;
  const time = o.time || 0;
  const pose = POSES[o.pose] || POSES.neutral;
  const action = ACTIONS[o.action] ? o.action : 'stand';
  const yaw = (o.yaw || 0) + (spec.yawBase || 0) * (o.ignoreBaseYaw ? 0 : 1);
  const flip = o.flip === -1 ? -1 : 1;

  const J = buildJoints(spec, pose, action, { t: time, ph: spec.swayPh || 0, speaking: !!o.speaking });
  const S = projector(x, footY, H, yaw, flip);
  const P = buildPath(S, J, spec, yaw, H, (pose.tilt || 0) * flip);

  const palette = o.palette;
  const depth = Math.max(0, Math.min(1, o.depth || 0));

  // 光源方向（屏幕空间，指向光源）
  const headPt = { x, y: footY - H * 0.62 };
  const lsrc = o.light || { x: x + H, y: footY - H * 1.2 };
  let lx = lsrc.x - headPt.x, ly = lsrc.y - headPt.y;
  const ll = Math.hypot(lx, ly) || 1;
  lx /= ll; ly /= ll;

  if (action === 'sit') seatBlock(ctx, x, footY, H, palette, depth);
  groundShadow(ctx, x, footY, H, lx, depth);

  // 边缘光：外层柔光 + 内层贴边亮线（只出现在受光一侧）
  const rim = o.rimColor || rimColor(palette);
  const rimK = 1 - depth * 0.45;
  halo(ctx, P, rim, lx, ly, H * 0.055, 10, 0.07 * rimK);
  halo(ctx, P, rim, lx, ly, H * 0.013, 3.0, 0.30 * rimK);

  // 主体：沿光照方向的明暗渐变
  const col = bodyColors(palette, depth);
  const cx = x, cy = footY - H * 0.5;
  const g = ctx.createLinearGradient(cx + lx * H * 0.5, cy + ly * H * 0.5, cx - lx * H * 0.5, cy - ly * H * 0.5);
  g.addColorStop(0, col.lit);
  g.addColorStop(0.5, col.base);
  g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.fill(P);

  // 空气透视：上部融入天空、脚部接地反光，避免“黑色贴纸”
  ctx.save();
  ctx.clip(P);
  const p = palette || {};
  const hz = ctx.createLinearGradient(0, footY - H * 1.02, 0, footY);
  hz.addColorStop(0, mix(p.skyMid || '#8c4a68', '#ffffff', 0, 0.10 + depth * 0.12));
  hz.addColorStop(0.62, mix(p.skyLow || '#f0a05e', '#ffffff', 0, 0.05 + depth * 0.08));
  hz.addColorStop(1, mix(p.ground || '#2c1d3e', '#ffffff', 0, 0.10));
  ctx.fillStyle = hz;
  ctx.fillRect(x - H, footY - H * 1.15, H * 2, H * 1.25);
  ctx.restore();
}

/* ============================================================
   特写：手部 + 叙事道具 的局部剪影
   ============================================================ */
const PROPS = {
  bottle: ['水', '瓶'], phone: ['手机', '电话'], letter: ['信', '票', '纸'],
  cup: ['杯', '茶', '咖啡'], bell: ['铃'], keys: ['琴'],
};
export function pickProp(text) {
  const t = String(text || '');
  for (const [k, ws] of Object.entries(PROPS)) if (ws.some((w) => t.includes(w))) return k;
  return 'hands';
}

export function drawHandDetail(ctx, o = {}) {
  const { x, y: y0, size: S0, palette, time = 0, prop = 'hands', light } = o;
  const s = S0 || 200;
  const y = y0 + Math.sin(time * 0.8) * s * 0.01;   // 极轻的呼吸起伏
  const P = new Path2D();
  const rotRect = (cx, cy, hw, hh, rot) => {
    const c = Math.cos(rot), si = Math.sin(rot);
    smoothClosed(P, [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
      .map(([px, py]) => [cx + px * c - py * si, cy + px * si + py * c]));
  };
  // 侧视拳头：手背轮廓 + 右缘指节起伏 + 横搭的拇指
  const fist = (fx, fy, k) => {
    smoothClosed(P, [
      [fx - 0.16 * k, fy + 0.16 * k], [fx - 0.19 * k, fy - 0.04 * k], [fx - 0.10 * k, fy - 0.14 * k],
      [fx + 0.08 * k, fy - 0.14 * k], [fx + 0.17 * k, fy - 0.04 * k], [fx + 0.16 * k, fy + 0.14 * k],
      [fx + 0.02 * k, fy + 0.20 * k],
    ]);
    for (let i = 0; i < 4; i++) ell(P, fx + 0.15 * k, fy - 0.08 * k + i * 0.07 * k, 0.045 * k, 0.038 * k);
    capsule(P, { x: fx - 0.04 * k, y: fy - 0.08 * k }, { x: fx + 0.12 * k, y: fy - 0.03 * k }, 0.045 * k, 0.034 * k);
  };

  if (prop === 'keys') {
    // 侧视：琴键上的手
    capsule(P, { x: x - s * 0.42, y: y + s * 0.34 }, { x: x + s * 0.46, y: y + s * 0.38 }, s * 0.035, s * 0.03);
    capsule(P, { x: x - s * 0.40, y: y + s * 0.62 }, { x: x - s * 0.10, y: y + s * 0.16 }, s * 0.09, s * 0.07);
    ell(P, x - s * 0.04, y + s * 0.06, s * 0.13, s * 0.10, -0.2);
    for (let i = 0; i < 4; i++) {
      capsule(P, { x: x - s * (0.08 - i * 0.015), y: y + s * 0.10 },
        { x: x - s * 0.05 + i * s * 0.075, y: y + s * 0.30 }, s * 0.026, s * 0.02);
    }
    capsule(P, { x: x - s * 0.16, y: y + s * 0.10 }, { x: x - s * 0.06, y: y + s * 0.16 }, s * 0.035, s * 0.028);
  } else if (prop === 'hands') {
    // 双手轻握
    capsule(P, { x: x - s * 0.48, y: y + s * 0.70 }, { x: x - s * 0.14, y: y + s * 0.26 }, s * 0.10, s * 0.08);
    fist(x - s * 0.06, y + s * 0.14, s);
    capsule(P, { x: x + s * 0.50, y: y + s * 0.72 }, { x: x + s * 0.18, y: y + s * 0.30 }, s * 0.095, s * 0.075);
    fist(x + s * 0.12, y + s * 0.20, s * 0.92);
  } else {
    // 单手自下方握住道具：前臂 → 拳 → 道具自拳心向上伸出
    capsule(P, { x: x - s * 0.46, y: y + s * 0.74 }, { x: x - s * 0.12, y: y + s * 0.28 }, s * 0.105, s * 0.082);
    fist(x, y + s * 0.16, s);
    if (prop === 'bottle') {
      capsule(P, { x: x + s * 0.01, y: y + s * 0.06 }, { x: x + s * 0.045, y: y - s * 0.26 }, s * 0.085, s * 0.07);
      capsule(P, { x: x + s * 0.045, y: y - s * 0.24 }, { x: x + s * 0.06, y: y - s * 0.37 }, s * 0.032, s * 0.028);
      ell(P, x + s * 0.062, y - s * 0.39, s * 0.038, s * 0.026);
    } else if (prop === 'letter') {
      // 直边纸张：下缘插进拳心，拇指斜压纸面
      const c = Math.cos(-0.25), si = Math.sin(-0.25);
      const cx = x + s * 0.08, cy = y - s * 0.06, hw = s * 0.20, hh = s * 0.13;
      const rp = ensureCW([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
        .map(([px, py]) => [cx + px * c - py * si, cy + px * si + py * c]));
      P.moveTo(rp[0][0], rp[0][1]);
      for (let i = 1; i < rp.length; i++) P.lineTo(rp[i][0], rp[i][1]);
      P.closePath();
      capsule(P, { x: x - s * 0.06, y: y + s * 0.06 }, { x: x + s * 0.10, y: y - s * 0.02 }, s * 0.048, s * 0.036);
    } else if (prop === 'phone') {
      rotRect(x + s * 0.08, y - s * 0.15, s * 0.095, s * 0.165, 0.14);
    } else if (prop === 'cup') {
      capsule(P, { x: x + s * 0.02, y: y + s * 0.04 }, { x: x + s * 0.045, y: y - s * 0.16 }, s * 0.09, s * 0.075);
      ell(P, x + s * 0.15, y - s * 0.06, s * 0.045, s * 0.06);
    } else if (prop === 'bell') {
      ell(P, x + s * 0.05, y - s * 0.12, s * 0.10, s * 0.105);
      capsule(P, { x: x - s * 0.07, y: y - s * 0.045 }, { x: x + s * 0.17, y: y - s * 0.045 }, s * 0.022, s * 0.02);
      ell(P, x + s * 0.05, y + s * 0.005, s * 0.026, s * 0.026);
    }
  }

  const lsrc = light || { x: x + s, y: y - s };
  let lx = lsrc.x - x, ly = lsrc.y - y;
  const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
  const rim = rimColor(palette);
  halo(ctx, P, rim, lx, ly, s * 0.05, 9, 0.08);
  halo(ctx, P, rim, lx, ly, s * 0.013, 2.2, 0.3);
  const col = bodyColors(palette, 0);
  const g = ctx.createLinearGradient(x + lx * s * 0.5, y + ly * s * 0.5, x - lx * s * 0.5, y - ly * s * 0.5);
  g.addColorStop(0, col.lit); g.addColorStop(0.5, col.base); g.addColorStop(1, col.dark);
  ctx.fillStyle = g;
  ctx.fill(P);
}
