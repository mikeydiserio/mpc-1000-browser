import { useState } from 'react'
import { usePadActivity } from '../../audio/transport'
import { loadFilesToPads } from '../../state/library'
import { MODE_LABELS, PAD_KEYS, pressPad, releasePad, usePadsDown } from '../../state/pad-input'
import { useMpc } from '../../state/store'
import { PADS_PER_BANK } from '../../state/types'
import { openSoundPicker } from '../sound-picker/picker-store'
import s from './pads.module.css'

/** Visual order: PAD13–16 on top, PAD1–4 at the bottom, like the hardware. */
const ROWS = [
  [12, 13, 14, 15],
  [8, 9, 10, 11],
  [4, 5, 6, 7],
  [0, 1, 2, 3],
]

const TOP_SILK = ['PLAY LOOP', 'PLAY TO', 'PLAY FROM', 'PLAY ALL']

export function PadGrid() {
  return (
    <div className={s.grid}>
      {ROWS.map((row, r) =>
        row.map((position, c) => (
          <Pad key={position} position={position} topSilk={r === 0 ? TOP_SILK[c] : undefined} />
        )),
      )}
    </div>
  )
}

function Pad({ position, topSilk }: { position: number; topSilk?: string }) {
  const bank = useMpc((x) => x.bank)
  const pad = bank * PADS_PER_BANK + position
  const selected = useMpc((x) => x.selectedPad === pad && !x.sixteenLevels.on)
  const muted = useMpc((x) => x.mutes[pad])
  const trackMuteMode = useMpc((x) => x.trackMuteMode)
  const modeSelect = useMpc((x) => x.modeSelect)
  const sixteen = useMpc((x) => x.sixteenLevels)
  const name = useMpc((x) => {
    const id = x.pads[pad]?.sampleId
    return id ? x.samples[id]?.name : undefined
  })
  const hit = usePadActivity((a) => a.hits[sixteen.on ? sixteen.source : pad])
  const down = usePadsDown((d) => !!d.down[position])
  const [over, setOver] = useState(false)

  const caption = modeSelect
    ? (MODE_LABELS[position] ?? '')
    : sixteen.on
      ? sixteen.param === 'velocity'
        ? `VEL ${Math.round(((position + 1) * 127) / 16)}`
        : `${position - 4 > 0 ? '+' : ''}${position - 4} st`
      : (name ?? '')

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target only — the whole cell (pad + printed label) takes dropped files so near misses still land; the pad button inside is the control
    <div
      className={s.cell}
      data-hint="pad"
      data-drop={over || undefined}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        void loadFilesToPads([...e.dataTransfer.files], pad)
      }}
    >
      {topSilk ? <span className={s.topSilk}>{topSilk}</span> : null}
      <span className={s.silk}>
        PAD{position + 1}
        {MODE_LABELS[position] ? <em> {MODE_LABELS[position]}</em> : null}
      </span>
      <button
        type="button"
        className={s.pad}
        data-down={down || undefined}
        data-selected={selected || undefined}
        data-muted={(trackMuteMode && muted) || undefined}
        data-mode-select={modeSelect || undefined}
        aria-label={`Pad ${position + 1}${name ? ` — ${name}` : ''} (key ${PAD_KEYS[position]?.toUpperCase()})`}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          const r = e.currentTarget.getBoundingClientRect()
          // Hit near the top edge = harder, like velocity-sensitive rubber
          const ratio = 1 - (e.clientY - r.top) / r.height
          pressPad(position, Math.round(45 + Math.min(1, Math.max(0, ratio)) * 82))
        }}
        onContextMenu={(e) => {
          // Right-click: choose this pad's sound without playing it
          e.preventDefault()
          openSoundPicker(pad)
        }}
        onPointerUp={() => releasePad(position)}
        onPointerCancel={() => releasePad(position)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
            e.preventDefault()
            pressPad(position, 100)
          }
        }}
        onKeyUp={(e) => {
          if (e.key === 'Enter' || e.key === ' ') releasePad(position)
        }}
      >
        {hit ? <span key={hit} className={s.flash} /> : null}
        <span className={s.key}>{PAD_KEYS[position]?.toUpperCase()}</span>
        <span className={s.caption}>{trackMuteMode && muted ? 'MUTED' : caption}</span>
      </button>
    </div>
  )
}
