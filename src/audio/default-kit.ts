/**
 * Synthesized starter kit so the machine makes sound with zero downloads. Every voice is
 * rendered once through an OfflineAudioContext and then behaves like any loaded sample.
 */

const RATE = 44100

interface KitVoice {
  name: string
  seconds: number
  render: (ctx: OfflineAudioContext) => void
}

function noise(ctx: BaseAudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  return src
}

function env(ctx: BaseAudioContext, peak: number, attack: number, decay: number, at = 0) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(peak, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  return g
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

function chain(...nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!)
  return nodes[nodes.length - 1]!
}

/** Six detuned square partials — the classic 808/909 metal source. */
function metal(ctx: BaseAudioContext, base: number, out: AudioNode, seconds: number) {
  for (const ratio of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = base * ratio
    o.connect(out)
    o.start(0)
    o.stop(seconds)
  }
}

function tom(freq: number): KitVoice['render'] {
  return (ctx) => {
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(freq * 1.7, 0)
    o.frequency.exponentialRampToValueAtTime(freq, 0.08)
    chain(o, env(ctx, 0.9, 0.002, 0.45), ctx.destination)
    o.start(0)
    const n = noise(ctx, 0.05)
    chain(n, filter(ctx, 'bandpass', freq * 4, 1), env(ctx, 0.15, 0.001, 0.04), ctx.destination)
    n.start(0)
  }
}

