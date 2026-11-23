/* ============================================================
   暮幕 · 作品包（.mumu）
   包 = ZIP 容器：manifest.json + 剧本文本 + 可选资源
   本模块不依赖 DOM（封面缩放除外，失败时降级），可在 Node 单测中运行
   ============================================================ */

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

export function makeManifest(opts) {
  const kind = opts.kind === 'series' ? 'series' : 'work';
  const works = (opts.works || []).map((w, i) => ({
    id: w.id,
    title: w.title || '',
    tag: w.tag || '',
    chapterNo: w.chapterNo || 0,
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
    license: { ...DEFAULT_LICENSE, ...(opts.license || {}) },
    engine: { minVersion: 1 },
    works,
    assets: opts.assets || [],
    createdAt: opts.createdAt || new Date().toISOString(),
    generator: '暮幕 MuMU',
  };
}

/* ---------- schema 迁移 ---------- */
function migrateV1toV2(m) {
  const chapters = Array.isArray(m.chapters) ? m.chapters : [];
  const works = chapters.map((c, i) => ({
    id: c.id || `chapter_${i + 1}`,
    title: c.title || '',
    tag: c.tag || c.title || '',
    chapterNo: c.chapterNo || i + 1,
    file: c.file || 'script.txt',
    format: 'text',
    chars: c.chars || 0,
  }));
  const assets = [];
  const src = m.assets && typeof m.assets === 'object' && !Array.isArray(m.assets) ? m.assets : {};
  for (const [key, file] of Object.entries(src)) {
    assets.push({ id: key, role: key === 'cover' ? 'cover' : key, file, type: '', bytes: 0 });
  }
  return {
    ...m,
    schemaVersion: 2,
    kind: works.length > 1 ? 'series' : 'work',
    summary: m.summary || '',
    author: m.author || '',
    series: m.series || null,
    license: { ...DEFAULT_LICENSE, ...(m.license || {}) },
    engine: m.engine || { minVersion: 1 },
    works,
    assets,
  };
}

export const MIGRATIONS = {
  1: migrateV1toV2,
};

/** 循环迁移直到 schemaVersion 收敛；未知版本号原样返回（交给 validateManifest 拒绝） */
export function migrateManifest(manifest) {
  let m = manifest;
  let guard = 0;
  while (m && typeof m.schemaVersion === 'number' && m.schemaVersion < SCHEMA_VERSION && guard < 10) {
    const fn = MIGRATIONS[m.schemaVersion];
    if (!fn) break;
    m = fn(m);
    guard += 1;
  }
  return m;
}

/* ---------- 校验 ---------- */
export function validateManifest(input) {
  const m = migrateManifest(input);
  if (!m || typeof m !== 'object') throw pkgFail('作品包清单无法解析，可能已损坏。');
  if (m.format !== PACKAGE_FORMAT) throw pkgFail('这不是暮幕作品包。');
  if (typeof m.formatVersion === 'number' && m.formatVersion > FORMAT_VERSION) {
    throw pkgFail(`包格式版本 v${m.formatVersion} 高于当前暮幕支持的 v${FORMAT_VERSION}，请升级暮幕。`);
  }
  if (typeof m.schemaVersion === 'number' && m.schemaVersion > SCHEMA_VERSION) {
    throw pkgFail(`包内容版本 v${m.schemaVersion} 高于当前暮幕支持的 v${SCHEMA_VERSION}，请升级暮幕后再打开。`);
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
  if (!m.license) m.license = { ...DEFAULT_LICENSE };
  if (!m.engine) m.engine = { minVersion: 1 };
  if (m.series === undefined) m.series = null;
  if (!m.summary) m.summary = '';
  if (!m.author) m.author = '';
  if (!m.kind) m.kind = m.works.length > 1 ? 'series' : 'work';
  return m;
}
