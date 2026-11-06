(function () {
  'use strict';

  const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const MAX_TARGET = 50;
  const MAX_BRACKETS_PER_SPOT = 3;
  const $ = (s) => document.querySelector(s);
  const el = {
    tray: $('#tray'), board: $('#board'), stage: $('#stage'), bpalette: $('#bpalette'),
    goal: $('#goal'), message: $('#message'), overlay: $('#overlay'),
    targetInput: $('#targetInput'), levelNote: $('#levelNote'), rule: $('#rule'),
    streak: $('#streak'), solved: $('#solved'), helpCount: $('#helpCount'),
    mute: $('#mute'),
  };
  const slotEls = {
    num: [...el.board.querySelectorAll('.slot.num')],
    op: [...el.board.querySelectorAll('.slot.op')],
  };
  const zoneEls = {
    open: [...el.board.querySelectorAll('.bz.open')],
    close: [...el.board.querySelectorAll('.bz.close')],
  };

  // ---------- state ----------
  const zeros = () => [0, 0, 0, 0];
  const state = {
    target: 24,
    level: 'easy',
    brackets: false,                       // are brackets offered in this puzzle?
    tiles: [],                             // [{id, value}]
    numSlots: [null, null, null, null],    // tile ids
    opSlots: [null, null, null],           // '+', '-', '*', '/'
    br: { open: zeros(), close: zeros() }, // how many "(" before / ")" after each number
    armed: null,                           // 'open' | 'close' – bracket picked up by tapping
    solution: null,                        // {nums, ops, open, close}
    hinted: new Set(),                     // 'n0', 'o1', 'bo2', 'bc3' ...
    hints: 0,
    streak: 0,
    solved: 0,
    locked: false,
    busy: false,
    queued: false,
  };
  let timers = [];

  try {
    const t = parseInt(localStorage.getItem('funmath.24.target'), 10);
    if (t >= 0 && t <= MAX_TARGET) state.target = t;
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
    // bracket zones
    ['open', 'close'].forEach((kind) => {
      const pre = kind === 'open' ? 'bo' : 'bc';
      zoneEls[kind].forEach((z, i) => {
        z.innerHTML = '';
        const n = state.br[kind][i];
        for (let k = 0; k < n; k++) {
          const d = makeTile(kind === 'open' ? '(' : ')', 'br');
          d.dataset.br = kind === 'open' ? '(' : ')';
          d.dataset.slot = pre + i;
          if (state.hinted.has(pre + i) && state.solution[kind][i] === n) d.classList.add('hinted');
          z.appendChild(d);
        }
      });
    });
    // brackets that were picked up by tapping
    el.stage.classList.toggle('armed-open', state.armed === 'open');
    el.stage.classList.toggle('armed-close', state.armed === 'close');
    el.bpalette.querySelectorAll('.tile').forEach((t) => {
      t.classList.toggle('armed', !!state.armed && ((t.dataset.br === '(') === (state.armed === 'open')));
    });
    // make sure no tile in the (static) sign/bracket trays is ever left looking "used"
    document.querySelectorAll('.palette .tile.dragging').forEach((t) => t.classList.remove('dragging'));

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
  // brackets: a spot holds a few; drag one in, or move one between spots
  function putBracket(kind, slotIdx, fromIdx) {
    if (fromIdx === slotIdx) return true;
    const arr = state.br[kind];
    if (arr[slotIdx] >= MAX_BRACKETS_PER_SPOT) { say('That spot is full!'); return false; }
    if (fromIdx !== -1) arr[fromIdx]--;
    arr[slotIdx]++;
    return true;
  }

  // Information about what a pointer grabbed
  function describe(target) {
    const t = target.closest('.tile');
    if (!t) return null;
    const sl = t.dataset.slot || '';
    if (t.dataset.tile !== undefined) {
      return { kind: 'num', el: t, id: +t.dataset.tile, from: sl ? +sl.slice(1) : -1 };
    }
    if (t.dataset.op) {
      return { kind: 'op', el: t, op: t.dataset.op, from: sl ? +sl.slice(1) : -1 };
    }
    if (t.dataset.br) {
      return { kind: t.dataset.br === '(' ? 'open' : 'close', el: t, from: sl ? +sl.slice(2) : -1 };
    }
    return null;
  }

  function tap(src) {
    if (src.kind === 'open' || src.kind === 'close') {
      if (src.from === -1) {
        // pick the bracket up; then tap a gap to put it down
        state.armed = state.armed === src.kind ? null : src.kind;
        say(state.armed ? 'Now tap a glowing gap next to a number (or just drag it there).' : '');
        FunSound.play('pop');
        return render();
      }
      state.br[src.kind][src.from]--;
    } else if (src.kind === 'num') {
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
    state.armed = null;
    FunSound.play('pop');
    say('');
    render();
  }

  function drop(src, targetEl) {
    state.armed = null;
    if (targetEl) {
      const i = +targetEl.dataset.i;
      const kind = targetEl.dataset.kind;
      if (src.kind === 'num' && kind === 'num') putTile(src.id, i, src.from);
      else if (src.kind === 'op' && kind === 'op') putOp(src.op, i, src.from);
      else if ((src.kind === 'open' || src.kind === 'close') && kind === src.kind) {
        if (!putBracket(src.kind, i, src.from)) return render();
      } else return render();
      FunSound.play('drop');
    } else if (src.from !== -1) {
      // dragged off the board → back to the tray
      if (src.kind === 'num') state.numSlots[src.from] = null;
      else if (src.kind === 'op') state.opSlots[src.from] = null;
      else state.br[src.kind][src.from]--;
      FunSound.play('pop');
    }
    say('');
    render();
  }

  // ---------- drag & drop (pointer events: mouse, touch and pen) ----------
  let drag = null;
  document.addEventListener('pointerdown', (e) => {
    if (state.locked || e.button > 0) return;
    // a bracket is picked up and the player taps a gap
    const zone = e.target.closest('.bz');
    if (state.armed && zone && zone.dataset.kind === state.armed) {
      const kind = state.armed;
      state.armed = null;
      if (putBracket(kind, +zone.dataset.i, -1)) { FunSound.play('drop'); say(''); }
      render();
      e.preventDefault();
      return;
    }
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
      // only dim tiles that really leave the board; the sign/bracket trays hand out copies
      if (drag.src.from !== -1) drag.src.el.classList.add('dragging');
      if (drag.src.kind === 'open' || drag.src.kind === 'close') el.stage.classList.add('drag-' + drag.src.kind);
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const spot = under && under.closest('.slot, .bz');
    const ok = spot && spot.dataset.kind === drag.src.kind ? spot : null;
    if (ok !== drag.over) {
      if (drag.over) drag.over.classList.remove('over');
      if (ok) ok.classList.add('over');
      drag.over = ok;
    }
  });
  function endDrag(cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.ghost) d.ghost.remove();
    if (d.over) d.over.classList.remove('over');
    d.src.el.classList.remove('dragging');           // <- the "faded sign" bug lived here
    el.stage.classList.remove('drag-open', 'drag-close');
    if (cancelled) return render();
    if (!d.moved) return tap(d.src);
    drop(d.src, d.over);
  }
  document.addEventListener('pointerup', () => endDrag(false));
  document.addEventListener('pointercancel', () => endDrag(true));

  // ---------- puzzle flow ----------
  function resetBoard() {
    state.numSlots = [null, null, null, null];
    state.opSlots = [null, null, null];
    state.br = { open: zeros(), close: zeros() };
    state.armed = null;
    state.hinted = new Set();
    state.hints = 0;
  }

  const LEVEL_NOTE = {
    easy: 'Easy: numbers 1–13, and you never need fractions.',
    hard: 'Hard: numbers 0–13, you get brackets ( ), and the answer needs fractions along the way, like 8 ÷ (3 − 8 ÷ 3).',
  };

  function newPuzzle(keepMsg, previousTarget) {
    if (state.busy) { state.queued = true; return; }
    state.busy = true;
    clearTimers();
    hideOverlay();
    if (!keepMsg) say('Finding a puzzle…');
    el.levelNote.textContent = LEVEL_NOTE[state.level];
    later(() => {
      const p = Solver.generate(state.target, state.level, 1500);
      state.busy = false;
      if (!p) {
        say('Hmm, I couldn’t find a puzzle that makes ' + state.target + '. Try another target!', 'bad');
        if (previousTarget !== undefined) { state.target = previousTarget; save(); }
        render();
      } else {
        state.locked = false;
        resetBoard();
        state.solution = p.solution;
        state.brackets = state.level === 'hard';
        el.stage.classList.toggle('brackets', state.brackets);
        el.rule.textContent = state.brackets
          ? 'Brackets first, then × and ÷, then + and −. Brackets are optional: use them only if you need them.'
          : '× and ÷ are done before + and −, just like in school. 5×2+5+5 = 20.';
        state.tiles = p.numbers.map((v, i) => ({ id: i, value: v }));
        say('');
        render();
        el.board.classList.add('fresh'); el.tray.classList.add('fresh');
        later(() => { el.board.classList.remove('fresh'); el.tray.classList.remove('fresh'); }, 600);
      }
      if (state.queued) { state.queued = false; newPuzzle(); }
    }, 30);
  }

  // Typing a new target (then pressing Enter or clicking away) starts a fresh puzzle straight away.
  function commitTarget() {
    let v = parseInt(el.targetInput.value, 10);
    if (isNaN(v)) { el.targetInput.value = state.target; return; }
    v = Math.max(0, Math.min(MAX_TARGET, v));
    el.targetInput.value = v;
    if (v === state.target && state.solution) return;   // nothing changed
    const prev = state.target;
    state.target = v;
    save();
    state.streak = 0;
    newPuzzle(false, prev);
  }

  function currentValue() {
    const nums = state.numSlots.map((id) => tileById(id).value);
    return Solver.evaluateFull(nums, state.opSlots, state.br.open, state.br.close);
  }
  const isTarget = (r) => r.value && r.value.d === 1 && r.value.n === state.target;

  function check() {
    if (state.locked || state.busy) return;
    if (state.numSlots.includes(null) || state.opSlots.includes(null)) {
      shake();
      say('Fill in every box first! 📦');
      return;
    }
    const r = currentValue();
    if (r.error === 'brackets') {
      shake();
      say('Your brackets don’t match up – every ( needs a ) 🙂');
    } else if (isTarget(r)) win();
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
    say(r.value ? 'That makes ' + fmt(r.value) + ', not ' + state.target + '. Try again! 💪'
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
  // Every piece that is not yet in its correct place is a possible hint; one is picked at random.
  // A hint never touches a piece that is already correct, and it replaces whatever wrong guess
  // was sitting in that box.
  function help() {
    if (state.locked || state.busy || !state.solution) return;
    const sol = state.solution;
    state.armed = null;

    // already a valid answer? (there can be more than one)
    if (!state.numSlots.includes(null) && !state.opSlots.includes(null)) {
      const r = currentValue();
      if (isTarget(r)) { say('That already works! Press Check ✔', 'good'); render(); return; }
    }

    const wrong = [];
    for (let k = 0; k < 4; k++) {
      const cur = state.numSlots[k] === null ? null : tileById(state.numSlots[k]).value;
      if (cur !== sol.nums[k]) wrong.push({ t: 'n', k });
    }
    for (let k = 0; k < 3; k++) if (state.opSlots[k] !== sol.ops[k]) wrong.push({ t: 'o', k });
    if (state.brackets) {
      for (let k = 0; k < 4; k++) {
        if (state.br.open[k] !== sol.open[k]) wrong.push({ t: 'bo', k });
        if (state.br.close[k] !== sol.close[k]) wrong.push({ t: 'bc', k });
      }
    }
    if (!wrong.length) { say('Everything matches my hints. Press Check ✔', 'good'); render(); return; }

    const pick = wrong[Math.floor(Math.random() * wrong.length)];
    const k = pick.k;
    if (pick.t === 'n') {
      const v = sol.nums[k];
      // a tile of that value that isn't already sitting in its correct place
      const placedRight = (t) => { const j = inSlot(t.id); return j !== -1 && sol.nums[j] === t.value; };
      const cand = state.tiles.filter((t) => t.value === v && !placedRight(t));
      const t = cand.find((x) => inSlot(x.id) === -1) || cand[0];
      const old = inSlot(t.id);
      if (old !== -1) state.numSlots[old] = null;
      state.numSlots[k] = t.id;            // whatever wrong tile was here goes back to the tray
    } else if (pick.t === 'o') {
      state.opSlots[k] = sol.ops[k];       // replaces a wrong sign if there was one
    } else {
      const kind = pick.t === 'bo' ? 'open' : 'close';
      const cur = state.br[kind][k];
      state.br[kind][k] = cur < sol[kind][k] ? cur + 1 : cur - 1;   // add a missing / take away an extra bracket
    }
    state.hinted.add(pick.t === 'n' ? 'n' + k : pick.t === 'o' ? 'o' + k : pick.t + k);
    state.hints++;
    FunSound.play('hint');
    say('💡 Here’s a hint – look for the glowing green outline!');
    render();
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
    state.br = { open: zeros(), close: zeros() };
    state.armed = null;
    state.hinted = new Set();
    say('');
    render();
  });
  $('#newq').addEventListener('click', () => { if (!state.busy) { FunSound.play('whoosh'); newPuzzle(); } });
  el.targetInput.addEventListener('change', commitTarget);
  el.targetInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commitTarget(); el.targetInput.blur(); }
  });
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
