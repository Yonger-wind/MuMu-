import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SLOT_NAMES, findSlot, mountTo } from '../scripts/ui/slots.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function fakeHost() {
  return {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      return node;
    },
    removeChild(node) {
      const i = this.children.indexOf(node);
      if (i >= 0) this.children.splice(i, 1);
      node.parentNode = null;
      return node;
    },
  };
}

function fakeRoot(map) {
  return {
    querySelector(selector) {
      const m = /^\[data-slot="(.+)"\]$/.exec(selector);
      return m && map[m[1]] ? map[m[1]] : null;
    },
  };
}

/* ---------------- extensions.css 命名空间校验（纯函数，便于自测） ---------------- */

/** 返回与 css[i]（'{'）配对的那个 '}' 的下标；不配对返回 -1。 */
function matchingBrace(css, i) {
  let depth = 0;
  for (let j = i; j < css.length; j += 1) {
    if (css[j] === '{') depth += 1;
    else if (css[j] === '}') {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/**
 * 收集 CSS 里所有「不以 .mumu- 开头」的选择器片段。
 * 规则：先剥注释；以 `@` 开头的块是 at-rule（@media / @supports / @keyframes…），
 * 其花括号内部按同样规则再校验一层（一层足够覆盖 media/keyframes/supports）；
 * `@keyframes` 内部的 `from` / `to` / `0%` 是帧标签不是选择器，整块跳过。
 */
function collectBadSelectors(css, out = []) {
  const src = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  let prelude = '';
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '}') {
      prelude = ''; // 顶层多余的右括号：丢弃累积，不当作选择器
      continue;
    }
    if (ch !== '{') {
      prelude += ch;
      continue;
    }
    const selector = prelude.trim();
    prelude = '';
    const end = matchingBrace(src, i);
    const body = src.slice(i + 1, end < 0 ? src.length : end);
    if (selector.startsWith('@')) {
      const at = selector.split(/[\s(]/)[0].toLowerCase();
      const isKeyframes = at === '@keyframes' || at === '@-webkit-keyframes';
      if (!isKeyframes) collectBadSelectors(body, out);
    } else {
      for (const one of selector.split(',')) {
        const s = one.trim();
        if (s && !s.startsWith('.mumu-')) out.push(s);
      }
    }
    if (end < 0) break;
    i = end;
  }
  return out;
}

/** 未来图鉴容器（P4-5）是 loader 的唯一预期消费者；约定路径如下，当前均不存在。 */
const ALLOWED_LOADER_CONSUMERS = ['gallery.js', 'ui/gallery.js'];

test('槽位：名单冻结且为四个命名槽', () => {
  assert.ok(Object.isFrozen(SLOT_NAMES));
  assert.deepEqual(SLOT_NAMES, ['home', 'stage', 'modal', 'overlay']);
});

test('槽位：未知槽名抛中文错误并列出可用槽', () => {
  assert.throws(() => findSlot('toast'), /未知的挂载点「toast」.*home \/ stage \/ modal \/ overlay/);
});

test('槽位：findSlot 按 data-slot 命中，未命中返回 null', () => {
  const host = fakeHost();
  const root = fakeRoot({ modal: host });
  assert.equal(findSlot('modal', root), host);
  assert.equal(findSlot('stage', root), null);
});

test('挂载：appendChild 后可幂等移除', () => {
  const host = fakeHost();
  const root = fakeRoot({ overlay: host });
  const node = { parentNode: null };
  const handle = mountTo('overlay', node, { root });
  assert.equal(handle.node, node);
  assert.deepEqual(host.children, [node]);
  handle.remove();
  assert.deepEqual(host.children, []);
  handle.remove(); // 第二次不报错
  assert.deepEqual(host.children, []);
});

test('挂载：找不到槽位抛中文错误并提示 data-slot 写法', () => {
  const root = fakeRoot({});
  assert.throws(() => mountTo('stage', {}, { root }), /找不到挂载点「stage」.*data-slot="stage"/);
});

test('挂载：node 非法时中文报错', () => {
  const root = fakeRoot({ modal: fakeHost() });
  assert.throws(() => mountTo('modal', undefined, { root }), /挂载内容必须是 DOM 节点/);
  assert.throws(() => mountTo('modal', null, { root }), /挂载内容必须是 DOM 节点/);
});

test('槽位：默认根取 globalThis.document', () => {
  const host = fakeHost();
  // 精确还原：原本是自有属性就写回原值，原本没有才删除（不能无条件 delete）。
  const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const originalDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector) => (selector === '[data-slot="home"]' ? host : null),
  };
  try {
    assert.equal(findSlot('home'), host);
  } finally {
    if (hadDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  }
});

test('槽位：非标准根时查询结果收敛为 null', () => {
  const root = { querySelector: () => undefined };
  assert.equal(findSlot('modal', root), null);
});

test('挂载：未知槽名先按未知挂载点报错', () => {
  const root = fakeRoot({});
  assert.throws(() => mountTo('toast', {}, { root }), /未知的挂载点「toast」/);
  assert.throws(
    () => mountTo('toast', {}, { root }),
    (err) => !/找不到挂载点/.test(err.message)
  );
});

/* ---------------- index.html / 令牌 / 悬浮层契约 ---------------- */

test('index.html：四个 data-slot 与两个样式链接齐全，链接在 main.css 之后', () => {
  const html = readFileSync(`${ROOT}index.html`, 'utf8');
  for (const name of ['home', 'stage', 'modal', 'overlay']) {
    assert.ok(html.includes(`data-slot="${name}"`), `缺少 data-slot="${name}"`);
  }
  const main = html.indexOf('styles/main.css');
  const tokens = html.indexOf('styles/tokens.css');
  const ext = html.indexOf('styles/extensions.css');
  assert.ok(main >= 0, '缺少 main.css');
  assert.ok(tokens > main, 'tokens.css 应在 main.css 之后');
  assert.ok(ext > tokens, 'extensions.css 应在 tokens.css 之后');
});

test('令牌：颜色 / 字体令牌都带 var() 与字面量兜底', () => {
  const css = readFileSync(`${ROOT}styles/tokens.css`, 'utf8');
  const lines = css.split('\n').filter((l) => /--mumu-(color|font)-[\w-]+\s*:/.test(l));
  assert.ok(lines.length >= 12, `令牌数量异常：${lines.length}`);
  for (const line of lines) {
    assert.match(line, /var\([^)]*,[^)]*\)/, `缺少兜底：${line.trim()}`);
  }
});

