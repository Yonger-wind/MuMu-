/* ============================================================
   暮幕 · 特写道具
   只画“物件”，不画手与人物；用于【镜头：特写】的叙事插入。
   支持的物件：磁带随身听 / 有线耳机 / 纸质文件 / 旧照片 / 信纸 /
   颜料研钵 / 紫檀木盒 / 玄铁令牌 / 青绿长卷。
   ============================================================ */

const hexA = (hex, a) => {
  const h = String(hex || '#ffcf94').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function pickProp(text) {
  const t = String(text || '');
  if (/碎片|残片|碎块|撕碎|撕下/.test(t)) return 'fragment';
  if (/手机|短信|加密|聊天记录|屏幕/.test(t)) return 'phone';
  if (/放大镜|透镜|镜片/.test(t)) return 'loupe';
  if (/星图|星象图|星座|紫外|紫外线|荧光|光谱/.test(t)) return 'starmap';
  if (/账本|账簿|账册|黑皮|流水账/.test(t)) return 'ledger';
  if (/档案|卷宗|文件袋|档案袋|便签|纸条|机密/.test(t)) return 'archive';
  if (/雕塑|铜像|雕像|小像|青铜/.test(t)) return 'sculpture';
  if (/咖啡|浓缩|茶杯|杯碟/.test(t)) return 'coffee';
  if (/戒指|素圈|指环/.test(t)) return 'ring';
  if (/橘子汽水|汽水|易拉罐|铝罐|饮料罐/.test(t)) return 'soda';
  if (/小提琴|琴弓|琴盒|松香|琴弦/.test(t)) return 'violin';
  if (/乐谱|手抄|曲谱|谱纸|五线谱|奏鸣曲|总谱/.test(t)) return 'score';
  if (/钢琴|琴键|黑白键|键盘|琴凳/.test(t)) return 'piano';
  if (/星月夜|真迹|仿作|赝品|油画|画框|画作|那幅画|画布/.test(t)) return 'starry';
  if (/令牌|玄铁|虎符/.test(t)) return 'token';
  if (/长卷|画卷|画匣|画轴|千里江山|卷尾|红枫|血珠|血迹/.test(t)) return 'scroll';
  if (/紫檀木盒|木盒|匣|妆奁/.test(t)) return 'box';
  if (/研钵|玉杵|颜料|石青|石绿|青金|雌黄|朱砂|矿石|矿物|色碟|瓷碟|粉末/.test(t)) return 'paint';
  if (/照片|相片|旧照/.test(t)) return 'photo';
  if (/耳机|耳罩|耳塞/.test(t)) return 'earphone';
  if (/信纸|信笺|信件|书信|这封信|一封信|那封信|旧信|密信|口信|来信|家书/.test(t)) return 'letter';
  if (/文件|表格|申请|学籍|纸袋|纸片|纸页|散落/.test(t)) return 'paper';
  if (/磁带|随身听|录音|卡带|贴纸|纸飞机|磁头|齿轮/.test(t)) return 'cassette';
  return 'none';
}

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function dust(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 18; i++) {
    const ph = i * 1.7;
    const dx = Math.sin(ph * 1.3 + time * 0.25) * S * 0.42;
    const dy = Math.cos(ph * 0.9 + time * 0.18) * S * 0.24;
    const a = 0.05 + 0.05 * (0.5 + Math.sin(time * 0.9 + ph) * 0.5);
    ctx.fillStyle = hexA(p.glow, a);
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, Math.max(0.6, S * 0.004), 0, 6.3);
    ctx.fill();
  }
  ctx.restore();
}

