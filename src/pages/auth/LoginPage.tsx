import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { BrandLogo } from '../../components/ui/BrandLogo'

export default function LoginPage() {
  const { signIn, loading, user } = useAuthStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  // Redirect if already logged in — App.tsx will handle the role-based route,
  // so just push to / and let the router decide.
  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const validate = () => {
    const errs: typeof errors = {}
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = 'Enter a valid email address.'
    }
    if (!password) errs.password = 'Password is required.'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    try {
      await signIn(email.trim().toLowerCase(), password)
      // navigation handled by the useEffect above
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message.toLowerCase().includes('invalid')
          ? 'Incorrect email or password.'
          : 'Sign in failed. Please try again.'
      toast.error(msg)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <BrandLogo className="h-14 w-36 mb-3" />
          <h1 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">TableKey</h1>
          <p className="text-sm text-gray-500 mt-1">Staff sign-in</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 space-y-4"
          noValidate
        >
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            placeholder="you@example.com"
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              placeholder="••••••••"
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

          <Button type="submit" fullWidth size="lg" loading={loading}>
            Sign In
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have a restaurant yet?{' '}
          <button onClick={() => navigate('/signup')} className="text-brand-600 font-medium hover:underline">
            Register your restaurant
          </button>
        </p>

        <p className="text-center text-xs text-gray-400 mt-4">
          Customers don't need an account — they scan the QR code at their table.
        </p>
      </div>
    </div>
  )
}
