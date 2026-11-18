/* ============================================================
   暮幕 · 轻音乐合成器 (Web Audio)
   三首内置曲目，全部实时合成：钢琴般的拨弦 + 柔和铺底 + 混响
   ============================================================ */

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// 曲目定义：和弦进行 + 旋律音阶 + 速度
const TRACKS = [
  {
    id: 'dusk',
    name: '暮色',
    bpm: 62,
    // C 大调 / A 小调 的柔和进行：Am - F - C - G
    chords: [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]],
    scale: [69, 72, 74, 76, 79, 81, 84],
    pad: 'sine',
  },
  {
    id: 'wind',
    name: '风起',
    bpm: 72,
    // D 大调：D - A - Bm - G
    chords: [[50, 57, 62], [57, 61, 64], [59, 62, 66], [55, 59, 62]],
    scale: [74, 76, 78, 81, 83, 85, 86],
    pad: 'triangle',
  },
  {
    id: 'stardust',
    name: '星屑',
    bpm: 54,
    // E 小调：Em - C - G - D
    chords: [[52, 59, 64], [48, 55, 64], [55, 59, 62], [50, 57, 66]],
    scale: [71, 74, 76, 79, 83, 86, 88],
    pad: 'sine',
  },
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let reverbSend = null;
  let trackIdx = 0;
  let playing = false;
  let muted = false;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  const listeners = new Set();

  function emit() {
    const state = { muted, playing, track: TRACKS[trackIdx] };
    listeners.forEach((fn) => fn(state));
  }

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 简易混响：生成噪声冲击响应
    const conv = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    conv.buffer = buf;
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.55;
    reverbSend.connect(conv);
    conv.connect(master);
    return true;
  }

  function voice(freq, t, dur, type, vol, pan = 0) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    osc.connect(g);
    out.connect(master);
    out.connect(reverbSend);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function pad(freq, t, dur, type, vol) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(master);
    g.connect(reverbSend);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function schedule() {
    if (!playing) return;
    const tr = TRACKS[trackIdx];
    const beat = 60 / tr.bpm;
    const stepDur = beat / 2;                 // 八分音符
    while (nextTime < ctx.currentTime + 0.6) {
      const barLen = 16;                       // 每和弦 16 个八分音符 = 2 小节
      const chordIdx = Math.floor(step / barLen) % tr.chords.length;
      const inBar = step % barLen;
      const chord = tr.chords[chordIdx];

      // 和弦起拍：柔和铺底
      if (inBar === 0) {
        const dur = stepDur * barLen;
        chord.forEach((n, i) => pad(NOTE(n - 12), nextTime, dur * 1.05, tr.pad, 0.045 - i * 0.008));
        voice(NOTE(chord[0] - 12), nextTime, stepDur * 8, 'sine', 0.12);
      }
      // 琶音：每两个八分一个音
      if (inBar % 2 === 0) {
        const n = chord[(inBar / 2) % chord.length] + 12;
        voice(NOTE(n), nextTime, beat * 2.2, 'triangle', 0.07, -0.3 + (inBar % 4) * 0.15);
      }
      // 旋律：稀疏、带随机性的高音
      if (inBar % 4 === 2 && Math.random() < 0.62) {
        const sc = tr.scale;
        const n = sc[Math.floor(Math.random() * sc.length)];
        voice(NOTE(n), nextTime, beat * 3, 'sine', 0.085, 0.25);
      }
      nextTime += stepDur;
      step++;
    }
    timer = setTimeout(schedule, 120);
  }

  async function start() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') await ctx.resume();
    if (playing) return;
    playing = true;
    step = 0;
    nextTime = ctx.currentTime + 0.1;
    const target = muted ? 0 : 0.85;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(target, ctx.currentTime + 2.4);
    schedule();
    emit();
  }

  function stopLoop() {
    playing = false;
    clearTimeout(timer);
  }

  function setMuted(m) {
    muted = m;
    if (ctx && master) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(m ? 0 : 0.85, ctx.currentTime + 0.5);
    }
    try { localStorage.setItem('mumu.muted', m ? '1' : '0'); } catch (e) {}
    emit();
  }

  function toggleMute() {
    setMuted(!muted);
    // 用户首次点击时若尚未启动，则启动
    if (!muted && !playing) start();
    return muted;
  }

  function next() {
    trackIdx = (trackIdx + 1) % TRACKS.length;
    step = 0;
    if (ctx) nextTime = ctx.currentTime + 0.2;
    emit();
  }

  function setTrack(id) {
    const i = TRACKS.findIndex((t) => t.id === id);
    if (i >= 0) { trackIdx = i; step = 0; if (ctx) nextTime = ctx.currentTime + 0.2; emit(); }
  }

  function onChange(fn) { listeners.add(fn); fn({ muted, playing, track: TRACKS[trackIdx] }); return () => listeners.delete(fn); }

  try { muted = localStorage.getItem('mumu.muted') === '1'; } catch (e) {}

  return {
    start, next, setTrack, setMuted, toggleMute, onChange,
    get muted() { return muted; },
    get tracks() { return TRACKS; },
    get playing() { return playing; },
  };
}
