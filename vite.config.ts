import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Component tests need a DOM; the engine tests do not care either way.
    // `environmentMatchGlobs` is gone in Vitest 5, so this is set per-file with
    // a `@vitest-environment` docblock instead, keeping the pure tests fast.
    environment: 'node',
    globals: false,
  },
})
