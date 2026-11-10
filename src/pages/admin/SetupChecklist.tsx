import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Circle, ArrowRight, Store, UtensilsCrossed, Users, QrCode, ChevronDown, ChevronUp } from 'lucide-react'
import { getTablesByVenue, getMenu } from '../../lib/api'
import { getSupabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'

interface Props {
  venueId: string
}

interface Step {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  link: string
  done: boolean
}

export function SetupChecklist({ venueId }: Props) {
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(true)
  const COLLAPSED_KEY = `tk_checklist_collapsed_${venueId}`
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  })

  useEffect(() => {
    const check = async () => {
      const sb = getSupabase()
      const [tables, menu, staffRes, venueRes] = await Promise.all([
        getTablesByVenue(venueId),
        getMenu(venueId),
        sb.from('staff').select('id').eq('venue_id', venueId).eq('active', true).not('user_id', 'is', null),
        sb.from('venues').select('setup_progress').eq('id', venueId).single(),
      ])

      const qrDownloaded = venueRes.data?.setup_progress?.qr === true

      setSteps([
        {
          id: 'tables',
          label: 'Add tables',
          description: 'Create your restaurant tables and download QR codes',
          icon: <Store size={20} />,
          link: '/admin',
          done: tables.length > 0,
        },
        {
          id: 'menu',
          label: 'Add menu items',
          description: 'Create categories and add your dishes, drinks, and prices',
          icon: <UtensilsCrossed size={20} />,
          link: '/admin',
          done: menu.items.length > 0,
        },
        {
          id: 'staff',
          label: 'Invite your team',
          description: 'Add waiters and kitchen staff with shareable invite links',
          icon: <Users size={20} />,
          link: '/admin',
          done: (staffRes.data ?? []).length > 1, // more than just the owner
        },
        {
          id: 'qr',
          label: 'Download QR codes',
          description: 'Print and place QR codes on your tables',
          icon: <QrCode size={20} />,
          link: '/admin',
          done: qrDownloaded,
        },
      ])
      setLoading(false)
    }
    check()
  }, [venueId])

  const completedCount = steps.filter((s) => s.done).length
  const allDone = steps.length > 0 && completedCount === steps.length

  useEffect(() => {
    if (allDone && localStorage.getItem(COLLAPSED_KEY) === null) {
      setCollapsed(true)
    }
  }, [allDone, COLLAPSED_KEY])

  if (loading) return null

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
  }

  // Always render — even when all done (collapsed by default)
  return (
    <div className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={toggleCollapsed}
        className="w-full flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-brand-50 to-orange-50 border-b border-brand-100 hover:from-brand-100 hover:to-orange-100 transition-colors"
      >
        <Store size={18} className="text-brand-500 shrink-0" />
        <h3 className="font-semibold text-gray-900 text-sm">
          {allDone ? <><CheckCircle size={16} className="inline mr-1 -mt-0.5 text-emerald-500" />Setup complete</> : 'Setup checklist'}
        </h3>
        <span className="ml-1 text-xs text-gray-500 font-medium">{completedCount}/{steps.length}</span>
        <span className="ml-auto text-gray-400">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </button>

      {/* Progress bar always visible */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full bg-brand-500 transition-all duration-500"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      {!collapsed && (
        <div className="divide-y divide-gray-50">
          {steps.map((step) => (
            <Link
              key={step.id}
              to={step.link}
              className={cn(
                'flex items-center gap-3 px-5 py-3 transition-colors',
                step.done ? 'bg-emerald-50/30' : 'hover:bg-gray-50'
              )}
            >
              <div className={cn('shrink-0', step.done ? 'text-emerald-500' : 'text-gray-300')}>
                {step.done ? <CheckCircle size={22} /> : <Circle size={22} />}
              </div>
              <div className={cn('flex-1 min-w-0', step.done && 'opacity-60')}>
                <p className={cn('text-sm font-medium', step.done ? 'text-gray-500 line-through' : 'text-gray-900')}>
                  {step.label}
                </p>
                <p className="text-xs text-gray-400">{step.description}</p>
              </div>
              {!step.done && <ArrowRight size={16} className="text-gray-300 shrink-0" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
