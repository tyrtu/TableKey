import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, setStaffSession } from '../lib/supabase'
import { getStaffSessionToken, clearStaffSessionToken, setStaffSessionToken } from '../lib/device'
import { identifyUser } from '../lib/monitoring'
import type { Staff } from '../types/database'

interface AuthState {
  // 'auth' = email+password (Supabase Auth)
  // 'pin'  = PIN login on a paired device (staff_sessions table)
  mode: 'auth' | 'pin' | null
  user: { id: string; email: string } | null
  staff: Staff | null
  loading: boolean
  initialized: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInWithPin: (staffId: string, pin: string) => Promise<{ success: boolean; message?: string }>
  signOut: () => Promise<void>
  initialize: () => Promise<void>
  setStaff: (s: Staff) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      mode: null,
      user: null,
      staff: null,
      loading: false,
      initialized: false,

      initialize: async () => {
        // ── Check for PIN session first ───────────────────────
        const pinToken = getStaffSessionToken()
        if (pinToken) {
          const { data } = await supabase.rpc('validate_staff_session', { p_token: pinToken })
          if (data?.valid) {
            setStaffSession(pinToken)
            const pinStaff: Staff = {
              id: data.staff_id,
              venue_id: data.venue_id,
              name: data.name,
              email: data.email,
              role: data.role,
              active: true,
              user_id: null,
              invited_at: '',
              joined_at: null,
              created_at: '',
              pin_hash: null,
              pin_attempts: 0,
              on_duty: true,
              last_active_at: new Date().toISOString(),
            }
            identifyUser({ id: pinStaff.id, role: pinStaff.role, venueId: pinStaff.venue_id })
            set({ mode: 'pin', staff: pinStaff, initialized: true })
            return
          }
          // Token invalid — clear it
          clearStaffSessionToken()
          setStaffSession(null)
        }

        // ── Check for Supabase Auth session ───────────────────
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          set({
            mode: 'auth',
            user: { id: session.user.id, email: session.user.email ?? '' },
          })
          const { data: staff } = await supabase
            .from('staff')
            .select('*')
            .eq('user_id', session.user.id)
            .maybeSingle()
          if (staff) set({ staff })
        }
        set({ initialized: true })

        // Listen for auth changes
        supabase.auth.onAuthStateChange(async (_event, session) => {
          if (session?.user) {
            set({ mode: 'auth', user: { id: session.user.id, email: session.user.email ?? '' } })
            const { data: staff } = await supabase
              .from('staff')
              .select('*')
              .eq('user_id', session.user.id)
              .maybeSingle()
            if (staff) {
              identifyUser({ id: staff.id, role: staff.role, venueId: staff.venue_id })
              set({ staff })
            }
          } else {
            // Only clear if we're in auth mode (not pin mode)
            if (get().mode === 'auth') {
              set({ user: null, staff: null })
            }
          }
        })
      },

      signIn: async (email, password) => {
        set({ loading: true })
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        set({ loading: false })
        if (error) throw error
      },

      signInWithPin: async (staffId, pin) => {
        const { data, error } = await supabase.rpc('verify_pin', {
          p_staff_id: staffId,
          p_pin: pin,
        })
        if (error) throw error
        if (!data.success) return { success: false, message: data.message }

        // Set up PIN session
        const token = data.session_token as string
        setStaffSession(token)
        setStaffSessionToken(token)

        const pinLoginStaff: Staff = {
          id: data.staff_id,
          venue_id: data.venue_id,
          name: data.name,
          email: '',
          role: data.role,
          active: true,
          user_id: null,
          invited_at: '',
          joined_at: null,
          created_at: '',
          pin_hash: null,
          pin_attempts: 0,
          on_duty: true,
          last_active_at: new Date().toISOString(),
        }
        identifyUser({ id: pinLoginStaff.id, role: pinLoginStaff.role, venueId: pinLoginStaff.venue_id })
        set({ mode: 'pin', staff: pinLoginStaff })
        return { success: true }
      },

      signOut: async () => {
        const mode = get().mode
        identifyUser(null)
        if (mode === 'pin') {
          setStaffSession(null)
          clearStaffSessionToken()
        } else {
          await supabase.auth.signOut()
        }
        set({ mode: null, user: null, staff: null })
      },

      setStaff: (staff) => set({ staff }),
    }),
    {
      name: 'tk_auth',
      partialize: (state) => ({ mode: state.mode, user: state.user, staff: state.staff }),
    }
  )
)
