"""The integrated mission: Bayes -> MDP -> A*.

1. Bayes   : sensor reading  -> P(strong wind)
2. MDP     : P(strong wind)  -> FLY or WAIT
3. A*      : P(strong wind)  -> safest-cheapest route (exposed cells cost more when windy)
             The route is executed only if the MDP said FLY; otherwise it is shown as a preview.
"""

from dataclasses import dataclass

from .astar import AStarResult, GridMap, astar
from .bayes import BayesResult, wind_posterior
from .mdp import DroneMDP, MDPResult, decide


@dataclass
class MissionResult:
    bayes: BayesResult
    mdp: MDPResult
    route: AStarResult

    @property
    def action(self) -> str:
        return self.mdp.action

    def summary(self) -> str:
        r = self.route
        route_txt = f"{len(r.path) - 1} moves, {r.exposed_cells_on_path} exposed cells" if r.path else "no route"
        status = "EXECUTE route" if self.action == "fly" else "HOLD at depot (route is a preview)"
        return (f"P(strong wind) = {self.bayes.posterior:.3f} | action = {self.action.upper()} | "
                f"route: {route_txt} | {status}")


def run_mission(prior_strong: float = 0.3,
                alert: bool = True,
                p_alert_given_strong: float = 0.8,
                p_alert_given_calm: float = 0.2,
                mdp: DroneMDP = None,
                mdp_mode: str = "value_iteration",
                grid: GridMap = None,
                wind_penalty: float = 25.0) -> MissionResult:
    mdp = mdp or DroneMDP()
    grid = grid or GridMap()

    bayes = wind_posterior(prior_strong, alert, p_alert_given_strong, p_alert_given_calm)
    decision = decide(mdp, bayes.posterior, mdp_mode)
    route = astar(grid, bayes.posterior, wind_penalty)
    return MissionResult(bayes, decision, route)
