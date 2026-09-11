import { useContext } from 'react'
import { AuthContext } from './AuthContext'
import type { AuthApi } from './types'

export function useAuth(): AuthApi {
  const api = useContext(AuthContext)
  if (api === null) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return api
}
