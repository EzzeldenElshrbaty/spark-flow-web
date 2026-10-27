/**
 * Steps that bring an older saved document up to date, keyed by the version each upgrades from. A step changes the
 * document in place; it only runs on a copy, inside the transaction that then saves it.
 */
export const migrations: Record<number, (doc: Record<string, unknown>) => void> = {
  // 4: channel read state per person. What was read so far belongs to the document's default person.
  3: (doc) => {
    doc.reads = { [String(doc.currentUserId)]: doc.reads ?? {} }
  },
}

/** The document brought up to `to`, or null when a step on the way is missing. */
export function migrate(doc: Record<string, unknown>, to: number): Record<string, unknown> | null {
  const copy = structuredClone(doc)
  for (let v = Number(copy.version); v < to; v++) {
    const step = migrations[v]
    if (!step) return null
    step(copy)
    copy.version = v + 1
  }
  return copy
}
