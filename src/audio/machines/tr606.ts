import { chordStab } from './mpc-factory'
import { chain, drum, env, filter, gain, metal, noise, osc, shaper, softClip, sweep } from './synth'
import type { MachineDef, MachineVoice } from './types'

/** The 606 hat/cymbal circuit: square oscillators, brighter and buzzier than the 808. */
const METAL = [245, 306, 365, 415, 437, 619]

function kick(level: number, decay: number): MachineVoice['render'] {
  return (ctx) => {
    const o = sweep(ctx, 'sine', 140, 62, 0.03)
    chain(o, shaper(ctx, softClip(1.8)), env(ctx, level, 0.001, decay), ctx.destination)
    o.start(0)
  }
}

function snare(level: number): MachineVoice['render'] {
  return (ctx) => {
    const o = sweep(ctx, 'triangle', 300, 220, 0.02)
    chain(o, env(ctx, level * 0.5, 0.001, 0.07), ctx.destination)
    o.start(0)
    const n = noise(ctx, 0.25)
    chain(
      n,
      filter(ctx, 'bandpass', 3000, 0.6),
      env(ctx, level * 0.75, 0.001, 0.14),
      ctx.destination,
    )
    n.start(0)
  }
}

function hat(level: number, decay: number): MachineVoice['render'] {
  return (ctx) => {
    const hp = filter(ctx, 'highpass', 8800)
    chain(hp, env(ctx, level, 0.0005, decay), gain(ctx, 1.8), ctx.destination)
    metal(
      ctx,
      METAL.map((f) => f * 8),
      hp,
      decay + 0.1,
    )
  }
}

function cymbal(level: number): MachineVoice['render'] {
  return (ctx) => {
    const mix = gain(ctx, 1)
    chain(mix, filter(ctx, 'bandpass', 6500, 0.7), env(ctx, level, 0.001, 0.9), ctx.destination)
    metal(
      ctx,
      METAL.map((f) => f * 6),
      mix,
      1.2,
    )
    const n = noise(ctx, 1.2)
    chain(n, gain(ctx, 0.4), mix)
    n.start(0)
  }
}

export const TR606: MachineDef = {
  id: 'tr606',
  name: 'TR-606',
  blurb:
    'Roland TR-606 Drumatix (1981). The TB-303’s partner: a small, buzzy analog kit with tight kick, crisp snare and fizzy hats. Acid house, electro and lo-fi grooves.',
  bpm: 128,
  swing: 50,
  voices: [
    { id: 'BD', name: '606 Kick', seconds: 0.4, render: kick(0.85, 0.24) },
    { id: 'SD', name: '606 Snare', seconds: 0.3, render: snare(0.8) },
    { id: 'CH', name: '606 Cl Hat', seconds: 0.1, render: hat(0.75, 0.035), pad: { muteGroup: 1 } },
    { id: 'OH', name: '606 Op Hat', seconds: 0.5, render: hat(0.65, 0.3), pad: { muteGroup: 1 } },
    { id: 'CY', name: '606 Cymbal', seconds: 1.2, render: cymbal(0.55) },
    {
      id: 'LT',
      name: '606 Lo Tom',
      seconds: 0.5,
      render: (ctx) => drum(ctx, { freq: 122, bend: 1.2, bendTime: 0.05, decay: 0.26, skin: 0 }),
    },
    {
      id: 'HT',
      name: '606 Hi Tom',
      seconds: 0.45,
      render: (ctx) => drum(ctx, { freq: 182, bend: 1.2, bendTime: 0.045, decay: 0.22, skin: 0 }),
    },
    {
      id: 'BZ',
      name: '606 Blip',
      seconds: 0.15,
      render(ctx) {
        // Not a 606 voice — a 303-style square blip to pair with acid patterns
        const o = osc(ctx, 'square', 220)
        chain(o, filter(ctx, 'lowpass', 1400, 6), env(ctx, 0.35, 0.002, 0.11), ctx.destination)
        o.start(0)
      },
    },
    // The 606's accent pads were louder copies of the kick, snare, hat and toms; the factory
    // chord hit takes those slots instead.
    chordStab('S1', 'Stab Cm9', 0),
    chordStab('S2', 'Stab Ebm9', 3),
    chordStab('S3', 'Stab Fm9', 5),
    chordStab('S4', 'Stab Gm9', 7),
    chordStab('S5', 'Stab Bbm9', -2),
  ],
  patterns: [
    {
      name: 'Acid',
      length: 16,
      tracks: {
        BD: 'X.....x.X.....x.',
        SD: '....X.......X...',
        CH: 'xxXxxxXxxxXxxxXx',
        OH: '..............x.',
        BZ: 'x..x..x.x..x.x..',
      },
    },
    {
      name: 'Electro 606',
      length: 16,
      tracks: {
        BD: 'X..X..X...X.....',
        SD: '....X..o....X...',
        CH: 'x.x.x.x.x.x.x.x.',
        OH: '......x.......x.',
        LT: '.............xx.',
      },
    },
    {
      name: 'Tom Fill',
      length: 16,
      tracks: {
        BD: 'X.......X.......',
        SD: '....x.......xXxX',
        HT: 'x.x.x.x.........',
        LT: '........x.x.x.x.',
        CY: 'X...............',
      },
    },
  ],
  song: [0, 0, 1, 0, 2],
}
