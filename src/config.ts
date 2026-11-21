export const CHART_INTERVALS = ['15m', '1h', '4h', '1d', '1w'] as const
export const SCORE_INTERVALS = ['1w', '1d', '4h'] as const

export type IntervalId = (typeof CHART_INTERVALS)[number]
export type ScoreIntervalId = (typeof SCORE_INTERVALS)[number]

export const INTERVAL_LABEL: Record<IntervalId, string> = {
  '15m': '15 分',
  '1h': '1 小時',
  '4h': '4 小時',
  '1d': '日線',
  '1w': '週線',
}

export const INTERVAL_SECONDS: Record<IntervalId, number> = {
  '15m': 15 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
}

/** Higher timeframes carry the trend. Intraday charts stay out of the score. */
export const TF_WEIGHTS: Record<ScoreIntervalId, number> = {
  '1w': 0.45,
  '1d': 0.35,
  '4h': 0.2,
}

export const INDICATOR_WEIGHTS = {
  emaAlign: 0.22,
  priceEma200: 0.16,
  macd: 0.18,
  rsi: 0.12,
  adx: 0.16,
  bollinger: 0.08,
  volume: 0.08,
} as const

export type IndicatorId = keyof typeof INDICATOR_WEIGHTS

export const INDICATOR_NAME: Record<IndicatorId, string> = {
  emaAlign: '均線排列',
  priceEma200: '價格對 EMA200',
  macd: 'MACD',
  rsi: 'RSI',
  adx: 'ADX / DMI',
  bollinger: '布林位置',
  volume: '量能',
}

/** Inclusive edges: |score| >= strong is 強烈, |score| >= lean is 偏多/偏空. */
export const SCORE_BAND = {
  strong: 60,
  lean: 15,
} as const

export const REFRESH_MS = 60_000
