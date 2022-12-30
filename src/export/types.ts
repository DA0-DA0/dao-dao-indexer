import { ParsedEvent } from '../core/types'
import { Contract } from '../db'

export type Exporter = (events: ParsedEvent[]) => Promise<{
  contracts: Contract[]
  computationsUpdated: number
  computationsDestroyed: number
  transformations: number
}>
