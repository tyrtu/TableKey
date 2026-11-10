import { useState, useEffect, useRef } from 'react'
import { Plus, QrCode, Download, Trash2, Printer } from 'lucide-react'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { getTablesByVenue, createTable, deleteTable } from '../../lib/api'
import { generateQrUrl } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { TableStatusBadge } from '../../components/ui/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import type { RestaurantTable } from '../../types/database'

interface Props { venueId: string }

const APP_URL = import.meta.env.VITE_APP_URL ?? window.location.origin

export default function TablesManagement({ venueId }: Props) {
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState(false)
  const [qrModal, setQrModal] = useState<RestaurantTable | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<RestaurantTable | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Add form
  const [tableNumber, setTableNumber] = useState('')
  const [label, setLabel] = useState('')
  const [capacity, setCapacity] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    const data = await getTablesByVenue(venueId)
    setTables(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [venueId])

  const handleAdd = async () => {
    if (!tableNumber.trim()) return
    setAdding(true)
    try {
      const t = await createTable(venueId, tableNumber.trim(), label.trim(), capacity ? parseInt(capacity) : null)
      setTables((prev) => [...prev, t])
      setAddModal(false)
      setTableNumber(''); setLabel(''); setCapacity('')
      toast.success(`Table ${tableNumber} created.`)
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message.includes('unique') ? 'A table with that number already exists.' : 'Failed to create table.'
      toast.error(msg)
    } finally { setAdding(false) }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deleteTable(deleteConfirm.id)
      setTables((prev) => prev.filter((t) => t.id !== deleteConfirm.id))
      toast.success(`Table ${deleteConfirm.table_number} deleted.`)
    } catch { toast.error('Failed to delete table.') }
    finally { setDeleting(false); setDeleteConfirm(null) }
  }

  const handleDownloadQR = async (table: RestaurantTable) => {
    const url = generateQrUrl(APP_URL, table.qr_token)
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#1f2937' } })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `table-${table.table_number}-qr.png`
      a.click()
    } catch { toast.error('Failed to generate QR.') }
  }

  const handlePrintSingle = async (table: RestaurantTable) => {
    const url = generateQrUrl(APP_URL, table.qr_token)
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2, color: { dark: '#1f2937' } })
    printWindow.document.write(`
      <html><head><title>Table ${table.table_number} QR</title>
      <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: white; }
        .card { border: 2px solid #e5e7eb; border-radius: 16px; padding: 32px; text-align: center; }
        .card img { width: 240px; height: 240px; }
        .card h2 { font-size: 24px; font-weight: bold; margin: 12px 0 4px; }
        .card p { font-size: 13px; color: #6b7280; margin: 0; }
        @media print { body { padding: 0; } }
      </style></head><body>
        <div class="card">
          <img src="${dataUrl}" alt="QR for table ${table.table_number}" />
          <h2>Table ${table.table_number}</h2>
          ${table.label ? `<p>${table.label}</p>` : ''}
          ${table.capacity ? `<p>Up to ${table.capacity} guests</p>` : ''}
        </div>
      </body></html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const handlePrintAll = async () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    const qrDataUrls: { table: RestaurantTable; dataUrl: string }[] = []
    for (const table of tables) {
      const url = generateQrUrl(APP_URL, table.qr_token)
      const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 })
      qrDataUrls.push({ table, dataUrl })
    }
    printWindow.document.write(`
      <html><head><title>TableKey QR Codes</title>
      <style>
        body { font-family: sans-serif; background: white; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 24px; }
        .card { border: 2px solid #e5e7eb; border-radius: 12px; padding: 16px; text-align: center; page-break-inside: avoid; }
        .card img { width: 100%; max-width: 200px; }
        .card h2 { font-size: 18px; font-weight: bold; margin: 8px 0 4px; }
        .card p { font-size: 12px; color: #6b7280; margin: 0; }
        @media print { .grid { gap: 12px; } }
      </style></head><body>
      <div class="grid">
        ${qrDataUrls.map(({ table, dataUrl }) => `
          <div class="card">
            <img src="${dataUrl}" alt="QR for table ${table.table_number}" />
            <h2>Table ${table.table_number}</h2>
            ${table.label ? `<p>${table.label}</p>` : ''}
          </div>
        `).join('')}
      </div>
      </body></html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tables</h2>
          <p className="text-sm text-gray-500">{tables.length} table{tables.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          {tables.length > 0 && (
            <Button variant="secondary" onClick={handlePrintAll}>
              <Printer size={15} /> Print All QRs
            </Button>
          )}
          <Button onClick={() => setAddModal(true)}>
            <Plus size={16} /> Add Table
          </Button>
        </div>
      </div>

      {tables.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <QrCode size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No tables yet. Create one to generate a QR code.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tables.map((table) => (
          <div key={table.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-bold text-gray-900 text-lg">Table {table.table_number}</p>
                {table.label && <p className="text-xs text-gray-500">{table.label}</p>}
              </div>
              <TableStatusBadge status={table.status} />
            </div>
            {table.capacity && (
              <p className="text-xs text-gray-400 mb-3">Capacity: {table.capacity}</p>
            )}
            <p className="text-xs text-gray-400 mb-3 font-mono break-all">
              {generateQrUrl(APP_URL, table.qr_token).replace(APP_URL, '')}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" fullWidth onClick={() => setQrModal(table)}>
                <QrCode size={13} /> QR Code
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleDownloadQR(table)} aria-label="Download QR">
                <Download size={13} />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handlePrintSingle(table)} aria-label="Print QR">
                <Printer size={13} />
              </Button>
              <button
                onClick={() => setDeleteConfirm(table)}
                className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors border border-gray-200"
                aria-label="Delete table"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add table modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Table" size="sm">
        <div className="space-y-4">
          <Input label="Table Number *" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="e.g. 7" autoFocus />
          <Input label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Patio, Window Seat" />
          <Input label="Capacity (optional)" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 4" />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button onClick={handleAdd} loading={adding} disabled={!tableNumber.trim()}>Create Table</Button>
          </div>
        </div>
      </Modal>

      {/* QR preview modal */}
      {qrModal && (
        <QrPreviewModal
          table={qrModal}
          onClose={() => setQrModal(null)}
          onDownload={() => handleDownloadQR(qrModal)}
        />
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Delete table?"
        message={`Table ${deleteConfirm?.table_number} and its QR code will be permanently removed.`}
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  )
}

function QrPreviewModal({ table, onClose, onDownload }: {
  table: RestaurantTable
  onClose: () => void
  onDownload: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const url = generateQrUrl(APP_URL, table.qr_token)

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 240, margin: 2, color: { dark: '#1f2937' } })
    }
  }, [url])

  return (
    <Modal open onClose={onClose} title={`Table ${table.table_number} — QR Code`} size="sm">
      <div className="flex flex-col items-center gap-4">
        <canvas ref={canvasRef} className="rounded-xl border border-gray-200" />
        <p className="text-xs text-gray-400 text-center break-all">{url}</p>
        <p className="text-xs text-gray-500 text-center">
          Customers scan this to open the menu for Table {table.table_number}.
        </p>
        <Button fullWidth onClick={onDownload}>
          <Download size={15} /> Download PNG
        </Button>
      </div>
    </Modal>
  )
}
