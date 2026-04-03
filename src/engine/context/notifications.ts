// @ts-nocheck
import type { Theme } from '../utils/theme.js'
type Priority = 'low' | 'medium' | 'high' | 'immediate'
type BaseNotification = {
  key: string
  /**
   * Keys of notifications that this notification invalidates.
   * If a notification is invalidated, it will be removed from the queue
   * and, if currently displayed, cleared immediately.
   */
  invalidates?: string[]
  priority: Priority
  timeoutMs?: number
  /**
   * Combine notifications with the same key, like Array.reduce().
   * Called as fold(accumulator, incoming) when a notification with a matching
   * key already exists in the queue or is currently displayed.
   * Returns the merged notification (should carry fold forward for future merges).
   */
  fold?: (accumulator: Notification, incoming: Notification) => Notification
}
type TextNotification = BaseNotification & {
  text: string
  color?: keyof Theme
}
type JSXNotification = BaseNotification & {
  jsx: unknown
}
type AddNotificationFn = (content: Notification) => void
type RemoveNotificationFn = (key: string) => void
export type Notification = TextNotification | JSXNotification

const PRIORITIES: Record<Priority, number> = {
  immediate: 0,
  high: 1,
  medium: 2,
  low: 3,
}
export function getNext(queue: Notification[]): Notification | undefined {
  if (queue.length === 0) return undefined
  return queue.reduce((min, n) =>
    PRIORITIES[n.priority] < PRIORITIES[min.priority] ? n : min,
  )
}

/**
 * Stub: useNotifications is a React hook, not available in non-React context.
 * Callers should use the notification queue on AppState directly.
 */
export function useNotifications(): {
  addNotification: AddNotificationFn
  removeNotification: RemoveNotificationFn
} {
  throw new Error('useNotifications is a React hook and cannot be used in non-React context')
}
