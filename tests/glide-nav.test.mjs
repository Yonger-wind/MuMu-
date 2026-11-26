import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approach, clamp, dampingOf, edgeStiffness, springStep, stretchSquash,
} from '../scripts/glide-nav.js';

/* 把 tick() 里的两条缘弹簧搬出来跑，验证"拉长再收回"确实会发生。 */
function glide(from, to, { bounce = 0.22, stretch = 0.64, base = 520, seconds = 2 } = {}) {
  let x0 = from.left;
  let x1 = from.left + from.width;
  let v0 = 0;
  let v1 = 0;
  const h = 1 / 240;
  const dir = Math.sign((to.left + to.width / 2) - (x0 + x1) / 2);
  const k = edgeStiffness(dir, stretch, base);
  const c0 = dampingOf(k.left, bounce);
  const c1 = dampingOf(k.right, bounce);
  const t0 = to.left;
  const t1 = to.left + to.width;
  const trace = [];
  for (let i = 0; i < Math.round(seconds / h); i += 1) {
    const a = springStep(x0, v0, t0, k.left, c0, h);
    x0 = a.pos; v0 = a.vel;
    const b = springStep(x1, v1, t1, k.right, c1, h);
    x1 = b.pos; v1 = b.vel;
    trace.push(x1 - x0);
  }
  return { x0, x1, trace, peak: Math.max(...trace) };
}

test('edgeStiffness：stretch=0 时两端等硬，不回弹也不拉长', () => {
  assert.deepEqual(edgeStiffness(1, 0), { left: 520, right: 520 });
  assert.deepEqual(edgeStiffness(0, 1), { left: 520, right: 520 });
});

test('edgeStiffness：行进方向那一缘更硬，另一缘拖尾', () => {
  const right = edgeStiffness(1, 0.64);
  assert.ok(right.right > right.left, '向右走时右缘应当先到位');
  const left = edgeStiffness(-1, 0.64);
  assert.ok(left.left > left.right, '向左走时左缘应当先到位');
  // 左右只是镜像，不能一边比另一边更弹
  assert.ok(Math.abs(right.right - left.left) < 1e-9);
  assert.ok(Math.abs(right.left - left.right) < 1e-9);
});

test('edgeStiffness：stretch 超出范围被夹住，不会算出负刚度', () => {
  const over = edgeStiffness(1, 9);
  assert.equal(over.left, 520 * (1 - 0.5));
  const under = edgeStiffness(1, -3);
  assert.deepEqual(under, { left: 520, right: 520 });
});

test('springStep：朝目标收敛且不做负幅震荡（临界阻尼）', () => {
  let pos = 0;
  let vel = 0;
  const k = 520;
  const seen = [];
  for (let i = 0; i < 400; i += 1) {
    const r = springStep(pos, vel, 100, k, dampingOf(k, 0), 1 / 240);
    pos = r.pos; vel = r.vel;
    seen.push(pos);
  }
  assert.ok(Math.abs(pos - 100) < 0.05, `应收敛到 100，实得 ${pos}`);
  assert.ok(Math.max(...seen) <= 100.5, 'bounce=0 不该越过目标');
});

test('springStep：低阻尼会冲过目标再回来（这就是 bounce 的来源）', () => {
  let pos = 0;
  let vel = 0;
  const k = 520;
  let max = 0;
  for (let i = 0; i < 400; i += 1) {
    const r = springStep(pos, vel, 100, k, dampingOf(k, 1), 1 / 240);
    pos = r.pos; vel = r.vel;
    max = Math.max(max, pos);
  }
  assert.ok(max > 100.5, `应出现过冲，峰值只有 ${max}`);
  assert.ok(Math.abs(pos - 100) < 0.5);
});

