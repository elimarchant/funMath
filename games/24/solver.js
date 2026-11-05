// Puzzle logic for the 24 game: exact fraction maths, evaluation, solver, generator.
// Works in the browser (window.Solver) and in Node (module.exports) so it can be tested.
(function (root) {
  const OPS = ['+', '-', '*', '/'];

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

  // Evaluate  n0 op0 n1 op1 n2 op2 n3  with normal precedence (x and / before + and -).
  // Returns { value: fraction, usesFraction: bool } or null (division by zero).
  // usesFraction = some multiply/divide step in the middle produced a non-whole number.
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

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((x, i) => {
      permutations(arr.slice(0, i).concat(arr.slice(i + 1))).forEach(p => out.push([x, ...p]));
    });
    return out;
  }

  // Find solutions. Returns { whole: solution|null, fractional: solution|null }
  // whole      = a solution where nothing but whole numbers appears along the way
  // fractional = a solution that needs a fraction somewhere
  function solve(numbers, target) {
    let whole = null, fractional = null;
    const seen = new Set();
    for (const p of permutations(numbers)) {
      const key = p.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      for (const a of OPS) for (const b of OPS) for (const c of OPS) {
        const r = evaluate(p, [a, b, c]);
        if (!r || r.value.d !== 1 || r.value.n !== target) continue;
        const sol = { nums: p, ops: [a, b, c] };
        if (r.usesFraction) { if (!fractional) fractional = sol; }
        else if (!whole) whole = sol;
        if (whole && fractional) return { whole, fractional };
      }
    }
    return { whole, fractional };
  }

  function rnd(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

  // Make a puzzle for the target. difficulty: 'easy' | 'hard'.
  //  easy: numbers 1-13, solvable using whole numbers only (no fractions needed).
  //  hard: numbers 0-13, every solution needs a fraction somewhere.
  // Returns { numbers, solution } or null if nothing was found in time.
  function generate(target, difficulty, timeLimitMs) {
    const hard = difficulty === 'hard';
    const lo = hard ? 0 : 1;
    const start = Date.now();
    const deadline = start + (timeLimitMs || 1500);
    const strictUntil = start + 250; // briefly prefer puzzles where a fraction is *required*
    let fallback = null;
    while (Date.now() < deadline) {
      const nums = [rnd(lo, 13), rnd(lo, 13), rnd(lo, 13), rnd(lo, 13)];
      const s = solve(nums, target);
      if (hard) {
        if (s.fractional && !s.whole) return { numbers: nums, solution: s.fractional };
        if (s.fractional && !fallback) fallback = { numbers: nums, solution: s.fractional };
        if (fallback && Date.now() > strictUntil) return fallback;
      } else if (s.whole) {
        return { numbers: nums, solution: s.whole };
      }
    }
    return fallback;
  }

  const api = { OPS, evaluate, solve, generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Solver = api;
})(typeof window !== 'undefined' ? window : globalThis);
