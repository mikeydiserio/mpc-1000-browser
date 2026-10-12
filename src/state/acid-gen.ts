import { createAcidStep } from './defaults'
import { type AcidStep, MAX_STEPS } from './types'

/** Keys (0..12 on the 303 keyboard) that sound good over a C-rooted acid groove. */
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10, 12],
  phrygian: [0, 1, 3, 5, 7, 8, 10, 12],
  pentatonic: [0, 3, 5, 7, 10, 12],
} as const

export type AcidScale = keyof typeof SCALES
export const ACID_SCALES = Object.keys(SCALES) as AcidScale[]

const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!

/**
 * A random but musical acid line: the root dominates, notes stay in the scale, and accents,
 * slides and octave jumps are sprinkled at roughly the density of classic 303 patterns.
 */
export function randomBassLine(length: number, scale: AcidScale = 'minor'): AcidStep[] {
  const keys = SCALES[scale]
  return Array.from({ length: MAX_STEPS }, (_, i): AcidStep => {
    if (i >= length) return createAcidStep()
    const downbeat = i % 4 === 0
    if (!downbeat && Math.random() < 0.3) return createAcidStep()
    const roll = Math.random()
    return {
      on: true,
      note: i === 0 || Math.random() < 0.45 ? 0 : pick(keys),
      octave: roll < 0.15 ? 1 : roll < 0.22 ? -1 : 0,
      accent: i === 0 || Math.random() < (downbeat ? 0.4 : 0.18),
      slide: Math.random() < 0.2,
    }
  })
}
