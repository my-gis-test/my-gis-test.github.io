/*
 * GIS — General Intelligence Score
 * ui.js — DOM builder, answer widgets and the shared task runners used by the
 * sections: timed speed trials, timed multi-question power sections and an
 * untimed practice item. Browser only; loaded after core.js, before sections.
 */
(function (root) {
  'use strict';

  const GIS = root.GIS;
  const ui = (GIS.ui = GIS.ui || {});

  /** Blank gap between speed trials so two similar stimuli in a row read as new. */
  const ITI_MS = 100;

  // ------------------------------------------------------------ DOM builder

  const PROPS = new Set(['value', 'disabled', 'checked']);

  function appendChildren(el, children) {
    for (const child of children) {
      if (child == null || child === false) continue;
      if (Array.isArray(child)) appendChildren(el, child);
      else el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }

  /** h('button', { class: 'btn', on: { click } }, 'Label') → HTMLElement. */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'on') for (const [type, fn] of Object.entries(value)) el.addEventListener(type, fn);
      else if (PROPS.has(key)) el[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
    appendChildren(el, children);
    return el;
  }
  ui.h = h;

  ui.button = function button(label, cls, onClick) {
    const b = h('button', { type: 'button', class: cls ? `btn ${cls}` : 'btn', text: label });
    b.addEventListener('click', onClick);
    return b;
  };

  const answeredByDefault = (a) => a != null && a !== '' && !(Array.isArray(a) && a.length === 0);

  // --------------------------------------------------------- answer widgets

  /** Option grid labelled A, B, C…; single select (index) or multi select (sorted indices). */
  ui.choices = function choices(container, opts) {
    const options = opts.options;
    const multi = Boolean(opts.multi);
    const columns = opts.columns || Math.min(options.length, 4);
    const picked = new Set(multi ? opts.selected || [] : opts.selected == null ? [] : [opts.selected]);
    const grid = h('div', {
      class: 'choices',
      role: multi ? 'group' : 'radiogroup',
      style: `grid-template-columns: repeat(${columns}, minmax(0, 1fr))`,
    });
    const cells = options.map((option, i) => {
      const body = h('span', { class: 'choice-body' });
      if (opts.render) opts.render(option, body, i);
      else body.textContent = String(option);
      const cell = h(
        'button',
        { type: 'button', class: 'choice', role: multi ? 'checkbox' : 'radio' },
        opts.letters === false ? null : h('span', { class: 'choice-letter', text: String.fromCharCode(65 + i) }),
        body,
      );
      cell.addEventListener('click', () => {
        if (!multi) picked.clear();
        if (multi && picked.has(i)) picked.delete(i);
        else picked.add(i);
        paint();
        opts.onChange(multi ? [...picked].sort((a, b) => a - b) : i);
      });
      grid.appendChild(cell);
      return cell;
    });
    function paint() {
      cells.forEach((cell, i) => {
        cell.classList.toggle('selected', picked.has(i));
        cell.setAttribute('aria-checked', String(picked.has(i)));
      });
    }
    paint();
    container.appendChild(grid);
    return grid;
  };

  /** Free numeric answer. Enter moves on (dispatches `gis:next`, handled by the runners). */
  ui.numberField = function numberField(container, opts) {
    const label = opts.placeholder || 'Answer';
    const input = h('input', {
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      spellcheck: 'false',
      class: 'number-input',
      placeholder: label,
      'aria-label': label,
      value: opts.value == null ? '' : String(opts.value),
    });
    input.addEventListener('input', () => {
      const cleaned = input.value.replace(/[^0-9.\-]/g, '');
      if (cleaned !== input.value) input.value = cleaned;
      opts.onChange(cleaned === '' ? null : cleaned);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      input.dispatchEvent(new CustomEvent('gis:next', { bubbles: true }));
    });
    container.appendChild(
      h('label', { class: 'number-field' }, input, opts.unit ? h('span', { class: 'unit', text: opts.unit }) : null),
    );
    return input;
  };

  // ----------------------------------------------------------- power runner

  /**
   * Timed multi-question section with free navigation. Resolves when the
   * taker finishes (confirming if questions are open) or the clock runs out.
   */
  ui.powerTask = function powerTask(ctx, cfg) {
    const items = cfg.items;
    const isAnswered = cfg.isAnswered || answeredByDefault;
    const answers = items.map(() => null);
    const stage = ctx.stage;
    stage.textContent = '';

    return new Promise((resolve) => {
      let index = 0;
      let finished = false;
      let confirming = false;

      const nav = h('nav', { class: 'item-nav', 'aria-label': 'Questions' });
      const body = h('div', { class: 'item-body' });
      const prev = ui.button('← Previous', '', () => index > 0 && show(index - 1));
      const next = ui.button('Next →', '', () => index < items.length - 1 && show(index + 1));
      const finish = ui.button('Finish section', 'primary', onFinish);
      const warning = h('p', { class: 'warn', hidden: true });
      stage.append(
        nav,
        body,
        h('div', { class: 'item-controls' }, prev, next, h('span', { class: 'spacer' }), finish),
        warning,
        h('p', { class: 'muted small nav-legend', text: 'Grey boxes are answered. You can move between questions freely until time runs out.' }),
      );
      const dots = items.map((_, i) => {
        const dot = h('button', { type: 'button', class: 'dot', text: String(i + 1), 'aria-label': `Question ${i + 1}` });
        dot.addEventListener('click', () => show(i));
        nav.appendChild(dot);
        return dot;
      });
      body.addEventListener('gis:next', () => index < items.length - 1 && show(index + 1));

      const timer = ctx.timer(cfg.seconds, () => end(true));

      function paintNav() {
        dots.forEach((dot, i) => {
          dot.classList.toggle('current', i === index);
          dot.classList.toggle('answered', isAnswered(answers[i]));
        });
      }

      function cancelConfirm() {
        confirming = false;
        warning.hidden = true;
        finish.textContent = 'Finish section';
      }

      function show(i) {
        index = i;
        cancelConfirm();
        body.textContent = '';
        cfg.renderItem(items[i], body, answers[i], (value) => {
          answers[i] = value;
          cancelConfirm();
          paintNav();
        });
        prev.disabled = i === 0;
        next.disabled = i === items.length - 1;
        ctx.setProgress(`Question ${i + 1} of ${items.length}`);
        paintNav();
        window.scrollTo(0, 0);
        const field = body.querySelector('input');
        if (field) field.focus({ preventScroll: true });
      }

      function onFinish() {
        const open = answers.filter((a) => !isAnswered(a)).length;
        if (open > 0 && !confirming) {
          confirming = true;
          warning.hidden = false;
          warning.textContent =
            `${open} question${open === 1 ? ' is' : 's are'} still unanswered. If you are not sure, give your best guess, ` +
            'or press "Finish anyway" to end the section now.';
          finish.textContent = 'Finish anyway';
          return;
        }
        end(false);
      }

      function end(timedOut) {
        if (finished) return;
        finished = true;
        timer.stop();
        resolve({ answers: answers.slice(), timedOut });
      }

      show(0);
    });
  };

  // ----------------------------------------------------------- speed runner

  /**
   * Two-choice speeded trials. Timed mode: no feedback, runs until the clock
   * expires. Practice mode: `count` trials with feedback, no clock.
   * Resolves { correct, wrong }: counts of responses (an unanswered trial counts as neither).
   */
  ui.speedTask = function speedTask(ctx, cfg) {
    const responses = cfg.responses;
    const lockoutMs = cfg.lockoutMs == null ? 150 : cfg.lockoutMs;
    const practice = Boolean(cfg.practice);
    const stage = ctx.stage;
    stage.textContent = '';

    return new Promise((resolve) => {
      const display = h('div', { class: 'stimulus' });
      const feedback = h('p', { class: 'feedback', 'aria-live': 'polite' });
      const buttons = responses.map((r) => {
        const b = h('button', { type: 'button', class: 'btn response' }, h('span', { class: 'key', text: r.key.toUpperCase() }), r.label);
        b.addEventListener('click', () => {
          b.blur(); // keep Space/Enter from re-triggering a focused button
          respond(r.id);
        });
        return b;
      });
      stage.append(display, h('div', { class: 'responses' }, buttons), feedback);

      let correct = 0;
      let wrong = 0;
      let current = null;
      let shownAt = 0;
      let index = 0;
      let busy = true;
      let done = false;

      const timer = practice ? null : ctx.timer(cfg.seconds, finish);
      ctx.setProgress(practice ? `Practice: ${cfg.count} trials, not scored` : '');
      const off = ctx.onKey((event) => {
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
        const key = event.key.toLowerCase();
        const r = responses.find((x) => x.key.toLowerCase() === key);
        if (!r) return;
        event.preventDefault();
        respond(r.id);
      });

      function present() {
        if (done) return;
        if (practice && index >= cfg.count) {
          finish();
          return;
        }
        current = cfg.makeTrial(ctx.rng, index++);
        display.textContent = '';
        cfg.renderTrial(current, display);
        shownAt = ctx.now();
        busy = false;
      }

      function labelOf(id) {
        const r = responses.find((x) => x.id === id);
        return r ? r.label : String(id);
      }

      function respond(id) {
        if (done || busy || !current) return;
        if (ctx.now() - shownAt < lockoutMs) return; // anticipations and double presses
        const ok = id === current.answer;
        if (ok) correct++;
        else wrong++;
        busy = true;
        if (practice) {
          feedback.textContent = ok ? 'Correct.' : `Not quite: the right answer was "${labelOf(current.answer)}".`;
          ctx.wait(ok ? 700 : 1800).then(() => {
            feedback.textContent = '';
            present();
          });
        } else {
          display.textContent = '';
          ctx.wait(ITI_MS).then(present);
        }
      }

      function finish() {
        if (done) return;
        done = true;
        off();
        if (timer) timer.stop();
        display.textContent = '';
        resolve({ correct, wrong });
      }

      present();
    });
  };

  // -------------------------------------------------------- practice item

  /** One untimed example: answer → "Check answer" → feedback + explanation → "Continue". */
  ui.practiceItem = function practiceItem(ctx, cfg) {
    const isAnswered = cfg.isAnswered || answeredByDefault;
    const stage = ctx.stage;
    stage.textContent = '';
    ctx.setProgress('Example: untimed, not scored');

    return new Promise((resolve) => {
      let answer = null;
      const body = h('div', { class: 'item-body' });
      const note = h('p', { class: 'warn', hidden: true, text: 'Choose or type an answer first.' });
      const feedback = h('div', { class: 'panel', hidden: true, 'aria-live': 'polite' });
      const proceed = ui.button('Continue', 'primary', () => resolve());
      proceed.hidden = true;
      const check = ui.button('Check answer', 'primary', () => {
        if (!isAnswered(answer)) {
          note.hidden = false;
          return;
        }
        const ok = cfg.isCorrect(answer);
        feedback.innerHTML = `<p><strong>${ok ? 'Correct.' : 'Not quite.'}</strong></p><p>${cfg.explanation}</p>`;
        feedback.hidden = false;
        check.hidden = true;
        proceed.hidden = false;
        proceed.focus();
      });
      stage.append(
        h('p', { class: 'eyebrow', text: 'Example' }),
        body,
        h('div', { class: 'item-controls' }, check, proceed),
        note,
        feedback,
      );
      cfg.render(body, null, (value) => {
        answer = value;
        note.hidden = true;
      });
      body.addEventListener('gis:next', () => {
        if (!check.hidden) check.click();
      });
      const field = body.querySelector('input');
      if (field) field.focus();
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
