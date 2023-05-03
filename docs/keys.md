# Keys

Understanding how keys are stored is critical to understanding how this indexer
works and using it correctly.

## Key format

The Cosmos SDK's x/wasm module stores state in a KVStore, which is what we are
listening to state changes for. Knowing the exact key is required to read data
from the store, because of the way the key storage works. The actual key in the
KVStore is a concatenation of the keys used in the smart contract, with all keys
**before the final one** being prefixed with two bytes that represent their
length.

For example, if you have a smart contract that uses an `Item` at the key `item`,
it is simply stored as `item` in the KVStore. If the smart contract uses a `Map`
at the key `map`, and that map uses a key `item` to access a value, it is stored
as `\x00\x03map` + `item` in the KVStore, where `\x00\x03` is the two-byte
length of the namespace key `map`. If you use a multi-key `Map` at the key
`map`, and that map uses two keys `item1` and `item2` to access a value, it is
stored as `\x00\x03map` + `\x00\x05item1` + `item2` in the KVStore, where
`\x00\x05` is the two-byte length of the namespace key `item1`. Essentially,
the KVStore represents the full path to a value as a single key. This makes it
impossible to decode, because a byte in the key could be either a length prefix
or part of one of the keys. This prevents us from decoding the keys before
saving them to the database, but it doesn't prevent us accessing the values if
we know the exact key we're looking for.

We need to choose an encoding for the keys to go in the indexer database that
allows prefix searching so we can efficiently load maps. Databases do not have
good string support when you have to store null bytes (which we do since the
two-byte lengths in keys often contain at least one null byte), and we need to
store them as strings to perform prefix queries on them. Thus, they are stored
in the database as comma-separated lists of bytes, where each byte is converted
into its decimal value (e.g. `0,1,2,3,4,5`). Thus, each null byte is represented
as a `0`, and we can perform prefix queries on this string.

## Utilities for working with keys

### `dbKeyForKeys`

This takes a list of string/numeric keys and returns a string that represents
its database-formatted key, which uses the comma-separated list of bytes format
described above. This is used to store keys in the database.

This will likely be used in transformers to define filters on which events to
transform and webhooks to filter which events to fire on.

Examples:

```ts
import { dbKeyForKeys } from '@/core/utils'

// 105,116,101,109
dbKeyForKeys('item')

// 0,3,109,97,112,107,101,121
dbKeyForKeys('map', 'key')

// 0,3,109,97,112,0,5,105,116,101,109,49,105,116,101,109,50
dbKeyForKeys('map', 'item1', 'item2')
```

### `dbKeyToKeys`

This performs the inverse of `dbKeyForKeys`, taking a database-formatted key and
returning a list of string/numeric keys. This is used to read keys from the
database.

This will likely be used in formulas, transformers, and webhooks to extract
details from an event of known format.

Examples:

```ts
import { dbKeyToKeys } from '@/core/utils'

// Get the keys of a `Map` with keys that are tuples of a string and number.
const validatorsMap = await getMap(contractAddress, 'multi-map', {
  keyType: 'raw',
})
const validators = Object.entries(validatorsMap).map(([key, amount]) => {
  // Extract information from the raw (database-formatted) key.
  const [validator, epoch] = dbKeyToKeys(key, [false, true])
  return {
    validator,
    epoch,
    amount,
  }
})

// Transform the v1 and v2 proposals from a map into easily-queryable DB rows,
// with names that contain their proposal ID.
const proposal: Transformer = {
  filter: {
    codeIdsKeys: CODE_IDS_KEYS,
    matches: (event) =>
      // Match keys that start with 'proposals' or 'proposals_v2'. We need to
      // add an empty string to the end so that the map keys are treated as
      // namespaces that should be prefixed with their two-byte length.
      // Remember, the last key is *not* prefixed with its length.
      event.key.startsWith(dbKeyForKeys('proposals', '')) ||
      event.key.startsWith(dbKeyForKeys('proposals_v2', '')),
  },
  name: (event) => {
    // Extract the proposal ID from the key.
    const [, proposalId] = dbKeyToKeys(event.key, [false, true])
    return `proposal:${proposalId}`
  },
  getValue: (event) => event.valueJson,
}
```
