import { cn } from '../../lib/utils'
import rustoLogo from '../../../rusto_logo_transparent.png'

interface Props {
  className?: string
  imageClassName?: string
  alt?: string
}

export function BrandLogo({ className, imageClassName, alt = 'Rusto' }: Props) {
  return (
    <span className={cn('inline-flex items-center justify-center overflow-hidden', className)} aria-label={alt}>
      <img src={rustoLogo} alt={alt} className={cn('h-full w-auto object-contain', imageClassName)} />
    </span>
  )
}
