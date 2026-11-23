"""Unit + integration tests. Run:  pytest -v"""

import pytest

from drone import DroneMDP, GridMap, astar, decide, fly_threshold, run_mission, value_iteration, wind_posterior
from drone.astar import manhattan


# ---------------------------------------------------------------- Bayes
def test_bayes_alert_hand_calculation():
    # 0.8*0.3 / (0.8*0.3 + 0.2*0.7) = 0.24 / 0.38
    r = wind_posterior(0.3, alert=True)
    assert r.posterior == pytest.approx(0.24 / 0.38)
    assert r.evidence == pytest.approx(0.38)


def test_bayes_no_alert_hand_calculation():
    # 0.2*0.3 / (0.2*0.3 + 0.8*0.7) = 0.06 / 0.62
    r = wind_posterior(0.3, alert=False)
    assert r.posterior == pytest.approx(0.06 / 0.62)


def test_alert_raises_and_silence_lowers_belief():
    for prior in (0.05, 0.3, 0.5, 0.9):
        assert wind_posterior(prior, True).posterior > prior
        assert wind_posterior(prior, False).posterior < prior


def test_useless_sensor_does_not_change_belief():
    r = wind_posterior(0.4, True, p_alert_given_strong=0.5, p_alert_given_calm=0.5)
    assert r.posterior == pytest.approx(0.4)


def test_certain_prior_stays_certain():
    assert wind_posterior(0.0, True).posterior == 0.0
    assert wind_posterior(1.0, False).posterior == 1.0


@pytest.mark.parametrize("bad", [-0.1, 1.5])
def test_bayes_rejects_invalid_probability(bad):
    with pytest.raises(ValueError):
        wind_posterior(bad, True)


# ---------------------------------------------------------------- MDP
def test_one_step_equals_immediate_reward():
    r = decide(DroneMDP(), 0.0, mode="one_step")
    assert r.Q[("calm", "fly")] == 10.0
    assert r.Q[("windy", "wait")] == -1.0
    assert r.action == "fly"


def test_value_iteration_matches_closed_form():
    # V(calm)=10 (fly). V(windy) = -1 + 0.9*(0.4*10 + 0.6*V)  ->  V = 2.6/0.46
    V, Q, iters, _ = value_iteration(DroneMDP())
    assert V["calm"] == pytest.approx(10.0, abs=1e-4)
    assert V["windy"] == pytest.approx(2.6 / 0.46, abs=1e-4)
    assert iters > 1


def test_mdp_policy_extremes():
    mdp = DroneMDP()
    assert decide(mdp, 0.0).action == "fly"
    assert decide(mdp, 1.0).action == "wait"


def test_threshold_separates_decisions():
    mdp = DroneMDP()
    t = fly_threshold(mdp)
    assert 0 < t < 1
    assert decide(mdp, t - 0.01).action == "fly"
    assert decide(mdp, t + 0.01).action == "wait"


def test_invalid_transition_table_rejected():
    mdp = DroneMDP(transitions={"calm": {"calm": 0.5, "windy": 0.2},
                                "windy": {"calm": 0.4, "windy": 0.6}})
    with pytest.raises(ValueError):
        decide(mdp, 0.5)


# ---------------------------------------------------------------- A*
def test_astar_shortest_path_when_calm():
    r = astar(GridMap(), p_wind=0.0)
    assert r.path[0] == (0, 0) and r.path[-1] == (0, 5)
    assert len(r.path) - 1 == 11          # hand-checked optimum around the building
    assert r.cost == pytest.approx(11.0)


def test_astar_avoids_obstacles_and_moves_one_step():
    g = GridMap()
    r = astar(g, p_wind=0.5)
    assert not set(r.path) & g.obstacles
    for a, b in zip(r.path, r.path[1:]):
        assert manhattan(a, b) == 1


def test_astar_detours_when_windy():
    r = astar(GridMap(), p_wind=0.5, wind_penalty=25)
    assert r.exposed_cells_on_path == 0
    assert len(r.path) - 1 == 15


def test_astar_no_route():
    g = GridMap(obstacles=frozenset({(0, 1), (1, 0)}))
    assert astar(g).path is None


def test_astar_matches_bfs_on_uniform_costs():
    """With no wind, A* must give the same length as plain BFS (optimality check)."""
    from collections import deque
    g = GridMap()
    dist = {g.start: 0}
    q = deque([g.start])
    while q:
        c = q.popleft()
        for n in g.neighbors(c):
            if n not in dist:
                dist[n] = dist[c] + 1
                q.append(n)
    assert len(astar(g, 0.0).path) - 1 == dist[g.goal]


def test_astar_rejects_start_in_obstacle():
    with pytest.raises(ValueError):
        astar(GridMap(start=(0, 3)))


# ---------------------------------------------------------------- Integration
def test_scenario_calm_flies_short_route():
    m = run_mission(prior_strong=0.10, alert=False)
    assert m.action == "fly"
    assert m.route.exposed_cells_on_path == 2


def test_scenario_uncertain_flies_safe_route():
    m = run_mission(prior_strong=0.30, alert=False)
    assert m.action == "fly"
    assert m.route.exposed_cells_on_path == 0


def test_scenario_storm_waits():
    m = run_mission(prior_strong=0.30, alert=True)
    assert m.bayes.posterior == pytest.approx(0.6316, abs=1e-3)
    assert m.action == "wait"
