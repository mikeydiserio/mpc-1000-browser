import {
  bitCrush,
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

/**
 * The LinnDrum (LM-2) played back 8-bit recordings of real drums. These are synthesized
 * approximations of that character: acoustic-style bodies, real-cymbal noise and a little
 * sample grit — load real samples over any pad if you have them.
 */
export const LINNDRUM: MachineDef = {
  id: 'linndrum',
  name: 'LinnDrum',
  blurb:
    'Linn LM-2 LinnDrum (1982). Sampled acoustic drums: fat snare, punchy kick, tambourine and cabasa. The sound of 80s pop, funk and new wave. Synthesized approximation.',
  bpm: 112,
  swing: 54,
  voices: [
    {
      id: 'BD',
      name: 'Linn Kick',
      seconds: 0.6,
      render(ctx) {
        const o = sweep(ctx, 'sine', 150, 58, 0.04)
        chain(o, shaper(ctx, softClip(1.5)), env(ctx, 1, 0.001, 0.32), ctx.destination)
        o.start(0)
        const body = osc(ctx, 'sine', 92)
        chain(body, env(ctx, 0.25, 0.002, 0.12), ctx.destination)
        body.start(0)
        // Beater click
        const n = noise(ctx, 0.03)
        chain(n, filter(ctx, 'bandpass', 3200, 1.5), env(ctx, 0.35, 0.0003, 0.012), ctx.destination)
        n.start(0)
      },
    },
    {
      id: 'SD',
      name: 'Linn Snare',
      seconds: 0.55,
      render(ctx) {
        for (const [f, level] of [
          [196, 0.55],
          [330, 0.25],
        ] as const) {
          const o = sweep(ctx, 'triangle', f * 1.2, f, 0.025)
          chain(o, env(ctx, level, 0.001, 0.1), ctx.destination)
          o.start(0)
        }
        // Snare wires — broad, a touch crushed for the 8-bit sample feel
        const n = noise(ctx, 0.5)
        chain(
          n,
          filter(ctx, 'highpass', 400),
          filter(ctx, 'lowpass', 9000),
          shaper(ctx, bitCrush(8)),
          env(ctx, 0.75, 0.001, 0.3),
          ctx.destination,
        )
        n.start(0)
      },
      pad: { sendReverb: 0.18 },
    },
    {
      id: 'CH',
      name: 'Linn Cl Hat',
      seconds: 0.12,
      render(ctx) {
        const n = noise(ctx, 0.12)
        chain(
          n,
          filter(ctx, 'highpass', 7500),
          filter(ctx, 'peaking', 10500, 1),
          env(ctx, 0.6, 0.0005, 0.05),
          ctx.destination,
        )
        n.start(0)
      },
      pad: { muteGroup: 1 },
    },
    {
      id: 'OH',
      name: 'Linn Op Hat',
      seconds: 0.8,
      render(ctx) {
        const mix = gain(ctx, 1)
        chain(mix, filter(ctx, 'highpass', 6500), env(ctx, 0.55, 0.002, 0.55), ctx.destination)
        const n = noise(ctx, 0.8)
        chain(n, mix)
        n.start(0)
        metal(ctx, [3150, 4170, 5320, 6930], mix, 0.8)
      },
      pad: { muteGroup: 1 },
    },
    {
      id: 'CP',
      name: 'Linn Claps',
      seconds: 0.5,
      render(ctx) {
        const n = noise(ctx, 0.5)
        chain(
          n,
          filter(ctx, 'bandpass', 950, 1),
          clapEnvelope(ctx, [0, 0.013, 0.027], 0.22),
          gain(ctx, 1.3),
          ctx.destination,
        )
        n.start(0)
      },
    },
    {
      id: 'SS',
      name: 'Linn Sdstick',
      seconds: 0.15,
      render(ctx) {
        const n = noise(ctx, 0.06)
        chain(n, filter(ctx, 'bandpass', 2200, 4), env(ctx, 0.9, 0.0003, 0.04), ctx.destination)
        n.start(0)
        const o = osc(ctx, 'sine', 820)
        chain(o, env(ctx, 0.4, 0.0003, 0.035), ctx.destination)
        o.start(0)
      },
    },
    {
      id: 'CB',
      name: 'Linn Cowbell',
      seconds: 0.5,
      render(ctx) {
        const bp = filter(ctx, 'bandpass', 1000, 1.2)
        chain(bp, env(ctx, 0.75, 0.001, 0.35), ctx.destination)
        for (const f of [587, 845]) {
          const o = osc(ctx, 'square', f)
          o.connect(bp)
          o.start(0)
        }
      },
    },
    {
      id: 'CR',
      name: 'Linn Crash',
      seconds: 2.6,
      render(ctx) {
        const mix = gain(ctx, 1)
        chain(
          mix,
          filter(ctx, 'highpass', 3800),
          shaper(ctx, bitCrush(8)),
          env(ctx, 0.5, 0.002, 2.3),
          ctx.destination,
        )
        const n = noise(ctx, 2.6)
        chain(n, mix)
        n.start(0)
        metal(ctx, [2870, 3580, 4410, 5650, 7020], mix, 2.6)
      },
      pad: { sendReverb: 0.15 },
    },
    {
      id: 'LT',
      name: 'Linn Tom Lo',
      seconds: 0.8,
      render: (ctx) =>
        drum(ctx, { freq: 110, bend: 1.35, bendTime: 0.09, decay: 0.55, skin: 0.2, skinFreq: 500 }),
      pad: { sendReverb: 0.15 },
    },
    {
      id: 'MT',
      name: 'Linn Tom Mid',
      seconds: 0.7,
      render: (ctx) =>
        drum(ctx, { freq: 150, bend: 1.35, bendTime: 0.08, decay: 0.48, skin: 0.2, skinFreq: 700 }),
      pad: { sendReverb: 0.15 },
    },
    {
      id: 'HT',
      name: 'Linn Tom Hi',
      seconds: 0.6,
      render: (ctx) =>
        drum(ctx, { freq: 205, bend: 1.35, bendTime: 0.07, decay: 0.42, skin: 0.2, skinFreq: 900 }),
      pad: { sendReverb: 0.15 },
    },
    {
      id: 'RD',
      name: 'Linn Ride',
      seconds: 2,
      render(ctx) {
        const mix = gain(ctx, 1)
        chain(mix, filter(ctx, 'bandpass', 6000, 0.7), env(ctx, 0.5, 0.001, 1.7), ctx.destination)
        metal(ctx, [3230, 4720, 5170, 6400, 7900], mix, 2)
        const n = noise(ctx, 2)
        chain(n, gain(ctx, 0.25), mix)
        n.start(0)
        // Bell
        const bell = osc(ctx, 'sine', 2350)
        chain(bell, env(ctx, 0.15, 0.001, 0.6), ctx.destination)
        bell.start(0)
      },
    },
    {
      id: 'LC',
      name: 'Linn Conga Lo',
      seconds: 0.4,
      render: (ctx) =>
        drum(ctx, {
          freq: 290,
          bend: 1.1,
          bendTime: 0.02,
          decay: 0.24,
          skin: 0.25,
          skinFreq: 2200,
        }),
    },
    {
      id: 'HC',
      name: 'Linn Conga Hi',
      seconds: 0.35,
      render: (ctx) =>
        drum(ctx, {
          freq: 410,
          bend: 1.1,
          bendTime: 0.02,
          decay: 0.19,
          skin: 0.25,
          skinFreq: 2800,
        }),
    },
    {
      id: 'CA',
      name: 'Linn Cabasa',
      seconds: 0.12,
      render(ctx) {
        const n = noise(ctx, 0.12)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, 0)
        g.gain.linearRampToValueAtTime(0.45, 0.012)
        g.gain.exponentialRampToValueAtTime(0.0001, 0.08)
        chain(n, filter(ctx, 'highpass', 6000), g, ctx.destination)
        n.start(0)
      },
    },
    {
      id: 'TB',
      name: 'Linn Tamb',
      seconds: 0.4,
      render(ctx) {
        const mix = gain(ctx, 1)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0, 0)
        // Several jingles hitting in quick succession
        for (const t of [0, 0.012, 0.025]) {
          g.gain.setValueAtTime(0.6, t)
          g.gain.exponentialRampToValueAtTime(0.15, t + 0.01)
        }
        g.gain.exponentialRampToValueAtTime(0.0001, 0.3)
        chain(mix, filter(ctx, 'highpass', 6500), g, ctx.destination)
        metal(ctx, [5120, 6370, 7450, 8810], mix, 0.4)
        const n = noise(ctx, 0.4)
        chain(n, gain(ctx, 0.5), mix)
        n.start(0)
      },
    },
  ],
  patterns: [
    {
      name: '80s Pop',
      length: 16,
      tracks: {
        BD: 'X......x..X.....',
        SD: '....X.......X...',
        CH: 'X.x.X.x.X.x.X.x.',
        CA: '.o.o.o.o.o.o.o.o',
        TB: '....x.......x...',
      },
    },
    {
      name: 'Funk',
      length: 16,
      tracks: {
        BD: 'X..x..x...X..x..',
        SD: '....X..o.o..X..o',
        CH: 'XxxxXxxxXxxxXxx.',
        OH: '..............x.',
        CB: '..x.......x.....',
        HC: '.......x.x......',
        LC: '...........x..x.',
      },
    },
    {
      name: 'Tom Fill',
      length: 16,
      tracks: {
        BD: 'X.......X.......',
        SD: '....X...........',
        CH: 'x.x.x.x.........',
        HT: '........XxXx....',
        MT: '............Xx..',
        LT: '..............XX',
        CR: 'X...............',
      },
    },
  ],
  song: [0, 0, 1, 0, 2],
}
