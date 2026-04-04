// Stub: ink/root.ts — Klaus does not use Ink terminal UI

export interface RenderOptions {
  stdout?: NodeJS.WriteStream
  stderr?: NodeJS.WriteStream
  stdin?: NodeJS.ReadStream
  debug?: boolean
  exitOnCtrlC?: boolean
  patchConsole?: boolean
}

export interface Instance {
  rerender: (node: any) => void
  unmount: () => void
  waitUntilExit: () => Promise<void>
  cleanup: () => void
  clear: () => void
}

export interface Root {
  render: (node: any) => void
  unmount: () => void
  waitUntilExit: () => Promise<void>
  cleanup: () => void
}

export default async function render(_node: any, _options?: any): Promise<Instance> {
  throw new Error('Ink rendering is not available in Klaus')
}

export async function createRoot(_options?: RenderOptions): Promise<Root> {
  throw new Error('Ink rendering is not available in Klaus')
}
