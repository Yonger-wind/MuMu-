/* ============================================================
   暮幕 · 作品包（.mumu）
   包 = ZIP 容器：manifest.json + 剧本文本 + 可选资源
   本模块不依赖 DOM（downloadPackage 除外），可在 Node 单测中运行
   ============================================================ */

import { countChars, parseScriptText, LIMITS } from './parser.js';
import { writeZip, readZipEntries } from './zip.js';
import { serializeScript } from './serialize.js';

export const PACKAGE_FORMAT = 'mumu-package';
export const FORMAT_VERSION = 1;
export const SCHEMA_VERSION = 2;
export const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;
/** 包内全部条目解压后的总字节上限（zip bomb 防护） */
export const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;

export function pkgFail(msg) {
  const e = new Error(msg);
  e.userFacing = true;
  return e;
}

/* ---------- manifest 构造 ---------- */
const DEFAULT_LICENSE = { type: '未指定', holder: '未署名', allowRemix: true };

/** 逐字段合并许可证：type / holder 缺失时分别按「未指定」「未署名」兜底（spec §3.2） */
function mergeLicense(input) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = { ...DEFAULT_LICENSE, ...src };
  if (typeof out.type !== 'string' || !out.type) out.type = DEFAULT_LICENSE.type;
  if (typeof out.holder !== 'string' || !out.holder) out.holder = DEFAULT_LICENSE.holder;
  if (typeof out.allowRemix !== 'boolean') out.allowRemix = DEFAULT_LICENSE.allowRemix;
  return out;
}

/** 按扩展名推断资源 MIME（spec §3.3）；无法识别时返回空串 */
function inferAssetType(file) {
  const name = String(file || '');
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return '';
}

export function makeManifest(opts) {
  const kind = opts.kind === 'series' ? 'series' : 'work';
  const works = (opts.works || []).map((w, i) => ({
    id: w.id || `chapter_${i + 1}`,
    title: w.title || '',
    tag: w.tag || '',
    chapterNo: Number.isInteger(w.chapterNo) ? w.chapterNo : i + 1,
    file: w.file || (kind === 'series' ? `chapters/${String(i + 1).padStart(2, '0')}.txt` : 'script.txt'),
    format: 'text',
    chars: w.chars || 0,
  }));
  return {
    format: PACKAGE_FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    kind,
    id: opts.id || '',
    title: opts.title || '',
    summary: opts.summary || '',
    author: opts.author || '',
    series: opts.series || null,
    license: mergeLicense(opts.license),
    engine: { minVersion: 1 },
    works,
    assets: opts.assets || [],
    createdAt: opts.createdAt || new Date().toISOString(),
    generator: '暮幕 MuMU',
  };
}

/* ---------- schema 迁移 ---------- */
/**
 * 章序归一（**唯一入口**：迁移与校验共用同一处判定）。
 * - 接受可转成整数的数字字符串：'10' → 10（与导出侧 Number() 语义一致，
 *   免得包作者写的章序被静默改写成 1）
 * - 其余情况（undefined / 'oops' / NaN / 非正数）退回下标 +1
 * 输出一定是 number。
 */
function normalizeChapterNo(value, i) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : i + 1;
}

/** 规范化单条 works（迁移与回填共用）：缺省 id / tag / chapterNo / format / chars
 *  注意：**不**兜 `file`。迁移路径补默认文件名会让「作品包缺少第 N 章的剧本文件。」
 *  这条导入期检查永远不可达；缺 file 就让它缺着，由 validateManifest 拦下。 */
function normalizeWork(w, i) {
  const src = w && typeof w === 'object' ? w : {};
  return {
    id: src.id || `chapter_${i + 1}`,
    title: src.title || '',
    tag: src.tag || src.title || '',
    chapterNo: normalizeChapterNo(src.chapterNo, i),
    file: src.file || '',
    format: src.format || 'text',
    chars: typeof src.chars === 'number' ? src.chars : 0,
  };
}