const KIT: KitVoice[] = [
  {
    name: 'Kick',
    seconds: 0.7,
    render(ctx) {
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(160, 0)
      o.frequency.exponentialRampToValueAtTime(48, 0.11)
      const shaper = ctx.createWaveShaper()
      shaper.curve = softClip(1.6)
      chain(o, shaper, env(ctx, 1, 0.002, 0.6), ctx.destination)
      o.start(0)
      const click = noise(ctx, 0.02)
      chain(click, filter(ctx, 'highpass', 2500), env(ctx, 0.35, 0.0005, 0.012), ctx.destination)
      click.start(0)
    },
  },
  {
    name: 'Snare',
    seconds: 0.45,
    render(ctx) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.setValueAtTime(260, 0)
      o.frequency.exponentialRampToValueAtTime(180, 0.05)
      chain(o, env(ctx, 0.7, 0.001, 0.12), ctx.destination)
      o.start(0)
      const n = noise(ctx, 0.4)
      chain(n, filter(ctx, 'highpass', 1200), env(ctx, 0.75, 0.001, 0.22), ctx.destination)
      n.start(0)
    },
  },
  {
    name: 'ClosedHat',
    seconds: 0.12,
    render(ctx) {
      const hp = filter(ctx, 'highpass', 7000)
      chain(hp, filter(ctx, 'bandpass', 10000, 0.8), env(ctx, 0.5, 0.001, 0.06), ctx.destination)
      metal(ctx, 40, hp, 0.12)
    },
  },
  {
    name: 'OpenHat',
    seconds: 0.7,
    render(ctx) {
      const hp = filter(ctx, 'highpass', 7000)
      chain(hp, filter(ctx, 'bandpass', 10000, 0.8), env(ctx, 0.45, 0.002, 0.55), ctx.destination)
      metal(ctx, 40, hp, 0.7)
    },
  },
  {
    name: 'Clap',
    seconds: 0.5,
    render(ctx) {
      const n = noise(ctx, 0.5)
      const bp = filter(ctx, 'bandpass', 1150, 1.4)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, 0)
      for (const t of [0, 0.011, 0.022]) {
        g.gain.setValueAtTime(0.9, t)
        g.gain.exponentialRampToValueAtTime(0.1, t + 0.009)
      }
      g.gain.setValueAtTime(0.8, 0.032)
      g.gain.exponentialRampToValueAtTime(0.0001, 0.4)
      chain(n, bp, g, ctx.destination)
      n.start(0)
    },
  },
  {
    name: 'Rim',
    seconds: 0.12,
    render(ctx) {
      for (const f of [1720, 460]) {
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = f
        chain(o, env(ctx, 0.55, 0.0005, 0.035), ctx.destination)
        o.start(0)
      }
    },
  },
  { name: 'TomLow', seconds: 0.6, render: tom(82) },
  { name: 'TomMid', seconds: 0.55, render: tom(118) },
  { name: 'TomHi', seconds: 0.5, render: tom(165) },
  {
    name: 'Crash',
    seconds: 2.2,
    render(ctx) {
      const hp = filter(ctx, 'highpass', 4500)
      chain(hp, env(ctx, 0.35, 0.002, 2), ctx.destination)
      metal(ctx, 63, hp, 2.2)
      const n = noise(ctx, 2.2)
      chain(n, filter(ctx, 'highpass', 6000), env(ctx, 0.25, 0.002, 1.8), ctx.destination)
      n.start(0)
    },
  },
  {
    name: 'Ride',
    seconds: 1.6,
    render(ctx) {
      const bp = filter(ctx, 'bandpass', 8200, 1.2)
      chain(bp, env(ctx, 0.5, 0.001, 1.4), ctx.destination)
      metal(ctx, 52, bp, 1.6)
    },
  },
  {
    name: 'Cowbell',
    seconds: 0.4,
    render(ctx) {
      const bp = filter(ctx, 'bandpass', 800, 1.5)
      chain(bp, env(ctx, 0.7, 0.001, 0.32), ctx.destination)
      for (const f of [540, 800]) {
        const o = ctx.createOscillator()
        o.type = 'square'
        o.frequency.value = f
        o.connect(bp)
        o.start(0)
      }
    },
  },
  {
    name: 'Shaker',
    seconds: 0.18,
    render(ctx) {
      const n = noise(ctx, 0.18)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, 0)
      g.gain.linearRampToValueAtTime(0.4, 0.025)
      g.gain.exponentialRampToValueAtTime(0.0001, 0.15)
      chain(n, filter(ctx, 'highpass', 5500), g, ctx.destination)
      n.start(0)
    },
  },
  {
    name: 'Sub808',
    seconds: 1.6,
    render(ctx) {
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(70, 0)
      o.frequency.exponentialRampToValueAtTime(49, 0.06)
      const shaper = ctx.createWaveShaper()
      shaper.curve = softClip(2.2)
      chain(o, shaper, env(ctx, 0.8, 0.003, 1.5), ctx.destination)
      o.start(0)
    },
  },
  {
    name: 'Blip',
    seconds: 0.25,
    render(ctx) {
      const mod = ctx.createOscillator()
      const modGain = ctx.createGain()
      mod.frequency.value = 1320
      modGain.gain.setValueAtTime(900, 0)
      modGain.gain.exponentialRampToValueAtTime(1, 0.15)
      const o = ctx.createOscillator()
      o.frequency.value = 880
      mod.connect(modGain)
      modGain.connect(o.frequency)
      chain(o, env(ctx, 0.5, 0.001, 0.2), ctx.destination)
      mod.start(0)
      o.start(0)
    },
  },
  {
    name: 'ChordStab',
    seconds: 1,
    render(ctx) {
      const lp = filter(ctx, 'lowpass', 600, 4)
      lp.frequency.setValueAtTime(4200, 0)
      lp.frequency.exponentialRampToValueAtTime(500, 0.5)
      chain(lp, env(ctx, 0.28, 0.004, 0.85), ctx.destination)
      // C minor 9
      for (const midi of [48, 55, 58, 62, 63]) {
        for (const detune of [-7, 7]) {
          const o = ctx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = 440 * 2 ** ((midi - 69) / 12)
          o.detune.value = detune
          o.connect(lp)
          o.start(0)
        }
      }
    },
  },
]

function softClip(drive: number) {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive)
  }
  return curve
}

export async function renderDefaultKit(): Promise<{ name: string; buffer: AudioBuffer }[]> {
  return Promise.all(
    KIT.map(async (voice) => {
      const ctx = new OfflineAudioContext(1, Math.ceil(RATE * voice.seconds), RATE)
      voice.render(ctx)
      return { name: voice.name, buffer: await ctx.startRendering() }
    }),
  )
}
