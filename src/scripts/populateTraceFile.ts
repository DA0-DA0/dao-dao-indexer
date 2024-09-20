import * as fs from 'fs'

import axios from 'axios'

import { loadConfig } from '@/config'
import { getTraceFilePath, verifyTraceFile } from '@/utils'

const GITHUB_TRACE_URL =
  'https://gist.githubusercontent.com/rumgrum/2b5fbc5af65315dfe9978f0033f28661/raw'

export const main = async () => {
  const config = loadConfig()

  if (!config.home) {
    throw new Error('Config missing home directory.')
  }

  const traceFile = getTraceFilePath(config)
  await verifyTraceFile(config, traceFile)

  try {
    console.log('Populating trace file...')
    const response = await axios.get(GITHUB_TRACE_URL)

    fs.writeFileSync(traceFile, response.data)
    console.log('Trace file populated.')
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error fetching sample trace data:', error.message)
    } else if (error instanceof Error) {
      console.error('Error writing trace data to file:', error.message)
    } else {
      console.error(
        'An unexpected error occurred while populating trace file:',
        error
      )
    }
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
