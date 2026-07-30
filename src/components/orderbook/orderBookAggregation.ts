import type { OrderBookLevel } from '../../types/market'

export type OrderBookSide = 'ask' | 'bid'

const MAX_SAFE_PRECISION = 8

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  const normalized = value.toFixed(MAX_SAFE_PRECISION).replace(/0+$/, '')
  const decimalPoint = normalized.indexOf('.')
  return decimalPoint < 0 ? 0 : normalized.length - decimalPoint - 1
}

export function aggregationPrecision(step: number): number {
  return decimalPlaces(step)
}

export function formatAggregationStep(step: number): string {
  return step.toFixed(aggregationPrecision(step))
}

export function createAggregationOptions(
  tickSize: number,
  count = 4,
): number[] {
  if (!Number.isFinite(tickSize) || tickSize <= 0 || count <= 0) {
    return []
  }

  const precision = decimalPlaces(tickSize)
  const factor = 10 ** precision
  const nativeUnits = Math.max(1, Math.round(tickSize * factor))
  return Array.from(
    { length: count },
    (_, index) => (nativeUnits * (10 ** index)) / factor,
  )
}

export function aggregateOrderBookLevels(
  levels: readonly OrderBookLevel[],
  side: OrderBookSide,
  step: number,
  pricePrecision?: number,
): OrderBookLevel[] {
  if (!Number.isFinite(step) || step <= 0) {
    return levels.map((level) => ({ ...level }))
  }

  const precision = Math.min(
    MAX_SAFE_PRECISION,
    Number.isInteger(pricePrecision) && (pricePrecision ?? -1) >= 0
      ? Math.max(decimalPlaces(step), pricePrecision as number)
      : Math.max(
          decimalPlaces(step),
          ...levels.map((level) => decimalPlaces(level.price)),
        ),
  )
  const factor = 10 ** precision
  const stepUnits = Math.max(1, Math.round(step * factor))
  const quantitiesByPrice = new Map<number, number>()

  for (const level of levels) {
    if (
      !Number.isFinite(level.price)
      || !Number.isFinite(level.quantity)
      || level.price <= 0
      || level.quantity <= 0
    ) {
      continue
    }

    const priceUnits = Math.round(level.price * factor)
    const bucketUnits = side === 'bid'
      ? Math.floor(priceUnits / stepUnits) * stepUnits
      : Math.ceil(priceUnits / stepUnits) * stepUnits
    quantitiesByPrice.set(
      bucketUnits,
      (quantitiesByPrice.get(bucketUnits) ?? 0) + level.quantity,
    )
  }

  const prices = [...quantitiesByPrice.keys()].sort(
    side === 'bid'
      ? (left, right) => right - left
      : (left, right) => left - right,
  )
  let total = 0
  return prices.map((priceUnits) => {
    const quantity = quantitiesByPrice.get(priceUnits) ?? 0
    total += quantity
    return {
      price: priceUnits / factor,
      quantity,
      total,
    }
  })
}
