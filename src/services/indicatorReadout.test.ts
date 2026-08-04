import { describe, expect, it, vi } from 'vitest'
import {
  peekIndicatorReadout,
  publishIndicatorReadout,
  resetIndicatorReadout,
  subscribeIndicatorReadout,
} from './indicatorReadout'

describe('indicator plot readout channel', () => {
  it('publishes and retains each plot independently', () => {
    const subscriber = vi.fn()
    const unsubscribe = subscribeIndicatorReadout('first', subscriber)

    publishIndicatorReadout('first', 'rsi', '52.40')
    publishIndicatorReadout('first', 'signal', '48.10')

    expect(subscriber).toHaveBeenNthCalledWith(1, 'rsi', '52.40')
    expect(subscriber).toHaveBeenNthCalledWith(2, 'signal', '48.10')
    expect(peekIndicatorReadout('first', 'rsi')).toBe('52.40')
    expect(peekIndicatorReadout('first', 'signal')).toBe('48.10')
    unsubscribe()
    resetIndicatorReadout('first')
  })

  it('replays retained plot values to a late subscriber', () => {
    publishIndicatorReadout('late', 'main', '14.00')
    const subscriber = vi.fn()

    const unsubscribe = subscribeIndicatorReadout('late', subscriber)

    expect(subscriber).toHaveBeenCalledWith('main', '14.00')
    unsubscribe()
    resetIndicatorReadout('late')
  })

  it('does not rewrite an unchanged value on repeated pointer events', () => {
    const subscriber = vi.fn()
    const unsubscribe = subscribeIndicatorReadout('stable', subscriber)

    publishIndicatorReadout('stable', 'main', '42.00')
    publishIndicatorReadout('stable', 'main', '42.00')

    expect(subscriber).toHaveBeenCalledOnce()
    unsubscribe()
    resetIndicatorReadout('stable')
  })

  it('clears mounted nodes and retained values on reset', () => {
    publishIndicatorReadout('reset', 'main', '70.00')
    const subscriber = vi.fn()
    const unsubscribe = subscribeIndicatorReadout('reset', subscriber)
    subscriber.mockClear()

    resetIndicatorReadout('reset')

    expect(subscriber).toHaveBeenCalledWith('main', '')
    expect(peekIndicatorReadout('reset', 'main')).toBeUndefined()
    unsubscribe()
  })

  it('isolates subscribers from other indicator instances', () => {
    const subscriber = vi.fn()
    const unsubscribe = subscribeIndicatorReadout('owner', subscriber)

    publishIndicatorReadout('other', 'main', '10.00')

    expect(subscriber).not.toHaveBeenCalled()
    unsubscribe()
    resetIndicatorReadout('other')
  })
})
