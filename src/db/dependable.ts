import { ComputationDependentKey, DependableEventModel } from '@/types'

import { BankStateEvent } from './models/BankStateEvent'
import { DistributionCommunityPoolStateEvent } from './models/DistributionCommunityPoolStateEvent'
import { GovStateEvent } from './models/GovStateEvent'
import { StakingSlashEvent } from './models/StakingSlashEvent'
import { WasmStateEvent } from './models/WasmStateEvent'
import { WasmStateEventTransformation } from './models/WasmStateEventTransformation'
import { WasmTxEvent } from './models/WasmTxEvent'

// Prevent circular dependencies by importing each model from its own file.
export const getDependableEventModels = (): typeof DependableEventModel[] => [
  WasmStateEvent,
  WasmStateEventTransformation,
  WasmTxEvent,
  StakingSlashEvent,
  BankStateEvent,
  GovStateEvent,
  DistributionCommunityPoolStateEvent,
]

// Get the dependable event model for a given key based on its namespace.
export const getDependableEventModelForKey = (
  key: string
): typeof DependableEventModel | undefined => {
  const namespace = key.split(':')[0]
  return getDependableEventModels().find(
    (model) => model.dependentKeyNamespace === namespace
  )
}

export const dependentKeyMatches = (
  a: ComputationDependentKey,
  b: ComputationDependentKey
) => a.key === b.key && a.prefix === b.prefix
