import { type MpcState, useMpc } from '../../state/store'
import type { PadParams } from '../../state/types'

/** One editable field on the LCD. `step` is driven by the DATA wheel, mouse wheel or drag. */
export interface ParamDef {
  label: string
  value: string
  step: (dir: number, big: boolean) => void
}

const state = () => useMpc.getState()
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

interface NumOptions {
  get: (s: MpcState) => number
  set: (v: number) => void
  min: number
  max: number
  step?: number
  big?: number
  format?: (v: number) => string
}

export function numParam(label: string, o: NumOptions): ParamDef {
  const step = o.step ?? 1
  const big = o.big ?? step * 10
  const v = o.get(state())
  return {
    label,
    value: o.format ? o.format(v) : String(v),
    step: (dir, isBig) => {
      const current = o.get(state())
      const next = clamp(current + dir * (isBig ? big : step), o.min, o.max)
      // Avoid float drift on fractional steps
      o.set(Math.round(next / step) * step)
    },
  }
}

interface ChoiceOptions<T> {
  get: (s: MpcState) => T
  set: (v: T) => void
  options: readonly T[]
  format?: (v: T) => string
}

export function choiceParam<T>(label: string, o: ChoiceOptions<T>): ParamDef {
  const v = o.get(state())
  return {
    label,
    value: o.format ? o.format(v) : String(v),
    step: (dir) => {
      const i = o.options.indexOf(o.get(state()))
      o.set(o.options[clamp(i + dir, 0, o.options.length - 1)]!)
    },
  }
}

export function toggleParam(
  label: string,
  get: (s: MpcState) => boolean,
  set: (v: boolean) => void,
  labels: [string, string] = ['ON', 'OFF'],
): ParamDef {
  return {
    label,
    value: get(state()) ? labels[0] : labels[1],
    step: () => set(!get(state())),
  }
}

/** Display-only line rendered with the param styling. */
export function infoParam(label: string, value: string): ParamDef {
  return { label, value, step: () => {} }
}

type NumericPadKey = {
  [K in keyof PadParams]: PadParams[K] extends number ? K : never
}[keyof PadParams]

const selected = (s: MpcState) => s.pads[s.selectedPad]!

export function padNum(
  label: string,
  key: NumericPadKey,
  min: number,
  max: number,
  step = 1,
  format?: (v: number) => string,
  big?: number,
): ParamDef {
  return numParam(label, {
    get: (s) => selected(s)[key],
    set: (v) => state().setPad(state().selectedPad, { [key]: v }),
    min,
    max,
    step,
    big,
    format,
  })
}

export function padChoice<K extends keyof PadParams>(
  label: string,
  key: K,
  options: readonly PadParams[K][],
  format?: (v: PadParams[K]) => string,
): ParamDef {
  return choiceParam(label, {
    get: (s) => selected(s)[key],
    set: (v) => state().setPad(state().selectedPad, { [key]: v } as Partial<PadParams>),
    options,
    format,
  })
}

/** Cutoff moves in semitone steps (12 per octave) so the wheel feels musical across 20 Hz–20 kHz. */
export function logStep(current: number, dir: number, big: boolean, min: number, max: number) {
  return clamp(current * 2 ** ((dir * (big ? 12 : 1)) / 12), min, max)
}

/** The params of the screen currently on the LCD, for the DATA wheel and cursor keys. */
export const lcdControl: { params: ParamDef[]; columns: number } = { params: [], columns: 2 }

export function adjustCursorParam(dir: number, big = false) {
  const p = lcdControl.params[state().cursor]
  p?.step(dir, big || state().shift)
}

export function moveCursor(delta: number) {
  const count = lcdControl.params.length
  if (!count) return
  const s = state()
  s.set({ cursor: clamp(s.cursor + delta, 0, count - 1) })
}
