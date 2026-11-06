// Puzzle logic for the 24 game: exact fraction maths, evaluation, solver, generator.
// Works in the browser (window.Solver) and in Node (module.exports) so it can be tested.
//
// A "solution" / "arrangement" is { nums:[4], ops:[3], open:[4], close:[4] }
//   open[i]  = number of "(" placed just before number i
//   close[i] = number of ")" placed just after number i
(function (root) {
  const OPS = ['+', '-', '*', '/'];
  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const ZEROS = () => [0, 0, 0, 0];

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
  function frac(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
  const div = (a, b) => frac(a.n * b.d, a.d * b.n);
  const key = (f) => f.n + '/' + f.d;

  // ---- evaluation WITHOUT brackets (used by the easy-mode generator) ----
  // usesFraction = some multiply/divide step produced a non-whole number.
  function evaluate(nums, ops) {
    let total = frac(0, 1);
    let sign = '+';
    let cur = frac(nums[0], 1);
    let usesFraction = false;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const next = frac(nums[i + 1], 1);
      if (op === '*') {
        cur = mul(cur, next);
      } else if (op === '/') {
        if (next.n === 0) return null;
        cur = div(cur, next);
      } else {
        total = sign === '+' ? add(total, cur) : sub(total, cur);
        sign = op;
        cur = next;
        continue;
      }
      if (cur.d !== 1) usesFraction = true;
    }
    total = sign === '+' ? add(total, cur) : sub(total, cur);
    return { value: total, usesFraction };
  }

  // ---- evaluation WITH brackets (used when the player presses Check) ----
  // Returns { value } or { error: 'brackets' | 'div0' }.
  function evaluateFull(nums, ops, open, close) {
    open = open || ZEROS(); close = close || ZEROS();
    const toks = [];
    let depth = 0;
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < open[i]; k++) { toks.push('('); depth++; }
      toks.push(nums[i]);
      for (let k = 0; k < close[i]; k++) { toks.push(')'); depth--; if (depth < 0) return { error: 'brackets' }; }
      if (i < 3) toks.push(ops[i]);
    }
    if (depth !== 0) return { error: 'brackets' };
    let p = 0;
    function factor() {
      const t = toks[p++];
      if (t === '(') { const v = expr(); p++; return v; }
      return frac(t, 1);
    }
    function term() {
      let v = factor();
      while (toks[p] === '*' || toks[p] === '/') {
        const o = toks[p++];
        const r = factor();
        if (o === '/') { if (r.n === 0) throw 'div0'; v = div(v, r); } else v = mul(v, r);
      }
      return v;
    }
    function expr() {
      let v = term();
      while (toks[p] === '+' || toks[p] === '-') {
        const o = toks[p++];
        const r = term();
        v = o === '+' ? add(v, r) : sub(v, r);
      }
      return v;
    }
    try { return { value: expr() }; } catch (e) { if (e === 'div0') return { error: 'div0' }; throw e; }
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => {
      permutations(arr.slice(0, i).concat(arr.slice(i + 1))).forEach(p => out.push([x, ...p]));
    });
    return out;
  }

  // ---- easy mode: solutions that need no brackets and no fractions ----
  function solveNoBrackets(numbers, target) {
    const seen = new Set();
    for (const p of permutations(numbers)) {
      const k = p.join(',');
      if (seen.has(k)) continue;
      seen.add(k);
      for (const a of OPS) for (const b of OPS) for (const c of OPS) {
        const r = evaluate(p, [a, b, c]);
        if (!r || r.value.d !== 1 || r.value.n !== target || r.usesFraction) continue;
        return { nums: p, ops: [a, b, c], open: ZEROS(), close: ZEROS() };
      }
    }
    return null;
  }

  // ---- hard mode: search every way of combining the numbers (brackets allowed) ----
  // Returns { whole, fractional }: an arrangement using only whole numbers along the way,
  // and one that needs a fraction somewhere (either may be null).
  function solveBrackets(numbers, target) {
    const res = new Array(16);
    for (let i = 0; i < 4; i++) {
      const m = new Map();
      const f = frac(numbers[i], 1);
      m.set(key(f), { v: f, whole: { leaf: numbers[i] }, frac: null });
      res[1 << i] = m;
    }
    for (let mask = 1; mask < 16; mask++) {
      if ((mask & (mask - 1)) === 0) continue;
      const out = new Map();
      for (let A = (mask - 1) & mask; A > 0; A = (A - 1) & mask) {
        const B = mask ^ A;
        for (const ea of res[A].values()) for (const eb of res[B].values()) {
          for (const op of OPS) {
            if ((op === '+' || op === '*') && A > B) continue; // same value either way round
            let v;
            if (op === '+') v = add(ea.v, eb.v);
            else if (op === '-') v = sub(ea.v, eb.v);
            else if (op === '*') v = mul(ea.v, eb.v);
            else { if (eb.v.n === 0) continue; v = div(ea.v, eb.v); }
            const k = key(v);
            let e = out.get(k);
            if (!e) { e = { v, whole: null, frac: null }; out.set(k, e); }
            if (e.whole && e.frac) continue;
            for (const va of [ea.whole, ea.frac]) {
              if (!va) continue;
              for (const vb of [eb.whole, eb.frac]) {
                if (!vb) continue;
                const isWhole = va === ea.whole && vb === eb.whole && v.d === 1;
                if (isWhole) { if (!e.whole) e.whole = { op, l: va, r: vb }; }
                else if (!e.frac) e.frac = { op, l: va, r: vb };
              }
            }
          }
        }
      }
      res[mask] = out;
    }
    const e = res[15].get(key(frac(target, 1)));
    return {
      whole: e && e.whole ? toArrangement(e.whole, target) : null,
      fractional: e && e.frac ? toArrangement(e.frac, target) : null,
    };
  }

  // Turn an expression tree into numbers / signs / bracket counts, using as few brackets as possible.
  function toArrangement(tree, target) {
    const toks = [];
    (function emit(n, parentOp, side) {
      if (n.leaf !== undefined) { toks.push({ num: n.leaf }); return; }
      const need = parentOp && (
        PREC[n.op] < PREC[parentOp] ||
        (side === 'r' && ((parentOp === '-' && PREC[n.op] === 1) || (parentOp === '/' && PREC[n.op] === 2)))
      );
      if (need) toks.push('(');
      emit(n.l, n.op, 'l');
      toks.push({ op: n.op });
      emit(n.r, n.op, 'r');
      if (need) toks.push(')');
    })(tree, null, null);

    const nums = [], ops = [], open = ZEROS(), close = ZEROS();
    let pending = 0, idx = -1;
    for (const t of toks) {
      if (t === '(') pending++;
      else if (t === ')') close[idx]++;
      else if (t.num !== undefined) { idx++; nums.push(t.num); open[idx] = pending; pending = 0; }
      else ops.push(t.op);
    }
    const arr = { nums, ops, open, close };
    // safety net: the arrangement must really make the target
    const r = evaluateFull(nums, ops, open, close);
    return r.value && r.value.d === 1 && r.value.n === target ? arr : null;
  }

  function rnd(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  // Make a puzzle for the target. difficulty: 'easy' | 'hard'.
  //  easy: numbers 1-13, solvable with + - x / only (no brackets, no fractions).
  //  hard: numbers 0-13, brackets allowed, and the answer needs a fraction along the way
  //        (for example 8 / (3 - 8 / 3) = 24).
  // Returns { numbers, solution } or null if nothing was found in time.
  function generate(target, difficulty, timeLimitMs) {
    const hard = difficulty === 'hard';
    const lo = hard ? 0 : 1;
    const start = Date.now();
    const deadline = start + (timeLimitMs || 1500);
    const strictUntil = start + 400; // first prefer puzzles where a fraction is *required*
    let fallback = null;
    while (Date.now() < deadline) {
      const nums = [rnd(lo, 13), rnd(lo, 13), rnd(lo, 13), rnd(lo, 13)];
      if (!hard) {
        const sol = solveNoBrackets(nums, target);
        if (sol) return { numbers: nums, solution: sol };
        continue;
      }
      const s = solveBrackets(nums, target);
      if (s.fractional && !s.whole) return { numbers: nums, solution: s.fractional };
      if (s.fractional && !fallback) fallback = { numbers: nums, solution: s.fractional };
      if (fallback && Date.now() > strictUntil) return fallback;
    }
    return fallback;
  }

  const api = { OPS, evaluate, evaluateFull, solveBrackets, solveNoBrackets, generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Solver = api;
})(typeof window !== 'undefined' ? window : globalThis);
