import { Op, WhereOptions } from 'sequelize'
import { AllowNull, Column, DataType, Table } from 'sequelize-typescript'

import { Block, getDependentKey } from '@/core'

import { DependableEventModel, DependentKeyNamespace } from '../types'

@Table({
  timestamps: true,
  indexes: [
    // Only one event can happen to the community pool at a given block height.
    // This ensures events are not duplicated if they attempt exporting multiple
    // times.
    {
      unique: true,
      fields: ['blockHeight'],
    },
    {
      // Speed up ordering queries.
      fields: ['blockTimeUnixMs'],
    },
  ],
})
export class DistributionCommunityPoolStateEvent extends DependableEventModel {
  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockHeight: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockTimeUnixMs: string

  @AllowNull(false)
  @Column(DataType.DATE)
  declare blockTimestamp: Date

  // Map denom to balance.
  @AllowNull(false)
  @Column(DataType.JSONB)
  declare balances: Record<string, string>

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(
      DistributionCommunityPoolStateEvent.dependentKeyNamespace
    )
  }

  // Get the previous event. Cache the result so it can be reused since this
  // shouldn't change.
  previousEvent?: DistributionCommunityPoolStateEvent | null
  async getPreviousEvent(
    cache = true
  ): Promise<DistributionCommunityPoolStateEvent | null> {
    if (this.previousEvent === undefined || !cache) {
      this.previousEvent = await DistributionCommunityPoolStateEvent.findOne({
        where: {
          blockHeight: {
            [Op.lt]: this.blockHeight,
          },
        },
        order: [['blockHeight', 'DESC']],
      })
    }

    return this.previousEvent
  }

  static dependentKeyNamespace =
    DependentKeyNamespace.DistributionCommunityPoolStateEvent
  static blockHeightKey: string = 'blockHeight'
  static blockTimeUnixMsKey: string = 'blockTimeUnixMs'

  // Returns a where clause that will match all events that are described by the
  // dependent keys. All events should be matched by dependent keys.
  static getWhereClauseForDependentKeys(): WhereOptions {
    return {}
  }
}