test('dampingOf：bounce 越大越欠阻尼', () => {
  assert.equal(dampingOf(400, 0), 2 * Math.sqrt(400));
  assert.ok(dampingOf(400, 1) < dampingOf(400, 0.5));
  assert.ok(dampingOf(400, 0.5) < dampingOf(400, 0));
});

test('stretchSquash：拉长才压扁，压过头有上限', () => {
  assert.equal(stretchSquash(100, 100), 1);
  assert.equal(stretchSquash(80, 100), 1, '变窄时不压高度');
  assert.ok(stretchSquash(200, 100) < 0.9);
  assert.equal(stretchSquash(10000, 100), 1 - 0.14, '最多压 14%，不能压成面条');
  assert.equal(stretchSquash(100, 0), 1, '目标宽度非法时不动作');
});

test('approach：定时间常数逼近，永不过冲', () => {
  let v = 0;
  for (let i = 0; i < 200; i += 1) v = approach(v, 1, 0.06, 1 / 60);
  assert.ok(v > 0.999 && v <= 1, `应贴近 1 且不超过，实得 ${v}`);
  let down = 1;
  for (let i = 0; i < 200; i += 1) down = approach(down, 0, 0.07, 1 / 60);
  assert.ok(down >= 0 && down < 0.001);
});

test('clamp：越界夹回', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});

test('整段滑行：中途确实被拽长，末尾落回目标宽度', () => {
  const a = { left: 4, width: 96 };
  const b = { left: 210, width: 132 };
  const run = glide(a, b);
  assert.ok(run.peak > b.width * 1.2, `药丸应被拉长，峰值仅 ${run.peak}`);
  assert.ok(run.peak < b.width * 2, `不能拉成面条，峰值 ${run.peak}`);
  assert.ok(Math.abs(run.x0 - b.left) < 0.1, `左缘应落在 ${b.left}，实得 ${run.x0}`);
  assert.ok(Math.abs(run.x1 - (b.left + b.width)) < 0.1);
  // 前端先到、后端后追 → 峰值出现在行程前段而不是终点
  assert.ok(run.trace.indexOf(run.peak) < run.trace.length * 0.4);
});

test('整段滑行：stretch=0 时宽度基本不变（关掉橡皮筋）', () => {
  const a = { left: 4, width: 96 };
  const b = { left: 210, width: 96 };
  const run = glide(a, b, { stretch: 0, bounce: 0 });
  const spread = run.peak - Math.min(...run.trace);
  assert.ok(spread < 8, `宽度应近乎恒定，波动 ${spread}`);
  assert.ok(Math.abs(run.x1 - run.x0 - 96) < 0.1);
});

/* ---------- 静态护栏：两处踩过的坑，改样式时最容易无声复发 ---------- */
test('护栏：托板 ::before 必须沉到文字底下（z-index:-1）', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../styles/extensions.css', import.meta.url), 'utf8');
  const at = css.indexOf('.mumu-glide__track::before');
  assert.ok(at >= 0, 'extensions.css 里应能找到轨道托板规则');
  const body = css.slice(css.indexOf('{', at), css.indexOf('}', at));
  assert.match(body, /z-index:\s*-1\s*;/,
    '托板是定位伪元素，默认排在普通流文字之上；叠 backdrop-filter 会把按钮自己的字糊掉（舞台实测整条文字消失）。');
});

test('护栏：接管标记 data-mg-item 不得进墨层克隆体', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../scripts/glide-nav.js', import.meta.url), 'utf8');
  const strip = /const STRIP_ATTRS = \[([^\]]*)\]/.exec(src);
  assert.ok(strip, 'STRIP_ATTRS 应还在 glide-nav.js 里');
  assert.ok(strip[1].includes("'data-mg-item'"),
    '克隆体若带上接管标记，会同时命中条目样式；♪→✕ 重建克隆体时墨字就会跑位。');
  assert.match(src, /setAttribute\('data-mg-item'/, '真按钮必须被打上接管标记（CSS 只认这个标记接管两套皮）。');
});
