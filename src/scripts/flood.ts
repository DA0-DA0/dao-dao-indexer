import { existsSync, promises as fs } from 'fs'
import path from 'path'

import axios, { AxiosError } from 'axios'
import { Command } from 'commander'

const main = async () => {
  // Parse arguments.
  const program = new Command()
  program.option(
    '-H, --host <host>',
    'the host to send requests to',
    'http://localhost:3420'
  )
  program.option(
    '-r, --requests <requests>',
    'the number of requests to send',
    (value) => parseInt(value, 10),
    1000
  )
  program.option(
    '-s, --source <json file>',
    'the source file to read requests from',
    'requests.json'
  )
  program.parse()
  const { host, requests: numRequests, source } = program.opts()

  // Read requests.
  const requestsFile = path.resolve(source)
  if (!existsSync(requestsFile)) {
    console.error(`File not found: ${requestsFile}`)
    process.exit(1)
  }

  const { requests: _requests } = JSON.parse(
    await fs.readFile(requestsFile, 'utf8')
  )

  // Send requests.
  const requests = [...Array(numRequests)].map(
    (_, index) => _requests[index % _requests.length]
  )

  console.log(`Sending ${requests.length} requests to ${host}...`)

  let statuses: Record<number | string, number> = {}
  const durations: number[] = []

  const start = new Date()
  await Promise.all(
    requests.map(async (request) => {
      try {
        const requestStart = new Date()

        const response = await axios.get(host + request, {
          headers: { 'Accept-Encoding': 'gzip,deflate,compress' },
        })
        statuses[response.status] = (statuses[response.status] || 0) + 1
        statuses['success'] = (statuses['success'] || 0) + 1

        const requestEnd = new Date()
        const requestDuration =
          (requestEnd.getTime() - requestStart.getTime()) / 1000
        durations.push(requestDuration)
      } catch (err) {
        if (err instanceof AxiosError) {
          if (err.response) {
            statuses[err.response.status] =
              (statuses[err.response.status] || 0) + 1
            statuses['error'] = (statuses['error'] || 0) + 1
          }

          return
        }

        throw err
      }
    })
  )
  const end = new Date()

  // Print results.
  const durationSeconds = (end.getTime() - start.getTime()) / 1000
  const requestsPerSecond = Math.round(requests.length / durationSeconds)
  console.log(`Duration: ${durationSeconds}s`)
  console.log(`Requests per second: ${requestsPerSecond.toLocaleString()}`)
  console.log(
    `Average request duration: ${(
      durations.reduce((a, b) => a + b, 0) / durations.length
    ).toLocaleString(undefined, {
      maximumFractionDigits: 3,
    })}s`
  )
  console.log(`Statuses: ${JSON.stringify(statuses, null, 2)}`)
}

main()
