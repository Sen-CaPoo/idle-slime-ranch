// engine.js — 遊戲狀態、數值、tick、存讀檔、離線收益、轉生、金色訪客、事件（ccline-0b）
(function () {
  'use strict';
  const SAVE_KEY = 'pixelSlimeRanch.save.v1';
  const SAVE_VERSION = 10; // v2.0（9 = v1.9、8 = v1.8、7 = v1.7、6 = v1.6）；改存檔結構時 +1，並在 MIGRATIONS 加上舊版 → 新版的升級函式
  const TICK_MS = 100;
  const AUTOSAVE_MS = 10000;

  const Game = (window.Game = window.Game || {});

  // ---------- 數值表 ----------
  // baseCost=null：不能用金幣買。mergeFee：合成「成為這一種」時要付的金幣。noGacha：不在扭蛋池。
  // skillDef：扭蛋角色技能，只有放在牧場上才生效，同種只算星級最高的一隻；skill 是給 UI 的說明字串
  // skillDefs：技能陣列（LR 是雙技能）；請用 Game.skillDefsOf(id) 讀，單一 skillDef 和陣列都會轉成陣列
  Game.config = {
    slimeTypes: {
      green:   { id: 'green',   name: '草原史萊姆', tier: 1, rarity: 'N',   baseRate: 1,     baseCost: 10,   palette: { body: '#5fd35f', shade: '#2f8f3f', light: '#b8f5a0', eye: '#1a1a2e' }, evolvesTo: 'blue' },
      blue:    { id: 'blue',    name: '水滴史萊姆', tier: 2, rarity: 'N',   baseRate: 8,     baseCost: 250,  palette: { body: '#4fa8ff', shade: '#2357b8', light: '#b5e0ff', eye: '#1a1a2e' }, evolvesTo: 'purple', mergeFee: 2e4 },
      purple:  { id: 'purple',  name: '魔晶史萊姆', tier: 3, rarity: 'R',   baseRate: 60,    baseCost: 6000, palette: { body: '#b06cff', shade: '#6a2fb8', light: '#e2c6ff', eye: '#1a1a2e' }, evolvesTo: 'gold', mergeFee: 5e6 },
      gold:    { id: 'gold',    name: '黃金史萊姆', tier: 4, rarity: 'SR',  baseRate: 450,   baseCost: null, palette: { body: '#ffd23f', shade: '#c08a10', light: '#fff3b0', eye: '#4a2a00' }, evolvesTo: 'rainbow', mergeFee: 3e9,
                 skillDef: { kind: 'visitor', base: 0.25, perStar: 0.05, fmt: '金色訪客獎勵 +{p}' } },
      rainbow: { id: 'rainbow', name: '虹光史萊姆', tier: 5, rarity: 'SSR', baseRate: 4000,  baseCost: null, palette: { body: '#ff6fb5', shade: '#b8327a', light: '#ffe0f0', eye: '#1a1a2e' }, evolvesTo: 'nebula', mergeFee: 1e11,
                 skillDef: { kind: 'crit', base: 0.03, perStar: 0.03, fmt: '暴擊率 +{p}' } },
      nebula:  { id: 'nebula',  name: '星雲史萊姆', tier: 6, rarity: 'SSR', baseRate: 35000, baseCost: null, palette: { body: '#5b6cff', shade: '#2a2f9a', light: '#c8d0ff', eye: '#0a0a2e' }, evolvesTo: 'corona', mergeFee: 5e11, noGacha: true },
      corona:  { id: 'corona',  name: '日冕史萊姆', tier: 7, rarity: 'SSR', baseRate: 3e5,   baseCost: null, palette: { body: '#ffb02e', shade: '#c0500a', light: '#fff0c0', eye: '#3a1000' }, evolvesTo: 'genesis', mergeFee: 5e13, noGacha: true },
      genesis: { id: 'genesis', name: '創世史萊姆', tier: 8, rarity: 'SSR', baseRate: 2.5e6, baseCost: null, palette: { body: '#f4f4ff', shade: '#9a9ac8', light: '#ffffff', eye: '#2a0a3a' }, evolvesTo: null, mergeFee: 5e15, noGacha: true },
      // 地區史萊姆：解鎖地區後才能用金幣買，產量介於既有階級之間，可以合成進主線的下一階（轉生後的捷徑），不在扭蛋池
      shell:   { id: 'shell',   name: '貝殼史萊姆', tier: 2, rarity: 'N',   baseRate: 3,     baseCost: 60,   palette: { body: '#ffc8a8', shade: '#d07a5a', light: '#fff0e6', eye: '#3a1a1a' }, evolvesTo: 'blue', zone: 'beach', noGacha: true },
      ember:   { id: 'ember',   name: '火山灰史萊姆', tier: 3, rarity: 'R', baseRate: 25,    baseCost: 1500, palette: { body: '#6a5a5a', shade: '#3a2a2a', light: '#ff8a3d', eye: '#ffd23f' }, evolvesTo: 'purple', zone: 'volcano', noGacha: true },
      snow:    { id: 'snow',    name: '雪人史萊姆', tier: 4, rarity: 'SR',  baseRate: 200,   baseCost: 4e4,  palette: { body: '#f0f8ff', shade: '#a8c8e8', light: '#ffffff', eye: '#1a1a2e' }, evolvesTo: 'gold', zone: 'snow', noGacha: true },
      cloud:   { id: 'cloud',   name: '雲朵史萊姆', tier: 5, rarity: 'SSR', baseRate: 1500,  baseCost: 1e6,  palette: { body: '#e8f0ff', shade: '#9ab0e0', light: '#ffffff', eye: '#2a3a6a' }, evolvesTo: 'rainbow', zone: 'sky', noGacha: true },
      // 星輝扭蛋限定（premium，DESIGN-v2 §8.2）：palette 為暫定色，27 會再調
      thunder:    { id: 'thunder',    name: '雷鳴史萊姆',   tier: 4, rarity: 'SR',  baseRate: 500,   baseCost: null, premium: true, palette: { body: '#ffe14a', shade: '#b89a10', light: '#fffbd0', eye: '#2a2000' }, evolvesTo: null,
                    skillDef: { kind: 'combat', base: 0.20, perStar: 0.10, fmt: '遠征傷害 +{p}' } },
      coral:      { id: 'coral',      name: '珊瑚史萊姆',   tier: 4, rarity: 'SR',  baseRate: 500,   baseCost: null, premium: true, palette: { body: '#ff8a8a', shade: '#c04a5a', light: '#ffd8d0', eye: '#2a0a10' }, evolvesTo: null,
                    skillDef: { kind: 'visitor', base: 0.40, perStar: 0.10, fmt: '金色訪客獎勵 +{p}' } },
      venom:      { id: 'venom',      name: '毒霧史萊姆',   tier: 4, rarity: 'SR',  baseRate: 500,   baseCost: null, premium: true, palette: { body: '#8a5ac8', shade: '#4a2a7a', light: '#c8f080', eye: '#0a1a00' }, evolvesTo: null,
                    skillDef: { kind: 'breakDmg', base: 0.3, perStar: 0.1, fmt: 'BREAK 傷害倍率 +{v}' } },
      sakura:     { id: 'sakura',     name: '櫻花史萊姆',   tier: 4, rarity: 'SR',  baseRate: 500,   baseCost: null, premium: true, palette: { body: '#ffb8d8', shade: '#d0709a', light: '#fff0f6', eye: '#3a1020' }, evolvesTo: null,
                    skillDef: { kind: 'click', base: 0.50, perStar: 0.25, fmt: '點擊金幣 +{p}' } },
      phoenix:    { id: 'phoenix',    name: '鳳凰史萊姆',   tier: 5, rarity: 'SSR', baseRate: 12000, baseCost: null, premium: true, palette: { body: '#ff7a2a', shade: '#c02a10', light: '#ffe08a', eye: '#3a0a00' }, evolvesTo: null,
                    skillDef: { kind: 'dust', base: 0.10, perStar: 0.05, fmt: '轉生星塵 +{p}' } },
      moon:       { id: 'moon',       name: '月影史萊姆',   tier: 5, rarity: 'SSR', baseRate: 12000, baseCost: null, premium: true, palette: { body: '#5a6aa8', shade: '#2a2a5a', light: '#e8ecff', eye: '#fff6c0' }, evolvesTo: null,
                    skillDef: { kind: 'offline', base: 2, perStar: 1, fmt: '離線上限 +{v} 小時' } },
      yggdrasil:  { id: 'yggdrasil',  name: '世界樹史萊姆', tier: 5, rarity: 'SSR', baseRate: 12000, baseCost: null, premium: true, palette: { body: '#4ab86a', shade: '#2a6a3a', light: '#d8ffb0', eye: '#1a2a0a' }, evolvesTo: null,
                    skillDef: { kind: 'prod', base: 0.20, perStar: 0.10, fmt: '全體產量 +{p}' } },
      mecha:      { id: 'mecha',      name: '機械史萊姆',   tier: 5, rarity: 'SSR', baseRate: 12000, baseCost: null, premium: true, palette: { body: '#a8b8c8', shade: '#5a6a7a', light: '#e8f4ff', eye: '#ff3a3a' }, evolvesTo: null,
                    skillDef: { kind: 'crit', base: 0.05, perStar: 0.02, fmt: '暴擊率 +{p}' } },
      chrono:     { id: 'chrono',     name: '時空史萊姆',   tier: 6, rarity: 'UR',  baseRate: 80000, baseCost: null, premium: true, palette: { body: '#6ad8ff', shade: '#2a5aa8', light: '#f0ffff', eye: '#1a0a3a' }, evolvesTo: null,
                    skillDef: { kind: 'prod', base: 0.40, perStar: 0.15, fmt: '全體產量 +{p}' } },
      dragonlord: { id: 'dragonlord', name: '龍王史萊姆',   tier: 6, rarity: 'UR',  baseRate: 80000, baseCost: null, premium: true, palette: { body: '#d83a2a', shade: '#7a1010', light: '#ffc060', eye: '#ffe000' }, evolvesTo: null,
                    skillDef: { kind: 'combat', base: 0.60, perStar: 0.20, fmt: '遠征傷害 +{p}' } },
      astral:     { id: 'astral',     name: '星神史萊姆',   tier: 6, rarity: 'UR',  baseRate: 80000, baseCost: null, premium: true, palette: { body: '#2a1a5a', shade: '#100830', light: '#c8b0ff', eye: '#fff6a0' }, evolvesTo: null,
                    skillDef: { kind: 'dust', base: 0.25, perStar: 0.10, fmt: '轉生星塵 +{p}' } },
      // 神諭扭蛋限定（oracle，DESIGN-v2 §9.2）：palette 為暫定色，27 會再調；LR 有兩個技能（skillDefs）
      aurora:     { id: 'aurora',     name: '極光史萊姆',   tier: 6, rarity: 'SSR', baseRate: 30000,   baseCost: null, oracle: true, palette: { body: '#7af0c8', shade: '#2a9a8a', light: '#e0fff4', eye: '#0a2a2a' }, evolvesTo: null,
                    skillDef: { kind: 'visitor', base: 0.60, perStar: 0.15, fmt: '金色訪客獎勵 +{p}' } },
      abyss:      { id: 'abyss',      name: '深淵史萊姆',   tier: 6, rarity: 'SSR', baseRate: 30000,   baseCost: null, oracle: true, palette: { body: '#2a2a5a', shade: '#0a0a2a', light: '#7a5ad8', eye: '#ff4a8a' }, evolvesTo: null,
                    skillDef: { kind: 'breakDmg', base: 0.5, perStar: 0.15, fmt: 'BREAK 傷害倍率 +{v}' } },
      tempest:    { id: 'tempest',    name: '風暴史萊姆',   tier: 6, rarity: 'SSR', baseRate: 30000,   baseCost: null, oracle: true, palette: { body: '#4a8ad8', shade: '#1a3a8a', light: '#c8e8ff', eye: '#ffffff' }, evolvesTo: null,
                    skillDef: { kind: 'combat', base: 0.40, perStar: 0.15, fmt: '遠征傷害 +{p}' } },
      seraph:     { id: 'seraph',     name: '熾天使史萊姆', tier: 7, rarity: 'UR',  baseRate: 200000,  baseCost: null, oracle: true, palette: { body: '#fff4d0', shade: '#d8b060', light: '#ffffff', eye: '#3a2a10' }, evolvesTo: null,
                    skillDef: { kind: 'prod', base: 0.50, perStar: 0.15, fmt: '全體產量 +{p}' } },
      nocturne:   { id: 'nocturne',   name: '冥夜史萊姆',   tier: 7, rarity: 'UR',  baseRate: 200000,  baseCost: null, oracle: true, palette: { body: '#3a1a4a', shade: '#1a0a20', light: '#a87ad8', eye: '#ffd23f' }, evolvesTo: null,
                    skillDef: { kind: 'offline', base: 4, perStar: 2, fmt: '離線上限 +{v} 小時' } },
      primordial: { id: 'primordial', name: '原初龍史萊姆', tier: 7, rarity: 'UR',  baseRate: 200000,  baseCost: null, oracle: true, palette: { body: '#c8401a', shade: '#6a1008', light: '#ffb060', eye: '#fff000' }, evolvesTo: null,
                    skillDef: { kind: 'combat', base: 0.80, perStar: 0.25, fmt: '遠征傷害 +{p}' } },
      eternal:    { id: 'eternal',    name: '永恆史萊姆',   tier: 8, rarity: 'LR',  baseRate: 1500000, baseCost: null, oracle: true, palette: { body: '#f8f4ff', shade: '#b8a8d8', light: '#ffffff', eye: '#4a3a7a' }, evolvesTo: null,
                    skillDefs: [{ kind: 'prod', base: 0.80, perStar: 0.20, fmt: '全體產量 +{p}' }, { kind: 'dust', base: 0.20, perStar: 0.05, fmt: '轉生星塵 +{p}' }] },
      cosmos:     { id: 'cosmos',     name: '宇宙史萊姆',   tier: 8, rarity: 'LR',  baseRate: 1500000, baseCost: null, oracle: true, palette: { body: '#1a1040', shade: '#08041a', light: '#8ab8ff', eye: '#ffffff' }, evolvesTo: null,
                    skillDefs: [{ kind: 'combat', base: 1.00, perStar: 0.30, fmt: '遠征傷害 +{p}' }, { kind: 'breakDmg', base: 0.5, perStar: 0.1, fmt: 'BREAK 傷害倍率 +{v}' }] },
      oracle:     { id: 'oracle',     name: '神諭史萊姆',   tier: 8, rarity: 'LR',  baseRate: 1500000, baseCost: null, oracle: true, palette: { body: '#ffe8a0', shade: '#c8a040', light: '#fffbe8', eye: '#2a1a00' }, evolvesTo: null,
                    skillDefs: [{ kind: 'click', base: 2.00, perStar: 0.50, fmt: '點擊金幣 +{p}' }, { kind: 'crit', base: 0.10, perStar: 0.03, fmt: '暴擊率 +{p}' }] },
      // 扭蛋限定
      fire:    { id: 'fire',    name: '熔岩史萊姆', tier: 3, rarity: 'SR',  baseRate: 150,   baseCost: null, palette: { body: '#ff6a3d', shade: '#b8301a', light: '#ffc9a0', eye: '#2a0a00' }, evolvesTo: null,
                 skillDef: { kind: 'prod', base: 0.10, perStar: 0.10, fmt: '全體產量 +{p}' } },
      ice:     { id: 'ice',     name: '冰晶史萊姆', tier: 3, rarity: 'SR',  baseRate: 150,   baseCost: null, palette: { body: '#9ff0ff', shade: '#3fa6c8', light: '#ffffff', eye: '#0a2a3a' }, evolvesTo: null,
                 skillDef: { kind: 'offline', base: 1, perStar: 1, fmt: '離線上限 +{v} 小時' } },
      king:    { id: 'king',    name: '史萊姆王',   tier: 5, rarity: 'SSR', baseRate: 6000,  baseCost: null, palette: { body: '#3dd6a8', shade: '#1a8a6a', light: '#c0ffe8', eye: '#1a1a2e' }, evolvesTo: null,
                 skillDef: { kind: 'mergeExtra', base: 0.10, perStar: 0.05, fmt: '合成時 {p} 機率多得一隻' } }
    },
    upgrades: {
      click:    { name: '強化手套', desc: '點擊金幣 ×2',  baseCost: 50,   growth: 3.5, max: 30 },
      capacity: { name: '擴建牧場', desc: '上限 +2 隻',   baseCost: 2000, growth: 5,   max: 15 },
      prodMult: { name: '高級飼料', desc: '產量 +25%',    baseCost: 5000, growth: 3,   max: 50 }
    },
    baseCapacity: 6,
    slimeCostGrowth: 1.25,   // 同種越買越貴
    levelCostGrowth: 1.15,
    levelPayback: 20,
    levelPaybackTier: 3.2,
    // 產量 = 基礎 × 等級 × 已達成的里程碑倍率
    milestones: [{ level: 10, mult: 2 }, { level: 25, mult: 2 }, { level: 50, mult: 2 }, { level: 100, mult: 2 }],
    mergeLevel: 10,          // 合成門檻：3 隻都要達到這個等級；新史萊姆繼承其中最低的等級
    offlineCapHours: 8,
    offlineGemCost: 30,
    critChance: 0.1,
    critMult: 5,
    // 轉生：本輪金幣 ≥ prestigeMin 才能轉生；星塵 = floor(cbrt(本輪金幣 / prestigeDiv))
    // 產量加成看「累計獲得的星塵」（花掉也不會少），每點 +10%
    prestigeMin: 1e11,
    prestigeDiv: 1e8,
    dustBonus: 0.10,
    dustUpgrades: {
      startGold: { name: '開局資金', desc: '轉生後起始金幣 ×10',   baseCost: 5,  growth: 2,   max: 8 },
      capacity:  { name: '大牧場',   desc: '牧場上限 +2',          baseCost: 10, growth: 2,   max: 5 },
      offline:   { name: '時光沙漏', desc: '離線上限 +1 小時',     baseCost: 8,  growth: 2,   max: 8 },
      visitor:   { name: '金色誘餌', desc: '金色訪客出現頻率 +20%', baseCost: 8,  growth: 2,   max: 5 },
      click:     { name: '星之手套', desc: '點擊金幣 ×2',          baseCost: 5,  growth: 1.8, max: 10 },
      resonance: { name: '星塵共鳴', desc: '全體產量 +5%（無上限）', baseCost: 20, growth: 1.6, max: Infinity }
    },
    // 地區：依序用星塵解鎖，每解鎖一區全體產量 ×1.5，並開放該區的史萊姆
    zones: [
      { id: 'meadow',  name: '草原',   cost: 0 },
      { id: 'beach',   name: '海邊',   cost: 350 },
      { id: 'volcano', name: '火山',   cost: 2500 },
      { id: 'snow',    name: '雪山',   cost: 15000 },
      { id: 'sky',     name: '天空城', cost: 100000 }
    ],
    zoneMult: 1.5,
    // 金色訪客：頁面可見時每 visitorMin~visitorMax 秒出現一次，停留 visitorStay 秒
    visitorMin: 45, visitorMax: 100, visitorStay: 10,
    frenzyMult: 7, frenzySec: 30
  };
  // 稀有度由低到高；UI 排序、徽章請用 Game.rarityRank()
  Game.config.rarities = ['N', 'R', 'SR', 'SSR', 'UR', 'LR'];
  Game.rarityRank = function (r) { return Game.config.rarities.indexOf(r); };
  // 給 UI 的技能說明（不含星級）
  Object.keys(Game.config.slimeTypes).forEach(function (id) {
    const t = Game.config.slimeTypes[id];
    const defs = t.skillDefs || (t.skillDef ? [t.skillDef] : []);
    if (defs.length) t.skill = defs.map(function (d) { return skillText(d, 0) + '（每星 +' + fmtSkill(d, d.perStar) + '）'; }).join('；');
  });
  function fmtSkill(d, v) { return d.fmt.indexOf('{p}') >= 0 ? Math.round(v * 100) + '%' : String(Math.round(v * 100) / 100); }
  function skillText(d, star) {
    const v = d.base + d.perStar * (star || 0);
    return d.fmt.replace('{p}', Math.round(v * 100) + '%').replace('{v}', String(Math.round(v * 100) / 100));   // 避免 0.6000000000000001
  }

  // ---------- 事件 ----------
  const listeners = {};
  Game.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); };
  let batchDepth = 0, batchDirty = false;
  Game.emit = function (evt, data) {
    if (evt === 'change' && batchDepth > 0) { batchDirty = true; return; }
    (listeners[evt] || []).forEach(function (fn) {
      try { fn(data); } catch (e) { console.error('[Game] listener error', evt, e); }
    });
  };

  // 包在 batch 裡的操作只會在最後送出一次 'change'（例如 UI 按住連續升級）
  Game.batch = function (fn) {
    batchDepth++;
    try { return fn(); } finally {
      batchDepth--;
      if (batchDepth === 0 && batchDirty) { batchDirty = false; Game.emit('change'); }
    }
  };

  // ---------- 狀態 ----------
  function newState() {
    const now = Date.now();
    return {
      gold: 0, gems: 100, totalGold: 0, runGold: 0, clickPower: 1,
      pendingOffline: null, // {seconds, gold}，等玩家用 claimOffline 領取
      slimes: [{ uid: 1, type: 'green', level: 1, star: 0 }],
      storage: [], // 倉庫（扭蛋抽到但牧場滿時放這裡）
      nextUid: 2,
      upgrades: { click: 0, capacity: 0, prodMult: 0 },
      bought: {}, // typeId -> 本輪用金幣買過的數量（決定價格）
      prestige: { count: 0, dust: 0, totalDust: 0, upgrades: { startGold: 0, capacity: 0, offline: 0, visitor: 0, click: 0, resonance: 0 } },
      frenzyUntil: 0,
      // 以下轉生保留
      codex: { green: 1 }, // typeId -> 累計獲得次數
      stats: { buys: 0, merges: 0, visitors: 0, tenPulls: 0, maxLevel: 1 },
      achieved: {},   // achievementId -> true
      zones: { meadow: true }, // 已解鎖的地區
      zone: 'meadow',          // 目前選擇的地區（只影響背景）
      settings: { quality: 'high', autoQuality: true, artStyle: 'modern' }, // 畫質（hd2d.js）；autoQuality=false 表示玩家手動指定；artStyle：'modern'（現代 RPG，預設）或 'pixel'（經典像素）
      shop: {
        firstBuyDone: {}, totalSpent: 0, vip: 0, monthCardUntil: 0, monthCardLastClaim: '',
        boostUntil: 0, adBoostsToday: 0, adBoostDay: '', starterPackBought: false, pity: 0,
        firstPullDone: false, offersShown: {}, autoSell: 'off' /* 扭蛋 R 自動販賣：'off' | 'R' | 'R_full' */,
        premiumPity: 0, premiumTickets: 0 /* 星輝扭蛋：UR 保底計數、星輝券 */,
        oraclePity: 0, oracleTickets: 0 /* 神諭扭蛋：LR 保底計數、神諭券 */
      },
      daily: { day: '', loginDay: '', loginStreak: 0, loginClaimed: false, counts: { click: 0, levelup: 0, merge: 0 }, taskClaimed: {} },
      lastTick: now, createdAt: now,
      saveVersion: SAVE_VERSION
    };
  }
  Game.state = newState();

  // ---------- 工具 ----------
  const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  Game.fmt = function (n) {
    if (n !== n) return '0';                 // NaN
    if (n === Infinity) return '∞';
    n = Math.floor(n);
    if (n < 1000) return String(n);
    if (n >= 1e36) {                         // 超過單位表：科學記號 1.23e45
      const e = Math.floor(Math.log10(n));
      let m = n / Math.pow(10, e);
      if (m >= 9.995) return '1.00e' + (e + 1);
      return m.toFixed(2) + 'e' + e;
    }
    let i = 0;
    while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
    return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + UNITS[i];
  };

  function typeOf(id) { return Game.config.slimeTypes[id]; }

  // ---------- 技能 ----------
  Game.skillDefsOf = function (typeId) {
    const t = typeOf(typeId);
    return t ? (t.skillDefs || (t.skillDef ? [t.skillDef] : [])) : [];
  };
  Game.skillText = function (typeId, star) {
    return Game.skillDefsOf(typeId).map(function (d) { return skillText(d, star); }).join('；');
  };
  // 牧場上每種只取星級最高的一隻 → {prod, offline, mergeExtra, crit, visitor, combat, breakDmg, click, dust}
  // combat、breakDmg 由 dungeon.js 讀取；click、dust 在引擎生效
  Game.skills = function () {
    const best = {};
    Game.state.slimes.forEach(function (sl) {
      if (Game.skillDefsOf(sl.type).length && (best[sl.type] == null || (sl.star || 0) > best[sl.type])) best[sl.type] = sl.star || 0;
    });
    const out = { prod: 0, offline: 0, mergeExtra: 0, crit: 0, visitor: 0, combat: 0, breakDmg: 0, click: 0, dust: 0 };
    Object.keys(best).forEach(function (id) {
      Game.skillDefsOf(id).forEach(function (d) { out[d.kind] += d.base + d.perStar * best[id]; });
    });
    return out;
  };

  // ---------- 產量 ----------
  // 全域倍率：牧場升級、星塵、技能、月卡、加速、VIP、副本（dungeon.js，a3 負責）、圖鑑、成就、地區、星塵共鳴
  Game.dustMult = function () { return 1 + Game.config.dustBonus * Game.state.prestige.totalDust; };
  Game.globalMult = function () {
    const s = Game.state;
    let m = (1 + 0.25 * s.upgrades.prodMult) * Game.dustMult() * (1 + Game.skills().prod);
    if (Game.shop && Game.shop.monthCardActive()) m *= 1.2;
    if (Game.shop && Game.shop.boostActive()) m *= 2;
    if (Game.shop) m *= 1 + Game.shop.vipBonus();
    if (Game.dungeon) m *= Game.dungeon.mult();
    m *= Game.codexMult() * Game.achievementMult() * Game.zoneMult() * (1 + 0.05 * s.prestige.upgrades.resonance);
    return m;
  };
  Game.milestoneMult = function (lv) {
    return Game.config.milestones.reduce(function (m, x) { return lv >= x.level ? m * x.mult : m; }, 1);
  };
  // 下一個等級里程碑 → {level, mult, left}；已全部達成回傳 null
  Game.nextMilestone = function (slime) {
    const m = Game.config.milestones.find(function (x) { return slime.level < x.level; });
    return m ? { level: m.level, mult: m.mult, left: m.level - slime.level } : null;
  };
  // gm：全域倍率（可省略）。加總很多隻時請先算一次 globalMult 再傳進來，避免每隻都重算技能
  Game.rateOf = function (slime, gm) {
    const t = typeOf(slime.type);
    return t.baseRate * slime.level * Game.milestoneMult(slime.level) * (1 + 0.5 * (slime.star || 0)) * (gm == null ? Game.globalMult() : gm);
  };
  Game.totalRate = function () {
    const gm = Game.globalMult();
    return Game.state.slimes.reduce(function (sum, sl) { return sum + Game.rateOf(sl, gm); }, 0);
  };
  // 牧場分兩欄：主線史萊姆（capacity）和夥伴（扭蛋／禮包角色，gacha:true，companionCap）
  // 夥伴不占主線格子，避免收集扭蛋角色擠掉合成主線；夥伴上限 = 4 + 已解鎖地區數（草原開局就有）+ VIP 夥伴格
  Game.mainCount = function () { return Game.state.slimes.filter(function (x) { return !x.gacha; }).length; };
  Game.companionCount = function () { return Game.state.slimes.filter(function (x) { return x.gacha; }).length; };
  // VIP 給的夥伴格：VIP2 +1、VIP4 +2、VIP6 +3（課金看得到的效率感，但不碾壓）
  Game.vipCompanionSlots = function () {
    const v = Game.shop ? Game.shop.vipLevel() : 0;
    return v >= 6 ? 3 : v >= 4 ? 2 : v >= 2 ? 1 : 0;
  };
  Game.companionCap = function () { return 4 + Object.keys(Game.state.zones).filter(function (k) { return Game.state.zones[k]; }).length + Game.vipCompanionSlots(); };
  Game.hasRoom = function (gacha) { return gacha ? Game.companionCount() < Game.companionCap() : Game.mainCount() < Game.capacity(); };
  // 主線史萊姆的格數（夥伴另計）
  Game.capacity = function () {
    return Game.config.baseCapacity + 2 * Game.state.upgrades.capacity + 2 * Game.state.prestige.upgrades.capacity;
  };
  Game.slimeCost = function (typeId) {
    const t = typeOf(typeId);
    if (!t || t.baseCost == null || (t.zone && !Game.state.zones[t.zone])) return null;
    return Math.ceil(t.baseCost * Math.pow(Game.config.slimeCostGrowth, Game.state.bought[typeId] || 0));
  };
  // 升級成本基準 = 基礎產量 × 回本秒數；回本秒數每升一階 ×3.2（草原 10 秒、水滴 32 秒、魔晶 102 秒…）
  Game.upgradeSlimeCost = function (slime) {
    const t = typeOf(slime.type);
    const c = Game.config;
    const base = t.baseRate * c.levelPayback * Math.pow(c.levelPaybackTier, t.tier - 1);
    return Math.ceil(base * Math.pow(c.levelCostGrowth, slime.level));
  };
  Game.upgradeCost = function (key) {
    const u = Game.config.upgrades[key];
    const lv = Game.state.upgrades[key];
    if (lv >= u.max) return null;
    return Math.ceil(u.baseCost * Math.pow(u.growth, lv));
  };
  Game.clickValue = function () {
    const s = Game.state;
    let v = Math.max(1, Math.floor(s.clickPower * Math.pow(2, s.upgrades.click + s.prestige.upgrades.click) + Game.totalRate() * 0.05));
    if (Game.frenzyActive()) v *= Game.config.frenzyMult;
    return Math.floor(v * (1 + Game.skills().click));   // 櫻花史萊姆：點擊金幣 +50%/星 +25%
  };
  Game.frenzyActive = function () { return Game.state.frenzyUntil > Date.now(); };

  // ---------- 合成 ----------
  Game.mergeFee = function (typeId) {
    const t = typeOf(typeId);
    return t && t.evolvesTo ? typeOf(t.evolvesTo).mergeFee : null;
  };
  // 達門檻、等級最低的 3 隻；不夠就回傳 null
  function mergeSet(typeId) {
    const lv = Game.config.mergeLevel;
    const same = Game.state.slimes.filter(function (s) { return s.type === typeId && s.level >= lv; })
      .sort(function (a, b) { return a.level - b.level; });
    return same.length >= 3 ? same.slice(0, 3) : null;
  }
  // 合成進度（給 UI）：have=達門檻的隻數、total=牧場上同種隻數
  Game.mergeProgress = function (typeId) {
    const lv = Game.config.mergeLevel;
    const same = Game.state.slimes.filter(function (s) { return s.type === typeId; });
    return { have: same.filter(function (s) { return s.level >= lv; }).length, total: same.length, need: 3, minLevel: lv, fee: Game.mergeFee(typeId) };
  };
  Game.canMerge = function (typeId) {
    const t = typeOf(typeId);
    return !!(t && t.evolvesTo) && !!mergeSet(typeId) && Game.state.gold >= Game.mergeFee(typeId);
  };

  // 金幣上限 Number.MAX_VALUE，避免溢位成 Infinity 後存檔壞掉
  function capNum(x) { return x === Infinity ? Number.MAX_VALUE : x; }
  Game.addGold = function (n) {
    if (!isFinite(n) || n <= 0) return;
    const s = Game.state;
    s.gold = capNum(s.gold + n);
    s.totalGold = capNum(s.totalGold + n);
    s.runGold = capNum(s.runGold + n);
  };
  // 新增史萊姆；該欄滿時：force=true 硬塞進牧場，toStorage=true 放進倉庫，否則回傳 null。gacha=true 是夥伴（扭蛋／禮包角色）
  Game.addSlime = function (typeId, force, toStorage, gacha) {
    const s = Game.state;
    const sl = { uid: s.nextUid++, type: typeId, level: 1, star: 0 };
    if (gacha) sl.gacha = true;
    s.codex[typeId] = (s.codex[typeId] || 0) + 1;
    if (force || Game.hasRoom(gacha)) s.slimes.push(sl);
    else if (toStorage) { s.storage.push(sl); sl.stored = true; }
    else { s.nextUid--; return null; }
    return sl;
  };

  // ---------- 操作 ----------
  function spend(cost) {
    if (cost == null || Game.state.gold < cost) return false;
    Game.state.gold -= cost;
    return true;
  }
  Game.actions = {
    click: function () {
      // 10% 機率暴擊 ×5（虹光史萊姆技能可提高機率）
      const crit = Math.random() < Game.config.critChance + Game.skills().crit + (Game.dungeon ? Game.dungeon.relicBonus('crit') : 0);
      const gain = Game.clickValue() * (crit ? Game.config.critMult : 1);
      Game.addGold(gain);
      count('click');
      Game.emit('gold', { amount: gain, crit: crit });
      Game.emit('change');
      return gain;
    },
    buySlime: function (typeId) {
      const s = Game.state;
      if (!Game.hasRoom(false)) { Game.emit('toast', '牧場滿了！請擴建牧場或合成史萊姆'); offer('ranchFull'); return false; }
      if (!spend(Game.slimeCost(typeId))) { Game.emit('toast', '金幣不足'); return false; }
      s.bought[typeId] = (s.bought[typeId] || 0) + 1;
      s.stats.buys++;
      const sl = Game.addSlime(typeId);
      Game.emit('buy', sl);
      Game.emit('change');
      return true;
    },
    levelUp: function (uid) {
      const sl = Game.state.slimes.find(function (x) { return x.uid === uid; });
      if (!sl) return false;
      if (!spend(Game.upgradeSlimeCost(sl))) { Game.emit('toast', '金幣不足'); return false; }
      sl.level++;
      count('levelup');
      Game.state.stats.maxLevel = Math.max(Game.state.stats.maxLevel, sl.level);
      const ms = Game.config.milestones.find(function (x) { return x.level === sl.level; });
      if (ms) Game.emit('toast', typeOf(sl.type).name + ' 達到 Lv' + sl.level + '：產量 ×' + ms.mult + '！');
      Game.emit('levelup', { slime: sl, milestone: ms || null });
      Game.emit('change');
      return true;
    },
    merge: function (typeId) {
      if (!Game.canMerge(typeId)) {
        const p = Game.mergeProgress(typeId);
        Game.emit('toast', p.have < 3 ? '需要 3 隻 Lv' + p.minLevel + ' 以上的同種史萊姆' : '合成費用不足（' + Game.fmt(p.fee) + ' 金幣）');
        return null;
      }
      const s = Game.state;
      // 付合成費，移除達門檻且等級最低的 3 隻，新史萊姆繼承其中最低的等級
      const same = mergeSet(typeId);
      spend(Game.mergeFee(typeId));
      const ids = same.map(function (x) { return x.uid; });
      s.slimes = s.slimes.filter(function (x) { return ids.indexOf(x.uid) < 0; });
      const sl = Game.addSlime(typeOf(typeId).evolvesTo, true);
      sl.level = same[0].level;
      s.stats.merges++;
      // 史萊姆王技能：機率多得一隻（Lv1，牧場滿就進倉庫）
      const bonus = Math.random() < Game.skills().mergeExtra ? Game.addSlime(sl.type, false, true) : null;
      count('merge');
      Game.emit('merge', { from: typeId, removed: ids, slime: sl, bonus: bonus });
      Game.emit('toast', '進化成功：' + typeOf(sl.type).name + '！' + (bonus ? '史萊姆王發動：多得一隻！' : ''));
      Game.emit('change');
      offer('firstMerge');
      return sl;
    },
    // 倉庫 → 牧場
    fromStorage: function (uid) {
      const s = Game.state;
      const i = s.storage.findIndex(function (x) { return x.uid === uid; });
      if (i < 0) return false;
      if (!Game.hasRoom(s.storage[i].gacha)) { Game.emit('toast', s.storage[i].gacha ? '夥伴欄滿了！解鎖新地區可以增加夥伴上限' : '牧場滿了！'); return false; }
      const sl = s.storage.splice(i, 1)[0];
      delete sl.stored;
      s.slimes.push(sl);
      Game.emit('change');
      return true;
    },
    // 牧場 → 倉庫（倉庫裡的史萊姆不產金幣）
    toStorage: function (uid) {
      const s = Game.state;
      if (s.slimes.length <= 1) { Game.emit('toast', '牧場至少要留一隻史萊姆'); return false; }
      const i = s.slimes.findIndex(function (x) { return x.uid === uid; });
      if (i < 0) return false;
      const sl = s.slimes.splice(i, 1)[0];
      sl.stored = true;
      s.storage.push(sl);
      Game.emit('change');
      return true;
    },
    buyUpgrade: function (key) {
      if (!spend(Game.upgradeCost(key))) { Game.emit('toast', '金幣不足'); return false; }
      Game.state.upgrades[key]++;
      Game.emit('change');
      return true;
    },
    // 金幣能升多少級就升多少級；只送一次 'levelup' {slime, levels, milestone: 期間跨過的最高里程碑}，回傳升了幾級
    levelUpMax: function (uid) {
      const s = Game.state;
      const sl = s.slimes.find(function (x) { return x.uid === uid; });
      if (!sl) return 0;
      const from = sl.level;
      let n = 0;
      while (n < MAX_BATCH_LEVELS) {
        const c = Game.upgradeSlimeCost(sl);
        if (s.gold < c) break;
        s.gold -= c;
        sl.level++;
        n++;
      }
      if (!n) { Game.emit('toast', '金幣不足'); return 0; }
      for (let i = 0; i < n; i++) count('levelup');
      s.stats.maxLevel = Math.max(s.stats.maxLevel, sl.level);
      const crossed = Game.config.milestones.filter(function (x) { return x.level > from && x.level <= sl.level; });
      const ms = crossed.length ? crossed[crossed.length - 1] : null;
      if (ms) Game.emit('toast', typeOf(sl.type).name + ' 達到 Lv' + ms.level + '：產量 ×' + ms.mult + '！');
      Game.emit('levelup', { slime: sl, levels: n, milestone: ms });
      Game.emit('change');
      return n;
    },
    // 牧場升級買到金幣不夠或滿級為止，回傳買了幾級
    buyUpgradeMax: function (key) {
      const s = Game.state;
      let n = 0, c;
      while ((c = Game.upgradeCost(key)) != null && s.gold >= c) { s.gold -= c; s.upgrades[key]++; n++; }
      if (!n) { Game.emit('toast', Game.upgradeCost(key) == null ? '已經滿級' : '金幣不足'); return 0; }
      Game.emit('change');
      return n;
    },
    // ---- 賣史萊姆（只能賣倉庫裡的）----
    sell: function (uid) {
      const r = Game.actions.sellMany([uid]);
      return r.count ? r : null;
    },
    sellMany: function (uids) {
      const s = Game.state;
      let gold = 0, gems = 0;
      const sold = [];
      (uids || []).forEach(function (uid) {
        const i = s.storage.findIndex(function (x) { return x.uid === uid; });
        if (i < 0) return;
        const v = Game.sellValue(s.storage[i]);
        gold += v.gold; gems += v.gems;
        sold.push(s.storage.splice(i, 1)[0]);
      });
      if (!sold.length) { Game.emit('toast', '只能賣倉庫裡的史萊姆'); return { count: 0, gold: 0, gems: 0 }; }
      if (gold) Game.addGold(gold);
      s.gems += gems;
      Game.emit('sell', { uids: sold.map(function (x) { return x.uid; }), slimes: sold, gold: gold, gems: gems });
      Game.emit('toast', '賣出 ' + sold.length + ' 隻：' + [gold ? Game.fmt(gold) + ' 金幣' : '', gems ? gems + ' 寶石' : ''].filter(Boolean).join('、'));
      Game.emit('change');
      Game.save();
      return { count: sold.length, gold: gold, gems: gems };
    }
  };
  const MAX_BATCH_LEVELS = 10000;

  // 一鍵升級的預覽 → {levels, cost}（不改狀態）
  Game.levelUpMaxPreview = function (uid) {
    const sl = Game.state.slimes.find(function (x) { return x.uid === uid; });
    if (!sl) return { levels: 0, cost: 0 };
    const tmp = { type: sl.type, level: sl.level };
    let gold = Game.state.gold, cost = 0, n = 0;
    while (n < MAX_BATCH_LEVELS) {
      const c = Game.upgradeSlimeCost(tmp);
      if (gold < c) break;
      gold -= c; cost += c; tmp.level++; n++;
    }
    return { levels: n, cost: cost };
  };
  Game.upgradeMaxPreview = function (key) {
    const u = Game.config.upgrades[key];
    let lv = Game.state.upgrades[key], gold = Game.state.gold, cost = 0, n = 0;
    while (lv < u.max) {
      const c = Math.ceil(u.baseCost * Math.pow(u.growth, lv));
      if (gold < c) break;
      gold -= c; cost += c; lv++; n++;
    }
    return { levels: n, cost: cost };
  };

  // 售價：一般史萊姆退還（購買價＋升級花費）的 50%（升級花費用等比級數封閉式）；
  // 扭蛋／禮包角色（gacha）改給寶石：SR 20、SSR 50，每顆星 +10，不給金幣
  Game.sellValue = function (sl) {
    const t = typeOf(sl.type);
    if (!t) return { gold: 0, gems: 0 };
    if (sl.gacha) {
      // 星輝扭蛋：SR 60、SSR 150、UR 400，每星 +30；普通扭蛋：SR 20、SSR 50，每星 +10
      if (t.oracle) return { gold: 0, gems: ({ SSR: 200, UR: 600, LR: 1500 }[t.rarity] || 200) + 80 * (sl.star || 0) };   // 神諭扭蛋
      if (t.premium) return { gold: 0, gems: ({ SR: 60, SSR: 150, UR: 400 }[t.rarity] || 60) + 30 * (sl.star || 0) };
      const base = t.rarity === 'SSR' ? 50 : t.rarity === 'SR' ? 20 : 10;
      return { gold: 0, gems: base + 10 * (sl.star || 0) };
    }
    const c = Game.config;
    const unit = t.baseRate * c.levelPayback * Math.pow(c.levelPaybackTier, t.tier - 1);
    const g = c.levelCostGrowth;
    // Lv1 → Lv L 的總花費 = Σ_{k=1}^{L-1} unit × g^k = unit × g × (g^(L−1) − 1) / (g − 1)
    const upgradeSpent = unit * g * (Math.pow(g, sl.level - 1) - 1) / (g - 1);
    const buy = t.baseCost != null ? t.baseCost : (t.mergeFee || 0);
    return { gold: Math.floor(0.5 * (buy + upgradeSpent)), gems: 0 };
  };

  // ---------- 轉生 ----------
  Game.prestigeGain = function () {
    if (Game.state.runGold < Game.config.prestigeMin) return 0;
    // 鳳凰、星神史萊姆：轉生星塵 ×(1 + dust)
    return Math.floor(Math.cbrt(Game.state.runGold / Game.config.prestigeDiv) * (1 + Game.skills().dust));
  };
  Game.canPrestige = function () { return Game.prestigeGain() > 0; };
  // 轉生後星塵加成的倍率變化（現在 → 轉生後）
  Game.prestigePreviewMult = function () {
    const d = Game.state.prestige.totalDust, b = Game.config.dustBonus;
    return (1 + b * (d + Game.prestigeGain())) / (1 + b * d);
  };
  Game.zones = function () {
    const z = Game.state.zones;
    return Game.config.zones.map(function (x, i) {
      const prev = i === 0 || z[Game.config.zones[i - 1].id];
      return { id: x.id, name: x.name, cost: x.cost, unlocked: !!z[x.id], available: !z[x.id] && !!prev,
        slime: Object.keys(Game.config.slimeTypes).find(function (k) { return Game.config.slimeTypes[k].zone === x.id; }) || null };
    });
  };
  // 目前所在地區（背景）→ {id, name}；配色和背景由 render 端依 id 決定
  Game.zone = function () {
    const z = Game.config.zones.find(function (x) { return x.id === Game.state.zone; }) || Game.config.zones[0];
    return { id: z.id, name: z.name };
  };
  Game.zoneMult = function () {
    return Math.pow(Game.config.zoneMult, Object.keys(Game.state.zones).length - 1);
  };
  // 依序解鎖（必須先解鎖前一區），花可用星塵
  Game.actions.unlockZone = function (id) {
    const z = Game.zones().find(function (x) { return x.id === id; });
    const p = Game.state.prestige;
    if (!z || !z.available) { Game.emit('toast', '要先解鎖前一個地區'); return false; }
    if (p.dust < z.cost) { Game.emit('toast', '星塵不足（需要 ' + z.cost + '）'); return false; }
    p.dust -= z.cost;
    Game.state.zones[id] = true;
    Game.state.zone = id;
    Game.emit('zone', { id: id, name: z.name, unlocked: true });
    Game.emit('toast', '解鎖新地區：' + z.name + '！全體產量 ×' + Game.config.zoneMult);
    Game.emit('change');
    Game.save();
    return true;
  };
  // 切換背景地區（只能選已解鎖的）
  Game.actions.setZone = function (id) {
    if (!Game.state.zones[id]) return false;
    Game.state.zone = id;
    Game.emit('zone', { id: id, unlocked: false });
    Game.emit('change');
    return true;
  };
  Game.dustUpgradeCost = function (key) {
    const u = Game.config.dustUpgrades[key];
    const lv = Game.state.prestige.upgrades[key];
    return lv >= u.max ? null : Math.ceil(u.baseCost * Math.pow(u.growth, lv));
  };
  function startGold() {
    const lv = Game.state.prestige.upgrades.startGold;
    return lv ? 100 * Math.pow(10, lv) : 0;
  }
  // 重置：金幣、牧場升級、合成線史萊姆。保留：寶石、扭蛋/禮包角色（等級回到 1、星級保留）、星塵、月卡、VIP
  Game.actions.prestige = function () {
    const s = Game.state;
    const gain = Game.prestigeGain();
    if (gain < 1) { Game.emit('toast', '本輪累計 ' + Game.fmt(Game.config.prestigeMin) + ' 金幣才能轉生'); return { ok: false, msg: '還不能轉生' }; }
    const kept = s.slimes.concat(s.storage).filter(function (x) { return x.gacha; });
    s.prestige.dust += gain;
    s.prestige.totalDust += gain;
    s.prestige.count++;
    s.runGold = 0;
    s.upgrades = { click: 0, capacity: 0, prodMult: 0 };
    s.bought = {};
    s.slimes = [{ uid: s.nextUid++, type: 'green', level: 1, star: 0 }];
    s.storage = [];
    kept.forEach(function (x) {
      x.level = 1;
      delete x.stored;
      if (Game.hasRoom(true)) s.slimes.push(x); else { x.stored = true; s.storage.push(x); }
    });
    s.gold = startGold();
    s.pendingOffline = null;
    Game.emit('prestige', { stardust: gain, count: s.prestige.count });
    Game.emit('toast', '轉生成功！獲得 ' + gain + ' 星塵');
    Game.emit('change');
    Game.save();
    return { ok: true, msg: '獲得 ' + gain + ' 星塵', stardust: gain };
  };
  Game.actions.buyDustUpgrade = function (key) {
    const p = Game.state.prestige;
    const c = Game.dustUpgradeCost(key);
    if (c == null || p.dust < c) { Game.emit('toast', '星塵不足'); return false; }
    p.dust -= c;
    p.upgrades[key]++;
    Game.emit('change');
    return true;
  };

  // ---------- 金色訪客 ----------
  // Game.visitor = {nextAt, activeUntil}；activeUntil > now 表示訪客正在牧場上，render 讀這個來畫
  Game.visitor = { nextAt: 0, activeUntil: 0 };
  let visible = true;
  Game.setVisible = function (v) {
    visible = !!v;
    if (visible) scheduleVisitor(); // 回到頁面才重新排程，避免背景累積
  };
  function scheduleVisitor() {
    const c = Game.config;
    const freq = 1 + 0.2 * Game.state.prestige.upgrades.visitor;
    const sec = (c.visitorMin + Math.random() * (c.visitorMax - c.visitorMin)) / freq;
    Game.visitor.nextAt = Date.now() + sec * 1000;
    Game.visitor.activeUntil = 0;
  }
  function updateVisitor(now) {
    const v = Game.visitor;
    if (!visible) return;
    if (!v.nextAt) scheduleVisitor();
    if (v.activeUntil && now > v.activeUntil) { scheduleVisitor(); Game.emit('visitorLeave'); return; }
    if (!v.activeUntil && now >= v.nextAt) {
      v.activeUntil = now + Game.config.visitorStay * 1000;
      Game.emit('visitor', { until: v.activeUntil });
    }
  }
  Game.visitorActive = function () { return Game.visitor.activeUntil > Date.now(); };
  // 點到訪客 → {kind:'gold'|'frenzy'|'gems', amount}；黃金史萊姆技能提高獎勵
  Game.actions.catchVisitor = function () {
    if (!Game.visitorActive()) return null;
    const bonus = 1 + Game.skills().visitor;
    const r = Math.random();
    let res;
    if (r < 0.6) {
      const g = Game.totalRate() * 60 * bonus;
      Game.addGold(g);
      Game.emit('gold', { amount: g, visitor: true });
      res = { kind: 'gold', amount: g };
      Game.emit('toast', '金色訪客：獲得 ' + Game.fmt(g) + ' 金幣！');
    } else if (r < 0.9) {
      const sec = Game.config.frenzySec * bonus;
      Game.state.frenzyUntil = Date.now() + sec * 1000;
      res = { kind: 'frenzy', amount: Game.config.frenzyMult, seconds: sec };
      Game.emit('toast', '點擊狂熱！' + Math.round(sec) + ' 秒內點擊 ×' + Game.config.frenzyMult);
    } else {
      const gems = Math.round(5 * bonus);
      Game.state.gems += gems;
      res = { kind: 'gems', amount: gems };
      Game.emit('toast', '金色訪客：獲得 ' + gems + ' 寶石！');
    }
    Game.state.stats.visitors++;
    scheduleVisitor();
    Game.emit('visitorCaught', res);
    Game.emit('change');
    return res;
  };

  // ---------- 圖鑑 ----------
  // 每發現一種史萊姆，全體產量 +2%
  Game.codex = function () {
    const c = Game.state.codex;
    return Object.keys(Game.config.slimeTypes).map(function (id) {
      return { typeId: id, found: !!c[id], count: c[id] || 0 };
    });
  };
  Game.codexFound = function () {
    return Object.keys(Game.state.codex).filter(function (id) { return Game.config.slimeTypes[id] && Game.state.codex[id] > 0; }).length;
  };
  Game.codexMult = function () { return 1 + 0.02 * Game.codexFound(); };

  // ---------- 成就 ----------
  // 每個成就全體產量 +1%；gems>0 的成就另外送寶石
  const ACH = [];
  function ach(id, name, desc, test, gems) { ACH.push({ id: id, name: name, desc: desc, test: test, gems: gems || 0 }); }
  // 額外獎勵：成就 id → 神諭券張數
  const ACH_ORACLE_TICKETS = { dungeon100: 1 };
  const st = function () { return Game.state.stats; };
  [[10, '牧場新手'], [100, '史萊姆收藏家'], [1000, '史萊姆大亨']].forEach(function (x) {
    ach('buy' + x[0], x[1], '用金幣買 ' + x[0] + ' 隻史萊姆', function () { return st().buys >= x[0]; });
  });
  [[1, '第一次進化', 10], [10, '進化學徒'], [50, '進化大師'], [200, '進化之神', 20]].forEach(function (x) {
    ach('merge' + x[0], x[1], '合成 ' + x[0] + ' 次', function () { return st().merges >= x[0]; }, x[2]);
  });
  [[25, '茁壯成長'], [50, '精英飼養'], [100, '百級傳說', 20], [150, '超越極限', 30]].forEach(function (x) {
    ach('lv' + x[0], x[1], '任一史萊姆達到 Lv' + x[0], function () { return st().maxLevel >= x[0]; }, x[2]);
  });
  [[1, '星辰初現', 30], [5, '輪迴旅人'], [20, '永恆輪迴', 30]].forEach(function (x) {
    ach('prestige' + x[0], x[1], '轉生 ' + x[0] + ' 次', function () { return Game.state.prestige.count >= x[0]; }, x[2]);
  });
  [[1e6, '百萬富翁'], [1e9, '十億身家'], [1e12, '兆元帝國', 20], [1e15, '富可敵國'], [1e18, '金幣宇宙', 30]].forEach(function (x) {
    ach('gold' + x[0], x[1], '累計獲得 ' + Game.fmt(x[0]) + ' 金幣', function () { return Game.state.totalGold >= x[0]; }, x[2]);
  });
  [[1e21, '金幣星系'], [1e24, '金幣宇宙之外', 20], [1e27, '無量之金'], [1e30, '黃金奇點', 30]].forEach(function (x) {
    ach('gold' + x[0], x[1], '累計獲得 ' + Game.fmt(x[0]) + ' 金幣', function () { return Game.state.totalGold >= x[0]; }, x[2]);
  });
  [[250, '進化工廠'], [1000, '萬物進化', 30]].forEach(function (x) {
    ach('merge' + x[0], x[1], '合成 ' + x[0] + ' 次', function () { return st().merges >= x[0]; }, x[2]);
  });
  [[10, '十轉之星'], [35, '星海浪人', 20], [50, '輪迴之主', 30]].forEach(function (x) {
    ach('prestige' + x[0], x[1], '轉生 ' + x[0] + ' 次', function () { return Game.state.prestige.count >= x[0]; }, x[2]);
  });
  [[125, '深淵行者'], [150, '深淵王者', 20], [200, '無底深淵', 30]].forEach(function (x) {
    ach('dungeon' + x[0], x[1], '遠征通過第 ' + x[0] + ' 層', function () { return !!Game.dungeon && Game.dungeon.cleared() >= x[0]; }, x[2]);
  });
  [[200, '兩百級'], [300, '三百級', 30]].forEach(function (x) {
    ach('lv' + x[0], x[1], '任一史萊姆達到 Lv' + x[0], function () { return st().maxLevel >= x[0]; }, x[2]);
  });
  [[10, '扭蛋愛好者'], [50, '扭蛋狂熱', 20]].forEach(function (x) {
    ach('tenPull' + x[0], x[1], '進行 ' + x[0] + ' 次十連抽', function () { return st().tenPulls >= x[0]; }, x[2]);
  });
  Game.config.zones.slice(1).forEach(function (z) {
    ach('zone_' + z.id, '抵達' + z.name, '解鎖地區：' + z.name, function () { return !!Game.state.zones[z.id]; }, z.id === 'sky' ? 30 : 0);
  });
  [[1, '幸運相遇'], [25, '訪客常客'], [100, '金色獵人', 20], [500, '金色收藏家'], [2000, '黃金傳說', 30]].forEach(function (x) {
    ach('visitor' + x[0], x[1], '抓到 ' + x[0] + ' 次金色訪客', function () { return st().visitors >= x[0]; }, x[2]);
  });
  [[10, '遠征新兵'], [25, '遠征老手'], [50, '深淵探索者', 30], [75, '深淵征服者'], [100, '百層傳說', 30]].forEach(function (x) {
    ach('dungeon' + x[0], x[1], '遠征通過第 ' + x[0] + ' 層', function () { return !!Game.dungeon && Game.dungeon.cleared() >= x[0]; }, x[2]);
  });
  ach('codex5', '小小圖鑑', '圖鑑發現 5 種史萊姆', function () { return Game.codexFound() >= 5; });
  ach('codexAll', '圖鑑大全', '發現全部 ' + Object.keys(Game.config.slimeTypes).length + ' 種史萊姆',
    function () { return Game.codexFound() >= Object.keys(Game.config.slimeTypes).length; }, 30);
  ach('tenPull1', '豪氣十連', '進行一次十連抽', function () { return st().tenPulls >= 1; }, 10);

  Game.achievements = function () {
    return ACH.map(function (a) {
      return { id: a.id, name: a.name, desc: a.desc, done: !!Game.state.achieved[a.id], reward: { mult: 0.01, gems: a.gems, oracleTickets: ACH_ORACLE_TICKETS[a.id] || 0 } };
    });
  };
  Game.achievementMult = function () { return 1 + 0.01 * Object.keys(Game.state.achieved).length; };
  // 檢查新達成的成就（每秒一次，也可以在操作後呼叫）
  Game.checkAchievements = function () {
    const s = Game.state;
    ACH.forEach(function (a) {
      if (s.achieved[a.id] || !a.test()) return;
      s.achieved[a.id] = true;
      if (a.gems) s.gems += a.gems;
      const tk = ACH_ORACLE_TICKETS[a.id] || 0;
      if (tk && Game.gacha && Game.gacha.oracle) Game.gacha.oracle.addTickets(tk);
      Game.emit('achievement', { id: a.id, name: a.name, desc: a.desc, reward: { mult: 0.01, gems: a.gems, oracleTickets: tk } });
      Game.emit('toast', '達成成就：' + a.name + '（產量 +1%' + (a.gems ? '、' + a.gems + ' 寶石' : '') + '）');
    });
  };

  // ---------- 離線收益 ----------
  // 領取：mult 1=免費、2=看廣告（模擬）、3=花 Game.config.offlineGemCost 寶石
  Game.actions.claimOffline = function (mult) {
    const s = Game.state;
    const p = s.pendingOffline;
    if (!p) return { ok: false, msg: '沒有可領取的離線收益' };
    if (mult === 3) {
      if (s.gems < Game.config.offlineGemCost) { Game.emit('toast', '寶石不足'); offer('noGems'); return { ok: false, msg: '寶石不足' }; }
      s.gems -= Game.config.offlineGemCost;
    } else if (mult !== 2) mult = 1;
    const gold = p.gold * mult;
    Game.addGold(gold);
    s.pendingOffline = null;
    Game.emit('gold', { amount: gold });
    Game.emit('toast', '領取離線收益 ' + Game.fmt(gold) + ' 金幣' + (mult > 1 ? '（×' + mult + '）' : ''));
    Game.emit('change');
    Game.save();
    return { ok: true, msg: '獲得 ' + Game.fmt(gold) + ' 金幣', gold: gold };
  };
  // 離線上限（小時）：基本 8 + 月卡 4 + 冰晶技能 + 星塵升級
  Game.offlineCapHours = function () {
    return Game.config.offlineCapHours + (Game.shop && Game.shop.monthCardActive() ? 4 : 0) +
      Game.skills().offline + Game.state.prestige.upgrades.offline + (Game.dungeon ? Game.dungeon.relicBonus('offline') : 0);
  };
  function offlineCapSec() { return Game.offlineCapHours() * 3600; }

  function count(key) {
    if (Game.daily) Game.daily.roll();
    Game.state.daily.counts[key]++;
  }
  // 限時優惠觸發（由 shop.js 決定要推哪個商品），每種情境只觸發一次；noGems 每次開遊戲限一次
  const shownThisSession = {};
  function offer(reason) {
    if (!Game.shop || !Game.shop.offerFor) return;
    const once = reason !== 'noGems';
    if (once ? Game.state.shop.offersShown[reason] : shownThisSession[reason]) return;
    const id = Game.shop.offerFor(reason);
    if (!id) return;
    if (once) Game.state.shop.offersShown[reason] = true; else shownThisSession[reason] = true;
    Game.emit('offer', { productId: id, reason: reason });
  }
  Game.offer = offer;

  // ---------- 存讀檔 ----------
  Game.save = function () {
    if (paused) return; // 其他分頁接管時不能存檔，否則會蓋掉對方的進度
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.state)); } catch (e) { /* 無法存檔時忽略 */ }
  };

  // ---- 多分頁：最後開啟（或按「在這裡繼續」）的分頁擁有存檔，其他分頁暫停 ----
  const OWNER_KEY = SAVE_KEY + '.owner';
  const TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let paused = false;
  function claimOwner() {
    try { localStorage.setItem(OWNER_KEY, TAB_ID + ':' + Date.now()); } catch (e) { /* ignore */ }
  }
  function onStorage(e) {
    if (e.key !== OWNER_KEY || !e.newValue || e.newValue.split(':')[0] === TAB_ID || paused) return;
    paused = true;
    Game.emit('tabConflict');
  }
  Game.isPaused = function () { return paused; };
  // 「在這裡繼續」：讀取對方最後的存檔、結算期間的收益，然後接管
  Game.takeOver = function () {
    if (!paused) return false;
    Game.load();
    settleAway();
    paused = false;
    claimOwner();
    scheduleVisitor();
    Game.emit('tabResume');
    Game.emit('change');
    if (Game.state.pendingOffline) Game.emit('offline', Game.state.pendingOffline);
    return true;
  };
  // ---- 讀檔：相容 v1.0 以後所有版本的欄位，並修正損壞的值 ----
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function obj(x) { return isObj(x) ? x : {}; }
  function num(x, def) { return typeof x === 'number' && isFinite(x) ? x : def; }
  // 以 base 的結構為準：數字欄位必須是有限數字，物件欄位必須是物件，其餘型別不符就用預設值
  function mergeShape(base, data) {
    data = obj(data);
    Object.keys(data).forEach(function (k) {
      const b = base[k], d = data[k];
      if (typeof b === 'number') base[k] = num(d, b);
      else if (typeof b === 'boolean') base[k] = !!d;
      else if (typeof b === 'string') base[k] = typeof d === 'string' ? d : b;
      else if (isObj(b) && Object.keys(b).length && isObj(d)) mergeShape(b, d);  // 有固定欄位的子物件
      else if (isObj(b)) base[k] = isObj(d) ? d : b;                           // 字典型（codex、bought…）
      else if (b === null || b === undefined) base[k] = d;                     // 沒有預設型別（pendingOffline…）
    });
    return base;
  }
  function cleanSlimes(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (x) { return isObj(x) && typeOf(x.type); }).map(function (x) {
      x.level = Math.max(1, Math.floor(num(x.level, 1)));
      x.star = Math.min(5, Math.max(0, Math.floor(num(x.star, 0))));
      return x;
    });
  }
  // MIGRATIONS[v]：把第 v 版的原始存檔升級到第 v+1 版（在 mergeShape 之前，對原始資料操作）
  // 沒有 saveVersion 的存檔都是 v1.0–v1.5，視為第 5 版
  const MIGRATIONS = {
    // 9 → 10：畫面風格設定（舊存檔也改用預設的現代 RPG 風格，玩家可以在設定頁切回經典像素）
    9: function (d) {
      if (isObj(d.settings) && d.settings.artStyle == null) d.settings.artStyle = 'modern';
    },
    // 8 → 9：神諭扭蛋的保底計數和神諭券
    8: function (d) {
      if (isObj(d.shop)) {
        if (d.shop.oraclePity == null) d.shop.oraclePity = 0;
        if (d.shop.oracleTickets == null) d.shop.oracleTickets = 0;
      }
    },
    // 7 → 8：星輝扭蛋的保底計數和星輝券
    7: function (d) {
      if (isObj(d.shop)) {
        if (d.shop.premiumPity == null) d.shop.premiumPity = 0;
        if (d.shop.premiumTickets == null) d.shop.premiumTickets = 0;
      }
    },
    // 6 → 7：新增扭蛋自動販賣設定（預設關閉）
    6: function (d) {
      if (isObj(d.shop) && d.shop.autoSell == null) d.shop.autoSell = 'off';
    },
    5: function (d) {
      if (d.runGold == null) d.runGold = d.totalGold;
      // 舊存檔沒有圖鑑：用現有的史萊姆補上
      if (!isObj(d.codex)) {
        d.codex = {};
        [].concat(Array.isArray(d.slimes) ? d.slimes : [], Array.isArray(d.storage) ? d.storage : []).forEach(function (x) {
          if (isObj(x) && typeOf(x.type)) d.codex[x.type] = (d.codex[x.type] || 0) + 1;
        });
      }
    }
  };
  function migrate(data) {
    let v = Math.floor(num(data.saveVersion, 5));
    for (; v < SAVE_VERSION; v++) if (MIGRATIONS[v]) MIGRATIONS[v](data);
    data.saveVersion = Math.max(v, SAVE_VERSION);
    const st = mergeShape(newState(), data);
    st.slimes = cleanSlimes(data.slimes);
    st.storage = cleanSlimes(data.storage);
    if (!st.slimes.length && !st.storage.length) st.slimes.push({ uid: 1, type: 'green', level: 1, star: 0 });
    // uid 必須唯一且大於現有的最大值
    const seen = {};
    let maxUid = 0;
    st.slimes.concat(st.storage).forEach(function (x) {
      if (!isFinite(x.uid) || seen[x.uid]) x.uid = 0;
      seen[x.uid] = true;
      maxUid = Math.max(maxUid, x.uid);
    });
    st.slimes.concat(st.storage).forEach(function (x) { if (!x.uid) x.uid = ++maxUid; });
    st.nextUid = Math.max(st.nextUid, maxUid + 1);
    const p = st.pendingOffline;
    if (!isObj(p) || !isFinite(p.gold) || !isFinite(p.seconds)) st.pendingOffline = null;
    if (!st.zones[st.zone]) st.zone = 'meadow';
    if (['high', 'mid', 'low'].indexOf(st.settings.quality) < 0) st.settings.quality = 'high';
    if (['modern', 'pixel'].indexOf(st.settings.artStyle) < 0) st.settings.artStyle = 'modern';
    if (['off', 'R', 'R_full'].indexOf(st.shop.autoSell) < 0) st.shop.autoSell = 'off';
    st.shop.premiumPity = Math.max(0, Math.floor(st.shop.premiumPity));
    st.shop.premiumTickets = Math.max(0, Math.floor(st.shop.premiumTickets));
    st.shop.oraclePity = Math.max(0, Math.floor(st.shop.oraclePity));
    st.shop.oracleTickets = Math.max(0, Math.floor(st.shop.oracleTickets));
    st.zones.meadow = true;
    return st;
  }
  Game.migrate = migrate; // 測試用

  // ---- 設定：畫質 ----
  // source='auto'（hd2d 自動降級）或 'user'（玩家在設定頁選的；選了之後就關閉自動降級）
  const QUALITIES = ['high', 'mid', 'low'];
  Game.settings = function () { return Game.state.settings; };
  Game.setQuality = function (q, source) {
    if (QUALITIES.indexOf(q) < 0) return false;
    const st = Game.state.settings;
    if (source === 'auto' && !st.autoQuality) return false;
    st.quality = q;
    if (source !== 'auto') st.autoQuality = false;
    Game.emit('settings', { quality: q, source: source || 'user', autoQuality: st.autoQuality });
    Game.save();
    return true;
  };
  // 畫面風格：'modern'（現代 RPG）或 'pixel'（經典像素）；送出 'settings' {artStyle}
  Game.setArtStyle = function (style) {
    if (['modern', 'pixel'].indexOf(style) < 0) return false;
    Game.state.settings.artStyle = style;
    Game.emit('settings', { artStyle: style, source: 'user' });
    Game.emit('change');
    Game.save();
    return true;
  };
  Game.artStyle = function () { return Game.state.settings.artStyle; };
  Game.setAutoQuality = function (on) {
    Game.state.settings.autoQuality = !!on;
    Game.emit('settings', { quality: Game.state.settings.quality, source: 'user', autoQuality: !!on });
    Game.save();
  };
  Game.load = function () {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* ignore */ }
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (!isObj(data)) throw new Error('存檔格式錯誤');
      Game.state = migrate(data);
      return true;
    } catch (e) {
      // 存檔損壞：先備份原始內容再開新遊戲，避免被自動存檔蓋掉
      try { localStorage.setItem(SAVE_KEY + '.corrupt', raw); } catch (e2) { /* ignore */ }
      console.error('[Game] 存檔損壞，已備份到 ' + SAVE_KEY + '.corrupt', e);
      Game.state = newState();
      Game.emit('toast', '存檔損壞，已開始新遊戲（舊存檔已備份）');
      return false;
    }
  };
  // ---- 匯出／匯入存檔（換瀏覽器用）：格式為 "PSR1:" + base64(UTF-8 JSON) ----
  const EXPORT_PREFIX = 'PSR1:';
  function b64encode(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64decode(str) { return decodeURIComponent(escape(atob(str))); }
  Game.exportSave = function () {
    Game.state.lastTick = Date.now();
    return EXPORT_PREFIX + b64encode(JSON.stringify(Game.state));
  };
  // 成功時會取代目前的存檔；離線收益依匯出時間結算
  Game.importSave = function (code) {
    code = String(code || '').trim();
    if (code.indexOf(EXPORT_PREFIX) !== 0) return { ok: false, msg: '存檔碼格式不正確' };
    let data;
    try { data = JSON.parse(b64decode(code.slice(EXPORT_PREFIX.length))); } catch (e) { return { ok: false, msg: '存檔碼損壞，無法讀取' }; }
    if (!isObj(data) || !Array.isArray(data.slimes)) return { ok: false, msg: '存檔碼內容不正確' };
    Game.state = migrate(data);
    settleAway();
    Game.save();
    Game.emit('import');
    Game.emit('change');
    if (Game.state.pendingOffline) Game.emit('offline', Game.state.pendingOffline);
    return { ok: true, msg: '存檔匯入成功' };
  };
  Game.reset = function () {
    Game.state = newState();
    Game.save();
    Game.emit('change');
  };

  // ---------- 主迴圈 ----------
  let secAcc = 0;
  function tick() {
    if (paused) return;
    const now = Date.now();
    const dt = Math.max(0, (now - Game.state.lastTick) / 1000);
    Game.state.lastTick = now;
    // 分頁在背景時 dt 可能很大，照樣結算（上限為離線上限）
    Game.addGold(Game.totalRate() * Math.min(dt, offlineCapSec()));
    updateVisitor(now);
    Game.emit('tick', dt);
    // 每秒對每隻史萊姆送一次 gold 事件，給畫面飄字用（金幣已在上面入帳）
    secAcc += dt;
    if (secAcc >= 1) {
      secAcc = 0;
      const gm = Game.globalMult();
      Game.state.slimes.forEach(function (sl) { Game.emit('gold', { amount: Game.rateOf(sl, gm), uid: sl.uid, passive: true }); });
      Game.checkAchievements();
      Game.emit('change');
      // 新手免費一抽開放時通知一次
      if (Game.gacha && Game.gacha.freePullAvailable() && !Game.state.shop.freePullNotified) {
        Game.state.shop.freePullNotified = true;
        Game.emit('freePull');
      }
    }
  }
  Game.tick = tick; // sim.js 用
  let started = false;
  Game.start = function () {
    if (started) return;
    started = true;
    Game.load();
    settleAway();
    if (Game.shop && Game.shop.init) Game.shop.init();
    if (Game.state.pendingOffline) Game.emit('offline', Game.state.pendingOffline);
    claimOwner();
    window.addEventListener('storage', onStorage);
    scheduleVisitor();
    setInterval(tick, TICK_MS);
    setInterval(Game.save, AUTOSAVE_MS);
    window.addEventListener('beforeunload', Game.save);
    Game.emit('change');
  };
  // 依 lastTick 結算離開期間的收益（累加到待領取的離線收益）
  function settleAway() {
    const now = Date.now();
    const away = Math.min(Math.max(0, (now - Game.state.lastTick) / 1000), offlineCapSec());
    Game.state.lastTick = now;
    if (away > 60) {
      const p = Game.state.pendingOffline || { seconds: 0, gold: 0 };
      p.seconds += away;
      p.gold += Game.totalRate() * away;
      Game.state.pendingOffline = p;
    }
  }
})();
