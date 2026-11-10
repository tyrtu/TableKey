import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UtensilsCrossed, Tablet, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { setPairedDeviceToken, getDeviceLabel } from '../../lib/device'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'

export default function DevicePairPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < 6) {
      toast.error('Enter the 6-digit pairing code.')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('pair_device', {
        p_pairing_code: code.trim(),
        p_device_label: getDeviceLabel(),
      })
      if (error) throw error
      if (!data.success) {
        toast.error(data.message)
        return
      }
      setPairedDeviceToken(data.device_token)
      toast.success('Device paired! Select your name to sign in.')
      navigate('/pin-login', { replace: true })
    } catch {
      toast.error('Failed to pair device. Check the code and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-500 text-white mb-3 shadow-lg">
            <UtensilsCrossed size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white">Pair this device</h1>
          <p className="text-sm text-gray-400 mt-1">
            Enter the code your manager gave you.
          </p>
        </div>

        <form onSubmit={handlePair} className="bg-gray-800 rounded-3xl shadow-xl border border-gray-700 p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-1.5">Pairing code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoFocus
              className="w-full h-16 rounded-xl border-2 border-gray-600 bg-gray-900 text-center text-3xl font-bold tracking-[0.5em] text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          <Button type="submit" fullWidth size="lg" loading={loading}>
            <Tablet size={18} />
            Pair Device
            <ArrowRight size={16} />
          </Button>

          <p className="text-xs text-center text-gray-500">
            Ask your manager to generate a pairing code in Staff → Pair Device.
          </p>
        </form>
      </div>
    </div>
  )
}
