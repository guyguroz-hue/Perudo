import { createContext } from 'react'
import type { AuthApi } from './types'

export const AuthContext = createContext<AuthApi | null>(null)
