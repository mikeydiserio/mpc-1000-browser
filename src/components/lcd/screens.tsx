import type { ReactNode } from 'react'
import { bounce } from '../../audio/bounce'
import { engine } from '../../audio/engine'
import { bindInput, initMidi, listMidiInputs } from '../../audio/midi'
import { sampler } from '../../audio/sampler'
import { stepSeconds } from '../../audio/timing'
import { transport } from '../../audio/transport'
import { DECAY_OFF } from '../../audio/voice-pool'
import { detectTransients, downloadBlob, normalizeBuffer, sliceBuffer } from '../../audio/wav'
import { hz, padLabel, pct, seqLabel, signed } from '../../state/format'
import {
  addBuffer,
  exportKit,
  exportProject,
  importFile,
  loadDefaultKit,
  loadFilesToPads,
  newProject,
} from '../../state/library'
import { MODE_LABELS } from '../../state/pad-input'
import { AUDIO_ACCEPT, pickFiles } from '../../state/pick-files'
import { type MpcState, useMpc } from '../../state/store'
import {
  BANK_NAMES,
  DIVISIONS,
  type FxSettings,
  type LcdMode,
  PAD_COUNT,
  PADS_PER_BANK,
  PATTERN_COUNT,
  type QLinkTarget,
  STEP_RESOLUTIONS,
} from '../../state/types'
import s from './lcd.module.css'
import { confirmed, type LcdUi, useLcdUi } from './lcd-ui'
import {
  choiceParam,
  infoParam,
  logStep,
  numParam,
  type ParamDef,
  padChoice,
  padNum,
  toggleParam,
} from './params'
import { InputMeter, MixerStrips, PositionCounter, SongList } from './visuals'
import { Waveform } from './waveform'

export interface FKey {
  label: string
  action: () => void
  active?: boolean
}

export interface Screen {
  title: string
  fkeys: (FKey | null)[]
  params: ParamDef[]
  columns?: 1 | 2
  visual?: ReactNode
}

const st = () => useMpc.getState()
const ui = () => useLcdUi.getState()
const range = (n: number) => Array.from({ length: n }, (_, i) => i)
const PAD_INDEXES = range(PAD_COUNT)
const PATTERN_INDEXES = range(PATTERN_COUNT)

export const MODE_TITLES: Record<LcdMode, string> = {
  main: 'MAIN',
  trim: 'TRIM',
  program: 'PROGRAM',
  mixer: 'MIXER',
  record: 'RECORD',
  load: 'LOAD',
  save: 'SAVE',
  effect: 'EFFECT',
  song: 'SONG',
  seqedit: 'SEQ EDIT',
  midi: 'MIDI/SYNC',
  other: 'OTHER',
  slider: 'Q-LINK SLIDER',
}

function sampleName(state: MpcState, pad: number) {
  const id = state.pads[pad]?.sampleId
  return id ? (state.samples[id]?.name ?? '(missing)') : '(empty)'
}

function padSelect(state: MpcState): ParamDef {
  return choiceParam('Pad', {
    get: (x) => x.selectedPad,
    set: (v) => st().selectPad(v),
    options: PAD_INDEXES,
    format: (v) => `${padLabel(v)} ${sampleName(state, v)}`,
  })
}

const audition = (): FKey => ({
  label: 'PLAY',
  action: () => {
    const x = st()
    transport.padDown(-1, x.selectedPad, 110)
    setTimeout(() => transport.padUp(-1), 400)
  },
})

// ─── MAIN ────────────────────────────────────────────────────────────────────

function mainScreen(state: MpcState): Screen {
  const pattern = state.patterns[state.currentPattern]!
  return {
    title: `Sq:${seqLabel(state.currentPattern)}-${pattern.name}`,
    columns: 2,
    visual: <PositionCounter />,
    params: [
      choiceParam('Seq', {
        get: (x) => x.queuedPattern ?? x.currentPattern,
        set: (v) => st().selectPattern(v),
        options: PATTERN_INDEXES,
        format: (v) => (state.queuedPattern === v ? `${seqLabel(v)} (next)` : seqLabel(v)),
      }),
      numParam('BPM', {
        get: (x) => x.bpm,
        set: (v) => st().set({ bpm: v }),
        min: 30,
        max: 300,
        step: 0.5,
        big: 10,
        format: (v) => v.toFixed(1),
      }),
      numParam('Len', {
        get: (x) => x.patterns[x.currentPattern]!.length,
        set: (v) => st().setPatternProp('length', v),
        min: 8,
        max: 64,
        step: 8,
        big: 16,
        format: (v) => `${v} steps`,
      }),
      choiceParam('Res', {
        get: (x) => x.patterns[x.currentPattern]!.resolution,
        set: (v) => st().setPatternProp('resolution', v),
        options: STEP_RESOLUTIONS,
      }),
      numParam('Swing', {
        get: (x) => x.patterns[x.currentPattern]!.swing,
        set: (v) => st().setPatternProp('swing', v),
        min: 50,
        max: 75,
        format: (v) => `${v}%`,
      }),
      choiceParam('T.C.', {
        get: (x) => x.noteRepeatRate,
        set: (v) => st().set({ noteRepeatRate: v }),
        options: DIVISIONS,
        format: (v) => `${v}${state.noteRepeat ? ' RPT' : ''}`,
      }),
      padSelect(state),
      infoParam('Rec', state.record === 'off' ? 'OFF' : state.record.toUpperCase()),
    ],
    fkeys: [
      {
        label: 'T.C.',
        action: () => {
          const i = DIVISIONS.indexOf(st().noteRepeatRate)
          st().set({ noteRepeatRate: DIVISIONS[(i + 1) % DIVISIONS.length]! })
        },
      },
      {
        label: 'CLICK',
        active: state.master.metronome,
        action: () => st().setMaster({ metronome: !st().master.metronome }),
      },
      {
        label: 'SEQ-',
        action: () => st().selectPattern((st().queuedPattern ?? st().currentPattern) - 1),
      },
      {
        label: 'SEQ+',
        action: () => st().selectPattern((st().queuedPattern ?? st().currentPattern) + 1),
      },
      {
        label: 'MUTE',
        active: state.trackMuteMode,
        action: () => st().set({ trackMuteMode: !st().trackMuteMode }),
      },
      { label: 'SOUND', action: () => st().setMode('program') },
    ],
  }
}

