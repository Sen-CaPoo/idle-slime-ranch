// shop.js — 模擬課金：寶石包、首儲雙倍、月卡、新手禮包、VIP、加速、扭蛋（ccline-0b）
// 注意：全部都是「模擬購買」，不串接任何真實金流、不收集付款資料。
(function () {
  'use strict';
  const Game = (window.Game = window.Game || {});
  const DAY = 86400000;

  function today() { return new Date().toISOString().slice(0, 10); }
  function sh() { return Game.state.shop; }

  // ---------- 商品 ----------
  const products = [
    { id: 'gems_60',   kind: 'gems', name: '一小袋寶石', priceTWD: 30,   gems: 60,   bonusFirst: true, icon: 'gem1', desc: '60 寶石' },
    { id: 'gems_330',  kind: 'gems', name: '一袋寶石',   priceTWD: 150,  gems: 330,  bonusFirst: true, icon: 'gem2', desc: '330 寶石' },
    { id: 'gems_680',  kind: 'gems', name: '一箱寶石',   priceTWD: 300,  gems: 680,  bonusFirst: true, icon: 'gem3', desc: '680 寶石' },
    { id: 'gems_1380', kind: 'gems', name: '寶石寶箱',   priceTWD: 590,  gems: 1380, bonusFirst: true, icon: 'gem4', desc: '1380 寶石' },
    { id: 'gems_3680', kind: 'gems', name: '寶石山',     priceTWD: 1490, gems: 3680, bonusFirst: true, icon: 'gem5', desc: '3680 寶石' },
    { id: 'gems_7980', kind: 'gems', name: '寶石王國',   priceTWD: 2990, gems: 7980, bonusFirst: true, icon: 'gem6', desc: '7980 寶石' },
    // 最大包：不適用首儲雙倍；多送比例由下方程式自動計算（29900 ÷ 9990 ÷ 2 − 1 ≈ +50%）
    { id: 'gems_29900', kind: 'gems', name: '寶石帝國',   priceTWD: 9990, gems: 29900, bonusFirst: false, icon: 'gem7', desc: '29900 寶石', tag: 'best' },
    { id: 'monthCard', kind: 'monthCard', name: '月卡', priceTWD: 150, gems: 300, bonusFirst: false, icon: 'card', tag: 'hot', totalGems: 3300,
      desc: '立即獲得 300 寶石；30 天內每天可領 100 寶石、產量 +20%、離線收益上限 12 小時' },
    { id: 'starter',   kind: 'starter', name: '新手禮包（限購一次）', priceTWD: 90, gems: 300, bonusFirst: false, icon: 'gift',
      desc: '300 寶石 + 黃金史萊姆 ×1 + 2 小時雙倍加速' }
  ];
  // 商店錨點：每元寶石量和最小包比較，例如「多送 +10%」（月卡以 30 天總量計算）
  (function () {
    const baseRatio = products[0].gems / products[0].priceTWD;
    products.forEach(function (p) {
      const pct = Math.round(((p.totalGems || p.gems) / p.priceTWD / baseRatio - 1) * 100);
      p.valuePct = pct;
      p.valueText = pct > 0 ? '多送 +' + pct + '%' : '';
    });
  })();
  const STARTER_HOURS = 72;

  // 依累計儲值（模擬台幣）計算 VIP 等級；每級產量 +5%
  const VIP_THRESHOLDS = [0, 30, 300, 1000, 3000, 9990, 30000];   // VIP5 = 9990：單買「寶石帝國」剛好到 VIP5，不做「差 10 元」的誘導加購

  function vipLevel() {
    let lv = 0;
    VIP_THRESHOLDS.forEach(function (t, i) { if (sh().totalSpent >= t) lv = i; });
    return lv;
  }

  function addBoost(ms) {
    const now = Date.now();
    // 疊加上限 4 小時
    sh().boostUntil = Math.min(Math.max(sh().boostUntil, now) + ms, now + 4 * 3600000);
  }

  Game.shop = {
    products: products,
    vipThresholds: VIP_THRESHOLDS,
    boostGemCost: 120,   // 寶石加速 2 小時
    adBoostsPerDay: 3,   // 廣告加速 30 分鐘

    init: function () {
      if (sh().adBoostDay !== today()) { sh().adBoostDay = today(); sh().adBoostsToday = 0; }
      Game.daily.roll();
    },

    // 新手禮包：開始遊戲後 72 小時內、未購買才會出現
    starterSecondsLeft: function () {
      if (sh().starterPackBought) return 0;
      return Math.max(0, Math.floor((Game.state.createdAt + STARTER_HOURS * 3600000 - Date.now()) / 1000));
    },
    available: function (productId) {
      return productId !== 'starter' || Game.shop.starterSecondsLeft() > 0;
    },
    // engine 在特定情境呼叫，回傳要推薦的商品 id（沒有就回傳 null）
    offerFor: function (reason) {
      if (Game.shop.available('starter')) return 'starter';
      if (reason === 'noGems') {
        const p = products.find(function (x) { return x.kind === 'gems' && !sh().firstBuyDone[x.id]; });
        return p ? p.id : 'gems_330';
      }
      return null;
    },

    // 模擬金流：UI 須先顯示「模擬購買，不會實際扣款」確認視窗，再呼叫這裡
    purchase: function (productId) {
      const p = products.find(function (x) { return x.id === productId; });
      return new Promise(function (resolve) {
        setTimeout(function () {
          if (!p) return resolve({ ok: false, msg: '查無此商品' });
          const s = sh();
          if (p.kind === 'starter' && !Game.shop.available('starter')) return resolve({ ok: false, msg: '新手禮包已售出或已過期' });

          let gems = p.gems;
          let msg;
          if (p.kind === 'gems') {
            const first = p.bonusFirst && !s.firstBuyDone[p.id];
            if (first) gems *= 2;
            s.firstBuyDone[p.id] = true;
            msg = '獲得 ' + gems + ' 寶石' + (first ? '（首儲雙倍！）' : '');
          } else if (p.kind === 'monthCard') {
            s.monthCardUntil = Math.max(s.monthCardUntil, Date.now()) + 30 * DAY;
            msg = '月卡生效！獲得 ' + gems + ' 寶石';
          } else if (p.kind === 'starter') {
            s.starterPackBought = true;
            Game.addSlime('gold', false, true, true); // 禮包取得的史萊姆是夥伴，轉生時保留
            addBoost(2 * 3600000);
            msg = '新手禮包到手！300 寶石 + 黃金史萊姆 + 2 小時雙倍加速';
          }
          const oldVip = vipLevel();
          Game.state.gems += gems;
          s.totalSpent += p.priceTWD;
          s.vip = vipLevel();
          if (s.vip > oldVip) msg += '，VIP 升到 ' + s.vip + ' 級！';
          Game.emit('purchase', { product: p, gems: gems });
          Game.emit('toast', msg);
          Game.emit('change');
          Game.save();
          resolve({ ok: true, msg: msg });
        }, 600);
      });
    },

    monthCardActive: function () { return sh().monthCardUntil > Date.now(); },
    monthCardDaysLeft: function () { return Math.max(0, Math.ceil((sh().monthCardUntil - Date.now()) / DAY)); },
    canClaimMonthCard: function () { return Game.shop.monthCardActive() && sh().monthCardLastClaim !== today(); },
    claimMonthCardDaily: function () {
      if (!Game.shop.monthCardActive()) return { ok: false, msg: '月卡尚未生效' };
      if (sh().monthCardLastClaim === today()) return { ok: false, msg: '今天已經領過了' };
      sh().monthCardLastClaim = today();
      Game.state.gems += 100;
      Game.emit('toast', '月卡每日獎勵：100 寶石');
      Game.emit('change');
      return { ok: true, msg: '獲得 100 寶石' };
    },

    boostActive: function () { return sh().boostUntil > Date.now(); },
    boostSecondsLeft: function () { return Math.max(0, Math.floor((sh().boostUntil - Date.now()) / 1000)); },
    adBoostsLeft: function () { Game.shop.init(); return Game.shop.adBoostsPerDay - sh().adBoostsToday; },
    // 金幣產量 ×2：useAd=true 為「看廣告」（模擬，30 分鐘），UI 可以自己演一段倒數；否則花寶石換 2 小時（加速最多疊加到 4 小時）
    boost: function (useAd) {
      const min = useAd ? 30 : 120;
      if (useAd) {
        if (Game.shop.adBoostsLeft() <= 0) return { ok: false, msg: '今天的廣告次數用完了' };
        sh().adBoostsToday++;
      } else {
        if (Game.state.gems < Game.shop.boostGemCost) { Game.offer('noGems'); return { ok: false, msg: '寶石不足' }; }
        Game.state.gems -= Game.shop.boostGemCost;
      }
      addBoost(min * 60000);
      const msg = '雙倍加速 ' + (useAd ? '30 分鐘' : '2 小時');
      Game.emit('toast', msg + '！');
      Game.emit('change');
      return { ok: true, msg: msg };
    },

    vipLevel: vipLevel,
    vipBonus: function () { return 0.05 * vipLevel(); },
    // 下一級還差多少（模擬台幣），已滿級回傳 null
    vipNext: function () {
      const lv = vipLevel();
      return lv + 1 < VIP_THRESHOLDS.length ? VIP_THRESHOLDS[lv + 1] - sh().totalSpent : null;
    }
  };

  // ---------- 扭蛋 ----------
  const RATES = { SSR: 0.02, SR: 0.13, R: 0.35, N: 0.50 };
  const HARD_PITY = 80; // 連續 80 抽沒有 SSR 時，下一抽必定 SSR
  const FREE_PULL_GOLD = 5000;
  const MAX_STAR = 5;   // SR/SSR 重複時升星（每星產量 +50%、技能增強），滿星改送 50 寶石

  function poolOf(rarity) {
    const types = Game.config.slimeTypes;
    return Object.keys(types).filter(function (k) { return types[k].rarity === rarity && !types[k].noGacha && !types[k].premium && !types[k].oracle; });
  }
  function rollRarity(minSR) {
    let r = Math.random();
    if (minSR) {
      // 只在 SR/SSR 之間依比例重抽
      r = Math.random() * (RATES.SSR + RATES.SR);
      return r < RATES.SSR ? 'SSR' : 'SR';
    }
    if ((r -= RATES.SSR) < 0) return 'SSR';
    if ((r -= RATES.SR) < 0) return 'SR';
    if ((r -= RATES.R) < 0) return 'R';
    return 'N';
  }

  // 發放扭蛋角色：已經有同種的扭蛋角色 → 升星（合成出來的不算）；滿星 → 改送 maxStarGems 寶石；沒有 → 新增（轉生保留）
  function grant(typeId, rarity, maxStarGems) {
    const mine = Game.state.slimes.concat(Game.state.storage).filter(function (x) { return x.type === typeId && x.gacha; });
    const target = mine.find(function (x) { return (x.star || 0) < MAX_STAR; });
    if (target) {
      target.star = (target.star || 0) + 1;
      return { typeId: typeId, rarity: rarity, uid: target.uid, dup: true, star: target.star, stored: Game.state.storage.indexOf(target) >= 0 };
    }
    if (mine.length) {
      Game.state.gems += maxStarGems;
      return { typeId: typeId, rarity: rarity, dup: true, gems: maxStarGems };
    }
    const sl = Game.addSlime(typeId, false, true, true);   // 夥伴欄滿就進倉庫
    return { typeId: typeId, rarity: rarity, uid: sl.uid, stored: !!sl.stored };
  }

  // ---------- 高階扭蛋（星輝 §8.1、神諭 §9.1）共用產生器 ----------
  // opt：flag（slimeTypes 上的旗標）、rates（由高到低）、guarantee（十連保底的稀有度集合）、hardPity、
  //      pityKey／ticketKey（state.shop 的欄位）、ticketName、cost1／cost10、maxStarGems
  function tierGacha(opt) {
    const order = Object.keys(opt.rates);          // 由高到低，例如 ['UR', 'SSR', 'SR']
    const top = order[0];
    function pool(rarity) {
      const types = Game.config.slimeTypes;
      return Object.keys(types).filter(function (k) { return types[k][opt.flag] && (!rarity || types[k].rarity === rarity); });
    }
    function roll(onlyGuarantee) {
      const cands = onlyGuarantee ? order.filter(function (r) { return opt.guarantee.indexOf(r) >= 0; }) : order;
      const total = cands.reduce(function (a, r) { return a + opt.rates[r]; }, 0);
      let x = Math.random() * total;
      for (let k = 0; k < cands.length; k++) { if ((x -= opt.rates[cands[k]]) < 0) return cands[k]; }
      return cands[cands.length - 1];
    }
    const g = {
      rates: opt.rates,
      hardPity: opt.hardPity,
      cost: function (n) { return n >= 10 ? opt.cost10 * Math.floor(n / 10) : opt.cost1 * n; },   // 百連 = 十連 × 10
      pityLeft: function () { return opt.hardPity - sh()[opt.pityKey]; },
      pool: function () { return pool(); },
      tickets: function () { return sh()[opt.ticketKey]; },
      addTickets: function (n) {
        n = Math.max(0, Math.floor(n || 0));
        if (!n) return 0;
        sh()[opt.ticketKey] += n;
        Game.emit('toast', '獲得' + opt.ticketName + ' ×' + n);
        Game.emit('change');
        return sh()[opt.ticketKey];
      },
      // n = 1、10、100；useTicket=true 時用券（1 張 = 1 抽，十連要 10 張；百連不能用券）
      pull: function (n, useTicket) {
        n = n === 100 ? 100 : n === 10 ? 10 : 1;
        if (useTicket && n === 100) return { ok: false, msg: '百連不能使用' + opt.ticketName, results: [] };
        if (useTicket) {
          if (sh()[opt.ticketKey] < n) return { ok: false, msg: opt.ticketName + '不足', results: [] };
          sh()[opt.ticketKey] -= n;
        } else {
          const cost = g.cost(n);
          if (Game.state.gems < cost) { Game.offer('noGems'); return { ok: false, msg: '寶石不足', results: [] }; }
          Game.state.gems -= cost;
        }
        if (n >= 10) Game.state.stats.tenPulls += n / 10;
        const results = [];
        for (let i = 0; i < n; i++) {
          let rarity;
          if (sh()[opt.pityKey] + 1 >= opt.hardPity) rarity = top;
          else if (n >= 10 && i % 10 === 9 && !results.slice(i - 9).some(function (x) { return opt.guarantee.indexOf(x.rarity) >= 0; })) rarity = roll(true);
          else rarity = roll(false);
          sh()[opt.pityKey] = rarity === top ? 0 : sh()[opt.pityKey] + 1;
          const p = pool(rarity);
          results.push(grant(p[Math.floor(Math.random() * p.length)], rarity, opt.maxStarGems));
        }
        results[opt.flag] = true;   // 'gacha' 事件的 data 仍是陣列（相容），另外帶 .premium 或 .oracle === true
        results.n = n;
        const stored = results.filter(function (x) { return x.stored; }).length;
        Game.emit('gacha', results);
        Game.emit('change');
        Game.save();
        const out = { ok: true, msg: stored ? '夥伴欄滿了，' + stored + ' 隻放進倉庫' : '抽卡完成', results: results };
        out[opt.flag] = true;
        return out;
      }
    };
    return g;
  }
  // 星輝扭蛋：UR 3%／SSR 20%／SR 77%；十連保底 SSR 以上；60 抽保底 UR；滿星送 150💎
  const premium = tierGacha({ flag: 'premium', rates: { UR: 0.03, SSR: 0.20, SR: 0.77 }, guarantee: ['SSR', 'UR'], hardPity: 60,
    pityKey: 'premiumPity', ticketKey: 'premiumTickets', ticketName: '星輝券', cost1: 300, cost10: 2700, maxStarGems: 150 });
  // 神諭扭蛋：LR 3%／UR 27%／SSR 70%；十連保底 UR 以上；70 抽保底 LR；滿星送 400💎
  const oracle = tierGacha({ flag: 'oracle', rates: { LR: 0.03, UR: 0.27, SSR: 0.70 }, guarantee: ['UR', 'LR'], hardPity: 70,
    pityKey: 'oraclePity', ticketKey: 'oracleTickets', ticketName: '神諭券', cost1: 600, cost10: 5400, maxStarGems: 400 });

  Game.gacha = {
    premium: premium,
    oracle: oracle,
    rates: RATES,
    hardPity: HARD_PITY,
    cost: function (n) { return n >= 10 ? 900 * Math.floor(n / 10) : 100 * n; },   // 百連 = 十連 × 10
    pityLeft: function () { return HARD_PITY - sh().pity; },
    // 自動販賣設定：'off' | 'R' | 'R_full'（SR/SSR 一律不會自動賣）
    autoSell: function () { return sh().autoSell; },
    setAutoSell: function (mode) {
      if (['off', 'R', 'R_full'].indexOf(mode) < 0) return false;
      sh().autoSell = mode;
      Game.emit('settings', { autoSell: mode, source: 'user' });
      Game.emit('change');
      Game.save();
      return true;
    },
    // 新手免費一抽（必出 SR）：累計金幣達到 FREE_PULL_GOLD 後才開放，避免一開局就跳過前期成長
    freePullGold: FREE_PULL_GOLD,
    freePullAvailable: function () { return !sh().firstPullDone && Game.state.totalGold >= FREE_PULL_GOLD; },
    // 給扭蛋頁進度條用；done=true 表示已經用掉免費一抽
    freePullProgress: function () {
      return { cur: Math.min(Game.state.totalGold, FREE_PULL_GOLD), need: FREE_PULL_GOLD, ready: Game.gacha.freePullAvailable(), done: !!sh().firstPullDone };
    },
    // free=true 時使用新手免費一抽（不扣寶石）
    // n = 1、10、100；百連視為 10 組十連（每組都有十連保底），硬保底照常延續
    pull: function (n, free) {
      n = n === 100 ? 100 : n === 10 ? 10 : 1;
      if (free) {
        if (!Game.gacha.freePullAvailable()) return { ok: false, msg: '免費抽卡尚未開放', results: [] };
        n = 1;
        sh().firstPullDone = true;
      } else {
        const cost = Game.gacha.cost(n);
        if (Game.state.gems < cost) { Game.offer('noGems'); return { ok: false, msg: '寶石不足', results: [] }; }
        Game.state.gems -= cost;
        if (n >= 10) Game.state.stats.tenPulls += n / 10;
      }

      const results = [];
      for (let i = 0; i < n; i++) {
        let rarity;
        if (free) rarity = 'SR';
        else if (sh().pity + 1 >= HARD_PITY) rarity = 'SSR';
        else if (n >= 10 && i % 10 === 9 && !results.slice(i - 9).some(function (x) { return x.rarity === 'SR' || x.rarity === 'SSR'; })) rarity = rollRarity(true);
        else rarity = rollRarity(false);
        sh().pity = rarity === 'SSR' ? 0 : sh().pity + 1;

        // N：金幣袋（目前 5 分鐘產量）；R：魔晶史萊姆 Lv10（可以直接拿去合成）；SR/SSR：技能角色
        if (rarity === 'N') {
          const g = Math.max(100, Game.totalRate() * 300);
          Game.addGold(g);
          results.push({ typeId: null, kind: 'gold', rarity: rarity, gold: g });
          continue;
        }
        if (rarity === 'R') {
          // 自動販賣：'R' 一律賣；'R_full' 只在牧場滿、要進倉庫時才賣（圖鑑照樣記錄）
          const mode = sh().autoSell;
          const full = !Game.hasRoom(false);
          if (mode === 'R' || (mode === 'R_full' && full)) {
            const g = Game.sellValue({ type: 'purple', level: 10 }).gold;
            Game.addGold(g);
            Game.state.codex.purple = (Game.state.codex.purple || 0) + 1;
            results.push({ typeId: 'purple', rarity: rarity, level: 10, sold: true, gold: g });
            continue;
          }
          const sl = Game.addSlime('purple', false, true);
          sl.level = 10;
          results.push({ typeId: 'purple', rarity: rarity, uid: sl.uid, level: 10, stored: !!sl.stored });
          continue;
        }
        const pool = poolOf(rarity);
        results.push(grant(pool[Math.floor(Math.random() * pool.length)], rarity, 50));
      }
      const stored = results.filter(function (x) { return x.stored; }).length;
      const soldN = results.filter(function (x) { return x.sold; }).length;
      const msg = [stored ? '牧場滿了，' + stored + ' 隻放進倉庫' : '', soldN ? '自動賣出 ' + soldN + ' 隻魔晶' : ''].filter(Boolean).join('；') || '抽卡完成';
      results.n = n;
      Game.emit('gacha', results);
      Game.emit('change');
      Game.save();
      return { ok: true, msg: msg, results: results };
    }
  };

  // ---------- 每日登入與每日任務（免費寶石來源）----------
  const LOGIN_REWARDS = [20, 30, 40, 50, 60, 80, 300]; // 7 天循環
  const TASKS = [
    { id: 'click',   name: '點擊牧場 100 次', goal: 100, reward: 20 },
    { id: 'levelup', name: '升級史萊姆 3 次', goal: 3,   reward: 20 },
    { id: 'merge',   name: '合成史萊姆 1 次', goal: 1,   reward: 20 }
  ];
  function dl() { return Game.state.daily; }
  function yesterday() { return new Date(Date.now() - DAY).toISOString().slice(0, 10); }

  Game.daily = {
    loginRewards: LOGIN_REWARDS,
    tasks: TASKS,
    // 換日時重置任務並推進登入天數
    roll: function () {
      const d = dl();
      if (d.day === today()) return;
      d.loginStreak = d.loginDay === yesterday() ? d.loginStreak % 7 + 1 : 1;
      d.loginDay = today();
      d.loginClaimed = false;
      d.counts = { click: 0, levelup: 0, merge: 0 };
      d.taskClaimed = {};
      d.day = today();
    },
    loginDayIndex: function () { Game.daily.roll(); return dl().loginStreak - 1; }, // 0-6，今天是循環的第幾天
    canClaimLogin: function () { Game.daily.roll(); return !dl().loginClaimed; },
    claimLogin: function () {
      if (!Game.daily.canClaimLogin()) return { ok: false, msg: '今天已經領過了' };
      const g = LOGIN_REWARDS[dl().loginStreak - 1];
      dl().loginClaimed = true;
      Game.state.gems += g;
      Game.emit('toast', '登入第 ' + dl().loginStreak + ' 天：' + g + ' 寶石');
      Game.emit('change');
      return { ok: true, msg: '獲得 ' + g + ' 寶石', gems: g };
    },
    progress: function (taskId) {
      Game.daily.roll();
      const t = TASKS.find(function (x) { return x.id === taskId; });
      const c = dl().counts[taskId] || 0;
      return { count: Math.min(c, t.goal), goal: t.goal, done: c >= t.goal, claimed: !!dl().taskClaimed[taskId] };
    },
    claimTask: function (taskId) {
      const t = TASKS.find(function (x) { return x.id === taskId; });
      const p = t && Game.daily.progress(taskId);
      if (!p || !p.done) return { ok: false, msg: '任務尚未完成' };
      if (p.claimed) return { ok: false, msg: '已經領過了' };
      dl().taskClaimed[taskId] = true;
      Game.state.gems += t.reward;
      Game.emit('toast', '任務完成：' + t.reward + ' 寶石');
      Game.emit('change');
      return { ok: true, msg: '獲得 ' + t.reward + ' 寶石' };
    },
    // 有沒有可以領的東西（給 UI 紅點用）
    hasClaimable: function () {
      return Game.daily.canClaimLogin() || TASKS.some(function (t) { const p = Game.daily.progress(t.id); return p.done && !p.claimed; });
    }
  };
})();
