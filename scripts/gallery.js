/* ============================================================
   暮幕 · 角色图鉴页面
   - 首页入口 → 全屏悬浮层（#ui-layer）
   - 四张典藏卡置顶、开局即解锁（星月夜 + 三位创作者）
   - 二十七位角色卡静态陈列；通关章节后随机解锁，解锁后可特殊检视
   - 网格不挂弹簧引擎，只有详情卡挂（保证 31 张卡同屏也轻）
   ============================================================ */

import { SEVEN_CARDS, SERIES, getCard, unlockedCount, totalCount } from './gallery-data.js';
import { loadGallery, isCardUnlocked, grantChapterCards } from './gallery-store.js';
import { buildHoloCard } from './gallery-card.js';
import { buildCustomCardsPane } from './custom-cards.js';
import { GALLERY_DISCLAIMER } from './series-meta.js';

export { grantChapterCards };

const $ = (sel, root = document) => root.querySelector(sel);

let overlay = null;
let detail = null;
let noticeTimer = 0;
let keyHandler = null;
let lastFocus = null;
let homeState = null;
let galleryState = null;
let tabState = 'roles';
let setTabFn = null;
let customPane = null;

function layerRoot() {
  return document.getElementById('ui-layer') || document.body;
}

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

function makeSectionHead(title, sub) {
  const head = document.createElement('div');
  head.className = 'mumu-gallery__section-head';
  const h = document.createElement('h3');
  h.textContent = title;
  const s = document.createElement('span');
  s.textContent = sub;
  head.appendChild(h);
  head.appendChild(s);
  return head;
}

function tabButton(key, label, on) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mumu-gallery__tab' + (on ? ' is-on' : '');
  b.dataset.galleryTab = key;
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-selected', String(on));
  b.textContent = label;
  return b;
}

function cardButton(card, unlocked) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mumu-gcard'
    + (unlocked ? ' is-unlocked' : ' is-locked')
    + (card.kind === 'seven' ? ' is-seven' : '');
  btn.dataset.cardKey = card.key;
  btn.setAttribute(
    'aria-label',
    `${card.name}，${card.identity}，${card.stars} 星${unlocked ? '，点击检视' : '，尚未解锁'}`
  );

  const { el: cardEl } = buildHoloCard(card, { compact: true, dimmed: !unlocked });
  btn.appendChild(cardEl);

  // 典藏卡不再在左上角标星级，星数只由卡面底部实际星点表达。
  if (card.kind !== 'seven') {
    const badge = document.createElement('span');
    badge.className = 'mumu-gcard__badge';
    badge.textContent = unlocked ? '已解锁' : '未解锁';
    btn.appendChild(badge);
  }

  if (unlocked) {
    const hint = document.createElement('span');
    hint.className = 'mumu-gcard__hint';
    hint.textContent = '检视';
    btn.appendChild(hint);
  }
  return btn;
}

