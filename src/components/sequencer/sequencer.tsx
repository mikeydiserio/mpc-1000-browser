import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { MACHINES } from '../../audio/machines/registry'
import { stepsPerBeat } from '../../audio/timing'
import { usePadActivity, usePlayhead } from '../../audio/transport'
import { commands } from '../../state/commands'
import { padLabel, seqLabel } from '../../state/format'
import { loadMachine, useMachines } from '../../state/machines'
import { useMpc } from '../../state/store'
import {
  BANK_NAMES,
  MAX_STEPS,
  PADS_PER_BANK,
  PATTERN_COUNT,
  STEP_RESOLUTIONS,
} from '../../state/types'
import { openSoundPicker } from '../sound-picker/picker-store'
import { AcidLane } from './acid-lane'
import s from './sequencer.module.css'

const LENGTHS = [8, 16, 24, 32, 40, 48, 56, 64]
const VELOCITY_CYCLE = [127, 100, 70, 40]
const st = () => useMpc.getState()

export function Sequencer() {
  return (
    <section className={s.panel} aria-label="Pattern step sequencer">
      <header className={s.header}>
        <div className={s.brand}>
          <h2>Pattern Sequencer</h2>
          <span>16 sequences · 8–64 steps</span>
        </div>
        <MiniTransport />
      </header>
      <MachineStrip />
      <PatternBank />
      <Toolbar />
      <SongChain />
      <Grid />
      <footer className={s.help}>
        Click or drag to paint steps · right-click a step to cycle its velocity · keys Z–V / A–F /
        Q–R / 1–4 play pads · Space play/stop · drop audio on a pad to load it
      </footer>
    </section>
  )
}

function MiniTransport() {
  const playing = useMpc((x) => x.playing)
  const record = useMpc((x) => x.record)
  return (
    <div className={s.miniTransport} data-hint="seq-transport">
      <button
        type="button"
        className={s.tbtn}
        data-on={record === 'rec' || undefined}
        data-kind="rec"
        onClick={() => commands.record('rec')}
      >
        ● REC
      </button>
      <button
        type="button"
        className={s.tbtn}
        data-on={record === 'overdub' || undefined}
        data-kind="rec"
        onClick={() => commands.record('overdub')}
      >
        ◉ OVERDUB
      </button>
      <button type="button" className={s.tbtn} onClick={commands.stop}>
        ■ STOP
      </button>
      <button
        type="button"
        className={s.tbtn}
        data-on={playing || undefined}
        data-kind="play"
        onClick={commands.playStart}
      >
        ▶ PLAY
      </button>
    </div>
  )
}

const MACHINE_TAGS: Record<string, string> = {
  tr808: '1980 · electro, hip-hop',
  tr909: '1983 · house, techno',
  tr606: '1981 · acid, electro',
  linndrum: '1982 · 80s pop, funk',
  mpc: 'factory · boom bap',
}

/** One-click classic kits: loads the machine's sounds plus matching grooves, tempo and song. */
function MachineStrip() {
  const busy = useMachines((m) => m.busy)
  const loaded = useMachines((m) => m.loaded)
  const hasHits = useMpc((x) =>
    x.patterns.some((p) => p.tracks.some((t) => t.some((step) => step.on))),
  )
  const [armed, setArmed] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const choose = (id: string) => {
    if (busy) return
    // Replacing existing sequences needs a second click within 3 s
    if (hasHits && armed !== id) {
      setArmed(id)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setArmed(null), 3000)
      return
    }
    setArmed(null)
    void loadMachine(id)
  }

  return (
    <fieldset className={s.machines} aria-label="Load a drum machine" data-hint="seq-machines">
      <legend className={s.machinesLabel}>Drum machines</legend>
      {MACHINES.map((m) => (
        <button
          type="button"
          key={m.id}
          className={s.machineBtn}
          data-loaded={loaded === m.id || undefined}
          data-armed={armed === m.id || undefined}
          data-busy={busy === m.id || undefined}
          aria-busy={busy === m.id}
          title={m.blurb}
          onClick={() => choose(m.id)}
        >
          <b>{busy === m.id ? 'Building…' : armed === m.id ? 'Replace sequences?' : m.name}</b>
          <span>{armed === m.id ? 'Click again to load' : MACHINE_TAGS[m.id]}</span>
        </button>
      ))}
    </fieldset>
  )
}

