// Auswertung einer aufgezeichneten Tonleiter: Tonhöhenverlauf → einzelne Töne → Abgleich mit den erwarteten Tönen.

const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

// frames: [{ t: ms, m: MIDI (Kommazahl) | null }] → stabile Tonabschnitte
export function segment(frames, { maxGap = 130, minDur = 130, jump = 0.5 } = {}) {
  const segs = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    const dur = cur.end - cur.start;
    if (dur >= minDur && cur.pts.length >= 4) segs.push(cur);
    cur = null;
  };
  for (const f of frames) {
    if (f.m == null) {
      if (cur && f.t - cur.end > maxGap) close();
      continue;
    }
    if (cur && f.t - cur.end <= maxGap && Math.abs(f.m - cur.ref) < jump) {
      cur.pts.push(f);
      cur.end = f.t;
      if (cur.pts.length % 4 === 0) cur.ref = median(cur.pts.slice(-12).map((p) => p.m));
    } else {
      close();
      cur = { start: f.t, end: f.t, ref: f.m, pts: [f] };
    }
  }
  close();
  // gleiche Töne mit kurzer Unterbrechung (Bogenwechsel) zusammenfassen
  const merged = [];
  for (const s of segs) {
    const prev = merged.at(-1);
    if (prev && s.start - prev.end < 260 && Math.abs(median(s.pts.map((p) => p.m)) - median(prev.pts.map((p) => p.m))) < 0.35) {
      prev.pts.push(...s.pts);
      prev.end = s.end;
    } else merged.push(s);
  }
  return merged.map((s) => {
    // Einschwingen und Ausklingen nicht bewerten
    const core = s.pts.filter((p) => p.t >= s.start + 70 && p.t <= s.end - 40);
    const vals = (core.length >= 3 ? core : s.pts).map((p) => p.m);
    const m = median(vals);
    return { start: s.start, end: s.end, dur: s.end - s.start, m, wobble: sd(vals) * 100, pts: s.pts };
  });
}

// Abschnitte den erwarteten Tönen zuordnen (Editierabstand), damit Nebengeräusche oder vergessene Töne nicht alles verschieben.
export function align(segs, expected) {
  const n = segs.length, k = expected.length;
  const cost = (i, j) => {
    const dev = Math.abs(segs[i].m - expected[j].midi) * 100;
    return dev <= 100 ? dev / 100 : 1.6;
  };
  const EXTRA = 0.7, MISS = 1;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(k + 1));
  const B = Array.from({ length: n + 1 }, () => new Uint8Array(k + 1));
  for (let i = 1; i <= n; i++) { D[i][0] = i * EXTRA; B[i][0] = 1; }
  for (let j = 1; j <= k; j++) { D[0][j] = j * MISS; B[0][j] = 2; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= k; j++) {
      const a = D[i - 1][j - 1] + cost(i - 1, j - 1);
      const b = D[i - 1][j] + EXTRA;
      const c = D[i][j - 1] + MISS;
      if (a <= b && a <= c) { D[i][j] = a; B[i][j] = 0; } else if (b <= c) { D[i][j] = b; B[i][j] = 1; } else { D[i][j] = c; B[i][j] = 2; }
    }
  }
  const pairs = new Array(k).fill(null);
  const extras = [];
  let i = n, j = k;
  while (i > 0 || j > 0) {
    const bt = B[i][j];
    if (i > 0 && j > 0 && bt === 0) { pairs[j - 1] = segs[i - 1]; i--; j--; } else if (i > 0 && (j === 0 || bt === 1)) { extras.push(segs[i - 1]); i--; } else { j--; }
  }
  return { pairs, extras: extras.reverse() };
}

// Gesamtauswertung. tol = Toleranz in Cent für „sauber“.
export function analyse(frames, expected, tol = 20) {
  const segs = segment(frames);
  const { pairs, extras } = align(segs, expected);
  const notes = expected.map((note, j) => {
    const s = pairs[j];
    if (!s) return { note, status: 'missing' };
    const cents = (s.m - note.midi) * 100;
    if (Math.abs(cents) > 100) return { note, status: 'wrong', seg: s, cents, played: Math.round(s.m) };
    return { note, status: Math.abs(cents) <= tol ? 'ok' : cents < 0 ? 'low' : 'high', seg: s, cents, wobble: s.wobble };
  });
  const hit = notes.filter((r) => r.status === 'ok' || r.status === 'low' || r.status === 'high');
  const devs = hit.map((r) => r.cents);
  const durs = hit.map((r) => r.seg.dur);
  const up = hit.filter((r, i) => i < Math.ceil(expected.length / 2)).map((r) => r.cents);
  return {
    notes,
    extras: extras.length,
    found: hit.length,
    clean: notes.filter((r) => r.status === 'ok').length,
    avgAbs: devs.length ? mean(devs.map(Math.abs)) : null,
    tendency: devs.length ? mean(devs) : null,
    tendencyUp: up.length ? mean(up) : null,
    evenness: durs.length >= 3 ? sd(durs) / mean(durs) : null,   // 0 = alle Töne gleich lang
    wobble: hit.length ? mean(hit.map((r) => r.wobble)) : null,
    total: frames.length ? frames.at(-1).t : 0,
    segs,
  };
}
