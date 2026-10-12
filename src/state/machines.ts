import { create } from 'zustand'
import { machineById, renderMachine, renderVoice } from '../audio/machines/registry'
import type { MachineDef, MachineVoice } from '../audio/machines/types'
import { createAcid, createAcidStep, createPad, createPattern } from './defaults'
import { addBuffer } from './library'
import { useMpc } from './store'
import { type AcidStep, PAD_COUNT, PADS_PER_BANK, type Pattern, type Step } from './types'

/** Which machine is loading / was loaded last, for button states. */
export const useMachines = create<{ busy: string | null; loaded: string | null }>(() => ({
  busy: null,
  loaded: null,
}))

const VELOCITY: Record<string, number> = { X: 127, x: 100, o: 60 }

function buildPattern(machine: MachineDef, index: number): Pattern {
  const def = machine.patterns[index]!
  const pattern = createPattern(index)
  pattern.name = def.name
  pattern.length = def.length
  pattern.resolution = def.resolution ?? '1/16'
  pattern.swing = machine.swing
  for (const [id, steps] of Object.entries(def.tracks)) {
    const pad = machine.voices.findIndex((v) => v.id === id)
    if (pad === -1)
      throw new Error(`${machine.name} pattern "${def.name}" uses unknown voice ${id}`)
    pattern.tracks[pad] = pattern.tracks[pad]!.map((step: Step, i) => {
      const velocity = VELOCITY[steps[i] ?? '.']
      return velocity ? { on: true, velocity } : step
    })
  }
  if (def.bass) pattern.bass = parseBass(def.bass, pattern.bass, `${machine.name} "${def.name}"`)
  return pattern
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', "C'"]

/** Parse a bassline written as tokens like `C>` `D#~` `A#v` `.` (see MachinePattern.bass). */
export function parseBass(line: string, into: AcidStep[], where: string): AcidStep[] {
  const bass = into.slice()
  line
    .trim()
    .split(/\s+/)
    .forEach((token, i) => {
      if (token === '.') return
      const match = /^([A-G]#?'?)([\^v>~]*)$/.exec(token)
      const note = match ? NOTES.indexOf(match[1]!) : -1
      if (!match || note === -1) throw new Error(`${where}: bad bass token "${token}"`)
      const flags = match[2]!
      bass[i] = {
        ...createAcidStep(),
        on: true,
        note,
        octave: flags.includes('^') ? 1 : flags.includes('v') ? -1 : 0,
        accent: flags.includes('>'),
        slide: flags.includes('~'),
      }
    })
  return bass
}

/**
 * Load a classic drum machine. `kitOnly` puts the 16 sounds on the chosen bank and leaves the
 * sequences alone; otherwise the kit goes on bank A and the machine's grooves, tempo, swing
 * and song chain replace the current sequences.
 */
export async function loadMachine(id: string, opts: { kitOnly?: boolean; bank?: number } = {}) {
  if (useMachines.getState().busy) return
  const machine = machineById(id)
  useMachines.setState({ busy: id })
  useMpc.getState().flash(`Building ${machine.name}…`)
  try {
    const rendered = await renderMachine(machine)
    const s = useMpc.getState()
    const bank = opts.kitOnly ? (opts.bank ?? s.bank) : 0
    const pads = s.pads.slice()
    for (let i = 0; i < PADS_PER_BANK; i++) {
      const voice = rendered[i]
      const meta = voice ? addBuffer(voice.voice.name, voice.buffer) : null
      pads[bank * PADS_PER_BANK + i] = { ...createPad(meta?.id ?? null), ...voice?.voice.pad }
    }

    if (opts.kitOnly) {
      useMpc.setState({ pads })
      s.flash(`${machine.name} kit → bank ${'ABCD'[bank]}`)
    } else {
      const patterns = Array.from({ length: s.patterns.length }, (_, i) =>
        i < machine.patterns.length ? buildPattern(machine, i) : createPattern(i),
      )
      useMpc.setState({
        pads,
        patterns,
        bpm: machine.bpm,
        acid: { ...createAcid(), ...machine.acid },
        song: machine.song,
        songMode: false,
        songPosition: 0,
        currentPattern: 0,
        queuedPattern: null,
        bank: 0,
        selectedPad: 0,
        undoStack: [],
        mutes: Array(PAD_COUNT).fill(false),
        solos: Array(PAD_COUNT).fill(false),
      })
      const n = machine.patterns.length
      s.flash(`${machine.name} loaded — ${n} groove${n === 1 ? '' : 's'}`)
    }
    useMachines.setState({ loaded: id })
  } finally {
    useMachines.setState({ busy: null })
  }
}

// ─── Single voices (sound browser) ───────────────────────────────────────────

const voiceBuffers = new Map<string, Promise<AudioBuffer>>()
/** Sample ids already created from a machine voice, so browsing doesn't pile up copies. */
const voiceSamples = new Map<string, string>()

/** Render one machine voice (cached for the session). */
export function machineVoiceBuffer(machine: MachineDef, voice: MachineVoice) {
  const key = `${machine.id}/${voice.id}`
  let buffer = voiceBuffers.get(key)
  if (!buffer) {
    buffer = renderVoice(voice)
    voiceBuffers.set(key, buffer)
  }
  return buffer
}

/** Put one drum-machine voice on a pad, keeping the pad's other settings. */
export async function assignMachineVoice(machine: MachineDef, voice: MachineVoice, pad: number) {
  const key = `${machine.id}/${voice.id}`
  const buffer = await machineVoiceBuffer(machine, voice)
  const s = useMpc.getState()
  let id = voiceSamples.get(key)
  if (!id || !s.samples[id]) {
    id = addBuffer(voice.name, buffer).id
    voiceSamples.set(key, id)
  }
  s.assignSample(pad, id)
  return buffer
}
