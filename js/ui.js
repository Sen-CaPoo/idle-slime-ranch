// ui.js — HUD、分頁面板、商店／扭蛋 UI、彈窗（ccline-27）
// 所有購買都是模擬：先由這裡顯示確認視窗，按下確認後才呼叫 Game.shop.purchase()。
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = id => Game.config.slimeTypes[id];
  const fmt = n => Game.fmt(n);
  const RAR_ORDER = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 };
  // 現代風格時優先用向量圖示（ModernIcons 沒有的名稱退回像素圖示）
  const ICON = (n, s = 3) => document.body.classList.contains('style-modern') && window.ModernIcons && ModernIcons.url(n) || Sprites.iconURL(n, s);
  // coinI／gemI 每次插入字串時才取圖，切換畫面風格後會跟著變
  const coinI = { toString: () => '<img class="ico" src="' + ICON('coin') + '" alt="金幣">' };
  const gemI = { toString: () => '<img class="ico" src="' + ICON('gem') + '" alt="寶石">' };
  const elURL = (el, s) => document.body.classList.contains('style-modern') && window.ModernIcons && ModernIcons.url(el) || Monsters.elementURL(el, s);
  const rar = r => `<span class="rar ${r}">${r}</span>`;
  const stars = n => n ? `<span class="stars">${'★'.repeat(n)}</span>` : '';
  // 現代風格時 UI 圖示改用向量 sprite（body.style-modern 由 applyStyle 切換）
  const modernUI = () => document.body.classList.contains('style-modern') && !!window.ModernSprites;
  const slimeURL = (t, s) => modernUI() ? ModernSprites.url(t) : Sprites.slimeURL(t, s);
  const monURL = (id, s) => modernUI() && ModernSprites.monsterURL(id) || Monsters.url(id, s);
  const thumb = id => `<span class="thumb"><img src="${slimeURL(T(id), 3)}" alt=""></span>`;
  function fmtDur(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h ? `${h} 小時 ${m} 分` : m ? `${m} 分 ${s} 秒` : `${s} 秒`;
  }

  // 揭曉格子：直接複製快取的 sprite 畫布（比 toDataURL 便宜很多）
  function spriteCanvas(r) {
    const src = r.typeId ? (modernUI() ? ModernSprites.uiCanvas(T(r.typeId)) : Sprites.slimeCanvas(T(r.typeId), 0, 0, 0)) : (modernUI() && ModernIcons.canvas('bag') || Sprites.icon('bag'));
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.className = 'cell-sprite';
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }
  // 扭蛋結果顯示（N 是金幣袋，沒有 typeId）
  function resultView(r, scale) {
    if (!scale) return { img: '', name: r.typeId ? T(r.typeId).name : '金幣袋', sub: !r.typeId ? '+' + fmt(r.gold || 0) + ' 金幣' : r.sold ? '已自動賣出 +' + fmt(r.gold || 0) + ' 金幣' : '', sold: !!r.sold };
    if (!r.typeId) return { img: ICON('bag', scale), name: '金幣袋', sub: '+' + fmt(r.gold || 0) + ' 金幣' };
    if (r.sold) return { img: slimeURL(T(r.typeId), scale), name: T(r.typeId).name, sub: '已自動賣出 +' + fmt(r.gold || 0) + ' 金幣', sold: true };
    return { img: slimeURL(T(r.typeId), scale), name: T(r.typeId).name, sub: '' };
  }
  const sfx = name => { if (Game.audio) Game.audio.play(name); };
  const dust = n => `<span class="dust">✦${fmt(n)}</span>`;
  const seen = { get: k => { try { return localStorage.getItem('psr.' + k); } catch (e) { return null; } }, set: k => { try { localStorage.setItem('psr.' + k, '1'); } catch (e) { /* 忽略 */ } } };

  let tab = 'ranch', gachaTab = 'normal';
  let lastSig = '';
  let hudFreeze = false, battling = false, loginDeferred = false;

  // ---------- 彈窗 ----------
  function modal(html, opts = {}) {
    const root = $('#modalRoot');
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.innerHTML = `<div class="px-panel px-modal ${opts.cls || ''}">${html}</div>`;
    root.appendChild(bd);
    const after = [];
    const close = () => { if (!bd.isConnected) return; bd.remove(); after.forEach(f => f()); };
    if (opts.dismiss !== false) bd.addEventListener('click', e => { if (e.target === bd) close(); });
    bd.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    return { el: bd, close, onClose: f => after.push(f) };
  }
  // 自動跳出的彈窗（離線、登入、免費抽、推薦禮包）排隊，一次只顯示一個
  const popQueue = [];
  let popBusy = false;
  function enqueue(fn) { popQueue.push(fn); nextPop(); }
  let popRetry = null;
  function nextPop() {
    if (popBusy || !popQueue.length) return;
    // 有其他彈窗開著（扭蛋結果、確認窗…）或正在戰鬥時先等，避免疊在一起
    if ($('#modalRoot').children.length || battling || hold || $('#tabLock') || document.body.classList.contains('title-mode')) {
      if (!popRetry) popRetry = setTimeout(() => { popRetry = null; nextPop(); }, 500);
      return;
    }
    const m = popQueue.shift()();
    if (!m) return nextPop();
    popBusy = true;
    m.onClose(() => { popBusy = false; setTimeout(nextPop, 250); });
  }
  function confirmModal(title, body, okLabel, onOk, cls = 'primary') {
    const m = modal(`<h3>${title}</h3><div>${body}</div>
      <div class="acts"><button class="px-btn" data-close>取消</button><button class="px-btn ${cls}" data-ok>${okLabel}</button></div>`);
    m.el.querySelector('[data-ok]').addEventListener('click', () => { m.close(); onOk(); });
  }
  function noGems(need) {
    enqueue(() => noGemsModal(need));
    if (Game.offer) Game.offer('noGems');
  }
  function noGemsModal(need) {
    const m = modal(`<h3>寶石不足</h3><p>需要 ${gemI}${fmt(need)}，目前只有 ${gemI}${fmt(Game.state.gems)}。</p>
      <div class="acts"><button class="px-btn" data-close>先不要</button><button class="px-btn primary" data-go>前往商店</button></div>`);
    m.el.querySelector('[data-go]').addEventListener('click', () => { m.close(); setTab('shop'); });
    return m;
  }
  function toast(msg) {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = msg;
    const box = $('#toasts'); box.appendChild(d);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.remove(), 2600);
  }

  // 寶石／金幣飛向 HUD
  function flyTo(fromEl, icon, n, targetSel) {
    const tgt = $(targetSel); if (!tgt) return;
    const a = (fromEl || document.body).getBoundingClientRect(), b = tgt.getBoundingClientRect();
    const sx = a.left + a.width / 2, sy = a.top + a.height / 2, ex = b.left + b.width / 2, ey = b.top + b.height / 2;
    for (let i = 0; i < n; i++) {
      const img = document.createElement('img');
      img.src = ICON(icon); img.className = 'ico';
      img.style.cssText = `position:fixed;left:0;top:0;z-index:70;pointer-events:none;width:22px;height:22px`;
      document.body.appendChild(img);
      const ox = (Math.random() - 0.5) * 80, oy = -60 - Math.random() * 60;
      img.animate([
        { transform: `translate(${sx - 11}px,${sy - 11}px) scale(.6)` },
        { transform: `translate(${sx + ox - 11}px,${sy + oy - 11}px) scale(1.2)`, offset: 0.4 },
        { transform: `translate(${ex - 11}px,${ey - 11}px) scale(.8)` },
      ], { duration: 700 + i * 50, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
        img.remove();
        tgt.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 200 });
      };
    }
  }
  function flash(color = '#fff') {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;inset:0;background:${color};z-index:80;pointer-events:none`;
    document.body.appendChild(d);
    d.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 450 }).onfinish = () => d.remove();
  }

  // ---------- HUD ----------
  let shownGold = 0, shownGems = 0;
  function hudLoop() {
    requestAnimationFrame(hudLoop);
    if (hudFreeze) return;
    const s = Game.state;
    const k = 0.18;
    shownGold = Math.abs(s.gold - shownGold) < 1 ? s.gold : shownGold + (s.gold - shownGold) * k;
    shownGems = Math.abs(s.gems - shownGems) < 1 ? s.gems : shownGems + (s.gems - shownGems) * k;
    $('#hudGold').textContent = fmt(shownGold);
    $('#hudGems').textContent = fmt(shownGems);
  }
  let dungeonWasUnlocked = false;
  function hudSlow() {
    const sh = Game.shop;
    $('#hudRate').textContent = fmt(Game.totalRate());
    $('#hudVip').textContent = 'VIP ' + sh.vipLevel();
    $('#hudBoost').hidden = !sh.boostActive();
    $('#hudBoost').textContent = '×2 ' + fmtDur(sh.boostSecondsLeft());
    $('#hudCard').hidden = !sh.monthCardActive();
    $('#shopDot').hidden = !(sh.canClaimMonthCard() || (sh.adBoostsLeft() > 0 && !sh.boostActive()));
    $('#dailyDot').hidden = !(Game.daily.hasClaimable() || (Game.quests && Game.quests.current() && Game.quests.current().done));
    renderQuest();
    $('#gachaDot').hidden = !Game.gacha.freePullAvailable();
    // 轉生
    const P = Game.state.prestige, gain = Game.prestigeGain(), can = Game.canPrestige();
    const hd = $('#hudDust');
    hd.hidden = !can && !P.totalDust;
    hd.textContent = can ? `✦ 可轉生 +${fmt(gain)}` : `✦ ${fmt(P.dust)}`;
    hd.classList.toggle('ready', can);
    const badge = $('#prestigeBadge');
    badge.hidden = !can || battling;
    if (can) {
      const pm = Game.prestigePreviewMult ? Game.prestigePreviewMult() : (1 + Game.config.dustBonus * (P.totalDust + gain)) / Game.dustMult();
      badge.querySelector('b').textContent = `✦${fmt(gain)} → 產量 ×${pm.toFixed(2)}`;
    }
    // 遠征解鎖
    const un = Game.dungeon.unlocked();
    $('#dungeonTab').firstChild.textContent = un ? '遠征' : '🔒遠征';
    $('#dungeonDot').hidden = !(un && !seen.get('dungeon'));
    $('#dungeonTab').classList.toggle('auto-on', !!(Game.dungeon.auto && Game.dungeon.auto().on));
    if (un && !dungeonWasUnlocked) enqueue(() => {
      const m = modal(`<div style="text-align:center"><img src="${monURL('golem', 3)}" alt="" style="${modernUI() ? 'width:120px' : 'image-rendering:pixelated'}">
        <h3>新功能：史萊姆遠征！</h3><p>帶 5 隻史萊姆挑戰怪物，利用屬性相剋往上推關。<br>每通過一層，全體產量永久 +1%，頭目還會掉落遺物！</p></div>
        <div class="acts" style="justify-content:center"><button class="px-btn" data-close>等等再去</button><button class="px-btn gold" data-go>出發！</button></div>`, { cls: 'wide' });
      m.el.querySelector('[data-go]').addEventListener('click', () => { m.close(); setTab('dungeon'); });
      return m;
    });
    dungeonWasUnlocked = un;
  }

  // ---------- 面板 ----------
  function signature() {
    const s = Game.state;
    return JSON.stringify([tab, s.slimes, s.storage, s.upgrades, s.bought, s.shop.firstBuyDone, s.shop.starterPackBought,
      s.shop.vip, s.shop.monthCardLastClaim, Game.shop.monthCardActive(), Game.shop.boostActive(), Game.capacity(), s.shop.pity, s.daily, Game.shop.available('starter'), !!s.pendingOffline, Game.gacha.freePullAvailable(), s.shop.firstPullDone, tab === 'gacha' ? Math.floor(Game.gacha.freePullProgress().cur / 50) : 0,
      s.prestige, Game.canPrestige(), s.dungeon, s.shop.autoSell, gachaTab, s.shop.premiumTickets, s.shop.premiumPity, s.shop.oracleTickets, s.shop.oraclePity, s.achieved, s.codex, Game.zones ? Game.zones() : 0, s.zone, tab === 'upgrade' ? Math.floor(Math.log10(s.runGold + 1) * 10) : 0]);
  }
  const VIEWS = {
    ranch() {
      const s = Game.state, types = Object.values(Game.config.slimeTypes);
      const buy = types.filter(t => Game.slimeCost(t.id) != null).map(t => {
        const cost = Game.slimeCost(t.id), owned = s.slimes.filter(x => x.type === t.id).length;
        return `<div class="card">
          <div class="row">${thumb(t.id)}<div><div class="name">${esc(t.name)} ${rar(t.rarity)}</div>
          <div class="meta">基礎 ${fmt(t.baseRate)}/秒 · 擁有 ${owned}</div></div></div>
          <div class="acts"><button class="px-btn primary small" data-act="buy" data-arg="${t.id}" data-cost="${cost}">${coinI}${fmt(cost)}</button></div>
        </div>`;
      }).join('');
      // 合成進化：牧場上有的、可以進化的種類
      const merges = types.filter(t => t.evolvesTo && s.slimes.some(x => x.type === t.id)).map(t => {
        const mp = Game.mergeProgress(t.id), can = Game.canMerge(t.id), to = T(t.evolvesTo);
        return `<div class="card merge-card">
          <div class="row">${thumb(t.id)}<span class="arrow">→</span>${thumb(to.id)}<div><div class="name">${esc(to.name)} ${rar(to.rarity)}</div>
          <div class="meta">需要 3 隻 Lv${mp.minLevel}+ ${esc(t.name)}：<b>${mp.have}</b> / 3（牧場上共 ${mp.total} 隻）</div>
          <div class="vipbar"><i style="width:${Math.min(100, mp.have / 3 * 100)}%"></i></div></div></div>
          <div class="acts"><button class="px-btn ${can ? 'gold' : ''} small" data-act="merge" data-arg="${t.id}" ${can ? `data-cost="${mp.fee || 0}"` : 'disabled'}>合成 ${mp.fee ? coinI + fmt(mp.fee) : ''}</button></div></div>`;
      }).join('');
      const ownRow = sl => {
        const cost = Game.upgradeSlimeCost(sl);
        const nm = Game.nextMilestone(sl), sk = T(sl.type).skillDef ? Game.skillText(sl.type, sl.star || 0) : '';
        return `<div class="owned">${thumb(sl.type)}<div><b>${esc(T(sl.type).name)}</b> Lv${sl.level} ${rar(T(sl.type).rarity)} ${stars(sl.star)}
          <div class="meta">${fmt(Game.rateOf(sl))}/秒 · ${nm ? `<span class="ms">Lv${nm.level} ×${nm.mult}</span> 還差 ${nm.left} 級` : '<span class="ms">里程碑全滿</span>'}</div>
          ${sk ? `<div class="skill">技能：${esc(sk)}</div>` : ''}</div>
          <div class="acts" style="display:flex;gap:4px">
          <button class="px-btn primary small" data-act="lv" data-arg="${sl.uid}" data-cost="${cost}" title="按住可連續升級">升級 ${coinI}${fmt(cost)}</button>
          <button class="px-btn gold small max-btn" data-act="lvmax" data-arg="${sl.uid}" data-maxkind="slime">MAX</button>
          <button class="px-btn small" data-act="store" data-arg="${sl.uid}" title="收進倉庫（倉庫中不產金幣）">收</button></div></div>`;
      };
      const bySort = (a, b) => T(b.type).tier - T(a.type).tier || b.level - a.level;
      const hasComp = !!Game.companionCap;
      const mainList = s.slimes.filter(x => !hasComp || !x.gacha).sort(bySort).map(ownRow).join('');
      const compList = hasComp ? s.slimes.filter(x => x.gacha).sort(bySort).map(ownRow).join('') : '';
      const sellLabel = v => v.gems ? `${gemI}${v.gems}` : `${coinI}${fmt(v.gold)}`;
      const store = s.storage.map(sl => {
        const v = Game.sellValue ? Game.sellValue(sl) : null, risky = sl.gacha || sl.level >= 25;
        return `<div class="owned">${thumb(sl.type)}<div><b>${esc(T(sl.type).name)}</b> Lv${sl.level} ${rar(T(sl.type).rarity)} ${stars(sl.star)}
          <div class="meta">倉庫中，不產金幣</div></div>
          <div class="acts" style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="px-btn blue small" data-act="unstore" data-arg="${sl.uid}" ${(Game.hasRoom ? !Game.hasRoom(sl.gacha) : s.slimes.length >= Game.capacity()) ? 'disabled' : ''}>放回牧場</button>
          ${v ? `<button class="px-btn danger small" data-act="sell" data-arg="${sl.uid}" ${risky ? 'data-confirm="1"' : ''}>賣出 ${sellLabel(v)}</button>` : ''}</div></div>`;
      }).join('');
      // 一鍵賣出：扭蛋 R 出的魔晶 Lv10（非扭蛋角色、沒升過級）
      const junk = s.storage.filter(x => x.type === 'purple' && x.level === 10 && !x.gacha && !x.star);
      const junkBtn = junk.length && Game.actions.sellMany ? `<button class="px-btn danger small" data-act="sellJunk">一鍵賣出：魔晶 Lv10（扭蛋 R）×${junk.length}</button>` : '';
      return `<div class="split">
        <div><h3 class="sec-title">購買史萊姆</h3><div class="grid">${buy}</div>
          ${merges ? `<h3 class="sec-title" style="margin-top:12px">合成進化</h3><div class="owned-list">${merges}</div>` : ''}
          <p class="note">3 隻 Lv${Game.config.mergeLevel}+ 的同種史萊姆可合成下一階（需付合成費），新史萊姆繼承 3 隻中最低的等級。等級到 ${Game.config.milestones.map(m => m.level).join('／')} 時產量各 ×2，外觀也會升級。</p></div>
        <div><h3 class="sec-title">主線牧場 <span class="dim">${hasComp ? Game.mainCount() : s.slimes.length} / ${Game.capacity()}</span></h3>
          <div class="owned-list">${mainList || '<div class="empty">還沒有史萊姆</div>'}</div>
          ${hasComp ? `<h3 class="sec-title" style="margin-top:12px">夥伴 <span class="dim">${Game.companionCount()} / ${Game.companionCap()}　扭蛋／禮包角色不占主線格子</span></h3>
          <div class="owned-list">${compList || '<div class="empty">還沒有夥伴：扭蛋或禮包取得的角色會在這裡</div>'}</div>` : ''}
          ${s.storage.length ? `<h3 class="sec-title" style="margin-top:12px">倉庫 <span class="dim">${s.storage.length} 隻</span><span class="grow"></span>${junkBtn}</h3><div class="owned-list">${store}</div>` : ''}
        </div></div>`;
    },
    upgrade() {
      const ups = Game.config.upgrades;
      return `<h3 class="sec-title">牧場升級</h3><div class="grid">` + Object.keys(ups).map(k => {
        const u = ups[k], lv = Game.state.upgrades[k], cost = Game.upgradeCost(k);
        const icon = { click: 'heart', capacity: 'star', prodMult: 'coin' }[k] || 'star';
        return `<div class="card"><div class="row"><span class="thumb"><img src="${ICON(icon, 5)}" alt=""></span>
          <div><div class="name">${esc(u.name)}</div><div class="meta">${esc(u.desc)} · Lv ${lv} / ${u.max}</div></div></div>
          <div class="acts">${cost == null ? '<button class="px-btn small" disabled>已滿級</button>'
            : `<button class="px-btn primary small" data-act="up" data-arg="${k}" data-cost="${cost}" title="按住可連續升級">${coinI}${fmt(cost)}</button>
               <button class="px-btn gold small max-btn" data-act="upmax" data-arg="${k}" data-maxkind="upgrade">MAX</button>`}</div></div>`;
      }).join('') + `</div>` + prestigeView() + zoneView();
    },
    gacha() {
      const sub = Game.gacha.premium ? `<div class="sub-tabs">
          <button class="px-tab ${gachaTab === 'normal' ? 'active' : ''}" data-act="gtab" data-arg="normal">普通扭蛋</button>
          <button class="px-tab star ${gachaTab === 'premium' ? 'active' : ''}" data-act="gtab" data-arg="premium">✦ 星輝扭蛋${Game.gacha.premium.tickets() ? ` <span class="px-badge ticket">🎫${Game.gacha.premium.tickets()}</span>` : ''}</button>
          ${Game.gacha.oracle ? `<button class="px-tab oracle ${gachaTab === 'oracle' ? 'active' : ''}" data-act="gtab" data-arg="oracle">✧ 神諭扭蛋${Game.gacha.oracle.tickets() ? ` <span class="px-badge oticket">✧${Game.gacha.oracle.tickets()}</span>` : ''}</button>` : ''}</div>` : '';
      if (gachaTab === 'oracle' && Game.gacha.oracle) return sub + oracleGachaView();
      return sub + (gachaTab === 'premium' && Game.gacha.premium ? premiumGachaView() : normalGachaView());
    },
    shop() {
      const sh = Game.shop, s = Game.state.shop;
      const card = sh.products.find(p => p.kind === 'monthCard'), starter = sh.products.find(p => p.kind === 'starter');
      const packs = sh.products.filter(p => p.kind === 'gems' && sh.available(p.id));
      const vipNext = sh.vipNext(), lv = sh.vipLevel(), th = sh.vipThresholds;
      const pct = vipNext == null ? 100 : Math.round((s.totalSpent - th[lv]) / (th[lv + 1] - th[lv]) * 100);
      const cardActive = sh.monthCardActive();
      return `
      <div class="card banner sweep" style="background:linear-gradient(90deg,#2a3f7a,#1b1f3b);color:#fff;border-color:#000">
        <div class="row" style="flex-wrap:wrap">
          <span class="thumb" style="background:#2a3f7a"><img src="${ICON('star', 5)}" alt=""></span>
          <div style="flex:1;min-width:180px"><div class="name" style="color:#ffd23f">${esc(card.name)} · NT$${card.priceTWD} ${card.tag === 'hot' ? '<span class="px-badge hot">熱銷</span>' : ''} ${card.valueText ? `<span class="px-badge vip" style="color:#2a1d14">${esc(card.valueText)}</span>` : ''}</div>
            <div class="meta" style="opacity:.9">${esc(card.desc)}</div>
            ${cardActive ? `<div class="meta" style="color:#9fe">生效中，剩 ${sh.monthCardDaysLeft()} 天</div>` : ''}</div>
          <div class="acts" style="margin:0">
            ${cardActive ? `<button class="px-btn gold" data-act="claim" ${sh.canClaimMonthCard() ? '' : 'disabled'}>${sh.canClaimMonthCard() ? '領取今日 100' : '今日已領'}</button>` : ''}
            <button class="px-btn primary" data-act="buyp" data-arg="${card.id}">${cardActive ? '續購' : '購買'} NT$${card.priceTWD}</button>
          </div></div></div>

      <div class="split" style="margin-top:10px">
        <div class="card"><div class="name">雙倍加速 <span class="dim">金幣產量 ×2（最多疊加至 4 小時）</span></div>
          <div class="meta">${sh.boostActive() ? '加速中，剩 <b data-live="boost">' + fmtDur(sh.boostSecondsLeft()) + '</b>' : '尚未啟用'}</div>
          <div class="acts"><button class="px-btn pink small" data-act="boostGem" data-gem="${sh.boostGemCost}">2 小時 ${gemI}${sh.boostGemCost}</button>
          <button class="px-btn blue small" data-act="boostAd" ${sh.adBoostsLeft() > 0 ? '' : 'disabled'}>看廣告 30 分鐘（今日剩 ${sh.adBoostsLeft()} 次）</button></div></div>
        <div class="card"><div class="name">VIP ${lv} <span class="dim">產量 +${Math.round(sh.vipBonus() * 100)}%</span></div>
          <div class="vipbar"><i style="width:${pct}%"></i></div>
          <div class="meta">${vipNext == null ? '已達最高等級' : `再累計儲值 NT$${vipNext} 升到 VIP ${lv + 1}（每級產量 +5%）`}</div></div>
      </div>

      ${!starter || !sh.available(starter.id) ? '' : `<div class="card starter-card" style="margin-top:10px">
        <span class="ribbon px-badge hot">限購一次 · 剩 <span data-live="starter">${fmtDur(sh.starterSecondsLeft())}</span></span>
        <div class="row">${thumb('gold')}<div style="flex:1"><div class="name">${esc(starter.name)}</div><div class="meta">${esc(starter.desc)}</div>
          <div class="meta hot-text">黃金史萊姆無法用金幣購買，只有這裡、合成或扭蛋能取得</div></div></div>
        <div class="acts"><button class="px-btn primary" data-act="buyp" data-arg="${starter.id}">NT$${starter.priceTWD}</button></div></div>`}

      <h3 class="sec-title" style="margin-top:12px">寶石儲值</h3>
      <div class="grid packs">${packs.map((p, pi) => {
        const first = p.bonusFirst && !s.firstBuyDone[p.id];
        const mega = p.id === 'gems_29900';
        return `<div class="card ${p.tag === 'best' ? 'best' : ''} ${mega ? 'mega' : ''}">
          ${p.tag === 'best' ? '<span class="best-ribbon">★ 最超值 ★</span>' : ''}
          ${first ? '<span class="ribbon px-badge hot">首儲雙倍</span>' : ''}
          <div class="row"><span class="thumb"><img src="${modernUI() && ModernIcons.url('gem' + (mega ? 7 : pi + 1)) || Sprites.gemPackURL(mega ? 7 : pi + 1, mega ? 3 : 2)}" alt=""></span>
          <div><div class="name">${esc(p.name)}</div>
          <div class="price">${gemI}${first ? `<b>${p.gems * 2}</b> <span class="strike">${p.gems}</span>` : `<b>${p.gems}</b>`}</div>
          ${p.valueText ? `<div class="value">${esc(p.valueText)}</div>` : ''}</div></div>
          <div class="acts"><button class="px-btn primary" data-act="buyp" data-arg="${p.id}">NT$${p.priceTWD}</button></div></div>`;
      }).join('')}</div>
      <p class="note">本遊戲所有儲值皆為<b>模擬購買</b>：不會連接任何金流，不會實際扣款，也不會收集付款資料。累計模擬儲值：NT$${s.totalSpent}</p>`;
    },
    daily() {
      const D = Game.daily, idx = D.loginDayIndex(), can = D.canClaimLogin();
      const days = D.loginRewards.map((g, i) => {
        const got = i < idx || (i === idx && !can);
        return `<div class="card day ${i === idx ? 'today' : ''} ${got ? 'got' : ''}">
        <div class="name">第 ${i + 1} 天</div><div>${gemI}<b>${g}</b></div>
        ${got ? '<div class="meta">已領取</div>' : i === idx ? '<div class="meta">今天</div>' : ''}</div>`;
      }).join('');
      const tasks = D.tasks.map(t => {
        const p = D.progress(t.id), ready = p.done && !p.claimed;
        return `<div class="owned"><span class="thumb"><img src="${ICON('star', 4)}" alt=""></span>
          <div><b>${esc(t.name)}</b><div class="meta">${p.count} / ${p.goal} · 獎勵 ${gemI}${t.reward}</div>
          <div class="vipbar"><i style="width:${Math.round(p.count / p.goal * 100)}%"></i></div></div>
          <button class="px-btn ${ready ? 'gold' : ''} small" data-act="task" data-arg="${t.id}" ${ready ? '' : 'disabled'}>${p.claimed ? '已領' : p.done ? '領取' : '進行中'}</button></div>`;
      }).join('');
      return `<h3 class="sec-title">每日登入 <span class="dim">7 天循環，中斷會重新計算</span><span class="grow"></span>
        <button class="px-btn gold small" data-act="login" ${can ? '' : 'disabled'}>${can ? '領取今日獎勵' : '今日已領'}</button></h3>
        <div class="days">${days}</div>
        <h3 class="sec-title" style="margin-top:12px">每日任務</h3><div class="owned-list">${tasks}</div>`;
    },
    dungeon: dungeonView,
    codex() {
      const list = Game.codex(), ach = Game.achievements();
      const found = list.filter(c => c.found).length, done = ach.filter(a => a.done).length;
      const rankOf = r => Game.rarityRank ? Game.rarityRank(r) : RAR_ORDER[r];
      const card = c => {
        const t = T(c.typeId);
        return c.found ? `<div class="codex-card ${t.rarity}"><img src="${slimeURL(t, 3)}" alt=""><b>${esc(t.name)}</b>${rar(t.rarity)}
            <span class="meta">tier ${t.tier} · 基礎 ${fmt(t.baseRate)}/秒</span>${t.skill ? `<span class="skill">${esc(t.skill)}</span>` : ''}<span class="meta">獲得 ${c.count} 次</span></div>`
          : `<div class="codex-card unknown ${t.rarity === 'UR' ? 'ur-unknown' : ''}"><img src="${Sprites.silhouetteURL(t, 3)}" alt=""><b>？？？</b>${rar(t.rarity)}<span class="meta">尚未發現</span></div>`;
      };
      const groups = [...new Set(list.map(c => T(c.typeId).rarity))].sort((a, b) => rankOf(b) - rankOf(a));
      const cards = groups.map(r => {
        const g = list.filter(c => T(c.typeId).rarity === r);
        return `<div class="codex-group ${r}"><h4>${rar(r)} <span class="dim">${g.filter(c => c.found).length} / ${g.length}</span></h4><div class="codex">${g.map(card).join('')}</div></div>`;
      }).join('');
      const achs = ach.slice().sort((a, b) => (a.done - b.done)).map(a => `<div class="ach ${a.done ? 'done' : ''}">
          <span class="ach-ico">${a.done ? '★' : '☆'}</span><div><b>${esc(a.name)}</b><div class="meta">${esc(a.desc)}</div></div>
          <span class="ach-rw">產量 +${Math.round(a.reward.mult * 100)}%${a.reward.gems ? `<br>${gemI}${a.reward.gems}` : ''}</span></div>`).join('');
      return `<h3 class="sec-title">史萊姆圖鑑 <span class="dim">${found} / ${list.length} · 產量 ×${Game.codexMult().toFixed(2)}</span></h3>
        <div class="vipbar" style="margin-bottom:8px"><i style="width:${found / list.length * 100}%"></i></div>
        ${cards}
        <h3 class="sec-title" style="margin-top:14px">成就 <span class="dim">${done} / ${ach.length} · 產量 ×${Game.achievementMult().toFixed(2)}</span></h3>
        <div class="owned-list">${achs}</div>`;
    },
    settings() {
      return `<h3 class="sec-title">設定</h3>
        <div class="acts" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="px-btn primary" data-act="save">立即存檔</button>
          <button class="px-btn danger" data-act="reset">重置進度</button></div>
        ${Game.exportSave ? `<div class="card" style="margin-top:10px"><div class="name">存檔轉移</div>
          <div class="meta">換電腦或換瀏覽器時，把存檔碼複製到新的地方，再用「匯入」貼上。</div>
          <div class="row" style="flex-wrap:wrap"><button class="px-btn small" data-act="export">匯出存檔碼</button><button class="px-btn small" data-act="copySave">複製</button></div>
          <textarea class="save-code" data-save-out readonly placeholder="按「匯出存檔碼」產生" aria-label="匯出的存檔碼"></textarea>
          <textarea class="save-code" data-save-in placeholder="在這裡貼上存檔碼（PSR1:…）" aria-label="要匯入的存檔碼"></textarea>
          <div class="row"><button class="px-btn danger small" data-act="import">匯入（覆蓋目前進度）</button></div></div>` : ''}
        ${Game.setArtStyle ? `<div class="card" style="margin-top:10px"><div class="name">畫面風格</div>
          <div class="row" style="flex-wrap:wrap">${[['modern', '現代 RPG（預設）'], ['pixel', '經典像素']].map(([k, l]) => `<button class="px-btn small ${Render.artStyle() === k ? 'primary' : ''}" data-act="artStyle" data-arg="${k}">${l}</button>`).join('')}</div>
          <div class="meta">現代 RPG：賽璐璐上色的角色與繪本風背景（需要 WebGL2，尚未完成的畫面會暫時使用像素風）。經典像素：v1.10 的 HD-2D 像素畫面。</div></div>` : ''}
        <div class="card" style="margin-top:10px"><div class="name">畫質</div>
          <div class="row" style="flex-wrap:wrap">${['high', 'mid', 'low'].map(q => `<button class="px-btn small ${Render.quality() === q ? 'primary' : ''}" data-act="quality" data-arg="${q}">${{ high: '高（HD-2D 全效果）', mid: '中', low: '低（省電）' }[q]}</button>`).join('')}</div>
          <div class="meta">${Render.usingGL() ? 'WebGL2 HD-2D 合成中' : '此裝置不支援 WebGL2，使用 2D 畫面'}。畫面不順時會自動降級；手動選擇後就不再自動調整。</div></div>
        ${Game.audio ? `<div class="card" style="margin-top:10px"><div class="name">音效</div>
          <div class="row" style="flex-wrap:wrap">
            <button class="px-btn small ${Game.audio.muted() ? '' : 'primary'}" data-act="mute">${Game.audio.muted() ? '🔇 已靜音' : '🔊 開啟中'}</button>
            <label class="vol">音效音量 <input type="range" min="0" max="100" step="5" value="${Math.round(Game.audio.volume() * 100)}" data-vol></label>
          </div>
          ${Game.audio.setMusicOn ? `<div class="row" style="flex-wrap:wrap">
            <button class="px-btn small ${Game.audio.musicOn() ? 'primary' : ''}" data-act="music">${Game.audio.musicOn() ? '♪ 音樂開啟' : '♪ 音樂關閉'}</button>
            <label class="vol">音樂音量 <input type="range" min="0" max="100" step="5" value="${Math.round(Game.audio.musicVolume() * 100)}" data-mvol></label>
          </div>` : ''}<div class="meta">8-bit 合成音效，不需要下載音檔。瀏覽器規定第一次點擊之後才會出聲。</div></div>` : ''}
        <p class="note">每 10 秒自動存檔到這個瀏覽器（localStorage）。目前離線收益上限 ${Game.offlineCapHours()} 小時。</p>
        <p class="note">像素史萊姆牧場 · 由 ccline-0b（引擎／商店）、ccline-27（畫面／介面）與 ccline-a3（設計／遠征）共同製作。所有課金內容均為模擬。</p>`;
    },
  };

  function prestigeView() {
    const s = Game.state, P = s.prestige, C = Game.config, gain = Game.prestigeGain(), can = Game.canPrestige();
    const pct = Math.min(100, Math.log10(s.runGold + 1) / Math.log10(C.prestigeMin) * 100);
    const ups = C.dustUpgrades;
    return `<h3 class="sec-title" style="margin-top:14px">轉生 <span class="dim">累計星塵 ✦${fmt(P.totalDust)} · 產量 ×${Game.dustMult().toFixed(2)} · 已轉生 ${P.count} 次</span></h3>
      <div class="card prestige-card ${can ? 'ready' : ''}">
        <div class="row"><span class="thumb" style="background:#2b2140"><img src="${ICON('star', 5)}" alt=""></span>
        <div style="flex:1"><div class="name">本輪金幣 ${coinI}${fmt(s.runGold)} / ${fmt(C.prestigeMin)}</div>
          <div class="vipbar"><i style="width:${pct.toFixed(1)}%;background:#b8a0ff"></i></div>
          <div class="meta">轉生會重置金幣、牧場升級與合成線史萊姆；保留寶石、扭蛋角色（等級回到 1、星級保留）、星塵、月卡與 VIP。每 1 點累計星塵產量 +${Math.round(C.dustBonus * 100)}%。</div></div></div>
        <div class="acts"><button class="px-btn ${can ? 'gold' : ''}" data-act="prestige" ${can ? '' : 'disabled'}>${can ? `轉生，獲得 ${dust(gain)}` : '尚未達到轉生門檻'}</button></div></div>
      <h3 class="sec-title" style="margin-top:12px">星塵商店 <span class="dim">可用 ${dust(P.dust)}</span></h3>
      <div class="grid">${Object.keys(ups).map(k => {
        const u = ups[k], lv = P.upgrades[k], cost = Game.dustUpgradeCost(k);
        return `<div class="card"><div class="name">${esc(u.name)} <span class="dim">Lv ${lv} / ${isFinite(u.max) ? u.max : '∞'}</span></div><div class="meta">${esc(u.desc)}</div>
          <div class="acts">${cost == null ? '<button class="px-btn small" disabled>已滿級</button>'
            : `<button class="px-btn blue small" data-act="dustup" data-arg="${k}" ${P.dust >= cost ? '' : 'disabled'}>${dust(cost)}</button>`}</div></div>`;
      }).join('')}</div>`;
  }
  const zoneThumbs = {};
  function zoneView() {
    if (!Game.zones) return '';
    const cur = Game.zone().id, dustNow = Game.state.prestige.dust;
    return `<h3 class="sec-title" style="margin-top:14px">地區 <span class="dim">用星塵依序解鎖，每區永久產量 ×1.5，並開放新的地區史萊姆</span></h3>
      <div class="grid zones">${Game.zones().map(z => {
        const th = zoneThumbs[z.id] || (zoneThumbs[z.id] = Sprites.scene(320, 180, z.id).toDataURL());
        const slime = z.slime && T(z.slime);
        const act = z.id === cur ? '<button class="px-btn small" disabled>目前所在</button>'
          : z.unlocked ? `<button class="px-btn blue small" data-act="goZone" data-arg="${z.id}">前往</button>`
          : z.available ? `<button class="px-btn gold small" data-act="unlockZone" data-arg="${z.id}" ${dustNow >= z.cost ? '' : 'disabled'}>解鎖 ${dust(z.cost)}</button>`
          : `<button class="px-btn small" disabled>需先解鎖上一區</button>`;
        return `<div class="card zone-card ${z.unlocked ? '' : 'locked'} ${z.id === cur ? 'current' : ''}">
          <img class="zone-thumb" src="${th}" alt="">
          <div class="row"><div class="name">${esc(z.name)}</div><span class="grow"></span>${slime ? thumb(slime.id) : ''}</div>
          <div class="meta">${z.unlocked ? '已解鎖' : `需要 ${dust(z.cost)}`}${slime ? ` · 地區史萊姆：${esc(slime.name)}` : ''}${!z.unlocked && Game.companionCap ? ' · 夥伴上限 +1' : ''}</div>
          <div class="acts">${act}</div></div>`;
      }).join('')}</div>`;
  }
  function doPrestige() {
    const gain = Game.prestigeGain();
    confirmModal('確定要轉生嗎？', `<p>你將獲得 ${dust(gain)} 星塵，產量倍率從 ×${Game.dustMult().toFixed(2)} 提升到 ×${(1 + Game.config.dustBonus * (Game.state.prestige.totalDust + gain)).toFixed(2)}。</p>
      <p class="note">重置：金幣、牧場升級、合成線史萊姆。保留：寶石、扭蛋角色、星塵、遠征進度、月卡、VIP。</p>`, '轉生！', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const r = Game.actions.prestige();
      if (!r.ok) return;
      shownGold = 0;
      setTimeout(() => modal(`<div style="text-align:center"><h3>✦ 轉生完成 ✦</h3><p>獲得 <b style="font-size:1.6em">${dust(r.stardust)}</b> 星塵</p>
        <p>全體產量 ×${Game.dustMult().toFixed(2)}</p><p class="note">記得到「升級 → 星塵商店」強化下一輪！</p></div>
        <div class="acts" style="justify-content:center"><button class="px-btn gold" data-close>重新出發</button></div>`, { cls: 'wide' }), 1300);
    }, 'gold');
  }

  // ---------- 遠征 ----------
  const EL_NAME = { fire: '火', water: '水', grass: '草', light: '光', dark: '暗' };
  // el：屬性 id；null＝史萊姆王（無屬性 ×1.5）；undefined＝未登錄（×1，不顯示）
  const elIcon = el => el ? `<img class="el" src="${elURL(el, 2)}" alt="${EL_NAME[el]}" title="${EL_NAME[el]}屬性">`
    : el === null ? '<span class="el-none" title="無屬性（對任何敵人 ×1.5）">◇</span>' : '';
  function multTag(m) {
    return m >= 2 ? '<span class="mt good">×2</span>' : m > 1 ? `<span class="mt good">×${m}</span>` : m < 1 ? '<span class="mt bad">×0.5</span>' : '';
  }
  function dungeonView() {
    const D = Game.dungeon;
    if (!D.unlocked()) {
      const cur = Math.min(Game.state.totalGold, D.UNLOCK_GOLD);
      return `<div class="empty" style="padding:24px"><div style="font-size:2em">🔒</div><h3>史萊姆遠征</h3>
        <p>累計獲得 ${coinI}${fmt(D.UNLOCK_GOLD)} 金幣後解鎖</p>
        <div class="vipbar" style="max-width:320px;margin:0 auto"><i style="width:${cur / D.UNLOCK_GOLD * 100}%"></i></div>
        <p class="note">${fmt(cur)} / ${fmt(D.UNLOCK_GOLD)}</p></div>`;
    }
    seen.set('dungeon');
    const pv = D.preview(), foe = pv.enemy, team = D.team(), pending = D.pendingRelic();
    const slots = [];
    for (let i = 0; i < D.TEAM_SIZE; i++) {
      const sl = team[i];
      const hitsWeak = sl && (foe.weak || []).includes(D.slimeElement[sl.type]);
      slots.push(sl ? `<button class="slot ${hitsWeak ? 'weak-hit' : ''}" data-act="slot" data-arg="${i}">${thumb(sl.type)}<span class="sl-name">${esc(T(sl.type).name)} Lv${sl.level}</span>
          <span class="sl-tags">${elIcon(D.slimeElement[sl.type])}${multTag(D.elementMult(sl.type, foe.element))}${hitsWeak ? '<span class="mt weak">WEAK</span>' : ''}</span></button>`
        : `<button class="slot empty-slot" data-act="slot" data-arg="${i}"><span class="plus">＋</span><span class="sl-name">空位</span></button>`);
    }
    const ratio = pv.seconds / D.TIME_LIMIT;
    const verdict = pv.dps <= 0 ? '<div class="verdict bad">隊伍無法造成傷害</div>'
      : pv.win ? `<div class="verdict good">預估 ${pv.seconds.toFixed(1)} 秒擊敗（限時 ${D.TIME_LIMIT} 秒）</div>`
      : `<div class="verdict bad">戰力不足 ×${ratio.toFixed(1)}（預估需要 ${pv.seconds.toFixed(0)} 秒，限時 ${D.TIME_LIMIT} 秒）</div>`;
    const relics = D.relics(), rKeys = Object.keys(relics).filter(k => relics[k]);
    const rp = D.rewardPreview ? D.rewardPreview() : { gems: 0, relic: foe.boss };
    const qp = D.quickPushPreview ? D.quickPushPreview() : null;
    const quick = qp ? `<div class="quick-bar"><button class="px-btn gold" data-act="quick" ${qp.floors > 0 && !pending ? '' : 'disabled'}>⚡ 快速推關<span data-live="quick">（預估 ${qp.floors} 層）</span></button>
      <span class="dim">不播動畫，立刻連續挑戰，直到打不過為止（單次最多 100 層）</span></div>` : '';
    return `<div class="dungeon">${autoBar()}${quick}
      <div class="foe-card ${foe.boss ? 'boss' : ''}">
        <img class="foe-img" src="${monURL(foe.id, foe.boss ? 3 : 5)}" alt="">
        <div class="foe-info"><div class="dim">第 ${foe.floor} 層 · 已通過 ${D.cleared()} 層（產量 +${D.cleared()}%）</div>
          <div class="foe-name">${foe.boss ? '<span class="px-badge hot">頭目</span> ' : ''}${esc(foe.name)} ${elIcon(foe.element)}</div>
          ${foe.shield ? `<div class="meta foe-guard"><span class="shield-chip"><img class="el" src="${ICON('relic_combat', 2)}" alt="">${foe.shield}</span> 弱點 ${(foe.weak || []).map(el => elIcon(el)).join('')}
            ${pv.breaks ? `<span class="px-badge brk">可 BREAK ×${pv.breaks}</span>` : pv.weakCount ? '' : '<span class="dim">（隊伍打不到弱點）</span>'}</div>` : ''}
          <div class="meta">HP ${fmt(foe.hp)} · 隊伍 DPS ${fmt(pv.dps)}</div>
          ${verdict}
          <div class="meta">勝利獎勵：${coinI}${rp.gold ? fmt(rp.gold) : '約 60 秒產量'}${rp.gems ? ` ＋ ${gemI}<b>${rp.gems}</b>` : ''}${rp.relic ? ' ＋ 遺物三選一' : ''}</div></div>
      </div>
      <h3 class="sec-title" style="margin-top:10px">出戰隊伍 <span class="dim">點格子替換</span><span class="grow"></span>
        <button class="px-btn small" data-act="autoteam">自動編隊</button></h3>
      <div class="slots">${slots.join('')}</div>
      <div class="acts" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        ${pending ? '<button class="px-btn gold" data-act="relic">選擇遺物</button>' : `<button class="px-btn ${pv.win ? 'primary' : 'pink'}" data-act="fight" style="flex:1">出戰！</button>`}</div>
      ${rKeys.length ? `<h3 class="sec-title" style="margin-top:12px">遺物</h3><div class="relics">${rKeys.map(k =>
        `<span class="px-badge relic" title="${esc(D.relicTypes[k].desc)}"><img class="ico" src="${ICON('relic_' + k, 2)}" alt="" style="width:16px;height:16px"> ${esc(D.relicTypes[k].name)} Lv${relics[k]}</span>`).join('')}</div>` : ''}
      <p class="note">弱點：用敵人的弱點屬性攻擊會削減盾牌，盾牌歸零時 BREAK（${Game.dungeon.BREAK_SECONDS || 4} 秒內暈眩、受到傷害 ×${Game.dungeon.BREAK_MULT || 2}）。<br>屬性相剋：火 → 草 → 水 → 火，光 ⇄ 暗。剋制傷害 ×2，被剋 ×0.5；史萊姆王無屬性，對任何敵人 ×1.5。每 10 層出現頭目。</p></div>`;
  }
  // ---------- 自動推關 ----------
  function autoStatusText() {
    const D = Game.dungeon, a = D.auto();
    if (!a.on) return '關閉中：開啟後每 ' + D.AUTO_INTERVAL + ' 秒自動挑戰下一層（遊戲開著時）';
    switch (a.status) {
      case 'locked': return '遠征尚未解鎖';
      case 'relic': return '等待選擇遺物';
      case 'waiting': { const pv = D.preview(); const need = pv.seconds / D.TIME_LIMIT; return `戰力不足，變強後自動繼續${isFinite(need) ? `（需 ×${need.toFixed(1)}）` : ''}`; }
      default: return `推進中…第 ${D.floor()} 層`;
    }
  }
  function autoBar() {
    const D = Game.dungeon; if (!D.auto) return '';
    const a = D.auto();
    return `<div class="auto-bar ${a.on ? 'on' : ''}">
      <button class="px-btn ${a.on ? 'gold' : ''} small" data-act="autoToggle"><span class="spin-ico">⟳</span> 自動推關：${a.on ? '開' : '關'}</button>
      <span class="auto-status" data-live="autoStatus">${esc(autoStatusText())}</span>
      <span class="grow"></span>
      <button class="px-btn small ${a.relic === 'smart' ? 'primary' : ''}" data-act="autoRelic" title="頭目遺物：自動選等級最低的／每次詢問">遺物：${a.relic === 'smart' ? '自動' : '詢問'}</button>
      <button class="px-btn small ${a.autoTeam ? 'primary' : ''}" data-act="autoTeamOpt" title="每層依敵人屬性自動編隊">每層自動編隊：${a.autoTeam ? '開' : '關'}</button>
    </div>`;
  }
  // 自動推關打完一層：在遠征頁就用 ×2 重播，否則只跳提示，不把牧場切走
  function onAutoResult(res) {
    if (!res || !res.ok) return;
    const D = Game.dungeon;
    if (tab !== 'dungeon' || battling || document.body.classList.contains('title-mode') || $('#modalRoot').children.length) return autoToast(res);
    battling = true; hudFreeze = true; D.busy = true;
    Battle.play(res, { speed: 2 }).then(closeArena => {
      const done = () => { battling = false; hudFreeze = false; D.busy = false; renderPanel(true); };
      if (res.win && res.enemy.boss) setTimeout(() => { closeArena(); done(); autoToast(res); }, 600);
      else { closeArena(); done(); if (res.win) autoToast(res); }
    });
  }
  function autoToast(res) {
    if (!res.win) return;
    const r = res.rewards || {};
    if (res.enemy.boss) {
      const d = document.createElement('div');
      d.className = 'ach-pop boss-pop';
      d.innerHTML = `<span>⚔ 頭目擊破</span><b>第 ${res.enemy.floor} 層　${esc(res.enemy.name)}</b><small>${r.gems ? '💎+' + r.gems + '　' : ''}${r.tickets ? '🎫+' + r.tickets + '　' : ''}${r.oracleTickets ? '✧ 神諭券+' + r.oracleTickets + '　' : ''}${r.relicChoices && Game.dungeon.auto().relic === 'smart' ? '已自動選擇遺物' : ''}</small>`;
      document.body.appendChild(d);
      d.animate([{ transform: 'translate(-50%,-120%)' }, { transform: 'translate(-50%,0)', offset: 0.12 }, { transform: 'translate(-50%,0)', offset: 0.85 }, { transform: 'translate(-50%,-120%)' }], { duration: 3200 }).onfinish = () => d.remove();
    } else toast(`⚔ 第 ${res.enemy.floor} 層通過${r.gems ? '　💎+' + r.gems : ''}`);
  }

  function pickSlot(i) {
    const D = Game.dungeon, foe = D.preview().enemy, team = D.team().map(x => x.uid);
    const dps = sl => Game.rateOf(sl) * D.elementMult(sl.type, foe.element) * (1 + D.relicBonus('combat'));
    const list = Game.state.slimes.slice().sort((a, b) => dps(b) - dps(a)).map(sl => `<button class="owned pick" data-uid="${sl.uid}">
        ${thumb(sl.type)}<div style="text-align:left"><b>${esc(T(sl.type).name)}</b> Lv${sl.level} ${elIcon(D.slimeElement[sl.type])}${multTag(D.elementMult(sl.type, foe.element))}
        <div class="meta">對 ${esc(foe.name)} DPS ${fmt(dps(sl))}</div></div>${team.includes(sl.uid) ? '<span class="px-badge">隊伍中</span>' : '<span></span>'}</button>`).join('');
    const m = modal(`<h3>選擇第 ${i + 1} 格</h3><div class="owned-list pick-list">${list}</div>
      <div class="acts">${team[i] != null ? '<button class="px-btn danger small" data-rm>移出隊伍</button>' : ''}<button class="px-btn" data-close>取消</button></div>`, { cls: 'wide' });
    m.el.querySelectorAll('[data-uid]').forEach(b => b.addEventListener('click', () => {
      const uid = +b.dataset.uid, t = team.slice(), j = t.indexOf(uid);
      if (j >= 0) t[j] = t[i]; // 已在隊伍中 → 交換位置
      t[i] = uid;
      D.setTeam(t.filter(x => x != null)); m.close(); renderPanel(true);
    }));
    const rm = m.el.querySelector('[data-rm]');
    if (rm) rm.addEventListener('click', () => { const t = team.slice(); t.splice(i, 1); D.setTeam(t); m.close(); renderPanel(true); });
  }
  function doFight() {
    if (battling) return;
    const D = Game.dungeon;
    hudFreeze = true; battling = true; D.busy = true;
    const res = D.fight();
    if (!res.ok) { hudFreeze = false; battling = false; D.busy = false; return toast(res.msg); }
    $('#stageWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (Game.audio && Game.audio.setBattle) Game.audio.setBattle(true, !!res.enemy.boss);
    Battle.play(res).then(closeArena => {
      const endBattle = () => { closeArena(); D.busy = false; if (Game.audio && Game.audio.setBattle) Game.audio.setBattle(false); };
      battling = false; hudFreeze = false;
      const r = res.rewards;
      if (res.win) {
        const boss = res.enemy.boss;
        const m = modal(`<div style="text-align:center">${boss ? `<img src="${monURL(res.enemy.id, 3)}" alt="" style="${modernUI() ? 'width:140px;' : 'image-rendering:pixelated;'}filter:grayscale(1) brightness(.6)"><h3 class="boss-title">頭目擊破！</h3>` : `<h3>🚩 第 ${res.enemy.floor} 層 通關！</h3>`}
          <p class="${boss ? 'big-gems' : ''}">${coinI}<b>+${fmt(r.gold)}</b></p>${r.tickets ? `<p class="${boss ? 'big-gems' : ''} ticket-line">🎫 星輝券 <b>+${r.tickets}</b></p>` : ''}${r.oracleTickets ? `<p class="big-gems oticket-line">✧ 神諭券 <b>+${r.oracleTickets}</b></p>` : ''}${r.gems ? `<p class="${boss ? 'big-gems' : ''}">${gemI}<b>+${r.gems}</b></p>` : ''}
          <p class="note">通過第 ${res.enemy.floor} 層：全體產量永久 +1%，累計 +${D.cleared()}%</p></div>
          <div class="acts" style="justify-content:center"><button class="px-btn" data-close>回到隊伍</button><button class="px-btn primary" data-next>${r.relicChoices ? '選擇遺物' : '挑戰下一層'}</button></div>`, { cls: boss ? 'gacha-modal' : 'wide' });
        const src = m.el.querySelector('.px-modal');
        flyTo(src, 'coin', 10, '#hudGoldIco'); if (r.gems) flyTo(src, 'gem', 6, '#hudGemIco');
        m.el.querySelector('[data-next]').addEventListener('click', () => { m.close(); if (r.relicChoices) showRelic(); else doFight(); });
        m.onClose(endBattle);
        if (r.relicChoices) m.onClose(() => { if (D.pendingRelic()) enqueue(showRelic); });
      } else {
        modal(`<div style="text-align:center"><h3>挑戰失敗…</h3><p>${esc(res.enemy.name)} 還剩 HP ${fmt(res.hpLeft)}</p>
          <p class="note">提示：升級史萊姆（Lv10／25／50／100 產量 ×2）、帶剋制屬性的史萊姆（傷害 ×2），或按「自動編隊」。</p></div>
          <div class="acts" style="justify-content:center"><button class="px-btn primary" data-close>知道了</button></div>`).onClose(endBattle);
      }
      renderPanel(true);
    });
  }
  // 快速推關：不播動畫，彙總卡
  function doQuickPush() {
    const D = Game.dungeon;
    if (battling) return;
    const q = D.quickPush();
    if (!q || q.stop === 'busy') return toast('戰鬥播放中，請稍後再試');
    if (q.stop === 'locked') return toast('遠征尚未解鎖');
    if (!q.cleared) return toast(q.stop === 'relic' ? '請先選擇遺物' : '目前戰力不足，無法推進');
    let bosses = 0; for (let f = q.from + 1; f <= q.to; f++) if (f % 10 === 0) bosses++;
    const stopText = { weak: `戰力不足，停在第 ${q.to + 1} 層`, relic: '擊破頭目，等待選擇遺物', limit: '已達單次上限，可以再按一次繼續推進' }[q.stop] || '';
    const relicRow = (q.relics || []).map(k => `<span class="px-badge relic"><img class="ico" src="${ICON('relic_' + k, 2)}" alt="" style="width:16px;height:16px"> ${esc(D.relicTypes[k].name)}</span>`).join(' ');
    const m = modal(`<div class="quick-sum"><h3>⚡ 快速推關</h3>
        <div class="qs-floors">第 ${q.from + 1} → ${q.to} 層<span class="dim">（共 ${q.cleared} 層）</span></div>
        <div class="qs-grid">
          <div>${coinI}<b>+${fmt(q.gold)}</b></div>
          ${q.gems ? `<div>${gemI}<b>+${q.gems}</b></div>` : ''}
          ${q.tickets && q.tickets.premium ? `<div class="ticket-line">🎫 星輝券 <b>+${q.tickets.premium}</b></div>` : ''}
          ${q.tickets && q.tickets.oracle ? `<div class="oticket-line">✧ 神諭券 <b>+${q.tickets.oracle}</b></div>` : ''}
          ${bosses ? `<div>⚔ 擊破頭目 <b>×${bosses}</b></div>` : ''}
        </div>
        ${relicRow ? `<div class="relics" style="justify-content:center;margin-top:6px">${relicRow}</div>` : ''}
        <p class="note">全體產量永久 +${q.cleared}%（累計 +${D.cleared()}%）${stopText ? '。' + stopText : ''}</p></div>
      <div class="acts" style="justify-content:center">${q.stop === 'relic' ? '<button class="px-btn gold" data-relic>選擇遺物</button>' : ''}<button class="px-btn primary" data-close>好</button></div>`, { cls: 'wide' });
    const src = m.el.querySelector('.px-modal');
    flyTo(src, 'coin', 10, '#hudGoldIco'); if (q.gems) flyTo(src, 'gem', 6, '#hudGemIco');
    const rb = m.el.querySelector('[data-relic]');
    if (rb) rb.addEventListener('click', () => { m.close(); enqueue(showRelic); });
    renderPanel(true);
  }
  function showRelic() {
    const D = Game.dungeon, keys = D.pendingRelic(); if (!keys) return null;
    const rel = D.relics();
    const m = modal(`<h3 style="text-align:center">頭目擊破！選擇一件遺物</h3><div class="relic-pick">${keys.map(k => {
      const r = D.relicTypes[k];
      return `<button class="relic-card" data-k="${k}"><img src="${ICON('relic_' + k, 6) || ICON('star', 6)}" alt=""><b>${esc(r.name)}</b><span>${esc(r.desc)}</span><span class="dim">目前 Lv${rel[k] || 0} → Lv${(rel[k] || 0) + 1}</span></button>`;
    }).join('')}</div><p class="note" style="text-align:center">遺物永久有效，轉生也會保留；同種遺物可疊加。</p>`, { dismiss: false, cls: 'gacha-modal' });
    m.el.querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => { D.chooseRelic(b.dataset.k); flash('#fff3c0'); m.close(); renderPanel(true); }));
    return m;
  }

  function normalGachaView() {
      const G = Game.gacha, types = Object.values(Game.config.slimeTypes), fp = G.freePullProgress();
      const pool = r => r === 'N' ? '金幣袋（金幣）' : types.filter(t => t.rarity === r && !t.noGacha && !t.premium && !t.oracle).map(t => esc(t.name) + (r === 'R' ? '（Lv10）' : '')).join('、');
      const rows = ['SSR', 'SR', 'R', 'N'].map(r => `<tr><td>${rar(r)}</td><td>${(G.rates[r] * 100).toFixed(0)}%</td><td>${pool(r)}</td></tr>`).join('');
      return `<div class="gacha-hero">
        <img class="capsule" src="${ICON('capsule', 8)}" alt="">
        <div class="info"><h3 style="margin:0 0 4px">史萊姆扭蛋</h3>
          <div>抽出稀有史萊姆！牧場滿了會自動放進倉庫。</div>
          <div class="dim" style="opacity:.85">距離保底 SSR 還有 <b>${G.pityLeft()}</b> 抽</div>
          ${fp.done ? '' : fp.ready ? '<div style="color:#ffd23f;margin-top:4px">🎁 新手免費抽已開放，必出 SR！</div>'
            : `<div style="margin-top:4px">再收集 ${coinI}<b>${fmt(fp.need - fp.cur)}</b> 金幣 → 免費 SR 抽！</div>
               <div class="vipbar" style="margin-top:2px"><i style="width:${Math.round(fp.cur / fp.need * 100)}%"></i></div>`}</div>
        <div class="acts">
          ${fp.ready ? '<button class="px-btn gold" data-act="free">🎁 免費抽（必出 SR）</button>' : ''}
          <button class="px-btn pink" data-act="pull" data-arg="1" data-gem="${G.cost(1)}">單抽 ${gemI}${G.cost(1)}</button>
          <button class="px-btn gold" data-act="pull" data-arg="10" data-gem="${G.cost(10)}">十連 ${gemI}${G.cost(10)} <span class="px-badge hot">保底 SR</span></button>
          <button class="px-btn danger" data-act="pull" data-arg="100" data-gem="${G.cost(100)}">百連 ×100 ${gemI}${G.cost(100)}</button>
        </div></div>
        ${G.setAutoSell ? `<div class="auto-sell"><span>自動販賣 R（魔晶 Lv10）：</span>${[['off', '關閉'], ['R', 'R 一律賣'], ['R_full', '牧場滿時才賣']].map(([m, l]) =>
          `<button class="px-btn small ${G.autoSell() === m ? 'primary' : ''}" data-act="autoSell" data-arg="${m}">${l}</button>`).join('')}</div>` : ''}
        <h3 class="sec-title">機率公開</h3>
        <div class="tbl"><table class="rates"><tr><th>稀有度</th><th>機率</th><th>可能獲得</th></tr>${rows}</table></div>
        <p class="note">百連 = 十連 ×10。十連抽必定至少 1 隻 SR 以上；連續 ${G.hardPity} 抽沒有 SSR 時，下一抽必定 SSR。同稀有度內各史萊姆機率均等。抽到已擁有的扭蛋限定史萊姆會升星（每星產量 +50%，最高 5 星），滿星改送 50 寶石。</p>`;
    }

  // 神諭扭蛋：白金與深藍的神殿風、公開機率、LR 保底、神諭券
  function oracleGachaView() {
    const O = Game.gacha.oracle, types = Object.values(Game.config.slimeTypes).filter(t => t.oracle);
    const rows = ['LR', 'UR', 'SSR'].map(r => {
      const names = types.filter(t => t.rarity === r), each = names.length ? (O.rates[r] / names.length * 100) : 0;
      return `<tr><td>${rar(r)}</td><td>${(O.rates[r] * 100).toFixed(0)}%</td><td>${names.map(t => `${esc(t.name)}<span class="dim">（${each.toFixed(2)}%）</span>`).join('、')}</td></tr>`;
    }).join('');
    const tk = O.tickets();
    return `<div class="gacha-hero oracle-hero">
        <img class="capsule" src="${ICON('capsule_oracle', 8)}" alt="">
        <div class="info"><h3 style="margin:0 0 4px" class="oracle-title">✧ 神諭扭蛋</h3>
          <div>只會出現神諭限定的 SSR／<span class="ur-text">UR</span>／<span class="lr-text">LR</span> 史萊姆，星輝與普通扭蛋都抽不到。</div>
          <div style="margin-top:4px">距離 <span class="lr-text"><b>LR</b></span> 保底還有 <b>${O.pityLeft()}</b> 抽</div>
          <div style="margin-top:2px">✧ 神諭券 <b>×${tk}</b> <span class="dim">（遠征第 100 層起，每 50 層首通送 1 張）</span></div></div>
        <div class="acts">
          <button class="px-btn gold" data-act="opull" data-arg="ticket" ${tk ? '' : 'disabled'}>✧ 用券抽 1 次</button>
          <button class="px-btn primary" data-act="opull" data-arg="1" data-gem="${O.cost(1)}">單抽 ${gemI}${O.cost(1)}</button>
          <button class="px-btn gold" data-act="opull" data-arg="10" data-gem="${O.cost(10)}">十連 ${gemI}${O.cost(10)} <span class="px-badge hot">保底 UR</span></button>
          <button class="px-btn danger" data-act="opull" data-arg="100" data-gem="${O.cost(100)}">百連 ×100 ${gemI}${O.cost(100)}</button>
        </div></div>
      <h3 class="sec-title">機率公開</h3>
      <div class="tbl"><table class="rates"><tr><th>稀有度</th><th>機率</th><th>可能獲得（各自機率）</th></tr>${rows}</table></div>
      <p class="note">百連 = 十連 ×10（不能使用券）。十連抽必定至少 1 隻 UR 以上；連續 ${O.hardPity} 抽沒有 LR 時，下一抽必定 LR（保底次數獨立計算）。同稀有度內各史萊姆機率均等。LR 擁有雙技能。重複獲得會升星（最高 5 星），滿星改送 400 寶石。</p>`;
  }
  // 星輝扭蛋：黑金膠囊、深色星空、公開機率（含名單）、UR 保底、星輝券
  function premiumGachaView() {
    const P = Game.gacha.premium, types = Object.values(Game.config.slimeTypes).filter(t => t.premium);
    const ranks = ['UR', 'SSR', 'SR'];
    const rows = ranks.map(r => {
      const names = types.filter(t => t.rarity === r);
      const each = names.length ? (P.rates[r] / names.length * 100) : 0;
      return `<tr><td>${rar(r)}</td><td>${(P.rates[r] * 100).toFixed(0)}%</td><td>${names.map(t => `${esc(t.name)}<span class="dim">（${each.toFixed(2)}%）</span>`).join('、')}</td></tr>`;
    }).join('');
    const tk = P.tickets();
    return `<div class="gacha-hero premium-hero">
        <img class="capsule" src="${ICON('capsule_star', 8)}" alt="">
        <div class="info"><h3 style="margin:0 0 4px" class="star-title">✦ 星輝扭蛋</h3>
          <div>只會出現星輝限定的 SR／SSR／<span class="ur-text">UR</span> 史萊姆，普通扭蛋抽不到。</div>
          <div style="margin-top:4px">距離 <span class="ur-text"><b>UR</b></span> 保底還有 <b>${P.pityLeft()}</b> 抽</div>
          <div style="margin-top:2px">🎫 星輝券 <b>×${tk}</b> <span class="dim">（遠征頭目首通各送 1 張）</span></div></div>
        <div class="acts">
          <button class="px-btn gold" data-act="ppull" data-arg="ticket" ${tk ? '' : 'disabled'}>🎫 用券抽 1 次</button>
          <button class="px-btn pink" data-act="ppull" data-arg="1" data-gem="${P.cost(1)}">單抽 ${gemI}${P.cost(1)}</button>
          <button class="px-btn gold" data-act="ppull" data-arg="10" data-gem="${P.cost(10)}">十連 ${gemI}${P.cost(10)} <span class="px-badge hot">保底 SSR</span></button>
          <button class="px-btn danger" data-act="ppull" data-arg="100" data-gem="${P.cost(100)}">百連 ×100 ${gemI}${P.cost(100)}</button>
        </div></div>
      <h3 class="sec-title">機率公開</h3>
      <div class="tbl"><table class="rates"><tr><th>稀有度</th><th>機率</th><th>可能獲得（各自機率）</th></tr>${rows}</table></div>
      <p class="note">百連 = 十連 ×10（不能使用券）。十連抽必定至少 1 隻 SSR 以上；連續 ${P.hardPity} 抽沒有 UR 時，下一抽必定 UR（保底次數與普通扭蛋分開計算）。同稀有度內各史萊姆機率均等。重複獲得會升星（最高 5 星），滿星改送 150 寶石。</p>`;
  }

  function renderPanel(force) {
    if (battling) return; // 戰鬥重播期間不更新，避免劇透
    const sig = signature();
    if (!force && sig === lastSig) return refreshDynamic();
    lastSig = sig;
    $('#panel').innerHTML = VIEWS[tab]();
    refreshDynamic();
  }
  function refreshDynamic() {
    const s = Game.state;
    document.querySelectorAll('#panel [data-cost]').forEach(b => { b.disabled = s.gold < +b.dataset.cost; });
    document.querySelectorAll('#panel [data-gem]').forEach(b => b.classList.toggle('disabled', s.gems < +b.dataset.gem));
    const live = document.querySelector('#panel [data-live="boost"]');
    if (live) live.textContent = fmtDur(Game.shop.boostSecondsLeft());
    document.querySelectorAll('#panel [data-maxkind]').forEach(b => {
      const pv = b.dataset.maxkind === 'slime' ? Game.levelUpMaxPreview(+b.dataset.arg) : Game.upgradeMaxPreview(b.dataset.arg);
      b.disabled = pv.levels < 1;
      const txt = pv.levels > 0 ? `MAX +${pv.levels} 級` : 'MAX';
      if (b.textContent !== txt) b.textContent = txt;
      b.title = pv.levels > 0 ? `一次升 ${pv.levels} 級，花費 ${fmt(pv.cost)} 金幣` : '金幣不足';
    });
    const ql = document.querySelector('#panel [data-live="quick"]');
    if (ql && Game.dungeon.quickPushPreview) {
      const qp = Game.dungeon.quickPushPreview(); ql.textContent = `（預估 ${qp.floors} 層）`;
      ql.parentElement.disabled = qp.floors < 1 || !!Game.dungeon.pendingRelic() || battling;
    }
    const as = document.querySelector('#panel [data-live="autoStatus"]');
    if (as) as.textContent = autoStatusText();
    const st = document.querySelector('#panel [data-live="starter"]');
    if (st) st.textContent = fmtDur(Game.shop.starterSecondsLeft());
  }
  function setTab(name) {
    tab = name;
    document.querySelectorAll('.px-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    renderPanel(true);
    const pn = $('#panel'); pn.classList.remove('enter'); void pn.offsetWidth; pn.classList.add('enter');
    if (name === 'gacha') warmSprites();
  }
  // 扭蛋頁打開時，用閒置時間先把各角色的卡片 sprite 畫好，揭曉開場就不會卡一下
  const warmed = {};
  function warmSprites() {
    const key = modernUI() ? 'modern' : 'pixel';
    if (warmed[key]) return; warmed[key] = true;
    const list = Object.values(Game.config.slimeTypes);
    const idle = window.requestIdleCallback || (fn => setTimeout(() => fn({ timeRemaining: () => 8 }), 50));
    // 揭曉彈窗開著時先停手，免得跟揭曉動畫搶同一幀
    const step = dl => {
      if ($('#modalRoot').children.length) return setTimeout(() => idle(step), 500);
      while (list.length && dl.timeRemaining() > 12) {
        const t = list.shift();
        if (key === 'modern') ModernSprites.uiCanvas(t); else Sprites.slimeCanvas(t, 0, 0, 0);
      }
      if (list.length) idle(step);
    };
    idle(step);
  }

  // ---------- 動作 ----------
  function buyProduct(id, btn) {
    const p = Game.shop.products.find(x => x.id === id);
    const first = p.kind === 'gems' && p.bonusFirst && !Game.state.shop.firstBuyDone[p.id];
    const gain = first ? p.gems * 2 : p.gems;
    confirmModal('確認購買', `<p><b>${esc(p.name)}</b> — NT$${p.priceTWD}</p>
      <p>${esc(p.desc)}${p.kind === 'gems' ? `，實得 ${gemI}<b>${gain}</b>${first ? '（首儲雙倍）' : ''}` : ''}</p>
      <div class="sim-warn">⚠ 這是<b>模擬購買</b>，不會實際扣款，也不需要輸入任何付款資料。</div>`, '確認（模擬）', () => {
      const wait = modal('<h3>處理中…</h3><p>模擬付款中，請稍候</p>', { dismiss: false });
      Game.shop.purchase(id).then(res => {
        wait.close();
        if (!res.ok) return toast(res.msg);
        flash('#fff3c0');
        flyTo(btn && document.body.contains(btn) ? btn : $('#panel'), 'gem', 10, '#hudGemIco');
        modal(`<h3>${first ? '🎉 首儲雙倍！' : '購買成功'}</h3><p>${esc(res.msg)}</p>
          <div class="acts"><button class="px-btn primary" data-close>太好了</button></div>`);
      });
    });
  }

  function pull(n, free) {
    const cost = Game.gacha.cost(n);
    if (!free && Game.state.gems < cost) return noGems(cost);
    const prevCodex = Object.assign({}, Game.state.codex);
    const res = Game.gacha.pull(n, !!free);
    if (!res.ok) return toast(res.msg);
    showPulls(res.results, { prevCodex, again: () => pull(n) });
  }
  function pullOracle(n, useTicket) {
    const O = Game.gacha.oracle;
    if (!useTicket && Game.state.gems < O.cost(n)) return noGems(O.cost(n));
    const prevCodex = Object.assign({}, Game.state.codex);
    const res = O.pull(n, !!useTicket);
    if (!res.ok) return toast(res.msg);
    showPulls(res.results, { oracle: true, prevCodex, again: () => pullOracle(n === 100 ? 100 : 1, n !== 100 && useTicket && O.tickets() > 0) });
  }
  function pullPremium(n, useTicket) {
    const P = Game.gacha.premium;
    if (!useTicket && Game.state.gems < P.cost(n)) return noGems(P.cost(n));
    const prevCodex = Object.assign({}, Game.state.codex);
    const res = P.pull(n, !!useTicket);
    if (!res.ok) return toast(res.msg);
    showPulls(res.results, { premium: true, prevCodex, again: () => pullPremium(n === 100 ? 100 : 1, n !== 100 && useTicket && P.tickets() > 0) });
  }
  // opts.premium：星輝扭蛋（黑金膠囊）；opts.again：「再抽一次」要做的事
  function showSingle(r, opts = {}) {
    const v = resultView(r, 8), isUR = r.rarity === 'UR', isLR = r.rarity === 'LR';
    const glow = { N: '#ffffff', R: '#4fa8ff', SR: '#b06cff', SSR: '#ffd23f', UR: '#ffffff', LR: '#fff4d0' }[r.rarity];
    const capsule = opts.oracle ? 'capsule_oracle' : opts.premium ? 'capsule_star' : 'capsule';
    const m = modal(`<div class="reveal ${opts.premium ? 'premium' : ''} ${opts.oracle ? 'oracle' : ''}"><div class="rays ${isUR ? 'ur' : isLR ? 'lr' : ''}" style="--glow:${glow}"></div>
      <img class="egg" src="${ICON(capsule, 10)}" alt=""></div>
      <div class="acts" style="justify-content:center"><button class="px-btn" data-skip>跳過</button></div>`, { dismiss: false, cls: 'gacha-modal' });
    Render.hold(true); m.onClose(() => Render.hold(false));
    const box = m.el.querySelector('.reveal'), egg = box.querySelector('.egg');
    const timers = [];
    const fx = [];
    const show = () => {
      timers.forEach(clearTimeout); fx.forEach(e => e.remove());
      if (!isLR) sfx('reveal_' + r.rarity); // LR 的鐘聲在演出開頭就已經播放

      if (RAR_ORDER[r.rarity] >= 2) flash(isUR ? '#ffffff' : r.rarity === 'SSR' ? '#ffe27a' : '#e6c8ff');
      if (isUR) urRipple();
      if (RAR_ORDER[r.rarity] >= 3) m.el.querySelector('.px-modal').animate([{ transform: 'translate(-5px,0)' }, { transform: 'translate(5px,0)' }, { transform: 'none' }], { duration: 220, iterations: 3 });
      const sl = r.uid != null && (Game.state.slimes.concat(Game.state.storage)).find(x => x.uid === r.uid);
      box.classList.add('open');
      box.innerHTML = `<div class="rays on ${isUR ? 'ur' : isLR ? 'lr' : ''}" style="--glow:${glow}"></div>${isLR ? '<div class="lr-glow on"></div><div class="lr-halo"></div>' : ''}
        <img class="big ${isUR ? 'ur-big' : isLR ? 'lr-big' : ''}" src="${v.img}" alt="">
        <div class="big-name">${rar(r.rarity)} ${esc(v.name)}</div>
        ${sl ? `<div class="big-rate">每秒 +${fmt(Game.rateOf(sl))}</div>` : v.sub ? `<div class="big-rate ${v.sold ? 'sold' : ''}">${esc(v.sub)}</div>` : ''}
        ${r.typeId && T(r.typeId).skill ? `<div class="skill big-skill">技能：${esc(Game.skillText(r.typeId, (sl && sl.star) || 0))}</div>` : ''}
        ${r.dup ? (r.gems ? `<div class="meta">已滿星，轉換為寶石 ${r.gems}</div>` : `<div class="meta">重複獲得 → 升星 ${'★'.repeat(r.star)}</div>`) : r.stored ? '<div class="meta">牧場已滿，已放入倉庫</div>' : ''}`;
      const acts = m.el.querySelector('.acts');
      acts.innerHTML = '<button class="px-btn" data-again>再抽一次</button><button class="px-btn primary" data-close>收下</button>';
      acts.querySelector('[data-close]').addEventListener('click', m.close);
      acts.querySelector('[data-again]').addEventListener('click', () => { m.close(); (opts.again || (() => pull(1)))(); });
    };
    if (isLR) {
      // LR：畫面轉白金 → 膠囊懸浮 → 第 3 聲鐘響（約 0.9 秒）碎成光羽、巨大光輪浮現 → 白金卡背 → 上行琶音（約 1.4 秒）揭曉
      sfx('reveal_LR');
      // 光只在卡片區域內以加法混合發亮，彈窗外的遮罩維持深藍黑
      const glow = document.createElement('div'); glow.className = 'lr-glow'; box.prepend(glow);
      egg.classList.add('levitate');
      timers.push(setTimeout(() => {
        egg.classList.remove('levitate'); egg.classList.add('shatter');
        lrFeathers(box);
        const halo = document.createElement('div'); halo.className = 'lr-halo'; box.appendChild(halo);
        box.querySelector('.rays').classList.add('on');
      }, 900));
      timers.push(setTimeout(() => {
        egg.remove();
        const back = document.createElement('div'); back.className = 'ur-cardback lr-cardback'; back.innerHTML = '<span>LR</span>'; box.appendChild(back);
      }, 1100));
      timers.push(setTimeout(() => { flash('#fffbea'); show(); }, 1450));
      m.el.querySelector('[data-skip]').addEventListener('click', show);
      return;
    }
    if (isUR) {
      // UR：全黑 0.5 秒 → 膠囊裂開、彩虹光柱 → 全螢幕彩虹波紋 → 彩虹卡背 → 停頓 → 揭曉
      for (let k = 0; k < 4; k++) timers.push(setTimeout(() => sfx('eggShake'), k * 300));
      egg.classList.add('shake');
      timers.push(setTimeout(() => {
        const bk = document.createElement('div'); bk.className = 'ur-black'; document.body.appendChild(bk); fx.push(bk);
        setTimeout(() => bk.remove(), 520);
      }, 1100));
      timers.push(setTimeout(() => {
        egg.classList.remove('shake'); egg.classList.add('crack');
        const pil = document.createElement('div'); pil.className = 'ur-pillar'; box.appendChild(pil);
        box.querySelector('.rays').classList.add('on');
      }, 1620));
      timers.push(setTimeout(() => { fx.push(urRipple()); }, 2200));
      timers.push(setTimeout(() => {
        egg.remove(); box.querySelector('.ur-pillar') && box.querySelector('.ur-pillar').remove();
        const back = document.createElement('div'); back.className = 'ur-cardback'; back.innerHTML = '<span>UR</span>'; box.appendChild(back);
      }, 2700));
      timers.push(setTimeout(() => { flash('#fff'); show(); }, 3700));
      m.el.querySelector('[data-skip]').addEventListener('click', show);
      return;
    }
    egg.classList.add('shake');
    for (let k = 0; k < 4; k++) timers.push(setTimeout(() => sfx('eggShake'), k * 300));
    timers.push(setTimeout(() => { egg.classList.remove('shake'); egg.classList.add('charge'); egg.style.setProperty('--glow', glow); box.querySelector('.rays').classList.add('on'); },
      1200));
    timers.push(setTimeout(() => { flash('#fff'); show(); }, RAR_ORDER[r.rarity] >= 2 ? 1900 : 1500));
    m.el.querySelector('[data-skip]').addEventListener('click', show);
  }
  // LR：光羽碎片（白金羽毛往外飄散後緩緩落下）
  let feathersLive = 0;
  const FEATHER_CAP = 120; // 全域光羽上限
  function lrFeathers(box) {
    const r = box.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const n = Math.min(28, FEATHER_CAP - feathersLive);
    for (let i = 0; i < n; i++) {
      feathersLive++;
      const f = document.createElement('div'); f.className = 'lr-feather';
      document.body.appendChild(f);
      const ang = Math.random() * Math.PI * 2, d = 80 + Math.random() * 220, dx = Math.cos(ang) * d, dy = Math.sin(ang) * d * 0.7;
      const rot = (Math.random() * 360) | 0;
      f.animate([
        { transform: `translate(${cx}px,${cy}px) rotate(${rot}deg) scale(.4)`, opacity: 1 },
        { transform: `translate(${cx + dx}px,${cy + dy}px) rotate(${rot + 120}deg) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${cx + dx * 1.1}px,${cy + dy + 160}px) rotate(${rot + 260}deg) scale(.9)`, opacity: 0 },
      ], { duration: 2200 + Math.random() * 800, easing: 'ease-out', fill: 'forwards' }).onfinish = () => { f.remove(); feathersLive--; };
    }
  }
  // UR 全螢幕波紋：3 道細的發光環（screen 混合）由中心快速擴散後淡出
  function urRipple() {
    const wrap = document.createElement('div');
    [['#ff8a6a', '5px', '0s'], ['#ffe36a', '4px', '.12s'], ['#7ad8ff', '3px', '.24s']].forEach(([c, w, d]) => {
      const r = document.createElement('div'); r.className = 'ur-ring';
      r.style.setProperty('--c', c); r.style.setProperty('--w', w); r.style.setProperty('--d', d);
      wrap.appendChild(r);
    });
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 1600);
    return wrap;
  }
  function showPulls(results, opts = {}) {
    if (results.length === 1) return showSingle(results[0], opts);
    if (results.length > 10) return showBulk(results, opts);
    // 最高稀有度放最後揭曉
    const order = results.slice().sort((a, b) => RAR_ORDER[a.rarity] - RAR_ORDER[b.rarity]);
    const glow = { N: '#ffffff', R: '#4fa8ff', SR: '#b06cff', SSR: '#ffd23f', UR: '#ffffff', LR: '#fff4d0' };
    const capsule = ICON(opts.oracle ? 'capsule_oracle' : opts.premium ? 'capsule_star' : 'capsule', 6);
    const m = modal(`<h3>扭蛋結果</h3><div class="pulls">${order.map((r, i) =>
      `<div class="pull waiting" style="animation-delay:${i * 0.06}s;--g:${glow[r.rarity]}" data-i="${i}"><img class="cap" src="${capsule}" alt=""><div>？</div></div>`).join('')}</div>
      <div class="acts"><button class="px-btn" data-skip>跳過</button><button class="px-btn primary" data-close hidden>收下</button></div>`, { dismiss: false, cls: 'gacha-modal' });
    Render.hold(true); hudFreeze = true; m.el.classList.add('no-blur');
    m.onClose(() => { Render.hold(false); hudFreeze = false; });
    const cells = m.el.querySelectorAll('.pull');
    const top = order[order.length - 1].rarity;
    let i = 0, timer = null, topFx = false;
    // 全畫面特效（閃光、波紋、光羽、震動）只為最高稀有度播一次；其他格只做格內光框
    const bigFx = r => {
      if (r.rarity === 'UR') { flash('#ffffff'); urRipple(); }
      if (r.rarity === 'LR') { sfx('reveal_LR'); flash('#fffbea'); lrFeathers(m.el.querySelector('.px-modal')); }
      if (r.rarity === 'SR') flash('#e6c8ff');
      if (r.rarity === 'SSR') { flash('#ffe27a'); m.el.querySelector('.px-modal').animate([{ transform: 'translate(-4px,0)' }, { transform: 'translate(4px,0)' }, { transform: 'none' }], { duration: 240, iterations: 2 }); }
    };
    const open = (k, quiet) => {
      const r = order[k], c = cells[k], v = resultView(r, 0);
      if (!quiet) sfx('reveal_' + r.rarity);
      c.classList.remove('waiting');
      c.classList.add(r.rarity); if (v.sold) c.classList.add('sold');
      c.innerHTML = `<span class="cvslot"></span>${rar(r.rarity)}<div>${esc(v.name)}</div>${v.sub ? `<div style="color:#ffd23f">${esc(v.sub)}</div>` : ''}${r.dup ? (r.gems ? `<div style="color:#ffd23f">滿星 → 寶石 ${r.gems}</div>` : `<div style="color:#ffd23f">升星 ${'★'.repeat(r.star)}</div>`) : r.stored ? '<div style="opacity:.7">→倉庫</div>' : ''}`;
      c.querySelector('.cvslot').replaceWith(spriteCanvas(r));
      if (!quiet && r.rarity === top && !topFx) { topFx = true; bigFx(r); }
    };
    const done = () => { m.el.querySelector('[data-skip]').hidden = true; m.el.querySelector('[data-close]').hidden = false; };
    const step = () => {
      if (i >= order.length) return done();
      const last = i === order.length - 1;
      open(i++);
      timer = setTimeout(step, last ? 0 : (order[i] && RAR_ORDER[order[i].rarity] >= 2 ? 650 : 260));
    };
    sfx('eggShake');
    timer = setTimeout(step, 700);
    m.el.querySelector('[data-skip]').addEventListener('click', () => {
      clearTimeout(timer);
      while (i < order.length) open(i++, true);
      if (!topFx) { topFx = true; sfx('reveal_' + top); bigFx(order[order.length - 1]); }
      done();
    });
  }

  // 百連：約 2 秒的整合演出（光色依最高稀有度，可跳過）→ 依稀有度分組、同種合併的彙總頁
  function showBulk(results, opts = {}) {
    const rank = r => RAR_ORDER[r] ?? 0;
    const top = results.reduce((a, r) => rank(r.rarity) > rank(a) ? r.rarity : a, 'N');
    const glowCol = { N: '#ffffff', R: '#4fa8ff', SR: '#b06cff', SSR: '#ffd23f', UR: '#ffffff', LR: '#fff4d0' }[top];
    const capsule = ICON(opts.oracle ? 'capsule_oracle' : opts.premium ? 'capsule_star' : 'capsule', 10);
    const m = modal(`<div class="reveal bulk ${opts.oracle ? 'oracle' : opts.premium ? 'premium' : ''}">
        <div class="rays on ${top === 'UR' ? 'ur' : top === 'LR' ? 'lr' : ''}" style="--glow:${glowCol}"></div>
        <img class="egg bulk-egg" src="${capsule}" alt="" style="--glow:${glowCol}">
        <div class="bulk-count"><b data-n>0</b> / ${results.length}</div></div>
      <div class="acts" style="justify-content:center"><button class="px-btn" data-skip>跳過</button></div>`, { dismiss: false, cls: 'gacha-modal' });
    Render.hold(true); hudFreeze = true; m.el.classList.add('no-blur');
    m.onClose(() => { Render.hold(false); hudFreeze = false; });
    const nEl = m.el.querySelector('[data-n]');
    const t0 = performance.now(), DUR = 2000;
    let done = false, raf = 0;
    sfx('eggShake');
    const tick = now => {
      if (done) return;
      const p = Math.min(1, (now - t0) / DUR);
      nEl.textContent = Math.floor(p * p * results.length);
      if (p >= 1) return finish();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const finish = () => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      sfx('reveal_' + top);
      if (top === 'UR') urRipple(); else if (top === 'LR') flash('#fffbea'); else if (rank(top) >= 2) flash(top === 'SSR' ? '#ffe27a' : '#e6c8ff');
      m.el.querySelector('.px-modal').innerHTML = bulkSummary(results, opts) +
        `<div class="acts" style="justify-content:center"><button class="px-btn" data-again>再抽 ×100</button><button class="px-btn primary" data-close>收下</button></div>`;
      m.el.querySelector('[data-close]').addEventListener('click', m.close);
      m.el.querySelector('[data-again]').addEventListener('click', () => { m.close(); opts.again && opts.again(); });
      m.el.querySelectorAll('.cvslot[data-type]').forEach(sl => sl.replaceWith(spriteCanvas({ typeId: sl.dataset.type || null })));
    };
    m.el.querySelector('[data-skip]').addEventListener('click', finish);
  }
  function bulkSummary(results, opts) {
    const order = ['LR', 'UR', 'SSR', 'SR', 'R', 'N'];
    const prev = opts.prevCodex || {};
    const counts = {}, groups = {};
    let gold = 0, gems = 0;
    for (const r of results) {
      counts[r.rarity] = (counts[r.rarity] || 0) + 1;
      const key = r.typeId || '__bag';
      const g = (groups[r.rarity] = groups[r.rarity] || {});
      const e = g[key] = g[key] || { typeId: r.typeId, n: 0, stars: 0, sold: 0, soldGold: 0, gems: 0, gold: 0, isNew: false };
      e.n++;
      if (r.typeId && !prev[r.typeId]) e.isNew = true;
      if (r.dup && r.star) e.stars++;
      if (r.gems) { e.gems += r.gems; gems += r.gems; }
      if (r.sold) { e.sold++; e.soldGold += r.gold || 0; gold += r.gold || 0; }
      else if (!r.typeId) { e.gold += r.gold || 0; gold += r.gold || 0; }
    }
    const head = order.filter(r => counts[r]).map(r => `${rar(r)} ×${counts[r]}`).join('　');
    const body = order.filter(r => groups[r]).map(r => {
      const rows = Object.values(groups[r]).sort((a, b) => b.n - a.n).map(e => {
        const name = e.typeId ? T(e.typeId).name : '金幣袋';
        const tags = [
          e.isNew ? '<span class="px-badge hot">NEW</span>' : '',
          e.stars ? `<span class="tag-star">★升星 ×${e.stars}</span>` : '',
          e.gems ? `<span class="tag-gem">滿星 ${gemI}+${e.gems}</span>` : '',
          e.sold ? `<span class="tag-sold">已自動售出 ×${e.sold}（+${fmt(e.soldGold)}）</span>` : '',
          e.gold ? `<span class="tag-gold">${coinI}+${fmt(e.gold)}</span>` : '',
        ].join('');
        return `<div class="bulk-row"><span class="cvslot" data-type="${e.typeId || ''}"></span><b>${esc(name)}</b><span class="bulk-n">×${e.n}</span>${tags}</div>`;
      }).join('');
      return `<div class="bulk-group ${r}"><h4>${rar(r)} <span class="dim">${counts[r]} 隻</span></h4>${rows}</div>`;
    }).join('');
    return `<h3>百連結果</h3><div class="bulk-head">${head}</div>
      ${gold || gems ? `<div class="bulk-totals">${gold ? `${coinI}+${fmt(gold)}` : ''}　${gems ? `${gemI}+${fmt(gems)}` : ''}</div>` : ''}
      <div class="bulk-body">${body}</div>`;
  }

  function fakeAd(done) {
    let left = 5;
    const m = modal(`<h3>模擬廣告</h3><div class="ad-box"><div>這裡是一則模擬廣告<br><b data-c>${left}</b></div></div>
      <p class="note">此為模擬，不會載入任何真實廣告。</p>`, { dismiss: false });
    const iv = setInterval(() => {
      left--; const c = m.el.querySelector('[data-c]'); if (c) c.textContent = left;
      if (left <= 0) { clearInterval(iv); m.close(); done(); }
    }, 1000);
  }
  function adBoost() {
    if (Game.shop.adBoostsLeft() <= 0) return toast('今天的廣告次數用完了');
    fakeAd(() => { const r = Game.shop.boost(true); if (!r.ok) toast(r.msg); });
  }

  // ---------- 按住連續升級：350ms 後開始，間隔 120ms → 40ms；放開、移出或失敗就停 ----------
  const HOLD_ACTS = { lv: arg => Game.actions.levelUp(+arg), up: arg => Game.actions.buyUpgrade(arg), dustup: arg => Game.actions.buyDustUpgrade(arg) };
  let hold = null, suppressClick = false;
  function stopHold() {
    if (!hold) return;
    clearTimeout(hold.timer); hold = null;
  }
  function holdStep() {
    if (!hold) return;
    const ok = Game.batch ? Game.batch(() => HOLD_ACTS[hold.act](hold.arg)) : HOLD_ACTS[hold.act](hold.arg);
    if (!ok) return stopHold();
    hold.n++;
    const delay = Math.max(40, 120 - hold.n * 8);
    hold.timer = setTimeout(holdStep, delay);
  }
  function onHoldDown(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || !HOLD_ACTS[b.dataset.act] || e.button > 0) return;
    stopHold();
    const h = hold = { act: b.dataset.act, arg: b.dataset.arg, n: 0, timer: 0 };
    h.timer = setTimeout(() => { if (hold !== h) return; suppressClick = true; HOLD_ACTS[h.act](h.arg); holdStep(); }, 350);
  }
  function onHoldMove(e) {
    if (!hold) return;
    // 面板會在升級後重繪，按鈕元素可能被換掉：用 act/arg 判斷手指是否還在同一顆按鈕上
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const b = el && el.closest && el.closest('[data-act]');
    if (!b || b.dataset.act !== hold.act || b.dataset.arg !== hold.arg) stopHold();
  }

  function onPanelClick(e) {
    if (suppressClick) { suppressClick = false; return; } // 連續升級後放開時的那一下 click 不再多升一次
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const arg = b.dataset.arg;
    switch (b.dataset.act) {
      case 'buy': Game.actions.buySlime(arg); break;
      case 'merge': Game.actions.merge(arg); break;
      case 'lv': Game.actions.levelUp(+arg); break;
      case 'store': Game.actions.toStorage(+arg); break;
      case 'unstore': Game.actions.fromStorage(+arg); break;
      case 'up': Game.actions.buyUpgrade(arg); break;
      case 'lvmax': Game.actions.levelUpMax(+arg); break;
      case 'autoSell': Game.gacha.setAutoSell(arg); renderPanel(true); break;
      case 'sell': {
        // 扭蛋角色或 Lv25 以上：按兩次才賣（第二次顯示「確定賣出？」，3 秒後恢復）
        if (b.dataset.confirm && !b.dataset.armed) {
          b.dataset.armed = '1'; const old = b.innerHTML; b.textContent = '確定賣出？'; b.classList.add('armed');
          setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.innerHTML = old; b.classList.remove('armed'); } }, 3000);
          return;
        }
        const r = Game.actions.sell(+arg); if (r) flyTo(b, r.gems ? 'gem' : 'coin', 5, r.gems ? '#hudGemIco' : '#hudGoldIco');
        break;
      }
      case 'sellJunk': {
        const ids = Game.state.storage.filter(x => x.type === 'purple' && x.level === 10 && !x.gacha && !x.star).map(x => x.uid);
        const r = Game.actions.sellMany(ids); if (r && r.count) flyTo(b, 'coin', 8, '#hudGoldIco');
        break;
      }
      case 'upmax': Game.actions.buyUpgradeMax(arg); break;
      case 'pull': pull(+arg); break;
      case 'gtab': gachaTab = arg; renderPanel(true); break;
      case 'ppull': pullPremium(arg === 'ticket' ? 1 : +arg, arg === 'ticket'); break;
      case 'opull': pullOracle(arg === 'ticket' ? 1 : +arg, arg === 'ticket'); break;
      case 'free': pull(1, true); break;
      case 'buyp': buyProduct(arg, b); break;
      case 'claim': { const r = Game.shop.claimMonthCardDaily(); if (r.ok) flyTo(b, 'gem', 6, '#hudGemIco'); break; }
      case 'boostGem':
        if (Game.state.gems < Game.shop.boostGemCost) noGems(Game.shop.boostGemCost);
        else { const r = Game.shop.boost(false); if (!r.ok) toast(r.msg); }
        break;
      case 'boostAd': adBoost(); break;
      case 'login': { const r = Game.daily.claimLogin(); if (r.ok) flyTo(b, 'gem', 6, '#hudGemIco'); break; }
      case 'task': { const r = Game.daily.claimTask(arg); if (r.ok) flyTo(b, 'gem', 4, '#hudGemIco'); else toast(r.msg); break; }
      case 'prestige': doPrestige(); break;
      case 'dustup': Game.actions.buyDustUpgrade(arg); break;
      case 'unlockZone': { const r = Game.actions.unlockZone(arg); if (r && r.ok === false && r.msg) toast(r.msg); else window.scrollTo({ top: 0, behavior: 'smooth' }); break; }
      case 'goZone': Game.actions.setZone(arg); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'slot': pickSlot(+arg); break;
      case 'autoteam': Game.dungeon.autoTeam(); toast('已依目前敵人自動編隊'); break;
      case 'autoToggle': Game.dungeon.setAuto({ on: !Game.dungeon.auto().on }); break;
      case 'autoRelic': Game.dungeon.setAuto({ relic: Game.dungeon.auto().relic === 'smart' ? 'ask' : 'smart' }); break;
      case 'autoTeamOpt': Game.dungeon.setAuto({ autoTeam: !Game.dungeon.auto().autoTeam }); break;
      case 'fight': doFight(); break;
      case 'quick': doQuickPush(); break;
      case 'relic': enqueue(showRelic); break;
      case 'mute': Game.audio.setMuted(!Game.audio.muted()); syncMute(); renderPanel(true); break;
      case 'artStyle': Game.setArtStyle(arg); renderPanel(true); break;
      case 'quality': if (Game.setQuality) Game.setQuality(arg); else Render.setQuality(arg); renderPanel(true); break;
      case 'music': Game.audio.setMusicOn(!Game.audio.musicOn()); renderPanel(true); break;
      case 'export': $('#panel [data-save-out]').value = Game.exportSave(); break;
      case 'copySave': {
        const ta = $('#panel [data-save-out]');
        if (!ta.value) ta.value = Game.exportSave();
        ta.select();
        const ok = () => toast('已複製存檔碼');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok, () => { document.execCommand('copy'); ok(); });
        else { document.execCommand('copy'); ok(); }
        break;
      }
      case 'import': {
        const code = $('#panel [data-save-in]').value.trim();
        if (!code) { toast('請先貼上存檔碼'); break; }
        confirmModal('匯入存檔', '<p>匯入會<b>覆蓋目前的所有進度</b>，確定要繼續嗎？</p><p class="note">建議先匯出目前的存檔碼備份。</p>', '確定匯入', () => {
          const r = Game.importSave(code);
          if (!r.ok) return toast(r.msg || '存檔碼無效');
          shownGold = Game.state.gold; shownGems = Game.state.gems;
          toast(r.msg || '匯入成功'); renderPanel(true);
        }, 'danger');
        break;
      }
      case 'save': Game.save(); toast('已存檔'); break;
      case 'reset': resetModal(); break;
    }
    renderPanel();
  }

  // ---------- 離線收益／推薦禮包 ----------
  let offlineOpen = null;
  function showOffline(d) {
    if (!d) return;
    if (offlineOpen) { offlineOpen.close(); offlineOpen = null; }
    const cost = Game.config.offlineGemCost, card = Game.shop.monthCardActive(), cap = Game.offlineCapHours();
    const m = offlineOpen = modal(`<div style="text-align:center"><img src="${ICON('capsule', 8)}" alt="" style="image-rendering:pixelated;animation:wob 1s steps(4) infinite">
      <h3>歡迎回來！</h3><p>你離開了 ${fmtDur(d.seconds)}，史萊姆們幫你賺了</p>
      <p style="font-size:1.6em">${coinI} <b>${fmt(d.gold)}</b></p>
      <p class="note">離線收益上限 ${cap} 小時${card ? '（含月卡加成）' : '，月卡可再延長'}</p></div>
      <div class="acts" style="justify-content:center">
        <button class="px-btn" data-m="1">領取</button>
        <button class="px-btn blue" data-m="2">看廣告 ×2</button>
        <button class="px-btn gold" data-m="3">${gemI}${cost} ×3</button></div>`, { dismiss: false });
    m.el.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
      const mult = +b.dataset.m;
      const claim = () => {
        // 收益已不存在（例如其他分頁已領走）時直接關閉，避免視窗卡住
        if (!Game.state.pendingOffline) { m.close(); offlineOpen = null; return toast('離線收益已經領取過了'); }
        const r = Game.actions.claimOffline(mult);
        if (!r.ok) return;
        sfx('rest');
        m.close(); offlineOpen = null;
        flyTo(b, 'coin', 10, '#hudGoldIco');
      };
      if (mult === 3 && Game.state.gems < cost) return noGemsModal(cost); // 疊在離線視窗上，不能排隊
      if (mult === 2) fakeAd(claim); else claim();
    }));
    return m;
  }
  function showLogin() {
    const D = Game.daily, idx = D.loginDayIndex();
    if (!D.canClaimLogin()) return null;
    const m = modal(`<h3>每日登入 · 第 ${idx + 1} 天</h3><div class="days">${D.loginRewards.map((g, i) =>
      `<div class="card day ${i === idx ? 'today' : ''} ${i < idx ? 'got' : ''}"><div class="name">${i + 1}</div><div>${gemI}${g}</div></div>`).join('')}</div>
      <p class="note">連續登入 7 天，第 7 天送 ${D.loginRewards[6]} 寶石。</p>
      <div class="acts" style="justify-content:center"><button class="px-btn gold" data-ok>領取 ${gemI}${D.loginRewards[idx]}</button></div>`, { cls: 'wide' });
    m.el.querySelector('[data-ok]').addEventListener('click', e => { const b = e.currentTarget; const r = D.claimLogin(); if (r.ok) flyTo(b, 'gem', 6, '#hudGemIco'); m.close(); });
    return m;
  }
  const OFFER_TEXT = { firstMerge: '恭喜第一次進化！給你一份特別優惠', ranchFull: '牧場滿了？這份禮包幫你加速成長', noGems: '寶石不夠嗎？這份禮包最划算' };
  function showOffer(d) {
    const p = d && Game.shop.products.find(x => x.id === d.productId);
    if (!p || !Game.shop.available(p.id)) return;
    const m = modal(`<h3>限時推薦</h3><p>${esc(OFFER_TEXT[d.reason] || '限時優惠')}</p>
      <div class="card starter-card"><div class="row">${p.kind === 'starter' ? thumb('gold') : `<span class="thumb"><img src="${ICON('gem', 5)}" alt=""></span>`}
      <div><div class="name">${esc(p.name)}</div><div class="meta">${esc(p.desc)}</div>
      ${p.kind === 'starter' ? `<div class="meta hot-text">剩 ${fmtDur(Game.shop.starterSecondsLeft())}</div>` : ''}</div></div></div>
      <div class="acts"><button class="px-btn" data-close>下次再說</button><button class="px-btn primary" data-buy>NT$${p.priceTWD}</button></div>`);
    m.el.querySelector('[data-buy]').addEventListener('click', e => { const t = e.currentTarget; m.close(); buyProduct(p.id, t); });
    return m;
  }

  // 重置：遊戲內彈窗＋按兩次才執行（第一次按下後 3 秒內再按一次）
  function resetModal() {
    const m = modal(`<h3 style="color:#a3201a">⚠ 重置進度</h3>
      <div class="danger-box">所有進度（含寶石、星塵、遠征、圖鑑與成就）都會消失，<b>無法復原</b>。</div>
      <p class="note">建議先到上方「存檔轉移」匯出存檔碼備份。模擬儲值紀錄也會一併清除。</p>
      <div class="acts"><button class="px-btn" data-close>取消</button><button class="px-btn" data-backup>先匯出備份</button><button class="px-btn danger" data-ok>重置進度</button></div>`);
    const ok = m.el.querySelector('[data-ok]');
    let armed = false, timer = null;
    ok.addEventListener('click', () => {
      if (!armed) {
        armed = true; ok.textContent = '再按一次確認'; ok.classList.add('armed');
        timer = setTimeout(() => { armed = false; ok.textContent = '重置進度'; ok.classList.remove('armed'); }, 3000);
        return;
      }
      clearTimeout(timer); m.close();
      Game.reset(); shownGold = 0; shownGems = Game.state.gems; toast('已重置'); renderPanel(true);
    });
    m.el.querySelector('[data-backup]').addEventListener('click', () => {
      m.close(); setTab('settings');
      const out = $('#panel [data-save-out]'); if (out) { out.value = Game.exportSave(); out.scrollIntoView({ block: 'center' }); out.select(); }
    });
  }
  // 多分頁：這個分頁被暫停時用全畫面遮罩擋住所有操作
  function showConflict() {
    if ($('#tabLock')) return;
    const d = document.createElement('div');
    d.id = 'tabLock';
    d.innerHTML = `<div class="px-panel px-modal" style="text-align:center"><h3>遊戲已在其他分頁開啟</h3>
      <p>為了避免進度互相覆蓋，這個分頁已暫停。</p>
      <div class="acts" style="justify-content:center"><button class="px-btn primary" data-take>在這裡繼續</button></div></div>`;
    document.body.appendChild(d);
    d.querySelector('[data-take]').addEventListener('click', () => { if (!Game.takeOver()) toast('無法接管，請重新整理頁面'); });
  }
  function onResume() {
    const lock = $('#tabLock'); if (lock) lock.remove();
    // state 已換成新物件：關掉所有舊彈窗、清空佇列，整個重繪
    $('#modalRoot').innerHTML = ''; popQueue.length = 0; popBusy = false; offlineOpen = null;
    shownGold = Game.state.gold; shownGems = Game.state.gems;
    lastSig = ''; renderPanel(true); hudSlow();
  }
  // 新手任務橫幅
  let questSig = '';
  function renderQuest() {
    const bar = $('#questBar'); if (!bar || !Game.quests) return;
    const q = Game.quests.current();
    if (!q) { bar.hidden = true; return; }
    const sig = [q.index, q.cur, q.done].join('|');
    if (sig === questSig && !bar.hidden) return;
    const slide = questSig && questSig.split('|')[0] !== String(q.index);
    questSig = sig; bar.hidden = false;
    bar.classList.toggle('ready', q.done);
    bar.innerHTML = `<span class="q-ico">${modernUI() ? `<img class="ico" src="${ICON('scroll')}" alt="">` : '📜'}</span><span class="q-step">${q.index + 1}/${q.total}</span>
      <div class="q-main"><div class="q-text">${esc(q.text)}</div><div class="vipbar"><i style="width:${Math.min(100, q.cur / q.need * 100)}%"></i></div></div>
      <span class="q-num">${fmt(q.cur)}/${fmt(q.need)}</span><span class="q-gem">${gemI}${q.gems}</span>
      ${q.done ? '<button class="px-btn gold small" data-qclaim>領取</button>' : ''}`;
    if (slide) bar.animate([{ transform: 'translateX(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'ease-out' });
  }
  function syncMute() {
    const b = $('#hudMute'); if (!b || !Game.audio) return;
    b.textContent = Game.audio.muted() ? '🔇' : '🔊';
    b.classList.toggle('off', Game.audio.muted());
  }

  // ---------- 標題畫面 ----------
  function showTitle() {
    document.body.classList.add('title-mode');
    const ov = document.createElement('div');
    ov.className = 'title-ui'; ov.tabIndex = 0;
    ov.setAttribute('role', 'button'); ov.setAttribute('aria-label', '點擊開始遊戲');
    ov.innerHTML = `<div class="title-inner"><h1>像素史萊姆牧場</h1><div class="title-sub">Pixel Slime Ranch</div>
      <div class="title-start">— 點擊開始 —</div></div><div class="title-foot">所有課金內容皆為模擬，不會實際扣款</div>`;
    $('#stageWrap').appendChild(ov);
    Render.startTitle(); Render.resize();
    if (Game.audio && Game.audio.setTitle) Game.audio.setTitle(true);
    let started = false;
    const start = () => {
      if (started) return; started = true;
      // 這一下點擊也是瀏覽器允許播放音訊的使用者互動
      if (Game.audio && Game.audio.setTitle) Game.audio.setTitle(true);
      ov.classList.add('leaving');
      Render.endTitle(() => {
        ov.remove();
        document.body.classList.remove('title-mode');
        Render.resize();
        if (Game.audio && Game.audio.setTitle) Game.audio.setTitle(false);
        nextPop();
      });
    };
    ov.addEventListener('click', start);
    ov.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } });
    ov.focus();
  }

  // 現代 RPG 介面主題：只有在現代畫面真的能用（WebGL）時才套用，經典像素維持原樣
  function applyStyle() {
    const on = !!(Render.modernUI && Render.modernUI());
    document.body.classList.toggle('style-modern', on);
    document.body.classList.toggle('style-pixel', !on);
    document.querySelectorAll('img[data-icon]').forEach(i => { i.src = ICON(i.dataset.icon); });
  }

  // ---------- 啟動 ----------
  function boot() {
    if (!window.Game || !Game.start || !Game.shop || !Game.dungeon || !window.Sprites || !window.Render || !window.Monsters || !window.Battle) {
      $('#panel').innerHTML = '<div class="empty">載入失敗：缺少必要的 js 檔案</div>';
      return;
    }
    document.querySelectorAll('img[data-icon]').forEach(i => { i.src = ICON(i.dataset.icon); });
    $('#hudGems').previousElementSibling.id = 'hudGemIco';
    $('#hudGold').previousElementSibling.id = 'hudGoldIco';
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#panel').addEventListener('click', onPanelClick);
    $('#panel').addEventListener('pointerdown', onHoldDown);
    window.addEventListener('pointermove', onHoldMove);
    for (const ev of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(ev, () => { stopHold(); setTimeout(() => { suppressClick = false; }, 0); });
    $('#panel').addEventListener('contextmenu', e => { if (e.target.closest('[data-act="lv"],[data-act="up"],[data-act="dustup"]')) e.preventDefault(); });
    Game.on('toast', msg => toast(msg));
    Game.on('settings', e => { if (e && e.artStyle) { applyStyle(); renderPanel(true); renderQuest(); } });
    Game.on('tabConflict', showConflict);
    Game.on('dungeonAuto', d => {
      if (!d) return;
      if (d.result) onAutoResult(d.result);
      if (d.status === 'relic' && Game.dungeon.pendingRelic()) enqueue(showRelic);
      if (tab === 'dungeon' && !battling) renderPanel();
    });
    Game.on('questReady', () => { renderQuest(); sfx('reveal_R'); });
    Game.on('questClaim', d => { renderQuest(); if (d && d.quest && d.quest.index === 0 && loginDeferred) { loginDeferred = false; enqueue(showLogin); } });
    $('#questBar').addEventListener('click', e => {
      if (!e.target.closest('[data-qclaim]')) return;
      const b = e.target.closest('[data-qclaim]');
      flyTo(b, 'gem', 6, '#hudGemIco');
      Game.quests.claim(); renderQuest();
    });
    Game.on('tabResume', onResume);
    Game.on('achievement', a => {
      const d = document.createElement('div');
      d.className = 'ach-pop'; d.innerHTML = `<span>★ 成就達成</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>`;
      document.body.appendChild(d);
      d.animate([{ transform: 'translate(-50%,-120%)' }, { transform: 'translate(-50%,0)', offset: 0.12 }, { transform: 'translate(-50%,0)', offset: 0.85 }, { transform: 'translate(-50%,-120%)' }], { duration: 3200 }).onfinish = () => d.remove();
    });
    Game.on('offline', d => enqueue(() => Game.state.pendingOffline ? showOffline(d) : null));
    Game.on('offer', d => enqueue(() => showOffer(d)));
    Game.on('freePull', () => enqueue(() => {
      if (!Game.gacha.freePullAvailable()) return null;
      const m = modal(`<div style="text-align:center"><img src="${ICON('capsule', 10)}" alt="" style="image-rendering:pixelated;animation:wob .6s steps(4) infinite;filter:drop-shadow(0 0 8px #b06cff)">
        <h3>🎁 免費 SR 抽！</h3><p>你已經累積 ${fmt(Game.gacha.freePullGold)} 金幣，送你一次免費扭蛋，<b>必出 SR</b>！</p></div>
        <div class="acts" style="justify-content:center"><button class="px-btn" data-close>等等再抽</button><button class="px-btn gold" data-go>立刻抽！</button></div>`, { cls: 'wide' });
      m.el.querySelector('[data-go]').addEventListener('click', () => { m.close(); setTab('gacha'); pull(1, true); });
      return m;
    }));
    let pending = false;
    Game.on('change', () => {
      if (pending) return; pending = true;
      requestAnimationFrame(() => { pending = false; renderPanel(); });
    });
    $('#prestigeBadge').addEventListener('click', () => { setTab('upgrade'); doPrestige(); });
    if (Game.audio) {
      $('#hudMute').addEventListener('click', () => { Game.audio.setMuted(!Game.audio.muted()); syncMute(); if (tab === 'settings') renderPanel(true); });
      $('#panel').addEventListener('input', e => {
        if (e.target.matches('[data-vol]')) Game.audio.setVolume(+e.target.value / 100);
        if (e.target.matches('[data-mvol]') && Game.audio.setMusicVolume) Game.audio.setMusicVolume(+e.target.value / 100);
      });
      $('#panel').addEventListener('change', e => { if (e.target.matches('[data-vol]')) sfx('eggShake'); });
      syncMute();
    } else $('#hudMute').hidden = true;
    document.addEventListener('visibilitychange', () => Game.setVisible(!document.hidden));
    Render.init();
    applyStyle();
    Game.start();
    showTitle();
    dungeonWasUnlocked = Game.dungeon.unlocked();
    if (Game.isPaused && Game.isPaused()) showConflict();
    if (Game.dungeon.pendingRelic()) enqueue(showRelic);
    // 新玩家：第一天的登入彈窗延到完成第 1 項任務（點擊）之後，先讓玩家看到牧場
    const q0 = Game.quests && Game.quests.current();
    if (Game.daily.canClaimLogin()) { if (q0 && q0.index === 0) loginDeferred = true; else enqueue(showLogin); }
    renderQuest();
    shownGold = Game.state.gold; shownGems = Game.state.gems;
    setTab(tab);
    hudSlow(); setInterval(hudSlow, 500);
    setInterval(() => renderPanel(), 1000);
    requestAnimationFrame(hudLoop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
