/* ============================================================
   暮幕 · 存储层
   剧本（自定义）与存档都放在 localStorage
   ============================================================ */

const K_SCRIPTS = 'mumu.scripts.v1';
const K_SAVES = 'mumu.saves.v1';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { return false; }
}

export function loadCustomScripts() { return read(K_SCRIPTS, []); }
export function saveCustomScripts(list) { return write(K_SCRIPTS, list); }
export function addCustomScript(script) {
  const list = loadCustomScripts().filter((s) => s.id !== script.id);
  list.unshift(script);
  saveCustomScripts(list);
  return list;
}
export function removeCustomScript(id) {
  const list = loadCustomScripts().filter((s) => s.id !== id);
  saveCustomScripts(list);
  return list;
}

export function loadSaves() { return read(K_SAVES, []); }
export function saveAll(saves) { return write(K_SAVES, saves); }

export function upsertSave(save) {
  const list = loadSaves().filter((s) => s.id !== save.id);
  list.unshift(save);
  saveAll(list.slice(0, 40));       // 上限 40 条
  return list;
}
export function removeSave(id) {
  const list = loadSaves().filter((s) => s.id !== id);
  saveAll(list);
  return list;
}
export function getLatestSaveFor(scriptId) {
  return loadSaves().find((s) => s.scriptId === scriptId) || null;
}

export function makeId(prefix = 's') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
