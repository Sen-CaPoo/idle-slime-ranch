// 無頭 Chrome 截圖：node tools/shot.js <相對於專案的頁面> <輸出 png> [寬] [高] [等待毫秒] [CPU 節流倍率] [要執行的 JS]（ccline-0b）
// 用 file:// 開啟，回傳 console 錯誤、例外和頁面上 #info 的文字（展示頁的 fps）
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');
const [page, out, w = 1366, h = 800, wait = 3000, cpu = 1, js = ''] = process.argv.slice(2);
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const port = 9500 + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-angle=d3d11', '--enable-gpu',
    '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets;
    for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(200); } }
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    let id = 0; const pending = {}; const errors = [];
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
      if (m.method === 'Runtime.exceptionThrown') errors.push('例外：' + (m.params.exceptionDetails.exception || {}).description);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console：' + m.params.args.map(a => a.value || a.description).join(' '));
    });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
    if (+cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: +cpu });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: 'file:///' + path.resolve(__dirname, '..', page).replace(/\\/g, '/') });
    await sleep(+wait);
    if (js) { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }); console.log('JS：', JSON.stringify(r.result.result.value)); await sleep(1500); }
    const info = await send('Runtime.evaluate', { expression: `(document.getElementById('info') || {}).textContent || ''`, returnByValue: true });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
    console.log('info：', info.result.result.value);
    console.log(errors.length ? errors.join('\n') : '沒有錯誤');
    ws.close();
  } finally { chrome.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
