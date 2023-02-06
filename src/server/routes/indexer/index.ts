import Router from '@koa/router'

import { computer } from './computer'
import { getStatus } from './getStatus'

export const indexerRouter = new Router()

// Status.
indexerRouter.get('/status', getStatus)

// Formula computer. This must be the last route since it's a catch-all.
indexerRouter.get('/(.+)', computer)
