import { formatNumber } from './format.ts'

export function fearLabelFromValue(value: number): string {
  if (value <= 24) return '極度恐懼'
  if (value <= 46) return '恐懼'
  if (value <= 54) return '中性'
  if (value <= 74) return '貪婪'
  return '極度貪婪'
}

const FEAR_FROM_API: Record<string, string> = {
  'Extreme Fear': '極度恐懼',
  Fear: '恐懼',
  Neutral: '中性',
  Greed: '貪婪',
  'Extreme Greed': '極度貪婪',
}

export function fearLabel(value: number, apiClass?: string): string {
  if (apiClass && FEAR_FROM_API[apiClass]) return FEAR_FROM_API[apiClass]
  return fearLabelFromValue(value)
}

export function fearNote(value: number, label: string): string {
  if (value <= 24) return `指數 ${value}，市場情緒是極度恐懼，通常出現在急跌之後。`
  if (value >= 75) return `指數 ${value}，市場情緒是極度貪婪，追價的人變多。`
  return `指數 ${value}，情緒屬於${label}。`
}

export function fundingNote(rate: number): string {
  const pct = rate * 100
  if (pct >= 0.05) return '資金費率明顯偏高，永續多單偏擁擠，多頭付錢給空頭。'
  if (pct >= 0.01) return '資金費率為正，多頭付錢給空頭。'
  if (pct > -0.01) return '資金費率接近零，多空支付大致平衡。'
  if (pct > -0.05) return '資金費率為負，空頭付錢給多頭。'
  return '資金費率明顯偏負，永續空單偏擁擠。'
}

export function longShortNote(longPct: number): string {
  const longText = formatNumber(longPct, 1)
  const shortText = formatNumber(100 - longPct, 1)
  if (longPct >= 70) return `多單帳戶約 ${longText}%、空單約 ${shortText}%，部位明顯擠在多方。`
  if (longPct >= 58) return `多單帳戶約 ${longText}%，略多於空單。`
  if (longPct <= 30) return `空單帳戶約 ${shortText}%、多單約 ${longText}%，部位明顯擠在空方。`
  if (longPct <= 42) return `空單帳戶略多，多單約 ${longText}%。`
  return `多空帳戶接近，多單約 ${longText}%。`
}

export function dominanceNote(dominance: number): string {
  if (dominance >= 60) return '占比偏高，資金相對集中在比特幣。'
  if (dominance >= 50) return '比特幣仍占全市場一半以上。'
  return '占比不到一半，資金分散在其他幣。'
}
