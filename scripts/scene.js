/* ============================================================
   暮幕 · 剧情舞台渲染器
   四个可复用场景 + 通用模块化人物 + 三种镜头
   全部程序化绘制，印象派笔触 + 像素点缀
   ============================================================ */
import { drawPortrait } from './portraits.js';
import { drawPropDetail, pickProp } from './prop.js';

const PALETTES = {
  dusk:  { skyTop: '#3a2350', skyMid: '#8c4a68', skyLow: '#f0a05e', ground: '#2c1d3e', glow: '#ffcf94', accent: '#ff9d57', warm: true },
  day:   { skyTop: '#6ea6d6', skyMid: '#a9cbe2', skyLow: '#f2dcb8', ground: '#38452f', glow: '#fff0cf', accent: '#ffcf82', warm: true },
  night: { skyTop: '#111433', skyMid: '#2a2350', skyLow: '#5a3f6e', ground: '#161228', glow: '#cfd8ff', accent: '#9fb4ff', warm: false },
  fire:  { skyTop: '#2a0c12', skyMid: '#7a2418', skyLow: '#e2682c', ground: '#241016', glow: '#ffb066', accent: '#ff6a3a', warm: true },
};

// 各时段的主光源位置（世界坐标比例），剪影的边缘光朝它偏移
const LIGHT_POS = {
  dusk:  { x: 0.72, y: 0.40 },
  day:   { x: 0.70, y: 0.20 },
  night: { x: 0.32, y: 0.26 },
  fire:  { x: 0.58, y: 0.34 },
};

const rand = (a, b) => a + Math.random() * (b - a);

export function createSceneRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let layers = null;
  let state = { scene: 'classroom', time: 'dusk', cam: 'mid', cast: [], speaker: '', focus: '', poses: {}, actions: {}, view: 'normal', propText: '' };
  let time = 0, rafId = null, running = false;
  let camera = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tz: 1 };
  let motes = [];
  let onFrame = null;
  // 特写里的道具在整段镜头内保持：后续旁白不提物件时，不突然清空
  let detailProp = 'none';
  let detailText = '';
  // 特写道具是静止画面：离屏缓存一次，避免每帧重复绘制大量颗粒与阴影
  let propLayer = null, propLayerKey = '';
  // 《星月夜》原图：用于沙龙展墙与画库真迹（画库版本水平镜像）
  const starry = new Image();
  let starryReady = false;
  starry.onload = () => { starryReady = true; layers = null; };
  // 《月光下的未完奏鸣》：陆家嘴日 / 夜原图，以及贝多芬《悲怆》第二乐章乐谱
  const cityDay = new Image();
  let cityDayReady = false;
  cityDay.onload = () => { cityDayReady = true; layers = null; };
  const cityNight = new Image();
  let cityNightReady = false;
  cityNight.onload = () => { cityNightReady = true; layers = null; };
  const scoreSheet = new Image();
  let scoreReady = false;
  scoreSheet.onload = () => { scoreReady = true; propLayerKey = ''; };
  // 《蝉鸣》里小悠真的旧照片：真实素材替代程序化绘制
  const photoBoy = new Image();
  let photoBoyReady = false;
  photoBoy.onload = () => { photoBoyReady = true; propLayerKey = ''; };
  // 只在真正描述这张照片的镜头里启用，避免《漩涡》的星图照片也换成小男孩
  let detailPhotoBoy = false;

  // 场景大图按需加载：首屏不请求，进入舞台 / 打开剧本库时由 main.js 触发一次
  let sceneImagesRequested = false;
  function preloadSceneImages() {
    if (sceneImagesRequested) return;
    sceneImagesRequested = true;
    starry.src = './assets/images/starry-night.jpg';
    cityDay.src = './assets/images/lujiazui-day.png';
    cityNight.src = './assets/images/lujiazui-night.png';
    scoreSheet.src = './assets/images/pathetique-score.png';
    photoBoy.src = './assets/images/cicada-photo.jpg';
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layers = null;
    propLayer = null; propLayerKey = '';
    motes = Array.from({ length: 40 }, () => ({
      x: Math.random() * W, y: Math.random() * H, r: rand(0.5, 1.8),
      vx: rand(-0.12, 0.12), vy: rand(-0.2, -0.04), a: rand(0.1, 0.4), ph: Math.random() * 6.28,
    }));
  }

  /* ---------- 场景底图（预渲染一层） ---------- */
  function buildLayers() {
    layers = document.createElement('canvas');
    layers.width = canvas.width;
    layers.height = canvas.height;
    const b = layers.getContext('2d');
    b.setTransform(DPR, 0, 0, DPR, 0, 0);
    const p = PALETTES[state.time] || PALETTES.dusk;
    const horizon = H * 0.62;

    const g = b.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(0.55, p.skyMid);
    g.addColorStop(1, p.skyLow);
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);

    // 天空：先铺柔和云气，再叠细笔触与竖向晕染，避免出现一排排“药丸”
    const tint = state.time === 'day' ? '255,248,236'
      : state.time === 'fire' ? '255,190,142'
      : state.time === 'night' ? '178,192,242' : '255,198,162';
    b.save();
    for (let i = 0; i < 6; i++) {
      const cy = horizon * rand(0.22, 0.95);
      const cx = rand(-W * 0.1, W * 1.1);
      const rx = rand(W * 0.16, W * 0.52);
      const ry = rand(horizon * 0.05, horizon * 0.14);
      const cg = b.createRadialGradient(cx, cy, 0, cx, cy, rx);
      cg.addColorStop(0, `rgba(${tint},${rand(0.035, 0.07)})`);
      cg.addColorStop(0.6, `rgba(${tint},${rand(0.012, 0.03)})`);
      cg.addColorStop(1, `rgba(${tint},0)`);
      b.fillStyle = cg;
      b.save();
      b.translate(cx, cy);
      b.scale(1, ry / rx);
      b.beginPath(); b.arc(0, 0, rx, 0, 6.3); b.fill();
      b.restore();
    }
    b.restore();
    b.save();
    b.lineCap = 'round';
    for (let i = 0; i < 360; i++) {
      const y = Math.random() * horizon;
      const t = y / horizon;
      b.strokeStyle = `rgba(${tint},${rand(0.012, 0.045)})`;
      b.lineWidth = rand(0.6, 2.4);
      const x = Math.random() * W;
      const len = rand(18, 88);
      const ang = rand(-0.05, 0.05);
      b.beginPath();
      b.moveTo(x, y);
      b.quadraticCurveTo(x + len * 0.5, y + Math.sin(x * 0.01 + i) * 2, x + len, y + ang * len);
      b.stroke();
    }
    // 靠近地平线的光带
    const bandG = b.createLinearGradient(0, horizon * 0.62, 0, horizon);
    bandG.addColorStop(0, `rgba(${tint},0)`);
    bandG.addColorStop(0.65, `rgba(${tint},${state.time === 'night' ? 0.03 : 0.07})`);
    bandG.addColorStop(1, `rgba(${tint},0)`);
    b.fillStyle = bandG;
    b.fillRect(0, horizon * 0.62, W, horizon * 0.38);
    b.restore();

    // 夜空：一轮柔和的满月（只点缀看得见天空的室外夜色场景，不参与暖色光晕）
    if (state.time === 'night' && ['playground', 'ancient', 'belltower', 'track', 'lawn', 'campus'].includes(state.scene)) {
      const mx = W * 0.68, my = H * 0.17, mr = Math.min(W, H) * 0.045;
      const halo = b.createRadialGradient(mx, my, mr * 0.55, mx, my, mr * 4.6);
      halo.addColorStop(0, 'rgba(228,234,255,0.30)');
      halo.addColorStop(0.2, 'rgba(210,222,255,0.13)');
      halo.addColorStop(0.55, 'rgba(196,210,250,0.05)');
      halo.addColorStop(1, 'rgba(196,210,250,0)');
      b.fillStyle = halo;
      b.beginPath(); b.arc(mx, my, mr * 4.6, 0, 6.3); b.fill();
      // 月面：受光中心偏左上的球体渐变，边缘略暗，避免一张白纸
      b.save();
      b.beginPath(); b.arc(mx, my, mr, 0, 6.3); b.clip();
      const disc = b.createRadialGradient(mx - mr * 0.28, my - mr * 0.32, mr * 0.1, mx, my, mr * 1.02);
      disc.addColorStop(0, '#f4f1e2');
      disc.addColorStop(0.42, '#e9e5d6');
      disc.addColorStop(0.78, '#d6d5c8');
      disc.addColorStop(1, '#b9bdb9');
      b.fillStyle = disc;
      b.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      // 月海：低对比度的灰斑，叠出真实纹理
      const mares = [
        [-0.22, 0.10, 0.40, 0.30], [0.16, -0.20, 0.30, 0.24],
        [0.26, 0.24, 0.26, 0.20], [-0.05, -0.36, 0.24, 0.16],
        [-0.38, -0.12, 0.20, 0.22], [0.05, 0.36, 0.22, 0.14],
      ];
      for (const [ox, oy, rx, ry] of mares) {
        const mg = b.createRadialGradient(mx + ox * mr, my + oy * mr, 0, mx + ox * mr, my + oy * mr, rx * mr);
        mg.addColorStop(0, 'rgba(118,126,124,0.42)');
        mg.addColorStop(0.7, 'rgba(130,138,134,0.22)');
        mg.addColorStop(1, 'rgba(148,152,148,0)');
        b.fillStyle = mg;
        b.beginPath();
        b.ellipse(mx + ox * mr, my + oy * mr, rx * mr, ry * mr, rand(-0.6, 0.6), 0, 6.3);
        b.fill();
      }
      // 环形山：暗缘 + 很浅的亮边，密度克制，远看是月面颗粒而不是斑点
      const mhash = (i, k) => {
        const v = Math.sin(i * 12.9898 + k * 78.233 + 1.7) * 43758.5453;
        return v - Math.floor(v);
      };
      for (let i = 0; i < 11; i++) {
        const a = mhash(i, 11) * 6.28, rr = Math.sqrt(mhash(i, 13)) * mr * 0.82;
        const cx2 = mx + Math.cos(a) * rr, cy2 = my + Math.sin(a) * rr;
        const cr = mr * (0.035 + mhash(i, 15) * 0.055);
        b.fillStyle = `rgba(116,122,120,${0.12 + mhash(i, 17) * 0.12})`;
        b.beginPath(); b.arc(cx2, cy2, cr, 0, 6.3); b.fill();
        b.strokeStyle = 'rgba(250,248,238,0.16)';
        b.lineWidth = Math.max(0.5, cr * 0.16);
        b.beginPath(); b.arc(cx2 - cr * 0.16, cy2 - cr * 0.18, cr * 0.8, 3.4, 6.0); b.stroke();
      }
      // 边缘压暗，与夜空衔接
      const limb = b.createRadialGradient(mx, my, mr * 0.72, mx, my, mr);
      limb.addColorStop(0, 'rgba(40,46,72,0)');
      limb.addColorStop(1, 'rgba(47,52,80,0.30)');
      b.fillStyle = limb;
      b.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      b.restore();
    }

    const drawer = {
      company: drawCompany, classroom: drawClassroom, playground: drawPlayground,
      ancient: drawAncient, palace: drawPalace, pavilion: drawPavilion,
      salon: drawSalon, study: drawStudy, street: drawStreet, estate: drawEstate,
      drawingroom: drawDrawingroom, basement: drawBasement, villa: drawVilla,
      vault: drawVault, studio: drawStudio, terrace: drawTerrace,
      campus: drawCampus, pianoroom: drawPianoroom, musicroom: drawMusicroom,
      belltower: drawBelltower, theateryard: drawTheateryard, theater: drawTheater,
      office: drawOffice, bar: drawBar, city: drawCity, lawn: drawLawn, track: drawTrack,
    }[state.scene] || drawClassroom;
    drawer(b, p, horizon);

    // 地面
    const gg = b.createLinearGradient(0, horizon, 0, H);
    gg.addColorStop(0, p.ground);
    gg.addColorStop(1, shade(p.ground, -30));
    b.fillStyle = gg;
    b.fillRect(0, horizon, W, H - horizon);

    drawer.ground && drawer.ground(b, p, horizon);

    // 光晕（白天减弱，避免晨光把室内结构冲成一片白）
    const sunX = W * 0.7, sunY = horizon * 0.8;
    const glowA = state.time === 'day' ? 0.24 : 0.4;
    const accA = state.time === 'day' ? 0.08 : 0.14;
    const gl = b.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(W, H) * 0.6);
    gl.addColorStop(0, hexA(p.glow, glowA));
    gl.addColorStop(0.3, hexA(p.accent, accA));
    gl.addColorStop(1, hexA(p.accent, 0));
    b.globalCompositeOperation = 'lighter';
    b.fillStyle = gl;
    b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'source-over';
  }

  /* ---------- 场景：公司 / 老街事务所门口 ---------- */
  function drawCompany(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.night;
    const night = state.time !== 'day';
    // 远处街区轮廓与零星灯火
    b.fillStyle = night ? 'rgba(16,15,34,0.85)' : 'rgba(80,82,96,0.55)';
    b.beginPath();
    b.moveTo(0, horizon - H * 0.085);
    for (let i = 0; i <= 18; i++) {
      const bx = (i / 18) * W;
      const bh = H * (0.02 + Math.abs(Math.sin(i * 2.3)) * 0.085);
      b.lineTo(bx, horizon - bh);
      b.lineTo(bx + W * 0.028, horizon - bh);
    }
    b.lineTo(W, horizon - H * 0.05);
    b.lineTo(W, horizon);
    b.lineTo(0, horizon);
    b.closePath(); b.fill();
    for (let i = 0; i < 26; i++) {
      b.fillStyle = night ? `rgba(255,220,166,${rand(0.25, 0.6)})` : 'rgba(30,32,46,0.35)';
      b.fillRect(rand(0, W), horizon - rand(H * 0.02, H * 0.08), rand(2, 4), rand(2, 4));
    }
    // 左侧老屋：两层、卷帘门、招牌、空调外机
    const leftW = W * 0.38;
    b.fillStyle = night ? '#241f33' : '#5c5862';
    b.fillRect(0, horizon - H * 0.30, leftW, H * 0.30);
    b.fillStyle = night ? '#1b1728' : '#4b4753';
    b.fillRect(0, horizon - H * 0.315, leftW + W * 0.02, H * 0.018);
    // 二层窗
    for (let i = 0; i < 2; i++) {
      const wx = W * (0.035 + i * 0.15), wy = horizon - H * 0.275;
      b.fillStyle = night ? 'rgba(255,214,160,0.14)' : 'rgba(40,44,60,0.45)';
      b.fillRect(wx, wy, W * 0.10, H * 0.09);
      b.strokeStyle = 'rgba(12,10,18,0.45)';
      b.lineWidth = 2;
      b.strokeRect(wx, wy, W * 0.10, H * 0.09);
      b.beginPath(); b.moveTo(wx + W * 0.05, wy); b.lineTo(wx + W * 0.05, wy + H * 0.09); b.stroke();
    }
    // 空调外机与管线
    b.fillStyle = night ? '#171325' : '#4a4650';
    b.fillRect(W * 0.30, horizon - H * 0.255, W * 0.055, H * 0.045);
    b.strokeStyle = 'rgba(200,206,214,0.12)';
    b.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      b.beginPath();
      b.moveTo(W * 0.302, horizon - H * 0.255 + i * H * 0.011);
      b.lineTo(W * 0.352, horizon - H * 0.255 + i * H * 0.011);
      b.stroke();
    }
    b.strokeStyle = 'rgba(10,8,16,0.5)';
    b.lineWidth = 3;
    b.beginPath();
    b.moveTo(W * 0.352, horizon - H * 0.245);
    b.quadraticCurveTo(W * 0.365, horizon - H * 0.18, W * 0.39, horizon - H * 0.14);
    b.stroke();
    // 卷帘门
    const shX = W * 0.055, shY = horizon - H * 0.185, shW = W * 0.25, shH = H * 0.185;
    b.fillStyle = night ? '#2a2638' : '#6d7074';
    b.fillRect(shX, shY, shW, shH);
    b.strokeStyle = 'rgba(8,8,14,0.4)';
    b.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const yy = shY + (shH * i) / 10;
      b.beginPath(); b.moveTo(shX, yy); b.lineTo(shX + shW, yy); b.stroke();
    }
    b.fillStyle = 'rgba(255,240,214,0.05)';
    b.fillRect(shX, shY, shW, 2);
    // 卷帘门下沿的缝光与门口台阶
    b.fillStyle = 'rgba(255,206,150,0.16)';
    b.fillRect(shX, shY + shH - 3, shW, 3);
    b.fillStyle = night ? '#35303f' : '#8a8a82';
    b.fillRect(shX - 10, horizon - H * 0.006, shW + 20, H * 0.006);
    b.fillStyle = 'rgba(255,248,228,0.10)';
    b.fillRect(shX - 10, horizon - H * 0.006, shW + 20, 1.5);
    // 门口堆着的木箱与旧纸箱
    const crateY = horizon - H * 0.028;
    for (let i = 0; i < 2; i++) {
      const cbx = W * (0.318 + i * 0.028);
      b.fillStyle = i ? 'rgba(92,74,54,0.9)' : 'rgba(112,90,64,0.9)';
      b.fillRect(cbx, crateY + i * H * 0.014, W * 0.024, H * 0.022);
      b.strokeStyle = 'rgba(40,28,22,0.5)';
      b.lineWidth = 1;
      b.strokeRect(cbx, crateY + i * H * 0.014, W * 0.024, H * 0.022);
      b.beginPath();
      b.moveTo(cbx, crateY + i * H * 0.014);
      b.lineTo(cbx + W * 0.024, crateY + i * H * 0.014 + H * 0.022);
      b.stroke();
    }
    // 店招
    b.fillStyle = night ? '#322b44' : '#57525e';
    b.fillRect(W * 0.045, horizon - H * 0.225, W * 0.29, H * 0.042);
    b.fillStyle = 'rgba(255,232,190,0.28)';
    b.font = `600 ${Math.max(8, H * 0.019)}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
    b.textAlign = 'center';
    b.fillText('杂 货 · 五 金', W * 0.19, horizon - H * 0.196);
    b.textAlign = 'left';

    // 右侧：转角处的小型建筑事务所（整面落地玻璃）
    const stX = W * 0.46, stY = horizon - H * 0.315, stW = W * 0.515, stH = H * 0.315;
    b.fillStyle = night ? '#191528' : '#4f4c58';
    b.fillRect(stX, stY, stW, stH);
    b.fillStyle = night ? '#211c33' : '#5b5864';
    b.fillRect(stX - W * 0.01, stY - H * 0.014, stW + W * 0.02, H * 0.016);
    // 二层小窗与招牌
    for (let i = 0; i < 3; i++) {
      const wx = stX + stW * (0.08 + i * 0.3);
      const wy2 = stY + H * 0.02, ww2 = stW * 0.14, wh2 = H * 0.075;
      b.fillStyle = 'rgba(10,8,16,0.35)';
      b.fillRect(wx - 3, wy2 - 3, ww2 + 6, wh2 + 6);
      if (i === 1) {
        const wg = b.createLinearGradient(0, wy2, 0, wy2 + wh2);
        wg.addColorStop(0, 'rgba(255,214,158,0.5)');
        wg.addColorStop(1, 'rgba(214,160,108,0.28)');
        b.fillStyle = wg;
      } else {
        b.fillStyle = night ? 'rgba(36,34,58,0.85)' : 'rgba(36,38,52,0.4)';
      }
      b.fillRect(wx, wy2, ww2, wh2);
      // 窗内：书架与图纸柜的剪影
      if (i === 1) {
        b.fillStyle = 'rgba(78,52,40,0.7)';
        b.fillRect(wx + ww2 * 0.08, wy2 + wh2 * 0.52, ww2 * 0.84, wh2 * 0.4);
        b.strokeStyle = 'rgba(52,34,28,0.7)';
        b.lineWidth = 1;
        for (let k = 1; k < 3; k++) {
          b.beginPath();
          b.moveTo(wx + ww2 * 0.08, wy2 + wh2 * (0.52 + k * 0.13));
          b.lineTo(wx + ww2 * 0.92, wy2 + wh2 * (0.52 + k * 0.13));
          b.stroke();
        }
      }
      // 窗框、十字梃、窗台
      b.strokeStyle = night ? 'rgba(120,110,120,0.55)' : 'rgba(200,198,190,0.6)';
      b.lineWidth = 2;
      b.strokeRect(wx, wy2, ww2, wh2);
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(wx + ww2 / 2, wy2); b.lineTo(wx + ww2 / 2, wy2 + wh2);
      b.stroke();
      b.fillStyle = night ? 'rgba(70,64,80,0.8)' : 'rgba(180,178,170,0.7)';
      b.fillRect(wx - 4, wy2 + wh2, ww2 + 8, 3);
    }
    b.fillStyle = 'rgba(20,16,26,0.5)';
    b.fillRect(stX + stW * 0.22, stY + H * 0.11, stW * 0.56, H * 0.026);
    b.fillStyle = 'rgba(236,214,164,0.42)';
    b.font = `600 ${Math.max(8, H * 0.016)}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
    b.textAlign = 'center';
    b.fillText('建 筑 事 务 所', stX + stW * 0.5, stY + H * 0.129);
    b.textAlign = 'left';
    // 玻璃幕墙
    const glX = stX + stW * 0.045, glY = stY + H * 0.15, glW = stW * 0.91, glH = H * 0.165;
    const glassG = b.createLinearGradient(0, glY, 0, glY + glH);
    glassG.addColorStop(0, 'rgba(255,206,146,0.16)');
    glassG.addColorStop(0.45, 'rgba(255,222,170,0.10)');
    glassG.addColorStop(1, 'rgba(120,92,80,0.08)');
    b.fillStyle = glassG;
    b.fillRect(glX, glY, glW, glH);
    // 窗内：暖色工作室、绘图桌、台灯、图纸筒、模型架
    b.save();
    b.beginPath(); b.rect(glX, glY, glW, glH); b.clip();
    // 内墙与地板
    const inWall = b.createLinearGradient(0, glY, 0, glY + glH);
    inWall.addColorStop(0, 'rgba(92,66,48,0.92)');
    inWall.addColorStop(0.62, 'rgba(74,50,38,0.95)');
    inWall.addColorStop(0.64, 'rgba(58,38,30,0.98)');
    inWall.addColorStop(1, 'rgba(40,26,22,0.98)');
    b.fillStyle = inWall;
    b.fillRect(glX, glY, glW, glH);
    // 后墙的挂图与便签
    b.fillStyle = 'rgba(228,218,196,0.32)';
    b.fillRect(glX + glW * 0.06, glY + glH * 0.14, glW * 0.12, glH * 0.3);
    b.fillStyle = 'rgba(196,210,212,0.26)';
    b.fillRect(glX + glW * 0.075, glY + glH * 0.17, glW * 0.09, glH * 0.24);
    b.strokeStyle = 'rgba(80,92,100,0.35)';
    b.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      b.beginPath();
      b.moveTo(glX + glW * 0.08, glY + glH * (0.17 + i * 0.055));
      b.lineTo(glX + glW * 0.16, glY + glH * (0.17 + i * 0.055));
      b.stroke();
    }
    for (let i = 0; i < 5; i++) {
      b.fillStyle = i % 2 ? 'rgba(255,238,196,0.5)' : 'rgba(210,220,222,0.4)';
      b.fillRect(glX + glW * (0.22 + (i % 3) * 0.035), glY + glH * (0.16 + Math.floor(i / 3) * 0.06), glW * 0.026, glH * 0.05);
    }
    // 吊灯
    for (let i = 0; i < 2; i++) {
      const lx = glX + glW * (0.34 + i * 0.28);
      b.strokeStyle = 'rgba(28,20,18,0.9)';
      b.lineWidth = 1.2;
      b.beginPath(); b.moveTo(lx, glY); b.lineTo(lx, glY + glH * 0.12); b.stroke();
      b.fillStyle = 'rgba(255,228,170,0.95)';
      b.beginPath(); b.ellipse(lx, glY + glH * 0.13, 5, 3, 0, 0, 6.3); b.fill();
      const pg = b.createRadialGradient(lx, glY + glH * 0.13, 0, lx, glY + glH * 0.13, glH * 0.34);
      pg.addColorStop(0, 'rgba(255,214,150,0.30)');
      pg.addColorStop(1, 'rgba(255,206,140,0)');
      b.fillStyle = pg;
      b.beginPath(); b.arc(lx, glY + glH * 0.13, glH * 0.34, 0, 6.3); b.fill();
    }
    // 绘图桌（木质，倾斜图板）
    const dx = glX + glW * 0.14, dy = glY + glH * 0.68, dw = glW * 0.46;
    b.fillStyle = 'rgba(36,24,20,0.95)';
    b.fillRect(dx, dy, dw, H * 0.013);
    b.fillRect(dx + 7, dy + H * 0.013, 6, H * 0.055);
    b.fillRect(dx + dw - 13, dy + H * 0.013, 6, H * 0.055);
    b.fillStyle = 'rgba(126,86,54,0.9)';
    b.beginPath();
    b.moveTo(dx + dw * 0.12, dy);
    b.lineTo(dx + dw * 0.9, dy);
    b.lineTo(dx + dw * 0.86, dy - H * 0.028);
    b.lineTo(dx + dw * 0.16, dy - H * 0.028);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(238,232,208,0.8)';
    b.beginPath();
    b.moveTo(dx + dw * 0.2, dy - H * 0.003);
    b.lineTo(dx + dw * 0.8, dy - H * 0.003);
    b.lineTo(dx + dw * 0.78, dy - H * 0.025);
    b.lineTo(dx + dw * 0.22, dy - H * 0.025);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(72,100,120,0.5)';
    b.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      b.beginPath();
      b.moveTo(dx + dw * (0.25 + i * 0.11), dy - H * 0.024);
      b.lineTo(dx + dw * (0.27 + i * 0.11), dy - H * 0.005);
      b.stroke();
    }
    b.strokeStyle = 'rgba(140,100,70,0.5)';
    b.beginPath();
    b.moveTo(dx + dw * 0.3, dy - H * 0.015);
    b.lineTo(dx + dw * 0.52, dy - H * 0.014);
    b.stroke();
    // 台灯
    const lampX = dx + dw * 0.78;
    b.strokeStyle = 'rgba(24,18,22,0.9)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(lampX, dy);
    b.lineTo(lampX - 4, dy - H * 0.035);
    b.lineTo(lampX + 10, dy - H * 0.045);
    b.stroke();
    const lampG = b.createRadialGradient(lampX + 12, dy - H * 0.04, 0, lampX + 12, dy - H * 0.04, H * 0.075);
    lampG.addColorStop(0, 'rgba(255,226,164,0.8)');
    lampG.addColorStop(1, 'rgba(255,206,140,0)');
    b.fillStyle = lampG;
    b.beginPath(); b.arc(lampX + 12, dy - H * 0.04, H * 0.075, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(20,16,20,0.85)';
    b.beginPath();
    b.moveTo(lampX - 2, dy - H * 0.043);
    b.lineTo(lampX + 24, dy - H * 0.043);
    b.lineTo(lampX + 18, dy - H * 0.052);
    b.lineTo(lampX + 4, dy - H * 0.052);
    b.closePath(); b.fill();
    // 书架与图纸筒
    b.fillStyle = 'rgba(28,20,24,0.9)';
    b.fillRect(glX + glW * 0.68, glY + glH * 0.2, glW * 0.25, glH * 0.5);
    for (let s = 0; s < 3; s++) {
      b.fillStyle = 'rgba(224,214,190,0.18)';
      const by2 = glY + glH * (0.25 + s * 0.15);
      b.fillRect(glX + glW * 0.69, by2, glW * 0.23, 3);
      for (let k = 0; k < 5; k++) {
        b.fillStyle = k % 2 ? 'rgba(198,186,160,0.22)' : 'rgba(120,140,150,0.18)';
        b.fillRect(glX + glW * (0.70 + k * 0.042), by2 - H * 0.018, glW * 0.026, H * 0.016);
      }
    }
    b.strokeStyle = 'rgba(208,196,172,0.35)';
    b.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      b.beginPath();
      b.moveTo(glX + glW * (0.1 + i * 0.028), glY + glH * 0.95);
      b.lineTo(glX + glW * (0.1 + i * 0.028), glY + glH * 0.26);
      b.stroke();
    }
    b.restore();
    // 玻璃反光与竖梃
    b.save();
    b.globalCompositeOperation = 'lighter';
    const rf = b.createLinearGradient(glX, glY, glX + glW, glY + glH);
    rf.addColorStop(0, 'rgba(255,238,204,0.07)');
    rf.addColorStop(0.42, 'rgba(255,238,204,0.01)');
    rf.addColorStop(1, 'rgba(184,208,255,0.05)');
    b.fillStyle = rf;
    b.fillRect(glX, glY, glW, glH);
    b.restore();
    b.strokeStyle = night ? 'rgba(22,18,30,0.9)' : 'rgba(52,48,58,0.8)';
    b.lineWidth = Math.max(3, W * 0.003);
    b.strokeRect(glX, glY, glW, glH);
    b.lineWidth = Math.max(2, W * 0.002);
    for (let i = 1; i < 4; i++) {
      const xx = glX + (glW * i) / 4;
      b.beginPath(); b.moveTo(xx, glY); b.lineTo(xx, glY + glH); b.stroke();
    }
    b.beginPath(); b.moveTo(glX, glY + glH * 0.52); b.lineTo(glX + glW, glY + glH * 0.52); b.stroke();
    // 门与门把、台阶
    b.fillStyle = 'rgba(32,24,28,0.92)';
    b.fillRect(glX + glW * 0.74, glY + glH * 0.58, glW * 0.13, glH * 0.42);
    b.strokeStyle = 'rgba(214,192,148,0.35)';
    b.lineWidth = 2;
    b.strokeRect(glX + glW * 0.745, glY + glH * 0.6, glW * 0.11, glH * 0.38);
    b.fillStyle = 'rgba(214,192,148,0.65)';
    b.fillRect(glX + glW * 0.755, glY + glH * 0.78, 3, H * 0.012);
    for (let s = 0; s < 3; s++) {
      b.fillStyle = shade(p2.ground, 10 + s * 3);
      b.fillRect(stX + stW * 0.66 - s * 8, horizon + s * H * 0.012, stW * 0.3 + s * 16, H * 0.012);
    }
    // 事务所灯牌与门口盆栽
    b.fillStyle = 'rgba(255,222,162,0.16)';
    b.fillRect(glX + glW * 0.02, glY + glH * 0.02, glW * 0.13, H * 0.022);
    b.fillStyle = 'rgba(255,232,184,0.62)';
    b.font = `600 ${Math.max(7, H * 0.013)}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
    b.textAlign = 'center';
    b.fillText('OPEN', glX + glW * 0.085, glY + glH * 0.037);
    b.textAlign = 'left';
    for (let i = 0; i < 2; i++) {
      const potX = stX + stW * (0.08 + i * 0.9);
      b.fillStyle = night ? '#302832' : '#6c6158';
      b.beginPath();
      b.moveTo(potX - 10, horizon);
      b.lineTo(potX + 10, horizon);
      b.lineTo(potX + 7, horizon - H * 0.03);
      b.lineTo(potX - 7, horizon - H * 0.03);
      b.closePath(); b.fill();
      b.strokeStyle = night ? 'rgba(70,96,70,0.85)' : 'rgba(66,96,62,0.9)';
      b.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        b.beginPath();
        b.moveTo(potX, horizon - H * 0.03);
        b.quadraticCurveTo(potX + (k - 2) * 7, horizon - H * 0.055, potX + (k - 2) * 11, horizon - H * 0.075);
        b.stroke();
      }
    }
    // 路灯
    const lpX = W * 0.40, lpT = horizon - H * 0.42;
    b.strokeStyle = night ? 'rgba(18,16,28,0.95)' : 'rgba(48,46,54,0.85)';
    b.lineWidth = 7;
    b.beginPath();
    b.moveTo(lpX, horizon);
    b.lineTo(lpX, lpT);
    b.quadraticCurveTo(lpX, lpT - H * 0.02, lpX + W * 0.035, lpT - H * 0.02);
    b.stroke();
    b.fillStyle = night ? 'rgba(255,232,186,0.95)' : 'rgba(250,244,224,0.9)';
    b.beginPath(); b.ellipse(lpX + W * 0.035, lpT - H * 0.012, W * 0.012, H * 0.008, 0, 0, 6.3); b.fill();
    const lpg = b.createRadialGradient(lpX + W * 0.035, lpT - H * 0.012, 0, lpX + W * 0.035, lpT - H * 0.012, H * 0.18);
    lpg.addColorStop(0, 'rgba(255,214,150,0.55)');
    lpg.addColorStop(0.4, 'rgba(255,200,130,0.16)');
    lpg.addColorStop(1, 'rgba(255,196,120,0)');
    b.fillStyle = lpg;
    b.beginPath(); b.arc(lpX + W * 0.035, lpT - H * 0.012, H * 0.18, 0, 6.3); b.fill();
    // 上方电线
    b.strokeStyle = 'rgba(12,10,18,0.6)';
    b.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      b.beginPath();
      b.moveTo(0, H * (0.03 + i * 0.014));
      b.bezierCurveTo(W * 0.35, H * (0.06 + i * 0.016), W * 0.68, H * (0.015 + i * 0.012), W, H * (0.045 + i * 0.014));
      b.stroke();
    }
  }
  drawCompany.ground = (b, p, horizon) => {
    const p2 = PALETTES[state.time] || PALETTES.night;
    const night = state.time !== 'day';
    // 沥青路面
    const roadG = b.createLinearGradient(0, horizon, 0, H);
    roadG.addColorStop(0, night ? '#1b1828' : '#4d4a4c');
    roadG.addColorStop(0.5, night ? '#161421' : '#454345');
    roadG.addColorStop(1, night ? '#100e19' : '#3b3939');
    b.fillStyle = roadG;
    b.fillRect(0, horizon, W, H - horizon);
    // 人行道与路缘石
    b.fillStyle = shade(p2.ground, night ? 8 : 18);
    b.beginPath();
    b.moveTo(0, horizon + H * 0.012);
    b.lineTo(W, horizon + H * 0.012);
    b.lineTo(W, horizon + H * 0.10);
    b.lineTo(0, horizon + H * 0.10);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(255,246,226,0.08)';
    b.fillRect(0, horizon + H * 0.012, W, 2);
    b.strokeStyle = 'rgba(12,10,16,0.35)';
    b.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const tx = (i / 14) * W;
      b.beginPath();
      b.moveTo(tx, horizon + H * 0.012);
      b.lineTo(tx - W * 0.01, horizon + H * 0.10);
      b.stroke();
    }
    // 人行道铺砖：横向砖缝与错缝
    b.strokeStyle = night ? 'rgba(10,8,18,0.3)' : 'rgba(60,54,52,0.25)';
    for (let r = 1; r < 4; r++) {
      const yy = horizon + H * (0.012 + r * 0.022);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const tx = ((i + (i % 2) * 0.5) / 24) * W;
      const y0 = horizon + H * (0.012 + (i % 3) * 0.022);
      b.beginPath(); b.moveTo(tx, y0); b.lineTo(tx - 4, y0 + H * 0.022); b.stroke();
    }
    // 路缘石的暗面
    b.fillStyle = 'rgba(8,6,14,0.35)';
    b.fillRect(0, horizon + H * 0.098, W, H * 0.008);
    // 雨水篦子
    const drainX = W * 0.74, drainY = horizon + H * 0.055;
    b.fillStyle = 'rgba(16,14,22,0.7)';
    b.fillRect(drainX, drainY, W * 0.055, H * 0.018);
    b.strokeStyle = night ? 'rgba(120,124,142,0.25)' : 'rgba(150,148,140,0.4)';
    b.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      b.beginPath();
      b.moveTo(drainX + (W * 0.055 * i) / 6, drainY + 1);
      b.lineTo(drainX + (W * 0.055 * i) / 6, drainY + H * 0.018 - 1);
      b.stroke();
    }
    // 事务所门口泄到人行道的暖光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const doorSpill = b.createLinearGradient(0, horizon + H * 0.015, 0, horizon + H * 0.11);
    doorSpill.addColorStop(0, 'rgba(255,214,156,0.20)');
    doorSpill.addColorStop(1, 'rgba(255,206,140,0)');
    b.fillStyle = doorSpill;
    b.beginPath();
    b.moveTo(W * 0.78, horizon + H * 0.012);
    b.lineTo(W * 0.87, horizon + H * 0.012);
    b.lineTo(W * 0.92, horizon + H * 0.11);
    b.lineTo(W * 0.72, horizon + H * 0.11);
    b.closePath(); b.fill();
    b.restore();
    // 马路标线
    b.strokeStyle = night ? 'rgba(214,210,194,0.14)' : 'rgba(236,232,216,0.28)';
    b.lineWidth = Math.max(3, W * 0.004);
    b.setLineDash([W * 0.045, W * 0.03]);
    b.beginPath();
    b.moveTo(0, horizon + H * 0.23);
    b.bezierCurveTo(W * 0.4, horizon + H * 0.20, W * 0.72, horizon + H * 0.26, W, horizon + H * 0.22);
    b.stroke();
    b.setLineDash([]);
    // 事务所灯光在湿路面上的倒影
    b.save();
    b.globalCompositeOperation = 'lighter';
    const refl = b.createLinearGradient(0, horizon + H * 0.02, 0, H * 0.86);
    refl.addColorStop(0, 'rgba(255,206,146,0.24)');
    refl.addColorStop(0.5, 'rgba(255,190,120,0.08)');
    refl.addColorStop(1, 'rgba(255,180,110,0)');
    b.fillStyle = refl;
    b.beginPath();
    b.moveTo(W * 0.49, horizon + H * 0.02);
    b.lineTo(W * 0.94, horizon + H * 0.02);
    b.lineTo(W * 1.02, H * 0.88);
    b.lineTo(W * 0.42, H * 0.88);
    b.closePath(); b.fill();
    // 路灯的光池
    const lampPool = b.createRadialGradient(W * 0.42, horizon + H * 0.12, 0, W * 0.42, horizon + H * 0.12, H * 0.30);
    lampPool.addColorStop(0, 'rgba(255,222,164,0.18)');
    lampPool.addColorStop(1, 'rgba(255,216,150,0)');
    b.fillStyle = lampPool;
    b.fillRect(0, horizon, W * 0.8, H - horizon);
    b.restore();
    // 井盖、落叶、自行车剪影
    b.fillStyle = 'rgba(10,8,14,0.45)';
    b.beginPath(); b.ellipse(W * 0.22, horizon + H * 0.30, W * 0.032, H * 0.012, 0, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(120,112,100,0.18)';
    b.lineWidth = 1;
    b.beginPath(); b.ellipse(W * 0.22, horizon + H * 0.30, W * 0.025, H * 0.008, 0, 0, 6.3); b.stroke();
    for (let i = 0; i < 20; i++) {
      b.fillStyle = night ? 'rgba(150,132,108,0.10)' : 'rgba(198,146,88,0.16)';
      b.beginPath();
      b.ellipse(rand(0, W), horizon + rand(0.03, 0.28) * H, rand(2, 5), rand(1, 2), rand(-1, 1), 0, 6.3);
      b.fill();
    }
    // 靠墙的旧自行车
    const bx = W * 0.10, by = horizon + H * 0.115;
    b.strokeStyle = night ? 'rgba(16,14,24,0.9)' : 'rgba(52,48,52,0.8)';
    b.lineWidth = 2;
    b.beginPath(); b.arc(bx, by, H * 0.028, 0, 6.3); b.stroke();
    b.beginPath(); b.arc(bx + W * 0.055, by, H * 0.028, 0, 6.3); b.stroke();
    b.beginPath();
    b.moveTo(bx, by);
    b.lineTo(bx + W * 0.018, by - H * 0.045);
    b.lineTo(bx + W * 0.045, by - H * 0.045);
    b.lineTo(bx + W * 0.055, by);
    b.moveTo(bx + W * 0.018, by - H * 0.045);
    b.lineTo(bx + W * 0.02, by);
    b.stroke();
    b.beginPath(); b.moveTo(bx + W * 0.045, by - H * 0.045); b.lineTo(bx + W * 0.048, by - H * 0.06); b.stroke();
  };

  /* ---------- 场景：教室 ---------- */
  function drawClassroom(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const day = state.time === 'day';
    const night = state.time === 'night';
    // 天花板与横梁
    const ceil = H * 0.085;
    b.fillStyle = day ? '#bdb5a4' : shade(p2.ground, -30);
    b.fillRect(0, 0, W, ceil);
    b.fillStyle = day ? '#c8bfad' : shade(p2.ground, -20);
    b.fillRect(0, ceil - 6, W, 8);
    b.fillStyle = 'rgba(255,244,220,0.05)';
    b.fillRect(0, ceil - 6, W, 2);
    for (let i = 0; i < 6; i++) {
      const xx = W * (0.08 + i * 0.17);
      b.fillStyle = 'rgba(10,6,14,0.10)';
      b.fillRect(xx, 0, W * 0.006, ceil - 8);
    }
    // 吊扇：吊杆、三片薄扇叶与中心盖，叶片的弧度和厚度让天花板上多一点生活气
    const fanX = W * 0.30, fanY = ceil * 0.9;
    b.strokeStyle = day ? '#8f8776' : 'rgba(150,130,120,0.45)';
    b.lineWidth = 2;
    b.beginPath(); b.moveTo(fanX, 0); b.lineTo(fanX, fanY); b.stroke();
    // 吊杆与天花板的接盘
    b.fillStyle = day ? '#9b917c' : 'rgba(120,110,102,0.55)';
    b.beginPath(); b.ellipse(fanX, 2, W * 0.014, H * 0.005, 0, 0, 6.3); b.fill();
    b.fillStyle = day ? '#77705e' : 'rgba(72,64,60,0.6)';
    b.beginPath(); b.ellipse(fanX, 3, W * 0.008, H * 0.0032, 0, 0, 6.3); b.fill();
    // 扇叶投在天花板上的虚影
    b.save();
    b.translate(fanX + W * 0.0035, fanY - H * 0.004);
    b.fillStyle = 'rgba(20,14,16,0.10)';
    b.beginPath(); b.ellipse(0, 0, W * 0.060, H * 0.010, -0.18, 0, 6.3); b.fill();
    b.restore();
    b.save();
    b.translate(fanX, fanY);
    b.rotate(-0.18);
    const bladeC = day ? ['#b6ab92', '#8e846e', '#5f584a'] : ['#776a66', '#584d4b', '#3a3332'];
    for (let i = 0; i < 3; i++) {
      b.save();
      b.rotate((Math.PI * 2) / 3 * i);
      const r0 = W * 0.011, r1 = W * 0.069;
      const bg = b.createLinearGradient(r0, 0, r1, 0);
      bg.addColorStop(0, bladeC[0]);
      bg.addColorStop(0.55, bladeC[1]);
      bg.addColorStop(1, bladeC[2]);
      b.fillStyle = bg;
      b.beginPath();
      b.moveTo(r0, -H * 0.0024);
      b.quadraticCurveTo(r1 * 0.55, -H * 0.0086, r1, -H * 0.0042);
      b.quadraticCurveTo(r1 * 1.015, H * 0.0006, r1 * 0.92, H * 0.0056);
      b.quadraticCurveTo(r1 * 0.54, H * 0.0074, r0, H * 0.0021);
      b.closePath();
      b.fill();
      // 叶缘的厚度与受光
      b.strokeStyle = day ? 'rgba(255,246,222,0.22)' : 'rgba(255,244,218,0.12)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(r0, -H * 0.0024);
      b.quadraticCurveTo(r1 * 0.55, -H * 0.0086, r1, -H * 0.0042);
      b.stroke();
      b.strokeStyle = 'rgba(24,18,16,0.20)';
      b.beginPath();
      b.moveTo(r0, H * 0.0021);
      b.quadraticCurveTo(r1 * 0.54, H * 0.0074, r1 * 0.92, H * 0.0056);
      b.stroke();
      b.restore();
    }
    // 中心盖：金属盘与螺钉
    const hub = b.createRadialGradient(-W * 0.002, -H * 0.002, 0, 0, 0, W * 0.012);
    hub.addColorStop(0, day ? '#d8ceb6' : '#8d817c');
    hub.addColorStop(0.68, day ? '#a29880' : '#655a57');
    hub.addColorStop(1, day ? '#776d5a' : '#463d3b');
    b.fillStyle = hub;
    b.beginPath(); b.arc(0, 0, W * 0.0115, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(255,246,224,0.18)';
    b.lineWidth = 1;
    b.beginPath(); b.arc(0, 0, W * 0.0098, Math.PI * 1.02, Math.PI * 1.92); b.stroke();
    b.fillStyle = 'rgba(30,24,22,0.55)';
    b.beginPath(); b.arc(0, 0, W * 0.0022, 0, 6.3); b.fill();
    b.restore();
    // 后墙：整面墙铺满，而不是露出天空
    const wallTop = day ? '#d8d1c0' : shade(p2.skyMid, night ? -48 : -40);
    const wallMid = day ? '#cfc6b2' : shade(p2.skyMid, night ? -42 : -34);
    const wallBot = day ? '#c2b7a1' : shade(p2.skyMid, night ? -36 : -27);
    const wallG = b.createLinearGradient(0, ceil, 0, horizon);
    wallG.addColorStop(0, wallTop);
    wallG.addColorStop(0.62, wallMid);
    wallG.addColorStop(1, wallBot);
    b.fillStyle = wallG;
    b.fillRect(0, ceil, W, horizon - ceil);
    // 墙面斑驳与水渍
    for (let i = 0; i < 110; i++) {
      const x = Math.random() * W, y = ceil + Math.random() * (horizon - ceil);
      b.fillStyle = Math.random() < 0.5
        ? `rgba(255,236,205,${rand(0.012, 0.035)})`
        : `rgba(24,12,30,${rand(0.018, 0.05)})`;
      b.beginPath();
      b.ellipse(x, y, rand(10, 58), rand(3, 15), rand(-0.6, 0.6), 0, 6.3);
      b.fill();
    }
    // 后墙踢脚线
    b.fillStyle = shade(p2.ground, day ? 2 : -14);
    b.fillRect(0, horizon - H * 0.028, W, H * 0.028);
    b.fillStyle = 'rgba(255,240,214,0.05)';
    b.fillRect(0, horizon - H * 0.028, W, 2);

    // 黑板：木框、墨绿板面、粉笔槽与板擦
    const bx = W * 0.045, by = H * 0.245, bw = W * 0.395, bh = H * 0.205;
    b.fillStyle = 'rgba(8,6,12,0.35)';
    b.fillRect(bx - 18, by - 16, bw + 36, bh + 46);
    const frameG = b.createLinearGradient(0, by - 16, 0, by + bh + 28);
    frameG.addColorStop(0, day ? '#b08a5c' : shade(p2.ground, 16));
    frameG.addColorStop(0.5, day ? '#8f6a42' : shade(p2.ground, 4));
    frameG.addColorStop(1, day ? '#6f4e30' : shade(p2.ground, -8));
    b.fillStyle = frameG;
    b.fillRect(bx - 15, by - 15, bw + 30, bh + 40);
    b.strokeStyle = 'rgba(255,240,212,0.08)';
    b.lineWidth = 1.2;
    b.strokeRect(bx - 13, by - 13, bw + 26, bh + 36);
    const boardG = b.createLinearGradient(0, by, 0, by + bh);
    boardG.addColorStop(0, day ? '#345a4e' : '#233b37');
    boardG.addColorStop(0.55, day ? '#2b4c43' : '#1c302f');
    boardG.addColorStop(1, day ? '#24433b' : '#162827');
    b.fillStyle = boardG;
    b.fillRect(bx, by, bw, bh);
    // 没擦干净的旧板书
    b.save();
    b.strokeStyle = 'rgba(224,236,222,0.055)';
    b.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      const lx = bx + rand(0.04, 0.7) * bw, ly = by + rand(0.1, 0.8) * bh;
      b.beginPath(); b.moveTo(lx, ly); b.lineTo(lx + rand(8, 40), ly + rand(-3, 3)); b.stroke();
    }
    b.restore();
    // 粉笔字：距离二学期开学还有3天（第一、四章共用）
    const chalkSize = Math.max(11, H * 0.0235);
    b.save();
    b.font = `600 ${chalkSize}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
    b.textAlign = 'right';
    b.textBaseline = 'alphabetic';
    const chalkX = bx + bw - 16;
    const chalkY = by + bh - 14;
    b.fillStyle = 'rgba(255,236,168,0.66)';
    b.fillText('距离二学期开学还有3天', chalkX, chalkY);
    b.fillStyle = 'rgba(255,246,214,0.15)';
    b.fillText('距离二学期开学还有3天', chalkX + 1.1, chalkY + 1.1);
    b.restore();
    // 粉笔槽、粉笔头、板擦
    b.fillStyle = day ? '#7d5a38' : shade(p2.ground, 2);
    b.fillRect(bx - 18, by + bh + 10, bw + 36, 9);
    b.fillStyle = 'rgba(255,248,226,0.12)';
    b.fillRect(bx - 18, by + bh + 10, bw + 36, 2);
    for (let i = 0; i < 3; i++) {
      b.fillStyle = i === 1 ? 'rgba(246,240,222,0.75)' : 'rgba(232,222,198,0.62)';
      b.fillRect(bx + bw * (0.52 + i * 0.045), by + bh + 12, Math.max(8, H * 0.016), 4);
    }
    b.fillStyle = 'rgba(38,30,34,0.85)';
    b.fillRect(bx + bw * 0.82, by + bh + 9, H * 0.052, 9);
    b.fillStyle = 'rgba(210,218,224,0.22)';
    b.fillRect(bx + bw * 0.82, by + bh + 9, H * 0.052, 3);

    // 挂钟（黑板右上）
    const ckx = bx + bw + W * 0.035, cky = H * 0.175, ckr = Math.min(W, H) * 0.027;
    b.fillStyle = 'rgba(238,232,214,0.20)';
    b.beginPath(); b.arc(ckx, cky, ckr, 0, 6.3); b.fill();
    b.strokeStyle = shade(p2.ground, day ? 28 : 8);
    b.lineWidth = 3;
    b.beginPath(); b.arc(ckx, cky, ckr, 0, 6.3); b.stroke();
    b.strokeStyle = 'rgba(30,22,30,0.55)';
    b.lineWidth = 1.5;
    b.beginPath(); b.moveTo(ckx, cky); b.lineTo(ckx, cky - ckr * 0.55); b.stroke();
    b.beginPath(); b.moveTo(ckx, cky); b.lineTo(ckx + ckr * 0.4, cky + ckr * 0.18); b.stroke();

    // 大窗：木框、竖梃、窗台、窗帘
    const wx = W * 0.528, wy = H * 0.175, ww = W * 0.415, wh = H * 0.345;
    const winTop = day ? '#8fc0e2' : state.time === 'dusk' ? '#7e4a72' : '#1a1c40';
    const winBot = day ? '#d9e6e6' : state.time === 'dusk' ? '#ffc37c' : '#3b3158';
    const skyG = b.createLinearGradient(0, wy, 0, wy + wh);
    skyG.addColorStop(0, winTop);
    skyG.addColorStop(0.62, state.time === 'dusk' ? '#f2a066' : winBot);
    skyG.addColorStop(1, winBot);
    b.fillStyle = skyG;
    b.fillRect(wx, wy, ww, wh);
    // 窗外远景：海面、远山、香樟树
    const seaY = wy + wh * (day ? 0.66 : 0.72);
    const seaG = b.createLinearGradient(0, seaY, 0, wy + wh);
    if (day) {
      seaG.addColorStop(0, 'rgba(120,168,192,0.75)');
      seaG.addColorStop(1, 'rgba(66,112,148,0.85)');
    } else if (state.time === 'dusk') {
      seaG.addColorStop(0, 'rgba(232,146,92,0.75)');
      seaG.addColorStop(1, 'rgba(108,62,84,0.85)');
    } else {
      seaG.addColorStop(0, 'rgba(40,46,86,0.9)');
      seaG.addColorStop(1, 'rgba(20,22,48,0.95)');
    }
    b.fillStyle = seaG;
    b.fillRect(wx + 3, seaY, ww - 6, wy + wh - seaY - 3);
    b.strokeStyle = day ? 'rgba(255,248,226,0.5)' : state.time === 'dusk' ? 'rgba(255,212,150,0.45)' : 'rgba(160,180,235,0.28)';
    b.lineWidth = 1.3;
    b.beginPath(); b.moveTo(wx + 3, seaY); b.lineTo(wx + ww - 3, seaY); b.stroke();
    for (let i = 0; i < 20; i++) {
      const sx = wx + 8 + Math.random() * (ww - 16);
      const sy = seaY + 4 + Math.random() * (wy + wh - seaY - 10);
      b.strokeStyle = day ? 'rgba(236,246,255,0.42)' : state.time === 'dusk' ? 'rgba(255,224,178,0.34)' : 'rgba(170,190,240,0.18)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(sx, sy); b.lineTo(sx + rand(5, 20), sy); b.stroke();
    }
    // 远处防波堤与小镇轮廓（黄昏/夜晚）
    if (!day) {
      b.fillStyle = state.time === 'dusk' ? 'rgba(72,44,66,0.8)' : 'rgba(14,16,36,0.9)';
      b.fillRect(wx + 3, seaY - H * 0.012, ww - 6, H * 0.014);
      for (let i = 0; i < 12; i++) {
        const lx = wx + rand(0.04, 0.9) * ww;
        const lh = rand(2, 8);
        b.fillStyle = state.time === 'dusk' ? 'rgba(255,214,150,0.5)' : 'rgba(255,222,168,0.55)';
        b.fillRect(lx, seaY - H * 0.012 - lh, 2, lh);
      }
    }
    if (state.time === 'dusk') {
      const sunX = wx + ww * 0.72, sunY = wy + wh * 0.52;
      const sunG = b.createRadialGradient(sunX, sunY, 0, sunX, sunY, wh * 0.32);
      sunG.addColorStop(0, 'rgba(255,244,214,0.9)');
      sunG.addColorStop(0.25, 'rgba(255,206,136,0.65)');
      sunG.addColorStop(1, 'rgba(255,170,90,0)');
      b.fillStyle = sunG;
      b.beginPath(); b.arc(sunX, sunY, wh * 0.32, 0, 6.3); b.fill();
    }
    // 香樟树剪影（窗外右侧与左上方）
    drawCamphor(b, wx + ww * 0.9, wy + wh * 0.2, wh * 0.95, state.time === 'day' ? 'rgba(52,82,58,0.55)' : 'rgba(30,22,42,0.72)');
    drawCamphor(b, wx + ww * 0.06, wy + wh * 0.06, wh * 0.6, state.time === 'day' ? 'rgba(60,92,62,0.35)' : 'rgba(24,18,36,0.5)');
    // 窗框
    b.strokeStyle = day ? '#cfc7b6' : shade(p2.ground, 20);
    b.lineWidth = Math.max(6, W * 0.006);
    b.strokeRect(wx, wy, ww, wh);
    b.lineWidth = Math.max(3, W * 0.0028);
    b.beginPath();
    b.moveTo(wx + ww / 2, wy); b.lineTo(wx + ww / 2, wy + wh);
    b.moveTo(wx, wy + wh * 0.34); b.lineTo(wx + ww, wy + wh * 0.34);
    b.moveTo(wx, wy + wh * 0.67); b.lineTo(wx + ww, wy + wh * 0.67);
    b.stroke();
    // 窗台
    b.fillStyle = day ? '#b9ad96' : shade(p2.ground, 10);
    b.fillRect(wx - 8, wy + wh + 2, ww + 16, H * 0.012);
    b.fillStyle = 'rgba(255,246,224,0.14)';
    b.fillRect(wx - 8, wy + wh + 2, ww + 16, 2);
    // 窗帘
    for (let s = -1; s <= 1; s += 2) {
      const cx0 = s < 0 ? wx - W * 0.012 : wx + ww - W * 0.052;
      const cg = b.createLinearGradient(cx0, 0, cx0 + W * 0.064, 0);
      cg.addColorStop(0, 'rgba(240,226,198,0.30)');
      cg.addColorStop(0.5, 'rgba(240,226,198,0.16)');
      cg.addColorStop(1, 'rgba(240,226,198,0.28)');
      b.fillStyle = cg;
      b.beginPath();
      b.moveTo(cx0, wy - H * 0.01);
      b.lineTo(cx0 + W * 0.064, wy - H * 0.01);
      b.lineTo(cx0 + W * 0.055, wy + wh + H * 0.02);
      b.lineTo(cx0 + W * 0.006, wy + wh + H * 0.02);
      b.closePath(); b.fill();
      b.strokeStyle = 'rgba(255,244,220,0.12)';
      b.lineWidth = 1.2;
      for (let f = 1; f < 4; f++) {
        b.beginPath();
        b.moveTo(cx0 + (W * 0.064 * f) / 4, wy);
        b.lineTo(cx0 + (W * 0.058 * f) / 4, wy + wh);
        b.stroke();
      }
    }
    // 窗光斜照到墙面与地面
    b.save(); b.globalCompositeOperation = 'lighter';
    const beamA = day ? 0.14 : state.time === 'dusk' ? 0.11 : 0.05;
    b.fillStyle = hexA(p2.glow, beamA);
    b.beginPath();
    b.moveTo(wx, wy + wh * 0.18);
    b.lineTo(wx + ww, wy + wh * 0.62);
    b.lineTo(wx + ww * 1.25, H);
    b.lineTo(wx - ww * 0.1, H);
    b.closePath(); b.fill();
    b.restore();
    // 课桌与地板（见 drawClassroom.ground：必须画在地面渐变之后）
  }
  // 教室地面与课桌椅：黄昏章两人伏案修磁带；白天章是空座位与晨光
  drawClassroom.ground = (b, p, horizon) => {
    const p2 = PALETTES[state.time] || PALETTES.day;
    const day = state.time === 'day';
    const night = state.time === 'night';
    // 木地板
    const fg = b.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, day ? '#b09573' : shade(p2.ground, 6));
    fg.addColorStop(0.55, day ? '#9e8365' : shade(p2.ground, 0));
    fg.addColorStop(1, day ? '#8a7057' : shade(p2.ground, -8));
    b.fillStyle = fg;
    b.fillRect(0, horizon, W, H - horizon);
    b.strokeStyle = 'rgba(10,6,12,0.18)';
    b.lineWidth = 1.2;
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      const yy = horizon + (H - horizon) * t;
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    // 地板拼缝向远处收束，做出纵深
    b.save();
    b.strokeStyle = day ? 'rgba(70,46,28,0.13)' : 'rgba(10,6,12,0.2)';
    b.lineWidth = 1.1;
    for (let i = -7; i <= 7; i++) {
      const x0 = W * 0.5 + i * W * 0.145;
      b.beginPath();
      b.moveTo(x0, H);
      b.lineTo(W * 0.5 + (x0 - W * 0.5) * 0.08, horizon + 2);
      b.stroke();
    }
    b.restore();
    // 地板拼缝与划痕
    b.strokeStyle = 'rgba(255,240,210,0.05)';
    for (let i = 0; i < 26; i++) {
      const yy = horizon + rand(0.03, 0.36) * (H - horizon);
      const xx = rand(0, 1) * W;
      b.beginPath(); b.moveTo(xx, yy); b.lineTo(xx + rand(16, 70), yy + rand(-2, 2)); b.stroke();
    }
    // 窗光落在地板上
    if (!night) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      const lx = W * 0.528, lw = W * 0.415;
      b.fillStyle = hexA(p2.glow, day ? 0.10 : 0.08);
      b.beginPath();
      b.moveTo(lx, horizon);
      b.lineTo(lx + lw, horizon);
      b.lineTo(lx + lw * 1.12, H);
      b.lineTo(lx - lw * 0.16, H);
      b.closePath(); b.fill();
      b.restore();
    }
    // 课桌椅：两排，后排靠墙，前排留给叙事焦点
    const chairWood = day ? '#a1815c' : shade(p2.ground, -2);
    const deskWoodA = day ? '#c9a87d' : shade(p2.ground, 20);
    const deskWoodB = day ? '#b2906a' : shade(p2.ground, 6);
    const deskLeg = day ? '#7f5f40' : shade(p2.ground, -8);
    const rowSpec = [
      { t: 0.015, scale: 0.82, alpha: 0.9 },
      { t: 0.115, scale: 1.0, alpha: 1 },
    ];
    for (let r = 0; r < rowSpec.length; r++) {
      const spec = rowSpec[r];
      const baseY = horizon + (H - horizon) * spec.t;
      const dw = W * 0.185 * spec.scale;
      const dh = H * 0.022 * spec.scale;
      for (let i = 0; i < 3; i++) {
        const cx = W * (0.2 + i * 0.3) + (r ? W * 0.015 : 0);
        // 椅子（在桌后）：横档靠背、竖档、椅腿
        const chW = dw * 0.62, chTop = baseY - H * 0.066 * spec.scale;
        b.globalAlpha = spec.alpha * 0.92;
        b.fillStyle = chairWood;
        b.fillRect(cx - chW / 2, chTop, chW, H * 0.011 * spec.scale);
        b.fillRect(cx - chW / 2, chTop + H * 0.022 * spec.scale, chW, 3);
        for (let k = 0; k < 3; k++) {
          b.fillRect(cx - chW / 2 + chW * (0.14 + k * 0.36), chTop + H * 0.008 * spec.scale, 3, H * 0.036 * spec.scale);
        }
        b.fillRect(cx - chW / 2, chTop, 4, H * 0.052 * spec.scale);
        b.fillRect(cx + chW / 2 - 4, chTop, 4, H * 0.052 * spec.scale);
        // 桌面
        const top = b.createLinearGradient(0, baseY - dh, 0, baseY + dh);
        top.addColorStop(0, deskWoodA);
        top.addColorStop(1, deskWoodB);
        b.fillStyle = top;
        b.fillRect(cx - dw / 2, baseY - dh, dw, dh);
        b.fillStyle = 'rgba(255,246,226,0.14)';
        b.fillRect(cx - dw / 2 + 2, baseY - dh + 2, dw - 4, 2);
        // 桌沿与桌下书包斗
        b.fillStyle = deskLeg;
        b.fillRect(cx - dw / 2, baseY, dw, H * 0.008 * spec.scale);
        b.fillStyle = day ? '#8f6c49' : shade(p2.ground, -4);
        b.fillRect(cx - dw * 0.37, baseY + H * 0.009 * spec.scale, dw * 0.74, H * 0.026 * spec.scale);
        b.fillStyle = 'rgba(255,240,214,0.08)';
        b.fillRect(cx - dw * 0.37, baseY + H * 0.009 * spec.scale, dw * 0.74, 2);
        b.strokeStyle = 'rgba(30,20,16,0.18)';
        b.lineWidth = 1;
        b.strokeRect(cx - dw * 0.37, baseY + H * 0.009 * spec.scale, dw * 0.74, H * 0.026 * spec.scale);
        // 金属桌腿与横撑
        b.fillStyle = deskLeg;
        b.fillRect(cx - dw * 0.46, baseY + H * 0.008 * spec.scale, 6, H * 0.072 * spec.scale);
        b.fillRect(cx + dw * 0.46 - 6, baseY + H * 0.008 * spec.scale, 6, H * 0.072 * spec.scale);
        b.fillRect(cx - dw * 0.40, baseY + H * 0.008 * spec.scale, 5, H * 0.068 * spec.scale);
        b.fillRect(cx + dw * 0.40 - 5, baseY + H * 0.008 * spec.scale, 5, H * 0.068 * spec.scale);
        b.fillRect(cx - dw * 0.44, baseY + H * 0.062 * spec.scale, dw * 0.88, 3);
        // 桌面物品：白天第一排保持空桌，只留晨光
        if (r === 1 && i === 1 && day) {
          b.fillStyle = 'rgba(255,248,226,0.14)';
          b.fillRect(cx - dw * 0.34, baseY - dh + 3, dw * 0.68, 3);
        } else if (!day) {
          b.fillStyle = 'rgba(238,230,212,0.16)';
          b.fillRect(cx - dw * 0.18, baseY - dh - 3, dw * 0.3, dh * 0.35);
          b.fillStyle = 'rgba(255,196,150,0.20)';
          b.fillRect(cx - dw * 0.18, baseY - dh - 3, dw * 0.3, 1.5);
        }
        if (r === 1 && i === 0) {
          // 铅笔盒与橡皮
          b.fillStyle = day ? '#cfc3a4' : shade(p2.ground, 8);
          b.fillRect(cx + dw * 0.16, baseY - dh - 4, dw * 0.16, dh * 0.5);
          b.fillStyle = 'rgba(255,240,214,0.2)';
          b.fillRect(cx - dw * 0.02, baseY - dh - 4, dw * 0.08, dh * 0.42);
        }
        b.globalAlpha = 1;
      }
    }
  };

  /* ---------- 场景：操场 ---------- */
  function drawPlayground(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const day = state.time === 'day';
    const night = state.time === 'night';
    // 远处的海与防波堤：操场就在海滨小镇边上
    const seaY = horizon - H * 0.035;
    const seaG = b.createLinearGradient(0, seaY, 0, horizon);
    seaG.addColorStop(0, state.time === 'dusk' ? 'rgba(240,154,96,0.62)' : night ? 'rgba(42,44,82,0.9)' : 'rgba(120,166,192,0.7)');
    seaG.addColorStop(1, state.time === 'dusk' ? 'rgba(118,62,78,0.85)' : night ? 'rgba(18,20,44,0.95)' : 'rgba(76,122,152,0.85)');
    b.fillStyle = seaG;
    b.fillRect(0, seaY, W, horizon - seaY);
    b.strokeStyle = state.time === 'dusk' ? 'rgba(255,214,160,0.4)' : night ? 'rgba(150,168,222,0.25)' : 'rgba(246,250,246,0.45)';
    b.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const sx = Math.random() * W, sy = seaY + Math.random() * (horizon - seaY - 2);
      b.beginPath(); b.moveTo(sx, sy); b.lineTo(sx + rand(8, 28), sy); b.stroke();
    }
    // 教学楼：左侧，三层，带楼梯间、女儿墙和门厅
    const bldX = W * 0.015, bldW = W * 0.40, bldTop = horizon - H * 0.22;
    const wallCol = night ? '#1b1c33' : day ? '#8b9184' : '#3c2c3e';
    b.fillStyle = wallCol;
    b.fillRect(bldX, bldTop, bldW, horizon - bldTop);
    // 墙面：楼层线、竖向壁柱、雨水痕
    b.save();
    b.strokeStyle = night ? 'rgba(90,96,132,0.16)' : day ? 'rgba(60,66,58,0.20)' : 'rgba(18,12,22,0.28)';
    b.lineWidth = 1.2;
    for (let f = 1; f < 3; f++) {
      const ly = bldTop + H * 0.082 * f;
      b.beginPath(); b.moveTo(bldX, ly); b.lineTo(bldX + bldW, ly); b.stroke();
    }
    b.strokeStyle = night ? 'rgba(90,96,132,0.10)' : 'rgba(255,248,228,0.06)';
    for (let i = 0; i < 8; i++) {
      const px0 = bldX + bldW * (0.045 + i * 0.13);
      b.beginPath(); b.moveTo(px0, bldTop); b.lineTo(px0, horizon); b.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const rx = bldX + rand(0.02, 0.98) * bldW;
      b.fillStyle = night ? 'rgba(8,10,22,0.18)' : 'rgba(30,24,32,0.07)';
      b.fillRect(rx, bldTop + rand(0, 0.5) * (horizon - bldTop), rand(1, 3), rand(20, 90));
    }
    b.restore();
    // 女儿墙压顶
    b.fillStyle = night ? '#252744' : day ? '#a6aa9c' : '#4b3647';
    b.fillRect(bldX - 10, bldTop - H * 0.012, bldW + 20, H * 0.014);
    b.fillStyle = 'rgba(255,250,236,0.12)';
    b.fillRect(bldX - 10, bldTop - H * 0.012, bldW + 20, 2);
    // 楼梯间与屋顶水箱、天线
    b.fillStyle = night ? '#161729' : day ? '#737a6e' : '#34263a';
    b.fillRect(bldX + bldW * 0.62, bldTop - H * 0.055, bldW * 0.22, H * 0.055);
    b.fillStyle = 'rgba(255,250,236,0.10)';
    b.fillRect(bldX + bldW * 0.62, bldTop - H * 0.055, bldW * 0.22, 2);
    b.fillStyle = night ? 'rgba(255,210,150,0.16)' : 'rgba(20,18,30,0.35)';
    b.fillRect(bldX + bldW * 0.68, bldTop - H * 0.042, bldW * 0.045, H * 0.022);
    b.fillStyle = night ? '#20223a' : day ? '#9aa092' : '#463348';
    b.fillRect(bldX + bldW * 0.72, bldTop - H * 0.088, bldW * 0.075, H * 0.034);
    b.fillStyle = 'rgba(255,250,236,0.14)';
    b.fillRect(bldX + bldW * 0.72, bldTop - H * 0.088, bldW * 0.075, 1.5);
    b.strokeStyle = night ? 'rgba(120,128,168,0.4)' : 'rgba(52,46,58,0.6)';
    b.lineWidth = 1.2;
    b.beginPath();
    b.moveTo(bldX + bldW * 0.86, bldTop - H * 0.012);
    b.lineTo(bldX + bldW * 0.86, bldTop - H * 0.09);
    b.moveTo(bldX + bldW * 0.835, bldTop - H * 0.072);
    b.lineTo(bldX + bldW * 0.885, bldTop - H * 0.072);
    b.stroke();
    // 楼层窗带：凹进的窗洞、白框、十字梃、窗台；少数亮着灯
    for (let f = 0; f < 3; f++) {
      const fy = bldTop + H * 0.026 + f * H * 0.058;
      for (let w = 0; w < 7; w++) {
        const wx = bldX + bldW * (0.055 + w * 0.132);
        const ww2 = bldW * 0.082, wh2 = H * 0.038;
        const lit = night ? Math.random() < 0.5 : day ? Math.random() < 0.16 : Math.random() < 0.3;
        // 窗洞阴影
        b.fillStyle = 'rgba(10,8,16,0.28)';
        b.fillRect(wx - 2, fy - 2, ww2 + 4, wh2 + 4);
        // 玻璃
        if (lit) {
          const gl = b.createLinearGradient(0, fy, 0, fy + wh2);
          gl.addColorStop(0, hexA(p2.glow, night ? 0.72 : 0.5));
          gl.addColorStop(1, hexA(p2.glow, night ? 0.34 : 0.22));
          b.fillStyle = gl;
        } else {
          b.fillStyle = night ? 'rgba(9,10,24,0.8)' : day ? 'rgba(66,84,88,0.5)' : 'rgba(28,26,44,0.55)';
        }
        b.fillRect(wx, fy, ww2, wh2);
        // 玻璃反光
        b.fillStyle = 'rgba(255,255,255,0.07)';
        b.beginPath();
        b.moveTo(wx + ww2 * 0.12, fy + wh2);
        b.lineTo(wx + ww2 * 0.5, fy);
        b.lineTo(wx + ww2 * 0.7, fy);
        b.lineTo(wx + ww2 * 0.32, fy + wh2);
        b.closePath(); b.fill();
        // 窗框与十字梃
        b.strokeStyle = night ? 'rgba(120,126,158,0.42)' : day ? 'rgba(214,218,206,0.7)' : 'rgba(84,64,80,0.6)';
        b.lineWidth = 1.6;
        b.strokeRect(wx, fy, ww2, wh2);
        b.lineWidth = 1;
        b.beginPath();
        b.moveTo(wx + ww2 / 2, fy); b.lineTo(wx + ww2 / 2, fy + wh2);
        b.moveTo(wx, fy + wh2 * 0.5); b.lineTo(wx + ww2, fy + wh2 * 0.5);
        b.stroke();
        // 窗帘
        if (lit && Math.random() < 0.5) {
          b.fillStyle = 'rgba(226,196,160,0.22)';
          b.fillRect(wx + (Math.random() < 0.5 ? 0 : ww2 * 0.68), fy + 1, ww2 * 0.22, wh2 - 2);
        }
        // 窗台
        b.fillStyle = night ? 'rgba(80,84,112,0.5)' : day ? 'rgba(196,198,184,0.8)' : 'rgba(76,60,72,0.7)';
        b.fillRect(wx - 3, fy + wh2, ww2 + 6, 2.5);
        // 空调外机：只在部分窗户下
        if ((w + f) % 4 === 2) {
          b.fillStyle = night ? 'rgba(54,58,82,0.8)' : day ? 'rgba(168,170,160,0.9)' : 'rgba(70,58,70,0.85)';
          b.fillRect(wx + ww2 * 0.2, fy + wh2 + 5, ww2 * 0.6, H * 0.016);
          b.strokeStyle = 'rgba(20,16,24,0.3)';
          b.lineWidth = 1;
          b.strokeRect(wx + ww2 * 0.2, fy + wh2 + 5, ww2 * 0.6, H * 0.016);
          b.beginPath();
          b.arc(wx + ww2 * 0.5, fy + wh2 + 5 + H * 0.008, H * 0.005, 0, 6.3);
          b.stroke();
        }
      }
    }
    // 门厅：雨棚、玻璃门、校名牌与台阶
    const entX = bldX + bldW * 0.38, entW = bldW * 0.2;
    b.fillStyle = night ? 'rgba(255,210,150,0.20)' : 'rgba(20,18,30,0.38)';
    b.fillRect(entX, horizon - H * 0.098, entW, H * 0.098);
    b.fillStyle = night ? 'rgba(255,218,160,0.28)' : 'rgba(150,174,172,0.42)';
    b.fillRect(entX + entW * 0.08, horizon - H * 0.085, entW * 0.84, H * 0.075);
    b.strokeStyle = night ? 'rgba(190,170,140,0.3)' : 'rgba(214,216,202,0.55)';
    b.lineWidth = 1.4;
    b.beginPath();
    b.moveTo(entX + entW * 0.5, horizon - H * 0.085);
    b.lineTo(entX + entW * 0.5, horizon - H * 0.012);
    b.stroke();
    // 雨棚
    b.fillStyle = night ? '#2a2c46' : day ? '#7d8478' : '#4c3648';
    b.fillRect(entX - W * 0.012, horizon - H * 0.108, entW + W * 0.024, H * 0.014);
    b.fillStyle = 'rgba(255,250,236,0.14)';
    b.fillRect(entX - W * 0.012, horizon - H * 0.108, entW + W * 0.024, 2);
    // 校名牌
    b.fillStyle = night ? '#161826' : day ? '#f0ead8' : '#2c2430';
    b.fillRect(entX + entW * 0.16, horizon - H * 0.132, entW * 0.68, H * 0.026);
    b.strokeStyle = 'rgba(214,198,150,0.35)';
    b.lineWidth = 1;
    b.strokeRect(entX + entW * 0.16, horizon - H * 0.132, entW * 0.68, H * 0.026);
    b.fillStyle = night ? 'rgba(236,220,180,0.72)' : day ? '#3c3a32' : 'rgba(230,214,178,0.65)';
    b.font = `600 ${Math.max(8, H * 0.0175)}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
    b.textAlign = 'center';
    b.fillText('县立青叶高中', entX + entW * 0.5, horizon - H * 0.113);
    b.textAlign = 'left';
    for (let s = 0; s < 3; s++) {
      b.fillStyle = night ? shade(p2.ground, 2 + s * 3) : day ? '#b4b2a2' : shade(p2.ground, 12 + s * 3);
      b.fillRect(entX - s * 9, horizon - H * 0.006 + s * H * 0.012, entW + s * 18, H * 0.012);
      b.fillStyle = 'rgba(255,248,228,0.10)';
      b.fillRect(entX - s * 9, horizon - H * 0.006 + s * H * 0.012, entW + s * 18, 1.5);
    }
    // 铁门与门柱（教学楼左前方）
    const gateX = W * 0.43;
    b.fillStyle = shade(p2.ground, 16);
    b.fillRect(gateX + W * 0.005, horizon - H * 0.10, W * 0.018, H * 0.10);
    b.fillStyle = 'rgba(20,16,26,0.72)';
    for (let i = 0; i < 6; i++) {
      b.fillRect(gateX - W * 0.035 + i * W * 0.008, horizon - H * 0.088, 2, H * 0.088);
    }
    b.fillRect(gateX - W * 0.036, horizon - H * 0.092, W * 0.052, 4);
    b.fillRect(gateX - W * 0.036, horizon - H * 0.012, W * 0.052, 4);
    // 香樟树与电线杆
    drawCamphor(b, W * 0.455, horizon - H * 0.24, H * 0.34, night ? 'rgba(12,12,26,0.9)' : 'rgba(46,40,52,0.82)',
      night ? 'rgba(150,166,214,0.55)' : null, 0.9, -0.55);
    drawCamphor(b, W * 0.92, horizon - H * 0.20, H * 0.3, night ? 'rgba(12,12,26,0.9)' : 'rgba(42,36,50,0.8)',
      night ? 'rgba(150,166,214,0.5)' : null, -0.9, -0.5);
    b.strokeStyle = night ? 'rgba(22,22,42,0.9)' : 'rgba(34,28,42,0.75)';
    b.lineWidth = 5;
    b.beginPath(); b.moveTo(W * 0.82, horizon - H * 0.30); b.lineTo(W * 0.82, H * 0.03); b.stroke();
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(W * 0.82, H * 0.05); b.lineTo(W * 0.68, H * 0.07);
    b.moveTo(W * 0.82, H * 0.09); b.lineTo(W * 0.70, H * 0.115);
    b.stroke();
    b.beginPath();
    b.moveTo(W * 0.82, H * 0.03);
    b.bezierCurveTo(W * 0.6, H * 0.06, W * 0.42, H * 0.02, W * 0.24, H * 0.06);
    b.stroke();
    // 铁丝网：立杆、斜撑、网格
    const fenceY = horizon - H * 0.075;
    b.strokeStyle = night ? 'rgba(34,36,62,0.85)' : 'rgba(52,46,58,0.72)';
    b.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const fx = W * (0.44 + i * 0.065);
      b.beginPath(); b.moveTo(fx, fenceY); b.lineTo(fx, horizon + H * 0.015); b.stroke();
    }
    b.beginPath(); b.moveTo(W * 0.44, fenceY); b.lineTo(W, fenceY); b.stroke();
    b.beginPath(); b.moveTo(W * 0.44, horizon + H * 0.015); b.lineTo(W, horizon + H * 0.015); b.stroke();
    b.save();
    b.beginPath(); b.rect(W * 0.44, fenceY, W * 0.56, H * 0.09); b.clip();
    b.strokeStyle = night ? 'rgba(50,52,82,0.32)' : 'rgba(70,64,76,0.26)';
    b.lineWidth = 1;
    for (let x = W * 0.42; x < W * 1.02; x += 14) {
      b.beginPath(); b.moveTo(x, fenceY); b.lineTo(x + H * 0.09, fenceY + H * 0.09); b.stroke();
      b.beginPath(); b.moveTo(x, fenceY + H * 0.09); b.lineTo(x + H * 0.09, fenceY); b.stroke();
    }
    b.restore();
    // 跑道与升旗台（见 drawPlayground.ground）
  }
  drawPlayground.ground = (b, p, horizon) => {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const day = state.time === 'day';
    const night = state.time === 'night';
    // 草地 / 内场
    const gg = b.createLinearGradient(0, horizon, 0, H);
    gg.addColorStop(0, day ? '#5f7050' : night ? '#141a22' : '#3a3a32');
    gg.addColorStop(0.5, day ? '#4f6045' : night ? '#101620' : '#303128');
    gg.addColorStop(1, day ? '#42523c' : night ? '#0c111a' : '#262820');
    b.fillStyle = gg;
    b.fillRect(0, horizon, W, H - horizon);
    // 红色塑胶跑道：两层弯道 + 白色分道线
    const trackTop = horizon + H * 0.012;
    const trackBottom = H + H * 0.02;
    b.fillStyle = night ? 'rgba(66,32,40,0.75)' : day ? 'rgba(168,74,62,0.85)' : 'rgba(142,58,56,0.88)';
    b.beginPath();
    b.moveTo(-W * 0.08, trackTop);
    b.bezierCurveTo(W * 0.26, trackTop - H * 0.018, W * 0.7, trackTop + H * 0.02, W * 1.08, trackTop - H * 0.005);
    b.lineTo(W * 1.08, trackBottom);
    b.lineTo(-W * 0.08, trackBottom);
    b.closePath();
    b.fill();
    // 跑道颗粒
    for (let i = 0; i < 180; i++) {
      const tx = Math.random() * W;
      const ty = trackTop + Math.random() * (H - trackTop + H * 0.02);
      b.fillStyle = night ? 'rgba(200,120,110,0.05)' : 'rgba(255,188,150,0.07)';
      b.fillRect(tx, ty, rand(1, 3), rand(0.6, 1.6));
    }
    // 白色分道线
    b.strokeStyle = night ? 'rgba(190,196,214,0.22)' : 'rgba(246,242,226,0.42)';
    b.lineWidth = Math.max(2, W * 0.0016);
    for (let i = 0; i < 4; i++) {
      const y0 = trackTop + H * (0.035 + i * 0.055);
      b.beginPath();
      b.moveTo(-W * 0.08, y0);
      b.bezierCurveTo(W * 0.3, y0 - H * 0.022, W * 0.68, y0 + H * 0.025, W * 1.08, y0 - H * 0.004);
      b.stroke();
    }
    // 升旗台：两级混凝土台基与不锈钢旗杆
    const px = W * 0.565, py = horizon + H * 0.055;
    b.fillStyle = 'rgba(16,12,20,0.30)';
    b.beginPath(); b.ellipse(px, py + H * 0.03, W * 0.095, H * 0.014, 0, 0, 6.3); b.fill();
    const stoneTop = night ? '#3a3c50' : day ? '#c2c2b6' : '#82736f';
    const stoneFront = night ? '#2a2c3e' : day ? '#a8a89a' : '#655a5c';
    const stoneDark = night ? '#20222f' : day ? '#8e8e82' : '#50474c';
    // 底层台阶：顶面 + 立面
    b.fillStyle = stoneFront;
    b.beginPath();
    b.moveTo(px - W * 0.072, py + H * 0.004);
    b.lineTo(px + W * 0.072, py + H * 0.004);
    b.lineTo(px + W * 0.092, py + H * 0.016);
    b.lineTo(px - W * 0.092, py + H * 0.016);
    b.closePath(); b.fill();
    b.fillStyle = stoneDark;
    b.beginPath();
    b.moveTo(px - W * 0.092, py + H * 0.016);
    b.lineTo(px + W * 0.092, py + H * 0.016);
    b.lineTo(px + W * 0.092, py + H * 0.03);
    b.lineTo(px - W * 0.092, py + H * 0.03);
    b.closePath(); b.fill();
    // 上层台体：顶面、立面、压顶高光
    b.fillStyle = stoneFront;
    b.beginPath();
    b.moveTo(px - W * 0.055, py - H * 0.012);
    b.lineTo(px + W * 0.055, py - H * 0.012);
    b.lineTo(px + W * 0.072, py + H * 0.004);
    b.lineTo(px - W * 0.072, py + H * 0.004);
    b.closePath(); b.fill();
    b.fillStyle = stoneDark;
    b.beginPath();
    b.moveTo(px - W * 0.072, py + H * 0.004);
    b.lineTo(px + W * 0.072, py + H * 0.004);
    b.lineTo(px + W * 0.068, py + H * 0.012);
    b.lineTo(px - W * 0.068, py + H * 0.012);
    b.closePath(); b.fill();
    b.fillStyle = stoneTop;
    b.beginPath();
    b.moveTo(px - W * 0.05, py - H * 0.024);
    b.lineTo(px + W * 0.05, py - H * 0.024);
    b.lineTo(px + W * 0.055, py - H * 0.012);
    b.lineTo(px - W * 0.055, py - H * 0.012);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(255,250,236,0.16)';
    b.fillRect(px - W * 0.05, py - H * 0.024, W * 0.1, 1.5);
    // 台阶的分缝
    b.strokeStyle = 'rgba(20,16,22,0.22)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(px - W * 0.02, py + H * 0.016);
    b.lineTo(px - W * 0.02, py + H * 0.03);
    b.moveTo(px + W * 0.025, py + H * 0.016);
    b.lineTo(px + W * 0.025, py + H * 0.03);
    b.stroke();
    // 旗杆：渐变金属柱、底座法兰、绳索
    const poleTop = py - H * 0.315;
    const poleG = b.createLinearGradient(px - 3, 0, px + 3, 0);
    poleG.addColorStop(0, night ? '#5c6484' : '#8c8e88');
    poleG.addColorStop(0.4, night ? '#c8d0e2' : '#f2f0e6');
    poleG.addColorStop(1, night ? '#6a7290' : '#a4a49c');
    b.fillStyle = poleG;
    b.fillRect(px - 2.2, poleTop, 4.4, py - H * 0.022 - poleTop);
    b.fillStyle = night ? 'rgba(76,84,112,0.9)' : 'rgba(170,172,164,0.95)';
    b.beginPath(); b.ellipse(px, py - H * 0.022, W * 0.013, H * 0.007, 0, 0, 6.3); b.fill();
    b.strokeStyle = night ? 'rgba(170,180,208,0.35)' : 'rgba(245,244,236,0.5)';
    b.lineWidth = 1;
    b.beginPath(); b.moveTo(px + 1.4, poleTop + 6); b.lineTo(px + 1.4, py - H * 0.028); b.stroke();
    b.fillStyle = night ? 'rgba(70,76,100,0.85)' : 'rgba(220,220,212,0.85)';
    b.beginPath(); b.arc(px, poleTop, 4, 0, 6.3); b.fill();
    // 旗面：被晚风吹起的红旗，带褶皱明暗
    const flagTop = poleTop + H * 0.012;
    const flagH = H * 0.052, flagW = W * 0.085;
    const flagG = b.createLinearGradient(px, flagTop, px + flagW, flagTop + flagH);
    if (night) {
      flagG.addColorStop(0, 'rgba(150,70,80,0.55)');
      flagG.addColorStop(1, 'rgba(92,54,78,0.4)');
    } else {
      flagG.addColorStop(0, 'rgba(214,66,58,0.88)');
      flagG.addColorStop(0.55, 'rgba(188,50,52,0.8)');
      flagG.addColorStop(1, 'rgba(232,96,74,0.7)');
    }
    b.fillStyle = flagG;
    b.beginPath();
    b.moveTo(px + 1.5, flagTop);
    b.bezierCurveTo(px + flagW * 0.34, flagTop - H * 0.006, px + flagW * 0.72, flagTop + H * 0.004, px + flagW, flagTop + H * 0.016);
    b.bezierCurveTo(px + flagW * 0.76, flagTop + flagH * 0.42, px + flagW * 0.5, flagTop + flagH * 0.72, px + flagW * 0.82, flagTop + flagH);
    b.bezierCurveTo(px + flagW * 0.5, flagTop + flagH * 0.9, px + flagW * 0.22, flagTop + flagH * 0.88, px + 1.5, flagTop + flagH * 0.82);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(120,26,26,0.28)';
    b.lineWidth = 1.2;
    b.beginPath();
    b.moveTo(px + flagW * 0.3, flagTop + flagH * 0.12);
    b.quadraticCurveTo(px + flagW * 0.36, flagTop + flagH * 0.5, px + flagW * 0.28, flagTop + flagH * 0.84);
    b.moveTo(px + flagW * 0.62, flagTop + flagH * 0.13);
    b.quadraticCurveTo(px + flagW * 0.66, flagTop + flagH * 0.5, px + flagW * 0.6, flagTop + flagH * 0.88);
    b.stroke();
    // 跑道上的光影与落叶
    if (night) {
      const lampG = b.createRadialGradient(W * 0.82, horizon + H * 0.02, 0, W * 0.82, horizon + H * 0.02, H * 0.22);
      lampG.addColorStop(0, 'rgba(255,214,150,0.18)');
      lampG.addColorStop(1, 'rgba(255,214,150,0)');
      b.fillStyle = lampG;
      b.fillRect(W * 0.6, horizon, W * 0.4, H - horizon);
    }
    for (let i = 0; i < 26; i++) {
      const lx = Math.random() * W, ly = horizon + Math.random() * (H - horizon) * 0.6;
      b.fillStyle = night ? 'rgba(160,150,130,0.08)' : 'rgba(210,150,82,0.16)';
      b.beginPath(); b.ellipse(lx, ly, rand(2, 5), rand(1, 2), rand(-1, 1), 0, 6.3); b.fill();
    }
  };

  /* ---------- 场景：古建筑 / 后山神社 ---------- */
  function drawAncient(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const night = state.time === 'night';
    // 远山三层
    for (let l = 0; l < 3; l++) {
      b.beginPath(); b.moveTo(-W * 0.05, horizon - H * 0.02);
      for (let i = 0; i <= 44; i++) {
        const x = (i / 44) * W * 1.1 - W * 0.05;
        const ridge = Math.abs(Math.sin(i * 0.21 + l * 1.5)) * H * (0.11 - l * 0.028)
          + Math.abs(Math.sin(i * 0.07 + l)) * H * 0.03;
        b.lineTo(x, horizon - H * 0.03 - ridge);
      }
      b.lineTo(W * 1.05, horizon); b.lineTo(-W * 0.05, horizon); b.closePath();
      b.fillStyle = hexA(shade(p2.skyMid, -30 - l * 10), 0.36 + l * 0.14);
      b.fill();
    }
    // 山脚下的小镇灯火
    if (night) {
      for (let i = 0; i < 34; i++) {
        const tx = rand(W * 0.08, W * 0.92);
        const ty = horizon - rand(H * 0.015, H * 0.055);
        b.fillStyle = `rgba(255,214,150,${rand(0.18, 0.55)})`;
        b.fillRect(tx, ty, rand(1.5, 3), rand(1.5, 3));
      }
    }
    // 高大的杉树：左右夹出参道
    const cedarCol = night ? 'rgba(9,8,20,0.96)' : 'rgba(34,26,44,0.9)';
    const cedarRim = night ? 'rgba(136,152,198,0.5)' : null;
    drawCedar(b, W * 0.035, -H * 0.03, H * 0.68, cedarCol, 1.25, cedarRim, 1);
    drawCedar(b, W * 0.135, -H * 0.03, H * 0.58, cedarCol, 0.9, cedarRim, 1);
    drawCedar(b, W * 0.955, -H * 0.03, H * 0.68, cedarCol, 1.15, cedarRim, -1);
    drawCedar(b, W * 0.865, -H * 0.03, H * 0.56, cedarCol, 0.85, cedarRim, -1);
    // 顶角垂下的杉枝：把天空框成一隙
    b.save();
    b.fillStyle = night ? 'rgba(7,7,18,0.72)' : 'rgba(26,20,38,0.6)';
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      const cx = side < 0 ? rand(-W * 0.02, W * 0.22) : rand(W * 0.78, W * 1.02);
      const cy = rand(-H * 0.05, H * 0.075);
      const span = rand(W * 0.02, W * 0.06);
      for (let k = 0; k < 4; k++) {
        b.beginPath();
        b.ellipse(cx + rand(-span, span) * 0.7, cy + rand(-span * 0.4, span * 0.5),
          span * rand(0.5, 1.1), span * rand(0.18, 0.4), rand(-0.5, 0.2), 0, 6.3);
        b.fill();
      }
    }
    b.restore();

    // 拜殿：木构、切妻顶、注连绳、风铃、赛钱箱
    const hallW = W * 0.34, hallX = W * 0.33, hallTop = horizon - H * 0.285;
    b.fillStyle = night ? 'rgba(24,18,30,0.92)' : 'rgba(56,40,48,0.9)';
    b.fillRect(hallX, hallTop, hallW, H * 0.285);
    // 木板墙与立柱
    b.fillStyle = night ? 'rgba(42,32,40,0.85)' : 'rgba(92,68,62,0.75)';
    for (let i = 0; i < 5; i++) {
      b.fillRect(hallX + hallW * (0.06 + i * 0.22), hallTop, W * 0.012, H * 0.285);
    }
    b.strokeStyle = 'rgba(12,8,12,0.35)';
    b.lineWidth = 1.2;
    for (let i = 1; i < 8; i++) {
      const yy = hallTop + (H * 0.285 * i) / 8;
      b.beginPath(); b.moveTo(hallX, yy); b.lineTo(hallX + hallW, yy); b.stroke();
    }
    // 拜殿正面：格子门与暖光
    const doorGlow = night ? 0.5 : 0.18;
    for (let i = 0; i < 3; i++) {
      const dx = hallX + hallW * (0.18 + i * 0.22);
      const dw = hallW * 0.16, dy = hallTop + H * 0.08, dh = H * 0.15;
      const dg = b.createLinearGradient(0, dy, 0, dy + dh);
      dg.addColorStop(0, `rgba(255,218,164,${doorGlow})`);
      dg.addColorStop(0.55, `rgba(244,196,138,${doorGlow * 0.82})`);
      dg.addColorStop(1, `rgba(196,142,96,${doorGlow * 0.62})`);
      b.fillStyle = dg;
      b.fillRect(dx, dy, dw, dh);
      // 半透明的和纸纹理
      b.fillStyle = 'rgba(255,246,222,0.05)';
      for (let k = 0; k < 7; k++) {
        b.fillRect(dx + rand(0, dw * 0.9), dy + rand(0, dh * 0.9), rand(1, 4), rand(2, 6));
      }
      b.strokeStyle = 'rgba(16,10,14,0.55)';
      b.lineWidth = 1.4;
      for (let k = 1; k < 4; k++) {
        b.beginPath();
        b.moveTo(dx + (dw * k) / 4, dy);
        b.lineTo(dx + (dw * k) / 4, dy + dh);
        b.stroke();
      }
      b.lineWidth = 1;
      for (let k = 1; k < 3; k++) {
        b.beginPath();
        b.moveTo(dx, dy + (dh * k) / 3);
        b.lineTo(dx + dw, dy + (dh * k) / 3);
        b.stroke();
      }
    }
    // 门上的栏间：檐下一排细木格
    b.fillStyle = night ? 'rgba(30,22,28,0.9)' : 'rgba(64,46,46,0.85)';
    b.fillRect(hallX + hallW * 0.14, hallTop + H * 0.035, hallW * 0.72, H * 0.034);
    b.strokeStyle = night ? 'rgba(150,120,96,0.22)' : 'rgba(196,158,112,0.3)';
    b.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const bx = hallX + hallW * (0.15 + i * 0.033);
      b.beginPath();
      b.moveTo(bx, hallTop + H * 0.038);
      b.lineTo(bx, hallTop + H * 0.066);
      b.stroke();
    }
    // 屋顶：厚重的切妻顶与瓦垄
    shrineRoof(b, hallX - W * 0.035, hallTop - H * 0.045, hallW + W * 0.07, H * 0.085, night ? '#241c2e' : '#43303a', p2);
    // 屋顶上的苔与高光
    b.fillStyle = 'rgba(120,150,120,0.12)';
    for (let i = 0; i < 10; i++) {
      b.beginPath();
      b.ellipse(rand(hallX, hallX + hallW), hallTop - rand(H * 0.01, H * 0.06), rand(3, 9), rand(1, 3), 0, 0, 6.3);
      b.fill();
    }
    // 檐下深影：把屋顶的重量压到木构上
    const eaveSh = b.createLinearGradient(0, hallTop - H * 0.008, 0, hallTop + H * 0.05);
    eaveSh.addColorStop(0, 'rgba(6,4,8,0.55)');
    eaveSh.addColorStop(1, 'rgba(6,4,8,0)');
    b.fillStyle = eaveSh;
    b.fillRect(hallX - W * 0.005, hallTop - H * 0.008, hallW + W * 0.01, H * 0.058);
    // 墙脚接地处的湿影
    const footSh = b.createLinearGradient(0, horizon - H * 0.07, 0, horizon);
    footSh.addColorStop(0, 'rgba(6,4,8,0)');
    footSh.addColorStop(1, night ? 'rgba(4,3,8,0.55)' : 'rgba(18,10,14,0.38)');
    b.fillStyle = footSh;
    b.fillRect(hallX, horizon - H * 0.07, hallW, H * 0.07);
    // 注连绳与纸垂
    const ropeY = hallTop + H * 0.022;
    b.strokeStyle = 'rgba(196,176,138,0.6)';
    b.lineWidth = Math.max(3, H * 0.008);
    b.beginPath();
    b.moveTo(hallX + hallW * 0.1, ropeY);
    b.quadraticCurveTo(hallX + hallW * 0.5, ropeY + H * 0.022, hallX + hallW * 0.9, ropeY);
    b.stroke();
    for (let i = 0; i < 5; i++) {
      const sx = hallX + hallW * (0.16 + i * 0.17);
      const sy = ropeY + Math.sin(((i + 0.5) / 5) * Math.PI) * H * 0.015;
      b.fillStyle = 'rgba(240,236,222,0.78)';
      b.beginPath();
      b.moveTo(sx - 3, sy);
      b.lineTo(sx + 3, sy);
      b.lineTo(sx + 2, sy + H * 0.02);
      b.lineTo(sx, sy + H * 0.012);
      b.lineTo(sx - 2, sy + H * 0.02);
      b.closePath(); b.fill();
    }
    // 檐下风铃
    const chX = hallX + hallW * 0.78, chY = hallTop - H * 0.005;
    b.strokeStyle = 'rgba(220,216,200,0.45)';
    b.lineWidth = 1;
    b.beginPath(); b.moveTo(chX, chY); b.lineTo(chX, chY + H * 0.035); b.stroke();
    b.fillStyle = 'rgba(220,228,232,0.55)';
    b.beginPath(); b.arc(chX, chY + H * 0.045, H * 0.010, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(238,234,220,0.7)';
    b.fillRect(chX - H * 0.004, chY + H * 0.055, H * 0.008, H * 0.032);
    // 赛钱箱与石阶前庭
    b.fillStyle = night ? 'rgba(36,26,30,0.95)' : 'rgba(78,54,48,0.9)';
    b.fillRect(hallX + hallW * 0.34, horizon - H * 0.055, hallW * 0.32, H * 0.055);
    b.strokeStyle = 'rgba(200,160,110,0.22)';
    b.lineWidth = 1.2;
    b.strokeRect(hallX + hallW * 0.35, horizon - H * 0.05, hallW * 0.30, H * 0.045);
    for (let i = 0; i < 6; i++) {
      b.beginPath();
      b.moveTo(hallX + hallW * (0.37 + i * 0.045), horizon - H * 0.05);
      b.lineTo(hallX + hallW * (0.37 + i * 0.045), horizon - H * 0.008);
      b.stroke();
    }

    // 鸟居：立在拜殿之前的参道上，朱红、斑驳、石基
    drawTorii(b, W * 0.5, horizon, W * 0.56, H * 0.34, p2, night);

    // 黄昏：杉树间漏下的金色光柱
    if (state.time === 'dusk') {
      b.save();
      b.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const x0 = W * (0.58 + i * 0.09);
        const lg = b.createLinearGradient(x0, 0, x0 - W * 0.2, horizon);
        lg.addColorStop(0, 'rgba(255,198,120,0.12)');
        lg.addColorStop(1, 'rgba(255,180,100,0)');
        b.fillStyle = lg;
        b.beginPath();
        b.moveTo(x0, 0);
        b.lineTo(x0 + W * 0.03, 0);
        b.lineTo(x0 - W * 0.16, horizon);
        b.lineTo(x0 - W * 0.23, horizon);
        b.closePath(); b.fill();
      }
      b.restore();
    }
    // 夜晚：檐下与石灯笼的暖光
    if (night) {
      for (const lx of [hallX + hallW * 0.18, hallX + hallW * 0.82]) {
        const lg = b.createRadialGradient(lx, hallTop + H * 0.07, 0, lx, hallTop + H * 0.07, H * 0.14);
        lg.addColorStop(0, 'rgba(255,210,146,0.26)');
        lg.addColorStop(1, 'rgba(255,200,130,0)');
        b.fillStyle = lg;
        b.beginPath(); b.arc(lx, hallTop + H * 0.07, H * 0.14, 0, 6.3); b.fill();
      }
    }
  }
  drawAncient.ground = (b, p, horizon) => {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const night = state.time === 'night';
    const dusk = state.time === 'dusk';
    // 参道两侧的碎石与苔地
    const mossG = b.createLinearGradient(0, horizon, 0, H);
    mossG.addColorStop(0, night ? '#101720' : dusk ? '#3c3a2e' : '#46513c');
    mossG.addColorStop(0.55, night ? '#0c1118' : dusk ? '#2f3228' : '#3b4634');
    mossG.addColorStop(1, night ? '#080c12' : dusk ? '#252a22' : '#2f3a2c');
    b.fillStyle = mossG;
    b.fillRect(0, horizon, W, H - horizon);
    // 苔藓斑块
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * W, y = horizon + Math.random() * (H - horizon);
      b.fillStyle = night ? 'rgba(40,70,54,0.10)' : 'rgba(86,112,66,0.14)';
      b.beginPath();
      b.ellipse(x, y, rand(8, 42), rand(3, 12), rand(-0.4, 0.4), 0, 6.3);
      b.fill();
    }
    // 石阶：从山脚一路铺到拜殿
    const steps = 13;
    const topW = W * 0.245, botW = W * 0.64;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const y0 = horizon + (H * 0.94 - horizon) * (i / steps);
      const y1 = horizon + (H * 0.94 - horizon) * ((i + 1) / steps);
      const w0 = topW + (botW - topW) * t;
      const w1 = topW + (botW - topW) * ((i + 1) / steps);
      // 踏面
      const stone = b.createLinearGradient(0, y0, 0, y1);
      stone.addColorStop(0, night ? '#2f3440' : dusk ? '#6a6054' : '#7c7a6c');
      stone.addColorStop(0.7, night ? '#242833' : dusk ? '#544c44' : '#625f54');
      stone.addColorStop(1, night ? '#1c202a' : dusk ? '#443e38' : '#4e4c44');
      b.fillStyle = stone;
      b.beginPath();
      b.moveTo(W * 0.5 - w0 / 2, y0);
      b.lineTo(W * 0.5 + w0 / 2, y0);
      b.lineTo(W * 0.5 + w1 / 2, y1);
      b.lineTo(W * 0.5 - w1 / 2, y1);
      b.closePath(); b.fill();
      // 前缘高光与苔
      b.fillStyle = night ? 'rgba(170,186,214,0.10)' : 'rgba(255,240,208,0.14)';
      b.fillRect(W * 0.5 - w1 / 2, y1 - 2, w1, 2);
      if (i % 2 === 0) {
        b.fillStyle = night ? 'rgba(52,80,62,0.14)' : 'rgba(92,118,70,0.18)';
        b.beginPath();
        b.ellipse(W * 0.5 - w1 * 0.34, y0 + (y1 - y0) * 0.4, w1 * 0.10, (y1 - y0) * 0.32, 0, 0, 6.3);
        b.fill();
      }
    }
    // 石阶两侧的石垣
    for (const side of [-1, 1]) {
      const edgeTop = W * 0.5 + side * topW / 2;
      const edgeBot = W * 0.5 + side * botW / 2;
      b.fillStyle = night ? 'rgba(26,28,38,0.9)' : dusk ? 'rgba(66,58,52,0.9)' : 'rgba(92,88,76,0.9)';
      b.beginPath();
      b.moveTo(edgeTop, horizon);
      b.lineTo(edgeBot, H * 0.94);
      b.lineTo(edgeBot + side * W * 0.06, H * 0.94);
      b.lineTo(edgeTop + side * W * 0.035, horizon);
      b.closePath(); b.fill();
      // 石块接缝
      b.strokeStyle = 'rgba(10,8,10,0.3)';
      b.lineWidth = 1.2;
      for (let i = 1; i < 9; i++) {
        const t = i / 9;
        b.beginPath();
        b.moveTo(edgeTop + side * W * 0.035 * t, horizon + (H * 0.94 - horizon) * t);
        b.lineTo(edgeBot + side * W * 0.06 * t, horizon + (H * 0.94 - horizon) * t);
        b.stroke();
      }
    }
    // 参道两侧的蕨类与夏草
    for (let i = 0; i < 30; i++) {
      const side = i % 2 ? 1 : -1;
      const gx = W * 0.5 + side * rand(W * 0.20, W * 0.46);
      const gy = horizon + rand(0.02, 0.30) * H;
      const blades = 4 + Math.floor(rand(0, 5));
      const tall = H * rand(0.028, 0.062) * (0.7 + (gy - horizon) / (H * 0.3));
      const col = night ? `rgba(44,78,58,${rand(0.22, 0.5)})` : `rgba(74,104,60,${rand(0.3, 0.6)})`;
      b.strokeStyle = col;
      b.lineWidth = rand(0.9, 1.7);
      for (let k = 0; k < blades; k++) {
        const spread = (k - (blades - 1) / 2) / Math.max(1, blades / 2);
        const bh = tall * rand(0.6, 1.05);
        b.beginPath();
        b.moveTo(gx + spread * 3, gy);
        b.quadraticCurveTo(gx + spread * W * 0.008, gy - bh * 0.6, gx + spread * W * 0.016 + rand(-2, 2), gy - bh);
        b.stroke();
        if (k % 3 === 0) {
          b.fillStyle = col;
          b.beginPath();
          b.ellipse(gx + spread * W * 0.016 + rand(-2, 2), gy - bh, 1.4, 3.4, spread * 0.4, 0, 6.3);
          b.fill();
        }
      }
      // 偶尔一丛宽叶杂草，打散整齐的细线
      if (i % 5 === 1) {
        b.fillStyle = night ? 'rgba(38,66,50,0.34)' : 'rgba(66,94,54,0.42)';
        for (let k = 0; k < 3; k++) {
          b.beginPath();
          b.ellipse(gx + rand(-8, 8), gy - tall * rand(0.15, 0.5), rand(3, 7), rand(1.5, 3), rand(-0.9, 0.9), 0, 6.3);
          b.fill();
        }
      }
    }
    // 石灯笼
    drawStoneLantern(b, W * 0.235, horizon + H * 0.045, H * 0.14, p2, night);
    drawStoneLantern(b, W * 0.765, horizon + H * 0.045, H * 0.14, p2, night);
    // 石阶上的湿光与落叶
    if (night) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      const moonGlow = b.createLinearGradient(0, horizon, 0, H);
      moonGlow.addColorStop(0, 'rgba(170,190,235,0.10)');
      moonGlow.addColorStop(1, 'rgba(150,170,220,0)');
      b.fillStyle = moonGlow;
      b.beginPath();
      b.moveTo(W * 0.5 - topW / 2, horizon);
      b.lineTo(W * 0.5 + topW / 2, horizon);
      b.lineTo(W * 0.5 + botW / 2, H * 0.94);
      b.lineTo(W * 0.5 - botW / 2, H * 0.94);
      b.closePath(); b.fill();
      b.restore();
    }
    for (let i = 0; i < 18; i++) {
      const lx = W * 0.5 + rand(-0.3, 0.3) * W;
      const ly = horizon + rand(0.02, 0.3) * H;
      b.fillStyle = night ? 'rgba(160,120,90,0.12)' : 'rgba(176,96,54,0.22)';
      b.beginPath();
      b.ellipse(lx, ly, rand(2, 5), rand(1, 2), rand(-1, 1), 0, 6.3);
      b.fill();
    }
  };

  /* ---------- 场景：宫苑 ---------- */
  // 临水三层木阁：丹青阁
  function drawPalacePavilion(b, cx, baseY, pw, ph, p2) {
    const fire = state.time === 'fire';
    const night = state.time === 'night';
    const woodDark = fire ? '#2a1614' : night ? '#221a22' : '#4a3428';
    const woodMid = fire ? '#4a2a22' : night ? '#372830' : '#6b4c34';
    const woodLit = fire ? '#7a4030' : night ? '#5a4042' : '#9a744d';
    const glaze = fire ? '#3c2022' : night ? '#1e2430' : '#3c4c4c';
    const paperGlow = fire ? 0.55 : night ? 0.42 : 0.22;
    const p1Top = baseY - ph * 0.30;
    const p2Top = baseY - ph * 0.62;
    const p3Top = baseY - ph * 0.86;

    // 石台基
    b.fillStyle = fire ? 'rgba(64,44,40,0.95)' : night ? 'rgba(44,44,56,0.95)' : state.time === 'dusk' ? '#a98f79' : '#c9c2ae';
    b.beginPath();
    b.moveTo(cx - pw * 0.72, baseY);
    b.lineTo(cx + pw * 0.72, baseY);
    b.lineTo(cx + pw * 0.66, baseY - ph * 0.045);
    b.lineTo(cx - pw * 0.66, baseY - ph * 0.045);
    b.closePath(); b.fill();
    b.fillStyle = fire ? 'rgba(96,60,46,0.9)' : night ? 'rgba(62,60,74,0.9)' : state.time === 'dusk' ? '#c4a286' : '#dad3c0';
    b.fillRect(cx - pw * 0.66, baseY - ph * 0.052, pw * 1.32, ph * 0.012);
    b.fillStyle = 'rgba(255,248,232,0.14)';
    b.fillRect(cx - pw * 0.66, baseY - ph * 0.052, pw * 1.32, 1.5);

    // 三层楼身：由高到低绘制
    // 三层：开敞的文昌阁
    const l3w = pw * 0.58, l3y = p3Top;
    b.fillStyle = woodDark;
    b.fillRect(cx - l3w / 2, l3y, l3w, p2Top - l3y);
    b.fillStyle = hexA('#ffdca0', paperGlow * 0.8);
    b.fillRect(cx - l3w * 0.42, l3y + ph * 0.018, l3w * 0.84, (p2Top - l3y) * 0.62);
    b.fillStyle = woodMid;
    for (let i = 0; i < 5; i++) {
      b.fillRect(cx - l3w * 0.46 + (l3w * 0.92 * i) / 4 - 1.5, l3y, 3, p2Top - l3y);
    }
    // 三层栏杆
    b.fillStyle = woodLit;
    b.fillRect(cx - l3w * 0.56, p2Top - ph * 0.02, l3w * 1.12, 3);
    for (let i = 0; i < 10; i++) {
      b.fillRect(cx - l3w * 0.54 + (l3w * 1.08 * i) / 9, p2Top - ph * 0.02, 2, ph * 0.028);
    }
    // 三层屋顶
    palaceRoof(b, cx - pw * 0.46, p3Top - ph * 0.145, pw * 0.92, ph * 0.16, glaze, p2);
    // 宝顶
    b.fillStyle = fire ? '#9a5a34' : night ? '#7a7080' : '#d8b66a';
    b.beginPath(); b.arc(cx, p3Top - ph * 0.16, ph * 0.016, 0, 6.3); b.fill();
    b.fillRect(cx - 1.5, p3Top - ph * 0.19, 3, ph * 0.035);

    // 二层：雕花木窗与回廊
    const l2w = pw * 0.8, l2y = p2Top;
    b.fillStyle = woodDark;
    b.fillRect(cx - l2w / 2, l2y, l2w, p1Top - ph * 0.09 - l2y);
    const bw2 = l2w * 0.15;
    for (let i = 0; i < 5; i++) {
      const bx = cx - l2w * 0.44 + ((l2w * 0.88 - bw2) * i) / 4;
      const bw = bw2;
      // 窗纸暖光
      b.fillStyle = fire ? 'rgba(255,168,102,0.5)' : hexA('#ffd79a', paperGlow);
      b.fillRect(bx, l2y + ph * 0.02, bw, (p1Top - ph * 0.11 - l2y));
      // 冰裂纹窗棂
      b.strokeStyle = woodMid;
      b.lineWidth = 1;
      b.strokeRect(bx, l2y + ph * 0.02, bw, (p1Top - ph * 0.11 - l2y));
      for (let k = 1; k < 3; k++) {
        b.beginPath();
        b.moveTo(bx + (bw * k) / 3, l2y + ph * 0.02);
        b.lineTo(bx + (bw * k) / 3, p1Top - ph * 0.11);
        b.stroke();
      }
      b.beginPath();
      b.moveTo(bx, l2y + ph * 0.02 + (p1Top - ph * 0.11 - l2y) * 0.5);
      b.lineTo(bx + bw, l2y + ph * 0.02 + (p1Top - ph * 0.11 - l2y) * 0.5);
      b.stroke();
      // 斜向冰纹
      b.beginPath();
      b.moveTo(bx, l2y + ph * 0.05);
      b.lineTo(bx + bw, l2y + ph * 0.09);
      b.moveTo(bx + bw, l2y + ph * 0.04);
      b.lineTo(bx, l2y + ph * 0.1);
      b.stroke();
    }
    // 二层回廊栏杆
    b.fillStyle = woodLit;
    b.fillRect(cx - l2w * 0.56, p1Top - ph * 0.115, l2w * 1.12, 2.5);
    for (let i = 0; i < 14; i++) {
      b.fillRect(cx - l2w * 0.54 + (l2w * 1.08 * i) / 13, p1Top - ph * 0.113, 2, ph * 0.03);
    }
    // 二层屋顶
    palaceRoof(b, cx - pw * 0.55, p2Top - ph * 0.15, pw * 1.1, ph * 0.17, glaze, p2);
    // 匾额：丹青阁
    const plaqueY = p2Top - ph * 0.075;
    b.fillStyle = fire ? '#241010' : night ? '#16121a' : '#2c211a';
    b.fillRect(cx - pw * 0.13, plaqueY, pw * 0.26, ph * 0.045);
    b.strokeStyle = hexA('#e8c47a', 0.55);
    b.lineWidth = 1.4;
    b.strokeRect(cx - pw * 0.13, plaqueY, pw * 0.26, ph * 0.045);
    b.fillStyle = hexA('#f0cf86', fire ? 0.7 : 0.85);
    b.font = `600 ${Math.max(10, ph * 0.032)}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
    b.textAlign = 'center';
    b.textBaseline = 'middle';
    b.fillText('丹 青 阁', cx, plaqueY + ph * 0.024);
    b.textBaseline = 'alphabetic';
    b.textAlign = 'left';

    // 一层：格扇门与立柱
    const l1w = pw, l1y = p1Top;
    b.fillStyle = woodDark;
    b.fillRect(cx - l1w / 2, l1y, l1w, baseY - ph * 0.045 - l1y);
    // 格扇门
    for (let i = 0; i < 6; i++) {
      const dx = cx - l1w * 0.42 + (l1w * 0.84 * i) / 5;
      const dw = l1w * 0.1;
      b.fillStyle = fire ? 'rgba(255,156,88,0.48)' : hexA('#ffd9a0', paperGlow * 0.9);
      b.fillRect(dx, l1y + ph * 0.03, dw, baseY - ph * 0.06 - l1y);
      b.strokeStyle = woodMid;
      b.lineWidth = 1.2;
      b.strokeRect(dx, l1y + ph * 0.03, dw, baseY - ph * 0.06 - l1y);
      for (let k = 1; k < 3; k++) {
        b.beginPath();
        b.moveTo(dx + (dw * k) / 3, l1y + ph * 0.03);
        b.lineTo(dx + (dw * k) / 3, baseY - ph * 0.06);
        b.stroke();
      }
      for (let k = 1; k < 5; k++) {
        const yy = l1y + ph * 0.03 + ((baseY - ph * 0.06 - l1y) * k) / 5;
        b.beginPath(); b.moveTo(dx, yy); b.lineTo(dx + dw, yy); b.stroke();
      }
    }
    // 立柱与彩画额枋
    b.fillStyle = woodLit;
    for (let i = 0; i < 7; i++) {
      const px0 = cx - l1w * 0.48 + (l1w * 0.96 * i) / 6;
      b.fillRect(px0 - 2.5, l1y, 5, baseY - ph * 0.045 - l1y);
    }
    b.fillStyle = fire ? '#5a2a24' : night ? '#2c2434' : '#7a4034';
    b.fillRect(cx - l1w * 0.5, l1y + ph * 0.01, l1w, ph * 0.022);
    for (let i = 0; i < 10; i++) {
      b.fillStyle = i % 2 ? hexA('#5c8a86', 0.5) : hexA('#c8a256', 0.45);
      b.fillRect(cx - l1w * 0.47 + (l1w * 0.94 * i) / 9, l1y + ph * 0.012, l1w * 0.04, ph * 0.018);
    }
    // 一层屋檐
    palaceRoof(b, cx - pw * 0.62, p1Top - ph * 0.15, pw * 1.24, ph * 0.18, glaze, p2);
    // 檐下灯笼
    for (const side of [-1, 1]) {
      const lx = cx + side * pw * 0.55, ly = p1Top - ph * 0.035;
      b.strokeStyle = hexA('#ffcf90', 0.3);
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(lx, p1Top - ph * 0.12); b.lineTo(lx, ly - ph * 0.018); b.stroke();
      b.fillStyle = fire ? 'rgba(255,120,60,0.9)' : hexA('#ffb878', 0.85);
      b.beginPath(); b.ellipse(lx, ly, ph * 0.013, ph * 0.02, 0, 0, 6.3); b.fill();
      b.fillStyle = 'rgba(255,230,180,0.55)';
      b.fillRect(lx - 1, ly + ph * 0.018, 2, ph * 0.012);
    }
    // 屋檐下缘的暖光
    if (!dayTime()) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      const eg = b.createLinearGradient(0, p1Top - ph * 0.04, 0, p1Top + ph * 0.06);
      eg.addColorStop(0, hexA(p2.glow, 0.10));
      eg.addColorStop(1, hexA(p2.glow, 0));
      b.fillStyle = eg;
      b.fillRect(cx - pw * 0.66, p1Top - ph * 0.04, pw * 1.32, ph * 0.1);
      b.restore();
    }
  }
  function dayTime() { return state.time === 'day'; }

  function drawPalace(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const fire = state.time === 'fire';
    const dusk = state.time === 'dusk';
    // 远山
    for (let l = 0; l < 2; l++) {
      b.beginPath(); b.moveTo(-W * 0.05, horizon);
      for (let i = 0; i <= 44; i++) {
        const x = (i / 44) * W;
        b.lineTo(x, horizon - (0.03 + l * 0.022) * H
          - Math.abs(Math.sin(i * 0.23 + l * 1.7)) * H * 0.055);
      }
      b.lineTo(W * 1.05, horizon); b.closePath();
      b.fillStyle = hexA(shade(p2.skyMid, -58), 0.5 - l * 0.14); b.fill();
    }
    // 远处宫墙与连片屋顶
    const wallY = horizon - H * 0.075;
    b.fillStyle = fire ? 'rgba(36,14,16,0.92)' : state.time === 'night' ? 'rgba(18,16,30,0.92)' : 'rgba(96,90,82,0.5)';
    b.fillRect(0, wallY, W, H * 0.075);
    for (let i = 0; i < 9; i++) {
      const rx = (i / 9) * W + W * 0.02;
      palaceRoof(b, rx, wallY - H * 0.022, W * 0.09, H * 0.03,
        fire ? '#2e1616' : state.time === 'night' ? '#1c202a' : '#5c5e58', p2);
    }
    // 角楼
    for (const side of [-1, 1]) {
      const tx = W * (0.5 + side * 0.36);
      b.fillStyle = fire ? '#2a1416' : state.time === 'night' ? '#1a1826' : '#6c6458';
      b.fillRect(tx - W * 0.022, wallY - H * 0.055, W * 0.044, H * 0.055);
      palaceRoof(b, tx - W * 0.035, wallY - H * 0.095, W * 0.07, H * 0.045,
        fire ? '#301818' : state.time === 'night' ? '#20242e' : '#585c56', p2);
    }
    // 丹青阁
    drawPalacePavilion(b, W * 0.5, horizon, W * 0.30, H * 0.44, p2);
    // 殿前垂柳：左右各两株，枝条垂进画面
    const willowCol = fire ? 'rgba(32,14,14,0.94)' : state.time === 'night' ? 'rgba(10,14,22,0.94)' : state.time === 'dusk' ? 'rgba(54,38,46,0.92)' : 'rgba(66,82,60,0.92)';
    drawWillow(b, W * 0.075, -H * 0.07, H * 0.72, willowCol);
    drawWillow(b, W * 0.925, -H * 0.07, H * 0.72, willowCol);
    // 黄昏：明黄仪仗与玄甲禁军
    if (dusk) {
      const guardY = horizon - H * 0.012;
      for (let i = 0; i < 9; i++) {
        const gx = W * (0.30 + i * 0.05);
        const gh = H * (0.038 + (i % 2) * 0.004);
        // 甲士
        b.fillStyle = 'rgba(28,22,30,0.9)';
        b.beginPath(); b.ellipse(gx, guardY - gh * 0.82, gh * 0.13, gh * 0.14, 0, 0, 6.3); b.fill();
        b.fillRect(gx - gh * 0.14, guardY - gh * 0.72, gh * 0.28, gh * 0.55);
        b.fillRect(gx - gh * 0.12, guardY - gh * 0.2, gh * 0.09, gh * 0.2);
        b.fillRect(gx + gh * 0.04, guardY - gh * 0.2, gh * 0.09, gh * 0.2);
        // 长戟
        b.strokeStyle = 'rgba(30,24,28,0.85)';
        b.lineWidth = 1.2;
        b.beginPath();
        b.moveTo(gx + gh * 0.18, guardY);
        b.lineTo(gx + gh * 0.18, guardY - gh * 1.25);
        b.stroke();
        b.fillStyle = 'rgba(200,206,214,0.55)';
        b.beginPath();
        b.moveTo(gx + gh * 0.18, guardY - gh * 1.25);
        b.lineTo(gx + gh * 0.22, guardY - gh * 1.12);
        b.lineTo(gx + gh * 0.14, guardY - gh * 1.12);
        b.closePath(); b.fill();
        // 明黄幡旗
        if (i % 3 === 1) {
          b.strokeStyle = 'rgba(40,30,24,0.8)';
          b.beginPath();
          b.moveTo(gx - gh * 0.34, guardY);
          b.lineTo(gx - gh * 0.34, guardY - gh * 1.5);
          b.stroke();
          const fg2 = b.createLinearGradient(0, guardY - gh * 1.5, 0, guardY - gh * 0.9);
          fg2.addColorStop(0, 'rgba(238,190,74,0.85)');
          fg2.addColorStop(1, 'rgba(206,146,50,0.7)');
          b.fillStyle = fg2;
          b.beginPath();
          b.moveTo(gx - gh * 0.34, guardY - gh * 1.5);
          b.lineTo(gx + gh * 0.12, guardY - gh * 1.46);
          b.lineTo(gx + gh * 0.04, guardY - gh * 0.92);
          b.lineTo(gx - gh * 0.34, guardY - gh * 0.98);
          b.closePath(); b.fill();
        }
      }
    }
    // 火夜：玄武门方向的火光、浓烟与燃烧的宫门
    if (fire) {
      const gx = W * 0.16, gtop = horizon - H * 0.17;
      // 燃烧的宫门：门楼、门洞、烈焰
      b.fillStyle = 'rgba(24,10,12,0.96)';
      b.fillRect(gx - W * 0.055, gtop, W * 0.11, horizon - gtop);
      b.fillRect(gx - W * 0.065, gtop - H * 0.012, W * 0.13, H * 0.02);
      // 门洞火光：拱形门洞，内壁被烤成暗红
      const holeTop = horizon - H * 0.135;
      const holeG = b.createLinearGradient(0, holeTop - H * 0.02, 0, horizon);
      holeG.addColorStop(0, 'rgba(255,206,128,0.72)');
      holeG.addColorStop(0.4, 'rgba(255,138,56,0.9)');
      holeG.addColorStop(1, 'rgba(172,48,22,0.95)');
      b.fillStyle = holeG;
      b.beginPath();
      b.moveTo(gx - W * 0.036, horizon);
      b.lineTo(gx - W * 0.036, holeTop + H * 0.018);
      b.quadraticCurveTo(gx, holeTop - H * 0.018, gx + W * 0.036, holeTop + H * 0.018);
      b.lineTo(gx + W * 0.036, horizon);
      b.closePath();
      b.fill();
      // 门柱与门楣
      b.fillStyle = 'rgba(18,8,8,0.98)';
      b.fillRect(gx - W * 0.04, horizon - H * 0.138, W * 0.008, H * 0.138);
      b.fillRect(gx + W * 0.032, horizon - H * 0.138, W * 0.008, H * 0.138);
      b.fillRect(gx - W * 0.043, horizon - H * 0.148, W * 0.086, H * 0.012);
      // 门楼屋顶：被火舌舔舐的歇山顶，边缘透出橙红
      const roofY = gtop - H * 0.006;
      b.fillStyle = 'rgba(17,7,9,0.98)';
      b.beginPath();
      b.moveTo(gx - W * 0.088, roofY + H * 0.022);
      b.quadraticCurveTo(gx - W * 0.07, roofY - H * 0.002, gx - W * 0.03, roofY - H * 0.014);
      b.lineTo(gx + W * 0.03, roofY - H * 0.014);
      b.quadraticCurveTo(gx + W * 0.07, roofY - H * 0.002, gx + W * 0.088, roofY + H * 0.022);
      b.quadraticCurveTo(gx + W * 0.06, roofY + H * 0.012, gx, roofY + H * 0.014);
      b.quadraticCurveTo(gx - W * 0.06, roofY + H * 0.012, gx - W * 0.088, roofY + H * 0.022);
      b.closePath(); b.fill();
      // 屋脊与瓦口映出的火光
      b.strokeStyle = 'rgba(255,132,64,0.34)';
      b.lineWidth = 1.4;
      b.beginPath();
      b.moveTo(gx - W * 0.084, roofY + H * 0.018);
      b.quadraticCurveTo(gx - W * 0.065, roofY - H * 0.004, gx - W * 0.03, roofY - H * 0.015);
      b.lineTo(gx + W * 0.03, roofY - H * 0.015);
      b.stroke();
      // 火焰舌：外焰、内焰与白热芯分层，边缘带不规则摆动
      b.save();
      b.globalCompositeOperation = 'lighter';
      for (let layer = 0; layer < 3; layer++) {
        const n = layer === 0 ? 8 : layer === 1 ? 7 : 4;
        const wide = layer === 0 ? 1.0 : layer === 1 ? 0.58 : 0.28;
        const tall = layer === 0 ? 1.0 : layer === 1 ? 0.74 : 0.44;
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0.5 : i / (n - 1);
          const fx = gx + (t - 0.5) * W * (0.075 - layer * 0.014);
          const flick = rand(-1, 1);
          const fh = H * (0.075 + Math.sin(t * Math.PI) * 0.105 + rand(0, 0.045)) * tall;
          const halfW = W * (0.009 + rand(0, 0.006)) * wide;
          const sway = W * rand(0.004, 0.012) * (t < 0.5 ? -1 : 1);
          const fg2 = b.createLinearGradient(0, horizon - fh, 0, horizon);
          if (layer === 2) {
            fg2.addColorStop(0, 'rgba(255,250,214,0.55)');
            fg2.addColorStop(0.55, 'rgba(255,218,148,0.30)');
            fg2.addColorStop(1, 'rgba(255,170,80,0)');
          } else if (layer === 1) {
            fg2.addColorStop(0, 'rgba(255,206,112,0.58)');
            fg2.addColorStop(0.5, 'rgba(255,148,58,0.44)');
            fg2.addColorStop(1, 'rgba(230,82,26,0)');
          } else {
            fg2.addColorStop(0, 'rgba(248,150,64,0.42)');
            fg2.addColorStop(0.55, 'rgba(224,84,32,0.36)');
            fg2.addColorStop(1, 'rgba(176,44,18,0)');
          }
          b.fillStyle = fg2;
          b.beginPath();
          b.moveTo(fx - halfW, horizon - H * 0.02);
          b.bezierCurveTo(
            fx - halfW * 1.15, horizon - fh * 0.42,
            fx - halfW * 0.5 + sway, horizon - fh * 0.72,
            fx + sway + flick * W * 0.003, horizon - fh,
          );
          b.bezierCurveTo(
            fx + halfW * 0.58 + sway, horizon - fh * 0.62,
            fx + halfW * 1.05, horizon - fh * 0.36,
            fx + halfW, horizon - H * 0.02,
          );
          b.closePath();
          b.fill();
        }
      }
      // 火星
      for (let i = 0; i < 26; i++) {
        const ex = gx + rand(-W * 0.06, W * 0.06);
        const ey = horizon - H * rand(0.05, 0.26);
        b.fillStyle = `rgba(255,${180 + Math.floor(rand(0, 60))},110,${rand(0.25, 0.8)})`;
        b.beginPath();
        b.arc(ex, ey, rand(0.7, 1.8), 0, 6.3);
        b.fill();
      }
      // 火光
      for (let i = 0; i < 6; i++) {
        const fx = gx + rand(-W * 0.06, W * 0.06);
        const fy = horizon - H * rand(0.06, 0.2);
        const fg = b.createRadialGradient(fx, fy, 0, fx, fy, H * rand(0.05, 0.1));
        fg.addColorStop(0, 'rgba(255,200,120,0.42)');
        fg.addColorStop(0.5, 'rgba(255,120,50,0.25)');
        fg.addColorStop(1, 'rgba(200,60,30,0)');
        b.fillStyle = fg;
        b.beginPath(); b.arc(fx, fy, H * 0.1, 0, 6.3); b.fill();
      }
      b.restore();
      // 浓烟：由窄到宽的柔团
      for (let i = 0; i < 9; i++) {
        const sy = horizon - H * (0.2 + i * 0.035);
        const sx = gx + H * 0.02 * i * (i % 2 ? 1 : -0.6);
        const sr = H * (0.04 + i * 0.014);
        const sg = b.createRadialGradient(sx, sy, 0, sx, sy, sr);
        sg.addColorStop(0, 'rgba(30,18,22,0.34)');
        sg.addColorStop(0.7, 'rgba(36,22,26,0.18)');
        sg.addColorStop(1, 'rgba(40,24,28,0)');
        b.fillStyle = sg;
        b.beginPath(); b.arc(sx, sy, sr, 0, 6.3); b.fill();
      }
    }
  }
  drawPalace.ground = (b, p, horizon) => {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const fire = state.time === 'fire';
    const night = state.time === 'night';
    // 宫前湖水：近岸更深，远岸反光
    const wg = b.createLinearGradient(0, horizon, 0, H);
    wg.addColorStop(0, shade(p2.skyMid, night ? -46 : -26));
    wg.addColorStop(0.45, shade(p2.skyMid, night ? -54 : -34));
    wg.addColorStop(1, shade(p2.ground, night ? -40 : -18));
    b.fillStyle = wg;
    b.fillRect(0, horizon, W, H - horizon);
    // 远岸石台与水线
    b.fillStyle = fire ? 'rgba(54,32,30,0.95)' : night ? 'rgba(30,32,44,0.95)' : state.time === 'dusk' ? 'rgba(96,80,74,0.9)' : '#7d8478';
    b.fillRect(0, horizon, W, H * 0.02);
    b.fillStyle = 'rgba(244,238,218,0.16)';
    b.fillRect(0, horizon, W, 1.5);
    // 丹青阁倒影
    const cx = W * 0.5, pw = W * 0.30, reflH = H * 0.34;
    b.save();
    b.globalAlpha = 0.2;
    b.beginPath();
    b.moveTo(cx - pw * 0.5, horizon);
    b.lineTo(cx + pw * 0.5, horizon);
    b.lineTo(cx + pw * 0.58, horizon + reflH);
    b.lineTo(cx - pw * 0.58, horizon + reflH);
    b.closePath();
    b.clip();
    const rg = b.createLinearGradient(0, horizon, 0, horizon + reflH);
    rg.addColorStop(0, shade(p2.ground, -10));
    rg.addColorStop(0.6, shade(p2.ground, -20));
    rg.addColorStop(1, hexA(shade(p2.ground, -20), 0));
    b.fillStyle = rg;
    b.fillRect(cx - pw * 0.62, horizon, pw * 1.24, reflH);
    const glowRGB = fire ? '255,150,70' : '255,214,150';
    for (let i = 0; i < 9; i++) {
      const gx = cx - pw * 0.4 + (pw * 0.8 * i) / 8;
      b.fillStyle = `rgba(${glowRGB},0.16)`;
      b.fillRect(gx, horizon + 2, pw * 0.032, reflH * rand(0.35, 0.6));
    }
    // 倒影里的檐口暗带与波折
    for (let i = 0; i < 3; i++) {
      const ry = horizon + reflH * (0.18 + i * 0.24);
      b.fillStyle = shade(p2.ground, -30);
      b.fillRect(cx - pw * 0.5, ry, pw * rand(0.7, 1), 2.5);
    }
    b.restore();
    // 火夜：玄武门方向的火光倒影——被水波揉碎的纵向光柱
    if (fire) {
      const fx = W * 0.16;
      b.save();
      b.translate(fx, horizon + H * 0.01);
      b.scale(1, 2.9);
      const fg = b.createRadialGradient(0, 0, 0, 0, 0, W * 0.062);
      fg.addColorStop(0, 'rgba(255,168,88,0.46)');
      fg.addColorStop(0.45, 'rgba(238,108,46,0.26)');
      fg.addColorStop(1, 'rgba(200,70,30,0)');
      b.fillStyle = fg;
      b.beginPath(); b.arc(0, 0, W * 0.062, 0, 6.3); b.fill();
      b.restore();
      b.save();
      b.globalCompositeOperation = 'lighter';
      // 横向波光：越远越细，越近越散
      for (let i = 0; i < 30; i++) {
        const yy = horizon + rand(H * 0.01, H * 0.42);
        const spread = W * (0.02 + (yy - horizon) / (H * 0.42) * 0.055);
        const sx = fx + rand(-spread, spread);
        const len = rand(4, 30) * (1 - (yy - horizon) / (H * 0.5) * 0.5);
        b.strokeStyle = `rgba(255,${160 + Math.floor(rand(0, 70))},90,${rand(0.12, 0.38)})`;
        b.lineWidth = rand(1.2, 2.6);
        b.beginPath();
        b.moveTo(sx, yy);
        b.quadraticCurveTo(sx + len * 0.5, yy + rand(-1.5, 1.5), sx + len, yy);
        b.stroke();
      }
      // 靠近水线的一层密集碎金
      for (let i = 0; i < 22; i++) {
        const yy = horizon + rand(0, H * 0.035);
        b.fillStyle = `rgba(255,206,132,${rand(0.18, 0.5)})`;
        b.fillRect(fx + rand(-W * 0.075, W * 0.075), yy, rand(2, 9), 1.4);
      }
      b.restore();
    }
    // 水面粼光与细波
    b.save();
    b.globalCompositeOperation = 'lighter';
    const strokes = state.time === 'day' ? 70 : 52;
    for (let i = 0; i < strokes; i++) {
      const sy = horizon + H * 0.02 + Math.random() * (H - horizon - H * 0.03);
      const sx = Math.random() * W;
      const len = W * (0.012 + Math.random() * 0.055);
      b.strokeStyle = fire
        ? `rgba(255,${140 + Math.random() * 60},80,${0.05 + Math.random() * 0.16})`
        : hexA(p2.glow, 0.05 + Math.random() * 0.13);
      b.lineWidth = Math.random() < 0.2 ? 1.6 : 1;
      b.beginPath();
      b.moveTo(sx, sy);
      b.quadraticCurveTo(sx + len * 0.5, sy - 1.2, sx + len, sy);
      b.stroke();
    }
    b.restore();
    // 近岸荷叶与水草
    const lotus = [[0.075, 0.9], [0.155, 0.97], [0.905, 0.9], [0.83, 0.965], [0.245, 0.85]];
    for (const [fx0, fy0] of lotus) {
      const lx = W * fx0, ly = horizon + (H - horizon) * (fy0 - 0.62);
      const lw = W * rand(0.032, 0.052), lh = lw * 0.34;
      b.save();
      b.translate(lx, ly);
      b.rotate(rand(-0.2, 0.2));
      const lg2 = b.createRadialGradient(-lw * 0.2, -lh * 0.3, 1, 0, 0, lw);
      lg2.addColorStop(0, fire ? 'rgba(120,80,52,0.9)' : 'rgba(84,120,92,0.9)');
      lg2.addColorStop(1, fire ? 'rgba(40,24,22,0.9)' : 'rgba(28,52,44,0.9)');
      b.fillStyle = lg2;
      b.beginPath(); b.ellipse(0, 0, lw, lh, 0, 0, 6.3); b.fill();
      b.strokeStyle = fire ? 'rgba(190,120,70,0.25)' : 'rgba(150,190,150,0.22)';
      b.lineWidth = 1;
      for (let v = 0; v < 6; v++) {
        const ang = -Math.PI / 2 + (v - 2.5) * 0.42;
        b.beginPath(); b.moveTo(0, 0);
        b.lineTo(Math.cos(ang) * lw * 0.85, Math.sin(ang) * lh * 0.85);
        b.stroke();
      }
      b.restore();
      // 荷茎与一朵半开的荷花
      b.strokeStyle = 'rgba(60,84,66,0.5)';
      b.lineWidth = 1.5;
      b.beginPath(); b.moveTo(lx, ly); b.quadraticCurveTo(lx + 5, ly - lh * 2.4, lx + 2, ly - lh * 3.4); b.stroke();
      if (fx0 < 0.3) {
        b.fillStyle = fire ? 'rgba(220,130,90,0.5)' : 'rgba(226,180,188,0.55)';
        b.beginPath();
        b.ellipse(lx + 2, ly - lh * 3.6, lw * 0.12, lh * 0.9, 0.2, 0, 6.3);
        b.fill();
      }
    }
    // 岸边薄雾
    if (!fire) {
      const mg = b.createLinearGradient(0, horizon - H * 0.02, 0, horizon + H * 0.1);
      mg.addColorStop(0, hexA(p2.skyLow, 0.22));
      mg.addColorStop(1, hexA(p2.skyLow, 0));
      b.fillStyle = mg;
      b.fillRect(0, horizon - H * 0.02, W, H * 0.12);
    }
  };

  /* ---------- 场景：丹青阁 ---------- */
  function drawPavilion(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const fire = state.time === 'fire';
    const night = state.time === 'night';
    const day = state.time === 'day';
    const wallA = fire ? '#3f241d' : night ? '#2b211d' : '#6c4b31';
    const wallB = fire ? '#301b16' : night ? '#221914' : '#5a3e27';
    const beam = fire ? '#291512' : night ? '#1b1412' : '#3e2b1e';
    const beamHi = fire ? '#5a2d21' : night ? '#372a24' : '#6b4a31';
    const woodHi = fire ? '#8a4c32' : night ? '#4e3b30' : '#9a7248';

    // 顶棚与格心
    b.fillStyle = beam;
    b.fillRect(0, 0, W, H * 0.125);
    for (let i = 0; i < 8; i++) {
      const bx = (W * i) / 8;
      b.fillStyle = i % 2 ? 'rgba(255,226,186,0.035)' : 'rgba(0,0,0,0.12)';
      b.fillRect(bx + 3, H * 0.012, W / 8 - 6, H * 0.082);
      b.strokeStyle = 'rgba(0,0,0,0.32)';
      b.lineWidth = 1.1;
      b.strokeRect(bx + 3, H * 0.012, W / 8 - 6, H * 0.082);
    }
    // 主梁
    b.fillStyle = beamHi;
    b.fillRect(0, H * 0.098, W, H * 0.03);
    b.fillStyle = 'rgba(0,0,0,0.25)';
    b.fillRect(0, H * 0.123, W, H * 0.006);
    b.strokeStyle = 'rgba(255,232,196,0.08)';
    b.lineWidth = 1;
    b.beginPath(); b.moveTo(0, H * 0.1); b.lineTo(W, H * 0.1); b.stroke();

    // 后墙：楠木隔板
    const wallTop = H * 0.128, wallBot = horizon;
    const wallG = b.createLinearGradient(0, wallTop, 0, wallBot);
    wallG.addColorStop(0, wallB);
    wallG.addColorStop(0.55, wallA);
    wallG.addColorStop(1, hexA(wallA, 0.92));
    b.fillStyle = wallG;
    b.fillRect(0, wallTop, W, wallBot - wallTop);
    const plankW = W * 0.046;
    for (let i = 0; i < 22; i++) {
      const px = W * 0.012 + i * plankW;
      b.fillStyle = i % 2 ? 'rgba(255,222,178,0.028)' : 'rgba(0,0,0,0.05)';
      b.fillRect(px, wallTop, plankW, wallBot - wallTop);
      b.strokeStyle = 'rgba(0,0,0,0.17)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(px, wallTop); b.lineTo(px, wallBot); b.stroke();
      // 木节
      if (i % 5 === 2) {
        b.strokeStyle = 'rgba(28,16,10,0.22)';
        b.beginPath();
        b.ellipse(px + plankW * 0.55, wallTop + (wallBot - wallTop) * rand(0.22, 0.62),
          plankW * 0.12, plankW * 0.07, 0.3, 0, 6.3);
        b.stroke();
      }
    }
    // 护墙板与压线
    const chairY = wallBot - (wallBot - wallTop) * 0.16;
    b.fillStyle = shade(wallB, -6);
    b.fillRect(0, chairY, W, wallBot - chairY);
    b.fillStyle = woodHi;
    b.fillRect(0, chairY - H * 0.008, W, H * 0.009);
    b.fillStyle = 'rgba(255,232,192,0.12)';
    b.fillRect(0, chairY - H * 0.008, W, 1.4);

    // 立柱与雀替
    for (const cx of [W * 0.018, W * 0.962]) {
      b.fillStyle = beamHi;
      b.fillRect(cx, wallTop, W * 0.02, horizon - wallTop);
      b.fillStyle = 'rgba(255,226,180,0.10)';
      b.fillRect(cx + 2, wallTop, 2, horizon - wallTop);
      b.fillStyle = beam;
      b.fillRect(cx - W * 0.006, wallTop, W * 0.032, H * 0.012);
    }

    // 左侧书架
    const sx = W * 0.048, sw = W * 0.245;
    const sy = H * 0.19, sh = (horizon - H * 0.022) - sy;
    b.fillStyle = beam;
    b.fillRect(sx - W * 0.008, sy - H * 0.012, sw + W * 0.016, sh + H * 0.012);
    b.fillStyle = shade(beam, 14);
    b.fillRect(sx - W * 0.002, sy - H * 0.006, sw + W * 0.004, sh + H * 0.006);
    b.fillStyle = shade(beam, -14);
    b.fillRect(sx, sy, sw, sh);
    // 书架横板
    const shelfGap = sh / 3;
    for (let s = 0; s < 3; s++) {
      const shelfY = sy + shelfGap * (s + 1);
      b.fillStyle = beamHi;
      b.fillRect(sx - W * 0.002, shelfY - H * 0.006, sw + W * 0.004, H * 0.012);
      b.fillStyle = 'rgba(255,226,182,0.10)';
      b.fillRect(sx - W * 0.002, shelfY - H * 0.006, sw + W * 0.004, 1.2);
      b.fillStyle = 'rgba(0,0,0,0.28)';
      b.fillRect(sx - W * 0.002, shelfY + H * 0.006, sw + W * 0.004, H * 0.004);
      // 书册
      const bookY = shelfY - H * 0.006;
      let bx = sx + sw * 0.04;
      const bookCount = 8 + s;
      for (let k = 0; k < bookCount; k++) {
        const bw = W * (0.011 + (k % 3) * 0.003);
        const bh = H * (0.105 - (k % 4) * 0.012) * (s === 2 ? 0.8 : 1);
        const lean = k === bookCount - 1 ? -0.12 : 0;
        b.save();
        b.translate(bx + bw / 2, bookY);
        b.rotate(lean);
        const spine = ['#7d3f32', '#3f5a52', '#8a6a3a', '#5a4a63', '#a08762', '#2f4a52'][(k + s * 2) % 6];
        b.fillStyle = fire ? shade(spine, -34) : shade(spine, night ? -30 : 0);
        b.fillRect(-bw / 2, -bh, bw, bh);
        b.fillStyle = 'rgba(240,226,196,0.22)';
        b.fillRect(-bw / 2 + 1, -bh + bh * 0.12, bw - 2, 1.4);
        b.fillRect(-bw / 2 + 1, -bh + bh * 0.78, bw - 2, 1.2);
        b.strokeStyle = 'rgba(0,0,0,0.32)';
        b.lineWidth = 0.8;
        b.strokeRect(-bw / 2, -bh, bw, bh);
        b.restore();
        bx += bw + W * 0.0025;
        if (bx > sx + sw * 0.9) break;
      }
      // 横放的书与卷轴
      if (s === 0) {
        b.fillStyle = '#6a4a34';
        b.fillRect(sx + sw * 0.62, bookY - H * 0.028, sw * 0.22, H * 0.022);
        b.fillStyle = 'rgba(234,220,192,0.2)';
        b.fillRect(sx + sw * 0.62, bookY - H * 0.028, sw * 0.22, 1.5);
      }
      if (s === 1) {
        for (let r = 0; r < 3; r++) {
          const rx = sx + sw * (0.58 + r * 0.09);
          b.fillStyle = '#8a6a44';
          b.fillRect(rx, bookY - H * 0.024, sw * 0.035, H * 0.022);
          b.fillStyle = 'rgba(246,234,206,0.5)';
          b.beginPath(); b.ellipse(rx, bookY - H * 0.013, sw * 0.017, H * 0.010, 0, 0, 6.3); b.fill();
          b.strokeStyle = 'rgba(90,62,40,0.6)'; b.lineWidth = 1; b.stroke();
        }
      }
      // 瓷罐：小口鼓腹的实用器，釉色随昼夜变化
      if (s === 2) {
        for (let j = 0; j < 3; j++) {
          const jx = sx + sw * (0.2 + j * 0.3);
          const jr = sw * (0.045 + (j % 2) * 0.01);
          const jh = jr * 2.15;
          const jy = shelfY - jh * 0.72;
          const base = fire ? '#b98e76' : night ? '#7b756a' : '#ddd7c6';
          const dark = fire ? '#6b4636' : night ? '#403c36' : '#8f8877';
          const lite = fire ? '#e8c9ae' : night ? '#a49d90' : '#f5efe0';
          const glaze = fire ? '#8f6a58' : night ? '#4d5a58' : '#7f9a90';
          // 落在层板上的影子
          b.fillStyle = 'rgba(0,0,0,0.26)';
          b.beginPath();
          b.ellipse(jx + jr * 0.10, shelfY + 1.5, jr * 1.08, jr * 0.20, 0, 0, 6.3);
          b.fill();
          // 罐身：肩部饱满、下腹收束到圈足
          const jg = b.createLinearGradient(jx - jr, 0, jx + jr, 0);
          jg.addColorStop(0, dark);
          jg.addColorStop(0.28, base);
          jg.addColorStop(0.52, lite);
          jg.addColorStop(0.78, base);
          jg.addColorStop(1, dark);
          b.fillStyle = jg;
          b.beginPath();
          b.moveTo(jx - jr * 0.50, jy - jh * 0.62);
          b.bezierCurveTo(jx - jr * 1.02, jy - jh * 0.30, jx - jr * 0.96, jy + jh * 0.36, jx - jr * 0.58, jy + jh * 0.62);
          b.quadraticCurveTo(jx - jr * 0.28, jy + jh * 0.72, jx, jy + jh * 0.72);
          b.quadraticCurveTo(jx + jr * 0.28, jy + jh * 0.72, jx + jr * 0.58, jy + jh * 0.62);
          b.bezierCurveTo(jx + jr * 0.96, jy + jh * 0.36, jx + jr * 1.02, jy - jh * 0.30, jx + jr * 0.50, jy - jh * 0.62);
          b.closePath();
          b.fill();
          // 肩部一道青釉弦纹
          b.strokeStyle = hexA(glaze, night ? 0.5 : 0.62);
          b.lineWidth = Math.max(1, W * 0.0016);
          b.beginPath();
          b.ellipse(jx, jy - jh * 0.18, jr * 0.88, jr * 0.20, 0, 0.08, Math.PI - 0.08);
          b.stroke();
          b.strokeStyle = hexA(glaze, 0.28);
          b.beginPath();
          b.ellipse(jx, jy + jh * 0.30, jr * 0.82, jr * 0.16, 0, 0.1, Math.PI - 0.1);
          b.stroke();
          // 口沿与罐口内的暗
          b.fillStyle = shade(base, -8);
          b.beginPath();
          b.ellipse(jx, jy - jh * 0.64, jr * 0.50, jr * 0.14, 0, 0, 6.3);
          b.fill();
          b.fillStyle = 'rgba(24,18,14,0.55)';
          b.beginPath();
          b.ellipse(jx, jy - jh * 0.635, jr * 0.37, jr * 0.09, 0, 0, 6.3);
          b.fill();
          b.strokeStyle = 'rgba(255,250,236,0.34)';
          b.lineWidth = 1;
          b.beginPath();
          b.ellipse(jx, jy - jh * 0.645, jr * 0.46, jr * 0.12, 0, Math.PI * 1.05, Math.PI * 1.95);
          b.stroke();
          // 圈足
          b.fillStyle = dark;
          b.fillRect(jx - jr * 0.36, jy + jh * 0.68, jr * 0.72, jh * 0.06);
          // 釉面竖向高光与开片
          b.fillStyle = 'rgba(255,250,236,0.16)';
          b.beginPath();
          b.ellipse(jx - jr * 0.34, jy - jh * 0.06, jr * 0.14, jh * 0.28, -0.08, 0, 6.3);
          b.fill();
          b.strokeStyle = 'rgba(60,54,46,0.16)';
          b.lineWidth = 0.8;
          for (let k = 0; k < 3; k++) {
            b.beginPath();
            b.moveTo(jx + jr * (0.10 + k * 0.16), jy - jh * 0.16 + k * 3);
            b.lineTo(jx + jr * (0.04 + k * 0.13), jy + jh * 0.20 + k * 2);
            b.stroke();
          }
        }
      }
    }

    // 墙上挂轴：青绿山水
    const hx = W * 0.325, hy = H * 0.155, hw = W * 0.085, hh = H * 0.30;
    b.fillStyle = '#2e241c';
    b.fillRect(hx - 3, hy - H * 0.014, hw + 6, hh + H * 0.02);
    b.fillStyle = night ? 'rgba(206,200,184,0.5)' : 'rgba(240,234,214,0.62)';
    b.fillRect(hx, hy, hw, hh);
    b.strokeStyle = 'rgba(92,70,46,0.65)'; b.lineWidth = 1.4;
    b.strokeRect(hx, hy, hw, hh);
    b.strokeStyle = 'rgba(140,108,70,0.4)'; b.lineWidth = 1;
    b.strokeRect(hx + 4, hy + 4, hw - 8, hh - 8);
    // 远山淡墨
    b.fillStyle = 'rgba(92,116,104,0.32)';
    b.beginPath();
    b.moveTo(hx + 4, hy + hh * 0.56);
    b.bezierCurveTo(hx + hw * 0.2, hy + hh * 0.36, hx + hw * 0.34, hy + hh * 0.5, hx + hw * 0.5, hy + hh * 0.40);
    b.bezierCurveTo(hx + hw * 0.68, hy + hh * 0.28, hx + hw * 0.8, hy + hh * 0.48, hx + hw - 4, hy + hh * 0.36);
    b.lineTo(hx + hw - 4, hy + hh * 0.72); b.lineTo(hx + 4, hy + hh * 0.72); b.closePath(); b.fill();
    // 近山青绿
    b.fillStyle = 'rgba(56,100,88,0.42)';
    b.beginPath();
    b.moveTo(hx + 4, hy + hh * 0.82);
    b.bezierCurveTo(hx + hw * 0.18, hy + hh * 0.6, hx + hw * 0.3, hy + hh * 0.78, hx + hw * 0.42, hy + hh * 0.64);
    b.bezierCurveTo(hx + hw * 0.56, hy + hh * 0.52, hx + hw * 0.7, hy + hh * 0.7, hx + hw - 4, hy + hh * 0.6);
    b.lineTo(hx + hw - 4, hy + hh * 0.9); b.lineTo(hx + 4, hy + hh * 0.9); b.closePath(); b.fill();
    // 水纹与一叶小舟
    b.strokeStyle = 'rgba(58,92,86,0.5)'; b.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const wy0 = hy + hh * (0.84 + i * 0.035);
      b.beginPath();
      b.moveTo(hx + hw * (0.14 + i * 0.04), wy0);
      b.quadraticCurveTo(hx + hw * 0.4, wy0 - 1.6, hx + hw * (0.7 - i * 0.03), wy0);
      b.stroke();
    }
    b.strokeStyle = 'rgba(50,44,38,0.7)'; b.lineWidth = 1.2;
    b.beginPath();
    b.moveTo(hx + hw * 0.56, hy + hh * 0.83);
    b.quadraticCurveTo(hx + hw * 0.6, hy + hh * 0.86, hx + hw * 0.66, hy + hh * 0.83);
    b.stroke();
    // 题款
    b.fillStyle = 'rgba(44,38,32,0.55)';
    for (let i = 0; i < 4; i++) {
      b.fillRect(hx + hw * 0.8, hy + hh * (0.12 + i * 0.07), 2.2, hh * 0.035);
    }
    // 朱印
    b.fillStyle = 'rgba(170,54,42,0.65)';
    b.fillRect(hx + hw * 0.78, hy + hh * 0.44, hw * 0.1, hw * 0.1);

    // 右侧大窗：临湖
    const wx = W * 0.475, wy = H * 0.155, ww = W * 0.44, wh = H * 0.425;
    // 窗框
    b.fillStyle = beam;
    b.fillRect(wx - W * 0.012, wy - H * 0.016, ww + W * 0.024, wh + H * 0.026);
    b.fillStyle = beamHi;
    b.fillRect(wx - W * 0.006, wy - H * 0.008, ww + W * 0.012, H * 0.008);
    // 窗外景致统一裁切在窗洞内
    b.save();
    b.beginPath();
    b.rect(wx, wy, ww, wh);
    b.clip();
    // 窗外天空
    const skyTop = fire ? '#3a0a10' : night ? '#101a2c' : p2.skyTop;
    const skyMid = fire ? '#c94820' : night ? '#1c2c46' : p2.skyMid;
    const skyLow = fire ? '#ffb05e' : night ? '#425070' : p2.skyLow;
    const skyG = b.createLinearGradient(0, wy, 0, wy + wh * 0.66);
    skyG.addColorStop(0, skyTop);
    skyG.addColorStop(0.6, skyMid);
    skyG.addColorStop(1, skyLow);
    b.fillStyle = skyG;
    b.fillRect(wx, wy, ww, wh);
    // 远山
    b.fillStyle = fire ? 'rgba(40,16,16,0.7)' : night ? 'rgba(10,14,24,0.75)' : 'rgba(90,110,108,0.4)';
    b.beginPath();
    b.moveTo(wx, wy + wh * 0.5);
    b.quadraticCurveTo(wx + ww * 0.2, wy + wh * 0.4, wx + ww * 0.38, wy + wh * 0.48);
    b.quadraticCurveTo(wx + ww * 0.6, wy + wh * 0.38, wx + ww, wy + wh * 0.46);
    b.lineTo(wx + ww, wy + wh * 0.58); b.lineTo(wx, wy + wh * 0.58); b.closePath(); b.fill();
    // 湖水
    const seaY = wy + wh * 0.55;
    const seaG = b.createLinearGradient(0, seaY, 0, wy + wh);
    seaG.addColorStop(0, fire ? '#8a3a20' : night ? '#14243a' : hexA(shade(p2.skyMid, -26), 0.95));
    seaG.addColorStop(1, fire ? '#3a1612' : night ? '#0c1624' : hexA(shade(p2.ground, -28), 0.95));
    b.fillStyle = seaG;
    b.fillRect(wx, seaY, ww, wy + wh - seaY);
    b.strokeStyle = hexA(p2.glow, 0.25); b.lineWidth = 1;
    b.beginPath(); b.moveTo(wx, seaY); b.lineTo(wx + ww, seaY); b.stroke();
    for (let i = 0; i < 22; i++) {
      const gx = wx + 4 + Math.random() * (ww - 8);
      const gy = seaY + 3 + Math.random() * (wy + wh - seaY - 6);
      b.strokeStyle = fire ? 'rgba(255,170,90,0.2)' : hexA(p2.glow, 0.06 + Math.random() * 0.1);
      b.beginPath(); b.moveTo(gx, gy); b.lineTo(gx + 4 + Math.random() * 18, gy); b.stroke();
    }
    // 窗外垂柳
    const willowCol = fire ? 'rgba(40,16,14,0.85)' : night ? 'rgba(8,14,20,0.9)' : state.time === 'dusk' ? 'rgba(58,40,50,0.78)' : hexA(shade(p2.skyMid, -44), 0.72);
    drawWillow(b, wx + ww * 0.12, wy - wh * 0.28, wh * 0.82, willowCol);
    drawWillow(b, wx + ww * 0.88, wy - wh * 0.22, wh * 0.66, willowCol);
    b.restore();
    // 窗棂：步步锦
    b.strokeStyle = beam;
    b.lineWidth = Math.max(4, W * 0.0055);
    b.strokeRect(wx, wy, ww, wh);
    b.lineWidth = Math.max(2, W * 0.0028);
    for (let i = 1; i < 4; i++) {
      const xx = wx + (ww * i) / 4;
      b.beginPath(); b.moveTo(xx, wy); b.lineTo(xx, wy + wh); b.stroke();
    }
    for (let i = 1; i < 3; i++) {
      const yy = wy + (wh * i) / 3;
      b.beginPath(); b.moveTo(wx, yy); b.lineTo(wx + ww, yy); b.stroke();
    }
    // 每格四角的短棂
    const cw = ww / 4, ch = wh / 3;
    b.lineWidth = Math.max(1.5, W * 0.0018);
    for (let gc = 0; gc < 4; gc++) {
      for (let gr = 0; gr < 3; gr++) {
        const gx0 = wx + gc * cw, gy0 = wy + gr * ch;
        const arm = Math.min(cw, ch) * 0.26;
        b.beginPath();
        b.moveTo(gx0, gy0 + arm); b.lineTo(gx0 + arm, gy0);
        b.moveTo(gx0 + cw - arm, gy0); b.lineTo(gx0 + cw, gy0 + arm);
        b.moveTo(gx0, gy0 + ch - arm); b.lineTo(gx0 + arm, gy0 + ch);
        b.moveTo(gx0 + cw - arm, gy0 + ch); b.lineTo(gx0 + cw, gy0 + ch - arm);
        b.stroke();
      }
    }
    // 窗台
    b.fillStyle = beamHi;
    b.fillRect(wx - W * 0.016, wy + wh, ww + W * 0.032, H * 0.014);
    b.fillStyle = 'rgba(255,230,190,0.16)';
    b.fillRect(wx - W * 0.016, wy + wh, ww + W * 0.032, 2);
    // 窗台陈设：梅瓶、笔筒、卷轴
    const vy = wy + wh;
    // 青瓷梅瓶：小口、丰肩、敛足，实心瓷胎不是透明气泡
    {
      const vx = wx + ww * 0.1;
      const vb = vy - 1.5;
      const vh = H * 0.078;
      const vw = W * 0.013;
      const vDark = fire ? '#7a4f3c' : night ? '#39433f' : '#8d9a92';
      const vMid = fire ? '#b98a72' : night ? '#68746d' : '#c3cfc5';
      const vLite = fire ? '#e3b997' : night ? '#8f9a92' : '#f1f5ec';
      b.fillStyle = 'rgba(0,0,0,0.30)';
      b.beginPath();
      b.ellipse(vx + vw * 0.18, vb + 1, vw * 0.95, H * 0.005, 0, 0, 6.3);
      b.fill();
      const vg = b.createLinearGradient(vx - vw, 0, vx + vw, 0);
      vg.addColorStop(0, vDark);
      vg.addColorStop(0.30, vMid);
      vg.addColorStop(0.52, vLite);
      vg.addColorStop(0.82, vMid);
      vg.addColorStop(1, vDark);
      b.fillStyle = vg;
      b.beginPath();
      b.moveTo(vx - vw * 0.24, vb - vh);
      b.bezierCurveTo(vx - vw * 0.30, vb - vh * 0.82, vx - vw * 0.72, vb - vh * 0.74, vx - vw * 0.92, vb - vh * 0.50);
      b.bezierCurveTo(vx - vw * 1.04, vb - vh * 0.26, vx - vw * 0.62, vb - vh * 0.04, vx - vw * 0.40, vb);
      b.lineTo(vx + vw * 0.40, vb);
      b.bezierCurveTo(vx + vw * 0.62, vb - vh * 0.04, vx + vw * 1.04, vb - vh * 0.26, vx + vw * 0.92, vb - vh * 0.50);
      b.bezierCurveTo(vx + vw * 0.72, vb - vh * 0.74, vx + vw * 0.30, vb - vh * 0.82, vx + vw * 0.24, vb - vh);
      b.closePath();
      b.fill();
      // 口沿
      b.fillStyle = vDark;
      b.beginPath();
      b.ellipse(vx, vb - vh, vw * 0.26, H * 0.0042, 0, 0, 6.3);
      b.fill();
      b.fillStyle = 'rgba(20,16,12,0.5)';
      b.beginPath();
      b.ellipse(vx, vb - vh + 0.4, vw * 0.16, H * 0.0022, 0, 0, 6.3);
      b.fill();
      // 肩部釉光与开片
      b.strokeStyle = hexA(fire ? '#f0c6a6' : '#ffffff', 0.20);
      b.lineWidth = 1;
      b.beginPath();
      b.ellipse(vx, vb - vh * 0.50, vw * 0.86, vh * 0.10, 0, 0.12, Math.PI - 0.12);
      b.stroke();
      b.fillStyle = 'rgba(255,252,240,0.18)';
      b.beginPath();
      b.ellipse(vx - vw * 0.34, vb - vh * 0.42, vw * 0.16, vh * 0.22, -0.08, 0, 6.3);
      b.fill();
      b.strokeStyle = 'rgba(52,46,38,0.18)';
      for (let k = 0; k < 2; k++) {
        b.beginPath();
        b.moveTo(vx - vw * 0.02 + k * 3, vb - vh * 0.30);
        b.lineTo(vx + vw * 0.10 + k * 2, vb - vh * 0.04);
        b.stroke();
      }
      // 足圈
      b.fillStyle = vDark;
      b.fillRect(vx - vw * 0.34, vb - H * 0.006, vw * 0.68, H * 0.006);
    }
    b.fillStyle = '#5a3f2a';
    b.fillRect(wx + ww * 0.82, vy - H * 0.036, W * 0.026, H * 0.036);
    b.strokeStyle = 'rgba(212,196,164,0.5)';
    for (let i = 0; i < 4; i++) {
      b.beginPath();
      b.moveTo(wx + ww * 0.832 + i * W * 0.005, vy - H * 0.036);
      b.lineTo(wx + ww * 0.828 + i * W * 0.007, vy - H * 0.062);
      b.stroke();
    }
    b.fillStyle = 'rgba(238,230,208,0.4)';
    b.fillRect(wx + ww * 0.16, vy - H * 0.02, W * 0.06, H * 0.014);
    b.strokeStyle = 'rgba(120,90,60,0.6)'; b.strokeRect(wx + ww * 0.16, vy - H * 0.02, W * 0.06, H * 0.014);

    // 琉璃宫灯
    const lx = W * 0.40, ly = H * 0.255;
    b.strokeStyle = hexA(p2.glow, 0.3); b.lineWidth = 1.4;
    b.beginPath(); b.moveTo(lx, H * 0.128); b.lineTo(lx, ly - H * 0.045); b.stroke();
    b.fillStyle = beamHi;
    b.fillRect(lx - W * 0.007, ly - H * 0.05, W * 0.014, H * 0.008);
    const lg = b.createRadialGradient(lx, ly, 0, lx, ly, H * 0.13);
    lg.addColorStop(0, fire ? 'rgba(255,160,90,0.55)' : 'rgba(255,206,140,0.42)');
    lg.addColorStop(1, 'rgba(255,190,120,0)');
    b.fillStyle = lg;
    b.beginPath(); b.arc(lx, ly, H * 0.13, 0, 6.3); b.fill();
    // 六角灯身
    b.fillStyle = fire ? '#d86a3a' : '#e8a558';
    b.beginPath();
    b.moveTo(lx - W * 0.013, ly - H * 0.042);
    b.lineTo(lx + W * 0.013, ly - H * 0.042);
    b.lineTo(lx + W * 0.018, ly + H * 0.026);
    b.lineTo(lx - W * 0.018, ly + H * 0.026);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(255,238,196,0.55)';
    b.fillRect(lx - W * 0.008, ly - H * 0.036, W * 0.016, H * 0.052);
    b.strokeStyle = 'rgba(120,72,36,0.55)'; b.lineWidth = 1;
    b.beginPath(); b.moveTo(lx, ly - H * 0.042); b.lineTo(lx, ly + H * 0.026); b.stroke();
    b.fillStyle = beamHi;
    b.fillRect(lx - W * 0.016, ly - H * 0.048, W * 0.032, H * 0.007);
    b.fillRect(lx - W * 0.017, ly + H * 0.026, W * 0.034, H * 0.007);
    // 灯穗
    b.strokeStyle = 'rgba(178,72,52,0.65)'; b.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) {
      b.beginPath();
      b.moveTo(lx + i * 2.4, ly + H * 0.033);
      b.lineTo(lx + i * 2.8, ly + H * 0.06);
      b.stroke();
    }

    // 火夜：窗外飘入的火星
    if (fire) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        const ex = wx + Math.random() * ww;
        const ey = wy + Math.random() * wh;
        b.fillStyle = `rgba(255,${140 + (i * 37) % 90},70,${0.2 + Math.random() * 0.4})`;
        b.beginPath(); b.arc(ex, ey, 1 + Math.random() * 2, 0, 6.3); b.fill();
      }
      b.restore();
    }
  }

  drawPavilion.ground = (b, p, horizon) => {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const fire = state.time === 'fire';
    const night = state.time === 'night';
    const floorA = fire ? '#3a221b' : night ? '#2a201b' : '#6c4b31';
    const floorB = fire ? '#2c1915' : night ? '#201813' : '#563a25';
    const floorC = fire ? '#4a2a20' : night ? '#35261e' : '#7f5a39';
    // 木地板
    const fg = b.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, floorB);
    fg.addColorStop(0.5, floorA);
    fg.addColorStop(1, floorC);
    b.fillStyle = fg;
    b.fillRect(0, horizon, W, H - horizon);
    // 板缝：横向随透视收紧
    b.strokeStyle = 'rgba(0,0,0,0.22)';
    b.lineWidth = 1.2;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const yy = horizon + (H - horizon) * t * t;
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    // 纵向板缝
    for (let i = 0; i <= 18; i++) {
      const xb = (W * i) / 18;
      const xt = W * 0.5 + (xb - W * 0.5) * 0.14;
      b.strokeStyle = 'rgba(0,0,0,0.18)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(xb, H); b.lineTo(xt, horizon); b.stroke();
      // 木纹
      b.strokeStyle = 'rgba(255,222,176,0.045)';
      b.beginPath();
      b.moveTo(xb + 3, H);
      b.quadraticCurveTo(xb + (xt - xb) * 0.5 + 8, (H + horizon) / 2, xt + 2, horizon);
      b.stroke();
    }
    // 地面反光：窗光与宫灯
    b.save();
    b.globalCompositeOperation = 'lighter';
    const winGlow = fire ? 'rgba(255,132,64,0.16)' : night ? 'rgba(126,164,200,0.10)' : hexA(p2.glow, 0.09);
    const spill = b.createLinearGradient(0, horizon, 0, H);
    spill.addColorStop(0, winGlow);
    spill.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = spill;
    b.beginPath();
    b.moveTo(W * 0.50, horizon);
    b.lineTo(W * 0.93, horizon);
    b.lineTo(W * 1.02, H);
    b.lineTo(W * 0.40, H);
    b.closePath(); b.fill();
    // 窗棂的影子
    b.strokeStyle = 'rgba(0,0,0,0.18)';
    b.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const sx0 = W * (0.52 + i * 0.11);
      b.beginPath();
      b.moveTo(sx0, horizon);
      b.lineTo(sx0 - W * 0.05 + i * W * 0.002, H);
      b.stroke();
    }
    // 宫灯的暖光
    const lampG = b.createRadialGradient(W * 0.4, H * 0.86, 4, W * 0.4, H * 0.86, W * 0.3);
    lampG.addColorStop(0, fire ? 'rgba(255,150,80,0.16)' : 'rgba(255,196,120,0.12)');
    lampG.addColorStop(1, 'rgba(255,180,100,0)');
    b.fillStyle = lampG;
    b.beginPath(); b.ellipse(W * 0.4, H * 0.88, W * 0.3, H * 0.16, 0, 0, 6.3); b.fill();
    b.restore();

    // 巨大楠木画案
    const dy = H * 0.735, deskL = W * 0.075, deskR = W * 0.925, deskW = deskR - deskL;
    // 案下阴影
    b.fillStyle = 'rgba(0,0,0,0.34)';
    b.beginPath();
    b.ellipse((deskL + deskR) / 2, H * 0.925, deskW * 0.52, H * 0.06, 0, 0, 6.3);
    b.fill();
    // 案腿与横枨
    const legCol = fire ? '#2e1a14' : night ? '#221812' : '#4c3322';
    const legHi = fire ? '#5c3224' : night ? '#3a2a20' : '#6e4c31';
    for (const lx of [W * 0.135, W * 0.735]) {
      b.fillStyle = legCol;
      b.fillRect(lx, dy + H * 0.048, W * 0.03, H * 0.15);
      b.fillStyle = legHi;
      b.fillRect(lx, dy + H * 0.048, W * 0.007, H * 0.15);
      b.fillStyle = 'rgba(0,0,0,0.25)';
      b.fillRect(lx + W * 0.022, dy + H * 0.048, W * 0.008, H * 0.15);
      // 腿脚
      b.fillStyle = legCol;
      b.fillRect(lx - W * 0.004, dy + H * 0.19, W * 0.038, H * 0.012);
    }
    b.fillStyle = legCol;
    b.fillRect(W * 0.15, dy + H * 0.155, W * 0.57, H * 0.012);
    b.fillStyle = 'rgba(255,226,184,0.08)';
    b.fillRect(W * 0.15, dy + H * 0.155, W * 0.57, 1.2);
    // 牙板：云纹
    b.fillStyle = legCol;
    b.fillRect(deskL + W * 0.02, dy + H * 0.044, deskW - W * 0.04, H * 0.022);
    b.strokeStyle = hexA('#e2c493', fire ? 0.16 : 0.22);
    b.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      const ax = deskL + W * 0.055 + i * W * 0.058;
      b.beginPath();
      b.arc(ax, dy + H * 0.056, W * 0.011, Math.PI * 0.15, Math.PI * 0.85);
      b.stroke();
    }
    // 案面
    const topG = b.createLinearGradient(0, dy, 0, dy + H * 0.048);
    topG.addColorStop(0, fire ? '#7a4a30' : night ? '#4e3a2a' : '#a87a4c');
    topG.addColorStop(0.35, fire ? '#5e3624' : night ? '#3e2c20' : '#8e6339');
    topG.addColorStop(1, fire ? '#3e241a' : night ? '#2a1e16' : '#5f4028');
    b.fillStyle = topG;
    b.fillRect(deskL, dy, deskW, H * 0.048);
    b.fillStyle = 'rgba(255,238,206,0.16)';
    b.fillRect(deskL, dy, deskW, 2.2);
    b.fillStyle = 'rgba(0,0,0,0.3)';
    b.fillRect(deskL, dy + H * 0.046, deskW, H * 0.005);
    // 案面木纹
    b.strokeStyle = 'rgba(255,224,180,0.06)';
    b.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const yy = dy + H * (0.008 + i * 0.006);
      b.beginPath();
      b.moveTo(deskL + 8, yy);
      b.bezierCurveTo(W * 0.35, yy - 1.5, W * 0.62, yy + 1.5, deskR - 8, yy);
      b.stroke();
    }

    // 案上：十余丈生绢长卷
    const paperL = W * 0.155, paperR = W * 0.755, paperY = dy - H * 0.001;
    b.fillStyle = 'rgba(0,0,0,0.22)';
    b.fillRect(paperL + 3, paperY + 2, paperR - paperL, H * 0.026);
    const silkG = b.createLinearGradient(0, paperY - H * 0.03, 0, paperY + H * 0.02);
    silkG.addColorStop(0, fire ? '#c8a882' : night ? '#8d8272' : '#efe3c8');
    silkG.addColorStop(1, fire ? '#a3805c' : night ? '#6e6558' : '#d9c9a8');
    b.fillStyle = silkG;
    b.fillRect(paperL, paperY - H * 0.03, paperR - paperL, H * 0.03);
    b.strokeStyle = 'rgba(120,96,66,0.5)'; b.lineWidth = 1;
    b.strokeRect(paperL, paperY - H * 0.03, paperR - paperL, H * 0.03);
    // 卷中青绿山水
    b.save();
    b.beginPath();
    b.rect(paperL + 2, paperY - H * 0.03, paperR - paperL - 4, H * 0.03);
    b.clip();
    const alpha = fire ? 0.5 : night ? 0.4 : 0.6;
    b.fillStyle = `rgba(70,116,108,${alpha * 0.4})`;
    b.beginPath();
    b.moveTo(paperL, paperY - H * 0.006);
    b.bezierCurveTo(W * 0.3, paperY - H * 0.034, W * 0.4, paperY - H * 0.004, W * 0.5, paperY - H * 0.022);
    b.bezierCurveTo(W * 0.6, paperY - H * 0.038, W * 0.68, paperY - H * 0.012, paperR, paperY - H * 0.03);
    b.lineTo(paperR, paperY); b.lineTo(paperL, paperY); b.closePath(); b.fill();
    b.strokeStyle = `rgba(44,86,86,${alpha * 0.7})`;
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(paperL + 10, paperY - H * 0.008);
    b.bezierCurveTo(W * 0.32, paperY - H * 0.02, W * 0.46, paperY - H * 0.006, W * 0.58, paperY - H * 0.016);
    b.bezierCurveTo(W * 0.68, paperY - H * 0.026, W * 0.72, paperY - H * 0.006, paperR - 10, paperY - H * 0.012);
    b.stroke();
    // 江面留白
    b.strokeStyle = 'rgba(230,224,206,0.5)';
    b.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const sx0 = W * (0.22 + i * 0.07);
      b.beginPath(); b.moveTo(sx0, paperY - H * 0.008); b.lineTo(sx0 + W * 0.03, paperY - H * 0.009); b.stroke();
    }
    // 朱印
    b.fillStyle = 'rgba(172,52,40,0.7)';
    b.fillRect(paperR - W * 0.035, paperY - H * 0.022, W * 0.012, W * 0.012);
    b.restore();
    // 两端卷轴与玉轴头
    for (const rx of [paperL - W * 0.012, paperR]) {
      b.fillStyle = '#6f4a2e';
      b.fillRect(rx, paperY - H * 0.034, W * 0.016, H * 0.038);
      b.fillStyle = 'rgba(255,230,190,0.18)';
      b.fillRect(rx + 2, paperY - H * 0.034, 2, H * 0.038);
      b.fillStyle = '#b8c8bc';
      b.fillRect(rx - W * 0.002, paperY - H * 0.037, W * 0.02, H * 0.007);
    }
    // 镇纸
    for (const wx0 of [paperL + W * 0.03, paperR - W * 0.075]) {
      b.fillStyle = '#2c3634';
      b.fillRect(wx0, paperY - H * 0.036, W * 0.035, H * 0.008);
      b.fillStyle = 'rgba(190,210,196,0.25)';
      b.fillRect(wx0 + 2, paperY - H * 0.036, W * 0.03, 1.4);
    }

    // 白瓷颜料碟
    const dishY = dy + H * 0.012;
    const pigments = ['#3f6e86', '#4e7e52', '#9a5a34', '#a63c30'];
    for (let i = 0; i < 4; i++) {
      const dx0 = W * (0.18 + i * 0.068);
      b.fillStyle = 'rgba(244,240,228,0.72)';
      b.beginPath(); b.ellipse(dx0, dishY, W * 0.021, H * 0.008, 0, 0, 6.3); b.fill();
      b.strokeStyle = 'rgba(150,140,120,0.6)'; b.lineWidth = 1; b.stroke();
      b.fillStyle = pigments[i];
      b.beginPath(); b.ellipse(dx0, dishY, W * 0.010, H * 0.004, 0, 0, 6.3); b.fill();
    }
    // 研钵与杵
    const my = dy + H * 0.004;
    b.fillStyle = '#7f9a84';
    b.beginPath(); b.ellipse(W * 0.468, my, W * 0.018, H * 0.012, 0, 0, 6.3); b.fill();
    b.fillStyle = '#5e7c68';
    b.beginPath(); b.ellipse(W * 0.468, my - H * 0.002, W * 0.013, H * 0.008, 0, 0, 6.3); b.fill();
    b.strokeStyle = '#8aa890'; b.lineWidth = 2.2;
    b.beginPath(); b.moveTo(W * 0.478, my); b.lineTo(W * 0.49, my - H * 0.028); b.stroke();
    // 笔山与毛笔
    b.fillStyle = '#6a4a30';
    b.fillRect(W * 0.78, dy + H * 0.006, W * 0.075, H * 0.008);
    b.fillStyle = '#5a3c26';
    b.fillRect(W * 0.78, dy + H * 0.006, W * 0.075, 2);
    for (let i = 0; i < 6; i++) {
      const bx0 = W * (0.792 + i * 0.011);
      b.strokeStyle = '#d8c8a8';
      b.lineWidth = 1.6;
      b.beginPath(); b.moveTo(bx0, dy + H * 0.006); b.lineTo(bx0 + W * 0.004, dy - H * 0.042); b.stroke();
      b.fillStyle = '#2e2620';
      b.beginPath(); b.ellipse(bx0 + W * 0.004, dy - H * 0.043, 1.6, 4, -0.2, 0, 6.3); b.fill();
    }
    // 揉皱的宣纸
    for (let i = 0; i < 3; i++) {
      const cx0 = W * (0.645 + i * 0.026), cy0 = dy + H * 0.004 + (i % 2) * H * 0.006;
      b.fillStyle = 'rgba(238,232,214,0.6)';
      b.beginPath();
      b.ellipse(cx0, cy0, W * 0.015, H * 0.009, i * 0.7, 0, 6.3);
      b.fill();
      b.strokeStyle = 'rgba(150,140,118,0.45)';
      b.lineWidth = 0.8;
      b.beginPath(); b.ellipse(cx0, cy0, W * 0.015, H * 0.009, i * 0.7, 0, 6.3); b.stroke();
      b.beginPath(); b.moveTo(cx0 - W * 0.008, cy0 - 2); b.lineTo(cx0 + W * 0.006, cy0 + 2); b.stroke();
    }
    // 砚台与印章
    b.fillStyle = '#2a2a2c';
    b.fillRect(W * 0.712, dy + H * 0.008, W * 0.03, H * 0.014);
    b.fillStyle = 'rgba(120,140,140,0.22)';
    b.fillRect(W * 0.715, dy + H * 0.011, W * 0.024, H * 0.006);
    b.fillStyle = '#8a4436';
    b.fillRect(W * 0.755, dy + H * 0.006, W * 0.012, H * 0.016);
    b.fillStyle = 'rgba(255,220,200,0.3)';
    b.fillRect(W * 0.755, dy + H * 0.018, W * 0.012, 1.4);
  };

  /* ============================================================
     《漩涡与深蓝：星月夜的回响》场景
     巴黎铸造厂沙龙 · 红木书房 · 雨夜街角 · 普罗旺斯庄园
     ============================================================ */

  // 将《星月夜》原图嵌进画布；mirror 用于“逆向漩涡”的真迹
  function paintStarry(b, x, y, w, h, mirror = false) {
    b.save();
    b.beginPath(); b.rect(x, y, w, h); b.clip();
    if (starryReady && starry.width) {
      const s = Math.max(w / starry.width, h / starry.height);
      const dw = starry.width * s, dh = starry.height * s;
      if (mirror) {
        b.translate(x + w / 2, 0);
        b.scale(-1, 1);
        b.translate(-(x + w / 2), 0);
      }
      b.drawImage(starry, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    } else {
      // 原图载入前的一帧程序化夜空，避免出现空框
      const g = b.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#101a4a');
      g.addColorStop(0.45, '#243b86');
      g.addColorStop(1, '#0b1030');
      b.fillStyle = g; b.fillRect(x, y, w, h);
      b.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const cy = y + h * (0.1 + i * 0.115);
        b.strokeStyle = `rgba(${120 + i * 8},${150 + i * 6},230,0.42)`;
        b.lineWidth = Math.max(1.2, w * 0.005);
        b.beginPath();
        b.moveTo(x - w * 0.04, cy);
        b.bezierCurveTo(x + w * 0.3, cy - h * 0.1, x + w * 0.62, cy + h * 0.1, x + w * 1.04, cy - h * 0.04);
        b.stroke();
      }
      for (let i = 0; i < 11; i++) {
        const sx = x + w * (0.08 + (((i * 37) % 90) / 100) * 0.82);
        const sy = y + h * (0.09 + (((i * 53) % 62) / 100) * 0.5);
        const rr = Math.max(1.4, w * 0.011);
        const gg = b.createRadialGradient(sx, sy, 0, sx, sy, rr * 3.4);
        gg.addColorStop(0, 'rgba(255,234,150,0.95)');
        gg.addColorStop(0.35, 'rgba(255,222,120,0.5)');
        gg.addColorStop(1, 'rgba(255,214,110,0)');
        b.fillStyle = gg;
        b.beginPath(); b.arc(sx, sy, rr * 3.4, 0, 6.3); b.fill();
      }
      b.fillStyle = '#0a0f18';
      b.beginPath();
      b.moveTo(x + w * 0.22, y + h);
      b.quadraticCurveTo(x + w * 0.16, y + h * 0.62, x + w * 0.24, y + h * 0.3);
      b.quadraticCurveTo(x + w * 0.3, y + h * 0.62, x + w * 0.29, y + h);
      b.closePath(); b.fill();
    }
    // 画面统一的光泽：左上来光，右下压暗
    const sheen = b.createLinearGradient(x, y, x + w, y + h);
    sheen.addColorStop(0, 'rgba(255,242,208,0.10)');
    sheen.addColorStop(0.42, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(8,10,34,0.28)');
    b.fillStyle = sheen;
    b.fillRect(x, y, w, h);
    b.restore();
  }

  function goldFrame(b, x, y, w, h, t, tone = '#8a6a35') {
    const sh = b.createLinearGradient(0, y + h, 0, y + h + t * 2.6);
    sh.addColorStop(0, 'rgba(0,0,0,0.38)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = sh;
    b.fillRect(x - t * 0.3, y + h, w + t * 0.6, t * 2.6);
    const g = b.createLinearGradient(0, y - t, 0, y + h + t);
    g.addColorStop(0, shade(tone, 30));
    g.addColorStop(0.3, tone);
    g.addColorStop(0.72, shade(tone, -20));
    g.addColorStop(1, shade(tone, -10));
    b.fillStyle = g;
    b.fillRect(x - t, y - t, w + t * 2, h + t * 2);
    b.strokeStyle = 'rgba(255,238,196,0.32)';
    b.lineWidth = 1;
    b.strokeRect(x - t + 1, y - t + 1, w + t * 2 - 2, h + t * 2 - 2);
    b.fillStyle = 'rgba(18,12,8,0.62)';
    b.fillRect(x - t * 0.3, y - t * 0.3, w + t * 0.6, h + t * 0.6);
  }

  // 沙龙与庄园墙上的其他藏品：低饱和的印象派小风景
  function smallLandscape(b, x, y, w, h, seed = 1) {
    b.save();
    b.beginPath(); b.rect(x, y, w, h); b.clip();
    const c1 = seed % 2 ? '#7f8a74' : '#8a7a5c';
    const c2 = seed % 3 ? '#5c6b74' : '#6b5a70';
    const sky = b.createLinearGradient(0, y, 0, y + h * 0.64);
    sky.addColorStop(0, shade(c2, 34));
    sky.addColorStop(1, shade(c1, 22));
    b.fillStyle = sky; b.fillRect(x, y, w, h * 0.64);
    b.fillStyle = shade(c1, -12);
    b.beginPath();
    b.moveTo(x, y + h * 0.6);
    b.quadraticCurveTo(x + w * 0.3, y + h * 0.44, x + w * 0.55, y + h * 0.58);
    b.quadraticCurveTo(x + w * 0.8, y + h * 0.68, x + w, y + h * 0.52);
    b.lineTo(x + w, y + h); b.lineTo(x, y + h); b.closePath(); b.fill();
    b.fillStyle = shade(c2, -34);
    b.beginPath();
    b.moveTo(x, y + h * 0.72);
    b.quadraticCurveTo(x + w * 0.35, y + h * 0.6, x + w * 0.62, y + h * 0.74);
    b.quadraticCurveTo(x + w * 0.82, y + h * 0.82, x + w, y + h * 0.7);
    b.lineTo(x + w, y + h); b.lineTo(x, y + h); b.closePath(); b.fill();
    for (let i = 0; i < 2; i++) {
      const tx = x + w * (0.18 + i * 0.5 + (seed % 5) * 0.04);
      b.fillStyle = 'rgba(28,44,30,0.75)';
      b.beginPath();
      b.moveTo(tx, y + h * 0.9);
      b.quadraticCurveTo(tx - w * 0.03, y + h * 0.66, tx, y + h * 0.5 + i * h * 0.04);
      b.quadraticCurveTo(tx + w * 0.03, y + h * 0.66, tx + w * 0.012, y + h * 0.9);
      b.closePath(); b.fill();
    }
    const varnish = b.createLinearGradient(x, y, x + w, y + h);
    varnish.addColorStop(0, 'rgba(255,214,140,0.10)');
    varnish.addColorStop(0.5, 'rgba(60,40,20,0.05)');
    varnish.addColorStop(1, 'rgba(30,20,10,0.22)');
    b.fillStyle = varnish; b.fillRect(x, y, w, h);
    b.restore();
  }

  /* ---------- 场景：巴黎铸造厂艺术沙龙 ---------- */
  function drawSalon(b, p, horizon) {
    const night = state.time === 'night';
    const wall = night ? '#251a1d' : '#3c2b26';
    const wallG = b.createLinearGradient(0, 0, 0, horizon);
    wallG.addColorStop(0, shade(wall, -16));
    wallG.addColorStop(0.6, wall);
    wallG.addColorStop(1, shade(wall, -10));
    b.fillStyle = wallG;
    b.fillRect(0, 0, W, horizon);
    // 工业时代的红砖肌理
    for (let row = 0; row < 30; row++) {
      const y0 = (row / 30) * horizon;
      b.strokeStyle = `rgba(10,6,9,${0.08 + (row % 3) * 0.022})`;
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(0, y0); b.lineTo(W, y0); b.stroke();
      const off = (row % 2) * W * 0.012;
      for (let c = 0; c < 26; c++) {
        const x0 = off + c * W * 0.042;
        b.beginPath(); b.moveTo(x0, y0); b.lineTo(x0, y0 + horizon / 30); b.stroke();
      }
    }
    for (let i = 0; i < 110; i++) {
      b.fillStyle = Math.random() < 0.45
        ? `rgba(255,196,150,${rand(0.008, 0.024)})`
        : `rgba(8,4,8,${rand(0.015, 0.045)})`;
      b.beginPath();
      b.ellipse(Math.random() * W, Math.random() * horizon, rand(7, 44), rand(2, 10), rand(-0.5, 0.5), 0, 6.3);
      b.fill();
    }
    // 顶棚与铸铁桁架
    b.fillStyle = 'rgba(12,10,16,0.94)';
    b.fillRect(0, 0, W, H * 0.075);
    b.strokeStyle = '#1d1a24';
    b.lineWidth = Math.max(5, W * 0.009);
    for (let i = 0; i <= 4; i++) {
      const x0 = W * (0.05 + i * 0.225);
      b.beginPath(); b.moveTo(x0, 0); b.lineTo(x0, H * 0.135); b.stroke();
    }
    b.lineWidth = Math.max(3, W * 0.0045);
    for (let i = 0; i < 4; i++) {
      const x0 = W * (0.05 + i * 0.225), x1 = W * (0.275 + i * 0.225);
      b.beginPath();
      b.moveTo(x0, H * 0.115);
      b.quadraticCurveTo((x0 + x1) / 2, H * 0.012, x1, H * 0.115);
      b.stroke();
      b.fillStyle = 'rgba(120,110,100,0.22)';
      for (let k = 1; k < 8; k++) {
        const tt = k / 8;
        const px = (1 - tt) * (1 - tt) * x0 + 2 * (1 - tt) * tt * (x0 + x1) / 2 + tt * tt * x1;
        const py = (1 - tt) * (1 - tt) * H * 0.115 + 2 * (1 - tt) * tt * H * 0.012 + tt * tt * H * 0.115;
        b.beginPath(); b.arc(px, py, Math.max(0.8, W * 0.0016), 0, 6.3); b.fill();
      }
    }
    // 展墙：深蓝灰的现代独立墙
    const wx = W * 0.155, wy = H * 0.09, ww = W * 0.69, wh = horizon - wy - H * 0.005;
    b.fillStyle = 'rgba(0,0,0,0.32)';
    b.fillRect(wx + W * 0.008, wy + W * 0.008, ww, wh);
    const wg = b.createLinearGradient(wx, wy, wx + ww * 0.25, wy + wh);
    wg.addColorStop(0, night ? '#1e2a3a' : '#3e4a54');
    wg.addColorStop(0.55, night ? '#141d2b' : '#2f3a45');
    wg.addColorStop(1, night ? '#0d141f' : '#242e38');
    b.fillStyle = wg;
    b.fillRect(wx, wy, ww, wh);
    for (let i = 0; i < 80; i++) {
      b.strokeStyle = Math.random() < 0.5 ? 'rgba(220,232,244,0.028)' : 'rgba(4,8,14,0.055)';
      b.lineWidth = rand(0.6, 2);
      const sx = wx + Math.random() * ww;
      b.beginPath(); b.moveTo(sx, wy); b.lineTo(sx + rand(-8, 8), wy + wh); b.stroke();
    }
    b.strokeStyle = 'rgba(235,226,206,0.12)';
    b.lineWidth = Math.max(2, W * 0.0022);
    b.strokeRect(wx, wy, ww, wh);
    for (const px of [wx - W * 0.012, wx + ww - W * 0.004]) {
      const pg = b.createLinearGradient(px, wy, px + W * 0.016, wy);
      pg.addColorStop(0, 'rgba(210,204,190,0.10)');
      pg.addColorStop(1, 'rgba(10,8,12,0.25)');
      b.fillStyle = pg;
      b.fillRect(px, wy, W * 0.016, wh);
    }
    // 主画：《星月夜》变体
    const pw = Math.min(W * 0.335, H * 0.5);
    const ph = pw * 0.79;
    const px = W * 0.5 - pw / 2;
    const py = H * 0.125;
    b.save();
    b.globalCompositeOperation = 'lighter';
    const cone = b.createLinearGradient(0, H * 0.03, 0, py + ph + H * 0.04);
    cone.addColorStop(0, 'rgba(255,226,178,0.16)');
    cone.addColorStop(1, 'rgba(255,226,178,0.02)');
    b.fillStyle = cone;
    b.beginPath();
    b.moveTo(W * 0.47, H * 0.03);
    b.lineTo(W * 0.53, H * 0.03);
    b.lineTo(px + pw + W * 0.07, py + ph + H * 0.05);
    b.lineTo(px - W * 0.07, py + ph + H * 0.05);
    b.closePath(); b.fill();
    b.restore();
    b.fillStyle = '#0c0b0d';
    b.fillRect(px - W * 0.012, py - W * 0.012, pw + W * 0.024, ph + W * 0.024);
    b.strokeStyle = 'rgba(196,160,96,0.35)';
    b.lineWidth = Math.max(1, W * 0.0016);
    b.strokeRect(px - W * 0.012, py - W * 0.012, pw + W * 0.024, ph + W * 0.024);
    paintStarry(b, px, py, pw, ph);
    // 极简黄铜吊灯
    const cy = H * 0.062;
    b.strokeStyle = '#3a3328';
    b.lineWidth = 1.2;
    for (const bx of [W * 0.34, W * 0.66]) {
      b.beginPath(); b.moveTo(bx, 0); b.lineTo(bx, cy); b.stroke();
    }
    b.strokeStyle = '#8c713c';
    b.lineWidth = Math.max(2, W * 0.0035);
    b.beginPath(); b.moveTo(W * 0.30, cy); b.lineTo(W * 0.70, cy); b.stroke();
    for (let i = 0; i < 9; i++) {
      const lx = W * (0.315 + i * 0.046);
      b.strokeStyle = '#6e5628';
      b.lineWidth = 1.2;
      b.beginPath(); b.moveTo(lx, cy); b.lineTo(lx, cy + H * 0.012); b.stroke();
      const lg = b.createRadialGradient(lx, cy + H * 0.016, 0, lx, cy + H * 0.016, W * 0.016);
      lg.addColorStop(0, 'rgba(255,220,150,0.65)');
      lg.addColorStop(1, 'rgba(255,210,130,0)');
      b.fillStyle = lg;
      b.beginPath(); b.arc(lx, cy + H * 0.016, W * 0.016, 0, 6.3); b.fill();
      b.fillStyle = '#ffe7b4';
      b.beginPath(); b.arc(lx, cy + H * 0.014, Math.max(1.2, W * 0.0022), 0, 6.3); b.fill();
    }
    // 左侧拱形铁窗：雨夜的塞纳河与街灯
    for (let i = 0; i < 2; i++) {
      const ax = W * (0.012 + i * 0.068);
      const aw = W * 0.052;
      const ay = H * 0.235;
      const ab = horizon - H * 0.025;
      b.fillStyle = '#0a1220';
      b.beginPath();
      b.moveTo(ax, ab);
      b.lineTo(ax, ay + aw * 0.5);
      b.arc(ax + aw / 2, ay + aw * 0.5, aw / 2, Math.PI, 0);
      b.lineTo(ax + aw, ab);
      b.closePath();
      b.fill();
      b.save();
      b.beginPath();
      b.moveTo(ax + 2, ab - 2);
      b.lineTo(ax + 2, ay + aw * 0.5);
      b.arc(ax + aw / 2, ay + aw * 0.5, aw / 2 - 2, Math.PI, 0);
      b.lineTo(ax + aw - 2, ab - 2);
      b.closePath();
      b.clip();
      const gl = b.createLinearGradient(0, ay, 0, ab);
      gl.addColorStop(0, '#2a3c5e');
      gl.addColorStop(0.5, '#1b2b46');
      gl.addColorStop(1, '#101a2c');
      b.fillStyle = gl;
      b.fillRect(ax, ay, aw, ab - ay);
      for (let k = 0; k < 7; k++) {
        const lx = ax + rand(0.1, 0.9) * aw;
        const ly = ay + rand(0.35, 0.95) * (ab - ay);
        const lg = b.createRadialGradient(lx, ly, 0, lx, ly, aw * 0.18);
        lg.addColorStop(0, `rgba(255,206,140,${rand(0.15, 0.4)})`);
        lg.addColorStop(1, 'rgba(255,206,140,0)');
        b.fillStyle = lg;
        b.beginPath(); b.arc(lx, ly, aw * 0.18, 0, 6.3); b.fill();
      }
      for (let k = 0; k < 26; k++) {
        b.fillStyle = `rgba(210,226,255,${rand(0.05, 0.18)})`;
        b.beginPath();
        b.arc(ax + Math.random() * aw, ay + Math.random() * (ab - ay), rand(0.5, 1.6), 0, 6.3);
        b.fill();
      }
      b.restore();
      b.strokeStyle = 'rgba(28,24,26,0.9)';
      b.lineWidth = Math.max(1.5, W * 0.0022);
      b.beginPath(); b.moveTo(ax + aw / 2, ay); b.lineTo(ax + aw / 2, ab); b.stroke();
      for (let k = 1; k < 4; k++) {
        const yy = ay + (ab - ay) * (0.3 + k * 0.18);
        b.beginPath(); b.moveTo(ax, yy); b.lineTo(ax + aw, yy); b.stroke();
      }
      b.strokeStyle = 'rgba(190,150,120,0.14)';
      b.lineWidth = 1.4;
      b.beginPath(); b.arc(ax + aw / 2, ay + aw * 0.5, aw / 2 + 3, Math.PI, 0); b.stroke();
    }
    // 右侧拱门：通往书房的暖光走廊
    const dx0 = W * 0.875, dw0 = W * 0.10, dy0 = H * 0.19, db0 = horizon - H * 0.005;
    b.fillStyle = '#0a0708';
    b.beginPath();
    b.moveTo(dx0, db0); b.lineTo(dx0, dy0 + dw0 / 2);
    b.arc(dx0 + dw0 / 2, dy0 + dw0 / 2, dw0 / 2, Math.PI, 0);
    b.lineTo(dx0 + dw0, db0); b.closePath(); b.fill();
    b.save();
    b.beginPath();
    b.moveTo(dx0 + 3, db0);
    b.lineTo(dx0 + 3, dy0 + dw0 / 2);
    b.arc(dx0 + dw0 / 2, dy0 + dw0 / 2, dw0 / 2 - 3, Math.PI, 0);
    b.lineTo(dx0 + dw0 - 3, db0);
    b.closePath(); b.clip();
    const dg = b.createLinearGradient(0, dy0, 0, db0);
    dg.addColorStop(0, 'rgba(58,30,16,0.95)');
    dg.addColorStop(0.7, 'rgba(120,62,30,0.85)');
    dg.addColorStop(1, 'rgba(168,94,44,0.6)');
    b.fillStyle = dg; b.fillRect(dx0, dy0, dw0, db0 - dy0);
    b.fillStyle = 'rgba(30,16,10,0.9)';
    b.fillRect(dx0 + dw0 * 0.3, dy0 + dw0 * 0.55, dw0 * 0.4, (db0 - dy0) * 0.62);
    b.fillStyle = 'rgba(255,196,120,0.20)';
    b.beginPath(); b.ellipse(dx0 + dw0 * 0.5, db0 - 2, dw0 * 0.3, H * 0.012, 0, 0, 6.3); b.fill();
    b.restore();
    b.strokeStyle = 'rgba(190,164,132,0.20)';
    b.lineWidth = Math.max(3, W * 0.004);
    b.beginPath();
    b.moveTo(dx0, db0); b.lineTo(dx0, dy0 + dw0 / 2);
    b.arc(dx0 + dw0 / 2, dy0 + dw0 / 2, dw0 / 2 + 1, Math.PI, 0);
    b.lineTo(dx0 + dw0, db0);
    b.stroke();
  }
  // 沙龙地面、宾客与隔离绳：必须画在地面渐变之后
  drawSalon.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const pw = Math.min(W * 0.335, H * 0.5);
    const px = W * 0.5 - pw / 2;
    const fg = b.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, night ? '#1d1416' : '#3a2a20');
    fg.addColorStop(1, night ? '#0f0b0d' : '#221812');
    b.fillStyle = fg;
    b.fillRect(0, horizon, W, H - horizon);
    b.strokeStyle = 'rgba(8,5,6,0.32)';
    b.lineWidth = 1;
    for (let i = -14; i <= 14; i++) {
      const bx2 = W * 0.5 + i * W * 0.085;
      b.beginPath(); b.moveTo(W * 0.5 + (bx2 - W * 0.5) * 0.04, horizon); b.lineTo(bx2, H); b.stroke();
    }
    for (let k = 1; k <= 8; k++) {
      const y = horizon + (H - horizon) * Math.pow(k / 8, 1.7);
      b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke();
    }
    b.save();
    b.globalCompositeOperation = 'lighter';
    const refl = b.createLinearGradient(0, horizon, 0, H * 0.99);
    refl.addColorStop(0, 'rgba(112,146,220,0.10)');
    refl.addColorStop(0.45, 'rgba(112,146,220,0.025)');
    refl.addColorStop(1, 'rgba(112,146,220,0)');
    b.fillStyle = refl;
    b.fillRect(px - W * 0.03, horizon, pw + W * 0.06, H * 0.38);
    for (let i = 0; i < 7; i++) {
      const lx = W * (0.18 + i * 0.105);
      const lg = b.createRadialGradient(lx, horizon + H * 0.012, 0, lx, horizon + H * 0.012, W * 0.055);
      lg.addColorStop(0, 'rgba(255,208,150,0.055)');
      lg.addColorStop(1, 'rgba(255,208,150,0)');
      b.fillStyle = lg;
      b.beginPath(); b.ellipse(lx, horizon + H * 0.012, W * 0.055, H * 0.018, 0, 0, 6.3); b.fill();
    }
    // 右侧书房的暖光洒在门口地砖上
    const spill = b.createLinearGradient(W * 0.875, horizon, W * 0.875, H);
    spill.addColorStop(0, 'rgba(230,150,84,0.10)');
    spill.addColorStop(1, 'rgba(230,150,84,0)');
    b.fillStyle = spill;
    b.beginPath();
    b.moveTo(W * 0.845, horizon);
    b.lineTo(W * 0.985, horizon);
    b.lineTo(W * 1.02, H);
    b.lineTo(W * 0.80, H);
    b.closePath(); b.fill();
    b.restore();
    // 衣香鬓影：远处的宾客剪影，压得很低，避免抢人物
    b.save();
    for (let i = 0; i < 9; i++) {
      const gx = W * (0.08 + i * 0.105) + rand(-W * 0.012, W * 0.012);
      if (gx > W * 0.30 && gx < W * 0.70) continue;
      const gh = H * rand(0.17, 0.23);
      const gy = horizon + H * 0.015;
      const a = rand(0.16, 0.3);
      b.fillStyle = `rgba(9,7,14,${a})`;
      b.beginPath();
      b.ellipse(gx, gy - gh * 0.36, gh * 0.135, gh * 0.34, 0, 0, 6.3);
      b.fill();
      b.beginPath();
      b.arc(gx, gy - gh * 0.78, gh * 0.082, 0, 6.3);
      b.fill();
      if (i % 3 === 0) {
        b.fillStyle = 'rgba(255,228,170,0.35)';
        b.beginPath(); b.arc(gx + gh * 0.11, gy - gh * 0.48, Math.max(0.7, gh * 0.008), 0, 6.3); b.fill();
      }
    }
    b.restore();
    // 天鹅绒隔离绳
    const ropeY = horizon - H * 0.065;
    for (const sx of [W * 0.285, W * 0.715]) {
      b.strokeStyle = '#8f7138';
      b.lineWidth = Math.max(2, W * 0.0032);
      b.beginPath(); b.moveTo(sx, horizon + H * 0.004); b.lineTo(sx, ropeY); b.stroke();
      b.fillStyle = '#a98a4c';
      b.beginPath(); b.ellipse(sx, horizon + H * 0.006, W * 0.012, H * 0.004, 0, 0, 6.3); b.fill();
      b.beginPath(); b.arc(sx, ropeY, Math.max(2, W * 0.0045), 0, 6.3); b.fill();
    }
    b.strokeStyle = 'rgba(146,32,42,0.9)';
    b.lineWidth = Math.max(2.4, W * 0.004);
    b.beginPath();
    b.moveTo(W * 0.285, ropeY);
    b.quadraticCurveTo(W * 0.5, ropeY + H * 0.032, W * 0.715, ropeY);
    b.stroke();
    b.strokeStyle = 'rgba(255,150,150,0.18)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(W * 0.285, ropeY - 1);
    b.quadraticCurveTo(W * 0.5, ropeY + H * 0.031, W * 0.715, ropeY - 1);
    b.stroke();
  };

  /* ---------- 场景：红木书房（凶案现场） ---------- */
  function drawStudy(b, p, horizon) {
    const night = state.time === 'night';
    const wood = night ? '#2a1b16' : '#4a3125';
    const wallG = b.createLinearGradient(0, 0, 0, horizon);
    wallG.addColorStop(0, shade(wood, -18));
    wallG.addColorStop(0.55, wood);
    wallG.addColorStop(1, shade(wood, -10));
    b.fillStyle = wallG;
    b.fillRect(0, 0, W, horizon);
    // 护墙板竖缝与木纹
    for (let i = 0; i < 24; i++) {
      const x = (i / 24) * W;
      b.strokeStyle = 'rgba(8,5,4,0.32)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(x, 0); b.lineTo(x, horizon); b.stroke();
      b.strokeStyle = 'rgba(255,214,168,0.035)';
      b.beginPath(); b.moveTo(x + 2, 0); b.lineTo(x + 2, horizon); b.stroke();
    }
    for (let i = 0; i < 70; i++) {
      b.strokeStyle = `rgba(255,206,160,${rand(0.012, 0.035)})`;
      b.lineWidth = rand(0.5, 1.2);
      const yy = Math.random() * horizon;
      b.beginPath();
      b.moveTo(Math.random() * W, yy);
      b.bezierCurveTo(rand(0, W), yy + rand(-6, 6), rand(0, W), yy + rand(-6, 6), Math.random() * W, yy + rand(-4, 4));
      b.stroke();
    }
    // 顶棚横梁
    b.fillStyle = shade(wood, -26);
    b.fillRect(0, 0, W, H * 0.07);
    b.fillStyle = 'rgba(255,220,170,0.05)';
    b.fillRect(0, H * 0.065, W, 2);
    for (let i = 0; i < 3; i++) {
      b.fillStyle = 'rgba(8,5,4,0.5)';
      b.fillRect(W * (0.18 + i * 0.32), 0, W * 0.012, H * 0.07);
    }
    // 左侧整墙书柜
    const bx0 = W * 0.012, bw0 = W * 0.275, by0 = H * 0.10, bb0 = horizon - H * 0.02;
    b.fillStyle = 'rgba(0,0,0,0.35)';
    b.fillRect(bx0 + 6, by0 + 8, bw0, bb0 - by0);
    b.fillStyle = shade(wood, -14);
    b.fillRect(bx0, by0, bw0, bb0 - by0);
    b.strokeStyle = 'rgba(255,214,168,0.08)';
    b.lineWidth = 2;
    b.strokeRect(bx0, by0, bw0, bb0 - by0);
    const shelves = 5;
    for (let s = 0; s <= shelves; s++) {
      const sy = by0 + (bb0 - by0) * (s / shelves);
      b.fillStyle = shade(wood, 6);
      b.fillRect(bx0, sy - 2, bw0, 5);
      b.fillStyle = 'rgba(255,220,170,0.10)';
      b.fillRect(bx0, sy - 2, bw0, 1.2);
    }
    const spines = ['#5b2c28', '#38402c', '#2c3a4c', '#6b5430', '#3a2b38', '#4b3a22', '#24343a'];
    for (let s = 0; s < shelves; s++) {
      const yTop = by0 + (bb0 - by0) * (s / shelves) + 4;
      const yBot = by0 + (bb0 - by0) * ((s + 1) / shelves) - 6;
      let x = bx0 + 6;
      while (x < bx0 + bw0 - 8) {
        const bw = W * rand(0.006, 0.014);
        const bh = (yBot - yTop) * rand(0.72, 0.97);
        b.fillStyle = spines[Math.floor(Math.random() * spines.length)];
        b.fillRect(x, yBot - bh, bw, bh);
        b.fillStyle = 'rgba(255,220,160,0.14)';
        b.fillRect(x, yBot - bh, bw, 1);
        if (Math.random() < 0.18) {
          b.fillStyle = 'rgba(210,180,120,0.35)';
          b.fillRect(x + bw * 0.2, yBot - bh * 0.7, bw * 0.6, 1.2);
        }
        x += bw + 1.5;
      }
    }
    // 滚动木梯
    b.save();
    b.strokeStyle = shade(wood, 14);
    b.lineWidth = Math.max(2, W * 0.003);
    b.beginPath(); b.moveTo(bx0 + bw0 * 0.72, by0 - H * 0.01); b.lineTo(bx0 + bw0 * 0.60, bb0); b.stroke();
    b.beginPath(); b.moveTo(bx0 + bw0 * 0.86, by0 - H * 0.01); b.lineTo(bx0 + bw0 * 0.74, bb0); b.stroke();
    for (let s = 0; s < 7; s++) {
      const tt = s / 7;
      const x1 = bx0 + bw0 * (0.72 - 0.12 * tt), y1 = by0 - H * 0.01 + (bb0 - by0 + H * 0.01) * tt;
      const x2 = bx0 + bw0 * (0.86 - 0.12 * tt);
      b.lineWidth = Math.max(1.4, W * 0.0022);
      b.beginPath(); b.moveTo(x1, y1); b.lineTo(x2, y1 - 1); b.stroke();
    }
    b.restore();
    // 右侧雨夜长窗
    const wx0 = W * 0.705, ww0 = W * 0.235, wy0 = H * 0.115, wh0 = H * 0.30;
    b.fillStyle = '#0a1220';
    b.fillRect(wx0, wy0, ww0, wh0);
    const skyG = b.createLinearGradient(0, wy0, 0, wy0 + wh0);
    skyG.addColorStop(0, '#17233c');
    skyG.addColorStop(0.6, '#0e1728');
    skyG.addColorStop(1, '#080e18');
    b.fillStyle = skyG;
    b.fillRect(wx0 + 2, wy0 + 2, ww0 - 4, wh0 - 4);
    b.fillStyle = 'rgba(8,10,18,0.85)';
    for (let i = 0; i < 4; i++) {
      const bxx = wx0 + ww0 * (0.05 + i * 0.24);
      const bhh = wh0 * rand(0.35, 0.58);
      b.fillRect(bxx, wy0 + wh0 - bhh, ww0 * 0.2, bhh);
    }
    for (let i = 0; i < 10; i++) {
      const lx = wx0 + rand(0.05, 0.95) * ww0;
      const ly = wy0 + rand(0.45, 0.9) * wh0;
      const lg = b.createRadialGradient(lx, ly, 0, lx, ly, W * 0.018);
      lg.addColorStop(0, `rgba(255,198,120,${rand(0.18, 0.42)})`);
      lg.addColorStop(1, 'rgba(255,198,120,0)');
      b.fillStyle = lg;
      b.beginPath(); b.arc(lx, ly, W * 0.018, 0, 6.3); b.fill();
    }
    b.save();
    b.beginPath(); b.rect(wx0, wy0, ww0, wh0); b.clip();
    b.strokeStyle = 'rgba(190,210,240,0.10)';
    b.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const rx = wx0 + Math.random() * ww0;
      const ry = wy0 + Math.random() * wh0;
      b.beginPath(); b.moveTo(rx, ry); b.lineTo(rx - 3, ry + rand(8, 26)); b.stroke();
    }
    b.restore();
    b.strokeStyle = 'rgba(24,18,16,0.9)';
    b.lineWidth = Math.max(3, W * 0.004);
    b.strokeRect(wx0, wy0, ww0, wh0);
    b.lineWidth = Math.max(2, W * 0.0026);
    b.beginPath(); b.moveTo(wx0 + ww0 / 2, wy0); b.lineTo(wx0 + ww0 / 2, wy0 + wh0); b.stroke();
    for (let k = 1; k < 3; k++) {
      const yy = wy0 + (wh0 * k) / 3;
      b.beginPath(); b.moveTo(wx0, yy); b.lineTo(wx0 + ww0, yy); b.stroke();
    }
    // 厚重的窗帘
    for (const side of [0, 1]) {
      const cx0 = side ? wx0 + ww0 - W * 0.012 : wx0 - W * 0.05;
      const cg = b.createLinearGradient(cx0, 0, cx0 + W * 0.062, 0);
      cg.addColorStop(0, 'rgba(24,14,16,0.9)');
      cg.addColorStop(0.5, 'rgba(58,30,32,0.85)');
      cg.addColorStop(1, 'rgba(20,12,14,0.9)');
      b.fillStyle = cg;
      b.beginPath();
      b.moveTo(cx0, wy0 - H * 0.03);
      b.lineTo(cx0 + W * 0.062, wy0 - H * 0.03);
      b.quadraticCurveTo(cx0 + W * 0.04, wy0 + wh0 * 0.6, cx0 + W * 0.055, bb0);
      b.lineTo(cx0 - W * 0.008, bb0);
      b.closePath(); b.fill();
    }
    b.strokeStyle = '#6e5626';
    b.lineWidth = Math.max(2, W * 0.0026);
    b.beginPath(); b.moveTo(wx0 - W * 0.055, wy0 - H * 0.035); b.lineTo(wx0 + ww0 + W * 0.01, wy0 - H * 0.035); b.stroke();
    // 墙上的小幅普罗旺斯风景
    smallLandscape(b, W * 0.335, H * 0.175, W * 0.085, H * 0.115, 3);
    goldFrame(b, W * 0.335, H * 0.175, W * 0.085, H * 0.115, Math.max(3, W * 0.006), '#6c5228');
    smallLandscape(b, W * 0.45, H * 0.16, W * 0.075, H * 0.10, 5);
    goldFrame(b, W * 0.45, H * 0.16, W * 0.075, H * 0.10, Math.max(3, W * 0.005), '#5c4a28');
  }
  // 地面、地毯、书桌与凶案痕迹：必须画在地面渐变之后
  drawStudy.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    // 地面与波斯地毯
    const fg = b.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, night ? '#1a100e' : '#33231b');
    fg.addColorStop(1, night ? '#0c0707' : '#1c120e');
    b.fillStyle = fg;
    b.fillRect(0, horizon, W, H - horizon);
    b.save();
    b.beginPath();
    b.moveTo(W * 0.20, H * 0.69);
    b.lineTo(W * 0.82, H * 0.69);
    b.lineTo(W * 0.90, H * 0.98);
    b.lineTo(W * 0.12, H * 0.98);
    b.closePath();
    b.fillStyle = 'rgba(52,18,26,0.55)';
    b.fill();
    b.clip();
    b.strokeStyle = 'rgba(146,92,58,0.22)';
    b.lineWidth = 2;
    b.strokeRect(W * 0.23, H * 0.71, W * 0.56, H * 0.25);
    for (let i = 0; i < 28; i++) {
      const rx = W * (0.25 + (i % 7) * 0.08);
      const ry = H * (0.75 + Math.floor(i / 7) * 0.06);
      b.strokeStyle = 'rgba(160,104,64,0.12)';
      b.beginPath(); b.ellipse(rx, ry, W * 0.018, H * 0.012, 0.4, 0, 6.3); b.stroke();
    }
    b.restore();
    // 红木书桌
    const dtx = W * 0.315, dtw = W * 0.44, dty = H * 0.525, dth = H * 0.022;
    const dsh = b.createLinearGradient(0, dty, 0, H * 0.76);
    dsh.addColorStop(0, 'rgba(0,0,0,0.45)');
    dsh.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = dsh;
    b.fillRect(dtx + W * 0.01, dty, dtw - W * 0.02, H * 0.24);
    const dg2 = b.createLinearGradient(0, dty, 0, dty + dth);
    dg2.addColorStop(0, '#4c2a1c');
    dg2.addColorStop(0.45, '#361c12');
    dg2.addColorStop(1, '#24110b');
    b.fillStyle = dg2;
    b.fillRect(dtx, dty, dtw, dth);
    b.fillStyle = 'rgba(255,206,156,0.16)';
    b.fillRect(dtx, dty, dtw, 1.4);
    b.fillStyle = '#2c150e';
    b.fillRect(dtx + W * 0.008, dty + dth, dtw - W * 0.016, H * 0.085);
    for (let i = 0; i < 2; i++) {
      const ddx = dtx + W * (0.035 + i * 0.18);
      b.strokeStyle = 'rgba(0,0,0,0.45)';
      b.strokeRect(ddx, dty + dth + H * 0.012, W * 0.15, H * 0.026);
      b.strokeStyle = 'rgba(210,160,100,0.18)';
      b.strokeRect(ddx + 1, dty + dth + H * 0.012 + 1, W * 0.15 - 2, H * 0.026 - 2);
      b.fillStyle = '#9a7a3e';
      b.beginPath(); b.arc(ddx + W * 0.075, dty + dth + H * 0.025, Math.max(1.2, W * 0.0022), 0, 6.3); b.fill();
    }
    for (const lx of [dtx + W * 0.012, dtx + dtw - W * 0.024]) {
      b.fillStyle = '#1e0e09';
      b.fillRect(lx, dty + dth + H * 0.085, W * 0.012, H * 0.10);
    }
    // 绿罩台灯
    const lampX = dtx + W * 0.055, lampY = dty;
    b.fillStyle = '#a5833c';
    b.beginPath(); b.ellipse(lampX, lampY + 2, W * 0.035, H * 0.010, 0, 0, 6.3); b.fill();
    b.fillStyle = '#8a6a2c';
    b.fillRect(lampX - W * 0.0035, lampY - H * 0.075, W * 0.007, H * 0.075);
    const shadeX = lampX, shadeY = lampY - H * 0.075;
    const lg2 = b.createLinearGradient(shadeX - W * 0.045, 0, shadeX + W * 0.045, 0);
    lg2.addColorStop(0, '#1d3a2a');
    lg2.addColorStop(0.35, '#356b4c');
    lg2.addColorStop(0.55, '#4d8a62');
    lg2.addColorStop(1, '#173322');
    b.fillStyle = lg2;
    b.beginPath();
    b.moveTo(shadeX - W * 0.048, shadeY + H * 0.014);
    b.quadraticCurveTo(shadeX, shadeY - H * 0.018, shadeX + W * 0.048, shadeY + H * 0.014);
    b.lineTo(shadeX + W * 0.038, shadeY + H * 0.026);
    b.lineTo(shadeX - W * 0.038, shadeY + H * 0.026);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(255,236,180,0.35)';
    b.lineWidth = 1;
    b.beginPath(); b.moveTo(shadeX - W * 0.048, shadeY + H * 0.014); b.quadraticCurveTo(shadeX, shadeY - H * 0.018, shadeX + W * 0.048, shadeY + H * 0.014); b.stroke();
    b.save();
    b.globalCompositeOperation = 'lighter';
    const pool = b.createRadialGradient(shadeX, shadeY + H * 0.03, 0, shadeX, shadeY + H * 0.03, W * 0.24);
    pool.addColorStop(0, 'rgba(255,208,124,0.30)');
    pool.addColorStop(0.35, 'rgba(255,196,110,0.12)');
    pool.addColorStop(1, 'rgba(255,190,100,0)');
    b.fillStyle = pool;
    b.beginPath(); b.ellipse(shadeX, dty + H * 0.01, W * 0.26, H * 0.11, 0, 0, 6.3); b.fill();
    b.restore();
    // 桌面文件
    b.save();
    b.translate(dtx + W * 0.20, dty + H * 0.004);
    b.rotate(-0.06);
    b.fillStyle = 'rgba(226,214,190,0.92)';
    b.fillRect(0, 0, W * 0.115, H * 0.055);
    b.strokeStyle = 'rgba(120,104,80,0.6)';
    b.lineWidth = 1;
    b.strokeRect(0, 0, W * 0.115, H * 0.055);
    for (let i = 0; i < 4; i++) {
      b.strokeStyle = 'rgba(90,80,66,0.35)';
      b.beginPath(); b.moveTo(W * 0.012, H * 0.012 + i * H * 0.009); b.lineTo(W * 0.10, H * 0.012 + i * H * 0.009); b.stroke();
    }
    b.restore();
    // 倒下的酒杯与酒渍
    const wgx = dtx + W * 0.33, wgy = dty + H * 0.008;
    b.save();
    b.translate(wgx, wgy);
    b.rotate(1.35);
    b.fillStyle = 'rgba(196,214,220,0.30)';
    b.beginPath(); b.ellipse(0, 0, W * 0.026, H * 0.008, 0, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(230,240,248,0.45)';
    b.lineWidth = 1;
    b.beginPath(); b.ellipse(0, 0, W * 0.026, H * 0.008, 0, 0, 6.3); b.stroke();
    b.beginPath(); b.moveTo(-W * 0.012, 0); b.lineTo(-W * 0.012, -H * 0.03); b.quadraticCurveTo(0, -H * 0.042, W * 0.012, -H * 0.03); b.lineTo(W * 0.012, 0); b.stroke();
    b.restore();
    b.fillStyle = 'rgba(96,14,22,0.55)';
    b.beginPath(); b.ellipse(wgx + W * 0.03, wgy + H * 0.006, W * 0.05, H * 0.012, 0.15, 0, 6.3); b.fill();
    // 地毯上的血迹与碎玻璃：暗红积血 + 湿润反光 + 有棱角的玻璃碴
    b.fillStyle = 'rgba(52,4,8,0.62)';
    b.beginPath(); b.ellipse(W * 0.585, H * 0.735, W * 0.065, H * 0.016, -0.1, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(92,10,16,0.42)';
    b.beginPath(); b.ellipse(W * 0.602, H * 0.740, W * 0.046, H * 0.011, -0.1, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(40,2,6,0.5)';
    b.beginPath(); b.ellipse(W * 0.575, H * 0.737, W * 0.028, H * 0.007, -0.1, 0, 6.3); b.fill();
    // 血泊表面的湿润高光：只两道很窄的弧，避开卡通感
    b.strokeStyle = 'rgba(178,58,58,0.30)';
    b.lineWidth = Math.max(1, W * 0.0012);
    b.beginPath();
    b.ellipse(W * 0.596, H * 0.7375, W * 0.038, H * 0.0075, -0.1, 3.5, 5.9);
    b.stroke();
    b.strokeStyle = 'rgba(220,140,130,0.16)';
    b.beginPath();
    b.ellipse(W * 0.600, H * 0.7385, W * 0.020, H * 0.0040, -0.1, 3.7, 5.5);
    b.stroke();
    // 碎玻璃：薄薄一片片贴在地毯上，只借灯光闪一下，不立起来
    for (let i = 0; i < 8; i++) {
      const a = rand(0, 6.3);
      const rr = rand(0.012, 0.075);
      const gx = W * 0.600 + Math.cos(a) * W * rr;
      const gy = H * 0.742 + Math.sin(a) * H * rr * 0.26;
      const s = W * rand(0.0035, 0.0085);
      const rot = rand(-0.9, 0.9);
      b.save();
      b.translate(gx, gy);
      b.rotate(rot);
      b.scale(1, 0.42);
      b.fillStyle = `rgba(176,198,214,${rand(0.10, 0.24)})`;
      b.beginPath();
      b.moveTo(0, -s * 0.55);
      b.lineTo(s * 0.95, s * 0.42);
      b.lineTo(-s * 0.80, s * 0.30);
      b.closePath(); b.fill();
      b.strokeStyle = `rgba(234,244,252,${rand(0.14, 0.30)})`;
      b.lineWidth = 0.8;
      b.beginPath();
      b.moveTo(-s * 0.18, -s * 0.10);
      b.lineTo(s * 0.52, s * 0.20);
      b.stroke();
      b.restore();
    }
    // 倒下的青铜雕塑：侧卧的小型舞者像，翻倒的木底座与接地阴影
    b.save();
    b.translate(W * 0.700, H * 0.800);
    b.rotate(-0.30);
    // 接地软阴影
    b.fillStyle = 'rgba(0,0,0,0.38)';
    b.beginPath(); b.ellipse(0, H * 0.012, W * 0.058, H * 0.011, 0, 0, 6.3); b.fill();
    // 翻倒的深色木底座（透视菱形）
    b.fillStyle = '#1e1408';
    b.beginPath();
    b.moveTo(-W * 0.054, -H * 0.002);
    b.lineTo(-W * 0.026, -H * 0.021);
    b.lineTo(W * 0.010, -H * 0.015);
    b.lineTo(-W * 0.016, H * 0.005);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(150,112,56,0.35)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(-W * 0.026, -H * 0.021);
    b.lineTo(-W * 0.016, H * 0.005);
    b.stroke();
    const bronze = b.createLinearGradient(-W * 0.02, -H * 0.08, W * 0.03, 0);
    bronze.addColorStop(0, '#8a6a32');
    bronze.addColorStop(0.45, '#5e451e');
    bronze.addColorStop(1, '#2a1d0c');
    // 侧卧的姿态：头、伸出的手臂、躯干、屈起的腿
    b.strokeStyle = bronze;
    b.lineCap = 'round';
    b.lineJoin = 'round';
    b.lineWidth = W * 0.013;
    b.beginPath();
    b.moveTo(-W * 0.030, -H * 0.048);
    b.quadraticCurveTo(-W * 0.010, -H * 0.040, W * 0.006, -H * 0.026);
    b.lineTo(W * 0.020, -H * 0.012);
    b.stroke();
    b.lineWidth = W * 0.009;
    b.beginPath();
    b.moveTo(W * 0.020, -H * 0.012);
    b.quadraticCurveTo(W * 0.036, -H * 0.034, W * 0.050, -H * 0.028);
    b.quadraticCurveTo(W * 0.062, -H * 0.024, W * 0.064, -H * 0.010);
    b.stroke();
    b.lineWidth = W * 0.007;
    b.beginPath();
    b.moveTo(-W * 0.026, -H * 0.046);
    b.quadraticCurveTo(-W * 0.048, -H * 0.060, -W * 0.062, -H * 0.050);
    b.stroke();
    // 头部与发髻
    b.fillStyle = bronze;
    b.beginPath(); b.arc(-W * 0.036, -H * 0.052, W * 0.0105, 0, 6.3); b.fill();
    b.beginPath(); b.arc(-W * 0.046, -H * 0.058, W * 0.0052, 0, 6.3); b.fill();
    // 青铜受光边与铜绿
    b.strokeStyle = 'rgba(226,184,104,0.35)';
    b.lineWidth = Math.max(1, W * 0.0012);
    b.beginPath();
    b.moveTo(-W * 0.032, -H * 0.058);
    b.quadraticCurveTo(-W * 0.012, -H * 0.050, W * 0.002, -H * 0.036);
    b.stroke();
    b.strokeStyle = 'rgba(96,150,124,0.16)';
    b.beginPath();
    b.moveTo(W * 0.008, -H * 0.020);
    b.quadraticCurveTo(W * 0.030, -H * 0.030, W * 0.048, -H * 0.020);
    b.stroke();
    b.restore();
    // 台灯落在画面下缘的暖光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const g = b.createRadialGradient(W * 0.37, H * 0.62, 0, W * 0.37, H * 0.62, W * 0.34);
    g.addColorStop(0, 'rgba(255,198,110,0.10)');
    g.addColorStop(1, 'rgba(255,190,100,0)');
    b.fillStyle = g;
    b.fillRect(0, horizon - H * 0.1, W, H * 0.4);
    b.restore();
  };

  /* ---------- 场景：巴黎雨夜街角（塞纳河 / 报亭） ---------- */
  function drawStreet(b, p, horizon) {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const stone = night ? '#262b3c' : day ? '#8e8880' : '#4a4148';
    // 贴地冷雾
    const mist = b.createLinearGradient(0, horizon - H * 0.2, 0, horizon);
    mist.addColorStop(0, 'rgba(130,150,180,0)');
    mist.addColorStop(1, night ? 'rgba(96,116,156,0.14)' : 'rgba(220,214,210,0.16)');
    b.fillStyle = mist;
    b.fillRect(0, horizon - H * 0.2, W, H * 0.2);

    // 雨夜的月亮：被薄云滤过，只留一圈晕
    if (night) {
      const mx = W * 0.135, my = H * 0.115, mr = Math.min(W, H) * 0.030;
      const moonHalo = b.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5.2);
      moonHalo.addColorStop(0, 'rgba(226,232,255,0.20)');
      moonHalo.addColorStop(0.35, 'rgba(208,218,252,0.08)');
      moonHalo.addColorStop(1, 'rgba(198,210,250,0)');
      b.fillStyle = moonHalo;
      b.beginPath(); b.arc(mx, my, mr * 5.2, 0, 6.3); b.fill();
      b.save();
      b.beginPath(); b.arc(mx, my, mr, 0, 6.3); b.clip();
      const disc = b.createRadialGradient(mx - mr * 0.3, my - mr * 0.34, mr * 0.1, mx, my, mr * 1.02);
      disc.addColorStop(0, 'rgba(244,240,224,0.92)');
      disc.addColorStop(0.7, 'rgba(224,222,210,0.86)');
      disc.addColorStop(1, 'rgba(196,200,206,0.78)');
      b.fillStyle = disc;
      b.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      b.fillStyle = 'rgba(150,156,160,0.18)';
      b.beginPath(); b.ellipse(mx + mr * 0.18, my - mr * 0.12, mr * 0.34, mr * 0.22, 0.4, 0, 6.3); b.fill();
      b.restore();
      // 薄云横过月面
      b.save();
      b.globalAlpha = 0.5;
      const veil = b.createLinearGradient(0, my - mr * 0.5, 0, my + mr * 0.9);
      veil.addColorStop(0, 'rgba(46,44,78,0)');
      veil.addColorStop(0.5, 'rgba(52,50,86,0.55)');
      veil.addColorStop(1, 'rgba(46,44,78,0)');
      b.fillStyle = veil;
      b.beginPath();
      b.ellipse(mx, my + mr * 0.3, mr * 3.4, mr * 0.8, -0.06, 0, 6.3);
      b.fill();
      b.restore();
    }

    // 塞纳河：冷铅灰，靠近岸边有几道暖色的灯影
    const riv = b.createLinearGradient(0, horizon - H * 0.15, 0, horizon - H * 0.005);
    riv.addColorStop(0, night ? '#141d30' : '#4a5464');
    riv.addColorStop(0.55, night ? '#1b2c44' : '#5a6674');
    riv.addColorStop(1, night ? '#101a2a' : '#424c5a');
    b.fillStyle = riv;
    b.fillRect(0, horizon - H * 0.15, W * 0.185, H * 0.145);
    for (let i = 0; i < 26; i++) {
      const ry = horizon - H * 0.14 + Math.random() * H * 0.125;
      b.strokeStyle = `rgba(255,206,140,${rand(0.03, 0.14)})`;
      b.lineWidth = rand(0.6, 1.5);
      const rx = Math.random() * W * 0.17;
      b.beginPath(); b.moveTo(rx, ry); b.lineTo(rx + rand(6, 30), ry); b.stroke();
    }
    // 石砌河岸
    b.fillStyle = night ? 'rgba(34,38,50,0.9)' : 'rgba(104,102,102,0.85)';
    b.fillRect(0, horizon - H * 0.016, W * 0.19, H * 0.016);
    b.strokeStyle = 'rgba(8,10,16,0.25)';
    b.lineWidth = 1;
    for (let x = 0; x < W * 0.19; x += W * 0.022) {
      b.beginPath(); b.moveTo(x, horizon - H * 0.016); b.lineTo(x, horizon); b.stroke();
    }
    // 对岸屋顶与灯火
    b.fillStyle = night ? 'rgba(12,16,28,0.92)' : 'rgba(70,66,74,0.7)';
    for (let i = 0; i < 7; i++) {
      const rx = W * (0.002 + i * 0.028);
      const rh = H * rand(0.028, 0.068);
      b.fillRect(rx, horizon - H * 0.15 - rh, W * 0.027, rh);
    }
    for (let i = 0; i < 10; i++) {
      b.fillStyle = `rgba(255,212,150,${rand(0.16, 0.4)})`;
      b.fillRect(rand(0, W * 0.17), horizon - H * rand(0.15, 0.19), 2, 2);
    }

    // 奥斯曼公寓
    for (let i = 0; i < 3; i++) {
      const fx = W * (0.19 + i * 0.143), fw = W * 0.142;
      const ftop = H * (0.185 + (i % 2) * 0.03);
      const fbot = horizon;
      const fg2 = b.createLinearGradient(fx, 0, fx + fw, 0);
      fg2.addColorStop(0, shade(stone, 10));
      fg2.addColorStop(0.55, stone);
      fg2.addColorStop(1, shade(stone, -14));
      b.fillStyle = fg2;
      b.fillRect(fx, ftop, fw, fbot - ftop);
      // 石砌竖缝与雨水痕
      for (let k = 0; k < 4; k++) {
        const vx = fx + (fw * (k + 1)) / 5;
        b.fillStyle = 'rgba(10,12,20,0.10)';
        b.fillRect(vx, ftop, 1, fbot - ftop);
      }
      for (let k = 0; k < 3; k++) {
        const sx2 = fx + fw * rand(0.08, 0.9);
        const sy2 = ftop + H * rand(0.01, 0.1);
        const stain = b.createLinearGradient(0, sy2, 0, sy2 + H * 0.12);
        stain.addColorStop(0, 'rgba(8,10,16,0.12)');
        stain.addColorStop(1, 'rgba(8,10,16,0)');
        b.fillStyle = stain;
        b.fillRect(sx2, sy2, rand(2, 5), H * 0.12);
      }
      // 檐口与楼层腰线
      b.fillStyle = shade(stone, 16);
      b.fillRect(fx, ftop - H * 0.009, fw, H * 0.009);
      b.fillStyle = 'rgba(255,240,214,0.06)';
      b.fillRect(fx, ftop - H * 0.009, fw, 1.2);
      for (let row = 0; row < 3; row++) {
        b.fillStyle = 'rgba(20,20,28,0.13)';
        b.fillRect(fx, ftop + H * (0.045 + row * 0.10), fw, 2);
      }
      // 底层店面：暗色门脸、暖光橱窗、遮阳篷
      const shopTop = fbot - H * 0.088;
      b.fillStyle = night ? '#171a24' : '#2e3038';
      b.fillRect(fx, shopTop, fw, fbot - shopTop);
      const shopWarm = night ? 'rgba(255,198,124,0.62)' : 'rgba(120,126,138,0.35)';
      b.fillStyle = shopWarm;
      b.fillRect(fx + fw * 0.10, shopTop + H * 0.026, fw * 0.34, H * 0.048);
      b.fillRect(fx + fw * 0.56, shopTop + H * 0.026, fw * 0.30, H * 0.048);
      b.fillStyle = 'rgba(10,10,14,0.55)';
      b.fillRect(fx + fw * 0.44, shopTop + H * 0.018, fw * 0.09, H * 0.07);
      // 雨棚
      b.fillStyle = i === 1 ? '#5a2626' : '#243c34';
      b.beginPath();
      b.moveTo(fx + fw * 0.05, shopTop + H * 0.016);
      b.lineTo(fx + fw * 0.42, shopTop + H * 0.016);
      b.lineTo(fx + fw * 0.35, shopTop + H * 0.006);
      b.lineTo(fx + fw * 0.10, shopTop + H * 0.006);
      b.closePath(); b.fill();
      b.strokeStyle = 'rgba(232,220,196,0.16)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(fx, shopTop - 1); b.lineTo(fx + fw, shopTop - 1); b.stroke();
      // 窗与铁艺阳台
      for (let row = 0; row < 3; row++) {
        for (let c = 0; c < 3; c++) {
          const wxx = fx + fw * (0.12 + c * 0.285), wyy = ftop + H * (0.052 + row * 0.10);
          const ww2 = fw * 0.17, wh2 = H * 0.052;
          b.fillStyle = night ? '#0d1320' : '#2e3440';
          b.fillRect(wxx, wyy, ww2, wh2);
          const lit = night && ((i + row * 2 + c) % 5 < 2);
          if (lit) {
            const wl = b.createLinearGradient(wxx, wyy, wxx, wyy + wh2);
            wl.addColorStop(0, 'rgba(255,222,160,0.82)');
            wl.addColorStop(1, 'rgba(206,138,72,0.62)');
            b.fillStyle = wl;
            b.fillRect(wxx, wyy, ww2, wh2);
            // 窗帘剪影
            b.fillStyle = 'rgba(96,52,32,0.22)';
            b.fillRect(wxx + ww2 * 0.06, wyy, ww2 * 0.14, wh2);
            b.fillRect(wxx + ww2 * 0.80, wyy, ww2 * 0.14, wh2);
          } else {
            // 玻璃反光
            b.fillStyle = 'rgba(140,160,200,0.08)';
            b.beginPath();
            b.moveTo(wxx, wyy); b.lineTo(wxx + ww2 * 0.4, wyy);
            b.lineTo(wxx, wyy + wh2 * 0.5); b.closePath(); b.fill();
          }
          b.strokeStyle = 'rgba(10,10,16,0.55)';
          b.lineWidth = 1;
          b.strokeRect(wxx, wyy, ww2, wh2);
          b.beginPath(); b.moveTo(wxx + ww2 / 2, wyy); b.lineTo(wxx + ww2 / 2, wyy + wh2); b.stroke();
          // 窗台
          b.fillStyle = 'rgba(210,200,180,0.16)';
          b.fillRect(wxx - 3, wyy + wh2, ww2 + 6, 2);
          // 铁栏：只留矮护栏，不再是成排竖线
          b.strokeStyle = 'rgba(18,18,24,0.5)';
          b.lineWidth = 1;
          b.beginPath();
          b.moveTo(wxx - 1, wyy + wh2 + 4); b.lineTo(wxx + ww2 + 1, wyy + wh2 + 4);
          b.stroke();
          for (let k = 0; k < 3; k++) {
            const bx3 = wxx + (ww2 * (k + 0.5)) / 3;
            b.beginPath(); b.moveTo(bx3, wyy + wh2 + 4); b.lineTo(bx3, wyy + wh2 + 1); b.stroke();
          }
        }
      }
      // 芒萨尔屋顶、老虎窗与烟囱
      b.fillStyle = night ? '#151926' : shade(stone, -42);
      b.beginPath();
      b.moveTo(fx - 2, ftop);
      b.lineTo(fx + fw * 0.13, ftop - H * 0.055);
      b.lineTo(fx + fw * 0.87, ftop - H * 0.055);
      b.lineTo(fx + fw + 2, ftop);
      b.closePath(); b.fill();
      b.strokeStyle = 'rgba(180,190,220,0.06)';
      for (let t = 1; t < 6; t++) {
        b.beginPath();
        b.moveTo(fx + (fw * t) / 6, ftop);
        b.lineTo(fx + fw * (0.13 + 0.74 * (t / 6)), ftop - H * 0.055);
        b.stroke();
      }
      b.fillStyle = shade(stone, -34);
      b.fillRect(fx + fw * 0.20, ftop - H * 0.095, W * 0.013, H * 0.045);
      b.fillRect(fx + fw * 0.64, ftop - H * 0.088, W * 0.011, H * 0.038);
      b.fillStyle = 'rgba(255,222,170,0.08)';
      b.fillRect(fx + fw * 0.20, ftop - H * 0.095, W * 0.003, H * 0.045);
      const dx3 = fx + fw * 0.44;
      b.fillStyle = night ? '#2a2e3c' : '#4a4650';
      b.beginPath();
      b.moveTo(dx3 - fw * 0.06, ftop - H * 0.012);
      b.lineTo(dx3, ftop - H * 0.040);
      b.lineTo(dx3 + fw * 0.06, ftop - H * 0.012);
      b.closePath(); b.fill();
      b.fillStyle = night ? '#ffd58a' : '#1e222c';
      b.fillRect(dx3 - fw * 0.022, ftop - H * 0.026, fw * 0.044, H * 0.018);
    }

    // 右端：旧铸造厂改造的沙龙
    const sx0 = W * 0.605, sw = W - sx0, sTop = H * 0.15, sBot = horizon;
    const brickW = b.createLinearGradient(sx0, 0, W, 0);
    brickW.addColorStop(0, night ? '#2c1e20' : '#4c3a33');
    brickW.addColorStop(1, night ? '#1d1416' : '#3a2b26');
    b.fillStyle = brickW;
    b.fillRect(sx0, sTop, sw, sBot - sTop);
    for (let row = 0; row < 18; row++) {
      const yy = sTop + ((sBot - sTop) * row) / 18;
      b.strokeStyle = 'rgba(8,4,5,0.24)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(sx0, yy); b.lineTo(W, yy); b.stroke();
      const off = (row % 2) * W * 0.02;
      for (let x = sx0 + off; x < W; x += W * 0.04) {
        b.beginPath(); b.moveTo(x, yy); b.lineTo(x, yy + (sBot - sTop) / 18); b.stroke();
      }
    }
    b.fillStyle = shade(night ? '#2c1e20' : '#4c3a33', 16);
    b.fillRect(sx0 - W * 0.008, sTop - H * 0.012, sw + W * 0.008, H * 0.014);
    // 三扇高拱铁窗，窗内是暖黄的酒会
    for (let i = 0; i < 3; i++) {
      const ax = sx0 + W * (0.035 + i * 0.115);
      const aw = W * 0.072;
      const ay = H * 0.225;
      const ab = horizon - H * 0.035;
      const ar = aw / 2;
      b.fillStyle = '#0a1320';
      b.beginPath();
      b.moveTo(ax, ab); b.lineTo(ax, ay + ar);
      b.arc(ax + ar, ay + ar, ar, Math.PI, 0);
      b.lineTo(ax + aw, ab); b.closePath(); b.fill();
      b.save();
      b.beginPath();
      b.moveTo(ax + 2, ab - 1); b.lineTo(ax + 2, ay + ar);
      b.arc(ax + ar, ay + ar, ar - 2, Math.PI, 0);
      b.lineTo(ax + aw - 2, ab - 1); b.closePath(); b.clip();
      const wl2 = b.createLinearGradient(0, ay, 0, ab);
      wl2.addColorStop(0, 'rgba(250,206,146,0.74)');
      wl2.addColorStop(0.55, 'rgba(214,146,86,0.68)');
      wl2.addColorStop(1, 'rgba(128,76,44,0.8)');
      b.fillStyle = wl2;
      b.fillRect(ax, ay, aw, ab - ay);
      // 室内地板与墙裙
      b.fillStyle = 'rgba(74,40,26,0.34)';
      b.fillRect(ax, ab - (ab - ay) * 0.22, aw, (ab - ay) * 0.22);
      b.fillStyle = 'rgba(255,222,168,0.10)';
      b.fillRect(ax, ab - (ab - ay) * 0.22, aw, 1.5);
      // 吊灯
      const lampY = ay + (ab - ay) * 0.2;
      b.fillStyle = 'rgba(88,48,30,0.55)';
      b.fillRect(ax + aw / 2 - 1, ay, 2, (ab - ay) * 0.2);
      const lgl = b.createRadialGradient(ax + aw / 2, lampY, 0, ax + aw / 2, lampY, aw * 0.3);
      lgl.addColorStop(0, 'rgba(255,246,210,0.55)');
      lgl.addColorStop(0.4, 'rgba(255,232,170,0.22)');
      lgl.addColorStop(1, 'rgba(255,230,170,0)');
      b.fillStyle = lgl;
      b.fillRect(ax, ay, aw, ab - ay);
      b.fillStyle = 'rgba(255,248,222,0.8)';
      b.beginPath(); b.arc(ax + aw / 2, lampY, Math.max(1.4, aw * 0.012), 0, 6.3); b.fill();
      // 宾客：头 + 肩的半身剪影，前后错开
      for (let k = 0; k < 4; k++) {
        const pxx = ax + aw * (0.18 + k * 0.22);
        const phh = (ab - ay) * (0.30 + (k % 3) * 0.045);
        const sw2 = aw * (0.085 + (k % 2) * 0.018);
        b.fillStyle = 'rgba(52,28,20,0.42)';
        b.beginPath();
        b.moveTo(pxx - sw2, ab);
        b.quadraticCurveTo(pxx - sw2 * 0.92, ab - phh * 0.44, pxx - sw2 * 0.40, ab - phh * 0.60);
        b.quadraticCurveTo(pxx - aw * 0.026, ab - phh * 0.72, pxx - aw * 0.024, ab - phh * 0.80);
        b.lineTo(pxx + aw * 0.024, ab - phh * 0.80);
        b.quadraticCurveTo(pxx + aw * 0.026, ab - phh * 0.72, pxx + sw2 * 0.40, ab - phh * 0.60);
        b.quadraticCurveTo(pxx + sw2 * 0.92, ab - phh * 0.44, pxx + sw2, ab);
        b.closePath(); b.fill();
        b.beginPath();
        b.ellipse(pxx, ab - phh * 0.865, aw * 0.026, aw * 0.031, 0, 0, 6.3);
        b.fill();
        // 室内光在肩头的微边缘
        b.strokeStyle = 'rgba(255,224,172,0.18)';
        b.lineWidth = 0.9;
        b.beginPath();
        b.moveTo(pxx - sw2 * 0.92, ab - phh * 0.42);
        b.quadraticCurveTo(pxx - sw2 * 0.8, ab - phh * 0.56, pxx - sw2 * 0.36, ab - phh * 0.60);
        b.stroke();
      }
      for (let k = 0; k < 7; k++) {
        b.fillStyle = `rgba(255,248,222,${rand(0.22, 0.45)})`;
        b.beginPath();
        b.arc(ax + rand(0.14, 0.86) * aw, ay + rand(0.45, 0.86) * (ab - ay), rand(0.7, 1.4), 0, 6.3);
        b.fill();
      }
      b.restore();
      // 铁窗棂与拱边
      b.strokeStyle = 'rgba(14,12,14,0.92)';
      b.lineWidth = Math.max(1.4, W * 0.002);
      b.beginPath(); b.moveTo(ax + ar, ay); b.lineTo(ax + ar, ab); b.stroke();
      for (let k = 1; k < 4; k++) {
        const yy = ay + (ab - ay) * (0.3 + k * 0.17);
        b.beginPath(); b.moveTo(ax + 1, yy); b.lineTo(ax + aw - 1, yy); b.stroke();
      }
      b.strokeStyle = 'rgba(196,156,124,0.22)';
      b.lineWidth = 1.6;
      b.beginPath(); b.arc(ax + ar, ay + ar, ar + 2, Math.PI, 0); b.stroke();
    }
    // 门楣铜牌与雨棚灯
    b.fillStyle = 'rgba(122,96,52,0.92)';
    b.fillRect(sx0 + W * 0.035, sTop + H * 0.028, W * 0.09, H * 0.012);
    b.fillStyle = 'rgba(255,236,190,0.2)';
    b.fillRect(sx0 + W * 0.037, sTop + H * 0.029, W * 0.086, 1);
    // 雨棚下的小灯
    const eaveX = sx0 + W * 0.128;
    b.fillStyle = '#1a1618';
    b.fillRect(eaveX, sTop + H * 0.05, W * 0.012, H * 0.006);
    b.fillStyle = 'rgba(255,214,150,0.85)';
    b.beginPath(); b.arc(eaveX + W * 0.006, sTop + H * 0.058, Math.max(2, W * 0.0035), 0, 6.3); b.fill();

    // 街面上的冷雨
    b.save();
    b.strokeStyle = night ? 'rgba(190,206,232,0.11)' : 'rgba(255,255,255,0.15)';
    b.lineWidth = 1;
    b.lineCap = 'round';
    for (let i = 0; i < 120; i++) {
      const rx = Math.random() * W, ry = Math.random() * H * 0.95;
      b.beginPath(); b.moveTo(rx, ry); b.lineTo(rx - 3, ry + rand(12, 30)); b.stroke();
    }
    b.restore();
  }
  // 湿石板路、街灯、报亭与倒影：必须画在地面渐变之后
  drawStreet.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const day = state.time === 'day';
    // 湿漉漉的石板路
    const road = b.createLinearGradient(0, horizon, 0, H);
    road.addColorStop(0, night ? '#1a1f2b' : day ? '#565a60' : '#3f424a');
    road.addColorStop(0.5, night ? '#141823' : day ? '#4a4d52' : '#343740');
    road.addColorStop(1, night ? '#0c0f16' : day ? '#3c3f44' : '#2a2d34');
    b.fillStyle = road;
    b.fillRect(0, horizon, W, H - horizon);
    // 人行道：湿石带，靠近车道的边缘压暗
    const walk = b.createLinearGradient(0, horizon, 0, horizon + H * 0.058);
    walk.addColorStop(0, night ? '#242a36' : day ? '#8c8880' : '#4a4852');
    walk.addColorStop(1, night ? '#181d27' : day ? '#726e68' : '#38363e');
    b.fillStyle = walk;
    b.fillRect(0, horizon, W, H * 0.058);
    b.strokeStyle = 'rgba(8,10,16,0.45)';
    b.lineWidth = 1.2;
    for (let x = 0; x < W; x += W * 0.03) {
      b.beginPath(); b.moveTo(x, horizon); b.lineTo(x - W * 0.004, horizon + H * 0.058); b.stroke();
    }
    for (let i = 0; i < 40; i++) {
      b.fillStyle = `rgba(6,8,14,${rand(0.05, 0.14)})`;
      b.fillRect(rand(0, W), horizon + rand(0, 0.05) * H, rand(2, 8), rand(1, 3));
    }
    b.fillStyle = 'rgba(10,12,18,0.6)';
    b.fillRect(0, horizon + H * 0.058, W, 2.5);
    b.fillStyle = 'rgba(200,216,238,0.07)';
    b.fillRect(0, horizon + H * 0.058 + 2.5, W, 1);

    // 橱窗与街灯落在湿路上的碎光（不用整根光柱，避免像柱子）
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const fx = W * (0.19 + i * 0.143), fw = W * 0.142;
      const shopTop = horizon - H * 0.088;
      for (const c of [0.27, 0.71]) {
        const cx2 = fx + fw * c;
        for (let k = 0; k < 5; k++) {
          const yy = horizon + H * (0.012 + k * 0.016) + rand(-2, 2);
          b.fillStyle = `rgba(255,202,130,${rand(0.03, 0.09)})`;
          b.fillRect(cx2 - fw * 0.15 + rand(-3, 3), yy, fw * rand(0.10, 0.24), rand(1, 2.4));
        }
        // 透出店面的暖色底光
        const sg = b.createLinearGradient(0, horizon, 0, horizon + H * 0.07);
        sg.addColorStop(0, 'rgba(255,198,120,0.07)');
        sg.addColorStop(1, 'rgba(255,190,110,0)');
        b.fillStyle = sg;
        b.fillRect(cx2 - fw * 0.22, horizon, fw * 0.44, H * 0.07);
        void shopTop;
      }
    }
    b.restore();

    // 鹅卵石：越近越疏，弧线压住透视
    b.strokeStyle = 'rgba(6,8,14,0.30)';
    b.lineWidth = 1;
    for (let r = 0; r < 12; r++) {
      const t = r / 12;
      const y = horizon + (H - horizon) * Math.pow(t, 1.55);
      const step = W * (0.018 + t * 0.035);
      for (let x = ((r % 2) * step) / 2; x < W; x += step) {
        b.beginPath();
        b.ellipse(x, y, step * 0.42, (H - horizon) * 0.006 + t * H * 0.006, 0, 0, Math.PI);
        b.stroke();
      }
    }
    // 路面湿光：大块的冷色反光，不画硬边
    b.save();
    b.globalCompositeOperation = 'lighter';
    const sheen = b.createLinearGradient(0, horizon, 0, H);
    sheen.addColorStop(0, 'rgba(120,150,190,0.05)');
    sheen.addColorStop(0.5, 'rgba(90,120,160,0.03)');
    sheen.addColorStop(1, 'rgba(60,90,130,0)');
    b.fillStyle = sheen;
    b.fillRect(0, horizon, W, H - horizon);
    b.restore();

    // 水洼：柔和的内暗外亮，只留一点反光
    for (const [px0, py0, prx, pry] of [[0.29, 0.78, 0.085, 0.020], [0.60, 0.90, 0.125, 0.026], [0.85, 0.70, 0.062, 0.015]]) {
      const cx2 = W * px0, cy2 = H * py0, rx2 = W * prx, ry2 = H * pry;
      const pg = b.createRadialGradient(cx2, cy2, 0, cx2, cy2, rx2);
      pg.addColorStop(0, night ? 'rgba(16,24,42,0.42)' : 'rgba(70,84,96,0.3)');
      pg.addColorStop(0.72, night ? 'rgba(20,30,48,0.22)' : 'rgba(76,90,102,0.18)');
      pg.addColorStop(1, 'rgba(40,54,74,0)');
      b.save();
      b.translate(cx2, cy2);
      b.scale(1, ry2 / rx2);
      b.fillStyle = pg;
      b.beginPath(); b.arc(0, 0, rx2, 0, 6.3); b.fill();
      b.restore();
      b.save();
      b.globalCompositeOperation = 'lighter';
      const refl = b.createLinearGradient(cx2, cy2 - ry2 * 0.8, cx2, cy2 + ry2 * 0.8);
      refl.addColorStop(0, 'rgba(255,204,136,0.07)');
      refl.addColorStop(0.5, 'rgba(170,190,218,0.05)');
      refl.addColorStop(1, 'rgba(120,150,190,0)');
      b.fillStyle = refl;
      b.beginPath(); b.ellipse(cx2, cy2, rx2 * 0.45, ry2 * 0.7, 0, 0, 6.3); b.fill();
      b.restore();
      for (let k = 0; k < 2; k++) {
        b.strokeStyle = `rgba(184,206,232,${rand(0.04, 0.08)})`;
        b.lineWidth = 0.8;
        b.beginPath();
        b.ellipse(cx2 + rand(-0.3, 0.3) * rx2, cy2 + rand(-0.4, 0.4) * ry2, rx2 * rand(0.1, 0.22), ry2 * rand(0.08, 0.2), 0, 0, 6.3);
        b.stroke();
      }
    }

    // 街灯
    const lx = W * 0.205, lBase = horizon + H * 0.075, lTop = horizon - H * 0.30;
    b.save();
    b.globalCompositeOperation = 'lighter';
    const halo = b.createRadialGradient(lx, lTop, 0, lx, lTop, W * 0.15);
    halo.addColorStop(0, 'rgba(255,210,140,0.30)');
    halo.addColorStop(0.42, 'rgba(255,196,110,0.10)');
    halo.addColorStop(1, 'rgba(255,190,100,0)');
    b.fillStyle = halo;
    b.beginPath(); b.arc(lx, lTop, W * 0.15, 0, 6.3); b.fill();
    const lp = b.createRadialGradient(lx, horizon + H * 0.055, 0, lx, horizon + H * 0.055, W * 0.11);
    lp.addColorStop(0, 'rgba(255,224,168,0.09)');
    lp.addColorStop(0.5, 'rgba(255,212,144,0.035)');
    lp.addColorStop(1, 'rgba(255,202,124,0)');
    b.fillStyle = lp;
    b.beginPath(); b.ellipse(lx, horizon + H * 0.06, W * 0.11, H * 0.03, 0, 0, 6.3); b.fill();
    // 灯柱在湿地上的长长倒影
    const lrefl = b.createLinearGradient(0, horizon, 0, H * 0.97);
    lrefl.addColorStop(0, 'rgba(255,206,132,0.16)');
    lrefl.addColorStop(0.4, 'rgba(255,198,120,0.05)');
    lrefl.addColorStop(1, 'rgba(255,190,110,0)');
    b.fillStyle = lrefl;
    b.fillRect(lx - W * 0.006, horizon, W * 0.012, H * 0.35);
    b.restore();
    b.strokeStyle = '#232028';
    b.lineWidth = Math.max(2.4, W * 0.0035);
    b.beginPath(); b.moveTo(lx, lBase); b.lineTo(lx, lTop + H * 0.014); b.stroke();
    b.fillStyle = '#1c1a20';
    b.beginPath(); b.ellipse(lx, lBase, W * 0.012, H * 0.004, 0, 0, 6.3); b.fill();
    b.beginPath(); b.ellipse(lx, lTop - H * 0.002, W * 0.016, H * 0.006, 0, 0, 6.3); b.fill();
    b.fillStyle = '#ffe2ac';
    b.beginPath(); b.arc(lx, lTop, Math.max(2, W * 0.004), 0, 6.3); b.fill();

    // 街角报亭
    const kx = W * 0.352, kw = W * 0.095, kBase = horizon + H * 0.078, kTop = horizon - H * 0.118;
    b.fillStyle = 'rgba(0,0,0,0.30)';
    b.beginPath(); b.ellipse(kx + kw * 0.5, kBase + H * 0.008, kw * 0.72, H * 0.014, 0, 0, 6.3); b.fill();
    const kg = b.createLinearGradient(kx, 0, kx + kw, 0);
    kg.addColorStop(0, '#1b3628');
    kg.addColorStop(0.52, '#2d5340');
    kg.addColorStop(1, '#142b20');
    b.fillStyle = kg;
    b.fillRect(kx, kTop + H * 0.035, kw, kBase - kTop - H * 0.035);
    b.strokeStyle = 'rgba(8,16,12,0.4)';
    b.lineWidth = 1;
    for (let yy = kTop + H * 0.05; yy < kBase; yy += H * 0.024) {
      b.beginPath(); b.moveTo(kx, yy); b.lineTo(kx + kw, yy); b.stroke();
    }
    // 展窗暖光与杂志
    b.fillStyle = 'rgba(255,206,130,0.74)';
    b.fillRect(kx + kw * 0.10, kTop + H * 0.060, kw * 0.80, H * 0.066);
    const mags = ['#c8b08a', '#a85040', '#6c7c8c', '#c8a040', '#4c6c5c'];
    for (let i = 0; i < 5; i++) {
      b.fillStyle = mags[i];
      b.fillRect(kx + kw * 0.14 + i * kw * 0.15, kTop + H * 0.074, kw * 0.095, H * 0.032);
      b.fillStyle = 'rgba(255,255,255,0.22)';
      b.fillRect(kx + kw * 0.14 + i * kw * 0.15, kTop + H * 0.074, kw * 0.095, 1);
      b.fillStyle = 'rgba(30,20,14,0.35)';
      b.fillRect(kx + kw * 0.14 + i * kw * 0.15 + 1, kTop + H * 0.082, kw * 0.05, 1);
    }
    b.strokeStyle = 'rgba(20,26,22,0.8)';
    b.lineWidth = 1.6;
    b.strokeRect(kx + kw * 0.10, kTop + H * 0.060, kw * 0.80, H * 0.066);
    // 亭顶与招牌
    b.fillStyle = '#1a2c22';
    b.beginPath();
    b.moveTo(kx - kw * 0.10, kTop + H * 0.040);
    b.lineTo(kx + kw * 0.06, kTop);
    b.lineTo(kx + kw * 0.94, kTop);
    b.lineTo(kx + kw * 1.10, kTop + H * 0.040);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(210,226,200,0.16)';
    b.fillRect(kx - kw * 0.06, kTop + H * 0.036, kw * 1.1, 1.4);
    b.save();
    b.fillStyle = '#e8dcbc';
    b.font = `600 ${Math.max(8, W * 0.0095)}px "Georgia", "Times New Roman", serif`;
    b.textAlign = 'center';
    b.textBaseline = 'middle';
    b.fillText('JOURNAUX', kx + kw * 0.5, kTop + H * 0.053);
    b.restore();
    // 报亭暖光落到湿地上
    b.save();
    b.globalCompositeOperation = 'lighter';
    const kp = b.createRadialGradient(kx + kw * 0.5, kBase, 0, kx + kw * 0.5, kBase, kw * 1.7);
    kp.addColorStop(0, 'rgba(255,196,110,0.18)');
    kp.addColorStop(0.5, 'rgba(255,192,104,0.06)');
    kp.addColorStop(1, 'rgba(255,190,100,0)');
    b.fillStyle = kp;
    b.beginPath(); b.ellipse(kx + kw * 0.5, kBase + H * 0.01, kw * 1.7, H * 0.05, 0, 0, 6.3); b.fill();
    b.restore();
    // 雨滴打出的细小水花
    for (let i = 0; i < 40; i++) {
      const rx = rand(0, W), ry = horizon + rand(0.02, 0.4) * (H - horizon);
      b.strokeStyle = `rgba(206,222,240,${rand(0.04, 0.11)})`;
      b.lineWidth = 0.8;
      b.beginPath(); b.ellipse(rx, ry, rand(2, 6), rand(0.8, 1.8), 0, 0, 6.3); b.stroke();
    }
    // 画面下缘压暗，托住对话框
    const bottomShade = b.createLinearGradient(0, H * 0.72, 0, H);
    bottomShade.addColorStop(0, 'rgba(4,6,12,0)');
    bottomShade.addColorStop(1, 'rgba(4,6,12,0.45)');
    b.fillStyle = bottomShade;
    b.fillRect(0, H * 0.72, W, H * 0.28);
  };

  /* ---------- 场景：普罗旺斯古董庄园 ---------- */
  function drawEstate(b, p, horizon) {
    const day = state.time === 'day';
    const dusk = state.time === 'dusk';
    // 阿尔皮耶山脉
    b.fillStyle = dusk ? 'rgba(96,80,104,0.55)' : 'rgba(152,162,168,0.55)';
    b.beginPath();
    b.moveTo(0, horizon - H * 0.16);
    b.lineTo(W * 0.10, horizon - H * 0.235);
    b.lineTo(W * 0.22, horizon - H * 0.17);
    b.lineTo(W * 0.34, horizon - H * 0.26);
    b.lineTo(W * 0.48, horizon - H * 0.185);
    b.lineTo(W * 0.62, horizon - H * 0.245);
    b.lineTo(W * 0.78, horizon - H * 0.165);
    b.lineTo(W * 0.90, horizon - H * 0.225);
    b.lineTo(W, horizon - H * 0.15);
    b.lineTo(W, horizon - H * 0.02);
    b.lineTo(0, horizon - H * 0.02);
    b.closePath(); b.fill();
    b.fillStyle = dusk ? 'rgba(76,66,86,0.45)' : 'rgba(128,140,144,0.45)';
    b.beginPath();
    b.moveTo(0, horizon - H * 0.09);
    b.lineTo(W * 0.16, horizon - H * 0.155);
    b.lineTo(W * 0.30, horizon - H * 0.10);
    b.lineTo(W * 0.46, horizon - H * 0.16);
    b.lineTo(W * 0.64, horizon - H * 0.095);
    b.lineTo(W * 0.80, horizon - H * 0.15);
    b.lineTo(W, horizon - H * 0.085);
    b.lineTo(W, horizon - H * 0.02);
    b.lineTo(0, horizon - H * 0.02);
    b.closePath(); b.fill();
    // 橄榄林带
    for (let i = 0; i < 46; i++) {
      const ox = Math.random() * W;
      const oy = horizon - H * rand(0.02, 0.085);
      const orr = W * rand(0.006, 0.014);
      b.fillStyle = `rgba(${64 + (i % 3) * 10},${82 + (i % 4) * 8},${58 + (i % 2) * 8},${rand(0.35, 0.7)})`;
      b.beginPath(); b.ellipse(ox, oy, orr, orr * 0.62, 0, 0, 6.3); b.fill();
    }
    // 山脚薄雾：压住远山的硬边
    const haze = b.createLinearGradient(0, horizon - H * 0.14, 0, horizon);
    haze.addColorStop(0, 'rgba(226,232,230,0)');
    haze.addColorStop(1, day ? 'rgba(226,230,222,0.42)' : dusk ? 'rgba(150,132,140,0.3)' : 'rgba(70,66,80,0.32)');
    b.fillStyle = haze;
    b.fillRect(0, horizon - H * 0.14, W, H * 0.14);
    // 庄园主体
    const mx0 = W * 0.295, mx1 = W * 0.705, mtop = H * 0.235, mbot = horizon - H * 0.004;
    const stone = day ? '#cdbb98' : dusk ? '#a28a6c' : '#5d5348';
    const mg = b.createLinearGradient(mx0, 0, mx1, 0);
    mg.addColorStop(0, shade(stone, -8));
    mg.addColorStop(0.55, stone);
    mg.addColorStop(0.86, shade(stone, 10));
    mg.addColorStop(1, shade(stone, 20));
    b.fillStyle = mg;
    b.fillRect(mx0, mtop, mx1 - mx0, mbot - mtop);
    // 石砌墙面：错缝砌块、深浅不一的石灰岩与勾缝阴影
    const stoneRows = 11;
    for (let row = 0; row < stoneRows; row++) {
      const yy = mtop + ((mbot - mtop) * row) / stoneRows;
      b.strokeStyle = 'rgba(70,58,42,0.14)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(mx0, yy); b.lineTo(mx1, yy); b.stroke();
      b.strokeStyle = 'rgba(255,244,214,0.05)';
      b.beginPath(); b.moveTo(mx0, yy + 1.2); b.lineTo(mx1, yy + 1.2); b.stroke();
      if (row === stoneRows - 1) continue;
      const yy2 = mtop + ((mbot - mtop) * (row + 1)) / stoneRows;
      const off = (row % 2) * W * 0.023;
      let col = 0;
      for (let x0 = mx0 + off; x0 < mx1; x0 += W * 0.046, col++) {
        if (x0 <= mx0 + 1) continue;
        b.strokeStyle = 'rgba(70,58,42,0.10)';
        b.beginPath(); b.moveTo(x0, yy + 1); b.lineTo(x0, yy2 - 1); b.stroke();
        // 少量风化/受光的石块：极淡的暖冷差异
        const pickBlock = (row * 13 + col) % 6;
        if (pickBlock === 0) {
          b.fillStyle = 'rgba(96,74,50,0.045)';
          b.fillRect(x0 + 1, yy + 1, W * 0.046 - 2, yy2 - yy - 2);
        } else if (pickBlock === 3) {
          b.fillStyle = 'rgba(255,250,232,0.032)';
          b.fillRect(x0 + 1, yy + 1, W * 0.046 - 2, yy2 - yy - 2);
        }
      }
    }
    // 转角隅石
    for (const [qx, dir] of [[mx0, 1], [mx1, -1]]) {
      for (let k = 0; k < 9; k++) {
        const qy = mtop + H * 0.012 + k * H * 0.037;
        const qw = W * (k % 2 ? 0.016 : 0.011);
        b.fillStyle = k % 2 ? 'rgba(255,246,222,0.06)' : 'rgba(80,64,46,0.05)';
        b.fillRect(dir > 0 ? qx : qx - qw, qy, qw, H * 0.032);
        b.strokeStyle = 'rgba(70,58,42,0.13)';
        b.lineWidth = 1;
        b.strokeRect(dir > 0 ? qx : qx - qw, qy, qw, H * 0.032);
      }
    }
    // 墙脚石带与压顶
    b.fillStyle = day ? 'rgba(150,130,100,0.30)' : dusk ? 'rgba(96,78,60,0.32)' : 'rgba(48,40,32,0.38)';
    b.fillRect(mx0, mbot - H * 0.030, mx1 - mx0, H * 0.030);
    b.fillStyle = 'rgba(255,240,210,0.13)';
    b.fillRect(mx0, mbot - H * 0.030, mx1 - mx0, 1.5);
    b.fillStyle = 'rgba(30,22,14,0.16)';
    b.fillRect(mx0, mbot - H * 0.032, mx1 - mx0, 2);
    // 石板瓦屋顶
    const roof = b.createLinearGradient(0, mtop - H * 0.065, 0, mtop);
    roof.addColorStop(0, day ? '#a05a3c' : dusk ? '#7a4230' : '#4a2c22');
    roof.addColorStop(0.7, day ? '#8a4a32' : dusk ? '#653626' : '#3c251c');
    roof.addColorStop(1, day ? '#6e3826' : dusk ? '#4e2a1e' : '#2e1c16');
    b.fillStyle = roof;
    b.beginPath();
    b.moveTo(mx0 - W * 0.018, mtop + 2);
    b.lineTo(mx0 + W * 0.015, mtop - H * 0.062);
    b.lineTo(mx1 - W * 0.015, mtop - H * 0.062);
    b.lineTo(mx1 + W * 0.018, mtop + 2);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(255,210,168,0.16)';
    b.lineWidth = 1.2;
    b.beginPath();
    b.moveTo(mx0 + W * 0.015, mtop - H * 0.062);
    b.lineTo(mx1 - W * 0.015, mtop - H * 0.062);
    b.stroke();
    // 瓦垄：一行行小弧瓦，叠加深浅差异，避免整块平涂的斜面
    b.save();
    b.beginPath();
    b.moveTo(mx0 - W * 0.018, mtop + 2);
    b.lineTo(mx0 + W * 0.015, mtop - H * 0.062);
    b.lineTo(mx1 - W * 0.015, mtop - H * 0.062);
    b.lineTo(mx1 + W * 0.018, mtop + 2);
    b.closePath();
    b.clip();
    const roofTop = mtop - H * 0.062, roofBot = mtop + 2;
    const courses = 5, tileW = W * 0.0105;
    for (let r = 0; r < courses; r++) {
      const ty = roofTop + (roofBot - roofTop) * (r / courses);
      const ty2 = roofTop + (roofBot - roofTop) * ((r + 1) / courses);
      // 每行瓦片的明暗差
      const shadeA = r % 2 ? 0.05 : 0.02;
      b.fillStyle = `rgba(255,190,142,${shadeA})`;
      b.fillRect(mx0 - W * 0.02, ty, mx1 - mx0 + W * 0.04, ty2 - ty);
      b.strokeStyle = 'rgba(38,18,10,0.28)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(mx0 - W * 0.02, ty); b.lineTo(mx1 + W * 0.02, ty); b.stroke();
      const off = (r % 2) * tileW * 0.5;
      for (let x0 = mx0 - W * 0.02 + off; x0 < mx1 + W * 0.02; x0 += tileW) {
        b.strokeStyle = 'rgba(255,214,172,0.16)';
        b.lineWidth = 1;
        b.beginPath();
        b.arc(x0, ty + (ty2 - ty) * 0.72, tileW * 0.48, Math.PI + 0.18, -0.18);
        b.stroke();
        b.strokeStyle = 'rgba(40,20,12,0.12)';
        b.beginPath();
        b.arc(x0, ty2, tileW * 0.48, 0.30, Math.PI - 0.30);
        b.stroke();
      }
    }
    // 屋脊与檐口两道压边
    b.fillStyle = 'rgba(255,216,176,0.10)';
    b.fillRect(mx0 + W * 0.012, roofTop, mx1 - mx0 - W * 0.024, H * 0.003);
    b.fillStyle = 'rgba(30,14,8,0.20)';
    b.fillRect(mx0 - W * 0.02, mtop - H * 0.004, mx1 - mx0 + W * 0.04, H * 0.004);
    b.restore();
    // 烟囱
    for (const cx0 of [mx0 + W * 0.055, mx1 - W * 0.075]) {
      b.fillStyle = shade(stone, -16);
      b.fillRect(cx0, mtop - H * 0.105, W * 0.022, H * 0.052);
      b.fillStyle = shade(stone, -26);
      b.fillRect(cx0 - 3, mtop - H * 0.110, W * 0.028, H * 0.010);
    }
    // 檐下阴影
    b.fillStyle = 'rgba(20,16,10,0.18)';
    b.fillRect(mx0, mtop, mx1 - mx0, H * 0.016);
    // 两排木百叶窗
    const winW = W * 0.038, winH = H * 0.058;
    const cols = [mx0 + W * 0.045, mx0 + W * 0.105, mx1 - W * 0.143, mx1 - W * 0.083];
    for (let row = 0; row < 2; row++) {
      const wy = mtop + H * (0.042 + row * 0.076);
      for (const wxx of cols) {
        // 石质窗套与凹进去的窗洞
        b.fillStyle = day ? 'rgba(168,152,122,0.65)' : 'rgba(58,50,40,0.6)';
        b.fillRect(wxx - 4, wy - 3, winW + 8, winH + 6);
        const glass = b.createLinearGradient(0, wy, 0, wy + winH);
        glass.addColorStop(0, day ? '#4a5a68' : '#1a202c');
        glass.addColorStop(0.6, day ? '#354450' : '#121722');
        glass.addColorStop(1, day ? '#2a3640' : '#0d1119');
        b.fillStyle = glass;
        b.fillRect(wxx, wy, winW, winH);
        if (dusk) {
          b.fillStyle = 'rgba(255,190,104,0.34)';
          b.fillRect(wxx, wy, winW, winH);
        } else if (day) {
          // 天光斜落在玻璃上
          b.fillStyle = 'rgba(198,216,228,0.16)';
          b.beginPath();
          b.moveTo(wxx, wy); b.lineTo(wxx + winW * 0.52, wy);
          b.lineTo(wxx, wy + winH * 0.62); b.closePath(); b.fill();
        }
        // 木百叶：横向叶片 + 中缝
        for (const sideX of [wxx - winW * 0.17, wxx + winW]) {
          b.fillStyle = day ? '#66785a' : '#3b4837';
          b.fillRect(sideX, wy, winW * 0.17, winH);
          b.strokeStyle = 'rgba(24,30,22,0.35)';
          b.lineWidth = 0.8;
          for (let sl = 1; sl < 7; sl++) {
            const sy = wy + (winH * sl) / 7;
            b.beginPath(); b.moveTo(sideX, sy); b.lineTo(sideX + winW * 0.17, sy); b.stroke();
          }
          b.strokeStyle = 'rgba(240,232,208,0.14)';
          b.beginPath(); b.moveTo(sideX, wy); b.lineTo(sideX, wy + winH); b.stroke();
        }
        // 窗棂
        b.strokeStyle = 'rgba(226,216,192,0.28)';
        b.lineWidth = 1.1;
        b.beginPath(); b.moveTo(wxx + winW / 2, wy); b.lineTo(wxx + winW / 2, wy + winH); b.stroke();
        b.beginPath(); b.moveTo(wxx, wy + winH * 0.46); b.lineTo(wxx + winW, wy + winH * 0.46); b.stroke();
        // 窗台与滴水阴影
        b.fillStyle = day ? '#d8c9ab' : dusk ? '#ae9a80' : '#6b6153';
        b.fillRect(wxx - 6, wy + winH + 3, winW + 12, 3.5);
        b.fillStyle = 'rgba(28,20,12,0.22)';
        b.fillRect(wxx - 6, wy + winH + 6.5, winW + 12, 2.5);
      }
    }
    // 中央双开门、门楣与石阶
    const dx = W * 0.465;
    b.fillStyle = 'rgba(30,22,14,0.35)';
    b.fillRect(dx - 4, mbot - H * 0.132, W * 0.074, H * 0.132);
    const doorG = b.createLinearGradient(dx, 0, dx + W * 0.07, 0);
    doorG.addColorStop(0, day ? '#5a4026' : '#332416');
    doorG.addColorStop(1, day ? '#3e2b18' : '#24180e');
    b.fillStyle = doorG;
    b.fillRect(dx, mbot - H * 0.128, W * 0.07, H * 0.128);
    b.strokeStyle = 'rgba(240,214,170,0.18)';
    b.strokeRect(dx + 2, mbot - H * 0.126, W * 0.066, H * 0.124);
    b.beginPath(); b.moveTo(dx + W * 0.035, mbot - H * 0.126); b.lineTo(dx + W * 0.035, mbot); b.stroke();
    // 门板凹槽与门环
    b.strokeStyle = 'rgba(20,12,6,0.32)';
    b.lineWidth = 1.4;
    for (const ex of [dx + W * 0.010, dx + W * 0.040]) {
      b.strokeRect(ex, mbot - H * 0.112, W * 0.020, H * 0.040);
      b.strokeRect(ex, mbot - H * 0.060, W * 0.020, H * 0.042);
    }
    b.fillStyle = 'rgba(190,158,96,0.75)';
    b.beginPath(); b.arc(dx + W * 0.028, mbot - H * 0.065, Math.max(1.4, W * 0.0022), 0, 6.3); b.fill();
    b.beginPath(); b.arc(dx + W * 0.042, mbot - H * 0.065, Math.max(1.4, W * 0.0022), 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(170,140,86,0.55)';
    b.lineWidth = 1.2;
    b.beginPath(); b.arc(dx + W * 0.028, mbot - H * 0.060, W * 0.006, 0.2, 2.9); b.stroke();
    b.beginPath(); b.arc(dx + W * 0.042, mbot - H * 0.060, W * 0.006, 0.2, 2.9); b.stroke();
    // 门旁的壁灯
    const lanX = dx + W * 0.086;
    b.strokeStyle = 'rgba(28,22,16,0.8)';
    b.lineWidth = 1.6;
    b.beginPath(); b.moveTo(lanX, mbot - H * 0.100); b.lineTo(lanX, mbot - H * 0.086); b.stroke();
    b.fillStyle = 'rgba(30,24,18,0.85)';
    b.beginPath();
    b.moveTo(lanX - W * 0.008, mbot - H * 0.086);
    b.lineTo(lanX + W * 0.008, mbot - H * 0.086);
    b.lineTo(lanX + W * 0.005, mbot - H * 0.068);
    b.lineTo(lanX - W * 0.005, mbot - H * 0.068);
    b.closePath(); b.fill();
    b.fillStyle = dusk ? 'rgba(255,214,150,0.9)' : 'rgba(214,206,180,0.55)';
    b.fillRect(lanX - W * 0.004, mbot - H * 0.083, W * 0.008, H * 0.012);
    if (dusk) {
      const lg = b.createRadialGradient(lanX, mbot - H * 0.078, 0, lanX, mbot - H * 0.078, W * 0.05);
      lg.addColorStop(0, 'rgba(255,206,130,0.22)');
      lg.addColorStop(1, 'rgba(255,200,120,0)');
      b.fillStyle = lg;
      b.beginPath(); b.arc(lanX, mbot - H * 0.078, W * 0.05, 0, 6.3); b.fill();
    }
    // 门楣拱石
    b.strokeStyle = 'rgba(255,244,214,0.22)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(dx - 3, mbot - H * 0.128);
    b.quadraticCurveTo(dx + W * 0.035, mbot - H * 0.152, dx + W * 0.073, mbot - H * 0.128);
    b.stroke();
    // 秋藤与常春藤：沿墙角、窗边成簇攀附，而不是满墙撒点
    const ivyAt = (cx, cy, rx, ry, n) => {
      for (let k = 0; k < n; k++) {
        const ang = rand(0, 6.3);
        const rr = Math.sqrt(Math.random());
        const lx = cx + Math.cos(ang) * rx * rr;
        const ly = cy + Math.sin(ang) * ry * rr;
        b.fillStyle = Math.random() < 0.5
          ? `rgba(${96 + (k % 4) * 12},${40 + (k % 3) * 10},${28 + (k % 2) * 8},${rand(0.32, 0.68)})`
          : `rgba(${46 + (k % 3) * 8},${68 + (k % 4) * 8},${38 + (k % 2) * 6},${rand(0.28, 0.6)})`;
        b.beginPath();
        b.ellipse(lx, ly, rand(1.5, 3.4), rand(1.0, 2.2), rand(0, 3.14), 0, 6.3);
        b.fill();
      }
    };
    ivyAt(mx0 + W * 0.012, mbot - H * 0.07, W * 0.020, H * 0.105, 46);
    ivyAt(mx0 + W * 0.020, mtop + H * 0.14, W * 0.014, H * 0.062, 26);
    ivyAt(mx0 + W * 0.034, mtop + H * 0.26, W * 0.010, H * 0.030, 14);
    ivyAt(mx1 - W * 0.012, mbot - H * 0.055, W * 0.017, H * 0.088, 38);
    ivyAt(mx1 - W * 0.030, mtop + H * 0.20, W * 0.011, H * 0.048, 18);
    ivyAt(dx + W * 0.035, mbot - H * 0.150, W * 0.030, H * 0.010, 14);
    ivyAt(dx - W * 0.006, mbot - H * 0.060, W * 0.008, H * 0.032, 12);
    // 几条深色藤蔓把簇连起来
    b.strokeStyle = 'rgba(52,40,26,0.32)';
    b.lineWidth = 1.4;
    b.beginPath();
    b.moveTo(mx0 + W * 0.010, mbot - H * 0.02);
    b.bezierCurveTo(mx0 + W * 0.038, mbot - H * 0.14, mx0 + W * 0.008, mtop + H * 0.34, mx0 + W * 0.030, mtop + H * 0.18);
    b.stroke();
    b.beginPath();
    b.moveTo(mx1 - W * 0.008, mbot - H * 0.02);
    b.bezierCurveTo(mx1 - W * 0.026, mbot - H * 0.12, mx1 - W * 0.006, mtop + H * 0.36, mx1 - W * 0.030, mtop + H * 0.22);
    b.stroke();
    // 檐口受光
    b.fillStyle = 'rgba(255,240,204,0.14)';
    b.fillRect(mx0 + W * 0.01, mtop + 2, mx1 - mx0 - W * 0.02, 2);
  }
  // 庭院、喷泉、柏树夹道与铁门：必须画在地面渐变之后
  drawEstate.ground = (b, p, horizon) => {
    const day = state.time === 'day';
    const dusk = state.time === 'dusk';
    // 碎石庭院
    const gv = b.createLinearGradient(0, horizon, 0, H);
    gv.addColorStop(0, day ? '#b3a184' : dusk ? '#8a7461' : '#5a5048');
    gv.addColorStop(0.5, day ? '#a08e72' : dusk ? '#77624f' : '#4c443e');
    gv.addColorStop(1, day ? '#8c7a60' : dusk ? '#5e4c3e' : '#39332f');
    b.fillStyle = gv;
    b.fillRect(0, horizon, W, H - horizon);
    // 砾石颗粒
    for (let i = 0; i < 480; i++) {
      const x = Math.random() * W;
      const y = horizon + Math.random() * (H - horizon);
      const t = (y - horizon) / (H - horizon);
      b.fillStyle = Math.random() < 0.5
        ? `rgba(255,240,214,${rand(0.03, 0.09)})`
        : `rgba(40,30,22,${rand(0.03, 0.08)})`;
      b.fillRect(x, y, rand(1, 2.6) + t * 2, rand(0.8, 2));
    }
    // 车道轮迹：沿院墙内侧淡淡扫过，不穿过喷泉
    b.strokeStyle = 'rgba(62,50,38,0.09)';
    b.lineWidth = Math.max(2.4, W * 0.0038);
    for (const s of [-1, 1]) {
      b.beginPath();
      b.moveTo(W * (0.5 + s * 0.20), H);
      b.bezierCurveTo(W * (0.5 + s * 0.26), H * 0.86, W * (0.5 + s * 0.30), H * 0.72, W * (0.5 + s * 0.36), horizon + H * 0.02);
      b.stroke();
      b.beginPath();
      b.moveTo(W * (0.5 + s * 0.235), H);
      b.bezierCurveTo(W * (0.5 + s * 0.29), H * 0.86, W * (0.5 + s * 0.33), H * 0.72, W * (0.5 + s * 0.385), horizon + H * 0.02);
      b.stroke();
    }
    // 车轮压出的浅坑
    for (let i = 0; i < 16; i++) {
      const t = Math.random();
      const s = i % 2 ? 1 : -1;
      const t2 = 0.04 + t * 0.5;
      const gx = W * (0.5 + s * (0.20 + t2 * 0.16));
      const gy = H - (H - horizon) * t2;
      b.fillStyle = `rgba(58,46,34,${rand(0.03, 0.07)})`;
      b.beginPath(); b.ellipse(gx + rand(-6, 6), gy, W * 0.012, H * 0.004, 0, 0, 6.3); b.fill();
    }
    // 柏树的长影：三层低透明度错位叠出柔边，避免像贴上去的色块
    b.save();
    b.fillStyle = '#1e2418';
    for (let layer = 0; layer < 3; layer++) {
      b.globalAlpha = 0.055;
      const spread = 1 + layer * 0.28;
      for (let i = 0; i < 5; i++) {
        const sx = W * (0.075 + i * 0.055);
        b.beginPath();
        b.moveTo(sx - layer * 2, horizon + H * 0.012);
        b.lineTo(sx + W * 0.155 * spread, horizon + H * 0.235);
        b.lineTo(sx + W * 0.196 * spread, horizon + H * 0.235);
        b.lineTo(sx + W * 0.036, horizon + H * 0.012);
        b.closePath(); b.fill();
      }
    }
    b.restore();
    // 低石墙与薰衣草
    b.fillStyle = day ? '#b6a88e' : dusk ? '#8c7c68' : '#4e463d';
    b.fillRect(0, horizon + H * 0.006, W * 0.185, H * 0.022);
    b.fillRect(W * 0.815, horizon + H * 0.006, W * 0.185, H * 0.022);
    b.fillStyle = 'rgba(255,244,216,0.14)';
    b.fillRect(0, horizon + H * 0.006, W * 0.185, 1.6);
    b.fillRect(W * 0.815, horizon + H * 0.006, W * 0.185, 1.6);
    for (let i = 0; i < 70; i++) {
      const side = i < 35 ? 0 : 1;
      const lxx = side ? W * (0.82 + Math.random() * 0.17) : Math.random() * W * 0.18;
      const lyy = horizon + H * (0.001 + Math.random() * 0.012);
      b.fillStyle = `rgba(${96 + (i % 4) * 12},${70 + (i % 3) * 10},${132 + (i % 5) * 10},${rand(0.25, 0.55)})`;
      b.beginPath();
      b.ellipse(lxx, lyy, rand(2, 5), rand(2.5, 7), rand(-0.3, 0.3), 0, 6.3);
      b.fill();
    }
    // 喷泉：石砌圆池 + 低矮中柱 + 上承水盘，水面只留柔和的天空反光
    const fx = W * 0.5, fBase = horizon + H * 0.118;
    const frx = W * 0.108, fry = H * 0.028;
    b.fillStyle = 'rgba(38,28,20,0.18)';
    b.beginPath(); b.ellipse(fx + W * 0.012, fBase + H * 0.010, frx * 1.06, fry * 0.82, 0, 0, 6.3); b.fill();
    // 外池壁：一圈石沿 + 内壁阴影
    const rim = b.createLinearGradient(0, fBase - fry, 0, fBase + fry);
    rim.addColorStop(0, day ? '#d2c4aa' : dusk ? '#ab987f' : '#6b6153');
    rim.addColorStop(0.55, day ? '#b3a286' : dusk ? '#8b7962' : '#51483d');
    rim.addColorStop(1, day ? '#8b7a62' : dusk ? '#6a5a48' : '#3b352d');
    b.fillStyle = rim;
    b.beginPath(); b.ellipse(fx, fBase, frx, fry, 0, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(46,34,24,0.35)';
    b.beginPath(); b.ellipse(fx, fBase - fry * 0.08, frx * 0.88, fry * 0.66, 0, 0, 6.3); b.fill();
    // 水面
    const water = b.createLinearGradient(0, fBase - fry * 0.62, 0, fBase + fry * 0.5);
    water.addColorStop(0, day ? 'rgba(158,190,202,0.95)' : 'rgba(90,120,140,0.95)');
    water.addColorStop(0.6, day ? 'rgba(92,132,150,0.96)' : 'rgba(52,82,102,0.96)');
    water.addColorStop(1, day ? 'rgba(44,78,94,0.98)' : 'rgba(28,50,66,0.98)');
    b.fillStyle = water;
    b.beginPath(); b.ellipse(fx, fBase - fry * 0.1, frx * 0.84, fry * 0.58, 0, 0, 6.3); b.fill();
    // 水面上的房影与天光
    b.save();
    b.globalAlpha = 0.22;
    b.fillStyle = day ? '#f4e6c6' : '#c9d6e8';
    b.beginPath(); b.ellipse(fx - frx * 0.16, fBase - fry * 0.22, frx * 0.30, fry * 0.16, 0, 0, 6.3); b.fill();
    b.restore();
    b.strokeStyle = 'rgba(236,226,200,0.28)';
    b.lineWidth = 0.9;
    for (let i = 0; i < 5; i++) {
      b.beginPath();
      b.ellipse(fx + rand(-0.36, 0.36) * frx, fBase - fry * 0.12 + rand(-0.2, 0.2) * fry, frx * rand(0.10, 0.26), fry * rand(0.12, 0.26), 0, 0, 6.3);
      b.stroke();
    }
    // 中柱与上盘
    const pedTop = fBase - H * 0.085;
    const pedW = W * 0.020;
    const ped = b.createLinearGradient(fx - pedW, 0, fx + pedW, 0);
    ped.addColorStop(0, day ? '#9c8c72' : dusk ? '#7a6a56' : '#463f34');
    ped.addColorStop(0.35, day ? '#c4b397' : dusk ? '#9c8970' : '#5a5145');
    ped.addColorStop(1, day ? '#8e7e66' : dusk ? '#6d5e4b' : '#3d372e');
    b.fillStyle = ped;
    b.beginPath();
    b.moveTo(fx - pedW, fBase - fry * 0.2);
    b.lineTo(fx - pedW * 0.72, pedTop);
    b.lineTo(fx + pedW * 0.72, pedTop);
    b.lineTo(fx + pedW, fBase - fry * 0.2);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(28,22,16,0.25)';
    b.beginPath(); b.ellipse(fx, fBase - fry * 0.16, pedW * 1.5, fry * 0.22, 0, 0, 6.3); b.fill();
    // 上承水盘：一圈薄薄的石檐
    b.fillStyle = day ? '#c9b99d' : dusk ? '#a08d74' : '#5d5346';
    b.beginPath(); b.ellipse(fx, pedTop, W * 0.042, H * 0.010, 0, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(36,28,20,0.28)';
    b.beginPath(); b.ellipse(fx, pedTop + H * 0.0018, W * 0.036, H * 0.0072, 0, 0, 6.3); b.fill();
    b.fillStyle = day ? '#a8c4cc' : 'rgba(112,146,160,0.85)';
    b.beginPath(); b.ellipse(fx, pedTop + H * 0.0006, W * 0.033, H * 0.0062, 0, 0, 6.3); b.fill();
    b.fillStyle = day ? '#b8a88c' : dusk ? '#8f7d66' : '#534a3e';
    b.fillRect(fx - W * 0.004, pedTop - H * 0.020, W * 0.008, H * 0.020);
    b.beginPath(); b.arc(fx, pedTop - H * 0.021, Math.max(2, W * 0.006), 0, 6.3); b.fill();
    // 四道细水线落入下池
    b.strokeStyle = day ? 'rgba(232,246,250,0.55)' : 'rgba(196,224,236,0.42)';
    b.lineWidth = 1.1;
    for (const s of [-1, -0.4, 0.4, 1]) {
      b.beginPath();
      b.moveTo(fx + s * W * 0.030, pedTop + H * 0.002);
      b.quadraticCurveTo(fx + s * W * 0.046, pedTop + H * 0.032, fx + s * W * 0.050, fBase - fry * 0.15);
      b.stroke();
    }
    b.fillStyle = 'rgba(246,252,254,0.35)';
    for (let i = 0; i < 18; i++) {
      const s = i % 2 ? 1 : -1;
      b.beginPath();
      b.arc(fx + s * rand(0.030, 0.052) * W, pedTop + rand(0.006, 0.07) * H, rand(0.5, 1.2), 0, 6.3);
      b.fill();
    }
    // 柏树夹道：一簇簇叠起来的针叶，越往上越窄，底部有接地影
    const cypress = (cx, cy, hh, ww, tone) => {
      b.fillStyle = 'rgba(30,24,16,0.26)';
      b.beginPath(); b.ellipse(cx + W * 0.006, cy + 2, ww * 0.9, H * 0.006, 0, 0, 6.3); b.fill();
      b.strokeStyle = shade(tone, -22);
      b.lineWidth = Math.max(1.5, ww * 0.09);
      b.beginPath();
      b.moveTo(cx, cy);
      b.quadraticCurveTo(cx + ww * 0.04, cy - hh * 0.5, cx + ww * 0.02, cy - hh * 0.98);
      b.stroke();
      // 收拢的锥形树冠：一条完整轮廓，边缘只做细小的羽状起伏
      const crown = b.createLinearGradient(cx - ww, 0, cx + ww, 0);
      crown.addColorStop(0, shade(tone, -20));
      crown.addColorStop(0.38, shade(tone, 6));
      crown.addColorStop(0.72, tone);
      crown.addColorStop(1, shade(tone, 16));
      b.fillStyle = crown;
      b.beginPath();
      b.moveTo(cx - ww * 0.58, cy);
      b.bezierCurveTo(cx - ww * 0.52, cy - hh * 0.30, cx - ww * 0.30, cy - hh * 0.64, cx - ww * 0.06, cy - hh * 0.86);
      b.quadraticCurveTo(cx - ww * 0.02, cy - hh * 0.93, cx + ww * 0.015, cy - hh * 0.985);
      b.quadraticCurveTo(cx + ww * 0.10, cy - hh * 0.90, cx + ww * 0.20, cy - hh * 0.80);
      b.bezierCurveTo(cx + ww * 0.40, cy - hh * 0.58, cx + ww * 0.54, cy - hh * 0.28, cx + ww * 0.58, cy);
      b.closePath();
      b.fill();
      // 冠缘的羽状小枝：贴着两侧轮廓向外翘
      b.strokeStyle = shade(tone, -12);
      b.lineWidth = Math.max(1, ww * 0.055);
      for (let i = 0; i < 26; i++) {
        const t = 0.08 + (i / 25) * 0.86;
        const yy = cy - hh * t;
        const half = ww * 0.58 * Math.pow(1 - t, 0.72);
        const side = i % 2 ? 1 : -1;
        b.beginPath();
        b.moveTo(cx + side * half * 0.82, yy + hh * 0.012);
        b.quadraticCurveTo(cx + side * half * 1.06, yy - hh * 0.004, cx + side * half * 1.12, yy - hh * 0.016);
        b.stroke();
      }
      // 内部针叶的竖向细纹
      b.strokeStyle = 'rgba(12,18,10,0.30)';
      b.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const t = 0.10 + (i / 13) * 0.80;
        const yy = cy - hh * t;
        const half = ww * 0.52 * Math.pow(1 - t, 0.75);
        const xoff2 = Math.sin(i * 2.7) * half * 0.45;
        b.beginPath();
        b.moveTo(cx + xoff2, yy + hh * 0.022);
        b.quadraticCurveTo(cx + xoff2 + ww * 0.05, yy - hh * 0.006, cx + xoff2 + ww * 0.02, yy - hh * 0.026);
        b.stroke();
      }
      // 右侧边缘的薄光
      b.strokeStyle = 'rgba(226,214,170,0.14)';
      b.lineWidth = 1.2;
      b.beginPath();
      b.moveTo(cx + ww * 0.34, cy - hh * 0.10);
      b.bezierCurveTo(cx + ww * 0.64, cy - hh * 0.38, cx + ww * 0.30, cy - hh * 0.70, cx + ww * 0.02, cy - hh * 0.96);
      b.stroke();
    };
    const cypTone = day ? '#2c3a28' : dusk ? '#242c22' : '#1a2018';
    cypress(W * 0.075, horizon + H * 0.20, H * 0.36, W * 0.030, cypTone);
    cypress(W * 0.135, horizon + H * 0.13, H * 0.33, W * 0.026, cypTone);
    cypress(W * 0.190, horizon + H * 0.06, H * 0.30, W * 0.022, cypTone);
    cypress(W * 0.925, horizon + H * 0.20, H * 0.36, W * 0.030, cypTone);
    cypress(W * 0.865, horizon + H * 0.13, H * 0.33, W * 0.026, cypTone);
    cypress(W * 0.810, horizon + H * 0.06, H * 0.30, W * 0.022, cypTone);
    // 门柱与敞开的铁艺大门
    for (const side of [-1, 1]) {
      const px2 = W * (0.5 + side * 0.485);
      const ptop = horizon - H * 0.115;
      const pw2 = W * 0.055;
      const pg = b.createLinearGradient(px2 - pw2 / 2, 0, px2 + pw2 / 2, 0);
      pg.addColorStop(0, day ? '#c2b396' : dusk ? '#97866f' : '#5c5348');
      pg.addColorStop(0.55, day ? '#a8977a' : dusk ? '#82715c' : '#4a4238');
      pg.addColorStop(1, day ? '#8b7a60' : dusk ? '#655744' : '#38322a');
      b.fillStyle = pg;
      b.fillRect(px2 - pw2 / 2, ptop, pw2, H - ptop);
      b.fillStyle = shade(day ? '#c2b396' : dusk ? '#97866f' : '#5c5348', -8);
      b.fillRect(px2 - pw2 * 0.62, ptop - H * 0.02, pw2 * 1.24, H * 0.024);
      b.fillRect(px2 - pw2 * 0.56, ptop - H * 0.028, pw2 * 1.12, H * 0.012);
      for (let i = 0; i < 16; i++) {
        b.fillStyle = `rgba(${120 + (i % 4) * 18},${40 + (i % 3) * 16},${32 + (i % 2) * 12},${rand(0.25, 0.55)})`;
        b.beginPath();
        b.arc(px2 + rand(-0.55, 0.55) * pw2, ptop + rand(0, 0.55) * (H - ptop), rand(1.5, 4), 0, 6.3);
        b.fill();
      }
    }
    b.save();
    b.strokeStyle = 'rgba(22,20,18,0.9)';
    b.lineWidth = Math.max(1.3, W * 0.0016);
    b.lineCap = 'round';
    for (const side of [-1, 1]) {
      const hingeX = W * (0.5 + side * 0.4575);
      const tipX = W * (0.5 + side * 0.338);
      const topY = horizon - H * 0.055;
      const botY = H * 0.93;
      const fade = b.createLinearGradient(0, topY, 0, botY);
      fade.addColorStop(0, 'rgba(24,22,20,0.95)');
      fade.addColorStop(0.7, 'rgba(24,22,20,0.9)');
      fade.addColorStop(1, 'rgba(24,22,20,0.55)');
      b.strokeStyle = fade;
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const bx1 = hingeX + (tipX - hingeX) * t;
        const ty = topY - (1 - t) * H * 0.018;
        b.beginPath(); b.moveTo(bx1, botY); b.lineTo(bx1, ty); b.stroke();
        b.fillStyle = 'rgba(22,20,18,0.9)';
        b.beginPath(); b.arc(bx1, ty - Math.max(1, W * 0.002), Math.max(1.2, W * 0.002), 0, 6.3); b.fill();
      }
      // 顶沿随门扇微微向外倾斜
      b.beginPath();
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const bx1 = hingeX + (tipX - hingeX) * t;
        const ty = topY - (1 - t) * H * 0.018;
        if (i === 0) b.moveTo(bx1, ty); else b.lineTo(bx1, ty);
      }
      b.stroke();
      // 中部横撑
      b.beginPath();
      b.moveTo(hingeX, horizon + H * 0.055);
      b.lineTo(tipX, horizon + H * 0.048);
      b.stroke();
      // 门扇收头的一枚涡卷
      b.beginPath();
      b.arc(tipX - side * W * 0.010, topY + H * 0.016, W * 0.013, -0.4, 3.8);
      b.stroke();
      b.beginPath();
      b.arc(tipX - side * W * 0.016, topY + H * 0.030, W * 0.008, 0.4, 4.6);
      b.stroke();
      // 枪尖
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const bx1 = hingeX + (tipX - hingeX) * t;
        const ty = topY - (1 - t) * H * 0.018;
        b.fillStyle = 'rgba(22,20,18,0.9)';
        b.beginPath();
        b.moveTo(bx1 - W * 0.0032, ty - Math.max(1.2, W * 0.002));
        b.lineTo(bx1, ty - H * 0.011);
        b.lineTo(bx1 + W * 0.0032, ty - Math.max(1.2, W * 0.002));
        b.closePath(); b.fill();
      }
    }
    b.restore();
    // 阳光落在庭院上
    b.save();
    b.globalCompositeOperation = 'lighter';
    const sun = b.createRadialGradient(W * 0.82, horizon - H * 0.05, 0, W * 0.82, horizon - H * 0.05, W * 0.5);
    sun.addColorStop(0, 'rgba(255,214,150,0.16)');
    sun.addColorStop(1, 'rgba(255,200,130,0)');
    b.fillStyle = sun;
    b.fillRect(W * 0.3, horizon - H * 0.1, W * 0.7, H * 0.5);
    b.restore();
  };

  /* ---------- 场景：庄园一楼起居室 ---------- */
  function drawDrawingroom(b, p, horizon) {
    const day = state.time === 'day';
    const dusk = state.time === 'dusk';
    // 米灰色石灰泥墙：暖而不亮，留出壁炉与窗的光
    const wallG = b.createLinearGradient(0, 0, 0, horizon);
    wallG.addColorStop(0, day ? '#b6a98e' : dusk ? '#8a7a66' : '#5e5548');
    wallG.addColorStop(0.55, day ? '#c6b89c' : dusk ? '#9a8872' : '#6a5f50');
    wallG.addColorStop(1, day ? '#b3a488' : dusk ? '#87765f' : '#5a5043');
    b.fillStyle = wallG;
    b.fillRect(0, 0, W, horizon);
    // 灰泥的细碎斑驳与雨水旧痕
    for (let i = 0; i < 130; i++) {
      b.fillStyle = Math.random() < 0.55
        ? `rgba(255,244,222,${rand(0.012, 0.04)})`
        : `rgba(60,46,32,${rand(0.01, 0.03)})`;
      b.beginPath();
      b.ellipse(Math.random() * W, Math.random() * horizon, rand(5, 36), rand(2, 12), rand(-0.4, 0.4), 0, 6.3);
      b.fill();
    }
    // 墙面暗纹：极淡的对花墙纸，只在近看时显形
    b.save();
    b.strokeStyle = day ? 'rgba(122,100,72,0.055)' : dusk ? 'rgba(60,48,34,0.09)' : 'rgba(30,24,18,0.11)';
    b.lineWidth = 1;
    for (let ry = 0; ry < 5; ry++) {
      const yy = H * (0.135 + ry * 0.082);
      const off = (ry % 2) * W * 0.031;
      for (let cx5 = W * 0.020 + off; cx5 < W; cx5 += W * 0.062) {
        b.beginPath();
        b.moveTo(cx5, yy - H * 0.010);
        b.quadraticCurveTo(cx5 + W * 0.010, yy - H * 0.002, cx5, yy + H * 0.010);
        b.quadraticCurveTo(cx5 - W * 0.010, yy - H * 0.002, cx5, yy - H * 0.010);
        b.stroke();
        b.beginPath(); b.arc(cx5, yy, Math.max(0.8, W * 0.0015), 0, 6.3); b.fillStyle = b.strokeStyle; b.fill();
        // 上下两片小卷叶
        b.beginPath();
        b.moveTo(cx5, yy - H * 0.011);
        b.quadraticCurveTo(cx5 + W * 0.005, yy - H * 0.019, cx5 + W * 0.001, yy - H * 0.024);
        b.stroke();
        b.beginPath();
        b.moveTo(cx5, yy + H * 0.011);
        b.quadraticCurveTo(cx5 - W * 0.005, yy + H * 0.019, cx5 - W * 0.001, yy + H * 0.024);
        b.stroke();
      }
    }
    b.restore();
    // 墙面的木框线脚：外道阴线 + 内侧高光，给大片墙面一点手工感
    const panelBot = horizon - H * 0.158;
    for (let i = 0; i < 6; i++) {
      const px1 = W * (0.022 + i * 0.168);
      const pw1 = W * 0.142;
      b.strokeStyle = day ? 'rgba(92,74,52,0.16)' : dusk ? 'rgba(38,28,18,0.30)' : 'rgba(16,12,8,0.36)';
      b.lineWidth = Math.max(2, W * 0.0021);
      b.strokeRect(px1, H * 0.108, pw1, panelBot - H * 0.108);
      b.strokeStyle = day ? 'rgba(255,248,230,0.20)' : 'rgba(226,202,166,0.07)';
      b.lineWidth = Math.max(1, W * 0.0012);
      b.strokeRect(px1 + W * 0.004, H * 0.108 + H * 0.004, pw1 - W * 0.008, panelBot - H * 0.108 - H * 0.008);
    }
    // 顶角线
    b.fillStyle = day ? '#d8ccb2' : dusk ? '#a3947c' : '#776b58';
    b.fillRect(0, H * 0.035, W, H * 0.022);
    b.fillStyle = 'rgba(40,30,22,0.22)';
    b.fillRect(0, H * 0.057, W, H * 0.006);
    // 下半墙的胡桃木护墙板
    const wainTop = horizon - H * 0.145;
    const wain = b.createLinearGradient(0, wainTop, 0, horizon);
    wain.addColorStop(0, day ? '#5d452f' : dusk ? '#4a3628' : '#2f231c');
    wain.addColorStop(1, day ? '#472f20' : dusk ? '#38271d' : '#241a14');
    b.fillStyle = wain;
    b.fillRect(0, wainTop, W, horizon - wainTop);
    for (let i = 0; i < 9; i++) {
      const px0 = W * (0.015 + i * 0.112);
      b.strokeStyle = 'rgba(20,12,8,0.35)';
      b.lineWidth = 1;
      b.strokeRect(px0, wainTop + H * 0.018, W * 0.09, horizon - wainTop - H * 0.03);
      b.strokeStyle = 'rgba(255,222,180,0.05)';
      b.strokeRect(px0 + 2, wainTop + H * 0.02, W * 0.09 - 4, horizon - wainTop - H * 0.034);
    }
    b.fillStyle = day ? '#6c5238' : dusk ? '#57402e' : '#392a20';
    b.fillRect(0, wainTop - H * 0.008, W, H * 0.010);
    // 壁炉：石砌炉口、木柴与火光
    const fx = W * 0.105, fw = W * 0.235, ftop = horizon - H * 0.245, fbase = horizon;
    b.fillStyle = day ? '#cac0aa' : dusk ? '#9e907a' : '#6b6152';
    b.fillRect(fx, ftop, fw, fbase - ftop);
    b.fillStyle = 'rgba(255,250,238,0.10)';
    b.fillRect(fx, ftop, fw * 0.06, fbase - ftop);
    b.fillStyle = 'rgba(30,22,16,0.18)';
    b.fillRect(fx + fw * 0.94, ftop, fw * 0.06, fbase - ftop);
    // 壁炉石材的云纹：极淡的灰线，避开整块平涂
    b.strokeStyle = 'rgba(118,104,86,0.10)';
    b.lineWidth = 1;
    for (let v = 0; v < 7; v++) {
      const vy = ftop + H * (0.026 + v * 0.030);
      b.beginPath();
      b.moveTo(fx + W * 0.004, vy);
      b.bezierCurveTo(
        fx + fw * 0.28, vy - H * 0.011,
        fx + fw * 0.56, vy + H * 0.009,
        fx + fw - W * 0.004, vy - H * 0.005
      );
      b.stroke();
    }
    // 炉台
    b.fillStyle = day ? '#d6cbb4' : dusk ? '#a99a82' : '#766a58';
    b.fillRect(fx - W * 0.018, ftop - H * 0.018, fw + W * 0.036, H * 0.024);
    b.fillStyle = 'rgba(40,30,20,0.25)';
    b.fillRect(fx - W * 0.018, ftop + H * 0.006, fw + W * 0.036, H * 0.004);
    // 炉口
    const oh = H * 0.155, ow = fw * 0.62, ox = fx + fw * 0.19, ob = fbase;
    b.fillStyle = '#150f0c';
    b.beginPath();
    b.moveTo(ox, ob);
    b.lineTo(ox, ob - oh + ow * 0.42);
    b.quadraticCurveTo(ox, ob - oh, ox + ow / 2, ob - oh + H * 0.004);
    b.quadraticCurveTo(ox + ow, ob - oh, ox + ow, ob - oh + ow * 0.42);
    b.lineTo(ox + ow, ob);
    b.closePath(); b.fill();
    // 炉膛内壁的耐火砖
    b.save();
    b.beginPath();
    b.moveTo(ox, ob);
    b.lineTo(ox, ob - oh + ow * 0.42);
    b.quadraticCurveTo(ox, ob - oh, ox + ow / 2, ob - oh + H * 0.004);
    b.quadraticCurveTo(ox + ow, ob - oh, ox + ow, ob - oh + ow * 0.42);
    b.lineTo(ox + ow, ob);
    b.closePath(); b.clip();
    b.strokeStyle = 'rgba(88,58,40,0.28)';
    b.lineWidth = 1;
    for (let r = 0; r < 6; r++) {
      const yy = ob - oh * 0.06 - r * oh * 0.15;
      b.beginPath(); b.moveTo(ox, yy); b.lineTo(ox + ow, yy); b.stroke();
      for (let x0 = ox + (r % 2) * ow * 0.1; x0 < ox + ow; x0 += ow * 0.2) {
        b.beginPath(); b.moveTo(x0, yy); b.lineTo(x0, yy - oh * 0.15); b.stroke();
      }
    }
    // 火：柔和的炉膛底色 + 跳动的火舌
    const fg = b.createRadialGradient(ox + ow / 2, ob - H * 0.035, 0, ox + ow / 2, ob - H * 0.035, ow * 0.72);
    fg.addColorStop(0, 'rgba(255,206,118,0.72)');
    fg.addColorStop(0.45, 'rgba(226,132,52,0.34)');
    fg.addColorStop(1, 'rgba(120,48,16,0)');
    b.fillStyle = fg;
    b.fillRect(ox, ob - oh, ow, oh);
    // 火舌：长短不一的泪滴形，向外舔舐，叠加出层次
    const baseY = ob - H * 0.017;
    const tongues = [
      { x: 0.33, h: 0.30, w: 0.045, sway: -0.020, warm: 0.62 },
      { x: 0.47, h: 0.44, w: 0.055, sway: 0.014, warm: 0.72 },
      { x: 0.61, h: 0.34, w: 0.046, sway: -0.012, warm: 0.60 },
      { x: 0.40, h: 0.20, w: 0.032, sway: 0.016, warm: 0.50 },
      { x: 0.55, h: 0.24, w: 0.036, sway: -0.018, warm: 0.55 },
    ];
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (const tg of tongues) {
      const flx = ox + ow * tg.x;
      const flh = oh * tg.h;
      const fw2 = ow * tg.w;
      const tipX = flx + ow * tg.sway;
      const flame = b.createLinearGradient(0, baseY - flh, 0, baseY);
      flame.addColorStop(0, 'rgba(255,232,168,0)');
      flame.addColorStop(0.28, `rgba(255,212,120,${0.18 * tg.warm + 0.10})`);
      flame.addColorStop(0.62, `rgba(255,170,68,${0.34 + 0.18 * tg.warm})`);
      flame.addColorStop(1, `rgba(255,120,36,${0.50 + 0.20 * tg.warm})`);
      b.fillStyle = flame;
      b.beginPath();
      b.moveTo(flx - fw2, baseY);
      b.bezierCurveTo(flx - fw2 * 1.05, baseY - flh * 0.34, flx - fw2 * 0.72 + ow * tg.sway * 0.4, baseY - flh * 0.72, tipX, baseY - flh);
      b.bezierCurveTo(flx + fw2 * 0.62 + ow * tg.sway * 0.4, baseY - flh * 0.70, flx + fw2 * 1.02, baseY - flh * 0.30, flx + fw2, baseY);
      b.quadraticCurveTo(flx, baseY + H * 0.004, flx - fw2, baseY);
      b.closePath(); b.fill();
    }
    // 焰心：贴着柴堆的明亮内焰
    for (const tg of tongues.slice(0, 3)) {
      const flx = ox + ow * tg.x;
      const flh = oh * tg.h * 0.52;
      const fw2 = ow * tg.w * 0.52;
      const core = b.createLinearGradient(0, baseY - flh, 0, baseY);
      core.addColorStop(0, 'rgba(255,250,214,0)');
      core.addColorStop(0.55, 'rgba(255,244,190,0.34)');
      core.addColorStop(1, 'rgba(255,220,132,0.55)');
      b.fillStyle = core;
      b.beginPath();
      b.moveTo(flx - fw2, baseY);
      b.quadraticCurveTo(flx - fw2 * 0.55, baseY - flh * 0.65, flx + ow * tg.sway * 0.5, baseY - flh);
      b.quadraticCurveTo(flx + fw2 * 0.70, baseY - flh * 0.55, flx + fw2, baseY);
      b.closePath(); b.fill();
    }
    b.restore();
    // 木柴：断面、树皮裂纹与烧红的裂缝
    for (let i = 0; i < 3; i++) {
      const lx = ox + ow * (0.30 + i * 0.20);
      b.save();
      b.translate(lx, ob - H * 0.019);
      b.rotate(-0.20 + i * 0.17);
      const lg = b.createLinearGradient(0, -H * 0.010, 0, H * 0.010);
      lg.addColorStop(0, i === 1 ? '#3c2712' : '#33200e');
      lg.addColorStop(0.45, '#241708');
      lg.addColorStop(1, '#150d05');
      b.fillStyle = lg;
      b.beginPath();
      b.ellipse(0, 0, ow * 0.155, H * 0.0092, 0, 0, 6.3);
      b.fill();
      // 树皮裂纹
      b.strokeStyle = 'rgba(96,70,40,0.35)';
      b.lineWidth = 0.9;
      for (let k = 0; k < 3; k++) {
        const kx = -ow * 0.10 + k * ow * 0.08;
        b.beginPath();
        b.moveTo(kx, -H * 0.007);
        b.quadraticCurveTo(kx + ow * 0.012, 0, kx - ow * 0.006, H * 0.007);
        b.stroke();
      }
      // 烧红的裂缝
      b.strokeStyle = `rgba(255,${150 + (i % 2) * 26},${56 + i * 10},0.55)`;
      b.lineWidth = 1.4;
      b.beginPath();
      b.moveTo(-ow * 0.11, -H * 0.002);
      b.quadraticCurveTo(-ow * 0.02, H * 0.004, ow * 0.10, -H * 0.001);
      b.stroke();
      b.restore();
    }
    // 灰烬与飞起的火星
    for (let i = 0; i < 14; i++) {
      b.fillStyle = `rgba(255,${150 + (i % 4) * 20},${60 + (i % 3) * 18},${rand(0.25, 0.6)})`;
      b.beginPath();
      b.arc(ox + ow * rand(0.18, 0.82), ob - H * rand(0.008, 0.032), rand(0.7, 1.7), 0, 6.3);
      b.fill();
    }
    b.restore();
    // 炉前的黄铜围栏
    b.strokeStyle = 'rgba(150,124,64,0.7)';
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(fx + fw * 0.16, fbase - H * 0.018);
    b.lineTo(fx + fw * 0.84, fbase - H * 0.018);
    b.stroke();
    for (let i = 0; i < 7; i++) {
      const bx2 = fx + fw * (0.18 + i * 0.11);
      b.beginPath(); b.moveTo(bx2, fbase - H * 0.018); b.lineTo(bx2, fbase - H * 0.002); b.stroke();
    }
    // 炉口上方的旧石雕与镜子
    b.fillStyle = 'rgba(0,0,0,0.26)';
    b.fillRect(fx + fw * 0.30, ftop - H * 0.20, fw * 0.40, H * 0.15);
    goldFrame(b, fx + fw * 0.32, ftop - H * 0.195, fw * 0.36, H * 0.14, Math.max(3, W * 0.005), '#8c6b38');
    const mir = b.createLinearGradient(0, ftop - H * 0.19, 0, ftop - H * 0.06);
    mir.addColorStop(0, day ? '#a9b1ae' : '#5e6662');
    mir.addColorStop(0.5, day ? '#c9cbc0' : '#74766e');
    mir.addColorStop(1, day ? '#9aa19a' : '#50544e');
    b.fillStyle = mir;
    b.fillRect(fx + fw * 0.32, ftop - H * 0.195, fw * 0.36, H * 0.14);
    b.fillStyle = 'rgba(255,244,220,0.18)';
    b.beginPath();
    b.moveTo(fx + fw * 0.35, ftop - H * 0.19);
    b.lineTo(fx + fw * 0.44, ftop - H * 0.19);
    b.lineTo(fx + fw * 0.36, ftop - H * 0.06);
    b.lineTo(fx + fw * 0.33, ftop - H * 0.06);
    b.closePath(); b.fill();
    // 炉台上的一对烛台与座钟
    b.fillStyle = '#8c7434';
    for (const cx0 of [fx + fw * 0.06, fx + fw * 0.94]) {
      b.fillRect(cx0 - W * 0.003, ftop - H * 0.055, W * 0.006, H * 0.03);
      b.fillRect(cx0 - W * 0.007, ftop - H * 0.026, W * 0.014, W * 0.006);
      b.fillStyle = '#ffe0a2';
      b.beginPath(); b.arc(cx0, ftop - H * 0.058, Math.max(1.2, W * 0.002), 0, 6.3); b.fill();
      b.fillStyle = '#8c7434';
    }
    b.fillStyle = '#5a4328';
    b.fillRect(fx + fw * 0.47, ftop - H * 0.065, fw * 0.06, H * 0.05);
    b.fillStyle = '#d8cba6';
    b.beginPath(); b.arc(fx + fw * 0.5, ftop - H * 0.043, W * 0.005, 0, 6.3); b.fill();
    // 右侧落地窗：普罗旺斯的庭院
    const wx0 = W * 0.695, ww0 = W * 0.20, wTop = H * 0.105, wBot = horizon - H * 0.012;
    b.fillStyle = day ? '#cbbfa6' : dusk ? '#96866f' : '#5e5547';
    b.fillRect(wx0 - W * 0.012, wTop - H * 0.012, ww0 + W * 0.024, wBot - wTop + H * 0.012);
    b.save();
    b.beginPath(); b.rect(wx0, wTop, ww0, wBot - wTop); b.clip();
    const sky2 = b.createLinearGradient(0, wTop, 0, wBot);
    sky2.addColorStop(0, day ? '#9fc0d8' : dusk ? '#e0a078' : '#3f3f5e');
    sky2.addColorStop(0.55, day ? '#c6d6d4' : dusk ? '#c08060' : '#2c2c46');
    sky2.addColorStop(1, day ? '#aebd9a' : dusk ? '#6c5a4e' : '#1d1d30');
    b.fillStyle = sky2;
    b.fillRect(wx0, wTop, ww0, wBot - wTop);
    // 远处山脊（两层）
    b.fillStyle = day ? 'rgba(132,146,132,0.55)' : dusk ? 'rgba(98,78,80,0.6)' : 'rgba(40,42,64,0.85)';
    b.beginPath();
    b.moveTo(wx0, wBot - (wBot - wTop) * 0.34);
    b.quadraticCurveTo(wx0 + ww0 * 0.26, wBot - (wBot - wTop) * 0.46, wx0 + ww0 * 0.52, wBot - (wBot - wTop) * 0.36);
    b.quadraticCurveTo(wx0 + ww0 * 0.78, wBot - (wBot - wTop) * 0.44, wx0 + ww0, wBot - (wBot - wTop) * 0.33);
    b.lineTo(wx0 + ww0, wBot);
    b.lineTo(wx0, wBot);
    b.closePath(); b.fill();
    // 中景的柏树列与葡萄园
    b.fillStyle = day ? 'rgba(74,96,64,0.85)' : dusk ? 'rgba(58,62,44,0.85)' : 'rgba(22,28,26,0.9)';
    b.beginPath();
    b.moveTo(wx0, wBot - (wBot - wTop) * 0.20);
    b.quadraticCurveTo(wx0 + ww0 * 0.4, wBot - (wBot - wTop) * 0.26, wx0 + ww0, wBot - (wBot - wTop) * 0.18);
    b.lineTo(wx0 + ww0, wBot);
    b.lineTo(wx0, wBot);
    b.closePath(); b.fill();
    const cypressMini = (cx, baseY, hh, ww2, tone) => {
      // 一整片带毛边的锥形，避免一粒粒堆叠
      b.fillStyle = tone;
      b.beginPath();
      b.moveTo(cx - ww2 * 0.55, baseY);
      const steps = 7;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const yy = baseY - hh * t;
        const half = ww2 * (1 - t) * (0.62 + 0.10 * Math.sin(i * 2.1));
        b.quadraticCurveTo(cx - half * 0.8, yy + hh * 0.05, cx - half, yy);
      }
      for (let i = steps; i >= 1; i--) {
        const t = i / steps;
        const yy = baseY - hh * t;
        const half = ww2 * (1 - t) * (0.62 + 0.10 * Math.sin(i * 2.1));
        b.quadraticCurveTo(cx + half * 0.8, yy + hh * 0.05, cx + half, yy);
      }
      b.lineTo(cx + ww2 * 0.55, baseY);
      b.closePath();
      b.fill();
      b.strokeStyle = 'rgba(214,226,190,0.12)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(cx + ww2 * 0.08, baseY - hh * 0.12);
      b.quadraticCurveTo(cx + ww2 * 0.22, baseY - hh * 0.45, cx + ww2 * 0.02, baseY - hh * 0.86);
      b.stroke();
    };
    const cypTone2 = day ? '#3a4a30' : dusk ? '#2e3226' : '#161a20';
    cypressMini(wx0 + ww0 * 0.36, wBot - (wBot - wTop) * 0.02, (wBot - wTop) * 0.56, ww0 * 0.060, cypTone2);
    cypressMini(wx0 + ww0 * 0.62, wBot - (wBot - wTop) * 0.03, (wBot - wTop) * 0.40, ww0 * 0.044, cypTone2);
    cypressMini(wx0 + ww0 * 0.86, wBot - (wBot - wTop) * 0.02, (wBot - wTop) * 0.50, ww0 * 0.050, cypTone2);
    // 庭院里一条被阳光照亮的小径
    b.fillStyle = day ? 'rgba(226,216,182,0.55)' : dusk ? 'rgba(196,168,140,0.35)' : 'rgba(64,66,86,0.3)';
    b.beginPath();
    b.moveTo(wx0 + ww0 * 0.46, wBot);
    b.lineTo(wx0 + ww0 * 0.54, wBot);
    b.lineTo(wx0 + ww0 * 0.60, wBot - (wBot - wTop) * 0.22);
    b.lineTo(wx0 + ww0 * 0.56, wBot - (wBot - wTop) * 0.22);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(255,246,214,0.14)';
    b.fillRect(wx0, wTop, ww0, (wBot - wTop) * 0.30);
    // 玻璃反光：两斜条冷光，打破整块平涂的玻璃
    b.fillStyle = day ? 'rgba(214,232,238,0.15)' : dusk ? 'rgba(255,208,164,0.10)' : 'rgba(126,144,192,0.09)';
    b.beginPath();
    b.moveTo(wx0 + ww0 * 0.055, wTop);
    b.lineTo(wx0 + ww0 * 0.300, wTop);
    b.lineTo(wx0 + ww0 * 0.085, wBot);
    b.lineTo(wx0 + ww0 * 0.020, wBot);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(255,255,255,0.05)';
    b.beginPath();
    b.moveTo(wx0 + ww0 * 0.70, wTop);
    b.lineTo(wx0 + ww0 * 0.77, wTop);
    b.lineTo(wx0 + ww0 * 0.56, wBot);
    b.lineTo(wx0 + ww0 * 0.52, wBot);
    b.closePath(); b.fill();
    b.restore();
    // 窗棂与薄纱帘
    b.strokeStyle = 'rgba(52,40,30,0.92)';
    b.lineWidth = Math.max(3, W * 0.005);
    b.strokeRect(wx0, wTop, ww0, wBot - wTop);
    b.beginPath();
    b.moveTo(wx0 + ww0 / 2, wTop); b.lineTo(wx0 + ww0 / 2, wBot); b.stroke();
    for (let i = 1; i < 3; i++) {
      const yy = wTop + (wBot - wTop) * i / 3;
      b.beginPath(); b.moveTo(wx0, yy); b.lineTo(wx0 + ww0, yy); b.stroke();
    }
    b.fillStyle = day ? 'rgba(246,240,224,0.22)' : dusk ? 'rgba(216,192,168,0.15)' : 'rgba(140,150,176,0.10)';
    b.beginPath();
    b.moveTo(wx0 - W * 0.006, wTop);
    b.lineTo(wx0 + ww0 * 0.26, wTop);
    b.quadraticCurveTo(wx0 + ww0 * 0.16, (wTop + wBot) / 2, wx0 + ww0 * 0.22, wBot);
    b.lineTo(wx0 - W * 0.006, wBot);
    b.closePath(); b.fill();
    // 薄纱的竖向褶痕
    b.strokeStyle = 'rgba(255,252,244,0.10)';
    b.lineWidth = 1;
    for (let ci = 0; ci < 3; ci++) {
      const fx2 = wx0 + ww0 * (0.030 + ci * 0.065);
      b.beginPath();
      b.moveTo(fx2, wTop + H * 0.004);
      b.quadraticCurveTo(fx2 + ww0 * 0.012 - ci * ww0 * 0.018, (wTop + wBot) / 2, fx2 - ww0 * 0.010 + ci * ww0 * 0.008, wBot - H * 0.002);
      b.stroke();
    }
    // 右侧同款薄纱帘
    b.fillStyle = day ? 'rgba(246,240,224,0.18)' : dusk ? 'rgba(216,192,168,0.12)' : 'rgba(140,150,176,0.08)';
    b.beginPath();
    b.moveTo(wx0 + ww0 + W * 0.006, wTop);
    b.lineTo(wx0 + ww0 * 0.76, wTop);
    b.quadraticCurveTo(wx0 + ww0 * 0.84, (wTop + wBot) / 2, wx0 + ww0 * 0.79, wBot);
    b.lineTo(wx0 + ww0 + W * 0.006, wBot);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(255,252,244,0.08)';
    for (let ci = 0; ci < 3; ci++) {
      const fx2 = wx0 + ww0 * (0.97 - ci * 0.060);
      b.beginPath();
      b.moveTo(fx2, wTop + H * 0.004);
      b.quadraticCurveTo(fx2 - ww0 * 0.010 + ci * ww0 * 0.014, (wTop + wBot) / 2, fx2 + ww0 * 0.008 - ci * ww0 * 0.006, wBot - H * 0.002);
      b.stroke();
    }
    // 帘杆
    b.fillStyle = '#4a3a26';
    b.fillRect(wx0 - W * 0.022, wTop - H * 0.022, ww0 + W * 0.044, H * 0.007);
    b.fillStyle = '#8c7434';
    b.beginPath(); b.arc(wx0 - W * 0.022, wTop - H * 0.019, W * 0.006, 0, 6.3); b.fill();
    b.beginPath(); b.arc(wx0 + ww0 + W * 0.022, wTop - H * 0.019, W * 0.006, 0, 6.3); b.fill();
    // 墙上的两幅小风景
    goldFrame(b, W * 0.375, H * 0.20, W * 0.085, H * 0.105, Math.max(3, W * 0.005), '#7c5e32');
    smallLandscape(b, W * 0.375, H * 0.20, W * 0.085, H * 0.105, 3);
    goldFrame(b, W * 0.485, H * 0.225, W * 0.070, H * 0.088, Math.max(3, W * 0.0045), '#7c5e32');
    smallLandscape(b, W * 0.485, H * 0.225, W * 0.070, H * 0.088, 5);
    // 侧门（埃莱娜进入）
    const dx0 = W * 0.90, dTop = H * 0.14, dBot = horizon;
    b.fillStyle = '#3a2a1e';
    b.fillRect(dx0, dTop, W * 0.095, dBot - dTop);
    b.fillStyle = 'rgba(255,232,190,0.10)';
    b.fillRect(dx0 + W * 0.004, dTop + H * 0.004, W * 0.028, dBot - dTop - H * 0.008);
    b.strokeStyle = 'rgba(20,12,8,0.6)';
    b.lineWidth = 1;
    b.strokeRect(dx0, dTop, W * 0.095, dBot - dTop);
    // 火光在墙上的暖晕
    b.save();
    b.globalCompositeOperation = 'lighter';
    const fglow = b.createRadialGradient(fx + fw / 2, fbase - H * 0.02, 0, fx + fw / 2, fbase - H * 0.02, W * 0.22);
    fglow.addColorStop(0, 'rgba(255,178,92,0.14)');
    fglow.addColorStop(1, 'rgba(255,160,70,0)');
    b.fillStyle = fglow;
    b.beginPath(); b.arc(fx + fw / 2, fbase - H * 0.02, W * 0.22, 0, 6.3); b.fill();
    b.restore();
  }
  drawDrawingroom.ground = function (b, p, horizon) {
    const day = state.time === 'day';
    const dusk = state.time === 'dusk';
    // 拼花木地板
    const floor = b.createLinearGradient(0, horizon, 0, H);
    floor.addColorStop(0, day ? '#6a4c30' : dusk ? '#4a3423' : '#2a1d15');
    floor.addColorStop(1, day ? '#4c3420' : dusk ? '#332317' : '#1a120d');
    b.fillStyle = floor;
    b.fillRect(0, horizon, W, H - horizon);
    // 地板：向远处收束的拼木长条
    b.strokeStyle = 'rgba(16,10,6,0.26)';
    b.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const bx = W * (i / 21);
      b.beginPath();
      b.moveTo(bx, H);
      b.lineTo(W * 0.5 + (bx - W * 0.5) * 0.32, horizon);
      b.stroke();
    }
    b.strokeStyle = 'rgba(255,214,160,0.035)';
    for (let i = 0; i < 9; i++) {
      const yy = horizon + (H - horizon) * (0.10 + i * 0.11);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    // 拼木的深浅交替：沿透视方向铺开的窄长条
    for (let i = 0; i < 22; i += 2) {
      const bx1 = W * (i / 21), bx2 = W * ((i + 1) / 21);
      b.fillStyle = 'rgba(255,206,150,0.020)';
      b.beginPath();
      b.moveTo(bx1, H);
      b.lineTo(W * 0.5 + (bx1 - W * 0.5) * 0.32, horizon);
      b.lineTo(W * 0.5 + (bx2 - W * 0.5) * 0.32, horizon);
      b.lineTo(bx2, H);
      b.closePath(); b.fill();
    }
    // 旧地毯：透视梯形，带双道边框与褪色的团花
    const rugTop = H * 0.695, rugBot = H * 0.965;
    const rugTL = W * 0.235, rugTR = W * 0.765, rugBL = W * 0.105, rugBR = W * 0.895;
    const rug = (inset, fill) => {
      const tl = rugTL + (rugBL - rugTL) * inset;
      const tr = rugTR + (rugBR - rugTR) * inset;
      const bl = rugBL + (rugTL - rugBL) * inset * 0.12;
      const br = rugBR + (rugTR - rugBR) * inset * 0.12;
      b.beginPath();
      b.moveTo(tl, rugTop + (rugBot - rugTop) * inset * 0.14);
      b.lineTo(tr, rugTop + (rugBot - rugTop) * inset * 0.14);
      b.lineTo(br, rugBot - (rugBot - rugTop) * inset * 0.10);
      b.lineTo(bl, rugBot - (rugBot - rugTop) * inset * 0.10);
      b.closePath();
      b.fillStyle = fill;
      b.fill();
    };
    rug(0, day ? 'rgba(98,48,44,0.86)' : dusk ? 'rgba(78,40,40,0.82)' : 'rgba(52,26,30,0.78)');
    rug(0.055, day ? 'rgba(138,96,58,0.55)' : dusk ? 'rgba(108,76,50,0.5)' : 'rgba(70,48,38,0.5)');
    rug(0.075, day ? 'rgba(84,42,42,0.88)' : dusk ? 'rgba(66,34,36,0.84)' : 'rgba(44,22,26,0.84)');
    // 地毯中心的褪色团花：只留两圈细线与小菱纹，避免抢戏
    b.strokeStyle = 'rgba(196,156,108,0.16)';
    b.lineWidth = Math.max(1.2, W * 0.0012);
    b.beginPath();
    b.ellipse(W * 0.5, H * 0.818, W * 0.115, H * 0.030, 0, 0, 6.3);
    b.stroke();
    b.strokeStyle = 'rgba(196,156,108,0.10)';
    b.beginPath();
    b.ellipse(W * 0.5, H * 0.818, W * 0.150, H * 0.040, 0, 0, 6.3);
    b.stroke();
    b.fillStyle = 'rgba(196,156,108,0.12)';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const mx2 = W * 0.5 + Math.cos(a) * W * 0.135;
      const my2 = H * 0.818 + Math.sin(a) * H * 0.035;
      b.beginPath();
      b.moveTo(mx2, my2 - H * 0.006);
      b.lineTo(mx2 + W * 0.009, my2);
      b.lineTo(mx2, my2 + H * 0.006);
      b.lineTo(mx2 - W * 0.009, my2);
      b.closePath(); b.fill();
    }
    // 地毯的细碎织纹
    b.strokeStyle = 'rgba(28,14,16,0.07)';
    b.lineWidth = 0.8;
    for (let i = 0; i < 26; i++) {
      const rx4 = rugBL + Math.random() * (rugBR - rugBL);
      const ry4 = rugTop + Math.random() * (rugBot - rugTop);
      b.beginPath(); b.moveTo(rx4 - W * 0.012, ry4); b.lineTo(rx4 + W * 0.012, ry4); b.stroke();
    }
    // 地毯近端的短流苏
    b.strokeStyle = day ? 'rgba(206,178,132,0.28)' : dusk ? 'rgba(166,136,102,0.22)' : 'rgba(110,86,68,0.18)';
    b.lineWidth = Math.max(0.8, W * 0.0009);
    for (let i = 0; i < 46; i++) {
      const fx4 = rugBL + (rugBR - rugBL) * (0.04 + (i / 45) * 0.92);
      const fy4 = rugBot + H * 0.002 + (i % 2) * H * 0.0015;
      b.beginPath();
      b.moveTo(fx4, fy4);
      b.lineTo(fx4 + (i % 3 - 1) * W * 0.0012, fy4 + H * (0.006 + (i % 3) * 0.0012));
      b.stroke();
    }
    // 三人长椅：三段靠背垫 + 座垫 + 卷边扶手，木脚接地
    const sx = W * 0.055, sw = W * 0.285, sTop = H * 0.712, sBot = H * 0.885;
    b.fillStyle = 'rgba(0,0,0,0.30)';
    b.beginPath(); b.ellipse(sx + sw / 2, sBot + H * 0.016, sw * 0.58, H * 0.017, 0, 0, 6.3); b.fill();
    const backCol = day ? '#5e332f' : dusk ? '#472a28' : '#2b1c1f';
    const cushionCol = day ? '#704036' : dusk ? '#52302c' : '#332224';
    // 椅背底座
    b.fillStyle = shade(backCol, -26);
    b.fillRect(sx + W * 0.008, sTop + H * 0.030, sw - W * 0.016, sBot - sTop - H * 0.055);
    // 三段靠背垫
    for (let i = 0; i < 3; i++) {
      const bx4 = sx + sw * (0.045 + i * 0.305);
      const bw4 = sw * 0.285;
      const bTop = sTop + H * (0.006 + (i === 1 ? -0.004 : 0));
      const bBot = sBot - H * 0.058;
      const bg4 = b.createLinearGradient(0, bTop, 0, bBot);
      bg4.addColorStop(0, shade(backCol, 20));
      bg4.addColorStop(0.55, backCol);
      bg4.addColorStop(1, shade(backCol, -16));
      b.fillStyle = bg4;
      b.beginPath();
      b.moveTo(bx4, bBot);
      b.lineTo(bx4 + W * 0.004, bTop + H * 0.020);
      b.quadraticCurveTo(bx4 + bw4 * 0.10, bTop, bx4 + bw4 * 0.5, bTop);
      b.quadraticCurveTo(bx4 + bw4 * 0.90, bTop, bx4 + bw4 - W * 0.004, bTop + H * 0.020);
      b.lineTo(bx4 + bw4, bBot);
      b.closePath(); b.fill();
      // 垫子外缘的滚边与内侧暗缝
      b.strokeStyle = 'rgba(255,214,176,0.10)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(bx4 + W * 0.005, bTop + H * 0.022);
      b.quadraticCurveTo(bx4 + bw4 * 0.5, bTop + H * 0.002, bx4 + bw4 - W * 0.005, bTop + H * 0.022);
      b.stroke();
      b.strokeStyle = 'rgba(22,10,10,0.30)';
      b.beginPath();
      b.moveTo(bx4 + bw4 - W * 0.001, bBot);
      b.lineTo(bx4 + bw4 - W * 0.001, bTop + H * 0.026);
      b.stroke();
      // 垫面中央的浅压痕
      b.strokeStyle = 'rgba(255,220,184,0.055)';
      b.beginPath();
      b.moveTo(bx4 + bw4 * 0.22, bTop + H * 0.018);
      b.quadraticCurveTo(bx4 + bw4 * 0.20, (bTop + bBot) / 2, bx4 + bw4 * 0.24, bBot - H * 0.010);
      b.stroke();
      // 拉扣软包：菱形纽扣与浅浅的拉扯褶
      for (let r = 0; r < 3; r++) {
        const ty = bTop + H * (0.026 + r * 0.034);
        for (let cbtn = 0; cbtn < 2; cbtn++) {
          const txx = bx4 + bw4 * (0.34 + cbtn * 0.30) + (r % 2) * bw4 * 0.06;
          b.fillStyle = 'rgba(26,10,10,0.38)';
          b.beginPath(); b.arc(txx, ty, Math.max(0.9, W * 0.0012), 0, 6.3); b.fill();
          b.fillStyle = 'rgba(255,214,180,0.10)';
          b.beginPath(); b.arc(txx - W * 0.0008, ty - H * 0.0010, Math.max(0.5, W * 0.0007), 0, 6.3); b.fill();
          b.strokeStyle = 'rgba(255,220,186,0.045)';
          b.lineWidth = 0.8;
          b.beginPath();
          b.moveTo(txx, ty + H * 0.002);
          b.lineTo(txx - bw4 * 0.10, ty + H * 0.012);
          b.moveTo(txx, ty + H * 0.002);
          b.lineTo(txx + bw4 * 0.10, ty + H * 0.012);
          b.stroke();
        }
      }
    }
    // 座垫
    for (let i = 0; i < 3; i++) {
      const cx0 = sx + sw * (0.17 + i * 0.31);
      b.fillStyle = shade(cushionCol, i === 1 ? 10 : -2);
      b.beginPath();
      b.moveTo(cx0 - sw * 0.160, sBot - H * 0.068);
      b.quadraticCurveTo(cx0, sBot - H * 0.084, cx0 + sw * 0.160, sBot - H * 0.068);
      b.lineTo(cx0 + sw * 0.156, sBot - H * 0.010);
      b.quadraticCurveTo(cx0, sBot + H * 0.004, cx0 - sw * 0.156, sBot - H * 0.010);
      b.closePath(); b.fill();
      b.strokeStyle = 'rgba(255,226,190,0.10)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(cx0 - sw * 0.145, sBot - H * 0.064);
      b.quadraticCurveTo(cx0, sBot - H * 0.076, cx0 + sw * 0.145, sBot - H * 0.064);
      b.stroke();
      b.strokeStyle = 'rgba(20,10,10,0.28)';
      b.beginPath();
      b.moveTo(cx0 + sw * 0.160, sBot - H * 0.066);
      b.lineTo(cx0 + sw * 0.156, sBot - H * 0.008);
      b.stroke();
    }
    // 卷边扶手：先画外轮廓，再压一条侧缝
    for (const side of [-1, 1]) {
      const ax = sx + sw / 2 + side * sw * 0.475;
      b.fillStyle = shade(backCol, side < 0 ? 12 : -12);
      b.fillRect(ax - sw * 0.040, sBot - H * 0.058, sw * 0.080, H * 0.050);
      b.beginPath();
      b.ellipse(ax, sBot - H * 0.058, sw * 0.040, H * 0.024, 0, 0, 6.3);
      b.fill();
      b.fillStyle = 'rgba(255,232,200,0.09)';
      b.beginPath();
      b.ellipse(ax - W * 0.004, sBot - H * 0.066, sw * 0.028, H * 0.009, -0.08, 0, 6.3);
      b.fill();
      b.strokeStyle = 'rgba(24,12,10,0.25)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(ax + side * sw * 0.028, sBot - H * 0.050);
      b.lineTo(ax + side * sw * 0.026, sBot - H * 0.010);
      b.stroke();
    }
    // 木脚
    b.fillStyle = '#2a1910';
    b.fillRect(sx + W * 0.010, sBot - H * 0.010, W * 0.012, H * 0.028);
    b.fillRect(sx + sw - W * 0.022, sBot - H * 0.010, W * 0.012, H * 0.028);
    b.fillRect(sx + sw * 0.48, sBot - H * 0.010, W * 0.010, H * 0.024);
    // 右侧两把单人扶手椅：面向咖啡桌的侧后方角度
    for (const [cx0, ch] of [[W * 0.790, 1], [W * 0.910, 0.90]]) {
      const cBot = H * 0.895;
      const cw = W * 0.072 * ch;
      const backH = H * 0.152 * ch;
      const cTop = cBot - backH;
      const ac = day ? '#5e3a32' : dusk ? '#46302c' : '#2c2022';
      b.fillStyle = 'rgba(0,0,0,0.32)';
      b.beginPath(); b.ellipse(cx0, cBot + H * 0.014, cw * 0.95, H * 0.015, 0, 0, 6.3); b.fill();
      // 椅背：左侧是近侧翼板，右侧是背板
      b.fillStyle = shade(ac, 10);
      b.beginPath();
      b.moveTo(cx0 + cw * 0.12, cBot - H * 0.020);
      b.lineTo(cx0 + cw * 0.10, cTop + H * 0.014);
      b.quadraticCurveTo(cx0 + cw * 0.30, cTop - H * 0.008, cx0 + cw * 0.52, cTop + H * 0.010);
      b.lineTo(cx0 + cw * 0.58, cBot - H * 0.020);
      b.closePath(); b.fill();
      // 椅背受光面
      b.fillStyle = shade(ac, 24);
      b.beginPath();
      b.moveTo(cx0 + cw * 0.10, cTop + H * 0.018);
      b.quadraticCurveTo(cx0 + cw * 0.30, cTop + H * 0.002, cx0 + cw * 0.46, cTop + H * 0.016);
      b.lineTo(cx0 + cw * 0.44, cBot - H * 0.022);
      b.lineTo(cx0 + cw * 0.16, cBot - H * 0.022);
      b.closePath(); b.fill();
      // 座垫（向左侧伸出）
      b.fillStyle = shade(ac, 18);
      b.beginPath();
      b.moveTo(cx0 - cw * 0.52, cBot - H * 0.073);
      b.quadraticCurveTo(cx0 - cw * 0.60, cBot - H * 0.090, cx0 - cw * 0.42, cBot - H * 0.092);
      b.lineTo(cx0 + cw * 0.28, cBot - H * 0.084);
      b.lineTo(cx0 + cw * 0.30, cBot - H * 0.034);
      b.quadraticCurveTo(cx0 - cw * 0.10, cBot - H * 0.024, cx0 - cw * 0.52, cBot - H * 0.034);
      b.closePath(); b.fill();
      // 座垫前沿压暗
      b.fillStyle = 'rgba(20,10,8,0.18)';
      b.beginPath();
      b.moveTo(cx0 - cw * 0.52, cBot - H * 0.040);
      b.lineTo(cx0 + cw * 0.30, cBot - H * 0.038);
      b.lineTo(cx0 + cw * 0.30, cBot - H * 0.026);
      b.lineTo(cx0 - cw * 0.52, cBot - H * 0.028);
      b.closePath(); b.fill();
      // 近侧扶手：横向圆润的扶手条
      b.fillStyle = shade(ac, 4);
      b.beginPath();
      b.moveTo(cx0 - cw * 0.50, cBot - H * 0.098);
      b.quadraticCurveTo(cx0 - cw * 0.30, cBot - H * 0.116, cx0 + cw * 0.02, cBot - H * 0.104);
      b.quadraticCurveTo(cx0 + cw * 0.10, cBot - H * 0.100, cx0 + cw * 0.10, cBot - H * 0.086);
      b.lineTo(cx0 - cw * 0.50, cBot - H * 0.078);
      b.closePath(); b.fill();
      b.strokeStyle = 'rgba(255,222,186,0.14)';
      b.lineWidth = 1.2;
      b.beginPath();
      b.moveTo(cx0 - cw * 0.46, cBot - H * 0.098);
      b.quadraticCurveTo(cx0 - cw * 0.28, cBot - H * 0.112, cx0 + cw * 0.02, cBot - H * 0.101);
      b.stroke();
      // 扶手下的暗部
      b.fillStyle = 'rgba(16,8,6,0.28)';
      b.beginPath();
      b.moveTo(cx0 - cw * 0.50, cBot - H * 0.078);
      b.lineTo(cx0 - cw * 0.02, cBot - H * 0.083);
      b.lineTo(cx0 - cw * 0.02, cBot - H * 0.048);
      b.lineTo(cx0 - cw * 0.52, cBot - H * 0.040);
      b.closePath(); b.fill();
      // 木脚
      for (const [fx2, fw2] of [[-0.44, 0.055], [0.02, 0.045], [0.50, 0.050]]) {
        b.fillStyle = '#2a1910';
        b.beginPath();
        b.moveTo(cx0 + cw * fx2 - W * 0.004, cBot - H * 0.010);
        b.lineTo(cx0 + cw * fx2 + W * 0.004, cBot - H * 0.010);
        b.lineTo(cx0 + cw * (fx2 + fw2) + W * 0.003, cBot + H * 0.018);
        b.lineTo(cx0 + cw * fx2 - W * 0.004, cBot + H * 0.018);
        b.closePath(); b.fill();
      }
    }
    // 中央咖啡桌
    const tx = W * 0.415, tw = W * 0.215, tTop = H * 0.790;
    b.fillStyle = 'rgba(0,0,0,0.32)';
    b.beginPath(); b.ellipse(tx + tw / 2, H * 0.930, tw * 0.60, H * 0.018, 0, 0, 6.3); b.fill();
    b.strokeStyle = day ? '#4a2e1c' : dusk ? '#382416' : '#24160e';
    b.lineWidth = Math.max(4, W * 0.005);
    b.beginPath();
    b.moveTo(tx + tw * 0.14, tTop + H * 0.012);
    b.lineTo(tx + tw * 0.08, H * 0.918);
    b.moveTo(tx + tw * 0.86, tTop + H * 0.012);
    b.lineTo(tx + tw * 0.92, H * 0.918);
    b.stroke();
    const tt = b.createLinearGradient(0, tTop - H * 0.012, 0, tTop + H * 0.025);
    tt.addColorStop(0, day ? '#9a6a42' : dusk ? '#745032' : '#46301e');
    tt.addColorStop(1, day ? '#6a4528' : dusk ? '#52361f' : '#2e1f13');
    b.fillStyle = tt;
    b.beginPath();
    b.ellipse(tx + tw / 2, tTop, tw / 2, H * 0.023, 0, 0, 6.3);
    b.fill();
    b.fillStyle = 'rgba(255,238,200,0.12)';
    b.beginPath();
    b.ellipse(tx + tw * 0.4, tTop - H * 0.007, tw * 0.30, H * 0.008, -0.03, 0, 6.3);
    b.fill();
    // 桌面的木纹弧线与前沿暗面
    b.strokeStyle = day ? 'rgba(72,44,22,0.16)' : 'rgba(24,14,8,0.28)';
    b.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const yy = tTop - H * 0.005 + k * H * 0.0062;
      b.beginPath();
      b.ellipse(tx + tw / 2, yy, tw * (0.40 - k * 0.055), H * (0.014 - k * 0.0016), 0, 3.55, 6.15);
      b.stroke();
    }
    b.fillStyle = 'rgba(26,14,8,0.26)';
    b.beginPath();
    b.ellipse(tx + tw / 2, tTop + H * 0.021, tw * 0.485, H * 0.0065, 0, 0, Math.PI);
    b.fill();
    // 托盘、三只白瓷杯与银咖啡壶
    b.fillStyle = '#9c8c64';
    b.beginPath();
    b.ellipse(tx + tw / 2, tTop - H * 0.004, tw * 0.34, H * 0.013, 0, 0, 6.3);
    b.fill();
    b.strokeStyle = 'rgba(60,44,24,0.4)';
    b.lineWidth = 1;
    b.beginPath();
    b.ellipse(tx + tw / 2, tTop - H * 0.004, tw * 0.34, H * 0.013, 0, 0, 6.3);
    b.stroke();
    for (const [cxr, cyr] of [[0.30, 0.000], [0.46, 0.004], [0.62, -0.001]]) {
      const cx1 = tx + tw * cxr, cy1 = tTop + H * cyr;
      // 碟
      b.fillStyle = 'rgba(206,199,184,0.9)';
      b.beginPath();
      b.ellipse(cx1, cy1 + H * 0.002, W * 0.0145, H * 0.0048, 0, 0, 6.3);
      b.fill();
      b.strokeStyle = 'rgba(120,112,98,0.35)';
      b.lineWidth = 0.8;
      b.beginPath();
      b.ellipse(cx1, cy1 + H * 0.002, W * 0.012, H * 0.0036, 0, 0, 6.3);
      b.stroke();
      // 杯身
      b.fillStyle = '#d8d2c2';
      b.beginPath();
      b.moveTo(cx1 - W * 0.0095, cy1 - H * 0.001);
      b.quadraticCurveTo(cx1 - W * 0.0085, cy1 - H * 0.012, cx1, cy1 - H * 0.013);
      b.quadraticCurveTo(cx1 + W * 0.0085, cy1 - H * 0.012, cx1 + W * 0.0095, cy1 - H * 0.001);
      b.closePath(); b.fill();
      // 杯口与咖啡
      b.fillStyle = '#a89f8c';
      b.beginPath();
      b.ellipse(cx1, cy1 - H * 0.0125, W * 0.0095, H * 0.0034, 0, 0, 6.3);
      b.fill();
      b.fillStyle = '#2a170c';
      b.beginPath();
      b.ellipse(cx1, cy1 - H * 0.0122, W * 0.0072, H * 0.0024, 0, 0, 6.3);
      b.fill();
      // 杯耳
      b.strokeStyle = '#cfc8b8';
      b.lineWidth = 1.5;
      b.beginPath();
      b.arc(cx1 + W * 0.014, cy1 - H * 0.0065, W * 0.0062, -1.25, 1.25);
      b.stroke();
      // 一缕极淡的热气
      b.strokeStyle = 'rgba(255,246,228,0.10)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(cx1, cy1 - H * 0.016);
      b.quadraticCurveTo(cx1 + W * 0.006, cy1 - H * 0.028, cx1 - W * 0.002, cy1 - H * 0.038);
      b.stroke();
    }
    // 银咖啡壶：金属渐变、细颈、壶嘴与把手
    const potX = tx + tw * 0.50, potY = tTop - H * 0.002;
    const potG = b.createLinearGradient(potX - W * 0.020, 0, potX + W * 0.020, 0);
    potG.addColorStop(0, '#8c8b86');
    potG.addColorStop(0.35, '#d5d6d0');
    potG.addColorStop(0.6, '#a8a9a4');
    potG.addColorStop(1, '#6e6f6a');
    b.fillStyle = potG;
    b.beginPath();
    b.moveTo(potX - W * 0.016, potY - H * 0.006);
    b.quadraticCurveTo(potX - W * 0.020, potY - H * 0.040, potX - W * 0.008, potY - H * 0.045);
    b.lineTo(potX + W * 0.008, potY - H * 0.045);
    b.quadraticCurveTo(potX + W * 0.020, potY - H * 0.040, potX + W * 0.016, potY - H * 0.006);
    b.quadraticCurveTo(potX, potY + H * 0.002, potX - W * 0.016, potY - H * 0.006);
    b.closePath(); b.fill();
    // 壶盖与顶珠
    b.fillStyle = '#b8b9b3';
    b.beginPath();
    b.ellipse(potX, potY - H * 0.045, W * 0.0085, H * 0.0032, 0, 0, 6.3);
    b.fill();
    b.fillStyle = '#cfd0ca';
    b.beginPath();
    b.arc(potX, potY - H * 0.050, W * 0.0032, 0, 6.3);
    b.fill();
    // 壶嘴
    b.strokeStyle = '#c6c7c1';
    b.lineWidth = Math.max(2, W * 0.002);
    b.beginPath();
    b.moveTo(potX + W * 0.014, potY - H * 0.026);
    b.quadraticCurveTo(potX + W * 0.030, potY - H * 0.034, potX + W * 0.031, potY - H * 0.046);
    b.stroke();
    // 把手
    b.strokeStyle = '#8a8b86';
    b.beginPath();
    b.moveTo(potX - W * 0.015, potY - H * 0.036);
    b.quadraticCurveTo(potX - W * 0.030, potY - H * 0.026, potX - W * 0.016, potY - H * 0.012);
    b.stroke();
    // 高光与倒影
    b.strokeStyle = 'rgba(255,255,255,0.45)';
    b.lineWidth = Math.max(1, W * 0.0012);
    b.beginPath();
    b.moveTo(potX - W * 0.009, potY - H * 0.040);
    b.quadraticCurveTo(potX - W * 0.011, potY - H * 0.022, potX - W * 0.008, potY - H * 0.009);
    b.stroke();
    // 窗边的一盆橄榄
    const ptx = W * 0.685, ptop = H * 0.780, pbot = H * 0.858;
    b.fillStyle = 'rgba(0,0,0,0.30)';
    b.beginPath(); b.ellipse(ptx, pbot + H * 0.006, W * 0.034, H * 0.008, 0, 0, 6.3); b.fill();
    // 陶盆
    const potG2 = b.createLinearGradient(ptx - W * 0.024, 0, ptx + W * 0.024, 0);
    potG2.addColorStop(0, '#5c4230');
    potG2.addColorStop(0.4, '#8a6446');
    potG2.addColorStop(1, '#3f2c20');
    b.fillStyle = potG2;
    b.beginPath();
    b.moveTo(ptx - W * 0.026, ptop);
    b.lineTo(ptx + W * 0.026, ptop);
    b.lineTo(ptx + W * 0.019, pbot);
    b.lineTo(ptx - W * 0.019, pbot);
    b.closePath(); b.fill();
    b.fillStyle = '#3a281c';
    b.beginPath(); b.ellipse(ptx, ptop, W * 0.027, H * 0.006, 0, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(255,220,170,0.14)';
    b.beginPath(); b.ellipse(ptx, pbot, W * 0.019, H * 0.0035, 0, 0, 6.3); b.fill();
    // 枝干
    b.strokeStyle = '#4a4230';
    b.lineWidth = Math.max(1.6, W * 0.0018);
    for (let i = 0; i < 5; i++) {
      const a = -1.9 + i * 0.32;
      b.beginPath();
      b.moveTo(ptx + rand(-3, 3), ptop - H * 0.004);
      b.quadraticCurveTo(
        ptx + Math.cos(a) * W * 0.024, ptop - H * 0.036,
        ptx + Math.cos(a) * W * 0.044, ptop - H * (0.052 + (i % 2) * 0.012)
      );
      b.stroke();
    }
    // 叶片：三层明暗，银绿边缘
    for (let i = 0; i < 34; i++) {
      const lx = ptx + rand(-0.052, 0.052) * W;
      const ly = ptop - H * rand(0.020, 0.082);
      const ll = W * rand(0.012, 0.020);
      const rot = rand(-1.2, 1.2);
      b.save();
      b.translate(lx, ly);
      b.rotate(rot);
      b.fillStyle = i % 3 === 0 ? '#5f6c46' : i % 3 === 1 ? '#4a5a3a' : '#38462c';
      b.beginPath();
      b.ellipse(0, 0, ll, ll * 0.36, 0, 0, 6.3);
      b.fill();
      b.strokeStyle = 'rgba(206,218,180,0.18)';
      b.lineWidth = 0.8;
      b.beginPath(); b.moveTo(-ll * 0.8, 0); b.lineTo(ll * 0.8, 0); b.stroke();
      b.restore();
    }
    // 壁炉地面的余火暖光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const fpool = b.createRadialGradient(W * 0.22, horizon + H * 0.08, 0, W * 0.22, horizon + H * 0.08, W * 0.20);
    fpool.addColorStop(0, 'rgba(255,176,90,0.16)');
    fpool.addColorStop(1, 'rgba(255,160,70,0)');
    b.fillStyle = fpool;
    b.beginPath(); b.arc(W * 0.22, horizon + H * 0.08, W * 0.20, 0, 6.3); b.fill();
    b.restore();
    // 下缘压暗
    const shade2 = b.createLinearGradient(0, H * 0.84, 0, H);
    shade2.addColorStop(0, 'rgba(12,8,8,0)');
    shade2.addColorStop(1, 'rgba(12,8,8,0.42)');
    b.fillStyle = shade2;
    b.fillRect(0, H * 0.84, W, H * 0.16);
    void dusk;
  };

  /* ---------- 场景：庄园地下室与旧档案室 ---------- */
  function drawBasement(b, p, horizon) {
    // 拱形石顶与后墙
    const stone = '#4a443a';
    const wallG = b.createLinearGradient(0, 0, 0, horizon);
    wallG.addColorStop(0, '#241f1a');
    wallG.addColorStop(0.45, '#3a342b');
    wallG.addColorStop(1, '#494238');
    b.fillStyle = wallG;
    b.fillRect(0, 0, W, horizon);
    // 石砌墙：错缝石块
    for (let row = 0; row < 12; row++) {
      const y0 = (row / 12) * horizon;
      const bh = horizon / 12;
      b.strokeStyle = 'rgba(14,11,8,0.55)';
      b.lineWidth = 1.4;
      b.beginPath(); b.moveTo(0, y0); b.lineTo(W, y0); b.stroke();
      const off = (row % 2) * W * 0.035;
      for (let x0 = off; x0 < W + W * 0.05; x0 += W * 0.075) {
        b.beginPath(); b.moveTo(x0, y0); b.lineTo(x0 + rand(-2, 2), y0 + bh); b.stroke();
        b.fillStyle = `rgba(255,244,220,${rand(0.008, 0.024)})`;
        b.fillRect(x0 + 2, y0 + 2, W * 0.07, bh * 0.16);
      }
    }
    // 潮气与霉斑
    for (let i = 0; i < 90; i++) {
      b.fillStyle = Math.random() < 0.5
        ? `rgba(20,26,16,${rand(0.05, 0.15)})`
        : `rgba(196,206,180,${rand(0.02, 0.05)})`;
      b.beginPath();
      b.ellipse(Math.random() * W, rand(0, horizon), rand(8, 44), rand(3, 18), rand(-0.5, 0.5), 0, 6.3);
      b.fill();
    }
    // 拱顶：横向筒拱 + 四道石肋
    b.fillStyle = 'rgba(22,19,15,0.55)';
    b.fillRect(0, 0, W, H * 0.175);
    b.strokeStyle = 'rgba(148,136,112,0.14)';
    b.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const yy = H * (0.012 + i * 0.034);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const cx = W * (0.11 + i * 0.26);
      b.strokeStyle = 'rgba(34,28,21,0.85)';
      b.lineWidth = Math.max(7, W * 0.009);
      b.beginPath();
      b.arc(cx, H * 0.185, W * 0.135, Math.PI + 0.12, -0.12);
      b.stroke();
      b.strokeStyle = 'rgba(160,146,118,0.16)';
      b.lineWidth = 2;
      b.beginPath();
      b.arc(cx - 2, H * 0.185, W * 0.135 - 6, Math.PI + 0.16, -0.16);
      b.stroke();
      // 拱脚的柱帽
      const px = cx - W * 0.135;
      b.fillStyle = 'rgba(46,39,30,0.9)';
      b.fillRect(px - W * 0.012, H * 0.135, W * 0.026, H * 0.045);
      b.fillStyle = 'rgba(150,136,110,0.12)';
      b.fillRect(px - W * 0.012, H * 0.135, W * 0.026, 2);
    }
    // 左侧下行石阶：拱门、台阶与铁扶手
    const stx = W * 0.015, stw = W * 0.175;
    const stTop = H * 0.145, stBot = horizon;
    b.fillStyle = '#120f0c';
    b.beginPath();
    b.moveTo(stx, stBot);
    b.lineTo(stx, stTop + W * 0.035);
    b.arc(stx + stw / 2, stTop + W * 0.035, stw / 2, Math.PI, 0);
    b.lineTo(stx + stw, stBot);
    b.closePath(); b.fill();
    // 拱门石框
    b.strokeStyle = 'rgba(126,112,92,0.30)';
    b.lineWidth = Math.max(4, W * 0.005);
    b.beginPath();
    b.moveTo(stx, stBot);
    b.lineTo(stx, stTop + W * 0.035);
    b.arc(stx + stw / 2, stTop + W * 0.035, stw / 2, Math.PI, 0);
    b.lineTo(stx + stw, stBot);
    b.stroke();
    // 台阶：越近越宽，向上收束
    b.save();
    b.beginPath();
    b.moveTo(stx + 2, stBot);
    b.lineTo(stx + 2, stTop + W * 0.035);
    b.arc(stx + stw / 2, stTop + W * 0.035, stw / 2 - 2, Math.PI, 0);
    b.lineTo(stx + stw - 2, stBot);
    b.closePath(); b.clip();
    b.fillStyle = '#2b241c';
    b.fillRect(stx, stTop, stw, stBot - stTop);
    for (let i = 0; i < 9; i++) {
      const t = i / 9;
      const yy = stTop + W * 0.035 + (stBot - stTop - W * 0.035) * Math.pow(t, 0.8);
      const inset = stw * 0.12 * (1 - t);
      b.fillStyle = i % 2 ? '#38302a' : '#2f2821';
      b.fillRect(stx + inset, yy, stw - inset * 2, Math.max(3, (stBot - stTop) * 0.045));
      b.fillStyle = 'rgba(255,218,162,0.06)';
      b.fillRect(stx + inset, yy, stw - inset * 2, 2);
      b.fillStyle = 'rgba(10,8,6,0.35)';
      b.fillRect(stx + inset, yy + Math.max(3, (stBot - stTop) * 0.045) - 2, stw - inset * 2, 2);
    }
    // 从楼梯口漏下的暖光
    const stairGlow = b.createLinearGradient(0, stTop, 0, stBot);
    stairGlow.addColorStop(0, 'rgba(255,210,146,0.28)');
    stairGlow.addColorStop(0.7, 'rgba(255,200,132,0.04)');
    stairGlow.addColorStop(1, 'rgba(255,196,124,0)');
    b.fillStyle = stairGlow;
    b.fillRect(stx, stTop, stw, stBot - stTop);
    b.restore();
    // 铁扶手
    b.strokeStyle = 'rgba(16,13,10,0.9)';
    b.lineWidth = Math.max(2, W * 0.0028);
    b.beginPath();
    b.moveTo(stx + stw * 0.86, H * 0.42);
    b.lineTo(stx + stw * 0.70, stBot - H * 0.03);
    b.stroke();
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const bx = stx + stw * (0.84 - t * 0.15);
      const by = H * 0.42 + t * (stBot - H * 0.03 - H * 0.42);
      b.beginPath();
      b.moveTo(bx, by);
      b.lineTo(bx, by + H * 0.030);
      b.stroke();
    }
    // 右侧一排生锈铁皮档案柜
    for (let i = 0; i < 3; i++) {
      const cx0 = W * (0.615 + i * 0.122);
      const cw = W * 0.108;
      const cTop = H * 0.265;
      b.fillStyle = 'rgba(0,0,0,0.34)';
      b.fillRect(cx0 + W * 0.006, cTop + H * 0.006, cw, horizon - cTop);
      const cg = b.createLinearGradient(cx0, 0, cx0 + cw, 0);
      cg.addColorStop(0, '#5a5142');
      cg.addColorStop(0.55, '#4a4235');
      cg.addColorStop(1, '#332d25');
      b.fillStyle = cg;
      b.fillRect(cx0, cTop, cw, horizon - cTop);
      // 抽屉分层与把手
      for (let d = 0; d < 4; d++) {
        const dy = cTop + (horizon - cTop) * (0.05 + d * 0.235);
        b.strokeStyle = 'rgba(18,14,10,0.55)';
        b.strokeRect(cx0 + W * 0.006, dy, cw - W * 0.012, (horizon - cTop) * 0.19);
        b.fillStyle = 'rgba(176,150,110,0.35)';
        b.fillRect(cx0 + cw * 0.42, dy + (horizon - cTop) * 0.075, cw * 0.16, 2);
        // 褪色标签
        b.fillStyle = `rgba(${208 - d * 10},${198 - d * 8},${172 - d * 8},0.45)`;
        b.fillRect(cx0 + cw * 0.16, dy + (horizon - cTop) * 0.03, cw * 0.30, (horizon - cTop) * 0.045);
      }
      // 锈迹
      for (let k = 0; k < 12; k++) {
        b.fillStyle = `rgba(${120 + (k % 4) * 13},${56 + (k % 3) * 9},${30 + (k % 2) * 7},${rand(0.15, 0.42)})`;
        b.beginPath();
        b.arc(cx0 + Math.random() * cw, cTop + Math.random() * (horizon - cTop), rand(1, 3.4), 0, 6.3);
        b.fill();
      }
    }
    // 吊在拱顶中央的钨丝灯
    const lx = W * 0.47, ly = H * 0.155;
    b.strokeStyle = '#191512';
    b.lineWidth = 1.4;
    b.beginPath(); b.moveTo(lx, 0); b.lineTo(lx, ly - H * 0.03); b.stroke();
    b.fillStyle = '#2a241c';
    b.beginPath();
    b.moveTo(lx - W * 0.018, ly - H * 0.038);
    b.lineTo(lx + W * 0.018, ly - H * 0.038);
    b.lineTo(lx + W * 0.010, ly - H * 0.018);
    b.lineTo(lx - W * 0.010, ly - H * 0.018);
    b.closePath(); b.fill();
    b.fillStyle = '#ffe6ac';
    b.beginPath(); b.arc(lx, ly - H * 0.012, Math.max(2, W * 0.0045), 0, 6.3); b.fill();
    b.save();
    b.globalCompositeOperation = 'lighter';
    const lg = b.createRadialGradient(lx, ly, 0, lx, ly, W * 0.30);
    lg.addColorStop(0, 'rgba(255,206,132,0.26)');
    lg.addColorStop(0.4, 'rgba(255,196,116,0.09)');
    lg.addColorStop(1, 'rgba(255,190,110,0)');
    b.fillStyle = lg;
    b.beginPath(); b.arc(lx, ly, W * 0.30, 0, 6.3); b.fill();
    // 灯下的锥形光
    const cone = b.createLinearGradient(0, ly, 0, horizon + H * 0.12);
    cone.addColorStop(0, 'rgba(255,214,150,0.14)');
    cone.addColorStop(1, 'rgba(255,206,132,0.02)');
    b.fillStyle = cone;
    b.beginPath();
    b.moveTo(lx - W * 0.02, ly);
    b.lineTo(lx + W * 0.02, ly);
    b.lineTo(lx + W * 0.20, horizon + H * 0.12);
    b.lineTo(lx - W * 0.20, horizon + H * 0.12);
    b.closePath(); b.fill();
    b.restore();
    // 左中部的酒架与橡木桶
    const rx0 = W * 0.215, ry0 = H * 0.36, rw = W * 0.20, rh = horizon - H * 0.36;
    b.fillStyle = '#2c2119';
    b.fillRect(rx0, ry0, rw, rh);
    b.strokeStyle = '#1a130d';
    b.lineWidth = Math.max(3, W * 0.004);
    b.strokeRect(rx0, ry0, rw, rh);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const cxx = rx0 + rw * (0.06 + c * 0.235), cyy = ry0 + rh * (0.075 + r * 0.23);
        b.fillStyle = 'rgba(8,6,4,0.75)';
        b.fillRect(cxx, cyy, rw * 0.19, rh * 0.18);
        // 横卧的酒瓶瓶底
        b.fillStyle = '#241c14';
        b.beginPath(); b.ellipse(cxx + rw * 0.095, cyy + rh * 0.09, rw * 0.055, rh * 0.062, 0, 0, 6.3); b.fill();
        b.strokeStyle = 'rgba(120,150,120,0.18)';
        b.lineWidth = 1.2;
        b.beginPath(); b.ellipse(cxx + rw * 0.095, cyy + rh * 0.09, rw * 0.045, rh * 0.05, 0, Math.PI * 1.05, Math.PI * 1.75); b.stroke();
        b.strokeStyle = 'rgba(255,214,160,0.05)';
        b.strokeRect(cxx, cyy, rw * 0.19, rh * 0.18);
      }
    }
    // 木框隔板
    b.strokeStyle = 'rgba(96,68,42,0.35)';
    b.lineWidth = Math.max(2, W * 0.0022);
    for (let r = 1; r < 4; r++) {
      b.beginPath(); b.moveTo(rx0, ry0 + rh * (0.02 + r * 0.23) ); b.lineTo(rx0 + rw, ry0 + rh * (0.02 + r * 0.23)); b.stroke();
    }
  }
  drawBasement.ground = function (b, p, horizon) {
    // 石板地面
    const floor = b.createLinearGradient(0, horizon, 0, H);
    floor.addColorStop(0, '#3a352c');
    floor.addColorStop(1, '#1d1a15');
    b.fillStyle = floor;
    b.fillRect(0, horizon, W, H - horizon);
    b.strokeStyle = 'rgba(10,8,6,0.5)';
    b.lineWidth = 1.2;
    for (let r = 0; r < 8; r++) {
      const t = r / 8;
      const yy = horizon + (H - horizon) * Math.pow(t, 1.5);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
      const off = (r % 2) * W * 0.06;
      for (let x0 = off; x0 < W; x0 += W * 0.12) {
        b.beginPath(); b.moveTo(x0, yy); b.lineTo(x0 + W * 0.02, yy + (H - horizon) * 0.12); b.stroke();
      }
    }
    // 石面的潮光
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const px0 = rand(0, W), py0 = horizon + rand(0.02, 0.32) * (H - horizon);
      const pg = b.createRadialGradient(px0, py0, 0, px0, py0, W * rand(0.03, 0.07));
      pg.addColorStop(0, 'rgba(150,160,150,0.05)');
      pg.addColorStop(1, 'rgba(150,160,150,0)');
      b.fillStyle = pg;
      b.fillRect(px0 - W * 0.08, py0 - H * 0.03, W * 0.16, H * 0.06);
    }
    b.restore();
    // 右下与中景的橡木酒桶（画在地面层，避免被地面渐变遮住）
    const barrel = (bx, by, bw) => {
      // 桶身：微鼓的弧线轮廓 + 顶面椭圆 + 铁箍
      const top = by - bw * 1.16, bot = by + bw * 1.16;
      b.save();
      b.fillStyle = 'rgba(0,0,0,0.4)';
      b.beginPath();
      b.ellipse(bx, bot + bw * 0.10, bw * 1.25, bw * 0.34, 0, 0, 6.3);
      b.fill();
      b.restore();
      const bg = b.createLinearGradient(bx - bw, 0, bx + bw, 0);
      bg.addColorStop(0, '#2f2117');
      bg.addColorStop(0.28, '#57402a');
      bg.addColorStop(0.58, '#6a4e31');
      bg.addColorStop(1, '#271b12');
      b.fillStyle = bg;
      b.beginPath();
      b.moveTo(bx - bw * 0.86, top + bw * 0.18);
      b.quadraticCurveTo(bx - bw * 1.14, by, bx - bw * 0.86, bot - bw * 0.18);
      b.quadraticCurveTo(bx, bot + bw * 0.16, bx + bw * 0.86, bot - bw * 0.18);
      b.quadraticCurveTo(bx + bw * 1.14, by, bx + bw * 0.86, top + bw * 0.18);
      b.quadraticCurveTo(bx, top - bw * 0.12, bx - bw * 0.86, top + bw * 0.18);
      b.closePath(); b.fill();
      // 顶面
      b.fillStyle = '#3a2a1c';
      b.beginPath(); b.ellipse(bx, top + bw * 0.10, bw * 0.84, bw * 0.24, 0, 0, 6.3); b.fill();
      b.strokeStyle = 'rgba(255,222,168,0.16)';
      b.lineWidth = 1.4;
      b.beginPath(); b.ellipse(bx, top + bw * 0.08, bw * 0.80, bw * 0.21, 0, Math.PI * 0.95, Math.PI * 1.9); b.stroke();
      // 竖向木条
      b.strokeStyle = 'rgba(24,16,11,0.5)';
      b.lineWidth = 1.1;
      for (const sx of [-0.55, -0.2, 0.2, 0.55]) {
        b.beginPath();
        b.moveTo(bx + bw * sx, top + bw * 0.28);
        b.quadraticCurveTo(bx + bw * sx * 1.16, by, bx + bw * sx, bot - bw * 0.28);
        b.stroke();
      }
      // 铁箍
      b.strokeStyle = 'rgba(22,18,14,0.85)';
      b.lineWidth = Math.max(2, bw * 0.10);
      for (const t of [-0.62, 0, 0.62]) {
        b.beginPath();
        b.moveTo(bx - bw * 0.93, by + t * bw * 1.02);
        b.quadraticCurveTo(bx, by + t * bw * 1.02 + (t ? 0 : bw * 0.10), bx + bw * 0.93, by + t * bw * 1.02);
        b.stroke();
      }
      b.strokeStyle = 'rgba(255,214,160,0.10)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(bx - bw * 0.62, top + bw * 0.34); b.lineTo(bx - bw * 0.6, bot - bw * 0.34); b.stroke();
    };
    barrel(W * 0.775, horizon + H * 0.115, W * 0.040);
    barrel(W * 0.875, horizon + H * 0.145, W * 0.044);
    // 中央的胡桃木长桌
    const tx = W * 0.255, tw = W * 0.46, tTop = H * 0.745;
    b.fillStyle = 'rgba(0,0,0,0.30)';
    b.beginPath(); b.ellipse(tx + tw / 2, H * 0.918, tw * 0.52, H * 0.017, 0, 0, 6.3); b.fill();
    b.strokeStyle = '#241812';
    b.lineWidth = Math.max(6, W * 0.007);
    b.beginPath();
    b.moveTo(tx + tw * 0.08, tTop + H * 0.03); b.lineTo(tx + tw * 0.05, H * 0.92);
    b.moveTo(tx + tw * 0.92, tTop + H * 0.03); b.lineTo(tx + tw * 0.95, H * 0.92);
    b.stroke();
    b.strokeStyle = 'rgba(150,108,70,0.16)';
    b.lineWidth = 1.4;
    b.beginPath();
    b.moveTo(tx + tw * 0.062, tTop + H * 0.045); b.lineTo(tx + tw * 0.046, H * 0.915);
    b.moveTo(tx + tw * 0.938, tTop + H * 0.045); b.lineTo(tx + tw * 0.952, H * 0.915);
    b.stroke();
    const tt = b.createLinearGradient(0, tTop - H * 0.015, 0, tTop + H * 0.035);
    tt.addColorStop(0, '#7a5433');
    tt.addColorStop(0.55, '#5c3e26');
    tt.addColorStop(1, '#402a1a');
    b.fillStyle = tt;
    b.beginPath();
    b.moveTo(tx, tTop + H * 0.015);
    b.lineTo(tx + tw, tTop + H * 0.010);
    b.lineTo(tx + tw, tTop + H * 0.040);
    b.lineTo(tx, tTop + H * 0.052);
    b.closePath(); b.fill();
    // 桌面下的裙板
    b.fillStyle = '#2a1b12';
    b.beginPath();
    b.moveTo(tx + tw * 0.02, tTop + H * 0.046);
    b.lineTo(tx + tw * 0.98, tTop + H * 0.038);
    b.lineTo(tx + tw * 0.98, tTop + H * 0.058);
    b.lineTo(tx + tw * 0.02, tTop + H * 0.068);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(255,226,180,0.13)';
    b.fillRect(tx, tTop + H * 0.016, tw, 2);
    // 桌面上的档案、牛皮纸袋、冷光灯
    b.fillStyle = '#b8a888';
    b.save();
    b.translate(tx + tw * 0.27, tTop + H * 0.018);
    b.rotate(-0.05);
    b.fillRect(-tw * 0.09, -H * 0.008, tw * 0.18, H * 0.026);
    b.restore();
    b.fillStyle = '#d6c7a4';
    b.save();
    b.translate(tx + tw * 0.36, tTop + H * 0.022);
    b.rotate(0.04);
    b.fillRect(-tw * 0.075, -H * 0.007, tw * 0.15, H * 0.024);
    b.fillStyle = 'rgba(120,96,60,0.5)';
    for (let i = 0; i < 4; i++) b.fillRect(-tw * 0.06, -H * 0.002 + i * H * 0.005, tw * 0.12, 1);
    b.restore();
    // 牛皮纸档案袋
    b.fillStyle = '#a87e52';
    b.beginPath();
    b.moveTo(tx + tw * 0.10, tTop + H * 0.006);
    b.lineTo(tx + tw * 0.22, tTop + H * 0.004);
    b.lineTo(tx + tw * 0.225, tTop + H * 0.030);
    b.lineTo(tx + tw * 0.095, tTop + H * 0.032);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(70,48,26,0.6)';
    b.stroke();
    b.fillStyle = '#8c653c';
    b.fillRect(tx + tw * 0.15, tTop + H * 0.008, tw * 0.04, H * 0.006);
    // 便携冷光灯
    b.fillStyle = '#22262a';
    b.fillRect(tx + tw * 0.62, tTop - H * 0.012, W * 0.030, H * 0.014);
    b.fillStyle = '#cfe8ff';
    b.fillRect(tx + tw * 0.625, tTop - H * 0.010, W * 0.022, H * 0.004);
    b.save();
    b.globalCompositeOperation = 'lighter';
    const cg2 = b.createRadialGradient(tx + tw * 0.63, tTop, 0, tx + tw * 0.63, tTop, W * 0.10);
    cg2.addColorStop(0, 'rgba(196,226,255,0.16)');
    cg2.addColorStop(1, 'rgba(196,226,255,0)');
    b.fillStyle = cg2;
    b.beginPath(); b.arc(tx + tw * 0.63, tTop, W * 0.10, 0, 6.3); b.fill();
    b.restore();
    // 放大镜与白手套
    b.strokeStyle = '#8c7434';
    b.lineWidth = 2;
    b.beginPath(); b.arc(tx + tw * 0.55, tTop + H * 0.024, W * 0.009, 0, 6.3); b.stroke();
    b.fillStyle = 'rgba(210,226,236,0.18)';
    b.beginPath(); b.arc(tx + tw * 0.55, tTop + H * 0.024, W * 0.009, 0, 6.3); b.fill();
    b.strokeStyle = '#8c7434';
    b.beginPath();
    b.moveTo(tx + tw * 0.559, tTop + H * 0.031);
    b.lineTo(tx + tw * 0.575, tTop + H * 0.040);
    b.stroke();
    b.fillStyle = 'rgba(236,232,220,0.75)';
    b.beginPath();
    b.ellipse(tx + tw * 0.46, tTop + H * 0.028, W * 0.018, H * 0.007, 0.2, 0, 6.3);
    b.fill();
    // 两条长凳
    for (const bx of [0.22, 0.74]) {
      b.fillStyle = '#2c1d13';
      b.fillRect(W * bx, H * 0.82, W * 0.075, H * 0.014);
      b.fillRect(W * (bx + 0.008), H * 0.834, W * 0.008, H * 0.07);
      b.fillRect(W * (bx + 0.058), H * 0.834, W * 0.008, H * 0.07);
    }
    // 吊灯的暖光落在地上
    b.save();
    b.globalCompositeOperation = 'lighter';
    const pool = b.createRadialGradient(W * 0.47, horizon + H * 0.16, 0, W * 0.47, horizon + H * 0.16, W * 0.28);
    pool.addColorStop(0, 'rgba(255,204,130,0.10)');
    pool.addColorStop(1, 'rgba(255,196,116,0)');
    b.fillStyle = pool;
    b.fillRect(W * 0.1, horizon, W * 0.75, H - horizon);
    b.restore();
    // 下缘压暗
    const bottom = b.createLinearGradient(0, H * 0.85, 0, H);
    bottom.addColorStop(0, 'rgba(6,5,4,0)');
    bottom.addColorStop(1, 'rgba(6,5,4,0.45)');
    b.fillStyle = bottom;
    b.fillRect(0, H * 0.85, W, H * 0.15);
  };

  /* ---------- 场景：尼斯悬崖别墅（夜） ---------- */
  function drawVilla(b, p, horizon) {
    // 海：靛蓝到墨蓝，月光在浪尖上碎成细线
    const seaTop = H * 0.415, seaBot = horizon;
    const sea = b.createLinearGradient(0, seaTop, 0, seaBot);
    sea.addColorStop(0, '#101a36');
    sea.addColorStop(0.55, '#0b1430');
    sea.addColorStop(1, '#060b1c');
    b.fillStyle = sea;
    b.fillRect(0, seaTop, W, seaBot - seaTop);
    // 月亮
    const mx = W * 0.18, my = H * 0.15, mr = Math.min(W, H) * 0.036;
    b.save();
    b.globalCompositeOperation = 'lighter';
    const mh = b.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 5);
    mh.addColorStop(0, 'rgba(214,226,255,0.26)');
    mh.addColorStop(1, 'rgba(200,214,255,0)');
    b.fillStyle = mh;
    b.beginPath(); b.arc(mx, my, mr * 5, 0, 6.3); b.fill();
    b.restore();
    b.fillStyle = '#e9e9dc';
    b.beginPath(); b.arc(mx, my, mr, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(160,168,170,0.25)';
    b.beginPath(); b.arc(mx + mr * 0.2, my - mr * 0.1, mr * 0.3, 0, 6.3); b.fill();
    // 月光在海面拉出的碎光
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) {
      const t = Math.pow(i / 46, 1.4);
      const yy = seaTop + t * (seaBot - seaTop);
      const spread = W * (0.02 + t * 0.10);
      b.fillStyle = `rgba(206,220,255,${0.05 + (1 - t) * 0.16})`;
      b.fillRect(mx - spread * rand(0.3, 0.9), yy, spread * rand(0.7, 1.6), 1);
    }
    b.restore();
    // 远处的地中海海岸灯火
    b.fillStyle = 'rgba(10,14,28,0.9)';
    b.beginPath();
    b.moveTo(0, seaBot);
    b.lineTo(0, seaBot - H * 0.035);
    b.lineTo(W * 0.08, seaBot - H * 0.028);
    b.lineTo(W * 0.18, seaBot - H * 0.05);
    b.lineTo(W * 0.30, seaBot - H * 0.018);
    b.lineTo(W * 0.42, seaBot - H * 0.028);
    b.lineTo(W * 0.42, seaBot);
    b.closePath(); b.fill();
    for (let i = 0; i < 22; i++) {
      const lx2 = rand(0, W * 0.4), ly2 = seaBot - rand(0.005, 0.045) * H;
      b.fillStyle = `rgba(255,214,160,${rand(0.25, 0.7)})`;
      b.fillRect(lx2, ly2, 1.6, 1.6);
    }
    // 海岬黑色礁石
    b.fillStyle = '#0c1018';
    b.beginPath();
    b.moveTo(W * 0.30, seaBot);
    b.lineTo(W * 0.34, seaBot - H * 0.045);
    b.lineTo(W * 0.42, seaBot - H * 0.030);
    b.lineTo(W * 0.55, seaBot - H * 0.060);
    b.lineTo(W * 0.66, seaBot - H * 0.020);
    b.lineTo(W * 0.72, seaBot);
    b.closePath(); b.fill();
    // 礁石上的白色碎浪
    b.strokeStyle = 'rgba(196,214,244,0.28)';
    b.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      const wx2 = W * rand(0.33, 0.70);
      const wy2 = seaBot - rand(0.002, 0.014) * H;
      b.beginPath();
      b.moveTo(wx2, wy2);
      b.quadraticCurveTo(wx2 + W * 0.012, wy2 - H * 0.004, wx2 + W * 0.026, wy2);
      b.stroke();
    }
    // 别墅主体：冷灰混凝土与巨幅玻璃
    const vx0 = W * 0.475, vw = W * 0.50, vTop = H * 0.175;
    b.fillStyle = 'rgba(0,0,0,0.4)';
    b.fillRect(vx0 + W * 0.012, vTop + H * 0.012, vw, horizon - vTop + H * 0.02);
    const concrete = b.createLinearGradient(vx0, 0, vx0 + vw, 0);
    concrete.addColorStop(0, '#3b3f46');
    concrete.addColorStop(0.5, '#2c3037');
    concrete.addColorStop(1, '#1f2228');
    b.fillStyle = concrete;
    // 二层与一层错开的体块
    b.fillRect(vx0 + vw * 0.10, vTop, vw * 0.80, H * 0.105);
    b.fillRect(vx0, vTop + H * 0.105, vw, horizon - vTop - H * 0.105);
    // 混凝土分缝与雨渍
    b.strokeStyle = 'rgba(12,14,18,0.5)';
    b.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const xx = vx0 + vw * (0.06 + i * 0.12);
      b.beginPath(); b.moveTo(xx, vTop + H * 0.105); b.lineTo(xx, horizon); b.stroke();
    }
    for (let i = 0; i < 40; i++) {
      b.fillStyle = `rgba(150,168,190,${rand(0.01, 0.035)})`;
      b.fillRect(rand(vx0, vx0 + vw), rand(vTop, horizon), rand(4, 16), rand(2, 24));
    }
    // 模板横缝与体块转角
    b.strokeStyle = 'rgba(10,12,16,0.35)';
    b.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const hv = vTop + H * 0.105 + (horizon - vTop - H * 0.105) * (i / 5);
      b.beginPath(); b.moveTo(vx0, hv); b.lineTo(vx0 + vw, hv); b.stroke();
    }
    b.fillStyle = 'rgba(8,10,14,0.28)';
    b.fillRect(vx0, vTop + H * 0.105, W * 0.006, horizon - vTop - H * 0.105);
    b.fillStyle = 'rgba(156,176,200,0.06)';
    b.fillRect(vx0 + vw - W * 0.006, vTop + H * 0.105, W * 0.006, horizon - vTop - H * 0.105);
    // 二层长窗：冷白射灯下的室内
    const g1x = vx0 + vw * 0.16, g1y = vTop + H * 0.018, g1w = vw * 0.54, g1h = H * 0.075;
    const glowWin = b.createLinearGradient(0, g1y, 0, g1y + g1h);
    glowWin.addColorStop(0, 'rgba(224,232,240,0.88)');
    glowWin.addColorStop(0.6, 'rgba(186,198,212,0.72)');
    glowWin.addColorStop(1, 'rgba(140,154,172,0.6)');
    b.fillStyle = glowWin;
    b.fillRect(g1x, g1y, g1w, g1h);
    // 室内抽象画与家具剪影
    b.fillStyle = 'rgba(40,44,52,0.55)';
    b.fillRect(g1x + g1w * 0.12, g1y + g1h * 0.12, g1w * 0.16, g1h * 0.52);
    b.fillRect(g1x + g1w * 0.72, g1y + g1h * 0.20, g1w * 0.14, g1h * 0.46);
    b.fillStyle = 'rgba(30,34,40,0.6)';
    b.fillRect(g1x + g1w * 0.34, g1y + g1h * 0.64, g1w * 0.26, g1h * 0.30);
    // 竖框
    b.strokeStyle = 'rgba(16,18,22,0.9)';
    b.lineWidth = Math.max(2, W * 0.0026);
    for (let i = 1; i < 4; i++) {
      b.beginPath();
      b.moveTo(g1x + g1w * i / 4, g1y);
      b.lineTo(g1x + g1w * i / 4, g1y + g1h);
      b.stroke();
    }
    b.strokeRect(g1x, g1y, g1w, g1h);
    // 一层通高玻璃：更暗，露出楼梯与展品
    const g2x = vx0 + vw * 0.06, g2y = vTop + H * 0.135, g2w = vw * 0.66, g2h = horizon - g2y - H * 0.012;
    const g2 = b.createLinearGradient(0, g2y, 0, g2y + g2h);
    g2.addColorStop(0, 'rgba(104,120,142,0.52)');
    g2.addColorStop(0.5, 'rgba(56,66,82,0.55)');
    g2.addColorStop(1, 'rgba(24,30,40,0.70)');
    b.fillStyle = g2;
    b.fillRect(g2x, g2y, g2w, g2h);
    // 室内：后墙、地面与通往二层的楼梯
    const inBack = b.createLinearGradient(0, g2y, 0, g2y + g2h);
    inBack.addColorStop(0, 'rgba(70,82,98,0.55)');
    inBack.addColorStop(0.7, 'rgba(38,46,58,0.62)');
    inBack.addColorStop(1, 'rgba(24,30,40,0.72)');
    b.fillStyle = inBack;
    b.fillRect(g2x, g2y, g2w, g2h);
    // 室内地面：一条被射灯照亮的浅色带
    b.fillStyle = 'rgba(196,214,238,0.10)';
    b.fillRect(g2x, g2y + g2h * 0.80, g2w, g2h * 0.20);
    b.strokeStyle = 'rgba(210,226,248,0.16)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(g2x, g2y + g2h * 0.80); b.lineTo(g2x + g2w, g2y + g2h * 0.80);
    b.stroke();
    // 楼梯：锯齿剖面 + 阶梯厚度 + 玻璃护栏
    const stN = 8, stX0 = g2x + g2w * 0.075, stY0 = g2y + g2h * 0.86;
    const stDx = g2w * 0.046, stDy = g2h * 0.062;
    b.fillStyle = 'rgba(16,20,26,0.62)';
    b.beginPath();
    b.moveTo(stX0, stY0);
    for (let i = 0; i < stN; i++) {
      const sxp = stX0 + i * stDx, syp = stY0 - i * stDy;
      b.lineTo(sxp, syp - stDy);
      b.lineTo(sxp + stDx, syp - stDy);
    }
    b.lineTo(stX0 + stN * stDx, stY0);
    b.closePath(); b.fill();
    // 踏面高光与踢面暗线
    b.strokeStyle = 'rgba(206,222,244,0.20)';
    b.lineWidth = 1.2;
    for (let i = 0; i < stN; i++) {
      const sxp = stX0 + i * stDx, syp = stY0 - i * stDy;
      b.beginPath();
      b.moveTo(sxp, syp - stDy); b.lineTo(sxp + stDx, syp - stDy);
      b.stroke();
      b.strokeStyle = 'rgba(10,14,20,0.35)';
      b.beginPath();
      b.moveTo(sxp, syp - stDy); b.lineTo(sxp, syp);
      b.stroke();
      b.strokeStyle = 'rgba(206,222,244,0.20)';
    }
    // 玻璃护栏：沿楼梯上缘的一条斜带
    b.fillStyle = 'rgba(186,210,238,0.10)';
    b.beginPath();
    b.moveTo(stX0 + stDx * 0.5, stY0 - stDy - g2h * 0.10);
    b.lineTo(stX0 + stN * stDx, stY0 - stN * stDy - g2h * 0.10);
    b.lineTo(stX0 + stN * stDx, stY0 - stN * stDy);
    b.lineTo(stX0 + stDx * 0.5, stY0 - stDy);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(214,232,255,0.26)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(stX0 + stDx * 0.5, stY0 - stDy - g2h * 0.10);
    b.lineTo(stX0 + stN * stDx, stY0 - stN * stDy - g2h * 0.10);
    b.stroke();
    b.beginPath();
    b.moveTo(stX0 + stDx * 0.5, stY0 - stDy - g2h * 0.055);
    b.lineTo(stX0 + stN * stDx, stY0 - stN * stDy - g2h * 0.055);
    b.stroke();
    // 展厅内的射灯：冷白小点与极淡的光锥
    for (let i = 0; i < 4; i++) {
      const lx4 = g2x + g2w * (0.16 + i * 0.22);
      b.fillStyle = 'rgba(240,246,255,0.75)';
      b.beginPath(); b.arc(lx4, g2y + g2h * 0.035, Math.max(1, W * 0.0018), 0, 6.3); b.fill();
      b.fillStyle = 'rgba(206,226,255,0.055)';
      b.beginPath();
      b.moveTo(lx4 - W * 0.002, g2y + g2h * 0.04);
      b.lineTo(lx4 + W * 0.002, g2y + g2h * 0.04);
      b.lineTo(lx4 + g2w * 0.055, g2y + g2h * 0.42);
      b.lineTo(lx4 - g2w * 0.055, g2y + g2h * 0.42);
      b.closePath(); b.fill();
    }
    // 右侧：展墙上的画与基座上的小雕塑
    const ax0 = g2x + g2w * 0.60, ay0 = g2y + g2h * 0.20, aw0 = g2w * 0.20, ah0 = g2h * 0.24;
    smallLandscape(b, ax0, ay0, aw0, ah0, 6);
    goldFrame(b, ax0, ay0, aw0, ah0, Math.max(2, W * 0.0022), '#6a5b3c');
    b.fillStyle = 'rgba(22,28,36,0.62)';
    b.fillRect(g2x + g2w * 0.655, g2y + g2h * 0.62, g2w * 0.09, g2h * 0.16);
    b.fillStyle = 'rgba(196,212,232,0.30)';
    b.beginPath();
    b.ellipse(g2x + g2w * 0.70, g2y + g2h * 0.60, g2w * 0.020, g2h * 0.045, 0, 0, 6.3);
    b.fill();
    b.fillStyle = 'rgba(228,216,190,0.22)';
    b.beginPath();
    b.ellipse(g2x + g2w * 0.696, g2y + g2h * 0.585, g2w * 0.008, g2h * 0.020, -0.3, 0, 6.3);
    b.fill();
    // 玻璃反光
    b.fillStyle = 'rgba(210,226,244,0.06)';
    b.beginPath();
    b.moveTo(g2x + g2w * 0.10, g2y);
    b.lineTo(g2x + g2w * 0.20, g2y);
    b.lineTo(g2x + g2w * 0.06, g2y + g2h);
    b.lineTo(g2x, g2y + g2h);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(190,212,240,0.045)';
    b.beginPath();
    b.moveTo(g2x + g2w * 0.56, g2y);
    b.lineTo(g2x + g2w * 0.70, g2y);
    b.lineTo(g2x + g2w * 0.44, g2y + g2h);
    b.lineTo(g2x + g2w * 0.32, g2y + g2h);
    b.closePath(); b.fill();
    // 玻璃竖框
    b.strokeStyle = 'rgba(18,20,24,0.9)';
    for (let i = 1; i < 4; i++) {
      b.beginPath();
      b.moveTo(g2x + g2w * i / 3, g2y);
      b.lineTo(g2x + g2w * i / 3, g2y + g2h);
      b.stroke();
    }
    b.strokeRect(g2x, g2y, g2w, g2h);
    // 楼板挑檐与射灯
    b.fillStyle = '#23262c';
    b.fillRect(vx0 - W * 0.018, vTop + H * 0.105, vw + W * 0.036, H * 0.018);
    b.fillStyle = 'rgba(255,250,240,0.10)';
    b.fillRect(vx0 - W * 0.018, vTop + H * 0.105, vw + W * 0.036, 2);
    for (let i = 0; i < 4; i++) {
      const lx3 = vx0 + vw * (0.18 + i * 0.18);
      b.fillStyle = '#ffeccc';
      b.beginPath(); b.arc(lx3, vTop + H * 0.112, Math.max(1.2, W * 0.0018), 0, 6.3); b.fill();
    }
    // 屋顶与烟囱状设备间
    b.fillStyle = '#2a2e34';
    b.fillRect(vx0 + vw * 0.22, vTop - H * 0.022, vw * 0.26, H * 0.028);
    b.fillStyle = 'rgba(255,255,255,0.05)';
    b.fillRect(vx0 + vw * 0.22, vTop - H * 0.022, vw * 0.26, 2);
    // 海雾
    b.save();
    b.globalCompositeOperation = 'lighter';
    const haze = b.createLinearGradient(0, seaBot - H * 0.10, 0, seaBot + H * 0.03);
    haze.addColorStop(0, 'rgba(120,150,196,0)');
    haze.addColorStop(1, 'rgba(120,150,196,0.10)');
    b.fillStyle = haze;
    b.fillRect(0, seaBot - H * 0.10, W, H * 0.13);
    b.restore();
  }
  drawVilla.ground = function (b, p, horizon) {
    const night = state.time === 'night';
    // 悬崖上的混凝土平台
    const deck = b.createLinearGradient(0, horizon, 0, H);
    deck.addColorStop(0, night ? '#252a31' : '#3d444c');
    deck.addColorStop(1, night ? '#12151a' : '#262b31');
    b.fillStyle = deck;
    b.fillRect(0, horizon, W, H - horizon);
    // 混凝土板缝
    b.strokeStyle = 'rgba(8,10,14,0.5)';
    b.lineWidth = 1;
    for (let r = 0; r < 7; r++) {
      const t = r / 7;
      const yy = horizon + (H - horizon) * Math.pow(t, 1.5);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
      const off = (r % 2) * W * 0.05;
      for (let x0 = off; x0 < W; x0 += W * 0.1) {
        b.beginPath(); b.moveTo(x0, yy); b.lineTo(x0 + W * 0.02, yy + (H - horizon) * 0.14); b.stroke();
      }
    }
    // 左侧临海的玻璃栏板与立柱
    b.fillStyle = 'rgba(150,176,206,0.10)';
    b.fillRect(0, horizon - H * 0.055, W * 0.40, H * 0.06);
    b.strokeStyle = 'rgba(180,198,220,0.28)';
    b.lineWidth = 1.4;
    b.beginPath(); b.moveTo(0, horizon - H * 0.055); b.lineTo(W * 0.40, horizon - H * 0.055); b.stroke();
    b.fillStyle = '#1a1d23';
    for (let i = 0; i < 6; i++) {
      b.fillRect(W * (0.02 + i * 0.072), horizon - H * 0.06, W * 0.005, H * 0.075);
    }
    // 出入口的冷光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const doorGlow = b.createRadialGradient(W * 0.56, horizon + H * 0.02, 0, W * 0.56, horizon + H * 0.02, W * 0.16);
    doorGlow.addColorStop(0, 'rgba(186,206,232,0.16)');
    doorGlow.addColorStop(1, 'rgba(186,206,232,0)');
    b.fillStyle = doorGlow;
    b.beginPath(); b.arc(W * 0.56, horizon + H * 0.02, W * 0.16, 0, 6.3); b.fill();
    b.restore();
    // 右侧夹竹桃与龙舌兰
    const oleander = (ox, oy, ow, oh) => {
      // 叶团：由多个不规则暗块叠出不规则轮廓
      for (let i = 0; i < 16; i++) {
        const mx = ox + rand(-0.85, 0.85) * ow;
        const my = oy - rand(0.10, 0.95) * oh;
        b.fillStyle = `rgba(${14 + Math.floor(rand(0, 10))},${26 + Math.floor(rand(0, 12))},${21 + Math.floor(rand(0, 8))},0.94)`;
        b.beginPath();
        b.ellipse(mx, my, ow * rand(0.22, 0.40), oh * rand(0.14, 0.24), rand(-0.6, 0.6), 0, 6.3);
        b.fill();
      }
      // 枝条
      b.strokeStyle = 'rgba(9,15,12,0.85)';
      b.lineWidth = Math.max(1.5, W * 0.0018);
      for (let i = 0; i < 4; i++) {
        b.beginPath();
        b.moveTo(ox + ow * (i - 1.5) * 0.16, oy);
        b.quadraticCurveTo(ox + ow * (i - 1.5) * 0.45, oy - oh * 0.55, ox + ow * (i - 1.5) * 0.62, oy - oh * rand(0.7, 1.0));
        b.stroke();
      }
      // 叶：细长的柳叶形，成簇
      for (let i = 0; i < 64; i++) {
        const lx = ox + rand(-1, 1) * ow;
        const ly = oy - rand(0.10, 1.02) * oh;
        const ll = ow * rand(0.14, 0.24), lw = ll * rand(0.22, 0.32);
        const ang = rand(-1.35, 1.35) + (lx < ox ? 0.25 : -0.25);
        const tone = rand(0, 1);
        b.save();
        b.translate(lx, ly);
        b.rotate(ang);
        b.fillStyle = tone > 0.7
          ? 'rgba(50,74,58,0.95)'
          : (tone > 0.38 ? 'rgba(32,52,42,0.96)' : 'rgba(20,34,29,0.97)');
        b.beginPath();
        b.moveTo(-ll * 0.5, 0);
        b.quadraticCurveTo(0, -lw, ll * 0.5, 0);
        b.quadraticCurveTo(0, lw, -ll * 0.5, 0);
        b.fill();
        if (tone > 0.7) {
          b.strokeStyle = 'rgba(160,188,208,0.16)';
          b.lineWidth = 0.8;
          b.stroke();
        }
        b.restore();
      }
    };
    oleander(W * 0.045, horizon + H * 0.16, W * 0.095, H * 0.26);
    oleander(W * 0.185, horizon + H * 0.10, W * 0.07, H * 0.19);
    oleander(W * 0.955, horizon + H * 0.18, W * 0.10, H * 0.28);
    // 地灯与落光
    b.fillStyle = '#1a1d22';
    b.fillRect(W * 0.88, horizon + H * 0.02, W * 0.006, H * 0.035);
    b.fillStyle = '#eef4ff';
    b.beginPath(); b.arc(W * 0.883, horizon + H * 0.018, Math.max(1.2, W * 0.0022), 0, 6.3); b.fill();
    b.save();
    b.globalCompositeOperation = 'lighter';
    const lampPool = b.createRadialGradient(W * 0.883, horizon + H * 0.06, 0, W * 0.883, horizon + H * 0.06, W * 0.10);
    lampPool.addColorStop(0, 'rgba(196,216,244,0.10)');
    lampPool.addColorStop(1, 'rgba(196,216,244,0)');
    b.fillStyle = lampPool;
    b.beginPath(); b.arc(W * 0.883, horizon + H * 0.06, W * 0.10, 0, 6.3); b.fill();
    // 窗口光落在车道
    const winPool = b.createRadialGradient(W * 0.66, horizon + H * 0.03, 0, W * 0.66, horizon + H * 0.03, W * 0.13);
    winPool.addColorStop(0, 'rgba(176,196,224,0.05)');
    winPool.addColorStop(1, 'rgba(176,196,224,0)');
    b.fillStyle = winPool;
    b.beginPath(); b.arc(W * 0.66, horizon + H * 0.03, W * 0.13, 0, 6.3); b.fill();
    b.restore();
    // 下缘压暗
    const bottom = b.createLinearGradient(0, H * 0.84, 0, H);
    bottom.addColorStop(0, 'rgba(2,4,8,0)');
    bottom.addColorStop(1, 'rgba(2,4,8,0.5)');
    b.fillStyle = bottom;
    b.fillRect(0, H * 0.84, W, H * 0.16);
  };

  /* ---------- 场景：恒温画库 ---------- */
  function drawVault(b, p, horizon) {
    // 冷灰色吸音墙体
    const wall = b.createLinearGradient(0, 0, 0, horizon);
    wall.addColorStop(0, '#1b2129');
    wall.addColorStop(0.5, '#262d36');
    wall.addColorStop(1, '#1d232b');
    b.fillStyle = wall;
    b.fillRect(0, 0, W, horizon);
    // 墙板分缝
    b.strokeStyle = 'rgba(10,12,16,0.55)';
    b.lineWidth = 1.2;
    for (let i = 1; i < 10; i++) {
      const xx = (i / 10) * W;
      b.beginPath(); b.moveTo(xx, 0); b.lineTo(xx, horizon); b.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const yy = (i / 4) * horizon;
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    // 吸音孔板的细密微孔
    b.fillStyle = 'rgba(150,164,180,0.035)';
    for (let i = 0; i < 220; i++) {
      b.beginPath();
      b.arc(Math.random() * W, Math.random() * horizon, 0.8, 0, 6.3);
      b.fill();
    }
    // 吊顶与灯槽
    b.fillStyle = '#12161b';
    b.fillRect(0, 0, W, H * 0.075);
    b.fillStyle = 'rgba(214,232,255,0.75)';
    for (let i = 0; i < 5; i++) {
      b.fillRect(W * (0.12 + i * 0.17), H * 0.028, W * 0.10, H * 0.007);
    }
    // 顶部射灯
    for (let i = 0; i < 4; i++) {
      const lx = W * (0.22 + i * 0.19);
      b.fillStyle = '#232a33';
      b.fillRect(lx - W * 0.008, H * 0.058, W * 0.016, H * 0.010);
      b.fillStyle = '#f0f6ff';
      b.beginPath(); b.arc(lx, H * 0.070, Math.max(1.4, W * 0.0022), 0, 6.3); b.fill();
      b.save();
      b.globalCompositeOperation = 'lighter';
      const cone = b.createLinearGradient(0, H * 0.07, 0, horizon + H * 0.10);
      cone.addColorStop(0, 'rgba(206,226,255,0.10)');
      cone.addColorStop(1, 'rgba(206,226,255,0)');
      b.fillStyle = cone;
      b.beginPath();
      b.moveTo(lx - W * 0.006, H * 0.07);
      b.lineTo(lx + W * 0.006, H * 0.07);
      b.lineTo(lx + W * 0.085, horizon + H * 0.10);
      b.lineTo(lx - W * 0.085, horizon + H * 0.10);
      b.closePath(); b.fill();
      b.restore();
    }
    // 左右两侧的恒湿展柜
    const vitrine = (cx, cy, cw, ch, art) => {
      b.fillStyle = 'rgba(4,6,9,0.5)';
      b.fillRect(cx + W * 0.004, cy + H * 0.004, cw, ch);
      b.fillStyle = '#2b323b';
      b.fillRect(cx, cy + ch, cw, H * 0.030);
      const inner = b.createLinearGradient(cx, cy, cx + cw, cy);
      inner.addColorStop(0, 'rgba(74,88,104,0.62)');
      inner.addColorStop(0.5, 'rgba(112,128,148,0.46)');
      inner.addColorStop(1, 'rgba(54,66,80,0.62)');
      b.fillStyle = inner;
      b.fillRect(cx, cy, cw, ch);
      // 展品
      if (art === 0) {
        smallLandscape(b, cx + cw * 0.18, cy + ch * 0.16, cw * 0.40, ch * 0.42, 2);
        goldFrame(b, cx + cw * 0.18, cy + ch * 0.16, cw * 0.40, ch * 0.42, Math.max(2, W * 0.002), '#6c5836');
      } else if (art === 1) {
        // 铜铸半身像：头、颈、肩、底座
        const bcx = cx + cw * 0.5, bbase = cy + ch * 0.66;
        b.fillStyle = '#2c2a26';
        b.fillRect(bcx - cw * 0.16, bbase, cw * 0.32, ch * 0.05);
        const bronze = b.createLinearGradient(bcx - cw * 0.2, 0, bcx + cw * 0.2, 0);
        bronze.addColorStop(0, '#4e3a24');
        bronze.addColorStop(0.45, '#8a6a3c');
        bronze.addColorStop(1, '#3c2c1a');
        b.fillStyle = bronze;
        // 肩胸
        b.beginPath();
        b.moveTo(bcx - cw * 0.19, bbase);
        b.quadraticCurveTo(bcx - cw * 0.16, bbase - ch * 0.20, bcx - cw * 0.07, bbase - ch * 0.24);
        b.lineTo(bcx + cw * 0.07, bbase - ch * 0.24);
        b.quadraticCurveTo(bcx + cw * 0.16, bbase - ch * 0.20, bcx + cw * 0.19, bbase);
        b.closePath(); b.fill();
        // 颈
        b.fillRect(bcx - cw * 0.045, bbase - ch * 0.32, cw * 0.09, ch * 0.10);
        // 头
        b.beginPath();
        b.ellipse(bcx, bbase - ch * 0.36, cw * 0.075, ch * 0.085, 0, 0, 6.3);
        b.fill();
        b.fillStyle = 'rgba(255,224,168,0.20)';
        b.beginPath();
        b.ellipse(bcx - cw * 0.02, bbase - ch * 0.385, cw * 0.028, ch * 0.034, -0.4, 0, 6.3);
        b.fill();
        // 头顶的发髻/短发体积：压在亮面上方，避免读成棋子
        b.fillStyle = '#5a4326';
        b.beginPath();
        b.ellipse(bcx, bbase - ch * 0.405, cw * 0.080, ch * 0.048, 0, Math.PI * 1.05, Math.PI * 1.95);
        b.fill();
        b.fillStyle = 'rgba(30,20,10,0.45)';
        b.beginPath();
        b.ellipse(bcx + cw * 0.045, bbase - ch * 0.355, cw * 0.026, ch * 0.030, 0.2, 0, 6.3);
        b.fill();
        // 肩胸的衣褶与胸线
        b.strokeStyle = 'rgba(30,20,10,0.45)';
        b.lineWidth = Math.max(1, W * 0.0012);
        b.beginPath();
        b.moveTo(bcx - cw * 0.055, bbase - ch * 0.235);
        b.quadraticCurveTo(bcx, bbase - ch * 0.205, bcx + cw * 0.055, bbase - ch * 0.235);
        b.stroke();
        b.beginPath();
        b.moveTo(bcx, bbase - ch * 0.235);
        b.lineTo(bcx, bbase - ch * 0.085);
        b.stroke();
        // 截断的双臂与断口
        b.fillStyle = '#6e5430';
        b.beginPath();
        b.ellipse(bcx - cw * 0.175, bbase - ch * 0.10, cw * 0.035, ch * 0.055, -0.2, 0, 6.3);
        b.fill();
        b.beginPath();
        b.ellipse(bcx + cw * 0.175, bbase - ch * 0.10, cw * 0.035, ch * 0.055, 0.2, 0, 6.3);
        b.fill();
      } else {
        b.fillStyle = '#d8d2c2';
        b.save();
        b.translate(cx + cw * 0.5, cy + ch * 0.42);
        b.rotate(-0.18);
        b.fillRect(-cw * 0.20, -ch * 0.10, cw * 0.40, ch * 0.22);
        b.restore();
      }
      // 玻璃
      b.strokeStyle = 'rgba(170,196,226,0.30)';
      b.lineWidth = 1.4;
      b.strokeRect(cx, cy, cw, ch);
      b.fillStyle = 'rgba(198,220,248,0.045)';
      b.beginPath();
      b.moveTo(cx + cw * 0.06, cy);
      b.lineTo(cx + cw * 0.16, cy);
      b.lineTo(cx + cw * 0.05, cy + ch);
      b.lineTo(cx, cy + ch);
      b.closePath(); b.fill();
      // 温湿度读数
      b.fillStyle = 'rgba(140,220,190,0.65)';
      b.fillRect(cx + cw - W * 0.016, cy - H * 0.012, W * 0.014, H * 0.007);
    };
    vitrine(W * 0.055, H * 0.28, W * 0.115, H * 0.22, 0);
    vitrine(W * 0.185, H * 0.335, W * 0.100, H * 0.165, 2);
    vitrine(W * 0.735, H * 0.30, W * 0.110, H * 0.20, 1);
    vitrine(W * 0.860, H * 0.35, W * 0.095, H * 0.15, 0);
    // 后墙的气密合金门（半开，漏出走廊的冷光）
    const dx = W * 0.395, dw = W * 0.10, dTop2 = H * 0.205, dBot2 = horizon;
    b.fillStyle = '#0a0e13';
    b.fillRect(dx, dTop2, dw, dBot2 - dTop2);
    b.fillStyle = 'rgba(212,232,255,0.10)';
    b.fillRect(dx + dw * 0.06, dTop2 + H * 0.008, dw * 0.88, dBot2 - dTop2 - H * 0.008);
    b.fillStyle = '#2f3742';
    b.fillRect(dx + dw * 0.55, dTop2, dw * 0.48, dBot2 - dTop2);
    b.fillStyle = 'rgba(186,206,232,0.16)';
    b.fillRect(dx + dw * 0.55, dTop2, W * 0.002, dBot2 - dTop2);
    // 门禁键盘
    b.fillStyle = '#20262e';
    b.fillRect(dx - W * 0.022, H * 0.30, W * 0.016, H * 0.030);
    b.fillStyle = 'rgba(120,230,190,0.8)';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        b.fillRect(dx - W * 0.020 + c * W * 0.0045, H * 0.306 + r * H * 0.0075, 2, 2);
      }
    }
    // 中央防爆玻璃展架
    const gx = W * 0.365, gw = W * 0.270, gtop = H * 0.145, gbot = horizon;
    b.fillStyle = 'rgba(0,0,0,0.5)';
    b.fillRect(gx + W * 0.008, gtop + H * 0.008, gw, gbot - gtop + H * 0.04);
    // 玻璃罩
    const caseG = b.createLinearGradient(0, gtop, 0, gbot);
    caseG.addColorStop(0, 'rgba(46,58,72,0.34)');
    caseG.addColorStop(0.55, 'rgba(34,44,56,0.44)');
    caseG.addColorStop(1, 'rgba(24,32,42,0.55)');
    b.fillStyle = caseG;
    b.fillRect(gx, gtop, gw, gbot - gtop);
    // 背板
    b.fillStyle = 'rgba(18,24,32,0.35)';
    b.fillRect(gx + gw * 0.06, gtop + H * 0.015, gw * 0.88, gbot - gtop - H * 0.06);
    // 真迹：无外框的逆向星月夜
    const pw2 = gw * 0.76, ph2 = pw2 * 0.79;
    const px2 = gx + (gw - pw2) / 2, py2 = gtop + (gbot - gtop - ph2) * 0.38;
    b.fillStyle = 'rgba(0,0,0,0.25)';
    b.fillRect(px2 + W * 0.004, py2 + H * 0.004, pw2, ph2);
    paintStarry(b, px2, py2, pw2, ph2, true);
    // 帆布边缘的毛边
    b.strokeStyle = 'rgba(214,208,190,0.35)';
    b.lineWidth = 1.2;
    b.strokeRect(px2, py2, pw2, ph2);
    // 展签与调节箱
    b.fillStyle = '#1d242c';
    b.fillRect(px2 + pw2 * 0.30, py2 + ph2 + H * 0.035, pw2 * 0.40, H * 0.020);
    b.fillStyle = 'rgba(214,226,240,0.55)';
    b.fillRect(px2 + pw2 * 0.33, py2 + ph2 + H * 0.041, pw2 * 0.20, 1.4);
    b.fillRect(px2 + pw2 * 0.33, py2 + ph2 + H * 0.047, pw2 * 0.28, 1.2);
    b.fillStyle = '#2a333d';
    b.fillRect(gx + gw * 0.40, gbot - H * 0.055, gw * 0.20, H * 0.050);
    b.fillStyle = 'rgba(120,230,190,0.75)';
    b.fillRect(gx + gw * 0.415, gbot - H * 0.046, W * 0.004, W * 0.004);
    // 玻璃反光与边框
    b.strokeStyle = 'rgba(170,196,226,0.34)';
    b.lineWidth = 2;
    b.strokeRect(gx, gtop, gw, gbot - gtop);
    b.fillStyle = 'rgba(190,214,244,0.05)';
    b.beginPath();
    b.moveTo(gx + gw * 0.05, gtop);
    b.lineTo(gx + gw * 0.16, gtop);
    b.lineTo(gx + gw * 0.03, gbot);
    b.lineTo(gx, gbot);
    b.closePath(); b.fill();
    // 画面投光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const spot = b.createRadialGradient(px2 + pw2 / 2, py2 + ph2 / 2, 0, px2 + pw2 / 2, py2 + ph2 / 2, pw2 * 1.2);
    spot.addColorStop(0, 'rgba(230,240,255,0.10)');
    spot.addColorStop(1, 'rgba(230,240,255,0)');
    b.fillStyle = spot;
    b.fillRect(gx - W * 0.10, gtop, gw + W * 0.20, H * 0.5);
    b.restore();
  }
  drawVault.ground = function (b, p, horizon) {
    // 深色石材地面，带镜面般的冷光反射
    const floor = b.createLinearGradient(0, horizon, 0, H);
    floor.addColorStop(0, '#1b222a');
    floor.addColorStop(0.5, '#161c23');
    floor.addColorStop(1, '#0b0f14');
    b.fillStyle = floor;
    b.fillRect(0, horizon, W, H - horizon);
    b.strokeStyle = 'rgba(120,140,164,0.06)';
    b.lineWidth = 1;
    for (let r = 0; r < 8; r++) {
      const t = r / 8;
      const yy = horizon + (H - horizon) * Math.pow(t, 1.5);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    // 展柜底座与灯光倒影
    for (const [cx, cw, ch] of [[0.055, 0.115, 0.22], [0.185, 0.100, 0.165], [0.735, 0.110, 0.20], [0.860, 0.095, 0.15]]) {
      const bx2 = W * cx, bw2 = W * cw;
      b.fillStyle = '#2b323b';
      b.fillRect(bx2 - W * 0.008, horizon - H * 0.012, bw2 + W * 0.016, H * 0.038);
      b.fillStyle = 'rgba(190,214,244,0.05)';
      b.fillRect(bx2 - W * 0.008, horizon - H * 0.012, bw2 + W * 0.016, 2);
      b.save();
      b.globalCompositeOperation = 'lighter';
      const refl = b.createLinearGradient(0, horizon + H * 0.026, 0, horizon + H * 0.14);
      refl.addColorStop(0, 'rgba(150,186,228,0.07)');
      refl.addColorStop(1, 'rgba(150,186,228,0)');
      b.fillStyle = refl;
      b.fillRect(bx2, horizon + H * 0.026, bw2 * 0.9, H * 0.12);
      b.restore();
      void ch;
    }
    // 中央展架的混凝土基座
    const gx = W * 0.365, gw = W * 0.270;
    b.fillStyle = 'rgba(0,0,0,0.30)';
    b.beginPath(); b.ellipse(gx + gw / 2, H * 0.888, gw * 0.48, H * 0.015, 0, 0, 6.3); b.fill();
    const base = b.createLinearGradient(0, horizon, 0, H * 0.86);
    base.addColorStop(0, '#333c47');
    base.addColorStop(0.55, '#242b34');
    base.addColorStop(1, '#161b21');
    b.fillStyle = base;
    b.beginPath();
    b.moveTo(gx + gw * 0.145, horizon);
    b.lineTo(gx + gw * 0.085, H * 0.86);
    b.lineTo(gx + gw * 0.915, H * 0.86);
    b.lineTo(gx + gw * 0.855, horizon);
    b.closePath(); b.fill();
    // 台口压边与左侧受光
    b.fillStyle = 'rgba(8,10,13,0.45)';
    b.fillRect(gx + gw * 0.145, horizon, gw * 0.71, H * 0.008);
    b.fillStyle = 'rgba(200,222,250,0.07)';
    b.fillRect(gx + gw * 0.155, horizon + H * 0.008, gw * 0.022, H * 0.86 - horizon - H * 0.008);
    // 基座上的金属抽屉（半开）
    b.fillStyle = '#3c4652';
    b.fillRect(gx + gw * 0.20, H * 0.812, gw * 0.56, H * 0.045);
    b.fillStyle = '#12171d';
    b.fillRect(gx + gw * 0.22, H * 0.818, gw * 0.52, H * 0.033);
    // 抽屉里的账册与羊皮纸
    b.fillStyle = '#1c1c20';
    b.beginPath();
    b.moveTo(gx + gw * 0.26, H * 0.822);
    b.lineTo(gx + gw * 0.44, H * 0.818);
    b.lineTo(gx + gw * 0.46, H * 0.842);
    b.lineTo(gx + gw * 0.28, H * 0.846);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(198,184,140,0.5)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(gx + gw * 0.26, H * 0.822);
    b.lineTo(gx + gw * 0.44, H * 0.818);
    b.stroke();
    b.fillStyle = '#cdbc92';
    b.beginPath();
    b.moveTo(gx + gw * 0.52, H * 0.820);
    b.lineTo(gx + gw * 0.70, H * 0.816);
    b.lineTo(gx + gw * 0.71, H * 0.840);
    b.lineTo(gx + gw * 0.53, H * 0.844);
    b.closePath(); b.fill();
    // 地灯在湿地上的长倒影
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const lx3 = W * (0.22 + i * 0.19);
      const streak = b.createLinearGradient(0, horizon, 0, H * 0.95);
      streak.addColorStop(0, 'rgba(200,224,255,0.08)');
      streak.addColorStop(1, 'rgba(200,224,255,0)');
      b.fillStyle = streak;
      b.fillRect(lx3 - W * 0.006, horizon, W * 0.012, H * 0.32);
    }
    b.restore();
    // 中央的橡胶防滑垫
    b.fillStyle = 'rgba(8,10,13,0.5)';
    b.beginPath();
    b.moveTo(W * 0.42, H * 0.93);
    b.lineTo(W * 0.58, H * 0.93);
    b.lineTo(W * 0.66, H);
    b.lineTo(W * 0.34, H);
    b.closePath(); b.fill();
    // 下缘压暗
    const bottom = b.createLinearGradient(0, H * 0.86, 0, H);
    bottom.addColorStop(0, 'rgba(2,4,7,0)');
    bottom.addColorStop(1, 'rgba(2,4,7,0.52)');
    b.fillStyle = bottom;
    b.fillRect(0, H * 0.86, W, H * 0.14);
  };

  /* ---------- 场景：巴黎顶楼修复室 ---------- */
  function drawStudio(b, p, horizon) {
    // 阁楼斜顶：左高右低的梁
    const wallG = b.createLinearGradient(0, 0, 0, horizon);
    wallG.addColorStop(0, '#2b2722');
    wallG.addColorStop(0.6, '#403a32');
    wallG.addColorStop(1, '#353028');
    b.fillStyle = wallG;
    b.fillRect(0, 0, W, horizon);
    // 顶棚板条与横梁
    b.fillStyle = 'rgba(18,15,12,0.5)';
    for (let i = 0; i < 16; i++) {
      const yy = H * (0.01 + i * 0.032);
      b.fillRect(0, yy, W, 1);
    }
    b.fillStyle = '#1c1814';
    b.beginPath();
    b.moveTo(0, H * 0.10);
    b.lineTo(W, H * 0.02);
    b.lineTo(W, H * 0.075);
    b.lineTo(0, H * 0.165);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(214,196,160,0.08)';
    b.beginPath();
    b.moveTo(0, H * 0.10);
    b.lineTo(W, H * 0.02);
    b.lineTo(W, H * 0.028);
    b.lineTo(0, H * 0.108);
    b.closePath(); b.fill();
    // 天窗：夜雨与远处的街光
    const sx0 = W * 0.36, sw0 = W * 0.30, stTop = H * 0.035, stBot = H * 0.165;
    b.fillStyle = '#15181e';
    b.beginPath();
    b.moveTo(sx0 - W * 0.015, stBot);
    b.lineTo(sx0 + W * 0.01, stTop);
    b.lineTo(sx0 + sw0 - W * 0.01, stTop + H * 0.008);
    b.lineTo(sx0 + sw0 + W * 0.015, stBot);
    b.closePath(); b.fill();
    b.save();
    b.beginPath();
    b.moveTo(sx0, stBot - 3);
    b.lineTo(sx0 + W * 0.014, stTop + 4);
    b.lineTo(sx0 + sw0 - W * 0.014, stTop + H * 0.008 + 4);
    b.lineTo(sx0 + sw0, stBot - 3);
    b.closePath(); b.clip();
    const sky3 = b.createLinearGradient(0, stTop, 0, stBot);
    sky3.addColorStop(0, '#141b32');
    sky3.addColorStop(1, '#4a3a44');
    b.fillStyle = sky3;
    b.fillRect(sx0, stTop, sw0, stBot - stTop);
    // 远处屋顶的暖窗
    for (let i = 0; i < 14; i++) {
      b.fillStyle = `rgba(255,196,132,${rand(0.15, 0.45)})`;
      b.fillRect(sx0 + rand(0.05, 0.9) * sw0, stBot - rand(0.02, 0.07) * H, rand(1.5, 3), 2);
    }
    // 雨丝
    b.strokeStyle = 'rgba(190,206,232,0.14)';
    b.lineWidth = 0.8;
    for (let i = 0; i < 26; i++) {
      const rx2 = sx0 + Math.random() * sw0;
      const ry2 = stTop + Math.random() * (stBot - stTop);
      b.beginPath(); b.moveTo(rx2, ry2); b.lineTo(rx2 - 2, ry2 + 9); b.stroke();
    }
    b.restore();
    // 天窗框
    b.strokeStyle = '#2c2822';
    b.lineWidth = Math.max(3, W * 0.004);
    b.beginPath();
    b.moveTo(sx0, stBot);
    b.lineTo(sx0 + W * 0.014, stTop);
    b.lineTo(sx0 + sw0 - W * 0.014, stTop + H * 0.008);
    b.lineTo(sx0 + sw0, stBot);
    b.closePath(); b.stroke();
    b.beginPath();
    b.moveTo(sx0 + sw0 * 0.5, stTop + H * 0.004);
    b.lineTo(sx0 + sw0 * 0.5, stBot);
    b.stroke();
    // 左侧大窗：玛莱区的屋顶与雨
    const wx = W * 0.045, ww = W * 0.235, wTop = H * 0.155, wBot = horizon - H * 0.02;
    b.fillStyle = '#141820';
    b.fillRect(wx - W * 0.010, wTop - H * 0.010, ww + W * 0.020, wBot - wTop + H * 0.010);
    b.save();
    b.beginPath(); b.rect(wx, wTop, ww, wBot - wTop); b.clip();
    const sky4 = b.createLinearGradient(0, wTop, 0, wBot);
    sky4.addColorStop(0, '#101830');
    sky4.addColorStop(1, '#3a3040');
    b.fillStyle = sky4;
    b.fillRect(wx, wTop, ww, wBot - wTop);
    // 屋顶剪影与点点窗光
    b.fillStyle = '#0c1018';
    b.beginPath();
    b.moveTo(wx, wBot);
    b.lineTo(wx, wBot - (wBot - wTop) * 0.30);
    b.lineTo(wx + ww * 0.18, wBot - (wBot - wTop) * 0.36);
    b.lineTo(wx + ww * 0.30, wBot - (wBot - wTop) * 0.28);
    b.lineTo(wx + ww * 0.46, wBot - (wBot - wTop) * 0.42);
    b.lineTo(wx + ww * 0.60, wBot - (wBot - wTop) * 0.30);
    b.lineTo(wx + ww * 0.76, wBot - (wBot - wTop) * 0.38);
    b.lineTo(wx + ww, wBot - (wBot - wTop) * 0.26);
    b.lineTo(wx + ww, wBot);
    b.closePath(); b.fill();
    for (let i = 0; i < 12; i++) {
      b.fillStyle = `rgba(255,196,132,${rand(0.18, 0.5)})`;
      b.fillRect(wx + rand(0.04, 0.95) * ww, wBot - rand(0.03, 0.25) * (wBot - wTop), 2, 2);
    }
    // 雨痕
    b.strokeStyle = 'rgba(190,206,232,0.10)';
    b.lineWidth = 0.8;
    for (let i = 0; i < 22; i++) {
      const rx3 = wx + Math.random() * ww, ry3 = wTop + Math.random() * (wBot - wTop);
      b.beginPath(); b.moveTo(rx3, ry3); b.lineTo(rx3 - 3, ry3 + rand(10, 30)); b.stroke();
    }
    b.restore();
    b.strokeStyle = '#26221d';
    b.lineWidth = Math.max(3, W * 0.004);
    b.strokeRect(wx, wTop, ww, wBot - wTop);
    b.beginPath();
    b.moveTo(wx + ww / 2, wTop); b.lineTo(wx + ww / 2, wBot);
    b.moveTo(wx, wTop + (wBot - wTop) / 2); b.lineTo(wx + ww, wTop + (wBot - wTop) / 2);
    b.stroke();
    // 窗下的暖气片
    b.fillStyle = '#2a2622';
    b.fillRect(wx, wBot + H * 0.008, ww, H * 0.055);
    b.strokeStyle = 'rgba(10,8,7,0.6)';
    b.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      b.beginPath();
      b.moveTo(wx + (i / 12) * ww, wBot + H * 0.012);
      b.lineTo(wx + (i / 12) * ww, wBot + H * 0.058);
      b.stroke();
    }
    // 后墙的颜料架
    const shx = W * 0.30, shw = W * 0.40;
    b.fillStyle = '#241f1a';
    b.fillRect(shx, H * 0.245, shw, H * 0.035);
    b.fillRect(shx, H * 0.345, shw, H * 0.032);
    b.fillRect(shx, H * 0.44, shw, H * 0.030);
    // 玻璃颜料瓶与粉末罐
    const jarColors = ['#21408c', '#2c5aa8', '#c8a02c', '#b8542c', '#3e6c4a', '#6c4a7c', '#c8c0a8'];
    for (let row = 0; row < 3; row++) {
      const yBase = H * (0.245 + row * 0.098);
      const count = 16 - row * 2;
      for (let i = 0; i < count; i++) {
        const jx = shx + (i + 0.5) * (shw / count);
        const jh = H * (0.030 + ((i * 7 + row * 3) % 4) * 0.004);
        b.fillStyle = 'rgba(28,26,24,0.7)';
        b.fillRect(jx - W * 0.006, yBase - jh, W * 0.012, jh);
        b.fillStyle = jarColors[(i + row * 2) % jarColors.length];
        b.globalAlpha = 0.55;
        b.fillRect(jx - W * 0.005, yBase - jh + 3, W * 0.010, jh - 5);
        b.globalAlpha = 1;
        b.fillStyle = 'rgba(255,244,214,0.18)';
        b.fillRect(jx - W * 0.004, yBase - jh + 3, W * 0.002, jh - 6);
        b.fillStyle = '#4c443a';
        b.fillRect(jx - W * 0.006, yBase - jh - 2, W * 0.012, 2);
      }
    }
    // 显微镜与调色板
    b.fillStyle = '#1b1b1e';
    b.fillRect(W * 0.305, H * 0.40, W * 0.035, H * 0.012);
    b.fillRect(W * 0.316, H * 0.36, W * 0.006, H * 0.042);
    b.fillStyle = '#8c8f94';
    b.beginPath(); b.ellipse(W * 0.322, H * 0.358, W * 0.010, H * 0.005, 0.3, 0, 6.3); b.fill();
    b.fillStyle = '#6c4a2e';
    b.beginPath();
    b.ellipse(W * 0.615, H * 0.405, W * 0.045, H * 0.012, -0.1, 0, 6.3);
    b.fill();
    b.fillStyle = '#d8cba4';
    const dabColors = ['#21408c', '#c8a02c', '#b8542c', '#3e6c4a', '#c8c0a8'];
    for (let i = 0; i < 5; i++) {
      b.fillStyle = dabColors[i];
      b.globalAlpha = 0.85;
      b.beginPath();
      b.arc(W * (0.60 + i * 0.016), H * (0.402 + (i % 2) * 0.004), W * 0.0045, 0, 6.3);
      b.fill();
      b.globalAlpha = 1;
    }
    // 右侧的立式画架与空白画布
    const ex = W * 0.775, eTop = H * 0.20, eBot = horizon + H * 0.03;
    b.strokeStyle = '#2c231b';
    b.lineWidth = Math.max(4, W * 0.005);
    b.beginPath();
    b.moveTo(ex - W * 0.055, eBot); b.lineTo(ex - W * 0.012, eTop);
    b.moveTo(ex + W * 0.055, eBot); b.lineTo(ex + W * 0.012, eTop);
    b.moveTo(ex, eTop + H * 0.01); b.lineTo(ex, eBot - H * 0.02);
    b.stroke();
    // 空白亚麻画布
    const cvx = ex - W * 0.070, cvy = H * 0.245, cvw = W * 0.140, cvh = H * 0.215;
    const linen = b.createLinearGradient(cvx, cvy, cvx + cvw, cvy + cvh);
    linen.addColorStop(0, '#b3a488');
    linen.addColorStop(0.5, '#a2947a');
    linen.addColorStop(1, '#887a62');
    b.fillStyle = linen;
    b.fillRect(cvx, cvy, cvw, cvh);
    // 亚麻纹理与边缘压暗
    b.strokeStyle = 'rgba(120,104,80,0.10)';
    b.lineWidth = 0.8;
    for (let i = 1; i < 18; i++) {
      b.beginPath(); b.moveTo(cvx, cvy + cvh * i / 18); b.lineTo(cvx + cvw, cvy + cvh * i / 18); b.stroke();
    }
    b.strokeStyle = 'rgba(120,104,80,0.07)';
    for (let i = 1; i < 12; i++) {
      b.beginPath(); b.moveTo(cvx + cvw * i / 12, cvy); b.lineTo(cvx + cvw * i / 12, cvy + cvh); b.stroke();
    }
    const cvVig = b.createRadialGradient(cvx + cvw * 0.45, cvy + cvh * 0.4, cvw * 0.1, cvx + cvw * 0.5, cvy + cvh * 0.5, cvw * 0.85);
    cvVig.addColorStop(0, 'rgba(255,246,224,0.06)');
    cvVig.addColorStop(1, 'rgba(58,46,32,0.30)');
    b.fillStyle = cvVig;
    b.fillRect(cvx, cvy, cvw, cvh);
    b.strokeStyle = 'rgba(90,76,56,0.5)';
    b.lineWidth = 1;
    b.strokeRect(cvx, cvy, cvw, cvh);
    // 画架上的冷光灯
    b.save();
    b.translate(ex + W * 0.058, H * 0.162);
    b.rotate(0.22);
    b.fillStyle = '#1e2126';
    b.fillRect(-W * 0.016, -H * 0.007, W * 0.032, H * 0.014);
    b.fillStyle = '#e8f1fb';
    b.fillRect(-W * 0.013, -H * 0.001, W * 0.026, H * 0.005);
    b.restore();
    b.strokeStyle = '#26292e';
    b.lineWidth = Math.max(2, W * 0.0026);
    b.beginPath(); b.moveTo(ex + W * 0.058, H * 0.168); b.lineTo(ex + W * 0.058, H * 0.235); b.stroke();
    b.save();
    b.globalCompositeOperation = 'lighter';
    const cold = b.createRadialGradient(cvx + cvw * 0.5, cvy + cvh * 0.5, 0, cvx + cvw * 0.5, cvy + cvh * 0.5, W * 0.20);
    cold.addColorStop(0, 'rgba(214,232,255,0.10)');
    cold.addColorStop(1, 'rgba(214,232,255,0)');
    b.fillStyle = cold;
    b.beginPath(); b.arc(cvx + cvw * 0.5, cvy + cvh * 0.5, W * 0.20, 0, 6.3); b.fill();
    b.restore();
    // 吊灯
    const lx = W * 0.53, ly = H * 0.155;
    b.strokeStyle = '#191612';
    b.lineWidth = 1.2;
    b.beginPath(); b.moveTo(lx, 0); b.lineTo(lx, ly); b.stroke();
    b.fillStyle = '#232019';
    b.beginPath();
    b.moveTo(lx - W * 0.020, ly);
    b.lineTo(lx + W * 0.020, ly);
    b.lineTo(lx + W * 0.012, ly + H * 0.018);
    b.lineTo(lx - W * 0.012, ly + H * 0.018);
    b.closePath(); b.fill();
    b.fillStyle = '#ffe8b8';
    b.beginPath(); b.arc(lx, ly + H * 0.020, Math.max(2, W * 0.004), 0, 6.3); b.fill();
    b.save();
    b.globalCompositeOperation = 'lighter';
    const glow2 = b.createRadialGradient(lx, ly + H * 0.02, 0, lx, ly + H * 0.02, W * 0.22);
    glow2.addColorStop(0, 'rgba(255,214,150,0.18)');
    glow2.addColorStop(1, 'rgba(255,206,132,0)');
    b.fillStyle = glow2;
    b.beginPath(); b.arc(lx, ly + H * 0.02, W * 0.22, 0, 6.3); b.fill();
    b.restore();
  }
  drawStudio.ground = function (b, p, horizon) {
    // 旧木地板
    const floor = b.createLinearGradient(0, horizon, 0, H);
    floor.addColorStop(0, '#4a3828');
    floor.addColorStop(1, '#241a12');
    b.fillStyle = floor;
    b.fillRect(0, horizon, W, H - horizon);
    // 长条木板：缝线向画面下方微微张开，板面有深浅差
    const vpx = W * 0.62;
    const seamX = (i, y) => {
      const t = (y - horizon) / (H - horizon);
      const xTop = vpx + (i - 6) * W * 0.085;
      return xTop + (xTop - vpx) * t * 0.55;
    };
    for (let i = 0; i <= 18; i++) {
      const x0 = seamX(i, horizon), x1 = seamX(i + 1, horizon);
      const x0b = seamX(i, H), x1b = seamX(i + 1, H);
      const tone = 0.03 + ((i * 5) % 3) * 0.022;
      b.fillStyle = `rgba(255,206,150,${tone})`;
      b.beginPath();
      b.moveTo(x0, horizon); b.lineTo(x1, horizon);
      b.lineTo(x1b, H); b.lineTo(x0b, H);
      b.closePath(); b.fill();
    }
    b.strokeStyle = 'rgba(14,9,6,0.42)';
    b.lineWidth = 1;
    for (let i = 0; i <= 18; i++) {
      b.beginPath();
      b.moveTo(seamX(i, horizon), horizon);
      b.lineTo(seamX(i, H), H);
      b.stroke();
    }
    // 错缝的板端接缝
    b.strokeStyle = 'rgba(18,12,7,0.35)';
    for (let i = 0; i < 14; i++) {
      const yy = horizon + (H - horizon) * (0.18 + ((i * 37) % 70) / 100);
      const sx2 = seamX((i * 3) % 17 + 1, yy), ex2 = seamX((i * 3) % 17 + 2, yy);
      b.beginPath(); b.moveTo(sx2, yy); b.lineTo(ex2, yy); b.stroke();
      b.strokeStyle = 'rgba(255,216,164,0.06)';
      b.beginPath(); b.moveTo(sx2, yy + 1); b.lineTo(ex2, yy + 1); b.stroke();
      b.strokeStyle = 'rgba(18,12,7,0.35)';
    }
    // 木纹：顺着板长方向
    for (let i = 0; i < 44; i++) {
      b.strokeStyle = `rgba(255,214,160,${rand(0.012, 0.030)})`;
      b.lineWidth = rand(0.6, 1.4);
      const sx3 = Math.random() * W;
      const sy3 = horizon + Math.random() * (H - horizon);
      const len3 = (H - horizon) * rand(0.10, 0.26);
      b.beginPath();
      b.moveTo(sx3, sy3);
      b.quadraticCurveTo(sx3 + rand(-4, 4), sy3 + len3 * 0.5, sx3 + rand(-7, 7), sy3 + len3);
      b.stroke();
    }
    // 前景工作台
    const tx = W * 0.235, tw = W * 0.47, tTop = H * 0.735;
    b.fillStyle = 'rgba(0,0,0,0.4)';
    b.beginPath(); b.ellipse(tx + tw / 2, H * 0.94, tw * 0.55, H * 0.02, 0, 0, 6.3); b.fill();
    b.fillStyle = '#1c1611';
    b.fillRect(tx + tw * 0.05, tTop + H * 0.03, W * 0.012, H * 0.19);
    b.fillRect(tx + tw * 0.92, tTop + H * 0.03, W * 0.012, H * 0.19);
    const tt = b.createLinearGradient(0, tTop - H * 0.012, 0, tTop + H * 0.035);
    tt.addColorStop(0, '#7a5a3c');
    tt.addColorStop(1, '#4a3322');
    b.fillStyle = tt;
    b.fillRect(tx, tTop, tw, H * 0.038);
    b.fillStyle = 'rgba(255,232,190,0.10)';
    b.fillRect(tx, tTop, tw, 2);
    // 台面上的画布、颜料管、松节油瓶、刮刀
    b.fillStyle = '#c4b898';
    b.save();
    b.translate(tx + tw * 0.26, tTop + H * 0.015);
    b.rotate(-0.04);
    b.fillRect(-tw * 0.10, -H * 0.012, tw * 0.20, H * 0.026);
    b.restore();
    b.strokeStyle = 'rgba(60,44,28,0.5)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(tx + tw * 0.16, tTop + H * 0.010);
    b.lineTo(tx + tw * 0.36, tTop + H * 0.008);
    b.stroke();
    // 颜料管
    for (let i = 0; i < 4; i++) {
      b.fillStyle = i % 2 ? '#b8b4aa' : '#8c887c';
      b.save();
      b.translate(tx + tw * (0.52 + i * 0.045), tTop + H * 0.014);
      b.rotate(0.4 + i * 0.1);
      b.fillRect(-W * 0.012, -W * 0.004, W * 0.024, W * 0.008);
      b.restore();
      b.fillStyle = ['#21408c', '#c8a02c', '#b8542c', '#3e6c4a'][i];
      b.beginPath();
      b.arc(tx + tw * (0.527 + i * 0.045), tTop + H * 0.020, W * 0.0025, 0, 6.3);
      b.fill();
    }
    // 松节油瓶
    b.fillStyle = 'rgba(180,196,204,0.35)';
    b.fillRect(tx + tw * 0.72, tTop - H * 0.035, W * 0.020, H * 0.040);
    b.fillStyle = '#8c7c5c';
    b.fillRect(tx + tw * 0.723, tTop - H * 0.045, W * 0.014, H * 0.012);
    b.fillStyle = 'rgba(255,255,255,0.25)';
    b.fillRect(tx + tw * 0.725, tTop - H * 0.032, W * 0.003, H * 0.034);
    // 调色刀与放大镜
    b.strokeStyle = '#a8a49a';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(tx + tw * 0.82, tTop + H * 0.030);
    b.lineTo(tx + tw * 0.88, tTop + H * 0.006);
    b.stroke();
    b.fillStyle = 'rgba(232,236,240,0.25)';
    b.beginPath();
    b.moveTo(tx + tw * 0.80, tTop + H * 0.031);
    b.lineTo(tx + tw * 0.84, tTop + H * 0.040);
    b.lineTo(tx + tw * 0.86, tTop + H * 0.034);
    b.closePath(); b.fill();
    // 恒温防潮箱（结局二的关键道具）
    const hx = W * 0.78, hw = W * 0.165, hTop2 = H * 0.755;
    b.fillStyle = '#22262b';
    b.fillRect(hx, hTop2, hw, H * 0.115);
    b.fillStyle = 'rgba(120,180,210,0.14)';
    b.fillRect(hx + W * 0.008, hTop2 + H * 0.010, hw - W * 0.016, H * 0.070);
    b.strokeStyle = 'rgba(160,196,220,0.30)';
    b.strokeRect(hx + W * 0.008, hTop2 + H * 0.010, hw - W * 0.016, H * 0.070);
    b.fillStyle = 'rgba(120,230,190,0.8)';
    b.fillRect(hx + hw - W * 0.018, hTop2 + H * 0.012, W * 0.005, H * 0.003);
    // 箱子里缩小的逆向星月夜
    paintStarry(b, hx + W * 0.018, hTop2 + H * 0.022, hw - W * 0.036, H * 0.046, true);
    // 防潮箱的玻璃反光
    b.fillStyle = 'rgba(220,240,255,0.06)';
    b.beginPath();
    b.moveTo(hx + W * 0.012, hTop2 + H * 0.080);
    b.lineTo(hx + W * 0.040, hTop2 + H * 0.010);
    b.lineTo(hx + W * 0.060, hTop2 + H * 0.010);
    b.lineTo(hx + W * 0.028, hTop2 + H * 0.080);
    b.closePath(); b.fill();
    // 烟灰缸与灰烬
    b.fillStyle = '#3c3a36';
    b.beginPath();
    b.ellipse(W * 0.11, tTop + H * 0.020, W * 0.025, H * 0.009, 0, 0, 6.3);
    b.fill();
    b.fillStyle = 'rgba(160,150,138,0.65)';
    b.beginPath();
    b.ellipse(W * 0.108, tTop + H * 0.019, W * 0.013, H * 0.004, 0, 0, 6.3);
    b.fill();
    // 圆凳
    b.fillStyle = '#2e2319';
    b.beginPath();
    b.ellipse(W * 0.60, H * 0.90, W * 0.062, H * 0.016, 0, 0, 6.3);
    b.fill();
    b.fillRect(W * 0.585, H * 0.905, W * 0.008, H * 0.075);
    b.fillRect(W * 0.622, H * 0.905, W * 0.008, H * 0.075);
    // 冷光落在桌面
    b.save();
    b.globalCompositeOperation = 'lighter';
    const deskPool = b.createRadialGradient(W * 0.47, H * 0.80, 0, W * 0.47, H * 0.80, W * 0.30);
    deskPool.addColorStop(0, 'rgba(198,222,255,0.09)');
    deskPool.addColorStop(1, 'rgba(198,222,255,0)');
    b.fillStyle = deskPool;
    b.beginPath(); b.arc(W * 0.47, H * 0.80, W * 0.30, 0, 6.3); b.fill();
    b.restore();
    // 下缘压暗
    const bottom = b.createLinearGradient(0, H * 0.85, 0, H);
    bottom.addColorStop(0, 'rgba(6,4,3,0)');
    bottom.addColorStop(1, 'rgba(6,4,3,0.5)');
    b.fillStyle = bottom;
    b.fillRect(0, H * 0.85, W, H * 0.15);
  };

  /* ---------- 场景：庄园石砌露台（黄昏） ---------- */
  function drawTerrace(b, p, horizon) {
    const dusk = state.time === 'dusk';
    const day = state.time === 'day';
    // 远处的葡萄园与阿尔皮耶山
    b.fillStyle = dusk ? 'rgba(96,74,86,0.6)' : 'rgba(142,152,140,0.55)';
    b.beginPath();
    b.moveTo(0, horizon - H * 0.12);
    b.lineTo(W * 0.12, horizon - H * 0.185);
    b.lineTo(W * 0.26, horizon - H * 0.13);
    b.lineTo(W * 0.40, horizon - H * 0.20);
    b.lineTo(W * 0.55, horizon - H * 0.14);
    b.lineTo(W * 0.70, horizon - H * 0.19);
    b.lineTo(W * 0.86, horizon - H * 0.125);
    b.lineTo(W, horizon - H * 0.17);
    b.lineTo(W, horizon - H * 0.02);
    b.lineTo(0, horizon - H * 0.02);
    b.closePath(); b.fill();
    b.fillStyle = dusk ? 'rgba(78,64,70,0.55)' : 'rgba(120,132,116,0.5)';
    b.beginPath();
    b.moveTo(0, horizon - H * 0.06);
    b.lineTo(W * 0.20, horizon - H * 0.105);
    b.lineTo(W * 0.36, horizon - H * 0.065);
    b.lineTo(W * 0.55, horizon - H * 0.11);
    b.lineTo(W * 0.74, horizon - H * 0.06);
    b.lineTo(W, horizon - H * 0.10);
    b.lineTo(W, horizon - H * 0.01);
    b.lineTo(0, horizon - H * 0.01);
    b.closePath(); b.fill();
    // 葡萄园行
    b.strokeStyle = dusk ? 'rgba(64,58,44,0.50)' : 'rgba(96,104,72,0.45)';
    b.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const yy = horizon - H * 0.055 + i * H * 0.0045;
      b.beginPath();
      b.moveTo(0, yy);
      b.quadraticCurveTo(W * 0.5, yy - H * 0.014, W, yy + H * 0.002);
      b.stroke();
    }
    // 庄园墙上的灯与暖窗（左侧）
    const mw = W * 0.30;
    b.fillStyle = dusk ? '#5c4f40' : '#a29378';
    b.fillRect(0, H * 0.20, mw, horizon - H * 0.20);
    b.fillStyle = 'rgba(28,20,16,0.24)';
    b.fillRect(mw - W * 0.014, H * 0.20, W * 0.014, horizon - H * 0.20);
    b.fillStyle = 'rgba(20,14,10,0.35)';
    b.fillRect(mw - W * 0.004, H * 0.20, W * 0.004, horizon - H * 0.20);
    // 墙脚线脚
    b.fillStyle = dusk ? '#4c4133' : '#8a7a62';
    b.fillRect(0, horizon - H * 0.022, mw, H * 0.022);
    b.fillStyle = 'rgba(255,230,190,0.10)';
    b.fillRect(0, horizon - H * 0.022, mw, 1.4);
    b.fillStyle = 'rgba(16,12,8,0.35)';
    b.fillRect(0, horizon - H * 0.004, mw, H * 0.004);
    // 石墙砌缝
    b.strokeStyle = 'rgba(30,22,16,0.20)';
    b.lineWidth = 1;
    for (let r = 0; r < 8; r++) {
      const yy = H * 0.22 + r * (horizon - H * 0.24) / 8;
      b.beginPath(); b.moveTo(0, yy); b.lineTo(mw, yy); b.stroke();
    }
    // 两扇落地门，透出室内的暖光
    for (let i = 0; i < 2; i++) {
      const dx0 = W * (0.050 + i * 0.115), dw0 = W * 0.092;
      const dTop = H * 0.295, dBot = horizon - H * 0.006;
      // 门框
      b.fillStyle = '#3a2f22';
      b.fillRect(dx0 - W * 0.004, dTop - H * 0.006, dw0 + W * 0.008, dBot - dTop + H * 0.008);
      b.fillStyle = '#171009';
      b.fillRect(dx0, dTop, dw0, dBot - dTop);
      // 玻璃门格
      const panes = 4;
      for (let r = 0; r < panes; r++) {
        const py0 = dTop + (dBot - dTop) * (0.03 + r * 0.24);
        const ph0 = (dBot - dTop) * 0.205;
        const doorGlow = b.createLinearGradient(0, py0, 0, py0 + ph0);
        doorGlow.addColorStop(0, `rgba(246,196,124,${0.55 - r * 0.05})`);
        doorGlow.addColorStop(0.5, `rgba(196,132,72,${0.42 - r * 0.05})`);
        doorGlow.addColorStop(1, `rgba(120,72,40,${0.34 - r * 0.04})`);
        b.fillStyle = doorGlow;
        b.fillRect(dx0 + W * 0.005, py0, dw0 * 0.46, ph0);
        b.fillRect(dx0 + dw0 * 0.51, py0, dw0 * 0.46, ph0);
      }
      // 窗棂
      b.strokeStyle = 'rgba(26,18,10,0.9)';
      b.lineWidth = Math.max(2, W * 0.0022);
      b.beginPath();
      b.moveTo(dx0 + dw0 * 0.5, dTop + H * 0.006); b.lineTo(dx0 + dw0 * 0.5, dBot - H * 0.004);
      b.moveTo(dx0 + W * 0.005, dTop + (dBot - dTop) * 0.27); b.lineTo(dx0 + dw0 - W * 0.005, dTop + (dBot - dTop) * 0.27);
      b.moveTo(dx0 + W * 0.005, dTop + (dBot - dTop) * 0.51); b.lineTo(dx0 + dw0 - W * 0.005, dTop + (dBot - dTop) * 0.51);
      b.moveTo(dx0 + W * 0.005, dTop + (dBot - dTop) * 0.75); b.lineTo(dx0 + dw0 - W * 0.005, dTop + (dBot - dTop) * 0.75);
      b.stroke();
      // 室内暖帘与灯影
      b.fillStyle = 'rgba(96,52,24,0.30)';
      b.beginPath();
      b.moveTo(dx0 + dw0 * 0.06, dTop + (dBot - dTop) * 0.03);
      b.lineTo(dx0 + dw0 * 0.22, dTop + (dBot - dTop) * 0.03);
      b.quadraticCurveTo(dx0 + dw0 * 0.20, dTop + (dBot - dTop) * 0.38, dx0 + dw0 * 0.24, dBot - H * 0.006);
      b.lineTo(dx0 + dw0 * 0.06, dBot - H * 0.006);
      b.closePath(); b.fill();
      // 铜把手
      b.fillStyle = '#a88442';
      b.fillRect(dx0 + dw0 * 0.475, dTop + (dBot - dTop) * 0.46, W * 0.0045, H * 0.020);
      b.fillStyle = 'rgba(255,226,160,0.55)';
      b.fillRect(dx0 + dw0 * 0.475, dTop + (dBot - dTop) * 0.46, W * 0.0018, H * 0.020);
    }
    // 墙上的壁灯
    b.fillStyle = '#2a2016';
    b.fillRect(W * 0.27, H * 0.36, W * 0.006, H * 0.018);
    b.fillStyle = '#ffdfa4';
    b.beginPath(); b.arc(W * 0.273, H * 0.384, Math.max(2, W * 0.004), 0, 6.3); b.fill();
    b.save();
    b.globalCompositeOperation = 'lighter';
    const wallGlow = b.createRadialGradient(W * 0.273, H * 0.384, 0, W * 0.273, H * 0.384, W * 0.10);
    wallGlow.addColorStop(0, 'rgba(255,214,150,0.22)');
    wallGlow.addColorStop(1, 'rgba(255,206,132,0)');
    b.fillStyle = wallGlow;
    b.beginPath(); b.arc(W * 0.273, H * 0.384, W * 0.10, 0, 6.3); b.fill();
    b.restore();
    // 柏树
    const cyp = (cx, cy, ch, cw2) => {
      b.fillStyle = dusk ? '#232a20' : '#2c3a28';
      for (let i = 0; i < 26; i++) {
        const t = i / 25;
        const yy = cy - ch * (0.02 + t * 0.94);
        const ww2 = cw2 * (1 - t * 0.9) * (0.9 + 0.15 * Math.sin(i * 2.1));
        b.beginPath();
        b.ellipse(cx + Math.sin(i * 1.4) * cw2 * 0.05, yy, ww2, Math.max(2, ch * 0.035), 0, 0, 6.3);
        b.fill();
      }
    };
    cyp(W * 0.40, horizon, H * 0.30, W * 0.030);
    cyp(W * 0.47, horizon + H * 0.012, H * 0.26, W * 0.026);
    cyp(W * 0.88, horizon, H * 0.32, W * 0.032);
    // 石砌栏杆（逆光下压暗，只留顶部一线暖光）
    const balTop = horizon - H * 0.100;
    const railG = b.createLinearGradient(0, balTop, 0, balTop + H * 0.014);
    railG.addColorStop(0, dusk ? '#6b5d49' : '#bcae94');
    railG.addColorStop(1, dusk ? '#3e352a' : '#8e7f68');
    b.fillStyle = railG;
    b.fillRect(0, balTop, W, H * 0.014);
    b.fillStyle = dusk ? 'rgba(255,224,176,0.12)' : 'rgba(255,238,206,0.24)';
    b.fillRect(0, balTop, W, 1.2);
    b.fillStyle = dusk ? '#332c22' : '#6e614e';
    b.fillRect(0, balTop + H * 0.014, W, H * 0.006);
    // 瓶形栏杆
    for (let i = 0; i < 26; i++) {
      const bx = W * (0.018 + i * 0.039);
      const bt = balTop + H * 0.020, bb = horizon - H * 0.004;
      const bh = bb - bt;
      const bal = b.createLinearGradient(bx - W * 0.010, 0, bx + W * 0.010, 0);
      bal.addColorStop(0, dusk ? '#62543f' : '#a1917a');
      bal.addColorStop(0.5, dusk ? '#40372a' : '#7b6c58');
      bal.addColorStop(1, dusk ? '#2e271e' : '#5e5342');
      b.fillStyle = bal;
      b.beginPath();
      b.moveTo(bx - W * 0.0055, bt);
      b.lineTo(bx + W * 0.0055, bt);
      b.quadraticCurveTo(bx + W * 0.0045, bt + bh * 0.30, bx + W * 0.0105, bt + bh * 0.56);
      b.quadraticCurveTo(bx + W * 0.0110, bt + bh * 0.80, bx + W * 0.0075, bb);
      b.lineTo(bx - W * 0.0075, bb);
      b.quadraticCurveTo(bx - W * 0.0110, bt + bh * 0.80, bx - W * 0.0105, bt + bh * 0.56);
      b.quadraticCurveTo(bx - W * 0.0045, bt + bh * 0.30, bx - W * 0.0055, bt);
      b.closePath(); b.fill();
      b.strokeStyle = 'rgba(255,220,170,0.10)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(bx - W * 0.0035, bt + bh * 0.10);
      b.quadraticCurveTo(bx - W * 0.0085, bt + bh * 0.55, bx - W * 0.0055, bb - bh * 0.08);
      b.stroke();
    }
    // 底栏
    b.fillStyle = dusk ? '#4a3e30' : '#7b6c58';
    b.fillRect(0, horizon - H * 0.008, W, H * 0.010);
    b.fillStyle = 'rgba(255,224,176,0.10)';
    b.fillRect(0, horizon - H * 0.008, W, 1.2);
    // 栏杆上的石花盆与薰衣草
    for (const px of [W * 0.20, W * 0.62, W * 0.86]) {
      b.fillStyle = dusk ? '#8a7a62' : '#b0a086';
      b.beginPath();
      b.moveTo(px - W * 0.030, balTop - H * 0.012);
      b.lineTo(px + W * 0.030, balTop - H * 0.012);
      b.lineTo(px + W * 0.022, balTop + H * 0.002);
      b.lineTo(px - W * 0.022, balTop + H * 0.002);
      b.closePath(); b.fill();
      b.fillStyle = 'rgba(94,84,120,0.8)';
      for (let i = 0; i < 12; i++) {
        b.beginPath();
        b.ellipse(px + rand(-0.03, 0.03) * W, balTop - H * rand(0.018, 0.048), W * 0.004, H * 0.006, rand(-0.4, 0.4), 0, 6.3);
        b.fill();
      }
      b.strokeStyle = 'rgba(84,96,70,0.85)';
      b.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        b.beginPath();
        b.moveTo(px + rand(-0.025, 0.025) * W, balTop - H * 0.010);
        b.lineTo(px + rand(-0.03, 0.03) * W, balTop - H * rand(0.02, 0.05));
        b.stroke();
      }
    }
    // 庄园外的警车顶灯（远处石子路上）
    b.fillStyle = '#0b0e15';
    b.beginPath();
    b.moveTo(W * 0.315, horizon - H * 0.012);
    b.lineTo(W * 0.318, horizon - H * 0.030);
    b.lineTo(W * 0.335, horizon - H * 0.034);
    b.lineTo(W * 0.342, horizon - H * 0.050);
    b.lineTo(W * 0.372, horizon - H * 0.052);
    b.lineTo(W * 0.384, horizon - H * 0.032);
    b.lineTo(W * 0.402, horizon - H * 0.028);
    b.lineTo(W * 0.404, horizon - H * 0.012);
    b.closePath(); b.fill();
    b.fillStyle = '#05070c';
    b.beginPath(); b.arc(W * 0.334, horizon - H * 0.010, W * 0.0062, 0, 6.3); b.fill();
    b.beginPath(); b.arc(W * 0.390, horizon - H * 0.010, W * 0.0062, 0, 6.3); b.fill();
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (const [lx3, col] of [[W * 0.347, '96,140,255'], [W * 0.362, '255,90,90']]) {
      const lg = b.createRadialGradient(lx3, horizon - H * 0.056, 0, lx3, horizon - H * 0.056, W * 0.055);
      lg.addColorStop(0, `rgba(${col},0.50)`);
      lg.addColorStop(0.4, `rgba(${col},0.14)`);
      lg.addColorStop(1, `rgba(${col},0)`);
      b.fillStyle = lg;
      b.beginPath(); b.arc(lx3, horizon - H * 0.056, W * 0.055, 0, 6.3); b.fill();
    }
    b.restore();
    // 暮色里的最后一束光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const last = b.createRadialGradient(W * 0.80, horizon - H * 0.06, 0, W * 0.80, horizon - H * 0.06, W * 0.45);
    last.addColorStop(0, 'rgba(255,178,110,0.18)');
    last.addColorStop(1, 'rgba(255,150,80,0)');
    b.fillStyle = last;
    b.beginPath(); b.arc(W * 0.80, horizon - H * 0.06, W * 0.45, 0, 6.3); b.fill();
    b.restore();
    void day;
  }
  drawTerrace.ground = function (b, p, horizon) {
    const dusk = state.time === 'dusk';
    // 石板露台
    const floor = b.createLinearGradient(0, horizon, 0, H);
    floor.addColorStop(0, dusk ? '#7a6a58' : '#a08f74');
    floor.addColorStop(0.5, dusk ? '#5e5042' : '#8a7a62');
    floor.addColorStop(1, dusk ? '#3a3028' : '#5c4f40');
    b.fillStyle = floor;
    b.fillRect(0, horizon, W, H - horizon);
    // 墙脚的接地暗影
    const wallShadow = b.createLinearGradient(0, horizon, 0, horizon + H * 0.035);
    wallShadow.addColorStop(0, 'rgba(12,8,6,0.35)');
    wallShadow.addColorStop(1, 'rgba(12,8,6,0)');
    b.fillStyle = wallShadow;
    b.fillRect(0, horizon, W * 0.30, H * 0.035);
    // 大块石板缝（向地平线消失点收拢，形成地面透视）
    const vpx = W * 0.56;
    b.strokeStyle = 'rgba(24,18,12,0.26)';
    b.lineWidth = 1.2;
    for (let r = 0; r < 8; r++) {
      const t = (r + 1) / 8;
      const yy = horizon + (H - horizon) * Math.pow(t, 1.55);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    for (let i = -7; i <= 7; i++) {
      const bx0 = vpx + i * W * 0.075;
      const bx1 = vpx + i * W * 0.20;
      b.beginPath(); b.moveTo(bx0, horizon); b.lineTo(bx1, H); b.stroke();
    }
    // 逐行明暗，强化纵深
    b.fillStyle = 'rgba(255,236,206,0.03)';
    b.fillRect(0, horizon, W, (H - horizon) * 0.16);
    b.fillStyle = 'rgba(10,8,6,0.05)';
    b.fillRect(0, horizon + (H - horizon) * 0.30, W, (H - horizon) * 0.18);
    // 石面细斑与风化
    for (let i = 0; i < 90; i++) {
      b.fillStyle = Math.random() < 0.5
        ? 'rgba(255,240,212,0.03)'
        : 'rgba(20,14,10,0.04)';
      b.beginPath();
      b.ellipse(Math.random() * W, horizon + Math.random() * (H - horizon), rand(3, 18), rand(1, 5), rand(-0.4, 0.4), 0, 6.3);
      b.fill();
    }
    // 栏杆的长影
    b.fillStyle = 'rgba(20,14,12,0.20)';
    b.beginPath();
    b.moveTo(0, horizon + H * 0.002);
    b.lineTo(W, horizon + H * 0.002);
    b.lineTo(W, horizon + H * 0.055);
    b.lineTo(0, horizon + H * 0.075);
    b.closePath(); b.fill();
    // 门内暖光落在石板上
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (const px of [W * 0.096, W * 0.211]) {
      const poolD = b.createRadialGradient(px, horizon + H * 0.012, 0, px, horizon + H * 0.012, W * 0.13);
      poolD.addColorStop(0, dusk ? 'rgba(255,196,124,0.16)' : 'rgba(255,214,150,0.10)');
      poolD.addColorStop(1, 'rgba(255,180,110,0)');
      b.fillStyle = poolD;
      b.beginPath();
      b.ellipse(px, horizon + H * 0.03, W * 0.13, H * 0.075, 0, 0, 6.3);
      b.fill();
    }
    b.restore();
    // 右侧的小圆桌与两杯咖啡
    const tx = W * 0.66, tw = W * 0.22, tTop = H * 0.752;
    const tcx = tx + tw / 2;
    b.fillStyle = 'rgba(0,0,0,0.32)';
    b.beginPath(); b.ellipse(tcx, H * 0.892, tw * 0.46, H * 0.015, 0, 0, 6.3); b.fill();
    // 桌腿与底盘
    b.fillStyle = '#332619';
    b.fillRect(tcx - W * 0.0055, tTop + H * 0.012, W * 0.011, H * 0.132);
    b.fillStyle = '#241a11';
    b.beginPath(); b.ellipse(tcx, H * 0.884, W * 0.030, H * 0.008, 0, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(255,226,180,0.08)';
    b.beginPath(); b.ellipse(tcx, H * 0.881, W * 0.020, H * 0.005, 0, 0, 6.3); b.fill();
    // 桌面（带厚度的圆桌板）
    const side = b.createLinearGradient(0, tTop + H * 0.010, 0, tTop + H * 0.024);
    side.addColorStop(0, '#4a3a28');
    side.addColorStop(1, '#2e2318');
    b.fillStyle = side;
    b.beginPath();
    b.ellipse(tcx, tTop + H * 0.016, tw * 0.5, H * 0.020, 0, 0, Math.PI);
    b.lineTo(tcx - tw * 0.5, tTop + H * 0.010);
    b.ellipse(tcx, tTop + H * 0.010, tw * 0.5, H * 0.020, 0, Math.PI, 0, true);
    b.closePath(); b.fill();
    const topG = b.createLinearGradient(0, tTop - H * 0.014, 0, tTop + H * 0.020);
    topG.addColorStop(0, '#7d674a');
    topG.addColorStop(1, '#544230');
    b.fillStyle = topG;
    b.beginPath(); b.ellipse(tcx, tTop + H * 0.010, tw * 0.50, H * 0.021, 0, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(255,232,190,0.16)';
    b.lineWidth = 1.4;
    b.beginPath(); b.ellipse(tcx, tTop + H * 0.004, tw * 0.47, H * 0.017, 0, Math.PI * 1.02, Math.PI * 1.86); b.stroke();
    // 两只白瓷咖啡杯
    for (const cxr of [0.34, 0.64]) {
      const cxx = tx + tw * cxr;
      const cupTop = tTop - H * 0.004, cupBot = tTop + H * 0.013;
      // 碟
      b.fillStyle = '#cfc9ba';
      b.beginPath(); b.ellipse(cxx, cupBot + H * 0.004, W * 0.021, H * 0.007, 0, 0, 6.3); b.fill();
      b.fillStyle = 'rgba(255,250,238,0.20)';
      b.beginPath(); b.ellipse(cxx, cupBot + H * 0.002, W * 0.016, H * 0.0045, 0, 0, 6.3); b.fill();
      // 杯身
      const cupG = b.createLinearGradient(cxx - W * 0.014, 0, cxx + W * 0.014, 0);
      cupG.addColorStop(0, '#f0ecdf');
      cupG.addColorStop(0.45, '#d9d3c2');
      cupG.addColorStop(1, '#a8a090');
      b.fillStyle = cupG;
      b.beginPath();
      b.moveTo(cxx - W * 0.011, cupTop);
      b.quadraticCurveTo(cxx - W * 0.013, cupBot - H * 0.002, cxx - W * 0.008, cupBot + H * 0.004);
      b.lineTo(cxx + W * 0.008, cupBot + H * 0.004);
      b.quadraticCurveTo(cxx + W * 0.013, cupBot - H * 0.002, cxx + W * 0.011, cupTop);
      b.closePath(); b.fill();
      // 杯口与咖啡
      b.fillStyle = '#efe9da';
      b.beginPath(); b.ellipse(cxx, cupTop, W * 0.0115, H * 0.0045, 0, 0, 6.3); b.fill();
      b.fillStyle = '#3a2414';
      b.beginPath(); b.ellipse(cxx, cupTop + H * 0.0005, W * 0.0088, H * 0.0034, 0, 0, 6.3); b.fill();
      b.fillStyle = 'rgba(190,140,90,0.35)';
      b.beginPath(); b.ellipse(cxx - W * 0.002, cupTop, W * 0.003, H * 0.0012, -0.3, 0, 6.3); b.fill();
      // 杯把
      b.strokeStyle = '#d5cfc0';
      b.lineWidth = Math.max(1.5, W * 0.002);
      b.beginPath();
      b.arc(cxx + W * 0.0125, cupTop + H * 0.003, W * 0.0062, -1.35, 1.15);
      b.stroke();
      // 热气
      b.strokeStyle = 'rgba(255,244,224,0.16)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(cxx, cupTop - H * 0.006);
      b.bezierCurveTo(cxx + W * 0.010, cupTop - H * 0.024, cxx - W * 0.008, cupTop - H * 0.038, cxx + W * 0.003, cupTop - H * 0.056);
      b.stroke();
    }
    // 露台上的长椅与陶盆
    b.fillStyle = 'rgba(0,0,0,0.28)';
    b.beginPath(); b.ellipse(W * 0.12, H * 0.888, W * 0.075, H * 0.012, 0, 0, 6.3); b.fill();
    b.fillStyle = '#33261a';
    b.fillRect(W * 0.055, H * 0.792, W * 0.135, H * 0.013);
    b.fillStyle = '#241a12';
    b.fillRect(W * 0.062, H * 0.805, W * 0.0095, H * 0.080);
    b.fillRect(W * 0.174, H * 0.805, W * 0.0095, H * 0.080);
    b.fillStyle = '#2d2116';
    b.fillRect(W * 0.058, H * 0.762, W * 0.128, H * 0.010);
    for (let i = 0; i < 6; i++) {
      b.fillStyle = '#2a1f15';
      b.fillRect(W * (0.066 + i * 0.021), H * 0.772, W * 0.008, H * 0.021);
    }
    b.strokeStyle = 'rgba(255,226,180,0.10)';
    b.lineWidth = 1;
    b.beginPath(); b.moveTo(W * 0.056, H * 0.792); b.lineTo(W * 0.19, H * 0.792); b.stroke();
    // 地上的落叶
    for (let i = 0; i < 20; i++) {
      b.fillStyle = `rgba(${140 + (i % 4) * 14},${92 + (i % 3) * 12},${48 + (i % 2) * 10},0.5)`;
      b.beginPath();
      b.ellipse(rand(0, W), horizon + rand(0.02, 0.36) * (H - horizon), rand(2, 5), rand(1, 2.4), rand(0, 6.3), 0, 6.3);
      b.fill();
    }
    // 门内暖光落在石板上
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (const dxr of [0.055, 0.17]) {
      const pool = b.createLinearGradient(0, horizon, 0, H * 0.94);
      pool.addColorStop(0, 'rgba(255,196,124,0.12)');
      pool.addColorStop(1, 'rgba(255,190,110,0)');
      b.fillStyle = pool;
      b.beginPath();
      b.moveTo(W * dxr, horizon);
      b.lineTo(W * (dxr + 0.085), horizon);
      b.lineTo(W * (dxr + 0.13), H * 0.94);
      b.lineTo(W * (dxr - 0.04), H * 0.94);
      b.closePath(); b.fill();
    }
    b.restore();
    // 下缘压暗
    const bottom = b.createLinearGradient(0, H * 0.85, 0, H);
    bottom.addColorStop(0, 'rgba(16,8,6,0)');
    bottom.addColorStop(1, 'rgba(16,8,6,0.48)');
    b.fillStyle = bottom;
    b.fillRect(0, H * 0.85, W, H * 0.15);
  };

  /* ============================================================
     《月光下的未完奏鸣》场景
     校园 / 旧琴房 / 音乐社 / 钟楼 / 老剧院 / 写字楼 / 清吧 /
     陆家嘴 / 草坪音乐会 / 大学操场
     ============================================================ */

  /* ---------- 场景：校园（老文科楼与梧桐道） ---------- */
  function drawCampus(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const night = state.time === 'night';
    const day = state.time === 'day';
    const warm = p2.warm;
    // 远处树线：层层压暗，给红砖楼一个可以后退的空气
    b.fillStyle = night ? 'rgba(13,12,30,0.85)' : day ? 'rgba(80,104,72,0.55)' : 'rgba(40,28,46,0.7)';
    b.beginPath();
    b.moveTo(0, horizon);
    for (let i = 0; i <= 12; i++) {
      const xx = (i / 12) * W;
      b.lineTo(xx, horizon - H * (0.03 + Math.abs(Math.sin(i * 1.7 + 0.6)) * 0.055));
    }
    b.lineTo(W, horizon); b.closePath(); b.fill();

    /* 老文科楼：四层红砖，藤蔓爬满左半面墙 */
    const bx = W * 0.055, bw = W * 0.70, bh = H * 0.40;
    const by = horizon - bh + H * 0.012;
    const brick = night ? '#2a1b28' : day ? '#9a5a48' : '#6d3a38';
    const brickDark = night ? '#1d1320' : day ? '#824a3c' : '#572c30';
    const brickLight = night ? '#3a2533' : day ? '#b06c54' : '#82463f';
    // 主体
    const wallG = b.createLinearGradient(0, by, 0, by + bh);
    wallG.addColorStop(0, brickLight);
    wallG.addColorStop(0.45, brick);
    wallG.addColorStop(1, brickDark);
    b.fillStyle = wallG;
    b.fillRect(bx, by, bw, bh);
    // 砖缝：细密横缝与错落竖缝，只在受光面
    b.save();
    b.beginPath(); b.rect(bx, by, bw, bh); b.clip();
    b.strokeStyle = night ? 'rgba(120,86,108,0.10)' : 'rgba(48,22,20,0.16)';
    b.lineWidth = 0.8;
    for (let row = 0; row < 34; row++) {
      const yy = by + (row / 34) * bh;
      b.beginPath(); b.moveTo(bx, yy); b.lineTo(bx + bw, yy); b.stroke();
      const off = (row % 2) * W * 0.011;
      for (let col = 0; col < 30; col++) {
        const xx = bx + off + col * W * 0.022;
        if (xx > bx + bw) break;
        b.beginPath(); b.moveTo(xx, yy); b.lineTo(xx, yy + bh / 34); b.stroke();
      }
    }
    // 雨痕与水渍
    for (let i = 0; i < 26; i++) {
      const xx = bx + rand(0.03, 0.97) * bw;
      b.fillStyle = `rgba(12,8,16,${rand(0.025, 0.08)})`;
      b.fillRect(xx, by + rand(0, 0.35) * bh, rand(1, 4), rand(0.08, 0.4) * bh);
    }
    b.restore();

    // 腰线与檐口：三道浅色石线，压住红砖的散
    const stone = night ? '#3a3446' : day ? '#d8cbb2' : '#a08272';
    for (const t of [0.18, 0.46, 0.74]) {
      const ly = by + bh * t;
      b.fillStyle = stone;
      b.fillRect(bx - W * 0.006, ly, bw + W * 0.012, H * 0.009);
      b.fillStyle = 'rgba(255,246,226,0.16)';
      b.fillRect(bx - W * 0.006, ly, bw + W * 0.012, 2);
    }
    // 檐口与女儿墙
    b.fillStyle = night ? '#241c2e' : day ? '#8a5244' : '#5a3034';
    b.fillRect(bx - W * 0.012, by - H * 0.016, bw + W * 0.024, H * 0.018);
    b.fillStyle = stone;
    b.fillRect(bx - W * 0.012, by - H * 0.020, bw + W * 0.024, H * 0.006);
    // 齿饰
    for (let i = 0; i < 44; i++) {
      b.fillStyle = night ? 'rgba(80,70,92,0.5)' : 'rgba(214,196,166,0.5)';
      b.fillRect(bx + i * (bw / 44), by - H * 0.012, bw / 88, H * 0.006);
    }
    // 屋顶水箱与天线
    b.fillStyle = night ? '#191426' : day ? '#6e6a60' : '#3a2a34';
    b.fillRect(bx + bw * 0.66, by - H * 0.055, bw * 0.10, H * 0.040);
    b.fillStyle = 'rgba(255,246,226,0.10)';
    b.fillRect(bx + bw * 0.66, by - H * 0.055, bw * 0.10, 2);
    b.strokeStyle = night ? 'rgba(110,116,150,0.45)' : 'rgba(50,40,44,0.55)';
    b.lineWidth = 1.2;
    b.beginPath();
    b.moveTo(bx + bw * 0.88, by - H * 0.018);
    b.lineTo(bx + bw * 0.88, by - H * 0.085);
    b.moveTo(bx + bw * 0.855, by - H * 0.064);
    b.lineTo(bx + bw * 0.905, by - H * 0.064);
    b.stroke();

    /* 窗：三层，拱顶石楣、白框、十字梃 */
    const floors = [0.235, 0.505, 0.775];
    for (let f = 0; f < floors.length; f++) {
      const wy = by + bh * floors[f];
      const wh = bh * 0.135;
      for (let i = 0; i < 6; i++) {
        const wx = bx + bw * (0.075 + i * 0.152);
        const ww = bw * 0.085;
        const lit = night ? (i + f) % 3 !== 1 : day ? false : ((i * 7 + f * 13) % 11) < 3;
        // 石窗套
        b.fillStyle = stone;
        b.fillRect(wx - W * 0.007, wy - H * 0.010, ww + W * 0.014, wh + H * 0.018);
        // 窗洞
        b.fillStyle = night ? 'rgba(8,8,18,0.9)' : day ? 'rgba(54,62,64,0.5)' : 'rgba(30,24,40,0.62)';
        b.fillRect(wx, wy, ww, wh);
        if (lit) {
          const lg = b.createLinearGradient(0, wy, 0, wy + wh);
          lg.addColorStop(0, hexA(p2.glow, 0.62));
          lg.addColorStop(1, hexA(p2.glow, 0.30));
          b.fillStyle = lg;
          b.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
          // 窗帘剪影
          b.fillStyle = 'rgba(64,36,30,0.35)';
          b.fillRect(wx + ww * (i % 2 ? 0.04 : 0.70), wy + 1, ww * 0.26, wh - 2);
        }
        // 玻璃反光
        b.save();
        b.globalAlpha = lit ? 0.14 : 0.10;
        b.fillStyle = warm ? '#ffe9c8' : '#cfe0ff';
        b.beginPath();
        b.moveTo(wx + ww * 0.10, wy + wh);
        b.lineTo(wx + ww * 0.52, wy);
        b.lineTo(wx + ww * 0.74, wy);
        b.lineTo(wx + ww * 0.32, wy + wh);
        b.closePath(); b.fill();
        b.restore();
        // 窗框
        b.strokeStyle = night ? 'rgba(196,196,214,0.34)' : 'rgba(236,230,214,0.72)';
        b.lineWidth = Math.max(1, W * 0.0012);
        b.strokeRect(wx, wy, ww, wh);
        b.beginPath();
        b.moveTo(wx + ww / 2, wy); b.lineTo(wx + ww / 2, wy + wh);
        b.moveTo(wx, wy + wh * 0.45); b.lineTo(wx + ww, wy + wh * 0.45);
        b.stroke();
        // 石窗台
        b.fillStyle = stone;
        b.fillRect(wx - W * 0.006, wy + wh + H * 0.002, ww + W * 0.012, H * 0.007);
        b.fillStyle = 'rgba(0,0,0,0.18)';
        b.fillRect(wx - W * 0.006, wy + wh + H * 0.009, ww + W * 0.012, 2);
        // 空调外机：零星两台
        if ((i + f) % 5 === 2) {
          b.fillStyle = night ? 'rgba(54,58,78,0.85)' : 'rgba(186,180,166,0.9)';
          b.fillRect(wx + ww * 0.15, wy + wh + H * 0.014, ww * 0.7, H * 0.020);
          b.strokeStyle = 'rgba(20,16,24,0.3)';
          b.lineWidth = 1;
          b.strokeRect(wx + ww * 0.15, wy + wh + H * 0.014, ww * 0.7, H * 0.020);
          b.beginPath();
          b.arc(wx + ww * 0.5, wy + wh + H * 0.024, H * 0.007, 0, 6.3);
          b.stroke();
        }
      }
    }

    // 三层走廊尽头的木门：半掩着，透出一点室内暗金
    const dx = bx + bw * 0.885, dy = by + bh * 0.505 + bh * 0.135 - H * 0.115;
    b.fillStyle = night ? '#120e1c' : '#2a1a18';
    b.fillRect(dx, dy, W * 0.052, H * 0.115);
    b.fillStyle = night ? 'rgba(255,214,150,0.16)' : 'rgba(255,206,140,0.26)';
    b.fillRect(dx + W * 0.008, dy + H * 0.006, W * 0.036, H * 0.105);
    b.strokeStyle = night ? '#4a3c42' : '#6a4634';
    b.lineWidth = 2;
    b.strokeRect(dx, dy, W * 0.052, H * 0.115);
    b.beginPath(); b.moveTo(dx + W * 0.026, dy); b.lineTo(dx + W * 0.026, dy + H * 0.115); b.stroke();

    // 爬山虎：从左侧墙根与窗台攀上去
    drawIvy(b, bx + bw * 0.01, by + bh * 0.62, bw * 0.30, bh * 0.44, night ? '#132016' : day ? '#3e6a3c' : '#243428', warm ? 'rgba(255,206,140,0.20)' : 'rgba(180,200,240,0.14)', 2.2);
    drawIvy(b, bx + bw * 0.02, by + bh * 0.12, bw * 0.16, bh * 0.34, night ? '#101a14' : day ? '#4a7444' : '#2a3a2c', null, 1.2);
    // 落水管
    b.strokeStyle = night ? 'rgba(90,80,96,0.7)' : 'rgba(80,60,52,0.7)';
    b.lineWidth = Math.max(2, W * 0.0022);
    b.beginPath();
    b.moveTo(bx + bw * 0.735, by);
    b.lineTo(bx + bw * 0.735, horizon);
    b.stroke();

    // 门厅与石阶
    const ex = bx + bw * 0.28, ew = bw * 0.18;
    b.fillStyle = night ? '#0f0d1c' : day ? '#3c3630' : '#241a24';
    b.fillRect(ex, horizon - H * 0.085, ew, H * 0.085);
    b.fillStyle = night ? 'rgba(255,206,148,0.20)' : 'rgba(255,214,150,0.30)';
    b.fillRect(ex + ew * 0.10, horizon - H * 0.072, ew * 0.80, H * 0.066);
    b.strokeStyle = stone;
    b.lineWidth = 2;
    b.strokeRect(ex + ew * 0.10, horizon - H * 0.072, ew * 0.80, H * 0.066);
    // 门廊雨棚
    b.fillStyle = night ? '#2a2234' : day ? '#6e6254' : '#463438';
    b.fillRect(ex - W * 0.012, horizon - H * 0.098, ew + W * 0.024, H * 0.014);
    b.fillStyle = 'rgba(255,246,226,0.12)';
    b.fillRect(ex - W * 0.012, horizon - H * 0.098, ew + W * 0.024, 2);
    // 铜牌
    b.fillStyle = night ? 'rgba(150,124,90,0.55)' : 'rgba(196,160,96,0.72)';
    b.fillRect(ex - W * 0.048, horizon - H * 0.066, W * 0.030, H * 0.020);
    b.fillStyle = 'rgba(30,24,18,0.55)';
    b.fillRect(ex - W * 0.044, horizon - H * 0.061, W * 0.022, H * 0.003);
    b.fillRect(ex - W * 0.044, horizon - H * 0.056, W * 0.016, H * 0.002);
  }
  drawCampus.ground = (b, p, horizon) => {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const night = state.time === 'night';
    const day = state.time === 'day';
    const warm = p2.warm;
    // 校园甬道：石板拼缝、两侧草带与落叶
    const laneY = horizon + (H - horizon) * 0.06;
    const laneG = b.createLinearGradient(0, laneY, 0, H);
    laneG.addColorStop(0, night ? '#262234' : day ? '#9c9686' : '#4c3c48');
    laneG.addColorStop(1, night ? '#141020' : day ? '#7c7668' : '#2e2432');
    b.fillStyle = laneG;
    b.beginPath();
    b.moveTo(W * 0.18, laneY);
    b.lineTo(W * 0.82, laneY);
    b.lineTo(W * 1.02, H);
    b.lineTo(-W * 0.02, H);
    b.closePath(); b.fill();
    // 石板缝
    b.strokeStyle = night ? 'rgba(130,126,158,0.10)' : 'rgba(40,32,36,0.22)';
    b.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const yy = laneY + Math.pow(t, 1.35) * (H - laneY);
      b.beginPath();
      b.moveTo(W * (0.18 - t * 0.2), yy);
      b.lineTo(W * (0.82 + t * 0.2), yy);
      b.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      b.beginPath();
      b.moveTo(W * (0.18 + t * 0.64), laneY);
      b.lineTo(W * (0.18 + t * 0.64 - 0.2), H);
      b.stroke();
    }
    // 两侧草地
    b.fillStyle = night ? '#152018' : day ? '#5b7a4a' : '#2c3424';
    b.beginPath();
    b.moveTo(0, laneY);
    b.lineTo(W * 0.18, laneY);
    b.lineTo(-W * 0.02, H);
    b.lineTo(0, H);
    b.closePath(); b.fill();
    b.beginPath();
    b.moveTo(W * 0.82, laneY);
    b.lineTo(W, laneY);
    b.lineTo(W, H);
    b.lineTo(W * 1.02, H);
    b.closePath(); b.fill();
    // 草丛
    b.strokeStyle = night ? 'rgba(70,104,78,0.45)' : day ? 'rgba(96,134,72,0.6)' : 'rgba(60,80,50,0.55)';
    b.lineWidth = 1;
    for (let i = 0; i < 120; i++) {
      const side = i % 2;
      const xx = side ? rand(W * 0.82, W) : rand(0, W * 0.18);
      const yy = rand(laneY, H);
      b.beginPath();
      b.moveTo(xx, yy);
      b.quadraticCurveTo(xx + rand(-3, 3), yy - rand(4, 12), xx + rand(-5, 5), yy - rand(8, 20));
      b.stroke();
    }
    // 落叶
    for (let i = 0; i < 46; i++) {
      const xx = rand(W * 0.10, W * 0.92);
      const yy = rand(laneY, H);
      b.fillStyle = `rgba(${150 + (i % 4) * 20},${92 + (i % 3) * 16},${44 + (i % 2) * 12},${rand(0.28, 0.55)})`;
      b.beginPath();
      b.ellipse(xx, yy, rand(2, 5), rand(1, 2.4), rand(0, 6.3), 0, 6.3);
      b.fill();
    }
    // 两株法国梧桐：左近右远，树冠探进画面
    drawPlaneTree(b, -W * 0.040, H * 1.02, H * 0.80, night ? '#241a26' : day ? '#8a7a62' : '#4a3a40',
      night ? '#101c18' : day ? '#3e6040' : '#24302a',
      night ? 'rgba(196,214,255,0.18)' : day ? 'rgba(255,240,190,0.22)' : 'rgba(255,196,132,0.24)',
      1, night ? -1 : -0.6);
    drawPlaneTree(b, W * 1.040, H * 1.06, H * 0.84, night ? '#1e1622' : day ? '#7a6a54' : '#403038',
      night ? '#0e1814' : day ? '#365638' : '#1e2a24',
      night ? 'rgba(196,214,255,0.14)' : 'rgba(255,206,140,0.18)', -1, -0.4);
    // 树影落在石板上
    b.save();
    b.globalCompositeOperation = 'multiply';
    const sh = b.createLinearGradient(0, laneY, W, H);
    sh.addColorStop(0, 'rgba(16,10,20,0.0)');
    sh.addColorStop(0.45, 'rgba(16,10,20,0.22)');
    sh.addColorStop(1, 'rgba(16,10,20,0.0)');
    b.fillStyle = sh;
    b.beginPath();
    b.moveTo(W * 0.12, laneY); b.lineTo(W * 0.46, laneY);
    b.lineTo(W * 0.30, H); b.lineTo(W * 0.02, H);
    b.closePath(); b.fill();
    b.restore();
    // 靠墙的自行车棚：几道斜梁与车轮剪影
    b.strokeStyle = night ? 'rgba(110,104,128,0.35)' : 'rgba(60,50,52,0.45)';
    b.lineWidth = Math.max(1.2, W * 0.0015);
    for (let i = 0; i < 3; i++) {
      const bx = W * (0.845 + i * 0.045), by = H * 0.86;
      b.beginPath(); b.arc(bx, by, H * 0.024, 0, 6.3); b.stroke();
      b.beginPath(); b.arc(bx + W * 0.042, by, H * 0.024, 0, 6.3); b.stroke();
      b.beginPath();
      b.moveTo(bx, by); b.lineTo(bx + W * 0.016, by - H * 0.036);
      b.lineTo(bx + W * 0.030, by); b.lineTo(bx + W * 0.042, by);
      b.moveTo(bx + W * 0.016, by - H * 0.036); b.lineTo(bx + W * 0.012, by - H * 0.052);
      b.stroke();
    }
    // 窗光落在甬道
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const wx = W * (0.16 + i * 0.105);
      const pool = b.createLinearGradient(0, laneY, 0, H * 0.9);
      pool.addColorStop(0, hexA(p2.glow, night ? 0.10 : 0.06));
      pool.addColorStop(1, hexA(p2.glow, 0));
      b.fillStyle = pool;
      b.beginPath();
      b.moveTo(wx, laneY); b.lineTo(wx + W * 0.05, laneY);
      b.lineTo(wx + W * 0.08, H * 0.92); b.lineTo(wx - W * 0.03, H * 0.92);
      b.closePath(); b.fill();
    }
    b.restore();
  };

  /* ---------- 场景：旧琴房 ---------- */
  function drawPianoroom(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const night = state.time === 'night';
    const day = state.time === 'day';
    const warm = p2.warm;

    /* ---------- 天花板：木梁与一盏旧灯泡 ---------- */
    const ceil = H * 0.115;
    const ceilG = b.createLinearGradient(0, 0, 0, ceil);
    ceilG.addColorStop(0, night ? '#0d0a15' : day ? '#c2b8a4' : '#46313c');
    ceilG.addColorStop(1, night ? '#181222' : day ? '#a89c86' : '#33232c');
    b.fillStyle = ceilG;
    b.fillRect(0, 0, W, ceil);
    // 顶板拼缝
    b.strokeStyle = night ? 'rgba(120,110,140,0.10)' : 'rgba(60,42,34,0.18)';
    b.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const yy = ceil * (0.16 + i * 0.19);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    // 横梁：有厚度与侧面暗部
    for (let i = 0; i < 3; i++) {
      const bx = W * (0.06 + i * 0.40), bw = W * 0.026;
      b.fillStyle = night ? '#08060e' : day ? '#8a745a' : '#322226';
      b.fillRect(bx, 0, bw, ceil);
      b.fillStyle = 'rgba(255,240,214,0.10)';
      b.fillRect(bx, ceil - H * 0.008, bw, H * 0.004);
      b.fillStyle = 'rgba(0,0,0,0.28)';
      b.fillRect(bx + bw - 2, 0, 2, ceil);
    }
    // 吊线灯泡
    b.strokeStyle = night ? 'rgba(140,132,150,0.42)' : 'rgba(70,58,50,0.50)';
    b.lineWidth = 1.4;
    b.beginPath(); b.moveTo(W * 0.585, 0); b.lineTo(W * 0.585, ceil + H * 0.070); b.stroke();
    b.fillStyle = '#2a221c';
    b.fillRect(W * 0.585 - 3, ceil + H * 0.062, 6, H * 0.010);
    const bulb = b.createRadialGradient(W * 0.585 - H * 0.002, ceil + H * 0.082, 0, W * 0.585, ceil + H * 0.084, H * 0.014);
    bulb.addColorStop(0, 'rgba(255,246,214,0.85)');
    bulb.addColorStop(0.5, 'rgba(250,222,170,0.55)');
    bulb.addColorStop(1, 'rgba(210,170,120,0.25)');
    b.fillStyle = bulb;
    b.beginPath(); b.arc(W * 0.585, ceil + H * 0.086, H * 0.0105, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(80,66,54,0.65)';
    b.lineWidth = 1;
    b.beginPath(); b.arc(W * 0.585, ceil + H * 0.086, H * 0.0105, 0, 6.3); b.stroke();
    // 灯丝
    b.strokeStyle = 'rgba(255,220,160,0.55)';
    b.lineWidth = 0.8;
    b.beginPath();
    b.moveTo(W * 0.585 - H * 0.003, ceil + H * 0.092);
    b.quadraticCurveTo(W * 0.585, ceil + H * 0.082, W * 0.585 + H * 0.003, ceil + H * 0.092);
    b.stroke();

    /* ---------- 后墙：斑驳粉刷，横向水痕与细裂纹 ---------- */
    const wallG = b.createLinearGradient(0, ceil, 0, horizon);
    wallG.addColorStop(0, night ? '#2a2038' : day ? '#d2c9b6' : '#61464d');
    wallG.addColorStop(0.55, night ? '#211829' : day ? '#c6bca8' : '#523a42');
    wallG.addColorStop(1, night ? '#161020' : day ? '#ada28c' : '#3c2a33');
    b.fillStyle = wallG;
    b.fillRect(0, ceil, W, horizon - ceil);
    // 柔和的霉斑与水渍
    for (let i = 0; i < 34; i++) {
      const sx = rand(0, W), sy = ceil + rand(0.05, 0.92) * (horizon - ceil);
      const sr = rand(H * 0.02, H * 0.075);
      const stain = b.createRadialGradient(sx, sy, 0, sx, sy, sr);
      const tone = i % 3 === 0 ? '96,64,52' : i % 3 === 1 ? '60,46,60' : '140,116,86';
      stain.addColorStop(0, `rgba(${tone},${night ? 0.08 : 0.055})`);
      stain.addColorStop(1, `rgba(${tone},0)`);
      b.fillStyle = stain;
      b.beginPath(); b.arc(sx, sy, sr, 0, 6.3); b.fill();
    }
    // 从天花板垂下的水痕
    for (let i = 0; i < 16; i++) {
      const sx = rand(0, W);
      const len = rand(0.10, 0.52) * (horizon - ceil);
      const streak = b.createLinearGradient(0, ceil, 0, ceil + len);
      streak.addColorStop(0, night ? 'rgba(10,8,16,0.35)' : 'rgba(72,54,44,0.18)');
      streak.addColorStop(1, 'rgba(72,54,44,0)');
      b.fillStyle = streak;
      const sw = rand(1.5, 7);
      b.fillRect(sx, ceil, sw, len);
    }
    // 细裂纹
    b.strokeStyle = night ? 'rgba(10,8,16,0.45)' : 'rgba(70,52,44,0.22)';
    b.lineWidth = 0.9;
    for (let i = 0; i < 4; i++) {
      let cx = rand(W * 0.05, W * 0.95), cy = ceil + rand(H * 0.02, H * 0.12);
      b.beginPath(); b.moveTo(cx, cy);
      for (let k = 0; k < 7; k++) {
        cx += rand(-W * 0.008, W * 0.012);
        cy += rand(H * 0.012, H * 0.040);
        b.lineTo(cx, cy);
      }
      b.stroke();
      // 分叉
      b.beginPath();
      b.moveTo(cx, cy);
      b.lineTo(cx + rand(-W * 0.02, W * 0.02), cy + rand(H * 0.01, H * 0.05));
      b.stroke();
    }
    // 墙裙与画镜线
    b.fillStyle = night ? '#120d1c' : day ? '#93856e' : '#34232c';
    b.fillRect(0, horizon - H * 0.045, W, H * 0.045);
    b.fillStyle = 'rgba(255,246,226,0.10)';
    b.fillRect(0, horizon - H * 0.045, W, 2);
    b.fillStyle = 'rgba(0,0,0,0.22)';
    b.fillRect(0, horizon - H * 0.012, W, H * 0.006);
    b.strokeStyle = night ? 'rgba(140,128,150,0.14)' : 'rgba(56,40,32,0.18)';
    b.lineWidth = 1.5;
    b.beginPath();
    b.moveTo(0, ceil + H * 0.145);
    b.lineTo(W, ceil + H * 0.145);
    b.stroke();

    /* ---------- 左侧木门 ---------- */
    const dx = W * 0.012, dw = W * 0.105;
    const doorTop = ceil + H * 0.035, doorBot = horizon - H * 0.005;
    const doorG = b.createLinearGradient(dx, 0, dx + dw, 0);
    doorG.addColorStop(0, night ? '#0e0a16' : day ? '#8a6a4c' : '#3e2c28');
    doorG.addColorStop(0.45, night ? '#181122' : day ? '#a5825e' : '#503830');
    doorG.addColorStop(1, night ? '#0b0812' : day ? '#6e523a' : '#2e2020');
    b.fillStyle = doorG;
    b.fillRect(dx, doorTop, dw, doorBot - doorTop);
    b.strokeStyle = night ? 'rgba(110,92,92,0.45)' : 'rgba(52,34,26,0.55)';
    b.lineWidth = 2;
    b.strokeRect(dx, doorTop, dw, doorBot - doorTop);
    for (let i = 0; i < 2; i++) {
      const ix = dx + dw * (0.15 + i * 0.42);
      b.strokeStyle = 'rgba(30,20,18,0.45)';
      b.lineWidth = 1.4;
      b.strokeRect(ix, doorTop + H * 0.045, dw * 0.28, (doorBot - doorTop) * 0.36);
      b.strokeRect(ix, doorTop + (doorBot - doorTop) * 0.55, dw * 0.28, (doorBot - doorTop) * 0.32);
      b.fillStyle = 'rgba(255,246,226,0.05)';
      b.fillRect(ix + 1, doorTop + H * 0.046, 1, (doorBot - doorTop) * 0.35);
    }
    // 门把手与磨损
    b.fillStyle = night ? 'rgba(178,158,118,0.55)' : 'rgba(180,146,88,0.75)';
    b.beginPath(); b.arc(dx + dw * 0.84, doorTop + (doorBot - doorTop) * 0.48, H * 0.0065, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(255,232,180,0.30)';
    b.beginPath(); b.arc(dx + dw * 0.84 - 1, doorTop + (doorBot - doorTop) * 0.48 - 1, H * 0.0022, 0, 6.3); b.fill();
    // 门缝漏出的光
    b.fillStyle = night ? 'rgba(255,206,140,0.16)' : 'rgba(255,220,160,0.20)';
    b.fillRect(dx + dw - 2, doorTop + 2, 2, doorBot - doorTop - 2);

    /* ---------- 右侧高窗：深窗洞、玻璃、窗外藤影 ---------- */
    const wx = W * 0.505, wy = ceil + H * 0.020, ww = W * 0.455, wh = H * 0.545;
    // 窗洞阴影
    b.fillStyle = night ? '#0a0a16' : day ? '#6e6456' : '#2c2436';
    b.fillRect(wx - W * 0.010, wy, ww + W * 0.020, wh + H * 0.016);
    // 天空
    const sky = b.createLinearGradient(wx, wy, wx, wy + wh);
    if (night) {
      sky.addColorStop(0, '#0e1630');
      sky.addColorStop(0.45, '#182242');
      sky.addColorStop(0.75, '#2a2c4a');
      sky.addColorStop(1, '#41384c');
    } else if (day) {
      sky.addColorStop(0, '#a8cbe0');
      sky.addColorStop(0.6, '#cfe2e8');
      sky.addColorStop(1, '#e8e0c8');
    } else {
      sky.addColorStop(0, '#4a3a62');
      sky.addColorStop(0.40, '#a06a72');
      sky.addColorStop(0.68, '#e0a06a');
      sky.addColorStop(1, '#f4c890');
    }
    b.fillStyle = sky;
    b.fillRect(wx, wy, ww, wh);
    // 远处树线（不画月亮，室内夜景保持克制）
    b.fillStyle = night ? 'rgba(6,12,12,0.90)' : day ? 'rgba(54,88,52,0.72)' : 'rgba(34,30,34,0.72)';
    b.beginPath();
    b.moveTo(wx, wy + wh * 0.62);
    for (let i = 0; i <= 10; i++) {
      const xx = wx + (i / 10) * ww;
      b.lineTo(xx, wy + wh * (0.56 + Math.abs(Math.sin(i * 2.1 + 0.7)) * 0.10));
    }
    b.lineTo(wx + ww, wy + wh);
    b.lineTo(wx, wy + wh);
    b.closePath(); b.fill();
    // 窗外的爬藤叶影：一片片小叶子，贴着玻璃
    b.save();
    b.beginPath(); b.rect(wx, wy, ww, wh); b.clip();
    for (let i = 0; i < 110; i++) {
      const lx = wx + rand(-0.02, 1.0) * ww;
      const ly = wy + rand(0, 0.68) * wh;
      const lw = rand(W * 0.004, W * 0.014);
      b.fillStyle = night ? `rgba(8,20,16,${rand(0.35, 0.75)})` : day ? `rgba(30,62,34,${rand(0.28, 0.60)})` : `rgba(24,34,26,${rand(0.30, 0.62)})`;
      b.beginPath();
      b.ellipse(lx, ly, lw, lw * 0.55, rand(-1, 1), 0, 6.3);
      b.fill();
      // 叶脉
      if (i % 4 === 0) {
        b.strokeStyle = 'rgba(180,200,160,0.10)';
        b.lineWidth = 0.6;
        b.beginPath(); b.moveTo(lx - lw * 0.7, ly); b.lineTo(lx + lw * 0.7, ly); b.stroke();
      }
    }
    // 一两串小白花
    for (let i = 0; i < 14; i++) {
      const lx = wx + rand(0.05, 0.95) * ww;
      const ly = wy + rand(0.02, 0.30) * wh;
      b.fillStyle = night ? 'rgba(210,214,200,0.22)' : 'rgba(246,242,222,0.42)';
      for (let k = 0; k < 4; k++) {
        b.beginPath();
        b.arc(lx + Math.cos(k * 1.57) * H * 0.003, ly + Math.sin(k * 1.57) * H * 0.003, H * 0.0028, 0, 6.3);
        b.fill();
      }
    }
    b.restore();
    // 玻璃反光：斜向的浅色长条
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const skyGlow = b.createLinearGradient(wx, wy + wh * (0.1 + i * 0.25), wx + ww, wy + wh * (0.3 + i * 0.25));
      skyGlow.addColorStop(0, night ? 'rgba(150,170,230,0.10)' : 'rgba(255,240,210,0.16)');
      skyGlow.addColorStop(0.5, night ? 'rgba(150,170,230,0.04)' : 'rgba(255,240,210,0.05)');
      skyGlow.addColorStop(1, 'rgba(255,240,210,0)');
      b.fillStyle = skyGlow;
      b.fillRect(wx + ww * (0.06 + i * 0.28), wy, ww * 0.16, wh);
    }
    b.restore();
    // 窗框：外框、竖梃、横梃与窗台
    const frameC = night ? 'rgba(176,164,152,0.42)' : day ? 'rgba(100,76,54,0.80)' : 'rgba(88,64,50,0.78)';
    b.strokeStyle = frameC;
    b.lineWidth = Math.max(3, W * 0.0045);
    b.strokeRect(wx, wy, ww, wh);
    b.lineWidth = Math.max(2, W * 0.0030);
    for (let i = 1; i < 3; i++) {
      b.beginPath(); b.moveTo(wx + (ww / 3) * i, wy); b.lineTo(wx + (ww / 3) * i, wy + wh); b.stroke();
    }
    for (let i = 1; i < 4; i++) {
      b.beginPath(); b.moveTo(wx, wy + (wh / 4) * i); b.lineTo(wx + ww, wy + (wh / 4) * i); b.stroke();
    }
    // 窗棂高光
    b.strokeStyle = 'rgba(255,246,226,0.14)';
    b.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      b.beginPath(); b.moveTo(wx + (ww / 3) * i - 2, wy); b.lineTo(wx + (ww / 3) * i - 2, wy + wh); b.stroke();
    }
    // 窗台
    b.fillStyle = night ? '#2c2434' : day ? '#b4a48a' : '#4c383a';
    b.fillRect(wx - W * 0.014, wy + wh, ww + W * 0.028, H * 0.020);
    b.fillStyle = 'rgba(255,246,226,0.16)';
    b.fillRect(wx - W * 0.014, wy + wh, ww + W * 0.028, 2);
    b.fillStyle = 'rgba(0,0,0,0.25)';
    b.fillRect(wx - W * 0.014, wy + wh + H * 0.020, ww + W * 0.028, H * 0.006);

    // 窗光斜切进来：多层低透明度光带，边缘柔和（先于家具绘制，钢琴会挡住光）
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < 3; layer++) {
      const beam = b.createLinearGradient(wx + ww * 0.25, wy, W * 0.20, H);
      beam.addColorStop(0, hexA(p2.glow, (night ? 0.058 : 0.062) * (1 - layer * 0.24)));
      beam.addColorStop(0.55, hexA(p2.glow, (night ? 0.024 : 0.024) * (1 - layer * 0.20)));
      beam.addColorStop(1, hexA(p2.glow, 0));
      b.fillStyle = beam;
      const spread = layer * W * 0.018;
      b.beginPath();
      b.moveTo(wx + ww * 0.16 - spread, wy + wh * 0.12);
      b.lineTo(wx + ww * 0.84 + spread, wy + wh * 0.26);
      b.lineTo(W * 0.46 + spread, H);
      b.lineTo(W * 0.08 - spread, H);
      b.closePath(); b.fill();
    }
    b.restore();

    /* ---------- 挂钟、海报与旧课桌 ---------- */
    const ccx = W * 0.315, ccy = ceil + H * 0.175, ccr = H * 0.050;
    b.fillStyle = night ? '#241c2c' : day ? '#7a6a52' : '#453034';
    b.beginPath(); b.arc(ccx, ccy, ccr, 0, 6.3); b.fill();
    b.strokeStyle = night ? 'rgba(180,170,150,0.30)' : 'rgba(50,38,30,0.50)';
    b.lineWidth = 1.5;
    b.beginPath(); b.arc(ccx, ccy, ccr * 0.93, 0, 6.3); b.stroke();
    b.fillStyle = night ? '#3a3040' : '#ddd2b8';
    b.beginPath(); b.arc(ccx, ccy, ccr * 0.80, 0, 6.3); b.fill();
    b.strokeStyle = night ? 'rgba(230,226,210,0.38)' : 'rgba(50,40,34,0.55)';
    b.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283;
      b.beginPath();
      b.moveTo(ccx + Math.cos(a) * ccr * 0.58, ccy + Math.sin(a) * ccr * 0.58);
      b.lineTo(ccx + Math.cos(a) * ccr * 0.72, ccy + Math.sin(a) * ccr * 0.72);
      b.stroke();
    }
    b.strokeStyle = night ? 'rgba(230,226,210,0.55)' : 'rgba(40,32,28,0.75)';
    b.lineWidth = 2;
    b.beginPath(); b.moveTo(ccx, ccy); b.lineTo(ccx + ccr * 0.22, ccy - ccr * 0.36); b.stroke();
    b.beginPath(); b.moveTo(ccx, ccy); b.lineTo(ccx - ccr * 0.40, ccy + ccr * 0.16); b.stroke();
    b.fillStyle = 'rgba(60,40,30,0.85)';
    b.beginPath(); b.arc(ccx, ccy, H * 0.0035, 0, 6.3); b.fill();

    // 墙上泛黄的乐理海报
    b.save();
    b.translate(W * 0.175, ceil + H * 0.275);
    b.rotate(-0.012);
    b.fillStyle = night ? 'rgba(120,96,84,0.30)' : day ? 'rgba(232,216,182,0.72)' : 'rgba(196,172,136,0.35)';
    b.fillRect(0, 0, W * 0.095, H * 0.145);
    b.strokeStyle = 'rgba(46,34,28,0.28)';
    b.lineWidth = 1;
    b.strokeRect(0.5, 0.5, W * 0.095 - 1, H * 0.145 - 1);
    // 海报上的五线谱与标题
    b.fillStyle = 'rgba(48,38,34,0.30)';
    for (let i = 0; i < 3; i++) {
      b.fillRect(W * 0.012, H * (0.018 + i * 0.012), W * 0.070, 1);
    }
    b.fillStyle = 'rgba(48,38,34,0.45)';
    b.fillRect(W * 0.012, H * 0.085, W * 0.062, 2);
    b.fillRect(W * 0.012, H * 0.095, W * 0.048, 2);
    b.fillRect(W * 0.012, H * 0.105, W * 0.056, 2);
    // 图钉
    b.fillStyle = 'rgba(150,50,44,0.55)';
    b.beginPath(); b.arc(W * 0.012, H * 0.010, H * 0.0035, 0, 6.3); b.fill();
    b.beginPath(); b.arc(W * 0.084, H * 0.010, H * 0.0035, 0, 6.3); b.fill();
    b.restore();

    // 旧课桌：靠墙立着几本书与一架节拍器
    const dkx = W * 0.115, dky = horizon - H * 0.115;
    b.fillStyle = night ? '#241820' : day ? '#9a7a58' : '#4a3232';
    b.fillRect(dkx, dky, W * 0.135, H * 0.016);
    b.fillStyle = 'rgba(255,240,214,0.12)';
    b.fillRect(dkx, dky, W * 0.135, 1.5);
    b.fillStyle = night ? '#1c141a' : day ? '#7e6246' : '#382426';
    b.fillRect(dkx + W * 0.010, dky + H * 0.016, W * 0.008, H * 0.099);
    b.fillRect(dkx + W * 0.117, dky + H * 0.016, W * 0.008, H * 0.099);
    // 书
    for (let i = 0; i < 4; i++) {
      b.fillStyle = ['#6a3a32', '#3e4a5a', '#7a6a4a', '#4a3a4a'][i];
      b.globalAlpha = night ? 0.42 : 0.75;
      b.fillRect(dkx + W * (0.018 + i * 0.006), dky - H * (0.012 + i * 0.006), W * 0.052, H * 0.011);
    }
    b.globalAlpha = 1;
    // 节拍器
    b.fillStyle = night ? '#2a1e1a' : '#6a4a2e';
    b.beginPath();
    b.moveTo(dkx + W * 0.095, dky);
    b.lineTo(dkx + W * 0.088, dky - H * 0.048);
    b.lineTo(dkx + W * 0.108, dky - H * 0.048);
    b.lineTo(dkx + W * 0.103, dky);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(220,196,150,0.40)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(dkx + W * 0.098, dky - H * 0.006);
    b.lineTo(dkx + W * 0.094, dky - H * 0.044);
    b.stroke();

    /* ---------- 黑色立式钢琴 ---------- */
    const px = W * 0.485, pw = W * 0.295;
    const ptop = horizon - H * 0.345;
    const pbot = horizon - H * 0.004;
    const pbodyH = pbot - ptop;
    // 琴脚/底板在地面上的厚度
    b.fillStyle = '#050308';
    b.fillRect(px - W * 0.006, pbot, pw + W * 0.012, H * 0.010);
    // 琴身
    const bodyG = b.createLinearGradient(px, 0, px + pw, 0);
    bodyG.addColorStop(0, night ? '#0b0814' : '#17121c');
    bodyG.addColorStop(0.18, night ? '#0e0a18' : '#1d1622');
    bodyG.addColorStop(0.55, '#09060e');
    bodyG.addColorStop(0.86, '#0c0812');
    bodyG.addColorStop(1, '#050308');
    b.fillStyle = bodyG;
    b.fillRect(px, ptop, pw, pbodyH);
    // 侧面高光
    b.fillStyle = night ? 'rgba(150,164,210,0.10)' : 'rgba(255,214,160,0.10)';
    b.fillRect(px + pw * 0.02, ptop, 1.5, pbodyH);
    b.fillStyle = 'rgba(255,244,220,0.05)';
    b.fillRect(px + pw * 0.97, ptop, 1, pbodyH);
    // 漆面反光：窗光的一道斜长倒影
    b.save();
    b.globalCompositeOperation = 'lighter';
    const lacquer = b.createLinearGradient(px + pw * 0.2, ptop, px + pw * 0.8, pbot);
    lacquer.addColorStop(0, night ? 'rgba(120,140,190,0.10)' : 'rgba(255,224,180,0.08)');
    lacquer.addColorStop(0.45, 'rgba(255,224,180,0.02)');
    lacquer.addColorStop(1, 'rgba(255,224,180,0)');
    b.fillStyle = lacquer;
    b.beginPath();
    b.moveTo(px + pw * 0.20, ptop);
    b.lineTo(px + pw * 0.46, ptop);
    b.lineTo(px + pw * 0.66, pbot);
    b.lineTo(px + pw * 0.34, pbot);
    b.closePath(); b.fill();
    b.restore();
    // 上盖板
    b.save();
    b.translate(px + pw * 0.06, ptop);
    b.rotate(-0.055);
    b.fillStyle = '#0d090f';
    b.fillRect(0, -H * 0.042, pw * 0.88, H * 0.012);
    b.fillStyle = 'rgba(255,240,214,0.10)';
    b.fillRect(0, -H * 0.042, pw * 0.88, 2);
    b.fillStyle = 'rgba(0,0,0,0.45)';
    b.fillRect(0, -H * 0.032, pw * 0.88, H * 0.006);
    b.restore();
    // 上部前板：竖向木纹与铭牌
    b.strokeStyle = 'rgba(255,240,214,0.035)';
    b.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const gx = px + pw * (0.10 + i * 0.09);
      b.beginPath(); b.moveTo(gx, ptop + H * 0.010); b.lineTo(gx, ptop + H * 0.105); b.stroke();
    }
    // 金色铭牌
    b.fillStyle = night ? 'rgba(180,150,92,0.35)' : 'rgba(204,170,104,0.55)';
    b.fillRect(px + pw * 0.33, ptop + H * 0.058, pw * 0.34, H * 0.016);
    b.fillStyle = 'rgba(255,238,190,0.22)';
    b.fillRect(px + pw * 0.33, ptop + H * 0.058, pw * 0.34, 1);

    // 谱架：两块打开的谱页
    const deskY = ptop + H * 0.088;
    b.fillStyle = '#07050a';
    b.beginPath();
    b.moveTo(px + pw * 0.10, deskY + H * 0.035);
    b.lineTo(px + pw * 0.16, deskY - H * 0.010);
    b.lineTo(px + pw * 0.84, deskY - H * 0.010);
    b.lineTo(px + pw * 0.90, deskY + H * 0.035);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(255,240,214,0.06)';
    b.fillRect(px + pw * 0.16, deskY - H * 0.010, pw * 0.68, 1);
    // 乐谱
    const spx = px + pw * 0.20, spy = deskY - H * 0.045;
    const spw = pw * 0.60, sph = H * 0.080;
    b.fillStyle = night ? 'rgba(208,198,172,0.44)' : 'rgba(236,224,196,0.82)';
    b.beginPath();
    b.moveTo(spx, spy + H * 0.006);
    b.lineTo(spx + spw * 0.49, spy);
    b.lineTo(spx + spw * 0.49, spy + sph);
    b.lineTo(spx, spy + sph + H * 0.004);
    b.closePath(); b.fill();
    b.fillStyle = night ? 'rgba(216,206,180,0.47)' : 'rgba(244,234,208,0.86)';
    b.beginPath();
    b.moveTo(spx + spw * 0.51, spy);
    b.lineTo(spx + spw, spy + H * 0.006);
    b.lineTo(spx + spw, spy + sph + H * 0.004);
    b.lineTo(spx + spw * 0.51, spy + sph);
    b.closePath(); b.fill();
    // 谱线
    b.strokeStyle = 'rgba(60,48,34,0.28)';
    b.lineWidth = 0.7;
    for (let st = 0; st < 4; st++) {
      for (const side of [0, 1]) {
        const sx0 = side ? spx + spw * 0.53 : spx + spw * 0.04;
        const sw0 = spw * 0.42;
        const sy0 = spy + sph * (0.12 + st * 0.21);
        for (let l = 0; l < 5; l++) {
          b.beginPath();
          b.moveTo(sx0, sy0 + l * H * 0.0034);
          b.lineTo(sx0 + sw0, sy0 + l * H * 0.0034);
          b.stroke();
        }
      }
    }
    // 音符与小节线：让谱页读起来像真的在弹同一支曲子
    for (const side of [0, 1]) {
      const sx0 = side ? spx + spw * 0.53 : spx + spw * 0.04;
      const sw0 = spw * 0.42;
      b.fillStyle = 'rgba(56,44,32,0.40)';
      for (let st = 0; st < 4; st++) {
        const sy0 = spy + sph * (0.12 + st * 0.21);
        for (let n = 0; n < 5; n++) {
          const nx = sx0 + sw0 * (0.10 + n * 0.19);
          const nl = 1 + Math.floor(((n * 3 + st * 2 + (side ? 1 : 0)) % 5));
          b.beginPath();
          b.ellipse(nx, sy0 + nl * H * 0.0034, W * 0.0021, W * 0.0015, -0.42, 0, 6.3);
          b.fill();
        }
        b.strokeStyle = 'rgba(56,44,32,0.26)';
        b.lineWidth = 0.8;
        b.beginPath();
        b.moveTo(sx0 + sw0 * 0.66, sy0);
        b.lineTo(sx0 + sw0 * 0.66, sy0 + H * 0.0136);
        b.stroke();
      }
    }
    // 谱页边缘的阴影
    b.fillStyle = 'rgba(20,14,10,0.18)';
    b.fillRect(spx + spw * 0.49, spy, 2, sph);

    // 键盘：黑檀与象牙（白键带纵向渐变与键缝）
    const ky = ptop + H * 0.190;
    const kH = H * 0.030;
    b.fillStyle = '#0a0710';
    b.fillRect(px + pw * 0.035, ky - H * 0.006, pw * 0.93, H * 0.006);
    b.fillStyle = 'rgba(0,0,0,0.45)';
    b.fillRect(px + pw * 0.035, ky - H * 0.002, pw * 0.93, 2);
    const keyG0 = b.createLinearGradient(0, ky, 0, ky + kH);
    keyG0.addColorStop(0, night ? '#dcd4c0' : '#efe7d2');
    keyG0.addColorStop(0.68, night ? '#bdb29c' : '#d4cab2');
    keyG0.addColorStop(1, night ? '#948974' : '#aaa088');
    b.fillStyle = keyG0;
    b.fillRect(px + pw * 0.045, ky, pw * 0.91, kH);
    const keyCnt = 30;
    const keyW0 = (pw * 0.91) / keyCnt;
    for (let i = 0; i < keyCnt; i++) {
      const kx = px + pw * 0.045 + i * keyW0;
      b.fillStyle = i % 2 ? 'rgba(255,250,236,0.10)' : 'rgba(120,104,86,0.10)';
      b.fillRect(kx + 0.5, ky + 0.5, keyW0 - 1, kH - 1);
      b.strokeStyle = 'rgba(58,44,32,0.42)';
      b.lineWidth = 0.8;
      b.beginPath(); b.moveTo(kx, ky); b.lineTo(kx, ky + kH); b.stroke();
      // 黑键按 2-3 分组
      if (![2, 6].includes(i % 7)) {
        b.fillStyle = '#0b0710';
        b.fillRect(kx + keyW0 * 0.58, ky, keyW0 * 0.36, kH * 0.62);
        b.fillStyle = 'rgba(150,140,160,0.18)';
        b.fillRect(kx + keyW0 * 0.58, ky, keyW0 * 0.36, 1);
        b.fillStyle = 'rgba(0,0,0,0.32)';
        b.fillRect(kx + keyW0 * 0.58, ky + kH * 0.60, keyW0 * 0.36, 1.5);
      }
    }
    // 键床前沿
    b.fillStyle = '#08050c';
    b.fillRect(px + pw * 0.035, ky + kH, pw * 0.93, H * 0.018);
    b.fillStyle = 'rgba(255,240,214,0.10)';
    b.fillRect(px + pw * 0.035, ky + kH, pw * 0.93, 1);
    // 两侧琴臂
    for (const s of [0, 1]) {
      const ax = s ? px + pw * 0.955 : px + pw * 0.012;
      b.fillStyle = '#070409';
      b.fillRect(ax, ky - H * 0.010, pw * 0.032, kH + H * 0.030);
      b.fillStyle = 'rgba(255,240,214,0.06)';
      b.fillRect(ax + (s ? 0 : pw * 0.030), ky - H * 0.010, 1, kH + H * 0.030);
    }
    // 踏板：凹陷的踏板仓、连杆、踏板板与三只铜踏板
    const plx0 = px + pw * 0.50;
    b.fillStyle = 'rgba(255,236,204,0.035)';
    b.fillRect(plx0 - pw * 0.115, horizon - H * 0.075, pw * 0.23, H * 0.062);
    b.strokeStyle = 'rgba(0,0,0,0.55)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(plx0 - pw * 0.115, horizon - H * 0.075);
    b.lineTo(plx0 - pw * 0.115, horizon - H * 0.013);
    b.moveTo(plx0 + pw * 0.115, horizon - H * 0.075);
    b.lineTo(plx0 + pw * 0.115, horizon - H * 0.013);
    b.stroke();
    b.fillStyle = 'rgba(30,22,28,0.85)';
    b.fillRect(plx0 - W * 0.004, horizon - H * 0.070, W * 0.008, H * 0.047);
    b.fillStyle = 'rgba(150,124,80,0.35)';
    b.fillRect(plx0 - W * 0.004, horizon - H * 0.070, 1, H * 0.047);
    const pedalBoardG = b.createLinearGradient(0, horizon - H * 0.026, 0, horizon - H * 0.013);
    pedalBoardG.addColorStop(0, '#140d16');
    pedalBoardG.addColorStop(1, '#08050a');
    b.fillStyle = pedalBoardG;
    b.beginPath();
    b.moveTo(plx0 - pw * 0.10, horizon - H * 0.023);
    b.lineTo(plx0 + pw * 0.10, horizon - H * 0.023);
    b.lineTo(plx0 + pw * 0.09, horizon - H * 0.013);
    b.lineTo(plx0 - pw * 0.09, horizon - H * 0.013);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(255,236,204,0.07)';
    b.fillRect(plx0 - pw * 0.09, horizon - H * 0.013, pw * 0.18, 1);
    for (let i = 0; i < 3; i++) {
      const pbx = plx0 - pw * 0.062 + i * pw * 0.052;
      b.fillStyle = 'rgba(0,0,0,0.40)';
      b.beginPath(); b.ellipse(pbx + pw * 0.008, horizon - H * 0.0105, pw * 0.022, H * 0.0030, 0, 0, 6.3); b.fill();
      const brass2 = b.createLinearGradient(0, horizon - H * 0.017, 0, horizon - H * 0.009);
      brass2.addColorStop(0, night ? 'rgba(196,164,104,0.85)' : 'rgba(222,188,120,0.92)');
      brass2.addColorStop(1, night ? 'rgba(104,80,46,0.85)' : 'rgba(140,104,58,0.92)');
      b.fillStyle = brass2;
      b.beginPath();
      b.ellipse(pbx + pw * 0.008, horizon - H * 0.014, pw * 0.020, H * 0.0035, 0, 0, 6.3);
      b.fill();
      b.fillStyle = 'rgba(255,244,214,0.28)';
      b.beginPath();
      b.ellipse(pbx + pw * 0.006, horizon - H * 0.0155, pw * 0.009, H * 0.0012, 0, 0, 6.3);
      b.fill();
    }

    // 琴凳
    const sx = W * 0.545, sw = W * 0.175;
    const sy = horizon - H * 0.082;
    b.fillStyle = night ? 'rgba(0,0,0,0.50)' : 'rgba(0,0,0,0.28)';
    b.beginPath(); b.ellipse(sx + sw * 0.5, horizon + H * 0.008, sw * 0.52, H * 0.014, 0, 0, 6.3); b.fill();
    b.fillStyle = night ? '#1a121c' : '#3c2a22';
    b.fillRect(sx, sy, sw, H * 0.018);
    b.fillStyle = night ? 'rgba(130,56,58,0.22)' : 'rgba(142,68,62,0.30)';
    b.fillRect(sx + W * 0.006, sy - H * 0.012, sw - W * 0.012, H * 0.013);
    b.fillStyle = night ? '#150e18' : '#2e201a';
    b.fillRect(sx + W * 0.014, sy + H * 0.018, W * 0.008, H * 0.070);
    b.fillRect(sx + sw - W * 0.022, sy + H * 0.018, W * 0.008, H * 0.070);
    // 凳上的乐谱夹：封面、纸页厚度、谱线与接触阴影
    b.save();
    b.translate(sx + sw * 0.56, sy - H * 0.002);
    b.rotate(-0.06);
    b.fillStyle = 'rgba(0,0,0,0.32)';
    b.beginPath(); b.ellipse(0, H * 0.004, W * 0.034, H * 0.005, 0, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(150,130,100,0.60)';
    b.fillRect(-W * 0.030, -H * 0.012, W * 0.060, H * 0.004);
    b.fillStyle = night ? 'rgba(202,192,168,0.72)' : 'rgba(234,224,198,0.92)';
    b.fillRect(-W * 0.030, -H * 0.020, W * 0.060, H * 0.010);
    b.fillStyle = 'rgba(255,250,236,0.22)';
    b.fillRect(-W * 0.030, -H * 0.020, W * 0.060, 1);
    b.strokeStyle = 'rgba(70,54,40,0.40)';
    b.lineWidth = 0.7;
    b.beginPath(); b.moveTo(0, -H * 0.020); b.lineTo(0, -H * 0.010); b.stroke();
    for (let l = 0; l < 4; l++) {
      b.beginPath();
      b.moveTo(-W * 0.026, -H * (0.0175 - l * 0.0022));
      b.lineTo(W * 0.026, -H * (0.0175 - l * 0.0022));
      b.stroke();
    }
    b.restore();

  }
  drawPianoroom.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    // 木地板
    const fg = b.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, night ? '#1a1422' : day ? '#b08a62' : '#563c40');
    fg.addColorStop(1, night ? '#0e0a16' : day ? '#8e6a48' : '#38262c');
    b.fillStyle = fg;
    b.fillRect(0, horizon, W, H - horizon);
    // 地板缝：透视收束
    b.strokeStyle = night ? 'rgba(120,104,120,0.10)' : 'rgba(50,30,24,0.20)';
    b.lineWidth = 1;
    for (let i = 1; i < 11; i++) {
      const yy = horizon + Math.pow(i / 11, 1.5) * (H - horizon);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const xx = rand(-W * 0.1, W * 1.1);
      b.beginPath();
      b.moveTo(W * 0.5 + (xx - W * 0.5) * 0.72, horizon);
      b.lineTo(xx, H);
      b.stroke();
    }
    // 木纹与划痕
    for (let i = 0; i < 70; i++) {
      const yy = rand(horizon, H);
      b.strokeStyle = `rgba(20,10,14,${rand(0.04, 0.13)})`;
      b.beginPath();
      b.moveTo(rand(0, W), yy);
      b.lineTo(rand(0, W), yy + rand(-3, 3));
      b.stroke();
    }
    // 钢琴下的旧地毯
    b.save();
    b.fillStyle = night ? 'rgba(52,26,32,0.55)' : day ? 'rgba(118,62,54,0.35)' : 'rgba(78,38,42,0.45)';
    b.beginPath();
    b.ellipse(W * 0.63, H * 0.86, W * 0.22, H * 0.075, 0, 0, 6.3);
    b.fill();
    b.strokeStyle = 'rgba(214,180,120,0.16)';
    b.lineWidth = 1.2;
    b.beginPath();
    b.ellipse(W * 0.63, H * 0.86, W * 0.19, H * 0.060, 0, 0, 6.3);
    b.stroke();
    // 地毯流苏
    for (let i = 0; i < 24; i++) {
      const a = Math.PI * (0.08 + i / 26);
      const fx = W * 0.63 + Math.cos(a) * W * 0.225;
      const fy = H * 0.86 + Math.sin(a) * H * 0.078;
      b.strokeStyle = 'rgba(196,164,108,0.18)';
      b.beginPath(); b.moveTo(fx, fy); b.lineTo(fx + rand(-2, 2), fy + rand(2, 8)); b.stroke();
    }
    b.restore();
    // 高窗光斑
    if (state.time !== 'day') {
      b.save();
      b.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const x0 = W * (0.44 + i * 0.11);
        const g = b.createLinearGradient(x0, horizon, x0 + W * 0.16, H);
        g.addColorStop(0, hexA(p2.glow, night ? 0.10 : 0.065));
        g.addColorStop(1, hexA(p2.glow, 0));
        b.fillStyle = g;
        b.beginPath();
        b.moveTo(x0, horizon);
        b.lineTo(x0 + W * 0.075, horizon);
        b.lineTo(x0 + W * 0.18, H);
        b.lineTo(x0 - W * 0.02, H);
        b.closePath(); b.fill();
      }
      b.restore();
    }
    // 琴脚阴影
    b.save();
    b.globalAlpha = night ? 0.22 : 0.13;
    b.fillStyle = '#000';
    b.beginPath();
    b.ellipse(W * 0.63, H * 0.885, W * 0.17, H * 0.028, 0, 0, 6.3);
    b.fill();
    b.restore();
  };

  /* ---------- 场景：音乐社活动室 ---------- */
  function drawMusicroom(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const night = state.time === 'night';
    const day = state.time === 'day';
    const warm = p2.warm;
    const ceil = H * 0.090;

    /* ---------- 天花板、吊扇与两盏吊灯 ---------- */
    const ceilG = b.createLinearGradient(0, 0, 0, ceil);
    ceilG.addColorStop(0, day ? '#ded8c9' : night ? '#171322' : '#51404a');
    ceilG.addColorStop(1, day ? '#cfc7b6' : night ? '#211a2e' : '#5e4a52');
    b.fillStyle = ceilG;
    b.fillRect(0, 0, W, ceil);
    // 吸音板拼缝
    b.strokeStyle = day ? 'rgba(120,110,96,0.26)' : 'rgba(200,190,190,0.08)';
    b.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      b.beginPath(); b.moveTo(0, ceil * i / 6); b.lineTo(W, ceil * i / 6); b.stroke();
    }
    for (let i = 1; i < 14; i++) {
      b.beginPath(); b.moveTo(W * i / 14, 0); b.lineTo(W * i / 14, ceil); b.stroke();
    }
    // 顶灯轨道
    b.fillStyle = day ? 'rgba(120,112,98,0.55)' : 'rgba(26,22,30,0.85)';
    b.fillRect(W * 0.05, ceil * 0.42, W * 0.45, H * 0.006);
    // 吊灯
    for (let i = 0; i < 2; i++) {
      const lx = W * (0.16 + i * 0.23);
      b.strokeStyle = day ? 'rgba(120,112,100,0.55)' : 'rgba(150,142,150,0.40)';
      b.lineWidth = 1.2;
      b.beginPath(); b.moveTo(lx, ceil * 0.42); b.lineTo(lx, ceil + H * 0.030); b.stroke();
      const shade = b.createLinearGradient(lx - H * 0.022, 0, lx + H * 0.022, 0);
      shade.addColorStop(0, '#2a2226');
      shade.addColorStop(0.5, '#4a3c3a');
      shade.addColorStop(1, '#1a1418');
      b.fillStyle = shade;
      b.beginPath();
      b.moveTo(lx - H * 0.024, ceil + H * 0.030);
      b.lineTo(lx + H * 0.024, ceil + H * 0.030);
      b.lineTo(lx + H * 0.016, ceil + H * 0.052);
      b.lineTo(lx - H * 0.016, ceil + H * 0.052);
      b.closePath(); b.fill();
      b.fillStyle = 'rgba(255,232,186,0.55)';
      b.beginPath(); b.ellipse(lx, ceil + H * 0.052, H * 0.015, H * 0.004, 0, 0, 6.3); b.fill();
    }
    // 吊扇
    const fanX = W * 0.70, fanY = ceil * 0.95;
    b.strokeStyle = day ? '#8f8776' : 'rgba(150,140,150,0.45)';
    b.lineWidth = 2;
    b.beginPath(); b.moveTo(fanX, 0); b.lineTo(fanX, fanY); b.stroke();
    b.save();
    b.translate(fanX, fanY);
    b.rotate(-0.18);
    for (let i = 0; i < 3; i++) {
      b.save();
      b.rotate((Math.PI * 2 / 3) * i);
      b.fillStyle = day ? 'rgba(190,182,162,0.95)' : 'rgba(90,82,88,0.9)';
      b.beginPath();
      b.moveTo(W * 0.010, -H * 0.002);
      b.quadraticCurveTo(W * 0.040, -H * 0.010, W * 0.070, -H * 0.004);
      b.quadraticCurveTo(W * 0.074, H * 0.004, W * 0.066, H * 0.007);
      b.quadraticCurveTo(W * 0.036, H * 0.008, W * 0.010, H * 0.002);
      b.closePath(); b.fill();
      b.restore();
    }
    b.fillStyle = day ? '#a29880' : '#655a57';
    b.beginPath(); b.arc(0, 0, W * 0.010, 0, 6.3); b.fill();
    b.restore();

    /* ---------- 墙面 ---------- */
    const wallG = b.createLinearGradient(0, ceil, 0, horizon);
    wallG.addColorStop(0, day ? '#e5dfcf' : night ? '#2a2338' : '#6f585c');
    wallG.addColorStop(0.6, day ? '#d8d0bd' : night ? '#211a2d' : '#5e4750');
    wallG.addColorStop(1, day ? '#c4baa4' : night ? '#171122' : '#4a3540');
    b.fillStyle = wallG;
    b.fillRect(0, ceil, W, horizon - ceil);
    // 柔和的墙面斑驳
    for (let i = 0; i < 60; i++) {
      const sx = rand(0, W), sy = rand(ceil, horizon);
      const sr = rand(H * 0.015, H * 0.070);
      const st = b.createRadialGradient(sx, sy, 0, sx, sy, sr);
      st.addColorStop(0, i % 2 ? 'rgba(255,250,238,0.035)' : 'rgba(60,34,40,0.03)');
      st.addColorStop(1, 'rgba(60,34,40,0)');
      b.fillStyle = st;
      b.beginPath(); b.arc(sx, sy, sr, 0, 6.3); b.fill();
    }
    // 踢脚线
    b.fillStyle = day ? '#a69880' : night ? '#120e1c' : '#3a2832';
    b.fillRect(0, horizon - H * 0.030, W, H * 0.030);
    b.fillStyle = 'rgba(255,246,226,0.10)';
    b.fillRect(0, horizon - H * 0.030, W, 2);

    /* ---------- 左侧大窗 + 窗外校园 ---------- */
    const wx = W * 0.018, wy = ceil + H * 0.030, ww = W * 0.315, wh = H * 0.435;
    b.fillStyle = night ? '#0a0a16' : day ? '#6a604e' : '#2a2232';
    b.fillRect(wx - W * 0.010, wy, ww + W * 0.020, wh + H * 0.014);
    const sky = b.createLinearGradient(wx, wy, wx, wy + wh);
    if (night) {
      sky.addColorStop(0, '#101a36');
      sky.addColorStop(0.55, '#1d2646');
      sky.addColorStop(1, '#3a3a54');
    } else if (day) {
      sky.addColorStop(0, '#a8cde2');
      sky.addColorStop(0.6, '#d6e8ec');
      sky.addColorStop(1, '#f0e6cc');
    } else {
      sky.addColorStop(0, '#4c3a62');
      sky.addColorStop(0.42, '#a46a70');
      sky.addColorStop(0.72, '#e4a268');
      sky.addColorStop(1, '#f6cc96');
    }
    b.fillStyle = sky;
    b.fillRect(wx, wy, ww, wh);
    // 远处红砖楼与树线
    b.fillStyle = night ? 'rgba(28,24,38,0.65)' : day ? 'rgba(148,96,78,0.42)' : 'rgba(70,48,46,0.55)';
    b.fillRect(wx + ww * 0.02, wy + wh * 0.44, ww * 0.42, wh * 0.36);
    b.fillStyle = 'rgba(30,24,24,0.22)';
    for (let i = 0; i < 8; i++) {
      b.fillRect(wx + ww * (0.05 + (i % 4) * 0.09), wy + wh * (0.48 + Math.floor(i / 4) * 0.12), ww * 0.035, wh * 0.07);
    }
    // 窗外梧桐：先枝干、再分三层叶片，靠明暗拉开前后
    b.save();
    b.beginPath(); b.rect(wx, wy, ww, wh); b.clip();
    const branch = (x0, y0, x1, y1, w0) => {
      b.strokeStyle = night ? 'rgba(8,14,12,0.70)' : day ? 'rgba(58,42,34,0.55)' : 'rgba(36,26,28,0.62)';
      b.lineWidth = w0;
      b.beginPath();
      b.moveTo(x0, y0);
      b.quadraticCurveTo((x0 + x1) * 0.5 + rand(-8, 8), (y0 + y1) * 0.5, x1, y1);
      b.stroke();
    };
    branch(wx + ww * 0.02, wy + wh * 0.72, wx + ww * 0.58, wy + wh * 0.30, Math.max(2, W * 0.0032));
    branch(wx + ww * 0.30, wy + wh * 0.48, wx + ww * 0.16, wy + wh * 0.10, Math.max(1.2, W * 0.0018));
    branch(wx + ww * 0.44, wy + wh * 0.38, wx + ww * 0.78, wy + wh * 0.12, Math.max(1.2, W * 0.0018));
    branch(wx + ww * 0.50, wy + wh * 0.34, wx + ww * 0.92, wy + wh * 0.44, Math.max(1, W * 0.0014));
    const leafTones = night
      ? ['8,20,14', '12,28,18', '18,36,24']
      : day
        ? ['28,58,34', '40,76,44', '54,94,54']
        : ['20,34,24', '28,46,30', '38,58,36'];
    // 背光层：压暗、偏蓝
    for (let i = 0; i < 150; i++) {
      const lx = wx + rand(-0.04, 1.02) * ww;
      const ly = wy + rand(0, 0.60) * wh;
      const lw = rand(W * 0.0035, W * 0.010);
      b.fillStyle = `rgba(${leafTones[0]},${rand(0.50, 0.86)})`;
      b.beginPath();
      b.ellipse(lx, ly, lw, lw * rand(0.38, 0.56), rand(-1, 1), 0, 6.3);
      b.fill();
    }
    // 中层：主体叶
    for (let i = 0; i < 190; i++) {
      const lx = wx + rand(-0.02, 1.0) * ww;
      const ly = wy + rand(0, 0.58) * wh;
      const lw = rand(W * 0.0030, W * 0.0085);
      b.fillStyle = `rgba(${leafTones[1]},${rand(0.48, 0.84)})`;
      b.beginPath();
      b.ellipse(lx, ly, lw, lw * rand(0.36, 0.54), rand(-1, 1), 0, 6.3);
      b.fill();
    }
    // 受光层：朝窗户上缘的亮叶
    for (let i = 0; i < 90; i++) {
      const lx = wx + rand(0.10, 1.0) * ww;
      const ly = wy + rand(0, 0.40) * wh;
      const lw = rand(W * 0.0025, W * 0.0065);
      b.fillStyle = `rgba(${leafTones[2]},${rand(0.22, 0.52)})`;
      b.beginPath();
      b.ellipse(lx, ly, lw, lw * 0.44, rand(-1, 1), 0, 6.3);
      b.fill();
    }
    // 玻璃上的雾气与反光斜带
    b.fillStyle = day ? 'rgba(240,248,250,0.10)' : 'rgba(210,224,246,0.06)';
    b.beginPath();
    b.moveTo(wx, wy + wh * 0.10);
    b.lineTo(wx + ww * 0.42, wy);
    b.lineTo(wx + ww, wy);
    b.lineTo(wx, wy + wh * 0.46);
    b.closePath(); b.fill();
    b.restore();
    // 玻璃反光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const skyG = b.createLinearGradient(wx, wy, wx + ww, wy + wh);
    skyG.addColorStop(0, hexA(p2.glow, day ? 0.24 : 0.12));
    skyG.addColorStop(0.5, hexA(p2.glow, 0.04));
    skyG.addColorStop(1, hexA(p2.glow, 0));
    b.fillStyle = skyG;
    b.fillRect(wx, wy, ww, wh);
    b.restore();
    // 窗框
    const fr = day ? 'rgba(244,240,226,0.85)' : night ? 'rgba(186,182,192,0.38)' : 'rgba(206,198,190,0.50)';
    b.strokeStyle = fr;
    b.lineWidth = Math.max(3, W * 0.0038);
    b.strokeRect(wx, wy, ww, wh);
    b.lineWidth = Math.max(1.6, W * 0.0022);
    for (let i = 1; i < 3; i++) {
      b.beginPath(); b.moveTo(wx + (ww / 3) * i, wy); b.lineTo(wx + (ww / 3) * i, wy + wh); b.stroke();
    }
    b.beginPath(); b.moveTo(wx, wy + wh * 0.5); b.lineTo(wx + ww, wy + wh * 0.5); b.stroke();
    // 窗台与盆栽
    b.fillStyle = day ? '#c8bea8' : night ? '#2a2232' : '#4a3638';
    b.fillRect(wx - W * 0.012, wy + wh, ww + W * 0.024, H * 0.016);
    b.fillStyle = 'rgba(255,246,226,0.18)';
    b.fillRect(wx - W * 0.012, wy + wh, ww + W * 0.024, 1.6);
    const potX = wx + ww * 0.78, potY = wy + wh - H * 0.004;
    b.fillStyle = night ? '#3a2a24' : '#8a5a3c';
    b.beginPath();
    b.moveTo(potX - H * 0.016, potY);
    b.lineTo(potX + H * 0.016, potY);
    b.lineTo(potX + H * 0.012, potY + H * 0.030);
    b.lineTo(potX - H * 0.012, potY + H * 0.030);
    b.closePath(); b.fill();
    b.strokeStyle = night ? 'rgba(60,90,60,0.55)' : 'rgba(50,94,52,0.70)';
    b.lineWidth = 1.4;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.15 + i * 0.08);
      b.beginPath();
      b.moveTo(potX, potY);
      b.quadraticCurveTo(potX + Math.cos(a) * H * 0.020, potY - H * 0.020, potX + Math.cos(a) * H * 0.034, potY - H * 0.030);
      b.stroke();
      b.fillStyle = night ? 'rgba(24,54,36,0.70)' : 'rgba(42,86,48,0.80)';
      b.beginPath();
      b.ellipse(potX + Math.cos(a) * H * 0.034, potY - H * 0.030, H * 0.010, H * 0.005, a, 0, 6.3);
      b.fill();
    }

    /* ---------- 右侧海报墙：每张都是不同的演出海报 ---------- */
    const poster = (px, py, pw, ph, rot, idx) => {
      b.save();
      b.translate(px + pw / 2, py + ph / 2);
      b.rotate(rot);
      // 投影
      b.fillStyle = 'rgba(0,0,0,0.30)';
      b.fillRect(-pw / 2 + 3, -ph / 2 + 4, pw, ph);
      // 纸面
      const paper = b.createLinearGradient(-pw / 2, -ph / 2, pw / 2, ph / 2);
      paper.addColorStop(0, idx % 2 ? '#e8dcc2' : '#ddd2ba');
      paper.addColorStop(1, idx % 2 ? '#cabfa4' : '#c0b59c');
      b.fillStyle = paper;
      b.fillRect(-pw / 2, -ph / 2, pw, ph);
      // 纸纹
      for (let i = 0; i < 24; i++) {
        b.fillStyle = `rgba(80,60,40,${rand(0.015, 0.05)})`;
        b.fillRect(-pw / 2 + rand(0, pw), -ph / 2 + rand(0, ph), rand(1, 4), rand(1, 2));
      }
      if (idx % 5 === 0) {
        // 排练演出海报：标题与日期
        b.fillStyle = '#9a4038';
        b.fillRect(-pw / 2, -ph / 2, pw, ph * 0.20);
        b.fillStyle = 'rgba(255,244,224,0.90)';
        b.font = `${Math.max(9, pw * 0.10)}px "Noto Serif SC", serif`;
        b.textAlign = 'center';
        b.fillText('夏 夜 音 乐 会', 0, -ph * 0.32);
        b.fillStyle = 'rgba(40,30,26,0.75)';
        b.font = `${Math.max(6, pw * 0.055)}px "Noto Serif SC", serif`;
        b.fillText('草地舞台 · 19:30', 0, -ph * 0.13);
        // 钢琴剪影
        b.fillStyle = 'rgba(30,26,30,0.72)';
        b.beginPath();
        b.moveTo(-pw * 0.30, ph * 0.20);
        b.lineTo(pw * 0.30, ph * 0.20);
        b.lineTo(pw * 0.26, ph * 0.06);
        b.lineTo(-pw * 0.26, ph * 0.06);
        b.closePath(); b.fill();
        b.fillStyle = 'rgba(244,236,214,0.60)';
        for (let k = 0; k < 12; k++) b.fillRect(-pw * 0.24 + k * pw * 0.042, ph * 0.075, 1.4, ph * 0.045);
      } else if (idx % 5 === 1) {
        // 唱片封面：同心圆与光带
        const cx0 = 0, cy0 = -ph * 0.05;
        b.fillStyle = 'rgba(28,32,46,0.90)';
        b.fillRect(-pw / 2, -ph / 2, pw, ph);
        for (let r = 1; r <= 5; r++) {
          b.strokeStyle = `rgba(140,160,200,${0.10 + r * 0.03})`;
          b.lineWidth = 1;
          b.beginPath(); b.arc(cx0, cy0, pw * 0.055 * r, 0, 6.3); b.stroke();
        }
        b.fillStyle = 'rgba(214,170,96,0.75)';
        b.beginPath(); b.arc(cx0, cy0, pw * 0.08, 0, 6.3); b.fill();
        b.fillStyle = 'rgba(20,18,24,0.9)';
        b.beginPath(); b.arc(cx0, cy0, pw * 0.015, 0, 6.3); b.fill();
        b.fillStyle = 'rgba(236,230,214,0.75)';
        b.font = `${Math.max(6, pw * 0.06)}px "Noto Serif SC", serif`;
        b.textAlign = 'center';
        b.fillText('SUMMER NOCTURNE', 0, ph * 0.36);
      } else if (idx % 5 === 2) {
        // 合影：几个剪影人头
        b.fillStyle = '#3e6070';
        b.fillRect(-pw / 2, -ph / 2, pw, ph * 0.55);
        b.fillStyle = 'rgba(255,240,210,0.35)';
        b.beginPath(); b.arc(pw * 0.22, -ph * 0.30, pw * 0.10, 0, 6.3); b.fill();
        b.fillStyle = 'rgba(26,24,30,0.75)';
        for (let k = 0; k < 5; k++) {
          const hx = -pw * 0.30 + k * pw * 0.15;
          const hy = ph * 0.06 - (k % 2) * ph * 0.02;
          b.beginPath(); b.arc(hx, hy, pw * 0.055, 0, 6.3); b.fill();
          b.beginPath();
          b.moveTo(hx - pw * 0.085, ph * 0.28);
          b.quadraticCurveTo(hx, hy + pw * 0.05, hx + pw * 0.085, ph * 0.28);
          b.closePath(); b.fill();
        }
        b.fillStyle = 'rgba(236,226,204,0.75)';
        b.font = `${Math.max(5, pw * 0.05)}px "Noto Serif SC", serif`;
        b.textAlign = 'center';
        b.fillText('音乐社 · 2019', 0, ph * 0.42);
      } else if (idx % 5 === 3) {
        // 琴键与声波
        b.fillStyle = '#2c2836';
        b.fillRect(-pw / 2, -ph / 2, pw, ph);
        b.fillStyle = 'rgba(238,232,216,0.90)';
        b.fillRect(-pw * 0.34, -ph * 0.22, pw * 0.68, ph * 0.28);
        for (let k = 0; k < 14; k++) {
          b.fillStyle = 'rgba(30,26,34,0.85)';
          if (k % 7 !== 2 && k % 7 !== 6) b.fillRect(-pw * 0.34 + k * pw * 0.048, -ph * 0.22, pw * 0.024, ph * 0.16);
        }
        b.strokeStyle = 'rgba(214,170,96,0.55)';
        b.lineWidth = 1;
        for (let k = 0; k < 4; k++) {
          b.beginPath();
          b.arc(0, -ph * 0.08, pw * (0.18 + k * 0.07), -2.2, -0.9);
          b.stroke();
        }
        b.fillStyle = 'rgba(236,230,214,0.70)';
        b.font = `${Math.max(6, pw * 0.055)}px "Noto Serif SC", serif`;
        b.textAlign = 'center';
        b.fillText('PIANO RECITAL', 0, ph * 0.30);
      } else {
        // 手写歌单
        b.fillStyle = 'rgba(238,230,210,0.92)';
        b.fillRect(-pw / 2, -ph / 2, pw, ph);
        b.fillStyle = 'rgba(56,40,30,0.65)';
        b.font = `${Math.max(6, pw * 0.07)}px "Noto Serif SC", serif`;
        b.textAlign = 'left';
        const songs = ['月光', '悲怆 II', '蝉鸣', '夜曲', '未完成'];
        songs.forEach((s, k) => b.fillText(`${k + 1}. ${s}`, -pw * 0.36, -ph * 0.26 + k * ph * 0.13));
        b.strokeStyle = 'rgba(60,46,34,0.30)';
        for (let k = 0; k < 5; k++) {
          b.beginPath();
          b.moveTo(-pw * 0.36, -ph * 0.20 + k * ph * 0.13);
          b.lineTo(pw * 0.34, -ph * 0.20 + k * ph * 0.13);
          b.stroke();
        }
      }
      // 胶带
      b.fillStyle = 'rgba(214,204,176,0.55)';
      b.fillRect(-pw * 0.52, -ph / 2 - 3, pw * 0.16, H * 0.008);
      b.fillRect(pw * 0.36, -ph / 2 - 3, pw * 0.16, H * 0.008);
      b.restore();
    };
    poster(W * 0.395, ceil + H * 0.050, W * 0.125, H * 0.205, -0.025, 0);
    poster(W * 0.530, ceil + H * 0.075, W * 0.095, H * 0.150, 0.030, 1);
    poster(W * 0.636, ceil + H * 0.045, W * 0.115, H * 0.185, -0.018, 2);
    poster(W * 0.760, ceil + H * 0.080, W * 0.090, H * 0.140, 0.040, 3);
    poster(W * 0.855, ceil + H * 0.050, W * 0.105, H * 0.175, -0.030, 4);

    // 白板：排练安排
    const bbx = W * 0.395, bby = ceil + H * 0.275, bbw = W * 0.205, bbh = H * 0.185;
    b.fillStyle = 'rgba(0,0,0,0.22)';
    b.fillRect(bbx + 3, bby + 4, bbw, bbh);
    b.fillStyle = day ? 'rgba(246,244,236,0.94)' : night ? 'rgba(150,148,142,0.30)' : 'rgba(196,192,182,0.48)';
    b.fillRect(bbx, bby, bbw, bbh);
    b.strokeStyle = 'rgba(120,120,120,0.45)';
    b.lineWidth = 1.4;
    b.strokeRect(bbx, bby, bbw, bbh);
    // 白板笔槽
    b.fillStyle = 'rgba(90,88,84,0.55)';
    b.fillRect(bbx - 2, bby + bbh, bbw + 4, H * 0.006);
    // 五线谱与音符
    b.strokeStyle = 'rgba(60,70,90,0.35)';
    b.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) {
      b.beginPath();
      b.moveTo(bbx + bbw * 0.07, bby + bbh * (0.16 + i * 0.036));
      b.lineTo(bbx + bbw * 0.93, bby + bbh * (0.16 + i * 0.036));
      b.stroke();
    }
    for (let i = 0; i < 8; i++) {
      b.fillStyle = 'rgba(70,64,60,0.55)';
      b.beginPath();
      b.ellipse(bbx + bbw * (0.14 + i * 0.10), bby + bbh * (0.17 + (i % 3) * 0.017),
        bbw * 0.015, bbh * 0.012, -0.35, 0, 6.3);
      b.fill();
    }
    // 红色排练时间
    b.fillStyle = 'rgba(176,52,44,0.70)';
    b.font = `${Math.max(7, W * 0.008)}px "Noto Serif SC", serif`;
    b.fillText('周三 19:30 合排', bbx + bbw * 0.08, bby + bbh * 0.58);
    b.fillStyle = 'rgba(48,52,68,0.52)';
    b.fillRect(bbx + bbw * 0.08, bby + bbh * 0.68, bbw * 0.56, 2);
    b.fillRect(bbx + bbw * 0.08, bby + bbh * 0.76, bbw * 0.42, 2);
    b.fillRect(bbx + bbw * 0.08, bby + bbh * 0.84, bbw * 0.64, 2);

    // 墙上的两把木吉他
    const guitar = (gx, gy, gs, rot) => {
      b.save();
      b.translate(gx, gy);
      b.rotate(rot);
      b.scale(gs, gs);
      // 墙面投影
      b.fillStyle = 'rgba(0,0,0,0.16)';
      b.beginPath();
      b.ellipse(W * 0.010, H * 0.020, W * 0.052, H * 0.105, -0.04, 0, 6.3);
      b.fill();
      // 琴身：真正的葫芦形（上小下大，中间收腰）
      const gb = b.createLinearGradient(-W * 0.042, 0, W * 0.044, 0);
      if (night) {
        gb.addColorStop(0, '#2a1812');
        gb.addColorStop(0.45, '#4a2a1a');
        gb.addColorStop(1, '#1e100c');
      } else {
        gb.addColorStop(0, '#7e4a28');
        gb.addColorStop(0.38, '#c08648');
        gb.addColorStop(0.66, '#a86a34');
        gb.addColorStop(1, '#6e3e22');
      }
      b.fillStyle = gb;
      b.beginPath();
      b.moveTo(0, -H * 0.080);
      b.bezierCurveTo(W * 0.036, -H * 0.080, W * 0.044, -H * 0.052, W * 0.032, -H * 0.022);
      b.bezierCurveTo(W * 0.024, -H * 0.006, W * 0.046, H * 0.024, W * 0.040, H * 0.050);
      b.bezierCurveTo(W * 0.032, H * 0.078, -W * 0.032, H * 0.078, -W * 0.040, H * 0.050);
      b.bezierCurveTo(-W * 0.046, H * 0.024, -W * 0.024, -H * 0.006, -W * 0.032, -H * 0.022);
      b.bezierCurveTo(-W * 0.044, -H * 0.052, -W * 0.036, -H * 0.080, 0, -H * 0.080);
      b.closePath(); b.fill();
      // 琴身边缘的亮线
      b.strokeStyle = night ? 'rgba(214,168,112,0.20)' : 'rgba(255,224,170,0.34)';
      b.lineWidth = 1;
      b.stroke();
      // 面板木纹
      b.save();
      b.globalAlpha = 0.20;
      b.strokeStyle = night ? '#120a08' : '#6a3e1e';
      for (let i = 0; i < 9; i++) {
        b.lineWidth = 0.7;
        b.beginPath();
        b.moveTo(-W * 0.030 + i * W * 0.0075, -H * 0.070);
        b.bezierCurveTo(-W * 0.020 + i * W * 0.006, -H * 0.02, -W * 0.024 + i * W * 0.006, H * 0.02, -W * 0.028 + i * W * 0.007, H * 0.070);
        b.stroke();
      }
      b.restore();
      // 音孔与花环
      const soundY = -H * 0.006;
      b.fillStyle = '#0e0806';
      b.beginPath(); b.arc(0, soundY, W * 0.014, 0, 6.3); b.fill();
      b.strokeStyle = night ? 'rgba(210,180,130,0.40)' : 'rgba(246,214,160,0.62)';
      b.lineWidth = 1.2;
      b.beginPath(); b.arc(0, soundY, W * 0.019, 0, 6.3); b.stroke();
      b.strokeStyle = night ? 'rgba(170,130,90,0.30)' : 'rgba(120,72,36,0.45)';
      b.beginPath(); b.arc(0, soundY, W * 0.024, 0, 6.3); b.stroke();
      // 音梁花纹
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.283;
        b.fillStyle = night ? 'rgba(220,190,140,0.18)' : 'rgba(246,222,178,0.35)';
        b.beginPath();
        b.ellipse(Math.cos(a) * W * 0.0215, soundY + Math.sin(a) * W * 0.0215, W * 0.0024, W * 0.0012, a, 0, 6.3);
        b.fill();
      }
      // 护板
      b.fillStyle = night ? 'rgba(18,10,8,0.55)' : 'rgba(92,48,24,0.45)';
      b.beginPath();
      b.moveTo(W * 0.014, -H * 0.030);
      b.quadraticCurveTo(W * 0.040, -H * 0.004, W * 0.030, H * 0.030);
      b.quadraticCurveTo(W * 0.012, H * 0.012, W * 0.010, -H * 0.020);
      b.closePath(); b.fill();
      // 琴桥
      b.fillStyle = night ? '#1c100c' : '#4a2a14';
      b.fillRect(-W * 0.017, H * 0.026, W * 0.034, H * 0.008);
      b.fillStyle = 'rgba(240,226,198,0.55)';
      b.fillRect(-W * 0.012, H * 0.028, W * 0.024, H * 0.002);
      // 指板
      b.fillStyle = night ? '#180e0a' : '#3a2012';
      b.beginPath();
      b.moveTo(-W * 0.011, -H * 0.070);
      b.lineTo(W * 0.011, -H * 0.070);
      b.lineTo(W * 0.009, -H * 0.192);
      b.lineTo(-W * 0.009, -H * 0.192);
      b.closePath(); b.fill();
      // 品丝
      for (let i = 0; i < 8; i++) {
        const fy = -H * 0.082 - i * H * 0.0125;
        b.strokeStyle = 'rgba(220,210,190,0.45)';
        b.lineWidth = 0.8;
        b.beginPath();
        b.moveTo(-W * 0.0105, fy); b.lineTo(W * 0.0105, fy);
        b.stroke();
      }
      // 琴弦与白色弦枕
      b.strokeStyle = 'rgba(240,234,214,0.55)';
      b.lineWidth = 0.6;
      for (let i = 0; i < 6; i++) {
        b.beginPath();
        b.moveTo(-W * 0.008 + i * W * 0.0032, -H * 0.193);
        b.lineTo(-W * 0.009 + i * W * 0.0036, H * 0.029);
        b.stroke();
      }
      b.fillStyle = 'rgba(246,240,224,0.8)';
      b.fillRect(-W * 0.010, -H * 0.193, W * 0.020, H * 0.004);
      // 琴头与弦钮
      b.fillStyle = night ? '#2a1812' : '#6a4226';
      b.beginPath();
      b.moveTo(-W * 0.010, -H * 0.192);
      b.lineTo(W * 0.010, -H * 0.192);
      b.lineTo(W * 0.008, -H * 0.228);
      b.quadraticCurveTo(0, -H * 0.238, -W * 0.008, -H * 0.228);
      b.closePath(); b.fill();
      for (let i = 0; i < 3; i++) {
        for (const side of [-1, 1]) {
          b.fillStyle = 'rgba(226,206,160,0.75)';
          b.beginPath();
          b.arc(side * W * 0.011, -H * (0.198 + i * 0.010), W * 0.0026, 0, 6.3);
          b.fill();
          b.strokeStyle = 'rgba(226,206,160,0.55)';
          b.lineWidth = 0.7;
          b.beginPath();
          b.moveTo(side * W * 0.009, -H * (0.198 + i * 0.010));
          b.lineTo(side * W * 0.014, -H * (0.198 + i * 0.010));
          b.stroke();
        }
      }
      // 挂钉
      b.fillStyle = 'rgba(60,54,50,0.75)';
      b.fillRect(-W * 0.016, -H * 0.246, W * 0.032, H * 0.007);
      b.fillStyle = 'rgba(255,240,214,0.18)';
      b.fillRect(-W * 0.016, -H * 0.246, W * 0.032, 1);
      b.restore();
    };
    guitar(W * 0.775, ceil + H * 0.235, 1.0, 0.10);
    guitar(W * 0.865, ceil + H * 0.225, 0.92, -0.12);

    /* ---------- 角落的立式钢琴 ---------- */
    const px = W * 0.705, pw = W * 0.145, ptop = horizon - H * 0.235;
    // 墙上的投影与琴脚阴影
    b.fillStyle = 'rgba(0,0,0,0.18)';
    b.beginPath();
    b.ellipse(px + pw * 1.02, horizon - H * 0.060, pw * 0.22, H * 0.150, 0, 0, 6.3);
    b.fill();
    b.fillStyle = 'rgba(0,0,0,0.30)';
    b.beginPath();
    b.ellipse(px + pw * 0.52, horizon + H * 0.006, pw * 0.70, H * 0.020, 0, 0, 6.3);
    b.fill();
    const bodyG = b.createLinearGradient(px, 0, px + pw, 0);
    bodyG.addColorStop(0, night ? '#0a0812' : '#1a141c');
    bodyG.addColorStop(0.30, night ? '#0c0814' : '#231a22');
    bodyG.addColorStop(0.68, '#0a060e');
    bodyG.addColorStop(1, '#040206');
    b.fillStyle = bodyG;
    b.fillRect(px, ptop, pw, horizon - ptop);
    // 顶盖线脚与两侧立梃
    b.fillStyle = 'rgba(255,240,214,0.12)';
    b.fillRect(px - W * 0.002, ptop - H * 0.006, pw + W * 0.004, H * 0.008);
    b.fillStyle = 'rgba(0,0,0,0.5)';
    b.fillRect(px - W * 0.002, ptop - H * 0.001, pw + W * 0.004, 1.4);
    b.fillStyle = 'rgba(255,236,204,0.07)';
    b.fillRect(px + W * 0.003, ptop, 1.6, horizon - ptop);
    b.fillRect(px + pw - W * 0.005, ptop, 1.2, horizon - ptop);
    // 琴盖与谱架
    b.fillStyle = '#08050c';
    b.fillRect(px + pw * 0.10, ptop + H * 0.025, pw * 0.80, H * 0.006);
    // 谱架上的乐谱：五线谱、音符与页边阴影
    const shX = px + pw * 0.17, shY = ptop + H * 0.030, shW = pw * 0.66, shH = H * 0.050;
    b.save();
    b.translate(shX + shW * 0.5, shY + shH * 0.5);
    b.rotate(-0.035);
    b.fillStyle = 'rgba(0,0,0,0.35)';
    b.fillRect(-shW * 0.5 + 3, -shH * 0.5 + 4, shW, shH);
    const paperG = b.createLinearGradient(0, -shH * 0.5, 0, shH * 0.5);
    paperG.addColorStop(0, night ? 'rgba(206,198,180,0.65)' : 'rgba(246,240,222,0.94)');
    paperG.addColorStop(1, night ? 'rgba(168,160,146,0.55)' : 'rgba(222,212,190,0.92)');
    b.fillStyle = paperG;
    b.fillRect(-shW * 0.5, -shH * 0.5, shW, shH);
    // 中缝
    b.strokeStyle = 'rgba(70,58,44,0.20)';
    b.lineWidth = 1;
    b.beginPath(); b.moveTo(0, -shH * 0.5); b.lineTo(0, shH * 0.5); b.stroke();
    // 两侧五线谱
    for (const side of [-1, 1]) {
      const sx0 = side < 0 ? -shW * 0.44 : shW * 0.06;
      for (let l = 0; l < 5; l++) {
        b.strokeStyle = night ? 'rgba(62,58,54,0.45)' : 'rgba(82,72,60,0.50)';
        b.lineWidth = 0.6;
        b.beginPath();
        b.moveTo(sx0, -shH * 0.16 + l * shH * 0.055);
        b.lineTo(sx0 + shW * 0.38, -shH * 0.16 + l * shH * 0.055);
        b.stroke();
      }
      for (let n = 0; n < 6; n++) {
        const nx = sx0 + shW * (0.06 + n * 0.052);
        const ny = -shH * 0.16 + shH * 0.055 * (1 + (n * 3) % 4);
        b.fillStyle = 'rgba(40,34,30,0.70)';
        b.beginPath();
        b.ellipse(nx, ny, Math.max(1, shW * 0.012), Math.max(1, shH * 0.022), -0.4, 0, 6.3);
        b.fill();
        b.strokeStyle = 'rgba(40,34,30,0.60)';
        b.lineWidth = 0.7;
        b.beginPath(); b.moveTo(nx + shW * 0.010, ny); b.lineTo(nx + shW * 0.010, ny - shH * 0.10); b.stroke();
      }
    }
    b.restore();
    // 琴键：白键纵向渐变，黑键略长，上沿防尘毡、下沿键唇
    const ky = ptop + H * 0.112;
    const kx0 = px + pw * 0.10, kw = pw * 0.80, kh = H * 0.014;
    b.fillStyle = 'rgba(0,0,0,0.45)';
    b.fillRect(kx0 - W * 0.002, ky - H * 0.004, kw + W * 0.004, H * 0.004);
    const keyG = b.createLinearGradient(0, ky, 0, ky + kh);
    keyG.addColorStop(0, night ? '#d9d1bc' : '#efe7d2');
    keyG.addColorStop(0.72, night ? '#b8ad98' : '#d0c6ae');
    keyG.addColorStop(1, night ? '#8f8574' : '#a99f8a');
    b.fillStyle = keyG;
    b.fillRect(kx0, ky, kw, kh);
    for (let i = 0; i <= 16; i++) {
      const kx = kx0 + i * (kw / 16);
      b.strokeStyle = 'rgba(48,36,28,0.42)';
      b.lineWidth = 0.7;
      b.beginPath(); b.moveTo(kx, ky); b.lineTo(kx, ky + kh); b.stroke();
      if (i < 16) {
        b.fillStyle = 'rgba(255,252,240,0.16)';
        b.fillRect(kx + 1, ky + 0.6, kw / 16 - 2, H * 0.0018);
      }
    }
    for (let i = 0; i < 16; i++) {
      if (i % 7 === 2 || i % 7 === 6) continue;
      const kx = kx0 + i * (kw / 16) + (kw / 16) * 0.64;
      b.fillStyle = '#0a0710';
      b.fillRect(kx, ky, (kw / 16) * 0.34, kh * 0.62);
      b.fillStyle = 'rgba(140,132,150,0.16)';
      b.fillRect(kx + 0.5, ky + 0.5, (kw / 16) * 0.30, 1);
    }
    b.fillStyle = 'rgba(26,18,22,0.55)';
    b.fillRect(kx0, ky - H * 0.003, kw, H * 0.003);
    b.fillStyle = '#08050c';
    b.fillRect(kx0, ky + kh, kw, H * 0.009);
    b.fillStyle = 'rgba(255,236,204,0.10)';
    b.fillRect(kx0, ky + kh, kw, 1);
    // 键盘两端侧木
    b.fillStyle = night ? '#0c0812' : '#1c141c';
    b.fillRect(kx0 - W * 0.006, ky - H * 0.006, W * 0.006, kh + H * 0.013);
    b.fillRect(kx0 + kw, ky - H * 0.006, W * 0.006, kh + H * 0.013);
    // 踏板连杆、踏板板与三枚铜踏板
    const plx = px + pw * 0.52;
    const lyreG = b.createLinearGradient(plx - W * 0.004, 0, plx + W * 0.004, 0);
    lyreG.addColorStop(0, '#0a070c');
    lyreG.addColorStop(0.5, night ? '#1c141c' : '#2a2026');
    lyreG.addColorStop(1, '#080509');
    b.fillStyle = lyreG;
    b.fillRect(plx - W * 0.004, horizon - H * 0.086, W * 0.008, H * 0.078);
    b.beginPath();
    b.moveTo(plx - pw * 0.10, horizon - H * 0.010);
    b.lineTo(plx + pw * 0.10, horizon - H * 0.010);
    b.lineTo(plx + pw * 0.09, horizon - H * 0.001);
    b.lineTo(plx - pw * 0.09, horizon - H * 0.001);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(255,236,204,0.08)';
    b.fillRect(plx - pw * 0.10, horizon - H * 0.010, pw * 0.20, 1);
    for (let i = 0; i < 3; i++) {
      const pbx = plx - pw * 0.07 + i * pw * 0.06;
      b.fillStyle = 'rgba(0,0,0,0.40)';
      b.beginPath(); b.ellipse(pbx + pw * 0.010, horizon - H * 0.0005, pw * 0.024, H * 0.0020, 0, 0, 6.3); b.fill();
      const brass = b.createLinearGradient(0, horizon - H * 0.0075, 0, horizon - H * 0.0015);
      brass.addColorStop(0, night ? 'rgba(214,182,120,0.90)' : 'rgba(232,202,138,0.96)');
      brass.addColorStop(1, night ? 'rgba(118,90,50,0.90)' : 'rgba(148,112,62,0.96)');
      b.fillStyle = brass;
      b.beginPath();
      b.ellipse(pbx + pw * 0.010, horizon - H * 0.0048, pw * 0.022, H * 0.0028, 0, 0, 6.3);
      b.fill();
      b.fillStyle = 'rgba(255,244,214,0.32)';
      b.beginPath();
      b.ellipse(pbx + pw * 0.008, horizon - H * 0.0058, pw * 0.010, H * 0.0010, 0, 0, 6.3);
      b.fill();
    }

    // 谱架（独奏）
    const stx = W * 0.915;
    b.strokeStyle = night ? 'rgba(130,126,140,0.55)' : 'rgba(50,42,42,0.70)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(stx, horizon);
    b.lineTo(stx - W * 0.004, horizon - H * 0.175);
    b.lineTo(stx + W * 0.020, horizon - H * 0.175);
    b.lineTo(stx + W * 0.024, horizon);
    b.stroke();
    b.fillStyle = night ? 'rgba(210,206,190,0.45)' : 'rgba(238,232,216,0.75)';
    b.beginPath();
    b.moveTo(stx - W * 0.022, horizon - H * 0.175);
    b.lineTo(stx + W * 0.040, horizon - H * 0.185);
    b.lineTo(stx + W * 0.040, horizon - H * 0.135);
    b.lineTo(stx - W * 0.022, horizon - H * 0.125);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(60,46,34,0.35)';
    b.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) {
      b.beginPath();
      b.moveTo(stx - W * 0.014, horizon - H * (0.168 - i * 0.006));
      b.lineTo(stx + W * 0.030, horizon - H * (0.176 - i * 0.006));
      b.stroke();
    }

    // 窗光斜切
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < 3; layer++) {
      const beam = b.createLinearGradient(wx + ww * 0.25, wy, W * 0.52, H);
      beam.addColorStop(0, hexA(p2.glow, (day ? 0.10 : 0.075) * (1 - layer * 0.22)));
      beam.addColorStop(0.55, hexA(p2.glow, (day ? 0.04 : 0.03) * (1 - layer * 0.2)));
      beam.addColorStop(1, hexA(p2.glow, 0));
      b.fillStyle = beam;
      const spread = layer * W * 0.02;
      b.beginPath();
      b.moveTo(wx + ww * 0.18 - spread, wy);
      b.lineTo(wx + ww * 0.86 + spread, wy + wh * 0.16);
      b.lineTo(W * 0.70 + spread, H);
      b.lineTo(W * 0.22 - spread, H);
      b.closePath(); b.fill();
    }
    b.restore();
  }
  drawMusicroom.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    // 木地板
    const fg = b.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, night ? '#221c2a' : day ? '#c4a87c' : '#61483e');
    fg.addColorStop(1, night ? '#120e1a' : day ? '#9c7e58' : '#3e2c2c');
    b.fillStyle = fg;
    b.fillRect(0, horizon, W, H - horizon);
    b.strokeStyle = night ? 'rgba(130,120,140,0.07)' : 'rgba(50,32,24,0.18)';
    b.lineWidth = 1;
    for (let i = 1; i < 9; i++) {
      const yy = horizon + Math.pow(i / 9, 1.45) * (H - horizon);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const xx = rand(-W * 0.1, W * 1.1);
      b.beginPath();
      b.moveTo(W * 0.5 + (xx - W * 0.5) * 0.75, horizon);
      b.lineTo(xx, H);
      b.stroke();
    }
    // 木纹
    for (let i = 0; i < 50; i++) {
      const yy = rand(horizon, H);
      b.strokeStyle = `rgba(20,10,14,${rand(0.03, 0.10)})`;
      b.beginPath(); b.moveTo(rand(0, W), yy); b.lineTo(rand(0, W), yy + rand(-3, 3)); b.stroke();
    }

    // 旧地毯
    b.save();
    b.fillStyle = night ? 'rgba(58,32,38,0.45)' : day ? 'rgba(120,74,60,0.30)' : 'rgba(82,44,46,0.40)';
    b.beginPath(); b.ellipse(W * 0.46, H * 0.86, W * 0.30, H * 0.065, 0, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(214,180,120,0.14)';
    b.lineWidth = 1.2;
    b.beginPath(); b.ellipse(W * 0.46, H * 0.86, W * 0.26, H * 0.050, 0, 0, 6.3); b.stroke();
    b.restore();

    // 长桌
    const tx = W * 0.145, tw = W * 0.575, ty = horizon + H * 0.095;
    b.fillStyle = 'rgba(0,0,0,0.28)';
    b.beginPath(); b.ellipse(tx + tw / 2, ty + H * 0.135, tw * 0.53, H * 0.030, 0, 0, 6.3); b.fill();
    const tleg = day ? '#7a5836' : night ? '#211616' : '#4a3028';
    b.fillStyle = tleg;
    b.fillRect(tx + W * 0.018, ty + H * 0.038, W * 0.012, H * 0.095);
    b.fillRect(tx + tw - W * 0.030, ty + H * 0.038, W * 0.012, H * 0.095);
    b.fillRect(tx + tw * 0.48, ty + H * 0.038, W * 0.010, H * 0.090);
    // 桌面：厚度与受光
    const topG = b.createLinearGradient(0, ty, 0, ty + H * 0.042);
    topG.addColorStop(0, day ? '#c8a276' : night ? '#33262a' : '#6a4a3c');
    topG.addColorStop(0.55, day ? '#b48e62' : night ? '#281c20' : '#553a30');
    topG.addColorStop(1, day ? '#8a6844' : night ? '#1a1216' : '#3a2622');
    b.fillStyle = topG;
    b.fillRect(tx, ty, tw, H * 0.042);
    b.fillStyle = 'rgba(255,246,226,0.18)';
    b.fillRect(tx, ty, tw, 2);
    // 桌面木纹
    b.strokeStyle = 'rgba(30,16,12,0.14)';
    b.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const yy = ty + rand(0.08, 0.88) * H * 0.042;
      b.beginPath(); b.moveTo(tx + rand(0, 0.2) * tw, yy); b.lineTo(tx + rand(0.7, 1) * tw, yy + rand(-1, 1)); b.stroke();
    }
    // 桌上的谱本、铅笔、水瓶与节拍器
    for (let i = 0; i < 6; i++) {
      const sx = tx + tw * (0.06 + i * 0.16);
      b.fillStyle = 'rgba(0,0,0,0.18)';
      b.fillRect(sx + 2, ty - H * 0.004 + 2, W * 0.070, H * 0.014);
      b.fillStyle = i % 3 === 0 ? 'rgba(226,214,188,0.85)' : 'rgba(238,230,210,0.80)';
      b.save();
      b.translate(sx, ty - H * 0.006);
      b.rotate(rand(-0.14, 0.14));
      b.fillRect(0, 0, W * 0.070, H * 0.012);
      b.strokeStyle = 'rgba(60,46,34,0.35)';
      b.lineWidth = 0.7;
      for (let k = 0; k < 4; k++) b.beginPath(), b.moveTo(2, 2 + k * 2), b.lineTo(W * 0.066, 2 + k * 2), b.stroke();
      b.restore();
    }
    // 铅笔
    b.save();
    b.translate(tx + tw * 0.52, ty + H * 0.018);
    b.rotate(0.22);
    b.fillStyle = '#c8a25c';
    b.fillRect(0, 0, W * 0.055, 2.4);
    b.fillStyle = '#2a2626';
    b.fillRect(W * 0.055, 0.6, W * 0.010, 1.2);
    b.restore();
    // 水瓶
    b.fillStyle = 'rgba(210,230,232,0.35)';
    b.fillRect(tx + tw * 0.72, ty - H * 0.028, W * 0.014, H * 0.028);
    b.fillStyle = 'rgba(255,250,238,0.28)';
    b.fillRect(tx + tw * 0.72 + 2, ty - H * 0.027, 2, H * 0.026);
    b.fillStyle = 'rgba(90,110,120,0.55)';
    b.fillRect(tx + tw * 0.72, ty - H * 0.031, W * 0.014, H * 0.004);
    // 节拍器
    b.fillStyle = night ? '#2a1e1a' : '#6a4a2e';
    b.beginPath();
    b.moveTo(tx + tw * 0.86, ty);
    b.lineTo(tx + tw * 0.855, ty - H * 0.045);
    b.lineTo(tx + tw * 0.885, ty - H * 0.045);
    b.lineTo(tx + tw * 0.880, ty);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(220,196,150,0.40)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(tx + tw * 0.868, ty - H * 0.006);
    b.lineTo(tx + tw * 0.860, ty - H * 0.040);
    b.stroke();

    // 长凳与椅子
    for (let i = 0; i < 4; i++) {
      const cx = tx + tw * (0.10 + i * 0.255);
      const chY = ty + H * 0.105;
      b.fillStyle = 'rgba(0,0,0,0.25)';
      b.beginPath(); b.ellipse(cx + W * 0.045, chY + H * 0.062, W * 0.050, H * 0.012, 0, 0, 6.3); b.fill();
      b.fillStyle = day ? '#9a7650' : night ? '#241a1e' : '#4e362e';
      b.fillRect(cx, chY, W * 0.085, H * 0.012);
      b.fillStyle = day ? '#8a6642' : night ? '#1e1518' : '#422c26';
      b.fillRect(cx + W * 0.006, chY + H * 0.012, W * 0.007, H * 0.060);
      b.fillRect(cx + W * 0.073, chY + H * 0.012, W * 0.007, H * 0.060);
      // 椅背横杆
      b.fillRect(cx + W * 0.006, chY - H * 0.010, W * 0.074, H * 0.006);
      b.fillRect(cx + W * 0.010, chY - H * 0.030, W * 0.066, H * 0.005);
      b.fillRect(cx + W * 0.006, chY - H * 0.030, W * 0.005, H * 0.032);
      b.fillRect(cx + W * 0.074, chY - H * 0.030, W * 0.005, H * 0.032);
    }

    // 音箱与线缆
    b.fillStyle = night ? '#121018' : '#2e2a30';
    b.fillRect(W * 0.79, horizon + H * 0.085, W * 0.105, H * 0.185);
    b.fillStyle = 'rgba(120,120,140,0.22)';
    b.fillRect(W * 0.802, horizon + H * 0.100, W * 0.080, H * 0.035);
    b.fillStyle = 'rgba(60,60,70,0.55)';
    b.beginPath(); b.arc(W * 0.842, horizon + H * 0.205, W * 0.034, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(18,16,22,0.9)';
    b.beginPath(); b.arc(W * 0.842, horizon + H * 0.205, W * 0.024, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(20,16,20,0.55)';
    b.lineWidth = 2.4;
    b.beginPath();
    b.moveTo(W * 0.79, horizon + H * 0.265);
    b.bezierCurveTo(W * 0.72, H * 0.92, W * 0.62, H * 0.96, W * 0.55, H * 0.93);
    b.stroke();
    // 吉他盒靠在墙边
    b.save();
    b.translate(W * 0.10, horizon + H * 0.155);
    b.rotate(-0.10);
    b.fillStyle = night ? '#1c1414' : '#3a2a26';
    b.beginPath(); b.ellipse(0, 0, W * 0.058, H * 0.105, 0, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(190,150,110,0.22)';
    b.lineWidth = 1.2;
    b.beginPath(); b.ellipse(0, 0, W * 0.050, H * 0.095, 0, 0, 6.3); b.stroke();
    b.fillStyle = 'rgba(200,180,140,0.38)';
    b.fillRect(-W * 0.004, -H * 0.055, W * 0.008, H * 0.020);
    b.restore();

    // 窗光落在地板
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < 3; layer++) {
      const g = b.createLinearGradient(W * 0.08, horizon, W * 0.44, H);
      g.addColorStop(0, hexA(p2.glow, (day ? 0.12 : 0.08) * (1 - layer * 0.22)));
      g.addColorStop(1, hexA(p2.glow, 0));
      b.fillStyle = g;
      const spread = layer * W * 0.018;
      b.beginPath();
      b.moveTo(W * 0.04 - spread, horizon);
      b.lineTo(W * 0.34 + spread, horizon);
      b.lineTo(W * 0.52 + spread, H);
      b.lineTo(W * 0.10 - spread, H);
      b.closePath(); b.fill();
    }
    b.restore();
  };

  /* ---------- 场景：后山钟楼 ---------- */
  function drawBelltower(b, p, horizon) {
    const night = state.time !== 'day';
    const day = state.time === 'day';
    const p2 = PALETTES[state.time] || PALETTES.night;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    /* 远山：两层山脊，压低对比，留出城市光海 */
    const ridgeA = b.createLinearGradient(0, horizon - H * 0.20, 0, horizon);
    ridgeA.addColorStop(0, night ? '#141426' : '#4c5460');
    ridgeA.addColorStop(1, night ? '#1e2034' : '#5c6470');
    b.fillStyle = ridgeA;
    b.beginPath();
    b.moveTo(0, horizon);
    b.lineTo(0, horizon - H * 0.115);
    b.quadraticCurveTo(W * 0.09, horizon - H * 0.145, W * 0.17, horizon - H * 0.098);
    b.quadraticCurveTo(W * 0.27, horizon - H * 0.052, W * 0.37, horizon - H * 0.088);
    b.quadraticCurveTo(W * 0.48, horizon - H * 0.128, W * 0.58, horizon - H * 0.070);
    b.quadraticCurveTo(W * 0.70, horizon - H * 0.030, W * 0.82, horizon - H * 0.062);
    b.quadraticCurveTo(W * 0.92, horizon - H * 0.090, W, horizon - H * 0.058);
    b.lineTo(W, horizon);
    b.closePath(); b.fill();
    // 山脊受光的一线
    b.strokeStyle = night ? 'rgba(150,170,210,0.10)' : 'rgba(238,240,232,0.16)';
    b.lineWidth = 1.2;
    b.beginPath();
    b.moveTo(0, horizon - H * 0.112);
    b.quadraticCurveTo(W * 0.09, horizon - H * 0.142, W * 0.17, horizon - H * 0.095);
    b.quadraticCurveTo(W * 0.27, horizon - H * 0.049, W * 0.37, horizon - H * 0.085);
    b.quadraticCurveTo(W * 0.48, horizon - H * 0.125, W * 0.58, horizon - H * 0.067);
    b.stroke();

    // 近一层山脊（更暗，托住钟楼）
    b.fillStyle = night ? '#0d1420' : '#384a44';
    b.beginPath();
    b.moveTo(0, horizon);
    b.lineTo(0, horizon - H * 0.040);
    b.quadraticCurveTo(W * 0.14, horizon - H * 0.078, W * 0.30, horizon - H * 0.036);
    b.quadraticCurveTo(W * 0.48, horizon - H * 0.004, W * 0.66, horizon - H * 0.032);
    b.quadraticCurveTo(W * 0.84, horizon - H * 0.064, W, horizon - H * 0.028);
    b.lineTo(W, horizon);
    b.closePath(); b.fill();

    /* 城市灯海：成片的暖光，稀疏的冷光，铺在山脚 */
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let c = 0; c < 9; c++) {
      const cx0 = W * (0.05 + c * 0.112) + rand(-8, 8);
      const cy0 = horizon - H * rand(0.005, 0.028);
      const cw = W * rand(0.03, 0.075), chh = H * rand(0.008, 0.026);
      const cluster = b.createRadialGradient(cx0, cy0, 0, cx0, cy0, cw);
      cluster.addColorStop(0, 'rgba(255,186,116,0.16)');
      cluster.addColorStop(0.55, 'rgba(255,168,104,0.05)');
      cluster.addColorStop(1, 'rgba(255,168,104,0)');
      b.fillStyle = cluster;
      b.fillRect(cx0 - cw, cy0 - chh, cw * 2, chh * 2);
      for (let i = 0; i < 34; i++) {
        const lx = cx0 + rand(-cw * 0.75, cw * 0.75);
        const ly = cy0 + rand(-chh * 0.75, chh * 0.55);
        const warm = perm(c * 40 + i, 3) > 0.18;
        b.fillStyle = warm
          ? `rgba(255,${186 + Math.floor(perm(i, 7) * 40)},${120 + Math.floor(perm(i, 9) * 40)},${rand(0.18, 0.55)})`
          : `rgba(190,220,255,${rand(0.10, 0.30)})`;
        b.fillRect(lx, ly, rand(1, 2.2), rand(0.8, 1.8));
      }
    }
    // 远处楼体的窗格：两三栋，点到为止
    for (let k = 0; k < 3; k++) {
      const bx0 = W * (0.10 + k * 0.30) + rand(-20, 20);
      const bw = W * rand(0.020, 0.034), bh = H * rand(0.030, 0.052);
      const by0 = horizon - bh - H * 0.010;
      b.fillStyle = 'rgba(10,12,24,0.55)';
      b.fillRect(bx0, by0, bw, bh);
      for (let r = 0; r < 4; r++) {
        for (let cc = 0; cc < 4; cc++) {
          if (perm(k * 30 + r * 4 + cc, 11) > 0.55) continue;
          b.fillStyle = `rgba(255,${200 + Math.floor(perm(r, cc) * 30)},140,${rand(0.18, 0.45)})`;
          b.fillRect(bx0 + bw * (0.12 + cc * 0.21), by0 + bh * (0.10 + r * 0.21), bw * 0.11, bh * 0.10);
        }
      }
    }
    // 光海上的薄雾
    const haze = b.createLinearGradient(0, horizon - H * 0.10, 0, horizon);
    haze.addColorStop(0, 'rgba(255,168,110,0)');
    haze.addColorStop(0.7, 'rgba(255,172,120,0.08)');
    haze.addColorStop(1, 'rgba(255,186,132,0.15)');
    b.fillStyle = haze;
    b.fillRect(0, horizon - H * 0.10, W, H * 0.10);
    b.restore();

    /* 后山山体 */
    const hill = b.createLinearGradient(0, horizon - H * 0.12, 0, horizon);
    hill.addColorStop(0, night ? '#121c22' : '#2c3c30');
    hill.addColorStop(1, night ? '#0b1216' : '#1c2a22');
    b.fillStyle = hill;
    b.beginPath();
    b.moveTo(0, horizon);
    b.quadraticCurveTo(W * 0.18, horizon - H * 0.135, W * 0.40, horizon - H * 0.045);
    b.quadraticCurveTo(W * 0.62, horizon - H * 0.090, W * 0.80, horizon - H * 0.028);
    b.quadraticCurveTo(W * 0.92, horizon - H * 0.055, W, horizon - H * 0.018);
    b.lineTo(W, horizon);
    b.closePath(); b.fill();
    // 山坡上的树影（避开塔身与右侧旋梯）
    for (let i = 0; i < 22; i++) {
      const side = i % 2;
      const tx0 = side ? W * rand(0.70, 1.06) : W * rand(-0.06, 0.36);
      const ty0 = horizon - H * rand(0.02, 0.115);
      drawCamphor(b, tx0, ty0, H * rand(0.10, 0.21),
        'rgba(7,12,14,0.88)', 'rgba(170,196,226,0.07)', rand(-1, 1), side ? -1 : 1);
    }
    // 山脚灌木
    for (let i = 0; i < 26; i++) {
      const bx0 = rand(0, W);
      if (bx0 > W * 0.40 && bx0 < W * 0.70) continue;
      const by0 = horizon - rand(0, H * 0.018);
      b.fillStyle = `rgba(8,14,12,${rand(0.5, 0.85)})`;
      b.beginPath();
      b.ellipse(bx0, by0, rand(10, 30), rand(4, 10), 0, 0, 6.3);
      b.fill();
    }

    /* ---------- 废弃钟楼 ---------- */
    const tw = W * 0.168, th = H * 0.575;
    const tx = W * 0.505;
    const ty = horizon - th + H * 0.035;
    const bw = tw, bh = th;
    const stone = night ? '#5a4a44' : '#a89a84';

    // 落在山上的塔影
    b.fillStyle = 'rgba(0,0,0,0.28)';
    b.beginPath();
    b.ellipse(tx + tw * 0.52, horizon - H * 0.004, tw * 0.80, H * 0.020, 0, 0, 6.3);
    b.fill();

    // 基座（略宽，压住地面）
    const plinthH = H * 0.032;
    const plinthW = tw * 1.22;
    const plinthG = b.createLinearGradient(tx - tw * 0.11, 0, tx - tw * 0.11 + plinthW, 0);
    plinthG.addColorStop(0, night ? '#241c1c' : '#6a6050');
    plinthG.addColorStop(0.5, night ? '#3a2e2c' : '#8c8070');
    plinthG.addColorStop(1, night ? '#1c1616' : '#5c5448');
    b.fillStyle = plinthG;
    b.fillRect(tx - tw * 0.11, horizon - plinthH, plinthW, plinthH);
    // 基座石块分缝
    b.strokeStyle = 'rgba(10,8,10,0.28)';
    b.lineWidth = 0.9;
    for (let i = 1; i < 8; i++) {
      const xx = tx - tw * 0.11 + (plinthW / 8) * i;
      b.beginPath(); b.moveTo(xx, horizon - plinthH); b.lineTo(xx, horizon); b.stroke();
    }
    b.beginPath();
    b.moveTo(tx - tw * 0.11, horizon - plinthH * 0.55);
    b.lineTo(tx - tw * 0.11 + plinthW, horizon - plinthH * 0.55);
    b.stroke();
    b.fillStyle = 'rgba(255,244,220,0.06)';
    b.fillRect(tx - tw * 0.11, horizon - plinthH, plinthW, 1.4);
    // 基座爬山虎
    drawIvy(b, tx - tw * 0.06, horizon - plinthH * 0.9, tw * 0.16, plinthH * 1.2,
      'rgba(9,16,12,0.85)', 'rgba(180,204,240,0.08)', 1.1);

    // 塔身砖墙
    const brickG = b.createLinearGradient(tx, 0, tx + bw, 0);
    brickG.addColorStop(0, night ? '#38242a' : '#8a5a4c');
    brickG.addColorStop(0.18, night ? '#4c2e34' : '#a86a56');
    brickG.addColorStop(0.55, night ? '#432a30' : '#985f50');
    brickG.addColorStop(0.86, night ? '#331f26' : '#7a4a40');
    brickG.addColorStop(1, night ? '#22141a' : '#5e3830');
    b.fillStyle = brickG;
    b.fillRect(tx, ty, bw, bh);
    // 砖缝与砖块明暗
    b.save();
    b.beginPath(); b.rect(tx, ty, bw, bh); b.clip();
    const rows = 86;
    const rowH = bh / rows;
    for (let row = 0; row < rows; row++) {
      const yy = ty + row * rowH;
      for (let col = -1; col < 11; col++) {
        const off = (row % 2) * 0.5;
        const xx = tx + (col + off) * (bw / 11);
        const v = perm(row * 13 + col, 5);
        if (v > 0.72) {
          b.fillStyle = `rgba(232,206,188,${0.02 + (v - 0.72) * 0.22})`;
          b.fillRect(xx + 0.6, yy + 0.5, bw / 11 - 1.2, rowH - 1);
        } else if (v < 0.16) {
          b.fillStyle = `rgba(0,0,0,${0.04 + (0.16 - v) * 0.3})`;
          b.fillRect(xx + 0.6, yy + 0.5, bw / 11 - 1.2, rowH - 1);
        }
      }
      b.strokeStyle = 'rgba(10,6,10,0.30)';
      b.lineWidth = 0.7;
      b.beginPath(); b.moveTo(tx, yy); b.lineTo(tx + bw, yy); b.stroke();
    }
    for (let row = 0; row < rows; row++) {
      const yy = ty + row * rowH;
      const off = (row % 2) * 0.5;
      b.strokeStyle = 'rgba(10,6,10,0.24)';
      for (let col = 0; col < 12; col++) {
        const xx = tx + (col + off) * (bw / 11);
        b.beginPath(); b.moveTo(xx, yy); b.lineTo(xx, yy + rowH); b.stroke();
      }
    }
    // 角部条石（quoins）
    for (let side = 0; side < 2; side++) {
      const qx = side ? tx + bw - tw * 0.062 : tx;
      for (let i = 0; i < 24; i++) {
        const qy = ty + H * 0.005 + i * (th / 24);
        b.fillStyle = i % 2
          ? (night ? 'rgba(120,104,96,0.20)' : 'rgba(214,204,182,0.35)')
          : (night ? 'rgba(70,58,56,0.16)' : 'rgba(160,148,126,0.22)');
        b.fillRect(qx, qy, tw * 0.062, th / 24 - 1.2);
        b.strokeStyle = 'rgba(10,8,10,0.22)';
        b.lineWidth = 0.7;
        b.strokeRect(qx, qy, tw * 0.062, th / 24 - 1.2);
      }
    }
    // 雨水冲刷的竖痕
    for (let i = 0; i < 18; i++) {
      const sx0 = tx + rand(tw * 0.04, tw * 0.96);
      const sy0 = ty + rand(0, th * 0.22);
      const len = rand(th * 0.10, th * 0.52);
      const streak = b.createLinearGradient(0, sy0, 0, sy0 + len);
      streak.addColorStop(0, 'rgba(10,8,8,0.16)');
      streak.addColorStop(1, 'rgba(10,8,8,0)');
      b.fillStyle = streak;
      b.fillRect(sx0, sy0, rand(1, 3), len);
    }
    // 裂纹
    b.strokeStyle = 'rgba(8,6,8,0.38)';
    b.lineWidth = 0.9;
    for (let c = 0; c < 3; c++) {
      let px0 = tx + rand(tw * 0.12, tw * 0.88);
      let py0 = ty + rand(th * 0.25, th * 0.55);
      b.beginPath(); b.moveTo(px0, py0);
      for (let s = 0; s < 7; s++) {
        px0 += rand(-tw * 0.03, tw * 0.03);
        py0 += rand(th * 0.02, th * 0.06);
        b.lineTo(px0, py0);
      }
      b.stroke();
    }
    // 底部潮气与苔痕
    const moss = b.createLinearGradient(0, horizon - th * 0.18, 0, horizon);
    moss.addColorStop(0, 'rgba(20,40,28,0)');
    moss.addColorStop(1, 'rgba(24,44,30,0.30)');
    b.fillStyle = moss;
    b.fillRect(tx, horizon - th * 0.18, bw, th * 0.18);
    for (let i = 0; i < 30; i++) {
      b.fillStyle = `rgba(40,66,42,${rand(0.06, 0.18)})`;
      b.beginPath();
      b.ellipse(tx + rand(0, tw), horizon - rand(0, th * 0.14), rand(3, 12), rand(2, 5), 0, 0, 6.3);
      b.fill();
    }
    b.restore();

    // 檐口：三层线脚 + 齿饰
    const cornY = ty;
    const cornG = b.createLinearGradient(0, cornY - H * 0.014, 0, cornY + H * 0.012);
    cornG.addColorStop(0, night ? '#6a5a52' : '#c4b8a0');
    cornG.addColorStop(0.6, night ? '#463834' : '#9c8e78');
    cornG.addColorStop(1, night ? '#2a2020' : '#6e6252');
    b.fillStyle = cornG;
    b.fillRect(tx - tw * 0.045, cornY - H * 0.010, bw + tw * 0.090, H * 0.011);
    b.fillStyle = night ? '#3c2e2c' : '#8a7e6a';
    b.fillRect(tx - tw * 0.030, cornY + H * 0.001, bw + tw * 0.060, H * 0.007);
    b.fillStyle = 'rgba(255,240,214,0.10)';
    b.fillRect(tx - tw * 0.045, cornY - H * 0.010, bw + tw * 0.090, 1.3);
    // 齿饰
    for (let i = 0; i < 22; i++) {
      const dx0 = tx - tw * 0.026 + i * ((bw + tw * 0.052) / 22);
      b.fillStyle = night ? 'rgba(90,76,68,0.55)' : 'rgba(196,184,162,0.65)';
      b.fillRect(dx0, cornY - H * 0.004, (bw + tw * 0.052) / 44, H * 0.005);
    }

    // 钟楼层（檐口之上）：四角小柱 + 拱形百叶
    const belfryY = ty - H * 0.070;
    const belfryH = H * 0.074;
    const belfryG = b.createLinearGradient(tx, 0, tx + bw, 0);
    belfryG.addColorStop(0, night ? '#2c2024' : '#7c5448');
    belfryG.addColorStop(0.5, night ? '#3c2a2e' : '#94604f');
    belfryG.addColorStop(1, night ? '#241820' : '#633f36');
    b.fillStyle = belfryG;
    b.fillRect(tx - tw * 0.020, belfryY, bw + tw * 0.040, belfryH);
    // 小柱
    for (let i = 0; i < 5; i++) {
      const px0 = tx - tw * 0.012 + i * ((bw + tw * 0.024) / 4);
      b.fillStyle = night ? 'rgba(118,100,90,0.38)' : 'rgba(220,208,186,0.55)';
      b.fillRect(px0, belfryY, tw * 0.016, belfryH);
      b.fillStyle = 'rgba(0,0,0,0.18)';
      b.fillRect(px0 + tw * 0.016, belfryY, tw * 0.005, belfryH);
    }
    // 百叶拱窗
    for (let i = 0; i < 3; i++) {
      const ax = tx + tw * (0.095 + i * 0.285);
      const aw = tw * 0.155, ah = belfryH * 0.66;
      const ay = belfryY + belfryH * 0.24;
      b.fillStyle = 'rgba(6,6,12,0.92)';
      b.beginPath();
      b.moveTo(ax, ay + ah);
      b.lineTo(ax, ay + ah * 0.28);
      b.quadraticCurveTo(ax + aw * 0.5, ay - ah * 0.30, ax + aw, ay + ah * 0.28);
      b.lineTo(ax + aw, ay + ah);
      b.closePath(); b.fill();
      // 百叶片
      b.strokeStyle = 'rgba(96,80,72,0.42)';
      b.lineWidth = Math.max(0.8, H * 0.0012);
      for (let s = 1; s < 7; s++) {
        const sy0 = ay + ah * (0.12 + s * 0.125);
        b.beginPath(); b.moveTo(ax + 1, sy0); b.lineTo(ax + aw - 1, sy0); b.stroke();
      }
      // 拱券石边
      b.strokeStyle = night ? 'rgba(158,138,120,0.24)' : 'rgba(230,220,198,0.45)';
      b.lineWidth = 1.4;
      b.beginPath();
      b.moveTo(ax, ay + ah);
      b.lineTo(ax, ay + ah * 0.28);
      b.quadraticCurveTo(ax + aw * 0.5, ay - ah * 0.30, ax + aw, ay + ah * 0.28);
      b.lineTo(ax + aw, ay + ah);
      b.stroke();
    }
    // 中间拱窗里挂着一口旧钟（只露轮廓）
    const bellX = tx + tw * 0.375 + tw * 0.078;
    const bellY = belfryY + belfryH * 0.34;
    b.fillStyle = 'rgba(78,64,54,0.75)';
    b.beginPath();
    b.moveTo(bellX - tw * 0.040, bellY + belfryH * 0.30);
    b.quadraticCurveTo(bellX - tw * 0.055, bellY - belfryH * 0.02, bellX - tw * 0.022, bellY - belfryH * 0.13);
    b.quadraticCurveTo(bellX, bellY - belfryH * 0.18, bellX + tw * 0.022, bellY - belfryH * 0.13);
    b.quadraticCurveTo(bellX + tw * 0.055, bellY - belfryH * 0.02, bellX + tw * 0.040, bellY + belfryH * 0.30);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(190,170,140,0.10)';
    b.beginPath();
    b.ellipse(bellX - tw * 0.012, bellY + belfryH * 0.22, tw * 0.020, belfryH * 0.035, -0.2, 0, 6.3);
    b.fill();

    // 屋顶：四坡瓦顶 + 屋脊 + 风向标
    const roofTop = belfryY - H * 0.085;
    const roofEave = belfryY + H * 0.004;
    const roofG = b.createLinearGradient(0, roofTop, 0, roofEave);
    roofG.addColorStop(0, night ? '#1c161e' : '#4a4038');
    roofG.addColorStop(0.55, night ? '#2a2028' : '#5c5044');
    roofG.addColorStop(1, night ? '#161016' : '#3a322a');
    b.fillStyle = roofG;
    b.beginPath();
    b.moveTo(tx - tw * 0.075, roofEave);
    b.lineTo(tx + bw * 0.5, roofTop);
    b.lineTo(tx + bw + tw * 0.075, roofEave);
    b.closePath(); b.fill();
    // 瓦垄
    b.save();
    b.beginPath();
    b.moveTo(tx - tw * 0.075, roofEave);
    b.lineTo(tx + bw * 0.5, roofTop);
    b.lineTo(tx + bw + tw * 0.075, roofEave);
    b.closePath(); b.clip();
    b.strokeStyle = 'rgba(0,0,0,0.28)';
    b.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const x0 = tx - tw * 0.075 + (bw + tw * 0.15) * t;
      b.beginPath();
      b.moveTo(x0, roofEave);
      b.lineTo(tx + bw * 0.5, roofTop);
      b.stroke();
    }
    for (let r = 1; r < 6; r++) {
      const t = r / 6;
      const yy = roofEave - (roofEave - roofTop) * t;
      const half = (bw * 0.5 + tw * 0.075) * (1 - t);
      b.beginPath(); b.moveTo(tx + bw * 0.5 - half, yy); b.lineTo(tx + bw * 0.5 + half, yy); b.stroke();
    }
    b.restore();
    // 屋脊
    b.strokeStyle = night ? 'rgba(96,84,76,0.55)' : 'rgba(180,168,146,0.65)';
    b.lineWidth = Math.max(2, tw * 0.014);
    b.beginPath();
    b.moveTo(tx - tw * 0.075, roofEave);
    b.lineTo(tx + bw * 0.5, roofTop);
    b.lineTo(tx + bw + tw * 0.075, roofEave);
    b.stroke();
    // 檐上受光
    b.fillStyle = night ? 'rgba(168,176,196,0.10)' : 'rgba(255,248,228,0.18)';
    b.beginPath();
    b.moveTo(tx - tw * 0.075, roofEave - 1);
    b.lineTo(tx + bw * 0.5, roofTop);
    b.lineTo(tx + bw + tw * 0.075, roofEave - 1);
    b.lineTo(tx + bw + tw * 0.075, roofEave);
    b.lineTo(tx - tw * 0.075, roofEave);
    b.closePath(); b.fill();

    // 风向标
    b.strokeStyle = 'rgba(120,126,148,0.55)';
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(tx + bw * 0.5, roofTop);
    b.lineTo(tx + bw * 0.5, roofTop - H * 0.052);
    b.stroke();
    b.beginPath();
    b.moveTo(tx + bw * 0.5 - tw * 0.030, roofTop - H * 0.040);
    b.lineTo(tx + bw * 0.5 + tw * 0.030, roofTop - H * 0.040);
    b.stroke();
    b.fillStyle = 'rgba(120,126,148,0.55)';
    b.beginPath();
    b.moveTo(tx + bw * 0.5 + tw * 0.030, roofTop - H * 0.040);
    b.lineTo(tx + bw * 0.5 + tw * 0.018, roofTop - H * 0.046);
    b.lineTo(tx + bw * 0.5 + tw * 0.018, roofTop - H * 0.034);
    b.closePath(); b.fill();

    // 钟面
    const cx = tx + bw * 0.5, cy = ty + th * 0.205, cr = tw * 0.265;
    // 石框
    b.fillStyle = night ? '#3e302c' : '#8c7c66';
    b.beginPath(); b.arc(cx, cy, cr * 1.13, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(255,240,214,0.10)';
    b.lineWidth = 1.4;
    b.beginPath(); b.arc(cx, cy, cr * 1.13, 0, 6.3); b.stroke();
    // 玻璃下的暗腔与微光
    const faceG = b.createRadialGradient(cx - cr * 0.3, cy - cr * 0.35, cr * 0.1, cx, cy, cr);
    faceG.addColorStop(0, night ? '#20202e' : '#3a3a42');
    faceG.addColorStop(0.65, night ? '#12121c' : '#2a2a32');
    faceG.addColorStop(1, night ? '#08080e' : '#1a1a20');
    b.fillStyle = faceG;
    b.beginPath(); b.arc(cx, cy, cr, 0, 6.3); b.fill();
    // 刻度：60 小格 + 12 主格
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * 6.283 - Math.PI / 2;
      const major = i % 5 === 0;
      b.strokeStyle = major ? 'rgba(226,218,196,0.42)' : 'rgba(198,192,176,0.20)';
      b.lineWidth = major ? 1.8 : 0.9;
      const r1 = cr * (major ? 0.76 : 0.86);
      b.beginPath();
      b.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      b.lineTo(cx + Math.cos(a) * cr * 0.93, cy + Math.sin(a) * cr * 0.93);
      b.stroke();
    }
    // 罗马数字似的粗刻度（只做 12/3/6/9 方位）
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.283 - Math.PI / 2;
      b.strokeStyle = 'rgba(238,230,206,0.48)';
      b.lineWidth = 2.2;
      b.beginPath();
      b.moveTo(cx + Math.cos(a) * cr * 0.60, cy + Math.sin(a) * cr * 0.60);
      b.lineTo(cx + Math.cos(a) * cr * 0.74, cy + Math.sin(a) * cr * 0.74);
      b.stroke();
    }
    // 分针（断了一截）
    b.strokeStyle = 'rgba(216,210,188,0.50)';
    b.lineWidth = 2.6;
    b.beginPath(); b.moveTo(cx, cy); b.lineTo(cx + cr * 0.52, cy - cr * 0.44); b.stroke();
    b.lineWidth = 1.2;
    b.beginPath();
    b.moveTo(cx + cr * 0.52, cy - cr * 0.44);
    b.lineTo(cx + cr * 0.58, cy - cr * 0.50);
    b.stroke();
    // 时针掉在钟面下方
    b.strokeStyle = 'rgba(150,142,126,0.40)';
    b.lineWidth = 2.2;
    b.beginPath();
    b.moveTo(cx - cr * 0.18, cy + cr * 0.62);
    b.lineTo(cx + cr * 0.10, cy + cr * 0.74);
    b.stroke();
    // 轴心
    b.fillStyle = 'rgba(200,192,168,0.35)';
    b.beginPath(); b.arc(cx, cy, cr * 0.045, 0, 6.3); b.fill();
    // 玻璃裂纹与反光
    b.strokeStyle = 'rgba(210,220,240,0.16)';
    b.lineWidth = 0.8;
    b.beginPath();
    b.moveTo(cx - cr * 0.62, cy - cr * 0.28);
    b.lineTo(cx - cr * 0.18, cy - cr * 0.10);
    b.lineTo(cx - cr * 0.05, cy + cr * 0.16);
    b.lineTo(cx + cr * 0.20, cy + cr * 0.34);
    b.stroke();
    b.beginPath();
    b.moveTo(cx - cr * 0.18, cy - cr * 0.10);
    b.lineTo(cx - cr * 0.34, cy + cr * 0.22);
    b.stroke();
    const glass = b.createLinearGradient(cx - cr, cy - cr, cx + cr * 0.4, cy + cr * 0.3);
    glass.addColorStop(0, 'rgba(190,210,240,0.10)');
    glass.addColorStop(0.35, 'rgba(190,210,240,0.02)');
    glass.addColorStop(0.36, 'rgba(190,210,240,0.00)');
    glass.addColorStop(1, 'rgba(190,210,240,0.05)');
    b.fillStyle = glass;
    b.beginPath(); b.arc(cx, cy, cr, 0, 6.3); b.fill();
    // 钟框上的锈迹
    for (let i = 0; i < 7; i++) {
      const a = rand(0, 6.283);
      b.fillStyle = `rgba(120,74,52,${rand(0.05, 0.14)})`;
      b.beginPath();
      b.ellipse(cx + Math.cos(a) * cr * 1.05, cy + Math.sin(a) * cr * 1.05,
        rand(2, 6), rand(1.5, 4), a, 0, 6.3);
      b.fill();
    }

    // 塔身拱窗（下段）：窗台、券石、铁栏、窗内微光
    const towerWindows = [
      { x: 0.09, y: 0.360, w: 0.20, h: 0.088 },
      { x: 0.71, y: 0.360, w: 0.20, h: 0.088 },
      { x: 0.09, y: 0.545, w: 0.20, h: 0.092 },
      { x: 0.71, y: 0.545, w: 0.20, h: 0.092 },
      { x: 0.40, y: 0.735, w: 0.20, h: 0.090 },
    ];
    for (let f = 0; f < towerWindows.length; f++) {
      const spec = towerWindows[f];
      const wx = tx + tw * spec.x;
      const wy = ty + th * spec.y;
      const ww = tw * spec.w;
      const wh = th * spec.h;
      // 窗洞
      b.fillStyle = 'rgba(5,5,12,0.94)';
      b.beginPath();
      b.moveTo(wx, wy + wh);
      b.lineTo(wx, wy + wh * 0.26);
      b.quadraticCurveTo(wx + ww * 0.5, wy - wh * 0.34, wx + ww, wy + wh * 0.26);
      b.lineTo(wx + ww, wy + wh);
      b.closePath(); b.fill();
      // 券石边
      b.strokeStyle = night ? 'rgba(174,154,136,0.26)' : 'rgba(232,220,198,0.48)';
      b.lineWidth = 1.5;
      b.stroke();
      // 窗台
      b.fillStyle = night ? 'rgba(126,110,96,0.30)' : 'rgba(206,194,170,0.50)';
      b.fillRect(wx - ww * 0.10, wy + wh, ww * 1.20, H * 0.005);
      // 铁栏
      b.strokeStyle = 'rgba(86,78,86,0.40)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(wx + ww * 0.5, wy - wh * 0.10);
      b.lineTo(wx + ww * 0.5, wy + wh);
      b.moveTo(wx, wy + wh * 0.46);
      b.lineTo(wx + ww, wy + wh * 0.46);
      b.stroke();
      // 窗内一点城市反光
      b.save();
      b.globalCompositeOperation = 'lighter';
      const inGlow = b.createLinearGradient(0, wy + wh * 0.35, 0, wy + wh);
      inGlow.addColorStop(0, `rgba(255,190,120,${0.03 + f * 0.006})`);
      inGlow.addColorStop(1, 'rgba(255,190,120,0)');
      b.fillStyle = inGlow;
      b.fillRect(wx + 1, wy + wh * 0.35, ww - 2, wh * 0.65);
      b.restore();
      // 窗下渗水痕
      b.fillStyle = 'rgba(10,8,10,0.12)';
      b.fillRect(wx + ww * 0.12, wy + wh, ww * 0.10, rand(6, 22));
    }

    // 底部拱门：半开的木门与门内暖光
    const doorW = tw * 0.26, doorH = H * 0.088;
    const doorX = tx + tw * 0.37, doorY = horizon - doorH;
    // 门洞石框
    b.fillStyle = night ? '#4e4038' : '#a89a82';
    b.beginPath();
    b.moveTo(doorX - tw * 0.035, horizon);
    b.lineTo(doorX - tw * 0.035, doorY + doorH * 0.22);
    b.quadraticCurveTo(doorX + doorW * 0.5, doorY - doorH * 0.30, doorX + doorW + tw * 0.035, doorY + doorH * 0.22);
    b.lineTo(doorX + doorW + tw * 0.035, horizon);
    b.closePath(); b.fill();
    // 门内暗部
    b.fillStyle = '#07060a';
    b.beginPath();
    b.moveTo(doorX, horizon);
    b.lineTo(doorX, doorY + doorH * 0.24);
    b.quadraticCurveTo(doorX + doorW * 0.5, doorY - doorH * 0.24, doorX + doorW, doorY + doorH * 0.24);
    b.lineTo(doorX + doorW, horizon);
    b.closePath(); b.fill();
    // 门内的暖光缝隙
    b.save();
    b.globalCompositeOperation = 'lighter';
    const doorGlow = b.createLinearGradient(doorX + doorW * 0.62, 0, doorX + doorW, 0);
    doorGlow.addColorStop(0, 'rgba(255,168,96,0)');
    doorGlow.addColorStop(0.55, 'rgba(255,168,96,0.16)');
    doorGlow.addColorStop(1, 'rgba(255,168,96,0.05)');
    b.fillStyle = doorGlow;
    b.fillRect(doorX + doorW * 0.58, doorY + doorH * 0.30, doorW * 0.42, doorH * 0.70);
    b.restore();
    // 木门（向内半开）
    const doorG = b.createLinearGradient(doorX, 0, doorX + doorW * 0.42, 0);
    doorG.addColorStop(0, night ? '#241612' : '#5a4030');
    doorG.addColorStop(0.6, night ? '#332018' : '#6c4c38');
    doorG.addColorStop(1, night ? '#1a100c' : '#452f22');
    b.fillStyle = doorG;
    b.beginPath();
    b.moveTo(doorX, horizon);
    b.lineTo(doorX, doorY + doorH * 0.24);
    b.quadraticCurveTo(doorX + doorW * 0.21, doorY - doorH * 0.10, doorX + doorW * 0.42, doorY + doorH * 0.24);
    b.lineTo(doorX + doorW * 0.42, horizon);
    b.closePath(); b.fill();
    // 门板缝与铁钉
    b.strokeStyle = 'rgba(8,6,6,0.35)';
    b.lineWidth = 0.8;
    for (let i = 1; i < 4; i++) {
      const xx = doorX + doorW * 0.42 * (i / 4);
      b.beginPath(); b.moveTo(xx, doorY + doorH * 0.18); b.lineTo(xx, horizon); b.stroke();
    }
    for (let i = 0; i < 6; i++) {
      b.fillStyle = 'rgba(150,132,104,0.30)';
      b.beginPath();
      b.arc(doorX + doorW * rand(0.03, 0.38), horizon - doorH * rand(0.12, 0.82), 1.2, 0, 6.3);
      b.fill();
    }
    // 门环
    b.strokeStyle = 'rgba(150,132,104,0.40)';
    b.lineWidth = 1.4;
    b.beginPath(); b.arc(doorX + doorW * 0.30, horizon - doorH * 0.44, doorW * 0.045, 0, 6.3); b.stroke();

    // 壁灯：铁艺托架 + 暖光
    const lx = doorX - tw * 0.085, ly = horizon - H * 0.135;
    b.strokeStyle = 'rgba(24,18,18,0.85)';
    b.lineWidth = Math.max(1.6, W * 0.0016);
    b.beginPath();
    b.moveTo(lx, ly + H * 0.020);
    b.quadraticCurveTo(lx + W * 0.014, ly + H * 0.010, lx + W * 0.020, ly - H * 0.004);
    b.stroke();
    b.fillStyle = 'rgba(36,26,22,0.9)';
    b.fillRect(lx + W * 0.012, ly - H * 0.010, W * 0.016, H * 0.022);
    b.fillStyle = 'rgba(255,196,120,0.85)';
    b.fillRect(lx + W * 0.014, ly - H * 0.006, W * 0.012, H * 0.014);
    b.save();
    b.globalCompositeOperation = 'lighter';
    const lampGlow = b.createRadialGradient(lx + W * 0.020, ly, 0, lx + W * 0.020, ly, W * 0.105);
    lampGlow.addColorStop(0, 'rgba(255,186,106,0.30)');
    lampGlow.addColorStop(0.30, 'rgba(255,176,96,0.12)');
    lampGlow.addColorStop(1, 'rgba(255,176,96,0)');
    b.fillStyle = lampGlow;
    b.fillRect(lx - W * 0.08, ly - W * 0.09, W * 0.22, W * 0.18);
    b.restore();

    // 外挂铁旋梯：立柱、螺旋踏步、扶手
    const stx0 = tx + tw * 0.985;
    const stairTop = ty + th * 0.20;
    const stairBot = horizon - H * 0.012;
    // 立柱
    const steel = b.createLinearGradient(stx0 - 2, 0, stx0 + 4, 0);
    steel.addColorStop(0, 'rgba(30,26,30,0.95)');
    steel.addColorStop(0.5, 'rgba(74,66,66,0.9)');
    steel.addColorStop(1, 'rgba(22,18,22,0.95)');
    b.fillStyle = steel;
    b.fillRect(stx0 - W * 0.002, stairTop, W * 0.006, stairBot - stairTop);
    // 平台
    b.fillStyle = 'rgba(40,34,36,0.9)';
    b.fillRect(stx0 - W * 0.016, stairTop - H * 0.008, W * 0.030, H * 0.009);
    // 螺旋踏步：绕柱的短横板
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const yy = stairBot - (stairBot - stairTop) * t;
      const phase = t * Math.PI * 3.2;
      const ext = W * (0.010 + Math.abs(Math.cos(phase)) * 0.030);
      const front = Math.cos(phase) >= 0;
      b.strokeStyle = front ? 'rgba(58,50,52,0.9)' : 'rgba(34,28,30,0.9)';
      b.lineWidth = Math.max(1.4, H * 0.0026);
      b.beginPath();
      b.moveTo(stx0 - ext * (front ? 1 : 0.4), yy);
      b.lineTo(stx0 + ext, yy - H * 0.002);
      b.stroke();
      // 踏板厚度
      b.fillStyle = 'rgba(10,8,10,0.45)';
      b.fillRect(stx0 - ext * 0.9, yy + H * 0.001, ext * 1.8, H * 0.002);
    }
    // 扶手：一根连续的外曲线
    b.strokeStyle = 'rgba(48,42,44,0.85)';
    b.lineWidth = Math.max(1.2, W * 0.0016);
    b.beginPath();
    b.moveTo(stx0 + W * 0.036, stairBot);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const yy = stairBot - (stairBot - stairTop) * t;
      const xx = stx0 + W * (0.012 + Math.abs(Math.cos(t * Math.PI * 3.2)) * 0.026);
      b.lineTo(xx, yy);
    }
    b.stroke();
    // 扶手立柱
    b.lineWidth = 0.9;
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const yy = stairBot - (stairBot - stairTop) * t;
      const xx = stx0 + W * (0.012 + Math.abs(Math.cos(t * Math.PI * 3.2)) * 0.026);
      b.beginPath(); b.moveTo(xx, yy); b.lineTo(xx + W * 0.001, yy + H * 0.012); b.stroke();
    }
    // 楼梯落地处的小平台
    b.fillStyle = 'rgba(36,30,32,0.85)';
    b.beginPath();
    b.moveTo(stx0 - W * 0.020, horizon);
    b.lineTo(stx0 + W * 0.042, horizon - H * 0.004);
    b.lineTo(stx0 + W * 0.048, horizon);
    b.closePath(); b.fill();

    // 塔身爬山虎（从右下向上）
    drawIvy(b, tx + tw * 0.68, horizon - th * 0.30, tw * 0.34, th * 0.28,
      'rgba(8,15,11,0.9)', 'rgba(170,196,232,0.10)', 1.5);
    // 左侧爬山虎
    drawIvy(b, tx + tw * 0.02, ty + th * 0.62, tw * 0.26, th * 0.34,
      'rgba(8,15,11,0.85)', 'rgba(170,196,232,0.09)', 1.2);
  }
  drawBelltower.ground = (b, p, horizon) => {
    const night = state.time !== 'day';
    const day = state.time === 'day';
    const p2 = PALETTES[state.time] || PALETTES.night;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    // 山坡草地：远近两层色
    const g = b.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, night ? '#182620' : '#38523a');
    g.addColorStop(0.45, night ? '#101a16' : '#2a402c');
    g.addColorStop(1, night ? '#070c0b' : '#16281c');
    b.fillStyle = g;
    b.fillRect(0, horizon, W, H - horizon);
    // 草坡的起伏色块
    for (let i = 0; i < 7; i++) {
      const yy = horizon + (H - horizon) * (i / 7);
      b.fillStyle = `rgba(${night ? '30,50,40' : '70,104,64'},${0.05 + i * 0.012})`;
      b.beginPath();
      b.ellipse(W * (0.15 + perm(i, 3) * 0.7), yy, W * rand(0.18, 0.34), H * rand(0.02, 0.05), 0, 0, 6.3);
      b.fill();
    }

    // 通往塔门的石阶：近大远小
    const topX = W * 0.545, topY = horizon + H * 0.004;
    const botX = W * 0.30, botY = H * 1.02;
    const steps = 14;
    // 石阶两侧矮墙
    const wallL = (t) => topX - (topX - botX) * t - W * (0.115 + t * 0.045);
    const wallR = (t) => topX - (topX - botX) * t + W * (0.115 + t * 0.045);
    b.fillStyle = night ? 'rgba(36,34,36,0.92)' : 'rgba(150,144,130,0.92)';
    b.beginPath();
    b.moveTo(wallL(0), topY);
    b.lineTo(wallL(1), botY);
    b.lineTo(wallL(1) - W * 0.045, botY);
    b.lineTo(wallL(0) - W * 0.018, topY);
    b.closePath(); b.fill();
    b.beginPath();
    b.moveTo(wallR(0), topY);
    b.lineTo(wallR(1), botY);
    b.lineTo(wallR(1) + W * 0.045, botY);
    b.lineTo(wallR(0) + W * 0.018, topY);
    b.closePath(); b.fill();
    // 矮墙压顶
    b.strokeStyle = night ? 'rgba(120,112,108,0.30)' : 'rgba(232,224,206,0.45)';
    b.lineWidth = Math.max(2, W * 0.002);
    b.beginPath(); b.moveTo(wallL(0), topY); b.lineTo(wallL(1), botY); b.stroke();
    b.beginPath(); b.moveTo(wallR(0), topY); b.lineTo(wallR(1), botY); b.stroke();
    // 墙面石缝
    b.strokeStyle = 'rgba(10,8,10,0.22)';
    b.lineWidth = 0.9;
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      b.beginPath();
      b.moveTo(wallL(t), topY + (botY - topY) * t);
      b.lineTo(wallL(t) - W * (0.018 + t * 0.027), topY + (botY - topY) * t);
      b.stroke();
      b.beginPath();
      b.moveTo(wallR(t), topY + (botY - topY) * t);
      b.lineTo(wallR(t) + W * (0.018 + t * 0.027), topY + (botY - topY) * t);
      b.stroke();
    }

    // 每一级台阶
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const y0 = topY + (botY - topY) * t0;
      const y1 = topY + (botY - topY) * t1;
      const xl0 = wallL(t0) + W * (0.012 + t0 * 0.008);
      const xr0 = wallR(t0) - W * (0.012 + t0 * 0.008);
      const xl1 = wallL(t1) + W * (0.012 + t1 * 0.008);
      const xr1 = wallR(t1) - W * (0.012 + t1 * 0.008);
      // 踏面
      const tread = b.createLinearGradient(0, y0, 0, y1);
      const base = night ? 60 + (i % 3) * 6 : 140 + (i % 3) * 8;
      tread.addColorStop(0, `rgba(${base},${base - 6},${base - 8},0.96)`);
      tread.addColorStop(1, `rgba(${base - 22},${base - 26},${base - 24},0.96)`);
      b.fillStyle = tread;
      b.beginPath();
      b.moveTo(xl0, y0); b.lineTo(xr0, y0);
      b.lineTo(xr1, y1); b.lineTo(xl1, y1);
      b.closePath(); b.fill();
      // 前缘高光
      b.strokeStyle = night ? 'rgba(210,206,190,0.10)' : 'rgba(255,248,228,0.30)';
      b.lineWidth = Math.max(1, H * 0.0016);
      b.beginPath(); b.moveTo(xl0, y0); b.lineTo(xr0, y0); b.stroke();
      // 踢面阴影
      b.fillStyle = 'rgba(0,0,0,0.18)';
      b.beginPath();
      b.moveTo(xl1, y1); b.lineTo(xr1, y1);
      b.lineTo(xr1 - W * 0.002, y1 - H * 0.006);
      b.lineTo(xl1 + W * 0.002, y1 - H * 0.006);
      b.closePath(); b.fill();
      // 石缝苔痕
      if (i % 2 === 0) {
        b.fillStyle = `rgba(44,70,44,${rand(0.05, 0.14)})`;
        b.beginPath();
        b.ellipse((xl0 + xr0) / 2 + rand(-W * 0.05, W * 0.05), y0 + 3,
          W * rand(0.01, 0.03), H * rand(0.002, 0.005), 0, 0, 6.3);
        b.fill();
      }
      // 零星落叶
      if (perm(i, 21) > 0.66) {
        b.fillStyle = `rgba(92,70,38,${rand(0.20, 0.40)})`;
        b.beginPath();
        b.ellipse(xl0 + (xr0 - xl0) * perm(i, 23), y0 + 2,
          W * 0.004, H * 0.002, perm(i, 25) * 3, 0, 6.3);
        b.fill();
      }
    }

    // 阶前的碎石小径（从画面下沿汇入石阶）
    const pathG = b.createLinearGradient(botX, H, topX, horizon);
    pathG.addColorStop(0, night ? 'rgba(58,52,50,0.60)' : 'rgba(170,160,140,0.75)');
    pathG.addColorStop(1, night ? 'rgba(40,36,36,0.30)' : 'rgba(150,142,124,0.40)');
    b.fillStyle = pathG;
    b.beginPath();
    b.moveTo(W * 0.08, H);
    b.quadraticCurveTo(W * 0.22, H * 0.86, W * 0.42, H * 0.72);
    b.quadraticCurveTo(W * 0.50, H * 0.64, topX - W * 0.02, horizon + H * 0.01);
    b.lineTo(topX + W * 0.04, horizon + H * 0.01);
    b.quadraticCurveTo(W * 0.62, H * 0.70, W * 0.58, H * 0.82);
    b.quadraticCurveTo(W * 0.50, H * 0.94, W * 0.34, H);
    b.closePath(); b.fill();
    for (let i = 0; i < 60; i++) {
      const t = perm(i, 31);
      const yy = horizon + (H - horizon) * Math.pow(t, 0.8);
      const spread = (yy - horizon) / (H - horizon);
      const xx = topX + (W * 0.20 * (perm(i, 33) - 0.5) - W * 0.14 * spread);
      b.fillStyle = `rgba(${night ? '120,110,100' : '196,186,164'},${rand(0.04, 0.12)})`;
      b.beginPath();
      b.ellipse(xx, yy, W * rand(0.002, 0.006), H * rand(0.001, 0.003), rand(0, 3), 0, 6.3);
      b.fill();
    }

    // 草地细叶：分近、远两层，近处更大更稀
    for (let layer = 0; layer < 2; layer++) {
      const count = layer ? 230 : 320;
      for (let i = 0; i < count; i++) {
        const yy = horizon + Math.pow(rand(0, 1), layer ? 0.6 : 1.4) * (H - horizon);
        const xx = rand(-W * 0.02, W * 1.02);
        // 避开石阶区域
        const depth = (yy - horizon) / (H - horizon);
        const sx = topX - W * (0.15 + depth * 0.15);
        const ex = topX + W * (0.15 + depth * 0.15);
        if (xx > sx && xx < ex) continue;
        const len = (layer ? 10 : 20) * (0.5 + depth);
        b.strokeStyle = layer
          ? `rgba(${night ? '56,84,58' : '104,140,92'},${rand(0.18, 0.40)})`
          : `rgba(${night ? '30,52,36' : '72,104,64'},${rand(0.25, 0.50)})`;
        b.lineWidth = layer ? 1 : 1.4;
        b.beginPath();
        b.moveTo(xx, yy);
        b.quadraticCurveTo(xx + rand(-3, 3), yy - len * 0.6, xx + rand(-8, 8), yy - len);
        b.stroke();
      }
    }
    // 草丛：几簇更密的草叶
    for (let c = 0; c < 14; c++) {
      const cx0 = rand(0, W), cy0 = horizon + rand(0.1, 0.95) * (H - horizon);
      const depth = (cy0 - horizon) / (H - horizon);
      const sx = topX - W * (0.15 + depth * 0.15);
      if (cx0 > sx && cx0 < topX + W * (0.15 + depth * 0.15)) continue;
      for (let i = 0; i < 14; i++) {
        const len = (10 + depth * 26) * rand(0.5, 1.2);
        b.strokeStyle = `rgba(${night ? '46,72,50' : '92,128,80'},${rand(0.25, 0.55)})`;
        b.lineWidth = 1.1;
        b.beginPath();
        b.moveTo(cx0 + rand(-12, 12), cy0);
        b.quadraticCurveTo(cx0 + rand(-20, 20), cy0 - len * 0.5, cx0 + rand(-26, 26), cy0 - len);
        b.stroke();
      }
    }

    // 石阶两侧的苔藓与灌木
    for (let i = 0; i < 22; i++) {
      const yy = horizon + Math.pow(rand(0, 1), 0.7) * (H - horizon);
      const depth = (yy - horizon) / (H - horizon);
      const xx = rand(0, W);
      const sx = topX - W * (0.22 + depth * 0.17);
      const ex = topX + W * (0.22 + depth * 0.17);
      if (xx > sx && xx < ex) continue;
      const r = 5 + depth * 26;
      b.fillStyle = `rgba(${night ? '16,30,20' : '40,62,38'},${rand(0.35, 0.7)})`;
      b.beginPath();
      b.ellipse(xx, yy, r * rand(0.8, 1.5), r * rand(0.35, 0.6), 0, 0, 6.3);
      b.fill();
      b.fillStyle = `rgba(${night ? '44,68,42' : '88,120,68'},${rand(0.10, 0.25)})`;
      b.beginPath();
      b.ellipse(xx - r * 0.2, yy - r * 0.18, r * rand(0.4, 0.7), r * rand(0.15, 0.3), 0, 0, 6.3);
      b.fill();
    }

    // 台阶上的月光：从右上斜下来
    b.save();
    b.globalCompositeOperation = 'lighter';
    const mg = b.createLinearGradient(W * 0.62, horizon, W * 0.30, H);
    mg.addColorStop(0, hexA(p2.glow, 0.12));
    mg.addColorStop(0.55, hexA(p2.glow, 0.05));
    mg.addColorStop(1, hexA(p2.glow, 0));
    b.fillStyle = mg;
    b.beginPath();
    b.moveTo(W * 0.60, horizon);
    b.lineTo(W * 0.70, horizon);
    b.lineTo(W * 0.44, H);
    b.lineTo(W * 0.18, H);
    b.closePath(); b.fill();
    // 塔门暖光洒在阶顶
    const doorPool = b.createRadialGradient(W * 0.545, horizon + H * 0.01, 0, W * 0.545, horizon + H * 0.01, W * 0.09);
    doorPool.addColorStop(0, 'rgba(255,176,104,0.16)');
    doorPool.addColorStop(0.5, 'rgba(255,176,104,0.05)');
    doorPool.addColorStop(1, 'rgba(255,176,104,0)');
    b.fillStyle = doorPool;
    b.fillRect(W * 0.44, horizon, W * 0.22, H * 0.10);
    b.restore();

    // 萤火：近处两三只更亮
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const xx = rand(0, W), yy = horizon + rand(0.05, 0.86) * (H - horizon);
      const r = rand(0.7, 1.9);
      const glow = b.createRadialGradient(xx, yy, 0, xx, yy, r * 5);
      glow.addColorStop(0, `rgba(224,246,176,${rand(0.35, 0.65)})`);
      glow.addColorStop(0.4, 'rgba(214,240,160,0.14)');
      glow.addColorStop(1, 'rgba(214,240,160,0)');
      b.fillStyle = glow;
      b.beginPath(); b.arc(xx, yy, r * 5, 0, 6.3); b.fill();
      b.fillStyle = `rgba(240,252,206,${rand(0.5, 0.85)})`;
      b.beginPath(); b.arc(xx, yy, r * 0.7, 0, 6.3); b.fill();
    }
    b.restore();

    // 山风薄雾（贴地）
    const fog = b.createLinearGradient(0, horizon - H * 0.01, 0, H);
    fog.addColorStop(0, 'rgba(180,196,220,0.05)');
    fog.addColorStop(0.35, 'rgba(180,196,220,0.015)');
    fog.addColorStop(1, 'rgba(180,196,220,0)');
    b.fillStyle = fog;
    b.fillRect(0, horizon - H * 0.01, W, H * 0.5);
  };

  /* ---------- 场景：老剧院前庭 ---------- */
  function drawTheateryard(b, p, horizon) {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const dusk = !night && !day;
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const warm = p2.warm;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    // 远处的树冠：只在天际线上露一层，衬出屋顶
    for (let i = 0; i < 26; i++) {
      const xx = W * (i / 25) + rand(-10, 10);
      const yy = horizon - H * rand(0.010, 0.040);
      const rr = H * rand(0.020, 0.045);
      b.fillStyle = night ? 'rgba(9,13,16,0.85)' : 'rgba(40,52,38,0.55)';
      b.beginPath();
      b.ellipse(xx, yy, rr * 1.3, rr * 0.8, 0, 0, 6.3);
      b.fill();
    }

    /* ---------- 主楼：砖木结构的旧剧院 ---------- */
    const bx = W * 0.115, bw = W * 0.77, bh = H * 0.405;
    const by = horizon - bh + H * 0.022;
    const baseY = by + bh;
    const stone = night ? '#3c3440' : day ? '#d2c2a6' : '#a88c70';
    const stoneDark = night ? '#26202a' : day ? '#a8967a' : '#7e6652';

    // 楼体在地面上的投影
    b.fillStyle = 'rgba(0,0,0,0.25)';
    b.beginPath();
    b.ellipse(bx + bw * 0.5, horizon + H * 0.006, bw * 0.54, H * 0.026, 0, 0, 6.3);
    b.fill();

    // 石砌台基
    const plinthH = H * 0.030;
    const plinthG = b.createLinearGradient(0, baseY - plinthH, 0, baseY);
    plinthG.addColorStop(0, night ? '#4a4048' : '#c0b096');
    plinthG.addColorStop(1, night ? '#2c262e' : '#8e7c66');
    b.fillStyle = plinthG;
    b.fillRect(bx - W * 0.016, baseY - plinthH, bw + W * 0.032, plinthH + H * 0.02);
    b.strokeStyle = 'rgba(20,14,16,0.25)';
    b.lineWidth = 0.9;
    for (let i = 0; i < 12; i++) {
      const xx = bx - W * 0.016 + (bw + W * 0.032) * (i / 12);
      b.beginPath(); b.moveTo(xx, baseY - plinthH); b.lineTo(xx, baseY + H * 0.02); b.stroke();
    }
    b.beginPath();
    b.moveTo(bx - W * 0.016, baseY - plinthH * 0.45);
    b.lineTo(bx + bw + W * 0.016, baseY - plinthH * 0.45);
    b.stroke();
    b.fillStyle = 'rgba(255,244,220,0.08)';
    b.fillRect(bx - W * 0.016, baseY - plinthH, bw + W * 0.032, 1.6);

    // 墙体
    const wallG = b.createLinearGradient(bx, 0, bx + bw, 0);
    wallG.addColorStop(0, night ? '#2a2030' : day ? '#bd9270' : '#8e5c48');
    wallG.addColorStop(0.30, night ? '#332534' : day ? '#c69a76' : '#9c644c');
    wallG.addColorStop(0.62, night ? '#2c1f2c' : day ? '#b88a6a' : '#8a5644');
    wallG.addColorStop(1, night ? '#211828' : day ? '#9e7058' : '#6c4036');
    b.fillStyle = wallG;
    b.fillRect(bx, by, bw, bh);

    // 砖缝、砖色差异与风化
    b.save();
    b.beginPath(); b.rect(bx, by, bw, bh); b.clip();
    const rows = 42;
    const rowH = bh / rows;
    for (let row = 0; row < rows; row++) {
      const yy = by + row * rowH;
      const off = (row % 2) * 0.5;
      for (let col = -1; col < 46; col++) {
        const xx = bx + (col + off) * (bw / 45);
        const v = perm(row * 47 + col, 7);
        if (v > 0.86) {
          b.fillStyle = `rgba(236,210,186,${0.03 + (v - 0.86) * 0.35})`;
          b.fillRect(xx + 0.5, yy + 0.4, bw / 45 - 1, rowH - 0.8);
        } else if (v < 0.13) {
          b.fillStyle = `rgba(20,8,12,${0.04 + (0.13 - v) * 0.45})`;
          b.fillRect(xx + 0.5, yy + 0.4, bw / 45 - 1, rowH - 0.8);
        }
      }
      b.strokeStyle = 'rgba(36,18,18,0.17)';
      b.lineWidth = 0.7;
      b.beginPath(); b.moveTo(bx, yy); b.lineTo(bx + bw, yy); b.stroke();
    }
    // 竖向雨痕
    for (let i = 0; i < 22; i++) {
      const sx0 = bx + rand(0, bw);
      const sy0 = by + rand(0, bh * 0.3);
      const len = rand(bh * 0.15, bh * 0.7);
      const streak = b.createLinearGradient(0, sy0, 0, sy0 + len);
      streak.addColorStop(0, 'rgba(20,12,14,0.14)');
      streak.addColorStop(1, 'rgba(20,12,14,0)');
      b.fillStyle = streak;
      b.fillRect(sx0, sy0, rand(1, 3), len);
    }
    b.restore();

    // 角部条石与横向石带
    for (let side = 0; side < 2; side++) {
      const qx = side ? bx + bw - W * 0.030 : bx;
      for (let i = 0; i < 14; i++) {
        const qy = by + i * (bh / 14);
        b.fillStyle = i % 2
          ? (night ? 'rgba(124,112,110,0.20)' : 'rgba(228,216,192,0.38)')
          : (night ? 'rgba(70,60,64,0.18)' : 'rgba(178,164,138,0.24)');
        b.fillRect(qx, qy, W * 0.030, bh / 14 - 1.2);
        b.strokeStyle = 'rgba(20,14,16,0.22)';
        b.lineWidth = 0.8;
        b.strokeRect(qx, qy, W * 0.030, bh / 14 - 1.2);
      }
    }
    b.fillStyle = 'rgba(255,246,224,0.10)';
    b.fillRect(bx, by + bh * 0.46, bw, 2);
    b.fillStyle = stone;
    b.fillRect(bx, by + bh * 0.46, bw, H * 0.008);
    b.fillStyle = 'rgba(0,0,0,0.16)';
    b.fillRect(bx, by + bh * 0.46 + H * 0.008, bw, 1.2);

    // 壁柱：带柱础与柱头
    for (let i = 0; i < 6; i++) {
      const px = bx + bw * (0.012 + i * 0.196);
      const pw = W * 0.016;
      const pg = b.createLinearGradient(px, 0, px + pw, 0);
      pg.addColorStop(0, stoneDark);
      pg.addColorStop(0.45, stone);
      pg.addColorStop(1, stoneDark);
      b.fillStyle = pg;
      b.fillRect(px, by + H * 0.008, pw, bh - H * 0.008);
      // 柱础
      b.fillRect(px - W * 0.004, baseY - H * 0.045, pw + W * 0.008, H * 0.020);
      // 柱头
      b.fillRect(px - W * 0.005, by + H * 0.012, pw + W * 0.010, H * 0.016);
      b.fillStyle = 'rgba(255,246,226,0.12)';
      b.fillRect(px + 1, by + H * 0.008, 1.4, bh - H * 0.008);
      b.fillStyle = 'rgba(0,0,0,0.14)';
      b.fillRect(px + pw - 1.4, by + H * 0.008, 1.4, bh - H * 0.008);
    }

    /* 檐口：三道线脚 + 齿饰 */
    const cornY = by;
    b.fillStyle = night ? '#1e1620' : day ? '#8c5a46' : '#5e3632';
    b.fillRect(bx - W * 0.022, cornY - H * 0.014, bw + W * 0.044, H * 0.018);
    b.fillStyle = stone;
    b.fillRect(bx - W * 0.022, cornY - H * 0.022, bw + W * 0.044, H * 0.008);
    b.fillStyle = 'rgba(255,244,220,0.14)';
    b.fillRect(bx - W * 0.022, cornY - H * 0.022, bw + W * 0.044, 1.4);
    for (let i = 0; i < 46; i++) {
      const dx0 = bx - W * 0.016 + i * ((bw + W * 0.032) / 46);
      b.fillStyle = night ? 'rgba(80,64,64,0.55)' : 'rgba(206,192,168,0.55)';
      b.fillRect(dx0, cornY - H * 0.006, (bw + W * 0.032) / 92, H * 0.006);
    }

    /* 红瓦屋顶 */
    const roofH = H * 0.175;
    const roofPeakY = by - H * 0.036 - roofH;
    const roofG = b.createLinearGradient(0, roofPeakY, 0, by);
    roofG.addColorStop(0, night ? '#3e2228' : day ? '#c87856' : '#a4503c');
    roofG.addColorStop(0.55, night ? '#2e1a22' : day ? '#b25e48' : '#8c4034');
    roofG.addColorStop(1, night ? '#1e121a' : day ? '#8c4438' : '#632c2c');
    b.fillStyle = roofG;
    b.beginPath();
    b.moveTo(bx - W * 0.040, by + H * 0.004);
    b.quadraticCurveTo(bx + bw * 0.10, by - roofH * 0.55, bx + bw * 0.16, roofPeakY);
    b.lineTo(bx + bw * 0.84, roofPeakY);
    b.quadraticCurveTo(bx + bw * 0.90, by - roofH * 0.55, bx + bw + W * 0.040, by + H * 0.004);
    b.closePath(); b.fill();
    // 瓦垄与瓦当
    b.save();
    b.beginPath();
    b.moveTo(bx - W * 0.040, by + H * 0.004);
    b.quadraticCurveTo(bx + bw * 0.10, by - roofH * 0.55, bx + bw * 0.16, roofPeakY);
    b.lineTo(bx + bw * 0.84, roofPeakY);
    b.quadraticCurveTo(bx + bw * 0.90, by - roofH * 0.55, bx + bw + W * 0.040, by + H * 0.004);
    b.closePath(); b.clip();
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const xTop = bx + bw * (0.16 + t * 0.68);
      const xBot = bx - W * 0.040 + t * (bw + W * 0.080);
      b.strokeStyle = night ? 'rgba(8,4,10,0.32)' : 'rgba(74,28,24,0.30)';
      b.lineWidth = 1.1;
      b.beginPath();
      b.moveTo(xBot, by + H * 0.004);
      b.quadraticCurveTo(xBot + (xTop - xBot) * 0.45, by - roofH * 0.62, xTop, roofPeakY);
      b.stroke();
      // 瓦片弧形高光
      if (i % 2 === 0) {
        b.strokeStyle = night ? 'rgba(160,120,120,0.06)' : 'rgba(255,214,176,0.10)';
        b.lineWidth = 0.8;
        b.beginPath();
        b.moveTo(xBot + 1.4, by + H * 0.004);
        b.quadraticCurveTo(xBot + (xTop - xBot) * 0.45 + 1.4, by - roofH * 0.62, xTop + 1.4, roofPeakY);
        b.stroke();
      }
    }
    // 横向瓦楞
    for (let i = 1; i < 11; i++) {
      const yy = roofPeakY + (i / 11) * (by - roofPeakY);
      const half = (bw * 0.42) * (i / 11) + W * 0.01;
      b.strokeStyle = 'rgba(30,12,16,0.20)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(bx + bw * 0.5 - half, yy); b.lineTo(bx + bw * 0.5 + half, yy); b.stroke();
      b.strokeStyle = night ? 'rgba(180,150,150,0.05)' : 'rgba(255,226,196,0.07)';
      b.beginPath(); b.moveTo(bx + bw * 0.5 - half, yy - 1); b.lineTo(bx + bw * 0.5 + half, yy - 1); b.stroke();
    }
    b.restore();
    // 屋脊与翘角
    b.fillStyle = night ? '#1c121a' : '#6e302a';
    b.fillRect(bx + bw * 0.15, roofPeakY - H * 0.012, bw * 0.70, H * 0.014);
    b.fillStyle = 'rgba(255,236,208,0.16)';
    b.fillRect(bx + bw * 0.15, roofPeakY - H * 0.012, bw * 0.70, 1.6);
    // 脊饰
    for (let i = 0; i < 9; i++) {
      const fx = bx + bw * (0.17 + i * 0.082);
      b.fillStyle = night ? 'rgba(90,74,72,0.5)' : 'rgba(206,176,144,0.5)';
      b.beginPath();
      b.moveTo(fx - W * 0.005, roofPeakY - H * 0.010);
      b.quadraticCurveTo(fx, roofPeakY - H * 0.026, fx + W * 0.005, roofPeakY - H * 0.010);
      b.closePath(); b.fill();
    }
    // 两端翘角
    for (let s = 0; s < 2; s++) {
      const ex = s ? bx + bw * 0.84 : bx + bw * 0.16;
      const dir = s ? 1 : -1;
      b.strokeStyle = night ? '#1c121a' : '#6e302a';
      b.lineWidth = Math.max(3, W * 0.004);
      b.beginPath();
      b.moveTo(ex, roofPeakY);
      b.quadraticCurveTo(ex + dir * W * 0.026, roofPeakY + H * 0.004, ex + dir * W * 0.040, roofPeakY - H * 0.018);
      b.stroke();
    }
    // 烟囱
    const chx = bx + bw * 0.71;
    b.fillStyle = night ? '#2a1c22' : '#7c4a3c';
    b.fillRect(chx, roofPeakY - H * 0.052, W * 0.032, H * 0.058);
    b.fillStyle = 'rgba(255,246,226,0.10)';
    b.fillRect(chx, roofPeakY - H * 0.052, W * 0.032, 2);
    b.fillStyle = stoneDark;
    b.fillRect(chx - W * 0.004, roofPeakY - H * 0.056, W * 0.040, H * 0.007);
    for (let i = 0; i < 8; i++) {
      b.fillStyle = 'rgba(10,8,10,0.20)';
      b.fillRect(chx + i * W * 0.004, roofPeakY - H * 0.045, W * 0.0014, H * 0.050);
    }

    /* ---------- 二层木雕花窗 ---------- */
    const winW = bw * 0.098, winH = bh * 0.165;
    const winY = by + bh * 0.105;
    for (let i = 0; i < 6; i++) {
      const wx = bx + bw * (0.055 + i * 0.168);
      const lit = night ? (i % 2 === 0) : dusk ? (i === 1 || i === 4) : false;
      // 窗套与拱心石
      b.fillStyle = stoneDark;
      b.fillRect(wx - W * 0.006, winY - H * 0.008, winW + W * 0.012, winH + H * 0.016);
      b.fillStyle = stone;
      b.fillRect(wx - W * 0.006, winY - H * 0.008, winW + W * 0.012, H * 0.006);
      b.fillStyle = stone;
      b.fillRect(wx + winW * 0.42, winY - H * 0.014, winW * 0.16, H * 0.010);
      // 窗内
      const inG = b.createLinearGradient(0, winY, 0, winY + winH);
      if (lit) {
        inG.addColorStop(0, hexA(p2.glow, 0.42));
        inG.addColorStop(0.55, hexA(p2.glow, 0.26));
        inG.addColorStop(1, 'rgba(20,14,18,0.65)');
      } else {
        inG.addColorStop(0, night ? '#0a0a16' : 'rgba(70,62,66,0.55)');
        inG.addColorStop(1, night ? '#050510' : 'rgba(40,36,42,0.65)');
      }
      b.fillStyle = inG;
      b.fillRect(wx, winY, winW, winH);
      // 帘影（亮窗内）
      if (lit) {
        b.fillStyle = 'rgba(60,30,30,0.20)';
        b.fillRect(wx + winW * 0.06, winY, winW * 0.16, winH);
        b.fillRect(wx + winW * 0.78, winY, winW * 0.16, winH);
        b.fillStyle = 'rgba(40,24,22,0.22)';
        b.fillRect(wx + winW * 0.42, winY + winH * 0.12, winW * 0.16, winH * 0.74);
      }
      // 菱花格
      b.save();
      b.beginPath(); b.rect(wx, winY, winW, winH); b.clip();
      b.strokeStyle = night ? 'rgba(132,106,90,0.55)' : 'rgba(78,44,32,0.62)';
      b.lineWidth = 1.2;
      b.strokeRect(wx, winY, winW, winH);
      for (let k = -4; k < 8; k++) {
        b.beginPath();
        b.moveTo(wx + k * winW * 0.25, winY);
        b.lineTo(wx + k * winW * 0.25 + winH, winY + winH);
        b.stroke();
        b.beginPath();
        b.moveTo(wx + k * winW * 0.25 + winH, winY);
        b.lineTo(wx + k * winW * 0.25, winY + winH);
        b.stroke();
      }
      b.strokeStyle = night ? 'rgba(150,124,102,0.55)' : 'rgba(92,54,38,0.62)';
      b.lineWidth = 1.6;
      b.beginPath();
      b.moveTo(wx, winY + winH * 0.5); b.lineTo(wx + winW, winY + winH * 0.5);
      b.moveTo(wx + winW * 0.5, winY); b.lineTo(wx + winW * 0.5, winY + winH);
      b.stroke();
      // 中心团花
      b.beginPath();
      b.arc(wx + winW * 0.5, winY + winH * 0.5, winW * 0.16, 0, 6.3);
      b.stroke();
      b.restore();
      // 窗台
      b.fillStyle = stone;
      b.fillRect(wx - W * 0.009, winY + winH, winW + W * 0.018, H * 0.008);
      b.fillStyle = 'rgba(255,246,226,0.10)';
      b.fillRect(wx - W * 0.009, winY + winH, winW + W * 0.018, 1.2);
    }

    // 二层外阳台：石栏板与铁艺
    const balY = by + bh * 0.315;
    b.fillStyle = stone;
    b.fillRect(bx + bw * 0.045, balY, bw * 0.91, H * 0.010);
    b.fillStyle = 'rgba(0,0,0,0.18)';
    b.fillRect(bx + bw * 0.045, balY + H * 0.010, bw * 0.91, H * 0.005);
    b.strokeStyle = night ? 'rgba(120,104,96,0.45)' : 'rgba(74,48,36,0.55)';
    b.lineWidth = 1.1;
    for (let i = 0; i < 44; i++) {
      const rx0 = bx + bw * (0.052 + i * 0.0207);
      b.beginPath();
      b.moveTo(rx0, balY);
      b.lineTo(rx0, balY + H * 0.042);
      b.stroke();
      if (i % 5 === 0) {
        b.beginPath();
        b.arc(rx0, balY + H * 0.021, H * 0.008, 0, 6.3);
        b.stroke();
      }
    }
    b.strokeStyle = night ? 'rgba(132,116,106,0.55)' : 'rgba(82,54,40,0.65)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(bx + bw * 0.045, balY + H * 0.042);
    b.lineTo(bx + bw * 0.955, balY + H * 0.042);
    b.stroke();

    /* ---------- 中央门廊 ---------- */
    const dw = W * 0.150;
    const dx = bx + bw * 0.5 - dw * 0.5;
    const doorTop = by + bh * 0.505;
    const doorBot = baseY + H * 0.004;
    const doorH = doorBot - doorTop;
    // 门廊外框：壁柱与檐部
    b.fillStyle = stoneDark;
    b.fillRect(dx - W * 0.030, doorTop - H * 0.028, W * 0.030, doorH + H * 0.028);
    b.fillRect(dx + dw, doorTop - H * 0.028, W * 0.030, doorH + H * 0.028);
    b.fillStyle = stone;
    b.fillRect(dx - W * 0.030, doorTop - H * 0.028, W * 0.006, doorH + H * 0.028);
    b.fillRect(dx + dw + W * 0.024, doorTop - H * 0.028, W * 0.006, doorH + H * 0.028);
    // 柱头
    for (let s = 0; s < 2; s++) {
      const cxp = s ? dx + dw : dx - W * 0.030;
      b.fillStyle = stone;
      b.fillRect(cxp - W * 0.004, doorTop - H * 0.032, W * 0.038, H * 0.010);
      b.fillRect(cxp, doorTop - H * 0.022, W * 0.030, H * 0.006);
      b.fillStyle = 'rgba(255,240,214,0.14)';
      b.fillRect(cxp - W * 0.004, doorTop - H * 0.032, W * 0.038, 1.4);
    }
    // 门廊檐口
    b.fillStyle = stone;
    b.fillRect(dx - W * 0.046, doorTop - H * 0.050, dw + W * 0.092, H * 0.018);
    b.fillStyle = 'rgba(0,0,0,0.16)';
    b.fillRect(dx - W * 0.046, doorTop - H * 0.034, dw + W * 0.092, H * 0.003);
    b.fillStyle = 'rgba(255,246,226,0.12)';
    b.fillRect(dx - W * 0.046, doorTop - H * 0.050, dw + W * 0.092, 1.4);

    // 拱形门洞：券石一块块砌出
    b.save();
    b.beginPath();
    b.moveTo(dx - W * 0.010, doorBot);
    b.lineTo(dx - W * 0.010, doorTop + H * 0.052);
    b.quadraticCurveTo(dx + dw * 0.5, doorTop - H * 0.026, dx + dw + W * 0.010, doorTop + H * 0.052);
    b.lineTo(dx + dw + W * 0.010, doorBot);
    b.closePath();
    b.fillStyle = 'rgba(8,6,10,0.92)';
    b.fill();
    b.clip();
    // 门内暖光
    const vest = b.createLinearGradient(0, doorTop, 0, doorBot);
    vest.addColorStop(0, night ? 'rgba(255,178,104,0.20)' : 'rgba(255,196,132,0.34)');
    vest.addColorStop(0.5, night ? 'rgba(255,160,86,0.30)' : 'rgba(255,184,116,0.42)');
    vest.addColorStop(1, 'rgba(140,70,36,0.34)');
    b.fillStyle = vest;
    b.fillRect(dx, doorTop, dw, doorH);
    // 门厅内的地砖与吊灯
    b.fillStyle = 'rgba(60,34,26,0.30)';
    for (let i = 0; i < 6; i++) {
      b.beginPath();
      b.moveTo(dx + dw * 0.5, doorBot - H * 0.060);
      b.lineTo(dx + dw * (i / 6), doorBot);
      b.lineTo(dx + dw * ((i + 1) / 6), doorBot);
      b.closePath(); b.fill();
    }
    b.save();
    b.globalCompositeOperation = 'lighter';
    const hallLamp = b.createRadialGradient(dx + dw * 0.5, doorTop + doorH * 0.20, 0, dx + dw * 0.5, doorTop + doorH * 0.20, dw * 0.36);
    hallLamp.addColorStop(0, 'rgba(255,214,150,0.35)');
    hallLamp.addColorStop(1, 'rgba(255,200,130,0)');
    b.fillStyle = hallLamp;
    b.fillRect(dx, doorTop, dw, doorH * 0.6);
    b.restore();
    // 半开的双扇木门
    for (let s = 0; s < 2; s++) {
      const leafW = dw * 0.40;
      const lx = s ? dx + dw - leafW : dx;
      const far = s ? dw * 0.06 : -dw * 0.06;
      const doorG = b.createLinearGradient(lx, 0, lx + leafW, 0);
      doorG.addColorStop(0, night ? '#2a1814' : '#5e3a28');
      doorG.addColorStop(0.55, night ? '#3c241a' : '#764c32');
      doorG.addColorStop(1, night ? '#1c100e' : '#40281c');
      b.fillStyle = doorG;
      b.beginPath();
      b.moveTo(lx, doorBot);
      b.lineTo(lx + far * 0.4, doorTop + doorH * 0.10);
      b.lineTo(lx + leafW + far * 0.4, doorTop + doorH * 0.10);
      b.lineTo(lx + leafW, doorBot);
      b.closePath(); b.fill();
      // 门板线脚
      b.strokeStyle = 'rgba(10,6,6,0.42)';
      b.lineWidth = 1.2;
      for (let p = 1; p < 4; p++) {
        const py = doorTop + doorH * (0.10 + p * 0.225);
        b.beginPath();
        b.moveTo(lx + far * 0.4 * (1 - p * 0.2) + 2, py);
        b.lineTo(lx + leafW + far * 0.4 * (1 - p * 0.2) - 2, py);
        b.stroke();
      }
      // 铜把手
      b.fillStyle = 'rgba(196,158,92,0.75)';
      b.beginPath();
      b.arc(lx + leafW * (s ? 0.12 : 0.88), doorTop + doorH * 0.56, Math.max(2, W * 0.0022), 0, 6.3);
      b.fill();
    }
    // 门楣扇形气窗
    b.fillStyle = 'rgba(255,206,140,0.26)';
    b.beginPath();
    b.moveTo(dx + dw * 0.12, doorTop + H * 0.032);
    b.quadraticCurveTo(dx + dw * 0.5, doorTop - H * 0.016, dx + dw * 0.88, doorTop + H * 0.032);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(28,18,14,0.65)';
    b.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      b.beginPath();
      b.moveTo(dx + dw * 0.5, doorTop + H * 0.032);
      b.lineTo(dx + dw * 0.5 + Math.cos(a) * dw * 0.37, doorTop + H * 0.032 + Math.sin(a) * H * 0.040);
      b.stroke();
    }
    b.restore();
    // 券石：沿拱边一颗颗石楔
    for (let i = 0; i < 13; i++) {
      const a = Math.PI + (i / 12) * Math.PI;
      const rx0 = dx + dw * 0.5 + Math.cos(a) * (dw * 0.5 + W * 0.012);
      const ry0 = doorTop + H * 0.052 + Math.sin(a) * (H * 0.052 + H * 0.010);
      b.save();
      b.translate(rx0, ry0);
      b.rotate(a + Math.PI / 2);
      b.fillStyle = i % 2 ? stone : stoneDark;
      b.fillRect(-W * 0.007, -H * 0.007, W * 0.014, H * 0.020);
      b.restore();
    }
    // 拱心石
    b.fillStyle = stone;
    b.beginPath();
    b.moveTo(dx + dw * 0.5 - W * 0.012, doorTop - H * 0.006);
    b.lineTo(dx + dw * 0.5 + W * 0.012, doorTop - H * 0.006);
    b.lineTo(dx + dw * 0.5 + W * 0.007, doorTop - H * 0.030);
    b.lineTo(dx + dw * 0.5 - W * 0.007, doorTop - H * 0.030);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(20,12,14,0.24)';
    b.lineWidth = 1;
    b.stroke();

    /* 门廊灯：一对铁艺壁灯 */
    for (let s = 0; s < 2; s++) {
      const lx = s ? dx + dw + W * 0.036 : dx - W * 0.058;
      const ly = doorTop + H * 0.010;
      b.strokeStyle = 'rgba(26,20,18,0.9)';
      b.lineWidth = Math.max(1.6, W * 0.0016);
      b.beginPath();
      b.moveTo(lx, ly + H * 0.030);
      b.quadraticCurveTo(lx + (s ? -1 : 1) * W * 0.012, ly + H * 0.014, lx, ly);
      b.stroke();
      // 灯罩
      b.fillStyle = 'rgba(32,24,20,0.95)';
      b.beginPath();
      b.moveTo(lx - W * 0.009, ly);
      b.lineTo(lx + W * 0.009, ly);
      b.lineTo(lx + W * 0.006, ly + H * 0.026);
      b.lineTo(lx - W * 0.006, ly + H * 0.026);
      b.closePath(); b.fill();
      b.fillStyle = 'rgba(255,204,132,0.9)';
      b.fillRect(lx - W * 0.006, ly + H * 0.005, W * 0.012, H * 0.017);
      b.save();
      b.globalCompositeOperation = 'lighter';
      const lg = b.createRadialGradient(lx, ly + H * 0.014, 0, lx, ly + H * 0.014, W * 0.10);
      lg.addColorStop(0, 'rgba(255,196,120,0.32)');
      lg.addColorStop(0.4, 'rgba(255,184,106,0.10)');
      lg.addColorStop(1, 'rgba(255,184,106,0)');
      b.fillStyle = lg;
      b.fillRect(lx - W * 0.10, ly - W * 0.08, W * 0.20, W * 0.19);
      b.restore();
    }

    /* 门楣上的匾额：暖光衬底 */
    const signW = dw * 0.86, signH = H * 0.042;
    const signX = dx + dw * 0.07, signY = doorTop - H * 0.098;
    b.fillStyle = 'rgba(26,16,12,0.92)';
    b.fillRect(signX, signY, signW, signH);
    b.strokeStyle = 'rgba(196,158,96,0.65)';
    b.lineWidth = 1.6;
    b.strokeRect(signX + 2, signY + 2, signW - 4, signH - 4);
    b.strokeStyle = 'rgba(196,158,96,0.28)';
    b.strokeRect(signX + 5, signY + 5, signW - 10, signH - 10);
    b.fillStyle = 'rgba(238,208,148,0.92)';
    b.font = `${Math.max(10, signH * 0.62)}px "Noto Serif SC", serif`;
    b.textAlign = 'center';
    b.textBaseline = 'middle';
    b.fillText('老 剧 院', signX + signW * 0.5, signY + signH * 0.54);
    b.textBaseline = 'alphabetic';
    // 匾额下的小灯泡
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const bx0 = signX + signW * (0.06 + i * 0.11);
      b.fillStyle = 'rgba(255,214,150,0.85)';
      b.beginPath(); b.arc(bx0, signY + signH + H * 0.006, Math.max(1.2, W * 0.0016), 0, 6.3); b.fill();
      b.fillStyle = 'rgba(255,196,120,0.22)';
      b.beginPath(); b.arc(bx0, signY + signH + H * 0.006, Math.max(4, W * 0.007), 0, 6.3); b.fill();
    }
    b.restore();

    /* ---------- 右侧售票亭与木质雨廊 ---------- */
    const tbx = bx + bw * 0.845, tby = by + bh * 0.545;
    b.fillStyle = night ? 'rgba(34,24,28,0.95)' : 'rgba(104,70,48,0.95)';
    b.fillRect(tbx, tby, W * 0.125, H * 0.145);
    b.fillStyle = stone;
    b.fillRect(tbx - W * 0.006, tby - H * 0.010, W * 0.137, H * 0.012);
    // 售票窗
    b.fillStyle = night ? 'rgba(255,196,124,0.30)' : 'rgba(255,224,170,0.48)';
    b.fillRect(tbx + W * 0.020, tby + H * 0.028, W * 0.085, H * 0.058);
    b.strokeStyle = 'rgba(26,18,14,0.65)';
    b.lineWidth = 2;
    b.strokeRect(tbx + W * 0.020, tby + H * 0.028, W * 0.085, H * 0.058);
    b.beginPath();
    b.moveTo(tbx + W * 0.062, tby + H * 0.028);
    b.lineTo(tbx + W * 0.062, tby + H * 0.086);
    b.stroke();
    // 窗台与售票牌
    b.fillStyle = stone;
    b.fillRect(tbx + W * 0.014, tby + H * 0.086, W * 0.097, H * 0.006);
    b.fillStyle = 'rgba(28,18,12,0.8)';
    b.fillRect(tbx + W * 0.032, tby + H * 0.100, W * 0.061, H * 0.020);
    b.fillStyle = 'rgba(230,206,158,0.85)';
    b.font = `${Math.max(6, H * 0.010)}px "Noto Serif SC", serif`;
    b.textAlign = 'center';
    b.fillText('售 票', tbx + W * 0.0625, tby + H * 0.114);
    // 雨廊的瓦檐
    b.fillStyle = night ? '#241a20' : '#6e3a30';
    b.beginPath();
    b.moveTo(tbx - W * 0.010, tby - H * 0.020);
    b.lineTo(tbx + W * 0.145, tby - H * 0.020);
    b.lineTo(tbx + W * 0.130, tby - H * 0.036);
    b.lineTo(tbx + W * 0.005, tby - H * 0.036);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(255,236,206,0.12)';
    b.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const rx0 = tbx + W * (0.004 + i * 0.0076);
      b.beginPath(); b.moveTo(rx0, tby - H * 0.020); b.lineTo(rx0 + W * 0.002, tby - H * 0.035); b.stroke();
    }
    // 廊柱
    for (let i = 0; i < 2; i++) {
      const cxp = tbx + W * (0.012 + i * 0.115);
      b.fillStyle = night ? '#2a1e22' : '#5c3a2a';
      b.fillRect(cxp, tby + H * 0.010, W * 0.010, H * 0.150);
      b.fillStyle = 'rgba(255,240,214,0.10)';
      b.fillRect(cxp, tby + H * 0.010, 1.4, H * 0.150);
    }

    /* ---------- 左侧老槐树（框住画面） ---------- */
    drawPlaneTree(b, -W * 0.055, H * 1.03, H * 0.86,
      night ? '#1c1520' : '#4a3428',
      night ? '#142019' : '#4c6440',
      night ? 'rgba(170,192,228,0.12)' : 'rgba(255,214,150,0.20)',
      1, -1);

    // 右侧小槐树
    drawPlaneTree(b, W * 1.045, H * 1.01, H * 0.72,
      night ? '#1c1520' : '#4a3428',
      night ? '#142019' : '#4c6440',
      night ? 'rgba(170,192,228,0.10)' : 'rgba(255,214,150,0.18)',
      -1, -1);

    // 檐下的光晕（把门廊与匾额托出来）
    b.save();
    b.globalCompositeOperation = 'lighter';
    const porchGlow = b.createRadialGradient(dx + dw * 0.5, doorTop + H * 0.05, 0, dx + dw * 0.5, doorTop + H * 0.05, W * 0.16);
    porchGlow.addColorStop(0, night ? 'rgba(255,186,108,0.16)' : 'rgba(255,206,148,0.22)');
    porchGlow.addColorStop(0.45, night ? 'rgba(255,176,98,0.06)' : 'rgba(255,196,132,0.08)');
    porchGlow.addColorStop(1, 'rgba(255,176,98,0)');
    b.fillStyle = porchGlow;
    b.fillRect(dx - W * 0.14, doorTop - H * 0.10, dw + W * 0.28, H * 0.36);
    b.restore();
  }
  drawTheateryard.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    // 青石庭院
    const g = b.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, night ? '#282430' : day ? '#bcae96' : '#725c4c');
    g.addColorStop(0.55, night ? '#1c1822' : day ? '#a49680' : '#5e483c');
    g.addColorStop(1, night ? '#0e0c14' : day ? '#867860' : '#40302c');
    b.fillStyle = g;
    b.fillRect(0, horizon, W, H - horizon);

    // 石板铺装：横向错缝 + 透视竖缝
    const rowN = 9;
    for (let r = 0; r < rowN; r++) {
      const t0 = r / rowN, t1 = (r + 1) / rowN;
      const y0 = horizon + Math.pow(t0, 1.45) * (H - horizon);
      const y1 = horizon + Math.pow(t1, 1.45) * (H - horizon);
      const cols = 10 + r * 2;
      for (let c = 0; c < cols; c++) {
        const off = (r % 2) * 0.5;
        const x0 = W * ((c - 0.4 + off * 0.5) / cols) - W * 0.05;
        const x1 = W * ((c + 0.6 + off * 0.5) / cols) - W * 0.05;
        const v = perm(r * 31 + c, 13);
        if (v > 0.78) {
          b.fillStyle = `rgba(255,244,220,${0.012 + (v - 0.78) * 0.10})`;
          b.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
        } else if (v < 0.18) {
          b.fillStyle = `rgba(10,8,12,${0.03 + (0.18 - v) * 0.14})`;
          b.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
        }
      }
      b.strokeStyle = night ? 'rgba(150,142,158,0.07)' : 'rgba(52,38,30,0.17)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(0, y0); b.lineTo(W, y0); b.stroke();
    }
    // 放射状石板缝：向门口收束
    const vanishX = W * 0.5;
    for (let i = 0; i < 18; i++) {
      const xx = (i / 18) * W;
      b.strokeStyle = night ? 'rgba(150,142,158,0.06)' : 'rgba(52,38,30,0.14)';
      b.beginPath();
      b.moveTo(vanishX + (xx - vanishX) * 0.18, horizon);
      b.lineTo(xx, H);
      b.stroke();
    }

    // 石面裂纹与苔痕
    for (let i = 0; i < 10; i++) {
      const cx0 = rand(W * 0.02, W * 0.98);
      const cy0 = rand(horizon + H * 0.05, H);
      b.strokeStyle = 'rgba(20,14,16,0.10)';
      b.lineWidth = 0.8;
      b.beginPath();
      b.moveTo(cx0, cy0);
      let px0 = cx0, py0 = cy0;
      for (let s = 0; s < 5; s++) {
        px0 += rand(-W * 0.02, W * 0.02);
        py0 += rand(-H * 0.006, H * 0.006);
        b.lineTo(px0, py0);
      }
      b.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const yy = horizon + Math.pow(rand(0, 1), 0.7) * (H - horizon);
      b.fillStyle = `rgba(${night ? '30,52,34' : '58,82,46'},${rand(0.04, 0.10)})`;
      b.beginPath();
      b.ellipse(rand(0, W), yy, rand(8, 30), rand(2, 6), 0, 0, 6.3);
      b.fill();
    }

    // 檐下阴影（靠近楼体的一带）
    const under = b.createLinearGradient(0, horizon, 0, horizon + H * 0.10);
    under.addColorStop(0, 'rgba(8,6,10,0.34)');
    under.addColorStop(1, 'rgba(8,6,10,0)');
    b.fillStyle = under;
    b.fillRect(0, horizon, W, H * 0.10);

    // 树影
    b.save();
    b.globalCompositeOperation = 'multiply';
    b.fillStyle = 'rgba(18,10,16,0.30)';
    b.beginPath();
    b.moveTo(0, horizon - H * 0.01);
    b.lineTo(W * 0.24, horizon - H * 0.01);
    b.lineTo(W * 0.10, H);
    b.lineTo(-W * 0.06, H);
    b.closePath(); b.fill();
    b.fillStyle = 'rgba(18,10,16,0.16)';
    for (let i = 0; i < 16; i++) {
      b.beginPath();
      b.ellipse(W * rand(0.0, 0.30), rand(H * 0.64, H * 0.98), W * rand(0.02, 0.07), H * rand(0.006, 0.016), rand(0, 3), 0, 6.3);
      b.fill();
    }
    b.restore();

    /* 门前台阶：踏面、踢面与石缝分明 */
    const steps = 5;
    const stepTop = horizon + H * 0.001;
    const stepRise = H * 0.0145;
    const stepTreadH = H * 0.0115;
    for (let i = 0; i < steps; i++) {
      const stW = W * (0.235 + i * 0.028);
      const stX = W * 0.5 - stW * 0.5;
      const yy = stepTop + i * stepRise;
      const tone = night ? 52 + i * 5 : day ? 168 + i * 4 : 104 + i * 7;
      // 踢面：躲在踏面下的暗竖面
      const riser = b.createLinearGradient(0, yy + stepTreadH, 0, yy + stepRise);
      riser.addColorStop(0, `rgba(${tone - 42},${tone - 46},${tone - 44},0.97)`);
      riser.addColorStop(1, `rgba(${tone - 22},${tone - 26},${tone - 26},0.97)`);
      b.fillStyle = riser;
      b.beginPath();
      b.moveTo(stX - W * 0.003, yy + stepTreadH);
      b.lineTo(stX + stW + W * 0.003, yy + stepTreadH);
      b.lineTo(stX + stW + W * 0.001, yy + stepRise);
      b.lineTo(stX - W * 0.001, yy + stepRise);
      b.closePath(); b.fill();
      // 踏面：靠门一侧受光
      const tread = b.createLinearGradient(0, yy, 0, yy + stepTreadH);
      tread.addColorStop(0, `rgba(${tone + 12},${tone + 8},${tone + 2},0.97)`);
      tread.addColorStop(0.70, `rgba(${tone + 2},${tone - 2},${tone - 6},0.97)`);
      tread.addColorStop(1, `rgba(${tone - 10},${tone - 14},${tone - 16},0.97)`);
      b.fillStyle = tread;
      b.beginPath();
      b.moveTo(stX, yy);
      b.lineTo(stX + stW, yy);
      b.lineTo(stX + stW - W * 0.003, yy + stepTreadH);
      b.lineTo(stX + W * 0.003, yy + stepTreadH);
      b.closePath(); b.fill();
      // 踏面前缘的磨光与石缝
      b.fillStyle = night ? 'rgba(228,222,208,0.09)' : 'rgba(255,250,234,0.20)';
      b.fillRect(stX + W * 0.003, yy + stepTreadH - 1, stW - W * 0.006, 1);
      b.strokeStyle = night ? 'rgba(20,18,24,0.22)' : 'rgba(60,44,34,0.16)';
      b.lineWidth = 0.8;
      for (let k = 1; k <= 3; k++) {
        const jx = stX + stW * (k / 4);
        b.beginPath(); b.moveTo(jx, yy + 1); b.lineTo(jx, yy + stepTreadH - 1); b.stroke();
      }
    }
    // 台阶投在石板上的柔和阴影
    b.fillStyle = 'rgba(8,6,10,0.15)';
    b.beginPath();
    b.moveTo(W * 0.5 - W * 0.176, stepTop + steps * stepRise);
    b.lineTo(W * 0.5 + W * 0.176, stepTop + steps * stepRise);
    b.lineTo(W * 0.5 + W * 0.188, stepTop + steps * stepRise + H * 0.009);
    b.lineTo(W * 0.5 - W * 0.188, stepTop + steps * stepRise + H * 0.009);
    b.closePath(); b.fill();

    // 门内暖光洒在石板上
    b.save();
    b.globalCompositeOperation = 'lighter';
    const pool = b.createLinearGradient(W * 0.5, horizon, W * 0.5, H * 0.88);
    pool.addColorStop(0, night ? 'rgba(255,178,102,0.15)' : 'rgba(255,196,132,0.18)');
    pool.addColorStop(0.55, night ? 'rgba(255,170,96,0.05)' : 'rgba(255,190,126,0.06)');
    pool.addColorStop(1, 'rgba(255,170,96,0)');
    b.fillStyle = pool;
    b.beginPath();
    b.moveTo(W * 0.415, horizon);
    b.lineTo(W * 0.585, horizon);
    b.lineTo(W * 0.66, H * 0.88);
    b.lineTo(W * 0.34, H * 0.88);
    b.closePath(); b.fill();
    // 灯笼在地面的两团光
    for (let s = 0; s < 2; s++) {
      const lx = s ? W * 0.645 : W * 0.355;
      const lg = b.createRadialGradient(lx, horizon + H * 0.09, 0, lx, horizon + H * 0.09, W * 0.085);
      lg.addColorStop(0, 'rgba(255,190,112,0.18)');
      lg.addColorStop(1, 'rgba(255,190,112,0)');
      b.fillStyle = lg;
      b.fillRect(lx - W * 0.09, horizon, W * 0.18, H * 0.20);
    }
    b.restore();

    // 雨后积水：倒映门廊的暖光
    const puddles = [
      [W * 0.235, H * 0.845, W * 0.085, H * 0.020],
      [W * 0.735, H * 0.905, W * 0.065, H * 0.016],
      [W * 0.560, H * 0.800, W * 0.045, H * 0.011],
    ];
    for (const [px0, py0, pw0, ph0] of puddles) {
      b.save();
      b.beginPath(); b.ellipse(px0, py0, pw0, ph0, 0, 0, 6.3); b.clip();
      b.fillStyle = night ? 'rgba(18,16,24,0.55)' : 'rgba(60,58,60,0.35)';
      b.fillRect(px0 - pw0, py0 - ph0, pw0 * 2, ph0 * 2);
      const refl = b.createLinearGradient(0, py0 - ph0, 0, py0 + ph0);
      refl.addColorStop(0, 'rgba(255,196,128,0.16)');
      refl.addColorStop(0.5, 'rgba(255,186,112,0.06)');
      refl.addColorStop(1, 'rgba(255,186,112,0)');
      b.fillStyle = refl;
      b.fillRect(px0 - pw0, py0 - ph0, pw0 * 2, ph0 * 2);
      b.restore();
    }

    // 落叶
    for (let i = 0; i < 64; i++) {
      const xx = rand(0, W), yy = rand(horizon + H * 0.02, H);
      const depth = (yy - horizon) / (H - horizon);
      b.fillStyle = `rgba(${140 + (i % 5) * 18},${92 + (i % 4) * 14},${40 + (i % 3) * 12},${rand(0.30, 0.62)})`;
      b.save();
      b.translate(xx, yy);
      b.rotate(rand(0, 6.3));
      b.beginPath();
      b.ellipse(0, 0, 1.6 + depth * 5, 0.8 + depth * 2.2, 0, 0, 6.3);
      b.fill();
      b.restore();
    }

    // 左侧石花坛：矮灌木从坛口漫出来
    const fx = W * 0.040, fy = H * 0.900;
    const fw = W * 0.175, fh = H * 0.062;
    // 坛体
    const stoneG3 = b.createLinearGradient(0, fy, 0, fy + fh);
    stoneG3.addColorStop(0, night ? '#3a3442' : '#8a7e68');
    stoneG3.addColorStop(0.35, night ? '#2c2834' : '#726752');
    stoneG3.addColorStop(1, night ? '#1a1620' : '#564c3c');
    b.fillStyle = stoneG3;
    b.fillRect(fx, fy, fw, fh);
    // 坛口压顶
    b.fillStyle = night ? '#443e4c' : '#9a8e76';
    b.fillRect(fx - W * 0.004, fy - H * 0.006, fw + W * 0.008, H * 0.010);
    b.fillStyle = 'rgba(255,248,230,0.12)';
    b.fillRect(fx - W * 0.004, fy - H * 0.006, fw + W * 0.008, 1.4);
    // 坛内泥土
    b.fillStyle = night ? '#181410' : '#4a3a2a';
    b.fillRect(fx + W * 0.006, fy - H * 0.002, fw - W * 0.012, H * 0.006);
    // 灌木：三团，前低后高
    const shrub = (cxp, cyp, rw, rh, tone) => {
      const sg = b.createRadialGradient(cxp - rw * 0.3, cyp - rh * 0.4, rh * 0.15, cxp, cyp, rw);
      sg.addColorStop(0, `rgba(${tone[0]},${tone[1]},${tone[2]},0.98)`);
      sg.addColorStop(0.7, `rgba(${tone[0] - 14},${tone[1] - 16},${tone[2] - 10},0.96)`);
      sg.addColorStop(1, `rgba(${tone[0] - 24},${tone[1] - 28},${tone[2] - 16},0.90)`);
      b.fillStyle = sg;
      b.beginPath();
      b.ellipse(cxp, cyp, rw, rh, 0, 0, 6.3);
      b.fill();
      // 叶簇：沿外缘一圈深色缺口
      b.fillStyle = `rgba(${tone[0] - 28},${tone[1] - 32},${tone[2] - 18},0.55)`;
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + (k / 6) * Math.PI;
        const lx3 = cxp + Math.cos(a) * rw * 0.82;
        const ly3 = cyp + Math.sin(a) * rh * 0.82;
        b.beginPath(); b.ellipse(lx3, ly3, rw * 0.16, rh * 0.20, a, 0, 6.3); b.fill();
      }
      // 受光面
      b.fillStyle = night ? 'rgba(150,190,160,0.10)' : 'rgba(196,220,160,0.20)';
      b.beginPath(); b.ellipse(cxp - rw * 0.25, cyp - rh * 0.45, rw * 0.46, rh * 0.34, -0.3, 0, 6.3); b.fill();
    };
    const green = night ? [44, 66, 48] : day ? [96, 124, 72] : [62, 86, 56];
    shrub(fx + fw * 0.20, fy - H * 0.020, fw * 0.145, H * 0.030, green);
    shrub(fx + fw * 0.47, fy - H * 0.032, fw * 0.175, H * 0.038, green);
    shrub(fx + fw * 0.78, fy - H * 0.022, fw * 0.150, H * 0.031, green);
    // 垂到坛沿外的枝叶
    for (let i = 0; i < 16; i++) {
      const lx3 = fx + fw * (0.08 + (i / 15) * 0.84) + rand(-6, 6);
      const ly3 = fy - H * (0.004 + perm(i, 57) * 0.012);
      b.strokeStyle = `rgba(${night ? '34,54,38' : '58,84,44'},${rand(0.35, 0.65)})`;
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(lx3, ly3);
      b.quadraticCurveTo(lx3 + rand(-4, 4), ly3 + rand(4, 8), lx3 + rand(-7, 7), ly3 + rand(8, 16));
      b.stroke();
    }
    // 白花
    for (let i = 0; i < 14; i++) {
      const bx0 = fx + rand(W * 0.02, fw - W * 0.02);
      const by0 = fy - rand(H * 0.012, H * 0.058);
      b.fillStyle = `rgba(242,238,224,${rand(0.35, 0.65)})`;
      b.beginPath(); b.arc(bx0, by0, rand(1, 1.8), 0, 6.3); b.fill();
    }
    // 石凳
    const sx0 = W * 0.245, sy0 = H * 0.940;
    b.fillStyle = night ? 'rgba(52,44,54,0.95)' : 'rgba(150,140,120,0.95)';
    b.fillRect(sx0, sy0 - H * 0.020, W * 0.115, H * 0.012);
    b.fillStyle = 'rgba(255,246,226,0.09)';
    b.fillRect(sx0, sy0 - H * 0.020, W * 0.115, 1.4);
    b.fillStyle = night ? 'rgba(36,30,38,0.95)' : 'rgba(116,108,92,0.95)';
    b.fillRect(sx0 + W * 0.010, sy0 - H * 0.008, W * 0.012, H * 0.026);
    b.fillRect(sx0 + W * 0.093, sy0 - H * 0.008, W * 0.012, H * 0.026);

    // 场边一架木质海报板：A 字支架、海报纸与玻璃反光
    const posterBoard = (bx1, by1, sc1) => {
      const bw1 = W * 0.072 * sc1, bh1 = H * 0.150 * sc1;
      b.fillStyle = 'rgba(0,0,0,0.24)';
      b.beginPath(); b.ellipse(bx1, by1 + H * 0.004, bw1 * 0.60, H * 0.008 * sc1, 0, 0, 6.3); b.fill();
      b.strokeStyle = night ? '#3a2c26' : '#7a5238';
      b.lineWidth = Math.max(2, W * 0.0024);
      b.beginPath();
      b.moveTo(bx1 - bw1 * 0.46, by1);
      b.lineTo(bx1 - bw1 * 0.30, by1 - bh1);
      b.moveTo(bx1 + bw1 * 0.46, by1);
      b.lineTo(bx1 + bw1 * 0.30, by1 - bh1);
      b.stroke();
      const pg = b.createLinearGradient(bx1 - bw1 * 0.5, 0, bx1 + bw1 * 0.5, 0);
      pg.addColorStop(0, night ? '#241a20' : '#5e4030');
      pg.addColorStop(0.5, night ? '#332630' : '#7a5238');
      pg.addColorStop(1, night ? '#1c141a' : '#4a3024');
      b.fillStyle = pg;
      b.beginPath();
      b.moveTo(bx1 - bw1 * 0.34, by1 - bh1 * 0.04);
      b.lineTo(bx1 + bw1 * 0.34, by1 - bh1 * 0.06);
      b.lineTo(bx1 + bw1 * 0.34, by1 - bh1 * 0.92);
      b.lineTo(bx1 - bw1 * 0.34, by1 - bh1 * 0.90);
      b.closePath(); b.fill();
      // 海报纸
      b.fillStyle = night ? 'rgba(212,200,176,0.52)' : 'rgba(238,226,198,0.92)';
      b.beginPath();
      b.moveTo(bx1 - bw1 * 0.28, by1 - bh1 * 0.10);
      b.lineTo(bx1 + bw1 * 0.28, by1 - bh1 * 0.115);
      b.lineTo(bx1 + bw1 * 0.28, by1 - bh1 * 0.86);
      b.lineTo(bx1 - bw1 * 0.28, by1 - bh1 * 0.845);
      b.closePath(); b.fill();
      // 标题与几行小字
      b.fillStyle = night ? 'rgba(40,30,26,0.78)' : 'rgba(46,32,24,0.85)';
      b.textAlign = 'center';
      b.font = `${Math.max(7, H * 0.014 * sc1)}px "Noto Serif SC", serif`;
      b.fillText('悲 怆', bx1, by1 - bh1 * 0.67);
      b.font = `${Math.max(4.5, H * 0.008 * sc1)}px "Noto Serif SC", serif`;
      b.fillText('第二乐章', bx1, by1 - bh1 * 0.60);
      b.strokeStyle = 'rgba(60,44,32,0.40)';
      b.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        b.beginPath();
        b.moveTo(bx1 - bw1 * 0.20, by1 - bh1 * (0.50 - i * 0.055));
        b.lineTo(bx1 + bw1 * 0.20, by1 - bh1 * (0.50 - i * 0.055));
        b.stroke();
      }
      b.fillStyle = 'rgba(220,232,248,0.06)';
      b.beginPath();
      b.moveTo(bx1 - bw1 * 0.26, by1 - bh1 * 0.16);
      b.lineTo(bx1 + bw1 * 0.04, by1 - bh1 * 0.84);
      b.lineTo(bx1 + bw1 * 0.14, by1 - bh1 * 0.84);
      b.lineTo(bx1 - bw1 * 0.16, by1 - bh1 * 0.16);
      b.closePath(); b.fill();
      b.textAlign = 'left';
    };
    posterBoard(W * 0.898, H * 0.876, 0.86);

    // 右侧铁艺围栏与灯柱
    const railY = H * 0.865;
    b.strokeStyle = night ? 'rgba(34,30,36,0.9)' : 'rgba(60,50,46,0.8)';
    b.lineWidth = 1.4;
    b.beginPath();
    b.moveTo(W * 0.80, railY);
    b.lineTo(W * 0.99, railY - H * 0.015);
    b.moveTo(W * 0.80, railY + H * 0.020);
    b.lineTo(W * 0.99, railY + H * 0.005);
    b.stroke();
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      const xx = W * (0.80 + t * 0.19);
      const yy = railY - H * 0.015 * t;
      b.beginPath(); b.moveTo(xx, yy); b.lineTo(xx, yy + H * 0.020); b.stroke();
    }
    // 灯柱
    const lampX = W * 0.795, lampY = H * 0.735;
    b.fillStyle = night ? 'rgba(30,26,32,0.95)' : 'rgba(52,44,40,0.9)';
    b.fillRect(lampX, lampY, W * 0.008, H * 0.150);
    b.fillStyle = 'rgba(255,200,126,0.85)';
    b.beginPath();
    b.moveTo(lampX - W * 0.012, lampY);
    b.lineTo(lampX + W * 0.020, lampY);
    b.lineTo(lampX + W * 0.014, lampY - H * 0.022);
    b.lineTo(lampX - W * 0.006, lampY - H * 0.022);
    b.closePath(); b.fill();
    b.save();
    b.globalCompositeOperation = 'lighter';
    const lg2 = b.createRadialGradient(lampX + W * 0.004, lampY - H * 0.010, 0, lampX + W * 0.004, lampY - H * 0.010, W * 0.10);
    lg2.addColorStop(0, 'rgba(255,196,120,0.30)');
    lg2.addColorStop(1, 'rgba(255,196,120,0)');
    b.fillStyle = lg2;
    b.fillRect(lampX - W * 0.10, lampY - W * 0.10, W * 0.22, W * 0.20);
    b.restore();
  };

  /* ---------- 场景：老剧院主厅（夜晚） ---------- */
  function drawTheater(b, p, horizon) {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const p2 = PALETTES[state.time] || PALETTES.night;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const gold = night ? 'rgba(164,132,78,0.55)' : 'rgba(198,164,104,0.65)';

    /* ---------- 侧墙：灰泥墙面、护墙板与壁灯 ---------- */
    const wallG = b.createLinearGradient(0, 0, 0, horizon);
    wallG.addColorStop(0, night ? '#1b1522' : '#3e2e30');
    wallG.addColorStop(0.55, night ? '#171220' : '#37282a');
    wallG.addColorStop(1, night ? '#100c18' : '#281c1e');
    b.fillStyle = wallG;
    b.fillRect(0, 0, W, horizon);
    // 墙面灰泥的斑驳
    for (let i = 0; i < 40; i++) {
      b.fillStyle = `rgba(${night ? '90,74,80' : '150,120,100'},${rand(0.015, 0.05)})`;
      b.beginPath();
      b.ellipse(rand(0, W), rand(0, horizon * 0.7), rand(10, 44), rand(6, 22), rand(-0.4, 0.4), 0, 6.3);
      b.fill();
    }
    // 木墙裙
    b.fillStyle = night ? '#211827' : '#4c3626';
    b.fillRect(0, horizon * 0.545, W, horizon * 0.22);
    b.fillStyle = 'rgba(255,226,180,0.07)';
    b.fillRect(0, horizon * 0.545, W, 1.6);
    b.strokeStyle = night ? 'rgba(120,96,104,0.20)' : 'rgba(28,16,14,0.34)';
    b.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const xx = W * (i / 26);
      b.strokeRect(xx + W * 0.006, horizon * 0.565, W * 0.026, horizon * 0.175);
    }

    /* ---------- 两侧楼座：拱形包厢、红丝绒栏板与金线 ---------- */
    for (const side of [0, 1]) {
      const bxx = side ? W * 0.760 : 0;
      const bwd = W * 0.240;
      b.fillStyle = night ? 'rgba(24,18,30,0.96)' : 'rgba(56,40,38,0.92)';
      b.fillRect(bxx, horizon * 0.235, bwd, horizon * 0.335);
      // 包厢拱形开口
      for (let i = 0; i < 2; i++) {
        const ax = bxx + bwd * (0.085 + i * 0.475);
        const aw = bwd * 0.355, ah = horizon * 0.175;
        const ay = horizon * 0.375;
        b.fillStyle = night ? 'rgba(9,7,14,0.88)' : 'rgba(26,18,22,0.85)';
        b.beginPath();
        b.moveTo(ax, horizon * 0.545);
        b.lineTo(ax, ay + ah * 0.42);
        b.quadraticCurveTo(ax + aw * 0.5, ay - ah * 0.30, ax + aw, ay + ah * 0.42);
        b.lineTo(ax + aw, horizon * 0.545);
        b.closePath(); b.fill();
        // 拱券金线
        b.strokeStyle = gold;
        b.lineWidth = 1.6;
        b.beginPath();
        b.moveTo(ax, horizon * 0.545);
        b.lineTo(ax, ay + ah * 0.42);
        b.quadraticCurveTo(ax + aw * 0.5, ay - ah * 0.30, ax + aw, ay + ah * 0.42);
        b.lineTo(ax + aw, horizon * 0.545);
        b.stroke();
        // 包厢内的一盏小灯
        b.save();
        b.globalCompositeOperation = 'lighter';
        const bg = b.createRadialGradient(ax + aw * 0.5, ay + ah * 0.60, 0, ax + aw * 0.5, ay + ah * 0.60, aw * 0.55);
        bg.addColorStop(0, 'rgba(255,188,116,0.16)');
        bg.addColorStop(1, 'rgba(255,188,116,0)');
        b.fillStyle = bg;
        b.fillRect(ax, ay, aw, ah);
        b.restore();
        // 侧幕帘
        b.fillStyle = 'rgba(72,20,28,0.62)';
        b.beginPath();
        b.moveTo(ax, ay + ah * 0.40);
        b.quadraticCurveTo(ax + aw * 0.10, horizon * 0.42, ax + aw * 0.04, horizon * 0.545);
        b.lineTo(ax, horizon * 0.545);
        b.closePath(); b.fill();
        b.beginPath();
        b.moveTo(ax + aw, ay + ah * 0.40);
        b.quadraticCurveTo(ax + aw * 0.90, horizon * 0.42, ax + aw * 0.96, horizon * 0.545);
        b.lineTo(ax + aw, horizon * 0.545);
        b.closePath(); b.fill();
      }
      // 红丝绒栏板
      const railY = horizon * 0.545;
      const rg = b.createLinearGradient(0, railY, 0, railY + horizon * 0.075);
      rg.addColorStop(0, night ? '#4a1822' : '#6e2430');
      rg.addColorStop(0.5, night ? '#390f1a' : '#5a1a26');
      rg.addColorStop(1, night ? '#24080f' : '#401018');
      b.fillStyle = rg;
      b.fillRect(bxx, railY, bwd, horizon * 0.075);
      // 栏板高光与金边
      b.fillStyle = 'rgba(255,196,150,0.10)';
      b.fillRect(bxx, railY, bwd, 2);
      b.strokeStyle = gold;
      b.lineWidth = 1.4;
      b.beginPath();
      b.moveTo(bxx, railY + 2); b.lineTo(bxx + bwd, railY + 2);
      b.moveTo(bxx, railY + horizon * 0.075); b.lineTo(bxx + bwd, railY + horizon * 0.075);
      b.stroke();
      // 栏板上的金线花纹
      for (let i = 0; i < 8; i++) {
        const gx = bxx + bwd * (0.05 + i * 0.12);
        b.strokeStyle = 'rgba(190,158,96,0.30)';
        b.beginPath();
        b.arc(gx, railY + horizon * 0.038, horizon * 0.016, 0, 6.3);
        b.stroke();
      }
      // 栏杆立柱
      b.strokeStyle = night ? 'rgba(150,116,92,0.45)' : 'rgba(98,58,40,0.62)';
      b.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const gx = bxx + bwd * (0.01 + i * 0.142);
        b.beginPath();
        b.moveTo(gx, railY + horizon * 0.075);
        b.lineTo(gx, railY + horizon * 0.092);
        b.stroke();
      }
      // 楼座下的壁灯
      for (let i = 0; i < 2; i++) {
        const lx = bxx + bwd * (0.22 + i * 0.50);
        const ly = horizon * 0.665;
        b.fillStyle = 'rgba(255,206,140,0.85)';
        b.beginPath();
        b.moveTo(lx - W * 0.007, ly);
        b.lineTo(lx + W * 0.007, ly);
        b.lineTo(lx + W * 0.004, ly - H * 0.016);
        b.lineTo(lx - W * 0.004, ly - H * 0.016);
        b.closePath(); b.fill();
        b.save();
        b.globalCompositeOperation = 'lighter';
        const sg = b.createRadialGradient(lx, ly - H * 0.008, 0, lx, ly - H * 0.008, W * 0.075);
        sg.addColorStop(0, 'rgba(255,196,120,0.26)');
        sg.addColorStop(1, 'rgba(255,196,120,0)');
        b.fillStyle = sg;
        b.fillRect(lx - W * 0.08, ly - W * 0.08, W * 0.16, W * 0.16);
        b.restore();
      }
    }

    /* ---------- 拱顶：藻井与中央椭圆天窗 ---------- */
    const ceilBase = H * 0.215;
    // 拱顶底色
    const domeG = b.createLinearGradient(0, 0, 0, ceilBase);
    domeG.addColorStop(0, night ? '#241b2c' : '#5a4440');
    domeG.addColorStop(0.6, night ? '#1c1524' : '#4a3636');
    domeG.addColorStop(1, night ? '#161020' : '#3a2a2a');
    b.fillStyle = domeG;
    b.beginPath();
    b.moveTo(0, ceilBase);
    b.quadraticCurveTo(W * 0.5, -H * 0.10, W, ceilBase);
    b.lineTo(W, 0); b.lineTo(0, 0); b.closePath(); b.fill();
    // 拱肋与藻井格
    b.strokeStyle = night ? 'rgba(150,124,96,0.16)' : 'rgba(196,166,120,0.28)';
    b.lineWidth = 1.4;
    for (let i = 1; i < 6; i++) {
      const xx = (i / 6) * W;
      b.beginPath();
      b.moveTo(xx, ceilBase - Math.sin((i / 6) * Math.PI) * H * 0.02);
      b.quadraticCurveTo(xx + (W * 0.5 - xx) * 0.5, H * 0.02, W * 0.5, H * 0.015);
      b.stroke();
    }
    for (let r = 1; r < 5; r++) {
      const t = r / 5;
      const yy = H * 0.015 + (ceilBase - H * 0.015) * t;
      const half = W * 0.5 * Math.sin(t * Math.PI * 0.5);
      b.beginPath();
      b.moveTo(W * 0.5 - half, yy);
      b.quadraticCurveTo(W * 0.5, yy + H * 0.012, W * 0.5 + half, yy);
      b.stroke();
    }
    // 藻井里的暗金花饰
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * 6.283;
      const rr = W * (0.10 + (i % 3) * 0.055);
      b.fillStyle = night ? 'rgba(170,138,84,0.10)' : 'rgba(210,180,126,0.18)';
      b.beginPath();
      b.ellipse(W * 0.5 + Math.cos(a) * rr, H * 0.095 + Math.sin(a) * rr * 0.22,
        W * 0.012, H * 0.006, a, 0, 6.3);
      b.fill();
    }
    // 中央椭圆天窗：层层退进的窗框
    const ocx = W * 0.5, ocy = H * 0.085;
    const orx = W * 0.085, ory = H * 0.052;
    for (let i = 3; i >= 0; i--) {
      b.fillStyle = i % 2
        ? (night ? 'rgba(56,46,54,0.9)' : 'rgba(150,130,110,0.9)')
        : (night ? 'rgba(32,26,34,0.95)' : 'rgba(112,92,78,0.95)');
      b.beginPath();
      b.ellipse(ocx, ocy + i * 1.6, orx * (1 + i * 0.10), ory * (1 + i * 0.10), 0, 0, 6.3);
      b.fill();
    }
    b.save();
    b.beginPath(); b.ellipse(ocx, ocy, orx, ory, 0, 0, 6.3); b.clip();
    const skyG = b.createLinearGradient(0, ocy - ory, 0, ocy + ory);
    skyG.addColorStop(0, '#0a1230');
    skyG.addColorStop(1, '#243458');
    b.fillStyle = skyG;
    b.fillRect(ocx - orx, ocy - ory, orx * 2, ory * 2);
    for (let i = 0; i < 22; i++) {
      b.fillStyle = `rgba(226,234,255,${rand(0.15, 0.6)})`;
      b.beginPath();
      b.arc(ocx + rand(-orx, orx), ocy + rand(-ory, ory), rand(0.4, 1.0), 0, 6.3);
      b.fill();
    }
    // 窗外的月：只露半个，贴着窗沿
    const mx = ocx - orx * 0.34, my = ocy - ory * 0.20, mr = ory * 0.34;
    const halo = b.createRadialGradient(mx, my, mr * 0.3, mx, my, mr * 3.2);
    halo.addColorStop(0, 'rgba(232,238,255,0.42)');
    halo.addColorStop(1, 'rgba(210,222,255,0)');
    b.fillStyle = halo;
    b.beginPath(); b.arc(mx, my, mr * 3.2, 0, 6.3); b.fill();
    b.fillStyle = '#efece0';
    b.beginPath(); b.arc(mx, my, mr, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(190,192,186,0.35)';
    b.beginPath(); b.ellipse(mx + mr * 0.24, my + mr * 0.18, mr * 0.30, mr * 0.20, 0.4, 0, 6.3); b.fill();
    b.restore();
    // 窗框金边与放射窗棂
    b.strokeStyle = gold;
    b.lineWidth = 2;
    b.beginPath(); b.ellipse(ocx, ocy, orx, ory, 0, 0, 6.3); b.stroke();
    b.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283;
      b.beginPath();
      b.moveTo(ocx + Math.cos(a) * orx * 0.10, ocy + Math.sin(a) * ory * 0.10);
      b.lineTo(ocx + Math.cos(a) * orx * 0.96, ocy + Math.sin(a) * ory * 0.96);
      b.stroke();
    }
    b.beginPath(); b.ellipse(ocx, ocy, orx * 0.34, ory * 0.34, 0, 0, 6.3); b.stroke();

    /* ---------- 台口：雕花拱、金饰与两侧立柱 ---------- */
    const openL = W * 0.125, openR = W * 0.875;
    const openTop = H * 0.155;
    const stageY = horizon - H * 0.015;
    // 台口外框
    const frameG = b.createLinearGradient(0, openTop, 0, stageY);
    frameG.addColorStop(0, night ? '#2a2032' : '#6a5042');
    frameG.addColorStop(0.5, night ? '#221a2c' : '#5c4438');
    frameG.addColorStop(1, night ? '#1a1424' : '#4a342c');
    b.fillStyle = frameG;
    b.beginPath();
    b.moveTo(0, 0);
    b.lineTo(W, 0);
    b.lineTo(W, stageY);
    b.lineTo(openR, stageY);
    b.lineTo(openR, openTop);
    b.quadraticCurveTo(W * 0.5, H * 0.045, openL, openTop);
    b.lineTo(openL, stageY);
    b.lineTo(0, stageY);
    b.closePath(); b.fill();

    // 台口柱：凹槽与柱头
    for (const side of [0, 1]) {
      const cx0 = side ? W * 0.905 : W * 0.048;
      const cwid = W * 0.047;
      const cg = b.createLinearGradient(cx0, 0, cx0 + cwid, 0);
      cg.addColorStop(0, night ? '#18111e' : '#3e2a26');
      cg.addColorStop(0.45, night ? '#33273a' : '#6e5242');
      cg.addColorStop(1, night ? '#1a1220' : '#402c26');
      b.fillStyle = cg;
      b.fillRect(cx0, openTop - H * 0.02, cwid, stageY - openTop + H * 0.02);
      // 凹槽
      b.strokeStyle = 'rgba(0,0,0,0.22)';
      b.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        b.beginPath();
        b.moveTo(cx0 + cwid * (i / 6), openTop);
        b.lineTo(cx0 + cwid * (i / 6), stageY);
        b.stroke();
      }
      // 柱头与柱础
      b.fillStyle = night ? 'rgba(120,96,70,0.35)' : 'rgba(204,172,120,0.55)';
      b.fillRect(cx0 - W * 0.008, openTop - H * 0.035, cwid + W * 0.016, H * 0.020);
      b.fillRect(cx0 - W * 0.006, stageY - H * 0.030, cwid + W * 0.012, H * 0.030);
      b.strokeStyle = gold;
      b.lineWidth = 1.2;
      b.strokeRect(cx0 - W * 0.008, openTop - H * 0.035, cwid + W * 0.016, H * 0.020);
    }

    // 台口拱的金色线脚（多重）
    for (let i = 0; i < 3; i++) {
      b.strokeStyle = i === 0 ? gold : i === 1 ? 'rgba(120,96,60,0.45)' : 'rgba(190,160,104,0.30)';
      b.lineWidth = i === 0 ? 3 : 1.4;
      b.beginPath();
      b.moveTo(openL - W * 0.012 - i * 4, stageY);
      b.lineTo(openL - W * 0.012 - i * 4, openTop + H * 0.008);
      b.quadraticCurveTo(W * 0.5, H * 0.035 - i * 5, openR + W * 0.012 + i * 4, openTop + H * 0.008);
      b.lineTo(openR + W * 0.012 + i * 4, stageY);
      b.stroke();
    }
    // 拱心浮雕：竖琴纹样
    const crestX = W * 0.5, crestY = H * 0.075;
    b.fillStyle = night ? 'rgba(120,96,62,0.30)' : 'rgba(210,180,126,0.45)';
    b.beginPath();
    b.ellipse(crestX, crestY, W * 0.045, H * 0.030, 0, 0, 6.3);
    b.fill();
    b.strokeStyle = gold;
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(crestX - W * 0.016, crestY + H * 0.012);
    b.quadraticCurveTo(crestX - W * 0.024, crestY - H * 0.014, crestX - W * 0.008, crestY - H * 0.020);
    b.moveTo(crestX + W * 0.018, crestY + H * 0.012);
    b.quadraticCurveTo(crestX + W * 0.026, crestY - H * 0.014, crestX + W * 0.010, crestY - H * 0.020);
    b.stroke();
    for (let i = 0; i < 5; i++) {
      b.beginPath();
      b.moveTo(crestX - W * 0.012 + i * W * 0.006, crestY + H * 0.010);
      b.lineTo(crestX - W * 0.010 + i * W * 0.006, crestY - H * 0.018);
      b.stroke();
    }

    /* ---------- 舞台内景：夜画幕布 ---------- */
    b.save();
    b.beginPath();
    b.moveTo(openL, stageY);
    b.lineTo(openL, openTop + H * 0.02);
    b.quadraticCurveTo(W * 0.5, H * 0.055, openR, openTop + H * 0.02);
    b.lineTo(openR, stageY);
    b.closePath();
    b.clip();
    // 画幕基底
    const backG = b.createLinearGradient(0, openTop, 0, stageY);
    backG.addColorStop(0, night ? '#0e1428' : '#3c4458');
    backG.addColorStop(0.55, night ? '#151d34' : '#465066');
    backG.addColorStop(1, night ? '#0b0f1e' : '#2c3444');
    b.fillStyle = backG;
    b.fillRect(openL, openTop, openR - openL, stageY - openTop);
    // 画幕上的远山与湖面（绘景）
    b.fillStyle = night ? 'rgba(28,38,64,0.85)' : 'rgba(80,96,118,0.85)';
    b.beginPath();
    b.moveTo(openL, stageY - H * 0.020);
    b.quadraticCurveTo(W * 0.30, stageY - H * 0.115, W * 0.46, stageY - H * 0.030);
    b.quadraticCurveTo(W * 0.62, stageY - H * 0.095, W * 0.78, stageY - H * 0.025);
    b.quadraticCurveTo(W * 0.88, stageY - H * 0.070, openR, stageY - H * 0.018);
    b.lineTo(openR, stageY);
    b.lineTo(openL, stageY);
    b.closePath(); b.fill();
    // 湖面反光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const lake = b.createLinearGradient(0, stageY - H * 0.040, 0, stageY);
    lake.addColorStop(0, 'rgba(150,178,220,0.14)');
    lake.addColorStop(1, 'rgba(150,178,220,0)');
    b.fillStyle = lake;
    b.fillRect(openL, stageY - H * 0.040, openR - openL, H * 0.040);
    b.restore();
    // 画幕的布纹与接缝
    b.strokeStyle = 'rgba(10,10,18,0.18)';
    b.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const xx = openL + (openR - openL) * (i / 8);
      b.beginPath();
      b.moveTo(xx, openTop);
      b.quadraticCurveTo(xx + rand(-6, 6), (openTop + stageY) * 0.5, xx + rand(-8, 8), stageY);
      b.stroke();
    }
    // 画幕底部的舞台灯光渐变
    const wash = b.createLinearGradient(0, stageY - H * 0.16, 0, stageY);
    wash.addColorStop(0, 'rgba(20,20,40,0)');
    wash.addColorStop(1, 'rgba(20,20,40,0.40)');
    b.fillStyle = wash;
    b.fillRect(openL, stageY - H * 0.16, openR - openL, H * 0.16);
    b.restore();

    /* ---------- 幕布：垂幔、侧幕与流苏 ---------- */
    // 顶部垂幔（swag）
    const valY = openTop + H * 0.012;
    b.fillStyle = night ? '#4a1420' : '#6c1e2c';
    b.beginPath();
    b.moveTo(openL, valY);
    b.quadraticCurveTo(W * 0.30, valY + H * 0.085, W * 0.5, valY + H * 0.030);
    b.quadraticCurveTo(W * 0.70, valY + H * 0.085, openR, valY);
    b.lineTo(openR, openTop - H * 0.010);
    b.quadraticCurveTo(W * 0.5, H * 0.045, openL, openTop - H * 0.010);
    b.closePath(); b.fill();
    // 垂幔的褶皱
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const xx = openL + (openR - openL) * (t + 0.04);
      b.strokeStyle = i % 2 ? 'rgba(30,6,12,0.28)' : 'rgba(160,60,70,0.16)';
      b.lineWidth = 2;
      b.beginPath();
      b.moveTo(xx, valY + 2);
      b.quadraticCurveTo(xx + rand(-8, 8), valY + H * 0.045, xx + rand(-6, 6), valY + H * 0.075 - Math.abs(t - 0.5) * H * 0.055);
      b.stroke();
    }
    // 流苏
    b.fillStyle = night ? 'rgba(150,110,62,0.42)' : 'rgba(206,164,100,0.55)';
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const xx = openL + (openR - openL) * t;
      const yy = valY + H * 0.032 + Math.sin(t * Math.PI) * H * 0.048;
      b.fillRect(xx, yy, 2, H * 0.012);
    }
    // 侧幕（厚重的深红帷幔，一层层褶皱）
    for (const side of [0, 1]) {
      const dir = side ? -1 : 1;
      const bx0 = side ? openR : openL;
      const bw0 = W * (side ? 0.075 : 0.085);
      const cg = b.createLinearGradient(bx0, 0, bx0 + dir * bw0, 0);
      cg.addColorStop(0, night ? '#5c1a26' : '#7a2834');
      cg.addColorStop(0.45, night ? '#3c0e18' : '#561822');
      cg.addColorStop(1, night ? '#24060e' : '#360a14');
      b.fillStyle = cg;
      b.beginPath();
      b.moveTo(bx0, openTop + H * 0.010);
      b.quadraticCurveTo(bx0 + dir * bw0 * 0.35, (openTop + stageY) * 0.45, bx0 + dir * bw0 * 0.55, stageY);
      b.lineTo(bx0 + dir * bw0 * 0.30, stageY);
      b.lineTo(bx0 + dir * bw0 * 0.30, openTop + H * 0.035);
      b.closePath(); b.fill();
      // 竖向褶皱
      for (let i = 0; i < 6; i++) {
        const t = i / 6;
        b.strokeStyle = i % 2 ? 'rgba(18,4,8,0.35)' : 'rgba(170,72,78,0.14)';
        b.lineWidth = 2.2;
        b.beginPath();
        b.moveTo(bx0 + dir * bw0 * (0.06 + t * 0.38), openTop + H * 0.03);
        b.quadraticCurveTo(bx0 + dir * bw0 * (0.10 + t * 0.34), (openTop + stageY) * 0.52, bx0 + dir * bw0 * (0.12 + t * 0.40), stageY);
        b.stroke();
      }
      // 系带与金绳
      const tieY = openTop + H * 0.20;
      b.strokeStyle = 'rgba(190,152,92,0.55)';
      b.lineWidth = 3;
      b.beginPath();
      b.moveTo(bx0 + dir * bw0 * 0.10, tieY);
      b.quadraticCurveTo(bx0 + dir * bw0 * 0.34, tieY + H * 0.012, bx0 + dir * bw0 * 0.52, tieY + H * 0.004);
      b.stroke();
      b.fillStyle = 'rgba(190,152,92,0.45)';
      b.beginPath();
      b.ellipse(bx0 + dir * bw0 * 0.32, tieY + H * 0.020, W * 0.006, H * 0.014, dir * 0.2, 0, 6.3);
      b.fill();
    }

    /* ---------- 舞台地板、脚灯与钢琴 ---------- */
    const deckTop = stageY - H * 0.100;
    const deckG = b.createLinearGradient(0, deckTop, 0, stageY);
    deckG.addColorStop(0, night ? '#3a2a2a' : '#7a5638');
    deckG.addColorStop(0.5, night ? '#322324' : '#6a4a30');
    deckG.addColorStop(1, night ? '#221820' : '#4a3222');
    b.fillStyle = deckG;
    b.fillRect(openL, deckTop, openR - openL, stageY - deckTop);
    // 地板条
    for (let i = 0; i < 22; i++) {
      const t = i / 22;
      b.strokeStyle = 'rgba(0,0,0,0.20)';
      b.lineWidth = 1;
      const yy = deckTop + t * (stageY - deckTop);
      b.beginPath();
      b.moveTo(openL, yy);
      b.lineTo(openR, yy);
      b.stroke();
    }
    // 地板上的木纹高光
    for (let i = 0; i < 30; i++) {
      const yy = deckTop + rand(0, stageY - deckTop);
      b.strokeStyle = `rgba(255,214,170,${rand(0.02, 0.06)})`;
      b.beginPath();
      b.moveTo(openL + rand(0, W * 0.2), yy);
      b.lineTo(openR - rand(0, W * 0.2), yy + rand(-1, 1));
      b.stroke();
    }
    // 台唇与金边
    b.fillStyle = night ? '#1a121a' : '#3e2a22';
    b.fillRect(openL, stageY, openR - openL, H * 0.012);
    b.fillStyle = 'rgba(196,158,96,0.30)';
    b.fillRect(openL, stageY, openR - openL, 1.6);
    // 脚灯
    for (let i = 0; i < 16; i++) {
      const lx = openL + (openR - openL) * (0.05 + i * 0.06);
      b.fillStyle = `rgba(255,214,150,${0.35 + (i % 2) * 0.15})`;
      b.beginPath();
      b.arc(lx, stageY - 2, Math.max(1.2, W * 0.0014), 0, 6.3);
      b.fill();
    }
    // 舞台投光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const pool = b.createRadialGradient(W * 0.50, stageY - H * 0.045, 0, W * 0.50, stageY - H * 0.045, W * 0.30);
    pool.addColorStop(0, 'rgba(220,230,255,0.22)');
    pool.addColorStop(0.5, 'rgba(206,216,255,0.07)');
    pool.addColorStop(1, 'rgba(206,216,255,0)');
    b.fillStyle = pool;
    b.beginPath();
    b.ellipse(W * 0.50, stageY - H * 0.048, W * 0.28, H * 0.060, 0, 0, 6.3);
    b.fill();
    b.restore();

    /* 三角钢琴：掀开的琴盖、琴弦、琴键与琴凳 */
    const px = W * 0.50, py = stageY - H * 0.042;
    b.save();
    b.translate(px, py);
    // 琴身：左侧直边、右侧弧线
    const bodyP = new Path2D();
    bodyP.moveTo(-W * 0.134, -H * 0.004);
    bodyP.lineTo(-W * 0.134, -H * 0.070);
    bodyP.bezierCurveTo(-W * 0.02, -H * 0.090, W * 0.075, -H * 0.086, W * 0.128, -H * 0.046);
    bodyP.bezierCurveTo(W * 0.155, -H * 0.020, W * 0.140, H * 0.004, W * 0.115, H * 0.010);
    bodyP.lineTo(-W * 0.115, H * 0.010);
    bodyP.closePath();
    const bodyG = b.createLinearGradient(0, -H * 0.090, 0, H * 0.010);
    bodyG.addColorStop(0, '#1a1218');
    bodyG.addColorStop(0.35, '#0b0810');
    bodyG.addColorStop(1, '#030204');
    b.fillStyle = bodyG;
    b.fill(bodyP);
    // 琴身轮廓的暖色反光
    b.strokeStyle = 'rgba(255,214,160,0.14)';
    b.lineWidth = 1.2;
    b.stroke(bodyP);
    // 掀起的琴盖：以左侧铰链为轴的浅弧盖板
    const hingeX = -W * 0.112, hingeY = -H * 0.072;
    const lidG = b.createLinearGradient(0, hingeY - H * 0.034, 0, hingeY + H * 0.006);
    lidG.addColorStop(0, '#241a24');
    lidG.addColorStop(0.38, '#100b14');
    lidG.addColorStop(1, '#040206');
    b.fillStyle = lidG;
    b.beginPath();
    b.moveTo(hingeX, hingeY + H * 0.005);
    b.bezierCurveTo(-W * 0.048, -H * 0.104, W * 0.058, -H * 0.112, W * 0.148, -H * 0.087);
    b.lineTo(W * 0.154, -H * 0.077);
    b.bezierCurveTo(W * 0.054, -H * 0.098, -W * 0.050, -H * 0.090, hingeX, hingeY - H * 0.004);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(255,224,176,0.15)';
    b.lineWidth = 1;
    b.stroke();
    // 盖板内侧的舞台反光
    b.strokeStyle = 'rgba(214,196,236,0.07)';
    b.lineWidth = 0.8;
    b.beginPath();
    b.moveTo(hingeX + W * 0.012, -H * 0.079);
    b.bezierCurveTo(-W * 0.040, -H * 0.097, W * 0.050, -H * 0.104, W * 0.140, -H * 0.084);
    b.stroke();
    // 撑杆
    b.strokeStyle = 'rgba(120,96,64,0.55)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(W * 0.116, -H * 0.036);
    b.lineTo(W * 0.132, -H * 0.080);
    b.stroke();
    // 琴弦与铸铁板
    b.fillStyle = 'rgba(150,110,60,0.24)';
    b.beginPath();
    b.moveTo(-W * 0.070, -H * 0.066);
    b.bezierCurveTo(W * 0.000, -H * 0.078, W * 0.070, -H * 0.070, W * 0.105, -H * 0.044);
    b.lineTo(W * 0.100, -H * 0.036);
    b.bezierCurveTo(W * 0.062, -H * 0.058, 0, -H * 0.066, -W * 0.068, -H * 0.056);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(226,196,150,0.24)';
    b.lineWidth = 0.6;
    for (let i = 0; i < 22; i++) {
      const t = i / 22;
      b.beginPath();
      b.moveTo(-W * 0.066 + t * W * 0.168, -H * 0.062 + t * H * 0.010);
      b.lineTo(-W * 0.062 + t * W * 0.158, -H * 0.050 + t * H * 0.008);
      b.stroke();
    }
    // 键盘：键床、白键、黑键与前沿挡板
    b.fillStyle = '#08060c';
    b.fillRect(-W * 0.138, -H * 0.030, W * 0.144, H * 0.017);
    const tKeyG = b.createLinearGradient(0, -H * 0.024, 0, -H * 0.015);
    tKeyG.addColorStop(0, night ? '#d2c8b0' : '#e6dcc4');
    tKeyG.addColorStop(0.70, night ? '#b3a992' : '#cfc4aa');
    tKeyG.addColorStop(1, night ? '#948a76' : '#ada28a');
    b.fillStyle = tKeyG;
    b.fillRect(-W * 0.130, -H * 0.024, W * 0.126, H * 0.009);
    const whiteN = 22;
    for (let i = 0; i <= whiteN; i++) {
      const kx = -W * 0.130 + i * (W * 0.126 / whiteN);
      b.strokeStyle = 'rgba(40,30,22,0.42)';
      b.lineWidth = 0.6;
      b.beginPath(); b.moveTo(kx, -H * 0.024); b.lineTo(kx, -H * 0.015); b.stroke();
    }
    const blackPat = [0, 1, 3, 4, 5];
    for (let i = 0; i < whiteN - 1; i++) {
      if (blackPat.includes(i % 7)) continue;
      const kx = -W * 0.130 + (i + 0.66) * (W * 0.126 / whiteN);
      b.fillStyle = '#0a0710';
      b.fillRect(kx, -H * 0.024, W * 0.0046, H * 0.0058);
      b.fillStyle = 'rgba(150,140,160,0.14)';
      b.fillRect(kx + 0.5, -H * 0.0235, W * 0.0038, 1);
    }
    // 键盘前沿与两端挡木
    b.fillStyle = '#07050a';
    b.fillRect(-W * 0.138, -H * 0.015, W * 0.144, H * 0.005);
    b.fillStyle = 'rgba(255,240,214,0.08)';
    b.fillRect(-W * 0.138, -H * 0.015, W * 0.144, 1);
    b.fillStyle = '#0d0910';
    b.fillRect(-W * 0.144, -H * 0.029, W * 0.007, H * 0.021);
    // 琴腿与脚轮
    for (const lx of [-W * 0.095, W * 0.095, W * 0.020]) {
      b.fillStyle = '#050308';
      b.fillRect(lx, H * 0.008, W * 0.010, H * 0.030);
      b.fillStyle = 'rgba(180,140,84,0.22)';
      b.fillRect(lx + W * 0.006, H * 0.008, 1, H * 0.028);
      b.fillStyle = '#0a0708';
      b.beginPath(); b.arc(lx + W * 0.005, H * 0.039, W * 0.004, 0, 6.3); b.fill();
    }
    // 踏板与琴凳
    b.fillStyle = 'rgba(170,132,78,0.5)';
    b.fillRect(-W * 0.010, H * 0.032, W * 0.014, H * 0.004);
    b.fillStyle = '#0a0710';
    b.fillRect(-W * 0.120, H * 0.012, W * 0.072, H * 0.012);
    b.fillRect(-W * 0.112, H * 0.024, W * 0.006, H * 0.024);
    b.fillRect(-W * 0.062, H * 0.024, W * 0.006, H * 0.024);
    b.fillStyle = 'rgba(110,30,38,0.8)';
    b.fillRect(-W * 0.120, H * 0.012, W * 0.072, H * 0.004);
    b.restore();

    // 舞台右侧：合上的小提琴盒（腰线轮廓、锁扣、提手）
    b.save();
    b.translate(W * 0.735, stageY - H * 0.002);
    b.rotate(-0.10);
    // 落地软阴影与盒底厚度
    b.fillStyle = 'rgba(0,0,0,0.30)';
    b.beginPath();
    b.ellipse(0, H * 0.004, W * 0.030, H * 0.005, 0, 0, 6.3);
    b.fill();
    b.fillStyle = 'rgba(14,10,14,0.95)';
    b.beginPath();
    b.moveTo(-W * 0.021, -H * 0.006);
    b.quadraticCurveTo(0, H * 0.001, W * 0.021, -H * 0.006);
    b.lineTo(W * 0.021, -H * 0.012);
    b.lineTo(-W * 0.021, -H * 0.012);
    b.closePath(); b.fill();
    // 盒面：小提琴腰线剪影
    const caseP = new Path2D();
    caseP.moveTo(-W * 0.012, -H * 0.004);
    caseP.bezierCurveTo(-W * 0.024, -H * 0.010, -W * 0.024, -H * 0.026, -W * 0.020, -H * 0.036);
    caseP.bezierCurveTo(-W * 0.017, -H * 0.044, -W * 0.017, -H * 0.050, -W * 0.020, -H * 0.058);
    caseP.bezierCurveTo(-W * 0.024, -H * 0.066, -W * 0.022, -H * 0.076, -W * 0.012, -H * 0.079);
    caseP.lineTo(W * 0.012, -H * 0.079);
    caseP.bezierCurveTo(W * 0.022, -H * 0.076, W * 0.024, -H * 0.066, W * 0.020, -H * 0.058);
    caseP.bezierCurveTo(W * 0.017, -H * 0.050, W * 0.017, -H * 0.044, W * 0.020, -H * 0.036);
    caseP.bezierCurveTo(W * 0.024, -H * 0.026, W * 0.024, -H * 0.010, W * 0.012, -H * 0.004);
    caseP.closePath();
    const caseG = b.createLinearGradient(-W * 0.022, 0, W * 0.022, 0);
    caseG.addColorStop(0, '#1a1118');
    caseG.addColorStop(0.45, '#2e2028');
    caseG.addColorStop(1, '#120c12');
    b.fillStyle = caseG;
    b.fill(caseP);
    b.strokeStyle = 'rgba(170,134,84,0.28)';
    b.lineWidth = 1;
    b.stroke(caseP);
    // 盒盖分缝
    b.strokeStyle = 'rgba(0,0,0,0.45)';
    b.lineWidth = 0.9;
    b.beginPath();
    b.moveTo(-W * 0.018, -H * 0.047);
    b.quadraticCurveTo(0, -H * 0.044, W * 0.018, -H * 0.047);
    b.stroke();
    // 两枚铜锁扣
    for (const lx of [-W * 0.009, W * 0.009]) {
      b.fillStyle = 'rgba(198,166,106,0.55)';
      b.fillRect(lx - W * 0.0016, -H * 0.0485, W * 0.0032, H * 0.0040);
      b.fillStyle = 'rgba(255,236,190,0.28)';
      b.fillRect(lx - W * 0.0016, -H * 0.0485, W * 0.0032, 1);
    }
    // 提手
    b.strokeStyle = 'rgba(150,116,70,0.65)';
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(-W * 0.006, -H * 0.079);
    b.bezierCurveTo(-W * 0.004, -H * 0.089, W * 0.004, -H * 0.089, W * 0.006, -H * 0.079);
    b.stroke();
    // 受光侧反光
    b.strokeStyle = 'rgba(214,196,236,0.09)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(-W * 0.014, -H * 0.007);
    b.bezierCurveTo(-W * 0.022, -H * 0.024, -W * 0.018, -H * 0.044, -W * 0.014, -H * 0.054);
    b.stroke();
    b.restore();
    // 谱架
    b.strokeStyle = night ? 'rgba(120,104,86,0.55)' : 'rgba(60,44,34,0.65)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(W * 0.305, stageY);
    b.lineTo(W * 0.300, stageY - H * 0.150);
    b.lineTo(W * 0.300, stageY);
    b.moveTo(W * 0.300, stageY - H * 0.150);
    b.lineTo(W * 0.330, stageY - H * 0.162);
    b.lineTo(W * 0.330, stageY - H * 0.118);
    b.lineTo(W * 0.300, stageY - H * 0.106);
    b.stroke();
    b.fillStyle = night ? 'rgba(226,220,202,0.35)' : 'rgba(244,238,222,0.6)';
    b.beginPath();
    b.moveTo(W * 0.300, stageY - H * 0.150);
    b.lineTo(W * 0.330, stageY - H * 0.162);
    b.lineTo(W * 0.330, stageY - H * 0.118);
    b.lineTo(W * 0.300, stageY - H * 0.106);
    b.closePath(); b.fill();

    // 从穹顶落下的月光柱（更柔和，边缘扩散）
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < 3; layer++) {
      const spread = layer * W * 0.018;
      const shaft = b.createLinearGradient(ocx, ocy, ocx, stageY);
      shaft.addColorStop(0, `rgba(206,220,255,${0.10 - layer * 0.02})`);
      shaft.addColorStop(0.55, `rgba(200,216,255,${0.035 - layer * 0.008})`);
      shaft.addColorStop(1, 'rgba(200,216,255,0)');
      b.fillStyle = shaft;
      b.beginPath();
      b.moveTo(ocx - orx * 0.55 - spread, ocy);
      b.lineTo(ocx + orx * 0.55 + spread, ocy);
      b.lineTo(W * 0.64 + spread, stageY);
      b.lineTo(W * 0.36 - spread, stageY);
      b.closePath(); b.fill();
    }
    b.restore();
  }
  drawTheater.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const p2 = PALETTES[state.time] || PALETTES.night;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    // 乐池栏杆与观众席的前沿
    const pitY = horizon + H * 0.008;
    b.fillStyle = night ? 'rgba(22,16,24,0.95)' : 'rgba(52,38,32,0.9)';
    b.fillRect(0, pitY, W, H * 0.020);
    b.strokeStyle = 'rgba(178,142,88,0.30)';
    b.lineWidth = 1.4;
    b.beginPath(); b.moveTo(0, pitY + H * 0.004); b.lineTo(W, pitY + H * 0.004); b.stroke();

    // 观众席：一排排红丝绒座椅，中间留过道
    const rows = 7;
    const aisleHalf = W * 0.045;
    for (let r = 0; r < rows; r++) {
      const t = r / rows;
      const yy = pitY + H * 0.022 + Math.pow(t, 1.28) * (H - pitY) * 0.78;
      const seatW = W * (0.040 + t * 0.020);
      const seatH = H * (0.024 + t * 0.022);
      const rowTone = night ? 32 + r * 2 : 74 + r * 4;
      for (let i = 0; i < 16; i++) {
        const xx = W * (0.012 + i * 0.061) + (r % 2) * W * 0.008;
        if (xx > W * 0.5 - aisleHalf - seatW && xx < W * 0.5 + aisleHalf) continue;
        // 椅背
        const bg = b.createLinearGradient(0, yy - seatH * 0.4, 0, yy + seatH);
        bg.addColorStop(0, `rgb(${rowTone + 26},${rowTone - 10},${rowTone - 4})`);
        bg.addColorStop(0.55, `rgb(${rowTone + 8},${rowTone - 18},${rowTone - 12})`);
        bg.addColorStop(1, `rgb(${rowTone - 8},${rowTone - 24},${rowTone - 18})`);
        b.fillStyle = bg;
        b.beginPath();
        b.moveTo(xx, yy + seatH);
        b.lineTo(xx, yy + seatH * 0.26);
        b.quadraticCurveTo(xx + seatW * 0.5, yy - seatH * 0.42, xx + seatW, yy + seatH * 0.26);
        b.lineTo(xx + seatW, yy + seatH);
        b.closePath(); b.fill();
        // 椅背上的竖缝与高光
        b.strokeStyle = 'rgba(0,0,0,0.22)';
        b.lineWidth = 0.8;
        b.beginPath();
        b.moveTo(xx + seatW * 0.5, yy + seatH * 0.02);
        b.lineTo(xx + seatW * 0.5, yy + seatH);
        b.stroke();
        b.fillStyle = 'rgba(255,196,150,0.05)';
        b.beginPath();
        b.ellipse(xx + seatW * 0.42, yy + seatH * 0.30, seatW * 0.26, seatH * 0.14, -0.2, 0, 6.3);
        b.fill();
        // 扶手
        b.fillStyle = `rgb(${rowTone - 4},${rowTone - 18},${rowTone - 12})`;
        b.fillRect(xx - seatW * 0.06, yy + seatH * 0.55, seatW * 0.10, seatH * 0.30);
        b.fillRect(xx + seatW * 0.96, yy + seatH * 0.55, seatW * 0.10, seatH * 0.30);
        // 偶尔有一册立在座椅前的节目册：深封皮、米色内页、薄投影
        if (perm(r * 17 + i, 53) > 0.975) {
          const bkx = xx + seatW * 0.62, bky = yy + seatH * 0.52;
          b.save();
          b.translate(bkx, bky);
          b.rotate(-0.18);
          b.fillStyle = 'rgba(0,0,0,0.22)';
          b.fillRect(-seatW * 0.075 + 1, -seatH * 0.12 + 2, seatW * 0.15, seatH * 0.24);
          b.fillStyle = night ? 'rgba(34,24,30,0.92)' : 'rgba(64,40,34,0.92)';
          b.fillRect(-seatW * 0.075, -seatH * 0.12, seatW * 0.15, seatH * 0.24);
          b.fillStyle = night ? 'rgba(196,184,160,0.28)' : 'rgba(228,214,184,0.55)';
          b.fillRect(-seatW * 0.062, -seatH * 0.105, seatW * 0.124, seatH * 0.21);
          b.strokeStyle = night ? 'rgba(40,30,26,0.40)' : 'rgba(70,44,34,0.45)';
          b.lineWidth = 0.6;
          b.beginPath();
          b.moveTo(0, -seatH * 0.10);
          b.lineTo(0, seatH * 0.10);
          b.stroke();
          b.restore();
        }
      }
    }

    // 中央过道：暗红地毯与金色边线
    const carpet = b.createLinearGradient(0, pitY, 0, H);
    carpet.addColorStop(0, 'rgba(88,26,36,0.60)');
    carpet.addColorStop(1, 'rgba(40,12,20,0.82)');
    b.fillStyle = carpet;
    b.beginPath();
    b.moveTo(W * 0.5 - W * 0.045, pitY + H * 0.020);
    b.lineTo(W * 0.5 + W * 0.045, pitY + H * 0.020);
    b.lineTo(W * 0.5 + W * 0.105, H);
    b.lineTo(W * 0.5 - W * 0.105, H);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(190,152,92,0.18)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(W * 0.5 - W * 0.040, pitY + H * 0.020);
    b.lineTo(W * 0.5 - W * 0.096, H);
    b.moveTo(W * 0.5 + W * 0.040, pitY + H * 0.020);
    b.lineTo(W * 0.5 + W * 0.096, H);
    b.stroke();
    // 过道上的铜制地灯
    for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5;
      const yy = pitY + H * 0.030 + Math.pow(t, 1.28) * (H - pitY) * 0.78;
      const lx = W * 0.5 + (i % 2 ? 1 : -1) * W * (0.058 + t * 0.020);
      b.fillStyle = 'rgba(255,206,140,0.55)';
      b.beginPath(); b.arc(lx, yy, 1.6 + t * 1.6, 0, 6.3); b.fill();
      b.save();
      b.globalCompositeOperation = 'lighter';
      const lg = b.createRadialGradient(lx, yy, 0, lx, yy, 8 + t * 12);
      lg.addColorStop(0, 'rgba(255,190,112,0.18)');
      lg.addColorStop(1, 'rgba(255,190,112,0)');
      b.fillStyle = lg;
      b.beginPath(); b.arc(lx, yy, 8 + t * 12, 0, 6.3); b.fill();
      b.restore();
    }

    // 舞台光溢到前几排
    b.save();
    b.globalCompositeOperation = 'lighter';
    const wash = b.createLinearGradient(0, pitY, 0, pitY + H * 0.16);
    wash.addColorStop(0, hexA(p2.glow, 0.10));
    wash.addColorStop(1, hexA(p2.glow, 0));
    b.fillStyle = wash;
    b.fillRect(0, pitY, W, H * 0.16);
    b.restore();
  };

  /* ---------- 场景：写字楼二十八层 ---------- */
  function drawOffice(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const night = state.time === 'night';
    const day = state.time === 'day';
    const dusk = !night && !day;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const metal = night ? 'rgba(150,154,176,0.30)' : 'rgba(96,100,108,0.45)';

    /* ---------- 天花板：矿棉板、灯槽与设备 ---------- */
    const ceilY = H * 0.135;
    const ceilG = b.createLinearGradient(0, 0, 0, ceilY);
    ceilG.addColorStop(0, night ? '#12101a' : day ? '#d0cec6' : '#443c48');
    ceilG.addColorStop(1, night ? '#0e0c16' : day ? '#b8b6ae' : '#38303c');
    b.fillStyle = ceilG;
    b.fillRect(0, 0, W, ceilY);
    // 板缝
    b.strokeStyle = night ? 'rgba(120,120,150,0.10)' : 'rgba(70,70,74,0.18)';
    b.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const xx = W * (i / 10);
      b.beginPath(); b.moveTo(xx, 0); b.lineTo(xx, ceilY); b.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const yy = ceilY * (i / 4);
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    // 板面的细孔
    for (let i = 0; i < 260; i++) {
      b.fillStyle = `rgba(0,0,0,${rand(0.02, 0.06)})`;
      b.fillRect(rand(0, W), rand(0, ceilY), 1.2, 1.2);
    }
    // 线性灯槽：凹陷灯槽、磨砂灯片与柔光（避免矩形硬边）
    for (let i = 0; i < 4; i++) {
      const lx = W * (0.07 + i * 0.235), ly = ceilY * 0.36;
      const lw = W * 0.115;
      b.fillStyle = night ? 'rgba(8,7,12,0.85)' : 'rgba(40,34,36,0.55)';
      b.fillRect(lx - W * 0.006, ly - H * 0.006, lw + W * 0.012, H * 0.016);
      b.fillStyle = 'rgba(255,250,240,0.05)';
      b.fillRect(lx - W * 0.006, ly - H * 0.006, lw + W * 0.012, 1);
      const diff = b.createLinearGradient(lx, 0, lx + lw, 0);
      diff.addColorStop(0, night ? 'rgba(188,200,240,0.10)' : 'rgba(255,250,238,0.18)');
      diff.addColorStop(0.10, night ? 'rgba(206,216,255,0.78)' : 'rgba(255,252,244,0.92)');
      diff.addColorStop(0.90, night ? 'rgba(206,216,255,0.78)' : 'rgba(255,252,244,0.92)');
      diff.addColorStop(1, night ? 'rgba(188,200,240,0.10)' : 'rgba(255,250,238,0.18)');
      b.fillStyle = diff;
      b.fillRect(lx, ly, lw, H * 0.0045);
      b.save();
      b.beginPath();
      b.rect(0, 0, W, ceilY + H * 0.03);
      b.clip();
      b.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const cxp = lx + lw * 0.5;
        const rad = W * (0.085 + k * 0.035);
        const lg = b.createRadialGradient(cxp, ly + H * 0.002, 0, cxp, ly + H * 0.002, rad);
        lg.addColorStop(0, night ? `rgba(150,170,235,${0.10 - k * 0.035})` : `rgba(255,246,228,${0.13 - k * 0.045})`);
        lg.addColorStop(0.55, night ? `rgba(130,150,220,${0.035 - k * 0.012})` : `rgba(255,240,214,${0.05 - k * 0.016})`);
        lg.addColorStop(1, 'rgba(255,240,214,0)');
        b.fillStyle = lg;
        b.beginPath();
        b.ellipse(cxp, ly + H * 0.002, rad, H * 0.030, 0, 0, 6.3);
        b.fill();
      }
      b.restore();
    }
    // 回风口与喷淋
    for (let i = 0; i < 3; i++) {
      const ax = W * (0.18 + i * 0.30), ay = ceilY * 0.70;
      b.fillStyle = night ? 'rgba(60,60,72,0.5)' : 'rgba(160,158,152,0.7)';
      b.fillRect(ax, ay, W * 0.055, H * 0.012);
      b.strokeStyle = 'rgba(30,30,34,0.30)';
      b.lineWidth = 0.8;
      for (let s = 0; s < 4; s++) {
        b.beginPath();
        b.moveTo(ax + 2, ay + 2 + s * (H * 0.0026));
        b.lineTo(ax + W * 0.055 - 2, ay + 2 + s * (H * 0.0026));
        b.stroke();
      }
      b.fillStyle = 'rgba(180,180,188,0.55)';
      b.beginPath(); b.arc(ax + W * 0.075, ay + H * 0.006, 1.6, 0, 6.3); b.fill();
    }
    // 窗上口的过梁：把天花板与幕墙接住，避免“悬空的板”
    const headerH = H * 0.028;
    const headerG = b.createLinearGradient(0, ceilY - headerH * 0.2, 0, ceilY + headerH);
    headerG.addColorStop(0, night ? '#1a1824' : '#a8a49a');
    headerG.addColorStop(1, night ? '#100e18' : '#7e7a72');
    b.fillStyle = headerG;
    b.fillRect(0, ceilY - headerH * 0.2, W, headerH);
    b.fillStyle = 'rgba(255,250,238,0.10)';
    b.fillRect(0, ceilY - headerH * 0.2, W, 1.4);
    b.fillStyle = 'rgba(0,0,0,0.16)';
    b.fillRect(0, ceilY + headerH * 0.8, W, 1.6);

    /* ---------- 幕墙：窗外陆家嘴与玻璃反射 ---------- */
    const wx = W * 0.012, wy = ceilY + headerH * 0.98;
    const ww = W * 0.976, wh = horizon - wy - H * 0.010;
    // 窗洞内的暗边
    b.fillStyle = night ? '#05060f' : dusk ? '#2a2438' : '#8aa4b2';
    b.fillRect(wx, wy, ww, wh);
    const img = night ? cityNight : cityDay;
    const ready = night ? cityNightReady : cityDayReady;
    if (ready) {
      drawCover(b, img, wx, wy, ww, wh, 0.5, 0.46, 1);
      // 压住原图的动漫式高亮：时刻色罩 + 低饱和
      b.save();
      b.globalCompositeOperation = 'multiply';
      if (day) {
        b.fillStyle = 'rgba(138,146,146,0.55)';
        b.fillRect(wx, wy, ww, wh);
      } else if (night) {
        b.fillStyle = 'rgba(30,32,62,0.50)';
        b.fillRect(wx, wy, ww, wh);
      } else {
        const dg = b.createLinearGradient(0, wy, 0, wy + wh);
        dg.addColorStop(0, 'rgba(70,62,116,0.64)');
        dg.addColorStop(0.34, 'rgba(148,96,126,0.56)');
        dg.addColorStop(0.62, 'rgba(232,138,92,0.52)');
        dg.addColorStop(1, 'rgba(92,54,74,0.60)');
        b.fillStyle = dg;
        b.fillRect(wx, wy, ww, wh);
      }
      b.restore();
      if (dusk) {
        b.save();
        b.globalCompositeOperation = 'lighter';
        const sun = b.createRadialGradient(W * 0.845, wy + wh * 0.60, 0, W * 0.845, wy + wh * 0.60, W * 0.30);
        sun.addColorStop(0, 'rgba(255,176,104,0.30)');
        sun.addColorStop(0.4, 'rgba(255,146,84,0.12)');
        sun.addColorStop(1, 'rgba(255,146,84,0)');
        b.fillStyle = sun;
        b.fillRect(wx, wy, ww, wh);
        b.restore();
      }
      b.save();
      b.globalCompositeOperation = 'lighter';
      const atmo = b.createLinearGradient(0, wy, 0, wy + wh);
      atmo.addColorStop(0, day ? 'rgba(236,242,246,0.06)' : night ? 'rgba(64,76,150,0.10)' : 'rgba(255,190,120,0.10)');
      atmo.addColorStop(0.55, 'rgba(0,0,0,0)');
      atmo.addColorStop(1, day ? 'rgba(255,246,228,0.05)' : night ? 'rgba(40,50,110,0.06)' : 'rgba(255,176,104,0.06)');
      b.fillStyle = atmo;
      b.fillRect(wx, wy, ww, wh);
      b.restore();
      // 远处雾层，增加空气透视
      const fog = b.createLinearGradient(0, wy + wh * 0.55, 0, wy + wh);
      fog.addColorStop(0, 'rgba(180,196,208,0)');
      fog.addColorStop(1, day ? 'rgba(190,204,212,0.22)' : night ? 'rgba(40,52,100,0.25)' : 'rgba(220,168,132,0.18)');
      b.fillStyle = fog;
      b.fillRect(wx, wy + wh * 0.55, ww, wh * 0.45);
    }
    // 幕墙竖梃：每根都有宽度、受光面与暗面
    for (let i = 0; i <= 8; i++) {
      const mx = wx + (ww / 8) * i;
      b.fillStyle = night ? 'rgba(34,36,52,0.95)' : 'rgba(52,56,62,0.92)';
      b.fillRect(mx - W * 0.0022, wy, W * 0.0044, wh);
      b.fillStyle = 'rgba(210,222,240,0.10)';
      b.fillRect(mx - W * 0.0022, wy, 1.2, wh);
      b.fillStyle = 'rgba(0,0,0,0.24)';
      b.fillRect(mx + W * 0.0010, wy, 1.2, wh);
    }
    // 横梁
    for (let i = 1; i < 3; i++) {
      const my = wy + (wh / 3) * i;
      b.fillStyle = night ? 'rgba(34,36,52,0.95)' : 'rgba(52,56,62,0.92)';
      b.fillRect(wx, my - H * 0.0022, ww, H * 0.0044);
      b.fillStyle = 'rgba(210,222,240,0.08)';
      b.fillRect(wx, my - H * 0.0022, ww, 1);
      b.fillStyle = 'rgba(0,0,0,0.20)';
      b.fillRect(wx, my + H * 0.0010, ww, 1);
    }
    // 窗框
    b.strokeStyle = metal;
    b.lineWidth = Math.max(2.4, W * 0.0026);
    b.strokeRect(wx, wy, ww, wh);
    // 玻璃内的室内反射：天花灯带被拉成长条
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const lx = W * (0.07 + i * 0.235);
      const rg = b.createLinearGradient(lx, wy, lx + W * 0.14, wy + wh);
      rg.addColorStop(0, night ? 'rgba(190,204,255,0.09)' : day ? 'rgba(255,252,242,0.11)' : 'rgba(255,226,180,0.09)');
      rg.addColorStop(0.6, 'rgba(255,255,255,0.015)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      b.fillStyle = rg;
      b.beginPath();
      b.moveTo(lx, wy);
      b.lineTo(lx + W * 0.045, wy);
      b.lineTo(lx + W * 0.150, wy + wh);
      b.lineTo(lx + W * 0.095, wy + wh);
      b.closePath(); b.fill();
    }
    // 玻璃上的手印与擦拭痕：极淡
    for (let i = 0; i < 16; i++) {
      b.strokeStyle = `rgba(240,244,250,${rand(0.008, 0.025)})`;
      b.lineWidth = rand(0.6, 1.4);
      const sx0 = rand(wx, wx + ww), sy0 = rand(wy + wh * 0.2, wy + wh * 0.9);
      b.beginPath();
      b.moveTo(sx0, sy0);
      b.quadraticCurveTo(sx0 + rand(-30, 30), sy0 + rand(-10, 10), sx0 + rand(-60, 60), sy0 + rand(-18, 18));
      b.stroke();
    }
    b.restore();
    // 窗帘盒与半卷的遮阳帘
    for (let i = 0; i < 3; i++) {
      const bx0 = W * (0.10 + i * 0.34);
      b.fillStyle = night ? 'rgba(70,74,92,0.55)' : 'rgba(196,196,188,0.65)';
      b.fillRect(bx0, wy + H * 0.012, W * 0.10, H * 0.008);
      b.fillStyle = 'rgba(255,250,240,0.05)';
      b.fillRect(bx0, wy + H * 0.020, W * 0.10, H * 0.030);
      b.strokeStyle = 'rgba(0,0,0,0.06)';
      for (let s = 1; s < 6; s++) {
        b.beginPath();
        b.moveTo(bx0 + s * W * 0.017, wy + H * 0.020);
        b.lineTo(bx0 + s * W * 0.017, wy + H * 0.050);
        b.stroke();
      }
      b.fillStyle = 'rgba(60,64,70,0.4)';
      b.fillRect(bx0, wy + H * 0.050, W * 0.10, 1.4);
    }
    // 窗台
    b.fillStyle = night ? '#1e1c2a' : '#b0aca2';
    b.fillRect(wx - W * 0.006, horizon - H * 0.012, ww + W * 0.012, H * 0.012);
    b.fillStyle = 'rgba(255,250,238,0.12)';
    b.fillRect(wx - W * 0.006, horizon - H * 0.012, ww + W * 0.012, 1.4);
    b.fillStyle = 'rgba(0,0,0,0.20)';
    b.fillRect(wx - W * 0.006, horizon - H * 0.002, ww + W * 0.012, 2);

    /* ---------- 左侧玻璃会议室 ---------- */
    const mx = W * 0.018, my = wy + H * 0.020, mw = W * 0.285, mh = wh * 0.80;
    b.fillStyle = night ? 'rgba(18,18,30,0.30)' : 'rgba(120,130,136,0.20)';
    b.fillRect(mx, my, mw, mh);
    // 会议室内的长桌、椅子与吊灯
    const tby = my + mh * 0.60;
    b.fillStyle = night ? 'rgba(40,36,48,0.85)' : 'rgba(108,92,76,0.85)';
    b.beginPath();
    b.ellipse(mx + mw * 0.50, tby, mw * 0.36, mh * 0.075, 0, 0, 6.3);
    b.fill();
    b.fillStyle = 'rgba(255,246,228,0.10)';
    b.beginPath();
    b.ellipse(mx + mw * 0.47, tby - mh * 0.012, mw * 0.31, mh * 0.045, 0, 0, 6.3);
    b.fill();
    // 桌面的文件与水杯
    for (let i = 0; i < 5; i++) {
      b.fillStyle = 'rgba(240,236,222,0.35)';
      b.save();
      b.translate(mx + mw * (0.30 + i * 0.10), tby - mh * 0.010 + (i % 2) * 4);
      b.rotate(-0.12 + i * 0.05);
      b.fillRect(-mw * 0.035, 0, mw * 0.070, mh * 0.014);
      b.restore();
    }
    // 椅子（围桌一圈）
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283;
      const cx0 = mx + mw * 0.50 + Math.cos(a) * mw * 0.34;
      const cy0 = tby + Math.sin(a) * mh * 0.085;
      b.fillStyle = night ? 'rgba(26,24,36,0.9)' : 'rgba(58,60,68,0.80)';
      b.beginPath();
      b.ellipse(cx0, cy0, mw * 0.035, mh * 0.028, 0, 0, 6.3);
      b.fill();
      b.beginPath();
      b.ellipse(cx0, cy0 + mh * 0.012, mw * 0.030, mh * 0.020, 0, 0, 6.3);
      b.fill();
    }
    // 长条吊灯
    b.fillStyle = night ? 'rgba(200,210,255,0.30)' : 'rgba(255,252,242,0.75)';
    b.fillRect(mx + mw * 0.24, my + mh * 0.18, mw * 0.52, H * 0.005);
    b.save();
    b.globalCompositeOperation = 'lighter';
    const ml = b.createRadialGradient(mx + mw * 0.5, my + mh * 0.22, 0, mx + mw * 0.5, my + mh * 0.22, mw * 0.40);
    ml.addColorStop(0, night ? 'rgba(180,196,255,0.10)' : 'rgba(255,250,238,0.12)');
    ml.addColorStop(1, 'rgba(255,250,238,0)');
    b.fillStyle = ml;
    b.fillRect(mx, my, mw, mh * 0.5);
    b.restore();
    // 白板与笔记
    b.fillStyle = night ? 'rgba(210,214,224,0.14)' : 'rgba(242,242,238,0.70)';
    b.fillRect(mx + mw * 0.62, my + mh * 0.10, mw * 0.30, mh * 0.22);
    b.strokeStyle = 'rgba(40,44,52,0.35)';
    b.lineWidth = 1;
    b.strokeRect(mx + mw * 0.62, my + mh * 0.10, mw * 0.30, mh * 0.22);
    b.fillStyle = 'rgba(60,70,96,0.30)';
    for (let i = 0; i < 3; i++) {
      b.fillRect(mx + mw * 0.65, my + mh * (0.14 + i * 0.045), mw * (0.20 - i * 0.04), 2);
    }
    // 玻璃隔断：边框、竖梃、磨砂腰线与把手
    b.strokeStyle = metal;
    b.lineWidth = Math.max(2.2, W * 0.0024);
    b.strokeRect(mx, my, mw, mh);
    b.lineWidth = 1.4;
    for (let i = 1; i < 4; i++) {
      b.beginPath();
      b.moveTo(mx + (mw / 4) * i, my);
      b.lineTo(mx + (mw / 4) * i, my + mh);
      b.stroke();
    }
    // 磨砂腰线
    b.fillStyle = night ? 'rgba(150,158,178,0.12)' : 'rgba(236,238,236,0.30)';
    b.fillRect(mx, my + mh * 0.46, mw, mh * 0.13);
    // 门与把手
    b.strokeStyle = metal;
    b.lineWidth = 1.8;
    b.strokeRect(mx + mw * 0.72, my + mh * 0.52, mw * 0.22, mh * 0.46);
    b.fillStyle = 'rgba(200,204,214,0.65)';
    b.fillRect(mx + mw * 0.90, my + mh * 0.72, 2.4, mh * 0.10);
    // 玻璃反射斜带
    b.save();
    b.globalCompositeOperation = 'lighter';
    const gl1 = b.createLinearGradient(mx, my, mx + mw * 0.6, my + mh);
    gl1.addColorStop(0, 'rgba(210,222,240,0.10)');
    gl1.addColorStop(0.4, 'rgba(210,222,240,0.02)');
    gl1.addColorStop(0.45, 'rgba(210,222,240,0)');
    gl1.addColorStop(1, 'rgba(210,222,240,0.05)');
    b.fillStyle = gl1;
    b.fillRect(mx, my, mw, mh);
    b.restore();

    /* ---------- 右侧的结构柱与休息区 ---------- */
    const colX = W * 0.875;
    const colG = b.createLinearGradient(colX, 0, colX + W * 0.045, 0);
    colG.addColorStop(0, night ? '#1c1a26' : '#b4b0a6');
    colG.addColorStop(0.45, night ? '#262330' : '#c6c2b6');
    colG.addColorStop(1, night ? '#141220' : '#98948a');
    b.fillStyle = colG;
    b.fillRect(colX, wy, W * 0.045, horizon - wy);
    b.fillStyle = 'rgba(255,250,238,0.10)';
    b.fillRect(colX + W * 0.002, wy, 1.6, horizon - wy);
    b.fillStyle = 'rgba(0,0,0,0.18)';
    b.fillRect(colX + W * 0.043, wy, 2, horizon - wy);
    // 柱上的消防标识
    b.fillStyle = night ? 'rgba(180,40,40,0.55)' : 'rgba(190,44,40,0.85)';
    b.fillRect(colX + W * 0.012, wy + H * 0.10, W * 0.021, H * 0.030);
    b.fillStyle = 'rgba(255,250,244,0.85)';
    b.font = `${Math.max(5, H * 0.008)}px "Noto Serif SC", serif`;
    b.textAlign = 'center';
    b.fillText('消防', colX + W * 0.0225, wy + H * 0.118);
    // 柱脚的踢脚线
    b.fillStyle = night ? 'rgba(10,8,14,0.5)' : 'rgba(60,58,54,0.35)';
    b.fillRect(colX, horizon - H * 0.030, W * 0.045, H * 0.030);

    // 窗边的休息沙发与落地灯
    b.fillStyle = night ? 'rgba(40,36,50,0.9)' : 'rgba(96,92,88,0.85)';
    b.beginPath();
    b.ellipse(W * 0.70, horizon - H * 0.030, W * 0.075, H * 0.030, 0, 0, 6.3);
    b.fill();
    b.fillStyle = night ? 'rgba(56,50,68,0.9)' : 'rgba(120,114,106,0.85)';
    b.beginPath();
    b.ellipse(W * 0.70, horizon - H * 0.044, W * 0.065, H * 0.022, 0, 0, 6.3);
    b.fill();
    b.strokeStyle = 'rgba(30,28,34,0.55)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(W * 0.775, horizon - H * 0.085);
    b.lineTo(W * 0.775, horizon - H * 0.005);
    b.stroke();
    b.fillStyle = night ? 'rgba(255,214,150,0.65)' : 'rgba(255,240,210,0.75)';
    b.beginPath();
    b.moveTo(W * 0.762, horizon - H * 0.085);
    b.lineTo(W * 0.788, horizon - H * 0.085);
    b.lineTo(W * 0.783, horizon - H * 0.102);
    b.lineTo(W * 0.767, horizon - H * 0.102);
    b.closePath(); b.fill();
    b.save();
    b.globalCompositeOperation = 'lighter';
    const floorLamp = b.createRadialGradient(W * 0.775, horizon - H * 0.090, 0, W * 0.775, horizon - H * 0.090, W * 0.07);
    floorLamp.addColorStop(0, 'rgba(255,204,132,0.24)');
    floorLamp.addColorStop(1, 'rgba(255,204,132,0)');
    b.fillStyle = floorLamp;
    b.fillRect(W * 0.69, horizon - H * 0.16, W * 0.17, H * 0.20);
    b.restore();

    // 走廊尽头的出口指示灯
    b.fillStyle = night ? 'rgba(40,80,60,0.65)' : 'rgba(48,120,80,0.80)';
    b.fillRect(W * 0.425, ceilY + H * 0.018, W * 0.038, H * 0.014);
    b.fillStyle = 'rgba(220,255,230,0.85)';
    b.font = `${Math.max(5, H * 0.008)}px "Noto Serif SC", serif`;
    b.textAlign = 'center';
    b.fillText('安全出口', W * 0.444, ceilY + H * 0.029);
    // 黄昏统一色温：压暗高光，让窗外与室内连成一片
    if (dusk) {
      b.save();
      b.globalCompositeOperation = 'multiply';
      const tg = b.createLinearGradient(0, 0, 0, horizon);
      tg.addColorStop(0, 'rgba(146,116,148,0.34)');
      tg.addColorStop(0.55, 'rgba(214,146,118,0.30)');
      tg.addColorStop(1, 'rgba(136,92,98,0.30)');
      b.fillStyle = tg;
      b.fillRect(0, 0, W, horizon);
      b.globalCompositeOperation = 'lighter';
      const warm = b.createLinearGradient(0, horizon * 0.55, 0, horizon);
      warm.addColorStop(0, 'rgba(255,150,96,0.05)');
      warm.addColorStop(1, 'rgba(255,170,110,0.10)');
      b.fillStyle = warm;
      b.fillRect(0, horizon * 0.55, W, horizon * 0.45);
      b.restore();
    }
  }
  drawOffice.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    // 地毯：方块拼毯，近处更大
    const g = b.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, night ? '#181620' : day ? '#76726a' : '#403a44');
    g.addColorStop(0.55, night ? '#14121c' : day ? '#6a665e' : '#36303a');
    g.addColorStop(1, night ? '#0a0910' : day ? '#4c4842' : '#221c26');
    b.fillStyle = g;
    b.fillRect(0, horizon, W, H - horizon);
    // 拼毯格
    for (let r = 0; r < 8; r++) {
      const t0 = r / 8, t1 = (r + 1) / 8;
      const y0 = horizon + Math.pow(t0, 1.35) * (H - horizon);
      const y1 = horizon + Math.pow(t1, 1.35) * (H - horizon);
      const cols = 6 + r * 2;
      for (let c = 0; c < cols; c++) {
        const off = (r % 2) * 0.5;
        const x0 = W * ((c - 0.5 + off) / cols);
        const x1 = W * ((c + 0.5 + off) / cols);
        const v = perm(r * 19 + c, 59);
        b.fillStyle = v > 0.5
          ? `rgba(255,250,240,${0.006 + v * 0.012})`
          : `rgba(0,0,0,${0.01 + (1 - v) * 0.02})`;
        b.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
      }
      b.strokeStyle = night ? 'rgba(140,140,160,0.05)' : 'rgba(40,40,44,0.12)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(0, y0); b.lineTo(W, y0); b.stroke();
    }
    // 地毯纤维
    for (let i = 0; i < 300; i++) {
      const yy = horizon + rand(0, 1) * (H - horizon);
      b.fillStyle = Math.random() < 0.5 ? 'rgba(255,250,240,0.015)' : 'rgba(0,0,0,0.03)';
      b.fillRect(rand(0, W), yy, rand(1, 3), 1);
    }

    // 窗光与室内灯落在地面
    b.save();
    b.globalCompositeOperation = 'lighter';
    const pool = b.createLinearGradient(0, horizon, 0, H);
    pool.addColorStop(0, day ? 'rgba(240,246,250,0.13)' : night ? 'rgba(90,110,210,0.07)' : 'rgba(255,186,128,0.10)');
    pool.addColorStop(0.55, day ? 'rgba(240,246,250,0.03)' : 'rgba(90,110,210,0.02)');
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = pool;
    b.fillRect(W * 0.02, horizon, W * 0.96, H - horizon);
    // 天花灯带的倒影
    for (let i = 0; i < 4; i++) {
      const lx = W * (0.07 + i * 0.235) + W * 0.05;
      const lg = b.createLinearGradient(0, horizon, 0, H * 0.75);
      lg.addColorStop(0, 'rgba(255,250,236,0.10)');
      lg.addColorStop(1, 'rgba(255,250,236,0)');
      b.fillStyle = lg;
      b.fillRect(lx, horizon, W * 0.085, H * 0.22);
    }
    b.restore();

    // 开放工位：两排，桌面、显示器、键盘、杯子与椅子
    const rows = 2;
    for (let r = 0; r < rows; r++) {
      const t = r / rows;
      const yy = horizon + (H - horizon) * (0.15 + t * 0.32);
      const scale = 0.82 + t * 0.36;
      for (let i = 0; i < 4; i++) {
        const xx = W * (0.055 + i * 0.235 + (r % 2) * 0.018);
        const dw = W * 0.165 * scale;
        const deskH = H * 0.012 * scale;
        // 桌下阴影
        b.fillStyle = 'rgba(0,0,0,0.20)';
        b.beginPath();
        b.ellipse(xx + dw * 0.5, yy + H * 0.058 * scale, dw * 0.52, H * 0.014 * scale, 0, 0, 6.3);
        b.fill();
        // 桌腿与挡板
        b.fillStyle = night ? '#1c1a24' : '#6e6a62';
        b.fillRect(xx + dw * 0.05, yy + deskH, W * 0.006, H * 0.055 * scale);
        b.fillRect(xx + dw * 0.90, yy + deskH, W * 0.006, H * 0.055 * scale);
        b.fillStyle = night ? 'rgba(30,28,38,0.78)' : 'rgba(92,84,78,0.55)';
        b.fillRect(xx + dw * 0.04, yy + deskH + H * 0.012 * scale, dw * 0.92, H * 0.042 * scale);
        b.fillStyle = 'rgba(255,250,238,0.05)';
        b.fillRect(xx + dw * 0.04, yy + deskH + H * 0.012 * scale, dw * 0.92, 1);
        // 桌面
        const topG = b.createLinearGradient(0, yy, 0, yy + deskH);
        topG.addColorStop(0, night ? 'rgba(58,54,66,0.95)' : day ? 'rgba(232,226,210,0.98)' : 'rgba(112,98,92,0.98)');
        topG.addColorStop(1, night ? 'rgba(38,36,46,0.95)' : day ? 'rgba(200,194,180,0.98)' : 'rgba(88,74,72,0.98)');
        b.fillStyle = topG;
        b.fillRect(xx, yy, dw, deskH);
        b.fillStyle = 'rgba(255,250,238,0.14)';
        b.fillRect(xx, yy, dw, 1.6);
        // 桌下收纳柜
        b.fillStyle = night ? 'rgba(24,22,32,0.9)' : 'rgba(120,116,108,0.85)';
        b.fillRect(xx + dw * 0.68, yy + deskH + H * 0.004, dw * 0.24, H * 0.042 * scale);
        b.strokeStyle = 'rgba(0,0,0,0.25)';
        b.lineWidth = 0.8;
        for (let d = 1; d < 3; d++) {
          b.beginPath();
          b.moveTo(xx + dw * 0.68, yy + deskH + H * (0.004 + d * 0.014) * scale);
          b.lineTo(xx + dw * 0.92, yy + deskH + H * (0.004 + d * 0.014) * scale);
          b.stroke();
        }
        // 显示器：深色边框、支架、压暗的屏幕内容
        const mw = dw * 0.42, mh = H * 0.064 * scale;
        const monX = xx + dw * 0.29, monY = yy - mh - H * 0.004;
        b.fillStyle = night ? '#0a0910' : '#1c1b20';
        b.fillRect(monX - 1.5, monY - 1.5, mw + 3, mh + 3);
        b.fillStyle = night ? '#0a0910' : '#242327';
        b.fillRect(monX + mw * 0.43, monY + mh + 1.5, mw * 0.14, H * 0.014 * scale);
        b.beginPath();
        b.moveTo(monX + mw * 0.26, monY + mh + H * 0.014 * scale);
        b.lineTo(monX + mw * 0.74, monY + mh + H * 0.014 * scale);
        b.lineTo(monX + mw * 0.70, monY + mh + H * 0.019 * scale);
        b.lineTo(monX + mw * 0.30, monY + mh + H * 0.019 * scale);
        b.closePath(); b.fill();
        // 屏幕
        const scrG = b.createLinearGradient(monX, monY, monX + mw, monY + mh);
        scrG.addColorStop(0, night ? 'rgba(26,40,78,0.95)' : 'rgba(96,120,142,0.95)');
        scrG.addColorStop(0.55, night ? 'rgba(20,32,64,0.95)' : 'rgba(74,98,120,0.95)');
        scrG.addColorStop(1, night ? 'rgba(14,22,46,0.95)' : 'rgba(56,76,96,0.95)');
        b.fillStyle = scrG;
        b.fillRect(monX + 3, monY + 3, mw - 6, mh - 6);
        // 屏幕里的窗口与文字行
        b.fillStyle = night ? 'rgba(140,180,240,0.35)' : 'rgba(196,216,232,0.42)';
        for (let k = 0; k < 6; k++) {
          b.fillRect(monX + mw * 0.10, monY + mh * (0.14 + k * 0.115), mw * (0.35 + (k % 3) * 0.16), Math.max(1, mh * 0.032));
        }
        b.fillStyle = night ? 'rgba(120,170,240,0.28)' : 'rgba(214,230,244,0.30)';
        b.fillRect(monX + mw * 0.70, monY + mh * 0.12, mw * 0.20, mh * 0.72);
        // 屏幕下缘的一点反光
        b.fillStyle = 'rgba(255,255,255,0.05)';
        b.fillRect(monX + 3, monY + mh - 5, mw - 6, 1);
        // 屏幕光（只在夜里明显）
        b.save();
        b.globalCompositeOperation = 'lighter';
        b.fillStyle = night ? 'rgba(110,150,230,0.05)' : 'rgba(220,238,252,0.025)';
        b.beginPath();
        b.ellipse(monX + mw * 0.5, monY + mh * 0.55, mw * 0.85, mh * 0.8, 0, 0, 6.3);
        b.fill();
        b.restore();
        // 键盘与鼠标
        b.fillStyle = night ? 'rgba(24,24,32,0.9)' : 'rgba(70,70,74,0.70)';
        b.fillRect(xx + dw * 0.28, yy + deskH * 0.42, dw * 0.28, deskH * 0.30);
        b.strokeStyle = 'rgba(0,0,0,0.2)';
        b.lineWidth = 0.6;
        for (let k = 1; k < 5; k++) {
          b.beginPath();
          b.moveTo(xx + dw * (0.28 + k * 0.056), yy + deskH * 0.42);
          b.lineTo(xx + dw * (0.28 + k * 0.056), yy + deskH * 0.72);
          b.stroke();
        }
        b.beginPath();
        b.ellipse(xx + dw * 0.63, yy + deskH * 0.55, dw * 0.014, deskH * 0.18, 0, 0, 6.3);
        b.fill();
        // 文件、笔筒与咖啡杯
        b.fillStyle = 'rgba(240,236,222,0.55)';
        b.save();
        b.translate(xx + dw * 0.06, yy + deskH * 0.55);
        b.rotate(-0.08);
        b.fillRect(0, 0, dw * 0.14, deskH * 0.55);
        b.restore();
        b.fillStyle = night ? 'rgba(80,72,66,0.8)' : 'rgba(150,140,126,0.8)';
        b.fillRect(xx + dw * 0.84, yy - H * 0.020 * scale, dw * 0.040, H * 0.020 * scale);
        b.fillStyle = 'rgba(240,236,222,0.65)';
        b.fillRect(xx + dw * 0.85, yy - H * 0.026 * scale, dw * 0.030, H * 0.006 * scale);
        // 杯子与绿植
        b.fillStyle = 'rgba(238,234,222,0.70)';
        b.fillRect(xx + dw * 0.76, yy - H * 0.016 * scale, W * 0.010 * scale, H * 0.016 * scale);
        b.fillStyle = 'rgba(28,26,24,0.55)';
        b.beginPath();
        b.arc(xx + dw * 0.765 + W * 0.005 * scale, yy - H * 0.016 * scale, W * 0.005 * scale, Math.PI, 6.283);
        b.fill();
        if (i % 2 === 0) {
          const plx = xx + dw * 0.95, ply = yy - H * 0.008 * scale;
          b.fillStyle = night ? 'rgba(70,60,54,0.9)' : 'rgba(160,120,90,0.9)';
          b.fillRect(plx, ply - H * 0.012 * scale, W * 0.011 * scale, H * 0.013 * scale);
          for (let l = 0; l < 6; l++) {
            const a = (l / 6) * Math.PI - Math.PI;
            b.strokeStyle = `rgba(${night ? '54,88,58' : '82,120,70'},0.85)`;
            b.lineWidth = 1.4;
            b.beginPath();
            b.moveTo(plx + W * 0.0055 * scale, ply - H * 0.012 * scale);
            b.quadraticCurveTo(
              plx + W * 0.0055 * scale + Math.cos(a) * W * 0.012 * scale,
              ply - H * (0.020 + Math.abs(Math.sin(a)) * 0.014) * scale,
              plx + W * 0.0055 * scale + Math.cos(a) * W * 0.020 * scale,
              ply - H * (0.014 + Math.abs(Math.sin(a)) * 0.010) * scale);
            b.stroke();
          }
        }
        // 人体工学转椅：靠背、坐垫、五爪底座
        const chx = xx + dw * 0.52;
        const chy = yy + H * 0.040 * scale;
        b.fillStyle = night ? 'rgba(24,22,32,0.95)' : 'rgba(52,52,60,0.80)';
        b.beginPath();
        b.moveTo(chx - dw * 0.055, chy - H * 0.020 * scale);
        b.quadraticCurveTo(chx - dw * 0.060, chy - H * 0.052 * scale, chx, chy - H * 0.055 * scale);
        b.quadraticCurveTo(chx + dw * 0.060, chy - H * 0.052 * scale, chx + dw * 0.055, chy - H * 0.020 * scale);
        b.lineTo(chx + dw * 0.045, chy - H * 0.010 * scale);
        b.lineTo(chx - dw * 0.045, chy - H * 0.010 * scale);
        b.closePath(); b.fill();
        b.fillStyle = night ? 'rgba(36,32,44,0.95)' : 'rgba(74,74,82,0.85)';
        b.beginPath();
        b.ellipse(chx, chy + H * 0.002 * scale, dw * 0.055, H * 0.016 * scale, 0, 0, 6.3);
        b.fill();
        // 椅背轮廓的受光边
        b.strokeStyle = 'rgba(255,236,206,0.13)';
        b.lineWidth = 1;
        b.beginPath();
        b.moveTo(chx - dw * 0.055, chy - H * 0.020 * scale);
        b.quadraticCurveTo(chx - dw * 0.060, chy - H * 0.052 * scale, chx, chy - H * 0.055 * scale);
        b.stroke();
        b.strokeStyle = night ? 'rgba(60,56,70,0.9)' : 'rgba(90,90,98,0.8)';
        b.lineWidth = Math.max(2.6, H * 0.0034 * scale);
        b.beginPath();
        b.moveTo(chx, chy + H * 0.010 * scale);
        b.lineTo(chx, chy + H * 0.030 * scale);
        b.stroke();
        // 五爪与滚轮
        b.strokeStyle = night ? 'rgba(52,48,62,0.95)' : 'rgba(64,64,72,0.9)';
        b.lineWidth = Math.max(2.4, H * 0.003 * scale);
        for (let l = 0; l < 5; l++) {
          const a = (l / 5) * 6.283 + 0.3;
          const ex = chx + Math.cos(a) * dw * 0.045;
          const ey = chy + H * (0.040 + Math.sin(a) * 0.006) * scale;
          b.beginPath();
          b.moveTo(chx, chy + H * 0.030 * scale);
          b.lineTo(ex, ey);
          b.stroke();
          b.fillStyle = night ? 'rgba(34,32,42,0.95)' : 'rgba(44,44,50,0.9)';
          b.beginPath(); b.arc(ex, ey, Math.max(1.6, H * 0.0028 * scale), 0, 6.3); b.fill();
        }
      }
    }

    // 工位之间的矮隔断与绿植
    for (let i = 0; i < 3; i++) {
      const sx = W * (0.245 + i * 0.235);
      b.fillStyle = night ? 'rgba(32,30,40,0.85)' : 'rgba(150,146,136,0.70)';
      b.fillRect(sx, horizon + H * 0.10, W * 0.008, H * 0.20);
      b.fillStyle = 'rgba(255,250,238,0.06)';
      b.fillRect(sx, horizon + H * 0.10, 1.4, H * 0.20);
    }

    // 远处玻璃隔断在地面的反光
    b.save();
    b.globalAlpha = 0.06;
    b.fillStyle = '#cfe0ff';
    b.fillRect(W * 0.02, horizon + H * 0.012, W * 0.30, H * 0.020);
    b.restore();
  };

  /* ---------- 场景：清吧 ---------- */
  function drawBar(b, p, horizon) {
    const p2 = PALETTES[state.time] || PALETTES.night;
    const day = state.time === 'day';
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    /* ---------- 天花板：深色木梁、吊灯与烟色 ---------- */
    const ceilY = H * 0.115;
    const ceilG = b.createLinearGradient(0, 0, 0, ceilY);
    ceilG.addColorStop(0, '#150d10');
    ceilG.addColorStop(1, '#241417');
    b.fillStyle = ceilG;
    b.fillRect(0, 0, W, ceilY);
    // 木板缝
    for (let i = 0; i < 14; i++) {
      const xx = W * (i / 14);
      b.strokeStyle = 'rgba(0,0,0,0.28)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(xx, 0); b.lineTo(xx, ceilY); b.stroke();
    }
    // 横梁
    for (let i = 0; i < 4; i++) {
      const by0 = ceilY * (0.18 + i * 0.24);
      const bg = b.createLinearGradient(0, by0, 0, by0 + H * 0.018);
      bg.addColorStop(0, '#3a221c');
      bg.addColorStop(1, '#1c0f11');
      b.fillStyle = bg;
      b.fillRect(0, by0, W, H * 0.018);
      b.fillStyle = 'rgba(255,196,140,0.07)';
      b.fillRect(0, by0, W, 1.2);
    }
    // 吊灯：三盏铁艺罩灯
    const pendants = [0.20, 0.50, 0.80];
    for (let i = 0; i < pendants.length; i++) {
      const lx = W * pendants[i];
      const ly = ceilY + H * 0.035;
      b.strokeStyle = 'rgba(18,12,12,0.95)';
      b.lineWidth = 1.4;
      b.beginPath(); b.moveTo(lx, 0); b.lineTo(lx, ly - H * 0.012); b.stroke();
      // 铁罩
      b.fillStyle = 'rgba(30,22,20,0.98)';
      b.beginPath();
      b.moveTo(lx - W * 0.022, ly + H * 0.006);
      b.lineTo(lx - W * 0.012, ly - H * 0.014);
      b.lineTo(lx + W * 0.012, ly - H * 0.014);
      b.lineTo(lx + W * 0.022, ly + H * 0.006);
      b.closePath(); b.fill();
      b.fillStyle = 'rgba(255,204,134,0.92)';
      b.beginPath();
      b.ellipse(lx, ly + H * 0.006, W * 0.010, H * 0.004, 0, 0, 6.3);
      b.fill();
      // 灯丝
      b.strokeStyle = 'rgba(255,170,90,0.7)';
      b.lineWidth = 0.8;
      b.beginPath();
      b.moveTo(lx - W * 0.004, ly - H * 0.001);
      b.lineTo(lx + W * 0.004, ly - H * 0.001);
      b.stroke();
      // 光晕
      b.save();
      b.globalCompositeOperation = 'lighter';
      const lg = b.createRadialGradient(lx, ly, 0, lx, ly, W * 0.13);
      lg.addColorStop(0, 'rgba(255,186,106,0.24)');
      lg.addColorStop(0.4, 'rgba(255,176,96,0.07)');
      lg.addColorStop(1, 'rgba(255,176,96,0)');
      b.fillStyle = lg;
      b.beginPath(); b.arc(lx, ly, W * 0.13, 0, 6.3); b.fill();
      b.restore();
    }

    /* ---------- 后墙：护墙板、镜子与酒架 ---------- */
    const wallY = ceilY;
    const wallG = b.createLinearGradient(0, wallY, 0, horizon);
    wallG.addColorStop(0, '#2a171a');
    wallG.addColorStop(0.55, '#241316');
    wallG.addColorStop(1, '#190c10');
    b.fillStyle = wallG;
    b.fillRect(0, wallY, W, horizon - wallY);
    // 墙板的分格与木纹
    b.strokeStyle = 'rgba(90,56,44,0.18)';
    b.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const xx = W * (0.01 + i * 0.11);
      b.strokeRect(xx, wallY + H * 0.012, W * 0.09, horizon * 0.30);
    }
    for (let i = 0; i < 26; i++) {
      b.strokeStyle = `rgba(255,196,150,${rand(0.01, 0.03)})`;
      b.beginPath();
      b.moveTo(rand(0, W), wallY);
      b.quadraticCurveTo(rand(0, W), horizon * 0.5, rand(0, W), horizon);
      b.stroke();
    }

    // 中央大镜子：斑驳的水银
    const mirX = W * 0.285, mirY = H * 0.150, mirW = W * 0.43, mirH = horizon - mirY - H * 0.16;
    b.fillStyle = 'rgba(16,12,12,0.9)';
    b.fillRect(mirX - W * 0.010, mirY - H * 0.012, mirW + W * 0.020, mirH + H * 0.024);
    b.strokeStyle = 'rgba(150,112,72,0.45)';
    b.lineWidth = 2;
    b.strokeRect(mirX - W * 0.010, mirY - H * 0.012, mirW + W * 0.020, mirH + H * 0.024);
    const mirG = b.createLinearGradient(mirX, mirY, mirX + mirW, mirY + mirH);
    mirG.addColorStop(0, 'rgba(90,82,80,0.22)');
    mirG.addColorStop(0.45, 'rgba(44,38,42,0.30)');
    mirG.addColorStop(1, 'rgba(70,58,58,0.22)');
    b.fillStyle = mirG;
    b.fillRect(mirX, mirY, mirW, mirH);
    // 镜中倒影：对面的一排暖灯
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const rx = mirX + mirW * (0.10 + i * 0.15);
      const rg = b.createRadialGradient(rx, mirY + mirH * 0.45, 0, rx, mirY + mirH * 0.45, mirW * 0.09);
      rg.addColorStop(0, 'rgba(255,186,110,0.16)');
      rg.addColorStop(1, 'rgba(255,186,110,0)');
      b.fillStyle = rg;
      b.beginPath(); b.arc(rx, mirY + mirH * 0.45, mirW * 0.09, 0, 6.3); b.fill();
    }
    b.restore();
    // 镜面斑驳与裂纹
    for (let i = 0; i < 14; i++) {
      b.fillStyle = `rgba(20,16,18,${rand(0.05, 0.16)})`;
      b.beginPath();
      b.ellipse(mirX + rand(0, mirW), mirY + rand(0, mirH), rand(3, 16), rand(2, 8), rand(0, 3), 0, 6.3);
      b.fill();
    }
    b.strokeStyle = 'rgba(220,214,200,0.08)';
    b.lineWidth = 0.7;
    b.beginPath();
    b.moveTo(mirX + mirW * 0.70, mirY + mirH * 0.10);
    b.lineTo(mirX + mirW * 0.76, mirY + mirH * 0.48);
    b.lineTo(mirX + mirW * 0.72, mirY + mirH * 0.86);
    b.stroke();

    // 酒架：三层，压在镜子前面
    const shelfXs = [W * 0.190, W * 0.925];
    const shelfW = W * 0.735;
    for (let s = 0; s < 3; s++) {
      const sy = horizon * 0.47 + s * H * 0.088;
      // 层板
      b.fillStyle = '#3a241c';
      b.fillRect(shelfXs[0], sy, shelfW, H * 0.010);
      b.fillStyle = 'rgba(255,214,164,0.14)';
      b.fillRect(shelfXs[0], sy, shelfW, 1.5);
      b.fillStyle = 'rgba(0,0,0,0.35)';
      b.fillRect(shelfXs[0], sy + H * 0.010, shelfW, H * 0.004);
      // 层板下的暖光灯条
      b.save();
      b.globalCompositeOperation = 'lighter';
      const glow = b.createLinearGradient(0, sy, 0, sy + H * 0.045);
      glow.addColorStop(0, 'rgba(255,186,112,0.10)');
      glow.addColorStop(1, 'rgba(255,186,112,0)');
      b.fillStyle = glow;
      b.fillRect(shelfXs[0], sy, shelfW, H * 0.045);
      b.restore();
      // 酒瓶
      for (let i = 0; i < 19; i++) {
        const bx = shelfXs[0] + W * (0.012 + i * 0.038) + rand(-2, 2);
        const bh = H * (0.036 + perm(s * 30 + i, 3) * 0.026);
        const bw = W * (0.008 + perm(s * 30 + i, 5) * 0.005);
        const base = sy;
        // 瓶体颜色：深绿、琥珀、墨褐与陈年金
        const tone = perm(s * 30 + i, 7);
        const body = tone > 0.72
          ? 'rgba(78,108,86,0.92)'
          : tone > 0.45
            ? 'rgba(96,48,32,0.94)'
            : tone > 0.22
              ? 'rgba(48,34,30,0.95)'
              : 'rgba(126,98,60,0.92)';
        // 瓶身
        b.fillStyle = body;
        b.beginPath();
        b.moveTo(bx - bw * 0.5, base);
        b.lineTo(bx - bw * 0.5, base - bh * 0.60);
        b.quadraticCurveTo(bx - bw * 0.48, base - bh * 0.72, bx - bw * 0.22, base - bh * 0.76);
        b.lineTo(bx - bw * 0.16, base - bh * 0.86);
        b.lineTo(bx - bw * 0.16, base - bh);
        b.lineTo(bx + bw * 0.16, base - bh);
        b.lineTo(bx + bw * 0.16, base - bh * 0.86);
        b.lineTo(bx + bw * 0.22, base - bh * 0.76);
        b.quadraticCurveTo(bx + bw * 0.48, base - bh * 0.72, bx + bw * 0.5, base - bh * 0.60);
        b.lineTo(bx + bw * 0.5, base);
        b.closePath(); b.fill();
        // 瓶身两侧的收暗，避免糖果色
        b.fillStyle = 'rgba(6,4,6,0.34)';
        b.fillRect(bx + bw * 0.26, base - bh * 0.58, bw * 0.24, bh * 0.58);
        b.fillRect(bx - bw * 0.50, base - bh * 0.58, bw * 0.12, bh * 0.58);
        // 瓶底与肩部的高光
        b.fillStyle = 'rgba(255,236,200,0.16)';
        b.fillRect(bx - bw * 0.40, base - bh * 0.58, bw * 0.10, bh * 0.50);
        b.fillStyle = 'rgba(255,240,214,0.10)';
        b.beginPath();
        b.ellipse(bx - bw * 0.18, base - bh * 0.70, bw * 0.12, bh * 0.06, -0.4, 0, 6.3);
        b.fill();
        // 瓶盖与封口
        b.fillStyle = perm(s * 30 + i, 9) > 0.5 ? 'rgba(190,150,90,0.9)' : 'rgba(44,36,32,0.95)';
        b.fillRect(bx - bw * 0.18, base - bh - H * 0.004, bw * 0.36, H * 0.005);
        // 酒标
        if (perm(s * 30 + i, 11) > 0.30) {
          b.fillStyle = 'rgba(226,212,182,0.52)';
          b.fillRect(bx - bw * 0.32, base - bh * 0.42, bw * 0.64, bh * 0.18);
          b.fillStyle = 'rgba(80,54,40,0.40)';
          b.fillRect(bx - bw * 0.22, base - bh * 0.36, bw * 0.44, 1.2);
          b.fillRect(bx - bw * 0.16, base - bh * 0.31, bw * 0.32, 1);
        }
        // 透过酒液的灯影
        b.save();
        b.globalCompositeOperation = 'lighter';
        b.fillStyle = 'rgba(255,176,96,0.08)';
        b.fillRect(bx - bw * 0.4, base - bh * 0.55, bw * 0.8, bh * 0.45);
        b.restore();
      }
    }
    // 酒架立柱
    for (const px0 of [shelfXs[0] - W * 0.006, shelfXs[1] - W * 0.004]) {
      b.fillStyle = '#2c1a16';
      b.fillRect(px0, horizon * 0.44, W * 0.012, H * 0.30);
      b.fillStyle = 'rgba(255,210,160,0.08)';
      b.fillRect(px0, horizon * 0.44, 1.4, H * 0.30);
    }

    // 黑胶唱机与唱片封套（架子右侧）
    const rpx = W * 0.805, rpy = horizon * 0.40;
    b.fillStyle = 'rgba(16,10,12,0.9)';
    b.fillRect(rpx, rpy, W * 0.075, H * 0.030);
    b.fillStyle = 'rgba(40,32,30,0.95)';
    b.fillRect(rpx + W * 0.006, rpy - H * 0.018, W * 0.063, H * 0.018);
    b.fillStyle = 'rgba(10,8,10,0.95)';
    b.beginPath(); b.arc(rpx + W * 0.036, rpy - H * 0.009, W * 0.022, 0, 6.3); b.fill();
    b.strokeStyle = 'rgba(180,160,130,0.25)';
    b.lineWidth = 0.6;
    for (let i = 0; i < 4; i++) {
      b.beginPath(); b.arc(rpx + W * 0.036, rpy - H * 0.009, W * (0.008 + i * 0.004), 0, 6.3); b.stroke();
    }
    b.strokeStyle = 'rgba(190,176,150,0.6)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(rpx + W * 0.060, rpy - H * 0.020);
    b.lineTo(rpx + W * 0.040, rpy - H * 0.010);
    b.stroke();

    // 左侧的黑板酒单
    const cbx = W * 0.046, cby = H * 0.175, cbw = W * 0.132, cbh = H * 0.168;
    b.fillStyle = '#3a261c';
    b.fillRect(cbx - W * 0.006, cby - H * 0.008, cbw + W * 0.012, cbh + H * 0.016);
    b.fillStyle = '#12100f';
    b.fillRect(cbx, cby, cbw, cbh);
    b.fillStyle = 'rgba(230,224,206,0.75)';
    b.font = `${Math.max(6, W * 0.0075)}px "Noto Serif SC", serif`;
    b.textAlign = 'left';
    b.fillText('今 夜 酒 单', cbx + cbw * 0.10, cby + cbh * 0.16);
    b.strokeStyle = 'rgba(230,224,206,0.35)';
    b.lineWidth = 0.8;
    b.beginPath();
    b.moveTo(cbx + cbw * 0.08, cby + cbh * 0.20);
    b.lineTo(cbx + cbw * 0.92, cby + cbh * 0.20);
    b.stroke();
    const menu = ['威士忌 · 单一麦芽', '金汤力', '热红酒', '店主的私藏'];
    b.fillStyle = 'rgba(226,220,202,0.55)';
    b.font = `${Math.max(5, W * 0.0062)}px "Noto Serif SC", serif`;
    menu.forEach((m, i) => b.fillText(m, cbx + cbw * 0.10, cby + cbh * (0.36 + i * 0.15)));
    b.strokeStyle = 'rgba(226,220,202,0.18)';
    for (let i = 0; i < 4; i++) {
      b.beginPath();
      b.moveTo(cbx + cbw * 0.08, cby + cbh * (0.39 + i * 0.15));
      b.lineTo(cbx + cbw * 0.90, cby + cbh * (0.39 + i * 0.15));
      b.stroke();
    }
    // 粉笔灰
    for (let i = 0; i < 24; i++) {
      b.fillStyle = `rgba(230,224,206,${rand(0.03, 0.08)})`;
      b.fillRect(cbx + rand(0, cbw), cby + rand(0, cbh), 1, 1);
    }

    /* ---------- 右侧窗户：夜雨街景 ---------- */
    const wx = W * 0.690, wy = H * 0.170, ww = W * 0.275, wh = horizon - wy - H * 0.030;
    b.fillStyle = '#3a261c';
    b.fillRect(wx - W * 0.010, wy - H * 0.012, ww + W * 0.020, wh + H * 0.024);
    b.save();
    b.beginPath(); b.rect(wx, wy, ww, wh); b.clip();
    const skyG = b.createLinearGradient(0, wy, 0, wy + wh);
    skyG.addColorStop(0, '#070a16');
    skyG.addColorStop(1, '#141a30');
    b.fillStyle = skyG;
    b.fillRect(wx, wy, ww, wh);
    // 对街的建筑剪影与窗
    b.fillStyle = 'rgba(8,8,16,0.92)';
    b.beginPath();
    b.moveTo(wx, wy + wh * 0.30);
    b.lineTo(wx + ww * 0.22, wy + wh * 0.24);
    b.lineTo(wx + ww * 0.22, wy + wh);
    b.lineTo(wx, wy + wh);
    b.closePath(); b.fill();
    b.beginPath();
    b.moveTo(wx + ww * 0.70, wy + wh * 0.34);
    b.lineTo(wx + ww, wy + wh * 0.28);
    b.lineTo(wx + ww, wy + wh);
    b.lineTo(wx + ww * 0.70, wy + wh);
    b.closePath(); b.fill();
    for (let i = 0; i < 14; i++) {
      b.fillStyle = `rgba(255,196,120,${rand(0.15, 0.5)})`;
      b.fillRect(wx + ww * (0.02 + perm(i, 5) * 0.18), wy + wh * (0.34 + perm(i, 7) * 0.55), rand(1.5, 3.2), rand(1.5, 3));
    }
    // 街灯与雨棚
    for (let i = 0; i < 2; i++) {
      const lx = wx + ww * (0.36 + i * 0.36), ly = wy + wh * 0.52;
      b.strokeStyle = 'rgba(20,18,20,0.8)';
      b.lineWidth = 2;
      b.beginPath(); b.moveTo(lx, wy + wh); b.lineTo(lx, ly); b.stroke();
      const lg = b.createRadialGradient(lx, ly, 0, lx, ly, ww * 0.20);
      lg.addColorStop(0, 'rgba(255,196,120,0.30)');
      lg.addColorStop(1, 'rgba(255,196,120,0)');
      b.fillStyle = lg;
      b.beginPath(); b.arc(lx, ly, ww * 0.20, 0, 6.3); b.fill();
      b.fillStyle = 'rgba(255,222,166,0.9)';
      b.beginPath(); b.arc(lx, ly, 2.2, 0, 6.3); b.fill();
    }
    // 街面的湿光与车灯
    b.save();
    b.globalCompositeOperation = 'lighter';
    const street = b.createLinearGradient(0, wy + wh * 0.62, 0, wy + wh);
    street.addColorStop(0, 'rgba(255,180,110,0.16)');
    street.addColorStop(1, 'rgba(255,150,80,0.03)');
    b.fillStyle = street;
    b.fillRect(wx, wy + wh * 0.62, ww, wh * 0.38);
    for (let i = 0; i < 3; i++) {
      const bx0 = wx + ww * (0.15 + i * 0.28);
      b.fillStyle = 'rgba(255,90,70,0.30)';
      b.beginPath(); b.arc(bx0, wy + wh * 0.80, 2.5, 0, 6.3); b.fill();
      b.fillStyle = 'rgba(255,220,160,0.25)';
      b.beginPath(); b.arc(bx0 + ww * 0.05, wy + wh * 0.83, 2, 0, 6.3); b.fill();
    }
    b.restore();
    // 雨丝
    b.strokeStyle = 'rgba(170,196,240,0.16)';
    b.lineWidth = 0.9;
    for (let i = 0; i < 40; i++) {
      const rx = wx + rand(0, ww);
      const ry = wy + rand(0, wh);
      b.beginPath();
      b.moveTo(rx, ry);
      b.lineTo(rx + 1.4, ry + rand(8, 20));
      b.stroke();
    }
    // 玻璃上的水痕与流下的小水珠
    for (let i = 0; i < 16; i++) {
      const rx = wx + rand(0, ww);
      b.strokeStyle = 'rgba(180,204,240,0.10)';
      b.lineWidth = rand(0.6, 1.4);
      b.beginPath();
      b.moveTo(rx, wy);
      b.bezierCurveTo(rx + rand(-6, 6), wy + wh * 0.3, rx + rand(-8, 8), wy + wh * 0.6, rx + rand(-4, 4), wy + wh);
      b.stroke();
    }
    for (let i = 0; i < 20; i++) {
      b.fillStyle = `rgba(200,220,250,${rand(0.05, 0.16)})`;
      b.beginPath();
      b.ellipse(wx + rand(0, ww), wy + rand(0, wh), 1.4, 2.6, 0, 0, 6.3);
      b.fill();
    }
    // 室内暖光在玻璃上的反光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const refl = b.createLinearGradient(wx, wy, wx + ww, wy + wh);
    refl.addColorStop(0, 'rgba(255,190,120,0.08)');
    refl.addColorStop(0.5, 'rgba(255,190,120,0.02)');
    refl.addColorStop(1, 'rgba(255,190,120,0.05)');
    b.fillStyle = refl;
    b.fillRect(wx, wy, ww, wh);
    b.restore();
    b.restore();
    // 窗框与窗台
    b.strokeStyle = '#4a3024';
    b.lineWidth = 4;
    b.strokeRect(wx, wy, ww, wh);
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(wx + ww * 0.5, wy);
    b.lineTo(wx + ww * 0.5, wy + wh);
    b.moveTo(wx, wy + wh * 0.42);
    b.lineTo(wx + ww, wy + wh * 0.42);
    b.stroke();
    b.fillStyle = '#3a261c';
    b.fillRect(wx - W * 0.014, wy + wh, ww + W * 0.028, H * 0.012);
    b.fillStyle = 'rgba(255,220,170,0.08)';
    b.fillRect(wx - W * 0.014, wy + wh, ww + W * 0.028, 1.4);
    // 窗上的霓虹小字
    b.save();
    b.globalCompositeOperation = 'lighter';
    b.fillStyle = 'rgba(255,120,140,0.55)';
    b.font = `${Math.max(9, W * 0.013)}px "Noto Serif SC", serif`;
    b.textAlign = 'center';
    b.fillText('JAZZ', wx + ww * 0.72, wy + wh * 0.20);
    b.fillStyle = 'rgba(255,120,140,0.16)';
    b.fillText('JAZZ', wx + ww * 0.72 + 0.6, wy + wh * 0.20 + 0.6);
    b.restore();

    // 左侧木质隔断与通道
    const gx = W * 0.215;
    b.fillStyle = 'rgba(36,21,18,0.92)';
    b.fillRect(gx, wallY, W * 0.045, horizon - wallY);
    for (let i = 0; i < 9; i++) {
      b.fillStyle = 'rgba(110,72,48,0.22)';
      b.fillRect(gx + W * (0.004 + i * 0.0048), wallY + H * 0.01, W * 0.0022, horizon - wallY - H * 0.01);
    }
    // 隔断后的暗门
    b.fillStyle = 'rgba(12,8,10,0.85)';
    b.fillRect(gx + W * 0.055, horizon - H * 0.185, W * 0.045, H * 0.185);
    b.fillStyle = 'rgba(255,180,110,0.10)';
    b.fillRect(gx + W * 0.058, horizon - H * 0.180, 1.4, H * 0.175);

    /* ---------- 挂酒杯的杯架 ---------- */
    const rackY = horizon * 0.395;
    b.strokeStyle = 'rgba(120,96,76,0.55)';
    b.lineWidth = 1.4;
    b.beginPath(); b.moveTo(W * 0.30, rackY); b.lineTo(W * 0.68, rackY); b.stroke();
    for (let i = 0; i < 9; i++) {
      const gx2 = W * (0.315 + i * 0.042);
      b.strokeStyle = 'rgba(210,220,230,0.22)';
      b.lineWidth = 0.8;
      // 杯身（倒挂的葡萄酒杯）
      b.beginPath();
      b.moveTo(gx2 - W * 0.008, rackY + H * 0.006);
      b.quadraticCurveTo(gx2 - W * 0.011, rackY + H * 0.020, gx2, rackY + H * 0.024);
      b.quadraticCurveTo(gx2 + W * 0.011, rackY + H * 0.020, gx2 + W * 0.008, rackY + H * 0.006);
      b.stroke();
      b.beginPath();
      b.moveTo(gx2, rackY + H * 0.024);
      b.lineTo(gx2, rackY + H * 0.034);
      b.stroke();
      b.beginPath(); b.moveTo(gx2 - W * 0.006, rackY + H * 0.035); b.lineTo(gx2 + W * 0.006, rackY + H * 0.035); b.stroke();
      b.fillStyle = 'rgba(255,240,220,0.10)';
      b.fillRect(gx2 - W * 0.002, rackY + H * 0.008, 1, H * 0.014);
    }
    // 杯架的暖底光
    b.save();
    b.globalCompositeOperation = 'lighter';
    const rackGlow = b.createLinearGradient(0, rackY - H * 0.01, 0, rackY + H * 0.05);
    rackGlow.addColorStop(0, 'rgba(255,190,120,0.10)');
    rackGlow.addColorStop(1, 'rgba(255,190,120,0)');
    b.fillStyle = rackGlow;
    b.fillRect(W * 0.29, rackY - H * 0.01, W * 0.40, H * 0.06);
    b.restore();
  }
  drawBar.ground = (b, p, horizon) => {
    const p2 = PALETTES[state.time] || PALETTES.night;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    // 深色木地板：横向长板 + 透视缝
    const g = b.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, '#2a1718');
    g.addColorStop(0.55, '#1e1014');
    g.addColorStop(1, '#10080c');
    b.fillStyle = g;
    b.fillRect(0, horizon, W, H - horizon);
    for (let i = 1; i < 10; i++) {
      const yy = horizon + Math.pow(i / 10, 1.35) * (H - horizon);
      b.strokeStyle = 'rgba(110,74,54,0.12)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(0, yy); b.lineTo(W, yy); b.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const xx = W * (i / 14);
      b.strokeStyle = 'rgba(0,0,0,0.16)';
      b.beginPath();
      b.moveTo(xx, horizon);
      b.lineTo(xx + rand(-W * 0.06, W * 0.06), H);
      b.stroke();
    }
    // 木纹的暖色反光
    for (let i = 0; i < 40; i++) {
      b.strokeStyle = `rgba(255,190,140,${rand(0.008, 0.025)})`;
      b.beginPath();
      b.moveTo(rand(0, W), horizon + rand(0, H - horizon));
      b.quadraticCurveTo(rand(0, W), horizon + rand(0, H - horizon), rand(0, W), horizon + rand(0, H - horizon));
      b.stroke();
    }

    /* ---------- 吧台 ---------- */
    const barX = W * 0.055, barW = W * 0.545;
    const barTopY = horizon + H * 0.006;
    // 台面
    const topG = b.createLinearGradient(0, barTopY, 0, barTopY + H * 0.045);
    topG.addColorStop(0, '#5a3626');
    topG.addColorStop(0.55, '#40241c');
    topG.addColorStop(1, '#2a1614');
    b.fillStyle = topG;
    b.beginPath();
    b.moveTo(barX, barTopY);
    b.lineTo(barX + barW, barTopY - H * 0.006);
    b.lineTo(barX + barW + W * 0.020, barTopY + H * 0.048);
    b.lineTo(barX - W * 0.010, barTopY + H * 0.054);
    b.closePath(); b.fill();
    // 台面高光与杯痕
    b.strokeStyle = 'rgba(255,214,170,0.22)';
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(barX, barTopY + 1);
    b.lineTo(barX + barW, barTopY - H * 0.005);
    b.stroke();
    for (let i = 0; i < 7; i++) {
      b.fillStyle = `rgba(255,236,210,${rand(0.02, 0.05)})`;
      b.beginPath();
      b.ellipse(barX + barW * rand(0.10, 0.90), barTopY + H * rand(0.010, 0.035), rand(5, 14), rand(1.5, 4), 0, 0, 6.3);
      b.fill();
    }
    // 台面前缘的厚度与反光
    b.strokeStyle = 'rgba(12,6,8,0.75)';
    b.lineWidth = Math.max(3, W * 0.0035);
    b.beginPath();
    b.moveTo(barX - W * 0.010, barTopY + H * 0.054);
    b.lineTo(barX + barW + W * 0.020, barTopY + H * 0.048);
    b.stroke();
    b.strokeStyle = 'rgba(255,220,180,0.16)';
    b.lineWidth = 1.2;
    b.beginPath();
    b.moveTo(barX - W * 0.010, barTopY + H * 0.051);
    b.lineTo(barX + barW + W * 0.020, barTopY + H * 0.045);
    b.stroke();
    // 吊灯在台面的柔光
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (const lxp of [0.20, 0.50, 0.80]) {
      const lx3 = W * lxp;
      const lg3 = b.createRadialGradient(lx3, barTopY + H * 0.016, 0, lx3, barTopY + H * 0.016, W * 0.14);
      lg3.addColorStop(0, 'rgba(255,190,120,0.10)');
      lg3.addColorStop(1, 'rgba(255,190,120,0)');
      b.fillStyle = lg3;
      b.beginPath(); b.ellipse(lx3, barTopY + H * 0.016, W * 0.14, H * 0.030, 0, 0, 6.3); b.fill();
    }
    b.restore();
    // 吧台前脸：木框与嵌板
    const frontY = barTopY + H * 0.052;
    const frontG = b.createLinearGradient(0, frontY, 0, H);
    frontG.addColorStop(0, '#3a221a');
    frontG.addColorStop(0.5, '#2a1614');
    frontG.addColorStop(1, '#160c0e');
    b.fillStyle = frontG;
    b.fillRect(barX - W * 0.008, frontY, barW + W * 0.030, H - frontY);
    for (let i = 0; i < 5; i++) {
      const px0 = barX + W * 0.020 + i * (barW / 5.2);
      b.strokeStyle = 'rgba(255,196,150,0.08)';
      b.lineWidth = 1.2;
      b.strokeRect(px0, frontY + H * 0.018, barW / 6.5, H * 0.20);
      b.strokeStyle = 'rgba(0,0,0,0.25)';
      b.strokeRect(px0 + 2, frontY + H * 0.022, barW / 6.5 - 2, H * 0.19);
    }
    // 黄铜脚踏杆
    b.strokeStyle = 'rgba(196,158,98,0.55)';
    b.lineWidth = 3;
    b.beginPath();
    b.moveTo(barX - W * 0.006, frontY + H * 0.155);
    b.lineTo(barX + barW + W * 0.024, frontY + H * 0.148);
    b.stroke();
    b.strokeStyle = 'rgba(255,236,196,0.30)';
    b.lineWidth = 1;
    b.beginPath();
    b.moveTo(barX - W * 0.006, frontY + H * 0.152);
    b.lineTo(barX + barW + W * 0.024, frontY + H * 0.145);
    b.stroke();
    // 脚踏杆支架
    for (let i = 0; i < 5; i++) {
      const bx0 = barX + W * 0.05 + i * (barW / 5.4);
      b.strokeStyle = 'rgba(150,120,78,0.45)';
      b.lineWidth = 2;
      b.beginPath();
      b.moveTo(bx0, frontY + H * 0.150);
      b.lineTo(bx0, frontY + H * 0.185);
      b.stroke();
    }

    // 吧台面上的物件：酒瓶、冰桶、杯子与蜡烛
    const items = [
      { x: 0.08, kind: 'bottle', s: 1.0 },
      { x: 0.15, kind: 'glass', s: 1.0 },
      { x: 0.20, kind: 'glass', s: 0.9 },
      { x: 0.31, kind: 'bucket', s: 1.0 },
      { x: 0.42, kind: 'glass', s: 1.1 },
      { x: 0.47, kind: 'bottle', s: 0.8 },
      { x: 0.56, kind: 'candle', s: 1.0 },
    ];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const ix = barX + barW * it.x;
      const iy = barTopY + H * 0.022;
      const sc = it.s;
      if (it.kind === 'bottle') {
        b.fillStyle = 'rgba(70,96,72,0.9)';
        b.beginPath();
        b.moveTo(ix - W * 0.008 * sc, iy);
        b.lineTo(ix - W * 0.008 * sc, iy - H * 0.050 * sc);
        b.quadraticCurveTo(ix - W * 0.006 * sc, iy - H * 0.062 * sc, ix - W * 0.003 * sc, iy - H * 0.066 * sc);
        b.lineTo(ix - W * 0.003 * sc, iy - H * 0.082 * sc);
        b.lineTo(ix + W * 0.003 * sc, iy - H * 0.082 * sc);
        b.lineTo(ix + W * 0.003 * sc, iy - H * 0.066 * sc);
        b.quadraticCurveTo(ix + W * 0.006 * sc, iy - H * 0.062 * sc, ix + W * 0.008 * sc, iy - H * 0.050 * sc);
        b.lineTo(ix + W * 0.008 * sc, iy);
        b.closePath(); b.fill();
        b.fillStyle = 'rgba(232,222,196,0.60)';
        b.fillRect(ix - W * 0.006 * sc, iy - H * 0.042 * sc, W * 0.012 * sc, H * 0.020 * sc);
        b.fillStyle = 'rgba(255,236,200,0.16)';
        b.fillRect(ix - W * 0.007 * sc, iy - H * 0.050 * sc, 1.2, H * 0.046 * sc);
      } else if (it.kind === 'glass') {
        b.strokeStyle = 'rgba(220,230,240,0.35)';
        b.lineWidth = 1;
        b.beginPath();
        b.moveTo(ix - W * 0.007 * sc, iy - H * 0.030 * sc);
        b.lineTo(ix - W * 0.005 * sc, iy - H * 0.006 * sc);
        b.lineTo(ix + W * 0.005 * sc, iy - H * 0.006 * sc);
        b.lineTo(ix + W * 0.007 * sc, iy - H * 0.030 * sc);
        b.closePath(); b.stroke();
        b.fillStyle = 'rgba(255,196,120,0.22)';
        b.beginPath();
        b.moveTo(ix - W * 0.006 * sc, iy - H * 0.018 * sc);
        b.lineTo(ix + W * 0.006 * sc, iy - H * 0.018 * sc);
        b.lineTo(ix + W * 0.005 * sc, iy - H * 0.006 * sc);
        b.lineTo(ix - W * 0.005 * sc, iy - H * 0.006 * sc);
        b.closePath(); b.fill();
        b.strokeStyle = 'rgba(220,230,240,0.30)';
        b.beginPath();
        b.moveTo(ix, iy - H * 0.006 * sc);
        b.lineTo(ix, iy);
        b.moveTo(ix - W * 0.005 * sc, iy);
        b.lineTo(ix + W * 0.005 * sc, iy);
        b.stroke();
      } else if (it.kind === 'bucket') {
        b.fillStyle = 'rgba(150,152,160,0.55)';
        b.beginPath();
        b.moveTo(ix - W * 0.013 * sc, iy - H * 0.038 * sc);
        b.lineTo(ix + W * 0.013 * sc, iy - H * 0.038 * sc);
        b.lineTo(ix + W * 0.010 * sc, iy);
        b.lineTo(ix - W * 0.010 * sc, iy);
        b.closePath(); b.fill();
        b.strokeStyle = 'rgba(230,236,244,0.28)';
        b.lineWidth = 1;
        b.beginPath();
        b.moveTo(ix - W * 0.012 * sc, iy - H * 0.030 * sc);
        b.lineTo(ix + W * 0.012 * sc, iy - H * 0.030 * sc);
        b.stroke();
        // 插着的酒瓶
        b.fillStyle = 'rgba(56,80,58,0.9)';
        b.fillRect(ix - W * 0.004 * sc, iy - H * 0.090 * sc, W * 0.008 * sc, H * 0.054 * sc);
        b.fillStyle = 'rgba(232,222,196,0.55)';
        b.fillRect(ix - W * 0.003 * sc, iy - H * 0.074 * sc, W * 0.006 * sc, H * 0.014 * sc);
      } else {
        // 小蜡烛
        b.fillStyle = 'rgba(230,222,206,0.7)';
        b.fillRect(ix - W * 0.003 * sc, iy - H * 0.022 * sc, W * 0.006 * sc, H * 0.022 * sc);
        b.fillStyle = 'rgba(255,206,130,0.9)';
        b.beginPath();
        b.ellipse(ix, iy - H * 0.026 * sc, W * 0.0022 * sc, H * 0.006 * sc, 0, 0, 6.3);
        b.fill();
        b.save();
        b.globalCompositeOperation = 'lighter';
        const cg = b.createRadialGradient(ix, iy - H * 0.030 * sc, 0, ix, iy - H * 0.030 * sc, W * 0.045);
        cg.addColorStop(0, 'rgba(255,186,106,0.22)');
        cg.addColorStop(1, 'rgba(255,186,106,0)');
        b.fillStyle = cg;
        b.beginPath(); b.arc(ix, iy - H * 0.030 * sc, W * 0.045, 0, 6.3); b.fill();
        b.restore();
      }
    }

    // 吧台前的高脚凳：皮垫、金属柱、脚踏环与四爪底座
    const stoolXs = [0.12, 0.28, 0.44];
    for (let i = 0; i < stoolXs.length; i++) {
      const sx = barX + barW * stoolXs[i];
      const sy = frontY + H * 0.095;
      // 地面投影
      b.fillStyle = 'rgba(0,0,0,0.34)';
      b.beginPath(); b.ellipse(sx + W * 0.006, sy + H * 0.060, W * 0.036, H * 0.010, 0, 0, 6.3); b.fill();
      // 四爪底座
      b.strokeStyle = 'rgba(126,118,108,0.85)';
      b.lineWidth = Math.max(2.4, W * 0.0028);
      b.lineCap = 'round';
      b.beginPath();
      b.moveTo(sx, sy + H * 0.040);
      b.lineTo(sx - W * 0.024, sy + H * 0.062);
      b.moveTo(sx, sy + H * 0.040);
      b.lineTo(sx + W * 0.024, sy + H * 0.062);
      b.moveTo(sx, sy + H * 0.040);
      b.lineTo(sx - W * 0.008, sy + H * 0.064);
      b.moveTo(sx, sy + H * 0.040);
      b.lineTo(sx + W * 0.010, sy + H * 0.064);
      b.stroke();
      b.lineCap = 'butt';
      // 金属柱：有正面受光与侧面暗部
      const colG = b.createLinearGradient(sx - W * 0.005, 0, sx + W * 0.005, 0);
      colG.addColorStop(0, 'rgba(58,54,52,0.95)');
      colG.addColorStop(0.35, 'rgba(196,188,176,0.95)');
      colG.addColorStop(0.55, 'rgba(118,112,106,0.95)');
      colG.addColorStop(1, 'rgba(44,40,40,0.95)');
      b.fillStyle = colG;
      b.beginPath();
      b.moveTo(sx - W * 0.0052, sy - H * 0.036);
      b.lineTo(sx + W * 0.0052, sy - H * 0.036);
      b.lineTo(sx + W * 0.0040, sy + H * 0.044);
      b.lineTo(sx - W * 0.0040, sy + H * 0.044);
      b.closePath(); b.fill();
      // 脚踏环
      b.strokeStyle = 'rgba(60,54,50,0.9)';
      b.lineWidth = 3.4;
      b.beginPath(); b.ellipse(sx, sy + H * 0.012, W * 0.026, H * 0.008, 0, 0, 6.3); b.stroke();
      b.strokeStyle = 'rgba(196,168,118,0.75)';
      b.lineWidth = 1.6;
      b.beginPath(); b.ellipse(sx, sy + H * 0.010, W * 0.026, H * 0.008, 0, Math.PI * 1.05, Math.PI * 1.95); b.stroke();
      // 座垫：侧缘 + 顶面 + 高光
      b.fillStyle = 'rgba(30,12,16,0.96)';
      b.beginPath();
      b.ellipse(sx, sy - H * 0.046, W * 0.032, H * 0.012, 0, 0, 6.3);
      b.fill();
      b.fillRect(sx - W * 0.032, sy - H * 0.050, W * 0.064, H * 0.012);
      const seatG = b.createRadialGradient(sx - W * 0.008, sy - H * 0.058, 0, sx, sy - H * 0.052, W * 0.034);
      seatG.addColorStop(0, 'rgba(146,64,60,0.95)');
      seatG.addColorStop(0.65, 'rgba(96,36,40,0.95)');
      seatG.addColorStop(1, 'rgba(52,18,24,0.95)');
      b.fillStyle = seatG;
      b.beginPath();
      b.ellipse(sx, sy - H * 0.052, W * 0.032, H * 0.012, 0, 0, 6.3);
      b.fill();
      b.strokeStyle = 'rgba(255,186,160,0.18)';
      b.lineWidth = 1.2;
      b.beginPath(); b.ellipse(sx, sy - H * 0.052, W * 0.030, H * 0.010, 0, Math.PI * 1.08, Math.PI * 1.92); b.stroke();
    }

    /* ---------- 右侧卡座 ---------- */
    const bx = W * 0.64, bw = W * 0.335, by = horizon + H * 0.030;
    // 高背卡座：深酒红皮革，拉扣与缝线
    const backG = b.createLinearGradient(0, by, 0, by + H * 0.235);
    backG.addColorStop(0, '#4a1c24');
    backG.addColorStop(0.55, '#34121a');
    backG.addColorStop(1, '#1e0a10');
    b.fillStyle = backG;
    b.beginPath();
    b.moveTo(bx, by + H * 0.235);
    b.lineTo(bx, by + H * 0.055);
    b.quadraticCurveTo(bx + bw * 0.5, by - H * 0.020, bx + bw, by + H * 0.055);
    b.lineTo(bx + bw, by + H * 0.235);
    b.closePath(); b.fill();
    // 拉扣
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const cx0 = bx + bw * (0.12 + c * 0.19);
        const cy0 = by + H * (0.065 + r * 0.050);
        b.strokeStyle = 'rgba(10,4,8,0.35)';
        b.lineWidth = 0.8;
        b.beginPath();
        b.moveTo(cx0 - W * 0.008, cy0);
        b.quadraticCurveTo(cx0, cy0 + H * 0.006, cx0 + W * 0.008, cy0);
        b.stroke();
        b.fillStyle = 'rgba(255,180,150,0.10)';
        b.beginPath(); b.arc(cx0, cy0, 1.1, 0, 6.3); b.fill();
      }
    }
    // 卡座顶沿线
    b.strokeStyle = 'rgba(255,196,160,0.10)';
    b.lineWidth = 1.4;
    b.beginPath();
    b.moveTo(bx, by + H * 0.055);
    b.quadraticCurveTo(bx + bw * 0.5, by - H * 0.020, bx + bw, by + H * 0.055);
    b.stroke();
    // 桌与桌上烛台
    const tbx = bx + bw * 0.10, tby = by + H * 0.190;
    b.fillStyle = 'rgba(0,0,0,0.30)';
    b.beginPath(); b.ellipse(tbx + bw * 0.40, tby + H * 0.030, bw * 0.40, H * 0.018, 0, 0, 6.3); b.fill();
    b.fillStyle = '#3a241c';
    b.beginPath();
    b.ellipse(tbx + bw * 0.40, tby, bw * 0.42, H * 0.016, 0, 0, 6.3);
    b.fill();
    b.fillStyle = 'rgba(255,214,166,0.14)';
    b.beginPath();
    b.ellipse(tbx + bw * 0.38, tby - H * 0.004, bw * 0.36, H * 0.010, 0, 0, 6.3);
    b.fill();
    b.fillStyle = '#2a1814';
    b.fillRect(tbx + bw * 0.38, tby, W * 0.012, H * 0.055);
    // 酒杯与烛
    for (let i = 0; i < 3; i++) {
      const gx0 = tbx + bw * (0.24 + i * 0.16);
      b.strokeStyle = 'rgba(224,232,240,0.30)';
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(gx0 - W * 0.005, tby - H * 0.022);
      b.lineTo(gx0 - W * 0.004, tby - H * 0.006);
      b.lineTo(gx0 + W * 0.004, tby - H * 0.006);
      b.lineTo(gx0 + W * 0.005, tby - H * 0.022);
      b.closePath(); b.stroke();
      b.fillStyle = 'rgba(255,190,120,0.20)';
      b.fillRect(gx0 - W * 0.004, tby - H * 0.012, W * 0.008, H * 0.006);
    }
    b.fillStyle = 'rgba(255,206,130,0.85)';
    b.beginPath();
    b.ellipse(tbx + bw * 0.50, tby - H * 0.030, W * 0.0024, H * 0.007, 0, 0, 6.3);
    b.fill();
    b.save();
    b.globalCompositeOperation = 'lighter';
    const candle = b.createRadialGradient(tbx + bw * 0.50, tby - H * 0.034, 0, tbx + bw * 0.50, tby - H * 0.034, W * 0.06);
    candle.addColorStop(0, 'rgba(255,186,106,0.24)');
    candle.addColorStop(1, 'rgba(255,186,106,0)');
    b.fillStyle = candle;
    b.beginPath(); b.arc(tbx + bw * 0.50, tby - H * 0.034, W * 0.06, 0, 6.3); b.fill();
    b.restore();

    /* ---------- 地面暖光与烟 ---------- */
    b.save();
    b.globalCompositeOperation = 'lighter';
    const pool = b.createLinearGradient(0, horizon, 0, H);
    pool.addColorStop(0, 'rgba(255,180,110,0.10)');
    pool.addColorStop(0.6, 'rgba(255,170,96,0.03)');
    pool.addColorStop(1, 'rgba(255,170,96,0)');
    b.fillStyle = pool;
    b.fillRect(W * 0.02, horizon, W * 0.92, H - horizon);
    // 吊灯在地面的三团光
    for (const px0 of [0.20, 0.50, 0.80]) {
      const lg = b.createRadialGradient(W * px0, horizon + H * 0.10, 0, W * px0, horizon + H * 0.10, W * 0.10);
      lg.addColorStop(0, 'rgba(255,186,106,0.12)');
      lg.addColorStop(1, 'rgba(255,186,106,0)');
      b.fillStyle = lg;
      b.beginPath(); b.ellipse(W * px0, horizon + H * 0.10, W * 0.10, H * 0.10, 0, 0, 6.3); b.fill();
    }
    // 空气中漂浮的烟与尘
    for (let i = 0; i < 26; i++) {
      b.fillStyle = `rgba(255,214,170,${rand(0.008, 0.025)})`;
      b.beginPath();
      b.ellipse(rand(0, W), rand(horizon * 0.4, H * 0.9), rand(20, 80), rand(4, 16), rand(-0.2, 0.2), 0, 6.3);
      b.fill();
    }
    b.restore();
  };

  /* ---------- 场景：陆家嘴（远景） ---------- */
  function drawCity(b, p, horizon) {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const dusk = !night && !day;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const img = night ? cityNight : cityDay;
    const ready = night ? cityNightReady : cityDayReady;
    if (ready) {
      drawCover(b, img, 0, 0, W, H, 0.5, 0.5, 1);
    } else {
      const g = b.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, night ? '#0a1030' : '#6ea6d6');
      g.addColorStop(0.6, night ? '#1a2450' : '#a9cbe2');
      g.addColorStop(1, night ? '#0c1024' : '#f2dcb8');
      b.fillStyle = g;
      b.fillRect(0, 0, W, H);
    }
    // 压住原图的高饱和：时刻色罩 + 轻微降对比
    b.save();
    b.globalCompositeOperation = 'multiply';
    b.fillStyle = day
      ? 'rgba(150,162,166,0.55)'
      : night
        ? 'rgba(18,22,54,0.42)'
        : 'rgba(214,158,120,0.38)';
    b.fillRect(0, 0, W, horizon + H * 0.02);
    b.restore();
    // 地平线附近的空气雾：把楼群底部揉进天光
    const mist = b.createLinearGradient(0, horizon - H * 0.20, 0, horizon + H * 0.02);
    mist.addColorStop(0, 'rgba(190,204,218,0)');
    mist.addColorStop(0.65, day ? 'rgba(196,208,216,0.12)' : night ? 'rgba(90,110,160,0.10)' : 'rgba(238,196,158,0.14)');
    mist.addColorStop(1, day ? 'rgba(200,212,218,0.26)' : night ? 'rgba(100,120,170,0.22)' : 'rgba(244,206,166,0.28)');
    b.fillStyle = mist;
    b.fillRect(0, horizon - H * 0.20, W, H * 0.22);
    // 黄昏／白天的天际线暖光
    if (dusk || day) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      const warm = b.createLinearGradient(0, H * 0.20, 0, H * 0.62);
      warm.addColorStop(0, 'rgba(255,190,120,0)');
      warm.addColorStop(0.7, day ? 'rgba(255,214,170,0.06)' : 'rgba(255,170,110,0.10)');
      warm.addColorStop(1, night ? 'rgba(255,150,90,0)' : 'rgba(255,150,90,0.16)');
      b.fillStyle = warm;
      b.fillRect(0, H * 0.20, W, H * 0.42);
      b.restore();
    }
    // 夜空里的一轮月（只在夜晚，避开主要楼群）
    if (night) {
      const mx = W * 0.12, my = H * 0.11, mr = Math.min(W, H) * 0.026;
      const halo = b.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
      halo.addColorStop(0, 'rgba(228,234,255,0.20)');
      halo.addColorStop(1, 'rgba(210,222,255,0)');
      b.fillStyle = halo;
      b.beginPath(); b.arc(mx, my, mr * 5, 0, 6.3); b.fill();
      b.fillStyle = '#f2eee2';
      b.beginPath(); b.arc(mx, my, mr, 0, 6.3); b.fill();
      b.fillStyle = 'rgba(150,154,150,0.16)';
      b.beginPath(); b.arc(mx - mr * 0.2, my + mr * 0.15, mr * 0.35, 0, 6.3); b.fill();
      // 薄云掠过月面
      b.fillStyle = 'rgba(60,70,110,0.18)';
      b.beginPath();
      b.ellipse(mx + mr * 0.8, my - mr * 0.1, mr * 1.8, mr * 0.22, -0.05, 0, 6.3);
      b.fill();
    }
    // 飞鸟：黄昏／白天远处三点
    if (!night) {
      b.strokeStyle = 'rgba(60,64,74,0.35)';
      b.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const bx0 = W * (0.62 + i * 0.035) + rand(-4, 4);
        const by0 = H * (0.18 + i * 0.012);
        const s = 3.2 - i * 0.5;
        b.beginPath();
        b.moveTo(bx0 - s, by0);
        b.quadraticCurveTo(bx0 - s * 0.4, by0 - s * 0.7, bx0, by0);
        b.quadraticCurveTo(bx0 + s * 0.4, by0 - s * 0.7, bx0 + s, by0);
        b.stroke();
      }
    }
    // 画面四周的暗角，视线收束到天际线
    const vig = b.createRadialGradient(W * 0.5, H * 0.40, Math.min(W, H) * 0.30, W * 0.5, H * 0.42, Math.max(W, H) * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, night ? 'rgba(2,4,12,0.55)' : 'rgba(20,16,18,0.30)');
    b.fillStyle = vig;
    b.fillRect(0, 0, W, H);
  }
  drawCity.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const dusk = !night && !day;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };

    /* ---------- 江面 ---------- */
    const waterBot = H * 0.800;
    const waterG = b.createLinearGradient(0, horizon, 0, waterBot);
    waterG.addColorStop(0, night ? '#121a30' : day ? '#8aa6b8' : '#6a5c70');
    waterG.addColorStop(0.45, night ? '#0c1224' : day ? '#6e8ea4' : '#54465c');
    waterG.addColorStop(1, night ? '#070b18' : day ? '#557488' : '#3c3044');
    b.fillStyle = waterG;
    b.fillRect(0, horizon, W, waterBot - horizon);
    // 对岸楼群的倒影：一列列被水揉碎的暖光／冷光
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const rx = W * perm(i, 3);
      const tone = perm(i, 5);
      const col = tone > 0.4
        ? (night ? '255,196,120' : day ? '250,244,228' : '255,198,140')
        : (night ? '150,180,240' : day ? '220,236,246' : '210,170,150');
      const len = (waterBot - horizon) * (0.25 + perm(i, 7) * 0.65);
      const rw = 3 + perm(i, 9) * 9;
      const rg = b.createLinearGradient(0, horizon, 0, horizon + len);
      rg.addColorStop(0, `rgba(${col},${night ? 0.16 : 0.10})`);
      rg.addColorStop(0.4, `rgba(${col},${night ? 0.07 : 0.04})`);
      rg.addColorStop(1, `rgba(${col},0)`);
      b.fillStyle = rg;
      b.fillRect(rx, horizon, rw, len);
      // 水纹的断口
      for (let s = 0; s < 5; s++) {
        b.fillStyle = `rgba(${col},${0.03 + perm(i * 7 + s, 11) * 0.05})`;
        b.fillRect(rx - 2 + perm(i * 7 + s, 13) * 6, horizon + len * (0.15 + s * 0.16), rw * 0.7, 1.2);
      }
    }
    b.restore();
    // 江面的横向波纹：越近越疏
    b.strokeStyle = night ? 'rgba(160,180,230,0.07)' : 'rgba(240,244,248,0.10)';
    for (let i = 0; i < 26; i++) {
      const t = Math.pow(i / 26, 1.4);
      const yy = horizon + t * (waterBot - horizon);
      b.lineWidth = 0.8 + t * 1.2;
      b.beginPath();
      b.moveTo(0, yy);
      for (let x = 0; x <= W; x += W / 12) {
        b.quadraticCurveTo(x + W / 24, yy + Math.sin(i * 0.8 + x * 0.01) * (1 + t * 2), x + W / 12, yy);
      }
      b.stroke();
    }
    // 贴着对岸的一条亮水线
    b.save();
    b.globalCompositeOperation = 'lighter';
    const shore = b.createLinearGradient(0, horizon, 0, horizon + H * 0.03);
    shore.addColorStop(0, night ? 'rgba(220,210,180,0.12)' : 'rgba(255,244,220,0.16)');
    shore.addColorStop(1, 'rgba(255,244,220,0)');
    b.fillStyle = shore;
    b.fillRect(0, horizon, W, H * 0.03);
    b.restore();

    /* ---------- 滨江步道：栏杆、灯柱与石铺地 ---------- */
    const deckY = waterBot;
    // 石砌岸线
    const curbG = b.createLinearGradient(0, deckY - H * 0.010, 0, deckY + H * 0.012);
    curbG.addColorStop(0, night ? '#3a3a44' : day ? '#c6c2b4' : '#8c7a6e');
    curbG.addColorStop(1, night ? '#23232c' : day ? '#9a968a' : '#6c5c54');
    b.fillStyle = curbG;
    b.fillRect(0, deckY - H * 0.010, W, H * 0.022);
    b.fillStyle = 'rgba(255,250,238,0.10)';
    b.fillRect(0, deckY - H * 0.010, W, 1.4);
    // 金属栏杆：立柱 + 三道横杆
    const railTop = deckY - H * 0.082;
    b.strokeStyle = night ? 'rgba(30,28,36,0.95)' : 'rgba(46,42,40,0.85)';
    b.lineWidth = Math.max(3, W * 0.0026);
    b.beginPath();
    b.moveTo(0, railTop);
    b.lineTo(W, railTop);
    b.moveTo(0, railTop + H * 0.028);
    b.lineTo(W, railTop + H * 0.028);
    b.moveTo(0, railTop + H * 0.056);
    b.lineTo(W, railTop + H * 0.056);
    b.stroke();
    // 栏杆受光的一线
    b.strokeStyle = night ? 'rgba(170,180,210,0.16)' : 'rgba(255,246,226,0.28)';
    b.lineWidth = 1.2;
    b.beginPath();
    b.moveTo(0, railTop + 1);
    b.lineTo(W, railTop + 1);
    b.stroke();
    // 立柱：等距，近处略粗
    for (let i = 0; i < 10; i++) {
      const px0 = W * (0.03 + i * 0.106);
      b.strokeStyle = night ? 'rgba(32,30,38,0.95)' : 'rgba(48,44,42,0.85)';
      b.lineWidth = Math.max(3, W * 0.003);
      b.beginPath();
      b.moveTo(px0, railTop - H * 0.008);
      b.lineTo(px0, deckY - H * 0.006);
      b.stroke();
      b.fillStyle = night ? 'rgba(70,66,80,0.6)' : 'rgba(120,114,104,0.6)';
      b.beginPath();
      b.arc(px0, railTop - H * 0.008, W * 0.0035, 0, 6.3);
      b.fill();
    }
    // 栏杆阴影落在步道
    b.save();
    b.globalCompositeOperation = 'multiply';
    b.fillStyle = 'rgba(12,10,16,0.30)';
    b.beginPath();
    b.moveTo(0, deckY);
    b.lineTo(W, deckY);
    b.lineTo(W, deckY + H * 0.020);
    b.lineTo(0, deckY + H * 0.026);
    b.closePath(); b.fill();
    b.restore();

    // 步道石铺地
    const walkG = b.createLinearGradient(0, deckY, 0, H);
    walkG.addColorStop(0, night ? '#33313c' : day ? '#b8b2a2' : '#7a6a60');
    walkG.addColorStop(0.5, night ? '#28262f' : day ? '#a29c8c' : '#655850');
    walkG.addColorStop(1, night ? '#191821' : day ? '#7c7668' : '#463c3a');
    b.fillStyle = walkG;
    b.fillRect(0, deckY + H * 0.012, W, H - deckY - H * 0.012);
    // 铺装分格：大块花岗岩，透视缝
    for (let r = 0; r < 5; r++) {
      const t0 = r / 5, t1 = (r + 1) / 5;
      const y0 = deckY + H * 0.012 + Math.pow(t0, 1.2) * (H - deckY - H * 0.012);
      const y1 = deckY + H * 0.012 + Math.pow(t1, 1.2) * (H - deckY - H * 0.012);
      const cols = 6 + r * 2;
      for (let c = 0; c < cols; c++) {
        const off = (r % 2) * 0.5;
        const x0 = W * ((c - 0.5 + off) / cols);
        const x1 = W * ((c + 0.5 + off) / cols);
        const v = perm(r * 23 + c, 61);
        if (v > 0.7) {
          b.fillStyle = `rgba(255,248,232,${0.012 + (v - 0.7) * 0.06})`;
          b.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
        } else if (v < 0.25) {
          b.fillStyle = `rgba(0,0,0,${0.02 + (0.25 - v) * 0.10})`;
          b.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
        }
      }
      b.strokeStyle = night ? 'rgba(150,150,170,0.07)' : 'rgba(40,36,32,0.14)';
      b.lineWidth = 1;
      b.beginPath(); b.moveTo(0, y0); b.lineTo(W, y0); b.stroke();
    }
    // 斜向的石缝（步行方向的纵缝）
    for (let i = 0; i < 12; i++) {
      const xx = W * (i / 12);
      b.strokeStyle = night ? 'rgba(150,150,170,0.06)' : 'rgba(40,36,32,0.12)';
      b.beginPath();
      b.moveTo(W * 0.5 + (xx - W * 0.5) * 0.55, deckY + H * 0.012);
      b.lineTo(xx, H);
      b.stroke();
    }

    // 灯柱与灯光：两盏，罩住画面两侧
    for (const px0 of [0.075, 0.905]) {
      const lx = W * px0;
      const lampTop = deckY - H * 0.180;
      b.strokeStyle = night ? 'rgba(26,24,32,0.98)' : 'rgba(40,38,36,0.9)';
      b.lineWidth = Math.max(3, W * 0.0034);
      b.beginPath();
      b.moveTo(lx, deckY);
      b.lineTo(lx, lampTop);
      b.stroke();
      // 灯头
      b.fillStyle = night ? 'rgba(30,26,34,0.98)' : 'rgba(52,48,44,0.9)';
      b.beginPath();
      b.moveTo(lx - W * 0.018, lampTop);
      b.lineTo(lx + W * 0.018, lampTop);
      b.lineTo(lx + W * 0.010, lampTop + H * 0.020);
      b.lineTo(lx - W * 0.010, lampTop + H * 0.020);
      b.closePath(); b.fill();
      b.fillStyle = 'rgba(255,214,150,0.92)';
      b.fillRect(lx - W * 0.009, lampTop + H * 0.017, W * 0.018, H * 0.006);
      b.save();
      b.globalCompositeOperation = 'lighter';
      const lg = b.createRadialGradient(lx, lampTop + H * 0.020, 0, lx, lampTop + H * 0.020, W * 0.16);
      lg.addColorStop(0, night ? 'rgba(255,196,120,0.28)' : 'rgba(255,214,160,0.34)');
      lg.addColorStop(0.35, 'rgba(255,190,112,0.08)');
      lg.addColorStop(1, 'rgba(255,190,112,0)');
      b.fillStyle = lg;
      b.beginPath(); b.arc(lx, lampTop + H * 0.020, W * 0.16, 0, 6.3); b.fill();
      // 灯下的光锥
      const cone = b.createLinearGradient(0, lampTop, 0, deckY + H * 0.02);
      cone.addColorStop(0, 'rgba(255,200,130,0.14)');
      cone.addColorStop(1, 'rgba(255,200,130,0)');
      b.fillStyle = cone;
      b.beginPath();
      b.moveTo(lx - W * 0.010, lampTop);
      b.lineTo(lx + W * 0.010, lampTop);
      b.lineTo(lx + W * 0.070, deckY + H * 0.02);
      b.lineTo(lx - W * 0.070, deckY + H * 0.02);
      b.closePath(); b.fill();
      b.restore();
    }

    // 月亮在水面的碎光
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      const gx = W * 0.118 + Math.sin(i * 1.7) * W * (0.004 + t * 0.020);
      const gy = horizon + H * 0.004 + t * H * 0.055;
      b.fillStyle = `rgba(228,232,250,${0.16 * (1 - t)})`;
      b.fillRect(gx - W * 0.004 * (1 - t * 0.5), gy, W * 0.008 * (1 - t * 0.5), 1.2);
    }
    b.restore();
    // 江面上的夜航船：舱窗暖光与尾迹
    const boat = (bx0, by0, sc, dir) => {
      b.save();
      b.strokeStyle = night ? 'rgba(12,14,24,0.95)' : 'rgba(40,46,58,0.85)';
      b.lineWidth = Math.max(2, W * 0.0018 * sc);
      b.fillStyle = night ? 'rgba(16,18,30,0.96)' : 'rgba(52,58,70,0.9)';
      b.beginPath();
      b.moveTo(bx0 - W * 0.028 * sc, by0);
      b.lineTo(bx0 + W * 0.030 * sc, by0);
      b.lineTo(bx0 + W * 0.022 * sc, by0 + H * 0.010 * sc);
      b.lineTo(bx0 - W * 0.022 * sc, by0 + H * 0.010 * sc);
      b.closePath(); b.fill();
      // 舱室
      b.fillStyle = night ? 'rgba(30,30,46,0.96)' : 'rgba(70,76,88,0.9)';
      b.fillRect(bx0 - W * 0.016 * sc, by0 - H * 0.012 * sc, W * 0.032 * sc, H * 0.012 * sc);
      // 舱窗
      for (let i = 0; i < 4; i++) {
        b.fillStyle = night ? 'rgba(255,206,140,0.85)' : 'rgba(255,244,214,0.75)';
        b.fillRect(bx0 - W * 0.012 * sc + i * W * 0.0075 * sc, by0 - H * 0.0095 * sc, W * 0.004 * sc, H * 0.004 * sc);
      }
      // 桅灯
      b.fillStyle = 'rgba(255,244,214,0.95)';
      b.beginPath(); b.arc(bx0, by0 - H * 0.019 * sc, Math.max(1, W * 0.0016 * sc), 0, 6.3); b.fill();
      b.save();
      b.globalCompositeOperation = 'lighter';
      const bg = b.createRadialGradient(bx0, by0 - H * 0.005 * sc, 0, bx0, by0 - H * 0.005 * sc, W * 0.050 * sc);
      bg.addColorStop(0, 'rgba(255,196,120,0.18)');
      bg.addColorStop(1, 'rgba(255,196,120,0)');
      b.fillStyle = bg;
      b.beginPath(); b.arc(bx0, by0 - H * 0.005 * sc, W * 0.050 * sc, 0, 6.3); b.fill();
      b.restore();
      // 尾迹
      b.strokeStyle = night ? 'rgba(170,190,230,0.10)' : 'rgba(240,246,250,0.22)';
      b.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        b.beginPath();
        b.moveTo(bx0 + dir * W * (0.026 + i * 0.016) * sc, by0 + H * 0.004 * sc);
        b.quadraticCurveTo(bx0 + dir * W * (0.034 + i * 0.018) * sc, by0 + H * (0.010 + i * 0.003) * sc,
          bx0 + dir * W * (0.050 + i * 0.020) * sc, by0 + H * (0.012 + i * 0.004) * sc);
        b.stroke();
      }
      b.restore();
    };
    boat(W * 0.108, horizon + H * 0.050, 0.9, 1);
    boat(W * 0.905, horizon + H * 0.070, 1.15, -1);

    // 步道上的长椅
    const bench = (bx0, by0, sc) => {
      const bw0 = W * 0.155 * sc, bh0 = H * 0.012 * sc;
      // 椅背
      b.fillStyle = night ? 'rgba(40,30,28,0.95)' : 'rgba(110,82,58,0.92)';
      b.fillRect(bx0, by0 - H * 0.062 * sc, bw0, H * 0.010 * sc);
      for (let i = 0; i < 4; i++) {
        b.fillRect(bx0 + bw0 * (0.06 + i * 0.24), by0 - H * 0.062 * sc, W * 0.010 * sc, H * 0.062 * sc);
      }
      // 座板
      b.fillRect(bx0 - W * 0.006 * sc, by0, bw0 + W * 0.012 * sc, bh0);
      b.fillStyle = 'rgba(255,236,206,0.10)';
      b.fillRect(bx0 - W * 0.006 * sc, by0, bw0 + W * 0.012 * sc, 1.2);
      // 铸铁椅腿
      b.strokeStyle = night ? 'rgba(26,22,24,0.95)' : 'rgba(60,50,44,0.85)';
      b.lineWidth = Math.max(2, W * 0.0024);
      b.beginPath();
      b.moveTo(bx0 + bw0 * 0.10, by0 + bh0);
      b.lineTo(bx0 + bw0 * 0.07, by0 + H * 0.055 * sc);
      b.moveTo(bx0 + bw0 * 0.90, by0 + bh0);
      b.lineTo(bx0 + bw0 * 0.93, by0 + H * 0.055 * sc);
      b.stroke();
      // 椅下阴影
      b.fillStyle = 'rgba(0,0,0,0.22)';
      b.beginPath();
      b.ellipse(bx0 + bw0 * 0.5, by0 + H * 0.055 * sc, bw0 * 0.55, H * 0.010 * sc, 0, 0, 6.3);
      b.fill();
    };
    bench(W * 0.015, H * 0.842, 0.86);
    bench(W * 0.855, H * 0.860, 1.05);

    // 地面灯池与湿地反光
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (const px0 of [0.075, 0.905]) {
      const lx = W * px0;
      const poolG = b.createRadialGradient(lx, H * 0.935, 0, lx, H * 0.935, W * 0.175);
      poolG.addColorStop(0, night ? 'rgba(255,196,120,0.26)' : 'rgba(255,214,160,0.20)');
      poolG.addColorStop(0.45, 'rgba(255,190,112,0.08)');
      poolG.addColorStop(1, 'rgba(255,190,112,0)');
      b.fillStyle = poolG;
      b.beginPath(); b.ellipse(lx, H * 0.935, W * 0.175, H * 0.075, 0, 0, 6.3); b.fill();
      // 湿地上的竖向灯光倒影
      for (let i = 0; i < 6; i++) {
        b.fillStyle = `rgba(255,206,140,${0.05 + perm(i + (px0 > 0.5 ? 7 : 0), 71) * 0.10})`;
        b.fillRect(lx - W * 0.012 + i * W * 0.005, H * 0.865 + perm(i, 73) * H * 0.020, W * 0.0022, H * (0.030 + perm(i, 75) * 0.040));
      }
    }
    b.restore();

    // 花箱与灌木：把人物两侧撑住
    for (const px0 of [0.020, 0.790]) {
      const fx = W * px0, fy = H * 0.955;
      b.fillStyle = night ? 'rgba(40,34,36,0.95)' : 'rgba(120,110,96,0.95)';
      b.fillRect(fx, fy, W * 0.190, H * 0.050);
      b.fillStyle = 'rgba(255,248,232,0.08)';
      b.fillRect(fx, fy, W * 0.190, 1.6);
      // 灌木：多层小团块，带受光叶缘
      const leafCol = night ? '12,22,16' : '38,58,38';
      for (let i = 0; i < 34; i++) {
        const lx = fx + W * (0.014 + perm(i, 91) * 0.162);
        const ly = fy - H * (0.006 + perm(i, 93) * 0.036);
        const lr = W * (0.012 + perm(i, 95) * 0.020);
        b.fillStyle = `rgba(${leafCol},${0.55 + perm(i, 97) * 0.35})`;
        b.beginPath();
        b.ellipse(lx, ly, lr, lr * 0.62, perm(i, 99) * 0.8 - 0.4, 0, 6.3);
        b.fill();
      }
      for (let i = 0; i < 16; i++) {
        const lx = fx + W * (0.020 + perm(i, 101) * 0.150);
        const ly = fy - H * (0.018 + perm(i, 103) * 0.028);
        b.strokeStyle = `rgba(${night ? '96,132,104' : '150,176,120'},${0.10 + perm(i, 105) * 0.16})`;
        b.lineWidth = 1;
        b.beginPath();
        b.moveTo(lx, ly);
        b.quadraticCurveTo(lx + 3, ly - 6, lx + 7, ly - 11);
        b.stroke();
      }
      // 花箱边缘的暖光
      b.fillStyle = 'rgba(255,196,130,0.08)';
      b.fillRect(fx, fy - H * 0.004, W * 0.190, H * 0.006);
    }

    // 近景行道树：贴住左右两端，给画面一个暗角
    const fgTree = (tx, ty, dir) => {
      b.save();
      b.strokeStyle = night ? 'rgba(7,8,12,0.98)' : 'rgba(20,20,18,0.92)';
      b.lineWidth = W * 0.014;
      b.beginPath();
      b.moveTo(tx, H * 1.02);
      b.quadraticCurveTo(tx + dir * W * 0.012, ty + H * 0.10, tx + dir * W * 0.005, ty - H * 0.02);
      b.stroke();
      b.lineWidth = W * 0.005;
      b.beginPath();
      b.moveTo(tx + dir * W * 0.004, ty + H * 0.075);
      b.quadraticCurveTo(tx + dir * W * 0.045, ty + H * 0.020, tx + dir * W * 0.075, ty - H * 0.012);
      b.moveTo(tx + dir * W * 0.003, ty + H * 0.035);
      b.quadraticCurveTo(tx - dir * W * 0.030, ty + H * 0.005, tx - dir * W * 0.052, ty - H * 0.030);
      b.stroke();
      for (let i = 0; i < 62; i++) {
        const a = perm(i, 111) * Math.PI * 2;
        const rr = Math.pow(perm(i, 113), 0.6);
        const cxp = tx + dir * W * (0.030 + Math.cos(a) * 0.105 * rr);
        const cyp = ty - H * (0.045 + Math.sin(a) * 0.085 * rr);
        const lr = W * (0.012 + perm(i, 115) * 0.018);
        b.fillStyle = night ? `rgba(6,10,12,${0.78 + perm(i, 117) * 0.20})` : `rgba(16,26,18,${0.72 + perm(i, 117) * 0.22})`;
        b.beginPath();
        b.ellipse(cxp, cyp, lr, lr * 0.72, perm(i, 119) * 1.2 - 0.6, 0, 6.3);
        b.fill();
      }
      // 叶缘的一点城市冷光
      for (let i = 0; i < 14; i++) {
        const cxp = tx + dir * W * (0.020 + perm(i, 121) * 0.120);
        const cyp = ty - H * (0.035 + perm(i, 123) * 0.105);
        b.fillStyle = night ? 'rgba(120,140,190,0.10)' : 'rgba(255,206,150,0.10)';
        b.beginPath();
        b.ellipse(cxp, cyp, W * 0.006, W * 0.004, 0.2, 0, 6.3);
        b.fill();
      }
      b.restore();
    };
    fgTree(W * -0.030, H * 0.700, 1);
    fgTree(W * 1.030, H * 0.690, -1);
  };
  /* ---------- 场景：夏日草地音乐会 ---------- */
  function drawLawn(b, p, horizon) {
    const night = state.time === 'night';
    const dusk = !night && state.time !== 'day';
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    // 夜空：深蓝到草绿的空气透视
    const sky = b.createLinearGradient(0, 0, 0, horizon + H * 0.04);
    sky.addColorStop(0, night ? '#050a18' : dusk ? '#1a1730' : '#8fa8b8');
    sky.addColorStop(0.55, night ? '#0a1428' : dusk ? '#3a2a44' : '#b9c4c4');
    sky.addColorStop(1, night ? '#101c28' : dusk ? '#6a4a50' : '#d8cbb2');
    b.fillStyle = sky;
    b.fillRect(0, 0, W, horizon + H * 0.04);
    // 星子（只在夜里，压得很低）
    if (night) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 70; i++) {
        const sx = W * perm(i, 21);
        const sy = H * 0.02 + perm(i, 23) * H * 0.42;
        b.fillStyle = `rgba(226,236,255,${0.06 + perm(i, 25) * 0.28})`;
        b.beginPath(); b.arc(sx, sy, 0.5 + perm(i, 27) * 1.1, 0, 6.3); b.fill();
      }
      b.restore();
    }
    // 月亮：挂在左上树梢之上
    const mx = W * 0.115, my = H * 0.16, mr = Math.min(W, H) * 0.030;
    const halo = b.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 6);
    halo.addColorStop(0, night ? 'rgba(224,232,255,0.20)' : 'rgba(255,238,204,0.18)');
    halo.addColorStop(1, 'rgba(220,232,255,0)');
    b.fillStyle = halo;
    b.beginPath(); b.arc(mx, my, mr * 6, 0, 6.3); b.fill();
    b.fillStyle = night ? '#f0eee2' : '#fff3d8';
    b.beginPath(); b.arc(mx, my, mr, 0, 6.3); b.fill();
    b.fillStyle = 'rgba(140,146,146,0.12)';
    b.beginPath(); b.arc(mx - mr * 0.25, my + mr * 0.2, mr * 0.32, 0, 6.3); b.fill();
    b.beginPath(); b.arc(mx + mr * 0.3, my - mr * 0.25, mr * 0.18, 0, 6.3); b.fill();

    // 舞台后方的树林：两翼高、中间低，露出一截夜空
    for (let i = 0; i < 8; i++) {
      const side = i % 2;
      const bx0 = side ? W * (0.86 + (i >> 1) * 0.055) : W * (-0.02 - (i >> 1) * 0.050);
      drawCamphor(b, bx0, horizon - H * 0.045, H * (0.34 + (i % 3) * 0.04),
        'rgba(7,14,14,0.94)', night ? 'rgba(178,200,255,0.07)' : 'rgba(255,226,180,0.10)', side ? -1 : 1, -1);
    }
    // 远处草地边缘的低矮树丛
    b.fillStyle = night ? 'rgba(8,16,18,0.82)' : 'rgba(16,28,24,0.7)';
    b.beginPath();
    b.moveTo(0, horizon + H * 0.01);
    for (let i = 0; i <= 18; i++) {
      const xx = (i / 18) * W;
      b.lineTo(xx, horizon - H * (0.008 + Math.abs(Math.sin(i * 1.9 + 0.6)) * 0.022));
    }
    b.lineTo(W, horizon + H * 0.01);
    b.closePath(); b.fill();

    /* ---------- 舞台 ---------- */
    const stx = W * 0.175, stw = W * 0.650;
    const deckY = horizon - H * 0.034;
    const backTop = horizon - H * 0.300;
    const stageW = stw;
    // 背幕：深色帷幔，带纵向褶皱与底部的暖反光
    const curtain = b.createLinearGradient(0, backTop, 0, deckY);
    curtain.addColorStop(0, night ? '#0c0a1c' : '#241a30');
    curtain.addColorStop(0.55, night ? '#141028' : '#33223c');
    curtain.addColorStop(1, night ? '#1a1428' : '#3c2a38');
    b.fillStyle = curtain;
    b.fillRect(stx + W * 0.020, backTop, stageW - W * 0.040, deckY - backTop);
    for (let i = 0; i < 26; i++) {
      const fxp = stx + W * 0.020 + (stageW - W * 0.040) * (i / 25);
      const fw = (stageW - W * 0.040) / 25;
      const fg = b.createLinearGradient(fxp, 0, fxp + fw, 0);
      fg.addColorStop(0, `rgba(0,0,0,${0.10 + perm(i, 31) * 0.14})`);
      fg.addColorStop(0.45, `rgba(255,226,196,${0.010 + perm(i, 33) * 0.018})`);
      fg.addColorStop(1, `rgba(0,0,0,${0.12 + perm(i, 35) * 0.12})`);
      b.fillStyle = fg;
      b.fillRect(fxp, backTop, fw, deckY - backTop);
    }
    // 背幕上方的横幕与流苏
    b.fillStyle = night ? '#080614' : '#1c1426';
    b.fillRect(stx + W * 0.008, backTop - H * 0.020, stageW - W * 0.016, H * 0.026);
    for (let i = 0; i < 46; i++) {
      const fx0 = stx + W * 0.008 + (stageW - W * 0.016) * (i / 46);
      b.fillStyle = `rgba(214,196,168,${0.10 + perm(i, 41) * 0.10})`;
      b.fillRect(fx0, backTop + H * 0.004, W * 0.0026, H * 0.012 + perm(i, 43) * H * 0.004);
    }
    // 侧幕：左右各一条，收在台口
    for (const side of [0, 1]) {
      const sx0 = side ? stx + stageW - W * 0.055 : stx + W * 0.010;
      const sg = b.createLinearGradient(sx0, 0, sx0 + W * 0.055, 0);
      sg.addColorStop(0, night ? 'rgba(6,5,14,0.96)' : 'rgba(22,14,30,0.94)');
      sg.addColorStop(0.7, night ? 'rgba(18,12,30,0.92)' : 'rgba(40,26,44,0.9)');
      sg.addColorStop(1, 'rgba(10,6,16,0.6)');
      b.fillStyle = sg;
      b.beginPath();
      b.moveTo(sx0, backTop + H * 0.010);
      b.lineTo(sx0 + W * 0.055, backTop + H * 0.020);
      b.lineTo(sx0 + W * 0.050, deckY - H * 0.008);
      b.lineTo(sx0, deckY);
      b.closePath(); b.fill();
      for (let i = 0; i < 5; i++) {
        b.strokeStyle = `rgba(255,230,200,${0.02 + perm(i + side * 5, 47) * 0.03})`;
        b.lineWidth = 1.2;
        b.beginPath();
        b.moveTo(sx0 + W * 0.004 + i * W * 0.010, backTop + H * 0.018);
        b.quadraticCurveTo(sx0 + W * 0.008 + i * W * 0.010, (backTop + deckY) / 2, sx0 + W * 0.006 + i * W * 0.010, deckY - H * 0.01);
        b.stroke();
      }
    }
    // 台口框：木质梁柱
    b.fillStyle = night ? '#1c1418' : '#3a2a24';
    b.fillRect(stx, backTop - H * 0.028, stageW, H * 0.012);
    b.fillStyle = 'rgba(255,226,186,0.10)';
    b.fillRect(stx, backTop - H * 0.028, stageW, 1.6);
    for (const px0 of [stx + W * 0.006, stx + stageW - W * 0.016]) {
      b.fillStyle = night ? '#1a1216' : '#382822';
      b.fillRect(px0, backTop - H * 0.028, W * 0.010, deckY - backTop + H * 0.020);
      b.fillStyle = 'rgba(255,220,180,0.07)';
      b.fillRect(px0, backTop - H * 0.028, 1.4, deckY - backTop + H * 0.020);
    }
    // 舞台地板：一块块木板
    b.fillStyle = night ? '#2c2020' : '#5a3e2e';
    b.fillRect(stx - W * 0.010, deckY, stageW + W * 0.020, H * 0.014);
    const boardN = 30;
    for (let i = 0; i < boardN; i++) {
      const bx0 = stx - W * 0.010 + (stageW + W * 0.020) * (i / boardN);
      const bw0 = (stageW + W * 0.020) / boardN;
      b.fillStyle = `rgba(0,0,0,${0.06 + perm(i, 51) * 0.14})`;
      b.fillRect(bx0, deckY, bw0 * 0.5, H * 0.014);
      b.strokeStyle = 'rgba(10,6,8,0.5)';
      b.lineWidth = 0.8;
      b.beginPath(); b.moveTo(bx0, deckY); b.lineTo(bx0, deckY + H * 0.014); b.stroke();
    }
    b.fillStyle = 'rgba(255,222,178,0.14)';
    b.fillRect(stx - W * 0.010, deckY, stageW + W * 0.020, 1.4);
    // 台裙：深色布幔，带竖向褶
    const skirt = b.createLinearGradient(0, deckY + H * 0.014, 0, deckY + H * 0.030);
    skirt.addColorStop(0, night ? '#160e18' : '#2a1a1e');
    skirt.addColorStop(1, night ? '#08040c' : '#140c10');
    b.fillStyle = skirt;
    b.fillRect(stx - W * 0.012, deckY + H * 0.014, stageW + W * 0.024, H * 0.030);
    for (let i = 0; i < 34; i++) {
      const fx0 = stx - W * 0.012 + (stageW + W * 0.024) * (i / 34);
      b.strokeStyle = `rgba(255,220,188,${0.012 + perm(i, 53) * 0.022})`;
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(fx0, deckY + H * 0.014);
      b.lineTo(fx0 + W * 0.002, deckY + H * 0.042);
      b.stroke();
    }
    // 舞台侧面的台阶
    for (const side of [0, 1]) {
      const sx0 = side ? stx + stageW + W * 0.002 : stx - W * 0.052;
      for (let s = 0; s < 3; s++) {
        b.fillStyle = night ? `rgba(${26 + s * 4},${18 + s * 3},${20 + s * 3},0.95)` : `rgba(${88 + s * 6},${62 + s * 4},${46 + s * 3},0.95)`;
        b.fillRect(sx0 + s * W * 0.004, deckY + H * 0.006 + s * H * 0.009, W * 0.046 - s * W * 0.004, H * 0.009);
        b.fillStyle = 'rgba(255,226,186,0.08)';
        b.fillRect(sx0 + s * W * 0.004, deckY + H * 0.006 + s * H * 0.009, W * 0.046 - s * W * 0.004, 1);
      }
    }
    // 桁架立柱与横梁
    const trussTop = backTop - H * 0.045;
    const trussMetal = night ? 'rgba(118,122,142,0.55)' : 'rgba(96,96,104,0.6)';
    b.strokeStyle = trussMetal;
    b.lineWidth = Math.max(1.6, W * 0.0016);
    for (const tx0 of [stx + W * 0.004, stx + stageW - W * 0.012]) {
      b.beginPath(); b.moveTo(tx0, deckY); b.lineTo(tx0, trussTop); b.stroke();
      b.beginPath(); b.moveTo(tx0 + W * 0.010, deckY); b.lineTo(tx0 + W * 0.010, trussTop); b.stroke();
      // 斜撑
      for (let s = 0; s < 12; s++) {
        const y0 = deckY - (deckY - trussTop) * (s / 12);
        const y1 = deckY - (deckY - trussTop) * ((s + 1) / 12);
        b.beginPath();
        b.moveTo(tx0, y0);
        b.lineTo(tx0 + W * 0.010, y1);
        b.stroke();
      }
    }
    b.beginPath();
    b.moveTo(stx + W * 0.004, trussTop);
    b.lineTo(stx + stageW - W * 0.002, trussTop);
    b.moveTo(stx + W * 0.004, trussTop + H * 0.010);
    b.lineTo(stx + stageW - W * 0.002, trussTop + H * 0.010);
    b.stroke();
    for (let s = 0; s < 20; s++) {
      const x0 = stx + W * 0.004 + (stageW - W * 0.006) * (s / 20);
      const x1 = stx + W * 0.004 + (stageW - W * 0.006) * ((s + 1) / 20);
      b.beginPath();
      b.moveTo(x0, trussTop);
      b.lineTo(x1, trussTop + H * 0.010);
      b.stroke();
    }
    // 桁架上的舞台灯
    for (let i = 0; i < 5; i++) {
      const lx0 = stx + W * (0.075 + i * 0.115);
      b.fillStyle = night ? '#18161e' : '#26242a';
      b.fillRect(lx0, trussTop + H * 0.010, W * 0.018, H * 0.014);
      b.fillStyle = 'rgba(255,236,180,0.9)';
      b.fillRect(lx0 + W * 0.003, trussTop + H * 0.022, W * 0.012, H * 0.003);
      b.save();
      b.globalCompositeOperation = 'lighter';
      const lg = b.createRadialGradient(lx0 + W * 0.009, trussTop + H * 0.023, 0, lx0 + W * 0.009, trussTop + H * 0.023, W * 0.055);
      lg.addColorStop(0, 'rgba(255,214,150,0.22)');
      lg.addColorStop(1, 'rgba(255,214,150,0)');
      b.fillStyle = lg;
      b.beginPath(); b.arc(lx0 + W * 0.009, trussTop + H * 0.023, W * 0.055, 0, 6.3); b.fill();
      b.restore();
    }
    // 追光光柱：从桁架斜落到钢琴
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (const [cx0, cx1, spread] of [[W * 0.31, W * 0.38, 0.30], [W * 0.69, W * 0.62, 0.30]]) {
      const beam = b.createLinearGradient(cx0, trussTop, cx1, deckY);
      beam.addColorStop(0, 'rgba(210,224,255,0.16)');
      beam.addColorStop(0.6, 'rgba(210,224,255,0.05)');
      beam.addColorStop(1, 'rgba(210,224,255,0)');
      b.fillStyle = beam;
      b.beginPath();
      b.moveTo(cx0 - W * 0.006, trussTop);
      b.lineTo(cx0 + W * 0.006, trussTop);
      b.lineTo(cx1 + W * spread * 0.22, deckY);
      b.lineTo(cx1 - W * spread * 0.22, deckY);
      b.closePath(); b.fill();
    }
    // 舞台上的光尘
    for (let i = 0; i < 26; i++) {
      b.fillStyle = `rgba(255,240,210,${0.03 + perm(i, 57) * 0.08})`;
      b.beginPath();
      b.arc(stx + perm(i, 59) * stageW, backTop + perm(i, 61) * (deckY - backTop), 0.6 + perm(i, 63) * 1.2, 0, 6.3);
      b.fill();
    }
    b.restore();

    /* ---------- 三角钢琴 ---------- */
    const px = W * 0.470;
    b.save();
    b.translate(px, deckY);
    b.scale(1, 0.92);
    // 落地阴影
    b.fillStyle = 'rgba(0,0,0,0.38)';
    b.beginPath();
    b.ellipse(0, H * 0.004, W * 0.150, H * 0.014, 0, 0, 6.3);
    b.fill();
    // 掀起的琴盖：一块横向展开、略向后仰的薄板
    const lidG = b.createLinearGradient(0, -H * 0.135, 0, -H * 0.062);
    lidG.addColorStop(0, '#1d141d');
    lidG.addColorStop(0.45, '#0a0710');
    lidG.addColorStop(1, '#050307');
    b.fillStyle = lidG;
    b.beginPath();
    b.moveTo(-W * 0.128, -H * 0.068);
    b.bezierCurveTo(-W * 0.070, -H * 0.108, W * 0.030, -H * 0.118, W * 0.132, -H * 0.092);
    b.lineTo(W * 0.138, -H * 0.078);
    b.bezierCurveTo(W * 0.040, -H * 0.104, -W * 0.060, -H * 0.094, -W * 0.120, -H * 0.060);
    b.closePath(); b.fill();
    // 琴盖内侧的一线反光与厚度
    b.strokeStyle = 'rgba(206,214,255,0.13)';
    b.lineWidth = 1.1;
    b.beginPath();
    b.moveTo(-W * 0.128, -H * 0.068);
    b.bezierCurveTo(-W * 0.070, -H * 0.108, W * 0.030, -H * 0.118, W * 0.132, -H * 0.092);
    b.stroke();
    b.strokeStyle = 'rgba(0,0,0,0.45)';
    b.lineWidth = 2;
    b.beginPath();
    b.moveTo(-W * 0.120, -H * 0.060);
    b.bezierCurveTo(-W * 0.060, -H * 0.094, W * 0.040, -H * 0.104, W * 0.138, -H * 0.078);
    b.stroke();
    // 撑杆
    b.strokeStyle = 'rgba(176,166,176,0.55)';
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(W * 0.112, -H * 0.080);
    b.lineTo(W * 0.062, H * 0.006);
    b.stroke();
    // 盖沿与琴身之间的开口缝
    b.strokeStyle = 'rgba(128,96,72,0.35)';
    b.lineWidth = 2.2;
    b.beginPath();
    b.moveTo(-W * 0.128, -H * 0.066);
    b.bezierCurveTo(-W * 0.040, -H * 0.092, W * 0.075, -H * 0.088, W * 0.136, -H * 0.047);
    b.stroke();
    // 琴身
    const bodyP = new Path2D();
    bodyP.moveTo(-W * 0.132, -H * 0.006);
    bodyP.lineTo(-W * 0.132, -H * 0.068);
    bodyP.bezierCurveTo(-W * 0.040, -H * 0.094, W * 0.075, -H * 0.090, W * 0.138, -H * 0.048);
    bodyP.bezierCurveTo(W * 0.158, -H * 0.022, W * 0.146, H * 0.002, W * 0.120, H * 0.008);
    bodyP.lineTo(-W * 0.132, H * 0.008);
    bodyP.closePath();
    const bodyG = b.createLinearGradient(0, -H * 0.094, 0, H * 0.008);
    bodyG.addColorStop(0, '#1e141e');
    bodyG.addColorStop(0.35, '#0c0810');
    bodyG.addColorStop(1, '#030204');
    b.fillStyle = bodyG;
    b.fill(bodyP);
    // 琴身上的高光：一条顺着弧线
    b.strokeStyle = 'rgba(200,206,240,0.20)';
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(-W * 0.120, -H * 0.060);
    b.bezierCurveTo(-W * 0.030, -H * 0.082, W * 0.070, -H * 0.078, W * 0.126, -H * 0.046);
    b.stroke();
    // 键盘：白键 + 黑键
    b.fillStyle = '#e4dcc8';
    b.fillRect(-W * 0.150, -H * 0.020, W * 0.170, H * 0.014);
    b.fillStyle = 'rgba(90,80,70,0.55)';
    b.fillRect(-W * 0.150, -H * 0.020, W * 0.170, 1.2);
    const whiteN = 30, keyW = (W * 0.170) / whiteN;
    for (let i = 1; i < whiteN; i++) {
      b.strokeStyle = 'rgba(60,52,48,0.45)';
      b.lineWidth = 0.8;
      b.beginPath();
      b.moveTo(-W * 0.150 + i * keyW, -H * 0.020);
      b.lineTo(-W * 0.150 + i * keyW, -H * 0.006);
      b.stroke();
    }
    const blackPat = [0, 1, 3, 4, 5];
    b.fillStyle = '#060408';
    for (let i = 0; i < whiteN - 1; i++) {
      if (!blackPat.includes(i % 7)) continue;
      b.fillRect(-W * 0.150 + (i + 1) * keyW - keyW * 0.30, -H * 0.020, keyW * 0.60, H * 0.0085);
    }
    // 琴徽与品牌字样的位置
    b.fillStyle = 'rgba(214,196,158,0.55)';
    b.fillRect(-W * 0.006, -H * 0.034, W * 0.030, 1.4);
    // 琴腿与滚轮
    for (const lx0 of [-W * 0.110, W * 0.090]) {
      b.fillStyle = '#07050a';
      b.beginPath();
      b.moveTo(lx0 - W * 0.009, H * 0.006);
      b.lineTo(lx0 - W * 0.007, H * 0.052);
      b.lineTo(lx0 + W * 0.007, H * 0.052);
      b.lineTo(lx0 + W * 0.009, H * 0.006);
      b.closePath(); b.fill();
      b.fillStyle = 'rgba(190,196,220,0.20)';
      b.fillRect(lx0 - W * 0.008, H * 0.010, W * 0.002, H * 0.038);
      b.fillStyle = '#0c0a10';
      b.beginPath(); b.arc(lx0, H * 0.054, W * 0.006, 0, 6.3); b.fill();
    }
    // 踏板
    b.fillStyle = 'rgba(180,168,130,0.7)';
    for (let i = 0; i < 3; i++) b.fillRect(-W * 0.012 + i * W * 0.009, H * 0.030, W * 0.006, H * 0.006);
    b.restore();
    // 琴凳
    b.fillStyle = night ? '#120c14' : '#2a1a1a';
    b.fillRect(px - W * 0.062, deckY - H * 0.004, W * 0.062, H * 0.012);
    b.fillStyle = 'rgba(255,226,190,0.10)';
    b.fillRect(px - W * 0.062, deckY - H * 0.004, W * 0.062, 1.2);
    for (const bx0 of [px - W * 0.058, px - W * 0.012]) {
      b.fillStyle = '#07050a';
      b.fillRect(bx0, deckY + H * 0.008, W * 0.008, H * 0.030);
    }

    // 返听音箱、谱架与话筒
    const monitor = (mx0) => {
      b.fillStyle = '#17141c';
      b.beginPath();
      b.moveTo(mx0, deckY);
      b.lineTo(mx0 + W * 0.005, deckY - H * 0.030);
      b.lineTo(mx0 + W * 0.065, deckY - H * 0.038);
      b.lineTo(mx0 + W * 0.060, deckY);
      b.closePath(); b.fill();
      b.fillStyle = 'rgba(210,216,236,0.16)';
      b.fillRect(mx0 + W * 0.010, deckY - H * 0.028, W * 0.040, 1);
      b.fillStyle = 'rgba(0,0,0,0.5)';
      b.beginPath(); b.ellipse(mx0 + W * 0.032, deckY - H * 0.016, W * 0.020, H * 0.008, 0, 0, 6.3); b.fill();
    };
    monitor(W * 0.235);
    monitor(W * 0.668);
    // 谱架：三脚架 + 倾斜的谱板
    const msX = W * 0.688, msY = deckY - H * 0.052;
    b.strokeStyle = 'rgba(150,148,164,0.55)';
    b.lineWidth = Math.max(1.5, W * 0.0017);
    b.beginPath();
    b.moveTo(msX, deckY - H * 0.055);
    b.lineTo(msX, msY);
    b.moveTo(msX, deckY - H * 0.055);
    b.lineTo(msX - W * 0.020, deckY);
    b.moveTo(msX, deckY - H * 0.055);
    b.lineTo(msX + W * 0.020, deckY);
    b.moveTo(msX, deckY - H * 0.055);
    b.lineTo(msX + W * 0.002, deckY);
    b.stroke();
    b.save();
    b.translate(msX, msY);
    b.rotate(-0.15);
    b.fillStyle = 'rgba(26,24,32,0.96)';
    b.fillRect(-W * 0.034, -H * 0.024, W * 0.068, H * 0.040);
    b.fillStyle = 'rgba(236,228,208,0.88)';
    b.fillRect(-W * 0.030, -H * 0.020, W * 0.060, H * 0.032);
    // 谱纸中缝与五线谱
    b.strokeStyle = 'rgba(80,72,64,0.35)';
    b.lineWidth = 0.8;
    b.beginPath(); b.moveTo(0, -H * 0.020); b.lineTo(0, H * 0.012); b.stroke();
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 5; i++) {
        b.strokeStyle = 'rgba(92,84,74,0.50)';
        b.lineWidth = 0.6;
        b.beginPath();
        b.moveTo(side * W * 0.028, -H * 0.014 + i * H * 0.0040);
        b.lineTo(side * W * 0.003, -H * 0.014 + i * H * 0.0040);
        b.stroke();
      }
      for (let n = 0; n < 5; n++) {
        b.fillStyle = 'rgba(70,62,54,0.65)';
        b.beginPath();
        b.ellipse(side * W * (0.008 + n * 0.004), -H * 0.012 + (n % 3) * H * 0.002, W * 0.0016, H * 0.003, -0.4, 0, 6.3);
        b.fill();
      }
    }
    b.restore();
    // 话筒架
    b.strokeStyle = 'rgba(40,38,46,0.95)';
    b.beginPath();
    b.moveTo(W * 0.335, deckY);
    b.lineTo(W * 0.360, deckY - H * 0.115);
    b.stroke();
    b.fillStyle = 'rgba(24,22,30,0.95)';
    b.beginPath();
    b.ellipse(W * 0.362, deckY - H * 0.120, W * 0.008, H * 0.012, 0.5, 0, 6.3);
    b.fill();

    /* ---------- 串灯：从两侧树梢垂到舞台上方 ---------- */
    b.save();
    b.globalCompositeOperation = 'lighter';
    const strands = [
      [H * 0.060, H * 0.115, 0.035],
      [H * 0.095, H * 0.150, 0.050],
    ];
    for (let s = 0; s < strands.length; s++) {
      const [y0, y1, sag] = strands[s];
      const pts = [];
      for (let i = 0; i <= 34; i++) {
        const t = i / 34;
        const bx0 = W * (-0.02 + t * 1.04);
        const by0 = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * H * sag;
        pts.push([bx0, by0]);
        if (i > 0) {
          b.strokeStyle = 'rgba(210,206,196,0.10)';
          b.lineWidth = 0.8;
          b.beginPath();
          b.moveTo(pts[i - 1][0], pts[i - 1][1]);
          b.lineTo(bx0, by0);
          b.stroke();
        }
      }
      for (let i = 1; i < 34; i += 1) {
        if (i % 2 === 0) continue;
        const [bx0, by0] = pts[i];
        b.strokeStyle = 'rgba(200,196,186,0.16)';
        b.lineWidth = 0.7;
        b.beginPath();
        b.moveTo(bx0, by0);
        b.lineTo(bx0, by0 + H * 0.009);
        b.stroke();
        const bg = b.createRadialGradient(bx0, by0 + H * 0.010, 0, bx0, by0 + H * 0.010, W * 0.014);
        bg.addColorStop(0, 'rgba(255,224,160,0.55)');
        bg.addColorStop(0.35, 'rgba(255,208,130,0.18)');
        bg.addColorStop(1, 'rgba(255,208,130,0)');
        b.fillStyle = bg;
        b.beginPath(); b.arc(bx0, by0 + H * 0.010, W * 0.014, 0, 6.3); b.fill();
        b.fillStyle = 'rgba(255,246,214,0.92)';
        b.beginPath(); b.arc(bx0, by0 + H * 0.010, Math.max(1, W * 0.0022), 0, 6.3); b.fill();
      }
    }
    b.restore();

    // 舞台两侧的灯杆与灯串末端
    for (const side of [0, 1]) {
      const lx0 = side ? W * 0.905 : W * 0.078;
      b.strokeStyle = night ? 'rgba(26,24,30,0.95)' : 'rgba(48,42,38,0.9)';
      b.lineWidth = Math.max(2, W * 0.0026);
      b.beginPath();
      b.moveTo(lx0, H * 0.760);
      b.lineTo(lx0, H * 0.175);
      b.stroke();
      b.fillStyle = night ? 'rgba(26,24,30,0.95)' : 'rgba(48,42,38,0.9)';
      b.beginPath();
      b.moveTo(lx0 - W * 0.010, H * 0.185);
      b.lineTo(lx0 + W * 0.010, H * 0.185);
      b.lineTo(lx0, H * 0.168);
      b.closePath(); b.fill();
      b.save();
      b.globalCompositeOperation = 'lighter';
      const pg = b.createRadialGradient(lx0, H * 0.175, 0, lx0, H * 0.175, W * 0.055);
      pg.addColorStop(0, 'rgba(255,214,150,0.20)');
      pg.addColorStop(1, 'rgba(255,214,150,0)');
      b.fillStyle = pg;
      b.beginPath(); b.arc(lx0, H * 0.175, W * 0.055, 0, 6.3); b.fill();
      b.restore();
    }
  }
  drawLawn.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const dusk = !night && state.time !== 'day';
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    // 草坪底色
    const g = b.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, night ? '#12201a' : dusk ? '#2a3020' : '#5a7040');
    g.addColorStop(0.5, night ? '#0c1814' : dusk ? '#1e2818' : '#486034');
    g.addColorStop(1, night ? '#060e0c' : dusk ? '#101810' : '#324a28');
    b.fillStyle = g;
    b.fillRect(0, horizon, W, H - horizon);
    // 割草的明暗条带，沿透视收向舞台
    for (let i = 0; i < 7; i++) {
      const x0 = W * ((i - 0.5) / 7);
      const x1 = W * ((i + 0.5) / 7);
      if (i % 2) continue;
      b.fillStyle = night ? 'rgba(90,130,100,0.04)' : 'rgba(190,210,160,0.05)';
      b.beginPath();
      b.moveTo(W * 0.5 + (x0 - W * 0.5) * 0.55, horizon);
      b.lineTo(W * 0.5 + (x1 - W * 0.5) * 0.55, horizon);
      b.lineTo(x1, H);
      b.lineTo(x0, H);
      b.closePath(); b.fill();
    }
    // 草叶：远密近长，三层
    const grassCol = night ? ['44,76,54', '58,94,64', '28,52,40'] : dusk ? ['72,96,54', '94,116,64', '48,68,42'] : ['96,130,64', '122,152,76', '64,96,48'];
    for (let layer = 0; layer < 3; layer++) {
      b.lineWidth = 0.9 + layer * 0.5;
      for (let i = 0; i < 260; i++) {
        const xx = perm(i + layer * 311, 71) * W;
        const tt = perm(i + layer * 311, 73);
        const yy = horizon + Math.pow(tt, 1.3) * (H - horizon);
        const len = (H - horizon) * (0.012 + tt * 0.030) * (1 + layer * 0.35);
        b.strokeStyle = `rgba(${grassCol[layer]},${0.18 + perm(i + layer * 7, 75) * 0.34})`;
        b.beginPath();
        b.moveTo(xx, yy);
        b.quadraticCurveTo(xx + rand(-3, 3), yy - len * 0.5, xx + rand(-7, 7), yy - len);
        b.stroke();
      }
    }
    // 三叶草与小白花：近处细碎的点
    for (let i = 0; i < 90; i++) {
      const xx = rand(0, W);
      const tt = rand(0, 1);
      const yy = horizon + Math.pow(tt, 1.2) * (H - horizon);
      const s = 1 + tt * 2.4;
      if (perm(i, 77) > 0.62) {
        b.fillStyle = `rgba(244,240,220,${0.18 + perm(i, 79) * 0.30})`;
        for (let k = 0; k < 4; k++) {
          const a = k * 1.57;
          b.beginPath();
          b.ellipse(xx + Math.cos(a) * s, yy + Math.sin(a) * s * 0.6, s * 0.7, s * 0.42, a, 0, 6.3);
          b.fill();
        }
        b.fillStyle = 'rgba(250,214,130,0.5)';
        b.beginPath(); b.arc(xx, yy, s * 0.4, 0, 6.3); b.fill();
      } else {
        b.strokeStyle = `rgba(${night ? '52,88,58' : '76,112,58'},${0.20 + perm(i, 81) * 0.25})`;
        b.lineWidth = 1;
        b.beginPath();
        b.arc(xx, yy, s * 0.9, 0, 6.3);
        b.stroke();
      }
    }
    // 观众：三排坐姿背影，头颈分明，下缘溶进草地
    const hair = ['14,12,22', '22,16,26', '12,18,26', '26,20,18'];
    for (let r = 0; r < 3; r++) {
      const t = r / 2;
      const yy = horizon + (H - horizon) * (0.21 + t * 0.29);
      const size = 0.78 + t * 0.62;
      const n = 11 - r;
      for (let i = 0; i < n; i++) {
        if ((i + r * 2) % 4 === 0) continue;
        const xx = W * (0.052 + i * (0.896 / (n - 1)) + (r % 2) * 0.017) + rand(-W * 0.009, W * 0.009);
        const Hp = H * 0.064 * size;
        const lean = rand(-0.09, 0.09);
        const tone = hair[Math.floor(perm(i + r * 13, 83) * hair.length)];
        b.save();
        b.translate(xx, yy);
        b.rotate(lean);
        // 接地影
        b.fillStyle = `rgba(0,0,0,${0.16 - r * 0.03})`;
        b.beginPath(); b.ellipse(0, -Hp * 0.01, Hp * 0.26, Hp * 0.035, 0, 0, 6.3); b.fill();
        // 肩背：下缘渐隐进草地
        const bodyG = b.createLinearGradient(0, -Hp * 0.66, 0, 0);
        bodyG.addColorStop(0, `rgba(${tone},${0.94 - r * 0.04})`);
        bodyG.addColorStop(0.55, `rgba(${tone},${0.88 - r * 0.04})`);
        bodyG.addColorStop(1, `rgba(${tone},0)`);
        b.fillStyle = bodyG;
        b.beginPath();
        b.moveTo(-Hp * 0.235, 0);
        b.lineTo(-Hp * 0.208, -Hp * 0.470);
        b.quadraticCurveTo(-Hp * 0.196, -Hp * 0.596, -Hp * 0.080, -Hp * 0.616);
        b.lineTo(-Hp * 0.056, -Hp * 0.664);
        b.lineTo(Hp * 0.056, -Hp * 0.664);
        b.lineTo(Hp * 0.080, -Hp * 0.616);
        b.quadraticCurveTo(Hp * 0.196, -Hp * 0.596, Hp * 0.208, -Hp * 0.470);
        b.lineTo(Hp * 0.235, 0);
        b.closePath(); b.fill();
        // 头
        b.fillStyle = `rgba(${tone},${0.95 - r * 0.04})`;
        b.beginPath();
        b.ellipse(0, -Hp * 0.800, Hp * 0.090, Hp * 0.099, 0, 0, 6.3);
        b.fill();
        // 发型差异：短帽檐 / 低发髻 / 短发
        const style = perm(i + r * 17, 85);
        if (style > 0.68) {
          b.beginPath();
          b.ellipse(0, -Hp * 0.834, Hp * 0.096, Hp * 0.060, 0, Math.PI * 0.96, Math.PI * 2.04);
          b.fill();
          b.fillRect(-Hp * 0.102, -Hp * 0.842, Hp * 0.204, Hp * 0.016);
        } else if (style > 0.36) {
          b.beginPath();
          b.ellipse(Hp * 0.060, -Hp * 0.746, Hp * 0.029, Hp * 0.038, 0.3, 0, 6.3);
          b.fill();
        } else {
          b.beginPath();
          b.ellipse(0, -Hp * 0.836, Hp * 0.094, Hp * 0.056, 0, Math.PI * 0.98, Math.PI * 2.02);
          b.fill();
        }
        // 头顶与左肩的微光
        b.strokeStyle = night ? 'rgba(196,214,255,0.16)' : 'rgba(255,232,192,0.18)';
        b.lineWidth = Math.max(0.9, Hp * 0.012);
        b.beginPath();
        b.arc(0, -Hp * 0.800, Hp * 0.091, Math.PI * 0.92, Math.PI * 1.50);
        b.stroke();
        b.fillStyle = night ? 'rgba(180,204,255,0.06)' : 'rgba(255,232,190,0.09)';
        b.beginPath();
        b.ellipse(-Hp * 0.140, -Hp * 0.566, Hp * 0.060, Hp * 0.018, -0.22, 0, 6.3);
        b.fill();
        b.restore();
      }
    }
    // 野餐垫：编织格纹、藤篮、搪瓷杯与一豆灯光
    const picnic = (bx0, by0, sc) => {
      const rx = W * 0.082 * sc, ry = H * 0.019 * sc;
      const tilt = -0.05;
      // 垫子在草地上的柔和影子
      b.fillStyle = 'rgba(0,0,0,0.22)';
      b.beginPath(); b.ellipse(bx0 + W * 0.004 * sc, by0 + H * 0.004 * sc, rx * 1.02, ry * 1.15, tilt, 0, 6.3); b.fill();
      // 毯面：深红与米白的格纹
      b.save();
      b.beginPath(); b.ellipse(bx0, by0, rx, ry, tilt, 0, 6.3); b.clip();
      const bgG = b.createLinearGradient(0, by0 - ry, 0, by0 + ry);
      bgG.addColorStop(0, night ? '#3a2026' : '#7a4038');
      bgG.addColorStop(1, night ? '#221318' : '#5a2c28');
      b.fillStyle = bgG;
      b.fillRect(bx0 - rx, by0 - ry, rx * 2, ry * 2);
      // 格纹：顺着透视压扁的条带
      b.fillStyle = night ? 'rgba(214,198,176,0.10)' : 'rgba(238,224,198,0.26)';
      for (let i = -4; i <= 4; i++) {
        const fx = bx0 + (i / 4.4) * rx;
        b.beginPath();
        b.moveTo(fx - rx * 0.045, by0 - ry);
        b.lineTo(fx + rx * 0.045, by0 - ry);
        b.lineTo(fx + rx * 0.025, by0 + ry);
        b.lineTo(fx - rx * 0.065, by0 + ry);
        b.closePath(); b.fill();
      }
      b.fillStyle = night ? 'rgba(214,198,176,0.08)' : 'rgba(238,224,198,0.20)';
      for (let i = -2; i <= 2; i++) {
        const fy = by0 + (i / 2.4) * ry;
        b.fillRect(bx0 - rx, fy - ry * 0.10, rx * 2, ry * 0.10);
      }
      b.restore();
      // 毯边流苏
      b.strokeStyle = night ? 'rgba(198,176,148,0.22)' : 'rgba(238,222,196,0.42)';
      b.lineWidth = 1;
      for (let i = 0; i < 18; i++) {
        const a = Math.PI * (0.06 + i * 0.049);
        const fx = bx0 + Math.cos(a) * rx, fy = by0 + Math.sin(a) * ry;
        b.beginPath();
        b.moveTo(fx, fy);
        b.lineTo(fx + Math.cos(a) * W * 0.004 * sc, fy + Math.sin(a) * H * 0.003 * sc + H * 0.002 * sc);
        b.stroke();
      }
      // 藤篮：鼓腹、斜编、盖沿与提手
      const bcx = bx0 + rx * 0.30, bcy = by0 - H * 0.004 * sc;
      const bw2 = W * 0.021 * sc, bh2 = H * 0.021 * sc;
      b.fillStyle = 'rgba(0,0,0,0.30)';
      b.beginPath(); b.ellipse(bcx + W * 0.002 * sc, bcy + bh2 * 0.86, bw2 * 1.10, bh2 * 0.20, 0, 0, 6.3); b.fill();
      const wick = b.createLinearGradient(bcx - bw2, 0, bcx + bw2, 0);
      wick.addColorStop(0, night ? '#5a3c28' : '#a06a42');
      wick.addColorStop(0.45, night ? '#7a5233' : '#c68a55');
      wick.addColorStop(1, night ? '#4a3020' : '#8a5a38');
      b.fillStyle = wick;
      b.beginPath();
      b.moveTo(bcx - bw2, bcy);
      b.quadraticCurveTo(bcx - bw2 * 1.06, bcy + bh2 * 0.62, bcx - bw2 * 0.80, bcy + bh2 * 0.86);
      b.lineTo(bcx + bw2 * 0.80, bcy + bh2 * 0.86);
      b.quadraticCurveTo(bcx + bw2 * 1.06, bcy + bh2 * 0.62, bcx + bw2, bcy);
      b.closePath(); b.fill();
      b.strokeStyle = 'rgba(48,30,18,0.34)';
      b.lineWidth = 0.9;
      for (let i = -2; i <= 2; i++) {
        b.beginPath();
        b.moveTo(bcx + i * bw2 * 0.36 - bw2, bcy + bh2 * 0.80);
        b.lineTo(bcx + i * bw2 * 0.36 + bw2 * 0.55, bcy + bh2 * 0.06);
        b.stroke();
      }
      b.strokeStyle = 'rgba(255,226,186,0.18)';
      for (let i = -1; i <= 1; i++) {
        b.beginPath();
        b.moveTo(bcx + i * bw2 * 0.55 - bw2, bcy + bh2 * 0.72);
        b.lineTo(bcx + i * bw2 * 0.55 + bw2 * 0.55, bcy + bh2 * 0.10);
        b.stroke();
      }
      // 盖沿
      b.fillStyle = night ? '#6a482e' : '#b07848';
      b.beginPath(); b.ellipse(bcx, bcy, bw2 * 1.04, bh2 * 0.17, 0, 0, 6.3); b.fill();
      b.fillStyle = 'rgba(255,236,204,0.24)';
      b.beginPath(); b.ellipse(bcx, bcy - bh2 * 0.02, bw2 * 0.96, bh2 * 0.10, 0, 0, 6.3); b.fill();
      // 提手
      b.strokeStyle = night ? '#5a3c26' : '#9a6438';
      b.lineWidth = Math.max(1.4, W * 0.0022 * sc);
      b.beginPath(); b.arc(bcx, bcy, bw2 * 0.62, Math.PI * 1.04, Math.PI * 1.96); b.stroke();
      b.strokeStyle = 'rgba(255,226,186,0.22)';
      b.lineWidth = 1;
      b.beginPath(); b.arc(bcx, bcy - 1, bw2 * 0.62, Math.PI * 1.08, Math.PI * 1.92); b.stroke();

      // 搪瓷杯两只：杯口椭圆、杯身收窄
      const cup = (cx0, cy0, cs0) => {
        const cw2 = W * 0.0075 * cs0, ch2 = H * 0.011 * cs0;
        b.fillStyle = 'rgba(0,0,0,0.26)';
        b.beginPath(); b.ellipse(cx0, cy0 + 0.5, cw2 * 1.15, ch2 * 0.16, 0, 0, 6.3); b.fill();
        const g2 = b.createLinearGradient(cx0 - cw2, 0, cx0 + cw2, 0);
        g2.addColorStop(0, night ? '#8e8a80' : '#e8e0cc');
        g2.addColorStop(0.55, night ? '#c2bcae' : '#fbf4e2');
        g2.addColorStop(1, night ? '#7a766c' : '#cec4ae');
        b.fillStyle = g2;
        b.beginPath();
        b.moveTo(cx0 - cw2, cy0 - ch2);
        b.lineTo(cx0 + cw2, cy0 - ch2);
        b.lineTo(cx0 + cw2 * 0.82, cy0);
        b.lineTo(cx0 - cw2 * 0.82, cy0);
        b.closePath(); b.fill();
        b.fillStyle = night ? '#2a1a14' : '#4a2a1e';
        b.beginPath(); b.ellipse(cx0, cy0 - ch2, cw2, ch2 * 0.24, 0, 0, 6.3); b.fill();
        b.fillStyle = 'rgba(255,232,196,0.30)';
        b.beginPath(); b.ellipse(cx0, cy0 - ch2, cw2 * 0.80, ch2 * 0.16, 0, 0, 6.3); b.fill();
        b.strokeStyle = 'rgba(255,248,232,0.35)';
        b.lineWidth = 0.8;
        b.beginPath();
        b.moveTo(cx0 - cw2 * 0.52, cy0 - ch2 * 0.82);
        b.lineTo(cx0 - cw2 * 0.46, cy0 - ch2 * 0.12);
        b.stroke();
      };
      cup(bx0 - rx * 0.34, by0 + ry * 0.28, sc);
      cup(bx0 - rx * 0.16, by0 + ry * 0.52, sc * 0.92);

      // 小马灯：玻璃罩里一豆暖光
      const lx2 = bx0 - rx * 0.56, ly2 = by0 - ry * 0.10;
      const lh = H * 0.020 * sc;
      b.fillStyle = 'rgba(0,0,0,0.26)';
      b.beginPath(); b.ellipse(lx2, ly2 + lh * 0.92, W * 0.006 * sc, H * 0.0022 * sc, 0, 0, 6.3); b.fill();
      b.fillStyle = night ? '#3a3a42' : '#6a6a70';
      b.fillRect(lx2 - W * 0.0052 * sc, ly2 - lh * 0.95, W * 0.0104 * sc, H * 0.0026 * sc);
      b.fillRect(lx2 - W * 0.0048 * sc, ly2 + lh * 0.86, W * 0.0096 * sc, H * 0.0024 * sc);
      b.strokeStyle = night ? '#42424c' : '#78787e';
      b.lineWidth = Math.max(1, W * 0.0012 * sc);
      b.beginPath();
      b.moveTo(lx2 - W * 0.0046 * sc, ly2 - lh * 0.92);
      b.lineTo(lx2 - W * 0.0040 * sc, ly2 + lh * 0.86);
      b.moveTo(lx2 + W * 0.0046 * sc, ly2 - lh * 0.92);
      b.lineTo(lx2 + W * 0.0040 * sc, ly2 + lh * 0.86);
      b.stroke();
      b.fillStyle = 'rgba(255,222,158,0.30)';
      b.fillRect(lx2 - W * 0.0042 * sc, ly2 - lh * 0.86, W * 0.0084 * sc, lh * 1.66);
      b.save();
      b.globalCompositeOperation = 'lighter';
      const cg = b.createRadialGradient(lx2, ly2, 0, lx2, ly2, W * 0.034 * sc);
      cg.addColorStop(0, 'rgba(255,206,130,0.30)');
      cg.addColorStop(0.45, 'rgba(255,196,118,0.10)');
      cg.addColorStop(1, 'rgba(255,196,118,0)');
      b.fillStyle = cg;
      b.beginPath(); b.arc(lx2, ly2, W * 0.034 * sc, 0, 6.3); b.fill();
      b.restore();
      b.fillStyle = 'rgba(255,246,220,0.92)';
      b.beginPath(); b.ellipse(lx2, ly2 + lh * 0.10, W * 0.0016 * sc, H * 0.0042 * sc, 0, 0, 6.3); b.fill();
      b.strokeStyle = night ? '#4a4a54' : '#808088';
      b.lineWidth = 1;
      b.beginPath(); b.arc(lx2, ly2 - lh * 0.95, W * 0.0028 * sc, Math.PI, 6.3); b.stroke();
    };
    picnic(W * 0.150, H * 0.905, 0.85);
    picnic(W * 0.845, H * 0.930, 1.00);
    // 椅背与散落的折叠椅
    for (const [cx0, cy0, cs] of [[0.255, 0.828, 0.75], [0.745, 0.845, 0.85], [0.905, 0.815, 0.68]]) {
      const x = W * cx0, y = H * cy0, s = cs;
      b.strokeStyle = night ? 'rgba(30,28,36,0.9)' : 'rgba(80,70,60,0.8)';
      b.lineWidth = Math.max(1.6, W * 0.002);
      b.beginPath();
      b.moveTo(x - W * 0.016 * s, y);
      b.lineTo(x - W * 0.013 * s, y - H * 0.055 * s);
      b.moveTo(x + W * 0.016 * s, y);
      b.lineTo(x + W * 0.013 * s, y - H * 0.055 * s);
      b.moveTo(x - W * 0.013 * s, y - H * 0.040 * s);
      b.lineTo(x + W * 0.013 * s, y - H * 0.040 * s);
      b.stroke();
      b.strokeStyle = night ? 'rgba(50,46,56,0.9)' : 'rgba(120,100,84,0.8)';
      b.beginPath();
      b.moveTo(x - W * 0.016 * s, y - H * 0.030 * s);
      b.lineTo(x + W * 0.016 * s, y - H * 0.030 * s);
      b.stroke();
    }
    // 萤火
    b.save();
    b.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 34; i++) {
      const fx0 = rand(W * 0.02, W * 0.98);
      const fy0 = rand(horizon + H * 0.02, H * 0.98);
      const a = 0.16 + perm(i, 87) * 0.45;
      const fg = b.createRadialGradient(fx0, fy0, 0, fx0, fy0, 7);
      fg.addColorStop(0, `rgba(214,240,168,${a})`);
      fg.addColorStop(1, 'rgba(200,236,150,0)');
      b.fillStyle = fg;
      b.beginPath(); b.arc(fx0, fy0, 7, 0, 6.3); b.fill();
      b.fillStyle = `rgba(238,252,206,${a * 0.9})`;
      b.beginPath(); b.arc(fx0, fy0, 1.1, 0, 6.3); b.fill();
    }
    b.restore();
    // 近景草穗：贴着画面底边
    for (let i = 0; i < 90; i++) {
      const xx = perm(i, 89) * W;
      const yy = H - perm(i, 91) * H * 0.045;
      const len = H * (0.020 + perm(i, 93) * 0.045);
      b.strokeStyle = `rgba(${night ? '20,38,28' : '40,62,32'},${0.35 + perm(i, 95) * 0.4})`;
      b.lineWidth = 1.4;
      b.beginPath();
      b.moveTo(xx, yy);
      b.quadraticCurveTo(xx + rand(-6, 6), yy - len * 0.6, xx + rand(-14, 14), yy - len);
      b.stroke();
    }
  };
  /* ---------- 场景：大学操场 ---------- */
  function drawTrack(b, p, horizon) {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const dusk = !night && !day;
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    // 远处天际：一层薄云与城市余晖
    const skyH = horizon;
    if (night) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) {
        b.fillStyle = `rgba(220,230,255,${0.05 + perm(i, 101) * 0.22})`;
        b.beginPath();
        b.arc(perm(i, 103) * W, H * 0.03 + perm(i, 105) * H * 0.34, 0.5 + perm(i, 107) * 0.9, 0, 6.3);
        b.fill();
      }
      b.restore();
    } else {
      const cloud = b.createLinearGradient(0, H * 0.10, 0, horizon);
      cloud.addColorStop(0, day ? 'rgba(255,252,244,0.10)' : 'rgba(255,190,150,0.10)');
      cloud.addColorStop(1, 'rgba(255,220,180,0)');
      b.fillStyle = cloud;
      b.fillRect(0, H * 0.10, W, horizon - H * 0.10);
      // 几缕被夕阳烧红的云
      for (let i = 0; i < 4; i++) {
        const cy0 = H * (0.13 + i * 0.045);
        b.fillStyle = day ? 'rgba(255,250,240,0.10)' : `rgba(255,170,120,${0.06 + i * 0.012})`;
        b.beginPath();
        b.ellipse(W * (0.2 + i * 0.22), cy0, W * (0.16 + i * 0.02), H * 0.010, 0, 0, 6.3);
        b.fill();
      }
    }

    // 宿舍楼群：三层到六层，砖混立面
    const buildings = [
      { x: 0.015, w: 0.215, h: 0.235, rows: 5, tone: 0 },
      { x: 0.245, w: 0.180, h: 0.190, rows: 4, tone: 1 },
      { x: 0.440, w: 0.230, h: 0.250, rows: 6, tone: 0 },
      { x: 0.690, w: 0.175, h: 0.205, rows: 4, tone: 1 },
      { x: 0.878, w: 0.150, h: 0.175, rows: 3, tone: 0 },
    ];
    for (let bi = 0; bi < buildings.length; bi++) {
      const bd = buildings[bi];
      const bx0 = W * bd.x, bw0 = W * bd.w, bh0 = H * bd.h;
      const by0 = horizon - bh0;
      // 楼体
      const wallG = b.createLinearGradient(bx0, 0, bx0 + bw0, 0);
      if (night) {
        wallG.addColorStop(0, 'rgba(22,24,40,0.96)');
        wallG.addColorStop(0.5, 'rgba(28,30,48,0.96)');
        wallG.addColorStop(1, 'rgba(16,18,32,0.96)');
      } else if (day) {
        wallG.addColorStop(0, bd.tone ? 'rgba(196,190,176,0.92)' : 'rgba(206,186,168,0.92)');
        wallG.addColorStop(0.5, bd.tone ? 'rgba(214,208,194,0.92)' : 'rgba(220,200,182,0.92)');
        wallG.addColorStop(1, 'rgba(172,164,152,0.92)');
      } else {
        wallG.addColorStop(0, bd.tone ? 'rgba(96,84,92,0.92)' : 'rgba(104,82,80,0.92)');
        wallG.addColorStop(0.5, bd.tone ? 'rgba(112,98,104,0.92)' : 'rgba(120,94,88,0.92)');
        wallG.addColorStop(1, 'rgba(72,62,72,0.92)');
      }
      b.fillStyle = wallG;
      b.fillRect(bx0, by0, bw0, bh0);
      // 屋顶压边与女儿墙
      b.fillStyle = night ? 'rgba(12,14,24,0.98)' : day ? 'rgba(150,146,136,0.95)' : 'rgba(58,50,56,0.95)';
      b.fillRect(bx0 - W * 0.004, by0 - H * 0.010, bw0 + W * 0.008, H * 0.010);
      b.fillStyle = 'rgba(255,240,214,0.07)';
      b.fillRect(bx0 - W * 0.004, by0 - H * 0.010, bw0 + W * 0.008, 1.3);
      // 楼顶的水箱与楼梯间
      if (bi % 2 === 0) {
        b.fillStyle = night ? 'rgba(18,20,32,0.98)' : day ? 'rgba(170,166,154,0.95)' : 'rgba(70,60,66,0.95)';
        b.fillRect(bx0 + bw0 * 0.12, by0 - H * 0.032, bw0 * 0.18, H * 0.024);
        b.beginPath();
        b.ellipse(bx0 + bw0 * 0.62, by0 - H * 0.026, bw0 * 0.07, H * 0.011, 0, 0, 6.3);
        b.fill();
        b.fillRect(bx0 + bw0 * 0.55, by0 - H * 0.016, bw0 * 0.14, H * 0.016);
      }
      // 竖向落水管
      b.fillStyle = night ? 'rgba(10,12,20,0.9)' : 'rgba(90,84,78,0.55)';
      b.fillRect(bx0 + bw0 * 0.955, by0 + H * 0.008, W * 0.004, bh0 - H * 0.008);
      // 窗户阵列 + 阳台
      const cols = 5;
      const rowH = bh0 / bd.rows;
      for (let r = 0; r < bd.rows; r++) {
        const wy = by0 + rowH * (r + 0.18);
        // 层间腰线
        b.fillStyle = 'rgba(255,244,222,0.045)';
        b.fillRect(bx0, by0 + rowH * (r + 0.92), bw0, 1);
        for (let c = 0; c < cols; c++) {
          const wx = bx0 + bw0 * (0.07 + c * 0.185);
          const ww = bw0 * 0.128;
          const wh = rowH * 0.46;
          const litV = perm(bi * 31 + r * 7 + c, 109);
          const lit = night ? litV > 0.68 : false;
          const warm = perm(bi * 17 + r * 5 + c * 3, 113);
          // 窗洞
          b.fillStyle = night
            ? (lit
              ? (warm > 0.72 ? 'rgba(255,226,176,0.86)' : warm > 0.38 ? 'rgba(255,198,120,0.76)' : 'rgba(196,212,238,0.54)')
              : 'rgba(8,10,20,0.9)')
            : 'rgba(38,46,52,0.55)';
          b.fillRect(wx, wy, ww, wh);
          if (lit) {
            b.save();
            b.globalCompositeOperation = 'lighter';
            const wg = b.createRadialGradient(wx + ww * 0.5, wy + wh * 0.5, 0, wx + ww * 0.5, wy + wh * 0.5, ww * 1.15);
            wg.addColorStop(0, 'rgba(255,200,120,0.12)');
            wg.addColorStop(1, 'rgba(255,200,120,0)');
            b.fillStyle = wg;
            b.beginPath(); b.arc(wx + ww * 0.5, wy + wh * 0.5, ww * 1.15, 0, 6.3); b.fill();
            b.restore();
            // 窗内剪影：书桌、帘子
            b.fillStyle = 'rgba(120,80,50,0.45)';
            b.fillRect(wx + ww * 0.10, wy + wh * 0.62, ww * 0.36, wh * 0.30);
            b.fillStyle = 'rgba(80,54,36,0.55)';
            b.fillRect(wx + ww * 0.62, wy, ww * 0.32, wh * 0.45);
          }
          // 窗框与中梃
          b.strokeStyle = night ? 'rgba(40,40,56,0.75)' : 'rgba(92,88,82,0.6)';
          b.lineWidth = 1;
          b.strokeRect(wx, wy, ww, wh);
          b.beginPath();
          b.moveTo(wx + ww * 0.5, wy); b.lineTo(wx + ww * 0.5, wy + wh);
          b.stroke();
          // 阳台栏杆：每一层隔列
          if ((c + r + bi) % 3 === 0) {
            b.strokeStyle = night ? 'rgba(46,46,64,0.8)' : 'rgba(120,114,104,0.6)';
            b.lineWidth = 1;
            b.beginPath();
            b.moveTo(wx - ww * 0.08, wy + wh + rowH * 0.08);
            b.lineTo(wx + ww * 1.08, wy + wh + rowH * 0.08);
            b.moveTo(wx - ww * 0.08, wy + wh + rowH * 0.02);
            b.lineTo(wx + ww * 1.08, wy + wh + rowH * 0.02);
            b.stroke();
            for (let k = 0; k < 7; k++) {
              b.beginPath();
              b.moveTo(wx - ww * 0.08 + (ww * 1.16) * (k / 6), wy + wh + rowH * 0.02);
              b.lineTo(wx - ww * 0.08 + (ww * 1.16) * (k / 6), wy + wh + rowH * 0.08);
              b.stroke();
            }
            // 晾着的衣服
            if (perm(bi * 13 + r * 5 + c, 111) > 0.58) {
              b.fillStyle = night ? 'rgba(90,96,116,0.5)' : 'rgba(220,214,200,0.5)';
              b.fillRect(wx + ww * 0.2, wy + wh + rowH * 0.02, ww * 0.16, rowH * 0.16);
              b.fillRect(wx + ww * 0.5, wy + wh + rowH * 0.02, ww * 0.22, rowH * 0.20);
            }
          }
        }
      }
      // 墙体底部的污渍
      const dirt = b.createLinearGradient(0, horizon - bh0 * 0.22, 0, horizon);
      dirt.addColorStop(0, 'rgba(0,0,0,0)');
      dirt.addColorStop(1, 'rgba(0,0,0,0.22)');
      b.fillStyle = dirt;
      b.fillRect(bx0, horizon - bh0 * 0.22, bw0, bh0 * 0.22);
    }
    // 楼与楼之间的树
    for (let i = 0; i < 6; i++) {
      drawCamphor(b, W * (0.215 + i * 0.145), horizon - H * 0.02, H * (0.16 + (i % 3) * 0.03),
        night ? 'rgba(8,16,16,0.95)' : day ? 'rgba(48,78,44,0.9)' : 'rgba(24,36,28,0.94)',
        night ? 'rgba(176,196,255,0.06)' : 'rgba(255,224,170,0.12)', i % 2 ? -1 : 1, -1);
    }

    // 高杆灯：四根，灯头朝向场地
    for (let i = 0; i < 4; i++) {
      const lx0 = W * (0.055 + i * 0.300);
      const top = horizon - H * 0.300;
      b.strokeStyle = night ? 'rgba(34,36,48,0.95)' : 'rgba(72,72,72,0.85)';
      b.lineWidth = Math.max(2.5, W * 0.0035);
      b.beginPath();
      b.moveTo(lx0, horizon);
      b.lineTo(lx0, top);
      b.stroke();
      // 灯架横臂
      b.beginPath();
      b.moveTo(lx0 - W * 0.018, top + H * 0.008);
      b.lineTo(lx0 + W * 0.018, top + H * 0.008);
      b.stroke();
      b.fillStyle = night ? '#1c1e2a' : '#3a3c3c';
      for (let k = -1; k <= 1; k += 2) {
        b.fillRect(lx0 + k * W * 0.014 - W * 0.008, top + H * 0.008, W * 0.016, H * 0.010);
        b.fillStyle = night ? 'rgba(255,226,170,0.95)' : 'rgba(232,232,220,0.8)';
        b.fillRect(lx0 + k * W * 0.014 - W * 0.006, top + H * 0.016, W * 0.012, H * 0.003);
        b.fillStyle = night ? '#1c1e2a' : '#3a3c3c';
      }
      if (night || dusk) {
        b.save();
        b.globalCompositeOperation = 'lighter';
        const lg = b.createRadialGradient(lx0, top + H * 0.018, 0, lx0, top + H * 0.018, W * 0.135);
        lg.addColorStop(0, 'rgba(255,210,150,0.22)');
        lg.addColorStop(0.4, 'rgba(255,200,130,0.07)');
        lg.addColorStop(1, 'rgba(255,200,130,0)');
        b.fillStyle = lg;
        b.beginPath(); b.arc(lx0, top + H * 0.018, W * 0.135, 0, 6.3); b.fill();
        b.restore();
      }
    }
    // 铁丝网围栏：横杆 + 菱形网
    b.strokeStyle = night ? 'rgba(96,100,128,0.30)' : 'rgba(90,88,84,0.35)';
    b.lineWidth = 1;
    for (let row = 0; row < 2; row++) {
      b.beginPath();
      b.moveTo(0, horizon - H * 0.030 + row * H * 0.015);
      b.lineTo(W, horizon - H * 0.030 + row * H * 0.015);
      b.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const px0 = W * (i / 25);
      b.beginPath();
      b.moveTo(px0, horizon - H * 0.032);
      b.lineTo(px0, horizon);
      b.stroke();
    }
    b.strokeStyle = night ? 'rgba(96,100,128,0.12)' : 'rgba(90,88,84,0.16)';
    for (let i = -2; i < 30; i++) {
      const x0 = W * (i / 26);
      b.beginPath();
      b.moveTo(x0, horizon - H * 0.032);
      b.lineTo(x0 + W * 0.045, horizon);
      b.stroke();
      b.beginPath();
      b.moveTo(x0 + W * 0.045, horizon - H * 0.032);
      b.lineTo(x0, horizon);
      b.stroke();
    }
    // 篮球场：篮板、篮筐、球网
    const hoop = (hx0, dir) => {
      b.strokeStyle = 'rgba(40,38,48,0.88)';
      b.lineWidth = Math.max(2.5, W * 0.003);
      b.beginPath();
      b.moveTo(hx0, horizon);
      b.lineTo(hx0, horizon - H * 0.135);
      b.lineTo(hx0 + dir * W * 0.030, horizon - H * 0.135);
      b.stroke();
      b.fillStyle = 'rgba(232,228,214,0.85)';
      b.fillRect(hx0 + dir * W * 0.030, horizon - H * 0.152, dir * W * 0.085, H * 0.040);
      b.strokeStyle = 'rgba(90,60,50,0.7)';
      b.lineWidth = 1.2;
      b.strokeRect(hx0 + dir * W * 0.030, horizon - H * 0.152, dir * W * 0.085, H * 0.040);
      // 方框
      b.strokeRect(hx0 + dir * W * 0.058, horizon - H * 0.138, dir * W * 0.032, H * 0.020);
      // 篮筐
      b.strokeStyle = 'rgba(190,92,54,0.9)';
      b.lineWidth = 2;
      b.beginPath();
      b.ellipse(hx0 + dir * W * 0.074, horizon - H * 0.110, W * 0.017, H * 0.005, 0, 0, 6.3);
      b.stroke();
      // 网
      b.strokeStyle = 'rgba(220,220,220,0.40)';
      b.lineWidth = 0.8;
      for (let s = 0; s < 8; s++) {
        b.beginPath();
        b.moveTo(hx0 + dir * W * (0.074 - 0.017 + s * 0.00425), horizon - H * 0.110);
        b.lineTo(hx0 + dir * W * (0.074 - 0.010 + s * 0.00285), horizon - H * 0.074);
        b.stroke();
      }
      b.beginPath();
      b.moveTo(hx0 + dir * W * 0.056, horizon - H * 0.098);
      b.lineTo(hx0 + dir * W * 0.092, horizon - H * 0.098);
      b.stroke();
    };
    hoop(W * 0.885, -1);
    // 看台：左侧阶梯座
    for (let r = 0; r < 4; r++) {
      const ty0 = horizon - H * 0.012 - r * H * 0.018;
      b.fillStyle = night ? `rgba(${26 + r * 4},${28 + r * 4},${44 + r * 4},0.95)` : day ? `rgba(${150 + r * 8},${146 + r * 8},${138 + r * 8},0.95)` : `rgba(${72 + r * 6},${60 + r * 5},${66 + r * 5},0.95)`;
      b.fillRect(W * 0.005 + r * W * 0.018, ty0 - H * 0.012, W * 0.150 - r * W * 0.018, H * 0.012);
      b.fillStyle = 'rgba(255,240,210,0.06)';
      b.fillRect(W * 0.005 + r * W * 0.018, ty0 - H * 0.012, W * 0.150 - r * W * 0.018, 1);
    }
    // 沙坑（跳远）与足球门
    b.fillStyle = night ? 'rgba(70,58,44,0.55)' : day ? 'rgba(206,184,140,0.75)' : 'rgba(120,96,70,0.6)';
    b.beginPath();
    b.ellipse(W * 0.70, horizon + H * 0.018, W * 0.060, H * 0.010, -0.04, 0, 6.3);
    b.fill();
    b.strokeStyle = 'rgba(238,238,232,0.55)';
    b.lineWidth = 1.6;
    b.beginPath();
    b.moveTo(W * 0.315, horizon + H * 0.012);
    b.lineTo(W * 0.315, horizon - H * 0.022);
    b.lineTo(W * 0.372, horizon - H * 0.026);
    b.lineTo(W * 0.372, horizon + H * 0.012);
    b.stroke();
    for (let i = 0; i < 10; i++) {
      const gx = W * (0.318 + i * 0.006);
      b.beginPath();
      b.moveTo(gx, horizon - H * 0.022);
      b.lineTo(gx, horizon + H * 0.012);
      b.stroke();
    }
  }
  drawTrack.ground = (b, p, horizon) => {
    const night = state.time === 'night';
    const day = state.time === 'day';
    const dusk = !night && !day;
    const p2 = PALETTES[state.time] || PALETTES.dusk;
    const perm = (n, k) => {
      const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
      return v - Math.floor(v);
    };
    const groundH = H - horizon;
    // 远侧弯道
    const farG = b.createLinearGradient(0, horizon, 0, horizon + groundH * 0.08);
    farG.addColorStop(0, night ? '#3a1a22' : day ? '#b4523e' : '#682a32');
    farG.addColorStop(1, night ? '#2e141c' : day ? '#9e4434' : '#561f2a');
    b.fillStyle = farG;
    b.fillRect(0, horizon, W, groundH * 0.08);
    // 内场草坪
    const infieldTop = horizon + groundH * 0.08;
    const infieldBot = horizon + groundH * 0.52;
    const grassG = b.createLinearGradient(0, infieldTop, 0, infieldBot);
    grassG.addColorStop(0, night ? '#10261a' : day ? '#5e8646' : '#223c28');
    grassG.addColorStop(0.5, night ? '#0c1e16' : day ? '#527c3e' : '#1c3222');
    grassG.addColorStop(1, night ? '#0a1812' : day ? '#486e38' : '#182a1e');
    b.fillStyle = grassG;
    b.fillRect(0, infieldTop, W, infieldBot - infieldTop);
    // 草坪的横向修剪纹
    for (let i = 0; i < 8; i++) {
      if (i % 2) continue;
      b.fillStyle = night ? 'rgba(120,170,120,0.035)' : day ? 'rgba(210,230,170,0.055)' : 'rgba(150,190,130,0.035)';
      const y0 = infieldTop + (infieldBot - infieldTop) * (i / 8);
      b.fillRect(0, y0, W, (infieldBot - infieldTop) / 8);
    }
    // 草纹
    for (let i = 0; i < 220; i++) {
      const xx = perm(i, 113) * W;
      const yy = infieldTop + perm(i, 115) * (infieldBot - infieldTop);
      b.strokeStyle = `rgba(${night ? '54,92,60' : '84,124,62'},${0.14 + perm(i, 117) * 0.22})`;
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(xx, yy);
      b.quadraticCurveTo(xx + rand(-2, 2), yy - rand(3, 7), xx + rand(-5, 5), yy - rand(6, 14));
      b.stroke();
    }
    // 内场白线：足球场边线（透视）
    b.strokeStyle = night ? 'rgba(236,230,220,0.22)' : 'rgba(246,242,232,0.50)';
    b.lineWidth = Math.max(1.4, W * 0.0018);
    b.beginPath();
    b.moveTo(W * 0.06, infieldBot - groundH * 0.02);
    b.lineTo(W * 0.94, infieldBot - groundH * 0.02);
    b.stroke();
    b.beginPath();
    b.moveTo(W * 0.30, infieldTop + groundH * 0.05);
    b.lineTo(W * 0.06, infieldBot - groundH * 0.02);
    b.moveTo(W * 0.70, infieldTop + groundH * 0.05);
    b.lineTo(W * 0.94, infieldBot - groundH * 0.02);
    b.stroke();
    // 中圈
    b.beginPath();
    b.ellipse(W * 0.5, (infieldTop + infieldBot) / 2 + groundH * 0.02, W * 0.115, groundH * 0.10, 0, 0, 6.3);
    b.stroke();
    // 近侧跑道：红色塑胶
    const nearTop = infieldBot;
    const trackG = b.createLinearGradient(0, nearTop, 0, H);
    trackG.addColorStop(0, night ? '#4a1e28' : day ? '#cb5a42' : '#7a2c36');
    trackG.addColorStop(0.45, night ? '#3a1620' : day ? '#b84c38' : '#68242e');
    trackG.addColorStop(1, night ? '#24101a' : day ? '#943c2e' : '#4c1a26');
    b.fillStyle = trackG;
    b.fillRect(0, nearTop, W, H - nearTop);
    // 跑道颗粒质感
    for (let i = 0; i < 520; i++) {
      const xx = perm(i, 119) * W;
      const tt = perm(i, 121);
      const yy = nearTop + Math.pow(tt, 1.2) * (H - nearTop);
      const v = perm(i, 123);
      b.fillStyle = v > 0.55
        ? `rgba(255,170,140,${0.03 + v * 0.06})`
        : `rgba(20,6,10,${0.05 + v * 0.10})`;
      b.fillRect(xx, yy, 1 + tt * 2, 1 + tt * 2);
    }
    // 分道线：近大远小，略带弯
    const laneN = 8;
    for (let i = 0; i <= laneN; i++) {
      const t = i / laneN;
      const y0 = nearTop + (H - nearTop) * Math.pow(t, 1.25);
      const curve = Math.sin(t * Math.PI * 0.9) * H * 0.006;
      b.strokeStyle = night ? `rgba(236,230,224,${0.24 + t * 0.18})` : `rgba(250,246,238,${0.42 + t * 0.20})`;
      b.lineWidth = 1.2 + t * 2.6;
      b.beginPath();
      b.moveTo(-W * 0.03, y0 + curve);
      b.quadraticCurveTo(W * 0.5, y0 - H * 0.010 + curve, W * 1.03, y0 + H * 0.012 + curve);
      b.stroke();
    }
    // 近侧跑道的弧线接缝
    b.strokeStyle = night ? 'rgba(0,0,0,0.18)' : 'rgba(70,20,24,0.18)';
    b.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      b.beginPath();
      b.moveTo(-W * 0.02, H * (0.72 + i * 0.10));
      b.quadraticCurveTo(W * 0.5, H * (0.70 + i * 0.10), W * 1.02, H * (0.73 + i * 0.10));
      b.stroke();
    }
    // 跑道边的白色路缘石
    b.fillStyle = night ? 'rgba(170,168,160,0.55)' : day ? 'rgba(232,228,216,0.85)' : 'rgba(200,194,182,0.7)';
    b.fillRect(0, nearTop - H * 0.006, W, H * 0.006);
    b.fillStyle = 'rgba(255,250,240,0.20)';
    b.fillRect(0, nearTop - H * 0.006, W, 1.2);
    // 自动贩卖机：左侧，冷白灯箱
    const vx = W * 0.014, vy = H * 0.700, vw = W * 0.078, vh = H * 0.190;
    const vg = b.createLinearGradient(vx, 0, vx + vw, 0);
    vg.addColorStop(0, night ? 'rgba(38,44,62,0.98)' : 'rgba(210,206,196,0.95)');
    vg.addColorStop(0.5, night ? 'rgba(52,60,82,0.98)' : 'rgba(228,224,214,0.95)');
    vg.addColorStop(1, night ? 'rgba(28,32,48,0.98)' : 'rgba(186,182,172,0.95)');
    b.fillStyle = vg;
    b.fillRect(vx, vy, vw, vh);
    // 灯箱玻璃
    b.fillStyle = night ? 'rgba(214,226,242,0.16)' : 'rgba(250,248,240,0.55)';
    b.fillRect(vx + W * 0.008, vy + H * 0.014, vw - W * 0.016, vh * 0.52);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        b.fillStyle = ['rgba(204,64,52,0.55)', 'rgba(64,132,196,0.5)', 'rgba(228,196,74,0.5)', 'rgba(88,168,104,0.45)'][(r + c) % 4];
        b.fillRect(vx + W * 0.012 + c * W * 0.015, vy + H * 0.022 + r * H * 0.026, W * 0.010, H * 0.018);
      }
    }
    b.fillStyle = 'rgba(255,255,255,0.10)';
    b.fillRect(vx + W * 0.010, vy + H * 0.016, W * 0.006, vh * 0.48);
    // 投币口与取货口
    b.fillStyle = 'rgba(20,22,28,0.8)';
    b.fillRect(vx + W * 0.020, vy + vh * 0.68, W * 0.016, H * 0.010);
    b.fillStyle = 'rgba(12,12,18,0.9)';
    b.fillRect(vx + W * 0.010, vy + vh * 0.80, vw - W * 0.020, H * 0.045);
    b.fillStyle = 'rgba(255,240,200,0.10)';
    b.fillRect(vx + W * 0.010, vy + vh * 0.80, vw - W * 0.020, 1.2);
    if (night) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      const vgl = b.createRadialGradient(vx + vw * 0.5, vy + vh * 0.35, 0, vx + vw * 0.5, vy + vh * 0.35, W * 0.115);
      vgl.addColorStop(0, 'rgba(200,222,255,0.18)');
      vgl.addColorStop(1, 'rgba(200,222,255,0)');
      b.fillStyle = vgl;
      b.beginPath(); b.arc(vx + vw * 0.5, vy + vh * 0.35, W * 0.115, 0, 6.3); b.fill();
      b.restore();
    }
    // 长椅：右侧两张
    const bench = (bx0, by0, sc) => {
      const bw0 = W * 0.150 * sc;
      b.fillStyle = night ? 'rgba(64,44,40,0.95)' : day ? 'rgba(162,120,80,0.92)' : 'rgba(104,74,56,0.92)';
      b.fillRect(bx0, by0, bw0, H * 0.012 * sc);
      b.fillRect(bx0, by0 - H * 0.036 * sc, bw0, H * 0.010 * sc);
      b.fillRect(bx0, by0 - H * 0.024 * sc, bw0, H * 0.008 * sc);
      b.fillStyle = 'rgba(255,238,208,0.10)';
      b.fillRect(bx0, by0 - H * 0.036 * sc, bw0, 1);
      b.strokeStyle = night ? 'rgba(30,26,32,0.9)' : 'rgba(70,58,48,0.8)';
      b.lineWidth = Math.max(2, W * 0.0024);
      b.beginPath();
      b.moveTo(bx0 + bw0 * 0.10, by0 + H * 0.012 * sc);
      b.lineTo(bx0 + bw0 * 0.08, by0 + H * 0.050 * sc);
      b.moveTo(bx0 + bw0 * 0.90, by0 + H * 0.012 * sc);
      b.lineTo(bx0 + bw0 * 0.92, by0 + H * 0.050 * sc);
      b.stroke();
      b.fillStyle = 'rgba(0,0,0,0.22)';
      b.beginPath();
      b.ellipse(bx0 + bw0 * 0.5, by0 + H * 0.052 * sc, bw0 * 0.52, H * 0.010 * sc, 0, 0, 6.3);
      b.fill();
    };
    bench(W * 0.760, H * 0.865, 1.05);
    bench(W * 0.610, H * 0.940, 1.18);
    // 草坪与跑道交界的杂草
    for (let i = 0; i < 60; i++) {
      const xx = perm(i, 127) * W;
      b.strokeStyle = `rgba(${night ? '48,80,52' : '92,128,66'},${0.18 + perm(i, 129) * 0.3})`;
      b.lineWidth = 1;
      b.beginPath();
      b.moveTo(xx, nearTop);
      b.quadraticCurveTo(xx + rand(-2, 2), nearTop - H * 0.012, xx + rand(-5, 5), nearTop - H * 0.026);
      b.stroke();
    }
    // 灯光/月光落在跑道
    b.save();
    b.globalCompositeOperation = 'lighter';
    const pool = b.createLinearGradient(W * 0.15, nearTop, W * 0.35, H);
    pool.addColorStop(0, hexA(p2.glow, night ? 0.12 : 0.10));
    pool.addColorStop(0.6, hexA(p2.glow, 0.03));
    pool.addColorStop(1, hexA(p2.glow, 0));
    b.fillStyle = pool;
    b.beginPath();
    b.moveTo(W * 0.05, nearTop);
    b.lineTo(W * 0.55, nearTop);
    b.lineTo(W * 0.72, H);
    b.lineTo(W * 0.18, H);
    b.closePath(); b.fill();
    // 跑道上的水洼反光
    if (night || dusk) {
      for (const [wx0, wt, wr] of [[0.36, 0.35, 0.055], [0.66, 0.62, 0.075], [0.18, 0.80, 0.050]]) {
        const wy0 = nearTop + (H - nearTop) * wt;
        b.fillStyle = 'rgba(190,210,240,0.06)';
        b.beginPath();
        b.ellipse(W * wx0, wy0, W * wr, (H - nearTop) * 0.018, 0, 0, 6.3);
        b.fill();
        b.strokeStyle = 'rgba(255,240,210,0.12)';
        b.lineWidth = 1;
        b.beginPath();
        b.ellipse(W * wx0, wy0, W * wr * 0.7, (H - nearTop) * 0.010, 0, 0, 6.3);
        b.stroke();
      }
    }
    b.restore();
    // 飞虫绕灯
    if (night) {
      b.save();
      b.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 18; i++) {
        b.fillStyle = `rgba(230,238,210,${0.06 + perm(i, 131) * 0.18})`;
        b.beginPath();
        b.arc(rand(0, W), rand(horizon + H * 0.04, H), rand(0.6, 1.3), 0, 6.3);
        b.fill();
      }
      b.restore();
    }
    // 前景虚化的草穗/看台边缘，压住画面底角
    b.fillStyle = night ? 'rgba(4,8,8,0.55)' : 'rgba(20,28,18,0.42)';
    for (let i = 0; i < 14; i++) {
      const side = i % 2;
      const xx = side ? W * rand(0.94, 1.04) : W * rand(-0.04, 0.06);
      const yy = H * rand(0.92, 1.02);
      b.beginPath();
      b.ellipse(xx, yy, W * rand(0.010, 0.030), H * rand(0.008, 0.020), rand(-0.4, 0.4), 0, 6.3);
      b.fill();
    }
  };

  /* ---------- 镜头换算 ---------- */
  function camTarget(cam) {
    // 远景：全景；中景：略推；近景 / 特写：继续推近
    // 缩放不得小于 1，否则会露出画布边缘
    if (cam === 'wide') return { zoom: 1, tx: 0, ty: 0 };
    if (cam === 'close') return { zoom: 1.16, tx: W * 0.02, ty: H * 0.05 };
    if (cam === 'detail') return { zoom: 1.22, tx: 0, ty: H * 0.08 };
    return { zoom: 1.06, tx: 0, ty: -H * 0.02 };
  }

  function applyCam() {
    ctx.translate(W / 2, H / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-W / 2 + camera.x, -H / 2 + camera.y);
  }

  /* ---------- 绘制一帧 ---------- */
  function draw(dt) {
    if (!layers) buildLayers();
    time += dt;
    const t = camTarget(state.cam);
    camera.x += (t.tx - camera.x) * Math.min(1, dt * 2.4);
    camera.y += (t.ty - camera.y) * Math.min(1, dt * 2.4);
    camera.zoom += (t.zoom - camera.zoom) * Math.min(1, dt * 2.6);

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    applyCam();

    // 底图
    ctx.drawImage(layers, 0, 0, W, H);

    // 动态光晕
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const p = PALETTES[state.time] || PALETTES.dusk;
    const sunX = W * 0.7, sunY = H * 0.3 + Math.sin(time * 0.5) * 4;
    const rg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(W, H) * 0.4);
    rg.addColorStop(0, hexA(p.glow, (state.time === 'day' ? 0.10 : 0.18) + Math.sin(time * 0.7) * 0.03));
    rg.addColorStop(1, hexA(p.glow, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 浮尘
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      m.x += m.vx; m.y += m.vy;
      if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
      if (m.x < -10) m.x = W + 10; if (m.x > W + 10) m.x = -10;
      const tw = 0.5 + Math.sin(time * 1.5 + m.ph) * 0.5;
      ctx.fillStyle = `rgba(255,224,180,${m.a * tw})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.3); ctx.fill();
    }
    // 火夜：从窗隙与屋脊升起的火星
    if (state.time === 'fire') {
      for (let i = 0; i < 26; i++) {
        const drift = time * (0.16 + (i % 5) * 0.03);
        const ex = ((i * 127.3) % W + Math.sin(drift * 2 + i) * 26 + W) % W;
        const rise = (time * (14 + (i % 7) * 4) + i * 47) % (H * 0.92);
        const ey = H * 0.9 - rise;
        const a = 0.16 + 0.3 * (0.5 + Math.sin(time * 2 + i) * 0.5);
        ctx.fillStyle = `rgba(255,${150 + (i * 31) % 80},${60 + (i * 17) % 60},${a})`;
        ctx.beginPath(); ctx.arc(ex, ey, 0.8 + (i % 3) * 0.7, 0, 6.3); ctx.fill();
      }
    }
    ctx.restore();

    // 人物（半身立绘）：只有出场角色才画，纯描写段落自然只剩场景
    const cast = state.cast.slice(0, 3);
    const unit = Math.min(W, H);
    const cam = state.cam;
    const view = state.view || 'normal';
    const phaseOf = (ch) => {
      const s = String(ch.cid || ch.name || '');
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 997;
      return h * 0.061;
    };

    if (cam === 'detail') {
      // 特写：只画物件，不画手与人物；同一镜头内保留最近出现的道具。
      // 物件是静止画面，离屏缓存一次后逐帧贴图，避免每帧重绘大量颗粒与阴影。
      const propKey = `${detailProp}|${detailText}|${detailPhotoBoy ? 1 : 0}|${state.time}|${p.glow}|${W}x${H}@${DPR}|${starryReady ? 1 : 0}|${scoreReady ? 1 : 0}|${photoBoyReady ? 1 : 0}`;
      if (!propLayer || propLayerKey !== propKey) {
        if (!propLayer) propLayer = document.createElement('canvas');
        propLayer.width = canvas.width;
        propLayer.height = canvas.height;
        const pc = propLayer.getContext('2d');
        pc.setTransform(DPR, 0, 0, DPR, 0, 0);
        pc.clearRect(0, 0, W, H);
        drawPropDetail(pc, {
          x: W * 0.5, y: H * 0.42, size: unit * 0.56,
          time, kind: detailProp, palette: p, text: detailText,
          starry: starryReady ? starry : null,
          score: scoreReady ? scoreSheet : null,
          photo: detailPhotoBoy && photoBoyReady ? photoBoy : null,
        });
        propLayerKey = propKey;
      }
      ctx.drawImage(propLayer, 0, 0, W, H);
      drawVignette(ctx, W, H);
    } else if (view === 'over' && cast.length >= 2) {
      // 过肩：前景人物放大压暗，背景人物保持中景
      const fg = cast.find((c) => c.name !== state.speaker) || cast[cast.length - 1];
      const bg = cast.find((c) => c !== fg) || cast[0];
      drawPortrait(ctx, bg.model, {
        x: W * 0.78, bottom: H * 0.8, height: unit * 0.42,
        facing: -1, alpha: 0.88, time, phase: phaseOf(bg),
        glow: p.glow, depth: 0.3, speaking: bg.name === state.speaker,
      });
      drawPortrait(ctx, fg.model, {
        x: W * 0.22, bottom: H * 0.86, height: unit * 0.6,
        facing: 1, alpha: 0.95, time, phase: phaseOf(fg),
        glow: p.glow, depth: 0, speaking: false,
      });
    } else {
      const heightFactor = cam === 'wide' ? 0.36 : cam === 'close' ? 0.56 : 0.42;
      const height = unit * heightFactor * (cast.length >= 3 ? 0.9 : 1);
      const bottom = H * 0.8;

      // 近景只保留说话者，其余景别全员同框
      let shown = cast;
      if (cam === 'close') {
        const sp = cast.find((c) => c.name === state.speaker) || cast[0];
        shown = sp ? [sp] : [];
      }

      // 按角色固定槽位分到左 / 右两侧：同一角色不会左右乱跳
      const slotOf = (ch) => (Number.isInteger(ch.slot) ? ch.slot : cast.indexOf(ch));
      const groups = { left: [], right: [] };
      shown.forEach((ch) => {
        groups[slotOf(ch) % 2 === 0 ? 'left' : 'right'].push(ch);
      });

      const place = (ch, group, side) => {
        const idx = group.indexOf(ch);
        const speaking = ch.name === state.speaker;
        const dir = side === 'left' ? 1 : -1;
        const baseX = side === 'left' ? W * 0.26 : W * 0.74;
        // 同一侧站两人时，后一位向画面外缘错开、略缩小并压低，
        // 让两张脸错开高度，而不是叠在一起
        const crowd = group.length > 1;
        const offset = W * (crowd ? 0.12 : 0.1);
        drawPortrait(ctx, ch.model, {
          x: baseX - dir * idx * offset,
          bottom: idx === 0 ? bottom : bottom + H * 0.035,
          height: height * (idx === 0 ? 1 : 0.82) * (speaking ? 1.02 : 0.98),
          facing: dir,
          alpha: (cam === 'wide' ? 0.86 : 0.96) * (speaking ? 1 : 0.8) * (idx === 0 ? 1 : 0.92),
          time,
          phase: phaseOf(ch),
          glow: p.glow,
          depth: (cam === 'wide' ? 0.22 : 0) + (idx === 0 ? 0 : 0.22),
          speaking,
        });
      };
      groups.left.forEach((ch) => place(ch, groups.left, 'left'));
      groups.right.forEach((ch) => place(ch, groups.right, 'right'));
    }

    ctx.restore();

    // 胶片颗粒
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = hexA(p.accent, 0.03);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (onFrame) onFrame();
  }

  let last = 0;
  function loop(ts) {
    if (!running) return;
    const now = ts || performance.now();
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    draw(dt);
    rafId = requestAnimationFrame(loop);
  }

  function set(next) {
    const prevScene = state.scene, prevTime = state.time, prevCam = state.cam;
    Object.assign(state, next);
    const enteredDetail = state.cam === 'detail' && prevCam !== 'detail';
    if (state.scene !== prevScene || state.time !== prevTime) {
      layers = null;
      detailProp = 'none';
      detailText = '';
      detailPhotoBoy = false;
    } else if (enteredDetail) {
      detailProp = 'none';
      detailText = '';
      detailPhotoBoy = false;
    }
    if (state.cam === 'detail') {
      const k = pickProp(state.propText || '');
      if (k !== 'none') {
        if (k !== detailProp) detailPhotoBoy = false;
        detailProp = k;
        detailText = state.propText || '';
        // 同一段照片镜头里，只要提到过小男孩 / 旧照片就固定使用真实照片素材
        if (k === 'photo' && /小男孩|小悠真|卷短发|做鬼脸|旧照片|黑白旧照/.test(detailText)) detailPhotoBoy = true;
      } else if (detailProp === 'scroll' && /血|红枫|红叶|卷尾|那抹红/.test(state.propText || '')) {
        detailText = state.propText || '';
      }
    }
  }
  function start() { if (running) return; running = true; last = performance.now(); rafId = requestAnimationFrame(loop); }
  function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  window.addEventListener('resize', resize);
  resize();
  return { set, start, stop, resize, preloadImages: preloadSceneImages, onChange: (fn) => (onFrame = fn), get state() { return state; } };
}

/* ---------- 场景零件 ---------- */
// 香樟：团状树冠 + 深色枝干，用作窗外/操场远景
function drawCamphor(b, x, y, h, color, rim, dirX = 1, dirY = -1) {
  b.save();
  b.strokeStyle = color;
  b.fillStyle = color;
  b.lineCap = 'round';
  b.lineWidth = Math.max(3, h * 0.035);
  b.beginPath();
  b.moveTo(x, y + h * 0.12);
  b.quadraticCurveTo(x + h * 0.04, y + h * 0.55, x - h * 0.01, y + h * 1.15);
  b.stroke();
  b.lineWidth = Math.max(1.5, h * 0.016);
  b.beginPath();
  b.moveTo(x, y + h * 0.3);
  b.quadraticCurveTo(x - h * 0.18, y + h * 0.18, x - h * 0.3, y + h * 0.05);
  b.moveTo(x, y + h * 0.4);
  b.quadraticCurveTo(x + h * 0.2, y + h * 0.26, x + h * 0.32, y + h * 0.12);
  b.stroke();
  // 树冠：先铺一层整体轮廓，再用同等透明度的叶簇叠出边缘
  b.globalAlpha = 0.94;
  b.beginPath();
  b.ellipse(x, y, h * 0.35, h * 0.22, 0, 0, 6.3);
  b.fill();
  const crown = [
    [0, 0, 1.0], [-0.24, 0.05, 0.78], [0.25, 0.03, 0.82], [-0.11, -0.13, 0.7],
    [0.14, -0.11, 0.66], [0, 0.15, 0.74], [-0.31, -0.06, 0.5], [0.32, -0.07, 0.52],
    [0.05, -0.21, 0.44], [-0.05, 0.26, 0.4],
  ];
  b.globalAlpha = 0.9;
  for (let k = 0; k < crown.length; k++) {
    const [dx, dy, s] = crown[k];
    const cxp = x + dx * h, cyp = y + dy * h;
    const r = h * 0.2 * s;
    for (let j = 0; j < 6; j++) {
      const a = rand(0, 6.28), rr = rand(0, 0.55) * r;
      b.beginPath();
      b.ellipse(cxp + Math.cos(a) * rr, cyp + Math.sin(a) * rr * 0.62,
        r * rand(0.45, 0.75), r * rand(0.32, 0.52), rand(-0.6, 0.6), 0, 6.3);
      b.fill();
    }
  }
  // 边缘碎叶，打散圆滑的轮廓
  b.globalAlpha = 0.6;
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * 6.28, rr = rand(0.72, 1.02);
    b.beginPath();
    b.arc(x + Math.cos(a) * rr * h * 0.33, y + Math.sin(a) * rr * h * 0.24,
      Math.max(1, h * rand(0.008, 0.018)), 0, 6.3);
    b.fill();
  }
  // 朝向月光的叶缘：冷色细碎高光，让树冠有体积
  if (rim) {
    const la = Math.atan2(dirY, dirX);
    b.fillStyle = rim;
    for (let i = 0; i < 34; i++) {
      const a = la + rand(-1.4, 1.4);
      const rr = rand(0.74, 0.98);
      const px = x + Math.cos(a) * rr * h * 0.34;
      const py = y + Math.sin(a) * rr * h * 0.225;
      // 只有外缘的碎叶受光，颗粒细小，不形成一圈珠链
      b.globalAlpha = rand(0.10, 0.30) * (1 - Math.abs(a - la) / 2.4);
      b.beginPath();
      b.ellipse(px, py, Math.max(0.7, h * rand(0.004, 0.010)), Math.max(0.5, h * rand(0.002, 0.005)), a, 0, 6.3);
      b.fill();
    }
  }
  b.restore();
}

// 杉树：笔直树干 + 不规则下垂的枝与针叶团（避免机械横条）
function drawCedar(b, x, top, height, color, spread, rim, dirX = 1) {
  b.save();
  b.fillStyle = color;
  b.strokeStyle = color;
  b.lineCap = 'round';
  b.lineJoin = 'round';
  // 树干：下粗上细、略微弯曲
  b.beginPath();
  b.moveTo(x - height * 0.013, top + height);
  b.quadraticCurveTo(x - height * 0.008, top + height * 0.55, x - height * 0.004, top + height * 0.14);
  b.lineTo(x + height * 0.004, top + height * 0.14);
  b.quadraticCurveTo(x + height * 0.008, top + height * 0.55, x + height * 0.013, top + height);
  b.closePath(); b.fill();
  // 树皮高光
  b.strokeStyle = 'rgba(160,142,132,0.09)';
  b.lineWidth = Math.max(1, height * 0.003);
  b.beginPath();
  b.moveTo(x - height * 0.006, top + height * 0.3);
  b.quadraticCurveTo(x - height * 0.004, top + height * 0.6, x - height * 0.002, top + height * 0.92);
  b.stroke();
  // 层叠的杉叶：每层一片带锯齿下缘的叶簇，左右交叠成完整树形
  const levels = 15;
  for (let i = levels - 1; i >= 0; i--) {
    const t = 0.045 + i * 0.062 + rand(-0.008, 0.008);
    const y = top + height * t;
    const reach = height * (0.028 + (1 - t) * 0.105) * spread * rand(0.72, 1.05);
    for (const side of [-1, 1]) {
      if (i < 2 && side > 0) continue;
      // 外层长枝
      const len = reach * rand(0.72, 1.0);
      const droop = height * rand(0.012, 0.024);
      b.beginPath();
      b.moveTo(x + side * height * 0.006, y - height * 0.006);
      b.quadraticCurveTo(x + side * len * 0.42, y - height * 0.002, x + side * len, y + droop);
      const steps = 7;
      for (let k = 1; k <= steps; k++) {
        const u = 1 - k / steps;
        const jag = height * (k % 2 ? 0.011 : 0.004) * rand(0.7, 1.3);
        b.lineTo(x + side * len * u, y + droop * u + jag);
      }
      b.quadraticCurveTo(x + side * len * 0.22, y + height * 0.009, x, y + height * 0.005);
      b.closePath();
      b.fill();
      // 内层短枝，压住空隙让树冠更密
      const len2 = len * rand(0.48, 0.68);
      b.beginPath();
      b.moveTo(x + side * height * 0.005, y + height * rand(-0.008, 0.004));
      b.quadraticCurveTo(x + side * len2 * 0.5, y + height * 0.004, x + side * len2, y + height * rand(0.016, 0.028));
      b.lineTo(x + side * len2 * 0.55, y + height * 0.022);
      b.lineTo(x + side * len2 * 0.3, y + height * 0.016);
      b.lineTo(x + side * len2 * 0.08, y + height * 0.012);
      b.closePath();
      b.fill();
    }
  }
  // 迎月的一侧枝叶：冷色针尖与薄霜，避免整棵树成为一块死黑
  if (rim) {
    const side = dirX >= 0 ? 1 : -1;
    b.fillStyle = rim;
    b.strokeStyle = rim;
    b.lineCap = 'round';
    for (let i = 2; i < levels; i++) {
      const t = 0.045 + i * 0.062;
      const y = top + height * t;
      const reach = height * (0.028 + (1 - t) * 0.105) * spread;
      for (let k = 0; k < 3; k++) {
        const u = 0.52 + k * 0.16 + rand(-0.03, 0.03);
        const px = x + side * reach * u;
        const py = y + height * 0.008 * u;
        b.globalAlpha = rand(0.10, 0.30) * (0.5 + u * 0.5);
        b.beginPath();
        b.ellipse(px, py, Math.max(1, height * rand(0.004, 0.012)), Math.max(0.6, height * rand(0.0022, 0.005)), side * 0.12, 0, 6.3);
        b.fill();
      }
      b.globalAlpha = rand(0.12, 0.26);
      b.lineWidth = Math.max(0.7, height * 0.002);
      b.beginPath();
      b.moveTo(x + side * reach * 0.55, y + height * 0.002);
      b.quadraticCurveTo(x + side * reach * 0.78, y + height * 0.004, x + side * reach * 0.96, y + height * 0.018);
      b.stroke();
    }
  }
  // 边缘细针：从叶簇外沿垂下的短线，打散轮廓
  b.strokeStyle = color;
  b.globalAlpha = 0.55;
  b.lineWidth = Math.max(0.8, height * 0.0022);
  for (let i = 3; i < levels; i += 2) {
    const t = 0.045 + i * 0.062;
    const y = top + height * t;
    const reach = height * (0.028 + (1 - t) * 0.105) * spread * 0.9;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const bx = x + side * reach * (0.5 + k * 0.16);
        b.beginPath();
        b.moveTo(bx, y + height * 0.004);
        b.quadraticCurveTo(bx + side * height * 0.004, y + height * 0.014, bx + side * height * 0.008, y + height * rand(0.02, 0.03));
        b.stroke();
      }
    }
  }
  b.globalAlpha = 1;
  // 树梢：细长的尖
  b.beginPath();
  b.moveTo(x, top - height * 0.012);
  b.quadraticCurveTo(x + height * 0.012, top + height * 0.03, x + height * 0.007, top + height * 0.075);
  b.lineTo(x - height * 0.007, top + height * 0.075);
  b.quadraticCurveTo(x - height * 0.012, top + height * 0.03, x, top - height * 0.012);
  b.closePath(); b.fill();
  b.restore();
}

// 神社切妻顶：两坡屋面、厚檐、正脊与鬼瓦
function shrineRoof(b, x, y, w, h, color, p) {
  const cx = x + w / 2;
  const ridgeY = y + h * 0.06;
  const eaveY = y + h * 0.62;
  // 檐下投影
  b.fillStyle = 'rgba(8,5,10,0.42)';
  b.beginPath();
  b.moveTo(x + w * 0.08, eaveY);
  b.lineTo(x + w * 0.92, eaveY);
  b.lineTo(x + w * 0.86, y + h * 0.9);
  b.lineTo(x + w * 0.14, y + h * 0.9);
  b.closePath(); b.fill();
  // 两坡屋面
  const roofG = b.createLinearGradient(0, ridgeY, 0, eaveY);
  roofG.addColorStop(0, shade(color, 18));
  roofG.addColorStop(0.55, color);
  roofG.addColorStop(1, shade(color, -12));
  b.fillStyle = roofG;
  b.beginPath();
  b.moveTo(x + w * 0.02, eaveY + h * 0.05);
  b.quadraticCurveTo(x + w * 0.06, ridgeY + h * 0.18, x + w * 0.3, ridgeY);
  b.lineTo(x + w * 0.7, ridgeY);
  b.quadraticCurveTo(x + w * 0.94, ridgeY + h * 0.18, x + w * 0.98, eaveY + h * 0.05);
  b.quadraticCurveTo(x + w * 0.9, eaveY - h * 0.01, x + w * 0.82, eaveY + h * 0.01);
  b.lineTo(x + w * 0.18, eaveY + h * 0.01);
  b.quadraticCurveTo(x + w * 0.1, eaveY - h * 0.01, x + w * 0.02, eaveY + h * 0.05);
  b.closePath(); b.fill();
  // 瓦垄：从正脊放射到檐口
  b.save();
  b.beginPath();
  b.moveTo(x + w * 0.02, eaveY + h * 0.05);
  b.quadraticCurveTo(x + w * 0.06, ridgeY + h * 0.18, x + w * 0.3, ridgeY);
  b.lineTo(x + w * 0.7, ridgeY);
  b.quadraticCurveTo(x + w * 0.94, ridgeY + h * 0.18, x + w * 0.98, eaveY + h * 0.05);
  b.lineTo(x + w * 0.98, eaveY);
  b.lineTo(x + w * 0.02, eaveY);
  b.closePath(); b.clip();
  b.strokeStyle = 'rgba(0,0,0,0.22)';
  b.lineWidth = Math.max(1, h * 0.014);
  for (let i = 1; i < 15; i++) {
    const t = i / 15;
    b.beginPath();
    b.moveTo(x + w * (0.3 + t * 0.4), ridgeY);
    b.quadraticCurveTo(x + w * t, ridgeY + h * 0.2, x + w * t, eaveY);
    b.stroke();
  }
  // 瓦面反光
  b.strokeStyle = hexA(p.glow, 0.10);
  b.lineWidth = Math.max(1, h * 0.01);
  for (let i = 2; i < 15; i += 3) {
    b.beginPath();
    b.moveTo(x + w * (0.3 + (i / 15) * 0.4), ridgeY + h * 0.04);
    b.quadraticCurveTo(x + w * ((i + 0.4) / 15), ridgeY + h * 0.24, x + w * ((i + 0.4) / 15), eaveY - h * 0.02);
    b.stroke();
  }
  // 夜间：冷光沿瓦垄起伏，补出屋面层次
  if (!p.warm) {
    b.strokeStyle = 'rgba(150,164,206,0.13)';
    b.lineWidth = Math.max(0.8, h * 0.006);
    for (let i = 1; i < 15; i += 2) {
      const t = i / 15;
      b.beginPath();
      b.moveTo(x + w * (0.3 + t * 0.4), ridgeY + h * 0.03);
      b.quadraticCurveTo(x + w * (t + 0.012), ridgeY + h * 0.22, x + w * (t + 0.012), eaveY - h * 0.03);
      b.stroke();
    }
    // 横向瓦口：三道浅浅的弧线，暗示一层层叠瓦
    b.strokeStyle = 'rgba(176,188,222,0.07)';
    b.lineWidth = Math.max(0.8, h * 0.008);
    for (let row = 1; row <= 3; row++) {
      const yy = ridgeY + h * (0.13 + row * 0.09);
      b.beginPath();
      b.moveTo(x + w * 0.18, yy);
      b.quadraticCurveTo(cx, yy + h * 0.035, x + w * 0.82, yy);
      b.stroke();
    }
  }
  b.restore();
  // 正脊
  b.fillStyle = shade(color, -18);
  b.fillRect(x + w * 0.28, ridgeY - h * 0.06, w * 0.44, h * 0.075);
  b.fillStyle = 'rgba(255,240,214,0.10)';
  b.fillRect(x + w * 0.29, ridgeY - h * 0.06, w * 0.42, 2);
  // 鬼瓦
  for (const side of [-1, 1]) {
    const ex = cx + side * w * 0.5;
    b.strokeStyle = shade(color, -6);
    b.lineWidth = Math.max(3, h * 0.06);
    b.beginPath();
    b.moveTo(ex - side * w * 0.06, ridgeY + h * 0.02);
    b.quadraticCurveTo(ex, ridgeY - h * 0.06, ex + side * w * 0.012, ridgeY - h * 0.14);
    b.stroke();
  }
  // 厚檐口
  b.fillStyle = shade(color, -22);
  b.beginPath();
  b.moveTo(x + w * 0.02, eaveY + h * 0.04);
  b.quadraticCurveTo(x + w * 0.1, eaveY - h * 0.01, x + w * 0.2, eaveY);
  b.lineTo(x + w * 0.8, eaveY);
  b.quadraticCurveTo(x + w * 0.9, eaveY - h * 0.01, x + w * 0.98, eaveY + h * 0.04);
  b.lineTo(x + w * 0.96, eaveY + h * 0.1);
  b.lineTo(x + w * 0.04, eaveY + h * 0.1);
  b.closePath(); b.fill();
  b.fillStyle = 'rgba(255,238,208,0.08)';
  b.fillRect(x + w * 0.06, eaveY + h * 0.04, w * 0.88, 1.5);
}

// 鸟居：朱红木柱、笠木起翘、贯、额束、石基
function drawTorii(b, cx, baseY, width, height, p, night) {
  const half = width / 2;
  const pillarW = width * 0.048;
  const left = cx - half * 0.72, right = cx + half * 0.72;
  const top = baseY - height;
  const vermilion = night ? '#82322f' : '#b24a3e';
  const vermilionLit = night ? '#994039' : '#c8624c';
  const vermilionDark = night ? '#4a1c21' : '#7c2f2c';
  // 石基
  for (const px of [left, right]) {
    b.fillStyle = night ? '#2a2c36' : '#6c6458';
    b.beginPath(); b.ellipse(px, baseY, pillarW * 1.5, pillarW * 0.55, 0, 0, 6.3); b.fill();
    b.fillStyle = night ? 'rgba(64,86,66,0.35)' : 'rgba(88,116,70,0.4)';
    b.beginPath(); b.ellipse(px - pillarW * 0.4, baseY - pillarW * 0.1, pillarW * 0.6, pillarW * 0.25, 0, 0, 6.3); b.fill();
  }
  // 两根柱子
  for (const px of [left, right]) {
    const pg = b.createLinearGradient(px - pillarW / 2, 0, px + pillarW / 2, 0);
    pg.addColorStop(0, vermilionDark);
    pg.addColorStop(0.35, vermilion);
    pg.addColorStop(0.7, vermilionLit);
    pg.addColorStop(1, vermilionDark);
    b.fillStyle = pg;
    b.fillRect(px - pillarW / 2, top + height * 0.06, pillarW, height * 0.94);
    // 木纹与脱漆
    b.save();
    b.beginPath();
    b.rect(px - pillarW / 2, top + height * 0.06, pillarW, height * 0.94);
    b.clip();
    b.strokeStyle = 'rgba(66,26,24,0.35)';
    b.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      b.beginPath();
      b.moveTo(px - pillarW * 0.32 + i * pillarW * 0.16, top + height * 0.08);
      b.lineTo(px - pillarW * 0.32 + i * pillarW * 0.16 + rand(-2, 2), baseY);
      b.stroke();
    }
    for (let i = 0; i < 9; i++) {
      b.fillStyle = `rgba(214,196,168,${rand(0.06, 0.16)})`;
      b.fillRect(px - pillarW * 0.5 + rand(0, pillarW * 0.8), top + rand(0.12, 0.9) * height, rand(2, 7), rand(1, 3));
    }
    // 根部的雨渍、青苔与柱脚阴影，让柱子真正插进石基
    const footG = b.createLinearGradient(0, baseY - height * 0.22, 0, baseY);
    footG.addColorStop(0, 'rgba(24,12,14,0)');
    footG.addColorStop(1, night ? 'rgba(10,8,14,0.55)' : 'rgba(38,18,16,0.42)');
    b.fillStyle = footG;
    b.fillRect(px - pillarW / 2, baseY - height * 0.22, pillarW, height * 0.22);
    b.fillStyle = night ? 'rgba(52,78,58,0.30)' : 'rgba(82,104,62,0.34)';
    for (let i = 0; i < 4; i++) {
      b.beginPath();
      b.ellipse(px + rand(-0.3, 0.3) * pillarW, baseY - rand(0.02, 0.12) * height, pillarW * rand(0.12, 0.24), pillarW * rand(0.18, 0.34), rand(-0.4, 0.4), 0, 6.3);
      b.fill();
    }
    // 背光一侧压暗，保留圆柱体积
    const sh = b.createLinearGradient(px - pillarW / 2, 0, px + pillarW / 2, 0);
    sh.addColorStop(0, 'rgba(12,6,10,0.22)');
    sh.addColorStop(0.55, 'rgba(12,6,10,0)');
    sh.addColorStop(1, 'rgba(12,6,10,0.18)');
    b.fillStyle = sh;
    b.fillRect(px - pillarW / 2, top + height * 0.06, pillarW, height * 0.94);
    b.restore();
  }
  // 顶笠木：两端上翘
  const ky = top + height * 0.04;
  const beamH = height * 0.05;
  b.fillStyle = vermilionDark;
  b.beginPath();
  b.moveTo(cx - half * 1.08, ky + beamH * 0.22);
  b.quadraticCurveTo(cx - half * 0.6, ky - beamH * 0.55, cx, ky - beamH * 0.52);
  b.quadraticCurveTo(cx + half * 0.6, ky - beamH * 0.55, cx + half * 1.08, ky + beamH * 0.22);
  b.lineTo(cx + half * 1.06, ky + beamH * 1.05);
  b.quadraticCurveTo(cx + half * 0.55, ky + beamH * 0.25, cx, ky + beamH * 0.28);
  b.quadraticCurveTo(cx - half * 0.55, ky + beamH * 0.25, cx - half * 1.06, ky + beamH * 1.05);
  b.closePath(); b.fill();
  // 笠木下缘的厚影与迎光面
  b.strokeStyle = night ? 'rgba(38,14,18,0.55)' : 'rgba(72,24,20,0.42)';
  b.lineWidth = Math.max(1.4, beamH * 0.16);
  b.beginPath();
  b.moveTo(cx - half * 1.03, ky + beamH * 0.98);
  b.quadraticCurveTo(cx - half * 0.5, ky + beamH * 0.22, cx, ky + beamH * 0.26);
  b.quadraticCurveTo(cx + half * 0.5, ky + beamH * 0.22, cx + half * 1.03, ky + beamH * 0.98);
  b.stroke();
  b.strokeStyle = night ? 'rgba(196,204,232,0.26)' : 'rgba(255,224,188,0.22)';
  b.lineWidth = 1.2;
  b.beginPath();
  b.moveTo(cx - half * 1.02, ky + beamH * 0.24);
  b.quadraticCurveTo(cx - half * 0.6, ky - beamH * 0.5, cx, ky - beamH * 0.47);
  b.quadraticCurveTo(cx + half * 0.6, ky - beamH * 0.5, cx + half * 1.02, ky + beamH * 0.24);
  b.stroke();
  // 次梁（贯）
  const ny = top + height * 0.2;
  b.fillStyle = vermilion;
  b.fillRect(cx - half * 0.88, ny, half * 1.76, height * 0.035);
  b.fillStyle = 'rgba(255,220,180,0.10)';
  b.fillRect(cx - half * 0.88, ny, half * 1.76, 2);
  b.fillStyle = night ? 'rgba(30,10,14,0.4)' : 'rgba(66,22,18,0.3)';
  b.fillRect(cx - half * 0.88, ny + height * 0.031, half * 1.76, height * 0.006);
  // 额束与匾
  b.fillStyle = vermilionDark;
  b.fillRect(cx - width * 0.035, ky + beamH * 0.5, width * 0.07, height * 0.1);
  b.fillStyle = night ? '#1d1720' : '#3a2a26';
  b.fillRect(cx - width * 0.045, top + height * 0.105, width * 0.09, height * 0.085);
  b.strokeStyle = 'rgba(214,186,132,0.35)';
  b.lineWidth = 1.2;
  b.strokeRect(cx - width * 0.04, top + height * 0.112, width * 0.08, height * 0.071);
  b.fillStyle = 'rgba(214,190,142,0.55)';
  b.font = `600 ${Math.max(8, height * 0.045)}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
  b.textAlign = 'center';
  b.fillText('神 社', cx, top + height * 0.164);
  b.textAlign = 'left';
  // 底部的横木
  const by = top + height * 0.3;
  b.fillStyle = vermilion;
  b.fillRect(cx - half * 0.82, by, half * 1.64, height * 0.026);
  b.fillStyle = 'rgba(255,220,180,0.10)';
  b.fillRect(cx - half * 0.82, by, half * 1.64, 2);
}

// 石灯笼
function drawStoneLantern(b, x, baseY, h, p, night) {
  const w = h * 0.46;
  b.save();
  b.fillStyle = night ? '#2c2e3a' : 'rgba(104,98,86,0.92)';
  // 基座
  b.beginPath();
  b.moveTo(x - w * 0.5, baseY);
  b.lineTo(x + w * 0.5, baseY);
  b.lineTo(x + w * 0.38, baseY - h * 0.10);
  b.lineTo(x - w * 0.38, baseY - h * 0.10);
  b.closePath(); b.fill();
  // 柱身
  b.fillRect(x - w * 0.16, baseY - h * 0.48, w * 0.32, h * 0.4);
  // 中台
  b.beginPath();
  b.moveTo(x - w * 0.4, baseY - h * 0.48);
  b.lineTo(x + w * 0.4, baseY - h * 0.48);
  b.lineTo(x + w * 0.28, baseY - h * 0.56);
  b.lineTo(x - w * 0.28, baseY - h * 0.56);
  b.closePath(); b.fill();
  // 火袋
  b.fillRect(x - w * 0.34, baseY - h * 0.76, w * 0.68, h * 0.2);
  // 火窗
  const glowA = night ? 0.9 : 0.28;
  b.fillStyle = `rgba(255,206,132,${glowA})`;
  b.fillRect(x - w * 0.22, baseY - h * 0.73, w * 0.44, h * 0.14);
  if (night) {
    const g = b.createRadialGradient(x, baseY - h * 0.66, 0, x, baseY - h * 0.66, h * 0.5);
    g.addColorStop(0, 'rgba(255,204,130,0.34)');
    g.addColorStop(1, 'rgba(255,190,110,0)');
    b.save();
    b.globalCompositeOperation = 'lighter';
    b.fillStyle = g;
    b.beginPath(); b.arc(x, baseY - h * 0.66, h * 0.5, 0, 6.3); b.fill();
    b.restore();
  }
  // 笠
  b.fillStyle = night ? '#252836' : 'rgba(92,86,74,0.95)';
  b.beginPath();
  b.moveTo(x - w * 0.56, baseY - h * 0.76);
  b.quadraticCurveTo(x, baseY - h * 0.92, x + w * 0.56, baseY - h * 0.76);
  b.quadraticCurveTo(x + w * 0.34, baseY - h * 0.68, x, baseY - h * 0.7);
  b.quadraticCurveTo(x - w * 0.34, baseY - h * 0.68, x - w * 0.56, baseY - h * 0.76);
  b.closePath(); b.fill();
  // 宝珠
  b.beginPath(); b.arc(x, baseY - h * 0.96, w * 0.1, 0, 6.3); b.fill();
  // 苔
  b.fillStyle = night ? 'rgba(52,78,58,0.22)' : 'rgba(96,120,74,0.28)';
  b.beginPath(); b.ellipse(x - w * 0.3, baseY - h * 0.08, w * 0.22, h * 0.03, 0, 0, 6.3); b.fill();
  b.beginPath(); b.ellipse(x + w * 0.2, baseY - h * 0.5, w * 0.12, h * 0.02, 0, 0, 6.3); b.fill();
  b.restore();
}

/* ---------- 色彩工具 ---------- */
// 宫苑歇山顶：正脊、两坡瓦面、厚檐、翘角与檐下斗拱
function palaceRoof(b, x, y, w, h, color, p) {
  const eaveY = y + h * 0.76;
  const ridgeY = y + h * 0.1;
  const ridgeL = x + w * 0.22, ridgeR = x + w * 0.78;
  // 檐下阴影
  b.fillStyle = 'rgba(10,6,10,0.34)';
  b.beginPath();
  b.moveTo(x + w * 0.03, eaveY);
  b.lineTo(x + w * 0.97, eaveY);
  b.lineTo(x + w * 0.91, eaveY + h * 0.17);
  b.lineTo(x + w * 0.09, eaveY + h * 0.17);
  b.closePath(); b.fill();
  // 瓦面
  const roofG = b.createLinearGradient(0, ridgeY, 0, eaveY);
  roofG.addColorStop(0, shade(color, 24));
  roofG.addColorStop(0.55, color);
  roofG.addColorStop(1, shade(color, -16));
  b.fillStyle = roofG;
  b.beginPath();
  b.moveTo(x + w * 0.005, eaveY);
  b.quadraticCurveTo(x + w * 0.06, y + h * 0.36, ridgeL, ridgeY);
  b.lineTo(ridgeR, ridgeY);
  b.quadraticCurveTo(x + w * 0.94, y + h * 0.36, x + w * 0.995, eaveY);
  b.quadraticCurveTo(x + w * 0.9, eaveY - h * 0.06, x + w * 0.82, eaveY - h * 0.02);
  b.lineTo(x + w * 0.18, eaveY - h * 0.02);
  b.quadraticCurveTo(x + w * 0.1, eaveY - h * 0.06, x + w * 0.005, eaveY);
  b.closePath(); b.fill();
  // 瓦垄
  b.save();
  b.beginPath();
  b.moveTo(x + w * 0.005, eaveY);
  b.quadraticCurveTo(x + w * 0.06, y + h * 0.36, ridgeL, ridgeY);
  b.lineTo(ridgeR, ridgeY);
  b.quadraticCurveTo(x + w * 0.94, y + h * 0.36, x + w * 0.995, eaveY);
  b.lineTo(x + w * 0.99, eaveY - h * 0.01);
  b.lineTo(x + w * 0.01, eaveY - h * 0.01);
  b.closePath(); b.clip();
  b.strokeStyle = 'rgba(0,0,0,0.20)';
  b.lineWidth = Math.max(1, h * 0.012);
  for (let i = 1; i < 19; i++) {
    const t = i / 19;
    b.beginPath();
    b.moveTo(ridgeL + (ridgeR - ridgeL) * t, ridgeY + h * 0.02);
    b.quadraticCurveTo(x + w * (0.5 + (t - 0.5) * 0.75), y + h * 0.45, x + w * t, eaveY);
    b.stroke();
  }
  b.restore();
  // 正脊与鸱吻
  b.fillStyle = shade(color, -20);
  b.fillRect(ridgeL - w * 0.01, ridgeY - h * 0.075, ridgeR - ridgeL + w * 0.02, h * 0.085);
  b.fillStyle = hexA(p.glow, 0.14);
  b.fillRect(ridgeL - w * 0.01, ridgeY - h * 0.075, ridgeR - ridgeL + w * 0.02, 1.5);
  b.strokeStyle = shade(color, -6);
  b.lineWidth = Math.max(2, h * 0.045);
  for (const side of [-1, 1]) {
    const ex = side < 0 ? ridgeL - w * 0.01 : ridgeR + w * 0.01;
    b.beginPath();
    b.moveTo(ex - side * w * 0.008, ridgeY + h * 0.01);
    b.quadraticCurveTo(ex + side * w * 0.006, ridgeY - h * 0.12, ex + side * w * 0.022, ridgeY - h * 0.19);
    b.stroke();
  }
  // 厚檐口
  b.fillStyle = shade(color, -24);
  b.beginPath();
  b.moveTo(x + w * 0.005, eaveY);
  b.quadraticCurveTo(x + w * 0.09, eaveY - h * 0.06, x + w * 0.2, eaveY - h * 0.02);
  b.lineTo(x + w * 0.8, eaveY - h * 0.02);
  b.quadraticCurveTo(x + w * 0.91, eaveY - h * 0.06, x + w * 0.995, eaveY);
  b.lineTo(x + w * 0.985, eaveY + h * 0.07);
  b.lineTo(x + w * 0.015, eaveY + h * 0.07);
  b.closePath(); b.fill();
  // 翘角
  b.strokeStyle = shade(color, -12);
  b.lineWidth = Math.max(2.5, h * 0.06);
  b.beginPath();
  b.moveTo(x + w * 0.02, eaveY + h * 0.02);
  b.quadraticCurveTo(x - w * 0.022, eaveY - h * 0.08, x - w * 0.035, eaveY - h * 0.19);
  b.moveTo(x + w * 0.98, eaveY + h * 0.02);
  b.quadraticCurveTo(x + w * 1.022, eaveY - h * 0.08, x + w * 1.035, eaveY - h * 0.19);
  b.stroke();
  // 檐下斗拱
  const bracketN = 9;
  for (let i = 0; i < bracketN; i++) {
    const bx = x + w * (0.08 + (i / (bracketN - 1)) * 0.84);
    const by = eaveY + h * 0.055;
    b.fillStyle = 'rgba(196,86,54,0.5)';
    b.fillRect(bx - w * 0.008, by, w * 0.016, h * 0.05);
    b.fillStyle = 'rgba(226,178,106,0.4)';
    b.fillRect(bx - w * 0.012, by + h * 0.012, w * 0.024, h * 0.012);
  }
}

function drawWillow(b, x, top, height, color) {
  b.save();
  b.strokeStyle = color;
  b.fillStyle = color;
  b.lineCap = 'round';
  const baseY = top + height * 0.99;
  const crownY = top + height * 0.30;
  // 主干与树皮
  b.lineWidth = Math.max(3, height * 0.018);
  b.beginPath();
  b.moveTo(x, baseY);
  b.quadraticCurveTo(x - height * 0.035, top + height * 0.6, x + height * 0.008, crownY);
  b.stroke();
  b.lineWidth = Math.max(1, height * 0.004);
  b.globalAlpha = 0.5;
  for (let i = 0; i < 4; i++) {
    const ty = top + height * (0.42 + i * 0.13);
    b.beginPath();
    b.moveTo(x + height * 0.006, ty);
    b.quadraticCurveTo(x - height * 0.012, ty + height * 0.02, x + height * 0.004, ty + height * 0.045);
    b.stroke();
  }
  b.globalAlpha = 1;
  // 分枝
  const tips = [];
  for (let i = 0; i < 6; i++) {
    const p = i / 5 - 0.5;
    const ex = x + p * height * 0.5 + rand(-height * 0.02, height * 0.02);
    const ey = top + height * (0.16 + Math.abs(p) * 0.06 + rand(-0.02, 0.02));
    b.lineWidth = Math.max(1.4, height * 0.0065);
    b.beginPath();
    b.moveTo(x + height * 0.004, crownY + height * 0.02);
    b.quadraticCurveTo(x + p * height * 0.2, top + height * 0.22, ex, ey);
    b.stroke();
    tips.push({ x: ex, y: ey, p });
  }
  // 冠层：柔团 + 叶簇
  for (const t of tips) {
    b.globalAlpha = 0.16;
    b.beginPath();
    b.ellipse(t.x, t.y + height * 0.03, height * 0.1, height * 0.05, 0, 0, 6.3);
    b.fill();
    b.globalAlpha = 0.58;
    for (let k = 0; k < 24; k++) {
      const ang = rand(0, 6.28), rr = height * rand(0.012, 0.095);
      b.beginPath();
      b.ellipse(t.x + Math.cos(ang) * rr, t.y + Math.sin(ang) * rr * 0.5 + height * 0.02,
        height * 0.0115, height * 0.0048, rand(-1, 1), 0, 6.3);
      b.fill();
    }
  }
  // 垂枝：由冠层均匀垂下
  for (let i = 0; i < 28; i++) {
    const p = i / 27 - 0.5;
    const bx = x + p * height * 0.48 + rand(-height * 0.012, height * 0.012);
    const by = top + height * (0.18 + Math.abs(p) * 0.05 + rand(0, 0.06));
    const len = height * (0.36 + rand(0, 0.26)) * (1 - Math.abs(p) * 0.18);
    const drift = p * height * 0.06 + rand(-height * 0.012, height * 0.012);
    const wave = (i % 3 - 1) * height * 0.014;
    b.globalAlpha = 0.62;
    b.lineWidth = Math.max(0.6, height * 0.0024);
    b.beginPath();
    b.moveTo(bx, by);
    b.bezierCurveTo(bx + wave, by + len * 0.3, bx - wave + drift * 0.5, by + len * 0.68, bx + drift, by + len);
    b.stroke();
    for (let k = 1; k <= 14; k++) {
      const tt = k / 14;
      const lx = bx + drift * tt + wave * Math.sin(tt * 3.1);
      const ly = by + len * tt;
      if (ly > top + height) break;
      b.globalAlpha = 0.5 + 0.16 * Math.sin(k * 1.9 + i);
      b.beginPath();
      b.ellipse(lx, ly, height * 0.0105, height * 0.0042, -0.6, 0, 6.3);
      b.fill();
      b.beginPath();
      b.ellipse(lx + height * 0.006, ly + height * 0.007, height * 0.0085, height * 0.0036, 0.35, 0, 6.3);
      b.fill();
      b.beginPath();
      b.ellipse(lx - height * 0.005, ly + height * 0.012, height * 0.0065, height * 0.003, 0.9, 0, 6.3);
      b.fill();
    }
  }
  b.restore();
}

// 把一张插画按 cover 方式铺进指定矩形，保留焦点，不拉伸变形
function drawCover(b, img, dx, dy, dw, dh, fx = 0.5, fy = 0.5, alpha = 1) {
  if (!img || !img.naturalWidth) return false;
  const ir = img.naturalWidth / img.naturalHeight;
  const dr = dw / dh;
  let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
  if (ir > dr) { sw = img.naturalHeight * dr; sx = (img.naturalWidth - sw) * fx; }
  else { sh = img.naturalWidth / dr; sy = (img.naturalHeight - sh) * fy; }
  b.save();
  b.globalAlpha = alpha;
  b.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  b.restore();
  return true;
}

// 法国梧桐：斑驳的浅色树皮、层叠的掌状叶团与垂下的球果
function drawPlaneTree(b, x, baseY, height, trunk, leaf, rim, dirX = 1, dirY = -1) {
  b.save();
  b.lineCap = 'round';
  // 树干：略向一侧倾斜，下粗上细
  const topY = baseY - height;
  b.fillStyle = trunk;
  b.beginPath();
  b.moveTo(x - height * 0.035, baseY);
  b.quadraticCurveTo(x - height * 0.012, baseY - height * 0.34, x + dirX * height * 0.006, topY + height * 0.30);
  b.lineTo(x + dirX * height * 0.030, topY + height * 0.32);
  b.quadraticCurveTo(x + height * 0.020, baseY - height * 0.30, x + height * 0.038, baseY);
  b.closePath(); b.fill();
  // 树皮：横向剥落的浅色斑块
  b.save();
  b.beginPath();
  b.moveTo(x - height * 0.035, baseY);
  b.quadraticCurveTo(x - height * 0.012, baseY - height * 0.34, x + dirX * height * 0.006, topY + height * 0.30);
  b.lineTo(x + dirX * height * 0.030, topY + height * 0.32);
  b.quadraticCurveTo(x + height * 0.020, baseY - height * 0.30, x + height * 0.038, baseY);
  b.closePath(); b.clip();
  for (let i = 0; i < 26; i++) {
    const yy = baseY - height * rand(0.02, 0.70);
    const ww = height * rand(0.006, 0.022);
    b.fillStyle = `rgba(214,206,186,${rand(0.05, 0.18)})`;
    b.beginPath();
    b.ellipse(x + rand(-0.03, 0.03) * height, yy, ww, ww * rand(0.3, 0.6), rand(-0.3, 0.3), 0, 6.3);
    b.fill();
  }
  b.restore();
  // 主枝
  b.strokeStyle = trunk;
  const limbs = [
    [-0.30, 0.34, -0.20], [0.28, 0.40, 0.18], [-0.14, 0.26, -0.36],
    [0.10, 0.22, 0.34], [0.0, 0.16, -0.02],
  ];
  for (const [ex, ey, bend] of limbs) {
    b.lineWidth = Math.max(1.4, height * 0.008);
    b.beginPath();
    b.moveTo(x + dirX * height * 0.006, topY + height * 0.32);
    b.quadraticCurveTo(
      x + bend * height * 0.5, topY + height * (0.34 + ey * 0.3),
      x + ex * height, topY + height * ey,
    );
    b.stroke();
  }
  // 冠层：用大量细碎叶片堆出体积，避免整团色斑
  const clusters = [
    [-0.29, 0.28, 0.115], [-0.12, 0.17, 0.135], [0.06, 0.15, 0.130],
    [0.24, 0.21, 0.120], [0.35, 0.31, 0.095], [-0.38, 0.33, 0.095],
    [-0.20, 0.36, 0.110], [0.00, 0.33, 0.105], [0.18, 0.37, 0.105],
    [0.01, 0.04, 0.095], [-0.33, 0.16, 0.085], [0.30, 0.10, 0.080],
  ];
  const leafLite = /^#/.test(leaf) ? shade(leaf, 18) : leaf;
  const leafDeep = /^#/.test(leaf) ? shade(leaf, -24) : leaf;
  // 极淡的底色只负责封住空隙，不形成圆盘
  for (const [cxr, cyr, cr] of clusters) {
    const cx = x + cxr * height, cy = topY + cyr * height, r = cr * height;
    b.fillStyle = leaf;
    b.globalAlpha = 0.10;
    b.beginPath();
    b.ellipse(cx, cy, r * 0.90, r * 0.66, 0, 0, 6.3);
    b.fill();
  }
  // 碎叶：每个叶团 70 片，小、密、彼此交叠
  for (let cl = 0; cl < clusters.length; cl++) {
    const [cxr, cyr, cr] = clusters[cl];
    const cx = x + cxr * height, cy = topY + cyr * height, r = cr * height;
    for (let k = 0; k < 70; k++) {
      const a = rand(0, 6.28), rr = Math.pow(Math.random(), 0.62) * r;
      const px = cx + Math.cos(a) * rr * 1.05;
      const py = cy + Math.sin(a) * rr * 0.72;
      const lw = r * rand(0.070, 0.150);
      // 向阳面亮、背光面暗，靠颜色而非透明度做体积
      const v = (px - cx) * dirX + (py - cy) * dirY * -0.6;
      b.globalAlpha = rand(0.38, 0.68);
      b.fillStyle = v > r * 0.20 ? leafLite : v < -r * 0.22 ? leafDeep : leaf;
      b.beginPath();
      b.ellipse(px, py, lw, lw * rand(0.34, 0.55), rand(-1, 1), 0, 6.3);
      b.fill();
    }
    // 叶团下缘的暗部，不超过三成
    b.globalAlpha = 0.13;
    b.fillStyle = 'rgba(0,0,0,0.65)';
    b.beginPath();
    b.ellipse(cx - r * 0.12, cy + r * 0.34, r * 0.62, r * 0.28, 0.18, 0, 6.3);
    b.fill();
  }
  // 冠层中隐约的细枝
  b.globalAlpha = 0.55;
  b.strokeStyle = trunk;
  b.lineWidth = Math.max(0.8, height * 0.0028);
  for (let i = 0; i < 9; i++) {
    const a = rand(-2.6, -0.5);
    const rr = height * rand(0.10, 0.22);
    b.beginPath();
    b.moveTo(x, topY + height * 0.30);
    b.quadraticCurveTo(x + Math.cos(a) * rr * 0.5, topY + height * 0.24 + Math.sin(a) * rr * 0.3,
      x + Math.cos(a) * rr, topY + height * 0.20 + Math.sin(a) * rr);
    b.stroke();
  }
  // 冠缘碎叶
  b.globalAlpha = 0.50;
  b.fillStyle = leaf;
  for (let i = 0; i < 80; i++) {
    const a = rand(0, 6.28), rr = rand(0.82, 1.14);
    const px = x + Math.cos(a) * height * 0.30 * rr;
    const py = topY + height * 0.21 + Math.sin(a) * height * 0.155 * rr;
    b.beginPath();
    b.ellipse(px, py, height * rand(0.005, 0.012), height * rand(0.003, 0.007), a, 0, 6.3);
    b.fill();
  }
  // 受光叶缘
  if (rim) {
    const la = Math.atan2(dirY, dirX);
    b.fillStyle = rim;
    for (let i = 0; i < 52; i++) {
      const a = la + rand(-1.15, 1.15);
      const rr = rand(0.70, 1.06);
      b.globalAlpha = rand(0.10, 0.26) * (1 - Math.abs(a - la) / 2.6);
      b.beginPath();
      b.ellipse(x + Math.cos(a) * height * 0.30 * rr, topY + height * 0.21 + Math.sin(a) * height * 0.155 * rr,
        height * rand(0.004, 0.010), height * rand(0.002, 0.005), a, 0, 6.3);
      b.fill();
    }
  }
  // 球果：细梗垂在叶下
  b.globalAlpha = 1;
  b.strokeStyle = trunk;
  for (let i = 0; i < 5; i++) {
    const sx = x + (i / 4 - 0.5) * height * 0.54 + rand(-height * 0.02, height * 0.02);
    const sy = topY + height * rand(0.30, 0.42);
    const len = height * rand(0.06, 0.12);
    b.lineWidth = Math.max(0.8, height * 0.0022);
    b.beginPath();
    b.moveTo(sx, sy);
    b.quadraticCurveTo(sx + height * 0.01, sy + len * 0.6, sx, sy + len);
    b.stroke();
    b.fillStyle = leaf;
    b.beginPath();
    b.arc(sx, sy + len, height * 0.0075, 0, 6.3);
    b.fill();
  }
  b.restore();
}

// 爬藤：沿墙面生长的细密藤蔓与叶片
function drawIvy(b, x, y, w, h, color, rim, density = 1) {
  b.save();
  b.lineCap = 'round';
  const vines = Math.max(3, Math.round(7 * density));
  for (let i = 0; i < vines; i++) {
    const sx = x + rand(-0.04, 0.96) * w;
    const sy = y + rand(0, h * 0.16);
    const len = h * rand(0.42, 1.02);
    const drift = rand(-w * 0.10, w * 0.10);
    // 主藤
    b.strokeStyle = color;
    b.globalAlpha = rand(0.55, 0.85);
    b.lineWidth = Math.max(0.7, h * rand(0.0022, 0.0040));
    b.beginPath();
    b.moveTo(sx, sy);
    b.bezierCurveTo(sx + drift, sy + len * 0.35, sx - drift * 0.7, sy + len * 0.70, sx + drift * 0.45, sy + len);
    b.stroke();
    // 侧枝与叶片
    let px = sx, py = sy;
    for (let k = 1; k <= 22; k++) {
      const t = k / 22;
      const nx = sx + drift * t * Math.sin(t * 3.4);
      const ny = sy + len * t;
      // 短侧枝
      const dir = k % 2 ? 1 : -1;
      const reach = h * rand(0.010, 0.028);
      const ex = nx + dir * reach, ey = ny + reach * rand(-0.2, 0.5);
      b.strokeStyle = color;
      b.globalAlpha = rand(0.45, 0.72);
      b.lineWidth = Math.max(0.55, h * 0.0018);
      b.beginPath();
      b.moveTo(px, py);
      b.quadraticCurveTo((px + nx) * 0.5, (py + ny) * 0.5 - reach * 0.25, ex, ey);
      b.stroke();
      // 心形叶：两段弧 + 中脉
      const lw = h * rand(0.0055, 0.0115) * (0.8 + density * 0.2);
      const la = rand(-0.7, 0.7) + (dir > 0 ? 0.5 : -0.5);
      b.save();
      b.translate(ex, ey);
      b.rotate(la);
      b.globalAlpha = rand(0.42, 0.86);
      b.fillStyle = (k % 5 === 0) ? (rim || color) : color;
      b.beginPath();
      b.moveTo(0, lw * 0.55);
      b.quadraticCurveTo(lw * 0.95, lw * 0.15, lw * 0.55, -lw * 0.55);
      b.quadraticCurveTo(lw * 0.18, -lw * 0.95, 0, -lw * 0.45);
      b.quadraticCurveTo(-lw * 0.18, -lw * 0.95, -lw * 0.55, -lw * 0.55);
      b.quadraticCurveTo(-lw * 0.95, lw * 0.15, 0, lw * 0.55);
      b.fill();
      // 叶脉
      b.strokeStyle = 'rgba(255,246,220,0.10)';
      b.lineWidth = 0.6;
      b.beginPath();
      b.moveTo(0, lw * 0.45);
      b.lineTo(0, -lw * 0.45);
      b.stroke();
      b.restore();
      px = nx; py = ny;
    }
  }
  // 高光叶：只在受光面点缀
  if (rim) {
    for (let i = 0; i < 40 * density; i++) {
      const lx = x + rand(0, w);
      const ly = y + rand(0, h * 0.80);
      const lw = Math.max(1.0, h * rand(0.004, 0.009));
      b.globalAlpha = rand(0.10, 0.30);
      b.fillStyle = rim;
      b.beginPath();
      b.ellipse(lx, ly, lw, lw * 0.58, rand(-1.2, 1.2), 0, 6.3);
      b.fill();
    }
  }
  b.restore();
}

function drawVignette(ctx, W, H) {
  const cx = W * 0.5, cy = H * 0.44;
  const g = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.18, cx, cy, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(8,5,16,0)');
  g.addColorStop(1, 'rgba(8,5,16,0.62)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function shade(hex, amt) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, v + amt)));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
