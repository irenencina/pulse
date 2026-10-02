import { useCallback, useState } from 'react'

/** Runs an action and keeps the last error message to show next to the form. */
export function useErrorMessage() {
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async (action: () => Promise<unknown>) => {
    try {
      setError(null)
      await action()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    }
  }, [])
  return { error, run, clear: () => setError(null) }
}
