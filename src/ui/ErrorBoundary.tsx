import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Reloads the page; replaceable so tests don't have to. */
  onReload?: () => void
}

/**
 * Catches an error nobody expected, so the person sees what happened and a way forward instead of a
 * blank white page. Everything is stored on the device, so reloading loses nothing.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The app stopped:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-lg text-ink-2">Your data is safe on this device. Reload the app to carry on. If this keeps happening, restore a backup from Settings after reloading.</p>
        <button
          type="button"
          onClick={this.props.onReload ?? (() => location.reload())}
          className="min-h-12 self-start rounded-full bg-btn px-6 font-semibold text-btn-ink"
        >
          Reload the app
        </button>
      </div>
    )
  }
}
