// audio-modern.js — 現代 RPG 風格的管弦配樂與音效（Web Audio 即時合成，全部原創旋律）（ccline-a3）
// 由 audio.js 在「現代 RPG」畫面風格時使用；經典像素風格仍用 audio.js 內建的 8-bit 音色。
// 介面：window.AudioModern(ctx, out, verb) -> { sounds, songs, compose(name), playEvent(ev, t, beatSec), jingles }
(function () {
  'use strict';

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function seeded(seed) { let x = seed; return function () { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11] };

  window.AudioModern = function (ctx, out, verb) {
    // ---------- 基本建構 ----------
    // target：目前的輸出節點（配樂用曲子自己的 gain 以便淡入淡出；音效用音效匯流排），由 withTarget 切換
    let target = out;
    function withTarget(node, fn) { const prev = target; target = node; try { fn(); } finally { target = prev; } }
    function gainNode(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
    function route(node, pan, wet) {
      let n = node;
      if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
      n.connect(target);
      if (wet) { const w = gainNode(wet); n.connect(w); w.connect(verb); }
    }
    // ADSR：a 起音、d 衰減到 s（比例）、總長 dur 後 r 釋放
    function adsr(g, t, peak, a, d, s, dur, r) {
      const p = g.gain;
      p.setValueAtTime(0.0001, t);
      p.linearRampToValueAtTime(peak, t + a);
      p.setTargetAtTime(peak * s, t + a, d / 3);
      p.setTargetAtTime(0.0001, t + Math.max(dur, a + 0.01), r / 4);
    }
    function osc(type, f, t, end, detune) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
      if (detune) o.detune.value = detune;
      o.start(t); o.stop(end); return o;
    }
    function vibrato(o, f, t, end, depth, rate, delay) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = rate || 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * (depth || 0.005), t + (delay || 0.25));
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(end);
    }
    function lp(freq, q) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.7; return f; }
    function bp(freq, q) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1; return f; }
    function hp(freq) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq; return f; }
    const noiseBuf = (function () {
      const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return b;
    })();
    function noiseSrc(t, end) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random()); s.stop(end); return s; }

    // ---------- 樂器（note(t, midi, durSec, vel, pan)） ----------
    const I = {
      // 弦樂合奏：三把去諧的鋸齒波，慢起音、延遲顫音
      strings: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + dur + 0.6, g = gainNode(0), fl = lp(2600, 0.5);
        [-8, 0, 7].forEach(function (dt) { const o = osc('sawtooth', f, t, end, dt); vibrato(o, f, t, end, 0.004, 5.5, 0.35); o.connect(fl); });
        fl.connect(g); adsr(g, t, 0.05 * vel, 0.14, 0.3, 0.85, dur, 0.5); route(g, pan, 0.45);
      },
      violin: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + dur + 0.4, g = gainNode(0), fl = lp(4200, 0.8);
        [-5, 5].forEach(function (dt) { const o = osc('sawtooth', f, t, end, dt); vibrato(o, f, t, end, 0.007, 5.8, 0.2); o.connect(fl); });
        fl.connect(g); adsr(g, t, 0.07 * vel, 0.06, 0.2, 0.8, dur, 0.3); route(g, pan, 0.4);
      },
      cello: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + dur + 0.4, g = gainNode(0), fl = lp(1100, 0.7);
        [-6, 6].forEach(function (dt) { osc('sawtooth', f, t, end, dt).connect(fl); });
        fl.connect(g); adsr(g, t, 0.09 * vel, 0.08, 0.3, 0.8, dur, 0.3); route(g, pan, 0.25);
      },
      pizz: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + 0.5, g = gainNode(0), fl = lp(1800);
        osc('triangle', f, t, end).connect(fl); osc('sawtooth', f, t, end).connect(fl);
        fl.connect(g); adsr(g, t, 0.09 * vel, 0.004, 0.15, 0.0001, 0.05, 0.2); route(g, pan, 0.35);
      },
      // 銅管：濾波器包絡模擬「吹開」的亮度
      brass: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + dur + 0.4, g = gainNode(0), fl = lp(500, 1.2);
        fl.frequency.setValueAtTime(500, t); fl.frequency.linearRampToValueAtTime(3200 * vel + 800, t + 0.07); fl.frequency.setTargetAtTime(1800, t + 0.08, 0.2);
        [-4, 4].forEach(function (dt) { const o = osc('sawtooth', f, t, end, dt); vibrato(o, f, t, end, 0.003, 5, 0.4); o.connect(fl); });
        fl.connect(g); adsr(g, t, 0.06 * vel, 0.05, 0.2, 0.8, dur, 0.25); route(g, pan, 0.4);
      },
      horn: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + dur + 0.5, g = gainNode(0), fl = lp(900, 0.9);
        osc('sawtooth', f, t, end).connect(fl); osc('triangle', f, t, end).connect(fl);
        fl.connect(g); adsr(g, t, 0.07 * vel, 0.09, 0.3, 0.85, dur, 0.4); route(g, pan, 0.5);
      },
      // 長笛：正弦為主，加一點三角波泛音和起音氣聲
      flute: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + dur + 0.3, g = gainNode(0);
        const o = osc('sine', f, t, end); vibrato(o, f, t, end, 0.006, 5, 0.3); o.connect(g);
        const o2 = osc('triangle', f * 2, t, end); const g2 = gainNode(0.12); o2.connect(g2); g2.connect(g);
        const n = noiseSrc(t, t + 0.12), nb = bp(f * 2, 3), ng = gainNode(0); n.connect(nb); nb.connect(ng); adsr(ng, t, 0.05 * vel, 0.01, 0.05, 0.0001, 0.02, 0.05); route(ng, pan, 0.3);
        adsr(g, t, 0.16 * vel, 0.05, 0.2, 0.85, dur, 0.2); route(g, pan, 0.55);
      },
      oboe: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + dur + 0.3, g = gainNode(0), fl = bp(f * 3, 0.8);
        const o = osc('square', f, t, end); vibrato(o, f, t, end, 0.005, 5.5, 0.25); o.connect(fl);
        fl.connect(g); adsr(g, t, 0.2 * vel, 0.04, 0.15, 0.8, dur, 0.2); route(g, pan, 0.45);
      },
      // 豎琴：兩個泛音、長衰減
      harp: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + 1.8, g = gainNode(0);
        osc('triangle', f, t, end).connect(g);
        const o2 = osc('sine', f * 2, t, end), g2 = gainNode(0.3); o2.connect(g2); g2.connect(g);
        adsr(g, t, 0.12 * vel, 0.003, 0.9, 0.0001, 0.05, 0.6); route(g, pan, 0.6);
      },
      // 鐘琴／鋼片琴：非整數泛音
      bell: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + 2.2, g = gainNode(0);
        [[1, 1], [2.76, 0.35], [5.4, 0.15]].forEach(function (p) { const o = osc('sine', f * p[0], t, end), gg = gainNode(p[1]); o.connect(gg); gg.connect(g); });
        adsr(g, t, 0.12 * vel, 0.002, 1.1, 0.0001, 0.05, 0.8); route(g, pan, 0.7);
      },
      marimba: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + 0.8, g = gainNode(0);
        osc('sine', f, t, end).connect(g); const o2 = osc('sine', f * 4, t, end), g2 = gainNode(0.2); o2.connect(g2); g2.connect(g);
        adsr(g, t, 0.18 * vel, 0.002, 0.35, 0.0001, 0.03, 0.3); route(g, pan, 0.35);
      },
      // 合唱「啊」：鋸齒波經過兩個共振峰
      choir: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + dur + 0.8, g = gainNode(0), mix = gainNode(1);
        [-6, 6].forEach(function (dt) { const o = osc('sawtooth', f, t, end, dt); vibrato(o, f, t, end, 0.004, 4.8, 0.4); o.connect(mix); });
        [[750, 0.6], [1150, 0.4], [2600, 0.12]].forEach(function (fm) { const b = bp(fm[0], 6), gg = gainNode(fm[1]); mix.connect(b); b.connect(gg); gg.connect(g); });
        adsr(g, t, 0.22 * vel, 0.3, 0.4, 0.9, dur, 0.7); route(g, pan, 0.7);
      },
      bass: function (t, m, dur, vel, pan) {
        const f = mtof(m), end = t + dur + 0.3, g = gainNode(0), fl = lp(500);
        osc('triangle', f, t, end).connect(fl); osc('sawtooth', f, t, end).connect(fl);
        fl.connect(g); adsr(g, t, 0.12 * vel, 0.02, 0.2, 0.7, dur, 0.15); route(g, 0, 0.1);
      },
      // ---- 打擊 ----
      timpani: function (t, m, dur, vel) {
        const f = mtof(m), end = t + 1.6, g = gainNode(0), o = osc('sine', f * 1.02, t, end);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.1); o.connect(g);
        const n = noiseSrc(t, t + 0.3), nf = lp(400), ng = gainNode(0); n.connect(nf); nf.connect(ng); adsr(ng, t, 0.25 * vel, 0.002, 0.1, 0.0001, 0.02, 0.1); route(ng, 0, 0.3);
        adsr(g, t, 0.35 * vel, 0.003, 0.6, 0.0001, 0.05, 0.8); route(g, 0, 0.35);
      },
      timpRoll: function (t, m, dur, vel) { for (let x = 0; x < dur; x += 0.06) I.timpani(t + x, m, 0, vel * (0.4 + 0.6 * x / Math.max(dur, 0.01))); },
      snare: function (t, m, dur, vel) {
        const n = noiseSrc(t, t + 0.25), f = bp(2400, 0.7), g = gainNode(0); n.connect(f); f.connect(g);
        adsr(g, t, 0.18 * vel, 0.002, 0.08, 0.0001, 0.02, 0.1); route(g, 0, 0.25);
        const o = osc('triangle', 190, t, t + 0.1), og = gainNode(0); o.connect(og); adsr(og, t, 0.12 * vel, 0.002, 0.04, 0.0001, 0.01, 0.04); route(og, 0, 0.1);
      },
      bassDrum: function (t, m, dur, vel) {
        const o = osc('sine', 70, t, t + 0.7), g = gainNode(0); o.frequency.exponentialRampToValueAtTime(42, t + 0.3); o.connect(g);
        adsr(g, t, 0.45 * vel, 0.003, 0.35, 0.0001, 0.05, 0.3); route(g, 0, 0.3);
      },
      cymbal: function (t, m, dur, vel) {
        const n = noiseSrc(t, t + 2.5), f = hp(5500), g = gainNode(0); n.connect(f); f.connect(g);
        adsr(g, t, 0.09 * vel, 0.004, 1.4, 0.0001, 0.05, 1.2); route(g, 0, 0.5);
      },
      swell: function (t, m, dur, vel) {
        const n = noiseSrc(t, t + dur + 0.3), f = hp(4500), g = gainNode(0); n.connect(f); f.connect(g);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08 * vel, t + dur); g.gain.setTargetAtTime(0.0001, t + dur, 0.08); route(g, 0, 0.6);
      },
      shaker: function (t, m, dur, vel) {
        const n = noiseSrc(t, t + 0.08), f = hp(7000), g = gainNode(0); n.connect(f); f.connect(g);
        adsr(g, t, 0.05 * vel, 0.01, 0.03, 0.0001, 0.02, 0.03); route(g, 0.2, 0.1);
      },
      triangleBell: function (t, m, dur, vel) {
        const o = osc('sine', 4200, t, t + 1.2), g = gainNode(0); o.connect(g);
        adsr(g, t, 0.03 * vel, 0.001, 0.8, 0.0001, 0.02, 0.6); route(g, 0.3, 0.6);
      }
    };

    // ---------- 作曲 ----------
    // 和弦用音階級數表示（0＝I 級）。旋律用「動機」發展：2 小節動機 → 模進 → 新素材 → 終止式，固定種子，循環時完全相同。
    function degToMidi(song, d, oct) {
      const sc = SCALES[song.mode];
      return song.root + sc[((d % 7) + 7) % 7] + 12 * (oct + Math.floor(d / 7));
    }
    function chordTones(song, d) { return [degToMidi(song, d, 0), degToMidi(song, d + 2, 0), degToMidi(song, d + 4, 0)]; }

    // 節奏型（以 16 分音符為單位的起拍位置與長度），每首曲子挑一組，讓旋律有一致的性格
    const RHYTHMS = {
      lyrical: [[[0, 6], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 8]], [[0, 2], [2, 2], [4, 4], [8, 6], [14, 2]], [[0, 12], [12, 4]]],
      heroic:  [[[0, 3], [3, 1], [4, 4], [8, 3], [11, 1], [12, 4]], [[0, 8], [8, 4], [12, 4]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]], [[0, 12], [12, 4]]],
      dance:   [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 2], [6, 2], [8, 8]], [[0, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]], [[0, 8], [8, 8]]],
      waltz:   [[[0, 6], [6, 3], [9, 3]], [[0, 3], [3, 3], [6, 6]], [[0, 9], [9, 3]], [[0, 12]]],
      drive:   [[[0, 2], [2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 2], [12, 4]], [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 1], [1, 1], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 12], [12, 4]]]
    };

    function composeMelody(song, prog, rnd, endOnTonic) {
      const spb = song.meter * 4, rh = RHYTHMS[song.rhythm], notes = [];
      // 動機：第 1 小節的級數輪廓（相對和弦根音）
      const motif = [];
      const r0 = rh[0];
      let cur = 2;
      r0.forEach(function (n, i) { cur += i === 0 ? 0 : [1, -1, 2, -2, 0, 1][Math.floor(rnd() * 6)]; motif.push(cur); });
      let last = prog[0] + 4;
      prog.forEach(function (d, b) {
        const phrasePos = b % 4;
        let pattern, contour;
        if (phrasePos === 0) { pattern = r0; contour = motif; }                                   // 動機
        else if (phrasePos === 1) { pattern = r0; contour = motif.map(function (x) { return x + 1; }); } // 模進（高一級）
        else if (phrasePos === 2) { pattern = rh[2 % rh.length]; contour = null; }                  // 新素材
        else { pattern = rh[3 % rh.length]; contour = null; }                                       // 終止
        const tones = [d, d + 2, d + 4, d + 7];
        pattern.forEach(function (n, i) {
          let dg;
          if (contour) dg = d + contour[i % contour.length];
          else if (phrasePos === 3 && i === pattern.length - 1) dg = (endOnTonic && b === prog.length - 1) ? 7 : tones[Math.floor(rnd() * 3)];
          else dg = n[0] % 8 === 0 ? tones[Math.floor(rnd() * 3)] : last + (rnd() < 0.5 ? 1 : -1);
          while (dg - last > 5) dg -= 7;
          while (last - dg > 5) dg += 7;
          dg = Math.max(2, Math.min(11, dg));
          last = dg;
          notes.push({ step: b * spb + n[0], midi: degToMidi(song, dg, 1), len: n[1] });
        });
      });
      return notes;
    }

    // 伴奏型
    function accompany(song, sec, prog, startStep, ev, rnd) {
      const spb = song.meter * 4, o = sec.orch;
      prog.forEach(function (d, b) {
        const base = startStep + b * spb, ch = chordTones(song, d), root = ch[0] - 12;
        const push = function (s, inst, m, len, vel, pan) { (ev[base + s] = ev[base + s] || []).push({ i: inst, m: m, len: len, vel: vel, pan: pan || 0 }); };
        if (o.pad) ch.forEach(function (m, k) { push(0, o.pad, m, spb, 0.8, (k - 1) * 0.35); });
        if (o.low) push(0, o.low, root - 12, spb, 0.8, -0.2);
        if (o.arp) {
          const order = song.meter === 3 ? [0, 1, 2, 1, 2, 1] : [0, 1, 2, 3, 2, 1, 2, 1];
          const tones = [ch[0], ch[1], ch[2], ch[0] + 12];
          order.forEach(function (k, j) { push(j * 2, o.arp, tones[k] + 12, 2, 0.7 + (j === 0 ? 0.2 : 0), 0.3); });
        }
        if (o.waltz) { push(0, o.waltz, root, 4, 0.9, -0.2); [4, 8].forEach(function (s) { ch.forEach(function (m, k) { push(s, o.waltz, m + 12, 3, 0.5, (k - 1) * 0.3); }); }); }
        if (o.offbeat) [2, 6, 10, 14].forEach(function (s) { ch.forEach(function (m) { push(s, o.offbeat, m + 12, 2, 0.5, 0.2); }); });
        if (o.ostinato) for (let s = 0; s < spb; s += 2) push(s, o.ostinato, (s % 8 === 6 ? ch[2] : ch[0]), 2, s % 4 === 0 ? 0.9 : 0.6, -0.15);
        if (o.bass === 'walk') [0, 4, 8, 12].forEach(function (s, k) { push(s, 'bass', [root, ch[2] - 12, root + 12, ch[1] - 12][k], 4, 0.8); });
        else if (o.bass === 'drive') for (let s = 0; s < spb; s += 2) push(s, 'bass', root + (s % 4 ? 12 : 0), 2, 0.8);
        else if (o.bass) push(0, 'bass', root, spb, 0.8);
        if (o.stabs) [3, 7, 11].forEach(function (s) { if (s < spb) ch.forEach(function (m, k) { push(s, o.stabs, m, 1, 0.8, (k - 1) * 0.3); }); });
        // 打擊
        const P = o.perc;
        if (P === 'march') { push(0, 'timpani', song.root - 12, 4, 0.8); [4, 6, 12].forEach(function (s) { push(s, 'snare', 0, 1, s === 4 ? 0.8 : 0.5); }); push(8, 'bassDrum', 0, 4, 0.6); }
        if (P === 'drive') { [0, 8].forEach(function (s) { push(s, 'bassDrum', 0, 4, 0.8); }); [4, 12].forEach(function (s) { push(s, 'snare', 0, 1, 0.9); }); [2, 10, 14].forEach(function (s) { push(s, 'snare', 0, 1, 0.35); }); push(0, 'timpani', root, 4, 0.7); }
        if (P === 'boss') { for (let s = 0; s < spb; s += 4) push(s, 'bassDrum', 0, 4, 0.9); [4, 12].forEach(function (s) { push(s, 'snare', 0, 1, 1); }); push(0, 'timpani', root, 4, 0.9); if (b % 4 === 0) push(0, 'cymbal', 0, 8, 0.8); }
        if (P === 'light') { push(0, 'triangleBell', 0, 4, b % 2 ? 0.4 : 0.7); }
        if (P === 'tropical') for (let s = 0; s < spb; s += 2) push(s, 'shaker', 0, 1, s % 4 ? 0.5 : 0.9);
        if (P === 'grand' && b % 4 === 0) { push(0, 'cymbal', 0, 8, 0.7); push(0, 'timpani', song.root - 12, 4, 0.9); }
        if (sec.swellEnd && b === prog.length - 1) push(0, 'swell', 0, spb, 0.8);
      });
    }

    // ---- 曲目（全部原創） ----
    // section：prog＝每小節和弦級數；orch＝配器；lead＝主旋律樂器（null＝沒有旋律）
    const SONGS = {
      title: { bpm: 84, meter: 4, root: 62, mode: 'major', rhythm: 'heroic', seed: 101, form: ['intro', 'A', 'B', 'A'], loopFrom: 1, sections: {
        intro: { prog: [0, 3, 4, 4], lead: null, orch: { pad: 'strings', low: 'cello', perc: 'grand', bass: true }, swellEnd: true },
        A: { prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: 'brass', orch: { pad: 'strings', arp: 'harp', bass: true, perc: 'march' } },
        B: { prog: [5, 3, 0, 4, 5, 3, 1, 4], lead: 'violin', orch: { pad: 'horn', arp: 'harp', bass: true, perc: 'grand' }, swellEnd: true } } },
      meadow: { bpm: 96, meter: 4, root: 60, mode: 'major', rhythm: 'lyrical', seed: 111, form: ['intro', 'A', 'A', 'B'], loopFrom: 1, sections: {
        intro: { prog: [0, 3, 0, 4], lead: null, orch: { arp: 'harp', pad: 'strings', perc: 'light' } },
        A: { prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: 'flute', orch: { arp: 'harp', pad: 'strings', bass: true, perc: 'light' } },
        B: { prog: [3, 4, 2, 5, 3, 4, 1, 4], lead: 'oboe', orch: { offbeat: 'pizz', pad: 'horn', bass: 'walk', perc: 'light' } } } },
      beach: { bpm: 88, meter: 4, root: 65, mode: 'major', rhythm: 'dance', seed: 121, form: ['A', 'A', 'B', 'A'], loopFrom: 0, sections: {
        A: { prog: [0, 5, 1, 4, 0, 5, 1, 4], lead: 'marimba', orch: { offbeat: 'harp', bass: 'walk', perc: 'tropical' } },
        B: { prog: [3, 2, 1, 4, 3, 2, 5, 4], lead: 'flute', orch: { offbeat: 'pizz', pad: 'strings', bass: 'walk', perc: 'tropical' } } } },
      volcano: { bpm: 116, meter: 4, root: 50, mode: 'harm', rhythm: 'heroic', seed: 131, form: ['intro', 'A', 'B'], loopFrom: 1, sections: {
        intro: { prog: [0, 0, 5, 4], lead: null, orch: { ostinato: 'cello', low: 'cello', perc: 'march' } },
        A: { prog: [0, 5, 6, 4, 0, 5, 3, 4], lead: 'horn', orch: { ostinato: 'cello', pad: 'strings', bass: true, perc: 'march' } },
        B: { prog: [5, 6, 0, 4, 5, 3, 1, 4], lead: 'brass', orch: { ostinato: 'cello', stabs: 'brass', bass: 'drive', perc: 'drive' }, swellEnd: true } } },
      snow: { bpm: 132, meter: 3, root: 57, mode: 'minor', rhythm: 'waltz', seed: 141, form: ['A', 'A', 'B', 'A'], loopFrom: 0, sections: {
        A: { prog: [0, 3, 6, 2, 5, 3, 4, 4], lead: 'bell', orch: { waltz: 'pizz', pad: 'strings', perc: 'light' } },
        B: { prog: [5, 6, 2, 0, 3, 1, 4, 4], lead: 'violin', orch: { waltz: 'harp', pad: 'strings', perc: 'light' } } } },
      sky: { bpm: 100, meter: 4, root: 62, mode: 'major', rhythm: 'heroic', seed: 151, form: ['intro', 'A', 'B', 'A'], loopFrom: 1, sections: {
        intro: { prog: [0, 3, 5, 4], lead: null, orch: { pad: 'choir', arp: 'harp', perc: 'grand' }, swellEnd: true },
        A: { prog: [0, 3, 5, 4, 0, 3, 4, 4], lead: 'brass', orch: { pad: 'strings', arp: 'harp', bass: true, perc: 'grand' } },
        B: { prog: [5, 3, 0, 4, 5, 3, 1, 4], lead: 'violin', orch: { pad: 'choir', arp: 'harp', bass: true, perc: 'march' } } } },
      battle: { bpm: 150, meter: 4, root: 52, mode: 'harm', rhythm: 'drive', seed: 161, form: ['intro', 'A', 'B'], loopFrom: 1, sections: {
        intro: { prog: [0, 0, 5, 4], lead: null, orch: { ostinato: 'violin', stabs: 'brass', bass: 'drive', perc: 'drive' } },
        A: { prog: [0, 5, 2, 6, 0, 5, 3, 4], lead: 'violin', orch: { ostinato: 'cello', stabs: 'brass', bass: 'drive', perc: 'drive' } },
        B: { prog: [5, 6, 0, 4, 5, 6, 1, 4], lead: 'brass', orch: { ostinato: 'cello', pad: 'strings', bass: 'drive', perc: 'drive' }, swellEnd: true } } },
      boss: { bpm: 160, meter: 4, root: 49, mode: 'harm', rhythm: 'drive', seed: 171, form: ['intro', 'A', 'B'], loopFrom: 1, sections: {
        intro: { prog: [0, 0, 0, 4], lead: null, orch: { pad: 'choir', ostinato: 'cello', perc: 'boss', bass: 'drive' } },
        A: { prog: [0, 6, 5, 4, 0, 6, 1, 4], lead: 'brass', orch: { pad: 'choir', ostinato: 'cello', stabs: 'horn', bass: 'drive', perc: 'boss' } },
        B: { prog: [5, 1, 4, 0, 5, 1, 4, 4], lead: 'violin', orch: { pad: 'choir', ostinato: 'violin', bass: 'drive', perc: 'boss' }, swellEnd: true } } }
    };

    // 把曲子展開成事件表：ev[step] = [{i, m, len, vel, pan}]
    function compose(name) {
      const song = SONGS[name];
      if (!song) return null;
      const rnd = seeded(song.seed), spb = song.meter * 4, ev = [];
      const melodies = {};
      let step = 0, loopStep = 0;
      song.form.forEach(function (secName, idx) {
        const sec = song.sections[secName];
        if (idx === song.loopFrom) loopStep = step;
        accompany(song, sec, sec.prog, step, ev, rnd);
        if (sec.lead) {
          // 同名段落重複時用同一段旋律（A 段回來時聽得出是「同一首」）
          melodies[secName] = melodies[secName] || composeMelody(song, sec.prog, rnd, idx === song.form.length - 1);
          melodies[secName].forEach(function (n) { (ev[step + n.step] = ev[step + n.step] || []).push({ i: sec.lead, m: n.midi, len: n.len, vel: 0.9, pan: 0 }); });
          // 第二次出現時加一個高八度的對位（弦樂），讓重複不單調
          if (song.form.indexOf(secName) !== idx) melodies[secName].forEach(function (n, k) {
            if (k % 2 === 0) (ev[step + n.step] = ev[step + n.step] || []).push({ i: 'strings', m: n.midi - 12 + 4, len: n.len, vel: 0.5, pan: -0.3 });
          });
        }
        step += sec.prog.length * spb;
      });
      return { song: song, ev: ev, total: step, loop: loopStep, beat: 60 / song.bpm / 4 };
    }
    function playEvent(e, t, beat, node) { const f = I[e.i]; if (f) withTarget(node || out, function () { f(t, e.m, e.len * beat, e.vel, e.pan); }); }
    function playSound(name, t, node) { const f = S[name]; if (f) withTarget(node || out, function () { f(t); }); return !!f; }

    // ---------- 音效（同名覆蓋 8-bit 版本，呼叫端不用改） ----------
    const C = function (n) { return 60 + n; };
    function seq(t, inst, notes, vel) { notes.forEach(function (n) { I[inst](t + n[0], n[1], n[2], vel || 1, n[3] || 0); }); }
    const S = {
      coin: function (t) { I.bell(t, C(24), 0.1, 0.5); I.bell(t + 0.06, C(31), 0.1, 0.4); },
      crit: function (t) { seq(t, 'bell', [[0, C(24), 0.1], [0.05, C(28), 0.1], [0.1, C(31), 0.1], [0.15, C(36), 0.3]], 0.7); I.snare(t, 0, 0, 0.5); },
      buy: function (t) { I.harp(t, C(19), 0.2, 0.8); I.harp(t + 0.05, C(24), 0.2, 0.8); },
      levelup: function (t) { I.harp(t, C(24), 0.2, 0.7); I.harp(t + 0.04, C(28), 0.2, 0.6); },
      // 里程碑：原創的短號角（約 1.2 秒）
      milestone: function (t) { seq(t, 'brass', [[0, C(7), 0.12], [0.12, C(12), 0.12], [0.24, C(16), 0.12], [0.36, C(19), 0.6]], 0.9); I.timpani(t + 0.36, C(-12), 0, 0.7); I.cymbal(t + 0.36, 0, 0, 0.5); },
      merge: function (t) { I.swell(t, 0, 0.5, 1); seq(t + 0.5, 'bell', [[0, C(19), 0.2], [0.08, C(24), 0.2], [0.16, C(28), 0.5]], 0.8); I.choir(t + 0.5, C(12), 0.8, 0.6); },
      achievement: function (t) { seq(t, 'bell', [[0, C(19), 0.15], [0.1, C(24), 0.15], [0.2, C(28), 0.4]], 0.8); I.strings(t + 0.2, C(16), 0.6, 0.6); },
      visitor: function (t) { I.bell(t, C(31), 0.1, 0.5); I.bell(t + 0.12, C(36), 0.1, 0.4); },
      caught: function (t) { seq(t, 'bell', [[0, C(24), 0.1], [0.06, C(28), 0.1], [0.12, C(31), 0.1], [0.18, C(36), 0.4]], 0.8); I.cymbal(t, 0, 0, 0.3); },
      purchase: function (t) { seq(t, 'harp', [[0, C(12), 0.2], [0.06, C(16), 0.2], [0.12, C(19), 0.2], [0.18, C(24), 0.2], [0.24, C(28), 0.6]], 0.9); I.strings(t + 0.24, C(16), 0.8, 0.7); },
      eggShake: function (t) { I.marimba(t, C(-5), 0.1, 0.6); },
      reveal_N: function (t) { I.harp(t, C(19), 0.3, 0.7); },
      reveal_R: function (t) { seq(t, 'harp', [[0, C(16), 0.2], [0.08, C(21), 0.4]], 0.8); },
      reveal_SR: function (t) { I.swell(t, 0, 0.25, 0.6); seq(t + 0.25, 'bell', [[0, C(12), 0.2], [0.07, C(16), 0.2], [0.14, C(19), 0.2], [0.21, C(24), 0.6]], 0.9); I.strings(t + 0.25, C(12), 0.9, 0.6); },
      reveal_SSR: function (t) { I.swell(t, 0, 0.4, 1); seq(t + 0.4, 'brass', [[0, C(12), 0.15], [0.15, C(16), 0.15], [0.3, C(19), 0.9]], 1); I.cymbal(t + 0.4, 0, 0, 0.8); I.timpani(t + 0.4, C(-12), 0, 0.9); I.strings(t + 0.7, C(24), 1, 0.7); },
      reveal_UR: function (t) { I.timpRoll(t, C(-12), 0.7, 0.8); I.swell(t, 0, 0.8, 1); seq(t + 0.8, 'brass', [[0, C(12), 0.12], [0.12, C(16), 0.12], [0.24, C(19), 0.12], [0.36, C(24), 1.2]], 1); I.choir(t + 0.8, C(12), 1.6, 0.8); I.cymbal(t + 1.16, 0, 0, 1); },
      reveal_LR: function (t) {
        [0, 0.45, 0.9].forEach(function (d, k) { I.bell(t + d, [C(12), C(19), C(24)][k], 1, 1); });
        I.choir(t + 0.9, C(12), 2.4, 0.9); I.choir(t + 0.9, C(19), 2.4, 0.7);
        seq(t + 1.4, 'brass', [[0, C(12), 0.15], [0.15, C(16), 0.15], [0.3, C(19), 0.15], [0.45, C(24), 1.6]], 1);
        I.timpRoll(t + 0.9, C(-12), 0.5, 0.7); I.cymbal(t + 1.85, 0, 0, 1);
      },
      hit: function (t) { I.snare(t, 0, 0, 0.6); },
      hitCrit: function (t) { I.snare(t, 0, 0, 1); I.bassDrum(t, 0, 0, 0.6); I.bell(t, C(31), 0.1, 0.4); },
      // 勝利號角（原創，約 3 秒）
      victory: function (t) {
        seq(t, 'brass', [[0, C(12), 0.12], [0.14, C(12), 0.12], [0.28, C(12), 0.12], [0.42, C(16), 0.3], [0.78, C(14), 0.2], [1.0, C(19), 1.2]], 1);
        seq(t, 'strings', [[0.42, C(4), 0.3], [0.78, C(5), 0.2], [1.0, C(7), 1.4]], 0.8);
        I.timpani(t + 0.42, C(-12), 0, 0.8); I.timpani(t + 1.0, C(-5), 0, 1); I.cymbal(t + 1.0, 0, 0, 0.9);
      },
      defeat: function (t) { seq(t, 'oboe', [[0, C(7), 0.4], [0.4, C(3), 0.4], [0.8, C(0), 1.2]], 0.8); I.strings(t, C(-12), 2, 0.6); },
      bossBreak: function (t) { I.bassDrum(t, 0, 0, 1); I.cymbal(t, 0, 0, 1); I.swell(t, 0, 0.4, 0.8); seq(t + 0.4, 'brass', [[0, C(19), 0.15], [0.15, C(24), 0.8]], 1); I.choir(t + 0.4, C(12), 1.2, 0.7); },
      prestige: function (t) { I.swell(t, 0, 1.2, 1); I.choir(t, C(0), 2.5, 0.7); I.choir(t, C(7), 2.5, 0.6); seq(t + 1.2, 'bell', [[0, C(24), 0.4], [0.15, C(28), 0.4], [0.3, C(31), 0.4], [0.45, C(36), 1]], 1); I.cymbal(t + 1.2, 0, 0, 0.8); },
      zone: function (t) { seq(t, 'horn', [[0, C(7), 0.3], [0.3, C(12), 0.3], [0.6, C(16), 0.9]], 0.9); I.harp(t + 0.6, C(19), 0.4, 0.7); I.timpani(t + 0.6, C(-12), 0, 0.6); },
      fanfare: function (t) {
        seq(t, 'brass', [[0, C(7), 0.15], [0.17, C(12), 0.15], [0.34, C(16), 0.15], [0.51, C(19), 0.9]], 1);
        seq(t + 0.17, 'horn', [[0, C(4), 0.15], [0.17, C(7), 0.15], [0.34, C(12), 0.9]], 0.8);
        I.timpani(t + 0.51, C(-12), 0, 0.9); I.cymbal(t + 0.51, 0, 0, 0.8);
      },
      weak: function (t) { I.bell(t, C(28), 0.08, 0.5); },
      'break': function (t) { I.bassDrum(t, 0, 0, 1); I.cymbal(t, 0, 0, 0.9); seq(t + 0.05, 'brass', [[0, C(19), 0.1], [0.1, C(16), 0.1], [0.2, C(24), 0.5]], 1); },
      // 休息（離線收益領取）：原創的溫柔小曲，約 3 秒
      rest: function (t) { seq(t, 'harp', [[0, C(12), 0.4], [0.25, C(16), 0.4], [0.5, C(19), 0.4], [0.75, C(24), 1.4]], 0.8); seq(t, 'flute', [[0, C(28), 0.5], [0.5, C(26), 0.5], [1.0, C(24), 1.4]], 0.7); I.strings(t, C(0), 2.4, 0.5); },
      // ---- 介面 ----
      ui_cursor: function (t) { I.bell(t, C(36), 0.03, 0.32); },
      ui_confirm: function (t) { I.bell(t, C(31), 0.05, 0.3); I.bell(t + 0.04, C(36), 0.05, 0.25); },
      ui_cancel: function (t) { I.bell(t, C(31), 0.05, 0.25); I.bell(t + 0.04, C(26), 0.05, 0.2); },
      ui_buzz: function (t) { const g = gainNode(0), o = osc('square', 110, t, t + 0.25), f = lp(900); o.connect(f); f.connect(g); adsr(g, t, 0.06, 0.005, 0.1, 0.6, 0.15, 0.05); route(g, 0, 0); },
      ui_open: function (t) { I.harp(t, C(24), 0.1, 0.35); I.harp(t + 0.03, C(31), 0.1, 0.3); },
      ui_close: function (t) { I.harp(t, C(31), 0.1, 0.28); I.harp(t + 0.03, C(24), 0.1, 0.24); }
    };
    // 會讓背景音樂暫時壓低的長音效（秒）
    const JINGLES = { victory: 3.2, milestone: 1.3, prestige: 3, rest: 3, reveal_UR: 2.6, reveal_LR: 3.6, reveal_SSR: 1.8, zone: 1.6, defeat: 2.2, fanfare: 1.6 };

    return { sounds: S, songs: SONGS, compose: compose, playEvent: playEvent, playSound: playSound, jingles: JINGLES, instruments: I };
  };
})();
