import { computed, ref, shallowRef } from 'vue'
import type {
  AppliedIndicator,
  IndicatorDefinition,
  IndicatorInputs,
  IndicatorPlotStyle,
} from '@indicators/domain/indicators'
import {
  readIndicatorLayout,
  writeIndicatorLayout,
} from '@indicators/services/indicatorLayout'
import type {
  ChartIndicators,
} from '@indicators/composables/useChartIndicators'
import type { PresentedIndicator } from '@indicators/domain/indicatorLegend'

/**
 * The indicator side of the chart panel: what is applied, what is being
 * configured, and what the picker shows.
 *
 * Split out of `MarketChart.vue` because none of it is the hot path. Every
 * value here changes when the operator adds, removes or edits an indicator —
 * never on a tick and never on a pointer move. The values themselves reach the
 * screen through the imperative readout channel, which this file does not
 * touch (ADR-0003).
 */

export interface IndicatorPanelOptions {
  indicators: ChartIndicators
  /** Layout is stored per tab, so the session identifies it. */
  sessionId: () => string
}

export function useIndicatorPanel(options: IndicatorPanelOptions) {
  const { indicators } = options

  /**
   * Mirror of the applied indicators for the template only. The indicator data
   * path never touches it: the list changes when the user adds or removes one,
   * not when values update.
   */
  const applied = shallowRef<AppliedIndicator[]>([])
  /**
   * Changes only when the pointer enters or leaves an indicator series. Values
   * themselves bypass Vue through the imperative readout channel.
   */
  const hoveredId = shallowRef<string>()
  const pickerOpen = ref(false)
  const configuringId = ref<string | null>(null)
  /**
   * The instance whose settings are expanded inside the picker.
   *
   * It is already on the chart: choosing an indicator applies it. Collapsing
   * the accordion or closing the panel keeps it, because the chart has been
   * showing it since the click — and a gesture as ordinary as closing a panel
   * must never be what destroys it.
   */
  const editingId = ref<string | null>(null)

  /**
   * Low-frequency presentation metadata. `populatedRevision` inside the
   * indicators composable invalidates this only when a plot produces its first
   * data, never for realtime values or crosshair movement.
   */
  const presented = computed<PresentedIndicator[]>(() => (
    applied.value.map((entry) => {
      const instanceId = entry.instance.instanceId
      return {
        ...entry,
        calculated: indicators.hasCalculated(instanceId),
        populatedPlots: indicators.populatedPlots(instanceId),
      }
    })
  ))

  function find(instanceId: string | null): AppliedIndicator | undefined {
    if (!instanceId) {
      return undefined
    }
    return applied.value.find(
      (entry) => entry.instance.instanceId === instanceId,
    )
  }

  const configuring = computed(() => find(configuringId.value))
  // Normalised to null, not left undefined: the picker declares `editing` as a
  // required prop that is either an instance or null.
  const editing = computed(() => find(editingId.value) ?? null)
  const configuringCalculated = computed(() => configuring.value
    ? indicators.hasCalculated(configuring.value.instance.instanceId)
    : false)
  const configuringPopulatedPlots = computed(() => configuring.value
    ? indicators.populatedPlots(configuring.value.instance.instanceId)
    : [])
  const editingCalculated = computed(() => editing.value
    ? indicators.hasCalculated(editing.value.instance.instanceId)
    : false)
  const editingPopulatedPlots = computed(() => editing.value
    ? indicators.populatedPlots(editing.value.instance.instanceId)
    : [])

  /** Reads the applied list back and stores it as the tab's layout. */
  function sync(): void {
    applied.value = indicators.applied()
    writeIndicatorLayout(
      options.sessionId(),
      applied.value.map((entry) => entry.instance),
    )
  }

  /**
   * Reapplies what the tab had before the chart was rebuilt. Changing pair or
   * interval replaces the chart component, and without this the indicators
   * would be silently dropped along with it.
   */
  async function restoreLayout(): Promise<void> {
    const saved = readIndicatorLayout(options.sessionId())
    if (saved.length === 0) {
      return
    }
    const catalog = await indicators.catalog()
    const byId = new Map<string, IndicatorDefinition>()
    for (const definition of catalog) {
      byId.set(definition.id, definition)
    }
    for (const instance of saved) {
      const definition = byId.get(instance.definitionId)
      if (definition) {
        indicators.add(definition, instance.inputs, instance)
      }
    }
    sync()
  }

  /** Puts the indicator on the chart and expands its settings. */
  function add(definition: IndicatorDefinition): void {
    const instance = indicators.add(definition)
    if (instance) {
      editingId.value = instance.instanceId
      sync()
    }
  }

  function remove(instanceId: string): void {
    indicators.remove(instanceId)
    if (hoveredId.value === instanceId) {
      hoveredId.value = undefined
    }
    if (configuringId.value === instanceId) {
      configuringId.value = null
    }
    if (editingId.value === instanceId) {
      editingId.value = null
    }
    sync()
  }

  function applyInputs(instanceId: string, inputs: IndicatorInputs): void {
    indicators.updateInputs(instanceId, inputs)
    sync()
  }

  function applyStyles(
    instanceId: string,
    styles: Record<string, IndicatorPlotStyle>,
  ): void {
    indicators.updateStyles(instanceId, styles)
    sync()
  }

  function catalog(): Promise<IndicatorDefinition[]> {
    return indicators.catalog()
  }

  function openPicker(): void {
    pickerOpen.value = true
  }

  function closePicker(): void {
    editingId.value = null
    pickerOpen.value = false
  }

  /** Collapses the settings. The indicator stays exactly as it is. */
  function collapseEditing(): void {
    editingId.value = null
  }

  function removeEditing(): void {
    if (editingId.value) {
      remove(editingId.value)
    }
  }

  function editingInputs(inputs: IndicatorInputs): void {
    if (editingId.value) {
      applyInputs(editingId.value, inputs)
    }
  }

  function editingStyles(styles: Record<string, IndicatorPlotStyle>): void {
    if (editingId.value) {
      applyStyles(editingId.value, styles)
    }
  }

  function previewReadout(instanceId: string): void {
    indicators.previewReadout(instanceId)
  }

  return {
    applied,
    presented,
    hoveredId,
    pickerOpen,
    configuringId,
    editingId,
    configuring,
    editing,
    configuringCalculated,
    configuringPopulatedPlots,
    editingCalculated,
    editingPopulatedPlots,

    sync,
    restoreLayout,
    catalog,
    add,
    remove,
    removeEditing,
    applyInputs,
    applyStyles,
    openPicker,
    closePicker,
    collapseEditing,
    editingInputs,
    editingStyles,
    previewReadout,
  }
}
