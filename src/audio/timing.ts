import type { Division, FxSettings, StepResolution } from '../state/types'

/** Length of a division measured in quarter-note beats. */
const BEATS: Record<Division | FxSettings['delayDivision'], number> = {
  '1/4': 1,
  '1/4D': 1.5,
  '1/8': 0.5,
  '1/8D': 0.75,
  '1/8T': 1 / 3,
  '1/16': 0.25,
  '1/16T': 1 / 6,
  '1/32': 0.125,
  '1/32T': 1 / 12,
  '1/64': 0.0625,
}

export function divisionSeconds(division: Division | FxSettings['delayDivision'], bpm: number) {
  return (BEATS[division] * 60) / bpm
}

export function stepSeconds(resolution: StepResolution, bpm: number) {
  return divisionSeconds(resolution, bpm)
}

/** Steps per quarter-note beat for a resolution — used for bar/beat display and the metronome. */
export function stepsPerBeat(resolution: StepResolution) {
  return Math.round(1 / BEATS[resolution])
}

/**
 * MPC-style swing: every second step is pushed late. 50 = straight, 66 ≈ triplet shuffle.
 * Returns the offset in seconds for the given step.
 */
export function swingOffset(step: number, swing: number, stepDur: number) {
  if (step % 2 === 0 || swing <= 50) return 0
  return stepDur * (2 * (swing / 100) - 1)
}
