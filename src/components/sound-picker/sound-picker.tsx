import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import { MACHINES } from '../../audio/machines/registry'
import type { MachineDef, MachineVoice } from '../../audio/machines/types'
import { padLabel } from '../../state/format'
import { loadFileToPad } from '../../state/library'
import { assignMachineVoice, machineVoiceBuffer, useMachines } from '../../state/machines'
import { AUDIO_ACCEPT, pickFiles } from '../../state/pick-files'
import { useMpc } from '../../state/store'
import { PAD_COUNT } from '../../state/types'
import { closeSoundPicker, openSoundPicker, usePicker } from './picker-store'
import s from './sound-picker.module.css'

const MACHINE_TAGS: Record<string, string> = {
  tr808: '808',
  tr909: '909',
  tr606: '606',
  linndrum: 'LINN',
  mpc: 'MPC',
}

/**
 * Sound browser for one pad: every sample in the project plus every drum-machine voice.
 * Choosing a sound assigns it and plays it, so you can step through sounds by ear.
 */
export function SoundPicker() {
  const pad = usePicker((p) => p.pad)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (pad !== null && !dialog.open) dialog.showModal()
    if (pad === null && dialog.open) dialog.close()
  }, [pad])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Esc closes natively
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="picker-title"
      onClose={closeSoundPicker}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSoundPicker()
      }}
    >
      {pad === null ? null : <PickerBody pad={pad} />}
    </dialog>
  )
}

/** Up/Down move between the options of a list, like scrolling a browser on the hardware. */
function moveFocus(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const options = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-option]')]
  const index = options.indexOf(document.activeElement as HTMLElement)
  const next = options[index + (e.key === 'ArrowDown' ? 1 : -1)]
  if (!next) return
  e.preventDefault()
  next.focus()
  next.scrollIntoView({ block: 'nearest' })
}

