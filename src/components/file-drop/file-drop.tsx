import { useEffect, useState } from 'react'
import { padLabel } from '../../state/format'
import { loadFilesToPads } from '../../state/library'
import { useMpc } from '../../state/store'
import s from './file-drop.module.css'

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')

/**
 * Page-wide file dragging. Pads and the LCD handle their own drops; this keeps the browser from
 * opening a file dropped anywhere else (which would replace the app), loads such drops onto the
 * selected pad, and shows where files will go while a drag is in progress.
 */
export function FileDrop() {
  const [dragging, setDragging] = useState(false)
  const selected = useMpc((x) => x.selectedPad)

  useEffect(() => {
    let depth = 0
    const html = document.documentElement
    const end = () => {
      depth = 0
      setDragging(false)
      delete html.dataset.fileDrag
    }
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
      html.dataset.fileDrag = 'true'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) end()
    }
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    // Capture phase: runs before the pad / LCD handlers, which may stop propagation
    const dropCapture = (e: DragEvent) => {
      if (hasFiles(e)) end()
    }
    // Bubble phase: only drops nothing else handled get here
    const drop = (e: DragEvent) => {
      if (!hasFiles(e) || e.defaultPrevented) return
      e.preventDefault()
      void loadFilesToPads([...(e.dataTransfer?.files ?? [])], useMpc.getState().selectedPad)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', dropCapture, true)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', dropCapture, true)
      window.removeEventListener('drop', drop)
    }
  }, [])

  if (!dragging) return null
  return (
    <div className={s.banner} role="status">
      <strong>Drop audio on a pad</strong> to load it there · on the screen to fill pads in order ·
      anywhere else loads onto the selected pad, {padLabel(selected)}
    </div>
  )
}
