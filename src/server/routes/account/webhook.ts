import Router from '@koa/router'

import { loadConfig, objectMatchesStructure } from '@/core'
import {
  Account,
  AccountKey,
  AccountKeyCredit,
  AccountKeyCreditPaymentSource,
} from '@/db'

export const webhook: Router.Middleware = async (ctx) => {
  const { payment } = loadConfig()
  if (!payment) {
    ctx.status = 400
    ctx.body = {
      error: 'Not configured.',
    }
    return
  }

  const { paymentSource } = ctx.params
  if (!paymentSource) {
    ctx.status = 400
    ctx.body = {
      error: 'Missing paymentSource.',
    }
    return
  }

  if (
    !Object.values(AccountKeyCreditPaymentSource).includes(paymentSource as any)
  ) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid paymentSource.',
    }
    return
  }

  let paymentId: string | undefined
  let paid: number | undefined
  let update: boolean | undefined
  switch (paymentSource) {
    case AccountKeyCreditPaymentSource.CwReceipt:
      // Validate webhook secret.
      if (ctx.request.header['x-api-key'] !== payment.cwReceiptWebhookSecret) {
        ctx.status = 401
        ctx.body = {
          error: 'Unauthorized. Invalid secret.',
        }
        return
      }

      if (
        !objectMatchesStructure(ctx.request.body, {
          receiptId: {},
          amount: {},
          serializedDenom: {},
        })
      ) {
        ctx.status = 400
        ctx.body = {
          error: 'Invalid body.',
        }
        return
      }

      // Validate expected denom.
      if (
        ctx.request.body.serializedDenom !==
        // Prefixed with 'n' to indicate native denom.
        'n' + payment.nativeDenomAccepted
      ) {
        ctx.status = 202
        ctx.body = {
          error: `Invalid denom. Expected: ${payment.nativeDenomAccepted}`,
        }
        return
      }

      paymentId = ctx.request.body.receiptId
      paid = Number(ctx.request.body.amount)
      // This webhook fires whenever the total for a receipt changes (i.e.
      // increases, since it can only increase), so we should update the credit
      // each time a new webhook is received.
      update = true

      break
    default:
      ctx.status = 400
      ctx.body = {
        error: 'Invalid paymentSource.',
      }
      return
  }

  if (typeof paymentId !== 'string' || !paymentId) {
    ctx.status = 400
    ctx.body = {
      error: 'Invalid paymentId.',
    }
    return
  }

  if (
    typeof paid !== 'number' ||
    !paid ||
    isNaN(paid) ||
    !Number.isInteger(paid)
  ) {
    ctx.status = 202
    ctx.body = {
      error: 'Invalid amount paid.',
    }
    return
  }

  const credit = await AccountKeyCredit.findOne({
    where: {
      paymentSource,
      paymentId,
    },
    include: {
      model: AccountKey,
      include: [
        {
          model: Account,
        },
      ],
    },
  })

  if (!credit) {
    ctx.status = 202
    ctx.body = {
      error: 'Invalid paymentId.',
    }
    return
  }

  // Register payment. Scale by configured scale factor to convert to credits.
  try {
    await credit.registerCreditsPaidFor(
      Math.round(paid * payment.creditScaleFactor),
      update
    )
  } catch (err) {
    if (err instanceof Error) {
      ctx.status = 400
      ctx.body = {
        error: err.message,
      }
      return
    } else {
      throw err
    }
  }

  ctx.status = 200
  ctx.body = {
    success: true,
  }
}
