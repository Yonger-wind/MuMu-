/* ============================================================
   暮幕 · 剧本选择动画（全屏悬浮层）
   - 4 部内置曲目 + 用户导入作品进入同一组 3D 环形封面；
   - 尾部补 7 张“敬请期待”空白剧本；
   - 真实条目 > 10 时由 main.js 改回原陈列，本模块不参与判断；
   - 章节抽屉内可试听章节、导出、给导入作品换封面。
   ============================================================ */

import { buildSelection } from './selector-data.js';
import { AI_DISCLAIMER } from './series-meta.js';
import { getLatestSaveFor } from './storage.js';
import { createCarousel } from './carousel.js';
import { esc } from './modals.js';

const COVER_W = 620;
const COVER_H = 830;

const BUILTIN_COVERS = {
  cicada: './assets/images/covers/cicada-dusk.jpg',
  qinglv: './assets/images/covers/qinglv-spring.jpg',
  vortex: './assets/images/starry-night.png',
  moonlight: './assets/images/pathetique-score.png',
};

const SOON_PALETTE = [
  ['#2a1838', '#8a4a5a', '#f0a05e'],
  ['#1d2438', '#4a5a7a', '#a8c0e0'],
  ['#2a2418', '#7a6a4a', '#e8d0a0'],
  ['#1c2a2a', '#4a7a6a', '#a8d0c0'],
  ['#2a1824', '#8a3a5a', '#e8a0b0'],
  ['#231a32', '#5a4a7a', '#c0a8e0'],
  ['#2a2018', '#8a5a3a', '#e8b080'],
];

const $ = (sel, root = document) => root.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');

let overlay = null;
let carousel = null;
let entries = [];
let items = [];
let callbacks = {};
let lastFocus = null;
let homeState = null;
let noticeTimer = 0;
let keyHandler = null;
let drawerEntry = null;
let pendingCoverKey = '';
let coverInput = null;
let goBooted = false;
let goTimer = 0;
let goRaf = 0;
let resizeHandler = null;
// 关闭按钮文案：从首页进入是「返回首页」，从剧情里查看章节时可改成「返回剧情」
let closeLabelText = '返回首页';
// 剧情内的「选章节」面板模式：只有抽屉，没有环形卡带
let chapterMode = false;

function layerRoot() {
  return document.getElementById('ui-layer') || document.body;
}

/* ---------------- 首页 inert / 焦点 ---------------- */
function lockHome() {
  const home = document.getElementById('home');
  if (!home) { homeState = null; return; }
  homeState = {
    inert: home.hasAttribute('inert'),
    hidden: home.getAttribute('aria-hidden'),
  };
  home.setAttribute('inert', '');
  home.setAttribute('aria-hidden', 'true');
}

function unlockHome() {
  const home = document.getElementById('home');
  if (!home || !homeState) return;
  if (!homeState.inert) home.removeAttribute('inert');
  if (homeState.hidden == null) home.removeAttribute('aria-hidden');
  else home.setAttribute('aria-hidden', homeState.hidden);
  homeState = null;
}

