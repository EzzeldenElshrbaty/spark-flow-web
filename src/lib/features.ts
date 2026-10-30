/**
 * Work in progress that is built but not shown yet. Turn one on in a dev or prototype build with
 * localStorage['spark-flow.features'] = 'chatRedesign' and a reload; production keeps them all off.
 *
 * chatRedesign: Flow chat sidebar rows whose views land in a later phase. None at the moment: Threads shipped in
 * slice U (spec 6.12), so the flag is kept only for the next one.
 */
export type Feature = 'chatRedesign'

const known: Feature[] = ['chatRedesign']
const STORAGE_KEY = 'spark-flow.features'

export function parseFeatures(raw: string | null, production: boolean): Set<Feature> {
  if (production || !raw) return new Set()
  const listed = raw.split(',').map((s) => s.trim())
  return new Set(known.filter((f) => listed.includes(f)))
}

function stored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const on = parseFeatures(stored(), import.meta.env.MODE === 'production')

export function hasFeature(feature: Feature): boolean {
  return on.has(feature)
}
