import { create } from 'zustand'

/** Screen-local LCD state that doesn't belong in the saved project. */
export interface LcdUi {
  zoom: number
  chopSlices: number
  chopMode: 'equal' | 'transient'
  chopSensitivity: number
  chopBank: number
  bounceLoops: number
  copyTarget: number
  armed: boolean
  sampling: boolean
  samplingStarted: number
  recordTarget: number | null
  expanded: boolean
  confirm: string | null
}

export const useLcdUi = create<LcdUi>(() => ({
  zoom: 1,
  chopSlices: 8,
  chopMode: 'equal',
  chopSensitivity: 1.5,
  chopBank: 1,
  bounceLoops: 4,
  copyTarget: 1,
  armed: false,
  sampling: false,
  samplingStarted: 0,
  recordTarget: null,
  expanded: false,
  confirm: null,
}))

let confirmTimer: ReturnType<typeof setTimeout> | undefined

/** Two-press confirmation for destructive F-key actions. Returns true on the second press. */
export function confirmed(action: string) {
  if (useLcdUi.getState().confirm === action) {
    useLcdUi.setState({ confirm: null })
    return true
  }
  clearTimeout(confirmTimer)
  useLcdUi.setState({ confirm: action })
  confirmTimer = setTimeout(() => useLcdUi.setState({ confirm: null }), 2500)
  return false
}
