/* ============================================================
   暮幕 · 主控
   ============================================================ */
import { createSunset } from './sunset.js';
import { createAudio } from './audio.js';
import { createSceneRenderer } from './scene.js';
import { createEngine } from './engine.js';
import { createCharacterManager } from './character-manager.js';
import { loadBuiltinScripts } from './builtin.js';
import { loadCustomScripts, addCustomScript, removeCustomScript, loadSaves, upsertSave, removeSave, makeId } from './storage.js';
import { openLibrary, openSaves, openImport, openHow, closeModal } from './modals.js';

const $ = (id) => document.getElementById(id);

/* ---------------- 基础 ---------------- */
const audio = createAudio();
const sunset = createSunset($('sunset'));
const sceneRenderer = createSceneRenderer($('scene'));
const castManager = createCharacterManager();
const builtins = castManager.decorateAll(loadBuiltinScripts());

const allScripts = () => castManager.decorateAll([...builtins, ...loadCustomScripts()]);
const findScript = (id) => allScripts().find((s) => s.id === id);

let toastTimer = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
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
  upsertSave({ ...snap, id: makeId('save'), time: Date.now() });
  toast('进度已保存');
});

/* ---------------- 首页按钮 ---------------- */
function showLibrary() {
  openLibrary({
    scripts: allScripts(),
    onPlay: (sc) => play(sc),
    onDelete: (id) => {
      removeCustomScript(id);
      toast('已移除该剧本');
      showLibrary();
    },
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
      addCustomScript(sc);
      toast(`已导入《${sc.title}》，现已列入“选择剧本”`);
      setTimeout(showLibrary, 500);
    },
  });
}

$('btn-library').addEventListener('click', showLibrary);
$('btn-import').addEventListener('click', showImport);
$('btn-saves').addEventListener('click', showSaves);
$('btn-start').addEventListener('click', () => play(builtins[0]));
$('btn-how').addEventListener('click', openHow);

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// 对外暴露，便于调试
window.__mumu = { engine, audio, sunset, castManager };
