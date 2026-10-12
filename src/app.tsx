import { useEffect, useState } from 'react'
import s from './app.module.css'
import { engine } from './audio/engine'
import { bindInput, initMidi } from './audio/midi'
import { FileDrop } from './components/file-drop/file-drop'
import { useLcdUi } from './components/lcd/lcd-ui'
import { adjustCursorParam } from './components/lcd/params'
import { Mpc } from './components/mpc/mpc'
import { Sequencer } from './components/sequencer/sequencer'
import { usePicker } from './components/sound-picker/picker-store'
import { SoundPicker } from './components/sound-picker/sound-picker'
import { Tb303 } from './components/tb303/tb303'
import { Toasts } from './components/toast/toasts'
import { Guide } from './guide/guide'
import { openGuide, useGuide } from './guide/guide-store'
import { HintBar } from './guide/hint-bar'
import { Welcome } from './guide/welcome'
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
        if (x.acid !== prev.acid) engine.updateAcid(x.acid)
      }),
    [],
  )

  useKeyboard()

  return (
    <main className={s.app}>
      <header className={s.topbar}>
        <p className={s.tagline}>
          <strong>MPC 1000</strong> · Browser Edition — sampler, step sequencer &amp; TB-303
        </p>
        <button type="button" className={s.howTo} data-hint="guide" onClick={() => openGuide()}>
          <span aria-hidden>?</span> How to use
        </button>
      </header>
      <div className={s.stage} data-ready={ready || undefined}>
        <div className={s.left}>
          <Mpc />
          <Tb303 />
        </div>
        <Sequencer />
      </div>
      {ready ? null : <p className={s.boot}>Loading sounds…</p>}
      <HintBar />
      <Guide />
      <SoundPicker />
      <FileDrop />
      <Toasts />
      <Welcome />
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
    engine.updateAcid(x.acid)
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
      if (
        useGuide.getState().open ||
        usePicker.getState().pad !== null ||
        document.querySelector('dialog[open]')
      )
        return
      if (e.key === '?') {
        e.preventDefault()
        openGuide()
        return
      }
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
