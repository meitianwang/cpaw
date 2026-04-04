// Feature-gated tool stub — only loaded when feature() returns true
import { buildTool } from '../../Tool.js'
export const SleepTool = buildTool({
  name: 'SleepTool',
  async description() { return '' },
  inputSchema: { type: 'object' } as any,
  async call() { return { data: 'Feature not enabled' } },
  userFacingName: () => 'SleepTool',
} as any)
