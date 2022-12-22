import { Contract } from '../db'

export interface IndexerEvent {
  blockHeight: number
  blockTimeUnixMicro: number
  contractAddress: string
  codeId: number
  key: string
  value: string
  delete: boolean
}

export type Exporter = (events: IndexerEvent[]) => Promise<{
  contracts: Contract[]
  computationsUpdated: number
  computationsDestroyed: number
}>
