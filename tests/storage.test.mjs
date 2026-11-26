import test from 'node:test';
import assert from 'node:assert/strict';

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    __map: map,
  };
}

test('v1 旧存档读取时迁移到 v2 并补齐状态', async () => {
  const store = makeStorage({
    'mumu.saves.v1': JSON.stringify([{ id: 'save_old', scriptId: 'cicada_01', idx: 5, progress: 20 }]),
  });
  globalThis.localStorage = store;
  const { loadSaves } = await import('../scripts/storage.js');
  const saves = loadSaves();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, 'save_old');
  assert.equal(saves[0].version, 2);
  assert.deepEqual(saves[0].state.flags, {});
  assert.equal(saves[0].state.endingId, '');
  const v2 = JSON.parse(store.getItem('mumu.saves.v2'));
  assert.equal(v2.length, 1);
  assert.equal(v2[0].id, 'save_old');
});

test('upsertSave 写入 v2 键并返回成功', async () => {
  globalThis.localStorage = makeStorage();
  const { upsertSave } = await import('../scripts/storage.js');
  const res = upsertSave({ id: 'save_1', scriptId: 'cicada_01', idx: 3, state: { flags: { a: true } } });
  assert.equal(res.ok, true);
  assert.equal(res.error, null);
  const v2 = JSON.parse(globalThis.localStorage.getItem('mumu.saves.v2'));
  assert.equal(v2.length, 1);
  assert.equal(v2[0].state.flags.a, true);
});

test('存储写入失败时返回明确错误而不是静默丢失', async () => {
  const store = makeStorage();
  store.setItem = () => { throw new Error('QuotaExceededError'); };
  globalThis.localStorage = store;
  const { upsertSave } = await import('../scripts/storage.js');
  const res = upsertSave({ id: 'save_2', scriptId: 'cicada_01', idx: 1 });
  assert.equal(res.ok, false);
  assert.ok(res.error && res.error.length > 0);
});

test('removeSave 从 v2 中删除存档', async () => {
  globalThis.localStorage = makeStorage({
    'mumu.saves.v2': JSON.stringify([{ id: 'save_a', scriptId: 'cicada_01', idx: 1 }, { id: 'save_b', scriptId: 'cicada_02', idx: 2 }]),
  });
  const { removeSave, loadSaves } = await import('../scripts/storage.js');
  removeSave('save_a');
  const saves = loadSaves();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, 'save_b');
});

test('旧存档没有 time 字段时时间显示不出现 NaN', async () => {
  const { fmtTime } = await import('../scripts/storage.js');
  assert.equal(fmtTime(undefined), '时间未知');
  assert.equal(fmtTime('not-a-date'), '时间未知');
  assert.match(fmtTime(1700000000000), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('自动存档写入独立键，可读取与清除，不碰手动存档', async () => {
  globalThis.localStorage = makeStorage();
  const { saveAutosave, loadAutosave, clearAutosave } = await import('../scripts/storage.js');
  assert.equal(loadAutosave(), null);
  const ok = saveAutosave({ scriptId: 'cicada_01', idx: 4, progress: 12, state: { flags: { a: true } } });
  assert.equal(ok, true);
  const snap = loadAutosave();
  assert.equal(snap.scriptId, 'cicada_01');
  assert.equal(snap.idx, 4);
  assert.equal(snap.state.flags.a, true);
  assert.equal(snap.version, 1);
  assert.ok(snap.savedAt > 0);
  assert.equal(globalThis.localStorage.getItem('mumu.saves.v2'), null);
  clearAutosave();
  assert.equal(loadAutosave(), null);
});

test('自动存档坏数据按空处理并清掉，写失败返回 false', async () => {
  globalThis.localStorage = makeStorage({
    'mumu.autosave.v1': JSON.stringify({ idx: 3 }),
  });
  const { loadAutosave, saveAutosave } = await import('../scripts/storage.js');
  assert.equal(loadAutosave(), null);
  assert.equal(globalThis.localStorage.getItem('mumu.autosave.v1'), null);
  const store = makeStorage();
  store.setItem = () => { throw new Error('QuotaExceededError'); };
  globalThis.localStorage = store;
  assert.equal(saveAutosave({ scriptId: 'x', idx: 0 }), false);
  assert.equal(saveAutosave(null), false);
});
