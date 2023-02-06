import Router from '@koa/router'

import { loadConfig } from '@/core/config'

export const getConfig: Router.Middleware = async (ctx) => {
  const { payment } = loadConfig()
  if (!payment) {
    ctx.status = 400
    ctx.body = {
      error: 'Not configured',
    }
    return
  }

  ctx.status = 200
  ctx.body = {
    config: {
      cwReceiptPaymentAddress: payment.cwReceiptAddress,
      nativeDenomAccepted: payment.nativeDenomAccepted,
      creditScaleFactor: payment.creditScaleFactor,
    },
  }
}