function drawCassette(ctx, x, y, S, time, p, tangle) {
  const w = S * 0.96, h = S * 0.60;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.055);

  // 投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = S * 0.12;
  ctx.shadowOffsetY = S * 0.05;
  const shell = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  shell.addColorStop(0, 'rgba(196,214,224,0.34)');
  shell.addColorStop(0.3, 'rgba(232,242,248,0.18)');
  shell.addColorStop(0.66, 'rgba(104,120,132,0.26)');
  shell.addColorStop(1, 'rgba(54,64,76,0.4)');
  ctx.fillStyle = shell;
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.028);
  ctx.fill();
  ctx.restore();

  // 内部腔体（下半部，透过透明壳可见）
  ctx.fillStyle = 'rgba(16,18,24,0.9)';
  rr(ctx, -w * 0.44, -h * 0.08, w * 0.88, h * 0.5, S * 0.018);
  ctx.fill();

  // 双卷轴：左满右空
  const ry = h * 0.19;
  const reelR = S * 0.078;
  const drawReel = (rx, fill, dir) => {
    // 磁带
    if (fill > 0) {
      ctx.strokeStyle = '#5e3a24';
      ctx.lineWidth = S * 0.012 + reelR * fill * 0.6;
      ctx.beginPath();
      ctx.arc(rx, ry, reelR - ctx.lineWidth / 2 + S * 0.002, 0, 6.3);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(146,96,58,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rx, ry, reelR - S * 0.016, 0, 6.3);
      ctx.stroke();
    }
    // 轮毂
    ctx.fillStyle = '#cfc6b4';
    ctx.beginPath(); ctx.arc(rx, ry, reelR * 0.52, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(70,66,60,0.55)';
    ctx.beginPath(); ctx.arc(rx, ry, reelR * 0.16, 0, 6.3); ctx.fill();
    // 齿
    ctx.fillStyle = '#c2b9a6';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283 + (dir > 0 ? time * 0.2 : 0);
      rr(ctx, rx + Math.cos(a) * reelR * 0.36 - S * 0.007, ry + Math.sin(a) * reelR * 0.36 - S * 0.007,
        S * 0.014, S * 0.014, S * 0.003);
      ctx.fill();
    }
  };
  drawReel(-w * 0.22, 0.9, 1);
  drawReel(w * 0.22, 0.18, -1);

  // 走带路径
  ctx.strokeStyle = '#5a3822';
  ctx.lineWidth = S * 0.008;
  ctx.beginPath();
  ctx.moveTo(-w * 0.22, ry + reelR * 0.9);
  ctx.quadraticCurveTo(0, h * 0.36, w * 0.28, ry + reelR * 0.7);
  ctx.stroke();

  // 中央透明观察窗
  ctx.fillStyle = 'rgba(10,12,18,0.92)';
  rr(ctx, -w * 0.15, h * 0.13, w * 0.3, h * 0.2, S * 0.012);
  ctx.fill();
  // 窗内磁带包：底部一条厚实的褐色带卷
  ctx.save();
  rr(ctx, -w * 0.15, h * 0.13, w * 0.3, h * 0.2, S * 0.012);
  ctx.clip();
  const pack = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.33);
  pack.addColorStop(0, '#7a4c2c');
  pack.addColorStop(0.45, '#5a3620');
  pack.addColorStop(1, '#33200f');
  ctx.fillStyle = pack;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.335, w * 0.15, h * 0.052, 0, 0, 6.3);
  ctx.fill();
  // 带卷层与反光
  ctx.strokeStyle = 'rgba(168,112,66,0.35)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(0, h * 0.335, w * (0.13 - i * 0.022), h * (0.045 - i * 0.008), 0, 3.3, 6.1);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(220,230,240,0.10)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.055, h * 0.145, w * 0.05, h * 0.055, -0.5, 0, 6.3);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(196,200,210,0.18)';
  ctx.lineWidth = 1;
  rr(ctx, -w * 0.15, h * 0.13, w * 0.3, h * 0.2, S * 0.012);
  ctx.stroke();

  // 底部绞带孔与压带轮
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#0c0e14';
    ctx.beginPath();
    ctx.arc(side * w * 0.14, h * 0.42, S * 0.016, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,196,204,0.28)';
    ctx.beginPath();
    ctx.arc(side * w * 0.14, h * 0.42, S * 0.006, 0, 6.3);
    ctx.fill();
  }

  // 泛黄卷边的标签纸
  const lx = -w * 0.44, ly = -h * 0.43, lw = w * 0.88, lh = h * 0.31;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = S * 0.012;
  ctx.shadowOffsetY = S * 0.006;
  const paper = ctx.createLinearGradient(lx, ly, lx + lw, ly + lh);
  paper.addColorStop(0, '#f1e6cf');
  paper.addColorStop(0.55, '#e7d7b9');
  paper.addColorStop(1, '#d8c4a2');
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.moveTo(lx + S * 0.012, ly);
  ctx.lineTo(lx + lw - S * 0.05, ly);
  ctx.lineTo(lx + lw, ly + S * 0.048);
  ctx.lineTo(lx + lw - S * 0.008, ly + lh);
  ctx.lineTo(lx + S * 0.008, ly + lh);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // 卷角
  ctx.fillStyle = 'rgba(196,178,146,0.95)';
  ctx.beginPath();
  ctx.moveTo(lx + lw - S * 0.05, ly);
  ctx.lineTo(lx + lw - S * 0.006, ly + S * 0.046);
  ctx.lineTo(lx + lw - S * 0.05, ly + S * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,96,66,0.35)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // 纸纹与旧胶痕
  ctx.strokeStyle = 'rgba(150,128,96,0.18)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(lx + 6, ly + lh * (0.2 + i * 0.16));
    ctx.lineTo(lx + lw - 10, ly + lh * (0.2 + i * 0.16) + 1.2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(180,160,120,0.22)';
  ctx.fillRect(lx + lw * 0.08, ly + lh * 0.1, lw * 0.16, lh * 0.8);

  // 两只歪歪扭扭的蓝色水彩纸飞机
  const plane = (px, py, s, rot) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    // 上翼
    ctx.fillStyle = 'rgba(58,106,172,0.52)';
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.84, -s * 0.62);
    ctx.lineTo(-s * 0.2, 0.05 * s);
    ctx.closePath();
    ctx.fill();
    // 下翼
    ctx.fillStyle = 'rgba(40,82,142,0.42)';
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.8, s * 0.46);
    ctx.lineTo(-s * 0.2, 0.05 * s);
    ctx.closePath();
    ctx.fill();
    // 折痕
    ctx.strokeStyle = 'rgba(28,62,118,0.62)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(s * 0.94, 0);
    ctx.lineTo(-s * 0.35, 0.03 * s);
    ctx.stroke();
    // 水彩晕边
    ctx.strokeStyle = 'rgba(70,124,190,0.28)';
    ctx.lineWidth = Math.max(1.5, s * 0.09);
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.84, -s * 0.62);
    ctx.stroke();
    ctx.restore();
  };
  plane(lx + lw * 0.33, ly + lh * 0.5, S * 0.095, 0.12);
  plane(lx + lw * 0.67, ly + lh * 0.38, S * 0.082, -0.24);
  // 褪色的铅笔字
  ctx.strokeStyle = 'rgba(92,84,72,0.36)';
  ctx.lineWidth = Math.max(1, S * 0.0028);
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(lx + lw * 0.14 + i * S * 0.06, ly + lh * 0.8);
    ctx.lineTo(lx + lw * 0.18 + i * S * 0.06, ly + lh * 0.77);
    ctx.stroke();
  }

  // 磁带型号与方向箭头
  ctx.fillStyle = 'rgba(74,66,56,0.55)';
  ctx.font = `600 ${Math.max(7, S * 0.018)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('C-60', lx + lw * 0.03, ly + lh * 0.94);
  ctx.strokeStyle = 'rgba(74,66,56,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lx + lw * 0.8, ly + lh * 0.9);
  ctx.lineTo(lx + lw * 0.9, ly + lh * 0.9);
  ctx.lineTo(lx + lw * 0.87, ly + lh * 0.86);
  ctx.moveTo(lx + lw * 0.9, ly + lh * 0.9);
  ctx.lineTo(lx + lw * 0.87, ly + lh * 0.94);
  ctx.stroke();

  // 四角螺钉
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const px = sx * w * 0.42, py = sy * h * 0.4;
      ctx.fillStyle = 'rgba(206,214,222,0.45)';
      ctx.beginPath(); ctx.arc(px, py, S * 0.009, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(40,44,50,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - S * 0.005, py); ctx.lineTo(px + S * 0.005, py);
      ctx.stroke();
    }
  }

  // 绞带：磁带丝从绞带孔被扯出
  if (tangle) {
    ctx.strokeStyle = 'rgba(130,82,50,0.9)';
    ctx.lineWidth = Math.max(1.2, S * 0.0055);
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(w * 0.10 + i * S * 0.003, h * 0.16);
      ctx.bezierCurveTo(
        w * (0.19 + i * 0.008), h * (0.10 + i * 0.04),
        w * (0.30 - i * 0.006), h * (0.30 - i * 0.03),
        w * (0.27 + i * 0.008), h * (0.39 - i * 0.012),
      );
      ctx.stroke();
    }
    // 缠住的磁头滚轮
    ctx.strokeStyle = 'rgba(166,112,70,0.95)';
    ctx.lineWidth = Math.max(1.4, S * 0.0065);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(w * 0.22, h * 0.30, S * (0.020 + i * 0.0035), S * (0.016 + i * 0.0025), i * 0.5, 0, 6.3);
      ctx.stroke();
    }
    // 末端散出的细丝
    ctx.strokeStyle = 'rgba(120,74,44,0.75)';
    ctx.lineWidth = Math.max(0.9, S * 0.003);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(w * (0.24 + i * 0.01), h * 0.36);
      ctx.quadraticCurveTo(w * (0.30 + i * 0.012), h * (0.40 + i * 0.015), w * (0.33 + i * 0.008), h * (0.37 + i * 0.02));
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(228,216,192,0.5)';
    ctx.beginPath();
    ctx.ellipse(w * 0.29, h * 0.40, S * 0.012, S * 0.007, 0.6, 0, 6.3);
    ctx.fill();
  }

  // 透明壳反光
  ctx.save();
  ctx.beginPath();
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.028);
  ctx.clip();
  const gl = ctx.createLinearGradient(-w * 0.4, -h * 0.5, w * 0.1, h * 0.6);
  gl.addColorStop(0, 'rgba(255,255,255,0.15)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, -h * 0.5);
  ctx.lineTo(-w * 0.12, -h * 0.5);
  ctx.lineTo(-w * 0.34, h * 0.5);
  ctx.lineTo(-w * 0.48, h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-w * 0.46, -h * 0.44);
  ctx.lineTo(w * 0.46, -h * 0.44);
  ctx.stroke();
  ctx.restore();

  // 外壳高光与轮廓
  ctx.strokeStyle = 'rgba(226,238,246,0.32)';
  ctx.lineWidth = Math.max(1, S * 0.004);
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.028);
  ctx.stroke();
  ctx.strokeStyle = hexA(p.glow, 0.25);
  ctx.lineWidth = Math.max(1, S * 0.0025);
  rr(ctx, -w / 2 + 2, -h / 2 + 2, w - 4, h - 4, S * 0.026);
  ctx.stroke();

  ctx.restore();
}


function drawEarphone(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.1);

  // 耳机线：从耳塞底部绕到右下插头
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = S * 0.03;
  ctx.shadowOffsetY = S * 0.012;
  const cable = ctx.createLinearGradient(-S * 0.1, S * 0.05, S * 0.3, S * 0.4);
  cable.addColorStop(0, '#1a1a20');
  cable.addColorStop(0.5, '#26262e');
  cable.addColorStop(1, '#121218');
  ctx.strokeStyle = cable;
  ctx.lineWidth = Math.max(2, S * 0.014);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-S * 0.10, S * 0.10);
  ctx.bezierCurveTo(-S * 0.22, S * 0.30, -S * 0.02, S * 0.46, S * 0.12, S * 0.36);
  ctx.bezierCurveTo(S * 0.24, S * 0.28, S * 0.18, S * 0.14, S * 0.27, S * 0.18);
  ctx.stroke();
  // 线材高光
  ctx.strokeStyle = 'rgba(150,160,180,0.18)';
  ctx.lineWidth = Math.max(0.8, S * 0.0035);
  ctx.beginPath();
  ctx.moveTo(-S * 0.10, S * 0.10);
  ctx.bezierCurveTo(-S * 0.21, S * 0.29, -S * 0.03, S * 0.44, S * 0.11, S * 0.35);
  ctx.stroke();
  ctx.restore();

  // 3.5mm 插头
  const px = S * 0.30, py = S * 0.26;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(0.55);
  // 插头外壳
  const barrel = ctx.createLinearGradient(-S * 0.028, 0, S * 0.028, 0);
  barrel.addColorStop(0, '#0d0d12');
  barrel.addColorStop(0.45, '#3c3c46');
  barrel.addColorStop(0.6, '#24242c');
  barrel.addColorStop(1, '#08080c');
  ctx.fillStyle = barrel;
  rr(ctx, -S * 0.026, -S * 0.028, S * 0.052, S * 0.11, S * 0.012);
  ctx.fill();
  // 防滑纹
  ctx.strokeStyle = 'rgba(150,158,172,0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-S * 0.022, -S * 0.02 + i * S * 0.014);
    ctx.lineTo(S * 0.022, -S * 0.02 + i * S * 0.014);
    ctx.stroke();
  }
  // 金色插针
  const gold = ctx.createLinearGradient(-S * 0.012, 0, S * 0.012, 0);
  gold.addColorStop(0, '#8a6a2e');
  gold.addColorStop(0.45, '#e8c87a');
  gold.addColorStop(1, '#6e5222');
  ctx.fillStyle = gold;
  rr(ctx, -S * 0.011, -S * 0.082, S * 0.022, S * 0.06, S * 0.008);
  ctx.fill();
  ctx.fillStyle = '#1a1a20';
  ctx.fillRect(-S * 0.012, -S * 0.03, S * 0.024, S * 0.008);
  ctx.restore();

  // 耳塞：黑色海绵套
  const ex = -S * 0.06, ey = -S * 0.02, er = S * 0.155;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(-0.18);
  // 壳体阴影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = S * 0.05;
  ctx.shadowOffsetY = S * 0.02;
  const foam = ctx.createRadialGradient(-er * 0.22, -er * 0.26, er * 0.08, 0, 0, er);
  foam.addColorStop(0, '#4a4a54');
  foam.addColorStop(0.45, '#2c2c34');
  foam.addColorStop(0.82, '#16161c');
  foam.addColorStop(1, '#08080c');
  ctx.fillStyle = foam;
  ctx.beginPath();
  ctx.arc(0, 0, er, 0, 6.3);
  ctx.fill();
  ctx.restore();
  // 海绵孔隙
  for (let i = 0; i < 90; i++) {
    const a = i * 2.399 + 0.4;
    const rr0 = er * Math.sqrt((i + 0.5) / 90) * 0.94;
    const dop = 0.5 + 0.5 * Math.sin(i * 7.3);
    ctx.fillStyle = `rgba(130,132,146,${0.05 + dop * 0.10})`;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr0, Math.sin(a) * rr0, Math.max(0.5, S * (0.0022 + 0.0028 * dop)), 0, 6.3);
    ctx.fill();
  }
  // 外缘
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = Math.max(1, S * 0.006);
  ctx.beginPath(); ctx.arc(0, 0, er, 0, 6.3); ctx.stroke();
  // 银色驱动环（右下露出）
  ctx.strokeStyle = 'rgba(178,184,196,0.4)';
  ctx.lineWidth = Math.max(1, S * 0.004);
  ctx.beginPath(); ctx.arc(0, 0, er * 0.94, 0.25, 1.55); ctx.stroke();
  // 暖色边缘光
  ctx.strokeStyle = hexA(p.glow, 0.34);
  ctx.lineWidth = Math.max(1.2, S * 0.005);
  ctx.beginPath(); ctx.arc(0, 0, er * 0.98, -1.35, -0.35); ctx.stroke();
  // 出线柄与护套
  ctx.rotate(0.18);
  const stem = ctx.createLinearGradient(-er * 0.2, er * 0.6, er * 0.32, er * 0.7);
  stem.addColorStop(0, '#0c0c10');
  stem.addColorStop(0.5, '#33333c');
  stem.addColorStop(1, '#0c0c10');
  ctx.fillStyle = stem;
  rr(ctx, -er * 0.16, er * 0.72, er * 0.32, er * 0.62, er * 0.12);
  ctx.fill();
  // 银色环
  const ring = ctx.createLinearGradient(-er * 0.3, 0, er * 0.3, 0);
  ring.addColorStop(0, '#5e626e');
  ring.addColorStop(0.5, '#c8ccd6');
  ring.addColorStop(1, '#4a4e58');
  ctx.fillStyle = ring;
  ctx.fillRect(-er * 0.20, er * 1.06, er * 0.40, er * 0.10);
  ctx.fillStyle = '#101014';
  rr(ctx, -er * 0.12, er * 1.18, er * 0.24, er * 0.34, er * 0.08);
  ctx.fill();
  ctx.restore();

  // 海绵表面的细碎高光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const a = -2.2 + i * 0.28 + Math.sin(time * 0.6 + i) * 0.05;
    const rr0 = er * (0.55 + (i % 3) * 0.14);
    ctx.fillStyle = hexA(p.glow, 0.06 + (i % 2) * 0.03);
    ctx.beginPath();
    ctx.arc(ex + Math.cos(a) * rr0, ey + Math.sin(a) * rr0, S * 0.004, 0, 6.3);
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}


function drawPhoto(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.04);
  const w = S * 0.72, h = S * 0.88;

  // 投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = S * 0.15;
  ctx.shadowOffsetY = S * 0.055;
  ctx.fillStyle = '#e8dfcc';
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.006);
  ctx.fill();
  ctx.restore();

  // 相纸：四边留白，底边更宽
  const paper = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  paper.addColorStop(0, '#efe7d4');
  paper.addColorStop(0.5, '#e6dcc6');
  paper.addColorStop(1, '#d6c9ae');
  ctx.fillStyle = paper;
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.006);
  ctx.fill();
  // 纸面受潮的斑
  for (let i = 0; i < 9; i++) {
    const bx = -w / 2 + (Math.abs(Math.sin(i * 5.7)) * 0.9 + 0.05) * w;
    const by = -h / 2 + (Math.abs(Math.sin(i * 9.1 + 2)) * 0.9 + 0.05) * h;
    ctx.fillStyle = `rgba(150,124,86,${0.03 + (i % 3) * 0.015})`;
    ctx.beginPath();
    ctx.ellipse(bx, by, S * (0.02 + (i % 4) * 0.012), S * (0.014 + (i % 3) * 0.01), i, 0, 6.3);
    ctx.fill();
  }

  // 画面区域
  const ix = -w / 2 + S * 0.036, iy = -h / 2 + S * 0.036;
  const iw = w - S * 0.072, ih = h - S * 0.17;

  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();

  // 黑白底：老宅门口
  const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
  g.addColorStop(0, '#8d867c');
  g.addColorStop(0.3, '#7b7369');
  g.addColorStop(0.62, '#5d554c');
  g.addColorStop(1, '#3c352e');
  ctx.fillStyle = g;
  ctx.fillRect(ix, iy, iw, ih);

  // 门内：昏暗的玄关
  ctx.fillStyle = 'rgba(32,28,24,0.62)';
  ctx.fillRect(ix + iw * 0.02, iy + ih * 0.06, iw * 0.58, ih * 0.56);
  // 障子门的格子透光
  ctx.save();
  ctx.fillStyle = 'rgba(214,206,190,0.20)';
  ctx.fillRect(ix + iw * 0.06, iy + ih * 0.10, iw * 0.24, ih * 0.46);
  ctx.strokeStyle = 'rgba(40,35,30,0.55)';
  ctx.lineWidth = Math.max(1, S * 0.004);
  for (let r = 0; r < 4; r++) {
    const yy = iy + ih * (0.10 + r * 0.115);
    ctx.beginPath(); ctx.moveTo(ix + iw * 0.06, yy); ctx.lineTo(ix + iw * 0.30, yy); ctx.stroke();
  }
  for (let c = 0; c < 3; c++) {
    const xx = ix + iw * (0.10 + c * 0.075);
    ctx.beginPath(); ctx.moveTo(xx, iy + ih * 0.10); ctx.lineTo(xx, iy + ih * 0.56); ctx.stroke();
  }
  ctx.restore();
  // 门楣与立柱
  ctx.fillStyle = 'rgba(38,32,27,0.75)';
  ctx.fillRect(ix + iw * 0.015, iy + ih * 0.055, iw * 0.60, ih * 0.028);
  ctx.fillRect(ix + iw * 0.015, iy + ih * 0.055, iw * 0.022, ih * 0.56);
  // 檐下吊着的风铃影子
  ctx.strokeStyle = 'rgba(30,26,22,0.5)';
  ctx.lineWidth = Math.max(0.8, S * 0.002);
  ctx.beginPath();
  ctx.moveTo(ix + iw * 0.78, iy + ih * 0.04);
  ctx.lineTo(ix + iw * 0.78, iy + ih * 0.14);
  ctx.stroke();
  ctx.fillStyle = 'rgba(46,40,34,0.6)';
  ctx.beginPath();
  ctx.arc(ix + iw * 0.78, iy + ih * 0.155, S * 0.012, 0, 6.3);
  ctx.fill();
  // 墙板竖纹
  ctx.strokeStyle = 'rgba(30,26,22,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const xx = ix + iw * (0.63 + i * 0.042);
    ctx.beginPath();
    ctx.moveTo(xx, iy + ih * 0.06);
    ctx.lineTo(xx, iy + ih * 0.58);
    ctx.stroke();
  }
  // 右下：一盆野草
  ctx.fillStyle = 'rgba(40,36,28,0.55)';
  ctx.beginPath();
  ctx.ellipse(ix + iw * 0.84, iy + ih * 0.50, S * 0.035, S * 0.045, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,56,44,0.5)';
  ctx.lineWidth = Math.max(1, S * 0.0025);
  for (let i = 0; i < 6; i++) {
    const a = -1.9 + i * 0.25;
    ctx.beginPath();
    ctx.moveTo(ix + iw * 0.84, iy + ih * 0.46);
    ctx.quadraticCurveTo(
      ix + iw * 0.84 + Math.cos(a) * S * 0.03, iy + ih * 0.42,
      ix + iw * 0.84 + Math.cos(a) * S * 0.05, iy + ih * (0.44 + Math.sin(a) * 0.03),
    );
    ctx.stroke();
  }

  // 木质台阶
  for (let i = 0; i < 4; i++) {
    const sy = iy + ih * (0.58 + i * 0.105);
    const stepH = ih * 0.105;
    // 踏面
    const top = ctx.createLinearGradient(0, sy, 0, sy + stepH * 0.42);
    top.addColorStop(0, i % 2 ? '#6f6250' : '#796b57');
    top.addColorStop(1, i % 2 ? '#574b3c' : '#614f3e');
    ctx.fillStyle = top;
    ctx.fillRect(ix, sy, iw, stepH * 0.42);
    // 立面
    ctx.fillStyle = i % 2 ? 'rgba(52,44,36,0.9)' : 'rgba(64,54,44,0.9)';
    ctx.fillRect(ix, sy + stepH * 0.42, iw, stepH * 0.58);
    // 板缝
    ctx.strokeStyle = 'rgba(24,20,17,0.5)';
    ctx.lineWidth = Math.max(1, S * 0.0035);
    ctx.beginPath();
    ctx.moveTo(ix, sy); ctx.lineTo(ix + iw, sy);
    ctx.stroke();
    // 木纹
    ctx.strokeStyle = 'rgba(30,26,20,0.22)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const yy = sy + stepH * (0.12 + k * 0.24) + Math.sin(i * 3 + k) * 1.5;
      ctx.beginPath();
      ctx.moveTo(ix + iw * (0.05 + ((i + k) % 3) * 0.22), yy);
      ctx.bezierCurveTo(
        ix + iw * 0.4, yy + 1.5,
        ix + iw * 0.7, yy - 1.5,
        ix + iw * (0.8 + (k % 2) * 0.1), yy,
      );
      ctx.stroke();
    }
    // 踏面前缘受光
    ctx.strokeStyle = 'rgba(206,196,176,0.16)';
    ctx.beginPath();
    ctx.moveTo(ix, sy + 0.5); ctx.lineTo(ix + iw, sy + 0.5);
    ctx.stroke();
  }

  // —— 坐在木阶上的小男孩 ——
  const bx = ix + iw * 0.47;
  const hipY = iy + ih * 0.60;
  const shY = hipY - ih * 0.205;
  const headCY = shY - ih * 0.066;
  const hr = ih * 0.088;
  const skin = (a) => `rgba(158,150,136,${a})`;
  const skinLit = (a) => `rgba(188,180,164,${a})`;
  const skinDeep = (a) => `rgba(104,96,84,${a})`;

  // 台阶上的柔和落影
  ctx.fillStyle = 'rgba(14,11,9,0.34)';
  ctx.beginPath();
  ctx.ellipse(bx + S * 0.012, hipY + ih * 0.015, S * 0.115, S * 0.026, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(14,11,9,0.22)';
  ctx.beginPath();
  ctx.ellipse(bx - S * 0.05, hipY + ih * 0.255, S * 0.04, S * 0.012, 0, 0, 6.3);
  ctx.ellipse(bx + S * 0.062, hipY + ih * 0.25, S * 0.04, S * 0.012, 0, 0, 6.3);
  ctx.fill();

  // 腿：膝盖朝前，小腿垂下
  ctx.lineCap = 'round';
  // 左腿
  ctx.strokeStyle = skin(0.96);
  ctx.lineWidth = S * 0.040;
  ctx.beginPath();
  ctx.moveTo(bx - S * 0.030, hipY + S * 0.004);
  ctx.quadraticCurveTo(bx - S * 0.054, hipY + ih * 0.055, bx - S * 0.050, hipY + ih * 0.098);
  ctx.stroke();
  ctx.lineWidth = S * 0.030;
  ctx.beginPath();
  ctx.moveTo(bx - S * 0.050, hipY + ih * 0.095);
  ctx.quadraticCurveTo(bx - S * 0.044, hipY + ih * 0.175, bx - S * 0.048, hipY + ih * 0.252);
  ctx.stroke();
  // 右腿
  ctx.lineWidth = S * 0.040;
  ctx.beginPath();
  ctx.moveTo(bx + S * 0.030, hipY + S * 0.004);
  ctx.quadraticCurveTo(bx + S * 0.056, hipY + ih * 0.05, bx + S * 0.052, hipY + ih * 0.095);
  ctx.stroke();
  ctx.lineWidth = S * 0.030;
  ctx.beginPath();
  ctx.moveTo(bx + S * 0.052, hipY + ih * 0.092);
  ctx.quadraticCurveTo(bx + S * 0.060, hipY + ih * 0.175, bx + S * 0.064, hipY + ih * 0.248);
  ctx.stroke();
  // 膝盖受光（旧照片里只留一点体积，不要白球）
  ctx.fillStyle = skinLit(0.26);
  ctx.beginPath();
  ctx.ellipse(bx - S * 0.050, hipY + ih * 0.096, S * 0.016, S * 0.012, 0.1, 0, 6.3);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(bx + S * 0.053, hipY + ih * 0.092, S * 0.016, S * 0.012, -0.1, 0, 6.3);
  ctx.fill();
  // 小腿的暗面
  ctx.strokeStyle = skinDeep(0.30);
  ctx.lineWidth = Math.max(1, S * 0.004);
  ctx.beginPath();
  ctx.moveTo(bx - S * 0.038, hipY + ih * 0.19);
  ctx.quadraticCurveTo(bx - S * 0.034, hipY + ih * 0.225, bx - S * 0.038, hipY + ih * 0.248);
  ctx.moveTo(bx + S * 0.074, hipY + ih * 0.19);
  ctx.quadraticCurveTo(bx + S * 0.070, hipY + ih * 0.222, bx + S * 0.073, hipY + ih * 0.246);
  ctx.stroke();

  // 球鞋
  const shoe = (sx) => {
    ctx.fillStyle = 'rgba(46,42,38,0.96)';
    ctx.beginPath();
    ctx.ellipse(bx + sx * S * 0.052, hipY + ih * 0.272, S * 0.034, S * 0.019, sx * 0.08, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(176,170,158,0.55)';
    ctx.beginPath();
    ctx.ellipse(bx + sx * S * 0.046, hipY + ih * 0.279, S * 0.027, S * 0.005, sx * 0.08, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,27,24,0.9)';
    ctx.fillRect(bx + sx * S * 0.052 - S * 0.030, hipY + ih * 0.282, S * 0.060, S * 0.006);
  };
  shoe(-1); shoe(1);

  // 短裤
  ctx.fillStyle = 'rgba(58,54,50,0.97)';
  ctx.beginPath();
  ctx.moveTo(bx - S * 0.058, hipY - S * 0.020);
  ctx.lineTo(bx + S * 0.058, hipY - S * 0.020);
  ctx.quadraticCurveTo(bx + S * 0.062, hipY + S * 0.020, bx + S * 0.050, hipY + S * 0.048);
  ctx.quadraticCurveTo(bx + S * 0.020, hipY + S * 0.042, bx + S * 0.008, hipY + S * 0.052);
  ctx.lineTo(bx - S * 0.008, hipY + S * 0.052);
  ctx.quadraticCurveTo(bx - S * 0.026, hipY + S * 0.042, bx - S * 0.050, hipY + S * 0.048);
  ctx.quadraticCurveTo(bx - S * 0.062, hipY + S * 0.018, bx - S * 0.058, hipY - S * 0.020);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(24,22,20,0.5)';
  ctx.lineWidth = Math.max(1, S * 0.002);
  ctx.beginPath();
  ctx.moveTo(bx, hipY + S * 0.010);
  ctx.lineTo(bx + S * 0.002, hipY + S * 0.048);
  ctx.stroke();

  // 浅色 T 恤：在黑白旧照里褪成柔和的浅灰
  const teeG = ctx.createLinearGradient(bx - S * 0.07, shY, bx + S * 0.08, hipY);
  teeG.addColorStop(0, 'rgba(200,194,182,0.98)');
  teeG.addColorStop(0.5, 'rgba(174,168,156,0.98)');
  teeG.addColorStop(1, 'rgba(132,126,116,0.98)');
  // 衣身
  ctx.fillStyle = teeG;
  ctx.beginPath();
  ctx.moveTo(bx - S * 0.060, shY + S * 0.006);
  ctx.quadraticCurveTo(bx - S * 0.076, hipY - S * 0.030, bx - S * 0.062, hipY + S * 0.002);
  ctx.lineTo(bx + S * 0.062, hipY + S * 0.002);
  ctx.quadraticCurveTo(bx + S * 0.076, hipY - S * 0.030, bx + S * 0.060, shY + S * 0.006);
  ctx.quadraticCurveTo(bx, shY - S * 0.010, bx - S * 0.060, shY + S * 0.006);
  ctx.closePath();
  ctx.fill();
  // 短袖：顺着肩线垂下的布片，不是两颗圆球
  for (const sx of [-1, 1]) {
    ctx.fillStyle = teeG;
    ctx.beginPath();
    ctx.moveTo(bx + sx * S * 0.056, shY - S * 0.002);
    ctx.bezierCurveTo(bx + sx * S * 0.080, shY + S * 0.002, bx + sx * S * 0.088, shY + S * 0.026, bx + sx * S * 0.080, shY + S * 0.044);
    ctx.quadraticCurveTo(bx + sx * S * 0.076, shY + S * 0.055, bx + sx * S * 0.052, shY + S * 0.048);
    ctx.quadraticCurveTo(bx + sx * S * 0.046, shY + S * 0.026, bx + sx * S * 0.056, shY - S * 0.002);
    ctx.closePath();
    ctx.fill();
    // 袖口折边
    ctx.strokeStyle = 'rgba(74,68,58,0.45)';
    ctx.lineWidth = Math.max(0.9, S * 0.002);
    ctx.beginPath();
    ctx.moveTo(bx + sx * S * 0.080, shY + S * 0.040);
    ctx.quadraticCurveTo(bx + sx * S * 0.070, shY + S * 0.052, bx + sx * S * 0.052, shY + S * 0.047);
    ctx.stroke();
    // 袖子暗面
    ctx.strokeStyle = 'rgba(60,54,46,0.22)';
    ctx.beginPath();
    ctx.moveTo(bx + sx * S * 0.058, shY + S * 0.010);
    ctx.quadraticCurveTo(bx + sx * S * 0.072, shY + S * 0.024, bx + sx * S * 0.066, shY + S * 0.038);
    ctx.stroke();
  }
  // 领口
  ctx.strokeStyle = 'rgba(80,72,60,0.6)';
  ctx.lineWidth = Math.max(1.2, S * 0.003);
  ctx.beginPath();
  ctx.ellipse(bx, shY + S * 0.004, S * 0.021, S * 0.009, 0, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(38,34,28,0.28)';
  ctx.beginPath();
  ctx.ellipse(bx, shY + S * 0.004, S * 0.019, S * 0.007, 0, 0.25, Math.PI - 0.25);
  ctx.stroke();
  // 衣褶
  ctx.strokeStyle = 'rgba(64,58,48,0.30)';
  ctx.lineWidth = Math.max(1, S * 0.0022);
  ctx.beginPath();
  ctx.moveTo(bx - S * 0.024, shY + S * 0.055);
  ctx.quadraticCurveTo(bx - S * 0.012, hipY - S * 0.06, bx - S * 0.030, hipY - S * 0.015);
  ctx.moveTo(bx + S * 0.030, shY + S * 0.06);
  ctx.quadraticCurveTo(bx + S * 0.022, hipY - S * 0.05, bx + S * 0.040, hipY - S * 0.01);
  ctx.stroke();

  // 手臂：搭在膝盖上
  ctx.strokeStyle = skin(0.97);
  ctx.lineWidth = S * 0.023;
  ctx.beginPath();
  ctx.moveTo(bx - S * 0.070, shY + S * 0.052);
  ctx.quadraticCurveTo(bx - S * 0.082, hipY - S * 0.02, bx - S * 0.054, hipY + ih * 0.075);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx + S * 0.070, shY + S * 0.052);
  ctx.quadraticCurveTo(bx + S * 0.084, hipY - S * 0.02, bx + S * 0.056, hipY + ih * 0.075);
  ctx.stroke();
  // 手
  ctx.fillStyle = skinLit(0.80);
  ctx.beginPath();
  ctx.ellipse(bx - S * 0.053, hipY + ih * 0.086, S * 0.019, S * 0.014, 0.2, 0, 6.3);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(bx + S * 0.055, hipY + ih * 0.084, S * 0.019, S * 0.014, -0.2, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = skinDeep(0.4);
  ctx.lineWidth = Math.max(0.7, S * 0.0015);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(bx - S * 0.060 + i * S * 0.006, hipY + ih * 0.088);
    ctx.lineTo(bx - S * 0.058 + i * S * 0.006, hipY + ih * 0.094);
    ctx.stroke();
  }

  // 脖子
  ctx.fillStyle = skin(0.9);
  ctx.beginPath();
  ctx.ellipse(bx, shY - S * 0.002, S * 0.019, S * 0.022, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = skinDeep(0.35);
  ctx.beginPath();
  ctx.ellipse(bx, shY + S * 0.006, S * 0.016, S * 0.008, 0, 0, 6.3);
  ctx.fill();

  // 头与脸
  ctx.save();
  ctx.translate(bx, headCY);
  ctx.rotate(-0.03);
  const faceG = ctx.createLinearGradient(-hr * 0.7, -hr, hr * 0.8, hr);
  faceG.addColorStop(0, 'rgba(186,178,162,0.99)');
  faceG.addColorStop(0.55, 'rgba(160,152,138,0.99)');
  faceG.addColorStop(1, 'rgba(118,110,98,0.99)');
  ctx.fillStyle = faceG;
  ctx.beginPath();
  ctx.moveTo(-hr * 0.80, -hr * 0.50);
  ctx.bezierCurveTo(-hr * 0.96, 0, -hr * 0.66, hr * 0.66, 0, hr * 0.92);
  ctx.bezierCurveTo(hr * 0.66, hr * 0.66, hr * 0.96, 0, hr * 0.80, -hr * 0.50);
  ctx.bezierCurveTo(hr * 0.62, -hr * 1.02, -hr * 0.62, -hr * 1.02, -hr * 0.80, -hr * 0.50);
  ctx.closePath();
  ctx.fill();
  // 右侧暗面
  ctx.fillStyle = 'rgba(64,56,46,0.22)';
  ctx.beginPath();
  ctx.ellipse(hr * 0.42, hr * 0.05, hr * 0.52, hr * 0.86, 0.12, 0, 6.3);
  ctx.fill();
  // 耳朵
  ctx.fillStyle = skin(0.98);
  ctx.beginPath();
  ctx.ellipse(-hr * 0.84, hr * 0.06, hr * 0.14, hr * 0.22, 0.1, 0, 6.3);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hr * 0.84, hr * 0.06, hr * 0.14, hr * 0.22, -0.1, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = skinDeep(0.4);
  ctx.lineWidth = Math.max(0.8, S * 0.0018);
  ctx.beginPath();
  ctx.arc(-hr * 0.84, hr * 0.06, hr * 0.09, 0.6, 2.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hr * 0.84, hr * 0.06, hr * 0.09, -2.4, -0.6);
  ctx.stroke();

  // 鼓起的腮帮子：只在黑白照片里留一点暗部的体积
  ctx.fillStyle = 'rgba(176,164,148,0.22)';
  ctx.beginPath();
  ctx.ellipse(-hr * 0.46, hr * 0.34, hr * 0.32, hr * 0.26, 0.12, 0, 6.3);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hr * 0.46, hr * 0.34, hr * 0.32, hr * 0.26, -0.12, 0, 6.3);
  ctx.fill();
  // 腮边的阴影，撑出鼓胀感
  ctx.fillStyle = 'rgba(88,78,66,0.14)';
  ctx.beginPath();
  ctx.ellipse(-hr * 0.60, hr * 0.46, hr * 0.24, hr * 0.14, 0.3, 0, 6.3);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hr * 0.60, hr * 0.46, hr * 0.24, hr * 0.14, -0.3, 0, 6.3);
  ctx.fill();

  // 眯起的眼睛与眉：细而软，像照片里定格的笑闹
  ctx.strokeStyle = 'rgba(54,46,38,0.62)';
  ctx.lineWidth = Math.max(0.9, S * 0.0022);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-hr * 0.40, -hr * 0.05);
  ctx.quadraticCurveTo(-hr * 0.28, -hr * 0.13, -hr * 0.16, -hr * 0.05);
  ctx.moveTo(hr * 0.16, -hr * 0.05);
  ctx.quadraticCurveTo(hr * 0.28, -hr * 0.13, hr * 0.40, -hr * 0.05);
  ctx.stroke();
  // 眼尾一点点睫毛
  ctx.lineWidth = Math.max(0.7, S * 0.0012);
  ctx.strokeStyle = 'rgba(54,46,38,0.30)';
  ctx.beginPath();
  ctx.moveTo(-hr * 0.17, -hr * 0.05);
  ctx.lineTo(-hr * 0.14, -hr * 0.00);
  ctx.moveTo(hr * 0.17, -hr * 0.05);
  ctx.lineTo(hr * 0.14, -hr * 0.00);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(64,54,44,0.38)';
  ctx.lineWidth = Math.max(0.8, S * 0.002);
  ctx.beginPath();
  ctx.moveTo(-hr * 0.45, -hr * 0.27);
  ctx.quadraticCurveTo(-hr * 0.31, -hr * 0.34, -hr * 0.18, -hr * 0.27);
  ctx.moveTo(hr * 0.18, -hr * 0.27);
  ctx.quadraticCurveTo(hr * 0.31, -hr * 0.34, hr * 0.45, -hr * 0.27);
  ctx.stroke();
  // 鼻影
  ctx.strokeStyle = 'rgba(98,88,74,0.34)';
  ctx.lineWidth = Math.max(0.8, S * 0.002);
  ctx.beginPath();
  ctx.moveTo(-hr * 0.05, hr * 0.10);
  ctx.quadraticCurveTo(-hr * 0.09, hr * 0.22, hr * 0.01, hr * 0.24);
  ctx.stroke();
  // 做鬼脸的嘴：歪着嘴、抿着笑，只露出一线牙，不做夸张的圆口
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-hr * 0.20, hr * 0.50);
  ctx.quadraticCurveTo(-hr * 0.02, hr * 0.565, hr * 0.22, hr * 0.475);
  ctx.quadraticCurveTo(hr * 0.03, hr * 0.605, -hr * 0.20, hr * 0.50);
  ctx.closePath();
  ctx.fillStyle = 'rgba(66,44,36,0.62)';
  ctx.fill();
  // 上唇下的一线牙
  ctx.clip();
  ctx.fillStyle = 'rgba(224,216,202,0.62)';
  ctx.beginPath();
  ctx.ellipse(hr * 0.01, hr * 0.512, hr * 0.20, hr * 0.020, -0.10, 0, 6.3);
  ctx.fill();
  ctx.restore();
  // 嘴角的褶皱与下唇高光
  ctx.strokeStyle = 'rgba(90,70,56,0.42)';
  ctx.lineWidth = Math.max(0.8, S * 0.0016);
  ctx.beginPath();
  ctx.moveTo(-hr * 0.21, hr * 0.49);
  ctx.quadraticCurveTo(-hr * 0.29, hr * 0.50, -hr * 0.31, hr * 0.55);
  ctx.moveTo(hr * 0.23, hr * 0.47);
  ctx.quadraticCurveTo(hr * 0.30, hr * 0.46, hr * 0.32, hr * 0.50);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(210,200,184,0.30)';
  ctx.beginPath();
  ctx.moveTo(-hr * 0.10, hr * 0.585);
  ctx.quadraticCurveTo(hr * 0.04, hr * 0.615, hr * 0.17, hr * 0.585);
  ctx.stroke();
  // 下巴的阴影
  ctx.fillStyle = 'rgba(80,72,60,0.14)';
  ctx.beginPath();
  ctx.ellipse(0, hr * 0.80, hr * 0.30, hr * 0.10, 0, 0, 6.3);
  ctx.fill();

  // 蓬松的卷短发
  const hair = 'rgba(30,25,21,0.98)';
  ctx.fillStyle = hair;
  // 额前的发际：卷曲的边缘
  ctx.beginPath();
  ctx.moveTo(-hr * 0.90, hr * 0.10);
  ctx.bezierCurveTo(-hr * 1.06, -hr * 0.55, -hr * 0.76, -hr * 1.16, 0, -hr * 1.10);
  ctx.bezierCurveTo(hr * 0.76, -hr * 1.16, hr * 1.06, -hr * 0.55, hr * 0.90, hr * 0.10);
  ctx.quadraticCurveTo(hr * 0.78, -hr * 0.16, hr * 0.66, -hr * 0.34);
  ctx.quadraticCurveTo(hr * 0.54, -hr * 0.12, hr * 0.40, -hr * 0.36);
  ctx.quadraticCurveTo(hr * 0.22, -hr * 0.10, 0, -hr * 0.38);
  ctx.quadraticCurveTo(-hr * 0.22, -hr * 0.10, -hr * 0.40, -hr * 0.36);
  ctx.quadraticCurveTo(-hr * 0.54, -hr * 0.12, -hr * 0.66, -hr * 0.34);
  ctx.quadraticCurveTo(-hr * 0.78, -hr * 0.16, -hr * 0.90, hr * 0.10);
  ctx.closePath();
  ctx.fill();
  // 外缘的卷团：大小不一
  const curls = [
    [-0.86, -0.28, 0.20], [-0.72, -0.62, 0.24], [-0.48, -0.88, 0.26],
    [-0.18, -1.00, 0.23], [0.14, -1.01, 0.25], [0.44, -0.90, 0.24],
    [0.70, -0.64, 0.22], [0.86, -0.30, 0.19], [0.94, 0.02, 0.14],
    [-0.94, 0.02, 0.14],
  ];
  for (const [cx, cy, cr] of curls) {
    ctx.beginPath();
    ctx.arc(hr * cx, hr * cy, hr * cr, 0, 6.3);
    ctx.fill();
  }
  // 卷发上的光：细碎的弧线
  ctx.strokeStyle = 'rgba(176,168,152,0.22)';
  ctx.lineWidth = Math.max(0.8, S * 0.0018);
  for (let i = 0; i < 8; i++) {
    const a = -2.9 + i * 0.36;
    const cx = Math.cos(a) * hr * 0.82;
    const cy = Math.sin(a) * hr * 0.88;
    ctx.beginPath();
    ctx.arc(cx, cy, hr * 0.15, a + 2.4, a + 4.2);
    ctx.stroke();
  }
  // 侧边的碎发
  ctx.strokeStyle = 'rgba(36,30,25,0.9)';
  ctx.lineWidth = Math.max(1, S * 0.003);
  ctx.beginPath();
  ctx.moveTo(-hr * 0.88, -hr * 0.08);
  ctx.quadraticCurveTo(-hr * 0.98, hr * 0.14, -hr * 0.90, hr * 0.30);
  ctx.moveTo(hr * 0.88, -hr * 0.08);
  ctx.quadraticCurveTo(hr * 0.98, hr * 0.14, hr * 0.90, hr * 0.30);
  ctx.stroke();
  ctx.restore();

  // 曝光感：从左上打进来的旧日光
  const sun = ctx.createRadialGradient(ix + iw * 0.18, iy + ih * 0.18, 0, ix + iw * 0.18, iy + ih * 0.18, iw * 0.9);
  sun.addColorStop(0, 'rgba(255,250,236,0.18)');
  sun.addColorStop(0.45, 'rgba(255,248,230,0.05)');
  sun.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(ix, iy, iw, ih);

  // 旧照片的柔焦：整体压一层灰雾，弱化五官边缘
  ctx.fillStyle = 'rgba(206,200,188,0.06)';
  ctx.fillRect(ix, iy, iw, ih);
  // 暗角
  const vig = ctx.createRadialGradient(ix + iw / 2, iy + ih * 0.48, ih * 0.22, ix + iw / 2, iy + ih * 0.48, ih * 0.92);
  vig.addColorStop(0, 'rgba(20,16,12,0)');
  vig.addColorStop(0.7, 'rgba(20,16,12,0.18)');
  vig.addColorStop(1, 'rgba(16,12,9,0.52)');
  ctx.fillStyle = vig;
  ctx.fillRect(ix, iy, iw, ih);

  // 银盐颗粒
  for (let i = 0; i < 320; i++) {
    const gx = ix + Math.abs(Math.sin(i * 12.9898)) * iw;
    const gy = iy + Math.abs(Math.sin(i * 78.233)) * ih;
    const a = 0.04 + (i % 5) * 0.015;
    ctx.fillStyle = i % 3 ? `rgba(255,250,238,${a})` : `rgba(20,16,12,${a})`;
    ctx.fillRect(gx, gy, Math.max(0.6, S * 0.0022), Math.max(0.6, S * 0.0022));
  }
  // 老照片折痕（只在右下角，避开人脸）
  ctx.strokeStyle = 'rgba(246,238,220,0.14)';
  ctx.lineWidth = Math.max(1, S * 0.0016);
  ctx.beginPath();
  ctx.moveTo(ix + iw * 0.66, iy + ih * 0.52);
  ctx.lineTo(ix + iw * 0.99, iy + ih * 0.94);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(30,24,18,0.10)';
  ctx.beginPath();
  ctx.moveTo(ix + iw * 0.66 + S * 0.004, iy + ih * 0.52);
  ctx.lineTo(ix + iw * 0.99 + S * 0.004, iy + ih * 0.94);
  ctx.stroke();

  ctx.restore();

  // 相纸内框
  ctx.strokeStyle = 'rgba(120,102,76,0.35)';
  ctx.lineWidth = Math.max(1, S * 0.0025);
  ctx.strokeRect(ix - 1, iy - 1, iw + 2, ih + 2);

  // 右下角磨损、卷边
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(198,184,158,0.9)';
  ctx.beginPath();
  ctx.moveTo(w / 2 - S * 0.10, -h / 2 + S * 0.004);
  ctx.lineTo(w / 2, -h / 2 + S * 0.06);
  ctx.lineTo(w / 2, -h / 2 + S * 0.035);
  ctx.closePath();
  ctx.fill();
  // 底边磨损
  ctx.fillStyle = 'rgba(176,158,126,0.55)';
  ctx.beginPath();
  ctx.ellipse(w / 2 - S * 0.15, h / 2 - S * 0.012, S * 0.06, S * 0.012, 0, 0, 6.3);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-w / 2 + S * 0.18, h / 2 - S * 0.008, S * 0.045, S * 0.01, 0.2, 0, 6.3);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}


function drawPaper(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.translate(0, -S * 0.044);
  ctx.rotate(0.035);
  const w = S * 0.64, h = S * 0.82;

  // 后面散落的另一张
  ctx.save();
  ctx.rotate(0.09);
  ctx.translate(S * 0.035, S * 0.02);
  ctx.fillStyle = 'rgba(206,210,206,0.72)';
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.004);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,128,124,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, -h * 0.3 + i * h * 0.09);
    ctx.lineTo(w * 0.4, -h * 0.3 + i * h * 0.09);
    ctx.stroke();
  }
  ctx.restore();

  // 主表投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = S * 0.13;
  ctx.shadowOffsetY = S * 0.045;
  const sheet = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  sheet.addColorStop(0, '#f2f2ea');
  sheet.addColorStop(0.55, '#e8e9e1');
  sheet.addColorStop(1, '#d8dad0');
  ctx.fillStyle = sheet;
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.004);
  ctx.fill();
  ctx.restore();

  // 纸纤维与旧印泥透背
  for (let i = 0; i < 40; i++) {
    const fx = -w / 2 + Math.abs(Math.sin(i * 4.7)) * w;
    const fy = -h / 2 + Math.abs(Math.sin(i * 8.3)) * h;
    ctx.fillStyle = `rgba(140,146,136,${0.03 + (i % 4) * 0.012})`;
    ctx.fillRect(fx, fy, S * 0.004 + (i % 3) * S * 0.003, 1);
  }
  // 上一枚褪色的圆形受理章（透背）
  ctx.save();
  ctx.strokeStyle = 'rgba(168,72,60,0.16)';
  ctx.lineWidth = Math.max(0.8, S * 0.002);
  ctx.beginPath();
  ctx.arc(w * 0.30, -h * 0.335, S * 0.055, 0, 6.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w * 0.30, -h * 0.335, S * 0.040, 0, 6.3);
  ctx.stroke();
  ctx.fillStyle = 'rgba(168,72,60,0.13)';
  ctx.font = `${Math.max(5, S * 0.012)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('受', w * 0.30, -h * 0.335 - S * 0.002);
  ctx.fillText('理', w * 0.30, -h * 0.335 + S * 0.012);
  ctx.textAlign = 'left';
  ctx.restore();

  const ink = 'rgba(52,62,72,0.78)';
  const line = 'rgba(74,88,98,0.38)';

  // 页眉双线
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1, S * 0.0022);
  ctx.beginPath();
  ctx.moveTo(-w * 0.44, -h * 0.455);
  ctx.lineTo(w * 0.44, -h * 0.455);
  ctx.moveTo(-w * 0.44, -h * 0.442);
  ctx.lineTo(w * 0.44, -h * 0.442);
  ctx.stroke();

  // 校名与表格编号
  ctx.fillStyle = ink;
  ctx.font = `${Math.max(7, S * 0.019)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('私立白鸥学园', -w * 0.42, -h * 0.47);
  ctx.textAlign = 'right';
  ctx.font = `${Math.max(6, S * 0.015)}px "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = 'rgba(52,62,72,0.55)';
  ctx.fillText('No. 0417', w * 0.42, -h * 0.47);
  ctx.textAlign = 'left';

  // 标题
  ctx.fillStyle = 'rgba(40,50,60,0.85)';
  ctx.font = `600 ${Math.max(10, S * 0.030)}px "Microsoft YaHei", serif`;
  ctx.textAlign = 'center';
  ctx.fillText('転 校 申 請 書', 0, -h * 0.365);
  ctx.font = `${Math.max(6, S * 0.013)}px "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = 'rgba(60,72,82,0.5)';
  ctx.fillText('（转学申请表）', 0, -h * 0.332);
  ctx.textAlign = 'left';

  // 证件照框
  const px = -w * 0.40, py = -h * 0.295, pw = w * 0.20, ph = h * 0.20;
  ctx.strokeStyle = 'rgba(74,88,98,0.5)';
  ctx.lineWidth = Math.max(1, S * 0.002);
  ctx.strokeRect(px, py, pw, ph);
  ctx.fillStyle = 'rgba(90,102,110,0.10)';
  ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
  // 照片框内的斜纹与水印
  ctx.save();
  ctx.beginPath();
  ctx.rect(px + 1, py + 1, pw - 2, ph - 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(90,102,110,0.16)';
  for (let i = -1; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(px + pw * i / 4, py + ph);
    ctx.lineTo(px + pw * (i + 2) / 4, py);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(60,72,82,0.30)';
  ctx.font = `${Math.max(5, S * 0.011)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('照 片', px + pw / 2, py + ph - S * 0.008);
  ctx.textAlign = 'left';

  // 字段行
  const field = (fy, label, value, valueColor) => {
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1, S * 0.0018);
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, fy + h * 0.052);
    ctx.lineTo(w * 0.42, fy + h * 0.052);
    ctx.stroke();
    ctx.fillStyle = 'rgba(66,78,88,0.62)';
    ctx.font = `${Math.max(7, S * 0.016)}px "Microsoft YaHei", sans-serif`;
    ctx.fillText(label, -w * 0.40, fy);
    if (value) {
      ctx.fillStyle = valueColor || 'rgba(48,58,70,0.72)';
      ctx.font = `${Math.max(8, S * 0.021)}px "Microsoft YaHei", sans-serif`;
      ctx.fillText(value, -w * 0.14, fy + S * 0.002);
    }
  };
  const fy0 = -h * 0.055;
  field(fy0, '氏　名', '白 石 葵', 'rgba(30,44,62,0.92)');
  field(fy0 + h * 0.075, '生年月日', '2003 年 4 月 12 日');
  field(fy0 + h * 0.150, '現住所', '东京都武藏野市……');
  field(fy0 + h * 0.225, '保護者', '白石 雅美');
  field(fy0 + h * 0.300, '転入先', '私立白鸥学园 二年三组');

  // 姓名下方的粗划线，突出手写感
  ctx.strokeStyle = 'rgba(38,52,70,0.55)';
  ctx.lineWidth = Math.max(1.2, S * 0.003);
  ctx.beginPath();
  ctx.moveTo(-w * 0.145, fy0 + S * 0.012);
  ctx.lineTo(w * 0.02, fy0 + S * 0.012);
  ctx.stroke();

  // 勾选栏
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1, S * 0.0018);
  const cy = h * 0.335;
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, cy + h * 0.045);
  ctx.lineTo(w * 0.42, cy + h * 0.045);
  ctx.stroke();
  ctx.fillStyle = 'rgba(66,78,88,0.62)';
  ctx.font = `${Math.max(6, S * 0.014)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('转学理由', -w * 0.40, cy);
  const reasons = ['家庭迁移', '健康原因', '其他'];
  reasons.forEach((t, i) => {
    const cx = -w * 0.40 + i * w * 0.26;
    ctx.strokeStyle = 'rgba(60,74,86,0.55)';
    ctx.strokeRect(cx, cy + h * 0.012, S * 0.018, S * 0.018);
    if (i === 0) {
      // 打勾
      ctx.beginPath();
      ctx.moveTo(cx + S * 0.003, cy + h * 0.021);
      ctx.lineTo(cx + S * 0.008, cy + h * 0.027);
      ctx.lineTo(cx + S * 0.017, cy + h * 0.013);
      ctx.strokeStyle = 'rgba(30,44,62,0.85)';
      ctx.lineWidth = Math.max(1.2, S * 0.0028);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(50,62,74,0.6)';
    ctx.fillText(t, cx + S * 0.024, cy + h * 0.026);
  });

  // 监护人签名栏与日期
  ctx.fillStyle = 'rgba(66,78,88,0.55)';
  ctx.font = `${Math.max(6, S * 0.014)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('保護者署名', -w * 0.40, h * 0.415);
  ctx.strokeStyle = 'rgba(60,74,86,0.28)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.22, h * 0.435);
  ctx.lineTo(w * 0.10, h * 0.435);
  ctx.stroke();
  ctx.fillText('8 月 31 日', w * 0.16, h * 0.413);

  // 受理红印
  ctx.save();
  ctx.translate(w * 0.29, h * 0.438);
  ctx.rotate(-0.28);
  ctx.strokeStyle = 'rgba(168,52,44,0.62)';
  ctx.lineWidth = Math.max(1.4, S * 0.0042);
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.043, 0, 6.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.037, 0, 6.3);
  ctx.strokeStyle = 'rgba(168,52,44,0.4)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(168,52,44,0.7)';
  ctx.font = `600 ${Math.max(6, S * 0.015)}px "Microsoft YaHei", serif`;
  ctx.textAlign = 'center';
  ctx.fillText('受 理', 0, S * 0.005);
  ctx.textAlign = 'left';
  ctx.restore();

  // 折痕
  const foldY = -h * 0.02;
  const fold = ctx.createLinearGradient(0, foldY - S * 0.008, 0, foldY + S * 0.008);
  fold.addColorStop(0, 'rgba(110,116,106,0)');
  fold.addColorStop(0.5, 'rgba(110,116,106,0.16)');
  fold.addColorStop(1, 'rgba(255,255,248,0.18)');
  ctx.fillStyle = fold;
  ctx.fillRect(-w / 2, foldY - S * 0.008, w, S * 0.016);

  // 边缘磨损与纸角
  ctx.strokeStyle = 'rgba(120,126,116,0.4)';
  ctx.lineWidth = Math.max(1, S * 0.002);
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.004);
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,202,190,0.85)';
  ctx.beginPath();
  ctx.moveTo(-w / 2, h / 2 - S * 0.09);
  ctx.lineTo(-w / 2 + S * 0.04, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();

  // 落在表上的微光与细尘
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  lg.addColorStop(0, 'rgba(255,246,220,0.10)');
  lg.addColorStop(0.4, 'rgba(255,246,220,0.02)');
  lg.addColorStop(1, 'rgba(255,246,220,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  for (let i = 0; i < 6; i++) {
    const dx = Math.sin(time * 0.4 + i * 1.7) * S * 0.3;
    const dy = Math.cos(time * 0.3 + i * 1.1) * S * 0.22;
    ctx.fillStyle = hexA(p.glow, 0.10);
    ctx.beginPath();
    ctx.arc(dx, dy, S * 0.0035, 0, 6.3);
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}


function drawLetter(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.025);
  const w = S * 0.60, h = S * 0.88;

  // 投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = S * 0.14;
  ctx.shadowOffsetY = S * 0.05;
  ctx.fillStyle = '#f0e7d2';
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.003);
  ctx.fill();
  ctx.restore();

  // 信纸：温暖的米白，四角微翘
  const sheet = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  sheet.addColorStop(0, '#f6eeda');
  sheet.addColorStop(0.45, '#efe5cd');
  sheet.addColorStop(0.8, '#e4d7bc');
  sheet.addColorStop(1, '#d6c8ab');
  ctx.fillStyle = sheet;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2 + S * 0.006);
  ctx.quadraticCurveTo(0, -h / 2 - S * 0.004, w / 2, -h / 2 + S * 0.004);
  ctx.lineTo(w / 2 - S * 0.004, h / 2 - S * 0.006);
  ctx.quadraticCurveTo(0, h / 2 + S * 0.003, -w / 2 + S * 0.004, h / 2 - S * 0.004);
  ctx.closePath();
  ctx.fill();

  // 纸纤维与陈旧的斑
  for (let i = 0; i < 60; i++) {
    const fx = -w / 2 + Math.abs(Math.sin(i * 3.9 + 1)) * w;
    const fy = -h / 2 + Math.abs(Math.sin(i * 7.7)) * h;
    ctx.fillStyle = `rgba(150,128,92,${0.025 + (i % 4) * 0.008})`;
    ctx.fillRect(fx, fy, S * 0.006 + (i % 3) * S * 0.004, 1);
  }
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgba(160,130,88,${0.035 + i * 0.008})`;
    ctx.beginPath();
    ctx.ellipse(
      -w * 0.28 + i * w * 0.18, -h * 0.34 + (i % 2) * h * 0.62,
      S * (0.02 + i * 0.008), S * (0.012 + (i % 3) * 0.007), i * 0.7, 0, 6.3,
    );
    ctx.fill();
  }

  // 折痕：横向两道、纵向一道，像被仔细折好又展开
  const crease = (x1, y1, x2, y2, alpha) => {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.hypot(x2 - x1, y2 - y1);
    ctx.save();
    ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
    ctx.rotate(ang);
    const cg = ctx.createLinearGradient(0, -S * 0.006, 0, S * 0.006);
    cg.addColorStop(0, 'rgba(120,100,70,0)');
    cg.addColorStop(0.48, `rgba(120,100,70,${alpha})`);
    cg.addColorStop(0.52, 'rgba(255,252,240,0.35)');
    cg.addColorStop(1, 'rgba(120,100,70,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(-len / 2, -S * 0.006, len, S * 0.012);
    ctx.restore();
  };
  crease(-w / 2 + S * 0.01, -h * 0.165, w / 2 - S * 0.01, -h * 0.172, 0.16);
  crease(-w / 2 + S * 0.01, h * 0.165, w / 2 - S * 0.01, h * 0.158, 0.16);
  crease(-w * 0.04, -h / 2 + S * 0.01, -w * 0.02, h / 2 - S * 0.01, 0.07);

  // 右上角的日期
  ctx.fillStyle = 'rgba(56,62,78,0.55)';
  ctx.font = `${Math.max(7, S * 0.016)}px "Microsoft YaHei", serif`;
  ctx.textAlign = 'right';
  ctx.fillText('八月三十一日', w * 0.38, -h * 0.395);
  ctx.fillStyle = 'rgba(56,62,78,0.38)';
  ctx.font = `${Math.max(6, S * 0.012)}px "Microsoft YaHei", sans-serif`;
  ctx.fillText('晴', w * 0.38, -h * 0.372);
  ctx.textAlign = 'left';

  // 竖排的字迹：清秀工整的行书
  const lines = [
    '夏目同学へ',
    '你看到这封信的时候',
    '我已经在去东京的列车上了',
    '昨晚在神社听完那盘磁带',
    '心里忽然变得很轻松',
    '原来十年前我们录下的',
    '并不是沉重的约定',
    '只是谢谢你陪我度过',
    '最快乐的那个夏天',
  ];
  const fs = Math.max(7, S * 0.0275);
  ctx.font = `${fs}px "KaiTi","STKaiti","Yu Mincho","SimSun","Microsoft YaHei",serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(44,54,76,0.62)';
  const chColX = w * 0.31;
  const topY = -h * 0.315;
  const gap = fs * 1.30;
  for (let c = 0; c < lines.length; c++) {
    const colX = chColX - c * S * 0.049;
    const text = lines[c];
    for (let r = 0; r < text.length; r++) {
      const jx = Math.sin(c * 2.1 + r * 1.6) * S * 0.0013;
      const jy = Math.cos(c * 1.4 + r * 0.8) * S * 0.0010;
      ctx.fillStyle = `rgba(44,54,76,${0.56 + ((c * 7 + r * 3) % 4) * 0.035})`;
      ctx.fillText(text[r], colX + jx, topY + r * gap + jy);
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // 左下的落款：白石 葵
  ctx.fillStyle = 'rgba(40,52,78,0.72)';
  ctx.font = `${Math.max(9, S * 0.025)}px "Microsoft YaHei", serif`;
  ctx.textAlign = 'left';
  const sigX = -w * 0.40;
  ctx.fillText('白', sigX, h * 0.285);
  ctx.fillText('石', sigX, h * 0.285 + S * 0.036);
  ctx.fillText('葵', sigX, h * 0.285 + S * 0.072);
  // 落款旁的小纸飞机
  ctx.strokeStyle = 'rgba(74,120,160,0.42)';
  ctx.fillStyle = 'rgba(120,166,200,0.20)';
  ctx.lineWidth = Math.max(0.8, S * 0.002);
  ctx.beginPath();
  ctx.moveTo(-w * 0.12, h * 0.385);
  ctx.lineTo(w * 0.02, h * 0.345);
  ctx.lineTo(-w * 0.055, h * 0.362);
  ctx.lineTo(-w * 0.065, h * 0.385);
  ctx.lineTo(-w * 0.055, h * 0.362);
  ctx.lineTo(-w * 0.045, h * 0.395);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 纸边卷曲
  ctx.strokeStyle = 'rgba(150,128,92,0.35)';
  ctx.lineWidth = Math.max(1, S * 0.0018);
  ctx.beginPath();
  ctx.moveTo(-w / 2 + S * 0.006, -h / 2 + S * 0.012);
  ctx.quadraticCurveTo(0, -h / 2 - S * 0.002, w / 2 - S * 0.006, -h / 2 + S * 0.011);
  ctx.stroke();
  ctx.fillStyle = 'rgba(214,200,172,0.9)';
  ctx.beginPath();
  ctx.moveTo(w / 2 - S * 0.002, -h / 2 + S * 0.004);
  ctx.lineTo(w / 2, -h / 2 + S * 0.03);
  ctx.lineTo(w / 2 - S * 0.03, -h / 2 + S * 0.004);
  ctx.closePath();
  ctx.fill();

  // 晨光落在纸面上
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createLinearGradient(-w / 2, -h / 2, w * 0.3, h / 2);
  lg.addColorStop(0, 'rgba(255,240,206,0.10)');
  lg.addColorStop(0.5, 'rgba(255,240,206,0.03)');
  lg.addColorStop(1, 'rgba(255,240,206,0)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2 + S * 0.006);
  ctx.quadraticCurveTo(0, -h / 2 - S * 0.004, w / 2, -h / 2 + S * 0.004);
  ctx.lineTo(w / 2 - S * 0.004, h / 2 - S * 0.006);
  ctx.quadraticCurveTo(0, h / 2 + S * 0.003, -w / 2 + S * 0.004, h / 2 - S * 0.004);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const dx = Math.sin(time * 0.35 + i * 2.1) * S * 0.28;
    const dy = Math.cos(time * 0.28 + i * 1.4) * S * 0.2;
    ctx.fillStyle = hexA(p.glow, 0.09);
    ctx.beginPath();
    ctx.arc(dx, dy, S * 0.0032, 0, 6.3);
    ctx.fill();
  }
  ctx.restore();

  // 纸面上浅浅的投影，让信纸贴合桌面
  ctx.restore();
}


function drawToken(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.16);

  const w = S * 0.30, h = S * 0.56;
  const tw = S * 0.035; // 令牌厚度

  // 落在画案上的投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = S * 0.10;
  ctx.shadowOffsetX = S * 0.045;
  ctx.shadowOffsetY = S * 0.035;
  ctx.fillStyle = 'rgba(12,12,16,0.9)';
  rr(ctx, -w / 2 + tw, -h / 2 + tw, w, h, S * 0.024);
  ctx.fill();
  ctx.restore();

  // 令牌厚度（右下侧面）
  const side = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  side.addColorStop(0, '#1c1e24');
  side.addColorStop(0.5, '#2c2f38');
  side.addColorStop(1, '#111318');
  ctx.fillStyle = side;
  rr(ctx, -w / 2 + tw * 0.7, -h / 2 + tw * 0.7, w, h, S * 0.024);
  ctx.fill();

  // 令牌主面：玄铁的冷黑，带一点锈青
  const iron = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  iron.addColorStop(0, '#3e4450');
  iron.addColorStop(0.22, '#272b34');
  iron.addColorStop(0.55, '#181b22');
  iron.addColorStop(0.82, '#23262e');
  iron.addColorStop(1, '#0e1014');
  ctx.fillStyle = iron;
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.024);
  ctx.fill();

  // 铁面的斑驳锈迹
  const patina = (px, py, pr, a) => {
    const pg = ctx.createRadialGradient(px, py, 0, px, py, pr);
    pg.addColorStop(0, `rgba(96,118,116,${a})`);
    pg.addColorStop(0.6, `rgba(70,92,92,${a * 0.5})`);
    pg.addColorStop(1, 'rgba(60,80,80,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, 6.3);
    ctx.fill();
  };
  patina(-w * 0.26, -h * 0.30, S * 0.07, 0.20);
  patina(w * 0.20, h * 0.34, S * 0.09, 0.16);
  patina(w * 0.18, -h * 0.12, S * 0.045, 0.22);
  patina(-w * 0.18, h * 0.18, S * 0.05, 0.14);

  // 边缘凹槽
  ctx.strokeStyle = 'rgba(120,130,140,0.30)';
  ctx.lineWidth = Math.max(1, S * 0.003);
  rr(ctx, -w * 0.44, -h * 0.46, w * 0.88, h * 0.92, S * 0.020);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(8,9,12,0.85)';
  ctx.lineWidth = Math.max(1, S * 0.004);
  rr(ctx, -w * 0.42, -h * 0.44, w * 0.84, h * 0.88, S * 0.018);
  ctx.stroke();
  // 内槽上的高光
  ctx.strokeStyle = 'rgba(190,200,212,0.20)';
  ctx.lineWidth = Math.max(0.8, S * 0.0018);
  ctx.beginPath();
  ctx.moveTo(-w * 0.41, -h * 0.32);
  ctx.lineTo(-w * 0.41, h * 0.28);
  ctx.stroke();

  // 云纹角饰
  const cloud = (cx, cy, sx, sy) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.strokeStyle = 'rgba(132,142,156,0.34)';
    ctx.lineWidth = Math.max(1, S * 0.0026);
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.030, Math.PI * 0.15, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(S * 0.020, -S * 0.010, S * 0.015, Math.PI * 0.4, Math.PI * 1.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-S * 0.040, S * 0.020);
    ctx.quadraticCurveTo(-S * 0.010, S * 0.042, S * 0.030, S * 0.028);
    ctx.stroke();
    ctx.restore();
  };
  cloud(-w * 0.18, -h * 0.33, 1, 1);
  cloud(w * 0.18, -h * 0.33, -1, 1);
  cloud(-w * 0.18, h * 0.33, 1, -1);
  cloud(w * 0.18, h * 0.33, -1, -1);

  // 顶部穿绳的孔
  ctx.fillStyle = 'rgba(6,7,10,0.95)';
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.395, w * 0.10, w * 0.072, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,158,170,0.30)';
  ctx.lineWidth = Math.max(1, S * 0.0022);
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.402, w * 0.10, w * 0.072, 0, Math.PI * 0.9, Math.PI * 2.05);
  ctx.stroke();

  // 中央阴刻“令”字：先刻痕，再压高光
  const glyphY = h * 0.015;
  ctx.save();
  ctx.translate(0, glyphY);
  ctx.font = `700 ${Math.max(18, S * 0.155)}px "KaiTi", "STKaiti", "Microsoft YaHei", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(4,5,8,0.92)';
  ctx.fillText('令', S * 0.004, S * 0.005);
  // 刻痕外沿的冷光
  ctx.fillStyle = 'rgba(150,164,180,0.30)';
  ctx.fillText('令', -S * 0.003, -S * 0.004);
  // 字口里的锈色
  ctx.fillStyle = 'rgba(96,116,112,0.20)';
  ctx.fillText('令', 0, 0);
  ctx.restore();

  // 字下的小篆铭文
  ctx.fillStyle = 'rgba(138,148,160,0.38)';
  ctx.font = `${Math.max(6, S * 0.015)}px "Microsoft YaHei", serif`;
  ctx.textAlign = 'center';
  ctx.fillText('玄 铁', 0, h * 0.245);
  ctx.textAlign = 'left';

  // 红绳与流苏
  ctx.strokeStyle = 'rgba(128,38,42,0.95)';
  ctx.lineWidth = Math.max(1.4, S * 0.006);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w * 0.03, -h * 0.43);
  ctx.quadraticCurveTo(w * 0.06, -h * 0.50, w * 0.13, -h * 0.44);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.03, -h * 0.43);
  ctx.quadraticCurveTo(w * 0.12, -h * 0.47, w * 0.16, -h * 0.40);
  ctx.stroke();
  // 绳结
  ctx.fillStyle = 'rgba(150,44,48,0.95)';
  ctx.beginPath();
  ctx.arc(w * 0.15, -h * 0.415, S * 0.011, 0, 6.3);
  ctx.fill();
  // 流苏垂落
  ctx.strokeStyle = 'rgba(136,40,44,0.9)';
  ctx.lineWidth = Math.max(1, S * 0.0032);
  for (let i = 0; i < 9; i++) {
    const spread = (i - 4) * S * 0.0042;
    const sway = Math.sin(time * 0.8 + i * 0.6) * S * 0.004;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, -h * 0.400);
    ctx.quadraticCurveTo(
      w * 0.15 + spread * 0.4 + sway, -h * 0.34,
      w * 0.15 + spread + sway, -h * 0.285 + Math.abs(i - 4) * S * 0.0025,
    );
    ctx.stroke();
  }
  // 流苏顶端的金箍
  ctx.fillStyle = 'rgba(168,140,78,0.8)';
  ctx.fillRect(w * 0.135, -h * 0.405, S * 0.030, S * 0.012);

  // 铜锈与刃口的高光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glint = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  glint.addColorStop(0, 'rgba(196,214,236,0.10)');
  glint.addColorStop(0.35, 'rgba(196,214,236,0.02)');
  glint.addColorStop(0.5, 'rgba(196,214,236,0)');
  ctx.fillStyle = glint;
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.024);
  ctx.fill();
  // 烛火在铁面上的跳动反光
  const flick = 0.5 + 0.5 * Math.sin(time * 1.7);
  const spot = ctx.createRadialGradient(w * 0.16, -h * 0.10, 0, w * 0.16, -h * 0.10, S * 0.14);
  spot.addColorStop(0, hexA(p.glow, 0.22 + flick * 0.10));
  spot.addColorStop(1, hexA(p.glow, 0));
  ctx.fillStyle = spot;
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.024);
  ctx.fill();
  ctx.restore();

  // 描边
  ctx.strokeStyle = 'rgba(4,5,8,0.8)';
  ctx.lineWidth = Math.max(1, S * 0.0025);
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.024);
  ctx.stroke();

  ctx.restore();
}


function drawPaint(ctx, x, y, S, time, p, red) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.12);

  const rx = S * 0.38, ry = S * 0.23;

  // 桌面投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = S * 0.10;
  ctx.shadowOffsetY = S * 0.035;
  ctx.fillStyle = 'rgba(12,8,8,0.55)';
  ctx.beginPath();
  ctx.ellipse(S * 0.015, S * 0.02, rx * 1.02, ry * 1.05, 0, 0, 6.3);
  ctx.fill();
  ctx.restore();

  // 白瓷碟外沿（有厚度）
  const rim = ctx.createLinearGradient(0, -ry, 0, ry);
  rim.addColorStop(0, '#fbf8f0');
  rim.addColorStop(0.45, '#efe9dc');
  rim.addColorStop(0.78, '#d8d0bf');
  rim.addColorStop(1, '#b8ae9c');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.ellipse(0, S * 0.012, rx, ry, 0, 0, 6.3);
  ctx.fill();
  // 侧壁
  ctx.fillStyle = 'rgba(196,188,172,0.85)';
  ctx.beginPath();
  ctx.ellipse(0, S * 0.02, rx, ry, 0, 0, Math.PI);
  ctx.fill();

  // 碟内凹面
  const inner = ctx.createRadialGradient(-rx * 0.15, -ry * 0.2, S * 0.02, 0, 0, rx);
  inner.addColorStop(0, '#fdfbf5');
  inner.addColorStop(0.55, '#f0ebdf');
  inner.addColorStop(0.9, '#ddd5c4');
  inner.addColorStop(1, '#cfc6b4');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.88, ry * 0.80, 0, 0, 6.3);
  ctx.fill();

  // 内壁阴影
  ctx.strokeStyle = 'rgba(150,140,122,0.35)';
  ctx.lineWidth = Math.max(1, S * 0.0035);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.88, ry * 0.80, 0, Math.PI * 0.92, Math.PI * 2.05);
  ctx.stroke();

  // 青花边线
  ctx.strokeStyle = 'rgba(72,104,138,0.45)';
  ctx.lineWidth = Math.max(1, S * 0.0028);
  ctx.beginPath();
  ctx.ellipse(0, S * 0.006, rx * 0.94, ry * 0.90, 0, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(72,104,138,0.22)';
  ctx.lineWidth = Math.max(0.8, S * 0.0016);
  ctx.beginPath();
  ctx.ellipse(0, S * 0.008, rx * 0.90, ry * 0.86, 0, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // 碟心分格：两道浅脊
  const ridge = (ang, len, tilt) => {
    ctx.save();
    ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(158,148,130,0.30)';
    ctx.lineWidth = Math.max(1, S * 0.003);
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.quadraticCurveTo(0, tilt, len, 0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,253,246,0.55)';
    ctx.beginPath();
    ctx.moveTo(-len, -S * 0.003);
    ctx.quadraticCurveTo(0, tilt - S * 0.003, len, -S * 0.003);
    ctx.stroke();
    ctx.restore();
  };
  ridge(0.35, rx * 0.80, ry * 0.14);
  ridge(-0.55, rx * 0.74, ry * 0.12);

  // 四格矿物颜料
  const wells = [
    { a: -2.35, r: 0.55, col: ['#5c7d97', '#3e5b74', '#2c4258'], name: '石青' },
    { a: -1.25, r: 0.52, col: ['#6d8e7f', '#4a6a5c', '#334b41'], name: '石绿' },
    { a: 0.95, r: 0.56, col: red ? ['#b64436', '#86251f', '#55100c'] : ['#a85a4c', '#7d3a32', '#52201b'], name: '朱砂' },
    { a: 2.05, r: 0.55, col: ['#c0a365', '#96793f', '#635028'], name: '雌黄' },
  ];
  wells.forEach((wl, idx) => {
    const wx = Math.cos(wl.a) * rx * wl.r;
    const wy = Math.sin(wl.a) * ry * wl.r * 1.05;
    const pr = S * (0.060 + (idx % 2) * 0.006);
    const pry = pr * 0.72;
    // 碟中的浅坑
    const dep = ctx.createRadialGradient(wx, wy, pr * 0.15, wx, wy, pr * 1.45);
    dep.addColorStop(0, 'rgba(118,108,92,0.20)');
    dep.addColorStop(0.65, 'rgba(118,108,92,0.10)');
    dep.addColorStop(1, 'rgba(118,108,92,0)');
    ctx.fillStyle = dep;
    ctx.beginPath();
    ctx.ellipse(wx, wy, pr * 1.42, pry * 1.42, wl.a * 0.3, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,252,244,0.09)';
    ctx.lineWidth = Math.max(0.8, S * 0.0014);
    ctx.beginPath();
    ctx.ellipse(wx, wy, pr * 1.06, pry * 1.06, wl.a * 0.3, Math.PI * 0.2, Math.PI * 0.9);
    ctx.stroke();
    // 碟面的浅坑边缘
    ctx.strokeStyle = 'rgba(148,138,122,0.20)';
    ctx.lineWidth = Math.max(0.8, S * 0.0017);
    ctx.beginPath();
    ctx.ellipse(wx, wy + pry * 0.06, pr * 1.20, pry * 1.20, wl.a * 0.3, 0, 6.3);
    ctx.stroke();
    // 坑底先铺一层被染色的颜料，避免彩色圆块悬在白碟上
    ctx.fillStyle = hexA(wl.col[2], 0.34);
    ctx.beginPath();
    ctx.ellipse(wx, wy, pr * 1.12, pry * 1.12, wl.a * 0.3, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = hexA(wl.col[1], 0.30);
    ctx.beginPath();
    ctx.ellipse(wx, wy - pry * 0.04, pr * 0.96, pry * 0.96, wl.a * 0.3, 0, 6.3);
    ctx.fill();
    // 粉堆：一圈松散的粉末，中间隆起，像刚研磨过
    const moundPts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 6.283 + idx * 1.3;
      const rr0 = pr * (0.965 + 0.030 * Math.sin(i * 2.3 + idx * 4.1) + 0.015 * Math.sin(i * 5.7));
      moundPts.push([wx + Math.cos(a) * rr0, wy + Math.sin(a) * rr0 * 0.70]);
    }
    ctx.beginPath();
    for (let i = 0; i < moundPts.length; i++) {
      const p0 = moundPts[i], p1 = moundPts[(i + 1) % moundPts.length];
      const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.quadraticCurveTo(p0[0], p0[1], mx, my);
    }
    ctx.closePath();
    ctx.fillStyle = wl.col[1];
    ctx.fill();
    // 受光面：只有很轻的一层，不反光
    const pg = ctx.createLinearGradient(wx - pr * 0.7, wy - pr * 0.6, wx + pr * 0.5, wy + pr * 0.5);
    pg.addColorStop(0, hexA(wl.col[0], 0.38));
    pg.addColorStop(0.45, hexA(wl.col[1], 0.10));
    pg.addColorStop(1, hexA(wl.col[2], 0.34));
    ctx.fillStyle = pg;
    ctx.fill();
    // 粉末堆的圆润隆起（不反光，只有一点体积）
    const dome = ctx.createRadialGradient(wx - pr * 0.16, wy - pr * 0.20, 0, wx, wy, pr * 0.95);
    dome.addColorStop(0, 'rgba(255,250,236,0.055)');
    dome.addColorStop(0.6, 'rgba(255,250,236,0.018)');
    dome.addColorStop(1, 'rgba(255,250,236,0)');
    ctx.fillStyle = dome;
    ctx.fill();
    // 底部贴碟的一圈暗
    ctx.strokeStyle = 'rgba(40,30,24,0.22)';
    ctx.lineWidth = Math.max(0.8, S * 0.0018);
    ctx.stroke();
    // 细密的矿物颗粒：几乎是粉，不是珠
    for (let i = 0; i < 120; i++) {
      const pa = i * 2.399 + idx * 1.7;
      const prr = pr * Math.sqrt((i + 0.5) / 120) * 0.96;
      const px = wx + Math.cos(pa) * prr;
      const py = wy + Math.sin(pa) * prr * 0.66;
      const light = i % 6 === 0;
      const mid = i % 3 === 0;
      ctx.fillStyle = light
        ? hexA(wl.col[0], 0.34)
        : mid ? hexA(wl.col[2], 0.34) : 'rgba(28,22,18,0.22)';
      const gsz = Math.max(0.35, S * (0.0008 + (i % 4) * 0.0005));
      ctx.fillRect(px, py, gsz, gsz);
    }
    // 表层较粗的矿物颗粒，让粉堆表面不再是光滑的球面
    for (let i = 0; i < 26; i++) {
      const pa = i * 2.17 + idx * 0.8;
      const prr = pr * Math.sqrt((i + 0.5) / 26) * 0.9;
      const px = wx + Math.cos(pa) * prr;
      const py = wy + Math.sin(pa) * prr * 0.66;
      ctx.fillStyle = i % 3 === 0 ? hexA(wl.col[0], 0.42) : hexA(wl.col[2], 0.38);
      ctx.beginPath();
      ctx.ellipse(px, py, S * rand(0.0014, 0.0030), S * rand(0.0009, 0.0018), pa, 0, 6.3);
      ctx.fill();
    }
    // 研磨留下的放射状粉痕
    for (let i = 0; i < 11; i++) {
      const a = i * 0.57 + idx * 0.9;
      const r0 = pr * rand(0.10, 0.24), r1 = pr * rand(0.52, 0.80);
      ctx.strokeStyle = i % 2 ? hexA(wl.col[2], 0.16) : hexA(wl.col[0], 0.14);
      ctx.lineWidth = Math.max(0.6, S * 0.0012);
      ctx.beginPath();
      ctx.moveTo(wx + Math.cos(a) * r0, wy + Math.sin(a) * r0 * 0.68);
      ctx.quadraticCurveTo(
        wx + Math.cos(a + 0.12) * (r0 + r1) * 0.5, wy + Math.sin(a + 0.12) * (r0 + r1) * 0.34,
        wx + Math.cos(a) * r1, wy + Math.sin(a) * r1 * 0.68,
      );
      ctx.stroke();
    }
    // 几粒没研开的粗颗粒
    for (let i = 0; i < 4; i++) {
      const a = i * 1.9 + idx * 1.2;
      const rr0 = pr * rand(0.35, 0.62);
      const px = wx + Math.cos(a) * rr0, py = wy + Math.sin(a) * rr0 * 0.68;
      ctx.fillStyle = hexA(wl.col[2], 0.5);
      ctx.beginPath();
      ctx.ellipse(px, py, S * rand(0.0018, 0.0032), S * rand(0.0012, 0.0022), a, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = hexA(wl.col[0], 0.4);
      ctx.beginPath();
      ctx.ellipse(px - S * 0.0008, py - S * 0.0008, S * 0.0013, S * 0.0009, a, 0, 6.3);
      ctx.fill();
    }
    // 堆边散落的粉屑
    for (let i = 0; i < 26; i++) {
      const aa = i * 1.71 + idx * 2.2;
      const dist = pr * (1.08 + (i % 5) * 0.10);
      ctx.fillStyle = hexA(wl.col[i % 2 ? 0 : 1], 0.30);
      const gsz = Math.max(0.35, S * (0.0008 + (i % 3) * 0.0005));
      ctx.fillRect(wx + Math.cos(aa) * dist, wy + Math.sin(aa) * dist * 0.68, gsz, gsz);
    }
  });

  // 粉末整体微微发光（阳光下闪烁）
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sheen = ctx.createRadialGradient(0, -ry * 0.2, 0, 0, -ry * 0.2, rx * 0.9);
  sheen.addColorStop(0, hexA(p.glow, 0.10));
  sheen.addColorStop(1, hexA(p.glow, 0));
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.9, ry * 0.85, 0, 0, 6.3);
  ctx.fill();

  // 漂浮的星芒
  for (let i = 0; i < 10; i++) {
    const ph = i * 1.7;
    const sx = Math.sin(ph * 1.3 + time * 0.35) * rx * 0.62;
    const sy = Math.cos(ph * 0.8 + time * 0.28) * ry * 0.72 - ry * 0.2;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.1 + ph));
    const sz = S * (0.004 + (i % 3) * 0.0025) * tw;
    ctx.strokeStyle = i % 2 ? 'rgba(255,248,214,0.55)' : hexA(p.glow, 0.5);
    ctx.lineWidth = Math.max(0.7, S * 0.0018);
    ctx.beginPath();
    ctx.moveTo(sx - sz, sy); ctx.lineTo(sx + sz, sy);
    ctx.moveTo(sx, sy - sz); ctx.lineTo(sx, sy + sz);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,252,232,0.7)';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(0.5, sz * 0.35), 0, 6.3);
    ctx.fill();
  }
  ctx.restore();

  // 碟沿最亮的细高光
  ctx.strokeStyle = 'rgba(255,255,250,0.65)';
  ctx.lineWidth = Math.max(1, S * 0.0022);
  ctx.beginPath();
  ctx.ellipse(0, S * 0.006, rx * 0.985, ry * 0.975, 0, Math.PI * 1.06, Math.PI * 1.78);
  ctx.stroke();
  // 碟沿的细小冰裂
  ctx.strokeStyle = 'rgba(150,142,126,0.18)';
  ctx.lineWidth = Math.max(0.6, S * 0.0012);
  for (let i = 0; i < 7; i++) {
    const a = 0.4 + i * 0.5;
    const r0 = rx * (0.96 + (i % 2) * 0.02);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * ry * 0.97 + S * 0.006);
    ctx.lineTo(Math.cos(a + 0.06) * r0 * 0.9, Math.sin(a + 0.06) * ry * 0.86 + S * 0.006);
    ctx.stroke();
  }

  ctx.restore();
}


function drawBox(ctx, x, y, S, time, p, open = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.035);

  const w = S * 0.56, h = S * 0.30;
  const lidH = open ? h * 0.42 : h * 0.46;

  // 桌面投影：外圈柔、内圈贴地
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = S * 0.18;
  ctx.shadowOffsetY = S * 0.03;
  ctx.fillStyle = 'rgba(24,12,12,0.38)';
  ctx.beginPath();
  ctx.ellipse(S * 0.01, h * 0.60, w * 0.50, h * 0.17, 0, 0, 6.3);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(14,6,8,0.35)';
  ctx.beginPath();
  ctx.ellipse(S * 0.008, h * 0.60, w * 0.42, h * 0.10, 0, 0, 6.3);
  ctx.fill();

  // 盒身正面：紫檀木
  const wood = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  wood.addColorStop(0, '#4a2320');
  wood.addColorStop(0.16, '#3a1a19');
  wood.addColorStop(0.5, '#2a1113');
  wood.addColorStop(0.78, '#371819');
  wood.addColorStop(1, '#1e0c0e');
  ctx.fillStyle = wood;
  rr(ctx, -w / 2, -h * 0.18, w, h * 0.74, S * 0.012);
  ctx.fill();

  // 木纹
  ctx.save();
  rr(ctx, -w / 2, -h * 0.18, w, h * 0.74, S * 0.012);
  ctx.clip();
  ctx.strokeStyle = 'rgba(96,42,34,0.35)';
  ctx.lineWidth = Math.max(0.8, S * 0.002);
  for (let i = 0; i < 7; i++) {
    const yy = -h * 0.1 + i * h * 0.095;
    ctx.beginPath();
    ctx.moveTo(-w / 2, yy);
    ctx.bezierCurveTo(-w * 0.15, yy + 2.5, w * 0.15, yy - 2.5, w / 2, yy + 1);
    ctx.stroke();
  }
  // 木纹云斑
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(70,28,26,${0.18 + i * 0.03})`;
    ctx.lineWidth = Math.max(1, S * 0.0035);
    ctx.beginPath();
    ctx.ellipse(-w * 0.28 + i * w * 0.18, h * (0.02 + (i % 2) * 0.16), S * 0.09, S * 0.02, 0.08, 0, 6.3);
    ctx.stroke();
  }
  ctx.restore();

  // 底座包边
  ctx.fillStyle = 'rgba(20,9,10,0.9)';
  rr(ctx, -w / 2, h * 0.50, w, h * 0.075, S * 0.006);
  ctx.fill();
  ctx.strokeStyle = 'rgba(146,104,66,0.25)';
  ctx.lineWidth = Math.max(1, S * 0.0018);
  ctx.beginPath();
  ctx.moveTo(-w / 2 + S * 0.01, h * 0.505);
  ctx.lineTo(w / 2 - S * 0.01, h * 0.505);
  ctx.stroke();

  // 铜包角：贴着盒体的 L 形护角
  const corner = (sx, sy) => {
    const bw = S * 0.052, bh = S * 0.014, vlen = S * 0.046;
    const edgeX = sx * w / 2;
    const edgeY = sy > 0 ? h * 0.56 : -h * 0.18;
    const g = ctx.createLinearGradient(edgeX - bw, 0, edgeX + bw, 0);
    g.addColorStop(0, 'rgba(116,84,44,0.55)');
    g.addColorStop(0.5, 'rgba(188,150,90,0.68)');
    g.addColorStop(1, 'rgba(104,76,38,0.55)');
    ctx.fillStyle = g;
    // 横条
    ctx.fillRect(sx > 0 ? edgeX - bw : edgeX, sy > 0 ? edgeY - bh : edgeY, bw, bh);
    // 竖条
    ctx.fillRect(sx > 0 ? edgeX - bh : edgeX, sy > 0 ? edgeY - vlen : edgeY, bh, vlen);
    // 铜钉
    ctx.fillStyle = 'rgba(220,186,124,0.65)';
    ctx.beginPath();
    ctx.arc(edgeX - sx * bh * 2, edgeY - sy * bh * 2, S * 0.0055, 0, 6.3);
    ctx.fill();
  };
  corner(-1, -1); corner(1, -1); corner(-1, 1); corner(1, 1);

  if (!open) {
    // —— 合上的盒盖 ——
    // 盖顶面（微透视）
    const top = ctx.createLinearGradient(0, -h * 0.72, 0, -h * 0.18);
    top.addColorStop(0, '#542422');
    top.addColorStop(0.6, '#381719');
    top.addColorStop(1, '#2a1113');
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + S * 0.012, -h * 0.58);
    ctx.lineTo(w / 2 - S * 0.012, -h * 0.58);
    ctx.lineTo(w / 2, -h * 0.18);
    ctx.lineTo(-w / 2, -h * 0.18);
    ctx.closePath();
    ctx.fill();
    // 盖沿高光
    ctx.strokeStyle = 'rgba(152,96,58,0.35)';
    ctx.lineWidth = Math.max(1, S * 0.0025);
    ctx.beginPath();
    ctx.moveTo(-w / 2 + S * 0.012, -h * 0.575);
    ctx.lineTo(w / 2 - S * 0.012, -h * 0.575);
    ctx.stroke();
    // 盖与盒身之间的缝隙与金线
    ctx.fillStyle = 'rgba(8,4,5,0.75)';
    ctx.fillRect(-w / 2 + S * 0.008, -h * 0.205, w - S * 0.016, S * 0.010);
    ctx.strokeStyle = 'rgba(190,148,84,0.40)';
    ctx.lineWidth = Math.max(1, S * 0.0018);
    ctx.beginPath();
    ctx.moveTo(-w / 2 + S * 0.010, -h * 0.185);
    ctx.lineTo(w / 2 - S * 0.010, -h * 0.185);
    ctx.stroke();
    // 漆面的一道柔光
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, -h * 0.58, w, h * 0.40);
    ctx.clip();
    const sheen = ctx.createLinearGradient(-w * 0.4, -h * 0.58, w * 0.2, -h * 0.18);
    sheen.addColorStop(0, 'rgba(255,226,190,0.10)');
    sheen.addColorStop(0.5, 'rgba(255,226,190,0.03)');
    sheen.addColorStop(1, 'rgba(255,226,190,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-w / 2, -h * 0.58, w, h * 0.40);
    ctx.restore();
    // 盖上的云纹雕刻
    ctx.strokeStyle = 'rgba(122,66,44,0.5)';
    ctx.lineWidth = Math.max(1, S * 0.0028);
    const carve = (cx) => {
      ctx.beginPath();
      ctx.arc(cx, -h * 0.36, S * 0.038, Math.PI * 0.15, Math.PI * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + S * 0.017, -h * 0.385, S * 0.018, Math.PI * 0.5, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - S * 0.05, -h * 0.29);
      ctx.quadraticCurveTo(cx, -h * 0.27, cx + S * 0.05, -h * 0.30);
      ctx.stroke();
    };
    carve(-w * 0.22);
    carve(w * 0.22);
    // 中央铜扣
    const latch = ctx.createLinearGradient(0, -h * 0.34, 0, -h * 0.10);
    latch.addColorStop(0, '#d8b478');
    latch.addColorStop(0.45, '#a8803e');
    latch.addColorStop(1, '#6e4c20');
    ctx.fillStyle = latch;
    rr(ctx, -S * 0.045, -h * 0.335, S * 0.09, S * 0.105, S * 0.008);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56,34,14,0.7)';
    ctx.lineWidth = Math.max(1, S * 0.0022);
    rr(ctx, -S * 0.045, -h * 0.335, S * 0.09, S * 0.105, S * 0.008);
    ctx.stroke();
    // 锁孔
    ctx.fillStyle = 'rgba(30,16,10,0.85)';
    ctx.beginPath();
    ctx.arc(0, -h * 0.295, S * 0.009, 0, 6.3);
    ctx.fill();
    ctx.fillRect(-S * 0.004, -h * 0.295, S * 0.008, S * 0.028);
    // 提手
    ctx.strokeStyle = 'rgba(174,132,72,0.6)';
    ctx.lineWidth = Math.max(1.4, S * 0.005);
    ctx.beginPath();
    ctx.arc(0, -h * 0.42, S * 0.05, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  } else {
    // —— 打开的盒盖：向后翻倒，露出红绒内衬与盒内矿石 ——
    const lidFront = -h * 0.40;
    const lidBack = -h * 0.74;
    const lwF = w * 0.98, lwB = w * 0.84;

    // 盖板外沿厚度
    ctx.fillStyle = 'rgba(32,14,14,0.95)';
    ctx.beginPath();
    ctx.moveTo(-lwF / 2, lidFront);
    ctx.lineTo(lwF / 2, lidFront);
    ctx.lineTo(lwB / 2 - S * 0.006, lidBack - S * 0.012);
    ctx.lineTo(-lwB / 2 + S * 0.006, lidBack - S * 0.012);
    ctx.closePath();
    ctx.fill();

    // 内侧绒面
    const lid = ctx.createLinearGradient(0, lidBack, 0, lidFront);
    lid.addColorStop(0, '#5a1a1e');
    lid.addColorStop(0.45, '#3e1015');
    lid.addColorStop(1, '#2a090d');
    ctx.fillStyle = lid;
    ctx.beginPath();
    ctx.moveTo(-lwF / 2 + S * 0.006, lidFront);
    ctx.lineTo(lwF / 2 - S * 0.006, lidFront);
    ctx.lineTo(lwB / 2 - S * 0.004, lidBack);
    ctx.lineTo(-lwB / 2 + S * 0.004, lidBack);
    ctx.closePath();
    ctx.fill();

    // 绒面压印的云纹与卡纸边
    ctx.strokeStyle = 'rgba(160,70,64,0.28)';
    ctx.lineWidth = Math.max(1, S * 0.0022);
    ctx.beginPath();
    ctx.ellipse(0, (lidFront + lidBack) / 2, w * 0.26, h * 0.085, 0, 0, 6.3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,48,46,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, (lidFront + lidBack) / 2, w * 0.17, h * 0.055, 0, 0, 6.3);
    ctx.stroke();
    // 卡纸内框
    ctx.strokeStyle = 'rgba(178,96,78,0.30)';
    ctx.lineWidth = Math.max(1, S * 0.0018);
    ctx.beginPath();
    ctx.moveTo(-lwB / 2 + S * 0.022, lidBack + S * 0.012);
    ctx.lineTo(lwB / 2 - S * 0.022, lidBack + S * 0.012);
    ctx.lineTo(lwF / 2 - S * 0.024, lidFront - S * 0.012);
    ctx.lineTo(-lwF / 2 + S * 0.024, lidFront - S * 0.012);
    ctx.closePath();
    ctx.stroke();
    // 盖沿包铜
    ctx.strokeStyle = 'rgba(168,126,70,0.55)';
    ctx.lineWidth = Math.max(1.2, S * 0.003);
    ctx.beginPath();
    ctx.moveTo(-lwB / 2 + S * 0.004, lidBack);
    ctx.lineTo(lwB / 2 - S * 0.004, lidBack);
    ctx.stroke();
    // 顶端受光
    ctx.strokeStyle = 'rgba(255,214,160,0.16)';
    ctx.lineWidth = Math.max(1, S * 0.002);
    ctx.beginPath();
    ctx.moveTo(-lwB / 2 + S * 0.02, lidBack + S * 0.012);
    ctx.lineTo(lwB / 2 - S * 0.02, lidBack + S * 0.012);
    ctx.stroke();

    // 铰链：连接盖板与盒体
    ctx.fillStyle = 'rgba(158,120,66,0.72)';
    for (const sx of [-1, 1]) {
      rr(ctx, sx * w * 0.29 - S * 0.028, lidFront - S * 0.008, S * 0.056, S * 0.028, S * 0.006);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,18,0.6)';
      ctx.lineWidth = 1;
      rr(ctx, sx * w * 0.29 - S * 0.028, lidFront - S * 0.008, S * 0.056, S * 0.028, S * 0.006);
      ctx.stroke();
      ctx.fillStyle = 'rgba(222,190,130,0.7)';
      ctx.beginPath();
      ctx.arc(sx * w * 0.29, lidFront + S * 0.004, S * 0.0045, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = 'rgba(158,120,66,0.72)';
    }

    // 盒口：从上方略看进去
    ctx.fillStyle = 'rgba(58,26,22,0.98)';
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.165, w * 0.472, h * 0.155, 0, 0, 6.3);
    ctx.fill();
    // 内腔红绒
    const cav = ctx.createRadialGradient(-w * 0.06, -h * 0.20, 0, 0, -h * 0.14, w * 0.44);
    cav.addColorStop(0, '#4a1418');
    cav.addColorStop(0.65, '#310c11');
    cav.addColorStop(1, '#1e070a');
    ctx.fillStyle = cav;
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.16, w * 0.425, h * 0.125, 0, 0, 6.3);
    ctx.fill();
    // 盒口的铜边
    ctx.strokeStyle = 'rgba(176,132,72,0.55)';
    ctx.lineWidth = Math.max(1.4, S * 0.0035);
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.165, w * 0.462, h * 0.148, 0, 0, 6.3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(96,62,30,0.45)';
    ctx.lineWidth = Math.max(1, S * 0.0025);
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.165, w * 0.425, h * 0.122, 0, 0, 6.3);
    ctx.stroke();
    // 绒布分格
    ctx.strokeStyle = 'rgba(122,46,44,0.55)';
    ctx.lineWidth = Math.max(1, S * 0.002);
    ctx.beginPath();
    ctx.moveTo(-w * 0.10, -h * 0.285);
    ctx.lineTo(-w * 0.10, -h * 0.055);
    ctx.stroke();

    // 暗红矿石
    const ore = (ox, oy, sc, seed) => {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(sc, sc);
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, S * 0.085);
      halo.addColorStop(0, 'rgba(178,52,44,0.17)');
      halo.addColorStop(0.55, 'rgba(140,32,30,0.07)');
      halo.addColorStop(1, 'rgba(110,20,22,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, S * 0.085, 0, 6.3);
      ctx.fill();
      // 落在绒布上的软影
      ctx.fillStyle = 'rgba(12,3,4,0.38)';
      ctx.beginPath();
      ctx.ellipse(0, S * 0.024, S * 0.040, S * 0.011, 0, 0, 6.3);
      ctx.fill();
      const pts = [];
      const lens = [0.040, 0.047, 0.036, 0.044, 0.033, 0.039];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.283 + seed;
        const r = S * lens[(i + Math.floor(seed)) % 6] * (0.94 + 0.10 * Math.sin(i * 2.1 + seed));
        pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.74]);
      }
      ctx.beginPath();
      pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
      ctx.closePath();
      const og = ctx.createLinearGradient(-S * 0.04, -S * 0.03, S * 0.04, S * 0.03);
      og.addColorStop(0, '#7c2a26');
      og.addColorStop(0.45, '#571a1a');
      og.addColorStop(1, '#2f0b0c');
      ctx.fillStyle = og;
      ctx.fill();
      // 粗糙的断面：几块深色小三角
      ctx.fillStyle = 'rgba(34,8,9,0.35)';
      for (let i = 1; i < 5; i++) {
        const p0 = pts[i], p1 = pts[(i + 2) % pts.length];
        ctx.beginPath();
        ctx.moveTo(p0[0] * 0.75, p0[1] * 0.75);
        ctx.lineTo(p1[0] * 0.6, p1[1] * 0.6);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(26,4,6,0.65)';
      ctx.lineWidth = Math.max(0.8, S * 0.0014);
      ctx.stroke();
      // 矿物表面的细碎颗粒
      for (let i = 0; i < 22; i++) {
        const ga = i * 2.399 + seed;
        const gr = S * 0.030 * Math.sqrt((i + 0.5) / 22);
        ctx.fillStyle = i % 4 ? 'rgba(24,6,8,0.26)' : 'rgba(214,112,92,0.28)';
        ctx.fillRect(Math.cos(ga) * gr, Math.sin(ga) * gr * 0.7, Math.max(0.6, S * 0.0016), Math.max(0.6, S * 0.0016));
      }
      // 晶面：两块受光的斜切面，让矿石有棱角而不是一团花瓣
      ctx.fillStyle = 'rgba(176,78,62,0.20)';
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0] * 0.42, pts[1][1] * 0.42);
      ctx.lineTo(pts[0][0] * 0.18, pts[0][1] * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(128,44,38,0.22)';
      ctx.beginPath();
      ctx.moveTo(pts[4][0] * 0.8, pts[4][1] * 0.8);
      ctx.lineTo(pts[5][0] * 0.55, pts[5][1] * 0.55);
      ctx.lineTo(pts[4][0] * 0.15, pts[4][1] * 0.15);
      ctx.closePath();
      ctx.fill();
      // 棱线：只提左上的一条
      ctx.strokeStyle = 'rgba(226,138,112,0.34)';
      ctx.lineWidth = Math.max(0.6, S * 0.0012);
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * 0.96, pts[0][1] * 0.96);
      ctx.lineTo(pts[1][0] * 0.92, pts[1][1] * 0.92);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,206,176,0.34)';
      ctx.beginPath();
      ctx.arc(-S * 0.010, -S * 0.012, Math.max(0.5, S * 0.002), 0, 6.3);
      ctx.fill();
      ctx.restore();
    };
    ore(-w * 0.24, -h * 0.190, 1.12, 0.7);
    ore(-w * 0.06, -h * 0.205, 0.98, 2.1);
    ore(w * 0.13, -h * 0.175, 1.18, 4.2);
    ore(w * 0.25, -h * 0.240, 0.82, 5.6);

    // 盒沿受光
    ctx.strokeStyle = 'rgba(206,152,88,0.28)';
    ctx.lineWidth = Math.max(1, S * 0.0022);
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.165, w * 0.468, h * 0.152, 0, Math.PI * 0.95, Math.PI * 1.85);
    ctx.stroke();
  }

  // 烛光在木头与铜件上的暖色反光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const warm = ctx.createRadialGradient(w * 0.22, -h * 0.1, 0, w * 0.22, -h * 0.1, S * 0.36);
  warm.addColorStop(0, hexA(p.glow, 0.16));
  warm.addColorStop(0.5, hexA(p.glow, 0.05));
  warm.addColorStop(1, hexA(p.glow, 0));
  ctx.fillStyle = warm;
  rr(ctx, -w / 2, -h * 0.6, w, h * 1.18, S * 0.012);
  ctx.fill();
  if (open) {
    const flick = 0.5 + 0.5 * Math.sin(time * 1.9);
    const ember = ctx.createRadialGradient(0, h * 0.02, 0, 0, h * 0.02, S * 0.24);
    ember.addColorStop(0, `rgba(198,52,46,${0.10 + flick * 0.06})`);
    ember.addColorStop(1, 'rgba(198,52,46,0)');
    ctx.fillStyle = ember;
    ctx.fillRect(-w * 0.5, -h * 0.4, w, h * 1.0);
  }
  ctx.restore();

  // 外轮廓
  ctx.strokeStyle = 'rgba(10,4,5,0.7)';
  ctx.lineWidth = Math.max(1, S * 0.0025);
  rr(ctx, -w / 2, -h * 0.18, w, h * 0.74, S * 0.012);
  ctx.stroke();

  ctx.restore();
}


