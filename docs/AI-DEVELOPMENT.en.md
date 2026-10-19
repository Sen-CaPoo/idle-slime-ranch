# How the AI Built It: Three AI Agents Collaborating on One Game

[正體中文](AI-DEVELOPMENT.md) · [Back to README](../README.en.md)

This document records how *Pixel Slime Ranch* went from its first line of code to v2.0. The point is not "AI is amazing" but **which practices actually worked, where the AI made mistakes, and where a human should step in**. All numbers come from simulations and measurements taken at the time; the raw log is in [`COLLAB.html`](../COLLAB.html) (Traditional Chinese).

---

## Contents

1. [Team and roles](#team-and-roles)
2. [What the human director asked for](#what-the-human-director-asked-for)
3. [Collaboration: contract, ownership, messages](#collaboration-contract-ownership-messages)
4. [Timeline](#timeline)
5. [The turning point: proving it was not fun](#the-turning-point-proving-it-was-not-fun)
6. [Mistakes and peer corrections](#mistakes-and-peer-corrections)
7. [Measurable acceptance](#measurable-acceptance)
8. [Ethics and monetization](#ethics-and-monetization)
9. [What we learned](#what-we-learned)

---

## Team and roles

| Role | Session | Owned files | Responsibilities |
|---|---|---|---|
| Human director | — | — | Sets goals and direction, makes final value calls (license, monetization strength) |
| Engine engineer | `ccline-0b` | `engine.js`, `shop.js`, `hd2d.js`, `scenes-modern.js` | Game state, numbers, saving, gacha, light compositor, modern backgrounds |
| Art & UI engineer | `ccline-27` | `sprites*.js`, `monsters.js`, `icons-modern.js`, `render.js`, `battle.js`, `ui.js`, `style.css`, `index.html` | All characters, scenes, animation, and interface |
| Product owner & QA | `ccline-a3` | `dungeon.js`, `quests.js`, `audio*.js`, `tools/sim.js`, design docs | Monetization and fun design, balance simulation, music, playtesting |

All three are Claude Code sessions on the same machine, talking through cross-session messages. Only 0b and 27 existed at first; a3 joined later as a "monetization and visuals advisor". When the human left for an international conference, product decisions were handed to a3.

## What the human director asked for

Across the whole project the human gave roughly 15 high-level instructions. In order:

1. Make a **pixel-art, monetized, idle-raising** game that looks good, feels lavish, makes people want to spend, and stays fun.
2. Keep monetization moderate; **above all, real people must have reasons and goals to keep playing** — not just a plan that goes smoothly while nobody wants to play.
3. Feel free to study and combine rules from existing idle games.
4. "I'm off to a conference, you're in charge": combat and dungeons are fine, and so is higher visual quality.
5. Build it at **AAA quality**, with pixel art inspired by *Octopath Traveler* (HD-2D).
6. Improve controls: hold to level fast, one-tap max, selling from storage, gacha auto-sell, expedition auto-push.
7. Add a premium gacha and higher-tier slimes (v1.8); then another gacha tier and quick-push (v1.9).
8. Support a 29,900-gem pack and 100-pulls, and fix stutter on Oracle 10-pulls (v1.10).
9. A **major visual and audio overhaul** to a modern Japanese-RPG style (v2.0).
10. Push to a private GitHub repo and publish Pages.

> **Observation:** almost every instruction was a *goal*, not a *method*. Item 2 is the most important sentence in the project — it turned the AI's focus from "finish the features" to "prove it's actually fun".

## Collaboration: contract, ownership, messages

### 1. Shared memory: `COLLAB.html`

Every session reads and writes one HTML file with a fixed structure:

- **Task and assumptions** — e.g. "purchases are simulated; no real payment".
- **Files and ownership table** — each file has exactly one owner.
- **Interface contract** — every function signature and event name on `window.Game`, versioned (v1 → v1.1 → … → v2.0).
- **Per-person progress logs** — each person edits only their own section.

There is one rule: **to change the contract, message the other side and get agreement first.**

### 2. Single ownership

The engine never draws; the renderer never changes numbers. When 27 wanted "hold to level up fast", the engine only needed to provide `Game.batch(fn)` so many state changes collapse into one redraw; the rest lived in the UI.

When one side needs another's feature, it asks for a "hook". The expedition system lives entirely in a3's `dungeon.js`; 0b only had to add three lines to the engine:

```js
if (Game.dungeon) m *= Game.dungeon.mult();               // output multiplier
+ (Game.dungeon ? Game.dungeon.relicBonus('crit') : 0)    // crit rate
+ (Game.dungeon ? Game.dungeon.relicBonus('offline') : 0) // offline cap
```

### 3. Defensive cross-module calls

Every module checks that an API exists before calling it. For example, when `quests.js` grants a premium ticket:

```js
if (v.tickets && Game.gacha && Game.gacha.premium && Game.gacha.premium.addTickets)
  Game.gacha.premium.addTickets(v.tickets);
```

So a3 could build and test "bosses drop tickets" before 0b had finished the premium gacha, with nobody blocked.

### 4. QA is a separate role

Whoever builds something does not sign it off. a3 took headless-Chrome screenshots, ran simulations, measured FPS, and sent back **specific, reproducible** issues:

> 🔴 LR slimes become overexposed white blobs on the ranch: Eternal and Oracle are washed out by their own platinum point lights, light pillars and bloom… Please confirm with `HD2D.measure()` that pure-white pixels stay under 5% with three LRs on screen.

## Timeline

| Version | Contents | Key acceptance numbers |
|---|---|---|
| v1.0 | Core loop: buy slimes, level, merge, offline income, simulated purchases | — |
| v1.3 | Guaranteed first pull, tap crits | Simulation found: SSR via merging at 110 s; 0 purchases per session from day 3 |
| v1.4 | Merge gate, level milestones, prestige, Golden Visitor, **expedition dungeon** | First gold slime ≈35 min; first prestige on day 2; all 42 sessions ≥5 decisions |
| v1.5 | Codex, 52 achievements, 5 zones, stardust resonance | Zones unlock on D3/D6/D9.9/D23 |
| v1.6 | Save export/import, multi-tab guard, save versioning, quest line, sound | 77 tests; 60 fps from `file://` |
| AAA | WebGL2 HD-2D compositor, 7 depth layers, BREAK system, synthesized orchestral BGM, title screen | 0.04% pure-white pixels; 60 fps at CPU ×4 |
| v1.7 | Hold-to-level, MAX, selling, auto-sell, auto-push | 16/16 interaction tests |
| v1.8 | Premium gacha, 11 new slimes, UR rarity, **companion slots** | F2P restored to v1.7 pace |
| v1.9 | Oracle gacha, 9 new slimes, LR rarity, quick-push | Light spenders 27% faster (target 10–25%; judged as noise) |
| v1.10 | 29,900-gem pack, 100-pulls, reveal stutter fix | 10-pull 27.6 → 56.4 fps |
| v2.0 | Modern JRPG visual and audio overhaul; classic pixel kept | 0 exceptions in regression, 16/16 interactions, 10-pull 55 fps |

Details: [CHANGELOG](../CHANGELOG.en.md).

## The turning point: proving it was not fun

At v1.3 both engineers were making good progress and every feature was done. After the human's reminder ("not just a plan that goes smoothly"), a3 wrote `tools/sim.js`:

- It loads the real `engine.js` and `shop.js` and advances a fake clock.
- It simulates a greedy player who always picks the best-value option.
- Scenario: a casual player who logs in 3 times a day for 10 minutes, for 14 days.

The result was ugly:

```
D1 08:00  open   0  mid 1002  longest idle  221s  1 → 1.07M
D3 13:00  open   0  mid    0  longest idle  600s  3.84M → 3.84M
D5 08:00  open   0  mid    0  longest idle  600s  4.23M → 4.23M
...
D14 21:00 open   0  mid    0  longest idle  600s  4.55M → 4.55M
```

1,002 purchases in the first session; from day 3, whole 10-minute sessions with nothing to do; 2.36T gold hoarded with nothing to spend it on. A real player would likely quit on day 2 or 3.

From then on, **every balance decision needed simulation data**. The acceptance criteria became:

- At least 5 meaningful decisions per session.
- Longest idle gap under 90 seconds.
- A visible next goal on day 7 and day 14.
- Zone unlocks inside the designed windows (beach D3, volcano D6, snow D12, sky city D20–25).

### Multi-seed medians

At v1.9, 0b noticed that we had always calibrated with the same random seed, `12345`, which happened to be unusually lucky. With 5 seeds, the F2P median for the sky city was actually "not within 30 days". Since then every balance check uses the 5-seed median from `tools/sim-seeds.js`.

### Three player types

A monetized game can't be balanced on free players alone. `sim.js` supports three modes:

| Mode | Setup | Sky-city unlock at v1.10 (median) |
|---|---|---|
| F2P | 140 free gems per day | D22 |
| light | Monthly card + a NT$150 pack weekly (≈NT$800/month) | D16 (≈27% faster) |
| heavy | 3,000 gems per day (≈NT$45,000/month) | D10 |

The target is **light spenders 10–25% faster — noticeable, not crushing**. Heavy spenders being much faster was judged acceptable in a single-player game with no leaderboards, where nobody else is harmed.

## Mistakes and peer corrections

This is the most important section. Being an AI doesn't prevent mistakes, but multiple AIs reviewing each other catch many of them.

| Who erred | Mistake | Who caught it, and the fix |
|---|---|---|
| a3 | Proposed "first pull guarantees SR"; output jumped from 1/s to 151/s within 30 s, skipping the early game | a3's playtest → free SR pull only after accumulating gold |
| a3 | Proposed a starter pack labeled "Was NT$600 → −85%" | **27 refused**: that's a fake original price, misleading even in a simulation → rewritten with real selling points |
| a3 | Proposed that merging resets to Lv1 | **0b pointed out** three Lv10 meadow slimes (60/s) would become one 8/s water slime — merging would *lower* output → inherit the lowest level + merge fee |
| a3 | Prestige threshold of 1e7 | **0b pointed out** the first prestige would give ×17 output and break the curve → raised to 1e11 |
| a3 | Depth-of-field formula had the depth direction reversed | **0b noticed** and implemented it with the correct depth definition |
| 0b + 27 | Premium tickets gave F2P players so many gacha slimes that they filled the main ranch, and F2P progress went backwards | a3's simulation → new "companion slots" |
| 0b | Oracle tickets at floor 50 made light spenders 50% faster | 0b confirmed the cause with `NO_ORACLE=1` → a3 moved the first ticket to floor 100 |
| 0b | VIP5 threshold was NT$10,000 while the big pack cost NT$9,990 (NT$10 short) | **0b caught it and asked** → a3 ruled it an upsell nudge and set the threshold to 9,990 |
| 27 | The normal gacha's public rate table listed Oracle-only slimes | a3 caught it in review; 3,000 simulated pulls confirmed the engine was correct and only the UI was wrong → top priority fix |
| 27 | First HD-2D pass had soft-focus characters and blown-out bright scenes | a3 rejected it with measurable criteria → passed on the second round |
| a3 | Acceptance script used fixed 3-second waits (flaky on cold start) and a fixed port that collided with others | 0b and 27 reported it → polling waits, random ports |
| a3 | Audio checked `Game.settings.artStyle`, a field that doesn't exist, so switching to classic pixel didn't switch the sound set | Found while writing this document → now uses `Game.artStyle()` |

> **Lesson:** keep the builder and the reviewer separate, and encourage saying "your suggestion is wrong" directly. Half of the fixes above came from peers.

## Measurable acceptance

"Looks fine" can't be handed off or re-verified. The criteria we used:

| Item | Criterion | Tool |
|---|---|---|
| Overexposure | Pure-white (>0.97) pixels < 5% | `HD2D.measure()` |
| Sprite sharpness | Layers in the focus band get no blur and NEAREST sampling | Zoomed screenshots |
| Smoothness | ≥ 50 fps average, p95 ≤ 33 ms at 4× CPU throttling | `tools/perf-gacha.js`, `tools/regress-browser.js` |
| Interaction | All 16 real-mouse interactions pass | `tools/accept-ux.js` |
| Fun | ≥ 5 decisions per session, idle < 90 s, a goal on D14 | `tools/sim.js` |
| Balance | F2P no slower (±2 days), light 10–25% faster | `tools/sim-seeds.js` |
| Compatibility | Playable via double-click `file://`; old saves load | `tools/regress-browser.js` |

## Ethics and monetization

The human asked both to "make people want to spend" and to "keep monetization moderate". We turned that into explicit rules:

- ✅ Rates shown publicly, with pity and a visible pity counter.
- ✅ Gacha slimes survive prestige — paid assets never disappear.
- ✅ F2P players have steady sources of gems and tickets (daily tasks, expedition bosses).
- ❌ No fake original prices.
- ❌ No stamina gates to force spending.
- ❌ No "just NT$10 away from the next tier" thresholds.
- ❌ No fake "last chance" countdowns in the UI.

For the v2.0 modern-JRPG overhaul we also set IP rules: take only genre conventions, copy no work's characters, monsters, UI, or melodies; keep our own slime design; make gacha capsules upright eggs to avoid resembling a famous franchise's ball.

## What we learned

1. **One human sentence about a goal beats ten about methods.** "Not just a smooth plan nobody wants to play" redirected the whole project.
2. **Turn "fun" into numbers.** Decisions, idle seconds, and milestone timing can all be simulated and regression-tested.
3. **Always use several random seeds.** A single seed lies.
4. **Contract first, single ownership.** Three AIs developed in parallel for a whole day with almost no file conflicts.
5. **Acceptance needs screenshots and numbers.** "LR is overexposed" is weaker than "23% pure-white pixels, target < 5%".
6. **Encourage AIs to say no to each other.** The best fixes often came from a peer's objection.
7. **AI can't listen to music.** The score was only verified as "correct code, no clipping"; whether it sounds good still needs human ears (listening tool: `tools/render-music.js`).

---

Want to use this method on your own project? See the [Playbook](PLAYBOOK.en.md).
