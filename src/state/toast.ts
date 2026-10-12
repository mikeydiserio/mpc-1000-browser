import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  kind: 'ok' | 'error'
}

/** Short notices that need to be seen (file loads, failures) — the LCD flash is easy to miss. */
export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }))

let nextId = 1

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = nextId++
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }))
  setTimeout(dismissToast, kind === 'error' ? 6000 : 3500, id)
}

export function dismissToast(id: number) {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}
