/**
 * Shim for @ant/computer-use-input (unavailable internal package).
 * Only type imports exist in the source — this file is a placeholder
 * so the bundler can resolve the module.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

export interface ComputerUseInput {
  moveMouse: AnyFn
  mouseButton: AnyFn
  mouseScroll: AnyFn
  mouseLocation: AnyFn
  key: AnyFn
  keys: AnyFn
  typeText: AnyFn
  getFrontmostAppInfo: AnyFn
  [key: string]: AnyFn
}

export type ComputerUseInputAPI = ComputerUseInput & {
  isSupported?: boolean
}

export default undefined
