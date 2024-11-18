# Welcome to the indexer

## Why does this exist?

This indexer is designed to be used with blockchains running the Cosmos SDK, and
primarily those that support smart contracts via the x/wasm module. Its critical
distinction is that it indexes the _state changes_ that occur as a result of
transactions, instead of indexing the transactions and events that end up in a
block and made queryable by an RPC node.

### Why index state changes instead?

Transaction-based indexers can only read the inputs and outputs of on-chain
events, e.g. wallet messages executed on a contract and the events that contract
responds with. They _cannot_ access the state changes that occur as a result of
those messages, nor access data that the contract developer did not decide to
emit in the execution events log.

This is a problem because a contract may not emit the data you need to index,
and thus a transaction-based indexer cannot index it. It also means that you
have to index every contract message in every block just to check if a specific
contract did something you care about, since any contract can call any other
contract. And if you want to track both historical and recent information,
you'll need to maintain and mutate your own state based on with laborious
event-matching code. Indexing new information in a transaction-based indexer may
even require rescanning old blocks.

One example of this is indexing cw20 token contract balances for a wallet. The
default cw20 implementation does not emit the resulting balance of a transfer in
a send transaction—only the amount transferred. So to index the balance of a
wallet, you would have to index every single transfer message in order, from the
beginning, and keep a running total manually. If the indexer crashes, you'll
have to make sure to start from the same block height, and if you miss a block,
the number will be wrong. Moreover, if a _different_ contract executes a
transfer on a cw20 contract (as part of a *sub*message, which is one contract
calling another), you will have to check every event from every message to find
the cw20 contract execution events, and you will only be able to detect it if
you know exactly which contract address to look for. On a permissionless
blockchain where any smart contract can be deployed and call any other contract,
this essentially makes keeping track of historical cw20 balances infeasible.

## Why does DAO DAO need this?

DAO DAO is an ecosystem of modular smart contracts that work together, and as
such, there is a lot of communication between them in the form of submessages.
For example, when a proposal is executed on a proposal module, it tells the core
contract to execute the messages contained in the proposal, and reports the
execution status back to the proposal module. DAOs can also interact with
arbitrary contracts and enact arbitrary authorization flows—if another contract
is responsible for updating voting config or making proposals in the DAO, the
frontend needs to know about it as quickly as possible.

The indexer does all the hard work, making it very easy to index new contracts
and write new queries. You write formulas to create API endpoints that can
access any data from any contract, and it's immediately available at the latest
block and as far back as the indexer was running.

## How does it work?

Get started by reading the [architecture docs](./architecture.md).
