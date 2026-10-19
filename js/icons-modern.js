// v2.0 現代風格 UI 圖示：和 sprites-modern 同樣的賽璐璐三階上色＋彩色描邊（ccline-27）
// ModernIcons.url(name) / canvas(name)：128×128，沒有定義的名稱回傳 null，呼叫端退回像素圖示。
(function () {
  const S = 128, TAU = Math.PI * 2;
  const cache = new Map(), urls = new Map();
  function rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(h, k) { const c = rgb(h).map(v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)); return `rgb(${c[0]},${c[1]},${c[2]})`; }
  const LW = 0.035;

  // 賽璐璐上色：底色 → 右下陰影 → 左上亮部 → 白色高光 → 深色同色系描邊
  function cel(g, path, base, o = {}) {
    path(); g.fillStyle = base; g.fill();
    g.save(); path(); g.clip();
    g.fillStyle = shade(base, -0.28); g.beginPath(); g.ellipse(0.16 + (o.sx || 0), 0.2 + (o.sy || 0), 0.5, 0.42, -0.5, 0, TAU); g.globalAlpha = 0.8; g.fill();
    g.globalAlpha = 1; g.fillStyle = base; g.beginPath(); g.ellipse(-0.06 + (o.sx || 0) * 0.5, -0.04 + (o.sy || 0) * 0.5, 0.4, 0.36, -0.5, 0, TAU); g.fill();
    g.fillStyle = shade(base, 0.32); g.beginPath(); g.ellipse(-0.14, -0.16, 0.2, 0.14, -0.6, 0, TAU); g.globalAlpha = 0.85; g.fill();
    if (o.paint) { g.globalAlpha = 1; o.paint(g); }
    g.restore();
    if (o.gloss !== false) { g.fillStyle = 'rgba(255,255,255,0.85)'; const [x, y] = o.gloss || [-0.18, -0.2]; g.beginPath(); g.ellipse(x, y, 0.06, 0.035, -0.6, 0, TAU); g.fill(); }
    path(); g.lineJoin = 'round'; g.lineWidth = o.lw || LW; g.strokeStyle = o.line || shade(base, -0.55); g.stroke();
  }
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
  function star(g, x, y, r, ri, n = 5, rot = -Math.PI / 2) {
    g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? ri : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath();
  }
  function sparkle(g, x, y, r, col = '#ffffff') {
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
  }
  // 單顆寶石（粉紅主色，可指定中心與大小）
  function gemAt(g, x, y, r, base = '#ff6ad0') {
    const crown = () => poly(g, [[x - r, y - r * 0.25], [x - r * 0.55, y - r * 0.75], [x + r * 0.55, y - r * 0.75], [x + r, y - r * 0.25], [x, y + r * 0.95]]);
    cel(g, crown, base, { gloss: false, lw: LW * Math.min(1, r / 0.4 + 0.3) });
    g.save(); crown(); g.clip();
    g.fillStyle = shade(base, 0.45); poly(g, [[x - r * 0.55, y - r * 0.75], [x - r * 0.15, y - r * 0.25], [x - r, y - r * 0.25]]); g.fill();
    g.fillStyle = shade(base, -0.3); poly(g, [[x + r * 0.15, y - r * 0.25], [x + r, y - r * 0.25], [x, y + r * 0.95]]); g.fill();
    g.strokeStyle = shade(base, -0.45); g.lineWidth = LW * 0.5;
    g.beginPath(); g.moveTo(x - r, y - r * 0.25); g.lineTo(x + r, y - r * 0.25); g.moveTo(x - r * 0.15, y - r * 0.25); g.lineTo(x, y + r * 0.95); g.lineTo(x + r * 0.15, y - r * 0.25); g.stroke();
    g.restore();
    sparkle(g, x - r * 0.45, y - r * 0.5, r * 0.22);
  }
  function coinAt(g, x, y, r) {
    const p = () => { g.beginPath(); g.arc(x, y, r, 0, TAU); };
    cel(g, p, '#f7c84a', { gloss: [x - r * 0.45, y - r * 0.5], line: '#8a5a10', paint() {
      g.strokeStyle = 'rgba(160,100,20,0.75)'; g.lineWidth = r * 0.09; g.beginPath(); g.arc(x, y, r * 0.72, 0, TAU); g.stroke();
      // 牧場標記：小果凍圓頂
      g.fillStyle = '#c98a24'; g.beginPath(); g.moveTo(x - r * 0.38, y + r * 0.25); g.bezierCurveTo(x - r * 0.38, y - r * 0.45, x + r * 0.38, y - r * 0.45, x + r * 0.38, y + r * 0.25); g.closePath(); g.fill();
      g.fillStyle = '#fff1a0'; g.beginPath(); g.ellipse(x - r * 0.14, y - r * 0.08, r * 0.1, r * 0.06, -0.5, 0, TAU); g.fill();
    } });
  }
  function capsule(g, top, bot, band, deco) {
    // 直立的扭蛋膠囊（上蓋較高、下殼較淺），不用正圓
    const topP = () => { g.beginPath(); g.ellipse(0, 0.06, 0.32, 0.5, 0, Math.PI, 0); g.closePath(); };
    const botP = () => { g.beginPath(); g.ellipse(0, 0.06, 0.32, 0.38, 0, 0, Math.PI); g.closePath(); };
    cel(g, botP, bot, { gloss: false, sy: -0.1 });
    cel(g, topP, top, { gloss: [-0.18, -0.2] });
    g.fillStyle = band; g.beginPath(); g.roundRect(-0.34, 0.03, 0.68, 0.06, 0.03); g.fill(); g.lineWidth = LW * 0.8; g.strokeStyle = shade(band, -0.5); g.stroke();
    if (deco) deco(g);
  }

  const DEF = {
    coin(g) { coinAt(g, 0, 0, 0.4); },
    gem(g) { gemAt(g, 0, 0.02, 0.42); },
    star(g) { cel(g, () => star(g, 0, 0.04, 0.46, 0.2), '#ffd23f', { gloss: [-0.08, -0.16], line: '#9a6a10' }); },
    heart(g) {
      const p = () => { g.beginPath(); g.moveTo(0, 0.38); g.bezierCurveTo(-0.5, 0.02, -0.4, -0.42, 0, -0.18); g.bezierCurveTo(0.4, -0.42, 0.5, 0.02, 0, 0.38); g.closePath(); };
      cel(g, p, '#ff5c8a', { gloss: [-0.2, -0.16] });
    },
    bag(g) {
      const p = () => { g.beginPath(); g.moveTo(-0.12, -0.24); g.bezierCurveTo(-0.46, -0.1, -0.46, 0.4, -0.2, 0.42); g.lineTo(0.2, 0.42); g.bezierCurveTo(0.46, 0.4, 0.46, -0.1, 0.12, -0.24); g.closePath(); };
      cel(g, p, '#d89a3a', { line: '#5a3410' });
      const neck = () => { g.beginPath(); g.moveTo(-0.16, -0.42); g.lineTo(0.16, -0.42); g.lineTo(0.1, -0.24); g.lineTo(-0.1, -0.24); g.closePath(); };
      cel(g, neck, '#d89a3a', { gloss: false, line: '#5a3410' });
      g.fillStyle = '#c0392b'; g.beginPath(); g.roundRect(-0.15, -0.28, 0.3, 0.06, 0.03); g.fill();
      coinAt(g, 0.02, 0.12, 0.16);
    },
    capsule(g) { capsule(g, '#ff7aa8', '#f3efe6', '#ffffff'); },
    capsule_star(g) {
      capsule(g, '#2a2050', '#1a1430', '#e0b850', g2 => { for (const [x, y, r] of [[-0.14, -0.2, 0.06], [0.16, -0.12, 0.045], [0.12, 0.22, 0.05], [-0.18, 0.2, 0.035]]) sparkle(g2, x, y, r, '#ffe36a'); });
    },
    capsule_oracle(g) {
      capsule(g, '#f6eedb', '#1a2a5a', '#d8a840', g2 => {
        g2.fillStyle = '#ffffff'; g2.beginPath(); g2.ellipse(0, -0.2, 0.09, 0.055, 0, 0, TAU); g2.fill(); g2.strokeStyle = '#7a5a10'; g2.lineWidth = LW * 0.6; g2.stroke();
        g2.fillStyle = '#3ac8ff'; g2.beginPath(); g2.arc(0, -0.2, 0.035, 0, TAU); g2.fill();
        for (const [x, y, r] of [[0.14, 0.2, 0.04], [-0.16, 0.24, 0.03]]) sparkle(g2, x, y, r, '#fff4d0');
      });
    },
    gift(g) {
      cel(g, () => { g.beginPath(); g.roundRect(-0.36, -0.08, 0.72, 0.48, 0.05); }, '#ff7aa8', { gloss: false });
      cel(g, () => { g.beginPath(); g.roundRect(-0.42, -0.24, 0.84, 0.18, 0.05); }, '#ff8ab4', { gloss: [-0.26, -0.18] });
      g.fillStyle = '#ffd23f'; g.fillRect(-0.06, -0.24, 0.12, 0.64); g.strokeStyle = '#9a6a10'; g.lineWidth = LW * 0.6; g.strokeRect(-0.06, -0.24, 0.12, 0.64);
      for (const s of [-1, 1]) cel(g, () => { g.beginPath(); g.ellipse(s * 0.14, -0.33, 0.14, 0.08, s * -0.5, 0, TAU); }, '#ffd23f', { gloss: false, line: '#9a6a10' });
    },
    card(g) {
      cel(g, () => { g.beginPath(); g.roundRect(-0.42, -0.28, 0.84, 0.56, 0.08); }, '#3a6ad0', { gloss: [-0.28, -0.2], line: '#0a1838' });
      cel(g, () => star(g, 0.02, 0.02, 0.2, 0.09), '#ffd23f', { gloss: false, line: '#9a6a10' });
    },
    scroll(g) {
      cel(g, () => { g.beginPath(); g.roundRect(-0.3, -0.32, 0.6, 0.64, 0.04); }, '#f3e3bf', { gloss: false, line: '#7a5a30' });
      g.strokeStyle = 'rgba(122,90,48,0.6)'; g.lineWidth = LW * 0.7; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-0.18, -0.16 + i * 0.1); g.lineTo(0.18 - (i === 3 ? 0.12 : 0), -0.16 + i * 0.1); g.stroke(); }
      for (const y of [-0.34, 0.34]) cel(g, () => { g.beginPath(); g.roundRect(-0.38, y - 0.06, 0.76, 0.12, 0.06); }, '#c98a4a', { gloss: false, line: '#5a3410' });
    },
    relic_prod(g) { // 豐收號角
      const p = () => { g.beginPath(); g.moveTo(-0.4, 0.3); g.bezierCurveTo(-0.3, -0.1, 0.0, -0.3, 0.3, -0.38); g.lineTo(0.42, -0.06); g.bezierCurveTo(0.12, -0.02, -0.1, 0.14, -0.26, 0.4); g.closePath(); };
      cel(g, p, '#e0a840', { line: '#5a3410', gloss: [0.0, -0.18] });
      g.fillStyle = '#5a3410'; g.beginPath(); g.ellipse(0.36, -0.22, 0.06, 0.16, 0.3, 0, TAU); g.fill();
      coinAt(g, 0.18, 0.18, 0.12); gemAt(g, 0.36, 0.14, 0.1);
    },
    relic_crit(g) { // 幸運骰子
      cel(g, () => { g.beginPath(); g.roundRect(-0.34, -0.34, 0.68, 0.68, 0.12); }, '#f6f2ea', { line: '#5a4a3a', gloss: [-0.2, -0.22] });
      g.fillStyle = '#e0533d'; for (const [x, y] of [[-0.16, -0.16], [0.16, -0.16], [0, 0], [-0.16, 0.16], [0.16, 0.16]]) { g.beginPath(); g.arc(x, y, 0.06, 0, TAU); g.fill(); }
    },
    relic_combat(g) { // 勇者徽章（盾）
      const p = () => { g.beginPath(); g.moveTo(0, -0.42); g.lineTo(0.36, -0.3); g.bezierCurveTo(0.36, 0.08, 0.2, 0.3, 0, 0.42); g.bezierCurveTo(-0.2, 0.3, -0.36, 0.08, -0.36, -0.3); g.closePath(); };
      cel(g, p, '#4fa8ff', { line: '#0a2a5a' });
      cel(g, () => star(g, 0, -0.02, 0.18, 0.08), '#ffd23f', { gloss: false, line: '#9a6a10' });
    },
    relic_offline(g) { // 安眠枕頭
      const p = () => { g.beginPath(); g.moveTo(-0.42, -0.2); g.quadraticCurveTo(0, -0.3, 0.42, -0.2); g.quadraticCurveTo(0.48, 0, 0.42, 0.2); g.quadraticCurveTo(0, 0.3, -0.42, 0.2); g.quadraticCurveTo(-0.48, 0, -0.42, -0.2); g.closePath(); };
      cel(g, p, '#d8ccf0', { line: '#5a4a8a', gloss: [-0.22, -0.1] });
      g.fillStyle = '#5a4a8a'; g.font = 'bold 0.2px sans-serif'; g.textAlign = 'center'; g.fillText('z', 0.22, -0.26); g.font = 'bold 0.14px sans-serif'; g.fillText('z', 0.34, -0.38);
    },
    relic_gems(g) { // 寶石磁鐵
      g.lineCap = 'butt';
      const p = () => { g.beginPath(); g.moveTo(-0.34, -0.36); g.lineTo(-0.34, 0.02); g.arc(0, 0.02, 0.34, Math.PI, 0, true); g.lineTo(0.34, -0.36); g.lineTo(0.14, -0.36); g.lineTo(0.14, 0.02); g.arc(0, 0.02, 0.14, 0, Math.PI); g.lineTo(-0.14, -0.36); g.closePath(); };
      cel(g, p, '#e0533d', { line: '#5a1408', gloss: [-0.26, 0.1] });
      for (const s of [-1, 1]) cel(g, () => { g.beginPath(); g.rect(s * 0.24 - 0.1, -0.42, 0.2, 0.12); }, '#e8eef8', { gloss: false, line: '#4a5a6a' });
      gemAt(g, 0, -0.26, 0.1);
    },
    fire(g) {
      const p = () => { g.beginPath(); g.moveTo(0, -0.44); g.bezierCurveTo(0.14, -0.2, 0.38, -0.08, 0.32, 0.16); g.bezierCurveTo(0.28, 0.36, 0.12, 0.42, 0, 0.42); g.bezierCurveTo(-0.12, 0.42, -0.3, 0.36, -0.32, 0.14); g.bezierCurveTo(-0.34, -0.04, -0.16, -0.12, -0.1, -0.26); g.bezierCurveTo(-0.04, -0.16, 0, -0.3, 0, -0.44); g.closePath(); };
      cel(g, p, '#ff7a2a', { line: '#8a2008', gloss: false });
      cel(g, () => { g.beginPath(); g.moveTo(0, -0.04); g.bezierCurveTo(0.16, 0.08, 0.16, 0.32, 0, 0.32); g.bezierCurveTo(-0.16, 0.32, -0.16, 0.12, 0, -0.04); g.closePath(); }, '#ffe24a', { gloss: false, lw: 0.001, line: '#ffe24a' });
    },
    water(g) {
      const p = () => { g.beginPath(); g.moveTo(0, -0.44); g.bezierCurveTo(0.1, -0.24, 0.34, 0, 0.34, 0.14); g.arc(0, 0.12, 0.34, 0, Math.PI); g.bezierCurveTo(-0.34, 0, -0.1, -0.24, 0, -0.44); g.closePath(); };
      cel(g, p, '#4fa8ff', { line: '#0e3a6a', gloss: [-0.14, 0.04] });
    },
    grass(g) {
      const p = () => { g.beginPath(); g.moveTo(-0.36, 0.36); g.bezierCurveTo(-0.4, -0.1, -0.04, -0.4, 0.4, -0.4); g.bezierCurveTo(0.4, 0.02, 0.1, 0.36, -0.36, 0.36); g.closePath(); };
      cel(g, p, '#6ac84a', { line: '#1f5a14', gloss: [-0.04, -0.2] });
      g.strokeStyle = '#2f7a24'; g.lineWidth = LW; g.beginPath(); g.moveTo(-0.36, 0.36); g.quadraticCurveTo(0, 0, 0.3, -0.3); g.stroke();
    },
    light(g) {
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#9a6a10'; g.lineWidth = LW * 0.8;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.save(); g.rotate(a); poly(g, [[-0.06, -0.3], [0, -0.46], [0.06, -0.3]]); g.fill(); g.stroke(); g.restore(); }
      cel(g, () => { g.beginPath(); g.arc(0, 0, 0.24, 0, TAU); }, '#ffe24a', { line: '#9a6a10' });
    },
    dark(g) {
      const p = () => { g.beginPath(); g.arc(0, 0, 0.4, 0.6, TAU - 0.6, false); g.arc(0.2, -0.04, 0.3, TAU - 0.9, 0.9, true); g.closePath(); };
      cel(g, p, '#8a5ac8', { line: '#24123a', gloss: [-0.24, -0.14] });
      sparkle(g, 0.28, -0.24, 0.08, '#e8d8ff');
    },
  };
  // 寶石包：數量與容器逐級升高
  const PACK = [null,
    g => gemAt(g, 0, 0.04, 0.34),
    g => { gemAt(g, -0.14, 0.1, 0.26); gemAt(g, 0.14, 0.0, 0.3); },
    g => { gemAt(g, -0.2, 0.14, 0.22); gemAt(g, 0.2, 0.14, 0.22); gemAt(g, 0, -0.06, 0.28); },
    g => { cel(g, () => { g.beginPath(); g.roundRect(-0.4, -0.02, 0.8, 0.4, 0.05); }, '#a86a30', { gloss: false, line: '#4a2a10' }); g.fillStyle = '#ffd23f'; g.fillRect(-0.4, 0.1, 0.8, 0.05); gemAt(g, -0.18, -0.08, 0.18); gemAt(g, 0.16, -0.1, 0.2); gemAt(g, 0, -0.2, 0.18, '#7ac8ff'); },
    g => { gemAt(g, -0.26, 0.22, 0.18); gemAt(g, 0.26, 0.22, 0.18); gemAt(g, 0, 0.2, 0.2, '#7ac8ff'); gemAt(g, -0.13, 0.0, 0.2); gemAt(g, 0.13, 0.0, 0.2, '#ffd23f'); gemAt(g, 0, -0.2, 0.22); },
    g => { PACK[5](g); cel(g, () => { g.beginPath(); g.moveTo(-0.2, -0.3); g.lineTo(-0.2, -0.46); g.lineTo(-0.1, -0.38); g.lineTo(0, -0.48); g.lineTo(0.1, -0.38); g.lineTo(0.2, -0.46); g.lineTo(0.2, -0.3); g.closePath(); }, '#ffd23f', { gloss: false, line: '#9a6a10' }); },
    g => {
      const gl = g.createRadialGradient(0, 0, 0, 0, 0, 0.5); gl.addColorStop(0, 'rgba(255,230,140,0.7)'); gl.addColorStop(1, 'rgba(255,230,140,0)'); g.fillStyle = gl; g.fillRect(-0.5, -0.5, 1, 1);
      PACK[6](g); sparkle(g, -0.36, -0.3, 0.08); sparkle(g, 0.38, -0.2, 0.06);
    },
  ];
  for (let i = 1; i <= 7; i++) DEF['gem' + i] = PACK[i];

  function canvas(name) {
    if (cache.has(name)) return cache.get(name);
    const fn = DEF[name]; if (!fn) return null;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); g.translate(S / 2, S / 2); g.scale(S, S); g.lineCap = 'round';
    fn(g); cache.set(name, c); return c;
  }
  function url(name) {
    if (!urls.has(name)) { const c = canvas(name); urls.set(name, c ? c.toDataURL() : null); }
    return urls.get(name);
  }
  window.ModernIcons = { canvas, url, names: () => Object.keys(DEF) };
})();
