import { WebhookMaker, WebhookType } from '@/core/types'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

const KEY_PREFIX_RECEIPT_TOTALS = dbKeyForKeys('receipt_totals', '')

// Fire webhook when a payment is paid to the indexer's cw-receipt contract.
export const makeIndexerCwReceiptPaid: WebhookMaker = (config) =>
  !config.payment
    ? null
    : {
        filter: {
          contractAddresses: [config.payment.cwReceiptAddress],
          // Filter for receipt_totals state changes.
          matches: (event) => event.key.startsWith(KEY_PREFIX_RECEIPT_TOTALS),
        },
        endpoint: async () =>
          !config.payment
            ? undefined
            : {
                type: WebhookType.Url,
                url: 'https://accounts.indexer.zone/webhook/cw-receipt',
                method: 'POST',
                headers: {
                  'X-API-Key': config.payment.cwReceiptWebhookSecret,
                },
              },
        getValue: async (event) => {
          // "receipt_totals" | receiptId | serializedDenom
          const [, receiptId, serializedDenom] = dbKeyToKeys(event.key, [
            false,
            false,
            false,
          ])
          const amount = event.valueJson

          return {
            receiptId,
            amount,
            serializedDenom,
          }
        },
      }
