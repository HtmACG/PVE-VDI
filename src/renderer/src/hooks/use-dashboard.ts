import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardData } from '@shared/types'
import { errorDetail, isAuthError, unwrap } from '@renderer/lib/api'

interface UseDashboardOptions {
  enabled: boolean
  intervalSeconds: number
  onAuthError: (message: string) => void
}

interface DashboardState {
  data: DashboardData | null
  loading: boolean
  refreshing: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useDashboard({ enabled, intervalSeconds, onAuthError }: UseDashboardOptions): DashboardState {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const mounted = useRef(true)
  const authErrorRef = useRef(onAuthError)
  const dataRef = useRef<DashboardData | null>(null)

  useEffect(() => {
    authErrorRef.current = onAuthError
  }, [onAuthError])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async (): Promise<void> => {
    if (!enabled) return
    if (inFlight.current) return inFlight.current

    const hasData = Boolean(dataRef.current)
    if (hasData) setRefreshing(true)
    else setLoading(true)

    const run = (async () => {
      try {
        const next = await unwrap(window.pvevdi.dashboard())
        if (!mounted.current) return
        setData(next)
        dataRef.current = next
        setError(null)
      } catch (err) {
        if (!mounted.current) return
        const message = errorDetail(err)
        setError(message)
        if (isAuthError(err)) authErrorRef.current(message)
      } finally {
        if (mounted.current) {
          setLoading(false)
          setRefreshing(false)
        }
        inFlight.current = null
      }
    })()

    inFlight.current = run
    await run
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    let timer: number | undefined

    const tick = async (): Promise<void> => {
      await load()
      if (cancelled) return
      timer = window.setTimeout(tick, Math.max(5, intervalSeconds) * 1000)
    }

    void tick()

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        if (timer) window.clearTimeout(timer)
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, intervalSeconds, load])

  return {
    data,
    loading,
    refreshing,
    error,
    refresh: load
  }
}