function drawScroll(ctx, x, y, S, time, p, blood, drip = false) {
  const w = S * 1.42, h = S * 0.56;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.012);

  // 画匣中的长卷阴影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.62)';
  ctx.shadowBlur = S * 0.16;
  ctx.shadowOffsetY = S * 0.06;
  ctx.fillStyle = 'rgba(18,14,14,0.95)';
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.012);
  ctx.fill();
  ctx.restore();

  // 绫裱：深靛色天地
  const mount = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  mount.addColorStop(0, '#2c3346');
  mount.addColorStop(0.5, '#333a4c');
  mount.addColorStop(1, '#252b3a');
  ctx.fillStyle = mount;
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.012);
  ctx.fill();

  // 绫裱暗纹：细密的菱形织纹
  ctx.save();
  ctx.beginPath();
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.012);
  ctx.clip();
  ctx.strokeStyle = 'rgba(150,162,192,0.075)';
  ctx.lineWidth = Math.max(0.6, S * 0.0012);
  const bStep = S * 0.052;
  for (let d = -w; d < w; d += bStep) {
    ctx.beginPath();
    ctx.moveTo(d, -h / 2);
    ctx.lineTo(d + h, h / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(d, h / 2);
    ctx.lineTo(d + h, -h / 2);
    ctx.stroke();
  }
  // 天头地头的一道浅织带
  ctx.fillStyle = 'rgba(178,188,212,0.10)';
  ctx.fillRect(-w / 2, -h / 2, w, S * 0.014);
  ctx.fillRect(-w / 2, h / 2 - S * 0.014, w, S * 0.014);
  ctx.restore();

  // 画心：绢本青绿
  const ix = -w * 0.43, iy = -h * 0.36, iw = w * 0.86, ih = h * 0.72;
  ctx.fillStyle = 'rgba(235,226,202,0.95)';
  ctx.fillRect(ix, iy, iw, ih);

  // 题签：绫边上的小签「千里江山」
  const tsX = -w / 2 + S * 0.018, tsY = iy + ih * 0.10, tsW = S * 0.030, tsH = ih * 0.46;
  ctx.fillStyle = 'rgba(226,216,190,0.80)';
  ctx.fillRect(tsX, tsY, tsW, tsH);
  ctx.strokeStyle = 'rgba(120,104,74,0.35)';
  ctx.lineWidth = Math.max(0.6, S * 0.0012);
  ctx.strokeRect(tsX, tsY, tsW, tsH);
  ctx.fillStyle = 'rgba(58,54,44,0.72)';
  ctx.font = `600 ${Math.max(6, S * 0.016)}px "Songti SC","SimSun",serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleChars = ['千', '里', '江', '山'];
  for (let i = 0; i < titleChars.length; i++) {
    ctx.fillText(titleChars[i], tsX + tsW / 2, tsY + tsH * (i + 0.8) / 5);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, iy, iw, ih);
  ctx.clip();

  // 绢底旧色
  const silk = ctx.createLinearGradient(0, iy, 0, iy + ih);
  silk.addColorStop(0, 'rgba(224,216,192,1)');
  silk.addColorStop(0.62, 'rgba(214,208,182,1)');
  silk.addColorStop(1, 'rgba(198,194,170,1)');
  ctx.fillStyle = silk;
  ctx.fillRect(ix, iy, iw, ih);

  // 江水
  const riverY = iy + ih * 0.6;
  const rg = ctx.createLinearGradient(0, riverY, 0, iy + ih);
  rg.addColorStop(0, 'rgba(122,164,166,0.46)');
  rg.addColorStop(0.55, 'rgba(104,146,148,0.40)');
  rg.addColorStop(1, 'rgba(84,124,130,0.38)');
  ctx.fillStyle = rg;
  ctx.fillRect(ix, riverY, iw, ih - ih * 0.6);
  // 岸边山影落进水里的倒影
  for (let i = 0; i < 5; i++) {
    const sx = ix + iw * (0.08 + i * 0.18);
    const sw = iw * (0.10 + (i % 3) * 0.03);
    const sg = ctx.createLinearGradient(0, riverY, 0, riverY + ih * 0.16);
    sg.addColorStop(0, 'rgba(56,98,94,0.20)');
    sg.addColorStop(1, 'rgba(56,98,94,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(sx + sw / 2, riverY + ih * 0.06, sw * 0.5, ih * 0.07, 0, 0, 6.3);
    ctx.fill();
  }
  // 水纹：长而软的波线
  for (let i = 0; i < 6; i++) {
    const yy = riverY + ih * (0.045 + i * 0.062);
    ctx.strokeStyle = `rgba(240,242,226,${0.20 - i * 0.022})`;
    ctx.lineWidth = Math.max(0.8, S * 0.0017);
    ctx.beginPath();
    ctx.moveTo(ix + iw * 0.015, yy);
    ctx.bezierCurveTo(ix + iw * 0.30, yy - ih * 0.012, ix + iw * 0.62, yy + ih * 0.014, ix + iw * 0.985, yy);
    ctx.stroke();
  }
  // 零星的粼光短笔
  ctx.strokeStyle = 'rgba(246,246,230,0.30)';
  ctx.lineWidth = Math.max(0.7, S * 0.0013);
  for (let i = 0; i < 34; i++) {
    const rxp = ix + iw * (0.04 + Math.abs(Math.sin(i * 5.13)) * 0.92);
    const ryp = riverY + ih * (0.06 + Math.abs(Math.sin(i * 3.71 + 1)) * 0.33);
    ctx.beginPath();
    ctx.moveTo(rxp - S * 0.006, ryp);
    ctx.quadraticCurveTo(rxp, ryp - S * 0.0022, rxp + S * 0.006, ryp);
    ctx.stroke();
  }

  // 层峦叠嶂：远淡近浓，峰峦有皴
  const mountainLayers = [
    {
      fill: 'rgba(132,176,156,0.46)', ink: 'rgba(62,104,92,0.34)', base: 0.585,
      peaks: [[0.06, 0.10], [0.15, 0.18], [0.27, 0.11], [0.38, 0.20], [0.51, 0.13], [0.63, 0.22], [0.76, 0.12], [0.87, 0.17], [0.96, 0.10]],
    },
    {
      fill: 'rgba(78,142,132,0.55)', ink: 'rgba(40,86,82,0.40)', base: 0.615,
      peaks: [[0.04, 0.16], [0.16, 0.27], [0.28, 0.15], [0.40, 0.24], [0.54, 0.16], [0.68, 0.26], [0.80, 0.14], [0.92, 0.20]],
    },
    {
      fill: 'rgba(46,104,110,0.60)', ink: 'rgba(26,66,74,0.48)', base: 0.640,
      peaks: [[0.10, 0.12], [0.22, 0.20], [0.35, 0.10], [0.47, 0.17], [0.60, 0.08], [0.72, 0.15], [0.86, 0.09]],
    },
  ];
  for (let li = 0; li < mountainLayers.length; li++) {
    const L = mountainLayers[li];
    const baseY = iy + ih * L.base;
    // 主轮廓
    const path = new Path2D();
    path.moveTo(ix, baseY);
    let prevX = ix;
    for (let i = 0; i < L.peaks.length; i++) {
      const [px, ph] = L.peaks[i];
      const peakX = ix + iw * px;
      const peakY = baseY - ih * ph;
      const valleyX = i < L.peaks.length - 1
        ? ix + iw * (px + L.peaks[i + 1][0]) / 2
        : ix + iw;
      const valleyY = baseY - ih * 0.03 - (i % 2) * ih * 0.015;
      path.quadraticCurveTo(peakX - (peakX - prevX) * 0.42, peakY + ih * 0.02, peakX, peakY);
      path.quadraticCurveTo(peakX + (valleyX - peakX) * 0.42, peakY + ih * 0.02, valleyX, valleyY);
      prevX = valleyX;
    }
    path.lineTo(ix + iw, baseY + ih * 0.04);
    path.lineTo(ix, baseY + ih * 0.04);
    path.closePath();
    ctx.fillStyle = L.fill;
    ctx.fill(path);
    ctx.strokeStyle = L.ink;
    ctx.lineWidth = Math.max(0.9, S * 0.0018);
    ctx.stroke(path);

    // 山体暗面：峰右侧背光
    for (let i = 0; i < L.peaks.length; i++) {
      const [px, ph] = L.peaks[i];
      const peakX = ix + iw * px;
      const peakY = baseY - ih * ph;
      const nextX = i < L.peaks.length - 1 ? ix + iw * L.peaks[i + 1][0] : ix + iw * 0.99;
      const valleyX = (peakX + nextX) / 2;
      const valleyY = baseY - ih * 0.03;
      ctx.fillStyle = `rgba(${li === 2 ? '18,52,60' : '34,78,74'},0.10)`;
      ctx.beginPath();
      ctx.moveTo(peakX, peakY);
      ctx.quadraticCurveTo(peakX + (valleyX - peakX) * 0.5, peakY + ih * 0.03, valleyX, valleyY);
      ctx.lineTo(valleyX, baseY);
      ctx.lineTo(peakX, baseY);
      ctx.closePath();
      ctx.fill();
    }

    // 皴法：短促的侧锋（只给最近一层）
    if (li === 2) {
      ctx.strokeStyle = 'rgba(20,54,62,0.28)';
      ctx.lineWidth = Math.max(0.7, S * 0.0013);
      for (let i = 0; i < L.peaks.length; i++) {
        const [px, ph] = L.peaks[i];
        const peakX = ix + iw * px;
        const peakY = baseY - ih * ph;
        for (let k = 0; k < 9; k++) {
          const t = (k + 1) / 10;
          const sx = peakX + (k % 2 ? 1 : -1) * iw * 0.008 * t;
          const sy = peakY + ih * ph * t * 0.85;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - iw * 0.007 - (k % 3) * iw * 0.002, sy + ih * 0.018);
          ctx.stroke();
        }
      }
    }
  }

  // 山间云气
  for (let i = 0; i < 4; i++) {
    const my = iy + ih * (0.36 + i * 0.055);
    const mg = ctx.createLinearGradient(ix, my - ih * 0.03, ix, my + ih * 0.03);
    mg.addColorStop(0, 'rgba(246,242,226,0)');
    mg.addColorStop(0.45, 'rgba(246,242,226,0.30)');
    mg.addColorStop(0.6, 'rgba(246,242,226,0.24)');
    mg.addColorStop(1, 'rgba(246,242,226,0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.ellipse(ix + iw * (0.16 + i * 0.20), my, iw * 0.16, ih * 0.035, 0, 0, 6.3);
    ctx.fill();
  }
  // 水口的雾气
  const mist = ctx.createLinearGradient(0, iy + ih * 0.52, 0, iy + ih * 0.66);
  mist.addColorStop(0, 'rgba(242,240,228,0)');
  mist.addColorStop(0.5, 'rgba(242,240,228,0.30)');
  mist.addColorStop(1, 'rgba(242,240,228,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(ix, iy + ih * 0.52, iw, ih * 0.14);

  // 远处的亭台、飞瀑与小舟
  const pvX = ix + iw * 0.665;
  const pvBase = iy + ih * 0.492;
  // 亭下的石台
  ctx.fillStyle = 'rgba(44,72,68,0.45)';
  ctx.beginPath();
  ctx.ellipse(pvX, pvBase + ih * 0.008, iw * 0.034, ih * 0.014, 0, 0, 6.3);
  ctx.fill();
  // 柱与栏
  ctx.strokeStyle = 'rgba(34,58,60,0.62)';
  ctx.lineWidth = Math.max(0.8, S * 0.0016);
  ctx.beginPath();
  ctx.moveTo(pvX - iw * 0.020, pvBase);
  ctx.lineTo(pvX - iw * 0.020, pvBase - ih * 0.060);
  ctx.moveTo(pvX + iw * 0.020, pvBase);
  ctx.lineTo(pvX + iw * 0.020, pvBase - ih * 0.060);
  ctx.moveTo(pvX - iw * 0.024, pvBase - ih * 0.018);
  ctx.lineTo(pvX + iw * 0.024, pvBase - ih * 0.018);
  ctx.moveTo(pvX - iw * 0.014, pvBase - ih * 0.006);
  ctx.lineTo(pvX - iw * 0.014, pvBase - ih * 0.018);
  ctx.moveTo(pvX + iw * 0.014, pvBase - ih * 0.006);
  ctx.lineTo(pvX + iw * 0.014, pvBase - ih * 0.018);
  ctx.stroke();
  // 双重檐
  ctx.fillStyle = 'rgba(30,52,56,0.72)';
  ctx.beginPath();
  ctx.moveTo(pvX - iw * 0.044, pvBase - ih * 0.064);
  ctx.quadraticCurveTo(pvX - iw * 0.020, pvBase - ih * 0.074, pvX, pvBase - ih * 0.088);
  ctx.quadraticCurveTo(pvX + iw * 0.020, pvBase - ih * 0.074, pvX + iw * 0.044, pvBase - ih * 0.064);
  ctx.quadraticCurveTo(pvX + iw * 0.020, pvBase - ih * 0.066, pvX, pvBase - ih * 0.070);
  ctx.quadraticCurveTo(pvX - iw * 0.020, pvBase - ih * 0.066, pvX - iw * 0.044, pvBase - ih * 0.064);
  ctx.closePath();
  ctx.fill();
  // 檐角起翘
  ctx.strokeStyle = 'rgba(30,52,56,0.8)';
  ctx.lineWidth = Math.max(0.8, S * 0.0016);
  ctx.beginPath();
  ctx.moveTo(pvX - iw * 0.044, pvBase - ih * 0.064);
  ctx.quadraticCurveTo(pvX - iw * 0.050, pvBase - ih * 0.068, pvX - iw * 0.052, pvBase - ih * 0.074);
  ctx.moveTo(pvX + iw * 0.044, pvBase - ih * 0.064);
  ctx.quadraticCurveTo(pvX + iw * 0.050, pvBase - ih * 0.068, pvX + iw * 0.052, pvBase - ih * 0.074);
  ctx.stroke();

  // 飞瀑：一线白练
  const wfX = ix + iw * 0.795;
  const wfTop = iy + ih * 0.205;
  const wfBot = iy + ih * 0.520;
  const wf = ctx.createLinearGradient(0, wfTop, 0, wfBot);
  wf.addColorStop(0, 'rgba(222,238,236,0.10)');
  wf.addColorStop(0.25, 'rgba(226,240,238,0.55)');
  wf.addColorStop(0.8, 'rgba(210,232,230,0.42)');
  wf.addColorStop(1, 'rgba(210,232,230,0)');
  ctx.fillStyle = wf;
  ctx.beginPath();
  ctx.moveTo(wfX - iw * 0.004, wfTop);
  ctx.quadraticCurveTo(wfX - iw * 0.006, wfTop + ih * 0.15, wfX - iw * 0.012, wfBot);
  ctx.lineTo(wfX + iw * 0.012, wfBot);
  ctx.quadraticCurveTo(wfX + iw * 0.005, wfTop + ih * 0.15, wfX + iw * 0.004, wfTop);
  ctx.closePath();
  ctx.fill();
  // 瀑底水花
  ctx.fillStyle = 'rgba(238,246,244,0.40)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(wfX + (i - 1) * iw * 0.012, wfBot - ih * 0.006 + (i % 2) * ih * 0.007, iw * 0.012, ih * 0.004, 0, 0, 6.3);
    ctx.fill();
  }

  // 江上的两只小舟
  const boat = (bxo, byo, sc, dir) => {
    ctx.save();
    ctx.translate(ix + iw * bxo, iy + ih * byo);
    ctx.scale(sc * dir, sc);
    ctx.strokeStyle = 'rgba(46,64,58,0.66)';
    ctx.lineWidth = Math.max(0.8, S * 0.0016);
    ctx.beginPath();
    ctx.moveTo(-iw * 0.020, 0);
    ctx.quadraticCurveTo(0, ih * 0.014, iw * 0.022, 0);
    ctx.quadraticCurveTo(0, ih * 0.004, -iw * 0.020, 0);
    ctx.stroke();
    // 篷
    ctx.fillStyle = 'rgba(54,72,64,0.5)';
    ctx.beginPath();
    ctx.arc(-iw * 0.004, -ih * 0.003, iw * 0.008, Math.PI, 0);
    ctx.fill();
    // 人
    ctx.fillStyle = 'rgba(40,52,48,0.65)';
    ctx.beginPath();
    ctx.ellipse(iw * 0.008, -ih * 0.006, iw * 0.0032, ih * 0.007, 0, 0, 6.3);
    ctx.fill();
    ctx.restore();
  };
  boat(0.22, 0.79, 1.0, 1);
  boat(0.48, 0.86, 1.3, -1);
  // 舟下水纹
  ctx.strokeStyle = 'rgba(230,240,232,0.28)';
  ctx.lineWidth = Math.max(0.6, S * 0.0012);
  ctx.beginPath();
  ctx.moveTo(ix + iw * 0.18, iy + ih * 0.805);
  ctx.quadraticCurveTo(ix + iw * 0.22, iy + ih * 0.812, ix + iw * 0.27, iy + ih * 0.806);
  ctx.moveTo(ix + iw * 0.43, iy + ih * 0.878);
  ctx.quadraticCurveTo(ix + iw * 0.48, iy + ih * 0.886, ix + iw * 0.54, iy + ih * 0.877);
  ctx.stroke();

  // 天空里的三两飞鸟
  ctx.strokeStyle = 'rgba(52,70,66,0.42)';
  ctx.lineWidth = Math.max(0.7, S * 0.0014);
  for (let i = 0; i < 3; i++) {
    const bx0 = ix + iw * (0.24 + i * 0.035);
    const by0 = iy + ih * (0.14 + (i % 2) * 0.022);
    ctx.beginPath();
    ctx.moveTo(bx0 - S * 0.008, by0);
    ctx.quadraticCurveTo(bx0 - S * 0.004, by0 - S * 0.006, bx0, by0 - S * 0.001);
    ctx.quadraticCurveTo(bx0 + S * 0.004, by0 - S * 0.006, bx0 + S * 0.008, by0);
    ctx.stroke();
  }

  // 卷尾的红枫：五裂的枫叶，不落不凋
  if (blood) {
    const bx = ix + iw * 0.865;
    const by = iy + ih * 0.605;
    const rootY = iy + ih * 0.94;
    // 岸边的坡石：让红枫长在岸上，而不是浮在水里
    const bank = ctx.createLinearGradient(0, iy + ih * 0.87, 0, iy + ih * 0.96);
    bank.addColorStop(0, 'rgba(74,96,86,0.55)');
    bank.addColorStop(1, 'rgba(44,62,58,0.62)');
    ctx.fillStyle = bank;
    ctx.beginPath();
    ctx.moveTo(bx - ih * 0.15, iy + ih * 0.955);
    ctx.quadraticCurveTo(bx - ih * 0.11, iy + ih * 0.885, bx - ih * 0.02, iy + ih * 0.882);
    ctx.quadraticCurveTo(bx + ih * 0.07, iy + ih * 0.878, bx + ih * 0.11, iy + ih * 0.902);
    ctx.quadraticCurveTo(bx + ih * 0.16, iy + ih * 0.928, bx + ih * 0.15, iy + ih * 0.955);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(32,50,48,0.45)';
    ctx.lineWidth = Math.max(0.7, S * 0.0013);
    ctx.beginPath();
    ctx.moveTo(bx - ih * 0.09, iy + ih * 0.915);
    ctx.quadraticCurveTo(bx - ih * 0.05, iy + ih * 0.900, bx - ih * 0.01, iy + ih * 0.920);
    ctx.moveTo(bx + ih * 0.02, iy + ih * 0.900);
    ctx.quadraticCurveTo(bx + ih * 0.06, iy + ih * 0.892, bx + ih * 0.09, iy + ih * 0.910);
    ctx.stroke();
    // 枫叶的暖红光晕
    const bg = ctx.createRadialGradient(bx, by + ih * 0.05, 0, bx, by + ih * 0.05, ih * 0.22);
    bg.addColorStop(0, 'rgba(178,48,40,0.40)');
    bg.addColorStop(0.55, 'rgba(140,38,34,0.18)');
    bg.addColorStop(1, 'rgba(140,38,34,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by + ih * 0.05, ih * 0.22, 0, 6.3);
    ctx.fill();
    // 枝干
    ctx.strokeStyle = 'rgba(66,42,34,0.85)';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, S * 0.0038);
    ctx.beginPath();
    ctx.moveTo(bx, rootY);
    ctx.quadraticCurveTo(bx - ih * 0.018, by + ih * 0.16, bx - ih * 0.004, by + ih * 0.02);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.9, S * 0.0026);
    ctx.beginPath();
    ctx.moveTo(bx - ih * 0.006, by + ih * 0.115);
    ctx.quadraticCurveTo(bx - ih * 0.045, by + ih * 0.055, bx - ih * 0.062, by - ih * 0.010);
    ctx.moveTo(bx - ih * 0.004, by + ih * 0.075);
    ctx.quadraticCurveTo(bx + ih * 0.026, by + ih * 0.020, bx + ih * 0.052, by - ih * 0.045);
    ctx.moveTo(bx - ih * 0.004, by + ih * 0.045);
    ctx.quadraticCurveTo(bx - ih * 0.006, by - ih * 0.040, bx + ih * 0.006, by - ih * 0.095);
    ctx.stroke();
    // 枫叶：每片五裂
    const mapleLeaf = (lx, ly, size, rot, alpha) => {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      const tips = [];
      const notches = [];
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 1.12;
        tips.push([Math.cos(a) * size, Math.sin(a) * size]);
        const na = a + 0.56;
        notches.push([Math.cos(na) * size * 0.40, Math.sin(na) * size * 0.40]);
      }
      ctx.beginPath();
      ctx.moveTo(0, size * 0.42);
      for (let i = 0; i < 5; i++) {
        ctx.quadraticCurveTo(tips[i][0] * 0.52, tips[i][1] * 0.52, tips[i][0], tips[i][1]);
        if (i < 4) ctx.quadraticCurveTo(notches[i][0] * 1.1, notches[i][1] * 1.1, (tips[i][0] + tips[i + 1][0]) * 0.5, (tips[i][1] + tips[i + 1][1]) * 0.5);
      }
      ctx.quadraticCurveTo(notches[4][0], notches[4][1], 0, size * 0.42);
      ctx.closePath();
      const lg = ctx.createLinearGradient(-size * 0.5, -size, size * 0.6, size * 0.5);
      lg.addColorStop(0, `rgba(198,74,54,${alpha})`);
      lg.addColorStop(0.6, `rgba(154,36,32,${alpha})`);
      lg.addColorStop(1, `rgba(96,16,20,${alpha})`);
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.strokeStyle = `rgba(74,10,14,${alpha * 0.8})`;
      ctx.lineWidth = Math.max(0.6, S * 0.0014);
      ctx.stroke();
      // 叶脉
      ctx.strokeStyle = `rgba(230,150,120,${alpha * 0.35})`;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        ctx.moveTo(0, 0);
        ctx.lineTo(tips[i][0] * 0.82, tips[i][1] * 0.82);
      }
      ctx.stroke();
      // 叶柄
      ctx.strokeStyle = `rgba(84,30,24,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.40);
      ctx.lineTo(0, size * 0.62);
      ctx.stroke();
      ctx.restore();
    };
    const leaves = [
      [-0.052, -0.004, 0.92, -0.5, 0.92],
      [-0.024, -0.044, 1.00, 0.3, 0.95],
      [0.008, -0.074, 0.88, -0.2, 0.9],
      [0.044, -0.040, 1.04, 0.6, 0.94],
      [0.058, 0.004, 0.84, 1.1, 0.88],
      [0.018, 0.020, 0.96, 0.1, 0.9],
      [-0.024, 0.040, 0.86, -0.8, 0.86],
      [-0.066, 0.034, 0.74, -1.2, 0.8],
      [0.030, -0.098, 0.74, 0.8, 0.84],
    ];
    for (const [dx, dy, k, rot, al] of leaves) {
      mapleLeaf(bx + ih * dx, by + ih * dy, ih * 0.043 * k, rot, al);
    }
    // 飘落的两三片
    mapleLeaf(bx + ih * 0.10, by + ih * 0.13, ih * 0.024, 1.9, 0.6);
    mapleLeaf(bx - ih * 0.10, by + ih * 0.10, ih * 0.019, -0.7, 0.5);

    // 刚落下的那滴血：在绢上洇成一小片，边缘溅开
    if (drip) {
      const ddx = ix + iw * 0.930, ddy = iy + ih * 0.875;
      const soak = ctx.createRadialGradient(ddx, ddy, 0, ddx, ddy, S * 0.060);
      soak.addColorStop(0, 'rgba(120,14,18,0.30)');
      soak.addColorStop(0.55, 'rgba(112,16,20,0.12)');
      soak.addColorStop(1, 'rgba(112,16,20,0)');
      ctx.fillStyle = soak;
      ctx.beginPath();
      ctx.arc(ddx, ddy, S * 0.060, 0, 6.3);
      ctx.fill();
      // 不规则的血迹本体
      ctx.beginPath();
      ctx.moveTo(ddx - S * 0.017, ddy + S * 0.004);
      ctx.bezierCurveTo(ddx - S * 0.020, ddy - S * 0.011, ddx - S * 0.006, ddy - S * 0.015, ddx + S * 0.003, ddy - S * 0.010);
      ctx.bezierCurveTo(ddx + S * 0.014, ddy - S * 0.014, ddx + S * 0.020, ddy - S * 0.002, ddx + S * 0.016, ddy + S * 0.006);
      ctx.bezierCurveTo(ddx + S * 0.012, ddy + S * 0.015, ddx - S * 0.004, ddy + S * 0.016, ddx - S * 0.012, ddy + S * 0.012);
      ctx.closePath();
      const dropG = ctx.createRadialGradient(ddx - S * 0.004, ddy - S * 0.005, 0, ddx, ddy, S * 0.018);
      dropG.addColorStop(0, '#cf3c34');
      dropG.addColorStop(0.5, '#971419');
      dropG.addColorStop(1, '#4c060a');
      ctx.fillStyle = dropG;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,218,204,0.6)';
      ctx.beginPath();
      ctx.ellipse(ddx - S * 0.005, ddy - S * 0.006, S * 0.0036, S * 0.0026, -0.4, 0, 6.3);
      ctx.fill();
      // 溅开的小血点
      for (const [sx2, sy2, sr] of [[-0.026, -0.008, 0.0034], [0.023, -0.014, 0.0026], [0.020, 0.014, 0.0030], [-0.018, 0.020, 0.0022], [0.006, -0.028, 0.0018]]) {
        ctx.fillStyle = 'rgba(130,14,18,0.62)';
        ctx.beginPath();
        ctx.ellipse(ddx + S * sx2, ddy + S * sy2, S * sr, S * sr * 0.8, 0, 0, 6.3);
        ctx.fill();
      }
    }
  }

  // 左下角的朱印（两方，一朱文一白文）
  ctx.fillStyle = 'rgba(156,46,42,0.62)';
  ctx.fillRect(ix + iw * 0.030, iy + ih * 0.760, S * 0.026, S * 0.026);
  ctx.strokeStyle = 'rgba(238,214,198,0.55)';
  ctx.lineWidth = Math.max(0.8, S * 0.0018);
  ctx.strokeRect(ix + iw * 0.035, iy + ih * 0.775, S * 0.016, S * 0.016);
  ctx.beginPath();
  ctx.moveTo(ix + iw * 0.043, iy + ih * 0.775);
  ctx.lineTo(ix + iw * 0.043, iy + ih * 0.775 + S * 0.016);
  ctx.moveTo(ix + iw * 0.035, iy + ih * 0.775 + S * 0.008);
  ctx.lineTo(ix + iw * 0.051, iy + ih * 0.775 + S * 0.008);
  ctx.stroke();
  // 上方的小白文印
  ctx.fillStyle = 'rgba(240,224,204,0.42)';
  ctx.fillRect(ix + iw * 0.038, iy + ih * 0.700, S * 0.019, S * 0.019);
  ctx.strokeStyle = 'rgba(150,44,40,0.55)';
  ctx.strokeRect(ix + iw * 0.038, iy + ih * 0.700, S * 0.019, S * 0.019);
  ctx.strokeStyle = 'rgba(150,44,40,0.45)';
  ctx.beginPath();
  ctx.moveTo(ix + iw * 0.038 + S * 0.0095, iy + ih * 0.700);
  ctx.lineTo(ix + iw * 0.038 + S * 0.0095, iy + ih * 0.700 + S * 0.019);
  ctx.stroke();

  // 绢面细微的横向纹理
  ctx.strokeStyle = 'rgba(120,110,88,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const yy = iy + (ih * i) / 18;
    ctx.beginPath();
    ctx.moveTo(ix, yy);
    ctx.lineTo(ix + iw, yy);
    ctx.stroke();
  }
  ctx.restore();

  // 画心与绫裱之间的金色细边
  ctx.strokeStyle = hexA(p.glow, 0.3);
  ctx.lineWidth = Math.max(1, S * 0.0025);
  ctx.strokeRect(ix - 2, iy - 2, iw + 4, ih + 4);

  // 两端木轴
  for (const side of [-1, 1]) {
    const rx = side * w / 2;
    const roll = ctx.createLinearGradient(rx - S * 0.02, 0, rx + S * 0.02, 0);
    roll.addColorStop(0, '#1b1110');
    roll.addColorStop(0.5, '#3a2820');
    roll.addColorStop(1, '#160e0d');
    ctx.fillStyle = roll;
    rr(ctx, rx - S * 0.022, -h * 0.53, S * 0.044, h * 1.06, S * 0.02);
    ctx.fill();
    // 两端玉轴头
    for (const sy of [-1, 1]) {
      const cy = sy * h * 0.525;
      const y0 = Math.min(cy, cy + sy * S * 0.032);
      const jg = ctx.createLinearGradient(rx - S * 0.026, 0, rx + S * 0.026, 0);
      jg.addColorStop(0, '#8ba394');
      jg.addColorStop(0.42, '#d3e0ce');
      jg.addColorStop(1, '#7b9483');
      ctx.fillStyle = jg;
      rr(ctx, rx - S * 0.026, y0, S * 0.052, S * 0.032, S * 0.010);
      ctx.fill();
      ctx.strokeStyle = 'rgba(58,74,62,0.45)';
      ctx.lineWidth = Math.max(0.6, S * 0.0012);
      rr(ctx, rx - S * 0.026, y0, S * 0.052, S * 0.032, S * 0.010);
      ctx.stroke();
      ctx.fillStyle = 'rgba(246,252,242,0.42)';
      ctx.beginPath();
      ctx.ellipse(rx - S * 0.007, y0 + S * 0.010, S * 0.012, S * 0.004, 0, 0, 6.3);
      ctx.fill();
      ctx.fillStyle = 'rgba(206,222,200,0.55)';
      ctx.beginPath();
      ctx.ellipse(rx, cy, S * 0.026, S * 0.009, 0, 0, 6.3);
      ctx.fill();
    }
  }

  // 卷面暖光
  const lg = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  lg.addColorStop(0, hexA(p.glow, 0.1));
  lg.addColorStop(0.5, hexA(p.glow, 0));
  lg.addColorStop(1, hexA(p.glow, 0.06));
  ctx.fillStyle = lg;
  rr(ctx, -w / 2, -h / 2, w, h, S * 0.012);
  ctx.fill();

  ctx.restore();
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

