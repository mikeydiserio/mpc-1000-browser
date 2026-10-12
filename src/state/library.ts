import { del, get, keys, set } from 'idb-keyval'
import { engine } from '../audio/engine'
import { downloadBlob, encodeWav } from '../audio/wav'
import { createPad } from './defaults'
import { loadMachine } from './machines'
import { type ProjectData, projectSnapshot, useMpc } from './store'
import type { PadParams, SampleMeta } from './types'

const PROJECT_KEY = 'mpc:project'
const SAMPLE_PREFIX = 'mpc:sample:'

interface StoredSample {
  sampleRate: number
  channels: Float32Array<ArrayBuffer>[]
}

function newId() {
  return crypto.randomUUID().slice(0, 8)
}

/** Register a decoded buffer as a sample in the engine, the store and IndexedDB. */
export function addBuffer(name: string, buffer: AudioBuffer, persist = true): SampleMeta {
  const meta: SampleMeta = {
    id: newId(),
    name: name.replace(/\.[^.]+$/, '').slice(0, 16),
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
  }
  engine.setBuffer(meta.id, buffer)
  useMpc.getState().addSample(meta)
  if (persist) void saveSample(meta.id, buffer)
  return meta
}

async function saveSample(id: string, buffer: AudioBuffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) =>
    buffer.getChannelData(ch).slice(),
  )
  await set(SAMPLE_PREFIX + id, { sampleRate: buffer.sampleRate, channels } satisfies StoredSample)
}

export async function loadFileToPad(file: File, pad: number) {
  try {
    const buffer = await engine.decode(await file.arrayBuffer())
    const meta = addBuffer(file.name, buffer)
    useMpc.getState().assignSample(pad, meta.id)
    useMpc.getState().flash(`Loaded ${meta.name}`)
    return meta
  } catch {
    useMpc.getState().flash(`Can't decode ${file.name.slice(0, 14)}`)
    return null
  }
}

/** Drop several files at once: they fill consecutive pads starting at `firstPad`. */
export async function loadFilesToPads(files: File[], firstPad: number) {
  const audio = files.filter(
    (f) => f.type.startsWith('audio/') || /\.(wav|mp3|ogg|flac|aif+|m4a)$/i.test(f.name),
  )
  for (let i = 0; i < audio.length; i++) await loadFileToPad(audio[i]!, (firstPad + i) % 64)
}

// ─── Autosave ────────────────────────────────────────────────────────────────

export async function restoreSession(): Promise<boolean> {
  const project = await get<ProjectData>(PROJECT_KEY)
  if (!project) return false
  const ids = Object.keys(project.samples)
  const stored = await Promise.all(ids.map((id) => get<StoredSample>(SAMPLE_PREFIX + id)))
  ids.forEach((id, i) => {
    const s = stored[i]
    if (!s) return
    const buffer = new AudioBuffer({
      length: s.channels[0]!.length,
      numberOfChannels: s.channels.length,
      sampleRate: s.sampleRate,
    })
    s.channels.forEach((data, ch) => {
      buffer.copyToChannel(data, ch)
    })
    engine.setBuffer(id, buffer)
  })
  // Drop references to samples whose audio didn't survive (failed load or garbage-collected)
  project.samples = Object.fromEntries(
    Object.entries(project.samples).filter(([id]) => engine.hasBuffer(id)),
  )
  project.pads = project.pads.map((p) =>
    p.sampleId && !engine.hasBuffer(p.sampleId) ? { ...p, sampleId: null } : p,
  )
  useMpc.getState().loadProject(project)
  void collectGarbage(project)
  return true
}

