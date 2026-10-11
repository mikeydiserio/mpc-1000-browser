import { DECAY_OFF } from '../audio/voice-pool'
import { useMpc } from './store'
import type { PadParams, QLinkTarget } from './types'

/** Maps a Q-Link slider position (0..1) onto a pad parameter of the selected pad. */
export function applyQLink(index: number, position: number) {
  const s = useMpc.getState()
  const q = s.qlinks[index]
  if (!q) return
  s.setQLink(index, { position })
  const pad = s.pads[s.selectedPad]!
  s.setPad(s.selectedPad, mapTarget(q.target, position, pad))
}

function mapTarget(target: QLinkTarget, p: number, pad: PadParams): Partial<PadParams> {
  switch (target) {
    case 'tune':
      return { tune: Math.round(p * 48 - 24) }
    case 'fine':
      return { fine: Math.round(p * 200 - 100) }
    case 'cutoff':
      return {
        cutoff: Math.round(20 * 1000 ** p),
        filterType: pad.filterType === 'off' ? 'lowpass' : pad.filterType,
      }
    case 'resonance':
      return { resonance: Math.round((0.1 + p * 19.9) * 10) / 10 }
    case 'volume':
      return { volume: p }
    case 'pan':
      return { pan: p * 2 - 1 }
    case 'attack':
      return { attack: Math.round(2000 * p * p) }
    case 'decay':
      return { decay: Math.max(5, Math.round(DECAY_OFF * p * p)) }
    case 'start':
      return { start: Math.min(p, pad.end - 0.001) }
    case 'end':
      return { end: Math.max(p, pad.start + 0.001) }
    case 'sendDelay':
      return { sendDelay: p }
    case 'sendReverb':
      return { sendReverb: p }
  }
}
