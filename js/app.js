// Bratsche ahoi! – Übungsbegleiter für die Bratsche: Stimmen, Intonation, Notenlesen, Shanties.

import { parseNote, spellMidi, germanName, helmholtz, freqToMidi, midiToFreq } from './notes.js';
import { PitchListener } from './pitch.js';
import { analyse } from './analysis.js';
import { staffSVG } from './staff.js';
import { fingeringFor, fingeringOnString, fingerboardSVG, STRINGS } from './fingering.js';
import { LEVELS, knownNotes, levelForNotes } from './curriculum.js';
import { SONGS, parseSong } from './songs.js';
import * as P from './progress.js';
import { audio, voice, playMidi, playMelody, chime, fanfare, click } from './synth.js';

const app = document.getElementById('app');
const mic = new PitchListener(audio);
const S = P.state;
let cleanup = null;
let currentScreen = 'home';
const MIC_SCREENS = ['tuner', 'exercise', 'free', 'song', 'scale'];
mic.setSensitivity(S.settings.sens);

// ---------- kleine Helfer ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = app) => root.querySelector(sel);
const noteLabel = (n) => germanName(n);

// Vergrößerung der Notenzeile passend zur Bildschirmbreite (iPad groß, iPhone kleiner)
function fitScale(box, width, max = 1.8) {
  const avail = (box?.clientWidth || 300) - 24;
  return Math.max(0.8, Math.min(max, avail / width));
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function modal(html, buttons = [{ label: 'Weiter', primary: true }]) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}<div class="modal-actions">${buttons
      .map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      wrap.remove();
      resolve(Number(b.dataset.i));
    });
  });
}

function go(screen, arg) {
  cleanup?.();
  cleanup = null;
  currentScreen = screen;
  window.scrollTo(0, 0);
  const fn = SCREENS[screen];
  cleanup = fn(arg) || null;
  if (!MIC_SCREENS.includes(screen)) mic.stop();
}

function topbar(title, sub = '') {
  return `<header class="top"><button class="back" data-go="home" aria-label="Zurück zum Hafen">‹ Hafen</button>
    <div class="top-title"><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div></header>`;
}

app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (b) go(b.dataset.go, b.dataset.arg);
});

// Mikrofon einschalten (braucht eine Berührung, sonst blockiert iOS)
async function ensureMic(box) {
  if (mic.active) return true;
  box.innerHTML = `<div class="mic-ask"><p>Für diese Übung hört die App dir über das Mikrofon zu. Es wird nichts aufgenommen oder gespeichert.</p>
    <button class="btn primary big" data-mic>🎙 Mikrofon einschalten</button></div>`;
  box.hidden = false;
  return new Promise((resolve) => {
    box.querySelector('[data-mic]').addEventListener('click', async () => {
      try {
        await mic.start();
        box.hidden = true;
        box.innerHTML = '';
        resolve(true);
      } catch (err) {
        box.innerHTML = `<div class="mic-ask"><p class="warn">Kein Zugriff auf das Mikrofon: ${esc(err.message || err.name)}</p>
          <p>Unter <b>Einstellungen → Safari → Mikrofon</b> (oder beim Website-Menü „aA“) den Zugriff erlauben und die Seite neu laden.</p></div>`;
        resolve(false);
      }
    }, { once: true });
  });
}

// Spielt einen Bezugston, ohne dass die App sich selbst „hört“
function hear(midi, dur = 1.3) {
  mic.muted = true;
  playMidi(midi, dur, S.settings.a4);
  clearTimeout(hear.t);
  hear.t = setTimeout(() => { mic.muted = false; mic.recent = []; }, dur * 1000 + 350);
}

// ---------- Tonvergleich ----------

function compare(freq, targetMidi) {
  if (!freq) return null;
  const m = freqToMidi(freq, S.settings.a4);
  let diff = m - targetMidi;
  // Oktavfehler der Erkennung (oder der Hand) großzügig behandeln
  if (Math.abs(diff) > 6) {
    const r = diff - 12 * Math.round(diff / 12);
    if (Math.abs(r) < 0.6) diff = r;
  }
  return { midi: m, cents: diff * 100 };
}

// Erkennt, ob der Zielton gehalten wird. hold = Millisekunden im Toleranzbereich.
class Matcher {
  constructor(targetMidi, tol, hold = 200) {
    this.target = targetMidi; this.tol = tol; this.hold = hold;
    this.okSince = 0; this.lastSeen = 0; this.done = false;
  }
  feed(info, now) {
    const c = compare(info.freq, this.target);
    if (!c) {
      if (now - this.lastSeen > 160) this.okSince = 0;
      return { status: 'silent' };
    }
    this.lastSeen = now;
    const a = Math.abs(c.cents);
    let status;
    if (a <= this.tol) status = 'ok';
    else if (a <= 75) status = c.cents < 0 ? 'low' : 'high';
    else status = c.cents < 0 ? 'wronglow' : 'wronghigh';
    if (status === 'ok') {
      if (!this.okSince) this.okSince = now;
      if (now - this.okSince >= this.hold) this.done = true;
    } else this.okSince = 0;
    return { status, ...c, frac: this.okSince ? Math.min(1, (now - this.okSince) / this.hold) : 0 };
  }
}

function meterHTML() {
  return `<div class="meter" aria-hidden="true"><div class="meter-zone"></div><div class="meter-mid"></div><div class="needle"></div>
    <span class="ml">tiefer</span><span class="mr">höher</span></div>`;
}
function setMeter(el, cents, tol) {
  const zone = el.querySelector('.meter-zone');
  zone.style.width = `${Math.min(100, tol)}%`;
  const needle = el.querySelector('.needle');
  if (cents == null) { needle.style.opacity = 0.15; return; }
  const v = Math.max(-50, Math.min(50, cents));
  needle.style.opacity = 1;
  needle.style.left = `${50 + v}%`;
  needle.classList.toggle('ok', Math.abs(cents) <= tol);
}

// Text für die Rückmeldung „höher / tiefer“
function verdict(r, target) {
  if (!r || r.status === 'silent') return { cls: '', html: '<span class="dim">Spiel den Ton …</span>' };
  const played = spellMidi(Math.round(r.midi));
  const c = Math.round(r.cents);
  switch (r.status) {
    case 'ok': return { cls: 'ok', html: `✓ Genau! <small>${c > 0 ? '+' : ''}${c} Cent</small>` };
    case 'low': return { cls: 'low', html: `▲ etwas höher <small>${c} Cent</small>` };
    case 'high': return { cls: 'high', html: `▼ etwas tiefer <small>+${c} Cent</small>` };
    default: {
      const semis = Math.round(Math.abs(r.cents) / 100);
      const dir = r.cents < 0 ? '▲ höher' : '▼ tiefer';
      return { cls: r.status === 'wronglow' ? 'low' : 'high', html: `${dir} <small>Du spielst ${noteLabel(played)}, gesucht ist ${noteLabel(target)} – ${semis} Halbton${semis === 1 ? '' : 'schritte'} ${r.cents < 0 ? 'darüber' : 'darunter'}</small>` };
    }
  }
}

function hintHTML(note) {
  const f = fingeringFor(note);
  return `<div class="hint"><div class="hint-name"><b>${noteLabel(note)}</b><small>${helmholtz(note)}</small></div>
    ${fingerboardSVG(f)}<div class="hint-text">${f ? esc(f.label) : 'außerhalb der ersten Lage'}</div></div>`;
}

// ---------- Hafen (Startseite) ----------

