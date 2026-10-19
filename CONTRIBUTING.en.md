# Contributing

[正體中文](CONTRIBUTING.md) · [Back to README](README.en.md)

Thanks for your interest! This project is both a game and a teaching example of "how AI develops a game", so the **record of the process** matters as much as the code.

## Ways to contribute

- 🐞 Bug reports: include browser, OS and reproduction steps — ideally a screenshot or an exported save code.
- 🎵 Listening feedback: AI can't hear music, so your ears are valuable. Export WAVs with `node tools/render-music.js` and tell us which tracks need work.
- 📱 Real-device performance: open the game on a real low-to-mid-range phone and report FPS and whether it auto-degraded.
- 🧪 Tests: the unit tests run during development were never collected into files; turning them into a `tests/` folder is very welcome.
- 🌐 Translation: in-game text is currently Traditional Chinese only.
- 📝 Teaching material: if you used this method on your own game, share what you learned.

## Workflow

1. Open an issue describing what you'd like to do (small fixes can go straight to a PR).
2. Read the [Architecture](docs/ARCHITECTURE.en.md) first to see which layer your change belongs to.
3. If you change the public `window.Game` API or events, update the interface contract in [`COLLAB.html`](COLLAB.html).
4. If you change the save format, bump `SAVE_VERSION` and add a migration to `MIGRATIONS`.
5. Before submitting, run the acceptance checks that match your change (table below).

## Acceptance requirements

| If you changed | Run | Threshold |
|---|---|---|
| Numbers, economy, gacha, expedition | `node tools/sim-seeds.js 30 5 f2p,light,heavy` | F2P zone unlocks no more than 2 days later than now; light spenders 10–25% faster |
| Any visuals | `node tools/regress-browser.js` | 0 exceptions, 60 fps, pure-white pixels < 5% |
| Buttons or flows | `node tools/accept-ux.js` | 16/16 pass |
| Gacha reveals, effects | `node tools/perf-gacha.js` | ≥ 50 fps average, p95 ≤ 33 ms at CPU ×4 |
| Audio | `node tools/render-music.js` | Peak < 0.99, no near-silent sounds |

Please include numbers in your PR description, e.g. "sim-seeds median: F2P D3/D7/D12/D22".

## Code style

- Plain JavaScript (ES2017+), no module syntax, bundler or framework, so `file://` keeps working.
- Wrap each file in an IIFE and expose a single global object.
- The logic layer (`engine.js`, `shop.js`, `dungeon.js`, `quests.js`) must not touch the DOM and must load in Node.
- Check that another module's API exists before calling it (e.g. `if (Game.dungeon && Game.dungeon.mult)`).
- Comments are in Traditional Chinese and explain *why*, not what the code already says.
- No image or audio files: draw characters, backgrounds and icons in code; synthesize sound with Web Audio.

## Design principles

- **Monetization**: public rates with pity; no fake original prices, stamina gates, "almost there" thresholds or fake countdowns.
- **IP**: reference genre conventions only; never copy any work's characters, UI or melodies.
- **Fun first**: new content must not slow down free players.

## License

By contributing you agree that your contribution is released under the [MIT License](LICENSE).
