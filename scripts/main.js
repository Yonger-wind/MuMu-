/* ============================================================
   暮幕 · 主控
   ============================================================ */
import { createSunset } from './sunset.js';
import { createAudio } from './audio.js';
import { createLazySceneRenderer } from './lazy-scene.js';
import { createEngine } from './engine.js';
import { createCharacterManager } from './character-manager.js';
import { schedulePortraitPreload } from './portraits.js';
import { loadBuiltinScripts } from './builtin.js';
import { loadCustomScripts, addCustomScript, removeCustomScript, loadSaves, upsertSave, removeSave, makeId, loadAutosave, saveAutosave, clearAutosave, saveCustomScripts } from './storage.js';
import { exportPackage, downloadPackage, importPackage, safeFileName } from './package.js';
import { openLibrary, openChapters, groupScripts, openSaves, openImport, closeModal } from './modals.js';
import { openGallery, grantChapterCards } from './gallery.js';
import { openScriptSelect, closeScriptSelect } from './selector.js';
import { buildSelection, SERIES_ORDER } from './selector-data.js';
import { identityOfSpeaker } from './series-meta.js';
import { buildFinale } from './finale.js';
import { playOpening, isOpeningActive, hasOpening, prefetchOpenings } from './openings/index.js';
import { createGlideNav } from './glide-nav.js';
import { createFullscreenController } from './fullscreen.js';
import { createRotateHint } from './rotate-hint.js';

const $ = (id) => document.getElementById(id);

/* ---------------- 基础 ---------------- */
const audio = createAudio();
const sunset = createSunset($('sunset'));
const sceneRenderer = createLazySceneRenderer($('scene'), {
  // 场景模块是按需加载的：网络异常时给一句中文提示，而不是留一个黑舞台
  onFail: () => toast('场景加载失败，请刷新页面重试。'),
});

/**
 * 开场动画撤层用的信号：等 scene.js 装载完成、舞台真的画出下一帧。
 * 不画完就撤层的话，切屏 + 装载 scene.js（约 950KB）这段时间会把首页透出来几帧。
 * 装载失败时代理只会走 onFail 提示、不抛错，所以这里照样放行（外壳另有兜底超时）。
 */
