// Stub: stringWidth for external builds (no Ink dependency)

/**
 * Returns the visual width of a string, stripping ANSI escape codes.
 * Simplified implementation — treats each character as width 1.
 */
export function stringWidth(str: string): number {
  // Strip ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  const stripped = str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
  return stripped.length
}
