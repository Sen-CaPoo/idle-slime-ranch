// sprites-modern.js — 現代日系 RPG 風格的向量 sprite（ccline-27，v2.0）
// 賽璐璐 3 階上色（硬邊）、彩色描邊（本體色加深 45%）、玻璃高光、動漫大眼。
// 載入時用 Canvas 路徑畫一次並快取成離屏 canvas；每幀只 drawImage，擠壓伸展是繪製時的縮放補間。
// SR 以上的「動態材質」（金屬反光、寶石折射、星雲流動）用快取的剪影遮罩在每幀疊一層光。
// 造型：我們自己的「圓頂果凍」史萊姆（寬圓頂、底部外擴），不使用任何既有作品的角色造型。
(function () {
  'use strict';
  const RES = 8;                 // 快取解析度：每 1 邏輯像素 = 8 px（現代畫面 4 倍 × DPR 2）
  const cache = new Map();
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  const TAU = Math.PI * 2;

  // ---------- 顏色 ----------
  const _c = mk(1, 1).getContext('2d');
  function rgb(col) { if (Array.isArray(col)) return col; _c.fillStyle = '#000'; _c.fillStyle = col; const s = _c.fillStyle; return s[0] === '#' ? [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)) : (s.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number); }
  const mix = (a, b, t) => { a = rgb(a); b = rgb(b); return a.map((v, i) => Math.round(v + (b[i] - v) * t)); };
  const css = (c, a = 1) => { c = rgb(c); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  const darken = (c, k) => mix(c, [0, 0, 0], k);

  // ---------- 圓頂果凍輪廓（單位座標：寬 1、底在 y=0）----------
  // tier 1–2：基本寬圓頂（寬:高 ≈ 1.25:1）；tier 4+：更飽滿的肩線；底部兩側外擴，像落地後被壓扁的果凍
  function jellyShape(tier) {
    const full = tier >= 4, h = full ? 0.82 : 0.8, sh = full ? 0.62 : 0.6;
    return { h, sh };
  }
  function jellyPath(g, shp) {
    const { h, sh } = shp;
    g.beginPath();
    g.moveTo(-0.54, 0.0);
    g.bezierCurveTo(-sh, -h * 0.55, -0.36, -h, 0, -h);
    g.bezierCurveTo(0.36, -h, sh, -h * 0.55, 0.54, 0.0);
    g.quadraticCurveTo(0.55, 0.055, 0.42, 0.055);
    g.lineTo(-0.42, 0.055);
    g.quadraticCurveTo(-0.55, 0.055, -0.54, 0.0);
    g.closePath();
  }

  // ---------- 動漫大眼（放大 15%，兩點高光）----------
  function eyes(g, eyeCol, bodyCol, lightCol, expr, lw, ey = -0.33) {
    const eye = rgb(eyeCol), body = rgb(bodyCol), light = rgb(lightCol);
    const ex = 0.18, rx = 0.098, ry = 0.144;
    for (const s of [-1, 1]) {
      const x = s * ex;
      g.lineCap = 'round';
      if (expr === 'blink') { g.strokeStyle = css(eye); g.lineWidth = lw * 1.15; g.beginPath(); g.moveTo(x - rx, ey + 0.02); g.quadraticCurveTo(x, ey + 0.07, x + rx, ey + 0.02); g.stroke(); continue; }
      if (expr === 'happy') { g.strokeStyle = css(eye); g.lineWidth = lw * 1.25; g.beginPath(); g.moveTo(x - rx, ey + 0.04); g.quadraticCurveTo(x, ey - 0.08, x + rx, ey + 0.04); g.stroke(); continue; }
      g.fillStyle = css(eye); g.beginPath(); g.ellipse(x, ey, rx, ry, 0, 0, TAU); g.fill();
      const ir = g.createLinearGradient(0, ey - ry, 0, ey + ry);
      ir.addColorStop(0, css(eye)); ir.addColorStop(0.55, css(mix(eye, body, 0.35))); ir.addColorStop(1, css(mix(body, light, 0.5)));
      g.fillStyle = ir; g.beginPath(); g.ellipse(x, ey + ry * 0.12, rx * 0.78, ry * 0.8, 0, 0, TAU); g.fill();
      g.fillStyle = css(darken(eye, 0.4)); g.beginPath(); g.ellipse(x, ey + ry * 0.05, rx * 0.36, ry * 0.42, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(x - rx * 0.32, ey - ry * 0.4, rx * 0.36, ry * 0.3, -0.4, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x + rx * 0.35, ey + ry * 0.45, rx * 0.16, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(255,120,150,0.38)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * (ex + 0.11), ey + 0.15, 0.065, 0.03, 0, 0, TAU); g.fill(); }
    g.strokeStyle = css(eye); g.lineWidth = lw * 0.9; g.lineCap = 'round';
    if (expr === 'happy') {
      g.fillStyle = css(darken(eye, 0.2)); g.beginPath(); g.moveTo(-0.055, ey + 0.15); g.quadraticCurveTo(0, ey + 0.26, 0.055, ey + 0.15); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,120,140,0.9)'; g.beginPath(); g.ellipse(0, ey + 0.2, 0.027, 0.016, 0, 0, TAU); g.fill();
    } else {
      g.beginPath(); g.moveTo(-0.038, ey + 0.155); g.quadraticCurveTo(-0.019, ey + 0.19, 0, ey + 0.16); g.quadraticCurveTo(0.019, ey + 0.19, 0.038, ey + 0.155); g.stroke();
    }
  }

  // ---------- 本體改造（v1.8／v1.9 確認過的設計語言，向量版）----------
  const BODY = {
    chrono: { pal: { body: '#2a2f6a', shade: '#141838', light: '#5a64b8', eye: '#ffd23f' }, outline: '#c89a30', eyeY: -0.36,
      paint(g, shp, lw) { // 金色錶盤：外圈、12 刻度（3／6／9／12 加粗）、軸心；指針由 render 每幀畫
        const cy = -shp.h * 0.47, R = 0.31;
        g.strokeStyle = '#d8a840'; g.lineWidth = lw * 1.1; g.beginPath(); g.ellipse(0, cy, R, R * 0.92, 0, 0, TAU); g.stroke();
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r1 = R * (i % 3 ? 0.84 : 0.76); g.lineWidth = lw * (i % 3 ? 0.6 : 1.1); g.beginPath(); g.moveTo(Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.92); g.lineTo(Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95 * 0.92); g.stroke(); }
      } },
    astral: { pal: { body: '#3a2a7a', shade: '#1a1240', light: '#c8b0ff', eye: '#ffffff' }, outline: '#c8b8ff', paint: nebula(['#ff7ad8', '#5ad8ff', '#b88aff']) },
    nocturne: { pal: { body: '#241a4a', shade: '#0e0a22', light: '#6a5ab8', eye: '#c8b8ff' }, outline: '#8a7ad8', paint: nebula(['#7a46be', '#3a2a8a', '#9a7ae0']) },
    cosmos: { pal: { body: '#120c30', shade: '#06041a', light: '#5a4aa8', eye: '#ffffff' }, outline: '#b8a8ff',
      paint(g, shp, lw) {
        const cy = -shp.h * 0.42;
        nebula(['#5a3aa8', '#2a4aa8'])(g, shp, lw);
        for (let arm = 0; arm < 2; arm++) { g.strokeStyle = arm ? 'rgba(255,140,220,0.8)' : 'rgba(180,160,255,0.85)'; g.lineWidth = lw * 1.4; g.beginPath(); for (let i = 0; i <= 40; i++) { const k = i / 40, a = arm * Math.PI + k * 4.2, r = 0.02 + k * 0.42; const x = Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.62; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
        g.fillStyle = '#fff6e0'; g.beginPath(); g.arc(0, cy, 0.035, 0, TAU); g.fill();
      } },
    primordial: { pal: { body: '#b82a20', shade: '#5a0a0a', light: '#ff9a5a', eye: '#ffd23f' }, outline: '#3a0606',
      paint(g, shp, lw) { g.strokeStyle = 'rgba(80,10,10,0.55)'; g.lineWidth = lw * 0.7; for (let r = 0; r < 6; r++) for (let c = -5; c <= 5; c++) { const x = c * 0.1 + (r % 2) * 0.05, y = -0.08 - r * 0.11; g.beginPath(); g.arc(x, y, 0.05, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); } } },
    eternal: { pal: { body: '#e8d9b5', shade: '#a893b8', light: '#f6eedb', eye: '#3a2a4a' }, outline: '#6e5a7e', mat: 'gem',
      // 珍珠：陰影階偏紫（#a893b8），亮部暖白；虹彩由每幀的寶石掃光負責
      paint(g, shp) { g.fillStyle = 'rgba(168,147,184,0.55)'; g.beginPath(); g.ellipse(0.4, -0.12, 0.34, 0.36, 0.4, 0, TAU); g.fill(); } },
    oracle: { pal: { body: '#c89a3a', shade: '#7a5214', light: '#e2c070', eye: '#1a1030' }, outline: '#4a2a08',
      paint(g, shp, lw) { // 額頭的眼紋
        const y = -shp.h * 0.74; g.fillStyle = '#ffe9a8'; g.strokeStyle = '#7a4a10'; g.lineWidth = lw * 0.8;
        g.beginPath(); g.moveTo(-0.11, y); g.quadraticCurveTo(0, y - 0.07, 0.11, y); g.quadraticCurveTo(0, y + 0.07, -0.11, y); g.fill(); g.stroke();
        g.fillStyle = '#4ab8ff'; g.beginPath(); g.arc(0, y, 0.035, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(-0.012, y - 0.012, 0.012, 0, TAU); g.fill();
      } },
    seraph: { pal: { body: '#d2b070', shade: '#8a6428', light: '#e6cc94', eye: '#2a1a08' }, outline: '#5a3a10' },
  };
  function nebula(cols) {
    return function (g) { cols.forEach((c, i) => { const x = Math.sin(i * 2.3) * 0.22, y = -0.42 + Math.cos(i * 1.7) * 0.18; const gr = g.createRadialGradient(x, y, 0, x, y, 0.32); gr.addColorStop(0, css(c, 0.55)); gr.addColorStop(1, css(c, 0)); g.fillStyle = gr; g.fillRect(-0.6, -0.9, 1.2, 1); });
      g.fillStyle = 'rgba(255,255,255,0.9)'; for (let k = 0; k < 16; k++) { const x = Math.sin(k * 7.31) * 0.4, y = -0.4 + Math.cos(k * 3.17) * 0.3; g.beginPath(); g.arc(x, y, k % 4 ? 0.008 : 0.016, 0, TAU); g.fill(); } };
  }

  // ---------- 飾品（向量）----------
  function fillStroke(g, fill, stroke, lw) { g.fillStyle = css(fill); g.fill(); g.strokeStyle = css(stroke); g.lineWidth = lw; g.stroke(); }
  function star(g, x, y, r, n = 5, inner = 0.45) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * inner : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }
  const GOLD = '#ffd23f', GOLD_D = '#a8701a', GOLD_L = '#fff1a0';
  const ACC = {
    sprout(g, top, lw) { g.strokeStyle = '#2f7a2c'; g.lineWidth = lw * 1.4; g.beginPath(); g.moveTo(0, top + 0.02); g.lineTo(0, top - 0.12); g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 0.07, top - 0.15, 0.08, 0.04, s * -0.5, 0, TAU); fillStroke(g, '#6cc04a', '#2f7a2c', lw); } },
    crown(g, top, lw, w = 0.3) { g.beginPath(); g.moveTo(-w / 2, top + 0.02); g.lineTo(-w / 2, top - 0.1); g.lineTo(-w / 4, top - 0.04); g.lineTo(0, top - 0.14); g.lineTo(w / 4, top - 0.04); g.lineTo(w / 2, top - 0.1); g.lineTo(w / 2, top + 0.02); g.closePath(); fillStroke(g, GOLD, GOLD_D, lw);
      g.fillStyle = '#e0533d'; g.beginPath(); g.arc(0, top - 0.03, 0.025, 0, TAU); g.fill(); g.fillStyle = css(GOLD_L, 0.8); g.fillRect(-w / 2 + 0.02, top - 0.02, w - 0.04, 0.015); },
    wings(g, top, lw, rx, col = '#eaf2ff', dy = 0.18, size = 1) { for (const s of [-1, 1]) { g.save(); g.translate(s * (rx + 0.02), top + dy); g.scale(s * size, size);
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(0.22, -0.2, 0.3, -0.06); g.quadraticCurveTo(0.22, -0.02, 0.24, 0.04); g.quadraticCurveTo(0.14, 0.02, 0.14, 0.08); g.quadraticCurveTo(0.06, 0.06, 0, 0.06); g.closePath(); fillStroke(g, col, darken(col, 0.4), lw); g.restore(); } },
    halo(g, top, lw) { g.strokeStyle = GOLD; g.lineWidth = lw * 1.6; g.beginPath(); g.ellipse(0, top - 0.17, 0.17, 0.045, 0, 0, TAU); g.stroke(); g.strokeStyle = css(GOLD_L, 0.8); g.lineWidth = lw * 0.6; g.stroke(); },
    gem(g, top, lw) { g.beginPath(); g.moveTo(0, top + 0.05); g.lineTo(0.05, top + 0.1); g.lineTo(0, top + 0.16); g.lineTo(-0.05, top + 0.1); g.closePath(); fillStroke(g, '#7ae8ff', '#2a7a9a', lw * 0.8); },
    bow(g, top, lw) { g.save(); g.translate(0.2, top + 0.08); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.09, -0.07, s * 0.1, 0); g.quadraticCurveTo(s * 0.09, 0.07, 0, 0); fillStroke(g, '#ff5c8a', '#b23d6b', lw * 0.8); } g.fillStyle = '#b23d6b'; g.beginPath(); g.arc(0, 0, 0.022, 0, TAU); g.fill(); g.restore(); },
  };
  // 星輝／神諭／高階的專屬飾品（取代通用 tier 配件）
  const DECO = {
    thunder(g, top, lw) { g.beginPath(); g.moveTo(0.02, top - 0.24); g.lineTo(-0.07, top - 0.08); g.lineTo(0, top - 0.09); g.lineTo(-0.04, top + 0.02); g.lineTo(0.08, top - 0.13); g.lineTo(0.01, top - 0.12); g.closePath(); fillStroke(g, '#ffe24a', '#8a6a00', lw); },
    coral(g, top, lw) { g.strokeStyle = '#c03a5a'; g.lineCap = 'round'; for (const [x, a] of [[-0.08, -0.3], [0.08, 0.3], [0, 0]]) { g.lineWidth = lw * 2.2; g.beginPath(); g.moveTo(x, top + 0.02); g.lineTo(x + Math.sin(a) * 0.12, top - 0.16); g.stroke(); g.lineWidth = lw * 1.5; g.beginPath(); g.moveTo(x + Math.sin(a) * 0.06, top - 0.07); g.lineTo(x + Math.sin(a) * 0.06 + (a >= 0 ? 0.06 : -0.06), top - 0.12); g.stroke(); } g.fillStyle = '#ff9ab8'; for (const [x, y] of [[-0.12, -0.17], [0.12, -0.17], [0, -0.18]]) { g.beginPath(); g.arc(x, top + y, 0.022, 0, TAU); g.fill(); } },
    venom(g, top, lw, rx) { for (const [x, y, r] of [[rx * 0.75, -0.06, 0.07], [rx * 0.95, -0.2, 0.045], [-rx * 0.8, -0.12, 0.05]]) { g.beginPath(); g.arc(x, top + y, r, 0, TAU); fillStroke(g, 'rgba(192,138,255,0.55)', '#6a2aa8', lw * 0.7); g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - r * 0.35, top + y - r * 0.35, r * 0.25, 0, TAU); g.fill(); } },
    sakura(g, top, lw, rx) { g.save(); g.translate(0, top - 0.06); for (let i = 0; i < 5; i++) { g.rotate(TAU / 5); g.beginPath(); g.ellipse(0, -0.05, 0.035, 0.055, 0, 0, TAU); fillStroke(g, '#ffc0d8', '#d0709a', lw * 0.6); } g.fillStyle = '#ffe24a'; g.beginPath(); g.arc(0, 0, 0.022, 0, TAU); g.fill(); g.restore(); g.fillStyle = '#ff9ac0'; for (const [x, y] of [[rx + 0.06, 0.1], [-rx - 0.06, 0.2]]) { g.beginPath(); g.ellipse(x, top + y, 0.03, 0.018, 0.6, 0, TAU); g.fill(); } },
    phoenix(g, top, lw, rx) { const cols = ['#ff3a1a', '#ff7a2a', '#ffd84a']; for (let i = -2; i <= 2; i++) { g.save(); g.translate(i * 0.06, top + 0.02); g.rotate(i * 0.22); g.beginPath(); g.moveTo(-0.03, 0); g.quadraticCurveTo(-0.04, -0.16 + Math.abs(i) * 0.03, 0, -0.26 + Math.abs(i) * 0.05); g.quadraticCurveTo(0.04, -0.16, 0.03, 0); g.closePath(); const gr = g.createLinearGradient(0, 0, 0, -0.26); gr.addColorStop(0, cols[0]); gr.addColorStop(0.6, cols[1]); gr.addColorStop(1, cols[2]); g.fillStyle = gr; g.fill(); g.strokeStyle = '#8a1a0a'; g.lineWidth = lw * 0.7; g.stroke(); g.restore(); } ACC.wings(g, top, lw, rx, '#ff8a3a', 0.24, 0.9); },
    moon(g, top, lw) { g.beginPath(); g.arc(0.02, top - 0.2, 0.11, 0.3 * Math.PI, 1.7 * Math.PI, false); g.arc(0.07, top - 0.22, 0.09, 1.6 * Math.PI, 0.4 * Math.PI, true); g.closePath(); fillStroke(g, '#f2ecff', '#8a7ad8', lw * 0.8); g.fillStyle = '#fff'; star(g, -0.14, top - 0.12, 0.025, 4); g.fill(); },
    yggdrasil(g, top, lw) { g.strokeStyle = '#6b4421'; g.lineWidth = lw * 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, top + 0.02); g.lineTo(0, top - 0.16); g.moveTo(0, top - 0.08); g.lineTo(-0.1, top - 0.14); g.moveTo(0, top - 0.11); g.lineTo(0.1, top - 0.18); g.stroke();
      for (const [x, y, r] of [[-0.13, -0.18, 0.05], [0.13, -0.22, 0.055], [0, -0.22, 0.05], [-0.06, -0.12, 0.035], [0.06, -0.1, 0.035]]) { g.beginPath(); g.ellipse(x, top + y, r, r * 0.7, 0.3, 0, TAU); fillStroke(g, '#5cba47', '#2a6a28', lw * 0.6); } g.fillStyle = '#ffe24a'; g.beginPath(); g.arc(0, top - 0.27, 0.02, 0, TAU); g.fill(); },
    mecha(g, top, lw) { g.strokeStyle = '#7a8090'; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(0, top + 0.02); g.lineTo(0, top - 0.16); g.stroke(); g.beginPath(); g.arc(0, top - 0.19, 0.035, 0, TAU); fillStroke(g, '#ff3a3a', '#7a0a0a', lw * 0.6);
      g.save(); g.translate(0.18, -0.33 + 0); g.restore(); },
    aurora(g, top, lw) { const cols = ['#5affb0', '#5ad8ff', '#c08aff', '#ff8ad8']; cols.forEach((c, i) => { g.strokeStyle = css(c, 0.8); g.lineWidth = lw * 2.4; g.beginPath(); for (let k = 0; k <= 20; k++) { const x = -0.26 + k * 0.026, y = top - 0.06 - i * 0.045 + Math.sin(k * 0.6 + i) * 0.02; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }); },
    abyss(g, top, lw, rx) { for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { g.strokeStyle = k ? '#3a1a5a' : '#1a0a2a'; g.lineWidth = lw * 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(s * (rx * 0.85 - k * 0.08), -0.05); g.bezierCurveTo(s * (rx + 0.1), 0.0, s * (rx + 0.08), -0.12 - k * 0.05, s * (rx + 0.2), -0.1 - k * 0.08); g.stroke(); } g.fillStyle = '#ff3a6a'; g.beginPath(); g.ellipse(0, top - 0.04, 0.06, 0.02, 0, 0, TAU); g.fill(); },
    tempest(g, top, lw) { g.strokeStyle = '#5ab0ff'; g.lineWidth = lw * 1.6; g.beginPath(); for (let i = 0; i <= 50; i++) { const a = i * 0.32, r = 0.01 + i * 0.0045; const x = Math.cos(a) * r * 1.6, y = top - 0.12 + Math.sin(a) * r * 0.6; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.strokeStyle = 'rgba(224,244,255,0.9)'; g.lineWidth = lw * 0.7; g.stroke(); },
    seraph(g, top, lw, rx) { for (let k = 0; k < 3; k++) ACC.wings(g, top, lw, rx + k * 0.04, '#fff4d8', 0.06 + k * 0.16, 1.1 - k * 0.12); ACC.halo(g, top, lw); },
    nocturne(g, top, lw) { DECO.moon(g, top, lw); },
    primordial(g, top, lw) { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.12, top + 0.02); g.quadraticCurveTo(s * 0.2, top - 0.1, s * 0.3, top - 0.26); g.quadraticCurveTo(s * 0.18, top - 0.12, s * 0.06, top); g.closePath(); fillStroke(g, '#f2e2c4', '#7a6a4a', lw); } ACC.crown(g, top, lw, 0.26); },
    chrono(g, top, lw) { const y = top - 0.18; g.strokeStyle = GOLD; g.lineWidth = lw * 1.2; g.beginPath(); g.ellipse(0, y, 0.26, 0.075, 0, 0, TAU); g.stroke(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.fillStyle = i % 3 ? '#c8a050' : GOLD_L; g.beginPath(); g.arc(Math.cos(a) * 0.26, y + Math.sin(a) * 0.075, i % 3 ? 0.012 : 0.022, 0, TAU); g.fill(); } g.fillStyle = '#7ad8ff'; star(g, 0, top - 0.06, 0.035, 4); g.fill(); },
    dragonlord(g, top, lw, rx) { DECO.primordial(g, top, lw); ACC.wings(g, top, lw, rx, '#8a1a2a', 0.12, 1); },
    astral(g, top, lw) { for (const [x, y, r, c] of [[0, -0.16, 0.06, '#ffffff'], [-0.13, -0.1, 0.04, '#c8d8ff'], [0.13, -0.1, 0.04, '#ffe0f8']]) { star(g, x, top + y, r); fillStroke(g, c, '#8a7ad8', lw * 0.6); } },
    eternal(g, top, lw) { const y = top - 0.07; g.strokeStyle = '#c89a30'; g.lineWidth = lw * 1.4; g.beginPath(); for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU; const x = 0.1 * Math.sin(a), yy = y + 0.04 * Math.sin(a) * Math.cos(a); i ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); },
    cosmos(g, top, lw) { g.strokeStyle = 'rgba(180,160,255,0.85)'; g.lineWidth = lw; g.beginPath(); g.ellipse(0, top - 0.06, 0.24, 0.05, 0, 0, TAU); g.stroke(); g.fillStyle = '#ff8ad8'; g.beginPath(); g.arc(0.2, top - 0.08, 0.025, 0, TAU); g.fill(); g.fillStyle = '#7ad8ff'; g.beginPath(); g.arc(-0.22, top - 0.05, 0.022, 0, TAU); g.fill(); },
    oracle(g, top, lw) { const y = top - 0.02; g.beginPath(); g.moveTo(-0.2, y - 0.17); g.lineTo(0, y - 0.28); g.lineTo(0.2, y - 0.17); g.closePath(); fillStroke(g, '#ffe9a8', '#8a6420', lw); for (const x of [-0.14, -0.02, 0.1]) { g.beginPath(); g.rect(x, y - 0.16, 0.04, 0.15); fillStroke(g, '#fff6dc', '#8a6420', lw * 0.6); } g.beginPath(); g.rect(-0.22, y - 0.02, 0.44, 0.03); fillStroke(g, '#ffd86a', '#8a6420', lw * 0.6); },
    mechaEye(g, lw) { const x = 0.18, y = -0.33; g.strokeStyle = '#6a7080'; g.lineWidth = lw * 1.4; g.beginPath(); g.arc(x, y, 0.13, 0, TAU); g.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.fillStyle = '#c8d0e0'; g.beginPath(); g.arc(x + Math.cos(a) * 0.15, y + Math.sin(a) * 0.15, 0.025, 0, TAU); g.fill(); } },
  };
  // 背後的光輪（永恆）：畫在本體之前
  const BEHIND = {
    eternal(g, shp, lw) { g.strokeStyle = 'rgba(255,236,190,0.95)'; g.lineWidth = lw * 1.4; g.beginPath(); g.ellipse(0, -shp.h * 0.52, 0.62, 0.56, 0, 0, TAU); g.stroke(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.fillStyle = i % 3 ? '#e8d8a0' : '#ffffff'; g.beginPath(); g.arc(Math.cos(a) * 0.62, -shp.h * 0.52 + Math.sin(a) * 0.56, i % 3 ? 0.012 : 0.02, 0, TAU); g.fill(); } },
  };

  // ---------- 材質（SR 以上的動態光，每幀疊加）----------
  function materialOf(type) {
    if (BODY[type.id] && BODY[type.id].mat) return BODY[type.id].mat;
    if (['nebula', 'astral', 'cosmos', 'nocturne'].includes(type.id)) return 'nebula';
    if (type.rarity === 'LR' || type.rarity === 'UR' || type.rarity === 'SSR') return 'metal';
    if (type.rarity === 'SR') return 'gem';
    return null;
  }

  // ---------- 史萊姆 ----------
  // 體型上限約 tier 1 的 1.7 倍（LR 最大）；階級主要靠飾品與材質區分
  function slimeSizeLogical(type) { return 14 + (Math.min(8, type.tier || 1) - 1) * 1.15 + ({ UR: 0.8, LR: 1.6 }[type.rarity] || 0); }
  // 回傳 {c, mask, ax, ay, w}：c 是快取畫布、mask 是本體剪影（材質用）、(ax, ay) 是腳底中心
  function slime(type, expr = 'normal', ms = 0) {
    const msKey = (ms >= 2 ? 1 : 0) + (ms >= 4 ? 2 : 0);
    const key = `ms|${type.id}|${expr}|${msKey}`;
    let e = cache.get(key); if (e) return e;
    const ov = BODY[type.id] || {}, pal = ov.pal || type.palette || {};
    const tier = Math.min(8, type.tier || 1), shp = jellyShape(tier);
    const bw = slimeSizeLogical(type) * RES;
    const padX = bw * 0.5, padTop = bw * 0.7, padBot = bw * 0.12;
    const c = mk(bw + padX * 2, bw * shp.h + padTop + padBot), g = c.getContext('2d');
    const ax = c.width / 2, ay = c.height - padBot;
    const body = rgb(pal.body || '#6fd36b'), shade = rgb(pal.shade || '#3d9a46'), light = rgb(pal.light || '#c4f5a8');
    const outline = ms >= 4 ? rgb('#c08a20') : rgb(ov.outline || darken(body, 0.45));
    const lw = 2.5 * 2 / bw;
    const top = -shp.h;
    g.save(); g.translate(ax, ay); g.scale(bw, bw);
    if (BEHIND[type.id]) BEHIND[type.id](g, shp, lw);
    // 高階通用配件（翅膀在本體後方）
    const deco = DECO[type.id];
    if (!deco && tier >= 4) ACC.wings(g, top, lw, 0.5, '#eaf2ff', 0.2, 1);
    if (!deco && tier >= 7) ACC.wings(g, top, lw, 0.56, '#ffffff', 0.08, 1.15);
    // ---- 本體：賽璐璐 3 階（硬邊）----
    jellyPath(g, shp); g.fillStyle = css(darken(body, 0.18)); g.fill();                    // 中間階（明度 −18%）
    g.save(); jellyPath(g, shp); g.clip();
    g.fillStyle = css(mix(darken(body, 0.32), shade, 0.3)); g.beginPath(); g.ellipse(0.42, -0.08, 0.38, 0.42, 0.4, 0, TAU); g.fill(); // 背光深階
    g.fillStyle = css(body); g.beginPath(); g.ellipse(-0.1, -shp.h * 0.56, 0.54, shp.h * 0.6, -0.25, 0, TAU); g.fill();               // 受光面
    g.fillStyle = css(mix(body, light, 0.45)); g.beginPath(); g.ellipse(-0.2, -shp.h * 0.7, 0.27, 0.17, -0.35, 0, TAU); g.fill();    // 亮階
    if (ov.paint) ov.paint(g, shp, lw);
    // tier 3：頂部晶面
    if (tier === 3) { g.fillStyle = css(light, 0.45); for (const pts of [[[-0.2, -0.74], [-0.05, -0.8], [-0.12, -0.6]], [[0.02, -0.8], [0.16, -0.74], [0.08, -0.62]], [[-0.1, -0.6], [0.06, -0.62], [-0.02, -0.5]]]) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); } g.strokeStyle = css(outline, 0.35); g.lineWidth = lw * 0.6; g.stroke(); }
    // 底部透光反光；tier 4+：底座光澤帶
    g.fillStyle = css(mix(body, light, 0.35), 0.75); g.beginPath(); g.ellipse(0.04, 0.035, 0.38, 0.06, 0, Math.PI, TAU); g.fill();
    if (tier >= 4) { g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = lw * 1.2; g.beginPath(); g.ellipse(0, -0.02, 0.44, 0.06, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    g.restore();
    jellyPath(g, shp); g.lineJoin = 'round'; g.strokeStyle = css(outline); g.lineWidth = lw; g.stroke();
    // 玻璃高光
    g.save(); jellyPath(g, shp); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-0.26, -shp.h * 0.76, 0.13, 0.055, -0.6, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(-0.1, -shp.h * 0.88, 0.022, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = lw * 0.8; g.beginPath(); g.ellipse(0, -shp.h * 0.48, 0.42, shp.h * 0.46, 0, Math.PI * 1.12, Math.PI * 1.42); g.stroke();
    g.restore();
    eyes(g, pal.eye || '#1a1a2e', body, light, expr, lw, ov.eyeY || -shp.h * 0.42);
    if (type.id === 'mecha' && expr === 'normal') DECO.mechaEye(g, lw);
    // 頭頂飾品
    if (deco) deco(g, top, lw, 0.5);
    else {
      if (tier === 2) ACC.sprout(g, top, lw);
      if (tier >= 3) ACC.crown(g, top, lw);
      if (tier >= 5) ACC.halo(g, top, lw);
      if (tier >= 6) ACC.gem(g, top, lw);
    }
    if (ms >= 2) ACC.bow(g, top, lw);
    g.restore();
    // 剪影遮罩（給材質光用）
    const mask = mk(c.width, c.height), mg = mask.getContext('2d');
    mg.translate(ax, ay); mg.scale(bw, bw); jellyPath(mg, shp); mg.fillStyle = '#fff'; mg.fill();
    e = { c, mask, ax, ay, w: bw, mat: materialOf(type), clockY: -shp.h * 0.47 * bw };
    cache.set(key, e);
    return e;
  }

  // ---------- 怪物（同一套上色規則，表情比較兇；頭目大 2 倍）----------
  function monster(id) {
    const key = `mm|${id}`; let e = cache.get(key); if (e) return e;
    const fn = MONSTERS[id]; if (!fn) return null;
    e = fn(); cache.set(key, e); return e;
  }
  // 小工具：在 (W×H) 畫布上以「單位＝寬」作畫
  function canvasFor(wLogical, aspect, boss) {
    // 左右各留 12%、上方留 10% 的邊，翅膀／鉗子不會被畫布切掉（造型座標不變）
    const W = wLogical * RES, c = mk(Math.ceil(W * 1.24), Math.ceil(W * aspect + W * 0.1)), g = c.getContext('2d');
    const ax = c.width / 2, ay = c.height - W * aspect * 0.05;
    g.translate(ax, ay); g.scale(W, W);
    return { c, g, ax, ay, W, lw: 2.5 * 2 / W * (boss ? 1.4 : 1) };
  }
  function cel(g, pathFn, base, lw, opts = {}) {
    const b = rgb(base);
    pathFn(); g.fillStyle = css(darken(b, 0.18)); g.fill();
    g.save(); pathFn(); g.clip();
    const [lx, ly, lrx, lry] = opts.lit || [-0.08, -0.5, 0.5, 0.45];
    g.fillStyle = css(b); g.beginPath(); g.ellipse(lx, ly, lrx, lry, -0.25, 0, TAU); g.fill();
    g.fillStyle = css(mix(b, '#ffffff', 0.35)); g.beginPath(); g.ellipse(lx - lrx * 0.25, ly - lry * 0.3, lrx * 0.45, lry * 0.3, -0.35, 0, TAU); g.fill();
    if (opts.paint) opts.paint();
    g.restore();
    pathFn(); g.lineJoin = 'round'; g.strokeStyle = css(darken(b, 0.45)); g.lineWidth = lw; g.stroke();
    if (opts.gloss !== false) { g.save(); pathFn(); g.clip(); g.fillStyle = 'rgba(255,255,255,0.7)'; const [gx, gy] = opts.glossAt || [lx - lrx * 0.35, ly - lry * 0.5]; g.beginPath(); g.ellipse(gx, gy, lrx * 0.22, lry * 0.1, -0.6, 0, TAU); g.fill(); g.restore(); }
  }
  function angryEyes(g, x, y, r, lw, iris = '#ff4a6a') {
    for (const s of [-1, 1]) {
      g.fillStyle = '#2a1030'; g.beginPath(); g.ellipse(s * x, y, r, r * 1.3, 0, 0, TAU); g.fill();
      g.fillStyle = iris; g.beginPath(); g.ellipse(s * x, y + r * 0.2, r * 0.55, r * 0.75, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(s * x - r * 0.3, y - r * 0.4, r * 0.28, 0, TAU); g.fill();
      g.strokeStyle = '#2a1030'; g.lineWidth = lw * 1.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(s * (x + r * 1.4), y - r * 1.9); g.lineTo(s * (x - r * 1.1), y - r * 1.2); g.stroke();
    }
  }
  const MONSTERS = {
    mushroom() {
      const { c, g, ax, ay, W, lw } = canvasFor(26, 1.05);
      const stemP = () => { g.beginPath(); g.moveTo(-0.17, -0.4); g.bezierCurveTo(-0.2, -0.2, -0.22, -0.04, -0.15, 0); g.lineTo(0.15, 0); g.bezierCurveTo(0.22, -0.04, 0.2, -0.2, 0.17, -0.4); g.closePath(); };
      const capP = () => { g.beginPath(); g.moveTo(-0.44, -0.4); g.bezierCurveTo(-0.46, -0.72, -0.22, -0.9, 0, -0.9); g.bezierCurveTo(0.22, -0.9, 0.46, -0.72, 0.44, -0.4); g.quadraticCurveTo(0.42, -0.33, 0.3, -0.35); g.quadraticCurveTo(0, -0.31, -0.3, -0.35); g.quadraticCurveTo(-0.42, -0.33, -0.44, -0.4); g.closePath(); };
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 0.12, -0.01, 0.08, 0.035, 0, 0, TAU); fillStroke(g, '#c9a97a', darken('#c9a97a', 0.45), lw); }
      cel(g, stemP, '#f2e2c4', lw, { lit: [-0.12, -0.25, 0.14, 0.3], gloss: false });
      // 菇褶陰影：傘下一圈較深的褶紋
      g.save(); stemP(); g.clip(); g.fillStyle = 'rgba(120,80,40,0.35)'; g.fillRect(-0.3, -0.42, 0.6, 0.06); g.restore();
      angryEyes(g, 0.075, -0.21, 0.035, lw);
      g.strokeStyle = '#2a1030'; g.lineWidth = lw; g.beginPath(); g.moveTo(-0.05, -0.115); g.quadraticCurveTo(0, -0.14, 0.05, -0.115); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0.02, -0.128); g.lineTo(0.035, -0.1); g.lineTo(0.045, -0.124); g.closePath(); g.fill();
      cel(g, capP, '#8a3fc9', lw, { lit: [-0.08, -0.66, 0.46, 0.3], paint() {
        g.fillStyle = 'rgba(250,236,255,0.95)'; for (const [x, y, r] of [[-0.24, -0.6, 0.06], [0.06, -0.77, 0.05], [0.26, -0.56, 0.065], [-0.02, -0.52, 0.035]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.75, 0, 0, TAU); g.fill(); }
        // 傘緣內側的褶紋
        g.fillStyle = 'rgba(40,10,60,0.45)'; g.beginPath(); g.ellipse(0, -0.35, 0.42, 0.05, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(40,10,60,0.6)'; g.lineWidth = lw * 0.5; for (let k = -6; k <= 6; k++) { g.beginPath(); g.moveTo(k * 0.06, -0.39); g.lineTo(k * 0.065, -0.33); g.stroke(); }
      } });
      return { c, ax, ay, w: W };
    },
    crab() {
      const { c, g, ax, ay, W, lw } = canvasFor(28, 0.85);
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { g.strokeStyle = '#1f5c94'; g.lineWidth = lw * 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(s * (0.12 + k * 0.08), -0.08); g.lineTo(s * (0.2 + k * 0.1), 0); g.stroke(); }
      for (const s of [-1, 1]) { const clawP = () => { g.beginPath(); g.ellipse(s * 0.36, -0.42, 0.13, 0.11, s * 0.3, 0, TAU); }; cel(g, clawP, '#55b8ee', lw, { lit: [s * 0.33, -0.46, 0.1, 0.08] }); g.fillStyle = '#0e2a4a'; g.beginPath(); g.moveTo(s * 0.3, -0.52); g.lineTo(s * 0.44, -0.47); g.lineTo(s * 0.34, -0.43); g.closePath(); g.fill(); }
      const bodyP = () => { g.beginPath(); g.ellipse(0, -0.2, 0.32, 0.2, 0, 0, TAU); };
      cel(g, bodyP, '#3aa0d8', lw, { lit: [-0.06, -0.26, 0.26, 0.14] });
      for (const s of [-1, 1]) { g.strokeStyle = '#1f5c94'; g.lineWidth = lw * 1.6; g.beginPath(); g.moveTo(s * 0.08, -0.36); g.lineTo(s * 0.1, -0.48); g.stroke(); }
      angryEyes(g, 0.1, -0.52, 0.04, lw, '#ffd23f');
      g.fillStyle = 'rgba(200,236,255,0.8)'; for (const [x, y, r] of [[0.22, -0.66, 0.03], [0.28, -0.74, 0.02]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      return { c, ax, ay, w: W };
    },
    imp() {
      const { c, g, ax, ay, W, lw } = canvasFor(26, 1.1);
      const flameP = () => { g.beginPath(); g.moveTo(-0.3, -0.05); g.bezierCurveTo(-0.38, -0.4, -0.2, -0.55, -0.15, -0.7); g.quadraticCurveTo(-0.08, -0.55, 0, -0.95); g.quadraticCurveTo(0.1, -0.55, 0.16, -0.72); g.bezierCurveTo(0.22, -0.55, 0.38, -0.4, 0.3, -0.05); g.quadraticCurveTo(0, 0.04, -0.3, -0.05); g.closePath(); };
      cel(g, flameP, '#ff7a2a', lw, { lit: [-0.05, -0.4, 0.26, 0.3] });
      g.save(); flameP(); g.clip(); const gr = g.createRadialGradient(0, -0.2, 0, 0, -0.2, 0.22); gr.addColorStop(0, 'rgba(255,240,170,0.95)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr; g.fillRect(-0.4, -0.5, 0.8, 0.5); g.restore();
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.12, -0.5); g.lineTo(s * 0.22, -0.68); g.lineTo(s * 0.2, -0.48); g.closePath(); fillStroke(g, '#4a2418', '#24100a', lw); }
      angryEyes(g, 0.09, -0.36, 0.04, lw, '#ffe24a');
      g.strokeStyle = '#4a1a08'; g.lineWidth = lw; g.beginPath(); g.moveTo(-0.07, -0.2); g.quadraticCurveTo(0, -0.14, 0.07, -0.2); g.stroke();
      return { c, ax, ay, w: W };
    },
    bat() {
      const { c, g, ax, ay, W, lw } = canvasFor(30, 0.75);
      for (const s of [-1, 1]) { const wingP = () => { g.beginPath(); g.moveTo(s * 0.12, -0.42); g.quadraticCurveTo(s * 0.35, -0.7, s * 0.5, -0.55); g.quadraticCurveTo(s * 0.44, -0.4, s * 0.48, -0.28); g.quadraticCurveTo(s * 0.38, -0.32, s * 0.34, -0.2); g.quadraticCurveTo(s * 0.24, -0.28, s * 0.14, -0.22); g.closePath(); }; cel(g, wingP, '#4a2a6a', lw, { lit: [s * 0.3, -0.5, 0.16, 0.12], gloss: false }); }
      const bodyP = () => { g.beginPath(); g.ellipse(0, -0.34, 0.16, 0.16, 0, 0, TAU); };
      cel(g, bodyP, '#5a3a80', lw, { lit: [-0.04, -0.38, 0.12, 0.1] });
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.05, -0.47); g.lineTo(s * 0.11, -0.58); g.lineTo(s * 0.13, -0.44); g.closePath(); fillStroke(g, '#5a3a80', '#24123a', lw); }
      angryEyes(g, 0.06, -0.36, 0.03, lw, '#ff3a4a');
      g.fillStyle = '#fff'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.03, -0.27); g.lineTo(s * 0.045, -0.23); g.lineTo(s * 0.06, -0.27); g.closePath(); g.fill(); }
      return { c, ax, ay, w: W };
    },
    wisp() {
      const { c, g, ax, ay, W, lw } = canvasFor(24, 1);
      const gl = g.createRadialGradient(0, -0.45, 0, 0, -0.45, 0.5); gl.addColorStop(0, 'rgba(255,240,170,0.55)'); gl.addColorStop(1, 'rgba(255,240,170,0)'); g.fillStyle = gl; g.fillRect(-0.5, -1, 1, 1);
      for (const s of [-1, 1]) { const wP = () => { g.beginPath(); g.ellipse(s * 0.28, -0.55, 0.14, 0.08, s * 0.4, 0, TAU); }; cel(g, wP, '#bfe6ff', lw, { gloss: false, lit: [s * 0.26, -0.58, 0.1, 0.06] }); }
      const bP = () => { g.beginPath(); g.arc(0, -0.45, 0.22, 0, TAU); };
      cel(g, bP, '#fff2a0', lw, { lit: [-0.06, -0.52, 0.18, 0.16] });
      angryEyes(g, 0.08, -0.46, 0.035, lw, '#e0a020');
      return { c, ax, ay, w: W };
    },
    golem() {
      const { c, g, ax, ay, W, lw } = canvasFor(56, 1.05, true);
      for (const s of [-1, 1]) { const lP = () => { g.beginPath(); g.roundRect(s * 0.16 - 0.08, -0.26, 0.16, 0.26, 0.04); }; cel(g, lP, '#7a8078', lw, { gloss: false }); }
      const bodyP = () => { g.beginPath(); g.ellipse(0, -0.45, 0.32, 0.24, 0, 0, TAU); };
      cel(g, bodyP, '#9aa096', lw, { lit: [-0.08, -0.52, 0.24, 0.16], paint() { g.strokeStyle = 'rgba(60,64,58,0.7)'; g.lineWidth = lw; g.beginPath(); g.moveTo(-0.1, -0.55); g.lineTo(-0.04, -0.45); g.lineTo(-0.08, -0.36); g.stroke(); } });
      for (const s of [-1, 1]) { const aP = () => { g.beginPath(); g.ellipse(s * 0.36, -0.42, 0.1, 0.2, s * 0.2, 0, TAU); }; cel(g, aP, '#8a9088', lw, { gloss: false }); const fP = () => { g.beginPath(); g.ellipse(s * 0.37, -0.2, 0.1, 0.08, 0, 0, TAU); }; cel(g, fP, '#9aa096', lw); }
      const hP = () => { g.beginPath(); g.ellipse(0, -0.76, 0.17, 0.14, 0, 0, TAU); };
      cel(g, hP, '#a8aea4', lw, { lit: [-0.04, -0.8, 0.12, 0.08] });
      g.fillStyle = '#5aa040'; g.beginPath(); g.ellipse(0, -0.89, 0.13, 0.04, 0, 0, TAU); g.fill();
      g.fillStyle = '#5afcff'; g.shadowColor = '#5afcff'; g.shadowBlur = 0; g.fillRect(-0.1, -0.78, 0.2, 0.025);
      return { c, ax, ay, w: W };
    },
    kraken() {
      const { c, g, ax, ay, W, lw } = canvasFor(56, 1.05, true);
      for (let k = 0; k < 6; k++) { const x0 = -0.35 + k * 0.14; g.strokeStyle = '#3a2a8a'; g.lineWidth = lw * 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, -0.35); g.bezierCurveTo(x0 - 0.04, -0.2, x0 + 0.06, -0.1, x0 + (k % 2 ? 0.05 : -0.05), 0); g.stroke(); g.strokeStyle = '#6a5ac8'; g.lineWidth = lw * 4.5; g.stroke(); }
      const hP = () => { g.beginPath(); g.ellipse(0, -0.58, 0.34, 0.3, 0, 0, TAU); };
      cel(g, hP, '#5a4ab8', lw, { lit: [-0.08, -0.66, 0.26, 0.2], paint() { g.fillStyle = 'rgba(200,190,255,0.5)'; for (const [x, y] of [[-0.18, -0.74], [0.12, -0.8], [0.22, -0.6]]) { g.beginPath(); g.arc(x, y, 0.03, 0, TAU); g.fill(); } } });
      for (const s of [-1, 1]) { g.fillStyle = '#ffd23f'; g.beginPath(); g.ellipse(s * 0.13, -0.52, 0.07, 0.08, 0, 0, TAU); g.fill(); g.strokeStyle = '#7a5a10'; g.lineWidth = lw; g.stroke(); g.fillStyle = '#1a1030'; g.fillRect(s * 0.13 - 0.012, -0.58, 0.024, 0.12); }
      return { c, ax, ay, w: W };
    },
    dragon() {
      const { c, g, ax, ay, W, lw } = canvasFor(60, 1, true);
      for (const s of [-1, 1]) { const wP = () => { g.beginPath(); g.moveTo(s * 0.08, -0.55); g.quadraticCurveTo(s * 0.35, -0.95, s * 0.5, -0.8); g.quadraticCurveTo(s * 0.4, -0.65, s * 0.46, -0.5); g.quadraticCurveTo(s * 0.3, -0.5, s * 0.18, -0.4); g.closePath(); }; cel(g, wP, '#a82a20', lw, { gloss: false, lit: [s * 0.3, -0.7, 0.14, 0.12] }); }
      const bP = () => { g.beginPath(); g.ellipse(0, -0.3, 0.26, 0.24, 0, 0, TAU); };
      cel(g, bP, '#d8402a', lw, { lit: [-0.06, -0.36, 0.2, 0.16], paint() { g.fillStyle = '#ffcf5a'; g.beginPath(); g.ellipse(0, -0.24, 0.13, 0.16, 0, 0, TAU); g.fill(); } });
      const hP = () => { g.beginPath(); g.ellipse(0, -0.68, 0.16, 0.13, 0, 0, TAU); };
      cel(g, hP, '#d8402a', lw, { lit: [-0.04, -0.72, 0.12, 0.08] });
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 0.06, -0.78); g.quadraticCurveTo(s * 0.12, -0.9, s * 0.18, -0.96); g.quadraticCurveTo(s * 0.12, -0.84, s * 0.12, -0.76); g.closePath(); fillStroke(g, '#f2e2c4', '#7a6a4a', lw); }
      angryEyes(g, 0.07, -0.69, 0.03, lw, '#ffe24a');
      return { c, ax, ay, w: W };
    },
    lich() {
      const { c, g, ax, ay, W, lw } = canvasFor(56, 1.05, true);
      g.strokeStyle = '#6b4421'; g.lineWidth = lw * 3; g.beginPath(); g.moveTo(0.34, 0); g.lineTo(0.34, -0.85); g.stroke();
      const orb = g.createRadialGradient(0.34, -0.9, 0, 0.34, -0.9, 0.08); orb.addColorStop(0, '#e0ffe8'); orb.addColorStop(1, '#2ad06a'); g.fillStyle = orb; g.beginPath(); g.arc(0.34, -0.9, 0.07, 0, TAU); g.fill();
      const rP = () => { g.beginPath(); g.moveTo(0, -0.82); g.quadraticCurveTo(0.3, -0.6, 0.3, 0); g.lineTo(-0.3, 0); g.quadraticCurveTo(-0.3, -0.6, 0, -0.82); g.closePath(); };
      cel(g, rP, '#3a2456', lw, { lit: [-0.08, -0.5, 0.22, 0.4] });
      const sk = () => { g.beginPath(); g.ellipse(0, -0.66, 0.1, 0.11, 0, 0, TAU); };
      cel(g, sk, '#e8e0c8', lw, { lit: [-0.03, -0.69, 0.07, 0.07] });
      for (const s of [-1, 1]) { g.fillStyle = '#6aff9a'; g.beginPath(); g.ellipse(s * 0.04, -0.67, 0.022, 0.03, 0, 0, TAU); g.fill(); }
      return { c, ax, ay, w: W };
    },
    angel() {
      const { c, g, ax, ay, W, lw } = canvasFor(60, 1, true);
      for (const s of [-1, 1]) { const wP = () => { g.beginPath(); g.moveTo(s * 0.08, -0.6); g.quadraticCurveTo(s * 0.4, -0.95, s * 0.52, -0.7); g.quadraticCurveTo(s * 0.42, -0.55, s * 0.48, -0.4); g.quadraticCurveTo(s * 0.3, -0.42, s * 0.12, -0.35); g.closePath(); }; cel(g, wP, '#3a2a4a', lw, { gloss: false, lit: [s * 0.3, -0.7, 0.14, 0.12] }); }
      const rP = () => { g.beginPath(); g.moveTo(0, -0.62); g.quadraticCurveTo(0.24, -0.4, 0.26, 0); g.lineTo(-0.26, 0); g.quadraticCurveTo(-0.24, -0.4, 0, -0.62); g.closePath(); };
      cel(g, rP, '#e8e4f0', lw, { lit: [-0.06, -0.4, 0.2, 0.3] });
      const hP = () => { g.beginPath(); g.ellipse(0, -0.7, 0.09, 0.1, 0, 0, TAU); };
      cel(g, hP, '#f4d8c8', lw, { lit: [-0.02, -0.72, 0.06, 0.06] });
      g.strokeStyle = GOLD; g.lineWidth = lw * 1.6; g.beginPath(); g.ellipse(0, -0.86, 0.12, 0.03, 0, 0, TAU); g.stroke();
      g.fillStyle = '#c8d0e0'; g.fillRect(0.3, -0.8, 0.03, 0.55); g.fillStyle = GOLD; g.fillRect(0.26, -0.3, 0.11, 0.025);
      for (const s of [-1, 1]) { g.fillStyle = '#a01a3a'; g.beginPath(); g.ellipse(s * 0.035, -0.7, 0.014, 0.02, 0, 0, TAU); g.fill(); }
      return { c, ax, ay, w: W };
    },
  };

  // ---------- 繪製（每幀只貼圖；擠壓伸展是縮放補間）----------
  function draw(ctx, e, x, y, scale, opts = {}) {
    const sx = opts.sx || 1, sy = opts.sy || 1, lift = opts.lift || 0, k = scale / RES * (opts.size || 1);
    const w = e.c.width * k * sx, h = e.c.height * k * sy;
    const dx = x * scale - e.ax * k * sx, dy = (y - lift) * scale - e.ay * k * sy;
    ctx.drawImage(e.c, dx, dy, w, h);
    return { dx, dy, w, h, k };
  }
  // 材質光：把移動的光帶剪進本體剪影，再疊到畫面上
  const scratch = mk(8, 8), sg = scratch.getContext('2d');
  function material(ctx, e, rect, t, phase = 0) {
    if (!e.mat) return;
    const W = e.c.width, H = e.c.height;
    if (scratch.width < W || scratch.height < H) { scratch.width = Math.max(scratch.width, W); scratch.height = Math.max(scratch.height, H); }
    sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, W, H);
    if (e.mat === 'metal') {
      const p = ((t * 0.35 + phase) % 1.6) - 0.3, x = p * W;
      const gr = sg.createLinearGradient(x - W * 0.2, 0, x + W * 0.2, H * 0.4);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      sg.fillStyle = gr; sg.fillRect(0, 0, W, H);
    } else if (e.mat === 'gem') {
      const p = ((t * 0.25 + phase) % 1.6) - 0.3, x = p * W;
      const gr = sg.createLinearGradient(x - W * 0.25, 0, x + W * 0.25, H * 0.5);
      ['rgba(255,120,160,0)', 'rgba(255,200,120,0.35)', 'rgba(140,255,200,0.35)', 'rgba(140,180,255,0.35)', 'rgba(220,140,255,0)'].forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c));
      sg.fillStyle = gr; sg.fillRect(0, 0, W, H);
    } else if (e.mat === 'nebula') {
      for (let i = 0; i < 2; i++) { const cx = W * (0.5 + Math.sin(t * 0.4 + i * 2 + phase) * 0.18), cy = H * (0.62 + Math.cos(t * 0.33 + i + phase) * 0.08); const gr = sg.createRadialGradient(cx, cy, 0, cx, cy, W * 0.22); gr.addColorStop(0, i ? 'rgba(255,140,220,0.35)' : 'rgba(120,200,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sg.fillStyle = gr; sg.fillRect(0, 0, W, H); }
    }
    sg.globalCompositeOperation = 'destination-in'; sg.drawImage(e.mask, 0, 0);
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(scratch, 0, 0, W, H, rect.dx, rect.dy, rect.w, rect.h); ctx.restore();
  }
  // 時空史萊姆：繞錶盤轉動的時針與分針
  function clockHands(ctx, e, rect, t) {
    const cx = rect.dx + e.ax * rect.w / e.c.width, cy = rect.dy + (e.ay + e.clockY) * rect.h / e.c.height, R = e.w * 0.26 * rect.w / e.c.width;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#fff1a0'; ctx.lineWidth = Math.max(2, R * 0.08);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(t * 1.6 - Math.PI / 2) * R, cy + Math.sin(t * 1.6 - Math.PI / 2) * R * 0.92); ctx.stroke();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = Math.max(3, R * 0.12);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(t * 0.2 - Math.PI / 2) * R * 0.6, cy + Math.sin(t * 0.2 - Math.PI / 2) * R * 0.6 * 0.92); ctx.stroke();
    ctx.restore();
  }
  function shadow(ctx, x, y, wLogical, scale, lift = 0) {
    const r = wLogical * 0.5 * scale * (1 - lift / 60);
    ctx.save(); ctx.globalAlpha = 0.28 * (1 - lift / 50);
    const gr = ctx.createRadialGradient(x * scale, y * scale, 0, x * scale, y * scale, r);
    gr.addColorStop(0, 'rgba(20,16,40,0.9)'); gr.addColorStop(1, 'rgba(20,16,40,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x * scale, y * scale + 1, r, r * 0.32, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  function hopPose(p, height = 10) {
    if (p < 0.15) { const k = p / 0.15; return { sx: 1 + 0.16 * k, sy: 1 - 0.16 * k, lift: 0 }; }
    if (p < 0.85) { const k = (p - 0.15) / 0.7, s = Math.sin(k * Math.PI); return { sx: 1 - 0.08 * s, sy: 1 + 0.14 * s, lift: s * height }; }
    const k = (p - 0.85) / 0.15; return { sx: 1.18 - 0.18 * k, sy: 0.84 + 0.16 * k, lift: 0 };
  }
  function breathe(t, phase = 0) { const s = Math.sin(t * 2.4 + phase); return { sx: 1 + 0.025 * s, sy: 1 - 0.025 * s, lift: 0 }; }
  // 預熱：載入時把目前用得到的種類先畫好
  function warm(types) { for (const ty of types) { slime(ty, 'normal'); } }

  // UI 用的靜態圖：256×256 正方形、底部對齊（CSS 決定顯示尺寸）
  const uiCache = new Map();
  function uiCanvas(type) {
    if (!uiCache.has(type)) uiCache.set(type, fitSquare(slime(type, 'normal').c));
    return uiCache.get(type);
  }
  function fitSquare(src) {
    const S = 256, c = mk(S, S), g = c.getContext('2d'), e = { c: src };
    // 先裁掉透明邊，角色才會填滿格子
    const W = e.c.width, H = e.c.height, d = e.c.getContext('2d').getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
    const bw = x1 - x0 + 2, bh = y1 - y0 + 2, k = Math.min(S * 0.9 / bw, S * 0.9 / bh);
    g.drawImage(e.c, x0, y0, bw, bh, (S - bw * k) / 2, S * 0.96 - bh * k, bw * k, bh * k);
    return c;
  }
  const urlCache = new Map();
  function url(type) {
    if (!urlCache.has(type)) urlCache.set(type, uiCanvas(type).toDataURL());
    return urlCache.get(type);
  }
  function monsterURL(id) {
    const key = 'm|' + id;
    if (!urlCache.has(key)) { const e = monster(id); urlCache.set(key, e ? fitSquare(e.c).toDataURL() : ''); }
    return urlCache.get(key);
  }
  window.ModernSprites = { RES, slime, monster, draw, material, clockHands, shadow, hopPose, breathe, slimeSizeLogical, warm, uiCanvas, url, monsterURL };
})();
