import { del, get, keys, set } from 'idb-keyval'
import { renderDefaultKit } from '../audio/default-kit'
import { engine } from '../audio/engine'
import { downloadBlob, encodeWav } from '../audio/wav'
import { createPad, seedDemoPattern } from './defaults'
import { type ProjectData, projectSnapshot, useMpc } from './store'
import type { SampleMeta } from './types'

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

export async function loadDefaultKit(bankOffset = 0) {
  const kit = await renderDefaultKit()
  const s = useMpc.getState()
  kit.forEach(({ name, buffer }, i) => {
    const meta = addBuffer(name, buffer)
    s.assignSample(bankOffset + i, meta.id)
  })
  // Sensible kit defaults: hats choke each other, toms get a touch of reverb
  s.setPad(bankOffset + 2, { muteGroup: 1 })
  s.setPad(bankOffset + 3, { muteGroup: 1 })
  for (const pad of [6, 7, 8]) s.setPad(bankOffset + pad, { sendReverb: 0.25 })
  s.setPad(bankOffset + 15, { sendDelay: 0.3, sendReverb: 0.3 })
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
  await loadDefaultKit()
  useMpc.setState((s) => {
    const patterns = s.patterns.slice()
    patterns[0] = seedDemoPattern(structuredClone(patterns[0]!))
    return { patterns }
  })
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
  const used = new Set(project.pads.map((p) => p.sampleId).filter((id): id is string => !!id))
  const samples: Record<string, string> = {}
  for (const id of used) {
    const buffer = engine.getBuffer(id)
    if (buffer) samples[id] = toBase64(encodeWav(buffer))
  }
  const file: ProjectFile = { format: 'mpc-browser', version: 1, project, samples }
  downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), 'project.mpcweb')
  useMpc.getState().flash('Project exported')
}

export async function importProject(file: File) {
  try {
    const parsed: unknown = JSON.parse(await file.text())
    if (!isProjectFile(parsed)) throw new Error('bad file')
    for (const [id, b64] of Object.entries(parsed.samples)) {
      const buffer = await engine.decode(fromBase64(b64))
      engine.setBuffer(id, buffer)
      await saveSample(id, buffer)
    }
    useMpc.getState().loadProject(parsed.project)
    useMpc.getState().flash('Project loaded')
  } catch {
    useMpc.getState().flash('Invalid project file')
  }
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
