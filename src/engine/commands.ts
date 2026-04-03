// @ts-nocheck
// Stub: commands.ts — Klaus does not use CLI slash commands

export type {
  Command,
  CommandBase,
  CommandResultDisplay,
  LocalCommandResult,
  LocalJSXCommandContext,
  PromptCommand,
  ResumeEntrypoint,
} from './types/command.js'
export { getCommandName, isCommandEnabled } from './types/command.js'

export const INTERNAL_ONLY_COMMANDS = []
export const REMOTE_SAFE_COMMANDS = new Set()
export const BRIDGE_SAFE_COMMANDS = new Set()

export const builtInCommandNames = () => []

export function meetsAvailabilityRequirement() { return true }
export async function getCommands() { return [] }
export function clearCommandMemoizationCaches() {}
export function clearCommandsCache() {}
export function getMcpSkillCommands() { return [] }
export const getSkillToolCommands = () => []
export const getSlashCommandToolSkills = () => []
export function isBridgeSafeCommand() { return false }
export function filterCommandsForRemoteMode(commands) { return commands }
export function findCommand() { return undefined }
export function getCommand() { return undefined }
export function hasCommand() { return false }
