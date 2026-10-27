// Klangerzeugung: Bezugstöne zum Stimmen, Vorspielen von Aufgaben und Liedern, kleine Signaltöne.

import { midiToFreq } from './notes.js';

let ctx = null;
export function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// streicherähnlicher Ton: Sägezahn durch Tiefpass, leichtes Vibrato, weicher Ein- und Ausschwung
export function voice(freq, { gain = 0.18, at = 0, dur = null } = {}) {
  const c = audio();
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  const vib = c.createOscillator();
  vib.frequency.value = 5.2;
  const vibGain = c.createGain();
  vibGain.gain.setValueAtTime(0, t0);
  vibGain.gain.linearRampToValueAtTime(freq * 0.004, t0 + 0.35);
  vib.connect(vibGain).connect(osc.frequency);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(4000, freq * 5);
  lp.Q.value = 0.7;
  const body = c.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 400;
  body.gain.value = 5;
  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(gain, t0 + 0.06);
  osc.connect(lp).connect(body).connect(env).connect(c.destination);
  osc.start(t0);
  vib.start(t0);
  const stop = (when = c.currentTime) => {
    const t = Math.max(when, t0 + 0.07);
    env.gain.cancelScheduledValues(t);
    env.gain.setValueAtTime(env.gain.value || gain, t);
    env.gain.linearRampToValueAtTime(0, t + 0.12);
    try { osc.stop(t + 0.15); vib.stop(t + 0.15); } catch { /* schon gestoppt */ }
  };
  if (dur != null) stop(t0 + dur);
  return { stop };
}

export function playMidi(midi, dur = 1.2, a4 = 440, at = 0) {
  return voice(midiToFreq(midi, a4), { dur, at });
}

// Melodie vorspielen; ruft onNote(index) im Takt auf. Gibt eine Stopp-Funktion zurück.
export function playMelody(items, bpm, a4, onNote, onEnd) {
  const beat = 60 / bpm;
  let t = 0.1;
  const voices = [];
  const timers = [];
  items.forEach((it, i) => {
    if (!it.note) return;
    const len = it.dur * beat;
    voices.push(voice(midiToFreq(it.note.midi, a4), { at: t, dur: len * 0.92 }));
    timers.push(setTimeout(() => onNote?.(i), t * 1000));
    t += len;
  });
  timers.push(setTimeout(() => onEnd?.(), t * 1000 + 150));
  return () => { voices.forEach((v) => v.stop()); timers.forEach(clearTimeout); };
}

function blip(freq, at, dur, type = 'sine', gain = 0.12) {
  const c = audio();
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// Schiffsglocke für richtig gespielte Töne
export function chime() {
  blip(1318.5, 0, 0.5, 'sine', 0.08);
  blip(1975.5, 0.07, 0.6, 'sine', 0.05);
}
export function fanfare() {
  [587.33, 739.99, 880, 1174.66].forEach((f, i) => blip(f, i * 0.13, 0.5, 'triangle', 0.1));
}
