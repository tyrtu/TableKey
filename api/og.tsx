// Vercel Edge Function — generates OG image as PNG
// Served at: https://table-key.vercel.app/api/og
// Uses @vercel/og which is built into the Vercel Edge runtime (no install needed)
import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

export default function handler() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: '#171614',
          position: 'relative',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* Logo card */}
        <div
          style={{
            position: 'absolute',
            top: 72,
            left: 80,
            background: '#ffffff',
            borderRadius: 20,
            padding: '18px 36px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 38, fontWeight: 800, color: '#171614', letterSpacing: '-1px' }}>
            TableKey
          </span>
          <span style={{ fontSize: 12, color: '#9ca3af', letterSpacing: '3px', marginTop: 4 }}>
            RESTAURANT ORDERING
          </span>
        </div>

        {/* Main headline */}
        <div
          style={{
            position: 'absolute',
            top: 240,
            left: 80,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span style={{ fontSize: 80, fontWeight: 800, color: '#ffffff', letterSpacing: '-2px', lineHeight: 1 }}>
            Scan. Order.
          </span>
          <span style={{ fontSize: 80, fontWeight: 800, color: '#e05c27', letterSpacing: '-2px', lineHeight: 1, marginTop: 8 }}>
            Enjoy.
          </span>
        </div>

        {/* Subtext */}
        <div
          style={{
            position: 'absolute',
            top: 448,
            left: 80,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 26, color: 'rgba(255,255,255,0.5)' }}>QR-code ordering for restaurants.</span>
          <span style={{ fontSize: 26, color: 'rgba(255,255,255,0.5)' }}>No app. No account. Just scan.</span>
        </div>

        {/* Feature pills */}
        {[
          { label: 'Customer Ordering', accent: true },
          { label: 'Kitchen Display', accent: false },
          { label: 'Waiter Panel', accent: false },
          { label: 'Admin Analytics', accent: false },
        ].map((pill, i) => (
          <div
            key={pill.label}
            style={{
              position: 'absolute',
              top: 210 + i * 72,
              left: 720,
              width: 240,
              height: 52,
              borderRadius: 26,
              border: `1.5px solid ${pill.accent ? '#e05c27' : 'rgba(255,255,255,0.18)'}`,
              background: pill.accent ? 'rgba(224,92,39,0.15)' : 'rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontSize: 19,
                fontWeight: pill.accent ? 700 : 600,
                color: pill.accent ? '#e05c27' : 'rgba(255,255,255,0.75)',
              }}
            >
              {pill.label}
            </span>
          </div>
        ))}

        {/* Domain */}
        <span
          style={{
            position: 'absolute',
            bottom: 36,
            left: 80,
            fontSize: 20,
            color: 'rgba(255,255,255,0.28)',
            letterSpacing: '1px',
          }}
        >
          table-key.vercel.app
        </span>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
