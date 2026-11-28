/* ============================================================
   暮幕 · 图鉴「自定义卡片」页
   ------------------------------------------------------------
   用户上传本地图片自制全息卡，右侧是 holo-card 编辑面板里那 12 项。

   两条硬约束：
   1) 面板参数只写进 mumu.customcards.fx.v1，只作用于本页的卡片视图；
      内置角色卡走 gallery-card.js 里写死的参数，两者不共享任何状态。
   2) 星级上限 5 星由 custom-cards-data.js（normalizeFx / clampStar）
      和这里的渲染共同把关。

   新增 / 上传 / 删除都在卡片自身与页顶入口，面板不放按钮。
   ============================================================ */

import { buildHoloCard } from './gallery-card.js';
import {
  ASPECTS,
  MAX_CARDS,
  MAX_IMAGE_EDGE,
  MAX_NAME,
  MAX_STARS,
  MAX_TITLE,
  PATTERNS,
  clampStar,
  downscaleSize,
  imageTypeForAlpha,
  newCard,
  nextId,
  normalizeFx,
  readCards,
  readFx,
  stepIndex,
  writeCards,
  writeFx,
} from './custom-cards-data.js';

const ASPECT_LABEL = {
  '4 / 5': '4 : 5',
  '3 / 4': '3 : 4',
  '2 / 3': '2 : 3',
  '1 / 1': '1 : 1',
  '16 / 9': '16 : 9',
};
const PATTERN_LABEL = {
  none: '无（整面铺满）',
  stripes: '斜纹',
  grating: '光栅',
  dots: '星点',
  hex: '蜂窝',
};

/* 上传图超过这个体积直接拒，避免白白解码一遍 */
const MAX_FILE_BYTES = 12 * 1024 * 1024;
const JPEG_QUALITY = 0.86;
/* 「确认删除」的窗口，超时自动还原按钮 */
const CONFIRM_MS = 3500;

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function fmt(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('这张图片读不出来，换一张试试'));
    img.src = src;
  });
}

/** 采样判断是否透明底（剪影 PNG 要走 contain + PNG 编码）。 */
function detectAlpha(ctx, w, h) {
  let data = null;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch (e) {
    return false;
  }
  const cols = Math.min(48, w);
  const rows = Math.min(60, h);
  let clear = 0;
  let total = 0;
  for (let r = 0; r < rows; r += 1) {
    const y = Math.floor(((r + 0.5) * h) / rows);
    for (let c = 0; c < cols; c += 1) {
      const x = Math.floor(((c + 0.5) * w) / cols);
      total += 1;
      if (data[(y * w + x) * 4 + 3] < 250) clear += 1;
    }
  }
  return total > 0 && clear / total > 0.08;
}

