import Router from '@koa/router'
import { DefaultContext, DefaultState } from 'koa'

import { loadConfig } from '@/core/config'
import { AccountKeyCredit } from '@/db'

type GetConfigResponse =
  | {
      config: {
        cwReceiptPaymentAddress: string
        nativeDenomAccepted: string
        creditScaleFactor: number
        webhookCreditCost: number
      }
    }
  | {
      error: string
    }

export const getConfig: Router.Middleware<
  DefaultState,
  DefaultContext,
  GetConfigResponse
> = async (ctx) => {
  const { payment } = loadConfig()
  if (!payment) {
    ctx.status = 400
    ctx.body = {
      error: 'Not configured.',
    }
    return
  }

  ctx.status = 200
  ctx.body = {
    config: {
      cwReceiptPaymentAddress: payment.cwReceiptAddress,
      nativeDenomAccepted: payment.nativeDenomAccepted,
      creditScaleFactor: payment.creditScaleFactor,
      webhookCreditCost: AccountKeyCredit.creditsForWebhook,
    },
  }
}
