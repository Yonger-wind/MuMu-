/* ============================================================
   暮幕 · 舞台渲染器延迟装载
   scene.js（含 prop.js）是首屏最大的一块代码，但首页并不需要它：
   只有真正要开演 / 打开剧目选择时才装载。这里做一个同接口的壳，
   装载完成前把最后一次画面与运行意图缓存下来，就绪后一次补齐，
   因此调用方（engine / showScreen）的写法与原来完全一致。
   ============================================================ */

export function createLazySceneRenderer(canvas, { onFail, load = () => import('./scene.js') } = {}) {
  let real = null;
  let loading = null;
  let lastSet = null;      // 最近一次要显示的画面
  let wantRun = false;     // 调用方此刻是否希望它在跑
  let wantPreload = false; // 调用方是否要过场景大图（星月夜 / 陆家嘴 / 乐谱）
  const listeners = [];

  function flush(r) {
    // 先补大图请求再补画面：src 赋值晚一帧，第一帧就会画成程序化兜底夜景
    if (wantPreload) { wantPreload = false; r.preloadImages(); }
    if (lastSet) r.set(lastSet);
    for (const fn of listeners) r.onChange(fn);
    if (wantRun) r.start();
  }

  function ensure() {
    if (real) return Promise.resolve(real);
    if (!loading) {
      loading = load()
        .then((m) => {
          real = m.createSceneRenderer(canvas);
          loading = null;
          flush(real);
          return real;
        })
        .catch((err) => {
          // 不把失败抛回调用方：fire-and-forget 的调用会在控制台留下未处理的拒绝。
          // 这里清空进行中的标记，下一次要画面时自然重试，同时给上层一次提示机会。
          loading = null;
          if (onFail) onFail(err);
          return null;
        });
    }
    return loading;
  }

  return {
    set(payload) {
      lastSet = payload;
      if (real) real.set(payload);
    },
    start() {
      wantRun = true;
      if (real) real.start();
      else ensure();
    },
    stop() {
      wantRun = false;
      if (real) real.stop();
    },
    preloadImages() {
      if (real) real.preloadImages();
      else { wantPreload = true; ensure(); }
    },
    resize() {
      if (real) real.resize();
    },
    onChange(fn) {
      listeners.push(fn);
      if (real) real.onChange(fn);
    },
    get state() {
      return real ? real.state : lastSet;
    },
    get ready() {
      return !!real;
    },
    whenReady: ensure,
  };
}
