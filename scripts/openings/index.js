/* ============================================================
   曲目开场动画入口
   ------------------------------------------------------------
   main.js 只 import 这个文件（很小）；四段动画各自 600~900 行，
   用动态 import 按需拉取，首页与开演不被拖慢。
   ============================================================ */

import { openSeriesOpening, isOpeningOpen } from './shell.js';

const LOADERS = {
  vortex: () => import('./vortex.js').then((m) => m.VORTEX),
  cicada: () => import('./cicada.js').then((m) => m.CICADA),
  qinglv: () => import('./qinglv.js').then((m) => m.QINGLV),
  moonlight: () => import('./moonlight.js').then((m) => m.MOONLIGHT),
};

export function hasOpening(series) {
  return Object.prototype.hasOwnProperty.call(LOADERS, series);
}

export function isOpeningActive() {
  return isOpeningOpen();
}

/** 播放某部曲目的第一章开场动画；onDone 在用户开演时调用，onStageReady 决定何时撤层。 */
export function playOpening(series, { onDone, onStageReady } = {}) {
  const done = typeof onDone === 'function' ? onDone : () => {};
  const load = LOADERS[series];
  if (!load) { done(); return; }
  load().then((definition) => {
    if (!definition) { done(); return; }
    openSeriesOpening(definition, { onDone: done, onStageReady });
  }).catch(() => {
    // 动画模块没能加载：不卡住剧情，直接进剧本
    done();
  });
}

/**
 * 预热开场动画模块：动画美术每部 600~900 行，点「开始体验」之后才开始取文件，
 * 这段时间画面仍停在首页，感觉像「点了没反应」。在打开剧目选择时就顺手取好。
 * 只 prefetch 当前选择里真实存在的曲目，失败静默（真要播时还会重试）。
 */
export function prefetchOpenings(seriesList = []) {
  const run = () => seriesList.forEach((s) => {
    const load = LOADERS[s];
    if (load) Promise.resolve(load()).catch(() => {});
  });
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1200 });
  else setTimeout(run, 400);
}