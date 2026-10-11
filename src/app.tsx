import { useEffect, useState } from 'react'
import s from './app.module.css'
import { engine } from './audio/engine'
import { bindInput, initMidi } from './audio/midi'
import { useLcdUi } from './components/lcd/lcd-ui'
import { adjustCursorParam } from './components/lcd/params'
import { Mpc } from './components/mpc/mpc'
import { Sequencer } from './components/sequencer/sequencer'
import { commands } from './state/commands'
import { newProject, restoreSession, saveNow, startAutosave } from './state/library'
import { PAD_KEYS, pressPad, releasePad } from './state/pad-input'
import { useMpc } from './state/store'

export function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void boot().then(() => setReady(true))
  }, [])

  // Keep the mix bus in sync with FX, tempo and master volume
  useEffect(
    () =>
      useMpc.subscribe((x, prev) => {
        if (x.fx !== prev.fx || x.bpm !== prev.bpm || x.master.volume !== prev.master.volume) {
          engine.updateMix(x.fx, x.bpm, x.master.volume)
        }
      }),
    [],
  )

  useKeyboard()

  return (
    <main className={s.app}>
      <div className={s.stage} data-ready={ready || undefined}>
        <Mpc />
        <Sequencer />
      </div>
      {ready ? null : <p className={s.boot}>Loading sounds…</p>}
    </main>
  )
}

/** Physical key codes so Shift (accent velocity) doesn't change which pad a key hits. */
const PAD_CODES = PAD_KEYS.map((k) => (/\d/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`))

let booting: Promise<void> | null = null

/** Restore the last session (or build a fresh one) exactly once, even under StrictMode. */
function boot() {
  booting ??= (async () => {
    const restored = await restoreSession().catch(() => false)
    if (!restored) await newProject()
    startAutosave()
    if (!restored) saveNow()
    const x = useMpc.getState()
    engine.updateMix(x.fx, x.bpm, x.master.volume)
    const inputs = await initMidi()
    if (inputs.length) bindInput(useMpc.getState().midiInputId)
  })()
  return booting
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'SELECT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable)
  )
}

/** Computer keyboard as a controller: 4×4 pad block, transport, cursor and data entry. */
function useKeyboard() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') useMpc.getState().set({ shift: true })
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const position = PAD_CODES.indexOf(e.code)
      if (position !== -1) {
        e.preventDefault()
        if (!e.repeat) pressPad(position, e.shiftKey ? 127 : 100)
        return
      }
      // Buttons/inputs keep their native Space/Enter behaviour
      const focusedControl = (e.target as HTMLElement | null)?.closest('button, [data-own-keys]')
      switch (e.key) {
        case ' ':
          if (focusedControl) return
          e.preventDefault()
          if (!e.repeat) commands.togglePlay()
          break
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          if (focusedControl) return
          e.preventDefault()
          commands.cursor(e.key.slice(5).toLowerCase() as 'up' | 'down' | 'left' | 'right')
          break
        case '.':
        case '=':
        case '+':
          adjustCursorParam(1, e.shiftKey)
          break
        case ',':
        case '-':
          adjustCursorParam(-1, e.shiftKey)
          break
        case 'Escape':
          useMpc.getState().set({ modeSelect: false })
          useLcdUi.setState({ expanded: false })
          break
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') useMpc.getState().set({ shift: false })
      const position = PAD_CODES.indexOf(e.code)
      if (position !== -1) releasePad(position)
    }
    const blur = () => {
      useMpc.getState().set({ shift: false, erase: false })
      for (let i = 0; i < 16; i++) releasePad(i)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
}
