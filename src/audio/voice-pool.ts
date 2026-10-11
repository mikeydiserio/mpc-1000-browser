import type { PadParams } from '../state/types'
import type { MixChain } from './mix-chain'
import { divisionSeconds } from './timing'

/** Decay values at or above this are treated as "off" (no envelope decay). */
export const DECAY_OFF = 5000
const CHOKE_FADE = 0.008
const RELEASE_FADE = 0.04

export interface TriggerOptions {
  /** 1..127 */
  velocity: number
  bpm: number
  pitchOffset?: number
  /**
   * Note-on mode only. Seconds the note is held before release (sequencer playback).
   * Omit for live playing, where the caller releases the pad on pointer-up.
   */
  gate?: number
}

interface Voice {
  pad: number
  stoppedAt: number
  stop(when: number, fade: number): void
}

type BufferLookup = (sampleId: string, reverse: boolean) => AudioBuffer | undefined

/**
 * Builds and tracks one-shot sample voices. Handles MPC behaviours: mute groups (choke),
 * mono/poly, note-on vs one-shot, looping, retrigger rolls. Shared by the live engine and the
 * offline WAV renderer so both sound identical.
 */
export class VoicePool {
  private voices: Voice[] = []

  constructor(
    private ctx: BaseAudioContext,
    private chain: MixChain,
    private lookup: BufferLookup,
  ) {}

  trigger(padIndex: number, pads: PadParams[], when: number, opts: TriggerOptions) {
    const params = pads[padIndex]
    if (!params?.sampleId) return
    const buffer = this.lookup(params.sampleId, params.reverse)
    if (!buffer) return

    const { count, rate, fade, pitchStep } = params.retrigger
    const hits = Math.max(1, Math.round(count))
    const interval = divisionSeconds(rate, opts.bpm)

    for (let i = 0; i < hits; i++) {
      const t = when + i * interval
      this.choke(padIndex, pads, t, i > 0 || params.polyphony === 'mono')
      const velocity = Math.max(1, opts.velocity * (1 - fade) ** i)
      // Each roll hit is gated to the roll interval so stutters stay tight in note-on mode
      const gate = hits > 1 ? Math.min(opts.gate ?? interval, interval) : opts.gate
      this.voices.push(
        this.startVoice(padIndex, params, buffer, t, {
          ...opts,
          velocity,
          gate,
          pitchOffset: (opts.pitchOffset ?? 0) + pitchStep * i,
        }),
      )
    }
  }

  /** Note-on release for a live pad. */
  release(padIndex: number, when: number) {
    for (const v of this.voices) if (v.pad === padIndex) v.stop(when, RELEASE_FADE)
  }

  stopAll(when: number) {
    for (const v of this.voices) v.stop(when, CHOKE_FADE)
  }

  activePads() {
    const now = this.ctx.currentTime
    return new Set(this.voices.filter((v) => v.stoppedAt > now).map((v) => v.pad))
  }

  private choke(padIndex: number, pads: PadParams[], when: number, includeSelf: boolean) {
    const group = pads[padIndex]?.muteGroup ?? 0
    for (const v of this.voices) {
      if (v.pad === padIndex) {
        if (includeSelf) v.stop(when, CHOKE_FADE)
      } else if (group > 0 && pads[v.pad]?.muteGroup === group) {
        v.stop(when, CHOKE_FADE)
      }
    }
  }

  private startVoice(
    pad: number,
    p: PadParams,
    buffer: AudioBuffer,
    when: number,
    opts: TriggerOptions,
  ): Voice {
    const ctx = this.ctx
    const dur = buffer.duration
    // A reversed buffer mirrors the region
    const regionStart = (p.reverse ? 1 - p.end : p.start) * dur
    const regionEnd = (p.reverse ? 1 - p.start : p.end) * dur
    const regionLen = Math.max(0.001, regionEnd - regionStart)
    const rate = 2 ** ((p.tune + p.fine / 100 + (opts.pitchOffset ?? 0)) / 12)
    const playLen = regionLen / rate
    const looping = p.loop && p.playMode === 'noteon'

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.playbackRate.value = rate

    let head: AudioNode = src
    if (p.filterType !== 'off') {
      const filter = ctx.createBiquadFilter()
      filter.type = p.filterType
      filter.frequency.value = p.cutoff
      filter.Q.value = p.resonance
      src.connect(filter)
      head = filter
    }

    const env = ctx.createGain()
    const stopGain = ctx.createGain()
    const panner = ctx.createStereoPanner()
    panner.pan.value = p.pan
    head.connect(env)
    env.connect(stopGain)
    stopGain.connect(panner)
    panner.connect(this.chain.input)

    const sends: GainNode[] = []
    if (p.sendDelay > 0) sends.push(connectSend(ctx, panner, this.chain.delaySend, p.sendDelay))
    if (p.sendReverb > 0) sends.push(connectSend(ctx, panner, this.chain.reverbSend, p.sendReverb))

    const vel = Math.min(127, opts.velocity) / 127
    const level = p.volume * p.volume * (1 - p.velocitySens + p.velocitySens * vel)
    const attack = Math.max(0.002, p.attack / 1000)
    env.gain.setValueAtTime(0, when)
    env.gain.linearRampToValueAtTime(level, when + attack)
    if (p.decay < DECAY_OFF) {
      env.gain.setTargetAtTime(0, when + attack, Math.max(0.005, p.decay / 1000) / 4)
    }

    let naturalEnd = Number.POSITIVE_INFINITY
    if (looping) {
      src.loop = true
      src.loopStart = regionStart
      src.loopEnd = regionEnd
      src.start(when, regionStart)
    } else {
      src.start(when, regionStart, regionLen)
      naturalEnd = when + playLen
      // Short de-click fade at the region end
      const fadeAt = Math.max(when + attack, naturalEnd - 0.004)
      stopGain.gain.setValueAtTime(1, fadeAt)
      stopGain.gain.linearRampToValueAtTime(0, naturalEnd)
    }

    const voice: Voice = {
      pad,
      stoppedAt: naturalEnd,
      stop(at, fade) {
        const t = Math.max(at, when)
        if (t >= voice.stoppedAt) return
        stopGain.gain.cancelScheduledValues(t)
        stopGain.gain.setValueAtTime(1, t)
        stopGain.gain.linearRampToValueAtTime(0, t + fade)
        voice.stoppedAt = t + fade
        try {
          src.stop(t + fade + 0.005)
        } catch {
          // already stopped
        }
      },
    }

    if (p.playMode === 'noteon' && opts.gate !== undefined)
      voice.stop(when + opts.gate, RELEASE_FADE)

    src.onended = () => {
      src.disconnect()
      panner.disconnect()
      for (const s of sends) s.disconnect()
      const i = this.voices.indexOf(voice)
      if (i !== -1) this.voices.splice(i, 1)
    }
    return voice
  }
}

function connectSend(ctx: BaseAudioContext, from: AudioNode, to: AudioNode, amount: number) {
  const g = ctx.createGain()
  g.gain.value = amount
  from.connect(g)
  g.connect(to)
  return g
}

/** Metronome click — short pitched blip, accented on the downbeat. */
export function scheduleClick(
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  accent: boolean,
) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = accent ? 2000 : 1300
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, when + 0.001)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
  osc.connect(g)
  g.connect(dest)
  osc.start(when)
  osc.stop(when + 0.06)
  osc.onended = () => g.disconnect()
}
