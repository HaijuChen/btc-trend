import assert from 'node:assert/strict'
import { INDICATOR_WEIGHTS, SCORE_BAND, TF_WEIGHTS } from '../src/config.ts'
import { deriveLevels, findPivots } from '../src/lib/levels.ts'
import { ema } from '../src/lib/math.ts'
import { labelFor, scoreMarket, signalFromScore } from '../src/lib/score.ts'
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

console.log('selfcheck ok', { bull: bull?.score, bear: bear?.score, flat: flat?.score })
