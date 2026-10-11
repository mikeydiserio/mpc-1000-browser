import { useEffect, useRef } from 'react'
import { sampler } from '../../audio/sampler'
import { stepsPerBeat } from '../../audio/timing'
import { usePlayhead } from '../../audio/transport'
import { seqLabel } from '../../state/format'
import { useMpc } from '../../state/store'
import { PADS_PER_BANK } from '../../state/types'
import s from './lcd.module.css'
import { useLcdUi } from './lcd-ui'

/** MPC "Now:001.01.00" bar.beat.step counter. */
export function PositionCounter() {
  const step = usePlayhead((p) => p.step)
  const countIn = usePlayhead((p) => p.countIn)
  const pattern = useMpc((x) => x.patterns[x.currentPattern]!)
  const playing = useMpc((x) => x.playing)
  const record = useMpc((x) => x.record)
  const spb = stepsPerBeat(pattern.resolution)
  const at = Math.max(0, step)
  const bar = Math.floor(at / (spb * 4)) + 1
  const beat = (Math.floor(at / spb) % 4) + 1
  const sub = at % spb
  const bars = Math.ceil(pattern.length / (spb * 4))
  const status = countIn
    ? 'COUNT IN'
    : playing
      ? record === 'off'
        ? 'PLAY'
        : record.toUpperCase()
      : 'STOP'
  return (
    <div className={s.counter}>
      <span>
        Now:{String(bar).padStart(3, '0')}.{String(beat).padStart(2, '0')}.
        {String(sub).padStart(2, '0')}
      </span>
      <span>Bars:{bars}</span>
      <span className={s.counterStatus} data-rec={record !== 'off' || undefined}>
        {status}
      </span>
    </div>
  )
}

export function InputMeter({ status }: { status: string }) {
  const barRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    let held = 0
    const frame = () => {
      const level = sampler.level()
      held = Math.max(level, held * 0.92)
      if (barRef.current) barRef.current.style.transform = `scaleX(${held})`
      const ui = useLcdUi.getState()
      if (timeRef.current) {
        timeRef.current.textContent = ui.sampling
          ? `${((performance.now() - ui.samplingStarted) / 1000).toFixed(1)}s`
          : ''
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className={s.meterWrap}>
      <div className={s.meterLabel}>
        <span>{status}</span>
        <span ref={timeRef} />
      </div>
      <div className={s.meter}>
        <div ref={barRef} className={s.meterFill} />
      </div>
      <div className={s.meterScale}>
        <span>-∞</span>
        <span>-24</span>
        <span>-12</span>
        <span>-6</span>
        <span>0dB</span>
      </div>
    </div>
  )
}

export function MixerStrips() {
  const bank = useMpc((x) => x.bank)
  const pads = useMpc((x) => x.pads)
  const mutes = useMpc((x) => x.mutes)
  const selected = useMpc((x) => x.selectedPad)
  const selectPad = useMpc((x) => x.selectPad)
  const indexes = Array.from({ length: PADS_PER_BANK }, (_, i) => bank * PADS_PER_BANK + i)
  return (
    <div className={s.strips}>
      {indexes.map((i) => {
        const p = pads[i]!
        return (
          <button
            type="button"
            key={i}
            className={s.strip}
            data-selected={i === selected || undefined}
            data-muted={mutes[i] || undefined}
            onClick={() => selectPad(i)}
            aria-label={`Select pad ${(i % PADS_PER_BANK) + 1}`}
          >
            <span className={s.stripTrack}>
              <span className={s.stripFill} style={{ transform: `scaleY(${p.volume})` }} />
            </span>
            <span className={s.stripPan} style={{ left: `${50 + p.pan * 45}%` }} />
            <span className={s.stripNum}>{(i % PADS_PER_BANK) + 1}</span>
          </button>
        )
      })}
    </div>
  )
}

export function SongList() {
  const song = useMpc((x) => x.song)
  const position = useMpc((x) => x.songPosition)
  const playing = useMpc((x) => x.playing)
  const songMode = useMpc((x) => x.songMode)
  return (
    <div className={s.song}>
      {song.map((p, i) => (
        <span
          key={i}
          className={s.songStep}
          data-current={(playing && songMode && i === position) || undefined}
        >
          {seqLabel(p)}
        </span>
      ))}
    </div>
  )
}
