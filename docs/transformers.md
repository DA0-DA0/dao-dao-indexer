# Transformers

As state changes are exported from the node to the database, they can be
transformed. Transformers define filters which determine which state change
events they should be applied to, and then apply a transformation to the state
change event. The output of a transformation is a name and a value, which are
stored in the database in a separate table.

The Juno blockchain produced ~53 million x/wasm state change events in the first
~8 million blocks. Database indexes make it quite efficient to perform
operations extracting a single state key from a single contract at a given block
height, but it becomes much more expensive when aggregating across many
different contracts and state keys. For example, to get all cw20 balances for a
given wallet, one would have to query the database for all values that begin
with the `balance` Map key prefix. Especially given that this is a Map key
prefix, which is more expensive than an exact match, this is a very expensive
query. As such, formulas don't even expose the ability to search across
contracts.

Transformers are designed to be used to pre-aggregate data that is commonly
queried. They are stored in a separate table from the state-change events for
more efficient querying.

Transformers are defined in the `data/transformers` directory.

## Transformer Structure

A transformer is an object that contains a filter, a name derivation function,
and a value derivation function, along with other optional options. Just as
state change events are unique to their contract address, key, and block height,
so are transformations. A transformation is uniquely identified by its contract
address, name, and block height.

Unlike state change events, transformations let you derive your own name that
uniquely identifies it, so you can construct any type of relationship you want
between the name and the value. Since transformers can access the previous
transformation value in its value derivation function, transformations can even
be running totals or other pre-computed values.

```ts
type Transformer<V = any> = {
  filter: RequireAtLeastOne<{
    codeIdsKeys: string[]
    contractAddresses: string[]
    matches: (event: ParsedWasmStateEvent) => boolean
  }>
  // If `name` returns `undefined`, the transformation will not be saved.
  name: string | ((event: ParsedWasmStateEvent) => string | undefined)
  // If `getValue` returns `undefined`, the transformation will not be saved.
  // All other values, including `null`, will be saved.
  getValue: (
    event: ParsedWasmStateEvent,
    getLastValue: () => Promise<V | null>
  ) => V | null | undefined | Promise<V | null | undefined>
  // By default, a transformation gets created with a value of `null` if the
  // event is a delete event, skipping evaluation of `getValue`. If
  // `manuallyTransformDelete` is set to true, `getValue` will be called and the
  // value returned will be used instead, as if it were not a delete event.
  manuallyTransformDeletes?: boolean
}
```

The event data passed to a transformer looks like this:

```ts
type ParsedWasmStateEvent = {
  type: 'state'
  codeId: number
  contractAddress: string
  blockHeight: string
  blockTimeUnixMs: string
  blockTimestamp: Date
  key: string
  value: string
  valueJson: any
  delete: boolean
}
```

Events can either be a set or a delete. A set event has a `value` and a
`valueJson` field, while a delete event has the `delete` field set to `true`,
`value` an undefined string, and `valueJson` set to null.

## Usage in formulas

Like `get` and `getMap`, there are a few helper functions provided to formulas
to access transformations. Specifically:

- `getTransformationMatch`
- `getTransformationMatches`
- `getTransformationMap`

These functions are used to query the database for transformations based on
contracts, names, and values. They are used almost identically to `get` and
`getMap`, with slightly different syntax. Check out the getter types in
`src/core/types.ts` and existing formulas to see how they are used.

## How to write a transformer

To add a new transformer, it must be exported from
`src/data/transformers/index.ts`, though most transformers exist in one of the
nested files that are imported there. Transformers are exported as arrays since
all need to be checked for every state change event. All matching transformers
get transformed, so the order does not matter.

Be sure to check out the [keys docs](./keys.md) for a very important explanation
of how keys are formatted. It describes some utility functions that are
essentially required to create transformers, specifically `dbKeyToKeys`.

There are a couple of helper functions provided to make it easier to create
simple transformers.

### `makeTransformer`

This simply matches the contract and key or keys provided, and saves the value
under a given name. This is essentially a passthrough that lets you pluck out
specific state keys and make them more efficient to query.

For example, to unify the `config` from both v1 and v2 of the DAO core contract,
this transformer merges them into a single `config` transformation.

```ts
const config = makeTransformer(['dao-core'], 'config', ['config_v2', 'config'])
```

### `makeTransformerForMap`

This does the same as `makeTransformer`, but it matches all keys in a Map.

This takes all items in the `sub_daos` state `Map` and saves them under a
transformation with names that are prefixed with `subDao:`:

```ts
const subDaos = makeTransformerForMap(['dao-core'], 'subDao', 'sub_daos')
```

In a formula, this map can be accessed with the following:

```ts
const subDaoMap = await getTransformationMap(contractAddress, 'subDao')
```

This function also has some options:

- `numericKey` will interpret the map keys as numbers instead of strings.
- `getValue` lets you override the default behavior of returning the value of
  the map item.

### Custom transformers

To perform more complex transformations, you can write your own transformer. See
the following example or existing transformers for more information.

## Example

To aggregate all cw20 token balances for a given wallet efficiently, we
transform balance changes to a single value, whose existence indicates that this
wallet has or at one point had a balance in the given contract.

The `balances` Map in a cw20 contract looks like this:

```rust
pub const BALANCES: Map<&Addr, Uint128> = Map::new("balance");
```

The transformer below matches all events that start with the `balance` Map key
prefix, and derives a name of the form `hasBalance:ADDRESS`. The transformer
only updates the boolean if the value has changed, so it is only saved when the
balance becomes zero or becomes nonzero.

The fact that the transformer only saves a value when it changes is a very
important optimization. If the transformer saved an entry on every balance
change, it would be no more efficient than just querying the database for all
balances. However, since it only saves when the balance changes, it is much more
efficient to query for all contracts where the balance is nonzero. The key is
that this transformer serves to reduce a lot of data into a single flag that is
much more efficient to query.

```ts
const hasBalance: Transformer = {
  filter: {
    matches: (event) => event.key.startsWith(dbKeyForKeys('balance', '')),
  },
  name: (event) => {
    // "balance", address
    const [, address] = dbKeyToKeys(event.key, [false, false])
    return `hasBalance:${address}`
  },
  getValue: async ({ value }, getLastValue) => {
    const prevHasBalance = await getLastValue()
    const hasBalance = value !== '0'

    // Only save transformation if the value has changed.
    return prevHasBalance === hasBalance ? undefined : hasBalance
  },
}
```

This transformation is used later in a formula to find all contracts where the
address has a balance, like so:

```ts
const contractsWithBalance = await getTransformationMatches(
  undefined,
  `hasBalance:${walletAddress}`,
  true
)
```

This transformation does not filter by contract address, hence the first
argument being undefined, and finds all transformations where the name is
`hasBalance:WALLET_ADDRESS` and the value is `true`. From there, we can directly
query the balance of each contract in the list, which is efficient.