// ─── TRIM / CHOP ─────────────────────────────────────────────────────────────

function regionMs(state: MpcState) {
  const pad = state.pads[state.selectedPad]!
  const buffer = pad.sampleId ? engine.getBuffer(pad.sampleId) : undefined
  return { pad, dur: buffer?.duration ?? 0, buffer }
}

function chopPoints(state: MpcState, u: LcdUi): number[] {
  const { pad, buffer } = regionMs(state)
  if (!buffer) return []
  if (u.chopMode === 'equal') return range(u.chopSlices).map((i) => i / u.chopSlices)
  return detectTransients(sliceBuffer(buffer, pad.start, pad.end), u.chopSlices, u.chopSensitivity)
}

function trimScreen(state: MpcState, u: LcdUi): Screen {
  const { pad, dur, buffer } = regionMs(state)
  const ms = (f: number) => `${(f * dur * 1000).toFixed(0)}ms`
  const region = (r: { start: number; end: number }) => st().setPad(st().selectedPad, r)

  if (state.page === 1) {
    const points = chopPoints(state, u)
    return {
      title: `CHOP ${padLabel(state.selectedPad)} → BANK ${BANK_NAMES[u.chopBank]}`,
      columns: 2,
      visual: (
        <Waveform
          sampleId={pad.sampleId}
          start={pad.start}
          end={pad.end}
          slices={points}
          onChange={region}
        />
      ),
      params: [
        numParam('Slices', {
          get: () => ui().chopSlices,
          set: (v) => useLcdUi.setState({ chopSlices: v }),
          min: 2,
          max: 16,
          big: 4,
        }),
        choiceParam('Mode', {
          get: () => ui().chopMode,
          set: (v) => useLcdUi.setState({ chopMode: v }),
          options: ['equal', 'transient'] as const,
          format: (v) => v.toUpperCase(),
        }),
        numParam('Sens', {
          get: () => ui().chopSensitivity,
          set: (v) => useLcdUi.setState({ chopSensitivity: v }),
          min: 1.1,
          max: 4,
          step: 0.1,
          big: 0.5,
          format: (v) => v.toFixed(1),
        }),
        choiceParam('Dest', {
          get: () => ui().chopBank,
          set: (v) => useLcdUi.setState({ chopBank: v }),
          options: [0, 1, 2, 3],
          format: (v) => `BANK ${BANK_NAMES[v]} pads 1-${points.length}`,
        }),
      ],
      fkeys: [
        { label: 'BACK', action: () => st().set({ page: 0, cursor: 0 }) },
        null,
        null,
        null,
        audition(),
        {
          label: 'DO IT',
          action: () => {
            const x = st()
            const source = x.pads[x.selectedPad]!
            if (!source.sampleId) return
            const pts = chopPoints(x, ui())
            const span = source.end - source.start
            pts.forEach((p, i) => {
              const next = pts[i + 1] ?? 1
              const target = ui().chopBank * PADS_PER_BANK + i
              x.setPad(target, {
                sampleId: source.sampleId,
                start: source.start + p * span,
                end: source.start + next * span,
                tune: source.tune,
                fine: source.fine,
                reverse: false,
              })
            })
            x.set({ bank: ui().chopBank, page: 0, cursor: 0 })
            x.flash(`Chopped into ${pts.length} pads`)
          },
        },
      ],
    }
  }

  return {
    title: `TRIM ${padLabel(state.selectedPad)} ${sampleName(state, state.selectedPad)}`,
    columns: 2,
    visual: (
      <Waveform
        sampleId={pad.sampleId}
        start={pad.start}
        end={pad.end}
        zoom={u.zoom}
        onChange={region}
      />
    ),
    params: [
      numParam('St', {
        get: (x) => x.pads[x.selectedPad]!.start * dur * 1000,
        set: (v) =>
          region({
            start: Math.min(v / 1000 / dur, st().pads[st().selectedPad]!.end - 0.001),
            end: pad.end,
          }),
        min: 0,
        max: dur * 1000,
        step: 1,
        big: 25,
        format: (v) => `${v.toFixed(0)}ms`,
      }),
      numParam('End', {
        get: (x) => x.pads[x.selectedPad]!.end * dur * 1000,
        set: (v) =>
          region({
            start: pad.start,
            end: Math.max(v / 1000 / dur, st().pads[st().selectedPad]!.start + 0.001),
          }),
        min: 0,
        max: dur * 1000,
        step: 1,
        big: 25,
        format: (v) => `${v.toFixed(0)}ms`,
      }),
      infoParam('Len', ms(pad.end - pad.start)),
      infoParam(
        'Smpl',
        buffer
          ? `${dur.toFixed(2)}s ${buffer.sampleRate / 1000}k ${buffer.numberOfChannels === 1 ? 'MONO' : 'ST'}`
          : '-',
      ),
      padSelect(state),
      padChoice('Reverse', 'reverse', [false, true], (v) => (v ? 'ON' : 'OFF')),
    ],
    fkeys: [
      {
        label: `ZOOM${u.zoom}`,
        action: () => useLcdUi.setState({ zoom: ui().zoom >= 32 ? 1 : ui().zoom * 2 }),
      },
      {
        label: 'NORM',
        action: () => {
          const x = st()
          const id = x.pads[x.selectedPad]!.sampleId
          const buf = id ? engine.getBuffer(id) : undefined
          if (!buf || !id) return
          const meta = addBuffer(`${x.samples[id]?.name ?? 'Smpl'}N`, normalizeBuffer(buf))
          x.setPad(x.selectedPad, { sampleId: meta.id })
          x.flash('Normalized')
        },
      },
      {
        label: 'CROP',
        action: () => {
          const x = st()
          const p = x.pads[x.selectedPad]!
          const buf = p.sampleId ? engine.getBuffer(p.sampleId) : undefined
          if (!buf || !p.sampleId) return
          if (!confirmed('crop')) return x.flash('CROP discards outside region — press again')
          const meta = addBuffer(
            `${x.samples[p.sampleId]?.name ?? 'Smpl'}C`,
            sliceBuffer(buf, p.start, p.end),
          )
          x.setPad(x.selectedPad, { sampleId: meta.id, start: 0, end: 1 })
          x.flash('Cropped to region')
        },
      },
      { label: 'CHOP', action: () => st().set({ page: 1, cursor: 0 }) },
      {
        label: 'RESET',
        action: () => st().setPad(st().selectedPad, { start: 0, end: 1 }),
      },
      audition(),
    ],
  }
}

