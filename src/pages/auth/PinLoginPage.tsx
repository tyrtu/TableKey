import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, ArrowLeft, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { getPairedDeviceToken, clearPairedDeviceToken, getStaffSessionToken } from '../../lib/device'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../../components/ui/Button'
import { BrandLogo } from '../../components/ui/BrandLogo'

interface StaffForPin {
  id: string
  name: string
  role: string
  has_pin: boolean
}

export default function PinLoginPage() {
  const navigate = useNavigate()
  const { signInWithPin, signOut } = useAuthStore()

  const [deviceToken, setDeviceToken] = useState<string | null>(null)
  const [staffList, setStaffList] = useState<StaffForPin[]>([])
  const [selectedStaff, setSelectedStaff] = useState<StaffForPin | null>(null)
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // If already logged in via PIN, redirect
    const existingToken = getStaffSessionToken()
    if (existingToken) {
      navigate('/', { replace: true })
      return
    }

    const token = getPairedDeviceToken()
    if (!token) {
      navigate('/pair', { replace: true })
      return
    }
    setDeviceToken(token)

    supabase
      .rpc('get_staff_for_pin', { p_device_token: token })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setStaffList(data)
        } else {
          toast.error('No staff found for this device. Ask your manager to check the pairing.')
        }
      })
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedStaff || pin.length < 4) return
    setLoading(true)
    setError(null)
    try {
      const result = await signInWithPin(selectedStaff.id, pin)
      if (result.success) {
        toast.success(`Welcome, ${selectedStaff.name}!`)
        navigate('/', { replace: true })
      } else {
        setError(result.message ?? 'Incorrect PIN')
        setPin('')
      }
    } catch {
      setError('Failed to verify PIN. Try again.')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const handleUnpair = async () => {
    clearPairedDeviceToken()
    await signOut()
    navigate('/pair', { replace: true })
  }

  // ── PIN entry screen ──────────────────────────────────────
  if (selectedStaff) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-xs">
          <div className="text-center mb-6">
            <BrandLogo className="h-12 w-32 mb-3" />
            <p className="text-lg font-semibold text-white">{selectedStaff.name}</p>
            <p className="text-xs text-gray-400 capitalize">{selectedStaff.role}</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-gray-800 rounded-3xl shadow-xl border border-gray-700 p-6">
            <label className="text-sm font-medium text-gray-300 block mb-3 text-center">Enter your PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              autoFocus
              className="w-full h-16 rounded-xl border-2 border-gray-600 bg-gray-900 text-center text-3xl font-bold tracking-[0.4em] text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500 transition-colors mb-4"
              placeholder="••••"
            />

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-900/40 border border-red-700/50">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <Button type="submit" fullWidth size="lg" loading={loading} disabled={pin.length < 4}>
              Sign In
            </Button>

            <button
              type="button"
              onClick={() => { setSelectedStaff(null); setPin(''); setError(null) }}
              className="w-full mt-3 text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              ← Choose a different person
            </button>
          </form>

          <button onClick={handleUnpair} className="w-full mt-4 text-xs text-gray-600 hover:text-gray-400 transition-colors">
            Unpair this device
          </button>
        </div>
      </div>
    )
  }

  // ── Staff selection screen ─────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
            <BrandLogo className="h-12 w-32 mb-3" />
          <h1 className="text-xl font-bold text-white">Who are you?</h1>
          <p className="text-sm text-gray-400 mt-1">Select your name to sign in</p>
        </div>

        <div className="bg-gray-800 rounded-3xl shadow-xl border border-gray-700 p-4 space-y-2">
          {staffList.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">
              No staff found. Ask your manager to pair this device or add you to the team.
            </p>
          ) : (
            staffList.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedStaff(s)
                  setError(null)
                }}
                className="w-full flex items-center gap-3 rounded-xl bg-gray-700/50 hover:bg-gray-700 border border-gray-600 px-4 py-3 transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400">
                  <User size={18} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-white">{s.name}</p>
                  <p className="text-xs text-gray-400 capitalize">{s.role}</p>
                </div>
                {!s.has_pin && (
                  <span className="text-xs text-yellow-500">No PIN set</span>
                )}
              </button>
            ))
          )}
        </div>

        <button onClick={handleUnpair} className="w-full mt-4 text-xs text-gray-600 hover:text-gray-400 transition-colors">
          Unpair this device
        </button>
      </div>
    </div>
  )
}
