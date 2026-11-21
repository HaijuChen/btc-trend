import { CHART_INTERVALS, type IntervalId } from '../config.ts'
import type { Candle, FearGreed, Funding, GlobalMarket, LongShort, MarketSnapshot, OpenInterest, Ticker } from '../types.ts'
import { fearLabel } from './notes.ts'

const BINANCE_SPOT = ['https://data-api.binance.vision', 'https://api.binance.com']
const BINANCE_INTERVAL: Record<IntervalId, string> = {
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
}
const OKX_BAR: Record<IntervalId, string> = {
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1Dutc',
  '1w': '1Wutc',
}
const GATE_BAR: Record<IntervalId, string> = {
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '7d',
}

const MISS = '這項資料暫時拿不到。'

async function fetchJson<T>(url: string, timeoutMs = 9000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return JSON.parse(text) as T
  } finally {
    clearTimeout(timer)
  }
}

function asNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) ? number : null
}

export function sanitizeCandles(input: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>()
  for (const candle of input) {
    if (![candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)) continue
    if (candle.close <= 0 || candle.open <= 0) continue
    byTime.set(candle.time, {
      time: candle.time,
      open: candle.open,
      close: candle.close,
      high: Math.max(candle.high, candle.open, candle.close),
      low: Math.min(candle.low, candle.open, candle.close),
      volume: Math.max(0, candle.volume),
    })
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time)
}

async function firstSuccess<T>(attempts: Array<{ source: string; run: () => Promise<T> }>): Promise<{ value: T; source: string }> {
  let lastError: unknown = null
  for (const attempt of attempts) {
    try {
      const value = await attempt.run()
      return { value, source: attempt.source }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('所有來源都沒有回應')
}

async function fetchBinanceTicker(base: string): Promise<Ticker> {
  const data = await fetchJson<{
    lastPrice?: string
    priceChangePercent?: string
    highPrice?: string
    lowPrice?: string
    quoteVolume?: string
  }>(`${base}/api/v3/ticker/24hr?symbol=BTCUSDT`)
  const price = asNumber(data.lastPrice)
  const changePercent = asNumber(data.priceChangePercent)
  if (price == null || changePercent == null) throw new Error('幣安報價格式不符')
  return {
    price,
    changePercent,
    high: asNumber(data.highPrice),
    low: asNumber(data.lowPrice),
    quoteVolume: asNumber(data.quoteVolume),
    source: '幣安',
  }
}

async function fetchOkxTicker(): Promise<Ticker> {
  const body = await fetchJson<{ code?: string; data?: Array<Record<string, string>> }>(
    'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
  )
  const row = body.data?.[0]
  if (body.code !== '0' || !row) throw new Error('OKX 報價失敗')
  const price = asNumber(row.last)
  const open = asNumber(row.open24h)
  if (price == null || open == null || open === 0) throw new Error('OKX 報價格式不符')
  return {
    price,
    changePercent: ((price - open) / open) * 100,
    high: asNumber(row.high24h),
    low: asNumber(row.low24h),
    quoteVolume: asNumber(row.volCcy24h),
    source: 'OKX',
  }
}

async function fetchGateTicker(): Promise<Ticker> {
  const rows = await fetchJson<Array<Record<string, string>>>(
    'https://api.gateio.ws/api/v4/spot/tickers?currency_pair=BTC_USDT',
  )
  const row = rows[0]
  const price = asNumber(row?.last)
  const changePercent = asNumber(row?.change_percentage)
  if (!row || price == null || changePercent == null) throw new Error('Gate 報價格式不符')
  return {
    price,
    changePercent,
    high: asNumber(row.high_24h),
    low: asNumber(row.low_24h),
    quoteVolume: asNumber(row.quote_volume),
    source: 'Gate.io',
  }
}

async function fetchCoinGeckoTicker(): Promise<Ticker> {
  const body = await fetchJson<{ bitcoin?: { usd?: number; usd_24h_change?: number } }>(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
  )
  const price = asNumber(body.bitcoin?.usd)
  const changePercent = asNumber(body.bitcoin?.usd_24h_change)
  if (price == null || changePercent == null) throw new Error('CoinGecko 報價格式不符')
  return { price, changePercent, high: null, low: null, quoteVolume: null, source: 'CoinGecko' }
}

async function fetchTicker(): Promise<Ticker> {
  const { value } = await firstSuccess<Ticker>([
    ...BINANCE_SPOT.map((base) => ({ source: '幣安', run: () => fetchBinanceTicker(base) })),
    { source: 'OKX', run: fetchOkxTicker },
    { source: 'Gate.io', run: fetchGateTicker },
    { source: 'CoinGecko', run: fetchCoinGeckoTicker },
  ])
  return value
}

async function fetchTwd(): Promise<number | null> {
  try {
    const body = await fetchJson<{ bitcoin?: { twd?: number } }>(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=twd',
    )
    return asNumber(body.bitcoin?.twd)
  } catch (error) {
    console.warn('[btc] 台幣報價失敗', error)
    return null
  }
}

function parseBinanceKlines(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) throw new Error('K 線格式不符')
  const candles = rows.map((row) => {
    const item = row as unknown[]
    return {
      time: Math.floor(Number(item[0]) / 1000),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
    }
  })
  const clean = sanitizeCandles(candles)
  if (clean.length < 40) throw new Error('K 線太短')
  return clean
}

function klineLimit(interval: IntervalId): { binance: number; okx: number; gate: number } {
  // The 4h replay needs a long closed-candle history. 1000 is the spot kline cap on Binance and Gate.
  if (interval === '4h') return { binance: 1000, okx: 1000, gate: 1000 }
  return { binance: 500, okx: 300, gate: 300 }
}

function parseOkxRows(rows: string[][]): Candle[] {
  return rows.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }))
}

