// 把現代風格的配樂與音效離線渲染成 WAV，方便試聽與檢查音量（ccline-a3）
// 用法：node tools/render-music.js [輸出資料夾] [每首秒數=24]
// 用 headless Chrome 的 OfflineAudioContext 執行 js/audio-modern.js，輸出每首曲子和主要音效的 .wav，並列出峰值與 RMS。
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const OUT = process.argv[2] || path.join(os.tmpdir(), 'music');
const SEC = +process.argv[3] || 24;
const ROOT = path.resolve(__dirname, '..');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

// 在頁面裡執行：渲染一段，回傳 WAV 的 base64 與統計
const RENDER = `async function renderClip(kind, name, sec) {
  const SR = 44100, oc = new OfflineAudioContext(2, Math.ceil(SR * sec), SR);
  const comp = oc.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.connect(oc.destination);
  const out = oc.createGain(); out.gain.value = kind === 'song' ? 0.5 * 0.22 / 0.11 : 0.5 * 0.3 / 0.15; out.connect(comp);
  const len = Math.floor(SR * 2.2), ir = oc.createBuffer(2, len, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5); }
  const verb = oc.createConvolver(); verb.buffer = ir; const wet = oc.createGain(); wet.gain.value = 0.35; verb.connect(wet); wet.connect(out);
  const M = window.AudioModern(oc, out, verb);
  if (kind === 'song') {
    const c = M.compose(name); let t = 0.05, step = 0;
    while (t < sec - 0.5) { (c.ev[step] || []).forEach(e => M.playEvent(e, t, c.beat, out)); t += c.beat; step++; if (step >= c.total) step = c.loop; }
  } else M.playSound(name, 0.05, out);
  const buf = await oc.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 0, sum = 0;
  for (let i = 0; i < L.length; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); if (a > peak) peak = a; sum += L[i] * L[i] + R[i] * R[i]; }
  const rms = Math.sqrt(sum / (L.length * 2));
  // 16-bit PCM WAV
  const n = L.length, bytes = new ArrayBuffer(44 + n * 4), v = new DataView(bytes);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { v.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); v.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
  let bin = ''; const u8 = new Uint8Array(bytes); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(bin), peak: +peak.toFixed(3), rms: +rms.toFixed(4) };
}`;

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mus-'));
  const port = 9500 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--allow-file-access-from-files', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) { /* 已結束 */ } });
  let targets;
  for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(200); } }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = {};
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text); return r.result.result.value; };
  await send('Runtime.enable');
  await ev(fs.readFileSync(path.join(ROOT, 'js', 'audio-modern.js'), 'utf8') + ';0');
  await ev(RENDER + ';window.renderClip = renderClip; 0');
  const songs = await ev('Object.keys(window.AudioModern(new OfflineAudioContext(1, 100, 44100), null, null).songs)');
  const sounds = ['victory', 'milestone', 'rest', 'fanfare', 'reveal_SSR', 'reveal_UR', 'reveal_LR', 'break', 'bossBreak', 'ui_confirm', 'ui_cursor', 'ui_buzz'];
  const rows = [];
  for (const s of songs) { const r = await ev(`renderClip('song', '${s}', ${SEC})`); fs.writeFileSync(path.join(OUT, `bgm_${s}.wav`), Buffer.from(r.b64, 'base64')); rows.push(['bgm', s, r.peak, r.rms]); }
  for (const s of sounds) { const r = await ev(`renderClip('sfx', '${s}', 4)`); fs.writeFileSync(path.join(OUT, `sfx_${s}.wav`), Buffer.from(r.b64, 'base64')); rows.push(['sfx', s, r.peak, r.rms]); }
  console.log('種類 名稱 峰值 RMS');
  rows.forEach(r => console.log(r.join('  ') + (r[2] >= 0.99 ? '  ⚠ 可能破音' : r[3] < 0.005 ? '  ⚠ 幾乎無聲' : '')));
  console.log('輸出：' + OUT);
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
