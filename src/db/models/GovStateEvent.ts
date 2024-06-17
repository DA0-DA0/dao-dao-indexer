import { Op, WhereOptions } from 'sequelize'
import { AllowNull, Column, DataType, Table } from 'sequelize-typescript'

import { ComputationDependentKey } from '@/formulas/types'
import { Block } from '@/types'
import { getDependentKey } from '@/utils'

import { DependableEventModel, DependentKeyNamespace } from '../types'

@Table({
  timestamps: true,
  indexes: [
    // Only one event can happen to a proposal ID at a given block height. This
    // ensures events are not duplicated if they attempt exporting multiple
    // times.
    {
      unique: true,
      fields: ['blockHeight', 'proposalId'],
    },
    {
      // Speeds up queries finding first newer dependent key to validate a
      // computation.
      fields: ['proposalId'],
    },
    {
      // Speed up ordering queries.
      fields: ['blockHeight'],
    },
    {
      // Speed up ordering queries.
      fields: ['blockTimeUnixMs'],
    },
  ],
})
export class GovStateEvent extends DependableEventModel {
  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare proposalId: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockHeight: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockTimeUnixMs: string

  @AllowNull(false)
  @Column(DataType.DATE)
  declare blockTimestamp: Date

  // Base64-encoded protobuf data.
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare data: string

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(GovStateEvent.dependentKeyNamespace, this.proposalId)
  }

  // Get the previous event for this proposalId. If this is the first event for
  // this proposalId, return null. Cache the result so it can be reused since
  // this shouldn't change.
  previousEvent?: GovStateEvent | null
  async getPreviousEvent(cache = true): Promise<GovStateEvent | null> {
    if (this.previousEvent === undefined || !cache) {
      this.previousEvent = await GovStateEvent.findOne({
        where: {
          proposalId: this.proposalId,
          blockHeight: {
            [Op.lt]: this.blockHeight,
          },
        },
        order: [['blockHeight', 'DESC']],
      })
    }

    return this.previousEvent
  }

  static dependentKeyNamespace = DependentKeyNamespace.GovStateEvent
  static blockHeightKey: string = 'blockHeight'
  static blockTimeUnixMsKey: string = 'blockTimeUnixMs'

  // Returns a where clause that will match all events that are described by the
  // dependent keys.
  static getWhereClauseForDependentKeys(
    dependentKeys: ComputationDependentKey[]
  ): WhereOptions {
    // If any dependent keys are prefixed or contain wildcards, just look for
    // any proposal, since you can't wildcard search a bigint (and it would make
    // no sense to do so). A formula will only ever need a specific proposal or
    // all proposals.
    if (
      dependentKeys.some(({ key, prefix }) => prefix || key.includes('*')) ||
      !dependentKeys.length
    ) {
      return {}
    }

    const exactKeys = dependentKeys
      .filter(({ key, prefix }) => !prefix && !key.includes('*'))
      .map(({ key }) =>
        key.replace(new RegExp(`^${this.dependentKeyNamespace}:`), '')
      )

    return {
      // Related logic in `makeComputationDependencyWhere` in `src/db/utils.ts`.
      proposalId: exactKeys,
    }
  }
}
