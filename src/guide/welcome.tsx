import { useEffect, useRef, useState } from 'react'
import { openGuide } from './guide-store'
import s from './welcome.module.css'

const SEEN_KEY = 'mpc:welcomed'

const STEPS: [title: string, text: string][] = [
  ['Play', 'Click a pad — or press Z X C V, A S D F, Q W E R, 1 2 3 4 on your keyboard.'],
  ['Hear a beat', 'Press PLAY in the sequencer (or Space). The green column is the playhead.'],
  [
    'Load a classic machine',
    'Click TR-808, TR-909, TR-606 or LinnDrum above the sequencer for a kit, grooves and a TB-303 bassline.',
  ],
  [
    'Use your own sounds',
    'Drag audio files from your computer onto any pad. Right-click a pad to browse the built-in sounds.',
  ],
  [
    'Learn any control',
    'Hover over anything — the strip at the bottom of the window says what it does.',
  ],
]

/** One-time welcome on the first visit; reopen any time from the How to use button. */
export function Welcome() {
  const ref = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(() => localStorage.getItem(SEEN_KEY) === null)

  useEffect(() => {
    const dialog = ref.current
    if (open && dialog && !dialog.open) dialog.showModal()
  }, [open])

  const close = (thenGuide: boolean) => {
    localStorage.setItem(SEEN_KEY, '1')
    ref.current?.close()
    setOpen(false)
    if (thenGuide) openGuide()
  }

  if (!open) return null
  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="welcome-title"
      onClose={() => close(false)}
    >
      <h1 id="welcome-title">Welcome to the MPC 1000 — Browser Edition</h1>
      <p className={s.lead}>
        A sampler, step sequencer and TB-303 in your browser. Five things to try:
      </p>
      <ol className={s.steps}>
        {STEPS.map(([title, text]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ol>
      <p className={s.lead}>
        The full guide explains every button, screen and workflow. Open it any time with{' '}
        <b>How to use</b> at the top of the page or the <kbd>?</kbd> key.
      </p>
      <div className={s.actions}>
        <button type="button" className={s.secondary} onClick={() => close(true)}>
          Open the full guide
        </button>
        <button type="button" className={s.primary} onClick={() => close(false)}>
          Start making beats
        </button>
      </div>
    </dialog>
  )
}
