# Webhooks

Webhooks allow you to notify your own application right when a state change
event occurs. This effectively lets you listen to events on the blockchain in
real time.

Webhooks are defined in the `data/webhooks` directory. Accounts can also create
webhooks using the API. See the [API docs](./api.md) for more information.

Be sure to check out the [keys docs](./keys.md) for a very important explanation
of how keys are formatted. It describes some utility functions that are
essentially required to create webhooks, specifically `dbKeyToKeys`.

## Webhook Types

A webhook contains filters that determine which events it should be called for,
an endpoint to call, and a function to get the value to send to the endpoint. It
looks very similar to a transformer. Check out the [transformers
docs](./transformers.md) for more information on how transformers work.

Webhooks support two types of endpoints: `Url` and `Soketi`. URL endpoints are
called with a HTTP request, while Soketi endpoints use the `soketi` config and a
JS library to interact with it. If you are not using WebSockets, you can ignore
Soketi and use URL endpoints only.

```ts
type Webhook<V = any> = {
  filter: RequireAtLeastOne<{
    codeIdsKeys: string[]
    contractAddresses: string[]
    matches: (event: WasmStateEvent) => boolean
  }>
  // If returns undefined, the webhook will not be called.
  endpoint:
    | WebhookEndpoint
    | undefined
    | ((event: WasmStateEvent, env: ContractEnv) => WebhookEndpoint | undefined)
    | ((
        event: WasmStateEvent,
        env: ContractEnv
      ) => Promise<WebhookEndpoint | undefined>)
  // If returns undefined, the webhook will not be called.
  getValue: (
    event: WasmStateEvent,
    getLastValue: () => Promise<any | null>,
    env: ContractEnv
  ) => V | undefined | Promise<V | undefined>
}

type WebhookEndpoint =
  | {
      type: WebhookType.Url
      url: string
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      headers?: Record<string, string>
    }
  | {
      type: WebhookType.Soketi
      channel: string | string[]
      event: string
    }

type WebhookMaker = (config: Config, state: State) => Webhook | null | undefined
```

## How to write a webhook

Writing a webhook is very similar to writing a transformer, so check out the
[transformers docs](./transformers.md) for more information on how transformers
work.

To add a new webhook, it must be exported from `src/data/webhooks/index.ts`.
Webhooks can also be wrapped in webhook makers, which are functions that take
the config and database state and return a webhook. This is useful for webhooks
that need to access API keys in the config or other state information.

## Example

The following webhook notifies the indexer's own accounts API when a payment
goes through on a payment smart contract. It uses both key utility functions to
transform keys from and to the database format.

````ts
const makeIndexerCwReceiptPaid: WebhookMaker = (config) =>
  !config.payment
    ? null
    : {
        filter: {
          contractAddresses: [config.payment.cwReceiptAddress],
          // Filter for receipt_totals state changes.
          matches: (event) => event.key.startsWith(dbKeyForKeys('receipt_totals', '')),
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
        getValue: async (event, getLastValue) => {
          // "receipt_totals" | receiptId | serializedDenom
          const [, receiptId, serializedDenom] = dbKeyToKeys(event.key, [
            false,
            false,
            false,
          ])
          const amount = event.valueJson
          const previousAmount = (await getLastValue()) || '0'

          return {
            receiptId,
            amount,
            previousAmount,
            serializedDenom,
          }
        },
      }
      ```
````
