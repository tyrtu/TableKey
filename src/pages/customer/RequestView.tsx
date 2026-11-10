import { useEffect, useState } from 'react'
import { Bell, Clock, ArrowLeft, XCircle, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { VenueLogo } from '../../components/ui/VenueLogo'
import { PlacematScatterSvg } from '../../components/ui/Decorations'
import type { RestaurantTable, Venue, TableRequest } from '../../types/database'

interface Props {
  table: RestaurantTable
  venue: Venue
  request: TableRequest | null
  onBack: () => void
}

// Escalation thresholds: stage advances at 1/3 and 2/3 of escalateSeconds
const STAGES = [
  {
    label: 'Your assigned waiter notified',
    sublabel: 'They\'ll be with you shortly',
    activeColor: 'bg-brand-500',
    textColor: 'text-brand-700',
    bgColor: 'bg-brand-50 border-brand-200',
  },
  {
    label: 'All on-duty waiters notified',
    sublabel: 'Someone will come to your table soon',
    activeColor: 'bg-amber-500',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-50 border-amber-200',
  },
  {
    label: 'Manager has been notified',
    sublabel: 'We\'re prioritising your request now',
    activeColor: 'bg-red-500',
    textColor: 'text-red-700',
    bgColor: 'bg-red-50 border-red-200',
  },
]

export function RequestView({ table, venue, request, onBack }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const escalateSeconds = venue.request_escalate_min * 60
  const stageThreshold = escalateSeconds / 3

  // 0 = stage 1, 1 = stage 2, 2 = stage 3
  const stageIndex = elapsed < stageThreshold ? 0 : elapsed < stageThreshold * 2 ? 1 : 2
  const currentStage = STAGES[stageIndex]

  if (request?.status === 'denied') {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center p-6 text-center overflow-hidden"
        style={{ background: '#FFFAF5' }}>
        <PlacematScatterSvg className="pointer-events-none absolute inset-0 w-full h-full text-amber-800 opacity-[0.05]" />
        <div className="relative bg-white rounded-3xl p-8 max-w-xs w-full shadow-sm border border-gray-100">
          <VenueLogo venue={venue} imgClass="h-10 w-auto max-w-[7rem] object-contain"
            wrapClass="flex h-10 w-full items-center justify-center mb-5" />
          <div className="mx-auto h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <XCircle size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Request declined</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your request was not approved. Please speak to a staff member if you need assistance.
          </p>
          <Button fullWidth variant="secondary" onClick={onBack}>
            <ArrowLeft size={16} /> Back to Menu
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-6 text-center overflow-hidden"
      style={{ background: '#FFFAF5' }}>

      {/* Placemat scatter — faint behind everything */}
      <PlacematScatterSvg className="pointer-events-none absolute inset-0 w-full h-full text-amber-800 opacity-[0.05]" />
      <div className="relative bg-white rounded-3xl p-8 max-w-xs w-full shadow-sm border border-amber-100 animate-fade-up">
        <VenueLogo venue={venue} imgClass="h-10 w-auto max-w-[7rem] object-contain"
          wrapClass="flex h-10 w-full items-center justify-center mb-5" />
        {/* Animated bell */}
        <div className={cn(
          'mx-auto h-16 w-16 rounded-full flex items-center justify-center mb-4 transition-colors duration-700',
          stageIndex === 0 ? 'bg-brand-100' : stageIndex === 1 ? 'bg-amber-100' : 'bg-red-100'
        )}>
          <Bell
            size={32}
            className={cn(
              'transition-colors duration-700',
              stageIndex === 0 ? 'text-brand-500' : stageIndex === 1 ? 'text-amber-500' : 'text-red-500'
            )}
            style={{ animation: 'bell-ring 1.2s ease-in-out infinite' }}
          />
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-1">Waiting for staff</h2>
        <p className="text-sm text-gray-500 mb-5">
          Table {table.table_number} · Keep this screen open.
        </p>

        {/* Timer */}
        <div className="flex items-center justify-center gap-2 mb-6 text-sm text-gray-500">
          <Clock size={14} />
          <span className="font-mono tabular-nums">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </span>
        </div>

        {/* 3-stage progress indicator */}
        <div className="space-y-2 mb-6">
          {STAGES.map((stage, i) => {
            const isActive = i === stageIndex
            const isDone = i < stageIndex
            return (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 border text-left transition-all duration-500',
                  isActive ? stage.bgColor : 'border-gray-100 bg-gray-50',
                  isDone ? 'opacity-40' : ''
                )}
              >
                {/* Step dot */}
                <div className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-colors duration-500',
                  isActive ? stage.activeColor : isDone ? 'bg-gray-300' : 'bg-gray-200'
                )}>
                  {isDone ? (
                    <Check size={12} className="text-white" />
                  ) : (
                    <span className="text-white text-[10px] font-bold">{i + 1}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className={cn(
                    'text-xs font-semibold leading-tight transition-colors duration-500',
                    isActive ? currentStage.textColor : 'text-gray-400'
                  )}>
                    {stage.label}
                  </p>
                  {isActive && (
                    <p className={cn('text-[10px] mt-0.5 leading-tight', currentStage.textColor, 'opacity-70')}>
                      {stage.sublabel}
                    </p>
                  )}
                </div>
                {isActive && (
                  <div className={cn('ml-auto h-2 w-2 rounded-full shrink-0 animate-pulse', stage.activeColor)} />
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-gray-400 mb-6">
          You'll automatically receive a code when approved.
        </p>

        <Button fullWidth variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={14} />
          Cancel and go back
        </Button>
      </div>

      <style>{`
        @keyframes bell-ring {
          0%,100% { transform: rotate(0deg); }
          10%      { transform: rotate(-18deg); }
          30%      { transform: rotate(18deg); }
          50%      { transform: rotate(-12deg); }
          70%      { transform: rotate(12deg); }
          90%      { transform: rotate(-6deg); }
        }
      `}</style>
    </div>
  )
}
