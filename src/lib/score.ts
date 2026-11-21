import {
  INDICATOR_NAME,
  INDICATOR_WEIGHTS,
  INTERVAL_LABEL,
  SCORE_BAND,
  SCORE_INTERVALS,
  TF_WEIGHTS,
  type IndicatorId,
  type IntervalId,
  type ScoreIntervalId,
} from '../config.ts'
import type { Candle } from '../types.ts'
import { formatNumber, formatUsd } from './format.ts'
import { bollinger, clamp, dmi, ema, lastDefined, macd, rsi } from './math.ts'

export type Signal = 'bull' | 'lean-bull' | 'neutral' | 'lean-bear' | 'bear' | 'na'

const COMPOSITE_LABEL: Record<Signal, string> = {
  bull: '強烈多頭',
  'lean-bull': '偏多',
  neutral: '中性',
  'lean-bear': '偏空',
  bear: '強烈空頭',
  na: '無法判斷',
}

const INDICATOR_LABEL: Record<Signal, string> = {
  bull: '多頭',
  'lean-bull': '偏多',
  neutral: '中性',
  'lean-bear': '偏空',
  bear: '空頭',
  na: '不足',
}

export function signalFromScore(score: number, available = true): Signal {
  if (!available) return 'na'
  if (score >= SCORE_BAND.strong) return 'bull'
  if (score >= SCORE_BAND.lean) return 'lean-bull'
  if (score <= -SCORE_BAND.strong) return 'bear'
  if (score <= -SCORE_BAND.lean) return 'lean-bear'
  return 'neutral'
}

export function labelFor(signal: Signal, kind: 'composite' | 'indicator'): string {
  return kind === 'composite' ? COMPOSITE_LABEL[signal] : INDICATOR_LABEL[signal]
}

export function toneOf(signal: Signal): 'bull' | 'bear' | 'neutral' | 'na' {
  if (signal === 'bull' || signal === 'lean-bull') return 'bull'
  if (signal === 'bear' || signal === 'lean-bear') return 'bear'
  if (signal === 'na') return 'na'
  return 'neutral'
}

export type IndicatorReading = {
  id: IndicatorId
  name: string
  weight: number
  effectiveWeight: number
  score: number
  available: boolean
  signal: Signal
  reason: string
  detail: string
}

export type TimeframeReading = {
  id: ScoreIntervalId
  label: string
  weight: number
  effectiveWeight: number
  score: number
  signal: Signal
  indicators: IndicatorReading[]
  renormNote: string | null
}

export type CompositeScore = {
  score: number
  signal: Signal
  frames: TimeframeReading[]
  renormNote: string | null
}

function reading(
  id: IndicatorId,
  score: number,
  available: boolean,
  reason: string,
  detail: string,
): Omit<IndicatorReading, 'effectiveWeight'> {
  return {
    id,
    name: INDICATOR_NAME[id],
    weight: INDICATOR_WEIGHTS[id],
    score: available ? score : 0,
    available,
    signal: signalFromScore(score, available),
    reason,
    detail,
  }
}

function unavailable(id: IndicatorId, reason: string): Omit<IndicatorReading, 'effectiveWeight'> {
  return reading(id, 0, false, reason, '')
}

function scoreEmaAlign(closes: number[], price: number): Omit<IndicatorReading, 'effectiveWeight'> {
  const e20 = lastDefined(ema(closes, 20))
  const e50 = lastDefined(ema(closes, 50))
  const e200 = lastDefined(ema(closes, 200))
  if (e20 == null || e50 == null || e200 == null) {
    return unavailable('emaAlign', 'K 線不夠長，EMA200 還沒有穩定的值。')
  }
  const detail = `EMA20 ${formatUsd(e20)} · EMA50 ${formatUsd(e50)} · EMA200 ${formatUsd(e200)}`
  const near = (a: number, b: number) => Math.abs(a - b) / price < 0.001
  if (near(e20, e50) && near(e50, e200)) {
    return reading('emaAlign', 0, true, '三條均線幾乎黏在一起，沒有多頭或空頭排列。', detail)
  }
  const bullStack = e20 > e50 && e50 > e200
  const bearStack = e20 < e50 && e50 < e200
  const shortBull = e20 > e50
  if (bullStack && price >= e20) {
    return reading('emaAlign', 100, true, '由上到下是 EMA20、EMA50、EMA200，價格也站在短均線之上，多頭排列完整。', detail)
  }
  if (bullStack) {
    return reading('emaAlign', 75, true, '均線已是多頭排列，但價格暫時落到 EMA20 之下。', detail)
  }
  if (bearStack && price <= e20) {
    return reading('emaAlign', -100, true, '由上到下是 EMA200、EMA50、EMA20，價格也在短均線之下，空頭排列完整。', detail)
  }
  if (bearStack) {
    return reading('emaAlign', -75, true, '均線已是空頭排列，但價格暫時站上 EMA20。', detail)
  }
  if (shortBull && price > e200) {
    return reading('emaAlign', 45, true, '短均線在中均線之上，價格也在 EMA200 之上，不過長短均線還沒排整齊。', detail)
  }
  if (shortBull) {
    return reading('emaAlign', 20, true, '短均線偏多，但價格仍在 EMA200 之下。', detail)
  }
  if (price > e200) {
    return reading('emaAlign', -20, true, '短均線已落到中均線之下，不過價格還在 EMA200 之上。', detail)
  }
  return reading('emaAlign', -45, true, '短均線在中均線之下，價格也在 EMA200 之下，只是還沒形成完整空頭排列。', detail)
}

