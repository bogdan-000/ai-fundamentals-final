"""Topic 3 — Sequential decision making: Markov Decision Process (MDP).

Question answered: "Should the drone FLY now or WAIT?"

States   S = {calm, windy}
Actions  A = {fly, wait}

- fly  : the drone departs. The mission ends with an immediate reward
         (+ on-time delivery if calm, big penalty for crash risk if windy).
         -> treated as a terminal action, no future value.
- wait : small delay cost, weather evolves according to P(s' | s),
         and the drone decides again next step.

Bellman optimality:
    Q(s, a) = R(s, a) + gamma * sum_{s'} P(s' | s, a) * V(s')
    V(s)    = max_a Q(s, a)

The real weather is not known exactly — we only have the Bayesian belief
b = P(windy). The action is chosen by the expected Q-value under the belief
(the QMDP approximation):
    Q_b(a) = b * Q(windy, a) + (1 - b) * Q(calm, a)
"""

from dataclasses import dataclass, field

STATES = ("calm", "windy")
ACTIONS = ("fly", "wait")


@dataclass
class DroneMDP:
    # Immediate rewards R(s, a)  — assumptions, clearly labelled in README
    rewards: dict = field(default_factory=lambda: {
        ("calm", "fly"): 10.0,    # parcel delivered safely and on time
        ("windy", "fly"): -20.0,  # high risk of crash / damaged parcel
        ("calm", "wait"): -2.0,   # unnecessary delay
        ("windy", "wait"): -1.0,  # sensible delay, small cost
    })
    # Weather transition P(s' | s) while waiting (weather does not depend on the drone)
    transitions: dict = field(default_factory=lambda: {
        "calm": {"calm": 0.8, "windy": 0.2},
        "windy": {"calm": 0.4, "windy": 0.6},
    })
    gamma: float = 0.9

    def validate(self) -> None:
        for s in STATES:
            total = sum(self.transitions[s].values())
            if abs(total - 1.0) > 1e-9:
                raise ValueError(f"Transition row for '{s}' sums to {total}, must be 1")
        if not 0.0 <= self.gamma < 1.0:
            raise ValueError("gamma must be in [0, 1)")

    def q_value(self, s: str, a: str, V: dict) -> float:
        r = self.rewards[(s, a)]
        if a == "fly":                 # terminal action
            return r
        return r + self.gamma * sum(p * V[s2] for s2, p in self.transitions[s].items())


@dataclass
class MDPResult:
    V: dict                 # state values
    Q: dict                 # Q[(s, a)]
    iterations: int
    belief_windy: float
    q_belief: dict          # Q_b(a)
    action: str
    steps: list = field(default_factory=list)


def bellman_update(mdp: DroneMDP, V: dict):
    """ONE Bellman update: returns new V and the Q-table used to build it."""
    Q = {(s, a): mdp.q_value(s, a, V) for s in STATES for a in ACTIONS}
    V_new = {s: max(Q[(s, a)] for a in ACTIONS) for s in STATES}
    return V_new, Q


def value_iteration(mdp: DroneMDP, tol: float = 1e-6, max_iter: int = 1000):
    """Repeat Bellman updates until values stop changing."""
    mdp.validate()
    V = {s: 0.0 for s in STATES}
    history = [dict(V)]
    for i in range(1, max_iter + 1):
        V_new, Q = bellman_update(mdp, V)
        history.append(dict(V_new))
        if max(abs(V_new[s] - V[s]) for s in STATES) < tol:
            return V_new, Q, i, history
        V = V_new
    return V, Q, max_iter, history


def decide(mdp: DroneMDP, belief_windy: float, mode: str = "value_iteration") -> MDPResult:
    """Choose Fly or Wait given the belief P(windy).

    mode = "one_step"         -> a single Bellman update from V0 = 0 (Q = immediate reward)
    mode = "value_iteration"  -> Bellman updates until convergence (looks ahead)
    """
    if not 0.0 <= belief_windy <= 1.0:
        raise ValueError("belief_windy must be in [0, 1]")
    mdp.validate()

    steps = []
    if mode == "one_step":
        V0 = {s: 0.0 for s in STATES}
        V, Q = bellman_update(mdp, V0)
        iterations = 1
        steps.append("One Bellman update from V0 = 0  ->  Q(s,a) = R(s,a)")
    elif mode == "value_iteration":
        V, Q, iterations, _ = value_iteration(mdp)
        steps.append(f"Value iteration converged after {iterations} Bellman updates (gamma={mdp.gamma})")
    else:
        raise ValueError("mode must be 'one_step' or 'value_iteration'")

    for s in STATES:
        steps.append(f"  V({s}) = {V[s]:.3f}   Q({s},fly) = {Q[(s,'fly')]:.3f}   "
                     f"Q({s},wait) = {Q[(s,'wait')]:.3f}")

    b = belief_windy
    q_belief = {a: b * Q[("windy", a)] + (1 - b) * Q[("calm", a)] for a in ACTIONS}
    for a in ACTIONS:
        steps.append(f"  Q_b({a}) = {b:.3f}*{Q[('windy',a)]:.3f} + {1-b:.3f}*{Q[('calm',a)]:.3f}"
                     f" = {q_belief[a]:.3f}")

    action = max(ACTIONS, key=lambda a: q_belief[a])
    steps.append(f"  Decision: {action.upper()} (larger expected value)")

    return MDPResult(V, Q, iterations, b, q_belief, action, steps)


def fly_threshold(mdp: DroneMDP, mode: str = "value_iteration") -> float:
    """Belief P(windy) at which Fly and Wait have equal value (fly if belief below it)."""
    r = decide(mdp, 0.0, mode)
    Q = r.Q
    # Q_b(fly) - Q_b(wait) is linear in b:  d0 + b * (d1 - d0)
    d0 = Q[("calm", "fly")] - Q[("calm", "wait")]
    d1 = Q[("windy", "fly")] - Q[("windy", "wait")]
    if d0 == d1:
        return 1.0 if d0 > 0 else 0.0
    return min(1.0, max(0.0, d0 / (d0 - d1)))