test('令牌：层级档位与 main.css 现有实现一致', () => {
  const tokens = readFileSync(`${ROOT}styles/tokens.css`, 'utf8');
  const main = readFileSync(`${ROOT}styles/main.css`, 'utf8');
  assert.match(tokens, /--mumu-z-modal:\s*60\s*;/);
  assert.match(tokens, /--mumu-z-overlay:\s*70\s*;/);
  assert.match(tokens, /--mumu-z-boot:\s*90\s*;/);
  assert.match(tokens, /--mumu-z-toast:\s*100\s*;/);
  assert.match(main, /\.modal-mask\s*\{[^}]*z-index:\s*60\s*;/);
  assert.match(main, /\.boot-veil\s*\{[^}]*z-index:\s*90\s*;/);
  assert.match(main, /\.toast\s*\{[^}]*z-index:\s*100\s*;/);
});

test('悬浮层：空层不拦截点击，子元素默认恢复可交互', () => {
  const css = readFileSync(`${ROOT}styles/extensions.css`, 'utf8');
  assert.match(css, /\.mumu-ui-layer\s*\{[^}]*pointer-events:\s*none\s*;/);
  assert.match(css, /\.mumu-ui-layer\s*>\s*\*\s*\{[^}]*pointer-events:\s*auto\s*;/);
});

test('扩展样式：只出现在 .mumu-* 命名空间', () => {
  const css = readFileSync(`${ROOT}styles/extensions.css`, 'utf8');
  const bad = collectBadSelectors(css);
  assert.deepEqual(bad, [], `越界选择器：${bad.join(' / ')}`);
});

test('扩展样式校验器自测：@media / @keyframes 包装不误判越界', () => {
  assert.deepEqual(
    collectBadSelectors('@media (max-width: 600px) { .mumu-panel { color: red; } }'),
    [],
    '@media 内的 .mumu-* 规则不应判为越界'
  );
  assert.deepEqual(
    collectBadSelectors('@keyframes mumu-fade { from { opacity: 0; } to { opacity: 1; } }'),
    [],
    '@keyframes 的 from / to 帧标签不应判为越界'
  );
});

test('扩展样式校验器自测：顶层与 @media 内的越界选择器都能抓到', () => {
  assert.deepEqual(collectBadSelectors('.other { color: red; }'), ['.other']);
  assert.deepEqual(collectBadSelectors('@media x { .other { color: red; } }'), ['.other']);
});

