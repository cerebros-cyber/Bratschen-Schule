// Notensatz als SVG im Bratschenschlüssel (C-Schlüssel auf der 3. Linie: Mittellinie = c').

import { staffPos, keyAlterations, KEY_SIG_POS, spellMidi } from './notes.js';

const S = 12;            // Linienabstand
const Y0 = 96;           // y der Mittellinie
const H = 192;
const yOf = (pos) => Y0 - pos * (S / 2);
const ACC = { 1: '♯', '-1': '♭', 0: '♮', 2: '𝄪', '-2': '𝄫' };

function clef(x) {
  const top = yOf(4), bot = yOf(-4), mid = Y0;
  return `<g class="clef">
    <rect x="${x}" y="${top}" width="5" height="${bot - top}"/>
    <rect x="${x + 8}" y="${top}" width="1.8" height="${bot - top}"/>
    <path d="M${x + 11},${mid - 1} L${x + 13},${mid - 7} C${x + 17},${mid - 13} ${x + 27},${mid - 12} ${x + 27},${mid - 25} C${x + 27},${top - 1} ${x + 15},${top - 3} ${x + 14},${top + 6}" class="clef-curl"/>
    <circle cx="${x + 18}" cy="${top + 7}" r="3.6"/>
    <path d="M${x + 11},${mid + 1} L${x + 13},${mid + 7} C${x + 17},${mid + 13} ${x + 27},${mid + 12} ${x + 27},${mid + 25} C${x + 27},${bot + 1} ${x + 15},${bot + 3} ${x + 14},${bot - 6}" class="clef-curl"/>
    <circle cx="${x + 18}" cy="${bot - 7}" r="3.6"/>
  </g>`;
}

function ledgers(cx, pos) {
  let out = '';
  for (let p = 6; p <= pos; p += 2) out += `<line x1="${cx - 11}" x2="${cx + 11}" y1="${yOf(p)}" y2="${yOf(p)}" class="ledger"/>`;
  for (let p = -6; p >= pos; p -= 2) out += `<line x1="${cx - 11}" x2="${cx + 11}" y1="${yOf(p)}" y2="${yOf(p)}" class="ledger"/>`;
  return out;
}

function noteGlyph(cx, pos, dur, cls) {
  const cy = yOf(pos);
  const hollow = dur >= 2;
  const dotted = [3, 1.5, 0.75].includes(dur);
  const base = dotted ? dur / 1.5 : dur;
  let out = `<g class="note ${cls}">`;
  out += ledgers(cx, pos);
  out += `<ellipse cx="${cx}" cy="${cy}" rx="6.9" ry="5" transform="rotate(-20 ${cx} ${cy})" class="${hollow ? 'head hollow' : 'head'}"/>`;
  if (base < 4) {
    const up = pos < 0;
    const sx = up ? cx + 6.2 : cx - 6.2;
    const ey = up ? cy - 36 : cy + 36;
    out += `<line x1="${sx}" x2="${sx}" y1="${cy + (up ? -1 : 1)}" y2="${ey}" class="stem"/>`;
    if (base <= 0.5) {
      out += up
        ? `<path d="M${sx},${ey} C${sx + 2},${ey + 9} ${sx + 12},${ey + 12} ${sx + 9},${ey + 24} C${sx + 10},${ey + 14} ${sx + 4},${ey + 12} ${sx},${ey + 10} Z" class="flag"/>`
        : `<path d="M${sx},${ey} C${sx + 2},${ey - 9} ${sx + 12},${ey - 12} ${sx + 9},${ey - 24} C${sx + 10},${ey - 14} ${sx + 4},${ey - 12} ${sx},${ey - 10} Z" class="flag"/>`;
    }
  }
  if (dotted) out += `<circle cx="${cx + 12}" cy="${pos % 2 === 0 ? cy - 4 : cy}" r="2" class="dot"/>`;
  return out + '</g>';
}

// items: [{ note, dur, cls }] oder { bar: true }; opts: { keySig, ghost: { midi, cls, x? }, minWidth }
export function staffSVG(items, opts = {}) {
  const keySig = opts.keySig || 0;
  const keyAlt = keyAlterations(keySig);
  let x = 50;
  let body = '';
  // Vorzeichen
  const kind = keySig > 0 ? 'sharp' : 'flat';
  for (let i = 0; i < Math.abs(keySig); i++) {
    body += `<text x="${x + i * 10}" y="${yOf(KEY_SIG_POS[kind][i]) + (kind === 'sharp' ? 6 : 4)}" class="acc">${kind === 'sharp' ? '♯' : '♭'}</text>`;
  }
  x += Math.abs(keySig) * 10 + 22;

  const xs = [];
  let barAlt = {};
  items.forEach((it, i) => {
    if (it.bar) {
      body += `<line x1="${x - 4}" x2="${x - 4}" y1="${yOf(4)}" y2="${yOf(-4)}" class="barline"/>`;
      x += 14;
      barAlt = {};
      xs[i] = null;
      return;
    }
    const n = it.note;
    const pos = staffPos(n);
    const key = `${n.step}${n.oct}`;
    const expected = key in barAlt ? barAlt[key] : (keyAlt[n.step] || 0);
    if (n.alt !== expected) {
      x += 10;
      body += `<text x="${x - 17}" y="${yOf(pos) + (n.alt < 0 ? 4 : 6)}" class="acc ${it.cls || ''}">${ACC[n.alt]}</text>`;
      barAlt[key] = n.alt;
    }
    xs[i] = x;
    body += noteGlyph(x, pos, it.dur || 1, it.cls || '');
    if (it.label) body += `<text x="${x}" y="${H - 8}" class="nlabel ${it.cls || ''}">${it.label}</text>`;
    x += 22 + Math.min(4, it.dur || 1) * 8;
  });

  // „Geisternote“: der gerade gespielte Ton, zum Vergleich mit der Zielnote
  if (opts.ghost && Number.isFinite(opts.ghost.midi)) {
    const g = opts.ghost;
    const near = Math.round(g.midi);
    const sp = spellMidi(near);
    const pos = staffPos(sp) + (g.midi - near) * 0.9;  // feine Verschiebung zeigt die Abweichung
    const gx = g.x ?? (xs.filter((v) => v != null).pop() ?? x) + 26;
    const cy = yOf(pos);
    body += `<g class="ghost ${g.cls || ''}">${ledgers(gx, Math.round(pos))}`;
    if (sp.alt) body += `<text x="${gx - 16}" y="${cy + 5}" class="acc">${ACC[sp.alt]}</text>`;
    body += `<ellipse cx="${gx}" cy="${cy}" rx="6.9" ry="5" transform="rotate(-20 ${gx} ${cy})"/></g>`;
    x = Math.max(x, gx + 24);
  }

  const width = Math.max(opts.minWidth || 0, x + 10);
  let lines = '';
  for (let p = -4; p <= 4; p += 2) lines += `<line x1="4" x2="${width - 4}" y1="${yOf(p)}" y2="${yOf(p)}" class="sline"/>`;
  if (opts.endBar) lines += `<line x1="${width - 8}" x2="${width - 8}" y1="${yOf(4)}" y2="${yOf(-4)}" class="barline"/><rect x="${width - 6}" y="${yOf(4)}" width="3" height="${S * 4}" class="endbar"/>`;
  const k = opts.scale || 1;
  const svg = `<svg class="staff" viewBox="0 0 ${width} ${H}" width="${Math.round(width * k)}" height="${Math.round(H * k)}" role="img" aria-label="Notenzeile">${lines}${clef(10)}${body}</svg>`;
  return { svg, xs, width };
}