function home() {
  const L = P.level();
  const pct = Math.round(P.levelProgress() * 100);
  const days = S.stats.days.length;
  app.innerHTML = `<div class="home">
    <header class="hero"><img src="icons/icon-192.png" alt="" class="logo"><div><h1>Bratsche ahoi!</h1>
      <p class="sub">Dein Übungsmaat für Bratsche, Shanties und Piratenlieder</p></div></header>
    <section class="card level-card">
      <div class="lv-head"><span class="badge">Stufe ${S.level + 1} / ${LEVELS.length}</span><b>${esc(L.title)}</b></div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="lv-foot">${S.level < LEVELS.length - 1 ? `Bis zur nächsten Stufe: ${pct} %` : 'Höchste Stufe erreicht – weiter so, Kapitän!'}${days ? ` · ${days} Übungstag${days === 1 ? '' : 'e'}` : ''}</div>
      <button class="btn primary big" data-go="exercise">⚓ Übung starten</button>
    </section>
    <nav class="tiles">
      <button class="tile" data-go="tuner"><span class="ti">🎻</span><b>Stimmen</b><small>Saiten C · G · D · A</small></button>
      <button class="tile" data-go="scale"><span class="ti">🪜</span><b>Tonleiter</b><small>aufnehmen & auswerten</small></button>
      <button class="tile" data-go="songs"><span class="ti">🏴‍☠️</span><b>Lieder</b><small>Shanties mitspielen</small></button>
      <button class="tile" data-go="quiz"><span class="ti">📜</span><b>Notenquiz</b><small>Bratschenschlüssel lesen</small></button>
      <button class="tile" data-go="free"><span class="ti">🧭</span><b>Freies Spiel</b><small>Intonation prüfen</small></button>
      <button class="tile" data-go="log"><span class="ti">📖</span><b>Logbuch</b><small>Fortschritt & Einstellungen</small></button>
    </nav>
  </div>`;
}

// ---------- Stimmen ----------

