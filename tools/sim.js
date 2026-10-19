// 進度曲線模擬：載入真實 engine.js / shop.js，用貪婪玩家策略跑時間軸
// 用法：node sim.js <gameDir> <scenario: active|casual> [days]
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = process.argv[2], scenario = process.argv[3] || 'casual', days = +process.argv[4] || 14;

let now = Date.UTC(2026, 9, 20, 0, 0, 0);
const RealDate = Date;
global.Date = class extends RealDate { constructor(...a) { a.length ? super(...a) : super(now); } static now() { return now; } };
global.window = global;
global.localStorage = { getItem() { return null; }, setItem() {} };
global.setInterval = () => 0;
global.addEventListener = () => {};
let seed = +(process.env.SEED || 12345);   // SEED 可以換亂數種子，比較不同運氣下的結果
Math.random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (const f of ['engine.js', 'shop.js', 'dungeon.js', 'quests.js']) vm.runInThisContext(fs.readFileSync(path.join(dir, 'js', f), 'utf8'), { filename: f });

const G = global.Game, S = () => G.state, T = id => G.config.slimeTypes[id];
const log = [];
const t0 = now;
const hms = ms => { const s = Math.floor((ms - t0) / 1000); return `D${Math.floor(s / 86400) + 1} ${String(Math.floor(s % 86400 / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`; };
const ev = msg => log.push(`${hms(now)}  ${msg}  (每秒 ${G.fmt(G.totalRate())})`);
const seen = new Set();
const firstTime = (key, msg) => { if (!seen.has(key)) { seen.add(key); ev(msg); } };

function baseRateOf(sl) { return G.rateOf(sl); }
// 一次貪婪決策：回傳是否有做事
function act() {
  const s = S();
  // 1. 能合成就合成（合成一定提高產量）
  for (const id of Object.keys(G.config.slimeTypes).filter(k => G.config.slimeTypes[k].evolvesTo)) {
    if (G.canMerge(id)) { const sl = G.actions.merge(id); firstTime('merge_' + sl.type, `合成出第一隻 ${T(sl.type).name}`); return true; }
  }
  // 倉庫有更好的就放出來
  // 倉庫裡有放得回去的就放回（主線和夥伴分開計算）
  // 空位每次決策只算一次（倉庫可能很大，逐隻計算會很慢）
  const roomMain = G.hasRoom ? G.hasRoom(false) : s.slimes.length < G.capacity();
  const roomComp = G.hasRoom ? G.hasRoom(true) : roomMain;
  const back = (roomMain || roomComp) && s.storage.find(x => x.gacha ? roomComp : roomMain);
  if (back && G.actions.fromStorage(back.uid)) return true;
  const full = G.mainCount ? G.mainCount() >= G.capacity() : s.slimes.length >= G.capacity();
  const mult = G.globalMult();
  const cands = [];
  // 買史萊姆（滿了就以替換最弱的計）
  // 只有主線史萊姆會被換掉（夥伴不占主線格子）
  const weakest = s.slimes.filter(x => !x.gacha).sort((a, b) => G.rateOf(a, mult) - G.rateOf(b, mult))[0] || s.slimes[0];
  for (const id of Object.keys(G.config.slimeTypes).filter(k => G.slimeCost(k) != null)) {
    const c = G.slimeCost(id); if (c == null) continue;
    let gain = T(id).baseRate * mult;
    // 買來湊合成：同種已有 2 隻時，合成價值大
    const have = s.slimes.filter(x => x.type === id).length;
    if (have % 3 === 2 && T(id).evolvesTo) gain = T(T(id).evolvesTo).baseRate * mult - (have >= 2 ? 2 * T(id).baseRate * mult : 0);
    if (full) gain -= G.rateOf(weakest, mult);
    if (gain > 0) cands.push({ kind: 'buy', id, cost: c, gain, full });
  }
  for (const sl of s.slimes) {
    const c = G.upgradeSlimeCost(sl);
    let gain = G.rateOf(Object.assign({}, sl, { level: sl.level + 1 }), mult) - G.rateOf(sl, mult);
    // 為了湊合成而升級：同種至少 3 隻且還沒到門檻時，把合成後的產量增幅分攤到所需等級
    const t = T(sl.type), ml = G.config.mergeLevel;
    if (t.evolvesTo && sl.level < ml && s.slimes.filter(x => x.type === sl.type).length >= 3) {
      const after = G.rateOf({ type: t.evolvesTo, level: ml, star: 0 }, mult) - 3 * G.rateOf({ type: sl.type, level: ml, star: 0 }, mult);
      gain += Math.max(0, after) / 3 / (ml - sl.level);
    }
    cands.push({ kind: 'lv', sl, cost: c, gain });
  }
  const pc = G.upgradeCost('prodMult');
  if (pc != null) cands.push({ kind: 'up', key: 'prodMult', cost: pc, gain: G.totalRate() * 0.25 / (1 + 0.25 * s.upgrades.prodMult) });
  const cc = G.upgradeCost('capacity');
  if (cc != null && full) {
    const best = cands.filter(c => c.kind === 'buy').sort((a, b) => b.gain / b.cost - a.gain / a.cost)[0];
    if (best) cands.push({ kind: 'up', key: 'capacity', cost: cc, gain: (best.gain + G.rateOf(weakest, mult)) * 0.8 });
  }
  const kc = G.upgradeCost('click');
  if (kc != null && clicking) cands.push({ kind: 'up', key: 'click', cost: kc, gain: CPS * 1.1 * Math.max(1, S().clickPower * Math.pow(2, s.upgrades.click)) });
  if (!cands.length) return false;
  cands.sort((a, b) => a.cost / a.gain - b.cost / b.gain);
  const best = cands[0];
  if (s.gold < best.cost) return false;
  if (best.kind === 'buy') {
    if (best.full) G.actions.toStorage(weakest.uid);
    G.actions.buySlime(best.id); firstTime('buy_' + best.id, `第一次買 ${T(best.id).name}`);
  } else if (best.kind === 'lv') G.actions.levelUp(best.sl.uid);
  else {
    G.actions.buyUpgrade(best.key);
    if (best.key === 'capacity' && G.upgradeCost('capacity') == null) ev('牧場擴建滿級');
    if (best.key === 'prodMult' && s.upgrades.prodMult % 10 === 0) ev(`高級飼料 Lv${s.upgrades.prodMult}`);
  }
  purchases++;
  return true;
}

