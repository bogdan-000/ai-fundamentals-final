"""Streamlit UI.   Run:  streamlit run app.py"""

import streamlit as st

from drone import DroneMDP, GridMap, fly_threshold, run_mission

st.set_page_config(page_title="Mini Drone Parcel Route", page_icon="🛩️", layout="wide")

st.title("🛩️ Mini Drone Parcel Route")
st.caption("A* search  •  Bayesian inference  •  Markov Decision Process — one delivery decision")

# ------------------------------------------------------------------ sidebar inputs
with st.sidebar:
    st.header("Scenario")
    preset = st.radio("Preset", ["Custom", "A. Calm morning", "B. Uncertain day", "C. Storm warning"])
    presets = {"A. Calm morning": (0.10, False), "B. Uncertain day": (0.30, False),
               "C. Storm warning": (0.30, True)}
    d_prior, d_alert = presets.get(preset, (0.30, True))
    locked = preset != "Custom"

    st.subheader("1 · Wind sensor (Bayes)")
    prior = st.slider("Prior P(strong wind)", 0.0, 1.0, d_prior, 0.01, disabled=locked)
    alert = st.toggle("Sensor raised a wind ALERT", d_alert, disabled=locked)
    hit = st.slider("Sensor hit rate P(alert | strong)", 0.5, 1.0, 0.8, 0.01)
    fa = st.slider("False alarm rate P(alert | calm)", 0.0, 0.5, 0.2, 0.01)

    st.subheader("2 · Decision model (MDP)")
    mode = st.radio("Solver", ["value_iteration", "one_step"],
                    format_func=lambda m: "Value iteration" if m == "value_iteration" else "One Bellman update")
    with st.expander("Rewards & transitions"):
        r_cf = st.number_input("R(calm, fly)", value=10.0)
        r_wf = st.number_input("R(windy, fly)", value=-20.0)
        r_cw = st.number_input("R(calm, wait)", value=-2.0)
        r_ww = st.number_input("R(windy, wait)", value=-1.0)
        p_cc = st.slider("P(calm → calm)", 0.0, 1.0, 0.8, 0.05)
        p_ww = st.slider("P(windy → windy)", 0.0, 1.0, 0.6, 0.05)
        gamma = st.slider("Discount γ", 0.0, 0.99, 0.9, 0.01)

    st.subheader("3 · Route planner (A*)")
    penalty = st.slider("Wind penalty on open-field cells", 0.0, 60.0, 25.0, 1.0)

mdp = DroneMDP(
    rewards={("calm", "fly"): r_cf, ("windy", "fly"): r_wf,
             ("calm", "wait"): r_cw, ("windy", "wait"): r_ww},
    transitions={"calm": {"calm": p_cc, "windy": 1 - p_cc},
                 "windy": {"calm": 1 - p_ww, "windy": p_ww}},
    gamma=gamma,
)
grid = GridMap()

try:
    res = run_mission(prior, alert, hit, fa, mdp, mode, grid, penalty)
except ValueError as e:
    st.error(f"Invalid input: {e}")
    st.stop()

# ------------------------------------------------------------------ headline
fly = res.action == "fly"
c1, c2, c3 = st.columns(3)
c1.metric("P(strong wind)", f"{res.bayes.posterior:.1%}", f"{res.bayes.posterior - prior:+.1%} vs prior",
          delta_color="inverse")
c2.metric("Decision", "✈️ FLY" if fly else "⏸️ WAIT")
c2.caption(f"Fly only if P(strong wind) < {fly_threshold(mdp, mode):.1%}")
if res.route.path:
    c3.metric("Route", f"{len(res.route.path) - 1} moves")
    c3.caption(f"{res.route.exposed_cells_on_path} open-field cells · cost {res.route.cost:.2f}")
else:
    c3.metric("Route", "none")

if fly:
    st.success("Drone departs and follows the route below.")
else:
    st.warning("Drone holds at the depot. The route below is a preview for when the wind drops.")

# ------------------------------------------------------------------ grid
def grid_html(g: GridMap, path, expanded):
    order = {c: i for i, c in enumerate(path or [])}
    exp = set(expanded)
    cells = []
    for r in range(g.rows):
        for c in range(g.cols):
            cell = (r, c)
            bg, label, fg = "#f4f4f5", "", "#71717a"
            if cell in g.exposed:
                bg, label = "#dbeafe", "≋"
            if cell in exp:
                bg = "#fef9c3" if cell not in g.exposed else "#bfdbfe"
            if cell in order:
                bg, fg, label = ("#22c55e" if fly else "#a3a3a3"), "white", str(order[cell])
            if cell in g.obstacles:
                bg, label, fg = "#3f3f46", "🏢", "white"
            if cell == g.start:
                bg, label, fg = "#2563eb", "📦", "white"
            if cell == g.goal:
                bg, label, fg = "#dc2626", "🏠", "white"
            cells.append(f'<div style="background:{bg};color:{fg};display:flex;align-items:center;'
                         f'justify-content:center;border-radius:6px;font:600 15px sans-serif;'
                         f'aspect-ratio:1">{label}</div>')
    return (f'<div style="display:grid;grid-template-columns:repeat({g.cols},1fr);gap:4px;'
            f'max-width:420px">{"".join(cells)}</div>')


left, right = st.columns([1, 1])
with left:
    st.subheader("Map")
    st.markdown(grid_html(grid, res.route.path, res.route.expanded), unsafe_allow_html=True)
    st.caption("📦 depot · 🏠 customer · 🏢 building · ≋ open field (wind-exposed) · "
               "yellow = expanded by A* · numbers = route order")
with right:
    st.subheader("How each algorithm decided")
    t1, t2, t3 = st.tabs(["① Bayes", "② MDP", "③ A*"])
    with t1:
        st.code("\n".join(res.bayes.steps), language=None)
        st.write("One sensor reading updates the belief about strong wind using Bayes' rule.")
    with t2:
        st.code("\n".join(res.mdp.steps), language=None)
        st.write("Expected value of each action under the current belief; the larger one wins.")
    with t3:
        st.code("\n".join(res.route.steps), language=None)
        st.write(f"A* expanded {len(res.route.expanded)} cells. Open-field cells get more "
                 "expensive as wind probability rises, so the route can detour around them.")

with st.expander("Sensitivity: decision vs. prior"):
    rows = []
    for p in [i / 20 for i in range(21)]:
        for a in (True, False):
            m = run_mission(p, a, hit, fa, mdp, mode, grid, penalty)
            rows.append({"prior": p, "sensor": "alert" if a else "no alert",
                         "P(strong|e)": round(m.bayes.posterior, 3), "action": m.action,
                         "moves": len(m.route.path) - 1 if m.route.path else None})
    st.dataframe(rows, width="stretch", hide_index=True)
