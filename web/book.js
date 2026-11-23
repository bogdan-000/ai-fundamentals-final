/* Effects adapted from the 'AI in Short' course book: particle field, cover, reveal, nav spy, cursor, wipe, dividers, night mode. */

(function(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- glowing particle field ---------- */
  const canvas = document.getElementById('field');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, pts = [], sprite = null, t = 0;
  const mouse = {x:-9999, y:-9999};

  function makeSprite(){
    const s = document.createElement('canvas'); const R = 48;
    s.width = s.height = R * 2;
    const g = s.getContext('2d');
    const grad = g.createRadialGradient(R,R,0,R,R,R);
    grad.addColorStop(0,'rgba(11,11,12,0.55)');
    grad.addColorStop(0.18,'rgba(11,11,12,0.28)');
    grad.addColorStop(0.45,'rgba(11,11,12,0.08)');
    grad.addColorStop(1,'rgba(11,11,12,0)');
    g.fillStyle = grad; g.fillRect(0,0,R*2,R*2);
    return s;
  }

  function size(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const n = Math.round(Math.min(120, Math.max(45, W * H / 12500)));
    pts = Array.from({length:n}, () => {
      const z = Math.random() * .75 + .25;
      return { x: Math.random()*W, y: Math.random()*H, z,
        vx: (Math.random()-.5)*.35*z, vy: (Math.random()-.5)*.35*z,
        r: (Math.random()*1.2 + .6) * (0.6 + z), ph: Math.random()*Math.PI*2 };
    });
  }

  let sparks = [], scrollY = 0, smoothScroll = 0;
  window.__field = {
    burst(x, y){
      if (reduce) return;
      for (let i = 0; i < 18; i++){
        const a = Math.random()*Math.PI*2, s = Math.random()*3.2 + 1.2;
        sparks.push({x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 1, r: Math.random()*1.6 + .8});
      }
      for (const p of pts){
        const sy = wrapY(p);
        const dx = p.x - x, dy = sy - y, d = Math.hypot(dx, dy) + 1;
        if (d < 260){ const f = (260 - d) / 260 * 3.2; p.vx += dx/d*f; p.vy += dy/d*f; }
      }
    }
  };
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, {passive:true});

  function wrapY(p){
    let y = (p.y - smoothScroll * p.z * .35) % (H + 40);
    if (y < -20) y += H + 40;
    return y;
  }

  function frame(){
    t += 0.016;
    smoothScroll += (scrollY - smoothScroll) * .08;
    ctx.clearRect(0,0,W,H);
    for (const p of pts){
      if (!reduce){
        const sy = wrapY(p);
        const dx = p.x - mouse.x, dy = sy - mouse.y, d2 = dx*dx + dy*dy;
        if (d2 < 16000){ const d = Math.sqrt(d2) + 1, f = (16000 - d2) / 16000; p.vx += dx/d*f*.06*p.z; p.vy += dy/d*f*.06*p.z; }
        p.vx *= .982; p.vy *= .982;
        p.vx += (Math.random()-.5)*.012*p.z; p.vy += (Math.random()-.5)*.012*p.z;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = W+20; if (p.x > W+20) p.x = -20;
      }
      p.sy = wrapY(p);
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++){
      const a = pts[i];
      for (let j = i+1; j < pts.length; j++){
        const b = pts[j], dx = a.x-b.x, dy = a.sy-b.sy, d = dx*dx + dy*dy;
        if (d < 14000){
          ctx.strokeStyle = 'rgba(11,11,12,' + (0.13 * (1 - d/14000) * Math.min(a.z, b.z) * 1.3).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.x,a.sy); ctx.lineTo(b.x,b.sy); ctx.stroke();
        }
      }
      if (mouse.x > -999){
        const dx = a.x - mouse.x, dy = a.sy - mouse.y, d = dx*dx + dy*dy;
        if (d < 30000){
          ctx.strokeStyle = 'rgba(11,11,12,' + (0.22 * (1 - d/30000)).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(a.x,a.sy); ctx.lineTo(mouse.x,mouse.y); ctx.stroke();
        }
      }
    }
    for (const p of pts){
      const pulse = reduce ? 1 : 0.8 + 0.35 * Math.sin(t * 1.6 + p.ph);
      const gs = p.r * 11 * pulse;
      ctx.globalAlpha = 0.45 + 0.4 * p.z;
      ctx.drawImage(sprite, p.x - gs, p.sy - gs, gs*2, gs*2);
      ctx.globalAlpha = 0.5 + 0.5 * p.z;
      ctx.fillStyle = '#0b0b0c';
      ctx.beginPath(); ctx.arc(p.x,p.sy,p.r,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    sparks = sparks.filter(s => s.life > 0);
    for (const s of sparks){
      s.x += s.vx; s.y += s.vy; s.vx *= .94; s.vy *= .94; s.life -= .022;
      const gs = s.r * 9;
      ctx.globalAlpha = Math.max(0, s.life) * .8;
      ctx.drawImage(sprite, s.x - gs, s.y - gs, gs*2, gs*2);
      ctx.fillStyle = '#0b0b0c';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(frame);
  }

  sprite = makeSprite(); size(); frame();
  window.addEventListener('resize', () => { size(); if (reduce) frame(); placePill(); });
  window.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; parallax(e); }, {passive:true});
  document.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });

  /* ---------- cover ---------- */
  const cover = document.getElementById('cover');
  const coverInner = document.getElementById('coverInner');
  const openBtn = document.getElementById('openBtn');
  const book = document.getElementById('book');
  let opened = false;

  function parallax(e){
    if (reduce || opened) return;
    const x = (e.clientX / W - .5), y = (e.clientY / H - .5);
    coverInner.style.transform = 'translate(' + (x * -14).toFixed(1) + 'px,' + (y * -10).toFixed(1) + 'px)';
    const r = openBtn.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height/2;
    const dx = e.clientX - cx, dy = e.clientY - cy, dist = Math.hypot(dx, dy);
    openBtn.style.translate = dist < 140 ? (dx * .18).toFixed(1) + 'px ' + (dy * .25).toFixed(1) + 'px' : '0 0';
  }

  function openBook(instant, target){
    if (opened) return; opened = true;
    book.hidden = false;
    document.body.classList.remove('locked');
    if (target) target.scrollIntoView({behavior:'instant', block:'start'});
    if (!instant && !reduce){
      book.classList.add('enter');
      cover.classList.add('gone');
      setTimeout(() => { cover.hidden = true; }, 1200);
    } else {
      cover.hidden = true;
    }
    setupReveal();
    requestAnimationFrame(placePill);
  }
  openBtn.addEventListener('click', () => openBook(false));

  /* ---------- reveal, nav spy, progress ---------- */
  const links = Array.from(document.querySelectorAll('#nav a'));
  const sections = Array.from(document.querySelectorAll('main section'));
  const pill = document.getElementById('pill');
  const nav = document.getElementById('nav');
  const progress = document.getElementById('progress');
  const topBtn = document.getElementById('topBtn');
  let active = null;

  sections.forEach(s => Array.from(s.children).forEach((c, i) => c.style.setProperty('--i', Math.min(i, 12))));

  function placePill(){
    if (!active || getComputedStyle(pill).display === 'none') { pill.style.opacity = 0; return; }
    const nr = nav.getBoundingClientRect(), ar = active.getBoundingClientRect();
    pill.style.opacity = 1;
    pill.style.height = ar.height + 'px';
    pill.style.transform = 'translateY(' + (ar.top - nr.top) + 'px)';
  }

  function setActive(id){
    links.forEach(a => {
      const on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('on', on);
      if (on){ active = a; if (window.innerWidth <= 860) a.scrollIntoView({block:'nearest', inline:'center', behavior: reduce ? 'auto' : 'smooth'}); }
    });
    placePill();
  }

  function setupReveal(){
    if (!('IntersectionObserver' in window)) return;
    if (!reduce){
      const vh = window.innerHeight;
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => { if (en.isIntersecting){ en.target.classList.remove('pre'); io.unobserve(en.target); } });
      }, {rootMargin:'0px 0px -6% 0px'});
      sections.forEach(s => { if (s.getBoundingClientRect().top > vh * .9){ s.classList.add('pre'); io.observe(s); } });
    }
    const spy = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) setActive(en.target.id); });
    }, {rootMargin:'-40% 0px -55% 0px'});
    sections.forEach(s => spy.observe(s));
  }

  links.forEach(a => a.addEventListener('click', () => {
    const tgt = document.querySelector(a.getAttribute('href'));
    if (tgt) tgt.classList.remove('pre');
  }));

  function onScroll(){
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = 'scaleX(' + (opened && max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    topBtn.classList.toggle('show', opened && window.scrollY > 600);
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  topBtn.addEventListener('click', () => window.scrollTo({top:0, behavior: reduce ? 'auto' : 'smooth'}));

  /* ---------- start ---------- */
  if (location.hash && document.querySelector(location.hash)){
    openBook(true, document.querySelector(location.hash));
  } else {
    document.body.classList.add('locked');
  }
  onScroll();
})();


