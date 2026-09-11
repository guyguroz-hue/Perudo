import { AuthProvider } from './features/auth/AuthProvider'
import { NameScreen } from './features/auth/NameScreen'
import { useAuth } from './features/auth/useAuth'
import { Button } from './components/Button'
import { Die } from './components/Die'
import './App.css'

export default function App() {
  return (
    <AuthProvider>
      <main className="app">
        <CurrentScreen />
      </main>
    </AuthProvider>
  )
}

function CurrentScreen() {
  const { state, retry } = useAuth()

  switch (state.status) {
    case 'connecting':
      return <Connecting />
    case 'error':
      return <Failed message={state.message} detail={state.detail} onRetry={retry} />
    case 'unnamed':
      return <NameScreen />
    case 'ready':
      return <Seated name={state.profile.display_name} />
  }
}

/** A deliberate loading state rather than a blank screen (PART 55). */
function Connecting() {
  return (
    <div className="app__status">
      <div className="app__rolling" aria-hidden="true">
        <Die face={3} size={36} />
        <Die face={6} size={36} />
      </div>
      <p>Finding you a seat…</p>
    </div>
  )
}

function Failed({
  message,
  detail,
  onRetry,
}: {
  message: string
  detail: string | null
  onRetry: () => void
}) {
  return (
    <div className="app__status" role="alert">
      <h2>That did not work</h2>
      <p>{message}</p>
      {detail !== null && <p className="app__detail">{detail}</p>}
      <Button onClick={onRetry}>Try again</Button>
    </div>
  )
}

/**
 * Placeholder for the lobby.
 *
 * TEMPORARY (TODO T-15/T-10b): creating and joining rooms needs the server
 * action layer, which needs the round and dice schema, which is waiting on the
 * unresolved rules. This screen exists so the identity flow has somewhere to
 * land — it is not the lobby.
 */
function Seated({ name }: { name: string }) {
  return (
    <div className="app__status">
      <div className="app__rolling" aria-hidden="true">
        <Die face={1} size={36} />
        <Die face={4} size={36} />
        <Die hidden size={36} />
      </div>
      <h2>Welcome, {name}</h2>
      <p className="app__detail">
        Your seat is saved. Rooms and play arrive with the next phase.
      </p>
    </div>
  )
}