/** Remove stored samples no pad references any more. */
async function collectGarbage(project: ProjectData) {
  const used = new Set(project.pads.map((p) => p.sampleId).filter(Boolean))
  for (const key of await keys()) {
    const k = String(key)
    if (k.startsWith(SAMPLE_PREFIX) && !used.has(k.slice(SAMPLE_PREFIX.length))) await del(k)
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

export function saveNow() {
  clearTimeout(saveTimer)
  void set(PROJECT_KEY, projectSnapshot(useMpc.getState()))
}

export function startAutosave() {
  return useMpc.subscribe((state, prev) => {
    if (
      state.pads === prev.pads &&
      state.patterns === prev.patterns &&
      state.samples === prev.samples &&
      state.fx === prev.fx &&
      state.master === prev.master &&
      state.bpm === prev.bpm &&
      state.song === prev.song &&
      state.qlinks === prev.qlinks &&
      state.mutes === prev.mutes
    ) {
      return
    }
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveNow, 600)
  })
}

export async function newProject() {
  // Wipe stored audio from the previous project before laying down the factory kit
  for (const key of await keys()) if (String(key).startsWith(SAMPLE_PREFIX)) await del(key)
  for (const id of Object.keys(useMpc.getState().samples)) engine.deleteBuffer(id)
  useMpc.getState().loadProject({
    ...projectSnapshot(useMpc.getState()),
    pads: Array.from({ length: 64 }, () => createPad()),
    samples: {},
    patterns: useMpc.getInitialState().patterns,
  })
  await loadMachine('mpc')
}

// ─── Project files ───────────────────────────────────────────────────────────

interface ProjectFile {
  format: 'mpc-browser'
  version: 1
  project: ProjectData
  samples: Record<string, string>
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

function fromBase64(b64: string) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function exportProject() {
  const project = projectSnapshot(useMpc.getState())
  const samples = encodeUsedSamples(project.pads)
  const file: ProjectFile = { format: 'mpc-browser', version: 1, project, samples }
  downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), 'project.mpcweb')
  useMpc.getState().flash('Project exported')
}

/** Kit = all 64 pads with their samples and settings, without sequences. */
interface KitFile {
  format: 'mpc-browser-kit'
  version: 1
  pads: PadParams[]
  meta: Record<string, SampleMeta>
  samples: Record<string, string>
}

function encodeUsedSamples(pads: PadParams[]) {
  const used = new Set(pads.map((p) => p.sampleId).filter((id): id is string => !!id))
  const samples: Record<string, string> = {}
  for (const id of used) {
    const buffer = engine.getBuffer(id)
    if (buffer) samples[id] = toBase64(encodeWav(buffer))
  }
  return samples
}

export function exportKit() {
  const s = useMpc.getState()
  const samples = encodeUsedSamples(s.pads)
  const meta = Object.fromEntries(Object.keys(samples).map((id) => [id, s.samples[id]!]))
  const file: KitFile = { format: 'mpc-browser-kit', version: 1, pads: s.pads, meta, samples }
  downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), 'kit.mpckit')
  s.flash('Kit exported')
}

async function restoreSamples(samples: Record<string, string>) {
  for (const [id, b64] of Object.entries(samples)) {
    const buffer = await engine.decode(fromBase64(b64))
    engine.setBuffer(id, buffer)
    await saveSample(id, buffer)
  }
}

/** Opens either a full project (.mpcweb) or a kit (.mpckit — replaces pads, keeps sequences). */
export async function importFile(file: File) {
  const s = useMpc.getState()
  try {
    const parsed: unknown = JSON.parse(await file.text())
    if (isProjectFile(parsed)) {
      await restoreSamples(parsed.samples)
      s.loadProject(parsed.project)
      s.flash('Project loaded')
    } else if (isKitFile(parsed)) {
      await restoreSamples(parsed.samples)
      useMpc.setState((x) => ({
        samples: { ...x.samples, ...parsed.meta },
        pads: parsed.pads.map((p) => ({ ...createPad(), ...p })),
      }))
      s.flash('Kit loaded')
    } else {
      throw new Error('unknown file')
    }
  } catch {
    s.flash('Not a project or kit file')
  }
}

function isKitFile(value: unknown): value is KitFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'format' in value &&
    value.format === 'mpc-browser-kit' &&
    'pads' in value &&
    Array.isArray(value.pads)
  )
}

function isProjectFile(value: unknown): value is ProjectFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'format' in value &&
    value.format === 'mpc-browser' &&
    'project' in value &&
    'samples' in value
  )
}
