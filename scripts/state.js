/* ============================================================
   暮幕 · 状态层
   纯逻辑，无 DOM 依赖：旗标、数值、结局标识、检查点。
   存档写入 mumu.saves.v2；mumu.saves.v1 的旧档由 upgradeSave 兼容。
   ============================================================ */

export const SAVE_VERSION = 2;
export const MAX_CHECKPOINTS = 12;

export function createState() {
  return { flags: {}, vars: {}, endingId: '', checkpoints: [] };
}

export function cloneCheckpoint(cp) {
  return {
    idx: cp.idx | 0,
    label: cp.label || '',
    choices: [...(cp.choices || [])],
    cast: [...(cp.cast || [])],
    sceneState: { ...(cp.sceneState || {}) },
    actState: {
      poses: { ...(cp.actState?.poses || {}) },
      actions: { ...(cp.actState?.actions || {}) },
      view: cp.actState?.view || 'normal',
    },
    flags: { ...(cp.flags || {}) },
    vars: { ...(cp.vars || {}) },
  };
}

export function cloneState(state) {
  return {
    flags: { ...(state?.flags || {}) },
    vars: { ...(state?.vars || {}) },
    endingId: state?.endingId || '',
    checkpoints: (state?.checkpoints || []).map(cloneCheckpoint),
  };
}

export function setFlag(state, key, value = true) {
  if (!key) return state;
  state.flags[key] = value;
  return state;
}

export function getFlag(state, key) {
  return !!(state?.flags && state.flags[key]);
}

export function setVar(state, key, value) {
  if (!key) return state;
  state.vars[key] = value;
  return state;
}

export function getVar(state, key, fallback = 0) {
  const v = state?.vars ? state.vars[key] : undefined;
  return v === undefined ? fallback : v;
}

/** 追加一个检查点；超过上限时丢弃最旧的。 */
export function pushCheckpoint(state, cp, max = MAX_CHECKPOINTS) {
  const list = state.checkpoints || (state.checkpoints = []);
  list.push(cloneCheckpoint(cp));
  while (list.length > max) list.shift();
  return state;
}

/** 取出并移除最后一个检查点；没有则返回 null。 */
export function popCheckpoint(state) {
  const list = state.checkpoints || [];
  return list.length ? list.pop() : null;
}

/** 反序列化状态：任何缺失字段都补默认值。 */
export function deserializeState(raw) {
  const s = createState();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.flags && typeof raw.flags === 'object') s.flags = { ...raw.flags };
  if (raw.vars && typeof raw.vars === 'object') s.vars = { ...raw.vars };
  s.endingId = typeof raw.endingId === 'string' ? raw.endingId : '';
  if (Array.isArray(raw.checkpoints)) s.checkpoints = raw.checkpoints.map(cloneCheckpoint);
  return s;
}

/** v1 旧存档没有 version / state，这里补齐；已有 state 的则规范化。 */
export function upgradeSave(raw) {
  const save = { ...(raw || {}) };
  save.version = SAVE_VERSION;
  save.state = deserializeState(save.state);
  return save;
}