test('运行时隔离：除 cards/ 自身与白名单外没有模块引用 cards/loader（含 index.html）', () => {
  const files = readdirSync(`${ROOT}scripts`, { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('.js'))
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => !f.startsWith('cards/'))
    // 白名单只放未来图鉴容器（P4-5）；其余任何引用都要先移除，而不是放宽这条护栏。
    .filter((f) => !ALLOWED_LOADER_CONSUMERS.includes(f));
  const offenders = files.filter((f) => readFileSync(`${ROOT}scripts/${f}`, 'utf8').includes('cards/loader'));
  assert.deepEqual(
    offenders,
    [],
    `这些模块引用了 cards/loader：${offenders.join(' / ')}。` +
      '若非 P4-5 图鉴接入，请移除对该模块的引用；' +
      '若是图鉴接入，请把模块加入 ALLOWED_LOADER_CONSUMERS。'
  );
  // 页面本身也不得直接接线 cards 加载器（最容易发生的误接入方式）。
  const html = readFileSync(`${ROOT}index.html`, 'utf8');
  assert.ok(!html.includes('cards/loader'), 'index.html 不应引用 cards/loader');
});

test('令牌：z 序关系 modal < overlay < boot < toast', () => {
  const css = readFileSync(`${ROOT}styles/tokens.css`, 'utf8');
  const readZ = (name) => {
    const m = new RegExp(`--mumu-z-${name}\\s*:\\s*(\\d+)\\s*;`).exec(css);
    assert.ok(m, `缺少 --mumu-z-${name}`);
    return Number(m[1]);
  };
  const z = { modal: readZ('modal'), overlay: readZ('overlay'), boot: readZ('boot'), toast: readZ('toast') };
  assert.ok(z.modal < z.overlay, `modal(${z.modal}) 应低于 overlay(${z.overlay})`);
  assert.ok(z.overlay < z.boot, `overlay(${z.overlay}) 应低于 boot(${z.boot})`);
  assert.ok(z.boot < z.toast, `boot(${z.boot}) 应低于 toast(${z.toast})`);
});

test('index.html：#ui-layer 是带 mumu-ui-layer 类的空层且在 #modal-root 之前', () => {
  const html = readFileSync(`${ROOT}index.html`, 'utf8');
  const tag = /<div id="ui-layer"([^>]*)><\/div>/.exec(html);
  assert.ok(tag, '#ui-layer 应为 <div id="ui-layer" …></div> 形式的空元素');
  assert.match(tag[1], /class="mumu-ui-layer"/, '#ui-layer 必须带 class="mumu-ui-layer"');
  assert.match(tag[1], /data-slot="overlay"/, '#ui-layer 必须带 data-slot="overlay"');
  const layerAt = html.indexOf('id="ui-layer"');
  const modalAt = html.indexOf('id="modal-root"');
  assert.ok(layerAt >= 0 && modalAt >= 0, '缺少 #ui-layer 或 #modal-root');
  assert.ok(layerAt < modalAt, '#ui-layer 必须在 #modal-root 之前');
});

test('index.html：样式链接恰为 main → tokens → extensions 三条', () => {
  const html = readFileSync(`${ROOT}index.html`, 'utf8');
  const links = [...html.matchAll(/href="\.\/styles\/([\w-]+\.css)"/g)].map((m) => m[1]);
  assert.deepEqual(links, ['main.css', 'tokens.css', 'extensions.css']);
});

test('令牌：12 个颜色 / 字体令牌齐全且兜底非空', () => {
  const css = readFileSync(`${ROOT}styles/tokens.css`, 'utf8');
  const colors = ['ink', 'cream', 'amber', 'rose', 'plum', 'dusk', 'night', 'glass', 'glass-border', 'text-soft'];
  const fonts = ['serif', 'sans'];
  const names = [
    ...colors.map((n) => `--mumu-color-${n}`),
    ...fonts.map((n) => `--mumu-font-${n}`),
  ];
  for (const name of names) {
    const m = new RegExp(`${name}\\s*:\\s*var\\(([^;]*)\\);`).exec(css);
    assert.ok(m, `缺少令牌 ${name}`);
    const body = m[1];
    const commaAt = body.indexOf(',');
    assert.ok(commaAt >= 0, `${name} 应写成 var(--x, 兜底) 形式`);
    const fallback = body.slice(commaAt + 1).replace(/\)+$/, '').trim();
    assert.ok(fallback.length > 0, `${name} 的 var() 兜底不能为空`);
  }
});

test('悬浮层：定位与层级声明齐全', () => {
  const css = readFileSync(`${ROOT}styles/extensions.css`, 'utf8');
  const block = /\.mumu-ui-layer\s*\{([^}]*)\}/.exec(css);
  assert.ok(block, '缺少 .mumu-ui-layer 规则');
  assert.match(block[1], /position:\s*fixed\s*;/, '悬浮层必须是 position: fixed');
  assert.match(block[1], /inset:\s*0\s*;/, '悬浮层必须铺满视口（inset: 0）');
  assert.match(
    block[1],
    /z-index:\s*var\(--mumu-z-overlay,\s*70\)\s*;/,
    '悬浮层层级必须取 --mumu-z-overlay 并带 70 兜底'
  );
});
