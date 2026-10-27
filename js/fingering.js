// Griffe in der ersten Lage und eine kleine Griffbrett-Grafik für alle, die (noch) keine Noten lesen.

import { germanName } from './notes.js';

export const STRINGS = [
  { name: 'C', midi: 48, color: '#c47f4a' },
  { name: 'G', midi: 55, color: '#7f9a5a' },
  { name: 'D', midi: 62, color: '#6f8fb3' },
  { name: 'A', midi: 69, color: '#c9a64a' },
];

// Halbtöne über der leeren Saite → Finger in der ersten Lage
const FINGERS = {
  0: { finger: 0, text: 'leere Saite' },
  1: { finger: 1, text: '1. Finger, tief (dicht am Sattel)' },
  2: { finger: 1, text: '1. Finger' },
  3: { finger: 2, text: '2. Finger, tief (nah am 1.)' },
  4: { finger: 2, text: '2. Finger, hoch (nah am 3.)' },
  5: { finger: 3, text: '3. Finger' },
  6: { finger: 3, text: '3. Finger, hoch' },
  7: { finger: 4, text: '4. Finger' },
};

// Griff für einen Ton; leere Saiten werden dem 4. Finger vorgezogen.
export function fingeringFor(note) {
  const midi = note.midi;
  let choice = null;
  for (let i = STRINGS.length - 1; i >= 0; i--) {
    const semis = midi - STRINGS[i].midi;
    if (semis >= 0 && semis <= 7) {
      // Ton liegt auch als leere Saite vor? Dann die höhere Saite nehmen (semis 0)
      choice = { string: STRINGS[i], semis, ...FINGERS[semis] };
      break;
    }
  }
  if (!choice) return null;
  return { ...choice, label: `${choice.string.name}-Saite · ${choice.text}`, name: germanName(note) };
}

// Griffbrett von oben (Schnecke oben, Steg unten), Saiten C G D A von links nach rechts
export function fingerboardSVG(fing) {
  const w = 150, h = 200, top = 22, left = 30, gap = 30;
  const fretY = (s) => top + 12 + s * 21;   // grobe Position der Halbtonschritte
  let svg = `<svg class="fingerboard" viewBox="0 0 ${w} ${h}" role="img" aria-label="${fing ? fing.label : 'Griffbrett'}">`;
  svg += `<path d="M${left - 14},${top} L${left + gap * 3 + 14},${top} L${left + gap * 3 + 20},${h - 6} L${left - 20},${h - 6} Z" class="fb-wood"/>`;
  svg += `<rect x="${left - 16}" y="${top - 5}" width="${gap * 3 + 32}" height="6" rx="2" class="fb-nut"/>`;
  // Markierungen der Fingerstellen (Band für 1., 2. hoch, 3., 4.)
  [2, 4, 5, 7].forEach((s) => {
    svg += `<line x1="${left - 16}" x2="${left + gap * 3 + 16}" y1="${fretY(s)}" y2="${fretY(s)}" class="fb-tape"/>`;
  });
  STRINGS.forEach((s, i) => {
    const x = left + i * gap;
    const active = fing && fing.string.name === s.name;
    svg += `<line x1="${x}" x2="${x}" y1="${top - 2}" y2="${h - 6}" stroke="${s.color}" stroke-width="${2.6 - i * 0.4}" opacity="${active ? 1 : 0.45}"/>`;
    svg += `<text x="${x}" y="${top - 9}" class="fb-label${active ? ' on' : ''}">${s.name}</text>`;
  });
  if (fing) {
    const x = left + STRINGS.indexOf(fing.string) * gap;
    if (fing.finger === 0) {
      svg += `<circle cx="${x}" cy="${top + 2}" r="9" class="fb-open"/><text x="${x}" y="${top + 6.5}" class="fb-num">0</text>`;
      svg += `<path d="M${x},${top + 20} L${x},${h - 20}" class="fb-bow"/>`;
    } else {
      const y = fretY(fing.semis);
      svg += `<circle cx="${x}" cy="${y}" r="11" class="fb-dot"/><text x="${x}" y="${y + 5}" class="fb-num">${fing.finger}</text>`;
    }
  }
  return svg + '</svg>';
}
