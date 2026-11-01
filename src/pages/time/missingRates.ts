/** The line above Time & cost when people's time counts 0 EGP for lack of an hourly cost; null when everyone has one. */
export function missingRateLine(byPerson: { rate: number }[]): { text: string; action: string } | null {
  const n = byPerson.filter((p) => !p.rate).length
  if (n === 0) return null
  return n === 1 ? { text: '1 person has no hourly cost', action: 'Set it' } : { text: `${n} people have no hourly cost`, action: 'Set them' }
}