/* ---------------- Canvas 封面 ---------------- */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function seeded(seed) {
  let s = Math.abs(Math.floor(seed)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function spacedText(ctx, text, cx, y, gap) {
  const chars = [...String(text || '')];
  if (!chars.length) return;
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
  let x = cx - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < chars.length; i += 1) {
    ctx.fillText(chars[i], x, y);
    x += widths[i] + gap;
  }
  ctx.textAlign = align;
}

function canvasCover(draw) {
  const c = document.createElement('canvas');
  c.width = COVER_W;
  c.height = COVER_H;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  try {
    draw(ctx);
    return c.toDataURL('image/jpeg', 0.9);
  } catch (e) {
    return '';
  }
}

function drawSoonCover(ctx, index) {
  const [top, mid, glow] = SOON_PALETTE[index % SOON_PALETTE.length];
  const bg = ctx.createLinearGradient(0, 0, COVER_W, COVER_H);
  bg.addColorStop(0, top);
  bg.addColorStop(0.55, mid);
  bg.addColorStop(1, '#100b1c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, COVER_W, COVER_H);

  const halo = ctx.createRadialGradient(COVER_W / 2, 610, 20, COVER_W / 2, 610, 390);
  halo.addColorStop(0, `${glow}66`);
  halo.addColorStop(1, `${glow}00`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, COVER_W, COVER_H);

  // 空舞台的弧线
  ctx.save();
  ctx.strokeStyle = 'rgba(255,244,230,0.10)';
  ctx.lineWidth = 1.2;
  for (const r of [128, 188, 250, 318]) {
    ctx.beginPath();
    ctx.ellipse(COVER_W / 2, 585, r, r * 0.28, 0, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();
  }
  ctx.restore();

  // 尘埃
  const rnd = seeded(97 + index * 31);
  for (let i = 0; i < 34; i += 1) {
    const x = 38 + rnd() * (COVER_W - 76);
    const y = 70 + rnd() * (COVER_H - 140);
    const a = 0.05 + rnd() * 0.22;
    ctx.fillStyle = `rgba(255,244,230,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + rnd() * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 内框
  ctx.strokeStyle = 'rgba(255,244,230,0.18)';
  ctx.lineWidth = 1;
  roundRect(ctx, 26, 26, COVER_W - 52, COVER_H - 52, 16);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,244,230,0.58)';
  ctx.font = '500 13px "Helvetica Neue", Arial, sans-serif';
  spacedText(ctx, 'MUMU · STORY', COVER_W / 2, 118, 5);

  ctx.fillStyle = 'rgba(255,244,230,0.94)';
  ctx.font = '600 62px "Noto Serif SC", "Songti SC", "STSong", serif';
  spacedText(ctx, '敬请期待', COVER_W / 2, 420, 12);

  ctx.strokeStyle = 'rgba(255,244,230,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(COVER_W / 2 - 82, 485);
  ctx.lineTo(COVER_W / 2 + 82, 485);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,244,230,0.52)';
  ctx.font = '500 13px "Helvetica Neue", Arial, sans-serif';
  spacedText(ctx, 'COMING SOON', COVER_W / 2, 526, 7);

  ctx.fillStyle = 'rgba(255,244,230,0.24)';
  ctx.font = '500 22px "Noto Serif SC", "Songti SC", serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${pad(index + 1)}`, COVER_W - 58, COVER_H - 62);
  ctx.textAlign = 'left';

  // 上下压暗，避免纯色块
  const veil = ctx.createLinearGradient(0, 0, 0, COVER_H);
  veil.addColorStop(0, 'rgba(8,6,18,0.32)');
  veil.addColorStop(0.36, 'rgba(8,6,18,0)');
  veil.addColorStop(0.72, 'rgba(8,6,18,0)');
  veil.addColorStop(1, 'rgba(8,6,18,0.5)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
}

function splitTitle(title, max = 6) {
  const chars = [...String(title || '未命名')];
  const lines = [];
  for (let i = 0; i < chars.length; i += max) lines.push(chars.slice(i, i + max).join(''));
  return lines.slice(0, 3);
}

function drawFallbackCover(ctx, entry, index) {
  const seed = [...String(entry.key || 'mumu')].reduce((n, c) => n + c.charCodeAt(0), 0);
  const hue = (seed * 17 + index * 23) % 360;
  const bg = ctx.createLinearGradient(0, 0, COVER_W, COVER_H);
  bg.addColorStop(0, `hsl(${hue} 34% 15%)`);
  bg.addColorStop(0.56, `hsl(${(hue + 24) % 360} 30% 28%)`);
  bg.addColorStop(1, '#100b1c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, COVER_W, COVER_H);

  const halo = ctx.createRadialGradient(COVER_W / 2, 590, 20, COVER_W / 2, 590, 380);
  halo.addColorStop(0, 'rgba(255,157,87,0.28)');
  halo.addColorStop(1, 'rgba(255,157,87,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, COVER_W, COVER_H);

  ctx.strokeStyle = 'rgba(255,244,230,0.18)';
  ctx.lineWidth = 1;
  roundRect(ctx, 26, 26, COVER_W - 52, COVER_H - 52, 16);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,244,230,0.58)';
  ctx.font = '500 13px "Helvetica Neue", Arial, sans-serif';
  spacedText(ctx, 'MUMU · ORIGINAL', COVER_W / 2, 118, 4.5);

  const lines = splitTitle(entry.title, 6);
  const lineH = 66;
  const startY = 380 - ((lines.length - 1) * lineH) / 2;
  ctx.fillStyle = 'rgba(255,244,230,0.94)';
  ctx.font = '600 46px "Noto Serif SC", "Songti SC", "STSong", serif';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => ctx.fillText(line, COVER_W / 2, startY + i * lineH));

  ctx.strokeStyle = 'rgba(255,244,230,0.28)';
  ctx.beginPath();
  ctx.moveTo(COVER_W / 2 - 74, startY + lines.length * lineH + 18);
  ctx.lineTo(COVER_W / 2 + 74, startY + lines.length * lineH + 18);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,244,230,0.5)';
  ctx.font = '500 12px "Helvetica Neue", Arial, sans-serif';
  spacedText(ctx, entry.custom ? 'IMPORTED STORY' : 'MUMU STORY', COVER_W / 2, startY + lines.length * lineH + 58, 4);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,244,230,0.22)';
  ctx.font = '500 22px "Noto Serif SC", "Songti SC", serif';
  ctx.fillText(pad(index + 1), COVER_W - 58, COVER_H - 62);
  ctx.textAlign = 'left';

  const veil = ctx.createLinearGradient(0, 0, 0, COVER_H);
  veil.addColorStop(0, 'rgba(8,6,18,0.32)');
  veil.addColorStop(0.36, 'rgba(8,6,18,0)');
  veil.addColorStop(0.72, 'rgba(8,6,18,0)');
  veil.addColorStop(1, 'rgba(8,6,18,0.5)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, COVER_W, COVER_H);
}

function resolveCover(entry, index) {
  if (entry.kind === 'soon') {
    return { src: canvasCover((ctx) => drawSoonCover(ctx, index)), fallback: '' };
  }
  const fallback = canvasCover((ctx) => drawFallbackCover(ctx, entry, index));
  const builtin = BUILTIN_COVERS[entry.key];
  if (builtin) return { src: builtin, fallback };
  if (entry.coverImage) return { src: entry.coverImage, fallback };
  return { src: fallback, fallback: '' };
}

/* ---------------- 图片转封面 ---------------- */
function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function fileToCover(file) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('请选择一张图片作为封面。');
  if (file.size > 18 * 1024 * 1024) throw new Error('图片太大，请选择 18MB 以内的图片。');
  const url = URL.createObjectURL(file);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);
  if (!img || !img.width || !img.height) throw new Error('这张图片无法读取。');
  const c = document.createElement('canvas');
  c.width = COVER_W;
  c.height = COVER_H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法处理封面。');
  ctx.fillStyle = '#160f26';
  ctx.fillRect(0, 0, COVER_W, COVER_H);
  const scale = Math.max(COVER_W / img.width, COVER_H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (COVER_W - w) / 2, (COVER_H - h) / 2, w, h);
  return c.toDataURL('image/jpeg', 0.84);
}

/* ---------------- 结构 ---------------- */
/**
 * chapterOnly：剧情里的「选章节」模式。只留右侧章节抽屉 + 半透 veil，
 * 不再铺整页剧目底色、也不生成环形卡带那几个区块 —— 换章节不该先跳一趟剧本选择页。
 * 此时抽屉右上角的关闭按钮改用文字（「返回剧情」），点它 / 点 veil / 按 Esc 都直接关掉整个面板。
 */
function buildOverlay(chapterOnly = false) {
  const wrap = document.createElement('div');
  wrap.className = 'mumu-scripts' + (chapterOnly ? ' mumu-scripts--chapter' : '');
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', chapterOnly ? '选择章节' : '选择剧本');
  const shell = chapterOnly ? '' : `
    <header class="mumu-scripts__head">
      <div class="mumu-scripts__brand">
        <span class="mumu-scripts__mark">暮幕</span>
        <span class="mumu-scripts__sub">剧目选择</span>
      </div>
      <div class="mumu-scripts__head-r">
        <button type="button" class="mumu-scripts__link" data-select-import>导入剧本</button>
        <button type="button" class="mumu-scripts__link" data-select-close>${esc(closeLabelText)}</button>
      </div>
    </header>
    <main class="mumu-scripts__stage" data-select-stage>
      <button type="button" class="mumu-scripts__arrow mumu-scripts__arrow--prev" data-select-prev aria-label="上一个剧本">〈</button>
      <button type="button" class="mumu-scripts__arrow mumu-scripts__arrow--next" data-select-next aria-label="下一个剧本">〉</button>
      <button type="button" class="mumu-scripts__go" data-select-go hidden>开始体验</button>
    </main>
    <section class="mumu-scripts__caption" aria-live="polite">
      <h2 class="mumu-scripts__title" data-select-title></h2>
      <p class="mumu-scripts__meta" data-select-meta></p>
      <p class="mumu-scripts__brief" data-select-brief></p>
      <div class="mumu-scripts__notice" role="status" aria-live="polite" data-select-notice></div>
    </section>
    <footer class="mumu-scripts__foot">
      <span class="mumu-scripts__hint">拖动 · 滚轮 · ← → 浏览，回车或点「开始体验」进入</span>
      <span class="mumu-scripts__count" data-select-count></span>
    </footer>`;
  const closeBtn = chapterOnly
    ? `<button type="button" class="mumu-scripts__sheet-close mumu-scripts__sheet-close--label" data-drawer-close>${esc(closeLabelText)}</button>`
    : `<button type="button" class="mumu-scripts__sheet-close" data-drawer-close aria-label="关闭章节列表">✕</button>`;
  wrap.innerHTML = `
    <div class="mumu-scripts__bg" aria-hidden="true"></div>
    <div class="mumu-scripts__grain" aria-hidden="true"></div>
    ${shell}
    <p class="mumu-scripts__disclaimer">${esc(AI_DISCLAIMER)}</p>
    <div class="mumu-scripts__drawer" data-select-drawer aria-hidden="true">
      <div class="mumu-scripts__drawer-veil" data-drawer-close></div>
      <section class="mumu-scripts__sheet" role="dialog" aria-modal="true" aria-label="选择章节">
        <header class="mumu-scripts__sheet-head">
          <div class="mumu-scripts__sheet-titles">
            <h3 class="mumu-scripts__sheet-title" data-drawer-title></h3>
            <p class="mumu-scripts__sheet-meta" data-drawer-meta></p>
          </div>
          ${closeBtn}
        </header>
        <div class="mumu-scripts__chap-list" data-drawer-list></div>
        <footer class="mumu-scripts__sheet-foot" data-drawer-actions hidden></footer>
      </section>
    </div>`;
  return wrap;
}

/* ---------------- 提示 / 字幕 ---------------- */
function noticeHost() {
  if (!overlay) return null;
  // 章节面板模式没有剧目字幕区：把提示挂到面板层上，反馈不能静默消失
  let box = $('[data-select-notice]', overlay);
  if (box) return box;
  box = document.createElement('div');
  box.className = 'mumu-scripts__notice';
  box.dataset.selectNotice = '';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  overlay.appendChild(box);
  return box;
}

function showNotice(text, tone = '') {
  const notice = noticeHost();
  if (!notice) return;
  notice.textContent = text;
  notice.className = 'mumu-scripts__notice is-show' + (tone ? ` is-${tone}` : '');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    if (!notice.isConnected) return;
    notice.classList.remove('is-show');
  }, 2800);
}

/* ---------------- 开始体验（居中封面下方） ---------------- */
function placeGo() {
  const go = overlay && $('[data-select-go]', overlay);
  const stage = overlay && $('[data-select-stage]', overlay);
  if (!go || !stage || go.hidden || !carousel) return;
  const card = overlay.querySelector(`[data-mumu-cc-index="${carousel.active}"]`);
  const face = card && card.querySelector('.mumu-cc__face');
  if (!face) return;
  const sr = stage.getBoundingClientRect();
  const fr = face.getBoundingClientRect();
  if (!fr.width || !fr.height) return;
  go.style.left = `${Math.round(fr.left + fr.width / 2 - sr.left)}px`;
  go.style.top = `${Math.round(fr.bottom - sr.top + 14)}px`;
}

/** 卡片移动时不跟随，落位后再贴到当前封面正下方；占位卡不出现。 */
function scheduleGo(delay = 0) {
  const go = overlay && $('[data-select-go]', overlay);
  clearTimeout(goTimer);
  cancelAnimationFrame(goRaf);
  if (!go || !carousel) return;
  go.classList.add('is-shift');
  goTimer = setTimeout(() => {
    if (!overlay || !carousel) return;
    const entry = entries[carousel.active];
    if (!entry || entry.kind === 'soon') {
      go.hidden = true;
      go.classList.remove('is-shift');
      return;
    }
    go.hidden = false;
    go.setAttribute('aria-label', `开始体验《${entry.title}》`);
    placeGo();
    go.classList.remove('is-shift');
    goRaf = requestAnimationFrame(placeGo);
  }, delay);
}

