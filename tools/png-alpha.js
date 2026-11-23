/* ============================================================
   暮幕 · 离线素材工具（不参与游戏运行，无第三方依赖）
   把“白底黑剪影”人物模型转换为透明底 PNG，并裁掉多余留白。
   用法：node tools/png-alpha.js assets/models
   ============================================================ */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- CRC32 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- PNG 解码（8 bit, 非隔行, RGB/RGBA） ---------- */
function decodePNG(buf) {
  let i = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported png: depth=${depth} colorType=${colorType} interlace=${interlace}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    raw.copy(cur, 0, p, p + stride);
    p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = cur[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    cur.copy(prev);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * bpp;
      out[o] = cur[s];
      out[o + 1] = cur[s + 1];
      out[o + 2] = cur[s + 2];
      out[o + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
  }
  return { width, height, data: out };
}

/* ---------- PNG 编码（RGBA, filter 0） ---------- */
function encodePNG({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, payload) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(payload.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- 白底 → 透明 ---------- */
function whiteToAlpha(img, threshold = 238) {
  const { width, height, data } = img;
  const outside = new Uint8Array(width * height);
  const stack = [];
  const isWhite = (x, y) => {
    const o = (y * width + x) * 4;
    return data[o] >= threshold && data[o + 1] >= threshold && data[o + 2] >= threshold;
  };
  for (let x = 0; x < width; x++) { stack.push([x, 0], [x, height - 1]); }
  for (let y = 0; y < height; y++) { stack.push([0, y], [width - 1, y]); }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (outside[idx] || !isWhite(x, y)) continue;
    outside[idx] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  // 边缘一像素：按亮度做半透明，减掉白底带来的浅色描边
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const o = idx * 4;
      if (outside[idx]) { data[o + 3] = 0; continue; }
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (outside[ny * width + nx]) { edge = true; break; }
        }
      }
      if (!edge) continue;
      const luma = (data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722);
      if (luma > 90) {
        const a = Math.max(0, Math.min(255, Math.round((255 - luma) * 1.8)));
        data[o + 3] = a;
        data[o] = data[o + 1] = data[o + 2] = Math.min(data[o], 40);
      }
    }
  }
  return img;
}

/* ---------- 剪影压平 ----------
   新的六张立绘素材自带白色线稿（发丝、五官），直接渲染会像“描边贴纸”。
   这里只把不透明的内部像素压成极窄的深紫黑阶，保留轮廓与发丝明暗，
   同时抹掉白色线稿与五官；不改动 alpha，也不额外勾边。 */
const FLATTEN = new Set([
  'painter', 'colorist', 'pageboy', 'maidgirl', 'official', 'dowager',
  'lucas', 'claire', 'marguerite', 'henri', 'julian', 'sofia', 'etienne', 'elena',
  'linshen', 'suwan', 'guyan', 'xiaqing', 'chenmo', 'zhoumubai', 'yezhiqiu',
]);
function flattenSilhouette(img) {
  const { data } = img;
  for (let o = 0; o < data.length; o += 4) {
    if (data[o + 3] === 0) continue;
    const luma = data[o] * 0.2126 + data[o + 1] * 0.7152 + data[o + 2] * 0.0722;
    const k = luma / 255;
    data[o] = Math.round(13 + k * 9);
    data[o + 1] = Math.round(10 + k * 6);
    data[o + 2] = Math.round(20 + k * 11);
  }
  return img;
}

function crop(img, pad = 4) {
  const { width, height, data } = img;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return img;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y + minY) * width + minX) * 4;
    data.copy(out, y * w * 4, src, src + w * 4);
  }
  return { width: w, height: h, data: out };
}

const dir = process.argv[2] || 'assets/models';
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.png') || name.endsWith('.cut.png')) continue;
  const src = path.join(dir, name);
  const img = decodePNG(fs.readFileSync(src));
  const base = name.replace(/\.png$/, '');
  let cut = whiteToAlpha(img);
  if (FLATTEN.has(base)) flattenSilhouette(cut);
  cut = crop(cut);
  const out = path.join(dir, name.replace(/\.png$/, '.cut.png'));
  fs.writeFileSync(out, encodePNG(cut));
  console.log(`${name}: ${img.width}x${img.height} -> ${cut.width}x${cut.height}  ${out}`);
}
