import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getDeviceToken } from './device'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your credentials.'
  )
}

function deviceHeaders(): Record<string, string> {
  try {
    return { 'X-Device-Token': getDeviceToken() }
  } catch {
    return {}
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 20 } },
  global: { headers: deviceHeaders() },
})

let staffSessionClient: SupabaseClient | null = null
let staffToken: string | null = null

export function setStaffSession(token: string | null) {
  if (!token) {
    staffToken = null
    staffSessionClient = null
    return
  }

  staffToken = token
  staffSessionClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 20 } },
    global: {
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        'X-Staff-Token': token,
        ...deviceHeaders(),
      },
    },
  })
}

export function getStaffToken(): string | null {
  return staffToken
}

export function isStaffSession(): boolean {
  return staffSessionClient !== null
}

export function getSupabase(): SupabaseClient {
  return staffSessionClient ?? supabase
}
