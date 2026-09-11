import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

type Status = 'checking' | 'connected' | 'error'

export function SupabaseStatus() {
  const [status, setStatus] = useState<Status>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (cancelled) return
        if (error) {
          setStatus('error')
          setMessage(error.message)
        } else {
          setStatus('connected')
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus('error')
        setMessage(err instanceof Error ? err.message : String(err))
      })

    return () => {
      cancelled = true
    }
  }, [])

  const label =
    status === 'checking'
      ? 'בודק חיבור ל-Supabase…'
      : status === 'connected'
        ? '✅ מחובר ל-Supabase'
        : `❌ שגיאת חיבור: ${message}`

  return (
    <p style={{ fontSize: '0.9rem', opacity: 0.8 }} data-status={status}>
      {label}
    </p>
  )
}
