import { CheckCircle, Wifi, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

export function ConnectionStatus() {
  const { online, restored } = useOnlineStatus()

  if (online && !restored) return null

  return (
    <div
      role="status"
      className={
        online
          ? 'fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-emerald-700 px-4 py-2 text-sm text-white'
          : 'fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-red-900 px-4 py-2 text-sm text-red-100'
      }
    >
      {online ? <CheckCircle size={15} /> : <WifiOff size={15} />}
      <span>{online ? 'Connection restored.' : 'You are offline. Changes cannot be submitted until connection returns.'}</span>
      {!online && <Wifi size={15} className="opacity-60" />}
    </div>
  )
}
