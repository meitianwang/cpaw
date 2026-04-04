// Feature-gated tool stub — only loaded when feature() returns true
import { buildTool } from '../../Tool.js'
export const WebBrowserTool = buildTool({
  name: 'WebBrowserTool',
  async description() { return '' },
  inputSchema: { type: 'object' } as any,
  async call() { return { data: 'Feature not enabled' } },
  userFacingName: () => 'WebBrowserTool',
} as any)