function scorePriceEma(closes: number[], price: number): Omit<IndicatorReading, 'effectiveWeight'> {
  const e200 = lastDefined(ema(closes, 200))
  if (e200 == null || e200 === 0) {
    return unavailable('priceEma200', 'K 線不夠長，無法比較價格和 EMA200。')
  }
  const dist = (price - e200) / e200
  const score = clamp((dist / 0.08) * 100, -100, 100)
  const pct = Math.abs(dist * 100)
  const detail = `EMA200 ${formatUsd(e200)}`
  const reason =
    pct < 0.4
      ? `價格幾乎貼著 EMA200，差距 ${formatNumber(pct, 2)}%。`
      : dist > 0
        ? `價格在 EMA200 之上 ${formatNumber(pct, 1)}%。站上長期均線，中期成本仍偏多。`
        : `價格在 EMA200 之下 ${formatNumber(pct, 1)}%。跌破長期均線，中期成本轉弱。`
  return reading('priceEma200', score, true, reason, detail)
}

function scoreMacd(closes: number[]): Omit<IndicatorReading, 'effectiveWeight'> {
  const series = macd(closes)
  const hist = lastDefined(series.hist)
  const prev = lastDefined(series.hist, 1)
  const line = lastDefined(series.macd)
  const signal = lastDefined(series.signal)
  if (hist == null || line == null || signal == null) {
    return unavailable('macd', 'K 線不夠計算 MACD（12、26、9）。')
  }
  const detail = `MACD ${formatNumber(line, 1)} · 信號 ${formatNumber(signal, 1)} · 柱 ${formatNumber(hist, 1)}`
  if (Math.abs(hist) < 1e-6) {
    return reading('macd', 0, true, 'MACD 柱狀體幾乎是零，多空動能打平。', detail)
  }
  const expanding = prev != null && Math.sign(hist) === Math.sign(prev) && Math.abs(hist) > Math.abs(prev)
  const shrinking = prev != null && Math.sign(hist) === Math.sign(prev) && Math.abs(hist) < Math.abs(prev)
  const positive = hist > 0
  const aboveZero = line > 0
  let score = positive ? 20 : -20
  let reason = positive ? '柱狀體為正，動能剛轉到多方。' : '柱狀體為負，動能剛轉到空方。'
  if (positive && aboveZero && expanding) {
    score = 100
    reason = 'MACD 在零軸之上，柱狀體為正且繼續放大，上漲動能增強。'
  } else if (positive && aboveZero && shrinking) {
    score = 40
    reason = 'MACD 在零軸之上，但柱狀體縮短，上漲動能在減弱。'
  } else if (positive && aboveZero) {
    score = 70
    reason = 'MACD 在零軸之上，柱狀體為正。'
  } else if (positive && expanding) {
    score = 35
    reason = '柱狀體翻正且放大，但 MACD 仍在零軸下，只算初步轉強。'
  } else if (!positive && !aboveZero && expanding) {
    score = -100
    reason = 'MACD 在零軸之下，柱狀體為負且繼續放大，下跌動能增強。'
  } else if (!positive && !aboveZero && shrinking) {
    score = -40
    reason = 'MACD 在零軸之下，但柱狀體縮短，下跌動能在減弱。'
  } else if (!positive && !aboveZero) {
    score = -70
    reason = 'MACD 在零軸之下，柱狀體為負。'
  } else if (!positive && expanding) {
    score = -35
    reason = '柱狀體翻負且放大，但 MACD 仍在零軸上，上漲動能開始轉弱。'
  }
  return reading('macd', score, true, reason, detail)
}

