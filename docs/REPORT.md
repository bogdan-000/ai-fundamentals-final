# Technical Report — Mini Drone Parcel Route

**Course:** AI Fundamentals · **Topic:** 13 — Mini Drone Parcel Route
**Author:** Bogdan (individual project) · QAIRU · 2026

---

## 1. Problem statement

Small delivery drones are cheap, but wind is their main risk: a gust can push the drone off course,
drain the battery or cause a crash. Before every flight an operator has to decide:

1. **Is it actually windy?** Sensors are noisy, and a single alert can be a false alarm.
2. **Should we fly now or wait?** Waiting costs time; flying in strong wind risks the drone and the parcel.
3. **Which route?** The shortest route may cross open terrain where wind is strongest.

## 2. Objectives

- Build a working prototype that makes all three decisions automatically from one sensor reading.
- Use three algorithms from different course topics, each solving one sub-problem, all connected.
- Show every intermediate step so the reasoning can be checked by hand.
- Test correctness with hand-calculated cases and edge cases.

## 3. System design

```
sensor reading ──► Bayes ──► b = P(strong wind) ──┬──► MDP ──► FLY / WAIT
                                                   └──► A*  ──► route
```
The Bayesian posterior *b* is the shared link:
- in the **MDP** it is the belief over the hidden weather state;
- in **A\*** it scales the cost of wind-exposed cells, so the route changes with the risk.

If the MDP says WAIT, the route is still computed and shown as a preview.

## 4. Algorithm 1 — Bayesian inference

**Why:** the true wind state is hidden; we only see a noisy sensor. Bayes' rule is the principled way
to combine prior knowledge with one observation.

**How:**
P(strong | e) = P(e | strong)·P(strong) / P(e), with P(e) = P(e|strong)P(strong) + P(e|calm)P(calm).

**Worked example** (prior 0.3, alert, hit rate 0.8, false-alarm rate 0.2):
- P(alert, strong) = 0.8 × 0.3 = 0.24
- P(alert, calm) = 0.2 × 0.7 = 0.14
- P(alert) = 0.38 → **P(strong | alert) = 0.24 / 0.38 = 0.632**

With no alert the same prior drops to 0.06 / 0.62 = **0.097**.

## 5. Algorithm 2 — Markov Decision Process

**Why:** fly-or-wait is a sequential decision under uncertainty: waiting has a cost now but
the weather may improve later. An MDP captures both immediate rewards and future consequences.

**Model:** S = {calm, windy}, A = {fly, wait}, γ = 0.9.
Rewards: R(calm,fly)=+10, R(windy,fly)=−20, R(calm,wait)=−2, R(windy,wait)=−1.
Transitions while waiting: P(calm→calm)=0.8, P(windy→windy)=0.6. `fly` is terminal.

**Bellman update:** Q(s,a) = R(s,a) + γ Σ P(s′|s) V(s′); V(s) = maxₐ Q(s,a).

- *One-step mode* (V₀ = 0): Q = immediate reward.
- *Value iteration*: repeat until |ΔV| < 10⁻⁶ (27 updates).
  Closed form: V(calm) = 10 (fly), V(windy) = −1 + 0.9(0.4·10 + 0.6·V) ⇒ **V(windy) = 2.6/0.46 ≈ 5.652**.
  Then Q(calm,wait) = −2 + 0.9(0.8·10 + 0.2·5.652) ≈ 6.217.

**Decision under uncertainty (QMDP):** Q_b(a) = b·Q(windy,a) + (1−b)·Q(calm,a).
- Q_b(fly) = 10 − 30b, Q_b(wait) ≈ 6.217 − 0.565b
- Fly ⇔ b < 3.783 / 29.435 ≈ **0.129**

For b = 0.632: Q_b(fly) = −8.95, Q_b(wait) = 5.86 → **WAIT**.

*Limitation:* QMDP assumes the weather becomes fully known after one step; a full POMDP would also
value taking another sensor reading.

