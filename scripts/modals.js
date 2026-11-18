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
export function openLibrary({ scripts, onPlay, onDelete }) {
  const cards = scripts.map((s) => `
    <div class="script-card" data-id="${esc(s.id)}" tabindex="0">
      ${s.builtin ? '' : '<span class="badge-custom">已导入</span>'}
      <div class="script-thumb" style="background:${THUMB[s.cover.scene] || THUMB.classroom}"></div>
      <div class="script-body">
        <div class="script-name">${esc(s.title)}</div>
        <span class="script-tag">${esc(s.tag || SCENES[s.cover.scene]?.label || '剧本')}</span>
        <div class="script-brief">${esc(s.summary)}</div>
        ${s.builtin ? '' : `<div class="script-actions"><button class="mini-btn danger" data-del="${esc(s.id)}">移除</button></div>`}
      </div>
    </div>`).join('');
  const m = openModal('选择剧本', `<div class="script-grid">${cards}</div>`, true);
  m.querySelectorAll('.script-card').forEach((el) => {
    const go = () => { const sc = scripts.find((x) => x.id === el.dataset.id); closeModal(); onPlay(sc); };
    el.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { e.stopPropagation(); onDelete(del.dataset.del); return; }
      go();
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) go(); });
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
export function openImport({ onImported }) {
  const body = `
    <div class="drop-zone" id="dz">
      <span class="di">✦</span>
      <div class="dt">拖入剧本文件，或点击选择</div>
      <div class="dh">支持 .txt / .md / .json / .docx，或打包为 .zip<br/>
        字数 ${LIMITS.minChars}–${LIMITS.maxChars.toLocaleString()} 字 · 文件不超过 5MB</div>
      <input id="file-in" type="file" accept=".txt,.md,.json,.docx,.zip" hidden />
    </div>
    <div id="import-msg" class="dh" style="margin-top:14px;min-height:20px;font-size:13px"></div>
    <div class="format-box">
      <h4>剧本基本格式</h4>
      <ul>
        <li>开头可写 <b>标题：</b> <b>简介：</b>，并用“角色：”声明人物（名字 | 性别 | 发型 | 衣服颜色）</li>
        <li><b>【场景：教室 | 黄昏 | 中景】</b> 切换分镜。场景：公司 / 教室 / 操场 / 古建筑；时间：黄昏 / 白天 / 夜晚；镜头：远景 / 中景 / 近景 / 特写（特写渲染手部与道具）</li>
        <li><b>名字：台词</b> 为对白，没有名字的行视为旁白；<b>名字（开心）：台词</b> 可让这一句带上身体语言</li>
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
    msg.style.color = 'rgba(255,244,230,0.7)';
    msg.textContent = '正在解析…';
    try {
      const sc = await readFileToScript(file);
      onImported(sc);
      closeModal();
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
      <p>剧情中的场景切换、远景 / 中景 / 特写，就是这部小戏的“分镜”。</p>
      <h4>人物剪影</h4>
      <p>角色以极简氛围剪影演出：没有五官与花哨服饰，情绪由姿态、动作与镜头表达。外观由剧本稳定分配，同一角色每次游玩保持一致；只有剧本里明确写下的性别、发型线索会被采纳。</p>
      <p>写作时可用 <b>【姿态】</b> <b>【动作】</b> <b>【视角】</b> 与 <b>名字（情绪）：台词</b> 指挥身体语言；<b>【镜头：特写】</b> 会渲染手部与台词中提到的道具（水杯、信、手机等）。</p>
      <h4>存档</h4>
      <p>游玩中点击右上角“保存进度”即可存档；首页“选择存档”可随时读取或删除。存档保存在你的浏览器本地。</p>
      <h4>音乐</h4>
      <p>首页与游玩时会播放内置轻音乐，右上角的 ♪ 可随时静音。</p>
      <h4>剧本限制</h4>
      <p>字数 ${LIMITS.minChars}–${LIMITS.maxChars.toLocaleString()} 字；格式详见“导入剧本”窗口内的说明与示例。</p>
    </div>`);
}
