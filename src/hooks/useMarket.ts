import { useCallback, useEffect, useRef, useState } from 'react'
import { REFRESH_MS, type IntervalId } from '../config.ts'
import { loadMarket } from '../lib/api.ts'
import { deriveLevels, type PriceLevel } from '../lib/levels.ts'
import { scoreMarket, type CompositeScore } from '../lib/score.ts'
import type {
  FearGreed,
  Funding,
  GlobalMarket,
  LongShort,
  OpenInterest,
  Ticker,
  Candle,
} from '../types.ts'

export type MarketState = {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  refreshing: boolean
  staleMessage: string | null
  updatedAt: number | null
  priceLive: boolean
  ticker: Ticker | null
  twd: number | null
  candles: Partial<Record<IntervalId, Candle[]>>
  candleSources: Partial<Record<IntervalId, string>>
  candleErrors: Partial<Record<IntervalId, string>>
  score: CompositeScore | null
  levels: PriceLevel[]
  fearGreed: FearGreed | null
  fearError: string | null
  funding: Funding | null
  fundingError: string | null
  openInterest: OpenInterest | null
  oiError: string | null
  longShort: LongShort | null
  lsError: string | null
  global: GlobalMarket | null
  globalError: string | null
}

const INITIAL: MarketState = {
  status: 'loading',
  error: null,
  refreshing: false,
  staleMessage: null,
  updatedAt: null,
  priceLive: false,
  ticker: null,
  twd: null,
  candles: {},
  candleSources: {},
  candleErrors: {},
  score: null,
  levels: [],
  fearGreed: null,
  fearError: null,
  funding: null,
  fundingError: null,
  openInterest: null,
  oiError: null,
  longShort: null,
  lsError: null,
  global: null,
  globalError: null,
}

export function useMarket() {
  const [state, setState] = useState<MarketState>(INITIAL)
  const seq = useRef(0)
  const updatedAtRef = useRef<number | null>(null)

  const pull = useCallback(async (id: number) => {
    try {
      const snapshot = await loadMarket()
      if (id !== seq.current) return
      const score = scoreMarket(snapshot.candles)
      const levels = deriveLevels(snapshot.candles['1d'] ?? null, snapshot.candles['4h'] ?? null, snapshot.ticker.price)
      const updatedAt = Date.now()
      updatedAtRef.current = updatedAt
      setState((current) => ({
        ...current,
        status: 'ready',
        error: null,
        refreshing: false,
        staleMessage: null,
        updatedAt,
        ticker: snapshot.ticker,
        twd: snapshot.twd,
        candles: snapshot.candles,
        candleSources: snapshot.candleSources,
        candleErrors: snapshot.candleErrors,
        score,
        levels,
        fearGreed: snapshot.fearGreed,
        fearError: snapshot.fearError,
        funding: snapshot.funding,
        fundingError: snapshot.fundingError,
        openInterest: snapshot.openInterest,
        oiError: snapshot.oiError,
        longShort: snapshot.longShort,
        lsError: snapshot.lsError,
        global: snapshot.global,
        globalError: snapshot.globalError,
      }))
    } catch (error) {
      if (id !== seq.current) return
      const message = error instanceof Error ? error.message : '更新失敗'
      setState((current) => {
        if (current.status === 'ready') {
          return {
            ...current,
            refreshing: false,
            staleMessage: '這次更新失敗。畫面上仍是上一筆成功讀到的資料。',
          }
        }
        return { ...current, status: 'error', refreshing: false, error: message }
      })
    }
  }, [])

  const reload = useCallback(() => {
    const id = ++seq.current
    setState((current) => ({ ...current, refreshing: true, staleMessage: null }))
    return pull(id)
  }, [pull])

  useEffect(() => {
    const id = ++seq.current
    void pull(id)
  }, [pull])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void reload()
    }, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const updatedAt = updatedAtRef.current
      if (updatedAt != null && Date.now() - updatedAt >= REFRESH_MS) void reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  useEffect(() => {
    let socket: WebSocket | null = null
    let stopped = false
    let timer = 0
    let lastApply = 0

    const connect = () => {
      if (stopped) return
      socket = new WebSocket('wss://data-stream.binance.vision/ws/btcusdt@miniTicker')
      socket.onmessage = (event) => {
        const now = Date.now()
        if (now - lastApply < 500) return
        lastApply = now
        try {
          const data = JSON.parse(String(event.data)) as { c?: string; o?: string; h?: string; l?: string; q?: string }
          const price = Number(data.c)
          const open = Number(data.o)
          if (!Number.isFinite(price) || !Number.isFinite(open) || open === 0) return
          const high = Number(data.h)
          const low = Number(data.l)
          const quoteVolume = Number(data.q)
          setState((current) => {
            if (!current.ticker) return current
            return {
              ...current,
              priceLive: true,
              ticker: {
                ...current.ticker,
                price,
                changePercent: ((price - open) / open) * 100,
                high: Number.isFinite(high) ? high : current.ticker.high,
                low: Number.isFinite(low) ? low : current.ticker.low,
                quoteVolume: Number.isFinite(quoteVolume) ? quoteVolume : current.ticker.quoteVolume,
                source: '幣安',
              },
            }
          })
        } catch {
          // Ignore a malformed frame and wait for the next one.
        }
      }
      socket.onclose = () => {
        if (!stopped) timer = window.setTimeout(connect, 3000)
      }
      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()
    return () => {
      stopped = true
      window.clearTimeout(timer)
      socket?.close()
    }
  }, [])

  return { state, reload }
}
