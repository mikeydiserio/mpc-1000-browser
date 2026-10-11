import type { FxSettings, PadParams } from '../state/types'
import { createMixChain, type MixChain } from './mix-chain'
import { scheduleClick, type TriggerOptions, VoicePool } from './voice-pool'

/**
 * Live audio engine. Owns the AudioContext, decoded sample buffers and the voice pool.
 * The AudioContext is created lazily on the first user gesture (browser autoplay policy).
 */
class Engine {
  ctx: AudioContext | null = null
  chain: MixChain | null = null
  private pool: VoicePool | null = null
  private buffers = new Map<string, AudioBuffer>()
  private reversed = new Map<string, AudioBuffer>()
  private pending: { fx: FxSettings; bpm: number; volume: number } | null = null

  /** Returns a running context. Safe to call from any user-gesture handler. */
  ensure(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      this.ctx = ctx
      this.chain = createMixChain(ctx, ctx.destination)
      this.pool = new VoicePool(ctx, this.chain, (id, rev) => this.getBuffer(id, rev))
      if (this.pending) {
        this.chain.update(this.pending.fx, this.pending.bpm)
        this.chain.setVolume(this.pending.volume)
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  get now() {
    return this.ctx?.currentTime ?? 0
  }

  /** Decoding needs a context but must not require a gesture, so use a throwaway one if needed. */
  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ctx ?? new OfflineAudioContext(2, 1, 44100)
    return ctx.decodeAudioData(data)
  }

  setBuffer(id: string, buffer: AudioBuffer) {
    this.buffers.set(id, buffer)
    this.reversed.delete(id)
  }

  hasBuffer(id: string) {
    return this.buffers.has(id)
  }

  deleteBuffer(id: string) {
    this.buffers.delete(id)
    this.reversed.delete(id)
  }

  getBuffer(id: string, reverse = false): AudioBuffer | undefined {
    const buffer = this.buffers.get(id)
    if (!buffer || !reverse) return buffer
    let rev = this.reversed.get(id)
    if (!rev) {
      rev = reverseBuffer(buffer)
      this.reversed.set(id, rev)
    }
    return rev
  }

  allBuffers() {
    return this.buffers
  }

  trigger(pad: number, pads: PadParams[], opts: TriggerOptions, when?: number) {
    const ctx = this.ensure()
    this.pool?.trigger(pad, pads, when ?? ctx.currentTime, opts)
  }

  release(pad: number, when?: number) {
    if (!this.ctx) return
    this.pool?.release(pad, when ?? this.ctx.currentTime)
  }

  stopAll() {
    if (!this.ctx) return
    this.pool?.stopAll(this.ctx.currentTime)
  }

  click(when: number, accent: boolean) {
    if (this.ctx && this.chain) scheduleClick(this.ctx, this.chain.master, when, accent)
  }

  updateMix(fx: FxSettings, bpm: number, volume: number) {
    this.pending = { fx, bpm, volume }
    if (!this.chain) return
    this.chain.update(fx, bpm)
    this.chain.setVolume(volume)
  }
}

export function reverseBuffer(buffer: AudioBuffer) {
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch).slice().reverse()
    out.copyToChannel(data, ch)
  }
  return out
}

export const engine = new Engine()
