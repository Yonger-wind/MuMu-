/* ============================================================
   暮幕 · 剧情引擎
   把“剧本对象”变成可推进、可存档的游戏状态
   存档只保存：剧本 id、当前节点下标、场景/镜头状态、在场角色、历史选择
   ============================================================ */

export function createEngine({ renderer, ui, onEnd }) {
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

  function charOf(name) {
    return script.characters.find((c) => c.name === name);
  }

  function pushCast(name) {
    if (!name) return;
    cast = cast.filter((n) => n !== name);
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

  /* ---------- 核心：运行到下一次需要玩家参与 ---------- */
  function run() {
    waiting = false;
    waitingChoice = false;
    while (idx < script.nodes.length) {
      const n = script.nodes[idx];

      if (n.t === 'scene') {
        sceneState = { scene: n.scene, time: n.time, cam: n.cam };
        // 换场景时清场，让新场景更干净；舞台指示一并复位
        cast = [];
        actState = { poses: {}, actions: {}, view: 'normal' };
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
      if (n.t === 'jump') {
        idx = script.labels[n.to];
        continue;
      }
      if (n.t === 'say') {
        pushCast(n.who);
        lastSpeaker = n.who;
        lastProp = n.text;
        syncRenderer(n.who, n.pose || null, n.text);
        ui.setName(n.who);
        ui.setChoices([]);
        idx++;
        typeText(n.text, () => { waiting = true; ui.showHint(true); });
        return;
      }
      if (n.t === 'choice') {
        ui.setName('');
        ui.setText('你会怎么做？');
        ui.showHint(false);
        waitingChoice = true;
        ui.setChoices(n.options.map((o) => o.text), (i) => {
          choices.push(n.options[i].text);
          ui.setChoices([]);
          idx = script.labels[n.options[i].to];
          run();
        });
        return;
      }
      if (n.t === 'end') {
        ended = true;
        ui.setName('');
        ui.setText('—— 故事暂时落幕 ——');
        ui.showHint(false);
        ui.setChoices(['返回首页', '重新开始'], (i) => {
          if (i === 0) onEnd && onEnd();
          else start(script);
        });
        return;
      }
      idx++;
    }
  }

  /* ---------- 对外接口 ---------- */
  function start(sc, snapshot = null) {
    script = sc;
    ended = false;
    choices = [];
    cast = [];
    idx = 0;
    actState = { poses: {}, actions: {}, view: 'normal' };
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
    };
  }

  return { start, advance, snapshot, get script() { return script; }, get ended() { return ended; } };
}
