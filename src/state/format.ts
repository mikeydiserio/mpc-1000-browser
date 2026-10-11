import { BANK_NAMES, PADS_PER_BANK } from './types'

/** "A01".."D16" */
export function padLabel(pad: number) {
  return `${BANK_NAMES[Math.floor(pad / PADS_PER_BANK)]}${String((pad % PADS_PER_BANK) + 1).padStart(2, '0')}`
}

export function signed(n: number, digits = 0) {
  const v = n.toFixed(digits)
  return n > 0 ? `+${v}` : v
}

export function pct(v: number) {
  return `${Math.round(v * 100)}`
}

export function hz(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k` : `${Math.round(v)}`
}

export function seqLabel(index: number) {
  return String(index + 1).padStart(2, '0')
}
