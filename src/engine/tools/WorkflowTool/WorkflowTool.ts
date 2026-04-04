import { buildTool } from '../../Tool.js'
export const WorkflowTool = buildTool({
  name: 'WorkflowTool',
  async description() { return '' },
  inputSchema: { type: 'object' } as any,
  async call() { return { data: 'Feature not enabled' } },
  userFacingName: () => 'WorkflowTool',
} as any)