async function fetchBinanceKlines(base: string, interval: IntervalId, limit: number): Promise<Candle[]> {
  const rows = await fetchJson<unknown>(
    `${base}/api/v3/klines?symbol=BTCUSDT&interval=${BINANCE_INTERVAL[interval]}&limit=${limit}`,
    12000,
  )
  return parseBinanceKlines(rows)
}

async function fetchOkxKlines(interval: IntervalId, limit: number): Promise<Candle[]> {
  const recentLimit = Math.min(limit, 300)
  const body = await fetchJson<{ code?: string; data?: string[][] }>(
    `https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=${OKX_BAR[interval]}&limit=${recentLimit}`,
    12000,
  )
  if (body.code !== '0' || !Array.isArray(body.data)) throw new Error('OKX K 線失敗')
  let candles = sanitizeCandles(parseOkxRows(body.data))
  if (candles.length < 40) throw new Error('OKX K 線太短')
  if (interval !== '4h' || candles.length >= limit) return candles

  let guard = 0
  while (candles.length < limit && guard < 8) {
    guard += 1
    const oldestMs = candles[0].time * 1000
    try {
      const page = await fetchJson<{ code?: string; data?: string[][] }>(
        `https://www.okx.com/api/v5/market/history-candles?instId=BTC-USDT&bar=4H&limit=100&after=${oldestMs}`,
        12000,
      )
      if (page.code !== '0' || !Array.isArray(page.data) || page.data.length === 0) break
      const merged = sanitizeCandles([...parseOkxRows(page.data), ...candles])
      if (merged.length <= candles.length) break
      candles = merged
    } catch (error) {
      console.warn('[btc] OKX 4h 歷史 K 線中斷', error)
      break
    }
  }
  return candles
}

async function fetchGateKlines(interval: IntervalId, limit: number): Promise<Candle[]> {
  const rows = await fetchJson<unknown[][]>(
    `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=BTC_USDT&interval=${GATE_BAR[interval]}&limit=${limit}`,
    12000,
  )
  if (!Array.isArray(rows)) throw new Error('Gate K 線失敗')
  const candles = rows.map((row) => ({
    time: Number(row[0]),
    close: Number(row[2]),
    high: Number(row[3]),
    low: Number(row[4]),
    open: Number(row[5]),
    volume: Number(row[6]),
  }))
  const clean = sanitizeCandles(candles)
  if (clean.length < 40) throw new Error('Gate K 線太短')
  return clean
}

