# 🛩️ Mini Drone Parcel Route

**AI Fundamentals — Final Project (Topic 13)**
Author: Bogdan Murygin · QAIRU · 2026

Video Link: https://drive.google.com/file/d/1FZovMoDIGOSkycoewf8n-z2aIOdXUuIm/view?usp=sharing

A simulated delivery drone has to bring one parcel from a depot to a customer.
Before take-off it gets **one wind-sensor reading**. The project answers three questions,
each with a different AI technique from the course, and chains them into one decision:

| # | Question | Algorithm | Course topic |
|---|----------|-----------|--------------|
| 1 | How likely is a strong wind right now? | **Bayesian inference** | Probabilistic reasoning |
| 2 | Should the drone **fly now or wait**? | **MDP** (Bellman update / value iteration) | Sequential decision making |
| 3 | Which route should it fly? | **A\*** search (Manhattan heuristic) | Search |

```
sensor reading ──► [Bayes] ──► P(strong wind) ──► [MDP] ──► FLY / WAIT
                                     │
                                     └──────────► [A*] ──► route (open-field cells cost more when windy)
```

The algorithms are **not independent demos**: the Bayesian posterior is the input of
both the MDP (as the belief over weather states) and A\* (as the risk weight on wind-exposed cells).

---

## Quick start

```bash
git clone https://github.com/bogdan-000/ai-fundamentals-final.git
cd ai-fundamentals-final
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
python server.py          # web UI → opens http://localhost:8000
python main.py            # console demo, 3 preset scenarios

pip install -r requirements.txt   # only needed for the tests
pytest -v                         # 27 tests
```

Requires Python 3.10+. The web UI and the console demo use **only the standard library** — nothing to install.

### Web UI
`server.py` serves a single-page site (`web/`) and one JSON endpoint, `GET /api/mission`.
The page never re-implements the algorithms: every number on it is computed by the `drone/` package.

- **Mission control** — presets A/B/C or custom inputs; animated map: A* exploring, then the route (dashed = drone waits).
- **Bayes** — 100-day dot picture of Bayes' rule, prior vs posterior bars, step-by-step calculation.
- **MDP** — live Q-table, expected value under the belief, value-iteration convergence chart, editable rewards/transitions/γ.
- **A\*** — step / play through the search, frontier and g, h, f of every expanded node.
- **Sensitivity** — posterior vs prior for both readings with the fly threshold.
- **Testing** — a button that runs the pytest suite from the browser.

### Presentation
The switch at the top of the page toggles **Demo | Presentation**. The presentation is a 7-slide deck
built into the same page (title, problem, system design, Bayes, MDP, A*, results); live numbers on it come from the engine.
Keys: `←` `→` to move, `F` fullscreen, `N` speaker notes, `Esc` back to the demo. Direct link: `http://localhost:8000/#present`.

Visual design adapted from the course book *AI in Short* (monochrome, particle field, night mode).

Console options:
```bash
python main.py --prior 0.3 --alert
python main.py --prior 0.3 --no-alert --mode one_step --penalty 40
```

---

## The model

### Map (6×6, A\*)
```
S . . # . G        S  depot (0,0)        G  customer (0,5)
. . . # . .        #  building — 3 obstacle cells (0,3) (1,3) (2,3)
. . . # . .        ~  open field — wind-exposed cells (3,3) (3,4) (4,3) (4,4)
. . . ~ ~ .
. . . ~ ~ .
. . . . . .
```
- 4-connected moves; entering a normal cell costs **1**.
- Entering an open-field cell costs **1 + penalty × P(strong wind)** (default penalty = 25).
- Heuristic h = Manhattan distance → admissible because every step costs ≥ 1, so A\* returns an optimal route.

### Wind sensor (Bayes)
| Parameter | Value |
|---|---|
| Prior P(strong) | 0.30 (adjustable) |
| P(alert \| strong) — hit rate | 0.80 |
| P(alert \| calm) — false alarm | 0.20 |

### Fly-or-wait (MDP)
States `calm`, `windy`; actions `fly`, `wait`; γ = 0.9.

| R(s,a) | fly | wait |
|---|---|---|
| calm  | +10 (on-time delivery) | −2 (needless delay) |
| windy | −20 (crash risk) | −1 (sensible delay) |

