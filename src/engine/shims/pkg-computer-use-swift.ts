/**
 * Shim for @ant/computer-use-swift (unavailable internal package).
 * Only type imports exist in the source — this file is a placeholder
 * so the bundler can resolve the module.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

export interface ComputerUseAPI {
  apps: {
    appUnderPoint: AnyFn
    frontmost: AnyFn
    running: AnyFn
    installed: AnyFn
    listInstalled: AnyFn
    launch: AnyFn
    activate: AnyFn
    prepareDisplay: AnyFn
    [key: string]: AnyFn
  }
  display: {
    scaleFactor: AnyFn
    geometry: AnyFn
    [key: string]: AnyFn
  }
  screenshot: {
    captureExcluding: AnyFn
    captureRegion: AnyFn
    [key: string]: AnyFn
  }
  resolvePrepareCapture: AnyFn
  hotkey: {
    register: AnyFn
    unregister: AnyFn
    notifyExpectedEscape: AnyFn
    [key: string]: AnyFn
  }
  _drainMainRunLoop: AnyFn
  tcc: {
    requestAccess: AnyFn
    checkAccess: AnyFn
    [key: string]: AnyFn
  }
  [key: string]: unknown
}

export default undefined
