import { useState } from 'react'
import { CheckCircle, Copy, Check, ArrowRight, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { VenueLogo } from '../../components/ui/VenueLogo'
import { CornerSprigSvg, ConfettiSvg } from '../../components/ui/Decorations'
import type { RestaurantTable, Venue, TableSession } from '../../types/database'

interface Props {
  table: RestaurantTable
  venue: Venue
  session: TableSession
  onContinue: () => void
}

export function YouAreInView({ table, venue, session, onContinue }: Props) {
  const [copied, setCopied] = useState(false)
  const code = session.current_code ?? ''

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6 overflow-hidden"
      style={{ background: '#FFFAF5' }}>

      {/* Confetti scattered across full background */}
      <ConfettiSvg className="pointer-events-none absolute inset-0 w-full h-full text-brand-400 opacity-[0.18]" />
      {/* Second layer of confetti in amber — rotated for variety */}
      <div className="pointer-events-none absolute inset-0 rotate-[30deg] scale-[1.2]">
        <ConfettiSvg className="w-full h-full text-amber-400 opacity-[0.12]" />
      </div>

      {/* Card — relative so it sits above confetti */}
      <div className="relative bg-white rounded-3xl p-8 max-w-xs w-full shadow-lg shadow-amber-900/8 border border-amber-100 text-center overflow-hidden animate-fade-up">

        {/* Corner herb sprigs — inside the card */}
        <CornerSprigSvg
          className="pointer-events-none absolute top-0 right-0 w-16 h-16 text-emerald-600 opacity-20"
        />
        <CornerSprigSvg
          flip
          className="pointer-events-none absolute bottom-0 left-0 w-16 h-16 text-emerald-600 opacity-15"
        />

        {/* Venue logo */}
        <div className="flex justify-center mb-4">
          <VenueLogo
            venue={venue}
            wrapClass="block h-10 w-[8rem] overflow-hidden"
            imgClass="h-[4.2rem] w-auto max-w-none -translate-x-1.5 -translate-y-0.5 object-contain"
            textClass="text-xl font-bold text-gray-900"
          />
        </div>

        {/* Success icon */}
        <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle size={36} className="text-emerald-500" />
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-1">You're in!</h2>
        <p className="text-sm text-gray-500 mb-6">
          Table {table.table_number}{table.label ? ` · ${table.label}` : ''} · {venue.name}
        </p>

        {/* Code display */}
        <div className="rounded-2xl bg-amber-50 border-2 border-dashed border-amber-200 px-6 py-5 mb-2">
          <p className="text-xs text-amber-700 font-medium uppercase tracking-wider mb-2">Table code</p>
          <p className="text-5xl font-bold tracking-[0.3em] text-gray-900 font-mono">
            {code.split('').join(' ')}
          </p>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-1.5 mx-auto text-sm text-brand-600 hover:text-brand-700 font-medium mb-6 py-1 px-2 rounded-lg hover:bg-brand-50 transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy code'}
        </button>

        {/* Share instruction */}
        <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 mb-6 text-left">
          <Users size={16} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Share this code with the people at your table. They scan the QR code,
            tap <strong>"Join Table"</strong>, and enter these {venue.code_length} digits to join your order.
          </p>
        </div>

        <Button fullWidth size="lg" onClick={onContinue}>
          Browse Menu
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  )
}