// ─── PROGRAM ─────────────────────────────────────────────────────────────────

const PROGRAM_PAGES = ['AMP', 'FILTER', 'MODE', 'RETRIG', 'COPY'] as const

function programScreen(state: MpcState): Screen {
  const pad = state.pads[state.selectedPad]!
  const page = Math.min(state.page, PROGRAM_PAGES.length - 1)
  let params: ParamDef[]
  switch (page) {
    case 0:
      params = [
        padSelect(state),
        padNum('Level', 'volume', 0, 1, 0.01, pct, 0.1),
        padNum('Tune', 'tune', -36, 36, 1, (v) => `${signed(v)} st`, 12),
        padNum('Fine', 'fine', -100, 100, 1, (v) => `${signed(v)} ct`),
        padNum('Attack', 'attack', 0, 2000, 1, (v) => `${v}ms`, 50),
        padNum('Decay', 'decay', 5, DECAY_OFF, 5, (v) => (v >= DECAY_OFF ? 'OFF' : `${v}ms`), 100),
        padNum('VelSns', 'velocitySens', 0, 1, 0.01, pct, 0.1),
        padNum('Pan', 'pan', -1, 1, 0.02, panLabel, 0.2),
      ]
      break
    case 1:
      params = [
        padSelect(state),
        padChoice('Filter', 'filterType', ['off', 'lowpass', 'highpass', 'bandpass'], (v) =>
          v === 'off' ? 'OFF' : v.replace('pass', '').toUpperCase(),
        ),
        {
          label: 'Cutoff',
          value: `${hz(pad.cutoff)}Hz`,
          step: (dir, big) => {
            const x = st()
            x.setPad(x.selectedPad, {
              cutoff: logStep(x.pads[x.selectedPad]!.cutoff, dir, big, 20, 20000),
            })
          },
        },
        padNum('Reso', 'resonance', 0.1, 20, 0.1, (v) => v.toFixed(1), 1),
        padNum('EnvAmt', 'filterEnvAmount', -6, 6, 0.25, (v) => `${signed(v, 2)} oct`, 1),
        padNum('EnvDcy', 'filterEnvDecay', 5, 4000, 5, (v) => `${v}ms`, 100),
        padNum('Vel>Flt', 'velocityToFilter', 0, 1, 0.01, pct, 0.1),
      ]
      break
    case 2:
      params = [
        padSelect(state),
        padChoice('Mode', 'playMode', ['oneshot', 'noteon'], (v) =>
          v === 'oneshot' ? 'ONE SHOT' : 'NOTE ON',
        ),
        padChoice('Poly', 'polyphony', ['poly', 'mono'], (v) => v.toUpperCase()),
        padChoice('Loop', 'loop', [false, true], (v) =>
          v ? (pad.playMode === 'noteon' ? 'ON' : 'ON (NOTE ON only)') : 'OFF',
        ),
        padNum('MuteGrp', 'muteGroup', 0, 16, 1, (v) => (v === 0 ? 'OFF' : String(v))),
        padChoice('Reverse', 'reverse', [false, true], (v) => (v ? 'ON' : 'OFF')),
      ]
      break
    case 4:
      params = [
        padSelect(state),
        choiceParam('To pad', {
          get: () => ui().padTarget,
          set: (v) => useLcdUi.setState({ padTarget: v }),
          options: PAD_INDEXES,
          format: (v) => `${padLabel(v)} ${sampleName(state, v)}`,
        }),
        infoParam('COPY', 'sample + every setting → To pad'),
        infoParam('SWAP', 'hold SHIFT + DO IT to swap'),
      ]
      break
    default:
      params = [
        padSelect(state),
        numParam('Hits', {
          get: (x) => x.pads[x.selectedPad]!.retrigger.count,
          set: (v) => st().setRetrigger(st().selectedPad, { count: v }),
          min: 1,
          max: 16,
          big: 4,
          format: (v) => (v <= 1 ? 'OFF' : `${v}x`),
        }),
        choiceParam('Rate', {
          get: (x) => x.pads[x.selectedPad]!.retrigger.rate,
          set: (v) => st().setRetrigger(st().selectedPad, { rate: v }),
          options: DIVISIONS,
        }),
        numParam('Fade', {
          get: (x) => x.pads[x.selectedPad]!.retrigger.fade,
          set: (v) => st().setRetrigger(st().selectedPad, { fade: v }),
          min: 0,
          max: 1,
          step: 0.01,
          big: 0.1,
          format: pct,
        }),
        numParam('Pitch', {
          get: (x) => x.pads[x.selectedPad]!.retrigger.pitchStep,
          set: (v) => st().setRetrigger(st().selectedPad, { pitchStep: v }),
          min: -12,
          max: 12,
          format: (v) => `${signed(v)} st/hit`,
        }),
      ]
  }
  return {
    title: `PGM ${padLabel(state.selectedPad)} ${sampleName(state, state.selectedPad)} · ${PROGRAM_PAGES[page]}`,
    columns: 2,
    visual: <Waveform sampleId={pad.sampleId} start={pad.start} end={pad.end} height={40} />,
    params,
    fkeys: [
      ...PROGRAM_PAGES.map((label, i) => ({
        label,
        active: page === i,
        action: () => st().set({ page: i, cursor: Math.min(st().cursor, 7) }),
      })),
      page === 4
        ? {
            label: 'DO IT',
            action: () => {
              const x = st()
              const to = ui().padTarget
              if (to === x.selectedPad) return x.flash('Pick a different pad')
              if (x.shift) {
                x.swapPads(x.selectedPad, to)
                x.flash(`Swapped ${padLabel(x.selectedPad)} ↔ ${padLabel(to)}`)
              } else {
                x.copyPad(x.selectedPad, to)
                x.flash(`Copied ${padLabel(x.selectedPad)} → ${padLabel(to)}`)
              }
            },
          }
        : audition(),
    ],
  }
}

