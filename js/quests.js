// quests.js — 新手任務線：依序引導玩家認識每個系統，每完成一項領寶石（ccline-a3）
// 一次只顯示一項；完成後由玩家按「領取」，才會進到下一項。狀態放在 state.quests（轉生保留）。
(function () {
  'use strict';
  const Game = (window.Game = window.Game || {});

  function S() { return Game.state; }
  function found(typeId) {
    return Game.codex ? Game.codex().some(function (c) { return c.typeId === typeId && c.found; }) : false;
  }
  function zoneUnlocked(id) {
    return Game.zones ? Game.zones().some(function (z) { return z.id === id && z.unlocked; }) : false;
  }
  function cleared() { return Game.dungeon ? Game.dungeon.cleared() : 0; }

  // cur() 回傳目前進度，達到 need 就算完成
  const QUESTS = [
    { id: 'click10',   text: '點擊牧場收集金幣',         need: 10, gems: 10,  cur: function () { return qs().clicks; } },
    { id: 'buy1',      text: '購買一隻草原史萊姆',       need: 1,  gems: 10,  cur: function () { return S().stats.buys; } },
    { id: 'own5',      text: '讓牧場有 5 隻史萊姆',      need: 5,  gems: 10,  cur: function () { return S().slimes.length; } },
    { id: 'lv10',      text: '把一隻史萊姆升到 Lv10',    need: 10, gems: 20,  cur: function () { return S().stats.maxLevel; } },
    { id: 'merge1',    text: '合成出水滴史萊姆',         need: 1,  gems: 20,  cur: function () { return S().stats.merges; } },
    { id: 'visitor1',  text: '抓到一隻金色訪客',         need: 1,  gems: 20,  cur: function () { return S().stats.visitors; } },
    { id: 'freePull',  text: '使用免費 SR 扭蛋',         need: 1,  gems: 20,  cur: function () { return S().shop.firstPullDone ? 1 : 0; } },
    { id: 'dungeon1',  text: '遠征：通過第 1 層',        need: 1,  gems: 30,  cur: function () { return cleared(); } },
    { id: 'capacity1', text: '擴建牧場一次',             need: 1,  gems: 20,  cur: function () { return S().upgrades.capacity; } },
    { id: 'purple',    text: '獲得魔晶史萊姆',           need: 1,  gems: 30,  cur: function () { return found('purple') ? 1 : 0; } },
    { id: 'boss1',     text: '遠征：擊敗第一個頭目',     need: 10, gems: 50,  tickets: 1, cur: function () { return cleared(); } },
    { id: 'gold',      text: '獲得黃金史萊姆',           need: 1,  gems: 50,  cur: function () { return found('gold') ? 1 : 0; } },
    { id: 'prestige1', text: '完成第一次轉生',           need: 1,  gems: 100, cur: function () { return S().prestige.count; } },
    { id: 'beach',     text: '用星塵解鎖海邊',           need: 1,  gems: 100, cur: function () { return zoneUnlocked('beach') ? 1 : 0; } }
  ];

  function qs() {
    const s = S();
    if (!s.quests || typeof s.quests !== 'object') s.quests = {};
    const q = s.quests;
    if (!(q.step >= 0)) q.step = 0;
    q.step = Math.min(Math.floor(q.step), QUESTS.length);
    if (!(q.clicks >= 0)) q.clicks = 0;
    return q;
  }

  function view(i) {
    const def = QUESTS[i];
    if (!def) return null;
    let cur = 0;
    try { cur = def.cur() || 0; } catch (e) { cur = 0; }
    return { index: i, total: QUESTS.length, id: def.id, text: def.text, cur: Math.min(cur, def.need), need: def.need, done: cur >= def.need, gems: def.gems, tickets: def.tickets || 0 };
  }

  let lastDone = false;
  Game.quests = {
    list: QUESTS.map(function (q) { return { id: q.id, text: q.text, need: q.need, gems: q.gems, tickets: q.tickets || 0 }; }),
    // 目前任務；全部完成後回傳 null
    current: function () { return view(qs().step); },
    allDone: function () { return qs().step >= QUESTS.length; },
    claim: function () {
      const v = view(qs().step);
      if (!v || !v.done) return { ok: false, msg: '任務尚未完成' };
      S().gems += v.gems;
      // 星輝券（星輝扭蛋還沒載入時就只給寶石）
      if (v.tickets && Game.gacha && Game.gacha.premium && Game.gacha.premium.addTickets) Game.gacha.premium.addTickets(v.tickets);
      qs().step++;
      lastDone = false;
      Game.emit('questClaim', { quest: v, next: view(qs().step) });
      Game.emit('toast', '任務完成：' + v.text + '（💎' + v.gems + (v.tickets ? '、🎫星輝券 ×' + v.tickets : '') + '）');
      Game.emit('change');
      return { ok: true, gems: v.gems };
    }
  };

  if (Game.on) {
    Game.on('gold', function (d) { if (d && !d.passive && !d.visitor) qs().clicks++; });
    // 任務剛完成的那一刻送一次 'questReady'，給 UI 做提示（紅點、閃爍）
    Game.on('change', function () {
      const v = view(qs().step);
      const done = !!(v && v.done);
      if (done && !lastDone) Game.emit('questReady', v);
      lastDone = done;
    });
  }
})();
