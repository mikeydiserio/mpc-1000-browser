import type { PadParams, StepResolution } from '../../state/types'

export interface MachineVoice {
  /** Short code used in pattern definitions, e.g. 'BD' */
  id: string
  /** Name shown on the pad / LCD (max ~12 chars) */
  name: string
  seconds: number
  render: (ctx: OfflineAudioContext) => void
  /** Pad settings applied on load (mute groups, sends…) */
  pad?: Partial<PadParams>
}

/**
 * Step strings, one character per step: 'X' accent (127), 'x' normal (100), 'o' ghost (60),
 * '.' rest. Keys are voice ids.
 */
export interface MachinePattern {
  name: string
  length: number
  resolution?: StepResolution
  tracks: Record<string, string>
}

export interface MachineDef {
  id: string
  name: string
  /** One-line history / character, shown on the LCD and in the guide */
  blurb: string
  bpm: number
  swing: number
  /** Voices in pad order: index 0 = PAD1 */
  voices: MachineVoice[]
  patterns: MachinePattern[]
  /** Song chain over the patterns above (indexes) */
  song: number[]
}
