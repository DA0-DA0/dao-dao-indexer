# Cache

The indexer relies heavily on caching to speed up queries. This document
explains how the cache works. The cache is represented by the
[`Computation`](../src/db/models/Computation.ts) model in the database.

A computation is defined by contract address, formula type, formula name,
formula arguments, and block height. It stores the result of a specific formula
computation on a contract with a set of arguments at a specific block height.

A computation has a set of dependencies, which are the inputs to the formula. If
any of these inputs changes, the computation is invalidated and must be
recomputed. Computations also store the block height at which they begin to be
valid (which is equal to the latest block one of its input dependencies changed
on), as well as the block they have been determined to be valid until (which is
equal to the block just before the next block any of its input dependencies
change on). Thus, a computation defines the range of blocks for which it is
valid.

## Cache invalidation

The cache is invalidated by the [exporter](./exporter.md).

When the exporter exports a new state change event, it does two things:

1. It finds any computations that depend on this change and start being valid at
   or after the block the state change event occurred on. If so, it deletes
   those computations. This is done in case the exporter is re-exporting past
   data that may have changed. This won't be used much in normal operation since
   the indexer picks up where it left off, but it's useful for development and
   debugging.

2. It finds any computations that depend on this change, start being valid at or
   before the exported block, and end being valid after the exported block. This
   should also rarely happen but is needed so the cache does not break if the
   exporter falls behind and catches up. If the node syncs to a block before the
   exporter could export that block to the database, and an API query comes in
   while the exporter is behind, it will cache an incorrect result claiming its
   valid up until the latest block. Once the exporter catches up, it will
   invalidate the cache for that computation and recompute it.

## API revalidation

The [API](./api.md)

When the API receives a request to compute a formula, it first checks the cache
to see if a computation has already been done.

If it has been done and the current block being requested is within the range of
blocks the computation is valid for, the API will return the cached result
immediately.

If the current block is not within the range of blocks the computation is valid
for, the API will attempt to revalidate the cache. It does this by scanning from
the latest block it has been determined to be valid for to the block requested
by the query, checking if any of its dependencies have changed. If none of its
dependencies have changed, it will update the latest block that it is valid for
and return the cached result. Otherwise, it will recompute the formula and cache
it for future queries.

Essentially, the API lazily-revalidates the cache when a query comes in that
falls outside the range of blocks the computation is valid for. This
responsibility could be moved to the exporter—or better yet, a background
task—but for now it is efficient enough to do it on-the-fly.
