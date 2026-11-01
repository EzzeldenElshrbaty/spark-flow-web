const SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

/** Whether bytes really are a PDF, whatever the file is called: a renamed HTML page must never be shown as one. */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= SIGNATURE.length && SIGNATURE.every((byte, i) => bytes[i] === byte)
}
