/* ============================================================
   暮幕 · 剧情引擎
   把“剧本对象”变成可推进、可存档的游戏状态
   存档只保存：剧本 id、当前节点下标、场景/镜头状态、在场角色、历史选择
   ============================================================ */

import { createState, cloneState, deserializeState, pushCheckpoint } from './state.js';

export function createEngine({ renderer, ui, onEnd, endOptions }) {
  let script = null;
  let idx = 0;
  let cast = [];                 // 在场角色名
  let sceneState = { scene: 'classroom', time: 'dusk', cam: 'mid' };
  let actState = { poses: {}, actions: {}, view: 'normal' };   // 剪影舞台指示
  let choices = [];              // 已做的选择
  let lastSpeaker = '';          // 最近一句的说话人（舞台指示刷新时保持画面）
  let lastProp = '';             // 最近一句文本（特写镜头挑选道具）
  let typing = null;
  let fullText = '';
  let waiting = false;           // 正在等待玩家点击
  let waitingChoice = false;
  let ended = false;
  let state = createState();        // 旗标 / 数值 / 结局标识 / 检查点
  let skipCheckpoint = false;       // 回退到选项时跳过一次检查点登记

  function charOf(name) {
    return script.characters.find((c) => c.name === name);
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
    return true;
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
          syncRenderer('', null, lastProp);
          ui.setName(`${n.who || '画外'}（${n.voice}）`);
        } else {
          pushCast(n.who);
          lastSpeaker = n.who;
          lastProp = n.text;
          syncRenderer(n.who, n.pose || null, n.text);
          ui.setName(n.who);
        }
        ui.setChoices([]);
        idx++;
        typeText(n.text, () => { waiting = true; ui.showHint(true); });
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
        ui.setChoices(n.options.map((o) => o.text), (i) => {
          choices.push(n.options[i].text);
          // 检查点已在选项 UI 出现前入栈，因此 rewind 会连旗标一起回滚
          applyOptionFlags(n.options[i]);
          ui.setChoices([]);
          idx = script.labels[n.options[i].to];
          run();
        });
        return;
      }
      if (n.t === 'end') {
        ended = true;
        if (n.ending) state.endingId = n.ending;
        ui.setName('');
        ui.setText('—— 故事暂时落幕 ——');
        ui.showHint(false);
        // 章节结束时：先给外部追加的动作（继续下一章 / 换一个剧本），再接通用动作
        const extra = (typeof endOptions === 'function' && endOptions(script)) || [];
        const options = [
          ...extra,
          { label: '重新开始', run: () => start(script) },
          { label: '返回首页', run: () => onEnd && onEnd() },
        ];
        ui.setChoices(options.map((o) => o.label), (i) => {
          const opt = options[i];
          if (opt) opt.run();
        });
        return;
      }
      idx++;
    }
  }

  /* ---------- 对外接口 ---------- */
  function start(sc, snapshot = null, carry = null) {
    script = sc;
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
    sceneState = { scene: sc.cover.scene, time: sc.cover.time, cam: 'mid' };
    if (snapshot) {
      idx = Math.max(0, Math.min(snapshot.idx, sc.nodes.length - 1));
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
      syncRenderer(snapshot.speaker || '');
      // 存档回读：直接定位到该节点
    }
    ui.setTitle(sc.title);
    syncRenderer();
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
    lastProp = '';
    ended = false;
    syncRenderer();
    run();
    return true;
  }

  return {
    start, advance, snapshot, rewind, setFlag, getFlag, setVar, getVar,
    get script() { return script; },
    get ended() { return ended; },
    get state() { return state; },
  };
}
