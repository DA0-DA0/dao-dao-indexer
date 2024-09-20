import * as fs from 'fs'
import path from 'path'

import { Config, Environment } from '@/types'

export const getTraceFilePath = (config: Config): string =>
  path.join(config.home, config.traceFileName)

const isFileFIFO = (filePath: string): boolean => fs.statSync(filePath).isFIFO()

const getTraceFileFailMessage = (config: Config, traceFile: string): string =>
  config.env === Environment.Prod
    ? `Trace file not found: ${traceFile}. Create it with "mkfifo ${traceFile}".`
    : `Trace file is not found: ${traceFile}. Create it with "touch ${traceFile}".`

export const verifyTraceFile = async (
  config: Config,
  traceFile: string
): Promise<void> => {
  if (!fs.existsSync(traceFile)) {
    throw new Error(getTraceFileFailMessage(config, traceFile))
  }

  // Check if the trace file is a FIFO. Required on production only
  // this can be removed when implementing a proper writing strategry
  // for now this is simpler than running multiple terminal instances
  // or multiple porcesses
  if (config.env === Environment.Prod && !isFileFIFO(traceFile)) {
    throw new Error(getTraceFileFailMessage(config, traceFile))
  }
}
