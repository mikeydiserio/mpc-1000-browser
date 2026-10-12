import { create } from 'zustand'

export const useGuide = create<{ open: boolean; section: string | null }>(() => ({
  open: false,
  section: null,
}))

export function openGuide(section: string | null = null) {
  useGuide.setState({ open: true, section })
}
