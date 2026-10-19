// sprites.js — 程式生成的像素圖（ccline-27）
// 所有圖都在 offscreen canvas 生成並快取，不使用外部圖檔。
(function () {
  'use strict';

  const cache = new Map();
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ---------- 顏色工具 ----------
  const _pc = mk(1, 1).getContext('2d');
  function rgb(color) {
    _pc.fillStyle = '#000'; _pc.fillStyle = color;
    const s = _pc.fillStyle;
    if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const m = s.match(/\d+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
  }
  const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t));
  const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const dither = (x, y, t) => t * 16 > BAYER[y & 3][x & 3] + 0.5;

  // 以字元陣列 + 調色盤繪圖
  function fromRows(rows, pal) {
    const c = mk(rows[0].length, rows.length), g = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); }
    }));
    return c;
  }

  // ---------- 史萊姆 ----------
  // frame: 0=站立 1=壓扁 2=拉長；blink: 閉眼
  // 0 站立 1 壓扁 2 拉長 3/4 呼吸 5 滯空 6 落地重壓
  const FRAME_SCALE = [[1, 1], [1.14, 0.84], [0.9, 1.12], [1.03, 0.97], [1.06, 0.94], [0.95, 1.06], [1.2, 0.78]];
  const ACC_TOP = 12; // 預留給配件的上方空間

  function slimeSize(tier) { const w = 14 + (tier - 1) * 3; return { w, h: Math.round(w * 0.78) }; }

  // ms：已達成的等級里程碑數（0-4），外觀逐級加料：變大、蝴蝶結、外發光、金色描邊
  // blink：0 睜眼、1 閉眼、2 開心（^^）；rim：{dir:'l'|'r'|'t', col:[r,g,b]} 主光方向的邊緣光
  function slimeCanvas(type, frame, blink, ms = 0, rim = null) {
    const key = `s|${type.id}|${frame}|${blink | 0}|${ms}|${rim ? rim.dir + rim.col.join(',') : ''}`;
    let c = cache.get(key); if (c) return c;
    const tier = Math.max(1, Math.min(8, type.tier || 1));
    const OV = BODY_OV[type.id];
    const pal = (OV && OV.palette) || type.palette || {};
    const body = rgb(pal.body || '#6fd36b'), shade = rgb(pal.shade || '#3d9a46'),
      light = rgb(pal.light || '#c4f5a8'), eye = rgb(pal.eye || '#1b1b2a');
    const line = OV && OV.line ? rgb(OV.line) : ms >= 4 ? [176, 110, 16] : mix(shade, [20, 12, 24], 0.55);
    // UR 體型最大：在 tier 尺寸上再 +4
    const sz = slimeSize(tier), bw = sz.w + ms + ({ UR: 4, LR: 7 }[type.rarity] || 0), bh = Math.round(bw * 0.78);
    const [sx, sy] = FRAME_SCALE[frame] || FRAME_SCALE[0];
    const padX = (DECO_PAD[type.id] || 0), W = bw + 12 + padX * 2, H = bh + ACC_TOP + 6;
    c = mk(W, H); const g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const put = (x, y, col, a = 255) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a;
    };

    const rx = bw / 2 * sx, ryT = bh * 0.68 * sy, ryB = bh * 0.32 * sy;
    const cx = W / 2, base = H - 3, cy = base - ryB;
    const inside = (x, y) => {
      const dx = (x + 0.5 - cx) / rx, dy0 = y + 0.5 - cy;
      const dy = dy0 < 0 ? dy0 / ryT : dy0 / ryB;
      // 底部稍平
      return dx * dx + Math.pow(Math.abs(dy), dy0 < 0 ? 2 : 3.2) <= 1;
    };
    const mask = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = inside(x, y);
    const m = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!m(x, y)) continue;
      const edge = !m(x - 1, y) || !m(x + 1, y) || !m(x, y - 1) || !m(x, y + 1);
      if (edge) { put(x, y, line); continue; }
      const nx = (x + 0.5 - cx) / rx, dy0 = y + 0.5 - cy, ny = dy0 < 0 ? dy0 / ryT : dy0 / ryB;
      // 左上光源
      const lit = -nx * 0.55 - ny * 0.75 + 0.1;
      let col = body;
      if (lit > 0.55) col = dither(x, y, Math.min(1, (lit - 0.55) * 3.5)) ? light : mix(body, light, 0.45);
      else if (lit < -0.2) col = dither(x, y, Math.min(1, (-0.2 - lit) * 2.8)) ? shade : mix(body, shade, 0.4);
      // 底部反光
      if (ny > 0.55 && !m(x, y + 2)) col = mix(shade, light, 0.25);
      // tier 6+：身體裡閃著星點
      if (tier >= 6 && !(OV && OV.noStars) && ((x * 7 + y * 13) % 23 === 0)) col = [255, 255, 255];
      if (OV && OV.shade) col = OV.shade(x, y, nx, ny, col);
      put(x, y, col, 235);
    }
    if (OV && OV.post) OV.post(put, m, cx, cy, rx, ryT, ryB);
    // 邊緣光：主光那一側、緊貼描邊的內側像素提亮
    if (rim) {
      const [dx, dy] = rim.dir === 'l' ? [-1, 0] : rim.dir === 'r' ? [1, 0] : [0, -1];
      const isEdge = (x, y) => m(x, y) && (!m(x - 1, y) || !m(x + 1, y) || !m(x, y - 1) || !m(x, y + 1));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!m(x, y) || isEdge(x, y)) continue;
        if (!isEdge(x + dx, y + dy)) continue;
        if (rim.dir !== 't' && y > cy + ryB * 0.3) continue;
        const i = (y * W + x) * 4; put(x, y, mix([d[i], d[i + 1], d[i + 2]], rim.col, 0.6));
      }
    }
    // 里程碑 3+：外發光
    if (ms >= 3) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (m(x, y)) continue;
      if (m(x - 1, y) || m(x + 1, y) || m(x, y - 1) || m(x, y + 1)) put(x, y, ms >= 4 ? [255, 226, 110] : light, 120);
    }
    // 高光
    const hx = Math.round(cx - rx * 0.45), hy = Math.round(cy - ryT * 0.55);
    [[0, 0], [1, 0], [0, 1], [2, -1 + (tier > 2 ? 0 : 1)]].forEach(([ox, oy]) => m(hx + ox, hy + oy) && put(hx + ox, hy + oy, [255, 255, 255]));
    if (m(hx + 3, hy + 3)) put(hx + 3, hy + 3, [255, 255, 255], 180);

    // 眼睛
    const ey = Math.round(cy - ryT * 0.12), gap = Math.max(3, Math.round(rx * 0.42));
    const eh = tier >= 3 ? 4 : 3;
    for (const s of [-1, 1]) {
      const ex = Math.round(cx + s * gap - (s > 0 ? 2 : 0));
      if (blink === 2) { put(ex - 1, ey + 1, eye); put(ex, ey, eye); put(ex + 1, ey, eye); put(ex + 2, ey + 1, eye); continue; }
      if (blink) { put(ex, ey + 1, eye); put(ex + 1, ey + 1, eye); continue; }
      for (let yy = 0; yy < eh; yy++) for (let xx = 0; xx < 2; xx++) put(ex + xx, ey - 1 + yy, eye);
      put(ex, ey - 1, [255, 255, 255]);
      // 腮紅
      const blush = mix(body, [255, 120, 150], 0.6);
      put(ex + (s < 0 ? -2 : 3), ey + eh - 1, blush); put(ex + (s < 0 ? -1 : 2), ey + eh, blush, 180);
    }
    // 嘴
    put(Math.round(cx) - 1, ey + eh, eye); put(Math.round(cx), ey + eh + 1, eye); put(Math.round(cx) + 1, ey + eh, eye);
    g.putImageData(img, 0, 0);

    // 配件
    const top = Math.round(cy - ryT);
    // 星輝扭蛋的高階種類：用專屬飾品取代通用的 tier 配件
    if (DECO[type.id]) DECO[type.id](g, Math.round(cx), top, rx, cy);
    else drawAccessory(g, tier, Math.round(cx), top, rx);
    if (ms >= 2) g.drawImage(acc('bow'), Math.round(cx + rx * 0.35), top + 1);
    cache.set(key, c);
    return c;
  }

  const ACC = {
    sprout: { rows: ['..gg.', '.gGg.', '..s..', '..s..'], pal: { g: '#4caf3f', G: '#9be36b', s: '#3a7a2a' } },
    crown: { rows: ['y.y.y', 'yYyYy', 'yrYby', 'ddddd'], pal: { y: '#ffd23f', Y: '#fff1a0', d: '#b5791f', r: '#e0533d', b: '#5aa6e8' } },
    wing: { rows: ['..ww', '.wWw', 'wWWw', 'wWw.', 'ww..'], pal: { w: '#cfd8ee', W: '#ffffff' } },
    halo: { rows: ['.yyyyy.', 'y.....y', '.yyyyy.'], pal: { y: '#ffe36a' } },
    bow: { rows: ['p...p', 'pPdPp', 'p...p'], pal: { p: '#ff5c8a', P: '#ffb0c8', d: '#b23d6b' } },
    gem: { rows: ['.w.', 'wcw', '.w.'], pal: { w: '#ffffff', c: '#7ae8ff' } },
  };
  for (const k in ACC) ACC[k].c = null;
  const acc = k => ACC[k].c || (ACC[k].c = fromRows(ACC[k].rows, ACC[k].pal));

  // ---------- UR 本體改造：專屬配色、描邊與身體花紋 ----------
  const BODY_OV = {
    // 熾天使：淡金（避免在泛光下變成白色團塊）
    seraph: { palette: { body: '#d2b070', shade: '#8a6428', light: '#e6cc94', eye: '#2a1a08' }, line: '#5a3a10', noStars: true },
    // 冥夜：暗夜藍紫星雲
    nocturne: {
      palette: { body: '#241a4a', shade: '#0e0a22', light: '#6a5ab8', eye: '#c8b8ff' }, line: '#8a7ad8', noStars: true,
      shade(x, y, nx, ny, col) {
        const n = Math.sin(x * 0.4 - y * 0.5) + Math.sin(x * 0.21 + y * 0.33 + 2);
        if (n > 1.2) col = mix(col, [120, 70, 190], 0.5);
        if ((x * 11 + y * 17) % 37 === 0) col = [220, 210, 255];
        return col;
      },
    },
    // 原初龍：赤紅鱗紋
    primordial: {
      palette: { body: '#b82a20', shade: '#5a0a0a', light: '#ff9a5a', eye: '#ffd23f' }, line: '#3a0606', noStars: true,
      shade(x, y, nx, ny, col) {
        // 交錯的弧形鱗片
        const row = Math.floor(y / 3), off = row % 2 ? 2 : 0;
        if ((x + off) % 4 === 0 && y % 3 === 2) col = mix(col, [60, 8, 8], 0.55);
        else if ((x + off) % 4 === 2 && y % 3 === 0) col = mix(col, [255, 170, 100], 0.35);
        return col;
      },
    },
    // 永恆：白金身體＋珍珠光澤
    eternal: {
      // 珍珠色：明度最高約 85%，陰影帶淡金與淡紫
      palette: { body: '#c4b48e', shade: '#7e6e96', light: '#dccfac', eye: '#3a2a10' }, line: '#6a4a1a', noStars: true,
      shade(x, y, nx, ny, col) {
        const sheen = Math.sin(x * 0.35 + y * 0.18);
        if (sheen > 0.8) col = mix(col, [232, 214, 170], 0.45);
        else if (sheen < -0.85) col = mix(col, [190, 178, 220], 0.4);
        return col;
      },
    },
    // 宇宙：銀河旋臂
    cosmos: {
      palette: { body: '#120c30', shade: '#06041a', light: '#5a4aa8', eye: '#ffffff' }, line: '#b8a8ff', noStars: true,
      post(put, m, cx, cy, rx, ryT) {
        const ccx = cx, ccy = cy - ryT * 0.15;
        for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 60; i++) {
          const tt = i / 60, ang = arm * Math.PI + tt * 4.2, r = 1 + tt * rx * 0.9;
          const x = Math.round(ccx + Math.cos(ang) * r), y = Math.round(ccy + Math.sin(ang) * r * 0.62);
          if (m(x, y)) put(x, y, tt < 0.3 ? [255, 241, 200] : i % 3 ? [180, 160, 255] : [255, 140, 220], 255);
        }
        put(Math.round(ccx), Math.round(ccy), [255, 255, 255], 255);
        for (let k = 0; k < 14; k++) { const x = Math.round(ccx + Math.sin(k * 7.3) * rx * 0.8), y = Math.round(ccy + Math.cos(k * 3.1) * ryT * 0.6); if (m(x, y)) put(x, y, [255, 255, 255], 220); }
      },
    },
    // 神諭：白金身體＋額頭的眼紋
    oracle: {
      palette: { body: '#c89a3a', shade: '#7a5214', light: '#e2c070', eye: '#1a1030' }, line: '#4a2a08', noStars: true,
      post(put, m, cx, cy, rx, ryT) {
        const ex = Math.round(cx), ey = Math.round(cy - ryT * 0.55);
        const gold = [216, 168, 64], iris = [90, 200, 255];
        for (const [dx, dy] of [[-3, 0], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [3, 0], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1]]) if (m(ex + dx, ey + dy)) put(ex + dx, ey + dy, gold, 255);
        if (m(ex, ey)) put(ex, ey, iris, 255);
        if (m(ex - 1, ey)) put(ex - 1, ey, [40, 90, 160], 255); if (m(ex + 1, ey)) put(ex + 1, ey, [40, 90, 160], 255);
      },
    },
    // 時空：深靛藍＋金色錶盤（刻度與羅馬數字點），金色描邊；指針由 render 每幀繪製
    chrono: {
      palette: { body: '#2a2f6a', shade: '#141838', light: '#5a64b8', eye: '#ffd23f' }, line: '#d8a830', noStars: true,
      post(put, m, cx, cy, rx, ryT) {
        const ccx = cx, ccy = cy - ryT * 0.22, R = rx * 0.66, RY = ryT * 0.66;
        for (let a = 0; a < 60; a++) {
          const ang = a / 60 * Math.PI * 2, x = Math.round(ccx + Math.cos(ang) * R), y = Math.round(ccy + Math.sin(ang) * RY);
          if (m(x, y)) put(x, y, [184, 140, 40], 255); // 錶盤外圈
        }
        for (let h = 0; h < 12; h++) {
          const ang = h / 12 * Math.PI * 2, x = Math.round(ccx + Math.cos(ang) * R * 0.82), y = Math.round(ccy + Math.sin(ang) * RY * 0.82);
          if (!m(x, y)) continue;
          put(x, y, [255, 226, 110], 255);
          if (h % 3 === 0) { put(x + 1, y, [255, 226, 110], 255); put(x, y + 1, [255, 226, 110], 255); } // 羅馬數字位（3/6/9/12）加粗
        }
        put(Math.round(ccx), Math.round(ccy), [255, 241, 160], 255);
      },
    },
    // 星神：星雲漸層身體（紫→粉→青）＋星點
    astral: {
      palette: { body: '#3a2a7a', shade: '#1a1240', light: '#c8b0ff', eye: '#ffffff' }, line: '#e8d8ff',
      shade(x, y, nx, ny, col) {
        const n = Math.sin(x * 0.55 + y * 0.3) + Math.sin(x * 0.17 - y * 0.6 + 1.3);
        if (n > 1.1) col = mix(col, [255, 122, 216], 0.45);
        else if (n < -1.1) col = mix(col, [90, 216, 255], 0.4);
        if ((x * 13 + y * 7) % 29 === 0) col = [255, 255, 255];
        else if ((x * 5 + y * 11) % 41 === 0) col = [255, 241, 160];
        return col;
      },
    },
  };

  // ---------- 星輝扭蛋專屬飾品（v1.8，DESIGN-v2 §8.2）----------
  const px = (g, col, pts) => { g.fillStyle = col; for (const [x, y, w = 1, h = 1] of pts) g.fillRect(x, y, w, h); };
  const wingPair = (g, cx, top, rx, rows, pal, dy = 2) => {
    const w = fromRows(rows, pal);
    g.save(); g.translate(Math.round(cx + rx) - 1, top + dy); g.drawImage(w, 0, 0); g.restore();
    g.save(); g.translate(Math.round(cx - rx) + 1, top + dy); g.scale(-1, 1); g.drawImage(w, 0, 0); g.restore();
  };
  const DECO = {
    // SR：屬性特徵物件
    thunder(g, cx, top) { // 雷鳴閃電角
      g.drawImage(fromRows(['...dd', '..dyd', '.dyd.', 'dyyyd', '.dyd.', 'dyd..', 'dd...'], { d: '#6a4a00', y: '#ffe24a' }), cx - 2, top - 8);
      px(g, '#ffffff', [[cx + 4, top - 7], [cx - 5, top - 4], [cx + 5, top - 2]]);
    },
    coral(g, cx, top) { // 珊瑚枝
      px(g, '#b8325a', [[cx - 3, top - 5, 1, 5], [cx - 4, top - 6, 1, 2], [cx - 2, top - 4, 1, 1], [cx + 2, top - 6, 1, 6], [cx + 3, top - 7, 1, 2], [cx + 1, top - 4, 1, 1], [cx, top - 3, 1, 3]]);
      px(g, '#ff8aa8', [[cx - 4, top - 7], [cx + 3, top - 8], [cx - 2, top - 5], [cx + 1, top - 5], [cx, top - 4]]);
    },
    venom(g, cx, top, rx) { // 毒霧泡泡
      const bub = (x, y, r) => { px(g, '#5a2a7a', [[x - r, y, 1, 1], [x + r, y, 1, 1], [x, y - r, 1, 1], [x, y + r, 1, 1]]); px(g, '#c08aff', [[x, y, 1, 1]]); if (r > 1) px(g, '#e8d0ff', [[x - 1, y - 1]]); };
      bub(cx + Math.round(rx) - 1, top - 3, 2); bub(cx + Math.round(rx) + 2, top - 8, 1); bub(cx - Math.round(rx) + 2, top - 5, 1);
      px(g, '#8a4ab8', [[cx - 1, top - 2, 3, 1]]);
    },
    sakura(g, cx, top, rx) { // 櫻花與花瓣
      px(g, '#ffb0c8', [[cx - 1, top - 4, 3, 3], [cx - 2, top - 3, 1, 1], [cx + 2, top - 3, 1, 1], [cx, top - 5, 1, 1], [cx, top - 1, 1, 1]]);
      px(g, '#ffe24a', [[cx, top - 3, 1, 1]]);
      px(g, '#ff8ab0', [[cx + Math.round(rx) + 1, top + 2, 2, 1], [cx - Math.round(rx) - 2, top + 5, 2, 1], [cx + Math.round(rx) - 1, top - 6, 1, 1]]);
    },
    // SSR：大型飾品
    phoenix(g, cx, top, rx) { // 鳳凰火羽冠＋側羽
      const col = ['#ff3a1a', '#ff7a2a', '#ffd84a'];
      for (let i = -2; i <= 2; i++) { const h = 9 - Math.abs(i) * 2, x = cx + i * 2; px(g, col[0], [[x, top - h, 1, h]]); px(g, col[1], [[x, top - h + 2, 1, h - 3]]); px(g, col[2], [[x, top - h, 1, 1]]); }
      wingPair(g, cx, top, rx, ['...r', '..ro', '.roy', 'roy.', 'ro..', 'r...'], { r: '#d02a14', o: '#ff7a2a', y: '#ffd84a' }, 4);
    },
    moon(g, cx, top) { // 月牙
      const y0 = top - 12;
      px(g, '#e8e0ff', [[cx - 3, y0 + 1, 2, 1], [cx - 4, y0 + 2, 2, 1], [cx - 5, y0 + 3, 2, 3], [cx - 4, y0 + 6, 2, 1], [cx - 3, y0 + 7, 2, 1], [cx - 1, y0 + 8, 3, 1]]);
      px(g, '#fffbe0', [[cx - 2, y0, 2, 1], [cx - 4, y0 + 4, 1, 1], [cx + 1, y0 + 8, 1, 1]]);
      px(g, '#ffffff', [[cx + 3, y0 + 1], [cx + 4, y0 + 4]]);
    },
    yggdrasil(g, cx, top) { // 世界樹嫩枝冠
      px(g, '#6b4421', [[cx, top - 7, 1, 7], [cx - 3, top - 4, 3, 1], [cx + 1, top - 5, 3, 1], [cx - 4, top - 5, 1, 1], [cx + 4, top - 6, 1, 1]]);
      const leaf = (x, y) => px(g, '#5cba47', [[x, y, 2, 1], [x - 1, y + 1, 2, 1]]) || px(g, '#b8f08a', [[x + 1, y, 1, 1]]);
      leaf(cx - 5, top - 7); leaf(cx + 4, top - 8); leaf(cx - 1, top - 9); leaf(cx + 2, top - 4); leaf(cx - 3, top - 3);
      px(g, '#ffe24a', [[cx, top - 10]]);
    },
    mecha(g, cx, top, rx) { // 機械齒輪眼＋天線
      const ex = cx + Math.max(3, Math.round(rx * 0.42)) - 2, ey = top + Math.round(rx * 0.55);
      px(g, '#6a7080', [[ex - 2, ey - 2, 6, 1], [ex - 2, ey + 3, 6, 1], [ex - 2, ey - 1, 1, 4], [ex + 3, ey - 1, 1, 4]]);
      px(g, '#c8d0e0', [[ex - 3, ey, 1, 2], [ex + 4, ey, 1, 2], [ex, ey - 3, 2, 1], [ex, ey + 4, 2, 1]]);
      px(g, '#ff3a3a', [[ex, ey, 2, 2]]); px(g, '#ffffff', [[ex, ey]]);
      px(g, '#8a90a0', [[cx, top - 6, 1, 6]]); px(g, '#ff3a3a', [[cx - 1, top - 8, 3, 2]]);
    },
    // UR：專屬飾品（光環與彩虹流光由 render 每幀疊加）
    chrono(g, cx, top) { // 時空：放大 1.5 倍的時鐘光輪
      const y0 = top - 10;
      for (let a = 0; a < 24; a++) { const ang = a / 24 * Math.PI * 2; px(g, a % 6 ? '#c8a050' : '#fff1a0', [[Math.round(cx + Math.cos(ang) * 9), Math.round(y0 + Math.sin(ang) * 4.5)]]); }
      for (let a = 0; a < 4; a++) { const ang = a / 4 * Math.PI * 2; px(g, '#fff1a0', [[Math.round(cx + Math.cos(ang) * 9) - 1, Math.round(y0 + Math.sin(ang) * 4.5), 3, 1]]); }
      px(g, '#7ad8ff', [[cx - 1, top - 4, 3, 1], [cx, top - 5, 1, 1], [cx, top - 3, 1, 1]]);
    },
    dragonlord(g, cx, top, rx) { // 龍王：雙角＋黑金冠＋暗翼
      px(g, '#f2e2c4', [[cx - 5, top - 4, 1, 4], [cx - 6, top - 6, 1, 2], [cx - 7, top - 7, 1, 1], [cx + 5, top - 4, 1, 4], [cx + 6, top - 6, 1, 2], [cx + 7, top - 7, 1, 1]]);
      px(g, '#2a1a10', [[cx - 3, top - 3, 7, 3]]); px(g, '#ffd23f', [[cx - 3, top - 4, 1, 1], [cx, top - 5, 1, 2], [cx + 3, top - 4, 1, 1], [cx - 2, top - 2, 5, 1]]); px(g, '#e0533d', [[cx, top - 2]]);
      wingPair(g, cx, top, rx, ['...dd', '..dRd', '.dRRd', 'dRRd.', 'dRd..', 'dd...'], { d: '#2a0a14', R: '#a8202a' }, 1);
    },
    astral(g, cx, top) { // 星神：星冠＋小星
      const star = (x, y, c) => px(g, c, [[x, y - 1], [x - 1, y], [x, y], [x + 1, y], [x, y + 1]]);
      star(cx, top - 6, '#ffffff'); star(cx - 4, top - 4, '#c8d8ff'); star(cx + 4, top - 4, '#ffe0f8');
      px(g, '#fff1a0', [[cx, top - 8], [cx - 6, top - 7], [cx + 6, top - 8]]);
      px(g, '#b8a0ff', [[cx - 2, top - 2, 5, 1]]);
    },
  };

  // 需要額外左右空間的種類（大翼、光輪）
  const DECO_PAD = { seraph: 9, eternal: 6, cosmos: 3, primordial: 3, abyss: 3 };
  Object.assign(DECO, {
    aurora(g, cx, top, rx) { // 極光帶
      const cols = ['#5affb0', '#5ad8ff', '#c08aff', '#ff8ad8'];
      for (let i = 0; i < 4; i++) for (let x = -8; x <= 8; x++) {
        const y = top - 4 - i * 2 + Math.round(Math.sin(x * 0.6 + i) * 1.5);
        g.globalAlpha = 0.85 - Math.abs(x) * 0.06; g.fillStyle = cols[i]; g.fillRect(cx + x, y, 1, 1);
      }
      g.globalAlpha = 1;
    },
    abyss(g, cx, top, rx) { // 觸手狀暗影（身體兩側下緣）
      const base = top + Math.round(rx * 1.2);
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
        let x = cx + s * (Math.round(rx) - 1 - k * 3), y = base - k * 3;
        for (let i = 0; i < 7; i++) { g.fillStyle = i < 2 ? '#3a1a5a' : '#1a0a2a'; g.fillRect(x, y, 2, 1); x += s; y += (i % 2 ? 1 : 0) - (i > 4 ? 1 : 0); }
        g.fillStyle = '#c08aff'; g.fillRect(x, y, 1, 1);
      }
      g.fillStyle = '#ff3a6a'; g.fillRect(cx - 1, top - 3, 3, 1); g.fillStyle = '#1a0a2a'; g.fillRect(cx - 2, top - 2, 5, 1);
    },
    tempest(g, cx, top) { // 漩渦水流
      for (let i = 0; i < 26; i++) {
        const ang = i * 0.55, r = 1 + i * 0.32;
        g.fillStyle = i % 3 ? '#5ab0ff' : '#e0f4ff';
        g.fillRect(Math.round(cx + Math.cos(ang) * r * 1.4), Math.round(top - 6 + Math.sin(ang) * r * 0.55), 1, 1);
      }
      g.fillStyle = '#ffffff'; g.fillRect(cx, top - 6, 1, 1);
    },
    seraph(g, cx, top, rx) { // 熾天使：三對光翼＋光環
      const wing = ['....ww', '..wwWw', '.wWWw.', 'wWWw..', 'wWw...', 'ww....'], pal = { w: '#ffe9a8', W: '#ffffff' };
      for (let k = 0; k < 3; k++) wingPair(g, cx, top + (k - 1) * 5, rx + k * 2, wing, pal, 1);
      g.drawImage(acc('halo'), cx - 3, top - 9);
    },
    nocturne(g, cx, top) { // 冥夜：新月
      const y0 = top - 12;
      px(g, '#d8d0ff', [[cx + 1, y0, 2, 1], [cx + 3, y0 + 1, 1, 1], [cx + 4, y0 + 2, 1, 4], [cx + 3, y0 + 6, 1, 1], [cx + 1, y0 + 7, 2, 1], [cx, y0 + 6, 1, 1]]);
      px(g, '#ffffff', [[cx + 4, y0 + 3]]);
      px(g, '#8a7ad8', [[cx - 4, y0 + 2], [cx - 6, y0 + 5], [cx + 7, y0 + 1]]);
    },
    primordial(g, cx, top, rx) { // 原初龍：龍首冠＋雙角
      px(g, '#2a0606', [[cx - 4, top - 4, 9, 4]]);
      px(g, '#ffd23f', [[cx - 4, top - 5, 1, 1], [cx - 2, top - 6, 1, 2], [cx, top - 7, 1, 3], [cx + 2, top - 6, 1, 2], [cx + 4, top - 5, 1, 1], [cx - 3, top - 2, 7, 1]]);
      px(g, '#e0533d', [[cx, top - 3]]);
      px(g, '#f2e2c4', [[cx - 6, top - 5, 1, 4], [cx - 7, top - 8, 1, 3], [cx - 8, top - 9, 1, 1], [cx + 6, top - 5, 1, 4], [cx + 7, top - 8, 1, 3], [cx + 8, top - 9, 1, 1]]);
    },
    eternal(g, cx, top, rx) { // 永恆：背後的大光輪＋無限符號
      // 只畫在身體輪廓外的部分，看起來像在背後
      const bcy = top + rx * 0.75, inBody = (x, y) => ((x - cx) / (rx + 0.5)) ** 2 + ((y - bcy) / (rx * 0.8)) ** 2 < 1;
      for (let a = 0; a < 48; a++) {
        const ang = a / 48 * Math.PI * 2, x = Math.round(cx + Math.cos(ang) * (rx + 4)), y = Math.round(top + 6 + Math.sin(ang) * (rx * 0.9 + 3));
        if (!inBody(x, y)) px(g, a % 6 ? '#e8d8a0' : '#ffffff', [[x, y]]);
      }
      const y0 = top - 5;
      px(g, '#d8a840', [[cx - 4, y0, 2, 1], [cx - 5, y0 + 1, 1, 1], [cx - 4, y0 + 2, 2, 1], [cx - 2, y0 + 1, 3, 1], [cx + 1, y0, 2, 1], [cx + 3, y0 + 1, 1, 1], [cx + 1, y0 + 2, 2, 1]]);
      px(g, '#ffffff', [[cx, y0 + 1]]);
    },
    cosmos(g, cx, top) { // 宇宙：環繞的小行星帶
      for (let a = 0; a < 18; a++) { const ang = a / 18 * Math.PI * 2; px(g, a % 4 ? '#8a7ad8' : '#fff1a0', [[Math.round(cx + Math.cos(ang) * 8), Math.round(top - 4 + Math.sin(ang) * 2)]]); }
      px(g, '#ff8ad8', [[cx + 6, top - 5, 2, 2]]); px(g, '#7ad8ff', [[cx - 7, top - 4, 2, 2]]);
    },
    oracle(g, cx, top) { // 神諭：神殿冠（三柱＋三角楣）
      px(g, '#d8a840', [[cx - 6, top - 2, 13, 1], [cx - 5, top - 7, 11, 1], [cx - 4, top - 8, 9, 1], [cx - 2, top - 9, 5, 1], [cx, top - 10, 1, 1]]);
      px(g, '#fff4d0', [[cx - 5, top - 6, 2, 4], [cx - 1, top - 6, 2, 4], [cx + 3, top - 6, 2, 4]]);
      px(g, '#5ad8ff', [[cx, top - 8]]);
    },
  });

  function drawAccessory(g, tier, cx, top, rx) {
    if (tier >= 4) {
      const w = acc('wing');
      g.save(); g.translate(Math.round(cx + rx) - 1, top + 3); g.drawImage(w, 0, 0); g.restore();
      g.save(); g.translate(Math.round(cx - rx) + 1, top + 3); g.scale(-1, 1); g.drawImage(w, 0, 0); g.restore();
    }
    if (tier === 2) g.drawImage(acc('sprout'), cx - 2, top - 4);
    if (tier >= 3) g.drawImage(acc('crown'), cx - 2, top - 5);
    if (tier >= 5) g.drawImage(acc('halo'), cx - 3, top - 10);
    if (tier >= 6) g.drawImage(acc('gem'), cx - 1, top + 3);
    if (tier >= 7) {
      const w = acc('wing');
      g.save(); g.translate(Math.round(cx + rx) + 2, top + 1); g.drawImage(w, 0, 0); g.restore();
      g.save(); g.translate(Math.round(cx - rx) - 2, top + 1); g.scale(-1, 1); g.drawImage(w, 0, 0); g.restore();
    }
  }

  // ---------- 圖示 ----------
  const ICONS = {
    coin: { rows: [
      '..dddd..', '.dyyyyd.', 'dyYYyyyd', 'dyYddyyd', 'dyYdyyyd', 'dyyddyod', '.dyyyod.', '..dddd..'],
      pal: { d: '#7a4a12', y: '#f7c84a', Y: '#fff1a0', o: '#c98a24' } },
    gem: { rows: [
      '..dddd..', '.dWbbBd.', 'dWWbbBBd', 'dddddddd', '.dbbBBd.', '..dbBd..', '...dd...', '........'],
      pal: { d: '#2a1d4a', W: '#ffffff', b: '#ff7ad9', B: '#c13ea8' } },
    star: { rows: ['...y...', '..yYy..', 'yyyYyyy', '.yYYYy.', '..yyy..', '.yy.yy.', 'y.....y'],
      pal: { y: '#ffd23f', Y: '#fff7c0' } },
    heart: { rows: ['.rr.rr.', 'rWrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'], pal: { r: '#ff5c8a', W: '#fff' } },
    hand: { rows: [
      '...dd...', '..dWWd..', '..dWWd..', '..dWWddd', 'dddWWWWd', 'dWdWWWWd', 'dWWWWWWd', '.dWWWWd.', '..dddd..'],
      pal: { d: '#2a1d14', W: '#ffffff' } },
    // 遺物
    relic_prod: { rows: ['........dd', '.......dyd', 'dd....dyYd', 'dydddyyYd.', 'dyyYYYyyd.', 'dyyyyyyd..', 'dd.dddd...', '...d..d...', '..dd..dd..'],
      pal: { d: '#5a3410', y: '#e0a840', Y: '#fff1a0' } },
    relic_crit: { rows: ['.dddddd.', 'dWWWWWWd', 'dWrWWrWd', 'dWWWWWWd', 'dWWrrWWd', 'dWWWWWWd', 'dWrWWrWd', '.dddddd.'],
      pal: { d: '#2a1d14', W: '#ffffff', r: '#e0533d' } },
    relic_combat: { rows: ['dddddddd', 'dbbbbbbd', 'dbbyybbd', 'dbyYYybd', 'dbbyybbd', '.dbbbbd.', '..dbbd..', '...dd...'],
      pal: { d: '#1b1f3b', b: '#4fa8ff', y: '#ffd23f', Y: '#fff1a0' } },
    relic_offline: { rows: ['..........', '.dddddddd.', 'dWWWWWWWWd', 'dWppWWWWWd', 'dWWWWWWWWd', 'dpWWWWWWpd', '.dddddddd.', '..z....z..'],
      pal: { d: '#5e544d', W: '#f3efe6', p: '#c9c1b2', z: '#9b8f86' } },
    relic_gems: { rows: ['dd....dd', 'rd....rd', 'rd....rd', 'rd....rd', 'rrd..drr', '.rrddrr.', '..rrrr..', '........'],
      pal: { d: '#c8d0e0', r: '#e0533d' } },
    bag: { rows: [
      '...dddd...', '..dyddyd..', '...dyyd...', '..dyyyyd..', '.dyYyyyod.', 'dyYYcyyyod', 'dyYcYcyyod', 'dyyycyyood', '.dyyyyood.', '..dddddd..'],
      pal: { d: '#5a3410', y: '#e0a840', Y: '#ffe08a', o: '#a86a20', c: '#fff3b0' } },
    // 星輝扭蛋：黑金膠囊
    capsule_star: { rows: [
      '...dddddd...', '..dkkkkkkd..', '.dkWkkykkkd.', 'dkWkkkkkykkd', 'dkkkykkkkkKd', 'dGGGGGGGGGGd',
      'dkkkkkkkkkkd', 'dkykkkkykkKd', '.dkkkykkkKd.', '..dkkkkkKd..', '...dddddd...'],
      pal: { d: '#000000', k: '#1a1430', K: '#0a0818', W: '#8a7ac8', y: '#ffe36a', G: '#d8b050' } },
    // 神諭扭蛋：白金膠囊
    capsule_oracle: { rows: [
      '...dddddd...', '..dwwwwwwd..', '.dwWwwwwwwd.', 'dwWwwgwwwwwd', 'dwwwwwwwwwPd', 'dGGGGeGGGGGd',
      'dnnnnnnnnnnd', 'dnynnnnnnnNd', '.dnnnnnnnNd.', '..dnnnnnNd..', '...dddddd...'],
      pal: { d: '#2a2440', w: '#f2ecd8', W: '#ffffff', P: '#c8b88a', g: '#d8a840', G: '#d8a840', e: '#5ad8ff', n: '#1a2a5a', N: '#0e1838', y: '#fff1a0' } },
    capsule: { rows: [
      '...dddddd...', '..dppppppd..', '.dpWWpppppd.', 'dpWppppppppd', 'dpppppppppPd', 'dddddddddddd',
      'dwwwwwwwwwwd', 'dwWwwwwwwwgd', '.dwwwwwwwgd.', '..dwwwwwgd..', '...dddddd...'],
      pal: { d: '#2a1d14', p: '#ff7aa8', P: '#c2456f', W: '#ffffff', w: '#f3efe6', g: '#c9c1b2' } },
  };
  function icon(name) {
    const key = 'i|' + name; let c = cache.get(key); if (c) return c;
    const def = ICONS[name]; if (!def) return null;
    c = fromRows(def.rows, def.pal); cache.set(key, c); return c;
  }

  // 3x5 點陣字（飄字用）
  const FONT = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
    '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
    '8': '111101111101111', '9': '111101111001111', '+': '000010111010000', '.': '000000000000010',
    'K': '101110100110101', 'M': '101111111101101', 'B': '110101110101110', 'T': '111010010010010',
    'e': '000111111100111', 'x': '000101010101000', '×': '000101010101000', '-': '000000111000000',
    'a': '000011101101011', 'b': '100110101101110', 'c': '000011100100011', 'd': '001011101101011',
    'i': '010000010010010', 'o': '000010101101010', 'p': '000110101110100',
    'W': '101101111111101', 'E': '111100111100111', 'A': '010101111101101', 'R': '110101110101101', '!': '010010010000010',
    'L': '100100100100111', 'v': '000101101101010', 'U': '101101101101111', 'P': '110101110100100',
    'Q': '010101101011001', 'S': '011100010001110', 'O': '010101101101010', 'N': '101111111111101', 'D': '110101101101110',
  };
  function drawText(g, str, x, y, color, outline, scale = 1) {
    const chars = [...String(str)];
    const w = chars.length * 4 * scale;
    let px = Math.round(x - w / 2);
    const pass = (ox, oy, col) => {
      g.fillStyle = col; let cx = px;
      for (const ch of chars) {
        const f = FONT[ch];
        if (f) for (let i = 0; i < 15; i++) if (f[i] === '1') g.fillRect(cx + (i % 3) * scale + ox, Math.round(y) + ((i / 3) | 0) * scale + oy, scale, scale);
        cx += 4 * scale;
      }
    };
    if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) pass(ox, oy, outline);
    pass(0, 0, color);
  }

  // ---------- 背景場景 ----------
  function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // ---------- 地區主題 ----------
  const ZONE_NAMES = { meadow: '草原', beach: '海邊', volcano: '火山', snow: '雪山', sky: '天空城' };
  const THEMES = {
    meadow: {
      sky: [[86, 156, 232], [120, 190, 242], [170, 220, 248], [214, 238, 246]],
      sun: { x: 0.82, y: 0.16, r: 7, core: [255, 250, 214], rim: [255, 236, 150], glow: [255, 244, 200] },
      ridges: [[10, -8, 0.031, 0.077, 1.3, [128, 160, 200], [158, 188, 220]], [8, -1, 0.045, 0.11, 4.1, [92, 150, 120], [120, 178, 128]]],
      ground: [[120, 196, 84], [104, 182, 72], [88, 166, 64], [76, 150, 58]],
      path: [[170, 140, 92], [214, 186, 132], [226, 202, 150]],
      tuft: { dk: [56, 128, 48], lt: [160, 222, 110], flowers: [[255, 255, 255], [255, 210, 70], [255, 130, 170], [190, 150, 255]], n: 420, fr: 0.12 },
    },
    beach: {
      sky: [[58, 50, 126], [128, 82, 150], [222, 122, 130], [255, 176, 124], [255, 214, 150]],
      sun: { x: 0.68, y: 0.40, r: 11, core: [255, 236, 170], rim: [255, 160, 96], glow: [255, 190, 140] },
      ridges: [[6, -4, 0.05, 0.13, 2.0, [104, 70, 120], [130, 90, 140]]],
      sea: { top: -6, bottom: 16, cols: [[64, 70, 150], [84, 104, 178], [104, 140, 200]], glint: [255, 200, 150] },
      ground: [[244, 214, 156], [234, 200, 138], [222, 186, 122], [208, 170, 108]],
      tuft: { dk: [196, 156, 96], lt: [255, 236, 190], flowers: [[255, 140, 120], [255, 255, 255], [255, 200, 120]], n: 160, fr: 0.25 },
    },
    volcano: {
      sky: [[34, 14, 28], [70, 24, 36], [130, 44, 44], [200, 90, 56], [236, 140, 70]],
      sun: null,
      ridges: [[9, -4, 0.04, 0.1, 0.7, [60, 30, 38], [86, 44, 46]]],
      volcanoCone: true,
      ground: [[78, 60, 62], [66, 50, 54], [54, 42, 46], [44, 34, 40]],
      tuft: { dk: [34, 26, 30], lt: [104, 84, 84], flowers: [[255, 120, 40], [255, 200, 70]], n: 260, fr: 0.2 },
      lava: true,
    },
    snow: {
      sky: [[110, 150, 206], [150, 186, 226], [192, 216, 238], [228, 238, 248]],
      sun: { x: 0.2, y: 0.18, r: 6, core: [255, 255, 240], rim: [230, 240, 255], glow: [240, 248, 255] },
      ridges: [[22, -10, 0.028, 0.07, 0.4, [176, 194, 222], [255, 255, 255]], [10, -1, 0.05, 0.12, 3.3, [204, 218, 238], [255, 255, 255]]],
      ground: [[246, 250, 255], [232, 240, 250], [216, 228, 244], [200, 216, 238]],
      tuft: { dk: [176, 196, 226], lt: [255, 255, 255], flowers: [[120, 170, 230]], n: 200, fr: 0.05 },
    },
    sky: {
      sky: [[70, 110, 236], [110, 156, 248], [160, 198, 255], [210, 230, 255], [240, 246, 255]],
      sun: { x: 0.85, y: 0.14, r: 8, core: [255, 255, 230], rim: [255, 240, 170], glow: [255, 250, 220] },
      ridges: [],
      cloudSea: true, cloudGround: true, rainbow: true,
      ground: [[255, 255, 255], [240, 246, 255], [224, 236, 252], [206, 222, 248]],
      tuft: { dk: [196, 214, 244], lt: [255, 255, 255], flowers: [[255, 236, 160], [200, 220, 255]], n: 140, fr: 0.1 },
    },
  };
  const zoneOf = z => THEMES[z] ? z : 'meadow';

  // HD-2D：場景拆成 sky／far／ground（逐像素）與 mid（道具）四層，各自一張 W×H 畫布
  function sceneLayers(W, H, zone) {
    zone = zoneOf(zone);
    const key = `layers|${W}|${H}|${zone}`; let L = cache.get(key); if (L) return L;
    const th = THEMES[zone];
    L = { sky: mk(W, H), far: mk(W, H), ground: mk(W, H), mid: mk(W, H) };
    const imgs = {}; for (const k of ['sky', 'far', 'ground']) imgs[k] = L[k].getContext('2d').createImageData(W, H);
    let d = imgs.sky.data;
    const use = k => { d = imgs[k].data; };
    const g = L.mid.getContext('2d');
    const put = (x, y, col) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
    const get = (x, y) => { x = Math.max(0, Math.min(W - 1, x | 0)); y = Math.max(0, Math.min(H - 1, y | 0)); const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const band = (cols, t) => { const u = t * (cols.length - 1), i = Math.min(cols.length - 2, Math.floor(u)); return [cols[i], cols[i + 1], u - i]; };
    const R = rand(7);
    const horizon = Math.round(H * 0.5);

    // 天空：多段色帶 + Bayer 抖色
    for (let y = 0; y < horizon; y++) {
      const [a, b, f] = band(th.sky, y / horizon);
      for (let x = 0; x < W; x++) put(x, y, dither(x, y, f) ? b : a);
    }
    // 雪山／火山：天空的星點
    if (zone === 'volcano') for (let i = 0; i < 40; i++) put(R() * W, R() * horizon * 0.5, [255, 200, 150]);
    // 太陽
    if (th.sun) {
      const S = th.sun, sunX = Math.round(W * S.x), sunY = Math.round(H * S.y), rr = S.r + 5;
      for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) {
        const r = Math.hypot(x, y);
        if (r < S.r) put(sunX + x, sunY + y, r < S.r - 2 ? S.core : S.rim);
        else if (r < rr && dither(x + 99, y + 99, (rr - r) / 9)) put(sunX + x, sunY + y, mix(get(sunX + x, sunY + y), S.glow, 0.5));
      }
    }
    // 遠山
    use('far');
    for (const [amp, off, f1, f2, ph, col, colTop] of th.ridges) {
      const base = horizon + off;
      for (let x = 0; x < W; x++) {
        const h = Math.round(base - amp * (0.6 * Math.sin(x * f1 + ph) + 0.4 * Math.sin(x * f2 + ph * 2.3)) - amp * 0.3);
        const capH = zone === 'snow' ? Math.max(2, Math.round(amp * 0.5 - (base - h) * 0.0)) : 2;
        for (let y = h; y < horizon + 6; y++) put(x, y, y - h < capH ? (dither(x, y, (y - h) / capH) ? colTop : mix(colTop, col, 0.3)) : (dither(x, y, (y - h) / 22) ? mix(col, [90, 140, 150], 0.2) : col));
      }
    }
    // 火山錐
    if (th.volcanoCone) {
      const cx = 236, top = 26, base = horizon + 4;
      for (let y = top; y < base; y++) {
        const p = (y - top) / (base - top), hw = 9 + p * p * 80 + p * 18;
        for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
          const e = (x - cx) / hw;
          let col = e < -0.2 ? [58, 34, 40] : e > 0.4 ? [36, 20, 28] : [46, 26, 34];
          if (dither(x, y, Math.abs(e) * 0.6)) col = mix(col, [24, 14, 20], 0.4);
          put(x, y, col);
        }
      }
      // 火山口與熔岩流
      for (let x = cx - 9; x <= cx + 9; x++) { put(x, top, [255, 200, 80]); put(x, top + 1, [255, 120, 40]); }
      let lx = cx - 2;
      for (let y = top + 2; y < base; y++) { lx += Math.sin(y * 0.3) * 0.6 - 0.15; put(lx, y, [255, 110, 30]); if (y % 3) put(lx + 1, y, [200, 60, 20]); }
      let rx = cx + 4;
      for (let y = top + 2; y < base - 10; y++) { rx += Math.sin(y * 0.4 + 2) * 0.5 + 0.35; put(rx, y, [230, 90, 30]); }
    }
    // 天空城：遠處雲海
    if (th.cloudSea) {
      for (let y = horizon - 10; y < horizon + 4; y++) for (let x = 0; x < W; x++) {
        const h = horizon - 6 + Math.sin(x * 0.09) * 2 + Math.sin(x * 0.23 + 1) * 1.5;
        if (y > h) put(x, y, dither(x, y, (y - h) / 10) ? [236, 242, 255] : [255, 255, 255]);
      }
    }
    // 海
    const groundTop = th.sea ? horizon + th.sea.bottom : horizon;
    if (th.sea) {
      for (let y = horizon + th.sea.top; y < groundTop; y++) {
        const [a, b, f] = band(th.sea.cols, (y - horizon - th.sea.top) / (th.sea.bottom - th.sea.top));
        for (let x = 0; x < W; x++) {
          let col = dither(x, y, f) ? b : a;
          // 夕陽倒影
          if (Math.abs(x - W * th.sun.x) < 10 - (y - horizon) * 0.2 && (x + y * 3) % 5 < 2) col = th.sea.glint;
          put(x, y, col);
        }
      }
    }
    // 地面：色帶
    use('ground');
    for (let y = groundTop; y < H; y++) {
      const [a, b, f] = band(th.ground, (y - groundTop) / (H - groundTop));
      for (let x = 0; x < W; x++) put(x, y, dither(x, y, f) ? b : a);
    }
    // 天空城：地面邊緣是雲朵弧線，底下透出天空
    if (th.cloudGround) {
      for (let x = 0; x < W; x++) {
        const bump = Math.round(3 + 3 * Math.abs(Math.sin(x * 0.07)) + 2 * Math.abs(Math.sin(x * 0.19 + 1)));
        for (let y = groundTop - bump; y < groundTop + 2; y++) put(x, y, y < groundTop - bump + 1 ? [214, 228, 250] : [255, 255, 255]);
      }
      // 雲地上的陰影弧
      for (let k = 0; k < 9; k++) {
        const cx = R() * W, cy = groundTop + 14 + R() * (H - groundTop - 18), rw = 14 + R() * 18;
        for (let x = -rw; x <= rw; x++) { const yy = Math.round(cy + Math.sqrt(Math.max(0, 1 - (x / rw) ** 2)) * 4); put(cx + x, yy, [206, 222, 248]); }
      }
    }
    // 熔岩裂縫
    if (th.lava) for (let k = 0; k < 7; k++) {
      let x = R() * W, y = groundTop + 8 + R() * (H - groundTop - 12);
      for (let s2 = 0; s2 < 26; s2++) { x += R() * 2 - 0.5; y += R() * 1.4 - 0.7; put(x, y, s2 % 4 ? [255, 120, 40] : [255, 200, 90]); put(x, y + 1, [140, 40, 20]); }
    }
    // 小路
    if (th.path) for (let y = groundTop + 4; y < H; y++) {
      const p = (y - groundTop) / (H - groundTop);
      const cxp = W * 0.5 + Math.sin(p * 3.2) * 22, hw = 4 + p * 16;
      for (let x = Math.floor(cxp - hw); x <= cxp + hw; x++) {
        const e = Math.abs(x - cxp) / hw;
        put(x, y, e > 0.85 ? th.path[0] : (dither(x, y, 0.3 + e * 0.4) ? th.path[1] : th.path[2]));
      }
    }
    // 天空城：彩虹橋
    if (th.rainbow) {
      const RB = [[255, 110, 110], [255, 180, 90], [255, 236, 110], [130, 220, 120], [110, 170, 255], [170, 130, 240]];
      for (let y = groundTop + 2; y < H; y++) {
        const p = (y - groundTop) / (H - groundTop);
        const cxp = W * 0.5 + Math.sin(p * 3.2) * 22, hw = 4 + p * 16;
        for (let x = Math.floor(cxp - hw); x <= cxp + hw; x++) {
          const e = (x - (cxp - hw)) / (2 * hw);
          put(x, y, RB[Math.max(0, Math.min(5, Math.floor(e * 6)))]);
        }
      }
    }
    // 雪山：沿著小路的腳印
    if (zone === 'snow') for (let y = groundTop + 6; y < H; y += 5) {
      const p = (y - groundTop) / (H - groundTop), cxp = W * 0.5 + Math.sin(p * 3.2) * 22, side = (y / 5 | 0) % 2 ? -3 : 3;
      const fx = Math.round(cxp + side * (1 + p)); put(fx, y, [140, 166, 206]); put(fx + 1, y, [140, 166, 206]); put(fx, y + 1, [160, 184, 220]); put(fx + 1, y + 1, [160, 184, 220]); put(fx, y + 2, [176, 198, 230]);
    }
    // 草叢、貝殼、碎石、雪堆
    const T = th.tuft;
    for (let i = 0; i < T.n; i++) {
      const x = Math.floor(R() * W), y = groundTop + 4 + Math.floor(R() * (H - groundTop - 4));
      if (th.path && Math.abs(get(x, y)[0] - th.path[2][0]) < 8 && Math.abs(get(x, y)[2] - th.path[2][2]) < 8) continue;
      if (th.rainbow) { const p = (y - groundTop) / (H - groundTop); if (Math.abs(x - (W * 0.5 + Math.sin(p * 3.2) * 22)) <= 5 + p * 16) continue; }
      if (zone === 'beach') {
        if (R() < T.fr) { const fc = T.flowers[Math.floor(R() * T.flowers.length)]; put(x, y, fc); put(x - 1, y, fc); put(x + 1, y, fc); put(x, y - 1, fc); put(x, y + 1, fc); }
        else { put(x, y, T.dk); put(x + 1, y, T.lt); }
        continue;
      }
      put(x, y, T.dk); put(x, y - 1, T.dk); if (R() < 0.6) { put(x - 1, y, T.dk); put(x + 1, y - 1, T.lt); }
      if (R() < T.fr) { const fc = T.flowers[Math.floor(R() * T.flowers.length)]; put(x, y - 2, fc); put(x - 1, y - 2, fc); put(x + 1, y - 2, fc); put(x, y - 3, fc); }
    }
    for (const k in imgs) L[k].getContext('2d').putImageData(imgs[k], 0, 0);
    L.groundTop = groundTop; L.horizon = horizon;

    // 地區物件
    if (zone === 'meadow') {
      fence(g, W, horizon + 6, '#a8713e', '#6b4421', '#d39a5c');
      barn(g, W - 72, horizon - 26);
      tree(g, 18, horizon - 30); tree(g, 44, horizon - 20, 0.8);
    } else if (zone === 'beach') {
      palm(g, 6, horizon - 12); palm(g, 46, horizon - 4, true); palm(g, W - 40, horizon - 5);
      const hut = fromRows(HUT.rows, HUT.pal);
      g.drawImage(hut, 0, 0, hut.width, hut.height, W - 104, horizon + 7, hut.width * 1.6 | 0, hut.height * 1.6 | 0);
      const castle = fromRows(CASTLE.rows, CASTLE.pal), umb = fromRows(UMBRELLA.rows, UMBRELLA.pal), star = fromRows(STARFISH.rows, STARFISH.pal);
      g.drawImage(castle, 0, 0, castle.width, castle.height, 30, H - 34, castle.width * 2, castle.height * 2);
      g.drawImage(umb, 0, 0, umb.width, umb.height, W - 70, H - 64, umb.width * 2, umb.height * 2);
      g.drawImage(star, 120, H - 14); g.drawImage(star, W - 128, horizon + 34);
      g.fillStyle = '#d0aa72';
      for (let i = 0; i < 9; i++) { const fx = 160 + i * 12, fy = H - 10 - i * 4 + (i % 2) * 3; g.fillRect(fx, fy, 2, 3); g.fillRect(fx + 3, fy + 1, 1, 1); }
    } else if (zone === 'volcano') {
      g.drawImage(fromRows(DEADTREE.rows, DEADTREE.pal), 20, horizon - 12);
      g.drawImage(fromRows(DEADTREE.rows, DEADTREE.pal), 70, horizon - 2);
      fence(g, W, horizon + 6, '#5a3a34', '#2a1a18', '#7a5048');
    } else if (zone === 'snow') {
      for (const [x, y, sc] of [[8, -34, 1], [36, -22, 0.8], [W - 34, -30, 0.9], [W - 60, -18, 0.7]]) pine(g, x, horizon + y, sc);
      fence(g, W, horizon + 6, '#8a6a52', '#4a3424', '#c8a888');
      g.fillStyle = '#ffffff'; g.fillRect(0, horizon + 8, W, 1); g.fillRect(0, horizon + 14, W, 1);
      for (let x = 4; x < W; x += 14) { g.fillRect(x - 2, horizon + 3, 7, 2); g.fillRect(x - 1, horizon + 2, 5, 1); }
      const sm = fromRows(SNOWMAN.rows, SNOWMAN.pal);
      g.drawImage(sm, 0, 0, sm.width, sm.height, W - 116, horizon + 2, sm.width * 2, sm.height * 2);
    } else if (zone === 'sky') {
      for (const [x, y, w] of [[20, 30, 30], [250, 48, 22], [130, 22, 16]]) island(g, x, y, w);
      const pil = fromRows(PILLARS.rows, PILLARS.pal);
      g.drawImage(pil, 0, 0, pil.width, pil.height, W - 74, horizon - 26, pil.width * 2, pil.height * 2);
      g.drawImage(pil, 0, 0, pil.width, pil.height, 18, horizon - 20, pil.width * 1.6 | 0, pil.height * 1.6 | 0);
    }
    cache.set(key, L);
    return L;
  }
  // 合成成單張（地區縮圖、戰鬥以外的舊用途）
  function scene(W, H, zone) {
    const key = `bg|${W}|${H}|${zoneOf(zone)}`; let c = cache.get(key); if (c) return c;
    const L = sceneLayers(W, H, zone);
    c = mk(W, H); const g = c.getContext('2d');
    for (const k of ['sky', 'far', 'ground', 'mid']) g.drawImage(L[k], 0, 0);
    cache.set(key, c); return c;
  }

  function fence(g, W, fenceY, wood, woodD, woodL) {
    g.fillStyle = woodD; g.fillRect(0, fenceY + 3, W, 3); g.fillRect(0, fenceY + 9, W, 3);
    g.fillStyle = wood; g.fillRect(0, fenceY + 3, W, 2); g.fillRect(0, fenceY + 9, W, 2);
    for (let x = 4; x < W; x += 14) {
      g.fillStyle = woodD; g.fillRect(x - 1, fenceY - 1, 5, 16);
      g.fillStyle = wood; g.fillRect(x, fenceY, 3, 14);
      g.fillStyle = woodL; g.fillRect(x, fenceY, 1, 13);
    }
  }
  function palm(g, x, y, flip) {
    let c = cache.get('palm');
    if (!c) {
      c = fromRows([
        '....gg.....gg....', '..ggGGg...gGGgg..', '.gGGgggg.gggGGGg.', 'gGg....gGg....gGg', 'g.....ggtgg.....g', '.....g.cTc.g.....',
        '....g..cTt..g....', '.......tTt.......', '.......tT........', '......tTt........', '......tT.........', '......tTt........',
        '.....tTt.........', '.....tT..........', '.....tTt.........', '....ttTTt........'],
        { g: '#2f7a2c', G: '#6cc04a', t: '#6b4421', T: '#a8713e', c: '#5a3a1a' });
      cache.set('palm', c);
    }
    g.save(); g.translate(x + (flip ? c.width * 1.8 : 0), y); g.scale(flip ? -1.8 : 1.8, 1.8); g.drawImage(c, 0, 0); g.restore();
  }
  function pine(g, x, y, s) {
    let c = cache.get('pine');
    if (!c) {
      c = fromRows([
        '......W......', '.....WgW.....', '....WgggW....', '.....ggg.....', '...WWgggWW...', '..WgggggggW..', '....ggggg....',
        '..WWgggggWW..', '.WgggggggggW.', 'Wggggggggggg.', '..ggggggggg..', '.....ttt.....', '.....ttt.....'],
        { W: '#ffffff', g: '#2a5a4a', t: '#5a3a24' });
      cache.set('pine', c);
    }
    g.drawImage(c, 0, 0, c.width, c.height, x, y, Math.round(c.width * 2.2 * s), Math.round(c.height * 2.2 * s));
  }
  function island(g, x, y, w) {
    g.fillStyle = '#7a5a3a'; g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x + w, y + 3); g.lineTo(x + w * 0.55, y + 3 + w * 0.5); g.closePath(); g.fill();
    g.fillStyle = '#5a3e26'; g.fillRect(x + w * 0.5, y + 4, 2, w * 0.35);
    g.fillStyle = '#7ad050'; g.fillRect(x, y, w, 3); g.fillStyle = '#b4f08a'; g.fillRect(x, y, w, 1);
  }
  const HUT = { rows: [
    '......dddddd......', '....ddyyyyyydd....', '..ddyyYyyyyYyydd..', 'ddyyyyyyyyyyyyyydd', '.dwwwwwwwwwwwwwwd.', '.dwwwdddwwwbbbwwd.',
    '.dwwwdDdwwwbBbwwd.', '.dwwwdDdwwwbbbwwd.', '.dddddddddddddddd.', '..t............t..', '..t............t..'],
    pal: { d: '#4a2a14', y: '#d8a050', Y: '#f2d080', w: '#c48a50', D: '#6b4421', b: '#7ac0e8', B: '#c8ecff', t: '#6b4421' } };
  const CASTLE = { rows: [
    'd.d....d.d', 'ddd....ddd', 'dsd.r..dsd', 'dsd.rd.dsd', 'dsdddddddd', 'dsssssssss', 'dssdddssss', 'dssd.dssss', 'dddddddddd'],
    pal: { d: '#b88a50', s: '#e8c890', r: '#e0533d' } };
  const UMBRELLA = { rows: [
    '......rr......', '...rrWWrrWW...', '.rrWWrrWWrrWW.', 'rWWrrWWrrWWrrW', '.......t......', '.......t......', '.......t......', '.......t......',
    '.......t......', '.......t......', '......ttt.....'],
    pal: { r: '#e0533d', W: '#ffffff', t: '#6b4421' } };
  const STARFISH = { rows: ['..o..', '.ooo.', 'ooooo', '.o.o.', 'o...o'], pal: { o: '#ff8a5a' } };
  const DEADTREE = { rows: [
    '.d.....d...', '..d...d..d.', '..d..d..d..', '...ddd.d...', '....dd.d...', '.....ddd...', '......d....', '......d....', '.....dd....', '.....dd....', '....ddd....'],
    pal: { d: '#24141a' } };
  const SNOWMAN = { rows: [
    '....kkk....', '...kkkkk...', '..WWWWWWW..', '..WkWWWkW..', '..WWWoWWW..', '...WWWWW...', '..rrrrrrr..', '.WWWWkWWWW.', 'tWWWWWWWWWt',
    '.WWWWkWWWW.', 'WWWWWWWWWWW', 'WWWWWkWWWWW', 'WWWWWWWWWWW', '.WWWWWWWWW.'],
    pal: { k: '#2a2a3a', W: '#ffffff', o: '#ff8a2a', r: '#e0533d', t: '#6b4421' } };
  const PILLARS = { rows: [
    'dddddddddddd', 'dWWWWWWWWWWd', '.dWd....dWd.', '.dWd....dWd.', '.dWd....dWd.', '.dWd....dWd.', '.dWd....dWd.', '.dWd....dWd.',
    '.dWd....dWd.', '.dWd....dWd.', '.dWd....dWd.', 'dWWWd..dWWWd', 'dddddddddddd'],
    pal: { d: '#8a8aa8', W: '#f4f4ff' } };

  function barn(g, x, y) {
    const rows = [
      '........dddddddd........',
      '......ddRRRRRRRRdd......',
      '....ddRRRRRRRRRRRRdd....',
      '..ddRRrrrrrrrrrrrrRRdd..',
      'ddRRrrrrrrrrrrrrrrrrRRdd',
      'dWWWWWWWWWWWWWWWWWWWWWWd',
      '.drrrrrrrrrddrrrrrrrrrd.',
      '.drrrrrrrrdyydrrrrrrrrd.',
      '.drrrrrrrrdyydrrrrrrrrd.',
      '.drrrrrrrrrddrrrrrrrrrd.',
      '.drrrrrrrrrrrrrrrrrrrrd.',
      '.drrrrrdddddddddrrrrrrd.',
      '.drrrrrdWbWWWbWdrrrrrrd.',
      '.drrrrrdbWbWbWbdrrrrrrd.',
      '.drrrrrdWWbWbWWdrrrrrrd.',
      '.drrrrrdWbWWWbWdrrrrrrd.',
      '.drrrrrdbWbWbWbdrrrrrrd.',
      '.drrrrrdWWbWbWWdrrrrrrd.',
      '.drrrrrdWbWWWbWdrrrrrrd.',
      '.ddddddddddddddddddddd..',
    ];
    const pal = { d: '#3a1c14', R: '#7d2c22', r: '#c4473a', W: '#f3e9d8', b: '#9e3328', y: '#ffe38a' };
    g.drawImage(fromRows(rows, pal), x, y);
  }

  function tree(g, x, y, s = 1) {
    const key = 'tree'; let c = cache.get(key);
    if (!c) {
      const rows = [
        '.....dddddd.....', '...ddLLLLGGdd...', '..dLLLLGGGGGGd..', '.dLLLGGGGGGGgGd.', 'dLLGGGGGGGGGGggd',
        'dLGGGGGGGGGgggGd', 'dGGGGGGGGGgggggd', 'dGGGGGgGGGGgggdd', '.dGGGgggGGggggd.', '..ddggggggggdd..',
        '....dddttddd....', '.......tT.......', '.......tT.......', '.......tT.......', '......ttTT......', '.....ttttTT.....'];
      c = fromRows(rows, { d: '#24521f', L: '#a6e070', G: '#5fb04a', g: '#3e8a36', t: '#6b4421', T: '#9b6a3a' });
      cache.set(key, c);
    }
    g.drawImage(c, 0, 0, c.width, c.height, x, y, Math.round(c.width * s * 1.6), Math.round(c.height * s * 1.6));
  }

  function cloud(i) {
    const key = 'cloud' + i; let c = cache.get(key); if (c) return c;
    const R = rand(31 + i * 17), w = 30 + Math.floor(R() * 26), h = 12 + Math.floor(R() * 6);
    c = mk(w, h); const g = c.getContext('2d');
    const blobs = []; for (let k = 0; k < 5; k++) blobs.push([4 + R() * (w - 8), h * 0.55 + R() * 2, 4 + R() * (h * 0.45)]);
    const inC = (x, y) => y < h - 1 && blobs.some(([bx, by, r]) => Math.hypot(x - bx, (y - by) * 1.3) < r);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inC(x, y)) continue;
      const edgeBelow = !inC(x, y + 2);
      g.fillStyle = edgeBelow ? (dither(x, y, 0.5) ? '#d4e4f4' : '#e8f1fb') : '#ffffff';
      g.fillRect(x, y, 1, 1);
    }
    cache.set(key, c); return c;
  }

  // 寶石包圖示：依價位 1-6 級，寶石越疊越多
  function gemPack(level) {
    const key = 'gp' + level; let c = cache.get(key); if (c) return c;
    const gem = icon('gem');
    if (level >= 7) { // 寶石宇宙：星空裡的寶石漩渦
      c = mk(32, 32); const g = c.getContext('2d');
      const gr = g.createRadialGradient(16, 16, 2, 16, 16, 16); gr.addColorStop(0, '#5a3a9a'); gr.addColorStop(0.6, '#1a1040'); gr.addColorStop(1, 'rgba(10,6,30,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(16, 16, 16, 0, 7); g.fill();
      const R = rand(77); g.fillStyle = '#ffffff'; for (let i = 0; i < 26; i++) g.fillRect((R() * 32) | 0, (R() * 32) | 0, 1, 1);
      for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 4; i++) {
        const ang = arm * 2.09 + i * 0.75, r = 3 + i * 3.4;
        g.drawImage(gem, Math.round(16 + Math.cos(ang) * r - 4), Math.round(16 + Math.sin(ang) * r * 0.8 - 4));
      }
      g.fillStyle = '#fff6c0'; g.fillRect(15, 15, 2, 2); g.fillRect(14, 16, 4, 1); g.fillRect(16, 14, 1, 4);
      cache.set(key, c); return c;
    }
    const layouts = [
      [[8, 10]],
      [[4, 10], [12, 10]],
      [[2, 12], [10, 12], [6, 6]],
      [[0, 14], [8, 14], [16, 14], [4, 8], [12, 8]],
      [[0, 16], [7, 16], [14, 16], [3, 10], [11, 10], [7, 4], [18, 11]],
      [[0, 17], [6, 17], [12, 17], [18, 17], [3, 11], [9, 11], [15, 11], [6, 5], [12, 5], [9, 0]],
    ][Math.max(0, Math.min(5, level - 1))];
    c = mk(26, 26); const g = c.getContext('2d');
    if (level >= 5) { g.fillStyle = level >= 6 ? '#fff3a066' : '#ffffff44'; g.beginPath(); g.arc(13, 14, 12, 0, 7); g.fill(); }
    for (const [x, y] of layouts) g.drawImage(gem, x, y);
    if (level >= 6) { g.fillStyle = '#fff'; [[2, 3], [22, 6], [21, 1]].forEach(([x, y]) => { g.fillRect(x, y + 1, 3, 1); g.fillRect(x + 1, y, 1, 3); }); }
    cache.set(key, c); return c;
  }
  function gemPackURL(level, scale = 2) {
    const key = 'gpu' + level + '|' + scale; let u = urlCache.get(key); if (u) return u;
    const src = gemPack(level), c = mk(src.width * scale, src.height * scale), g = c.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height);
    u = c.toDataURL(); urlCache.set(key, u); return u;
  }

  // 給 UI 用的 dataURL
  const urlCache = new Map();
  function slimeURL(type, scale = 3) {
    const key = type.id + '|' + scale; let u = urlCache.get(key); if (u) return u;
    const src = slimeCanvas(type, 0, false, 0), c = mk(src.width * scale, src.height * scale), g = c.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height);
    u = c.toDataURL(); urlCache.set(key, u); return u;
  }
  // 圖鑑未發現：剪影
  function silhouetteURL(type, scale = 3) {
    const key = 'sil' + type.id + '|' + scale; let u = urlCache.get(key); if (u) return u;
    const src = slimeCanvas(type, 0, false, 0), c = mk(src.width * scale, src.height * scale), g = c.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#3a3050'; g.fillRect(0, 0, c.width, c.height);
    u = c.toDataURL(); urlCache.set(key, u); return u;
  }
  function iconURL(name, scale = 3) {
    const key = 'i' + name + '|' + scale; let u = urlCache.get(key); if (u) return u;
    const src = icon(name); if (!src) return '';
    const c = mk(src.width * scale, src.height * scale), g = c.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height);
    u = c.toDataURL(); urlCache.set(key, u); return u;
  }

  window.Sprites = { THEMES, sceneLayers, ZONE_NAMES, zoneOf, silhouetteURL, gemPackURL, slimeCanvas, slimeSize, ACC_TOP, icon, drawText, scene, cloud, slimeURL, iconURL, rgb, mix, css };
})();
