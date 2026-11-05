(function () {
  'use strict';

  const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const $ = (s) => document.querySelector(s);
  const el = {
    tray: $('#tray'), board: $('#board'), palette: $('#palette'), stage: $('#stage'),
    goal: $('#goal'), message: $('#message'), overlay: $('#overlay'),
    targetInput: $('#targetInput'), levelNote: $('#levelNote'),
    streak: $('#streak'), solved: $('#solved'), helpCount: $('#helpCount'),
    mute: $('#mute'),
  };
  const slotEls = {
    num: [...el.board.querySelectorAll('.slot.num')],
    op: [...el.board.querySelectorAll('.slot.op')],
  };

  // ---------- state ----------
  const state = {
    target: 24,
    level: 'easy',
    tiles: [],            // [{id, value}]
    numSlots: [null, null, null, null],   // tile ids
    opSlots: [null, null, null],          // '+', '-', '*', '/'
    solution: null,       // {nums, ops}
    hinted: new Set(),    // 'n0', 'o1', ...
    hints: 0,
    streak: 0,
    solved: 0,
    locked: false,
    busy: false,
  };
  let timers = [];

  try {
    const t = parseInt(localStorage.getItem('funmath.24.target'), 10);
    if (t >= 0 && t <= 500) state.target = t;
    const l = localStorage.getItem('funmath.24.level');
    if (l === 'easy' || l === 'hard') state.level = l;
  } catch (e) {}

  function save() {
    try {
      localStorage.setItem('funmath.24.target', state.target);
      localStorage.setItem('funmath.24.level', state.level);
    } catch (e) {}
  }

  // ---------- helpers ----------
  const tileById = (id) => state.tiles.find((t) => t.id === id);
  const inSlot = (id) => state.numSlots.indexOf(id);
  function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function say(text, cls) {
    el.message.textContent = text || '';
    el.message.className = 'message' + (cls ? ' ' + cls : '');
  }

  function fmt(f) { return f.d === 1 ? String(f.n) : f.n + '/' + f.d; }

  function makeTile(text, cls) {
    const d = document.createElement('div');
    d.className = 'tile' + (cls ? ' ' + cls : '');
    d.textContent = text;
    return d;
  }

  // ---------- rendering ----------
  function render() {
    // tray
    el.tray.innerHTML = '';
    state.tiles.forEach((t) => {
      if (inSlot(t.id) !== -1) return;
      const d = makeTile(t.value);
      d.dataset.tile = t.id;
      el.tray.appendChild(d);
    });
    // number slots
    state.numSlots.forEach((id, i) => {
      const s = slotEls.num[i];
      s.innerHTML = '';
      s.classList.toggle('filled', id !== null);
      if (id !== null) {
        const t = tileById(id);
        const d = makeTile(t.value);
        d.dataset.tile = id;
        d.dataset.slot = 'n' + i;
        if (state.hinted.has('n' + i) && state.solution.nums[i] === t.value) d.classList.add('hinted');
        s.appendChild(d);
      }
    });
    // op slots
    state.opSlots.forEach((op, i) => {
      const s = slotEls.op[i];
      s.innerHTML = '';
      s.classList.toggle('filled', op !== null);
      if (op !== null) {
        const d = makeTile(SYMBOL[op], 'opt');
        d.dataset.op = op;
        d.dataset.slot = 'o' + i;
        if (state.hinted.has('o' + i) && state.solution.ops[i] === op) d.classList.add('hinted');
        s.appendChild(d);
      }
    });
    el.goal.textContent = state.target;
    el.targetInput.value = state.target;
    el.streak.textContent = state.streak;
    el.solved.textContent = state.solved;
    el.helpCount.textContent = state.hints ? '(' + state.hints + ' used)' : '';
  }

  // ---------- moves ----------
  function firstEmpty(arr) { return arr.indexOf(null); }

  function putTile(id, slotIdx, fromSlotIdx) {
    const occupant = state.numSlots[slotIdx];
    if (fromSlotIdx !== undefined && fromSlotIdx !== -1) {
      state.numSlots[fromSlotIdx] = occupant;      // swap (occupant may be null)
    }
    state.numSlots[slotIdx] = id;
  }
  function putOp(op, slotIdx, fromSlotIdx) {
    const occupant = state.opSlots[slotIdx];
    if (fromSlotIdx !== undefined && fromSlotIdx !== -1) state.opSlots[fromSlotIdx] = occupant;
    state.opSlots[slotIdx] = op;
  }

  // Information about what a pointer grabbed
  function describe(target) {
    const t = target.closest('.tile');
    if (!t) return null;
    if (t.dataset.tile !== undefined) {
      return { kind: 'num', el: t, id: +t.dataset.tile, from: t.dataset.slot ? +t.dataset.slot.slice(1) : -1 };
    }
    if (t.dataset.op) {
      return { kind: 'op', el: t, op: t.dataset.op, from: t.dataset.slot ? +t.dataset.slot.slice(1) : -1 };
    }
    return null;
  }

  function tap(src) {
    if (src.kind === 'num') {
      if (src.from === -1) {
        const i = firstEmpty(state.numSlots);
        if (i === -1) return say('All the number boxes are full. Tap one to take it back!');
        putTile(src.id, i);
      } else {
        state.numSlots[src.from] = null;
      }
    } else {
      if (src.from === -1) {
        const i = firstEmpty(state.opSlots);
        if (i === -1) return say('All the sign boxes are full. Tap one to take it back!');
        putOp(src.op, i);
      } else {
        state.opSlots[src.from] = null;
      }
    }
    FunSound.play('pop');
    say('');
    render();
  }

  function drop(src, slotEl) {
    if (slotEl) {
      const i = +slotEl.dataset.i;
      if (src.kind === 'num' && slotEl.dataset.kind === 'num') putTile(src.id, i, src.from);
      else if (src.kind === 'op' && slotEl.dataset.kind === 'op') putOp(src.op, i, src.from);
      else return render();
      FunSound.play('drop');
    } else if (src.from !== -1) {
      // dragged out of the board → back to where it came from
      if (src.kind === 'num') state.numSlots[src.from] = null;
      else state.opSlots[src.from] = null;
      FunSound.play('pop');
    }
    say('');
    render();
  }

  // ---------- drag & drop (pointer events: mouse, touch and pen) ----------
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    if (state.locked || e.button > 0) return;
    const src = describe(e.target);
    if (!src) return;
    drag = { src, x: e.clientX, y: e.clientY, moved: false, ghost: null, over: null };
    e.preventDefault();
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 7) return;
      drag.moved = true;
      const r = drag.src.el.getBoundingClientRect();
      const g = drag.src.el.cloneNode(true);
      g.classList.add('ghost');
      g.style.width = r.width + 'px';
      g.style.height = r.height + 'px';
      document.body.appendChild(g);
      drag.ghost = g;
      drag.src.el.classList.add('dragging');
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under && under.closest('.slot');
    const ok = slot && slot.dataset.kind === drag.src.kind ? slot : null;
    if (ok !== drag.over) {
      if (drag.over) drag.over.classList.remove('over');
      if (ok) ok.classList.add('over');
      drag.over = ok;
    }
  });
  function endDrag(e, cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.ghost) d.ghost.remove();
    if (d.over) d.over.classList.remove('over');
    if (cancelled) return render();
    if (!d.moved) return tap(d.src);
    drop(d.src, d.over);
  }
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));

  // ---------- puzzle flow ----------
  function resetBoard() {
    state.numSlots = [null, null, null, null];
    state.opSlots = [null, null, null];
    state.hinted = new Set();
    state.hints = 0;
  }

  const LEVEL_NOTE = {
    easy: 'Easy: numbers 1–13, and you never need fractions.',
    hard: 'Hard: numbers 0–13, and the answer needs fractions along the way (like 12 ÷ 9 × 9).',
  };

  function newPuzzle(keepMsg) {
    if (state.busy) return;
    state.busy = true;
    clearTimers();
    hideOverlay();
    if (!keepMsg) say('Finding a puzzle…');
    el.levelNote.textContent = LEVEL_NOTE[state.level];
    later(() => {
      const p = Solver.generate(state.target, state.level, 1500);
      state.busy = false;
      if (!p) {
        say('Hmm, I couldn’t find a puzzle that makes ' + state.target + '. Try a smaller target!', 'bad');
        render();
        return;
      }
      state.locked = false;
      resetBoard();
      state.solution = p.solution;
      state.tiles = p.numbers.map((v, i) => ({ id: i, value: v }));
      say('');
      render();
      el.board.classList.add('fresh'); el.tray.classList.add('fresh');
      later(() => { el.board.classList.remove('fresh'); el.tray.classList.remove('fresh'); }, 600);
    }, 30);
  }

  function setTargetFromInput() {
    let v = parseInt(el.targetInput.value, 10);
    if (isNaN(v)) { say('Type a whole number for the target.', 'bad'); el.targetInput.value = state.target; return; }
    v = Math.max(0, Math.min(500, v));
    state.target = v;
    save();
    state.streak = 0;
    newPuzzle();
  }

  function currentValue() {
    const nums = state.numSlots.map((id) => tileById(id).value);
    return Solver.evaluate(nums, state.opSlots);
  }

  function check() {
    if (state.locked || state.busy) return;
    if (state.numSlots.includes(null) || state.opSlots.includes(null)) {
      shake();
      say('Fill in every box first! 📦');
      return;
    }
    const r = currentValue();
    if (r && r.value.d === 1 && r.value.n === state.target) win();
    else lose(r);
  }

  const CHEERS = ['Yay!', 'Awesome!', 'Brilliant!', 'You got it!', 'Math wizard!', 'Super!'];
  function win() {
    state.locked = true;
    state.streak++; state.solved++;
    render();
    FunSound.play('yay');
    const c = CHEERS[Math.floor(Math.random() * CHEERS.length)];
    showOverlay('win', '<div><span class="big">🎉</span>' + c +
      '<div class="sub">Next puzzle coming up…</div></div>');
    el.board.classList.add('celebrate');
    confetti();
    say('');
    later(() => { el.board.classList.remove('celebrate'); newPuzzle(true); }, 2600);
  }

  function lose(r) {
    state.streak = 0;
    el.streak.textContent = 0;
    FunSound.play('ohhh');
    shake();
    showOverlay('lose', '<div><span class="big">✖</span>Not quite!</div>');
    later(hideOverlay, 950);
    say(r ? 'That makes ' + fmt(r.value) + ', not ' + state.target + '. Try again! 💪'
          : 'You can’t divide by zero! Try again. 💪', 'bad');
  }

  function shake() {
    el.stage.classList.remove('shake');
    void el.stage.offsetWidth;
    el.stage.classList.add('shake');
  }

  function showOverlay(kind, html) {
    el.overlay.className = 'overlay show ' + kind;
    el.overlay.innerHTML = html;
  }
  function hideOverlay() { el.overlay.className = 'overlay'; el.overlay.innerHTML = ''; }

  // ---------- help ----------
  function help() {
    if (state.locked || state.busy || !state.solution) return;
    const sol = state.solution;
    // already a valid answer? (there can be more than one)
    if (!state.numSlots.includes(null) && !state.opSlots.includes(null)) {
      const r = currentValue();
      if (r && r.value.d === 1 && r.value.n === state.target) {
        say('That already works! Press Check ✔', 'good');
        return;
      }
    }
    for (let i = 0; i < 7; i++) {
      if (i % 2 === 0) {
        const k = i / 2;
        const cur = state.numSlots[k] === null ? null : tileById(state.numSlots[k]).value;
        if (cur === sol.nums[k]) continue;
        const v = sol.nums[k];
        // pick a tile of that value that isn't already in its correct place
        const isCorrectlyPlaced = (t) => {
          const j = inSlot(t.id);
          return j !== -1 && sol.nums[j] === t.value;
        };
        const cand = state.tiles.filter((t) => t.value === v && !isCorrectlyPlaced(t));
        const t = cand.find((x) => inSlot(x.id) === -1) || cand[0];
        const old = inSlot(t.id);
        if (old !== -1) state.numSlots[old] = null;
        state.numSlots[k] = t.id;
        state.hinted.add('n' + k);
      } else {
        const k = (i - 1) / 2;
        if (state.opSlots[k] === sol.ops[k]) continue;
        state.opSlots[k] = sol.ops[k];
        state.hinted.add('o' + k);
      }
      state.hints++;
      FunSound.play('hint');
      say('💡 Here’s a hint – look for the glowing green box!');
      render();
      return;
    }
    say('Everything matches my hints. Press Check ✔', 'good');
  }

  // ---------- confetti ----------
  const cv = $('#confetti');
  const cctx = cv.getContext('2d');
  let parts = [], raf = 0;
  function resizeCanvas() { cv.width = innerWidth; cv.height = innerHeight; }
  addEventListener('resize', resizeCanvas);
  resizeCanvas();
  function confetti() {
    const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#a29bfe', '#ff9ff3'];
    for (let i = 0; i < 160; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.45,
        vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4,
        s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: colors[i % colors.length], life: 140 + Math.random() * 60,
      });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    cctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter((p) => p.life > 0 && p.y < cv.height + 30);
    parts.forEach((p) => {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
      cctx.save();
      cctx.translate(p.x, p.y); cctx.rotate(p.r);
      cctx.fillStyle = p.c;
      cctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      cctx.restore();
    });
    raf = parts.length ? requestAnimationFrame(tick) : 0;
    if (!parts.length) cctx.clearRect(0, 0, cv.width, cv.height);
  }

  // ---------- wiring ----------
  $('#check').addEventListener('click', check);
  $('#help').addEventListener('click', help);
  $('#clear').addEventListener('click', () => {
    if (state.locked) return;
    state.numSlots = [null, null, null, null];
    state.opSlots = [null, null, null];
    state.hinted = new Set();
    say('');
    render();
  });
  $('#newq').addEventListener('click', () => { if (!state.busy) { FunSound.play('whoosh'); newPuzzle(); } });
  $('#setTarget').addEventListener('click', setTargetFromInput);
  el.targetInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') setTargetFromInput(); });
  document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    if (state.level === b.dataset.level) return;
    state.level = b.dataset.level;
    syncChips();
    save();
    newPuzzle();
  }));
  function syncChips() {
    document.querySelectorAll('.chip').forEach((b) => {
      const on = b.dataset.level === state.level;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on);
    });
  }
  function syncMute() { el.mute.textContent = FunSound.isMuted() ? '🔇' : '🔊'; }
  el.mute.addEventListener('click', () => {
    FunSound.setMuted(!FunSound.isMuted());
    syncMute();
    FunSound.play('pop');
  });

  syncChips();
  syncMute();
  newPuzzle();
})();