/* ---------- 《星月夜》系列：真迹 / 逆向仿作 / 画布碎片 ---------- */

function starryPatch(ctx, x, y, w, h, mirror, img) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (img && img.naturalWidth) {
    const ia = img.naturalWidth / img.naturalHeight;
    const ta = w / h;
    let dw = w, dh = h, dx = x, dy = y;
    if (ia > ta) { dh = h; dw = h * ia; dx = x - (dw - w) / 2; } else { dw = w; dh = w / ia; dy = y - (dh - h) / 2; }
    if (mirror) {
      ctx.translate(x * 2 + w, 0);
      ctx.scale(-1, 1);
    }
    ctx.globalAlpha = 0.97;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
  } else {
    // 图片未就绪时的底：深蓝夜与漩涡笔触
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, '#16265c');
    bg.addColorStop(0.55, '#1d2f6e');
    bg.addColorStop(1, '#101a3c');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const cy = y + h * (0.18 + i * 0.085);
      ctx.strokeStyle = i % 2 ? 'rgba(126,168,230,0.45)' : 'rgba(88,124,196,0.4)';
      ctx.lineWidth = Math.max(1, h * 0.012);
      ctx.beginPath();
      for (let k = 0; k <= 18; k++) {
        const px = x + (k / 18) * w;
        const py = cy + Math.sin(k * 0.8 + i * 1.7) * h * 0.035;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const sx = x + w * ((i * 37) % 100) / 100;
      const sy = y + h * ((i * 53) % 55) / 100;
      ctx.fillStyle = 'rgba(255,236,160,0.8)';
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, w * 0.012), 0, 6.3); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawStarryProp(ctx, x, y, S, time, p, text, mirror, img) {
  const w = S * 0.74, h = w * 0.80;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.012);
  // 画框投影
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(S * 0.03, h * 0.55, w * 0.58, S * 0.045, 0, 0, 6.3);
  ctx.fill();
  // 外层金框
  const fw = Math.max(5, S * 0.026);
  const frame = ctx.createLinearGradient(-w / 2 - fw, -h / 2 - fw, w / 2 + fw, h / 2 + fw);
  frame.addColorStop(0, '#4a3518');
  frame.addColorStop(0.25, '#a88a48');
  frame.addColorStop(0.5, '#e2c98c');
  frame.addColorStop(0.72, '#8a6c34');
  frame.addColorStop(1, '#3c2a12');
  ctx.fillStyle = frame;
  ctx.fillRect(-w / 2 - fw, -h / 2 - fw, w + fw * 2, h + fw * 2);
  // 框内侧的深色衬线
  ctx.fillStyle = '#24180c';
  ctx.fillRect(-w / 2 - fw * 0.32, -h / 2 - fw * 0.32, w + fw * 0.64, h + fw * 0.64);
  // 画布边缘
  ctx.fillStyle = '#cfc4a8';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // 画面：星月夜（画库版本为镜像）
  starryPatch(ctx, -w / 2, -h / 2, w, h, mirror, img);
  // 画布的织纹与厚涂高光
  ctx.strokeStyle = 'rgba(255,244,214,0.05)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 16; i++) {
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + h * i / 16); ctx.lineTo(w / 2, -h / 2 + h * i / 16); ctx.stroke();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sheen = ctx.createLinearGradient(-w / 2, -h / 2, w * 0.2, h * 0.2);
  sheen.addColorStop(0, 'rgba(214,228,255,0.10)');
  sheen.addColorStop(0.4, 'rgba(214,228,255,0.02)');
  sheen.addColorStop(1, 'rgba(214,228,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
  // 玻璃反光斜带
  ctx.fillStyle = 'rgba(230,240,255,0.055)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.34, -h / 2);
  ctx.lineTo(-w * 0.22, -h / 2);
  ctx.lineTo(-w * 0.40, h / 2);
  ctx.lineTo(-w * 0.50, h / 2);
  ctx.closePath();
  ctx.fill();
  // 画框下沿的铜牌
  const plateW = w * 0.30, plateH = S * 0.030;
  ctx.fillStyle = '#7c6428';
  ctx.fillRect(-plateW / 2, h / 2 + fw * 0.18, plateW, plateH);
  ctx.fillStyle = 'rgba(255,238,190,0.30)';
  ctx.fillRect(-plateW / 2 + 2, h / 2 + fw * 0.18 + 2, plateW - 4, 1);
  ctx.fillStyle = 'rgba(30,22,12,0.55)';
  ctx.fillRect(-plateW * 0.34, h / 2 + fw * 0.18 + plateH * 0.42, plateW * 0.68, 1.6);
  // 画框底部落在桌面上的接触阴影
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, h / 2 + fw + S * 0.012, w * 0.55, S * 0.012, 0, 0, 6.3);
  ctx.fill();
  ctx.restore();
}

