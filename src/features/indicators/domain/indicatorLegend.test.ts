import { describe, expect, it } from 'vitest'
import type { IndicatorDefinition, IndicatorInstance } from './indicators'
import {
  indicatorLegendPlots,
  type PresentedIndicator,
} from './indicatorLegend'

const definition: IndicatorDefinition = {
  id: 'rsi',
  name: 'Relative Strength Index',
  shortName: 'RSI',
  description: '',
  category: 'Oscillators',
  overlay: false,
  group: 'standard',
  inputs: [],
  plots: [
    { id: 'rsi', title: 'RSI' },
    { id: 'average', title: 'RSI-based MA' },
    { id: 'hidden', title: 'Hidden' },
  ],
  hlines: [],
  defaults: {},
}

const instance: IndicatorInstance = {
  instanceId: 'rsi-one',
  definitionId: definition.id,
  inputs: {},
  styles: {
    rsi: {
      color: '#7e57c2', lineWidth: 2, opacity: 1, visible: true,
    },
    average: {
      color: '#fdd835', lineWidth: 1, opacity: 0.5, visible: true,
    },
    hidden: {
      color: '#ff0000', lineWidth: 1, opacity: 1, visible: false,
    },
  },
}

function presented(
  patch: Partial<PresentedIndicator> = {},
): PresentedIndicator {
  return {
    definition,
    instance,
    calculated: true,
    populatedPlots: ['rsi', 'average', 'hidden'],
    ...patch,
  }
}

describe('indicator coloured legend', () => {
  it('uses configured plot colours and opacity', () => {
    expect(indicatorLegendPlots(presented())).toEqual([
      { plotId: 'rsi', title: 'RSI', color: '#7e57c2' },
      {
        plotId: 'average',
        title: 'RSI-based MA',
        color: 'rgba(253, 216, 53, 0.50)',
      },
    ])
  })

  it('omits visible plots that did not produce data', () => {
    expect(indicatorLegendPlots(presented({
      populatedPlots: ['rsi'],
    })).map((plot) => plot.plotId)).toEqual(['rsi'])
  })

  it('uses visible catalog plots until the first calculation arrives', () => {
    expect(indicatorLegendPlots(presented({
      calculated: false,
      populatedPlots: [],
    })).map((plot) => plot.plotId)).toEqual(['rsi', 'average'])
  })
})
