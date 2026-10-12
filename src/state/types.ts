export const PADS_PER_BANK = 16
export const BANK_COUNT = 4
export const PAD_COUNT = PADS_PER_BANK * BANK_COUNT
export const PATTERN_COUNT = 16
export const MAX_STEPS = 64
export const MIN_STEPS = 8
export const BANK_NAMES = ['A', 'B', 'C', 'D'] as const

export type PlayMode = 'oneshot' | 'noteon'
export type FilterType = 'off' | 'lowpass' | 'highpass' | 'bandpass'
export type Polyphony = 'poly' | 'mono'

/** Musical subdivision of a whole note, e.g. '1/16'. 'T' suffix = triplet. */
export type Division = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T' | '1/32' | '1/32T' | '1/64'
export const DIVISIONS: Division[] = [
  '1/4',
  '1/8',
  '1/8T',
  '1/16',
  '1/16T',
  '1/32',
  '1/32T',
  '1/64',
]
export type StepResolution = '1/8' | '1/16' | '1/16T' | '1/32'
export const STEP_RESOLUTIONS: StepResolution[] = ['1/8', '1/16', '1/16T', '1/32']

export interface Retrigger {
  /** Number of hits fired per trigger. 1 = retrigger off. */
  count: number
  rate: Division
  /** Velocity lost per successive hit, 0..1 */
  fade: number
  /** Pitch change per successive hit, semitones */
  pitchStep: number
}

export interface PadParams {
  sampleId: string | null
  /** Region start/end as a fraction of sample length, 0..1 */
  start: number
  end: number
  /** Coarse tune in semitones, -36..36 */
  tune: number
  /** Fine tune in cents, -100..100 */
  fine: number
  /** 0..1 */
  volume: number
  /** -1..1 */
  pan: number
  reverse: boolean
  loop: boolean
  playMode: PlayMode
  polyphony: Polyphony
  /** 0 = off, 1..16 */
  muteGroup: number
  /** ms */
  attack: number
  /** ms — fade at end of region (one-shot) or after release (note-on) */
  decay: number
  filterType: FilterType
  /** Hz */
  cutoff: number
  /** Q */
  resonance: number
  /** Filter envelope depth in octaves, -6..6 (sweeps from cutoff + depth back to cutoff) */
  filterEnvAmount: number
  /** Filter envelope decay, ms */
  filterEnvDecay: number
  /** 0..1 — softer hits close the filter, up to 4 octaves at full depth */
  velocityToFilter: number
  /** 0..1 — how strongly velocity scales level */
  velocitySens: number
  retrigger: Retrigger
  /** Delay / reverb send levels, 0..1 */
  sendDelay: number
  sendReverb: number
}

export interface SampleMeta {
  id: string
  name: string
  duration: number
  sampleRate: number
  channels: number
}

export interface Step {
  on: boolean
  /** 1..127 */
  velocity: number
  /**
   * Micro-timing as a fraction of one step (-0.5..0.5). Written when recording with
   * TIMING CORRECT off; absent / 0 = exactly on the grid.
   */
  offset?: number
  /** Per-step pitch automation in semitones (-24..24), added on top of the pad's tune */
  pitch?: number
}

export interface Pattern {
  name: string
  /** Active length in steps, multiple of 8 from 8..64 */
  length: number
  resolution: StepResolution
  /** 50 = straight, 75 = heavy */
  swing: number
  /** tracks[padIndex][stepIndex] — always MAX_STEPS long */
  tracks: Step[][]
}

export type LcdMode =
  | 'main'
  | 'trim'
  | 'program'
  | 'mixer'
  | 'record'
  | 'load'
  | 'save'
  | 'effect'
  | 'song'
  | 'seqedit'
  | 'midi'
  | 'other'
  | 'slider'

export type RecordState = 'off' | 'rec' | 'overdub'

export interface FxSettings {
  delayDivision: Division | '1/8D' | '1/4D'
  delayFeedback: number
  delayTone: number
  delayReturn: number
  reverbSize: number
  reverbPreDelay: number
  reverbReturn: number
  compressor: boolean
}

export type QLinkTarget =
  | 'tune'
  | 'fine'
  | 'cutoff'
  | 'resonance'
  | 'volume'
  | 'pan'
  | 'attack'
  | 'decay'
  | 'start'
  | 'end'
  | 'sendDelay'
  | 'sendReverb'

export interface QLinkSlider {
  target: QLinkTarget
  /** Raw slider position, 0..1 */
  position: number
}

export interface MasterSettings {
  volume: number
  recGain: number
  metronome: boolean
  metronomeOnlyRec: boolean
  countIn: boolean
  /** TIMING CORRECT: snap recorded hits to the step grid. Off keeps the exact feel. */
  timingCorrect: boolean
}