function drawFragmentProp(ctx, x, y, S, time, p, text, img) {
  ctx.save();
  ctx.translate(x, y);
  // 桌面
  const table = ctx.createLinearGradient(0, -S * 0.25, 0, S * 0.38);
  table.addColorStop(0, 'rgba(58,42,30,0.10)');
  table.addColorStop(1, 'rgba(20,14,10,0.16)');
  ctx.fillStyle = table;
  ctx.beginPath();
  ctx.ellipse(0, S * 0.10, S * 0.46, S * 0.26, 0, 0, 6.3);
  ctx.fill();
  const shards = [
    [-0.26, -0.06, 0.26, 0.17, -0.22],
    [0.02, -0.18, 0.22, 0.15, 0.16],
    [0.16, 0.05, 0.20, 0.14, 0.55],
    [-0.12, 0.12, 0.24, 0.14, -0.08],
    [-0.34, 0.10, 0.14, 0.10, 0.32],
  ];
  for (let i = 0; i < shards.length; i++) {
    const [ox, oy, sw, sh, rot] = shards[i];
    const cx = ox * S, cy = oy * S;
    const w2 = sw * S, h2 = sh * S;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot + (i % 2 ? 0.1 : -0.06));
    // 碎片投影
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(-w2 * 0.52 + 2, -h2 * 0.30 + 4);
    ctx.lineTo(w2 * 0.46 + 3, -h2 * 0.42 + 4);
    ctx.lineTo(w2 * 0.52 + 2, h2 * 0.30 + 4);
    ctx.lineTo(-w2 * 0.10 + 2, h2 * 0.48 + 4);
    ctx.lineTo(-w2 * 0.50 + 2, h2 * 0.16 + 4);
    ctx.closePath(); ctx.fill();
    // 帆布背面（露出亚麻色）
    ctx.fillStyle = '#b9ab8c';
    ctx.beginPath();
    ctx.moveTo(-w2 * 0.52, -h2 * 0.30);
    ctx.lineTo(w2 * 0.46, -h2 * 0.42);
    ctx.lineTo(w2 * 0.52, h2 * 0.30);
    ctx.lineTo(-w2 * 0.10, h2 * 0.48);
    ctx.lineTo(-w2 * 0.50, h2 * 0.16);
    ctx.closePath(); ctx.fill();
    // 正面星月夜局部
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-w2 * 0.48, -h2 * 0.26);
    ctx.lineTo(w2 * 0.40, -h2 * 0.36);
    ctx.lineTo(w2 * 0.45, h2 * 0.22);
    ctx.lineTo(-w2 * 0.08, h2 * 0.40);
    ctx.lineTo(-w2 * 0.44, h2 * 0.10);
    ctx.closePath();
    ctx.clip();
    starryPatch(ctx, -w2 * 0.6, -h2 * 0.6 + i * 3, w2 * 1.2, h2 * 1.2, i % 2 === 1, img);
    ctx.restore();
    // 撕口毛边
    ctx.strokeStyle = 'rgba(238,228,204,0.55)';
    ctx.lineWidth = Math.max(0.8, S * 0.0016);
    ctx.beginPath();
    ctx.moveTo(-w2 * 0.52, -h2 * 0.30);
    ctx.lineTo(w2 * 0.46, -h2 * 0.42);
    ctx.lineTo(w2 * 0.52, h2 * 0.30);
    ctx.stroke();
    ctx.restore();
  }
  // 掉落的细小颜料屑
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = i % 4 === 0 ? 'rgba(238,212,130,0.5)' : 'rgba(150,170,210,0.35)';
    ctx.beginPath();
    ctx.arc(rand(-0.46, 0.46) * S, rand(-0.10, 0.32) * S, Math.max(0.5, S * 0.0016), 0, 6.3);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- 黑皮账本 ---------- */

function drawLedgerProp(ctx, x, y, S, time, p) {
  const w = S * 0.80, h = S * 0.56;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.035);
  // 投影
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(S * 0.02, h * 0.55, w * 0.56, S * 0.045, 0, 0, 6.3);
  ctx.fill();
  // 黑皮封底
  rr(ctx, -w / 2 - S * 0.012, -h / 2 - S * 0.010, w + S * 0.024, h + S * 0.020, S * 0.012);
  ctx.fillStyle = '#17100e';
  ctx.fill();
  // 书页侧面：叠层
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? '#c8b994' : '#b5a47e';
    ctx.fillRect(-w / 2 + S * 0.006, -h / 2 + S * 0.004 + i * (h * 0.006), w - S * 0.012, h * 0.004);
  }
  // 左右页
  for (const side of [-1, 1]) {
    const px = side < 0 ? -w / 2 : 0;
    const pg = ctx.createLinearGradient(px, 0, px + w / 2, 0);
    pg.addColorStop(0, side < 0 ? '#d8c9a6' : '#c8b892');
    pg.addColorStop(1, side < 0 ? '#c8b892' : '#d8c9a6');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(px, -h / 2);
    ctx.quadraticCurveTo(px + w * 0.25, -h / 2 - h * 0.02, px + w / 2, -h / 2 + h * 0.01);
    ctx.lineTo(px + w / 2, h / 2 - h * 0.01);
    ctx.quadraticCurveTo(px + w * 0.25, h / 2 + h * 0.02, px, h / 2);
    ctx.closePath(); ctx.fill();
  }
  // 中缝
  const gutter = ctx.createLinearGradient(-S * 0.03, 0, S * 0.03, 0);
  gutter.addColorStop(0, 'rgba(60,44,26,0)');
  gutter.addColorStop(0.5, 'rgba(44,30,18,0.55)');
  gutter.addColorStop(1, 'rgba(60,44,26,0)');
  ctx.fillStyle = gutter;
  ctx.fillRect(-S * 0.04, -h / 2, S * 0.08, h);
  // 泛黄页边
  ctx.fillStyle = 'rgba(120,90,50,0.18)';
  ctx.fillRect(-w / 2 + w * 0.03, -h / 2 + h * 0.02, w * 0.94, h * 0.02);
  // 手写账目：日期 / 名目 / 金额三列
  ctx.strokeStyle = 'rgba(62,46,30,0.45)';
  ctx.lineWidth = Math.max(0.8, S * 0.0012);
  for (let i = 0; i < 13; i++) {
    const ly = -h * 0.34 + i * h * 0.052;
    ctx.strokeStyle = i === 0 ? 'rgba(62,46,30,0.55)' : 'rgba(84,64,44,0.28)';
    ctx.beginPath(); ctx.moveTo(-w * 0.40, ly); ctx.lineTo(w * 0.40, ly); ctx.stroke();
    // 手写痕迹
    ctx.strokeStyle = 'rgba(54,40,26,0.5)';
    ctx.beginPath();
    const rw = i === 0 ? 0.12 : 0.08 + ((i * 7) % 5) * 0.012;
    ctx.moveTo(-w * 0.36, ly - h * 0.012);
    ctx.lineTo(-w * 0.36 + w * rw, ly - h * 0.012 + (i % 3) * 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w * 0.16, ly - h * 0.012);
    ctx.lineTo(-w * 0.16 + w * (0.10 + ((i * 11) % 4) * 0.02), ly - h * 0.012);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.16, ly - h * 0.012);
    ctx.lineTo(w * 0.16 + w * (0.05 + ((i * 5) % 3) * 0.015), ly - h * 0.012);
    ctx.stroke();
  }
  // 标题
  ctx.strokeStyle = 'rgba(48,34,22,0.65)';
  ctx.lineWidth = Math.max(1.4, S * 0.0022);
  ctx.beginPath();
  ctx.moveTo(-w * 0.30, -h * 0.41);
  ctx.lineTo(w * 0.22, -h * 0.41);
  ctx.stroke();
  // 红丝带书签
  ctx.fillStyle = 'rgba(122,24,32,0.85)';
  ctx.beginPath();
  ctx.moveTo(-S * 0.02, h / 2 - h * 0.02);
  ctx.lineTo(S * 0.02, h / 2 - h * 0.02);
  ctx.lineTo(S * 0.016, h / 2 + h * 0.16);
  ctx.lineTo(0, h / 2 + h * 0.11);
  ctx.lineTo(-S * 0.016, h / 2 + h * 0.16);
  ctx.closePath(); ctx.fill();
  // 一处旧墨渍
  ctx.fillStyle = 'rgba(36,24,16,0.35)';
  ctx.beginPath();
  ctx.ellipse(w * 0.26, h * 0.22, S * 0.016, S * 0.010, 0.4, 0, 6.3);
  ctx.fill();
  // 金色护角
  ctx.strokeStyle = 'rgba(196,160,86,0.5)';
  ctx.lineWidth = Math.max(1.2, S * 0.002);
  ctx.strokeRect(-w / 2 + 2, -h / 2 + 2, S * 0.03, S * 0.02);
  ctx.strokeRect(w / 2 - S * 0.032, h / 2 - S * 0.022, S * 0.03, S * 0.02);
  ctx.restore();
}

/* ---------- 档案袋与纸条 ---------- */

function drawArchiveProp(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.05);
  const w = S * 0.62, h = S * 0.44;
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(S * 0.03, h * 0.62, w * 0.62, S * 0.04, 0, 0, 6.3);
  ctx.fill();
  // 抽取出来的纸条
  ctx.save();
  ctx.translate(w * 0.10, -h * 0.30);
  ctx.rotate(0.07);
  ctx.fillStyle = '#e6dcc2';
  ctx.fillRect(-w * 0.42, -h * 0.55, w * 0.84, h * 0.80);
  ctx.strokeStyle = 'rgba(120,100,70,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-w * 0.42, -h * 0.55, w * 0.84, h * 0.80);
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = 'rgba(70,58,44,0.35)';
    ctx.beginPath();
    ctx.moveTo(-w * 0.36, -h * 0.44 + i * h * 0.075);
    ctx.lineTo(-w * 0.36 + w * (0.36 + ((i * 13) % 5) * 0.08), -h * 0.44 + i * h * 0.075);
    ctx.stroke();
  }
  // 红色机密章
  ctx.save();
  ctx.translate(w * 0.20, -h * 0.30);
  ctx.rotate(-0.18);
  ctx.strokeStyle = 'rgba(150,34,38,0.55)';
  ctx.lineWidth = Math.max(2, S * 0.004);
  ctx.strokeRect(-w * 0.20, -h * 0.09, w * 0.40, h * 0.18);
  ctx.fillStyle = 'rgba(150,34,38,0.5)';
  ctx.font = `600 ${Math.max(8, S * 0.026)}px "Georgia", "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.fillText('CONFIDENTIEL', 0, h * 0.014);
  ctx.textAlign = 'left';
  ctx.restore();
  // 回形针：夹在纸条左上角
  ctx.strokeStyle = 'rgba(198,204,210,0.8)';
  ctx.lineWidth = Math.max(1.4, S * 0.0026);
  ctx.beginPath();
  ctx.ellipse(-w * 0.285, -h * 0.485, w * 0.026, h * 0.085, 0.22, 0, 6.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-w * 0.285, -h * 0.485, w * 0.013, h * 0.046, 0.22, 0, 6.3);
  ctx.stroke();
  ctx.restore();
  // 牛皮档案袋
  const kraft = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  kraft.addColorStop(0, '#b8935c');
  kraft.addColorStop(0.5, '#a37d49');
  kraft.addColorStop(1, '#8a6638');
  ctx.fillStyle = kraft;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2 + h * 0.10);
  ctx.lineTo(-w * 0.20, -h / 2 + h * 0.10);
  ctx.lineTo(-w * 0.12, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  // 纸袋纤维与折痕
  ctx.strokeStyle = 'rgba(80,58,32,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-w / 2, h * 0.05); ctx.lineTo(w / 2, h * 0.07); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,186,0.10)';
  ctx.beginPath(); ctx.moveTo(-w / 2, h * 0.04); ctx.lineTo(w / 2, h * 0.06); ctx.stroke();
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(70,50,28,${rand(0.05, 0.14)})`;
    const fx = rand(-w * 0.48, w * 0.48), fy = rand(-h * 0.42, h * 0.44);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + rand(-4, 12), fy + rand(-2, 2)); ctx.stroke();
  }
  // 标签
  ctx.fillStyle = '#efe6cf';
  ctx.fillRect(-w * 0.34, h * 0.16, w * 0.44, h * 0.16);
  ctx.strokeStyle = 'rgba(90,70,44,0.35)';
  ctx.strokeRect(-w * 0.34, h * 0.16, w * 0.44, h * 0.16);
  ctx.fillStyle = 'rgba(50,40,28,0.5)';
  ctx.font = `600 ${Math.max(7, S * 0.019)}px "Georgia", serif`;
  ctx.fillText('No. 07 / 1992', -w * 0.30, h * 0.16 + h * 0.11);
  ctx.restore();
}

/* ---------- 紫外星图 ---------- */

function drawStarmapProp(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.02);
  const w = S * 0.84, h = S * 0.54;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath();
  ctx.ellipse(S * 0.02, h * 0.56, w * 0.56, S * 0.04, 0, 0, 6.3);
  ctx.fill();
  // 深蓝图纸
  const bg = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  bg.addColorStop(0, '#101a34');
  bg.addColorStop(0.5, '#162244');
  bg.addColorStop(1, '#0a1226');
  ctx.fillStyle = bg;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // 纸边
  ctx.strokeStyle = 'rgba(150,180,232,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  // 坐标网格
  ctx.strokeStyle = 'rgba(110,150,220,0.16)';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath(); ctx.moveTo(-w / 2 + w * i / 10, -h / 2); ctx.lineTo(-w / 2 + w * i / 10, h / 2); ctx.stroke();
  }
  for (let i = 1; i < 6; i++) {
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2 + h * i / 6); ctx.lineTo(w / 2, -h / 2 + h * i / 6); ctx.stroke();
  }
  // 星座：荧光线与星点
  const stars = [
    [-0.30, -0.24], [-0.10, -0.30], [0.02, -0.10], [0.22, -0.18], [0.34, 0.04],
    [0.12, 0.18], [-0.08, 0.30], [-0.28, 0.14], [-0.36, -0.04],
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(132,228,255,0.55)';
  ctx.lineWidth = Math.max(1, S * 0.0018);
  ctx.beginPath();
  stars.forEach(([sx, sy], i) => {
    const px = sx * w, py = sy * h;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.stroke();
  for (const [sx, sy] of stars) {
    const gx = sx * w, gy = sy * h;
    const halo = ctx.createRadialGradient(gx, gy, 0, gx, gy, S * 0.030);
    halo.addColorStop(0, 'rgba(210,248,255,0.55)');
    halo.addColorStop(1, 'rgba(150,220,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(gx, gy, S * 0.030, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(226,250,255,0.9)';
    ctx.beginPath(); ctx.arc(gx, gy, Math.max(1, S * 0.0038), 0, 6.3); ctx.fill();
  }
  // 手写的坐标批注
  ctx.strokeStyle = 'rgba(180,220,255,0.42)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    const ax = -w * 0.42 + i * w * 0.22, ay = h * 0.38;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + w * 0.10, ay); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax, ay + h * 0.05); ctx.lineTo(ax + w * 0.06, ay + h * 0.05); ctx.stroke();
  }
  // 圆周与刻度
  ctx.strokeStyle = 'rgba(120,160,230,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.38, h * 0.40, 0, 0, 6.3);
  ctx.stroke();
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * w * 0.38, Math.sin(a) * h * 0.40);
    ctx.lineTo(Math.cos(a) * w * (i % 3 === 0 ? 0.42 : 0.40), Math.sin(a) * h * (i % 3 === 0 ? 0.445 : 0.425));
    ctx.stroke();
  }
  ctx.restore();
  // 紫外手电：斜放在右下角，灯口漏出紫光
  ctx.save();
  ctx.translate(w * 0.36, h * 0.34);
  ctx.rotate(-0.9);
  ctx.fillStyle = '#20242c';
  rr(ctx, -S * 0.015, -S * 0.14, S * 0.030, S * 0.20, S * 0.008);
  ctx.fill();
  ctx.fillStyle = '#3a3f4a';
  rr(ctx, -S * 0.020, -S * 0.17, S * 0.040, S * 0.05, S * 0.008);
  ctx.fill();
  ctx.fillStyle = 'rgba(172,120,255,0.85)';
  ctx.beginPath(); ctx.ellipse(0, -S * 0.17, S * 0.016, S * 0.006, 0, 0, 6.3); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const uv = ctx.createRadialGradient(w * 0.30, h * 0.26, 0, w * 0.30, h * 0.26, S * 0.24);
  uv.addColorStop(0, 'rgba(148,104,255,0.20)');
  uv.addColorStop(1, 'rgba(120,80,240,0)');
  ctx.fillStyle = uv;
  ctx.beginPath(); ctx.arc(w * 0.30, h * 0.26, S * 0.24, 0, 6.3); ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ---------- 放大镜（压在画布碎片上） ---------- */

function drawLoupeProp(ctx, x, y, S, time, p, img) {
  ctx.save();
  ctx.translate(x, y);
  // 底下的一片画布
  ctx.save();
  ctx.rotate(-0.08);
  ctx.fillStyle = '#b9ab8c';
  ctx.beginPath();
  ctx.moveTo(-S * 0.34, -S * 0.18);
  ctx.lineTo(S * 0.30, -S * 0.24);
  ctx.lineTo(S * 0.36, S * 0.16);
  ctx.lineTo(-S * 0.28, S * 0.24);
  ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-S * 0.32, -S * 0.16);
  ctx.lineTo(S * 0.28, -S * 0.22);
  ctx.lineTo(S * 0.33, S * 0.14);
  ctx.lineTo(-S * 0.26, S * 0.22);
  ctx.closePath(); ctx.clip();
  starryPatch(ctx, -S * 0.34, -S * 0.26, S * 0.70, S * 0.50, false, img);
  ctx.restore();
  ctx.strokeStyle = 'rgba(240,230,208,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  // 放大镜
  const R = S * 0.19;
  ctx.rotate(0.18);
  // 手柄
  const hg = ctx.createLinearGradient(R * 0.7, 0, R * 1.9, 0);
  hg.addColorStop(0, '#5a3a1e');
  hg.addColorStop(0.4, '#a8783c');
  hg.addColorStop(0.7, '#6e4a24');
  hg.addColorStop(1, '#3c2714');
  ctx.fillStyle = hg;
  rr(ctx, R * 0.78, -R * 0.15, R * 1.28, R * 0.30, R * 0.14);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,232,180,0.16)';
  rr(ctx, R * 0.82, -R * 0.11, R * 1.10, R * 0.05, R * 0.03);
  ctx.fill();
  // 镜框
  const rim = ctx.createLinearGradient(-R, -R, R, R);
  rim.addColorStop(0, '#6e5224');
  rim.addColorStop(0.35, '#d8b878');
  rim.addColorStop(0.6, '#8a6a34');
  rim.addColorStop(1, '#4a3518');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(0, 0, R * 1.16, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#2a1c0e';
  ctx.beginPath(); ctx.arc(0, 0, R * 1.02, 0, 6.3); ctx.fill();
  // 镜片：放大后的星月夜
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.3); ctx.clip();
  ctx.translate(0, 0);
  ctx.scale(1.55, 1.55);
  starryPatch(ctx, -R, -R, R * 2, R * 2, false, img);
  // 镜片弧面反光
  const lens = ctx.createRadialGradient(-R * 0.35, -R * 0.38, 0, 0, 0, R * 1.1);
  lens.addColorStop(0, 'rgba(240,248,255,0.22)');
  lens.addColorStop(0.45, 'rgba(220,236,255,0.05)');
  lens.addColorStop(1, 'rgba(150,180,230,0.14)');
  ctx.fillStyle = lens;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.3); ctx.fill();
  ctx.restore();
  // 镜片高光弧
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = Math.max(1.2, S * 0.0026);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.86, 3.5, 5.1);
  ctx.stroke();
  ctx.restore();
}

/* ---------- 加密手机 ---------- */

