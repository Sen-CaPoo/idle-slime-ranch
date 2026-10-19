// v1.7 UX 驗收：按住升級、MAX、倉庫販賣、扭蛋自動販賣、遠征自動推關（ccline-a3）
// 用法：node tools/accept-ux.js [截圖資料夾]。用全新 Chrome 設定檔以 file:// 開 index.html，用真實滑鼠事件操作。
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const OUT = process.argv[2] || os.tmpdir();
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

  // ---- 1. 按住連續升級 ----
  await ev(`Game.addGold(1e9); Game.emit('change')`);
  await tab('ranch'); await sleep(400);
  const lvBtn = `document.querySelector('[data-act="lv"]')`;
  const lv0 = await ev(`Game.state.slimes[0].level`);
  await click(lvBtn);
  const lv1 = await ev(`Game.state.slimes[0].level`);
  check('短按升 1 級', lv1 === lv0 + 1, `${lv0} → ${lv1}`);
  await ev(`window.__evlog = []; for (const t of ['pointerdown','pointerup','pointercancel','blur','click','pointermove']) window.addEventListener(t, e => __evlog.push(t + '@' + Math.round(performance.now())), true); 0`);
  await closeModals(); await sleep(200);
  const p = await center(lvBtn);
  await mouse('mousePressed', p); await sleep(1500); await mouse('mouseReleased', p); await sleep(300);
  if (process.env.UX_DEBUG) console.log('事件：', await ev('__evlog.join(" ")'));
  const lv2 = await ev(`Game.state.slimes[0].level`);
  check('按住 1.5 秒連續升級', lv2 - lv1 >= 8, `+${lv2 - lv1} 級`);
  await sleep(600);
  const lv3 = await ev(`Game.state.slimes[0].level`);
  check('放開後停止', lv3 === lv2, `${lv2} → ${lv3}`);

  // ---- 2. MAX ----
  const maxLabel = await ev(`(document.querySelector('[data-act="lvmax"]') || {}).textContent`);
  const goldBefore = await ev(`Game.state.gold`);
  await click(`document.querySelector('[data-act="lvmax"]')`);
  const lv4 = await ev(`Game.state.slimes[0].level`);
  const left = await ev(`Game.levelUpMaxPreview(Game.state.slimes[0].uid).levels`);
  check('MAX 一鍵升到最大', lv4 - lv3 > 10 && left === 0, `標籤「${(maxLabel || '').trim()}」 +${lv4 - lv3} 級，剩餘可升 ${left}，金幣 ${goldBefore.toExponential(2)} → ${(await ev('Game.state.gold')).toExponential(2)}`);
  await ev(`Game.addGold(1e9); Game.emit('change')`);
  await tab('upgrade'); await sleep(400);
  const up0 = await ev(`JSON.stringify(Game.state.upgrades)`);
  await click(`document.querySelector('[data-act="upmax"]')`);
  const up1 = await ev(`JSON.stringify(Game.state.upgrades)`);
  check('牧場升級 MAX', up0 !== up1, `${up0} → ${up1}`);
  await shot('ux_1_upgrade.png');

  // ---- 3. 倉庫販賣 ----
  await ev(`(() => { for (let i = 0; i < 3; i++) { const s = Game.addSlime('purple', false, true); if (!s.stored) { Game.actions.toStorage(s.uid); } s.level = 10; }
    const f = Game.addSlime('fire', false, true); f.gacha = true; f.star = 1; if (!f.stored) Game.actions.toStorage(f.uid); Game.emit('change'); })()`);
  await tab('ranch'); await sleep(400);
  const st0 = await ev(`Game.state.storage.length`);
  const gold0 = await ev(`Game.state.gold`);
  await click(`document.querySelector('[data-act="sellJunk"]')`);
  const st1 = await ev(`Game.state.storage.length`);
  check('一鍵賣出魔晶 Lv10', st1 < st0 && (await ev('Game.state.gold')) > gold0, `倉庫 ${st0} → ${st1}`);
  const fireSel = `[...document.querySelectorAll('[data-act="sell"]')].find(b => { const sl = Game.state.storage.find(x => String(x.uid) === b.dataset.arg); return sl && sl.gacha; })`;
  const gems0 = await ev(`Game.state.gems`);
  await click(fireSel);
  const stillThere = await ev(`Game.state.storage.some(x => x.gacha)`);
  check('扭蛋角色第一次按不會賣', stillThere);
  await shot('ux_2_sell_confirm.png');
  await click(fireSel);
  const gems1 = await ev(`Game.state.gems`);
  check('第二次確認後賣出換寶石', !(await ev(`Game.state.storage.some(x => x.gacha)`)) && gems1 > gems0, `💎 ${gems0} → ${gems1}`);

  // ---- 4. 扭蛋自動販賣 ----
  await tab('gacha'); await sleep(400);
  await click(`document.querySelector('[data-act="autoSell"][data-arg="R"]')`);
  const mode = await ev(`Game.gacha.autoSell()`);
  check('自動販賣切換成 R', mode === 'R', mode);
  await ev(`Game.state.gems += 5000; Game.emit('change')`);
  const res = await ev(`(() => { let all = []; for (let i = 0; i < 3; i++) all = all.concat(Game.gacha.pull(10).results); return all; })()`);
  const rs = res.filter(r => r.rarity === 'R');
  check('R 結果全部自動賣出', rs.length > 0 && rs.every(r => r.sold), `${rs.length} 個 R，已賣 ${rs.filter(r => r.sold).length}`);
  check('SR/SSR 不會被賣', res.filter(r => r.rarity === 'SR' || r.rarity === 'SSR').every(r => !r.sold));
  await closeModals(); await sleep(300); await closeModals();

  // ---- 5. 遠征自動推關 ----
  await ev(`(() => { for (const t of ['fire', 'green', 'blue', 'king', 'ice']) { const s = Game.addSlime(t, true); s.level = 40; } Game.addGold(1e9); Game.dungeon.unlocked(); Game.emit('change'); })()`);
  await closeModals(); await tab('dungeon'); await sleep(500); await closeModals();
  const c0 = await ev(`Game.dungeon.cleared()`);
  await click(`document.querySelector('[data-act="autoToggle"]')`);
  check('自動推關開啟', await ev(`Game.dungeon.auto().on`));
  await sleep(4000);
  await shot('ux_3_autopush_battle.png');
  await sleep(14000);
  const c1 = await ev(`Game.dungeon.cleared()`);
  check('在遠征頁會自動推進', c1 > c0, `${c0} → ${c1} 層，狀態 ${await ev('Game.dungeon.auto().status')}`);
  await tab('ranch'); await sleep(12000);
  const c2 = await ev(`Game.dungeon.cleared()`);
  const overlay = await ev(`!!document.querySelector('.battle-ui')`);
  check('離開遠征頁仍在背景推進，而且不切走牧場畫面', c2 > c1 && !overlay, `${c1} → ${c2} 層，戰鬥疊層 ${overlay}`);
  await shot('ux_4_autopush_ranch.png');
  await ev(`Game.state.slimes.forEach(s => s.level = 1); Game.state.dungeon.cleared = 80; Game.state.dungeon.pendingRelic = null; Game.emit('change')`);
  await sleep(8000);
  const st = await ev(`Game.dungeon.auto().status`);
  check('戰力不足時進入等待', st === 'waiting', st);

  check('全程沒有 JS 例外', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));
  const fail = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - fail}/${results.length} 通過；截圖在 ${OUT}`);
  ws.close(); chrome.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