function buildGallery(state) {
  const wrap = document.createElement('div');
  wrap.className = 'mumu-gallery';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', '角色图鉴');

  const veil = document.createElement('div');
  veil.className = 'mumu-gallery__veil';
  veil.dataset.galleryClose = '';
  wrap.appendChild(veil);

  const panel = document.createElement('div');
  panel.className = 'mumu-gallery__panel';

  const head = document.createElement('header');
  head.className = 'mumu-gallery__head';
  const titles = document.createElement('div');
  titles.className = 'mumu-gallery__titles';
  const kicker = document.createElement('p');
  kicker.className = 'mumu-gallery__kicker';
  kicker.textContent = 'CHARACTER ARCHIVE';
  const h2 = document.createElement('h2');
  h2.className = 'mumu-gallery__title';
  h2.textContent = '角色图鉴';
  const count = document.createElement('p');
  count.className = 'mumu-gallery__count';
  count.textContent = `已解锁 ${unlockedCount(state.unlocked)} / ${totalCount()} · 通关章节可解锁角色`;
  titles.appendChild(kicker);
  titles.appendChild(h2);
  titles.appendChild(count);
  head.appendChild(titles);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'mumu-gallery__close';
  close.dataset.galleryClose = '';
  close.setAttribute('aria-label', '关闭角色图鉴');
  close.textContent = '✕';
  head.appendChild(close);
  panel.appendChild(head);

  // 两页：角色图鉴（内置卡，参数写死）/ 自定义卡片（用户上传 + 编辑面板）
  const tabs = document.createElement('div');
  tabs.className = 'mumu-gallery__tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '图鉴分页');
  const tabRoles = tabButton('roles', '角色图鉴', true);
  const tabCustom = tabButton('custom', '自定义卡片', false);
  tabs.appendChild(tabRoles);
  tabs.appendChild(tabCustom);
  panel.appendChild(tabs);

  const customHost = document.createElement('div');
  customHost.className = 'mumu-gallery__scroll mumu-gallery__scroll--custom';
  customHost.dataset.galleryPane = 'custom';
  customHost.hidden = true;

  const scroll = document.createElement('div');
  scroll.className = 'mumu-gallery__scroll';
  scroll.dataset.galleryPane = 'roles';

  const sevenSection = document.createElement('section');
  sevenSection.className = 'mumu-gallery__section mumu-gallery__section--seven';
  sevenSection.appendChild(makeSectionHead('典藏 · 精选', '开局即得 · 无需解锁'));
  const sevenGrid = document.createElement('div');
  sevenGrid.className = 'mumu-gallery__grid mumu-gallery__grid--seven';
  for (const card of SEVEN_CARDS) sevenGrid.appendChild(cardButton(card, true));
  sevenSection.appendChild(sevenGrid);
  scroll.appendChild(sevenSection);

  for (const series of SERIES) {
    const section = document.createElement('section');
    section.className = 'mumu-gallery__section';
    const unlockedInSeries = series.characters.filter((c) => state.unlocked[c.key]).length;
    section.appendChild(makeSectionHead(series.title, `${unlockedInSeries} / ${series.characters.length}`));

    const grid = document.createElement('div');
    grid.className = 'mumu-gallery__grid';
    for (const card of series.characters) {
      const full = getCard(card.key) || card;
      grid.appendChild(cardButton(full, !!state.unlocked[card.key]));
    }
    section.appendChild(grid);
    scroll.appendChild(section);
  }

  panel.appendChild(scroll);
  panel.appendChild(customHost);

  const setTab = (name, { focusPane = false } = {}) => {
    const isCustom = name === 'custom';
    if (isCustom && !customPane) {
      customPane = buildCustomCardsPane({
        notice: showNotice,
        // 自定义卡的「单独检视」复用同一个详情层，只是带上 fx、打分回调和翻页
        inspect: ({ card, trigger, fx, onRate, pager }) => openDetail(card, trigger, { fx, onRate, pager }),
      });
      customHost.appendChild(customPane.el);
    }
    scroll.hidden = isCustom;
    customHost.hidden = !isCustom;
    tabRoles.classList.toggle('is-on', !isCustom);
    tabCustom.classList.toggle('is-on', isCustom);
    tabRoles.setAttribute('aria-selected', String(!isCustom));
    tabCustom.setAttribute('aria-selected', String(isCustom));
    tabState = name;
    if (focusPane && isCustom) {
      const first = customHost.querySelector('.mumu-ccard__btn');
      if (first) first.focus({ preventScroll: true });
    }
  };
  tabRoles.addEventListener('click', () => setTab('roles'));
  tabCustom.addEventListener('click', () => setTab('custom', { focusPane: true }));
  setTabFn = setTab;

  const disclaimer = document.createElement('p');
  disclaimer.className = 'mumu-gallery__disclaimer';
  disclaimer.textContent = GALLERY_DISCLAIMER;
  panel.appendChild(disclaimer);

  const notice = document.createElement('p');
  notice.className = 'mumu-gallery__notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  panel.appendChild(notice);

  wrap.appendChild(panel);
  return wrap;
}

function showNotice(text, tone = '') {
  if (!overlay) return;
  const notice = $('.mumu-gallery__notice', overlay);
  if (!notice) return;
  notice.textContent = text;
  notice.className = 'mumu-gallery__notice is-show' + (tone ? ` is-${tone}` : '');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    if (!notice.isConnected) return;
    notice.classList.remove('is-show');
  }, 3200);
}

function closeDetail() {
  if (!detail) return;
  const trigger = detail.trigger;
  try { detail.engine.destroy(); } catch (e) { /* 已销毁 */ }
  detail.el.remove();
  detail = null;
  if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
}

