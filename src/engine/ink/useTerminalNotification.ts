export interface TerminalNotification {
  notifyBell: () => void
  notifyITerm2: (opts: unknown) => void
  notifyKitty: (opts: unknown) => void
  notifyGhostty: (opts: unknown) => void
}
