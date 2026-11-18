import { useState, useEffect } from 'react'
import { ArrowRight, Bell } from 'lucide-react'
import { VenueLogo } from '../../components/ui/VenueLogo'
import { formatCurrency } from '../../lib/utils'
import { getMenu } from '../../lib/api'
import type { RestaurantTable, Venue, MenuItem } from '../../types/database'

// ── Logic preserved ───────────────────────────────────────────
// Props: table (RestaurantTable), venue (Venue), onContinue (() => void)
// No new state libraries, routes, or dependencies.

interface Props {
  table: RestaurantTable
  venue: Venue
  onContinue: () => void
}

// ── Plate illustration ────────────────────────────────────────
function PlateIllustration({ imageUrl }: { imageUrl?: string | null }) {
  return (
    <div
      style={{
        position: 'relative',
        width: 116,
        height: 116,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Shadow ellipse */}
      <div
        style={{
          position: 'absolute',
          bottom: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 108,
          height: 14,
          borderRadius: '50%',
          background: '#C9B79F',
          opacity: 0.45,
          filter: 'blur(4px)',
        }}
      />
      {/* Plate */}
      <div
        style={{
          width: 116,
          height: 116,
          borderRadius: '50%',
          background: '#ffffff',
          border: '1.2px solid #F1E2D2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          zIndex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Inner ring */}
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            border: '1px solid #F3E6D8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Today's dish"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '50%',
              }}
            />
          ) : (
            /* Food blobs fallback */
            <svg width="62" height="62" viewBox="0 0 62 62" fill="none">
              <circle cx="22" cy="28" r="12" fill="#B5482A" />
              <circle cx="38" cy="24" r="10" fill="#7A9B3A" />
              <circle cx="34" cy="38" r="10" fill="#D9822B" />
              <circle cx="20" cy="40" r="8" fill="#8E3320" />
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Steam wisps ───────────────────────────────────────────────
function Steam() {
  return (
    <svg
      aria-hidden="true"
      width="80"
      height="52"
      viewBox="0 0 80 52"
      fill="none"
      style={{ display: 'block' }}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .steam-wisp { animation: steamFloat 3s ease-in-out infinite; }
          .steam-wisp:nth-child(2) { animation-delay: 1s; }
          .steam-wisp:nth-child(3) { animation-delay: 2s; }
        }
        @keyframes steamFloat {
          0%, 100% { transform: translateY(0) scaleX(1); opacity: 0.6; }
          50% { transform: translateY(-6px) scaleX(0.85); opacity: 0.3; }
        }
      `}</style>
      <path className="steam-wisp" d="M20 48 Q16 36 22 28 Q28 20 24 10"
        stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.6" />
      <path className="steam-wisp" d="M40 50 Q36 37 42 29 Q48 21 43 10"
        stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.6" />
      <path className="steam-wisp" d="M60 48 Q57 36 62 28 Q67 20 63 10"
        stroke="white" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.6" />
    </svg>
  )
}

export function GreetingView({ table, venue, onContinue }: Props) {
  const [specials, setSpecials] = useState<MenuItem[]>([])
  const [specialsLoaded, setSpecialsLoaded] = useState(false)
  const [plateImage, setPlateImage] = useState<string | null>(null)

  // Load specials — Specials category, available items only, max 6
  useEffect(() => {
    getMenu(venue.id)
      .then(data => {
        const specialsCat = data.categories.find(c =>
          c.name.toLowerCase().includes('special')
        )
        if (specialsCat) {
          const items = data.items
            .filter(i => i.category_id === specialsCat.id && i.available)
            .slice(0, 6)
          setSpecials(items)
        }
        // Pick a random item with an image from the whole menu for the plate
        const withImages = data.items.filter(i => i.image_url && i.available)
        if (withImages.length > 0) {
          const random = withImages[Math.floor(Math.random() * withImages.length)]
          setPlateImage(random.image_url!)
        }
      })
      .catch(() => { /* silently fail */ })
      .finally(() => setSpecialsLoaded(true))
  }, [venue.id])

  return (
    <div
      style={{
        background: '#FFFAF5',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 480,
        margin: '0 auto',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* ── Dot texture background ─────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          backgroundImage: 'radial-gradient(#E8D9C8 1.2px, transparent 1.2px)',
          backgroundSize: '24px 24px',
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, paddingBottom: 112 }}>

        {/* ── HERO ────────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 300,
            background: 'linear-gradient(135deg, #F0651A, #DB4F0A)',
            flexShrink: 0,
          }}
        >
          {/* Curved bottom edge */}
          <svg
            aria-hidden="true"
            viewBox="0 0 480 46"
            preserveAspectRatio="none"
            style={{ position: 'absolute', bottom: -1, left: 0, width: '100%', height: 46 }}
          >
            <path d="M0,0 Q240,46 480,0 L480,46 L0,46 Z" fill="#FFFAF5" />
          </svg>

          {/* Concentric circles — top-left */}
          <svg aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            width="160" height="160" viewBox="0 0 160 160" fill="none">
            {[46, 80, 114, 148].map(r => (
              <circle key={r} cx="0" cy="0" r={r} stroke="white" strokeWidth="1.5" opacity="0.09" />
            ))}
          </svg>

          {/* Concentric circles — right edge */}
          <svg aria-hidden="true" style={{ position: 'absolute', top: 60, right: 0, pointerEvents: 'none' }}
            width="100" height="200" viewBox="0 0 100 200" fill="none">
            {[34, 64, 94].map(r => (
              <circle key={r} cx="100" cy="100" r={r} stroke="white" strokeWidth="1.5" opacity="0.08" />
            ))}
          </svg>

          {/* Fork — left */}
          <svg aria-hidden="true" style={{ position: 'absolute', left: 18, bottom: 60, pointerEvents: 'none', opacity: 0.18 }}
            width="20" height="80" viewBox="0 0 20 80" fill="none">
            <line x1="4" y1="0" x2="4" y2="30" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="10" y1="0" x2="10" y2="30" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="16" y1="0" x2="16" y2="30" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M4 30 Q10 38 16 30" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <line x1="10" y1="38" x2="10" y2="80" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>

          {/* Knife — right */}
          <svg aria-hidden="true" style={{ position: 'absolute', right: 18, bottom: 60, pointerEvents: 'none', opacity: 0.18 }}
            width="16" height="80" viewBox="0 0 16 80" fill="none">
            <path d="M8 0 L12 0 Q16 10 12 28 L4 28 Q0 10 4 0 Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            <line x1="8" y1="28" x2="8" y2="80" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>

          {/* Logo badge */}
          <div style={{
            position: 'absolute',
            top: 56,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 200,
            height: 72,
            background: '#ffffff',
            borderRadius: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            padding: '6px 10px',
          }}>
            <VenueLogo
              venue={venue}
              wrapClass="flex items-center justify-center h-16 w-[170px]"
              imgClass="h-14 w-auto object-contain"
              textClass="text-2xl font-black text-gray-900 tracking-tight"
            />
          </div>

          {/* Table chip */}
          <div style={{
            position: 'absolute',
            top: 56 + 72 + 24,
            left: '50%',
            transform: 'translateX(-50%)',
            height: 28,
            padding: '2px 16px',
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.45)',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFE066', flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#ffffff' }}>
              Table {table.table_number}{table.label ? ` · ${table.label}` : ''}
            </span>
          </div>

          {/* Steam + plate centered at bottom */}
          <div style={{
            position: 'absolute',
            bottom: -30,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
            zIndex: 2,
          }}>
            <Steam />
            <PlateIllustration imageUrl={plateImage} />
          </div>
        </div>

        {/* ── HEADING ─────────────────────────────────────── */}
        <div style={{ textAlign: 'center', paddingTop: 54, paddingLeft: 24, paddingRight: 24 }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, color: '#1C1917', margin: 0, lineHeight: 1.2 }}>
            Welcome to {venue.name}
          </h1>
          <p style={{ fontSize: 14, color: '#78716C', margin: '6px 0 0', lineHeight: 1.5 }}>
            Order from your table — no app, no queue.
          </p>
        </div>

        {/* ── STEPS CARD ──────────────────────────────────── */}
        <div style={{
          margin: '20px 20px 0',
          background: '#ffffff',
          borderRadius: 22,
          padding: 20,
          border: '1px solid #F0E5D8',
          boxShadow: '0 3px 0 rgba(234,223,211,0.6)',
        }}>
          {[
            { n: '1', title: 'Browse the menu', desc: 'Take your time, at your own pace' },
            { n: '2', title: 'Add to your cart', desc: 'Pick what you\'d like to eat' },
            { n: '3', title: 'Request to order', desc: 'A waiter verifies your group and opens your session' },
          ].map((step, idx, arr) => (
            <div key={step.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', position: 'relative' }}>
              {/* Dotted connector between circles */}
              {idx < arr.length - 1 && (
                <div style={{
                  position: 'absolute',
                  left: 13,
                  top: 32,
                  width: 2,
                  height: 32,
                  borderLeft: '2px dotted #F3B98E',
                  zIndex: 0,
                }} />
              )}
              {/* Step circle */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#E8590C',
                color: '#ffffff',
                fontSize: 13.5,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                position: 'relative',
                zIndex: 1,
              }}>
                {step.n}
              </div>
              {/* Text */}
              <div style={{ paddingBottom: idx < arr.length - 1 ? 22 : 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1C1917', lineHeight: 1.3 }}>
                  {step.title}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#78716C', lineHeight: 1.4 }}>
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── TODAY'S SPECIALS ─────────────────────────────── */}
        {/* Reserve height while loading to prevent layout shift */}
        {(!specialsLoaded || specials.length > 0) && (
          <div style={{ marginTop: 24, marginBottom: 24 }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: 20,
              paddingRight: 20,
              marginBottom: 12,
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1C1917' }}>Today's specials</span>
              <button
                onClick={onContinue}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#C2410C',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 0',
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                }}
                aria-label="See all specials"
              >
                See all ›
              </button>
            </div>

            {/* Scroll list */}
            <div style={{
              display: 'flex',
              gap: 12,
              overflowX: 'auto',
              scrollSnapType: 'x mandatory',
              paddingLeft: 20,
              paddingRight: 20,
              paddingBottom: 4,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}>
              {!specialsLoaded ? (
                // Skeleton
                Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 160,
                      height: 92,
                      borderRadius: 18,
                      background: '#F5EDE4',
                      flexShrink: 0,
                      scrollSnapAlign: 'start',
                    }}
                  />
                ))
              ) : (
                specials.map(item => (
                  <button
                    key={item.id}
                    onClick={onContinue}
                    style={{
                      width: 160,
                      height: 92,
                      borderRadius: 18,
                      background: '#ffffff',
                      border: '1px solid #F0E5D8',
                      boxShadow: '0 3px 0 rgba(234,223,211,0.6)',
                      flexShrink: 0,
                      scrollSnapAlign: 'start',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0 12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {/* Thumbnail */}
                    <div style={{
                      width: 60,
                      height: 60,
                      borderRadius: 14,
                      background: '#FBEBDD',
                      flexShrink: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <svg width="32" height="32" viewBox="0 0 62 62" fill="none">
                          <circle cx="22" cy="28" r="12" fill="#B5482A" />
                          <circle cx="38" cy="24" r="10" fill="#7A9B3A" />
                          <circle cx="34" cy="38" r="10" fill="#D9822B" />
                        </svg>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: 0,
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#1C1917',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {item.name}
                      </p>
                      <p style={{
                        margin: '4px 0 0',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#C2410C',
                      }}>
                        {formatCurrency(item.price, venue.currency)}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── STICKY BOTTOM CTA ───────────────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        zIndex: 20,
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 24,
        background: 'linear-gradient(to top, #FFFAF5 70%, transparent)',
      }}>
        <button
          onClick={onContinue}
          style={{
            width: '100%',
            height: 56,
            borderRadius: 28,
            background: '#E8590C',
            border: 'none',
            color: '#ffffff',
            fontSize: 16.5,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
            transition: 'transform 0.1s',
            boxShadow: '0 4px 16px rgba(232,89,12,0.35)',
          }}
          onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.98)')}
          onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          aria-label="Browse menu"
        >
          Browse menu
          <ArrowRight size={20} />
        </button>
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button
            onClick={onContinue}
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: '#78716C',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              minHeight: 44,
            }}
            aria-label="Call a waiter for help"
          >
            <Bell size={13} />
            Need help? Call a waiter
          </button>
        </div>
      </div>
    </div>
  )
}
