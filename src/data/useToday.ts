import { useEffect, useState } from 'react'

/** Today's date, refreshed when the app returns to the foreground (e.g. the next morning). */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      setToday((prev) => {
        const now = new Date()
        return now.toDateString() === prev.toDateString() ? prev : now
      })
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
