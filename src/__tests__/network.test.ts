import { describe, it, expect, afterEach } from 'vitest'
import { assertOnline } from '../lib/network'

const originalNavigator = globalThis.navigator

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: originalNavigator,
  })
})

describe('assertOnline', () => {
  it('allows operations when the browser is online', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: true },
    })

    expect(() => assertOnline('place an order')).not.toThrow()
  })

  it('rejects operations when the browser is offline', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: false },
    })

    expect(() => assertOnline('place an order')).toThrow('Cannot place an order while offline')
  })
})