function stagePainted() {
  if (!sceneRenderer.ready) sceneRenderer.preloadImages();
  return sceneRenderer.whenReady().then((real) => new Promise((resolve) => {
    if (!real) { resolve(false); return; }
    let left = 2;                       // 再等两帧，保证屏幕上真有画面
    const tick = () => { if (--left <= 0) resolve(true); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
}

const castManager = createCharacterManager();
schedulePortraitPreload();
const builtins = castManager.decorateAll(loadBuiltinScripts());

const allScripts = () => castManager.decorateAll([...builtins, ...loadCustomScripts()]);
const findScript = (id) => allScripts().find((s) => s.id === id);

/** 同一曲目里，当前章节的下一章；末章或独立剧本返回 null。 */
function nextChapterOf(sc) {
  if (!sc || !sc.series) return null;
  const chapters = allScripts()
    .filter((s) => s.series === sc.series && s.chapterNo != null)
    .sort((a, b) => (a.chapterNo || 0) - (b.chapterNo || 0));
  const at = chapters.findIndex((s) => s.id === sc.id);
  return at >= 0 ? chapters[at + 1] || null : null;
}

let toastBusy = false;
const toastQueue = [];
/** 依次显示提示：导出 / 导入的警告不能被后一条消息顶掉 */
function toast(text) {
  toastQueue.push(String(text));
  if (toastBusy) return;
  toastBusy = true;
  const showNext = () => {
    const msg = toastQueue.shift();
    if (msg === undefined) { toastBusy = false; return; }
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(showNext, 280);
    }, 2400);
  };
  showNext();
}

/* ---------------- 屏幕切换 ---------------- */
function showScreen(name) {
  // 先移走焦点，避免对持有焦点的元素设置 aria-hidden
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  $('home').setAttribute('aria-hidden', name === 'home' ? 'false' : 'true');
  $('stage').setAttribute('aria-hidden', name === 'stage' ? 'false' : 'true');
  $('home').toggleAttribute('inert', name !== 'home');
  $('stage').toggleAttribute('inert', name !== 'stage');
  if (name === 'stage') { sceneRenderer.preloadImages(); sceneRenderer.start(); sunset.stop(); revealStageGlide(); }
  else { $('home').scrollTop = 0; sunset.start(); sceneRenderer.stop(); refreshResume(); }
}

/* ---------------- 音乐 UI ---------------- */
audio.onChange(({ muted, track }) => {
  $('audio-icon').textContent = muted ? '✕' : '♪';
  $('btn-audio').classList.toggle('muted', muted);
  $('btn-audio').setAttribute('aria-pressed', String(muted));
  $('now-playing').classList.toggle('muted', muted);
  $('np-text').textContent = muted ? '已静音' : `轻音乐 · ${track.name}`;
  $('stage-audio').textContent = muted ? '✕' : '♪';
});

$('btn-audio').addEventListener('click', () => audio.toggleMute());
$('stage-audio').addEventListener('click', () => audio.toggleMute());
$('now-playing').addEventListener('click', () => audio.next());
$('now-playing').style.cursor = 'pointer';
$('now-playing').title = '点击切换曲目';

// 首页右上功能组：接管成滑行药丸（悬停时一枚暖白药丸在按钮间滑过）
const topGlide = createGlideNav(document.querySelector('.mumu-top-actions'));

// 舞台右上功能组：同一套滑行药丸，托板换成暗色垫板（舞台昼夜亮度不定，纯字会被洗掉）
const stageGlide = createGlideNav(document.querySelector('.stage-top-right'), {
  itemSelector: '.stage-btn:not([data-mg-twin])',
});
let stageGlideIntro = false;
/** 每次进舞台都要重量一次（顶栏此前不可见），揭开动画只在本页第一次进舞台时播。 */
function revealStageGlide() {
  stageGlide.refresh();
  if (stageGlideIntro || isOpeningActive()) return;
  stageGlideIntro = true;
  stageGlide.playIntro();
}

// 入场遮罩：用户的第一次点击同时解锁音频
$('boot-veil').addEventListener('click', () => {
  $('boot-veil').classList.add('gone');
  audio.start();
  topGlide.playIntro();
});

/* ---------------- 游玩 ---------------- */
const dlg = {
  name: $('dlg-name'), role: $('dlg-role'), text: $('dlg-text'), choices: $('dlg-choices'), hint: $('dlg-hint'),
  finale: $('dlg-finale'), back: $('dlg-back'),
};

/** 终幕结算卡：一幕、一句台词、做过的选择、本轮获得的卡牌。 */
function clearFinale() {
  if (!dlg.finale) return;
  dlg.finale.replaceChildren();
  dlg.finale.hidden = true;
}

function renderFinale(data) {
  const box = dlg.finale;
  if (!box || !data) { clearFinale(); return; }
  box.replaceChildren();

  const kicker = document.createElement('p');
  kicker.className = 'mumu-finale__kicker';
  kicker.textContent = '幕落 · 本章结算';

  const title = document.createElement('p');
  title.className = 'mumu-finale__title';
  title.textContent = data.title;
  box.append(kicker, title);

  if (data.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'mumu-finale__sub';
    sub.textContent = data.subtitle;
    box.append(sub);
  }

  const rows = document.createElement('dl');
  rows.className = 'mumu-finale__rows';
  const addRow = (label, child) => {
    const row = document.createElement('div');
    row.className = 'mumu-finale__row';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.append(child);
    row.append(dt, dd);
    rows.append(row);
  };

  addRow('这一幕', document.createTextNode(data.where));

  if (data.line) {
    const quote = document.createElement('span');
    quote.className = 'mumu-finale__line';
    if (data.line.who) {
      const who = document.createElement('em');
      who.textContent = `${data.line.who}：`;
      quote.append(who);
    }
    quote.append(document.createTextNode(data.line.text));
    addRow('一句台词', quote);
  }

  addRow('你的选择', document.createTextNode(
    data.choices.length ? data.choices.join(' → ') : '没有分歧，一路读到结尾'
  ));

  if (data.cards.length) {
    const wrap = document.createElement('span');
    wrap.className = 'mumu-finale__cards';
    for (const card of data.cards) {
      const chip = document.createElement('span');
      chip.className = 'mumu-finale__card';
      chip.textContent = card.stars ? `${card.name} · ${card.stars}★` : card.name;
      wrap.append(chip);
    }
    addRow('获得卡牌', wrap);
  }

  box.append(rows);
  box.hidden = false;
}
const engine = createEngine({
  renderer: sceneRenderer,
  ui: {
    setText: (t) => { dlg.text.textContent = t; },
    setName: (n) => {
      dlg.name.textContent = n;
      // 名称下方的小字身份：只对内置曲目生效，蝉鸣的小悠真 / 小葵不显示
      const seriesKey = engine && engine.script ? engine.script.series : '';
      const role = identityOfSpeaker(n, seriesKey);
      dlg.role.textContent = role;
      dlg.role.hidden = !role;
    },
    setTitle: (t) => { $('stage-title').textContent = t; },
    showHint: (v) => dlg.hint.classList.toggle('hidden', !v),
    setChoices: (list, cb) => {
      dlg.choices.innerHTML = '';
      list.forEach((text, i) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.textContent = text;
        b.addEventListener('click', (e) => { e.stopPropagation(); cb(i); });
        dlg.choices.appendChild(b);
      });
    },
    flash: () => {
      const s = $('stage');
      s.animate([{ filter: 'brightness(0.2)' }, { filter: 'brightness(1)' }], { duration: 700, easing: 'ease-out' });
    },
    clearFinale,
    // 回退一句：只有存在更早的画面时才显示按钮
    setBackEnabled: (on) => { if (dlg.back) dlg.back.hidden = !on; },
  },
  onEnd: () => leaveStage(),
  endOptions: (sc, summary) => {
    // 内置曲目：一章落幕时按配额随机送出角色卡（同一章只结算一次）
    const grant = grantChapterCards(sc);
    if (grant && grant.cards && grant.cards.length && !grant.alreadyGranted) {
      const names = grant.cards.map((c) => c.name);
      const shown = names.slice(0, 3).join('、') + (names.length > 3 ? ` 等 ${names.length} 位` : '');
      toast(`获得角色卡：${shown}（可在「角色图鉴」检视）`);
      if (!grant.persisted) {
        toast(grant.error || '浏览器存储空间不足，本次获得的角色卡可能无法保留。');
      }
    }
    const options = [];
    const next = nextChapterOf(sc);
    // 终章（没有下一章）才出结算卡，非终章保持「继续下一章」的节奏
    const finale = buildFinale(sc, summary, {
      hasNext: !!next,
      cards: grant && !grant.alreadyGranted ? grant.cards : [],
    });
    if (finale) renderFinale(finale);
    else clearFinale();
    if (next) options.push({ label: '继续下一章', run: () => play(next, null, { ...engine.state.flags }) });
    options.push({ label: '换一个剧本', run: () => { leaveStage(); showLibrary(); } });
    return options;
  },
  // 自动存档：每到一个停顿点覆写当前这一程；本章落幕即清除
  onProgress: (snap) => {
    if (!snap) return;
    if (engine.ended) { clearAutosave(); return; }
    saveAutosave({ ...snap, title: (engine.script && engine.script.title) || '' });
  },
});

function play(script, snapshot = null, carry = null) {
  // 开新的一程（新章 / 重新开始 / 换剧本）先丢掉旧的自动存档，免得开头
  // 还没写出新进度就刷新被拉回上一本；读档 / 继续上次则立刻改指向这一程
  clearFinale();
  if (snapshot) saveAutosave({ ...snapshot, title: script.title });
  else clearAutosave();
  refreshResume();
  showScreen('stage');
  engine.start(script, snapshot, carry);
}

/** 从剧本 / 章节列表点进一部戏：四部内置曲目的第一章先放各自的开场动画。 */
function startScript(script) {
  const first = script && script.builtin && script.chapterNo === 1 && hasOpening(script.series);
  if (!first) { play(script); return; }
  playOpening(script.series, { onDone: () => play(script), onStageReady: stagePainted });
}

function leaveStage() {
  clearFinale();
  if (dlg.back) dlg.back.hidden = true;
  showScreen('home');
}

/** 首页「继续上次」：有自动存档且剧本仍在库里时才显示。 */
function refreshResume() {
  const btn = $('btn-resume');
  if (!btn) return;
  const snap = loadAutosave();
  if (!snap) { btn.hidden = true; return; }
  const sc = findScript(snap.scriptId);
  if (!sc) { clearAutosave(); btn.hidden = true; return; }
  const book = sc.seriesTitle || sc.title;
  const chapter = sc.chapterNo ? `第 ${sc.chapterNo} 章 · ` : '';
  btn.textContent = `继续上次 ·《${book}》${chapter}${snap.progress || 0}%`;
  btn.title = snap.preview ? `上次读到：${snap.preview}…` : '回到上次的进度';
  btn.hidden = false;
}

$('stage').addEventListener('click', (e) => {
  if (e.target.closest('.stage-top') || e.target.closest('.choice')) return;
  if (e.target.closest('#dlg-back')) return;
  engine.advance();
});
// 回退一句：点一次退一屏，可以连续点
if (dlg.back) {
  dlg.back.addEventListener('click', (e) => {
    e.stopPropagation();
    engine.back();
  });
}
document.addEventListener('keydown', (e) => {
  if ($('stage').getAttribute('aria-hidden') === 'true') return;
  if ($('modal-root').children.length) return;
  // 开场动画盖在舞台上：标题出现前的回车 / 空格不能推进剧情
  if (isOpeningActive()) return;
  // 剧情中打开「选章节」时，全屏选择层盖在舞台上：回车/空格要交给选择层，
  // 不能再推进后面的剧情
  if (document.querySelector('.mumu-scripts')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); engine.advance(); }
});

