import { useState, useRef, useEffect } from 'react'
import { Lock, ArrowLeft, CheckCircle } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { VenueLogo } from '../../components/ui/VenueLogo'
import type { RestaurantTable, Venue, TableSession } from '../../types/database'

interface Props {
  table: RestaurantTable
  venue: Venue
  session: TableSession
  onSubmit: (code: string) => Promise<string | null>
  onBack: () => void
}

export function CodeEntryView({ table, venue, session, onSubmit, onBack }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(venue.code_length).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    refs.current[0]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError(null)
    if (digit && index < venue.code_length - 1) {
      refs.current[index + 1]?.focus()
    }
    // Auto-submit when all filled
    if (digit && index === venue.code_length - 1 && next.every((d) => d !== '')) {
      handleSubmit(next.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < venue.code_length - 1) refs.current[index + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, venue.code_length)
    if (pasted.length === venue.code_length) {
      setDigits(pasted.split(''))
      handleSubmit(pasted)
    }
  }

  const handleSubmit = async (code?: string) => {
    const final = code ?? digits.join('')
    if (final.length < venue.code_length) {
      setError('Please enter the complete code.')
      return
    }
    setLoading(true)
    setError(null)
    const err = await onSubmit(final)
    setLoading(false)
    if (err) {
      setError(err)
      setDigits(Array(venue.code_length).fill(''))
      setTimeout(() => refs.current[0]?.focus(), 50)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 bg-gray-50">
        <div className="text-center">
          <CheckCircle size={64} className="text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Verified!</h2>
          <p className="text-sm text-gray-500 mt-1">You can now browse and order.</p>
        </div>
      </div>
    )
  }

  const isLocked = session.code_locked

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-50 text-center">
      <div className="bg-white rounded-3xl p-8 max-w-xs w-full shadow-sm border border-gray-100">
        <VenueLogo
          venue={venue}
          imgClass="h-10 w-auto max-w-[7rem] object-contain"
          wrapClass="flex h-10 w-full items-center justify-center mb-5"
        />
        <div className="mx-auto h-16 w-16 rounded-full bg-brand-100 flex items-center justify-center mb-4">
          <Lock size={32} className={isLocked ? 'text-red-500' : 'text-brand-500'} />
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-1">
          {isLocked ? 'Session locked' : 'Enter your code'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {isLocked
            ? 'Too many wrong attempts. Ask your waiter to reset the code.'
            : `Table ${table.table_number} · Enter the ${venue.code_length}-digit code your waiter gave you.`}
        </p>

        {!isLocked && (
          <>
            <div className="flex justify-center gap-2 mb-6" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { refs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={loading}
                  className={`h-14 w-12 rounded-xl border-2 text-center text-2xl font-bold transition-colors focus:outline-none
                    ${error ? 'border-red-400 bg-red-50' : d ? 'border-brand-500 bg-brand-50' : 'border-gray-200 bg-gray-50 focus:border-brand-400'}
                  `}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <Button
              fullWidth
              onClick={() => handleSubmit()}
              loading={loading}
              disabled={digits.some((d) => d === '')}
            >
              Confirm Code
            </Button>
          </>
        )}

        <Button fullWidth variant="ghost" size="sm" onClick={onBack} className="mt-3">
          <ArrowLeft size={14} />
          Back to Menu
        </Button>
      </div>
    </div>
  )
}
