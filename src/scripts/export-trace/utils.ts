import * as fs from 'fs'

import { WebSocket } from 'ws'

import { objectMatchesStructure } from '@/core'

type FifoJsonTracerOptions = {
  file: string
  onData: (data: unknown) => void | Promise<void>
  // If provided, this callback will be called when a JSON object cannot be
  // parsed from the buffer.
  onError?: (buffer: string, error: unknown) => void | Promise<void>
  // If provided, this function will be called when processing a chunk of data.
  onProcessingStateChange?: (processing: boolean) => void | Promise<void>
}

type FifoJsonTracer = {
  // Promise that resolves when the FIFO is closed or rejects if the FIFO
  // errors.
  promise: Promise<void>
  // Close the FIFO and resolve the promise.
  close: () => void
}

// Trace a FIFO (see `mkfifo`) that transmits JSON objects on each line, and
// execute an asynchronous callback synchronously (i.e. don't read from the FIFO
// while executing the async callback) with the parsed JSON object. If the
// callback throws an error, the FIFO will be closed and the error will be
// thrown. If a line cannot be parsed as a JSON object, the `onError` callback
// will be called if provided. If the `onError` callback is not provided, the
// line will be ignored.
//
// Example:
//
//   ```sh
//   # Create FIFO.
//   mkfifo /tmp/my-fifo
//   ```
//
//   ```ts
//   import { setUpFifoJsonTracer } from './utils'
//
//   setUpFifoJsonTracer({
//     file: '/tmp/my-fifo',
//     onData: async (data) => {
//       console.log('Parsed JSON object:', data)
//     },
//     onError: (buffer, error) => {
//       console.error(`Unexpected non-JSON line: "${buffer}"`, err)
//     },
//   })
//   ```
//
//   ```sh
//   # Write JSON objects to FIFO.

//   echo '{"foo": "bar"}' > /tmp/my-fifo
//   # Output:
//   # Parsed JSON object: { foo: 'bar' }

//   echo '{"baz": "qux"}' > /tmp/my-fifo
//   # Output:
//   # Parsed JSON object: { foo: 'bar' }
//   ```
export const setUpFifoJsonTracer = ({
  file,
  onData,
  onError,
  onProcessingStateChange,
}: FifoJsonTracerOptions): FifoJsonTracer => {
  const fifoRs = fs.createReadStream(file, {
    // Parse chunks as UTF-8 strings.
    encoding: 'utf-8',
  })

  // In the case a chunk ends in the middle of a JSON object and not after a
  // newline, buffer the chunk and continue reading until we have a valid JSON
  // object.
  let buffer = ''

  fifoRs.on('data', (chunk) => {
    // Pause before processing this chunk.
    fifoRs.pause()

    // Resume at the end of the chunk processing.
    ;(async () => {
      try {
        // Call the processing state change callback if provided.
        await onProcessingStateChange?.(true)

        // Type-check chunk. It should be a string due to `encoding` set above.
        if (!chunk || typeof chunk !== 'string') {
          return
        }

        // All complete lines that should be JSON objects end with a newline, so
        // the last item in this array will be an empty string if the last line
        // is complete. The last line may not be complete if the data being sent
        // exceeds the chunk buffer size. If this is the case, use the buffer
        // across chunks to build the incomplete line.
        const lines = chunk.split('\n')

        if (lines.length === 0) {
          return
        }

        // If the previous chunk left an incomplete line in the buffer, prepend
        // it to the first line of this chunk.
        if (buffer) {
          lines[0] = buffer + lines[0]
        }

        // If the last line is not empty, it is incomplete, so buffer it for the
        // next chunk.
        if (lines[lines.length - 1]) {
          buffer = lines.pop()!
        }

        for (const line of lines) {
          // Ignore empty line.
          if (!line) {
            continue
          }

          let data: unknown | undefined
          try {
            data = JSON.parse(buffer)
          } catch (error) {
            // If we cannot parse the buffer as a JSON object, call the error
            // callback if provided.
            await onError?.(buffer, error)
            continue
          }

          // Execute callback with parsed JSON.
          try {
            await onData(data)
          } catch (error) {
            // If the callback throws an error, close the FIFO and throw the
            // error.
            fifoRs.destroy(
              error
                ? error instanceof Error
                  ? error
                  : new Error(`${error}`)
                : new Error('onData callback threw error')
            )
          }
        }
      } finally {
        // Resume reading from FIFO.
        fifoRs.resume()
        // Call the processing state change callback if provided.
        await onProcessingStateChange?.(false)
      }
    })()
  })

  // Wait for FIFO to error or close.
  const promise = new Promise<void>((resolve, reject) => {
    fifoRs.on('error', (error) => {
      fifoRs.off('close', resolve)
      if (!fifoRs.closed) {
        fifoRs.close()
      }
      reject(error)
    })
    fifoRs.on('close', resolve)
  })

  return {
    promise,
    close: () => fifoRs.close(),
  }
}

type WebSocketNewBlockListenerOptions = {
  rpc: string
  onNewBlock: (block: unknown) => void | Promise<void>
}

export const setUpWebSocketNewBlockListener = ({
  rpc,
  onNewBlock,
}: WebSocketNewBlockListenerOptions): WebSocket => {
  // Get new-block WebSocket.
  const webSocket = new WebSocket(rpc.replace('http', 'ws') + '/websocket')

  // Subscribe to new blocks once opened.
  webSocket.on('open', () => {
    webSocket!.send(
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'subscribe',
        id: 1,
        params: ["tm.event = 'NewBlock'"],
      })
    )
  })

  // Listen for new blocks.
  webSocket.on('message', async (data) => {
    try {
      const { result } = JSON.parse(data.toString())
      if (
        !objectMatchesStructure(result, {
          data: {
            value: {
              block: {
                header: {
                  chain_id: {},
                  height: {},
                  time: {},
                },
              },
            },
          },
        })
      ) {
        return
      }

      // Execute callback with block data.
      await onNewBlock(result.data.value.block)
    } catch {
      // Fail silently.
    }
  })

  return webSocket
}
