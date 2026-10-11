import { useEffect, useRef, useState } from 'react'
import { engine } from '../../audio/engine'
import s from './lcd.module.css'

interface WaveformProps {
  sampleId: string | null
  start: number
  end: number
  zoom?: number
  slices?: number[]
  height?: number
  onChange?: (region: { start: number; end: number }) => void
}

const INK = '#1b2610'
const DIM = 'rgba(27, 38, 16, 0.28)'

/** LCD-styled waveform with draggable start / end markers. */
export function Waveform({
  sampleId,
  start,
  end,
  zoom = 1,
  slices,
  height = 70,
  onChange,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const drag = useRef<'start' | 'end' | null>(null)

  // View window: zoom around the region centre
  const span = 1 / zoom
  const centre = (start + end) / 2
  const viewStart = Math.min(Math.max(0, centre - span / 2), 1 - span)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)))
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !width) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    const g = canvas.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, width, height)

    const buffer = sampleId ? engine.getBuffer(sampleId) : undefined
    if (!buffer) {
      g.fillStyle = INK
      g.font = '16px VT323, monospace'
      g.textAlign = 'center'
      g.fillText('NO SAMPLE — DROP A FILE ON A PAD', width / 2, height / 2 + 5)
      return
    }

    const data = buffer.getChannelData(0)
    const mid = height / 2
    const toX = (f: number) => ((f - viewStart) / span) * width
    const first = Math.floor(viewStart * data.length)
    const perPx = (span * data.length) / width

    g.strokeStyle = INK
    g.lineWidth = 1
    for (let x = 0; x < width; x++) {
      const from = first + Math.floor(x * perPx)
      const to = Math.max(from + 1, first + Math.floor((x + 1) * perPx))
      let min = 1
      let max = -1
      for (
        let i = from;
        i < to && i < data.length;
        i += Math.max(1, Math.floor((to - from) / 64))
      ) {
        const v = data[i]!
        if (v < min) min = v
        if (v > max) max = v
      }
      if (min > max) continue
      const f = viewStart + (x / width) * span
      g.strokeStyle = f < start || f > end ? DIM : INK
      g.beginPath()
      g.moveTo(x + 0.5, mid - max * mid * 0.92)
      g.lineTo(x + 0.5, mid - min * mid * 0.92 + 1)
      g.stroke()
    }

    // Centre line
    g.fillStyle = DIM
    g.fillRect(0, mid, width, 1)

    g.fillStyle = INK
    for (const sl of slices ?? []) {
      const x = toX(start + sl * (end - start))
      for (let y = 0; y < height; y += 4) g.fillRect(Math.round(x), y, 1, 2)
    }

    // Start / end markers with flags
    for (const [f, tag] of [
      [start, 'S'],
      [end, 'E'],
    ] as const) {
      const x = Math.round(toX(f))
      if (x < -2 || x > width + 2) continue
      g.fillRect(x - (tag === 'E' ? 1 : 0), 0, 2, height)
      const fx = tag === 'S' ? x : x - 11
      g.fillRect(fx, 0, 11, 11)
      g.fillStyle = '#a9c47f'
      g.font = '12px VT323, monospace'
      g.fillText(tag, fx + 3, 9)
      g.fillStyle = INK
    }
  }, [sampleId, start, end, width, height, viewStart, span, slices])

  const fractionAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, viewStart + ((clientX - rect.left) / rect.width) * span))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onChange) return
    const f = fractionAt(e.clientX)
    drag.current = Math.abs(f - start) <= Math.abs(f - end) ? 'start' : 'end'
    e.currentTarget.setPointerCapture(e.pointerId)
    onPointerMove(e)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !onChange) return
    const f = fractionAt(e.clientX)
    if (drag.current === 'start') onChange({ start: Math.min(f, end - 0.001), end })
    else onChange({ start, end: Math.max(f, start + 0.001) })
  }

  return (
    <canvas
      ref={canvasRef}
      className={s.waveform}
      style={{ height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        drag.current = null
      }}
      aria-label="Sample waveform — drag to set start and end points"
    />
  )
}
