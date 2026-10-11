import { create } from 'zustand'
import {
  clonePattern,
  createFx,
  createMaster,
  createPad,
  createPattern,
  createQLinks,
  createTrack,
} from './defaults'
import {
  type Division,
  type FxSettings,
  type LcdMode,
  MAX_STEPS,
  type MasterSettings,
  MIN_STEPS,
  PAD_COUNT,
  PATTERN_COUNT,
  type PadParams,
  type Pattern,
  type QLinkSlider,
  type RecordState,
  type SampleMeta,
  type Step,
} from './types'

export interface SixteenLevels {
  on: boolean
  param: 'velocity' | 'tune'
  source: number
}

export interface MpcState {
  pads: PadParams[]
  samples: Record<string, SampleMeta>
  patterns: Pattern[]
  currentPattern: number
  queuedPattern: number | null
  songMode: boolean
  song: number[]
  songPosition: number
  bpm: number
  playing: boolean
  record: RecordState
  bank: number
  selectedPad: number
  mode: LcdMode
  page: number
  cursor: number
  fullLevel: boolean
  sixteenLevels: SixteenLevels
  trackMuteMode: boolean
  modeSelect: boolean
  noteRepeat: boolean
  noteRepeatRate: Division
  shift: boolean
  erase: boolean
  mutes: boolean[]
  solos: boolean[]
  fx: FxSettings
  master: MasterSettings
  qlinks: QLinkSlider[]
  undoStack: { index: number; pattern: Pattern }[]
  message: string | null
  midiInputId: string | null
}

interface MpcActions {
  set: (partial: Partial<MpcState>) => void
  setPad: (index: number, partial: Partial<PadParams>) => void
  setRetrigger: (index: number, partial: Partial<PadParams['retrigger']>) => void
  addSample: (meta: SampleMeta) => void
  assignSample: (pad: number, sampleId: string, region?: { start: number; end: number }) => void
  selectPad: (index: number) => void
  setMode: (mode: LcdMode) => void
  setStep: (pad: number, step: number, value: Partial<Step>) => void
  toggleStep: (pad: number, step: number, velocity?: number) => void
  setPatternProp: <K extends 'length' | 'resolution' | 'swing' | 'name'>(
    key: K,
    value: Pattern[K],
  ) => void
  selectPattern: (index: number) => void
  clearTrack: (pad: number) => void
  clearPattern: () => void
  copyPatternTo: (target: number) => void
  doublePattern: () => void
  pushUndo: () => void
  undo: () => void
  setFx: (partial: Partial<FxSettings>) => void
  setMaster: (partial: Partial<MasterSettings>) => void
  setQLink: (index: number, partial: Partial<QLinkSlider>) => void
  toggleMute: (pad: number) => void
  toggleSolo: (pad: number) => void
  flash: (text: string) => void
  loadProject: (project: ProjectData) => void
}

export interface ProjectData {
  pads: PadParams[]
  samples: Record<string, SampleMeta>
  patterns: Pattern[]
  song: number[]
  bpm: number
  fx: FxSettings
  master: MasterSettings
  qlinks: QLinkSlider[]
  mutes: boolean[]
}

const UNDO_LIMIT = 40
let flashTimer: ReturnType<typeof setTimeout> | undefined

function initialState(): MpcState {
  return {
    pads: Array.from({ length: PAD_COUNT }, () => createPad()),
    samples: {},
    patterns: Array.from({ length: PATTERN_COUNT }, (_, i) => createPattern(i)),
    currentPattern: 0,
    queuedPattern: null,
    songMode: false,
    song: [0, 0, 1, 1],
    songPosition: 0,
    bpm: 92,
    playing: false,
    record: 'off',
    bank: 0,
    selectedPad: 0,
    mode: 'main',
    page: 0,
    cursor: 0,
    fullLevel: false,
    sixteenLevels: { on: false, param: 'velocity', source: 0 },
    trackMuteMode: false,
    modeSelect: false,
    noteRepeat: false,
    noteRepeatRate: '1/16',
    shift: false,
    erase: false,
    mutes: Array(PAD_COUNT).fill(false),
    solos: Array(PAD_COUNT).fill(false),
    fx: createFx(),
    master: createMaster(),
    qlinks: createQLinks(),
    undoStack: [],
    message: null,
    midiInputId: null,
  }
}