async function fetchInterval(interval: IntervalId): Promise<{ candles: Candle[]; source: string }> {
  const limit = klineLimit(interval)
  const result = await firstSuccess<Candle[]>([
    ...BINANCE_SPOT.map((base) => ({ source: '幣安', run: () => fetchBinanceKlines(base, interval, limit.binance) })),
    { source: 'OKX', run: () => fetchOkxKlines(interval, limit.okx) },
    { source: 'Gate.io', run: () => fetchGateKlines(interval, limit.gate) },
  ])
  return { candles: result.value, source: result.source }
}

async function fetchAllCandles(): Promise<Pick<MarketSnapshot, 'candles' | 'candleSources' | 'candleErrors'>> {
  const candles: Partial<Record<IntervalId, Candle[]>> = {}
  const candleSources: Partial<Record<IntervalId, string>> = {}
  const candleErrors: Partial<Record<IntervalId, string>> = {}
  await Promise.all(
    CHART_INTERVALS.map(async (interval) => {
      try {
        const result = await fetchInterval(interval)
        candles[interval] = result.candles
        candleSources[interval] = result.source
      } catch (error) {
        console.warn(`[btc] ${interval} K 線失敗`, error)
        candleErrors[interval] = '這段 K 線暫時拿不到。'
      }
    }),
  )
  return { candles, candleSources, candleErrors }
}

async function fetchFearGreed(): Promise<{ fearGreed: FearGreed | null; fearError: string | null }> {
  try {
    const body = await fetchJson<{
      data?: Array<{ value?: string; value_classification?: string; timestamp?: string }>
    }>('https://api.alternative.me/fng/?limit=1')
    const row = body.data?.[0]
    const value = asNumber(row?.value)
    if (value == null) throw new Error('指數格式不符')
    const timestamp = asNumber(row?.timestamp)
    return {
      fearGreed: {
        value,
        label: fearLabel(value, row?.value_classification),
        updatedAt: timestamp == null ? null : timestamp * 1000,
        source: 'Alternative.me',
      },
      fearError: null,
    }
  } catch (error) {
    console.warn('[btc] 恐懼貪婪指數失敗', error)
    return { fearGreed: null, fearError: MISS }
  }
}

async function fetchGlobal(): Promise<{ global: GlobalMarket | null; globalError: string | null }> {
  try {
    const body = await fetchJson<{
      data?: {
        total_market_cap?: { usd?: number }
        market_cap_percentage?: { btc?: number }
        market_cap_change_percentage_24h_usd?: number
      }
    }>('https://api.coingecko.com/api/v3/global')
    const dominance = asNumber(body.data?.market_cap_percentage?.btc)
    const cap = asNumber(body.data?.total_market_cap?.usd)
    if (dominance == null || cap == null) throw new Error('全球行情格式不符')
    return {
      global: {
        btcDominance: dominance,
        totalMarketCapUsd: cap,
        marketCapChange24h: asNumber(body.data?.market_cap_change_percentage_24h_usd),
        source: 'CoinGecko',
      },
      globalError: null,
    }
  } catch (error) {
    console.warn('[btc] 全球行情失敗', error)
    return { global: null, globalError: MISS }
  }
}

type BitgetTicker = {
  fundingRate?: string
  holdingAmount?: string
  markPrice?: string
  indexPrice?: string
}

function bitgetTickerLoader() {
  let pending: Promise<BitgetTicker> | null = null
  return () => {
    pending ??= fetchJson<{ data?: BitgetTicker[] }>(
      'https://api.bitget.com/api/v2/mix/market/ticker?productType=USDT-FUTURES&symbol=BTCUSDT',
    ).then((body) => {
      const row = body.data?.[0]
      if (!row) throw new Error('Bitget 報價是空的')
      return row
    })
    return pending
  }
}

