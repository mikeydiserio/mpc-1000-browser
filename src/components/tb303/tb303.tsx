import { useState } from 'react'
import { acidNoteName } from '../../audio/acid'
import { engine } from '../../audio/engine'
import { ACID_SCALES, type AcidScale, randomBassLine } from '../../state/acid-gen'
import { createAcidStep, createBassLine } from '../../state/defaults'
import { currentPattern, useMpc } from '../../state/store'
import type { AcidSettings, AcidStep } from '../../state/types'
import { Knob } from '../controls/controls'
import { useTb } from './tb-store'
import s from './tb303.module.css'

const st = () => useMpc.getState()

type KnobKey = 'cutoff' | 'resonance' | 'envMod' | 'decay' | 'accent'
const MAIN_KNOBS: [label: string, key: KnobKey, hint: string][] = [
  ['Cut off freq', 'cutoff', 'tb-cutoff'],
  ['Resonance', 'resonance', 'tb-resonance'],
  ['Env mod', 'envMod', 'tb-envmod'],
  ['Decay', 'decay', 'tb-decay'],
  ['Accent', 'accent', 'tb-accent'],
]

type MixKey = 'drive' | 'sendDelay' | 'sendReverb' | 'volume'
const MIX_KNOBS: [label: string, key: MixKey, hint: string][] = [
  ['Drive', 'drive', 'tb-drive'],
  ['Delay', 'sendDelay', 'tb-delay'],
  ['Reverb', 'sendReverb', 'tb-reverb'],
  ['Volume', 'volume', 'tb-volume'],
]

/** 13-key keyboard, C to C: white keys in order, black keys sit between their neighbours. */
const WHITE = [0, 2, 4, 5, 7, 9, 11, 12]
const BLACK: [note: number, afterWhite: number][] = [
  [1, 0],
  [3, 1],
  [6, 3],
  [8, 4],
  [10, 5],
]

