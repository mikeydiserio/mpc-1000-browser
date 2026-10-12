import type { AcidSettings, AcidStep } from '../state/types'
import type { MixChain } from './mix-chain'

/** Key 0 (C, octave switch normal) plays C2 — the 303's home register. */
const BASE_MIDI = 36
/** Fraction of a step the gate stays open on a normal (non-slide) note. */
export const ACID_GATE = 0.55

export function acidNoteName(step: Pick<AcidStep, 'note' | 'octave'>) {
  const name = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'][step.note]
  return `${name}${2 + step.octave + (step.note === 12 ? 1 : 0)}`
}

const cutoffHz = (cutoff: number) => 80 * 2 ** (cutoff * 6.2)

function driveCurve(amount: number) {
  const curve = new Float32Array(1024)
  const k = 1 + amount * 5
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / Math.tanh(k)
  }
  return curve
}

/**
 * Monophonic TB-303 voice: one free-running saw/square oscillator into two cascaded resonant
 * low-passes (24 dB), a VCA and a soft-clip drive stage. Notes are booked ahead of time on the
 * context clock, in order, so slide (glide + held gate) and accent behave like the hardware:
 * a slid-into note glides its pitch and does not retrigger the envelopes.
 * Built against BaseAudioContext so the same voice renders the offline bounce.
 */
export class AcidVoice {
  private osc: OscillatorNode
  private filters: BiquadFilterNode[]
  private vca: GainNode
  private pre: GainNode
  private shaper: WaveShaperNode
  private out: GainNode
  private delay: GainNode
  private reverb: GainNode
  private settings: AcidSettings
  private drive = -1
  /** The last note's gate was left open to slide into the next one */
  private held = false

  constructor(
    private ctx: BaseAudioContext,
    chain: Pick<MixChain, 'input' | 'delaySend' | 'reverbSend'>,
    settings: AcidSettings,
  ) {
    this.settings = settings
    this.osc = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 65.4 })
    const level = new GainNode(ctx, { gain: 0.45 })
    this.filters = [
      new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 400, Q: 0 }),
      new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 400, Q: 10 }),
    ]
    this.vca = new GainNode(ctx, { gain: 0 })
    this.pre = new GainNode(ctx, { gain: 1 })
    this.shaper = new WaveShaperNode(ctx, { oversample: '2x' })
    this.out = new GainNode(ctx, { gain: 0 })
    this.delay = new GainNode(ctx, { gain: 0 })
    this.reverb = new GainNode(ctx, { gain: 0 })

    this.osc.connect(level)
    level.connect(this.filters[0]!)
    this.filters[0]!.connect(this.filters[1]!)
    this.filters[1]!.connect(this.vca)
    this.vca.connect(this.pre)
    this.pre.connect(this.shaper)
    this.shaper.connect(this.out)
    this.out.connect(chain.input)
    this.out.connect(this.delay)
    this.out.connect(this.reverb)
    this.delay.connect(chain.delaySend)
    this.reverb.connect(chain.reverbSend)
    this.osc.start()
    this.apply(settings)
  }

  /** Panel changes: level, sends, waveform, resonance and drive apply at once; tune, cutoff,
   * env mod, decay and accent are read when each note is booked. */
  apply(settings: AcidSettings) {
    this.settings = settings
    const t = this.ctx.currentTime
    this.osc.type = settings.wave === 'saw' ? 'sawtooth' : 'square'
    this.out.gain.setTargetAtTime(settings.volume * settings.volume, t, 0.02)
    this.delay.gain.setTargetAtTime(settings.sendDelay, t, 0.02)
    this.reverb.gain.setTargetAtTime(settings.sendReverb, t, 0.02)
    // Biquad low-pass Q is the resonant peak in dB
    this.filters[1]!.Q.setTargetAtTime(settings.resonance * 24, t, 0.02)
    if (Math.abs(settings.drive - this.drive) > 0.005) {
      this.drive = settings.drive
      this.shaper.curve = driveCurve(settings.drive)
      this.pre.gain.setTargetAtTime(1 + settings.drive * 2, t, 0.02)
    }
  }

  /**
   * Book one step's note at `time`. `gate` is how long the gate stays open (seconds);
   * `holdNext` keeps it open so the next note slides in.
   */
  note(time: number, step: AcidStep, gate: number, holdNext: boolean) {
    const s = this.settings
    const midi = BASE_MIDI + s.tune + step.note + step.octave * 12
    const f = 440 * 2 ** ((midi - 69) / 12)
    const slideIn = this.held

    const freq = this.osc.frequency
    freq.cancelScheduledValues(time)
    if (slideIn) freq.setTargetAtTime(f, time, 0.022)
    else freq.setValueAtTime(f, time)

    const level = 0.6 * (step.accent ? 1 + s.accent * 0.8 : 1)
    const g = this.vca.gain
    g.cancelScheduledValues(time)
    g.setTargetAtTime(level, time, slideIn ? 0.01 : 0.0015)
    if (!holdNext) g.setTargetAtTime(0, time + gate, 0.006)

    // Slid notes don't retrigger the filter envelope
    if (!slideIn) {
      const base = cutoffHz(s.cutoff)
      const depth = s.envMod * 4.2 + (step.accent ? s.accent * 1.6 : 0)
      const peak = Math.min(16000, base * 2 ** depth)
      // Accent forces the short decay, like the hardware
      const tau = step.accent ? 0.06 : 0.03 + s.decay * s.decay * 0.75
      for (const filter of this.filters) {
        const p = filter.frequency
        p.cancelScheduledValues(time)
        p.setTargetAtTime(peak, time, 0.0015)
        p.setTargetAtTime(base, time + 0.006, tau)
      }
    }
    this.held = holdNext
  }

  /** A rest: closes a gate that was left open by a slide. */
  rest(time: number) {
    if (this.held) this.vca.gain.setTargetAtTime(0, time, 0.006)
    this.held = false
  }

  /** Close the gate now, cancelling anything already booked (STOP, key release). */
  release(time: number) {
    const g = this.vca.gain
    g.cancelScheduledValues(time)
    g.setTargetAtTime(0, time, 0.008)
    this.held = false
  }
}