const CPS = 3;
// PAYER：未設定＝F2P；'1' 或 'heavy'＝重課（每天 3000💎、約 NT$1490）；'light'＝輕課（月卡＋每週 NT$150）
const PAYER_MODE = process.env.PAYER === 'light' ? 'light' : (process.env.PAYER === '1' || process.env.PAYER === 'heavy') ? 'heavy' : '';
const PAYER = !!PAYER_MODE;
// 轉生時機：可得星塵 ≥ 累計星塵 × PRESTIGE_AT（0.5 = 加成至少 +50% 就轉生，較接近真實玩家；1 = 等到加成翻倍）
const PRESTIGE_AT = +(process.env.PRESTIGE_AT || 0.5);
let clicking = false, purchases = 0, gemsAcc = 0;
const visitors = {};
let dungeonWins = 0;
function second() {
  now += 1000;
  G.tick(); // 入帳 + 金色訪客排程
  if (G.visitorActive() && Math.random() < 0.5) { const r = G.actions.catchVisitor(); visitors[r.kind] = (visitors[r.kind] || 0) + 1; purchases++; }
  if (clicking) for (let i = 0; i < CPS; i++) G.actions.click();
  // 遠征：開放後，每 5 秒看一次，打得贏就打（自動編隊；頭目遺物選第一個）
  if (clicking && G.dungeon && G.dungeon.unlocked() && now % 5000 === 0) {
    if (G.dungeon.pendingRelic()) G.dungeon.chooseRelic(G.dungeon.pendingRelic()[0]);
    G.dungeon.autoTeam();
    if (G.dungeon.preview().win) { const r = G.dungeon.fight(); if (r.win) { purchases++; dungeonWins++; if (r.enemy.boss) ev(`遠征擊敗頭目 ${r.enemy.name}（第 ${r.enemy.floor} 層）`); } }
  }
  // 新手任務：完成就領
  if (G.quests) { const q = G.quests.current(); if (q && q.done) { G.quests.claim(); ev(`任務 ${q.index + 1}/${q.total} 完成：${q.text}（+${q.gems}💎）`); } }
  if (G.gacha.freePullAvailable()) { const r = G.gacha.pull(1, true); ev(`免費 SR 抽 → ${T(r.results[0].typeId).name}`); }
  // 星輝券：有就用（F2P 管道）；課金玩家寶石夠就優先抽星輝十連
  const P = G.gacha.premium;
  const good = r => r.results.filter(x => ['SR', 'SSR', 'UR'].includes(x.rarity) && x.typeId).map(x => (x.rarity === 'UR' ? '★' : '') + T(x.typeId).name).join('、');
  if (P && P.tickets() > 0) { const r = P.pull(1, true); if (r.ok) ev(`星輝券 → ${good(r)}`); }
  // 神諭：有券就用
  const O = G.gacha.oracle;
  const goodO = r => r.results.filter(x => ['UR', 'LR'].includes(x.rarity)).map(x => (x.rarity === 'LR' ? '✧' : '') + T(x.typeId).name).join('、');
  if (O && O.tickets() > 0 && !process.env.NO_ORACLE) { const r = O.pull(1, true); if (r.ok) ev(`神諭券 → ${goodO(r)}`); }   // NO_ORACLE=1：實驗用，不使用神諭券
  // 重課存到 5400 抽神諭十連；輕課寶石少，抽星輝十連（2700）
  if (O && PAYER_MODE === 'heavy') {
    if (S().gems >= 54000) { const r = O.pull(100); if (r.ok) ev(`神諭百連 → ${goodO(r)}`); }
    else if (S().gems >= 5400) { const r = O.pull(10); if (r.ok) ev(`神諭十連 → ${goodO(r)}`); }
  }
  else if (P && PAYER && S().gems >= 2700) { const r = P.pull(10); if (r.ok) ev(`星輝十連 → ${good(r)}`); }
  else if (S().gems >= 900) { const r = G.gacha.pull(10); ev(`十連 → ${good(r)}`); }
  let n = 0; while (n++ < 50 && act());
}
function offline(sec) {
  const cap = G.offlineCapHours() * 3600;
  G.setVisible(false);
  G.addGold(G.totalRate() * Math.min(sec, cap));
  now += sec * 1000;
  S().lastTick = now;
}

