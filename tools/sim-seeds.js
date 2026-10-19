// 多種子比較：同一個情境跑 N 個亂數種子，回報各地區解鎖天數、轉生次數、遠征層數的中位數（ccline-0b）
// 用法：node tools/sim-seeds.js [天數=30] [種子數=5] [PAYER 模式：f2p|light|heavy，可用逗號分隔多個]
const { execFile } = require('child_process');
const path = require('path');

const DAYS = +process.argv[2] || 30;
const N = +process.argv[3] || 5;
const MODES = (process.argv[4] || 'f2p,light,heavy').split(',');
const SEEDS = [12345, 777, 2026, 4242, 9001, 31337, 555, 8080, 1111, 6060].slice(0, N);
const SIM = path.join(__dirname, 'sim.js');
const ZONES = ['海邊', '火山', '雪山', '天空城'];

function run(mode, seed) {
  const env = Object.assign({}, process.env, { SEED: String(seed), PAYER: mode === 'heavy' ? '1' : mode === 'light' ? 'light' : '' });
  // SIM_DIR：用另一份遊戲目錄跑（實驗用，例如複製一份 js 改數值，不動到正式檔案）
  return new Promise((res, rej) => execFile('node', [SIM, process.env.SIM_DIR || path.join(__dirname, '..'), 'casual', String(DAYS)], { env, maxBuffer: 64 << 20 }, (err, out) => {
    if (err) return rej(err);
    const zones = ZONES.map(z => { const m = out.match(new RegExp('^D(\\d+) \\S+\\s+解鎖地區 ' + z, 'm')); return m ? +m[1] : null; });
    const prestige = (out.match(/次轉生 \+/g) || []).length;
    const floor = +((out.match(/^遠征 最高層 (\d+)/m) || [])[1] || 0);
    res({ seed, zones, prestige, floor });
  }));
}
const median = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
// 沒解鎖記成 天數+1，中位數超過天數時顯示為「>天數」
const fmtDay = d => d > DAYS ? '>' + DAYS : 'D' + d;

(async () => {
  const jobs = [];
  for (const m of MODES) for (const s of SEEDS) jobs.push(run(m, s).then(r => Object.assign(r, { mode: m })));
  const all = await Promise.all(jobs);
  for (const m of MODES) {
    const rs = all.filter(r => r.mode === m);
    const med = ZONES.map((z, i) => median(rs.map(r => r.zones[i] == null ? DAYS + 1 : r.zones[i])));
    console.log(`${m.padEnd(5)} 中位數：` + ZONES.map((z, i) => z + ' ' + fmtDay(med[i])).join('、') +
      `｜轉生 ${median(rs.map(r => r.prestige))} 次｜遠征 ${median(rs.map(r => r.floor))} 層`);
    for (const r of rs) console.log(`        seed ${String(r.seed).padEnd(6)} ` + r.zones.map(d => d == null ? '—' : 'D' + d).join(' ') + `｜轉生 ${r.prestige}｜${r.floor} 層`);
  }
})().catch(e => { console.error(e); process.exit(1); });
