import test from 'node:test';
import assert from 'node:assert/strict';
import { pickProp } from '../scripts/prop.js';

test('特写道具：玄铁令牌优先于青铜雕塑', () => {
  const t = '顾怀远走到画案前，从宽大的玄色官袍袖中取出一枚冰冷的玄铁令牌，重重地放在画案的青铜镇纸旁。';
  assert.equal(pickProp(t), 'token');
});

test('特写道具：只提到青铜雕塑时仍然是雕塑', () => {
  const t = '你注意看书桌右侧那尊倒下的青铜雕塑底座，上面有明显的擦拭痕迹。';
  assert.equal(pickProp(t), 'sculpture');
});

test('特写道具：令牌单独出现时是令牌', () => {
  assert.equal(pickProp('他把令牌放在桌上。'), 'token');
});
