import { WhereOptions } from 'sequelize'
import {
  AllowNull,
  Column,
  DataType,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import {
  Block,
  ComputationDependentKey,
  DependableEventModel,
  DependentKeyNamespace,
} from '@/types'
import { getDependentKey } from '@/utils'

@Table({
  timestamps: true,
})
export class BankBalance extends DependableEventModel {
  @PrimaryKey
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare address: string

  @AllowNull(false)
  @Column(DataType.JSONB)
  declare balances: Record<string, string>

  // The block height at which a denom's balance was updated.
  @AllowNull(false)
  @Column(DataType.JSONB)
  declare denomUpdateBlockHeights: Record<string, string>

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockHeight: string

  @AllowNull(false)
  @Column(DataType.BIGINT)
  declare blockTimeUnixMs: string

  @AllowNull(false)
  @Column(DataType.DATE)
  declare blockTimestamp: Date

  get block(): Block {
    return {
      height: BigInt(this.blockHeight),
      timeUnixMs: BigInt(this.blockTimeUnixMs),
    }
  }

  get dependentKey(): string {
    return getDependentKey(BankBalance.dependentKeyNamespace, this.address)
  }

  // Only one event per address.
  async getPreviousEvent(): Promise<BankBalance | null> {
    return null
  }

  static dependentKeyNamespace = DependentKeyNamespace.BankBalance
  static blockHeightKey: string = 'blockHeight'
  static blockTimeUnixMsKey: string = 'blockTimeUnixMs'

  // Returns a where clause that will match all events that are described by the
  // dependent keys.
  static getWhereClauseForDependentKeys(
    dependentKeys: ComputationDependentKey[]
  ): WhereOptions {
    // Some keys (most likely those with wildcards) may not have an address. It
    // is fine to group these together.
    const addresses = new Set<string>()
    for (const dependentKey of dependentKeys) {
      const key = dependentKey.key.replace(
        new RegExp(`^${this.dependentKeyNamespace}:`),
        ''
      )
      addresses.add(key.split(':')[0])
    }

    return {
      address: Array.from(addresses),
    }
  }
}
