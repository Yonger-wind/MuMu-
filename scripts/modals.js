/* ============================================================
   暮幕 · 弹层：剧本库 / 导入 / 存档 / 玩法说明
   ============================================================ */
import { LIMITS, SCENES, readFileToScript, FORMAT_EXAMPLE, countChars, parseScriptText } from './parser.js';
import { fmtTime } from './storage.js';

const root = () => document.getElementById('modal-root');

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const THUMB = {
  company:    'linear-gradient(160deg,#2a2350,#8c4a68 55%,#f0a05e)',
  classroom:  'linear-gradient(160deg,#3a2350,#c8667a 55%,#ffcf94)',
  playground: 'linear-gradient(160deg,#35305f,#d9705f 55%,#ffd08a)',
  ancient:    'linear-gradient(160deg,#241a3e,#6b4a8f 50%,#ff9d57)',
  palace:     'linear-gradient(160deg,#1d3846,#4f8f84 52%,#e6cf92)',
  pavilion:   'linear-gradient(160deg,#2a1a18,#7d5a38 55%,#e8bd73)',
  salon:      'linear-gradient(160deg,#211a32,#6b3a4a 50%,#d9a05a)',
  study:      'linear-gradient(160deg,#241426,#4a2a32 55%,#c98a4a)',
  street:     'linear-gradient(160deg,#1b2338,#33465e 55%,#e0a060)',
  estate:     'linear-gradient(160deg,#8fb6cc,#d9c9a4 55%,#4f6a44)',
  drawingroom:'linear-gradient(160deg,#4a3a2a,#9a7a52 55%,#e8c88a)',
  basement:   'linear-gradient(160deg,#1c2226,#3a4648 55%,#8a6a4a)',
  villa:      'linear-gradient(160deg,#3a4a6a,#c98a6a 55%,#f0d0a0)',
  vault:      'linear-gradient(160deg,#141a2a,#2a3a56 55%,#c9a860)',
  studio:     'linear-gradient(160deg,#2a2420,#6a5546 55%,#e8c890)',
  terrace:    'linear-gradient(160deg,#2a2440,#7a4a58 55%,#f0a060)',
  campus:     'linear-gradient(160deg,#1e2a24,#6b3a30 52%,#e8b06a)',
  pianoroom:  'linear-gradient(160deg,#191622,#3a3048 50%,#cfd8e8)',
  musicroom:  'linear-gradient(160deg,#2a2a34,#8a6a4a 52%,#f0d8a8)',
  belltower:  'linear-gradient(160deg,#101a30,#4a3a52 52%,#dfe6f5)',
  theateryard:'linear-gradient(160deg,#241a1c,#7a3a32 52%,#e8b47a)',
  theater:    'linear-gradient(160deg,#140f18,#4a1e2a 48%,#c9cfe0)',
  office:     'linear-gradient(160deg,#101a2c,#3a5878 52%,#e8c890)',
  bar:        'linear-gradient(160deg,#1c1612,#6a4a2a 52%,#e8b060)',
  city:       'linear-gradient(160deg,#0a1224,#1f4a6a 50%,#f0b060)',
  lawn:       'linear-gradient(160deg,#0e1a28,#3a4a3a 52%,#f0c070)',
  track:      'linear-gradient(160deg,#141a34,#5a2a2a 52%,#f0b070)',
};

/** 只接受 base64 图片 data URL，避免把任意字符串塞进 style 属性 */
const SAFE_IMG = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
/** 有封面就用封面图铺满缩略图，否则回落到渐变底 */
function coverStyle(s) {
  const url = String((s && s.coverImage) || '');
  if (SAFE_IMG.test(url)) {
    return `background-image:url('${url}');background-size:cover;background-position:center`;
  }
  const scene = s && s.cover ? s.cover.scene : '';
  return `background:${THUMB[scene] || THUMB.classroom}`;
}

