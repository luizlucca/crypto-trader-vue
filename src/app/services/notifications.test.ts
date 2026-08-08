import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotifications } from './notifications'

afterEach(() => {
  vi.useRealTimers()
})

describe('notifications', () => {
  it('enqueues immutable notifications and removes one by id', () => {
    const service = createNotifications()
    const first = service.notify({ tone: 'success', message: 'Conectado' })
    const beforeRemoval = service.notifications.value

    service.remove(first)

    expect(first).toBe('notification-1')
    expect(beforeRemoval).toEqual([
      { id: 'notification-1', tone: 'success', message: 'Conectado' },
    ])
    expect(service.notifications.value).toEqual([])
    expect(service.notifications.value).not.toBe(beforeRemoval)
  })

  it('expires each notification after its duration', () => {
    vi.useFakeTimers()
    const service = createNotifications()
    service.notify({ tone: 'error', message: 'Falhou', duration: 1_000 })

    vi.advanceTimersByTime(999)
    expect(service.notifications.value).toHaveLength(1)
    vi.advanceTimersByTime(1)

    expect(service.notifications.value).toEqual([])
  })

  it('runs a retry callback only once', () => {
    let retries = 0
    const service = createNotifications()
    const id = service.notify({
      tone: 'error',
      message: 'Falhou',
      retry: () => { retries += 1 },
    })

    service.retry(id)
    service.retry(id)

    expect(retries).toBe(1)
    expect(service.notifications.value).toEqual([])
  })

  it('runs a settings callback only once', () => {
    let settingsOpens = 0
    const service = createNotifications()
    const id = service.notify({
      tone: 'error',
      message: 'Falhou',
      openSettings: () => { settingsOpens += 1 },
    })

    service.openSettings(id)
    service.openSettings(id)

    expect(settingsOpens).toBe(1)
    expect(service.notifications.value).toEqual([])
  })
})
