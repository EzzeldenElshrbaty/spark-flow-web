import { describe, expect, it } from 'vitest'
import { formatAppTime, mapsUrl, periodOf, placeText, tabOf } from './attendanceView'

// How Settings → Attendance reads its numbers and places (Admin and help, slice 5).

describe('reading attendance', () => {
  it('app time in hours and minutes, "—" for none', () => {
    expect(formatAppTime(0)).toBe('—')
    expect(formatAppTime(45)).toBe('45m')
    expect(formatAppTime(60)).toBe('1h')
    expect(formatAppTime(205)).toBe('3h 25m')
  })

  it('a place as its coordinates and accuracy, or why there is none', () => {
    expect(placeText({ lat: 30.04441, lng: 31.23571, accuracy: 18 })).toBe('30.04441, 31.23571 · ±18 m')
    expect(placeText('blocked')).toBe('Location blocked')
    expect(placeText('none')).toBe('No location')
    expect(placeText(null)).toBe('—')
    expect(mapsUrl({ lat: 30.04441, lng: 31.23571, accuracy: 18 })).toBe('https://www.google.com/maps/search/?api=1&query=30.04441%2C31.23571')
  })

  it('the address picks the tab and period; anything else falls back', () => {
    expect(tabOf('report')).toBe('report')
    expect(tabOf('nope')).toBe('days')
    expect(tabOf(null)).toBe('days')
    // Check-ins became Days (timer slice 3): an old link still opens it.
    expect(tabOf('checkins')).toBe('days')
    expect(periodOf('30')).toBe(30)
    expect(periodOf('14')).toBe(7)
  })
})
