import assert from 'node:assert/strict'
import { INDICATOR_WEIGHTS, SCORE_BAND, TF_WEIGHTS } from '../src/config.ts'
import { deriveLevels, findPivots } from '../src/lib/levels.ts'
import { ema } from '../src/lib/math.ts'
import { labelFor, scoreMarket, signalFromScore } from '../src/lib/score.ts'
import { analyzeStrategy, donchian, liveFilter, replayClosed, wilderAtr, type Side, type StopAudit } from '../src/lib/strategy.ts'
import type { Candle } from '../src/types.ts'

const emaValues = ema([1, 2, 3, 4, 5, 6], 3)
assert.equal(emaValues[0], null)
assert.equal(emaValues[1], null)
assert.ok(Math.abs((emaValues[2] ?? 0) - 2) < 1e-9)
assert.ok(Math.abs((emaValues[5] ?? 0) - 5) < 1e-9)

const indicatorWeight = Object.values(INDICATOR_WEIGHTS).reduce((sum, value) => sum + value, 0)
const timeframeWeight = Object.values(TF_WEIGHTS).reduce((sum, value) => sum + value, 0)
assert.ok(Math.abs(indicatorWeight - 1) < 1e-9)
assert.ok(Math.abs(timeframeWeight - 1) < 1e-9)

assert.equal(signalFromScore(SCORE_BAND.strong), 'bull')
assert.equal(signalFromScore(SCORE_BAND.lean), 'lean-bull')
assert.equal(signalFromScore(0), 'neutral')
assert.equal(signalFromScore(-SCORE_BAND.lean), 'lean-bear')
assert.equal(signalFromScore(-SCORE_BAND.strong), 'bear')
assert.equal(labelFor('bull', 'composite'), '強烈多頭')
assert.equal(labelFor('bear', 'indicator'), '空頭')

function series(direction: 1 | -1 | 0): Candle[] {
  return Array.from({ length: 260 }, (_, index) => {
    const close = direction === 0 ? 200 : 400 + direction * index
    const previous = direction === 0 ? 200 : 400 + direction * (index - 1)
    const open = index === 0 ? close : previous
    return {
      time: 1_700_000_000 + index * 3600,
      open,
      high: Math.max(open, close) + 0.4,
      low: Math.min(open, close) - 0.4,
      close,
      volume: 100 + index,
    }
  })
}

const bull = scoreMarket({ '1w': series(1), '1d': series(1), '4h': series(1) })
const bear = scoreMarket({ '1w': series(-1), '1d': series(-1), '4h': series(-1) })
const flat = scoreMarket({ '1w': series(0), '1d': series(0), '4h': series(0) })
assert.ok(bull && bull.score > SCORE_BAND.strong, `bull score ${bull?.score}`)
assert.equal(bull && labelFor(bull.signal, 'composite'), '強烈多頭')
assert.ok(bear && bear.score < -SCORE_BAND.strong, `bear score ${bear?.score}`)
assert.equal(bear && labelFor(bear.signal, 'composite'), '強烈空頭')
assert.ok(flat && Math.abs(flat.score) < SCORE_BAND.lean, `flat score ${flat?.score}`)

const zigzag: Candle[] = Array.from({ length: 40 }, (_, index) => {
  const high = index === 20 ? 150 : 110
  const low = index === 10 ? 70 : 95
  return {
    time: 1_700_000_000 + index * 86_400,
    open: 100,
    high,
    low,
    close: 100,
    volume: 10,
  }
})
const pivots = findPivots(zigzag, 3, 3)
assert.ok(pivots.highs.some((item) => item.price === 150))
assert.ok(pivots.lows.some((item) => item.price === 70))
const levels = deriveLevels(zigzag, null, 100)
assert.ok(levels.some((level) => level.side === 'resistance' && level.price > 100))
assert.ok(levels.some((level) => level.side === 'support' && level.price < 100))

function bar(index: number, open: number, high: number, low: number, close: number): Candle {
  return { time: 1_700_000_000 + index * 14_400, open, high, low, close, volume: 1 }
}

const atrCandles = Array.from({ length: 16 }, (_, index) => bar(index, 100, 102, 98, 100))
const atrLine = wilderAtr(atrCandles)
assert.equal(atrLine[13], null)
assert.equal(atrLine[14], 4)
assert.equal(atrLine[15], 4)

const channelCandles = Array.from({ length: 41 }, (_, index) => bar(index, 9, index === 40 ? 999 : 10, index === 40 ? 1 : 8, 9))
const channel = donchian(channelCandles)
assert.equal(channel.hh[39], null)
assert.equal(channel.hh[40], 10)
assert.equal(channel.ll[40], 8)

function assertStopNeverLoosens(audits: StopAudit[]) {
  const groups = new Map<string, StopAudit[]>()
  for (const audit of audits) {
    const key = `${audit.side}:${audit.entryTime}`
    const list = groups.get(key) ?? []
    list.push(audit)
    groups.set(key, list)
  }
  for (const list of groups.values()) {
    for (let index = 1; index < list.length; index += 1) {
      const prev = list[index - 1]
      const current = list[index]
      if (current.side === 'long') assert.ok(current.stop >= prev.stop - 1e-9, `long stop loosened ${prev.stop} -> ${current.stop}`)
      else assert.ok(current.stop <= prev.stop + 1e-9, `short stop loosened ${prev.stop} -> ${current.stop}`)
    }
  }
}

