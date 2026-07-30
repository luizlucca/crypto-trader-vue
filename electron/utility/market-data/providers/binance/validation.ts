const supportedIntervals = new Set([
  '1s',
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
])

export function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase()
  if (
    normalized.length < 5
    || normalized.length > 20
    || !/^[A-Z0-9]+$/.test(normalized)
  ) {
    throw new Error(`Símbolo inválido: ${symbol}`)
  }
  return normalized
}

export function validateInterval(interval: string): void {
  if (!supportedIntervals.has(interval)) {
    throw new Error(`Intervalo de candle não suportado: ${interval}`)
  }
}

export function validateCandleLimit(limit: number): number {
  const normalized = Math.trunc(limit)
  if (normalized < 1 || normalized > 1000) {
    throw new Error('O limite de candles deve estar entre 1 e 1000')
  }
  return normalized
}
