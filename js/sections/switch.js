/* GIS — Rule Switch (executive function / task switching). The digit's position picks the rule: top = even?, bottom = more than 5? */
(function (root) {
  'use strict';
  const GIS = root.GIS;
  const U = GIS.util;

  const SECONDS = 60;
  const CEILING = 100; // typical adult nets ≈ 50 in 60 s (~0.95 s per cued response) ⇒ score ≈ 0.5
  // 5 is excluded so "more than 5" is never a borderline call. Each rule is
  // balanced over these digits: 4 even / 4 odd and 4 above 5 / 4 below.
  const DIGITS = [1, 2, 3, 4, 6, 7, 8, 9];
  const TOP_LABEL = 'TOP — is it EVEN?';
  const BOTTOM_LABEL = 'BOTTOM — is it MORE than 5?';

  /** Answer key: 'yes' | 'no'. */
  function keyFor(half, digit) {
    const yes = half === 'top' ? digit % 2 === 0 : digit > 5;
    return yes ? 'yes' : 'no';
  }

  /**
   * One trial. Half is a fair coin (so the rule switches on ~50 % of trials,
   * unpredictably) unless `forcedHalf` is given; the digit never repeats the
   * previous one, so a repeated stimulus can't be answered by echoing.
   */
  function makeTrial(rng, prev, forcedHalf) {
    const half = forcedHalf || (rng.chance(0.5) ? 'top' : 'bottom');
    const digit = rng.pick(prev ? DIGITS.filter((d) => d !== prev.digit) : DIGITS);
    return { digit, half, answer: keyFor(half, digit) };
  }

  /**
   * Stateful maker for speedTask. Owns its rng (the one speedTask passes is
   * ignored) so practice never consumes the scored stream. `halves` optionally
   * fixes the half per trial index (used by practice to cover both rules).
   */
  function trialMaker(rng, halves) {
    let prev = null;
    return (_ignored, index) => {
      if (index === 0) prev = null;
      const t = makeTrial(rng, prev, halves ? halves[index] : undefined);
      prev = t;
      return t;
    };
  }

  /** Practice plan: 3 top + 3 bottom in random order. */
  const practiceHalves = (rng) => rng.shuffle(['top', 'top', 'top', 'bottom', 'bottom', 'bottom']);

  /** Net (right − wrong) over a ceiling of 100, clipped to [0, 1]. */
  const score = (raw) => GIS.score.speed({ correct: raw.correct, wrong: raw.wrong, ceiling: CEILING });

  // ------------------------------------------------------------------ render
  // Two stacked .panel boxes (the second pulled up 1px) read as one box split
  // by a horizontal line. Both rule labels are always visible.

  function renderTrial(trial, el) {
    const { h } = GIS.ui;
    const half = (which, label) =>
      h(
        'div',
        { class: 'panel', style: `width:300px;height:130px;margin:${which === 'bottom' ? '-1px' : '0'} auto 0;display:flex;flex-direction:column;box-sizing:border-box` },
        h('div', { class: 'small muted', text: label, style: 'padding:4px 6px;text-align:left' }),
        h('div', { style: 'flex:1;display:flex;align-items:center;justify-content:center' }, trial.half === which ? String(trial.digit) : ''),
      );
    el.replaceChildren(h('div', null, half('top', TOP_LABEL), half('bottom', BOTTOM_LABEL)));
  }

  const RESPONSES = [
    { id: 'no', key: 'f', label: 'No' },
    { id: 'yes', key: 'j', label: 'Yes' },
  ];

  GIS.gen.switch = { DIGITS, keyFor, makeTrial, trialMaker, practiceHalves, CEILING };

  GIS.registerSection({
    id: 'switch',
    title: 'Rule Switch',
    area: 'Executive function — switching between rules',
    pace: 'fast',
    weight: 0.08,
    timeLabel: '60 seconds',
    intro: [
      '<p>A box is split into a top half and a bottom half. A single digit appears in one of the halves. Where it appears tells you which question to answer:</p>',
      `<p><b>${U.escapeHtml(TOP_LABEL)}</b><br><b>${U.escapeHtml(BOTTOM_LABEL)}</b></p>`,
      '<p>Press <b>F</b> for “No” and <b>J</b> for “Yes” (or click the buttons). The half changes unpredictably, so keep checking where the digit is. Work as quickly as you can without making mistakes. You have 60 seconds.</p>',
    ],
    practice: async (ctx) => {
      const rng = ctx.rng.fork('practice');
      await GIS.ui.speedTask(ctx, {
        practice: true,
        count: 6,
        makeTrial: trialMaker(rng, practiceHalves(rng)),
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
