<div align="center">

# Pixel Slime Ranch 像素史萊姆牧場

**An idle-raising game built from scratch by three collaborating AI agents — the human only gave directions — that went from pixel art to a modern Japanese-RPG look in a single day.**
**It is also a fully documented, textbook-style case study of how AI can develop a game.**

[▶ Play now](https://sen-capoo.github.io/idle-slime-ranch/) · [How the AI built it](docs/AI-DEVELOPMENT.en.md) · [Playbook for AI game creators](docs/PLAYBOOK.en.md) · [Architecture](docs/ARCHITECTURE.en.md) · [正體中文](README.md)

![Title screen](docs/screenshots/01-title.jpg)

</div>

> The game's UI text is in Traditional Chinese. The documentation is available in both Traditional Chinese (default) and English.

---

## Why this project is worth a look

Most "made with AI" games only show the finished product. This repository keeps the **process** too:

- **Three Claude Code sessions with clear roles** — engine, visuals, and product/QA — communicating through a shared interface contract. Every file has exactly one owner.
- **Fun is verified by simulation, not by feel.** A simulated player plays the real game logic for 14 or 30 days across multiple random seeds, catching problems like "nothing to do from day 3" or "light spenders progress 50% faster" that a human glance would miss.
- **Every rejection is on record.** Which design was wrong, who caught it, how it was fixed, and the numbers afterwards are all in [`COLLAB.html`](COLLAB.html) — including the AI's own mistakes and the moments the agents corrected each other.
- **Measurable acceptance criteria**: "fewer than 5% pure-white pixels" and "at least 50 fps on a phone throttled 4×", not "looks good".
- **Zero build, zero asset files.** Plain HTML + Canvas + JavaScript — double-click `index.html` to play. Every character, background, and icon is drawn by code; all music and sound effects are synthesized live with Web Audio. There are no image or audio assets in the repo.

> If you want to make games with AI, start with [How the AI built it](docs/AI-DEVELOPMENT.en.md), then apply the method to your own project with the [Playbook](docs/PLAYBOOK.en.md).

## Screenshots

| Ranch (meadow) | Ranch (beach at sunset) | Ranch (volcano at night) |
|---|---|---|
| ![Meadow](docs/screenshots/02-ranch-meadow.jpg) | ![Beach](docs/screenshots/03-ranch-beach.jpg) | ![Volcano](docs/screenshots/04-ranch-volcano.jpg) |
| **Expedition battle (boss defeated)** | **Oracle gacha** | **LR reveal** |
| ![Battle](docs/screenshots/08-battle.jpg) | ![Oracle gacha](docs/screenshots/05-gacha-oracle.jpg) | ![LR reveal](docs/screenshots/06-reveal-LR.jpg) |
| **Shop** | **Classic pixel style (switchable)** | **Mobile** |
| ![Shop](docs/screenshots/07-shop.jpg) | ![Classic pixel](docs/screenshots/09-classic-pixel.jpg) | ![Mobile](docs/screenshots/10-mobile.jpg) |

## Gameplay at a glance

| Time scale | What the player does |
|---|---|
| Seconds | Tap for gold (with crits), catch the Golden Visitor, buy slimes, hold to level up fast |
| Minutes | Hit level 10/25/50/100 milestones for ×2 output, merge three slimes into the next tier |
| Each session | Push the expedition: elemental counters, weakness shields and BREAK, pick-1-of-3 boss relics; auto-push and quick-push |
| Daily | Prestige for stardust, stardust shop, unlock 5 zones, daily login and missions, 35-entry codex, 52 achievements |
| Collecting | Normal / Premium / Oracle gacha tiers, six rarities from N to LR, every gacha slime has a unique skill |

**All purchases are simulated** — no real payment is connected. Gacha rates are shown publicly with pity counters. The design deliberately avoids manipulative patterns such as fake "original prices", stamina gates, or "only NT$10 away from the next tier" thresholds (see [How the AI built it](docs/AI-DEVELOPMENT.en.md#ethics-and-monetization)).

## Quick start

```bash
# 1. Get the source
git clone https://github.com/Sen-CaPoo/idle-slime-ranch.git
cd idle-slime-ranch

# 2. Open it in a browser (nothing to install)
start index.html          # Windows
open index.html           # macOS
xdg-open index.html       # Linux
```

The settings tab lets you switch between the "Modern RPG" and "Classic Pixel" styles, adjust quality and volume, and export/import saves.

### Developer tools (Node.js 18+; some need Chrome)

| Command | Purpose |
|---|---|
| `node tools/sim.js . casual 14` | Simulate a casual player for 14 days; prints decisions and idle seconds per session |
| `node tools/sim-seeds.js 30 5 f2p,light,heavy` | 5 random seeds × 3 spending levels, compared by median |
| `node tools/regress-browser.js` | Opens the game via `file://` in headless Chrome; checks errors, FPS, overexposure |
| `node tools/accept-ux.js` | Verifies 16 interactions (hold-to-level, MAX, selling, auto-push…) with real mouse events |
| `node tools/perf-gacha.js` | Measures gacha-reveal smoothness under 4× CPU throttling |
| `node tools/render-music.js` | Renders all music and sound effects to WAV for listening |

## Project layout

```
index.html            Entry point (loads the scripts below in order)
style.css             Two UI themes: classic pixel and modern RPG
js/
  engine.js           Game state, numbers, saving, prestige, zones, achievements (0b)
  shop.js             Shop, three gacha tiers, VIP (0b)
  dungeon.js          Expedition: elements, BREAK, relics, auto/quick push (a3)
  quests.js           Onboarding quest line (a3)
  audio.js            Sound/music playback, UI sounds (a3)
  audio-modern.js     Synthesized orchestral instruments and original songs (a3)
  hd2d.js             WebGL2 compositor: depth of field, bloom, point lights, grading (0b)
  scenes-modern.js    Modern-style backgrounds and title scene (0b)
  sprites*.js         Pixel and vector characters (27)
  monsters.js         Monsters (27)
  icons-modern.js     Vector icons (27)
  render.js battle.js Ranch and battle rendering (27)
  ui.js               User interface (27)
tools/                Simulation, regression, performance, acceptance, music export
docs/                 Documentation and screenshots
COLLAB.html           Shared memory and interface contract of the three AIs (full dev log)
DESIGN-v2.html        Product design spec (chapters 0–11)
HANDOFF.html          Handoff summary
```

The design and log files (`COLLAB.html`, `DESIGN-v2.html`, `HANDOFF.html`) are written in Traditional Chinese. See [Architecture](docs/ARCHITECTURE.en.md) for details.

## Documentation

| Document | For | Contents |
|---|---|---|
| [How the AI built it](docs/AI-DEVELOPMENT.en.md) | Anyone curious how AI made this game | Roles, communication, timeline, key decisions and mistakes |
| [Playbook](docs/PLAYBOOK.en.md) | Creators making their own game with AI | Ready-to-use roles, contract template, acceptance checklist, prompt examples |
| [Architecture](docs/ARCHITECTURE.en.md) | Developers reading or changing the code | Modules, event flow, render pipeline, save migration |
| [Changelog](CHANGELOG.en.md) | Everyone | What changed from v1.0 to v2.0 |
| [Contributing](CONTRIBUTING.en.md) | Contributors | Workflow, code style, acceptance requirements |

## Intellectual property

v2.0's visuals and audio draw on the shared vocabulary of the modern Japanese-RPG **genre** (cel shading, storybook backgrounds, blue gradient windows, orchestral scores). They **do not copy** any specific work's characters, monsters, UI layout, logos, melodies, or sound effects. The slime is this project's own "dome jelly" design, and every melody is original. The rules are in section 11.0 of [`DESIGN-v2.html`](DESIGN-v2.html).

## License

The code and all original content are released under the [MIT License](LICENSE). Learn from it, change it, build your own game on it — just keep the copyright notice.

## Credits

- Development: three [Claude Code](https://claude.com/claude-code) sessions (model Claude Opus 5.5), directed by human director [@Sen-CaPoo](https://github.com/Sen-CaPoo).
- Fonts: [DotGothic16](https://fonts.google.com/specimen/DotGothic16), [Noto Sans TC](https://fonts.google.com/noto/specimen/Noto+Sans+TC), [Noto Serif TC](https://fonts.google.com/noto/specimen/Noto+Serif+TC), [M PLUS Rounded 1c](https://fonts.google.com/specimen/M+PLUS+Rounded+1c) (all SIL Open Font License, loaded from Google Fonts).
- Balancing reference: Anthony Pecorella, "[The Math of Idle Games](https://www.kongregate.com/en/pages/the-math-of-idle-games-part-i)".
