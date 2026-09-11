/**
 * Pure house-rule Perudo engine.
 *
 * No React, no Supabase, no randomness, no clock. Everything here is a function
 * of its inputs, so it can be exercised exhaustively in tests and reused
 * verbatim by the authoritative Edge Function and by the UI.
 */
export * from './types'
export * from './errors'
export * from './counting'
export * from './bids'
export * from './resolution'
