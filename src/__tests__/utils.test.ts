// ── Pure utility function tests (no network, no mocks needed) ─

import { describe, it, expect } from 'vitest'
import { formatCurrency, elapsedMinutes, orderStatusLabel, tableStatusLabel, generateQrUrl } from '../lib/utils'
import { getPreviousPeriod } from '../lib/api'

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(12.5, 'USD')).toBe('$12.50')
  })
  it('formats KES correctly', () => {
    expect(formatCurrency(1500, 'KES')).toContain('1,500')
  })
  it('handles zero', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00')
  })
})

describe('elapsedMinutes', () => {
  it('returns 0 for just now', () => {
    const now = new Date().toISOString()
    expect(elapsedMinutes(now)).toBe(0)
  })
  it('returns correct minutes for a past time', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    expect(elapsedMinutes(fiveMinutesAgo)).toBe(5)
  })
})

describe('orderStatusLabel', () => {
  it('maps all known statuses', () => {
    expect(orderStatusLabel('new')).toBe('New')
    expect(orderStatusLabel('preparing')).toBe('Preparing')
    expect(orderStatusLabel('ready')).toBe('Ready')
    expect(orderStatusLabel('served')).toBe('Served')
    expect(orderStatusLabel('cancelled')).toBe('Cancelled')
  })
})

describe('tableStatusLabel', () => {
  it('maps known statuses', () => {
    expect(tableStatusLabel('idle')).toBe('Available')
    expect(tableStatusLabel('active')).toBe('Active')
    expect(tableStatusLabel('requested')).toBe('Requested')
  })
})

describe('generateQrUrl', () => {
  it('builds a correct URL', () => {
    expect(generateQrUrl('https://example.com', 'abc123')).toBe('https://example.com/t/abc123')
  })
})

describe('getPreviousPeriod', () => {
  it('returns a period of equal length before the given range', () => {
    const from = '2024-01-08T00:00:00.000Z'
    const to = '2024-01-15T00:00:00.000Z'
    const prev = getPreviousPeriod(from, to)
    // Previous period should start 7 days before `from`
    const expectedFrom = new Date('2024-01-01T00:00:00.000Z').toISOString()
    expect(prev.from).toBe(expectedFrom)
    expect(prev.to).toBe(from)
  })

  it('returns same-length period for a 30-day range', () => {
    const from = new Date('2024-02-01').toISOString()
    const to = new Date('2024-03-02').toISOString()
    const prev = getPreviousPeriod(from, to)
    const fromMs = new Date(from).getTime()
    const toMs = new Date(to).getTime()
    const diff = toMs - fromMs
    expect(new Date(prev.to).toISOString()).toBe(from)
    expect(toMs - new Date(prev.from).getTime()).toBeCloseTo(diff * 2, -3)
  })
})
