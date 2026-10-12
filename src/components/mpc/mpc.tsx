import { sampler } from '../../audio/sampler'
import { commands } from '../../state/commands'
import { applyQLink } from '../../state/qlink'
import { useMpc } from '../../state/store'
import { BANK_NAMES, type QLinkTarget } from '../../state/types'
import { DataWheel, Fader, HwButton, Knob } from '../controls/controls'
import { Lcd, lcdFKeys } from '../lcd/lcd'
import { useLcdUi } from '../lcd/lcd-ui'
import { adjustCursorParam } from '../lcd/params'
import { PadGrid } from '../pads/pads'
import s from './mpc.module.css'

const QLINK_CYCLE: QLinkTarget[] = [
  'tune',
  'cutoff',
  'resonance',
  'decay',
  'attack',
  'volume',
  'pan',
  'start',
  'end',
  'sendReverb',
  'sendDelay',
  'fine',
]

export function Mpc() {
  const st = useMpc.getState
  const bank = useMpc((x) => x.bank)
  const fullLevel = useMpc((x) => x.fullLevel)
  const sixteen = useMpc((x) => x.sixteenLevels.on)
  const trackMute = useMpc((x) => x.trackMuteMode)
  const queued = useMpc((x) => x.queuedPattern !== null)
  const noteRepeat = useMpc((x) => x.noteRepeat)
  const modeSelect = useMpc((x) => x.modeSelect)
  const erase = useMpc((x) => x.erase)
  const shift = useMpc((x) => x.shift)
  const playing = useMpc((x) => x.playing)
  const record = useMpc((x) => x.record)
  const master = useMpc((x) => x.master)
  const qlinks = useMpc((x) => x.qlinks)
  const expanded = useLcdUi((x) => x.expanded)

  const recLed = (kind: 'rec' | 'overdub') => (record === kind ? (playing ? true : 'blink') : false)

  return (
    <div className={s.device}>
      <div className={s.screws} aria-hidden />

      {/* ── Left: logo + Q-Link ─────────────────────────────── */}
      <aside className={s.left}>
        <div className={s.logo} role="img" aria-label="MPC 1000">
          <span className={s.logoMpc}>mpc</span>
          <span className={s.logoNum}>1000</span>
        </div>
        <div className={s.qlinks}>
          {qlinks.map((q, i) => (
            <div key={q.target + String(i)} className={s.qlink}>
              <HwButton
                hint="qlink-after"
                label="AFTER"
                size="sm"
                variant="dark"
                ariaLabel={`Q${i + 1} — cycle slider target`}
                onPress={() => {
                  const next =
                    QLINK_CYCLE[(QLINK_CYCLE.indexOf(q.target) + 1) % QLINK_CYCLE.length]!
                  st().setQLink(i, { target: next })
                  st().flash(`Q${i + 1} → ${next.toUpperCase()}`)
                }}
              />
              <Fader
                label={`Q${i + 1}`}
                target={q.target}
                value={q.position}
                onChange={(v) => applyQLink(i, v)}
              />
            </div>
          ))}
          <span className={s.qlinkBrand}>
            <b>Q</b>·link
          </span>
        </div>
      </aside>

      {/* ── Centre: LCD, F-keys, pads ───────────────────────── */}
      <div className={s.centre}>
        <span className={s.mpcTitle}>MUSIC PRODUCTION CENTER</span>
        <Lcd />
        <div className={s.fkeys}>
          {['F1', 'F2', 'F3', 'F4', 'F5', 'F6'].map((f, i) => (
            <HwButton
              key={f}
              label={f}
              hint={`fkey-${i}`}
              variant="white"
              size="md"
              ariaLabel={`${f} soft key`}
              onPress={() => lcdFKeys.keys[i]?.action()}
            />
          ))}
        </div>
        <PadGrid />
      </div>

      {/* ── Right: knobs, bank, data, transport ─────────────── */}
      <div className={s.right}>
        <div className={s.knobs}>
          <Knob
            hint="rec-gain"
            label="REC GAIN"
            value={master.recGain}
            onChange={(v) => {
              st().setMaster({ recGain: v })
              sampler.setGain(v)
            }}
          />
          <Knob
            hint="main-volume"
            label="MAIN VOLUME"
            value={master.volume}
            defaultValue={0.8}
            onChange={(v) => st().setMaster({ volume: v })}
          />
        </div>

        <div className={s.group}>
          <span className={s.groupLabel}>PAD BANK</span>
          <div className={s.row4}>
            {BANK_NAMES.map((name, i) => (
              <HwButton
                hint="pad-bank"
                key={name}
                cap={name}
                size="sm"
                led={bank === i}
                ledColor="green"
                ariaLabel={`Pad bank ${name}`}
                onPress={() => st().set({ bank: i })}
              />
            ))}
          </div>
          <div className={s.row4}>
            <HwButton
              hint="full-level"
              label="FULL LEVEL"
              size="sm"
              led={fullLevel}
              onPress={() => st().set({ fullLevel: !st().fullLevel })}
            />
            <HwButton
              hint="16-levels"
              label="16 LEVELS"
              size="sm"
              led={sixteen}
              onPress={commands.sixteenLevels}
            />
            <HwButton
              hint="next-seq"
              label="NEXT SEQ"
              size="sm"
              led={queued ? 'blink' : false}
              onPress={() => commands.nextSeq(st().shift ? -1 : 1)}
            />
            <HwButton
              hint="track-mute"
              label="TRACK MUTE"
              size="sm"
              led={trackMute}
              onPress={() => st().set({ trackMuteMode: !st().trackMuteMode })}
            />
          </div>
        </div>

        <div className={s.dataBlock}>
          <div className={s.areaTap}>
            <HwButton
              hint="tap-tempo"
              label="TAP TEMPO"
              size="sm"
              led={noteRepeat}
              ariaLabel="Tap tempo — hold for note repeat, shift to latch"
              onPress={commands.tapDown}
              onRelease={commands.tapUp}
            />
            <span className={s.subSilk}>NOTE REPEAT</span>
          </div>
          <div className={s.areaWheel}>
            <DataWheel onStep={(dir) => adjustCursorParam(dir)} />
          </div>
          <div className={s.areaErase}>
            <HwButton
              hint="erase"
              label="ERASE"
              size="sm"
              led={erase}
              ariaLabel="Erase — hold with a pad to delete its events"
              onPress={() => st().set({ erase: true })}
              onRelease={() => st().set({ erase: false })}
            />
          </div>
          <div className={s.areaMode}>
            <HwButton
              hint="mode"
              label="MODE"
              size="sm"
              led={modeSelect ? 'blink' : false}
              onPress={() => st().set({ modeSelect: !st().modeSelect })}
            />
          </div>
          <div className={s.areaUndo}>
            <HwButton hint="undo-seq" label="UNDO SEQ" size="sm" onPress={() => st().undo()} />
          </div>
          <div className={s.cursorPad}>
            <HwButton
              hint="cursor"
              cap="▲"
              size="sm"
              variant="dark"
              ariaLabel="Cursor up"
              onPress={() => commands.cursor('up')}
            />
            <HwButton
              hint="cursor"
              cap="◀"
              size="sm"
              variant="dark"
              ariaLabel="Cursor left"
              onPress={() => commands.cursor('left')}
            />
            <HwButton
              hint="cursor"
              cap="▶"
              size="sm"
              variant="dark"
              ariaLabel="Cursor right"
              onPress={() => commands.cursor('right')}
            />
            <HwButton
              hint="cursor"
              cap="▼"
              size="sm"
              variant="dark"
              ariaLabel="Cursor down"
              onPress={() => commands.cursor('down')}
            />
          </div>
          <div className={s.areaMain}>
            <HwButton hint="main" label="MAIN" size="sm" onPress={() => st().setMode('main')} />
          </div>
          <div className={s.areaWindow}>
            <HwButton
              hint="window"
              label="WINDOW"
              size="sm"
              variant="orange"
              led={expanded}
              onPress={() => useLcdUi.setState({ expanded: !useLcdUi.getState().expanded })}
            />
          </div>
        </div>

        <div className={s.group}>
          <span className={s.groupLabel}>LOCATE</span>
          <div className={s.locate}>
            <HwButton
              hint="shift"
              label="SHIFT"
              size="sm"
              led={shift}
              onPress={() => st().set({ shift: true })}
              onRelease={() => st().set({ shift: false })}
            />
            <HwButton
              hint="locate-bar"
              label="◀◀ BAR"
              size="sm"
              variant="dark"
              ariaLabel="Previous bar"
              onPress={() => commands.locateBar(-1)}
            />
            <HwButton
              hint="locate-bar"
              label="BAR ▶▶"
              size="sm"
              variant="dark"
              ariaLabel="Next bar"
              onPress={() => commands.locateBar(1)}
            />
            <HwButton
              hint="play-start"
              label="PLAY START"
              size="lg"
              variant="cream"
              onPress={commands.playStart}
            />
            <span />
            <HwButton
              hint="locate-step"
              label="◀ STEP"
              size="sm"
              variant="dark"
              ariaLabel="Previous step"
              onPress={() => commands.locateStep(-1)}
            />
            <HwButton
              hint="locate-step"
              label="STEP ▶"
              size="sm"
              variant="dark"
              ariaLabel="Next step"
              onPress={() => commands.locateStep(1)}
            />
            <span />
          </div>
        </div>

        <div className={s.transport}>
          <HwButton
            hint="rec"
            label="REC"
            size="lg"
            variant="red"
            led={recLed('rec')}
            onPress={() => commands.record('rec')}
          />
          <HwButton
            hint="overdub"
            label="OVER DUB"
            size="lg"
            variant="red"
            led={recLed('overdub')}
            onPress={() => commands.record('overdub')}
          />
          <HwButton hint="stop" label="STOP" size="lg" variant="cream" onPress={commands.stop} />
          <HwButton
            hint="play"
            label="PLAY"
            size="lg"
            variant="cream"
            led={playing}
            ledColor="green"
            onPress={commands.play}
          />
        </div>
      </div>
    </div>
  )
}
