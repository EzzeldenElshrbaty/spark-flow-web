import { describe, expect, it } from 'vitest'
import { popupPlacement } from './popupPlacement'

describe('popupPlacement', () => {
  it('opens above when the list fits there, else on the side with more room', () => {
    expect(popupPlacement({ above: 400, below: 50 }, 288)).toBe('above')
    expect(popupPlacement({ above: 60, below: 500 }, 288)).toBe('below') // a near-empty inspector panel
    expect(popupPlacement({ above: 120, below: 80 }, 288)).toBe('above') // neither fits: the bigger side
  })
})
