export type AddDirValidationResult = {
  resultType: 'success' | 'alreadyInWorkingDirectory' | 'pathNotFound' | 'notADirectory' | 'error'
  absolutePath: string
  message?: string
} | undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addDirHelpMessage(..._args: any[]): string { return '' }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateDirectoryForWorkspace(..._args: any[]): Promise<AddDirValidationResult> { return Promise.resolve(undefined) }
