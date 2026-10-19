// battle.js — 遠征戰鬥重播（ccline-27）
// dungeon.fight() 已一次算完結果；這裡只依 result.log 的時間重播，畫面數字與實際結果完全一致。
(function () {
  'use strict';
  const W = 320, H = 180;
  // 戰鬥場景放大：史萊姆／小怪 1.5 倍、頭目 2 倍
  // 前排 2 隻（靠近敵人）、後排 3 隻，交錯站位
  const SLOTS = [[128, 129], [124, 156], [76, 117], [80, 141], [72, 164]];
  const FOE = { x: 240, y: 166 };
  const SC = 1.3, BOSS_SC = 2;
  const FOE_M = { x: 160, y: 122 }; // 現代模式：敵人腳底（邏輯座標）
  const EL_COL = { fire: '#ff6a2a', water: '#4ab0ff', grass: '#6ad04a', light: '#ffe36a', dark: '#a46aff' };
  const RIM = { dir: 't', col: [255, 200, 130] }; // 火把暖光的邊緣光
  const TAUNTS = ['哼，就這點力氣？', '回去再練練吧！', '太弱了太弱了～', '下次再來挑戰吧！'];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sfx = name => { if (Game.audio) Game.audio.play(name); };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ---------- 競技場背景（快取）----------
  let arena = null;
  function arenaBg() {
    if (arena) return arena;
    arena = mk(W, H); const g = arena.getContext('2d');
    const B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const dz = (x, y, t) => t * 16 > B[y & 3][x & 3] + 0.5;
    const img = g.createImageData(W, H), d = img.data;
    const put = (x, y, c) => { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
    const floorY = 118;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c;
      if (y < floorY) {
        // 石磚牆
        const row = y >> 3, bx = (x + (row & 1) * 8) % 16, by = y % 8;
        const mortar = by === 7 || bx === 15;
        const shade = ((x * 7 + row * 13) % 5) / 40;
        c = mortar ? [28, 24, 40] : (by === 0 ? [74, 68, 98] : [58 - shade * 80, 52 - shade * 80, 80 - shade * 80].map(v => v | 0));
        // 上方較暗
        if (dz(x, y, 1 - y / floorY * 0.9) && y < 50) c = c.map(v => v * 0.75 | 0);
      } else {
        // 地板：透視石板
        const p = (y - floorY) / (H - floorY);
        const tw = 18 + p * 22, off = (x - W / 2) / tw + 100;
        const line = Math.abs(off - Math.round(off)) < 0.04 + p * 0.02 || (y - floorY) % Math.round(8 + p * 10) === 0;
        c = line ? [40, 34, 52] : (dz(x, y, p) ? [86, 76, 104] : [72, 64, 90]);
      }
      // 暗角
      const vx = Math.abs(x - W / 2) / (W / 2), vy = Math.abs(y - H * 0.55) / (H * 0.6);
      if (dz(x, y, Math.max(0, vx * vx + vy * vy - 0.55) * 1.6)) c = c.map(v => v * 0.55 | 0);
      put(x, y, c);
    }
    g.putImageData(img, 0, 0);
    // 火把座
    for (const tx of [40, 280]) { g.fillStyle = '#2a1d14'; g.fillRect(tx - 2, 52, 5, 14); g.fillStyle = '#6b4421'; g.fillRect(tx - 1, 52, 3, 13); g.fillStyle = '#9b6a3a'; g.fillRect(tx - 3, 50, 7, 3); }
    // 地上光暈
    return arena;
  }
  function torch(g, x, t) {
    const f = Math.sin(t * 20 + x) * 1.2;
    g.fillStyle = 'rgba(255,170,60,0.10)'; g.beginPath(); g.arc(x, 46, 22 + f * 2, 0, 7); g.fill();
    g.fillStyle = '#ff7a2a'; g.fillRect(x - 2, 43 + (f | 0), 5, 6);
    g.fillStyle = '#ffd84a'; g.fillRect(x - 1, 44 + (f | 0), 3, 4);
    g.fillStyle = '#fff6c0'; g.fillRect(x, 46, 1, 2);
    if (Math.random() < 0.3) Render.fx.sparkle(x + rnd(-2, 2), 42, '#ffb02a');
  }

  // 白色剪影（受擊閃光）
  const whiteCache = new WeakMap();
  function white(c) {
    let w = whiteCache.get(c); if (w) return w;
    w = mk(c.width, c.height); const g = w.getContext('2d');
    g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fff'; g.fillRect(0, 0, w.width, w.height);
    whiteCache.set(c, w); return w;
  }
  const darkCache = new WeakMap();
  function dark(c) {
    let w = darkCache.get(c); if (w) return w;
    w = mk(c.width, c.height); const g = w.getContext('2d');
    g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(20,10,40,0.55)'; g.fillRect(0, 0, w.width, w.height);
    darkCache.set(c, w); return w;
  }
  function flag() {
    const c = mk(14, 20), g = c.getContext('2d');
    g.fillStyle = '#2a1d14'; g.fillRect(1, 0, 2, 20);
    g.fillStyle = '#5cba47'; g.fillRect(3, 1, 10, 7); g.fillStyle = '#a6ec8a'; g.fillRect(3, 1, 10, 2);
    g.fillStyle = '#fff'; g.fillRect(6, 3, 2, 2); g.fillRect(9, 3, 2, 2);
    return c;
  }
  const FLAG = flag();

  // 現代戰鬥用向量圖示
  const MODI = () => !!(Render.modernBattle && Render.modernBattle() && window.ModernIcons);
  const elURL = (el, s) => MODI() && ModernIcons.url(el) || Monsters.elementURL(el, s);

  // ---------- DOM 疊層 ----------
  function overlay(result) {
    const wrap = document.getElementById('stageWrap');
    const el = document.createElement('div');
    el.className = 'battle-ui';
    const foe = result.enemy;
    if (Render.modernBattle && Render.modernBattle()) el.classList.add('modern');
    el.innerHTML = `<div class="b-top">
        <span class="b-name"><img src="${elURL(foe.element, 2)}" alt="">第 ${foe.floor} 層 ${foe.boss ? '<b class="b-boss">頭目</b>' : ''} ${foe.name}</span>
        <div class="b-hp"><i></i><span></span></div><span class="b-time">0.0s</span></div>
      ${foe.shield ? `<div class="b-guard"><span class="b-shield"><img src="${(MODI() && ModernIcons.url('relic_combat') || Sprites.iconURL('relic_combat', 2))}" alt="盾牌"><b>${foe.shield}</b></span>
        <span class="b-weak">${(foe.weak || []).map(el => `<img src="${elURL(el, 2)}" alt="${el}" title="弱點">`).join('')}</span></div>` : ''}
      <div class="b-banner"></div>
      <div class="b-ctl"><button class="px-btn small" data-speed>×1</button><button class="px-btn small" data-skip>跳過</button></div>
      ${el.classList.contains('modern') ? `<div class="b-team">${Game.dungeon.team().map(sl => {
        const t = Game.config.slimeTypes[sl.type], elx = Game.dungeon.slimeElement[sl.type], mult = Game.dungeon.elementMult(sl.type, foe.element);
        return `<div class="b-card" data-uid="${sl.uid}"><span class="b-cv" data-type="${sl.type}"></span><div class="b-cname">${t.name}</div>
          <div class="b-cmeta">Lv${sl.level}${elx ? ` <img src="${elURL(elx, 2)}" alt="">` : ''}${mult >= 2 ? ' <b class="good">×2</b>' : mult < 1 ? ' <b class="bad">×0.5</b>' : ''}${(foe.weak || []).includes(elx) ? ' <b class="weak">WEAK</b>' : ''}</div></div>`;
      }).join('')}</div>` : ''}`;
    el.querySelectorAll('.b-cv').forEach(slot => { const ty = Game.config.slimeTypes[slot.dataset.type], src = window.ModernSprites && ModernSprites.uiCanvas(ty); if (!src) return; const c = document.createElement('canvas'); c.width = 128; c.height = 128; c.getContext('2d').drawImage(src, 0, 0, 128, 128); c.className = 'b-sprite'; slot.replaceWith(c); });
    wrap.appendChild(el);
    return el;
  }

  // opts.speed：初始速度（自動推關用 2）
  function play(result, opts = {}) {
    return new Promise(resolve => {
      const foe = result.enemy, isBoss = foe.boss;
      // 現代 RPG：正面視角，敵人在畫面中央，隊伍改成下方的狀態視窗
      const MOD = !!(Render.modernBattle && Render.modernBattle());
      const FP = MOD ? FOE_M : FOE;
      const team = Game.dungeon.team();
      const idx = new Map(team.map((s, i) => [s.uid, i]));
      const ui = overlay(result);
      const hpBar = ui.querySelector('.b-hp i'), hpTxt = ui.querySelector('.b-hp span'), timeEl = ui.querySelector('.b-time'), banner = ui.querySelector('.b-banner');
      const events = result.log.map(e => ({ ...e, te: e.t - 0.5 + 0.4 + (idx.get(e.uid) || 0) * 0.09, done: false, hitDone: false }));
      const lastT = events.length ? events[events.length - 1].te + 0.25 : 0;
      const endT = result.win ? lastT : Math.max(lastT, result.seconds - 0.1);
      let T = 0, speed = opts.speed || 1, hp = foe.hp, flashT = 0, knock = 0, phase = 'fight', endClock = 0, said = {}, bossFlash = 0, gemText = '';
      const shards = [], shieldBits = [], mfx = [];
      let lastFlash = -1, lastWeak = -1;
      let zoomKick = 0, shieldNow = foe.shield || 0, breakEnd = -1, freeze = 0;
      const shieldEl = ui.querySelector('.b-shield b'), guardEl = ui.querySelector('.b-guard');
      const setShield = bump => {
        if (!shieldEl) return;
        const broke = breakEnd >= 0;
        shieldEl.textContent = broke ? 'BREAK' : shieldNow;
        guardEl.classList.toggle('broken', broke);
        if (bump) shieldEl.animate([{ transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 220 });
      };
      const acc = [], critAcc = [], lastShown = [];
      const lunge = new Map();
      const msCount = lv => Game.config.milestones.filter(m => lv >= m.level).length;

      const say = (txt, cls) => { banner.className = 'b-banner show ' + (cls || ''); banner.textContent = txt; void banner.offsetWidth; };
      const setHp = () => {
        const p = Math.max(0, hp) / foe.hp;
        hpBar.style.width = (p * 100).toFixed(1) + '%';
        hpTxt.textContent = Game.fmt(Math.max(0, hp)) + ' / ' + Game.fmt(foe.hp);
      };
      setHp();
      const impact = e => {
        hp -= e.dmg; knock = 1;
        // 受擊白閃有冷卻，避免高頻攻擊時整隻一直是白的
        if (e.crit || e.brk || T - lastFlash > 0.35) { flashT = 0.06; lastFlash = T; }
        sfx(e.crit ? 'hitCrit' : 'hit');
        const sl = team[idx.get(e.uid)];
        const mult = sl ? Game.dungeon.elementMult(sl.type, foe.element) : 1;
        const k = idx.get(e.uid) || 0, hx = FP.x - 30 + k * 15 + rnd(-3, 3), hy = FP.y - (MOD ? (isBoss ? 80 : 46) : (isBoss ? 104 : 42)) - (k % 2) * 9 + rnd(-2, 2);
        // 弱點：扣盾、WEAK 小字
        if (e.shield != null) {
          shieldNow = e.shield; setShield(true);
          if (T - lastWeak > 0.4) { lastWeak = T; Render.fx.floatText(FP.x + rnd(-16, 16), FP.y - (isBoss ? 70 : 30), 'WEAK', '#ffffff'); sfx('weak'); }
        }
        // BREAK：凍結 0.15 秒、盾牌碎裂、大字、暈眩
        if (e.brk) {
          breakEnd = T + (Game.dungeon.BREAK_SECONDS || 4); freeze = 0.15; setShield(true);
          say('BREAK!', 'brk'); sfx('break'); Render.shake(0.25); zoomKick = Math.max(zoomKick, 0.07);
          for (let i = 0; i < 24; i++) shieldBits.push({ x: FP.x, y: FP.y - (isBoss ? 60 : 26), vx: rnd(-110, 110), vy: rnd(-130, -20), life: rnd(0.6, 1), col: i % 3 ? '#9fd4ff' : '#ffffff' });
        }
        // 同一格位 0.3 秒內的傷害合併成一個數字，避免高 DPS 時疊成一團
        acc[k] = (acc[k] || 0) + e.dmg; critAcc[k] = critAcc[k] || e.crit;
        if (T - (lastShown[k] ?? -1) < 0.45) { setHp(); return; }
        const shown = acc[k], wasCrit = critAcc[k]; acc[k] = 0; critAcc[k] = false; lastShown[k] = T;
        e = { ...e, dmg: shown, crit: wasCrit, broken: e.broken };
        Render.fx.floatText(hx, hy, Game.fmt(e.dmg), e.crit ? '#ffd23f' : e.broken ? '#ff6a3a' : mult >= 2 ? '#ffb070' : mult < 1 ? '#a8a8c0' : '#ffffff', e.crit ? 2 : 1);
        for (let i = 0; i < (e.crit ? 6 : 2); i++) Render.fx.sparkle(FP.x + rnd(-12, 12), FP.y - rnd(6, isBoss ? 40 : 20), e.crit ? '#ffd23f' : '#ffffff');
        if (e.crit) { Render.shake(0.08); zoomKick = Math.max(zoomKick, 0.035); }
        if (mult >= 2 && !said.super) { said.super = 1; say('效果拔群！', 'super'); }
        else if (mult < 1 && !said.weak) { said.weak = 1; say('效果不太好…', 'weak'); }
        setHp();
      };
      const finish = () => {
        if (phase !== 'fight') return;
        for (const e of events) { if (!e.hitDone) { e.hitDone = true; hp -= e.dmg; } }
        hp = result.win ? 0 : result.hpLeft; setHp();
        breakEnd = -1; setShield(false);
        phase = result.win ? 'win' : 'lose'; endClock = 0;
        if (result.win) {
          sfx(isBoss ? 'bossBreak' : 'victory');
          zoomKick = isBoss ? 0.12 : 0.05;
          if (isBoss) {
            setTimeout(() => sfx('victory'), 700);
            say('頭目擊破！', 'win boss');
            bossFlash = 0.35;
            // 崩解成碎片
            const spr = Monsters.canvas(foe.id, 0);
            for (let i = 0; i < 46; i++) shards.push({ x: FP.x + rnd(-40, 40), y: FP.y - rnd(4, 92), vx: rnd(-90, 90), vy: rnd(-150, -40), r: rnd(0, 6.3), vr: rnd(-8, 8),
              sx: Math.floor(rnd(0, spr.width - 6)), sy: Math.floor(rnd(0, spr.height - 6)), life: rnd(1, 1.6) });
            if (result.rewards.gems) gemText = '+' + result.rewards.gems;
          } else say('勝利！', 'win');
          Render.fx.puff(FP.x, FP.y - 20, 30, '#ffffff'); Render.fx.coinBurst(FP.x, FP.y - 16, 20);
          if (result.rewards.gems) Render.fx.gemBurst(FP.x, FP.y - 16, isBoss ? 20 : 8);
          Render.shake(isBoss ? 0.5 : 0.2);
        } else { sfx('defeat'); say(TAUNTS[Math.floor(Math.random() * TAUNTS.length)], 'lose'); }
      };
      const close = () => { Render.setMode(null); ui.remove(); };
      // 頭目：結算彈窗出現時畫布仍停在競技場，由呼叫端在彈窗關閉後呼叫 close()
      let resolved = false;
      const cleanup = () => {
        if (resolved) return; resolved = true;
        ui.querySelector('.b-ctl').remove();
        if (result.win && isBoss) resolve(close); else { close(); resolve(() => {}); }
      };

      // ---------- 現代模式：正面視角的競技場 ----------
      const whiteM = new WeakMap();
      const silhouette = (src, col) => { let w = whiteM.get(src); if (w && w.col === col) return w.c; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g2 = c.getContext('2d'); g2.drawImage(src, 0, 0); g2.globalCompositeOperation = 'source-atop'; g2.fillStyle = col; g2.fillRect(0, 0, c.width, c.height); whiteM.set(src, { c, col }); return c; };
      function drawModern(tt, dt) {
        const S4 = Render.MSC, a = Render.M4.actors.g, u = Render.M4.ui.g;
        a.clearRect(0, 0, 1280, 720); u.clearRect(0, 0, 1280, 720);
        const SL = SceneModern.layers('arena', tt), meta = SceneModern.meta('arena');
        const e = ModernSprites.monster(foe.id);
        const x0 = FP.x * S4, y0 = FP.y * S4, MK = isBoss ? 1.3 : 2.0; // 正面視角：敵人放大成畫面主角
        if (e) {
          const k = S4 / ModernSprites.RES * MK;
          let sx = 1, sy = 1, bob = Math.sin(tt * (isBoss ? 1.6 : 2.6)) * (isBoss ? 6 : 4), alpha = 1;
          const br = Math.sin(tt * 2.2) * 0.02; sx += br; sy -= br;
          const stunned = breakEnd >= 0 && phase === 'fight';
          if (phase === 'win') { const p = Math.min(1, endClock / 0.5); sx *= 1 + p * 0.3; sy *= 1 - p; alpha = isBoss ? 0 : 1 - p; }
          if (phase === 'lose') { const b = Math.abs(Math.sin(endClock * 6)); sy *= 1 + b * 0.12; sx *= 1 - b * 0.06; bob -= b * 16; }
          const w = e.c.width * k * sx, h = e.c.height * k * sy;
          const dx = x0 - e.ax * k * sx + knock * 14 + (stunned ? Math.sin(tt * 18) * 5 : 0), dy = y0 - e.ay * k * sy - bob;
          ModernSprites.shadow(a, FP.x, FP.y, (e.w / ModernSprites.RES) * MK * 0.8, S4, 0);
          // 魔法陣（腳下）
          for (const f of mfx) if (f.k === 'circle') {
            const p = (T - f.t0) / 0.7; if (p < 0 || p > 1) continue;
            a.save(); a.globalAlpha = (1 - p) * 0.9; a.strokeStyle = f.col; a.lineWidth = 3; a.translate(x0, y0 + 4); a.scale(1, 0.32); a.rotate(tt * 2);
            const R = (isBoss ? 220 : 150) * (0.6 + p * 0.5);
            a.beginPath(); a.arc(0, 0, R, 0, Math.PI * 2); a.stroke(); a.beginPath(); a.arc(0, 0, R * 0.78, 0, Math.PI * 2); a.stroke();
            for (let i = 0; i < 6; i++) { const ang = i / 6 * Math.PI * 2; a.beginPath(); a.moveTo(Math.cos(ang) * R * 0.78, Math.sin(ang) * R * 0.78); a.lineTo(Math.cos(ang + 2.1) * R * 0.78, Math.sin(ang + 2.1) * R * 0.78); a.stroke(); }
            a.restore();
          }
          a.globalAlpha = alpha;
          a.drawImage(e.c, dx, dy, w, h);
          // 受擊閃光：疊半透明白剪影，不整隻變白（高 DPS 時才看得到敵人）
          if (flashT > 0) { a.globalAlpha = alpha * 0.55 * Math.min(1, flashT / 0.06); a.drawImage(silhouette(e.c, '#ffffff'), dx, dy, w, h); a.globalAlpha = alpha; }
          if (stunned) { a.globalAlpha = 0.45; a.drawImage(silhouette(e.c, '#140a28'), dx, dy, w, h); for (let i = 0; i < 3; i++) { const ang = tt * 5 + i * 2.1; a.globalAlpha = 1; a.fillStyle = '#ffe36a'; a.beginPath(); a.arc(x0 + Math.cos(ang) * w * 0.3, dy + 10 + Math.sin(ang) * 8, 6, 0, Math.PI * 2); a.fill(); } }
          a.globalAlpha = 1;
          // 頭目崩解碎片
          for (const p of shards) {
            p.life -= dt; if (p.life <= 0) continue;
            p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
            if (p.y > FP.y + 6) { p.y = FP.y + 6; p.vy *= -0.35; p.vx *= 0.7; }
            a.save(); a.globalAlpha = Math.min(1, p.life * 1.5); a.translate(p.x * S4, p.y * S4); a.rotate(p.r);
            const sw = e.c.width / 8;
            // 三角形碎片（現代風不用方塊）
            a.beginPath(); a.moveTo(-sw * k * 0.5, -sw * k * 0.4); a.lineTo(sw * k * 0.5, -sw * k * 0.2); a.lineTo(-sw * k * 0.1, sw * k * 0.5); a.closePath(); a.clip();
            a.drawImage(e.c, (p.sx / 48) * e.c.width % (e.c.width - sw), (p.sy / 48) * e.c.height % (e.c.height - sw), sw, sw, -sw * k / 2, -sw * k / 2, sw * k, sw * k); a.restore();
          }
          for (const b of shieldBits) { b.life -= dt; if (b.life <= 0) continue; b.vy += 240 * dt; b.x += b.vx * dt; b.y += b.vy * dt; a.globalAlpha = Math.min(1, b.life * 2); a.fillStyle = b.col; a.save(); a.translate(b.x * S4, b.y * S4); a.rotate(b.x); a.fillRect(-8, -5, 16, 10); a.restore(); }
          a.globalAlpha = 1;
        }
        // 斬擊（從下方往敵人劃過的弧形光）
        for (const f of mfx) if (f.k === 'slash') {
          const p = (T - f.t0) / 0.28; if (p < 0 || p > 1) continue;
          a.save(); a.translate(x0, y0 - (isBoss ? 170 : 100)); a.rotate(f.ang);
          const R = (isBoss ? 200 : 140) * (f.crit ? 1.3 : 1), a0 = -2.2 + p * 2.6, a1 = a0 + 1.1;
          a.globalAlpha = 1 - p; a.lineCap = 'round';
          a.strokeStyle = f.col; a.lineWidth = f.crit ? 18 : 12; a.beginPath(); a.arc(0, 0, R, a0, a1); a.stroke();
          a.strokeStyle = '#ffffff'; a.lineWidth = f.crit ? 7 : 4; a.beginPath(); a.arc(0, 0, R, a0 + 0.1, a1 - 0.05); a.stroke();
          a.restore();
          if (p < 0.08 && Math.random() < 0.6) for (let i = 0; i < 3; i++) Render.fx.sparkle(FP.x + rnd(-14, 14), FP.y - rnd(10, isBoss ? 60 : 30), f.col);
        }
        for (let i = mfx.length - 1; i >= 0; i--) if (T - mfx[i].t0 > 1) mfx.splice(i, 1);
        Render.drawModernFx();
        if (gemText && endClock > 0.6) Render.mText(u, '💎 ' + gemText, 640, 390, 72 * Math.max(1, 1.5 - (endClock - 0.6) * 3), '#ffd23f');
        if (phase === 'win' && endClock > 0.5) Render.mText(u, '🚩', x0, y0 - 30, 80, '#5cba47', 'rgba(0,0,0,0)');
        bossFlash = Math.max(0, bossFlash - dt);
        if (phase !== 'fight' && endClock > (result.win ? (isBoss ? 2.6 : 1.6) : 1.8)) cleanup();
        const lights = (SceneModern.lights('arena', tt) || []).slice();
        if (flashT > 0) lights.push({ x: FP.x, y: FP.y - 20, radius: 50, color: '#ffffff', intensity: 1.2, flicker: 0, layer: 'actors' });
        return { modern: true, SL, grade: meta.grade, godRays: meta.godRays, fog: meta.fog, focusDepth: meta.focusDepth, tiltShift: meta.tiltShift, lights, actorRim: meta.actorRim, actorAmbientMin: meta.actorAmbientMin,
          flash: bossFlash / 0.35, zoom: (phase === 'fight' ? 0.02 : 0) + zoomKick, camX: 0, camY: 0 };
      }
      ui.querySelector('[data-speed]').textContent = '×' + speed;
      ui.querySelector('[data-speed]').addEventListener('click', e => { speed = speed === 1 ? 2 : 1; e.currentTarget.textContent = '×' + speed; });
      ui.querySelector('[data-skip]').addEventListener('click', () => { if (phase === 'fight') { T = endT; finish(); } else cleanup(); });

      Render.setMode((Lr, dt, t) => {
        const g = Lr.actors.g;
        const d = dt * speed;
        zoomKick = Math.max(0, zoomKick - dt * 0.25);
        if (freeze > 0) freeze -= dt;
        else if (phase === 'fight') {
          T += d;
          if (breakEnd >= 0 && T >= breakEnd) { breakEnd = -1; shieldNow = foe.shield; setShield(true); }
          for (const e of events) {
            if (!e.done && T >= e.te) {
              e.done = true; lunge.set(e.uid, T);
              if (MOD) {
                const card = ui.querySelector(`.b-card[data-uid="${e.uid}"]`);
                if (card) { card.classList.add('act'); setTimeout(() => card.classList.remove('act'), 320 / speed); }
                const sl = team[idx.get(e.uid)], elx = sl && Game.dungeon.slimeElement[sl.type];
                mfx.push({ k: 'slash', t0: T, ang: rnd(-0.9, 0.9), col: EL_COL[elx] || '#ffffff', crit: e.crit });
                if (e.crit || e.brk || (e.weak && Math.random() < 0.35)) mfx.push({ k: 'circle', t0: T, col: EL_COL[elx] || '#ffe9a8' });
              }
            }
            if (!e.hitDone && T >= e.te + 0.15) { e.hitDone = true; impact(e); }
          }
          if (T >= endT) finish();
        } else endClock += dt;
        timeEl.textContent = Math.min(T, Game.dungeon.TIME_LIMIT).toFixed(1) + 's';
        flashT = Math.max(0, flashT - dt); knock = Math.max(0, knock - dt * 6);

        if (MOD) return drawModern(t, dt);
        // 牆在 far 層（景深模糊）、地板在 ground 層（焦點）、火把在 mid 層
        const bg = arenaBg();
        Lr.far.g.drawImage(bg, 0, 0, W, 118, 0, 0, W, 118);
        Lr.ground.g.drawImage(bg, 0, 118, W, H - 118, 0, 118, W, H - 118);
        torch(Lr.mid.g, 40, t); torch(Lr.mid.g, 280, t);
        // 隊伍（由後往前畫）
        const order = team.map((s, i) => i).sort((a, b) => SLOTS[a][1] - SLOTS[b][1]);
        for (const i of order) {
          const sl = team[i], type = Game.config.slimeTypes[sl.type]; if (!type) continue;
          let [x, y] = SLOTS[i], lift = 0, frame = Math.sin(t * 4 + i) > 0.8 ? 1 : 0;
          const ls = lunge.get(sl.uid);
          if (ls != null && T - ls < 0.3) {
            const p = (T - ls) / 0.3, s = Math.sin(p * Math.PI);
            x += s * (FP.x - 40 - x) * 0.55; lift = s * 10; frame = p < 0.5 ? 2 : 1;
          }
          if (phase === 'win') { lift = Math.abs(Math.sin(endClock * 8 + i)) * 6; frame = 2; }
          Render.draw.slime(type, x, y, frame, phase === 'win' ? 2 : 0, msCount(sl.level), lift, SC, RIM);
        }
        // 敵人
        const spr = Monsters.canvas(foe.id, (t * (isBoss ? 1.5 : 3) | 0) % 2);
        if (spr) {
          let sx = 1, sy = 1, bob = isBoss ? Math.sin(t * 2) * 2 : 0, alpha = 1;
          if (phase === 'win') { const p = Math.min(1, endClock / 0.5); sx = 1 + p * 0.3; sy = 1 - p; alpha = 1 - p; }
          if (phase === 'lose') { const b = Math.abs(Math.sin(endClock * 6)); sy = 1 + b * 0.12; sx = 1 - b * 0.06; bob -= b * 4; }
          const fs = isBoss ? BOSS_SC : SC;
          if (phase === 'win' && isBoss) alpha = 0; // 頭目改用碎片崩解
          const w = Math.round(spr.width * sx * fs), h = Math.max(1, Math.round(spr.height * sy * fs));
          const stunned = breakEnd >= 0 && phase === 'fight';
          const x = Math.round(FP.x - w / 2 + knock * 4 + (stunned ? Math.sin(t * 18) * 1.5 : 0)), y = Math.round(FP.y - h + bob);
          if (alpha > 0) { const gg = Lr.ground.g; gg.save(); gg.globalAlpha = 0.35 * alpha; gg.fillStyle = '#100a18'; gg.beginPath(); gg.ellipse(FP.x, FP.y, spr.width * fs * 0.45, spr.width * fs * 0.12, 0, 0, 7); gg.fill(); gg.restore(); }
          g.globalAlpha = alpha;
          g.drawImage(flashT > 0 ? white(spr) : stunned ? dark(spr) : spr, x, y, w, h);
          g.globalAlpha = 1;
          if (stunned) for (let i = 0; i < 3; i++) {
            const a = t * 5 + i * 2.1; g.fillStyle = '#ffe36a';
            g.fillRect(Math.round(FP.x + Math.cos(a) * w * 0.3), Math.round(y - 4 + Math.sin(a) * 3), 2, 2);
          }
          for (const b of shieldBits) {
            b.life -= dt; if (b.life <= 0) continue;
            b.vy += 240 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
            g.globalAlpha = Math.min(1, b.life * 2); g.fillStyle = b.col; g.fillRect(Math.round(b.x), Math.round(b.y), 3, 2);
          }
          g.globalAlpha = 1;
          if (alpha > 0 && (foe.id === 'wisp' || foe.id === 'angel')) { g.fillStyle = 'rgba(255,240,170,0.12)'; g.beginPath(); g.arc(FP.x, FP.y - spr.height * fs / 2, spr.width * fs * 0.7, 0, 7); g.fill(); }
          // 碎片
          for (const p of shards) {
            p.life -= dt; if (p.life <= 0) continue;
            p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
            if (p.y > FP.y + 6) { p.y = FP.y + 6; p.vy *= -0.35; p.vx *= 0.7; }
            g.save(); g.globalAlpha = Math.min(1, p.life * 1.5); g.translate(Math.round(p.x), Math.round(p.y)); g.rotate(Math.round(p.r / 1.57) * 1.57);
            g.drawImage(spr, p.sx, p.sy, 6, 6, -6, -6, 12, 12); g.restore();
          }
        }
        bossFlash = Math.max(0, bossFlash - dt);
        if (gemText && endClock > 0.6) {
          const ug = Lr.ui.g, img = Render.draw.textImg(gemText, '#ffd23f', 3), gem = Sprites.icon('gem');
          const pop = Math.max(1, 1.5 - (endClock - 0.6) * 3), w = img.width * pop, h = img.height * pop;
          ug.drawImage(gem, Math.round(W / 2 - w / 2 - 22), 84, 16, 16);
          ug.drawImage(img, Math.round(W / 2 - w / 2), Math.round(86 - (h - img.height) / 2), Math.round(w), Math.round(h));
        }
        if (phase === 'win' && endClock > 0.5) {
          const p = Math.min(1, (endClock - 0.5) / 0.25);
          g.drawImage(FLAG, FP.x - 2, Math.round(FP.y - 30 - (1 - p) * 40), 21, 30);
        }
        Render.draw.particles();
        if (phase !== 'fight' && endClock > (result.win ? (isBoss ? 2.6 : 1.6) : 1.8)) cleanup();
        // 場景參數：地牢調色、兩側火把點光源、地面薄霧；鏡頭在戰鬥中略推向敵人，暴擊與擊破時再推近
        const lights = [
          { x: 40, y: 46, radius: 90, color: '#ffb040', intensity: 1.2, flicker: 0.35, layer: 'mid' },
          { x: 280, y: 46, radius: 90, color: '#ffb040', intensity: 1.2, flicker: 0.35, layer: 'mid' },
          // 火把在地面投下的光池（不要光暈）
          { x: 52, y: 132, radius: 70, color: '#ff9a3a', intensity: 0.7, flicker: 0.35, layer: 'ground', halo: 0 },
          { x: 268, y: 132, radius: 70, color: '#ff9a3a', intensity: 0.7, flicker: 0.35, layer: 'ground', halo: 0 },
        ];
        if (spr && (foe.id === 'wisp' || foe.id === 'angel' || foe.id === 'dragon' || foe.id === 'lich') && phase !== 'win')
          lights.push({ x: FP.x, y: FP.y - 30, radius: 60, color: { wisp: '#fff0a0', angel: '#fff0d0', dragon: '#ff6a20', lich: '#6aff9a' }[foe.id], intensity: 0.8, flicker: 0.3, layer: 'actors' });
        if (flashT > 0) lights.push({ x: FP.x, y: FP.y - 20, radius: 50, color: '#ffffff', intensity: 1.2, flicker: 0, layer: 'actors' });
        return {
          grade: 'dungeon', lights, fog: { color: '#2a2440', density: 0.25, horizon: 160 },
          focusDepth: 0.65, tiltShift: 0.45, flash: bossFlash / 0.35,
          zoom: (phase === 'fight' ? 0.03 : 0) + zoomKick, camX: phase === 'fight' ? 3 : 0,
        };
      });
    });
  }

  window.Battle = { play };
})();