function PickerBody({ pad }: { pad: number }) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(() => useMachines.getState().loaded ?? MACHINES[0]!.id)
  const [busy, setBusy] = useState<string | null>(null)
  const samples = useMpc((x) => x.samples)
  const pads = useMpc((x) => x.pads)
  const current = pads[pad]?.sampleId ?? null
  const currentName = current ? (samples[current]?.name ?? '—') : '(empty)'

  const q = query.trim().toLowerCase()
  const matches = (...names: string[]) => !q || names.some((n) => n.toLowerCase().includes(q))

  const usage = new Map<string, number[]>()
  pads.forEach((p, i) => {
    if (p.sampleId) usage.set(p.sampleId, [...(usage.get(p.sampleId) ?? []), i])
  })
  const projectSamples = Object.values(samples)
    .filter((m) => matches(m.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const machineGroups: { machine: MachineDef; voices: MachineVoice[] }[] = q
    ? MACHINES.map((machine) => ({
        machine,
        voices: machine.voices.filter((v) => matches(v.name, machine.name)),
      })).filter((g) => g.voices.length > 0)
    : MACHINES.filter((m) => m.id === tab).map((machine) => ({ machine, voices: machine.voices }))

  const chooseSample = (id: string) => {
    useMpc.getState().assignSample(pad, id)
    const buffer = engine.getBuffer(id)
    if (buffer) engine.audition(buffer)
  }

  const runVoice = async (machine: MachineDef, voice: MachineVoice, assign: boolean) => {
    const key = `${machine.id}/${voice.id}`
    setBusy(key)
    try {
      const buffer = assign
        ? await assignMachineVoice(machine, voice, pad)
        : await machineVoiceBuffer(machine, voice)
      engine.audition(buffer)
    } finally {
      setBusy((b) => (b === key ? null : b))
    }
  }

  const step = (delta: number) => openSoundPicker((pad + delta + PAD_COUNT) % PAD_COUNT)

  return (
    <div className={s.panel}>
      <header className={s.header}>
        <div className={s.target}>
          <button
            type="button"
            className={s.btn}
            aria-label="Previous pad"
            onClick={() => step(-1)}
          >
            ◀
          </button>
          <div>
            <h1 id="picker-title">Sound for PAD {padLabel(pad)}</h1>
            <p aria-live="polite">
              Now: <strong>{currentName}</strong>
            </p>
          </div>
          <button type="button" className={s.btn} aria-label="Next pad" onClick={() => step(1)}>
            ▶
          </button>
        </div>
        <input
          className={s.search}
          type="search"
          placeholder="Search sounds…"
          aria-label="Search sounds"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className={s.btn} onClick={closeSoundPicker}>
          Done
        </button>
      </header>

      <div className={s.body}>
        <section className={s.column} aria-labelledby="picker-project">
          <h2 id="picker-project">In this project</h2>
          {projectSamples.length === 0 ? (
            <p className={s.empty}>{q ? 'No matching samples.' : 'No samples loaded yet.'}</p>
          ) : (
            <ul className={s.list} onKeyDown={moveFocus}>
              {projectSamples.map((meta) => {
                const used = usage.get(meta.id) ?? []
                return (
                  <li
                    key={meta.id}
                    className={s.row}
                    data-current={meta.id === current || undefined}
                  >
                    <button
                      type="button"
                      className={s.choose}
                      data-option
                      aria-pressed={meta.id === current}
                      onClick={() => chooseSample(meta.id)}
                    >
                      <span className={s.name}>{meta.name}</span>
                      <span className={s.meta}>
                        {meta.duration.toFixed(2)}s
                        {used.length ? ` · ${used.slice(0, 3).map(padLabel).join(' ')}` : ''}
                        {used.length > 3 ? ' …' : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={s.play}
                      aria-label={`Preview ${meta.name}`}
                      onClick={() => {
                        const buffer = engine.getBuffer(meta.id)
                        if (buffer) engine.audition(buffer)
                      }}
                    >
                      ▶
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className={s.column} aria-labelledby="picker-machines">
          <h2 id="picker-machines">Drum machines</h2>
          {q ? null : (
            <fieldset className={s.tabs} aria-label="Machine">
              {MACHINES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={s.tab}
                  aria-pressed={m.id === tab}
                  onClick={() => setTab(m.id)}
                  title={m.name}
                >
                  {MACHINE_TAGS[m.id] ?? m.name}
                </button>
              ))}
            </fieldset>
          )}
          {machineGroups.length === 0 ? <p className={s.empty}>No matching voices.</p> : null}
          {machineGroups.map(({ machine, voices }) => (
            <div key={machine.id}>
              {q ? <h3 className={s.groupTitle}>{machine.name}</h3> : null}
              <ul className={s.list} onKeyDown={moveFocus}>
                {voices.map((voice) => {
                  const key = `${machine.id}/${voice.id}`
                  return (
                    <li key={key} className={s.row}>
                      <button
                        type="button"
                        className={s.choose}
                        data-option
                        aria-busy={busy === key}
                        onClick={() => void runVoice(machine, voice, true)}
                      >
                        <span className={s.name}>{voice.name}</span>
                        <span className={s.meta}>{busy === key ? 'rendering…' : machine.name}</span>
                      </button>
                      <button
                        type="button"
                        className={s.play}
                        aria-label={`Preview ${voice.name}`}
                        onClick={() => void runVoice(machine, voice, false)}
                      >
                        ▶
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      </div>

      <footer className={s.footer}>
        <p>
          Click a sound to put it on the pad and hear it · ▶ previews only · ↑↓ step through the
          list · ◀ ▶ change pad
        </p>
        <div className={s.actions}>
          <button
            type="button"
            className={s.btn}
            onClick={async () => {
              const [file] = await pickFiles(AUDIO_ACCEPT)
              if (file) await loadFileToPad(file, pad)
            }}
          >
            Load file…
          </button>
          <button
            type="button"
            className={s.btn}
            disabled={!current}
            onClick={() => useMpc.getState().setPad(pad, { sampleId: null })}
          >
            Clear pad
          </button>
        </div>
      </footer>
    </div>
  )
}
