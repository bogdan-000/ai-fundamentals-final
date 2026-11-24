/* Drone Parcel Route — page logic.
   Every number shown here comes from the Python engine (GET /api/mission).
   This file only draws: it never re-implements Bayes, the MDP or A*. */
(function () {
  'use strict';

  const DEFAULTS = {
    prior: 0.30, alert: 1, hit: 0.80, fa: 0.20, mode: 'value_iteration', penalty: 25,
    r_cf: 10, r_wf: -20, r_cw: -2, r_ww: -1, p_cc: 0.8, p_ww: 0.6, gamma: 0.9,
  };
  const PRESETS = {
    A: { name: 'A · Calm morning', prior: 0.10, alert: 0 },
    B: { name: 'B · Uncertain day', prior: 0.30, alert: 0 },
    C: { name: 'C · Storm warning', prior: 0.30, alert: 1 },
  };

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const key = (c) => c[0] + ',' + c[1];
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
  const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let P = { ...DEFAULTS };
  let D = null;               // last payload from the engine
  let reqId = 0;
  let timer = null;
  let firstLoad = true;

  /* ================= inputs ================= */
  function syncInputs() {
    $$('[data-p]').forEach((inp) => {
      if (document.activeElement !== inp) inp.value = P[inp.dataset.p];
    });
    $$('[data-seg]').forEach((seg) => {
      const k = seg.dataset.seg;
      $$('button', seg).forEach((b) => b.classList.toggle('on', String(P[k]) === b.dataset.v));
    });
    const which = currentPreset();
    $$('#presets button').forEach((b) => b.classList.toggle('on', b.dataset.preset === which));
    $('#scenario-name').textContent = which === 'custom' ? 'Custom scenario' : PRESETS[which].name;
  }

  function currentPreset() {
    for (const [id, pr] of Object.entries(PRESETS)) {
      const same = Object.keys(DEFAULTS).every((k) => {
        const want = k in pr ? pr[k] : DEFAULTS[k];
        return String(P[k]) === String(want) || Number(P[k]) === Number(want);
      });
      if (same) return id;
    }
    return 'custom';
  }

  function schedule(animate) {
    clearTimeout(timer);
    timer = setTimeout(() => load(animate), 140);
  }

  $$('[data-p]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const v = parseFloat(String(inp.value).replace(',', '.'));
      if (isNaN(v)) return;
      P[inp.dataset.p] = v;
      $$('[data-p="' + inp.dataset.p + '"]').forEach((o) => { if (o !== inp) o.value = v; });
      syncInputs();
      schedule(false);
    });
  });

  $$('[data-seg]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = seg.dataset.seg;
      P[k] = k === 'alert' ? Number(b.dataset.v) : b.dataset.v;
      syncInputs();
      schedule(seg.closest('#mission') != null);
    });
  });

  $('#presets').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.dataset.preset;
    if (id === 'custom') return;
    P = { ...DEFAULTS, ...PRESETS[id], mode: P.mode };
    delete P.name;
    syncInputs();
    schedule(true);
  });

  $$('[data-reset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const box = btn.closest('.calc');
      $$('[data-p]', box).forEach((inp) => { P[inp.dataset.p] = DEFAULTS[inp.dataset.p]; });
      if ($('[data-seg="alert"]', box)) P.alert = DEFAULTS.alert;
      syncInputs();
      schedule(false);
    });
  });

  /* ================= engine ================= */
  async function load(animateMission) {
    const id = ++reqId;
    const qs = new URLSearchParams(Object.entries(P).map(([k, v]) => [k, String(v)]));
    try {
      const res = await fetch('/api/mission?' + qs, { cache: 'no-store' });
      const data = await res.json();
      if (id !== reqId) return;                       // a newer request is on its way
      if (!res.ok) { showInputError(data.error || 'invalid input'); return; }
      showInputError(null);
      setStatus(true);
      D = data;
      renderAll(animateMission || firstLoad);
      firstLoad = false;
    } catch (err) {
      if (id !== reqId) return;
      setStatus(false);
    }
  }

  function setStatus(ok) {
    const st = $('#status');
    st.classList.toggle('ok', ok);
    st.classList.toggle('bad', !ok);
    $('span', st).textContent = ok ? 'Python engine online · numbers computed by drone/' : 'Python engine offline';
    let box = $('#offline');
    if (!ok && !box) {
      box = document.createElement('div');
      box.id = 'offline'; box.className = 'offline';
      box.innerHTML = 'This page needs the Python engine. In the project folder run:<pre>python server.py</pre>' +
        'then open <b>http://localhost:8000</b> (opening the HTML file directly will not work).';
      $('.bookhead').appendChild(box);
    } else if (ok && box) box.remove();
  }

  function showInputError(msg) {
    let el = $('#input-error');
    if (!msg) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('p'); el.id = 'input-error'; el.className = 'verdict';
      $('#verdict').after(el);
    }
    el.textContent = '⚠ ' + msg;
  }

  /* ================= number outputs ================= */
  function setOut(name, value, format) {
    $$('[data-out="' + name + '"]').forEach((el) => {
      if (typeof value !== 'number') { el.textContent = value; return; }
      const from = parseFloat(el.dataset.v);
      el.dataset.v = value;
      if (reduce || isNaN(from) || from === value) { el.textContent = format(value); return; }
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      const t0 = performance.now(), dur = 520;
      (function step(now) {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = format(from + (value - from) * e);
        if (k < 1 && el.dataset.v == value) requestAnimationFrame(step);
        else if (el.dataset.v == value) el.textContent = format(value);
      })(t0);
    });
  }

  function renderAll(animateMission) {
    const b = D.bayes, m = D.mdp, r = D.route;
    const fly = m.action === 'fly';
    setOut('posterior', b.posterior, pct);
    setOut('action', fly ? 'FLY' : 'WAIT');
    setOut('moves', r.path ? (r.path.length - 1) + ' moves' : 'none');
    setOut('cost', r.path ? r.cost : '—', f2);

    const thr = pct(m.threshold);
    const moves = r.path ? r.path.length - 1 : 0;
    const routeTxt = r.exposed_cells > 0
      ? `the ${moves}-move shortcut across the open field`
      : `the ${moves}-move detour around the open field`;
    $('#verdict').innerHTML = fly
      ? `<b>Fly.</b> P(strong wind) = ${pct(b.posterior)} is below the ${thr} threshold, so the drone departs and A* sends it along ${routeTxt}.`
      : `<b>Wait.</b> P(strong wind) = ${pct(b.posterior)} is above the ${thr} threshold, so the drone holds at the depot. The route on the map (${routeTxt}) is only a preview.`;

    renderMission(animateMission);
    renderBayes();
    renderMDP();
    renderAstar();
    renderFlow();
    renderSensitivity();
    renderScenarios();
  }

  /* ================= grids ================= */
  function buildGrid(el) {
    const g = D.grid;
    if (el.children.length === g.rows * g.cols) return;
    el.style.gridTemplateColumns = `repeat(${g.cols},1fr)`;
    el.innerHTML = '';
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const d = document.createElement('div');
      d.className = 'cell'; d.dataset.k = r + ',' + c;
      d.title = `(${r}, ${c})`;
      el.appendChild(d);
    }
  }

  function paintBase(el) {
    const g = D.grid;
    const walls = new Set(g.obstacles.map(key)), field = new Set(g.exposed.map(key));
    $$('.cell', el).forEach((d) => {
      const k = d.dataset.k;
      d.className = 'cell';
      d.textContent = '';
      if (k === key(g.start)) { d.classList.add('start'); d.textContent = 'S'; }
      else if (k === key(g.goal)) { d.classList.add('goal'); d.textContent = 'G'; }
      else if (walls.has(k)) d.classList.add('wall');
      else if (field.has(k)) { d.classList.add('field'); d.textContent = '≋'; }
    });
  }

  const cellAt = (el, c) => $('[data-k="' + key(c) + '"]', el);
  const plain = (d) => d && !d.classList.contains('start') && !d.classList.contains('goal');

  /* ---- mission map with replay ---- */
  let missionToken = 0;
  async function renderMission(animate) {
    const el = $('#mission-grid');
    buildGrid(el);
    const token = ++missionToken;
    const r = D.route, fly = D.mdp.action === 'fly';
    paintBase(el);
    const doAnim = animate && !reduce && isVisible(el);
    if (doAnim) $('#fly-btn').disabled = true;

    for (const c of r.expanded) {
      if (token !== missionToken) return;
      const d = cellAt(el, c);
      if (plain(d)) d.classList.add('visited');
      if (doAnim) await sleep(32);
    }
    if (!r.path) { $('#fly-btn').disabled = false; return; }
    for (let i = 1; i < r.path.length - 1; i++) {
      if (token !== missionToken) return;
      const d = cellAt(el, r.path[i]);
      d.classList.remove('visited');
      d.classList.add(fly ? 'path' : 'preview');
      d.textContent = i;
      if (doAnim) await sleep(55);
    }
    if (doAnim && fly) {                     // the drone flies the route
      for (const c of r.path) {
        if (token !== missionToken) return;
        $$('.drone', el).forEach((x) => x.classList.remove('drone'));
        cellAt(el, c).classList.add('drone');
        await sleep(120);
      }
      await sleep(400);
      $$('.drone', el).forEach((x) => x.classList.remove('drone'));
    }
    if (token === missionToken) $('#fly-btn').disabled = false;
  }
  $('#fly-btn').addEventListener('click', () => D && renderMission(true));

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && !$('#book').hidden;
  }

  /* ---- A* stepper ---- */
  let asK = 0, asTimer = null;
  function renderAstar() {
    stopPlay();
    asK = D.route.trace.length;             // show the finished search after an update
    drawAstar();
    const b = D.bayes.posterior, pen = D.params.penalty, fc = 1 + pen * b;
    $('#astar-caption').textContent = `field cell = 1 + ${pen} × ${f3(b)} = ${f2(fc)}`;
    setOut('fieldcost', fc, f2);
    setOut('expanded', D.route.expanded.length, (x) => String(Math.round(x)));
    setOut('movescost', D.route.path ? `${D.route.path.length - 1} · ${f2(D.route.cost)}` : 'no route');
    $('#astar-steps').textContent = D.route.steps.join('\n');
  }

  function drawAstar() {
    const el = $('#astar-grid');
    buildGrid(el);
    paintBase(el);
    const tr = D.route.trace, n = tr.length;
    for (let i = 0; i < asK; i++) { const d = cellAt(el, tr[i].cell); if (plain(d)) d.classList.add('visited'); }
    let cur = null;
    if (asK > 0 && asK <= n) {
      cur = tr[asK - 1];
      if (asK < n) cur.frontier.forEach((c) => { const d = cellAt(el, c); if (plain(d) && !d.classList.contains('visited')) d.classList.add('frontier'); });
      const d = cellAt(el, cur.cell);
      if (plain(d)) { d.classList.remove('visited'); d.classList.add('current'); }
    }
    if (asK === n && D.route.path) {
      D.route.path.slice(1, -1).forEach((c, i) => {
        const d = cellAt(el, c); d.className = 'cell path'; d.textContent = i + 1;
      });
    }
    const stats = $('#astar-stats');
    const done = asK === n;
    stats.innerHTML = [
      `<span class="stat">step <b>${asK}</b> / ${n}</span>`,
      cur ? `<span class="stat">node <b>(${cur.cell[0]}, ${cur.cell[1]})</b></span>` : '',
      cur ? `<span class="stat">g <b>${f2(cur.g)}</b></span><span class="stat">h <b>${cur.h}</b></span><span class="stat">f <b>${f2(cur.f)}</b></span>` : '',
      done && D.route.path ? `<span class="stat">route <b>${D.route.path.length - 1} moves · cost ${f2(D.route.cost)}</b></span>` : '',
    ].join('');
    const fr = $('#astar-frontier');
    if (!cur) fr.innerHTML = 'Press <b>step</b> to expand the start node. A* always picks the frontier node with the smallest f = g + h.';
    else if (done) fr.innerHTML = `Goal reached. A* expanded <b>${n}</b> of ${D.grid.rows * D.grid.cols - D.grid.obstacles.length} free cells.`;
    else fr.innerHTML = `<b>frontier (${cur.frontier.length})</b><br>` + cur.frontier.map((c) => `<span class="chip">${c[0]},${c[1]}</span>`).join('');
  }

  function stopPlay() { clearInterval(asTimer); asTimer = null; $('#as-play').textContent = '▶ play'; }
  $('#as-reset').addEventListener('click', () => { stopPlay(); asK = 0; drawAstar(); });
  $('#as-step').addEventListener('click', () => { stopPlay(); if (!D) return; asK = asK >= D.route.trace.length ? 1 : asK + 1; drawAstar(); });
  $('#as-play').addEventListener('click', () => {
    if (!D) return;
    if (asTimer) { stopPlay(); return; }
    if (asK >= D.route.trace.length) asK = 0;
    $('#as-play').textContent = '❚❚ pause';
    const tick = () => {
      asK++; drawAstar();
      if (asK >= D.route.trace.length) stopPlay();
    };
    tick();
    asTimer = setInterval(tick, 660 - Number($('#as-speed').value));
  });
  $('#as-speed').addEventListener('input', () => { if (asTimer) { stopPlay(); $('#as-play').click(); } });

  /* ================= Bayes ================= */
  function renderBayes() {
    const b = D.bayes, p = D.params;
    const alert = b.observation === 'alert';
    const windy = Math.round(b.prior * 100), calm = 100 - windy;
    const alW = Math.round(windy * p.hit), alC = Math.round(calm * p.fa);
    const dots = $('#dots');
    if (dots.children.length !== 100) { dots.innerHTML = ''; for (let i = 0; i < 100; i++) dots.appendChild(document.createElement('i')); }
    let ringed = 0, ringedWindy = 0;
    Array.from(dots.children).forEach((d, i) => {
      const isW = i < windy;
      const alerted = isW ? i < alW : (i - windy) < alC;
      const ring = alert ? alerted : !alerted;
      d.className = (isW ? 'h' : '') + (ring ? ' al' : '');
      if (ring) { ringed++; if (isW) ringedWindy++; }
    });
    $('#dots-caption').textContent = ringed
      ? `${ringedWindy} of ${ringed} ${alert ? 'alert' : 'quiet'} days are windy ≈ ${pct(ringedWindy / ringed)}`
      : 'no matching days';

    const cols = [
      ['before', 'P(strong)', b.prior, 'pred'],
      ['after', `P(strong | ${alert ? 'alert' : 'quiet'})`, b.posterior, ''],
      ['after', `P(calm | ${alert ? 'alert' : 'quiet'})`, 1 - b.posterior, 'light'],
    ];
    drawBars($('#bayes-bars'), cols.map(([top, lbl, v, cls]) => ({ top: pct(v), label: lbl, h: v, cls })));

    const js = b.likelihood_strong * b.prior;
    setOut('joint_s', js, f3);
    setOut('evidence', b.evidence, f3);
    $('#bayes-steps').textContent = b.steps.join('\n');
  }

  function drawBars(el, items) {
    el.style.setProperty('--n', items.length);
    if (el.children.length !== items.length) {
      el.innerHTML = items.map(() =>
        '<div class="barcol"><div class="barwrap"><div class="bar"></div></div><b></b><small></small></div>').join('');
    }
    items.forEach((it, i) => {
      const col = el.children[i];
      const bar = $('.bar', col);
      bar.className = 'bar ' + (it.cls || '');
      bar.style.height = Math.max(2, it.h * 100) + '%';
      $('b', col).textContent = it.top;
      $('small', col).textContent = it.label;
    });
  }

  /* ================= MDP ================= */
  function renderMDP() {
    const m = D.mdp, Q = m.Q;
    const best = (s) => (Q[s + ',fly'] >= Q[s + ',wait'] ? 'fly' : 'wait');
    let html = '<div></div><div class="hd">fly</div><div class="hd">wait</div>';
    for (const s of ['calm', 'windy']) {
      html += `<div class="hd l">${s}</div>`;
      for (const a of ['fly', 'wait']) {
        const on = best(s) === a;
        html += `<div class="mcell${on ? ' term' : ''}"><span class="nm">Q(${s},${a})</span>` +
          `<span class="val">${f2(Q[s + ',' + a])}</span><span class="arr">${on ? '★ best' : ''}</span></div>`;
      }
      html += `<div></div><div class="vcol">V(${s}) = ${f3(m.V[s])}</div>`;
    }
    $('#qtable').innerHTML = html;

    const qf = m.q_belief.fly, qw = m.q_belief.wait;
    const mx = Math.max(Math.abs(qf), Math.abs(qw), 1e-9);
    drawBars($('#qb-bars'), [
      { top: f2(qf), label: 'Q_b(fly)', h: Math.abs(qf) / mx, cls: m.action === 'fly' ? '' : (qf < 0 ? 'pred' : 'light') },
      { top: f2(qw), label: 'Q_b(wait)', h: Math.abs(qw) / mx, cls: m.action === 'wait' ? '' : (qw < 0 ? 'pred' : 'light') },
    ]);
    $('#mdp-caption').textContent = `b = P(windy) = ${pct(D.bayes.posterior)} → ${m.action.toUpperCase()}`;
    setOut('qfly', qf, f2); setOut('qwait', qw, f2); setOut('threshold', m.threshold, pct);
    $('#mdp-steps').textContent = m.steps.join('\n');
    drawVI(m.history);
  }

  function drawVI(hist) {
    const svg = $('#vi-chart'), W = 320, H = 180, L = 34, R = 10, T = 10, B = 24;
    const vals = hist.flatMap((h) => [h.calm, h.windy]);
    let lo = Math.min(0, ...vals), hi = Math.max(...vals, 1);
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const n = hist.length - 1 || 1;
    const x = (i) => L + (i / n) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const line = (s) => hist.map((h, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(h[s]).toFixed(1)).join(' ');
    let g = `<line class="ax" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/><line class="ax" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/>`;
    [lo + pad, (lo + hi) / 2, hi - pad].forEach((v) => { g += `<text class="tick" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v.toFixed(1)}</text>`; });
    g += `<text class="tick" x="${L}" y="${H - 6}">0</text><text class="tick" x="${W - R}" y="${H - 6}" text-anchor="end">${n} updates</text>`;
    if (lo < 0 && hi > 0) g += `<line class="ln thin" x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}"/>`;
    g += `<path class="ln" d="${line('calm')}"/><path class="ln dash" d="${line('windy')}"/>`;
    const last = hist[hist.length - 1];
    g += `<text class="lab" x="${W - R}" y="${y(last.calm) - 7}" text-anchor="end">V(calm) ${f2(last.calm)}</text>`;
    g += `<text class="lab m" x="${W - R}" y="${y(last.windy) + 15}" text-anchor="end">V(windy) ${f2(last.windy)}</text>`;
    svg.innerHTML = g;
  }

  /* ================= data flow ================= */
  function renderFlow() {
    const b = D.bayes, m = D.mdp, r = D.route, fly = m.action === 'fly';
    const box = (x, y, w, h, title, val, dark) =>
      `<g class="box${dark ? ' dark' : ''}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/>` +
      `<text class="t" x="${x + w / 2}" y="${y + 24}">${title}</text><text x="${x + w / 2}" y="${y + 44}">${val}</text></g>`;
    const wire = (d, lbl, lx, ly) => `<path class="wire" d="${d}"/>` + (lbl ? `<text class="wire-lbl" x="${lx}" y="${ly}">${lbl}</text>` : '');
    let g = '';
    g += wire('M120 115 L170 115', '', 0, 0);
    g += wire('M300 100 C340 100 340 55 380 55', 'belief b', 340, 42);
    g += wire('M300 130 C340 130 340 175 380 175', 'risk weight', 340, 200);
    g += wire('M500 55 C530 55 530 100 545 105', '', 0, 0);
    g += wire('M500 175 C530 175 530 130 545 125', '', 0, 0);
    g += box(10, 85, 110, 60, 'Sensor', b.observation === 'alert' ? '⚠ alert' : '✓ quiet');
    g += box(170, 85, 130, 60, 'Bayes', 'P = ' + pct(b.posterior), true);
    g += box(380, 25, 120, 60, 'MDP', m.action.toUpperCase());
    g += box(380, 145, 120, 60, 'A*', r.path ? (r.path.length - 1) + ' moves' : 'no route');
    g += box(545, 85, 90, 60, 'Drone', fly ? 'departs' : 'holds', fly);
    $('#flow').innerHTML = g;
  }

  /* ================= sensitivity ================= */
  function renderSensitivity() {
    const svg = $('#sens'), W = 640, H = 300, L = 46, R = 16, T = 14, B = 36;
    const x = (v) => L + v * (W - L - R), y = (v) => T + (1 - v) * (H - T - B);
    const S = D.sensitivity, thr = D.mdp.threshold;
    const line = (k) => S.map((s, i) => (i ? 'L' : 'M') + x(s.prior).toFixed(1) + ' ' + y(s[k].posterior).toFixed(1)).join(' ');
    let g = `<rect class="zone" x="${L}" y="${y(thr)}" width="${W - L - R}" height="${y(0) - y(thr)}"/>`;
    g += `<text class="lab m" x="${x(0.6)}" y="${y(thr) + 16}">fly zone ↓</text><text class="lab m" x="${x(0.6)}" y="${y(thr) - 8}">wait zone ↑</text>`;
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      g += `<line class="ax" x1="${x(v)}" y1="${y(0)}" x2="${x(v)}" y2="${y(0) + 5}"/><text class="tick" x="${x(v)}" y="${H - 16}" text-anchor="middle">${v}</text>`;
      g += `<text class="tick" x="${L - 8}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
    });
    g += `<line class="ax" x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}"/><line class="ax" x1="${L}" y1="${T}" x2="${L}" y2="${y(0)}"/>`;
    g += `<text class="tick" x="${(L + W - R) / 2}" y="${H - 2}" text-anchor="middle">prior P(strong wind)</text>`;
    g += `<line class="ln thin" x1="${L}" y1="${y(thr)}" x2="${W - R}" y2="${y(thr)}"/>`;
    g += `<text class="lab" x="${W - R}" y="${y(thr) - 6}" text-anchor="end">threshold ${pct(thr)}</text>`;
    g += `<path class="ln" d="${line('alert')}"/><path class="ln dash" d="${line('no_alert')}"/>`;
    const cx = x(D.bayes.prior), cy = y(D.bayes.posterior);
    g += `<circle class="cur-ring" cx="${cx}" cy="${cy}" r="7"/><circle class="cur" cx="${cx}" cy="${cy}" r="7"/>`;
    svg.innerHTML = g;
  }

  function renderScenarios() {
    const S = D.sensitivity, find = (p) => S.reduce((a, s) => (Math.abs(s.prior - p) < Math.abs(a.prior - p) ? s : a));
    const rows = [
      ['A · Calm morning', 0.10, 'no_alert'],
      ['B · Uncertain day', 0.30, 'no_alert'],
      ['C · Storm warning', 0.30, 'alert'],
    ].map(([name, p, k]) => [name, p, k, find(p)[k]]);
    const cur = currentPreset();
    let h = '<tr><th>scenario</th><th>prior</th><th>reading</th><th>P(strong | e)</th><th>decision</th><th>route</th></tr>';
    rows.forEach(([name, p, k, r]) => {
      h += `<tr class="${cur === name[0] ? 'now' : ''}"><td>${name}</td><td class="mono">${p.toFixed(2)}</td><td>${k === 'alert' ? '⚠ alert' : '✓ quiet'}</td>` +
        `<td class="mono">${pct(r.posterior)}</td><td><span class="tagw ${r.action}">${r.action.toUpperCase()}</span></td><td class="mono">${r.moves} moves</td></tr>`;
    });
    if (cur === 'custom') {
      const b = D.bayes, m = D.mdp, r = D.route;
      h += `<tr class="now"><td>Your scenario</td><td class="mono">${b.prior.toFixed(2)}</td><td>${b.observation === 'alert' ? '⚠ alert' : '✓ quiet'}</td>` +
        `<td class="mono">${pct(b.posterior)}</td><td><span class="tagw ${m.action}">${m.action.toUpperCase()}</span></td><td class="mono">${r.path ? r.path.length - 1 : '–'} moves</td></tr>`;
    }
    $('#scenarios').innerHTML = h;
  }

  /* ================= tests ================= */
  $('#run-tests').addEventListener('click', async () => {
    const btn = $('#run-tests'), log = $('#test-log');
    btn.disabled = true; btn.textContent = 'running…';
    log.textContent = '$ python -m pytest -v\n…';
    try {
      const t = await (await fetch('/api/tests', { cache: 'no-store' })).json();
      setOut('t_pass', t.passed ?? 0, (v) => String(Math.round(v)));
      setOut('t_fail', t.failed ?? 0, (v) => String(Math.round(v)));
      setOut('t_time', t.seconds ?? 0, (v) => v.toFixed(2) + ' s');
      const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      log.innerHTML = '$ python -m pytest -v\n' + esc(t.output || t.summary)
        .split('\n').map((ln) => (/PASSED|passed/.test(ln) ? `<span class="ok">${ln}</span>` : `<span class="dim">${ln}</span>`)).join('\n');
    } catch (e) {
      log.textContent = 'Could not reach the Python engine. Start it with: python server.py';
    }
    btn.disabled = false; btn.textContent = 'run again';
  });

  /* ================= cover title fit ================= */
  function fitTitle() {
    const t = $('.cover .title');
    if (!t) return;
    t.style.fontSize = '';
    if (window.innerWidth <= 700) return;            // on phones the title wraps instead
    const limit = Math.min(window.innerWidth * 0.92, 1180);
    let fs = parseFloat(getComputedStyle(t).fontSize);
    while (t.scrollWidth > limit && fs > 28) { fs -= 2; t.style.fontSize = fs + 'px'; }
  }
  fitTitle();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
  window.addEventListener('resize', fitTitle);

  /* ================= start ================= */
  syncInputs();
  load(false);
  $('#openBtn').addEventListener('click', () => setTimeout(() => D && renderMission(true), 1400));
})();
