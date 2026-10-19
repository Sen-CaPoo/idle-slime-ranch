# Changelog

[正體中文](CHANGELOG.md) · [Back to README](README.en.md)

Every version was completed on 2026-10-19. Full discussion and data for each version are in [`COLLAB.html`](COLLAB.html) (Traditional Chinese).

## v2.1 — Desktop layout

- Wide landscape screens (≥1200×640) now use two columns: the ranch view (scaled to the window height at 16:9) and quest bar on the left, tabs and a self-scrolling panel on the right. The whole game fits on one screen with no page scrolling.
- At 1920×1080 the ranch view grows from 948×535 to 1249×704.
- Toasts moved below the left column so they no longer cover the panel.
- Phones and narrow screens keep the original single-column layout.

## v2.0 — Modern Japanese-RPG overhaul

- New "Art style" setting: **Modern RPG (default)** / Classic Pixel. Classic Pixel is identical to v1.10.
- 6 storybook backgrounds (meadow, beach, volcano, snowfield, sky city, arena) plus a dedicated title scene (world tree at dawn).
- All 35 slimes, 10 monsters and 28 icons redrawn as cached cel-shaded vectors.
- Battles now use a front view: enemy in the center, party status window below, slash and magic-circle effects.
- UI restyled with blue gradient windows, silver rounded borders, a ▶ selection cursor and window open animations.
- 8 original orchestral tracks (including a new boss theme), plus a victory fanfare, a rest jingle and UI sounds (cursor, confirm, open, close, not enough money).
- Long jingles duck the background music; sound effects and music go through a compressor to prevent clipping.
- IP rules: take genre conventions only, copy no specific work.
- Known issue: the first gacha reveal has one ~50 ms layout (likely CJK font subsets loading lazily).

## v1.10 — Big gem pack and 100-pulls

- New Gem Empire pack: 29,900 gems for NT$9,990, no first-purchase double; the VIP5 threshold moved to 9,990 to avoid an "NT$10 short" nudge.
- 100-pulls on all three gacha tiers (price = 10-pull × 10), shown on a summary page.
- Fixed Oracle 10-pull stutter: 27.6 → 56.4 fps at CPU ×4 (p95 83 ms → 16.9 ms).

## v1.9 — Oracle gacha and quick-push

- Third gacha tier, "Oracle": LR 3%, UR 27%, SSR 70%; LR guaranteed within 70 pulls.
- 9 new slimes, including the new top rarity LR (two skills each).
- Expedition grants an Oracle ticket every 50 floors starting at floor 100 (originally from floor 50; simulation showed light spenders 50% faster, so it was delayed).
- Quick-push: clear many floors in one tap without animation, with a summary card.

## v1.8 — Premium gacha and companion slots

- Second gacha tier, "Premium": UR 3%, SSR 20%, SR 77%; UR guaranteed within 60 pulls.
- 11 new slimes and the new UR rarity, each with a unique skill (expedition damage, BREAK damage, tap gold, stardust…).
- First clears of expedition bosses grant Premium tickets.
- **Companion slots**: gacha slimes no longer occupy main ranch slots (fixes F2P progress going backwards).
- VIP 2 / 4 / 6 grant +1 / +2 / +3 companion slots.
- Balance switched to the median of 5 random seeds.

## v1.7 — Quality-of-life controls

- Hold to level up fast; MAX for one-tap max level.
- Sell from storage (gacha slimes and high levels need a double confirm); one-tap sell of crystal slimes.
- Gacha auto-sell for R results.
- Expedition auto-push (waits when too weak and resumes once strong enough).

## AAA upgrade — HD-2D

- WebGL2 compositor `hd2d.js`: depth of field, tilt-shift, bloom, point lights, god rays, fog, grading, vignette; three quality levels with auto-degrade.
- Scenes split into 7 depth layers; large soft-focus foreground props, ambient particles, soft character shadows and rim light, camera breathing and battle push-ins.
- Expedition gains weakness, shields and BREAK.
- Synthesized orchestral music (5 zones, battle, title).
- Title screen.

## v1.6 — Launch readiness

- Save code export/import.
- Multi-tab guard, save versioning with per-version migration.
- 14-step onboarding quest line.
- Synthesized 8-bit sound effects.
- Health check: back up corrupt saves first, format huge numbers, handle clocks going backwards.

## v1.5 — Long-term goals

- Codex (+2% output per entry) and 52 tiered achievements.
- 5 zones (unlocked with stardust, permanent ×1.5 each, with zone slimes).
- Uncapped "stardust resonance".

## v1.4 — Gameplay rework

- Merge gate (3 slimes at Lv≥10), ×2 level milestones, prestige and stardust shop, Golden Visitor.
- Gacha slime skills; gacha slimes survive prestige.
- **Expedition dungeon**: floor pushing, elemental counters, pick-1-of-3 relics.
- Trigger: v1.3 simulation showed an SSR could be merged in 110 seconds and players had nothing to do from day 3.

## v1.3 — Pacing fixes

- The guaranteed first SR became a free pull after accumulating gold (2,000 in v1.3, later 5,000).
- Tap crits (10% chance, ×5).

## v1.0–v1.2 — Prototype

- Buy, level up and merge slimes; offline income.
- Simulated monetization: gem packs, first-purchase double, monthly card, starter pack, VIP, boosts, gacha pity.
- Daily login and missions, offline income ×2/×3, triggered limited offers.
