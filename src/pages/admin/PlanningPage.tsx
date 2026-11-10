import { useState, useEffect, useCallback } from 'react'
import {
  Activity, TrendingUp, TrendingDown, Target, Calculator,
  ShoppingCart, Users, DollarSign, AlertCircle, CheckCircle2,
  Plus, Trash2, Pencil, Package, Lightbulb, RefreshCw,
  ChevronDown, ChevronUp, BarChart3, ClipboardList, Scale,
} from 'lucide-react'
import { startOfDay, subDays, startOfMonth, endOfMonth, format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  getRightNow, getNetSalesSummary, getTargets, upsertTarget, deleteTarget,
  getExpenses, getExpenseCategories, upsertExpense, deleteExpense,
  getPurchasingGuide, getPreviousPeriod, getAnalytics,
} from '../../lib/api'
import { getSupabase } from '../../lib/supabase'
import { formatCurrency, cn } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Spinner } from '../../components/ui/Spinner'
import { Tabs, TabPanel } from '../../components/ui/Tabs'
import { Card } from '../../components/ui/Card'
import type {
  SalesTarget, Expense, ExpenseCategory, PurchasingItem,
} from '../../lib/api'

interface Props { venueId: string; currency?: string }

type PeriodKey = '1d' | '7d' | '30d'
const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: '1d', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'This month' },
]

function periodDates(key: PeriodKey) {
  const now = new Date()
  if (key === '1d') return { from: startOfDay(now).toISOString(), to: now.toISOString() }
  if (key === '7d') return { from: startOfDay(subDays(now, 7)).toISOString(), to: now.toISOString() }
  return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() }
}

// ── Percent change helper ──────────────────────────────────────
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}

function PctBadge({ pct, inverse = false }: { pct: number | null; inverse?: boolean }) {
  if (pct === null) return <span className="text-xs text-gray-400">no prior data</span>
  const good = inverse ? pct < 0 : pct >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', good ? 'text-emerald-600' : 'text-red-500')}>
      {pct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
    </span>
  )
}

// ── Main Component ─────────────────────────────────────────────

export default function PlanningPage({ venueId, currency = 'USD' }: Props) {
  const [tab, setTab] = useState('home')

  const TABS = [
    { id: 'home',      label: <><BarChart3 size={15} /> Overview</> },
    { id: 'money',     label: <><DollarSign size={15} /> Money</> },
    { id: 'targets',   label: <><Target size={15} /> Targets</> },
    { id: 'expenses',  label: <><ClipboardList size={15} /> Expenses</> },
    { id: 'breakeven', label: <><Scale size={15} /> Break-even</> },
    { id: 'ordering',  label: <><Package size={15} /> Ordering</> },
  ]

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">Business Planning</h2>
        <p className="text-sm text-gray-500 mt-0.5">Understand your business, plan for growth</p>
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-6 -mx-4 px-4 overflow-x-auto" />
      <TabPanel active={tab} id="home"><HomeTab venueId={venueId} currency={currency} /></TabPanel>
      <TabPanel active={tab} id="money"><MoneyTab venueId={venueId} currency={currency} /></TabPanel>
      <TabPanel active={tab} id="targets"><TargetsTab venueId={venueId} currency={currency} /></TabPanel>
      <TabPanel active={tab} id="expenses"><ExpensesTab venueId={venueId} currency={currency} /></TabPanel>
      <TabPanel active={tab} id="breakeven"><BreakEvenTab venueId={venueId} currency={currency} /></TabPanel>
      <TabPanel active={tab} id="ordering"><OrderingTab venueId={venueId} /></TabPanel>
    </div>
  )
}

// ── HOME TAB ─────────────────────────────────────────────────

