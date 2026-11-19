/*
 * GIS — General Intelligence Score
 * app.js — the test flow: welcome → for each section: instructions → optional
 * practice → timed run → … → final score. Owns the header bar, the countdown
 * and the ctx each section runs with. Loaded last, after every section.
 *
 * Deliberately a black box: the taker only ever sees the overall score, never
 * section scores, answers or how anything is scored.
 */
(function (root) {
  'use strict';

  const GIS = root.GIS;
  const U = GIS.util;
  const { h, button } = GIS.ui;

  const ORDER = ['compare', 'matrices', 'rotation', 'deduction', 'span', 'quant', 'switch', 'language'];

  const PACE_LABEL = { fast: 'Fast', medium: 'Medium', slow: 'Slow', paced: 'Untimed' };

  const PACE_HINT = {
    fast: 'This is a fast section. Respond as quickly as you can without making mistakes, and keep going until the time runs out.',
    medium: 'This section is medium-paced. Keep moving, and don’t get stuck on any one question.',
    slow: 'This is a slow section. Take your time and think each question through. You can go back and change answers until the time runs out.',
    paced: 'This section has no time limit.',
  };

  const RULES = [
    'Allow about 30 minutes somewhere quiet. A section can’t be paused once it has started, but you can rest for as long as you like between sections.',
    'A keyboard helps: the fast sections use the F and J keys. You can also click the buttons.',
    'Don’t use a calculator, a search engine or anyone’s help. Scratch paper is fine, except in the memory section.',
    'Each section begins with instructions and a short practice. The clock starts only when you press Start.',
    'Answer every question. If you are not sure, give your best guess.',
    'Don’t reload or close the page: your progress isn’t saved.',
  ];

  const DISCLAIMER = [
    'The GIS measures intelligence only in a few specific ways: finding patterns, logical deduction, everyday number reasoning, picking up an unfamiliar language, mental rotation, working memory, and speed of simple decisions. It cannot truly quantify your intelligence.',
    'Many important abilities are not tested at all, including creativity, knowledge, wisdom, practical judgement, and social and emotional intelligence. A GIS is not an IQ: an IQ ranks you against other people, while a GIS measures you against a fixed standard, so one cannot be converted into the other.',
    'Any one sitting gives only an estimate. It changes with sleep, stress, practice, your device, and familiarity with puzzles like these. Treat it as a rough snapshot, not as a measure of your worth or potential.',
  ];

  const byId = (id) => document.getElementById(id);
  const mainEl = byId('main');
  const bar = byId('bar');
  const barSection = byId('bar-section');
  const barPace = byId('bar-pace');
  const barProgress = byId('bar-progress');
  const barTimer = byId('bar-timer');
  const barFill = byId('bar-fill');

  /** Session seed; every item in the session is generated from it. */
  let seed = '';
  /** Stops the running countdown, if there is one. */
  let stopClock = null;

  // ---------------------------------------------------------------- screens

  function screen(...children) {
    mainEl.replaceChildren(h('section', { class: 'screen' }, ...children));
    window.scrollTo(0, 0);
  }

  /** Shows a screen that ends in buttons; resolves with the value of the button pressed. */
  function choose(children, actions) {
    return new Promise((resolve) => {
      const buttons = actions.map(([label, cls, value]) => button(label, cls, () => resolve(value)));
      screen(...children, h('div', { class: 'actions' }, buttons));
    });
  }

  const paceBadge = (pace) => h('span', { class: `pace pace-${pace}`, text: PACE_LABEL[pace] });

  function disclaimerBox() {
    return h('div', { class: 'disclaimer', role: 'note' }, h('h3', { text: 'About this test' }), DISCLAIMER.map((text) => h('p', { text })));
  }

  function welcome(defs) {
    bar.hidden = true;
    const rows = defs.map((def, i) =>
      h(
        'tr',
        {},
        h('td', { class: 'num', text: String(i + 1) }),
        h('td', { text: def.title }),
        h('td', { text: def.area }),
        h('td', {}, paceBadge(def.pace)),
        h('td', { text: def.timeLabel }),
      ),
    );
    return choose(
      [
        h('h1', { text: 'GIS Test' }),
        h('p', { class: 'lead', text: 'General Intelligence Score: a timed reasoning test in eight short sections.' }),
        h('p', {
          text: 'Some sections are fast and some are slow. None of them needs outside knowledge: everything you need is on the screen. At the end you get an estimate of your GIS, a score between 0 and 1.',
        }),
        disclaimerBox(),
        h('h2', { text: 'Sections' }),
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'plain' },
            h('thead', {}, h('tr', {}, ['#', 'Section', 'What it tests', 'Pace', 'Time'].map((text) => h('th', { text })))),
            h('tbody', {}, rows),
          ),
        ),
        h('h2', { text: 'Before you start' }),
        h('ul', { class: 'rules' }, RULES.map((text) => h('li', { text }))),
      ],
      [['Begin the test', 'primary big', 'begin']],
    );
  }

  function heading(def, i, total) {
    return [
      h('p', { class: 'eyebrow', text: `Section ${i + 1} of ${total}` }),
      h('h1', { text: def.title }),
      h('p', { class: 'meta' }, paceBadge(def.pace), ` ${def.area} · ${def.timeLabel}`),
    ];
  }

  function previousNotice(prev) {
    if (!prev.ok) return `Something went wrong in ${prev.title}, so it has been skipped.`;
    return prev.timedOut ? `Time is up: ${prev.title} is complete.` : `${prev.title} is complete.`;
  }

  /** Shown between sections; nothing is timed until the taker continues. */
  function breakScreen(previous, done, total, next) {
    clearClock();
    bar.hidden = true;
    return choose(
      [
        h('p', { class: 'notice', text: previousNotice(previous) }),
        h('h1', { text: 'Take a breather' }),
        h('p', {
          text: `${done} of ${total} sections done. Rest for as long as you like: nothing is timed until you start the next section.`,
        }),
        h('p', { class: 'meta' }, 'Next: ', paceBadge(next.pace), ` ${next.title} · ${next.timeLabel}`),
      ],
      [['Continue', 'primary', 'continue']],
    );
  }

  function introScreen(def, i, total) {
    showBar(def, i, total);
    const intro = typeof def.intro === 'function' ? def.intro(GIS.rng(`${seed}/${def.id}/intro`)) : def.intro;
    const html = intro.map((s) => (s.trimStart().startsWith('<') ? s : `<p>${s}</p>`)).join('');
    return choose(
      [
        ...heading(def, i, total),
        h('p', { class: 'pace-hint', text: PACE_HINT[def.pace] }),
        h('div', { class: 'intro', html }),
      ],
      def.practice
        ? [
            ['Practice first', 'primary', 'practice'],
            ['Skip practice and start', '', 'start'],
          ]
        : [['Start the section', 'primary', 'start']],
    );
  }

  function practiceDoneScreen(def, i, total) {
    showBar(def, i, total);
    const clock = def.pace === 'paced' ? '' : ', and the clock will be running';
    return choose(
      [
        ...heading(def, i, total),
        h('p', {
          text: `Practice complete. The real section works the same way, except that you won’t be told whether your answers are right${clock}.`,
        }),
        h('p', { class: 'pace-hint', text: PACE_HINT[def.pace] }),
      ],
      [
        ['Start the section', 'primary', 'start'],
        ['Practice again', '', 'practice'],
      ],
    );
  }

  /** results: one entry per section, in test order: { title, area, weight, score } (score null if it failed). */
  function showResult(results) {
    clearClock();
    bar.hidden = true;
    const parts = results.filter((r) => r.score !== null);
    if (!parts.length) {
      screen(
        h('h1', { text: 'The test could not be scored' }),
        h('p', { text: 'Something went wrong in every section. Please reload the page and try again.' }),
      );
      return;
    }
    const failed = results.length - parts.length;
    const lost = failed === 1 ? 'One section' : `${failed} sections`;
    screen(
      h('h1', { text: 'Test complete' }),
      h(
        'div',
        { class: 'score-hero' },
        h('div', { class: 'score-sub', text: 'Your estimated General Intelligence Score' }),
        h('div', { class: 'score-big', text: U.fmt2(GIS.score.composite(parts)) }),
        h('p', { class: 'muted', text: 'on a scale from 0 to 1' }),
      ),
      h('p', {
        text: 'Your GIS is the share of everyday reasoning challenges you can handle, at a set standard of difficulty and pace: 0 means none of them, 1 means all of them. This test estimates it from a fresh sample of such challenges, so another sitting may give a slightly different result.',
      }),
      failed ? h('p', { class: 'small', text: `${lost} could not run because of a technical problem, so the score is based on the rest.` }) : null,
      h('h2', { text: 'Your profile' }),
      h('p', { text: 'The shape reaches further toward the sections where you did better.' }),
      h('div', { class: 'radar', html: radarSvg(results) }),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'plain' },
          h('thead', {}, h('tr', {}, ['Section', 'What it tests', 'Score'].map((text) => h('th', { text })))),
          h(
            'tbody',
            {},
            results.map((r) =>
              h('tr', {}, h('td', { text: r.title }), h('td', { text: r.area }), h('td', { class: 'num', text: r.score === null ? '—' : U.fmt2(r.score) })),
            ),
          ),
        ),
      ),
      h('p', {
        class: 'muted small',
        text: 'Each section rests on only a few questions or a minute or two of work, so section scores are rougher than the overall estimate.',
      }),
      disclaimerBox(),
    );
  }

  /** Radar chart: one spoke per section, 0 at the centre and 1 at the outer octagon. */
  function radarSvg(results) {
    const W = 640;
    const H = 440;
    const cx = W / 2;
    const cy = H / 2;
    const R = 150;
    const n = results.length;
    const at = (i, r) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    const points = (radius) => results.map((_, i) => at(i, radius(i)).map((v) => v.toFixed(1)).join(',')).join(' ');
    const rings = [0.25, 0.5, 0.75, 1]
      .map((t) => `<polygon points="${points(() => R * t)}" fill="none" stroke="${t === 1 ? '#000' : '#cfcfcf'}"/>`)
      .join('');
    const spokes = results
      .map((_, i) => {
        const [x, y] = at(i, R);
        return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#cfcfcf"/>`;
      })
      .join('');
    const value = (i) => R * (results[i].score || 0);
    const shape = `<polygon points="${points(value)}" fill="#cfcfcf" stroke="#000" stroke-width="2" stroke-linejoin="round"/>`;
    const dots = results
      .map((_, i) => {
        const [x, y] = at(i, value(i));
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#000"/>`;
      })
      .join('');
    const labels = results
      .map((r, i) => {
        const [x, y] = at(i, R + 14);
        const dx = x - cx;
        const anchor = Math.abs(dx) < 1 ? 'middle' : dx > 0 ? 'start' : 'end';
        const dy = y - cy;
        const top = dy < -R * 0.5 ? y - 22 : dy > R * 0.5 ? y + 10 : y - 4;
        const score = r.score === null ? '—' : U.fmt2(r.score);
        return (
          `<text x="${x.toFixed(1)}" y="${top.toFixed(1)}" text-anchor="${anchor}">` +
          `<tspan x="${x.toFixed(1)}" dy="0">${U.escapeHtml(r.title)}</tspan>` +
          `<tspan x="${x.toFixed(1)}" dy="17" font-weight="bold">${score}</tspan></text>`
        );
      })
      .join('');
    const label = `Profile chart. ${results.map((r) => `${r.title}: ${r.score === null ? 'not scored' : U.fmt2(r.score)}`).join('; ')}.`;
    return (
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.escapeHtml(label)}" font-family="Times New Roman, Times, serif" font-size="15">` +
      `${rings}${spokes}${shape}${dots}${labels}</svg>`
    );
  }

  // ------------------------------------------------------- header and clock

  function showBar(def, i, total) {
    clearClock();
    bar.hidden = false;
    barSection.textContent = `Section ${i + 1} of ${total}: ${def.title}`;
    barPace.className = `pace pace-${def.pace}`;
    barPace.textContent = PACE_LABEL[def.pace];
    barProgress.textContent = '';
  }

  function clearClock() {
    if (stopClock) stopClock();
    barTimer.textContent = '';
    barTimer.classList.remove('urgent');
    barFill.style.width = '0';
  }

  /** ctx.timer: counts down in the header and calls onExpire once when time is up. */
  function countdown(seconds, onExpire) {
    clearClock();
    const total = seconds * 1000;
    const start = performance.now();
    let running = true;

    function paint() {
      const left = Math.max(0, total - (performance.now() - start));
      barTimer.textContent = U.clock(left / 1000);
      barTimer.classList.toggle('urgent', left <= 10000);
      barFill.style.width = `${(100 * left) / total}%`;
      if (left === 0) expire();
    }
    function stop() {
      if (!running) return;
      running = false;
      clearInterval(interval);
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', paint);
      if (stopClock === stop) stopClock = null;
    }
    function expire() {
      if (!running) return;
      stop();
      barTimer.textContent = U.clock(0);
      barFill.style.width = '0';
      onExpire();
    }

    const interval = setInterval(paint, 200);
    const timeout = setTimeout(expire, total);
    // Background tabs throttle timers; catch up as soon as the page is visible again.
    document.addEventListener('visibilitychange', paint);
    stopClock = stop;
    paint();
    return { stop };
  }

  // -------------------------------------------------------------- sections

  /** Runs one part of a section (its practice or the real run) on a fresh stage. */
  async function runPart(def, i, total, rngSeed, part) {
    showBar(def, i, total);
    const stage = h('div', { class: 'section-stage' });
    screen(stage);
    const offs = [];
    const ctx = {
      rng: GIS.rng(rngSeed),
      stage,
      timer: countdown,
      onKey(handler) {
        document.addEventListener('keydown', handler);
        const off = () => document.removeEventListener('keydown', handler);
        offs.push(off);
        return off;
      },
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => performance.now(),
      setProgress(text) {
        barProgress.textContent = text || '';
      },
    };
    try {
      return await part(ctx);
    } finally {
      for (const off of offs) off();
      clearClock();
    }
  }

  async function start() {
    const missing = ORDER.filter((id) => !GIS.sections[id]);
    if (missing.length) {
      screen(
        h('h1', { text: 'The test could not start' }),
        h('p', { text: `Some parts of the test did not load (${missing.join(', ')}). Check that all the files are in place, then reload the page.` }),
      );
      return;
    }
    const defs = ORDER.map((id) => GIS.sections[id]);
    const totalWeight = U.sum(defs, (def) => def.weight);
    if (Math.abs(totalWeight - 1) > 1e-9) console.warn(`GIS: section weights add up to ${totalWeight}, not 1.`);
    seed = readSeed();

    await welcome(defs);
    window.addEventListener('beforeunload', confirmLeave);

    const total = defs.length;
    const results = [];
    let previous = null;
    for (const [i, def] of defs.entries()) {
      if (previous) await breakScreen(previous, i, total, def);
      let choice = await introScreen(def, i, total);
      for (let attempt = 1; choice === 'practice'; attempt++) {
        try {
          await runPart(def, i, total, `${seed}/${def.id}/practice/${attempt}`, def.practice);
        } catch (err) {
          console.error(`GIS: practice for "${def.id}" failed`, err);
        }
        choice = await practiceDoneScreen(def, i, total);
      }
      const result = { title: def.title, area: def.area, weight: def.weight, score: null };
      results.push(result);
      try {
        const raw = await runPart(def, i, total, `${seed}/${def.id}`, def.run);
        const score = def.score(raw);
        if (!(score >= 0 && score <= 1)) throw new Error(`score() returned ${score}`);
        result.score = score;
        previous = { title: def.title, ok: true, timedOut: def.pace === 'fast' || Boolean(raw && raw.timedOut) };
      } catch (err) {
        // A broken section is left out and the remaining weights are renormalized.
        console.error(`GIS: section "${def.id}" failed`, err);
        previous = { title: def.title, ok: false };
      }
    }

    window.removeEventListener('beforeunload', confirmLeave);
    showResult(results);
  }

  /** ?seed=… reproduces a session's items (for investigating problems); never shown to the taker. */
  function readSeed() {
    const fromUrl = new URLSearchParams(location.search).get('seed');
    if (fromUrl) return fromUrl;
    const words = crypto.getRandomValues(new Uint32Array(2));
    return Array.from(words, (w) => w.toString(36)).join('');
  }

  function confirmLeave(event) {
    event.preventDefault();
    event.returnValue = '';
  }

  start().catch((err) => {
    console.error('GIS: the test stopped unexpectedly', err);
    window.removeEventListener('beforeunload', confirmLeave);
    clearClock();
    bar.hidden = true;
    screen(h('h1', { text: 'Something went wrong' }), h('p', { text: 'The test stopped unexpectedly. Please reload the page to start again.' }));
  });
})(typeof window !== 'undefined' ? window : globalThis);
