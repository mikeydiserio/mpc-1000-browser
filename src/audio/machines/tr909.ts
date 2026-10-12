import { chordStab } from './mpc-factory'
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

/** Hats and cymbals on the 909 were 6-bit samples — inharmonic partials plus quantization grit. */
const HAT_PARTIALS = [263, 400, 421, 474, 587, 845]
const RIDE_PARTIALS = [342, 535, 611, 777, 912, 1081]

function kick(decay: number, drive: number, start: number, click: number) {
  return (ctx: OfflineAudioContext) => {
    // Fast pitch sweep into a slightly driven low sine — the 909 punch
    const o = sweep(ctx, 'sine', start, 52, 0.035)
    const g = ctx.createGain()
    g.gain.setValueAtTime(1, 0)
    g.gain.setTargetAtTime(0, 0.02, decay / 4)
    chain(o, shaper(ctx, softClip(drive)), g, ctx.destination)
    o.start(0)
    // Attack: short noise "click" plus a pulse
    const n = noise(ctx, 0.02)
    chain(n, filter(ctx, 'highpass', 3500), env(ctx, click, 0.0003, 0.006), ctx.destination)
    n.start(0)
    const p = osc(ctx, 'triangle', 1000)
    chain(p, env(ctx, click * 0.6, 0.0003, 0.004), ctx.destination)
    p.start(0)
    p.stop(0.02)
  }
}

function snare(tone: number, snappy: number, pitch: number) {
  return (ctx: OfflineAudioContext) => {
    for (const [f, level] of [
      [pitch, 0.55],
      [pitch * 1.86, 0.3],
    ] as const) {
      const o = sweep(ctx, 'triangle', f * 1.35, f, 0.03)
      chain(o, env(ctx, level * tone, 0.001, 0.12), ctx.destination)
      o.start(0)
    }
    const n = noise(ctx, 0.4)
    chain(
      n,
      filter(ctx, 'lowpass', 7500),
      filter(ctx, 'highpass', 1100),
      env(ctx, 0.7 * snappy, 0.001, 0.24),
      ctx.destination,
    )
    n.start(0)
  }
}

function hat(decay: number, level: number) {
  return (ctx: OfflineAudioContext) => {
    const crush = shaper(ctx, bitCrush(6))
    const hp = filter(ctx, 'highpass', 8000)
    const mix = gain(ctx, 1)
    chain(mix, hp, crush, env(ctx, level, 0.0005, decay), ctx.destination)
    metal(
      ctx,
      HAT_PARTIALS.map((f) => f * 9),
      mix,
      decay + 0.1,
    )
    const n = noise(ctx, decay + 0.1)
    chain(n, gain(ctx, 0.35), mix)
    n.start(0)
  }
}

function clap(tail: number) {
  return (ctx: OfflineAudioContext) => {
    const n = noise(ctx, tail + 0.1)
    chain(
      n,
      filter(ctx, 'bandpass', 1250, 1.3),
      filter(ctx, 'highpass', 600),
      clapEnvelope(ctx, [0, 0.009, 0.019, 0.028], tail),
      gain(ctx, 1.5),
      ctx.destination,
    )
    n.start(0)
  }
}

