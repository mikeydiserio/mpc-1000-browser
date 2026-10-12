import type { MpcState } from '../state/store'
import { engine } from './engine'
import { createMixChain } from './mix-chain'
import { stepSeconds, swingOffset } from './timing'
import { VoicePool } from './voice-pool'
import { encodeWav } from './wav'

const RATE = 44100
const TAIL = 2

/**
 * Offline bounce of the current sequence (looped) or the whole song chain, through the same
 * voice pool and mix chain the live engine uses.
 */
export async function bounce(state: MpcState, loops: number): Promise<Blob> {
  const order =
    state.songMode && state.song.length ? state.song : Array(loops).fill(state.currentPattern)
  const events: { pad: number; time: number; velocity: number; gate: number; pitch: number }[] = []
  const anySolo = state.solos.some(Boolean)
  let t = 0
  for (const index of order) {
    const pattern = state.patterns[index]!
    const stepDur = stepSeconds(pattern.resolution, state.bpm)
    for (let step = 0; step < pattern.length; step++) {
      const at = t + step * stepDur + swingOffset(step, pattern.swing, stepDur)
      pattern.tracks.forEach((track, pad) => {
        const st = track[step]!
        if (!st.on || state.mutes[pad] || (anySolo && !state.solos[pad])) return
        events.push({
          pad,
          time: Math.max(0, at + (st.offset ?? 0) * stepDur),
          velocity: st.velocity,
          gate: stepDur * 0.95,
          pitch: st.pitch ?? 0,
        })
      })
    }
    t += pattern.length * stepDur
  }

  const ctx = new OfflineAudioContext(2, Math.ceil((t + TAIL) * RATE), RATE)
  const chain = createMixChain(ctx, ctx.destination)
  chain.update(state.fx, state.bpm)
  chain.master.gain.value = state.master.volume * state.master.volume
  const pool = new VoicePool(ctx, chain, (id, rev) => engine.getBuffer(id, rev))
  for (const e of events) {
    pool.trigger(e.pad, state.pads, e.time + 0.01, {
      velocity: e.velocity,
      bpm: state.bpm,
      gate: e.gate,
      pitchOffset: e.pitch,
    })
  }
  const rendered = await ctx.startRendering()
  return new Blob([encodeWav(rendered)], { type: 'audio/wav' })
}
