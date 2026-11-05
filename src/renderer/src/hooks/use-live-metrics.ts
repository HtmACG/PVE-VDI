import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveMetricsData } from '@shared/types'
import { errorDetail, isAuthError, unwrap } from '@renderer/lib/api'

interface UseLiveMetricsOptions {
  enabled: boolean
  intervalMs?: number
  onAuthError: (message: string) => void
}

interface LiveMetricsState {
  data: LiveMetricsData | null
  error: string | null
  refresh: () => Promise<void>
}

export function useLiveMetrics({
  enabled,
  intervalMs = 2000,
  onAuthError
}: UseLiveMetricsOptions): LiveMetricsState {
  const [data, setData] = useState<LiveMetricsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const mounted = useRef(true)
  const authErrorRef = useRef(onAuthError)
  const dataRef = useRef<LiveMetricsData | null>(null)

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

    const run = (async () => {
      try {
        const next = await unwrap(window.pvevdi.liveMetrics())
        if (!mounted.current) return
        setData(next)
        dataRef.current = next
        setError(null)
      } catch (err) {
        if (!mounted.current) return
        setError(errorDetail(err))
        if (isAuthError(err)) authErrorRef.current(errorDetail(err))
      } finally {
        inFlight.current = null
      }
    })()

    inFlight.current = run
    await run
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setData(null)
      return
    }
    let cancelled = false
    let timer: number | undefined

    const tick = async (): Promise<void> => {
      await load()
      if (cancelled) return
      timer = window.setTimeout(tick, Math.max(1000, intervalMs))
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
  }, [enabled, intervalMs, load])

  return { data, error, refresh: load }
}
