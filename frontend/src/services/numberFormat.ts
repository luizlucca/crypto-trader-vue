const priceFormatters = new Map<number, Intl.NumberFormat>()

const compactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

const clockFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
})

function priceFormatter(precision: number): Intl.NumberFormat {
  const normalizedPrecision = Math.max(0, Math.min(precision, 8))
  let formatter = priceFormatters.get(normalizedPrecision)
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: Math.min(normalizedPrecision, 2),
      maximumFractionDigits: normalizedPrecision,
    })
    priceFormatters.set(normalizedPrecision, formatter)
  }
  return formatter
}

export function formatMarketPrice(value: number, precision: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '—'
  }
  return priceFormatter(precision).format(value)
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '—'
  }
  return compactFormatter.format(value)
}

export function formatMarketPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export function formatClockTime(timestamp: number): string {
  return clockFormatter.format(new Date(timestamp))
}
