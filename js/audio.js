// audio.js — 音效與背景音樂（Web Audio 即時合成，不需要音檔）（ccline-a3）
// 兩套音色：現代 RPG 風格（管弦，js/audio-modern.js，預設）／經典像素（8-bit，本檔內建），依 Game.settings.artStyle 切換。
// 引擎事件會自動發聲；需要配合畫面時機的（扭蛋揭曉、戰鬥重播）由 UI 呼叫 Game.audio.play(name)。
(function () {
  'use strict';
  const Game = (window.Game = window.Game || {});
  const PREF_KEY = 'pixelSlimeRanch.audio';

  let ctx = null, master = null, comp = null, M = null; // M＝現代風格引擎（延遲建立）
  let prefs = { muted: false, volume: 0.5 };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* 用預設值 */ }
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* 忽略 */ } }

  // 瀏覽器規定要有使用者互動後才能出聲，所以第一次播放時才建立
  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      // 音效 master 與配樂 mBus 都經過壓縮器，避免多聲部疊加時破音
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
      comp.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = prefs.volume * 0.3;
      master.connect(comp);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 一個音：方波／三角波，從 f0 滑到 f1，帶簡單的音量包絡
  function tone(t, f0, f1, dur, type, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t, dur, vol) {
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; g.gain.value = vol || 0.4;
    s.connect(g); g.connect(master); s.start(t);
  }
  // 依序播放音符：[[頻率, 長度], ...]
  function arp(t, notes, type, vol) {
    notes.forEach(function (n) { tone(t, n[0], n[0], n[1], type, vol); t += n[1] * 0.9; });
  }
  const N = { C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047, E6: 1319, G6: 1568, C7: 2093, G4: 392, C4: 262, E4: 330 };

  const SOUNDS = {
    coin:       function (t) { tone(t, 1320, 1320, 0.05, 'square', 0.25); tone(t + 0.05, 1980, 1980, 0.08, 'square', 0.25); },
    crit:       function (t) { arp(t, [[N.C6, 0.05], [N.E6, 0.05], [N.G6, 0.05], [N.C7, 0.12]], 'square', 0.3); },
    buy:        function (t) { tone(t, 600, 1200, 0.1, 'square', 0.3); },
    levelup:    function (t) { tone(t, 440, 880, 0.12, 'triangle', 0.5); },
    milestone:  function (t) { arp(t, [[N.C5, 0.08], [N.E5, 0.08], [N.G5, 0.08], [N.C6, 0.25]], 'square', 0.35); },
    merge:      function (t) { tone(t, 200, 1600, 0.35, 'triangle', 0.5); arp(t + 0.3, [[N.G5, 0.08], [N.C6, 0.2]], 'square', 0.3); },
    achievement:function (t) { arp(t, [[N.G5, 0.07], [N.C6, 0.07], [N.E6, 0.2]], 'triangle', 0.5); },
    visitor:    function (t) { tone(t, 2000, 2600, 0.06, 'square', 0.2); tone(t + 0.08, 2000, 2600, 0.06, 'square', 0.2); },
    caught:     function (t) { arp(t, [[N.E6, 0.05], [N.G6, 0.05], [N.C7, 0.15]], 'square', 0.3); noise(t, 0.15, 0.15); },
    purchase:   function (t) { arp(t, [[N.C5, 0.06], [N.G5, 0.06], [N.C6, 0.06], [N.E6, 0.06], [N.G6, 0.3]], 'square', 0.3); },
    // 扭蛋（由 UI 在揭曉瞬間呼叫）
    eggShake:   function (t) { tone(t, 180, 160, 0.06, 'triangle', 0.4); },
    reveal_N:   function (t) { tone(t, 700, 900, 0.12, 'triangle', 0.4); },
    reveal_R:   function (t) { arp(t, [[N.E5, 0.08], [N.A5, 0.18]], 'triangle', 0.45); },
    reveal_SR:  function (t) { noise(t, 0.2, 0.2); arp(t, [[N.C5, 0.07], [N.E5, 0.07], [N.G5, 0.07], [N.C6, 0.3]], 'square', 0.35); },
    reveal_SSR: function (t) {
      noise(t, 0.35, 0.3);
      arp(t, [[N.C5, 0.09], [N.E5, 0.09], [N.G5, 0.09], [N.C6, 0.09], [N.E6, 0.09], [N.G6, 0.5]], 'square', 0.35);
      arp(t + 0.05, [[N.C4, 0.18], [N.G4, 0.18], [N.C5, 0.7]], 'triangle', 0.5);
    },
    // UR（星輝扭蛋）：低音轟鳴 → 上行琶音 → 長和弦閃光
    reveal_UR:  function (t) {
      tone(t, 60, 40, 0.8, 'triangle', 0.6); noise(t, 0.8, 0.25);
      arp(t + 0.5, [[N.C5, 0.07], [N.E5, 0.07], [N.G5, 0.07], [N.C6, 0.07], [N.E6, 0.07], [N.G6, 0.07], [N.C7, 0.9]], 'square', 0.32);
      arp(t + 0.55, [[N.C4, 0.25], [N.G4, 0.25], [N.C5, 0.25], [N.E5, 1.2]], 'triangle', 0.5);
      noise(t + 1.0, 0.9, 0.3);
    },
    // LR（神諭扭蛋）：三聲神聖鐘響 → 大調上行 → 長延音和弦
    reveal_LR:  function (t) {
      [0, 0.45, 0.9].forEach(function (d, i) {
        const f = [N.C5, N.G5, N.C6][i];
        tone(t + d, f, f, 1.4, 'sine', 0.45); tone(t + d, f * 2.76, f * 2.76, 0.9, 'sine', 0.12); // 鐘的非整數泛音
      });
      arp(t + 1.4, [[N.C5, 0.08], [N.E5, 0.08], [N.G5, 0.08], [N.C6, 0.08], [N.E6, 0.08], [N.G6, 0.08], [N.C7, 1.4]], 'triangle', 0.35);
      arp(t + 1.45, [[N.C4, 0.3], [N.E4, 0.3], [N.G4, 0.3], [N.C5, 1.6]], 'sine', 0.45);
      noise(t + 1.9, 1.2, 0.18);
    },
    // 戰鬥（由 UI 依重播時間呼叫）
    hit:        function (t) { noise(t, 0.06, 0.25); tone(t, 300, 120, 0.06, 'square', 0.2); },
    hitCrit:    function (t) { noise(t, 0.1, 0.4); tone(t, 500, 100, 0.12, 'square', 0.35); },
    victory:    function (t) { arp(t, [[N.G5, 0.1], [N.G5, 0.1], [N.G5, 0.1], [N.C6, 0.4]], 'square', 0.35); },
    defeat:     function (t) { arp(t, [[N.G4, 0.15], [N.E4, 0.15], [N.C4, 0.4]], 'triangle', 0.5); },
    bossBreak:  function (t) { noise(t, 0.6, 0.5); tone(t, 150, 40, 0.6, 'square', 0.4); arp(t + 0.4, [[N.C6, 0.08], [N.E6, 0.08], [N.G6, 0.08], [N.C7, 0.5]], 'square', 0.3); },
    // 大事件
    prestige:   function (t) { tone(t, 100, 2000, 1.2, 'triangle', 0.5); noise(t + 1.0, 0.5, 0.3); arp(t + 1.1, [[N.C6, 0.1], [N.G6, 0.1], [N.C7, 0.6]], 'square', 0.3); },
    zone:       function (t) { arp(t, [[N.C5, 0.15], [N.G5, 0.15], [N.E5, 0.15], [N.C6, 0.5]], 'triangle', 0.5); },
    // 開場號角（標題畫面按下開始）
    fanfare:    function (t) {
      arp(t, [[N.G4, 0.12], [N.C5, 0.12], [N.E5, 0.12], [N.G5, 0.12], [N.C6, 0.7]], 'triangle', 0.5);
      arp(t + 0.24, [[N.E5, 0.12], [N.G5, 0.12], [N.E6, 0.7]], 'square', 0.18);
      noise(t + 0.48, 0.6, 0.12);
    },
    // 遠征 BREAK（由 UI 依重播時間呼叫）
    weak:       function (t) { tone(t, 1800, 2400, 0.05, 'square', 0.25); },
    'break':    function (t) { noise(t, 0.5, 0.6); tone(t, 900, 60, 0.45, 'square', 0.45); arp(t + 0.12, [[N.E6, 0.06], [N.C6, 0.06], [N.G5, 0.25]], 'triangle', 0.4); }
  };

  // 同一種音效的最短間隔（秒），避免高頻事件疊成噪音
  const MIN_GAP = { coin: 0.06, hit: 0.05, eggShake: 0.1, levelup: 0.07, buy: 0.07, milestone: 0.25, weak: 0.08, ui_cursor: 0.05, ui_confirm: 0.05, ui_open: 0.08, ui_close: 0.08, ui_buzz: 0.2 };
  const lastAt = {};

  function isModern() {
    // Game.artStyle()（引擎 v2.0）回傳 'modern'／'pixel'；舊版沒有這個函式時視為現代風格
    let st = 'modern';
    try { st = typeof Game.artStyle === 'function' ? Game.artStyle() : st; } catch (e) { /* 狀態還沒載入 */ }
    return !!window.AudioModern && st !== 'pixel';
  }
  function modernEngine() {
    if (!M && ensureBus()) M = window.AudioModern(ctx, master, verb);
    return M;
  }
  function play(name) {
    if (prefs.muted) return;
    const modern = isModern();
    if (!modern && !SOUNDS[name]) return;
    if (!ac()) return;
    const t = ctx.currentTime;
    if (MIN_GAP[name] && lastAt[name] && t - lastAt[name] < MIN_GAP[name]) return;
    lastAt[name] = t;
    if (modern && modernEngine()) {
      if (!M.playSound(name, t + 0.005, master)) { if (SOUNDS[name]) SOUNDS[name](t + 0.005); return; }
      // 號角類的長音效：背景音樂暫時壓低，播完再回來
      const dur = M.jingles[name];
      if (dur && mBus) {
        mBus.gain.cancelScheduledValues(t);
        mBus.gain.setTargetAtTime(musicGain() * 0.2, t, 0.05);
        mBus.gain.setTargetAtTime(musicGain(), t + dur, 0.4);
      }
      return;
    }
    SOUNDS[name](t + 0.005);
  }

  // ================= 背景音樂（程式即時合成的管弦風循環） =================
  // 每首 8 小節循環：弦樂 pad 墊和弦＋豎琴琶音＋主旋律＋低音＋輕打擊，經過合成殘響。
  // 旋律依和弦音用固定種子產生，所以每次循環都一樣。
  if (!('musicOn' in prefs)) prefs.musicOn = true;
  if (!('musicVolume' in prefs)) prefs.musicVolume = 0.5;

  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  const SONGS = {
    meadow:  { bpm: 92,  root: 60, mode: 'major', prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: 'flute',   arp: 'up',     bass: 'root',   drums: 'soft',  density: 0.55, seed: 11 },
    beach:   { bpm: 80,  root: 65, mode: 'major', prog: [0, 2, 3, 4, 0, 5, 3, 4], lead: 'pluck',   arp: 'updown', bass: 'walk',   drums: 'soft',  density: 0.5,  seed: 23 },
    volcano: { bpm: 112, root: 50, mode: 'minor', prog: [0, 5, 6, 0, 0, 5, 3, 4], lead: 'brass',   arp: 'pulse',  bass: 'octave', drums: 'march', density: 0.45, seed: 37 },
    snow:    { bpm: 72,  root: 57, mode: 'minor', prog: [0, 3, 5, 4, 0, 3, 6, 4], lead: 'celesta', arp: 'up',     bass: 'root',   drums: 'none',  density: 0.4,  seed: 41 },
    sky:     { bpm: 100, root: 62, mode: 'major', prog: [0, 3, 5, 4, 0, 3, 4, 4], lead: 'brass',   arp: 'updown', bass: 'octave', drums: 'soft',  density: 0.6,  seed: 53 },
    battle:  { bpm: 144, root: 52, mode: 'minor', prog: [0, 5, 2, 6, 0, 5, 3, 4], lead: 'strings', arp: 'pulse',  bass: 'drive',  drums: 'drive', density: 0.7,  seed: 67 },
    // 標題曲：慢板、明亮，豎琴琶音配長笛，像旅程的序章
    title:   { bpm: 76,  root: 62, mode: 'major', prog: [0, 5, 3, 4, 0, 5, 1, 4], lead: 'flute',   arp: 'updown', bass: 'root',   drums: 'none',  density: 0.45, seed: 89 }
  };
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function seeded(seed) { let x = seed; return function () { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }

  // 預先算好一首曲子：每小節的和弦、主旋律（step 以 16 分音符計，8 小節＝128 步）
  function compose(song) {
    const sc = SCALES[song.mode], rnd = seeded(song.seed);
    const deg = function (d, oct) { return song.root + sc[((d % 7) + 7) % 7] + 12 * (oct + Math.floor(d / 7)); };
    const bars = song.prog.map(function (d) { return [deg(d, 0), deg(d + 2, 0), deg(d + 4, 0)]; });
    const melody = [];
    let last = 4;
    for (let b = 0; b < 8; b++) {
      for (let st = 0; st < 16; st += 2) {
        const strong = st % 8 === 0;
        if (!strong && rnd() > song.density) continue;
        // 強拍落在和弦音，弱拍走鄰近的經過音
        const chordDegs = [song.prog[b], song.prog[b] + 2, song.prog[b] + 4];
        let target = strong ? chordDegs[Math.floor(rnd() * 3)] : last + (rnd() < 0.5 ? 1 : -1);
        while (target - last > 4) target -= 7;
        while (last - target > 4) target += 7;
        last = Math.max(0, Math.min(11, target));
        melody.push({ step: b * 16 + st, midi: deg(last, 1), len: strong && rnd() < 0.4 ? 4 : 2 });
      }
    }
    return { bars: bars, melody: melody };
  }

  let mBus = null, verb = null, cur = null, schedTimer = null, battleOn = false, bossOn = false, titleOn = false, wantZone = 'meadow', curStyle = null;
  const modernCache = {};

  function musicGain() { return prefs.muted || !prefs.musicOn ? 0 : prefs.musicVolume * 0.22; }
  function ensureBus() {
    if (!ac()) return false;
    if (!mBus) {
      mBus = ctx.createGain(); mBus.gain.value = musicGain(); mBus.connect(comp);
      // 合成殘響：衰減的雜訊當脈衝響應
      const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
      verb = ctx.createConvolver(); verb.buffer = ir;
      const wet = ctx.createGain(); wet.gain.value = 0.35; verb.connect(wet); wet.connect(mBus);
    }
    return true;
  }

  // ---- 樂器 ----
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function voice(out, t, freq, type, a, peak, d, opts) {
    opts = opts || {};
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (opts.detune) o.detune.value = opts.detune;
    let node = o;
    if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; o.connect(f); node = f; }
    if (opts.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5; lg.gain.value = freq * 0.006; l.connect(lg); lg.connect(o.frequency);
      l.start(t + 0.15); l.stop(t + a + d + 0.05);
    }
    node.connect(g); env(g, t, a, peak, d); g.connect(out);
    if (opts.wet) { const w = ctx.createGain(); w.gain.value = opts.wet; g.connect(w); w.connect(verb); }
    o.start(t); o.stop(t + a + d + 0.05);
  }
  function hit(out, t, dur, vol, type, freq) {
    const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = type; f.frequency.value = freq;
    src.connect(f); f.connect(g); env(g, t, 0.003, vol, dur); g.connect(out); src.start(t);
  }
  function kick(out, t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    o.connect(g); env(g, t, 0.003, vol, 0.18); g.connect(out); o.start(t); o.stop(t + 0.25);
  }
  const LEADS = {
    flute:   function (o, t, f, d) { voice(o, t, f, 'sine', 0.06, 0.32, d, { vib: true, wet: 0.6 }); voice(o, t, f * 2, 'sine', 0.06, 0.04, d); },
    pluck:   function (o, t, f, d) { voice(o, t, f, 'triangle', 0.005, 0.35, Math.min(d, 0.5), { wet: 0.4 }); },
    brass:   function (o, t, f, d) { voice(o, t, f, 'sawtooth', 0.04, 0.16, d, { lp: 1600, wet: 0.5 }); voice(o, t, f, 'square', 0.04, 0.06, d, { lp: 1200, detune: 6 }); },
    celesta: function (o, t, f) { voice(o, t, f * 2, 'sine', 0.003, 0.28, 0.9, { wet: 0.8 }); voice(o, t, f * 4, 'sine', 0.003, 0.06, 0.4); },
    strings: function (o, t, f, d) { voice(o, t, f, 'sawtooth', 0.02, 0.15, d * 0.8, { lp: 2200, wet: 0.4 }); voice(o, t, f, 'sawtooth', 0.02, 0.1, d * 0.8, { lp: 2200, detune: -8 }); }
  };

  function scheduleStep(m, step, t) {
    const song = m.song, beat = 60 / song.bpm / 4, bar = Math.floor(step / 16) % 8, st = step % 16;
    const chord = m.comp.bars[bar], o = m.gain;
    // 弦樂 pad：每小節換和弦
    if (st === 0) chord.forEach(function (n, i) {
      voice(o, t, mtof(n), 'sawtooth', 0.35, 0.05, beat * 16 - 0.2, { lp: song.mode === 'minor' ? 900 : 1300, detune: i * 5 - 5, wet: 0.9 });
    });
    // 豎琴琶音（8 分音符）
    if (st % 2 === 0) {
      const idx = st / 2;
      const n = song.arp === 'up' ? chord[idx % 3] + 12 * (Math.floor(idx / 3) % 2)
        : song.arp === 'updown' ? chord[[0, 1, 2, 1][idx % 4]] + 12
        : chord[0] + 12 * (idx % 2);
      voice(o, t, mtof(n), 'triangle', 0.004, song.arp === 'pulse' ? 0.09 : 0.12, 0.35, { wet: 0.5 });
    }
    // 低音
    const root = chord[0] - 24;
    if (song.bass === 'root' && st === 0) voice(o, t, mtof(root), 'triangle', 0.01, 0.4, beat * 14);
    if (song.bass === 'walk' && st % 4 === 0) voice(o, t, mtof(st === 8 ? chord[2] - 24 : root), 'triangle', 0.01, 0.35, beat * 3.5);
    if (song.bass === 'octave' && st % 4 === 0) voice(o, t, mtof(root + (st % 8 ? 12 : 0)), 'triangle', 0.01, 0.35, beat * 3.5);
    if (song.bass === 'drive' && st % 2 === 0) voice(o, t, mtof(root + (st % 4 ? 12 : 0)), 'square', 0.005, 0.12, beat * 1.6, { lp: 700 });
    // 打擊
    if (song.drums === 'soft') { if (st === 0) kick(o, t, 0.25); if (st === 8) hit(o, t, 0.08, 0.05, 'highpass', 6000); }
    if (song.drums === 'march') { if (st % 8 === 0) kick(o, t, 0.4); if (st % 8 === 4) hit(o, t, 0.12, 0.12, 'bandpass', 1800); if (st === 14) hit(o, t, 0.06, 0.08, 'bandpass', 1800); }
    if (song.drums === 'drive') { if (st % 4 === 0) kick(o, t, 0.45); if (st % 8 === 4) hit(o, t, 0.14, 0.16, 'bandpass', 2000); if (st % 2 === 1) hit(o, t, 0.03, 0.04, 'highpass', 7000); }
    // 主旋律：前 4 小節是前奏，之後才進來
    if (m.loops > 0 || step >= 64) m.comp.melody.forEach(function (n) {
      if (n.step === step % 128) LEADS[song.lead](o, t, mtof(n.midi), beat * n.len * 0.95);
    });
  }

  function startSong(name) {
    if (!ensureBus()) return;
    const modern = isModern() && !!modernEngine();
    if (modern ? !M.songs[name] : !SONGS[name]) { if (name === 'boss') startSong('battle'); return; }
    if (cur && cur.name === name && cur.modern === modern) return;
    const now = ctx.currentTime;
    if (cur) {
      const old = cur.gain;
      old.gain.setTargetAtTime(0.0001, now, 0.5);
      setTimeout(function () { try { old.disconnect(); } catch (e) { /* 忽略 */ } }, 3000);
    }
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.setTargetAtTime(1, now, 0.6); g.connect(mBus);
    if (modern) {
      const c = modernCache[name] || (modernCache[name] = M.compose(name));
      cur = { name: name, modern: true, mc: c, gain: g, step: 0, loops: 0, next: now + 0.1 };
    } else {
      cur = { name: name, modern: false, song: SONGS[name], comp: compose(SONGS[name]), gain: g, step: 0, loops: 0, next: now + 0.1 };
    }
    if (!schedTimer) schedTimer = setInterval(pump, 25);
  }
  // 每 25ms 預排未來 0.15 秒內的音符
  function pump() {
    if (!cur || !ctx) return;
    if (cur.modern) {
      const c = cur.mc;
      if (cur.next < ctx.currentTime - 1) cur.next = ctx.currentTime + 0.05;
      while (cur.next < ctx.currentTime + 0.2) {
        const list = musicGain() > 0 ? c.ev[cur.step] : null;
        if (list) for (let k = 0; k < list.length; k++) M.playEvent(list[k], cur.next, c.beat, cur.gain);
        cur.next += c.beat; cur.step++;
        if (cur.step >= c.total) { cur.step = c.loop; cur.loops++; }
      }
      return;
    }
    const beat = 60 / cur.song.bpm / 4;
    if (cur.next < ctx.currentTime - 1) cur.next = ctx.currentTime + 0.05; // 分頁在背景太久時不要補播
    while (cur.next < ctx.currentTime + 0.15) {
      if (musicGain() > 0) scheduleStep(cur, cur.step, cur.next);
      cur.next += beat; cur.step++;
      if (cur.step % 128 === 0) cur.loops++;
    }
  }
  function refreshMusic() {
    if (!ctx) return;
    if (mBus) mBus.gain.setTargetAtTime(musicGain(), ctx.currentTime, 0.2);
    if (musicGain() > 0) startSong(titleOn ? 'title' : battleOn ? (bossOn ? 'boss' : 'battle') : wantZone);
  }
  function zoneId() {
    try { return (Game.zone && Game.zone().id) || Game.state.zone || 'meadow'; } catch (e) { return 'meadow'; }
  }
  // 瀏覽器要求使用者互動後才能出聲：第一次點擊時開始播放
  if (typeof document !== 'undefined' && document.addEventListener) {
    const firstTouch = function () {
      document.removeEventListener('pointerdown', firstTouch, true);
      wantZone = zoneId();
      if (ac()) refreshMusic();
    };
    document.addEventListener('pointerdown', firstTouch, true);
  }

  Game.audio = {
    play: play,
    sounds: Object.keys(SOUNDS).concat(['rest', 'ui_cursor', 'ui_confirm', 'ui_cancel', 'ui_buzz', 'ui_open', 'ui_close']),
    muted: function () { return prefs.muted; },
    setMuted: function (m) { prefs.muted = !!m; savePrefs(); refreshMusic(); },
    // 背景音樂
    songs: Object.keys(SONGS),
    musicOn: function () { return prefs.musicOn; },
    setMusicOn: function (on) { prefs.musicOn = !!on; savePrefs(); refreshMusic(); },
    musicVolume: function () { return prefs.musicVolume; },
    setMusicVolume: function (v) { prefs.musicVolume = Math.max(0, Math.min(1, v)); savePrefs(); refreshMusic(); },
    // 戰鬥開始時 setBattle(true)，結束時 setBattle(false) 回到地區音樂
    // boss=true 時改播頭目戰曲（現代風格才有，經典像素仍用一般戰鬥曲）
    setBattle: function (on, boss) { battleOn = !!on; bossOn = !!(on && boss); refreshMusic(); },
    isModern: isModern,
    // 標題畫面按下開始時呼叫 setTitle(true)，進入遊戲時 setTitle(false)。
    // 瀏覽器在點擊前不准出聲，標題曲只能從這一下開始；過場只有約 1 秒，所以先播一段開場號角，
    // 標題曲接在後面，直到 setTitle(false) 才淡出、換成地區曲。
    setTitle: function (on) {
      titleOn = !!on;
      if (on && ac()) play('fanfare');
      refreshMusic();
    },
    nowPlaying: function () { return cur ? cur.name : null; },
    volume: function () { return prefs.volume; },
    setVolume: function (v) {
      prefs.volume = Math.max(0, Math.min(1, v)); savePrefs();
      if (master) master.gain.value = prefs.volume * 0.3;
    }
  };

  // ---- 引擎事件自動發聲 ----
  if (Game.on) {
    Game.on('gold', function (d) {
      if (!d || d.passive || d.visitor) return; // 被動產出不出聲
      play(d.crit ? 'crit' : 'coin');
    });
    Game.on('buy', function () { play('buy'); });
    Game.on('levelup', function (d) { play(d && d.milestone ? 'milestone' : 'levelup'); });
    Game.on('merge', function () { play('merge'); });
    Game.on('achievement', function () { play('achievement'); });
    Game.on('visitor', function () { play('visitor'); });
    Game.on('visitorCaught', function () { play('caught'); });
    Game.on('purchase', function () { play('purchase'); });
    Game.on('prestige', function () { play('prestige'); });
    Game.on('zone', function (d) { if (d && d.unlocked) play('zone'); });
    // 背景音樂跟著目前地區
    Game.on('change', function () {
      const z = zoneId();
      if (z !== wantZone) { wantZone = z; refreshMusic(); }
      // 切換畫面風格時，換成另一套音色重新播放目前的曲子
      const st = isModern() ? 'modern' : 'pixel';
      if (curStyle && st !== curStyle && cur) { cur = null; refreshMusic(); }
      curStyle = st;
    });
    // 錢不夠、還不能做的提示：現代風格播低音提示
    Game.on('toast', function (msg) { if (isModern() && /不足|不能|無法|尚未|請先|已經領過|用完/.test(String(msg))) play('ui_buzz'); });
  }

  // ---- 介面音效（現代風格）：游標移動、確認、開窗、關窗，自動掛在 DOM 上 ----
  // 會自己發聲的動作（購買、升級、抽卡、出戰…）不再重複播確認音
  const SELF_SOUND = { buy: 1, lv: 1, lvmax: 1, up: 1, upmax: 1, dustup: 1, pull: 1, free: 1, merge: 1, fight: 1, buyp: 1, claim: 1, login: 1, task: 1, prestige: 1 };
  if (typeof document !== 'undefined' && document.addEventListener) {
    let hoverEl = null;
    document.addEventListener('pointerover', function (e) {
      if (e.pointerType !== 'mouse' || !isModern()) return;
      const b = e.target.closest && e.target.closest('button, .px-tab, [data-act]');
      if (b && b !== hoverEl && !b.disabled) { hoverEl = b; play('ui_cursor'); }
      if (!b) hoverEl = null;
    }, true);
    document.addEventListener('click', function (e) {
      if (!isModern()) return;
      const b = e.target.closest && e.target.closest('button, .px-tab');
      if (!b || b.disabled || SELF_SOUND[b.dataset.act]) return;
      play('ui_confirm');
    }, true);
    const watchModals = function () {
      const root = document.getElementById('modalRoot');
      if (!root || !window.MutationObserver) return;
      new MutationObserver(function (list) {
        if (!isModern()) return;
        let added = 0, removed = 0;
        list.forEach(function (m) { added += m.addedNodes.length; removed += m.removedNodes.length; });
        if (added) play('ui_open'); else if (removed) play('ui_close');
      }).observe(root, { childList: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchModals); else watchModals();
  }
})();
