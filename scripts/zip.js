/* ============================================================
   暮幕 · 最小 ZIP 读写（零依赖）
   读：中央目录 + stored / deflate-raw；写：local header + central directory + EOCD
   依赖浏览器与 Node 内置的 CompressionStream / DecompressionStream
   ============================================================ */

export function zipFail(msg) {
  const e = new Error(msg);
  e.userFacing = true;
  return e;
}

/**
 * 解压后体积超限的错误。
 * 额外挂 `unpackedLimit = true`，供上层区分「超限」与「结构损坏」：
 * 上层要把超限收敛成自己的文案，结构损坏则收敛成「不是有效的作品包」。
 */
function unpackLimitFail() {
  const e = zipFail('压缩包解压后的内容超过 64MB，请缩减内容后再导入。');
  e.unpackedLimit = true;
  return e;
}

/* ---------- CRC-32 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- 读 ---------- */
export async function unzipEntries(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw zipFail('无法识别该压缩包，请确认它是标准 .zip 文件。');
  const dec = new TextDecoder('utf-8');
  const entries = [];
  let count, p;
  try {
    count = dv.getUint16(eocd + 10, true);
    p = dv.getUint32(eocd + 16, true);
  } catch (err) {
    throw zipFail('压缩包结构已损坏，请重新导出后再试。');
  }
  for (let i = 0; i < count; i++) {
    try {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const flag = dv.getUint16(p + 8, true);
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const usize = dv.getUint32(p + 24, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const cmtLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      entries.push({ name, method, csize, usize, localOff, flag });
      p += 46 + nameLen + extraLen + cmtLen;
    } catch (err) {
      if (err && err.userFacing) throw err;
      throw zipFail('压缩包结构已损坏，请重新导出后再试。');
    }
  }
  return { entries, dv, u8 };
}

/**
 * 解出单条条目。
 * budget（可选）：{ limit, used }
 *   - limit：解压后累计字节上限（省略 = 不限）
 *   - used ：跨条目累计计数，就地累加
 * 超限时**立刻中断解压**并抛出带 userFacing 的错误（不会把整包先解压进内存）。
 */
export async function extractEntry({ dv, u8 }, e, budget) {
  const limit = budget && Number.isFinite(budget.limit) ? budget.limit : null;
  const used = () => (budget && Number.isFinite(budget.used) ? budget.used : 0);
  const addUsed = (n) => { if (budget) budget.used = used() + n; };
  const p = e.localOff;
  const nameLen = dv.getUint16(p + 26, true);
  const extraLen = dv.getUint16(p + 28, true);
  const start = p + 30 + nameLen + extraLen;
  const data = u8.subarray(start, start + e.csize);
  if (e.method === 0) {
    // stored：条目的实际长度就是解压后长度，返回前先比对上限
    if (limit != null && used() + data.length > limit) throw unpackLimitFail();
    addUsed(data.length);
    return data;
  }
  if (e.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw zipFail('当前浏览器不支持解压 zip，请升级到较新的浏览器，或直接导入 .txt 文件。');
    }
    let ds;
    try {
      ds = new DecompressionStream('deflate-raw');
    } catch (err) {
      // 老浏览器（如旧版 Safari）认识 DecompressionStream 但不支持 'deflate-raw'，构造时抛 TypeError
      throw zipFail('当前浏览器不支持解压 zip，请升级到较新的浏览器，或直接导入 .txt 文件。');
    }
    try {
      const stream = new Blob([data]).stream().pipeThrough(ds);
      const reader = stream.getReader();
      const chunks = [];
      let total = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value || !value.length) continue;
        total += value.length;
        addUsed(value.length);
        // 边读边计数：超限就中断解压，不让整包先落进内存
        if (limit != null && used() > limit) {
          try { await reader.cancel(); } catch (err) { /* 取消失败不影响报错 */ }
          throw unpackLimitFail();
        }
        chunks.push(value);
      }
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { out.set(c, off); off += c.length; }
      return out;
    } catch (err) {
      if (err && err.userFacing) throw err;
      throw zipFail('压缩包内容已损坏，请重新导出后再试。');
    }
  }
  throw zipFail('压缩包使用了不支持的压缩方式。');
}

/**
 * 读出全部条目：Map<条目名, 字节>
 * opts.maxUnpackedBytes（可选）：解压后总量上限。
 *   - 快速拒绝：先按中央目录声明的未压缩大小求和，超限直接抛错，不解压
 *     （声明值可被伪造，所以这只是快速筛）
 *   - 硬保证：解压过程中累计实际产出字节，超限立刻中断并抛错
 */
export async function readZipEntries(buf, opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const limit = Number.isFinite(o.maxUnpackedBytes) && o.maxUnpackedBytes > 0
    ? o.maxUnpackedBytes
    : null;
  const z = await unzipEntries(buf);
  if (limit != null) {
    let declared = 0;
    for (const e of z.entries) declared += (Number(e.usize) || 0);
    if (declared > limit) throw unpackLimitFail();
  }
  const budget = { limit, used: 0 };
  const out = new Map();
  for (const e of z.entries) {
    if (e.name.endsWith('/')) continue;
    out.set(e.name, await extractEntry(z, e, budget));
  }
  return out;
}

/* ---------- 写 ---------- */
function dosStamp(d = new Date()) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) {
    return null;
  }
}

/**
 * 写出 ZIP 字节。
 * files: [{ name, data }]，data 可以是 Uint8Array 或字符串。
 * 压缩优先 deflate-raw；压不小则退回 stored。
 */
export async function writeZip(files) {
  const enc = new TextEncoder();
  const { time, date } = dosStamp();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(raw);
    let method = 0;
    let body = raw;
    const packed = await deflateRaw(raw);
    if (packed && packed.length < raw.length) { method = 8; body = packed; }

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);       // UTF-8 文件名
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    parts.push(local, body);
    central.push(cd);
    offset += local.length + body.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, eocd];
  const total = all.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of all) { out.set(part, p); p += part.length; }
  return out;
}