export const useMpc = create<MpcState & MpcActions>()((set, get) => {
  /** Immutable update of the current pattern. */
  const updatePattern = (fn: (p: Pattern) => Pattern) =>
    set((s) => {
      const patterns = s.patterns.slice()
      patterns[s.currentPattern] = fn(patterns[s.currentPattern]!)
      return { patterns }
    })

  const updateTrack = (pad: number, fn: (track: Step[]) => Step[]) =>
    updatePattern((p) => {
      const tracks = p.tracks.slice()
      tracks[pad] = fn(tracks[pad]!.slice())
      return { ...p, tracks }
    })

  return {
    ...initialState(),

    set: (partial) => set(partial),

    setPad: (index, partial) =>
      set((s) => {
        const pads = s.pads.slice()
        pads[index] = { ...pads[index]!, ...partial }
        return { pads }
      }),

    setRetrigger: (index, partial) =>
      set((s) => {
        const pads = s.pads.slice()
        const pad = pads[index]!
        pads[index] = { ...pad, retrigger: { ...pad.retrigger, ...partial } }
        return { pads }
      }),

    addSample: (meta) => set((s) => ({ samples: { ...s.samples, [meta.id]: meta } })),

    assignSample: (pad, sampleId, region) =>
      get().setPad(pad, { sampleId, start: region?.start ?? 0, end: region?.end ?? 1 }),

    selectPad: (index) => set({ selectedPad: index }),

    setMode: (mode) => set({ mode, page: 0, cursor: 0, modeSelect: false }),

    setStep: (pad, step, value) =>
      updateTrack(pad, (track) => {
        track[step] = { ...track[step]!, ...value }
        return track
      }),

    toggleStep: (pad, step, velocity = 100) =>
      updateTrack(pad, (track) => {
        const current = track[step]!
        track[step] = current.on ? { ...current, on: false } : { on: true, velocity }
        return track
      }),

    setPatternProp: (key, value) => {
      if (key === 'length') {
        const length = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.round(Number(value) / 8) * 8))
        updatePattern((p) => ({ ...p, length }))
        return
      }
      updatePattern((p) => ({ ...p, [key]: value }))
    },

    selectPattern: (index) => {
      const i = (index + PATTERN_COUNT) % PATTERN_COUNT
      if (get().playing) set({ queuedPattern: i })
      else set({ currentPattern: i, queuedPattern: null })
    },

    clearTrack: (pad) => {
      get().pushUndo()
      updateTrack(pad, () => createTrack())
    },

    clearPattern: () => {
      get().pushUndo()
      updatePattern((p) => ({ ...p, tracks: p.tracks.map(() => createTrack()) }))
    },

    copyPatternTo: (target) =>
      set((s) => {
        const patterns = s.patterns.slice()
        const copy = clonePattern(s.patterns[s.currentPattern]!)
        copy.name = patterns[target]!.name
        patterns[target] = copy
        return { patterns }
      }),

    /** Duplicate the active steps into the second half (8 → 16 → 32 → 64). */
    doublePattern: () => {
      const p = get().patterns[get().currentPattern]!
      if (p.length * 2 > MAX_STEPS) return
      get().pushUndo()
      updatePattern((pat) => ({
        ...pat,
        length: pat.length * 2,
        tracks: pat.tracks.map((track) =>
          track.map((step, i) =>
            i >= pat.length && i < pat.length * 2 ? { ...track[i - pat.length]! } : step,
          ),
        ),
      }))
    },

    pushUndo: () =>
      set((s) => ({
        undoStack: [
          ...s.undoStack.slice(-UNDO_LIMIT + 1),
          { index: s.currentPattern, pattern: clonePattern(s.patterns[s.currentPattern]!) },
        ],
      })),

    undo: () =>
      set((s) => {
        const last = s.undoStack[s.undoStack.length - 1]
        if (!last) return {}
        const patterns = s.patterns.slice()
        patterns[last.index] = last.pattern
        return { patterns, undoStack: s.undoStack.slice(0, -1), currentPattern: last.index }
      }),

    setFx: (partial) => set((s) => ({ fx: { ...s.fx, ...partial } })),
    setMaster: (partial) => set((s) => ({ master: { ...s.master, ...partial } })),

    setQLink: (index, partial) =>
      set((s) => {
        const qlinks = s.qlinks.slice()
        qlinks[index] = { ...qlinks[index]!, ...partial }
        return { qlinks }
      }),

    toggleMute: (pad) =>
      set((s) => {
        const mutes = s.mutes.slice()
        mutes[pad] = !mutes[pad]
        return { mutes }
      }),

    toggleSolo: (pad) =>
      set((s) => {
        const solos = s.solos.slice()
        solos[pad] = !solos[pad]
        return { solos }
      }),

    flash: (text) => {
      clearTimeout(flashTimer)
      set({ message: text })
      flashTimer = setTimeout(() => set({ message: null }), 1600)
    },

    loadProject: (project) =>
      set({
        pads: project.pads,
        samples: project.samples,
        patterns: project.patterns,
        song: project.song,
        bpm: project.bpm,
        fx: project.fx,
        master: project.master,
        qlinks: project.qlinks,
        mutes: project.mutes,
        currentPattern: 0,
        queuedPattern: null,
        undoStack: [],
      }),
  }
})

export function projectSnapshot(s: MpcState): ProjectData {
  return {
    pads: s.pads,
    samples: s.samples,
    patterns: s.patterns,
    song: s.song,
    bpm: s.bpm,
    fx: s.fx,
    master: s.master,
    qlinks: s.qlinks,
    mutes: s.mutes,
  }
}

export const currentPattern = (s: MpcState) => s.patterns[s.currentPattern]!
