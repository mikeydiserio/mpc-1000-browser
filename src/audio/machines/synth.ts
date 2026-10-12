/**
 * Small DSP toolkit for rendering drum-machine voices in an OfflineAudioContext.
 * Every voice renders once to an AudioBuffer and is then played like any loaded sample.
 */

export function noise(ctx: BaseAudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  return src
}

/** Linear attack, exponential decay to silence. */
export function env(ctx: BaseAudioContext, peak: number, attack: number, decay: number, at = 0) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(peak, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  return g
}

export function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

export function gain(ctx: BaseAudioContext, value: number) {
  const g = ctx.createGain()
  g.gain.value = value
  return g
}

export function chain(...nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!)
  return nodes[nodes.length - 1]!
}

export function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.value = freq
  return o
}

/** Oscillator whose pitch falls exponentially from `from` to `to` over `time` seconds. */
export function sweep(
  ctx: BaseAudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  time: number,
) {
  const o = osc(ctx, type, from)
  o.frequency.setValueAtTime(from, 0)
  o.frequency.exponentialRampToValueAtTime(to, time)
  return o
}

/** Bank of square waves at fixed frequencies — the "metal" source of analog cymbals and hats. */
export function metal(ctx: BaseAudioContext, freqs: number[], out: AudioNode, seconds: number) {
  const mix = gain(ctx, 1 / freqs.length)
  mix.connect(out)
  for (const f of freqs) {
    const o = osc(ctx, 'square', f)
    o.connect(mix)
    o.start(0)
    o.stop(seconds)
  }
}

export function softClip(drive: number) {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive)
  }
  return curve
}

export function shaper(ctx: BaseAudioContext, curve: Float32Array<ArrayBuffer>) {
  const ws = ctx.createWaveShaper()
  ws.curve = curve
  return ws
}

/** Amplitude quantizer — the gritty low-bit character of early sampled cymbals (909, LinnDrum). */
export function bitCrush(bits: number) {
  const levels = 2 ** (bits - 1)
  const curve = new Float32Array(4096)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.round(x * levels) / levels
  }
  return curve
}

/**
 * Hand-clap envelope: a few rapid noise bursts followed by a decaying "room" tail.
 * Returns the gain node to route filtered noise through.
 */
export function clapEnvelope(ctx: BaseAudioContext, bursts: number[], tail: number, peak = 0.9) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, 0)
  for (const t of bursts) {
    g.gain.setValueAtTime(peak, t)
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.009)
  }
  const last = bursts[bursts.length - 1]! + 0.01
  g.gain.setValueAtTime(peak * 0.85, last)
  g.gain.exponentialRampToValueAtTime(0.0001, last + tail)
  return g
}

/** Shared tom/conga model: pitched body with a downward pitch bend plus a little skin noise. */
export function drum(
  ctx: BaseAudioContext,
  { freq, bend, bendTime, decay, level = 0.9, skin = 0.12, skinFreq = freq * 4 }: DrumOptions,
) {
  const body = sweep(ctx, 'sine', freq * bend, freq, bendTime)
  chain(body, env(ctx, level, 0.002, decay), ctx.destination)
  body.start(0)
  if (skin > 0) {
    const n = noise(ctx, 0.08)
    chain(n, filter(ctx, 'bandpass', skinFreq, 1.2), env(ctx, skin, 0.001, 0.05), ctx.destination)
    n.start(0)
  }
}

export interface DrumOptions {
  freq: number
  bend: number
  bendTime: number
  decay: number
  level?: number
  skin?: number
  skinFreq?: number
}
