/* GIS — Unknown Language (verbal induction). Learn an invented language from 8 example
 * sentences, then translate 6 new ones. Every item is accepted only if a brute-force search
 * over all 72 structural hypotheses shows the examples force the keyed answer. */
(function (root) {
  'use strict';
  const GIS = root.GIS;

  // ------------------------------------------------------------------ vocabulary

  // 'fish' (listed in the spec's pool) is deliberately left out: its plural equals its
  // singular, so "the cat sees the fish" would not say how many fish there are and the
  // English side of an item could be ambiguous.
  const NOUNS = [
    { en: 'dog', pl: 'dogs' },
    { en: 'cat', pl: 'cats' },
    { en: 'bird', pl: 'birds' },
    { en: 'horse', pl: 'horses' },
    { en: 'child', pl: 'children' },
  ];
  const VERBS = [
    { en: 'see', s: 'sees' },
    { en: 'follow', s: 'follows' },
    { en: 'help', s: 'helps' },
    { en: 'chase', s: 'chases' },
    { en: 'hear', s: 'hears' },
  ];
  const ADJS = ['big', 'small', 'old'];

  const ORDERS = ['SVO', 'SOV', 'VSO', 'VOS', 'OSV', 'OVS'];
  const SIDES = ['before', 'after'];
  const SUFFIX_ROLES = ['plural', 'object', 'subject'];
  /** Meaning keys every lexicon maps to a root: nouns n0–n2, verbs v0–v1, adjective, negation. */
  const MEANING_KEYS = ['n0', 'n1', 'n2', 'v0', 'v1', 'adj', 'neg'];

  const CONSONANTS = 'bdfgklmnprstvz';
  const VOWELS = 'aeiou';
  /** Invented roots must not look like the English words shown next to them. */
  const ENGLISH_WORDS = new Set(
    ['the', 'do', 'does', 'not', 'a', 'an', 'is', 'to', 'no', 'so', 'go', 'be', 'me', 'we', 'he']
      .concat(ADJS)
      .concat(NOUNS.flatMap((n) => [n.en, n.pl]))
      .concat(VERBS.flatMap((v) => [v.en, v.s])),
  );

  // Example and question meanings, written as compact templates (spec §language).
  // First noun = subject, second = object; ADJ modifies the next noun; (pl) = plural.
  const EXAMPLES = [
    'N1 V1 N2',
    'N2 V1 N1',
    'N1(pl) V2 N3',
    'N3 V2 N2(pl)',
    'N2 NEG V2 N1',
    'ADJ N3 V1 N1',
    'N1 V1 ADJ N2(pl)',
    'N3(pl) NEG V1 N2',
  ];
  const QUESTIONS = [
    { dir: 'en2al', t: 'N3 V1 N2' },
    { dir: 'al2en', t: 'N2(pl) V2 N3' },
    { dir: 'en2al', t: 'N1 NEG V1 N3(pl)' },
    { dir: 'al2en', t: 'N2 V2 ADJ N1' },
    { dir: 'en2al', t: 'ADJ N1(pl) NEG V2 N3' },
    { dir: 'al2en', t: 'N3 NEG V2 ADJ N2(pl)' },
  ];
  const WEIGHTS = [1, 1, 1.25, 1.25, 1.5, 1.5];
  const CHANCE = 1 / 4;
  const SECONDS = 240;

  // -------------------------------------------------------------------- meanings

  /** 'ADJ N1(pl) NEG V2 N3' → { s:{n,pl,adj}, v, neg, o:{n,pl,adj} } with 0-based indices. */
  function parseTemplate(t) {
    const nps = [];
    let v = -1;
    let neg = false;
    let adj = false;
    for (const tok of t.split(' ')) {
      if (tok === 'ADJ') adj = true;
      else if (tok === 'NEG') neg = true;
      else if (tok[0] === 'V') v = Number(tok[1]) - 1;
      else {
        nps.push({ n: Number(tok[1]) - 1, pl: tok.endsWith('(pl)'), adj });
        adj = false;
      }
    }
    return { s: nps[0], v, neg, o: nps[1] };
  }

  const npKey = (p) => `${p.n}${p.pl ? 'p' : ''}${p.adj ? 'a' : ''}`;
  /** Canonical string for meaning equality. */
  const meaningKey = (m) => `${npKey(m.s)}|${m.v}${m.neg ? 'n' : ''}|${npKey(m.o)}`;
  const cloneNp = (p) => ({ n: p.n, pl: p.pl, adj: p.adj });

  /** Whole noun phrases change roles (doer ↔ receiver). */
  const swapRoles = (m) => ({ s: cloneNp(m.o), v: m.v, neg: m.neg, o: cloneNp(m.s) });
  /** Only the nouns change places; number and adjective stay in their roles. */
  const swapNouns = (m) => ({ s: { ...cloneNp(m.s), n: m.o.n }, v: m.v, neg: m.neg, o: { ...cloneNp(m.o), n: m.s.n } });
  const swapPlural = (m) => ({ s: { ...cloneNp(m.s), pl: m.o.pl }, v: m.v, neg: m.neg, o: { ...cloneNp(m.o), pl: m.s.pl } });
  const swapAdj = (m) => ({ s: { ...cloneNp(m.s), adj: m.o.adj }, v: m.v, neg: m.neg, o: { ...cloneNp(m.o), adj: m.s.adj } });
  const toggleNeg = (m) => ({ s: cloneNp(m.s), v: m.v, neg: !m.neg, o: cloneNp(m.o) });

  // --------------------------------------------------------------------- English

  /** Present simple with subject–verb agreement: "The big dogs do not see the cat." */
  function english(m, lex) {
    const np = (p) => `the ${p.adj ? `${lex.adj.en} ` : ''}${p.pl ? lex.nouns[p.n].pl : lex.nouns[p.n].en}`;
    const verb = lex.verbs[m.v];
    let vp;
    if (m.neg) vp = `${m.s.pl ? 'do' : 'does'} not ${verb.en}`;
    else vp = m.s.pl ? verb.en : verb.s;
    const s = `${np(m.s)} ${vp} ${np(m.o)}.`;
    return s[0].toUpperCase() + s.slice(1);
  }

  // ------------------------------------------------------------- alien language

  /**
   * Slot sequence of a meaning under a grammar: [{ key, marked }], where `key` is a meaning
   * key (n0…neg) and `marked` says whether the noun carries the suffix. The suffix role is
   * 'plural' for every real grammar; 'object'/'subject' exist only as rival hypotheses.
   */
  function slots(m, g) {
    const role = g.suffix || 'plural';
    const np = (p, isSubject) => {
      const marked = role === 'plural' ? p.pl : role === (isSubject ? 'subject' : 'object');
      const noun = { key: `n${p.n}`, marked };
      if (!p.adj) return [noun];
      const adj = { key: 'adj', marked: false };
      return g.adj === 'before' ? [adj, noun] : [noun, adj];
    };
    const verb = { key: `v${m.v}`, marked: false };
    const neg = { key: 'neg', marked: false };
    const vp = !m.neg ? [verb] : g.neg === 'before' ? [neg, verb] : [verb, neg];
    const parts = { S: np(m.s, true), V: vp, O: np(m.o, false) };
    return g.order.split('').flatMap((c) => parts[c]);
  }

  const renderSlots = (sl, roots, suffix) => sl.map((x) => roots[x.key] + (x.marked ? suffix : '')).join(' ');

  function rootMap(lex) {
    return {
      n0: lex.nouns[0].al,
      n1: lex.nouns[1].al,
      n2: lex.nouns[2].al,
      v0: lex.verbs[0].al,
      v1: lex.verbs[1].al,
      adj: lex.adj.al,
      neg: lex.neg,
    };
  }

  /** Alien sentence for a meaning: lowercase words separated by single spaces. */
  function render(m, g, lex) {
    return renderSlots(slots(m, g), rootMap(lex), lex.suffix);
  }

  // ---------------------------------------------------------------------- lexicon

  /** Pronounceable root: 1–3 CV/CVC syllables, 2–6 letters. */
  function makeRoot(rng) {
    for (;;) {
      const syllables = rng.pick([1, 2, 2, 2, 3]);
      let s = '';
      for (let i = 0; i < syllables; i++) {
        s += rng.pick(CONSONANTS) + rng.pick(VOWELS);
        if (rng.chance(0.35)) s += rng.pick(CONSONANTS);
      }
      if (s.length >= 2 && s.length <= 6 && !ENGLISH_WORDS.has(s)) return s;
    }
  }

  /**
   * Segmentation constraint: no root is a prefix/suffix of another, and none starts or ends
   * with the plural suffix. Hence "root+suffix" can never be read as a different root or as
   * a root plus a stray ending, and every word splits into root (+ suffix) one way only.
   */
  function rootFits(r, others, suffix) {
    if (r.startsWith(suffix) || r.endsWith(suffix)) return false;
    return others.every((x) => !r.startsWith(x) && !r.endsWith(x) && !x.startsWith(r) && !x.endsWith(r));
  }

  function makeLexicon(rng) {
    const suffix = rng.pick(VOWELS) + rng.pick(CONSONANTS);
    const roots = [];
    while (roots.length < MEANING_KEYS.length) {
      const r = makeRoot(rng);
      if (rootFits(r, roots, suffix)) roots.push(r);
    }
    const nouns = rng.shuffle(NOUNS).slice(0, 3);
    const verbs = rng.shuffle(VERBS).slice(0, 2);
    return {
      nouns: nouns.map((n, i) => ({ en: n.en, pl: n.pl, al: roots[i] })),
      verbs: verbs.map((v, i) => ({ en: v.en, s: v.s, al: roots[3 + i] })),
      adj: { en: rng.pick(ADJS), al: roots[5] },
      neg: roots[6],
      suffix,
    };
  }

  // ------------------------------------------------------------------ distractors

  /**
   * Choose n distinct wrong options from candidates [{ type, value, meaning? }]. Greedy with a
   * penalty: +2 if the option merely repeats an example (free elimination by lookup), +1 if
   * its perturbation type is already used (keeps the three distractors varied). Ties fall to
   * the shuffled order, so the choice is random but deterministic for a seed.
   */
  function pickDistractors(rng, cands, keyValue, avoid, n) {
    const pool = rng.shuffle(cands).filter((c) => c.value !== keyValue);
    const chosen = [];
    while (chosen.length < n) {
      let best = null;
      let bestPenalty = Infinity;
      for (const c of pool) {
        if (chosen.some((d) => d.value === c.value)) continue;
        const penalty = (avoid.has(c.value) ? 2 : 0) + (chosen.some((d) => d.type === c.type) ? 1 : 0);
        if (penalty < bestPenalty) {
          best = c;
          bestPenalty = penalty;
        }
      }
      if (!best) return null;
      chosen.push(best);
    }
    return chosen;
  }

  /** EN→AL: the right meaning rendered under one wrong rule each. */
  function alienCandidates(m, g, lex) {
    const flip = (side) => (side === 'before' ? 'after' : 'before');
    const c = [{ type: 'roles', value: render(swapRoles(m), g, lex) }];
    if (m.s.adj || m.o.adj) c.push({ type: 'adj', value: render(m, { ...g, adj: flip(g.adj) }, lex) });
    if (m.neg) c.push({ type: 'neg', value: render(m, { ...g, neg: flip(g.neg) }, lex) });
    if (m.s.pl !== m.o.pl) c.push({ type: 'suffix', value: render(swapPlural(m), g, lex) });
    // "Verb moved": keep subject-before-object (or object-before-subject), move the verb.
    const sFirst = g.order.indexOf('S') < g.order.indexOf('O');
    for (const order of ORDERS) {
      if (order !== g.order && order.indexOf('S') < order.indexOf('O') === sFirst) {
        c.push({ type: 'verb', value: render(m, { ...g, order }, lex) });
      }
    }
    return c;
  }

  /** AL→EN: wrong meanings, each one change away from the right one. */
  function englishCandidates(m, lex) {
    const wrong = [{ type: 'roles', meaning: swapRoles(m) }, { type: 'roles', meaning: swapNouns(m) }];
    if (m.s.pl !== m.o.pl) wrong.push({ type: 'plural', meaning: swapPlural(m) });
    wrong.push({ type: 'neg', meaning: toggleNeg(m) });
    if (m.s.adj !== m.o.adj) wrong.push({ type: 'adj', meaning: swapAdj(m) });
    return wrong.map((w) => ({ ...w, value: english(w.meaning, lex) }));
  }

  // ------------------------------------------------------------------- generation

  /** One candidate item (not yet checked for identifiability); null if options run short. */
  function build(rng) {
    const lexicon = makeLexicon(rng);
    const grammar = { order: rng.pick(ORDERS), adj: rng.pick(SIDES), neg: rng.pick(SIDES), suffix: 'plural' };
    const examples = EXAMPLES.map((t) => {
      const meaning = parseTemplate(t);
      return { meaning, en: english(meaning, lexicon), al: render(meaning, grammar, lexicon) };
    });
    const exampleAl = new Set(examples.map((e) => e.al));
    const exampleEn = new Set(examples.map((e) => e.en));
    const questions = [];
    for (let i = 0; i < QUESTIONS.length; i++) {
      const { dir, t } = QUESTIONS[i];
      const meaning = parseTemplate(t);
      const al = render(meaning, grammar, lexicon);
      const en = english(meaning, lexicon);
      const q = { dir, meaning };
      if (dir === 'en2al') {
        const ds = pickDistractors(rng, alienCandidates(meaning, grammar, lexicon), al, exampleAl, 3);
        if (!ds) return null;
        const opts = rng.shuffle([{ value: al, type: 'key' }].concat(ds));
        q.prompt = en;
        q.options = opts.map((o) => o.value);
        q.types = opts.map((o) => o.type);
        q.key = q.types.indexOf('key');
      } else {
        const ds = pickDistractors(rng, englishCandidates(meaning, lexicon), en, exampleEn, 3);
        if (!ds) return null;
        const opts = rng.shuffle([{ value: en, type: 'key', meaning }].concat(ds));
        q.prompt = al;
        q.options = opts.map((o) => o.value);
        q.optionMeanings = opts.map((o) => o.meaning);
        q.types = opts.map((o) => o.type);
        q.key = q.types.indexOf('key');
      }
      questions.push(q);
    }
    return { lexicon, grammar, examples, questions };
  }

  /** Generate an identifiable item; retries are deterministic for a given rng. */
  function generate(rng) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const item = build(rng);
      if (item && identifiable(item)) return item;
    }
    throw new Error('language: no identifiable item after 200 attempts');
  }

  // ------------------------------------------------------------- identifiability

  /** All 72 structural hypotheses: word order × adjective side × negation side × suffix role. */
  const HYPOTHESES = [];
  for (const order of ORDERS) {
    for (const adj of SIDES) {
      for (const neg of SIDES) {
        for (const suffix of SUFFIX_ROLES) HYPOTHESES.push({ order, adj, neg, suffix });
      }
    }
  }

  const sameGrammar = (a, b) => a.order === b.order && a.adj === b.adj && a.neg === b.neg && (a.suffix || 'plural') === (b.suffix || 'plural');

  /**
   * Align every example to the hypothesis' slot sequence. A slot expecting the suffix needs a
   * word ending in it (the root is the rest); other slots take the whole word as the root.
   * Meaning keys and roots must pair one-to-one across all examples. Returns the derived
   * root map, or null when the hypothesis contradicts the examples. (The learner is credited
   * with spotting the 2-letter ending; it is the only ending shared by several words.)
   */
  function align(examples, h, suffix) {
    const keyToRoot = {};
    const rootToKey = {};
    for (const ex of examples) {
      const words = ex.al.split(' ');
      const sl = slots(ex.meaning, h);
      if (words.length !== sl.length) return null;
      for (let i = 0; i < sl.length; i++) {
        let w = words[i];
        if (sl[i].marked) {
          if (w.length <= suffix.length || !w.endsWith(suffix)) return null;
          w = w.slice(0, -suffix.length);
        }
        const k = sl[i].key;
        if (keyToRoot[k] === undefined && rootToKey[w] === undefined) {
          keyToRoot[k] = w;
          rootToKey[w] = k;
        } else if (keyToRoot[k] !== w || rootToKey[w] !== k) {
          return null;
        }
      }
    }
    return MEANING_KEYS.every((k) => keyToRoot[k] !== undefined) ? keyToRoot : null;
  }

  /**
   * Brute-force check over all hypotheses consistent with the examples ("survivors"):
   *  - EN→AL: every survivor renders the question meaning to exactly the keyed option;
   *  - AL→EN: every survivor renders the key meaning to the shown sentence, and no survivor
   *    renders any distractor meaning to it;
   *  - the true grammar is among the survivors.
   */
  function analyze(item) {
    const suffix = item.lexicon.suffix;
    const survivors = [];
    for (const h of HYPOTHESES) {
      const roots = align(item.examples, h, suffix);
      if (roots) survivors.push({ grammar: h, roots });
    }
    const trueSurvives = survivors.some((s) => sameGrammar(s.grammar, item.grammar));
    const problems = [];
    item.questions.forEach((q, qi) => {
      const target = q.dir === 'en2al' ? q.options[q.key] : q.prompt;
      for (const s of survivors) {
        const said = (m) => renderSlots(slots(m, s.grammar), s.roots, suffix);
        if (said(q.meaning) !== target) problems.push({ question: qi, grammar: s.grammar, reason: 'key differs' });
        if (q.dir === 'al2en') {
          q.optionMeanings.forEach((m, oi) => {
            if (oi !== q.key && said(m) === q.prompt) problems.push({ question: qi, grammar: s.grammar, reason: `option ${oi} fits` });
          });
        }
      }
    });
    return { survivors, trueSurvives, problems, ok: trueSurvives && problems.length === 0 };
  }

  const identifiable = (item) => analyze(item).ok;

  GIS.gen.language = {
    generate,
    render,
    english,
    identifiable,
    analyze,
    align,
    slots,
    parseTemplate,
    meaningKey,
    rootFits,
    HYPOTHESES,
    EXAMPLES,
    QUESTIONS,
    WEIGHTS,
    CHANCE,
  };

  // ------------------------------------------------------------------------- UI

  function exampleTable(item) {
    const h = GIS.ui.h;
    return h(
      'table',
      { class: 'plain', style: 'margin: 0 auto 1em auto' },
      h('thead', {}, h('tr', {}, h('th', { text: 'Invented language' }), h('th', { text: 'English' }))),
      h(
        'tbody',
        {},
        item.examples.map((ex) => h('tr', {}, h('td', {}, h('span', { class: 'alien', text: ex.al })), h('td', { text: ex.en }))),
      ),
    );
  }

  function renderQuestion(item, q, el, answer, setAnswer) {
    const h = GIS.ui.h;
    el.textContent = '';
    el.appendChild(exampleTable(item));
    el.appendChild(
      q.dir === 'en2al'
        ? h('div', { class: 'prompt' }, 'Which sentence in the invented language means: ', h('b', { text: q.prompt }))
        : h('div', { class: 'prompt' }, 'What does ', h('span', { class: 'alien', text: q.prompt }), ' mean?'),
    );
    const box = h('div');
    el.appendChild(box);
    GIS.ui.choices(box, {
      options: q.options,
      columns: 1,
      selected: answer === null || answer === undefined ? undefined : answer,
      render:
        q.dir === 'en2al'
          ? (opt, cell) => {
              cell.textContent = '';
              cell.appendChild(h('span', { class: 'alien', text: opt }));
            }
          : undefined,
      onChange: (i) => setAnswer(i),
    });
  }

  /** Chance-corrected weighted accuracy; only the keys and answers are needed. */
  function score(raw) {
    const answers = raw.answers || [];
    return GIS.score.power(raw.keys.map((key, i) => ({ weight: WEIGHTS[i], chance: CHANCE, correct: answers[i] === key })));
  }

  GIS.registerSection({
    id: 'language',
    title: 'Unknown Language',
    area: 'Verbal induction — learning the rules of a new language',
    pace: 'slow',
    weight: 0.12,
    timeLabel: '4 minutes · 6 questions',
    intro: [
      '<p>You will see eight sentences in an invented language, each with its English meaning. ' +
        'Work out which word means what, and the rules for building a sentence: the order of the words, ' +
        'where the word for "not" goes, where a describing word such as "big" goes, and how more than one thing is shown.</p>',
      '<p>For example, if <span class="alien">pel zu mak</span> means "The cat sees the bird." and ' +
        '<span class="alien">mak zu pel</span> means "The bird sees the cat.", then the first word names ' +
        'whoever does the seeing.</p>',
      '<p>Then answer six translation questions (four options each). The examples stay on screen the whole time. ' +
        'You have 4 minutes in total and can move between questions and change answers until time runs out. ' +
        'If you are not sure, give your best guess.</p>',
    ],
    async run(ctx) {
      const item = generate(ctx.rng);
      const res = await GIS.ui.powerTask(ctx, {
        seconds: SECONDS,
        items: item.questions,
        renderItem: (q, el, answer, setAnswer) => renderQuestion(item, q, el, answer, setAnswer),
      });
      return { keys: item.questions.map((q) => q.key), answers: res.answers, timedOut: res.timedOut };
    },
    score,
  });
})(typeof window !== 'undefined' ? window : globalThis);
