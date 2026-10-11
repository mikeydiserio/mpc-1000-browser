import { DECAY_OFF } from '../audio/voice-pool'
import {
  type FxSettings,
  MAX_STEPS,
  type MasterSettings,
  PAD_COUNT,
  type PadParams,
  type Pattern,
  type QLinkSlider,
  type Step,
} from './types'

export function createPad(sampleId: string | null = null): PadParams {
  return {
    sampleId,
    start: 0,
    end: 1,
    tune: 0,
    fine: 0,
    volume: 0.8,
    pan: 0,
    reverse: false,
    loop: false,
    playMode: 'oneshot',
    polyphony: 'poly',
    muteGroup: 0,
    attack: 0,
    decay: DECAY_OFF,
    filterType: 'off',
    cutoff: 18000,
    resonance: 0.7,
    velocitySens: 0.8,
    retrigger: { count: 1, rate: '1/16', fade: 0.15, pitchStep: 0 },
    sendDelay: 0,
    sendReverb: 0,
  }
}

export function createTrack(): Step[] {
  return Array.from({ length: MAX_STEPS }, () => ({ on: false, velocity: 100 }))
}

export function createPattern(index: number): Pattern {
  return {
    name: `Sequence${String(index + 1).padStart(2, '0')}`,
    length: 16,
    resolution: '1/16',
    swing: 50,
    tracks: Array.from({ length: PAD_COUNT }, createTrack),
  }
}

export function clonePattern(pattern: Pattern): Pattern {
  return {
    ...pattern,
    tracks: pattern.tracks.map((track) => track.map((step) => ({ ...step }))),
  }
}

export function createFx(): FxSettings {
  return {
    delayDivision: '1/8D',
    delayFeedback: 0.35,
    delayTone: 6000,
    delayReturn: 0.6,
    reverbSize: 2.2,
    reverbPreDelay: 0.015,
    reverbReturn: 0.5,
    compressor: true,
  }
}

export function createMaster(): MasterSettings {
  return { volume: 0.8, recGain: 0.7, metronome: false, metronomeOnlyRec: true, countIn: false }
}

export function createQLinks(): QLinkSlider[] {
  return [
    { target: 'tune', position: 0.5 },
    { target: 'cutoff', position: 1 },
  ]
}

/** A playable starter beat for pattern 1 using the default kit layout. */
export function seedDemoPattern(pattern: Pattern): Pattern {
  const set = (pad: number, steps: number[], velocity = 100) => {
    for (const s of steps) pattern.tracks[pad]![s] = { on: true, velocity }
  }
  // Pad 1 kick, 2 snare, 3 closed hat, 4 open hat (see default-kit.ts ordering)
  set(0, [0, 7, 10])
  set(1, [4, 12], 110)
  set(2, [0, 2, 4, 6, 8, 10, 12, 14], 80)
  set(2, [3, 11], 50)
  set(3, [14], 70)
  return pattern
}
