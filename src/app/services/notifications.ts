import { readonly, shallowRef, type ShallowRef } from 'vue'

export type AppNotificationTone = 'success' | 'error'

export interface AppNotificationInput {
  tone: AppNotificationTone
  message: string
  duration?: number
  retry?: () => void
  openSettings?: () => void
}

export interface AppNotification
  extends Omit<AppNotificationInput, 'duration'> {
  id: string
}

export interface AppNotifications {
  notifications: Readonly<ShallowRef<readonly AppNotification[]>>
  notify(notification: AppNotificationInput): string
  remove(id: string): void
  retry(id: string): void
  openSettings(id: string): void
}

const DEFAULT_NOTIFICATION_DURATION = 6_000

export function createNotifications(): AppNotifications {
  const notifications = shallowRef<readonly AppNotification[]>([])
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>()
  let nextId = 1

  function remove(id: string): void {
    const timeout = timeouts.get(id)
    if (timeout) {
      clearTimeout(timeout)
      timeouts.delete(id)
    }
    notifications.value = notifications.value.filter((item) => item.id !== id)
  }

  function notify(input: AppNotificationInput): string {
    const id = `notification-${nextId++}`
    const { duration = DEFAULT_NOTIFICATION_DURATION, ...notification } = input
    notifications.value = [...notifications.value, { id, ...notification }]
    timeouts.set(id, setTimeout(() => remove(id), duration))
    return id
  }

  function runAction(
    id: string,
    key: 'retry' | 'openSettings',
  ): void {
    const notification = notifications.value.find((item) => item.id === id)
    const action = notification?.[key]
    if (!action) {
      return
    }
    remove(id)
    action()
  }

  return {
    notifications: readonly(notifications),
    notify,
    remove,
    retry: (id) => runAction(id, 'retry'),
    openSettings: (id) => runAction(id, 'openSettings'),
  }
}

let sharedNotifications: AppNotifications | undefined

export function useNotifications(): AppNotifications {
  sharedNotifications ??= createNotifications()
  return sharedNotifications
}