function PatternBank() {
  const current = useMpc((x) => x.currentPattern)
  const queued = useMpc((x) => x.queuedPattern)
  const filled = useMpc(
    useShallow((x) => x.patterns.map((p) => p.tracks.some((t) => t.some((step) => step.on)))),
  )
  return (
    <fieldset className={s.patternBank} aria-label="Sequences" data-hint="seq-patterns">
      {Array.from({ length: PATTERN_COUNT }, (_, i) => (
        <button
          type="button"
          key={i}
          className={s.patternBtn}
          data-current={i === current || undefined}
          data-queued={i === queued || undefined}
          data-filled={filled[i] || undefined}
          aria-pressed={i === current}
          aria-label={`Sequence ${seqLabel(i)}${filled[i] ? '' : ' (empty)'}`}
          onClick={() => st().selectPattern(i)}
        >
          {seqLabel(i)}
        </button>
      ))}
    </fieldset>
  )
}

function Toolbar() {
  const pattern = useMpc((x) => x.patterns[x.currentPattern]!)
  const bpm = useMpc((x) => x.bpm)
  const index = useMpc((x) => x.currentPattern)
  const timingCorrect = useMpc((x) => x.master.timingCorrect)
  const spb = stepsPerBeat(pattern.resolution)
  const bars = pattern.length / (spb * 4)

  return (
    <div className={s.toolbar}>
      <div className={s.field}>
        <span className={s.fieldLabel}>
          Steps <b>{pattern.length}</b>{' '}
          <i>
            ({Number.isInteger(bars) ? bars : bars.toFixed(2)} bar{bars === 1 ? '' : 's'})
          </i>
        </span>
        <fieldset className={s.segmented} aria-label="Pattern length" data-hint="seq-length">
          {LENGTHS.map((len) => (
            <button
              type="button"
              key={len}
              data-on={pattern.length === len || undefined}
              aria-pressed={pattern.length === len}
              onClick={() => st().setPatternProp('length', len)}
            >
              {len}
            </button>
          ))}
        </fieldset>
      </div>

      <div className={s.field}>
        <span className={s.fieldLabel}>Resolution</span>
        <fieldset className={s.segmented} aria-label="Step resolution" data-hint="seq-resolution">
          {STEP_RESOLUTIONS.map((r) => (
            <button
              type="button"
              key={r}
              data-on={pattern.resolution === r || undefined}
              aria-pressed={pattern.resolution === r}
              onClick={() => st().setPatternProp('resolution', r)}
            >
              {r}
            </button>
          ))}
        </fieldset>
      </div>

      <label className={s.field} data-hint="seq-swing">
        <span className={s.fieldLabel}>
          Swing <b>{pattern.swing}%</b>
        </span>
        <input
          type="range"
          min={50}
          max={75}
          value={pattern.swing}
          onChange={(e) => st().setPatternProp('swing', Number(e.target.value))}
        />
      </label>

      <label className={s.field} data-hint="seq-tempo">
        <span className={s.fieldLabel}>Tempo</span>
        <span className={s.bpmBox}>
          <input
            type="number"
            min={30}
            max={300}
            step={0.5}
            value={bpm}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v >= 30 && v <= 300) st().set({ bpm: v })
            }}
          />
          BPM
        </span>
      </label>

      <div className={s.actions}>
        <button
          type="button"
          data-hint="seq-tc"
          data-on={timingCorrect || undefined}
          aria-pressed={timingCorrect}
          onClick={() => st().setMaster({ timingCorrect: !timingCorrect })}
        >
          T.C. {timingCorrect ? 'ON' : 'OFF'}
        </button>
        <button type="button" data-hint="seq-quantize" onClick={() => st().quantizePattern()}>
          Quantize
        </button>
        <button
          type="button"
          data-hint="seq-double"
          onClick={() => st().doublePattern()}
          disabled={pattern.length * 2 > MAX_STEPS}
        >
          Double
        </button>
        <label className={s.copy} data-hint="seq-copy">
          <span className={s.visuallyHidden}>Copy sequence to</span>
          <select
            value=""
            onChange={(e) => {
              const target = Number(e.target.value)
              st().copyPatternTo(target)
              st().flash(`Seq ${seqLabel(index)} → ${seqLabel(target)}`)
            }}
          >
            <option value="" disabled>
              Copy to…
            </option>
            {Array.from({ length: PATTERN_COUNT }, (_, i) =>
              i === index ? null : (
                <option key={i} value={i}>
                  Seq {seqLabel(i)}
                </option>
              ),
            )}
          </select>
        </label>
        <button type="button" data-hint="seq-clear" onClick={() => st().clearPattern()}>
          Clear
        </button>
        <button type="button" data-hint="seq-undo" onClick={() => st().undo()}>
          Undo
        </button>
      </div>
    </div>
  )
}

