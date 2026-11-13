import { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Clock, Users, ShoppingBag, DollarSign,
  XCircle, UtensilsCrossed, ChevronDown, ChevronUp, Minus,
} from 'lucide-react'
import { getAnalytics } from '../../lib/api'
import { formatCurrency, cn } from '../../lib/utils'
import { Select } from '../../components/ui/Select'
import { Spinner } from '../../components/ui/Spinner'
import { Card } from '../../components/ui/Card'
import { Tabs, TabPanel } from '../../components/ui/Tabs'
import { subDays, startOfDay, format, parseISO, eachDayOfInterval } from 'date-fns'

interface Props { venueId: string }

type Range = '1d' | '7d' | '30d' | '90d'

const RANGE_OPTIONS = [
  { value: '1d', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

export default function Analytics({ venueId }: Props) {
  const [range, setRange] = useState<Range>('7d')
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [data, setData] = useState<{
    orders: { placed_at: string; subtotal: number; status: string; table_id: string }[]
    requests: { requested_at: string; status: string; handled_at: string | null }[]
    payments: { initiated_at?: string; created_at?: string; total?: number; amount?: number; state?: string; status?: string; method?: string; tip_amount?: number }[]
    orderItems: { item_name: string; item_price: number; quantity: number; line_total: number; payment_status: string }[]
  } | null>(null)
  const [prevData, setPrevData] = useState<typeof data>(null)

  const days = range === '1d' ? 0 : range === '7d' ? 7 : range === '30d' ? 30 : 90

  useEffect(() => {
    setLoading(true)
    setError(null)
    const now = new Date()
    const periodStart = startOfDay(subDays(now, days)).toISOString()
    // previous period: same window length shifted back
    const prevEnd = startOfDay(subDays(now, days)).toISOString()
    const prevStart = startOfDay(subDays(now, days * 2 || 1)).toISOString()

    Promise.all([
      getAnalytics(venueId, periodStart),
      getAnalytics(venueId, prevStart, prevEnd),
    ])
      .then(([curr, prev]) => {
        setData(curr as typeof data)
        setPrevData(prev as typeof data)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Unable to load analytics.')
      })
      .finally(() => setLoading(false))
  }, [venueId, days, retryKey])

  const stats = useMemo(() => {
    if (!data) return null

    const completedOrders = data.orders.filter(o => o.status !== 'cancelled')

    const totalRevenue = data.payments.reduce((s, p) => s + Number(p.total ?? p.amount ?? 0), 0)
    const totalTips = data.payments.reduce((s, p) => s + Number(p.tip_amount ?? 0), 0)
    const avgOrderValue = completedOrders.length > 0
      ? completedOrders.reduce((s, o) => s + Number(o.subtotal), 0) / completedOrders.length : 0

    const approvedRequests = data.requests.filter(r => r.status === 'approved')
    const deniedRequests = data.requests.filter(r => r.status === 'denied')

    const approvalTimes = approvedRequests
      .filter(r => r.handled_at)
      .map(r => (new Date(r.handled_at!).getTime() - new Date(r.requested_at).getTime()) / 60000)
    const avgApprovalTime = approvalTimes.length > 0
      ? approvalTimes.reduce((s, t) => s + t, 0) / approvalTimes.length : 0

    const hourCounts = Array(24).fill(0)
    for (const o of completedOrders) hourCounts[new Date(o.placed_at).getHours()]++
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts))

    const interval = { start: subDays(new Date(), Math.max(days, 1)), end: new Date() }
    const dayLabels = eachDayOfInterval(interval).map(d => format(d, 'MMM d'))
    const revenuePerDay = eachDayOfInterval(interval).map(d => {
      const dayStart = startOfDay(d)
      const dayEnd = startOfDay(subDays(d, -1))
      return data.payments
        .filter(p => {
          const t = new Date(p.initiated_at ?? p.created_at ?? '')
          return t >= dayStart && t < dayEnd
        })
        .reduce((s, p) => s + Number(p.total ?? p.amount ?? 0), 0)
    })

    // Per-item breakdown with per-day counts for sparkline (#4)
    const itemMap = new Map<string, {
      name: string; price: number; count: number; revenue: number; paidRevenue: number
      dailyCounts: number[]  // last 7 days
    }>()
    const now = new Date()
    for (const item of data.orderItems) {
      const existing = itemMap.get(item.item_name) ?? {
        name: item.item_name, price: item.item_price, count: 0, revenue: 0, paidRevenue: 0,
        dailyCounts: Array(7).fill(0),
      }
      existing.count += item.quantity
      existing.revenue += Number(item.line_total)
      if (item.payment_status === 'paid') existing.paidRevenue += Number(item.line_total)
      // Slot into 7-day bucket using order's placed_at if available
      const placedAt = (item as Record<string, unknown> & { orders?: { placed_at?: string } }).orders?.placed_at
      if (placedAt) {
        const daysAgo = Math.floor((now.getTime() - new Date(placedAt).getTime()) / 86400000)
        if (daysAgo >= 0 && daysAgo < 7) existing.dailyCounts[6 - daysAgo] += item.quantity
      }
      itemMap.set(item.item_name, existing)
    }
    const topItems = Array.from(itemMap.values()).sort((a, b) => b.count - a.count)

    // #2: previous period stats for deltas
    const prevOrders = prevData ? prevData.orders.filter(o => o.status !== 'cancelled') : []
    const prevRevenue = prevData ? prevData.payments.reduce((s, p) => s + Number(p.total ?? p.amount ?? 0), 0) : null
    const prevOrderCount = prevData ? prevOrders.length : null
    const prevAvgOrder = prevData && prevOrders.length > 0
      ? prevOrders.reduce((s, o) => s + Number(o.subtotal), 0) / prevOrders.length : null

    const delta = (curr: number, prev: number | null) => {
      if (prev === null || prev === 0) return null
      return ((curr - prev) / prev) * 100
    }

    return {
      totalOrders: completedOrders.length,
      totalRevenue, totalTips, avgOrderValue, avgApprovalTime, peakHour,
      deniedCount: deniedRequests.length,
      totalRequests: data.requests.length,
      dayLabels, revenuePerDay,
      maxRevPerDay: Math.max(...revenuePerDay, 1),
      hourCounts, topItems,
      // deltas
      deltaOrders: delta(completedOrders.length, prevOrderCount),
      deltaRevenue: delta(totalRevenue, prevRevenue),
      deltaAvgOrder: delta(avgOrderValue, prevAvgOrder),
    }
  }, [data, prevData, days])

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'items', label: `Items${stats?.topItems.length ? ` (${stats.topItems.length})` : ''}` },
    { id: 'hours', label: 'Peak Hours' },
  ]

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  if (error) return (
    <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-6 text-center">
      <p className="text-sm font-medium text-red-700">{error}</p>
      <button
        type="button"
        onClick={() => setRetryKey(key => key + 1)}
        className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
      >
        Try again
      </button>
    </div>
  )
  if (!stats) return null

  const peakLabel = stats.peakHour === 0 ? '12am'
    : stats.peakHour < 12 ? `${stats.peakHour}am`
    : stats.peakHour === 12 ? '12pm'
    : `${stats.peakHour - 12}pm`

  return (
    <div className="pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Performance</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 mt-1">Analytics</h2>
          <p className="text-sm text-gray-500 mt-1">Understand what is driving orders, revenue, and service quality.</p>
        </div>
        <Select
          options={RANGE_OPTIONS}
          value={range}
          onChange={e => setRange(e.target.value as Range)}
          className="w-36"
        />
      </div>

      {/* KPI row */}
      <section className="mb-7">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">At a glance</p>
          <span className="text-xs text-gray-400">Selected period</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard prominent icon={<ShoppingBag size={18} className="text-blue-500" />} bg="bg-blue-50"
          label="Orders" value={stats.totalOrders.toString()} delta={stats.deltaOrders} />
        <KpiCard prominent icon={<DollarSign size={18} className="text-emerald-500" />} bg="bg-emerald-50"
          label="Revenue" value={formatCurrency(stats.totalRevenue)}
          sub={stats.totalTips > 0 ? `+${formatCurrency(stats.totalTips)} tips` : undefined}
          delta={stats.deltaRevenue} />
        <KpiCard icon={<TrendingUp size={18} className="text-brand-500" />} bg="bg-brand-50"
          label="Avg Order" value={formatCurrency(stats.avgOrderValue)} delta={stats.deltaAvgOrder} />
        <KpiCard icon={<XCircle size={18} className="text-red-400" />} bg="bg-red-50"
          label="Denied" value={stats.deniedCount.toString()}
          sub={stats.totalRequests > 0 ? `${Math.round((stats.deniedCount / stats.totalRequests) * 100)}% of requests` : undefined} />
        </div>
      </section>

      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-6" />

      {/* ── OVERVIEW ── */}
      <TabPanel active={tab} id="overview">
        <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 mb-2">Service signals</p>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard icon={<Clock size={18} className="text-purple-500" />} bg="bg-purple-50"
            label="Avg Approval Time"
            value={stats.avgApprovalTime > 0 ? `${stats.avgApprovalTime.toFixed(1)}m` : '—'} />
          <KpiCard icon={<Users size={18} className="text-yellow-600" />} bg="bg-yellow-50"
            label="Peak Hour" value={stats.totalOrders > 0 ? peakLabel : '—'} />
        </div>
        </section>

        <Card className="mb-4 rounded-lg border-gray-200 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Revenue per day</h3>
          {stats.totalRevenue === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No revenue in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <div
                className="flex items-end gap-1 h-28"
                style={{ minWidth: `${stats.dayLabels.length * 28}px` }}
              >
                {stats.revenuePerDay.map((rev, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <div
                      className="w-full bg-emerald-500 rounded-t-sm transition-all group-hover:bg-emerald-600 relative"
                      style={{ height: `${Math.max(2, (rev / stats.maxRevPerDay) * 104)}px` }}
                      title={formatCurrency(rev)}
                    >
                      {rev > 0 && (
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 whitespace-nowrap">
                          {formatCurrency(rev)}
                        </span>
                      )}
                    </div>
                    {(i === 0 || i === Math.floor(stats.dayLabels.length / 2) || i === stats.dayLabels.length - 1) && (
                      <span className="text-[9px] text-gray-400 whitespace-nowrap">{stats.dayLabels[i]}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </TabPanel>

      {/* ── ITEMS ── */}
      <TabPanel active={tab} id="items">
        {stats.topItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <UtensilsCrossed size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No item data in this period.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500">
              <div className="col-span-5">Item</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-3 text-right">Revenue</div>
              <div className="col-span-2 text-right">Paid</div>
            </div>
            {stats.topItems.map((item, i) => (
              <ItemRow
                key={item.name}
                item={item}
                rank={i + 1}
                maxCount={stats.topItems[0]?.count ?? 1}
              />
            ))}
          </div>
        )}
      </TabPanel>

      {/* ── PEAK HOURS ── */}
      <TabPanel active={tab} id="hours">
        <Card className="rounded-lg border-gray-200 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-1 text-sm">Orders by hour of day</h3>
          <p className="text-xs text-gray-400 mb-4">Darker = more orders</p>
          <HourHeatmap hourCounts={stats.hourCounts} />
        </Card>
      </TabPanel>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, bg, delta, prominent = false }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; bg: string; delta?: number | null; prominent?: boolean
}) {
  return (
    <div className={cn('bg-white rounded-lg border border-gray-200 p-4', prominent && 'lg:py-5')}>
      <div className={cn('inline-flex items-center justify-center h-8 w-8 rounded-lg mb-2', bg)}>
        {icon}
      </div>
      <p className={cn('font-bold text-gray-900 leading-tight', prominent ? 'text-2xl' : 'text-xl')}>{value}</p>
      <p className={cn('text-gray-500', prominent ? 'text-sm font-medium' : 'text-xs')}>{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      {/* #2: period delta */}
      {delta !== null && delta !== undefined && (
        <div className={cn(
          'flex items-center gap-0.5 text-[10px] font-semibold mt-1',
          delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-500' : 'text-gray-400'
        )}>
          {delta > 0 ? <TrendingUp size={10} /> : delta < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
          {delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% vs prev period`}
        </div>
      )}
    </div>
  )
}

function ItemRow({ item, rank, maxCount }: {
  item: { name: string; price: number; count: number; revenue: number; paidRevenue: number; dailyCounts: number[] }
  rank: number
  maxCount: number
}) {
  const [expanded, setExpanded] = useState(false)
  const barWidth = Math.max(4, (item.count / maxCount) * 100)
  const paidPct = item.revenue > 0 ? Math.round((item.paidRevenue / item.revenue) * 100) : 0
  const sparkMax = Math.max(...item.dailyCounts, 1)

  return (
    <div className="border-b border-gray-50 last:border-b-0">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-gray-50 transition-colors text-left items-center"
      >
        <div className="col-span-5 flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-gray-400 font-bold w-4 shrink-0">#{rank}</span>
          <span className="font-medium text-gray-900 truncate">{item.name}</span>
        </div>
        <div className="col-span-2 text-right">
          <span className="font-semibold text-gray-900">{item.count}</span>
        </div>
        <div className="col-span-3 text-right">
          <span className="font-semibold text-gray-900">{formatCurrency(item.revenue)}</span>
        </div>
        <div className="col-span-2 text-right flex items-center justify-end gap-1">
          <span className={cn('text-xs font-medium', paidPct === 100 ? 'text-emerald-600' : 'text-gray-500')}>
            {paidPct}%
          </span>
          {expanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2 bg-gray-50/60">
          {/* #4: 7-day sparkline */}
          <div>
            <p className="text-[10px] text-gray-400 mb-1">Last 7 days</p>
            <div className="flex items-end gap-0.5 h-8">
              {item.dailyCounts.map((count, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-brand-400 transition-all"
                  style={{ height: `${Math.max(2, (count / sparkMax) * 32)}px`, opacity: count === 0 ? 0.2 : 1 }}
                  title={`${count} ordered`}
                />
              ))}
            </div>
          </div>
          {/* Popularity bar */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
              <span>Popularity (relative to top item)</span>
              <span>{item.count}×</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${barWidth}%` }} />
            </div>
          </div>
          {/* Revenue breakdown */}
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Unit price" value={formatCurrency(item.price)} />
            <MiniStat label="Total revenue" value={formatCurrency(item.revenue)} />
            <MiniStat label="Paid revenue" value={formatCurrency(item.paidRevenue)} green={paidPct === 100} />
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 px-2 py-1.5 text-center">
      <p className={cn('text-xs font-bold', green ? 'text-emerald-600' : 'text-gray-800')}>{value}</p>
      <p className="text-[9px] text-gray-400 leading-tight">{label}</p>
    </div>
  )
}

function HourHeatmap({ hourCounts }: { hourCounts: number[] }) {
  const max = Math.max(...hourCounts, 1)
  const labels = Array(24).fill(0).map((_, h) =>
    h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  )

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1" style={{ minWidth: '480px' }}>
        {hourCounts.map((count, h) => (
          <div key={h} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-sm cursor-default"
              style={{
                height: '32px',
                backgroundColor: count === 0
                  ? '#f3f4f6'
                  : `rgba(224, 92, 39, ${0.12 + (count / max) * 0.88})`,
              }}
              title={`${labels[h]}: ${count} order${count !== 1 ? 's' : ''}`}
            >
              {count > 0 && count === max && (
                <div className="h-full flex items-center justify-center">
                  <span className="text-[8px] text-white font-bold">{count}</span>
                </div>
              )}
            </div>
            {h % 3 === 0 && (
              <span className="text-[8px] text-gray-400 whitespace-nowrap">{labels[h]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
