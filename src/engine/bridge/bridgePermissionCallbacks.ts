export interface BridgePermissionCallbacks {
  askPermission?: (...args: unknown[]) => Promise<unknown>
  [key: string]: unknown
}