const gapSeries: Candle[] = []
for (let index = 0; index < 60; index += 1) gapSeries.push(bar(index, 100, 101, 99, 100))
gapSeries.push(bar(60, 100, 110, 100, 108))
gapSeries.push(bar(61, 108, 108, 107, 108))
gapSeries.push(bar(62, 90, 92, 88, 89))
const gapReplay = replayClosed(gapSeries)
assertStopNeverLoosens(gapReplay.audits)
assert.equal(gapReplay.trades.length, 1)
const stopped = gapReplay.trades[0]
assert.equal(stopped.side, 'long')
assert.equal(stopped.reason, 'stop')
assert.equal(stopped.entryPrice, 108)
assert.equal(stopped.entryTime, gapSeries[61].time)
assert.equal(stopped.exitPrice, 90)
assert.equal(stopped.exitTime, gapSeries[62].time)
const stop61 = gapReplay.audits.find((item) => item.index === 61)
const stop62 = gapReplay.audits.find((item) => item.index === 62)
const gapAtr = wilderAtr(gapSeries)
assert.ok(stop61 && stop62)
assert.ok(gapAtr[62] != null && gapAtr[61] != null)
const loosenCandidate = 108 - 3 * gapAtr[62]!
assert.ok(loosenCandidate < stop61.stop)
assert.ok(Math.abs(stop62.stop - stop61.stop) < 1e-9)
assert.ok(stopped.rMultiple < 0)

const reverseSeries: Candle[] = []
for (let index = 0; index < 21; index += 1) reverseSeries.push(bar(index, 100, 200, 50, 100))
for (let index = 21; index < 70; index += 1) reverseSeries.push(bar(index, 141, 142, 140, 141))
reverseSeries.push(bar(70, 141, 160, 141, 160))
reverseSeries.push(bar(71, 150, 151, 149, 150))
reverseSeries.push(bar(72, 150, 151, 140, 149))
reverseSeries.push(bar(73, 149, 149, 135, 135))
reverseSeries.push(bar(74, 138, 140, 137, 138))
reverseSeries.push(bar(75, 500, 520, 490, 510))
const reverseReplay = replayClosed(reverseSeries)
assertStopNeverLoosens(reverseReplay.audits)
assert.equal(reverseReplay.trades.length, 2)
const flipped = reverseReplay.trades[0]
assert.equal(flipped.side, 'long')
assert.equal(flipped.reason, 'reverse')
assert.equal(flipped.entryPrice, 150)
assert.equal(flipped.entryTime, reverseSeries[71].time)
assert.equal(flipped.exitPrice, 138)
assert.equal(flipped.exitTime, reverseSeries[74].time)
const shortStop = reverseReplay.trades[1]
assert.equal(shortStop.side, 'short')
assert.equal(shortStop.reason, 'stop')
assert.equal(shortStop.entryPrice, 138)
assert.equal(shortStop.exitPrice, 500)
assert.equal(reverseReplay.position, null)
const stop71 = reverseReplay.audits.find((item) => item.index === 71)
const stop72 = reverseReplay.audits.find((item) => item.index === 72)
const reverseAtr = wilderAtr(reverseSeries)
assert.ok(stop71 && stop72)
assert.ok(reverseAtr[72]! > reverseAtr[71]!)
assert.ok(Math.abs(stop72.stop - stop71.stop) < 1e-9)
assert.ok(reverseReplay.markers.some((marker) => marker.kind === 'entry' && marker.side === 'long'))
assert.ok(reverseReplay.markers.some((marker) => marker.kind === 'reverse' && marker.side === 'short'))

const closedOnly = gapSeries.slice(0, 61)
const forming = bar(61, 108, 500, 107, 130)
const formingNow = forming.time + 60
const projected = analyzeStrategy([...closedOnly, forming], formingNow)
assert.equal(projected.closedCount, 61)
assert.equal(projected.forming?.time, forming.time)
assert.equal(projected.filledOnForming, true)
assert.equal(projected.position?.side, 'long')
assert.equal(projected.position?.entryPrice, 108)
assert.equal(projected.position?.barsHeld, 0)
const signalAtr = wilderAtr(closedOnly)[60]
assert.ok(signalAtr != null)
assert.ok(Math.abs((projected.position?.stop ?? 0) - (108 - 3 * signalAtr)) < 1e-9)
assert.equal(projected.formingTouchedStop, false)

const inside = liveFilter(
  {
    position: {
      side: 'long' as Side,
      entryPrice: 100,
      entryTime: 1,
      stop: 90,
      ext: 100,
      atrAtEntry: 10,
      barsHeld: 0,
      signalTime: 1,
      trigger: 100,
      fresh: true,
    },
    pending: null,
    lastClosedTime: 1,
  },
  105,
)
const skipped = liveFilter(
  {
    position: {
      side: 'long' as Side,
      entryPrice: 100,
      entryTime: 1,
      stop: 90,
      ext: 100,
      atrAtEntry: 10,
      barsHeld: 0,
      signalTime: 1,
      trigger: 100,
      fresh: true,
    },
    pending: null,
    lastClosedTime: 1,
  },
  105.1,
)
const stale = liveFilter(
  {
    position: {
      side: 'short' as Side,
      entryPrice: 100,
      entryTime: 1,
      stop: 110,
      ext: 100,
      atrAtEntry: 10,
      barsHeld: 4,
      signalTime: 1,
      trigger: 100,
      fresh: false,
    },
    pending: null,
    lastClosedTime: 2,
  },
  90,
)
assert.equal(inside.state, 'inside')
assert.equal(skipped.state, 'skip')
assert.equal(stale.state, 'no-fresh')

console.log('selfcheck ok', { bull: bull?.score, bear: bear?.score, flat: flat?.score, trades: gapReplay.trades.length + reverseReplay.trades.length })