function HomeTab({ venueId, currency }: { venueId: string; currency: string }) {
  const [period, setPeriod] = useState<PeriodKey>('1d')
  const [rightNow, setRightNow] = useState<Awaited<ReturnType<typeof getRightNow>> | null>(null)
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getNetSalesSummary>> | null>(null)
  const [prevSummary, setPrevSummary] = useState<Awaited<ReturnType<typeof getNetSalesSummary>> | null>(null)
  const [insights, setInsights] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { from, to } = periodDates(period)
    const prev = getPreviousPeriod(from, to)
    const [rn, sum, psum] = await Promise.all([
      getRightNow(venueId),
      getNetSalesSummary(venueId, from, to),
      getNetSalesSummary(venueId, prev.from, prev.to),
    ])
    setRightNow(rn)
    setSummary(sum)
    setPrevSummary(psum)

    // Rule-based insights
    const ins: string[] = []
    const salesChange = pctChange(sum.netSales, psum.netSales)
    if (salesChange !== null && Math.abs(salesChange) >= 5) {
      ins.push(`Net sales are ${salesChange >= 0 ? 'up' : 'down'} ${Math.abs(salesChange).toFixed(0)}% vs the previous period (${formatCurrency(psum.netSales, currency)} → ${formatCurrency(sum.netSales, currency)}).`)
    }
    if (rn.unpaidParkedBalance > 0) {
      ins.push(`${rn.unpaidParkedCount} parked session${rn.unpaidParkedCount !== 1 ? 's' : ''} worth ${formatCurrency(rn.unpaidParkedBalance, currency)} are still unpaid.`)
    }
    if (rn.pendingRequests > 2) {
      ins.push(`${rn.pendingRequests} table requests are waiting — your team may be overwhelmed.`)
    }
    if (sum.voids > sum.netSales * 0.03) {
      ins.push(`Voids (${formatCurrency(sum.voids, currency)}) are ${((sum.voids / sum.netSales) * 100).toFixed(1)}% of net sales — higher than usual.`)
    }
    if (sum.avgBill > 0 && psum.avgBill > 0) {
      const billChange = pctChange(sum.avgBill, psum.avgBill)
      if (billChange !== null && billChange <= -10) {
        ins.push(`Average bill dropped ${Math.abs(billChange).toFixed(0)}% to ${formatCurrency(sum.avgBill, currency)}.`)
      }
    }
    setInsights(ins)
    setLoading(false)
    setRefreshing(false)
  }, [venueId, period, currency])

  useEffect(() => { load() }, [load])

  const refresh = () => { setRefreshing(true); load() }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Overview</p>
          <h3 className="text-lg font-semibold text-gray-900 mt-1">How is my business doing?</h3>
          <p className="text-sm text-gray-500 mt-1">A quick read on today’s activity and performance.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Select options={PERIODS} value={period} onChange={e => setPeriod(e.target.value as PeriodKey)} className="w-36" />
          <button onClick={refresh} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100" title="Refresh">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Right now */}
      {rightNow && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Right now
            </p>
            <span className="text-xs text-gray-400">Live activity</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
            {[
              { label: 'Active tables', value: rightNow.activeTables, icon: <Activity size={16} className="text-blue-500" /> },
              { label: 'Orders in kitchen', value: rightNow.ordersInKitchen, icon: <ShoppingCart size={16} className="text-orange-500" /> },
              { label: 'Outstanding', value: formatCurrency(rightNow.outstandingBalance, currency), icon: <DollarSign size={16} className="text-red-400" /> },
              { label: 'Pending requests', value: rightNow.pendingRequests, icon: <Users size={16} className="text-yellow-500" /> },
            ].map(s => (
              <div key={s.label} className="px-4 py-3.5 flex items-center gap-3 border-b sm:border-b-0 border-gray-100 even:border-l sm:even:border-l border-gray-100">
                {s.icon}
                <div>
                  <p className="text-base font-semibold text-gray-900">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* KPIs */}
      {summary && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Performance</p>
              <p className="text-xs text-gray-400 mt-1">Compared with the previous period</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard className="col-span-2 sm:col-span-2 sm:row-span-2" prominent label="Net Sales" value={formatCurrency(summary.netSales, currency)}
            change={pctChange(summary.netSales, prevSummary?.netSales ?? 0)}
            note="Gross minus voids, comps and refunds" />
          <KpiCard label="Orders" value={summary.orders.toString()}
            change={pctChange(summary.orders, prevSummary?.orders ?? 0)} />
          <KpiCard label="Sessions (covers)" value={summary.sessions.toString()}
            change={pctChange(summary.sessions, prevSummary?.sessions ?? 0)} />
          <KpiCard label="Avg Bill" value={formatCurrency(summary.avgBill, currency)}
            change={pctChange(summary.avgBill, prevSummary?.avgBill ?? 0)}
            note="Net sales ÷ sessions" />
          <KpiCard label="Avg Order" value={formatCurrency(summary.avgOrder, currency)}
            change={pctChange(summary.avgOrder, prevSummary?.avgOrder ?? 0)} />
          <KpiCard label="Tips" value={formatCurrency(summary.tips, currency)}
            change={pctChange(summary.tips, prevSummary?.tips ?? 0)} />
          </div>
        </section>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <section className="border-l-4 border-amber-400 bg-amber-50/60 px-4 py-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={16} className="text-amber-500" />
            <p className="font-semibold text-gray-900 text-sm">Insights</p>
          </div>
          <ul className="space-y-1.5">
            {insights.map((ins, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                {ins}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ── MONEY TAB ─────────────────────────────────────────────────

function MoneyTab({ venueId, currency }: { venueId: string; currency: string }) {
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getNetSalesSummary>> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { from, to } = periodDates(period)
    setLoading(true)
    getNetSalesSummary(venueId, from, to).then(s => { setSummary(s); setLoading(false) })
  }, [venueId, period])

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>
  if (!summary) return null

  const rows = [
    { label: 'Gross sales', value: summary.grossSales, note: 'All items ordered at snapshot prices' },
    { label: '− Voids', value: -summary.voids, red: true, note: 'Items removed after kitchen started' },
    { label: '− Comps', value: -summary.comps, red: true, note: 'Items given free' },
    { label: '− Refunds', value: -summary.refunds, red: true, note: 'Money returned to customers' },
    { label: 'Net sales', value: summary.netSales, bold: true, note: 'This is your revenue' },
    { label: 'Tax collected', value: summary.taxCollected, note: 'Owed to the tax authority' },
    { label: 'Service charge', value: summary.serviceCharge },
    { label: 'Tips', value: summary.tips, note: 'Not your revenue — distribute to staff' },
    { label: 'Money received', value: summary.moneyReceived, bold: true, note: 'All succeeded payments incl. tax/service/tips' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Where did my money come from and go?</h3>
        <Select options={PERIODS} value={period} onChange={e => setPeriod(e.target.value as PeriodKey)} className="w-36" />
      </div>

      <Card padding={false}>
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sales Summary</p>
        </div>
        <div className="divide-y divide-gray-50">
          {rows.map(row => (
            <div key={row.label} className={cn('flex items-center justify-between px-4 py-3', row.bold && 'bg-gray-50')}>
              <div>
                <p className={cn('text-sm', row.bold ? 'font-bold text-gray-900' : 'text-gray-700')}>{row.label}</p>
                {row.note && <p className="text-[10px] text-gray-400">{row.note}</p>}
              </div>
              <span className={cn('text-sm font-semibold', row.bold ? 'text-gray-900' : row.red ? 'text-red-500' : 'text-gray-700')}>
                {formatCurrency(Math.abs(row.value), currency)}{row.value < 0 ? '' : ''}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── TARGETS TAB ───────────────────────────────────────────────

function TargetsTab({ venueId, currency }: { venueId: string; currency: string }) {
  const [targets, setTargets] = useState<SalesTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Partial<SalesTarget> | null>(null)
  const [delConfirm, setDelConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [netSales30, setNetSales30] = useState(0)

  useEffect(() => {
    const { from, to } = periodDates('30d')
    Promise.all([
      getTargets(venueId),
      getNetSalesSummary(venueId, from, to),
    ]).then(([t, s]) => {
      setTargets(t)
      setNetSales30(s.netSales)
      setLoading(false)
    })
  }, [venueId])

  const handleSave = async () => {
    if (!modal || !modal.period || !modal.amount || !modal.starts_on) return
    setSaving(true)
    try {
      await upsertTarget({
        venue_id: venueId,
        period: modal.period as SalesTarget['period'],
        amount: Number(modal.amount),
        starts_on: modal.starts_on,
      })
      const updated = await getTargets(venueId)
      setTargets(updated)
      setModal(null)
      toast.success('Target saved.')
    } catch { toast.error('Failed to save target.') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!delConfirm) return
    setDeleting(true)
    try {
      await deleteTarget(delConfirm)
      setTargets(t => t.filter(x => x.id !== delConfirm))
      toast.success('Target removed.')
    } catch { toast.error('Failed to delete.') }
    finally { setDeleting(false); setDelConfirm(null) }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const monthlyTarget = targets.find(t => t.period === 'monthly')
  const dailyTarget = targets.find(t => t.period === 'daily')

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const paceProgress = monthlyTarget
    ? (netSales30 / monthlyTarget.amount) * 100
    : null
  const projectedMonthly = monthlyTarget && dayOfMonth > 0
    ? (netSales30 / dayOfMonth) * daysInMonth
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Am I on track to hit my goals?</h3>
        <Button size="sm" onClick={() => setModal({ period: 'monthly', starts_on: format(startOfMonth(new Date()), 'yyyy-MM-dd') })}>
          <Plus size={14} /> Set Target
        </Button>
      </div>

      {/* Monthly progress */}
      {monthlyTarget && projectedMonthly !== null && (
        <Card>
          <p className="text-xs text-gray-500 mb-1">Monthly target</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(monthlyTarget.amount, currency)}</p>
          <div className="my-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{formatCurrency(netSales30, currency)} so far</span>
              <span>{Math.min(100, paceProgress ?? 0).toFixed(0)}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', (paceProgress ?? 0) >= 100 ? 'bg-emerald-500' : 'bg-brand-500')}
                style={{ width: `${Math.min(100, paceProgress ?? 0)}%` }}
              />
            </div>
          </div>
          {projectedMonthly >= monthlyTarget.amount ? (
            <p className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
              <CheckCircle2 size={14} /> On track — projected {formatCurrency(projectedMonthly, currency)} at current pace
            </p>
          ) : (
            <p className="text-sm text-red-500 font-medium flex items-center gap-1.5">
              <AlertCircle size={14} /> Behind by {formatCurrency(monthlyTarget.amount - projectedMonthly, currency)} — projected {formatCurrency(projectedMonthly, currency)}
            </p>
          )}
        </Card>
      )}

      {/* Daily target */}
      {dailyTarget && (
        <Card>
          <p className="text-xs text-gray-500 mb-1">Daily target</p>
          <p className="text-xl font-bold text-gray-900">{formatCurrency(dailyTarget.amount, currency)}</p>
        </Card>
      )}

      {targets.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <Target size={36} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No targets set yet.</p>
          <p className="text-xs mt-1">Set a monthly target to track your progress.</p>
        </div>
      )}

      {targets.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {targets.map((t, i) => (
            <div key={t.id} className={cn('flex items-center justify-between px-4 py-3', i > 0 && 'border-t border-gray-50')}>
              <div>
                <p className="text-sm font-semibold text-gray-900 capitalize">{t.period} target</p>
                <p className="text-xs text-gray-400">from {t.starts_on}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{formatCurrency(t.amount, currency)}</span>
                <button onClick={() => setModal(t)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><Pencil size={13} /></button>
                <button onClick={() => setDelConfirm(t.id)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title="Sales Target" size="sm">
        {modal && (
          <div className="space-y-3">
            <Select label="Period" value={modal.period ?? 'monthly'}
              onChange={e => setModal(m => ({ ...m, period: e.target.value as SalesTarget['period'] }))}
              options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
            <Input label="Target amount" type="number" min="0" step="100"
              value={modal.amount?.toString() ?? ''} onChange={e => setModal(m => ({ ...m, amount: Number(e.target.value) }))} />
            <Input label="Starting from" type="date"
              value={modal.starts_on ?? ''} onChange={e => setModal(m => ({ ...m, starts_on: e.target.value }))} />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={handleSave} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="Remove target?" message="This target will be deleted." confirmLabel="Remove" loading={deleting} />
    </div>
  )
}

// ── EXPENSES TAB ──────────────────────────────────────────────

function ExpensesTab({ venueId, currency }: { venueId: string; currency: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Partial<Expense> | null>(null)
  const [delConfirm, setDelConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { from, to } = periodDates('30d')

  const load = useCallback(async () => {
    const [exp, cats] = await Promise.all([
      getExpenses(venueId, from, to),
      getExpenseCategories(venueId),
    ])
    setExpenses(exp)
    setCategories(cats)
    setLoading(false)
  }, [venueId, from, to])

  useEffect(() => { load() }, [load])

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)

  const byCat = categories.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + Number(e.amount), 0),
    budget: expenses.filter(e => e.category_id === cat.id).find(e => e.budget)?.budget ?? null,
  }))

  const handleSave = async () => {
    if (!modal?.description || !modal?.amount || !modal?.expense_date) return
    setSaving(true)
    try {
      await upsertExpense({ ...modal, venue_id: venueId } as Parameters<typeof upsertExpense>[0])
      await load()
      setModal(null)
      toast.success('Expense saved.')
    } catch { toast.error('Failed to save expense.') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!delConfirm) return
    setDeleting(true)
    try {
      await deleteExpense(delConfirm)
      setExpenses(e => e.filter(x => x.id !== delConfirm))
      toast.success('Expense removed.')
    } catch { toast.error('Failed to delete.') }
    finally { setDeleting(false); setDelConfirm(null) }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">What am I spending?</h3>
          <p className="text-xs text-gray-400">This month · {format(new Date(), 'MMMM yyyy')}</p>
        </div>
        <Button size="sm" onClick={() => setModal({ expense_date: format(new Date(), 'yyyy-MM-dd'), is_recurring: false })}>
          <Plus size={14} /> Add Expense
        </Button>
      </div>

      {/* Total */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between">
        <p className="text-sm text-gray-600">Total expenses this month</p>
        <p className="text-xl font-bold text-gray-900">{formatCurrency(totalExpenses, currency)}</p>
      </div>

      {/* By category */}
      {byCat.filter(c => c.total > 0).map(cat => (
        <Card key={cat.id} padding={false}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ background: cat.color }} />
              <p className="text-sm font-semibold text-gray-800">{cat.name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">{formatCurrency(cat.total, currency)}</p>
              {cat.budget && (
                <p className={cn('text-[10px]', cat.total > cat.budget ? 'text-red-500' : 'text-gray-400')}>
                  Budget: {formatCurrency(cat.budget, currency)} ({cat.total > cat.budget ? 'over' : 'under'})
                </p>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {expenses.filter(e => e.category_id === cat.id).map(exp => (
              <div key={exp.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <p className="text-xs font-medium text-gray-700">{exp.description}</p>
                  <p className="text-[10px] text-gray-400">{exp.expense_date}{exp.is_recurring ? ' · recurring' : ''}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-gray-800">{formatCurrency(Number(exp.amount), currency)}</span>
                  <button onClick={() => setModal(exp)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><Pencil size={12} /></button>
                  <button onClick={() => setDelConfirm(exp.id)} className="p-1 rounded text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {expenses.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">No expenses recorded for this month.</p>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Edit Expense' : 'Add Expense'} size="sm">
        {modal && (
          <div className="space-y-3">
            <Input label="Description" value={modal.description ?? ''} onChange={e => setModal(m => ({ ...m, description: e.target.value }))} placeholder="e.g. Monthly rent" />
            <Input label="Amount" type="number" min="0" step="0.01" value={modal.amount?.toString() ?? ''} onChange={e => setModal(m => ({ ...m, amount: Number(e.target.value) }))} />
            <Input label="Date" type="date" value={modal.expense_date ?? ''} onChange={e => setModal(m => ({ ...m, expense_date: e.target.value }))} />
            <Select label="Category" value={modal.category_id ?? ''}
              onChange={e => setModal(m => ({ ...m, category_id: e.target.value || null }))}
              options={[{ value: '', label: 'Uncategorised' }, ...categories.map(c => ({ value: c.id, label: c.name }))]} />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
              <Button onClick={handleSave} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={handleDelete}
        title="Remove expense?" message="This expense record will be deleted." confirmLabel="Remove" loading={deleting} />
    </div>
  )
}

// ── BREAK-EVEN TAB ────────────────────────────────────────────

function BreakEvenTab({ venueId, currency }: { venueId: string; currency: string }) {
  const [fixedCosts, setFixedCosts] = useState('')
  const [marginPct, setMarginPct] = useState('60')   // gross margin %
  const [avgBill, setAvgBill] = useState('')
  const [loading, setLoading] = useState(true)
  const [netSales30, setNetSales30] = useState(0)
  const [loadedAvgBill, setLoadedAvgBill] = useState(0)

  useEffect(() => {
    const { from, to } = periodDates('30d')
    getNetSalesSummary(venueId, from, to).then(s => {
      setNetSales30(s.netSales)
      setLoadedAvgBill(s.avgBill)
      if (s.avgBill > 0) setAvgBill(s.avgBill.toFixed(2))
      setLoading(false)
    })
  }, [venueId])

  const fixed = parseFloat(fixedCosts) || 0
  const margin = parseFloat(marginPct) / 100
  const bill = parseFloat(avgBill) || loadedAvgBill

  const breakEvenSales = margin > 0 ? fixed / margin : 0
  const breakEvenOrders = bill > 0 ? Math.ceil(breakEvenSales / bill) : 0
  const breakEvenPerDay = breakEvenSales / 30
  const progressPct = breakEvenSales > 0 ? Math.min(100, (netSales30 / breakEvenSales) * 100) : 0

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-gray-900">Am I making a profit?</h3>
        <p className="text-xs text-gray-400">Enter your fixed costs to calculate break-even</p>
      </div>

      <Card>
        <div className="space-y-4">
          <Input label="Monthly fixed costs" type="number" min="0" step="100"
            value={fixedCosts} onChange={e => setFixedCosts(e.target.value)}
            placeholder="Rent + salaries + utilities…"
            hint="Total fixed expenses per month" />
          <Input label="Gross margin %" type="number" min="1" max="100"
            value={marginPct} onChange={e => setMarginPct(e.target.value)}
            hint="Revenue minus food cost, as a percentage. E.g. 60 means you keep 60 cents per $1 sold" />
          <Input label="Average bill per table" type="number" min="0" step="0.01"
            value={avgBill} onChange={e => setAvgBill(e.target.value)}
            hint={loadedAvgBill > 0 ? `Your actual avg this month: ${formatCurrency(loadedAvgBill, currency)}` : 'Enter manually'} />
        </div>
      </Card>

      {fixed > 0 && margin > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <ResultCard label="Break-even sales / month" value={formatCurrency(breakEvenSales, currency)} note="Must exceed this to profit" />
            <ResultCard label="Break-even sales / day" value={formatCurrency(breakEvenPerDay, currency)} />
            <ResultCard label="Tables needed / month" value={breakEvenOrders.toLocaleString()} note={`at ${formatCurrency(bill, currency)} avg bill`} />
            <ResultCard label="Tables needed / day" value={Math.ceil(breakEvenOrders / 30).toString()} />
          </div>

          <Card>
            <p className="text-sm font-semibold text-gray-900 mb-1">This month's progress to break-even</p>
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{formatCurrency(netSales30, currency)} so far</span>
              <span>{progressPct.toFixed(0)}% of {formatCurrency(breakEvenSales, currency)}</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', progressPct >= 100 ? 'bg-emerald-500' : 'bg-brand-500')}
                style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {progressPct >= 100
                ? <><CheckCircle2 size={14} className="inline mr-1 -mt-0.5 text-emerald-500" />You've covered fixed costs. Every {formatCurrency(bill, currency)} table from here is {formatCurrency(bill * margin, currency)} profit.</>
                : `You need ${formatCurrency(breakEvenSales - netSales30, currency)} more in net sales to cover fixed costs.`}
            </p>
            <p className="text-[10px] text-gray-400 mt-1"><AlertCircle size={12} className="inline mr-1 -mt-0.5" />Estimate only — not accounting advice.</p>
          </Card>
        </>
      )}
    </div>
  )
}

// ── ORDERING TAB ──────────────────────────────────────────────

function OrderingTab({ venueId }: { venueId: string }) {
  const [items, setItems] = useState<PurchasingItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPurchasingGuide(venueId).then(data => { setItems(data); setLoading(false) })
  }, [venueId])

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-gray-900">What should I stock?</h3>
        <p className="text-xs text-gray-400">Based on the last 8 weeks of orders · 20% buffer included</p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Package size={40} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Not enough order history yet.</p>
          <p className="text-xs mt-1">Come back after a few weeks of trading.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500">
            <div className="col-span-5">Item</div>
            <div className="col-span-2 text-right">Avg/wk</div>
            <div className="col-span-2 text-right">Peak/wk</div>
            <div className="col-span-3 text-right font-semibold text-brand-600">Order qty</div>
          </div>
          {items.map((item, i) => (
            <div key={item.item_id}
              className={cn('grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center', i > 0 && 'border-t border-gray-50')}>
              <div className="col-span-5 font-medium text-gray-900 truncate">{item.item_name}</div>
              <div className="col-span-2 text-right text-gray-600">{item.avgUnitsPerWeek}</div>
              <div className="col-span-2 text-right text-gray-600">{item.peakUnitsPerWeek}</div>
              <div className="col-span-3 text-right font-bold text-brand-600">{item.suggestedOrderQty}</div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-gray-400">Suggested order qty = avg × 1.2. Not an inventory system — use this as a guide only.</p>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────

function KpiCard({ label, value, change, note, className = '', prominent = false }: {
  label: string; value: string; change: number | null; note?: string; className?: string; prominent?: boolean
}) {
  return (
    <div className={cn('bg-white rounded-lg border border-gray-200 p-4', className)}>
      <p className={cn('font-bold text-gray-900 leading-tight', prominent ? 'text-3xl' : 'text-xl')}>{value}</p>
      <div className="flex items-center gap-1.5 mt-0.5">
        <p className={cn('text-gray-500', prominent ? 'text-sm font-medium' : 'text-xs')}>{label}</p>
        <PctBadge pct={change} />
      </div>
      {note && <p className={cn('text-gray-400 mt-1', prominent ? 'text-xs' : 'text-[10px]')}>{note}</p>}
    </div>
  )
}

function ResultCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-brand-50 border border-brand-100 rounded-2xl p-4">
      <p className="text-2xl font-bold text-brand-700">{value}</p>
      <p className="text-xs text-brand-600 font-medium">{label}</p>
      {note && <p className="text-[10px] text-gray-500 mt-0.5">{note}</p>}
    </div>
  )
}
