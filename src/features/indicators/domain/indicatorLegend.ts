import {
  plotColor,
  type AppliedIndicator,
} from './indicators'

/** Indicator data enriched with calculation state for chart presentation. */
export interface PresentedIndicator extends AppliedIndicator {
  calculated: boolean
  populatedPlots: readonly string[]
}

/** Static metadata for one coloured value in the contextual legend. */
export interface IndicatorLegendPlot {
  plotId: string
  title: string
  color: string
}

/**
 * Visible, drawable plots in catalog order.
 *
 * Before the first calculation the catalog is the best information available.
 * Afterwards only plots that actually produced data are shown — the SMA, for
 * example, declares optional smoothing bands that often remain empty.
 */
export function indicatorLegendPlots(
  entry: PresentedIndicator,
): IndicatorLegendPlot[] {
  const plots: IndicatorLegendPlot[] = []
  for (const plot of entry.definition.plots) {
    const style = entry.instance.styles[plot.id]
    if (!style?.visible) {
      continue
    }
    if (entry.calculated && !entry.populatedPlots.includes(plot.id)) {
      continue
    }
    plots.push({
      plotId: plot.id,
      title: plot.title || plot.id,
      color: plotColor(style),
    })
  }
  return plots
}
