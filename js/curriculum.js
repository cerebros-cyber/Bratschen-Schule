// Lernpfad: Jede Stufe bringt wenige neue Töne. Die App entscheidet selbst, wann es weitergeht.
// Reihenfolge wie im üblichen Streicher-Anfangsunterricht: leere Saiten, dann D-Dur auf D- und A-Saite.

export const LEVELS = [
  {
    title: 'Leere Saiten D und A',
    intro: 'Wir beginnen ganz ohne Finger: nur die D-Saite und die A-Saite mit dem Bogen streichen.',
    pool: ['D4', 'A4'], fresh: ['D4', 'A4'], seq: 1, tol: 40,
  },
  {
    title: 'Alle vier leeren Saiten',
    intro: 'Dazu kommen die tiefe C-Saite und die G-Saite. Achte darauf, nur eine Saite zu treffen.',
    pool: ['C3', 'G3', 'D4', 'A4'], fresh: ['C3', 'G3'], seq: 1, tol: 38,
  },
  {
    title: 'D-Saite: 1., 2. und 3. Finger',
    intro: 'Auf der D-Saite greifst du E (1. Finger), Fis (2. Finger, hoch) und G (3. Finger).',
    pool: ['D4', 'E4', 'F#4', 'G4', 'A4'], fresh: ['E4', 'F#4', 'G4'], seq: 1, tol: 32,
  },
  {
    title: 'A-Saite: die D-Dur-Tonleiter',
    intro: 'Auf der A-Saite dasselbe Fingermuster: H, Cis und d. Damit kannst du die ganze D-Dur-Tonleiter.',
    pool: ['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5'], fresh: ['B4', 'C#5', 'D5'], seq: 1, tol: 30,
  },
  {
    title: 'Kleine Melodien in D-Dur',
    intro: 'Jetzt kommen kurze Tonfolgen aus drei Tönen – wie die ersten Takte eines Liedes.',
    pool: ['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5'], fresh: [], seq: 3, tol: 28,
  },
  {
    title: 'G-Saite und G-Dur',
    intro: 'Auf der G-Saite: A (1. Finger), H (2. Finger, hoch) und c\' (3. Finger).',
    pool: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4'], fresh: ['A3', 'B3', 'C4'], seq: 2, tol: 25,
  },
  {
    title: 'Die tiefe C-Saite',
    intro: 'Die dunkelste Saite: D (1. Finger), E (2. Finger, hoch) und F (3. Finger). Bogen ruhig und mit Gewicht.',
    pool: ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4'], fresh: ['D3', 'E3', 'F3'], seq: 2, tol: 25,
  },
  {
    title: 'Tiefer 2. Finger',
    intro: 'Neu ist der tiefe 2. Finger: F auf der D-Saite und c\'\' auf der A-Saite. Der Finger rutscht nah an den 1.',
    pool: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'], fresh: ['F4', 'C5'], seq: 3, tol: 22,
  },
  {
    title: '4. Finger und längere Melodien',
    intro: 'Der kleine Finger greift das e\'\' auf der A-Saite. Die Tonfolgen werden länger.',
    pool: ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'F#4', 'G4', 'A4', 'B4', 'C5', 'C#5', 'D5', 'E5'], fresh: ['E5'], seq: 4, tol: 20,
  },
  {
    title: 'Meisterstufe',
    intro: 'Alle Töne der ersten Lage, dazu B (tiefer 1. Finger auf der A-Saite, tiefer 2. auf der G-Saite).',
    pool: ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'F#4', 'G4', 'A4', 'Bb4', 'B4', 'C5', 'C#5', 'D5', 'E5'],
    fresh: ['Bb3', 'Bb4'], seq: 5, tol: 16,
  },
];

// alle Töne, die bis einschließlich Stufe `level` eingeführt wurden
export function knownNotes(level) {
  const set = new Set();
  LEVELS.slice(0, level + 1).forEach((l) => l.pool.forEach((n) => set.add(n)));
  return set;
}

// ab welcher Stufe ein Lied spielbar ist
export function levelForNotes(ids) {
  for (let i = 0; i < LEVELS.length; i++) {
    const known = knownNotes(i);
    if (ids.every((id) => known.has(id))) return i;
  }
  return LEVELS.length; // braucht Töne außerhalb des Lernpfads
}
