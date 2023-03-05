import Router from '@koa/router'
import { koaBody } from 'koa-body'

import { authMiddleware } from './auth'
import { createCodeIdSet } from './createCodeIdSet'
import { createKey } from './createKey'
import { createWebhook } from './createWebhook'
import { deleteCodeIdSet } from './deleteCodeIdSet'
import { deleteWebhook } from './deleteWebhook'
import { fireWebhookEvent } from './fireWebhookEvent'
import { getConfig } from './getConfig'
import { getNonce } from './getNonce'
import { getWebhookEvents } from './getWebhookEvents'
import { listCodeIdSets } from './listCodeIdSets'
import { listKeys } from './listKeys'
import { listWebhooks } from './listWebhooks'
import { login } from './login'
import { paymentWebhook } from './paymentWebhook'
import { resetKey } from './resetKey'
import { updateCodeIdSet } from './updateCodeIdSet'
import { updateWebhook } from './updateWebhook'

export const accountRouter = new Router()
accountRouter.use(koaBody())

//! Unauthenticated routes.

// Payment webhook. Called when a payment is made, adds to a credit.
accountRouter.post('/payment-webhook/:paymentSource', paymentWebhook)

// Get config. Used by frontend for payments and to display pricing correctly.
accountRouter.get('/config', getConfig)

// Get nonce.
accountRouter.get('/nonce/:publicKey', getNonce)

// Login.
accountRouter.post('/login', login)

//! Authenticated routes.

accountRouter.use(authMiddleware)

// List keys.
accountRouter.get('/keys', listKeys)

// Create new key.
accountRouter.post('/keys', createKey)

// Reset key. Generates new API key and responds with it.
accountRouter.post('/keys/:id/reset', resetKey)

// List code ID sets.
accountRouter.get('/code-id-sets', listCodeIdSets)

// Create new code ID set.
accountRouter.post('/code-id-sets', createCodeIdSet)

// Update code ID set.
accountRouter.patch('/code-id-sets/:id', updateCodeIdSet)

// Delete code ID set.
accountRouter.delete('/code-id-sets/:id', deleteCodeIdSet)

// List webhooks.
accountRouter.get('/webhooks', listWebhooks)

// Get webhook events.
accountRouter.get('/webhooks/:id/events', getWebhookEvents)

// Fire webhook event.
accountRouter.post('/webhooks/:id/events/:uuid/fire', fireWebhookEvent)

// Create new webhook.
accountRouter.post('/webhooks', createWebhook)

// Update webhook.
accountRouter.patch('/webhooks/:id', updateWebhook)

// Delete webhook.
accountRouter.delete('/webhooks/:id', deleteWebhook)
