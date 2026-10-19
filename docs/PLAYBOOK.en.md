# Playbook for AI Game Creators

[正體中文](PLAYBOOK.md) · [Back to README](../README.en.md)

This playbook distills how *Pixel Slime Ranch* was built into **steps you can apply directly**. It works whether you use Claude Code, another AI coding tool, or a single person paired with a single AI.

---

## 1. Define roles before you start

One AI doing everything quickly circles inside its own blind spots. Split into at least three roles, each in its own session:

| Role | Owns | Does not own |
|---|---|---|
| **Engine** | State, numbers, saving, game rules | Visuals |
| **Visuals** | Rendering, animation, UI, interaction | Numbers |
| **Product & QA** | Fun, monetization design, balance simulation, playtesting, filing issues | Never signs off its own work |

The human plays **director**: sets goals and makes value calls (monetization strength, license, whether to go public). No coding required.

### Opening prompt example (for a third AI joining later)

```text
Two other sessions are already building a [genre] game.
Your job is to approach it from the [monetization / visuals / fun] angle so that
it looks good and keeps people playing. First introduce yourself to the other two,
read the existing code, then propose concrete changes.
```

## 2. Create a shared memory file

Put one file at the project root that every AI reads and writes (here: [`COLLAB.html`](../COLLAB.html)). Minimal template:

```markdown
# Shared memory

## 1. Task
One sentence describing the goal. List assumptions that need confirming.

## 2. Files and ownership
| File | Contents | Owner |

## 3. Interface contract v1
// Global API the engine exposes to the renderer
Game.state = { ... }
Game.actions.buy(id) -> bool
Game.on(evt, fn)  events: 'change', 'gold', ...

## 4. Progress log
### Role A
- date: what was done, what was measured
### Role B
...
```

Rules:

- Each person edits only their own section.
- **Message the other side and get agreement before changing the contract**, then bump its version.
- Log one line every time something is finished, with numbers. This file becomes your basis for handoffs, documentation, and debugging later.

## 3. Replace gut feeling with simulation

This is the most valuable step in the whole project. It fits idle, raising, and management games especially well, but any game with numbers can use it.

### Minimal simulator structure

```js
// 1. Load the real game logic (don't write a simplified copy)
for (const f of ['engine.js', 'shop.js']) vm.runInThisContext(read(f));

// 2. Fake clock: run 30 days in seconds
let now = START; Date.now = () => now;

// 3. Player policy: at each step pick the option with the most output per coin
function act() { /* list everything buyable, sort by cost / gain, buy the best */ }

// 4. Scenario: N logins a day of M minutes, with offline income in between
for (const day of days) for (const session of plan) { offline(); play(session.minutes); }

// 5. Output: decisions per session, longest idle gap, output change, milestone times
```

### What to measure

| Metric | Meaning | This project's target |
|---|---|---|
| Decisions per session | Does the player have something to do? | ≥ 5 |
| Longest idle gap | Do they ever just wait? | < 90 s |
| Milestone timing | First merge, first prestige, each zone unlock | Inside the designed window |
| Long-term goals | Is there a next goal on days 7, 14, 30? | Must exist |
| Spending gap | How much faster light/heavy spenders progress | Light 10–25% |

### Must-dos

- **Use the median of several random seeds**, at least 5. A single seed may simply be lucky and fool you into thinking it's balanced.
- **Simulate several player types**: free, light spender, heavy spender — and "rarely logs in" vs. "always open".
- **Re-run after every number change**, and compare with the previous version.

## 4. Make acceptance reproducible

Every acceptance item must answer three questions: **How is it measured? What is the threshold? Which tool?**

### Visuals

- Use a headless browser (e.g. Chrome `--headless=new` plus the DevTools Protocol) to open the game, click buttons, and take screenshots automatically.
- Don't only capture static screens: take reveal, battle, and transition animations at several timestamps.
- Give measurable thresholds, e.g. "pure-white pixels < 5%", "character outlines distinguishable".

### Performance

- Use DevTools CPU throttling (e.g. 4×) to emulate a phone.
- Measure both average FPS **and** p95 frame time — averages hide stutter.
- Pick the heaviest scenario (here: "an Oracle 10-pull where every result is top rarity") and make it reproducible with fixed randomness.

### Interaction

- Use real mouse events (`Input.dispatchMouseEvent`) rather than calling functions directly, so you catch problems like long-press or "covered by a popup".
- Before clicking, verify the target isn't covered; wait by polling, not fixed delays.

## 5. How to write an issue

A good rejection means the other side never has to ask a follow-up question. Format:

```text
🔴 [severity] One-sentence problem
Observed: which screen, what you did, what you saw (screenshot path or numbers)
Expected: what it should be (measurable)
Suggestion: how you'd fix it (they may choose otherwise)
```

A real example:

```text
🔴 1. The public rate table is wrong (a trust issue — top priority): the normal
gacha's SSR row lists Aurora, Abyss and Tempest, but those are Oracle-only.
I verified with 3,000 pulls in Node that the engine never rolls them, so the UI
filter excludes premium but not oracle. Please fix it and check the premium table too.
```

Grade with 🔴 (must fix) / 🟠 (should fix) / 🟡 (can wait) so the other side knows what to do first.

## 6. Value rules for the AI

AI is very good at "doing the request as well as possible", so if the request is "make people want to spend", it may drift toward manipulative design. **Write the boundaries down:**

```markdown
## Monetization principles
- Rates public, with pity
- Purchased items never disappear on reset
- Never use: fake original prices, stamina gates, "almost there" thresholds, fake countdowns
```

In this project these principles let one AI refuse its peer's bad suggestion (a fake original price), and let another notice a non-obvious nudge (being NT$10 short of VIP5).

If you reference other works' styles, also write IP rules: **take genre conventions, never copy specific designs.**

## 7. Standard flow for one version

```text
Human: states a goal
  ↓
Product: writes the spec (with acceptance criteria and ownership) and sends it to each owner
  ↓
Owners: implement in parallel, unblocked by defensive APIs, report back with numbers
  ↓
Product: simulate → screenshot → measure performance → test interactions
  ↓
Problems → graded issues (with numbers) → fix → re-verify
  ↓
All pass → record in shared memory and changelog → report to the human
```

## 8. Common pitfalls

| Pitfall | Real case in this project | Prevention |
|---|---|---|
| All features done, still not fun | v1.3: nothing to do from day 3 | Write the simulator in the first version |
| One system's numbers break another | Merging was so good that gacha lost its value | Track "when each resource is first obtained" in simulation |
| New content squeezes old content | Gacha slimes filled the ranch | Re-run the F2P simulation whenever content is added |
| The acceptance script itself is flaky | Fixed 3-second waits failed on cold start | Polling waits, random ports, run several times |
| UI disagrees with the actual rules | The public rate table listed extra slimes | Compare UI against engine data during review |
| Things AI can't verify | Whether the music sounds good | Export to files and mark explicitly as "needs human review" |

---

Want to see these methods applied end to end? Read [How the AI built it](AI-DEVELOPMENT.en.md).
