// 手機效能實測：用 Chrome DevTools Protocol 模擬行動裝置＋CPU 節流，觀察 hd2d 自動降級（ccline-0b）
// 用法：node tools/perf-mobile.js [cpu節流倍率=4] [秒數=25] [url]
// GPU=swiftshader 時改用軟體 GPU，模擬很弱的手機 GPU（DevTools 只能節流 CPU，不能節流 GPU）
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const RATE = +process.argv[2] || 4;
const SECONDS = +process.argv[3] || 25;
const URL = process.argv[4] || 'http://127.0.0.1:8131/index.html';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const PORT = 9333;

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    process.env.GPU === 'swiftshader' ? '--use-angle=swiftshader' : '--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', 'about:blank'
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch (e) { await sleep(200); }
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = {};
  const exceptions = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;

  // 中階 Android 手機：412×915、DPR 2.625、觸控
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: URL });
  await sleep(3000);

  const info = await evalJs(`(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const ext = c && c.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: !!c, renderer: c ? c.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : c.RENDERER) : null,
      hd2d: !!(window.HD2D && HD2D.ready && HD2D.ready()), quality: window.HD2D && HD2D.getQuality(), settings: window.Game && Game.settings && Game.settings() };
  })()`);
  console.log(`CPU 節流 ×${RATE}，行動裝置 412×915 @2.625x`);
  console.log('GPU:', info.renderer, '| WebGL2:', info.webgl2, '| HD2D 啟用:', info.hd2d, '| 起始畫質:', info.quality);

  // 每秒記錄一次 fps 和畫質
  const log = [];
  for (let s = 1; s <= SECONDS; s++) {
    await sleep(1000);
    const v = await evalJs(`(() => ({ fps: window.HD2D ? +HD2D.stats.fps.toFixed(1) : null, ms: window.HD2D ? +HD2D.stats.ms.toFixed(2) : null,
      q: window.HD2D && HD2D.getQuality(), saved: window.Game && Game.settings && Game.settings().quality }))()`);
    log.push(v);
    console.log(`${String(s).padStart(2)}s  fps ${String(v.fps).padStart(5)}  合成 ${v.ms}ms  畫質 ${v.q}  存檔 ${v.saved}`);
  }
  const changes = log.map((v, i) => i && v.q !== log[i - 1].q ? `${i + 1}s: ${log[i - 1].q} → ${v.q}` : null).filter(Boolean);
  console.log('畫質變化：', changes.length ? changes.join('、') : '沒有變化');
  console.log('JS 例外：', exceptions.length ? exceptions.slice(0, 5).join(' | ') : '無');
  ws.close();
  chrome.kill();
})().catch(e => { console.error(e); process.exit(1); });
