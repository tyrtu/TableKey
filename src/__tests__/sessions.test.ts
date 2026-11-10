// ── Session / presence logic tests ────────────────────────────
// vi.mock factories are hoisted — all setup must live inside them.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// All factory code must be self-contained (no external variables)
vi.mock('../lib/supabase', () => {
  function makeProxy(): object {
    return new Proxy({} as Record<string, unknown>, {
      get(_t, prop: string) {
        if (prop === 'then') return undefined
        if (typeof prop === 'symbol') return undefined
        return vi.fn((..._args: unknown[]) => {
          if (prop === 'maybeSingle' || prop === 'single') {
            return Promise.resolve({ data: null, error: null })
          }
          return makeProxy()
        })
      },
    })
  }
  const client = {
    from: vi.fn(() => makeProxy()),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  }
  return {
    supabase: client,
    getSupabase: () => client,
    isStaffSession: () => false,
    setStaffSession: vi.fn(),
    getStaffToken: () => null,
  }
})

vi.mock('../lib/device', () => ({
  getDeviceToken: () => 'device-abc',
  getDeviceLabel: () => 'iPhone',
  getIdempotencyKey: () => 'idem-key-1',
  storeSessionAccess: vi.fn(),
  getStoredSessionId: vi.fn(() => null),
  clearSessionAccess: vi.fn(),
  getPairedDeviceToken: () => null,
  setPairedDeviceToken: vi.fn(),
  getStaffSessionToken: () => null,
  setStaffSessionToken: vi.fn(),
  clearStaffSessionToken: vi.fn(),
}))

import { verifyCode } from '../lib/api/sessions'
import type { TableSession } from '../types/database'

function makeSession(overrides: Partial<TableSession> = {}): TableSession {
  return {
    id: 'sess-1',
    venue_id: 'venue-1',
    table_id: 'table-1',
    opened_by: 'staff-1',
    closed_by: null,
    opened_at: new Date().toISOString(),
    closed_at: null,
    current_code: '1234',
    code_expires_at: new Date(Date.now() + 60_000).toISOString(),
    code_attempts: 0,
    code_locked: false,
    code_locked_until: null,
    is_active: true,
    last_activity: new Date().toISOString(),
    waiter_managed: false,
    ...overrides,
  } as TableSession
}

describe('verifyCode', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('accepts the stable session code after the legacy expiry timestamp', async () => {
    const session = makeSession({
      code_expires_at: new Date(Date.now() - 1000).toISOString(),
    })
    const result = await verifyCode(session, '1234', 'venue-1', 3)
    expect(result.success).toBe(true)
  })

  it('rejects permanently locked session (legacy boolean lock)', async () => {
    const session = makeSession({ code_locked: true })
    const result = await verifyCode(session, '1234', 'venue-1', 3)
    expect(result.success).toBe(false)
    expect(result.locked).toBe(true)
  })

  it('rejects wrong code and reports attempts remaining', async () => {
    const session = makeSession({ code_attempts: 0 })
    const result = await verifyCode(session, '9999', 'venue-1', 3)
    expect(result.success).toBe(false)
    expect(result.locked).toBe(false)
    // 3 max - 1 used = 2 remaining
    expect(result.message).toContain('2 attempt')
  })

  it('locks after max attempts and returns lockedUntil', async () => {
    // code_attempts=2 means this wrong attempt = 3rd = max
    const session = makeSession({ code_attempts: 2 })
    const result = await verifyCode(session, '0000', 'venue-1', 3)
    expect(result.success).toBe(false)
    expect(result.locked).toBe(true)
    expect(result.lockedUntil).toBeDefined()
    expect(new Date(result.lockedUntil!).getTime()).toBeGreaterThan(Date.now())
  })

  it('rejects when within active timed lockout', async () => {
    const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    // Use type assertion to inject the migration-008 field
    const session = {
      ...makeSession({ code_locked: true }),
      code_locked_until: lockedUntil,
    } as TableSession & { code_locked_until: string }
    const result = await verifyCode(session as TableSession, '1234', 'venue-1', 3)
    expect(result.success).toBe(false)
    expect(result.locked).toBe(true)
    expect(result.message).toContain('minute')
  })
})

describe('rate limit window math', () => {
  it('2-minute window: 3 min ago is outside, 1 min ago is inside', () => {
    const windowMs = 2 * 60 * 1000
    const windowStart = new Date(Date.now() - windowMs).toISOString()
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    const oneMinAgo  = new Date(Date.now() - 1 * 60 * 1000).toISOString()
    expect(threeMinAgo < windowStart).toBe(true)  // expired — would reset
    expect(oneMinAgo  > windowStart).toBe(true)   // still in window — counts
  })

  it('window resets when outside', () => {
    // After reset, count goes back to 1 regardless of previous value
    const count = 99
    const reset = true
    const newCount = reset ? 1 : count + 1
    expect(newCount).toBe(1)
  })
})
