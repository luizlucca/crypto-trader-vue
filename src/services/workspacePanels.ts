import { readonly, ref } from 'vue'

/**
 * Which side panels the workspace is showing.
 *
 * Hiding one is not a cosmetic preference: the chart is where the decision is
 * made, and on a laptop the market list and the order book together take more
 * than a third of the width. The state is persisted because a trader who chose
 * to work full-chart expects to find it that way tomorrow.
 *
 * Module-level like the theme, and for the same reason: it is one workspace
 * layout shared by every component that reacts to it — the panels that hide
 * themselves and the toolbar that offers them back. Passing it down would mean
 * threading props through the chart, which is the one component that should
 * carry as little as possible.
 *
 * Reactive on purpose: unlike the candle and order-book data paths, this
 * changes when a person clicks, not when the market moves.
 */

const MARKET_KEY = 'cryptopro.panel.market.v1'
const ORDER_BOOK_KEY = 'cryptopro.panel.order-book.v1'

/** Anything other than a stored `'hidden'` means visible, including no value. */
function readStored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== 'hidden'
  } catch {
    return true
  }
}

function persist(key: string, visible: boolean): void {
  try {
    window.localStorage.setItem(key, visible ? 'visible' : 'hidden')
  } catch {
    // Storage can be unavailable; the layout still works for this session.
  }
}

const marketState = ref(readStored(MARKET_KEY))
const orderBookState = ref(readStored(ORDER_BOOK_KEY))

export const marketPanelVisible = readonly(marketState)
export const orderBookPanelVisible = readonly(orderBookState)

export function setMarketPanelVisible(visible: boolean): void {
  marketState.value = visible
  persist(MARKET_KEY, visible)
}

export function setOrderBookPanelVisible(visible: boolean): void {
  orderBookState.value = visible
  persist(ORDER_BOOK_KEY, visible)
}

export function toggleMarketPanel(): void {
  setMarketPanelVisible(!marketState.value)
}

export function toggleOrderBookPanel(): void {
  setOrderBookPanelVisible(!orderBookState.value)
}
