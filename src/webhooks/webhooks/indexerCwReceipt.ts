import { WasmStateEvent } from '@/db'
import { dbKeyForKeys, dbKeyToKeys } from '@/utils'
import { WebhookMaker, WebhookType } from '@/webhooks'

const KEY_PREFIX_RECEIPT_TOTALS = dbKeyForKeys('receipt_totals', '')

// Fire webhook when a payment is paid to the indexer's cw-receipt contract.
export const makeIndexerCwReceiptPaid: WebhookMaker<WasmStateEvent> = (
  config
) =>
  !config.payment
    ? null
    : {
        filter: {
          EventType: WasmStateEvent,
          contractAddresses: [config.payment.cwReceiptAddress],
          // Filter for receipt_totals state changes.
          matches: (event) => event.key.startsWith(KEY_PREFIX_RECEIPT_TOTALS),
        },
        endpoint: async () =>
          !config.payment
            ? undefined
            : {
                type: WebhookType.Url,
                url: 'https://accounts.indexer.zone/payment-webhook/cw-receipt',
                method: 'POST',
                headers: {
                  'X-API-Key': config.payment.cwReceiptWebhookSecret,
                },
              },
        getValue: async (event, getLastEvent) => {
          // "receipt_totals" | receiptId | serializedDenom
          const [, receiptId, serializedDenom] = dbKeyToKeys(event.key, [
            false,
            false,
            false,
          ])
          const amount = event.valueJson
          const previousAmount = (await getLastEvent())?.valueJson || '0'

          return {
            receiptId,
            amount,
            previousAmount,
            serializedDenom,
          }
        },
      }
