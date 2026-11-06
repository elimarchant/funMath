# FunMath 🎲

A collection of fun, kid-friendly maths games that run right in the browser. No install, no build step, no dependencies.

## ▶️ Play now

**https://elimarchant.github.io/funMath/**

Straight to the 24 game: https://elimarchant.github.io/funMath/games/24/

Source code: https://github.com/elimarchant/funMath

Right now there is one game, with room to add more.

## 🎯 24

Pick a target number (24 by default). The game deals you four numbers. Drag them into the empty boxes, drag `+ − × ÷` between them, and press **Check**.

> Target 20 with `5, 5, 5, 2`  →  `5 × 2 + 5 + 5 = 20` ✅

### Features

- **Choose your target** – 24 is the classic, but type in any whole number from 0 to 50. Press Enter or click away and a new puzzle starts straight away.
- **Drag and drop** numbers, signs and brackets into place. It also works by tapping, so it's fine on phones and tablets.
- **Check** – right answer: confetti, a cheer ("yay!") and a new puzzle with the same target. Wrong answer: a red ✖, a shake, a sad "ohhh" and you stay on the same puzzle. It tells you what your equation actually equals.
- **Help** – each click gives one hint at random: it puts a correct number, sign or bracket in a spot that isn't right yet (replacing a wrong guess there) and marks it with a green outline. It never touches a piece that is already correct.
- **New question** button.
- **Difficulty**
  - *Easy*: numbers 1–13, never any fractions, no brackets.
  - *Hard*: numbers 0–13, and the answer needs fractions along the way, so you get **brackets** too, e.g. `8 ÷ (3 − 8 ÷ 3) = 24`. Drag `(` and `)` into the thin gaps before and after the number boxes. They are always on offer, like the signs, even when a puzzle doesn't need them.
- Streak and solved counters, and a mute button for the sounds.
- Every puzzle is guaranteed solvable.

Maths follows normal school rules: brackets first, then `×` and `÷`, then `+` and `−`. Fractions are computed exactly, so there are no rounding errors.

### Sounds

The sounds are synthesised in the browser with the Web Audio API, so there are no audio files. To use real recordings, edit `assets/js/sound.js`.

## Run it

Open `index.html` in a browser. Or serve the folder:

```sh
npx serve .
# or
python -m http.server 8000
```

The live site is hosted on GitHub Pages, served from the `main` branch.

## Project layout

```
index.html              Home page listing all games
assets/
  css/common.css        Shared look and feel
  js/sound.js           Shared sound effects (window.FunSound)
games/
  24/
    index.html          The 24 game page
    style.css
    game.js             UI, drag & drop, check, help
    solver.js           Exact-fraction evaluator, solver and puzzle generator
```

### Adding a new game

1. Create `games/<name>/index.html` (with its own CSS and JS).
2. Link `../../assets/css/common.css` and `../../assets/js/sound.js` to reuse the shared styles and sounds.
3. Add a card for it in the root `index.html`.

## Tests

The puzzle logic in `games/24/solver.js` also runs in Node:

```sh
node -e "const S=require('./games/24/solver.js'); console.log(S.solveBrackets([3,3,8,8],24))"
```
