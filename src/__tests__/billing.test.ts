// ── Billing logic tests (mocked Supabase) ──────────────────────
// Tests the compute_bill RPC path and cash payment math.
// Uses vi.mock to stub Supabase so no real DB connection is needed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase module before importing api modules
vi.mock('../lib/supabase', () => {
  const mockRpc = vi.fn()
  const mockFrom = vi.fn()
  const mockClient = { rpc: mockRpc, from: mockFrom, functions: { invoke: vi.fn() } }
  return {
    supabase: mockClient,
    getSupabase: () => mockClient,
    isStaffSession: () => false,
    setStaffSession: vi.fn(),
    getStaffToken: () => null,
  }
})

// Mock device module
vi.mock('../lib/device', () => ({
  getDeviceToken: () => 'test-device-token',
  getDeviceLabel: () => 'Test Browser',
  getIdempotencyKey: () => 'test-idempotency-key',
  storeSessionAccess: vi.fn(),
  getStoredSessionId: vi.fn(),
  clearSessionAccess: vi.fn(),
  getPairedDeviceToken: () => null,
  setPairedDeviceToken: vi.fn(),
  getStaffSessionToken: () => null,
  setStaffSessionToken: vi.fn(),
  clearStaffSessionToken: vi.fn(),
}))

import { computeBill } from '../lib/api/payments'
import { getSupabase } from '../lib/supabase'

describe('computeBill', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the bill from the RPC', async () => {
    const mockBill = {
      session_id: 'sess-1',
      venue_id: 'venue-1',
      items: [],
      subtotal: 45.00,
      tax_rate: 0.16,
      tax_amount: 7.20,
      service_charge_rate: 0.10,
      service_charge_amount: 4.50,
      total: 56.70,
      paid: 0,
      voided: 0,
      comped: 0,
      outstanding: 56.70,
      payment_mode: 'pay_at_end',
      tip_enabled: true,
      tip_presets: [10, 15, 20],
      is_settled: false,
    }

    const sb = getSupabase() as ReturnType<typeof getSupabase>
    ;(sb.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: mockBill, error: null })

    const bill = await computeBill('sess-1')

    expect(sb.rpc).toHaveBeenCalledWith('compute_bill', { p_session_id: 'sess-1' })
    expect(bill.total).toBe(56.70)
    expect(bill.outstanding).toBe(56.70)
    expect(bill.is_settled).toBe(false)
    expect(bill.tax_amount).toBe(7.20)
  })

  it('throws when RPC returns an error', async () => {
    const sb = getSupabase() as ReturnType<typeof getSupabase>
    ;(sb.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: { message: 'function not found', code: '404' },
    })

    await expect(computeBill('sess-1')).rejects.toThrow()
  })

  it('settled bill has is_settled = true and outstanding = 0', async () => {
    const sb = getSupabase() as ReturnType<typeof getSupabase>
    ;(sb.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { total: 50, paid: 50, outstanding: 0, is_settled: true, items: [] },
      error: null,
    })

    const bill = await computeBill('sess-2')
    expect(bill.is_settled).toBe(true)
    expect(bill.outstanding).toBe(0)
  })
})

describe('cash payment math', () => {
  it('change due = cash received minus total', () => {
    const total = 47.50
    const cashReceived = 50.00
    const changeDue = Math.max(0, cashReceived - total)
    expect(changeDue).toBeCloseTo(2.50, 2)
  })

  it('no change when exact amount', () => {
    expect(Math.max(0, 47.50 - 47.50)).toBe(0)
  })

  it('no negative change (shortfall — should be blocked at UI)', () => {
    const changeDue = Math.max(0, 40.00 - 47.50)
    expect(changeDue).toBe(0)
  })
})