$('stage-back').addEventListener('click', () => leaveStage());
// 舞台右上角：换个剧本（留在剧情上打开完整选择层，误触可「返回剧情」）/
// 选章节（不绕剧目选择页，直接在剧情上滑出当前曲目的章节面板）
$('stage-switch').addEventListener('click', () => showLibrary());
$('stage-chapters').addEventListener('click', () => {
  const sc = engine && engine.script;
  if (!sc) return;
  showLibrary({
    initialKey: sc.series || sc.id,
    openChapters: true,
    chapterOnly: true,
  });
});
$('stage-save').addEventListener('click', () => {
  const snap = engine.snapshot();
  if (!snap) return;
  const res = upsertSave({ ...snap, id: makeId('save'), time: Date.now() });
  if (res.ok) toast('进度已保存');
  else toast(res.error || '进度保存失败');
});

/* ---------------- 首页按钮 ---------------- */
/** Windows 保留设备名（CON / PRN / AUX / NUL / COM1…）不能直接当文件名 */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** 单章导出：下载文件名带上章节标识，免得和整本包撞名（浏览器会存成「名字(1).mumu」）。
 *  只改文件名，包里的 title 仍是作品原标题（导入后的卡片标题不会被改写）。 */
function workDownloadName(baseName, work, chapterNo) {
  const base = safeFileName(baseName);
  const rawTag = String((work && work.tag) || '').trim();
  const tag = rawTag.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40).replace(/[. ]+$/g, '')
    || `第${chapterNo || 1}章`;
  const stem = base ? (tag === base ? base : `${base} · ${tag}`) : tag;
  return `${RESERVED_NAME.test(stem) ? '_' + stem : stem}.mumu`;
}

