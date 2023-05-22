import Router from '@koa/router'

import { computer } from './computer'
import { getStatus } from './getStatus'
import { up } from './up'

export const indexerRouter = new Router()

// Status.
indexerRouter.get('/status', getStatus)

// Check if RPC node is running.
indexerRouter.get('/up', up)

// Formula computer. This must be the last route since it's a catch-all.
indexerRouter.get('/(.+)', computer)