function tuner() {
  let fixed = null;      // gewählte Saite oder null = automatisch
  let ref = null;        // laufender Bezugston
  app.innerHTML = `${topbar('Stimmen', `Kammerton a' = <b class="a4">${S.settings.a4}</b> Hz`)}
    <div class="screen tuner">
      <div class="mic-box" hidden></div>
      <div class="strings">${STRINGS.map((s) => `<button class="string-btn" data-s="${s.name}" style="--c:${s.color}">${s.name}<small>${s.name === 'C' ? 'tiefste' : s.name === 'A' ? 'höchste' : ''}</small></button>`).join('')}</div>
      <p class="tiny">Saite antippen = Bezugston hören und nur diese Saite prüfen. Nochmals tippen = automatisch.</p>
      <div class="gauge-wrap card">
        <svg class="gauge" viewBox="0 0 300 170">
          <path d="M30,150 A120,120 0 0 1 270,150" class="g-arc"/>
          <path d="M${150 - 120 * Math.sin(Math.PI / 18)},${150 - 120 * Math.cos(Math.PI / 18)} A120,120 0 0 1 ${150 + 120 * Math.sin(Math.PI / 18)},${150 - 120 * Math.cos(Math.PI / 18)}" class="g-ok"/>
          ${[-50, -25, 0, 25, 50].map((c) => { const a = (c / 50) * (Math.PI / 2) * 0.9; return `<line x1="${150 + 108 * Math.sin(a)}" y1="${150 - 108 * Math.cos(a)}" x2="${150 + 124 * Math.sin(a)}" y2="${150 - 124 * Math.cos(a)}" class="g-tick"/>`; }).join('')}
          <line x1="150" y1="150" x2="150" y2="40" class="g-needle"/>
          <circle cx="150" cy="150" r="7" class="g-hub"/>
        </svg>
        <div class="g-note">–</div>
        <div class="g-cents"></div>
        <div class="g-advice">Streiche eine leere Saite an.</div>
      </div>
      <details class="card tips"><summary>So stimmst du die Bratsche</summary>
        <ul><li>Zuerst die <b>A-Saite</b>, dann D, G und C.</li>
        <li>Kleine Abweichungen mit den <b>Feinstimmern</b> am Saitenhalter: im Uhrzeigersinn = höher.</li>
        <li>Große Abweichungen vorsichtig mit den <b>Wirbeln</b>: drehen und dabei leicht hineindrücken, damit er hält.</li>
        <li>Immer von unten an den Ton heranstimmen – so hält die Stimmung besser.</li></ul></details>
    </div>`;
  const needle = $('.g-needle');
  const box = $('.mic-box');
  const stopRef = () => { ref?.stop(); ref = null; mic.muted = false; };
  app.querySelectorAll('.string-btn').forEach((b) => b.addEventListener('click', () => {
    const s = STRINGS.find((x) => x.name === b.dataset.s);
    const same = fixed === s;
    stopRef();
    fixed = same ? null : s;
    app.querySelectorAll('.string-btn').forEach((x) => x.classList.toggle('sel', fixed && x.dataset.s === fixed.name));
    if (fixed) {
      mic.muted = true;
      ref = voice(midiToFreq(s.midi, S.settings.a4), { gain: 0.16 });
      setTimeout(() => { if (ref) { ref.stop(); ref = null; } mic.muted = false; mic.recent = []; }, 2200);
    }
  }));
  let last = 0;
  const off = mic.on((info) => {
    const now = performance.now();
    if (now - last < 50) return;
    last = now;
    if (!info.freq) return;
    const m = freqToMidi(info.freq, S.settings.a4);
    const s = fixed || STRINGS.reduce((a, b) => (Math.abs(b.midi - m) < Math.abs(a.midi - m) ? b : a));
    const cents = (m - s.midi) * 100;
    if (!fixed && Math.abs(cents) > 350) return; // kein Saitenton
    app.querySelectorAll('.string-btn').forEach((x) => x.classList.toggle('hot', x.dataset.s === s.name));
    const v = Math.max(-50, Math.min(50, cents));
    needle.setAttribute('transform', `rotate(${(v / 50) * 81} 150 150)`);
    needle.classList.toggle('ok', Math.abs(cents) <= 5);
    $('.g-note').textContent = `${s.name}-Saite`;
    $('.g-cents').textContent = `${cents > 0 ? '+' : ''}${Math.round(cents)} Cent · ${info.freq.toFixed(1)} Hz`;
    let adv;
    if (Math.abs(cents) <= 5) adv = '✓ Gestimmt!';
    else if (Math.abs(cents) <= 40) adv = cents < 0 ? '▲ etwas zu tief – Feinstimmer im Uhrzeigersinn drehen' : '▼ etwas zu hoch – Feinstimmer gegen den Uhrzeigersinn drehen';
    else adv = cents < 0 ? '▲ deutlich zu tief – Wirbel vorsichtig spannen' : '▼ deutlich zu hoch – Wirbel etwas lockern';
    const advEl = $('.g-advice');
    advEl.textContent = adv;
    advEl.className = `g-advice ${Math.abs(cents) <= 5 ? 'ok' : ''}`;
  });
  ensureMic(box);
  return () => { off(); stopRef(); };
}

// ---------- Übung (adaptiv) ----------

function exercise() {
  let task = [];
  let idx = 0;
  let matcher = null;
  let started = 0;
  let hinted = false;
  let hintTimer = null;
  let advancing = false;
  let lastIds = [];
  let streak = 0;
  let alive = true;

  app.innerHTML = `${topbar('Übung', '')}
    <div class="screen exercise">
      <div class="mic-box" hidden></div>
      <div class="lv-strip"><span class="lv-name"></span><div class="bar small"><div></div></div><span class="streak"></span></div>
      <div class="card staff-card"><div class="staff-box"></div><div class="hold"><div></div></div></div>
      <div class="feedback"><div class="verdict"></div>${meterHTML()}</div>
      <div class="hint-box"></div>
      <div class="actions">
        <button class="btn" data-a="listen">▶ Anhören</button>
        <button class="btn" data-a="hint">💡 Tipp</button>
        <button class="btn" data-a="skip">Überspringen ›</button>
      </div>
    </div>`;
  const box = $('.mic-box');

  const updateStrip = () => {
    $('.lv-name').textContent = `Stufe ${S.level + 1}: ${P.level().title}`;
    $('.lv-strip .bar div').style.width = `${Math.round(P.levelProgress() * 100)}%`;
    $('.streak').textContent = streak >= 3 ? `🔥 ${streak}` : '';
  };

  const render = (ghost) => {
    const items = task.map((n, i) => ({ note: n, dur: task.length === 1 ? 4 : 1, cls: i < idx ? 'done' : i === idx ? 'current' : '' }));
    const g = ghost ? { midi: ghost.midi, cls: ghost.status === 'ok' ? 'ok' : 'off' } : null;
    const opts = { ghost: g, minWidth: 220 };
    const sbox = $('.staff-card');
    opts.scale = fitScale(sbox, staffSVG(items, opts).width, 1.7);
    $('.staff-box').innerHTML = staffSVG(items, opts).svg;
  };

  const showHint = (force = false) => {
    const n = task[idx];
    if (!n) return;
    if (force || P.hintMode(n.id) === 'show') {
      if (force) hinted = true;
      $('.hint-box').innerHTML = hintHTML(n);
    } else {
      $('.hint-box').innerHTML = `<div class="hint-hidden">Welcher Ton ist das? ${P.hintMode(n.id) === 'delay' ? 'Gleich kommt ein Tipp …' : 'Tippe auf „Tipp“, wenn du Hilfe brauchst.'}</div>`;
    }
  };

  const startNote = () => {
    const n = task[idx];
    matcher = new Matcher(n.midi, P.tolerance());
    started = performance.now();
    hinted = false;
    clearTimeout(hintTimer);
    showHint();
    if (P.hintMode(n.id) === 'delay') hintTimer = setTimeout(() => { if (!alive) return; hinted = true; $('.hint-box').innerHTML = hintHTML(n); }, 5000);
    render();
  };

  const levelIntro = async () => {
    S.seen ||= {};
    if (S.seen[S.level]) return;
    S.seen[S.level] = true;
    P.save();
    const L = P.level();
    const freshNotes = L.fresh.map(parseNote);
    await modal(`<h2>Stufe ${S.level + 1}: ${esc(L.title)}</h2><p>${esc(L.intro)}</p>
      ${freshNotes.length ? `<div class="intro-notes">${freshNotes.map((n) => `<div>${staffSVG([{ note: n, dur: 4 }], { minWidth: 120 }).svg}${hintHTML(n)}</div>`).join('')}</div>` : ''}
      <p class="tiny">Die App merkt, wann du sicher bist, und geht dann von selbst weiter.</p>`, [{ label: 'Leinen los!', primary: true }]);
  };

  const newTask = async () => {
    if (!alive) return;
    await levelIntro();
    if (!alive) return;
    task = P.pickTask(lastIds).map(parseNote);
    lastIds = task.map((n) => n.id);
    idx = 0;
    advancing = false;
    updateStrip();
    startNote();
  };

  const finishNote = async (skipped) => {
    const n = task[idx];
    clearTimeout(hintTimer);
    const secs = (performance.now() - started) / 1000;
    const { change } = P.recordPlay(n.id, { secs, hinted, skipped });
    streak = skipped ? 0 : streak + 1;
    if (!skipped && S.settings.sound) chime();
    idx += 1;
    updateStrip();
    if (change) {
      advancing = true;
      render();
      if (change === 'up') {
        if (S.settings.sound) fanfare();
        await modal(`<h2>⚓ Ahoi, eine Stufe weiter!</h2><p>Du spielst sicher genug für <b>Stufe ${S.level + 1}: ${esc(P.level().title)}</b>.</p>`, [{ label: 'Weiter', primary: true }]);
      } else {
        await modal('<h2>Kurs korrigiert</h2><p>Das war gerade viel auf einmal. Wir üben noch einmal die vorige Stufe – so wird es schnell wieder sicher.</p>');
      }
      return newTask();
    }
    if (idx >= task.length) {
      advancing = true;
      render();
      setTimeout(newTask, 400);
    } else startNote();
  };

  app.querySelector('.actions').addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a || !task.length) return;
    if (a === 'listen') hear(task[idx]?.midi ?? task[0].midi);
    if (a === 'hint') { hinted = true; $('.hint-box').innerHTML = hintHTML(task[idx]); }
    if (a === 'skip' && !advancing) finishNote(true);
  });

  let lastDraw = 0;
  const off = mic.on((info) => {
    if (!matcher || advancing) return;
    const now = performance.now();
    const r = matcher.feed(info, now);
    if (matcher.done) { matcher = null; finishNote(false); return; }
    if (now - lastDraw < 33) return;
    lastDraw = now;
    const v = verdict(r, task[idx]);
    const vEl = $('.verdict');
    vEl.className = `verdict ${v.cls}`;
    vEl.innerHTML = v.html;
    setMeter($('.meter'), r.status === 'silent' ? null : r.cents, matcher.tol);
    $('.hold div').style.width = `${(r.frac || 0) * 100}%`;
    render(r.status === 'silent' ? null : r);
  });

  const timer = setInterval(() => { if (!document.hidden && mic.active) { S.stats.seconds += 5; } }, 5000);
  ensureMic(box).then((ok) => { if (ok) newTask(); });
  return () => { alive = false; off(); clearTimeout(hintTimer); clearInterval(timer); P.save(); };
}

// ---------- Freies Spiel ----------

function freePlay() {
  const trace = [];
  app.innerHTML = `${topbar('Freies Spiel', 'Spiel, was du möchtest – die App zeigt Ton und Intonation')}
    <div class="screen free">
      <div class="mic-box" hidden></div>
      <div class="free-top">
        <div class="card staff-card small"><div class="staff-box"></div></div>
        <div class="card big-note"><div class="bn-name">–</div><div class="bn-sub"></div></div>
      </div>
      <div class="feedback"><div class="verdict"></div>${meterHTML()}</div>
      <div class="card"><canvas class="trace" height="220"></canvas>
        <div class="trace-legend"><span class="lg ok">±10 Cent</span><span class="lg mid">±25 Cent</span><span class="lg bad">mehr</span><span class="score"></span></div></div>
    </div>`;
  const canvas = $('.trace');
  const g2 = canvas.getContext('2d');
  let inTune = 0, total = 0, last = 0;
  const empty = staffSVG([], { minWidth: 160, scale: 1.4 }).svg;
  $('.staff-box').innerHTML = empty;

  const draw = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, w, h);
    const now = performance.now();
    const pts = trace.filter((p) => now - p.t < 8000);
    trace.splice(0, trace.length - pts.length);
    const mids = pts.filter((p) => p.m != null).map((p) => p.m);
    const center = mids.length ? Math.round(mids.slice(-30).sort((a, b) => a - b)[Math.floor(Math.min(30, mids.length) / 2)]) : 62;
    const span = 5;
    const yOf = (m) => h / 2 - ((m - center) / span) * (h / 2);
    g2.font = '12px "EB Garamond", serif';
    for (let m = center - span; m <= center + span; m++) {
      const y = yOf(m);
      g2.strokeStyle = m === center ? 'rgba(201,166,74,.45)' : 'rgba(180,200,220,.12)';
      g2.beginPath(); g2.moveTo(34, y); g2.lineTo(w, y); g2.stroke();
      g2.fillStyle = 'rgba(220,214,200,.6)';
      g2.fillText(noteLabel(spellMidi(m)), 4, y + 4);
    }
    pts.forEach((p) => {
      if (p.m == null) return;
      const x = 34 + (1 - (now - p.t) / 8000) * (w - 38);
      const dev = Math.abs(p.m - Math.round(p.m)) * 100;
      g2.fillStyle = dev <= 10 ? '#8fbf6a' : dev <= 25 ? '#d6a548' : '#d0564c';
      g2.beginPath(); g2.arc(x, yOf(p.m), 2.4, 0, Math.PI * 2); g2.fill();
    });
  };

  const off = mic.on((info) => {
    const now = performance.now();
    const m = info.freq ? freqToMidi(info.freq, S.settings.a4) : null;
    trace.push({ t: now, m });
    if (m != null) {
      total += 1;
      if (Math.abs(m - Math.round(m)) * 100 <= 15) inTune += 1;
    }
    if (now - last < 40) return;
    last = now;
    draw();
    if (m == null) return;
    const n = spellMidi(Math.round(m));
    const cents = (m - Math.round(m)) * 100;
    $('.bn-name').textContent = noteLabel(n);
    const f = fingeringFor(n);
    $('.bn-sub').textContent = `${helmholtz(n)}${f ? ` · ${f.label}` : ''}`;
    $('.staff-box').innerHTML = staffSVG([], { ghost: { midi: m, cls: Math.abs(cents) <= 15 ? 'ok' : 'off', x: 110 }, minWidth: 160, scale: 1.4 }).svg;
    const vEl = $('.verdict');
    const c = Math.round(cents);
    vEl.className = `verdict ${Math.abs(c) <= 15 ? 'ok' : c < 0 ? 'low' : 'high'}`;
    vEl.innerHTML = Math.abs(c) <= 15 ? `✓ sauber <small>${c > 0 ? '+' : ''}${c} Cent</small>` : c < 0 ? `▲ etwas zu tief <small>${c} Cent</small>` : `▼ etwas zu hoch <small>+${c} Cent</small>`;
    setMeter($('.meter'), cents, 15);
    if (total > 30) $('.score').textContent = `sauber: ${Math.round((inTune / total) * 100)} %`;
  });
  ensureMic($('.mic-box'));
  return off;
}

// ---------- Lieder ----------

function allSongs() {
  return [...SONGS, ...S.custom.map((c) => ({ ...c, kind: 'Eigenes Lied', custom: true }))].map((s) => {
    try {
      const items = parseSong(s.text);
      const ids = [...new Set(items.filter((i) => i.note).map((i) => i.note.id))];
      return { ...s, items, need: levelForNotes(ids), error: null };
    } catch (err) { return { ...s, items: [], need: 99, error: err.message }; }
  });
}

function songs() {
  const list = allSongs().sort((a, b) => a.need - b.need);
  app.innerHTML = `${topbar('Lieder', 'Shanties und Seemannslieder zum Mitspielen')}
    <div class="screen songs"><div class="song-list">${list.map((s) => {
      const locked = s.need > S.level;
      return `<button class="card song ${locked ? 'locked' : ''}" data-go="song" data-arg="${esc(s.id)}">
        <div><b>${esc(s.title)}</b><small>${esc(s.kind)}${s.about ? ` – ${esc(s.about)}` : ''}</small>${s.error ? `<small class="warn">${esc(s.error)}</small>` : ''}</div>
        <span class="song-lv">${locked ? `🔒 ab Stufe ${Math.min(s.need, LEVELS.length) + 1}` : '▶'}</span></button>`;
    }).join('')}</div>
    <p class="tiny">Gesperrte Lieder kannst du trotzdem öffnen und anhören – mitspielen lohnt sich aber erst, wenn du die Töne kennst. Eigene Lieder fügst du im Logbuch hinzu.</p></div>`;
}

function songScreen(id) {
  const song = allSongs().find((s) => s.id === id);
  if (!song || song.error) { go('songs'); return null; }
  const items = song.items;
  const noteIdx = items.map((it, i) => (it.note ? i : -1)).filter((i) => i >= 0);
  let mode = 'idle';      // idle | listen | play
  let pos = 0;            // Index in noteIdx
  let matcher = null;
  let stopMelody = null;
  let started = 0;
  let results = [];
  let labels = S.level < 5;

  app.innerHTML = `${topbar(song.title, esc(song.kind))}
    <div class="screen song-screen">
      <div class="mic-box" hidden></div>
      <div class="card staff-card scroll"><div class="staff-box"></div></div>
      <div class="song-controls">
        <button class="btn" data-a="listen">▶ Anhören</button>
        <button class="btn primary" data-a="play">🎻 Mitspielen</button>
        <label class="check"><input type="checkbox" data-a="labels" ${labels ? 'checked' : ''}> Notennamen</label>
      </div>
      <div class="song-live" hidden>
        <div class="feedback"><div class="verdict"></div>${meterHTML()}</div>
        <div class="hint-box"></div>
      </div>
      ${song.need > S.level ? `<p class="tiny warn">Dieses Lied braucht Töne ab Stufe ${Math.min(song.need, LEVELS.length) + 1}. Anhören geht immer!</p>` : ''}
    </div>`;

  const render = (ghost) => {
    const cur = noteIdx[pos];
    const its = items.map((it, i) => (it.bar ? it : {
      ...it,
      cls: mode === 'idle' ? '' : i === cur ? 'current' : i < cur ? 'done' : '',
      label: labels ? noteLabel(it.note) : '',
    }));
    const { svg, xs } = staffSVG(its, { keySig: song.keySig, endBar: true, scale: SCALE, ghost: ghost && mode === 'play' ? { midi: ghost.midi, cls: ghost.status === 'ok' ? 'ok' : 'off', x: (xs0[cur] ?? 0) + 16 } : null });
    $('.staff-box').innerHTML = svg;
    return xs;
  };
  const xs0 = staffSVG(items, { keySig: song.keySig }).xs;
  const SCALE = window.innerWidth < 600 ? 1.1 : 1.45;
  render();

  const scrollTo = (i) => {
    const sc = $('.staff-card.scroll');
    const x = (xs0[i] ?? 0) * SCALE;
    const target = Math.max(0, x - sc.clientWidth * 0.35);
    sc.scrollTo({ left: target, behavior: 'smooth' });
  };

  const stopAll = () => { stopMelody?.(); stopMelody = null; mic.muted = false; matcher = null; };

  const startNote = () => {
    const it = items[noteIdx[pos]];
    matcher = new Matcher(it.note.midi, Math.max(P.tolerance(), 25));
    started = performance.now();
    $('.hint-box').innerHTML = hintHTML(it.note);
    render();
    scrollTo(noteIdx[pos]);
  };

  const finish = async () => {
    mode = 'idle';
    matcher = null;
    render();
    $('.song-live').hidden = true;
    const quick = results.filter((r) => r <= 3).length;
    const pct = Math.round((quick / results.length) * 100);
    const stars = pct >= 90 ? 3 : pct >= 65 ? 2 : 1;
    if (S.settings.sound) fanfare();
    S.songs ||= {};
    S.songs[song.id] = Math.max(S.songs[song.id] || 0, stars);
    P.save();
    await modal(`<h2>${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</h2><p><b>${esc(song.title)}</b> geschafft!</p>
      <p>${quick} von ${results.length} Tönen hast du sofort getroffen (${pct} %).</p>`, [{ label: 'Fertig', primary: true }]);
  };

  app.querySelector('.song-controls').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'labels') { labels = e.target.checked; render(); return; }
    if (a === 'listen') {
      stopAll();
      if (mode === 'listen') { mode = 'idle'; render(); return; }
      mode = 'listen';
      mic.muted = true;
      $('.song-live').hidden = true;
      stopMelody = playMelody(items, song.bpm || 90, S.settings.a4, (i) => {
        pos = noteIdx.indexOf(i);
        render();
        scrollTo(i);
      }, () => { mode = 'idle'; pos = 0; mic.muted = false; render(); });
    }
    if (a === 'play') {
      stopAll();
      if (!(await ensureMic($('.mic-box')))) return;
      mode = 'play';
      pos = 0;
      results = [];
      $('.song-live').hidden = false;
      startNote();
    }
  });

  let lastDraw = 0;
  const off = mic.on((info) => {
    if (mode !== 'play' || !matcher) return;
    const now = performance.now();
    const r = matcher.feed(info, now);
    if (matcher.done) {
      const it = items[noteIdx[pos]];
      const secs = (now - started) / 1000;
      results.push(secs);
      P.recordPlay(it.note.id, { secs, hinted: true, weight: 0.5, counts: false });
      pos += 1;
      if (pos >= noteIdx.length) { finish(); return; }
      startNote();
      return;
    }
    if (now - lastDraw < 40) return;
    lastDraw = now;
    const v = verdict(r, items[noteIdx[pos]].note);
    const vEl = $('.verdict');
    vEl.className = `verdict ${v.cls}`;
    vEl.innerHTML = v.html;
    setMeter($('.meter'), r.status === 'silent' ? null : r.cents, matcher.tol);
    render(r.status === 'silent' ? null : r);
  });
  return () => { off(); stopAll(); };
}

// ---------- Tonleiter: aufnehmen und auswerten ----------

const SCALE_STEPS = { dur: [0, 2, 4, 5, 7], moll: [0, 2, 3, 5, 7] };
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Fünf Töne auf einer Saite: leer, 1., 2., 3. und 4. Finger – richtig benannt (Fis, B, Es …)
function scaleNotes(stringName, mode) {
  const str = STRINGS.find((s) => s.name === stringName);
  const base = spellMidi(str.midi);
  return SCALE_STEPS[mode].map((k, i) => {
    const li = LETTERS.indexOf(base.step) + i;
    const step = LETTERS[li % 7];
    const oct = base.oct + Math.floor(li / 7);
    const alt = str.midi + k - parseNote(`${step}${oct}`).midi;
    return parseNote(`${step}${alt > 0 ? '#'.repeat(alt) : 'b'.repeat(-alt)}${oct}`);
  });
}

const SCALE_TOL = { easy: 25, normal: 18, strict: 12 };

function scaleAdvice(r, str) {
  const tips = [];
  // gleiche Töne (aufwärts und abwärts) zusammenfassen
  const groups = new Map();
  r.notes.filter((x) => x.status === 'low' || x.status === 'high').forEach((x) => {
    if (!groups.has(x.note.id)) groups.set(x.note.id, []);
    groups.get(x.note.id).push(x);
  });
  [...groups.values()]
    .map((xs) => ({ note: xs[0].note, cents: xs.reduce((a, x) => a + x.cents, 0) / xs.length, all: xs.map((x) => Math.round(x.cents)) }))
    .filter((g) => Math.abs(g.cents) > 5)
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))
    .slice(0, 3)
    .forEach((g) => {
      const f = fingeringOnString(g.note, str);
      const low = g.cents < 0;
      const c = g.all.length > 1 ? `${g.all.map((v) => Math.abs(v)).join(' und ')} Cent` : `${Math.abs(g.all[0])} Cent`;
      if (f.finger === 0) {
        tips.push(`Die leere ${str}-Saite klang ${c} zu ${low ? 'tief' : 'hoch'} – Saite nachstimmen (Stimmgerät).`);
      } else {
        tips.push(`<b>${noteLabel(g.note)}</b> (${f.finger}. Finger) war ${c} zu ${low ? 'tief' : 'hoch'} – den Finger ein wenig ${low ? 'höher setzen, also Richtung Steg' : 'tiefer setzen, also Richtung Schnecke'}.`);
      }
    });
  const missing = r.notes.filter((x) => x.status === 'missing');
  if (missing.length) tips.push(`Nicht erkannt: ${missing.map((x) => noteLabel(x.note)).join(', ')}. Jeden Ton etwa eine halbe Sekunde ruhig halten.`);
  const wrong = r.notes.filter((x) => x.status === 'wrong');
  if (wrong.length) tips.push(`Falscher Ton statt ${wrong.map((x) => `${noteLabel(x.note)} (gespielt: ${noteLabel(spellMidi(x.played))})`).join(', ')} – auf das Griffbild unten achten.`);
  if (r.evenness != null && r.evenness > 0.4) tips.push('Die Töne waren unterschiedlich lang. Mit dem Metronom gelingt ein gleichmäßiges Tempo leichter.');
  if (r.wobble != null && r.wobble > 12) tips.push('Der Ton schwankte innerhalb der Noten. Bogen gleichmäßig ziehen und die Finger fest aufsetzen.');
  if (!tips.length) tips.push('Sauber gespielt! Probiere als Nächstes eine andere Saite, Moll oder die strenge Intonation.');
  return tips;
}

function drawScaleChart(canvas, frames, r, expected, cursor = null) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const mids = expected.map((n) => n.midi);
  const lo = Math.min(...mids) - 1.5, hi = Math.max(...mids) + 1.5;
  const T = Math.max(1, frames.at(-1)?.t || 1);
  const L = 40;
  const x = (t) => L + (t / T) * (w - L - 6);
  const y = (m) => h - 8 - ((m - lo) / (hi - lo)) * (h - 16);
  g.font = '13px "EB Garamond", serif';
  [...new Set(expected.map((n) => n.id))].map((id) => expected.find((n) => n.id === id)).forEach((n) => {
    g.strokeStyle = 'rgba(214,165,72,.35)';
    g.beginPath(); g.moveTo(L, y(n.midi)); g.lineTo(w, y(n.midi)); g.stroke();
    g.fillStyle = 'rgba(236,227,207,.75)';
    g.fillText(noteLabel(n), 4, y(n.midi) + 4);
  });
  frames.forEach((f) => {
    if (f.m == null || f.m < lo || f.m > hi) return;
    const near = mids.reduce((a, b) => (Math.abs(b - f.m) < Math.abs(a - f.m) ? b : a));
    const dev = Math.abs(f.m - near) * 100;
    g.fillStyle = dev <= 15 ? 'rgba(143,191,106,.55)' : dev <= 30 ? 'rgba(214,165,72,.55)' : 'rgba(208,86,76,.5)';
    g.fillRect(x(f.t) - 1, y(f.m) - 1, 2.2, 2.2);
  });
  r.notes.forEach((nr, i) => {
    if (!nr.seg) return;
    const col = nr.status === 'ok' ? '#8fbf6a' : nr.status === 'wrong' ? '#d0564c' : '#d6a548';
    g.strokeStyle = col; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x(nr.seg.start), y(nr.seg.m)); g.lineTo(x(nr.seg.end), y(nr.seg.m)); g.stroke();
    g.lineWidth = 1;
    g.fillStyle = col;
    g.fillText(String(i + 1), x((nr.seg.start + nr.seg.end) / 2) - 3, y(nr.seg.m) - 7);
  });
  if (cursor != null) {
    g.strokeStyle = '#ece3cf';
    g.beginPath(); g.moveTo(x(cursor), 0); g.lineTo(x(cursor), h); g.stroke();
  }
}

function scaleScreen() {
  const opt = { str: 'D', mode: 'dur', dir: 'updown', bpm: 0, ...(S.scaleOpt || {}) };
  let expected = [];
  let rec = null;          // laufende Aufnahme
  let last = null;         // letzte Auswertung { frames, r, url }
  let metro = null;
  let lastDraw = 0;

  app.innerHTML = `${topbar('Tonleiter', 'Bis zum 4. Finger – aufnehmen und auswerten')}
    <div class="screen scale">
      <div class="mic-box" hidden></div>
      <div class="card scale-opts">
        <div class="seg" data-o="str">${STRINGS.map((s) => `<button data-v="${s.name}" style="--c:${s.color}">${s.name}-Saite</button>`).join('')}</div>
        <div class="seg" data-o="mode"><button data-v="dur">Dur</button><button data-v="moll">Moll</button></div>
        <div class="seg" data-o="dir"><button data-v="updown">auf- und abwärts</button><button data-v="up">nur aufwärts</button></div>
        <div class="seg" data-o="bpm"><button data-v="0">ohne Metronom</button><button data-v="60">♩ 60</button><button data-v="80">♩ 80</button><button data-v="100">♩ 100</button></div>
      </div>
      <div class="card staff-card scroll"><div class="staff-box"></div></div>
      <div class="scale-fingers"></div>
      <div class="rec-row">
        <button class="btn primary big" data-a="rec">⏺ Aufnahme starten</button>
        <div class="rec-info"></div>
      </div>
      <div class="rec-live" hidden><div class="feedback"><div class="verdict"></div>${meterHTML()}</div></div>
      <div class="scale-result"></div>
    </div>`;

  const notesFor = () => {
    const up = scaleNotes(opt.str, opt.mode);
    return opt.dir === 'updown' ? [...up, ...up.slice(0, -1).reverse()] : up;
  };

  const renderStaff = (ptr = -1) => {
    const items = expected.map((n, i) => ({
      note: n, dur: 2,
      cls: rec ? (i <= ptr ? 'done' : i === ptr + 1 ? 'current' : '') : last ? `res-${last.r.notes[i].status}` : '',
      label: String(fingeringOnString(n, opt.str).finger),
    }));
    $('.staff-box').innerHTML = staffSVG(items, { endBar: true, scale: window.innerWidth < 600 ? 1.15 : 1.45 }).svg;
  };

  const renderSetup = () => {
    S.scaleOpt = { ...opt };
    P.save();
    expected = notesFor();
    app.querySelectorAll('.seg').forEach((sg) => sg.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', String(opt[sg.dataset.o]) === b.dataset.v)));
    const up = scaleNotes(opt.str, opt.mode);
    $('.scale-fingers').innerHTML = up.map((n) => {
      const f = fingeringOnString(n, opt.str);
      return `<div class="sf">${fingerboardSVG(f)}<b>${noteLabel(n)}</b><small>${f.finger ? `${f.finger}. Finger` : 'leer'}</small></div>`;
    }).join('');
    renderStaff();
  };

  app.querySelector('.scale-opts').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || rec) return;
    const k = b.closest('.seg').dataset.o;
    opt[k] = k === 'bpm' ? Number(b.dataset.v) : b.dataset.v;
    last = null;
    $('.scale-result').innerHTML = '';
    renderSetup();
  });

  const stopMetro = () => { clearInterval(metro); metro = null; };

  const startRec = async () => {
    if (!(await ensureMic($('.mic-box')))) return;
    audio();
    last = null;
    $('.scale-result').innerHTML = '';
    const btn = $('[data-a="rec"]');
    btn.disabled = true;
    // Einzählen: mit Metronom vier Schläge, sonst „3, 2, 1“
    const beats = opt.bpm ? 4 : 3;
    const interval = opt.bpm ? 60000 / opt.bpm : 700;
    for (let i = beats; i > 0; i--) {
      if (currentScreen !== 'scale') return;
      $('.rec-info').textContent = opt.bpm ? `Einzählen … ${beats - i + 1}` : `Gleich geht's los … ${i}`;
      if (opt.bpm) click(i === beats);
      await new Promise((res) => setTimeout(res, interval));
    }
    if (currentScreen !== 'scale') return;
    if (opt.bpm) { let n = 0; click(true); metro = setInterval(() => click(++n % 4 === 0), interval); }
    rec = { frames: [], t0: performance.now(), ptr: -1, cand: -1, candSince: 0, lastPitch: 0, doneAt: 0, chunks: [] };
    try {
      if (window.MediaRecorder) {
        const chunks = rec.chunks;
        rec.mr = new MediaRecorder(mic.stream);
        rec.mr.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
        rec.mr.start();
      }
    } catch { rec.mr = null; }
    btn.disabled = false;
    btn.textContent = '■ Aufnahme beenden';
    btn.classList.add('recording');
    $('.rec-live').hidden = false;
    $('.rec-info').textContent = 'Aufnahme läuft – spiel die Tonleiter.';
    renderStaff(-1);
  };

  const stopRec = async () => {
    if (!rec) return;
    const r0 = rec;
    rec = null;
    stopMetro();
    const btn = $('[data-a="rec"]');
    btn.textContent = '⏺ Nochmal aufnehmen';
    btn.classList.remove('recording');
    $('.rec-live').hidden = true;
    $('.rec-info').textContent = '';
    let url = null;
    if (r0.mr && r0.mr.state !== 'inactive') {
      await new Promise((res) => { r0.mr.onstop = res; r0.mr.stop(); });
      if (r0.chunks.length) url = URL.createObjectURL(new Blob(r0.chunks, { type: r0.mr.mimeType || 'audio/mp4' }));
    }
    const tol = SCALE_TOL[S.settings.strict] || 18;
    const r = analyse(r0.frames, expected, tol);
    if (last?.url) URL.revokeObjectURL(last.url);
    last = { frames: r0.frames, r, url, tol };
    // Verlauf je Tonleiter merken
    const key = `${opt.str}-${opt.mode}-${opt.dir}`;
    S.scaleLog ||= {};
    const hist = (S.scaleLog[key] ||= []);
    const prev = hist.at(-1);
    if (r.found) {
      hist.push({ d: new Date().toISOString().slice(0, 10), avg: Math.round(r.avgAbs), clean: r.clean, n: expected.length });
      if (hist.length > 20) hist.shift();
    }
    P.save();
    renderStaff();
    showResult(prev, hist);
  };

  const showResult = (prev, hist) => {
    const { r, url, tol } = last;
    const str = opt.str;
    const evenTxt = r.evenness == null ? '–' : r.evenness < 0.2 ? 'gleichmäßig' : r.evenness < 0.4 ? 'etwas ungleich' : 'ungleich';
    const steadyTxt = r.wobble == null ? '–' : r.wobble < 6 ? 'sehr ruhig' : r.wobble < 12 ? 'ruhig' : 'wackelig';
    const cmp = prev && r.found ? (Math.round(r.avgAbs) < prev.avg ? `besser als letztes Mal (${prev.avg} Cent)` : Math.round(r.avgAbs) > prev.avg ? `letztes Mal: ${prev.avg} Cent` : 'genau wie letztes Mal') : '';
    $('.scale-result').innerHTML = `<section class="card">
      <h2>Auswertung</h2>
      ${r.found ? '' : '<p class="warn">Es wurden keine Töne der Tonleiter erkannt. Näher ans Mikrofon oder im Logbuch die Mikrofon-Empfindlichkeit erhöhen.</p>'}
      <div class="stats">
        <div><b>${r.found}/${expected.length}</b><small>Töne erkannt</small></div>
        <div><b>${r.clean}</b><small>sauber (±${tol} Cent)</small></div>
        <div><b>${r.avgAbs == null ? '–' : Math.round(r.avgAbs)}</b><small>Ø Abweichung in Cent${cmp ? `<br>${esc(cmp)}` : ''}</small></div>
        <div><b class="txt">${evenTxt}</b><small>Tempo · Ton ${steadyTxt}</small></div>
      </div>
      <h3>Jeder Ton einzeln</h3>
      <div class="note-bars">${r.notes.map((x, i) => {
        const f = fingeringOnString(x.note, str);
        const c = x.cents == null ? 0 : Math.max(-50, Math.min(50, x.cents));
        const label = x.status === 'missing' ? 'fehlt' : x.status === 'wrong' ? noteLabel(spellMidi(x.played)) + '?' : `${x.cents > 0 ? '+' : ''}${Math.round(x.cents)}`;
        return `<div class="nb ${x.status}"><span class="nb-val">${esc(label)}</span>
          <div class="nb-track"><i style="${c >= 0 ? `bottom:50%;height:${c}%` : `top:50%;height:${-c}%`}"></i></div>
          <b>${noteLabel(x.note)}</b><small>${i + 1} · ${f.finger || '0'}</small></div>`;
      }).join('')}</div>
      <p class="tiny">Balken nach oben = zu hoch, nach unten = zu tief (Skala ±50 Cent). Darunter: Position in der Tonleiter · Finger.</p>
      <h3>Tipps</h3>
      <ul class="advice">${scaleAdvice(r, str).map((t) => `<li>${t}</li>`).join('')}</ul>
      <h3>Tonhöhenverlauf</h3>
      <canvas class="scale-chart" height="240"></canvas>
      <div class="actions">${url ? '<button class="btn" data-a="playback">▶ Aufnahme anhören</button>' : '<span class="tiny">Anhören der Aufnahme wird von diesem Browser nicht unterstützt.</span>'}</div>
      ${hist.length > 1 ? `<p class="tiny">Verlauf dieser Tonleiter (Ø Cent): ${hist.slice(-8).map((h) => h.avg).join(' → ')}</p>` : ''}
    </section>`;
    const canvas = $('.scale-chart');
    drawScaleChart(canvas, last.frames, r, expected);
    if (url) {
      const audioEl = new Audio(url);
      let raf = 0;
      const tick = () => {
        drawScaleChart(canvas, last.frames, r, expected, audioEl.currentTime * 1000);
        if (!audioEl.paused) raf = requestAnimationFrame(tick);
      };
      $('[data-a="playback"]').addEventListener('click', (e) => {
        if (audioEl.paused) {
          mic.muted = true;
          audioEl.currentTime = 0;
          audioEl.play();
          e.target.textContent = '■ Anhalten';
          tick();
        } else audioEl.pause();
      });
      audioEl.addEventListener('pause', () => { cancelAnimationFrame(raf); mic.muted = false; $('[data-a="playback"]').textContent = '▶ Aufnahme anhören'; });
      audioEl.addEventListener('ended', () => { cancelAnimationFrame(raf); mic.muted = false; drawScaleChart(canvas, last.frames, r, expected); });
      last.audioEl = audioEl;
    }
  };

  $('[data-a="rec"]').addEventListener('click', () => (rec ? stopRec() : startRec()));

  const off = mic.on((info) => {
    if (!rec) return;
    const now = performance.now();
    const t = now - rec.t0;
    const m = info.freq ? freqToMidi(info.freq, S.settings.a4) : null;
    rec.frames.push({ t, m });
    // mitlesen: welcher Ton der Tonleiter ist gerade dran?
    const next = expected[rec.ptr + 1];
    if (m != null) {
      rec.lastPitch = now;
      if (next && Math.abs(m - next.midi) * 100 <= 60) {
        if (rec.cand !== rec.ptr + 1) { rec.cand = rec.ptr + 1; rec.candSince = now; }
        if (now - rec.candSince >= 150) { rec.ptr += 1; renderStaff(rec.ptr); if (rec.ptr === expected.length - 1) rec.doneAt = now; }
      } else rec.cand = -1;
    }
    // von selbst beenden: nach dem letzten Ton kurz Stille oder lange gehalten, spätestens nach 90 s
    if ((rec.doneAt && ((now - rec.lastPitch > 900) || now - rec.doneAt > 2500)) || t > 90000) { stopRec(); return; }
    if (now - lastDraw < 40) return;
    lastDraw = now;
    const target = expected[Math.max(0, Math.min(expected.length - 1, rec.cand >= 0 ? rec.cand : rec.ptr))] || expected[0];
    const c = compare(info.freq, target.midi);
    const vEl = $('.verdict');
    if (!c) { vEl.className = 'verdict'; vEl.innerHTML = `<span class="dim">${Math.round(t / 1000)} s · ${rec.ptr + 1} von ${expected.length} Tönen</span>`; setMeter($('.meter'), null, 18); return; }
    const played = spellMidi(Math.round(c.midi));
    const cents = (c.midi - Math.round(c.midi)) * 100;
    vEl.className = `verdict ${Math.abs(cents) <= 18 ? 'ok' : cents < 0 ? 'low' : 'high'}`;
    vEl.innerHTML = `${noteLabel(played)} <small>${cents > 0 ? '+' : ''}${Math.round(cents)} Cent · ${rec.ptr + 1} von ${expected.length} Tönen</small>`;
    setMeter($('.meter'), cents, 18);
  });

  renderSetup();
  return () => { off(); stopMetro(); if (rec) { rec.mr?.state === 'recording' && rec.mr.stop(); rec = null; } last?.audioEl?.pause(); if (last?.url) URL.revokeObjectURL(last.url); };
}