function migrateV1toV2(m) {
  // 无 chapters 但已有 works（v2 形状漏写 schemaVersion）时保留并规范化 works
  const hasChapters = Array.isArray(m.chapters) && m.chapters.length > 0;
  const works = hasChapters
    ? m.chapters.map(normalizeWork)
    : (Array.isArray(m.works) ? m.works.map(normalizeWork) : []);
  const assets = [];
  if (Array.isArray(m.assets)) {
    // 数组形态：逐条补 id / role / type（按扩展名推断）/ bytes（spec §3.3）
    for (const a of m.assets) {
      const src = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
      const file = src.file || '';
      assets.push({
        ...src,
        id: src.id || src.role || 'asset',
        role: src.role || src.id || 'asset',
        file,
        type: src.type || inferAssetType(file),
        bytes: typeof src.bytes === 'number' ? src.bytes : 0,
      });
    }
  } else {
    const src = m.assets && typeof m.assets === 'object' ? m.assets : {};
    for (const [key, file] of Object.entries(src)) {
      assets.push({
        id: key,
        role: key === 'cover' ? 'cover' : key,
        file,
        type: inferAssetType(file),
        bytes: 0,
      });
    }
  }
  return {
    ...m,
    schemaVersion: SCHEMA_VERSION,
    // 显式给了 kind 就尊重；没给才按作品数推导。
    // 无条件重算会把「v2 形状但漏写 schemaVersion、显式 kind=series 且只有 1 个作品」
    // 的包静默降级成 work，导入端就会按独立卡片落库而不是曲目卡。
    kind: m.kind || (works.length > 1 ? 'series' : 'work'),
    summary: m.summary || '',
    author: m.author || '',
    series: m.series || null,
    license: mergeLicense(m.license),
    engine: m.engine || { minVersion: 1 },
    works,
    assets,
  };
}

export const MIGRATIONS = {
  1: migrateV1toV2,
};

/** 循环迁移直到 schemaVersion 收敛；未知版本号原样返回（交给 validateManifest 拒绝）
 *  缺少 schemaVersion 时按 v1 处理，便于迁移老形状的包 */
export function migrateManifest(manifest) {
  let m = manifest;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return m;
  let guard = 0;
  while (guard < 10) {
    const sv = m.schemaVersion === undefined || m.schemaVersion === null ? 1 : m.schemaVersion;
    if (typeof sv !== 'number' || !Number.isInteger(sv) || sv >= SCHEMA_VERSION) break;
    const fn = MIGRATIONS[sv];
    if (!fn) break;
    m = fn(m);
    guard += 1;
  }
  return m;
}

/* ---------- 校验 ---------- */
export function validateManifest(input) {
  const m = migrateManifest(input);
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw pkgFail('作品包清单无法解析，可能已损坏。');
  if (m.format !== PACKAGE_FORMAT) throw pkgFail('这不是暮幕作品包。');
  if (m.formatVersion === undefined || m.formatVersion === null) {
    m.formatVersion = FORMAT_VERSION;
  } else {
    if (!Number.isInteger(m.formatVersion) || m.formatVersion <= 0) {
      throw pkgFail(`包格式版本 v${m.formatVersion} 不是有效的版本号，请检查作品包是否损坏。`);
    }
    if (m.formatVersion > FORMAT_VERSION) {
      throw pkgFail(`包格式版本 v${m.formatVersion} 高于当前暮幕支持的 v${FORMAT_VERSION}，请升级暮幕。`);
    }
  }
  if (m.schemaVersion !== undefined && m.schemaVersion !== null) {
    if (!Number.isInteger(m.schemaVersion) || m.schemaVersion <= 0) {
      throw pkgFail(`包内容版本 v${m.schemaVersion} 不是有效的版本号，请检查作品包是否损坏。`);
    }
    if (m.schemaVersion > SCHEMA_VERSION) {
      throw pkgFail(`包内容版本 v${m.schemaVersion} 高于当前暮幕支持的 v${SCHEMA_VERSION}，请升级暮幕后再打开。`);
    }
  }
  if (!Array.isArray(m.works) || !m.works.length) throw pkgFail('作品包里没有作品。');
  m.works.forEach((w, i) => {
    if (!w || !w.file) throw pkgFail(`作品包缺少第 ${i + 1} 章的剧本文件。`);
    if (!w.id) w.id = `chapter_${i + 1}`;
    if (!w.title) w.title = w.id;
    if (!w.tag) w.tag = w.title;
    // 章序归一只在 normalizeChapterNo 一处做：数字字符串按数值取，
    // 非法值退回下标 +1（免得后面按 chapterNo 排序或比较时出现 '10' < '2' 这类行为）
    w.chapterNo = normalizeChapterNo(w.chapterNo, i);
    if (!w.format) w.format = 'text';
    if (typeof w.chars !== 'number') w.chars = 0;
  });
  if (!Array.isArray(m.assets)) m.assets = [];
  m.license = mergeLicense(m.license);
  if (!m.engine) m.engine = { minVersion: 1 };
  if (m.series === undefined) m.series = null;
  if (!m.summary) m.summary = '';
  if (!m.author) m.author = '';
  if (!m.kind) m.kind = m.works.length > 1 ? 'series' : 'work';
  return m;
}

