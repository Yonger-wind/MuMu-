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
