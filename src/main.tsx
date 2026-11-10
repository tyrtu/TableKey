import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { AlertTriangle } from 'lucide-react'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// Sentry is only active when VITE_SENTRY_DSN is set.
// In development (no DSN) it silently no-ops.
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,          // 'development' | 'production'
    release: import.meta.env.VITE_APP_VERSION,  // optional — set in CI

    // Capture 100% of errors, 10% of performance traces (adjust after baseline)
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Ignore noise from browser extensions and network flakes
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection',
      'AbortError',
      'NetworkError',
      'Failed to fetch',
      'Load failed',
    ],

    beforeSend(event) {
      // Strip any PII from breadcrumbs and request bodies before sending
      if (event.request?.data) delete event.request.data
      return event
    },
  })
}

// Always use the local boundary; Sentry additionally reports errors when configured.
const SentryApp = dsn
  ? Sentry.withErrorBoundary(App, {
      fallback: ({ error, resetError }) => (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-50 text-center">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-sm border border-gray-100">
            <AlertTriangle size={48} className="mx-auto mb-4 text-amber-500" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-500 mb-6">
              {error instanceof Error ? error.message : 'An unexpected error occurred.'}
            </p>
            <p className="text-xs text-gray-400 mb-6">
              This error has been reported automatically. Try refreshing the page.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={resetError}
                className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Reload page
              </button>
            </div>
          </div>
        </div>
      ),
    })
  : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SentryApp />
    </ErrorBoundary>
  </React.StrictMode>
)
