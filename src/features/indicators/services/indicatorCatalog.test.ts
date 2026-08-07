import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IndicatorRequest,
  IndicatorResponse,
} from '@indicators/domain/indicatorProtocol'

/**
 * The catalog cache and its in-flight promise are module state, shared by every
 * chart on purpose. These tests therefore reload the module for each case —
 * otherwise the first one to resolve would answer all the others.
 */
class FakeWorker {
  onmessage: ((event: MessageEvent<IndicatorResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  readonly requests: IndicatorRequest[] = []
  terminated = false

  postMessage(message: IndicatorRequest): void {
    this.requests.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  emit(message: IndicatorResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<IndicatorResponse>)
  }
}

async function freshClient() {
  vi.resetModules()
  const workers: FakeWorker[] = []
  const { createIndicatorClient } = await import('./indicators')
  const client = createIndicatorClient(
    () => {},
    () => ({
      time: [], open: [], high: [], low: [], close: [], volume: [],
    }),
    () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker as unknown as Worker
    },
  )
  return { client, workers }
}

describe('catálogo de indicadores', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('desiste quando o worker sobe e nunca responde', async () => {
    // Sem tempo limite, a promessa compartilhada ficava pendente para sempre e
    // toda abertura seguinte do seletor recebia essa mesma promessa morta: o
    // seletor ficava quebrado até reiniciar o app. `onerror` só cobre o worker
    // que falha alto.
    const { client, workers } = await freshClient()
    const pedido = client.catalog()
    const falha = expect(pedido).rejects.toThrow(/não respondeu a tempo/)

    expect(workers).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(20_000)
    await falha
  })

  it('larga o worker criado só para listar o catálogo', async () => {
    // Abrir o seletor e não aplicar nada deixava um bundle de 2 MB vivo pela
    // vida inteira do gráfico — uma cópia por aba.
    const { client, workers } = await freshClient()
    const pedido = client.catalog()
    workers[0].emit({ kind: 'catalog', definitions: [] })
    await pedido

    expect(workers[0].terminated).toBe(true)
  })

  it('atende as abas seguintes do cache, sem novo worker', async () => {
    const { client, workers } = await freshClient()
    const primeiro = client.catalog()
    workers[0].emit({ kind: 'catalog', definitions: [] })
    await primeiro

    await client.catalog()
    expect(workers).toHaveLength(1)
  })
})