const sessions = [];
function session(min) {
  // 轉生策略：可得星塵 ≥ max(2, 現有星塵) 時轉生；星塵升級花費 ≤ 現有 30% 就買
  // 轉生策略：可得星塵 ≥ 累計星塵 × PRESTIGE_AT 時轉生，星塵全部花在星塵商店（加成看累計星塵，花掉不影響）
  if (G.canPrestige() && G.prestigeGain() >= Math.max(1, S().prestige.totalDust * PRESTIGE_AT)) {
    const r = G.actions.prestige(); ev(`第 ${S().prestige.count} 次轉生 +${r.stardust} 星塵（累計 ${S().prestige.totalDust}）`);
    // 優先解鎖地區，再買有上限的星塵升級，剩下的全部投入星塵共鳴
    let bought = true;
    while (bought) {
      bought = false;
      const z = G.zones && G.zones().find(x => x.available);
      if (z && z.cost <= S().prestige.dust) { G.actions.unlockZone(z.id); ev(`解鎖地區 ${z.name}`); bought = true; continue; }
      for (const k of ['startGold', 'capacity', 'click', 'visitor', 'offline']) { const c = G.dustUpgradeCost(k); if (c != null && c <= S().prestige.dust) { G.actions.buyDustUpgrade(k); bought = true; } }
    }
    // 下一個地區還要存的話，共鳴只花超出的部分
    const nz = G.zones && G.zones().find(x => x.available);
    const reserve = nz ? nz.cost : 0;
    if (G.config.dustUpgrades.resonance) for (let c; (c = G.dustUpgradeCost('resonance')) != null && S().prestige.dust - c >= reserve && (!nz || S().prestige.dust >= reserve);) G.actions.buyDustUpgrade('resonance');
  }
  G.setVisible(true);
  const p0 = purchases, r0 = G.totalRate(), g0 = S().gold;
  clicking = true;
  // 開局先花掉離線收益
  let n = 0; while (n++ < 200 && act());
  const pAfterOpen = purchases - p0;
  const gaps = []; let last = now;
  const pBefore = purchases;
  for (let i = 0; i < min * 60; i++) { const before = purchases; second(); if (purchases > before) { gaps.push((now - last) / 1000); last = now; } }
  clicking = false;
  sessions.push({ at: hms(now - min * 60000), openBuys: pAfterOpen, inSessionBuys: purchases - pBefore, maxGap: Math.max(0, ...gaps, (now - last) / 1000), rate0: r0, rate1: G.totalRate() });
}

