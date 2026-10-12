import { useEffect, useRef, useState } from 'react'
import { lcdFKeys } from '../components/lcd/lcd'
import { MODE_LABELS } from '../state/pad-input'
import { useMpc } from '../state/store'
import { CONTROL_HINTS, fieldHelp, fkeyHelp } from './guide-content'
import { openGuide } from './guide-store'
import s from './hint-bar.module.css'

interface Hint {
  name: string
  text: string
}

const IDLE: Hint = {
  name: 'Tip',
  text: 'Hover over or tab to any button, knob, pad or screen field to see what it does.',
}

/** Turns the element under the pointer into a plain-English description. */
function describe(el: HTMLElement): Hint | null {
  const id = el.dataset.hint ?? ''
  const state = useMpc.getState()
  const mode = state.mode

  if (id.startsWith('fkey-')) {
    const index = Number(id.slice(5))
    const key = lcdFKeys.keys[index]
    if (!key) return { name: `F${index + 1}`, text: 'Not used on this screen.' }
    return {
      name: `F${index + 1} — ${key.label}`,
      text: fkeyHelp(mode, key.label) ?? CONTROL_HINTS.fkey!.text,
    }
  }

  if (id === 'lcd-field') {
    const label = el.getAttribute('aria-label') ?? ''
    const value = el.getAttribute('aria-valuetext') ?? ''
    return {
      name: `${label}: ${value}`,
      text: `${fieldHelp(mode, label) ?? 'Screen field.'} — turn the DATA wheel, scroll, or drag up/down to change it.`,
    }
  }

  if (id === 'pad') {
    const pad = el.querySelector('button')
    const label = pad?.getAttribute('aria-label') ?? 'Pad'
    if (state.modeSelect) {
      const position = Number(/Pad (\d+)/.exec(label)?.[1] ?? 0) - 1
      const mode = MODE_LABELS[position]
      return {
        name: `${label.split(' —')[0]} (MODE)`,
        text: mode ? `Opens the ${mode} screen.` : 'No screen on this pad — cancels MODE.',
      }
    }
    return { name: label, text: CONTROL_HINTS.pad!.text }
  }

  const control = CONTROL_HINTS[id]
  return control ? { name: control.name, text: control.text } : null
}

/** Status strip along the bottom of the window describing whatever control is under the pointer. */
export function HintBar() {
  const [hint, setHint] = useState<Hint>(IDLE)
  const current = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const show = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest<HTMLElement>('[data-hint]') : null
      current.current = el
      setHint((el && describe(el)) || IDLE)
    }
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') show(e.target)
    }
    const focus = (e: FocusEvent) => show(e.target)
    // Refresh in place when the screen behind an F-key or field changes
    const unsubscribe = useMpc.subscribe(() => {
      if (current.current) setHint(describe(current.current) || IDLE)
    })
    document.addEventListener('pointerover', over)
    document.addEventListener('focusin', focus)
    return () => {
      unsubscribe()
      document.removeEventListener('pointerover', over)
      document.removeEventListener('focusin', focus)
    }
  }, [])

  return (
    <aside className={s.bar} aria-label="Control help">
      <span className={s.name}>{hint.name}</span>
      <span className={s.text}>{hint.text}</span>
      <button type="button" className={s.guide} data-hint="guide" onClick={() => openGuide()}>
        ? GUIDE
      </button>
    </aside>
  )
}
