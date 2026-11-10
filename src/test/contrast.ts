/** WCAG contrast between two #rrggbb (or #fff) colours, 1 to 21 (UX Phase 5B). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function hex(value: string): string {
  const v = value.trim().toLowerCase()
  return v === '#fff' ? '#ffffff' : v === '#000' ? '#000000' : v
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex(color).slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/**
 * The custom properties of the first `selector {` block in `css` (`:root`, `.dark`, `@theme`), names without `--`,
 * with `var(--x)` resolved inside the same block.
 */
export function tokens(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start))
  const vars: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]!] = m[2]!.trim()
  for (const name of Object.keys(vars)) {
    let value = vars[name]!
    for (let i = 0; value.startsWith('var(') && i < 10; i++) value = vars[value.slice(6, -1)] ?? value
    vars[name] = value
  }
  return vars
}
