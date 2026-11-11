// Small real files for the demo, as base64: they open in the file viewer like uploads would.

/** A 1×1 PNG standing in for a bug screenshot. */
export const screenshotPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** A one-page PDF: the Mobile App 2.4.0 scope. */
export const scopePdf = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxNDggPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3NzAgVGQgKE1vYmlsZSBBcHAgMi40LjAgLSBzY29wZSkgVGogMCAtMjggVGQgL0YxIDEyIFRmIChNT0ItMTAxIGNvbGQgc3RhcnQgZml4LCBNT0ItMTAyIHB1c2ggcm91dGluZywgTU9CLTEwNCBvZmZsaW5lIGNhY2hlLikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDA0NDAgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo1MTAKJSVFT0YK'

/** A short text file: the 2.4.0 release checklist. */
export const checklistTxt = 'UmVsZWFzZSAyLjQuMCBjaGVja2xpc3QKMS4gaU9TIGJ1aWxkIDExOCBvbiBUZXN0RmxpZ2h0CjIuIEFuZHJvaWQgc2lnbmluZyBrZXkgcmVuZXdlZCAoTU9CLTEwNSkKMy4gUUEgc2lnbi1vZmY6IDQxIGNhc2VzCg=='

/**
 * A voice note for the demo (chat spec 6.9): `ms` of a soft 220 Hz tone that fades in and out, as an 8 kHz, 8-bit mono
 * WAV every browser plays. Made in code, so the source holds no large base64 block.
 */
export function voiceNoteWav(ms = 4000): string {
  const rate = 8000
  const samples = Math.round((rate * ms) / 1000)
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM header size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true) // bytes a second (8-bit mono)
  view.setUint16(32, 1, true) // bytes a frame
  view.setUint16(34, 8, true) // bits a sample
  text(36, 'data')
  view.setUint32(40, samples, true)
  const fade = rate * 0.2
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / fade, (samples - i) / fade)
    bytes[44 + i] = Math.round(128 + 40 * envelope * Math.sin((2 * Math.PI * 220 * i) / rate))
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