type GateContract = Record<string, unknown>

function gateContractLoader() {
  let pending: Promise<GateContract> | null = null
  return () => {
    pending ??= fetchJson<GateContract>('https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT')
    return pending
  }
}

async function fetchFunding(bitget: () => Promise<BitgetTicker>, gate: () => Promise<GateContract>): Promise<{
  funding: Funding | null
  fundingError: string | null
}> {
  try {
    const { value, source } = await firstSuccess<Funding>([
      {
        source: '幣安合約',
        run: async () => {
          const data = await fetchJson<{ lastFundingRate?: string; nextFundingTime?: number }>(
            'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',
          )
          const rate = asNumber(data.lastFundingRate)
          if (rate == null) throw new Error('幣安資金費率格式不符')
          return { rate, nextTime: asNumber(data.nextFundingTime), source: '幣安合約' }
        },
      },
      {
        source: 'OKX 永續',
        run: async () => {
          const body = await fetchJson<{ code?: string; data?: Array<Record<string, string>> }>(
            'https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP',
          )
          const row = body.data?.[0]
          const rate = asNumber(row?.fundingRate)
          if (body.code !== '0' || rate == null) throw new Error('OKX 資金費率失敗')
          return { rate, nextTime: asNumber(row?.fundingTime), source: 'OKX 永續' }
        },
      },
      {
        source: 'Bitget 永續',
        run: async () => {
          const row = await bitget()
          const rate = asNumber(row.fundingRate)
          if (rate == null) throw new Error('Bitget 資金費率格式不符')
          return { rate, nextTime: null, source: 'Bitget 永續' }
        },
      },
      {
        source: 'Gate.io 永續',
        run: async () => {
          const row = await gate()
          const rate = asNumber(row.funding_rate)
          const next = asNumber(row.funding_next_apply)
          if (rate == null) throw new Error('Gate 資金費率格式不符')
          return { rate, nextTime: next == null ? null : next * 1000, source: 'Gate.io 永續' }
        },
      },
    ])
    return { funding: { ...value, source }, fundingError: null }
  } catch (error) {
    console.warn('[btc] 資金費率失敗', error)
    return { funding: null, fundingError: MISS }
  }
}

async function fetchOpenInterest(
  spotPrice: number,
  bitget: () => Promise<BitgetTicker>,
  gate: () => Promise<GateContract>,
): Promise<{ openInterest: OpenInterest | null; oiError: string | null }> {
  try {
    const { value, source } = await firstSuccess<OpenInterest>([
      {
        source: '幣安合約',
        run: async () => {
          const data = await fetchJson<{ openInterest?: string }>('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT')
          const btc = asNumber(data.openInterest)
          if (btc == null) throw new Error('幣安未平倉格式不符')
          return { btc, usd: btc * spotPrice, source: '幣安合約' }
        },
      },
      {
        source: 'OKX 永續',
        run: async () => {
          const body = await fetchJson<{ code?: string; data?: Array<Record<string, string>> }>(
            'https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP',
          )
          const row = body.data?.[0]
          const btc = asNumber(row?.oiCcy)
          if (body.code !== '0' || btc == null) throw new Error('OKX 未平倉失敗')
          const usd = asNumber(row?.oiUsd) ?? btc * spotPrice
          return { btc, usd, source: 'OKX 永續' }
        },
      },
      {
        source: 'Bitget 永續',
        run: async () => {
          const row = await bitget()
          const btc = asNumber(row.holdingAmount)
          if (btc == null) throw new Error('Bitget 未平倉格式不符')
          const mark = asNumber(row.markPrice) ?? asNumber(row.indexPrice) ?? spotPrice
          return { btc, usd: btc * mark, source: 'Bitget 永續' }
        },
      },
      {
        source: 'Gate.io 永續',
        run: async () => {
          const row = await gate()
          const size = asNumber(row.position_size)
          const multiplier = asNumber(row.quanto_multiplier)
          if (size == null || multiplier == null) throw new Error('Gate 未平倉格式不符')
          const btc = size * multiplier
          const mark = asNumber(row.mark_price) ?? spotPrice
          return { btc, usd: btc * mark, source: 'Gate.io 永續' }
        },
      },
    ])
    return { openInterest: { ...value, source }, oiError: null }
  } catch (error) {
    console.warn('[btc] 未平倉失敗', error)
    return { openInterest: null, oiError: MISS }
  }
}

