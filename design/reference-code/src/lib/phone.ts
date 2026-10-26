// Phone numbers start with the market's country code; another country can be picked from the list
// next to the number. A number typed with + or 00 is read as international.

import { markets } from '../mocks/data'

type Pattern = { re: RegExp; groups: number[] }
export type DialPlan = { id: string; name: string; code: string; country: string; example: string; patterns: Pattern[] }

// Any local number of 6 to 12 digits, spaced like the country's example.
const any = (example: string): Pattern[] => [{ re: /^\d{6,12}$/, groups: example.split(' ').map((part) => part.length) }]

// Egypt and Saudi check the number's shape; the rest take any local number of 6 to 12 digits.
const known: DialPlan[] = [
  // Mobiles 01x xxxx xxxx; landlines like 02 xxxx xxxx (Cairo) or 03 xxx xxxx (Alexandria).
  {
    id: 'eg',
    name: 'Egypt',
    code: '+20',
    country: 'Egyptian',
    example: '0100 123 4567',
    patterns: [
      { re: /^1[0125]\d{8}$/, groups: [3, 3, 4] },
      { re: /^[2-9]\d{7,8}$/, groups: [1, 4, 4] },
    ],
  },
  // Mobiles 05x xxx xxxx; landlines like 011 xxx xxxx.
  {
    id: 'sa',
    name: 'Saudi Arabia',
    code: '+966',
    country: 'Saudi',
    example: '050 123 4567',
    patterns: [
      { re: /^5\d{8}$/, groups: [2, 3, 4] },
      { re: /^1\d{8}$/, groups: [2, 3, 4] },
    ],
  },
  ...(
    [
      ['ae', 'United Arab Emirates', '+971', 'UAE', '50 123 4567'],
      ['kw', 'Kuwait', '+965', 'Kuwaiti', '5012 3456'],
      ['qa', 'Qatar', '+974', 'Qatari', '3312 3456'],
      ['bh', 'Bahrain', '+973', 'Bahraini', '3600 1234'],
      ['om', 'Oman', '+968', 'Omani', '9212 3456'],
      ['jo', 'Jordan', '+962', 'Jordanian', '7 9012 3456'],
      ['lb', 'Lebanon', '+961', 'Lebanese', '71 123 456'],
      ['iq', 'Iraq', '+964', 'Iraqi', '790 123 4567'],
      ['ly', 'Libya', '+218', 'Libyan', '91 234 5678'],
      ['sd', 'Sudan', '+249', 'Sudanese', '91 123 1234'],
      ['ma', 'Morocco', '+212', 'Moroccan', '650 123 456'],
      ['tn', 'Tunisia', '+216', 'Tunisian', '20 123 456'],
      ['dz', 'Algeria', '+213', 'Algerian', '551 23 45 67'],
      ['tr', 'Turkey', '+90', 'Turkish', '501 234 5678'],
      ['gb', 'United Kingdom', '+44', 'UK', '7400 123456'],
      ['us', 'United States / Canada', '+1', 'US or Canadian', '201 555 0123'],
      ['de', 'Germany', '+49', 'German', '1512 3456789'],
      ['fr', 'France', '+33', 'French', '6 12 34 56 78'],
      ['in', 'India', '+91', 'Indian', '81234 56789'],
      ['pk', 'Pakistan', '+92', 'Pakistani', '301 2345678'],
    ] as const
  ).map(([id, name, code, country, example]) => ({ id, name, code, country, example, patterns: any(example) })),
]

/** Every country in the list: the known ones plus any market added in Settings with its own code. */
export function dialPlans(): DialPlan[] {
  const extra = markets
    .filter((market) => !known.some((plan) => plan.id === market.id || plan.code === market.dialCode))
    .map((market) => ({ id: market.id, name: market.name, code: market.dialCode, country: market.name, example: '50 123 4567', patterns: any('50 123 4567') }))
  return [...known, ...extra]
}

/** The plan a market's numbers default to. */
export function dialPlan(marketId: string): DialPlan {
  const plans = dialPlans()
  const market = markets.find((item) => item.id === marketId)
  return plans.find((plan) => plan.id === marketId) ?? plans.find((plan) => plan.code === market?.dialCode) ?? plans[0]
}

/** The country whose code a full number starts with (the longest code that fits). */
export function planOf(value: string): DialPlan | null {
  const digits = value.trim().replace(/^00/, '+')
  if (!digits.startsWith('+')) return null
  const plain = digits.replace(/\D/g, '')
  return (
    dialPlans()
      .filter((plan) => plain.startsWith(plan.code.slice(1)))
      .sort((a, b) => b.code.length - a.code.length)[0] ?? null
  )
}

const group = (digits: string, sizes: number[]) => {
  const parts: string[] = []
  let index = 0
  for (const size of sizes) {
    if (index >= digits.length) break
    parts.push(digits.slice(index, index + size))
    index += size
  }
  if (index < digits.length) parts[parts.length - 1] += digits.slice(index)
  return parts.join(' ')
}

/** Turns what was typed into a full international number, or explains what's wrong. */
export function normalizePhone(input: string, marketId: string): { value: string } | { error: string } {
  const trimmed = input.trim()
  if (/^(\+|00)/.test(trimmed)) {
    const digits = trimmed.replace(/^00/, '').replace(/\D/g, '')
    const plan = planOf(trimmed)
    if (plan) {
      const local = digits.slice(plan.code.length - 1).replace(/^0/, '')
      const match = plan.patterns.find((pattern) => pattern.re.test(local))
      if (!match) return { error: `Enter a ${plan.country} number, e.g. ${plan.example}.` }
      return { value: `${plan.code} ${group(local, match.groups)}` }
    }
    return digits.length >= 8 && digits.length <= 15 ? { value: `+${digits}` } : { error: 'Enter the full international number, e.g. +971 50 123 4567.' }
  }
  const plan = dialPlan(marketId)
  const local = trimmed.replace(/\D/g, '').replace(/^0/, '')
  const match = plan.patterns.find((pattern) => pattern.re.test(local))
  if (!match) return { error: `Enter a ${plan.country} number, e.g. ${plan.example}.` }
  return { value: `${plan.code} ${group(local, match.groups)}` }
}