(function(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;

  /* custom cursor */
  const dot = document.getElementById('curDot'), ring = document.getElementById('curRing');
  if (fine && !reduce){
    let mx = -100, my = -100, rx = -100, ry = -100;
    window.addEventListener('pointermove', e => {
      mx = e.clientX; my = e.clientY;
      document.body.classList.add('cursor-on');
      const hot = e.target.closest && e.target.closest('a,button,select,.open,.ghost,pre,.eq');
      ring.classList.toggle('big', !!hot);
      const typing = e.target.closest && e.target.closest('input');
      dot.style.opacity = typing ? 0 : ''; ring.style.opacity = typing ? 0 : '';
    }, {passive:true});
    document.addEventListener('pointerleave', () => document.body.classList.remove('cursor-on'));
    window.addEventListener('pointerdown', () => ring.classList.add('press'));
    window.addEventListener('pointerup', () => ring.classList.remove('press'));
    (function loop(){
      rx += (mx - rx) * .16; ry += (my - ry) * .16;
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
      ring.style.transform = 'translate(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px)';
      requestAnimationFrame(loop);
    })();
  }

  /* click bursts */
  window.addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('input,select')) return;
    window.__field && window.__field.burst(e.clientX, e.clientY);
  });

  /* opening wipe */
  const wipe = document.getElementById('wipe');
  const openBtn = document.getElementById('openBtn');
  openBtn.addEventListener('click', e => {
    if (reduce) return;
    const r = openBtn.getBoundingClientRect();
    wipe.style.setProperty('--wx', (r.left + r.width/2) + 'px');
    wipe.style.setProperty('--wy', (r.top + r.height/2) + 'px');
    wipe.classList.remove('out'); wipe.classList.add('in');
    setTimeout(() => wipe.classList.add('out'), 1150);
    setTimeout(() => { wipe.classList.remove('in','out'); }, 1950);
  }, true);

  /* outline chapter numbers with scroll parallax */
  const sections = Array.from(document.querySelectorAll('main section'));
  sections.forEach(s => { const tag = s.querySelector('.tag'); if (tag) s.dataset.num = tag.textContent.trim().slice(0,2); });
  function para(){
    if (reduce) return;
    const vh = window.innerHeight;
    sections.forEach(s => {
      const r = s.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      s.style.setProperty('--py', ((r.top - vh/2) * -.12).toFixed(1) + 'px');
    });
  }
  window.addEventListener('scroll', () => requestAnimationFrame(para), {passive:true});

  /* 3D tilt on formula blocks and calculators */
  if (fine && !reduce){
    document.querySelectorAll('.calc, pre, .eq').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        el.style.transform = 'perspective(900px) rotateX(' + (-y * 5).toFixed(2) + 'deg) rotateY(' + (x * 6).toFixed(2) + 'deg) translateY(-3px)';
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });

    /* magnetic small buttons */
    document.querySelectorAll('.ghost, .top, .calc-head button').forEach(b => {
      b.addEventListener('pointermove', e => {
        const r = b.getBoundingClientRect();
        b.style.translate = ((e.clientX - r.left - r.width/2) * .25).toFixed(1) + 'px ' + ((e.clientY - r.top - r.height/2) * .3).toFixed(1) + 'px';
      });
      b.addEventListener('pointerleave', () => { b.style.translate = ''; });
    });
  }

  /* heading decode effect: scramble runs in an overlay, the real text keeps the layout */
  const glyphs = '01#*/<>=+∑λ';
  const running = new WeakSet();
  function scramble(el){
    if (running.has(el)) return;
    let real = el.querySelector(':scope > .h-real'), scr = el.querySelector(':scope > .h-scr');
    if (!real){
      const final = el.textContent;
      el.textContent = '';
      real = document.createElement('span'); real.className = 'h-real'; real.textContent = final;
      scr = document.createElement('span'); scr.className = 'h-scr'; scr.setAttribute('aria-hidden', 'true');
      el.append(real, scr);
    }
    const final = real.textContent;
    running.add(el); el.classList.add('scrambling');
    let frame = 0; const total = 22;
    (function tick(){
      const k = frame / total;
      scr.textContent = final.split('').map((c, i) => {
        if (c === ' ') return ' ';
        return i / final.length < k ? c : glyphs[Math.floor(Math.random() * glyphs.length)];
      }).join('');
      if (++frame <= total) requestAnimationFrame(tick);
      else { el.classList.remove('scrambling'); scr.textContent = ''; running.delete(el); }
    })();
  }
  if (!reduce && 'IntersectionObserver' in window){
    const seen = new WeakSet();
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting && !seen.has(en.target)){ seen.add(en.target); setTimeout(() => scramble(en.target), 180); }
      });
    }, {rootMargin:'0px 0px -10% 0px'});
    document.querySelectorAll('main h2').forEach(h => {
      io.observe(h);
    });
  }
})();


