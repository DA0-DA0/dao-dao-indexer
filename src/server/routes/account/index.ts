import Router from '@koa/router'
import { koaBody } from 'koa-body'

import { authMiddleware } from './auth'
import { createKey } from './createKey'
import { getNonce } from './getNonce'
import { listKeys } from './listKeys'
import { resetKey } from './resetKey'
import { webhook } from './webhook'

export const accountRouter = new Router()
accountRouter.use(koaBody())

//! Unauthenticated routes.

// Webhook.
// Called when a payment is made, adds to a credit.
accountRouter.post('/webhook/:paymentSource', webhook)

// Get nonce.
accountRouter.get('/nonce/:publicKey', getNonce)

//! Authenticated routes.

accountRouter.use(authMiddleware)

// Create new key.
accountRouter.post('/keys', createKey)

// Reset key. Generates new API key and responds with it.
accountRouter.post('/keys/reset', resetKey)

// List keys.
accountRouter.post('/keys/list', listKeys)
