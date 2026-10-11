import { stepsPerBeat } from '../audio/timing'
import { transport } from '../audio/transport'
import { lcdControl, moveCursor } from '../components/lcd/params'
import { useMpc } from './store'
import { DIVISIONS, type RecordState } from './types'

const st = () => useMpc.getState()

let taps: number[] = []
let noteRepeatLatched = false

/** Front-panel commands shared by the hardware buttons and the computer keyboard. */
export const commands = {
  play: () => transport.play(false),
  playStart: () => transport.play(true),
  stop: () => transport.stop(),
  togglePlay: () => (st().playing ? transport.stop() : transport.play(false)),

  record(kind: Exclude<RecordState, 'off'>) {
    const s = st()
    const next = s.record === kind ? 'off' : kind
    if (next !== 'off' && s.playing) s.pushUndo()
    s.set({ record: next })
  },

  /** TAP TEMPO doubles as NOTE REPEAT while held; SHIFT+TAP latches repeat on. */
  tapDown() {
    const s = st()
    if (s.shift) {
      noteRepeatLatched = !noteRepeatLatched
      s.set({ noteRepeat: noteRepeatLatched })
      s.flash(`Note repeat ${noteRepeatLatched ? 'LATCHED' : 'OFF'} (${s.noteRepeatRate})`)
      return
    }
    const now = performance.now()
    taps = [...taps.filter((t) => now - t < 2000), now].slice(-5)
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]!)
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
      s.set({ bpm: Math.round((60000 / avg) * 2) / 2 })
    }
    s.set({ noteRepeat: true })
  },
  tapUp() {
    if (!noteRepeatLatched) st().set({ noteRepeat: false })
  },

  cycleRepeatRate() {
    const i = DIVISIONS.indexOf(st().noteRepeatRate)
    st().set({ noteRepeatRate: DIVISIONS[(i + 1) % DIVISIONS.length]! })
  },

  nextSeq(dir: number) {
    const s = st()
    s.selectPattern((s.queuedPattern ?? s.currentPattern) + dir)
  },

  locateBar(dir: number) {
    const s = st()
    const pattern = s.patterns[s.currentPattern]!
    transport.locate(dir * stepsPerBeat(pattern.resolution) * 4)
  },
  locateStep: (dir: number) => transport.locate(dir),

  cursor(direction: 'up' | 'down' | 'left' | 'right') {
    const cols = lcdControl.columns
    if (direction === 'left') moveCursor(-1)
    if (direction === 'right') moveCursor(1)
    if (direction === 'up') moveCursor(-cols)
    if (direction === 'down') moveCursor(cols)
  },

  sixteenLevels() {
    const s = st()
    s.set({ sixteenLevels: { ...s.sixteenLevels, on: !s.sixteenLevels.on, source: s.selectedPad } })
  },
}
