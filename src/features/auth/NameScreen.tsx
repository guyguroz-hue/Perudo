import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Die } from '../../components/Die'
import { DISPLAY_NAME_MAX } from './displayName'
import { useAuth } from './useAuth'
import './NameScreen.css'

/**
 * First screen a new player sees. One question, one answer.
 *
 * There is no password, no email and no account — the session already exists by
 * the time this renders. All that is missing is what to call them at the table.
 */
export function NameScreen() {
  const { claimName } = useAuth()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const result = await claimName(name)
    if (!result.ok) {
      setError(result.message)
      setBusy(false)
    }
    // On success the provider swaps this screen out, so there is nothing to
    // reset — clearing `busy` here would only flash the button back to life.
  }

  return (
    <form className="name" onSubmit={onSubmit}>
      <div className="name__dice" aria-hidden="true">
        <Die face={1} size={40} />
        <Die face={5} size={40} />
        <Die hidden size={40} />
      </div>

      <h1 className="name__title">Perudo</h1>
      <p className="name__blurb">Dice, nerve, and the occasional outright lie.</p>

      <label className="name__label" htmlFor="display-name">
        What should we call you?
      </label>
      <input
        id="display-name"
        className="name__input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={DISPLAY_NAME_MAX}
        autoComplete="nickname"
        autoFocus
        enterKeyHint="go"
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : 'display-name-error'}
      />

      {error !== null && (
        <p className="name__error" id="display-name-error" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" busy={busy}>
        {busy ? 'Taking your seat…' : 'Take a seat'}
      </Button>
    </form>
  )
}
