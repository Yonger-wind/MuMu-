/* ============================================================
   暮幕 · 存储层
   剧本（自定义）与存档都放在 localStorage
   存档写入 mumu.saves.v2；旧的 mumu.saves.v1 只读并在读取时自动迁移。
   ============================================================ */

import { upgradeSave } from './state.js';

const K_SCRIPTS = 'mumu.scripts.v1';
const K_SAVES_V1 = 'mumu.saves.v1';   // 旧键，只读迁移用
const K_SAVES_V2 = 'mumu.saves.v2';   // 新键

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
/** 新增/覆盖一个自定义剧本。
 *  返回 { ok, list, error }：ok 为 false 时说明本地存储写失败（多半是配额满），
 *  调用方必须据此提示用户，不能假装保存成功。 */
export function addCustomScript(script) {
  const list = loadCustomScripts().filter((s) => s.id !== script.id);
  list.unshift(script);
  const ok = saveCustomScripts(list);
  return {
    ok,
    list,
    error: ok ? null : '浏览器存储空间不足，剧本没有保存成功。',
  };
}
export function removeCustomScript(id) {
  const list = loadCustomScripts().filter((s) => s.id !== id);
  saveCustomScripts(list);
  return list;
}

export function loadSaves() {
  const v2 = read(K_SAVES_V2, null);
  if (Array.isArray(v2)) return v2.map(upgradeSave);
  // 旧版本存档：读取即迁移，补齐 version / state
  const v1 = read(K_SAVES_V1, []);
  if (!Array.isArray(v1) || !v1.length) return [];
  const migrated = v1.map(upgradeSave);
  saveAll(migrated);
  return migrated;
}
export function saveAll(saves) { return write(K_SAVES_V2, saves); }

export function upsertSave(save) {
  const list = loadSaves().filter((s) => s.id !== save.id);
  list.unshift(upgradeSave(save));
  const trimmed = list.slice(0, 40);       // 上限 40 条
  const ok = saveAll(trimmed);
  return {
    ok,
    error: ok ? null : '浏览器存储空间不足，进度没有保存成功。',
    list: trimmed,
  };
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
  // 旧存档没有 time 字段时不要显示 NaN
  if (!ts || Number.isNaN(d.getTime())) return '时间未知';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
