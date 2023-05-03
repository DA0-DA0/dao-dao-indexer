# API

The API has two components: the indexer API and the accounts API.

## Indexer

The indexer API supports two routes: one to retrieve the status of the exporter,
and one to query the indexer's data.

See the [formulas docs](./formulas.md) for more information on how to create API
endpoints.

### API Routes

#### `GET /status`

This returns the status of the indexer.

```ts
{
  "latestBlock": {
    "height": string
    "timeUnixMs": string
  },
  "lastStakingBlockHeightExported": string | null
  "lastWasmBlockHeightExported": string | null
}
```

#### `GET /:key/:type/:address/:formula`

(Alternative: `GET /:type/:address/:formula` with `key` in the `X-API-Key`
header.)

Other parameters:

- `block`: the block height and time (in milliseconds since epoch) to query
  (e.g. `16203:1683075370647`)
- `blocks`: a range of blocks to query (e.g. `16203:1683075370647..17203:1683081370647`)
- `blockStep`: the step between blocks to query if using a range (e.g. `100`)
- `time`: the time to query (e.g. `1683075370647`)
- `times`: a range of times to query (e.g. `1683075370647..1683081370647`)
- `timeStep`: the step between times to query if using a range (e.g. `10000`)

Any other parameters are forwarded to the formula in an `args` object.

Only one of `block`, `blocks`, `time`, or `times` can be specified. If none are
specified, the most recent block is used.

A range query returns an array of results, one for each block or time in the
range. The step parameter is optional and defaults to 1. Its response looks like
this:

```ts
[
  {
    "at": string // Only defined if step > 1.
    "value": any
    "blockHeight": number
    "blockTimeUnixMs": string
  },
  ...
]
```

An individual query, using `block`, `time`, or none of the above, returns a
single result. **Its response is the value returned from the formula.**

## Accounts

The accounts API lets you manage accounts that can access the indexer API, as
well as create webhooks for events.
