/* Demo | Presentation switcher and the slide deck.
   Slide numbers that depend on the model are fetched from the Python engine (/api/mission). */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pct = (x) => (x * 100).toFixed(1) + '%';

  const deck = $('#deck'), stage = $('#stage'), bar = $('#modebar'), pill = $('#mbPill');
  const slides = $$('.slide', stage);
  let cur = 0, mode = 'demo', loaded = false;

  /* ---------- mode switcher ---------- */
  function placePill() {
    const on = $('button.on', bar);
    if (!on) return;
    pill.style.width = on.offsetWidth + 'px';
    pill.style.transform = `translateX(${on.offsetLeft - 4}px)`;
  }

  function setMode(m) {
    mode = m;
    $$('button', bar).forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
    placePill();
    if (m === 'slides') {
      deck.hidden = false;
      document.body.classList.add('locked');
      show(cur, true);
      loadData();
      history.replaceState(null, '', '#present');
    } else {
      if (document.fullscreenElement) document.exitFullscreen();
      deck.hidden = true;
      history.replaceState(null, '', location.pathname);
      if ($('#book').hidden) $('#openBtn').click();          // cover still up → open the site
      else document.body.classList.remove('locked');
    }
  }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (b && b.dataset.mode !== mode) setMode(b.dataset.mode);
  });
  $$('.golive').forEach((b) => b.addEventListener('click', () => setMode('demo')));
  window.addEventListener('resize', placePill);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placePill);
  placePill();

  /* ---------- slides ---------- */
  const dots = $('#dDots');
  dots.innerHTML = slides.map((s, i) => `<button type="button" aria-label="Slide ${i + 1}: ${s.dataset.title}"></button>`).join('');
  $$('button', dots).forEach((b, i) => b.addEventListener('click', () => show(i)));

  function show(i, instant) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    const back = i < cur;
    slides.forEach((s, k) => {
      s.classList.toggle('active', k === i);
      s.classList.toggle('left', back ? k > i : k < i);
      s.setAttribute('aria-hidden', k !== i);
    });
    cur = i;
    $$('button', dots).forEach((b, k) => b.classList.toggle('on', k === i));
    $('#dCount').textContent = `${i + 1} / ${slides.length}`;
    $('#dProg').style.width = ((i + 1) / slides.length) * 100 + '%';
    $('#dPrev').disabled = i === 0;
    $('#dNext').disabled = i === slides.length - 1;
    const n = $('.notes', slides[i]);
    $('#notesPanel').textContent = n ? n.textContent : '';
  }

  $('#dPrev').addEventListener('click', () => show(cur - 1));
  $('#dNext').addEventListener('click', () => show(cur + 1));
  stage.addEventListener('click', (e) => {
    if (e.target.closest('button,a')) return;
    const r = stage.getBoundingClientRect();
    show(e.clientX - r.left < r.width * 0.3 ? cur - 1 : cur + 1);
  });

  function toggleNotes() {
    const p = $('#notesPanel');
    p.hidden = !p.hidden;
    $('#dNotes').classList.toggle('on', !p.hidden);
  }
  $('#dNotes').addEventListener('click', toggleNotes);

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (deck.requestFullscreen) deck.requestFullscreen().catch(() => {});
  }
  $('#dFull').addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', () => {
    const full = document.fullscreenElement === deck;
    deck.classList.toggle('full', full);
    $('#dFull').classList.toggle('on', full);
  });

  let idle = null;                                   // hide controls when the mouse rests in fullscreen
  deck.addEventListener('pointermove', () => {
    deck.classList.remove('idle');
    clearTimeout(idle);
    idle = setTimeout(() => deck.classList.add('idle'), 2200);
  });

  document.addEventListener('keydown', (e) => {
    if (mode !== 'slides' || e.target.matches('input,textarea')) return;
    const k = e.key;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); show(cur + 1); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); show(cur - 1); }
    else if (k === 'Home') show(0);
    else if (k === 'End') show(slides.length - 1);
    else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') toggleFull();
    else if (k === 'n' || k === 'N' || k === 'т' || k === 'Т') toggleNotes();
    else if (k === 'Escape' && !document.fullscreenElement) setMode('demo');
  });

  let tx = null;                                     // swipe on phones
  stage.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (tx == null) return;
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 40) show(dx < 0 ? cur + 1 : cur - 1);
    tx = null;
  });

  /* ---------- live numbers from the engine ---------- */
  const get = (prior, alert) => fetch(`/api/mission?prior=${prior}&alert=${alert}`, { cache: 'no-store' }).then((r) => r.json());

  async function loadData() {
    if (loaded) return;
    try {
      const [A, B, C] = await Promise.all([get(0.1, 0), get(0.3, 0), get(0.3, 1)]);
      loaded = true;
      drawFlow(C);
      drawGrid($('#sl-gridA'), A);
      drawGrid($('#sl-gridB'), B);
      drawTable([['A · Calm morning', A], ['B · Uncertain day', B], ['C · Storm warning', C]]);
    } catch (e) {
      $('#sl-table').innerHTML = '<tr><td>Start the Python engine (python server.py) to load the live results.</td></tr>';
    }
  }

  function drawFlow(D) {
    const b = D.bayes, m = D.mdp, r = D.route, fly = m.action === 'fly';
    const box = (x, y, w, h, t, v, dark) =>
      `<g class="box${dark ? ' dark' : ''}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/>` +
      `<text class="t" x="${x + w / 2}" y="${y + 24}">${t}</text><text x="${x + w / 2}" y="${y + 44}">${v}</text></g>`;
    const wire = (d, l, lx, ly) => `<path class="wire" d="${d}"/>` + (l ? `<text class="wire-lbl" x="${lx}" y="${ly}">${l}</text>` : '');
    $('#sl-flow').innerHTML =
      wire('M120 115 L170 115') +
      wire('M300 100 C340 100 340 55 380 55', 'belief b', 340, 42) +
      wire('M300 130 C340 130 340 175 380 175', 'risk weight', 340, 200) +
      wire('M500 55 C530 55 530 100 545 105') + wire('M500 175 C530 175 530 130 545 125') +
      box(10, 85, 110, 60, 'Sensor', b.observation === 'alert' ? '⚠ alert' : '✓ quiet') +
      box(170, 85, 130, 60, 'Bayes', 'P = ' + pct(b.posterior), true) +
      box(380, 25, 120, 60, 'MDP', m.action.toUpperCase()) +
      box(380, 145, 120, 60, 'A*', r.path ? (r.path.length - 1) + ' moves' : 'no route') +
      box(545, 85, 90, 60, 'Drone', fly ? 'departs' : 'holds', fly);
  }

  function drawGrid(el, D) {
    const g = D.grid, key = (c) => c[0] + ',' + c[1];
    const walls = new Set(g.obstacles.map(key)), field = new Set(g.exposed.map(key));
    const path = new Map((D.route.path || []).map((c, i) => [key(c), i]));
    el.style.gridTemplateColumns = `repeat(${g.cols},1fr)`;
    let h = '';
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const k = r + ',' + c;
      let cls = 'cell', txt = '';
      if (k === key(g.start)) { cls += ' start'; txt = 'S'; }
      else if (k === key(g.goal)) { cls += ' goal'; txt = 'G'; }
      else if (walls.has(k)) cls += ' wall';
      else if (path.has(k)) { cls += ' path'; txt = path.get(k); }
      else if (field.has(k)) { cls += ' field'; txt = '≋'; }
      h += `<div class="${cls}">${txt}</div>`;
    }
    el.innerHTML = h;
  }

  function drawTable(rows) {
    let h = '<tr><th>scenario</th><th>prior</th><th>reading</th><th>P(strong | e)</th><th>MDP</th><th>A* route</th></tr>';
    rows.forEach(([name, D]) => {
      const b = D.bayes, m = D.mdp, r = D.route;
      h += `<tr><td>${name}</td><td class="mono">${b.prior.toFixed(2)}</td><td>${b.observation === 'alert' ? '⚠ alert' : '✓ quiet'}</td>` +
        `<td class="mono">${pct(b.posterior)}</td><td><span class="tagw ${m.action}">${m.action.toUpperCase()}</span></td>` +
        `<td class="mono">${r.path.length - 1} moves${r.exposed_cells ? ' · shortcut' : ' · detour'}</td></tr>`;
    });
    $('#sl-table').innerHTML = h;
  }

  /* ---------- start ---------- */
  show(0, true);
  if (location.hash === '#present') setMode('slides');
})();
