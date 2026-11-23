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
