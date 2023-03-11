import { Config } from '@/core'
import { State } from '@/db'

export type ModuleExporter = {
  // The path to the source file.
  sourceFile: string
  // The function that will be called for each line in the source file.
  handler: (line: string) => Promise<void>
  // The function that will be called after all lines have been processed.
  flush: () => Promise<void>
}

export type ModuleExporterMakerOptions = {
  config: Config
  state: State
  initialBlockHeight: bigint | undefined
  batch: number
  updateComputations: boolean
  sendWebhooks: boolean
}

export type ModuleExporterMaker = (
  options: ModuleExporterMakerOptions
) => ModuleExporter
