import { create } from 'zustand'
import { useMpc } from '../../state/store'

/** Which pad the sound browser is choosing a sample for (null = closed). */
export const usePicker = create<{ pad: number | null }>(() => ({ pad: null }))

export function openSoundPicker(pad: number) {
  useMpc.getState().selectPad(pad)
  usePicker.setState({ pad })
}

export function closeSoundPicker() {
  usePicker.setState({ pad: null })
}
