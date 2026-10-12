import { useEffect, useLayoutEffect, useRef } from 'react'
import s from './controls.module.css'

type Variant = 'grey' | 'dark' | 'red' | 'orange' | 'white' | 'cream'

interface HwButtonProps {
  /** Silkscreen text printed on the body above the button */
  label?: string
  /** Text on the button cap itself */
  cap?: string
  ariaLabel?: string
  variant?: Variant
  size?: 'sm' | 'md' | 'lg' | 'wide'
  led?: boolean | 'blink'
  ledColor?: 'red' | 'green'
  onPress?: () => void
  onRelease?: () => void
  className?: string
  /** Guide id shown in the hint strip on hover / focus */
  hint?: string
}

/**
 * Rubber hardware button. Fires on pointer-down for an instant, hardware-like feel, and still
 * supports keyboard activation (Enter/Space) via click.
 */
export function HwButton({
  label,
  cap,
  ariaLabel,
  variant = 'grey',
  size = 'md',
  led,
  ledColor = 'red',
  onPress,
  onRelease,
  className,
  hint,
}: HwButtonProps) {
  const pointerFired = useRef(false)
  return (
    <div className={`${s.hw} ${className ?? ''}`} data-size={size} data-hint={hint}>
      {label ? <span className={s.silk}>{label}</span> : null}
      <div className={s.hwRow}>
        {led !== undefined ? (
          <span
            className={s.led}
            data-on={led || undefined}
            data-blink={led === 'blink' || undefined}
            data-color={ledColor}
          />
        ) : null}
        <button
          type="button"
          className={s.button}
          data-variant={variant}
          aria-label={ariaLabel ?? label ?? cap}
          aria-pressed={led === undefined ? undefined : !!led}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            pointerFired.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            onPress?.()
          }}
          onPointerUp={() => onRelease?.()}
          onPointerCancel={() => onRelease?.()}
          onClick={() => {
            if (pointerFired.current) {
              pointerFired.current = false
              return
            }
            onPress?.()
            onRelease?.()
          }}
        >
          {cap}
        </button>
      </div>
    </div>
  )
}

interface KnobProps {
  label: string
  value: number
  onChange: (v: number) => void
  defaultValue?: number
  hint?: string
}

/** Chrome rotary pot, 270° sweep. Drag vertically, scroll, or use arrow keys. */
export function Knob({ label, value, onChange, defaultValue = 0.7, hint }: KnobProps) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; v: number } | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      onChangeRef.current(clamp01(valueRef.current - e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className={s.knobWrap} data-hint={hint}>
      <span className={s.silk}>{label}</span>
      <div
        ref={ref}
        className={s.knob}
        role="slider"
        tabIndex={0}
        data-own-keys
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, v: value }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          onChange(clamp01(drag.current.v + (drag.current.y - e.clientY) / 160))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onDoubleClick={() => onChange(defaultValue)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp01(value + 0.02))
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp01(value - 0.02))
        }}
      >
        <span className={s.knobTicks} />
        <span className={s.knobCap} style={{ transform: `rotate(${-135 + value * 270}deg)` }}>
          <span className={s.knobLine} />
        </span>
      </div>
    </div>
  )
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function rotateCap(angle: { current: number }, cap: HTMLElement | null, deg: number) {
  angle.current += deg
  if (cap) cap.style.transform = `rotate(${angle.current}deg)`
}

interface DataWheelProps {
  onStep: (dir: number) => void
}

/** Endless DATA encoder. Drag around it (or vertically), or scroll. ~15° per detent. */
export function DataWheel({ onStep }: DataWheelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const capRef = useRef<HTMLSpanElement>(null)
  const angle = useRef(0)
  const drag = useRef<{ last: number; acc: number } | null>(null)
  const onStepRef = useRef(onStep)
  useLayoutEffect(() => {
    onStepRef.current = onStep
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const dir = e.deltaY < 0 ? 1 : -1
      rotateCap(angle, capRef.current, dir * 15)
      onStepRef.current(dir)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const pointerAngle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return (
      (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) /
      Math.PI
    )
  }

  return (
    <div className={s.wheelWrap} data-hint="data-wheel">
      <span className={s.silk}>DATA</span>
      <div
        ref={ref}
        className={s.wheel}
        role="spinbutton"
        tabIndex={0}
        data-own-keys
        aria-label="Data wheel — adjusts the selected screen value"
        aria-valuetext="endless"
        onPointerDown={(e) => {
          drag.current = { last: pointerAngle(e), acc: 0 }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          const a = pointerAngle(e)
          let delta = a - d.last
          if (delta > 180) delta -= 360
          if (delta < -180) delta += 360
          d.last = a
          d.acc += delta
          rotateCap(angle, capRef.current, delta)
          while (Math.abs(d.acc) >= 15) {
            const dir = Math.sign(d.acc)
            d.acc -= dir * 15
            onStep(dir)
          }
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault()
            rotateCap(angle, capRef.current, 15)
            onStep(1)
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault()
            rotateCap(angle, capRef.current, -15)
            onStep(-1)
          }
        }}
      >
        <span ref={capRef} className={s.wheelCap}>
          <span className={s.wheelDimple} />
        </span>
      </div>
    </div>
  )
}

interface FaderProps {
  label: string
  target: string
  value: number
  onChange: (v: number) => void
}

/** Q-Link style vertical slider. */
export function Fader({ label, target, value, onChange }: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const setFrom = (clientY: number) => {
    const r = trackRef.current!.getBoundingClientRect()
    onChange(clamp01(1 - (clientY - r.top) / r.height))
  }
  return (
    <div className={s.fader} data-hint="qlink-slider">
      <span className={s.faderLabel}>{label}</span>
      <div
        ref={trackRef}
        className={s.faderTrack}
        role="slider"
        tabIndex={0}
        data-own-keys
        aria-label={`${label} slider (${target})`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setFrom(e.clientY)
        }}
        onPointerMove={(e) => {
          if (e.buttons) setFrom(e.clientY)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onChange(clamp01(value + 0.02))
          if (e.key === 'ArrowDown') onChange(clamp01(value - 0.02))
        }}
      >
        <span className={s.faderSlot} />
        <span className={s.faderThumb} style={{ top: `${(1 - value) * 100}%` }} />
      </div>
      <span className={s.faderTarget}>{target}</span>
    </div>
  )
}