function panLabel(v: number) {
  const n = Math.round(Math.abs(v) * 50)
  return n === 0 ? 'MID' : `${v < 0 ? 'L' : 'R'}${n}`
}

// ─── MIXER ───────────────────────────────────────────────────────────────────

function mixerScreen(state: MpcState): Screen {
  const pad = state.selectedPad
  return {
    title: `MIXER BANK ${BANK_NAMES[state.bank]}`,
    columns: 2,
    visual: <MixerStrips />,
    params: [
      padSelect(state),
      padNum('Level', 'volume', 0, 1, 0.01, pct, 0.1),
      padNum('Pan', 'pan', -1, 1, 0.02, panLabel, 0.2),
      padNum('Delay', 'sendDelay', 0, 1, 0.01, pct, 0.1),
      padNum('Reverb', 'sendReverb', 0, 1, 0.01, pct, 0.1),
      toggleParam(
        'Mute',
        (x) => x.mutes[x.selectedPad]!,
        () => st().toggleMute(st().selectedPad),
      ),
      toggleParam(
        'Solo',
        (x) => x.solos[x.selectedPad]!,
        () => st().toggleSolo(st().selectedPad),
      ),
      numParam('Master', {
        get: (x) => x.master.volume,
        set: (v) => st().setMaster({ volume: v }),
        min: 0,
        max: 1,
        step: 0.01,
        big: 0.1,
        format: pct,
      }),
    ],
    fkeys: [
      { label: 'BANK-', action: () => st().set({ bank: (st().bank + 3) % 4 }) },
      { label: 'BANK+', action: () => st().set({ bank: (st().bank + 1) % 4 }) },
      { label: 'MUTE', active: state.mutes[pad], action: () => st().toggleMute(st().selectedPad) },
      { label: 'SOLO', active: state.solos[pad], action: () => st().toggleSolo(st().selectedPad) },
      {
        label: 'RESET',
        action: () =>
          st().setPad(st().selectedPad, { volume: 0.8, pan: 0, sendDelay: 0, sendReverb: 0 }),
      },
      audition(),
    ],
  }
}

