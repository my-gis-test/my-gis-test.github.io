/*
 * GIS — General Intelligence Score
 * core.js — namespace, section registry, seeded RNG, utilities, scoring math.
 *
 * Loaded as a classic script (works from file://) and via require() in Bun
 * tests, so nothing in this file may touch the DOM.
 */
(function (root) {
  'use strict';

  const GIS = root.GIS || (root.GIS = {});
  GIS.sections = GIS.sections || {};
  GIS.gen = GIS.gen || {};

  // ---------------------------------------------------------------- registry

  const REQUIRED_KEYS = ['id', 'title', 'area', 'pace', 'weight', 'timeLabel', 'intro', 'run', 'score'];
  const PACES = ['fast', 'medium', 'slow', 'paced'];

  GIS.registerSection = function registerSection(def) {
    for (const key of REQUIRED_KEYS) {
      if (def[key] === undefined) throw new Error(`Section "${def.id || '?'}" is missing "${key}"`);
    }
    if (!PACES.includes(def.pace)) throw new Error(`Section "${def.id}" has unknown pace "${def.pace}"`);
    GIS.sections[def.id] = def;
    return def;
  };

  // --------------------------------------------------------------- seeded RNG

  function hashString(str) {
    let h = 0x811c9dc5; // FNV-1a
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** Deterministic PRNG (mulberry32) seeded from any string or number. */
  GIS.rng = function rng(seed) {
    let state = hashString(String(seed));
    const next = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      seed: String(seed),
      next,
      /** Integer in [lo, hi], inclusive. */
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      /** Shuffled copy (Fisher–Yates); the input is not modified. */
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const tmp = a[i];
          a[i] = a[j];
          a[j] = tmp;
        }
        return a;
      },
      chance: (p) => next() < p,
      /** Independent child stream, stable for a given label. */
      fork: (label) => GIS.rng(`${seed}/${label}`),
    };
  };

  // ---------------------------------------------------------------- utilities

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  const util = {
    clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
    sum(arr, f) {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += f ? f(arr[i], i) : arr[i];
      return s;
    },
    range: (n) => Array.from({ length: n }, (_, i) => i),
    /** Two-decimal string; nudged so 0.125 → "0.13" rather than "0.12". */
    fmt2: (x) => (Math.round((x + Number.EPSILON) * 100) / 100).toFixed(2),
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]),
    /** Seconds → "m:ss", rounded up so a running clock never shows 0:00 early. */
    clock(sec) {
      const s = Math.max(0, Math.ceil(sec));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
  };
  GIS.util = util;

  // ------------------------------------------------------------------ scoring

  GIS.score = {
    /**
     * Power (accuracy) sections. entries: [{ weight, chance, correct }];
     * unanswered items are entered as correct:false.
     *   score = (Σw·c − Σw·g) / (Σw − Σw·g), clipped to [0, 1]
     * Blind guessing is worth 0 in expectation; a perfect run is 1.
     */
    power(entries) {
      let W = 0;
      let Wg = 0;
      let Wc = 0;
      for (const e of entries) {
        W += e.weight;
        Wg += e.weight * e.chance;
        if (e.correct) Wc += e.weight;
      }
      return util.clamp((Wc - Wg) / (W - Wg), 0, 1);
    },

    /**
     * Speed sections: net = correct − wrong (blind guessing nets 0, as in the
     * WAIS Symbol Search rule); score = net / ceiling, clipped to [0, 1], where
     * `ceiling` is the net count treated as the practical maximum for the limit.
     */
    speed({ correct, wrong, ceiling }) {
      return util.clamp((correct - wrong) / ceiling, 0, 1);
    },

    /** Weighted mean of section scores. parts: [{ weight, score }]. */
    composite(parts) {
      return util.sum(parts, (p) => p.weight * p.score) / util.sum(parts, (p) => p.weight);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
