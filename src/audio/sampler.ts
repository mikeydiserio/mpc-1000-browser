import { engine } from './engine'

const WORKLET = `
class MpcRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.recording = false
    this.port.onmessage = (e) => { this.recording = e.data === 'start' }
  }
  process(inputs) {
    const input = inputs[0]
    if (this.recording && input && input.length) this.port.postMessage(input.map((c) => c.slice()))
    return true
  }
}
registerProcessor('mpc-recorder', MpcRecorder)
`

/**
 * Microphone / line-in sampler. REC GAIN drives the input gain; the analyser feeds the LCD
 * input meter. Captured audio is trimmed of leading/trailing silence.
 */
class Sampler {
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private node: AudioWorkletNode | null = null
  private chunks: Float32Array[][] = []
  private workletLoaded = false
  private meterData = new Float32Array(1024)

  get armed() {
    return this.stream !== null
  }

  async arm(gain: number) {
    if (this.stream) return
    const ctx = engine.ensure()
    if (!this.workletLoaded) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      await ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      this.workletLoaded = true
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    })
    this.source = ctx.createMediaStreamSource(this.stream)
    this.gain = ctx.createGain()
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.node = new AudioWorkletNode(ctx, 'mpc-recorder', { numberOfInputs: 1, numberOfOutputs: 1 })
    this.node.port.onmessage = (e: MessageEvent<Float32Array[]>) => this.chunks.push(e.data)
    const silent = ctx.createGain()
    silent.gain.value = 0
    this.source.connect(this.gain)
    this.gain.connect(this.analyser)
    this.gain.connect(this.node)
    this.node.connect(silent)
    silent.connect(ctx.destination)
    this.setGain(gain)
  }

  setGain(value: number) {
    // REC GAIN knob 0..1 maps to 0..+12 dB-ish
    this.gain?.gain.setTargetAtTime(value * value * 4, engine.now, 0.02)
  }

  /** Peak level 0..1 of the input right now. */
  level() {
    if (!this.analyser) return 0
    this.analyser.getFloatTimeDomainData(this.meterData)
    let peak = 0
    for (const v of this.meterData) peak = Math.max(peak, Math.abs(v))
    return Math.min(1, peak)
  }

  start() {
    this.chunks = []
    this.node?.port.postMessage('start')
  }

  stop(): AudioBuffer | null {
    this.node?.port.postMessage('stop')
    const chunks = this.chunks
    this.chunks = []
    if (!chunks.length || !engine.ctx) return null
    const channels = chunks[0]!.length
    const length = chunks.reduce((n, c) => n + c[0]!.length, 0)
    const buffer = new AudioBuffer({
      length,
      numberOfChannels: channels,
      sampleRate: engine.ctx.sampleRate,
    })
    for (let ch = 0; ch < channels; ch++) {
      const data = new Float32Array(length)
      let offset = 0
      for (const chunk of chunks) {
        data.set(chunk[ch] ?? chunk[0]!, offset)
        offset += chunk[0]!.length
      }
      buffer.copyToChannel(data, ch)
    }
    return trimSilence(buffer)
  }

  disarm() {
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.source?.disconnect()
    this.node?.disconnect()
    this.stream = null
    this.source = null
    this.node = null
    this.analyser = null
  }
}

function trimSilence(buffer: AudioBuffer, threshold = 0.01) {
  const data = buffer.getChannelData(0)
  let start = 0
  let end = data.length - 1
  while (start < end && Math.abs(data[start]!) < threshold) start++
  while (end > start && Math.abs(data[end]!) < threshold) end--
  // Keep a few ms of pre-roll so the attack isn't clipped
  start = Math.max(0, start - Math.floor(buffer.sampleRate * 0.005))
  end = Math.min(data.length, end + Math.floor(buffer.sampleRate * 0.05))
  if (end - start < 32) return buffer
  const out = new AudioBuffer({
    length: end - start,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch)
  }
  return out
}

export const sampler = new Sampler()
