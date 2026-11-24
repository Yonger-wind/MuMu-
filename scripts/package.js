/* ============================================================
   暮幕 · 作品包（.mumu）
   包 = ZIP 容器：manifest.json + 剧本文本 + 可选资源
   本模块不依赖 DOM（downloadPackage 除外），可在 Node 单测中运行
   ============================================================ */

import { countChars } from './parser.js';
import { writeZip } from './zip.js';
import { serializeScript } from './serialize.js';

export const PACKAGE_FORMAT = 'mumu-package';
export const FORMAT_VERSION = 1;
export const SCHEMA_VERSION = 2;
export const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

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
/** 规范化单条 works（迁移与回填共用）：缺省 id / tag / chapterNo / format / chars */
function normalizeWork(w, i) {
  const src = w && typeof w === 'object' ? w : {};
  const chapterNo = Number.isInteger(src.chapterNo) && src.chapterNo > 0 ? src.chapterNo : i + 1;
  return {
    id: src.id || `chapter_${i + 1}`,
    title: src.title || '',
    tag: src.tag || src.title || '',
    chapterNo,
    file: src.file || 'script.txt',
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
    assets.push(...m.assets);
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
    kind: works.length > 1 ? 'series' : 'work',
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
    if (typeof w.chapterNo !== 'number') w.chapterNo = i + 1;
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
