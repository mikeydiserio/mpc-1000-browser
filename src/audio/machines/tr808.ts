import {
  chain,
  clapEnvelope,
  drum,
  env,
  filter,
  gain,
  metal,
  noise,
  osc,
  shaper,
  softClip,
  sweep,
} from './synth'
import type { MachineDef } from './types'

/** The six square-wave oscillators of the 808 cymbal / hi-hat circuit (Hz). */
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800]

export const TR808: MachineDef = {
  id: 'tr808',
  name: 'TR-808',
  blurb:
    'Roland TR-808 (1980). Fully analog: booming sine kick, snappy two-tone snare, metallic hats and the famous clap and cowbell. Electro, Miami bass, hip-hop, trap.',
  bpm: 112,
  swing: 52,
  voices: [
    {
      id: 'BD',
      name: '808 Kick',
      seconds: 1.8,
      render(ctx) {
        // Bridged-T resonator: sine with a short pitch "thump" and a long tail
        const o = sweep(ctx, 'sine', 120, 49, 0.055)
        const g = ctx.createGain()
        g.gain.setValueAtTime(1, 0)
        g.gain.setTargetAtTime(0, 0.01, 0.38)
        chain(o, shaper(ctx, softClip(1.4)), g, ctx.destination)
        o.start(0)
        const click = osc(ctx, 'square', 1800)
        chain(click, filter(ctx, 'lowpass', 3000), env(ctx, 0.18, 0.0005, 0.006), ctx.destination)
        click.start(0)
        click.stop(0.02)
      },
    },
    {
      id: 'SD',
      name: '808 Snare',
      seconds: 0.4,
      render(ctx) {
        for (const [f, level, decay] of [
          [238, 0.55, 0.11],
          [476, 0.3, 0.06],
        ] as const) {
          const o = sweep(ctx, 'sine', f * 1.15, f, 0.02)
          chain(o, env(ctx, level, 0.001, decay), ctx.destination)
          o.start(0)
        }
        const n = noise(ctx, 0.35)
        chain(n, filter(ctx, 'highpass', 1800), env(ctx, 0.55, 0.001, 0.17), ctx.destination)
        n.start(0)
      },
    },
    {
      id: 'CH',
      name: '808 Cl Hat',
      seconds: 0.12,
      render(ctx) {
        const bp = filter(ctx, 'bandpass', 10000, 0.9)
        chain(
          bp,
          filter(ctx, 'highpass', 7500),
          env(ctx, 0.9, 0.0005, 0.045),
          gain(ctx, 5),
          ctx.destination,
        )
        metal(ctx, METAL, bp, 0.12)
      },
      pad: { muteGroup: 1 },
    },
    {
      id: 'OH',
      name: '808 Op Hat',
      seconds: 0.7,
      render(ctx) {
        const bp = filter(ctx, 'bandpass', 10000, 0.9)
        chain(
          bp,
          filter(ctx, 'highpass', 7500),
          env(ctx, 0.8, 0.001, 0.42),
          gain(ctx, 4),
          ctx.destination,
        )
        metal(ctx, METAL, bp, 0.7)
      },
      pad: { muteGroup: 1 },
    },
    {
      id: 'CP',
      name: '808 Clap',
      seconds: 0.6,
      render(ctx) {
        const n = noise(ctx, 0.6)
        chain(
          n,
          filter(ctx, 'bandpass', 1050, 1.1),
          clapEnvelope(ctx, [0, 0.011, 0.023, 0.034], 0.32),
          gain(ctx, 1.4),
          ctx.destination,
        )
        n.start(0)
      },
    },
    {
      id: 'RS',
      name: '808 Rim',
      seconds: 0.1,
      render(ctx) {
        for (const f of [1667, 455]) {
          const o = osc(ctx, 'sine', f)
          chain(o, filter(ctx, 'highpass', 300), env(ctx, 0.55, 0.0003, 0.022), ctx.destination)
          o.start(0)
        }
      },
    },
    {
      id: 'CB',
      name: '808 Cowbell',
      seconds: 0.6,
      render(ctx) {
        // Two detuned squares through a band-pass, with the double-slope envelope
        const bp = filter(ctx, 'bandpass', 2640, 0.7)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, 0)
        g.gain.linearRampToValueAtTime(0.7, 0.001)
        g.gain.exponentialRampToValueAtTime(0.22, 0.03)
        g.gain.exponentialRampToValueAtTime(0.0001, 0.5)
        chain(bp, g, ctx.destination)
        for (const f of [540, 800]) {
          const o = osc(ctx, 'square', f)
          chain(o, gain(ctx, 0.5), bp)
          o.start(0)
        }
      },
    },
    {
      id: 'CY',
      name: '808 Cymbal',
      seconds: 2.4,
      render(ctx) {
        const low = filter(ctx, 'bandpass', 3440, 1.2)
        const high = filter(ctx, 'highpass', 7100)
        chain(low, env(ctx, 1, 0.001, 0.6), ctx.destination)
        chain(high, env(ctx, 1.5, 0.001, 2.1), ctx.destination)
        const split = gain(ctx, 1)
        split.connect(low)
        split.connect(high)
        metal(ctx, METAL, split, 2.4)
      },
      pad: { sendReverb: 0.15 },
    },
    {
      id: 'LT',
      name: '808 Lo Tom',
      seconds: 0.8,
      render: (ctx) => drum(ctx, { freq: 92, bend: 1.25, bendTime: 0.12, decay: 0.55, skin: 0.06 }),
    },
    {
      id: 'MT',
      name: '808 Mid Tom',
      seconds: 0.7,
      render: (ctx) => drum(ctx, { freq: 131, bend: 1.25, bendTime: 0.1, decay: 0.45, skin: 0.06 }),
    },
    {
      id: 'HT',
      name: '808 Hi Tom',
      seconds: 0.6,
      render: (ctx) =>
        drum(ctx, { freq: 186, bend: 1.25, bendTime: 0.08, decay: 0.38, skin: 0.06 }),
    },
    {
      id: 'CL',
      name: '808 Claves',
      seconds: 0.12,
      render(ctx) {
        const o = osc(ctx, 'sine', 2500)
        chain(o, env(ctx, 0.6, 0.0003, 0.03), ctx.destination)
        o.start(0)
      },
    },
    {
      id: 'LC',
      name: '808 Lo Conga',
      seconds: 0.4,
      render: (ctx) => drum(ctx, { freq: 220, bend: 1.15, bendTime: 0.03, decay: 0.2, skin: 0 }),
    },
    {
      id: 'MC',
      name: '808 Md Conga',
      seconds: 0.35,
      render: (ctx) => drum(ctx, { freq: 310, bend: 1.15, bendTime: 0.03, decay: 0.17, skin: 0 }),
    },
    {
      id: 'HC',
      name: '808 Hi Conga',
      seconds: 0.3,
      render: (ctx) => drum(ctx, { freq: 455, bend: 1.15, bendTime: 0.025, decay: 0.14, skin: 0 }),
    },
    {
      id: 'MA',
      name: '808 Maracas',
      seconds: 0.12,
      render(ctx) {
        const n = noise(ctx, 0.12)
        chain(n, filter(ctx, 'highpass', 5000), env(ctx, 0.5, 0.004, 0.05), ctx.destination)
        n.start(0)
      },
    },
  ],
  patterns: [
    {
      name: 'Electro',
      length: 16,
      tracks: {
        BD: 'X.....x...X.....',
        SD: '....x.......x...',
        CP: '....X.......X...',
        CH: 'XoxoXoxoXoxoXo.o',
        OH: '..............x.',
        CB: '......x.......x.',
        CL: '...o......o.....',
      },
    },
    {
      name: 'Miami Bass',
      length: 16,
      tracks: {
        BD: 'X..x..X...X..x..',
        CP: '....X.......X...',
        CH: 'XxxxXxxxXxxxXxxx',
        CL: '..x..x....x..x..',
        MA: 'o.o.o.o.o.o.o.o.',
        HC: '.......x......x.',
        LC: '..........x.....',
      },
    },
    {
      name: 'Tom Fill',
      length: 16,
      tracks: {
        BD: 'X.....x.........',
        CP: '....X...........',
        CH: 'xoxoxoxo........',
        HT: '........XxX.....',
        MT: '...........xX...',
        LT: '.............xXx',
      },
    },
  ],
  song: [0, 0, 1, 1, 0, 2],
}