/* ---------- data URL 与字节 ---------- */

/** 字节 → data URL（浏览器与 Node 均有 btoa） */
export function bytesToDataUrl(bytes, mime) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return `data:${mime || 'application/octet-stream'};base64,${btoa(bin)}`;
}

/** data URL → { bytes, mime }；不是合法 data URL 时返回 null */
export function dataUrlToBytes(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  try {
    if (m[2]) {
      const bin = atob(m[3]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes, mime };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime };
  } catch (e) {
    return null;
  }
}

/* ---------- 导出 ---------- */

/** 封面 MIME → 文件扩展名（spec：扩展名与 assets[].type 的实际 MIME 一致） */
const COVER_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Windows 保留设备名（忽略大小写，匹配时忽略扩展名部分） */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * 生成安全的下载文件名（不含扩展名）。
 * - 首尾空白裁掉；全空时用「未命名作品」兜底
 * - 结尾的点与空格去掉（Windows 不允许）
 * - 命中 Windows 保留名（忽略扩展名部分）时加下划线前缀
 */
function safeFileName(name) {
  let s = String(name || '').trim().replace(/[\\/:*?"<>|]/g, '_');
  s = s.replace(/[. ]+$/g, '').slice(0, 80).replace(/[. ]+$/g, '');
  if (!s) return '未命名作品';
  if (WINDOWS_RESERVED.test(s.split('.')[0])) s = '_' + s;
  return s;
}

/** 取作品文本：优先原文，缺失时用序列化兜底 */
function workText(work) {
  if (typeof work.source === 'string' && work.source.trim()) return work.source;
  if (work.script) return serializeScript(work.script);
  throw pkgFail('《' + (work.title || work.id || '未命名作品') + '》没有可导出的文本内容。');
}

/** 有效章节号：正整数原样保留，缺失 / 非法时退回传入序号（避免 NaN 破坏排序与文件名） */
function effectiveChapterNo(work, i) {
  const n = Number(work && work.chapterNo);
  return Number.isInteger(n) && n > 0 ? n : i + 1;
}

/** 按章节号稳定升序排列（相同章节号保持传入顺序） */
function sortByChapterNo(works) {
  return works
    .map((work, i) => ({ work, i, chapterNo: effectiveChapterNo(work, i) }))
    .sort((a, b) => (a.chapterNo - b.chapterNo) || (a.i - b.i));
}

/** 整包字节上限校验：导入侧会拒绝超过 32MB 的包，导出侧提前拦截 */
export function checkPackageSize(bytes) {
  const len = bytes && typeof bytes.length === 'number' ? bytes.length : 0;
  if (len > MAX_PACKAGE_BYTES) {
    throw pkgFail('作品包超过 32MB，请缩减内容后再导出。');
  }
  return len;
}

/**
 * 导出作品包。
 * kind: 'work'（单章）| 'series'（整本）
 * opts.works: [{ id, title, tag, chapterNo, source, script }]
 * opts.zipWriter: 可选的写包函数（单测注入用，正常路径走 writeZip）
 * 返回 { bytes, filename, warnings }（warnings 是给用户看的提示文案）
 */
export async function exportPackage(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const kind = o.kind === 'series' ? 'series' : 'work';
  const works = Array.isArray(o.works) ? o.works : [];
  if (!works.length) throw pkgFail('没有可导出的作品。');
  // 单章包只有一个 script.txt，多作品会互相覆盖
  if (kind === 'work' && works.length > 1) {
    throw pkgFail('单章导出只支持一个作品，请改为导出整本。');
  }

  const warnings = [];
  // 章节按 chapterNo 稳定升序：文件序号与 manifest.works 顺序保持一致，
  // 调用方传乱序章节也不会让包内章节错位
  const ordered = sortByChapterNo(works);
  const entries = ordered.map((d, i) => ({
    id: d.work.id,
    title: d.work.title || '',
    tag: d.work.tag || '',
    chapterNo: d.chapterNo,
    file: kind === 'series' ? `chapters/${String(i + 1).padStart(2, '0')}.txt` : 'script.txt',
    chars: countChars(workText(d.work)),
  }));

  const assets = [];
  const files = [];
  if (o.coverImage) {
    const cover = dataUrlToBytes(o.coverImage);
    const ext = cover ? COVER_EXT[String(cover.mime).toLowerCase()] : '';
    if (!ext) {
      warnings.push('封面图片格式无法识别，已跳过封面。');
    } else if (cover.bytes.length > MAX_ASSET_BYTES) {
      warnings.push('封面图片超过 4MB，已跳过封面。');
    } else {
      assets.push({
        id: 'cover', role: 'cover', file: `assets/cover.${ext}`,
        type: cover.mime, bytes: cover.bytes.length,
      });
      files.push({ name: `assets/cover.${ext}`, data: cover.bytes });
    }
  }

  const manifest = makeManifest({
    kind,
    id: o.id || entries[0].id,
    title: o.title || entries[0].title,
    summary: o.summary || '',
    author: o.author || '',
    series: o.series || null,
    license: o.license || null,
    works: entries,
    assets,
  });

  files.push({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  ordered.forEach((d, i) => {
    files.push({ name: entries[i].file, data: workText(d.work) });
  });

  const chapterList = ordered.map((d, i) => `${entries[i].chapterNo}. ${entries[i].tag || entries[i].title}`).join('\n');
  files.push({
    name: 'README.md',
    data: [
      `# ${manifest.title}`,
      '',
      manifest.summary || '',
      '',
      '## 章节',
      chapterList,
      '',
      '## 说明',
      '这是一个暮幕（MuMU）作品包，导入暮幕后可直接播放。',
      '剧本文本格式见暮幕「导入」弹窗中的格式说明。',
      '',
      `许可证：${manifest.license.type}${manifest.license.holder ? '（' + manifest.license.holder + '）' : ''}`,
      `生成工具：${manifest.generator} · 包格式 v${manifest.formatVersion} · 内容版本 v${manifest.schemaVersion}`,
    ].join('\n'),
  });
  if (manifest.license && manifest.license.type && manifest.license.type !== '未指定') {
    files.push({
      name: 'LICENSE.txt',
      data: [
        manifest.license.type,
        manifest.license.holder ? `权利人：${manifest.license.holder}` : '',
        manifest.license.allowRemix ? '允许改编（改编需保留来源署名）' : '不允许改编',
      ].filter(Boolean).join('\n'),
    });
  }

  // zipWriter 供单测注入（正常路径始终走 writeZip）
  const writer = typeof o.zipWriter === 'function' ? o.zipWriter : writeZip;
  const bytes = await writer(files);
  checkPackageSize(bytes);
  return { bytes, filename: `${safeFileName(manifest.title)}.mumu`, warnings };
}

/** 浏览器端触发下载（DOM 只出现在这个函数体内） */
export function downloadPackage(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 慢设备 / 大包时 1 秒可能还没开始下载，延后到 30 秒再释放
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* ---------- 导入 ---------- */

/** 封面缩放失败时允许直接入库的原图上限（spec §7：≤2MB） */
const MAX_COVER_FALLBACK_BYTES = 2 * 1024 * 1024;

/**
 * 把封面缩到 ≤640px 的 JPEG data URL。
 * - 有 DOM 时用 createImageBitmap + canvas 缩放（quality 0.82）
 * - 无 DOM（Node 单测）或缩放失败时：原图 ≤2MB 返回原图 data URL，否则返回 null（跳过封面）
 * DOM 相关引用只出现在这个函数体内，模块顶层不碰 document。
 */
export async function buildCoverDataUrl(bytes, mime) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  const type = mime || 'image/jpeg';
  const fallback = () => (u8.length <= MAX_COVER_FALLBACK_BYTES ? bytesToDataUrl(u8, type) : null);
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return fallback();
  try {
    const bitmap = await createImageBitmap(new Blob([u8], { type }));
    const maxSide = Math.max(bitmap.width || 0, bitmap.height || 0);
    if (!maxSide) return fallback();
    const scale = Math.min(1, 640 / maxSide);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback();
    ctx.drawImage(bitmap, 0, 0, w, h);
    const url = canvas.toDataURL('image/jpeg', 0.82);
    return url || fallback();
  } catch (e) {
    return fallback();
  }
}

/** 在 taken 集合里找一个不冲突的 id：base → base_2 → base_3 … */
function uniqueId(base, taken) {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

/** 统一成 ArrayBuffer（zip 读端要求 ArrayBuffer）；不是缓冲区时返回 null */
function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }
  return null;
}

/**
 * 导入作品包（**纯函数**：不写 localStorage、不碰 window、不弹窗）。
 *
 * opts.existing：本地已有作品 [{ id, series, builtin }]，用于判断 id / series 冲突。
 * 返回 { manifest, kind, title, seriesId, seriesTitle, works, warnings }
 *  - kind='work'   → 每章都是独立卡片，series 恒为 null
 *  - kind='series' → 整本成为一张曲目卡，works[].series = seriesId
 * 任何一步失败都抛出带 userFacing 标记的中文错误，调用方据此提示且不落库。
 */
export async function importPackage(buffer, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const existing = Array.isArray(o.existing) ? o.existing : [];
  const warnings = [];

  const size = buffer && typeof buffer.byteLength === 'number' ? buffer.byteLength : 0;
  if (size > MAX_PACKAGE_BYTES) throw pkgFail('作品包超过 32MB，无法导入。');

  const buf = toArrayBuffer(buffer);
  if (!buf) throw pkgFail('作品包数据无效，无法导入。');

  let entries;
  try {
    entries = await readZipEntries(buf);
  } catch (e) {
    throw pkgFail('这个文件不是有效的暮幕作品包（ZIP 结构无法读取）。');
  }

  // 解压后总量上限：压缩包本身不大不代表解压后不大（zip bomb）
  let unpacked = 0;
  for (const bytes of entries.values()) unpacked += bytes && bytes.length ? bytes.length : 0;
  if (unpacked > MAX_UNPACKED_BYTES) {
    throw pkgFail('作品包解压后的内容超过 64MB，请缩减内容后再导入。');
  }

  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) throw pkgFail('作品包缺少 manifest.json。');
  let rawManifest;
  try {
    rawManifest = JSON.parse(new TextDecoder('utf-8').decode(manifestBytes));
  } catch (e) {
    throw pkgFail('作品包清单无法解析，可能已损坏。');
  }

  // 校验与迁移（spec §3.2 / §3.3）：错误都是中文 userFacing
  const manifest = validateManifest(rawManifest);

  // 本地已有的 id / 曲目 id
  const localIds = new Set();
  const builtinIds = new Set();
  const takenSeries = new Set();
  const localById = new Map();   // 本地 id → { series, builtin }
  for (const s of existing) {
    if (!s || typeof s !== 'object') continue;
    if (typeof s.id === 'string' && s.id) {
      localIds.add(s.id);
      if (s.builtin) builtinIds.add(s.id);
      localById.set(s.id, { series: s.series, builtin: !!s.builtin });
    }
    if (typeof s.series === 'string' && s.series) takenSeries.add(s.series);
  }

  /** 曲目归属桶：undefined / null / '' 视为同一个「无曲目」桶 */
  const seriesBucket = (v) => (typeof v === 'string' && v) ? v : null;

  /** 原始曲目 id 是否已被本地占用（含章节 id 形如 <曲目id>_<序号> 的情况） */
  const seriesOccupied = (sid) => {
    if (!sid) return false;
    if (takenSeries.has(sid)) return true;
    for (const id of localIds) {
      if (id === sid || id.startsWith(`${sid}_`)) return true;
    }
    return false;
  };

  // 曲目 id 冲突处理（顺序见 brief B1）：
  // 1. 先判「是否同一曲目的更新」：包内每个 work 的 id 都能在本地找到同 id 的作品，
  //    且这些本地作品属于同一个曲目、该曲目就是包声明的原始曲目 id
  //    （或其 user: 变体）→ 视为更新，曲目 id 与章节 id 都保持原值。
  // 2. 否则原始曲目 id 已被本地占用 → 加 user: 前缀（已是 user: 前缀则视为同曲目）。
  let seriesId = null;
  let seriesTitle = '';
  if (manifest.kind === 'series') {
    const pkgSeries = manifest.series && typeof manifest.series === 'object' ? manifest.series : null;
    const rawSeriesId = String((pkgSeries && pkgSeries.id) || manifest.id || '');
    seriesTitle = String((pkgSeries && pkgSeries.title) || manifest.title || '');

    let localSeries = null;
    let sameSeries = manifest.works.length > 0;
    if (sameSeries) {
      for (const w of manifest.works) {
        const loc = localById.get(w.id);
        if (!loc || loc.builtin) { sameSeries = false; break; }
        const bucket = seriesBucket(loc.series);
        if (!bucket) { sameSeries = false; break; }
        if (localSeries === null) localSeries = bucket;
        else if (localSeries !== bucket) { sameSeries = false; break; }
      }
    }
    const isUpdate = sameSeries && localSeries !== null && (
      localSeries === rawSeriesId
      || localSeries === `user:${rawSeriesId}`
      || localSeries.startsWith(`user:${rawSeriesId}_`)
    );

    if (isUpdate) {
      seriesId = localSeries;                        // 同一曲目的更新：保持已有 id
    } else if (!rawSeriesId || rawSeriesId.startsWith('user:')) {
      seriesId = rawSeriesId;                        // 已是 user: 前缀 → 视为同曲目
    } else if (seriesOccupied(rawSeriesId)) {
      let next = `user:${rawSeriesId}`;              // 冲突：加 user: 前缀另存
      let i = 2;
      while (takenSeries.has(next)) { next = `user:${rawSeriesId}_${i}`; i += 1; }
      seriesId = next;
    } else {
      seriesId = rawSeriesId;
    }
  }

  // 封面：整个包一份，落在包内 role==='cover' 或 id==='cover' 的条目上
  let coverImage = null;
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const coverAsset = assets.find((a) => a && (a.role === 'cover' || a.id === 'cover'));
  if (coverAsset) {
    if (!coverAsset.file) {
      warnings.push('作品包内没有封面文件，已跳过封面。');
    } else {
      const coverBytes = entries.get(coverAsset.file);
      if (!coverBytes) {
        warnings.push('作品包内没有封面文件，已跳过封面。');
      } else if (coverBytes.length > MAX_ASSET_BYTES) {
        warnings.push('封面图片超过 4MB，已跳过封面。');
      } else {
        const mime = coverAsset.type || inferAssetType(coverAsset.file) || 'image/jpeg';
        coverImage = await buildCoverDataUrl(coverBytes, mime);
        if (!coverImage) warnings.push('封面图片处理失败，已跳过封面。');
      }
    }
  } else if (assets.some((a) => a && typeof a === 'object' && (
    (typeof a.id === 'string' && a.id.toLowerCase().includes('cover'))
    || (typeof a.role === 'string' && a.role.toLowerCase().includes('cover'))
  ))) {
    // 看起来是封面、却无法识别的条目：记一条警告，不静默跳过
    warnings.push('作品包内的封面条目无法识别，已跳过封面。');
  }

  const works = [];
  const usedIds = new Set(); // 本次导入已用掉的 id（包内重名时用来避让）
  const targetSeries = manifest.kind === 'series' ? seriesId : null;
  for (let i = 0; i < manifest.works.length; i++) {
    const w = manifest.works[i];
    const file = typeof w.file === 'string' ? w.file : '';
    if (!file) throw pkgFail(`作品包缺少第 ${i + 1} 章的剧本文件。`);
    const bytes = entries.get(file);
    if (!bytes) throw pkgFail(`作品包缺少第 ${i + 1} 章的剧本文件（${file}）。`);
    // 单章文本上限：复用解析器的 5MB 限制，防止超大文本拖垮浏览器
    if (bytes.length > LIMITS.maxFileBytes) {
      throw pkgFail(`第 ${i + 1} 章的剧本文件超过 5MB，请拆分后再导入。`);
    }

    const text = new TextDecoder('utf-8').decode(bytes);
    let script;
    try {
      script = parseScriptText(text, w.title || w.id || '');
    } catch (e) {
      throw pkgFail(`第 ${i + 1} 章《${w.title || w.id}》解析失败：${e.message}`);
    }

    // id 冲突处理（按顺序）：
    // - 包内 id 重复 → 加后缀，避免同一批作品互相覆盖
    // - 与内置作品同名（或以 builtin_ 开头）→ 加 user: 前缀另存
    // - 本地已有同 id 作品：
    //   · 归属同一曲目（undefined / null 同属「无曲目」桶）→ 视为更新，id 不变
    //   · 归属别的曲目 → 不得覆盖，改名为 user:<id>
    const taken = new Set([...localIds, ...usedIds]);
    let id = typeof w.id === 'string' && w.id ? w.id : `chapter_${i + 1}`;
    if (usedIds.has(id)) {
      id = uniqueId(id, taken);
    } else if (builtinIds.has(id) || id.startsWith('builtin_')) {
      id = uniqueId(`user:${id}`, taken);
    } else {
      const loc = localById.get(id);
      if (loc && seriesBucket(loc.series) !== seriesBucket(targetSeries)) {
        id = uniqueId(`user:${id}`, taken);
      }
    }
    usedIds.add(id);

    works.push({
      id,
      title: script.title || w.title || id,
      // 包级摘要优先于剧本内的简介：解析器对缺「简介」的剧本会兜底出一句摘要，
      // 不然包级 manifest.summary 永远用不上
      summary: manifest.summary || script.summary || '',
      author: script.author || manifest.author || '',
      characters: script.characters,
      nodes: script.nodes,
      labels: script.labels,
      cover: script.cover,
      tag: w.tag || w.title || '',
      chapterNo: w.chapterNo,   // 已在 validateManifest 归一（number）
      series: manifest.kind === 'series' ? seriesId : null,
      seriesTitle: manifest.kind === 'series' ? seriesTitle : '',
      source: text,
      coverImage,
      manifest: {
        format: manifest.format,
        formatVersion: manifest.formatVersion,
        schemaVersion: manifest.schemaVersion,
        kind: manifest.kind,
        license: manifest.license,
        engine: manifest.engine,
        series: manifest.series,
        packageId: manifest.id,
        packageTitle: manifest.title,
        works: (manifest.works || []).map((x) => ({
          id: x.id, title: x.title, tag: x.tag,
          chapterNo: x.chapterNo, file: x.file, format: x.format, chars: x.chars,
        })),
      },
      builtin: false,
    });
  }

  return {
    manifest,
    kind: manifest.kind,
    title: manifest.title || (works[0] && works[0].title) || '未命名作品',
    seriesId,
    seriesTitle,
    works,
    warnings,
  };
}
