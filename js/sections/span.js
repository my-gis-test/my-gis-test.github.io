/* GIS — Backward Span (working memory). Digits shown one at a time; type them in reverse. Adaptive lengths 3–9, two lists per length. */
(function (root) {
  'use strict';
  const GIS = root.GIS;
  const U = GIS.util;

  const MIN_LEN = 3;
  const MAX_LEN = 9;
  const SHOW_MS = 800;
  const BLANK_MS = 250;
  const READY_MS = 600;

  // ------------------------------------------------------------------- lists
  // Constraints keep lists free of easy chunks: no immediate repeat, no run of
  // three consecutive numbers going up or down by one (4-5-6, 6-5-4), and no
  // digit used more than twice.

  function listOk(list) {
    const counts = {};
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (!Number.isInteger(d) || d < 1 || d > 9) return false;
      counts[d] = (counts[d] || 0) + 1;
      if (counts[d] > 2) return false;
      if (i >= 1 && list[i - 1] === d) return false;
      if (i >= 2) {
        const step = d - list[i - 1];
        if (Math.abs(step) === 1 && list[i - 1] - list[i - 2] === step) return false;
      }
    }
    return true;
  }

  /** Build digit by digit from the candidates that keep the list valid. */
  function generateList(rng, length) {
    for (;;) {
      const list = [];
      while (list.length < length) {
        const cands = U.range(9)
          .map((i) => i + 1)
          .filter((d) => listOk(list.concat(d)));
        if (!cands.length) break; // dead end (rare): restart
        list.push(rng.pick(cands));
      }
      if (list.length === length) return list;
    }
  }

  const reversed = (list) => list.slice().reverse().join('');
  const isCorrect = (list, response) => String(response || '').replace(/\D/g, '') === reversed(list);

  // --------------------------------------------------------------- staircase

  /**
   * Pure staircase. history = [{ length, correct }] in presentation order.
   * Returns { done: true } or { done: false, length } for the next list.
   * Two lists are always given at each length; after both, stop if both were
   * wrong or the length was 9, otherwise go up by one.
   */
  function nextStep(history) {
    if (!history.length) return { done: false, length: MIN_LEN };
    const L = history[history.length - 1].length;
    const atL = history.filter((x) => x.length === L);
    if (atL.length < 2) return { done: false, length: L };
    if (!atL.some((x) => x.correct)) return { done: true };
    if (L >= MAX_LEN) return { done: true };
    return { done: false, length: L + 1 };
  }

  // ----------------------------------------------------------------- scoring

  /**
   * spanEst = 2 + Σ (correct lists)/2: each length passed on both lists adds a
   * full digit, one of two adds half.
   */
  const spanEstimate = (lists) => 2 + lists.filter((l) => l.correct).length / 2;

  /** (spanEst − 2)/6: failing both lists at 3 ⇒ 0; span 8 or better ⇒ 1. */
  const score = (raw) => U.clamp((spanEstimate(raw.lists || []) - 2) / 6, 0, 1);

  // ---------------------------------------------------------------------- UI

  /** Show the digits one by one; nothing else is on screen meanwhile. */
  async function present(ctx, list) {
    const { h } = GIS.ui;
    const num = h('div', { class: 'stimulus', style: 'min-height:2.5em;display:flex;align-items:center;justify-content:center' });
    ctx.stage.replaceChildren(num);
    await ctx.wait(READY_MS);
    for (const d of list) {
      num.textContent = String(d);
      await ctx.wait(SHOW_MS);
      num.textContent = '';
      await ctx.wait(BLANK_MS);
    }
  }

  /** Digit-only text input; Enter (or the button) submits a non-empty answer. */
  function ask(ctx) {
    const { h } = GIS.ui;
    return new Promise((resolve) => {
      let done = false;
      const submit = () => {
        const v = input.value.replace(/\D/g, '');
        if (done || !v) {
          input.focus();
          return;
        }
        done = true;
        resolve(v);
      };
      const input = h('input', {
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': 'Digits in reverse order',
        style: 'font-size:1.6em;width:12em;letter-spacing:0.15em;text-align:center',
      });
      input.addEventListener('input', () => {
        const clean = input.value.replace(/\D/g, '');
        if (clean !== input.value) input.value = clean;
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      });
      ctx.stage.replaceChildren(
        h('p', { class: 'prompt', text: 'Type the digits in REVERSE order, then press Enter.' }),
        h('div', { style: 'margin:16px 0' }, input),
        h('button', { class: 'btn primary', type: 'button', text: 'Submit', on: { click: submit } }),
      );
      input.focus();
    });
  }

  async function practice(ctx) {
    const { h } = GIS.ui;
    const list = generateList(ctx.rng.fork('practice'), MIN_LEN);
    ctx.setProgress('Practice');
    await present(ctx, list);
    const response = await ask(ctx);
    const ok = isCorrect(list, response);
    const shown = list.join(' ');
    const back = list.slice().reverse().join(' ');
    await new Promise((resolve) => {
      const btn = h('button', { class: 'btn primary', type: 'button', text: 'Continue', on: { click: resolve } });
      ctx.stage.replaceChildren(
        h(
          'div',
          { class: 'panel', style: 'padding:12px 16px;max-width:36em;margin:0 auto' },
          h('p', null, h('b', { text: ok ? 'Correct.' : 'Not quite.' })),
          h('p', { text: `The digits were ${shown}, so the answer in reverse order was ${back}.` }),
          ok ? null : h('p', { class: 'muted', text: `You typed ${response.split('').join(' ')}.` }),
        ),
        h('div', { style: 'margin-top:16px' }, btn),
      );
      btn.focus();
    });
  }

  async function run(ctx) {
    const lists = [];
    for (;;) {
      const step = nextStep(lists);
      if (step.done) break;
      ctx.setProgress(`List length ${step.length}`);
      const digits = generateList(ctx.rng, step.length);
      await present(ctx, digits);
      const response = await ask(ctx);
      lists.push({ length: step.length, correct: isCorrect(digits, response) });
    }
    return { lists };
  }

  GIS.gen.span = { listOk, generateList, reversed, isCorrect, nextStep, spanEstimate, MIN_LEN, MAX_LEN };

  GIS.registerSection({
    id: 'span',
    title: 'Backward Span',
    area: 'Working memory — holding and reordering digits',
    pace: 'paced',
    weight: 0.12,
    timeLabel: 'untimed · about 3 minutes',
    intro: [
      '<p>Digits will appear one at a time in the middle of the screen. Watch them; nothing else is shown while they appear.</p>',
      '<p>When they are finished, type them in <b>reverse order</b> and press Enter. For example, if you see 2, 7, 4 you type <b>472</b>.</p>',
      '<p>The lists get longer as you go. There is no time limit for typing.</p>',
    ],
    practice,
    run,
    score,
  });
})(typeof window !== 'undefined' ? window : globalThis);