// ─── EFFECT ──────────────────────────────────────────────────────────────────

const DELAY_DIVISIONS: FxSettings['delayDivision'][] = [
  '1/4D',
  '1/4',
  '1/8D',
  '1/8',
  '1/8T',
  '1/16',
  '1/16T',
  '1/32',
]

function effectScreen(state: MpcState): Screen {
  const fx = (
    key: keyof FxSettings,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
    big?: number,
  ) =>
    numParam(label, {
      get: (x) => x.fx[key] as number,
      set: (v) => st().setFx({ [key]: v }),
      min,
      max,
      step,
      big,
      format,
    })
  return {
    title: 'EFFECT  FX1:DELAY  FX2:REVERB',
    columns: 2,
    params: [
      choiceParam('D.Time', {
        get: (x) => x.fx.delayDivision,
        set: (v) => st().setFx({ delayDivision: v }),
        options: DELAY_DIVISIONS,
      }),
      fx('reverbSize', 'R.Size', 0.3, 8, 0.1, (v) => `${v.toFixed(1)}s`, 1),
      fx('delayFeedback', 'D.Fdbk', 0, 0.95, 0.01, pct, 0.1),
      fx('reverbPreDelay', 'R.PreD', 0, 0.2, 0.001, (v) => `${Math.round(v * 1000)}ms`, 0.01),
      {
        label: 'D.Tone',
        value: `${hz(state.fx.delayTone)}Hz`,
        step: (dir, big) =>
          st().setFx({ delayTone: logStep(st().fx.delayTone, dir, big, 400, 18000) }),
      },
      fx('reverbReturn', 'R.Rtn', 0, 1, 0.01, pct, 0.1),
      fx('delayReturn', 'D.Rtn', 0, 1, 0.01, pct, 0.1),
      toggleParam(
        'Comp',
        (x) => x.fx.compressor,
        (v) => st().setFx({ compressor: v }),
      ),
    ],
    fkeys: [
      {
        label: 'COMP',
        active: state.fx.compressor,
        action: () => st().setFx({ compressor: !st().fx.compressor }),
      },
      null,
      null,
      null,
      { label: 'MIXER', action: () => st().setMode('mixer') },
      audition(),
    ],
  }
}

// ─── RECORD (sampling) ───────────────────────────────────────────────────────

function recordScreen(state: MpcState, u: LcdUi): Screen {
  const target = u.recordTarget ?? state.selectedPad
  const resample = u.sampleSource === 'main'
  const synced = resample && u.resampleLoops > 0
  const status = u.sampling
    ? resample
      ? 'RESAMPLING MAIN OUT…'
      : 'RECORDING…'
    : u.armed
      ? `ARMED (${resample ? 'MAIN OUT' : 'MIC'}) — F2 to record`
      : 'DISARMED — F1 to arm input'

  const keep = (buffer: AudioBuffer | null) => {
    useLcdUi.setState({ sampling: false })
    if (!buffer) return st().flash('Nothing recorded')
    const x = st()
    const pad = ui().recordTarget ?? x.selectedPad
    const name = `${ui().sampleSource === 'main' ? 'Resmpl' : 'Sample'}${Object.keys(x.samples).length + 1}`
    const meta = addBuffer(name, buffer)
    x.assignSample(pad, meta.id)
    x.selectPad(pad)
    x.flash(`Recorded ${buffer.duration.toFixed(1)}s → ${padLabel(pad)}`)
  }

  return {
    title: `SAMPLE → ${padLabel(target)}`,
    columns: 1,
    visual: <InputMeter status={status} />,
    params: [
      choiceParam('Input', {
        get: () => ui().sampleSource,
        set: (v) => {
          if (ui().armed) {
            sampler.disarm()
            useLcdUi.setState({ armed: false, sampling: false })
          }
          useLcdUi.setState({ sampleSource: v })
        },
        options: ['mic', 'main'] as const,
        format: (v) => (v === 'mic' ? 'MIC / LINE IN' : 'MAIN OUT (resample)'),
      }),
      choiceParam('Target', {
        get: (x) => ui().recordTarget ?? x.selectedPad,
        set: (v) => useLcdUi.setState({ recordTarget: v }),
        options: PAD_INDEXES,
        format: (v) => `${padLabel(v)} ${sampleName(state, v)}`,
      }),
      resample
        ? numParam('Length', {
            get: () => ui().resampleLoops,
            set: (v) => useLcdUi.setState({ resampleLoops: v }),
            min: 0,
            max: 8,
            format: (v) =>
              v === 0 ? 'FREE (F2 stops)' : `${v}x Seq ${seqLabel(state.currentPattern)} (auto)`,
          })
        : numParam('Gain', {
            get: (x) => x.master.recGain,
            set: (v) => {
              st().setMaster({ recGain: v })
              sampler.setGain(v)
            },
            min: 0,
            max: 1,
            step: 0.01,
            big: 0.1,
            format: pct,
          }),
    ],
    fkeys: [
      {
        label: u.armed ? 'DISARM' : 'ARM',
        active: u.armed,
        action: async () => {
          if (ui().armed) {
            sampler.disarm()
            useLcdUi.setState({ armed: false, sampling: false })
            return
          }
          try {
            await sampler.arm(ui().sampleSource, st().master.recGain)
            useLcdUi.setState({ armed: true })
          } catch {
            st().flash('Microphone access denied')
          }
        },
      },
      {
        label: u.sampling ? 'STOP' : 'REC',
        active: u.sampling,
        action: async () => {
          if (!ui().armed) return st().flash('Arm the input first (F1)')
          if (ui().sampling) {
            if (synced) {
              sampler.cancel()
              transport.stop()
              useLcdUi.setState({ sampling: false })
              return st().flash('Resample cancelled')
            }
            return keep(sampler.stop())
          }
          if (synced) {
            // Bounce-in-place: play the sequence from the top and capture exactly N loops
            const x = st()
            if (x.playing) transport.stop()
            const pattern = x.patterns[x.currentPattern]!
            const length =
              pattern.length * stepSeconds(pattern.resolution, x.bpm) * ui().resampleLoops
            const at = transport.play(true)
            if (at === null) return
            useLcdUi.setState({ sampling: true, samplingStarted: performance.now() })
            const buffer = await sampler.recordWindow(at, at + length)
            transport.stop()
            return keep(buffer)
          }
          sampler.start()
          useLcdUi.setState({ sampling: true, samplingStarted: performance.now() })
        },
      },
      null,
      null,
      { label: 'TRIM', action: () => st().setMode('trim') },
      audition(),
    ],
  }
}

