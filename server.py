"""Web UI server — Python standard library only (no Flask, no Streamlit).

    python server.py            -> opens http://localhost:8000 in the browser

Serves the static page in web/ and one JSON endpoint:
    GET /api/mission?prior=0.3&alert=1&...
The page never re-implements the algorithms: every number comes from the drone/ package.
"""

import argparse
import json
import subprocess
import sys
import time
import mimetypes
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from drone import DroneMDP, GridMap, fly_threshold, run_mission, value_iteration

WEB_DIR = Path(__file__).parent / "web"

DEFAULTS = {
    "prior": 0.30, "alert": 1, "hit": 0.80, "fa": 0.20,
    "mode": "value_iteration", "penalty": 25.0,
    "r_cf": 10.0, "r_wf": -20.0, "r_cw": -2.0, "r_ww": -1.0,
    "p_cc": 0.8, "p_ww": 0.6, "gamma": 0.9,
}


def _params(query: dict) -> dict:
    p = dict(DEFAULTS)
    for key, default in DEFAULTS.items():
        if key in query:
            raw = query[key][0] if isinstance(query[key], list) else query[key]
            p[key] = raw if isinstance(default, str) else float(raw)
    p["alert"] = bool(int(p["alert"]))
    return p


def build_payload(query: dict) -> dict:
    """Run the whole mission and return everything the page needs as JSON-ready data."""
    p = _params(query)
    mdp = DroneMDP(
        rewards={("calm", "fly"): p["r_cf"], ("windy", "fly"): p["r_wf"],
                 ("calm", "wait"): p["r_cw"], ("windy", "wait"): p["r_ww"]},
        transitions={"calm": {"calm": p["p_cc"], "windy": 1 - p["p_cc"]},
                     "windy": {"calm": 1 - p["p_ww"], "windy": p["p_ww"]}},
        gamma=p["gamma"],
    )
    grid = GridMap()
    args = (p["hit"], p["fa"], mdp, p["mode"], grid, p["penalty"])
    res = run_mission(p["prior"], p["alert"], *args)

    sensitivity = []
    for i in range(21):
        prior = i / 20
        row = {"prior": prior}
        for alert in (True, False):
            m = run_mission(prior, alert, *args)
            key = "alert" if alert else "no_alert"
            row[key] = {"posterior": m.bayes.posterior, "action": m.action,
                        "moves": len(m.route.path) - 1 if m.route.path else None}
        sensitivity.append(row)

    b, d, r = res.bayes, res.mdp, res.route
    _, _, _, vi_history = value_iteration(mdp)
    return {
        "params": {**p, "alert": int(p["alert"])},
        "grid": {"rows": grid.rows, "cols": grid.cols, "start": grid.start, "goal": grid.goal,
                 "obstacles": sorted(grid.obstacles), "exposed": sorted(grid.exposed)},
        "bayes": {"prior": b.prior, "observation": b.observation,
                  "likelihood_strong": b.likelihood_strong, "likelihood_calm": b.likelihood_calm,
                  "evidence": b.evidence, "posterior": b.posterior, "steps": b.steps},
        "mdp": {"V": d.V, "Q": {f"{s},{a}": v for (s, a), v in d.Q.items()},
                "q_belief": d.q_belief, "action": d.action, "iterations": d.iterations,
                "threshold": fly_threshold(mdp, p["mode"]), "steps": d.steps,
                "history": vi_history[:60]},
        "route": {"path": r.path, "cost": r.cost if r.path else None, "expanded": r.expanded,
                  "exposed_cells": r.exposed_cells_on_path, "steps": r.steps, "trace": r.trace},
        "sensitivity": sensitivity,
    }


def run_tests() -> dict:
    """Run the pytest suite and return its output (used by the 'Run tests' button)."""
    t0 = time.time()
    try:
        proc = subprocess.run([sys.executable, "-m", "pytest", "-v", "-p", "no:cacheprovider"],
                              cwd=Path(__file__).parent, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return {"ok": False, "summary": "timed out", "output": "", "seconds": 120}
    out = proc.stdout + proc.stderr
    if "No module named pytest" in out:
        return {"ok": False, "summary": "pytest is not installed — run: pip install pytest",
                "output": out, "seconds": time.time() - t0}
    passed = out.count(" PASSED")
    failed = out.count(" FAILED") + out.count(" ERROR")
    lines = [ln for ln in out.strip().splitlines() if ln.strip()]
    return {"ok": proc.returncode == 0, "passed": passed, "failed": failed,
            "summary": lines[-1].strip("= ") if lines else "", "output": out,
            "seconds": round(time.time() - t0, 2)}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/mission":
            try:
                data = build_payload(parse_qs(url.query))
                self._send(200, json.dumps(data).encode(), "application/json")
            except (ValueError, KeyError) as e:
                self._send(400, json.dumps({"error": str(e)}).encode(), "application/json")
            return

        if url.path == "/api/tests":
            self._send(200, json.dumps(run_tests()).encode(), "application/json")
            return

        rel = "index.html" if url.path in ("", "/") else url.path.lstrip("/")
        file = (WEB_DIR / rel).resolve()
        if WEB_DIR.resolve() not in file.parents or not file.is_file():
            self._send(404, b"Not found", "text/plain")
            return
        ctype = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        self._send(200, file.read_bytes(), ctype)

    def log_message(self, fmt, *args):  # keep the console clean
        pass


def main():
    ap = argparse.ArgumentParser(description="Mini Drone Parcel Route — web UI")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()

    server = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    url = f"http://localhost:{a.port}"
    print(f"Mini Drone Parcel Route running at {url}   (Ctrl+C to stop)")
    if not a.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
