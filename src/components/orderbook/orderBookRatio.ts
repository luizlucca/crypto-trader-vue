import type { OrderBookLevel } from '../../types/market'

export interface OrderBookRatio {
  buyPercent: number
  sellPercent: number
}

function visibleQuantity(
  levels: OrderBookLevel[],
  levelCount: number,
): number {
  let quantity = 0
  const count = Math.min(levelCount, levels.length)
  for (let index = 0; index < count; index += 1) {
    const value = levels[index].quantity
    if (Number.isFinite(value) && value > 0) {
      quantity += value
    }
  }
  return quantity
}

export function calculateOrderBookRatio(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
  levelCount: number,
): OrderBookRatio | null {
  const buyQuantity = visibleQuantity(bids, levelCount)
  const sellQuantity = visibleQuantity(asks, levelCount)
  const totalQuantity = buyQuantity + sellQuantity
  if (totalQuantity <= 0) {
    return null
  }
  const buyPercent = (buyQuantity / totalQuantity) * 100
  return {
    buyPercent,
    sellPercent: 100 - buyPercent,
  }
}
