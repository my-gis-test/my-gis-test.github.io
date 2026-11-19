/* GIS — Pattern Matrices (fluid reasoning). Blueprint-driven 3×3 matrices; a per-attribute
   rule enumerator (row- and column-wise) rejects ambiguous items; I-RAVEN-balanced options. */
(function (root) {
  'use strict';
  const GIS = root.GIS; // core.js is always loaded first
  const U = GIS.util;

  // ------------------------------------------------------------- attributes

  const ATTRS = ['shape', 'count', 'fill', 'size'];
  /** Inclusive value domains. Progressions on shape use only 0–3 (3–6 sides). */
  const DOMAIN = { shape: [0, 4], count: [1, 5], fill: [0, 3], size: [0, 2] };
  const PROG_DOMAIN = { shape: [0, 3], count: [1, 5], fill: [0, 3], size: [0, 2] };

  const SHAPE_NAMES = ['triangle', 'square', 'pentagon', 'hexagon', 'circle'];
  const SIDES = [3, 4, 5, 6, 0];
  const FILL_NAMES = ['white', 'light grey', 'dark grey', 'black'];
  const FILL_COLOURS = ['#fff', '#cfcfcf', '#7a7a7a', '#000'];
  const SIZE_NAMES = ['small', 'medium', 'large'];
  const RADII = [11, 16, 21];
  const LAYOUT = [
    null,
    [[65, 65]],
    [[38, 65], [92, 65]],
    [[65, 36], [36, 92], [94, 92]],
    [[38, 38], [92, 38], [38, 92], [92, 92]],
    [[33, 33], [97, 33], [65, 65], [33, 97], [97, 97]],
  ];

  /** Item blueprints (spec order); attributes not listed are global. */
  const BLUEPRINTS = [
    { count: 'prog', shape: 'const' },
    { shape: 'dist3', fill: 'const' },
    { count: 'prog', fill: 'prog' },
    { shape: 'dist3', size: 'prog', count: 'const' },
    { count: 'dist3', fill: 'dist3', shape: 'const' },
    { shape: 'prog', count: 'prog', fill: 'dist3' },
    { count: 'arith+', shape: 'dist3', fill: 'const' },
    { count: 'arith-', shape: 'dist3', fill: 'prog', size: 'dist3' },
  ];

  const WEIGHTS = [1, 1, 1.25, 1.25, 1.5, 1.5, 1.75, 2];
  const CHANCE = 1 / 8;
  const SECONDS = 300;
  /** Per-attribute regeneration cap; rejection rates are low, so this is never reached in practice. */
  const MAX_TRIES = 200;

  const inDomain = (attr, v) => Number.isInteger(v) && v >= DOMAIN[attr][0] && v <= DOMAIN[attr][1];
  const rangeIncl = (lo, hi) => U.range(hi - lo + 1).map((i) => lo + i);

  // ------------------------------------------------------- rule generators

  /** Builds a 3×3 grid of values for one attribute following `type`. Returns { rule, grid }. */
  function makeAttr(rng, attr, type) {
    const [lo, hi] = DOMAIN[attr];
    const grid = [[], [], []];
    const rule = { type };
    if (type === 'global') {
      const v = rng.int(lo, hi);
      for (let r = 0; r < 3; r++) grid[r] = [v, v, v];
      rule.value = v;
    } else if (type === 'const') {
      const vals = rng.shuffle(rangeIncl(lo, hi)).slice(0, 3);
      for (let r = 0; r < 3; r++) grid[r] = [vals[r], vals[r], vals[r]];
      rule.values = vals; // per-row value, top to bottom
    } else if (type === 'prog') {
      const [plo, phi] = PROG_DOMAIN[attr];
      const step = rng.pick([1, -1]);
      for (let r = 0; r < 3; r++) {
        const base = step > 0 ? rng.int(plo, phi - 2) : rng.int(plo + 2, phi);
        grid[r] = [base, base + step, base + 2 * step];
      }
      rule.step = step;
    } else if (type === 'dist3') {
      // All 12 order-3 Latin squares: any first row, then a cyclic shift of 1 or 2 per row.
      const row0 = rng.shuffle(rangeIncl(lo, hi)).slice(0, 3);
      const k = rng.pick([1, 2]);
      for (let r = 0; r < 3; r++) grid[r] = [0, 1, 2].map((c) => row0[(c + r * k) % 3]);
      rule.values = row0.slice().sort((a, b) => a - b);
    } else if (type === 'arith+' || type === 'arith-') {
      // count only: third = first ± second, three different rows so the rule is visible.
      const seen = new Set();
      for (let r = 0; r < 3; r++) {
        let row;
        do {
          if (type === 'arith+') {
            const a = rng.int(1, 4);
            const b = rng.int(1, 5 - a);
            row = [a, b, a + b];
          } else {
            const a = rng.int(2, 5);
            const b = rng.int(1, a - 1);
            row = [a, b, a - b];
          }
        } while (seen.has(row.join()));
        seen.add(row.join());
        grid[r] = row;
      }
    } else {
      throw new Error(`Unknown rule type ${type}`);
    }
    return { rule, grid };
  }

  // ------------------------------------------------------ uniqueness check

  /**
   * Enumerates every candidate rule for one attribute grid (grid[2][2] is the answer and is
   * never read). Lines are read row-wise and column-wise; in both readings line 2 index 2 is
   * the missing cell. Candidate kinds:
   *   a  each of lines 0,1 is an arithmetic sequence (own step) → line 2 continues its step
   *      (covers global, const and progression rules)
   *   b  lines 0,1 are permutations of the same 3 distinct values and line 2's two visible
   *      values are distinct members of that set → the remaining member
   *   c  third = first + second in lines 0,1 → same for line 2
   *   d  third = first − second in lines 0,1 → same for line 2
   * Returns only the consistent candidates with their predictions (in-domain or not).
   */
  function candidates(grid) {
    const out = [];
    for (const orient of ['row', 'col']) {
      const line = (i) => (orient === 'row' ? grid[i].slice() : [grid[0][i], grid[1][i], grid[2][i]]);
      const L0 = line(0);
      const L1 = line(1);
      const [x, y] = line(2);
      const isArith = (L) => L[1] - L[0] === L[2] - L[1];
      if (isArith(L0) && isArith(L1)) out.push({ orient, kind: 'a', pred: 2 * y - x });

      const set0 = new Set(L0);
      const sameSet = set0.size === 3 && new Set(L1).size === 3 && L1.every((v) => set0.has(v));
      if (sameSet && x !== y && set0.has(x) && set0.has(y)) {
        out.push({ orient, kind: 'b', pred: L0.find((v) => v !== x && v !== y) });
      }

      if (L0[2] === L0[0] + L0[1] && L1[2] === L1[0] + L1[1]) out.push({ orient, kind: 'c', pred: x + y });
      if (L0[2] === L0[0] - L0[1] && L1[2] === L1[0] - L1[1]) out.push({ orient, kind: 'd', pred: x - y });
    }
    return out;
  }

  /** Row-wise candidate kind that each generating rule corresponds to. */
  const RULE_KIND = { global: 'a', const: 'a', prog: 'a', dist3: 'b', 'arith+': 'c', 'arith-': 'd' };

  /**
   * Verdict for one attribute: every consistent candidate with an in-domain prediction must
   * predict the answer, and the generating rule's own (row-wise) candidate must be among them.
   */
  function checkAttr(attr, grid, ruleType) {
    const answer = grid[2][2];
    const cands = candidates(grid).filter((c) => inDomain(attr, c.pred));
    const rivals = cands.filter((c) => c.pred !== answer);
    const own = cands.some((c) => c.orient === 'row' && c.kind === RULE_KIND[ruleType] && c.pred === answer);
    return { ok: rivals.length === 0 && own, rivals, own };
  }

  const gridOf = (cells, attr) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => cells[r * 3 + c][attr]));

  /** Item-level verdict: { ok, attrs: { shape: { ok, rivals, own }, … } }. */
  function check(item) {
    const attrs = {};
    let ok = true;
    for (const attr of ATTRS) {
      attrs[attr] = checkAttr(attr, gridOf(item.cells, attr), item.rules[attr].type);
      if (!attrs[attr].ok) ok = false;
    }
    return { ok, attrs };
  }

  // ------------------------------------------------------------ distractors

  /**
   * I-RAVEN balanced tree: pick 3 attributes (non-global first, random order, then global),
   * one alternative value each, and take all 2×2×2 combinations. Every option differs from
   * the answer in at least one attribute, and each value of a perturbed attribute appears in
   * exactly 4 options, so counting popular features carries no information.
   */
  function makeOptions(rng, cells, rules) {
    const answer = cells[8];
    const nonGlobal = rng.shuffle(ATTRS.filter((a) => rules[a].type !== 'global'));
    const global = rng.shuffle(ATTRS.filter((a) => rules[a].type === 'global'));
    const perturbed = nonGlobal.concat(global).slice(0, 3);
    const alternatives = perturbed.map((attr) => {
      const seen = [...new Set(cells.slice(0, 8).map((c) => c[attr]))].filter((v) => v !== answer[attr]).sort((a, b) => a - b);
      if (seen.length) return rng.pick(seen);
      const near = [answer[attr] - 1, answer[attr] + 1].filter((v) => inDomain(attr, v));
      return rng.pick(near);
    });
    const combos = [];
    for (let mask = 0; mask < 8; mask++) {
      const opt = Object.assign({}, answer);
      perturbed.forEach((attr, i) => {
        if (mask & (1 << i)) opt[attr] = alternatives[i];
      });
      combos.push({ opt, isAnswer: mask === 0 });
    }
    const shuffled = rng.shuffle(combos);
    return {
      options: shuffled.map((c) => c.opt),
      answer: shuffled.findIndex((c) => c.isAnswer),
      perturbed,
      alternatives,
    };
  }

  // ------------------------------------------------------------ explanation

  function describe(cell) {
    const n = cell.count;
    return `${n} ${SIZE_NAMES[cell.size]} ${FILL_NAMES[cell.fill]} ${SHAPE_NAMES[cell.shape]}${n > 1 ? 's' : ''}`;
  }

  const listAnd = (xs) => `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

  /** One sentence per non-global attribute rule. */
  function ruleSentence(attr, rule) {
    const noun = { shape: 'shape', count: 'number of figures', fill: 'shading', size: 'size' }[attr];
    switch (rule.type) {
      case 'const':
        return `All cells in a row have the same ${noun}, and each row has a different ${noun}.`;
      case 'prog':
        if (attr === 'count') return `Number ${rule.step > 0 ? 'rises' : 'falls'} by 1 across each row.`;
        if (attr === 'shape') return `Shapes ${rule.step > 0 ? 'gain' : 'lose'} one side across each row (triangle, square, pentagon, hexagon).`;
        if (attr === 'fill') return `Shading gets one step ${rule.step > 0 ? 'darker' : 'lighter'} across each row (white, light grey, dark grey, black).`;
        return `Figures get one size ${rule.step > 0 ? 'larger' : 'smaller'} across each row.`;
      case 'dist3':
        if (attr === 'shape') return `Each row has one ${listAnd(rule.values.map((v) => SHAPE_NAMES[v]))}.`;
        if (attr === 'count') return `Each row has one cell each with ${listAnd(rule.values)} figures.`;
        if (attr === 'fill') return `Each row has one cell of each shading: ${listAnd(rule.values.map((v) => FILL_NAMES[v]))}.`;
        return `Each row has one cell of each size: ${listAnd(rule.values.map((v) => SIZE_NAMES[v]))}.`;
      case 'arith+':
        return 'In each row, third number = first + second.';
      case 'arith-':
        return 'In each row, third number = first \u2212 second.';
      default:
        return '';
    }
  }

  function explain(rules, answer) {
    const order = ['count', 'shape', 'fill', 'size'];
    const parts = order.filter((a) => rules[a].type !== 'global').map((a) => ruleSentence(a, rules[a]));
    parts.push(`So the missing cell has ${describe(answer)}.`);
    return parts.join(' ');
  }

  // ------------------------------------------------------------- generator

  /**
   * generate(rng, blueprintIndex) — blueprintIndex is 0-based (0 = spec blueprint 1).
   * Each attribute is drawn and re-drawn until its own uniqueness verdict passes; attributes
   * are independent, so this is equivalent to rejecting whole items but converges faster.
   */
  function generate(rng, blueprintIndex) {
    const bp = BLUEPRINTS[blueprintIndex];
    if (!bp) throw new Error(`No matrices blueprint ${blueprintIndex}`);
    const rules = {};
    const grids = {};
    let attempts = 0;
    for (const attr of ATTRS) {
      const type = bp[attr] || 'global';
      let tries = 0;
      for (;;) {
        tries++;
        const { rule, grid } = makeAttr(rng, attr, type);
        if (checkAttr(attr, grid, type).ok) {
          rules[attr] = rule;
          grids[attr] = grid;
          break;
        }
        if (tries >= MAX_TRIES) throw new Error(`matrices: blueprint ${blueprintIndex + 1} ${attr} failed after ${tries} tries`);
      }
      attempts = Math.max(attempts, tries);
    }
    const cells = U.range(9).map((i) => {
      const cell = {};
      for (const attr of ATTRS) cell[attr] = grids[attr][Math.floor(i / 3)][i % 3];
      return cell;
    });
    const { options, answer, perturbed, alternatives } = makeOptions(rng, cells, rules);
    return {
      blueprint: blueprintIndex,
      cells,
      options,
      answer,
      rules,
      perturbed,
      alternatives,
      attempts,
      explanation: explain(rules, cells[8]),
    };
  }

  // -------------------------------------------------------------- rendering

  function polygonPoints(sides, cx, cy, r) {
    // Odd polygons and the hexagon point up; the square sits flat so it reads as a square, not a diamond.
    const start = sides === 4 ? -135 : -90;
    const pts = [];
    for (let k = 0; k < sides; k++) {
      const a = ((start + (360 * k) / sides) * Math.PI) / 180;
      pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return pts.join(' ');
  }

  /** SVG fragment for the figures of one cell in a 130×130 frame at (ox, oy). */
  function cellFigures(cell, ox, oy) {
    const r = RADII[cell.size];
    const fill = FILL_COLOURS[cell.fill];
    const common = `fill="${fill}" stroke="#000" stroke-width="2.5" stroke-linejoin="miter"`;
    return LAYOUT[cell.count]
      .map(([x, y]) => {
        const cx = ox + x;
        const cy = oy + y;
        const sides = SIDES[cell.shape];
        return sides === 0
          ? `<circle cx="${cx}" cy="${cy}" r="${r}" ${common}/>`
          : `<polygon points="${polygonPoints(sides, cx, cy, r)}" ${common}/>`;
      })
      .join('');
  }

  /** Standalone SVG for one cell, `size` px square (default 130), with a thin frame. */
  function svgCell(cell, size) {
    const px = size || 130;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 130 130" role="img" aria-label="${describe(cell)}">` +
      `<rect x="0.5" y="0.5" width="129" height="129" fill="#fff" stroke="#000" stroke-width="1"/>` +
      cellFigures(cell, 0, 0) +
      '</svg>'
    );
  }

  /** Whole 3×3 matrix with "?" in the bottom-right cell. */
  function svgMatrix(cells) {
    const S = 130;
    let body = `<rect x="0.5" y="0.5" width="${3 * S}" height="${3 * S}" fill="#fff" stroke="#000" stroke-width="1.5"/>`;
    for (let i = 1; i < 3; i++) {
      body += `<line x1="${i * S + 0.5}" y1="0.5" x2="${i * S + 0.5}" y2="${3 * S + 0.5}" stroke="#000" stroke-width="1"/>`;
      body += `<line x1="0.5" y1="${i * S + 0.5}" x2="${3 * S + 0.5}" y2="${i * S + 0.5}" stroke="#000" stroke-width="1"/>`;
    }
    for (let i = 0; i < 8; i++) body += cellFigures(cells[i], (i % 3) * S + 0.5, Math.floor(i / 3) * S + 0.5);
    body +=
      `<text x="${2.5 * S + 0.5}" y="${2.5 * S + 0.5}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="'Times New Roman', Times, serif" font-size="64" fill="#000">?</text>`;
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${3 * S + 1} ${3 * S + 1}" width="330" height="330" ` +
      `style="max-width:100%;height:auto" role="img" aria-label="3 by 3 pattern with the bottom-right cell missing">${body}</svg>`
    );
  }

  /** Renders one item into `el`; the current selection comes from `answer`. */
  function renderItem(item, el, answer, setAnswer) {
    const { h } = GIS.ui;
    el.innerHTML = '';
    el.appendChild(h('p', { class: 'prompt', text: 'Which option completes the pattern? Look across the rows (and down the columns).' }));
    el.appendChild(h('div', { class: 'figure', html: svgMatrix(item.cells) }));
    const box = h('div', { style: 'margin-top:12px' });
    el.appendChild(box);
    GIS.ui.choices(box, {
      options: item.options,
      columns: 4,
      selected: answer == null ? null : answer,
      render: (option, optEl) => {
        optEl.innerHTML = svgCell(option, 84);
      },
      onChange: (i) => setAnswer(i),
    });
  }

  // ---------------------------------------------------------------- scoring

  const letter = (i) => String.fromCharCode(65 + i);

  /** raw = { keys: keyed option index per item, answers: chosen index or null } → score in [0, 1]. */
  function score(raw) {
    const keys = raw.keys || [];
    const answers = raw.answers || [];
    return GIS.score.power(
      keys.map((k, i) => ({ weight: WEIGHTS[i], chance: CHANCE, correct: answers[i] != null && answers[i] === k })),
    );
  }

  // ----------------------------------------------------------------- export

  GIS.gen.matrices = {
    ATTRS,
    DOMAIN,
    BLUEPRINTS,
    WEIGHTS,
    CHANCE,
    MAX_TRIES,
    generate,
    check,
    candidates,
    makeAttr,
    describe,
    svgCell,
    svgMatrix,
  };

  GIS.registerSection({
    id: 'matrices',
    title: 'Pattern Matrices',
    area: 'Fluid reasoning \u2014 visual patterns',
    pace: 'slow',
    weight: 0.18,
    timeLabel: '5 minutes \u00b7 8 puzzles',
    intro: [
      '<p>Each puzzle is a 3 \u00d7 3 grid of pictures with the bottom-right picture missing. The pictures change from cell to cell following simple rules: the shape, the number of figures, their shading or their size.</p>',
      '<p>Work out the rules by looking across the rows (and down the columns), then pick the one option of eight (A\u2013H) that completes the grid. Exactly one option fits every rule.</p>',
      '<p>You have 5 minutes for 8 puzzles. You can move between puzzles and change your answers until time runs out. If you are not sure, give your best guess.</p>',
    ],
    practice: async (ctx) => {
      const item = generate(ctx.rng.fork('practice'), 0);
      await GIS.ui.practiceItem(ctx, {
        render: (el, answer, setAnswer) => renderItem(item, el, answer, setAnswer),
        isCorrect: (answer) => answer === item.answer,
        isAnswered: (answer) => answer != null,
        explanation: `The answer is ${letter(item.answer)}. ${item.explanation}`,
      });
    },
    run: async (ctx) => {
      const items = U.range(8).map((i) => generate(ctx.rng.fork(`item${i}`), i));
      const res = await GIS.ui.powerTask(ctx, {
        seconds: SECONDS,
        items,
        renderItem: (item, el, answer, setAnswer) => renderItem(item, el, answer, setAnswer),
        isAnswered: (answer) => answer != null,
      });
      return { keys: items.map((item) => item.answer), answers: res.answers, timedOut: res.timedOut };
    },
    score,
  });
})(typeof window !== 'undefined' ? window : globalThis);
