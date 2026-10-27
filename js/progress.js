// Lernstand und Anpassung des Schwierigkeitsgrads. Alles bleibt lokal auf dem Gerät.

import { LEVELS } from './curriculum.js';

const KEY = 'bratsche-progress-v1';
const WINDOW = 20;          // so viele letzte Versuche entscheiden über den Aufstieg
const UP_AVG = 0.8;
const DOWN_AVG = 0.3;

function fresh() {
  return {
    level: 0,
    notes: {},              // id → { m: Spielsicherheit 0..1, q: Lesesicherheit 0..1, n, nq }
    recent: [],             // letzte Punktzahlen auf der aktuellen Stufe
    stats: { played: 0, correct: 0, seconds: 0, days: [] },
    settings: { a4: 440, hints: 'auto', strict: 'normal', sound: true },
    custom: [],
  };
}

export const state = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') {
      const base = fresh();
      return { ...base, ...raw, settings: { ...base.settings, ...raw.settings }, stats: { ...base.stats, ...raw.stats } };
    }
  } catch { /* privater Modus o. ä. */ }
  return fresh();
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignorieren */ }
}

export function reset() {
  const keep = { settings: state.settings, custom: state.custom };
  Object.assign(state, fresh(), keep);
  save();
}

export const level = () => LEVELS[state.level];
const rec = (id) => (state.notes[id] ||= { m: 0, q: 0, n: 0, nq: 0 });
export const noteRecord = rec;

// Toleranz in Cent: Stufe vorgegeben, per Einstellung lockerer oder strenger
export function tolerance() {
  const f = { easy: 1.5, normal: 1, strict: 0.65 }[state.settings.strict] || 1;
  return Math.round(level().tol * f);
}

// Wie viel Hilfe bekommt dieser Ton? 'show' sofort, 'delay' nach ein paar Sekunden, 'ask' nur auf Wunsch
export function hintMode(id) {
  const s = state.settings.hints;
  if (s === 'always') return 'show';
  if (s === 'never') return 'ask';
  const r = rec(id);
  const know = Math.max(r.m * 0.8, r.q);
  if (r.n < 3 || know < 0.4) return 'show';
  if (know < 0.75) return 'delay';
  return 'ask';
}

function markDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (state.stats.days.at(-1) !== d) state.stats.days.push(d);
  if (state.stats.days.length > 400) state.stats.days.shift();
}

// Ergebnis eines gespielten Tons. secs = Zeit bis zum Treffer, hinted = Hilfe war sichtbar,
// skipped = übersprungen. Rückgabe: { score, change: 'up' | 'down' | null }
export function recordPlay(id, { secs, hinted, skipped, weight = 1, counts = true }) {
  let score = 0;
  if (!skipped) {
    score = secs <= 4 ? 1 : Math.max(0.4, 1 - (secs - 4) * 0.075);
    if (hinted) score *= 0.85;
  }
  const r = rec(id);
  const a = 0.3 * weight;
  r.m = r.m * (1 - a) + score * a;
  r.n += 1;
  state.stats.played += 1;
  if (!skipped) state.stats.correct += 1;
  markDay();
  let change = null;
  if (counts) {
    state.recent.push(score);
    if (state.recent.length > WINDOW) state.recent.shift();
    change = evaluate();
  }
  save();
  return { score, change };
}

// Notenquiz: richtig/falsch beim Lesen
export function recordRead(id, ok) {
  const r = rec(id);
  r.q = r.q * 0.7 + (ok ? 0.3 : 0);
  r.nq += 1;
  markDay();
  save();
}

function evaluate() {
  const L = level();
  const avg = state.recent.reduce((a, b) => a + b, 0) / state.recent.length;
  const freshOk = L.fresh.every((id) => rec(id).n >= 3 && rec(id).m >= 0.65);
  if (state.recent.length >= WINDOW && avg >= UP_AVG && freshOk && state.level < LEVELS.length - 1) {
    state.level += 1;
    state.recent = [];
    return 'up';
  }
  if (state.recent.length >= 12 && avg < DOWN_AVG && state.level > 0) {
    state.level -= 1;
    state.recent = [];
    return 'down';
  }
  return null;
}

// Fortschritt zur nächsten Stufe, 0..1 (für den Balken)
export function levelProgress() {
  const L = level();
  if (state.level >= LEVELS.length - 1) return 1;
  const avg = state.recent.length ? state.recent.reduce((a, b) => a + b, 0) / state.recent.length : 0;
  const fill = Math.min(1, state.recent.length / WINDOW);
  const freshPart = L.fresh.length ? L.fresh.reduce((s, id) => s + Math.min(1, rec(id).m / 0.65) * Math.min(1, rec(id).n / 3), 0) / L.fresh.length : 1;
  return Math.max(0, Math.min(1, fill * Math.min(1, avg / UP_AVG) * 0.7 + freshPart * 0.3));
}

// Nächste Aufgabe: schwache und neue Töne öfter, nie zweimal dasselbe direkt hintereinander.
export function pickTask(lastIds = []) {
  const L = level();
  const pool = L.pool;
  const weight = (id) => {
    const r = rec(id);
    let w = 1 + (1 - r.m) * 2;
    if (L.fresh.includes(id)) w += 1.5;
    if (r.n < 3) w += 1;
    if (lastIds.at(-1) === id) w = 0.05;
    return w;
  };
  const choose = (cands) => {
    const ws = cands.map(weight);
    let t = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cands.length; i++) { t -= ws[i]; if (t <= 0) return cands[i]; }
    return cands.at(-1);
  };
  const first = choose(pool);
  const seq = [first];
  // Folgetöne als kleine Melodie: meist Schritte zu Nachbartönen im Vorrat
  for (let i = 1; i < L.seq; i++) {
    const idx = pool.indexOf(seq.at(-1));
    const near = pool.filter((id, j) => j !== idx && Math.abs(j - idx) <= 2);
    seq.push(choose(near.length ? near : pool));
  }
  return seq;
}