function drawPhoneProp(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.06);
  const w = S * 0.34, h = S * 0.66;
  // 投影
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(S * 0.02, h * 0.54, w * 0.72, S * 0.03, 0, 0, 6.3);
  ctx.fill();
  // 机身
  const caseG = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  caseG.addColorStop(0, '#1a1d24');
  caseG.addColorStop(0.35, '#3a3f4a');
  caseG.addColorStop(0.6, '#22262e');
  caseG.addColorStop(1, '#0e1014');
  ctx.fillStyle = caseG;
  rr(ctx, -w / 2, -h / 2, w, h, w * 0.18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,196,220,0.18)';
  ctx.lineWidth = 1.2;
  rr(ctx, -w / 2, -h / 2, w, h, w * 0.18);
  ctx.stroke();
  // 屏幕
  ctx.fillStyle = '#060a12';
  rr(ctx, -w * 0.44, -h * 0.44, w * 0.88, h * 0.88, w * 0.12);
  ctx.fill();
  const scr = ctx.createLinearGradient(0, -h * 0.44, 0, h * 0.44);
  scr.addColorStop(0, '#0c1830');
  scr.addColorStop(1, '#04070e');
  ctx.fillStyle = scr;
  rr(ctx, -w * 0.42, -h * 0.42, w * 0.84, h * 0.84, w * 0.10);
  ctx.fill();
  // 状态栏：加密标识
  ctx.fillStyle = 'rgba(120,230,190,0.85)';
  ctx.beginPath(); ctx.arc(-w * 0.30, -h * 0.35, Math.max(1, w * 0.025), 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(150,166,190,0.55)';
  ctx.fillRect(w * 0.16, -h * 0.36, w * 0.18, 2.4);
  // 对话气泡
  const bubbles = [
    [-0.34, -0.24, 0.44, 0.10, 'left'],
    [-0.30, -0.10, 0.56, 0.12, 'right'],
    [-0.34, 0.06, 0.40, 0.08, 'left'],
    [-0.26, 0.19, 0.46, 0.09, 'right'],
  ];
  for (const [bx, by, bw, bh, side] of bubbles) {
    ctx.fillStyle = side === 'left' ? 'rgba(58,70,92,0.75)' : 'rgba(48,120,116,0.65)';
    rr(ctx, w * bx + (side === 'right' ? w * 0.10 : 0), h * by, w * bw, h * bh, w * 0.06);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,200,220,0.10)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // 文字行
    ctx.fillStyle = 'rgba(196,214,232,0.35)';
    for (let l = 0; l < 2; l++) {
      ctx.fillRect(w * bx + w * 0.06, h * by + h * (0.028 + l * 0.032), w * (bw - 0.16), 1.4);
    }
  }
  // 输入框与发送键
  ctx.fillStyle = 'rgba(30,40,56,0.8)';
  rr(ctx, -w * 0.38, h * 0.34, w * 0.60, h * 0.045, w * 0.04);
  ctx.fill();
  ctx.fillStyle = 'rgba(90,220,190,0.65)';
  ctx.beginPath(); ctx.arc(w * 0.30, h * 0.362, w * 0.055, 0, 6.3); ctx.fill();
  // 屏幕裂纹
  ctx.strokeStyle = 'rgba(210,226,244,0.35)';
  ctx.lineWidth = Math.max(0.8, S * 0.0014);
  ctx.beginPath();
  ctx.moveTo(-w * 0.18, -h * 0.30);
  ctx.lineTo(-w * 0.02, -h * 0.10);
  ctx.lineTo(-w * 0.12, h * 0.06);
  ctx.lineTo(w * 0.06, h * 0.22);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-w * 0.18, -h * 0.30);
  ctx.lineTo(-w * 0.34, -h * 0.18);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-w * 0.02, -h * 0.10);
  ctx.lineTo(w * 0.16, -h * 0.20);
  ctx.stroke();
  // 屏幕冷光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sl = ctx.createRadialGradient(0, -h * 0.10, 0, 0, -h * 0.10, S * 0.36);
  sl.addColorStop(0, 'rgba(110,180,255,0.14)');
  sl.addColorStop(1, 'rgba(110,180,255,0)');
  ctx.fillStyle = sl;
  ctx.beginPath(); ctx.ellipse(0, -h * 0.10, S * 0.30, S * 0.24, 0, 0, 6.3); ctx.fill();
  ctx.restore();
  ctx.restore();
}

/* ---------- 青铜小像 ---------- */

function drawSculptureProp(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  // 大理石底座（窄柱式）
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(S * 0.02, S * 0.31, S * 0.22, S * 0.032, 0, 0, 6.3);
  ctx.fill();
  const baseG = ctx.createLinearGradient(0, S * 0.17, 0, S * 0.31);
  baseG.addColorStop(0, '#6e6d66');
  baseG.addColorStop(0.35, '#52524c');
  baseG.addColorStop(1, '#2c2c28');
  ctx.fillStyle = baseG;
  ctx.beginPath();
  ctx.moveTo(-S * 0.135, S * 0.17);
  ctx.lineTo(S * 0.135, S * 0.17);
  ctx.lineTo(S * 0.165, S * 0.30);
  ctx.lineTo(-S * 0.165, S * 0.30);
  ctx.closePath(); ctx.fill();
  // 石纹与柱身明暗
  ctx.strokeStyle = 'rgba(226,224,212,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-S * 0.11 + i * S * 0.055, S * 0.18);
    ctx.quadraticCurveTo(-S * 0.07 + i * S * 0.055, S * 0.24, -S * 0.10 + i * S * 0.055, S * 0.29);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(14,14,12,0.25)';
  ctx.beginPath();
  ctx.moveTo(S * 0.05, S * 0.175);
  ctx.lineTo(S * 0.135, S * 0.17);
  ctx.lineTo(S * 0.165, S * 0.30);
  ctx.lineTo(S * 0.10, S * 0.30);
  ctx.closePath(); ctx.fill();
  // 台面
  ctx.fillStyle = '#8e8d84';
  ctx.beginPath(); ctx.ellipse(0, S * 0.17, S * 0.14, S * 0.020, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,246,0.12)';
  ctx.beginPath(); ctx.ellipse(-S * 0.01, S * 0.163, S * 0.10, S * 0.011, 0, 0, 6.3); ctx.fill();

  // 青铜舞者：圆头、束腰、一臂上扬、一腿后抬
  const bronze = ctx.createLinearGradient(-S * 0.16, -S * 0.44, S * 0.16, S * 0.14);
  bronze.addColorStop(0, '#8a6a34');
  bronze.addColorStop(0.32, '#d0a65c');
  bronze.addColorStop(0.55, '#8a6028');
  bronze.addColorStop(1, '#3a2810');
  ctx.strokeStyle = bronze;
  ctx.fillStyle = bronze;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lw = Math.max(2, S * 0.024);
  // 腿：一条直立于台面，一条后抬
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(-S * 0.012, S * 0.005);
  ctx.lineTo(-S * 0.018, S * 0.09);
  ctx.lineTo(-S * 0.030, S * 0.158);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(S * 0.020, S * 0.000);
  ctx.quadraticCurveTo(S * 0.100, -S * 0.010, S * 0.135, -S * 0.070);
  ctx.stroke();
  // 足尖
  ctx.beginPath();
  ctx.ellipse(-S * 0.034, S * 0.158, S * 0.012, S * 0.005, 0.1, 0, 6.3);
  ctx.fill();
  // 躯干
  ctx.beginPath();
  ctx.moveTo(-S * 0.006, -S * 0.255);
  ctx.quadraticCurveTo(-S * 0.048, -S * 0.180, -S * 0.026, -S * 0.085);
  ctx.quadraticCurveTo(-S * 0.014, -S * 0.015, S * 0.000, S * 0.005);
  ctx.quadraticCurveTo(S * 0.030, -S * 0.040, S * 0.034, -S * 0.130);
  ctx.quadraticCurveTo(S * 0.030, -S * 0.210, S * 0.010, -S * 0.258);
  ctx.closePath();
  ctx.fill();
  // 裙褶/腰线
  ctx.strokeStyle = 'rgba(46,30,12,0.40)';
  ctx.lineWidth = Math.max(0.8, S * 0.0018);
  ctx.beginPath();
  ctx.moveTo(-S * 0.022, -S * 0.160);
  ctx.quadraticCurveTo(-S * 0.004, -S * 0.150, S * 0.026, -S * 0.162);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-S * 0.012, -S * 0.080);
  ctx.quadraticCurveTo(-S * 0.004, -S * 0.030, S * 0.006, S * 0.000);
  ctx.stroke();
  // 颈与头
  ctx.strokeStyle = bronze;
  ctx.lineWidth = Math.max(1.4, S * 0.012);
  ctx.beginPath();
  ctx.moveTo(-S * 0.002, -S * 0.255);
  ctx.lineTo(S * 0.000, -S * 0.286);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(S * 0.002, -S * 0.322, S * 0.030, S * 0.038, -0.08, 0, 6.3);
  ctx.fill();
  // 发髻
  ctx.beginPath();
  ctx.ellipse(-S * 0.018, -S * 0.352, S * 0.020, S * 0.016, 0.3, 0, 6.3);
  ctx.fill();
  // 上扬的手臂
  ctx.strokeStyle = bronze;
  ctx.lineWidth = lw * 0.86;
  ctx.beginPath();
  ctx.moveTo(S * 0.008, -S * 0.238);
  ctx.quadraticCurveTo(S * 0.080, -S * 0.330, S * 0.132, -S * 0.430);
  ctx.stroke();
  // 前伸的手臂
  ctx.beginPath();
  ctx.moveTo(-S * 0.020, -S * 0.212);
  ctx.quadraticCurveTo(-S * 0.090, -S * 0.195, -S * 0.140, -S * 0.150);
  ctx.stroke();
  // 手
  ctx.beginPath(); ctx.arc(S * 0.136, -S * 0.438, Math.max(1.6, S * 0.010), 0, 6.3); ctx.fill();
  ctx.beginPath(); ctx.arc(-S * 0.144, -S * 0.148, Math.max(1.6, S * 0.010), 0, 6.3); ctx.fill();
  // 高光：頭肩与大腿
  ctx.strokeStyle = 'rgba(255,228,168,0.35)';
  ctx.lineWidth = Math.max(1, S * 0.0022);
  ctx.beginPath();
  ctx.moveTo(-S * 0.020, -S * 0.240);
  ctx.quadraticCurveTo(-S * 0.042, -S * 0.190, -S * 0.028, -S * 0.140);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(S * 0.000, -S * 0.323, S * 0.020, 3.6, 5.0);
  ctx.stroke();
  // 铜绿
  ctx.fillStyle = 'rgba(78,126,100,0.30)';
  ctx.beginPath(); ctx.ellipse(-S * 0.020, -S * 0.090, S * 0.018, S * 0.028, 0.2, 0, 6.3); ctx.fill();
  ctx.beginPath(); ctx.ellipse(S * 0.096, -S * 0.040, S * 0.012, S * 0.018, -0.4, 0, 6.3); ctx.fill();
  ctx.restore();
}

/* ---------- 咖啡杯 ---------- */

function drawCoffeeProp(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  // 木托盘
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath(); ctx.ellipse(S * 0.02, S * 0.235, S * 0.27, S * 0.028, 0, 0, 6.3); ctx.fill();
  const tray = ctx.createLinearGradient(0, S * 0.10, 0, S * 0.22);
  tray.addColorStop(0, '#6e4e30');
  tray.addColorStop(1, '#3e2a18');
  ctx.fillStyle = tray;
  ctx.beginPath(); ctx.ellipse(0, S * 0.16, S * 0.255, S * 0.058, 0, 0, 6.3); ctx.fill();
  ctx.fillStyle = 'rgba(255,230,190,0.12)';
  ctx.beginPath(); ctx.ellipse(0, S * 0.145, S * 0.225, S * 0.038, 0, 0, 6.3); ctx.fill();
  // 两只杯
  const cupAt = (cx, cy, cs) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(cs, cs);
    // 碟
    ctx.fillStyle = '#ddd6c4';
    ctx.beginPath(); ctx.ellipse(0, S * 0.045, S * 0.115, S * 0.032, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(120,108,88,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, S * 0.045, S * 0.095, S * 0.024, 0, 0, 6.3); ctx.stroke();
    // 杯身
    const body = ctx.createLinearGradient(-S * 0.06, 0, S * 0.06, 0);
    body.addColorStop(0, '#f2eee2');
    body.addColorStop(0.45, '#ded7c6');
    body.addColorStop(1, '#aaa190');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-S * 0.070, -S * 0.045);
    ctx.quadraticCurveTo(-S * 0.076, S * 0.010, -S * 0.050, S * 0.040);
    ctx.lineTo(S * 0.050, S * 0.040);
    ctx.quadraticCurveTo(S * 0.076, S * 0.010, S * 0.070, -S * 0.045);
    ctx.closePath(); ctx.fill();
    // 杯口
    ctx.fillStyle = '#efe9da';
    ctx.beginPath(); ctx.ellipse(0, -S * 0.045, S * 0.072, S * 0.022, 0, 0, 6.3); ctx.fill();
    // 咖啡液面与油脂
    const cof = ctx.createRadialGradient(-S * 0.01, -S * 0.047, 0, 0, -S * 0.045, S * 0.06);
    cof.addColorStop(0, '#6a3c1c');
    cof.addColorStop(0.6, '#3e2210');
    cof.addColorStop(1, '#24120a');
    ctx.fillStyle = cof;
    ctx.beginPath(); ctx.ellipse(0, -S * 0.045, S * 0.058, S * 0.017, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = 'rgba(214,160,96,0.35)';
    ctx.beginPath(); ctx.ellipse(-S * 0.014, -S * 0.048, S * 0.020, S * 0.007, -0.3, 0, 6.3); ctx.fill();
    // 杯耳
    ctx.strokeStyle = '#ded7c6';
    ctx.lineWidth = Math.max(1.4, S * 0.004);
    ctx.beginPath();
    ctx.arc(S * 0.078, -S * 0.006, S * 0.036, -1.3, 1.2);
    ctx.stroke();
    ctx.restore();
  };
  cupAt(-S * 0.11, S * 0.048, 0.88);
  cupAt(S * 0.14, S * 0.062, 0.80);
  // 勺
  ctx.strokeStyle = 'rgba(198,204,210,0.8)';
  ctx.lineWidth = Math.max(1.2, S * 0.003);
  ctx.beginPath();
  ctx.moveTo(S * 0.0, S * 0.185);
  ctx.lineTo(S * 0.075, S * 0.12);
  ctx.stroke();
  ctx.fillStyle = 'rgba(214,220,226,0.75)';
  ctx.beginPath(); ctx.ellipse(-S * 0.006, S * 0.19, S * 0.014, S * 0.008, -0.7, 0, 6.3); ctx.fill();
  // 热气
  ctx.strokeStyle = 'rgba(255,244,224,0.18)';
  ctx.lineWidth = Math.max(1, S * 0.002);
  for (const [hx, hy] of [[-S * 0.13, -S * 0.012], [S * 0.12, S * 0.005]]) {
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(hx + S * 0.02, hy - S * 0.06, hx - S * 0.006, hy - S * 0.11);
    ctx.quadraticCurveTo(hx + S * 0.012, hy - S * 0.16, hx - S * 0.002, hy - S * 0.20);
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------- 《月光下的未完奏鸣》 ---------------- */

// 手抄乐谱：左页题字，右页是真正的《悲怆》第二乐章谱面
function drawScoreProp(ctx, x, y, S, time, p, img, text) {
  const w = S * 1.40, h = S * 0.92;
  const lx = -w / 2, ly = -h / 2;
  const lw = w * 0.455;
  const rx = lx + lw + S * 0.006, ry = ly;
  const rw = w - lw - S * 0.006;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.018);

  // 落在桌面的投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.62)';
  ctx.shadowBlur = S * 0.16;
  ctx.shadowOffsetY = S * 0.075;
  ctx.fillStyle = 'rgba(20,14,12,0.9)';
  ctx.fillRect(lx - S * 0.012, ly + S * 0.010, w + S * 0.024, h + S * 0.014);
  ctx.restore();

  // 下面叠着的两页纸边
  for (let i = 2; i >= 1; i--) {
    ctx.fillStyle = i === 1 ? 'rgba(198,180,148,0.55)' : 'rgba(176,158,128,0.40)';
    ctx.fillRect(lx + i * 2.4, ly + i * 2.0, w, h);
  }

  // 纸页底色
  const page = (px, py, pw, ph) => {
    const g = ctx.createLinearGradient(px, py, px + pw, py + ph);
    g.addColorStop(0, '#f3e7cd');
    g.addColorStop(0.45, '#ecdcbc');
    g.addColorStop(1, '#dcc9a4');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, pw, ph);
    // 纤维与斑点
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${120 + (i % 5) * 14},${92 + (i % 4) * 12},${56 + (i % 3) * 10},${0.018 + (i % 3) * 0.012})`;
      ctx.beginPath();
      ctx.ellipse(px + perm(i, 1) * pw, py + perm(i, 2) * ph,
        S * (0.003 + perm(i, 3) * 0.004), S * (0.002 + perm(i, 4) * 0.002), i, 0, 6.3);
      ctx.fill();
    }
    // 受光边
    ctx.strokeStyle = 'rgba(255,250,234,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  };
  page(lx, ly, lw, h);
  page(rx, ry, rw, h);

  // 中缝：书脊阴影
  const sp = ctx.createLinearGradient(lx + lw - S * 0.012, 0, rx + S * 0.014, 0);
  sp.addColorStop(0, 'rgba(70,48,28,0)');
  sp.addColorStop(0.5, 'rgba(70,48,28,0.34)');
  sp.addColorStop(1, 'rgba(70,48,28,0)');
  ctx.fillStyle = sp;
  ctx.fillRect(lx + lw - S * 0.014, ly, S * 0.030, h);

  /* 右页：谱面 */
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, h);
  ctx.clip();
  // 先铺纸色，再用 multiply 把白底乐谱压成旧纸色
  ctx.fillStyle = '#eee0c2';
  ctx.fillRect(rx, ry, rw, h);
  if (img && img.width) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const scale = Math.max(rw / img.width, h / img.height);
    const iw = img.width * scale, ih = img.height * scale;
    ctx.drawImage(img, rx + (rw - iw) / 2, ry + (h - ih) / 2, iw, ih);
    ctx.restore();
  } else {
    // 图未加载时的保底谱面
    ctx.strokeStyle = 'rgba(52,40,30,0.55)';
    ctx.lineWidth = 1;
    for (let sys = 0; sys < 4; sys++) {
      const sy = ry + h * (0.17 + sys * 0.21);
      for (let l = 0; l < 5; l++) {
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.10, sy + l * S * 0.009);
        ctx.lineTo(rx + rw * 0.90, sy + l * S * 0.009);
        ctx.stroke();
      }
      for (let n = 0; n < 7; n++) {
        ctx.fillStyle = 'rgba(40,32,26,0.72)';
        ctx.beginPath();
        ctx.ellipse(rx + rw * (0.16 + n * 0.105), sy + S * 0.018 + (n % 3) * S * 0.006,
          S * 0.0055, S * 0.0042, -0.4, 0, 6.3);
        ctx.fill();
      }
    }
  }
  // 纸面受光与边角暗部
  const sheen = ctx.createLinearGradient(rx, ry, rx + rw, ry + h);
  sheen.addColorStop(0, 'rgba(255,248,228,0.18)');
  sheen.addColorStop(0.4, 'rgba(255,248,228,0.04)');
  sheen.addColorStop(1, 'rgba(96,64,38,0.10)');
  ctx.fillStyle = sheen;
  ctx.fillRect(rx, ry, rw, h);
  const cornerShade = ctx.createRadialGradient(rx + rw, ry + h, 0, rx + rw, ry + h, rw * 0.55);
  cornerShade.addColorStop(0, 'rgba(86,56,30,0.22)');
  cornerShade.addColorStop(1, 'rgba(86,56,30,0)');
  ctx.fillStyle = cornerShade;
  ctx.fillRect(rx, ry, rw, h);

  // 铅笔批注：圈住某几小节、渐强记号、指法
  ctx.strokeStyle = 'rgba(72,82,96,0.42)';
  ctx.lineWidth = Math.max(1, S * 0.0024);
  ctx.beginPath();
  ctx.ellipse(rx + rw * 0.66, ry + h * 0.40, rw * 0.085, h * 0.055, -0.05, 0, 6.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx + rw * 0.18, ry + h * 0.66);
  ctx.lineTo(rx + rw * 0.20, ry + h * 0.695);
  ctx.moveTo(rx + rw * 0.62, ry + h * 0.70);
  ctx.lineTo(rx + rw * 0.60, ry + h * 0.735);
  ctx.stroke();
  ctx.font = `${Math.max(7, S * 0.020)}px "Noto Serif SC", "Songti SC", serif`;
  ctx.fillStyle = 'rgba(66,78,96,0.55)';
  for (let i = 0; i < 4; i++) {
    ctx.fillText(`${i + 2}`, rx + rw * (0.10 + i * 0.22), ry + h * (0.14 + (i % 2) * 0.36));
  }
  // 页脚的一行铅笔字
  ctx.save();
  ctx.translate(rx + rw * 0.82, ry + h * 0.86);
  ctx.rotate(-0.045);
  ctx.font = `${Math.max(11, S * 0.036)}px "Noto Serif SC", "Songti SC", serif`;
  ctx.fillStyle = 'rgba(58,54,52,0.50)';
  ctx.fillText('慢一些', 0, 0);
  ctx.restore();
  ctx.restore();

  /* 左页：题字与签名 */
  // 顶部咖啡渍
  ctx.strokeStyle = 'rgba(120,86,50,0.14)';
  ctx.lineWidth = Math.max(2, S * 0.005);
  ctx.beginPath();
  ctx.arc(lx + lw * 0.76, ly + h * 0.10, S * 0.070, 0.4, 5.9);
  ctx.stroke();
  ctx.fillStyle = 'rgba(120,86,50,0.035)';
  ctx.beginPath();
  ctx.arc(lx + lw * 0.76, ly + h * 0.10, S * 0.062, 0, 6.3);
  ctx.fill();

  // 竖排标题
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const title = '夏夜月光变奏';
  ctx.font = `${Math.max(16, S * 0.062)}px "Noto Serif SC", "Songti SC", "STSong", serif`;
  const ink = 'rgba(44,34,44,0.86)';
  for (let i = 0; i < title.length; i++) {
    ctx.fillStyle = ink;
    ctx.fillText(title[i], lx + lw * 0.62, ly + h * (0.17 + i * 0.086));
    // 墨迹洇开
    ctx.save();
    ctx.globalAlpha = 0.10 + (i % 3) * 0.02;
    ctx.filter = 'blur(1px)';
    ctx.fillStyle = '#2c222c';
    ctx.fillText(title[i], lx + lw * 0.62 + 1, ly + h * (0.17 + i * 0.086) + 1);
    ctx.restore();
  }
  ctx.font = `${Math.max(10, S * 0.030)}px "Noto Serif SC", "Songti SC", serif`;
  const sub = '致 苏 晚';
  for (let i = 0; i < sub.length; i++) {
    ctx.fillStyle = 'rgba(52,42,52,0.80)';
    ctx.fillText(sub[i], lx + lw * 0.38, ly + h * (0.22 + i * 0.095));
  }
  // 落款
  ctx.textAlign = 'right';
  ctx.font = `${Math.max(9, S * 0.026)}px "Noto Serif SC", "Songti SC", serif`;
  ctx.fillStyle = 'rgba(52,44,50,0.72)';
  ctx.fillText('林深', lx + lw * 0.78, ly + h * 0.80);
  ctx.font = `${Math.max(7, S * 0.019)}px "Noto Serif SC", "Songti SC", serif`;
  ctx.fillStyle = 'rgba(74,66,60,0.62)';
  ctx.fillText('二〇一九 · 夏', lx + lw * 0.78, ly + h * 0.855);
  // 手绘的一行谱
  ctx.strokeStyle = 'rgba(52,46,48,0.40)';
  ctx.lineWidth = Math.max(1, S * 0.0018);
  for (let l = 0; l < 5; l++) {
    ctx.beginPath();
    ctx.moveTo(lx + lw * 0.14, ly + h * 0.655 + l * S * 0.008);
    ctx.lineTo(lx + lw * 0.86, ly + h * 0.655 + l * S * 0.008);
    ctx.stroke();
  }
  for (let n = 0; n < 5; n++) {
    ctx.fillStyle = 'rgba(48,40,44,0.62)';
    ctx.beginPath();
    ctx.ellipse(lx + lw * (0.22 + n * 0.13), ly + h * 0.671 + (n % 3) * S * 0.0055,
      S * 0.0062, S * 0.0048, -0.4, 0, 6.3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(48,40,44,0.55)';
    ctx.lineWidth = Math.max(1, S * 0.0018);
    ctx.beginPath();
    ctx.moveTo(lx + lw * (0.226 + n * 0.13), ly + h * 0.671 + (n % 3) * S * 0.0055);
    ctx.lineTo(lx + lw * (0.226 + n * 0.13), ly + h * 0.671 - S * 0.045 + (n % 3) * S * 0.0055);
    ctx.stroke();
  }

  // 书口的层叠纸边
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(120,96,64,${0.18 - i * 0.03})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx + 1 + i, ly + h - 1 + i * 0.8);
    ctx.lineTo(rx + rw - 1 + i, ly + h - 1 + i * 0.8);
    ctx.stroke();
  }

  // 红色书签带：从右页上方垂下来
  ctx.save();
  ctx.strokeStyle = 'rgba(128,30,38,0.82)';
  ctx.lineWidth = Math.max(3, S * 0.010);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rx + rw * 0.86, ry - S * 0.006);
  ctx.bezierCurveTo(rx + rw * 0.86 + S * 0.02, ry + h * 0.30,
    rx + rw * 0.86 - S * 0.02, ry + h * 0.62, rx + rw * 0.84, ly + h + S * 0.085);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,160,150,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rx + rw * 0.86 - S * 0.003, ry);
  ctx.bezierCurveTo(rx + rw * 0.86 + S * 0.017, ry + h * 0.30,
    rx + rw * 0.86 - S * 0.023, ry + h * 0.62, rx + rw * 0.84 - S * 0.003, ly + h + S * 0.085);
  ctx.stroke();
  ctx.restore();

  // 木头铅笔：斜搁在右下角
  ctx.save();
  ctx.translate(rx + rw * 0.30, ly + h + S * 0.035);
  ctx.rotate(-0.14);
  const pl = S * 0.44, pr = S * 0.011;
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(0, S * 0.016, pl * 0.55, S * 0.010, 0, 0, 6.3);
  ctx.fill();
  // 笔杆
  const wood = ctx.createLinearGradient(0, -pr, 0, pr);
  wood.addColorStop(0, '#d9b06c');
  wood.addColorStop(0.35, '#b98748');
  wood.addColorStop(0.7, '#8c5e30');
  wood.addColorStop(1, '#5e3c1e');
  ctx.fillStyle = wood;
  ctx.fillRect(-pl * 0.5, -pr, pl, pr * 2);
  // 棱线
  ctx.strokeStyle = 'rgba(255,232,186,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-pl * 0.5, -pr * 0.25);
  ctx.lineTo(pl * 0.5 - S * 0.05, -pr * 0.25);
  ctx.stroke();
  // 削出的木锥与笔芯
  ctx.fillStyle = '#e4c894';
  ctx.beginPath();
  ctx.moveTo(pl * 0.5, -pr);
  ctx.lineTo(pl * 0.5 + S * 0.055, 0);
  ctx.lineTo(pl * 0.5, pr);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a2626';
  ctx.beginPath();
  ctx.moveTo(pl * 0.5 + S * 0.030, -pr * 0.40);
  ctx.lineTo(pl * 0.5 + S * 0.055, 0);
  ctx.lineTo(pl * 0.5 + S * 0.030, pr * 0.40);
  ctx.closePath();
  ctx.fill();
  // 尾端金属箍与橡皮
  ctx.fillStyle = 'rgba(180,180,190,0.8)';
  ctx.fillRect(-pl * 0.5, -pr, S * 0.018, pr * 2);
  ctx.fillStyle = 'rgba(214,130,120,0.85)';
  ctx.fillRect(-pl * 0.5 - S * 0.020, -pr, S * 0.020, pr * 2);
  ctx.restore();

  // 橡皮屑
  ctx.fillStyle = 'rgba(214,198,170,0.45)';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.ellipse(rx + rw * (0.10 + (i * 0.073) % 0.55), ly + h * (0.86 + (i % 3) * 0.025),
      S * (0.004 + (i % 2) * 0.003), S * 0.0025, i, 0, 6.3);
    ctx.fill();
  }

  ctx.restore();
}

// 小提琴与打开的琴盒
function drawViolinProp(ctx, x, y, S, time, p, text) {
  const caseW = S * 1.30, caseH = S * 0.90;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.012);

  // 琴盒投影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.72)';
  ctx.shadowBlur = S * 0.18;
  ctx.shadowOffsetY = S * 0.085;
  const leather = ctx.createLinearGradient(-caseW / 2, -caseH / 2, caseW / 2, caseH / 2);
  leather.addColorStop(0, '#2b181d');
  leather.addColorStop(0.42, '#44252c');
  leather.addColorStop(0.72, '#2a151b');
  leather.addColorStop(1, '#160b0f');
  ctx.fillStyle = leather;
  rr(ctx, -caseW / 2, -caseH / 2, caseW, caseH, S * 0.15);
  ctx.fill();
  ctx.restore();

  // 皮面压纹与缝线
  ctx.strokeStyle = 'rgba(198,140,108,0.22)';
  ctx.lineWidth = Math.max(1, S * 0.0026);
  rr(ctx, -caseW / 2 + S * 0.020, -caseH / 2 + S * 0.020, caseW - S * 0.040, caseH - S * 0.040, S * 0.132);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.30)';
  ctx.lineWidth = Math.max(1.6, S * 0.004);
  rr(ctx, -caseW / 2 + S * 0.008, -caseH / 2 + S * 0.008, caseW - S * 0.016, caseH - S * 0.016, S * 0.144);
  ctx.stroke();

  // 天鹅绒内衬
  const velvet = ctx.createRadialGradient(-caseW * 0.08, -caseH * 0.12, S * 0.04, 0, 0, caseW * 0.62);
  velvet.addColorStop(0, '#67283a');
  velvet.addColorStop(0.42, '#4a1c29');
  velvet.addColorStop(0.78, '#31101b');
  velvet.addColorStop(1, '#1e0a12');
  ctx.fillStyle = velvet;
  rr(ctx, -caseW * 0.455, -caseH * 0.415, caseW * 0.91, caseH * 0.83, S * 0.095);
  ctx.fill();

  // 绒面：细密短绒和褶皱
  ctx.save();
  ctx.beginPath();
  rr(ctx, -caseW * 0.455, -caseH * 0.415, caseW * 0.91, caseH * 0.83, S * 0.095);
  ctx.clip();
  for (let i = 0; i < 90; i++) {
    const gx = -caseW * 0.44 + ((i * 0.618) % 1) * caseW * 0.88;
    const gy = -caseH * 0.40 + ((i * 0.383) % 1) * caseH * 0.80;
    ctx.strokeStyle = `rgba(190,110,124,${0.035 + (i % 4) * 0.012})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + S * 0.004, gy + S * 0.014);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(150,80,96,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const vx = -caseW * 0.36 + i * caseW * 0.11;
    ctx.beginPath();
    ctx.moveTo(vx, -caseH * 0.38);
    ctx.quadraticCurveTo(vx + S * 0.02, 0, vx - S * 0.016, caseH * 0.38);
    ctx.stroke();
  }
  // 内衬上缘的阴影
  const inShade = ctx.createLinearGradient(0, -caseH * 0.42, 0, -caseH * 0.20);
  inShade.addColorStop(0, 'rgba(0,0,0,0.50)');
  inShade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = inShade;
  ctx.fillRect(-caseW * 0.46, -caseH * 0.42, caseW * 0.92, caseH * 0.24);
  ctx.restore();

  // 琴盒五金：中央锁扣、侧扣、提手
  const brass = ctx.createLinearGradient(0, -caseH * 0.43, 0, -caseH * 0.37);
  brass.addColorStop(0, '#c8aa72');
  brass.addColorStop(0.5, '#8c7044');
  brass.addColorStop(1, '#5e4828');
  ctx.fillStyle = brass;
  rr(ctx, -S * 0.048, -caseH * 0.432, S * 0.096, S * 0.030, S * 0.006);
  ctx.fill();
  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(-S * 0.020, -caseH * 0.424, S * 0.040, S * 0.012);
  ctx.fillStyle = 'rgba(255,236,190,0.55)';
  ctx.fillRect(-S * 0.044, -caseH * 0.429, S * 0.088, 1);
  ctx.fillStyle = 'rgba(190,160,108,0.65)';
  rr(ctx, caseW * 0.34, -S * 0.026, S * 0.112, S * 0.052, S * 0.012);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,44,26,0.8)';
  ctx.lineWidth = 1.2;
  rr(ctx, caseW * 0.345, -S * 0.021, S * 0.102, S * 0.042, S * 0.010);
  ctx.stroke();

  // —— 小提琴（横躺，琴头朝右）——
  ctx.save();
  ctx.translate(-S * 0.028, -S * 0.048);
  ctx.rotate(1.44);

  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(0, -0.300 * S);
    ctx.bezierCurveTo(0.048 * S, -0.300 * S, 0.093 * S, -0.272 * S, 0.099 * S, -0.238 * S);
    ctx.bezierCurveTo(0.104 * S, -0.206 * S, 0.098 * S, -0.176 * S, 0.082 * S, -0.150 * S);
    ctx.lineTo(0.094 * S, -0.140 * S);
    ctx.bezierCurveTo(0.066 * S, -0.122 * S, 0.058 * S, -0.104 * S, 0.061 * S, -0.084 * S);
    ctx.bezierCurveTo(0.059 * S, -0.062 * S, 0.058 * S, -0.048 * S, 0.064 * S, -0.034 * S);
    ctx.lineTo(0.096 * S, -0.044 * S);
    ctx.bezierCurveTo(0.106 * S, 0.014 * S, 0.136 * S, 0.100 * S, 0.148 * S, 0.172 * S);
    ctx.bezierCurveTo(0.156 * S, 0.240 * S, 0.132 * S, 0.340 * S, 0.074 * S, 0.392 * S);
    ctx.bezierCurveTo(0.048 * S, 0.414 * S, 0.024 * S, 0.424 * S, 0, 0.424 * S);
    ctx.bezierCurveTo(-0.024 * S, 0.424 * S, -0.048 * S, 0.414 * S, -0.074 * S, 0.392 * S);
    ctx.bezierCurveTo(-0.132 * S, 0.340 * S, -0.156 * S, 0.240 * S, -0.148 * S, 0.172 * S);
    ctx.bezierCurveTo(-0.136 * S, 0.100 * S, -0.106 * S, 0.014 * S, -0.096 * S, -0.044 * S);
    ctx.lineTo(-0.064 * S, -0.034 * S);
    ctx.bezierCurveTo(-0.058 * S, -0.048 * S, -0.059 * S, -0.062 * S, -0.061 * S, -0.084 * S);
    ctx.bezierCurveTo(-0.058 * S, -0.104 * S, -0.066 * S, -0.122 * S, -0.094 * S, -0.140 * S);
    ctx.lineTo(-0.082 * S, -0.150 * S);
    ctx.bezierCurveTo(-0.098 * S, -0.176 * S, -0.104 * S, -0.206 * S, -0.099 * S, -0.238 * S);
    ctx.bezierCurveTo(-0.093 * S, -0.272 * S, -0.048 * S, -0.300 * S, 0, -0.300 * S);
    ctx.closePath();
  };

  // 琴身投影
  ctx.save();
  ctx.translate(S * 0.016, S * 0.022);
  ctx.fillStyle = 'rgba(8,2,4,0.60)';
  bodyPath();
  ctx.fill();
  ctx.restore();

  // 面板：琥珀到深棕
  const wood = ctx.createRadialGradient(-S * 0.035, -S * 0.06, S * 0.03, 0, S * 0.06, S * 0.56);
  wood.addColorStop(0, '#e2a152');
  wood.addColorStop(0.28, '#c07a36');
  wood.addColorStop(0.55, '#98551f');
  wood.addColorStop(0.80, '#6a3212');
  wood.addColorStop(1, '#3a1608');
  ctx.fillStyle = wood;
  bodyPath();
  ctx.fill();

  // 木纹与清漆
  ctx.save();
  bodyPath();
  ctx.clip();
  ctx.strokeStyle = 'rgba(72,32,10,0.20)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 34; i++) {
    const gx = -S * 0.15 + (i / 33) * S * 0.30;
    ctx.beginPath();
    ctx.moveTo(gx, -S * 0.31);
    ctx.bezierCurveTo(gx + S * 0.020, -S * 0.10, gx - S * 0.018, S * 0.12, gx + S * 0.010, S * 0.44);
    ctx.stroke();
  }
  // 中心拼板缝
  ctx.strokeStyle = 'rgba(52,22,8,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -S * 0.30);
  ctx.lineTo(0, S * 0.424);
  ctx.stroke();
  const gloss = ctx.createLinearGradient(-S * 0.20, -S * 0.22, S * 0.22, S * 0.30);
  gloss.addColorStop(0, 'rgba(255,232,180,0.20)');
  gloss.addColorStop(0.34, 'rgba(255,232,180,0.03)');
  gloss.addColorStop(0.58, 'rgba(30,10,2,0.16)');
  gloss.addColorStop(0.82, 'rgba(255,220,160,0.06)');
  gloss.addColorStop(1, 'rgba(255,236,190,0.14)');
  ctx.fillStyle = gloss;
  ctx.fillRect(-S * 0.5, -S * 0.5, S, S);
  ctx.restore();

  // 边缘与双线镶边
  ctx.strokeStyle = 'rgba(255,206,140,0.42)';
  ctx.lineWidth = Math.max(1.2, S * 0.0032);
  bodyPath();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(44,18,8,0.62)';
  ctx.lineWidth = Math.max(1.2, S * 0.0028);
  ctx.save();
  ctx.scale(0.962, 0.972);
  bodyPath();
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(235,196,132,0.26)';
  ctx.lineWidth = 1;
  ctx.save();
  ctx.scale(0.938, 0.955);
  bodyPath();
  ctx.stroke();
  ctx.restore();

  // f 孔：跨在琴马两侧的 S 形开槽
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(28,10,4,0.94)';
    ctx.lineWidth = Math.max(2.2, S * 0.0062);
    ctx.beginPath();
    ctx.moveTo(s * S * 0.058, S * 0.040);
    ctx.bezierCurveTo(s * S * 0.070, S * 0.070, s * S * 0.058, S * 0.098, s * S * 0.050, S * 0.120);
    ctx.bezierCurveTo(s * S * 0.042, S * 0.144, s * S * 0.052, S * 0.172, s * S * 0.042, S * 0.198);
    ctx.stroke();
    // 上下两个圆头
    ctx.fillStyle = 'rgba(24,8,3,0.95)';
    ctx.beginPath();
    ctx.arc(s * S * 0.058, S * 0.038, S * 0.0080, 0, 6.3);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s * S * 0.041, S * 0.200, S * 0.0076, 0, 6.3);
    ctx.fill();
    // 开槽上侧的窄亮边，表现面板的厚度
    ctx.strokeStyle = 'rgba(255,214,156,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s * S * 0.066, S * 0.044);
    ctx.bezierCurveTo(s * S * 0.077, S * 0.072, s * S * 0.066, S * 0.098, s * S * 0.057, S * 0.120);
    ctx.stroke();
    // 琴马旁的小刻痕
    ctx.strokeStyle = 'rgba(34,14,6,0.65)';
    ctx.lineWidth = Math.max(1.4, S * 0.0032);
    ctx.beginPath();
    ctx.moveTo(s * S * 0.052, S * 0.118);
    ctx.lineTo(s * S * 0.036, S * 0.128);
    ctx.stroke();
    ctx.restore();
  }

  // 琴马
  ctx.fillStyle = '#e0b97a';
  ctx.beginPath();
  ctx.moveTo(-S * 0.058, S * 0.132);
  ctx.lineTo(-S * 0.050, S * 0.108);
  ctx.lineTo(-S * 0.020, S * 0.102);
  ctx.lineTo(-S * 0.008, S * 0.112);
  ctx.lineTo(0, S * 0.106);
  ctx.lineTo(S * 0.008, S * 0.112);
  ctx.lineTo(S * 0.020, S * 0.102);
  ctx.lineTo(S * 0.050, S * 0.108);
  ctx.lineTo(S * 0.058, S * 0.132);
  ctx.lineTo(S * 0.040, S * 0.136);
  ctx.lineTo(S * 0.030, S * 0.126);
  ctx.lineTo(-S * 0.030, S * 0.126);
  ctx.lineTo(-S * 0.040, S * 0.136);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(96,60,24,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-S * 0.030, S * 0.126);
  ctx.lineTo(S * 0.030, S * 0.126);
  ctx.stroke();

  // 指板
  const fb = ctx.createLinearGradient(-S * 0.036, 0, S * 0.036, 0);
  fb.addColorStop(0, '#1a1010');
  fb.addColorStop(0.42, '#3a2320');
  fb.addColorStop(0.68, '#241614');
  fb.addColorStop(1, '#0d0707');
  ctx.fillStyle = fb;
  ctx.beginPath();
  ctx.moveTo(-S * 0.020, -S * 0.448);
  ctx.lineTo(S * 0.020, -S * 0.448);
  ctx.lineTo(S * 0.031, -S * 0.300);
  ctx.lineTo(S * 0.040, -S * 0.020);
  ctx.lineTo(S * 0.036, S * 0.012);
  ctx.lineTo(-S * 0.036, S * 0.012);
  ctx.lineTo(-S * 0.040, -S * 0.020);
  ctx.lineTo(-S * 0.031, -S * 0.300);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(210,170,120,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-S * 0.019, -S * 0.444);
  ctx.lineTo(-S * 0.029, -S * 0.300);
  ctx.lineTo(-S * 0.038, -S * 0.024);
  ctx.stroke();

  // 琴颈
  const neck = ctx.createLinearGradient(-S * 0.026, 0, S * 0.026, 0);
  neck.addColorStop(0, '#4a2410');
  neck.addColorStop(0.45, '#71401f');
  neck.addColorStop(1, '#331607');
  ctx.fillStyle = neck;
  ctx.beginPath();
  ctx.moveTo(-S * 0.026, -S * 0.296);
  ctx.lineTo(S * 0.026, -S * 0.296);
  ctx.lineTo(S * 0.021, -S * 0.452);
  ctx.lineTo(-S * 0.021, -S * 0.452);
  ctx.closePath();
  ctx.fill();
  // 琴颈上的清漆高光
  ctx.strokeStyle = 'rgba(255,212,150,0.20)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-S * 0.014, -S * 0.302);
  ctx.lineTo(-S * 0.011, -S * 0.448);
  ctx.stroke();

  // 弦轴箱与琴头
  ctx.fillStyle = '#3c1c0c';
  ctx.beginPath();
  ctx.moveTo(-S * 0.021, -S * 0.450);
  ctx.lineTo(S * 0.021, -S * 0.450);
  ctx.lineTo(S * 0.018, -S * 0.556);
  ctx.lineTo(-S * 0.018, -S * 0.556);
  ctx.closePath();
  ctx.fill();
  // 弦轴
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const py = -S * 0.470 - Math.floor(i / 2) * S * 0.040;
    ctx.fillStyle = '#1c0e08';
    ctx.beginPath();
    ctx.ellipse(side * S * 0.028, py, S * 0.008, S * 0.013, side * 0.2, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,196,140,0.50)';
    ctx.fillRect(side * S * 0.021, py - 1, side * 0.012 * S, 2);
  }
  // 涡卷
  ctx.save();
  ctx.translate(0, -S * 0.574);
  ctx.strokeStyle = '#5a2c12';
  ctx.lineWidth = Math.max(3, S * 0.012);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, S * 0.020);
  ctx.bezierCurveTo(-S * 0.012, S * 0.006, -S * 0.030, -S * 0.008, -S * 0.020, -S * 0.026);
  ctx.bezierCurveTo(-S * 0.010, -S * 0.044, S * 0.020, -S * 0.038, S * 0.026, -S * 0.018);
  ctx.bezierCurveTo(S * 0.032, S * 0.002, S * 0.010, S * 0.014, -S * 0.002, S * 0.004);
  ctx.bezierCurveTo(-S * 0.012, -S * 0.006, -S * 0.004, -S * 0.020, S * 0.008, -S * 0.016);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,214,156,0.24)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-S * 0.010, S * 0.016);
  ctx.bezierCurveTo(-S * 0.020, 0, -S * 0.020, -S * 0.018, -S * 0.008, -S * 0.026);
  ctx.stroke();
  ctx.restore();

  // 拉弦板与微调
  ctx.fillStyle = '#1d1110';
  ctx.beginPath();
  ctx.moveTo(-S * 0.030, S * 0.212);
  ctx.lineTo(S * 0.030, S * 0.212);
  ctx.lineTo(S * 0.020, S * 0.344);
  ctx.lineTo(-S * 0.020, S * 0.344);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(210,172,120,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(206,176,120,0.55)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-S * 0.015 + i * S * 0.010, S * 0.326, S * 0.0035, 0, 6.3);
    ctx.fill();
  }

  // 四根弦
  for (let i = 0; i < 4; i++) {
    const tail = -S * 0.021 + i * S * 0.014;
    const bridge = -S * 0.021 + i * S * 0.014;
    const nut = -S * 0.012 + i * S * 0.008;
    ctx.strokeStyle = `rgba(228,220,198,${0.52 - i * 0.04})`;
    ctx.lineWidth = Math.max(0.9, S * 0.0018 + (3 - i) * S * 0.0004);
    ctx.beginPath();
    ctx.moveTo(tail * 0.35, S * 0.322);
    ctx.lineTo(bridge, S * 0.126);
    ctx.lineTo(nut, -S * 0.446);
    ctx.stroke();
  }

  // 腮托：贴在下缘的一侧，不再是面板中央的暗洞
  ctx.save();
  ctx.translate(-S * 0.110, S * 0.300);
  ctx.rotate(-0.38);
  const crG = ctx.createLinearGradient(-S * 0.030, 0, S * 0.030, 0);
  crG.addColorStop(0, '#3a2018');
  crG.addColorStop(0.5, '#5a3224');
  crG.addColorStop(1, '#21110c');
  ctx.fillStyle = crG;
  ctx.beginPath();
  ctx.ellipse(0, 0, S * 0.030, S * 0.044, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(228,188,138,0.26)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 0, S * 0.027, S * 0.040, 0, -2.7, 1.2);
  ctx.stroke();
  // 金属卡扣
  ctx.fillStyle = 'rgba(206,176,120,0.55)';
  ctx.fillRect(-S * 0.004, -S * 0.040, S * 0.008, S * 0.022);
  ctx.fillStyle = 'rgba(120,88,52,0.55)';
  ctx.beginPath();
  ctx.arc(0, S * 0.030, S * 0.005, 0, 6.3);
  ctx.fill();
  ctx.restore();

  ctx.restore(); // 小提琴

  // —— 琴弓：横躺在下方 ——
  ctx.save();
  ctx.translate(0, S * 0.318);
  ctx.rotate(-0.014);
  const bowL = S * 0.94;
  // 弓杆投影
  ctx.strokeStyle = 'rgba(0,0,0,0.42)';
  ctx.lineWidth = Math.max(3, S * 0.010);
  ctx.beginPath();
  ctx.moveTo(-bowL * 0.5 + 2, 4);
  ctx.quadraticCurveTo(0, S * 0.016, bowL * 0.5 + 2, 4);
  ctx.stroke();
  // 弓毛
  ctx.strokeStyle = 'rgba(236,228,206,0.62)';
  ctx.lineWidth = Math.max(2.6, S * 0.008);
  ctx.beginPath();
  ctx.moveTo(-bowL * 0.485, S * 0.012);
  ctx.quadraticCurveTo(0, S * 0.020, bowL * 0.485, S * 0.006);
  ctx.stroke();
  // 弓杆
  const stick = ctx.createLinearGradient(0, -S * 0.012, 0, S * 0.006);
  stick.addColorStop(0, '#8a4a1e');
  stick.addColorStop(0.45, '#5e2c10');
  stick.addColorStop(1, '#2e1206');
  ctx.strokeStyle = stick;
  ctx.lineWidth = Math.max(2.6, S * 0.008);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-bowL * 0.495, 0);
  ctx.quadraticCurveTo(0, -S * 0.012, bowL * 0.49, -S * 0.002);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,214,156,0.24)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-bowL * 0.48, -S * 0.004);
  ctx.quadraticCurveTo(0, -S * 0.017, bowL * 0.47, -S * 0.006);
  ctx.stroke();
  // 马尾库、缠线与握皮
  ctx.fillStyle = '#171010';
  rr(ctx, -bowL * 0.505, -S * 0.017, S * 0.055, S * 0.042, S * 0.006);
  ctx.fill();
  ctx.fillStyle = 'rgba(206,186,150,0.62)';
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(-bowL * 0.446 + i * S * 0.005, -S * 0.010, 1.6, S * 0.026);
  }
  ctx.fillStyle = 'rgba(40,24,18,0.85)';
  rr(ctx, -bowL * 0.365, -S * 0.011, S * 0.052, S * 0.026, S * 0.005);
  ctx.fill();
  // 弓尖
  ctx.fillStyle = 'rgba(222,206,170,0.75)';
  ctx.beginPath();
  ctx.moveTo(bowL * 0.47, -S * 0.008);
  ctx.lineTo(bowL * 0.505, -S * 0.003);
  ctx.lineTo(bowL * 0.492, S * 0.010);
  ctx.lineTo(bowL * 0.462, S * 0.004);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 琴盒左下的松香与绒布
  ctx.save();
  ctx.translate(-caseW * 0.33, S * 0.285);
  ctx.fillStyle = 'rgba(36,22,34,0.75)';
  rr(ctx, -S * 0.05, -S * 0.036, S * 0.10, S * 0.072, S * 0.012);
  ctx.fill();
  // 松香
  const rosin = ctx.createLinearGradient(-S * 0.03, -S * 0.02, S * 0.03, S * 0.02);
  rosin.addColorStop(0, '#e0a844');
  rosin.addColorStop(0.5, '#b47622');
  rosin.addColorStop(1, '#6e3e0e');
  ctx.fillStyle = rosin;
  ctx.beginPath();
  ctx.ellipse(0, 0, S * 0.030, S * 0.024, -0.18, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,232,170,0.35)';
  ctx.beginPath();
  ctx.ellipse(-S * 0.008, -S * 0.007, S * 0.012, S * 0.006, -0.18, 0, 6.3);
  ctx.fill();
  // 绒布
  ctx.fillStyle = 'rgba(52,32,46,0.75)';
  ctx.beginPath();
  ctx.moveTo(-S * 0.078, S * 0.030);
  ctx.quadraticCurveTo(-S * 0.02, S * 0.010, S * 0.036, S * 0.038);
  ctx.quadraticCurveTo(S * 0.018, S * 0.062, -S * 0.028, S * 0.060);
  ctx.quadraticCurveTo(-S * 0.062, S * 0.052, -S * 0.078, S * 0.030);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// 黑白琴键特写
