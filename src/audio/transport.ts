import { create } from 'zustand'
import { useMpc } from '../state/store'
import { PADS_PER_BANK } from '../state/types'
import { engine } from './engine'
import { divisionSeconds, stepSeconds, stepsPerBeat, swingOffset } from './timing'

const LOOKAHEAD = 0.12
const TICK_MS = 20
const LOG_LIMIT = 32

/** High-frequency UI state kept out of the main store so the playhead never re-renders the app. */
export const usePlayhead = create<{ step: number; pattern: number; countIn: boolean }>(() => ({
  step: -1,
  pattern: 0,
  countIn: false,
}))

/** Pads lit by sequencer playback (live hits light themselves). */
export const usePadActivity = create<{ hits: Record<number, number> }>(() => ({ hits: {} }))

interface LoggedStep {
  step: number
  pattern: number
  time: number
}

interface HeldPad {
  pad: number
  velocity: number
  pitchOffset: number
  nextRepeat: number
}

/**
 * Lookahead sequencer ("A Tale of Two Clocks"): a worker timer wakes the scheduler, which books
 * every step falling inside the lookahead window on the sample-accurate AudioContext clock.
 */
class Transport {
  private worker: Worker | null = null
  private step = 0
  private nextStepTime = 0
  private anchorTime = 0
  private log: LoggedStep[] = []
  private suppress = new Set<string>()
  private held = new Map<number, HeldPad>()
  private raf = 0
  /** Locate position used by PLAY (PLAY START always begins at step 0). */
  position = 0

  private ensureWorker() {
    if (this.worker) return
    const src = `let id; onmessage = (e) => { clearInterval(id); if (e.data === 'start') id = setInterval(() => postMessage(0), ${TICK_MS}) }`
    this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
    this.worker.onmessage = () => this.tick()
    this.worker.postMessage('start')
  }

  play(fromStart: boolean) {
    const ctx = engine.ensure()
    const s = useMpc.getState()
    if (s.playing) return
    this.ensureWorker()
    if (s.songMode) {
      useMpc.setState({ songPosition: 0, currentPattern: s.song[0] ?? s.currentPattern })
    }
    if (s.record !== 'off') s.pushUndo()

    const pattern = useMpc.getState().patterns[useMpc.getState().currentPattern]!
    this.step = fromStart || s.songMode ? 0 : this.position % pattern.length
    this.log = []
    this.suppress.clear()
    let start = ctx.currentTime + 0.05

    if (s.master.countIn && s.record !== 'off') {
      const beat = 60 / s.bpm
      for (let i = 0; i < 4; i++) engine.click(start + i * beat, i === 0)
      start += beat * 4
      usePlayhead.setState({ countIn: true })
    }
    this.nextStepTime = start
    this.anchorTime = start - this.step * stepSeconds(pattern.resolution, s.bpm)
    useMpc.setState({ playing: true, queuedPattern: null })
    this.startRaf()
  }

  stop() {
    const s = useMpc.getState()
    if (!s.playing) {
      // Second STOP press = panic: kill every ringing voice
      engine.stopAll()
      this.position = 0
      usePlayhead.setState({ step: -1 })
      return
    }
    this.position = Math.max(0, usePlayhead.getState().step)
    useMpc.setState({
      playing: false,
      record: 'off',
      queuedPattern: null,
    })
    usePlayhead.setState({ countIn: false })
    cancelAnimationFrame(this.raf)
  }

  locate(delta: number) {
    const s = useMpc.getState()
    if (s.playing) return
    const length = s.patterns[s.currentPattern]!.length
    this.position = (((this.position + delta) % length) + length) % length
    usePlayhead.setState({ step: this.position, pattern: s.currentPattern })
  }

  /**
   * Called on every pad press, from mouse, keyboard or MIDI. `key` identifies the physical
   * input so 16 LEVELS (many inputs → one pad) can hold several notes at once.
   */
  padDown(key: number, pad: number, velocity: number, pitchOffset = 0) {
    const ctx = engine.ensure()
    const s = useMpc.getState()
    const now = ctx.currentTime
    // ERASE + pad: silently hold the pad so the scheduler wipes its events as they pass
    if (!s.erase) {
      engine.trigger(pad, s.pads, { velocity, bpm: s.bpm, pitchOffset })
      if (s.playing && s.record !== 'off') this.recordHit(pad, velocity, now)
    }

    let nextRepeat = Number.POSITIVE_INFINITY
    if (s.noteRepeat) {
      const interval = divisionSeconds(s.noteRepeatRate, s.bpm)
      const anchor = s.playing ? this.anchorTime : now
      nextRepeat = anchor + Math.floor((now - anchor) / interval + 1) * interval
    }
    this.held.set(key, { pad, velocity, pitchOffset, nextRepeat })
    this.ensureWorker()
  }

  padUp(key: number) {
    const held = this.held.get(key)
    if (!held) return
    this.held.delete(key)
    const stillHeld = [...this.held.values()].some((h) => h.pad === held.pad)
    if (!stillHeld && useMpc.getState().pads[held.pad]?.playMode === 'noteon')
      engine.release(held.pad)
  }

  private isHeld(pad: number) {
    for (const h of this.held.values()) if (h.pad === pad) return true
    return false
  }

