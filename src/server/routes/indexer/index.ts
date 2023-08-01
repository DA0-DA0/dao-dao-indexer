import Router from '@koa/router'

import { caughtUp } from './caughtUp'
import { computer } from './computer'
import { getStatus } from './getStatus'
import { up } from './up'

export const indexerRouter = new Router()

// Whether or not the indexer is caught up.
indexerRouter.get('/caught-up', caughtUp)

// Status.
indexerRouter.get('/status', getStatus)

// Check if RPC node is running.
indexerRouter.get('/up', up)

// Formula computer. This must be the last route since it's a catch-all.
indexerRouter.get('/(.+)', computer)
