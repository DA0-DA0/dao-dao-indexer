# Exporter

The exporter is the piece of the indexer that exports data from the blockchain
binary/node to the database. As the exporter is exporting, it also transforms
data, updates the cache, and triggers webhooks based on state changes. More
information on each of these can be found in their respective docs:

- [transformers docs](./transformers.md)
- [cache docs](./cache.md)
- [webhooks docs](./webhooks.md)

## Responsibilities

### Transforming data

The exporter transforms state change events using the configured transformers.
See the [transformers docs](./transformers.md) for more information about
transformations and why they are necessary.

### Firing webhooks

The exporter fires webhooks when it detects a state change event that matches a
configured webhook. See the [webhooks docs](./webhooks.md) for more information
about webhooks and how they work.

### Invalidating the cache

The exporter invalidates the cache when it detects a state change event that
invalidates a computation. See the [cache docs](./cache.md) for more information
about the cache.
