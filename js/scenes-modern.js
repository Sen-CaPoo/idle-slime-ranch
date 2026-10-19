// scenes-modern.js — 現代日系 RPG 風格的地區背景（v2.0，ccline-0b）
// 繪本感：多段漸層天空、有輪廓的柔邊雲、空氣透視的遠景剪影、成簇的草葉筆觸、前景柔焦大物件（DESIGN-v2 §11.2）。
// 全部用 Canvas 程式繪製（不使用外部圖檔），靜態層在第一次用到時繪製並快取；只有雲之類的動態元素會更新。
// 輸出 1280×720（邏輯 320×180 × 4）的分層，交給 hd2d 的 modern 模式合成；座標參數（光源、地平線）一律用邏輯座標。
(function () {
  'use strict';
  const W = 1280, H = 720, K = 4;          // K：每個邏輯像素 = 4 個圖層像素
  const CLOUD_HZ = 10;                      // 雲每秒重畫 10 次（飄得很慢，看不出差別，可以省下大量上傳）
  const WALK = { yMin: 110, yMax: 157 };    // 角色站的帶狀區（邏輯座標）：前景物件要避開

  // ---------- 工具 ----------
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w || W; c.height = h || H; return c; }
  function rng(seed) {   // mulberry32：固定種子，每次畫出來都一樣
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgba(hex, a) { const x = hexRgb(hex); return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')'; }
  function vgrad(ctx, y0, y1, stops) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }
  function circle(ctx, x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  // 柔邊圓（放射漸層）：光暈、柔焦物件的基本筆觸；hard 越大邊緣越清楚
  function softBlob(ctx, x, y, r, color, alpha, hard) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(hard == null ? 0.55 : hard, rgba(color, alpha * 0.85));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 細碎雜訊（低對比的顆粒，做出紙張／筆刷質感；不畫長線，避免看起來像雨絲）
  function speckle(ctx, rnd, area, colors, count, size, alpha) {
    for (let i = 0; i < count; i++) {
      const x = area.x + rnd() * area.w, y = area.y + rnd() * area.h;
      if (area.test && !area.test(x, y)) continue;
      ctx.fillStyle = rgba(colors[Math.floor(rnd() * colors.length)], alpha * (0.4 + rnd() * 0.6));
      ctx.beginPath(); ctx.ellipse(x, y, size * (0.6 + rnd()), size * (0.4 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 一簇草葉：同一個根部長出 4–7 片弧形葉子，同簇同色系（深→淺），葉尖朝受光方向（左上）偏
  function tuft(ctx, rnd, x, y, size, family) {
    const n = 4 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5, h = size * (0.6 + rnd() * 0.5) * (1 - Math.abs(t) * 0.5);
      const tipX = x + t * size * 0.9 - size * 0.12, tipY = y - h;
      ctx.fillStyle = family[Math.min(family.length - 1, Math.floor((1 - Math.abs(t)) * family.length * 0.99 + rnd() * 0.6))];
      ctx.beginPath();
      ctx.moveTo(x + t * size * 0.25 - size * 0.06, y);
      ctx.quadraticCurveTo(x + t * size * 0.35, y - h * 0.55, tipX, tipY);
      ctx.quadraticCurveTo(x + t * size * 0.4 + size * 0.05, y - h * 0.5, x + t * size * 0.25 + size * 0.06, y);
      ctx.closePath(); ctx.fill();
    }
  }
  // 在一片區域內種草簇：越近（y 越大）越大，密度用 count 控制
  function grassField(ctx, rnd, y0, y1, count, families, avoid) {
    const pts = [];
    for (let i = 0; i < count; i++) { const y = y0 + Math.pow(rnd(), 0.8) * (y1 - y0); pts.push([rnd() * W, y]); }
    pts.sort(function (a, b) { return a[1] - b[1]; });   // 由遠到近畫，近的蓋住遠的
    pts.forEach(function (p) {
      if (avoid && avoid(p[0], p[1])) return;
      const k = (p[1] - y0) / (y1 - y0);
      tuft(ctx, rnd, p[0], p[1], 8 + k * 26, families[Math.floor(rnd() * families.length)]);
    });
  }
  // 中景後處理：對比、飽和度（a3 定調：中景 +10% 對比、+8% 飽和）
  function adjust(cv, contrast, sat) {
    const x = cv.getContext('2d'), img = x.getImageData(0, 0, cv.width, cv.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
      d[i] = (r - 128) * contrast + 128; d[i + 1] = (g - 128) * contrast + 128; d[i + 2] = (b - 128) * contrast + 128;
    }
    x.putImageData(img, 0, 0);
  }
  // 山脊線：幾個正弦波，回傳每個 x 的高度
  function ridge(rnd, base, amp, waves) {
    const ph = waves.map(function () { return rnd() * Math.PI * 2; });
    return function (x) { let y = base; waves.forEach(function (w, i) { y -= Math.sin(x * w[0] + ph[i]) * amp * w[1]; }); return y; };
  }
  function fillRidge(ctx, f, fill, bottom) {
    ctx.beginPath(); ctx.moveTo(0, bottom);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, f(x));
    ctx.lineTo(W, bottom); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function rimRidge(ctx, f, color, width, dy) {   // 稜線受光邊
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); for (let px = 0; px <= W; px += 8) px ? ctx.lineTo(px, f(px) + dy) : ctx.moveTo(px, f(px) + dy); ctx.stroke();
  }
  function stars(ctx, rnd, n, yMax, color) {
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = Math.pow(rnd(), 1.4) * yMax, r = 0.6 + rnd() * 1.6;
      ctx.fillStyle = rgba(color || '#ffffff', 0.4 + rnd() * 0.6); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (r > 1.8) softBlob(ctx, x, y, r * 5, color || '#ffffff', 0.25, 0.2);
    }
  }
  // 賽璐璐葉團：底色圓 → 左上月牙受光 → 右下陰影（大塊明暗，不畫斜線紋理）
  function leafClump(ctx, cx, cy, r, base, light, dark) {
    const puffs = [[0, 0, 1], [-0.6, 0.25, 0.7], [0.6, 0.25, 0.72], [-0.3, -0.45, 0.68], [0.35, -0.4, 0.66]];
    puffs.forEach(function (p) { circle(ctx, cx + p[0] * r, cy + p[1] * r, p[2] * r, base); });
    puffs.forEach(function (p) {
      if (p[0] > 0.3 && p[1] > 0) return;
      const px = cx + p[0] * r, py = cy + p[1] * r, pr = p[2] * r;
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip();
      circle(ctx, px - pr * 0.15, py - pr * 0.18, pr * 0.8, light);
      circle(ctx, px + pr * 0.12, py + pr * 0.1, pr * 0.82, base);
      ctx.restore();
    });
    puffs.forEach(function (p) {
      if (p[0] < 0 && p[1] < 0) return;
      const px = cx + p[0] * r, py = cy + p[1] * r, pr = p[2] * r;
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.clip();
      circle(ctx, px + pr * 0.35, py + pr * 0.4, pr * 0.8, dark);
      ctx.restore();
    });
  }
  function treeTrunk(ctx, cx, cy, r, c1, c2) {
    ctx.fillStyle = c1; ctx.fillRect(cx - r * 0.12, cy, r * 0.24, r * 1.1);
    ctx.fillStyle = c2; ctx.fillRect(cx + r * 0.02, cy, r * 0.1, r * 1.1);
  }
  // 針葉樹：三層三角形，左半受光、右半陰影；snow=true 時枝頭有積雪
  function pine(ctx, x, base, h, light, dark, snow) {
    ctx.fillStyle = '#4a3424'; ctx.fillRect(x - h * 0.04, base - h * 0.12, h * 0.08, h * 0.14);
    for (let i = 0; i < 3; i++) {
      const top = base - h * (0.45 + i * 0.25), bot = base - h * (0.08 + i * 0.22), w = h * (0.34 - i * 0.08);
      ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x - w, bot); ctx.lineTo(x, bot); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w, bot); ctx.lineTo(x, bot); ctx.closePath(); ctx.fill();
      if (snow) {
        ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x - w * 0.55, top + (bot - top) * 0.55);
        ctx.quadraticCurveTo(x, top + (bot - top) * 0.4, x + w * 0.45, top + (bot - top) * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#dfe8f6'; ctx.fillRect(x - w, bot - 3, w * 2, 4);
      }
    }
  }
  // 椰子樹：彎曲樹幹（有環紋）＋葉片；backlit=true 時是夕陽背光（暗色剪影加亮邊）
  function palm(ctx, rnd, x, base, h, lean, trunk, leaf, rim) {
    const tx = x + lean * h, ty = base - h;
    ctx.strokeStyle = trunk; ctx.lineWidth = h * 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + lean * h * 0.2, base - h * 0.6, tx, ty); ctx.stroke();
    ctx.strokeStyle = rim; ctx.lineWidth = 2;
    for (let i = 1; i < 9; i++) {   // 環紋
      const t = i / 9, px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x + lean * h * 0.2) + t * t * tx, py = (1 - t) * (1 - t) * base + 2 * (1 - t) * t * (base - h * 0.6) + t * t * ty;
      ctx.beginPath(); ctx.moveTo(px - h * 0.03, py); ctx.lineTo(px + h * 0.03, py + 2); ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {   // 葉片
      const a = -Math.PI / 2 + (i - 3) * 0.55 + (rnd() - 0.5) * 0.2, L = h * (0.42 + rnd() * 0.12);
      const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L + L * 0.35;
      ctx.fillStyle = leaf; ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - 18, ex, ey);
      ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.5, ty + Math.sin(a) * L * 0.5 + 6, tx, ty + 6); ctx.fill();
      ctx.strokeStyle = rim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.6 - 18, ex, ey); ctx.stroke();
    }
  }

  // ---------- 雲（預先繪製成小圖）：清楚的外輪廓、上亮下暗的柔和明暗 ----------
  function makeCloud(rnd, w, h, top, light, shade) {
    const c = canvas(w, h), x = c.getContext('2d');
    const n = 9 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const px = w * (0.14 + rnd() * 0.72), py = h * (0.5 + (rnd() - 0.5) * 0.3), r = h * (0.2 + rnd() * 0.2);
      // 邊緣只柔化最外圈（hard 0.86），保留雲的形狀
      softBlob(x, px, py, r * 1.12, light, 1, 0.86);
    }
    x.fillStyle = light; x.fillRect(w * 0.16, h * 0.62, w * 0.68, h * 0.12);   // 平底
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = vgrad(x, 0, h, [[0, rgba(top, 0.9)], [0.35, rgba(top, 0)], [0.55, rgba(shade, 0)], [1, rgba(shade, 0.6)]]);
    x.fillRect(0, 0, w, h);
    return c;
  }

  // ---------- 地區定義 ----------
  // meta：給 render／hd2d 的參數（邏輯座標）；sky：天空底圖；paint：各靜態層；clouds：雲；lights：光源；fx：動態小物件
  const ZONES = {};
  function meta(grade, extra) { return Object.assign({ grade: grade, focusDepth: 0.65, tiltShift: 0.3, walk: WALK }, extra); }

  // ===== 草原（早晨、暖白主光從左上斜射、陰影偏藍）=====
  ZONES.meadow = {
    meta: meta('meadow', { godRays: { x: 40, y: -20, strength: 0.75 }, fog: { color: '#e4ecf2', density: 0.10, horizon: 100 } }),
    clouds: { count: 6, top: '#ffffff', light: '#f6f8fc', shade: '#9fb4d8', yMin: 40, yMax: 220, speed: 6 },
    sky: function (x) {
      x.fillStyle = vgrad(x, 0, H, [[0, '#4f86cc'], [0.30, '#7fb2e2'], [0.52, '#b6d6ee'], [0.62, '#e2ecef'], [0.70, '#f6ead0'], [1, '#f6ead0']]);
      x.fillRect(0, 0, W, H);
      softBlob(x, 150, -60, 760, '#fff3d6', 0.55, 0.2);
      softBlob(x, 150, -60, 260, '#fffaf0', 0.65, 0.3);
    },
    paint: {
      far: function (x, rnd) {
        const f1 = ridge(rnd, 330, 70, [[0.004, 1], [0.011, 0.45], [0.031, 0.12]]);
        fillRidge(x, f1, vgrad(x, 220, 420, [[0, '#9fb9d8'], [1, '#c2d4e4']]), 440);
        const f2 = ridge(rnd, 365, 50, [[0.006, 1], [0.017, 0.4], [0.05, 0.1]]);
        fillRidge(x, f2, vgrad(x, 280, 430, [[0, '#7f9fc4'], [1, '#a9c0d8']]), 440);
        rimRidge(x, f2, 'rgba(255,246,220,0.35)', 3, 2);
        for (let px = -20; px < W + 40; px += 18 + rnd() * 16) circle(x, px, 404 - 6, 14 + rnd() * 14, '#6e9a8a');
        x.fillStyle = '#6e9a8a'; x.fillRect(0, 398, W, 30);
        for (let px = -20; px < W + 40; px += 22 + rnd() * 18) circle(x, px - 4, 398 - 10, 8 + rnd() * 6, '#86ad9c');   // 樹林帶受光
      },
      ground: function (x, rnd) {
        x.fillStyle = vgrad(x, 400, H, [[0, '#a3cf7c'], [0.18, '#82be5e'], [0.55, '#5ea248'], [1, '#3f823a']]);
        x.fillRect(0, 400, W, H - 400);
        const path = new Path2D();
        path.moveTo(560, H); path.bezierCurveTo(600, 600, 700, 520, 650, 470); path.bezierCurveTo(620, 440, 640, 415, 655, 402);
        path.lineTo(668, 402); path.bezierCurveTo(660, 420, 650, 445, 690, 470); path.bezierCurveTo(760, 520, 760, 620, 800, H); path.closePath();
        x.fillStyle = vgrad(x, 400, H, [[0, '#e6d3a6'], [1, '#c9a86e']]); x.fill(path);
        x.save(); x.clip(path); speckle(x, rnd, { x: 540, y: 400, w: 280, h: 320 }, ['#b8955c', '#f0e0b8', '#a88650'], 500, 2.5, 0.6); x.restore();
        // 地面大塊明暗（雲影）
        softBlob(x, 260, 600, 260, '#2f6a34', 0.18, 0.4); softBlob(x, 1060, 560, 220, '#2f6a34', 0.15, 0.4);
        softBlob(x, 900, 480, 200, '#c8f090', 0.15, 0.4);
        // 成簇的草葉（a3：取代斜線筆觸，密度減半）
        const fams = [['#3f8a38', '#5aa548', '#7cc25e'], ['#4a9440', '#6ab454', '#94d070'], ['#36803a', '#4e9a46', '#6fb658']];
        grassField(x, rnd, 412, H + 20, 900, fams, function (px, py) { return x.isPointInPath(path, px, py); });
        // 花：成群出現（不是均勻灑）
        const flowers = ['#ffffff', '#ffe27a', '#ffc4d8', '#d8c8ff'];
        for (let g = 0; g < 26; g++) {
          const gx = rnd() * W, gy = 440 + Math.pow(rnd(), 0.7) * 260, col = flowers[Math.floor(rnd() * flowers.length)];
          for (let i = 0; i < 6 + rnd() * 6; i++) {
            const fx = gx + (rnd() - 0.5) * 70, fy = gy + (rnd() - 0.5) * 24;
            if (x.isPointInPath(path, fx, fy)) continue;
            const s = 1.6 + (fy - 420) / 90;
            for (let k = 0; k < 5; k++) circle(x, fx + Math.cos(k * 1.256) * s, fy + Math.sin(k * 1.256) * s * 0.7, s * 0.8, col);
            circle(x, fx, fy, s * 0.5, '#e0a030');
          }
        }
        softBlob(x, 1000, 432, 120, '#2f5a3a', 0.35, 0.3);
        softBlob(x, 200, 430, 110, '#2f5a3a', 0.30, 0.3);
      },
      mid: function (x, rnd) {
        [[160, 300, 90], [290, 335, 62], [60, 345, 52]].forEach(function (t) {
          treeTrunk(x, t[0], t[1], t[2], '#6a4a32', '#4e3524');
          leafClump(x, t[0], t[1], t[2], '#4c9444', '#8ad06a', '#3a7a3c');
        });
        // 穀倉（我們自己的造型）：屋頂分受光面（左）與背光面（右），屋簷下有陰影
        const bx = 900, by = 250, bw = 210, bh = 170, ridgeY = by - 40, eaveY = by + 40;
        x.fillStyle = '#c6483e'; x.fillRect(bx, eaveY, bw, bh - 40);
        x.fillStyle = '#9c3530'; x.fillRect(bx + bw * 0.62, eaveY, bw * 0.38, bh - 40);
        x.fillStyle = '#e06a5a'; x.fillRect(bx, eaveY, bw * 0.1, bh - 40);
        // 牆板的直向接縫（低對比）
        x.fillStyle = 'rgba(90,20,20,0.18)'; for (let px = bx + 18; px < bx + bw; px += 22) x.fillRect(px, eaveY, 2, bh - 40);
        x.fillStyle = vgrad(x, eaveY, eaveY + 30, [[0, 'rgba(40,10,10,0.45)'], [1, 'rgba(40,10,10,0)']]); x.fillRect(bx, eaveY, bw, 30);   // 屋簷陰影
        x.fillStyle = '#8c4a3e'; x.beginPath(); x.moveTo(bx - 18, eaveY); x.lineTo(bx + bw / 2, ridgeY); x.lineTo(bx + bw / 2, eaveY); x.closePath(); x.fill();   // 受光面
        x.fillStyle = '#4c2622'; x.beginPath(); x.moveTo(bx + bw / 2, ridgeY); x.lineTo(bx + bw + 18, eaveY); x.lineTo(bx + bw / 2, eaveY); x.closePath(); x.fill();   // 背光面
        x.strokeStyle = '#c47a66'; x.lineWidth = 4; x.beginPath(); x.moveTo(bx - 18, eaveY); x.lineTo(bx + bw / 2, ridgeY); x.stroke();   // 受光稜線
        x.fillStyle = '#3a1c1a'; x.fillRect(bx - 18, eaveY - 4, bw + 36, 6);   // 屋簷
        const dx = bx + bw * 0.34, dw = bw * 0.32, dy = by + 80, dh = bh - 80;
        x.fillStyle = '#4a2420'; x.fillRect(dx, dy, dw, dh);
        x.strokeStyle = '#f2ece0'; x.lineWidth = 6; x.strokeRect(dx, dy, dw, dh);
        x.beginPath(); x.moveTo(dx, dy); x.lineTo(dx + dw, dy + dh); x.moveTo(dx + dw, dy); x.lineTo(dx, dy + dh); x.stroke();
        x.fillStyle = '#f2ece0'; x.fillRect(bx + bw / 2 - 16, by + 4, 32, 26);
        x.fillStyle = '#3a2420'; x.fillRect(bx + bw / 2 - 11, by + 9, 22, 16);
        for (let px = -10; px < W + 20; px += 64) {
          x.fillStyle = '#b8895a'; x.fillRect(px, 404, 14, 40);
          x.fillStyle = '#8a6040'; x.fillRect(px + 9, 404, 5, 40);
          x.fillStyle = '#e0b888'; x.fillRect(px, 404, 4, 40);
        }
        x.fillStyle = '#c4956a'; x.fillRect(0, 414, W, 8); x.fillRect(0, 430, W, 7);
        x.fillStyle = '#8a6040'; x.fillRect(0, 421, W, 2); x.fillRect(0, 436, W, 2);
      },
      fg: function (x, rnd) {
        const fam = ['#24582a', '#2f6a32', '#3f8a3c'];
        for (let i = 0; i < 14; i++) tuft(x, rnd, 20 + rnd() * 150, H + 10, 150 + rnd() * 90, fam);
        for (let i = 0; i < 14; i++) tuft(x, rnd, W - 20 - rnd() * 150, H + 10, 150 + rnd() * 90, fam);
        x.strokeStyle = '#4a3424'; x.lineWidth = 16; x.lineCap = 'round';
        x.beginPath(); x.moveTo(-20, 30); x.quadraticCurveTo(120, 50, 230, 20); x.stroke();
        for (let i = 0; i < 18; i++) {
          const t = rnd(), lx = -20 + t * 250, ly = 30 + Math.sin(t * 3) * 18 + 20 + rnd() * 40;
          x.fillStyle = rnd() < 0.5 ? '#3a7a3c' : '#5aa04c';
          x.beginPath(); x.ellipse(lx, ly, 26, 12, rnd() * Math.PI, 0, Math.PI * 2); x.fill();
        }
      }
    },
    midAdjust: [1.10, 1.08],
    lights: function () { return []; },
    fx: function (ctx, t) {   // 花粉
      for (let i = 0; i < 26; i++) {
        const s = (t * 0.05 + i * 0.137) % 1;
        softBlob(ctx, (i * 197 + Math.sin(t * 0.7 + i) * 40) % W, 640 - s * 360 + Math.sin(t * 1.3 + i * 2) * 10, 6, '#fff6c8', 0.7 * Math.sin(s * Math.PI), 0.3);
      }
    }
  };

  // ===== 海邊（黃昏、橘金夕陽背光、陰影偏紫）=====
  ZONES.beach = {
    meta: meta('beach', { godRays: { x: 230, y: 70, strength: 0.85 }, fog: { color: '#ffc8a0', density: 0.12, horizon: 100 } }),
    clouds: { count: 5, top: '#ffe2b8', light: '#f8b89a', shade: '#7a4a8a', yMin: 50, yMax: 230, speed: 4 },
    sky: function (x) {
      x.fillStyle = vgrad(x, 0, 380, [[0, '#2e2464'], [0.3, '#6a3c86'], [0.55, '#c25c84'], [0.78, '#f2905a'], [1, '#ffd48a']]);
      x.fillRect(0, 0, W, 380);
      softBlob(x, 920, 330, 520, '#ffb070', 0.6, 0.15);
      circle(x, 920, 340, 64, '#fff0c0');   // 夕陽
      softBlob(x, 920, 340, 150, '#ffe0a0', 0.6, 0.3);
    },
    paint: {
      far: function (x, rnd) {
        // 海：上緣接地平線，夕陽倒影是一條垂直的金色帶
        x.fillStyle = vgrad(x, 370, 480, [[0, '#7a4a7e'], [0.4, '#4a3a7a'], [1, '#2e3a6e']]); x.fillRect(0, 370, W, 110);
        for (let i = 0; i < 60; i++) {
          const yy = 375 + Math.pow(rnd(), 1.3) * 100, half = 18 + (yy - 370) * 1.2 * rnd();
          x.fillStyle = rgba(rnd() < 0.5 ? '#ffd890' : '#ffb070', 0.5 + rnd() * 0.4);
          x.fillRect(920 - half + (rnd() - 0.5) * 30, yy, half * 2 * (0.3 + rnd() * 0.5), 2 + (yy - 370) / 30);
        }
        // 遠方島嶼剪影（紫，空氣透視）
        const f = ridge(rnd, 372, 18, [[0.012, 1], [0.04, 0.3]]);
        x.save(); x.beginPath(); x.rect(80, 300, 380, 80); x.clip(); fillRidge(x, f, '#5a3a72', 380); x.restore();
        x.fillStyle = '#4a2e66'; x.beginPath(); x.moveTo(1080, 376); x.quadraticCurveTo(1150, 330, 1230, 376); x.fill();
        // 帆船剪影
        x.fillStyle = '#3a2452'; x.beginPath(); x.moveTo(560, 388); x.lineTo(610, 388); x.lineTo(600, 396); x.lineTo(568, 396); x.fill();
        x.beginPath(); x.moveTo(585, 386); x.lineTo(585, 340); x.lineTo(606, 384); x.fill();
      },
      ground: function (x, rnd) {
        // 濕沙（靠海）→ 乾沙，浪花線
        x.fillStyle = vgrad(x, 470, H, [[0, '#c88a74'], [0.08, '#e8b48a'], [0.4, '#f2c896'], [1, '#d8a46c']]); x.fillRect(0, 470, W, H - 470);
        x.fillStyle = vgrad(x, 466, 500, [[0, 'rgba(255,240,230,0.9)'], [1, 'rgba(255,240,230,0)']]);
        x.beginPath(); x.moveTo(0, 470); for (let px = 0; px <= W; px += 20) x.lineTo(px, 470 + Math.sin(px * 0.02) * 5); x.lineTo(W, 500); x.lineTo(0, 500); x.fill();
        // 沙紋（低對比的弧線）＋顆粒
        x.strokeStyle = 'rgba(190,130,90,0.35)'; x.lineWidth = 2;
        for (let i = 0; i < 70; i++) { const px = rnd() * W, py = 510 + rnd() * 200, w = 30 + rnd() * 60; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + w / 2, py - 4, px + w, py); x.stroke(); }
        speckle(x, rnd, { x: 0, y: 480, w: W, h: 240 }, ['#b8865a', '#fff0d0', '#c89a6a'], 900, 1.6, 0.6);
        // 貝殼和海星（小，暖色）
        for (let i = 0; i < 14; i++) {
          const px = rnd() * W, py = 520 + rnd() * 180, s = 4 + rnd() * 5;
          x.fillStyle = rnd() < 0.5 ? '#ffe0d0' : '#ff9a7a'; x.beginPath(); x.ellipse(px, py, s, s * 0.7, 0, Math.PI, 0); x.fill();
        }
        softBlob(x, 1050, 510, 140, '#6a3a5a', 0.25, 0.3);   // 小屋的影子
      },
      mid: function (x, rnd) {
        // 椰子樹（夕陽背光：深色剪影加橘色亮邊）
        palm(x, rnd, 140, 500, 260, 0.18, '#4a2e3a', '#3a3a3a', '#ff9a5a');
        palm(x, rnd, 260, 486, 200, -0.12, '#4a2e3a', '#2f3a34', '#ff9a5a');
        palm(x, rnd, 1210, 496, 240, -0.2, '#4a2e3a', '#33382e', '#ffa060');
        // 海邊小屋（高腳木屋、茅草屋頂）
        const hx = 980, hy = 400;
        x.fillStyle = '#5a3a3a'; [0, 50, 100, 150].forEach(function (o) { x.fillRect(hx + o, hy + 60, 8, 60); });
        x.fillStyle = '#a8704a'; x.fillRect(hx - 10, hy, 180, 64);
        x.fillStyle = '#7a4a34'; x.fillRect(hx + 110, hy, 60, 64);
        x.fillStyle = '#ffd890'; x.fillRect(hx + 40, hy + 18, 34, 26);   // 窗（暖光）
        x.fillStyle = '#e0a060'; x.beginPath(); x.moveTo(hx - 30, hy + 4); x.lineTo(hx + 80, hy - 60); x.lineTo(hx + 80, hy + 4); x.fill();
        x.fillStyle = '#9a5a3a'; x.beginPath(); x.moveTo(hx + 80, hy - 60); x.lineTo(hx + 190, hy + 4); x.lineTo(hx + 80, hy + 4); x.fill();
        x.strokeStyle = '#ffc080'; x.lineWidth = 3; x.beginPath(); x.moveTo(hx + 80, hy - 60); x.lineTo(hx + 190, hy + 4); x.stroke();   // 背光亮邊
        x.fillStyle = vgrad(x, hy + 4, hy + 30, [[0, 'rgba(40,10,30,0.4)'], [1, 'rgba(40,10,30,0)']]); x.fillRect(hx - 10, hy + 4, 180, 26);
      },
      fg: function (x, rnd) {
        // 右上角的大椰子葉、左下角的海邊草（柔焦）
        // 羽狀葉：沿中肋兩側長出一片片小葉（背光：深綠剪影）
        function frond(x0, y0, x1, y1, bend, len) {
          x.strokeStyle = '#2a3a2a'; x.lineWidth = 6; x.lineCap = 'round';
          const mx = (x0 + x1) / 2 + bend[0], my = (y0 + y1) / 2 + bend[1];
          x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo(mx, my, x1, y1); x.stroke();
          for (let i = 1; i < 16; i++) {
            const t = i / 16, px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
            const dx = 2 * (1 - t) * (mx - x0) + 2 * t * (x1 - mx), dy = 2 * (1 - t) * (my - y0) + 2 * t * (y1 - my), a = Math.atan2(dy, dx), L = len * (1 - t * 0.6);
            [1, -1].forEach(function (sd) {
              const la = a + sd * 1.1 + 0.35;
              x.fillStyle = sd > 0 ? '#2f4a32' : '#24382a'; x.beginPath(); x.moveTo(px, py);
              x.quadraticCurveTo(px + Math.cos(la) * L * 0.5 - 6, py + Math.sin(la) * L * 0.5, px + Math.cos(la) * L, py + Math.sin(la) * L + 8);
              x.quadraticCurveTo(px + Math.cos(la) * L * 0.5 + 6, py + Math.sin(la) * L * 0.5 + 6, px, py); x.fill();
            });
          }
        }
        frond(W + 30, -30, W - 330, 150, [40, -60], 70);
        frond(W + 30, -10, W - 220, 230, [60, -20], 60);
        const fam = ['#5a6a3a', '#7a8a4a', '#9aa060'];
        for (let i = 0; i < 12; i++) tuft(x, rnd, 30 + rnd() * 140, H + 10, 130 + rnd() * 80, fam);
      }
    },
    midAdjust: [1.08, 1.06],
    lights: function () { return [{ x: 254, y: 107, radius: 26, color: '#ffd890', intensity: 0.9, layer: 'mid' }]; },   // 小屋窗戶
    fx: function (ctx, t) {   // 海面的閃光
      for (let i = 0; i < 18; i++) {
        const s = (t * 0.6 + i * 0.31) % 1;
        softBlob(ctx, 860 + ((i * 37) % 120) + Math.sin(i) * 20, 385 + (i * 13) % 90, 5, '#fff4c8', Math.sin(s * Math.PI) * 0.9, 0.3);
      }
    }
  };

  // ===== 火山（夜、熔岩點光源、冷藍月光）=====
  ZONES.volcano = {
    meta: meta('volcano', { godRays: null, fog: { color: '#3a1810', density: 0.25, horizon: 170 },
      actorAmbientMin: 0.6, actorRim: { color: '#ff8a40', dir: [0, 1], strength: 0.9 } }),   // 角色從暗場中浮出：熔岩在下方，邊緣光從下往上
    clouds: { count: 5, top: '#7a4a4a', light: '#3a2a30', shade: '#ff6a30', yMin: 30, yMax: 200, speed: 3 },
    sky: function (x, rnd) {
      x.fillStyle = vgrad(x, 0, 420, [[0, '#0a0814'], [0.5, '#1e0e1a'], [0.85, '#4a1414'], [1, '#7a2414']]); x.fillRect(0, 0, W, 420);
      stars(x, rnd, 160, 260, '#cfe0ff');
      softBlob(x, 180, 110, 160, '#7a9ad8', 0.4, 0.3);   // 冷月的光暈
      const moon = canvas(120, 120), mc = moon.getContext('2d');   // 月牙：亮圓挖掉偏移的圓（不要畫深色圓蓋上去）
      circle(mc, 60, 60, 42, '#e6eeff'); mc.globalCompositeOperation = 'destination-out'; circle(mc, 78, 50, 38, '#000000');
      x.drawImage(moon, 120, 50);
      softBlob(x, 640, 330, 420, '#ff5a20', 0.35, 0.2);   // 火山口的紅光映在天上
    },
    paint: {
      far: function (x, rnd) {
        const f1 = ridge(rnd, 350, 40, [[0.006, 1], [0.02, 0.3]]);
        fillRidge(x, f1, '#2a1418', 440);
        // 火山錐（中央），火山口發光，熔岩流沿山坡
        x.fillStyle = '#1e0e12'; x.beginPath(); x.moveTo(380, 430); x.lineTo(590, 200); x.lineTo(690, 200); x.lineTo(900, 430); x.fill();
        x.fillStyle = '#2e161a'; x.beginPath(); x.moveTo(380, 430); x.lineTo(590, 200); x.lineTo(640, 200); x.lineTo(560, 430); x.fill();   // 受月光面
        softBlob(x, 640, 200, 120, '#ff7a30', 0.8, 0.3); x.fillStyle = '#ffb060'; x.fillRect(592, 194, 96, 10);
        // 熔岩流：蜿蜒、上寬下窄、中段有分岔
        function flow(x0, y0, dir) {
          let px = x0, py = y0, w = 12;
          x.lineCap = 'round'; x.lineJoin = 'round';
          for (let i = 0; i < 14; i++) {
            const nx = px + dir * (8 + rnd() * 10) + (rnd() - 0.5) * 18, ny = py + 16;
            x.lineWidth = w + 8; x.strokeStyle = 'rgba(255,80,20,0.35)'; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
            x.lineWidth = w; x.strokeStyle = '#ff7a2a'; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
            x.lineWidth = w * 0.35; x.strokeStyle = '#ffd070'; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
            if (i === 6) {
              let qx = px, qy = py;
              for (let k = 0; k < 5; k++) { const ux = qx - dir * (6 + rnd() * 8), uy = qy + 16; x.lineWidth = w * 0.6; x.strokeStyle = '#ff7a2a'; x.beginPath(); x.moveTo(qx, qy); x.lineTo(ux, uy); x.stroke(); qx = ux; qy = uy; }
            }
            px = nx; py = ny; w = Math.max(3, w - 0.7);
          }
        }
        flow(618, 206, -1); flow(662, 206, 1);
      },
      ground: function (x, rnd) {
        x.fillStyle = vgrad(x, 420, H, [[0, '#3a2224'], [0.4, '#2a181a'], [1, '#1a0e10']]); x.fillRect(0, 420, W, H - 420);
        // 玄武岩裂縫裡的熔岩（發光）
        function crack(x0, y0, len, a) {
          let px = x0, py = y0;
          x.lineCap = 'round';
          x.lineJoin = 'round';
          for (let i = 0; i < 12; i++) {
            const nx = px + Math.cos(a) * len / 12 + (rnd() - 0.5) * 26, ny = py + Math.sin(a) * len / 12 + (rnd() - 0.5) * 16;
            if (rnd() < 0.25) { x.strokeStyle = '#ff8a3a'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.5) * 50, py + (rnd() - 0.2) * 30); x.stroke(); }
            x.strokeStyle = 'rgba(255,80,20,0.45)'; x.lineWidth = 9; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
            x.strokeStyle = '#ffb050'; x.lineWidth = 3; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
            px = nx; py = ny;
          }
        }
        crack(80, 600, 300, -0.15); crack(900, 650, 320, -0.08); crack(500, 690, 200, 0.05);
        softBlob(x, 230, 590, 120, '#ff4a10', 0.25, 0.3); softBlob(x, 1050, 640, 140, '#ff4a10', 0.25, 0.3);
        speckle(x, rnd, { x: 0, y: 430, w: W, h: 290 }, ['#4a3030', '#1a0c0c', '#6a3a30'], 1200, 2, 0.6);
      },
      mid: function (x, rnd) {
        // 尖岩和枯樹（左右），面向熔岩的一側有紅色亮邊
        // 尖岩：左側受冷月光的切面、正面背光切面、右側面向熔岩（暖紅反光＋亮邊）
        function rock(cx, base, w, h) {
          const top = [cx - w * 0.3, base - h], sh = [cx + w * 0.2, base - h * 0.8], mid = [cx - w * 0.05, base - h * 0.35];
          x.fillStyle = '#3a2c3e'; x.beginPath(); x.moveTo(cx - w, base); x.lineTo(top[0], top[1]); x.lineTo(mid[0], mid[1]); x.lineTo(cx - w * 0.2, base); x.fill();   // 月光面
          x.fillStyle = '#22121a'; x.beginPath(); x.moveTo(cx - w * 0.2, base); x.lineTo(mid[0], mid[1]); x.lineTo(top[0], top[1]); x.lineTo(sh[0], sh[1]); x.lineTo(cx + w * 0.45, base); x.fill();   // 背光正面
          x.fillStyle = vgrad(x, base - h * 0.8, base, [[0, '#4a1a1a'], [1, '#8a2a1a']]);
          x.beginPath(); x.moveTo(cx + w * 0.45, base); x.lineTo(sh[0], sh[1]); x.lineTo(cx + w, base); x.fill();   // 熔岩反光面
          x.strokeStyle = '#ff8a4a'; x.lineWidth = 3; x.beginPath(); x.moveTo(sh[0], sh[1]); x.lineTo(cx + w, base); x.stroke();
          x.strokeStyle = 'rgba(160,170,220,0.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - w, base); x.lineTo(top[0], top[1]); x.stroke();   // 月光稜線
        }
        rock(110, 450, 110, 170); rock(250, 440, 60, 90); rock(1150, 450, 120, 190); rock(1010, 440, 50, 80);
        x.strokeStyle = '#1a0e10'; x.lineWidth = 8; x.lineCap = 'round';
        [[330, 440, 300, 330], [960, 440, 990, 340]].forEach(function (p) {
          x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[2], p[3]); x.stroke();
          for (let i = 0; i < 3; i++) { x.lineWidth = 4; x.beginPath(); x.moveTo(p[0] + (p[2] - p[0]) * (0.4 + i * 0.2), p[1] + (p[3] - p[1]) * (0.4 + i * 0.2)); x.lineTo(p[2] + (i - 1) * 40, p[3] + 20 - i * 10); x.stroke(); x.lineWidth = 8; }
        });
      },
      fg: function (x, rnd) {
        x.fillStyle = '#120808';
        x.beginPath(); x.moveTo(-20, H); x.lineTo(-20, 560); x.lineTo(90, 600); x.lineTo(180, 660); x.lineTo(230, H); x.fill();
        x.beginPath(); x.moveTo(W + 20, H); x.lineTo(W + 20, 540); x.lineTo(W - 120, 610); x.lineTo(W - 200, H); x.fill();
        x.strokeStyle = 'rgba(255,100,40,0.6)'; x.lineWidth = 4; x.beginPath(); x.moveTo(90, 600); x.lineTo(180, 660); x.stroke();
      }
    },
    midAdjust: [1.08, 1.05],
    lights: function () {
      return [
        { x: 160, y: 50, radius: 90, color: '#ff5a20', intensity: 0.8, flicker: 0.4, layer: 'far' },
        { x: 57, y: 150, radius: 70, color: '#ff6a20', intensity: 1.1, flicker: 0.6, layer: 'ground', halo: 0 },
        { x: 262, y: 160, radius: 80, color: '#ff6a20', intensity: 1.1, flicker: 0.6, layer: 'ground', halo: 0 }
      ];
    },
    fx: function (ctx, t) {   // 往上飄的火星
      for (let i = 0; i < 34; i++) {
        const s = (t * 0.12 + i * 0.173) % 1, px = (i * 151 + Math.sin(t + i) * 30) % W, py = 700 - s * 520;
        softBlob(ctx, px, py, 4 + (i % 3), i % 2 ? '#ffb050' : '#ff7a30', Math.sin(s * Math.PI), 0.4);
      }
    }
  };

  // ===== 雪山（陰天白晝、平光、冰藍陰影）=====
  ZONES.snow = {
    meta: meta('snow', { godRays: null, fog: { color: '#f0f4fa', density: 0.09, horizon: 105 } }),
    clouds: { count: 7, top: '#f4f6fa', light: '#d8e0ea', shade: '#9aaac0', yMin: 20, yMax: 200, speed: 5 },
    sky: function (x) {
      x.fillStyle = vgrad(x, 0, 420, [[0, '#9eb0c8'], [0.5, '#c4d2e2'], [1, '#e6eef6']]); x.fillRect(0, 0, W, 420);
    },
    paint: {
      far: function (x, rnd) {
        const f1 = ridge(rnd, 300, 90, [[0.005, 1], [0.013, 0.5], [0.04, 0.12]]);
        fillRidge(x, f1, vgrad(x, 180, 420, [[0, '#f2f6fc'], [1, '#c8d6e8']]), 440);
        // 山的陰影面（右側）：沿每座峰往右下的藍色面
        // 整座山先鋪一層冰藍陰影，再把「稜線和往右偏移 50px 的稜線之間」的帶狀區塗回白色＝左側受光坡面
        x.save(); x.beginPath(); x.moveTo(0, 440); for (let px = 0; px <= W; px += 8) x.lineTo(px, f1(px)); x.lineTo(W, 440); x.closePath(); x.clip();
        x.fillStyle = 'rgba(140,165,210,0.45)'; x.fillRect(0, 0, W, 440);
        x.beginPath(); x.moveTo(0, f1(0)); for (let px = 0; px <= W; px += 8) x.lineTo(px, f1(px)); for (let px = W; px >= 0; px -= 8) x.lineTo(px, f1(px - 50) + 6); x.closePath();
        x.fillStyle = '#f4f8fd'; x.fill();
        x.restore();
        const f2 = ridge(rnd, 380, 30, [[0.01, 1], [0.03, 0.3]]);
        for (let px = 0; px < W; px += 26 + rnd() * 10) pine(x, px, f2(px) + 30, 50 + rnd() * 30, '#7a90a8', '#6a7e96', true);
      },
      ground: function (x, rnd) {
        x.fillStyle = vgrad(x, 420, H, [[0, '#dce6f2'], [0.45, '#e6edf6'], [1, '#d0dcec']]); x.fillRect(0, 420, W, H - 420);
        // 雪地起伏：一道道橫向的冰藍陰影（雪丘背光面），上緣清楚、下緣漸淡
        for (let i = 0; i < 7; i++) {
          const cy = 450 + i * 40 + rnd() * 20, cx = rnd() * W, rw = 260 + rnd() * 320, rh = 18 + i * 5;
          x.fillStyle = vgrad(x, cy - rh, cy + rh * 1.6, [[0, 'rgba(201,216,238,0)'], [0.35, 'rgba(201,216,238,0.95)'], [1, 'rgba(201,216,238,0)']]);
          x.beginPath(); x.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.ellipse(cx - rw * 0.1, cy - rh * 0.55, rw * 0.7, rh * 0.25, 0, 0, Math.PI * 2); x.fill();   // 雪丘頂的受光邊
        }
        // 腳印小路
        for (let i = 0; i < 18; i++) { const t = i / 18, px = 640 + Math.sin(t * 4) * 60, py = H - t * 280; x.fillStyle = 'rgba(140,165,200,0.5)'; x.beginPath(); x.ellipse(px + (i % 2 ? 10 : -10), py, 8 - t * 4, 5 - t * 2.5, 0, 0, Math.PI * 2); x.fill(); }
        speckle(x, rnd, { x: 0, y: 430, w: W, h: 290 }, ['#ffffff', '#c8dcf0'], 700, 1.4, 0.7);
      },
      mid: function (x, rnd) {
        pine(x, 120, 450, 220, '#3e6a5a', '#2a5040', true); pine(x, 250, 440, 160, '#3e6a5a', '#2a5040', true); pine(x, 40, 455, 180, '#3e6a5a', '#2a5040', true);
        // 小木屋（屋頂積雪、窗戶透出暖光）
        const cx = 930, cy = 330;
        x.fillStyle = '#8a5a3a'; x.fillRect(cx, cy, 200, 110);
        x.fillStyle = '#6a4228'; x.fillRect(cx + 130, cy, 70, 110);
        x.fillStyle = 'rgba(60,30,20,0.25)'; for (let py = cy + 12; py < cy + 110; py += 16) x.fillRect(cx, py, 200, 3);
        x.fillStyle = '#ffd890'; x.fillRect(cx + 40, cy + 36, 40, 34); softBlob(x, cx + 60, cy + 53, 60, '#ffb060', 0.35, 0.3);
        x.fillStyle = '#4a2a1a'; x.fillRect(cx + 140, cy + 50, 40, 60);
        x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(cx - 24, cy + 6); x.lineTo(cx + 100, cy - 70); x.lineTo(cx + 224, cy + 6); x.quadraticCurveTo(cx + 100, cy - 10, cx - 24, cy + 6); x.fill();
        x.fillStyle = '#c8d8ec'; x.beginPath(); x.moveTo(cx + 100, cy - 70); x.lineTo(cx + 224, cy + 6); x.quadraticCurveTo(cx + 160, cy - 4, cx + 100, cy - 6); x.fill();
        x.fillStyle = vgrad(x, cy + 4, cy + 30, [[0, 'rgba(40,40,70,0.35)'], [1, 'rgba(40,40,70,0)']]); x.fillRect(cx, cy + 4, 200, 26);
      },
      fg: function (x) {
        // 積雪的枝條（右上）和雪堆（兩下角）
        x.strokeStyle = '#3a2a24'; x.lineCap = 'round';
        x.lineWidth = 16; x.beginPath(); x.moveTo(W + 20, 40); x.quadraticCurveTo(W - 140, 70, W - 260, 30); x.stroke();
        x.lineWidth = 7;
        [[W - 90, 58, W - 120, 110], [W - 170, 54, W - 210, 100], [W - 220, 40, W - 280, 70]].forEach(function (b) { x.beginPath(); x.moveTo(b[0], b[1]); x.lineTo(b[2], b[3]); x.stroke(); });
        x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(W - 130, 50, 130, 22, -0.1, Math.PI, 0); x.fill();
        x.fillStyle = '#dce8f6'; x.beginPath(); x.ellipse(W - 110, 52, 90, 8, -0.1, 0, Math.PI); x.fill();
        x.fillStyle = '#f4f8ff'; x.beginPath(); x.ellipse(60, H + 20, 230, 110, 0, Math.PI, 0); x.fill();
        x.beginPath(); x.ellipse(W - 40, H + 30, 240, 120, 0, Math.PI, 0); x.fill();
        x.fillStyle = 'rgba(150,175,215,0.5)'; x.beginPath(); x.ellipse(110, H + 30, 160, 70, 0, Math.PI, 0); x.fill();
      }
    },
    midAdjust: [1.08, 1.04],
    lights: function () { return [{ x: 247, y: 96, radius: 34, color: '#ffc070', intensity: 1, layer: 'mid' }]; },   // 木屋窗
    fx: function (ctx, t) {   // 飄雪：遠小近大
      for (let i = 0; i < 60; i++) {
        const near = i % 4 === 0, s = (t * (near ? 0.09 : 0.05) + i * 0.071) % 1;
        const px = (i * 113 + Math.sin(t * 0.8 + i) * 40 + t * 12) % W, py = -20 + s * (H + 40);
        softBlob(ctx, px, py, near ? 6 : 3, '#ffffff', near ? 0.9 : 0.75, 0.5);
      }
    }
  };

  // ===== 天空城（正午、金白強光從右上、雲海）=====
  ZONES.sky = {
    meta: meta('sky', { godRays: { x: 220, y: -30, strength: 0.9 }, fog: { color: '#eef4ff', density: 0.03, horizon: 150 } }),
    clouds: { count: 6, top: '#ffffff', light: '#f8faff', shade: '#a8bce8', yMin: 60, yMax: 260, speed: 8 },
    sky: function (x) {
      x.fillStyle = vgrad(x, 0, H, [[0, '#2a64d0'], [0.35, '#5a98ea'], [0.62, '#a8d0f6'], [0.75, '#e6f2ff'], [1, '#ffffff']]); x.fillRect(0, 0, W, H);
      softBlob(x, 900, -60, 700, '#fffbe8', 0.55, 0.2); softBlob(x, 900, -60, 240, '#ffffff', 0.7, 0.3);
    },
    paint: {
      far: function (x, rnd) {
        // 遠方浮島（剪影帶空氣透視）＋淡淡的彩虹弧
        x.lineWidth = 14;
        ['#ffb0b0', '#ffe0a0', '#c8f0b0', '#a8d0ff', '#d0b8ff'].forEach(function (c, i) { x.strokeStyle = rgba(c, 0.18); x.beginPath(); x.arc(300, 520, 360 - i * 14, Math.PI * 1.1, Math.PI * 1.75); x.stroke(); });
        // 遠方浮島：草地頂面＋倒錐形岩塊（受光面／背光面）＋小樹，整體偏天空色（空氣透視）
        [[260, 250, 80], [1010, 210, 110], [680, 310, 50]].forEach(function (p) {
          const ix = p[0], iy = p[1], r = p[2];
          x.fillStyle = '#9fb2d4'; x.beginPath(); x.moveTo(ix - r, iy); x.lineTo(ix - r * 0.3, iy + r * 1.1); x.lineTo(ix + r * 0.15, iy + r * 0.9); x.lineTo(ix + r, iy); x.fill();
          x.fillStyle = '#b6c6e2'; x.beginPath(); x.moveTo(ix - r, iy); x.lineTo(ix - r * 0.3, iy + r * 1.1); x.lineTo(ix - r * 0.2, iy); x.fill();
          x.fillStyle = '#a6cfa8'; x.beginPath(); x.ellipse(ix, iy, r, r * 0.2, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#c6e4c0'; x.beginPath(); x.ellipse(ix - r * 0.15, iy - r * 0.04, r * 0.75, r * 0.12, 0, 0, Math.PI * 2); x.fill();
          circle(x, ix + r * 0.4, iy - r * 0.25, r * 0.18, '#94c09c'); circle(x, ix + r * 0.15, iy - r * 0.2, r * 0.13, '#a6cfa8');
        });
        // 雲海（地平線）：一排大朵、底部平的雲
        for (let px = -60; px < W + 80; px += 50 + rnd() * 40) softBlob(x, px, 420 + rnd() * 20, 70 + rnd() * 50, '#ffffff', 1, 0.8);
        x.fillStyle = '#ffffff'; x.fillRect(0, 430, W, 40);
        for (let px = -60; px < W + 80; px += 60 + rnd() * 40) softBlob(x, px, 445, 60, '#c8d8f4', 0.35, 0.5);
      },
      ground: function (x, rnd) {
        // 白色大理石廣場（透視石磚）浮在雲上
        x.fillStyle = vgrad(x, 450, H, [[0, '#d8d2e6'], [0.45, '#e6dcd8'], [1, '#efe6d6']]); x.fillRect(0, 450, W, H - 450);   // 遠處偏紫灰、近處暖白
        x.strokeStyle = 'rgba(190,170,140,0.28)'; x.lineWidth = 2;
        for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(640 + i * 40, 450); x.lineTo(640 + i * 160, H); x.stroke(); }
        for (let r = 0; r < 8; r++) { const y = 450 + Math.pow(r / 8, 1.6) * 270; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
        // 金色地紋：雙圈＋放射線，顏色加深
        x.strokeStyle = 'rgba(200,150,50,0.9)'; x.lineWidth = 7; x.beginPath(); x.ellipse(640, 560, 300, 60, 0, 0, Math.PI * 2); x.stroke();
        x.lineWidth = 3; x.beginPath(); x.ellipse(640, 560, 250, 48, 0, 0, Math.PI * 2); x.stroke();
        for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; x.beginPath(); x.moveTo(640 + Math.cos(a) * 250, 560 + Math.sin(a) * 48); x.lineTo(640 + Math.cos(a) * 300, 560 + Math.sin(a) * 60); x.stroke(); }
        speckle(x, rnd, { x: 0, y: 455, w: W, h: 265 }, ['#ffffff', '#c8c0b0'], 500, 1.6, 0.5);
        softBlob(x, 640, 456, 420, '#ffffff', 0.22, 0.3);   // 地平線的雲氣（減弱）
      },
      mid: function (x) {
        // 神殿柱（白色大理石、金色柱頭；左受光右背光）
        function column(cx, base, h, w) {
          x.fillStyle = '#e8e6e0'; x.fillRect(cx - w / 2, base - h, w, h);
          x.fillStyle = '#c4c2c8'; x.fillRect(cx + w * 0.1, base - h, w * 0.4, h);
          x.fillStyle = 'rgba(150,150,160,0.35)'; for (let i = -2; i <= 2; i++) x.fillRect(cx + i * w * 0.16, base - h, 2, h);
          x.fillStyle = '#e0b050'; x.fillRect(cx - w * 0.7, base - h - 16, w * 1.4, 16); x.fillRect(cx - w * 0.65, base - 10, w * 1.3, 10);
          x.fillStyle = '#b88a30'; x.fillRect(cx + w * 0.2, base - h - 16, w * 0.5, 16);
        }
        // 左右各一對等高的柱子，上面架楣樑和三角山牆（不會懸空）
        [[90, 230], [1050, 1190]].forEach(function (pair) {
          column(pair[0], 470, 250, 44); column(pair[1], 470, 250, 44);
          const l = pair[0] - 40, r = pair[1] + 40;
          x.fillStyle = '#ece9e2'; x.fillRect(l, 186, r - l, 30);
          x.fillStyle = '#c8c6ce'; x.fillRect(l, 208, r - l, 8);
          x.fillStyle = '#e0b050'; x.fillRect(l, 182, r - l, 6);
          x.fillStyle = '#f2f0ea'; x.beginPath(); x.moveTo(l, 182); x.lineTo((l + r) / 2, 140); x.lineTo(r, 182); x.fill();
          x.fillStyle = '#d4d2da'; x.beginPath(); x.moveTo((l + r) / 2, 140); x.lineTo(r, 182); x.lineTo((l + r) / 2, 182); x.fill();
        });
      },
      fg: function (x) {
        // 前景雲絮（兩下角）
        softBlob(x, 80, H + 10, 240, '#ffffff', 1, 0.75); softBlob(x, 260, H + 50, 180, '#f0f4ff', 1, 0.75);
        softBlob(x, W - 80, H + 10, 250, '#ffffff', 1, 0.75); softBlob(x, W - 280, H + 60, 170, '#eef2ff', 1, 0.75);
      }
    },
    midAdjust: [1.15, 1.06],
    lights: function () { return []; },
    fx: function (ctx, t) {   // 光點和羽毛
      for (let i = 0; i < 24; i++) {
        const s = (t * 0.04 + i * 0.211) % 1;
        softBlob(ctx, (i * 173 + Math.sin(t * 0.5 + i) * 60) % W, 120 + s * 520, i % 5 ? 4 : 7, i % 5 ? '#fffbe0' : '#ffffff', Math.sin(s * Math.PI) * 0.9, 0.4);
      }
    }
  };

  // ===== 標題畫面（黎明）：我們自己設計的世界樹浮島、雲海、牧場坡地一角；中央上方留空給標題字 =====
  // 標題坡地的稜線：從左下往右緩升（ground 和 mid 共用）
  function TITLE_SLOPE(px) { return 560 - px * 0.06 + Math.sin(px * 0.006) * 18; }
  ZONES.title = {
    meta: meta('meadow', { godRays: { x: 30, y: -20, strength: 2.2 }, fog: { color: '#ffd8c0', density: 0.10, horizon: 100 },
      focusDepth: 0.62, tiltShift: 0.25, walk: { yMin: 140, yMax: 165 }, titleArea: { x: 60, y: 15, w: 200, h: 60 } }),
    clouds: { count: 4, top: '#ffe8d0', light: '#f4c8c8', shade: '#8a7ab8', yMin: 300, yMax: 350, speed: 3 },   // 雲只在標題下方、雲海上方飄，不擋中央上方的標題字
    sky: function (x, rnd) {
      x.fillStyle = vgrad(x, 0, 460, [[0, '#26306e'], [0.28, '#5a4e96'], [0.52, '#b47aa8'], [0.72, '#f4ac94'], [0.9, '#ffd8a0'], [1, '#ffe8b8']]);
      x.fillRect(0, 0, W, H);
      stars(x, rnd, 70, 160, '#e8eaff');   // 天頂還留著幾顆星
      softBlob(x, 120, -40, 820, '#ffd8a0', 0.45, 0.2);   // 左上的晨光
      softBlob(x, 120, -40, 300, '#fff4d8', 0.55, 0.3);
      // 4 道放射光柱：從左上方往右下，越遠越淡越寬；角度都偏陡，在標題區（中央上方）左側就淡出
      x.save(); x.globalCompositeOperation = 'lighter';
      [[0.95, 46, 0.22], [1.08, 30, 0.18], [1.22, 60, 0.16], [1.38, 36, 0.14]].forEach(function (b) {
        const ox = 40, oy = -60, len = 760, a = b[0], w = b[1];
        const ex = ox + Math.cos(a) * len, ey = oy + Math.sin(a) * len, nx = -Math.sin(a), ny = Math.cos(a);
        const g = x.createLinearGradient(ox, oy, ex, ey);
        g.addColorStop(0, 'rgba(255,236,190,' + b[2] + ')'); g.addColorStop(0.55, 'rgba(255,220,170,' + b[2] * 0.4 + ')'); g.addColorStop(1, 'rgba(255,220,170,0)');
        x.fillStyle = g; x.beginPath();
        x.moveTo(ox + nx * w * 0.2, oy + ny * w * 0.2); x.lineTo(ex + nx * w * 1.8, ey + ny * w * 1.8);
        x.lineTo(ex - nx * w * 1.8, ey - ny * w * 1.8); x.lineTo(ox - nx * w * 0.2, oy - ny * w * 0.2); x.closePath(); x.fill();
      });
      x.restore();
    },
    paint: {
      far: function (x, rnd) {
        // 遠山（淡紫，空氣透視）
        const f1 = ridge(rnd, 400, 36, [[0.005, 1], [0.017, 0.35]]);
        fillRidge(x, f1, vgrad(x, 340, 460, [[0, '#9a86b8'], [1, '#c8a8c0']]), 470);
        // 世界樹浮島（右側遠景）：倒錐岩塊＋垂下的根鬚＋層疊的圓形樹冠，枝梢帶微光
        x.save(); x.translate(1010, 360); x.scale(0.72, 0.72); x.translate(-1010, -330);   // 整棵世界樹縮小，樹冠不要被畫面上緣切掉
        const ix = 1010, iy = 330, r = 120;
        x.strokeStyle = 'rgba(120,110,170,0.6)'; x.lineWidth = 3; x.lineCap = 'round';
        for (let i = 0; i < 9; i++) { const rx = ix - r * 0.5 + i * r * 0.12; x.beginPath(); x.moveTo(rx, iy + r * 0.6); x.quadraticCurveTo(rx + (rnd() - 0.5) * 30, iy + r * 1.1, rx + (rnd() - 0.5) * 20, iy + r * (1.2 + rnd() * 0.5)); x.stroke(); }
        x.fillStyle = '#8a7ab0'; x.beginPath(); x.moveTo(ix - r, iy); x.lineTo(ix - r * 0.25, iy + r * 0.95); x.lineTo(ix + r * 0.2, iy + r * 0.8); x.lineTo(ix + r, iy); x.fill();
        x.fillStyle = '#a896c4'; x.beginPath(); x.moveTo(ix - r, iy); x.lineTo(ix - r * 0.25, iy + r * 0.95); x.lineTo(ix - r * 0.15, iy); x.fill();
        x.fillStyle = '#9ab8a8'; x.beginPath(); x.ellipse(ix, iy, r, r * 0.16, 0, 0, Math.PI * 2); x.fill();
        // 樹幹：兩股（亮、暗）交纏往上，扭結處互相壓過
        function strand(phase, col, w) {
          x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round';
          x.beginPath();
          for (let k = 0; k <= 20; k++) { const tt = k / 20, py = iy - tt * 200, px = ix + Math.sin(tt * Math.PI * 2.2 + phase) * (16 - tt * 6); k ? x.lineTo(px, py) : x.moveTo(px, py); }
          x.stroke();
        }
        strand(Math.PI, '#5e4e84', 22); strand(0, '#8a7aae', 22);
        strand(Math.PI, 'rgba(94,78,132,0.9)', 8);   // 暗股壓回亮股的交叉處，看得出扭結
        // 三根主枝：往左、往右、往上
        const branches = [[-1, -175, -150, -230, '#7a6a9e'], [1, -180, 150, -235, '#6e5e92'], [0, -200, 10, -290, '#7a6a9e']];
        branches.forEach(function (b) {
          x.strokeStyle = b[4]; x.lineWidth = 13; x.lineCap = 'round';
          x.beginPath(); x.moveTo(ix, iy + b[1]); x.quadraticCurveTo(ix + b[2] * 0.45, iy + b[1] - 40, ix + b[2], iy + b[3]); x.stroke();
          x.lineWidth = 6; x.beginPath(); x.moveTo(ix + b[2] * 0.6, iy + b[1] - 34); x.lineTo(ix + b[2] * 0.75 + b[0] * 30, iy + b[3] + 30); x.stroke();   // 小枝
        });
        // 樹冠：在三根主枝的末端各長一團（共 5 團），團與團之間露出枝幹；每團 3 階明暗＋金色微光邊
        const clumps = [[-150, -240, 62], [-85, -280, 48], [10, -310, 66], [100, -285, 50], [152, -245, 60]];
        clumps.forEach(function (c) { softBlob(x, ix + c[0], iy + c[1], c[2] * 1.45, '#fff0c0', 0.35, 0.55); });   // 神聖的微光暈
        clumps.forEach(function (c) {
          const cx = ix + c[0], cy = iy + c[1], cr = c[2];
          const lobes = [[0, 0, 1], [-0.55, 0.2, 0.68], [0.55, 0.18, 0.7], [-0.2, -0.45, 0.62], [0.3, -0.4, 0.6]];
          lobes.forEach(function (l) { circle(x, cx + l[0] * cr, cy + l[1] * cr, l[2] * cr, '#94b0c4'); });
          lobes.forEach(function (l) { x.save(); x.beginPath(); x.arc(cx + l[0] * cr, cy + l[1] * cr, l[2] * cr, 0, Math.PI * 2); x.clip(); circle(x, cx + l[0] * cr - l[2] * cr * 0.2, cy + l[1] * cr - l[2] * cr * 0.25, l[2] * cr * 0.72, '#c4dcd8'); circle(x, cx + l[0] * cr + l[2] * cr * 0.12, cy + l[1] * cr + l[2] * cr * 0.1, l[2] * cr * 0.76, '#94b0c4'); circle(x, cx + l[0] * cr + l[2] * cr * 0.45, cy + l[1] * cr + l[2] * cr * 0.5, l[2] * cr * 0.7, '#7890ac'); x.restore(); });
          // 上緣受光的金邊
          x.strokeStyle = 'rgba(255,240,190,0.85)'; x.lineWidth = 3;
          x.beginPath(); x.arc(cx - cr * 0.2, cy - cr * 0.45, cr * 0.62, Math.PI * 1.05, Math.PI * 1.75); x.stroke();
        });
        for (let k = 0; k < 30; k++) { const c = clumps[k % 5], a = rnd() * Math.PI * 2; softBlob(x, ix + c[0] + Math.cos(a) * c[2] * 1.05, iy + c[1] + Math.sin(a) * c[2] * 0.9, 5, '#fff4c0', 0.95, 0.35); }   // 枝梢的光點
        x.restore();
        // 雲海帶（在坡地後面，所以放遠景層）：上緣受晨光（蜜桃色），下緣帶紫
        const sea = canvas(), sx = sea.getContext('2d');
        for (let px = -80; px < W + 80; px += 46 + rnd() * 40) softBlob(sx, px, 450 + rnd() * 18, 60 + rnd() * 50, '#f6d0c0', 1, 0.8);
        sx.fillStyle = '#f2c8c0'; sx.fillRect(0, 462, W, 60);
        sx.globalCompositeOperation = 'source-atop';
        sx.fillStyle = vgrad(sx, 400, 520, [[0, 'rgba(255,240,210,0.8)'], [0.5, 'rgba(255,240,210,0)'], [1, 'rgba(140,120,190,0.5)']]); sx.fillRect(0, 380, W, 160);
        x.drawImage(sea, 0, 0);
        // 左側兩座小浮島
        [[200, 300, 46], [320, 360, 28]].forEach(function (p) {
          const ix2 = p[0], iy2 = p[1], r2 = p[2];
          x.fillStyle = '#8a76a8'; x.beginPath(); x.moveTo(ix2 - r2, iy2); x.lineTo(ix2 - r2 * 0.2, iy2 + r2 * 1.1); x.lineTo(ix2 + r2, iy2); x.fill();
          x.fillStyle = '#9ac0a0'; x.beginPath(); x.ellipse(ix2, iy2, r2, r2 * 0.2, 0, 0, Math.PI * 2); x.fill();
          circle(x, ix2 + r2 * 0.3, iy2 - r2 * 0.25, r2 * 0.22, '#86b090');
        });
      },
      mid: function (x) {
        // 牧場柵欄的一角（右側坡上，斜向延伸）：中景層疊在坡地上面
        const slope = TITLE_SLOPE;
        for (let i = 0; i < 6; i++) {
          const px = 880 + i * 70, py = slope(px) - 4 + i * 6;
          x.fillStyle = '#b8895a'; x.fillRect(px, py - 46, 14, 50);
          x.fillStyle = '#8a6040'; x.fillRect(px + 9, py - 46, 5, 50);
          x.fillStyle = '#ffe0b0'; x.fillRect(px, py - 46, 4, 50);
        }
        x.strokeStyle = '#c4956a'; x.lineWidth = 7;
        [36, 20].forEach(function (h) { x.beginPath(); x.moveTo(880, slope(880) - h); for (let i = 1; i < 6; i++) { const px = 880 + i * 70; x.lineTo(px + 7, slope(px) - 4 + i * 6 - h); } x.stroke(); });
      },
      ground: function (x, rnd) {
        // 草原坡地：從左下往右緩升，只占畫面下方
        const slope = TITLE_SLOPE;
        x.beginPath(); x.moveTo(0, H); for (let px = 0; px <= W; px += 10) x.lineTo(px, slope(px)); x.lineTo(W, H); x.closePath();
        x.fillStyle = vgrad(x, 480, H, [[0, '#8ec86a'], [0.4, '#5ea24a'], [1, '#3a7a36']]); x.fill();
        x.save(); x.clip();
        softBlob(x, 300, 600, 300, '#ffe0a0', 0.25, 0.4);   // 晨光照在坡上
        softBlob(x, 1050, 660, 240, '#2a5a34', 0.25, 0.4);
        const fams = [['#3f8a38', '#5aa548', '#7cc25e'], ['#4a9440', '#6ab454', '#a4d878']];
        grassField(x, rnd, 500, H + 20, 420, fams, function (px, py) { return py < slope(px) + 6; });
        const flowers = ['#ffffff', '#ffe27a', '#ffc4d8'];
        for (let g = 0; g < 12; g++) {
          const gx = rnd() * W, gy = slope(gx) + 30 + rnd() * 120, col = flowers[g % 3];
          for (let i = 0; i < 7; i++) { const fx = gx + (rnd() - 0.5) * 60, fy = gy + (rnd() - 0.5) * 20; if (fy < slope(fx) + 8) continue; const s2 = 2.4; for (let k = 0; k < 5; k++) circle(x, fx + Math.cos(k * 1.256) * s2, fy + Math.sin(k * 1.256) * s2 * 0.7, s2 * 0.8, col); circle(x, fx, fy, 1.2, '#e0a030'); }
        }
        x.restore();
      },
      fg: function (x, rnd) {
        // 前景大型柔焦花草（兩下角），中間不放
        const fam = ['#2a5a2c', '#36702f', '#4a8a3c'];
        for (let i = 0; i < 12; i++) tuft(x, rnd, 10 + rnd() * 170, H + 10, 160 + rnd() * 100, fam);
        for (let i = 0; i < 10; i++) tuft(x, rnd, W - 10 - rnd() * 170, H + 10, 150 + rnd() * 90, fam);
        [[90, 560, '#ffd0e0'], [150, 600, '#ffffff'], [1180, 580, '#ffe27a']].forEach(function (f) {
          for (let k = 0; k < 6; k++) { x.fillStyle = f[2]; x.beginPath(); x.ellipse(f[0] + Math.cos(k * 1.047) * 22, f[1] + Math.sin(k * 1.047) * 22, 18, 10, k * 1.047, 0, Math.PI * 2); x.fill(); }
          circle(x, f[0], f[1], 10, '#f0b040');
        });
      }
    },
    midAdjust: [1.05, 1.06],
    lights: function () { return []; },
    fx: function (ctx, t) {   // 晨光中緩緩上升的光點
      for (let i = 0; i < 36; i++) {
        const s = (t * 0.035 + i * 0.113) % 1;
        softBlob(ctx, (i * 151 + Math.sin(t * 0.4 + i) * 50) % W, 680 - s * 600, i % 6 ? 4 : 8, i % 3 ? '#fff6d0' : '#ffe0f0', Math.sin(s * Math.PI) * 0.85, 0.35);
      }
    }
  };

  // ===== 戰鬥競技場（正面視角：敵人站在中央 (160,122)，y 50–122 保持乾淨，兩側火把柱，深處是拱門）=====
  ZONES.arena = {
    meta: meta('battle', { godRays: null, fog: { color: '#2a2438', density: 0.2, horizon: 125 }, focusDepth: 0.65, tiltShift: 0.2 }),
    clouds: null,
    sky: function (x) {
      // 大廳深處：拱門裡往內越來越暗，拱門外圈是石牆
      x.fillStyle = vgrad(x, 0, H, [[0, '#1a1428'], [0.6, '#2a2238'], [1, '#141020']]); x.fillRect(0, 0, W, H);
      x.fillStyle = '#0c0a14'; x.beginPath(); x.moveTo(470, 500); x.lineTo(470, 230); x.arc(640, 230, 170, Math.PI, 0); x.lineTo(810, 500); x.fill();
      softBlob(x, 640, 330, 200, '#3a2a5a', 0.6, 0.3);   // 深處的微光
    },
    paint: {
      far: function (x, rnd) {
        // 拱門石框和石牆磚縫
        x.strokeStyle = '#4a4058'; x.lineWidth = 34; x.beginPath(); x.moveTo(470, 500); x.lineTo(470, 230); x.arc(640, 230, 170, Math.PI, 0); x.lineTo(810, 500); x.stroke();
        x.strokeStyle = '#6a6078'; x.lineWidth = 6; x.beginPath(); x.moveTo(456, 500); x.lineTo(456, 230); x.arc(640, 230, 184, Math.PI, Math.PI * 1.5); x.stroke();
        x.strokeStyle = 'rgba(10,8,20,0.5)'; x.lineWidth = 2;
        for (let y = 20; y < 480; y += 34) for (let px = (y / 34 % 2) * 40; px < W; px += 80) { if (px > 440 && px < 840 && y > 50) continue; x.strokeRect(px, y, 80, 34); }
        // 大廳深處的幾根柱子剪影（空氣透視）
        [[540, 0.6], [740, 0.6]].forEach(function (p) { x.fillStyle = 'rgba(40,32,60,0.8)'; x.fillRect(p[0], 300, 24, 200); });
        // 牆上的旗幟（我們自己的紋章：圓頂果凍＋星）
        [[300, 120], [980, 120]].forEach(function (p) {
          x.fillStyle = '#6a1a2a'; x.beginPath(); x.moveTo(p[0] - 50, p[1]); x.lineTo(p[0] + 50, p[1]); x.lineTo(p[0] + 50, p[1] + 200); x.lineTo(p[0], p[1] + 170); x.lineTo(p[0] - 50, p[1] + 200); x.fill();
          x.fillStyle = '#8a2a3a'; x.fillRect(p[0] - 50, p[1], 30, 190);
          x.fillStyle = '#e0b050'; x.beginPath(); x.moveTo(p[0] - 22, p[1] + 110); x.bezierCurveTo(p[0] - 22, p[1] + 70, p[0] + 22, p[1] + 70, p[0] + 22, p[1] + 110); x.fill();
          circle(x, p[0], p[1] + 55, 6, '#e0b050');
        });
      },
      ground: function (x, rnd) {
        // 透視石磚地（消失點在拱門中央），中央有魔法陣，下方 y>520 只是簡單地板
        x.fillStyle = vgrad(x, 480, H, [[0, '#3a3248'], [1, '#221c2c']]); x.fillRect(0, 480, W, H - 480);
        x.strokeStyle = 'rgba(15,10,25,0.6)'; x.lineWidth = 2;
        for (let i = -16; i <= 16; i++) { x.beginPath(); x.moveTo(640 + i * 36, 480); x.lineTo(640 + i * 150, H); x.stroke(); }
        for (let r = 0; r < 9; r++) { const y = 480 + Math.pow(r / 9, 1.7) * 240; x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
        speckle(x, rnd, { x: 0, y: 485, w: W, h: 235 }, ['#4a4058', '#16121e'], 900, 1.8, 0.5);
        // 魔法陣（敵人腳底 (640, 488)）：雙圓、符文點、六芒星
        const mx = 640, my = 500;
        x.save(); x.translate(mx, my); x.scale(1, 0.32);
        x.strokeStyle = 'rgba(140,120,255,0.7)'; x.lineWidth = 5; x.beginPath(); x.arc(0, 0, 230, 0, Math.PI * 2); x.stroke();
        x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 190, 0, Math.PI * 2); x.stroke();
        for (let i = 0; i < 2; i++) { x.beginPath(); for (let k = 0; k < 3; k++) { const a = i * Math.PI / 3 + k * Math.PI * 2 / 3 - Math.PI / 2; k ? x.lineTo(Math.cos(a) * 185, Math.sin(a) * 185) : x.moveTo(Math.cos(a) * 185, Math.sin(a) * 185); } x.closePath(); x.stroke(); }
        for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; circle(x, Math.cos(a) * 210, Math.sin(a) * 210, 4, 'rgba(180,160,255,0.8)'); }
        x.restore();
        softBlob(x, mx, my, 260, '#6a5aff', 0.15, 0.4);
      },
      mid: function (x) {
        // 兩側火把柱（石柱＋鐵火盆），火焰本身由光源和光暈表現
        function pillar(cx) {
          x.fillStyle = '#4a4058'; x.fillRect(cx - 34, 120, 68, 400);
          x.fillStyle = '#342c42'; x.fillRect(cx + 4, 120, 30, 400);
          x.fillStyle = '#6a6078'; x.fillRect(cx - 34, 120, 8, 400);
          x.fillStyle = '#5a5068'; x.fillRect(cx - 46, 108, 92, 18); x.fillRect(cx - 46, 506, 92, 20);
          x.fillStyle = '#2a2430'; x.beginPath(); x.moveTo(cx - 30, 230); x.lineTo(cx + 30, 230); x.lineTo(cx + 18, 256); x.lineTo(cx - 18, 256); x.fill();   // 火盆
          x.fillStyle = '#ffb040'; x.beginPath(); x.moveTo(cx - 20, 230); x.quadraticCurveTo(cx - 10, 190, cx, 176); x.quadraticCurveTo(cx + 12, 196, cx + 20, 230); x.fill();
          x.fillStyle = '#fff0a0'; x.beginPath(); x.moveTo(cx - 9, 230); x.quadraticCurveTo(cx - 4, 210, cx, 200); x.quadraticCurveTo(cx + 5, 212, cx + 9, 230); x.fill();
        }
        pillar(240); pillar(1040);
      },
      fg: function (x) {
        // 最前方左右兩根大柱的邊緣（柔焦，增加景深）
        x.fillStyle = '#1a1622'; x.fillRect(-40, 0, 120, H); x.fillRect(W - 80, 0, 120, H);
        x.fillStyle = '#2a2434'; x.fillRect(60, 0, 18, H);
      }
    },
    midAdjust: [1.06, 1.04],
    lights: function () {
      return [
        { x: 60, y: 52, radius: 80, color: '#ffb040', intensity: 1.8, flicker: 0.6, layer: 'mid' },
        { x: 260, y: 52, radius: 80, color: '#ffb040', intensity: 1.8, flicker: 0.6, layer: 'mid' },
        { x: 60, y: 135, radius: 70, color: '#ff9a30', intensity: 1.0, flicker: 0.6, layer: 'ground', halo: 0 },
        { x: 260, y: 135, radius: 70, color: '#ff9a30', intensity: 1.0, flicker: 0.6, layer: 'ground', halo: 0 },
        { x: 160, y: 125, radius: 60, color: '#8a7aff', intensity: 0.7, layer: 'ground', halo: 0 }   // 魔法陣的微光
      ];
    },
    fx: function (ctx, t) {   // 塵埃
      for (let i = 0; i < 20; i++) {
        const s = (t * 0.03 + i * 0.191) % 1;
        softBlob(ctx, (i * 211 + Math.sin(t * 0.4 + i) * 50) % W, 200 + s * 300, 3, '#d8c8ff', Math.sin(s * Math.PI) * 0.5, 0.4);
      }
    }
  };

  // ---------- 快取與輸出 ----------
  const cache = {};   // zone -> {layers:{name:{canvas, version}}, skyBase, clouds:[…], lastSky}
  function build(zone) {
    const Z = ZONES[zone];
    const c = { layers: {} };
    const skyBase = canvas(); Z.sky(skyBase.getContext('2d'), rng(7 + zone.length));
    c.skyBase = skyBase;
    c.layers.sky = { canvas: canvas(), version: 0 };
    ['far', 'ground', 'mid', 'fg'].forEach(function (name, i) {
      const cv = canvas();
      Z.paint[name](cv.getContext('2d'), rng(1000 + i * 77 + zone.length * 13));
      if (name === 'mid' && Z.midAdjust) adjust(cv, Z.midAdjust[0], Z.midAdjust[1]);
      c.layers[name] = { canvas: cv, version: 1 };
    });
    c.clouds = [];
    const C = Z.clouds;
    if (C) {
      const rnd = rng(42 + zone.length);
      for (let i = 0; i < C.count; i++) {
        const w = 260 + rnd() * 260, h = w * (0.32 + rnd() * 0.12);
        c.clouds.push({ img: makeCloud(rnd, Math.round(w), Math.round(h), C.top, C.light, C.shade), x: rnd() * (W + w) - w, y: C.yMin + rnd() * (C.yMax - C.yMin), speed: C.speed * (0.6 + rnd() * 0.8) });
      }
    }
    c.lastSky = -1;
    return (cache[zone] = c);
  }
  function updateSky(c, t) {
    const tick = c.clouds.length ? Math.floor(t * CLOUD_HZ) : 0;
    if (tick === c.lastSky) return;
    c.lastSky = tick;
    const x = c.layers.sky.canvas.getContext('2d');
    x.drawImage(c.skyBase, 0, 0);
    c.clouds.forEach(function (cl) {
      const w = cl.img.width, span = W + w;
      x.drawImage(cl.img, ((cl.x + t * cl.speed) % span + span) % span - w, cl.y);
    });
    c.layers.sky.version++;
  }

  window.SceneModern = {
    width: W, height: H, scale: K,
    zones: function () { return Object.keys(ZONES); },
    has: function (zone) { return !!ZONES[zone]; },
    // 預先繪製（例如切換地區的過場淡出時呼叫，避免第一幀卡頓）
    prepare: function (zone) { if (ZONES[zone] && !cache[zone]) build(zone); },
    // → {sky, far, ground, mid, fg}：每個是 {canvas, version}（version 沒變代表內容沒變，hd2d 不會重傳）
    layers: function (zone, t) {
      if (!ZONES[zone]) return null;
      const c = cache[zone] || build(zone);
      updateSky(c, t || 0);
      return c.layers;
    },
    lights: function (zone, t) { const Z = ZONES[zone]; return Z ? Z.lights(t || 0) : []; },
    meta: function (zone) { const Z = ZONES[zone]; return Z ? JSON.parse(JSON.stringify(Z.meta)) : null; },
    // 動態小物件（花粉、火星、雪花…），畫在 1280×720 的 actors 層上
    drawFx: function (ctx, zone, t) { const Z = ZONES[zone]; if (Z && Z.fx) Z.fx(ctx, t || 0); },
    // 換區後釋放舊地區的快取（每個地區約 6 張 1280×720 canvas）
    release: function (zone) { delete cache[zone]; }
  };
})();