export const TR909: MachineDef = {
  id: 'tr909',
  name: 'TR-909',
  blurb:
    'Roland TR-909 (1983). Analog kick, snare, toms and clap with sampled 6-bit cymbals. The sound of house and techno: four-on-the-floor kicks and offbeat open hats.',
  bpm: 124,
  swing: 50,
  voices: [
    { id: 'BD', name: '909 Kick', seconds: 0.9, render: kick(0.55, 2.2, 230, 0.35) },
    { id: 'SD', name: '909 Snare', seconds: 0.45, render: snare(1, 0.8, 180) },
    { id: 'CH', name: '909 Cl Hat', seconds: 0.15, render: hat(0.06, 0.6), pad: { muteGroup: 1 } },
    { id: 'OH', name: '909 Op Hat', seconds: 0.6, render: hat(0.42, 0.55), pad: { muteGroup: 1 } },
    { id: 'CP', name: '909 Clap', seconds: 0.45, render: clap(0.24) },
    {
      id: 'RS',
      name: '909 Rim',
      seconds: 0.1,
      render(ctx) {
        for (const f of [500, 1700]) {
          const o = osc(ctx, 'triangle', f)
          chain(o, filter(ctx, 'highpass', 400), env(ctx, 0.5, 0.0003, 0.025), ctx.destination)
          o.start(0)
        }
        const n = noise(ctx, 0.04)
        chain(n, filter(ctx, 'bandpass', 4000, 2), env(ctx, 0.25, 0.0003, 0.012), ctx.destination)
        n.start(0)
      },
    },
    {
      id: 'LT',
      name: '909 Lo Tom',
      seconds: 0.7,
      render: (ctx) =>
        drum(ctx, { freq: 100, bend: 1.6, bendTime: 0.06, decay: 0.42, skin: 0.18, skinFreq: 600 }),
    },
    {
      id: 'MT',
      name: '909 Mid Tom',
      seconds: 0.6,
      render: (ctx) =>
        drum(ctx, { freq: 145, bend: 1.6, bendTime: 0.05, decay: 0.36, skin: 0.18, skinFreq: 800 }),
    },
    {
      id: 'HT',
      name: '909 Hi Tom',
      seconds: 0.5,
      render: (ctx) =>
        drum(ctx, {
          freq: 200,
          bend: 1.6,
          bendTime: 0.045,
          decay: 0.3,
          skin: 0.18,
          skinFreq: 1000,
        }),
    },
    {
      id: 'CR',
      name: '909 Crash',
      seconds: 2.4,
      render(ctx) {
        const mix = gain(ctx, 1)
        chain(
          mix,
          filter(ctx, 'highpass', 4500),
          shaper(ctx, bitCrush(6)),
          env(ctx, 0.5, 0.001, 2.1),
          ctx.destination,
        )
        metal(
          ctx,
          HAT_PARTIALS.map((f) => f * 5.3),
          mix,
          2.4,
        )
        const n = noise(ctx, 2.4)
        chain(n, gain(ctx, 0.6), mix)
        n.start(0)
      },
      pad: { sendReverb: 0.12 },
    },
    {
      id: 'RD',
      name: '909 Ride',
      seconds: 1.8,
      render(ctx) {
        const mix = gain(ctx, 1)
        chain(
          mix,
          filter(ctx, 'bandpass', 7500, 0.8),
          shaper(ctx, bitCrush(6)),
          env(ctx, 0.6, 0.001, 1.5),
          ctx.destination,
        )
        metal(
          ctx,
          RIDE_PARTIALS.map((f) => f * 6),
          mix,
          1.8,
        )
      },
    },
    // The 909's extra slots were variations of the kick, snare and clap; the factory chord hit
    // takes them instead, in five keys for minor-9 progressions.
    chordStab('S1', 'Stab Cm9', 0),
    chordStab('S2', 'Stab Ebm9', 3),
    chordStab('S3', 'Stab Fm9', 5),
    chordStab('S4', 'Stab Gm9', 7),
    chordStab('S5', 'Stab Bbm9', -2),
  ],
  patterns: [
    {
      name: 'House',
      length: 16,
      bass: 'C . . C . . C . . . G . . A# . .',
      tracks: {
        BD: 'X...X...X...X...',
        CP: '....X.......X...',
        CH: 'xo.oxo.oxo.oxo.o',
        OH: '..x...x...x...x.',
      },
    },
    {
      name: 'Techno',
      length: 16,
      bass: 'C . C^ . C . C^ . C . C^ . D# . C^ .',
      tracks: {
        BD: 'X...X...X...X..x',
        CP: '....X.......X...',
        CH: 'XxxxXxxxXxxxXxxx',
        OH: '..x...x...x...x.',
        RD: 'x.x.x.x.x.x.x.x.',
        RS: '...x..x....x..x.',
        CR: 'x...............',
      },
    },
    {
      name: 'Snare Build',
      length: 16,
      tracks: {
        BD: 'X...X...X...X...',
        SD: 'o.o.o.o.xxxxXXXX',
        CH: 'x.x.x.x.x.x.x.x.',
        OH: '..x...x.........',
      },
    },
    {
      name: 'Deep Stabs',
      length: 32,
      bass: 'C . . C . . C . A#v . . A#v . . A#v . F . . F . . F . G . . G . . G^~ G',
      tracks: {
        BD: 'X...X...X...X...X...X...X...X...',
        CP: '....X.......X.......X.......X...',
        CH: 'xo.oxo.oxo.oxo.oxo.oxo.oxo.oxo.o',
        OH: '..x...x...x...x...x...x...x...x.',
        S1: 'x..x..x.........................',
        S5: '..........x..x..................',
        S3: '................x..x..x.........',
        S4: '..........................x..x.x',
      },
    },
  ],
  song: [0, 0, 1, 1, 3, 3, 2],
  acid: { cutoff: 0.33, resonance: 0.62, envMod: 0.5, decay: 0.4 },
}