function openDetail(card, trigger, opts = {}) {
  if (!overlay) return;
  closeDetail();

  const box = document.createElement('div');
  box.className = 'mumu-gallery__detail';
  box.dataset.detail = '';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', `${card.name} · 特殊检视`);

  const veil = document.createElement('div');
  veil.className = 'mumu-gallery__detail-veil';
  veil.dataset.detailClose = '';
  box.appendChild(veil);

  const stage = document.createElement('div');
  stage.className = 'mumu-gallery__detail-stage';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'mumu-gallery__detail-close';
  close.dataset.detailClose = '';
  close.setAttribute('aria-label', '关闭检视');
  close.textContent = '✕';
  stage.appendChild(close);

  const { el: cardEl, engine, refs } = buildHoloCard(card, {
    interactive: true,
    intro: true,
    idleDrift: true,
    fx: opts.fx || null,
    // 检视里点星：先写回数据，再让这张大卡自己重画星点
    onRate: opts.onRate
      ? (id, n) => { opts.onRate(id, n); refs.setFx(opts.fx); }
      : null,
  });
  stage.appendChild(cardEl);

  // 翻页只在调用方给了多张卡时才出现（自定义卡片检视）
  const pager = opts.pager && opts.pager.count > 1
    ? buildDetailPager(stage, opts.pager)
    : null;

  box.appendChild(stage);
  overlay.appendChild(box);
  detail = { el: box, engine, pager, trigger: trigger || null };
  requestAnimationFrame(() => close.focus({ preventScroll: true }));
}

function buildDetailPager(stage, { index = 0, count = 1, onStep = () => {} } = {}) {
  const bar = document.createElement('div');
  bar.className = 'mumu-gallery__detail-pager';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'mumu-gallery__detail-step';
  prev.setAttribute('aria-label', '上一张');
  prev.textContent = '‹';

  const label = document.createElement('span');
  label.className = 'mumu-gallery__detail-pos';
  label.textContent = `${index + 1} / ${count}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'mumu-gallery__detail-step';
  next.setAttribute('aria-label', '下一张');
  next.textContent = '›';

  prev.addEventListener('click', () => onStep(-1));
  next.addEventListener('click', () => onStep(1));
  bar.appendChild(prev);
  bar.appendChild(label);
  bar.appendChild(next);
  stage.appendChild(bar);
  return { el: bar, label, prev, next };
}

export function openGallery() {
  if (overlay) return;
  lastFocus = document.activeElement;
  if (lastFocus && typeof lastFocus.blur === 'function') lastFocus.blur();
  tabState = 'roles';
  galleryState = loadGallery();
  overlay = buildGallery(galleryState);
  layerRoot().appendChild(overlay);
  lockHome();

  overlay.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-gallery-close]')) { closeGallery(); return; }
    if (t.closest('[data-detail-close]')) { closeDetail(); return; }

    const btn = t.closest('[data-card-key]');
    if (!btn) return;
    const card = getCard(btn.dataset.cardKey);
    if (!card) return;
    if (!isCardUnlocked(card, galleryState)) {
      showNotice(`「${card.name}」尚未解锁 · 通关《${card.seriesTitle}》可获得`);
      return;
    }
    openDetail(card, btn);
  });

  keyHandler = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (detail) { closeDetail(); return; }
    if (tabState === 'custom' && setTabFn) {
      setTabFn('roles');
      const back = $('.mumu-gallery__tab[data-gallery-tab="custom"]', overlay);
      if (back) back.focus({ preventScroll: true });
      return;
    }
    closeGallery();
  };
  document.addEventListener('keydown', keyHandler);

  const closeBtn = $('.mumu-gallery__close', overlay);
  if (closeBtn) requestAnimationFrame(() => closeBtn.focus({ preventScroll: true }));
}

export function closeGallery() {
  if (!overlay) return;
  closeDetail();
  clearTimeout(noticeTimer);
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  overlay.remove();
  overlay = null;
  galleryState = null;
  if (customPane) {
    try { customPane.destroy(); } catch (e) { /* 已销毁 */ }
    customPane = null;
  }
  setTabFn = null;
  tabState = 'roles';
  unlockHome();
  const focus = lastFocus;
  lastFocus = null;
  if (focus && focus.isConnected) {
    try { focus.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
  }
}

/** 给主控一个稳定的入口，避免 gallery.js 之外直接碰 DOM。 */
export function isGalleryOpen() {
  return !!overlay;
}
