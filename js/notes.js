// Tonhöhen-Hilfen: Notennamen (deutsch), MIDI-Nummern, Frequenzen und Positionen im Bratschenschlüssel.

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP_SEMIS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// „F#4“, „Bb3“, „C5“ → { step, alt, oct, midi }
export function parseNote(str) {
  const m = /^([A-Ga-g])(#{1,2}|b{1,2})?(-?\d)$/.exec(String(str).trim());
  if (!m) throw new Error(`Unbekannte Note: ${str}`);
  const step = m[1].toUpperCase();
  const alt = !m[2] ? 0 : m[2][0] === '#' ? m[2].length : -m[2].length;
  const oct = Number(m[3]);
  return { step, alt, oct, midi: (oct + 1) * 12 + STEP_SEMIS[step] + alt, id: `${step}${m[2] || ''}${oct}` };
}

// Schreibweise für erkannte Töne: Kreuze, außer B und Es (bei Streichern üblich)
const SPELL = [['C', 0], ['C', 1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['B', -1], ['B', 0]];
export function spellMidi(midi) {
  const pc = ((midi % 12) + 12) % 12;
  const [step, alt] = SPELL[pc];
  const oct = Math.floor(midi / 12) - 1;
  const acc = alt > 0 ? '#' : alt < 0 ? 'b' : '';
  return { step, alt, oct, midi, id: `${step}${acc}${oct}` };
}

// Deutscher Notenname: H statt B, B statt Bb, Fis, Es, As …
export function germanName(n) {
  const { step, alt } = n;
  if (step === 'B') return alt === -1 ? 'B' : alt === 0 ? 'H' : alt === 1 ? 'His' : 'Heses';
  if (alt === 0) return step;
  if (alt > 0) return step + 'is'.repeat(alt);
  if (step === 'E' || step === 'A') return step + 's' + 'es'.repeat(-alt - 1);
  return step + 'es'.repeat(-alt);
}

// Oktavbezeichnung nach Helmholtz: c (kleine Oktave), c' (eingestrichen) …
export function helmholtz(n) {
  const name = germanName(n);
  if (n.oct >= 3) return name.toLowerCase() + "'".repeat(n.oct - 3);
  return name + ','.repeat(Math.max(0, 2 - n.oct));
}

export const midiToFreq = (midi, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);
export const freqToMidi = (f, a4 = 440) => 69 + 12 * Math.log2(f / a4);

// Position im Bratschenschlüssel: 0 = Mittellinie (c'), +1 = eine Stufe höher (Zwischenraum)
export function staffPos(n) {
  return n.oct * 7 + STEPS.indexOf(n.step) - (4 * 7);
}

// Vorzeichen: Anzahl Kreuze (>0) oder Bes (<0) → veränderte Stammtöne
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
export function keyAlterations(key) {
  const res = {};
  if (key > 0) SHARP_ORDER.slice(0, key).forEach((s) => { res[s] = 1; });
  if (key < 0) FLAT_ORDER.slice(0, -key).forEach((s) => { res[s] = -1; });
  return res;
}
// Positionen der Vorzeichen im Bratschenschlüssel
export const KEY_SIG_POS = {
  sharp: [3, 0, 4, 1, -2, 2, -1],
  flat: [-1, 2, -2, 1, -3, 0, -4],
};