/** 曲目卡可直接用原图做封面：漩涡 =《星月夜》，月光 =《悲怆》第二乐章乐谱。 */
const SERIES_COVER = {
  vortex: "linear-gradient(180deg, rgba(18,22,38,0.10), rgba(18,22,38,0.58)), url('./assets/images/starry-night.jpg') center/cover no-repeat",
  moonlight: "linear-gradient(180deg, rgba(20,22,32,0.06), rgba(20,22,32,0.62)), url('./assets/images/pathetique-score.png') center/cover no-repeat",
};

export function closeModal() { root().innerHTML = ''; }

export function openModal(title, bodyHtml, wide = false) {
  root().innerHTML = `
    <div class="modal-mask" data-close>
      <div class="modal" role="dialog" aria-label="${esc(title)}" ${wide ? 'style="width:min(760px,94vw)"' : ''}>
        <div class="modal-head">
          <div class="modal-title">${esc(title)}</div>
          <button class="modal-close" data-close aria-label="关闭">✕</button>
        </div>
        ${bodyHtml}
      </div>
    </div>`;
  const mask = root().querySelector('.modal-mask');
  mask.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  return root().querySelector('.modal');
}

/* ---------------- 剧本库 ---------------- */
/** 把同一 series 的多章合并为一张“曲目”卡；导入的剧本仍单卡展示。 */
export function groupScripts(scripts) {
  const entries = [];
  const bySeries = new Map();
  for (const s of scripts) {
    if (s.series) {
      let g = bySeries.get(s.series);
      if (!g) {
        g = {
          kind: 'series', key: s.series, title: s.seriesTitle || s.title,
          brief: '', cover: s.cover, chapters: [],
        };
        bySeries.set(s.series, g);
        entries.push(g);
      }
      g.chapters.push(s);
    } else {
      entries.push({ kind: 'single', key: s.id, script: s });
    }
  }
  entries.forEach((e) => {
    if (e.kind !== 'series') return;
    e.chapters.sort((a, b) => (a.chapterNo || 0) - (b.chapterNo || 0));
    // 曲目卡的简介取第一章的：库里同名的内置卡与导入卡必须显示同一句话，
    // 不能因为导入是倒序写入（addCustomScript 用 unshift）而拿到最后一章的简介
    e.brief = (e.chapters[0] && e.chapters[0].summary) || '';
  });
  return entries;
}

function singleCard(s) {
  return `
    <div class="script-card" data-id="${esc(s.id)}" tabindex="0">
      ${s.builtin ? '' : '<span class="badge-custom">已导入</span>'}
      <div class="script-thumb" style="${coverStyle(s)}"></div>
      <div class="script-body">
        <div class="script-name">${esc(s.title)}</div>
        <span class="script-tag">${esc(s.tag || SCENES[s.cover.scene]?.label || '剧本')}</span>
        <div class="script-brief">${esc(s.summary)}</div>
        ${s.builtin ? '' : `<div class="script-actions">
          <button class="mini-btn" data-export="${esc(s.id)}">导出 .mumu</button>
          <button class="mini-btn danger" data-del="${esc(s.id)}">移除</button>
        </div>`}
      </div>
    </div>`;
}

function seriesCard(g) {
  const first = g.chapters[0];
  // 组里只要有一章不是内置，这张卡就是用户导入的：给角标与「移除整本」入口
  const hasCustom = g.chapters.some((c) => c.builtin !== true);
  const chips = g.chapters.map((c) => `<span class="chapter-chip">${esc((c.tag || '').split(' · ')[0] || `第${c.chapterNo || ''}章`)}</span>`).join('');
  // 内置曲目用固定原图封面；导入的曲目包用自己的封面图
  const cover = SERIES_COVER[g.key]
    ? `background:${SERIES_COVER[g.key]}`
    : coverStyle({ coverImage: first.coverImage, cover: first.cover });
  return `
    <div class="script-card series-card" data-series="${esc(g.key)}" tabindex="0">
      <div class="script-thumb" style="${cover}">
        ${hasCustom ? '<span class="badge-custom">已导入</span>' : ''}
        <span class="series-badge">合订本 · 全 ${g.chapters.length} 章</span>
      </div>
      <div class="script-body">
        <div class="script-name">${esc(g.title)}</div>
        <span class="script-tag">曲目 · ${g.chapters.length} 章</span>
        <div class="script-brief">${esc(g.brief)}</div>
        <div class="chapter-chips">${chips}</div>
        <div class="script-actions">
          <button class="mini-btn" data-export-series="${esc(g.key)}">导出整本</button>
          ${hasCustom ? `<button class="mini-btn danger" data-del-series="${esc(g.key)}">移除整本</button>` : ''}
        </div>
      </div>
    </div>`;
}

