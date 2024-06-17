import { Op, Sequelize, WhereOptions } from 'sequelize'
import {
  AllowNull,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from 'sequelize-typescript'

import { ComputationDependentKey } from '@/formulas/types'
import { Block } from '@/types'
import { getDependentKey } from '@/utils'

import { DependableEventModel, DependentKeyNamespace } from '../types'
import { Contract } from './Contract'

@Table({
  timestamps: true,
  indexes: [
    // Transformers are deterministic and names must be unique so they can be
    // found, so only one output can exist for a name on a contract at a given
    // block height.
    {
      unique: true,
      fields: ['contractAddress', 'name', 'blockHeight'],
    },
    {
      // Speeds up queries. Use trigram index for string name to speed up
      // partial matches (LIKE).
      fields: [Sequelize.literal('name gin_trgm_ops')],
      concurrently: true,
      using: 'gin',
    },
    {
      // Speeds up queries.
      fields: ['value'],
      concurrently: true,
      using: 'gin',
    },
    {
      // Speeds up queries.
      fields: ['blockHeight'],
    },
  ],
})
export class WasmStateEventTransformation extends DependableEventModel {
  @AllowNull(false)
  @ForeignKey(() => Contract)
  @Column
  declare contractAddress: string

  @BelongsTo(() => Contract)
  declare contract: Contract

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockHeight: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockTimeUnixMs: string

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare name: string

  @AllowNull
  @Column(DataType.JSONB)
  declare value: unknown | null

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(
      WasmStateEventTransformation.dependentKeyNamespace,
      this.contractAddress,
      this.name
    )
  }

  // Get the previous event for this name. If this is the first event for this
  // name, return null. Cache the result so it can be reused since this
  // shouldn't change.
  previousEvent?: WasmStateEventTransformation | null
  async getPreviousEvent(
    cache = true
  ): Promise<WasmStateEventTransformation | null> {
    if (this.previousEvent === undefined || !cache) {
      this.previousEvent = await WasmStateEventTransformation.findOne({
        where: {
          contractAddress: this.contractAddress,
          name: this.name,
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
    DependentKeyNamespace.WasmStateEventTransformation
  static blockHeightKey: string = 'blockHeight'
  static blockTimeUnixMsKey: string = 'blockTimeUnixMs'

  // Returns a where clause that will match all events that are described by the
  // dependent keys.
  static getWhereClauseForDependentKeys(
    dependentKeys: ComputationDependentKey[]
  ): WhereOptions {
    // Some keys (most likely those with wildcards) may not have a contract
    // address. It is fine to group these together.
    const dependentKeysByContract = dependentKeys.reduce(
      (acc, dependentKey) => {
        // 1. Remove namespace from key.
        let key = dependentKey.key.replace(
          new RegExp(`^${this.dependentKeyNamespace}:`),
          ''
        )

        // 2. Extract contract address from key. Dependent keys for any contract
        //    start with "*:".
        const contractAddress = key.startsWith('*:') ? '' : key.split(':')[0]

        key = key
          // 3. Remove contract address from key.
          .replace(new RegExp(`^${contractAddress || '\\*'}:`), '')
          // 4. Replace wildcard symbol with LIKE wildcard for database query.
          .replace(/\*/g, '%')

        return {
          ...acc,
          [contractAddress]: [
            ...(acc[contractAddress] ?? []),
            {
              key,
              prefix: dependentKey.prefix,
            },
          ],
        }
      },
      {} as Record<string, { key: string; prefix: boolean }[]>
    )

    return {
      [Op.or]: Object.entries(dependentKeysByContract).map(
        ([contractAddress, keys]) => {
          const exactKeys = keys
            .filter(({ key, prefix }) => !prefix && !key.includes('%'))
            .map(({ key }) => key)
          const wildcardKeys = keys
            .filter(({ key, prefix }) => prefix || key.includes('%'))
            .map(({ key, prefix }) => key + (prefix ? '%' : ''))

          return {
            // Only include if contract address is defined.
            ...(contractAddress && { contractAddress }),
            // Related logic in `makeComputationDependencyWhere` in
            // `src/db/utils.ts`.
            name: {
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
        }
      ),
    }
  }
}
