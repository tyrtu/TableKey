import { ArrowRight } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { VenueLogo } from '../../components/ui/VenueLogo'
import { PlateCutlerySvg, SteamWispsSvg } from '../../components/ui/Decorations'
import type { RestaurantTable, Venue } from '../../types/database'

interface Props {
  table: RestaurantTable
  venue: Venue
  onContinue: () => void
}

export function GreetingView({ table, venue, onContinue }: Props) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6 overflow-hidden"
      style={{ background: '#FFFAF5' }}>

      {/* Large faint plate+cutlery behind everything */}
      <PlateCutlerySvg
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] text-amber-800 opacity-[0.06]"
      />

      {/* Floating dot grid — top-left quadrant */}
      <svg aria-hidden="true" className="pointer-events-none absolute top-0 left-0 w-48 h-48 opacity-[0.06] text-amber-900"
        viewBox="0 0 100 100">
        {Array.from({ length: 6 }, (_, r) =>
          Array.from({ length: 6 }, (_, c) => (
            <circle key={`${r}-${c}`} cx={10 + c * 16} cy={10 + r * 16} r="2" fill="currentColor" />
          ))
        )}
      </svg>

      {/* Dot grid — bottom-right quadrant */}
      <svg aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 w-48 h-48 opacity-[0.06] text-amber-900"
        viewBox="0 0 100 100">
        {Array.from({ length: 6 }, (_, r) =>
          Array.from({ length: 6 }, (_, c) => (
            <circle key={`${r}-${c}`} cx={10 + c * 16} cy={10 + r * 16} r="2" fill="currentColor" />
          ))
        )}
      </svg>

      {/* Card */}
      <div className="relative bg-white rounded-3xl px-8 pt-8 pb-8 max-w-xs w-full shadow-lg shadow-amber-900/8 border border-amber-100 text-center animate-fade-up">

        {/* Steam wisps rising from card top */}
        <SteamWispsSvg
          className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 w-28 h-20 text-amber-400 opacity-50"
        />

        {/* Venue logo */}
        <div className="flex justify-center mb-4">
          <VenueLogo
            venue={venue}
            wrapClass="block h-16 w-[11rem] overflow-hidden"
            imgClass="h-[5.5rem] w-auto max-w-none -translate-x-2 -translate-y-1 object-contain"
            textClass="text-3xl font-bold text-gray-900"
          />
        </div>

        {/* Table label */}
        <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="text-xs font-medium text-amber-800">
            Table {table.table_number}{table.label ? ` · ${table.label}` : ''}
          </span>
        </div>

        {/* How it works */}
        <div className="space-y-3 mb-8 text-left">
          <Step n="1" text="Browse the menu at your own pace" />
          <Step n="2" text="Add items to your cart" />
          <Step n="3" text={'Tap \u201cRequest to Order\u201d \u2014 a waiter will verify your group and open your session'} />
        </div>

        <Button fullWidth size="lg" onClick={onContinue}>
          Browse Menu
          <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  )
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-6 w-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {n}
      </div>
      <p className="text-sm text-gray-600 leading-snug">{text}</p>
    </div>
  )
}