/** 选完曲目后进入的章节选择页。 */
export function openChapters(group, onPlay, onBack, onExport) {
  const rows = group.chapters.map((c) => `
    <div class="chapter-row">
      <button class="chapter-item" data-id="${esc(c.id)}">
        <span class="chapter-no">${String(c.chapterNo || 0).padStart(2, '0')}</span>
        <span class="chapter-main">
          <span class="chapter-name">${esc(c.tag || c.title)}</span>
          <span class="chapter-brief">${esc(c.summary)}</span>
        </span>
        <span class="chapter-go">进入 ▸</span>
      </button>
      <button class="mini-btn chapter-export" data-export="${esc(c.id)}">导出</button>
    </div>`).join('');
  const m = openModal(`《${group.title}》`, `
    <div class="chapter-head">
      <button class="mini-btn" data-back>← 返回曲目</button>
      <span class="chapter-count">共 ${group.chapters.length} 章 · 选择一章开始</span>
    </div>
    <div class="chapter-list">${rows}</div>`, true);
  m.querySelector('[data-back]').addEventListener('click', () => { closeModal(); if (onBack) onBack(); });
  m.querySelectorAll('.chapter-item').forEach((el) => {
    el.addEventListener('click', () => {
      const sc = group.chapters.find((x) => x.id === el.dataset.id);
      if (!sc) return;
      closeModal();
      onPlay(sc);
    });
  });
  m.querySelectorAll('[data-export]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const sc = group.chapters.find((x) => x.id === el.dataset.export);
      if (sc && onExport) onExport({ kind: 'work', script: sc });
    });
  });
}

export function openLibrary({ scripts, onPlay, onDelete, onExport }) {
  const entries = groupScripts(scripts);
  const cards = entries.map((e) => (e.kind === 'series' ? seriesCard(e) : singleCard(e.script))).join('');
  const m = openModal('选择剧本', `<div class="script-grid">${cards}</div>`, true);

  // 曲目卡：先选曲目，再选章节
  m.querySelectorAll('.series-card').forEach((el) => {
    const group = entries.find((e) => e.kind === 'series' && e.key === el.dataset.series);
    if (!group) return;
    const go = () => openChapters(group, onPlay, () => openLibrary({ scripts, onPlay, onDelete, onExport }), onExport);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-export-series], [data-del-series]')) return;   // 卡内按钮不进入章节列表
      go();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) go(); });
  });

  // 独立剧本（含导入）：直接开始
  m.querySelectorAll('.script-card[data-id]').forEach((el) => {
    const go = () => { const sc = scripts.find((x) => x.id === el.dataset.id); closeModal(); onPlay(sc); };
    el.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      const exp = e.target.closest('[data-export]');
      if (del) { e.stopPropagation(); onDelete(del.dataset.del); return; }
      if (exp) {
        e.stopPropagation();
        const sc = scripts.find((x) => x.id === exp.dataset.export);
        if (sc && onExport) onExport({ kind: 'work', script: sc });
        return;
      }
      go();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) go(); });
  });

  // 曲目卡上的「导出整本」
  m.querySelectorAll('[data-export-series]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = entries.find((e) => e.kind === 'series' && e.key === el.dataset.exportSeries);
      if (group && onExport) onExport({ kind: 'series', scripts: group.chapters });
    });
  });

  // 曲目卡上的「移除整本」：一次删掉该组里所有非内置章节
  m.querySelectorAll('[data-del-series]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = entries.find((x) => x.kind === 'series' && x.key === el.dataset.delSeries);
      if (!group) return;
      const ids = group.chapters.filter((c) => c.builtin !== true).map((c) => c.id);
      if (!ids.length) return;
      if (onDelete) onDelete(ids);
    });
  });
}