/** 导出作品包：kind='work' 导单章，kind='series' 导整本。 */
async function handleExport({ kind, script, scripts } = {}) {
  try {
    const isSeries = kind === 'series';
    const works = (isSeries ? (scripts || []) : (script ? [script] : [])).filter(Boolean);
    if (!works.length) { toast('没有可导出的作品。'); return; }
    // 章序由 exportPackage 统一整理（整本连续化 1..N，单章保留自身章序）
    const { bytes, filename, warnings, chapterNos } = await exportPackage({
      kind,
      // 整本导出时 id 就是曲目 id，series 恒为 null；单章导出时 id 是作品 id
      id: isSeries ? (works[0].series || works[0].id) : works[0].id,
      title: isSeries ? (works[0].seriesTitle || works[0].title) : works[0].title,
      summary: works[0].summary || '',
      author: works[0].author || '',
      series: isSeries
        ? null
        : (works[0].series ? { id: works[0].series, title: works[0].seriesTitle || works[0].title } : null),
      license: null,
      coverImage: works[0].coverImage || null,
      works: works.map((w) => ({
        id: w.id, title: w.title, tag: w.tag || '', chapterNo: w.chapterNo,
        source: w.source || null, script: w,
      })),
    });
    // 单章导出的文件名带上章节标识（整本导出的文件名保持不变）
    const downloadName = isSeries
      ? filename
      : workDownloadName(works[0].seriesTitle || works[0].title, works[0], (chapterNos && chapterNos[0]) || works[0].chapterNo);
    downloadPackage(bytes, downloadName);
    toast(`已导出《${downloadName}》`);
    // 早期导入的剧本没有保留原文，导出走的是重建文本，要如实告诉用户
    if (!works.some((w) => typeof w.source === 'string' && w.source.trim())) {
      toast('该剧本没有原文，导出为重建文本（内容可能与原文略有差异）。');
    }
    for (const w of warnings) toast(w);
  } catch (e) {
    toast(e.userFacing ? e.message : '导出失败：' + (e.message || '未知错误'));
  }
}

