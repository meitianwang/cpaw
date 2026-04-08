/**
 * Standalone MCP server entrypoint for Klaus.
 *
 * Usage:
 *   bun --preload ./src/engine/shims/register-bun-bundle.ts src/mcp-serve.ts [--debug] [--verbose]
 *
 * This starts Klaus as an MCP server over stdio, exposing all engine tools
 * to any MCP client (e.g. Claude Desktop, Claude Code, etc.).
 */

import { setup } from './engine/setup.js'
import { startMCPServer } from './engine/entrypoints/mcp.js'

const args = process.argv.slice(2)
const debug = args.includes('--debug')
const verbose = args.includes('--verbose')
const cwd = process.cwd()

await setup(cwd, 'default', false, false, undefined, false)
await startMCPServer(cwd, debug, verbose)
