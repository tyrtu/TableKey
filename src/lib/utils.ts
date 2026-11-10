import { clsx, type ClassValue } from 'clsx'
import { formatDistanceToNow, format } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export function formatTime(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm')
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), 'MMM d, yyyy')
}

export function timeAgo(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
}

export function elapsedMinutes(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

export function elapsedLabel(dateStr: string): string {
  const mins = elapsedMinutes(dateStr)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m ago`
}

export function orderStatusLabel(status: string): string {
  switch (status) {
    case 'new': return 'New'
    case 'preparing': return 'Preparing'
    case 'ready': return 'Ready'
    case 'served': return 'Served'
    case 'cancelled': return 'Cancelled'
    default: return status
  }
}

export function tableStatusLabel(status: string): string {
  switch (status) {
    case 'idle': return 'Available'
    case 'requested': return 'Requested'
    case 'active': return 'Active'
    case 'awaiting_payment': return 'Awaiting Payment'
    case 'closed': return 'Closed'
    default: return status
  }
}

export function tableStatusColor(status: string): string {
  switch (status) {
    case 'idle': return 'bg-emerald-100 text-emerald-800'
    case 'requested': return 'bg-yellow-100 text-yellow-800'
    case 'active': return 'bg-blue-100 text-blue-800'
    case 'awaiting_payment': return 'bg-purple-100 text-purple-800'
    case 'closed': return 'bg-gray-100 text-gray-500'
    default: return 'bg-gray-100 text-gray-600'
  }
}

export function orderStatusColor(status: string): string {
  switch (status) {
    case 'new': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    case 'preparing': return 'bg-blue-100 text-blue-800 border-blue-300'
    case 'ready': return 'bg-emerald-100 text-emerald-800 border-emerald-300'
    case 'served': return 'bg-gray-100 text-gray-600 border-gray-300'
    case 'cancelled': return 'bg-red-100 text-red-700 border-red-300'
    default: return 'bg-gray-100 text-gray-600 border-gray-300'
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function generateQrUrl(appUrl: string, qrToken: string): string {
  return `${appUrl}/t/${qrToken}`
}
