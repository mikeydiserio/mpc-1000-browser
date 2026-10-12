import { useRef, useState } from 'react'
import { acidNoteName } from '../../audio/acid'
import { stepsPerBeat } from '../../audio/timing'
import { usePlayhead } from '../../audio/transport'
import { currentPattern, useMpc } from '../../state/store'
import type { AcidStep } from '../../state/types'
import { useTb } from '../tb303/tb-store'
import s from './acid-lane.module.css'

const st = () => useMpc.getState()
const KEYS = 13
/** Black keys of the 13-key range, for the roll's background stripes */
const BLACK = new Set([1, 3, 6, 8, 10])
const OCTAVE_CYCLE: AcidStep['octave'][] = [0, 1, -1]

/**
 * The TB-303 line of the current sequence: a 13-key note roll (C–C) plus octave, accent and
 * slide rows, one column per step, sharing the drum grid's length and swing.
 */
export function AcidLane() {
  const pattern = useMpc((x) => currentPattern(x))
  const patternIndex = useMpc((x) => x.currentPattern)
  const mute = useMpc((x) => x.acid.mute)
  const solo = useMpc((x) => x.acid.solo)
  const write = useTb((t) => t.write)
  const cursor = useTb((t) => t.cursor) % pattern.length
  const playStep = usePlayhead((p) => (p.pattern === patternIndex ? p.step : -1))
  const [readout, setReadout] = useState<string | null>(null)
  const rollRef = useRef<HTMLDivElement>(null)
  const paint = useRef<{ erase: boolean; step: number } | null>(null)
  const { length, bass } = pattern
  const beat = stepsPerBeat(pattern.resolution)

  const locate = (clientX: number, clientY: number) => {
    const r = rollRef.current!.getBoundingClientRect()
    const step = Math.floor(((clientX - r.left) / r.width) * length)
    const note = KEYS - 1 - Math.floor(((clientY - r.top) / r.height) * KEYS)
    if (step < 0 || step >= length) return null
    return { step, note: Math.max(0, Math.min(KEYS - 1, note)) }
  }

  const paintAt = (step: number, note: number) => {
    const p = paint.current
    if (!p) return
    // Fill steps a fast drag skipped, but never repaint the step the drag came from
    const dir = Math.sign(step - p.step)
    const from = dir === 0 ? step : p.step + dir
    for (let i = from; dir >= 0 ? i <= step : i >= step; i += dir || 1) {
      const current = currentPattern(st()).bass[i]!
      if (p.erase) {
        if (current.on) st().setBassStep(i, { on: false })
      } else if (!current.on || current.note !== note) {
        st().setBassStep(i, { on: true, note })
      }
    }
    p.step = step
    setReadout(
      p.erase
        ? `Step ${step + 1}: rest`
        : `Step ${step + 1}: ${acidNoteName({ note, octave: bass[step]!.octave })}`,
    )
  }

  /** Octave / accent / slide rows: click a cell to change that step. */
  const toggle = (row: 'octave' | 'accent' | 'slide', step: number) => {
    const current = bass[step]!
    st().pushUndo()
    if (row === 'octave') {
      const next = OCTAVE_CYCLE[(OCTAVE_CYCLE.indexOf(current.octave) + 1) % OCTAVE_CYCLE.length]!
      st().setBassStep(step, { octave: next })
    } else {
      st().setBassStep(step, { [row]: !current[row] })
    }
  }

  const columns = Array.from({ length }, (_, i) => i)

  return (
    <div className={s.lane} style={{ '--len': length } as React.CSSProperties}>
      <div className={s.head}>
        <span className={s.title}>TB-303</span>
        <b>{readout ?? (write ? `Write → step ${cursor + 1}` : 'Bass line')}</b>
        <span className={s.headBtns}>
          <button
            type="button"
            className={s.ms}
            data-on={mute || undefined}
            aria-pressed={mute}
            data-hint="seq-303-mute"
            aria-label="Mute the TB-303"
            onClick={() => st().setAcid({ mute: !mute })}
          >
            M
          </button>
          <button
            type="button"
            className={s.ms}
            data-solo
            data-on={solo || undefined}
            aria-pressed={solo}
            data-hint="seq-303-mute"
            aria-label="Solo the TB-303"
            onClick={() => st().setAcid({ solo: !solo })}
          >
            S
          </button>
          <button
            type="button"
            className={s.ms}
            data-hint="seq-shift"
            aria-label="Shift the bass line one step earlier"
            onClick={() => st().shiftBass(-1)}
          >
            ◀
          </button>
          <button
            type="button"
            className={s.ms}
            data-hint="seq-shift"
            aria-label="Shift the bass line one step later"
            onClick={() => st().shiftBass(1)}
          >
            ▶
          </button>
        </span>
        <span className={s.rowLabels} aria-hidden>
          <span>Oct</span>
          <span>Acc</span>
          <span>Slide</span>
        </span>
      </div>

      <div className={s.body} data-muted={mute || undefined}>
        <div
          ref={rollRef}
          className={s.roll}
          data-hint="seq-303"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            const at = locate(e.clientX, e.clientY)
            if (!at) return
            e.currentTarget.setPointerCapture(e.pointerId)
            st().pushUndo()
            const current = bass[at.step]!
            // Clicking a note that's already there removes it; otherwise draw notes
            paint.current = { erase: current.on && current.note === at.note, step: at.step }
            useTb.setState({ cursor: at.step })
            paintAt(at.step, at.note)
          }}
          onPointerMove={(e) => {
            const at = locate(e.clientX, e.clientY)
            if (!at) return
            if (paint.current) paintAt(at.step, at.note)
            else
              setReadout(
                `Step ${at.step + 1} · ${acidNoteName({ note: at.note, octave: bass[at.step]!.octave })}`,
              )
          }}
          onPointerUp={() => {
            paint.current = null
          }}
          onPointerLeave={() => {
            if (!paint.current) setReadout(null)
          }}
        >
          {Array.from({ length: KEYS }, (_, k) => (
            <span
              key={k}
              className={s.keyStripe}
              data-black={BLACK.has(KEYS - 1 - k) || undefined}
              aria-hidden
            />
          ))}
          <div className={s.columns}>
            {columns.map((i) => {
              const step = bass[i]!
              return (
                <span
                  key={i}
                  className={s.column}
                  data-beat={i % beat === 0 || undefined}
                  data-cursor={(write && i === cursor) || undefined}
                  data-play={i === playStep || undefined}
                >
                  {step.on ? (
                    <span
                      className={s.note}
                      data-accent={step.accent || undefined}
                      data-slide={step.slide || undefined}
                      style={{ '--note': step.note } as React.CSSProperties}
                      title={acidNoteName(step)}
                    />
                  ) : null}
                </span>
              )
            })}
          </div>
        </div>

        {(['octave', 'accent', 'slide'] as const).map((row) => (
          <div
            key={row}
            className={s.flags}
            data-row={row}
            data-hint={`seq-303-${row}`}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              const r = e.currentTarget.getBoundingClientRect()
              const i = Math.floor(((e.clientX - r.left) / r.width) * length)
              if (i >= 0 && i < length) toggle(row, i)
            }}
          >
            {columns.map((i) => {
              const step = bass[i]!
              const value = row === 'octave' ? step.octave : step[row]
              return (
                <span
                  key={i}
                  className={s.flag}
                  data-set={(value !== 0 && value !== false) || undefined}
                  data-off={!step.on || undefined}
                >
                  {row === 'octave'
                    ? step.octave === 1
                      ? '▲'
                      : step.octave === -1
                        ? '▼'
                        : ''
                    : ''}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
