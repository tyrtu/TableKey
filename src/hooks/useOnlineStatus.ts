import { useEffect, useState } from 'react'

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(isBrowserOnline)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    let restoredTimer: ReturnType<typeof setTimeout> | undefined

    const handleOnline = () => {
      setOnline(true)
      setRestored(true)
      if (restoredTimer) clearTimeout(restoredTimer)
      restoredTimer = setTimeout(() => setRestored(false), 3000)
    }
    const handleOffline = () => {
      setOnline(false)
      setRestored(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (restoredTimer) clearTimeout(restoredTimer)
    }
  }, [])

  return { online, restored }
}
