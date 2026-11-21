import { labelFor, toneOf, type CompositeScore } from './score.ts'

export function buildSummary(input: {
  composite: CompositeScore
  fear: { value: number; label: string } | null
  fundingRate: number | null
  longPct: number | null
  longShortSource: string | null
}): string[] {
  const { composite, fear, fundingRate, longPct, longShortSource } = input
  const verdict = labelFor(composite.signal, 'composite')
  const scoreText = formatScore(composite.score)
  const parts = [`綜合週線、日線與四小時，分數 ${scoreText}，判定為${verdict}。`]

  const sides = composite.frames.map((frame) => toneOf(frame.signal))
  if (composite.frames.length >= 2 && sides.every((side) => side === 'bull')) {
    parts.push('看得到的週期都站在多方，方向一致。')
  } else if (composite.frames.length >= 2 && sides.every((side) => side === 'bear')) {
    parts.push('看得到的週期都站在空方，方向一致。')
  } else if (sides.every((side) => side === 'neutral')) {
    parts.push('這些週期都接近中性，趨勢不明顯。')
  } else {
    const bits = composite.frames.map((frame) => `${frame.label}${labelFor(frame.signal, 'composite')}`)
    parts.push(`週期沒有對齊：${bits.join('、')}。`)
  }

  const direction = composite.score >= 15 ? 1 : composite.score <= -15 ? -1 : 0
  let best: { text: string; impact: number } | null = null
  for (const frame of composite.frames) {
    for (const indicator of frame.indicators) {
      if (!indicator.available) continue
      const contribution = frame.effectiveWeight * indicator.effectiveWeight * indicator.score
      const impact = direction === 0 ? Math.abs(contribution) : contribution * direction
      if (!best || impact > best.impact) {
        best = { text: `對總分影響最大的是${frame.label}「${indicator.name}」。${indicator.reason}`, impact }
      }
    }
  }
  if (best) parts.push(best.text)

  const context: string[] = []
  if (fear) context.push(`恐懼與貪婪指數 ${fear.value}（${fear.label}）`)
  if (longPct != null && (longPct >= 65 || longPct <= 40)) {
    const who = longShortSource ? `${longShortSource}多單帳戶` : '合約多單帳戶'
    context.push(`${who}約 ${Math.round(longPct)}%`)
  }
  if (fundingRate != null && Math.abs(fundingRate) >= 0.0001) {
    context.push(fundingRate > 0 ? '資金費率為正' : '資金費率為負')
  }
  if (context.length > 0) parts.push(`${context.join('，')}。`)
  parts.push('這是趨勢狀態的描述，不是進出場訊號。')
  return parts
}

function formatScore(score: number): string {
  const body = Math.abs(score).toFixed(1)
  if (score > 0) return `+${body}`
  if (score < 0) return `−${body}`
  return '0.0'
}