async function fetchLongShort(gate: () => Promise<GateContract>): Promise<{ longShort: LongShort | null; lsError: string | null }> {
  try {
    const { value, source } = await firstSuccess<LongShort>([
      {
        source: '幣安合約',
        run: async () => {
          const rows = await fetchJson<Array<Record<string, string>>>(
            'https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1',
          )
          const row = rows[rows.length - 1]
          const ratio = asNumber(row?.longShortRatio)
          const longAccount = asNumber(row?.longAccount)
          const shortAccount = asNumber(row?.shortAccount)
          if (ratio == null || ratio <= 0) throw new Error('幣安多空比格式不符')
          const longPct = longAccount == null ? (ratio / (1 + ratio)) * 100 : longAccount * 100
          const shortPct = shortAccount == null ? 100 - longPct : shortAccount * 100
          return { ratio, longPct, shortPct, source: '幣安合約' }
        },
      },
      {
        source: 'Bitget 永續',
        run: async () => {
          const body = await fetchJson<{
            data?: Array<{ longAccountRatio?: string; shortAccountRatio?: string; longShortAccountRatio?: string; ts?: string }>
          }>('https://api.bitget.com/api/v2/mix/market/account-long-short?symbol=BTCUSDT&productType=USDT-FUTURES')
          const rows = body.data ?? []
          if (rows.length === 0) throw new Error('Bitget 多空比是空的')
          const latest = rows.reduce((best, row) => (Number(row.ts) > Number(best.ts) ? row : best))
          const longRatio = asNumber(latest.longAccountRatio)
          const shortRatio = asNumber(latest.shortAccountRatio)
          const ratio = asNumber(latest.longShortAccountRatio)
          if (longRatio == null || shortRatio == null || ratio == null) throw new Error('Bitget 多空比格式不符')
          return { ratio, longPct: longRatio * 100, shortPct: shortRatio * 100, source: 'Bitget 永續' }
        },
      },
      {
        source: 'Gate.io 永續',
        run: async () => {
          const row = await gate()
          const longs = asNumber(row.long_users)
          const shorts = asNumber(row.short_users)
          if (longs == null || shorts == null || longs <= 0 || shorts <= 0) throw new Error('Gate 多空比格式不符')
          return {
            ratio: longs / shorts,
            longPct: (longs / (longs + shorts)) * 100,
            shortPct: (shorts / (longs + shorts)) * 100,
            source: 'Gate.io 永續',
          }
        },
      },
    ])
    return { longShort: { ...value, source }, lsError: null }
  } catch (error) {
    console.warn('[btc] 多空比失敗', error)
    return { longShort: null, lsError: MISS }
  }
}

export async function loadMarket(): Promise<MarketSnapshot> {
  let ticker: Ticker
  try {
    ticker = await fetchTicker()
  } catch (error) {
    console.warn('[btc] 報價全部失敗', error)
    throw new Error('現貨報價暫時連不上。已嘗試幣安、OKX、Gate.io 與 CoinGecko。')
  }

  const bitget = bitgetTickerLoader()
  const gate = gateContractLoader()
  const [candles, twd, fear, global, funding, openInterest, longShort] = await Promise.all([
    fetchAllCandles(),
    fetchTwd(),
    fetchFearGreed(),
    fetchGlobal(),
    fetchFunding(bitget, gate),
    fetchOpenInterest(ticker.price, bitget, gate),
    fetchLongShort(gate),
  ])

  return {
    ticker,
    twd,
    ...candles,
    ...fear,
    ...global,
    ...funding,
    ...openInterest,
    ...longShort,
  }
}
