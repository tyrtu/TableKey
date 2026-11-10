import { Badge } from './Badge'
import { tableStatusColor, orderStatusColor, orderStatusLabel, tableStatusLabel } from '../../lib/utils'
import { cn } from '../../lib/utils'

interface OrderStatusBadgeProps {
  status: string
  className?: string
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const colorClass = orderStatusColor(status)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        colorClass,
        className
      )}
    >
      {orderStatusLabel(status)}
    </span>
  )
}

export function TableStatusBadge({ status, className }: { status: string; className?: string }) {
  const colorClass = tableStatusColor(status)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colorClass,
        className
      )}
    >
      {tableStatusLabel(status)}
    </span>
  )
}

export { Badge }
