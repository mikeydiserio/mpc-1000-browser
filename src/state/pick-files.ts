/** Opens the native file chooser. Must be called from a user gesture. */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve([...(input.files ?? [])])
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

export const AUDIO_ACCEPT = 'audio/*,.wav,.mp3,.ogg,.flac,.aif,.aiff,.m4a'
