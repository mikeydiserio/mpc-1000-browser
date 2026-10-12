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
    filterEnvAmount: 0,
    filterEnvDecay: 250,
    velocityToFilter: 0,
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
  return {
    volume: 0.8,
    recGain: 0.7,
    metronome: false,
    metronomeOnlyRec: true,
    countIn: false,
    timingCorrect: true,
  }
}

export function createQLinks(): QLinkSlider[] {
  return [
    { target: 'tune', position: 0.5 },
    { target: 'cutoff', position: 1 },
  ]
}