export function Tb303() {
  const acid = useMpc((x) => x.acid)
  const length = useMpc((x) => currentPattern(x).length)
  const bass = useMpc((x) => currentPattern(x).bass)
  const tb = useTb()
  const [scale, setScale] = useState<AcidScale>('minor')
  const set = (partial: Partial<AcidSettings>) => st().setAcid(partial)
  const cursor = tb.cursor % length
  const cursorStep = bass[cursor]

  const press = (note: number) => {
    const t = useTb.getState()
    const step: AcidStep = { on: true, note, octave: t.octave, accent: t.accent, slide: t.slide }
    engine.acidNote(step, engine.ensure().currentTime, 30, false)
    if (t.write) writeAndAdvance(step)
  }

  return (
    <section className={s.panel} aria-label="TB-303 bass line synthesizer" data-hint="tb-panel">
      <div className={s.top}>
        <header className={s.brand}>
          <span className={s.model}>TB-303</span>
          <span className={s.sub}>
            Computer Controlled
            <br />
            Bass Line
          </span>
        </header>

        <div className={s.knobs}>
          <div className={s.waveform} data-hint="tb-wave">
            <span className={s.print}>Waveform</span>
            <fieldset className={s.switch} aria-label="Waveform">
              {(['saw', 'square'] as const).map((wave) => (
                <button
                  key={wave}
                  type="button"
                  aria-pressed={acid.wave === wave}
                  onClick={() => set({ wave })}
                >
                  {wave === 'saw' ? '◿ SAW' : '⊓ SQR'}
                </button>
              ))}
            </fieldset>
          </div>
          <Knob
            tone="black"
            label="Tuning"
            hint="tb-tune"
            value={(acid.tune + 12) / 24}
            defaultValue={0.5}
            valueText={`${acid.tune > 0 ? '+' : ''}${acid.tune} semitones`}
            onChange={(v) => set({ tune: Math.round(v * 24 - 12) })}
          />
          {MAIN_KNOBS.map(([label, key, hint]) => (
            <Knob
              key={key}
              tone="black"
              label={label}
              hint={hint}
              value={acid[key]}
              defaultValue={0.5}
              onChange={(v) => set({ [key]: v })}
            />
          ))}
          <span className={s.divider} aria-hidden />
          {MIX_KNOBS.map(([label, key, hint]) => (
            <Knob
              key={key}
              tone="black"
              label={label}
              hint={hint}
              value={acid[key]}
              defaultValue={key === 'volume' ? 0.7 : 0}
              onChange={(v) => set({ [key]: v })}
            />
          ))}
        </div>
      </div>

      <div className={s.bottom}>
        <div className={s.keyboard} data-hint="tb-keys">
          {WHITE.map((note) => (
            <Key key={note} note={note} kind="white" onPress={press} />
          ))}
          {BLACK.map(([note, after]) => (
            <Key key={note} note={note} kind="black" after={after} onPress={press} />
          ))}
        </div>

        <div className={s.write}>
          <div className={s.buttonRow}>
            <TbButton
              label="Down"
              hint="tb-octave"
              on={tb.octave === -1}
              onPress={() => useTb.setState({ octave: tb.octave === -1 ? 0 : -1 })}
            />
            <TbButton
              label="Up"
              hint="tb-octave"
              on={tb.octave === 1}
              onPress={() => useTb.setState({ octave: tb.octave === 1 ? 0 : 1 })}
            />
            <TbButton
              label="Accent"
              hint="tb-accent-btn"
              on={tb.accent}
              onPress={() => useTb.setState({ accent: !tb.accent })}
            />
            <TbButton
              label="Slide"
              hint="tb-slide-btn"
              on={tb.slide}
              onPress={() => useTb.setState({ slide: !tb.slide })}
            />
          </div>
          <div className={s.buttonRow}>
            <TbButton
              label="Write"
              hint="tb-write"
              on={tb.write}
              variant="red"
              onPress={() => {
                if (!tb.write) st().pushUndo()
                useTb.setState({ write: !tb.write })
              }}
            />
            <TbButton
              label="◀ Step"
              hint="tb-step"
              onPress={() => useTb.setState({ cursor: (cursor - 1 + length) % length })}
            />
            <TbButton
              label="Step ▶"
              hint="tb-step"
              onPress={() => useTb.setState({ cursor: (cursor + 1) % length })}
            />
            <TbButton
              label="Rest"
              hint="tb-rest"
              onPress={() => {
                if (useTb.getState().write) writeAndAdvance(createAcidStep())
              }}
            />
          </div>
          <output className={s.readout} aria-live="polite" data-hint="tb-step">
            <span>
              STEP {String(cursor + 1).padStart(2, '0')}/{length}
            </span>
            <b>
              {cursorStep?.on
                ? `${acidNoteName(cursorStep)}${cursorStep.accent ? ' ACC' : ''}${cursorStep.slide ? ' SLD' : ''}`
                : 'REST'}
            </b>
            <span>{tb.write ? 'WRITE' : 'PLAY'}</span>
          </output>
        </div>

        <div className={s.pattern}>
          <span className={s.printLight}>Pattern</span>
          <div className={s.buttonRow}>
            <TbButton
              label="Random"
              hint="tb-random"
              onPress={() => st().setBassLine(randomBassLine(length, scale))}
            />
            <TbButton
              label="Clear"
              hint="tb-clear"
              onPress={() => st().setBassLine(createBassLine())}
            />
          </div>
          <label className={s.scale} data-hint="tb-random">
            <span className={s.printLight}>Scale</span>
            <select value={scale} onChange={(e) => setScale(e.target.value as AcidScale)}>
              {ACID_SCALES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  )
}

/** Store a step at the write cursor and move on, wrapping at the pattern length. */
function writeAndAdvance(step: AcidStep) {
  const length = currentPattern(st()).length
  const at = useTb.getState().cursor % length
  st().setBassStep(at, step)
  useTb.setState({ cursor: (at + 1) % length })
}

function Key({
  note,
  kind,
  after = 0,
  onPress,
}: {
  note: number
  kind: 'white' | 'black'
  after?: number
  onPress: (note: number) => void
}) {
  const name = acidNoteName({ note, octave: 0 }).replace(/\d/, '')
  return (
    <button
      type="button"
      className={s.key}
      data-kind={kind}
      style={kind === 'black' ? ({ '--after': after } as React.CSSProperties) : undefined}
      aria-label={`Play ${note === 12 ? 'high C' : name}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        onPress(note)
      }}
      onPointerUp={() => engine.acidRelease()}
      onPointerCancel={() => engine.acidRelease()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault()
          onPress(note)
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') engine.acidRelease()
      }}
    >
      {kind === 'white' ? <span>{note === 12 ? 'C' : name}</span> : null}
    </button>
  )
}

function TbButton({
  label,
  on,
  onPress,
  hint,
  variant,
}: {
  label: string
  on?: boolean
  onPress: () => void
  hint: string
  variant?: 'red'
}) {
  return (
    <button
      type="button"
      className={s.btn}
      data-variant={variant}
      data-hint={hint}
      aria-pressed={on === undefined ? undefined : on}
      onClick={onPress}
    >
      {on !== undefined ? <span className={s.led} data-on={on || undefined} /> : null}
      {label}
    </button>
  )
}