// ─── LOAD / SAVE ─────────────────────────────────────────────────────────────

function loadScreen(state: MpcState): Screen {
  const sampleIds = [null, ...Object.keys(state.samples)]
  return {
    title: 'LOAD',
    columns: 1,
    visual: (
      <p className={s.note}>
        Drag audio onto any pad, or onto this screen to fill pads from {padLabel(state.selectedPad)}
        .
      </p>
    ),
    params: [
      padSelect(state),
      choiceParam('Sample', {
        get: (x) => x.pads[x.selectedPad]!.sampleId,
        set: (v) => st().setPad(st().selectedPad, { sampleId: v, start: 0, end: 1 }),
        options: sampleIds,
        format: (v) =>
          v
            ? `${state.samples[v]?.name ?? v} (${state.samples[v]?.duration.toFixed(2)}s)`
            : '(none)',
      }),
      infoParam('Library', `${sampleIds.length - 1} samples in memory`),
    ],
    fkeys: [
      {
        label: 'FILE',
        action: async () => {
          const files = await pickFiles(AUDIO_ACCEPT)
          if (files.length) await loadFilesToPads(files, st().selectedPad)
        },
      },
      {
        label: 'MULTI',
        action: async () => {
          const files = await pickFiles(AUDIO_ACCEPT, true)
          if (files.length) await loadFilesToPads(files, st().selectedPad)
        },
      },
      {
        label: 'KIT',
        action: async () => {
          await loadDefaultKit(st().bank * PADS_PER_BANK)
          st().flash(`Factory kit → bank ${BANK_NAMES[st().bank]}`)
        },
      },
      {
        label: 'OPEN',
        action: async () => {
          const [file] = await pickFiles('.mpcweb,.mpckit,application/json')
          if (file) await importFile(file)
        },
      },
      {
        label: 'CLEAR',
        action: () => st().setPad(st().selectedPad, { sampleId: null }),
      },
      audition(),
    ],
  }
}

function saveScreen(state: MpcState, u: LcdUi): Screen {
  return {
    title: 'SAVE',
    columns: 1,
    visual: (
      <p className={s.note}>
        Autosave is ON — your project lives in this browser. Export to move it between machines.
      </p>
    ),
    params: [
      numParam('Loops', {
        get: () => ui().bounceLoops,
        set: (v) => useLcdUi.setState({ bounceLoops: v }),
        min: 1,
        max: 32,
        big: 4,
        format: (v) =>
          state.songMode ? 'SONG (full chain)' : `${v}x Seq ${seqLabel(state.currentPattern)}`,
      }),
      infoParam('Confirm', u.confirm === 'new' ? 'Press NEW again to wipe project' : '-'),
    ],
    fkeys: [
      { label: 'EXPORT', action: () => exportProject() },
      { label: 'KIT', action: () => exportKit() },
      {
        label: 'BOUNCE',
        action: async () => {
          st().flash('Rendering…')
          const blob = await bounce(st(), ui().bounceLoops)
          downloadBlob(
            blob,
            `mpc-seq${seqLabel(st().currentPattern)}-${Math.round(st().bpm)}bpm.wav`,
          )
          st().flash('WAV exported')
        },
      },
      null,
      {
        label: 'NEW',
        action: async () => {
          if (!confirmed('new')) return
          transport.stop()
          await newProject()
          st().flash('New project')
        },
      },
      null,
    ],
  }
}

// ─── SONG / SEQ EDIT ─────────────────────────────────────────────────────────