function scoreRsi(closes: number[]): Omit<IndicatorReading, 'effectiveWeight'> {
  const series = rsi(closes, 14)
  const value = lastDefined(series)
  const prev = lastDefined(series, 1)
  if (value == null) return unavailable('rsi', 'K 線不夠計算 RSI（14）。')
  const score = clamp(((value - 50) / 20) * 100, -100, 100)
  const drift = prev == null ? 0 : value - prev
  const driftText = drift > 1.5 ? '，而且還在上升' : drift < -1.5 ? '，而且還在下降' : ''
  let zone = '貼近 50 中軸'
  if (value >= 70) zone = '已進入超買。這裡仍把它當成偏強的動能，不是自動的賣出訊號'
  else if (value <= 30) zone = '已進入超賣。這裡仍把它當成偏弱的動能，不是自動的買進訊號'
  else if (value >= 55) zone = '站在多方區'
  else if (value <= 45) zone = '落在空方區'
  const reason = `RSI ${formatNumber(value, 1)}${driftText}，${zone}。`
  return reading('rsi', score, true, reason, `RSI(14) ${formatNumber(value, 1)}`)
}

function scoreAdx(candles: Candle[]): Omit<IndicatorReading, 'effectiveWeight'> {
  const series = dmi(
    candles.map((candle) => candle.high),
    candles.map((candle) => candle.low),
    candles.map((candle) => candle.close),
    14,
  )
  const adx = lastDefined(series.adx)
  const plus = lastDefined(series.plusDI)
  const minus = lastDefined(series.minusDI)
  if (adx == null || plus == null || minus == null) {
    return unavailable('adx', 'K 線不夠計算 ADX 與 +DI / −DI。')
  }
  const detail = `ADX ${formatNumber(adx, 1)} · +DI ${formatNumber(plus, 1)} · −DI ${formatNumber(minus, 1)}`
  if (adx < 15) {
    return reading('adx', 0, true, `ADX ${formatNumber(adx, 1)}，趨勢很弱，先視為盤整。`, detail)
  }
  const spread = Math.abs(plus - minus)
  let magnitude = adx < 25 ? ((adx - 15) / 10) * 50 : 50 + clamp((adx - 25) / 20, 0, 1) * 50
  magnitude *= clamp(spread / 10, 0.35, 1)
  const score = (plus >= minus ? 1 : -1) * magnitude
  const who = plus >= minus ? '多方' : '空方'
  const strength = adx >= 25 ? '趨勢明確' : '趨勢剛形成'
  const reason = `ADX ${formatNumber(adx, 1)}，${strength}；+DI ${formatNumber(plus, 1)} 對 −DI ${formatNumber(minus, 1)}，由${who}主導。`
  return reading('adx', score, true, reason, detail)
}

function scoreBollinger(closes: number[]): Omit<IndicatorReading, 'effectiveWeight'> {
  const point = lastDefined(bollinger(closes, 20, 2))
  if (point == null) return unavailable('bollinger', 'K 線不夠計算布林通道（20、2）。')
  if (point.upper === point.lower) {
    return reading('bollinger', 0, true, '布林帶寬是零，價格幾乎沒有波動。', `%B ${formatNumber(point.percentB, 2)}`)
  }
  const score = clamp((point.percentB - 0.5) * 200, -100, 100)
  let where = '在布林中軌附近'
  if (point.percentB >= 1) where = '收在布林上軌之外'
  else if (point.percentB >= 0.8) where = '貼近布林上軌'
  else if (point.percentB > 0.6) where = '位於中軌與上軌之間'
  else if (point.percentB <= 0) where = '收在布林下軌之外'
  else if (point.percentB <= 0.2) where = '貼近布林下軌'
  else if (point.percentB < 0.4) where = '位於中軌與下軌之間'
  const squeeze = point.bandwidth < 0.06 ? '帶寬偏窄，波動正在收斂。' : ''
  const reason = `${where}（%B ${formatNumber(point.percentB, 2)}）。${squeeze}`.trim()
  const detail = `%B ${formatNumber(point.percentB, 2)} · 帶寬 ${formatNumber(point.bandwidth * 100, 1)}%`
  return reading('bollinger', score, true, reason, detail)
}

