import Router from '@koa/router'

import { loadComputer } from './computer'
import { getStatus } from './getStatus'
import { up } from './up'

export const setUpIndexerRouter = async (root: Router) => {
  const indexerRouter = new Router()

  // Status.
  indexerRouter.get('/status', getStatus)

  // Check if indexer is caught up.
  indexerRouter.get('/up', up)

  // Formula computer. This must be the last route since it's a catch-all.
  const computer = await loadComputer()
  indexerRouter.get('/(.+)', computer)

  root.use(indexerRouter.routes(), indexerRouter.allowedMethods())
}