/* ---------------- 存档列表 ---------------- */
export function openSaves({ saves, titleOf, onLoad, onDelete }) {
  let body;
  if (!saves.length) {
    body = `<div class="empty-state"><span class="ei">◷</span>还没有存档。<br/>在游玩时点击“保存进度”，故事就会停靠在这里。</div>`;
  } else {
    body = `<div class="save-list">${saves.map((s) => `
      <div class="save-item">
        <div class="save-main">
          <div class="save-title">${esc(titleOf(s.scriptId))}</div>
          <div class="save-sub">${fmtTime(s.time)} · 进度 ${s.progress}% · “${esc(s.preview)}…”</div>
        </div>
        <div class="save-actions">
          <button class="mini-btn" data-load="${esc(s.id)}">读取</button>
          <button class="mini-btn danger" data-del="${esc(s.id)}">删除</button>
        </div>
      </div>`).join('')}</div>`;
  }
  const m = openModal('选择存档', body);
  m.addEventListener('click', (e) => {
    const l = e.target.closest('[data-load]');
    const d = e.target.closest('[data-del]');
    if (l) { closeModal(); onLoad(saves.find((x) => x.id === l.dataset.load)); }
    if (d) { onDelete(d.dataset.del); }
  });
}

/* ---------------- 导入剧本 ---------------- */
export function openImport({ onImported, onPackage }) {
  const body = `
    <div class="drop-zone" id="dz">
      <span class="di">✦</span>
      <div class="dt">拖入剧本文件，或点击选择</div>
      <div class="dh">支持 .txt / .md / .json / .docx / .zip，或暮幕作品包 .mumu<br/>
        字数 ${LIMITS.minChars}–${LIMITS.maxChars.toLocaleString()} 字 · 文本剧本不超过 5MB · 作品包不超过 32MB</div>
      <input id="file-in" type="file" accept=".txt,.md,.json,.docx,.zip,.mumu" hidden />
    </div>
    <div id="import-msg" class="dh" style="margin-top:14px;min-height:20px;font-size:13px"></div>
    <div class="format-box">
      <h4>剧本基本格式</h4>
      <ul>
        <li>开头可写 <b>标题：</b> <b>简介：</b>，并用“角色：”声明人物：<b>名字 | 性别 | 发型 | 衣色 | 模型</b></li>
        <li>模型可写：<b>画师少年 / 调色少女 / 小厮男童 / 侍女女童 / 官袍长者 / 凤袍太后 / 少年 / 少女 / 男儿童 / 女儿童 / 中年男人 / 中年女人</b>；省略时按性别回落到少年 / 少女</li>
        <li><b>【场景：丹青阁 | 夜晚 | 中景】</b> 切换分镜。场景：宫苑 / 丹青阁 / 公司 / 教室 / 操场 / 古建筑；时间：黄昏 / 白天 / 夜晚 / 火夜；镜头：远景 / 中景 / 近景 / 特写</li>
        <li>纯环境描写的段落不写台词，画面就只留场景；<b>【清场】</b> 可随时让所有人物退场</li>
        <li><b>名字：台词</b> 为对白，没有名字的行视为旁白；<b>名字（开心）：台词</b> 可让这一句带上身体语言</li>
        <li><b>名字（录音）：台词</b> 表示画外音，只显示名字，不让人物出场</li>
        <li>舞台指示：<b>【姿态：难过】</b> <b>【动作：坐下】</b> <b>【视角：过肩】</b>，可写 <b>【姿态：林夏|难过】</b> 只作用于某人</li>
        <li><b>&gt; 选项文字 -&gt; 标签</b> 产生分支，<b>[标签]</b> 定义落点，<b>-&gt; 标签</b> 跳转</li>
        <li><b>【结束】</b> 收尾。压缩包内读取第一份文档</li>
      </ul>
      <pre id="ex">${esc(FORMAT_EXAMPLE)}</pre>
      <button class="copy-ex" id="copy-ex">复制示例</button>
    </div>`;
  const m = openModal('导入剧本', body, true);
  const dz = m.querySelector('#dz');
  const inp = m.querySelector('#file-in');
  const msg = m.querySelector('#import-msg');

  const handle = async (file) => {
    if (!file) return;
    const name = file.name || '';
    const ext = (name.split('.').pop() || '').toLowerCase();
    msg.style.color = 'rgba(255,244,230,0.7)';
    msg.textContent = '正在解析…';
    try {
      if (ext === 'mumu') {
        if (!onPackage) {
          const e = new Error('当前入口不支持作品包导入。');
          e.userFacing = true;
          throw e;
        }
        await onPackage(file);
        closeModal();
      } else {
        const sc = await readFileToScript(file);
        onImported(sc);
        closeModal();
      }
    } catch (e) {
      msg.style.color = '#ff9a8a';
      msg.textContent = e.userFacing ? e.message : '解析失败：' + (e.message || '未知错误');
    }
  };
  dz.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => handle(inp.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => handle(e.dataTransfer.files[0]));
  m.querySelector('#copy-ex').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(FORMAT_EXAMPLE); msg.style.color = '#cdebc9'; msg.textContent = '示例已复制，可粘贴到 .txt 中修改。'; }
    catch (e) { msg.textContent = '复制失败，请手动选中示例文字。'; }
  });
}

