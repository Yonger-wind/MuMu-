/* ============================================================
   暮幕 · 剧情引擎
   把“剧本对象”变成可推进、可存档的游戏状态
   存档只保存：剧本 id、当前节点下标、场景/镜头状态、在场角色、历史选择
   ============================================================ */

import { createState, cloneState, deserializeState, pushCheckpoint } from './state.js';

export function createEngine({ renderer, ui, onEnd, endOptions, onProgress }) {
  let script = null;
  let idx = 0;
  let cast = [];                 // 在场角色名
  let sceneState = { scene: 'classroom', time: 'dusk', cam: 'mid' };
  let actState = { poses: {}, actions: {}, view: 'normal' };   // 剪影舞台指示
  let choices = [];              // 已做的选择
  let lastSpeaker = '';          // 最近一句的说话人（舞台指示刷新时保持画面）
  let lastProp = '';             // 最近一句文本（特写镜头挑选道具）
  let lastLine = null;           // 最近一句台词/旁白（终幕结算用）
  let typing = null;
  let fullText = '';
  let waiting = false;           // 正在等待玩家点击
  let waitingChoice = false;
  let ended = false;
  let state = createState();        // 旗标 / 数值 / 结局标识 / 检查点
  let skipCheckpoint = false;       // 回退到选项时跳过一次检查点登记
  // 逐句历史：每次停在台词上记一份完整画面，供「回退一句」使用
  let history = [];
  let historyPos = -1;
  let view = 'none';                // 当前停下的画面：say / choice / end
  const HISTORY_LIMIT = 300;

  function setBackEnabled(on) {
    if (ui && typeof ui.setBackEnabled === 'function') ui.setBackEnabled(!!on);
  }
  function canBack() {
    if (!script || !history.length) return false;
    if (view === 'say') return historyPos > 0;
    return historyPos >= 0;
  }
  function updateBackUi() { setBackEnabled(canBack()); }

  /** 停在台词上时记录当前画面；前进到新台词会丢弃曾回退掉的“未来”。 */
  function recordSay(n, displayName) {
    if (historyPos < history.length - 1) history.length = historyPos + 1;
    history.push({
      idx,
      cast: [...cast],
      sceneState: { ...sceneState },
      actState: {
        poses: { ...actState.poses },
        actions: { ...actState.actions },
        view: actState.view,
      },
      speaker: lastSpeaker,
      propText: lastProp,
      line: lastLine ? { ...lastLine } : null,
      name: displayName,
      text: n.text,
      pose: n.voice ? null : (n.pose || null),
      choices: [...choices],
      state: cloneState(state),
    });
    if (history.length > HISTORY_LIMIT) history.shift();
    historyPos = history.length - 1;
    view = 'say';
    updateBackUi();
  }

  /** 静态还原一帧历史画面：不重放打字机，也不重新推进剧本。 */
  function restoreSay(i) {
    const h = history[i];
    if (!h) return false;
    if (ui && typeof ui.clearFinale === 'function') ui.clearFinale();
    clearInterval(typing);
    typing = null;
    idx = h.idx;
    cast = [...h.cast];
    sceneState = { ...h.sceneState };
    actState = {
      poses: { ...(h.actState.poses || {}) },
      actions: { ...(h.actState.actions || {}) },
      view: h.actState.view || 'normal',
    };
    state = deserializeState(h.state);
    lastSpeaker = h.speaker;
    lastProp = h.propText;
    lastLine = h.line ? { ...h.line } : null;
    choices = [...h.choices];
    skipCheckpoint = false;
    ended = false;
    waiting = true;
    waitingChoice = false;
    historyPos = i;
    view = 'say';
    fullText = h.text;
    ui.setChoices([]);
    syncRenderer(h.speaker, h.pose, h.propText);
    ui.setName(h.name);
    ui.setText(h.text);
    ui.showHint(true);
    updateBackUi();
    notifyProgress();
    return true;
  }

  function charOf(name) {
    return script.characters.find((c) => c.name === name);
  }

  /** 一句台词 → 结算用的 { who, text }；画外音把说明并进名字。 */
  function lineOf(n) {
    const who = n.voice ? `${n.who || '画外'}（${n.voice}）` : (n.who || '');
    return { who, text: n.text };
  }

  /**
   * 往前找回「特写道具」的文本，规则与 run() 里改写 lastProp 的那几行一致：
   * 只认非画外音台词，且以最后一个 scene 节点为界（换场景时道具本就该清空）。
   * 读档与回退到选项 / 结尾时不会重放台词，不找回就会停在特写空镜头上。
   */
  function propTextUpTo(atIdx) {
    if (!script) return '';
    const at = Math.min(atIdx, script.nodes.length - 1);
    let from = 0;
    for (let i = at; i >= 0; i--) {
      if (script.nodes[i].t === 'scene') { from = i + 1; break; }
    }
    for (let i = at; i >= from; i--) {
      const n = script.nodes[i];
      if (n.t === 'say' && !n.voice) return n.text;
    }
    return '';
  }

  function pushCast(name) {
    if (!name || cast.includes(name)) return;
    cast.push(name);
    if (cast.length > 3) cast.shift();
  }

  function syncRenderer(speaker = '', linePose = null, propText = '') {
    const poses = {};
    const actions = {};
    for (const name of cast) {
      poses[name] = (name === speaker && linePose) || actState.poses[name] || actState.poses['*'] || 'neutral';
      actions[name] = actState.actions[name] || actState.actions['*'] || 'stand';
    }
    renderer.set({
      ...sceneState,
      cast: cast.map(charOf).filter(Boolean),
      speaker,
      poses,
      actions,
      view: actState.view,
      propText,
    });
  }

  /* ---------- 打字机 ---------- */
  function typeText(text, done) {
    clearInterval(typing);
    fullText = text;
    let i = 0;
    ui.setText('');
    ui.showHint(false);
    typing = setInterval(() => {
      i += 1;
      ui.setText(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(typing);
        typing = null;
        done && done();
      }
    }, 34);
  }

  function finishTyping() {
    if (!typing) return false;
    clearInterval(typing);
    typing = null;
    ui.setText(fullText);
    ui.showHint(true);
    waiting = true;
    notifyProgress();
    return true;
  }

  /** 每到一个可停下来的位置（台词、选项、结束）交出快照，供自动存档使用。 */
  function notifyProgress() {
    if (typeof onProgress !== 'function' || !script) return;
    onProgress(snapshot());
  }

  /** 条件行是否成立：只读布尔旗标；缺字段按“未发生”处理。 */
  function condOk(cond) {
    if (!cond || !cond.key) return true;
    const on = !!(state.flags && state.flags[cond.key]);
    return cond.neg ? !on : on;
  }

  /** 选中选项时把注解里的旗标全部置真。 */
  function applyOptionFlags(opt) {
    if (!opt || !Array.isArray(opt.set)) return;
    for (const key of opt.set) {
      if (key) state.flags[key] = true;
    }
  }

  /* ---------- 核心：运行到下一次需要玩家参与 ---------- */
  function run() {
    waiting = false;
    waitingChoice = false;
    while (idx < script.nodes.length) {
      const n = script.nodes[idx];

      // 条件不成立的整行跳过：不渲染、不发声，只前进一格
      if (n.cond && !condOk(n.cond)) { idx++; continue; }

      if (n.t === 'scene') {
        sceneState = { scene: n.scene, time: n.time, cam: n.cam };
        // 换场景时清场，让新场景更干净；舞台指示一并复位
        cast = [];
        actState = { poses: {}, actions: {}, view: 'normal' };
        lastProp = '';
        syncRenderer();
        ui.flash();                       // 分镜：淡入淡出闪切
        idx++;
        continue;
      }
      if (n.t === 'cam') {
        sceneState = { ...sceneState, cam: n.cam };
        syncRenderer();
        idx++;
        continue;
      }
      if (n.t === 'pose') {
        if (n.who && charOf(n.who)) pushCast(n.who);
        actState.poses[n.who || '*'] = n.pose;
        syncRenderer(lastSpeaker, null, lastProp);
        idx++;
        continue;
      }
      if (n.t === 'action') {
        if (n.who && charOf(n.who)) pushCast(n.who);
        actState.actions[n.who || '*'] = n.action;
        syncRenderer(lastSpeaker, null, lastProp);
        idx++;
        continue;
      }
      if (n.t === 'view') {
        actState.view = n.view;
        syncRenderer(lastSpeaker, null, lastProp);
        idx++;
        continue;
      }
      if (n.t === 'enter') {
        // 出场：人物先站上舞台，但不发言（台词仍由后续 say 节点触发）
        (n.names || []).forEach((name) => { if (charOf(name)) pushCast(name); });
        syncRenderer(lastSpeaker, null, lastProp);
        idx++;
        continue;
      }
      if (n.t === 'clear') {
        // 清场：只留场景，用于纯环境描写的段落
        cast = [];
        actState = { poses: {}, actions: {}, view: 'normal' };
        lastSpeaker = '';
        syncRenderer();
        idx++;
        continue;
      }
      if (n.t === 'jump') {
        idx = script.labels[n.to];
        continue;
      }
      if (n.t === 'say') {
        // 画外音（录音 / 电话 / 回忆）只显示名字，不让人物出场；
        // 也不改写特写道具，避免录音台词把镜头里的物件换掉
        if (n.voice) {
          lastSpeaker = '';
          lastLine = lineOf(n);
          syncRenderer('', null, lastProp);
          ui.setName(`${n.who || '画外'}（${n.voice}）`);
        } else {
          pushCast(n.who);
          lastSpeaker = n.who;
          lastProp = n.text;
          lastLine = lineOf(n);
          syncRenderer(n.who, n.pose || null, n.text);
          ui.setName(n.who);
        }
        ui.setChoices([]);
        idx++;
        // 记录这一帧：idx 已指向下一格，回退还原画面后再前进不会重播同一句
        recordSay(n, n.voice ? `${n.who || '画外'}（${n.voice}）` : n.who);
        typeText(n.text, () => { waiting = true; ui.showHint(true); notifyProgress(); });
        return;
      }
      if (n.t === 'choice') {
        // 选项出现前先留一个检查点：玩家可以退回这里重选
        if (skipCheckpoint) {
          // 从回退回到这个选项时不再重复登记同一个检查点
          skipCheckpoint = false;
        } else {
          pushCheckpoint(state, {
            idx,
            label: n.label || '',
            choices: [...choices],
            cast: [...cast],
            sceneState: { ...sceneState },
            actState: { poses: { ...actState.poses }, actions: { ...actState.actions }, view: actState.view },
            flags: { ...state.flags },
            vars: { ...state.vars },
          });
        }
        ui.setName('');
        ui.setText('你会怎么做？');
        ui.showHint(false);
        waitingChoice = true;
        view = 'choice';
        updateBackUi();
        ui.setChoices(n.options.map((o) => o.text), (i) => {
          choices.push(n.options[i].text);
          // 检查点已在选项 UI 出现前入栈，因此 rewind 会连旗标一起回滚
          applyOptionFlags(n.options[i]);
          ui.setChoices([]);
          idx = script.labels[n.options[i].to];
          run();
        });
        notifyProgress();
        return;
      }
      if (n.t === 'end') {
        ended = true;
        if (n.ending) state.endingId = n.ending;
        ui.setName('');
        ui.setText('—— 故事暂时落幕 ——');
        ui.showHint(false);
        view = 'end';
        updateBackUi();
        // 章节结束时：先给外部追加的动作（继续下一章 / 换一个剧本），再接通用动作
        // 第二个参数是结束现场摘要，供终幕结算卡使用（旧调用方可忽略）
        const summary = {
          scene: sceneState.scene,
          time: sceneState.time,
          cam: sceneState.cam,
          choices: [...choices],
          line: lastLine ? { ...lastLine } : null,
          ending: n.ending || '',
        };
        const extra = (typeof endOptions === 'function' && endOptions(script, summary)) || [];
        const options = [
          ...extra,
          { label: '重新开始', run: () => start(script) },
          { label: '返回首页', run: () => onEnd && onEnd() },
        ];
        ui.setChoices(options.map((o) => o.label), (i) => {
          const opt = options[i];
          if (opt) opt.run();
        });
        notifyProgress();
        return;
      }
      idx++;
    }
  }

  /* ---------- 对外接口 ---------- */
  function start(sc, snapshot = null, carry = null) {
    script = sc;
    // 新的一程开始：终幕结算卡（如果还在）先收起来
    if (ui && typeof ui.clearFinale === 'function') ui.clearFinale();
    ended = false;
    choices = [];
    cast = [];
    idx = 0;
    actState = { poses: {}, actions: {}, view: 'normal' };
    state = snapshot && snapshot.state ? deserializeState(snapshot.state) : createState();
    // 跨章只带旗标：有快照时旗标以快照为准，carry 不参与
    if (!snapshot && carry && typeof carry === 'object') state.flags = { ...carry };
    skipCheckpoint = false;
    lastSpeaker = '';
    lastProp = '';
    lastLine = null;
    history = [];
    historyPos = -1;
    view = 'none';
    sceneState = { scene: sc.cover.scene, time: sc.cover.time, cam: 'mid' };
    if (snapshot) {
      idx = Math.max(0, Math.min(snapshot.idx, sc.nodes.length - 1));
      // 自动存档正好停在选项上：该检查点已随快照恢复，不再重复登记
      if (script.nodes[idx] && script.nodes[idx].t === 'choice') skipCheckpoint = true;
      // 直接在结尾读档时，结算卡需要最后一句台词：从当前节点往前找
      const priorSay = [...sc.nodes.slice(0, idx + 1)].reverse().find((n) => n.t === 'say');
      lastLine = priorSay ? lineOf(priorSay) : null;
      cast = (snapshot.cast || []).filter((n) => charOf(n));
      choices = snapshot.choices || [];
      sceneState = snapshot.sceneState || sceneState;
      if (snapshot.actState) {
        actState = {
          poses: { ...(snapshot.actState.poses || {}) },
          actions: { ...(snapshot.actState.actions || {}) },
          view: snapshot.actState.view || 'normal',
        };
      }
      // 存档回读：停在选项 / 结尾 / 画外音特写时台词不会被重放，道具文本要自己找回来
      lastProp = propTextUpTo(idx);
      syncRenderer(snapshot.speaker || '', null, lastProp);
    }
    ui.setTitle(sc.title);
    syncRenderer(snapshot ? (snapshot.speaker || '') : '', null, lastProp);
    run();
  }

  function advance() {
    if (!script || ended || waitingChoice) return;
    if (finishTyping()) return;
    if (waiting) run();
  }

  function snapshot() {
    if (!script) return null;
    // 存档指向“上一句已读完”的位置：回读时会重新演出该节点前一格
    const safeIdx = Math.max(0, idx - (waiting || typing ? 1 : 0));
    const lastSay = [...script.nodes.slice(0, safeIdx + 1)].reverse().find((n) => n.t === 'say');
    return {
      scriptId: script.id,
      idx: safeIdx,
      cast: [...cast],
      sceneState: { ...sceneState },
      actState: { poses: { ...actState.poses }, actions: { ...actState.actions }, view: actState.view },
      speaker: '',
      choices: [...choices],
      preview: lastSay ? lastSay.text.slice(0, 36) : '',
      progress: Math.round((safeIdx / Math.max(1, script.nodes.length - 1)) * 100),
      state: cloneState(state),
    };
  }

  /* ---------- 状态层对外接口 ---------- */
  function setFlag(key, value = true) {
    if (key) state.flags[key] = value;
    return state;
  }
  function getFlag(key) { return !!(state.flags && state.flags[key]); }
  function setVar(key, value) {
    if (key) state.vars[key] = value;
    return state;
  }
  function getVar(key, fallback = 0) {
    const v = state.vars ? state.vars[key] : undefined;
    return v === undefined ? fallback : v;
  }

  /**
   * 退回上一个选项：位置、站位、旗标、数值一起回滚。
   * 站在选项上时退到再前一个选项；已经走过选项时退回最后一个选项重新选。
   */
  function rewind() {
    const list = state.checkpoints || [];
    const t = waitingChoice ? list.length - 2 : list.length - 1;
    if (t < 0) return false;
    // 从结束页退回选项时，结算卡不应该继续留在画面里
    if (ui && typeof ui.clearFinale === 'function') ui.clearFinale();
    const cp = list[t];
    // 目标检查点不再重复登记：回到该选项时由 skipCheckpoint 拦掉
    state.checkpoints = list.slice(0, t);
    skipCheckpoint = true;
    idx = cp.idx;
    cast = [...cp.cast];
    sceneState = { ...cp.sceneState };
    actState = {
      poses: { ...(cp.actState.poses || {}) },
      actions: { ...(cp.actState.actions || {}) },
      view: cp.actState.view || 'normal',
    };
    state.flags = { ...cp.flags };
    state.vars = { ...cp.vars };
    state.endingId = '';
    lastSpeaker = '';
    // 回到选项时同样要带着道具文本：检查点正停在特写镜头上时不能变成空画面
    lastProp = propTextUpTo(cp.idx);
    lastLine = null;
    ended = false;
    // 选项回退会改变剧情走向，逐句历史随之作废，避免退回到已不成立的画面
    history = [];
    historyPos = -1;
    view = 'none';
    syncRenderer('', null, lastProp);
    run();
    return true;
  }

  /**
   * 回退一句：停在台词上时退到上一条；停在选项 / 结局上时退到最近一句。
   * 一次只退一屏，可以一直退。
   */
  function back() {
    if (!script) return false;
    const target = view === 'say' ? historyPos - 1 : historyPos;
    if (target < 0 || target >= history.length) return false;
    return restoreSay(target);
  }

  return {
    start, advance, back, canBack, snapshot, rewind, setFlag, getFlag, setVar, getVar,
    get script() { return script; },
    get ended() { return ended; },
    get state() { return state; },
    get choices() { return [...choices]; },
    get lastLine() { return lastLine ? { ...lastLine } : null; },
  };
}
