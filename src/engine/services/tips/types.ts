import type { FileStateCache } from '../../utils/fileStateCache.js'

export type Tip = {
  id: string
  content: (ctx: TipContext) => Promise<string>
  cooldownSessions: number
  isRelevant?: (context?: TipContext) => Promise<boolean>
}

export type TipContext = {
  bashTools?: Set<string>
  readFileState?: FileStateCache
  theme?: string
}
