/* ============================================================
   暮幕 · 主控
   ============================================================ */
import { createSunset } from './sunset.js';
import { createAudio } from './audio.js';
import { createSceneRenderer } from './scene.js';
import { createEngine } from './engine.js';
import { createCharacterManager } from './character-manager.js';
import { preloadPortraits } from './portraits.js';
import { loadBuiltinScripts } from './builtin.js';
import { loadCustomScripts, addCustomScript, removeCustomScript, loadSaves, upsertSave, removeSave, makeId } from './storage.js';
import { exportPackage, downloadPackage, importPackage } from './package.js';
import { openLibrary, openSaves, openImport, openHow, closeModal } from './modals.js';

const $ = (id) => document.getElementById(id);

/* ---------------- 基础 ---------------- */
const audio = createAudio();
const sunset = createSunset($('sunset'));
const sceneRenderer = createSceneRenderer($('scene'));
const castManager = createCharacterManager();
preloadPortraits();
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
  if (name === 'stage') { sceneRenderer.start(); sunset.stop(); }
  else { sunset.start(); sceneRenderer.stop(); }
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

// 入场遮罩：用户的第一次点击同时解锁音频
$('boot-veil').addEventListener('click', () => {
  $('boot-veil').classList.add('gone');
  audio.start();
});

/* ---------------- 游玩 ---------------- */
const dlg = {
  name: $('dlg-name'), text: $('dlg-text'), choices: $('dlg-choices'), hint: $('dlg-hint'),
};
const engine = createEngine({
  renderer: sceneRenderer,
  ui: {
    setText: (t) => { dlg.text.textContent = t; },
    setName: (n) => { dlg.name.textContent = n; },
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
  },
  onEnd: () => leaveStage(),
  endOptions: (sc) => {
    const options = [];
    const next = nextChapterOf(sc);
    if (next) options.push({ label: '继续下一章', run: () => play(next) });
    options.push({ label: '换一个剧本', run: () => { leaveStage(); showLibrary(); } });
    return options;
  },
});

function play(script, snapshot = null) {
  showScreen('stage');
  engine.start(script, snapshot);
}

function leaveStage() {
  showScreen('home');
}

$('stage').addEventListener('click', (e) => {
  if (e.target.closest('.stage-top') || e.target.closest('.choice')) return;
  engine.advance();
});
document.addEventListener('keydown', (e) => {
  if ($('stage').getAttribute('aria-hidden') === 'true') return;
  if ($('modal-root').children.length) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); engine.advance(); }
});

$('stage-back').addEventListener('click', () => leaveStage());
$('stage-save').addEventListener('click', () => {
  const snap = engine.snapshot();
  if (!snap) return;
  const res = upsertSave({ ...snap, id: makeId('save'), time: Date.now() });
  if (res.ok) toast('进度已保存');
  else toast(res.error || '进度保存失败');
});

/* ---------------- 首页按钮 ---------------- */
/** 同一包内的章序必须连续且唯一：优先用作品自带章序，缺失或非法时按顺序补位；
 *  只有「多作品 + 章序重复」才整体重排，免得 README 里出现「2. 甲 / 2. 乙」；
 *  单作品（哪怕自带第二章的章序）保留它自己的章序。 */
function chapterNosOf(works) {
  const nums = works.map((w, i) => {
    const n = Number(w.chapterNo);
    return Number.isInteger(n) && n > 0 ? n : i + 1;
  });
  if (works.length < 2) return nums;
  const duplicated = new Set(nums).size !== nums.length;
  return duplicated ? works.map((_, i) => i + 1) : nums;
}

/** 文件名安全化：去掉 Windows 非法字符与结尾的点/空格 */
function safeFileBase(name) {
  let s = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '_');
  s = s.replace(/[. ]+$/g, '').slice(0, 80).replace(/[. ]+$/g, '');
  return s;
}

/** 单章导出：下载文件名带上章节标识，免得和整本包撞名（浏览器会存成「名字(1).mumu」）。
 *  只改文件名，包里的 title 仍是作品原标题（导入后的卡片标题不会被改写）。 */
function workDownloadName(baseName, work, chapterNo) {
  const base = safeFileBase(baseName);
  const rawTag = String((work && work.tag) || '').trim();
  const tag = rawTag.replace(/[\\/:*?"<>|]/g, '_') || `第${chapterNo || 1}章`;
  if (!base) return `${tag}.mumu`;
  if (tag === base) return `${base}.mumu`;
  return `${base} · ${tag}.mumu`;
}

/** 导出作品包：kind='work' 导单章，kind='series' 导整本。 */
async function handleExport({ kind, script, scripts } = {}) {
  try {
    const isSeries = kind === 'series';
    const works = (isSeries ? (scripts || []) : (script ? [script] : [])).filter(Boolean);
    if (!works.length) { toast('没有可导出的作品'); return; }
    const chapterNos = chapterNosOf(works);
    const { bytes, filename, warnings } = await exportPackage({
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
      works: works.map((w, i) => ({
        id: w.id, title: w.title, tag: w.tag || '', chapterNo: chapterNos[i],
        source: w.source || null, script: w,
      })),
    });
    // 单章导出的文件名带上章节标识（整本导出的文件名保持不变）
    const downloadName = isSeries
      ? filename
      : workDownloadName(works[0].seriesTitle || works[0].title, works[0], chapterNos[0]);
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

function showLibrary() {
  openLibrary({
    scripts: allScripts(),
    onPlay: (sc) => play(sc),
    onDelete: (ids) => {
      // 单个 id 或一组 id（整本曲目）都能传进来
      const list = Array.isArray(ids) ? ids : [ids];
      for (const id of list) removeCustomScript(id);
      // removeCustomScript 不返回写入结果，重新读一次存储确认是否真的删掉了
      const left = loadCustomScripts().map((s) => s.id);
      const failed = list.filter((id) => left.includes(id));
      if (failed.length) toast(`有 ${failed.length} 个剧本没有移除成功，可能是浏览器存储写入失败。`);
      else toast('已移除该剧本。');
      showLibrary();
    },
    onExport: handleExport,
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
      toast(`已导入《${res.title}》，共 ${res.works.length} 章`);
      for (const w of res.warnings) toast(w);
      setTimeout(showLibrary, 500);
    },
  });
}

$('btn-library').addEventListener('click', showLibrary);
$('btn-import').addEventListener('click', showImport);
$('btn-saves').addEventListener('click', showSaves);
$('btn-start').addEventListener('click', showLibrary);
$('btn-how').addEventListener('click', openHow);

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// 对外暴露，便于调试
window.__mumu = { engine, audio, sunset, castManager, sceneRenderer, get state() { return engine.state; } };
