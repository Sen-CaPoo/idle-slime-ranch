// 最終瀏覽器回歸：file:// 直接開啟 index.html → 標題畫面 → 點擊開始 → 遊戲，檢查 hd2d、例外、fps、過曝（ccline-0b）
// 用法：node tools/regress-browser.js [輸出截圖的資料夾]
// 每個情境用全新的 Chrome 設定檔（等於第一次開遊戲的玩家）
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const OUT = process.argv[2] || os.tmpdir();
const FILE_URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(name, { width, height, dpr, mobile, cpu }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-'));
  const p = 9400 + Math.floor(Math.random() * 500);   // 隨機埠號：多個 session 同時跑時不會撞到
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${p}`, `--user-data-dir=${profile}`,
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${p}/json`)).json(); } catch (e) { await sleep(200); } }
  // 不論成功或失敗都要關掉 Chrome
  try { return await drive(name, chrome, targets, { width, height, dpr, mobile, cpu }); } finally { chrome.kill(); }
}
// 等到條件成立（輪詢），上限 ms 毫秒
async function waitFor(ev, expr, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await ev(expr)) return true; await sleep(200); }
  return false;
}
async function drive(name, chrome, targets, { width, height, dpr, mobile, cpu }) {
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = {}; const exceptions = []; const consoleErr = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; exceptions.push((d.exception && d.exception.description || d.text).split('\n')[0]); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErr.push(m.params.args.map(a => a.value || a.description).join(' ').slice(0, 160));
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.result.value; };
  const shot = async file => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64')); return file; };
  const fps = async sec => {
    const r = await ev(`new Promise(res => { const t = []; const end = performance.now() + ${sec * 1000};
      (function f(now) { t.push(now); if (now < end) requestAnimationFrame(f); else res(t); })(performance.now()); })`);
    const dts = r.slice(1).map((x, i) => x - r[i]).sort((a, b) => a - b);
    return { avg: +(1000 / (dts.reduce((a, b) => a + b, 0) / dts.length)).toFixed(1), p95ms: +dts[Math.floor(dts.length * 0.95)].toFixed(1) };
  };

  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  if (cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: FILE_URL });
  await waitFor(ev, `!!document.querySelector('.title-start') && !!window.HD2D`, 15000);
  await sleep(500);

  const res = { name };
  res.title = await ev(`({ titleShown: !!document.querySelector('.title-start'), hd2d: !!(window.HD2D && HD2D.ready && HD2D.ready()),
    quality: window.HD2D && HD2D.getQuality(), stage: (s => s && s.width + 'x' + s.height)(document.getElementById('stage')) })`);
  res.titleFps = await fps(3);
  res.titleShot = await shot(`regress_${name}_title.png`);
  // 點擊開始：點標題文字（找不到就點畫面中央）
  const pt = await ev(`(() => { const e = document.querySelector('.title-start') || document.getElementById('stage'); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  // 等標題消失，並關掉開局彈窗（登入獎勵等），直到沒有彈窗為止（上限 10 秒）
  await waitFor(ev, `!document.querySelector('.title-start')`, 10000);
  await waitFor(ev, `(() => { document.querySelectorAll('.px-modal button').forEach(b => { if (/領取|好|收下|下次|稍後|知道|開始|關閉/.test(b.textContent)) b.click(); }); return !document.querySelector('.px-modal'); })()`, 10000);
  await sleep(800);
  res.game = await ev(`({ titleGone: !document.querySelector('.title-start'), hd2d: !!(window.HD2D && HD2D.ready && HD2D.ready()), quality: window.HD2D && HD2D.getQuality(),
    gold: Math.floor(Game.state.gold), slimes: Game.state.slimes.length, saveVersion: Game.state.saveVersion })`);
  res.gameFps = await fps(4);
  const m = await ev(`window.HD2D && HD2D.measure ? HD2D.measure() : null`);
  if (m) res.overexposed = (m.white * 100).toFixed(2) + '%';
  res.gameShot = await shot(`regress_${name}_game.png`);
  res.quality = await ev(`window.HD2D && HD2D.getQuality()`);
  res.exceptions = exceptions; res.consoleErrors = consoleErr;
  ws.close();
  return res;
}

(async () => {
  const cases = [
    ['desktop', { width: 1366, height: 800, dpr: 1, mobile: false, cpu: 1 }],
    ['mobile', { width: 412, height: 915, dpr: 2.625, mobile: true, cpu: 1 }],
    ['mobileCpu4', { width: 412, height: 915, dpr: 2.625, mobile: true, cpu: 4 }]
  ];
  for (const [name, opt] of cases) {
    const r = await run(name, opt);
    console.log(JSON.stringify(r, null, 1));
  }
})().catch(e => { console.error(e); process.exit(1); });