function removeScripts(ids) {
  // 单个 id 或一组 id（整本曲目）都能传进来
  const list = Array.isArray(ids) ? ids : [ids];
  for (const id of list) removeCustomScript(id);
  // removeCustomScript 不返回写入结果，重新读一次存储确认是否真的删掉了
  const left = loadCustomScripts().map((s) => s.id);
  const failed = list.filter((id) => left.includes(id));
  if (failed.length) toast(`有 ${failed.length} 个剧本没有移除成功，可能是浏览器存储写入失败。`);
  else toast('已移除该剧本。');
  refreshResume();
  showLibrary();
}

/** 给导入作品换封面：只改存储里的封面字段，不调整顺序，整本共用一个封面。 */
function saveEntryCover(entry, dataUrl) {
  if (!entry || !entry.custom) return { ok: false, error: '内置曲目不能更换封面。' };
  const ids = new Set(entry.chapters.filter((c) => c.builtin !== true).map((c) => c.id));
  if (!ids.size) return { ok: false, error: '没有可更新的剧本。' };
  const list = loadCustomScripts().map((s) => (ids.has(s.id) ? { ...s, coverImage: dataUrl } : s));
  if (!saveCustomScripts(list)) return { ok: false, error: '浏览器存储空间不足，封面没有保存成功。' };
  entry.coverImage = dataUrl;
  entry.chapters.forEach((c) => { if (ids.has(c.id)) c.coverImage = dataUrl; });
  return { ok: true };
}

