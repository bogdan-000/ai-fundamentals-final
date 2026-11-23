"""Tests for the web server: the JSON API must return exactly what the drone/ package computes."""

import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

import server
from drone import run_mission


def test_payload_matches_engine():
    d = server.build_payload({"prior": ["0.3"], "alert": ["1"]})
    m = run_mission(0.3, True)
    assert d["bayes"]["posterior"] == pytest.approx(m.bayes.posterior)
    assert d["mdp"]["action"] == m.action
    assert [tuple(c) for c in d["route"]["path"]] == m.route.path
    assert len(d["route"]["trace"]) == len(m.route.expanded)
    assert len(d["sensitivity"]) == 21


def test_payload_presets():
    assert server.build_payload({"prior": ["0.1"], "alert": ["0"]})["route"]["exposed_cells"] == 2
    assert server.build_payload({"prior": ["0.3"], "alert": ["0"]})["mdp"]["action"] == "fly"


def test_payload_rejects_bad_input():
    with pytest.raises(ValueError):
        server.build_payload({"prior": ["1.7"]})


@pytest.fixture(scope="module")
def base_url():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def test_http_api_and_page(base_url):
    with urllib.request.urlopen(base_url + "/api/mission?prior=0.3&alert=1") as r:
        assert json.load(r)["mdp"]["action"] == "wait"
    with urllib.request.urlopen(base_url + "/") as r:
        assert b"Drone Parcel Route" in r.read()


def test_http_bad_input_is_400(base_url):
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(base_url + "/api/mission?prior=abc")
    assert e.value.code == 400


def test_http_cannot_escape_web_folder(base_url):
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(base_url + "/../server.py")
    assert e.value.code == 404
