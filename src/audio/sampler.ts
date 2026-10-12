import { engine } from './engine'

/**
 * Records between optional `at` / `until` AudioContext times so synced resampling starts and
 * ends on the beat (block accuracy: 128 frames), then posts 'done'.
 */
const WORKLET = `
class MpcRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.recording = false
    this.from = 0
    this.until = Infinity
    this.port.onmessage = (e) => {
      const d = e.data
      if (d.cmd === 'start') {
        this.recording = true
        this.from = d.at ?? 0
        this.until = d.until ?? Infinity
      } else if (d.cmd === 'stop') {
        this.recording = false
      }
    }
  }
  process(inputs) {
    if (!this.recording) return true
    if (currentTime >= this.until) {
      this.recording = false
      this.port.postMessage('done')
      return true
    }
    const input = inputs[0]
    if (currentTime >= this.from && input && input.length) {
      this.port.postMessage(input.map((c) => c.slice()))
    }
    return true
  }
}
registerProcessor('mpc-recorder', MpcRecorder)
`

export type SampleSource = 'mic' | 'main'

/**
 * Sampler with two inputs: microphone / line-in (REC GAIN drives the input gain) or the
 * machine's own MAIN OUT for resampling. The analyser feeds the LCD input meter.
 */
class Sampler {
  private stream: MediaStream | null = null
  private input: AudioNode | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private node: AudioWorkletNode | null = null
  private chunks: Float32Array[][] = []
  private workletLoaded = false
  private meterData = new Float32Array(1024)
  private onDone: (() => void) | null = null
  source: SampleSource | null = null

  get armed() {
    return this.source !== null
  }

  async arm(source: SampleSource, gain: number) {
    if (this.source === source) return
    this.disarm()
    const ctx = engine.ensure()
    if (!this.workletLoaded) {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      await ctx.audioWorklet.addModule(url)
      URL.revokeObjectURL(url)
      this.workletLoaded = true
    }
    if (source === 'mic') {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      this.input = ctx.createMediaStreamSource(this.stream)
    } else {
      this.input = engine.chain!.master
    }
    this.gain = ctx.createGain()
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.node = new AudioWorkletNode(ctx, 'mpc-recorder', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'explicit',
    })
    this.node.port.onmessage = (e: MessageEvent<Float32Array[] | 'done'>) => {
      if (e.data === 'done') this.onDone?.()
      else this.chunks.push(e.data)
    }
    const silent = ctx.createGain()
    silent.gain.value = 0
    this.input.connect(this.gain)
    this.gain.connect(this.analyser)
    this.gain.connect(this.node)
    this.node.connect(silent)
    silent.connect(ctx.destination)
    this.source = source
    this.setGain(gain)
  }

  setGain(value: number) {
    // Resampling stays at unity; REC GAIN knob 0..1 maps to roughly 0..+12 dB for the mic
    const g = this.source === 'main' ? 1 : value * value * 4
    this.gain?.gain.setTargetAtTime(g, engine.now, 0.02)
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
    this.node?.port.postMessage({ cmd: 'start' })
  }

  /** Free-running take, trimmed of leading/trailing silence. */
  stop(): AudioBuffer | null {
    this.node?.port.postMessage({ cmd: 'stop' })
    const buffer = this.collect()
    return buffer ? trimSilence(buffer) : null
  }

  /** Record exactly the window [at, until) on the AudioContext clock — used for synced resampling. */
  recordWindow(at: number, until: number): Promise<AudioBuffer | null> {
    this.chunks = []
    return new Promise((resolve) => {
      this.onDone = () => {
        this.onDone = null
        resolve(this.collect())
      }
      this.node?.port.postMessage({ cmd: 'start', at, until })
    })
  }

  cancel() {
    this.node?.port.postMessage({ cmd: 'stop' })
    this.onDone = null
    this.chunks = []
  }

  private collect(): AudioBuffer | null {
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
    return buffer
  }

  disarm() {
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    // Only disconnect our own branch — MAIN OUT keeps feeding the speakers
    if (this.input && this.gain) this.input.disconnect(this.gain)
    this.node?.disconnect()
    this.stream = null
    this.input = null
    this.gain = null
    this.node = null
    this.analyser = null
    this.source = null
    this.onDone = null
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