function scoreVolume(candles: Candle[]): Omit<IndicatorReading, 'effectiveWeight'> {
  if (candles.length < 26) return unavailable('volume', 'K 線不夠比較近期量能。')
  const recent = candles.slice(-5)
  const base = candles.slice(-25, -5)
  const recentAvg = recent.reduce((sum, candle) => sum + candle.volume, 0) / recent.length
  const baseAvg = base.reduce((sum, candle) => sum + candle.volume, 0) / base.length
  if (baseAvg <= 0) return unavailable('volume', '前段成交量是零，無法比較。')
  const ratio = recentAvg / baseAvg
  const first = candles[candles.length - 6]
  const last = candles[candles.length - 1]
  const retPct = (last.close / first.close - 1) * 100
  const detail = `近 5 根 / 前 20 根 = ${formatNumber(ratio, 2)} 倍`
  if (Math.abs(retPct) < 0.15) {
    return reading('volume', 0, true, `近 5 根價格幾乎沒有方向（${formatSignedPct(retPct)}），量能不另給方向。`, detail)
  }
  let magnitude = 12
  if (ratio >= 1.35) magnitude = 100
  else if (ratio >= 1.12) magnitude = 70
  else if (ratio >= 0.9) magnitude = 35
  const score = (retPct > 0 ? 1 : -1) * magnitude
  const dir = retPct > 0 ? '上漲' : '下跌'
  const volText =
    ratio >= 1.35 ? '量能明顯放大' : ratio >= 1.12 ? '量能放大' : ratio <= 0.85 ? '量能萎縮，確認度不高' : '量能接近前段均量'
  const reason = `近 5 根${dir} ${formatNumber(Math.abs(retPct), 1)}%，${volText}（${formatNumber(ratio, 2)} 倍）。`
  return reading('volume', score, true, reason, detail)
}

function formatSignedPct(value: number): string {
  const body = formatNumber(Math.abs(value), 1)
  if (value > 0) return `+${body}%`
  if (value < 0) return `−${body}%`
  return '0%'
}

function finishIndicators(raw: Array<Omit<IndicatorReading, 'effectiveWeight'>>): {
  indicators: IndicatorReading[]
  score: number
  renormNote: string | null
} {
  const usable = raw.filter((item) => item.available).reduce((sum, item) => sum + item.weight, 0)
  const missing = raw.filter((item) => !item.available).map((item) => item.name)
  const indicators = raw.map((item) => ({
    ...item,
    effectiveWeight: item.available && usable > 0 ? item.weight / usable : 0,
  }))
  const score = indicators.reduce((sum, item) => sum + item.effectiveWeight * item.score, 0)
  const renormNote = missing.length > 0 && usable > 0 ? `${missing.join('、')}資料不足，其餘指標已重新加權。` : null
  return { indicators, score, renormNote }
}

export function scoreTimeframe(candles: Candle[], id: ScoreIntervalId): TimeframeReading | null {
  if (candles.length < 40) return null
  const closes = candles.map((candle) => candle.close)
  const price = closes[closes.length - 1]
  const finished = finishIndicators([
    scoreEmaAlign(closes, price),
    scorePriceEma(closes, price),
    scoreMacd(closes),
    scoreRsi(closes),
    scoreAdx(candles),
    scoreBollinger(closes),
    scoreVolume(candles),
  ])
  if (finished.indicators.every((item) => !item.available)) return null
  return {
    id,
    label: INTERVAL_LABEL[id],
    weight: TF_WEIGHTS[id],
    effectiveWeight: TF_WEIGHTS[id],
    score: finished.score,
    signal: signalFromScore(finished.score),
    indicators: finished.indicators,
    renormNote: finished.renormNote,
  }
}

export function scoreMarket(candles: Partial<Record<IntervalId, Candle[]>>): CompositeScore | null {
  const frames = SCORE_INTERVALS.flatMap((id) => {
    const series = candles[id]
    if (!series) return []
    const frame = scoreTimeframe(series, id)
    return frame ? [frame] : []
  })
  if (frames.length === 0) return null
  const weightSum = frames.reduce((sum, frame) => sum + frame.weight, 0)
  const scored = frames.map((frame) => ({
    ...frame,
    effectiveWeight: weightSum > 0 ? frame.weight / weightSum : 0,
  }))
  const score = scored.reduce((sum, frame) => sum + frame.effectiveWeight * frame.score, 0)
  const missing = SCORE_INTERVALS.filter((id) => !scored.some((frame) => frame.id === id)).map((id) => INTERVAL_LABEL[id])
  return {
    score,
    signal: signalFromScore(score),
    frames: scored,
    renormNote: missing.length > 0 ? `缺少${missing.join('、')}，總分已用其餘週期重新加權。` : null,
  }
}
