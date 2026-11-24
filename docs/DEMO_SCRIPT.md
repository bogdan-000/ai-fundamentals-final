# Demo Script (2–3 min video / 3–5 min live demo)

**0:00 — Problem (20 s)**
"A delivery drone gets one noisy wind reading before take-off. It must decide: is it windy,
should it fly or wait, and which route. I solve each question with a different AI algorithm."

**Defense order:** open `http://localhost:8000/#present` → slides 1–3 (problem, 2 min) → "Live demo →" on the last slide
switches to the site for the demo (3–5 min) → back to **Presentation** for slides 4–6 (three AI topics, 2 min).
Press `N` to see speaker notes, `F` for fullscreen.

**Before recording:** `python server.py` → the site opens at http://localhost:8000 → click **Launch mission**.

**0:20 — Scenario A, Calm morning (30 s)**
In *Mission control* select preset A. Point at: P(strong wind) 2.7 % → FLY → 11-move shortcut across the open field.
"Low risk, so A* happily crosses the open field."

**0:50 — Scenario B, Uncertain day (40 s)**
Select preset B. P = 9.7 % → still FLY (below the 12.9 % threshold), but the route jumps to 15 moves.
"Same algorithms, but the wind belief made the open-field cells expensive, so A* detours."
Scroll to *A\* search*, press **play** to show the frontier and f = g + h.

**1:30 — Scenario C, Storm warning (40 s)**
Select preset C. P = 63 % → WAIT, the route turns dashed (preview).
*Bayes* section: ringed dots, 0.24 / 0.38 = 0.632. *MDP* section: Q_b(fly) = −8.95 vs Q_b(wait) = 5.86.
"The sensor alert flipped the decision — the drone holds at the depot."

**2:10 — Interactivity (30 s)**
Raise the false-alarm rate to 0.45 → posterior drops to 13.5 %, right at the threshold.
Show the *Sensitivity* chart: the dot moves with the inputs.

**2:40 — Tests (15 s)**
*Testing* section → **run tests** → 27 passed.

---

## Defense: likely questions

- **Why is Manhattan admissible?** Each move costs ≥ 1 and the drone moves only in 4 directions, so the real remaining cost is never less than the Manhattan distance.
- **Why A\* and not BFS?** Costs are not uniform (open-field cells cost more); BFS only minimises the number of moves. A\* minimises total cost and uses a heuristic to expand fewer nodes.
- **What is the evidence P(e)?** The normalising constant: probability of the observation under both hypotheses (law of total probability).
- **What if the sensor were 50/50?** Likelihoods are equal, posterior = prior: the reading carries no information (there is a test for this).
- **Why is fly terminal?** Once the drone departs, the decision is made; only `wait` leads to another decision step.
- **What does γ do?** Discounts future rewards; with γ = 0 the drone only looks at immediate reward (one-step mode).
- **Why does value iteration converge?** The Bellman operator is a contraction for γ < 1.
- **What is QMDP and its limitation?** Weights each state's Q by the belief; it assumes uncertainty disappears after one step, so it never chooses to wait just to gather information.
- **How are the three algorithms connected?** The Bayes posterior is the belief for the MDP and the risk weight for A\*.
- **Where does the 12.9 % threshold come from?** Solve 10 − 30b = 6.217 − 0.565b ⇒ b ≈ 0.129.
