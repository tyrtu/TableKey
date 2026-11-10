import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UtensilsCrossed, Eye, EyeOff, Store, User, Mail, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

export default function OwnerSignupPage() {
  const navigate = useNavigate()
  const { initialize } = useAuthStore()

  const [restaurantName, setRestaurantName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!restaurantName.trim()) errs.restaurantName = 'Restaurant name is required.'
    if (!ownerName.trim()) errs.ownerName = 'Your name is required.'
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Valid email required.'
    if (password.length < 6) errs.password = 'Password must be at least 6 characters.'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})

    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            restaurant_name: restaurantName.trim(),
            owner_name: ownerName.trim(),
            signup_type: 'owner',
          },
        },
      })

      if (error) throw error

      if (data.session) {
        // Email confirmation disabled — logged in immediately
        await initialize()
        toast.success(`Welcome to TableKey, ${ownerName}! Let's set up ${restaurantName}.`)
        navigate('/', { replace: true })
      } else {
        // Email confirmation required
        toast.success('Check your email to confirm your account, then sign in.')
        navigate('/login', { replace: true })
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message.toLowerCase().includes('already')
          ? 'An account with this email already exists. Try signing in.'
          : err instanceof Error
            ? err.message
            : 'Signup failed. Please try again.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-500 text-white mb-3 shadow-lg">
            <UtensilsCrossed size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Start your restaurant</h1>
          <p className="text-sm text-gray-500 mt-1">No technical setup. Just fill this out.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 space-y-4" noValidate>
          <Input
            label="Restaurant name *"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            error={errors.restaurantName}
            placeholder="e.g. The Rustic Fork"
            autoFocus
          />
          <Input
            label="Your name *"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            error={errors.ownerName}
            placeholder="e.g. John Smith"
          />
          <Input
            label="Email *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            placeholder="you@example.com"
          />
          <div className="relative">
            <Input
              label="Password *"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              placeholder="At least 6 characters"
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

          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <p className="text-xs text-blue-700">
              We'll create your restaurant, your admin account, and default settings automatically.
              You can add tables, menu items, and staff right after.
            </p>
          </div>

          <Button type="submit" fullWidth size="lg" loading={loading}>
            <Store size={18} />
            Create Restaurant
          </Button>
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
