import {
  AllowNull,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import { loadConfig } from '@/core/config'
import { ContractJson } from '@/core/types'

@Table({
  timestamps: true,
})
export class Contract extends Model {
  @PrimaryKey
  @Column
  address!: string

  @AllowNull(false)
  @Column
  codeId!: number

  @AllowNull
  @Column(DataType.BIGINT)
  instantiatedAtBlockHeight!: string

  @AllowNull
  @Column(DataType.BIGINT)
  instantiatedAtBlockTimeUnixMs!: string

  @AllowNull
  @Column(DataType.DATE)
  instantiatedAtBlockTimestamp!: Date

  get json(): ContractJson {
    return {
      address: this.address,
      codeId: this.codeId,
      instantiatedAt: {
        block: {
          height: BigInt(this.instantiatedAtBlockHeight),
          timeUnixMs: BigInt(this.instantiatedAtBlockTimeUnixMs),
        },
        timestamp: this.instantiatedAtBlockTimestamp,
      },
    }
  }

  /**
   * Return whether or not the contract matches a given set of code IDs keys
   * from the config.
   */
  matchesCodeIdKeys(...keys: string[]): boolean {
    const config = loadConfig()
    const codeIds = keys.flatMap((key) => config.codeIds?.[key] ?? [])
    return codeIds.includes(this.codeId)
  }
}