function drawPianoProp(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.028);

  const kw = S * 1.24;
  const keyTop = -S * 0.235;
  const keyH = S * 0.545;
  const keyBot = keyTop + keyH;

  // 温暖的琴灯底光
  const amb = ctx.createRadialGradient(-kw * 0.14, -S * 0.42, S * 0.04, 0, -S * 0.02, S * 0.92);
  amb.addColorStop(0, 'rgba(255,206,140,0.16)');
  amb.addColorStop(0.55, 'rgba(255,190,120,0.05)');
  amb.addColorStop(1, 'rgba(255,180,110,0)');
  ctx.fillStyle = amb;
  ctx.fillRect(-kw * 0.8, -S * 0.9, kw * 1.6, S * 1.6);

  // 谱台：竖起的黑色亮面木板
  const deskTop = -S * 0.66, deskBot = -S * 0.285;
  const desk = ctx.createLinearGradient(0, deskTop, 0, deskBot);
  desk.addColorStop(0, '#1a1418');
  desk.addColorStop(0.42, '#241b1f');
  desk.addColorStop(0.72, '#120d11');
  desk.addColorStop(1, '#080508');
  ctx.fillStyle = desk;
  ctx.beginPath();
  ctx.moveTo(-kw * 0.56, deskTop + S * 0.030);
  ctx.lineTo(kw * 0.56, deskTop + S * 0.030);
  ctx.lineTo(kw * 0.58, deskBot);
  ctx.lineTo(-kw * 0.58, deskBot);
  ctx.closePath();
  ctx.fill();
  // 谱台顶部圆角与高光
  ctx.strokeStyle = 'rgba(226,190,140,0.20)';
  ctx.lineWidth = Math.max(1.2, S * 0.003);
  ctx.beginPath();
  ctx.moveTo(-kw * 0.555, deskTop + S * 0.034);
  ctx.lineTo(kw * 0.555, deskTop + S * 0.034);
  ctx.stroke();
  // 谱台两侧的木框
  ctx.fillStyle = 'rgba(58,32,20,0.85)';
  ctx.fillRect(-kw * 0.585, deskTop + S * 0.020, kw * 0.030, deskBot - deskTop - S * 0.015);
  ctx.fillRect(kw * 0.555, deskTop + S * 0.020, kw * 0.030, deskBot - deskTop - S * 0.015);
  ctx.fillStyle = 'rgba(255,206,150,0.12)';
  ctx.fillRect(-kw * 0.585, deskTop + S * 0.020, kw * 0.030, 1.4);
  ctx.fillRect(kw * 0.555, deskTop + S * 0.020, kw * 0.030, 1.4);

  // 谱台上摊开的乐谱
  ctx.save();
  ctx.translate(-kw * 0.105, deskTop + S * 0.060);
  ctx.rotate(0.018);
  const pageW = kw * 0.255, pageH = S * 0.245;
  // 左页
  ctx.fillStyle = 'rgba(236,226,202,0.94)';
  ctx.beginPath();
  ctx.moveTo(-pageW, 0);
  ctx.lineTo(0, S * 0.006);
  ctx.lineTo(0, pageH);
  ctx.lineTo(-pageW, pageH - S * 0.004);
  ctx.closePath();
  ctx.fill();
  // 右页
  ctx.fillStyle = 'rgba(244,236,214,0.96)';
  ctx.beginPath();
  ctx.moveTo(0, S * 0.006);
  ctx.lineTo(pageW, 0);
  ctx.lineTo(pageW, pageH - S * 0.004);
  ctx.lineTo(0, pageH);
  ctx.closePath();
  ctx.fill();
  // 中缝阴影
  const gutter = ctx.createLinearGradient(-S * 0.018, 0, S * 0.022, 0);
  gutter.addColorStop(0, 'rgba(80,64,44,0)');
  gutter.addColorStop(0.5, 'rgba(52,38,24,0.30)');
  gutter.addColorStop(1, 'rgba(80,64,44,0)');
  ctx.fillStyle = gutter;
  ctx.fillRect(-S * 0.02, 0, S * 0.045, pageH);
  // 五线谱与音符
  ctx.strokeStyle = 'rgba(64,50,34,0.42)';
  ctx.lineWidth = 0.9;
  for (let stave = 0; stave < 2; stave++) {
    for (const side of [-1, 1]) {
      const sx = side < 0 ? -pageW * 0.86 : pageW * 0.10;
      const sw = pageW * 0.76;
      const sy = S * 0.052 + stave * S * 0.098;
      for (let l = 0; l < 5; l++) {
        ctx.beginPath();
        ctx.moveTo(sx, sy + l * S * 0.0105);
        ctx.lineTo(sx + sw, sy + l * S * 0.0105);
        ctx.stroke();
      }
      // 音符
      for (let n = 0; n < 7; n++) {
        const nx = sx + sw * (0.10 + n * 0.125);
        const ny = sy + S * 0.0105 * (1 + ((n * 3 + stave + (side > 0 ? 1 : 0)) % 5));
        ctx.fillStyle = 'rgba(44,32,20,0.72)';
        ctx.beginPath();
        ctx.ellipse(nx, ny, S * 0.0048, S * 0.0036, -0.35, 0, 6.3);
        ctx.fill();
        if (n % 2 === 0) {
          ctx.strokeStyle = 'rgba(44,32,20,0.62)';
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.moveTo(nx + S * 0.0044, ny);
          ctx.lineTo(nx + S * 0.0044, ny - S * 0.026);
          ctx.stroke();
        }
      }
    }
  }
  ctx.restore();

  // 琴灯：一小片暖光落在谱台与键床上
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lamp = ctx.createRadialGradient(-kw * 0.22, -S * 0.50, 0, -kw * 0.22, -S * 0.50, S * 0.48);
  lamp.addColorStop(0, 'rgba(255,226,168,0.20)');
  lamp.addColorStop(0.5, 'rgba(255,214,150,0.06)');
  lamp.addColorStop(1, 'rgba(255,210,150,0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(-kw, -S * 0.95, kw * 2, S * 1.0);
  ctx.restore();

  // 谱台下沿的阴影，压在琴键上
  const deskShadow = ctx.createLinearGradient(0, deskBot, 0, deskBot + S * 0.075);
  deskShadow.addColorStop(0, 'rgba(0,0,0,0.55)');
  deskShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = deskShadow;
  ctx.fillRect(-kw * 0.60, deskBot, kw * 1.20, S * 0.075);

  // 红色毛毡条
  ctx.fillStyle = '#7c1e26';
  ctx.fillRect(-kw * 0.58, deskBot - S * 0.008, kw * 1.16, S * 0.014);
  ctx.fillStyle = 'rgba(226,120,120,0.30)';
  ctx.fillRect(-kw * 0.58, deskBot - S * 0.007, kw * 1.16, 1.6);

  // —— 白键 ——
  const whiteCount = 21;
  const keyW = kw / whiteCount;
  const rnd = (i, k) => {
    const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < whiteCount; i++) {
    const x0 = -kw / 2 + i * keyW;
    const press = i === 14;
    const dy = press ? S * 0.011 : 0;
    const tone = 0.955 + rnd(i, 1) * 0.045;
    const ivory = ctx.createLinearGradient(x0, 0, x0 + keyW, 0);
    ivory.addColorStop(0, `rgba(${(198 * tone) | 0},${(186 * tone) | 0},${(162 * tone) | 0},1)`);
    ivory.addColorStop(0.10, `rgba(${(239 * tone) | 0},${(231 * tone) | 0},${(210 * tone) | 0},1)`);
    ivory.addColorStop(0.34, `rgba(${(251 * tone) | 0},${(246 * tone) | 0},${(228 * tone) | 0},1)`);
    ivory.addColorStop(0.60, `rgba(${(246 * tone) | 0},${(240 * tone) | 0},${(220 * tone) | 0},1)`);
    ivory.addColorStop(0.86, `rgba(${(226 * tone) | 0},${(216 * tone) | 0},${(192 * tone) | 0},1)`);
    ivory.addColorStop(1, `rgba(${(188 * tone) | 0},${(176 * tone) | 0},${(152 * tone) | 0},1)`);
    ctx.fillStyle = ivory;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.7, keyTop - dy + 1.5);
    ctx.lineTo(x0 + keyW - 0.7, keyTop - dy + 1.5);
    ctx.lineTo(x0 + keyW - 1.2, keyBot - dy - 2);
    ctx.quadraticCurveTo(x0 + keyW - 1.2, keyBot - dy, x0 + keyW - 3.0, keyBot - dy);
    ctx.lineTo(x0 + 3.0, keyBot - dy);
    ctx.quadraticCurveTo(x0 + 1.2, keyBot - dy, x0 + 1.2, keyBot - dy - 2);
    ctx.closePath();
    ctx.fill();

    // 键缝阴影
    ctx.strokeStyle = 'rgba(44,32,24,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, keyTop - dy + 2);
    ctx.lineTo(x0 + 0.5, keyBot - dy - 3);
    ctx.stroke();
    // 左侧受光
    ctx.strokeStyle = 'rgba(255,252,238,0.24)';
    ctx.beginPath();
    ctx.moveTo(x0 + 1.6, keyTop - dy + 2);
    ctx.lineTo(x0 + 1.6, keyBot - dy - 4);
    ctx.stroke();
    // 前端倒角
    ctx.strokeStyle = press ? 'rgba(120,98,76,0.45)' : 'rgba(160,142,116,0.35)';
    ctx.beginPath();
    ctx.moveTo(x0 + 3, keyBot - dy - 2.5);
    ctx.lineTo(x0 + keyW - 3, keyBot - dy - 2.5);
    ctx.stroke();
    // 键面淡淡的纵向纹理
    if (i % 3 === 0) {
      ctx.strokeStyle = 'rgba(150,128,100,0.05)';
      ctx.beginPath();
      ctx.moveTo(x0 + keyW * 0.35, keyTop + 4);
      ctx.lineTo(x0 + keyW * 0.32, keyBot - 6);
      ctx.stroke();
    }
    // 按下键的阴影
    if (press) {
      ctx.fillStyle = 'rgba(50,32,18,0.20)';
      ctx.fillRect(x0 + 1, keyBot - dy - S * 0.018, keyW - 2, S * 0.018);
    }
  }

  // —— 黑键 ——
  const blackPattern = [0, 1, 3, 4, 5];
  const blackW = keyW * 0.585;
  const blackH = keyH * 0.575;
  for (let i = 0; i < whiteCount - 1; i++) {
    if (!blackPattern.includes(i % 7)) continue;
    const cx = -kw / 2 + (i + 1) * keyW;
    const bx = cx - blackW / 2;
    const pressed = i === 9;
    const by = keyTop - S * 0.004 + (pressed ? S * 0.006 : 0);
    const bh = blackH;
    // 投影
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.moveTo(bx + 2.2, by + 2.5);
    ctx.lineTo(bx + blackW + 2.2, by + 2.5);
    ctx.lineTo(bx + blackW - blackW * 0.06 + 2.2, by + bh + 3.5);
    ctx.lineTo(bx + blackW * 0.06 + 2.2, by + bh + 3.5);
    ctx.closePath();
    ctx.fill();
    // 键体
    const bg = ctx.createLinearGradient(0, by, 0, by + bh);
    bg.addColorStop(0, '#353039');
    bg.addColorStop(0.08, '#1c1820');
    bg.addColorStop(0.45, '#0c0910');
    bg.addColorStop(0.80, '#151118');
    bg.addColorStop(1, '#050305');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + blackW, by);
    ctx.lineTo(bx + blackW - blackW * 0.055, by + bh - 3);
    ctx.lineTo(bx + blackW - blackW * 0.10, by + bh);
    ctx.lineTo(bx + blackW * 0.10, by + bh);
    ctx.lineTo(bx + blackW * 0.055, by + bh - 3);
    ctx.closePath();
    ctx.fill();
    // 左侧镜面高光
    const side = ctx.createLinearGradient(bx, 0, bx + blackW * 0.20, 0);
    side.addColorStop(0, 'rgba(255,248,230,0.22)');
    side.addColorStop(1, 'rgba(255,248,230,0)');
    ctx.fillStyle = side;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + blackW * 0.16, by);
    ctx.lineTo(bx + blackW * 0.11, by + bh - 4);
    ctx.lineTo(bx + blackW * 0.045, by + bh - 4);
    ctx.closePath();
    ctx.fill();
    // 顶部棱线
    ctx.strokeStyle = 'rgba(255,246,224,0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx + 0.8, by + 0.8);
    ctx.lineTo(bx + blackW - 0.8, by + 0.8);
    ctx.stroke();
    // 前端斜面
    ctx.fillStyle = 'rgba(255,238,206,0.10)';
    ctx.beginPath();
    ctx.moveTo(bx + blackW * 0.10, by + bh);
    ctx.lineTo(bx + blackW * 0.90, by + bh);
    ctx.lineTo(bx + blackW * 0.86, by + bh - 2.5);
    ctx.lineTo(bx + blackW * 0.14, by + bh - 2.5);
    ctx.closePath();
    ctx.fill();
  }

  // 左右颊板（琴侧木块）
  for (const s of [-1, 1]) {
    const ax = s < 0 ? -kw * 0.5 - S * 0.030 : kw * 0.5 - S * 0.006;
    const cheek = ctx.createLinearGradient(ax, 0, ax + S * 0.036, 0);
    cheek.addColorStop(0, s < 0 ? '#2a1610' : '#160c08');
    cheek.addColorStop(0.45, '#4c2a18');
    cheek.addColorStop(1, s < 0 ? '#160c08' : '#2a1610');
    ctx.fillStyle = cheek;
    ctx.fillRect(ax, deskBot - S * 0.010, S * 0.036, keyBot - deskBot + S * 0.075);
    ctx.strokeStyle = 'rgba(255,214,160,0.20)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ax + 0.5, deskBot - S * 0.010 + 0.5, S * 0.035, keyBot - deskBot + S * 0.074);
  }

  // 前端木条与品牌铭牌
  const frontTop = keyBot + S * 0.006;
  const frontH = S * 0.085;
  const frontG = ctx.createLinearGradient(0, frontTop, 0, frontTop + frontH);
  frontG.addColorStop(0, '#3a2013');
  frontG.addColorStop(0.18, '#5a321c');
  frontG.addColorStop(0.62, '#2e1810');
  frontG.addColorStop(1, '#150a06');
  ctx.fillStyle = frontG;
  ctx.beginPath();
  ctx.moveTo(-kw * 0.58, frontTop);
  ctx.lineTo(kw * 0.58, frontTop);
  ctx.lineTo(kw * 0.60, frontTop + frontH);
  ctx.lineTo(-kw * 0.60, frontTop + frontH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,220,168,0.22)';
  ctx.fillRect(-kw * 0.58, frontTop, kw * 1.16, 1.6);
  // 金色铭牌
  const plateW = kw * 0.135, plateH = S * 0.028;
  const plate = ctx.createLinearGradient(0, frontTop + S * 0.026, 0, frontTop + S * 0.026 + plateH);
  plate.addColorStop(0, 'rgba(228,196,132,0.55)');
  plate.addColorStop(0.5, 'rgba(160,124,64,0.45)');
  plate.addColorStop(1, 'rgba(104,76,34,0.40)');
  ctx.fillStyle = plate;
  ctx.beginPath();
  ctx.ellipse(0, frontTop + S * 0.036, plateW * 0.5, plateH * 0.55, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,228,172,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, frontTop + S * 0.036, plateW * 0.46, plateH * 0.48, 0, 0, 6.3);
  ctx.stroke();

  // 琴键表面上方的柔和反光
  const sheen = ctx.createLinearGradient(0, keyTop, 0, keyBot);
  sheen.addColorStop(0, 'rgba(255,248,226,0.10)');
  sheen.addColorStop(0.45, 'rgba(255,248,226,0)');
  sheen.addColorStop(1, 'rgba(20,12,8,0.10)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-kw * 0.5, keyTop, kw, keyH);

  ctx.restore();
}

