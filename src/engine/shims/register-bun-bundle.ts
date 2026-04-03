/**
 * ESM loader hook that redirects `bun:bundle` imports to the local shim.
 * Usage: node --import ./src/engine/shims/register-bun-bundle.ts ...
 */
import { register } from 'node:module'

register(new URL('./bun-bundle-loader.ts', import.meta.url))
