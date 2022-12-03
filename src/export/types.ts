import { Config } from '../types'

export interface IndexerEvent {
  blockHeight: number
  blockTimeUnixMs: number
  contractAddress: string
  codeId: number
  key: string
  value: string
  delete: boolean
}

// Return whether or not the event did not exist in the DB and was created.
export type Exporter = (event: IndexerEvent) => Promise<boolean>
export type ExporterMaker = (config: Config) => Exporter | Promise<Exporter>
