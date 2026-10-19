// monsters.js — 遠征怪物像素圖（ccline-27）
// 以形狀（橢圓／矩形／多邊形）組合，逐像素上光影、描邊，畫風與史萊姆一致。
(function () {
  'use strict';
  const { rgb, mix } = window.Sprites;
  const cache = new Map();
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const dither = (x, y, t) => t * 16 > BAYER[y & 3][x & 3] + 0.5;

  const E = (x, y, rx, ry, c) => ({ s: 'e', x, y, rx, ry, c });
  const R = (x, y, w, h, c) => ({ s: 'r', x, y, w, h, c });
  const P = (pts, c) => ({ s: 'p', pts, c });
  const mirror = (pts, W) => pts.map(([x, y]) => [W - 1 - x, y]);

  function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function bounds(p) {
    if (p.s === 'e') return [p.x - p.rx, p.y - p.ry, p.x + p.rx, p.y + p.ry];
    if (p.s === 'r') return [p.x, p.y, p.x + p.w, p.y + p.h];
    const xs = p.pts.map(q => q[0]), ys = p.pts.map(q => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  function hit(p, x, y) {
    const px = x + 0.5, py = y + 0.5;
    if (p.s === 'e') { const dx = (px - p.x) / p.rx, dy = (py - p.y) / p.ry; return dx * dx + dy * dy <= 1; }
    if (p.s === 'r') return px >= p.x && px < p.x + p.w && py >= p.y && py < p.y + p.h;
    return inPoly(p.pts, px, py);
  }

  // def: { w, h, parts, pal:{key:[base,shade,light]}, line, detail(put) }
  function build(def) {
    const { w: W, h: H, parts } = def;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const lab = new Int16Array(W * H).fill(-1);
    const bb = parts.map(bounds);
    parts.forEach((p, i) => {
      const [x0, y0, x1, y1] = bb[i];
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1) + 1); y++)
        for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1) + 1); x++)
          if (hit(p, x, y)) lab[y * W + x] = i;
    });
    const pal = {};
    for (const k in def.pal) pal[k] = def.pal[k].map(rgb);
    const line = rgb(def.line || '#1c1024');
    const put = (x, y, col, a = 255) => {
      x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4, cc = Array.isArray(col) ? col : rgb(col);
      d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2]; d[i + 3] = a;
    };
    const L = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : lab[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = L(x, y); if (i < 0) continue;
      const p = parts[i], [base, shade, light] = pal[p.c];
      if (L(x - 1, y) < 0 || L(x + 1, y) < 0 || L(x, y - 1) < 0 || L(x, y + 1) < 0) { put(x, y, line); continue; }
      const [x0, y0, x1, y1] = bb[i];
      const nx = (x + 0.5 - (x0 + x1) / 2) / Math.max(1, (x1 - x0) / 2), ny = (y + 0.5 - (y0 + y1) / 2) / Math.max(1, (y1 - y0) / 2);
      const lit = -nx * 0.55 - ny * 0.75 + 0.1;
      let col = base;
      if (lit > 0.5) col = dither(x, y, Math.min(1, (lit - 0.5) * 3)) ? light : mix(base, light, 0.45);
      else if (lit < -0.25) col = dither(x, y, Math.min(1, (-0.25 - lit) * 2.5)) ? shade : mix(base, shade, 0.4);
      // 與後方部件的交界畫內線
      const behind = [L(x - 1, y), L(x + 1, y), L(x, y - 1), L(x, y + 1)].some(j => j >= 0 && j < i && parts[j].c !== p.c);
      if (behind) col = mix(shade, line, 0.45);
      put(x, y, col);
    }
    if (def.detail) def.detail(put);
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- 小怪（22×22）----------
  const SMALL = {
    mushroom: f => ({
      w: 22, h: 22, pal: { stem: ['#f2e2c4', '#c9a97a', '#fff8e8'], cap: ['#8a3fc9', '#4f1d82', '#c58cf0'], foot: ['#c9a97a', '#8a6a44', '#f2e2c4'] },
      parts: [E(7, 20, 2.5, 1.5, 'foot'), E(15, 20, 2.5, 1.5, 'foot'), R(6, 11, 10, 9, 'stem'), E(11, 9 - f, 10.5, 6.5, 'cap')],
      detail: put => {
        [[6, 6], [13, 4], [16, 8], [9, 9]].forEach(([x, y]) => { put(x, y - f, '#f4e6ff'); put(x + 1, y - f, '#f4e6ff'); put(x, y + 1 - f, '#f4e6ff'); });
        [[8, 14], [13, 14]].forEach(([x, y]) => { put(x, y, '#1c1024'); put(x, y + 1, '#1c1024'); put(x + 1, y + 1, '#1c1024'); });
        put(7, 13, '#1c1024'); put(8, 12, '#1c1024'); put(15, 13, '#1c1024'); put(14, 12, '#1c1024');
        put(10, 17, '#1c1024'); put(11, 17, '#1c1024'); put(12, 17, '#1c1024');
      },
    }),
    crab: f => ({
      w: 22, h: 22, pal: { shell: ['#3aa0d8', '#1f5c94', '#9fdcff'], claw: ['#55b8ee', '#1f5c94', '#c4ecff'], leg: ['#2a78b0', '#163f66', '#55b8ee'], eye: ['#ffffff', '#c8d8e8', '#ffffff'] },
      parts: [R(4, 16, 2, 4, 'leg'), R(8, 17, 2, 4, 'leg'), R(12, 17, 2, 4, 'leg'), R(16, 16, 2, 4, 'leg'),
        R(7, 6, 2, 6, 'leg'), R(13, 6, 2, 6, 'leg'), E(3, 10 - f, 3.5, 3.5, 'claw'), E(19, 10 - f, 3.5, 3.5, 'claw'),
        E(11, 14, 8.5, 5.5, 'shell'), E(8, 5, 2, 2, 'eye'), E(14, 5, 2, 2, 'eye')],
      detail: put => {
        put(8, 5, '#1c1024'); put(14, 5, '#1c1024');
        put(2, 7 - f, [0, 0, 0], 0); put(3, 7 - f, [0, 0, 0], 0); put(19, 7 - f, [0, 0, 0], 0); put(20, 7 - f, [0, 0, 0], 0);
        put(9, 16, '#1c1024'); put(10, 17, '#1c1024'); put(11, 17, '#1c1024'); put(12, 16, '#1c1024');
        const by = 3 - f * 2; put(18, by, '#c4ecff'); put(19, by - 1, '#c4ecff'); put(20, by, '#c4ecff'); put(19, by + 1, '#c4ecff');
      },
    }),
    imp: f => ({
      w: 22, h: 22, pal: { flame: ['#ff7a2a', '#c43a12', '#ffc04a'], core: ['#ffd84a', '#ff9a2a', '#fff6c0'], horn: ['#4a2418', '#24100a', '#7a4430'] },
      parts: [P([[6, 4], [7, 9], [9, 8]], 'horn'), P([[16, 4], [15, 9], [13, 8]], 'horn'),
        P([[4, 15], [6, 7 - f], [9, 10], [11, 2 + f], [13, 10], [16, 7 - f], [18, 15]], 'flame'), E(11, 15, 7, 6, 'flame'), E(11, 16, 3.5, 3.5, 'core')],
      detail: put => {
        [[8, 12], [13, 12]].forEach(([x, y]) => { put(x, y, '#1c1024'); put(x + 1, y, '#1c1024'); put(x, y + 1, '#1c1024'); put(x + 1, y + 1, '#1c1024'); put(x, y, '#fff'); });
        put(9, 17, '#1c1024'); put(10, 18, '#1c1024'); put(11, 18, '#1c1024'); put(12, 17, '#1c1024'); put(11, 19, '#fff');
      },
    }),
    bat: f => {
      const wl = [[8, 10], [1, 4 + f * 3], [2, 11], [4, 10], [5, 14], [8, 13]];
      return {
        w: 22, h: 22, pal: { body: ['#4a2a6a', '#24123a', '#7a54a0'], wing: ['#3a1f56', '#1c0c2e', '#5e3a84'], ear: ['#4a2a6a', '#24123a', '#7a54a0'] },
        parts: [P(wl, 'wing'), P(mirror(wl, 22), 'wing'), P([[8, 9], [8, 4], [11, 8]], 'ear'), P([[14, 9], [14, 4], [11, 8]], 'ear'), E(11, 12, 4.8, 4.8, 'body')],
        detail: put => {
          put(9, 11, '#ff3a4a'); put(10, 11, '#ff3a4a'); put(12, 11, '#ff3a4a'); put(13, 11, '#ff3a4a'); put(9, 11, '#ffc0c8');
          put(10, 14, '#fff'); put(12, 14, '#fff'); put(10, 15, '#fff'); put(12, 15, '#fff');
        },
      };
    },
    wisp: f => ({
      w: 22, h: 22, pal: { core: ['#fff2a0', '#e0b030', '#ffffff'], wing: ['#bfe6ff', '#6aa8d8', '#ffffff'] },
      parts: [E(5, 9 - f, 3.5, 2.5, 'wing'), E(17, 9 - f, 3.5, 2.5, 'wing'), E(11, 12, 5.5, 5.5, 'core')],
      line: '#8a6a10',
      detail: put => {
        put(9, 12, '#5a3a00'); put(9, 13, '#5a3a00'); put(13, 12, '#5a3a00'); put(13, 13, '#5a3a00');
        put(10, 15, '#e07a50'); put(12, 15, '#e07a50'); put(11, 16, '#5a3a00');
        [[11, 3], [3, 15], [19, 15], [11, 21]].forEach(([x, y]) => put(x, y + (f ? 1 : 0), '#fff6c0'));
      },
    }),
  };

  // ---------- 頭目（48×48）----------
  const BOSS = {
    golem: f => ({
      w: 48, h: 48, pal: { rock: ['#8a8f86', '#4e534c', '#c4c8bc'], dark: ['#6a6f66', '#3a3e38', '#9a9f94'], moss: ['#5aa040', '#2f6a24', '#9ad870'] },
      parts: [R(13, 36, 8, 11, 'dark'), R(27, 36, 8, 11, 'dark'), E(24, 28, 14, 11, 'rock'), E(7, 27 + f, 5.5, 10, 'dark'), E(41, 27 + f, 5.5, 10, 'dark'),
        E(7, 39 + f, 6, 5, 'rock'), E(41, 39 + f, 6, 5, 'rock'), E(24, 13, 9, 7.5, 'rock'), E(24, 7, 7, 2.5, 'moss')],
      detail: put => {
        for (let x = 19; x <= 29; x++) put(x, 13, x % 3 ? '#5afcff' : '#c8ffff');
        [[20, 25], [21, 26], [21, 27], [22, 28], [30, 30], [31, 31], [29, 32]].forEach(([x, y]) => put(x, y, '#3a3e38'));
        [[14, 19], [17, 18], [32, 19], [35, 21]].forEach(([x, y]) => { put(x, y, '#5aa040'); put(x + 1, y, '#9ad870'); });
      },
    }),
    kraken: f => {
      const parts = [];
      for (let k = 0; k < 6; k++) {
        const x0 = 6 + k * 7.2;
        for (let s = 0; s < 5; s++) parts.push(E(x0 + Math.sin(s * 0.9 + k + f * 1.4) * 2.2, 28 + s * 3.8, 3.2 - s * 0.4, 2.6, k % 2 ? 'tent' : 'tent2'));
      }
      parts.push(E(24, 18, 15, 14, 'head'), E(18, 21, 3.5, 4.5, 'eye'), E(30, 21, 3.5, 4.5, 'eye'));
      return {
        w: 48, h: 48, pal: { head: ['#5a4ab8', '#2c2070', '#9a8ef0'], tent: ['#4a3aa0', '#241a5a', '#8070d8'], tent2: ['#5644b0', '#2a1e66', '#8a7ae0'], eye: ['#ffd23f', '#c08a10', '#fff3b0'] },
        parts,
        detail: put => {
          for (let y = 19; y <= 23; y++) { put(18, y, '#1c1024'); put(30, y, '#1c1024'); }
          put(17, 19, '#fff'); put(29, 19, '#fff');
          [[14, 10], [20, 8], [30, 9], [34, 13], [26, 12]].forEach(([x, y]) => { put(x, y, '#9a8ef0'); put(x + 1, y, '#c8c0ff'); });
        },
      };
    },
    dragon: f => {
      const wing = [[20, 22], [3, 3 + f * 3], [7, 15], [2, 19], [9, 24], [5, 29], [17, 30]];
      return {
        w: 48, h: 48, pal: { body: ['#d8402a', '#801c14', '#ff8a5a'], wing: ['#a82a20', '#5a1010', '#e05a40'], belly: ['#ffcf5a', '#d0902a', '#fff2b0'], horn: ['#f2e2c4', '#a88a5a', '#ffffff'] },
        parts: [P(wing, 'wing'), P([[14, 40], [2, 44], [6, 38], [12, 34]], 'body'), E(22, 34, 12, 10, 'body'), E(22, 37, 7, 6, 'belly'),
          R(14, 41, 5, 6, 'body'), R(26, 41, 5, 6, 'body'), E(31, 22, 5, 9, 'body'), P([[30, 8], [27, 1], [33, 7]], 'horn'), P([[36, 8], [37, 1], [39, 9]], 'horn'),
          E(34, 13, 8, 6, 'body'), E(41, 16, 5, 3.5, 'body')],
        detail: put => {
          put(35, 11, '#ffe24a'); put(36, 11, '#ffe24a'); put(36, 12, '#1c1024'); put(35, 12, '#1c1024');
          put(44, 15, '#1c1024'); put(42, 18, '#fff'); put(40, 18, '#fff');
          for (let y = 32; y <= 41; y += 3) for (let x = 18; x <= 26; x += 4) put(x, y, '#d0902a');
          if (f) { put(46, 16, '#ffb02a'); put(47, 15, '#ffd84a'); put(47, 17, '#ff7a2a'); }
        },
      };
    },
    lich: f => ({
      w: 48, h: 48, pal: { robe: ['#3a2456', '#1a0e2c', '#5e4088'], hood: ['#2c1a44', '#140a22', '#4a3070'], bone: ['#e8e0c8', '#a89c7a', '#ffffff'], staff: ['#6b4421', '#3a2410', '#9b6a3a'], orb: ['#6aff9a', '#1aa050', '#d0ffe0'] },
      parts: [R(39, 9, 2.5, 38, 'staff'), P([[24, 10], [40, 47], [8, 47]], 'robe'), E(24, 15, 9, 9, 'hood'), E(24, 17, 5.5, 5.5, 'bone'),
        E(38, 27, 2.8, 2.8, 'bone'), E(10, 29, 2.8, 2.8, 'bone'), E(40, 7 - f, 4, 4, 'orb')],
      detail: put => {
        put(22, 16, '#6aff9a'); put(26, 16, '#6aff9a'); put(22, 17, '#1aa050'); put(26, 17, '#1aa050');
        for (let x = 22; x <= 26; x += 2) put(x, 20, '#1c1024');
        for (let x = 10; x <= 38; x += 4) { put(x, 46, [0, 0, 0], 0); put(x + 1, 46, [0, 0, 0], 0); put(x, 45, '#1a0e2c'); }
        [[16, 30], [30, 34], [22, 40]].forEach(([x, y]) => put(x, y + f, '#6aff9a'));
      },
    }),
    angel: f => {
      const wing = [[20, 18], [2, 8 + f * 2], [4, 16], [0, 22], [6, 26], [3, 32], [18, 30]];
      return {
        w: 48, h: 48, pal: { wing: ['#3a2a4a', '#160c20', '#6a5480'], robe: ['#e8e4f0', '#9a90b0', '#ffffff'], skin: ['#f4d8c8', '#c49a88', '#fff0e8'], hair: ['#d8d0e8', '#8a80a8', '#ffffff'], sword: ['#c8d0e0', '#6a7080', '#ffffff'], gold: ['#ffd23f', '#b5791f', '#fff1a0'] },
        parts: [P(wing, 'wing'), P(mirror(wing, 48), 'wing'), P([[24, 18], [35, 47], [13, 47]], 'robe'), R(38, 12, 2.5, 26, 'sword'), R(35, 37, 9, 2, 'gold'),
          E(24, 14, 6.5, 7, 'hair'), E(24, 15, 4.5, 5, 'skin')],
        detail: put => {
          const hy = 4 - f;
          for (let x = 18; x <= 30; x++) if (x < 22 || x > 25) { put(x, hy, '#ffd23f'); }
          put(17, hy + 1, '#b5791f'); put(31, hy + 1, '#b5791f');
          put(22, 15, '#a01a3a'); put(26, 15, '#a01a3a'); put(24, 18, '#c49a88');
          [[20, 30], [28, 34], [24, 40]].forEach(([x, y]) => put(x, y, '#b5791f'));
        },
      };
    },
  };

  function canvas(id, frame) {
    const key = id + '|' + (frame & 1); let c = cache.get(key); if (c) return c;
    const fn = SMALL[id] || BOSS[id]; if (!fn) return null;
    c = build(fn(frame & 1)); cache.set(key, c); return c;
  }
  const urls = new Map();
  function url(id, scale = 3) {
    const key = id + '|' + scale; let u = urls.get(key); if (u) return u;
    const src = canvas(id, 0); if (!src) return '';
    const c = document.createElement('canvas'); c.width = src.width * scale; c.height = src.height * scale;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, c.width, c.height);
    u = c.toDataURL(); urls.set(key, u); return u;
  }

  // 屬性圖示 7×7
  const EL = {
    fire: { rows: ['...r...', '..rr...', '.rrOr..', '.rOYOr.', 'rOYYYOr', 'rOYYYOr', '.rOOOr.'], pal: { r: '#c43a12', O: '#ff7a2a', Y: '#ffe24a' } },
    water: { rows: ['...b...', '..bBb..', '..bBb..', '.bBBBb.', 'bBWBBBb', 'bBBBBBb', '.bbbbb.'], pal: { b: '#1f5c94', B: '#4fa8ff', W: '#ffffff' } },
    grass: { rows: ['.....gg', '...gGGg', '..gGGg.', '.gGGg..', '.gGg...', 'g.g....', 'g......'], pal: { g: '#2f6a24', G: '#7ad050' } },
    light: { rows: ['y..y..y', '.yYYYy.', '.YWWWY.', 'yYWWWYy', '.YWWWY.', '.yYYYy.', 'y..y..y'], pal: { y: '#d0a020', Y: '#ffd23f', W: '#fff6c0' } },
    dark: { rows: ['..ppp..', '.pPPp..', 'pPPp...', 'pPPp...', 'pPPp...', '.pPPp..', '..ppp..'], pal: { p: '#24123a', P: '#8a5ac8' } },
  };
  const elUrls = new Map();
  function elementURL(el, scale = 3) {
    const def = EL[el]; if (!def) return '';
    const key = el + scale; if (elUrls.has(key)) return elUrls.get(key);
    const c = document.createElement('canvas'); c.width = 7 * scale; c.height = 7 * scale; const g = c.getContext('2d');
    def.rows.forEach((r, y) => [...r].forEach((ch, x) => { if (def.pal[ch]) { g.fillStyle = def.pal[ch]; g.fillRect(x * scale, y * scale, scale, scale); } }));
    const u = c.toDataURL(); elUrls.set(key, u); return u;
  }

  window.Monsters = { canvas, url, elementURL, isBoss: id => !!BOSS[id] };
})();