function songScreen(state: MpcState): Screen {
  const stepParams = state.song.map((pattern, i) =>
    choiceParam(`Step${String(i + 1).padStart(2, '0')}`, {
      get: (x) => x.song[i] ?? 0,
      set: (v) => {
        const song = st().song.slice()
        song[i] = v
        st().set({ song })
      },
      options: PATTERN_INDEXES,
      format: () => `Seq ${seqLabel(pattern)} ${state.patterns[pattern]!.name}`,
    }),
  )
  const cursorStep = Math.max(0, state.cursor - 1)
  return {
    title: `SONG ${state.songMode ? 'ON' : 'OFF'} · ${state.song.length} steps`,
    columns: 1,
    visual: <SongList />,
    params: [
      toggleParam(
        'Song',
        (x) => x.songMode,
        (v) => st().set({ songMode: v }),
      ),
      ...stepParams,
    ],
    fkeys: [
      {
        label: 'INSERT',
        action: () => {
          const song = st().song.slice()
          song.splice(cursorStep + 1, 0, song[cursorStep] ?? st().currentPattern)
          st().set({ song, cursor: cursorStep + 2 })
        },
      },
      {
        label: 'DELETE',
        action: () => {
          const song = st().song.slice()
          if (song.length <= 1) return
          song.splice(cursorStep, 1)
          st().set({ song, cursor: Math.min(st().cursor, song.length) })
        },
      },
      {
        label: 'SONG',
        active: state.songMode,
        action: () => st().set({ songMode: !st().songMode }),
      },
      null,
      null,
      { label: 'PLAY', action: () => transport.play(true) },
    ],
  }
}

function seqEditScreen(state: MpcState, u: LcdUi): Screen {
  if (state.page === 1) return trackEditScreen(state, u)
  return {
    title: `SEQ EDIT ${seqLabel(state.currentPattern)}`,
    columns: 2,
    params: [
      choiceParam('Seq', {
        get: (x) => x.currentPattern,
        set: (v) => st().selectPattern(v),
        options: PATTERN_INDEXES,
        format: seqLabel,
      }),
      numParam('Len', {
        get: (x) => x.patterns[x.currentPattern]!.length,
        set: (v) => st().setPatternProp('length', v),
        min: 8,
        max: 64,
        step: 8,
        big: 16,
      }),
      choiceParam('Res', {
        get: (x) => x.patterns[x.currentPattern]!.resolution,
        set: (v) => st().setPatternProp('resolution', v),
        options: STEP_RESOLUTIONS,
      }),
      numParam('Swing', {
        get: (x) => x.patterns[x.currentPattern]!.swing,
        set: (v) => st().setPatternProp('swing', v),
        min: 50,
        max: 75,
        format: (v) => `${v}%`,
      }),
      numParam('CopyTo', {
        get: () => ui().copyTarget,
        set: (v) => useLcdUi.setState({ copyTarget: v }),
        min: 0,
        max: PATTERN_COUNT - 1,
        format: seqLabel,
      }),
      infoParam('Track', `${padLabel(state.selectedPad)} ${sampleName(state, state.selectedPad)}`),
    ],
    fkeys: [
      {
        label: 'CLEAR',
        action: () => {
          if (!confirmed('clear')) return st().flash('Press CLEAR again to wipe sequence')
          st().clearPattern()
        },
      },
      { label: 'CLRTRK', action: () => st().clearTrack(st().selectedPad) },
      {
        label: 'COPY',
        action: () => {
          st().copyPatternTo(u.copyTarget)
          st().flash(`Seq ${seqLabel(st().currentPattern)} → ${seqLabel(u.copyTarget)}`)
        },
      },
      { label: 'DOUBLE', action: () => st().doublePattern() },
      { label: 'UNDO', action: () => st().undo() },
      { label: 'TRACK', action: () => st().set({ page: 1, cursor: 0 }) },
    ],
  }
}

/** SEQ EDIT page 2 — per-track timing tools (MPC "shift timing", copy events, quantize). */
function trackEditScreen(state: MpcState, u: LcdUi): Screen {
  const pattern = state.patterns[state.currentPattern]!
  const loose = pattern.tracks.reduce(
    (n, t) => n + t.filter((step) => step.on && step.offset).length,
    0,
  )
  return {
    title: `TRACK EDIT Seq ${seqLabel(state.currentPattern)}`,
    columns: 1,
    params: [
      padSelect(state),
      choiceParam('Copy to', {
        get: () => ui().padTarget,
        set: (v) => useLcdUi.setState({ padTarget: v }),
        options: PAD_INDEXES,
        format: (v) => `${padLabel(v)} ${sampleName(state, v)}`,
      }),
      toggleParam(
        'T.C.',
        (x) => x.master.timingCorrect,
        (v) => st().setMaster({ timingCorrect: v }),
        ['ON (snap to grid)', 'OFF (keep feel)'],
      ),
      infoParam('Unquantized', `${loose} event${loose === 1 ? '' : 's'} off the grid`),
    ],
    fkeys: [
      { label: '◀SHIFT', action: () => st().shiftTrack(st().selectedPad, -1) },
      { label: 'SHIFT▶', action: () => st().shiftTrack(st().selectedPad, 1) },
      {
        label: 'CPYTRK',
        action: () => {
          const x = st()
          if (u.padTarget === x.selectedPad) return x.flash('Pick a different pad')
          x.copyTrack(x.selectedPad, u.padTarget)
          x.flash(`Track ${padLabel(x.selectedPad)} → ${padLabel(u.padTarget)}`)
        },
      },
      { label: 'CLRTRK', action: () => st().clearTrack(st().selectedPad) },
      {
        label: 'QUANT',
        action: () => {
          st().quantizePattern()
          st().flash('Sequence quantized to grid')
        },
      },
      { label: 'SEQ', action: () => st().set({ page: 0, cursor: 0 }) },
    ],
  }
}

