// render.js — HD-2D 分層渲染：牧場、史萊姆動畫、粒子、飄字、金色訪客、地區、鏡頭（ccline-27）
// 每幀輸出 7 張 320×180 圖層（sky／far／mid／ground／actors／fg／ui）＋光源清單：
//   有 window.HD2D 且 init 成功 → 交給 WebGL 合成器（景深、泛光、光源、霧、調色）
//   否則 → 2D fallback 直接疊到 #stage（含簡易光暈與暗角）
// 遠征戰鬥由 battle.js 透過 Render.setMode(fn) 接管；fn(L, dt, t) 畫進同一組圖層，並可回傳場景參數。
(function () {
  'use strict';
  const W = 320, H = 180;
  // y1 ≈ 畫面 87%：再往下會被前景的模糊草葉蓋住，看起來像柔焦
  const FIELD = { x0: 14, x1: W - 14, y0: 110, y1: 157 };
  const S = () => window.Sprites;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ---------- 圖層 ----------
  // 陣列順序＝疊放順序（由後往前）。地面不透明，所以道具（mid）要疊在地面之上
  const LAYER_NAMES = ['sky', 'far', 'ground', 'mid', 'actors', 'fg', 'ui'];
  // depth：0＝最遠、1＝最近（給合成器算景深）；parallax：鏡頭位移倍率。
  // 地面、道具、角色同一個 parallax，影子和道具才不會跟角色錯位
  const LAYER_META = {
    sky: { depth: 0, parallax: 0.05 }, far: { depth: 0.2, parallax: 0.2 }, ground: { depth: 0.6, parallax: 0.7 },
    mid: { depth: 0.6, parallax: 0.7 }, actors: { depth: 0.65, parallax: 0.7 }, fg: { depth: 1, parallax: 1.3 }, ui: { depth: -1, parallax: 0 },
  };
  const L = {};
  for (const n of LAYER_NAMES) { const c = mk(W, H); const g = c.getContext('2d'); g.imageSmoothingEnabled = false; L[n] = { c, g }; }
  let g = L.actors.g; // 目前繪製中的圖層

  let canvas, out = null, useGL = false, quality = 'high', last = 0, t = 0;
  const actors = new Map();
  const particles = [];
  const floats = [];
  const clouds = [];
  let shake = 0, mode = null, whiteout = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const typeOf = id => Game.config.slimeTypes[id];
  const msCount = lv => Game.config.milestones ? Game.config.milestones.filter(m => lv >= m.level).length : 0;

  // ---------- 地區光影（依 DESIGN-v2 §7.3）----------
  const ZONE_LIGHT = {
    meadow: { ambient: '#3a4a7a', rim: { dir: 'l', col: [255, 242, 208] }, godRays: { x: 40, y: -20, strength: 0.28 }, fog: { color: '#e8eef8', density: 0.12, horizon: 92 }, focusDepth: 0.65, tiltShift: 0.25 },
    beach: { ambient: '#4a2a5a', rim: { dir: 'r', col: [255, 176, 96] }, godRays: { x: 230, y: 70, strength: 0.3 }, fog: { color: '#ffb080', density: 0.12, horizon: 90 }, focusDepth: 0.65, tiltShift: 0.25 },
    volcano: { ambient: '#1a0808', rim: { dir: 'r', col: [255, 110, 50] }, godRays: null, fog: { color: '#3a1a1a', density: 0.3, horizon: 150 }, focusDepth: 0.65, tiltShift: 0.3 },
    snow: { ambient: '#3a5a8a', rim: { dir: 't', col: [232, 244, 255] }, godRays: null, fog: { color: '#eef6ff', density: 0.18, horizon: 96 }, focusDepth: 0.65, tiltShift: 0.25 },
    sky: { ambient: '#5a7ab8', rim: { dir: 'r', col: [255, 251, 232] }, godRays: { x: 220, y: -30, strength: 0.35 }, fog: { color: '#dfe8ff', density: 0.05, horizon: 94 }, focusDepth: 0.65, tiltShift: 0.2 },
  };
  const RARITY_GLOW = { SR: '#c08aff', SSR: '#ffd23f' };
  // UR：彩虹循環色（hsl → #rrggbb）
  function rainbow(t, off = 0) {
    const h = ((t * 60 + off) % 360 + 360) % 360, f = n => { const k = (n + h / 30) % 12, a = 0.9 * Math.min(0.62, 1 - 0.62); const v = 0.62 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(v * 255).toString(16).padStart(2, '0'); };
    return '#' + f(0) + f(8) + f(4);
  }

  // 站位：在帶狀區內挑「離其他史萊姆最遠」的位置（最小間距約一個身寬），體型大的偏後排（y 較小）
  function spreadSpot(type, selfUid) {
    const size = window.ModernSprites ? ModernSprites.slimeSizeLogical(type) : S().slimeSize(type.tier || 1).w;
    const big = Math.min(1, Math.max(0, (size - 14) / 10));
    const y0 = FIELD.y0, y1 = FIELD.y1 - big * (FIELD.y1 - FIELD.y0) * 0.6;
    let best = null, bestD = -1;
    for (let i = 0; i < 14; i++) {
      const x = rnd(FIELD.x0 + 10, FIELD.x1 - 10), y = rnd(y0, y1);
      let d = 1e9;
      for (const o of actors.values()) if (o.uid !== selfUid) d = Math.min(d, Math.hypot(o.x - x, (o.y - y) * 1.6));
      if (d > bestD) { bestD = d; best = { x, y }; }
      if (d > size * 1.3) break;
    }
    return { pos: best, yMax: y1, size };
  }
  function newActor(sl, spawnFx) {
    const sp = spreadSpot(typeOf(sl.type) || {}, sl.uid);
    const a = {
      uid: sl.uid, type: sl.type, level: sl.level, yMax: sp.yMax, size: sp.size,
      x: sp.pos.x, y: sp.pos.y,
      tx: 0, ty: 0, hop: -1, hopDur: 0.55, wait: rnd(0.2, 2), sx: 0, sy: 0,
      blink: rnd(1, 4), blinkT: 0, jumpBoost: 0, happy: 0, phase: rnd(0, 6.28),
    };
    if (spawnFx) puff(a.x, a.y - 6, 14, typeOf(sl.type).palette.light);
    return a;
  }
  function syncActors() {
    const live = new Set();
    for (const sl of Game.state.slimes) {
      live.add(sl.uid);
      let a = actors.get(sl.uid);
      if (!a) actors.set(sl.uid, a = newActor(sl, t > 0.5));
      a.type = sl.type; a.level = sl.level;
    }
    for (const uid of actors.keys()) if (!live.has(uid)) actors.delete(uid);
  }
  function updateActor(a, dt) {
    a.blink -= dt;
    if (a.blink < 0) { a.blinkT = 0.14; a.blink = rnd(2, 5); }
    if (a.blinkT > 0) a.blinkT -= dt;
    if (a.happy > 0) a.happy -= dt;
    if (a.hop < 0) {
      a.wait -= dt;
      if (a.wait <= 0) {
        a.sx = a.x; a.sy = a.y;
        let best = null, bestD = -1;
        for (let i = 0; i < 6; i++) {
          const ang = Math.random() * Math.PI * 2, dist = rnd(10, 28);
          const tx = Math.max(FIELD.x0, Math.min(FIELD.x1, a.x + Math.cos(ang) * dist)), ty = Math.max(FIELD.y0, Math.min(a.yMax || FIELD.y1, a.y + Math.sin(ang) * dist * 0.5));
          let d = 1e9; for (const o of actors.values()) if (o !== a) d = Math.min(d, Math.hypot(o.x - tx, (o.y - ty) * 1.6));
          if (d > bestD) { bestD = d; best = [tx, ty]; }
          if (d > (a.size || 16) * 1.2) break;
        }
        [a.tx, a.ty] = best;
        a.hop = 0; a.hopDur = rnd(0.5, 0.75);
      }
    } else {
      a.hop += dt / a.hopDur;
      const p = Math.min(1, a.hop);
      const e = p < 0.15 ? 0 : Math.min(1, (p - 0.15) / 0.7); // 預備動作時不移動
      a.x = a.sx + (a.tx - a.sx) * e; a.y = a.sy + (a.ty - a.sy) * e;
      if (a.hop >= 1) { a.hop = -1; a.wait = rnd(0.6, 2.8); dust(a.x, a.y); }
    }
    if (a.jumpBoost > 0) a.jumpBoost = Math.max(0, a.jumpBoost - dt);
  }

  // 柔和橢圓影子（畫在 ground 層）
  function softShadow(x, y, w, lift) {
    const gg = L.ground.g, rw = Math.max(3, w * (0.55 - lift / 70)), a = 0.32 * (1 - lift / 40);
    gg.save(); gg.globalAlpha = Math.max(0.08, a); gg.fillStyle = '#1a1424';
    gg.beginPath(); gg.ellipse(x, y + 0.5, rw, rw * 0.32, 0, 0, Math.PI * 2); gg.fill();
    gg.globalAlpha *= 0.5; gg.beginPath(); gg.ellipse(x, y + 0.5, rw * 1.3, rw * 0.42, 0, 0, Math.PI * 2); gg.fill();
    gg.restore();
  }
  // 共用：畫一隻史萊姆（牧場與戰鬥都用）。影子畫在 ground 層、本體畫在目前圖層
  function drawSlime(type, x, y, frame, blink, ms, lift, sc = 1, rim = null) {
    const spr = S().slimeCanvas(type, frame, blink, ms, rim);
    const w = (S().slimeSize(type.tier).w + ms) * sc;
    softShadow(x, y, w, lift);
    if (type.rarity === 'UR') urAura(x, y, w, lift);
    if (type.rarity === 'LR') lrAura(x, y, w, lift);
    const sw2 = Math.round(spr.width * sc), sh2 = Math.round(spr.height * sc);
    const dx = Math.round(x - sw2 / 2), dy = Math.round(y - sh2 + 3 * sc - lift);
    g.drawImage(spr, dx, dy, sw2, sh2);
    if ((type.rarity === 'SR' || type.rarity === 'SSR') && Math.random() < (type.rarity === 'SSR' ? 0.25 : 0.1))
      sparkle(dx + rnd(2, sw2 - 2), dy + rnd((S().ACC_TOP - 4) * sc, sh2 - 4), type.rarity === 'SSR' ? '#fff3a0' : '#e6c8ff');
    // 時空史萊姆：繞著錶盤轉動的時針與分針
    if (type.id === 'chrono') {
      const bh = (S().slimeSize(type.tier).w + ms + 4) * 0.78 * sc, ccx = x, ccy = y - bh * 0.5 - lift;
      const hand = (len, ang, col) => {
        g.fillStyle = col;
        for (let i = 1; i <= len; i++) g.fillRect(Math.round(ccx + Math.cos(ang) * i), Math.round(ccy + Math.sin(ang) * i * 0.8), 1, 1);
      };
      hand(Math.round(w * 0.34), t * 1.6 - Math.PI / 2, '#fff1a0');
      hand(Math.round(w * 0.22), t * 0.2 - Math.PI / 2, '#ffd23f');
    }
    if (type.tier >= 6) {
      const n = type.tier - 4, r = w / 2 + 4;
      g.fillStyle = type.palette.light;
      for (let i = 0; i < n; i++) {
        const ang = t * 2 + i * Math.PI * 2 / n;
        g.fillRect(Math.round(x + Math.cos(ang) * r), Math.round(y - 8 - lift + Math.sin(ang) * r * 0.4), 1, 1);
      }
    }
    return { dx, dy, spr };
  }
  // UR 專屬：地面彩虹光環（ground 層）＋往上流動的彩虹光點
  function urAura(x, y, w, lift) {
    const gg = L.ground.g, rw = w * 0.75;
    gg.save(); gg.lineWidth = 1;
    for (let i = 0; i < 3; i++) { gg.globalAlpha = 0.55 - i * 0.15; gg.strokeStyle = rainbow(t, i * 40); gg.beginPath(); gg.ellipse(x, y + 0.5, rw + i * 2, (rw + i * 2) * 0.32, 0, 0, Math.PI * 2); gg.stroke(); }
    gg.restore();
    if (Math.random() < 0.5) particles.push({ k: 'spark', x: x + rnd(-w / 2, w / 2), y: y - rnd(0, 6) - lift, vx: 0, vy: -rnd(10, 22), life: 0.9, max: 0.9, col: rainbow(t, rnd(0, 360)) });
  }
  // LR 專屬：白金神聖光柱（畫在角色層、本體之前）＋飄落光羽＋地面白金光環
  function lrAura(x, y, w, lift) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    // 光柱畫在 ground 層（角色後方），半透明，不蓋住本體
    const gg = L.ground.g, bw = Math.round(w * 0.9), top = 0, bottom = Math.round(y + 1);
    const gr = gg.createLinearGradient(0, top, 0, bottom);
    gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(0.65, `rgba(255,236,190,${0.08 + 0.05 * pulse})`); gr.addColorStop(1, `rgba(255,240,210,${0.16 + 0.06 * pulse})`);
    gg.fillStyle = gr; gg.fillRect(Math.round(x - bw / 2), top, bw, bottom - top);
    gg.fillStyle = `rgba(255,248,230,${0.1 + 0.06 * pulse})`; gg.fillRect(Math.round(x - 1), top, 2, bottom - top);
    gg.save(); gg.strokeStyle = '#fff4d0'; gg.globalAlpha = 0.5 + 0.3 * pulse;
    gg.beginPath(); gg.ellipse(x, y + 0.5, w * 0.8, w * 0.26, 0, 0, Math.PI * 2); gg.stroke(); gg.restore();
    if (Math.random() < 0.18) particles.push({ k: 'mote', x: x + rnd(-w, w), y: y - rnd(40, 90), vx: rnd(-4, 4), vy: rnd(6, 12), life: 2.4, max: 2.4, col: Math.random() < 0.5 ? '#ffffff' : '#ffe9a8', r: 2, ph: rnd(0, 6.28), sway: 2 });
  }
  // 動畫：待機 4 幀呼吸、移動 4 幀（預備→起跳→滯空→落地）
  function actorPose(a) {
    let frame, lift = 0;
    if (a.hop >= 0) {
      const p = Math.min(1, a.hop);
      if (p < 0.15) frame = 1;
      else if (p < 0.35) { frame = 2; lift = (p - 0.15) / 0.2 * 6; }
      else if (p < 0.85) { frame = 5; lift = 6 + Math.sin((p - 0.35) / 0.5 * Math.PI) * 4; }
      else { frame = p < 0.93 ? 6 : 1; lift = 0; }
    } else {
      const k = (t * 2.2 + a.phase) % 4 | 0;
      frame = [0, 3, 4, 3][k];
    }
    if (a.jumpBoost > 0) { lift += Math.sin(a.jumpBoost / 0.4 * Math.PI) * 8; frame = 2; }
    return { frame, lift };
  }
  function drawActor(a, rim) {
    const type = typeOf(a.type); if (!type) return;
    const { frame, lift } = actorPose(a);
    const eyes = a.happy > 0 || a.jumpBoost > 0 ? 2 : a.blinkT > 0 ? 1 : 0;
    const { dy } = drawSlime(type, a.x, a.y, frame, eyes, msCount(a.level), lift, 1, rim);
    a.top = dy + S().ACC_TOP - 2;
  }

  // ---------- 金色訪客 ----------
  const VISITOR_TYPE = { id: '__visitor', tier: 3, rarity: 'SSR', palette: { body: '#ffd23f', shade: '#c08a10', light: '#fff3b0', eye: '#4a2a00' } };
  let visitorPos = null;
  function drawVisitor(rim) {
    visitorPos = null;
    if (!Game.visitorActive || !Game.visitorActive()) return;
    const stay = (Game.config.visitorStay || 10) * 1000;
    const p = 1 - (Game.visitor.activeUntil - Date.now()) / stay;
    const x = -16 + (W + 32) * Math.max(0, Math.min(1, p)), hopT = (t * 3) % 1;
    const lift = Math.sin(hopT * Math.PI) * 10, y = 124 + Math.sin(p * 9) * 6;
    drawSlime(VISITOR_TYPE, x, y, lift > 2 ? 5 : 6, 2, 4, lift, 1, rim);
    if (Math.random() < 0.6) sparkle(x - 8 + rnd(-3, 3), y - 6 - lift + rnd(-4, 4), '#fff3a0');
    visitorPos = { x, y: y - 8 - lift };
  }
  function catchVisitor() {
    const res = Game.actions.catchVisitor(); if (!res) return;
    const { x, y } = visitorPos;
    puff(x, y, 24, '#fff3a0'); shake = 0.2;
    for (let i = 0; i < 14; i++) sparkle(x + rnd(-16, 16), y + rnd(-12, 8), '#ffffff');
    if (res.kind === 'gold') { coinBurst(x, y, 30); floatText(x, y - 14, '+' + Game.fmt(res.amount), '#ffd23f', 2); }
    else if (res.kind === 'gems') { gemBurst(x, y, 12); floatText(x, y - 14, '+' + res.amount, '#ff9ae0', 2); }
    else if (res.kind === 'frenzy') floatText(x, y - 14, 'x' + res.amount, '#ff7aa8', 3);
  }

  // ---------- 粒子 ----------
  function puff(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, sp = rnd(10, 40);
      particles.push({ k: 'puff', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6 - 10, life: rnd(0.4, 0.8), max: 0.8, col: col || '#ffffff', r: rnd(1, 3) });
    }
  }
  function dust(x, y) {
    for (let i = 0; i < 3; i++) particles.push({ k: 'puff', x: x + rnd(-5, 5), y, vx: rnd(-12, 12), vy: rnd(-6, -2), life: 0.35, max: 0.35, col: '#e8f5c8', r: 1 });
  }
  function sparkle(x, y, col) { particles.push({ k: 'spark', x, y, vx: 0, vy: -6, life: 0.6, max: 0.6, col }); }
  function coinBurst(x, y, n) {
    for (let i = 0; i < n; i++) particles.push({ k: 'coin', x, y, vx: rnd(-50, 50), vy: rnd(-90, -50), life: rnd(0.6, 0.9), max: 0.9, g: 260, floor: y + rnd(4, 14) });
  }
  function gemBurst(x, y, n) {
    for (let i = 0; i < n; i++) particles.push({ k: 'gem', x, y, vx: rnd(-70, 70), vy: rnd(-110, -40), life: rnd(0.8, 1.2), max: 1.2, g: 220, floor: H - 4 });
  }
  const textCache = new Map();
  function textImg(str, col, sc = 1) {
    const key = str + '|' + col + '|' + sc; let c = textCache.get(key); if (c) return c;
    c = mk([...str].length * 4 * sc + 3, 5 * sc + 3);
    S().drawText(c.getContext('2d'), str, c.width / 2, 1, col, '#2a1d14', sc);
    if (textCache.size > 300) textCache.clear();
    textCache.set(key, c); return c;
  }
  function floatText(x, y, str, col, sc = 1) {
    const life = sc > 1 ? 1.2 + sc * 0.15 : 1.1;
    floats.push({ x, y, str, col: col || '#fff1a0', sc, life, max: life });
    if (floats.length > 40) floats.shift();
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (p.g) p.vy += p.g * dt;
      if (p.sway) p.vx += Math.sin(t * p.sway + p.ph) * 6 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.floor && p.y > p.floor) { p.y = p.floor; p.vy *= -0.4; p.vx *= 0.6; }
      if (p.k === 'puff') { p.vx *= 0.92; p.vy *= 0.92; }
    }
    if (particles.length > 500) particles.splice(0, particles.length - 500);
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.life -= dt; f.y -= 20 / f.max * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
  }
  // 粒子畫在 actors 層（k='fg' 的畫在前景層）；飄字畫在 ui 層
  function drawParticles() {
    const coin = S().icon('coin'), gem = S().icon('gem');
    for (const p of particles) {
      const gg = p.layer ? L[p.layer].g : L.actors.g;
      const a = p.life / p.max;
      if (p.k === 'puff') {
        gg.globalAlpha = Math.min(1, a * 1.4) * (p.alpha || 1); gg.fillStyle = p.col;
        const r = Math.max(1, Math.round(p.r * (0.5 + a)));
        gg.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), r, r);
      } else if (p.k === 'spark') {
        gg.globalAlpha = a; gg.fillStyle = p.col;
        const x = Math.round(p.x), y = Math.round(p.y);
        gg.fillRect(x, y, 1, 1);
        if (a > 0.4) { gg.fillRect(x - 1, y, 3, 1); gg.fillRect(x, y - 1, 1, 3); }
      } else if (p.k === 'mote') {
        // 浮塵／螢火蟲／雪花：柔和地明滅
        gg.globalAlpha = Math.min(1, a * 3, (1 - a) * 3) * (0.5 + 0.5 * Math.sin(t * 3 + p.ph)) * (p.alpha || 1);
        gg.fillStyle = p.col; gg.fillRect(Math.round(p.x), Math.round(p.y), p.r, p.r);
      } else if (p.k === 'coin' || p.k === 'gem') {
        gg.globalAlpha = Math.min(1, a * 2);
        const img = p.k === 'coin' ? coin : gem;
        const sx = Math.abs(Math.cos((p.max - p.life) * 12)) * img.width;
        gg.drawImage(img, Math.round(p.x - sx / 2), Math.round(p.y - img.height / 2), Math.max(1, Math.round(sx)), img.height);
      }
      gg.globalAlpha = 1;
    }
    const ug = L.ui.g;
    for (const f of floats) {
      ug.globalAlpha = Math.min(1, f.life / f.max * 2);
      const img = textImg(f.str, f.col, f.sc);
      const pop = f.sc > 1 ? Math.max(1, 1.4 - (f.max - f.life) * 3) : 1;
      const w = Math.round(img.width * pop), h = Math.round(img.height * pop);
      ug.drawImage(img, Math.round(f.x - w / 2), Math.round(f.y), w, h);
    }
    ug.globalAlpha = 1;
  }

  // ---------- 地區：環境粒子、前景物件、動態元素 ----------
  let curZone = null, zoneFadeUntil = 0, boat = -40;
  const zoneNow = () => S().zoneOf(Game.zone ? Game.zone().id : Game.state.zone);
  function zoneBanner(z, fresh) {
    const wrap = document.getElementById('stageWrap'); if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'zone-banner';
    el.innerHTML = `<small>${fresh ? '新地區！' : '前往'}</small><b>${S().ZONE_NAMES[z] || ''}</b>`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }
  const AMBIENT = {
    meadow: [{ col: '#fff6c8', rate: 0.25, y: [60, 170], vy: [-3, 1], vx: [2, 6], r: 1 }, { col: '#ffe080', rate: 0.05, y: [110, 170], vy: [-6, -2], vx: [-4, 4], r: 1, firefly: 1 }],
    beach: [{ col: '#ffe0b0', rate: 0.25, y: [40, 120], vy: [-2, 1], vx: [3, 8], r: 1 }],
    volcano: [{ col: '#ff8a3a', rate: 0.6, y: [170, 182], vy: [-30, -12], vx: [-4, 4], r: 1, ember: 1 }, { col: '#ffd060', rate: 0.15, y: [150, 182], vy: [-20, -8], vx: [-3, 3], r: 1, ember: 1 }],
    snow: [{ col: '#ffffff', rate: 1.4, y: [-4, 0], vy: [10, 20], vx: [-3, 3], r: 1, snow: 1 }, { col: '#ffffff', rate: 0.15, y: [-6, 0], vy: [24, 36], vx: [-4, 4], r: 3, snow: 1, layer: 'fg' }],
    sky: [{ col: '#ffffff', rate: 0.35, y: [20, 170], vy: [-4, -1], vx: [-2, 2], r: 1 }, { col: '#fff4c0', rate: 0.08, y: [40, 140], vy: [3, 8], vx: [-6, -2], r: 2, feather: 1 }],
  };
  function spawnAmbient(z, dt) {
    if (quality === 'low') return;
    for (const a of AMBIENT[z] || []) {
      let n = a.rate * dt * 30; if (quality === 'mid') n *= 0.5;
      while (n > 0) {
        if (Math.random() < Math.min(1, n)) {
          const life = a.snow ? 12 : a.ember ? rnd(3, 6) : rnd(4, 8);
          particles.push({ k: a.ember ? 'spark' : 'mote', x: rnd(-10, W + 10), y: rnd(a.y[0], a.y[1]), vx: rnd(a.vx[0], a.vx[1]), vy: rnd(a.vy[0], a.vy[1]),
            life, max: life, col: a.col, r: a.r, ph: rnd(0, 6.28), sway: a.snow || a.feather ? 1.5 : a.firefly ? 2.5 : 0, layer: a.layer, alpha: a.layer === 'fg' ? 0.8 : 1 });
        }
        n -= 1;
      }
    }
  }
  // 前景大型物件（HD-2D 招牌構圖：畫面下緣與兩側，交給合成器強模糊）
  function drawForeground(z) {
    const gg = L.fg.g;
    const blade = (x0, y0, h, lean, col, colD) => {
      const sway = Math.sin(t * 1.3 + x0 * 0.1) * 2;
      for (let i = 0; i < h; i++) {
        const p = i / h, x = Math.round(x0 + (lean + sway) * p * p), w = Math.max(1, Math.round((1 - p) * 4));
        gg.fillStyle = i % 5 === 0 ? colD : col; gg.fillRect(x - (w >> 1), y0 - i, w, 1);
      }
    };
    if (z === 'meadow') {
      for (let i = 0; i < 14; i++) blade(4 + i * 5, H + 2, 26 + (i * 7) % 18, -6 + (i % 3) * 5, '#3e8a36', '#2a6a28');
      for (let i = 0; i < 12; i++) blade(W - 6 - i * 5, H + 2, 22 + (i * 5) % 20, 4 - (i % 3) * 4, '#4a9a3e', '#2a6a28');
      // 右上角的樹枝與葉子
      gg.fillStyle = '#3a2a1a'; gg.fillRect(W - 60, 0, 60, 4); gg.fillRect(W - 40, 4, 3, 8);
      for (let i = 0; i < 9; i++) { const lx = W - 64 + i * 8, ly = 4 + Math.sin(t * 1.1 + i) * 1.5 + (i % 2) * 5; gg.fillStyle = i % 2 ? '#4caf3f' : '#2f7a2c'; gg.beginPath(); gg.ellipse(lx, ly, 6, 3, 0.4, 0, 7); gg.fill(); }
    } else if (z === 'beach') {
      // 左上椰葉
      for (let i = 0; i < 7; i++) {
        const ang = 0.2 + i * 0.22 + Math.sin(t * 0.9) * 0.03, len = 60 - i * 3;
        for (let k = 0; k < len; k += 2) { const x = Math.cos(ang) * k, y = Math.sin(ang) * k * 0.6 + (k * k) / 140; gg.fillStyle = k % 6 ? '#2f7a2c' : '#1e5a20'; gg.fillRect(Math.round(x), Math.round(y - 4), 3, 3 + (k % 4 === 0 ? 2 : 0)); }
      }
      for (let i = 0; i < 8; i++) blade(W - 8 - i * 6, H + 2, 18 + (i * 5) % 12, 5, '#c8a060', '#9a7840');
    } else if (z === 'volcano') {
      gg.fillStyle = '#140a0e';
      gg.beginPath(); gg.moveTo(0, H); gg.lineTo(0, H - 30); gg.lineTo(18, H - 40); gg.lineTo(40, H - 22); gg.lineTo(56, H); gg.fill();
      gg.beginPath(); gg.moveTo(W, H); gg.lineTo(W, H - 36); gg.lineTo(W - 24, H - 28); gg.lineTo(W - 46, H); gg.fill();
      gg.fillStyle = '#ff6a20'; gg.fillRect(20, H - 36, 2, 1); gg.fillRect(W - 20, H - 30, 2, 1);
    } else if (z === 'snow') {
      gg.fillStyle = '#ffffff';
      gg.beginPath(); gg.ellipse(24, H + 6, 46, 18, 0, 0, 7); gg.fill(); gg.beginPath(); gg.ellipse(W - 20, H + 8, 50, 20, 0, 0, 7); gg.fill();
      gg.fillStyle = '#d8e6f8'; gg.beginPath(); gg.ellipse(30, H + 10, 40, 10, 0, 0, 7); gg.fill();
      gg.fillStyle = '#244a3c'; for (let i = 0; i < 6; i++) gg.fillRect(0, 6 + i * 5, 34 - i * 5, 3);
      gg.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) gg.fillRect(0, 5 + i * 5, 30 - i * 5, 1);
    } else if (z === 'sky') {
      gg.fillStyle = '#ffffff';
      for (const [cx, cy, r] of [[10, H, 26], [40, H + 6, 22], [W - 12, H, 28], [W - 44, H + 8, 20]]) { gg.beginPath(); gg.arc(cx + Math.sin(t * 0.5 + cx) * 2, cy, r, 0, 7); gg.fill(); }
    }
  }
  function drawZoneDynamic(z, dt) {
    const horizon = H / 2, fg = L.far.g, gd = L.ground.g;
    if (z !== 'volcano') for (const c of clouds) {
      c.x += c.v * dt; const img = S().cloud(c.i);
      if (c.x > W + 4) { c.x = -img.width - rnd(0, 60); c.y = rnd(6, z === 'beach' ? 40 : 60); }
      L.sky.g.drawImage(img, Math.round(c.x), Math.round(c.y));
    }
    if (z === 'beach') {
      boat += dt * 4; if (boat > W + 30) boat = -40;
      const bx = Math.round(boat), by = horizon - 3;
      fg.fillStyle = '#3a2a4a'; fg.fillRect(bx, by, 12, 2); fg.fillRect(bx + 2, by + 2, 8, 1);
      fg.fillStyle = '#fff0e0'; for (let i = 0; i < 7; i++) fg.fillRect(bx + 5 - Math.floor(i * 0.6), by - 1 - i, 1 + Math.floor(i * 0.6), 1);
      fg.fillStyle = '#3a2a4a'; fg.fillRect(bx + 5, by - 8, 1, 8);
      const shore = horizon + 16;
      for (let x = 0; x < W; x += 2) {
        const wv = Math.sin(x * 0.08 + t * 1.6) * 1.5 + Math.sin(x * 0.03 - t) * 1;
        gd.fillStyle = 'rgba(255,255,255,0.85)'; gd.fillRect(x, Math.round(shore - 1 + wv), 2, 1);
        if ((x + Math.floor(t * 8)) % 14 < 3) { gd.fillStyle = 'rgba(200,230,255,0.6)'; gd.fillRect(x, Math.round(shore + 1 + wv), 2, 1); }
      }
      for (let x = 0; x < W; x += 9) if ((x * 7 + Math.floor(t * 3)) % 11 < 2) { fg.fillStyle = '#c8d8ff'; fg.fillRect(x, horizon + 2 + (x % 12), 3, 1); }
    } else if (z === 'volcano') {
      if (Math.random() < 0.5) particles.push({ k: 'spark', x: 236 + rnd(-8, 8), y: 26, vx: rnd(-6, 6), vy: rnd(-24, -10), life: 1.2, max: 1.2, col: Math.random() < 0.5 ? '#ff7a2a' : '#ffd84a', layer: 'far' });
      if (Math.random() < 0.08) particles.push({ k: 'puff', x: 236 + rnd(-4, 4), y: 22, vx: rnd(2, 8), vy: rnd(-8, -4), life: 2.5, max: 2.5, col: '#5a4a50', r: 4, layer: 'far' });
    }
  }
  function zoneLights(z) {
    const lights = [];
    if (z === 'volcano') {
      lights.push({ x: 236, y: 26, radius: 70, color: '#ff5a20', intensity: 1.4, flicker: 0.5, layer: 'far' });
      for (const [x, y] of [[60, 150], [150, 132], [250, 160], [110, 170]]) lights.push({ x, y, radius: 34, color: '#ff6a20', intensity: 0.8, flicker: 0.6, layer: 'ground' });
      lights.push({ x: 60, y: -10, radius: 160, color: '#6a8aff', intensity: 0.35, flicker: 0 });
    } else if (z === 'beach') {
      lights.push({ x: 218, y: 72, radius: 110, color: '#ffb060', intensity: 0.5, flicker: 0, layer: 'sky' });
    } else if (z === 'meadow') {
      lights.push({ x: 262, y: 28, radius: 60, color: '#fff2d0', intensity: 0.6, flicker: 0, layer: 'sky' });
    } else if (z === 'sky') {
      lights.push({ x: 272, y: 25, radius: 80, color: '#fffbe8', intensity: 0.45, flicker: 0, layer: 'sky' });
    }
    return lights;
  }

  // ---------- 合成 ----------
  let vignette = null;
  function fallbackComposite(scene) {
    const o = out; if (!o) return;
    const cam = scene.camera, z = cam.zoom || 1;
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, W, H);
    for (const n of LAYER_NAMES) {
      if (n === 'ui') continue;
      const src = scene.layers[n]; if (!src) continue;
      const m = LAYER_META[n];
      o.setTransform(z, 0, 0, z, W / 2 * (1 - z) - Math.round(cam.x * m.parallax) * z, H / 2 * (1 - z) - Math.round(cam.y * m.parallax) * z);
      o.drawImage(src, 0, 0);
    }
    o.setTransform(1, 0, 0, 1, 0, 0);
    if (quality !== 'low') {
      // 簡易光暈（加亮混合）＋暗角
      o.globalCompositeOperation = 'lighter';
      for (const l of scene.lights) {
        const f = 1 - (l.flicker || 0) * (0.5 + 0.5 * Math.sin(t * 13 + l.x));
        const gr = o.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
        gr.addColorStop(0, l.color + '55'); gr.addColorStop(1, l.color + '00');
        o.globalAlpha = Math.min(1, 0.6 * l.intensity * f); o.fillStyle = gr; o.fillRect(l.x - l.radius, l.y - l.radius, l.radius * 2, l.radius * 2);
      }
      o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
      if (!vignette) {
        vignette = mk(W, H); const vg = vignette.getContext('2d');
        const gr = vg.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.62);
        gr.addColorStop(0, 'rgba(10,6,20,0)'); gr.addColorStop(1, 'rgba(10,6,20,0.45)');
        vg.fillStyle = gr; vg.fillRect(0, 0, W, H);
      }
      o.drawImage(vignette, 0, 0);
    }
    if (scene.flash > 0) { o.globalAlpha = scene.flash; o.fillStyle = '#fffbea'; o.fillRect(0, 0, W, H); o.globalAlpha = 1; }
    o.drawImage(scene.layers.ui, 0, 0);
  }
  function composite(scene) {
    if (useGL) {
      try {
        HD2D.frame({
          layers: LAYER_NAMES.filter(n => scene.layers[n]).map(n => ({ name: n, canvas: scene.layers[n], depth: LAYER_META[n].depth, parallax: LAYER_META[n].parallax })),
          camera: scene.camera, lights: scene.lights, focusDepth: scene.focusDepth, tiltShift: scene.tiltShift,
          ambient: scene.ambient, grade: scene.grade, godRays: scene.godRays, fog: scene.fog, flash: scene.flash, time: t,
        });
        return;
      } catch (e) {
        console.error('[Render] HD2D.frame 失敗，改用 2D', e); useGL = false; setupFallback();
      }
    }
    fallbackComposite(scene);
  }
  function setupFallback() {
    // 已拿過 WebGL context 的 canvas 不能再拿 2D：換一張新的 canvas
    if (canvas.getContext('2d') == null) {
      const c = mk(W, H); c.id = 'stage'; c.className = canvas.className;
      canvas.replaceWith(c); canvas = c; bindPointer();
    }
    out = canvas.getContext('2d'); out.imageSmoothingEnabled = false;
  }

  // ---------- 現代 RPG 模式（v2.0）：背景由 SceneModern 提供，角色與 UI 畫在 1280×720 ----------
  const MW = 1280, MH = 720, MSC = 4;
  const M4 = {};
  for (const n of ['actors', 'ui']) { const c = mk(MW, MH), g2 = c.getContext('2d'); g2.imageSmoothingEnabled = true; g2.imageSmoothingQuality = 'high'; M4[n] = { c, g: g2 }; }
  const artStyle = () => (typeof Game.settings === 'function' && Game.settings() && Game.settings().artStyle) || 'modern';
  function modernReady(z) { return useGL && artStyle() === 'modern' && window.SceneModern && window.ModernSprites && SceneModern.has(z); }
  const FONT_NUM = '"M PLUS Rounded 1c","Noto Sans TC",sans-serif';
  function mText(g2, str, x, y, size, fill, stroke = '#14306e') {
    g2.font = `800 ${size}px ${FONT_NUM}`; g2.textAlign = 'center'; g2.lineJoin = 'round';
    g2.lineWidth = Math.max(3, size * 0.16); g2.strokeStyle = stroke; g2.strokeText(str, x, y); g2.fillStyle = fill; g2.fillText(str, x, y);
  }
  function modernPose(a) {
    let pose;
    if (a.hop >= 0) pose = ModernSprites.hopPose(Math.min(1, a.hop), 10);
    else pose = ModernSprites.breathe(t, a.phase);
    if (a.jumpBoost > 0) { const s2 = Math.sin(a.jumpBoost / 0.4 * Math.PI); pose = { sx: 1 - 0.06 * s2, sy: 1 + 0.08 * s2, lift: pose.lift + s2 * 8 }; }
    return pose;
  }
  function drawModernSlime(g2, type, x, y, pose, expr, ms = 0, phase = 0) {
    const e = ModernSprites.slime(type, expr, ms);
    const wl = ModernSprites.slimeSizeLogical(type);
    ModernSprites.shadow(g2, x, y, wl, MSC, pose.lift);
    if (type.rarity === 'UR' || type.rarity === 'LR') { // 動態光環
      g2.save(); g2.lineWidth = 3; g2.globalAlpha = 0.7;
      g2.strokeStyle = type.rarity === 'LR' ? '#fff4d0' : rainbow(t, x);
      g2.beginPath(); g2.ellipse(x * MSC, y * MSC + 2, wl * 0.62 * MSC, wl * 0.2 * MSC, 0, 0, Math.PI * 2); g2.stroke(); g2.restore();
      if (Math.random() < 0.4) particles.push({ k: 'spark', x: x + rnd(-wl / 2, wl / 2), y: y - rnd(0, 8) - pose.lift, vx: 0, vy: -rnd(10, 22), life: 0.9, max: 0.9, col: type.rarity === 'LR' ? '#fff4d0' : rainbow(t, rnd(0, 360)) });
    } else if ((type.rarity === 'SR' || type.rarity === 'SSR') && Math.random() < (type.rarity === 'SSR' ? 0.2 : 0.08)) {
      sparkle(x + rnd(-wl / 2, wl / 2), y - rnd(4, wl * 0.8), type.rarity === 'SSR' ? '#fff3a0' : '#e6c8ff');
    }
    if (ms >= 3) { // 里程碑 3+：柔和外光
      const gr = g2.createRadialGradient(x * MSC, (y - wl * 0.4 - pose.lift) * MSC, 0, x * MSC, (y - wl * 0.4 - pose.lift) * MSC, wl * 0.9 * MSC);
      gr.addColorStop(0, ms >= 4 ? 'rgba(255,226,110,0.35)' : 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = gr; g2.fillRect((x - wl) * MSC, (y - wl * 1.4 - pose.lift) * MSC, wl * 2 * MSC, wl * 1.6 * MSC);
    }
    const rect = ModernSprites.draw(g2, e, x, y, MSC, Object.assign({ size: 1 + ms * 0.03 }, pose));
    if (quality !== 'low') ModernSprites.material(g2, e, rect, t, phase);
    if (type.id === 'chrono') ModernSprites.clockHands(g2, e, rect, t);
    return y - wl * 0.8 - pose.lift; // 頭頂（邏輯座標）
  }
  function drawParticlesModern(g2, u) {
    for (const p of particles) {
      const a = p.life / p.max, X = p.x * MSC, Y = p.y * MSC;
      if (p.k === 'puff') { g2.globalAlpha = Math.min(1, a * 1.2) * (p.alpha || 1); g2.fillStyle = p.col; g2.beginPath(); g2.arc(X, Y, Math.max(2, p.r * 2.4 * (0.5 + a)), 0, 7); g2.fill(); }
      else if (p.k === 'spark' || p.k === 'mote') {
        const tw = p.k === 'mote' ? Math.min(1, a * 3, (1 - a) * 3) * (0.5 + 0.5 * Math.sin(t * 3 + p.ph)) : a;
        g2.globalAlpha = tw * (p.alpha || 1); g2.fillStyle = p.col;
        const r = p.k === 'mote' ? 1.5 + (p.r || 1) * 1.6 : 3 * (0.6 + a);
        g2.beginPath(); g2.moveTo(X, Y - r * 1.6); g2.lineTo(X + r * 0.45, Y); g2.lineTo(X, Y + r * 1.6); g2.lineTo(X - r * 0.45, Y); g2.closePath(); g2.fill();
        g2.beginPath(); g2.moveTo(X - r * 1.6, Y); g2.lineTo(X, Y + r * 0.45); g2.lineTo(X + r * 1.6, Y); g2.lineTo(X, Y - r * 0.45); g2.closePath(); g2.fill();
      } else if (p.k === 'coin' || p.k === 'gem') {
        g2.globalAlpha = Math.min(1, a * 2);
        const sx = Math.abs(Math.cos((p.max - p.life) * 12));
        g2.fillStyle = p.k === 'coin' ? '#ffd23f' : '#ff7ad9'; g2.strokeStyle = p.k === 'coin' ? '#8a5a10' : '#7a1a68'; g2.lineWidth = 2;
        g2.beginPath(); g2.ellipse(X, Y, Math.max(1, 12 * sx), 12, 0, 0, 7); g2.fill(); g2.stroke();
      }
      g2.globalAlpha = 1;
    }
    for (const f of floats) {
      u.globalAlpha = Math.min(1, f.life / f.max * 2);
      const pop = f.sc > 1 ? Math.max(1, 1.4 - (f.max - f.life) * 3) : 1;
      mText(u, f.str, f.x * MSC, f.y * MSC + 20, (f.sc > 1 ? 34 + f.sc * 12 : 34) * pop, f.col === '#ffffff' ? '#ffffff' : f.col);
    }
    u.globalAlpha = 1;
  }
  // 現代標題畫面用 0b 的專用 'title' 場景（沒有時退回草原）
  const titleZone = () => SceneModern.has && SceneModern.has('title') ? 'title' : 'meadow';
  // 標題吉祥物：站在坡地步道（y 140–165），輪流小跳
  const MASCOTS = [['blue', 128, 156, 0], ['green', 156, 161, 0.33], ['gold', 184, 153, 0.66]];
  function drawRanchModern(dt, title) {
    const z = title ? titleZone() : zoneNow(), M = SceneModern.meta(z);
    if (curZone !== z) {
      if (curZone !== null) zoneFadeUntil = Math.max(zoneFadeUntil, performance.now() + 800);
      // 0b 合約：換區先 prepare 新區、再 release 舊區（競技場常駐，不釋放）
      if (SceneModern.prepare) SceneModern.prepare(z);
      if (curZone && curZone !== 'arena' && SceneModern.release && SceneModern.has(curZone)) SceneModern.release(curZone);
      curZone = z;
    }
    const SL = SceneModern.layers(z, t);
    const a4 = M4.actors.g, u4 = M4.ui.g;
    a4.clearRect(0, 0, MW, MH); u4.clearRect(0, 0, MW, MH);
    if (Game.shop && Game.shop.boostActive() && Math.random() < 0.3) sparkle(rnd(0, W), rnd(0, 90), '#fff3a0');
    const lights = SceneModern.lights(z, t).slice();
    if (z === 'title') for (const [id, x, y, ph] of MASCOTS.slice().sort((p, q) => p[2] - q[2])) {
      const type = typeOf(id); if (!type) continue;
      const k = (t * 0.7 + ph) % 1;
      drawModernSlime(a4, type, x, y, k < 0.35 ? ModernSprites.hopPose(k / 0.35, 8) : { sx: 1, sy: 1, lift: 0 }, 'happy', 0, ph * 6);
    }
    const list = z === 'title' ? [] : [...actors.values()].sort((a, b) => a.y - b.y);
    for (const a of list) {
      const type = typeOf(a.type); if (!type) continue;
      const expr = a.happy > 0 || a.jumpBoost > 0 ? 'happy' : a.blinkT > 0 ? 'blink' : 'normal';
      a.top = drawModernSlime(a4, type, a.x, a.y, modernPose(a), expr, msCount(a.level), a.phase) - 2;
      if (type.rarity === 'LR') lights.push({ x: a.x, y: a.y + 3, radius: 50, color: '#fff4d0', intensity: 0.45 + 0.2 * Math.sin(t * 2.2), flicker: 0, layer: 'ground' });
      else if (type.rarity === 'UR') lights.push({ x: a.x, y: a.y + 3, radius: 40, color: rainbow(t, a.uid * 37), intensity: 0.45, flicker: 0.05, layer: 'ground' });
    }
    // 金色訪客
    visitorPos = null;
    if (Game.visitorActive && Game.visitorActive()) {
      const stay = (Game.config.visitorStay || 10) * 1000, p = 1 - (Game.visitor.activeUntil - Date.now()) / stay;
      const x = -16 + (W + 32) * Math.max(0, Math.min(1, p)), y = 124 + Math.sin(p * 9) * 6;
      const pose = ModernSprites.hopPose((t * 3) % 1, 10);
      const top = drawModernSlime(a4, VISITOR_TYPE, x, y, pose, 'happy');
      if (Math.random() < 0.6) sparkle(x - 8 + rnd(-3, 3), y - 6 - pose.lift + rnd(-4, 4), '#fff3a0');
      visitorPos = { x, y: (top + y) / 2 };
      lights.push({ x, y: visitorPos.y, radius: 40, color: '#ffd23f', intensity: 0.8, flicker: 0.2, layer: 'actors' });
    }
    if (SceneModern.drawFx) SceneModern.drawFx(a4, z, t);
    drawParticlesModern(a4, u4);
    if (!title) {
      if (Game.frenzyActive && Game.frenzyActive()) {
        u4.strokeStyle = (t * 4 | 0) % 2 ? '#ffd23f' : '#ff7aa8'; u4.lineWidth = 8; u4.strokeRect(4, 4, MW - 8, MH - 8);
        mText(u4, 'x' + Game.config.frenzyMult, 70, 70, 48, '#ffd23f');
      }
      if (clicks < 5 && Game.state.totalGold < 300) {
        const a = actors.values().next().value;
        if (a) { const yy = ((a.top || a.y - 24) - 10 - Math.abs(Math.sin(t * 5)) * 4) * MSC; u4.font = '44px sans-serif'; u4.textAlign = 'center'; u4.fillText('👆', a.x * MSC, yy); }
      }
      u4.font = `800 28px ${FONT_NUM}`; u4.textAlign = 'right'; u4.lineWidth = 5; u4.strokeStyle = '#14306e'; u4.fillStyle = '#fff';
      const cap = (Game.mainCount ? Game.mainCount() : Game.state.slimes.length) + ' / ' + Game.capacity();
      u4.strokeText(cap, MW - 20, 42); u4.fillText(cap, MW - 20, 42);
      const zf = (zoneFadeUntil - performance.now()) / 1000;
      if (zf > 0) { u4.globalAlpha = Math.min(1, zf / 0.6); u4.fillStyle = '#000'; u4.fillRect(0, 0, MW, MH); u4.globalAlpha = 1; }
    }
    return { modern: true, SL, grade: M.grade, godRays: M.godRays, fog: M.fog, focusDepth: M.focusDepth, tiltShift: M.tiltShift, lights, actorRim: M.actorRim, actorAmbientMin: M.actorAmbientMin };
  }
  function compositeModern(sc, camera, flash) {
    const SL = sc.SL, lay = (name, depth, parallax) => ({ name, canvas: SL[name].canvas, version: SL[name].version, depth, parallax });
    HD2D.frame({
      style: 'modern',
      layers: [lay('sky', 0, 0.05), lay('far', 0.2, 0.2), lay('ground', 0.6, 0.7), lay('mid', 0.6, 0.7),
        { name: 'actors', canvas: M4.actors.c, depth: 0.65, parallax: 0.7 }, lay('fg', 1, 1.3), { name: 'ui', canvas: M4.ui.c, depth: -1 }],
      camera, lights: sc.lights, grade: sc.grade, godRays: sc.godRays, fog: sc.fog, focusDepth: sc.focusDepth, tiltShift: sc.tiltShift, flash, time: t,
      actorRim: sc.actorRim, actorAmbientMin: sc.actorAmbientMin,
    });
  }
  // 依畫面風格選擇牧場的畫法
  function drawScene(dt, title) {
    const z = title ? (window.SceneModern ? titleZone() : 'meadow') : zoneNow();
    return modernReady(z) ? drawRanchModern(dt, title) : drawRanch(dt, title);
  }

  // ---------- 主迴圈 ----------
  const cam = { x: 0, y: 0, zoom: 1.03 };
  function initClouds() { for (let i = 0; i < 5; i++) clouds.push({ i, x: rnd(-40, W), y: rnd(6, 60), v: rnd(3, 8) }); }
  function clearLayers() { for (const n of LAYER_NAMES) L[n].g.clearRect(0, 0, W, H); }

  function drawRanch(dt, title) {
    const z = title ? 'meadow' : zoneNow(), Z = ZONE_LIGHT[z] || ZONE_LIGHT.meadow;
    if (curZone !== z) { if (curZone !== null) zoneFadeUntil = Math.max(zoneFadeUntil, performance.now() + 800); curZone = z; }
    const SL = S().sceneLayers(W, H, z);
    L.sky.g.drawImage(SL.sky, 0, 0);
    L.far.g.drawImage(SL.far, 0, 0);
    L.mid.g.drawImage(SL.mid, 0, 0);
    L.ground.g.drawImage(SL.ground, 0, 0);
    drawZoneDynamic(z, dt);
    spawnAmbient(z, dt);
    if (Game.shop && Game.shop.boostActive() && Math.random() < 0.3) sparkle(rnd(0, W), rnd(0, 90), '#fff3a0');
    g = L.actors.g;
    const lights = zoneLights(z);
    const list = [...actors.values()].sort((a, b) => a.y - b.y);
    for (const a of list) {
      drawActor(a, Z.rim);
      const ty = typeOf(a.type);
      if (ty && ty.rarity === 'LR') lights.push({ x: a.x, y: a.y + 3, radius: 50, color: '#fff4d0', intensity: 0.45 + 0.2 * Math.sin(t * 2.2), flicker: 0, layer: 'ground' });
      else if (ty && ty.rarity === 'UR') lights.push({ x: a.x, y: a.y + 3, radius: 40, color: rainbow(t, a.uid * 37), intensity: 0.45, flicker: 0.05, layer: 'ground' });
      else if (ty && RARITY_GLOW[ty.rarity] && quality === 'high') lights.push({ x: a.x, y: a.y - 8, radius: 22 + ty.tier * 2, color: RARITY_GLOW[ty.rarity], intensity: 0.5, flicker: 0.1, layer: 'actors' });
    }
    drawVisitor(Z.rim);
    if (visitorPos) lights.push({ x: visitorPos.x, y: visitorPos.y, radius: 40, color: '#ffd23f', intensity: 1, flicker: 0.2, layer: 'actors' });
    drawForeground(z);
    drawParticles();
    if (title) return { grade: z, godRays: { x: 40, y: -20, strength: 0.45 }, fog: Z.fog, focusDepth: Z.focusDepth, tiltShift: Z.tiltShift, lights };
    // ui 層：狂熱框、新手手指、容量
    const ug = L.ui.g;
    if (Game.frenzyActive && Game.frenzyActive()) {
      ug.fillStyle = (t * 4 | 0) % 2 ? '#ffd23f' : '#ff7aa8';
      ug.fillRect(0, 0, W, 2); ug.fillRect(0, H - 2, W, 2); ug.fillRect(0, 0, 2, H); ug.fillRect(W - 2, 0, 2, H);
      ug.drawImage(textImg('x' + Game.config.frenzyMult, '#ffd23f', 2), 6, 6);
    }
    if (clicks < 5 && Game.state.totalGold < 300) {
      const a = actors.values().next().value;
      if (a) ug.drawImage(S().icon('hand'), Math.round(a.x - 3), Math.round((a.top || a.y - 24) - 14 - Math.abs(Math.sin(t * 5)) * 4));
    }
    S().drawText(ug, (Game.mainCount ? Game.mainCount() : Game.state.slimes.length) + '-' + Game.capacity(), W - 14, 4, '#ffffff', '#2a1d14');
    // 換區黑幕用實際時間計算：分頁降頻時也不會拖長
    const zf = (zoneFadeUntil - performance.now()) / 1000;
    if (zf > 0) { ug.globalAlpha = Math.min(1, zf / 0.6); ug.fillStyle = '#000'; ug.fillRect(0, 0, W, H); ug.globalAlpha = 1; }
    return { grade: z, godRays: Z.godRays, fog: Z.fog, focusDepth: Z.focusDepth, tiltShift: Z.tiltShift, lights };
  }

  // 扭蛋揭曉等全畫面彈窗蓋住畫布時暫停合成（畫布保留最後一幀），把效能留給揭曉特效
  let held = false;
  function frame(now) {
    requestAnimationFrame(frame);
    if (held) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; t += dt;
    syncActors();
    for (const a of actors.values()) updateActor(a, dt);
    updateParticles(dt);
    clearLayers();
    g = L.actors.g;
    const sc = (mode ? mode(L, dt, t) : drawScene(dt)) || {};
    // 鏡頭：緩慢呼吸＋震動（zoom ≥ 1.03 讓邊緣永遠被蓋住）
    cam.x = Math.sin(t * 0.31) * 1.6 + (shake > 0 ? rnd(-2, 2) : 0);
    cam.y = Math.sin(t * 0.23) * 0.9 + (shake > 0 ? rnd(-1.5, 1.5) : 0);
    cam.zoom = 1.03 + (sc.zoom || 0);
    if (sc.camX) cam.x += sc.camX;
    if (sc.camY) cam.y += sc.camY;
    if (shake > 0) shake = Math.max(0, shake - dt);
    let flash = sc.flash || 0;
    if (whiteout > 0) {
      whiteout = Math.max(0, whiteout - dt);
      const p = 1 - whiteout / 2.2;
      flash = Math.max(flash, p < 0.35 ? p / 0.35 : Math.max(0, 1 - (p - 0.35) / 0.65));
      if (p > 0.3 && Math.random() < 0.8) particles.push({ k: 'spark', x: rnd(0, W), y: rnd(60, H), vx: 0, vy: -40, life: 1, max: 1, col: '#b8a0ff' });
    }
    // 角色層的位移必須是整數像素，否則取樣會出現次像素柔焦：以 actors 的 parallax 反推整數鏡頭
    const pa = LAYER_META.actors.parallax;
    const camOut = { x: Math.round(cam.x * pa) / pa, y: Math.round(cam.y * pa) / pa, zoom: cam.zoom };
    if (sc.modern) { compositeModern(sc, { x: cam.x, y: cam.y, zoom: cam.zoom }, flash); return; }
    composite({
      layers: Object.fromEntries(LAYER_NAMES.map(n => [n, L[n].c])), camera: camOut,
      lights: sc.lights || [], grade: sc.grade || 'meadow', ambient: sc.ambient, godRays: sc.godRays,
      fog: sc.fog || null, focusDepth: sc.focusDepth ?? 0.65, tiltShift: sc.tiltShift ?? 0.5, flash,
    });
  }

  function setQuality(q) {
    quality = q;
    if (useGL && HD2D.setQuality) HD2D.setQuality(q);
  }

  function toLogical(ev) {
    const r = canvas.getBoundingClientRect();
    // 換算回 actors 層座標（扣掉鏡頭位移與縮放）
    const sx = (ev.clientX - r.left) / r.width * W, sy = (ev.clientY - r.top) / r.height * H, z = cam.zoom, par = LAYER_META.actors.parallax;
    return { x: (sx - W / 2 * (1 - z)) / z + cam.x * par, y: (sy - H / 2 * (1 - z)) / z + cam.y * par };
  }
  function hitActor(x, y) {
    let best = null, bd = 1e9;
    for (const a of actors.values()) {
      const type = typeOf(a.type); if (!type) continue;
      const { w, h } = S().slimeSize(type.tier);
      if (Math.abs(x - a.x) < w / 2 + 2 && y < a.y + 2 && y > a.y - h - 4) { const d = Math.abs(y - a.y); if (d < bd) { bd = d; best = a; } }
    }
    return best;
  }

  let clicks = 0, lastCrit = false;
  function onPointer(ev) {
    if (mode) return;
    const p = toLogical(ev);
    if (visitorPos && Math.hypot(p.x - visitorPos.x, p.y - visitorPos.y) < 16) return catchVisitor();
    lastCrit = false;
    const gain = Game.actions.click(); clicks++;
    const a = hitActor(p.x, p.y);
    if (a) { a.jumpBoost = 0.4; a.happy = 0.6; }
    if (lastCrit) {
      coinBurst(p.x, p.y, 10); shake = 0.08;
      floatText(p.x, p.y - 14, '+' + Game.fmt(gain), '#ffd23f', 2);
      floatText(p.x + 16, p.y - 22, 'x' + Game.config.critMult, '#ff7aa8');
    } else {
      coinBurst(p.x, p.y, 3);
      floatText(p.x + rnd(-4, 4), p.y - 8, '+' + Game.fmt(gain), '#ffffff');
    }
  }
  function bindPointer() { canvas.addEventListener('pointerdown', onPointer); }

  function init() {
    canvas = document.getElementById('stage');
    quality = (typeof Game.settings === 'function' && Game.settings() && Game.settings().quality) || 'high';
    useGL = !!(window.HD2D && HD2D.init && (() => { try { return HD2D.init(canvas, { quality, width: W, height: H }); } catch (e) { console.error(e); return false; } })());
    if (!useGL) setupFallback();
    initClouds();
    bindPointer();
    Game.on('gold', d => {
      if (!d) return;
      if (!d.passive) { if (d.crit) lastCrit = true; return; }
      if (mode) return;
      const a = d.uid != null && actors.get(d.uid); if (!a) return;
      a.acc = (a.acc || 0) + d.amount;
      if (t < (a.nextFloat || 0)) return;
      const n = Game.state.slimes.length;
      a.nextFloat = t + 3 + Math.min(4, n * 0.15) + rnd(0, 1);
      floatText(a.x + rnd(-8, 8), (a.top || a.y - 20) - 2, '+' + Game.fmt(a.acc));
      a.acc = 0;
    });
    Game.on('merge', d => {
      const a = d && d.slime && actors.get(d.slime.uid);
      const x = a ? a.x : W / 2, y = a ? a.y - 10 : 140;
      if (a) a.happy = 1.5;
      puff(x, y, 30, '#ffffff'); for (let i = 0; i < 12; i++) sparkle(x + rnd(-14, 14), y + rnd(-14, 6), '#fff3a0'); shake = 0.25;
      if (d && d.bonus) floatText(x, y - 20, '+1', '#ffd23f', 2);
    });
    Game.on('levelup', d => {
      const sl = d && d.slime, a = sl && actors.get(sl.uid); if (!a) return;
      a.jumpBoost = 0.4; a.happy = 0.8;
      if (d.milestone) {
        floatText(a.x, (a.top || a.y - 20) - 14, 'x' + d.milestone.mult, '#ffd23f', 3);
        puff(a.x, a.y - 8, 20, '#fff3a0'); shake = 0.2;
        for (let i = 0; i < 16; i++) sparkle(a.x + rnd(-14, 14), a.y - rnd(0, 26), '#fff3a0');
      } else {
        floatText(a.x, (a.top || a.y - 20) - 6, d.levels > 1 ? 'Lv+' + d.levels : 'LvUP', '#b5ffa0');
        for (let i = 0; i < 6; i++) sparkle(a.x + rnd(-8, 8), a.y - rnd(4, 16), '#c4ff9a');
      }
    });
    Game.on('purchase', () => { gemBurst(W / 2, 40, 16); shake = 0.2; });
    Game.on('gacha', res => { gemBurst(W / 2, 30, Math.min(20, (res || []).length * 3)); });
    Game.on('prestige', () => { whiteout = 2.2; actors.clear(); });
    // 畫質：由引擎的 settings 事件驅動（自動降級在 hd2d 裡處理）
    Game.on('settings', e => { if (e && e.quality) setQuality(e.quality); if (e && e.artStyle) curZone = null; });
    Game.on('zone', d => { if (!d) return; zoneFadeUntil = performance.now() + (d.unlocked ? 1400 : 800); zoneBanner(S().zoneOf(d.id), d.unlocked); });
    requestAnimationFrame(now => { last = now; frame(now); });
  }

  // ---------- 標題畫面：草原全景、鏡頭緩慢橫移；開始時推近並淡入主畫面 ----------
  let titleState = null;
  function titleMode(Lr, dt, tt) {
    const sc = drawScene(dt, true);
    const ts = titleState;
    let zoom = 0.14, camX = Math.sin(tt * 0.12) * 12, camY = -4, flash = 0;
    if (ts.leaving) {
      const p = Math.min(1, (performance.now() - ts.leaving) / 1100);
      const e = p * p * (3 - 2 * p);
      zoom = 0.14 + e * 0.22; camX *= 1 - e; camY = -4 + e * 10;
      flash = Math.max(0, (p - 0.6) / 0.4);
      if (p >= 1 && !ts.done) { ts.done = true; setTimeout(ts.onDone, 0); }
    }
    return Object.assign(sc, { zoom, camX, camY, flash });
  }
  function startTitle() {
    titleState = { leaving: 0, done: false, onDone: null };
    mode = titleMode;
  }
  function endTitle(onDone) {
    if (!titleState || titleState.leaving) return;
    titleState.onDone = () => { mode = null; titleState = null; onDone && onDone(); };
    titleState.leaving = performance.now();
  }

  window.Render = {
    hold: v => { held = !!v; }, artStyle, isModern: () => modernReady(zoneNow()), modernUI: () => useGL && artStyle() === 'modern' && !!window.SceneModern && !!window.ModernSprites,
    modernBattle: () => modernReady('arena'), M4, MSC, mText,
    drawModernFx: () => drawParticlesModern(M4.actors.g, M4.ui.g), startTitle, endTitle, resize: () => { if (useGL && HD2D.resize) HD2D.resize(); },
    init, W, H, setQuality, quality: () => quality, usingGL: () => useGL,
    setMode: fn => { mode = fn; particles.length = 0; floats.length = 0; },
    shake: s => { shake = Math.max(shake, s); },
    fx: { puff, sparkle, coinBurst, gemBurst, floatText },
    rainbow,
    draw: {
      slime: drawSlime, particles: drawParticles, textImg,
      setLayer: n => { g = L[n].g; return g; },
    },
    layers: L, canvas: () => canvas, toLogical,
  };
})();
