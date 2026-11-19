/*
 * GIS — General Intelligence Score
 * sections/compare.js — Quick Compare (perceptual speed, fast). Two codes side
 * by side: F if they are exactly the same, J if they differ. A difference is
 * one substituted character (usually a look-alike) or two neighbouring
 * characters swapped. Score: net correct in 60 s against a design ceiling.
 */
(function (root) {
  'use strict';

  const GIS = root.GIS;

  const SECONDS = 60;
  /** Net correct (right − wrong) treated as the practical maximum for 60 s; typical ≈ 40. */
  const CEILING = 80;
  /** No I, O, 0 or 1: in Times New Roman those pairs are near-identical, not merely similar. */
  const ALPHABET = [...'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'];
  const LOOKALIKE_PAIRS = ['EF', 'PR', 'BR', 'B8', 'MN', 'MW', 'NH', 'UV', 'VY', 'CG', 'GQ', 'DQ', '68', '69', '38', '5S', '2Z', 'KX', '7T', 'S8'];
  const MIN_LENGTH = 5;
  const MAX_LENGTH = 8;
  const SWAP_RATE = 0.3;
  const CONFUSABLE_POSITION_RATE = 0.8;
  const LOOKALIKE_RATE = 0.85;
  /** Longest allowed run of the same correct answer. */
  const MAX_RUN = 3;
  const PRACTICE_TRIALS = 4;
  const RESPONSES = [
    { id: 'same', key: 'f', label: 'Same' },
    { id: 'diff', key: 'j', label: 'Different' },
  ];

  const LOOKALIKES = {};
  for (const [a, b] of LOOKALIKE_PAIRS) {
    (LOOKALIKES[a] = LOOKALIKES[a] || []).push(b);
    (LOOKALIKES[b] = LOOKALIKES[b] || []).push(a);
  }

  /** Random code in which no character sits next to an identical one. */
  function makeCode(rng, length) {
    const chars = [];
    while (chars.length < length) {
      const c = rng.pick(ALPHABET);
      if (c !== chars[chars.length - 1]) chars.push(c);
    }
    return chars.join('');
  }

  /** Look-alikes of chars[i] that would not end up next to an identical character. */
  function lookalikesAt(chars, i) {
    return (LOOKALIKES[chars[i]] || []).filter((c) => c !== chars[i - 1] && c !== chars[i + 1]);
  }

  function substitute(rng, chars) {
    const positions = chars.map((_, i) => i);
    const confusable = positions.filter((i) => lookalikesAt(chars, i).length > 0);
    const i = confusable.length && rng.chance(CONFUSABLE_POSITION_RATE) ? rng.pick(confusable) : rng.pick(positions);
    const similar = lookalikesAt(chars, i);
    const out = chars.slice();
    out[i] =
      similar.length && rng.chance(LOOKALIKE_RATE)
        ? rng.pick(similar)
        : rng.pick(ALPHABET.filter((c) => c !== chars[i] && c !== chars[i - 1] && c !== chars[i + 1]));
    return out.join('');
  }

  /** Swaps a neighbouring pair whose swap creates no doubled characters; null if there is none. */
  function swapNeighbours(rng, chars) {
    const valid = [];
    for (let i = 0; i + 1 < chars.length; i++) {
      if (chars[i - 1] !== chars[i + 1] && chars[i] !== chars[i + 2]) valid.push(i);
    }
    if (!valid.length) return null;
    const i = rng.pick(valid);
    const out = chars.slice();
    out[i] = chars[i + 1];
    out[i + 1] = chars[i];
    return out.join('');
  }

  /** One trial: { answer: 'same' | 'diff', left, right }. */
  function makeTrial(rng, answer) {
    const left = makeCode(rng, rng.int(MIN_LENGTH, MAX_LENGTH));
    if (answer === 'same') return { answer, left, right: left };
    const chars = [...left];
    const swapped = rng.chance(SWAP_RATE) ? swapNeighbours(rng, chars) : null;
    return { answer, left, right: swapped || substitute(rng, chars) };
  }

  /** Trial source for speedTask: each answer is a coin flip, but never more than MAX_RUN in a row. */
  function trialMaker(rng) {
    let last = null;
    let run = 0;
    return () => {
      let answer = rng.chance(0.5) ? 'same' : 'diff';
      if (answer === last && run >= MAX_RUN) answer = answer === 'same' ? 'diff' : 'same';
      run = answer === last ? run + 1 : 1;
      last = answer;
      return makeTrial(rng, answer);
    };
  }

  function renderTrial(trial, el) {
    const { h } = GIS.ui;
    el.appendChild(
      h('div', { class: 'compare-pair' }, h('span', { class: 'compare-code', text: trial.left }), h('span', { class: 'compare-code', text: trial.right })),
    );
  }

  GIS.registerSection({
    id: 'compare',
    title: 'Quick Compare',
    area: 'Perceptual speed',
    pace: 'fast',
    weight: 0.08,
    timeLabel: '60 seconds',
    intro: [
      'Each screen shows two codes side by side. Decide whether they are <strong>exactly</strong> the same.',
      'Press <span class="key">F</span> if they are the same, or <span class="key">J</span> if they are different. You can also click the buttons.',
      'When two codes differ, it is in just one place: one character is changed, or two neighbouring characters have swapped places.',
      'Work as quickly as you can without making mistakes.',
    ],
    practice: (ctx) =>
      GIS.ui.speedTask(ctx, { practice: true, count: PRACTICE_TRIALS, responses: RESPONSES, makeTrial: trialMaker(ctx.rng), renderTrial }),
    run: (ctx) => GIS.ui.speedTask(ctx, { seconds: SECONDS, responses: RESPONSES, makeTrial: trialMaker(ctx.rng), renderTrial }),
    score: (raw) => GIS.score.speed({ correct: raw.correct, wrong: raw.wrong, ceiling: CEILING }),
  });

  GIS.gen.compare = { ALPHABET, LOOKALIKES, MIN_LENGTH, MAX_LENGTH, makeCode, makeTrial, trialMaker };
})(typeof window !== 'undefined' ? window : globalThis);
