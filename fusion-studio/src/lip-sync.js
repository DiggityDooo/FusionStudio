'use strict';
// Lip sync (A15 "Lip sync (phoneme/viseme-based) and audio-driven
// animation" -- the phoneme half): maps a timed phoneme sequence to
// viseme weight curves with coarticulation. Each phoneme's dominance
// rises before its onset and decays after its offset (a raised-cosine
// over the phoneme interval extended by `coarticulation` seconds on
// each side); visemes blend by maximum dominance, the standard
// approximation used by runtime lip-sync systems.

export const PHONEME_TO_VISEME = {
  sil: 'sil',
  p: 'PP', b: 'PP', m: 'PP',
  f: 'FF', v: 'FF',
  th: 'TH', dh: 'TH',
  t: 'DD', d: 'DD', n: 'NN', l: 'NN',
  k: 'KK', g: 'KK', ng: 'KK',
  ch: 'CH', jh: 'CH', sh: 'CH', zh: 'CH',
  s: 'SS', z: 'SS',
  r: 'RR', er: 'RR',
  aa: 'AA', ah: 'AA', ae: 'AA',
  eh: 'E', ey: 'E',
  ih: 'I', iy: 'I',
  ow: 'O', ao: 'O',
  uh: 'U', uw: 'U',
  w: 'U', y: 'I', hh: 'sil',
};

export const VISEMES = [...new Set(Object.values(PHONEME_TO_VISEME))];

function dominance(t, start, end, coarticulation) {
  const riseStart = start - coarticulation;
  const fallEnd = end + coarticulation;
  if (t <= riseStart || t >= fallEnd) return 0;
  if (t >= start && t <= end) return 1;
  const phase = t < start
    ? (t - riseStart) / Math.max(coarticulation, 1e-9)
    : 1 - (t - end) / Math.max(coarticulation, 1e-9);
  const clamped = Math.max(0, Math.min(1, phase));
  return 0.5 - 0.5 * Math.cos(clamped * Math.PI); // raised cosine
}

/**
 * Build a viseme track from phonemes [{phoneme, start, duration}].
 * options: { coarticulation = 0.06 (s), fps = 30 }.
 * Returns { duration, fps, frames: [{t, weights}] , sampleAt(t) }.
 * Weights include every viseme; blending is by max dominance, so the
 * strongest weight at any instant is the lead viseme's curve value.
 */
export function createLipSync(phonemes, { coarticulation = 0.06, fps = 30 } = {}) {
  if (!Array.isArray(phonemes)) throw new Error('lip-sync: phonemes must be an array');
  const events = phonemes.map((p) => {
    const viseme = PHONEME_TO_VISEME[String(p.phoneme).toLowerCase()];
    if (!viseme) throw new Error(`lip-sync: unknown phoneme '${p.phoneme}'`);
    if (!(p.duration > 0)) throw new Error(`lip-sync: phoneme '${p.phoneme}' needs a positive duration`);
    return { viseme, start: p.start, end: p.start + p.duration };
  }).sort((a, b) => a.start - b.start);
  for (let i = 1; i < events.length; i++) {
    if (events[i].start < events[i - 1].end - 1e-9) throw new Error('lip-sync: overlapping phonemes');
  }
  const duration = events.length > 0 ? events[events.length - 1].end : 0;

  function weightsAt(t) {
    const weights = Object.fromEntries(VISEMES.map((v) => [v, 0]));
    for (const event of events) {
      const d = dominance(t, event.start, event.end, coarticulation);
      if (d > weights[event.viseme]) weights[event.viseme] = d;
    }
    // Resting state: with no phoneme dominance, the mouth is silent.
    const strongest = Math.max(...Object.values(weights));
    if (strongest === 0) weights.sil = 1;
    return weights;
  }

  const frameCount = Math.max(1, Math.round(duration * fps) + 1);
  const frames = Array.from({ length: frameCount }, (_, i) => {
    const t = i / fps;
    return { t, weights: weightsAt(t) };
  });

  return {
    duration, fps, frames, events,
    sampleAt: weightsAt,
    /** The dominant viseme at time t (highest weight). */
    leadAt(t) {
      const weights = weightsAt(t);
      return Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0];
    },
  };
}