function paintCaption(index) {
  const entry = entries[index];
  if (!entry || !overlay) return;
  const title = $('[data-select-title]', overlay);
  const meta = $('[data-select-meta]', overlay);
  const brief = $('[data-select-brief]', overlay);
  const count = $('[data-select-count]', overlay);
  if (title) {
    title.textContent = `《${entry.title}》`;
    title.style.animation = 'none';
    void title.offsetWidth;
    title.style.animation = '';
  }
  if (meta) {
    const bits = [];
    if (entry.keyword) bits.push(`<span class="mumu-scripts__kw">${esc(entry.keyword)}</span>`);
    bits.push(`<span>${esc(entry.meta)}</span>`);
    meta.innerHTML = bits.join('<span class="mumu-scripts__dot" aria-hidden="true">·</span>');
  }
  if (brief) brief.textContent = entry.brief || '';
  if (count) count.textContent = `${pad(index + 1)} / ${pad(entries.length)}`;
  overlay.dataset.kind = entry.kind;
  if (goBooted) scheduleGo(620);
}

/* ---------------- 章节抽屉 ---------------- */
function closeDrawer({ focus = true } = {}) {
  if (!overlay) return;
  const drawer = $('[data-select-drawer]', overlay);
  if (!drawer || !drawer.classList.contains('is-open')) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.inert = true;
  overlay.classList.remove('is-dim');
  drawerEntry = null;
  if (carousel) carousel.setPaused(false);
  if (focus) focusCarousel();
}

