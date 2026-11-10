import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UtensilsCrossed, Eye, EyeOff, CheckCircle, ArrowRight, Frown } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Spinner } from '../../components/ui/Spinner'

export default function InvitePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { initialize } = useAuthStore()

  const email = params.get('email') ?? ''
  const venueName = params.get('venue') ?? 'your restaurant'
  // Name and role can optionally be in the URL for a better UX
  const nameParam = params.get('name') ?? ''
  const roleParam = params.get('role') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [staffName, setStaffName] = useState(nameParam)
  const [role, setRole] = useState(roleParam)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})

  // ── Try to load staff info from DB, but don't block on it ────
  useEffect(() => {
    if (!email) { setChecking(false); return }

    supabase
      .from('staff')
      .select('name, role, active, joined_at')
      .eq('email', email.toLowerCase())
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setStaffName(data.name)
          setRole(data.role)
          setAlreadyRegistered(!!data.joined_at)
        }
        setChecking(false)
      }, () => {
        // Network error or RLS blocked — show form anyway
        setChecking(false)
      })
  }, [email])

  // ── Handle signup ─────────────────────────────────────────────
  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (password.length < 6) errs.password = 'Password must be at least 6 characters.'
    if (password !== confirmPassword) errs.confirm = 'Passwords do not match.'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password,
      })

      if (error) throw error

      if (data.session) {
        await initialize()
        toast.success(`Welcome${staffName ? `, ${staffName}` : ''}!`)
        navigate('/', { replace: true })
      } else {
        toast.success('Check your email to confirm your account, then sign in.')
        navigate('/login', { replace: true })
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message.toLowerCase().includes('already registered')
          ? 'This email is already registered. Try signing in instead.'
          : err instanceof Error
            ? err.message
            : 'Failed to create account. Please try again.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Missing email in URL ──────────────────────────────────────
  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="text-center max-w-xs">
          <Frown size={48} className="mx-auto mb-4 text-gray-400" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid invite link</h1>
          <p className="text-sm text-gray-500 mb-6">
            This invite link is missing required information. Ask your manager to send a new one.
          </p>
          <Button variant="secondary" onClick={() => navigate('/login')}>Go to Login</Button>
        </div>
      </div>
    )
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    )
  }

  if (alreadyRegistered) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-brand-50 to-orange-50">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 max-w-sm w-full text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-emerald-100 text-emerald-600 mb-4">
            <CheckCircle size={28} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">You're all set!</h1>
          <p className="text-sm text-gray-500 mb-6">
            <strong>{email}</strong> is already registered. Sign in to continue.
          </p>
          <Button fullWidth size="lg" onClick={() => navigate('/login')}>
            Sign In <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    )
  }

  const roleLabel =
    role === 'owner' ? 'Owner' :
    role === 'admin' ? 'Admin' :
    role === 'manager' ? 'Manager' :
    role === 'kitchen' ? 'Kitchen Staff' :
    role === 'waiter' ? 'Waiter' :
    'Staff Member'

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-500 text-white mb-3 shadow-lg">
            <UtensilsCrossed size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">You're invited!</h1>
          <p className="text-sm text-gray-500 mt-1">
            Join <strong>{venueName}</strong>{role ? ` as ${roleLabel}` : ''}
          </p>
        </div>

        <form
          onSubmit={handleAccept}
          className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 space-y-4"
        >
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-center">
            {staffName && <p className="font-semibold text-gray-900">{staffName}</p>}
            <p className="text-xs text-gray-500">{email}</p>
          </div>

          <div className="relative">
            <Input
              label="Create a password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              placeholder="At least 6 characters"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 bottom-2.5 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <Input
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirm}
            placeholder="Re-enter your password"
          />

          <Button type="submit" fullWidth size="lg" loading={loading}>
            Create Account & Sign In
          </Button>

          <p className="text-xs text-center text-gray-400">
            Creates your account and links you to {venueName}.
          </p>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <button onClick={() => navigate('/login')} className="text-brand-600 font-medium hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
