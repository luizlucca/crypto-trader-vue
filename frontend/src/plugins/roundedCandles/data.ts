import type {
  CandlestickData,
  CustomData,
  Time,
} from 'lightweight-charts'

export interface RoundedCandleData<HorzScaleItem = Time>
  extends CandlestickData<HorzScaleItem>, CustomData<HorzScaleItem> {}
