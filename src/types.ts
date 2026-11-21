import type { IntervalId } from './config.ts'

export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Ticker = {
  price: number
  changePercent: number
  high: number | null
  low: number | null
  quoteVolume: number | null
  source: string
}

export type FearGreed = {
  value: number
  label: string
  updatedAt: number | null
  source: string
}

export type Funding = {
  rate: number
  nextTime: number | null
  source: string
}

export type OpenInterest = {
  btc: number
  usd: number | null
  source: string
}

export type LongShort = {
  ratio: number
  longPct: number
  shortPct: number
  source: string
}

export type GlobalMarket = {
  btcDominance: number
  totalMarketCapUsd: number
  marketCapChange24h: number | null
  source: string
}

export type MarketSnapshot = {
  ticker: Ticker
  twd: number | null
  candles: Partial<Record<IntervalId, Candle[]>>
  candleSources: Partial<Record<IntervalId, string>>
  candleErrors: Partial<Record<IntervalId, string>>
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
