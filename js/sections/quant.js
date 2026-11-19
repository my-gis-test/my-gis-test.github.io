/* GIS — Quantitative Reasoning (quantitative reasoning). Eight short word/series problems with free numeric answers; small numbers, no formulas or calculator needed. */
(function (root) {
  'use strict';
  const GIS = root.GIS; // core.js is always loaded first

  // ------------------------------------------------------------- constants

  const WEIGHTS = [1, 1, 1.25, 1.25, 1.25, 1.5, 1.5, 1.5];
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const POST_SPACINGS = [3, 4, 5, 6, 8];
  // (p, q) pairs chosen so (100+p)(100−q)/100 is a whole number.
  const PERCENT_PAIRS = [[25, 20], [50, 50], [20, 20], [60, 25], [40, 50], [25, 40], [80, 50], [50, 20], [20, 25], [10, 10]];
  // (v1, v2) pairs chosen so the harmonic mean 2·v1·v2/(v1+v2) is a whole number.
  const SPEED_PAIRS = [[10, 15], [12, 24], [20, 30], [6, 12], [15, 30], [30, 60], [24, 40], [40, 60], [10, 40]];
  // Q5 keeps every term (shown and answer) at two digits or fewer.
  const ALT_MAX = 99;

  const mod7 = (x) => ((x % 7) + 7) % 7;

  /** Q5 rule: 7 terms starting at a, alternating ×m then +k. */
  function altSeries(a, m, k) {
    const terms = [a];
    for (let i = 1; i < 7; i++) terms.push(i % 2 === 1 ? terms[i - 1] * m : terms[i - 1] + k);
    return terms;
  }

  /** (a, k) pairs with a∈2..5, k∈1..4 whose 7th term is ≤ ALT_MAX, for multiplier m. */
  function altPairs(m) {
    const pairs = [];
    for (let a = 2; a <= 5; a++) {
      for (let k = 1; k <= 4; k++) if (altSeries(a, m, k)[6] <= ALT_MAX) pairs.push([a, k]);
    }
    return pairs;
  }
  const ALT_PAIRS = { 2: altPairs(2), 3: altPairs(3) };

  // ------------------------------------------------------------- generators
  // Each generator returns { type, prompt, answer, unit?, options?, series?, params }.
  // `answer` is a number for type 'number', an option index for type 'choice'.
  // The closed-form keys here are re-derived by independent methods in the tests.

  /** Q1: differences grow by 1 each step (a, a+d, a+2d+1, …). */
  function genDiffSeries(rng) {
    const a = rng.int(2, 9);
    const d = rng.int(1, 4);
    const terms = [a];
    for (let i = 1; i < 7; i++) terms.push(terms[i - 1] + d + (i - 1));
    const shown = terms.slice(0, 6);
    return {
      type: 'number',
      prompt: `What number comes next?\n${shown.join(', ')}, ?`,
      series: shown,
      answer: terms[6],
      params: { a, d },
    };
  }

  /** Q2: fence posts — L/s gaps need L/s + 1 lamps. */
  function genLamps(rng) {
    const s = rng.pick(POST_SPACINGS);
    const k = rng.int(6, 12);
    const L = s * k;
    return {
      type: 'number',
      prompt: `A straight path is ${L} m long. A lamp stands at each end and every ${s} m along it. How many lamps are there?`,
      unit: 'lamps',
      answer: k + 1,
      params: { L, s, k },
    };
  }

  /** Q3: weekday offsets. Today = D − 2, yesterday = D − 3, answer = D − 3 − n. */
  function genDays(rng) {
    const D = rng.int(0, 6);
    const n = rng.int(2, 4);
    return {
      type: 'choice',
      prompt: `If the day after tomorrow is ${DAYS[D]}, what day was it ${n} days before yesterday?`,
      options: DAYS.slice(),
      answer: mod7(D - 3 - n),
      params: { D, n },
    };
  }

  /** Q4: successive percentage changes multiply: (100+p)(100−q)/100. */
  function genPercent(rng) {
    const [p, q] = rng.pick(PERCENT_PAIRS);
    return {
      type: 'number',
      prompt: `A price rises by ${p}% and then the new price falls by ${q}%. The final price is what percent of the original?`,
      unit: '%',
      answer: ((100 + p) * (100 - q)) / 100,
      params: { p, q },
    };
  }

  /** Q5: alternating ×m then +k; m uniform, then (a, k) uniform among pairs that stay ≤ 99. */
  function genAltSeries(rng) {
    const m = rng.pick([2, 3]);
    const [a, k] = rng.pick(ALT_PAIRS[m]);
    const terms = altSeries(a, m, k);
    const shown = terms.slice(0, 6);
    return {
      type: 'number',
      prompt: `What number comes next?\n${shown.join(', ')}, ?`,
      series: shown,
      answer: terms[6],
      params: { a, m, k },
    };
  }

  /** Q6: machines — each machine makes r parts per t minutes, so b machines make b·r·m parts in m·t minutes. */
  function genMachines(rng) {
    const a = rng.int(2, 6);
    let b = rng.int(2, 9);
    while (b === a) b = rng.int(2, 9);
    const r = rng.int(2, 6);
    const t = rng.int(2, 9);
    const m = rng.int(2, 4);
    return {
      type: 'number',
      prompt: `${a} machines make ${a * r} parts in ${t} minutes. At the same rate, how many minutes do ${b} machines need to make ${b * r * m} parts?`,
      unit: 'minutes',
      answer: m * t,
      params: { a, b, r, t, m },
    };
  }

  /** Q7: round-trip average speed = total distance / total time (the harmonic mean). */
  function genSpeed(rng) {
    const [v1, v2] = rng.pick(SPEED_PAIRS);
    return {
      type: 'number',
      prompt: `A cyclist rides to a lake at ${v1} km/h and back along the same road at ${v2} km/h. What is the average speed for the whole round trip, in km/h?`,
      unit: 'km/h',
      answer: (2 * v1 * v2) / (v1 + v2),
      params: { v1, v2 },
    };
  }

  /** Q8: worst case is every blue sock first, then two reds: b + 2. */
  function genSocks(rng) {
    const r = rng.int(3, 8);
    let b = rng.int(4, 12);
    while (b === r) b = rng.int(4, 12);
    return {
      type: 'number',
      prompt: `A drawer holds ${r} red socks and ${b} blue socks. In the dark, what is the fewest socks you must take out to be sure of having at least two red socks?`,
      unit: 'socks',
      answer: b + 2,
      params: { r, b },
    };
  }

  const GENERATORS = [genDiffSeries, genLamps, genDays, genPercent, genAltSeries, genMachines, genSpeed, genSocks];

  /** Eight items in fixed order; weights and chance attached for scoring. */
  function generate(rng) {
    return GENERATORS.map((gen, i) => {
      const item = gen(rng);
      item.weight = WEIGHTS[i];
      item.chance = item.type === 'choice' ? 1 / item.options.length : 0;
      return item;
    });
  }

  /**
   * Strict numeric parse of a typed answer: trimmed, plain decimal notation only
   * (so "", "abc", "1e2", "0x1F" are rejected rather than coerced by Number()).
   * Returns the number or null.
   */
  function parseNumber(str) {
    if (typeof str !== 'string') return null;
    const s = str.trim();
    if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
    return Number(s);
  }

  /** Numeric items: exact equality of the parsed number; choice items: index equality. */
  function isCorrect(item, answer) {
    if (answer === null || answer === undefined) return false;
    if (item.type === 'choice') return answer === item.answer;
    const n = parseNumber(answer);
    return n !== null && n === item.answer;
  }

  /** raw = { items, answers } → chance-corrected weighted accuracy in [0, 1]. */
  function scoreRaw(raw) {
    const answers = raw.answers || [];
    return GIS.score.power(
      raw.items.map((item, i) => ({
        weight: item.weight,
        chance: item.chance,
        correct: isCorrect(item, answers[i] === undefined ? null : answers[i]),
      }))
    );
  }

  // ------------------------------------------------------------- rendering (browser only)

  const isAnswered = (answer) => answer !== null && answer !== undefined && answer !== '';

  function renderPrompt(el, item) {
    const h = GIS.ui.h;
    const lines = item.prompt.split('\n');
    el.appendChild(h('div', { class: 'prompt' }, lines.map((line, i) => (i === 0 ? line : [h('br'), h('strong', { text: line })]))));
  }

  function renderItem(item, el, answer, setAnswer) {
    const h = GIS.ui.h;
    el.textContent = '';
    renderPrompt(el, item);
    const box = h('div', { style: 'margin-top:16px' });
    el.appendChild(box);
    if (item.type === 'choice') {
      GIS.ui.choices(box, {
        options: item.options,
        selected: answer === undefined ? null : answer,
        columns: 4,
        onChange: (sel) => setAnswer(sel),
      });
    } else {
      GIS.ui.numberField(box, {
        value: answer === null || answer === undefined ? '' : answer,
        unit: item.unit,
        placeholder: 'number',
        onChange: (v) => setAnswer(v === null || v.trim() === '' ? null : v),
      });
    }
  }

  const PRACTICE_ITEM = {
    type: 'number',
    prompt: 'What number comes next?\n2, 4, 6, 8, ?',
    answer: 10,
    explanation: 'Each number is 2 more than the one before, so 8 + 2 = 10.',
  };

  // ------------------------------------------------------------- exports

  GIS.gen.quant = {
    WEIGHTS,
    DAYS,
    PERCENT_PAIRS,
    SPEED_PAIRS,
    POST_SPACINGS,
    ALT_MAX,
    ALT_PAIRS,
    altSeries,
    generators: { genDiffSeries, genLamps, genDays, genPercent, genAltSeries, genMachines, genSpeed, genSocks },
    generate,
    parseNumber,
    isCorrect,
    score: scoreRaw,
  };

  GIS.registerSection({
    id: 'quant',
    title: 'Quantitative Reasoning',
    area: 'Quantitative reasoning — numbers and word problems',
    pace: 'medium',
    weight: 0.15,
    timeLabel: '4½ minutes · 8 questions',
    intro: [
      '<p>Eight short number problems. Type a whole-number answer in the box (one question is multiple choice). No calculator is needed; all the numbers are small.</p>',
      '<p>You have 4½ minutes in total. You can move between questions and change answers until time runs out. If you are not sure, give your best guess.</p>',
    ],
    practice: async (ctx) => {
      const item = PRACTICE_ITEM;
      await GIS.ui.practiceItem(ctx, {
        render: (el, answer, setAnswer) => renderItem(item, el, answer, setAnswer),
        isCorrect: (answer) => isCorrect(item, answer),
        isAnswered,
        explanation: item.explanation,
      });
    },
    run: async (ctx) => {
      const items = generate(ctx.rng);
      const res = await GIS.ui.powerTask(ctx, { seconds: 270, items, renderItem, isAnswered });
      return { items, answers: res.answers, timedOut: res.timedOut };
    },
    score: scoreRaw,
  });
})(typeof window !== 'undefined' ? window : globalThis);
