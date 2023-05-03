# wasmd-indexer

A state-based indexer and API builder for the Cosmos SDK, primarily focusing on
x/wasm.

## Architecture

Read the [architecture docs](./docs/architecture.md) to learn how the indexer's
pieces fit together.

## Setup

1. Create `config.json` from example `config.json.example`.

2. Install dependencies.

   ```bash
   npm install
   ```

3. Build the indexer.

   ```bash
   npm run build
   ```

4. Setup the database.

   ```bash
   npm run db:setup
   ```

## Usage

Test the indexer:

```bash
npm run test
```

Build the indexer:

```bash
npm run build
```

Run the exporter:

```bash
npm run export
```

Run the API server:

```bash
npm run serve
```

Spawn a console to interact with the various database models and API formulas:

```bash
npm run console
```

## Why does this exist?

This indexer is designed to be used with blockchains running the Cosmos SDK that
support smart contracts via the x/wasm module. Its critical innovation is that,
rather than indexing the transactions and events that end up in a block and are
made queryable by an RPC node, it indexes the _state changes_ that occur as a
result of those transactions and events.

### Why index state changes instead?

Transaction-based indexers can only read the inputs and outputs of on-chain
events, i.e. wallet messages executed on a contract and the events that contract
responds with. They _cannot_ access the state changes that occur as a result of
those messages, nor access data that the contract developer did not decide to
emit in the execution events log. This is a problem for two reasons:

1. If a contract doesn't emit the data you want to index, you can't index it.
2. If a contract executes another contract, you can't index the sub-execution
   (since they don't show up in logs).

One example of this is indexing the cw20 (token smart contract) balances for a
wallet. The default cw20 implementation does not emit the resulting balance of a
transfer—only the amount transferred. To index the balance of a wallet, you
would have to index every single transfer message in order, from the beginning,
and keep a running total manually. If the indexer crashes, you'll have to make
sure to start from the same block height, and if you miss a block, the number
will be wrong. Moreover, if a _different_ contract executes a transfer on a cw20
contract (as part of a \_sub_message, which is one contract calling another), you
won't be able to index that transfer at all, unless that contract decided to
emit the transfer amount in its events too. Thus, to index the balance of a
cw20, you would have to know every single contract that could possibly execute a
transfer on that cw20 contract and index all of those, assuming all contracts
also log the transfer amount. If any contract doesn't, your cw20 balances will
always be slightly off. On a permissionless blockchain where any smart contract
can be deployed, this essentially makes keeping track of balances impossible.

This also applies to cw721 (NFT smart contract) balances. If an NFT is sent to a
contract which performs a submessage to transfer that NFT somewhere else, the
NFT will be lost to the indexer forever, since you can no longer follow its
path.

## Why does DAO DAO need this?

DAO DAO is an ecosystem of modular smart contracts that work together, and as
such, there is a lot of communication between them in the form of submessages.
For example, when a proposal is executed on a proposal module, it tells the core
contract to execute the messages contained in the proposal. To effectively index
this, we need to be able to access state changes that occur in all of the smart
contracts that get executed by other contracts. Thus this state-indexer was
born.

## Database utilities

### Add read-only user in PostgreSQL

```sql
REVOKE ALL ON DATABASE db FROM readonly_user;
GRANT CONNECT ON DATABASE db TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
```

### Find the code IDs for a given Event key

```sql
SELECT DISTINCT ON("codeId") "codeId", "value" FROM "Events" INNER JOIN "Contracts" ON "Contracts"."address" = "Events"."contractAddress" WHERE "key" = '' ORDER BY "codeId" ASC;
```

Find by contract name (key is `contract_info`)

```sql
SELECT DISTINCT ON("codeId") "codeId", "value" FROM "Events" INNER JOIN "Contracts" ON "Contracts"."address" = "Events"."contractAddress" WHERE "key" = '99,111,110,116,114,97,99,116,95,105,110,102,111' AND value LIKE '%CONTRACT_NAME%' ORDER BY "codeId" ASC;
```

## Attribution

Credit to ekez for the initial idea and design of the state-based x/wasm
indexer, and noah for the subsequent architecting, implementation, and
optimization. Built for [DAO DAO](https://daodao.zone) and the CosmWasm
ecosystem as a whole.
