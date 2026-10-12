import { useEffect, useRef } from 'react'
import s from './guide.module.css'
import {
  BROWSER_NOTES,
  type Control,
  KEYS,
  PAD_MODES,
  PANEL,
  QUICK_START,
  type Row,
  SAVING,
  SCREENS,
  SEQUENCER,
  WORKFLOWS,
} from './guide-content'
import { useGuide } from './guide-store'

const SECTIONS = [
  ['start', 'Quick start'],
  ['panel', 'Every button'],
  ['pads', 'Pads & MODE'],
  ['screens', 'Screens'],
  ['sequencer', 'Sequencer'],
  ['workflows', 'How to…'],
  ['keys', 'Keyboard & MIDI'],
  ['saving', 'Saving'],
] as const

/** Close the guide, scroll to the control on the device and flash it. */
function showMe(id: string) {
  useGuide.setState({ open: false })
  const el = document.querySelector<HTMLElement>(`[data-hint="${id}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.dataset.spotlight = 'true'
  setTimeout(() => delete el.dataset.spotlight, 2200)
}

export function Guide() {
  const open = useGuide((g) => g.open)
  const section = useGuide((g) => g.section)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      if (section) dialog.querySelector(`#guide-${section}`)?.scrollIntoView()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, section])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; Esc closes natively
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="guide-title"
      onClose={() => useGuide.setState({ open: false })}
      onClick={(e) => {
        // Click on the backdrop (outside the panel) closes
        if (e.target === e.currentTarget) useGuide.setState({ open: false })
      }}
    >
      <div className={s.panel}>
        <header className={s.header}>
          <div>
            <h1 id="guide-title">MPC 1000 — Browser Edition</h1>
            <p>User guide · what every button, pad and screen does</p>
          </div>
          <button
            type="button"
            className={s.close}
            onClick={() => useGuide.setState({ open: false })}
          >
            Close ✕
          </button>
        </header>

        <div className={s.body}>
          <nav className={s.toc} aria-label="Guide sections">
            {SECTIONS.map(([id, title]) => (
              <a key={id} href={`#guide-${id}`}>
                {title}
              </a>
            ))}
          </nav>

          <div className={s.content}>
            <section id="guide-start">
              <h2>Quick start</h2>
              <ol className={s.steps}>
                {QUICK_START.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <ul className={s.notes}>
                {BROWSER_NOTES.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>

            <section id="guide-panel">
              <h2>Every button on the machine</h2>
              <p className={s.lead}>
                Tip: the strip at the bottom of the window describes whatever you hover. “Show me”
                flashes the control on the device.
              </p>
              {PANEL.map((group) => (
                <div key={group.title} className={s.group}>
                  <h3>{group.title}</h3>
                  <ControlList controls={group.controls} />
                </div>
              ))}
            </section>

            <section id="guide-pads">
              <h2>Pads &amp; the MODE screens</h2>
              <p className={s.lead}>
                Pads play sounds. Hitting near the top edge is louder; the computer keys Z X C V / A
                S D F / Q W E R / 1 2 3 4 are the four rows from bottom to top. There are four banks
                (A–D) of 16 pads — 64 sounds in total. Press <kbd>MODE</kbd>, then a pad, to open
                the screen printed above it:
              </p>
              <Table rows={PAD_MODES} head={['Pad', 'Screen']} />
              <p className={s.lead}>
                Pad modifiers: <strong>FULL LEVEL</strong> (always loudest),{' '}
                <strong>16 LEVELS</strong> (one sound over 16 velocities or pitches),{' '}
                <strong>TRACK MUTE</strong> (pads mute tracks), <strong>ERASE</strong> (hold + pad
                deletes hits) and <strong>TAP TEMPO</strong> held (note repeat).
              </p>
            </section>

            <section id="guide-screens">
              <h2>Screens</h2>
              <p className={s.lead}>
                Select a field by clicking it, then turn the DATA wheel, scroll, or drag up/down.
                F1–F6 run the actions in the boxes along the bottom of the screen. WINDOW enlarges
                the screen.
              </p>
              {SCREENS.map((screen) => (
                <article key={screen.mode} className={s.screen}>
                  <h3>
                    {screen.name} <span className={s.open}>{screen.open}</span>
                  </h3>
                  <p>{screen.text}</p>
                  {screen.fields.length ? (
                    <Table rows={screen.fields} head={['Field', 'What it does']} />
                  ) : null}
                  {screen.fkeys.length ? (
                    <Table rows={screen.fkeys} head={['F-key', 'Action']} keyStyle />
                  ) : null}
                </article>
              ))}
            </section>

            <section id="guide-sequencer">
              <h2>Pattern sequencer (right panel)</h2>
              <ControlList controls={SEQUENCER} />
            </section>

            <section id="guide-workflows">
              <h2>How to…</h2>
              {WORKFLOWS.map((w) => (
                <article key={w.title} className={s.workflow}>
                  <h3>{w.title}</h3>
                  <ol className={s.steps}>
                    {w.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </article>
              ))}
            </section>

            <section id="guide-keys">
              <h2>Keyboard &amp; MIDI</h2>
              <Table rows={KEYS} head={['Key', 'Does']} keyStyle />
              <p className={s.lead}>
                MIDI controllers: notes 37–52 (C#1–E2, the MPC default) play PAD1–16 of the active
                bank with velocity. Choose a device in MODE → PAD9.
              </p>
            </section>

            <section id="guide-saving">
              <h2>Saving &amp; exporting</h2>
              <ul className={s.notes}>
                {SAVING.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </dialog>
  )
}

function ControlList({ controls }: { controls: Control[] }) {
  return (
    <dl className={s.controls}>
      {controls.map((c) => (
        <div key={c.id + c.name} className={s.control}>
          <dt>
            <span>{c.name}</span>
            <button type="button" className={s.showMe} onClick={() => showMe(c.id)}>
              Show me
            </button>
          </dt>
          <dd>{c.text}</dd>
        </div>
      ))}
    </dl>
  )
}

function Table({
  rows,
  head,
  keyStyle,
}: {
  rows: Row[]
  head: [string, string]
  keyStyle?: boolean
}) {
  return (
    <table className={s.table}>
      <thead>
        <tr>
          <th scope="col">{head[0]}</th>
          <th scope="col">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, text]) => (
          <tr key={name}>
            <th scope="row">{keyStyle ? <kbd>{name}</kbd> : name}</th>
            <td>{text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
