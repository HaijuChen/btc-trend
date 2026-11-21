/** Wilder / TradingView-style indicators. Null means not enough history yet. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: values.length }, () => null)
  if (period < 1 || values.length < period) return out
  const k = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i += 1) sum += values[i]
  let prev = sum / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: values.length }, () => null)
  if (period < 1 || values.length < period) return out
  let sum = 0
  for (let i = 0; i < period; i += 1) sum += values[i]
  out[period - 1] = sum / period
  for (let i = period; i < values.length; i += 1) {
    sum += values[i] - values[i - period]
    out[i] = sum / period
  }
  return out
}

export function rsi(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: closes.length }, () => null)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1]
    if (change >= 0) gain += change
    else loss -= change
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  const toRsi = (g: number, l: number) => {
    if (g === 0 && l === 0) return 50
    if (l === 0) return 100
    if (g === 0) return 0
    return 100 - 100 / (1 + g / l)
  }
  out[period] = toRsi(avgGain, avgLoss)
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1]
    const g = change > 0 ? change : 0
    const l = change < 0 ? -change : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = toRsi(avgGain, avgLoss)
  }
  return out
}

export type MacdSeries = {
  macd: Array<number | null>
  signal: Array<number | null>
  hist: Array<number | null>
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries {
  const fastEma = ema(closes, fast)
  const slowEma = ema(closes, slow)
  const macdLine: Array<number | null> = closes.map((_, index) => {
    const fastValue = fastEma[index]
    const slowValue = slowEma[index]
    if (fastValue == null || slowValue == null) return null
    return fastValue - slowValue
  })
  const compact: number[] = []
  const indexes: number[] = []
  macdLine.forEach((value, index) => {
    if (value == null) return
    compact.push(value)
    indexes.push(index)
  })
  const signalCompact = ema(compact, signalPeriod)
  const signal: Array<number | null> = macdLine.map(() => null)
  const hist: Array<number | null> = macdLine.map(() => null)
  signalCompact.forEach((value, index) => {
    if (value == null) return
    const dest = indexes[index]
    signal[dest] = value
    hist[dest] = macdLine[dest]! - value
  })
  return { macd: macdLine, signal, hist }
}

export type DmiSeries = {
  plusDI: Array<number | null>
  minusDI: Array<number | null>
  adx: Array<number | null>
}

function rma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array.from({ length: values.length }, () => null)
  if (values.length < period) return out
  let sum = 0
  for (let i = 0; i < period; i += 1) sum += values[i]
  let prev = sum / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i += 1) {
    prev = (prev * (period - 1) + values[i]) / period
    out[i] = prev
  }
  return out
}

export function dmi(high: number[], low: number[], close: number[], period = 14): DmiSeries {
  const plusDI: Array<number | null> = Array.from({ length: close.length }, () => null)
  const minusDI: Array<number | null> = Array.from({ length: close.length }, () => null)
  const adx: Array<number | null> = Array.from({ length: close.length }, () => null)
  if (close.length < period + 2) return { plusDI, minusDI, adx }

  const tr: number[] = []
  const plusDm: number[] = []
  const minusDm: number[] = []
  for (let i = 1; i < close.length; i += 1) {
    const up = high[i] - high[i - 1]
    const down = low[i - 1] - low[i]
    plusDm.push(up > down && up > 0 ? up : 0)
    minusDm.push(down > up && down > 0 ? down : 0)
    tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])))
  }

  const trSmooth = rma(tr, period)
  const plusSmooth = rma(plusDm, period)
  const minusSmooth = rma(minusDm, period)
  const dx: number[] = []
  const dxIndex: number[] = []
  for (let i = 0; i < tr.length; i += 1) {
    const trValue = trSmooth[i]
    const plusValue = plusSmooth[i]
    const minusValue = minusSmooth[i]
    if (trValue == null || plusValue == null || minusValue == null) continue
    const dest = i + 1
    if (trValue === 0) {
      plusDI[dest] = 0
      minusDI[dest] = 0
      continue
    }
    const plus = (100 * plusValue) / trValue
    const minus = (100 * minusValue) / trValue
    plusDI[dest] = plus
    minusDI[dest] = minus
    const denom = plus + minus
    if (denom === 0) continue
    dx.push((100 * Math.abs(plus - minus)) / denom)
    dxIndex.push(dest)
  }
  const adxSmooth = rma(dx, period)
  adxSmooth.forEach((value, index) => {
    if (value == null) return
    adx[dxIndex[index]] = value
  })
  return { plusDI, minusDI, adx }
}

export type BollingerPoint = {
  middle: number
  upper: number
  lower: number
  percentB: number
  bandwidth: number
}

export function bollinger(closes: number[], period = 20, mult = 2): Array<BollingerPoint | null> {
  const out: Array<BollingerPoint | null> = Array.from({ length: closes.length }, () => null)
  if (closes.length < period) return out
  for (let i = period - 1; i < closes.length; i += 1) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j += 1) sum += closes[j]
    const middle = sum / period
    let variance = 0
    for (let j = i - period + 1; j <= i; j += 1) {
      const delta = closes[j] - middle
      variance += delta * delta
    }
    const sd = Math.sqrt(variance / period)
    const upper = middle + mult * sd
    const lower = middle - mult * sd
    const width = upper - lower
    const percentB = width === 0 ? 0.5 : (closes[i] - lower) / width
    const bandwidth = middle === 0 ? 0 : width / middle
    out[i] = { middle, upper, lower, percentB, bandwidth }
  }
  return out
}

export function lastDefined<T>(values: Array<T | null>, fromEnd = 0): T | null {
  let remaining = fromEnd
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i]
    if (value == null) continue
    if (remaining === 0) return value
    remaining -= 1
  }
  return null
}
