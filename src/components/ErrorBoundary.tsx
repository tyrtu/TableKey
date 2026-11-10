import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { captureError } from '../lib/monitoring'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    captureError(error, { context: 'react-render', componentStack: errorInfo.componentStack })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="w-full max-w-sm rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
          <AlertTriangle size={48} className="mx-auto mb-4 text-amber-500" />
          <h1 className="mb-2 text-xl font-bold text-gray-900">Something went wrong</h1>
          <p className="mb-6 text-sm text-gray-500">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