/** 剧本选择：条目不超过 10 时用封面环形动画，超过则回落到原来的陈列。 */
function showLibrary(opts = {}) {
  sceneRenderer.preloadImages();
  // 四段开场动画的美术模块合计约 100KB，等用户点「开始体验」再取会白等半秒；
  // 选择页一开就顺手预热（开场动画播完留台，下次换曲也不必再取）
  prefetchOpenings(SERIES_ORDER);
  closeScriptSelect({ restoreFocus: false });
  const scripts = allScripts();
  const selection = buildSelection(scripts);
  // 从剧情里打开时关闭按钮是「返回剧情」：误触「换个剧本」也能原句回到舞台
  const onStage = $('stage').getAttribute('aria-hidden') !== 'true';
  const closeLabel = opts.closeLabel || (onStage ? '返回剧情' : '');
  const actions = {
    onPlay: startScript,
    onDelete: removeScripts,
    onExport: handleExport,
  };
  if (!selection.useCarousel) {
    // 超过 10 部时回退成陈列弹窗。剧情里点「选章节」不能因此变成「先挑曲目」：
    // 直接按当前曲目打开章节列表，返回键才回到陈列页。
    const sc = engine && engine.script;
    const key = sc && (sc.series || sc.id);
    const group = key && groupScripts(scripts).find((g) => g.kind === 'series' && g.key === key);
    if (opts.chapterOnly && group) {
      openChapters(group, startScript, () => openLibrary({ scripts, ...actions }), (arg) => actions.onExport(arg));
      return;
    }
    openLibrary({ scripts, ...actions });
    return;
  }
  openScriptSelect({
    scripts,
    ...actions,
    onImport: showImport,
    onCover: saveEntryCover,
    initialKey: opts.initialKey || '',
    openChapters: !!opts.openChapters,
    chapterOnly: !!opts.chapterOnly,
    closeLabel,
  });
}
function showSaves() {
  openSaves({
    saves: loadSaves(),
    titleOf: (id) => findScript(id)?.title || '（剧本已被移除）',
    onLoad: (s) => {
      const sc = findScript(s.scriptId);
      if (!sc) { toast('对应的剧本已不存在'); return; }
      play(sc, s);
    },
    onDelete: (id) => { removeSave(id); showSaves(); },
  });
}
function showImport() {
  openImport({
    onImported: (sc) => {
      sc.id = makeId('custom');
      sc.tag = '我的剧本';
      sc.builtin = false;
      const res = addCustomScript(sc);
      if (!res.ok) { toast(res.error || '浏览器存储空间不足，剧本没有保存成功。'); return; }
      toast(`已导入《${sc.title}》，现已列入“选择剧本”`);
      setTimeout(showLibrary, 500);
    },
    onPackage: async (file) => {
      const buf = await file.arrayBuffer();
      const res = await importPackage(buf, { existing: [...builtins, ...loadCustomScripts()] });
      if (!res.works.length) {
        const e = new Error('作品包里没有作品。');
        e.userFacing = true;
        throw e;
      }
      let failed = 0;
      for (const w of res.works) {
        if (!addCustomScript(w).ok) failed += 1;
      }
      if (failed) {
        // 部分章节没存进去：警告也要说清楚，最后照样刷新库（已存进去的章节要能看见）
        for (const w of res.warnings) toast(w);
        toast(`浏览器存储空间不足，${res.works.length} 章中有 ${failed} 章没有保存成功。`);
        setTimeout(showLibrary, 500);
        return;
      }
      // 提示文案按冲突结论选（spec §5.3）：更新 / 改名另存 / 与已有曲目同名
      toast(importSummary(res));
      for (const w of res.warnings) toast(w);
      setTimeout(showLibrary, 500);
    },
  });
}

