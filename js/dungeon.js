// dungeon.js — 史萊姆遠征（副本）：屬性相剋、自動戰鬥、首通獎勵、遺物（ccline-a3）
// 戰鬥結果在呼叫 fight() 時一次算完；log 給畫面依時間重播，畫面顯示的傷害與結果完全一致。
(function () {
  'use strict';
  const Game = (window.Game = window.Game || {});

  const TEAM_SIZE = 5;
  const TIME_LIMIT = 30;      // 秒
  const HP_BASE = 1500;
  const HP_GROWTH = 1.5;      // 每層敵人血量 ×1.5（依 sim 校準）
  const HP_SOFT_FLOOR = 40;   // 40 層之後成長放緩，配合後期產量成長變慢
  const HP_GROWTH_LATE = 1.25;
  const HP_SOFT_FLOOR2 = 100; // 100 層之後再放緩（sim casual 30：後期產量約每週 ×100）
  const HP_GROWTH_END = 1.12;
  const BOSS_EVERY = 10;
  const BOSS_HP_MULT = 3;
  // 弱點／盾牌／BREAK（參考《歧路旅人》）：打中弱點扣 1 盾；盾歸零就 BREAK，期間傷害 ×2，結束後盾牌回滿
  // BREAK 結束後盾牌回滿，並進入 GUARD_SECONDS 秒「警戒」（弱點不扣盾），避免一直處於 BREAK
  const BREAK_SECONDS = 4;
  const BREAK_MULT = 2;
  const GUARD_SECONDS = 6;
  const FLOOR_MULT = 0.01;    // 每通過一層，全體產量 +1%（乘算，轉生後保留）

  // 屬性：火剋草、草剋水、水剋火；光暗互剋。剋制 ×2，被剋 ×0.5
  const ELEMENTS = {
    fire:  { name: '火', beats: 'grass' },
    grass: { name: '草', beats: 'water' },
    water: { name: '水', beats: 'fire' },
    light: { name: '光', beats: 'dark' },
    dark:  { name: '暗', beats: 'light' }
  };
  const SLIME_ELEMENT = {
    green: 'grass', blue: 'water', purple: 'dark', gold: 'light', rainbow: 'light',
    nebula: 'dark', corona: 'fire', genesis: 'grass',
    shell: 'water', ember: 'fire', snow: 'water', cloud: 'light',
    fire: 'fire', ice: 'water', king: null,
    // v1.8 星輝扭蛋限定
    thunder: 'light', coral: 'water', venom: 'dark', sakura: 'grass',
    phoenix: 'fire', moon: 'dark', yggdrasil: 'grass', mecha: 'light',
    chrono: 'light', dragonlord: 'fire', astral: null,
    // v1.9 神諭扭蛋限定
    aurora: 'light', abyss: 'dark', tempest: 'water',
    seraph: 'light', nocturne: 'dark', primordial: 'fire',
    eternal: null, cosmos: 'dark', oracle: 'light'
  };
  const ALL_ROUNDER_MULT = 1.5; // 史萊姆王：無屬性，對任何敵人 ×1.5

  // 敵人依層數輪替；每 10 層是頭目
  const ENEMIES = [
    // 第 1 層是水屬性：新手的草原史萊姆剋制它（×2），第一戰更容易贏
    { id: 'crab',     name: '泡泡蟹',   element: 'water' },
    { id: 'mushroom', name: '毒菇怪',   element: 'grass' },
    { id: 'imp',      name: '火焰小鬼', element: 'fire' },
    { id: 'bat',      name: '暗影蝙蝠', element: 'dark' },
    { id: 'wisp',     name: '光之精靈', element: 'light' }
  ];
  const BOSSES = [
    { id: 'golem',  name: '岩石巨像', element: 'grass' },
    { id: 'kraken', name: '深海巨妖', element: 'water' },
    { id: 'dragon', name: '熔岩龍',   element: 'fire' },
    { id: 'lich',   name: '冥界巫妖', element: 'dark' },
    { id: 'angel',  name: '墮天使',   element: 'light' }
  ];

  // 遺物：頭目首通時三選一，永久有效（轉生保留）
  const RELICS = {
    prod:    { name: '豐收號角', desc: '全體產量 +10%',     value: 0.10 },
    crit:    { name: '幸運骰子', desc: '點擊暴擊率 +2%',    value: 0.02 },
    combat:  { name: '勇者徽章', desc: '戰鬥傷害 +25%',     value: 0.25 },
    offline: { name: '安眠枕頭', desc: '離線上限 +30 分鐘', value: 0.5 },
    gems:    { name: '寶石磁鐵', desc: '副本寶石獎勵 +50%', value: 0.5 }
  };

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  // 取得遠征狀態；存檔缺欄位或型別錯誤時修正成合法值
  function ds() {
    const s = Game.state;
    if (!isObj(s.dungeon)) s.dungeon = {};
    const d = s.dungeon;
    if (!(d.cleared >= 0 && isFinite(d.cleared))) d.cleared = 0;
    d.cleared = Math.floor(d.cleared);
    if (!Array.isArray(d.team)) d.team = [];
    if (!isObj(d.relics)) d.relics = {};
    Object.keys(d.relics).forEach(function (k) { if (!RELICS[k] || !(d.relics[k] > 0)) delete d.relics[k]; });
    if (d.pendingRelic && !(Array.isArray(d.pendingRelic) && d.pendingRelic.every(function (k) { return RELICS[k]; }))) d.pendingRelic = null;
    if (!(d.fights >= 0)) d.fights = 0;
    // 自動推關設定：on 開關；relic＝頭目遺物 'smart'（自動選）或 'ask'（停下來等玩家選）；autoTeam＝每層自動編隊
    if (!isObj(d.auto)) d.auto = {};
    d.auto.on = !!d.auto.on;
    if (d.auto.relic !== 'ask') d.auto.relic = 'smart';
    d.auto.autoTeam = d.auto.autoTeam !== false;
    return d;
  }
  function relicLv(key) { return ds().relics[key] || 0; }
  function relicBonus(key) { return RELICS[key].value * relicLv(key); }

  function enemy(floor) {
    const boss = floor % BOSS_EVERY === 0;
    const list = boss ? BOSSES : ENEMIES;
    const base = list[(boss ? floor / BOSS_EVERY - 1 : floor - 1) % list.length];
    return {
      floor: floor, id: base.id, name: base.name, element: base.element, boss: boss,
      shield: Math.ceil(Math.min(24, 12 + 2 * Math.floor(floor / 20)) * (boss ? 1.5 : 1)),
      weak: weaknessesOf(base.element, boss ? floor : 0),
      hp: Math.min(Number.MAX_VALUE, Math.ceil(HP_BASE * Math.pow(HP_GROWTH, Math.min(floor, HP_SOFT_FLOOR) - 1) *
        Math.pow(HP_GROWTH_LATE, Math.max(0, Math.min(floor, HP_SOFT_FLOOR2) - HP_SOFT_FLOOR)) *
        Math.pow(HP_GROWTH_END, Math.max(0, floor - HP_SOFT_FLOOR2)) * (boss ? BOSS_HP_MULT : 1)))
    };
  }

  // 弱點：剋制牠的屬性；頭目再多一個（依層數輪替，排除自身屬性）
  function premiumOk() { return !!(Game.gacha && Game.gacha.premium && Game.gacha.premium.addTickets); }
  function oracleOk() { return !!(Game.gacha && Game.gacha.oracle && Game.gacha.oracle.addTickets); }
  // 神諭券：第 100 層起每 50 層首通送 1 張（第 50 層就送的話，第 1 天就能拿到 LR／UR 級角色，雪球太大；多種子 sim 驗證）
  const ORACLE_EVERY = 50, ORACLE_FIRST = 100;
  function oracleFloor(f) { return f >= ORACLE_FIRST && f % ORACLE_EVERY === 0; }

  function weaknessesOf(element, bossFloor) {
    const keys = Object.keys(ELEMENTS);
    const weak = keys.filter(function (k) { return ELEMENTS[k].beats === element; });
    if (bossFloor) {
      const rest = keys.filter(function (k) { return k !== element && weak.indexOf(k) < 0; });
      weak.push(rest[(bossFloor / BOSS_EVERY) % rest.length]);
    }
    return weak;
  }

  function elementMult(typeId, foeElement) {
    const el = SLIME_ELEMENT[typeId];
    if (el === null) return ALL_ROUNDER_MULT;   // 史萊姆王
    if (el === undefined) return 1;             // 未登錄的新種類：視為無相剋
    if (ELEMENTS[el].beats === foeElement) return 2;
    if (ELEMENTS[foeElement].beats === el) return 0.5;
    return 1;
  }

  // 扭蛋角色技能（只看牧場上的）：combat＝遠征傷害加成，breakDmg＝BREAK 倍率加成
  function skill(kind) {
    const sk = Game.skills ? Game.skills() : null;
    return sk && sk[kind] > 0 ? sk[kind] : 0;
  }
  function slimeDps(sl, foe) {
    return Game.rateOf(sl) * elementMult(sl.type, foe.element) * (1 + relicBonus('combat')) * (1 + skill('combat'));
  }

  // 模擬一場戰鬥。rand 為 null 時用期望值（給 preview），否則用亂數（給 fight）
  function simulate(team, foe, rand) {
    const log = [], breaks = [];
    let hp = foe.hp, t = 0, shield = foe.shield, breakUntil = -1, guardUntil = -1;
    const breakMult = BREAK_MULT + skill('breakDmg');
    while (hp > 0 && t < TIME_LIMIT) {
      t += 0.5;
      if (breakUntil >= 0 && t >= breakUntil) { breakUntil = -1; shield = foe.shield; guardUntil = t + GUARD_SECONDS; }
      for (let i = 0; i < team.length && hp > 0; i++) {
        const sl = team[i];
        const broken = breakUntil >= 0;
        const crit = rand ? rand() < 0.1 : false;
        const spread = rand ? 0.85 + rand() * 0.3 : 1.1; // 期望值含暴擊：1 + 10% × 1
        const dmg = Math.ceil(slimeDps(sl, foe) * 0.5 * spread * (crit ? 2 : 1) * (broken ? breakMult : 1));
        const weak = foe.weak.indexOf(SLIME_ELEMENT[sl.type]) >= 0;
        hp -= dmg;
        const e = { t: t, uid: sl.uid, dmg: dmg, crit: crit, weak: weak, broken: broken };
        if (weak && !broken && t >= guardUntil) {
          shield--;
          e.shield = shield;
          if (shield <= 0) { breakUntil = t + BREAK_SECONDS; e.brk = true; breaks.push({ t: t, end: Math.min(t + BREAK_SECONDS, TIME_LIMIT) }); }
        }
        log.push(e);
      }
    }
    return { win: hp <= 0, seconds: Math.min(t, TIME_LIMIT), hpLeft: Math.max(0, hp), log: log, breaks: breaks };
  }

  function teamSlimes() {
    const byUid = {};
    Game.state.slimes.forEach(function (x) { byUid[x.uid] = x; });
    return ds().team.map(function (uid) { return byUid[uid]; }).filter(Boolean);
  }

  // 對指定敵人自動挑傷害最高的 5 隻
  function bestTeam(foe) {
    return Game.state.slimes.slice()
      .sort(function (a, b) { return slimeDps(b, foe) - slimeDps(a, foe); })
      .slice(0, TEAM_SIZE);
  }

  function gemReward(floor) {
    if (floor % 5 !== 0) return 0;
    return Math.floor((floor % BOSS_EVERY === 0 ? 50 : 20) * (1 + relicBonus('gems')));
  }

  function rollRelicChoices() {
    const keys = Object.keys(RELICS);
    const out = [];
    while (out.length < 3) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      if (out.indexOf(k) < 0) out.push(k);
    }
    return out;
  }

  Game.dungeon = {
    TEAM_SIZE: TEAM_SIZE,
    TIME_LIMIT: TIME_LIMIT,
    elements: ELEMENTS,
    slimeElement: SLIME_ELEMENT,
    relicTypes: RELICS,

    // 新系統逐步開放：累計金幣達 UNLOCK_GOLD，而且最佳隊伍打得贏第 1 層時才開放（第一戰必勝）。
    // 開放後永久有效，轉生不影響。
    UNLOCK_GOLD: 5000,
    unlocked: function () {
      if (!ds().unlocked && Game.state.totalGold >= Game.dungeon.UNLOCK_GOLD) {
        const foe = enemy(1);
        const dps = bestTeam(foe).reduce(function (sum, sl) { return sum + slimeDps(sl, foe); }, 0);
        if (dps * TIME_LIMIT >= foe.hp) ds().unlocked = true;
      }
      return !!ds().unlocked;
    },
    cleared: function () { return ds().cleared; },
    floor: function () { return ds().cleared + 1; },   // 目前挑戰的層數
    enemy: enemy,
    elementMult: elementMult,
    BREAK_SECONDS: BREAK_SECONDS,
    BREAK_MULT: BREAK_MULT,
    GUARD_SECONDS: GUARD_SECONDS,
    relics: function () { return Object.assign({}, ds().relics); },
    relicBonus: relicBonus,
    pendingRelic: function () { return ds().pendingRelic; }, // [relicKey, relicKey, relicKey] 或 null

    // 全體產量倍率（由 engine 的 globalMult 乘上）
    mult: function () { return (1 + FLOOR_MULT * ds().cleared) * (1 + relicBonus('prod')); },

    // 目前隊伍；沒設定或成員已不在牧場時自動補成最佳隊伍
    team: function () {
      const t = teamSlimes();
      if (t.length) return t;
      return bestTeam(enemy(Game.dungeon.floor()));
    },
    setTeam: function (uids) {
      ds().team = uids.slice(0, TEAM_SIZE);
      Game.emit('change');
      return Game.dungeon.team();
    },
    autoTeam: function () {
      return Game.dungeon.setTeam(bestTeam(enemy(Game.dungeon.floor())).map(function (x) { return x.uid; }));
    },

    // 首通獎勵預覽：{gold, gems, relic}
    rewardPreview: function (floor) {
      floor = floor || Game.dungeon.floor();
      const boss = floor % BOSS_EVERY === 0;
      return { gold: Math.floor(Game.totalRate() * 60), gems: gemReward(floor), relic: boss, tickets: boss && premiumOk() ? 1 : 0,
        oracleTickets: oracleFloor(floor) && oracleOk() ? 1 : 0 };
    },

    // 戰前預估：{dps, hp, seconds, win}
    // seconds 已計入 BREAK；打不贏時用「平均 DPS」外推
    preview: function () {
      const foe = enemy(Game.dungeon.floor());
      const team = Game.dungeon.team();
      const dps = team.reduce(function (sum, sl) { return sum + slimeDps(sl, foe); }, 0);
      const sim = simulate(team, foe, null);
      const dealt = foe.hp - sim.hpLeft;
      const seconds = sim.win ? sim.seconds : (dealt > 0 ? foe.hp / (dealt / TIME_LIMIT) : Infinity);
      const weakCount = team.filter(function (sl) { return foe.weak.indexOf(SLIME_ELEMENT[sl.type]) >= 0; }).length;
      return { enemy: foe, dps: dps, hp: foe.hp, seconds: seconds, win: sim.win, breaks: sim.breaks.length, weakCount: weakCount };
    },

    // 打一場。回傳 {ok, win, enemy, seconds, log:[{t, uid, dmg, crit, weak, broken, shield?, brk?}], breaks:[{t, end}], rewards}
    // log 每筆：weak＝打中弱點；broken＝這下在 BREAK 期間；shield＝扣盾後剩餘；brk＝這下打破盾牌
    fight: function () {
      if (ds().pendingRelic) return { ok: false, msg: '請先選擇遺物' };
      const foe = enemy(Game.dungeon.floor());
      const team = Game.dungeon.team();
      if (!team.length) return { ok: false, msg: '牧場沒有史萊姆' };
      ds().fights++;
      // 每 0.5 秒每隻攻擊一次，傷害 ±15%，10% 暴擊 ×2，BREAK 期間 ×2
      const sim = simulate(team, foe, Math.random);
      const win = sim.win;
      const rewards = { gold: 0, gems: 0, relicChoices: null, tickets: 0, oracleTickets: 0 };
      if (win) {
        ds().cleared = foe.floor;
        rewards.gold = Math.floor(Game.totalRate() * 60);
        rewards.gems = gemReward(foe.floor);
        Game.addGold(rewards.gold);
        Game.state.gems += rewards.gems;
        if (foe.boss) {
          rewards.relicChoices = ds().pendingRelic = rollRelicChoices();
          // 頭目首通送 1 張星輝券（星輝扭蛋單抽一次）
          if (premiumOk()) { Game.gacha.premium.addTickets(1); rewards.tickets = 1; }
        }
        if (oracleFloor(foe.floor) && oracleOk()) { Game.gacha.oracle.addTickets(1); rewards.oracleTickets = 1; }
      }
      const result = { ok: true, win: win, enemy: foe, seconds: sim.seconds, hpLeft: sim.hpLeft, log: sim.log, breaks: sim.breaks, rewards: rewards };
      Game.emit('dungeon', result);
      Game.emit('change');
      return result;
    },

    // ---- 自動推關 ----
    // 開啟後，引擎每 AUTO_INTERVAL 秒嘗試打下一層（只在遊戲頁面開著時）。打不過時進入「等待」，
    // 戰力成長到打得贏會自動繼續。UI 正在重播戰鬥時把 Game.dungeon.busy 設成 true，自動推關會暫停。
    AUTO_INTERVAL: 3,
    busy: false,
    auto: function () { return Object.assign({ status: autoStatus }, ds().auto); },
    setAuto: function (opts) {
      const a = ds().auto;
      if ('on' in opts) a.on = !!opts.on;
      if ('relic' in opts) a.relic = opts.relic === 'ask' ? 'ask' : 'smart';
      if ('autoTeam' in opts) a.autoTeam = !!opts.autoTeam;
      autoStatus = a.on ? 'idle' : 'off';
      autoAcc = Game.dungeon.AUTO_INTERVAL; // 開啟後立刻嘗試一次
      Game.emit('change');
      return Game.dungeon.auto();
    },
    // 執行一步。回傳 {status, result?}；status：'off' | 'locked' | 'relic'（等玩家選遺物）| 'waiting'（戰力不足）| 'win' | 'lose'
    autoStep: function () {
      const a = ds().auto;
      if (!a.on) return setStatus('off');
      if (!Game.dungeon.unlocked()) return setStatus('locked');
      const p = ds().pendingRelic;
      if (p) {
        if (a.relic === 'ask') return setStatus('relic');
        Game.dungeon.chooseRelic(smartRelic(p));
      }
      if (a.autoTeam) Game.dungeon.autoTeam();
      if (!Game.dungeon.preview().win) return setStatus('waiting');
      const result = Game.dungeon.fight();
      return setStatus(result.win ? 'win' : 'lose', result);
    },

    // ---- 快速推關：不播動畫，連續挑戰到打不過、遇到要詢問的遺物、或達到上限 ----
    // 遺物依自動推關的設定（smart 自動選／ask 停下）；每層是否自動編隊也依設定。
    // 回傳 {from, to, cleared, gold, gems, tickets:{premium, oracle}, relics:[key], stop:'weak'|'relic'|'limit'|'locked'|'busy'}
    quickPush: function (maxFloors) {
      maxFloors = maxFloors > 0 ? Math.floor(maxFloors) : 100;
      const a = ds().auto;
      const out = { from: ds().cleared, to: ds().cleared, cleared: 0, gold: 0, gems: 0, tickets: { premium: 0, oracle: 0 }, relics: [], stop: 'limit' };
      if (Game.dungeon.busy) { out.stop = 'busy'; return out; }
      if (!Game.dungeon.unlocked()) { out.stop = 'locked'; return out; }
      let losses = 0;
      Game.dungeon.busy = true;
      try {
        while (out.cleared < maxFloors) {
          const p = ds().pendingRelic;
          if (p) {
            if (a.relic === 'ask') { out.stop = 'relic'; break; }
            const k = smartRelic(p); Game.dungeon.chooseRelic(k); out.relics.push(k);
          }
          if (a.autoTeam) ds().team = bestTeam(enemy(Game.dungeon.floor())).map(function (x) { return x.uid; });
          if (!Game.dungeon.preview().win) { out.stop = 'weak'; break; }
          const r = Game.dungeon.fight();
          if (!r.win) { if (++losses >= 3) { out.stop = 'weak'; break; } continue; } // 傷害浮動輸掉：同層最多重試 3 次
          losses = 0;
          out.cleared++;
          out.gold += r.rewards.gold; out.gems += r.rewards.gems;
          out.tickets.premium += r.rewards.tickets || 0; out.tickets.oracle += r.rewards.oracleTickets || 0;
        }
        // 最後一層是頭目時，遺物也依設定處理，讓結果一次到位
        const p = ds().pendingRelic;
        if (p && a.relic !== 'ask') { const k = smartRelic(p); Game.dungeon.chooseRelic(k); out.relics.push(k); }
      } finally {
        Game.dungeon.busy = false;
      }
      out.to = ds().cleared;
      Game.emit('dungeonQuick', out);
      Game.emit('change');
      return out;
    },
    // 預估快速推關能推幾層（用期望值模擬，不改變任何狀態；遺物加成不計，所以是保守估計）
    quickPushPreview: function (maxFloors) {
      maxFloors = maxFloors > 0 ? Math.floor(maxFloors) : 100;
      if (!Game.dungeon.unlocked()) return { floors: 0, stop: 'locked' };
      const a = ds().auto;
      let f = Game.dungeon.floor(), n = 0;
      const fixed = Game.dungeon.team();
      while (n < maxFloors) {
        const foe = enemy(f);
        const team = a.autoTeam ? bestTeam(foe) : fixed;
        if (!simulate(team, foe, null).win) return { floors: n, stop: 'weak' };
        n++; f++;
        if (a.relic === 'ask' && (f - 1) % BOSS_EVERY === 0) return { floors: n, stop: 'relic' };
      }
      return { floors: n, stop: 'limit' };
    },

    chooseRelic: function (key) {
      const p = ds().pendingRelic;
      if (!p || p.indexOf(key) < 0) return false;
      ds().relics[key] = relicLv(key) + 1;
      ds().pendingRelic = null;
      Game.emit('toast', '獲得遺物：' + RELICS[key].name + '（' + RELICS[key].desc + '）');
      Game.emit('change');
      return true;
    }
  };

  // 自動選遺物：選目前等級最低的；同等級時依 產量 > 戰鬥 > 寶石 > 暴擊 > 離線
  const RELIC_PRIORITY = ['prod', 'combat', 'gems', 'crit', 'offline'];
  function smartRelic(choices) {
    return choices.slice().sort(function (x, y) {
      return relicLv(x) - relicLv(y) || RELIC_PRIORITY.indexOf(x) - RELIC_PRIORITY.indexOf(y);
    })[0];
  }

  let autoStatus = 'off', autoAcc = 0;
  // 狀態改變時送 'dungeonAuto' {status, result?}，給 UI 顯示提示；win/lose 每次都送
  function setStatus(status, result) {
    const changed = status !== autoStatus;
    autoStatus = status;
    if (changed || result) Game.emit('dungeonAuto', { status: status, result: result || null });
    return { status: status, result: result || null };
  }

  if (Game.on) {
    Game.on('tick', function (dt) {
      if (!Game.state.dungeon || !Game.state.dungeon.auto || !Game.state.dungeon.auto.on || Game.dungeon.busy) return;
      autoAcc += dt;
      if (autoAcc < Game.dungeon.AUTO_INTERVAL) return;
      autoAcc = 0;
      Game.dungeon.autoStep();
    });
  }
})();
