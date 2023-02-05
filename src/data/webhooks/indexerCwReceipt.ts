import { WebhookMaker } from '@/core'
import { dbKeyForKeys, dbKeyToKeys } from '@/core/utils'

const KEY_PREFIX_RECEIPT_TOTALS = dbKeyForKeys('receipt_totals', '')

// Fire webhook when a payment is paid to the indexer's cw-receipt contract.
export const makeIndexerCwReceiptPaid: WebhookMaker = (config) =>
  !config.payment?.cwReceiptAddress
    ? null
    : {
        filter: {
          contractAddresses: [config.payment.cwReceiptAddress],
          // Filter for receipt_totals state changes.
          matches: (event) => event.key.startsWith(KEY_PREFIX_RECEIPT_TOTALS),
        },
        endpoint: async () => ({
          url: 'https://indexer-mainnet.daodao.zone/account/webhook/cw-receipt',
          method: 'POST',
          headers: {
            'X-API-Key': config.discordNotifierApiKey,
          },
        }),
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
