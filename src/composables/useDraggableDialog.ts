import { onBeforeUnmount, shallowRef } from 'vue'

export interface DraggableDialogOptions {
  /** Distance kept from the viewport edges, in pixels. */
  margin?: number
}

/**
 * Makes a floating panel draggable by a handle.
 *
 * The drag writes a single coalesced `translate3d` per animation frame and
 * touches no reactive state while the pointer moves — the same rule the
 * settings window follows, so dragging a dialog over the chart cannot schedule
 * Vue renders while candles and the order book are updating.
 */
export function useDraggableDialog(options: DraggableDialogOptions = {}) {
  const margin = options.margin ?? 8
  const panel = shallowRef<HTMLElement | null>(null)

  let pointerId: number | undefined
  let captureTarget: HTMLElement | undefined
  let startX = 0
  let startY = 0
  let originLeft = 0
  let originTop = 0
  let nextLeft = 0
  let nextTop = 0
  let frame = 0

  function clampToViewport(left: number, top: number): [number, number] {
    const element = panel.value
    if (!element) {
      return [left, top]
    }
    const width = element.offsetWidth
    const height = element.offsetHeight
    return [
      Math.min(Math.max(left, margin), window.innerWidth - width - margin),
      Math.min(Math.max(top, margin), window.innerHeight - height - margin),
    ]
  }

  function render(): void {
    frame = 0
    const element = panel.value
    if (!element) {
      return
    }
    element.style.left = `${nextLeft}px`
    element.style.top = `${nextTop}px`
    element.style.right = 'auto'
    element.style.bottom = 'auto'
    element.style.transform = ''
  }

  function handleMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) {
      return
    }
    const [left, top] = clampToViewport(
      originLeft + (event.clientX - startX),
      originTop + (event.clientY - startY),
    )
    nextLeft = left
    nextTop = top
    if (!frame) {
      frame = requestAnimationFrame(render)
    }
  }

  function stop(): void {
    if (frame) {
      cancelAnimationFrame(frame)
      render()
    }
    if (pointerId !== undefined && captureTarget?.hasPointerCapture(pointerId)) {
      captureTarget.releasePointerCapture(pointerId)
    }
    pointerId = undefined
    captureTarget = undefined
    panel.value?.classList.remove('is-dragging')
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }

  function startDrag(event: PointerEvent): void {
    const element = panel.value
    // Ignore secondary buttons and drags that begin on a control.
    if (
      !element
      || event.button !== 0
      || (event.target as Element).closest('button, input, select, label')
    ) {
      return
    }
    event.preventDefault()
    const rect = element.getBoundingClientRect()
    originLeft = rect.left
    originTop = rect.top
    nextLeft = rect.left
    nextTop = rect.top
    startX = event.clientX
    startY = event.clientY
    pointerId = event.pointerId
    captureTarget = event.currentTarget as HTMLElement
    captureTarget.setPointerCapture(event.pointerId)
    element.classList.add('is-dragging')
    window.addEventListener('pointermove', handleMove, { passive: true })
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }

  /** Places the panel centred, then nudges it inside the viewport. */
  function center(): void {
    const element = panel.value
    if (!element) {
      return
    }
    const [left, top] = clampToViewport(
      (window.innerWidth - element.offsetWidth) / 2,
      (window.innerHeight - element.offsetHeight) / 2,
    )
    nextLeft = left
    nextTop = top
    render()
  }

  onBeforeUnmount(stop)

  return { panel, startDrag, center }
}