// 橘子汽水易拉罐
function drawSodaProp(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.05);

  const cw = S * 0.30, ch = S * 0.78;
  const left = -cw * 0.5, top = ch * 0.5 - ch;

  // 桌面投影：离罐底越远越淡
  const shx = S * 0.035, shy = ch * 0.5 + S * 0.024;
  const sh = ctx.createRadialGradient(shx, shy, cw * 0.10, shx, shy, cw * 0.95);
  sh.addColorStop(0, 'rgba(0,0,0,0.52)');
  sh.addColorStop(0.42, 'rgba(0,0,0,0.30)');
  sh.addColorStop(0.75, 'rgba(0,0,0,0.10)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(shx, shy, cw * 0.95, S * 0.072, 0, 0, 6.3);
  ctx.fill();
  // 罐底贴地的一层接触阴影
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(S * 0.02, ch * 0.5 + S * 0.012, cw * 0.50, S * 0.016, 0, 0, 6.3);
  ctx.fill();

  // 罐身
  const body = ctx.createLinearGradient(left, 0, left + cw, 0);
  body.addColorStop(0, '#8c3a14');
  body.addColorStop(0.10, '#e07020');
  body.addColorStop(0.28, '#ffb04a');
  body.addColorStop(0.45, '#ffd27a');
  body.addColorStop(0.60, '#ff9a36');
  body.addColorStop(0.82, '#c44e16');
  body.addColorStop(1, '#6e2a0e');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(left, top + S * 0.035);
  ctx.quadraticCurveTo(left - S * 0.010, 0, left, ch * 0.5 - S * 0.035);
  ctx.lineTo(left + cw, ch * 0.5 - S * 0.035);
  ctx.quadraticCurveTo(left + cw + S * 0.010, 0, left + cw, top + S * 0.035);
  ctx.closePath();
  ctx.fill();

  // 罐身标签：橙色切片与气泡
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top + S * 0.06, cw, ch - S * 0.12);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,238,196,0.92)';
  ctx.fillRect(left + cw * 0.08, -ch * 0.18, cw * 0.84, ch * 0.36);
  // 橙子切片：果皮、白络、果肉与瓣缝
  const ox = left + cw * 0.5, oy = S * 0.010;
  const orr = cw * 0.300;
  const peel = ctx.createRadialGradient(ox - orr * 0.3, oy - orr * 0.3, orr * 0.1, ox, oy, orr);
  peel.addColorStop(0, '#ff9a2e');
  peel.addColorStop(0.72, '#f2761c');
  peel.addColorStop(0.90, '#d85a10');
  peel.addColorStop(1, '#b8460c');
  ctx.fillStyle = peel;
  ctx.beginPath();
  ctx.arc(ox, oy, orr, 0, 6.3);
  ctx.fill();
  // 白络
  ctx.strokeStyle = 'rgba(255,244,214,0.85)';
  ctx.lineWidth = Math.max(1.6, S * 0.006);
  ctx.beginPath();
  ctx.arc(ox, oy, orr * 0.86, 0, 6.3);
  ctx.stroke();
  // 果肉
  const flesh = ctx.createRadialGradient(ox - orr * 0.25, oy - orr * 0.30, orr * 0.05, ox, oy, orr * 0.86);
  flesh.addColorStop(0, '#ffd977');
  flesh.addColorStop(0.6, '#ffbf55');
  flesh.addColorStop(1, '#f89a34');
  ctx.fillStyle = flesh;
  ctx.beginPath();
  ctx.arc(ox, oy, orr * 0.82, 0, 6.3);
  ctx.fill();
  // 八瓣果肉的缝隙与瓣面高光
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283;
    const a2 = ((i + 0.5) / 8) * 6.283;
    ctx.strokeStyle = 'rgba(255,244,212,0.72)';
    ctx.lineWidth = Math.max(1.2, S * 0.004);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(a) * orr * 0.80, oy + Math.sin(a) * orr * 0.80);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,240,0.28)';
    ctx.lineWidth = Math.max(1, S * 0.003);
    ctx.beginPath();
    ctx.arc(ox, oy, orr * 0.60, a2 - 0.14, a2 + 0.14);
    ctx.stroke();
  }
  // 果心
  ctx.fillStyle = 'rgba(255,236,180,0.90)';
  ctx.beginPath();
  ctx.arc(ox, oy, orr * 0.075, 0, 6.3);
  ctx.fill();
  // 标签上下沿的深橙细带
  ctx.fillStyle = 'rgba(196,72,16,0.80)';
  ctx.fillRect(left + cw * 0.08, -ch * 0.195, cw * 0.84, S * 0.006);
  ctx.fillRect(left + cw * 0.08, ch * 0.178 - S * 0.006, cw * 0.84, S * 0.006);
  // 品牌字
  ctx.fillStyle = 'rgba(150,58,14,0.90)';
  ctx.font = `600 ${Math.max(7, S * 0.034)}px "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('橘子汽水', ox, -ch * 0.145);
  ctx.fillStyle = 'rgba(174,84,30,0.72)';
  ctx.font = `${Math.max(5, S * 0.0135)}px "Noto Serif SC", serif`;
  ctx.fillText('O R A N G E   S O D A', ox, ch * 0.155);
  ctx.textBaseline = 'alphabetic';
  // 细小的气泡
  ctx.fillStyle = 'rgba(255,250,236,0.55)';
  for (let i = 0; i < 22; i++) {
    ctx.beginPath();
    ctx.arc(left + cw * ((i * 0.137) % 0.92) + cw * 0.04, top + S * 0.10 + (i * 0.083) % (ch * 0.72),
      S * (0.002 + (i % 3) * 0.0015), 0, 6.3);
    ctx.fill();
  }
  ctx.restore();

  // 罐身明暗与金属高光
  const shadeG = ctx.createLinearGradient(left, 0, left + cw, 0);
  shadeG.addColorStop(0, 'rgba(40,10,0,0.42)');
  shadeG.addColorStop(0.16, 'rgba(40,10,0,0)');
  shadeG.addColorStop(0.62, 'rgba(255,250,220,0.10)');
  shadeG.addColorStop(0.84, 'rgba(40,10,0,0)');
  shadeG.addColorStop(1, 'rgba(20,6,0,0.45)');
  ctx.fillStyle = shadeG;
  ctx.beginPath();
  ctx.moveTo(left, top + S * 0.035);
  ctx.quadraticCurveTo(left - S * 0.010, 0, left, ch * 0.5 - S * 0.035);
  ctx.lineTo(left + cw, ch * 0.5 - S * 0.035);
  ctx.quadraticCurveTo(left + cw + S * 0.010, 0, left + cw, top + S * 0.035);
  ctx.closePath();
  ctx.fill();
  // 竖直镜面高光：用渐变收边，让柱面转过去
  const spec = ctx.createLinearGradient(left + cw * 0.16, 0, left + cw * 0.28, 0);
  spec.addColorStop(0, 'rgba(255,252,238,0)');
  spec.addColorStop(0.5, 'rgba(255,252,238,0.30)');
  spec.addColorStop(1, 'rgba(255,252,238,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(left + cw * 0.16, top + S * 0.06, cw * 0.12, ch - S * 0.13);
  const spec2 = ctx.createLinearGradient(left + cw * 0.65, 0, left + cw * 0.72, 0);
  spec2.addColorStop(0, 'rgba(255,252,238,0)');
  spec2.addColorStop(0.5, 'rgba(255,252,238,0.14)');
  spec2.addColorStop(1, 'rgba(255,252,238,0)');
  ctx.fillStyle = spec2;
  ctx.fillRect(left + cw * 0.65, top + S * 0.08, cw * 0.07, ch - S * 0.16);

  // 顶部罐盖：外圈卷边、下沉的盖面与拉环
  const cx0 = left + cw * 0.5;
  const rimY = top + S * 0.034;
  const rimG = ctx.createLinearGradient(left, rimY - S * 0.02, left + cw, rimY + S * 0.02);
  rimG.addColorStop(0, '#8c9098');
  rimG.addColorStop(0.22, '#e4e8ee');
  rimG.addColorStop(0.46, '#c2c7ce');
  rimG.addColorStop(0.72, '#f0f3f6');
  rimG.addColorStop(1, '#878c94');
  ctx.fillStyle = rimG;
  ctx.beginPath();
  ctx.ellipse(cx0, rimY, cw * 0.505, S * 0.033, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx0, rimY - S * 0.004, cw * 0.46, S * 0.024, 0, Math.PI, 6.3);
  ctx.fill();
  // 下沉盖面
  const lidG = ctx.createLinearGradient(0, rimY - S * 0.022, 0, rimY + S * 0.020);
  lidG.addColorStop(0, '#9ba0a8');
  lidG.addColorStop(0.47, '#cfd3d9');
  lidG.addColorStop(1, '#a8adb4');
  ctx.fillStyle = lidG;
  ctx.beginPath();
  ctx.ellipse(cx0, rimY + S * 0.002, cw * 0.415, S * 0.023, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96,102,110,0.72)';
  ctx.lineWidth = Math.max(1.2, S * 0.003);
  ctx.beginPath();
  ctx.ellipse(cx0, rimY + S * 0.002, cw * 0.335, S * 0.016, 0, 0, 6.3);
  ctx.stroke();
  // 拉环：带孔的金属环 + 铆钉
  ctx.save();
  ctx.translate(cx0 + cw * 0.06, rimY + S * 0.004);
  ctx.rotate(-0.18);
  ctx.fillStyle = 'rgba(200,206,214,0.95)';
  ctx.beginPath();
  ctx.ellipse(0, 0, cw * 0.155, S * 0.0115, 0, 0, 6.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(108,114,122,0.95)';
  ctx.beginPath();
  ctx.ellipse(-cw * 0.026, -S * 0.001, cw * 0.052, S * 0.0045, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.70)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -S * 0.002, cw * 0.14, S * 0.009, 0, Math.PI * 1.05, Math.PI * 1.85);
  ctx.stroke();
  // 铆钉
  ctx.fillStyle = '#dfe3e8';
  ctx.beginPath();
  ctx.arc(cw * 0.072, S * 0.002, S * 0.004, 0, 6.3);
  ctx.fill();
  ctx.restore();
  // 盖面的一道弧形反光
  ctx.strokeStyle = 'rgba(255,255,255,0.50)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx0 - cw * 0.05, rimY, cw * 0.24, S * 0.013, 0, Math.PI * 1.12, Math.PI * 1.72);
  ctx.stroke();

  // 罐底
  ctx.fillStyle = 'rgba(70,32,12,0.85)';
  ctx.beginPath();
  ctx.ellipse(left + cw * 0.5, ch * 0.5 - S * 0.030, cw * 0.48, S * 0.026, 0, 0, 6.3);
  ctx.fill();
  // 罐底卷边的金属反光
  ctx.strokeStyle = 'rgba(200,206,216,0.30)';
  ctx.lineWidth = Math.max(1.2, S * 0.004);
  ctx.beginPath();
  ctx.ellipse(left + cw * 0.5, ch * 0.5 - S * 0.030, cw * 0.474, S * 0.024, 0, Math.PI * 0.06, Math.PI * 0.94);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(46,18,4,0.55)';
  ctx.lineWidth = Math.max(1, S * 0.003);
  ctx.beginPath();
  ctx.ellipse(left + cw * 0.5, ch * 0.5 - S * 0.036, cw * 0.472, S * 0.023, 0, Math.PI * 1.04, Math.PI * 1.96);
  ctx.stroke();

  // 冷凝水珠
  for (let i = 0; i < 44; i++) {
    const dx = left + cw * (0.035 + ((i * 0.173) % 0.93));
    const dy = top + S * 0.09 + ((i * 0.291) % 0.82) * (ch - S * 0.16);
    const r = S * (0.0032 + (i % 4) * 0.0018);
    // 水珠底部的暗缘
    ctx.fillStyle = `rgba(92,32,8,${0.10 + (i % 3) * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(dx + r * 0.18, dy + r * 0.35, r * 0.95, r * 1.25, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = `rgba(255,248,228,${0.22 + (i % 3) * 0.10})`;
    ctx.beginPath();
    ctx.ellipse(dx, dy, r, r * 1.35, 0, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.arc(dx - r * 0.30, dy - r * 0.55, r * 0.30, 0, 6.3);
    ctx.fill();
    // 水痕
    if (i % 5 === 0) {
      ctx.strokeStyle = 'rgba(255,250,236,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx, dy + r);
      ctx.quadraticCurveTo(dx + S * 0.004, dy + r * 2.2, dx, dy + r * 3.4);
      ctx.stroke();
    }
  }

  // 罐底旁的一小圈水渍
  ctx.fillStyle = 'rgba(255,246,226,0.05)';
  ctx.beginPath();
  ctx.ellipse(S * 0.05, ch * 0.5 + S * 0.030, cw * 0.58, S * 0.026, 0, 0, 6.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,246,226,0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(S * 0.05, ch * 0.5 + S * 0.030, cw * 0.58, S * 0.026, 0, 0.2, Math.PI * 1.35);
  ctx.stroke();

  ctx.restore();
}

// 素圈戒指（铂金，无镶钻）—— 右手端着温水，无名指上一圈克制的冷光
function drawRingProp(ctx, x, y, S, time, p) {
  ctx.save();
  ctx.translate(x, y);

  // 背景：夜里的走廊，窗外是虚化的城市灯火
  const bg = ctx.createRadialGradient(-S * 0.06, -S * 0.12, S * 0.02, 0, S * 0.06, S * 0.80);
  bg.addColorStop(0, 'rgba(34,34,52,0.60)');
  bg.addColorStop(0.55, 'rgba(16,15,26,0.58)');
  bg.addColorStop(1, 'rgba(6,6,11,0)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(0, S * 0.04, S * 0.80, S * 0.64, 0, 0, 6.3);
  ctx.fill();

  // 窗棂
  ctx.fillStyle = 'rgba(126,142,176,0.055)';
  ctx.fillRect(S * 0.46, -S * 0.52, S * 0.020, S * 0.96);
  ctx.fillRect(-S * 0.58, -S * 0.52, S * 0.014, S * 0.96);

  // 窗外灯火：几团散景
  const bokeh = [
    [0.32, -0.20, 0.036, '255,206,148', 0.13],
    [0.40, -0.05, 0.026, '255,222,176', 0.11],
    [0.25, 0.03, 0.022, '188,208,246', 0.09],
    [0.44, 0.12, 0.032, '255,194,134', 0.10],
    [0.34, 0.20, 0.020, '210,224,255', 0.08],
    [0.21, -0.30, 0.018, '255,236,198', 0.09],
    [0.47, -0.24, 0.016, '255,214,168', 0.07],
  ];
  for (const [bx, by, br, col, ba] of bokeh) {
    const gb = ctx.createRadialGradient(S * bx, S * by, 0, S * bx, S * by, S * br);
    gb.addColorStop(0, `rgba(${col},${ba})`);
    gb.addColorStop(0.55, `rgba(${col},${ba * 0.46})`);
    gb.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = gb;
    ctx.beginPath();
    ctx.arc(S * bx, S * by, S * br, 0, 6.3);
    ctx.fill();
  }

  const gw = S * 0.315, gh = S * 0.600;
  const gx = S * 0.030, gy = -S * 0.030;
  const topY = gy - gh * 0.5;
  const botY = gy + gh * 0.5;
  const waterY = gy - gh * 0.050;

  // —— 手掌：在杯子后方，几乎隐在暗处 ——
  const palm = ctx.createLinearGradient(-S * 0.40, S * 0.02, -S * 0.02, S * 0.46);
  palm.addColorStop(0, '#453231');
  palm.addColorStop(0.40, '#342529');
  palm.addColorStop(0.76, '#22181d');
  palm.addColorStop(1, '#150f14');
  const palmPath = () => {
    ctx.beginPath();
    ctx.moveTo(-S * 0.56, S * 0.70);
    ctx.bezierCurveTo(-S * 0.50, S * 0.32, -S * 0.38, S * 0.07, -S * 0.16, -S * 0.02);
    ctx.bezierCurveTo(-S * 0.04, -S * 0.064, S * 0.075, S * 0.004, S * 0.110, S * 0.13);
    ctx.bezierCurveTo(S * 0.130, S * 0.30, S * 0.035, S * 0.44, -S * 0.10, S * 0.47);
    ctx.closePath();
  };
  ctx.fillStyle = palm;
  palmPath();
  ctx.fill();
  // 腕部向下沉进暗处，避免出现生硬的截断边
  ctx.save();
  palmPath();
  ctx.clip();
  const palmFade = ctx.createLinearGradient(0, S * 0.24, 0, S * 0.56);
  palmFade.addColorStop(0, 'rgba(7,6,10,0)');
  palmFade.addColorStop(0.62, 'rgba(7,6,10,0.55)');
  palmFade.addColorStop(1, 'rgba(6,5,9,0.96)');
  ctx.fillStyle = palmFade;
  ctx.fillRect(-S * 0.60, S * 0.20, S * 0.80, S * 0.40);
  ctx.restore();
  // 腕部的冷边光
  ctx.strokeStyle = 'rgba(150,164,196,0.14)';
  ctx.lineWidth = Math.max(1.2, S * 0.005);
  ctx.beginPath();
  ctx.moveTo(-S * 0.455, S * 0.46);
  ctx.bezierCurveTo(-S * 0.43, S * 0.26, -S * 0.36, S * 0.10, -S * 0.205, S * 0.005);
  ctx.stroke();
  // 手腕转折处的暗褶
  ctx.strokeStyle = 'rgba(18,11,15,0.30)';
  ctx.lineWidth = Math.max(1.4, S * 0.007);
  ctx.beginPath();
  ctx.moveTo(-S * 0.40, S * 0.36);
  ctx.quadraticCurveTo(-S * 0.31, S * 0.34, -S * 0.25, S * 0.39);
  ctx.stroke();

  // —— 玻璃杯 ——
  const glass = ctx.createLinearGradient(gx - gw * 0.5, 0, gx + gw * 0.5, 0);
  glass.addColorStop(0, 'rgba(176,196,220,0.20)');
  glass.addColorStop(0.12, 'rgba(232,244,255,0.22)');
  glass.addColorStop(0.44, 'rgba(146,166,192,0.06)');
  glass.addColorStop(0.70, 'rgba(214,228,244,0.12)');
  glass.addColorStop(0.90, 'rgba(240,250,255,0.20)');
  glass.addColorStop(1, 'rgba(146,162,188,0.10)');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(gx - gw * 0.5, topY);
  ctx.bezierCurveTo(gx - gw * 0.52, topY + gh * 0.30, gx - gw * 0.47, botY - gh * 0.10, gx - gw * 0.43, botY);
  ctx.quadraticCurveTo(gx, botY + gh * 0.038, gx + gw * 0.43, botY);
  ctx.bezierCurveTo(gx + gw * 0.47, botY - gh * 0.10, gx + gw * 0.52, topY + gh * 0.30, gx + gw * 0.5, topY);
  ctx.closePath();
  ctx.fill();

  // 水
  const water = ctx.createLinearGradient(0, waterY, 0, botY);
  water.addColorStop(0, 'rgba(206,220,232,0.12)');
  water.addColorStop(0.5, 'rgba(184,200,214,0.16)');
  water.addColorStop(1, 'rgba(152,168,184,0.24)');
  ctx.fillStyle = water;
  ctx.beginPath();
  ctx.moveTo(gx - gw * 0.465, waterY);
  ctx.bezierCurveTo(gx - gw * 0.476, waterY + gh * 0.30, gx - gw * 0.445, botY - gh * 0.06, gx - gw * 0.425, botY);
  ctx.quadraticCurveTo(gx, botY + gh * 0.036, gx + gw * 0.425, botY);
  ctx.bezierCurveTo(gx + gw * 0.445, botY - gh * 0.06, gx + gw * 0.476, waterY + gh * 0.30, gx + gw * 0.465, waterY);
  ctx.closePath();
  ctx.fill();
  // 水面
  ctx.strokeStyle = 'rgba(236,246,252,0.26)';
  ctx.lineWidth = Math.max(1, S * 0.0036);
  ctx.beginPath();
  ctx.ellipse(gx, waterY, gw * 0.465, gh * 0.026, 0, 0, 6.3);
  ctx.stroke();
  ctx.fillStyle = 'rgba(236,246,252,0.05)';
  ctx.beginPath();
  ctx.ellipse(gx, waterY, gw * 0.465, gh * 0.026, 0, 0, 6.3);
  ctx.fill();

  // 杯口
  ctx.strokeStyle = 'rgba(240,250,255,0.42)';
  ctx.lineWidth = Math.max(1.4, S * 0.006);
  ctx.beginPath();
  ctx.ellipse(gx, topY, gw * 0.5, gh * 0.040, 0, 0, 6.3);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(160,176,198,0.24)';
  ctx.lineWidth = Math.max(1, S * 0.003);
  ctx.beginPath();
  ctx.ellipse(gx, topY + S * 0.004, gw * 0.455, gh * 0.030, 0, 0, 6.3);
  ctx.stroke();

  // 杯壁的两道竖高光与杯底的聚光
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = Math.max(1.6, S * 0.007);
  ctx.beginPath();
  ctx.moveTo(gx - gw * 0.435, topY + gh * 0.07);
  ctx.bezierCurveTo(gx - gw * 0.455, topY + gh * 0.34, gx - gw * 0.435, botY - gh * 0.20, gx - gw * 0.395, botY - gh * 0.07);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.34)';
  ctx.lineWidth = Math.max(1.2, S * 0.004);
  ctx.beginPath();
  ctx.moveTo(gx + gw * 0.435, topY + gh * 0.10);
  ctx.bezierCurveTo(gx + gw * 0.452, topY + gh * 0.36, gx + gw * 0.432, botY - gh * 0.18, gx + gw * 0.398, botY - gh * 0.06);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(236,248,255,0.20)';
  ctx.lineWidth = Math.max(1.6, S * 0.006);
  ctx.beginPath();
  ctx.ellipse(gx - gw * 0.04, botY - gh * 0.045, gw * 0.32, gh * 0.026, 0.06, Math.PI * 1.06, Math.PI * 1.94);
  ctx.stroke();

  // —— 四指绕住杯身（从掌心伸向杯前） ——
  const skin = (fy, len, h, tilt) => {
    ctx.save();
    ctx.translate(gx - gw * 0.60, fy);
    ctx.rotate(tilt);
    const sg = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    sg.addColorStop(0, 'rgba(102,76,74,0.98)');
    sg.addColorStop(0.26, 'rgba(76,55,57,0.98)');
    sg.addColorStop(0.66, 'rgba(52,36,41,0.98)');
    sg.addColorStop(0.90, 'rgba(34,23,29,0.98)');
    sg.addColorStop(1, 'rgba(26,17,23,0.98)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-S * 0.02, -h * 0.5);
    ctx.lineTo(len * 0.60, -h * 0.5);
    ctx.bezierCurveTo(len * 0.90, -h * 0.5, len, -h * 0.24, len, 0);
    ctx.bezierCurveTo(len, h * 0.24, len * 0.90, h * 0.5, len * 0.60, h * 0.5);
    ctx.lineTo(-S * 0.02, h * 0.5);
    ctx.closePath();
    ctx.fill();
    // 指尖的冷色边光
    ctx.strokeStyle = 'rgba(180,194,222,0.22)';
    ctx.lineWidth = Math.max(1, S * 0.0034);
    ctx.beginPath();
    ctx.moveTo(len * 0.16, -h * 0.455);
    ctx.lineTo(len * 0.56, -h * 0.455);
    ctx.bezierCurveTo(len * 0.84, -h * 0.455, len * 0.955, -h * 0.21, len * 0.955, 0);
    ctx.stroke();
    // 指节褶皱
    ctx.strokeStyle = 'rgba(22,14,18,0.32)';
    ctx.lineWidth = Math.max(1, S * 0.0038);
    ctx.beginPath();
    ctx.moveTo(len * 0.32, -h * 0.34);
    ctx.quadraticCurveTo(len * 0.385, -h * 0.02, len * 0.315, h * 0.36);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(22,14,18,0.20)';
    ctx.beginPath();
    ctx.moveTo(len * 0.62, -h * 0.28);
    ctx.quadraticCurveTo(len * 0.665, 0, len * 0.615, h * 0.30);
    ctx.stroke();
    // 指腹的一点暖反光
    ctx.fillStyle = 'rgba(214,150,128,0.10)';
    ctx.beginPath();
    ctx.ellipse(len * 0.78, h * 0.10, h * 0.26, h * 0.20, 0.2, 0, 6.3);
    ctx.fill();
    ctx.restore();
  };
  skin(S * 0.015, S * 0.285, S * 0.058, -0.045);
  skin(S * 0.095, S * 0.300, S * 0.062, -0.012);
  skin(S * 0.178, S * 0.288, S * 0.058, 0.020);
  skin(S * 0.255, S * 0.245, S * 0.050, 0.052);

  // 戒指：无名指上一圈很窄的铂金
  const rby = S * 0.178 + S * 0.002;
  const rbx = gx - gw * 0.60 + S * 0.288 * 0.56;
  const rbw = S * 0.0185, rbh = S * 0.0545;
  // 指面上的落影
  ctx.fillStyle = 'rgba(12,8,12,0.34)';
  ctx.beginPath();
  ctx.ellipse(rbx, rby + S * 0.004, rbw * 0.80, rbh * 0.56, 0, 0, 6.3);
  ctx.fill();
  const metal = ctx.createLinearGradient(rbx - rbw * 0.5, 0, rbx + rbw * 0.5, 0);
  metal.addColorStop(0, '#545866');
  metal.addColorStop(0.18, '#a8acb8');
  metal.addColorStop(0.36, '#eef0f6');
  metal.addColorStop(0.50, '#ffffff');
  metal.addColorStop(0.62, '#c9cdd7');
  metal.addColorStop(0.78, '#848894');
  metal.addColorStop(0.90, '#dfe2ea');
  metal.addColorStop(1, '#5c606e');
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.ellipse(rbx, rby, rbw * 0.5, rbh * 0.5, 0, 0, 6.3);
  ctx.fill();
  // 戒圈上缘的一线镜面光
  ctx.strokeStyle = 'rgba(255,255,255,0.60)';
  ctx.lineWidth = Math.max(1, S * 0.003);
  ctx.beginPath();
  ctx.ellipse(rbx, rby - S * 0.002, rbw * 0.34, rbh * 0.42, 0, Math.PI * 1.10, Math.PI * 1.88);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60,62,74,0.50)';
  ctx.lineWidth = Math.max(1, S * 0.0026);
  ctx.beginPath();
  ctx.ellipse(rbx, rby + S * 0.002, rbw * 0.38, rbh * 0.44, 0, 0.12, Math.PI * 0.94);
  ctx.stroke();

  // —— 拇指沿杯壁爬上来 ——
  ctx.save();
  ctx.translate(-S * 0.245, S * 0.315);
  ctx.rotate(-1.15);
  const tlen = S * 0.275, th = S * 0.078;
  const tg = ctx.createLinearGradient(0, -th * 0.5, 0, th * 0.5);
  tg.addColorStop(0, 'rgba(118,90,86,0.99)');
  tg.addColorStop(0.30, 'rgba(84,61,62,0.99)');
  tg.addColorStop(0.72, 'rgba(56,39,44,0.99)');
  tg.addColorStop(1, 'rgba(32,22,28,0.99)');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-S * 0.02, -th * 0.5);
  ctx.lineTo(tlen * 0.58, -th * 0.5);
  ctx.bezierCurveTo(tlen * 0.90, -th * 0.5, tlen, -th * 0.24, tlen, 0);
  ctx.bezierCurveTo(tlen, th * 0.24, tlen * 0.90, th * 0.5, tlen * 0.58, th * 0.5);
  ctx.lineTo(-S * 0.02, th * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(186,198,224,0.24)';
  ctx.lineWidth = Math.max(1, S * 0.0036);
  ctx.beginPath();
  ctx.moveTo(tlen * 0.14, -th * 0.45);
  ctx.lineTo(tlen * 0.54, -th * 0.45);
  ctx.bezierCurveTo(tlen * 0.83, -th * 0.45, tlen * 0.955, -th * 0.20, tlen * 0.955, 0);
  ctx.stroke();
  // 指甲的一线冷光
  ctx.fillStyle = 'rgba(206,214,232,0.16)';
  ctx.beginPath();
  ctx.ellipse(tlen * 0.86, -th * 0.10, th * 0.20, th * 0.12, -0.2, 0, 6.3);
  ctx.fill();
  ctx.restore();

  // —— 温水的水汽 ——
  for (let i = 0; i < 3; i++) {
    const sx = gx + (i - 1) * S * 0.052;
    const t = time * 0.00055 + i * 1.9;
    ctx.strokeStyle = `rgba(216,228,244,${0.075 - i * 0.014})`;
    ctx.lineWidth = Math.max(1.4, S * (0.010 - i * 0.002));
    ctx.beginPath();
    ctx.moveTo(sx, topY - S * 0.020);
    ctx.bezierCurveTo(
      sx + Math.sin(t) * S * 0.022, topY - S * 0.10,
      sx - Math.sin(t * 1.2) * S * 0.030, topY - S * 0.18,
      sx + Math.sin(t * 1.5 + i) * S * 0.020, topY - S * 0.26
    );
    ctx.stroke();
  }

  // 戒指落在杯壁上的一个小反光
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glx = gx + gw * 0.16, gly = S * 0.12;
  const gh2 = ctx.createRadialGradient(glx, gly, 0, glx, gly, S * 0.030);
  gh2.addColorStop(0, 'rgba(240,244,255,0.26)');
  gh2.addColorStop(1, 'rgba(240,244,255,0)');
  ctx.fillStyle = gh2;
  ctx.beginPath(); ctx.arc(glx, gly, S * 0.030, 0, 6.3); ctx.fill();
  ctx.restore();

  // 左上的一点星芒
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sgx = rbx - rbw * 0.16, sgy = rby - rbh * 0.34;
  const glint = ctx.createRadialGradient(sgx, sgy, 0, sgx, sgy, S * 0.046);
  glint.addColorStop(0, 'rgba(255,255,255,0.46)');
  glint.addColorStop(0.26, 'rgba(224,228,255,0.16)');
  glint.addColorStop(1, 'rgba(220,226,255,0)');
  ctx.fillStyle = glint;
  ctx.beginPath(); ctx.arc(sgx, sgy, S * 0.046, 0, 6.3); ctx.fill();
  ctx.restore();

  // 四周收暗，让手指与杯子从环境里浮出来
  const vg = ctx.createRadialGradient(0, S * 0.02, S * 0.26, 0, S * 0.05, S * 0.74);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.72, 'rgba(4,4,8,0.16)');
  vg.addColorStop(1, 'rgba(4,4,8,0.46)');
  ctx.fillStyle = vg;
  ctx.beginPath();
  ctx.ellipse(0, S * 0.05, S * 0.80, S * 0.66, 0, 0, 6.3);
  ctx.fill();

  ctx.restore();
}

export function drawPropDetail(ctx, o = {}) {
  const { x, y, size, time = 0, kind = 'none', palette = {} } = o;
  const S = size || 320;
  const p = { glow: '#ffcf94', ...palette };
  const tf = ctx.getTransform ? ctx.getTransform() : { a: 1 };
  const W = ctx.canvas.width / (tf.a || 1);
  const H = ctx.canvas.height / (tf.d || 1);

  // 新道具（乐谱 / 小提琴 / 钢琴 / 汽水 / 戒指）需要压暗背景，
  // 否则高亮场景会把物件衬成贴纸。
  if (['score', 'violin', 'piano', 'soda', 'ring'].includes(kind)) {
    const dim = ctx.createRadialGradient(x, y, S * 0.12, x, y, Math.max(W, H) * 0.72);
    dim.addColorStop(0, 'rgba(16,13,20,0.30)');
    dim.addColorStop(0.5, 'rgba(10,9,15,0.62)');
    dim.addColorStop(1, 'rgba(5,5,9,0.86)');
    ctx.save();
    ctx.fillStyle = dim;
    ctx.fillRect(-W * 0.2, -H * 0.2, W * 1.4, H * 1.4);
    ctx.restore();
  }

  // 一束很淡的桌面光
  const g = ctx.createRadialGradient(x, y, S * 0.02, x, y, S * 0.72);
  g.addColorStop(0, hexA(p.glow, 0.12));
  g.addColorStop(0.55, hexA(p.glow, 0.04));
  g.addColorStop(1, hexA(p.glow, 0));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  if (kind === 'cassette') drawCassette(ctx, x, y, S, time, p, /断|卡|缠|绞|脱/.test(o.text || ''));
  else if (kind === 'earphone') drawEarphone(ctx, x, y, S, time, p);
  else if (kind === 'paper') drawPaper(ctx, x, y, S, time, p);
  else if (kind === 'letter') drawLetter(ctx, x, y, S, time, p);
  else if (kind === 'photo') drawPhoto(ctx, x, y, S, time, p);
  else if (kind === 'token') drawToken(ctx, x, y, S, time, p);
  else if (kind === 'box') drawBox(ctx, x, y, S, time, p, /打开|矿石|盒中|匣中|盛放/.test(o.text || ''));
  else if (kind === 'paint') drawPaint(ctx, x, y, S, time, p, /朱砂|赤|血|红/.test(o.text || ''));
  else if (kind === 'scroll') drawScroll(ctx, x, y, S, time, p, /血|红枫|红叶|卷尾/.test(o.text || ''), /血珠|血迹|鲜血|滴血|血/.test(o.text || ''));
  else if (kind === 'starry') drawStarryProp(ctx, x, y, S, time, p, o.text, /逆向|逆时针|镜像|翻转|颠倒|仿作|赝品/.test(o.text || ''), o.starry);
  else if (kind === 'fragment') drawFragmentProp(ctx, x, y, S, time, p, o.text, o.starry);
  else if (kind === 'ledger') drawLedgerProp(ctx, x, y, S, time, p);
  else if (kind === 'archive') drawArchiveProp(ctx, x, y, S, time, p);
  else if (kind === 'starmap') drawStarmapProp(ctx, x, y, S, time, p);
  else if (kind === 'loupe') drawLoupeProp(ctx, x, y, S, time, p, o.starry);
  else if (kind === 'phone') drawPhoneProp(ctx, x, y, S, time, p);
  else if (kind === 'sculpture') drawSculptureProp(ctx, x, y, S, time, p);
  else if (kind === 'coffee') drawCoffeeProp(ctx, x, y, S, time, p);
  else if (kind === 'score') drawScoreProp(ctx, x, y, S, time, p, o.score, o.text);
  else if (kind === 'violin') drawViolinProp(ctx, x, y, S, time, p, o.text);
  else if (kind === 'piano') drawPianoProp(ctx, x, y, S, time, p);
  else if (kind === 'soda') drawSodaProp(ctx, x, y, S, time, p);
  else if (kind === 'ring') drawRingProp(ctx, x, y, S, time, p);

  dust(ctx, x, y, S, time, p);
}
