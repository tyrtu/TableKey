import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type Variant = 'gray' | 'yellow' | 'green' | 'blue' | 'red' | 'purple' | 'orange'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
  dot?: boolean
}

const variantClasses: Record<Variant, string> = {
  gray:   'bg-gray-100 text-gray-700',
  yellow: 'bg-yellow-100 text-yellow-800',
  green:  'bg-emerald-100 text-emerald-800',
  blue:   'bg-blue-100 text-blue-800',
  red:    'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-800',
  orange: 'bg-orange-100 text-orange-800',
}

const dotClasses: Record<Variant, string> = {
  gray:   'bg-gray-500',
  yellow: 'bg-yellow-500',
  green:  'bg-emerald-500',
  blue:   'bg-blue-500',
  red:    'bg-red-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
}

export function Badge({ variant = 'gray', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotClasses[variant])} />}
      {children}
    </span>
  )
}
