import { Block } from './misc'

export type ComputationDependentKey = {
  key: string
  // This is used with maps for example, where a computation depends on all keys
  // that start with the map prefix.
  prefix: boolean
}

export type ComputationOutput = {
  // Undefined if formula did not use any keys.
  block: Block | undefined
  value: any
  dependentKeys: ComputationDependentKey[]
  // Used when computing ranges.
  latestBlockHeightValid?: bigint
}
