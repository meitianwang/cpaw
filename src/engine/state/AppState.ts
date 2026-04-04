import { createDisabledBypassPermissionsContext } from '../utils/permissions/permissionSetup.js'
import { createStore } from './store.js'

import { type AppState, type AppStateStore, getDefaultAppState } from './AppStateStore.js'

// Re-exports kept for back-compat during migration
export { type AppState, type AppStateStore, type CompletionBoundary, getDefaultAppState, IDLE_SPECULATION_STATE, type SpeculationResult, type SpeculationState } from './AppStateStore.js'

/**
 * Stub: AppStoreContext is a React context, not available in non-React context.
 * In Klaus server mode, use the store directly.
 */
export const AppStoreContext = null

/**
 * Stub: AppStateProvider is a React component.
 */
export function AppStateProvider(_props: {
  children: unknown
  initialState?: AppState
  onChangeAppState?: (args: { newState: AppState; oldState: AppState }) => void
}): never {
  throw new Error('AppStateProvider is a React component and cannot be used in non-React context')
}

/**
 * Stub: useAppState is a React hook.
 */
export function useAppState(_selector: (s: AppState) => unknown): never {
  throw new Error('useAppState is a React hook and cannot be used in non-React context')
}

/**
 * Stub: useSetAppState is a React hook.
 */
export function useSetAppState(): (updater: (prev: AppState) => AppState) => void {
  throw new Error('useSetAppState is a React hook and cannot be used in non-React context')
}

/**
 * Stub: useAppStateStore is a React hook.
 */
export function useAppStateStore(): AppStateStore {
  throw new Error('useAppStateStore is a React hook and cannot be used in non-React context')
}

/**
 * Stub: useAppStateMaybeOutsideOfProvider is a React hook.
 */
export function useAppStateMaybeOutsideOfProvider(_selector: (s: AppState) => unknown): undefined {
  return undefined
}
