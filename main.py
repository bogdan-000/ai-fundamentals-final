"""Console demo: shows input -> key steps -> output for all three algorithms.

Usage:
    python main.py                       # three preset scenarios
    python main.py --prior 0.3 --alert   # custom scenario
    python main.py --prior 0.3 --no-alert --mode one_step
"""

import argparse

from drone import GridMap, render_ascii, run_mission

SCENARIOS = [
    ("A. Calm morning (prior 0.10, no alert)", 0.10, False),
    ("B. Uncertain day (prior 0.30, no alert)", 0.30, False),
    ("C. Storm warning (prior 0.30, ALERT)", 0.30, True),
]


def show(title, prior, alert, mode, penalty):
    grid = GridMap()
    res = run_mission(prior_strong=prior, alert=alert, mdp_mode=mode, grid=grid, wind_penalty=penalty)
    print("=" * 72)
    print(title)
    print("=" * 72)

    print("\n[1] BAYESIAN INFERENCE — how likely is strong wind?")
    for s in res.bayes.steps:
        print("   ", s)
    print(f"    => One sensor reading moved P(strong) from {prior:.2f} to {res.bayes.posterior:.3f}.")

    print("\n[2] MDP — fly now or wait?")
    for s in res.mdp.steps:
        print("   ", s)
    print(f"    => Under the current belief, {res.action.upper()} has the higher expected value.")

    print("\n[3] A* SEARCH — which route?")
    for s in res.route.steps:
        print("   ", s)
    print()
    print("    " + render_ascii(grid, res.route.path).replace("\n", "\n    "))
    print("    (S depot, G customer, # building, ~ open field, * route)")
    print(f"    => A* found the lowest-cost route given the wind risk on open-field cells.")

    print("\nRESULT:", res.summary(), "\n")


def main():
    ap = argparse.ArgumentParser(description="Mini Drone Parcel Route demo")
    ap.add_argument("--prior", type=float, help="P(strong wind) before the sensor reading")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--alert", dest="alert", action="store_true", help="sensor raised a wind alert")
    g.add_argument("--no-alert", dest="alert", action="store_false", help="sensor reported no alert")
    ap.set_defaults(alert=True)
    ap.add_argument("--mode", choices=["value_iteration", "one_step"], default="value_iteration")
    ap.add_argument("--penalty", type=float, default=25.0, help="wind penalty for exposed cells")
    args = ap.parse_args()

    if args.prior is None:
        for title, prior, alert in SCENARIOS:
            show(title, prior, alert, args.mode, args.penalty)
    else:
        show(f"Custom (prior {args.prior}, {'ALERT' if args.alert else 'no alert'})",
             args.prior, args.alert, args.mode, args.penalty)


if __name__ == "__main__":
    main()
