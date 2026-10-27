// Lieder in einer einfachen Textschreibweise: Ton/Dauer in Vierteln, „|“ = Taktstrich.
// Beispiel: „A4/1 A4/.5 D4/2 |“ – Dauer 1 = Viertel, .5 = Achtel, 1.5 = punktierte Viertel, 2 = Halbe, 3 = punktierte Halbe, 4 = Ganze.

import { parseNote } from './notes.js';

export const SONGS = [
  {
    id: 'anker', title: 'Anker lichten', kind: 'Übungsstück', keySig: 2, bpm: 70,
    text: 'D4/1 D4/1 A4/2 | A4/1 A4/1 D4/2 | D4/1 A4/1 D4/1 A4/1 | D4/4',
    about: 'Nur die leeren Saiten D und A – wie das Hieven an der Ankerwinde.',
  },
  {
    id: 'taue', title: 'Vier Taue', kind: 'Übungsstück', keySig: 0, bpm: 70,
    text: 'C3/2 G3/2 | D4/2 A4/2 | A4/2 D4/2 | G3/2 C3/2 | G3/1 D4/1 A4/2 | C3/4',
    about: 'Alle vier leeren Saiten, von tief nach hoch und zurück.',
  },
  {
    id: 'moewe', title: 'Möwenruf', kind: 'Übungsstück', keySig: 2, bpm: 76,
    text: 'D4/1 E4/1 F#4/1 G4/1 | A4/2 A4/2 | G4/1 F#4/1 E4/1 D4/1 | A4/2 D4/2 | F#4/1 E4/1 D4/2',
    about: 'Die ersten drei Finger auf der D-Saite.',
  },
  {
    id: 'row', title: 'Row, Row, Row Your Boat', kind: 'Ruderlied (traditionell)', keySig: 2, bpm: 84,
    text: 'D4/1.5 D4/1.5 | D4/1 E4/.5 F#4/1.5 | F#4/1 E4/.5 F#4/1 G4/.5 | A4/3 | D5/.5 D5/.5 D5/.5 A4/.5 A4/.5 A4/.5 | F#4/.5 F#4/.5 F#4/.5 D4/.5 D4/.5 D4/.5 | A4/1 G4/.5 F#4/1 E4/.5 | D4/3',
    about: 'Bekanntes Kanon-Lied übers Rudern – ideal für die D-Dur-Tonleiter.',
  },
  {
    id: 'michael', title: 'Michael, Row the Boat Ashore', kind: 'Ruderlied (traditionell)', keySig: 2, bpm: 80,
    text: 'D4/1 F#4/1 A4/1.5 F#4/.5 | A4/1 B4/1 A4/2 | F#4/1 A4/1 B4/1 A4/3 | F#4/1 A4/1 A4/1.5 F#4/.5 | G4/1 F#4/1 E4/2 | D4/1 E4/1 F#4/1 E4/1 | D4/4',
    about: 'Ein altes Lied der Bootsleute von den Sea Islands.',
  },
  {
    id: 'bonnie', title: 'My Bonnie Lies over the Ocean', kind: 'Seemannslied (traditionell)', keySig: 1, bpm: 96,
    text: 'D4/1 | B4/1.5 A4/.5 G4/1 | A4/1 G4/1 E4/1 | D4/1 B3/2 D4/1 | B4/1.5 A4/.5 G4/1 | G4/1 F#4/1 G4/1 | A4/3 D4/1 | B4/1.5 A4/.5 G4/1 | A4/1 G4/1 E4/1 | D4/1 B3/2 D4/1 | E4/1 A4/1 G4/1 | F#4/1 E4/1 F#4/1 | G4/3',
    about: 'Die Liebste ist übers Meer gefahren – Walzertakt zum Schunkeln.',
  },
  {
    id: 'tiefsee', title: 'Tiefsee', kind: 'Übungsstück', keySig: 0, bpm: 66,
    text: 'C3/1 D3/1 E3/1 F3/1 | G3/2 G3/2 | F3/1 E3/1 D3/1 C3/1 | G3/2 C3/2 | E3/1 F3/1 G3/1 A3/1 | G3/1 E3/1 C3/2',
    about: 'Dunkle Töne auf der C-Saite – Kraken willkommen.',
  },
  {
    id: 'sailor', title: 'What Shall We Do with the Drunken Sailor', kind: 'Shanty (traditionell)', keySig: 0, bpm: 108,
    text: 'A4/1 A4/.5 A4/.5 A4/1 A4/.5 A4/.5 | A4/1 D4/1 F4/1 A4/1 | G4/1 G4/.5 G4/.5 G4/1 G4/.5 G4/.5 | G4/1 C4/1 E4/1 G4/1 | A4/1 A4/.5 A4/.5 A4/1 A4/.5 A4/.5 | A4/1 B4/1 C5/1 D5/1 | C5/1 A4/1 G4/1 E4/1 | D4/2 D4/2 | A4/2 A4/2 A4/1 D4/1 F4/1 A4/1 | G4/2 G4/2 G4/1 C4/1 E4/1 G4/1 | A4/2 A4/2 A4/1 B4/1 C5/1 D5/1 | C5/1 A4/1 G4/1 E4/1 | D4/2 D4/2',
    about: 'Der Klassiker unter den Shanties – in D-dorisch, mit tiefem 2. Finger.',
  },
  {
    id: 'ausguck', title: 'Land in Sicht!', kind: 'Übungsstück', keySig: 2, bpm: 88,
    text: 'A4/1 B4/1 C#5/1 D5/1 | E5/2 E5/2 | D5/1 C#5/1 B4/1 A4/1 | E5/4 | E5/1 D5/1 C#5/1 B4/1 | A4/1 F#4/1 E4/1 D4/1 | A4/2 E5/2 | D5/4',
    about: 'Hoch oben im Ausguck: der 4. Finger auf der A-Saite.',
  },
];

// Text → [{ note, dur } | { bar: true }]
export function parseSong(text) {
  const items = [];
  for (const tok of String(text).trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') { items.push({ bar: true }); continue; }
    const [n, d] = tok.split('/');
    const dur = d === undefined ? 1 : Number(d);
    if (!Number.isFinite(dur) || dur <= 0) throw new Error(`Ungültige Dauer in „${tok}“`);
    items.push({ note: parseNote(n), dur });
  }
  if (!items.some((i) => i.note)) throw new Error('Das Lied enthält keine Töne.');
  return items;
}