if (scenario === 'trace') {
  clicking = true; S().lastTick = now;
  for (let i = 0; i < 180; i++) { second(); if (i % 10 === 9) console.log(i + 1 + 's', 'rate', G.fmt(G.totalRate()), 'gold', G.fmt(S().gold), JSON.stringify(S().upgrades), S().slimes.map(x => x.type.slice(0, 2) + x.level).join(','), JSON.stringify(S().bought)); }
} else if (scenario === 'active') {
  for (let m = 0; m < 180; m++) session(1);
} else {
  for (let d = 0; d < days; d++) {
    gemsAcc += 140; S().gems += 140;
    // 課金：寶石和累計儲值（台幣）一起加，VIP 才會成長
    const sh = S().shop, DAY = 86400000;
    if (PAYER_MODE === 'heavy') { S().gems += 3000; sh.totalSpent += 1490; }
    if (PAYER_MODE === 'light') {
      if (d % 30 === 0) { sh.monthCardUntil = Math.max(sh.monthCardUntil, now) + 30 * DAY; S().gems += 300; sh.totalSpent += 150; }
      if (d % 7 === 0) { const first = !sh.firstBuyDone.gems_330; S().gems += first ? 660 : 330; sh.firstBuyDone.gems_330 = true; sh.totalSpent += 150; }
    }
    if (G.shop.canClaimMonthCard && G.shop.canClaimMonthCard()) G.shop.claimMonthCardDaily();
    sh.vip = G.shop.vipLevel();
    // 08:00 / 13:00 / 21:00 各玩 10 分鐘；第一天第一場玩 30 分鐘
    const plan = [[8, d === 0 ? 30 : 10], [13, 10], [21, 10]];
    const dayStart = t0 + d * 86400000;
    if (d === 0) { now = dayStart + 8 * 3600000; S().lastTick = now; S().createdAt = now; }
    for (const [h, min] of plan) {
      const target = dayStart + h * 3600000;
      if (now < target) offline((target - now) / 1000);
      session(min);
    }
    offline((dayStart + 86400000 + 8 * 3600000 - now) / 1000 - 1);
    now = Math.max(now, dayStart + 86400000);
  }
}

console.log('=== 里程碑 ===\n' + log.join('\n'));
console.log('\n=== 每場遊戲 ===  (開場可買次數 / 遊玩中購買次數 / 最長無事可做秒數 / 產量)');
for (const x of sessions) console.log(`${x.at}  開場 ${String(x.openBuys).padStart(3)}  中途 ${String(x.inSessionBuys).padStart(3)}  最長空檔 ${String(Math.round(x.maxGap)).padStart(4)}s  ${G.fmt(x.rate0)} → ${G.fmt(x.rate1)}`);
const s = S();
console.log('\n=== 結束狀態 ===');
console.log('課金', PAYER_MODE || 'F2P', 'VIP', G.shop.vipLevel(), '累計 NT$' + S().shop.totalSpent, '夥伴格', G.companionCap());
console.log('牧場', (G.mainCount ? '主線 ' + G.mainCount() + '/' + G.capacity() + '、夥伴 ' + G.companionCount() + '/' + G.companionCap() : s.slimes.length + '/' + G.capacity()), s.slimes.map(x => x.type + 'L' + x.level + (x.star ? '★' + x.star : '')).join(' '));
console.log('轉生', JSON.stringify(s.prestige));
console.log('金色訪客', JSON.stringify(visitors));
if (G.achievements) console.log('成就', G.achievements().filter(a => a.done).length + '/' + G.achievements().length, '圖鑑', G.codexFound() + '/' + G.codex().length, '未達成', G.achievements().filter(a => !a.done).map(a => a.id).join(','));
if (G.dungeon) console.log('遠征', '最高層', G.dungeon.cleared(), '勝場', dungeonWins, '遺物', JSON.stringify(G.dungeon.relics()), '倍率', G.dungeon.mult().toFixed(2));
console.log('升級', JSON.stringify(s.upgrades), '金幣', G.fmt(s.gold), '倉庫', s.storage.length);