// ─── MIDI / OTHER / SLIDER ───────────────────────────────────────────────────

function midiScreen(): Screen {
  const inputs = listMidiInputs()
  const ids: (string | null)[] = [null, ...inputs.map((i) => i.id)]
  return {
    title: 'MIDI/SYNC',
    columns: 1,
    visual: (
      <p className={s.note}>
        {'requestMIDIAccess' in navigator
          ? `${inputs.length} input(s). Notes 37–52 play pads 1–16 of the active bank.`
          : 'Web MIDI is not supported in this browser.'}
      </p>
    ),
    params: [
      choiceParam('Input', {
        get: (x) => x.midiInputId,
        set: (v) => {
          st().set({ midiInputId: v })
          bindInput(v)
        },
        options: ids,
        format: (v) => (v === null ? 'ALL' : (inputs.find((i) => i.id === v)?.name ?? v)),
      }),
    ],
    fkeys: [
      {
        label: 'SCAN',
        action: async () => {
          const found = await initMidi()
          bindInput(st().midiInputId)
          st().flash(`${found.length} MIDI input(s)`)
        },
      },
      null,
      null,
      null,
      null,
      null,
    ],
  }
}

function otherScreen(): Screen {
  return {
    title: 'OTHER',
    columns: 2,
    params: [
      toggleParam(
        'Click',
        (x) => x.master.metronome,
        (v) => st().setMaster({ metronome: v }),
      ),
      toggleParam(
        'ClkRec',
        (x) => x.master.metronomeOnlyRec,
        (v) => st().setMaster({ metronomeOnlyRec: v }),
        ['REC ONLY', 'ALWAYS'],
      ),
      toggleParam(
        'CountIn',
        (x) => x.master.countIn,
        (v) => st().setMaster({ countIn: v }),
      ),
      choiceParam('Repeat', {
        get: (x) => x.noteRepeatRate,
        set: (v) => st().set({ noteRepeatRate: v }),
        options: DIVISIONS,
      }),
      choiceParam('16Lvl', {
        get: (x) => x.sixteenLevels.param,
        set: (v) => st().set({ sixteenLevels: { ...st().sixteenLevels, param: v } }),
        options: ['velocity', 'tune'] as const,
        format: (v) => v.toUpperCase(),
      }),
      toggleParam(
        'T.C.',
        (x) => x.master.timingCorrect,
        (v) => st().setMaster({ timingCorrect: v }),
        ['ON', 'OFF (free)'],
      ),
      toggleParam(
        'FullLvl',
        (x) => x.fullLevel,
        (v) => st().set({ fullLevel: v }),
      ),
    ],
    fkeys: [null, null, null, null, null, null],
  }
}

const QLINK_TARGETS: QLinkTarget[] = [
  'tune',
  'fine',
  'cutoff',
  'resonance',
  'volume',
  'pan',
  'attack',
  'decay',
  'start',
  'end',
  'sendDelay',
  'sendReverb',
]

function sliderScreen(state: MpcState): Screen {
  return {
    title: 'Q-LINK SLIDERS',
    columns: 1,
    visual: (
      <p className={s.note}>
        Sliders control the selected pad ({padLabel(state.selectedPad)}). AFTER cycles the target.
      </p>
    ),
    params: state.qlinks.map((q, i) =>
      choiceParam(`Q${i + 1}`, {
        get: (x) => x.qlinks[i]!.target,
        set: (v) => st().setQLink(i, { target: v }),
        options: QLINK_TARGETS,
        format: () => q.target.toUpperCase(),
      }),
    ),
    fkeys: [null, null, null, null, null, null],
  }
}

function modeSelectScreen(): Screen {
  return {
    title: 'MODE — PRESS A PAD',
    columns: 1,
    visual: (
      <div className={s.modeGrid}>
        {[12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3].map((i) => (
          <span key={i}>{MODE_LABELS[i] ? `${i + 1}:${MODE_LABELS[i]}` : `${i + 1}:-`}</span>
        ))}
      </div>
    ),
    params: [],
    fkeys: [
      null,
      null,
      null,
      null,
      null,
      { label: 'CANCEL', action: () => st().set({ modeSelect: false }) },
    ],
  }
}

export function buildScreen(state: MpcState, u: LcdUi): Screen {
  if (state.modeSelect) return modeSelectScreen()
  switch (state.mode) {
    case 'main':
      return mainScreen(state)
    case 'trim':
      return trimScreen(state, u)
    case 'program':
      return programScreen(state)
    case 'mixer':
      return mixerScreen(state)
    case 'effect':
      return effectScreen(state)
    case 'record':
      return recordScreen(state, u)
    case 'load':
      return loadScreen(state)
    case 'save':
      return saveScreen(state, u)
    case 'song':
      return songScreen(state)
    case 'seqedit':
      return seqEditScreen(state, u)
    case 'midi':
      return midiScreen()
    case 'other':
      return otherScreen()
    case 'slider':
      return sliderScreen(state)
  }
}