Weather transition while waiting: P(calm→calm)=0.8, P(windy→windy)=0.6.
`fly` is terminal (mission ends); `wait` gives the weather a chance to change.

Q(s,a) = R(s,a) + γ Σ P(s′|s) V(s′), V(s) = maxₐ Q(s,a).
The weather is uncertain, so the action is chosen by the expected Q under the belief
b = P(windy) from Bayes: **Q_b(a) = b·Q(windy,a) + (1−b)·Q(calm,a)** (QMDP approximation).
Two solvers: *one Bellman update* (as in the course note) and *value iteration* to convergence.

> **Assumptions:** all probabilities, rewards and the map are hand-made toy values (allowed by the
> project guidelines). No real dataset or trained model is used.

---

## Sample input / output

| Scenario | Prior | Sensor | P(strong \| e) | MDP | Route |
|---|---|---|---|---|---|
| A. Calm morning | 0.10 | no alert | **0.027** | **FLY** | 11 moves, shortcut across open field |
| B. Uncertain day | 0.30 | no alert | **0.097** | **FLY** | 15 moves, detour around the field |
| C. Storm warning | 0.30 | ALERT | **0.632** | **WAIT** | hold; 15-move route shown as preview |

Fly threshold (value iteration, default rewards): fly only if P(strong) < **12.9 %**.

Excerpt of `python main.py` (scenario C):
```
[1] BAYESIAN INFERENCE
    Joint:       P(alert,strong) = 0.800*0.300 = 0.2400
                 P(alert,calm)   = 0.200*0.700 = 0.1400
    Evidence:    P(alert) = 0.2400 + 0.1400 = 0.3800
    Posterior:   P(strong|alert) = 0.2400 / 0.3800 = 0.6316
[2] MDP
    V(calm) = 10.000   Q(calm,fly) = 10.000    Q(calm,wait) = 6.217
    V(windy) = 5.652   Q(windy,fly) = -20.000  Q(windy,wait) = 5.652
    Q_b(fly)  = 0.632*-20.000 + 0.368*10.000 = -8.947
    Q_b(wait) = 0.632*5.652  + 0.368*6.217  = 5.860
    Decision: WAIT
```
Full output: [`docs/sample_output.txt`](docs/sample_output.txt) · test log: [`docs/test_results.txt`](docs/test_results.txt)

---

## Project structure
```
drone/
  bayes.py      Bayesian update of P(strong wind)
  mdp.py        MDP, Bellman update, value iteration, belief-based decision
  astar.py      grid map, A* with wind-weighted costs and step trace, ASCII renderer
  pipeline.py   run_mission(): Bayes → MDP → A*
server.py       web server (standard library) + JSON API
web/            the site: index.html, style.css, app.js, book.css/book.js (design)
main.py         console demo
tests/          pytest suite (unit, integration, web API)
docs/           report, AI usage declaration, contribution statement, demo script
```

## Testing
27 tests in `tests/` (also runnable from the **Testing** section of the site):
- **Bayes** — hand-calculated posteriors, alert raises / silence lowers belief, useless sensor leaves belief unchanged, invalid input rejected.
- **MDP** — one-step Q = immediate reward, value iteration matches the closed-form V(windy)=2.6/0.46, policy at belief 0 and 1, threshold separates decisions, bad transition table rejected.
- **A\*** — optimal 11-move route when calm, matches BFS length (optimality check), never enters obstacles, detours when windy, reports “no route”, rejects invalid start.
- **Integration** — the three scenarios above.
- **Web server** — API output equals the engine output, bad input → HTTP 400, no access outside `web/` (404).

## Documents
- [Technical report](docs/REPORT.md)
- [AI usage declaration](docs/AI_USAGE.md)
- [Contribution statement](docs/CONTRIBUTION.md)
- [Demo video script](docs/DEMO_SCRIPT.md)

## Possible improvements
- Full POMDP instead of the QMDP approximation (value of gathering more sensor readings).
- Several sensor readings over time → HMM filtering of the weather.
- Wind direction: anisotropic step costs, 8-connected moves, battery constraint.
- Larger maps from real campus coordinates.
