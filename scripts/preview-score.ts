import { loadMarket } from '../src/lib/api.ts'
import { scoreMarket } from '../src/lib/score.ts'
import { deriveLevels } from '../src/lib/levels.ts'
import { buildSummary } from '../src/lib/summary.ts'

const snapshot = await loadMarket()
const score = scoreMarket(snapshot.candles)
const levels = deriveLevels(snapshot.candles['1d'] ?? null, snapshot.candles['4h'] ?? null, snapshot.ticker.price)
const summary = score
  ? buildSummary({
      composite: score,
      fear: snapshot.fearGreed ? { value: snapshot.fearGreed.value, label: snapshot.fearGreed.label } : null,
      fundingRate: snapshot.funding?.rate ?? null,
      longPct: snapshot.longShort?.longPct ?? null,
      longShortSource: snapshot.longShort?.source ?? null,
    })
  : null

console.log(
  JSON.stringify(
    {
      ticker: snapshot.ticker,
      twd: snapshot.twd,
      candleCounts: Object.fromEntries(Object.entries(snapshot.candles).map(([id, rows]) => [id, rows?.length ?? 0])),
      candleSources: snapshot.candleSources,
      candleErrors: snapshot.candleErrors,
      score: score
        ? {
            score: score.score,
            signal: score.signal,
            renormNote: score.renormNote,
            frames: score.frames.map((frame) => ({
              id: frame.id,
              score: frame.score,
              signal: frame.signal,
              indicators: frame.indicators.map((item) => ({
                name: item.name,
                score: Number(item.score.toFixed(1)),
                signal: item.signal,
                reason: item.reason,
              })),
            })),
          }
        : null,
      summary,
      fear: snapshot.fearGreed,
      fearError: snapshot.fearError,
      funding: snapshot.funding,
      fundingError: snapshot.fundingError,
      oi: snapshot.openInterest,
      oiError: snapshot.oiError,
      longShort: snapshot.longShort,
      lsError: snapshot.lsError,
      global: snapshot.global,
      globalError: snapshot.globalError,
      levels,
    },
    null,
    2,
  ),
)
