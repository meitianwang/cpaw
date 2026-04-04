// Stub: commands.ts — Klaus does not use CLI slash commands

import type { Command } from './types/command.js'
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

export const INTERNAL_ONLY_COMMANDS: Command[] = []
export const REMOTE_SAFE_COMMANDS = new Set<string>()
export const BRIDGE_SAFE_COMMANDS = new Set<string>()

export const builtInCommandNames = (): Set<string> => new Set()

export function meetsAvailabilityRequirement() { return true }
export async function getCommands(..._args: any[]): Promise<Command[]> { return [] }
export function clearCommandMemoizationCaches() {}
export function clearCommandsCache() {}
export function getMcpSkillCommands(..._args: any[]): Command[] { return [] }
export const getSkillToolCommands = (..._args: any[]): Command[] => []
export const getSlashCommandToolSkills = (..._args: any[]): Command[] => []
export function isBridgeSafeCommand(..._args: any[]) { return false }
export function filterCommandsForRemoteMode(commands: Command[]) { return commands }
export function findCommand(_name: string, _commands?: Command[]): Command | undefined { return undefined }
export function getCommand(_name: string, _commands?: Command[]): Command | undefined { return undefined }
export function hasCommand(..._args: any[]) { return false }
export function formatDescriptionWithSource(cmd: Command): string { return cmd.description }