// ---------- Notenquiz ----------

function quiz() {
  const pool = [...knownNotes(Math.min(S.level + 1, LEVELS.length - 1))].map(parseNote);
  let current = null;
  let right = 0, asked = 0, lastId = null, locked = false;
  app.innerHTML = `${topbar('Notenquiz', 'Welcher Ton steht im Bratschenschlüssel?')}
    <div class="screen quiz">
      <div class="card staff-card"><div class="staff-box"></div></div>
      <div class="choices"></div>
      <div class="quiz-info"></div>
      <div class="hint-box"></div>
      <div class="actions"><button class="btn" data-a="listen">▶ Anhören</button><span class="quiz-score"></span></div>
    </div>`;

  const next = () => {
    locked = false;
    const cands = pool.filter((n) => n.id !== lastId);
    // schwächer gelesene Töne kommen öfter
    const ws = cands.map((n) => 1 + (1 - P.noteRecord(n.id).q) * 2);
    let t = Math.random() * ws.reduce((a, b) => a + b, 0);
    current = cands.find((_, i) => (t -= ws[i]) <= 0) || cands[0];
    lastId = current.id;
    $('.staff-box').innerHTML = staffSVG([{ note: current, dur: 4 }], { minWidth: 220, scale: fitScale($('.staff-card'), 220, 1.5) }).svg;
    const names = [...new Set(pool.map(noteLabel))];
    const opts = new Set([noteLabel(current)]);
    while (opts.size < Math.min(4, names.length)) opts.add(names[Math.floor(Math.random() * names.length)]);
    $('.choices').innerHTML = [...opts].sort(() => Math.random() - 0.5).map((o) => `<button class="btn choice" data-c="${esc(o)}">${esc(o)}</button>`).join('');
    $('.quiz-info').textContent = '';
    $('.hint-box').innerHTML = '';
  };

  app.querySelector('.choices').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b || locked) return;
    locked = true;
    const ok = b.dataset.c === noteLabel(current);
    asked += 1;
    if (ok) right += 1;
    P.recordRead(current.id, ok);
    b.classList.add(ok ? 'right' : 'wrong');
    app.querySelectorAll('.choice').forEach((c) => { if (c.dataset.c === noteLabel(current)) c.classList.add('right'); });
    $('.quiz-score').textContent = `${right} / ${asked} richtig`;
    if (S.settings.sound && ok) chime();
    if (ok) {
      $('.quiz-info').innerHTML = `<span class="ok">✓ Richtig – ${esc(noteLabel(current))} (${esc(helmholtz(current))})</span>`;
      setTimeout(next, 900);
    } else {
      $('.quiz-info').innerHTML = `Das ist <b>${esc(noteLabel(current))}</b> (${esc(helmholtz(current))}). Merkhilfe: Die Mittellinie ist das c'. <button class="btn small" data-next>Weiter ›</button>`;
      $('.hint-box').innerHTML = hintHTML(current);
      $('[data-next]').addEventListener('click', next);
    }
  });
  app.querySelector('.actions').addEventListener('click', (e) => {
    if (e.target.closest('[data-a="listen"]') && current) playMidi(current.midi, 1.2, S.settings.a4);
  });
  next();
}

