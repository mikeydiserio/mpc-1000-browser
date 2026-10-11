import { pressPad, releasePad } from '../state/pad-input'
import { useMpc } from '../state/store'

/** MPC default: PAD1 = note 37 (C#1). Notes 37..52 map to the 16 pads of the active bank. */
const FIRST_NOTE = 37

let access: MIDIAccess | null = null

export async function initMidi(): Promise<MIDIInput[]> {
  if (!('requestMIDIAccess' in navigator)) return []
  try {
    access ??= await navigator.requestMIDIAccess()
  } catch {
    return []
  }
  access.onstatechange = () => bindInput(useMpc.getState().midiInputId)
  return [...access.inputs.values()]
}

export function listMidiInputs() {
  return access ? [...access.inputs.values()] : []
}

export function bindInput(id: string | null) {
  if (!access) return
  for (const input of access.inputs.values()) {
    // `null` = listen to every connected input
    input.onmidimessage = id === null || input.id === id ? onMessage : null
  }
}

function onMessage(e: MIDIMessageEvent) {
  const data = e.data
  if (!data || data.length < 3) return
  const status = data[0]! & 0xf0
  const note = data[1]!
  const velocity = data[2]!
  const position = note - FIRST_NOTE
  if (position < 0 || position > 15) return
  if (status === 0x90 && velocity > 0) pressPad(position, velocity)
  else if (status === 0x80 || (status === 0x90 && velocity === 0)) releasePad(position)
}