/** 文件 → 缩放后的 dataURL + 透明底标记。 */
async function fileToImage(file) {
  if (!file) throw new Error('没拿到文件');
  if (!/^image\//i.test(file.type || '')) throw new Error('只能上传图片文件（png / jpg / webp）');
  if (file.size > MAX_FILE_BYTES) throw new Error('这张图超过 12MB，先压一下再传');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const { w, h } = downscaleSize(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_IMAGE_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const alpha = detectAlpha(ctx, w, h);
    return { image: canvas.toDataURL(imageTypeForAlpha(alpha), JPEG_QUALITY), alpha };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ==========================================================================
   面板（严格照截图那 12 行，一项不多一项不少）
   ========================================================================== */
function buildPanel(fx, onInput) {
  const panel = el('aside', 'mumu-ccard__panel');
  panel.appendChild(el('h4', 'mumu-ccard__panel-title', '效果调节'));
  panel.appendChild(el('p', 'mumu-ccard__panel-note', '只作用于下方的自定义卡片'));

  const rows = [];
  const addRow = (node) => { rows.push(node); panel.appendChild(node); return node; };

  const slider = (key, label, { min, max, step, digits = 2, int = false }) => {
    const row = el('div', 'mumu-ccard__row');
    const lab = el('label', null, label);
    const out = el('output', 'mumu-ccard__out');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(fx[key] == null ? (int ? min : 0.3) : fx[key]);
    lab.htmlFor = `cc-${key}`;
    input.id = `cc-${key}`;
    out.textContent = fx[key] == null && key === 'foil' ? '自动' : fmt(fx[key], digits);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = key === 'foil' ? `手动 ${fmt(v)}` : (int ? String(Math.round(v)) : fmt(v));
      onInput(key, int ? Math.round(v) : v);
    });
    row.appendChild(lab);
    row.appendChild(out);
    row.appendChild(input);
    addRow(row);
    return { input, out, int, digits, key };
  };

  const select = (key, label, entries) => {
    const row = el('div', 'mumu-ccard__row');
    const lab = el('label', null, label);
    const box = document.createElement('select');
    box.id = `cc-${key}`;
    lab.htmlFor = box.id;
    for (const [value, text] of entries) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      box.appendChild(opt);
    }
    box.value = String(fx[key]);
    box.addEventListener('change', () => onInput(key, box.value));
    row.appendChild(lab);
    row.appendChild(box);
    addRow(row);
    return { box, key };
  };

  const checkbox = (key, label) => {
    const row = el('div', 'mumu-ccard__row mumu-ccard__row--check');
    const lab = el('label', null, label);
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = `cc-${key}`;
    lab.htmlFor = box.id;
    box.checked = !!fx[key];
    box.addEventListener('change', () => onInput(key, box.checked));
    row.appendChild(lab);
    row.appendChild(box);
    addRow(row);
    return { box, key };
  };

  const controls = {
    holo: slider('holo', '彩虹强度', { min: 0, max: 1, step: 0.05 }),
    foil: slider('foil', '覆膜强度', { min: 0, max: 1, step: 0.05 }),
    glare: slider('glare', '高光', { min: 0, max: 1.5, step: 0.05 }),
    tilt: slider('tilt', '倾斜角度', { min: 0, max: 40, step: 1, int: true }),
    parallax: slider('parallax', '视差', { min: 0, max: 30, step: 1, int: true }),
    radius: slider('radius', '圆角', { min: 0, max: 32, step: 1, int: true }),
    theme: select('theme', '主题', [['dark', '暗色'], ['light', '亮色']]),
    aspect: select('aspect', '画幅', ASPECTS.map((a) => [a, ASPECT_LABEL[a] || a])),
    pattern: select('pattern', '箔层花纹', PATTERNS.map((p) => [p, PATTERN_LABEL[p] || p])),
    stars: select('stars', '星星颗数', Array.from({ length: MAX_STARS }, (_, i) => [String(i + 1), `${i + 1} 颗`])),
    rating: slider('rating', '批量星级', { min: 0, max: MAX_STARS, step: 1, int: true }),
    showStars: checkbox('showStars', '显示星级'),
  };

  const sync = (next) => {
    controls.holo.input.value = String(next.holo);
    controls.holo.out.textContent = fmt(next.holo);
    controls.foil.input.value = String(next.foil == null ? 0.3 : next.foil);
    controls.foil.out.textContent = next.foil == null ? '自动' : fmt(next.foil);
    controls.glare.input.value = String(next.glare);
    controls.glare.out.textContent = fmt(next.glare);
    controls.tilt.input.value = String(next.tilt);
    controls.tilt.out.textContent = String(next.tilt);
    controls.parallax.input.value = String(next.parallax);
    controls.parallax.out.textContent = String(next.parallax);
    controls.radius.input.value = String(next.radius);
    controls.radius.out.textContent = String(next.radius);
    controls.theme.box.value = next.theme;
    controls.aspect.box.value = next.aspect;
    controls.pattern.box.value = next.pattern;
    controls.stars.box.value = String(next.stars);
    controls.rating.input.max = String(next.stars);
    controls.rating.input.value = String(next.rating);
    controls.rating.out.textContent = String(next.rating);
    controls.showStars.box.checked = next.showStars;
  };
  sync(fx);

  panel.appendChild(el('p', 'mumu-ccard__panel-hint',
    '名字 / 身份：点卡片上的文字直接改，回车保存、Esc 撤销。\n星级：点卡面底部小星星设这一张，再点最亮那颗退一颗；「批量星级」改全部。\n换图：把图片拖到卡片上，或悬停卡片点「换图」。'));

  return { el: panel, sync };
}