function SongChain() {
  const song = useMpc((x) => x.song)
  const songMode = useMpc((x) => x.songMode)
  const position = useMpc((x) => x.songPosition)
  const playing = useMpc((x) => x.playing)
  const current = useMpc((x) => x.currentPattern)
  return (
    <div className={s.song}>
      <button
        type="button"
        className={s.songToggle}
        data-hint="seq-song"
        data-on={songMode || undefined}
        aria-pressed={songMode}
        onClick={() => st().set({ songMode: !songMode })}
      >
        Song mode {songMode ? 'ON' : 'OFF'}
      </button>
      <ol className={s.chain} aria-label="Song chain" data-hint="seq-chain">
        {song.map((p, i) => (
          <li key={i} data-current={(songMode && playing && i === position) || undefined}>
            {seqLabel(p)}
            <button
              type="button"
              aria-label={`Remove step ${i + 1}`}
              onClick={() => {
                if (song.length > 1) st().set({ song: song.filter((_, j) => j !== i) })
              }}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={s.chainAdd}
        data-hint="seq-chain"
        onClick={() => st().set({ song: [...st().song, current] })}
      >
        + Seq {seqLabel(current)}
      </button>
    </div>
  )
}

// ─── Grid ────────────────────────────────────────────────────────────────────

function Grid() {
  const bank = useMpc((x) => x.bank)
  const length = useMpc((x) => x.patterns[x.currentPattern]!.length)
  const resolution = useMpc((x) => x.patterns[x.currentPattern]!.resolution)
  const paint = useRef<{ on: boolean; velocity: number; pad: number; step: number } | null>(null)
  const pads = Array.from({ length: PADS_PER_BANK }, (_, i) => bank * PADS_PER_BANK + i)
  const beat = stepsPerBeat(resolution)

  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-step]')
    if (!el) return null
    return { pad: Number(el.dataset.pad), step: Number(el.dataset.step) }
  }

  const apply = (pad: number, step: number) => {
    const p = paint.current
    if (!p) return
    // Fill any cells a fast drag skipped between pointer events on the same row
    const from = p.pad === pad ? Math.min(p.step, step) : step
    const to = p.pad === pad ? Math.max(p.step, step) : step
    for (let i = from; i <= to; i++) {
      const current = st().patterns[st().currentPattern]!.tracks[pad]![i]!
      if (current.on !== p.on) {
        st().setStep(
          pad,
          i,
          p.on
            ? { on: true, velocity: p.velocity, offset: 0, pitch: 0 }
            : { on: false, velocity: current.velocity },
        )
      }
    }
    p.pad = pad
    p.step = step
  }

  return (
    <div className={s.gridWrap}>
      <fieldset className={s.bankTabs} aria-label="Pad bank" data-hint="seq-bank">
        {BANK_NAMES.map((name, i) => (
          <button
            type="button"
            key={name}
            data-on={bank === i || undefined}
            aria-pressed={bank === i}
            onClick={() => st().set({ bank: i })}
          >
            Bank {name}
          </button>
        ))}
      </fieldset>
      <div className={s.scroller}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer handling is delegated here for paint-drag; every cell is an aria switch */}
        <div
          className={s.grid}
          data-hint="seq-grid"
          style={{ '--len': length, '--beat': beat } as React.CSSProperties}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            const cell = cellAt(e.clientX, e.clientY)
            if (!cell) return
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            const current = st().patterns[st().currentPattern]!.tracks[cell.pad]![cell.step]!
            st().pushUndo()
            paint.current = { on: !current.on, velocity: e.shiftKey ? 127 : 100, ...cell }
            apply(cell.pad, cell.step)
          }}
          onPointerMove={(e) => {
            if (!paint.current) return
            const cell = cellAt(e.clientX, e.clientY)
            if (cell) apply(cell.pad, cell.step)
          }}
          onPointerUp={() => {
            paint.current = null
          }}
          onContextMenu={(e) => {
            const cell = cellAt(e.clientX, e.clientY)
            if (!cell) return
            e.preventDefault()
            const step = st().patterns[st().currentPattern]!.tracks[cell.pad]![cell.step]!
            if (!step.on) return
            const i = VELOCITY_CYCLE.findIndex((v) => v <= step.velocity)
            const next = VELOCITY_CYCLE[(Math.max(0, i) + 1) % VELOCITY_CYCLE.length]!
            st().setStep(cell.pad, cell.step, { velocity: next })
          }}
        >
          <StepRuler length={length} beat={beat} />
          {pads.map((pad) => (
            <TrackRow key={pad} pad={pad} length={length} beat={beat} />
          ))}
          <Playhead length={length} />
        </div>
        <AcidLane />
        <VelocityLane />
        <TuneLane />
      </div>
    </div>
  )
}

