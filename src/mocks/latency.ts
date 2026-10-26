// Fake network time so loading states are visible. Tests set both to 0.
export const latency = { min: 150, max: 300 }

/** Resolves after a random wait within latency.min..max. */
export function delay(): Promise<void> {
  const ms = latency.min + Math.random() * Math.max(0, latency.max - latency.min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}