(function(){
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sections = Array.from(document.querySelectorAll('main section')).slice(1);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

  function petal(cx, cy, len, wid, ang){
    const a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const p = (x, y) => (cx + x*c - y*s).toFixed(1) + ' ' + (cy + x*s + y*c).toFixed(1);
    return 'M' + p(0,0) + ' C' + p(len*.35, -wid) + ' ' + p(len*.8, -wid*.9) + ' ' + p(len,0) + ' C' + p(len*.8, wid*.9) + ' ' + p(len*.35, wid) + ' ' + p(0,0) + 'Z';
  }
  function spiral(cx, cy, r, turns, dir){
    let d = '', n = 60;
    for (let i = 0; i <= n; i++){ const t = i/n, ang = dir * t * turns * Math.PI * 2, rr = r * (1 - t*.85); d += (i ? ' L' : 'M') + (cx + Math.cos(ang)*rr).toFixed(1) + ' ' + (cy + Math.sin(ang)*rr).toFixed(1); }
    return d;
  }

  sections.forEach((sec, idx) => {
    const wrap = document.createElement('div'); wrap.className = 'celestial'; wrap.setAttribute('aria-hidden', 'true');
    sec.parentNode.insertBefore(wrap, sec);
    const W = Math.max(300, Math.round(wrap.clientWidth || 700)), H = 110, cx = Math.round(W * (idx % 2 ? .66 : .34)), cy = 55;
    const svg = el('svg', {viewBox: '0 0 ' + W + ' ' + H});
    const defs = el('defs', {}, svg);
    const fid = 'cg' + idx;
    const f = el('filter', {id: fid, x: '-50%', y: '-200%', width: '200%', height: '500%'}, defs);
    el('feGaussianBlur', {stdDeviation: '2.2', result: 'b'}, f);
    const m = el('feMerge', {}, f); el('feMergeNode', {in: 'b'}, m); el('feMergeNode', {in: 'SourceGraphic'}, m);
    const hf = el('filter', {id: fid + 'h', x: '-100%', y: '-100%', width: '300%', height: '300%'}, defs);
    el('feGaussianBlur', {stdDeviation: '9'}, hf);
    const grad = el('radialGradient', {id: fid + 'r'}, defs);
    el('stop', {offset: '0%', 'stop-color': '#0b0b0c', 'stop-opacity': '.55'}, grad);
    el('stop', {offset: '100%', 'stop-color': '#0b0b0c', 'stop-opacity': '0'}, grad);

    const lg = el('linearGradient', {id: fid + 'f', x1: '0', x2: '1', y1: '0', y2: '0'}, defs);
    [[0,0],[.2,1],[.8,1],[1,0]].forEach(([o, a]) => el('stop', {offset: o, 'stop-color': '#fff', 'stop-opacity': a}, lg));
    const mk = el('mask', {id: fid + 'm'}, defs); el('rect', {x: 0, y: -20, width: W, height: H + 40, fill: 'url(#' + fid + 'f)'}, mk);
    const gM = el('g', {mask: 'url(#' + fid + 'm)'}, svg);
    const gA = el('g', {class: 'drift', filter: 'url(#' + fid + ')'}, gM);
    const gB = el('g', {class: 'drift b', filter: 'url(#' + fid + ')'}, gM);
    const strands = 9;
    for (let i = 0; i < strands; i++){
      const g = i % 2 ? gA : gB;
      const spread = (i - (strands-1)/2) * (5 + rnd()*5);
      const amp = 12 + rnd()*20, ph = rnd()*Math.PI*2, k = .9 + rnd()*.8;
      let d = '';
      for (let x = 0; x <= W; x += 10){
        const t = x / W, pinch = Math.exp(-Math.pow((x - cx)/(W*.2), 2));
        const y = cy + spread * (1 - pinch*.85) + Math.sin(t*Math.PI*2*k + ph) * amp * (1 - pinch*.7) * Math.sin(Math.PI*t);
        d += (x ? ' L' : 'M') + x + ' ' + y.toFixed(1);
      }
      const path = el('path', {d, class: 'strand', 'stroke-width': (.5 + rnd()*1.1).toFixed(2), opacity: (.18 + rnd()*.5).toFixed(2)}, g);
      const len = Math.ceil(W * 1.6);
      path.style.setProperty('--len', len);
      path.style.transitionDelay = (i * 90) + 'ms';
    }

    el('circle', {cx, cy, r: 46, fill: 'url(#' + fid + 'r)', class: 'halo'}, svg);
    const core = el('g', {class: 'core'}, svg);
    el('circle', {cx, cy, r: 22, fill: '#0b0b0c', opacity: '.35', filter: 'url(#' + fid + 'h)'}, core);
    const bloom = el('g', {class: 'bloom', filter: 'url(#' + fid + ')'}, core);
    const petals = 5 + (idx % 2), rot = rnd()*60;
    for (let p = 0; p < petals; p++) el('path', {d: petal(cx, cy, 21, 7, rot + p * 360 / petals), fill: '#0b0b0c', opacity: '.88'}, bloom);
    for (let p = 0; p < petals; p++) el('path', {d: petal(cx, cy, 12, 3.2, rot + 180/petals + p * 360 / petals), fill: '#ffffff', opacity: '.9'}, bloom);
    el('circle', {cx, cy, r: 2.6, fill: '#ffffff'}, core);
    el('circle', {cx, cy, r: 1.2, fill: '#0b0b0c'}, core);

    [[cx + 40, cy - 22, 9, 1.6, 1], [cx - 46, cy + 20, 7, 1.4, -1]].forEach(([x, y, r, t, dir]) => {
      const c = el('path', {d: spiral(x, y, r, t, dir), class: 'curl', 'stroke-width': '1'}, svg);
      c.style.setProperty('--len', 120);
    });

    for (let s = 0; s < 22; s++){
      const x = Math.max(8, Math.min(W - 8, cx + (rnd() - .5) * W * .75 * (0.3 + rnd())));
      const y = cy + (rnd() - .5) * 70 * Math.exp(-Math.pow((x - cx)/260, 2) * .6);
      const big = rnd() < .25, r = big ? 2.6 : .8 + rnd()*1.2;
      let node;
      if (big){
        node = el('path', {d: 'M' + x + ' ' + (y - r*2.2) + ' Q' + x + ' ' + y + ' ' + (x + r*2.2) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + r*2.2) + ' Q' + x + ' ' + y + ' ' + (x - r*2.2) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - r*2.2) + 'Z', class: 'spark'}, svg);
      } else node = el('circle', {cx: x.toFixed(1), cy: y.toFixed(1), r: r.toFixed(2), class: 'spark'}, svg);
      node.style.setProperty('--d', (2.4 + rnd()*3).toFixed(2) + 's');
      node.style.setProperty('--dl', (rnd()*3).toFixed(2) + 's');
      node.style.setProperty('--o', (.35 + rnd()*.6).toFixed(2));
    }

    wrap.appendChild(svg);
  });

  const all = document.querySelectorAll('.celestial');
  if (reduce || !('IntersectionObserver' in window)) { all.forEach(c => c.classList.add('lit')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ e.target.classList.add('lit'); io.unobserve(e.target); } }), {rootMargin: '0px 0px -8% 0px'});
  all.forEach(c => io.observe(c));
})();


(function(){
  const root = document.documentElement, btn = document.getElementById('nightBtn');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tip = btn.querySelector('.tip');
  function apply(on){
    root.classList.toggle('night', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    tip.textContent = on ? 'day mode' : 'night mode';
    try { localStorage.setItem('droneNight', on ? '1' : '0'); } catch (e) {}
  }
  try { if (localStorage.getItem('droneNight') === '1') { root.style.transition = 'none'; apply(true); requestAnimationFrame(() => root.style.transition = ''); } } catch (e) {}
  btn.addEventListener('click', e => {
    const on = !root.classList.contains('night');
    if (reduce || !document.startViewTransition){ apply(on); return; }
    const r = btn.getBoundingClientRect(), x = r.left + r.width/2, y = r.top + r.height/2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.transition = 'none';
    const vt = document.startViewTransition(() => apply(on));
    vt.ready.then(() => {
      root.animate({clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + end + 'px at ' + x + 'px ' + y + 'px)']},
        {duration: 900, easing: 'cubic-bezier(.76,0,.24,1)', pseudoElement: '::view-transition-new(root)'});
    }).catch(() => {});
    vt.finished.finally(() => { root.style.transition = ''; });
  });
})();
