import { useEffect, useLayoutEffect, useRef } from 'react'
import { loadFilesToPads } from '../../state/library'
import { useMpc } from '../../state/store'
import s from './lcd.module.css'
import { useLcdUi } from './lcd-ui'
import { lcdControl } from './params'
import { buildScreen, type FKey, MODE_TITLES } from './screens'

/** The F-keys of whatever screen is showing, for the physical F1–F6 buttons. */
export const lcdFKeys: { keys: (FKey | null)[] } = { keys: [] }

const DRAG_PX_PER_STEP = 6

export function Lcd() {
  const state = useMpc()
  const ui = useLcdUi()
  const screen = buildScreen(state, ui)
  const paramsRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ index: number; y: number } | null>(null)

  useLayoutEffect(() => {
    lcdControl.params = screen.params
    lcdControl.columns = screen.columns ?? 2
    lcdFKeys.keys = screen.fkeys
  })

  // Keep the cursor on a real row when screens change size
  const paramCount = screen.params.length
  useEffect(() => {
    if (paramCount && state.cursor >= paramCount) useMpc.setState({ cursor: paramCount - 1 })
  }, [paramCount, state.cursor])

  // Wheel needs a non-passive listener to stop the page scrolling
  useEffect(() => {
    const el = paramsRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-index]')
      if (!row) return
      e.preventDefault()
      const index = Number(row.dataset.index)
      useMpc.setState({ cursor: index })
      lcdControl.params[index]?.step(e.deltaY < 0 ? 1 : -1, e.shiftKey)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    void loadFilesToPads([...e.dataTransfer.files], useMpc.getState().selectedPad)
  }

  return (
    <section
      className={s.lcd}
      data-expanded={ui.expanded || undefined}
      aria-label="LCD screen"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className={s.screen}>
        <header className={s.titleBar}>
          <span className={s.mode}>{state.modeSelect ? 'MODE' : MODE_TITLES[state.mode]}</span>
          <span className={s.title}>{screen.title}</span>
          <span className={s.bpm}>♩{state.bpm.toFixed(1)}</span>
        </header>

        {screen.visual ? <div className={s.visual}>{screen.visual}</div> : null}

        <div ref={paramsRef} className={s.params} data-columns={screen.columns ?? 2}>
          {screen.params.map((p, i) => (
            <div
              key={p.label}
              data-index={i}
              role="spinbutton"
              tabIndex={-1}
              aria-label={p.label}
              aria-valuetext={p.value}
              className={s.param}
              data-selected={i === state.cursor || undefined}
              onPointerDown={(e) => {
                useMpc.setState({ cursor: i })
                dragRef.current = { index: i, y: e.clientY }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const drag = dragRef.current
                if (!drag) return
                const steps = Math.trunc((drag.y - e.clientY) / DRAG_PX_PER_STEP)
                if (!steps) return
                drag.y -= steps * DRAG_PX_PER_STEP
                const dir = Math.sign(steps)
                for (let n = 0; n < Math.abs(steps); n++)
                  lcdControl.params[drag.index]?.step(dir, e.shiftKey)
              }}
              onPointerUp={() => {
                dragRef.current = null
              }}
              onDoubleClick={() => lcdControl.params[i]?.step(1, false)}
            >
              <span className={s.label}>{p.label}:</span>
              <span className={s.value}>{p.value}</span>
            </div>
          ))}
        </div>

        <footer className={s.fkeyBar}>
          {screen.fkeys.map((f, i) => (
            <span
              key={i}
              className={s.fkeyLabel}
              data-active={f?.active || undefined}
              data-empty={!f || undefined}
            >
              {f?.label ?? ''}
            </span>
          ))}
        </footer>

        {state.message ? <div className={s.message}>{state.message}</div> : null}
      </div>
      {ui.expanded ? (
        <button
          type="button"
          className={s.backdrop}
          aria-label="Close enlarged screen"
          onClick={() => useLcdUi.setState({ expanded: false })}
        />
      ) : null}
    </section>
  )
}
