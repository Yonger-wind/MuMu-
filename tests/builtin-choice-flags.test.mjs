import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBuiltinScripts } from '../scripts/builtin.js';

const KEYS = ['asked_tape', 'kept_quiet', 'asked_why', 'chose_song', 'picked_papers', 'grabbed_run'];

test('内置第一章三个选项都带旗标，第二章读取第一章的旗标', () => {
  const scripts = loadBuiltinScripts();
  const ch1 = scripts.find((s) => s.id === 'builtin_cicada_01');
  const ch2 = scripts.find((s) => s.id === 'builtin_cicada_02');
  assert.ok(ch1 && ch2, '内置第一、二章应存在');
  const sets = ch1.nodes.filter((n) => n.t === 'choice').flatMap((n) => n.options)
    .map((o) => (o.set || []).join(','));
  assert.deepEqual(sets, KEYS);
  const ch1Cond = new Set(ch1.nodes.filter((n) => n.cond).map((n) => n.cond.key));
  const ch2Cond = new Set(ch2.nodes.filter((n) => n.cond).map((n) => n.cond.key));
  for (const key of KEYS) {
    assert.ok(ch1Cond.has(key), `第一章缺少 ${key} 的条件节点`);
    assert.ok(ch2Cond.has(key), `第二章缺少 ${key} 的跨章条件节点`);
  }
});