function StepRuler({ length, beat }: { length: number; beat: number }) {
  return (
    <div className={s.row} aria-hidden>
      <div className={s.rowHead} />
      {Array.from({ length }, (_, i) => (
        <span key={i} className={s.ruler} data-beat={i % beat === 0 || undefined}>
          {i % beat === 0 ? i / beat + 1 : ''}
        </span>
      ))}
    </div>
  )
}

function TrackRow({ pad, length, beat }: { pad: number; length: number; beat: number }) {
  const track = useMpc((x) => x.patterns[x.currentPattern]!.tracks[pad]!)
  const name = useMpc((x) => {
    const id = x.pads[pad]?.sampleId
    return id ? (x.samples[id]?.name ?? '—') : '—'
  })
  const selected = useMpc((x) => x.selectedPad === pad)
  const muted = useMpc((x) => x.mutes[pad])
  const solo = useMpc((x) => x.solos[pad])
  const hit = usePadActivity((a) => a.hits[pad])

  return (
    <div className={s.row} data-selected={selected || undefined} data-muted={muted || undefined}>
      <div className={s.rowHead}>
        <button
          type="button"
          className={s.trackName}
          data-hint="seq-track"
          onClick={() => {
            st().selectPad(pad)
          }}
          aria-label={`Select ${padLabel(pad)} ${name}`}
        >
          <span className={s.trackLed}>
            {hit ? <span key={hit} className={s.trackLedFlash} /> : null}
          </span>
          <span className={s.trackNum}>{padLabel(pad)}</span>
          <span className={s.trackSample}>{name}</span>
        </button>
        <button
          type="button"
          className={s.ms}
          data-hint="seq-sound"
          aria-label={`Change the sound on ${padLabel(pad)}`}
          onClick={() => openSoundPicker(pad)}
        >
          ⇄
        </button>
        <button
          type="button"
          className={s.ms}
          data-on={muted || undefined}
          aria-pressed={muted}
          data-hint="seq-mute"
          aria-label={`Mute ${padLabel(pad)}`}
          onClick={() => st().toggleMute(pad)}
        >
          M
        </button>
        <button
          type="button"
          className={s.ms}
          data-solo
          data-on={solo || undefined}
          aria-pressed={solo}
          data-hint="seq-solo"
          aria-label={`Solo ${padLabel(pad)}`}
          onClick={() => st().toggleSolo(pad)}
        >
          S
        </button>
      </div>
      {track.slice(0, length).map((step, i) => (
        <span
          key={i}
          className={s.cell}
          data-step={i}
          data-pad={pad}
          data-on={step.on || undefined}
          data-group={Math.floor(i / beat) % 2 === 1 || undefined}
          data-loose={(step.on && !!step.offset) || undefined}
          data-pitch={step.on && step.pitch ? (step.pitch > 0 ? 'up' : 'down') : undefined}
          style={
            step.on
              ? ({ '--vel': step.velocity / 127, '--off': step.offset ?? 0 } as React.CSSProperties)
              : undefined
          }
          role="switch"
          tabIndex={-1}
          aria-checked={step.on}
          aria-label={`${padLabel(pad)} step ${i + 1}${step.on ? `, velocity ${step.velocity}` : ''}`}
        />
      ))}
    </div>
  )
}