  private recordHit(pad: number, velocity: number, time: number) {
    const s = useMpc.getState()
    const pattern = s.patterns[s.currentPattern]!
    const stepDur = stepSeconds(pattern.resolution, s.bpm)
    const upcoming: LoggedStep = {
      step: this.step,
      pattern: s.currentPattern,
      time: this.nextStepTime + swingOffset(this.step, pattern.swing, stepDur),
    }
    const candidates = [...this.log.filter((l) => l.pattern === s.currentPattern), upcoming]
    let best = upcoming
    for (const c of candidates) if (Math.abs(c.time - time) < Math.abs(best.time - time)) best = c
    // Not yet booked by the scheduler: stop it re-firing the note we just played live
    if (best === upcoming) this.suppress.add(`${pad}:${best.step}`)
    s.setStep(pad, best.step, { on: true, velocity: Math.round(velocity) })
  }

  private tick() {
    const ctx = engine.ctx
    if (!ctx) return
    const horizon = ctx.currentTime + LOOKAHEAD
    const s = useMpc.getState()

    if (s.playing) {
      while (this.nextStepTime < horizon) this.scheduleStep()
    }

    // Note repeat for held pads
    if (s.noteRepeat && this.held.size) {
      const interval = divisionSeconds(s.noteRepeatRate, s.bpm)
      const state = useMpc.getState()
      for (const h of this.held.values()) {
        while (h.nextRepeat < horizon) {
          if (h.nextRepeat >= ctx.currentTime - 0.01) {
            const opts = { velocity: h.velocity, bpm: state.bpm, pitchOffset: h.pitchOffset }
            engine.trigger(h.pad, state.pads, opts, h.nextRepeat)
            if (state.playing && state.record !== 'off' && !state.erase) {
              this.recordHit(h.pad, h.velocity, h.nextRepeat)
            }
            this.light(h.pad, h.nextRepeat)
          }
          h.nextRepeat += interval
        }
      }
    }
  }

  private scheduleStep() {
    const s = useMpc.getState()
    const patternIndex = s.currentPattern
    const pattern = s.patterns[patternIndex]!
    if (this.step >= pattern.length) this.step = 0
    const stepDur = stepSeconds(pattern.resolution, s.bpm)
    const t = this.nextStepTime + swingOffset(this.step, pattern.swing, stepDur)
    const anySolo = s.solos.some(Boolean)

    for (let pad = 0; pad < pattern.tracks.length; pad++) {
      const st = pattern.tracks[pad]![this.step]!
      if (!st.on) continue
      const key = `${pad}:${this.step}`
      if (s.erase && this.isHeld(pad)) {
        s.setStep(pad, this.step, { on: false })
        continue
      }
      // REC (not OVERDUB) overwrites: the first pass wipes events it crosses, except fresh takes
      if (s.record === 'rec' && !this.suppress.has(key)) {
        s.setStep(pad, this.step, { on: false })
        continue
      }
      if (this.suppress.delete(key)) continue
      if (s.mutes[pad] || (anySolo && !s.solos[pad])) continue
      engine.trigger(pad, s.pads, { velocity: st.velocity, bpm: s.bpm, gate: stepDur * 0.95 }, t)
      this.light(pad, t)
    }

    const spb = stepsPerBeat(pattern.resolution)
    const clickOn = s.master.metronome && (!s.master.metronomeOnlyRec || s.record !== 'off')
    if (clickOn && this.step % spb === 0) engine.click(t, this.step % (spb * 4) === 0)

    this.log.push({ step: this.step, pattern: patternIndex, time: t })
    if (this.log.length > LOG_LIMIT) this.log.shift()

    this.nextStepTime += stepDur
    this.step++
    if (this.step >= pattern.length) {
      this.step = 0
      this.patternEnd()
    }
  }

  private patternEnd() {
    const s = useMpc.getState()
    // MPC behaviour: REC drops into OVERDUB once the loop comes around
    if (s.record === 'rec') useMpc.setState({ record: 'overdub' })
    const resolution = s.patterns[s.currentPattern]!.resolution
    let next = s.currentPattern
    if (s.queuedPattern !== null) {
      next = s.queuedPattern
    } else if (s.songMode && s.song.length) {
      const pos = (s.songPosition + 1) % s.song.length
      next = s.song[pos]!
      useMpc.setState({ songPosition: pos })
    }
    if (next !== s.currentPattern || s.queuedPattern !== null) {
      useMpc.setState({ currentPattern: next, queuedPattern: null })
    }
    const nextRes = useMpc.getState().patterns[next]!.resolution
    if (nextRes !== resolution) this.anchorTime = this.nextStepTime
  }

  private light(pad: number, time: number) {
    const delay = Math.max(0, (time - (engine.ctx?.currentTime ?? 0)) * 1000)
    setTimeout(() => {
      usePadActivity.setState((a) => ({ hits: { ...a.hits, [pad]: performance.now() } }))
    }, delay)
  }

  /** Follow the audible step, not the scheduled one. */
  private startRaf() {
    const frame = () => {
      const ctx = engine.ctx
      if (!ctx || !useMpc.getState().playing) return
      const now = ctx.currentTime
      let current: LoggedStep | undefined
      for (const l of this.log) if (l.time <= now) current = l
      const ph = usePlayhead.getState()
      if (current && (current.step !== ph.step || current.pattern !== ph.pattern || ph.countIn)) {
        usePlayhead.setState({ step: current.step, pattern: current.pattern, countIn: false })
      }
      this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }
}

export const transport = new Transport()

/** Pad index (0..63) for a pad position (0..15) in the active bank. */
export function bankPad(position: number) {
  return useMpc.getState().bank * PADS_PER_BANK + position
}
