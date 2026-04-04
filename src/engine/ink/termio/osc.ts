export const CLEAR_ITERM2_PROGRESS: string = '\x1b]9;4;0;\x07'
export const CLEAR_TAB_STATUS: string = '\x1b]21337;\x07'
export const CLEAR_TERMINAL_TITLE: string = '\x1b]0;\x07'
export function supportsTabStatus(..._args: unknown[]) { return false }
export function wrapForMultiplexer(s: string, ..._args: unknown[]): string { return s }
