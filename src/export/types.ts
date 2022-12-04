export interface IndexerEvent {
  blockHeight: number
  blockTimeUnixMicro: number
  contractAddress: string
  codeId: number
  key: string
  value: string
  delete: boolean
}

// Return whether or not the event did not exist in the DB and was created.
export type Exporter = (event: IndexerEvent) => Promise<boolean>
