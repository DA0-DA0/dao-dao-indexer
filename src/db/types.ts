import { WhereOptions } from 'sequelize'
import { Model } from 'sequelize-typescript'

import { Block, ComputationDependentKey } from '@/core/types'

// Interface that event models must implement to be depended on by computations.
export abstract class DependendableEventModel extends Model {
  // The namespace for dependent keys from this event. Must be unique across all
  // types of dependable events.
  static dependentKeyNamespace: string
  // The key that stores the block height
  static blockHeightKey: string
  // A function that returns a where clause that will match all events that are
  // described by the dependent keys.
  static getWhereClauseForDependentKeys(
    _dependentKeys: ComputationDependentKey[]
  ): WhereOptions<any> {
    throw new Error('Not implemented')
  }
  // A getter that returns a unique dependent key based on this event's
  // properties.
  abstract get dependentKey(): string
  // A getter that returns the block.
  abstract get block(): Block
}
