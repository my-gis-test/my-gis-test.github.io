/* GIS — Turn or Mirror (mental rotation). Random chiral heptominoes; decide whether the right figure is the left one turned, or its mirror image. */
(function (root) {
  'use strict';
  const GIS = root.GIS;
  const U = GIS.util;

  const SECONDS = 90;
  const CEILING = 60;
  const CELLS = 7;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const MAX_RUN = 3; // never more than 3 identical answers in a row

  // ------------------------------------------------------------- shape maths
  // A shape is an array of [x, y] grid cells. Shapes are compared in a
  // normalised form (shifted so min x = min y = 0, cells sorted), so two
  // shapes are equal iff their keys are equal.

  function normalize(cells) {
    let mx = Infinity;
    let my = Infinity;
    for (const [x, y] of cells) {
      if (x < mx) mx = x;
      if (y < my) my = y;
    }
    return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  const key = (cells) => normalize(cells).map((c) => c.join(',')).join(';');
  const rotate90 = (cells) => normalize(cells.map(([x, y]) => [-y, x]));
  const mirror = (cells) => normalize(cells.map(([x, y]) => [-x, y]));

  /** The 4 lattice rotations (0, 90, 180, 270 degrees), normalised. */
  function rotations(cells) {
    const out = [normalize(cells)];
    for (let i = 1; i < 4; i++) out.push(rotate90(out[i - 1]));
    return out;
  }

  /** Chiral iff the mirror image matches none of the 4 rotations. */
  function isChiral(cells) {
    const m = key(mirror(cells));
    return !rotations(cells).some((r) => key(r) === m);
  }

  function bbox(cells) {
    const n = normalize(cells);
    let w = 0;
    let hgt = 0;
    for (const [x, y] of n) {
      w = Math.max(w, x + 1);
      hgt = Math.max(hgt, y + 1);
    }
    return { w, h: hgt };
  }

  /** True iff all cells are distinct and edge-connected (flood fill). */
  function isConnected(cells) {
    const set = new Set(cells.map((c) => c.join(',')));
    if (set.size !== cells.length || !cells.length) return false;
    const seen = new Set([cells[0].join(',')]);
    const stack = [cells[0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of DIRS) {
        const k = `${x + dx},${y + dy}`;
        if (set.has(k) && !seen.has(k)) {
          seen.add(k);
          stack.push([x + dx, y + dy]);
        }
      }
    }
    return seen.size === set.size;
  }

  /** Grow a random polyomino: start with one cell, add random edge-neighbours. */
  function grow(rng, n) {
    const cells = [[0, 0]];
    const set = new Set(['0,0']);
    while (cells.length < n) {
      const [x, y] = rng.pick(cells);
      const [dx, dy] = rng.pick(DIRS);
      const k = `${x + dx},${y + dy}`;
      if (!set.has(k)) {
        set.add(k);
        cells.push([x + dx, y + dy]);
      }
    }
    return normalize(cells);
  }

  /** Random heptomino that is chiral and spans at least 3×3. */
  function generateShape(rng) {
    for (;;) {
      const s = grow(rng, CELLS);
      const b = bbox(s);
      if (b.w >= 3 && b.h >= 3 && isChiral(s)) return s;
    }
  }

  // ------------------------------------------------------------------ trials

  /**
   * Fair coin, except that a 4th identical answer in a row is forbidden.
   * The rule is symmetric in same/mirror, so the long-run balance stays 50/50.
   */
  function nextAnswer(rng, prevAnswers) {
    const n = prevAnswers.length;
    if (n >= MAX_RUN) {
      const last = prevAnswers.slice(n - MAX_RUN);
      if (last.every((a) => a === last[0])) return last[0] === 'same' ? 'mirror' : 'same';
    }
    return rng.chance(0.5) ? 'same' : 'mirror';
  }

  /** One trial; `prevAnswers` = answers of the earlier trials in this run. */
  function makeTrial(rng, prevAnswers) {
    const answer = nextAnswer(rng, prevAnswers || []);
    const cells = generateShape(rng);
    const left = 45 * rng.int(0, 7);
    const delta = 45 * rng.int(1, 7); // never 0: the right figure is always turned
    return {
      cells,
      rightCells: answer === 'mirror' ? mirror(cells) : cells,
      left,
      right: (left + delta) % 360,
      answer,
    };
  }

  /**
   * Stateful maker for speedTask. It owns its rng (ignoring the one speedTask
   * passes) so practice trials can never consume the scored stream.
   */
  function trialMaker(rng) {
    const history = [];
    return (_ignored, index) => {
      if (index === 0) history.length = 0;
      const t = makeTrial(rng, history);
      history.push(t.answer);
      return t;
    };
  }

  // --------------------------------------------------------------- geometry
  // Figures are drawn centred on the centroid of the cell centres and turned
  // about it by the trial angle (SVG rotate is clockwise on screen; y points
  // down). placedCenters reproduces exactly that, so tests can check what the
  // taker actually sees.

  function centroid(cells) {
    return [U.sum(cells, (c) => c[0] + 0.5) / cells.length, U.sum(cells, (c) => c[1] + 0.5) / cells.length];
  }

  function placedCenters(cells, angle) {
    const [cx, cy] = centroid(cells);
    const a = (angle * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return cells.map(([x, y]) => {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      return [dx * cos - dy * sin, dx * sin + dy * cos];
    });
  }

  /** Order-independent equality of two point sets (tolerance 1e-6; +0 folds -0 into 0). */
  function sameSet(a, b) {
    const k = (pts) => pts.map(([x, y]) => `${Math.round(x * 1e6) + 0},${Math.round(y * 1e6) + 0}`).sort().join(';');
    return k(a) === k(b);
  }

  // ------------------------------------------------------------------ render

  const PANEL = 200;

  function figureSvg(cells, angle, scale) {
    const [cx, cy] = centroid(cells);
    const c = PANEL / 2;
    const size = scale * 0.86; // thin white gaps between cells
    const rects = cells
      .map(([x, y]) => {
        const px = c + (x + 0.5 - cx) * scale - size / 2;
        const py = c + (y + 0.5 - cy) * scale - size / 2;
        return `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="#000"/>`;
      })
      .join('');
    return (
      `<svg width="${PANEL}" height="${PANEL}" viewBox="0 0 ${PANEL} ${PANEL}" role="img" aria-label="figure">` +
      `<rect x="0" y="0" width="${PANEL}" height="${PANEL}" fill="#fff"/>` +
      `<g transform="rotate(${angle} ${c} ${c})">${rects}</g></svg>`
    );
  }

  /** Cell size so the farthest corner stays inside the panel at any angle. */
  function scaleFor(cells) {
    const [cx, cy] = centroid(cells);
    let r = 0;
    for (const [x, y] of cells) {
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) r = Math.max(r, Math.hypot(x + ox - cx, y + oy - cy));
    }
    return Math.min(26, (PANEL / 2 - 8) / r);
  }

  function renderTrial(trial, el) {
    const s = scaleFor(trial.cells); // mirror image has identical distances
    el.innerHTML =
      '<div style="display:flex;gap:32px;justify-content:center;align-items:center;flex-wrap:wrap">' +
      `<div class="panel" style="line-height:0">${figureSvg(trial.cells, trial.left, s)}</div>` +
      `<div class="panel" style="line-height:0">${figureSvg(trial.rightCells, trial.right, s)}</div>` +
      '</div>';
  }

  const RESPONSES = [
    { id: 'same', key: 'f', label: 'Same shape, turned' },
    { id: 'mirror', key: 'j', label: 'Mirror image' },
  ];

  // ----------------------------------------------------------------- scoring

  /** Net (right − wrong) over a ceiling of 60, clipped to [0, 1]. */
  const score = (raw) => GIS.score.speed({ correct: raw.correct, wrong: raw.wrong, ceiling: CEILING });

  GIS.gen.rotation = {
    normalize,
    key,
    rotate90,
    mirror,
    rotations,
    isChiral,
    bbox,
    isConnected,
    generateShape,
    nextAnswer,
    makeTrial,
    trialMaker,
    placedCenters,
    sameSet,
    CEILING,
    MAX_RUN,
  };

  GIS.registerSection({
    id: 'rotation',
    title: 'Turn or Mirror',
    area: 'Visual-spatial processing — mental rotation',
    pace: 'fast',
    weight: 0.11,
    timeLabel: '90 seconds',
    intro: [
      '<p>You will see two figures made of black squares. The right figure is always turned by some amount compared with the left one.</p>',
      '<p>Decide whether the right figure is the <b>same shape, just turned</b>, or its <b>mirror image</b> (flipped over, as if seen in a mirror, and also turned). A mirror image can never be turned to match the original.</p>',
      '<p>Press <b>F</b> for “Same shape, turned” and <b>J</b> for “Mirror image” (or click the buttons). Work as quickly as you can without making mistakes. You have 90 seconds.</p>',
    ],
    practice: async (ctx) => {
      await GIS.ui.speedTask(ctx, {
        practice: true,
        count: 4,
        makeTrial: trialMaker(ctx.rng.fork('practice')),
        renderTrial,
        responses: RESPONSES,
      });
    },
    // speedTask already resolves { correct, wrong }, which is all score needs.
    run: (ctx) =>
      GIS.ui.speedTask(ctx, {
        seconds: SECONDS,
        makeTrial: trialMaker(ctx.rng),
        renderTrial,
        responses: RESPONSES,
      }),
    score,
  });
})(typeof window !== 'undefined' ? window : globalThis);
