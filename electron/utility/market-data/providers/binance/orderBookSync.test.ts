import { describe, expect, it } from 'vitest'
import { BinanceOrderBook, type DepthUpdate } from './orderBookSync'

function update(patch: Partial<DepthUpdate>): DepthUpdate {
  return {
    firstUpdateId: 0,
    finalUpdateId: 0,
    eventTime: 1,
    bids: [],
    asks: [],
    ...patch,
  }
}

const snapshot = {
  lastUpdateId: 100,
  bids: [[10, 1], [9, 2]] as const,
  asks: [[11, 1], [12, 2]] as const,
}

describe('binance order book — regras comuns', () => {
  it('adota o snapshot como estado inicial', () => {
    const book = new BinanceOrderBook('spot')
    book.applySnapshot(snapshot)

    expect(book.isSynchronised).toBe(true)
    expect(book.best(2)).toEqual({
      bids: [[10, 1], [9, 2]],
      asks: [[11, 1], [12, 2]],
    })
  })

  it('remove o nível quando a quantidade é zero', () => {
    const book = new BinanceOrderBook('spot')
    book.applySnapshot(snapshot)

    book.apply(update({
      firstUpdateId: 101,
      finalUpdateId: 101,
      bids: [[10, 0]],
    }))

    expect(book.best(2).bids).toEqual([[9, 2]])
  })

  it('trata a quantidade como absoluta, não incremental', () => {
    const book = new BinanceOrderBook('spot')
    book.applySnapshot(snapshot)

    book.apply(update({ firstUpdateId: 101, finalUpdateId: 101, bids: [[10, 7]] }))

    expect(book.best(1).bids).toEqual([[10, 7]])
  })

  it('ordena cada lado a partir do melhor preço', () => {
    const book = new BinanceOrderBook('spot')
    book.applySnapshot({
      lastUpdateId: 1,
      bids: [[8, 1], [10, 1], [9, 1]],
      asks: [[13, 1], [11, 1], [12, 1]],
    })

    expect(book.best(3).bids.map(([price]) => price)).toEqual([10, 9, 8])
    expect(book.best(3).asks.map(([price]) => price)).toEqual([11, 12, 13])
  })

  it('mantém profundidade além das linhas pedidas', () => {
    const book = new BinanceOrderBook('spot')
    book.applySnapshot({
      lastUpdateId: 1,
      bids: Array.from({ length: 500 }, (_, i) => [1000 - i, 1] as const),
      asks: [],
    })

    // O motivo de existir: agregações largas precisam de níveis muito além
    // dos 20 que o partial stream entregava.
    expect(book.best(20).bids).toHaveLength(20)
    expect(book.best(400).bids).toHaveLength(400)
  })
})

describe('binance order book — sequência Spot', () => {
  it('descarta evento cujo u é anterior ou igual ao snapshot', () => {
    const book = new BinanceOrderBook('spot')
    book.applySnapshot(snapshot)

    const outcome = book.apply(update({
      firstUpdateId: 90,
      finalUpdateId: 100,
      bids: [[10, 99]],
    }))

    expect(outcome.status).toBe('ignored')
    expect(book.best(1).bids).toEqual([[10, 1]])
  })

  it('aceita o primeiro evento que cobre lastUpdateId + 1', () => {
    const book = new BinanceOrderBook('spot')
    book.applySnapshot(snapshot)

    expect(book.apply(update({
      firstUpdateId: 99,
      finalUpdateId: 105,
      bids: [[10, 5]],
    })).status).toBe('applied')
  })

  it('dessincroniza ao pular uma atualização', () => {
    const book = new BinanceOrderBook('spot')
    book.applySnapshot(snapshot)
    book.apply(update({ firstUpdateId: 101, finalUpdateId: 101 }))

    const outcome = book.apply(update({
      firstUpdateId: 103,
      finalUpdateId: 103,
    }))

    expect(outcome.status).toBe('desynchronised')
    expect(book.isSynchronised).toBe(false)
  })
})

describe('binance order book — sequência Futures', () => {
  it('aceita o primeiro evento que atravessa o lastUpdateId', () => {
    const book = new BinanceOrderBook('futures')
    book.applySnapshot(snapshot)

    expect(book.apply(update({
      firstUpdateId: 95,
      finalUpdateId: 100,
      bids: [[10, 4]],
    })).status).toBe('applied')
  })

  it('aceita o primeiro evento mesmo trazendo pu de outra sequência', () => {
    const book = new BinanceOrderBook('futures')
    book.applySnapshot(snapshot)

    // O stream real sempre envia `pu`, inclusive no primeiro evento após o
    // snapshot, e esse `pu` não tem relação com o lastUpdateId do snapshot.
    // Tratar a presença de `pu` como "não é o primeiro" travava a sincronia.
    expect(book.apply(update({
      firstUpdateId: 95,
      finalUpdateId: 100,
      previousUpdateId: 11182139982584,
      bids: [[10, 4]],
    })).status).toBe('applied')
    expect(book.best(1).bids).toEqual([[10, 4]])
  })

  it('encadeia por pu, não por U', () => {
    const book = new BinanceOrderBook('futures')
    book.applySnapshot(snapshot)
    book.apply(update({ firstUpdateId: 95, finalUpdateId: 110, previousUpdateId: 1 }))

    // U salta livremente em Futures; o elo é pu == u anterior.
    expect(book.apply(update({
      firstUpdateId: 200,
      finalUpdateId: 210,
      previousUpdateId: 110,
    })).status).toBe('applied')
  })

  it('dessincroniza quando pu não casa com o u anterior', () => {
    const book = new BinanceOrderBook('futures')
    book.applySnapshot(snapshot)
    book.apply(update({ firstUpdateId: 95, finalUpdateId: 110, previousUpdateId: 1 }))

    expect(book.apply(update({
      firstUpdateId: 200,
      finalUpdateId: 210,
      previousUpdateId: 109,
    })).status).toBe('desynchronised')
  })

  it('não aceita em Futures uma sequência que só valeria em Spot', () => {
    const spot = new BinanceOrderBook('spot')
    const futures = new BinanceOrderBook('futures')
    spot.applySnapshot(snapshot)
    futures.applySnapshot(snapshot)
    spot.apply(update({ firstUpdateId: 101, finalUpdateId: 101 }))
    futures.apply(update({ firstUpdateId: 100, finalUpdateId: 101, previousUpdateId: 1 }))

    const chained = update({
      firstUpdateId: 102,
      finalUpdateId: 102,
      previousUpdateId: 999,
    })
    expect(spot.apply(chained).status).toBe('applied')
    expect(futures.apply(chained).status).toBe('desynchronised')
  })
})

describe('binance order book — eventos anteriores ao snapshot', () => {
  it('reaplica o que chegou enquanto o snapshot estava em voo', () => {
    const book = new BinanceOrderBook('spot')
    book.buffer(update({ firstUpdateId: 95, finalUpdateId: 99, bids: [[9, 50]] }))
    book.buffer(update({ firstUpdateId: 101, finalUpdateId: 102, bids: [[10, 42]] }))

    expect(book.applySnapshot(snapshot)).toBe(true)
    // O evento anterior ao snapshot é descartado; o posterior é aplicado.
    expect(book.best(2).bids).toEqual([[10, 42], [9, 2]])
  })

  it('recusa o snapshot quando o buffer não fecha a lacuna', () => {
    const book = new BinanceOrderBook('spot')
    book.buffer(update({ firstUpdateId: 150, finalUpdateId: 160 }))

    expect(book.applySnapshot(snapshot)).toBe(false)
    expect(book.isSynchronised).toBe(false)
  })
})
