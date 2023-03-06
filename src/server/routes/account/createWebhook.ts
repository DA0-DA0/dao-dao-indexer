import { randomUUID } from 'crypto'

import Router from '@koa/router'
import { DefaultContext } from 'koa'

import { objectMatchesStructure } from '@/core'
import { AccountKey, AccountWebhook, AccountWebhookStateKeyType } from '@/db'

import { AccountState } from './types'

type CreateWebhookRequest = Pick<
  AccountWebhook,
  | 'description'
  | 'url'
  | 'onlyFirstSet'
  | 'contractAddresses'
  | 'stateKey'
  | 'stateKeyType'
> & {
  accountKeyId: number
  codeIdSetIds: number[]
}

type CreateWebhookResponse =
  | undefined
  | {
      error: string
    }

export const createWebhook: Router.Middleware<
  AccountState,
  DefaultContext,
  CreateWebhookResponse
> = async (ctx) => {
  const body: CreateWebhookRequest = ctx.request.body

  // Validate key ID.
  const accountKeyId = body.accountKeyId
  if (typeof accountKeyId !== 'number') {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid key.',
    }
    return
  }
  const accountKey = await AccountKey.findByPk(accountKeyId)
  // Verify key exists and belongs to the account.
  if (
    !accountKey ||
    accountKey.accountPublicKey !== ctx.state.account.publicKey
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid key.',
    }
    return
  }

  // Validate description length.
  if (
    typeof body.description === 'string' &&
    body.description.trim().length > 255
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Description too long.',
    }
    return
  }
  body.description = body.description?.trim() || null

  // Validate URL.
  if (
    !objectMatchesStructure(body, {
      url: {},
    }) ||
    !body.url?.trim()
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid URL.',
    }
    return
  }
  body.url = body.url.trim()
  try {
    new URL(body.url)
  } catch (err) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid URL.',
    }
    return
  }

  // Validate code ID set IDs if present.
  if (
    body.codeIdSetIds &&
    Array.isArray(body.codeIdSetIds) &&
    body.codeIdSetIds.length > 0
  ) {
    const codeIdSets = await ctx.state.account.$get('codeIdSets', {
      where: {
        id: body.codeIdSetIds,
      },
    })

    if (codeIdSets.length !== body.codeIdSetIds.length) {
      ctx.status = 400
      ctx.body = {
        error: 'Invalid code ID sets.',
      }
      return
    }
  }

  // Clean contract addresses if present.
  body.contractAddresses =
    body.contractAddresses && Array.isArray(body.contractAddresses)
      ? body.contractAddresses
          .map((address) => (typeof address === 'string' ? address.trim() : ''))
          .filter(Boolean)
      : null
  if (body.contractAddresses?.length === 0) {
    body.contractAddresses = null
  }

  // Validate state key if present.
  if (body.stateKey && typeof body.stateKey !== 'string') {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid state key.',
    }
    return
  }
  body.stateKey = body.stateKey?.trim() || null

  // Validate state key type if state key is used.
  if (
    body.stateKey &&
    (!body.stateKeyType ||
      typeof body.stateKeyType !== 'string' ||
      !Object.values(AccountWebhookStateKeyType).includes(
        body.stateKeyType as any
      ))
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid state key type.',
    }
    return
  }

  // Validate at least one filter is present.
  if (
    (!body.contractAddresses ||
      !Array.isArray(body.contractAddresses) ||
      body.contractAddresses.length === 0) &&
    !body.stateKey &&
    (!body.codeIdSetIds ||
      !Array.isArray(body.codeIdSetIds) ||
      body.codeIdSetIds.length === 0)
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'At least one filter is required.',
    }
    return
  }

  const webhook = await ctx.state.account.$create<AccountWebhook>('webhook', {
    accountKeyId,
    description: body.description,
    url: body.url,
    secret: randomUUID(),
    onlyFirstSet: !!body.onlyFirstSet,
    contractAddresses: body.contractAddresses,
    stateKey: body.stateKey,
    // Only set state key type if state key is used.
    stateKeyType: body.stateKey ? body.stateKeyType : null,
  })
  // If code ID sets are present, add them to the webhook.
  if (
    body.codeIdSetIds &&
    Array.isArray(body.codeIdSetIds) &&
    body.codeIdSetIds.length > 0
  ) {
    await webhook.$add('codeIdSet', body.codeIdSetIds)
  }

  ctx.status = 201
}
