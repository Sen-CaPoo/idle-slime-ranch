// 扭蛋揭曉效能量測：神諭十連（強制全 UR 以上）與百連，在 CPU 節流下量 fps（ccline-a3）
// 用法：node tools/perf-gacha.js [截圖資料夾] [CPU 節流倍數=4]。標準：平均 ≥50fps、p95 ≤33ms（DESIGN-v2 §10）
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const OUT = process.argv[2] || os.tmpdir();
const CPU = +process.argv[3] || 4;
const FILE_URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ux-'));
  const port = 9500 + Math.floor(Math.random() * 400); // 隨機 port，避免和其他同時在跑的測試衝突
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(200); } }
  // 不論成功或失敗，結束時都關掉這個 Chrome
  process.on('exit', () => { try { chrome.kill(); } catch (e) { /* 已結束 */ } });
  if (!targets) throw new Error('Chrome 沒有在 port ' + port + ' 啟動');
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = {}; const exceptions = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; exceptions.push((d.exception && d.exception.description || d.text).split('\n')[0]); }
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(expr.slice(0, 80) + ' → ' + r.result.exceptionDetails.text); return r.result.result.value; };
  const shot = async file => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64')); return path.join(OUT, file); };
  const closeModals = () => ev(`(() => { for (let i = 0; i < 5; i++) document.querySelectorAll('.px-modal button').forEach(b => { if (/領取|好|收下|下次|稍後|知道|關閉|等等|太好了/.test(b.textContent)) b.click(); }); })()`);
  const center = async sel => ev(`(() => { const e = ${sel}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const mouse = (type, p) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  // 點擊前先關掉自動彈窗（免費抽、新功能開放等），並確認點到的真的是目標按鈕
  const click = async sel => {
    await closeModals(); await sleep(150);
    // 標題淡出、自動彈窗可能還在進行：被遮住時關彈窗後重試，最多 10 秒
    for (let i = 0; i < 20; i++) {
      const p = await center(sel); if (!p) throw new Error('找不到 ' + sel);
      const hit = await ev(`(() => { const e = ${sel}; const h = document.elementFromPoint(${p.x}, ${p.y}); return !!(e && h && (e === h || e.contains(h))); })()`);
      if (hit) { await mouse('mousePressed', p); await mouse('mouseReleased', p); await sleep(250); return; }
      await closeModals(); await sleep(500);
    }
    throw new Error('目標一直被遮住：' + sel);
  };
  // 等到標題畫面消失、沒有彈窗，最多 10 秒
  const waitReady = async () => {
    for (let i = 0; i < 40; i++) {
      await closeModals();
      if (await ev(`!document.querySelector('.title-start') && !document.querySelector('.px-modal')`)) return;
      await sleep(250);
    }
  };
  const tab = name => click(`document.querySelector('[data-tab="${name}"]')`);
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? '✅' : '❌') + ' ' + name + (detail ? '  ' + detail : '')); };

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: FILE_URL });
  await sleep(3500);
  await click(`document.querySelector('.title-start') || document.getElementById('stage')`);
  await sleep(1000); await waitReady();

  const fps = async sec => {
    const r = await ev(`new Promise(res => { const t = []; const end = performance.now() + ${sec * 1000};
      (function f(now) { t.push(now); if (now < end) requestAnimationFrame(f); else res(t); })(performance.now()); })`);
    const d = r.slice(1).map((x, i) => x - r[i]).sort((a, b) => a - b);
    return { avg: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1) };
  };
  // 讓星輝／神諭抽卡時 Math.random 偏低 → 稀有度全部是最高或次高（只在 pull 期間生效）
  const rig = kind => ev(`(() => { const g = Game.gacha.${kind}; if (!g || g.__rigged) return; const orig = g.pull; g.pull = function () {
      const R = Math.random; let i = 0; Math.random = () => (i++ % 2 ? 0.2 : 0.01); try { return orig.apply(this, arguments); } finally { Math.random = R; } }; g.__rigged = true; })()`);
  const pressPull = async (kind, label) => {
    await ev(`Game.state.gems += 200000; Game.emit('change')`);
    await tab('gacha'); await sleep(400);
    await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /${kind === 'oracle' ? '神諭' : '星輝'}/.test(x.textContent) && !/抽|券/.test(x.textContent)); if (b) b.click(); })()`);
    await sleep(500);
    const ok = await ev(`(() => { const b = [...document.querySelectorAll('#panel button')].find(x => x.textContent.includes('${label}')); if (b) b.click(); return !!b; })()`);
    return ok;
  };
  await send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const base = await fps(2);
  console.log(`基準（牧場，CPU ×${CPU}）：`, JSON.stringify(base));
  const out = { base };
  for (const [kind, label, name] of [['oracle', '5400', '神諭十連（全高稀有）'], ['oracle', '54000', '神諭百連（全高稀有）']]) {
    await rig(kind);
    if (!(await pressPull(kind, label))) { console.log(`⏭ ${name}：找不到 ${label} 按鈕，略過`); continue; }
    const m = await fps(4);
    await shot(`perf_${label}.png`);
    const pass = m.avg >= 50 && m.p95 <= 33;
    console.log(`${pass ? '✅' : '❌'} ${name}：`, JSON.stringify(m));
    out[label] = m;
    await closeModals(); await ev(`document.querySelectorAll('[data-skip]').forEach(b => b.click())`); await sleep(1500); await closeModals();
  }
  console.log('JS 例外：', exceptions.length ? exceptions.slice(0, 3).join(' | ') : '無');
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });
