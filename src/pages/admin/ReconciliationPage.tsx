import { useState, useEffect } from 'react'
import {
  BarChart2, Download, RefreshCw,
  TrendingUp, Smartphone, CreditCard, Banknote, AlertTriangle,
} from 'lucide-react'
import { subDays, startOfDay, endOfDay, format } from 'date-fns'
import { getReconciliationReport } from '../../lib/api'
import { formatCurrency, formatDate, cn } from '../../lib/utils'
import { Select } from '../../components/ui/Select'
import { Spinner } from '../../components/ui/Spinner'
import { Tabs, TabPanel } from '../../components/ui/Tabs'
import type { ReconciliationReport } from '../../types/database'

interface Props { venueId: string; currency?: string }

type Range = '1d' | '7d' | '30d'

const RANGE_OPTIONS = [
  { value: '1d', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const METHOD_ICONS: Record<string, React.ReactNode> = {
  mpesa: <Smartphone size={16} className="text-green-600" />,
  card:  <CreditCard size={16} className="text-blue-600" />,
  cash:  <Banknote size={16} className="text-gray-600" />,
}

export default function ReconciliationPage({ venueId, currency = 'USD' }: Props) {
  const [range, setRange] = useState<Range>('1d')
  const [report, setReport] = useState<ReconciliationReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tab, setTab] = useState('summary')

  const [fromDate, toDate] = (() => {
    const days = range === '1d' ? 0 : range === '7d' ? 7 : 30
    const from = startOfDay(subDays(new Date(), days))
    const to = endOfDay(new Date())
    return [from.toISOString(), to.toISOString()]
  })()

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await getReconciliationReport(venueId, fromDate, toDate)
      setReport(r)
      setLastUpdated(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load reconciliation report.')
    }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [venueId, range])

  const handleExportCSV = () => {
    if (!report) return
    const rows: string[][] = [
      ['TableKey Reconciliation Report'],
      [`Period: ${formatDate(fromDate)} – ${formatDate(toDate)}`],
      [],
      ['PAYMENTS BY METHOD'],
      ['Method', 'Count', 'Total', 'Tips'],
      ...(report.by_method ?? []).map(m => [
        m.method, String(m.count), String(m.total), String(m.tips)
      ]),
      [],
      ['TOTALS'],
      ['Gross', 'Tips', 'Refunds', 'Failed', 'Cancelled'],
      [
        String(report.totals?.gross ?? 0),
        String(report.totals?.tips ?? 0),
        String(report.totals?.refunds ?? 0),
        String(report.totals?.failed_count ?? 0),
        String(report.totals?.cancelled_count ?? 0),
      ],
      [],
      ['VOIDS'],
      ['Item', 'Amount', 'Reason', 'Note', 'Voided at', 'By', 'Order', 'Table'],
      ...(report.voids ?? []).map(v => [
        v.item_name, String(v.line_total), v.void_reason, v.void_note ?? '',
        formatDate(v.voided_at), v.voided_by_name, v.order_number, v.table_number,
      ]),
      [],
      ['COMPS'],
      ['Item', 'Amount', 'Reason', 'Note', 'Comped at', 'By', 'Order'],
      ...(report.comps ?? []).map(c => [
        c.item_name, String(c.line_total), c.comp_reason, c.comp_note ?? '',
        formatDate(c.comped_at), c.comped_by_name, c.order_number,
      ]),
      [],
      ['OVERRIDES (unpaid closes)'],
      ['Table', 'Outstanding', 'Reason', 'Note', 'Closed at', 'By'],
      ...(report.overrides ?? []).map(o => [
        o.table_number, String(o.outstanding), o.reason, o.note ?? '',
        formatDate(o.created_at), o.closed_by_name,
      ]),
    ]

    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reconciliation-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const TABS = [
    { id: 'summary', label: 'Summary' },
    { id: 'voids', label: `Voids${report?.voids?.length ? ` (${report.voids.length})` : ''}` },
    { id: 'comps', label: `Comps${report?.comps?.length ? ` (${report.comps.length})` : ''}` },
    { id: 'overrides', label: `Overrides${report?.overrides?.length ? ` (${report.overrides.length})` : ''}` },
    { id: 'unpaid', label: `Unpaid${report?.unpaid_tabs?.length ? ` (${report.unpaid_tabs.length})` : ''}` },
  ]

  return (
    <div className="pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">Finance</p>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 mt-1">Reconciliation</h2>
          <p className="text-sm text-gray-500 mt-1">Review payments, adjustments, and outstanding balances.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Select options={RANGE_OPTIONS} value={range} onChange={e => setRange(e.target.value as Range)} className="w-36" />
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={handleExportCSV} disabled={!report} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors" title="Export CSV">
            <Download size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div>
            <p className="text-sm font-medium text-red-800">Could not load reconciliation data</p>
            <p className="mt-1 text-xs text-red-700">{error}</p>
          </div>
          <button
            onClick={load}
            className="shrink-0 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !report && (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      )}

      {report && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>
              Report period: {formatDate(report.period_from)} – {formatDate(report.period_to)}
            </span>
            {lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
          </div>
          <Tabs tabs={TABS} active={tab} onChange={setTab} className="mb-6" />

          {/* ── Summary ── */}
          <TabPanel active={tab} id="summary">
            {/* By method */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {(report.by_method ?? []).map(m => (
                <div key={m.method} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {METHOD_ICONS[m.method] ?? <BarChart2 size={16} />}
                    <span className="text-sm font-semibold text-gray-700 capitalize">{m.method}</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(m.total, currency)}</p>
                  <p className="text-xs text-gray-400">{m.count} payment{m.count !== 1 ? 's' : ''} · {formatCurrency(m.tips, currency)} tips</p>
                </div>
              ))}
              {!report.by_method?.length && (
                <div className="col-span-3 text-center py-8 text-gray-400">
                  <p className="text-sm">No completed payments in this period.</p>
                </div>
              )}
            </div>

            {/* Totals */}
            {report.totals && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <TrendingUp size={16} /> Totals
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Stat label="Payments" value={String(report.totals.payments)} />
                  <Stat label="Gross" value={formatCurrency(report.totals.gross, currency)} />
                  <Stat label="Net collected" value={formatCurrency(report.totals.gross - report.totals.refunds, currency)} />
                  <Stat label="Tips" value={formatCurrency(report.totals.tips, currency)} />
                  <Stat label="Refunds" value={formatCurrency(report.totals.refunds, currency)} red />
                  <Stat label="Failed" value={String(report.totals.failed_count)} muted />
                  <Stat label="Cancelled" value={String(report.totals.cancelled_count)} muted />
                </div>
              </div>
            )}

            {/* Alerts */}
            {(report.overrides?.length > 0 || report.unpaid_tabs?.length > 0) && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <p className="text-sm font-medium text-amber-800">Attention required</p>
                </div>
                {report.overrides?.length > 0 && (
                  <p className="text-xs text-amber-700">• {report.overrides.length} table{report.overrides.length !== 1 ? 's' : ''} closed with outstanding balance</p>
                )}
                {report.unpaid_tabs?.length > 0 && (
                  <p className="text-xs text-amber-700">• {report.unpaid_tabs.length} closed session{report.unpaid_tabs.length !== 1 ? 's' : ''} with unpaid items</p>
                )}
              </div>
            )}
          </TabPanel>

          {/* ── Voids ── */}
          <TabPanel active={tab} id="voids">
            <ReportTable
              headers={['Item', 'Amount', 'Reason', 'Note', 'By', 'Table', 'Order', 'Time']}
              rows={(report.voids ?? []).map(v => [
                v.item_name,
                formatCurrency(v.line_total, currency),
                v.void_reason.replace(/_/g, ' '),
                v.void_note ?? '—',
                v.voided_by_name,
                `T${v.table_number}`,
                v.order_number,
                formatDate(v.voided_at),
              ])}
              emptyText="No voided items in this period."
            />
          </TabPanel>

          {/* ── Comps ── */}
          <TabPanel active={tab} id="comps">
            <ReportTable
              headers={['Item', 'Amount', 'Reason', 'Note', 'By', 'Order', 'Time']}
              rows={(report.comps ?? []).map(c => [
                c.item_name,
                formatCurrency(c.line_total, currency),
                c.comp_reason.replace(/_/g, ' '),
                c.comp_note ?? '—',
                c.comped_by_name,
                c.order_number,
                formatDate(c.comped_at),
              ])}
              emptyText="No comped items in this period."
            />
          </TabPanel>

          {/* ── Overrides ── */}
          <TabPanel active={tab} id="overrides">
            <ReportTable
              headers={['Table', 'Outstanding', 'Reason', 'Note', 'Closed by', 'Time']}
              rows={(report.overrides ?? []).map(o => [
                `T${o.table_number}`,
                formatCurrency(o.outstanding, currency),
                o.reason.replace(/_/g, ' '),
                o.note ?? '—',
                o.closed_by_name,
                formatDate(o.created_at),
              ])}
              emptyText="No overridden closes in this period."
            />
          </TabPanel>

          {/* ── Unpaid tabs ── */}
          <TabPanel active={tab} id="unpaid">
            <ReportTable
              headers={['Table', 'Outstanding', 'Opened at', 'Closed at', 'Opened by']}
              rows={(report.unpaid_tabs ?? []).map(u => [
                `T${u.table_number}`,
                formatCurrency(u.outstanding, currency),
                formatDate(u.opened_at),
                formatDate(u.closed_at),
                u.opened_by_name,
              ])}
              emptyText="No unpaid tabs in this period."
            />
          </TabPanel>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, red, muted }: { label: string; value: string; red?: boolean; muted?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3">
      <p className={cn('text-lg font-bold', red ? 'text-red-600' : muted ? 'text-gray-400' : 'text-gray-900')}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

function ReportTable({ headers, rows, emptyText }: { headers: string[]; rows: string[][]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">{emptyText}</p>
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
      <table className="w-full text-sm min-w-[500px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {headers.map(h => <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i < rows.length - 1 ? 'border-b border-gray-50' : ''}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-gray-700 text-xs">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
