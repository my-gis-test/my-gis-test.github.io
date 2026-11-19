/* GIS — Deduction (verbal/logical reasoning). Six self-contained puzzles with randomised surface words; every key is derived from a brute-force checker in this file. */
(function (root) {
  'use strict';
  const GIS = root.GIS;
  const U = GIS.util;

  const WEIGHTS = [1, 1.25, 1.25, 1.5, 1.75, 1.75];
  const SECONDS = 300;
  const ORD = ['first', 'second', 'third', 'fourth', 'fifth'];

  // Short names with distinct initials, so options are easy to tell apart.
  const NAMES = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jo', 'Kai', 'Lena',
    'Max', 'Nia', 'Omar', 'Pia', 'Ravi', 'Sami', 'Tess', 'Uma', 'Vic', 'Wren', 'Yara', 'Zane'];
  // Invented plurals for syllogisms: no real-world meaning can leak into the logic.
  const NONSENSE = ['zorbs', 'gromps', 'blickets', 'wugs', 'snerps', 'daxes', 'glorps', 'fendles',
    'quimbs', 'trolbs', 'mipsels', 'voffs', 'kelbs', 'florbs', 'yembers', 'tizzocks'];

  // ------------------------------------------------------------------ helpers

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const indicesOf = (flags) => flags.reduce((acc, f, i) => (f ? acc.concat(i) : acc), []);

  /** Index of the only true flag; throws if the checker does not find exactly one. */
  function onlyIndex(flags, label) {
    const idx = indicesOf(flags);
    if (idx.length !== 1) throw new Error(`deduction ${label}: checker found ${idx.length} correct options`);
    return idx[0];
  }

  function weightedPick(rng, pairs) {
    const total = U.sum(pairs, (p) => p[1]);
    let x = rng.next() * total;
    for (const [v, w] of pairs) {
      x -= w;
      if (x < 0) return v;
    }
    return pairs[pairs.length - 1][0];
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    arr.forEach((v, i) => {
      for (const rest of permutations(arr.slice(0, i).concat(arr.slice(i + 1)))) out.push([v].concat(rest));
    });
    return out;
  }

  // ======================================================= D1 conditional chain
  // Propositional checker. Atoms are (object, property) pairs; premises are
  //   { t: 'all', p, q }        "every object that is p is q" (for every object)
  //   { t: 'lit', o, p, v }     "object o is (not) p"
  // Options are literals or { t: 'none' }. Every truth assignment over all atoms
  // is enumerated; a literal is correct iff it holds in every model of the
  // premises, and "None of these" is correct iff no literal option is.

  function propHolds(s, val, nObj) {
    if (s.t === 'lit') return val(s.o, s.p) === s.v;
    for (let o = 0; o < nObj; o++) if (val(o, s.p) && !val(o, s.q)) return false;
    return true;
  }

  function propCheck(nObj, nProp, premises, options) {
    const n = nObj * nProp;
    const models = [];
    for (let m = 0; m < 1 << n; m++) {
      const val = (o, p) => ((m >> (o * nProp + p)) & 1) === 1;
      if (premises.every((pr) => propHolds(pr, val, nObj))) models.push(val);
    }
    if (!models.length) throw new Error('deduction D1: premises are contradictory');
    const ent = options.map((op) => (op.t === 'none' ? null : models.every((val) => propHolds(op, val, nObj))));
    const anyEntailed = ent.some((e) => e === true);
    return ent.map((e) => (e === null ? !anyEntailed : e));
  }

  const D1_NOUNS = ['crate', 'box', 'parcel', 'barrel', 'sack', 'case'];
  const D1_PROPS = [
    ['sealed', 'labelled', 'weighed'],
    ['painted', 'numbered', 'inspected'],
    ['washed', 'dried', 'packed'],
    ['cleaned', 'polished', 'wrapped'],
    ['scanned', 'sorted', 'stamped'],
    ['counted', 'listed', 'stored'],
  ];
  const CODE_LETTERS = 'BCDFGHJKLMNPRSTVWXZ'.split('');

  function makeCodes(rng, n) {
    return rng.shuffle(CODE_LETTERS).slice(0, n).map((l) => l + rng.int(2, 9));
  }

  function propText(s, noun, props, codes) {
    if (s.t === 'none') return 'None of these must be true.';
    if (s.t === 'all') return `Every ${noun} that is ${props[s.p]} is ${props[s.q]}.`;
    return `${cap(noun)} ${codes[s.o]} is ${s.v ? '' : 'not '}${props[s.p]}.`;
  }

  function genD1(rng) {
    const noun = rng.pick(D1_NOUNS);
    const props = rng.pick(D1_PROPS);
    const codes = makeCodes(rng, 2);
    const X = 0;
    const Y = 1;
    // Premises: p0 → p1, p1 → p2 (rule order shuffled), X is not p2, Y is not p0.
    const premises = rng.shuffle([{ t: 'all', p: 0, q: 1 }, { t: 'all', p: 1, q: 2 }])
      .concat([{ t: 'lit', o: X, p: 2, v: false }, { t: 'lit', o: Y, p: 0, v: false }]);
    // Key: two modus tollens steps. Distractors: denying the antecedent on Y,
    // plus one statement the premises leave open or contradict.
    const key = { t: 'lit', o: X, p: 0, v: false };
    const fallacy = rng.pick([{ t: 'lit', o: Y, p: 2, v: false }, { t: 'lit', o: Y, p: 1, v: false }]);
    const other = rng.pick([
      { t: 'lit', o: X, p: 1, v: true },
      { t: 'lit', o: X, p: 0, v: true },
      { t: 'lit', o: Y, p: 2, v: true },
      { t: 'lit', o: Y, p: 1, v: true },
    ].filter((l) => !(l.o === fallacy.o && l.p === fallacy.p)));
    const opts = rng.shuffle([key, fallacy, other]).concat([{ t: 'none' }]);
    const flags = propCheck(2, 3, premises, opts);
    return {
      type: 'D1',
      lead: null,
      lines: premises.map((s) => propText(s, noun, props, codes)),
      question: 'Which of these must be true?',
      options: opts.map((s) => propText(s, noun, props, codes)),
      columns: 1,
      key: onlyIndex(flags, 'D1'),
      data: { nObj: 2, nProp: 3, premises, options: opts },
    };
  }

  function checkD1(item) {
    const d = item.data;
    return propCheck(d.nObj, d.nProp, d.premises, d.options);
  }

  // ============================================================ D2 syllogism
  // Venn checker: four terms (0..3) give 16 regions (bit t set = inside term t).
  // A model is a 16-bit occupancy mask saying which regions contain something;
  // all 2^16 masks are enumerated. Statements { q: 'all'|'no'|'some'|'someNot', x, y }.
  // "Existential import" additionally requires every term to be non-empty.

  function regionMask(pred) {
    let m = 0;
    for (let r = 0; r < 16; r++) if (pred(r)) m |= 1 << r;
    return m;
  }

  /** Compile a categorical statement to a test on an occupancy mask. */
  function compileStmt(s) {
    const X = 1 << s.x;
    const Y = 1 << s.y;
    const xNotY = regionMask((r) => (r & X) && !(r & Y));
    const xAndY = regionMask((r) => (r & X) && (r & Y));
    switch (s.q) {
      case 'all': return (occ) => (occ & xNotY) === 0;
      case 'no': return (occ) => (occ & xAndY) === 0;
      case 'some': return (occ) => (occ & xAndY) !== 0;
      case 'someNot': return (occ) => (occ & xNotY) !== 0;
      default: throw new Error(`deduction D2: unknown quantifier ${s.q}`);
    }
  }

  const TERM_MASKS = [0, 1, 2, 3].map((t) => regionMask((r) => r & (1 << t)));

  // The full 2^16 sweep depends only on the premises and the import reading, of
  // which there are few variants; cache its surviving models so repeated items
  // (generation, tests over many seeds) only test statements against them.
  const modelCache = new Map();
  function vennModels(premises, existentialImport) {
    const key = `${existentialImport}|${JSON.stringify(premises)}`;
    let models = modelCache.get(key);
    if (models) return models;
    const prem = premises.map(compileStmt);
    models = [];
    for (let occ = 0; occ < 65536; occ++) {
      if (existentialImport && !TERM_MASKS.every((m) => occ & m)) continue;
      if (prem.every((f) => f(occ))) models.push(occ);
    }
    if (!models.length) throw new Error('deduction D2: premises are contradictory');
    modelCache.set(key, models);
    return models;
  }

  /** For each statement: does it hold in every model of the premises? */
  function syllogismEntails(premises, stmts, existentialImport) {
    const models = vennModels(premises, existentialImport);
    return stmts.map(compileStmt).map((test) => models.every(test));
  }

  /**
   * Per option: entailed without import, entailed with import, and the final
   * correctness flag. A statement option is correct only if entailed in BOTH
   * readings; "None of these" is correct iff no statement is entailed in either.
   */
  function checkD2(item) {
    const opts = item.data.options;
    const stmts = opts.filter((o) => o.q !== 'none');
    const plainS = syllogismEntails(item.data.premises, stmts, false);
    const importS = syllogismEntails(item.data.premises, stmts, true);
    const anyEntailed = plainS.some(Boolean) || importS.some(Boolean);
    const plain = [];
    const imported = [];
    let j = 0;
    for (const o of opts) {
      if (o.q === 'none') {
        plain.push(!plainS.some(Boolean));
        imported.push(!importS.some(Boolean));
      } else {
        plain.push(plainS[j]);
        imported.push(importS[j]);
        j++;
      }
    }
    const flags = opts.map((o, i) => (o.q === 'none' ? !anyEntailed : plain[i] && imported[i]));
    return { flags, plain, imported };
  }

  function stmtText(s, terms) {
    const x = terms[s.x];
    const y = terms[s.y];
    switch (s.q) {
      case 'all': return `All ${x} are ${y}.`;
      case 'no': return `No ${x} are ${y}.`;
      case 'some': return `Some ${x} are ${y}.`;
      case 'someNot': return `Some ${x} are not ${y}.`;
      default: return 'None of these must be true.';
    }
  }

  function genD2(rng) {
    const terms = rng.shuffle(NONSENSE).slice(0, 4); // A, B, C, D
    const [A, B, C, D] = [0, 1, 2, 3];
    // "No" and "Some" are symmetric, so their direction is a free surface choice.
    const flip = (q, x, y) => (rng.chance(0.5) ? { q, x, y } : { q, x: y, y: x });
    const premises = [{ q: 'all', x: A, y: B }, flip('no', B, C), flip('some', C, D)];
    const key = { q: 'someNot', x: D, y: A };
    const opts = rng.shuffle([key, flip('no', D, A), flip('some', A, D), flip('some', B, D)]).concat([{ q: 'none' }]);
    const item = {
      type: 'D2',
      lead: 'Assume these statements are true. ("Some" means at least one, possibly all.)',
      lines: premises.map((s) => stmtText(s, terms)),
      question: 'Which of these must be true?',
      options: opts.map((s) => stmtText(s, terms)),
      columns: 1,
      key: -1,
      data: { premises, options: opts },
    };
    item.key = onlyIndex(checkD2(item).flags, 'D2');
    return item;
  }

  // ============================================================ D3 majorities
  // A club is a multiset of members, each member being one of the 8 subsets of
  // the three activities (bit 0/1/2). All clubs of N = 1..7 members are
  // enumerated as count vectors. Statements are predicates on the count vector.

  const D3_STATEMENTS = {
    pairs: 'For any two of these three activities, at least one member does both.',
    all3: 'At least one member does all three.',
    exactly2: 'At least one member does exactly two of them.',
    none: 'At least one member does none of them.',
    everyone: 'Every member does at least one of them.',
  };
  const popcount = (s) => (s & 1) + ((s >> 1) & 1) + ((s >> 2) & 1);
  const sumWhere = (c, pred) => U.sum(c, (n, s) => (pred(s) ? n : 0));
  const D3_PRED = {
    pairs: (c) => [3, 5, 6].every((pair) => sumWhere(c, (s) => (s & pair) === pair) > 0),
    all3: (c) => c[7] > 0,
    exactly2: (c) => sumWhere(c, (s) => popcount(s) === 2) > 0,
    none: (c) => c[0] > 0,
    everyone: (c) => c[0] === 0,
  };

  let clubCache = null;
  /** All clubs of 1..7 members satisfying the premise "each activity > half". */
  function d3Clubs() {
    if (clubCache) return clubCache;
    const clubs = [];
    for (let N = 1; N <= 7; N++) {
      const c = new Array(8).fill(0);
      const rec = (type, left) => {
        if (type === 7) {
          c[7] = left;
          const ok = [1, 2, 4].every((bit) => 2 * sumWhere(c, (s) => s & bit) > N);
          if (ok) clubs.push(c.slice());
          return;
        }
        for (let k = 0; k <= left; k++) {
          c[type] = k;
          rec(type + 1, left - k);
        }
        c[type] = 0;
      };
      rec(0, N);
    }
    clubCache = clubs;
    return clubs;
  }

  /** Smallest premise-satisfying club where the statement fails, or null. */
  function d3Counterexample(id) {
    return d3Clubs().find((c) => !D3_PRED[id](c)) || null;
  }

  function checkD3(item) {
    return item.data.options.map((id) => d3Counterexample(id) === null);
  }

  const D3_ACTIVITIES = ['play chess', 'swim', 'sing in a choir', 'play the violin', 'paint', 'cook', 'dance', 'play tennis'];
  const D3_GROUPS = ['a club', 'a sports centre', 'an evening class', 'a youth group'];

  function genD3(rng) {
    const acts = rng.shuffle(D3_ACTIVITIES).slice(0, 3);
    const group = rng.pick(D3_GROUPS);
    const distractors = rng.shuffle(['all3', 'exactly2', 'none', 'everyone']).slice(0, 3);
    const opts = rng.shuffle(['pairs'].concat(distractors));
    const item = {
      type: 'D3',
      lead: null,
      lines: [`In ${group}, more than half of the members ${acts[0]}, more than half ${acts[1]}, and more than half ${acts[2]}.`],
      question: 'Which of these must be true?',
      options: opts.map((id) => D3_STATEMENTS[id]),
      columns: 1,
      key: -1,
      data: { options: opts },
    };
    item.key = onlyIndex(checkD3(item), 'D3');
    return item;
  }

  // ======================================================= D4 finishing order
  // Orders are permutations of runner indices (order[position] = runner);
  // clues are evaluated on pos[runner]. All 120 orders are brute-forced.

  const ORDERS = permutations([0, 1, 2, 3, 4]).map((order) => {
    const pos = [];
    order.forEach((r, p) => { pos[r] = p; });
    return { order, pos };
  });

  function clueHolds(c, pos) {
    switch (c.t) {
      case 'ahead': return pos[c.x] < pos[c.y];
      case 'next': return pos[c.y] === pos[c.x] + 1;
      case 'middle': return pos[c.x] > 0 && pos[c.x] < 4;
      case 'between': return Math.abs(pos[c.x] - pos[c.y]) === 2;
      case 'notK': return pos[c.x] !== c.k;
      default: throw new Error(`deduction D4: unknown clue ${c.t}`);
    }
  }

  /** All orders (runner arrays, first to last) consistent with the clues. */
  function consistentOrders(clues) {
    return ORDERS.filter((o) => clues.every((c) => clueHolds(c, o.pos))).map((o) => o.order);
  }

  function clueText(c, names) {
    switch (c.t) {
      case 'ahead': return `${names[c.x]} finished ahead of ${names[c.y]}.`;
      case 'next': return `${names[c.x]} finished immediately ahead of ${names[c.y]}.`;
      case 'middle': return `${names[c.x]} finished neither first nor last.`;
      case 'between': return `Exactly one runner finished between ${names[c.x]} and ${names[c.y]}.`;
      default: return `${names[c.x]} did not finish ${ORD[c.k]}.`;
    }
  }

  const clueKey = (c) => (c.t === 'between' ? `between:${Math.min(c.x, c.y)}:${Math.max(c.x, c.y)}` : `${c.t}:${c.x}:${c.y}:${c.k}`);

  /** Does the clue mention position k (0-based) by name? Then it may not be asked. */
  const clueMentions = (c, k) => (c.t === 'notK' && c.k === k) || (c.t === 'middle' && (k === 0 || k === 4));

  function randomTrueClue(rng, order, pos) {
    switch (weightedPick(rng, [['ahead', 3], ['next', 2], ['middle', 1], ['between', 2], ['notK', 2]])) {
      case 'ahead': {
        const a = rng.int(0, 4);
        let b = rng.int(0, 3);
        if (b >= a) b++;
        return pos[a] < pos[b] ? { t: 'ahead', x: a, y: b } : { t: 'ahead', x: b, y: a };
      }
      case 'next': {
        const p = rng.int(0, 3);
        return { t: 'next', x: order[p], y: order[p + 1] };
      }
      case 'middle':
        return { t: 'middle', x: order[rng.int(1, 3)] };
      case 'between': {
        const p = rng.int(0, 2);
        const [x, y] = rng.shuffle([order[p], order[p + 2]]);
        return { t: 'between', x, y };
      }
      default: {
        const x = rng.int(0, 4);
        let k = rng.int(0, 3);
        if (k >= pos[x]) k++;
        return { t: 'notK', x, k };
      }
    }
  }

  /** Is the runner in position k the same in every order consistent with the clues? */
  function determinesPosition(clues, k) {
    const orders = consistentOrders(clues);
    return orders.length > 0 && orders.every((o) => o[k] === orders[0][k]);
  }

  /** Size of the smallest clue subset that already fixes who finished in position k. */
  function minCluesFor(clues, k) {
    let best = clues.length;
    for (let m = 1; m < 1 << clues.length; m++) {
      const subset = clues.filter((_, i) => m & (1 << i));
      if (subset.length < best && determinesPosition(subset, k)) best = subset.length;
    }
    return best;
  }

  function genD4(rng) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const names = rng.shuffle(NAMES).slice(0, 5);
      const order = rng.shuffle([0, 1, 2, 3, 4]);
      const pos = [];
      order.forEach((r, p) => { pos[r] = p; });
      // Add random TRUE clues (only informative ones) until one order remains.
      const clues = [];
      const seen = new Set();
      let alive = consistentOrders([]).length;
      for (let tries = 0; alive > 1 && tries < 300; tries++) {
        const c = randomTrueClue(rng, order, pos);
        if (seen.has(clueKey(c))) continue;
        const next = consistentOrders(clues.concat([c])).length;
        if (next === alive) continue;
        seen.add(clueKey(c));
        clues.push(c);
        alive = next;
      }
      if (alive !== 1) continue;
      // Drop redundant clues in random order. Removing clues only adds
      // consistent orders, so after one pass every remaining clue is necessary.
      let kept = clues.slice();
      for (const c of rng.shuffle(clues)) {
        const without = kept.filter((d) => d !== c);
        if (consistentOrders(without).length === 1) kept = without;
      }
      if (kept.length < 4 || kept.length > 6) continue;
      // Ask about a position no clue names and no single clue settles; prefer
      // the position that needs the most clues combined.
      const cands = [0, 1, 2, 3, 4]
        .filter((k) => !kept.some((c) => clueMentions(c, k)))
        .map((k) => ({ k, need: minCluesFor(kept, k) }))
        .filter((c) => c.need >= 2);
      if (!cands.length) continue;
      const maxNeed = Math.max(...cands.map((c) => c.need));
      const K = rng.pick(cands.filter((c) => c.need === maxNeed)).k;
      const shown = rng.shuffle(kept);
      const item = {
        type: 'D4',
        lead: `Five runners, ${names.slice(0, 4).join(', ')} and ${names[4]}, ran a race. There were no ties.`,
        lines: shown.map((c) => clueText(c, names)),
        numbered: true,
        question: `Who finished ${ORD[K]}?`,
        options: names.slice(),
        columns: 5,
        key: -1,
        data: { clues: shown, K },
      };
      item.key = onlyIndex(checkD4(item), 'D4');
      return item;
    }
    throw new Error('deduction D4: generation failed');
  }

  /** Option (runner) i is correct iff it is in position K in every consistent order. */
  function checkD4(item) {
    const orders = consistentOrders(item.data.clues);
    const K = item.data.K;
    return item.options.map((_, r) => orders.length > 0 && orders.every((o) => o[K] === r));
  }

  // ================================================ D5 truth-tellers and liars
  // t[i] = true means person i always tells the truth. An assignment is
  // consistent iff every truth-teller's statement is true and every liar's is
  // false. All 8 assignments are checked.

  const D5_GROUP = ['exactlyOneLiar', 'atLeastTwoLiars', 'allLiars', 'exactlyOneTruth', 'atMostOneLiar'];
  const D5_KINDS = [
    ['liar', 2], ['truth', 2], ['bothLiars', 1], ['same', 1], ['diff', 1], ['someLiar', 1],
    ['sameMe', 1], ['diffMe', 1],
  ].concat(D5_GROUP.map((k) => [k, 1]));

  function d5Holds(s, speaker, t) {
    const liars = t.filter((v) => !v).length;
    switch (s.k) {
      case 'liar': return !t[s.x];
      case 'truth': return t[s.x];
      case 'bothLiars': return !t[s.x] && !t[s.y];
      case 'same': return t[s.x] === t[s.y];
      case 'diff': return t[s.x] !== t[s.y];
      case 'someLiar': return !t[s.x] || !t[s.y];
      case 'sameMe': return t[s.x] === t[speaker];
      case 'diffMe': return t[s.x] !== t[speaker];
      case 'exactlyOneLiar': return liars === 1;
      case 'atLeastTwoLiars': return liars >= 2;
      case 'allLiars': return liars === 3;
      case 'exactlyOneTruth': return liars === 2;
      case 'atMostOneLiar': return liars <= 1;
      default: throw new Error(`deduction D5: unknown statement ${s.k}`);
    }
  }

  const maskToTruth = (m) => [0, 1, 2].map((i) => ((m >> i) & 1) === 1);

  /** Bitmasks (bit i = person i truthful) of all consistent assignments. */
  function d5Consistent(statements) {
    const out = [];
    for (let m = 0; m < 8; m++) {
      const t = maskToTruth(m);
      if (statements.every((s, i) => t[i] === d5Holds(s, i, t))) out.push(m);
    }
    return out;
  }

  function d5Text(s, names) {
    const x = names[s.x];
    const y = names[s.y];
    switch (s.k) {
      case 'liar': return `${x} is a liar.`;
      case 'truth': return `${x} tells the truth.`;
      case 'bothLiars': return `${x} and ${y} are both liars.`;
      case 'same': return `${x} and ${y} are the same kind.`;
      case 'diff': return `${x} and ${y} are different kinds.`;
      case 'someLiar': return `At least one of ${x} and ${y} is a liar.`;
      case 'sameMe': return `${x} and I are the same kind.`;
      case 'diffMe': return `${x} and I are different kinds.`;
      case 'exactlyOneLiar': return 'Exactly one of us three is a liar.';
      case 'atLeastTwoLiars': return 'At least two of us are liars.';
      case 'allLiars': return 'All three of us are liars.';
      case 'exactlyOneTruth': return 'Exactly one of us tells the truth.';
      default: return 'At most one of us is a liar.';
    }
  }

  // Option order fixed by the spec; values are truth bitmasks (A = bit 0).
  const D5_OPTION_MASKS = [0, 1, 2, 4, 3, 5, 6, 7];

  function d5OptionText(m, names) {
    const who = [0, 1, 2].filter((i) => (m >> i) & 1).map((i) => names[i]);
    if (who.length === 0) return 'Nobody';
    if (who.length === 3) return 'All three';
    if (who.length === 1) return `Only ${who[0]}`;
    return `${who[0]} and ${who[1]} only`;
  }

  function randomD5Statement(rng, speaker) {
    const k = weightedPick(rng, D5_KINDS);
    const [x, y] = rng.shuffle([0, 1, 2].filter((i) => i !== speaker));
    return { k, x, y };
  }

  function genD5(rng) {
    const names = rng.shuffle(NAMES).slice(0, 3);
    // Draw the answer first, then sample statement sets until exactly one
    // assignment is consistent and it is the target: keeps the keys uniform.
    for (let attempt = 0; attempt < 100; attempt++) {
      const target = rng.int(0, 7);
      for (let tries = 0; tries < 400; tries++) {
        const statements = [0, 1, 2].map((s) => randomD5Statement(rng, s));
        if (!statements.some((s) => D5_GROUP.includes(s.k))) continue;
        const cons = d5Consistent(statements);
        if (cons.length !== 1 || cons[0] !== target) continue;
        const item = {
          type: 'D5',
          lead: `${names[0]}, ${names[1]} and ${names[2]} each either always tell the truth or always lie.`,
          lines: statements.map((s, i) => `${names[i]} says: "${d5Text(s, names)}"`),
          question: 'Who tells the truth?',
          options: D5_OPTION_MASKS.map((m) => d5OptionText(m, names)),
          columns: 2,
          key: -1,
          data: { statements },
        };
        item.key = onlyIndex(checkD5(item), 'D5');
        return item;
      }
    }
    throw new Error('deduction D5: generation failed');
  }

  function checkD5(item) {
    const cons = d5Consistent(item.data.statements);
    return D5_OPTION_MASKS.map((m) => cons.length === 1 && cons[0] === m);
  }

  // ============================================================ D6 rule testing
  // A card must be turned iff some possible hidden face makes it break the rule
  // "shape S ⇒ colour C". Hidden faces range over every shape/colour in play.

  const D6_SHAPES = ['star', 'circle', 'square', 'triangle'];
  const D6_COLOURS = ['blue', 'red', 'green', 'yellow', 'orange', 'purple'];

  function d6MustTurn(card, rule) {
    const breaks = (shape, colour) => shape === rule.shape && colour !== rule.colour;
    return card.kind === 'shape'
      ? D6_COLOURS.some((colour) => breaks(card.value, colour))
      : D6_SHAPES.some((shape) => breaks(shape, card.value));
  }

  function checkD6(item) {
    return item.options.map((card) => d6MustTurn(card, item.data.rule));
  }

  function genD6(rng) {
    const [shape, otherShape] = rng.shuffle(D6_SHAPES);
    const [colour, otherColour] = rng.shuffle(D6_COLOURS);
    const rule = { shape, colour };
    const S = shape.toUpperCase();
    const C = colour.toUpperCase();
    const ruleText = rng.chance(0.5)
      ? `If a card has a ${S} on one side, it has ${C} on the other.`
      : `A card has a ${S} on one side only if it has ${C} on the other.`;
    const cards = rng.shuffle([
      { kind: 'shape', value: shape },
      { kind: 'shape', value: otherShape },
      { kind: 'colour', value: colour },
      { kind: 'colour', value: otherColour },
    ]);
    const item = {
      type: 'D6',
      lead: 'Each card has a shape on one side and a colour word on the other. You can see one side of each card.',
      lines: [`Rule: ${ruleText}`],
      question: 'Which cards must you turn over to check whether any of these cards breaks the rule? Select all that apply.',
      options: cards,
      multi: true,
      columns: 4,
      key: [],
      data: { rule },
    };
    item.key = indicesOf(checkD6(item));
    return item;
  }

  // ================================================================= assembly

  const GENERATORS = [genD1, genD2, genD3, genD4, genD5, genD6];
  const CHECKERS = { D1: checkD1, D2: (it) => checkD2(it).flags, D3: checkD3, D4: checkD4, D5: checkD5, D6: checkD6 };

  /** Six items, one per puzzle type; each draws from its own forked stream. */
  function generate(rng) {
    return GENERATORS.map((g, i) => {
      const item = g(rng.fork(`D${i + 1}`));
      item.weight = WEIGHTS[i];
      // Chance of a blind guess: 1/options, or 1/16 subsets for the multi-select item.
      item.chance = item.multi ? 1 / 16 : 1 / item.options.length;
      return item;
    });
  }

  /** Practice: one-step modus ponens, checked by the same truth-table code as D1. */
  function practiceItem(rng) {
    const noun = rng.pick(['bottle', 'jar', 'tin']);
    const props = rng.pick([['full', 'sealed'], ['cold', 'covered'], ['empty', 'washed']]);
    const codes = makeCodes(rng, 1);
    const premises = [{ t: 'all', p: 0, q: 1 }, { t: 'lit', o: 0, p: 0, v: true }];
    const opts = rng.shuffle([
      { t: 'lit', o: 0, p: 1, v: true },
      { t: 'lit', o: 0, p: 1, v: false },
      { t: 'lit', o: 0, p: 0, v: false },
    ]).concat([{ t: 'none' }]);
    const flags = propCheck(1, 2, premises, opts);
    return {
      type: 'D1',
      lead: null,
      lines: premises.map((s) => propText(s, noun, props, codes)),
      question: 'Which of these must be true?',
      options: opts.map((s) => propText(s, noun, props, codes)),
      columns: 1,
      key: onlyIndex(flags, 'practice'),
      explain: `${cap(noun)} ${codes[0]} is ${props[0]}, and every ${noun} that is ${props[0]} is ${props[1]}, so ${codes[0]} must be ${props[1]}.`,
      data: { nObj: 1, nProp: 2, premises, options: opts },
    };
  }

  function isCorrect(item, answer) {
    if (answer === null || answer === undefined) return false;
    if (item.multi) {
      if (!Array.isArray(answer)) return false;
      const a = answer.slice().sort((p, q) => p - q);
      return a.length === item.key.length && a.every((v, i) => v === item.key[i]);
    }
    return answer === item.key;
  }

  const isAnswered = (a) => a !== null && a !== undefined && !(Array.isArray(a) && a.length === 0);

  // ------------------------------------------------------------- rendering

  const SHAPE_SVG = {
    star: () => {
      const pts = U.range(10).map((i) => {
        const r = i % 2 ? 11 : 27;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return `${(32 + r * Math.cos(a)).toFixed(1)},${(33 + r * Math.sin(a)).toFixed(1)}`;
      });
      return `<polygon points="${pts.join(' ')}"/>`;
    },
    circle: () => '<circle cx="32" cy="32" r="24"/>',
    square: () => '<rect x="11" y="11" width="42" height="42"/>',
    triangle: () => '<polygon points="32,7 58,53 6,53"/>',
  };

  function renderCard(card, el) {
    const { h } = GIS.ui;
    const body = card.kind === 'shape'
      ? h('span', {
        html: `<svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${card.value}">` +
          `<g fill="#000" stroke="#000" stroke-width="2.5">${SHAPE_SVG[card.value]()}</g></svg>`,
      })
      : h('span', { text: card.value.toUpperCase(), style: 'font-size:1.4em;letter-spacing:0.05em' });
    el.appendChild(h('div', { style: 'min-height:80px;display:flex;align-items:center;justify-content:center' }, body));
  }

  function renderPrompt(item) {
    const { h } = GIS.ui;
    const lines = item.numbered
      ? h('ol', { style: 'margin:0;padding-left:1.6em' }, item.lines.map((l) => h('li', { text: l, style: 'margin:0.25em 0' })))
      : item.lines.map((l) => h('p', { text: l, style: 'margin:0.25em 0' }));
    return h('div', { class: 'prompt' },
      item.lead ? h('p', { text: item.lead }) : null,
      h('div', { class: 'panel', style: 'padding:0.6em 1em;margin:0.6em 0' }, lines),
      h('p', { style: 'margin-top:0.8em' }, h('strong', { text: item.question })));
  }

  function renderItem(item, el, answer, setAnswer) {
    const { h } = GIS.ui;
    el.appendChild(renderPrompt(item));
    const box = h('div');
    el.appendChild(box);
    GIS.ui.choices(box, {
      options: item.options,
      render: item.type === 'D6' ? renderCard : undefined,
      multi: !!item.multi,
      columns: item.columns,
      selected: item.multi ? (answer || []) : answer,
      onChange: (sel) => setAnswer(item.multi ? (sel.length ? sel : null) : sel),
    });
  }

  // ----------------------------------------------------------------- scoring

  /** Chance-corrected weighted accuracy in [0, 1]; D6 needs the exact card set. */
  function score(raw) {
    const answers = raw.answers || [];
    return GIS.score.power(raw.items.map((it, i) => ({ weight: it.weight, chance: it.chance, correct: isCorrect(it, answers[i]) })));
  }

  GIS.gen.deduction = {
    WEIGHTS,
    generate,
    practiceItem,
    check: (item) => CHECKERS[item.type](item),
    isCorrect,
    isAnswered,
    // checkers and brute-force building blocks, exposed for tests
    propCheck,
    checkD1,
    syllogismEntails,
    checkD2,
    d3Clubs,
    d3Counterexample,
    D3_PRED,
    checkD3,
    consistentOrders,
    clueHolds,
    determinesPosition,
    clueMentions,
    checkD4,
    d5Consistent,
    d5Holds,
    D5_GROUP,
    checkD5,
    d6MustTurn,
    checkD6,
    score,
  };

  GIS.registerSection({
    id: 'deduction',
    title: 'Deduction',
    area: 'Logical reasoning: what must follow',
    pace: 'slow',
    weight: 0.16,
    timeLabel: '5 minutes · 6 puzzles',
    intro: [
      '<p>Six short logic puzzles. Everything you need is in the puzzle itself: treat every statement as true, even if it sounds odd, and use no outside knowledge.</p>',
      '<p>"Must be true" means true in <em>every</em> situation the statements allow, not just likely. "Some" means at least one, possibly all.</p>',
      '<p>Puzzles 1 to 5 have one correct answer. In puzzle 6 select <em>all</em> the cards that apply.</p>',
      '<p>You have 5 minutes in total and can move back and forth between puzzles. If you are not sure, give your best guess.</p>',
    ],
    practice: async (ctx) => {
      const item = practiceItem(ctx.rng.fork('practice'));
      await GIS.ui.practiceItem(ctx, {
        render: (el, answer, setAnswer) => renderItem(item, el, answer, setAnswer),
        isCorrect: (a) => isCorrect(item, a),
        isAnswered,
        explanation: item.explain,
      });
    },
    run: async (ctx) => {
      const items = generate(ctx.rng);
      const res = await GIS.ui.powerTask(ctx, { seconds: SECONDS, items, renderItem, isAnswered });
      return { items, answers: res.answers, timedOut: res.timedOut };
    },
    score,
  });
})(typeof window !== 'undefined' ? window : globalThis);
