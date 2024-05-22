# Query

Once you set up [formulas](./formulas.md), you can query the indexer! There are
a few different ways to query.

## Structure

To query a `contract` formula named `MY_FORMULA` on contract `MY_CONTRACT`, you
would use the following URL:

`/API_KEY/contract/MY_CONTRACT/MY_FORMULA`

Alternatively, you can put the API key in the `X-API-Key` header and omit it
from the URL:

`/contract/MY_CONTRACT/MY_FORMULA`

If your formula takes arguments, you add them in the query parameter:

`/contract/MY_CONTRACT/MY_FORMULA?arg1=value1&arg2=value2`

This provides the query result for the latest block indexed.

## Historical

If you want to query the same formula at a historical block or time, you can
provide them in query arguments. **The indexer does not store information about
blocks**, so you must provide both the block height and timestamp (in epoch
milliseconds) when querying at a specific block. Alternatively, you can provide
just the timestamp, and the indexer will use the block for the most recent event
indexed that exists at or before that timestamp. This is a bit slower, so it's
recommended to query for a block instead.

The formula for a block is `height:time`.

To query at block 100 with timestamp 1716399369012, you would pass the query
parameter `block=100:1716399369012`, like so:

`/contract/MY_CONTRACT/MY_FORMULA?block=100:1716399369012`

To use just the timestamp, you can pass the query parameter
`time=1716399369012`:

`/contract/MY_CONTRACT/MY_FORMULA?time=1716399369012`

Since data is indexed by block in the database, a query may not actually care
about the timestamp. If your query does not access `date` nor `block.timeUnixMs`
from the compute function's environment object, then the timestamp does not
affect the query in any way. It is usually queries that check for expiration
that require an accurate block timestamp. Thus, you can simply use `1` as the
timestamp if the query doesn't need it:

`/contract/MY_CONTRACT/MY_FORMULA?block=100:1`

### Ranges

You can also query a formula over a range of blocks or times. To do this, you
pass the query parameter `blocks=START..END`, where `START` and `END` are blocks
formatted in the same way as the `block` query parameter above.

A range query efficiently computes a formula for all blocks where an input
(state key) to the query changes. Thus you will retrieve all query results in
the range that have the potential to be different from each other, though there
is no guarantee that they will be different, since a state key may change in
that range that does not affect the results.

Range queries cannot be computed for dynamic formulas since it's unpredictable
when the result may change within the given range. Instead, manually query for
the blocks in the range that you care about.

To query the formula for blocks 100 (timestamp 1716399369012) to 200 (timestamp
1716399719947), you would pass the query parameter
`blocks=100:1716399369012..200:1716399719947`:

`/contract/MY_CONTRACT/MY_FORMULA?blocks=100:1716399369012..200:1716399719947`

This also works with times (`times=1716399369012..1716399719947`):

`/contract/MY_CONTRACT/MY_FORMULA?times=1716399369012..1716399719947`

### Relative times

Historical queries using `time` or `times` can also be specified relative to the
current timestamp using negative values.

To query a formula from 1 hour ago, you would pass the query parameter
`time=-3600000`, since 1 hour in milliseconds is `3600000`:

`/contract/MY_CONTRACT/MY_FORMULA?time=-3600000`

This works the same for `times`. To query a formula between 1 hour ago and 30
minutes ago, you would pass the query parameter `times=-3600000..-1800000`:

`/contract/MY_CONTRACT/MY_FORMULA?times=-3600000..-1800000`

You can even leave out the end time in `times` if you want to end at the latest
indexed block:

`/contract/MY_CONTRACT/MY_FORMULA?times=-3600000`

### Steps

For both `blocks` and `times` range queries, you can specify a step to use
(either `blockStep` or `timeStep`).

Instead of efficiently computing a formula at every block in the range where a
state key changes, this will instead compute the formula at the given interval,
even when nothing has changed. This is less efficient and not recommended, since
the consumer of the API can simply perform an efficient range query and
transform the response into their own interval-based data.

To query every 10 blocks between block 100 and 200, you would pass the query
parameter `blocks=100:1716399369012..200:1716399719947&blockStep=10`:

`/contract/MY_CONTRACT/MY_FORMULA?blocks=100:1716399369012..200:1716399719947&blockStep=10`

This works the same for times. To query every 10 minutes starting 1 hour ago and
ending at the most recent indexed block, pass the query parameter
`times=-3600000..&timeStep=600000`:

`/contract/MY_CONTRACT/MY_FORMULA?times=-3600000&timeStep=600000`
