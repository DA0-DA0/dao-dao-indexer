# Formulas

A formula is a function that processes the "current" state and returns an
output. It is block-agnostic, meaning it does not request state from any
specific block—it purely defines the relationship between the current state and
an output. The indexer API is responsible for giving the formula access to only
the state at the point in time requested by the user.

This formula abstraction allows the indexer to intelligently cache formula
computations and invalidate those caches when any of the inputs change. This
means that the indexer doesn't have to recompute the formula for every block,
but only when necessary. And if it has already computed it for a particular
block, it can simply return the cached result.

Formulas are defined in the `data/formulas` directory.

## Formula Types

There are four types of formulas:

- `contract`
- `generic`
- `validator`
- `wallet`

`generic` takes no address, whereas the others take an address. They are
differentiated because they are expected to work slightly differently, though
under the hood they are processed the same way. When using `generic` formulas,
any address can be passed in, but it is ignored.

## Formula Structure

A formula is an object that contains some metadata and a function. The function
computes the output of the formula given the current state and is called with
one argument that gives it access to the state.

```ts
type Formula = {
  compute: (env: Env) => Promise<any>
  // If true, the formula is non-deterministic within the same block, so it
  // cannot be cached. This likely means that some expiration is being checked
  // based on the latest time, which affects the output of the formula without
  // any state changing.
  dynamic?: boolean
  // Contract formulas support filtering by code ID key. The config defines
  // code ID keys, which map a unique identifier to a list of code IDs that are
  // related. This is likely different versions of a common smart contract.
  filter?: {
    codeIdsKeys: string[]
  }
}
```

The environment passed to the formula function has the following structure, plus
an additional address property if the formula is not `generic`:

```ts
type Env = {
  block: Block
  // If latest block is being used, this will be the current date. If fetching
  // at a specific block, this will be the date of that block.
  date: Date
  // Arguments may or may not be present.
  args: Record<string, string>

  get: FormulaGetter
  getMap: FormulaMapGetter
  getDateKeyModified: FormulaDateGetter
  getDateKeyFirstSet: FormulaDateGetter
  getDateKeyFirstSetWithValueMatch: FormulaDateWithValueMatchGetter
  getTransformationMatch: FormulaTransformationMatchGetter
  getTransformationMatches: FormulaTransformationMatchesGetter
  getTransformationMap: FormulaTransformationMapGetter
  getDateFirstTransformed: FormulaTransformationDateGetter
  prefetch: FormulaPrefetch
  prefetchTransformations: FormulaPrefetchTransformations
  getContract: FormulaContractGetter
  getCodeIdsForKeys: FormulaCodeIdsForKeysGetter
  contractMatchesCodeIdKeys: FormulaContractMatchesCodeIdKeysGetter
  getCodeIdKeyForContract: FormulaCodeIdKeyForContractGetter
  getSlashEvents: FormulaSlashEventsGetter
  getTxEvents: FormulaTxEventsGetter
}
```

For `contract` formulas, the address is passed in via the environment under the
`contractAddress` key. For `validator` formulas, the address is passed in via
the environment under the `validatorOperatorAddress` key. And for `wallet`
formulas, the address is passed in via the environment under the `walletAddress`
key.

## Examples

This formula returns the config for a
[DAO](https://github.com/DA0-DA0/dao-contracts/tree/main/contracts/dao-core).
You can see it supports both V1 and V2 of the contract, which happen to be
stored under different state keys in the different versions of the contract. The
indexer unifies the API and allows you to query the same formula for both
versions of the contract.

```ts
export const config: ContractFormula<Config | undefined> = {
  compute: async ({ contractAddress, get }) =>
    // V2.
    (await get<Config>(contractAddress, 'config_v2')) ??
    // V1.
    (await get<Config>(contractAddress, 'config')),
}
```

Here's another example where a formula uses the result of another formula by
passing the `env` object through. It filters a DAO's proposal modules by the
ones that are enabled.

```ts
export const activeProposalModules: ContractFormula<
  ProposalModuleWithInfo[] | undefined
> = {
  compute: async (env) => {
    const modules = await proposalModules.compute(env)
    return modules?.filter(
      (module) => module.status === 'enabled' || module.status === 'Enabled'
    )
  },
}
```

And here is a formula that sets `dynamic` to `true` since it depends on the
current time to verify expiration. This cannot be cached. No state key will
change when the expiration is reached, so the indexer cannot invalidate the
cache. Thus the formula should always be computed when requested. This formula
checks if a DAO is paused or not.

```ts
export const paused: ContractFormula<PausedResponse> = {
  // This formula depends on the block height/time to check expiration.
  dynamic: true,
  compute: async (env) => {
    const { contractAddress, get, date } = env

    const expiration = await get<Expiration | undefined>(
      contractAddress,
      'paused'
    )

    // at_time is in nanoseconds, so convert to milliseconds.
    return !expiration || date.getTime() >= Number(expiration.at_time) / 1e6
      ? { Unpaused: {} }
      : { Paused: { expiration } }
  },
}
```

Here's a complicated wallet formula that calls contract formulas and returns the
list of all cw20 tokens that the wallet has a balance of. It uses transformed
state to efficiently perform the query. Read the [transformers
docs](./transformers.md) for more information on how this works.

```ts
export const list: WalletFormula<ContractWithBalance[]> = {
  compute: async (env) => {
    const { walletAddress, getTransformationMatches } = env

    // Potential cw20 contracts where the wallet address has tokens.
    const matchingContracts =
      (await getTransformationMatches(
        undefined,
        `hasBalance:${walletAddress}`,
        true
      )) ?? []

    const contractInfos = await Promise.all(
      matchingContracts.map(({ contractAddress }) =>
        info.compute({
          ...env,
          contractAddress,
        })
      )
    )

    const balances = await Promise.all(
      matchingContracts.map(({ contractAddress }) =>
        balance.compute({
          ...env,
          contractAddress,
          args: {
            address: env.walletAddress,
          },
        })
      )
    )

    const contractsWithBalance = matchingContracts
      // Filter by those with cw20 in the contract name and with a >0 balance.
      .map(({ contractAddress }, index): ContractWithBalance | undefined =>
        contractInfos[index]?.contract?.includes('cw20') &&
        balances[index] !== '0'
          ? {
              contractAddress,
              balance: balances[index],
            }
          : undefined
      )
      .filter(
        (contractWithBalance): contractWithBalance is ContractWithBalance =>
          !!contractWithBalance
      )

    return contractsWithBalance
  },
}
```