## 6. Algorithm 3 — A\* search

**Why:** we need the cheapest route on a grid with obstacles and non-uniform costs. A\* is optimal with
an admissible heuristic and expands fewer nodes than uninformed search.

**Map:** 6×6, start (0,0), goal (0,5), building (0,3),(1,3),(2,3), open field (3..4, 3..4).

**Costs:** normal cell = 1; open-field cell = 1 + 25·b.
**Heuristic:** Manhattan distance — admissible since every step costs ≥ 1.

**Behaviour:**
- Shortcut across the field: 11 moves, 2 exposed cells, cost 11 + 50b.
- Detour along the bottom row: 15 moves, cost 15.
- A\* takes the shortcut when 50b < 4, i.e. **b < 0.08**, otherwise it detours.

## 7. Results

| Scenario | Prior | Sensor | b | Decision | Route |
|---|---|---|---|---|---|
| A. Calm morning | 0.10 | no alert | 0.027 | FLY | 11 moves (shortcut) |
| B. Uncertain day | 0.30 | no alert | 0.097 | FLY | 15 moves (detour) |
| C. Storm warning | 0.30 | alert | 0.632 | WAIT | preview 15 moves |

Each of the three regimes is triggered by a different belief level, so the algorithms interact
in a meaningful way: scenario B is "safe enough to fly, not safe enough for the shortcut".

## 8. Testing

27 automated tests with pytest, all passing (`docs/test_results.txt`):

| Area | What is checked |
|---|---|
| Bayes | hand-calculated posteriors; alert raises / no alert lowers belief; 50/50 sensor changes nothing; prior 0 or 1 stays fixed; invalid probabilities rejected |
| MDP | one-step Q equals R; value iteration equals the closed-form solution; fly at b=0, wait at b=1; threshold separates the two actions; transition rows must sum to 1 |
| A\* | optimal 11-move route with no wind; same length as BFS; no obstacle cells; each move is one step; detour at high wind; "no route" case; invalid start rejected |
| Integration | scenarios A, B, C give the expected posterior, action and route |
| Web server | API returns exactly the engine's numbers; invalid input → HTTP 400; paths outside `web/` → 404 |

The site was also tested end-to-end in Chrome (Playwright): presets A/B/C show the same numbers as
the engine, inputs stay in sync across sections, the A* stepper works, the test button reports all passed,
no JavaScript errors, and the layout works on a 390 px phone screen.

## 9. User interface

A single-page website served by `python server.py` (Python standard library only, no frameworks).
The page sends the inputs to `GET /api/mission`; the server runs the `drone/` package and returns every
intermediate value as JSON, so the browser never re-implements an algorithm.

- **Mission control:** presets and custom inputs, four live outputs, a verdict sentence, and an animated map
  (A\* exploring, then the route; a dashed route means the drone is waiting).
- **Bayes:** 100 imaginary days as dots (the ringed days that are filled = the posterior), prior/posterior bars, step log.
- **MDP:** Q-table with the best action per state, expected values under the belief, value-iteration convergence chart.
- **A\*:** step/play through the search showing the current node, its g, h, f and the frontier.
- **How it connects:** live data-flow diagram; **Sensitivity:** posterior vs prior with the fly threshold.
- **Testing:** runs the pytest suite from the browser.

The visual design (monochrome, particle background, night mode) is adapted from the course book *AI in Short*.

A console version (`python main.py`) prints the same input → steps → output.

## 10. Limitations and future work

- Toy probabilities and rewards; real values would come from weather data and flight logs.
- QMDP ignores the value of more information → full POMDP or "take another reading" action.
- Several readings over time → HMM filtering of the wind state.
- Wind direction, battery limits, 8-connected moves and larger real maps.

## 11. Conclusion

The prototype shows how three classic AI techniques complement each other: Bayes turns noisy data into
a belief, the MDP turns the belief into an action, and A\* turns the belief into a safe route.
All results are reproducible, explained step by step and covered by tests.