function focusCarousel() {
  const node = overlay && $('.mumu-cc', overlay);
  if (node) {
    try { node.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
  }
}

function openDrawer(entry) {
  if (!overlay || !entry) return;
  const drawer = $('[data-select-drawer]', overlay);
  if (!drawer) return;
  if (drawerEntry && drawerEntry.key === entry.key && drawer.classList.contains('is-open')) return;
  drawerEntry = entry;

  const title = $('[data-drawer-title]', overlay);
  const meta = $('[data-drawer-meta]', overlay);
  const list = $('[data-drawer-list]', overlay);
  const actions = $('[data-drawer-actions]', overlay);
  if (title) title.textContent = `《${entry.title}》`;
  if (meta) {
    meta.textContent = entry.kind === 'series'
      ? `共 ${entry.count} 章 · 选择一章开始`
      : '单本 · 选择后直接开始';
  }

  if (list) {
    list.innerHTML = entry.chapters.map((c, i) => {
      let save = null;
      try { save = getLatestSaveFor(c.id); } catch (e) { save = null; }
      const chip = save && save.progress
        ? `<span class="mumu-scripts__chip">上次停在 ${Number(save.progress) || 0}%</span>`
        : (i === 0 ? '<span class="mumu-scripts__chip">新的开始</span>' : '');
      const end = entry.kind === 'series' && i === entry.chapters.length - 1
        ? '<span class="mumu-scripts__chip is-end">终章</span>'
        : '';
      return `
        <div class="mumu-scripts__chap">
          <button type="button" class="mumu-scripts__chap-main" data-ch="${esc(c.id)}">
            <span class="mumu-scripts__chap-no">${pad(c.chapterNo || i + 1)}</span>
            <span class="mumu-scripts__chap-text">
              <span class="mumu-scripts__chap-name">${esc(c.tag || c.title)}${chip}${end}</span>
              <span class="mumu-scripts__chap-brief">${esc(c.summary || '')}</span>
            </span>
            <span class="mumu-scripts__chap-go">进入 ▸</span>
          </button>
          <button type="button" class="mumu-scripts__chap-export" data-ch-export="${esc(c.id)}">导出</button>
        </div>`;
    }).join('');
  }

  if (actions) {
    const extra = [];
    if (entry.kind === 'series') extra.push('<button type="button" class="mumu-scripts__action" data-export-series>导出整本</button>');
    if (entry.custom) extra.push('<button type="button" class="mumu-scripts__action" data-cover-pick>选择封面图</button>');
    if (entry.custom) extra.push('<button type="button" class="mumu-scripts__action is-danger" data-remove-entry>移除</button>');
    actions.innerHTML = extra.join('');
    actions.hidden = extra.length === 0;
  }

  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.inert = false;
  overlay.classList.add('is-dim');
  if (carousel) carousel.setPaused(true);
  requestAnimationFrame(() => {
    const first = $('.mumu-scripts__chap-main', drawer);
    const close = $('.mumu-scripts__sheet-close', drawer);
    try { (first || close)?.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
  });
}

/* ---------------- 点击 ---------------- */
function handlePick(index, info = {}) {
  const entry = entries[index];
  if (!entry) return;
  if (entry.kind === 'soon') {
    if (carousel && index !== carousel.active) carousel.focusIndex(index);
    showNotice('这一部还在筹备中 · 敬请期待');
    return;
  }
  if (carousel && index !== carousel.active) {
    carousel.focusIndex(index);
    return;
  }
  // 点击封面只用于把两侧剧本转正，不再进入章节；回车与封面下方的「开始体验」负责进入
  if (info.source === 'key') openDrawer(entry);
}

function handleOverlayClick(e) {
  const t = e.target;
  if (!overlay) return;

  if (t.closest('[data-select-prev]')) {
    if (carousel) carousel.stepBy(-1);
    return;
  }
  if (t.closest('[data-select-next]')) {
    if (carousel) carousel.stepBy(1);
    return;
  }
  if (t.closest('[data-select-go]')) {
    const entry = carousel && entries[carousel.active];
    if (entry && entry.kind !== 'soon') openDrawer(entry);
    return;
  }
  if (t.closest('[data-select-close]')) {
    closeScriptSelect();
    return;
  }
  if (t.closest('[data-select-import]')) {
    const openImport = callbacks.onImport;
    closeScriptSelect({ restoreFocus: false });
    if (openImport) openImport();
    return;
  }
  if (t.closest('[data-drawer-close]')) {
    // 章节面板模式下没有底下的环形选择层，关抽屉就是关面板，退回剧情
    if (chapterMode) closeScriptSelect();
    else closeDrawer();
    return;
  }

  const exportChapter = t.closest('[data-ch-export]');
  if (exportChapter && drawerEntry) {
    const sc = drawerEntry.chapters.find((c) => c.id === exportChapter.dataset.chExport);
    if (sc && callbacks.onExport) callbacks.onExport({ kind: 'work', script: sc });
    return;
  }

  const chapterBtn = t.closest('[data-ch]');
  if (chapterBtn && drawerEntry) {
    const sc = drawerEntry.chapters.find((c) => c.id === chapterBtn.dataset.ch);
    if (!sc) return;
    const onPlay = callbacks.onPlay;
    closeScriptSelect({ restoreFocus: false });
    if (onPlay) onPlay(sc);
    return;
  }

  if (t.closest('[data-export-series]') && drawerEntry) {
    if (callbacks.onExport) callbacks.onExport({ kind: 'series', scripts: drawerEntry.chapters });
    return;
  }

  if (t.closest('[data-cover-pick]') && drawerEntry) {
    pendingCoverKey = drawerEntry.key;
    if (coverInput) {
      coverInput.value = '';
      coverInput.click();
    }
    return;
  }

  if (t.closest('[data-remove-entry]') && drawerEntry) {
    const ids = drawerEntry.chapters.filter((c) => c.builtin !== true).map((c) => c.id);
    if (!ids.length) return;
    const remove = callbacks.onDelete;
    closeDrawer({ focus: false });
    if (remove) remove(ids);
  }
}

/* ---------------- 封面选择 ---------------- */
async function handleCoverFile(file) {
  if (!file || !overlay) return;
  const entry = entries.find((x) => x.key === pendingCoverKey);
  if (!entry || !entry.custom) {
    if (coverInput) coverInput.value = '';
    pendingCoverKey = '';
    return;
  }
  showNotice('正在读取封面…');
  try {
    const dataUrl = await fileToCover(file);
    if (!dataUrl) throw new Error('封面生成失败，请换一张图片试试。');
    entry.coverImage = dataUrl;
    const item = items.find((x) => x.key === entry.key);
    if (item) item.src = dataUrl;
    if (carousel) carousel.relayout(true);
    const res = callbacks.onCover ? callbacks.onCover(entry, dataUrl) : { ok: true };
    if (res && res.ok === false) showNotice(res.error || '封面没有保存成功。', 'warn');
    else showNotice('封面已更新');
  } catch (e) {
    showNotice(e && e.message ? e.message : '封面读取失败。', 'warn');
  } finally {
    pendingCoverKey = '';
    if (coverInput) coverInput.value = '';
  }
}

/* ---------------- 打开 / 关闭 ---------------- */
export function openScriptSelect(options = {}) {
  if (overlay) closeScriptSelect({ restoreFocus: false });
  callbacks = {
    onPlay: options.onPlay,
    onDelete: options.onDelete,
    onExport: options.onExport,
    onImport: options.onImport,
    onCover: options.onCover,
  };

  const selection = buildSelection(options.scripts || []);
  entries = selection.entries;

  // 默认让《漩涡与深蓝：星月夜的回响》居中（左邻《月光》、右邻《青绿》）；
  // 从剧情里点「选章节」时，用 initialKey 把正在体验的曲目直接转到正前方。
  const DEFAULT_SERIES = 'vortex';
  const wanted = String(options.initialKey || '');
  const wantedIndex = wanted ? entries.findIndex((entry) => entry.key === wanted) : -1;
  const defaultIndex = wantedIndex >= 0
    ? wantedIndex
    : Math.max(0, entries.findIndex((entry) => entry.key === DEFAULT_SERIES));
  closeLabelText = options.closeLabel ? String(options.closeLabel) : '返回首页';
  // 剧情里的「选章节」：目标曲目还在，就只开章节面板，不绕一趟剧目选择。
  // 目标丢了（比如剧本刚被删）就退回完整选择层，不把用户关在空面板里。
  chapterMode = options.chapterOnly === true && wantedIndex >= 0
    && !!entries[wantedIndex] && entries[wantedIndex].kind !== 'soon';

  // 封面条目只有环形卡带用得到，章节面板模式下不必合成缩略图
  items = chapterMode ? [] : entries.map((entry, index) => {
    const cover = resolveCover(entry, index);
    return {
      key: entry.key,
      title: entry.title,
      badge: entry.badge,
      src: cover.src,
      fallback: cover.fallback,
    };
  });

  lastFocus = document.activeElement;
  if (lastFocus && typeof lastFocus.blur === 'function') lastFocus.blur();

  overlay = buildOverlay(chapterMode);
  layerRoot().appendChild(overlay);
  lockHome();

  const stage = $('[data-select-stage]', overlay);
  overlay.addEventListener('click', handleOverlayClick);

  coverInput = document.createElement('input');
  coverInput.type = 'file';
  coverInput.accept = 'image/*';
  coverInput.hidden = true;
  coverInput.addEventListener('change', () => handleCoverFile(coverInput.files && coverInput.files[0]));
  overlay.appendChild(coverInput);

  if (chapterMode) {
    // 不建环形卡带：面板落下的同时章节抽屉就滑出来
    overlay.classList.add('is-ready');
    const entry = entries[wantedIndex];
    requestAnimationFrame(() => {
      if (overlay && entry) {
        openDrawer(entry);
        const meta = $('[data-drawer-meta]', overlay);
        if (meta) meta.textContent = `共 ${entry.count || entry.chapters.length} 章 · 换章后从这一章重新开始`;
      }
    });
    keyHandler = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeScriptSelect();
    };
    document.addEventListener('keydown', keyHandler);
    return;
  }

  if (stage) {
    carousel = createCarousel(stage, items, {
      mode: 'ring',
      preset: 'panorama',
      arcStep: window.innerWidth < 720 ? 26 : 30,
      cardWidth: window.innerWidth < 720 ? 300 : 336,
      aspect: 0.75,
      gap: 26,
      curve: 0,
      tilt: -1,
      perspective: 1800,
      panZoom: 3,
      autoplay: 'off',
      speed: 7,
      interval: 3,
      direction: 'left',
      snap: true,
      momentum: 1,
      parallax: 0.3,
      stretch: 0.5,
      depthFade: 0.72,
      fadeColor: '#120d22',
      innerShade: 1,
      cornerRadius: 14,
      captions: false,
      tone: 'color',
      intro: 'rise',
      draggable: true,
      pauseOnHover: true,
      startIndex: defaultIndex,
    }, {
      onActive: paintCaption,
      onPick: handlePick,
    });

    requestAnimationFrame(() => {
      if (carousel) carousel.setReady();
      if (overlay) {
        overlay.classList.add('is-ready');
        focusCarousel();
        goBooted = true;
        scheduleGo(1500);
      }
      // 舞台里的「选章节」：转场落位后直接把这一部的章节抽屉打开
      if (options.openChapters) {
        const entry = entries[defaultIndex];
        if (entry && entry.kind !== 'soon') {
          setTimeout(() => {
            if (overlay && entry) openDrawer(entry);
          }, 480);
        }
      }
    });
  }

  resizeHandler = () => { if (goBooted) scheduleGo(140); };
  window.addEventListener('resize', resizeHandler);

  keyHandler = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    const drawer = overlay && $('[data-select-drawer]', overlay);
    if (drawer && drawer.classList.contains('is-open')) closeDrawer();
    else closeScriptSelect();
  };
  document.addEventListener('keydown', keyHandler);
}

export function closeScriptSelect({ restoreFocus = true } = {}) {
  if (!overlay) return;
  closeDrawer({ focus: false });
  clearTimeout(noticeTimer);
  noticeTimer = 0;
  clearTimeout(goTimer);
  goTimer = 0;
  cancelAnimationFrame(goRaf);
  goRaf = 0;
  goBooted = false;
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  resizeHandler = null;
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  if (carousel) {
    try { carousel.destroy(); } catch (e) { /* 已销毁 */ }
    carousel = null;
  }
  overlay.remove();
  overlay = null;
  entries = [];
  items = [];
  chapterMode = false;
  callbacks = {};
  drawerEntry = null;
  pendingCoverKey = '';
  coverInput = null;
  unlockHome();
  const focus = restoreFocus ? lastFocus : null;
  lastFocus = null;
  if (focus && focus.isConnected) {
    try { focus.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
  }
}

export function isScriptSelectOpen() {
  return !!overlay;
}
