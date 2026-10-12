import { LINNDRUM } from './linndrum'
import { MPC_FACTORY } from './mpc-factory'
import { TR606 } from './tr606'
import { TR808 } from './tr808'
import { TR909 } from './tr909'
import type { MachineDef, MachineVoice } from './types'

const RATE = 44100
/** Rendered voices are scaled down to this peak if they overshoot, so no pad clips on its own. */
const MAX_PEAK = 0.95

export const MACHINES: MachineDef[] = [TR808, TR909, TR606, LINNDRUM, MPC_FACTORY]

export function machineById(id: string) {
  const machine = MACHINES.find((m) => m.id === id)
  if (!machine) throw new Error(`Unknown drum machine: ${id}`)
  return machine
}

export async function renderVoice(voice: MachineVoice) {
  const ctx = new OfflineAudioContext(1, Math.ceil(RATE * voice.seconds), RATE)
  voice.render(ctx)
  const buffer = await ctx.startRendering()
  const data = buffer.getChannelData(0)
  let peak = 0
  for (const v of data) peak = Math.max(peak, Math.abs(v))
  if (peak > MAX_PEAK) {
    const scale = MAX_PEAK / peak
    for (let i = 0; i < data.length; i++) data[i]! *= scale
  }
  return buffer
}

/** Render every voice of a machine to an AudioBuffer (in parallel, offline). */
export function renderMachine(machine: MachineDef) {
  return Promise.all(
    machine.voices.map(async (voice) => ({ voice, buffer: await renderVoice(voice) })),
  )
}
