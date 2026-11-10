/**
 * VenueLogo — renders the venue's logo if one is available,
 * otherwise falls back to the venue name as text.
 *
 * Currently supports Rusto by checking venue.name.
 * To add more venues: extend the LOGO_MAP below with
 * { 'venue name lowercase': { src, alt, className } }.
 */
import { cn } from '../../lib/utils'
import rustoLogo from '../../../rusto_logo_transparent.png'
import type { Venue } from '../../types/database'

interface LogoEntry {
  src: string
  alt: string
  /** Tailwind classes applied to the <img> */
  imgClass?: string
  /** Tailwind classes applied to the wrapper <span> */
  wrapClass?: string
}

const LOGO_MAP: Record<string, LogoEntry> = {
  rusto: {
    src: rustoLogo,
    alt: 'Rusto',
    imgClass: 'h-[4.75rem] w-auto max-w-none -translate-x-2 -translate-y-1 object-contain',
    wrapClass: 'block h-14 w-[9.5rem] overflow-hidden',
  },
}

interface Props {
  venue: Venue
  /** Extra classes on the fallback text */
  textClass?: string
  /** Override img class */
  imgClass?: string
  /** Override wrapper class */
  wrapClass?: string
}

export function VenueLogo({ venue, textClass, imgClass, wrapClass }: Props) {
  const key = venue.name.trim().toLowerCase()
  const entry = LOGO_MAP[key]

  if (entry) {
    return (
      <span className={wrapClass ?? entry.wrapClass} aria-label={entry.alt}>
        <img
          src={entry.src}
          alt={entry.alt}
          className={imgClass ?? entry.imgClass}
        />
      </span>
    )
  }

  return (
    <span className={cn('text-xl font-bold tracking-tight text-gray-900', textClass)}>
      {venue.name}
    </span>
  )
}
