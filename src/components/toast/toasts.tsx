import { dismissToast, useToasts } from '../../state/toast'
import s from './toasts.module.css'

export function Toasts() {
  const toasts = useToasts((t) => t.toasts)
  return (
    <div className={s.stack} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={s.toast} data-kind={t.kind}>
          <span>{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
