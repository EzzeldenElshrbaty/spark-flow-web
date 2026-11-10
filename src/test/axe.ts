import axe from 'axe-core'

/**
 * The serious and critical axe problems in `context`, as "rule: target" lines; [] when there are none (UX Phase 5A).
 * Contrast is checked too (UX Phase 5B). A test of a part of a page (no landmarks around it) skips 'region'. `tags`
 * runs only the rules with those tags (the UX checks use the audit's set, `AUDIT_TAGS`, UX Phase 6).
 */
export async function axeProblems(context: Element | Document = document, opts: { skip?: string[]; tags?: string[] } = {}): Promise<string[]> {
  const off = opts.skip ?? []
  const { violations } = await axe.run(context, {
    rules: Object.fromEntries(off.map((id) => [id, { enabled: false }])),
    resultTypes: ['violations'],
    ...(opts.tags ? { runOnly: { type: 'tag' as const, values: opts.tags } } : {}),
  })
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`))
}