/* ---------------- 玩法说明 ---------------- */
export function openHow() {
  openModal('玩法与格式', `
    <div class="how-body">
      <h4>怎么玩</h4>
      <p>选择内置剧本，或导入你自己的剧本。点击画面下方对话框推进剧情，遇到选项时选择你的走向。</p>
      <p>一章结束时可以直接「继续下一章」，也可以「换一个剧本」回到曲目选择。</p>
      <p>剧情中的场景切换、远景 / 中景 / 近景 / 特写，就是这部小戏的“分镜”。</p>
      <h4>人物与场景</h4>
      <p>人物以半身剪影立绘演出：画师少年、调色少女、小厮男童、侍女女童、官袍长者、凤袍太后，以及《漩涡与深蓝》的八位人物（卢卡斯、克莱尔、玛格丽特、亨利、朱利安、索菲娅、艾蒂安、埃莱娜），还有《月光下的未完奏鸣》的七位人物（林深、苏晚、顾言、夏晴、陈默、周慕白、叶知秋），以及少年 / 少女 / 儿童 / 中年人等通用模型。剧本在角色第五列写明模型，同一角色每次游玩外观不变；没有写明时只按性别回落到少年 / 少女，不根据姓名猜测。</p>
      <p>只有对白或舞台指示会让人物出场。纯环境描写的段落不写台词，画面就只展示场景，让人静静看一会儿黄昏。</p>
      <p>写作时可用 <b>【姿态】</b> <b>【动作】</b> <b>【视角】</b> 指挥走位，用 <b>【清场】</b> 让人物退场；<b>【镜头：特写】</b> 会画出台词里提到的物件（长卷、令牌、紫檀木盒、颜料研钵、磁带、耳机、纸质文件、《星月夜》、放大镜、档案袋、账册、星图、手机、画布碎片、咖啡、手抄乐谱、小提琴、钢琴键盘、橘子汽水、素圈戒指等），同一段特写里道具会延续到下一句。<b>名字（录音）：台词</b> 只出声，不出人。</p>
      <h4>存档</h4>
      <p>游玩中点击右上角“保存进度”即可存档；首页“选择存档”可随时读取或删除。存档保存在你的浏览器本地。</p>
      <h4>音乐</h4>
      <p>首页与游玩时会播放内置轻音乐，右上角的 ♪ 可随时静音。</p>
      <h4>剧本限制</h4>
      <p>字数 ${LIMITS.minChars}–${LIMITS.maxChars.toLocaleString()} 字；格式详见“导入剧本”窗口内的说明与示例。</p>
    </div>`);
}
