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
  declare address: string

  @AllowNull(false)
  @Column
  declare codeId: number

  @AllowNull
  @Column(DataType.BIGINT)
  declare instantiatedAtBlockHeight: string

  @AllowNull
  @Column(DataType.BIGINT)
  declare instantiatedAtBlockTimeUnixMs: string

  @AllowNull
  @Column(DataType.DATE)
  declare instantiatedAtBlockTimestamp: Date

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
    const codeIds = config.wasmCodes?.findWasmCodeIdsByKeys(...keys) ?? []
    return codeIds.includes(this.codeId)
  }
}
