import { create } from 'zustand'
import { transport } from '../audio/transport'
import { padLabel } from './format'
import { useMpc } from './store'
import { type LcdMode, PADS_PER_BANK } from './types'

/** MODE + pad → screen, matching the labels printed above the MPC1000 pads (PAD1 = index 0). */
export const MODE_PADS: (LcdMode | null)[] = [
  'slider',
  'load',
  'save',
  null,
  'record',
  'trim',
  'program',
  'mixer',
  'midi',
  'other',
  null,
  'effect',
  'seqedit',
  'seqedit',
  null,
  'song',
]

export const MODE_LABELS: Record<number, string> = {
  0: 'SLIDER',
  1: 'LOAD',
  2: 'SAVE',
  4: 'RECORD',
  5: 'TRIM',
  6: 'PROGRAM',
  7: 'MIXER',
  8: 'MIDI/SYNC',
  9: 'OTHER',
  11: 'EFFECT',
  12: 'SEQ EDIT',
  13: 'STEP EDIT',
  15: 'SONG',
}

/** Keyboard layout: bottom row → PAD1-4, up to the number row → PAD13-16. */
export const PAD_KEYS = [
  'z',
  'x',
  'c',
  'v',
  'a',
  's',
  'd',
  'f',
  'q',
  'w',
  'e',
  'r',
  '1',
  '2',
  '3',
  '4',
]

const SIXTEEN_LEVEL_KEY = 1000
/** position → transport input key, so a release always matches its press even if the bank changed */
const pressed = new Map<number, number>()

/** Which pad positions are physically held — drives the pressed look for mouse, keys and MIDI. */
export const usePadsDown = create<{ down: Record<number, boolean> }>(() => ({ down: {} }))
const setDown = (position: number, value: boolean) =>
  usePadsDown.setState((x) => ({ down: { ...x.down, [position]: value } }))

/**
 * Routes a physical pad press (position 0..15 in the current bank) according to the
 * active modifiers: MODE select, TRACK MUTE, 16 LEVELS, FULL LEVEL.
 */
export function pressPad(position: number, velocity: number) {
  const s = useMpc.getState()
  setDown(position, true)

  if (s.modeSelect) {
    const mode = MODE_PADS[position]
    if (mode) s.setMode(mode)
    else s.set({ modeSelect: false })
    // PAD14 STEP EDIT opens the per-track page of SEQ EDIT
    if (position === 13) s.set({ page: 1 })
    return
  }

  const pad = s.bank * PADS_PER_BANK + position

  if (s.trackMuteMode) {
    if (s.shift) s.toggleSolo(pad)
    else s.toggleMute(pad)
    return
  }

  if (s.erase && !s.playing) {
    s.clearTrack(pad)
    s.flash(`Erased ${padLabel(pad)} track`)
    return
  }

  if (s.sixteenLevels.on) {
    const source = s.sixteenLevels.source
    const key = SIXTEEN_LEVEL_KEY + position
    pressed.set(position, key)
    if (s.sixteenLevels.param === 'velocity') {
      transport.padDown(key, source, Math.round(((position + 1) * 127) / 16))
    } else {
      transport.padDown(key, source, s.fullLevel ? 127 : velocity, position - 4)
    }
    return
  }

  pressed.set(position, pad)
  transport.padDown(pad, pad, s.fullLevel ? 127 : velocity)
  if (s.selectedPad !== pad) s.selectPad(pad)
}

export function releasePad(position: number) {
  setDown(position, false)
  const key = pressed.get(position)
  if (key === undefined) return
  pressed.delete(position)
  transport.padUp(key)
}
