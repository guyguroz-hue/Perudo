import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthProvider'
import { NameScreen } from './features/auth/NameScreen'
import { useAuth } from './features/auth/useAuth'
import { HomeScreen } from './features/rooms/HomeScreen'
import { JoinScreen } from './features/rooms/JoinScreen'
import { LobbyScreen } from './features/rooms/LobbyScreen'
import { Button } from './components/Button'
import { Die } from './components/Die'
import { supabaseUrl } from './lib/supabaseClient'
import './App.css'
import './features/rooms/LobbyScreen.css'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <main className="app">
          <Gate />
        </main>
      </AuthProvider>
    </BrowserRouter>
  )
}

/**
 * Identity comes before any room.
 *
 * The URL is left alone while a player picks a name, so an invite link survives
 * the detour: name yourself, and the join carries on to the room you were sent.
 */
function Gate() {
  const { state, retry } = useAuth()

  switch (state.status) {
    case 'connecting':
      return <Connecting />
    case 'error':
      return <Failed message={state.message} detail={state.detail} onRetry={retry} />
    case 'unnamed':
      return <NameScreen />
    case 'ready':
      return (
        <Routes>
          <Route path="/" element={<HomeScreen name={state.profile.display_name} />} />
          <Route path="/join/:code" element={<JoinScreen />} />
          <Route path="/room/:roomId" element={<LobbyScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )
  }
}

/** A deliberate loading state rather than a blank screen. */
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
      <p className="app__detail">
        Built against: <code>{supabaseUrl ?? 'nothing — no URL in this build'}</code>
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  )
}
