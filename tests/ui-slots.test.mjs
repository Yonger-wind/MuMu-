import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOT_NAMES, findSlot, mountTo } from '../scripts/ui/slots.js';

function fakeHost() {
  return {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      return node;
    },
    removeChild(node) {
      const i = this.children.indexOf(node);
      if (i >= 0) this.children.splice(i, 1);
      node.parentNode = null;
      return node;
    },
  };
}

function fakeRoot(map) {
  return {
    querySelector(selector) {
      const m = /^\[data-slot="(.+)"\]$/.exec(selector);
      return m && map[m[1]] ? map[m[1]] : null;
    },
  };
}

test('槽位：名单冻结且为四个命名槽', () => {
  assert.ok(Object.isFrozen(SLOT_NAMES));
  assert.deepEqual(SLOT_NAMES, ['home', 'stage', 'modal', 'overlay']);
});

test('槽位：未知槽名抛中文错误并列出可用槽', () => {
  assert.throws(() => findSlot('toast'), /未知的挂载点「toast」.*home \/ stage \/ modal \/ overlay/);
});

test('槽位：findSlot 按 data-slot 命中，未命中返回 null', () => {
  const host = fakeHost();
  const root = fakeRoot({ modal: host });
  assert.equal(findSlot('modal', root), host);
  assert.equal(findSlot('stage', root), null);
});

test('挂载：appendChild 后可幂等移除', () => {
  const host = fakeHost();
  const root = fakeRoot({ overlay: host });
  const node = { parentNode: null };
  const handle = mountTo('overlay', node, { root });
  assert.equal(handle.node, node);
  assert.deepEqual(host.children, [node]);
  handle.remove();
  assert.deepEqual(host.children, []);
  handle.remove(); // 第二次不报错
  assert.deepEqual(host.children, []);
});

test('挂载：找不到槽位抛中文错误并提示 data-slot 写法', () => {
  const root = fakeRoot({});
  assert.throws(() => mountTo('stage', {}, { root }), /找不到挂载点「stage」.*data-slot="stage"/);
});

test('挂载：node 非法时中文报错', () => {
  const root = fakeRoot({ modal: fakeHost() });
  assert.throws(() => mountTo('modal', undefined, { root }), /挂载内容必须是 DOM 节点/);
  assert.throws(() => mountTo('modal', null, { root }), /挂载内容必须是 DOM 节点/);
});

test('槽位：默认根取 globalThis.document', () => {
  const host = fakeHost();
  // 精确还原：原本是自有属性就写回原值，原本没有才删除（不能无条件 delete）。
  const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const originalDocument = globalThis.document;
  globalThis.document = {
    querySelector: (selector) => (selector === '[data-slot="home"]' ? host : null),
  };
  try {
    assert.equal(findSlot('home'), host);
  } finally {
    if (hadDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  }
});

test('槽位：非标准根时查询结果收敛为 null', () => {
  const root = { querySelector: () => undefined };
  assert.equal(findSlot('modal', root), null);
});

test('挂载：未知槽名先按未知挂载点报错', () => {
  const root = fakeRoot({});
  assert.throws(() => mountTo('toast', {}, { root }), /未知的挂载点「toast」/);
  assert.throws(
    () => mountTo('toast', {}, { root }),
    (err) => !/找不到挂载点/.test(err.message)
  );
});