// ---------- Logbuch: Fortschritt & Einstellungen ----------

function logbook() {
  const all = [...knownNotes(LEVELS.length - 1)].map(parseNote).sort((a, b) => a.midi - b.midi);
  const mins = Math.round(S.stats.seconds / 60);
  const st = S.settings;
  app.innerHTML = `${topbar('Logbuch', 'Fortschritt und Einstellungen')}
    <div class="screen log">
      <section class="card"><h2>Fortschritt</h2>
        <div class="stats"><div><b>${S.level + 1}</b><small>Stufe</small></div><div><b>${S.stats.correct}</b><small>Töne getroffen</small></div>
        <div><b>${S.stats.days.length}</b><small>Übungstage</small></div><div><b>${mins}</b><small>Minuten geübt</small></div></div>
        <h3>Wie sicher sitzt jeder Ton?</h3>
        <div class="mastery">${all.map((n) => {
          const r = P.noteRecord(n.id);
          const v = Math.round(Math.max(r.m, 0) * 100);
          return `<div class="m-chip ${r.n ? '' : 'new'}" title="${esc(helmholtz(n))}"><b>${esc(noteLabel(n))}</b><small>${esc(helmholtz(n))}</small><i style="--v:${v}%"></i></div>`;
        }).join('')}</div>
        <p class="tiny">Balken = Spielsicherheit. Grau = noch nicht geübt.</p>
      </section>
      <section class="card"><h2>Einstellungen</h2>
        <label class="row">Kammerton a'
          <select data-set="a4">${[438, 440, 441, 442, 443].map((v) => `<option ${v === st.a4 ? 'selected' : ''} value="${v}">${v} Hz</option>`).join('')}</select></label>
        <label class="row">Hilfen (Notenname & Griff)
          <select data-set="hints"><option value="auto" ${st.hints === 'auto' ? 'selected' : ''}>automatisch – weniger, je sicherer du wirst</option>
          <option value="always" ${st.hints === 'always' ? 'selected' : ''}>immer anzeigen</option>
          <option value="never" ${st.hints === 'never' ? 'selected' : ''}>nur auf Wunsch (Tipp)</option></select></label>
        <label class="row">Intonation
          <select data-set="strict"><option value="easy" ${st.strict === 'easy' ? 'selected' : ''}>locker</option>
          <option value="normal" ${st.strict === 'normal' ? 'selected' : ''}>normal (passt sich der Stufe an)</option>
          <option value="strict" ${st.strict === 'strict' ? 'selected' : ''}>streng</option></select></label>
        <label class="row">Mikrofon-Empfindlichkeit
          <select data-set="sens">${[['low', 'niedrig – laute Umgebung'], ['normal', 'normal'], ['high', 'hoch – auch leises Spiel'], ['max', 'sehr hoch']].map(([v, t]) => `<option value="${v}" ${st.sens === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="row">Klang bei Erfolg <input type="checkbox" data-set="sound" ${st.sound ? 'checked' : ''}></label>
        <label class="row">Stufe von Hand wählen
          <select data-set="level">${LEVELS.map((l, i) => `<option value="${i}" ${i === S.level ? 'selected' : ''}>${i + 1}. ${esc(l.title)}</option>`).join('')}</select></label>
      </section>
      <section class="card"><h2>Eigene Lieder</h2>
        <p class="tiny">Schreibweise: Ton und Oktave, Schrägstrich, Dauer in Vierteln. <code>A4/1</code> = a' als Viertel, <code>D4/.5</code> = d' als Achtel, <code>F#4/2</code> = fis' als Halbe, <code>Bb3/1.5</code> = b als punktierte Viertel. <code>|</code> = Taktstrich. Die leeren Saiten sind C3, G3, D4 und A4.</p>
        <div class="custom-list">${S.custom.map((c, i) => `<div class="row"><span>${esc(c.title)}</span><button class="btn small" data-del="${i}">Löschen</button></div>`).join('') || '<p class="tiny">Noch keine eigenen Lieder.</p>'}</div>
        <input class="inp" data-f="title" placeholder="Titel, z. B. Hamborger Veermaster">
        <label class="row">Vorzeichen <select data-f="key">${[-3, -2, -1, 0, 1, 2, 3, 4].map((k) => `<option value="${k}" ${k === 0 ? 'selected' : ''}>${k === 0 ? 'keine' : k > 0 ? `${k} ♯` : `${-k} ♭`}</option>`).join('')}</select></label>
        <label class="row">Tempo (Viertel pro Minute) <input class="inp short" data-f="bpm" type="number" value="90" min="40" max="200"></label>
        <textarea class="inp" data-f="text" rows="4" placeholder="D4/1 E4/1 F#4/1 G4/1 | A4/2 A4/2"></textarea>
        <div class="row"><button class="btn" data-a="preview">▶ Probehören</button><button class="btn primary" data-a="add">Lied speichern</button></div>
      </section>
      <section class="card"><h2>Neu beginnen</h2><p class="tiny">Setzt Stufe und Lernstand zurück. Einstellungen und eigene Lieder bleiben.</p>
        <button class="btn danger" data-a="reset">Lernstand zurücksetzen</button></section>
      <p class="tiny center">Bratsche ahoi! speichert alles nur auf diesem Gerät. Das Mikrofon wird nur zum Zuhören benutzt, nie aufgenommen.</p>
    </div>`;

  app.querySelector('.log').addEventListener('change', (e) => {
    const k = e.target.dataset.set;
    if (!k) return;
    if (k === 'level') { S.level = Number(e.target.value); S.recent = []; toast(`Stufe ${S.level + 1} gewählt`); }
    else if (k === 'sound') st.sound = e.target.checked;
    else if (k === 'a4') st.a4 = Number(e.target.value);
    else if (k === 'sens') { st.sens = e.target.value; mic.setSensitivity(st.sens); }
    else st[k] = e.target.value;
    P.save();
  });
  const field = (f) => $(`[data-f="${f}"]`);
  const readSong = () => {
    const text = field('text').value.trim();
    const items = parseSong(text);
    return { title: field('title').value.trim() || 'Ohne Titel', keySig: Number(field('key').value), bpm: Number(field('bpm').value) || 90, text, items };
  };
  let stopPrev = null;
  app.querySelector('.log').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { S.custom.splice(Number(del.dataset.del), 1); P.save(); logbook(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'preview') {
      try { stopPrev?.(); const s = readSong(); stopPrev = playMelody(s.items, s.bpm, st.a4); } catch (err) { toast(err.message); }
    }
    if (a === 'add') {
      try {
        const { items, ...s } = readSong();
        S.custom.push({ ...s, id: `custom-${Date.now()}` });
        P.save();
        toast(`„${s.title}“ gespeichert – zu finden unter Lieder`);
        logbook();
      } catch (err) { toast(err.message); }
    }
    if (a === 'reset') {
      const i = await modal('<h2>Lernstand zurücksetzen?</h2><p>Stufe, Statistik und die Sicherheit aller Töne werden gelöscht.</p>', [{ label: 'Abbrechen' }, { label: 'Zurücksetzen', primary: true }]);
      if (i === 1) { P.reset(); toast('Lernstand zurückgesetzt'); logbook(); }
    }
  });
  return () => stopPrev?.();
}

const SCREENS = { home, tuner, exercise, free: freePlay, scale: scaleScreen, songs, song: songScreen, quiz, log: logbook };

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mic.active) {
    mic.stop();
    // beim Zurückkommen muss das Mikrofon neu eingeschaltet werden
    if (MIC_SCREENS.includes(currentScreen)) setTimeout(() => go(currentScreen === 'song' ? 'songs' : currentScreen), 0);
  }
});

// Kleine Pegelanzeige unten rechts: zeigt, ob das Mikrofon dich hört (grün = Ton erkannt)
const levelEl = document.createElement('div');
levelEl.className = 'mic-level';
levelEl.hidden = true;
levelEl.innerHTML = '<span>🎙</span><i><b></b><u></u></i>';
document.body.appendChild(levelEl);
const dbPos = (v) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(v, 1e-5)) + 80) / 70));
let levelDraw = 0;
mic.on((info) => {
  const now = performance.now();
  if (now - levelDraw < 60) return;
  levelDraw = now;
  levelEl.hidden = false;
  levelEl.querySelector('b').style.width = `${dbPos(info.level) * 100}%`;
  levelEl.querySelector('u').style.left = `${dbPos(info.gate) * 100}%`;
  levelEl.className = `mic-level ${info.freq ? 'tone' : info.level > info.gate ? 'loud' : ''}`;
});
setInterval(() => { if (!mic.active) levelEl.hidden = true; }, 500);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

go('home');