/** 导入结果 → 面向用户的一句话提示（spec §5.3 的三条冲突文案） */
function importSummary(res) {
  const conflicts = res.conflicts || {};
  const actions = Array.isArray(conflicts.workActions) ? conflicts.workActions : [];
  const title = res.title || '';
  if (conflicts.seriesAction === 'renamed') {
    const base = String(conflicts.seriesTitle || title).replace(/（导入）$/, '');
    return `与已有曲目同名，已另存为《${base}（导入）》`;
  }
  if (conflicts.seriesAction === 'update') return `已更新《${title}》`;
  // 混合情况取最显著的那一条：renamed > updated > new
  if (actions.includes('renamed')) return `已另存为《${title}》`;
  if (actions.includes('update')) return `已更新《${title}》`;
  return `已导入《${title}》，共 ${res.works.length} 章`;
}

$('btn-library').addEventListener('click', showLibrary);
$('btn-gallery').addEventListener('click', openGallery);
$('btn-import').addEventListener('click', showImport);
$('btn-saves').addEventListener('click', showSaves);
$('btn-start').addEventListener('click', showLibrary);
/* 首页下滑：「项目介绍」按钮与下方提示都滚到第二屏，第二屏底部回到首页 */
const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const homeScrollTo = (top) => $('home').scrollTo({ top, behavior: reduceMotion() ? 'auto' : 'smooth' });
const scrollToIntro = () => homeScrollTo($('intro').offsetTop);
$('btn-intro').addEventListener('click', scrollToIntro);
$('btn-scroll-intro').addEventListener('click', scrollToIntro);
$('intro-top').addEventListener('click', () => homeScrollTo(0));
$('intro-start').addEventListener('click', () => { homeScrollTo(0); showLibrary(); });
$('btn-resume').addEventListener('click', () => {
  const snap = loadAutosave();
  if (!snap) { refreshResume(); return; }
  const sc = findScript(snap.scriptId);
  if (!sc) {
    clearAutosave();
    refreshResume();
    toast('上次的剧本已被移除，无法继续。');
    return;
  }
  play(sc, snap);
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

refreshResume();

/* 手机全屏 + 锁定横屏：安卓 Chrome 系（含部分国产壳）能真锁，
   iPhone Safari / 微信 iOS 两个 API 都没有，所以全靠特性检测，
   不支持就不给按钮、只在支持时提示手动转屏。 */
const fullscreen = createFullscreenController({
  onNotice: (msg) => toast(msg),
  onState: () => { syncFsButton(); rotateHint.refresh(); },
});
const fsBtn = $('stage-fullscreen');

/** ⛶ 只在横屏手机出现；出现或消失都得重量一次滑行药丸。 */
function syncFsButton() {
  if (!fsBtn) return;
  fsBtn.hidden = !fullscreen.shouldShow;
  fsBtn.setAttribute('aria-pressed', String(fullscreen.active));
  fsBtn.setAttribute('aria-label', fullscreen.active ? '退出全屏' : '全屏并锁定横屏');
  fsBtn.title = fullscreen.active
    ? (fullscreen.locked ? '退出全屏（横屏已锁定）' : '退出全屏')
    : '全屏并锁定横屏';
  fsBtn.classList.toggle('is-on', fullscreen.active);
  stageGlide.refresh();
}

if (fsBtn) fsBtn.addEventListener('click', () => fullscreen.toggle());
window.addEventListener('resize', syncFsButton);
window.addEventListener('orientationchange', syncFsButton);
syncFsButton();

/* 手机竖屏：舞台是横向分镜，先请用户转成横屏（可拒绝，本标签页内不再打扰）。
   能全屏的浏览器把「全屏并锁定横屏」摆在面板上作为主按钮。 */
const rotateHint = createRotateHint({ fullscreen, onNotice: (msg) => toast(msg) });

// 对外暴露，便于调试
window.__mumu = { engine, audio, sunset, castManager, sceneRenderer, rotate: rotateHint, fullscreen, get state() { return engine.state; } };