function Playhead({ length }: { length: number }) {
  const step = usePlayhead((p) => p.step)
  const pattern = usePlayhead((p) => p.pattern)
  const current = useMpc((x) => x.currentPattern)
  if (step < 0 || step >= length || pattern !== current) return null
  return (
    <div className={s.playhead} style={{ '--step': step } as React.CSSProperties} aria-hidden />
  )
}

function VelocityLane() {
  const pad = useMpc((x) => x.selectedPad)
  const pattern = useMpc((x) => x.patterns[x.currentPattern]!)
  const track = pattern.tracks[pad]!
  const name = useMpc((x) => {
    const id = x.pads[pad]?.sampleId
    return id ? (x.samples[id]?.name ?? '') : ''
  })
  const laneRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const setFrom = (clientX: number, clientY: number) => {
    const r = laneRef.current!.getBoundingClientRect()
    const step = Math.floor(((clientX - r.left) / r.width) * pattern.length)
    if (step < 0 || step >= pattern.length) return
    const x = st()
    if (!x.patterns[x.currentPattern]!.tracks[pad]![step]!.on) return
    const velocity = Math.round(
      Math.min(127, Math.max(1, (1 - (clientY - r.top) / r.height) * 127)),
    )
    x.setStep(pad, step, { velocity })
  }

  return (
    <div className={s.velocity} style={{ '--len': pattern.length } as React.CSSProperties}>
      <div className={s.velocityHead}>
        <span>Velocity</span>
        <b>
          {padLabel(pad)} {name}
        </b>
        <span className={s.shiftBtns} data-hint="seq-shift">
          <button
            type="button"
            aria-label={`Shift ${padLabel(pad)} one step earlier`}
            onClick={() => st().shiftTrack(pad, -1)}
          >
            ◀
          </button>
          shift
          <button
            type="button"
            aria-label={`Shift ${padLabel(pad)} one step later`}
            onClick={() => st().shiftTrack(pad, 1)}
          >
            ▶
          </button>
        </span>
      </div>
      <div
        ref={laneRef}
        className={s.velocityLane}
        data-hint="seq-velocity"
        style={{ '--len': pattern.length } as React.CSSProperties}
        onPointerDown={(e) => {
          dragging.current = true
          st().pushUndo()
          e.currentTarget.setPointerCapture(e.pointerId)
          setFrom(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (dragging.current) setFrom(e.clientX, e.clientY)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
      >
        {track.slice(0, pattern.length).map((step, i) => (
          <span key={i} className={s.velBar} data-on={step.on || undefined}>
            {step.on ? <span style={{ transform: `scaleY(${step.velocity / 127})` }} /> : null}
          </span>
        ))}
      </div>
    </div>
  )
}

const TUNE_RANGES = [12, 24] as const

/** Bipolar per-step pitch automation for the selected track, in semitones. */
function TuneLane() {
  const pad = useMpc((x) => x.selectedPad)
  const pattern = useMpc((x) => x.patterns[x.currentPattern]!)
  const track = pattern.tracks[pad]!
  const [range, setRange] = useState<(typeof TUNE_RANGES)[number]>(12)
  const [readout, setReadout] = useState<string | null>(null)
  const laneRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const stepAt = (clientX: number) => {
    const r = laneRef.current!.getBoundingClientRect()
    const step = Math.floor(((clientX - r.left) / r.width) * pattern.length)
    return step >= 0 && step < pattern.length ? step : null
  }

  const setPitch = (step: number, pitch: number) => {
    const x = st()
    const current = x.patterns[x.currentPattern]!.tracks[pad]![step]!
    if (!current.on) return
    const value = Math.max(-24, Math.min(24, Math.round(pitch)))
    if ((current.pitch ?? 0) !== value) x.setStep(pad, step, { pitch: value })
    setReadout(`Step ${step + 1}: ${value > 0 ? '+' : ''}${value} st`)
  }

  const setFrom = (clientX: number, clientY: number) => {
    const step = stepAt(clientX)
    if (step === null) return
    const r = laneRef.current!.getBoundingClientRect()
    // Centre line = 0; top / bottom edge = ±range
    setPitch(step, (0.5 - (clientY - r.top) / r.height) * 2 * range)
  }

  // Scroll over a bar for exact ±1 semitone nudges (non-passive so the page doesn't scroll)
  useEffect(() => {
    const el = laneRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const step = stepAt(e.clientX)
      if (step === null) return
      const x = st()
      const current = x.patterns[x.currentPattern]!.tracks[x.selectedPad]![step]!
      if (!current.on) return
      e.preventDefault()
      setPitch(step, (current.pitch ?? 0) + (e.deltaY < 0 ? 1 : -1))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  return (
    <div className={s.velocity} style={{ '--len': pattern.length } as React.CSSProperties}>
      <div className={s.velocityHead}>
        <span>Tune</span>
        <b>{readout ?? `${padLabel(pad)} ±${range} st`}</b>
        <span className={s.shiftBtns}>
          <button
            type="button"
            className={s.laneBtn}
            aria-label={`Tune lane range, now ±${range} semitones`}
            onClick={() => setRange(range === 12 ? 24 : 12)}
          >
            ±{range}
          </button>
          <button
            type="button"
            className={s.laneBtn}
            aria-label={`Reset tune automation for ${padLabel(pad)}`}
            onClick={() => {
              st().pushUndo()
              st().clearPitch(pad)
              setReadout(null)
            }}
          >
            Reset
          </button>
        </span>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse/touch drawing surface (wheel and double-click edit too) */}
      <div
        ref={laneRef}
        className={s.tuneLane}
        data-hint="seq-tune"
        data-dense={pattern.length > 32 || undefined}
        onPointerDown={(e) => {
          dragging.current = true
          st().pushUndo()
          e.currentTarget.setPointerCapture(e.pointerId)
          setFrom(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (dragging.current) setFrom(e.clientX, e.clientY)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
        onPointerLeave={() => {
          if (!dragging.current) setReadout(null)
        }}
        onDoubleClick={(e) => {
          const step = stepAt(e.clientX)
          if (step !== null) setPitch(step, 0)
        }}
      >
        {track.slice(0, pattern.length).map((step, i) => {
          const pitch = step.pitch ?? 0
          return (
            <span
              key={i}
              className={s.tuneBar}
              data-on={step.on || undefined}
              style={{ '--mag': Math.min(1, Math.abs(pitch) / range) } as React.CSSProperties}
            >
              {step.on && pitch !== 0 ? (
                <>
                  <span
                    className={s.tuneFill}
                    data-dir={pitch > 0 ? 'up' : 'down'}
                    style={{ transform: 'scaleY(var(--mag))' }}
                  />
                  <span className={s.tuneValue} data-dir={pitch > 0 ? 'up' : 'down'}>
                    {pitch > 0 ? `+${pitch}` : pitch}
                  </span>
                </>
              ) : null}
            </span>
          )
        })}
      </div>
    </div>
  )
}
