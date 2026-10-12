import { chain, env, filter, noise, shaper, softClip } from './synth'
import type { MachineDef, MachineVoice } from './types'

/**
 * The browser MPC's own starter kit: a mixed synthesized kit (drums, 808 sub, blip, chord
 * stab) that loads with every new project.
 */

/** Six detuned square partials around a base pitch — the factory kit's cymbal source. */
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

function tom(freq: number): MachineVoice['render'] {
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

/** The factory kit's chord hit: a filter-swept, detuned-saw minor 9, `transpose` semitones from C. */
function stab(transpose: number): MachineVoice['render'] {
  return (ctx) => {
    const lp = filter(ctx, 'lowpass', 600, 4)
    lp.frequency.setValueAtTime(4200, 0)
    lp.frequency.exponentialRampToValueAtTime(500, 0.5)
    chain(lp, env(ctx, 0.2, 0.004, 0.85), ctx.destination)
    for (const midi of [48, 55, 58, 62, 63]) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = 440 * 2 ** ((midi + transpose - 69) / 12)
        o.detune.value = detune
        o.connect(lp)
        o.start(0)
      }
    }
  }
}

const STAB_PAD = { sendDelay: 0.3, sendReverb: 0.3 }

export const CHORD_STAB: MachineVoice = {
  id: 'ST',
  name: 'ChordStab',
  seconds: 1,
  render: stab(0),
  pad: STAB_PAD,
}

/**
 * The factory chord hit rendered in another key. The other machines put these on the pads
 * where their hardware only had duplicate voices, so a row of pads plays a chord progression.
 */
export function chordStab(id: string, name: string, transpose: number): MachineVoice {
  return { id, name, seconds: 1, render: stab(transpose), pad: STAB_PAD }
}

const VOICES: MachineVoice[] = [
  {
    id: 'BD',
    name: 'Kick',
    seconds: 0.7,
    render(ctx) {
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(160, 0)
      o.frequency.exponentialRampToValueAtTime(48, 0.11)
      chain(o, shaper(ctx, softClip(1.6)), env(ctx, 1, 0.002, 0.6), ctx.destination)
      o.start(0)
      const click = noise(ctx, 0.02)
      chain(click, filter(ctx, 'highpass', 2500), env(ctx, 0.35, 0.0005, 0.012), ctx.destination)
      click.start(0)
    },
  },
  {
    id: 'SD',
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
    id: 'CH',
    name: 'ClosedHat',
    seconds: 0.12,
    render(ctx) {
      const hp = filter(ctx, 'highpass', 7000)
      chain(hp, filter(ctx, 'bandpass', 10000, 0.8), env(ctx, 0.5, 0.001, 0.06), ctx.destination)
      metal(ctx, 40, hp, 0.12)
    },
  },
  {
    id: 'OH',
    name: 'OpenHat',
    seconds: 0.7,
    render(ctx) {
      const hp = filter(ctx, 'highpass', 7000)
      chain(hp, filter(ctx, 'bandpass', 10000, 0.8), env(ctx, 0.45, 0.002, 0.55), ctx.destination)
      metal(ctx, 40, hp, 0.7)
    },
  },
  {
    id: 'CP',
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
    id: 'RS',
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
  { id: 'LT', name: 'TomLow', seconds: 0.6, render: tom(82) },
  { id: 'MT', name: 'TomMid', seconds: 0.55, render: tom(118) },
  { id: 'HT', name: 'TomHi', seconds: 0.5, render: tom(165) },
  {
    id: 'CY',
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
    id: 'RD',
    name: 'Ride',
    seconds: 1.6,
    render(ctx) {
      const bp = filter(ctx, 'bandpass', 8200, 1.2)
      chain(bp, env(ctx, 0.5, 0.001, 1.4), ctx.destination)
      metal(ctx, 52, bp, 1.6)
    },
  },
  {
    id: 'CB',
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
    id: 'SH',
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
    id: 'SB',
    name: 'Sub808',
    seconds: 1.6,
    render(ctx) {
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(70, 0)
      o.frequency.exponentialRampToValueAtTime(49, 0.06)
      chain(o, shaper(ctx, softClip(2.2)), env(ctx, 0.8, 0.003, 1.5), ctx.destination)
      o.start(0)
    },
  },
  {
    id: 'BL',
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
  CHORD_STAB,
]

export const MPC_FACTORY: MachineDef = {
  id: 'mpc',
  name: 'MPC Factory',
  blurb:
    'This MPC’s own starter kit: punchy drums plus an 808 sub, a blip and a chord stab for quick sketches.',
  bpm: 92,
  swing: 50,
  voices: VOICES.map((v) => {
    if (v.id === 'CH' || v.id === 'OH') return { ...v, pad: { muteGroup: 1 } }
    if (v.id === 'LT' || v.id === 'MT' || v.id === 'HT') return { ...v, pad: { sendReverb: 0.25 } }
    return v
  }),
  patterns: [
    {
      name: 'Boom Bap',
      length: 16,
      bass: 'C . . . . . . C . . D# . . . . .',
      tracks: {
        BD: 'x......x..x.....',
        SD: '....X.......X...',
        CH: 'x.xox.x.x.xox.x.',
        OH: '..............o.',
      },
    },
  ],
  song: [0],
  acid: { cutoff: 0.28, resonance: 0.5, envMod: 0.45, decay: 0.45 },
}
