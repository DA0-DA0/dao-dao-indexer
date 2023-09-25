import { Op, WhereOptions } from 'sequelize'
import { AllowNull, Column, DataType, Table } from 'sequelize-typescript'

import { Block, ComputationDependentKey, getDependentKey } from '@/core'

import { DependendableEventModel, DependentKeyNamespace } from '../types'

@Table({
  timestamps: true,
  indexes: [
    // Only one event can happen to a denom for a given address at a given block
    // height. This ensures events are not duplicated if they attempt exporting
    // multiple times.
    {
      unique: true,
      fields: ['blockHeight', 'address', 'denom'],
    },
    {
      // Speeds up queries finding first newer dependent key to validate a
      // computation.
      fields: ['denom'],
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
export class BankStateEvent extends DependendableEventModel {
  @AllowNull(false)
  @Column(DataType.TEXT)
  address!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockHeight!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  blockTimeUnixMs!: string

  @AllowNull(false)
  @Column(DataType.DATE)
  blockTimestamp!: Date

  @AllowNull(false)
  @Column(DataType.TEXT)
  denom!: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  balance!: string

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(
      BankStateEvent.dependentKeyNamespace,
      this.address,
      this.denom
    )
  }

  // Get the previous event for this denom. If this is the first event for this
  // denom, return null. Cache the result so it can be reused since this
  // shouldn't change.
  previousEvent?: BankStateEvent | null
  async getPreviousEvent(cache = true): Promise<BankStateEvent | null> {
    if (this.previousEvent === undefined || !cache) {
      this.previousEvent = await BankStateEvent.findOne({
        where: {
          address: this.address,
          denom: this.denom,
          blockHeight: {
            [Op.lt]: this.blockHeight,
          },
        },
        order: [['blockHeight', 'DESC']],
      })
    }

    return this.previousEvent
  }

  static dependentKeyNamespace = DependentKeyNamespace.BankStateEvent
  static blockHeightKey: string = 'blockHeight'

  // Returns a where clause that will match all events that are described by the
  // dependent keys.
  static getWhereClauseForDependentKeys(
    dependentKeys: ComputationDependentKey[]
  ): WhereOptions {
    // Some keys (most likely those with wildcards) may not have an address. It
    // is fine to group these together.
    const dependentKeysByAddress = dependentKeys.reduce((acc, dependentKey) => {
      // 1. Remove namespace from key.
      let key = dependentKey.key.replace(
        new RegExp(`^${this.dependentKeyNamespace}:`),
        ''
      )

      // 2. Extract address from key.
      // Dependent keys for any address start with "*:".
      const address = key.startsWith('*:') ? '' : key.split(':')[0]

      key = key
        // 3. Remove address from key.
        .replace(new RegExp(`^${address || '\\*'}:`), '')
        // 4. Replace wildcard symbol with LIKE wildcard for database query.
        .replace(/\*/g, '%')

      return {
        ...acc,
        [address]: [
          ...(acc[address] ?? []),
          {
            key,
            prefix: dependentKey.prefix,
          },
        ],
      }
    }, {} as Record<string, { key: string; prefix: boolean }[]>)

    return {
      [Op.or]: Object.entries(dependentKeysByAddress).map(([address, keys]) => {
        const exactKeys = keys
          .filter(({ key, prefix }) => !prefix && !key.includes('%'))
          .map(({ key }) => key)
        const wildcardKeys = keys
          .filter(({ key, prefix }) => prefix || key.includes('%'))
          .map(({ key, prefix }) => key + (prefix ? '%' : ''))

        return {
          // Only include if address is defined.
          ...(address && { address }),
          // Related logic in `makeComputationDependencyWhere` in
          // `src/db/utils.ts`.
          denom: {
            [Op.or]: [
              // Exact matches.
              ...(exactKeys.length > 0 ? [{ [Op.in]: exactKeys }] : []),
              // Wildcards. May or may not be prefixes.
              ...wildcardKeys.map((key) => ({
                [Op.like]: key,
              })),
            ],
          },
        }
      }),
    }
  }
}
