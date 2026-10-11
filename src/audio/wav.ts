/** 16-bit PCM WAV encoder. */
export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels
  const frames = buffer.length
  const bytesPerSample = 2
  const dataSize = frames * channels * bytesPerSample
  const out = new ArrayBuffer(44 + dataSize)
  const view = new DataView(out)

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const data = Array.from({ length: channels }, (_, ch) => buffer.getChannelData(ch))
  let offset = 44
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const s = Math.max(-1, Math.min(1, data[ch]![i]!))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return out
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Copy a region of a buffer into a new AudioBuffer (destructive trim / chop). */
export function sliceBuffer(buffer: AudioBuffer, start: number, end: number) {
  const from = Math.floor(start * buffer.length)
  const to = Math.max(from + 1, Math.floor(end * buffer.length))
  const out = new AudioBuffer({
    length: to - from,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch).subarray(from, to), ch)
  }
  return out
}

/** Peak-normalize to -0.3 dBFS. */
export function normalizeBuffer(buffer: AudioBuffer) {
  let peak = 0
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch)
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!))
  }
  if (peak === 0) return buffer
  const gain = 0.966 / peak
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  })
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch).map((v) => v * gain)
    out.copyToChannel(d, ch)
  }
  return out
}

/**
 * Transient-based slice points (0..1) using a simple spectral-flux-free energy onset detector.
 * Good enough for drum loops — the classic "chop shop" use case.
 */
export function detectTransients(buffer: AudioBuffer, maxSlices: number, sensitivity = 1.5) {
  const data = buffer.getChannelData(0)
  const hop = 512
  const energies: number[] = []
  for (let i = 0; i + hop < data.length; i += hop) {
    let e = 0
    for (let j = 0; j < hop; j++) e += data[i + j]! ** 2
    energies.push(Math.sqrt(e / hop))
  }
  const onsets: { pos: number; strength: number }[] = []
  const minGap = Math.floor((0.06 * buffer.sampleRate) / hop)
  let last = -minGap
  for (let i = 4; i < energies.length; i++) {
    const avg = (energies[i - 1]! + energies[i - 2]! + energies[i - 3]! + energies[i - 4]!) / 4
    const rise = energies[i]! - avg * sensitivity
    if (rise > 0.01 && i - last >= minGap) {
      onsets.push({ pos: (i * hop) / data.length, strength: rise })
      last = i
    }
  }
  const strongest = onsets
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxSlices - 1)
    .map((o) => o.pos)
  return [0, ...strongest.filter((p) => p > 0.01)].sort((a, b) => a - b)
}
