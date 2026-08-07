import type {
  CandlestickData,
  CustomData,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '@shared/types/market'

export interface RoundedCandleData<HorzScaleItem = Time>
  extends CandlestickData<HorzScaleItem>, CustomData<HorzScaleItem> {}

/** A market candle as this series wants it: same numbers, no volume. */
export function candlePoint(candle: Candle): RoundedCandleData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }
}
