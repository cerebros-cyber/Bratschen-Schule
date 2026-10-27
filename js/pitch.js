// Tonhöhenerkennung über das Mikrofon (YIN-Verfahren, auf den Bratschenumfang zugeschnitten).

const MIN_F = 110;   // etwas unter der C-Saite (130,8 Hz)
const MAX_F = 1400;  // weit über der ersten Lage

// YIN: liefert { freq, clarity } oder null. buf = Zeitsignal, sr = Abtastrate.
export function yin(buf, sr, threshold = 0.15) {
  const maxTau = Math.min(Math.floor(sr / MIN_F), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sr / MAX_F));
  const W = buf.length - maxTau;
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // kumulativ normierte Differenzfunktion
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    run += d[tau];
    cmnd[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // kein Wert unter der Schwelle: bestes Minimum nehmen, aber als unsicher kennzeichnen
    let best = minTau;
    for (let t = minTau; t <= maxTau; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.35) return null;
    tau = best;
  }
  // parabolische Interpolation für Genauigkeit unter einem Abtastwert
  let better = tau;
  if (tau > 1 && tau < maxTau) {
    const a = cmnd[tau - 1], b = cmnd[tau], c = cmnd[tau + 1];
    const den = a + c - 2 * b;
    if (den !== 0) better = tau + (a - c) / (2 * den);
  }
  return { freq: sr / better, clarity: 1 - cmnd[tau] };
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

// Mikrofon + laufende Analyse. onPitch erhält { freq|null, clarity, level } pro Bildschirmbild.
export class PitchListener {
  constructor(ctxProvider) {
    this.getCtx = ctxProvider;
    this.stream = null;
    this.running = false;
    this.handlers = new Set();
    this.muted = false;     // während die App selbst Töne spielt
    this.gate = 0.008;      // Mindestlautstärke
    this.recent = [];
  }

  get active() { return !!this.stream; }

  async start() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Dieses Gerät erlaubt hier keinen Mikrofonzugriff (HTTPS nötig).');
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch { /* ältere Systeme */ }
    const ctx = this.getCtx();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (ctx.state !== 'running') await ctx.resume();
    this.src = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.buf = new Float32Array(this.analyser.fftSize);
    // stumm an den Ausgang hängen, damit Safari den Graphen sicher berechnet
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.src.connect(this.analyser);
    this.analyser.connect(this.sink);
    this.sink.connect(ctx.destination);
    this.sr = ctx.sampleRate;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    try { this.src?.disconnect(); this.analyser?.disconnect(); this.sink?.disconnect(); } catch { /* egal */ }
    this.stream = null;
    this.recent = [];
  }

  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }

  loop() {
    if (!this.running) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const level = rms(this.buf);
    let res = null;
    if (!this.muted && level > this.gate) res = yin(this.buf, this.sr);
    let freq = null;
    if (res && res.clarity > 0.75) {
      this.recent.push(res.freq);
      if (this.recent.length > 5) this.recent.shift();
      // Median glättet einzelne Oktavsprünge
      const sorted = [...this.recent].sort((a, b) => a - b);
      freq = sorted[Math.floor(sorted.length / 2)];
      // bei frischem Tonwechsel nicht auf alte Werte hören
      if (Math.abs(1200 * Math.log2(res.freq / freq)) > 80 && this.recent.length >= 3) {
        const close = this.recent.filter((f) => Math.abs(1200 * Math.log2(f / res.freq)) < 60);
        if (close.length >= 2) freq = res.freq;
      }
    } else {
      this.recent = [];
    }
    const info = { freq, clarity: res?.clarity || 0, level };
    this.handlers.forEach((fn) => fn(info));
    requestAnimationFrame(() => this.loop());
  }
}
