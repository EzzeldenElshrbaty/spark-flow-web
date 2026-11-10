import axe from 'axe-core'

/**
 * The serious and critical axe problems in `context`, as "rule: target" lines; [] when there are none (UX Phase 5A).
 * Contrast is checked too (UX Phase 5B). A test of a part of a page (no landmarks around it) skips 'region'.
 */
export async function axeProblems(context: Element | Document = document, opts: { skip?: string[] } = {}): Promise<string[]> {
  const off = opts.skip ?? []
  const { violations } = await axe.run(context, { rules: Object.fromEntries(off.map((id) => [id, { enabled: false }])), resultTypes: ['violations'] })
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))
}
