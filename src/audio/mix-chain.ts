import type { FxSettings } from '../state/types'
import { divisionSeconds } from './timing'

/**
 * Master bus with two send effects (tempo-synced delay, convolution reverb) and an optional
 * bus compressor. Built against BaseAudioContext so the identical chain renders offline for
 * WAV export.
 */
export interface MixChain {
  /** Dry voice sum */
  input: GainNode
  delaySend: GainNode
  reverbSend: GainNode
  master: GainNode
  analyser: AnalyserNode
  update(fx: FxSettings, bpm: number): void
  setVolume(volume: number): void
}

export function createMixChain(ctx: BaseAudioContext, destination: AudioNode): MixChain {
  const input = ctx.createGain()
  const bus = ctx.createGain()
  input.connect(bus)

  // Delay send — feedback loop runs through a low-pass for darker repeats
  const delaySend = ctx.createGain()
  const delay = ctx.createDelay(4)
  const feedback = ctx.createGain()
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  const delayReturn = ctx.createGain()
  delaySend.connect(delay)
  delay.connect(tone)
  tone.connect(feedback)
  feedback.connect(delay)
  tone.connect(delayReturn)
  delayReturn.connect(bus)

  // Reverb send
  const reverbSend = ctx.createGain()
  const preDelay = ctx.createDelay(1)
  const convolver = ctx.createConvolver()
  const reverbReturn = ctx.createGain()
  reverbSend.connect(preDelay)
  preDelay.connect(convolver)
  convolver.connect(reverbReturn)
  reverbReturn.connect(bus)

  // Compressor with a bypass path, switched by gain so it never clicks
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -14
  compressor.knee.value = 8
  compressor.ratio.value = 3.5
  compressor.attack.value = 0.004
  compressor.release.value = 0.18
  const compWet = ctx.createGain()
  const compDry = ctx.createGain()
  bus.connect(compressor)
  compressor.connect(compWet)
  bus.connect(compDry)

  const master = ctx.createGain()
  compWet.connect(master)
  compDry.connect(master)

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  master.connect(analyser)
  master.connect(destination)

  let reverbSize = -1

  return {
    input,
    delaySend,
    reverbSend,
    master,
    analyser,
    update(fx, bpm) {
      const t = ctx.currentTime
      delay.delayTime.setTargetAtTime(
        Math.min(3.9, divisionSeconds(fx.delayDivision, bpm)),
        t,
        0.02,
      )
      feedback.gain.setTargetAtTime(Math.min(0.95, fx.delayFeedback), t, 0.02)
      tone.frequency.setTargetAtTime(fx.delayTone, t, 0.02)
      delayReturn.gain.setTargetAtTime(fx.delayReturn, t, 0.02)
      preDelay.delayTime.setTargetAtTime(fx.reverbPreDelay, t, 0.02)
      reverbReturn.gain.setTargetAtTime(fx.reverbReturn, t, 0.02)
      compWet.gain.setTargetAtTime(fx.compressor ? 1 : 0, t, 0.02)
      compDry.gain.setTargetAtTime(fx.compressor ? 0 : 1, t, 0.02)
      if (Math.abs(fx.reverbSize - reverbSize) > 0.01) {
        reverbSize = fx.reverbSize
        convolver.buffer = createImpulse(ctx, fx.reverbSize)
      }
    },
    setVolume(volume) {
      master.gain.setTargetAtTime(volume * volume, ctx.currentTime, 0.015)
    },
  }
}

/** Synthetic stereo hall impulse: decorrelated noise with an exponential tail. */
function createImpulse(ctx: BaseAudioContext, seconds: number) {
  const rate = ctx.sampleRate
  const length = Math.max(1, Math.floor(rate * seconds))
  const impulse = ctx.createBuffer(2, length, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < length; i++) {
      const t = i / length
      // One-pole smoothing darkens the tail as it decays
      const white = Math.random() * 2 - 1
      lp += (white - lp) * (0.9 - t * 0.7)
      data[i] = lp * (1 - t) ** 3.2
    }
  }
  return impulse
}
