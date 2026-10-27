import { describe, expect, it } from 'vitest'
import { typingLine } from './typingLine'

describe('typingLine', () => {
  it('nobody, one, two, more', () => {
    expect(typingLine([])).toBeNull()
    expect(typingLine(['Mariam Fathy'])).toBe('Mariam Fathy is typing…')
    expect(typingLine(['Mariam Fathy', 'Nour El-Sayed'])).toBe('Mariam Fathy and Nour El-Sayed are typing…')
    expect(typingLine(['A', 'B', 'C'])).toBe('Several people are typing…')
  })
})
