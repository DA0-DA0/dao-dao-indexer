import Router from '@koa/router'

import { bullBoardJobsMiddleware } from './bull'
import { computer } from './computer'
import { getStatus } from './getStatus'
import { up } from './up'

export const indexerRouter = new Router()

// Status.
indexerRouter.get('/status', getStatus)

// Check if indexer is caught up.
indexerRouter.get('/up', up)

// Bull board (background worker dashboard)
// Route: /jobs (defined in ./bull.ts)
indexerRouter.use(bullBoardJobsMiddleware)

// Formula computer. This must be the last route since it's a catch-all.
indexerRouter.get('/(.+)', computer)
