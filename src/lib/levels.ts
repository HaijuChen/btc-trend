import type { Candle } from '../types.ts'

export type PriceLevel = {
  id: string
  price: number
  side: 'support' | 'resistance'
  distancePct: number
  label: string
  touches: number
}

type Swing = {
  price: number
  time: number
  kind: 'high' | 'low'
  source: '日線' | '4 小時'
}

export function findPivots(candles: Candle[], left: number, right: number): { highs: Swing[]; lows: Swing[] } {
  const highs: Swing[] = []
  const lows: Swing[] = []
  for (let i = left; i < candles.length - right; i += 1) {
    let isHigh = true
    let isLow = true
    for (let j = i - left; j <= i + right; j += 1) {
      if (j === i) continue
      if (candles[j].high >= candles[i].high) isHigh = false
      if (candles[j].low <= candles[i].low) isLow = false
      if (!isHigh && !isLow) break
    }
    if (isHigh) highs.push({ price: candles[i].high, time: candles[i].time, kind: 'high', source: '日線' })
    if (isLow) lows.push({ price: candles[i].low, time: candles[i].time, kind: 'low', source: '日線' })
  }
  return { highs, lows }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function cluster(swings: Swing[], tolerance: number): Swing[][] {
  const sorted = [...swings].sort((a, b) => a.price - b.price)
  const groups: Swing[][] = []
  for (const swing of sorted) {
    const current = groups[groups.length - 1]
    if (!current) {
      groups.push([swing])
      continue
    }
    const mean = current.reduce((sum, item) => sum + item.price, 0) / current.length
    if (Math.abs(swing.price - mean) / mean <= tolerance) current.push(swing)
    else groups.push([swing])
  }
  return groups
}

function formatTouchDate(seconds: number): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(seconds * 1000))
}

function addWindowExtreme(
  levels: Array<{ price: number; kind: 'high' | 'low'; touches: number; label: string }>,
  candles: Candle[] | null,
  lookback: number,
  highLabel: string,
  lowLabel: string,
  price: number,
) {
  if (!candles || candles.length === 0) return
  const slice = candles.slice(-lookback)
  let high = slice[0]
  let low = slice[0]
  for (const candle of slice) {
    if (candle.high > high.high) high = candle
    if (candle.low < low.low) low = candle
  }
  const near = (value: number) => levels.some((level) => Math.abs(level.price - value) / value < 0.006)
  if (high.high > price * 1.001 && !near(high.high)) {
    levels.push({
      price: high.high,
      kind: 'high',
      touches: 1,
      label: `${highLabel} · ${formatTouchDate(high.time)}`,
    })
  }
  if (low.low < price * 0.999 && !near(low.low)) {
    levels.push({
      price: low.low,
      kind: 'low',
      touches: 1,
      label: `${lowLabel} · ${formatTouchDate(low.time)}`,
    })
  }
}

function labelFor(group: Swing[], kind: 'high' | 'low'): string {
  const source = group.some((item) => item.source === '日線') ? '日線' : '4 小時'
  const latest = group.reduce((best, item) => (item.time > best.time ? item : best), group[0])
  const side = kind === 'high' ? '擺動高點' : '擺動低點'
  const count = group.length > 1 ? ` · ${group.length} 次` : ''
  return `${source}${side} · ${formatTouchDate(latest.time)}${count}`
}

function pushExtreme(swings: Swing[], candles: Candle[], source: '日線' | '4 小時', lookback: number) {
  const slice = candles.slice(-lookback)
  if (slice.length === 0) return
  let high = slice[0]
  let low = slice[0]
  for (const candle of slice) {
    if (candle.high > high.high) high = candle
    if (candle.low < low.low) low = candle
  }
  swings.push({ price: high.high, time: high.time, kind: 'high', source })
  swings.push({ price: low.low, time: low.time, kind: 'low', source })
}

export function deriveLevels(daily: Candle[] | null, h4: Candle[] | null, price: number): PriceLevel[] {
  if (!Number.isFinite(price) || price <= 0) return []
  const swings: Swing[] = []
  if (daily && daily.length > 20) {
    const recent = daily.slice(-180)
    const pivots = findPivots(recent, 5, 3)
    for (const swing of [...pivots.highs, ...pivots.lows]) swings.push({ ...swing, source: '日線' })
    pushExtreme(swings, recent, '日線', 30)
  }
  if (h4 && h4.length > 30) {
    const recent = h4.slice(-180)
    const pivots = findPivots(recent, 8, 4)
    for (const swing of [...pivots.highs, ...pivots.lows]) swings.push({ ...swing, source: '4 小時' })
  }
  const unique = new Map<string, Swing>()
  for (const swing of swings) {
    const key = `${swing.kind}:${swing.time}:${swing.price}`
    const previous = unique.get(key)
    if (!previous || swing.source === '日線') unique.set(key, swing)
  }
  const cleaned = [...unique.values()]
  if (cleaned.length === 0) return []

  const grouped = [
    ...cluster(
      cleaned.filter((item) => item.kind === 'high'),
      0.008,
    ),
    ...cluster(
      cleaned.filter((item) => item.kind === 'low'),
      0.008,
    ),
  ]
  const drafted = grouped.map((group) => {
    const kind = group[0].kind
    const levelPrice = median(group.map((item) => item.price))
    return {
      price: levelPrice,
      kind,
      touches: group.length,
      label: labelFor(group, kind),
    }
  })

  addWindowExtreme(drafted, daily, 8, '近 8 日高點', '近 8 日低點', price)
  addWindowExtreme(drafted, h4, 18, '近 3 日高點', '近 3 日低點', price)

  const resistances = drafted
    .filter((level) => level.kind === 'high' && level.price > price * 1.001)
    .sort((a, b) => a.price - b.price)
  const supports = drafted
    .filter((level) => level.kind === 'low' && level.price < price * 0.999)
    .sort((a, b) => b.price - a.price)

  const pick = <T extends { price: number }>(levels: T[]) => {
    const near = levels.filter((level) => Math.abs(level.price - price) / price <= 0.18)
    return (near.length > 0 ? near : levels).slice(0, 3)
  }

  const chosen = [...pick(resistances), ...pick(supports)]
  return chosen
    .map((level, index) => {
      const distancePct = ((level.price - price) / price) * 100
      const close = Math.abs(distancePct) < 0.35
      return {
        id: `${level.kind}-${index}-${level.price.toFixed(1)}`,
        price: level.price,
        side: level.price > price ? 'resistance' : 'support',
        distancePct,
        label: close ? `${level.label} · 價格貼近` : level.label,
        touches: level.touches,
      } satisfies PriceLevel
    })
    .sort((a, b) => b.price - a.price)
}