/* ==========================================================================
   整页
   ========================================================================== */
export function buildCustomCardsPane({ notice = () => {}, inspect = null } = {}) {
  let fx = normalizeFx(readFx());
  let cards = readCards(undefined, fx.stars);
  const views = new Map();
  let pickerTarget = null;      // null = 新增一批，'cc-N' = 只换这张的图
  let confirmTimer = 0;
  let destroyed = false;

  const root = el('div', 'mumu-ccard');
  root.setAttribute('role', 'tabpanel');
  root.setAttribute('aria-label', '自定义卡片');

  const stage = el('div', 'mumu-ccard__stage');
  const bar = el('div', 'mumu-ccard__bar');
  const barText = el('div', 'mumu-ccard__bar-text');
  barText.appendChild(el('h3', 'mumu-ccard__h', '自定义卡片'));
  const counter = el('p', 'mumu-ccard__count');
  barText.appendChild(counter);
  bar.appendChild(barText);

  const tools = el('div', 'mumu-ccard__tools');
  const addBtn = el('button', 'mumu-ccard__btn', '＋ 新增卡片');
  addBtn.type = 'button';
  const uploadBtn = el('button', 'mumu-ccard__btn mumu-ccard__btn--primary', '上传图片');
  uploadBtn.type = 'button';
  tools.appendChild(addBtn);
  tools.appendChild(uploadBtn);
  bar.appendChild(tools);
  stage.appendChild(bar);

  const grid = el('div', 'mumu-ccard__grid');
  stage.appendChild(grid);
  root.appendChild(stage);

  const panel = buildPanel(fx, onFxChange);
  root.appendChild(panel.el);

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.multiple = true;
  picker.hidden = true;
  picker.dataset.ccPicker = '';
  root.appendChild(picker);

  /* ---------- 存 ---------- */
  function persist() {
    if (destroyed) return;
    const status = writeCards(cards);
    if (status === 'stripped') notice('卡片存下了，但图片太大没存进去 · 重新上传即可');
    else if (status === 'failed') notice('这个浏览器的本地空间不够，卡片没能保存');
  }

  function updateCounter() {
    counter.textContent = `${cards.length} / ${MAX_CARDS} 张 · 星级最多 ${MAX_STARS} 星`;
  }

  /* ---------- 单张卡 ---------- */
  function makeView(card) {
    const item = el('div', 'mumu-ccard__item');
    item.dataset.cid = card.id;

    // 改完文字后重算压暗层（有名字才有底部渐变），再落盘
    const onCommit = () => {
      const view = views.get(card.id);
      if (view) view.refs.setFx(fx);
      persist();
    };

    const { el: cardEl, engine, refs } = buildHoloCard(card, {
      fx,
      interactive: true,
      intro: false,
      onRate: (id, n) => setRating(id, n),
    });
    item.appendChild(cardEl);
    cardEl.title = '单独检视这张卡片';

    // 点卡面放大检视；正在改文字、点星星、点换图/删除时不抢操作
    cardEl.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('.mumu-ccard__op')) return;
      if (t.closest('.mumu-holo-card__star')) return;
      if (t.closest('[contenteditable="true"]')) return;
      openInspect(card.id);
    });

    const ops = el('div', 'mumu-ccard__ops');
    const swap = el('button', 'mumu-ccard__op', '换图');
    swap.type = 'button';
    swap.addEventListener('click', (e) => {
      e.stopPropagation();
      pickerTarget = card.id;
      picker.multiple = false;
      picker.click();
    });
    const del = el('button', 'mumu-ccard__op mumu-ccard__op--danger', '删除');
    del.type = 'button';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (del.dataset.confirm === '1') { removeCard(card.id); return; }
      del.dataset.confirm = '1';
      del.textContent = '确认删除？';
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => {
        delete del.dataset.confirm;
        del.textContent = '删除';
      }, CONFIRM_MS);
    });
    ops.appendChild(swap);
    ops.appendChild(del);
    item.appendChild(ops);

    makeEditable(refs.nameEl, card, 'name', MAX_NAME, onCommit);
    makeEditable(refs.titleEl, card, 'title', MAX_TITLE, onCommit);

    item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('is-drop'); });
    item.addEventListener('dragleave', () => item.classList.remove('is-drop'));
    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.classList.remove('is-drop');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      await applyImage(card.id, file);
    });

    return { item, cardEl, engine, refs };
  }

  function makeEditable(node, card, field, max, onCommit) {
    node.setAttribute('contenteditable', 'true');
    node.setAttribute('spellcheck', 'false');
    node.dataset.ccField = field;
    if (!String(node.textContent || '').trim() && field === 'name') node.textContent = '未命名';
    node.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); node.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); node.textContent = card[field] || '未命名'; node.blur(); }
    });
    node.addEventListener('paste', (e) => {
      e.preventDefault();
      const clip = e.clipboardData || (typeof window !== 'undefined' && window.clipboardData);
      const text = clip ? clip.getData('text') : '';
      document.execCommand('insertText', false, String(text || '').replace(/\s+/g, ' '));
    });
    node.addEventListener('blur', () => {
      const raw = String(node.textContent || '').replace(/[\r\n]+/g, ' ').trim();
      const next = (raw === '未命名' && field === 'name' ? '' : raw).slice(0, max);
      card[field] = next;
      node.textContent = field === 'name' ? (next || '未命名') : next;
      onCommit();
    });
  }

  /* ---------- 增删改 ---------- */
  function addCard(card) {
    cards.push(card);
    const view = makeView(card);
    views.set(card.id, view);
    grid.appendChild(view.item);
    updateCounter();
    hideEmpty();
    return view;
  }

  function removeCard(id) {
    const view = views.get(id);
    if (!view) return;
    try { view.engine && view.engine.destroy(); } catch (e) { /* 已销毁 */ }
    view.item.remove();
    views.delete(id);
    cards = cards.filter((c) => c.id !== id);
    updateCounter();
    persist();
    showEmptyIfNeeded();
    notice('卡片已删除');
  }

  function setRating(id, n) {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    card.rating = clampStar(n);
    const view = views.get(id);
    if (view) view.refs.setFx(fx);
    persist();
  }

  /* ---------- 单独检视（全屏） ---------- */
  // 点卡片本体 → 复用图鉴的详情层放大看这一张，底部可前后翻页。
  // 检视里的星星直接写回同一份 cards，退回列表时卡面同步。
  function openInspect(id) {
    if (!inspect) return;
    const index = cards.findIndex((c) => c.id === id);
    if (index < 0) return;
    const card = cards[index];
    const view = views.get(id);
    inspect({
      card,
      trigger: view ? view.item : null,
      fx,
      onRate: (cid, n) => setRating(cid, n),
      pager: {
        index,
        count: cards.length,
        onStep: (delta) => {
          const next = cards[stepIndex(index, delta, cards.length)];
          if (next) openInspect(next.id);
        },
      },
    });
  }

  async function applyImage(id, file) {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    try {
      const { image, alpha } = await fileToImage(file);
      card.image = image;
      card.alpha = alpha;
      rebuildView(card);
      persist();
      notice('图片已换上');
    } catch (err) {
      notice(err && err.message ? err.message : '图片处理失败，换一张试试');
    }
  }

  async function addCardsFromFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    let added = 0;
    let skipped = 0;
    for (const file of files) {
      if (cards.length >= MAX_CARDS) { skipped += 1; continue; }
      try {
        const { image, alpha } = await fileToImage(file);
        const card = newCard(nextId(cards), fx);
        card.name = (file.name || '新卡片').replace(/\.[^.]+$/, '').slice(0, MAX_NAME) || '新卡片';
        card.image = image;
        card.alpha = alpha;
        card.rating = Math.min(fx.rating, fx.stars);
        addCard(card);
        added += 1;
      } catch (err) {
        notice(err && err.message ? err.message : '有一张图片没读出来，已跳过');
      }
    }
    if (added) persist();
    if (skipped) notice(`最多 ${MAX_CARDS} 张 · 有 ${skipped} 张没加上`);
    else if (added) notice(`已加入 ${added} 张卡片`);
  }

  function rebuildView(card) {
    const old = views.get(card.id);
    const index = old ? Array.prototype.indexOf.call(grid.children, old.item) : -1;
    if (old) {
      try { old.engine && old.engine.destroy(); } catch (e) { /* 已销毁 */ }
      old.item.remove();
      views.delete(card.id);
    }
    const view = makeView(card);
    if (index >= 0 && grid.children[index]) grid.insertBefore(view.item, grid.children[index]);
    else grid.appendChild(view.item);
    views.set(card.id, view);
  }

  /* ---------- 面板联动（只动这一页的卡） ---------- */
  function onFxChange(key, value) {
    const next = { ...fx, [key]: value };
    if (key === 'stars') {
      // 槽位收窄后，超过槽位的星级一起降下来
      for (const card of cards) card.rating = Math.min(clampStar(card.rating), Number(value));
    }
    if (key === 'rating') {
      // 「批量星级」是全部一起改，单张仍可点星再调
      for (const card of cards) card.rating = Math.min(clampStar(value), Number(next.stars));
    }
    fx = normalizeFx(next);
    panel.sync(fx);
    writeFx(fx);
    for (const card of cards) {
      const view = views.get(card.id);
      if (!view) continue;
      view.refs.setFx(fx);
      if (view.engine) view.engine.setShape({ tilt: fx.tilt, parallax: fx.parallax });
    }
    if (key === 'stars' || key === 'rating') persist();
  }

  /* ---------- 空态 / 拖放 ---------- */
  const empty = el('div', 'mumu-ccard__empty');
  empty.appendChild(el('p', 'mumu-ccard__empty-title', '还没有自定义卡片'));
  empty.appendChild(el('p', 'mumu-ccard__empty-sub', '点「新增卡片」做一张空卡，或直接把图片拖进来。'));
  function hideEmpty() { if (empty.isConnected) empty.remove(); }
  function showEmptyIfNeeded() {
    if (!cards.length && !empty.isConnected) grid.appendChild(empty);
  }

  grid.addEventListener('dragover', (e) => { e.preventDefault(); grid.classList.add('is-drop'); });
  grid.addEventListener('dragleave', () => grid.classList.remove('is-drop'));
  grid.addEventListener('drop', (e) => {
    const hit = e.target && typeof e.target.closest === 'function'
      ? e.target.closest('.mumu-ccard__item')
      : null;
    if (hit) return;                 // 卡片自己处理换图
    e.preventDefault();
    grid.classList.remove('is-drop');
    addCardsFromFiles(e.dataTransfer && e.dataTransfer.files);
  });

  addBtn.addEventListener('click', () => {
    if (cards.length >= MAX_CARDS) { notice(`最多 ${MAX_CARDS} 张 · 先删掉几张吧`); return; }
    const card = newCard(nextId(cards), fx);
    const view = addCard(card);
    persist();
    view.item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setTimeout(() => { try { view.refs.nameEl.focus(); } catch (e) { /* 忽略 */ } }, 120);
  });

  uploadBtn.addEventListener('click', () => {
    pickerTarget = null;
    picker.multiple = true;
    picker.click();
  });

  picker.addEventListener('change', async () => {
    const files = Array.from(picker.files || []);
    const target = pickerTarget;
    picker.value = '';
    pickerTarget = null;
    if (!files.length) return;
    if (target) await applyImage(target, files[0]);
    else await addCardsFromFiles(files);
  });

  /* ---------- 渲染 ---------- */
  function renderAll() {
    for (const { engine } of views.values()) {
      try { engine && engine.destroy(); } catch (e) { /* 已销毁 */ }
    }
    views.clear();
    grid.replaceChildren();
    for (const card of cards) {
      const view = makeView(card);
      views.set(card.id, view);
      grid.appendChild(view.item);
    }
    updateCounter();
    showEmptyIfNeeded();
  }

  renderAll();

  return {
    el: root,
    count: () => cards.length,
    destroy() {
      destroyed = true;
      clearTimeout(confirmTimer);
      for (const { engine } of views.values()) {
        try { engine && engine.destroy(); } catch (e) { /* 已销毁 */ }
      }
      views.clear();
      root.remove();
    },
  };
}
