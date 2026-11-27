import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const mainCss = readFileSync(new URL('styles/main.css', root), 'utf8');
const extensionsCss = readFileSync(new URL('styles/extensions.css', root), 'utf8');

function compactBlocks(css) {
  return [...css.matchAll(/@media\s*\(max-height:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
}

test('short landscape layout applies to real phone CSS viewports around 524px tall', () => {
  for (const css of [mainCss, extensionsCss]) {
    const heights = compactBlocks(css);
    assert.ok(heights.length > 0, 'expected compact landscape media queries');
    assert.ok(
      heights.every((height) => height >= 524),
      `compact landscape breakpoint must cover 524px, got ${heights.join(', ')}`,
    );
  }
});

test('short landscape dialogue remains bounded by the dynamic viewport', () => {
  assert.match(mainCss, /max-height:\s*calc\(100dvh\s*-\s*62px\)/);
});
