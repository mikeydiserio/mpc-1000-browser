import { create } from 'zustand'

/**
 * TB-303 step-write state, shared by the panel keyboard and the sequencer lane. With WRITE on,
 * each key press stores a note (with the latched octave / accent / slide) at `cursor` and
 * moves on one step, like the real machine's pattern write mode.
 */
export const useTb = create<{
  write: boolean
  cursor: number
  octave: -1 | 0 | 1
  accent: boolean
  slide: boolean
}>(() => ({ write: false, cursor: 0, octave: 0, accent: false, slide: false }))
