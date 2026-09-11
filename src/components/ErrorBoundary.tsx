import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import './ErrorBoundary.css'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last line of defence against a blank screen.
 *
 * A React error during render would otherwise unmount the whole tree and leave
 * the page empty, which tells a player nothing and tells us less. This cannot
 * catch failures that happen while modules are still loading — those have to be
 * prevented at the source rather than caught.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children

    return (
      <div className="crash" role="alert">
        <h1 className="crash__title">Something broke</h1>
        <p>The game hit an error it could not recover from.</p>
        <pre className="crash__detail">{error.message}</pre>
        <button className="crash__button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
